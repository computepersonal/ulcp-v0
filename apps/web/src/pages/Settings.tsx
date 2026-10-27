import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';
import SetupReturnBanner from '../components/SetupReturnBanner';
import { QRCodeSVG } from 'qrcode.react';

type SettingsTab = 'business' | 'branches' | 'qr' | 'kds' | 'subscription' | 'promotions' | 'jukebox';

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

// ─── Subscription Tab ────────────────────────────────────────────────────────

interface SubData {
  plan: string;
  planInfo: { name: string; tagline: string; highlights: string[] } | null;
  monthlyPrice: number;
  trialActive: boolean;
  trialEndsAt: string | null;
  freeTrialUsed: boolean;
  activeAddons: string[];
  addonTotal: number;
  totalMonthly: number;
  availableAddons: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    active: boolean;
  }>;
  availablePlans: Array<{
    tier: string;
    name: string;
    tagline: string;
    price: number;
    trialMonths?: number;
    highlights: string[];
  }>;
}

function SubscriptionTab({ tenantId, token }: { tenantId: string; token: string }) {
  const [data, setData] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState('');
  const [togglingAddon, setTogglingAddon] = useState('');
  const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { success: boolean; data?: SubData };
        if (json.data) setData(json.data);
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, [tenantId, token, tenantUrl]);

  useEffect(() => { void load(); }, [load]);

  const handleUpgrade = async (plan: string) => {
    setUpgrading(plan);
    try {
      const res = await apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/subscription/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) await load();
    } catch { /* silently fail */ }
    setUpgrading('');
  };

  const handleToggleAddon = async (addonId: string, currentlyActive: boolean) => {
    setTogglingAddon(addonId);
    try {
      const res = await apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/subscription/addon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ addon_id: addonId, action: currentlyActive ? 'remove' : 'add' }),
      });
      if (res.ok) await load();
    } catch { /* silently fail */ }
    setTogglingAddon('');
  };

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading subscription...</div>;
  if (!data) return <div className="text-sm text-red-500 py-8 text-center">Failed to load subscription details</div>;

  const trialDaysLeft = data.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Trial banner */}
      {data.plan === 'free' && data.trialActive && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-green-800">Free trial active</div>
            <div className="text-sm text-green-600">{trialDaysLeft} days remaining — no charges until trial ends</div>
          </div>
          <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">TRIAL</span>
        </div>
      )}
      {data.plan === 'free' && !data.trialActive && data.freeTrialUsed && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-amber-800">Free trial ended</div>
            <div className="text-sm text-amber-600">Your 1-month free trial has been used. You are now charged ₹{data.monthlyPrice}/month.</div>
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-medium">EXPIRED</span>
        </div>
      )}

      {/* Current plan card */}
      <div className="bg-white border-2 border-brand-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900">Current Plan</h3>
          <span className="bg-brand-100 text-brand-700 text-xs px-3 py-1 rounded-full font-semibold">
            {data.planInfo?.name ?? data.plan}
          </span>
        </div>
        <div className="text-sm text-gray-500 mb-3">{data.planInfo?.tagline}</div>
        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-2xl font-bold text-gray-900">
            {data.trialActive ? '₹0' : `₹${data.monthlyPrice}`}
          </span>
          <span className="text-sm text-gray-400">/month</span>
          {data.trialActive && (
            <span className="ml-2 text-xs text-gray-400 line-through">₹{data.monthlyPrice}</span>
          )}
        </div>
        {data.activeAddons.length > 0 && (
          <div className="text-sm text-gray-500 mb-1">
            + ₹{data.addonTotal} add-ons = <span className="font-semibold text-gray-900">₹{data.totalMonthly}/month total</span>
          </div>
        )}
        <ul className="mt-3 space-y-1">
          {data.planInfo?.highlights.map((h, i) => (
            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span> {h}
            </li>
          ))}
        </ul>
      </div>

      {/* Plan comparison cards */}
      <div>
        <h3 className="font-bold text-gray-900 mb-3">Plans</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {data.availablePlans.map((plan) => {
            const isCurrent = plan.tier === data.plan;
            return (
              <div
                key={plan.tier}
                className={`bg-white border-2 rounded-2xl p-5 shadow-sm ${
                  isCurrent ? 'border-brand-400 ring-1 ring-brand-200' : 'border-gray-100'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-gray-900">{plan.name}</h4>
                  {isCurrent && (
                    <span className="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-semibold">CURRENT</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mb-3">{plan.tagline}</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-xl font-bold text-gray-900">₹{plan.price}</span>
                  <span className="text-xs text-gray-400">/month</span>
                </div>
                {plan.trialMonths && (
                  <div className="text-xs text-green-600 font-medium mb-3">
                    Free for first {plan.trialMonths} months
                  </div>
                )}
                <ul className="space-y-1 mb-4">
                  {plan.highlights.map((h, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-green-500 mt-0.5">&#10003;</span> {h}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button
                    onClick={() => void handleUpgrade(plan.tier)}
                    disabled={upgrading === plan.tier}
                    className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {upgrading === plan.tier ? 'Switching...' : `Switch to ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add-on features */}
      <div>
        <h3 className="font-bold text-gray-900 mb-1">Add-on Features</h3>
        <p className="text-sm text-gray-500 mb-3">Purchase individually at ₹500/month each, works with any plan</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {data.availableAddons.map((addon) => (
            <div
              key={addon.id}
              className={`bg-white border-2 rounded-xl p-4 shadow-sm ${
                addon.active ? 'border-green-300 bg-green-50/30' : 'border-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-semibold text-gray-900 text-sm">{addon.name}</h4>
                <span className="text-sm font-bold text-gray-700">₹{addon.price}/mo</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{addon.description}</p>
              <button
                onClick={() => void handleToggleAddon(addon.id, addon.active)}
                disabled={togglingAddon === addon.id}
                className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  addon.active
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                    : 'bg-brand-500 hover:bg-brand-600 text-white'
                }`}
              >
                {togglingAddon === addon.id
                  ? 'Updating...'
                  : addon.active
                    ? 'Remove Add-on'
                    : 'Add to Plan'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── QR Codes Tab ────────────────────────────────────────────────────────────

interface QRTable {
  id: string;
  name: string;
  section_name?: string;
}

function QRCodesTab({ tenantId, token }: { tenantId: string; token: string }) {
  const [tables, setTables] = useState<QRTable[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const customerBaseUrl = import.meta.env.VITE_CUSTOMER_WEB_URL ?? 'http://localhost:5174';

  const loadTables = useCallback(async () => {
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      // Fetch branches
      const brRes = await apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/branches`, { headers });
      if (!brRes.ok) { setLoading(false); return; }
      const brData = (await brRes.json()) as { data?: { branches?: Array<{ id: string; is_primary?: boolean }> } };
      const primary = (brData.data?.branches ?? []).find((b) => b.is_primary) ?? brData.data?.branches?.[0];
      if (!primary) { setLoading(false); return; }

      // Fetch tables + sections in parallel
      const [tableRes, secRes] = await Promise.all([
        apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/branches/${primary.id}/tables`, { headers }),
        apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/branches/${primary.id}/sections`, { headers }),
      ]);

      const sectionMap: Record<string, string> = {};
      if (secRes.ok) {
        const sd = (await secRes.json()) as { data?: { sections?: Array<{ id: string; name: string }> } };
        for (const s of sd.data?.sections ?? []) sectionMap[s.id] = s.name;
      }

      if (tableRes.ok) {
        const td = (await tableRes.json()) as {
          data?: { tables?: Array<{ id: string; name: string; section_id?: string | null }> };
        };
        setTables(
          (td.data?.tables ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            section_name: t.section_id ? sectionMap[t.section_id] : undefined,
          }))
        );
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, [tenantId, token, tenantUrl]);

  useEffect(() => { void loadTables(); }, [loadTables]);

  const getQRUrl = (tableId: string) =>
    `${customerBaseUrl}/?tenant=${tenantId}&table=${tableId}`;

  const downloadQR = (table: QRTable) => {
    const svg = document.getElementById(`qr-${table.id}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 512, 512);
        ctx.drawImage(img, 0, 0, 512, 512);
      }
      const a = document.createElement('a');
      a.download = `${table.name.replace(/\s+/g, '-')}-qr.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Loading tables...</div>;
  }

  if (tables.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-sm">No tables found. Add tables in the Floor Map first.</div>
      </div>
    );
  }

  // Group by zone
  const zoneGroups: Record<string, QRTable[]> = {};
  const noZone: QRTable[] = [];
  for (const t of tables) {
    if (t.section_name) {
      if (!zoneGroups[t.section_name]) zoneGroups[t.section_name] = [];
      zoneGroups[t.section_name].push(t);
    } else {
      noZone.push(t);
    }
  }

  const renderQRCard = (table: QRTable) => (
    <div key={table.id} className="bg-white border border-gray-100 rounded-xl p-4 text-center shadow-sm">
      <QRCodeSVG
        id={`qr-${table.id}`}
        value={getQRUrl(table.id)}
        size={120}
        level="M"
        includeMargin
        className="mx-auto"
      />
      <div className="text-sm font-medium text-gray-700 mt-2">{table.name}</div>
      <button
        onClick={() => downloadQR(table)}
        className="mt-2 text-xs text-brand-500 hover:text-brand-600 font-medium"
      >
        Download PNG
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        Print and place these QR codes on each table. Customers scan to view your menu and place orders.
      </div>
      {Object.entries(zoneGroups).map(([zone, zoneTables]) => (
        <div key={zone}>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{zone}</h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {zoneTables.map(renderQRCard)}
          </div>
        </div>
      ))}
      {noZone.length > 0 && (
        <div>
          {Object.keys(zoneGroups).length > 0 && (
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Unassigned</h3>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {noZone.map(renderQRCard)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Kitchen Displays Tab ────────────────────────────────────────────────────

interface KdsCode {
  id: string;
  code: string;
  station: string;
  expires_at: string;
}

interface KdsBranch {
  id: string;
  name: string;
  is_primary?: boolean;
}

interface KdsDevice {
  id: string;
  branch_id: string;
  branch_name: string;
  station: string;
  paired_at: string;
}

function KDSTab({ tenantId, token }: { tenantId: string; token: string }) {
  const [branches, setBranches] = useState<KdsBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [activeCodes, setActiveCodes] = useState<KdsCode[]>([]);
  const [devices, setDevices] = useState<KdsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<'kitchen' | 'bar' | null>(null);
  const [unpairing, setUnpairing] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<{ code: string; station: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const kdsUrl = import.meta.env.VITE_KDS_URL ?? 'http://localhost:5177';

  const load = useCallback(async () => {
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [brRes, codesRes, devRes] = await Promise.all([
        apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/branches`, { headers }),
        apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/codes`, { headers }),
        apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/devices`, { headers }),
      ]);
      if (brRes.ok) {
        const j = await brRes.json() as { data?: { branches?: KdsBranch[] } };
        const list = j.data?.branches ?? [];
        setBranches(list);
        setBranchId((prev) => {
          if (prev) return prev;
          const primary = list.find((b) => b.is_primary) ?? list[0];
          return primary?.id ?? '';
        });
      }
      if (codesRes.ok) {
        const j = await codesRes.json() as { data?: KdsCode[] };
        setActiveCodes(j.data ?? []);
      }
      if (devRes.ok) {
        const j = await devRes.json() as { data?: KdsDevice[] };
        setDevices(j.data ?? []);
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, [tenantId, token, tenantUrl]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!newCode) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [newCode]);

  useEffect(() => {
    if (newCode && newCode.expiresAt < now) {
      setNewCode(null);
      void load();
    }
  }, [newCode, now, load]);

  const generate = async (station: 'kitchen' | 'bar') => {
    if (!branchId) { setError('Pick a branch first'); return; }
    setGenerating(station);
    setError('');
    setNewCode(null);
    try {
      const res = await apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/generate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branch_id: branchId, station }),
      });
      if (res.ok) {
        const j = await res.json() as { data?: { code: string; station: string; expires_at: string } };
        if (j.data) {
          setNewCode({
            code: j.data.code,
            station: j.data.station,
            expiresAt: new Date(j.data.expires_at).getTime(),
          });
          await load();
        }
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Failed to generate code');
      }
    } catch {
      setError('Network error');
    }
    setGenerating(null);
  };

  const unpair = async (deviceId: string) => {
    if (!confirm('Unpair this display? The tablet will need a new code to reconnect.')) return;
    setUnpairing(deviceId);
    try {
      const res = await apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Failed to unpair');
      }
    } catch {
      setError('Network error');
    }
    setUnpairing(null);
  };

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>;

  const remainingSecs = newCode ? Math.max(0, Math.floor((newCode.expiresAt - now) / 1000)) : 0;
  const mins = Math.floor(remainingSecs / 60);
  const secs = remainingSecs % 60;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900">Kitchen Displays</h3>
            <p className="text-sm text-gray-500 mt-1">
              Pair tablets or screens in your kitchen and bar to receive KOTs in real time.
            </p>
          </div>
          <span className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 font-medium whitespace-nowrap">Premium</span>
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-400 uppercase font-medium">Branch</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {branches.length === 0 && <option value="">No branches found</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.is_primary ? ' (Primary)' : ''}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {!newCode && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => void generate('kitchen')}
              disabled={!branchId || generating !== null}
              className="px-4 py-3 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {generating === 'kitchen' ? 'Generating...' : 'Pair Kitchen Display'}
            </button>
            <button
              onClick={() => void generate('bar')}
              disabled={!branchId || generating !== null}
              className="px-4 py-3 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {generating === 'bar' ? 'Generating...' : 'Pair Bar Display'}
            </button>
          </div>
        )}

        {newCode && (
          <div className="bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-200 rounded-xl p-6 text-center">
            <div className="text-xs uppercase font-medium text-gray-500 mb-2">
              Pairing code · {newCode.station}
            </div>
            <div className="font-mono text-5xl font-bold tracking-widest text-brand-700">{newCode.code}</div>
            <div className="text-sm text-gray-600 mt-3">
              Expires in <span className="font-mono font-semibold">{mins}:{secs.toString().padStart(2, '0')}</span>
            </div>
            <div className="mt-4 text-sm text-gray-700 space-y-1 text-left max-w-md mx-auto">
              <div>1. Open the KDS app on your tablet: <a href={kdsUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">{kdsUrl}</a></div>
              <div>2. Type the 6-digit code above</div>
              <div>3. The tablet pairs and starts showing live KOTs for this branch</div>
            </div>
            <button
              onClick={() => setNewCode(null)}
              className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Generate a different code
            </button>
          </div>
        )}
      </div>

      {devices.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h4 className="font-semibold text-gray-900 mb-1">Paired displays</h4>
          <div className="text-xs text-gray-500 mb-3">
            Tablets currently paired to your branches. Unpair if a device is lost or replaced.
          </div>
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-medium text-gray-900">{d.branch_name}</span>
                  <span className="ml-3 text-gray-500 capitalize">{d.station}</span>
                  <span className="ml-3 text-xs text-gray-400">
                    paired {new Date(d.paired_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => void unpair(d.id)}
                  disabled={unpairing === d.id}
                  className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {unpairing === d.id ? 'Unpairing...' : 'Unpair'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeCodes.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h4 className="font-semibold text-gray-900 mb-1">Pending pairings</h4>
          <div className="text-xs text-gray-500 mb-3">
            Codes that have been generated but not yet typed into a KDS device. They expire 10 minutes after creation.
          </div>
          <div className="space-y-2">
            {activeCodes.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                  <span className="ml-3 text-gray-500 capitalize">{c.station}</span>
                </div>
                <div className="text-xs text-gray-400">
                  Expires {new Date(c.expires_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Promotions Tab ──────────────────────────────────────────────────────────

function PromotionsTab({ tenantId, token }: { tenantId: string; token: string }) {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    headline: '',
    body: '',
    cta_text: 'Learn More',
    cta_url: '',
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
    setFormError(null);

    // No URL validation — for in-house promotions cta_url can be a section name (e.g. "desserts")

    setSaving(true);
    try {
      const res = await apiFetch(`${ADS_URL}/api/v1/ads/in-house/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          headline: form.headline,
          body: form.body || undefined,
          cta_text: form.cta_text || undefined,
          cta_url: form.cta_url || undefined,
          placements: form.placements,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
        }),
      });
      const d = await res.json() as { success: boolean; data?: Promotion; error?: string };
      if (d.success && d.data) {
        setPromos(p => [d.data!, ...p]);
        setShowForm(false);
        setFormError(null);
      } else {
        setFormError(d.error ?? 'Failed to create promotion');
      }
    } catch {
      setFormError('Unable to connect to ads service. Is it running?');
    }
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
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Menu Section <span className="text-gray-400 normal-case">(optional)</span></label>
              <input
                value={form.cta_url}
                onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))}
                placeholder="e.g. desserts, starters, drinks"
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
          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-600">
              {formError}
            </div>
          )}
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

// ── Jukebox Song Catalog Tab ─────────────────────────────────────────────────

interface JukeboxSong {
  id: string;
  title: string;
  artist: string;
  duration_secs: number;
  thumbnail: string | null;
  source: 'youtube' | 'spotify';
  source_id: string;
  source_url: string;
  genre: string | null;
  language: string | null;
  is_active: boolean;
}

const JUKEBOX_URL = import.meta.env.VITE_JUKEBOX_SERVICE_URL ?? 'http://localhost:3014';

interface JukeboxConfigData {
  is_enabled: boolean;
  price_per_song: number; // paise
  max_queue_length: number;
  max_songs_per_user: number;
  allow_dedications: boolean;
  content_filter: string;
}

function JukeboxTab({ tenantId, token }: { tenantId: string; token: string }) {
  const [songs, setSongs] = useState<JukeboxSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [songCount, setSongCount] = useState(0);

  // Config
  const [config, setConfig] = useState<JukeboxConfigData | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Add song form
  const [urlInput, setUrlInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  // Search
  const [search, setSearch] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const loadConfig = async () => {
    try {
      const res = await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/config`, { headers });
      const d = await res.json() as { success: boolean; data?: JukeboxConfigData };
      if (d.success && d.data) setConfig(d.data);
    } catch { /* ignore */ }
  };

  const saveConfig = async (updates: Partial<JukeboxConfigData>) => {
    setConfigSaving(true);
    try {
      const res = await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/config`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const d = await res.json() as { success: boolean; data?: JukeboxConfigData };
      if (d.success && d.data) {
        setConfig(d.data);
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2000);
      }
    } catch { /* ignore */ }
    setConfigSaving(false);
  };

  const loadSongs = async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (q) params.set('search', q);
      const res = await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/songs?${params}`, { headers });
      const d = await res.json() as { success: boolean; data?: JukeboxSong[] };
      if (d.success && d.data) setSongs(d.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadCount = async () => {
    try {
      const res = await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/songs/count`, { headers });
      const d = await res.json() as { success: boolean; data?: { count: number } };
      if (d.success && d.data) setSongCount(d.data.count);
    } catch { /* ignore */ }
  };

  useEffect(() => { void loadConfig(); void loadSongs(); void loadCount(); }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSong = async () => {
    if (!urlInput.trim()) return;
    setAdding(true);
    setAddError('');
    setAddSuccess('');
    try {
      const res = await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/songs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput.trim(),
          ...(genre ? { genre } : {}),
          ...(language ? { language } : {}),
        }),
      });
      const d = await res.json() as { success: boolean; data?: JukeboxSong; error?: string };
      if (d.success && d.data) {
        setSongs(prev => [d.data!, ...prev]);
        setSongCount(c => c + 1);
        setUrlInput('');
        setAddSuccess(`Added: ${d.data.title} - ${d.data.artist}`);
        setTimeout(() => setAddSuccess(''), 3000);
      } else {
        setAddError(d.error ?? 'Failed to add song');
      }
    } catch {
      setAddError('Failed to connect to jukebox service');
    }
    setAdding(false);
  };

  const handleBulkAdd = async () => {
    const urls = bulkInput.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setAdding(true);
    setAddError('');
    setAddSuccess('');
    try {
      const res = await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/songs/bulk`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          ...(genre ? { genre } : {}),
          ...(language ? { language } : {}),
        }),
      });
      const d = await res.json() as { success: boolean; data?: { added: number; failed: Array<{ url: string; error: string }> } };
      if (d.success && d.data) {
        const { added, failed } = d.data;
        setAddSuccess(`Added ${added} song${added !== 1 ? 's' : ''}${failed.length > 0 ? `, ${failed.length} failed` : ''}`);
        setBulkInput('');
        void loadSongs();
        void loadCount();
        setTimeout(() => setAddSuccess(''), 4000);
      }
    } catch {
      setAddError('Failed to connect to jukebox service');
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/songs/${id}`, {
        method: 'DELETE',
        headers,
      });
      setSongs(prev => prev.filter(s => s.id !== id));
      setSongCount(c => c - 1);
    } catch { /* ignore */ }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await apiFetch(`${JUKEBOX_URL}/api/v1/jukebox/${tenantId}/songs/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      setSongs(prev => prev.map(s => s.id === id ? { ...s, is_active: !isActive } : s));
    } catch { /* ignore */ }
  };

  const handleSearch = () => { void loadSongs(search || undefined); };

  const formatDuration = (secs: number) =>
    `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Jukebox Config */}
      {config && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Jukebox Settings</h3>
            {configSaved && <span className="text-xs text-green-600 font-medium">Saved!</span>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Price per song */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Price per Song (₹)</label>
              <input
                type="number" min={0} step={5}
                value={config.price_per_song / 100}
                onChange={(e) => {
                  const paise = Math.round(Number(e.target.value) * 100);
                  setConfig({ ...config, price_per_song: paise });
                }}
                onBlur={() => void saveConfig({ price_per_song: config.price_per_song })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              <p className="text-xs text-gray-400 mt-1">Set to 0 for free songs</p>
            </div>

            {/* Max queue length */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Max Queue Length</label>
              <input
                type="number" min={1} max={100}
                value={config.max_queue_length}
                onChange={(e) => setConfig({ ...config, max_queue_length: Number(e.target.value) })}
                onBlur={() => void saveConfig({ max_queue_length: config.max_queue_length })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>

            {/* Max songs per user */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Max Songs per Customer</label>
              <input
                type="number" min={1} max={10}
                value={config.max_songs_per_user}
                onChange={(e) => setConfig({ ...config, max_songs_per_user: Number(e.target.value) })}
                onBlur={() => void saveConfig({ max_songs_per_user: config.max_songs_per_user })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>

            {/* Content filter */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Content Filter</label>
              <select
                value={config.content_filter}
                onChange={(e) => { setConfig({ ...config, content_filter: e.target.value }); void saveConfig({ content_filter: e.target.value }); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 bg-white"
              >
                <option value="family">Family Friendly</option>
                <option value="adult">Adult</option>
                <option value="off">No Filter</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={config.allow_dedications}
                onChange={(e) => { setConfig({ ...config, allow_dedications: e.target.checked }); void saveConfig({ allow_dedications: e.target.checked }); }}
                className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Allow Dedications</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={config.is_enabled}
                onChange={(e) => { setConfig({ ...config, is_enabled: e.target.checked }); void saveConfig({ is_enabled: e.target.checked }); }}
                className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Jukebox Enabled</span>
            </label>
          </div>
        </div>
      )}

      {/* Song Catalog Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Song Catalog</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {songCount} song{songCount !== 1 ? 's' : ''} in your jukebox
          </p>
        </div>
        <button
          onClick={() => setShowBulk(!showBulk)}
          className="text-sm text-brand-500 hover:text-brand-600 font-medium"
        >
          {showBulk ? 'Single add' : 'Bulk add'}
        </button>
      </div>

      {/* Add Song */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">
          {showBulk ? 'Bulk Add Songs' : 'Add Song'}
        </h4>
        <p className="text-xs text-gray-500">
          Paste YouTube or Spotify URLs. Metadata is auto-extracted.
        </p>

        {!showBulk ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setAddError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAddSong()}
              placeholder="https://youtube.com/watch?v=... or https://open.spotify.com/track/..."
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <button
              onClick={() => { void handleAddSong(); }}
              disabled={adding || !urlInput.trim()}
              className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shrink-0"
            >
              {adding ? 'Adding...' : '+ Add'}
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={bulkInput}
              onChange={e => setBulkInput(e.target.value)}
              rows={6}
              placeholder="Paste one URL per line (max 50)..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none font-mono"
            />
            <button
              onClick={() => { void handleBulkAdd(); }}
              disabled={adding || !bulkInput.trim()}
              className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl"
            >
              {adding ? 'Processing...' : `Add ${bulkInput.split('\n').filter(u => u.trim()).length} URLs`}
            </button>
          </>
        )}

        {/* Optional genre/language */}
        <div className="flex gap-3">
          <input
            type="text"
            value={genre}
            onChange={e => setGenre(e.target.value)}
            placeholder="Genre (optional)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            type="text"
            value={language}
            onChange={e => setLanguage(e.target.value)}
            placeholder="Language (optional)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>

        {addError && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addError}</div>
        )}
        {addSuccess && (
          <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">{addSuccess}</div>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search songs..."
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-brand-500"
        />
        {search && (
          <button onClick={() => { setSearch(''); void loadSongs(); }} className="text-gray-400 hover:text-gray-600 text-sm px-2">
            Clear
          </button>
        )}
      </div>

      {/* Song List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading songs...</div>
      ) : songs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-3xl mb-2">🎵</div>
          <p className="text-gray-500 text-sm">No songs yet</p>
          <p className="text-gray-400 text-xs mt-1">Paste YouTube or Spotify URLs above to build your playlist</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-50">
          {songs.map(song => (
            <div key={song.id} className={`flex items-center gap-3 p-3 hover:bg-gray-50 ${!song.is_active ? 'opacity-50' : ''}`}>
              {/* Thumbnail */}
              {song.thumbnail ? (
                <img src={song.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-lg shrink-0">
                  🎵
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{song.title}</div>
                <div className="text-xs text-gray-500 truncate">{song.artist}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    song.source === 'youtube' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {song.source === 'youtube' ? 'YouTube' : 'Spotify'}
                  </span>
                  <span className="text-xs text-gray-400">{formatDuration(song.duration_secs)}</span>
                  {song.genre && <span className="text-xs text-gray-400">{song.genre}</span>}
                  {song.language && <span className="text-xs text-gray-400">{song.language}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { void handleToggle(song.id, song.is_active); }}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                    song.is_active
                      ? 'bg-green-50 text-green-600 hover:bg-green-100'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title={song.is_active ? 'Disable' : 'Enable'}
                >
                  {song.is_active ? 'Active' : 'Hidden'}
                </button>
                <button
                  onClick={() => { void handleDelete(song.id); }}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Billing Mode Card ──────────────────────────────────────────────────────

function BillingModeCard({ tenantId, token }: { tenantId: string; token: string }) {
  const [mode, setMode] = useState<'pay_later' | 'pay_now'>('pay_later');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  useEffect(() => {
    if (!tenantId || !token) return;
    apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then((data: { success: boolean; data?: { dine_in_billing_mode?: string } }) => {
        if (data.success && data.data?.dine_in_billing_mode) {
          setMode(data.data.dine_in_billing_mode as 'pay_later' | 'pay_now');
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [tenantId, token, tenantUrl]);

  const save = async (newMode: 'pay_later' | 'pay_now') => {
    setMode(newMode);
    setSaving(true);
    try {
      await apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dine_in_billing_mode: newMode }),
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="max-w-md bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-1">Dine-in Billing Mode</h3>
      <p className="text-xs text-gray-400 mb-4">How customers pay for dine-in orders</p>
      <div className="space-y-3">
        <button
          onClick={() => { void save('pay_later'); }}
          disabled={saving}
          className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
            mode === 'pay_later' ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${mode === 'pay_later' ? 'border-brand-500' : 'border-gray-300'}`}>
              {mode === 'pay_later' && <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
            </div>
            <div>
              <div className="font-medium text-sm text-gray-900">Pay Later (Tab)</div>
              <div className="text-xs text-gray-500 mt-0.5">Orders added to table tab. Restaurant collects payment at the end.</div>
            </div>
          </div>
        </button>
        <button
          onClick={() => { void save('pay_now'); }}
          disabled={saving}
          className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
            mode === 'pay_now' ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${mode === 'pay_now' ? 'border-brand-500' : 'border-gray-300'}`}>
              {mode === 'pay_now' && <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
            </div>
            <div>
              <div className="font-medium text-sm text-gray-900">Pay Now (Per Order)</div>
              <div className="text-xs text-gray-500 mt-0.5">Customer pays immediately when placing each order.</div>
            </div>
          </div>
        </button>
      </div>
      {saving && <div className="text-xs text-brand-500 mt-2">Saving...</div>}
    </div>
  );
}

export default function Settings() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<SettingsTab>('business');

  const auth_token = auth.token ?? '';

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'business', label: 'Business' },
    { id: 'branches', label: 'Branches' },
    { id: 'qr', label: 'QR Codes' },
    { id: 'kds', label: '📺 KDS' },
    { id: 'subscription', label: 'Subscription' },
    { id: 'promotions', label: '📢 Promotions' },
    { id: 'jukebox', label: '🎵 Jukebox' },
  ];

  return (
    <div>
      <SetupReturnBanner />
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
        <div className="space-y-4">
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
          <BillingModeCard tenantId={auth.user?.tenant_id ?? ''} token={auth_token} />
        </div>
      )}

      {tab === 'branches' && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="font-medium text-gray-900">Main Branch</div>
            <div className="text-sm text-gray-500 mt-1">Primary location</div>
          </div>
          <button className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors">
            + Add Branch (requires Starter plan)
          </button>
        </div>
      )}

      {tab === 'qr' && auth.user?.tenant_id && auth.token && (
        <QRCodesTab tenantId={auth.user.tenant_id} token={auth.token} />
      )}

      {tab === 'kds' && auth.user?.tenant_id && auth.token && (
        <KDSTab tenantId={auth.user.tenant_id} token={auth.token} />
      )}

      {tab === 'promotions' && auth.user?.tenant_id && auth.token && (
        <PromotionsTab tenantId={auth.user.tenant_id} token={auth.token} />
      )}

      {tab === 'jukebox' && auth.user?.tenant_id && auth.token && (
        <JukeboxTab tenantId={auth.user.tenant_id} token={auth.token} />
      )}

      {tab === 'subscription' && auth.user?.tenant_id && (
        <SubscriptionTab tenantId={auth.user.tenant_id} token={auth_token} />
      )}
    </div>
    </div>
  );
}
