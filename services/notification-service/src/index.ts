import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { logger } from "./lib/logger";
import { connectRedis, redis } from "./lib/redis";
import { startNotificationWorker, stopWorker, notificationQueue } from "./lib/queue";
import { processJob } from "./workers/notification.worker";
import { subscribeToEvents, closeSubscriber } from "./subscribers/events.subscriber";
import { notifyRoutes } from "./routes/notify.routes";

const PORT = parseInt(process.env.PORT ?? "3007", 10);
const APP_NAME = process.env.APP_NAME ?? "LocalCommerce";

const app = Fastify({
  logger: false, // Using Pino directly
  trustProxy: true,
});

async function bootstrap(): Promise<void> {
  // Wait for Redis to be ready
  await connectRedis();

  // Register plugins
  await app.register(cors, { origin: true, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: `${APP_NAME} — Notification Service`,
        version: "1.0.0",
        description: "Handles all notification channels: email, SMS, push, WhatsApp",
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
    service: "notification-service",
    port: PORT,
    timestamp: new Date().toISOString(),
  }));

  // Routes
  await app.register(notifyRoutes);

  // Global error handler
  app.setErrorHandler((err: Error & { statusCode?: number }, _request, reply) => {
    logger.error({ err }, "Unhandled error");
    reply.code(err.statusCode ?? 500).send({
      success: false,
      error: err.message ?? "Internal server error",
    });
  });

  // Start BullMQ worker
  startNotificationWorker(processJob);

  // Subscribe to Redis events
  await subscribeToEvents();

  // Start server
  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info({ port: PORT, docs: `http://localhost:${PORT}/docs` }, "Notification service started");
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info("Shutting down notification service...");
  await stopWorker();
  await closeSubscriber();
  await notificationQueue.close();
  await redis.quit();
  await app.close();
  logger.info("Notification service stopped");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start notification service");
  process.exit(1);
});
