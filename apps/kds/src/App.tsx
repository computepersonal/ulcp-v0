import { useState } from 'react';
import { getConfig, setConfig } from './lib/storage';
import SetupScreen from './pages/SetupScreen';
import KdsScreen from './pages/KdsScreen';
import type { KdsConfig } from './types';

export default function App() {
  const [config, setConfigState] = useState<KdsConfig | null>(getConfig);

  const handleSetup = (c: KdsConfig) => {
    setConfig(c);
    setConfigState(c);
  };

  const handleReset = () => {
    setConfigState(null);
  };

  if (!config) {
    return <SetupScreen onSetupComplete={handleSetup} />;
  }

  return <KdsScreen config={config} onReset={handleReset} />;
}
