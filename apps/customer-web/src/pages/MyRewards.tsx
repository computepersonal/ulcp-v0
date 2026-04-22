import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

interface LoyaltyProfile {
  customer: { name: string | null; mobile: string | null };
  loyalty: {
    points_balance: number;
    wallet_balance: number;
    tier: 'silver' | 'gold' | 'platinum';
    visits_count: number;
    orders_count: number;
    last_visit_at: string | null;
  };
  active_offers: Array<{
    id: string;
    name: string;
    description: string | null;
    auto_apply: boolean;
    expires_at: string | null;
    value_type: string;
    value: number;
  }>;
  history: {
    total_orders: number;
    average_order_value: number;
    recent_orders: Array<{
      id: string;
      total_amount: number;
      items_count: number;
      visited_at: string;
    }>;
  };
}

const TIER_CONFIG: Record<string, { label: string; emoji: string; color: string; next?: string; nextThreshold?: number }> = {
  silver:   { label: 'Silver', emoji: '🥈', color: 'from-gray-400 to-gray-500', next: 'Gold', nextThreshold: 100000 },
  gold:     { label: 'Gold',   emoji: '🥇', color: 'from-yellow-400 to-yellow-500', next: 'Platinum', nextThreshold: 500000 },
  platinum: { label: 'Platinum', emoji: '💎', color: 'from-purple-400 to-purple-600' },
};

function formatExpiry(iso: string | null): string {
  if (!iso) return 'No expiry';
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days < 0) return 'Expired';
  return `Expires ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function MyRewards() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const auth = useAppSelector((s) => s.auth);
  const loyaltyUrl = import.meta.env.VITE_LOYALTY_SERVICE_URL ?? 'http://localhost:3011';

  const [profile, setProfile] = useState<LoyaltyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Resolve slug → tenant_id
  useEffect(() => {
    if (!slug) return;
    const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
    fetch(`${tenantUrl}/api/v1/tenants/by-slug/${slug}`)
      .then(r => r.json())
      .then((data: { success: boolean; data?: { tenant?: { id: string } } }) => {
        if (data.success && data.data?.tenant?.id) {
          setTenantId(data.data.tenant.id);
        }
      })
      .catch(() => undefined);
  }, [slug]);

  // Load loyalty profile
  useEffect(() => {
    if (!tenantId || !auth.token) { setLoading(false); return; }
    fetch(`${loyaltyUrl}/api/v1/loyalty/${tenantId}/me`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then(r => r.json())
      .then((data: { success: boolean; data?: LoyaltyProfile }) => {
        if (data.success && data.data) setProfile(data.data);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [tenantId, auth.token, loyaltyUrl]);

  if (!auth.token) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h1 className="text-xl font-bold text-gray-900">Sign in to view rewards</h1>
        <p className="text-gray-500 text-sm mt-2">Your loyalty points and offers will appear here</p>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading...</div>;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">🎁</div>
        <h1 className="text-xl font-bold text-gray-900">No rewards yet</h1>
        <p className="text-gray-500 text-sm mt-2">Place your first order to start earning points!</p>
      </div>
    );
  }

  const tier = TIER_CONFIG[profile.loyalty.tier] ?? TIER_CONFIG.silver;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className={`bg-gradient-to-br ${tier.color} text-white px-6 pt-14 pb-8`}>
        <button onClick={() => navigate(-1)} className="text-white/80 text-sm mb-4">← Back</button>
        <div className="text-center">
          <div className="text-3xl mb-1">{tier.emoji}</div>
          <div className="text-lg font-bold">{tier.label} Member</div>
          <div className="text-white/70 text-sm mt-1">
            {profile.loyalty.visits_count} visits · Last: {timeAgo(profile.loyalty.last_visit_at)}
          </div>
        </div>

        {/* Points + Wallet */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
            <div className="text-xs text-white/60 uppercase tracking-wider">Points</div>
            <div className="text-2xl font-bold mt-1">{profile.loyalty.points_balance.toLocaleString()}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
            <div className="text-xs text-white/60 uppercase tracking-wider">Wallet</div>
            <div className="text-2xl font-bold mt-1">₹{(profile.loyalty.wallet_balance / 100).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-3">
        {/* Active Offers */}
        {profile.active_offers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 mt-6">
              Active Offers ({profile.active_offers.length})
            </h3>
            <div className="space-y-2">
              {profile.active_offers.map((offer) => (
                <div
                  key={offer.id}
                  className={`bg-white rounded-2xl p-4 border ${
                    offer.auto_apply ? 'border-brand-200 bg-brand-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {offer.auto_apply && (
                          <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded font-semibold">AUTO</span>
                        )}
                        <span className="text-sm font-semibold text-gray-900">{offer.name}</span>
                      </div>
                      {offer.description && (
                        <p className="text-xs text-gray-500 mt-1">{offer.description}</p>
                      )}
                    </div>
                  </div>
                  <div className={`text-xs mt-2 ${
                    formatExpiry(offer.expires_at).includes('today') ? 'text-orange-500 font-medium' : 'text-gray-400'
                  }`}>
                    {formatExpiry(offer.expires_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tier Progress */}
        {tier.next && tier.nextThreshold && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200 mb-6">
            <div className="text-sm font-semibold text-gray-900 mb-2">Progress to {tier.next}</div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div
                className="bg-brand-500 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (profile.loyalty.orders_count / (tier.nextThreshold / 100)) * 100)}%`,
                }}
              />
            </div>
            <div className="text-xs text-gray-500">
              ₹{((tier.nextThreshold - (profile.history.total_orders * profile.history.average_order_value)) / 100).toFixed(0)} more to spend
            </div>
          </div>
        )}

        {/* Recent Orders */}
        {profile.history.recent_orders.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Orders</h3>
            <div className="space-y-2">
              {profile.history.recent_orders.map((order) => (
                <div key={order.id} className="bg-white rounded-2xl p-4 border border-gray-200 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {order.items_count} item{order.items_count > 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(order.visited_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">₹{(order.total_amount / 100).toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
