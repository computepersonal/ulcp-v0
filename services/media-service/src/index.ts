import "dotenv/config";
import path from "path";
import fs from "fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";

import { logger } from "./lib/logger";
import { redis } from "./lib/redis";
import { isDevMode, getUploadsDir } from "./lib/storage";
import { mediaRoutes } from "./routes/media.routes";

const PORT = parseInt(process.env.PORT ?? "3010", 10);
const APP_NAME = process.env.APP_NAME ?? "LocalCommerce";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const app = Fastify({
  logger: false,
  trustProxy: true,
});

async function bootstrap(): Promise<void> {
  // Ensure uploads directory exists in dev mode
  if (isDevMode()) {
    const uploadsDir = getUploadsDir();
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info({ uploadsDir }, "[DEV] Local uploads directory ready");
  }

  await app.register(cors, { origin: true, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });

  // Serve local uploads in dev mode
  if (isDevMode()) {
    await app.register(fastifyStatic, {
      root: path.join(process.cwd(), "uploads"),
      prefix: "/uploads/",
    });
  }

  // Multipart — for file uploads
  // Note: NOT using attachFieldsToBody so req.file() / req.files() work normally
  await app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 5, // max files per request
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: `${APP_NAME} — Media Service`,
        version: "1.0.0",
        description: "Image upload, processing (WebP 3 sizes), Cloudflare R2 storage",
      },
      servers: [{ url: `http://localhost:${PORT}` }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { deepLinking: true },
  });

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    service: "media-service",
    port: PORT,
    storage: isDevMode() ? "local" : "cloudflare-r2",
    timestamp: new Date().toISOString(),
  }));

  // GET /api/v1/media/link-preview?url=:url
  app.get<{ Querystring: { url: string } }>("/api/v1/media/link-preview", {
    schema: {
      summary: "Fetch Open Graph preview for a URL",
      tags: ["Media"],
      security: [],
      querystring: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
    },
  }, async (req, reply) => {
    const { url } = req.query;
    if (!url) return reply.code(400).send({ success: false, error: "url required" });

    // SSRF protection — block private IPs
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) {
        return reply.code(400).send({ success: false, error: "Invalid URL" });
      }
    } catch {
      return reply.code(400).send({ success: false, error: "Invalid URL" });
    }

    // Check Redis cache
    const cacheKey = `link_preview:${Buffer.from(url).toString("base64").slice(0, 50)}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return reply.send({ success: true, data: JSON.parse(cached) as unknown });
    }

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ULCP-Bot/1.0)" },
        signal: AbortSignal.timeout(5000),
      });
      const html = await res.text();

      // Extract OG tags
      const getOg = (prop: string): string => {
        const match =
          html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i")) ??
          html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"));
        return match?.[1] ?? "";
      };
      const getTitle = (): string => {
        const og = getOg("title");
        if (og) return og;
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match?.[1]?.trim() ?? "";
      };
      const getDesc = (): string => {
        const og = getOg("description");
        if (og) return og;
        const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        return match?.[1] ?? "";
      };

      const preview = {
        title: getTitle().slice(0, 100),
        description: getDesc().slice(0, 200),
        image_url: getOg("image"),
        url,
      };

      await redis.set(cacheKey, JSON.stringify(preview), "EX", 3600);
      return reply.send({ success: true, data: preview });
    } catch {
      return reply.code(200).send({ success: true, data: { title: url, description: "", image_url: "", url } });
    }
  });

  // Media routes
  await app.register(mediaRoutes);

  // Global error handler
  app.setErrorHandler((err: Error & { statusCode?: number }, _request, reply) => {
    logger.error({ err }, "Unhandled error");
    reply.code(err.statusCode ?? 500).send({
      success: false,
      error: err.message ?? "Internal server error",
    });
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });

  logger.info(
    {
      port: PORT,
      storage: isDevMode() ? "local (dev)" : "cloudflare-r2",
      docs: `http://localhost:${PORT}/docs`,
    },
    "Media service started"
  );
}

async function shutdown(): Promise<void> {
  logger.info("Shutting down media service...");
  await redis.quit();
  await app.close();
  logger.info("Media service stopped");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start media service");
  process.exit(1);
});
