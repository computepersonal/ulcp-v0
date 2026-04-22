const JUKEBOX_URL: string =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_JUKEBOX_SERVICE_URL ?? "http://localhost:3014";

export interface SongResponse {
  id: string;
  song_id: string;
  song_title: string;
  song_artist: string;
  song_thumbnail: string;
  song_duration_secs: number;
  source: "youtube" | "spotify";
  requested_by_alias: string;
  dedicated_to_alias?: string | null;
  dedication_message?: string | null;
}

export interface QueueItem {
  id: string;
  song_title: string;
  song_artist: string;
  song_thumbnail: string;
  requested_by_alias: string;
  position: number;
}

export interface QueueResponse {
  now_playing: SongResponse | null;
  up_next: QueueItem[];
  queue_length: number;
}

export interface PairResult {
  player_token: string;
  tenant_id: string;
  branch_id: string;
  config: { price_per_song: number; is_enabled: boolean };
}

export async function pairPlayer(code: string): Promise<PairResult> {
  const res = await fetch(`${JUKEBOX_URL}/api/v1/jukebox/player/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = (await res.json()) as {
    success: boolean;
    data: PairResult;
    error?: string;
  };
  if (!data.success) throw new Error(data.error ?? "Pairing failed");
  return data.data;
}

export async function getNextSong(
  tenant_id: string,
  branch_id: string,
  player_token: string
): Promise<SongResponse | null> {
  const res = await fetch(
    `${JUKEBOX_URL}/api/v1/jukebox/player/${tenant_id}/${branch_id}/next`,
    { headers: { "X-Player-Token": player_token } }
  );
  const data = (await res.json()) as {
    success: boolean;
    data: SongResponse | null;
  };
  return data.success ? data.data : null;
}

export async function markFinished(
  tenant_id: string,
  branch_id: string,
  player_token: string,
  queue_item_id: string,
  completed: boolean
): Promise<SongResponse | null> {
  const res = await fetch(
    `${JUKEBOX_URL}/api/v1/jukebox/player/${tenant_id}/${branch_id}/finished`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Player-Token": player_token,
      },
      body: JSON.stringify({ queue_item_id, completed }),
    }
  );
  const data = (await res.json()) as {
    success: boolean;
    data: { next_song: SongResponse | null };
  };
  return data.data?.next_song ?? null;
}

export async function sendHeartbeat(
  tenant_id: string,
  branch_id: string,
  player_token: string
): Promise<void> {
  await fetch(
    `${JUKEBOX_URL}/api/v1/jukebox/player/${tenant_id}/${branch_id}/heartbeat`,
    {
      method: "POST",
      headers: { "X-Player-Token": player_token },
    }
  ).catch(() => undefined);
}

export async function getQueue(
  tenant_id: string,
  branch_id: string
): Promise<QueueResponse> {
  const res = await fetch(
    `${JUKEBOX_URL}/api/v1/jukebox/${tenant_id}/${branch_id}/queue`
  );
  const data = (await res.json()) as {
    success: boolean;
    data: QueueResponse;
  };
  return data.data ?? { now_playing: null, up_next: [], queue_length: 0 };
}
