import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  variant?: string;
}

interface OrderRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  place_name: string;
  slug: string;
  items: OrderItem[];
  total: number;
  payment_method: string;
  placed_at: string;
  status: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (days === 1) return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAmount(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  placed: { label: 'Placed', color: 'bg-blue-100 text-blue-700' },
  pending: { label: 'Placed', color: 'bg-blue-100 text-blue-700' },
  preparing: { label: 'Preparing', color: 'bg-orange-100 text-orange-700' },
  ready: { label: 'Ready', color: 'bg-green-100 text-green-700' },
  served: { label: 'Served', color: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

export default function OrderHistory() {
  const navigate = useNavigate();
  const auth = useAppSelector(s => s.auth);
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('order_history');
      if (raw) {
        setOrders(JSON.parse(raw) as OrderRecord[]);
      }
    } catch { /* ignore */ }
  }, []);

  // Group orders by place
  const groupedByPlace = orders.reduce<Record<string, OrderRecord[]>>((acc, order) => {
    const key = order.slug || order.place_name || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {});

  if (!auth.token) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="px-4 pt-4">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900 text-sm font-medium">← Back</button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-5xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-gray-900">Sign in to view orders</h1>
          <p className="text-gray-500 text-sm mt-2">Your order history will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900">Order History</h1>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 text-center pt-24">
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
              <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No orders yet</h2>
          <p className="text-gray-500 text-sm">Your order history will show up here once you place your first order.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-6 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-full hover:bg-brand-600 transition-colors"
          >
            Browse Places
          </button>
        </div>
      ) : (
        <div className="pb-8">
          {/* Summary */}
          <div className="px-4 py-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
              <div className="flex-1 text-center">
                <div className="text-2xl font-bold text-gray-900">{orders.length}</div>
                <div className="text-xs text-gray-500">Total Orders</div>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div className="flex-1 text-center">
                <div className="text-2xl font-bold text-gray-900">{Object.keys(groupedByPlace).length}</div>
                <div className="text-xs text-gray-500">Places Visited</div>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div className="flex-1 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {formatAmount(orders.reduce((s, o) => s + o.total, 0))}
                </div>
                <div className="text-xs text-gray-500">Total Spent</div>
              </div>
            </div>
          </div>

          {/* Orders list */}
          <div className="px-4 space-y-3">
            {orders.map((order) => {
              const st = STATUS_STYLE[order.status] ?? STATUS_STYLE.placed;
              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
                >
                  {/* Place header */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <button
                      onClick={() => navigate(`/place/${order.slug}`)}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 text-sm font-bold shrink-0">
                        {(order.place_name || order.slug)?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {order.place_name || order.slug}
                      </span>
                    </button>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="px-4 py-2">
                    {order.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs text-gray-400 w-4 shrink-0">{item.quantity}×</span>
                          <span className="text-sm text-gray-700 truncate">{item.name}</span>
                          {item.variant && (
                            <span className="text-xs text-gray-400">({item.variant})</span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500 shrink-0">{formatAmount(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="text-xs text-gray-400 py-1">
                        +{order.items.length - 3} more item{order.items.length - 3 > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                    <span className="text-xs text-gray-400">{formatDate(order.placed_at)}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">{formatAmount(order.total)}</span>
                      <button
                        onClick={() => navigate(`/place/${order.slug}`)}
                        className="text-xs text-brand-500 font-semibold hover:text-brand-600"
                      >
                        Reorder →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
