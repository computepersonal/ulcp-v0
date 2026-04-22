import { prisma } from "../lib/prisma";
import type { Prisma } from "../generated/prisma";
import type { SongMetadata } from "../lib/oembed";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateSongData extends SongMetadata {
  tenant_id: string;
  genre?: string;
  language?: string;
  added_by?: string;
}

export interface UpdateSongData {
  title?: string;
  artist?: string;
  genre?: string | null;
  language?: string | null;
  is_active?: boolean;
  sort_order?: number;
  duration_secs?: number;
}

export interface ListSongsOptions {
  search?: string;
  genre?: string;
  language?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function addSong(data: CreateSongData) {
  return prisma.song.create({
    data: {
      tenant_id: data.tenant_id,
      title: data.title,
      artist: data.artist,
      duration_secs: data.duration_secs,
      thumbnail: data.thumbnail,
      source: data.source,
      source_id: data.source_id,
      source_url: data.source_url,
      genre: data.genre,
      language: data.language,
      added_by: data.added_by,
    },
  });
}

export async function bulkAddSongs(
  tenant_id: string,
  songs: Array<SongMetadata & { genre?: string; language?: string; added_by?: string }>
): Promise<{ count: number }> {
  return prisma.song.createMany({
    data: songs.map((s) => ({
      tenant_id,
      title: s.title,
      artist: s.artist,
      duration_secs: s.duration_secs,
      thumbnail: s.thumbnail,
      source: s.source,
      source_id: s.source_id,
      source_url: s.source_url,
      genre: s.genre,
      language: s.language,
      added_by: s.added_by,
    })),
    skipDuplicates: true,
  });
}

export async function listSongs(
  tenant_id: string,
  opts: ListSongsOptions = {}
) {
  const { search, genre, language, is_active, limit = 50, offset = 0 } = opts;

  const where: Prisma.SongWhereInput = {
    tenant_id,
    ...(is_active !== undefined ? { is_active } : {}),
    ...(genre ? { genre } : {}),
    ...(language ? { language } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { artist: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  return prisma.song.findMany({
    where,
    orderBy: [{ sort_order: "asc" }, { title: "asc" }],
    take: limit,
    skip: offset,
  });
}

export async function getSong(tenant_id: string, id: string) {
  return prisma.song.findFirst({ where: { id, tenant_id } });
}

export async function updateSong(
  tenant_id: string,
  id: string,
  data: UpdateSongData
) {
  return prisma.song.updateMany({
    where: { id, tenant_id },
    data,
  });
}

export async function deleteSong(tenant_id: string, id: string) {
  return prisma.song.deleteMany({ where: { id, tenant_id } });
}

export async function countSongs(tenant_id: string): Promise<number> {
  return prisma.song.count({ where: { tenant_id, is_active: true } });
}

export async function searchSongs(
  tenant_id: string,
  query: string,
  limit = 20
) {
  return prisma.song.findMany({
    where: {
      tenant_id,
      is_active: true,
      OR: [
        { title: { contains: query, mode: "insensitive" as const } },
        { artist: { contains: query, mode: "insensitive" as const } },
      ],
    },
    orderBy: [{ sort_order: "asc" }, { title: "asc" }],
    take: limit,
  });
}
