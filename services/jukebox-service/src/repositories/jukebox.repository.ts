import { prisma } from "../lib/prisma";
import { JukeboxStatus } from "../generated/prisma";

export async function getConfig(tenant_id: string) {
  return prisma.jukeboxConfig.findUnique({ where: { tenant_id } });
}

export async function upsertConfig(
  tenant_id: string,
  branch_id: string,
  data: Partial<{
    is_enabled: boolean;
    price_per_song: number;
    max_queue_length: number;
    max_songs_per_user: number;
    allow_dedications: boolean;
    content_filter: string;
    player_setup_code: string | null;
    player_token: string | null;
    player_last_seen: Date | null;
  }>
) {
  return prisma.jukeboxConfig.upsert({
    where: { tenant_id },
    create: { tenant_id, branch_id, ...data },
    update: data,
  });
}

export async function getQueue(tenant_id: string, branch_id: string) {
  return prisma.jukeboxQueue.findMany({
    where: { tenant_id, branch_id, status: { in: ["queued", "playing"] } },
    orderBy: { position: "asc" },
  });
}

export async function getNextPosition(
  tenant_id: string,
  branch_id: string
): Promise<number> {
  const last = await prisma.jukeboxQueue.findFirst({
    where: { tenant_id, branch_id, status: { in: ["queued", "playing"] } },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1;
}

export async function countUserSongs(
  tenant_id: string,
  branch_id: string,
  customer_id: string
): Promise<number> {
  return prisma.jukeboxQueue.count({
    where: {
      tenant_id,
      branch_id,
      requested_by_customer_id: customer_id,
      status: { in: ["queued", "playing"] },
    },
  });
}

export async function addToQueue(data: {
  tenant_id: string;
  branch_id: string;
  position: number;
  song_id: string;
  song_title: string;
  song_artist: string;
  song_duration_secs: number;
  song_thumbnail: string;
  source: string;
  requested_by_alias: string;
  requested_by_customer_id?: string;
  dedicated_to_alias?: string;
  dedication_message?: string;
  order_id?: string;
  amount_charged: number;
}) {
  return prisma.jukeboxQueue.create({ data });
}

export async function getQueueItem(id: string, tenant_id: string) {
  return prisma.jukeboxQueue.findFirst({ where: { id, tenant_id } });
}

export async function updateQueueItemStatus(
  id: string,
  status: JukeboxStatus,
  extra?: { played_at?: Date; skipped_at?: Date }
) {
  return prisma.jukeboxQueue.update({
    where: { id },
    data: { status, ...extra },
  });
}

export async function deleteQueueItem(id: string) {
  return prisma.jukeboxQueue.delete({ where: { id } });
}

export async function getNowPlaying(tenant_id: string, branch_id: string) {
  return prisma.jukeboxQueue.findFirst({
    where: { tenant_id, branch_id, status: "playing" },
  });
}

export async function getNextQueued(tenant_id: string, branch_id: string) {
  return prisma.jukeboxQueue.findFirst({
    where: { tenant_id, branch_id, status: "queued" },
    orderBy: { position: "asc" },
  });
}

export async function addToHistory(data: {
  tenant_id: string;
  branch_id: string;
  song_title: string;
  song_artist: string;
  song_thumbnail: string;
  requested_by: string;
  dedicated_to?: string;
  played_at: Date;
  duration_secs: number;
}) {
  return prisma.jukeboxHistory.create({ data });
}

export async function getHistory(
  tenant_id: string,
  branch_id: string,
  take = 50
) {
  return prisma.jukeboxHistory.findMany({
    where: { tenant_id, branch_id },
    orderBy: { played_at: "desc" },
    take,
  });
}
