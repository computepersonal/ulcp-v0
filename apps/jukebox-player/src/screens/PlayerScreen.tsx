import { useState, useEffect, useRef, useCallback } from "react";
import QRDisplay from "../components/QRDisplay";
import {
  getNextSong,
  markFinished,
  sendHeartbeat,
  getQueue,
  type SongResponse,
  type QueueItem,
} from "../api";

const ADS_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ADS_SERVICE_URL ?? "http://localhost:3015";

interface JukeboxAd {
  campaign_id: string;
  creative_id: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  advertiser_name: string;
  cta_text: string;
  cta_url: string;
}

function useJukeboxAds(tenant_id: string, branch_id: string) {
  const [ads, setAds] = useState<JukeboxAd[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const qs = new URLSearchParams({
          placement: "jukebox_player",
          tenant_id,
          branch_id,
          limit: "5",
        });
        const res = await fetch(`${ADS_URL}/api/v1/ads/serve?${qs.toString()}`);
        if (!res.ok) return;
        const data = await res.json() as { success: boolean; data?: { ads: JukeboxAd[] } };
        if (data.success && data.data) setAds(data.data.ads);
      } catch {
        // fail silently
      }
    };
    void load();
    // Refresh ads every 10 minutes
    const interval = setInterval(() => void load(), 600000);
    return () => clearInterval(interval);
  }, [tenant_id, branch_id]);

  // Rotate ad every 30 seconds
  useEffect(() => {
    if (ads.length < 2) return;
    const interval = setInterval(() => {
      setCurrentIdx(i => (i + 1) % ads.length);
    }, 30000);
    return () => clearInterval(interval);
  }, [ads.length]);

  return ads.length > 0 ? ads[currentIdx] ?? null : null;
}

interface Props {
  tenant_id: string;
  branch_id: string;
  player_token: string;
  onUnpair: () => void;
}

// YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: YTPlayerOptions
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
  };
}

interface YTPlayer {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

export default function PlayerScreen({
  tenant_id,
  branch_id,
  player_token,
  onUnpair,
}: Props) {
  const [started, setStarted] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<SongResponse | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ytReady, setYtReady] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const currentSongRef = useRef<SongResponse | null>(null);
  const loadSongRef = useRef<((song: SongResponse) => void) | null>(null);

  const JUKEBOX_URL: string =
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_JUKEBOX_SERVICE_URL ?? "http://localhost:3014";
  // QR links to customer web social room
  const qrUrl = `http://localhost:5174/place/${tenant_id}?jukebox=1`;

  const jukeboxAd = useJukeboxAds(tenant_id, branch_id);

  // Load YouTube IFrame API script
  useEffect(() => {
    if (document.getElementById("yt-api-script")) {
      if (window.YT) setYtReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "yt-api-script";
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);

    window.onYouTubeIframeAPIReady = () => {
      setYtReady(true);
    };
  }, []);

  // Fetch initial queue
  useEffect(() => {
    getQueue(tenant_id, branch_id)
      .then((data) => {
        if (data.up_next) setQueue(data.up_next);
        if (data.now_playing) setNowPlaying(data.now_playing);
      })
      .catch(() => undefined);
  }, [tenant_id, branch_id]);

  // Heartbeat every 30s
  useEffect(() => {
    heartbeatIntervalRef.current = setInterval(() => {
      void sendHeartbeat(tenant_id, branch_id, player_token);
    }, 30000);
    return () => {
      if (heartbeatIntervalRef.current)
        clearInterval(heartbeatIntervalRef.current);
    };
  }, [tenant_id, branch_id, player_token]);

  const startProgressTracking = useCallback(() => {
    if (progressIntervalRef.current)
      clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      if (playerRef.current) {
        const curr = playerRef.current.getCurrentTime();
        const dur = playerRef.current.getDuration();
        if (dur > 0) {
          setCurrentTime(Math.floor(curr));
          setDuration(Math.floor(dur));
          setProgress((curr / dur) * 100);
        }
      }
    }, 1000);
  }, []);

  const loadSong = useCallback(
    (song: SongResponse) => {
      currentSongRef.current = song;
      setNowPlaying(song);
      setProgress(0);
      setCurrentTime(0);
      setDuration(song.song_duration_secs);

      function onSongEnded() {
        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);
        const current = currentSongRef.current;
        if (!current) return;
        markFinished(tenant_id, branch_id, player_token, current.id, true)
          .then((next) => {
            if (next) {
              loadSongRef.current?.(next);
            } else {
              setNowPlaying(null);
              setProgress(0);
            }
          })
          .catch(() => undefined);
      }

      if (playerRef.current) {
        playerRef.current.loadVideoById(song.song_id);
        startProgressTracking();
      } else if (window.YT?.Player) {
        playerRef.current = new window.YT.Player("yt-player", {
          videoId: song.song_id,
          playerVars: { autoplay: 1, controls: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              playerRef.current?.playVideo();
              startProgressTracking();
            },
            onStateChange: (event) => {
              if (event.data === 0) {
                // YT.PlayerState.ENDED = 0
                onSongEnded();
              }
            },
          },
        });
      }
    },
    [tenant_id, branch_id, player_token, startProgressTracking]
  );

  // Keep ref in sync so onSongEnded can call the latest loadSong
  useEffect(() => {
    loadSongRef.current = loadSong;
  }, [loadSong]);

  async function handleStart() {
    setStarted(true);
    try {
      const next = await getNextSong(tenant_id, branch_id, player_token);
      if (next) loadSong(next);
    } catch {
      // no songs yet
    }
  }

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (!started) {
    return (
      <div className="w-full h-full bg-[#0F1117] flex flex-col items-center justify-center gap-8">
        <div className="text-center">
          <div className="text-8xl mb-6">🎵</div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Jukebox Ready
          </h1>
          <p className="text-gray-400 text-lg">
            {ytReady
              ? "Click to start playing music"
              : "Loading YouTube player..."}
          </p>
        </div>
        <button
          onClick={() => void handleStart()}
          disabled={!ytReady}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold px-16 py-6 rounded-2xl text-2xl transition-colors shadow-2xl"
        >
          ▶ Start Jukebox
        </button>
        <button
          onClick={onUnpair}
          className="text-gray-700 hover:text-gray-500 text-sm"
        >
          Unpair this player
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#0F1117] flex flex-col p-8 gap-6">
      {/* Hidden YouTube player — audio only */}
      <div
        id="yt-player"
        style={{
          position: "absolute",
          top: -9999,
          left: -9999,
          width: 1,
          height: 1,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎵</span>
          <span className="text-2xl font-bold text-white tracking-wide">
            JUKEBOX
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
          <span>Live</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-8 min-h-0">
        {/* Left: Now Playing + Queue */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <div className="text-xs font-semibold text-gray-500 tracking-widest uppercase">
            Now Playing
          </div>

          {nowPlaying ? (
            <div className="flex gap-8 items-start animate-slide-up">
              {/* Thumbnail */}
              <div className="w-48 h-48 rounded-2xl overflow-hidden shrink-0 shadow-2xl">
                <img
                  src={nowPlaying.song_thumbnail}
                  alt={nowPlaying.song_title}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-4xl font-bold text-white leading-tight mb-2 truncate">
                  {nowPlaying.song_title}
                </h2>
                <p className="text-xl text-gray-400 mb-6 truncate">
                  {nowPlaying.song_artist}
                </p>

                <div className="space-y-1.5 mb-6">
                  <p className="text-gray-300">
                    🎧 Requested by{" "}
                    <span className="font-semibold text-white">
                      {nowPlaying.requested_by_alias}
                    </span>
                  </p>
                  {nowPlaying.dedicated_to_alias && (
                    <p className="text-pink-400">
                      💝 Dedicated to{" "}
                      <span className="font-semibold">
                        {nowPlaying.dedicated_to_alias}
                      </span>
                    </p>
                  )}
                  {nowPlaying.dedication_message && (
                    <p className="text-gray-400 italic">
                      &ldquo;{nowPlaying.dedication_message}&rdquo;
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="w-full h-2 bg-[#252B3B] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-1000"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 font-mono">
                    <span>{formatTime(currentTime)}</span>
                    <span>
                      {formatTime(
                        duration || nowPlaying.song_duration_secs
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
              <div className="text-7xl opacity-20">🎵</div>
              <p className="text-gray-500 text-2xl">Queue is empty</p>
              <p className="text-gray-600">
                Scan the QR code to add songs!
              </p>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-[#252B3B] shrink-0" />

          {/* Up Next */}
          <div className="flex-1 min-h-0">
            <div className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-3">
              Up Next
            </div>
            <div className="space-y-2 overflow-y-auto max-h-48">
              {queue.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 bg-[#1A1F2E] rounded-xl p-3"
                >
                  <span className="text-xl font-bold text-brand-500 w-8 text-center shrink-0">
                    #{item.position}
                  </span>
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    <img
                      src={item.song_thumbnail}
                      alt={item.song_title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">
                      {item.song_title}
                    </p>
                    <p className="text-sm text-gray-400 truncate">
                      {item.song_artist}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500 shrink-0">
                    {item.requested_by_alias}
                  </p>
                </div>
              ))}

              {queue.length === 0 && (
                <p className="text-gray-700 text-center py-4">
                  No songs queued
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Ad zone + QR Code */}
        <div className="w-56 flex flex-col items-center gap-4 shrink-0">
          <div className="bg-white rounded-2xl p-4 overflow-hidden">
            <QRDisplay value={qrUrl} size={160} />
          </div>
          <p className="text-gray-500 text-sm text-center leading-relaxed">
            Scan to add songs to the queue
          </p>

          {/* Jukebox player ad — rotates every 30s */}
          {jukeboxAd && (
            <div
              className="w-full rounded-2xl overflow-hidden border border-[#252B3B] transition-all duration-500"
              style={jukeboxAd.brand_color ? { borderColor: jukeboxAd.brand_color } : undefined}
            >
              {jukeboxAd.image_url && (
                <img
                  src={jukeboxAd.image_url}
                  alt={jukeboxAd.advertiser_name}
                  className="w-full aspect-video object-cover"
                />
              )}
              <div className="p-3 bg-[#1A1F2E]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1">
                  Featured
                </div>
                <div className="font-bold text-white text-sm leading-tight mb-0.5 truncate">
                  {jukeboxAd.advertiser_name}
                </div>
                <div className="text-xs text-gray-400 truncate">{jukeboxAd.headline}</div>
              </div>
            </div>
          )}

          <div className="mt-auto">
            <button
              onClick={onUnpair}
              className="text-gray-700 text-xs hover:text-gray-500 transition-colors"
            >
              Unpair player
            </button>
          </div>
        </div>
      </div>

      {/* Footer: venue info */}
      <div className="shrink-0 text-center text-gray-700 text-xs">
        {JUKEBOX_URL.replace("http://", "").replace(":3014", "")} •
        Add songs by scanning the QR code
      </div>
    </div>
  );
}
