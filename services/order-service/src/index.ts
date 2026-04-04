import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import cron from "node-cron";
import { appConfig, AppError } from "@ulcp/shared";
import { logger } from "./lib/logger";
import { prisma, connectPrisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { orderRoutes } from "./routes/order.routes";
import { kotRoutes } from "./routes/kot.routes";
import { startKotAutoAckWorker, stopWorker } from "./lib/queue";
import { acknowledgeKot } from "./services/order.service";

const PORT = parseInt(process.env["PORT"] ?? "3004", 10);

// ─── App builder ──────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false, trustProxy: true });

  // ─── Plugins ───────────────────────────────────────────────────────────────
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
      error: "Too many requests, please try again later",
    }),
  });

  // ─── Swagger / OpenAPI ─────────────────────────────────────────────────────
  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Order Service",
        description:
          "Order management — orders, KOTs, billing, payments, commission",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
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

  // ─── Global Error Handler ──────────────────────────────────────────────────
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ success: false, error: err.message });
    }
    const prismaErr = err as { code?: string; meta?: { cause?: string } };
    if (prismaErr.code === "P2025") {
      const cause = prismaErr.meta?.cause ?? "Related record not found";
      return reply.code(400).send({ success: false, error: cause });
    }
    if (prismaErr.code === "P2002") {
      return reply
        .code(409)
        .send({ success: false, error: "A record with this value already exists" });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) {
      return reply.code(status).send({ success: false, error: err.message });
    }
    logger.error(err, "Unhandled error");
    return reply.code(500).send({ success: false, error: "Internal server error" });
  });

  // ─── Routes ────────────────────────────────────────────────────────────────
  await app.register(orderRoutes, { prefix: "/api/v1/orders" });
  await app.register(kotRoutes, { prefix: "/api/v1/kots" });

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get("/health", async () => ({
    success: true,
    data: {
      service: "order-service",
      status: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  }));

  return app;
}

// ─── Cron ─────────────────────────────────────────────────────────────────────
// DailyCounter rows auto-reset by date key — no explicit DB action needed.
// This cron is a hook point for future per-branch midnight tasks.
function scheduleMidnightCron(): void {
  cron.schedule("0 0 * * *", () => {
    logger.info(
      "Midnight cron: daily counters will auto-reset via date key on next order"
    );
  });
  logger.info("Midnight cron scheduled (0 0 * * *)");
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(app: Awaited<ReturnType<typeof buildApp>>) {
  logger.info("Shutting down order-service...");
  await stopWorker();
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

// ─── Start ────────────────────────────────────────────────────────────────────
void buildApp()
  .then(async (app) => {
    await connectPrisma();
    scheduleMidnightCron();

    // Start BullMQ worker for KOT auto-acknowledgment (mode = "auto")
    startKotAutoAckWorker(async (job) => {
      const { kot_id, tenant_id } = job.data;
      logger.info({ kot_id, tenant_id }, "KOT auto-ack job fired");
      await acknowledgeKot(kot_id, tenant_id);
    });

    void app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
      logger.info({ port: PORT, env: appConfig.nodeEnv }, "order-service started");
      process.on("SIGTERM", () => void shutdown(app));
      process.on("SIGINT", () => void shutdown(app));
    });
  })
  .catch((err) => {
    logger.error(err, "Failed to start order-service");
    process.exit(1);
  });
