import { useState, useEffect } from "react";
import SetupScreen from "./screens/SetupScreen";
import PlayerScreen from "./screens/PlayerScreen";

interface StoredConfig {
  player_token: string;
  tenant_id: string;
  branch_id: string;
}

export default function App() {
  const [config, setConfig] = useState<StoredConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("jukebox_player_config");
    if (stored) {
      try {
        setConfig(JSON.parse(stored) as StoredConfig);
      } catch {
        localStorage.removeItem("jukebox_player_config");
      }
    }
    setReady(true);
  }, []);

  function handlePaired(c: StoredConfig) {
    localStorage.setItem("jukebox_player_config", JSON.stringify(c));
    setConfig(c);
  }

  function handleUnpair() {
    localStorage.removeItem("jukebox_player_config");
    setConfig(null);
  }

  if (!ready) {
    return (
      <div className="w-full h-full bg-[#0F1117] flex items-center justify-center">
        <div className="text-4xl animate-pulse-glow">🎵</div>
      </div>
    );
  }

  if (!config) {
    return <SetupScreen onPaired={handlePaired} />;
  }

  return (
    <PlayerScreen
      tenant_id={config.tenant_id}
      branch_id={config.branch_id}
      player_token={config.player_token}
      onUnpair={handleUnpair}
    />
  );
}
