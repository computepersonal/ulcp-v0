import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import http from "http";

import { logger } from "./lib/logger";
import { redis } from "./lib/redis";
import { createSocketServer } from "./lib/socketio";
import { subscribeToEvents, closeSubscriber } from "./subscribers/events.subscriber";
import { realtimeRoutes } from "./routes/realtime.routes";
import { setupSocialNamespace } from "./social";

const PORT = parseInt(process.env.PORT ?? "3008", 10);
const APP_NAME = process.env.APP_NAME ?? "LocalCommerce";
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

const app = Fastify({
  logger: false,
  trustProxy: true,
});

async function bootstrap(): Promise<void> {
  await app.register(cors, {
    origin: CORS_ORIGINS,
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: `${APP_NAME} — Realtime Service`,
        version: "1.0.0",
        description: "Socket.io hub — Redis Pub/Sub → WebSocket broadcasts",
      },
      servers: [{ url: `http://localhost:${PORT}` }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { deepLinking: true },
  });

  // Global error handler
  app.setErrorHandler((err: Error & { statusCode?: number }, _request, reply) => {
    logger.error({ err }, "Unhandled error");
    reply.code(err.statusCode ?? 500).send({
      success: false,
      error: err.message ?? "Internal server error",
    });
  });

  // We need io to be available when registering routes, but Socket.io needs
  // app.server (which is available immediately in Fastify). We create a
  // placeholder and pass it by reference via a container object.
  const ioContainer: { io: ReturnType<typeof createSocketServer> | null } = { io: null };

  // Register HTTP routes (pass container so io resolves at request time)
  app.get("/health", async () => ({
    status: "ok",
    service: "realtime-service",
    port: PORT,
    connections: ioContainer.io?.engine?.clientsCount ?? 0,
    timestamp: new Date().toISOString(),
  }));

  // GET /api/v1/social/:tenant_id/:branch_id/active
  // Returns live presence data for a social room from Redis
  app.get<{ Params: { tenant_id: string; branch_id: string } }>(
    "/api/v1/social/:tenant_id/:branch_id/active",
    async (request, reply) => {
      const { tenant_id, branch_id } = request.params;
      const roomKey = `social:room:${tenant_id}:${branch_id}`;

      const raw = await redis.hgetall(roomKey);
      const entries = Object.entries(raw ?? {});

      interface SocialEntry {
        alias: string;
        emoji: string;
        joined_at: number;
        mode: string;
      }

      const publicUsers: Array<{ alias: string; emoji: string; joined_at: number }> = [];

      for (const [, v] of entries) {
        try {
          const u = JSON.parse(v) as SocialEntry;
          if (u.mode === "public") {
            publicUsers.push({ alias: u.alias, emoji: u.emoji, joined_at: u.joined_at });
          }
        } catch {
          // skip malformed entries
        }
      }

      publicUsers.sort((a, b) => a.joined_at - b.joined_at);

      return reply.send({
        success: true,
        data: {
          count: publicUsers.length,
          public_users: publicUsers,
        },
      });
    }
  );

  await app.register(realtimeRoutes, { io: ioContainer });

  // Start listening — this triggers app.ready() internally
  await app.listen({ port: PORT, host: "0.0.0.0" });

  // AFTER listen(), app.server is fully initialised — attach Socket.io
  const httpServer = app.server as http.Server;
  const io = createSocketServer(httpServer, CORS_ORIGINS);
  ioContainer.io = io;

  // Set up /social Socket.io namespace
  setupSocialNamespace(io, redis);

  // Subscribe to Redis pub/sub events and broadcast via Socket.io
  await subscribeToEvents(io);

  logger.info(
    {
      port: PORT,
      cors_origins: CORS_ORIGINS,
      docs: `http://localhost:${PORT}/docs`,
    },
    "Realtime service started"
  );
}

async function shutdown(): Promise<void> {
  logger.info("Shutting down realtime service...");
  await closeSubscriber();
  await redis.quit();
  await app.close();
  logger.info("Realtime service stopped");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start realtime service");
  process.exit(1);
});
