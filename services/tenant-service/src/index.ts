import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyCookie from "@fastify/cookie";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { appConfig, AppError } from "@ulcp/shared";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { tenantRoutes } from "./routes/tenant.routes";
import { branchRoutes } from "./routes/branch.routes";
import { staffRoutes } from "./routes/staff.routes";
import { partnerRoutes } from "./routes/partner.routes";
import { onboardingRoutes } from "./routes/onboarding.routes";
import { tableRoutes } from "./routes/table.routes";
import { sectionRoutes } from "./routes/section.routes";
import { sessionRoutes } from "./routes/session.routes";
import { reservationRoutes } from "./routes/reservation.routes";
import { kdsRoutes } from "./routes/kds.routes";
import { auditLogRoutes } from "./routes/auditLog.routes";
import { subscriptionRoutes } from "./routes/subscription.routes";

const PORT = parseInt(process.env["PORT"] ?? "3002", 10);

async function buildApp() {
  const app = Fastify({
    logger: false, // using our own pino instance
    trustProxy: true,
  });

  // ─── Plugins ─────────────────────────────────────────────────────────────
  await app.register(fastifyHelmet);

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

  await app.register(fastifyCookie);

  // ─── Swagger / OpenAPI ────────────────────────────────────────────────────
  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Tenant Service",
        description:
          "Tenant management, branches, staff, partners, subscriptions and onboarding wizard",
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
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
  });

  // ─── Global Error Handler ─────────────────────────────────────────────────
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ success: false, error: err.message });
    }
    // Fastify sets statusCode on JSON parse errors and other 4xx framework errors
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) {
      return reply.code(status).send({ success: false, error: err.message });
    }
    logger.error(err, "Unhandled error");
    return reply.code(500).send({ success: false, error: "Internal server error" });
  });

  // ─── Routes ───────────────────────────────────────────────────────────────
  await app.register(tenantRoutes, { prefix: "/api/v1/tenants" });

  await app.register(
    async (instance) => {
      await instance.register(branchRoutes);
    },
    { prefix: "/api/v1/tenants/:tenant_id/branches" }
  );

  await app.register(
    async (instance) => {
      await instance.register(staffRoutes);
    },
    { prefix: "/api/v1/tenants/:tenant_id/staff" }
  );

  await app.register(
    async (instance) => {
      await instance.register(partnerRoutes);
    },
    { prefix: "/api/v1/tenants/:tenant_id/partners" }
  );

  await app.register(
    async (instance) => {
      await instance.register(sectionRoutes);
    },
    { prefix: "/api/v1/tenants/:tenant_id/branches/:branch_id/sections" }
  );

  await app.register(
    async (instance) => {
      await instance.register(tableRoutes);
    },
    { prefix: "/api/v1/tenants/:tenant_id/branches/:branch_id/tables" }
  );

  await app.register(
    async (instance) => { await instance.register(sessionRoutes); },
    { prefix: "/api/v1/tenants/:tenant_id/branches/:branch_id/sessions" }
  );

  await app.register(
    async (instance) => { await instance.register(reservationRoutes); },
    { prefix: "/api/v1/tenants/:tenant_id/branches/:branch_id/reservations" }
  );

  await app.register(onboardingRoutes, { prefix: "/api/v1/onboarding" });
  await app.register(auditLogRoutes, { prefix: "/api/v1/tenants" });
  await app.register(subscriptionRoutes, { prefix: "/api/v1/tenants" });

  // KDS: public verify endpoint + staff generate endpoint
  await app.register(kdsRoutes, { prefix: "/api/v1/tenants/kds" });
  await app.register(kdsRoutes, { prefix: "/api/v1/tenants" });

  // Health check
  app.get("/health", async () => ({
    success: true,
    data: {
      service: "tenant-service",
      status: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  }));

  return app;
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function shutdown(app: Awaited<ReturnType<typeof buildApp>>) {
  logger.info("Shutting down...");
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

void buildApp()
  .then((app) => {
    void app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
      logger.info(
        { port: PORT, env: appConfig.nodeEnv },
        "tenant-service started"
      );
      process.on("SIGTERM", () => void shutdown(app));
      process.on("SIGINT", () => void shutdown(app));
    });
  })
  .catch((err) => {
    logger.error(err, "Failed to start");
    process.exit(1);
  });
