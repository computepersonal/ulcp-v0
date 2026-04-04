import { redis } from "../lib/redis";
import { signPlayerToken } from "../lib/jwt";
import { logger } from "../lib/logger";
import * as repo from "../repositories/jukebox.repository";
import { searchYouTube, type YouTubeSong } from "../lib/youtube";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";
const ORDER_SERVICE_URL =
  process.env["ORDER_SERVICE_URL"] ?? "http://localhost:3004";

export async function generateSetupCode(
  tenant_id: string,
  branch_id: string
): Promise<{ code: string; expires_in: number }> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await redis.set(
    `jukebox:setup:${code}`,
    JSON.stringify({ tenant_id, branch_id }),
    "EX",
    600
  );
  await repo.upsertConfig(tenant_id, branch_id, { player_setup_code: code });
  return { code, expires_in: 600 };
}

export async function pairPlayer(code: string): Promise<{
  player_token: string;
  tenant_id: string;
  branch_id: string;
  config: unknown;
}> {
  const raw = await redis.get(`jukebox:setup:${code}`);
  if (!raw) throw Object.assign(new Error("Invalid or expired setup code"), { statusCode: 400 });

  const { tenant_id, branch_id } = JSON.parse(raw) as {
    tenant_id: string;
    branch_id: string;
  };
  const player_token = signPlayerToken(tenant_id, branch_id);

  await repo.upsertConfig(tenant_id, branch_id, {
    player_token,
    player_setup_code: null,
    player_last_seen: new Date(),
  });

  await redis.del(`jukebox:setup:${code}`);

  const config = await repo.getConfig(tenant_id);
  return { player_token, tenant_id, branch_id, config };
}

export async function getQueueWithStatus(
  tenant_id: string,
  branch_id: string
): Promise<{
  now_playing: Awaited<ReturnType<typeof repo.getNowPlaying>>;
  up_next: Array<Awaited<ReturnType<typeof repo.getQueue>>[number] & { estimated_wait_mins: number }>;
  queue_length: number;
  estimated_wait_mins: number;
}> {
  const queue = await repo.getQueue(tenant_id, branch_id);
  const nowPlaying =
    queue.find((q) => q.status === "playing") ?? null;
  const upNext = queue.filter((q) => q.status === "queued");

  let cumulativeSecs = 0;
  const upNextWithWait = upNext.map((item) => {
    const estimated_wait_mins = Math.ceil(cumulativeSecs / 60);
    cumulativeSecs += item.song_duration_secs;
    return { ...item, estimated_wait_mins };
  });

  return {
    now_playing: nowPlaying,
    up_next: upNextWithWait,
    queue_length: upNext.length,
    estimated_wait_mins: Math.ceil(cumulativeSecs / 60),
  };
}

export async function addSong(params: {
  tenant_id: string;
  branch_id: string;
  customer_id?: string;
  alias: string;
  song: YouTubeSong;
  dedicated_to_alias?: string;
  dedication_message?: string;
}) {
  const config = await repo.getConfig(params.tenant_id);
  if (!config)
    throw Object.assign(new Error("Jukebox not configured for this venue"), { statusCode: 400 });
  if (!config.is_enabled)
    throw Object.assign(new Error("Jukebox is not enabled"), { statusCode: 400 });

  const queue = await repo.getQueue(params.tenant_id, params.branch_id);
  const activeQueue = queue.filter((q) => q.status === "queued");
  if (activeQueue.length >= config.max_queue_length) {
    throw Object.assign(new Error("Queue is full. Try again later!"), { statusCode: 400 });
  }

  if (params.customer_id) {
    const userCount = await repo.countUserSongs(
      params.tenant_id,
      params.branch_id,
      params.customer_id
    );
    if (userCount >= config.max_songs_per_user) {
      throw Object.assign(
        new Error(`You already have ${config.max_songs_per_user} songs queued`),
        { statusCode: 400 }
      );
    }
  }

  const position = await repo.getNextPosition(
    params.tenant_id,
    params.branch_id
  );

  let order_id: string | undefined;
  if (params.customer_id && INTERNAL_SECRET) {
    try {
      const res = await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/internal/add-line-item`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": INTERNAL_SECRET,
          },
          body: JSON.stringify({
            tenant_id: params.tenant_id,
            branch_id: params.branch_id,
            customer_id: params.customer_id,
            item: {
              name: `🎵 Jukebox - ${params.song.song_title}`,
              price: config.price_per_song,
              type: "jukebox",
            },
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          data?: { order_id?: string };
        };
        order_id = data.data?.order_id;
      }
    } catch (err) {
      logger.warn({ err }, "Failed to add jukebox billing line item — continuing");
    }
  }

  const item = await repo.addToQueue({
    tenant_id: params.tenant_id,
    branch_id: params.branch_id,
    position,
    song_id: params.song.song_id,
    song_title: params.song.song_title,
    song_artist: params.song.song_artist,
    song_duration_secs: params.song.song_duration_secs,
    song_thumbnail: params.song.song_thumbnail,
    source: params.song.source,
    requested_by_alias: params.alias,
    requested_by_customer_id: params.customer_id,
    dedicated_to_alias: params.dedicated_to_alias,
    dedication_message: params.dedication_message,
    order_id,
    amount_charged: config.price_per_song,
  });

  await publishQueueUpdate(params.tenant_id, params.branch_id);

  const queueBefore = activeQueue.filter((q) => q.position < position);
  const waitSecs = queueBefore.reduce(
    (acc, q) => acc + q.song_duration_secs,
    0
  );

  return {
    queue_item_id: item.id,
    position,
    estimated_wait_mins: Math.ceil(waitSecs / 60),
    amount_charged: config.price_per_song,
  };
}

export async function cancelSong(
  id: string,
  tenant_id: string,
  customer_id?: string
) {
  const item = await repo.getQueueItem(id, tenant_id);
  if (!item)
    throw Object.assign(new Error("Song not found"), { statusCode: 404 });
  if (item.status !== "queued")
    throw Object.assign(
      new Error("Cannot cancel — song is already playing or played"),
      { statusCode: 400 }
    );
  if (customer_id && item.requested_by_customer_id !== customer_id)
    throw Object.assign(new Error("Not your song"), { statusCode: 403 });

  await repo.deleteQueueItem(id);
  await publishQueueUpdate(tenant_id, item.branch_id);

  return { refunded: item.amount_charged };
}

export async function getNextSong(tenant_id: string, branch_id: string) {
  const nowPlaying = await repo.getNowPlaying(tenant_id, branch_id);
  if (nowPlaying) {
    await repo.updateQueueItemStatus(nowPlaying.id, "played", {
      played_at: new Date(),
    });
    await repo.addToHistory({
      tenant_id,
      branch_id,
      song_title: nowPlaying.song_title,
      song_artist: nowPlaying.song_artist,
      song_thumbnail: nowPlaying.song_thumbnail,
      requested_by: nowPlaying.requested_by_alias,
      dedicated_to: nowPlaying.dedicated_to_alias ?? undefined,
      played_at: new Date(),
      duration_secs: nowPlaying.song_duration_secs,
    });
  }

  const next = await repo.getNextQueued(tenant_id, branch_id);
  if (!next) return null;

  await repo.updateQueueItemStatus(next.id, "playing");

  await redis.publish(
    "JUKEBOX_SONG_STARTED",
    JSON.stringify({
      tenant_id,
      branch_id,
      song: {
        song_id: next.song_id,
        song_title: next.song_title,
        song_artist: next.song_artist,
        song_thumbnail: next.song_thumbnail,
        song_duration_secs: next.song_duration_secs,
      },
      requested_by_alias: next.requested_by_alias,
      dedicated_to_alias: next.dedicated_to_alias,
      dedication_message: next.dedication_message,
    })
  );

  return next;
}

export async function finishSong(
  tenant_id: string,
  branch_id: string,
  queue_item_id: string,
  completed: boolean
) {
  const item = await repo.getQueueItem(queue_item_id, tenant_id);
  if (!item)
    throw Object.assign(new Error("Queue item not found"), { statusCode: 404 });

  const status = completed ? ("played" as const) : ("skipped" as const);
  const extra = completed
    ? { played_at: new Date() }
    : { skipped_at: new Date() };
  await repo.updateQueueItemStatus(queue_item_id, status, extra);

  await repo.addToHistory({
    tenant_id,
    branch_id,
    song_title: item.song_title,
    song_artist: item.song_artist,
    song_thumbnail: item.song_thumbnail,
    requested_by: item.requested_by_alias,
    dedicated_to: item.dedicated_to_alias ?? undefined,
    played_at: new Date(),
    duration_secs: item.song_duration_secs,
  });

  await redis.publish(
    "JUKEBOX_SONG_ENDED",
    JSON.stringify({ tenant_id, branch_id, queue_item_id })
  );

  const next = await repo.getNextQueued(tenant_id, branch_id);
  if (next) {
    await repo.updateQueueItemStatus(next.id, "playing");
    await redis.publish(
      "JUKEBOX_SONG_STARTED",
      JSON.stringify({
        tenant_id,
        branch_id,
        song: {
          song_id: next.song_id,
          song_title: next.song_title,
          song_artist: next.song_artist,
          song_thumbnail: next.song_thumbnail,
          song_duration_secs: next.song_duration_secs,
        },
        requested_by_alias: next.requested_by_alias,
        dedicated_to_alias: next.dedicated_to_alias,
        dedication_message: next.dedication_message,
      })
    );
    return next;
  }

  return null;
}

export async function updateHeartbeat(
  tenant_id: string,
  branch_id: string
) {
  await repo.upsertConfig(tenant_id, branch_id, {
    player_last_seen: new Date(),
  });
}

export async function searchSongs(query: string): Promise<YouTubeSong[]> {
  return searchYouTube(query);
}

async function publishQueueUpdate(
  tenant_id: string,
  branch_id: string
): Promise<void> {
  const queue = await getQueueWithStatus(tenant_id, branch_id);
  await redis.publish(
    "JUKEBOX_QUEUE_UPDATED",
    JSON.stringify({ tenant_id, branch_id, queue })
  );
}
