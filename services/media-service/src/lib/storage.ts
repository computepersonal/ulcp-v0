import fs from "fs";
import path from "path";
import { logger } from "./logger";

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY ?? "";
const R2_SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY ?? "";
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? "";
const PORT = process.env.PORT ?? "3010";

export function isDevMode(): boolean {
  return !R2_BUCKET || process.env.DEV_MODE === "true";
}

export function getUploadsDir(): string {
  return path.join(process.cwd(), "uploads");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function getLocalUrl(key: string): string {
  return `http://localhost:${PORT}/uploads/${key}`;
}

/**
 * Save a file to local disk (dev) or Cloudflare R2 (prod)
 * @param key - storage key, e.g. "shop_001/abc123-thumb.webp"
 * @param buffer - file content
 * @param contentType - MIME type
 * @returns public URL of the saved file
 */
export async function saveFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  if (isDevMode()) {
    // Local dev storage
    const filePath = path.join(getUploadsDir(), key);
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, buffer);
    const url = getLocalUrl(key);
    logger.debug({ key, size: buffer.length, contentType }, "[DEV] File saved locally");
    return url;
  }

  // Production: Cloudflare R2 via AWS SDK (S3-compatible)
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
    region: "auto",
  });

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    })
  );

  // Return CDN URL (configure your Cloudflare R2 custom domain here)
  const cdnDomain = process.env.CDN_DOMAIN ?? `https://${R2_BUCKET}.r2.dev`;
  logger.debug({ key, size: buffer.length }, "File saved to R2");
  return `${cdnDomain}/${key}`;
}

/**
 * Delete all size variants of a file
 */
export async function deleteFile(key: string): Promise<void> {
  if (isDevMode()) {
    const filePath = path.join(getUploadsDir(), key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug({ key }, "[DEV] File deleted");
    }
    return;
  }

  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
    region: "auto",
  });

  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    })
  );

  logger.debug({ key }, "File deleted from R2");
}
