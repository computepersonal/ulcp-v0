import { useState } from 'react';
import { useAppSelector } from '../hooks/redux';

type SettingsTab = 'business' | 'branches' | 'qr' | 'subscription';

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

export default function Settings() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<SettingsTab>('business');

  const currentPlan = 'free' as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[currentPlan];

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'business', label: 'Business' },
    { id: 'branches', label: 'Branches' },
    { id: 'qr', label: 'QR Codes' },
    { id: 'subscription', label: 'Subscription' }
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
