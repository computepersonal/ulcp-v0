import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { verifyPlayerToken } from "../lib/jwt";
import { logger } from "../lib/logger";
import * as svc from "../services/jukebox.service";
import * as repo from "../repositories/jukebox.repository";
import * as songRepo from "../repositories/song.repository";
import { extractSongMetadata } from "../lib/oembed";

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

/** Best-effort extraction of the staff user ID from a JWT Authorization header. */
function extractStaffId(authHeader?: string): string | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64").toString()
    ) as { user_id?: string; sub?: string };
    return payload.user_id ?? payload.sub;
  } catch {
    return undefined;
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
        source: z.enum(["youtube", "spotify"]),
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
    const { tenant_id } = request.params;
    const { q } = request.query;
    if (!q || q.trim().length < 2) {
      return reply.send({ success: true, data: [] });
    }
    const results = await svc.searchSongs(tenant_id, q.trim());
    return reply.send({ success: true, data: results });
  });

  // ── Song Catalog (owner/staff) ──

  // GET /api/v1/jukebox/:tenant_id/songs/count — must be registered before :id param routes
  fastify.get<{ Params: { tenant_id: string } }>(
    "/api/v1/jukebox/:tenant_id/songs/count",
    async (request, reply) => {
      const { tenant_id } = request.params;
      const count = await songRepo.countSongs(tenant_id);
      return reply.send({ success: true, data: { count } });
    }
  );

  // POST /api/v1/jukebox/:tenant_id/songs — add single song by URL
  fastify.post<{ Params: { tenant_id: string }; Body: unknown }>(
    "/api/v1/jukebox/:tenant_id/songs",
    async (request, reply) => {
      const { tenant_id } = request.params;
      const schema = z.object({
        url: z.string().url("Must be a valid URL"),
        genre: z.string().max(50).optional(),
        language: z.string().max(50).optional(),
      });
      const { url, genre, language } = schema.parse(request.body);

      // Extract staff user from Authorization header if present (best-effort)
      const added_by = extractStaffId(request.headers.authorization);

      const metadata = await extractSongMetadata(url);
      const song = await songRepo.addSong({
        tenant_id,
        genre,
        language,
        added_by,
        ...metadata,
      });

      logger.info(
        { tenant_id, source: song.source, source_id: song.source_id },
        "Song added to catalog"
      );
      return reply.code(201).send({ success: true, data: song });
    }
  );

  // POST /api/v1/jukebox/:tenant_id/songs/bulk — add multiple songs by URL array
  fastify.post<{ Params: { tenant_id: string }; Body: unknown }>(
    "/api/v1/jukebox/:tenant_id/songs/bulk",
    async (request, reply) => {
      const { tenant_id } = request.params;
      const schema = z.object({
        urls: z.array(z.string().url()).min(1).max(50),
        genre: z.string().max(50).optional(),
        language: z.string().max(50).optional(),
      });
      const { urls, genre, language } = schema.parse(request.body);

      const added_by = extractStaffId(request.headers.authorization);

      const results: Array<{ url: string; error: string }> = [];
      const resolved: Array<
        Awaited<ReturnType<typeof extractSongMetadata>> & {
          genre?: string;
          language?: string;
          added_by?: string;
        }
      > = [];

      await Promise.allSettled(
        urls.map(async (url) => {
          try {
            const metadata = await extractSongMetadata(url);
            resolved.push({ ...metadata, genre, language, added_by });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            results.push({ url, error: message });
            logger.warn({ url, err }, "Bulk song add — URL failed");
          }
        })
      );

      let addedCount = 0;
      if (resolved.length > 0) {
        const result = await songRepo.bulkAddSongs(tenant_id, resolved);
        addedCount = result.count;
      }

      logger.info(
        { tenant_id, added: addedCount, failed: results.length },
        "Bulk songs added to catalog"
      );

      return reply.code(201).send({
        success: true,
        data: { added: addedCount, failed: results },
      });
    }
  );

  // GET /api/v1/jukebox/:tenant_id/songs — list songs (paginated + filterable)
  fastify.get<{
    Params: { tenant_id: string };
    Querystring: {
      search?: string;
      genre?: string;
      language?: string;
      is_active?: string;
      limit?: string;
      offset?: string;
    };
  }>("/api/v1/jukebox/:tenant_id/songs", async (request, reply) => {
    const { tenant_id } = request.params;
    const { search, genre, language, is_active, limit, offset } =
      request.query;

    const songs = await songRepo.listSongs(tenant_id, {
      search,
      genre,
      language,
      is_active:
        is_active === "true" ? true : is_active === "false" ? false : undefined,
      limit: limit ? Math.min(Number(limit), 200) : 50,
      offset: offset ? Number(offset) : 0,
    });

    return reply.send({ success: true, data: songs });
  });

  // PATCH /api/v1/jukebox/:tenant_id/songs/:id — edit song metadata
  fastify.patch<{
    Params: { tenant_id: string; id: string };
    Body: unknown;
  }>("/api/v1/jukebox/:tenant_id/songs/:id", async (request, reply) => {
    const { tenant_id, id } = request.params;
    const schema = z.object({
      title: z.string().min(1).max(200).optional(),
      artist: z.string().min(1).max(200).optional(),
      genre: z.string().max(50).nullable().optional(),
      language: z.string().max(50).nullable().optional(),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().min(0).optional(),
      duration_secs: z.number().int().min(1).optional(),
    });
    const data = schema.parse(request.body);

    const existing = await songRepo.getSong(tenant_id, id);
    if (!existing) {
      return reply
        .code(404)
        .send({ success: false, error: "Song not found" });
    }

    await songRepo.updateSong(tenant_id, id, data);
    const updated = await songRepo.getSong(tenant_id, id);
    return reply.send({ success: true, data: updated });
  });

  // DELETE /api/v1/jukebox/:tenant_id/songs/:id — remove song from catalog
  fastify.delete<{ Params: { tenant_id: string; id: string } }>(
    "/api/v1/jukebox/:tenant_id/songs/:id",
    async (request, reply) => {
      const { tenant_id, id } = request.params;
      const existing = await songRepo.getSong(tenant_id, id);
      if (!existing) {
        return reply
          .code(404)
          .send({ success: false, error: "Song not found" });
      }
      await songRepo.deleteSong(tenant_id, id);
      logger.info({ tenant_id, id }, "Song deleted from catalog");
      return reply.send({ success: true, data: { deleted: true } });
    }
  );

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
