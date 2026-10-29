import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyCookie from "@fastify/cookie";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import cron from "node-cron";
import { appConfig, AppError, createRequestLogHooks, installFetchCorrelation } from "@ulcp/shared";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { sectionRoutes } from "./routes/section.routes";
import { itemRoutes } from "./routes/item.routes";
import { optionRoutes } from "./routes/option.routes";
import { addonRoutes } from "./routes/addon.routes";
import { comboRoutes } from "./routes/combo.routes";
import { ingredientRoutes } from "./routes/ingredient.routes";
import { internalRoutes } from "./routes/internal.routes";
import { PORT } from "./constants";
import {
  resetTemporaryDisabledItems,
  clearDailySpecials,
  clearTodayPriceOverrides,
} from "./repositories/item.repository";
import { fetchDefaultBranchId } from "./lib/tenantClient";
import { getPublicCatalogue } from "./services/item.service";
import { apiSuccess, apiError } from "@ulcp/shared";

// ─── Full-text search migration ───────────────────────────────────────────────
// Adds a generated tsvector column + GIN index on catalogue_items if not present.
// Idempotent — safe to run on every boot.
async function runSearchMigration(): Promise<void> {
  try {
    await prisma.$executeRaw`
      ALTER TABLE catalogue.catalogue_items
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english',
          coalesce(name, '') || ' ' || coalesce(description, '')
        )
      ) STORED
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS catalogue_items_search_idx
      ON catalogue.catalogue_items USING gin(search_vector)
    `;
    logger.info("Full-text search migration applied");
  } catch (err) {
    // Column may already exist — log and continue
    logger.warn({ err }, "Search migration skipped (already applied or error)");
  }
}

// ─── Midnight cron ────────────────────────────────────────────────────────────
function scheduleMidnightCron(): void {
  cron.schedule("0 0 * * *", async () => {
    logger.info("Running midnight catalogue reset");
    try {
      const [reEnabled, specialsCleared, overridesCleared] = await Promise.all([
        resetTemporaryDisabledItems(),
        clearDailySpecials(),
        clearTodayPriceOverrides(),
      ]);
      logger.info(
        {
          reEnabled: reEnabled.count,
          specialsCleared: specialsCleared.count,
          overridesCleared: overridesCleared.count,
        },
        "Midnight catalogue reset complete"
      );
    } catch (err) {
      logger.error(err, "Midnight catalogue reset failed");
    }
  });
  logger.info("Midnight cron scheduled (0 0 * * *)");
}

// ─── App builder ──────────────────────────────────────────────────────────────
async function buildApp() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  // ─── Plugins ───────────────────────────────────────────────────────────────
  installFetchCorrelation();
  const requestLogHooks = createRequestLogHooks(logger);
  app.addHook("onRequest", requestLogHooks.onRequest);
  app.addHook("onResponse", requestLogHooks.onResponse);

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

  // ─── Swagger / OpenAPI ─────────────────────────────────────────────────────
  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Catalogue Service",
        description:
          "Catalogue management — sections, items, variants, search, public QR menu",
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
    // Prisma P2025 = related record not found (e.g. invalid section_id)
    const prismaErr = err as { code?: string; meta?: { cause?: string } };
    if (prismaErr.code === "P2025") {
      const cause = prismaErr.meta?.cause ?? "Related record not found";
      return reply.code(400).send({ success: false, error: cause });
    }
    // Prisma P2002 = unique constraint violation (e.g. duplicate slug)
    if (prismaErr.code === "P2002") {
      return reply.code(409).send({ success: false, error: "A record with this value already exists" });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) {
      return reply.code(status).send({ success: false, error: err.message });
    }
    logger.error(err, "Unhandled error");
    return reply.code(500).send({ success: false, error: "Internal server error" });
  });

  // ─── Routes ────────────────────────────────────────────────────────────────
  // Sections
  await app.register(sectionRoutes, { prefix: "/api/v1/catalogue/:tenant_id/sections" });

  // Staff item routes
  await app.register(
    async (instance) => { await instance.register(itemRoutes); },
    { prefix: "/api/v1/catalogue/:tenant_id/items" }
  );

  // Public routes — branch_id in path (matches QR code URL structure)
  // GET /api/v1/catalogue/:tenant_id/:branch_id/public
  // GET /api/v1/catalogue/:tenant_id/:branch_id/public/search
  await app.register(
    async (instance) => { await instance.register(itemRoutes); },
    { prefix: "/api/v1/catalogue/:tenant_id/:branch_id" }
  );

  // Branchless public route — auto-resolves primary branch
  // GET /api/v1/catalogue/:tenant_id/public
  // Used by: staff POS, customer PWA when no branch_id is known (single-branch tenants)
  app.get<{ Params: { tenant_id: string } }>(
    "/api/v1/catalogue/:tenant_id/public",
    { schema: { summary: "Get catalogue for primary branch (auto-resolved)", tags: ["Catalogue Public"], security: [] } },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const authHeader = req.headers.authorization ?? "";
      const branchId = await fetchDefaultBranchId(tenant_id, authHeader.replace("Bearer ", ""));
      if (!branchId) {
        return reply.code(404).send(apiError("No branch found for this tenant"));
      }
      try {
        const catalogue = await getPublicCatalogue(tenant_id, branchId);
        return reply.send(apiSuccess({ ...catalogue as object, branch_id: branchId }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // Item Options — nested under items
  await app.register(
    async (instance) => { await instance.register(optionRoutes); },
    { prefix: "/api/v1/catalogue/:tenant_id/items/:item_id/options" }
  );

  // Item Ingredients — nested under items
  await app.register(
    async (instance) => { await instance.register(ingredientRoutes); },
    { prefix: "/api/v1/catalogue/:tenant_id/items/:item_id/ingredients" }
  );

  // Addon Groups — tenant-level
  await app.register(
    async (instance) => { await instance.register(addonRoutes); },
    { prefix: "/api/v1/catalogue/:tenant_id/addons" }
  );

  // Combos
  await app.register(
    async (instance) => { await instance.register(comboRoutes); },
    { prefix: "/api/v1/catalogue/:tenant_id/combos" }
  );

  // Internal endpoints (service-to-service, secret-auth)
  await app.register(
    async (instance) => { await instance.register(internalRoutes); },
    { prefix: "/api/v1/catalogue/internal" }
  );

  // Health check
  app.get("/health", async () => ({
    success: true,
    data: {
      service: "catalogue-service",
      status: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  }));

  return app;
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(app: Awaited<ReturnType<typeof buildApp>>) {
  logger.info("Shutting down...");
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

// ─── Start ────────────────────────────────────────────────────────────────────
void buildApp()
  .then(async (app) => {
    // Apply full-text search migration before accepting traffic
    await runSearchMigration();
    scheduleMidnightCron();

    void app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
      logger.info({ port: PORT, env: appConfig.nodeEnv }, "catalogue-service started");
      process.on("SIGTERM", () => void shutdown(app));
      process.on("SIGINT", () => void shutdown(app));
    });
  })
  .catch((err) => {
    logger.error(err, "Failed to start");
    process.exit(1);
  });
