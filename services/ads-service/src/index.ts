import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { connectRedis } from "./lib/redis";
import serveRoutes from "./routes/serve.routes";
import exploreRoutes from "./routes/explore.routes";
import inHouseRoutes from "./routes/inhouse.routes";
import advertiserRoutes from "./routes/advertiser.routes";
import mallRoutes from "./routes/mall.routes";
import analyticsRoutes from "./routes/analytics.routes";

const PORT = parseInt(process.env.PORT ?? "3015", 10);

const app = Fastify({ logger: false });

async function start() {
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      info: { title: "Ads Service", version: "1.0.0" },
      tags: [
        { name: "Ad Delivery", description: "Serve ads to customers" },
        { name: "Explore", description: "Explore tab ad feed" },
        { name: "In-House Ads", description: "Restaurant self-promotion" },
        { name: "Advertisers", description: "Advertiser management" },
        { name: "Campaigns", description: "Campaign management" },
        { name: "Creatives", description: "Ad creative management" },
        { name: "Malls", description: "Mall management" },
        { name: "Analytics", description: "Ad performance analytics" },
        { name: "Admin", description: "Superadmin endpoints" },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", { schema: { tags: ["Health"] } }, async (_req, reply) => {
    return reply.send({
      success: true,
      data: { service: "ads-service", status: "ok", port: PORT },
    });
  });

  await app.register(serveRoutes, { prefix: "/api/v1/ads" });
  await app.register(exploreRoutes, { prefix: "/api/v1/ads" });
  await app.register(inHouseRoutes, { prefix: "/api/v1/ads" });
  await app.register(advertiserRoutes, { prefix: "/api/v1/ads" });
  await app.register(mallRoutes, { prefix: "/api/v1/ads" });
  await app.register(analyticsRoutes, { prefix: "/api/v1/ads" });

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
    logger.info(`ads-service running on port ${PORT}`);
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
