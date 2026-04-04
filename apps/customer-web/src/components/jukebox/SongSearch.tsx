import { useState, useEffect, useRef } from "react";
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
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
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
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tenant_id, branch_id, searchSongs]);

  function formatDuration(secs: number) {
    return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;
  }

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
          placeholder="Search songs, artists, albums..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-[#1A1F2E] rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            Searching...
          </div>
        )}

        {!loading && results.length === 0 && query.length >= 2 && (
          <div className="text-center py-12 text-gray-500">
            <p>No songs found for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {!loading && query.length < 2 && (
          <div className="p-4">
            <p className="text-gray-500 text-sm font-semibold mb-4">
              Try searching for
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "Kesariya",
                "Tum Hi Ho",
                "Cheap Thrills",
                "Believer",
                "Sugar",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="bg-[#1A1F2E] text-gray-300 px-4 py-2 rounded-full text-sm hover:bg-[#252B3B]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {results.map((song) => (
          <button
            key={song.song_id}
            onClick={() => onSelect(song)}
            className="w-full flex items-center gap-4 p-4 hover:bg-[#1A1F2E] border-b border-[#1A1F2E] text-left"
          >
            <img
              src={song.song_thumbnail}
              alt=""
              className="w-14 h-14 rounded-xl object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">
                {song.song_title}
              </p>
              <p className="text-sm text-gray-400 truncate">{song.song_artist}</p>
              <p className="text-xs text-gray-600 mt-1">
                {formatDuration(song.song_duration_secs)} &bull; YouTube
              </p>
            </div>
            <div className="text-brand-500 text-xl shrink-0">+</div>
          </button>
        ))}
      </div>
    </div>
  );
}
