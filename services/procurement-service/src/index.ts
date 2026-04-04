import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { appConfig, AppError } from "@ulcp/shared";
import { logger } from "./lib/logger";
import { prisma, connectPrisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import {
  startBidAutoCloseWorker,
  startBidRecurrenceWorker,
  stopWorkers,
} from "./lib/queue";
import { autoCloseBidRequest } from "./services/bid.service";
import { vendorRoutes } from "./routes/vendor.routes";
import { bidRoutes } from "./routes/bid.routes";
import { marketRoutes } from "./routes/market.routes";
import { directOrderRoutes } from "./routes/directOrder.routes";

const PORT = parseInt(process.env["PORT"] ?? "3013", 10);

async function buildApp() {
  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(fastifyHelmet, { contentSecurityPolicy: false });

  await app.register(fastifyCors, {
    origin: appConfig.isProduction
      ? [process.env["ALLOWED_ORIGIN"] ?? "https://yourdomain.com"]
      : true,
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      success: false,
      error: "Too many requests",
    }),
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Procurement Service",
        description: "Vendor management, bid requests, direct purchase orders",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true, persistAuthorization: true },
    staticCSP: true,
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ success: false, error: err.message });
    }
    const prismaErr = err as { code?: string; meta?: { cause?: string } };
    if (prismaErr.code === "P2025") {
      return reply.code(400).send({ success: false, error: prismaErr.meta?.cause ?? "Related record not found" });
    }
    if (prismaErr.code === "P2002") {
      return reply.code(409).send({ success: false, error: "A record with this value already exists" });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return reply.code(status).send({ success: false, error: err.message });
    logger.error(err, "Unhandled error");
    return reply.code(500).send({ success: false, error: "Internal server error" });
  });

  await app.register(vendorRoutes, { prefix: "/api/v1/procurement" });
  await app.register(bidRoutes, { prefix: "/api/v1/procurement" });
  await app.register(marketRoutes, { prefix: "/api/v1/procurement" });
  await app.register(directOrderRoutes, { prefix: "/api/v1/procurement" });

  app.get("/health", async () => ({
    success: true,
    data: {
      service: "procurement-service",
      status: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  }));

  return app;
}

async function shutdown(app: Awaited<ReturnType<typeof buildApp>>) {
  logger.info("Shutting down procurement-service...");
  await stopWorkers();
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

void buildApp()
  .then(async (app) => {
    await connectPrisma();

    // BullMQ: auto-close worker
    startBidAutoCloseWorker(async (job) => {
      await autoCloseBidRequest(job.data.bid_request_id, job.data.tenant_id);
    });

    // BullMQ: recurrence worker (clone + re-open bid requests)
    startBidRecurrenceWorker(async (job) => {
      logger.info({ bid_request_id: job.data.bid_request_id }, "Recurrence job — cloning bid request (placeholder)");
      // TODO: clone bid request + invite same vendors
    });

    void app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
      logger.info({ port: PORT, env: appConfig.nodeEnv }, "procurement-service started");
      process.on("SIGTERM", () => void shutdown(app));
      process.on("SIGINT", () => void shutdown(app));
    });
  })
  .catch((err) => {
    logger.error(err, "Failed to start procurement-service");
    process.exit(1);
  });
