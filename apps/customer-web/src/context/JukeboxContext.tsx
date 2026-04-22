import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useSocial } from "./SocialContext";

const JUKEBOX_URL =
  (import.meta.env.VITE_JUKEBOX_SERVICE_URL as string | undefined) ??
  "http://localhost:3014";

export interface NowPlaying {
  song_title: string;
  song_artist: string;
  song_thumbnail: string;
  song_duration_secs: number;
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
  estimated_wait_mins: number;
  requested_by_customer_id?: string | null;
  status: string;
}

export interface SongResult {
  song_id: string;
  song_title: string;
  song_artist: string;
  song_duration_secs: number;
  song_thumbnail: string;
  source: "youtube" | "spotify";
}

export interface AddSongParams {
  tenant_id: string;
  branch_id: string;
  alias: string;
  token?: string;
  song: SongResult;
  dedicated_to_alias?: string;
  dedication_message?: string;
}

export interface AddSongResult {
  queue_item_id: string;
  position: number;
  estimated_wait_mins: number;
  amount_charged: number;
}

export interface JukeboxState {
  isEnabled: boolean;
  pricePerSong: number;
  nowPlaying: NowPlaying | null;
  queue: QueueItem[];
  queueLength: number;
  isLoading: boolean;
  // Actions
  fetchStatus: (tenant_id: string, branch_id: string) => Promise<void>;
  fetchQueue: (tenant_id: string, branch_id: string) => Promise<void>;
  searchSongs: (
    tenant_id: string,
    branch_id: string,
    query: string
  ) => Promise<SongResult[]>;
  addSong: (params: AddSongParams) => Promise<AddSongResult>;
  cancelSong: (
    tenant_id: string,
    branch_id: string,
    id: string,
    token?: string
  ) => Promise<void>;
}

const JukeboxContext = createContext<JukeboxState | null>(null);

export function JukeboxProvider({ children }: { children: ReactNode }) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [pricePerSong, setPricePerSong] = useState(2000);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueLength, setQueueLength] = useState(0);
  const [isLoading] = useState(false);

  // Listen to jukebox socket events via the shared social socket
  const { socket } = useSocial();

  useEffect(() => {
    if (!socket) return;

    const onNowPlaying = (data: NowPlaying) => {
      setNowPlaying(data);
    };

    const onSongEnded = () => {
      setNowPlaying(null);
    };

    const onQueueUpdated = (data: {
      queue?: {
        now_playing?: NowPlaying | null;
        up_next?: QueueItem[];
        queue_length?: number;
      };
    }) => {
      if (data.queue) {
        if (data.queue.now_playing !== undefined)
          setNowPlaying(data.queue.now_playing ?? null);
        if (data.queue.up_next) setQueue(data.queue.up_next);
        if (data.queue.queue_length !== undefined)
          setQueueLength(data.queue.queue_length);
      }
    };

    socket.on("jukebox:now_playing", onNowPlaying);
    socket.on("jukebox:song_ended", onSongEnded);
    socket.on("jukebox:queue_updated", onQueueUpdated);

    return () => {
      socket.off("jukebox:now_playing", onNowPlaying);
      socket.off("jukebox:song_ended", onSongEnded);
      socket.off("jukebox:queue_updated", onQueueUpdated);
    };
  }, [socket]);

  const fetchStatus = useCallback(
    async (tenant_id: string, branch_id: string) => {
      try {
        const res = await fetch(
          `${JUKEBOX_URL}/api/v1/jukebox/${tenant_id}/${branch_id}/queue/status`
        );
        const data = (await res.json()) as {
          success: boolean;
          data: {
            is_enabled: boolean;
            price_per_song: number;
            now_playing: NowPlaying | null;
            queue_length: number;
          };
        };
        if (data.success) {
          setIsEnabled(data.data.is_enabled);
          setPricePerSong(data.data.price_per_song);
          setNowPlaying(data.data.now_playing);
          setQueueLength(data.data.queue_length);
        }
      } catch {
        // jukebox service not available — disable silently
      }
    },
    []
  );

  const fetchQueue = useCallback(
    async (tenant_id: string, branch_id: string) => {
      try {
        const res = await fetch(
          `${JUKEBOX_URL}/api/v1/jukebox/${tenant_id}/${branch_id}/queue`
        );
        const data = (await res.json()) as {
          success: boolean;
          data: {
            now_playing: NowPlaying | null;
            up_next: QueueItem[];
            queue_length: number;
          };
        };
        if (data.success) {
          setNowPlaying(data.data.now_playing);
          setQueue(data.data.up_next);
          setQueueLength(data.data.queue_length);
        }
      } catch {
        // ignore
      }
    },
    []
  );

  const searchSongs = useCallback(
    async (
      tenant_id: string,
      _branch_id: string,
      query: string
    ): Promise<SongResult[]> => {
      if (query.trim().length < 2) return [];
      try {
        const res = await fetch(
          `${JUKEBOX_URL}/api/v1/jukebox/${tenant_id}/search?q=${encodeURIComponent(query)}`
        );
        const data = (await res.json()) as {
          success: boolean;
          data: SongResult[];
        };
        return data.success ? data.data : [];
      } catch {
        return [];
      }
    },
    []
  );

  const addSong = useCallback(
    async (params: AddSongParams): Promise<AddSongResult> => {
      const res = await fetch(
        `${JUKEBOX_URL}/api/v1/jukebox/${params.tenant_id}/${params.branch_id}/queue/add`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(params.token
              ? { Authorization: `Bearer ${params.token}` }
              : {}),
          },
          body: JSON.stringify({
            ...params.song,
            alias: params.alias,
            dedicated_to_alias: params.dedicated_to_alias,
            dedication_message: params.dedication_message,
          }),
        }
      );
      const data = (await res.json()) as {
        success: boolean;
        data: AddSongResult;
        error?: string;
      };
      if (!data.success) throw new Error(data.error ?? "Failed to add song");
      return data.data;
    },
    []
  );

  const cancelSong = useCallback(
    async (
      tenant_id: string,
      branch_id: string,
      id: string,
      token?: string
    ) => {
      await fetch(
        `${JUKEBOX_URL}/api/v1/jukebox/${tenant_id}/${branch_id}/queue/${id}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
    },
    []
  );

  return (
    <JukeboxContext.Provider
      value={{
        isEnabled,
        pricePerSong,
        nowPlaying,
        queue,
        queueLength,
        isLoading,
        fetchStatus,
        fetchQueue,
        searchSongs,
        addSong,
        cancelSong,
      }}
    >
      {children}
    </JukeboxContext.Provider>
  );
}

export function useJukebox() {
  const ctx = useContext(JukeboxContext);
  if (!ctx) throw new Error("useJukebox must be used within JukeboxProvider");
  return ctx;
}
