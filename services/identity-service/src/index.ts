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
import { authRoutes } from "./routes/auth.routes";
import { customerInternalRoutes } from "./routes/customer.routes";
import { customerProfileRoutes } from "./routes/customerProfile.routes";

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

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
        title: "Identity Service",
        description: "Authentication, JWT, OTP, RBAC and KDS device tokens",
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
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(customerInternalRoutes, { prefix: "/api/v1/auth/customers" });
  await app.register(customerProfileRoutes, { prefix: "/api/v1/auth/customer" });

  // Health check
  app.get("/health", async () => ({
    success: true,
    data: {
      service: "identity-service",
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

void buildApp().then((app) => {
  void app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
    logger.info(
      { port: PORT, env: appConfig.nodeEnv },
      "identity-service started"
    );
    process.on("SIGTERM", () => void shutdown(app));
    process.on("SIGINT", () => void shutdown(app));
  });
}).catch((err) => {
  logger.error(err, "Failed to start");
  process.exit(1);
});
