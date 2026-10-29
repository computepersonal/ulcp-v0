import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAppSelector } from '../hooks/redux';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'delivered';

interface OrderData {
  id: string;
  order_number?: string;
  status: OrderStatus;
  table_name?: string;
  items?: Array<{ name: string; quantity: number; status: string }>;
  total?: number;
}

const STEPS: Array<{ status: OrderStatus; label: string; icon: string }> = [
  { status: 'pending', label: 'Order Placed', icon: '📋' },
  { status: 'confirmed', label: 'Confirmed', icon: '✅' },
  { status: 'preparing', label: 'Being Prepared', icon: '👨‍🍳' },
  { status: 'ready', label: 'Ready', icon: '🔔' },
  { status: 'served', label: 'Served', icon: '🍽' }
];

function getStepIndex(status: OrderStatus): number {
  return STEPS.findIndex(s => s.status === status);
}

export default function OrderTracking() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const auth = useAppSelector(s => s.auth);
  const realtimeUrl = import.meta.env.VITE_REALTIME_SERVICE_URL ?? '';
  const isAtPlace = !!slug;

  // tenant_id for this place comes from the places this customer has visited
  const savedPlaces = (() => {
    try { return JSON.parse(localStorage.getItem('saved_places') ?? '[]') as Array<{ slug: string; tenantId: string }>; }
    catch { return []; }
  })();
  const tenantId = savedPlaces.find(p => p.slug === slug)?.tenantId;


  const [order, setOrder] = useState<OrderData>({
    id: id ?? '',
    status: 'pending',
    order_number: id?.startsWith('ORD-') ? id : undefined
  });
  const [connected, setConnected] = useState(false);
  const [showExitSheet, setShowExitSheet] = useState(false);
  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? '';

  // Fetch current order state on mount — ensures status is correct on navigate-back
  useEffect(() => {
    if (!id || !tenantId || !auth.token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${orderServiceUrl}/api/v1/orders/customer/${tenantId}/${id}`, {
          headers: { Authorization: `Bearer ${auth.token}` }
        });
        if (!res.ok) return;
        const body = (await res.json()) as { success: boolean; data?: { order?: Partial<OrderData> } };
        if (cancelled || !body.success || !body.data?.order) return;
        const o = body.data.order;
        setOrder(prev => ({
          ...prev,
          status: (o.status as OrderStatus) ?? prev.status,
          order_number: o.order_number ?? prev.order_number,
          table_name: o.table_name ?? prev.table_name,
          total: o.total ?? prev.total,
        }));
      } catch { /* ignore — socket will catch up */ }
    })();
    return () => { cancelled = true; };
  }, [id, tenantId, auth.token, orderServiceUrl]);

  // Socket.io for live updates
  useEffect(() => {
    if (!id) return;

    const socket = io(realtimeUrl, {
      auth: { token: auth.token ?? '' },
      transports: ['websocket'],
      reconnection: true
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join:room', { room: `order:${id}` });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('reconnect', () => setConnected(true));

    socket.on('order:status:changed', (data: { order_id?: string; id?: string; status: OrderStatus }) => {
      const eventOrderId = data.order_id ?? data.id;
      if (eventOrderId === id) {
        setOrder(prev => ({ ...prev, status: data.status }));
        // Clear from active orders when served/delivered
        if (data.status === 'served' || data.status === 'delivered') {
          try {
            const orders = JSON.parse(localStorage.getItem('active_orders') ?? '[]') as Array<{ id: string }>;
            const filtered = orders.filter(o => o.id !== id);
            localStorage.setItem('active_orders', JSON.stringify(filtered));
            window.dispatchEvent(new Event('active_orders:changed'));
          } catch { /* ignore */ }
        }
      }
    });

    return () => { socket.disconnect(); };
  }, [id, auth.token, realtimeUrl]);

  const currentStepIndex = getStepIndex(order.status);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => (isAtPlace ? setShowExitSheet(true) : navigate('/'))}
            className="text-gray-600 text-xl"
          >
            ✕
          </button>
          <h1 className="font-bold text-gray-900">Order Tracking</h1>
          <div className={`ml-auto w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} title={connected ? 'Live' : 'Connecting...'} />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Order number */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 text-center">
          <div className="text-3xl mb-2">
            {order.status === 'preparing' ? '👨‍🍳' : order.status === 'ready' ? '🔔' : order.status === 'served' ? '✅' : '📋'}
          </div>
          <div className="font-bold text-gray-900 text-lg">
            {order.order_number ?? `Order #${id?.slice(-6)}`}
          </div>
          {order.table_name && (
            <div className="text-sm text-gray-500 mt-1">{order.table_name}</div>
          )}
        </div>

        {/* Status timeline */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Order Status</h3>
          <div className="space-y-0">
            {STEPS.map((step, idx) => {
              const isDone = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const isPending = idx > currentStepIndex;

              return (
                <div key={step.status} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                      isDone ? 'bg-green-500 text-white' :
                      isCurrent ? 'bg-brand-500 text-white ring-4 ring-brand-100' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {isDone ? '✓' : step.icon}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className={`w-0.5 h-8 ${isDone ? 'bg-green-500' : 'bg-gray-100'}`} />
                    )}
                  </div>
                  <div className="pb-4 flex-1">
                    <div className={`font-medium text-sm ${
                      isCurrent ? 'text-brand-600' :
                      isDone ? 'text-green-600' :
                      isPending ? 'text-gray-400' :
                      'text-gray-700'
                    }`}>
                      {step.label}
                      {isCurrent && <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-brand-500 animate-pulse" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order items */}
        {order.items && order.items.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3">Items</h3>
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    item.status === 'ready' ? 'bg-green-500 text-white' :
                    item.status === 'preparing' ? 'bg-blue-500 text-white' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {item.quantity}
                  </span>
                  <span className="text-gray-700 flex-1">{item.name}</span>
                  <span className={`text-xs capitalize ${
                    item.status === 'ready' ? 'text-green-500' :
                    item.status === 'preparing' ? 'text-blue-500' :
                    'text-gray-400'
                  }`}>{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        {isAtPlace ? (
          <div className="space-y-2">
            <button
              onClick={() => navigate(`/place/${slug}`)}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-2xl transition-colors"
            >
              ← Back to Menu
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-2xl transition-colors text-sm"
            >
              Go Home
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-2xl transition-colors"
          >
            Back to Home
          </button>
        )}
      </div>

      {/* Exit bottom sheet — suggests better destinations than bouncing to home */}
      {showExitSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setShowExitSheet(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="font-bold text-gray-900 text-lg mb-1">Where to next?</div>
            <div className="text-sm text-gray-500 mb-4">
              We'll keep tracking your order in the background — tap the pill anytime to come back.
            </div>

            <button
              onClick={() => { setShowExitSheet(false); navigate(`/place/${slug}`); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors text-left mb-2"
            >
              <div className="text-2xl">📖</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">Back to Menu</div>
                <div className="text-xs text-gray-500">Add more items to your order</div>
              </div>
              <div className="text-gray-400">→</div>
            </button>

            <button
              onClick={() => setShowExitSheet(false)}
              className="w-full mt-4 py-2.5 text-gray-500 text-sm font-medium"
            >
              Stay on tracking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
