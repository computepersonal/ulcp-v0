import { useState, Component } from 'react';
import type { ReactNode } from 'react';
import { getConfig, setConfig } from './lib/storage';
import SetupScreen from './pages/SetupScreen';
import KdsScreen from './pages/KdsScreen';
import type { KdsConfig } from './types';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <div className="text-lg font-semibold text-white mb-2">KDS encountered an error</div>
            <div className="text-sm text-gray-400 font-mono bg-gray-900 rounded-lg p-3 mb-4 text-left break-all">
              {this.state.error.message}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold"
            >
              Reload KDS
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    return (
      <ErrorBoundary>
        <SetupScreen onSetupComplete={handleSetup} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <KdsScreen config={config} onReset={handleReset} />
    </ErrorBoundary>
  );
}
