import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { logger } from "./lib/logger";
import { jukeboxRoutes } from "./routes/jukebox.routes";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";

const PORT = parseInt(process.env["PORT"] ?? "3014", 10);
const CORS_ORIGINS = (
  process.env["CORS_ORIGINS"] ??
  "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177"
)
  .split(",")
  .map((o) => o.trim());

const app = Fastify({ logger: false, trustProxy: true });

async function bootstrap() {
  await app.register(cors, {
    origin: CORS_ORIGINS,
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.setErrorHandler(
    (
      err: Error & { statusCode?: number; validation?: unknown[] },
      _req,
      reply
    ) => {
      logger.error({ err }, "Request error");
      if (err.validation) {
        return reply.code(400).send({ success: false, error: err.message });
      }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: err.message ?? "Internal server error",
      });
    }
  );

  app.get("/health", async () => ({
    status: "ok",
    service: "jukebox-service",
    port: PORT,
    timestamp: new Date().toISOString(),
  }));

  await app.register(jukeboxRoutes);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info({ port: PORT }, "Jukebox service started");
}

async function shutdown() {
  logger.info("Shutting down jukebox service...");
  await prisma.$disconnect();
  await redis.quit();
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start jukebox service");
  process.exit(1);
});
