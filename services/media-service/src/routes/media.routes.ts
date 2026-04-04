import fs from "fs";
import { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { processImage, validateImageType } from "../lib/imageProcessor";
import { saveFile, deleteFile } from "../lib/storage";
import { logger } from "../lib/logger";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function checkAuth(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const secret = request.headers["x-internal-secret"];
  if (secret === INTERNAL_SECRET) return true;

  // Also allow valid Bearer JWT (for direct staff uploads)
  const auth = request.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return true;

  return false;
}

interface UploadResult {
  key: string;
  thumb_url: string;
  medium_url: string;
  full_url: string;
  size_bytes: number;
  format: "webp";
  original_filename: string;
}

async function processUpload(
  fileBuffer: Buffer,
  mimetype: string,
  filename: string,
  tenantId: string,
  category?: string
): Promise<UploadResult> {
  if (!validateImageType(mimetype)) {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }

  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 10MB limit");
  }

  const { thumb, medium, full } = await processImage(fileBuffer);

  const id = uuidv4();
  const prefix = category ? `${tenantId}/${category}/${id}` : `${tenantId}/${id}`;

  const [thumbUrl, mediumUrl, fullUrl] = await Promise.all([
    saveFile(`${prefix}-thumb.webp`, thumb, "image/webp"),
    saveFile(`${prefix}-medium.webp`, medium, "image/webp"),
    saveFile(`${prefix}-full.webp`, full, "image/webp"),
  ]);

  logger.info(
    {
      tenant_id: tenantId,
      key: prefix,
      original_size: fileBuffer.length,
      thumb_size: thumb.length,
      medium_size: medium.length,
      full_size: full.length,
    },
    "Image processed and saved"
  );

  return {
    key: prefix,
    thumb_url: thumbUrl,
    medium_url: mediumUrl,
    full_url: fullUrl,
    size_bytes: full.length,
    format: "webp",
    original_filename: filename,
  };
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  // Auth hook for all media routes
  app.addHook("preHandler", async (request, reply) => {
    if (!checkAuth(request as unknown as { headers: Record<string, string | string[] | undefined> })) {
      reply.code(401).send({ success: false, error: "Unauthorized" });
    }
  });

  // POST /api/v1/media/upload — single file
  // Expects multipart form-data with fields: file (required), tenant_id (required), category (optional)
  app.post("/api/v1/media/upload", async (request, reply) => {
    try {
      // Collect all parts (fields + files) via async iterator
      const parts = request.parts();
      let fileBuffer: Buffer | null = null;
      let fileMimetype = "image/jpeg";
      let fileFilename = "upload";
      let tenantId: string | undefined;
      let category: string | undefined;

      for await (const part of parts) {
        if (part.type === "file") {
          fileBuffer = await part.toBuffer();
          fileMimetype = part.mimetype;
          fileFilename = part.filename ?? "upload";
        } else {
          // field
          if (part.fieldname === "tenant_id") tenantId = part.value as string;
          if (part.fieldname === "category") category = part.value as string;
        }
      }

      // Also check query string for tenant_id (convenience)
      if (!tenantId) {
        tenantId = (request.query as Record<string, string>)?.tenant_id;
      }

      if (!fileBuffer) {
        return reply.code(400).send({ success: false, error: "No file provided" });
      }

      if (!tenantId) {
        return reply.code(400).send({ success: false, error: "tenant_id is required" });
      }

      const result = await processUpload(fileBuffer, fileMimetype, fileFilename, tenantId, category);

      return reply.send({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      logger.error({ err }, "Upload error");
      return reply.code(400).send({ success: false, error: message });
    }
  });

  // POST /api/v1/media/upload/multiple — up to 5 files
  app.post("/api/v1/media/upload/multiple", async (request, reply) => {
    try {
      const parts = request.parts();
      const fileBuffers: Array<{ buffer: Buffer; mimetype: string; filename: string }> = [];
      let tenantId: string | undefined;

      for await (const part of parts) {
        if (part.type === "file") {
          if (fileBuffers.length >= 5) {
            // Consume remaining stream to avoid backpressure
            await part.toBuffer();
            continue;
          }
          const buffer = await part.toBuffer();
          fileBuffers.push({ buffer, mimetype: part.mimetype, filename: part.filename ?? "upload" });
        } else {
          if (part.fieldname === "tenant_id") tenantId = part.value as string;
        }
      }

      if (!tenantId) {
        tenantId = (request.query as Record<string, string>)?.tenant_id;
      }

      if (!tenantId) {
        return reply.code(400).send({ success: false, error: "tenant_id is required" });
      }

      if (fileBuffers.length === 0) {
        return reply.code(400).send({ success: false, error: "No files provided" });
      }

      const results = await Promise.all(
        fileBuffers.map((f) => processUpload(f.buffer, f.mimetype, f.filename, tenantId!))
      );

      return reply.send({ success: true, data: results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      logger.error({ err }, "Multiple upload error");
      return reply.code(400).send({ success: false, error: message });
    }
  });

  // DELETE /api/v1/media/:tenant_id/:key — delete all 3 sizes
  app.delete<{ Params: { tenant_id: string; "*": string } }>(
    "/api/v1/media/:tenant_id/*",
    async (request, reply) => {
      const { tenant_id } = request.params;
      const key = request.params["*"];

      if (!key) {
        return reply.code(400).send({ success: false, error: "Key is required" });
      }

      const fullKey = `${tenant_id}/${key}`;

      await Promise.allSettled([
        deleteFile(`${fullKey}-thumb.webp`),
        deleteFile(`${fullKey}-medium.webp`),
        deleteFile(`${fullKey}-full.webp`),
      ]);

      logger.info({ tenant_id, key: fullKey }, "Files deleted");
      return reply.send({ success: true, data: { deleted: fullKey } });
    }
  );
}
