import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAppSelector } from '../hooks/redux';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'delivered';

interface ActiveOrder {
  id: string;
  slug: string;
  place_name: string;
  status: OrderStatus;
  placed_at: string;
  items_count?: number;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: string; color: string; ring: string; text: string }> = {
  pending:   { label: 'Order Placed',      icon: '📋', color: 'bg-gray-500',   ring: '#9ca3af', text: 'text-gray-600' },
  confirmed: { label: 'Order Confirmed',   icon: '✅', color: 'bg-blue-500',   ring: '#3b82f6', text: 'text-blue-600' },
  preparing: { label: 'Order In Progress', icon: '👨‍🍳', color: 'bg-amber-500', ring: '#f59e0b', text: 'text-amber-600' },
  ready:     { label: 'Order Ready',       icon: '🔔', color: 'bg-green-500',  ring: '#10b981', text: 'text-green-600' },
  served:    { label: 'Order Served',      icon: '🍽', color: 'bg-green-600',  ring: '#059669', text: 'text-green-700' },
  delivered: { label: 'Order Delivered',   icon: '📦', color: 'bg-green-600',  ring: '#059669', text: 'text-green-700' },
};

function progressPct(status: OrderStatus): number {
  switch (status) {
    case 'pending':   return 20;
    case 'confirmed': return 40;
    case 'preparing': return 60;
    case 'ready':     return 85;
    default:          return 100;
  }
}

// Circular progress ring — shows % inside an arc
function ProgressRing({ pct, color, size = 44 }: { pct: number; color: string; size?: number }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f3f4f6" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-gray-700">
        {pct}%
      </div>
    </div>
  );
}

export default function FloatingOrderTracker() {
  const navigate = useNavigate();
  const auth = useAppSelector(s => s.auth);
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [expanded, setExpanded] = useState(false);
  const realtimeUrl = import.meta.env.VITE_REALTIME_SERVICE_URL ?? '';
  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? '';

  // Terminal states — order is done; pill should disappear
  const isTerminal = (s: string): boolean =>
    s === 'served' || s === 'delivered' || s === 'completed' || s === 'cancelled';

  // Load active orders from localStorage, then reconcile with backend on mount
  useEffect(() => {
    let cancelled = false;

    const raw = (() => { try { return localStorage.getItem('active_orders'); } catch { return null; } })();
    if (!raw) return;

    let parsed: ActiveOrder[] = [];
    try { parsed = JSON.parse(raw) as ActiveOrder[]; } catch { return; }

    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const localValid = parsed.filter(o => {
      const age = Date.now() - new Date(o.placed_at).getTime();
      return age < TWO_HOURS && !isTerminal(o.status);
    });
    if (localValid.length !== parsed.length) {
      localStorage.setItem('active_orders', JSON.stringify(localValid));
      window.dispatchEvent(new Event('active_orders:changed'));
    }
    setOrders(localValid);

    // Saved places map slug → tenantId for backend fetch
    const savedPlaces = (() => {
      try { return JSON.parse(localStorage.getItem('saved_places') ?? '[]') as Array<{ slug: string; tenantId: string }>; }
      catch { return []; }
    })();
    const slugToTenant = new Map(savedPlaces.map(p => [p.slug, p.tenantId]));

    if (!auth.token || localValid.length === 0) return;

    (async () => {
      const results = await Promise.all(
        localValid.map(async (o) => {
          const tenantId = slugToTenant.get(o.slug);
          if (!tenantId) return o;
          try {
            const res = await fetch(`${orderServiceUrl}/api/v1/orders/customer/${tenantId}/${o.id}`, {
              headers: { Authorization: `Bearer ${auth.token}` }
            });
            if (!res.ok) return o;
            const body = (await res.json()) as { success: boolean; data?: { order?: { status?: string } } };
            const serverStatus = body.data?.order?.status;
            if (!serverStatus) return o;
            return { ...o, status: serverStatus as OrderStatus };
          } catch { return o; }
        })
      );
      if (cancelled) return;

      const stillActive = results.filter(o => !isTerminal(o.status));
      localStorage.setItem('active_orders', JSON.stringify(stillActive));
      window.dispatchEvent(new Event('active_orders:changed'));
      setOrders(stillActive);
    })();

    return () => { cancelled = true; };
  }, [auth.token, orderServiceUrl]);

  // Listen for status updates via Socket.io
  useEffect(() => {
    if (orders.length === 0) return;

    let socket: Socket | null = null;
    try {
      socket = io(realtimeUrl, {
        auth: { token: auth.token ?? '' },
        transports: ['websocket'],
        reconnection: true,
      });

      socket.on('connect', () => {
        orders.forEach(o => socket?.emit('join:room', { room: `order:${o.id}` }));
      });

      socket.on('order:status:changed', (data: { order_id?: string; id?: string; status: OrderStatus }) => {
        const eventOrderId = data.order_id ?? data.id;
        if (!eventOrderId) return;

        setOrders(prev => {
          const updated = isTerminal(data.status)
            ? prev.filter(o => o.id !== eventOrderId)
            : prev.map(o => o.id === eventOrderId ? { ...o, status: data.status } : o);
          localStorage.setItem('active_orders', JSON.stringify(updated));
          window.dispatchEvent(new Event('active_orders:changed'));
          return updated;
        });
      });
    } catch { /* ignore */ }

    return () => { socket?.disconnect(); };
  }, [orders.length, auth.token, realtimeUrl]);

  if (orders.length === 0) return null;

  // Single order — simple pill
  if (orders.length === 1) {
    const order = orders[0]!;
    const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;

    return (
      <div className="fixed bottom-16 left-4 right-4 z-50">
        <button
          onClick={() => navigate(`/place/${order.slug}/order/${order.id}`)}
          className="w-full rounded-2xl shadow-lg border border-gray-100 overflow-hidden bg-white"
        >
          <div className="px-4 py-3 flex items-center gap-3">
            <ProgressRing pct={progressPct(order.status)} color={config.ring} />
            <div className="flex-1 text-left min-w-0">
              <div className={`text-sm font-semibold truncate flex items-center gap-1 ${config.text}`}>
                {config.label}
                {order.status === 'preparing' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {order.place_name}{order.items_count ? ` · ${order.items_count} items` : ' · Tap to track'}
              </div>
            </div>
            <div className="text-brand-500 text-sm font-medium shrink-0">View →</div>
          </div>
        </button>
      </div>
    );
  }

  // Multiple orders — expandable stack
  return (
    <div className="fixed bottom-16 left-4 right-4 z-50">
      {/* Expanded list */}
      {expanded && (
        <div className="mb-2 space-y-2">
          {orders.map(order => {
            const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
            return (
              <button
                key={order.id}
                onClick={() => navigate(`/place/${order.slug}/order/${order.id}`)}
                className="w-full rounded-2xl shadow-lg border border-gray-100 overflow-hidden bg-white"
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <ProgressRing pct={progressPct(order.status)} color={config.ring} size={40} />
                  <div className="flex-1 text-left min-w-0">
                    <div className={`text-sm font-semibold truncate flex items-center gap-1 ${config.text}`}>
                      {config.label}
                      {order.status === 'preparing' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {order.place_name}{order.items_count ? ` · ${order.items_count} items` : ''}
                    </div>
                  </div>
                  <div className="text-brand-500 text-xs font-medium shrink-0">Track →</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Summary pill — tap to expand/collapse */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full rounded-2xl shadow-lg border border-gray-100 overflow-hidden bg-white"
      >
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Stacked status icons */}
          <div className="flex -space-x-2 shrink-0">
            {orders.slice(0, 3).map(order => {
              const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
              return (
                <div
                  key={order.id}
                  className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center text-sm border-2 border-white`}
                >
                  {config.icon}
                </div>
              );
            })}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-semibold text-gray-900">
              {orders.length} Active Orders
            </div>
            <div className="text-xs text-gray-500">Tap to {expanded ? 'collapse' : 'view all'}</div>
          </div>
          <div className="text-gray-400 text-lg shrink-0">
            {expanded ? '▼' : '▲'}
          </div>
        </div>
      </button>
    </div>
  );
}
