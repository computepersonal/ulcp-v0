import { useState, useEffect } from 'react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';

type SettingsTab = 'business' | 'branches' | 'qr' | 'subscription' | 'promotions';

const PLAN_LIMITS = {
  free: { items: 200, staff: 5, branches: 1, price: 0 },
  starter: { items: 500, staff: 20, branches: 3, price: 999 },
  pro: { items: Infinity, staff: Infinity, branches: Infinity, price: 2499 }
};

function UsageMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max === Infinity ? 0 : Math.min(100, (used / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">
          {used} / {max === Infinity ? '∞' : max}
        </span>
      </div>
      {max !== Infinity && (
        <div className="h-2 bg-gray-100 rounded-full">
          <div
            className={`h-2 rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface Promotion {
  id: string;
  name: string;
  status: string;
  placements: string[];
  starts_at: string;
  ends_at: string;
  creatives: Array<{ headline: string; cta_text: string }>;
}

const VALID_PLACEMENTS = [
  { id: 'order_tracking', label: 'Order Tracking (while customers wait)' },
  { id: 'post_checkout', label: 'Post-checkout (after they pay)' },
  { id: 'social_room', label: 'Social Room' },
  { id: 'explore_nearby', label: 'Explore Tab (attract new customers)' },
];

const ADS_URL = import.meta.env.VITE_ADS_SERVICE_URL ?? 'http://localhost:3015';

function PromotionsTab({ tenantId, token }: { tenantId: string; token: string }) {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    headline: '',
    body: '',
    cta_text: 'Learn More',
    cta_url: 'https://',
    placements: ['order_tracking', 'post_checkout'] as string[],
    starts_at: new Date().toISOString().slice(0, 10),
    ends_at: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  useEffect(() => {
    void apiFetch(`${ADS_URL}/api/v1/ads/in-house/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: { success: boolean; data?: Promotion[] }) => { if (d.success && d.data) setPromos(d.data); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [tenantId, token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${ADS_URL}/api/v1/ads/in-house/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          headline: form.headline,
          body: form.body || undefined,
          cta_text: form.cta_text,
          cta_url: form.cta_url,
          placements: form.placements,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
        }),
      });
      const d = await res.json() as { success: boolean; data?: Promotion };
      if (d.success && d.data) {
        setPromos(p => [d.data!, ...p]);
        setShowForm(false);
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const togglePlacement = (id: string) => {
    setForm(f => ({
      ...f,
      placements: f.placements.includes(id)
        ? f.placements.filter(p => p !== id)
        : [...f.placements, id],
    }));
  };

  const pausePromo = async (promoId: string, status: string) => {
    await apiFetch(`${ADS_URL}/api/v1/ads/in-house/${tenantId}/${promoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: status === 'active' ? 'paused' : 'active' }),
    });
    setPromos(p => p.map(pr => pr.id === promoId ? { ...pr, status: status === 'active' ? 'paused' : 'active' } : pr));
  };

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>;

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Active Promotions</h3>
          <p className="text-sm text-gray-500 mt-0.5">Show your own promotions to customers while they wait</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl"
        >
          + Create Promotion
        </button>
      </div>

      {promos.length === 0 && !showForm && (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-2xl">
          No promotions yet. Create your first one to reach customers!
        </div>
      )}

      {promos.map(promo => (
        <div key={promo.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 truncate">{promo.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  promo.status === 'active' ? 'bg-green-100 text-green-700' :
                  promo.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{promo.status}</span>
              </div>
              {promo.creatives[0] && (
                <div className="text-sm text-gray-500 mt-1 truncate">{promo.creatives[0].headline}</div>
              )}
              <div className="flex gap-1 mt-2 flex-wrap">
                {promo.placements.map(p => (
                  <span key={p} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                    {p.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => void pausePromo(promo.id, promo.status)}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg shrink-0"
            >
              {promo.status === 'active' ? 'Pause' : 'Activate'}
            </button>
          </div>
        </div>
      ))}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h4 className="font-semibold text-gray-900">New Promotion</h4>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Summer special offer"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Headline <span className="text-gray-400">(60 chars)</span></label>
            <input
              value={form.headline}
              maxLength={60}
              onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
              placeholder="20% off all desserts today!"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Body <span className="text-gray-400">(optional, 150 chars)</span></label>
            <input
              value={form.body}
              maxLength={150}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Valid today only. Use code DESSERT20."
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">CTA Text</label>
              <input
                value={form.cta_text}
                onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">CTA Link</label>
              <input
                value={form.cta_url}
                onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Show on</label>
            <div className="mt-2 space-y-2">
              {VALID_PLACEMENTS.map(p => (
                <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.placements.includes(p.id)}
                    onChange={() => togglePlacement(p.id)}
                    className="accent-brand-500"
                  />
                  <span className="text-sm text-gray-700">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Start Date</label>
              <input
                type="date"
                value={form.starts_at}
                onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">End Date</label>
              <input
                type="date"
                value={form.ends_at}
                onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving || !form.name || !form.headline || form.placements.length === 0}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl text-sm"
            >
              {saving ? 'Publishing...' : 'Publish'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<SettingsTab>('business');

  const currentPlan = 'free' as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[currentPlan];

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'business', label: 'Business' },
    { id: 'branches', label: 'Branches' },
    { id: 'qr', label: 'QR Codes' },
    { id: 'subscription', label: 'Subscription' },
    { id: 'promotions', label: '📢 Promotions' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'business' && (
        <div className="max-w-md bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">Business Profile</h3>
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium">Name</label>
            <div className="text-gray-900 font-medium mt-1">{auth.user?.name ?? '—'}</div>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium">Email</label>
            <div className="text-gray-900 mt-1">{auth.user?.email ?? '—'}</div>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium">Business ID</label>
            <div className="text-gray-900 font-mono text-sm mt-1">{auth.user?.tenant_id ?? '—'}</div>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium">Role</label>
            <div className="text-gray-900 capitalize mt-1">{auth.user?.role?.replace(/_/g, ' ') ?? '—'}</div>
          </div>
        </div>
      )}

      {tab === 'branches' && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="font-medium text-gray-900">Main Branch</div>
            <div className="text-sm text-gray-500 mt-1">Primary location</div>
            <div className="flex gap-4 mt-2 text-sm text-gray-400">
              <span>8 tables</span>
              <span>3 sections</span>
            </div>
          </div>
          <button className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors">
            + Add Branch (requires Starter plan)
          </button>
        </div>
      )}

      {tab === 'qr' && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="bg-white border border-gray-100 rounded-xl p-4 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto bg-gray-900 rounded-lg mb-2 flex items-center justify-center">
                <div className="w-12 h-12 grid grid-cols-3 gap-0.5">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className={`rounded-sm ${Math.random() > 0.5 ? 'bg-white' : 'bg-transparent'}`} />
                  ))}
                </div>
              </div>
              <div className="text-sm font-medium text-gray-700">Table {n}</div>
              <button className="mt-2 text-xs text-brand-500 hover:text-brand-600 font-medium">Download</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'promotions' && auth.user?.tenant_id && auth.token && (
        <PromotionsTab tenantId={auth.user.tenant_id} token={auth.token} />
      )}

      {tab === 'subscription' && (
        <div className="max-w-md">
          <div className="bg-white border-2 border-brand-200 rounded-2xl p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Current Plan</h3>
              <span className="bg-brand-100 text-brand-700 text-xs px-3 py-1 rounded-full font-semibold capitalize">{currentPlan}</span>
            </div>
            <div className="space-y-3 mb-4">
              <UsageMeter label="Menu Items" used={3} max={limits.items} />
              <UsageMeter label="Staff Members" used={5} max={limits.staff} />
              <UsageMeter label="Branches" used={1} max={limits.branches} />
            </div>
            <div className="text-lg font-bold text-gray-900">
              ₹{limits.price}/month
            </div>
          </div>

          <div className="space-y-3">
            {(['starter', 'pro'] as const).map((plan) => (
              <div key={plan} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900 capitalize">{plan}</div>
                  <div className="text-sm text-gray-500">
                    {PLAN_LIMITS[plan].items === Infinity ? 'Unlimited' : PLAN_LIMITS[plan].items} items · ₹{PLAN_LIMITS[plan].price}/mo
                  </div>
                </div>
                <button className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl">
                  Upgrade
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
