import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { connectRedis } from "./lib/redis";
import ingredientRoutes from "./routes/ingredient.routes";
import purchaseOrderRoutes from "./routes/purchaseOrder.routes";
import internalRoutes from "./routes/internal.routes";

const PORT = parseInt(process.env.PORT ?? "3005", 10);

const app = Fastify({ logger: false });

async function start() {
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      info: { title: "Inventory Service", version: "1.0.0" },
      tags: [
        { name: "Ingredients", description: "Ingredient management" },
        { name: "Stock", description: "Stock movements" },
        { name: "Purchase Orders", description: "Purchase orders" },
        { name: "Internal", description: "Internal service endpoints" },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", { schema: { tags: ["Health"] } }, async (_req, reply) => {
    return reply.send({ success: true, data: { service: "inventory-service", status: "ok" } });
  });

  await app.register(ingredientRoutes, { prefix: "/api/v1/inventory" });
  await app.register(purchaseOrderRoutes, { prefix: "/api/v1/inventory" });
  await app.register(internalRoutes, { prefix: "/api/v1/inventory" });

  app.setErrorHandler((error, _req, reply) => {
    logger.error({ err: error }, "unhandled error");
    return reply.status(error.statusCode ?? 500).send({
      success: false,
      error: error.message ?? "Internal Server Error",
    });
  });

  try {
    await prisma.$connect();
    logger.info("PostgreSQL connected");
    await connectRedis();
    await app.listen({ port: PORT, host: "0.0.0.0" });
    logger.info(`inventory-service running on port ${PORT}`);
  } catch (err) {
    logger.error({ err }, "startup failed");
    process.exit(1);
  }
}

const shutdown = async () => {
  logger.info("shutting down...");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();
