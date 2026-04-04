import { FastifyInstance } from "fastify";
import type { Server as SocketServer } from "socket.io";
import { z } from "zod";
import { logger } from "../lib/logger";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

const BroadcastSchema = z.object({
  room: z.string().min(1),
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

interface IoContainer {
  io: SocketServer | null;
}

export async function realtimeRoutes(
  app: FastifyInstance,
  options: { io: IoContainer }
): Promise<void> {
  const { io: ioContainer } = options;

  // GET /api/v1/realtime/stats
  app.get("/api/v1/realtime/stats", async (_request, reply) => {
    const io = ioContainer.io;
    if (!io) {
      return reply.send({ success: true, data: { total_connections: 0, uptime: process.uptime(), rooms: [] } });
    }

    const rooms: Array<{ room: string; size: number }> = [];
    for (const [room, sockets] of io.sockets.adapter.rooms) {
      if (!io.sockets.sockets.has(room)) {
        rooms.push({ room, size: sockets.size });
      }
    }

    return reply.send({
      success: true,
      data: {
        total_connections: io.engine.clientsCount,
        uptime: process.uptime(),
        rooms,
      },
    });
  });

  // POST /api/v1/realtime/broadcast — internal only
  app.post("/api/v1/realtime/broadcast", async (request, reply) => {
    const secret = request.headers["x-internal-secret"];
    if (secret !== INTERNAL_SECRET) {
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    }

    const io = ioContainer.io;
    if (!io) {
      return reply.code(503).send({ success: false, error: "Socket.io not ready" });
    }

    const parsed = BroadcastSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }

    const { room, event, data } = parsed.data;
    const roomSize = io.sockets.adapter.rooms.get(room)?.size ?? 0;

    io.to(room).emit(event, data);

    logger.info({ room, event, room_size: roomSize }, "Manual broadcast sent");

    return reply.send({
      success: true,
      data: { room, event, delivered_to: roomSize },
    });
  });
}
