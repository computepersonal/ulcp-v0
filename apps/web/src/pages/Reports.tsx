import { useState, useEffect, useCallback } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';

type DateTab = 'today' | 'yesterday' | 'custom';

interface UnbilledOrder {
  id: string;
  order_number: string;
  total: number;
  cancelled_reason: string;
  created_at: string;
}

interface ActiveOrder {
  id: string;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
}

interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

interface DailySummary {
  date: string;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    avgOrder: number;
    paymentBreakdown: Record<string, number>;
  };
  unbilled: UnbilledOrder[];
  active: ActiveOrder[];
  cancelled_count: number;
  topItems: TopItem[];
}

function fmt(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

function getElapsed(since: string): string {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<DateTab>('today');
  const [customDate, setCustomDate] = useState(toDateStr(new Date()));
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';

  const dateForTab = useCallback((t: DateTab): string => {
    if (t === 'today') return toDateStr(new Date());
    if (t === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toDateStr(d);
    }
    return customDate;
  }, [customDate]);

  const load = useCallback(async (t: DateTab) => {
    if (!auth.user?.tenant_id) return;
    setLoading(true);
    setError(null);
    try {
      const date = dateForTab(t);
      const res = await apiFetch(
        `${orderServiceUrl}/api/v1/orders/${auth.user.tenant_id}/summary/daily?date=${date}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(`API error ${res.status}: ${body.error ?? res.statusText}`);
        return;
      }
      const data = (await res.json()) as { success: boolean; data?: DailySummary };
      if (data.data) setSummary(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [auth, orderServiceUrl, dateForTab]);

  useEffect(() => { void load(tab); }, [tab, load]);

  const paymentData = summary
    ? Object.entries(summary.summary.paymentBreakdown).map(([method, count]) => ({ method, count }))
    : [];

  const totalPaid = paymentData.reduce((s, p) => s + p.count, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Daily Report</h1>
        <div className="flex gap-2">
          {(['today', 'yesterday', 'custom'] as DateTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
          {tab === 'custom' && (
            <input
              type="date"
              value={customDate}
              max={toDateStr(new Date())}
              onChange={(e) => { setCustomDate(e.target.value); void load('custom'); }}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Loading report…</div>
      ) : summary ? (
        <>
          {/* ── Unbilled Alert ──────────────────────────────────────────── */}
          {summary.unbilled.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">⚠️</span>
                <h2 className="font-bold text-amber-800">Unbilled Orders ({summary.unbilled.length})</h2>
                <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  Needs Review
                </span>
              </div>
              <p className="text-sm text-amber-700 mb-4">
                These orders were in progress at end of day but were never billed. Total potential revenue lost:{' '}
                <strong>{fmt(summary.unbilled.reduce((s, o) => s + o.total, 0))}</strong>
              </p>
              <div className="space-y-2">
                {summary.unbilled.map(order => (
                  <div key={order.id} className="bg-white border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-gray-900 text-sm">{order.order_number}</span>
                      <span className="ml-2 text-xs text-gray-500">{getElapsed(order.created_at)}</span>
                      <div className="text-xs text-amber-700 mt-0.5">{order.cancelled_reason}</div>
                    </div>
                    <span className="font-mono font-bold text-amber-800">{fmt(order.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Active Orders Warning ─────────────────────────────────── */}
          {summary.active.length > 0 && tab === 'today' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🔄</span>
                <h2 className="font-bold text-blue-800">Still Active ({summary.active.length})</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {summary.active.map(order => (
                  <div key={order.id} className="bg-white border border-blue-200 rounded-xl px-3 py-2 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{order.order_number}</div>
                      <div className="text-xs text-blue-600 capitalize">{order.status}</div>
                    </div>
                    <span className="text-xs font-mono text-gray-700">{fmt(order.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Summary Metrics ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label="Revenue"
              value={fmt(summary.summary.totalRevenue)}
              sub={`${summary.summary.totalOrders} orders`}
              color="text-green-600"
            />
            <MetricCard
              label="Avg Order Value"
              value={fmt(summary.summary.avgOrder)}
              sub="per completed order"
            />
            <MetricCard
              label="Cancelled"
              value={String(summary.cancelled_count)}
              sub="orders cancelled"
              color={summary.cancelled_count > 0 ? 'text-red-500' : 'text-gray-500'}
            />
            <MetricCard
              label="Unbilled"
              value={String(summary.unbilled.length)}
              sub={summary.unbilled.length > 0 ? fmt(summary.unbilled.reduce((s, o) => s + o.total, 0)) : 'none'}
              color={summary.unbilled.length > 0 ? 'text-amber-600' : 'text-gray-500'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Payment Breakdown ─────────────────────────────────── */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Payment Methods</h3>
              {paymentData.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">No payments recorded</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={paymentData} barSize={32}>
                      <XAxis dataKey="method" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} className="capitalize" />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip formatter={(v) => [`${v} orders`, '']} />
                      <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-3 flex-wrap">
                    {paymentData.map(p => (
                      <div key={p.method} className="text-xs text-gray-600 capitalize">
                        <span className="font-semibold text-gray-900">{p.count}</span> {p.method}{' '}
                        <span className="text-gray-400">({totalPaid > 0 ? Math.round(p.count / totalPaid * 100) : 0}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Top Items ─────────────────────────────────────────── */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Top Items</h3>
              {summary.topItems.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">No completed orders yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="text-left pb-3 font-medium">Item</th>
                      <th className="text-right pb-3 font-medium">Qty</th>
                      <th className="text-right pb-3 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topItems.map((item, idx) => (
                      <tr key={item.name} className={idx > 0 ? 'border-t border-gray-50' : ''}>
                        <td className="py-2.5 font-medium text-gray-700">{item.name}</td>
                        <td className="py-2.5 text-right text-gray-500">{item.quantity}</td>
                        <td className="py-2.5 text-right font-mono font-medium text-brand-600">{fmt(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Order Timeline ─────────────────────────────────────────── */}
          {summary.summary.totalOrders > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-1">Revenue Summary</h3>
              <p className="text-xs text-gray-400 mb-4">Completed orders for {summary.date}</p>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900 font-mono">{fmt(summary.summary.totalRevenue)}</div>
                  <div className="text-xs text-gray-400 mt-1">Total Revenue</div>
                </div>
                <div className="h-10 border-l border-gray-200" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{summary.summary.totalOrders}</div>
                  <div className="text-xs text-gray-400 mt-1">Orders Completed</div>
                </div>
                <div className="h-10 border-l border-gray-200" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900 font-mono">{fmt(summary.summary.avgOrder)}</div>
                  <div className="text-xs text-gray-400 mt-1">Avg Order Value</div>
                </div>
                <div className="h-10 border-l border-gray-200" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{summary.cancelled_count}</div>
                  <div className="text-xs text-gray-400 mt-1">Cancelled</div>
                </div>
                {summary.unbilled.length > 0 && (
                  <>
                    <div className="h-10 border-l border-gray-200" />
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-500">{summary.unbilled.length}</div>
                      <div className="text-xs text-gray-400 mt-1">Unbilled</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 text-gray-400 text-sm">No data</div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-bold text-xl font-mono ${color ?? 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
