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

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: string; color: string }> = {
  pending:   { label: 'Placed', icon: '📋', color: 'bg-gray-500' },
  confirmed: { label: 'Confirmed', icon: '✅', color: 'bg-blue-500' },
  preparing: { label: 'Preparing', icon: '👨‍🍳', color: 'bg-orange-500' },
  ready:     { label: 'Ready!', icon: '🔔', color: 'bg-green-500' },
  served:    { label: 'Served', icon: '🍽', color: 'bg-green-600' },
  delivered: { label: 'Delivered', icon: '📦', color: 'bg-green-600' },
};

function progressWidth(status: OrderStatus): string {
  switch (status) {
    case 'pending': return '20%';
    case 'confirmed': return '40%';
    case 'preparing': return '60%';
    case 'ready': return '85%';
    default: return '100%';
  }
}

export default function FloatingOrderTracker() {
  const navigate = useNavigate();
  const auth = useAppSelector(s => s.auth);
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [expanded, setExpanded] = useState(false);
  const realtimeUrl = import.meta.env.VITE_REALTIME_SERVICE_URL ?? 'http://localhost:3008';
  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';

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
          className="w-full rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
        >
          <div className="h-1 bg-gray-100 w-full">
            <div className={`h-full ${config.color} transition-all duration-700`} style={{ width: progressWidth(order.status) }} />
          </div>
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${config.color} flex items-center justify-center text-lg shrink-0`}>
              {config.icon}
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {config.label}{order.status === 'preparing' ? '...' : ''}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {order.place_name} · Tap to track
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
                className="w-full rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
              >
                <div className="h-1 bg-gray-100 w-full">
                  <div className={`h-full ${config.color} transition-all duration-700`} style={{ width: progressWidth(order.status) }} />
                </div>
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${config.color} flex items-center justify-center text-base shrink-0`}>
                    {config.icon}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {config.label}{order.status === 'preparing' ? '...' : ''}
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
