import { useState, useEffect, useCallback } from 'react';
import { Search, Phone, Star, Gift, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';
import CustomerProfileModal from '../components/CustomerProfileModal';

interface CustomerRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  points_balance: number;
  wallet_balance: number;
  tier: 'silver' | 'gold' | 'platinum';
  visits_count: number;
  orders_count: number;
  last_visit_at: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  customer_email: string | null;
}

const TIER_BADGES: Record<string, { label: string; color: string }> = {
  silver:   { label: 'Silver',   color: 'bg-gray-100 text-gray-600' },
  gold:     { label: 'Gold',     color: 'bg-yellow-100 text-yellow-700' },
  platinum: { label: 'Platinum', color: 'bg-purple-100 text-purple-700' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function Customers() {
  const auth = useAppSelector((s) => s.auth);
  const tenantId = auth.user?.tenant_id ?? '';
  const loyaltyUrl = import.meta.env.VITE_LOYALTY_SERVICE_URL ?? 'http://localhost:3011';

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const LIMIT = 25;

  const load = useCallback(async (p: number) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (tierFilter) params.set('tier', tierFilter);
      const res = await apiFetch(
        `${loyaltyUrl}/api/v1/loyalty/${tenantId}/customers?${params}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data.customers ?? []);
        setTotal(data.data.total ?? 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [tenantId, auth.token, loyaltyUrl, tierFilter]);

  useEffect(() => { setPage(1); void load(1); }, [load]);
  useEffect(() => { void load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phone search — lookup via loyalty-service by-mobile
  const handlePhoneSearch = async () => {
    if (!phoneSearch.trim() || !tenantId) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `${loyaltyUrl}/api/v1/loyalty/${tenantId}/customer/by-mobile/${encodeURIComponent(phoneSearch.trim())}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const data = await res.json();
      if (data.success && data.data?.customer?.id) {
        setSelectedCustomerId(data.data.customer.id);
      } else {
        setCustomers([]);
        setTotal(0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <p className="text-sm text-gray-500 mt-1">Loyalty profiles, offers, and visit history</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{total}</div>
          <div className="text-sm text-gray-500">Total customers</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {customers.filter(c => {
              if (!c.last_visit_at) return false;
              return Date.now() - new Date(c.last_visit_at).getTime() < 30 * 86400000;
            }).length}
          </div>
          <div className="text-sm text-gray-500">Active this month</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {customers.filter(c => c.tier === 'gold' || c.tier === 'platinum').length}
          </div>
          <div className="text-sm text-gray-500">Gold+ tier</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-brand-600">
            {customers.reduce((sum, c) => sum + c.points_balance, 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Total points outstanding</div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by phone..."
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePhoneSearch()}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-500"
            />
          </div>
          <button
            onClick={handlePhoneSearch}
            className="px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 flex items-center gap-1.5"
          >
            <Phone size={14} /> Lookup
          </button>
          {phoneSearch && (
            <button onClick={() => { setPhoneSearch(''); void load(1); }} className="px-3 text-sm text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {['', 'silver', 'gold', 'platinum'].map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tierFilter === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Customer table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-500 text-sm">No customers yet</p>
          <p className="text-gray-400 text-xs mt-1">Customers will appear here after their first order</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Customer</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Phone</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Last Visit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Orders</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Points</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Tier</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map((c) => {
                  const tier = TIER_BADGES[c.tier] ?? TIER_BADGES.silver;
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedCustomerId(c.customer_id)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 text-sm font-bold">
                            {(c.customer_name?.[0] ?? '?').toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{c.customer_name ?? 'Unknown'}</div>
                            {c.customer_email && <div className="text-xs text-gray-400">{c.customer_email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 font-mono">{c.customer_mobile ?? '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{timeAgo(c.last_visit_at)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-900 text-right font-medium">{c.orders_count}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-semibold text-brand-600">{c.points_balance.toLocaleString()}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tier.color}`}>
                          {c.tier === 'gold' && <Star size={10} className="inline mr-1" />}
                          {c.tier === 'platinum' && <Gift size={10} className="inline mr-1" />}
                          {tier.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button className="text-brand-500 hover:text-brand-600 text-sm font-medium">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 disabled:opacity-40 flex items-center gap-1">
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 disabled:opacity-40 flex items-center gap-1">
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Customer Profile Modal */}
      {selectedCustomerId && (
        <CustomerProfileModal
          tenantId={tenantId}
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}
    </div>
  );
}
