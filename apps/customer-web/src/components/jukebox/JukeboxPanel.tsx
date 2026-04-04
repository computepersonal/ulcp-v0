import { useState, useEffect } from "react";
import {
  useJukebox,
  type QueueItem,
  type SongResult,
} from "../../context/JukeboxContext";
import SongSearch from "./SongSearch";

interface Props {
  tenant_id: string;
  branch_id: string;
  alias: string;
  token?: string;
  publicUsers: Array<{ alias: string; emoji: string }>;
  onClose: () => void;
}

type PanelScreen = "main" | "search" | "dedication" | "success";

interface SuccessInfo {
  position: number;
  estimated_wait_mins: number;
  amount_charged: number;
}

export default function JukeboxPanel({
  tenant_id,
  branch_id,
  alias,
  token,
  publicUsers,
  onClose,
}: Props) {
  const { nowPlaying, queue, pricePerSong, fetchQueue, addSong } = useJukebox();
  const [screen, setScreen] = useState<PanelScreen>("main");
  const [selectedSong, setSelectedSong] = useState<SongResult | null>(null);
  const [dedicateTo, setDedicateTo] = useState("");
  const [dedicationMsg, setDedicationMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchQueue(tenant_id, branch_id);
  }, [tenant_id, branch_id, fetchQueue]);

  function formatPrice(paise: number) {
    return `\u20B9${(paise / 100).toFixed(0)}`;
  }

  function formatWait(mins: number) {
    if (mins === 0) return "Up next!";
    if (mins < 60) return `~${mins} min`;
    return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  async function handleAddSong() {
    if (!selectedSong) return;
    setAdding(true);
    setError("");
    try {
      const result = await addSong({
        tenant_id,
        branch_id,
        alias,
        token,
        song: selectedSong,
        dedicated_to_alias: dedicateTo || undefined,
        dedication_message: dedicationMsg || undefined,
      });
      setSuccessInfo({
        position: result.position,
        estimated_wait_mins: result.estimated_wait_mins,
        amount_charged: result.amount_charged,
      });
      setSelectedSong(null);
      setDedicateTo("");
      setDedicationMsg("");
      setScreen("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add song");
    } finally {
      setAdding(false);
    }
  }

  // Success screen
  if (screen === "success" && successInfo) {
    return (
      <div
        className="fixed inset-0 bg-black/70 z-50 flex items-end"
        onClick={onClose}
      >
        <div
          className="w-full bg-[#1A1F2E] rounded-t-3xl p-6 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎵</div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Added to Queue!
            </h3>
            <p className="text-gray-400 mb-1">
              You&apos;re #{successInfo.position} in queue
            </p>
            <p className="text-gray-400 mb-4">
              Estimated wait: {formatWait(successInfo.estimated_wait_mins)}
            </p>
            <p className="text-green-400 font-semibold">
              {formatPrice(successInfo.amount_charged)} added to your bill
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setSuccessInfo(null); setScreen("main"); }}
              className="flex-1 bg-[#252B3B] text-white py-4 rounded-xl font-semibold"
            >
              View Queue
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-brand-500 text-white py-4 rounded-xl font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dedication screen
  if (screen === "dedication" && selectedSong) {
    return (
      <div
        className="fixed inset-0 bg-black/70 z-50 flex items-end"
        onClick={() => setScreen("main")}
      >
        <div
          className="w-full bg-[#1A1F2E] rounded-t-3xl p-6 animate-slide-up max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => { setScreen("main"); setSelectedSong(null); }}
              className="text-gray-400 hover:text-white text-xl"
            >
              ←
            </button>
            <h3 className="font-bold text-white text-lg">Add to Queue</h3>
          </div>

          {/* Song preview */}
          <div className="flex items-center gap-3 bg-[#252B3B] rounded-xl p-4 mb-6">
            <img
              src={selectedSong.song_thumbnail}
              alt=""
              className="w-12 h-12 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">
                {selectedSong.song_title}
              </p>
              <p className="text-sm text-gray-400 truncate">
                {selectedSong.song_artist}
              </p>
            </div>
          </div>

          {/* Dedication (optional) */}
          <div className="mb-4">
            <p className="text-gray-400 text-sm mb-3">
              Want to dedicate this song?{" "}
              <span className="text-gray-600">(optional)</span>
            </p>

            <select
              value={dedicateTo}
              onChange={(e) => setDedicateTo(e.target.value)}
              className="w-full bg-[#252B3B] border border-[#3A4155] rounded-xl px-4 py-3 text-white mb-3 focus:outline-none focus:border-brand-500"
            >
              <option value="">Select someone...</option>
              {publicUsers
                .filter((u) => u.alias !== alias)
                .map((u) => (
                  <option key={u.alias} value={u.alias}>
                    {u.emoji} {u.alias}
                  </option>
                ))}
            </select>

            {dedicateTo && (
              <input
                type="text"
                placeholder="Add a message... (optional)"
                maxLength={100}
                value={dedicationMsg}
                onChange={(e) => setDedicationMsg(e.target.value)}
                className="w-full bg-[#252B3B] border border-[#3A4155] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 placeholder:text-gray-600"
              />
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          <div className="border-t border-[#252B3B] pt-4 flex gap-3">
            <button
              onClick={() => { setScreen("main"); setSelectedSong(null); }}
              className="flex-1 bg-[#252B3B] text-white py-4 rounded-xl font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => { void handleAddSong(); }}
              disabled={adding}
              className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-4 rounded-xl font-bold"
            >
              {adding
                ? "Adding..."
                : `Add to Queue ${formatPrice(pricePerSong)}`}
            </button>
          </div>
          <p className="text-center text-gray-600 text-xs mt-3">
            Amount will be added to your bill
          </p>
        </div>
      </div>
    );
  }

  // Search screen
  if (screen === "search") {
    return (
      <SongSearch
        tenant_id={tenant_id}
        branch_id={branch_id}
        onSelect={(song) => {
          setSelectedSong(song);
          setScreen("dedication");
        }}
        onClose={() => setScreen("main")}
      />
    );
  }

  // Main panel
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-[#1A1F2E] rounded-t-3xl p-6 animate-slide-up max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-white text-xl">🎵 Jukebox</h3>
            <p className="text-gray-400 text-sm">
              {formatPrice(pricePerSong)} per song
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Now Playing */}
        {nowPlaying && (
          <div className="bg-[#252B3B] rounded-2xl p-4 mb-6 border border-brand-500/30">
            <p className="text-xs text-brand-500 font-semibold uppercase tracking-widest mb-3">
              Now Playing
            </p>
            <div className="flex items-center gap-3">
              <img
                src={nowPlaying.song_thumbnail}
                alt=""
                className="w-14 h-14 rounded-xl object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white truncate">
                  {nowPlaying.song_title}
                </p>
                <p className="text-sm text-gray-400 truncate">
                  {nowPlaying.song_artist}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  🎧 {nowPlaying.requested_by_alias}
                  {nowPlaying.dedicated_to_alias &&
                    ` 💝 To ${nowPlaying.dedicated_to_alias}`}
                </p>
              </div>
              <span className="text-2xl animate-pulse">🎵</span>
            </div>
          </div>
        )}

        {/* Queue */}
        {queue.length > 0 && (
          <div className="mb-6">
            <p className="text-sm text-gray-500 font-semibold mb-3">
              Up Next ({queue.length})
            </p>
            <div className="space-y-2">
              {queue.slice(0, 5).map((item: QueueItem) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-[#252B3B] rounded-xl p-3"
                >
                  <span className="text-brand-500 font-bold text-sm w-6 text-center">
                    #{item.position}
                  </span>
                  <img
                    src={item.song_thumbnail}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {item.song_title}
                    </p>
                    <p className="text-xs text-gray-500">
                      by {item.requested_by_alias} &bull;{" "}
                      {formatWait(item.estimated_wait_mins)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!nowPlaying && queue.length === 0 && (
          <div className="text-center py-6 text-gray-500 mb-6">
            <div className="text-4xl mb-2">🎵</div>
            <p>No songs playing right now</p>
            <p className="text-sm">Be the first to add one!</p>
          </div>
        )}

        {/* Add Song button */}
        <button
          onClick={() => setScreen("search")}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-4 rounded-2xl text-lg flex items-center justify-center gap-2"
        >
          <span>+</span>
          <span>Add a Song</span>
          <span className="text-white/70 text-base font-normal">
            {formatPrice(pricePerSong)}
          </span>
        </button>
      </div>
    </div>
  );
}
