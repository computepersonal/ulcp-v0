import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';
import { useSocket } from '../hooks/useSocket';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready';
type PaymentMethod = 'cash' | 'upi' | 'card';

interface KotItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  variant_name?: string;
  station?: string;
}

interface Kot {
  id: string;
  kot_number: string;
  status: string;
  items: KotItem[];
}

interface OrderDetail {
  id: string;
  order_number: string;
  table_id?: string;
  table_name?: string;
  type: string;
  status: OrderStatus;
  subtotal: number;
  tax_amount: number;
  gst_amount: number;
  discount_amount: number;
  total: number;
  created_at: string;
  kots: Kot[];
  status_history?: Array<{ status: string; created_at: string }>;
}

interface OrderData {
  id: string;
  order_number: string;
  table_id?: string;
  table_name?: string;
  type?: string;
  item_count: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  kots?: Kot[];
}

const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];
const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready'
};
const STATUS_NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: null
};
const STATUS_NEXT_LABEL: Record<OrderStatus, string> = {
  pending: 'Accept',
  confirmed: 'Start Preparing',
  preparing: 'Mark Ready',
  ready: ''
};
const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'border-l-yellow-500',
  confirmed: 'border-l-blue-500',
  preparing: 'border-l-orange-500',
  ready: 'border-l-green-500'
};
const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-orange-50 text-orange-700 border-orange-200',
  ready: 'bg-green-50 text-green-700 border-green-200'
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: '💵' },
  { value: 'upi', label: 'UPI', icon: '📱' },
  { value: 'card', label: 'Card', icon: '💳' },
];

function getElapsed(since: string): string {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  return `${mins}m ago`;
}

function fmt(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}

export default function Orders() {
  const navigate = useNavigate();
  const auth = useAppSelector((s) => s.auth);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Checkout state
  const [checkoutOrder, setCheckoutOrder] = useState<OrderDetail | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';
  const socketRef = useSocket();

  // Real-time socket listeners
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onOrderNew = (data: { order?: OrderData }) => {
      if (!data.order) return;
      setOrders(prev => {
        if (prev.find(o => o.id === data.order!.id)) return prev;
        return [data.order!, ...prev];
      });
    };

    const onStatusChanged = (data: { order_id?: string; status?: string }) => {
      if (!data.order_id || !data.status) return;
      if (['cancelled', 'completed'].includes(data.status)) {
        setOrders(prev => prev.filter(o => o.id !== data.order_id));
        setSelectedOrder(prev => prev?.id === data.order_id ? null : prev);
        setCheckoutOrder(prev => prev?.id === data.order_id ? null : prev);
      } else if (['pending', 'confirmed', 'preparing', 'ready'].includes(data.status)) {
        setOrders(prev => prev.map(o =>
          o.id === data.order_id ? { ...o, status: data.status as OrderStatus } : o
        ));
      }
    };

    socket.on('order:new', onOrderNew);
    socket.on('order:status:changed', onStatusChanged);
    return () => {
      socket.off('order:new', onOrderNew);
      socket.off('order:status:changed', onStatusChanged);
    };
  }, [socketRef]);

  // Initial load
  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const load = async () => {
      try {
        const res = await apiFetch(
          `${orderServiceUrl}/api/v1/orders/${auth.user!.tenant_id}?status=pending,confirmed,preparing,ready`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          setFetchError(`API error ${res.status}: ${body.error ?? res.statusText}`);
          return;
        }
        const data = (await res.json()) as { success: boolean; data?: { orders: OrderData[] } };
        setFetchError(null);
        setOrders(data.data?.orders ?? []);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Network error');
      }
    };
    void load();
  }, [auth, orderServiceUrl]);

  const openOrder = async (order: OrderData) => {
    if (!auth.user?.tenant_id) return;
    setLoadingDetail(true);
    try {
      const res = await apiFetch(
        `${orderServiceUrl}/api/v1/orders/${auth.user.tenant_id}/${order.id}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { order: OrderDetail } };
        if (data.success && data.data?.order) {
          setSelectedOrder(data.data.order);
          setLoadingDetail(false);
          return;
        }
      }
    } catch { /* fall through */ }
    setSelectedOrder({
      id: order.id,
      order_number: order.order_number,
      type: order.type ?? 'dine_in',
      status: order.status,
      subtotal: order.total,
      tax_amount: 0,
      gst_amount: 0,
      discount_amount: 0,
      total: order.total,
      created_at: order.created_at,
      kots: order.kots ?? [],
    });
    setLoadingDetail(false);
  };

  const advanceOrder = async (orderId: string, nextStatus: OrderStatus) => {
    const tenantId = auth.user?.tenant_id;
    if (!tenantId) return;
    try {
      await apiFetch(`${orderServiceUrl}/api/v1/orders/${tenantId}/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status: nextStatus })
      });
    } catch { /* optimistic update anyway */ }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(prev => prev ? { ...prev, status: nextStatus } : prev);
    }
  };

  const openCheckout = async (order: OrderData | OrderDetail) => {
    setCheckoutSuccess(false);
    setSelectedPayment('cash');
    // Fetch full detail if needed
    if ('subtotal' in order && order.subtotal !== undefined) {
      setCheckoutOrder(order as OrderDetail);
      return;
    }
    const tenantId = auth.user?.tenant_id;
    if (!tenantId) return;
    try {
      const res = await apiFetch(
        `${orderServiceUrl}/api/v1/orders/${tenantId}/${order.id}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { order: OrderDetail } };
        if (data.data?.order) { setCheckoutOrder(data.data.order); return; }
      }
    } catch { /* fall through */ }
    // Minimal fallback
    setCheckoutOrder({
      id: order.id, order_number: order.order_number, type: order.type ?? 'dine_in',
      status: order.status, subtotal: order.total, tax_amount: 0, gst_amount: 0,
      discount_amount: 0, total: order.total, created_at: order.created_at, kots: [],
    });
  };

  const confirmPayment = async () => {
    if (!checkoutOrder || !auth.user?.tenant_id) return;
    setCheckoutLoading(true);
    try {
      // 1. Record payment (marks order completed + payment paid)
      await apiFetch(
        `${orderServiceUrl}/api/v1/orders/${auth.user.tenant_id}/${checkoutOrder.id}/payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ payment_method: selectedPayment })
        }
      );
      setCheckoutSuccess(true);
      // Remove from kanban after brief success display
      setTimeout(() => {
        setOrders(prev => prev.filter(o => o.id !== checkoutOrder.id));
        setSelectedOrder(prev => prev?.id === checkoutOrder.id ? null : prev);
        setCheckoutOrder(null);
        setCheckoutSuccess(false);
      }, 1500);
    } catch {
      // show error? for now just close
    } finally {
      setCheckoutLoading(false);
    }
  };

  // No tenant yet — show setup nudge instead of hitting the API and getting a 401
  if (!auth.user?.tenant_id) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Finish setting up first</h2>
        <p className="text-gray-500 text-sm max-w-xs mb-6">
          Complete your business setup before you can receive and manage orders.
        </p>
        <button
          onClick={() => navigate('/setup')}
          className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-colors"
        >
          Go to setup checklist →
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex gap-4">
      {/* Kanban */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Active Orders</h1>
          <button
            onClick={() => navigate('/new-order')}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + New Order
          </button>
        </div>
        {fetchError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
            {fetchError}
          </div>
        )}
        <div className="grid grid-cols-4 gap-4">
          {STATUS_ORDER.map((status) => {
            const columnOrders = orders.filter(o => o.status === status);
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-gray-700">{STATUS_LABELS[status]}</h3>
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                    {columnOrders.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {columnOrders.map(order => (
                    <div
                      key={order.id}
                      onClick={() => { void openOrder(order); }}
                      className={`bg-white border border-l-4 ${STATUS_COLORS[order.status]} border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${selectedOrder?.id === order.id ? 'ring-2 ring-brand-500' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-gray-900 text-sm">{order.order_number}</div>
                        {order.table_name && (
                          <span className="text-xs font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{order.table_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 capitalize mt-0.5">{order.type?.replace(/_/g, ' ')}</div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-gray-400">{order.item_count} items</span>
                        <span className="text-xs font-medium font-mono text-gray-700">{fmt(order.total)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{getElapsed(order.created_at)}</div>

                      {/* Action buttons */}
                      {order.status === 'ready' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); void openCheckout(order); }}
                          className="mt-3 w-full py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          💳 Bill & Checkout
                        </button>
                      ) : STATUS_NEXT[order.status] ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); void advanceOrder(order.id, STATUS_NEXT[order.status]!); }}
                          className="mt-3 w-full py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {STATUS_NEXT_LABEL[order.status]}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {columnOrders.length === 0 && (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-xs text-gray-400">
                      No {STATUS_LABELS[status].toLowerCase()} orders
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order detail panel */}
      {(selectedOrder || loadingDetail) && !checkoutOrder && (
        <div className="w-80 bg-white border border-gray-200 rounded-2xl p-5 shrink-0 h-fit max-h-[calc(100vh-6rem)] overflow-y-auto">
          {loadingDetail ? (
            <div className="text-center text-sm text-gray-400 py-8">Loading...</div>
          ) : selectedOrder ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{selectedOrder.order_number}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_BADGE[selectedOrder.status]}`}>
                    {STATUS_LABELS[selectedOrder.status]}
                  </span>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="text-xs text-gray-500 mb-4 space-y-1">
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="capitalize font-medium text-gray-700">{selectedOrder.type.replace(/_/g, ' ')}</span>
                </div>
                {selectedOrder.table_name && (
                  <div className="flex justify-between">
                    <span>Table</span>
                    <span className="font-semibold text-brand-600">{selectedOrder.table_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Placed</span>
                  <span className="font-medium text-gray-700">{getElapsed(selectedOrder.created_at)}</span>
                </div>
              </div>

              {/* KOTs */}
              {selectedOrder.kots.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {selectedOrder.kots.map(kot => (
                    <div key={kot.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-gray-700">{kot.kot_number}</span>
                        <span className="text-xs text-gray-400 capitalize">{kot.status}</span>
                      </div>
                      <div className="space-y-1">
                        {(kot.items ?? []).map(item => (
                          <div key={item.id} className="flex justify-between text-xs text-gray-600">
                            <span>{item.quantity}× {item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                            <span className="font-mono">{fmt(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl mb-4">
                  No KOTs yet
                </div>
              )}

              {/* Bill summary */}
              <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono">{fmt(selectedOrder.subtotal)}</span>
                </div>
                {(selectedOrder.tax_amount ?? selectedOrder.gst_amount) > 0 && (
                  <div className="flex justify-between">
                    <span>GST</span>
                    <span className="font-mono">{fmt(selectedOrder.tax_amount ?? selectedOrder.gst_amount)}</span>
                  </div>
                )}
                {selectedOrder.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span className="font-mono">-{fmt(selectedOrder.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-sm pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span className="font-mono">{fmt(selectedOrder.total)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex flex-col gap-2">
                {selectedOrder.status === 'ready' ? (
                  <button
                    onClick={() => { void openCheckout(selectedOrder); }}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    💳 Bill & Checkout
                  </button>
                ) : STATUS_NEXT[selectedOrder.status] ? (
                  <button
                    onClick={() => { void advanceOrder(selectedOrder.id, STATUS_NEXT[selectedOrder.status]!); }}
                    className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {STATUS_NEXT_LABEL[selectedOrder.status]}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Checkout modal ────────────────────────────────────────────────── */}
      {checkoutOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {checkoutSuccess ? (
              <div className="p-10 text-center">
                <div className="text-5xl mb-3">✅</div>
                <div className="text-lg font-bold text-gray-900">Payment Received</div>
                <div className="text-sm text-gray-500 mt-1">{checkoutOrder.order_number} — completed</div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900">{checkoutOrder.order_number}</div>
                    <div className="text-xs text-gray-500 capitalize">{checkoutOrder.type.replace(/_/g, ' ')}</div>
                  </div>
                  <button onClick={() => setCheckoutOrder(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Items */}
                  <div className="space-y-1">
                    {checkoutOrder.kots.flatMap(k => k.items ?? []).map((item, i) => (
                      <div key={i} className="flex justify-between text-sm text-gray-700">
                        <span>{item.quantity}× {item.name}</span>
                        <span className="font-mono">{fmt(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Bill */}
                  <div className="border-t border-gray-100 pt-3 space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-mono">{fmt(checkoutOrder.subtotal)}</span>
                    </div>
                    {(checkoutOrder.tax_amount ?? checkoutOrder.gst_amount) > 0 && (
                      <div className="flex justify-between">
                        <span>GST</span>
                        <span className="font-mono">{fmt(checkoutOrder.tax_amount ?? checkoutOrder.gst_amount)}</span>
                      </div>
                    )}
                    {checkoutOrder.discount_amount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount</span>
                        <span className="font-mono">-{fmt(checkoutOrder.discount_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <span className="font-mono">{fmt(checkoutOrder.total)}</span>
                    </div>
                  </div>

                  {/* Payment method */}
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment Method</div>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_METHODS.map(pm => (
                        <button
                          key={pm.value}
                          onClick={() => setSelectedPayment(pm.value)}
                          className={`py-3 rounded-xl border-2 text-center transition-colors ${
                            selectedPayment === pm.value
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-xl">{pm.icon}</div>
                          <div className="text-xs font-medium mt-1">{pm.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Confirm button */}
                  <button
                    onClick={() => { void confirmPayment(); }}
                    disabled={checkoutLoading}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
                  >
                    {checkoutLoading ? 'Processing...' : `Confirm ${PAYMENT_METHODS.find(p => p.value === selectedPayment)?.label} Payment · ${fmt(checkoutOrder.total)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
