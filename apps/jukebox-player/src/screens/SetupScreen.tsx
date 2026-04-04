import { useState } from "react";
import { pairPlayer } from "../api";

interface Props {
  onPaired: (config: {
    player_token: string;
    tenant_id: string;
    branch_id: string;
  }) => void;
}

export default function SetupScreen({ onPaired }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const result = await pairPlayer(code);
      onPaired({
        player_token: result.player_token,
        tenant_id: result.tenant_id,
        branch_id: result.branch_id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full h-full bg-[#0F1117] flex items-center justify-center">
      <div className="bg-[#1A1F2E] rounded-2xl p-10 w-[420px] border border-[#252B3B] shadow-2xl">
        {/* Icon */}
        <div className="text-center mb-8">
          <div className="text-7xl mb-4">🎵</div>
          <h1 className="text-2xl font-bold text-white">Jukebox Player Setup</h1>
          <p className="text-gray-400 text-sm mt-2">
            Enter the 6-digit code from your Staff POS Settings
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full bg-[#0F1117] border border-[#252B3B] rounded-xl px-6 py-5 text-center text-4xl font-mono text-white tracking-[0.5em] focus:outline-none focus:border-brand-500 placeholder:text-gray-700 transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={code.length !== 6 || loading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-colors text-lg"
          >
            {loading ? "Connecting..." : "Connect Player"}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-6">
          Staff POS → Settings → 🎵 Jukebox → Generate Setup Code
        </p>
      </div>
    </div>
  );
}
