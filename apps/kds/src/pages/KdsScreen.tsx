import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { KdsConfig, Kot, KotItem } from '../types';
import { clearConfig } from '../lib/storage';
import { playNewKot, playOverdue, playAllClear } from '../lib/audio';

interface KdsScreenProps {
  config: KdsConfig;
  onReset: () => void;
}

function getElapsedMins(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function getCardStyle(createdAt: string, targetMins: number): string {
  const elapsed = getElapsedMins(createdAt);
  if (elapsed < targetMins * 0.7) return 'bg-[#1A1F2E]';
  if (elapsed < targetMins) return 'bg-[#1E3A5F]';
  if (elapsed < targetMins * 1.5) return 'bg-[#3D2B00]';
  return 'bg-[#3D0000] animate-pulse';
}

function getElapsedLabel(createdAt: string): string {
  const mins = getElapsedMins(createdAt);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

interface KotCardProps {
  kot: Kot;
  targetMins: number;
  onStatusChange: (kotId: string, status: Kot['status']) => void;
  onItemStatusChange: (kotId: string, itemId: string, status: KotItem['status']) => void;
  onServed: (kotId: string) => void;
  deviceToken: string;
  tenantId: string;
}

function KotCard({
  kot,
  targetMins,
  onStatusChange,
  onItemStatusChange,
  onServed,
  deviceToken,
  tenantId
}: KotCardProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = getElapsedMins(kot.created_at);
  const isOverdue = elapsed >= targetMins * 1.5;
  const cardStyle = getCardStyle(kot.created_at, targetMins);
  const allItemsReady = kot.items.every(i => i.status === 'ready' || i.status === 'served');
  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';

  const patchStatus = async (status: Kot['status']) => {
    try {
      const res = await fetch(`${orderServiceUrl}/api/v1/kots/${tenantId}/${kot.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        if (status === 'served') {
          onServed(kot.id);
        } else {
          onStatusChange(kot.id, status);
        }
      }
    } catch {
      // Network error — swallow silently
    }
  };

  const patchItemStatus = (itemId: string, status: KotItem['status']) => {
    onItemStatusChange(kot.id, itemId, status);
  };

  return (
    <div
      className={`${cardStyle} rounded-xl border border-gray-700 p-4 flex flex-col gap-3 transition-all duration-300`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="font-bold text-white text-lg font-mono">{kot.kot_number}</div>
          {kot.table_name && (
            <div className="text-gray-300 text-sm">{kot.table_name}</div>
          )}
          <div className="text-xs text-gray-400 capitalize">{(kot.order_type ?? 'dine_in').replace(/_/g, ' ')}</div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-medium ${isOverdue ? 'text-red-400' : elapsed >= targetMins ? 'text-yellow-400' : 'text-gray-400'}`}>
            {getElapsedLabel(kot.created_at)}
          </div>
          <div className="text-xs text-gray-500 mt-1 capitalize">{kot.status}</div>
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1">
        {kot.items.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              const nextStatus: KotItem['status'] =
                item.status === 'pending' ? 'preparing' :
                item.status === 'preparing' ? 'ready' : 'served';
              patchItemStatus(item.id, nextStatus);
            }}
            className={`flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
              item.status === 'ready' || item.status === 'served'
                ? 'bg-green-900/30 border border-green-700/50 line-through text-gray-500'
                : item.status === 'preparing'
                ? 'bg-blue-900/30 border border-blue-700/50 text-white'
                : 'bg-white/5 border border-gray-700 text-white hover:bg-white/10'
            }`}
          >
            <span className="text-sm font-medium w-6 text-center">{item.quantity}×</span>
            <span className="text-sm flex-1">{item.name}</span>
            <span className="text-xs text-gray-400 capitalize">{item.status}</span>
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto">
        {kot.status === 'pending' && (
          <button
            onClick={() => { void patchStatus('acknowledged'); }}
            className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            ACKNOWLEDGE
          </button>
        )}
        {(kot.status === 'acknowledged' || kot.status === 'preparing') && allItemsReady && (
          <button
            onClick={() => { void patchStatus('ready'); }}
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            ALL READY
          </button>
        )}
        {kot.status === 'ready' && (
          <button
            onClick={() => { void patchStatus('served'); }}
            className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            SERVED
          </button>
        )}
        {(kot.status === 'acknowledged' || kot.status === 'preparing') && !allItemsReady && (
          <div className="flex-1 py-2 bg-white/5 text-gray-500 text-sm text-center rounded-lg">
            Mark items ready
          </div>
        )}
      </div>
    </div>
  );
}

export default function KdsScreen({ config, onReset }: KdsScreenProps) {
  const [kots, setKots] = useState<Kot[]>([]);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [targetMins, setTargetMins] = useState(15);
  const [showSettings, setShowSettings] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';
  const realtimeUrl = import.meta.env.VITE_REALTIME_SERVICE_URL ?? 'http://localhost:3008';

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch active KOTs
  useEffect(() => {
    const fetchKots = async () => {
      try {
        const res = await fetch(
          `${orderServiceUrl}/api/v1/kots/${config.tenant_id}/${config.branch_id}?status=pending,acknowledged,preparing,ready`,
          { headers: { Authorization: `Bearer ${config.device_token}` } }
        );
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; data?: { kots: Kot[] } };
          if (data.success && data.data?.kots) setKots(data.data.kots);
        }
      } catch {
        // API not available yet
      }
    };
    void fetchKots();
  }, [config, orderServiceUrl]);

  // Socket.io
  useEffect(() => {
    const socket: Socket = io(realtimeUrl, {
      auth: { token: config.device_token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000
    });

    socket.on('connect', () => {
      setConnected(true);
      // Auto-join happens server-side via KDS JWT. Emit join:room as fallback.
      socket.emit('join:room', { room: `kitchen:${config.tenant_id}:${config.branch_id}:${config.station}` });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('reconnect', () => setConnected(true));

    socket.on('kot:created', (kot: Kot) => {
      setKots(prev => {
        if (prev.find(k => k.id === kot.id)) return prev;
        if (soundEnabled) playNewKot();
        return [kot, ...prev];
      });
    });

    socket.on('kot:status:changed', (data: { id: string; status: Kot['status'] }) => {
      setKots(prev => prev.map(k => k.id === data.id ? { ...k, status: data.status } : k));
    });

    return () => { socket.disconnect(); };
  }, [config, realtimeUrl, soundEnabled]);

  // Overdue check
  useEffect(() => {
    const interval = setInterval(() => {
      kots.forEach(kot => {
        const elapsed = getElapsedMins(kot.created_at);
        if (elapsed >= targetMins * 1.5 && soundEnabled && kot.status !== 'ready') {
          playOverdue();
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [kots, targetMins, soundEnabled]);

  // All clear sound
  const prevKotsLengthRef = { current: kots.length };
  useEffect(() => {
    if (prevKotsLengthRef.current > 0 && kots.length === 0 && soundEnabled) {
      playAllClear();
    }
    prevKotsLengthRef.current = kots.length;
  }, [kots.length, soundEnabled]);

  const handleStatusChange = useCallback((kotId: string, status: Kot['status']) => {
    setKots(prev => prev.map(k => k.id === kotId ? { ...k, status } : k));
  }, []);

  const handleItemStatusChange = useCallback((kotId: string, itemId: string, status: KotItem['status']) => {
    setKots(prev => prev.map(k =>
      k.id === kotId
        ? { ...k, items: k.items.map(i => i.id === itemId ? { ...i, status } : i) }
        : k
    ));
  }, []);

  const handleServed = useCallback((kotId: string) => {
    setKots(prev => prev.filter(k => k.id !== kotId));
  }, []);

  const handleReset = () => {
    clearConfig();
    onReset();
  };

  const activeKots = kots.filter(k => k.status !== 'served');

  return (
    <div className="min-h-screen bg-[#0F1117] flex flex-col">
      {/* Header */}
      <header className="h-10 bg-gray-900 flex items-center justify-between px-4 border-b border-gray-800 shrink-0">
        <div className="text-sm text-gray-300">
          {config.business_name ?? 'Kitchen'}{config.branch_name ? ` • ${config.branch_name}` : ''}
        </div>
        <div className="text-sm font-mono text-white">
          {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 capitalize">{config.station} KDS</span>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} title={connected ? 'Connected' : 'Disconnected'} />
        </div>
      </header>

      {/* KOT Grid */}
      <main className="flex-1 overflow-auto p-4">
        {activeKots.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-5xl mb-4">🎉</div>
              <div className="text-xl font-semibold text-gray-300">All clear!</div>
              <div className="text-gray-500 mt-2">No active KOTs</div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {activeKots.map(kot => (
              <KotCard
                key={kot.id}
                kot={kot}
                targetMins={targetMins}
                onStatusChange={handleStatusChange}
                onItemStatusChange={handleItemStatusChange}
                onServed={handleServed}
                deviceToken={config.device_token}
                tenantId={config.tenant_id}
              />
            ))}
          </div>
        )}
      </main>

      {/* Gear icon (long press 3s to open settings) */}
      <button
        className="fixed bottom-4 right-4 w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-gray-400 hover:text-white"
        onMouseDown={() => {
          const t = setTimeout(() => setShowSettings(true), 3000);
          setLongPressTimer(t);
        }}
        onMouseUp={() => { if (longPressTimer) clearTimeout(longPressTimer); }}
        onMouseLeave={() => { if (longPressTimer) clearTimeout(longPressTimer); }}
        onTouchStart={() => {
          const t = setTimeout(() => setShowSettings(true), 3000);
          setLongPressTimer(t);
        }}
        onTouchEnd={() => { if (longPressTimer) clearTimeout(longPressTimer); }}
        title="Hold 3s for settings"
      >
        ⚙️
      </button>

      {/* Settings overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1A1F2E] rounded-2xl p-6 w-80 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">KDS Settings</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-sm">Sound alerts</span>
                <button
                  onClick={() => setSoundEnabled(s => !s)}
                  className={`w-12 h-6 rounded-full transition-colors ${soundEnabled ? 'bg-brand-500' : 'bg-gray-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${soundEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div>
                <label className="text-gray-300 text-sm block mb-1">Target time (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={targetMins}
                  onChange={(e) => setTargetMins(Number(e.target.value))}
                  className="w-full bg-[#0F1117] border border-gray-700 rounded-lg p-2 text-white text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { window.location.reload(); }}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
                >
                  Reload
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg"
                >
                  Reset Device
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="mt-4 w-full py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
