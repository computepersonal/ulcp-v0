import { useState, useEffect, useCallback } from 'react';
import { X, Star, Gift, Save, Check } from 'lucide-react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';

interface CustomerProfile {
  customer: {
    id: string;
    name: string | null;
    mobile: string | null;
    email: string | null;
    birthday: string | null;
    preferences: Record<string, unknown> | null;
  };
  loyalty: {
    points_balance: number;
    wallet_balance: number;
    tier: 'silver' | 'gold' | 'platinum';
    visits_count: number;
    orders_count: number;
    last_visit_at: string | null;
    favourite_items: string[];
    staff_notes?: string;
  };
  active_offers: Array<{
    id: string;
    name: string;
    description: string | null;
    type: string;
    value_type: string;
    value: number;
    auto_apply: boolean;
    expires_at: string | null;
    status: string;
  }>;
  history: {
    total_orders: number;
    average_order_value: number;
    last_order_date: string | null;
    recent_orders: Array<{
      id: string;
      order_id: string;
      total_amount: number;
      items_count: number;
      visited_at: string;
    }>;
  };
}

const TIER_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  silver:   { label: 'Silver Member',   icon: null, color: 'text-gray-600', bg: 'bg-gray-800' },
  gold:     { label: 'Gold Member',     icon: <Star size={16} className="text-yellow-400" />, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
  platinum: { label: 'Platinum Member', icon: <Gift size={16} className="text-purple-400" />, color: 'text-purple-400', bg: 'bg-purple-900/30' },
};

function formatExpiry(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = target.getTime() - today.getTime();
  const days = Math.round(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return 'Expired';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props {
  tenantId: string;
  customerId: string;
  onClose: () => void;
}

export default function CustomerProfileModal({ tenantId, customerId, onClose }: Props) {
  const auth = useAppSelector((s) => s.auth);
  const loyaltyUrl = import.meta.env.VITE_LOYALTY_SERVICE_URL ?? 'http://localhost:3011';

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'offers' | 'orders' | 'notes'>('offers');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        `${loyaltyUrl}/api/v1/loyalty/${tenantId}/customer/${customerId}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        setNotes(data.data.loyalty?.staff_notes ?? '');
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [tenantId, customerId, auth.token, loyaltyUrl]);

  useEffect(() => { void load(); }, [load]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await apiFetch(
        `${loyaltyUrl}/api/v1/loyalty/${tenantId}/customer/${customerId}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ notes }),
        }
      );
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch { /* ignore */ }
    setSavingNotes(false);
  };

  const tier = TIER_CONFIG[profile?.loyalty.tier ?? 'silver'] ?? TIER_CONFIG.silver;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0">
          <button onClick={onClose} className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center hover:bg-red-500/40 transition-colors">
            <X size={16} className="text-red-400" />
          </button>
          <h2 className="text-lg font-bold">{profile?.customer.name ?? 'Customer'}</h2>
          <div className="w-8" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Loading profile...</div>
        ) : !profile ? (
          <div className="py-16 text-center text-gray-500 text-sm">Failed to load profile</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Tier badge */}
            <div className={`text-center py-2 rounded-xl ${tier.bg}`}>
              <div className="flex items-center justify-center gap-2">
                {tier.icon}
                <span className={`text-sm font-semibold ${tier.color}`}>{tier.label}</span>
              </div>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-2xl p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Points</div>
                <div className="text-2xl font-bold">{profile.loyalty.points_balance.toLocaleString()}</div>
              </div>
              <div className="bg-gray-800 rounded-2xl p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Wallet</div>
                <div className="text-2xl font-bold">
                  ₹{(profile.loyalty.wallet_balance / 100).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
              <span>Visits: <strong className="text-white">{profile.loyalty.visits_count}</strong></span>
              <span>•</span>
              <span>Orders: <strong className="text-white">{profile.history.total_orders}</strong></span>
              <span>•</span>
              <span>Avg: <strong className="text-white">₹{(profile.history.average_order_value / 100).toFixed(0)}</strong></span>
            </div>

            {/* Contact info */}
            <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
              {profile.customer.mobile && <span className="font-mono">{profile.customer.mobile}</span>}
              {profile.customer.email && <span>{profile.customer.email}</span>}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-800 p-1 rounded-xl">
              {(['offers', 'orders', 'notes'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t === 'offers' ? `Offers (${profile.active_offers.length})` : t}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'offers' && (
              <div className="space-y-2">
                {profile.active_offers.length === 0 ? (
                  <div className="text-center py-6 text-gray-600 text-sm">No active offers</div>
                ) : (
                  profile.active_offers.map((offer) => (
                    <div
                      key={offer.id}
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        offer.auto_apply ? 'bg-brand-500/10 border border-brand-500/20' : 'bg-gray-800'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {offer.auto_apply && (
                            <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded font-semibold uppercase">
                              Auto
                            </span>
                          )}
                          <span className="text-sm font-medium text-white truncate">{offer.name}</span>
                        </div>
                        {offer.description && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">{offer.description}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className={`text-xs font-medium ${
                          formatExpiry(offer.expires_at) === 'Today' ? 'text-orange-400' : 'text-gray-500'
                        }`}>
                          {formatExpiry(offer.expires_at)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'orders' && (
              <div className="space-y-2">
                {profile.history.recent_orders.length === 0 ? (
                  <div className="text-center py-6 text-gray-600 text-sm">No orders yet</div>
                ) : (
                  profile.history.recent_orders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl">
                      <div>
                        <div className="text-sm text-white">
                          {order.items_count} item{order.items_count > 1 ? 's' : ''}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(order.visited_at).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short',
                          })}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-white">
                        ₹{(order.total_amount / 100).toFixed(0)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'notes' && (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add internal notes about this customer (allergies, preferences, seating preference, etc.)"
                  className="w-full h-32 bg-gray-800 text-white text-sm rounded-xl p-3 outline-none resize-none placeholder:text-gray-600 border border-gray-700 focus:border-brand-500"
                />
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="w-full py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {notesSaved ? (
                    <><Check size={14} /> Saved</>
                  ) : savingNotes ? (
                    'Saving...'
                  ) : (
                    <><Save size={14} /> Save Notes</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
