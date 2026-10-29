import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../hooks/redux';

type ProcurementTab = 'pos' | 'grn' | 'bills' | 'vendors' | 'spend' | 'bids' | 'market';

interface POItem { id?: string; ingredient_id: string; ingredient_name: string; unit: string; quantity: number; unit_price: number; total_price?: number; received_quantity?: number; }
interface PO {
  id: string; po_number: string; status: string;
  vendor_id: string; vendor?: { name?: string };
  total_amount: number; subtotal: number; created_at: string;
  expected_delivery_date?: string;
  items: POItem[];
}
interface BillRow {
  id: string; bill_number: string; internal_ref: string;
  vendor_id: string; vendor?: { name?: string };
  status: string;
  bill_date: string; due_date: string;
  total_amount: number; amount_paid: number; amount_due: number;
  three_way_match_status: string;
}
interface VendorRow {
  id: string; name: string; contact_phone: string; contact_email: string;
  gstin?: string; rating: number; total_orders: number; total_spent: number;
  outstanding_balance: number; status: string; is_active: boolean;
}
interface GRNRow {
  id: string; grn_number: string; po_id: string; vendor_id: string;
  vendor?: { name?: string };
  status: string; received_at: string; total_received_value: number;
}
interface SpendSummary {
  total_billed: number; total_paid: number; outstanding: number; open_purchase_orders: number; payments_count: number;
  top_vendors: Array<{ vendor_id: string; vendor_name: string; amount: number }>;
  spend_by_category: Array<{ category: string; amount: number }>;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  partial: 'bg-violet-100 text-violet-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  awaiting_approval: 'bg-amber-100 text-amber-700',
  partially_paid: 'bg-indigo-100 text-indigo-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  disputed: 'bg-rose-100 text-rose-700',
  open: 'bg-blue-50 text-blue-700',
  closed: 'bg-gray-50 text-gray-500',
  awarded: 'bg-green-50 text-green-700',
  completed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  blacklisted: 'bg-red-100 text-red-700',
  pending_verification: 'bg-amber-100 text-amber-700',
};

const fmt = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string): string => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function Procurement() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<ProcurementTab>('pos');
  const [pos, setPos] = useState<PO[]>([]);
  const [grns, setGrns] = useState<GRNRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [billsFilter, setBillsFilter] = useState<'all' | 'due' | 'overdue'>('all');

  const procurementUrl = import.meta.env.VITE_PROCUREMENT_SERVICE_URL ?? 'http://localhost:3013';
  const tenant = auth.user?.tenant_id;
  const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const billPath = billsFilter === 'due' ? '/bills/due' : billsFilter === 'overdue' ? '/bills/overdue' : '/bills';
      const [poRes, grnRes, billRes, vendorRes, spendRes] = await Promise.all([
        fetch(`${procurementUrl}/api/v1/procurement/${tenant}/purchase-orders`, { headers }),
        fetch(`${procurementUrl}/api/v1/procurement/${tenant}/grn`, { headers }),
        fetch(`${procurementUrl}/api/v1/procurement/${tenant}${billPath}`, { headers }),
        fetch(`${procurementUrl}/api/v1/procurement/${tenant}/vendors`, { headers }),
        fetch(`${procurementUrl}/api/v1/procurement/${tenant}/spend/summary`, { headers }),
      ]);
      if (poRes.ok) { const j = await poRes.json() as { data?: { purchase_orders: PO[] } }; setPos(j.data?.purchase_orders ?? []); }
      if (grnRes.ok) { const j = await grnRes.json() as { data?: { grns: GRNRow[] } }; setGrns(j.data?.grns ?? []); }
      if (billRes.ok) { const j = await billRes.json() as { data?: { bills: BillRow[] } }; setBills(j.data?.bills ?? []); }
      if (vendorRes.ok) { const j = await vendorRes.json() as { data?: { vendors: VendorRow[] } }; setVendors(j.data?.vendors ?? []); }
      if (spendRes.ok) { const j = await spendRes.json() as { data?: SpendSummary }; setSpend(j.data ?? null); }
    } finally { setLoading(false); }
  }, [tenant, procurementUrl, headers, billsFilter]);

  useEffect(() => { void refresh(); }, [tab, billsFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: Array<{ id: ProcurementTab; label: string; count?: number }> = [
    { id: 'pos', label: 'Purchase Orders', count: pos.length },
    { id: 'grn', label: 'Receiving (GRN)', count: grns.length },
    { id: 'bills', label: 'Bills', count: bills.length },
    { id: 'vendors', label: 'Vendors', count: vendors.length },
    { id: 'spend', label: 'Spend Report' },
    { id: 'bids', label: 'Bids' },
    { id: 'market', label: 'Market' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Procurement</h1>
        <button onClick={() => void refresh()} className="text-sm text-gray-500 hover:text-gray-700">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}{typeof t.count === 'number' && <span className="ml-1.5 text-xs text-gray-400">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'pos' && <POTab pos={pos} procurementUrl={procurementUrl} tenant={tenant ?? undefined} headers={headers} onChanged={() => void refresh()} />}
      {tab === 'grn' && <GRNTab grns={grns} pos={pos} procurementUrl={procurementUrl} tenant={tenant ?? undefined} headers={headers} onChanged={() => void refresh()} />}
      {tab === 'bills' && <BillsTab bills={bills} filter={billsFilter} setFilter={setBillsFilter} procurementUrl={procurementUrl} tenant={tenant ?? undefined} headers={headers} onChanged={() => void refresh()} />}
      {tab === 'vendors' && <VendorsTab vendors={vendors} />}
      {tab === 'spend' && <SpendTab spend={spend} />}
      {tab === 'bids' && <div className="text-sm text-gray-500">Bid management coming soon — view requests in market view.</div>}
      {tab === 'market' && <div className="text-sm text-gray-500">Market view — visit the dedicated Market page.</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700'}`}>{status.replace(/_/g, ' ')}</span>;
}

// ─── POs ─────────────────────────────────────────────────────────────────────

function POTab({ pos, procurementUrl, tenant, headers, onChanged }: { pos: PO[]; procurementUrl: string; tenant?: string; headers: Record<string, string>; onChanged: () => void }) {
  const action = async (po_id: string, op: 'approve' | 'send' | 'cancel') => {
    if (!tenant) return;
    const path = op === 'cancel' ? `/purchase-orders/${po_id}/cancel` : `/purchase-orders/${po_id}/${op}`;
    const reason = op === 'cancel' ? prompt('Cancel reason?') ?? '' : undefined;
    await fetch(`${procurementUrl}/api/v1/procurement/${tenant}${path}`, {
      method: 'PATCH', headers, body: reason !== undefined ? JSON.stringify({ reason }) : undefined,
    });
    onChanged();
  };
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-4 py-3">PO #</th>
            <th className="text-left px-4 py-3">Vendor</th>
            <th className="text-right px-4 py-3">Amount</th>
            <th className="text-left px-4 py-3">Expected</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-right px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {pos.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No purchase orders yet.</td></tr>}
          {pos.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-xs">{p.po_number}<div className="text-[10px] text-gray-400">{p.items.length} items</div></td>
              <td className="px-4 py-3">{p.vendor?.name ?? '—'}</td>
              <td className="px-4 py-3 text-right font-medium">{fmt(p.total_amount)}</td>
              <td className="px-4 py-3">{fmtDate(p.expected_delivery_date)}</td>
              <td className="px-4 py-3"><StatusPill status={p.status} /></td>
              <td className="px-4 py-3 text-right space-x-2">
                {p.status === 'draft' && <button onClick={() => action(p.id, 'approve')} className="text-xs text-brand-600 hover:underline">Approve</button>}
                {p.status === 'approved' && <button onClick={() => action(p.id, 'send')} className="text-xs text-brand-600 hover:underline">Send</button>}
                {p.status !== 'received' && p.status !== 'cancelled' && <button onClick={() => action(p.id, 'cancel')} className="text-xs text-red-600 hover:underline">Cancel</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── GRN ─────────────────────────────────────────────────────────────────────

function GRNTab({ grns, pos, procurementUrl, tenant, headers, onChanged }: { grns: GRNRow[]; pos: PO[]; procurementUrl: string; tenant?: string; headers: Record<string, string>; onChanged: () => void }) {
  const [receiving, setReceiving] = useState<PO | null>(null);
  const completeGrn = async (grn_id: string) => {
    if (!tenant) return;
    const res = await fetch(`${procurementUrl}/api/v1/procurement/${tenant}/grn/${grn_id}/complete`, { method: 'POST', headers });
    const body = (await res.json()) as { success: boolean; data?: { warnings?: string[] }; error?: string };
    if (body.success && body.data?.warnings?.length) alert(`Completed with warnings:\n${body.data.warnings.join('\n')}`);
    onChanged();
  };

  const eligiblePOs = pos.filter((p) => p.status === 'sent' || p.status === 'partial' || p.status === 'approved');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{grns.length} GRN entries</p>
        <select
          value=""
          onChange={(e) => { const po = eligiblePOs.find((p) => p.id === e.target.value); if (po) setReceiving(po); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">+ Receive against PO…</option>
          {eligiblePOs.map((p) => <option key={p.id} value={p.id}>{p.po_number} — {p.vendor?.name ?? ''}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">GRN #</th>
              <th className="text-left px-4 py-3">Vendor</th>
              <th className="text-left px-4 py-3">Received</th>
              <th className="text-right px-4 py-3">Value</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {grns.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No goods received yet.</td></tr>}
            {grns.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{g.grn_number}</td>
                <td className="px-4 py-3">{g.vendor?.name ?? '—'}</td>
                <td className="px-4 py-3">{fmtDate(g.received_at)}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(g.total_received_value)}</td>
                <td className="px-4 py-3"><StatusPill status={g.status} /></td>
                <td className="px-4 py-3 text-right">
                  {g.status === 'draft' && <button onClick={() => completeGrn(g.id)} className="text-xs text-brand-600 hover:underline">Complete & sync inventory</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {receiving && (
        <ReceiveModal po={receiving} procurementUrl={procurementUrl} tenant={tenant!} headers={headers} onClose={() => setReceiving(null)} onCreated={() => { setReceiving(null); onChanged(); }} />
      )}
    </div>
  );
}

function ReceiveModal({ po, procurementUrl, tenant, headers, onClose, onCreated }: { po: PO; procurementUrl: string; tenant: string; headers: Record<string, string>; onClose: () => void; onCreated: () => void }) {
  const [items, setItems] = useState(po.items.map((i) => ({
    po_item_id: i.id ?? '',
    ingredient_id: i.ingredient_id,
    ingredient_name: i.ingredient_name,
    unit: i.unit,
    ordered_quantity: i.quantity,
    received_quantity: Math.max(0, i.quantity - (i.received_quantity ?? 0)),
    rejected_quantity: 0,
    unit_price: i.unit_price,
    batch_number: '',
    expiry_date: '',
  })));
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`${procurementUrl}/api/v1/procurement/${tenant}/grn`, {
        method: 'POST', headers,
        body: JSON.stringify({
          po_id: po.id,
          branch_id: po.items[0] ? (po as unknown as { branch_id?: string }).branch_id ?? '' : '',
          vehicle_number: vehicle, driver_name: driver,
          items: items.map((it) => ({
            po_item_id: it.po_item_id || undefined,
            ingredient_id: it.ingredient_id,
            ingredient_name: it.ingredient_name,
            unit: it.unit,
            ordered_quantity: it.ordered_quantity,
            received_quantity: it.received_quantity,
            rejected_quantity: it.rejected_quantity,
            unit_price: it.unit_price,
            batch_number: it.batch_number || undefined,
            expiry_date: it.expiry_date ? new Date(it.expiry_date).toISOString() : undefined,
          })),
        }),
      });
      const body = (await res.json()) as { success: boolean; error?: string };
      if (!body.success) throw new Error(body.error ?? 'Failed');
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-auto">
        <h3 className="text-lg font-semibold mb-4">Receive against {po.po_number}</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <input placeholder="Vehicle number" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Driver name" value={driver} onChange={(e) => setDriver(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-2 py-2">Item</th>
              <th className="text-right px-2 py-2">Ordered</th>
              <th className="text-right px-2 py-2">Receiving</th>
              <th className="text-right px-2 py-2">Rejected</th>
              <th className="text-left px-2 py-2">Batch</th>
              <th className="text-left px-2 py-2">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-2 py-2">{it.ingredient_name}</td>
                <td className="px-2 py-2 text-right text-gray-600">{it.ordered_quantity} {it.unit}</td>
                <td className="px-2 py-2 text-right">
                  <input type="number" value={it.received_quantity} onChange={(e) => { const v = parseFloat(e.target.value) || 0; const c = [...items]; c[idx]!.received_quantity = v; setItems(c); }} className="w-20 border rounded px-2 py-1 text-right" />
                </td>
                <td className="px-2 py-2 text-right">
                  <input type="number" value={it.rejected_quantity} onChange={(e) => { const v = parseFloat(e.target.value) || 0; const c = [...items]; c[idx]!.rejected_quantity = v; setItems(c); }} className="w-20 border rounded px-2 py-1 text-right" />
                </td>
                <td className="px-2 py-2">
                  <input value={it.batch_number} onChange={(e) => { const c = [...items]; c[idx]!.batch_number = e.target.value; setItems(c); }} className="w-24 border rounded px-2 py-1" />
                </td>
                <td className="px-2 py-2">
                  <input type="date" value={it.expiry_date} onChange={(e) => { const c = [...items]; c[idx]!.expiry_date = e.target.value; setItems(c); }} className="border rounded px-2 py-1" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Create draft GRN'}</button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Click "Complete & sync inventory" on the GRN row to push stock to inventory.</p>
      </div>
    </div>
  );
}

// ─── Bills ───────────────────────────────────────────────────────────────────

function BillsTab({ bills, filter, setFilter, procurementUrl, tenant, headers, onChanged }: { bills: BillRow[]; filter: 'all' | 'due' | 'overdue'; setFilter: (f: 'all' | 'due' | 'overdue') => void; procurementUrl: string; tenant?: string; headers: Record<string, string>; onChanged: () => void }) {
  const [paying, setPaying] = useState<BillRow | null>(null);
  const totals = bills.reduce((acc, b) => ({
    outstanding: acc.outstanding + (b.status === 'paid' || b.status === 'cancelled' ? 0 : b.amount_due),
    paid: acc.paid + b.amount_paid,
    total: acc.total + b.total_amount,
  }), { outstanding: 0, paid: 0, total: 0 });

  const approveBill = async (id: string) => {
    if (!tenant) return;
    await fetch(`${procurementUrl}/api/v1/procurement/${tenant}/bills/${id}/approve`, { method: 'PATCH', headers });
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Outstanding" value={fmt(totals.outstanding)} tone="amber" />
        <Stat label="Paid (period)" value={fmt(totals.paid)} tone="green" />
        <Stat label="Total billed" value={fmt(totals.total)} />
      </div>
      <div className="flex gap-2">
        {(['all', 'due', 'overdue'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm capitalize ${filter === f ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'due' ? 'Due (7d)' : f}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Invoice</th>
              <th className="text-left px-4 py-3">Vendor</th>
              <th className="text-left px-4 py-3">Due</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Outstanding</th>
              <th className="text-left px-4 py-3">Match</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bills.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No bills.</td></tr>}
            {bills.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{b.bill_number}<div className="text-[10px] text-gray-400">{b.internal_ref}</div></td>
                <td className="px-4 py-3">{b.vendor?.name ?? '—'}</td>
                <td className="px-4 py-3">{fmtDate(b.due_date)}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(b.total_amount)}</td>
                <td className="px-4 py-3 text-right text-amber-700">{fmt(b.amount_due)}</td>
                <td className="px-4 py-3"><StatusPill status={b.three_way_match_status} /></td>
                <td className="px-4 py-3"><StatusPill status={b.status} /></td>
                <td className="px-4 py-3 text-right space-x-2">
                  {b.status === 'awaiting_approval' && <button onClick={() => approveBill(b.id)} className="text-xs text-brand-600 hover:underline">Approve</button>}
                  {b.status !== 'paid' && b.status !== 'cancelled' && <button onClick={() => setPaying(b)} className="text-xs text-green-600 hover:underline">Pay</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paying && <PayModal bill={paying} procurementUrl={procurementUrl} tenant={tenant!} headers={headers} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); onChanged(); }} />}
    </div>
  );
}

function PayModal({ bill, procurementUrl, tenant, headers, onClose, onPaid }: { bill: BillRow; procurementUrl: string; tenant: string; headers: Record<string, string>; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = useState((bill.amount_due / 100).toString());
  const [method, setMethod] = useState<'bank_transfer' | 'upi' | 'cheque' | 'cash' | 'card' | 'other'>('bank_transfer');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      const paise = Math.round(parseFloat(amount) * 100);
      const res = await fetch(`${procurementUrl}/api/v1/procurement/${tenant}/bills/${bill.id}/pay`, {
        method: 'POST', headers,
        body: JSON.stringify({ amount: paise, method, reference_number: ref || undefined }),
      });
      const body = (await res.json()) as { success: boolean; error?: string };
      if (!body.success) throw new Error(body.error ?? 'Failed');
      onPaid();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-1">Record payment</h3>
        <p className="text-xs text-gray-500 mb-4">Bill {bill.bill_number} · Due {fmt(bill.amount_due)}</p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Amount (₹)</span>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Reference (UTR / cheque no.)</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">{saving ? 'Recording…' : 'Record payment'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

function VendorsTab({ vendors }: { vendors: VendorRow[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex justify-between items-center bg-gray-50">
        <p className="text-sm text-gray-600">{vendors.length} vendors</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-4 py-3">Vendor</th>
            <th className="text-left px-4 py-3">Contact</th>
            <th className="text-left px-4 py-3">GSTIN</th>
            <th className="text-right px-4 py-3">Orders</th>
            <th className="text-right px-4 py-3">Total spent</th>
            <th className="text-right px-4 py-3">Outstanding</th>
            <th className="text-left px-4 py-3">Rating</th>
            <th className="text-left px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {vendors.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No vendors.</td></tr>}
          {vendors.map((v) => (
            <tr key={v.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
              <td className="px-4 py-3 text-gray-500">{v.contact_phone}<div className="text-[10px]">{v.contact_email}</div></td>
              <td className="px-4 py-3 font-mono text-xs">{v.gstin ?? '—'}</td>
              <td className="px-4 py-3 text-right">{v.total_orders}</td>
              <td className="px-4 py-3 text-right font-medium">{fmt(v.total_spent)}</td>
              <td className="px-4 py-3 text-right text-amber-700">{fmt(v.outstanding_balance)}</td>
              <td className="px-4 py-3 text-amber-600">{v.rating.toFixed(1)} ★</td>
              <td className="px-4 py-3"><StatusPill status={v.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Spend ───────────────────────────────────────────────────────────────────

function SpendTab({ spend }: { spend: SpendSummary | null }) {
  if (!spend) return <div className="text-sm text-gray-500">Loading spend report…</div>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Total billed (30d)" value={fmt(spend.total_billed)} />
        <Stat label="Total paid" value={fmt(spend.total_paid)} tone="green" />
        <Stat label="Outstanding" value={fmt(spend.outstanding)} tone="amber" />
        <Stat label="Open POs" value={spend.open_purchase_orders.toString()} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top vendors</h3>
          <ul className="space-y-2">
            {spend.top_vendors.length === 0 && <li className="text-sm text-gray-500">No data.</li>}
            {spend.top_vendors.map((v) => (
              <li key={v.vendor_id} className="flex justify-between text-sm">
                <span className="text-gray-700">{v.vendor_name}</span>
                <span className="font-medium">{fmt(v.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Spend by category</h3>
          <ul className="space-y-2">
            {spend.spend_by_category.length === 0 && <li className="text-sm text-gray-500">No data.</li>}
            {spend.spend_by_category.map((c) => (
              <li key={c.category} className="flex justify-between text-sm">
                <span className="text-gray-700">{c.category}</span>
                <span className="font-medium">{fmt(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' }) {
  const cls = tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
