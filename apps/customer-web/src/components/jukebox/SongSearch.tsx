import { useState, useEffect, useRef, useCallback } from "react";
import { useJukebox, type SongResult } from "../../context/JukeboxContext";

interface Props {
  tenant_id: string;
  branch_id: string;
  onSelect: (song: SongResult) => void;
  onClose: () => void;
}

export default function SongSearch({
  tenant_id,
  branch_id,
  onSelect,
  onClose,
}: Props) {
  const { searchSongs } = useJukebox();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [allSongs, setAllSongs] = useState<SongResult[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load full catalog on mount
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      // Search with empty-ish query to get all songs — the backend
      // returns [] for queries < 2 chars, so we use a special approach:
      // fetch the songs list endpoint directly
      const jukeboxUrl =
        (import.meta.env.VITE_JUKEBOX_SERVICE_URL as string | undefined) ??
        "http://localhost:3014";
      const res = await fetch(
        `${jukeboxUrl}/api/v1/jukebox/${tenant_id}/songs?is_active=true&limit=200`
      );
      const data = (await res.json()) as {
        success: boolean;
        data?: Array<{
          id: string;
          title: string;
          artist: string;
          duration_secs: number;
          thumbnail: string | null;
          source: string;
          source_id: string;
        }>;
      };
      if (data.success && data.data) {
        const mapped: SongResult[] = data.data.map((s) => ({
          song_id: s.source_id,
          song_title: s.title,
          song_artist: s.artist,
          song_duration_secs: s.duration_secs,
          song_thumbnail:
            s.thumbnail ??
            (s.source === "youtube"
              ? `https://img.youtube.com/vi/${s.source_id}/mqdefault.jpg`
              : ""),
          source: s.source as "youtube" | "spotify",
        }));
        setAllSongs(mapped);
        setResults(mapped);
      }
    } catch {
      // Service not available
    }
    setLoading(false);
  }, [tenant_id]);

  useEffect(() => {
    void loadCatalog();
    inputRef.current?.focus();
  }, [loadCatalog]);

  // Search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      // Show full catalog when no search query
      setResults(allSongs);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      searchSongs(tenant_id, branch_id, query)
        .then((r) => {
          setResults(r);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tenant_id, branch_id, searchSongs, allSongs]);

  function formatDuration(secs: number) {
    return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;
  }

  const displayResults = results;

  return (
    <div className="fixed inset-0 bg-[#0F1117] z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-[#252B3B]">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-2 text-lg"
        >
          ←
        </button>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search songs, artists..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-[#1A1F2E] rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            Loading songs...
          </div>
        )}

        {!loading && displayResults.length === 0 && query.length >= 2 && (
          <div className="text-center py-12 text-gray-500">
            <p>No songs found for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {!loading && displayResults.length === 0 && query.length < 2 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-3xl mb-3">🎵</div>
            <p>No songs available yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Ask the venue to add songs to their jukebox
            </p>
          </div>
        )}

        {!loading && displayResults.length > 0 && query.length < 2 && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              {displayResults.length} song{displayResults.length !== 1 ? "s" : ""} available
            </p>
          </div>
        )}

        {displayResults.map((song) => (
          <button
            key={`${song.source}-${song.song_id}`}
            onClick={() => onSelect(song)}
            className="w-full flex items-center gap-4 p-4 hover:bg-[#1A1F2E] border-b border-[#1A1F2E]/50 text-left"
          >
            {song.song_thumbnail ? (
              <img
                src={song.song_thumbnail}
                alt=""
                className="w-14 h-14 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-[#1A1F2E] flex items-center justify-center text-gray-500 text-xl shrink-0">
                🎵
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">
                {song.song_title}
              </p>
              <p className="text-sm text-gray-400 truncate">
                {song.song_artist}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {formatDuration(song.song_duration_secs)} &bull;{" "}
                <span
                  className={
                    song.source === "spotify"
                      ? "text-green-500"
                      : "text-red-400"
                  }
                >
                  {song.source === "spotify" ? "Spotify" : "YouTube"}
                </span>
              </p>
            </div>
            <div className="text-brand-500 text-xl shrink-0">+</div>
          </button>
        ))}
      </div>
    </div>
  );
}
