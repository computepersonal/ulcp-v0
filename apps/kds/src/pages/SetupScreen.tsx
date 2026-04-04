import { useState, useRef, useEffect } from 'react';
import type { KdsConfig } from '../types';

interface SetupScreenProps {
  onSetupComplete: (config: KdsConfig) => void;
}

export default function SetupScreen({ onSetupComplete }: SetupScreenProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setError('');

    try {
      const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
      const res = await fetch(`${tenantServiceUrl}/api/v1/tenants/kds/verify-setup-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = (await res.json()) as {
        success: boolean;
        data?: KdsConfig;
        error?: string;
      };

      if (!res.ok || !data.success || !data.data) {
        setError('Invalid or expired code. Please get a new code from your manager.');
        return;
      }

      onSetupComplete(data.data);
    } catch {
      setError('Invalid or expired code. Please get a new code from your manager.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="bg-[#1A1F2E] rounded-2xl p-8 w-full max-w-md shadow-2xl border border-gray-800">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-brand-500 mb-2">ULCP</div>
          <h1 className="text-xl font-semibold text-white">Kitchen Display Setup</h1>
          <p className="text-gray-400 text-sm mt-2">Enter the 6-digit setup code from your manager</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className="mb-6">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setCode(val);
                setError('');
              }}
              className="w-full text-center text-4xl font-mono tracking-widest bg-[#0F1117] border-2 border-gray-700 focus:border-brand-500 rounded-xl p-4 text-white outline-none transition-colors"
              placeholder="000000"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={code.length !== 6 || loading}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
