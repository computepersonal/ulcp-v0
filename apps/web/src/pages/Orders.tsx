import { useState, useEffect } from 'react';
import { useAppSelector } from '../hooks/redux';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready';

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
  type: string;
  status: OrderStatus;
  subtotal: number;
  gst_amount: number;
  total: number;
  created_at: string;
  kots: Kot[];
  status_history?: Array<{ status: string; created_at: string }>;
}

interface OrderData {
  id: string;
  order_number: string;
  table_id?: string;
  type?: string;
  item_count: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  kots?: Kot[];
}

const DEMO_ORDERS: OrderData[] = [
  { id: '1', order_number: 'ORD-001', type: 'dine_in', item_count: 3, total: 45000, status: 'pending', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: '2', order_number: 'ORD-002', type: 'dine_in', item_count: 2, total: 23000, status: 'confirmed', created_at: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: '3', order_number: 'ORD-003', type: 'dine_in', item_count: 7, total: 87000, status: 'preparing', created_at: new Date(Date.now() - 20 * 60000).toISOString() }
];

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
  ready: 'Serve'
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

function getElapsed(since: string): string {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  return `${mins}m ago`;
}

export default function Orders() {
  const auth = useAppSelector((s) => s.auth);
  const [orders, setOrders] = useState<OrderData[]>(DEMO_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';

  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const load = async () => {
      try {
        const res = await fetch(
          `${orderServiceUrl}/api/v1/orders/${auth.user!.tenant_id}`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; data?: { orders: OrderData[]; total: number } };
          const list = data.data?.orders ?? [];
          const active = list.filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
          if (active.length > 0) setOrders(active);
        }
      } catch {
        // Use demo data
      }
    };
    void load();
  }, [auth, orderServiceUrl]);

  const openOrder = async (order: OrderData) => {
    if (!auth.user?.tenant_id) return;
    setLoadingDetail(true);
    try {
      const res = await fetch(
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
    } catch {
      // Fall through to demo detail
    }
    // Fallback: show what we have from the list
    setSelectedOrder({
      id: order.id,
      order_number: order.order_number,
      type: order.type ?? 'dine_in',
      status: order.status,
      subtotal: order.total,
      gst_amount: 0,
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
      await fetch(`${orderServiceUrl}/api/v1/orders/${tenantId}/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status: nextStatus })
      });
    } catch {
      // Optimistic update anyway
    }
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => prev ? { ...prev, status: nextStatus } : prev);
    }
  };

  return (
    <div className="p-6 h-full flex gap-4">
      {/* Kanban columns */}
      <div className="flex-1 overflow-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Active Orders</h1>
        <div className="grid grid-cols-4 gap-4">
          {STATUS_ORDER.map((status) => {
            const columnOrders = orders.filter((o) => o.status === status);
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-gray-700">{STATUS_LABELS[status]}</h3>
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                    {columnOrders.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {columnOrders.map((order) => (
                    <div
                      key={order.id}
                      onClick={() => { void openOrder(order); }}
                      className={`bg-white border border-l-4 ${STATUS_COLORS[order.status]} border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${selectedOrder?.id === order.id ? 'ring-2 ring-brand-500' : ''}`}
                    >
                      <div className="font-bold text-gray-900 text-sm">{order.order_number}</div>
                      <div className="text-xs text-gray-500 capitalize mt-0.5">{order.type?.replace(/_/g, ' ')}</div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-gray-400">{order.item_count} items</span>
                        <span className="text-xs font-medium font-mono text-gray-700">₹{(order.total / 100).toFixed(0)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{getElapsed(order.created_at)}</div>
                      {STATUS_NEXT[order.status] && (
                        <button
                          onClick={(e) => { e.stopPropagation(); void advanceOrder(order.id, STATUS_NEXT[order.status]!); }}
                          className="mt-3 w-full py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {STATUS_NEXT_LABEL[order.status]}
                        </button>
                      )}
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
      {(selectedOrder || loadingDetail) && (
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
                <div className="flex justify-between">
                  <span>Placed</span>
                  <span className="font-medium text-gray-700">{getElapsed(selectedOrder.created_at)}</span>
                </div>
              </div>

              {/* KOTs / Items */}
              {selectedOrder.kots.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {selectedOrder.kots.map((kot) => (
                    <div key={kot.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-gray-700">{kot.kot_number}</span>
                        <span className="text-xs text-gray-400 capitalize">{kot.status}</span>
                      </div>
                      <div className="space-y-1">
                        {(kot.items ?? []).map((item) => (
                          <div key={item.id} className="flex justify-between text-xs text-gray-600">
                            <span>{item.quantity}× {item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                            <span className="font-mono">₹{((item.price * item.quantity) / 100).toFixed(0)}</span>
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
                  <span className="font-mono">₹{(selectedOrder.subtotal / 100).toFixed(0)}</span>
                </div>
                {selectedOrder.gst_amount > 0 && (
                  <div className="flex justify-between">
                    <span>GST</span>
                    <span className="font-mono">₹{(selectedOrder.gst_amount / 100).toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-sm pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span className="font-mono">₹{(selectedOrder.total / 100).toFixed(0)}</span>
                </div>
              </div>

              {/* Action button */}
              {STATUS_NEXT[selectedOrder.status] && (
                <button
                  onClick={() => { void advanceOrder(selectedOrder.id, STATUS_NEXT[selectedOrder.status]!); }}
                  className="mt-4 w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {STATUS_NEXT_LABEL[selectedOrder.status]}
                </button>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
