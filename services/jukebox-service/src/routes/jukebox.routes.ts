import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { verifyPlayerToken } from "../lib/jwt";
import * as svc from "../services/jukebox.service";
import * as repo from "../repositories/jukebox.repository";

function decodeCustomerToken(
  authHeader?: string
): { customerId?: string } {
  if (!authHeader?.startsWith("Bearer ")) return {};
  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64").toString()
    ) as { customerId?: string };
    return { customerId: payload.customerId };
  } catch {
    return {};
  }
}

function requirePlayerToken(headers: {
  "x-player-token"?: string | string[] | undefined;
}): void {
  const token = headers["x-player-token"];
  if (!token || typeof token !== "string") {
    throw Object.assign(new Error("Player token required"), {
      statusCode: 401,
    });
  }
  try {
    verifyPlayerToken(token);
  } catch {
    throw Object.assign(new Error("Invalid player token"), {
      statusCode: 401,
    });
  }
}

export const jukeboxRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Config ──

  fastify.get<{ Params: { tenant_id: string } }>(
    "/api/v1/jukebox/:tenant_id/config",
    async (request, reply) => {
      const config = await repo.getConfig(request.params.tenant_id);
      return reply.send({ success: true, data: config });
    }
  );

  fastify.patch<{ Params: { tenant_id: string }; Body: unknown }>(
    "/api/v1/jukebox/:tenant_id/config",
    async (request, reply) => {
      const { tenant_id } = request.params;
      const schema = z.object({
        branch_id: z.string().optional(),
        is_enabled: z.boolean().optional(),
        price_per_song: z.number().int().min(0).optional(),
        max_queue_length: z.number().int().min(1).max(100).optional(),
        max_songs_per_user: z.number().int().min(1).max(10).optional(),
        allow_dedications: z.boolean().optional(),
        content_filter: z.enum(["family", "adult", "off"]).optional(),
      });
      const data = schema.parse(request.body);
      const existing = await repo.getConfig(tenant_id);
      const branch_id = data.branch_id ?? existing?.branch_id ?? "";
      const config = await repo.upsertConfig(tenant_id, branch_id, data);
      return reply.send({ success: true, data: config });
    }
  );

  fastify.post<{ Params: { tenant_id: string }; Body: unknown }>(
    "/api/v1/jukebox/:tenant_id/config/player-setup-code",
    async (request, reply) => {
      const { tenant_id } = request.params;
      const schema = z.object({ branch_id: z.string() });
      const { branch_id } = schema.parse(request.body);
      const result = await svc.generateSetupCode(tenant_id, branch_id);
      return reply.code(201).send({ success: true, data: result });
    }
  );

  // ── Queue ──

  fastify.get<{ Params: { tenant_id: string; branch_id: string } }>(
    "/api/v1/jukebox/:tenant_id/:branch_id/queue",
    async (request, reply) => {
      const { tenant_id, branch_id } = request.params;
      const data = await svc.getQueueWithStatus(tenant_id, branch_id);
      return reply.send({ success: true, data });
    }
  );

  fastify.get<{ Params: { tenant_id: string; branch_id: string } }>(
    "/api/v1/jukebox/:tenant_id/:branch_id/queue/status",
    async (request, reply) => {
      const { tenant_id, branch_id } = request.params;
      const config = await repo.getConfig(tenant_id);
      const data = await svc.getQueueWithStatus(tenant_id, branch_id);
      const playerLastSeen = config?.player_last_seen;
      return reply.send({
        success: true,
        data: {
          is_enabled: config?.is_enabled ?? false,
          price_per_song: config?.price_per_song ?? 2000,
          now_playing: data.now_playing,
          queue_length: data.queue_length,
          estimated_wait_mins: data.estimated_wait_mins,
          player_connected: playerLastSeen
            ? Date.now() - new Date(playerLastSeen).getTime() < 60000
            : false,
        },
      });
    }
  );

  fastify.post<{
    Params: { tenant_id: string; branch_id: string };
    Body: unknown;
  }>(
    "/api/v1/jukebox/:tenant_id/:branch_id/queue/add",
    async (request, reply) => {
      const { tenant_id, branch_id } = request.params;
      const schema = z.object({
        song_id: z.string(),
        song_title: z.string(),
        song_artist: z.string(),
        song_duration_secs: z.number().int().min(1),
        song_thumbnail: z.string().url(),
        source: z.literal("youtube"),
        dedicated_to_alias: z.string().optional(),
        dedication_message: z.string().max(100).optional(),
        alias: z.string().optional(),
      });
      const body = schema.parse(request.body);
      const { customerId } = decodeCustomerToken(
        request.headers.authorization
      );
      const alias = body.alias ?? "Anonymous";

      const result = await svc.addSong({
        tenant_id,
        branch_id,
        customer_id: customerId,
        alias,
        song: {
          song_id: body.song_id,
          song_title: body.song_title,
          song_artist: body.song_artist,
          song_duration_secs: body.song_duration_secs,
          song_thumbnail: body.song_thumbnail,
          source: body.source,
        },
        dedicated_to_alias: body.dedicated_to_alias,
        dedication_message: body.dedication_message,
      });

      return reply.code(201).send({ success: true, data: result });
    }
  );

  fastify.delete<{
    Params: { tenant_id: string; branch_id: string; id: string };
  }>(
    "/api/v1/jukebox/:tenant_id/:branch_id/queue/:id",
    async (request, reply) => {
      const { tenant_id, id } = request.params;
      const { customerId } = decodeCustomerToken(
        request.headers.authorization
      );
      const result = await svc.cancelSong(id, tenant_id, customerId);
      return reply.send({ success: true, data: result });
    }
  );

  // ── Search ──

  fastify.get<{
    Params: { tenant_id: string };
    Querystring: { q?: string };
  }>("/api/v1/jukebox/:tenant_id/search", async (request, reply) => {
    const { q } = request.query;
    if (!q || q.trim().length < 2) {
      return reply.send({ success: true, data: [] });
    }
    const results = await svc.searchSongs(q.trim());
    return reply.send({ success: true, data: results });
  });

  // ── Player ──

  fastify.post<{ Body: unknown }>(
    "/api/v1/jukebox/player/pair",
    async (request, reply) => {
      const schema = z.object({ code: z.string().length(6) });
      const { code } = schema.parse(request.body);
      const result = await svc.pairPlayer(code);
      return reply.send({ success: true, data: result });
    }
  );

  fastify.get<{ Params: { tenant_id: string; branch_id: string } }>(
    "/api/v1/jukebox/player/:tenant_id/:branch_id/next",
    async (request, reply) => {
      requirePlayerToken(request.headers as { "x-player-token"?: string });
      const { tenant_id, branch_id } = request.params;
      const next = await svc.getNextSong(tenant_id, branch_id);
      return reply.send({ success: true, data: next });
    }
  );

  fastify.post<{
    Params: { tenant_id: string; branch_id: string };
    Body: unknown;
  }>(
    "/api/v1/jukebox/player/:tenant_id/:branch_id/finished",
    async (request, reply) => {
      requirePlayerToken(request.headers as { "x-player-token"?: string });
      const { tenant_id, branch_id } = request.params;
      const schema = z.object({
        queue_item_id: z.string(),
        completed: z.boolean(),
      });
      const { queue_item_id, completed } = schema.parse(request.body);
      const next = await svc.finishSong(
        tenant_id,
        branch_id,
        queue_item_id,
        completed
      );
      return reply.send({ success: true, data: { next_song: next } });
    }
  );

  fastify.post<{ Params: { tenant_id: string; branch_id: string } }>(
    "/api/v1/jukebox/player/:tenant_id/:branch_id/heartbeat",
    async (request, reply) => {
      requirePlayerToken(request.headers as { "x-player-token"?: string });
      const { tenant_id, branch_id } = request.params;
      await svc.updateHeartbeat(tenant_id, branch_id);
      return reply.send({ success: true, data: { ok: true } });
    }
  );

  // ── History ──

  fastify.get<{ Params: { tenant_id: string; branch_id: string } }>(
    "/api/v1/jukebox/:tenant_id/:branch_id/history",
    async (request, reply) => {
      const { tenant_id, branch_id } = request.params;
      const history = await repo.getHistory(tenant_id, branch_id);
      return reply.send({ success: true, data: history });
    }
  );
};
