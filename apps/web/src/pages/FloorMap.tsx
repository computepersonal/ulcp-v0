import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
import SetupReturnBanner from '../components/SetupReturnBanner';
import { apiFetch } from '../lib/apiFetch';

function OnboardReturnBanner() {
  const navigate = useNavigate();
  if (!localStorage.getItem('onboarding_floormap_return')) return null;
  return (
    <div className="bg-indigo-600 text-white px-4 py-2.5 flex items-center justify-between text-sm">
      <span className="font-medium">You came here from onboarding</span>
      <button
        onClick={() => {
          localStorage.removeItem('onboarding_floormap_return');
          navigate('/onboard');
        }}
        className="flex items-center gap-1.5 bg-white text-indigo-600 font-semibold px-3 py-1 rounded-lg text-xs hover:bg-indigo-50 transition-colors"
      >
        ← Back to onboarding
      </button>
    </div>
  );
}

type TableStatus = 'available' | 'occupied' | 'billed' | 'pending_confirmation';

interface TableData {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  is_active: boolean;
  waiter_name?: string;
  item_count?: number;
  occupied_since?: string;
  section_name?: string;
  section_id?: string;
  session_id?: string;
  payment_done?: boolean; // true when all orders for this table are paid
}

interface Section {
  id: string;
  name: string;
  is_active: boolean;
}

function getElapsed(since?: string): string {
  if (!since) return '';
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  return `${mins}m`;
}

// ─── Table shape icon ─────────────────────────────────────────────────────────
// Top-down restaurant-table glyph. Shape reflects capacity, color reflects status.
//   capacity 1–2  → bistro 2-top
//            3–4  → square 4-top
//            5–6  → 6-top
//            7+   → long banquet
//   status   available    → green
//            occupied     → amber
//            billed       → red
//            disabled     → grey
function TableShape({
  capacity,
  status,
  disabled = false,
  className = '',
}: {
  capacity: number;
  status: TableStatus;
  disabled?: boolean;
  className?: string;
}) {
  const palette = disabled
    ? { stroke: '#9ca3af', fill: '#f3f4f6', chair: '#d1d5db' } // grey
    : status === 'billed'
      ? { stroke: '#ef4444', fill: '#ffffff', chair: '#fca5a5' } // red
      : status === 'occupied' || status === 'pending_confirmation'
        ? { stroke: '#f59e0b', fill: '#fffbeb', chair: '#fbbf24' } // amber
        : { stroke: '#10b981', fill: '#ffffff', chair: '#34d399' }; // green

  // Reusable chair bump
  const chair = (cx: number, cy: number, w = 5, h = 3.5) => (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx="1.2"
      fill={palette.chair}
    />
  );

  const sw = 1.6;

  if (capacity <= 2) {
    return (
      <svg width="34" height="30" viewBox="0 0 40 32" fill="none" className={className}>
        {chair(20, 5)}
        {chair(20, 27)}
        <rect x="11" y="10" width="18" height="12" rx="3" fill={palette.fill} stroke={palette.stroke} strokeWidth={sw} />
      </svg>
    );
  }
  if (capacity <= 4) {
    return (
      <svg width="34" height="30" viewBox="0 0 40 32" fill="none" className={className}>
        {chair(14, 4)} {chair(26, 4)}
        {chair(14, 28)} {chair(26, 28)}
        <rect x="7" y="9" width="26" height="14" rx="3" fill={palette.fill} stroke={palette.stroke} strokeWidth={sw} />
      </svg>
    );
  }
  if (capacity <= 6) {
    return (
      <svg width="34" height="30" viewBox="0 0 40 32" fill="none" className={className}>
        {chair(10, 4)} {chair(20, 4)} {chair(30, 4)}
        {chair(10, 28)} {chair(20, 28)} {chair(30, 28)}
        <rect x="3" y="9" width="34" height="14" rx="3" fill={palette.fill} stroke={palette.stroke} strokeWidth={sw} />
      </svg>
    );
  }
  // 7+ banquet
  return (
    <svg width="34" height="30" viewBox="0 0 40 32" fill="none" className={className}>
      {chair(9, 4)} {chair(17, 4)} {chair(25, 4)} {chair(33, 4)}
      {chair(9, 28)} {chair(17, 28)} {chair(25, 28)} {chair(33, 28)}
      {chair(2.5, 16, 3.5, 5)} {chair(37.5, 16, 3.5, 5)}
      <rect x="1" y="9" width="38" height="14" rx="6" fill={palette.fill} stroke={palette.stroke} strokeWidth={sw} />
    </svg>
  );
}

// ─── Auto-naming helpers ──────────────────────────────────────────────────────

/** Returns the next available number for a given name prefix across all tables */
function nextTableNumber(tables: TableData[], prefix: string): number {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`, 'i');
  let max = 0;
  for (const t of tables) {
    const m = t.name.match(re);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

function autoTableName(tables: TableData[], sectionId: string | undefined, sections: Section[]): string {
  if (sectionId) {
    const section = sections.find((s) => s.id === sectionId);
    const prefix = section?.name ?? 'Table';
    return `${prefix} ${nextTableNumber(tables, prefix)}`;
  }
  return `Table ${nextTableNumber(tables, 'Table')}`;
}

// ─── Add table modal ──────────────────────────────────────────────────────────

interface AddTableModalProps {
  tables: TableData[];
  sections: Section[];
  defaultSectionId?: string;
  onClose: () => void;
  onSave: (name: string, capacity: number, sectionId?: string) => Promise<void>;
}

function AddTableModal({ tables, sections, defaultSectionId, onClose, onSave }: AddTableModalProps) {
  const [capacity, setCapacity] = useState(4);
  const [sectionId, setSectionId] = useState(defaultSectionId ?? sections[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewName = autoTableName(tables, sectionId || undefined, sections);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(previewName, capacity, sectionId || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Add a table</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Auto-generated name preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-0.5">Table name (auto-generated)</div>
              <div className="font-semibold text-gray-900">{previewName}</div>
            </div>
            <span className="text-xs bg-brand-50 text-brand-600 border border-brand-100 px-2 py-0.5 rounded-full font-medium">Preview</span>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Seating capacity</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCapacity((c) => Math.max(1, c - 1))}
                className="w-10 h-10 rounded-full border border-gray-200 text-gray-600 font-bold hover:border-brand-300 transition-colors"
              >
                −
              </button>
              <span className="text-lg font-semibold text-gray-900 w-8 text-center">{capacity}</span>
              <button
                type="button"
                onClick={() => setCapacity((c) => Math.min(20, c + 1))}
                className="w-10 h-10 rounded-full border border-gray-200 text-gray-600 font-bold hover:border-brand-300 transition-colors"
              >
                +
              </button>
              <span className="text-sm text-gray-400">seats</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Floor zone</label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors bg-white"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Adding...' : 'Add table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add section modal ────────────────────────────────────────────────────────

interface AddSectionModalProps {
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

function AddSectionModal({ onClose, onSave }: AddSectionModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Section name is required'); return; }
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create section');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Add a floor zone</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Zone name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Hall, Outdoor, Bar"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
              {saving ? 'Adding...' : 'Add zone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Unassigned table row ─────────────────────────────────────────────────────

interface UnassignedTableRowProps {
  tables: TableData[];
  sectionName: string;
  sectionId: string;
  onMove: (table: TableData, sectionId: string) => Promise<void>;
}

function UnassignedTableRow({ tables, sectionName, sectionId, onMove }: UnassignedTableRowProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const handleClick = async (table: TableData) => {
    setLoadingId(table.id);
    setErrorId(null);
    try {
      await onMove(table, sectionId);
    } catch {
      setErrorId(table.id);
      setTimeout(() => setErrorId(null), 3000);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide px-2">
          Unassigned tables — click to add to {sectionName}
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <div className="flex flex-wrap gap-2">
        {tables.map((table) => {
          const isLoading = loadingId === table.id;
          const hasError = errorId === table.id;
          return (
            <button
              key={table.id}
              disabled={isLoading}
              onClick={() => void handleClick(table)}
              className={`flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-xl text-sm transition-colors disabled:opacity-50 ${
                hasError
                  ? 'border-red-300 bg-red-50 text-red-600'
                  : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50 text-gray-600 hover:text-brand-600'
              }`}
            >
              <span className="font-medium">{table.name}</span>
              <span className="text-xs text-gray-400">{table.capacity} seats</span>
              <span className={`text-xs font-medium ${hasError ? 'text-red-500' : 'text-brand-500'}`}>
                {isLoading ? '...' : hasError ? 'Failed' : '+ Add'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Open table modal (pax count) ────────────────────────────────────────────

interface OpenTableModalProps {
  table: TableData;
  onClose: () => void;
  onConfirm: (tableId: string, pax: number) => Promise<void>;
}

function OpenTableModal({ table, onClose, onConfirm }: OpenTableModalProps) {
  const [pax, setPax] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onConfirm(table.id, pax);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open table');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Open {table.name}</h3>
            <p className="text-sm text-gray-500">{table.capacity} seats available</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-3">How many guests?</label>
            <div className="flex items-center gap-4 justify-center">
              <button
                type="button"
                onClick={() => setPax((p) => Math.max(1, p - 1))}
                className="w-12 h-12 rounded-full border-2 border-gray-200 text-gray-600 text-xl font-bold hover:border-brand-400 transition-colors"
              >
                −
              </button>
              <span className="text-3xl font-bold text-gray-900 w-12 text-center">{pax}</span>
              <button
                type="button"
                onClick={() => setPax((p) => Math.min(table.capacity, p + 1))}
                className="w-12 h-12 rounded-full border-2 border-gray-200 text-gray-600 text-xl font-bold hover:border-brand-400 transition-colors"
              >
                +
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">Max {table.capacity} for this table</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-gray-300">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
              {saving ? 'Opening...' : 'Open Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Rename zone modal ────────────────────────────────────────────────────────

interface RenameZoneModalProps {
  initialName: string;
  onClose: () => void;
  onSave: (newName: string) => Promise<void>;
}

function RenameZoneModal({ initialName, onClose, onSave }: RenameZoneModalProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (name.trim() === initialName) { onClose(); return; }
    setSaving(true);
    try {
      await onSave(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Rename zone</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
          />
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main floor map ───────────────────────────────────────────────────────────

export default function FloorMap() {
  const auth = useAppSelector((s) => s.auth);
  const navigate = useNavigate();

  const [tables, setTables] = useState<TableData[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [activeSection, setActiveSection] = useState<string>('All');
  const [showAddTable, setShowAddTable] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showOpenTable, setShowOpenTable] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [editingCapacity, setEditingCapacity] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoneMenu, setZoneMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingZone, setRenamingZone] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteZone, setConfirmDeleteZone] = useState<Section | null>(null);
  const [zoneActionError, setZoneActionError] = useState('');

  const canEditTables = (() => {
    const role = auth.user?.role ?? '';
    return ['tenant_owner', 'primary_owner', 'managing_partner', 'branch_manager'].includes(role);
  })();

  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';
  const tenantId = auth.user?.tenant_id ?? '';

  const loadData = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    try {
      // Get primary branch
      const branchRes = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (!branchRes.ok) { setLoading(false); return; }
      const branchData = (await branchRes.json()) as {
        success: boolean;
        data?: { branches?: Array<{ id: string; is_primary?: boolean }> };
      };
      const branches = branchData.data?.branches ?? [];
      if (branches.length === 0) { setLoading(false); return; }
      const primary = branches.find((b) => b.is_primary) ?? branches[0]!;
      setBranchId(primary.id);

      // Fetch sections
      const sectionRes = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${primary.id}/sections`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const sectionList: Section[] = [];
      const sectionMap: Record<string, string> = {};
      if (sectionRes.ok) {
        const sd = (await sectionRes.json()) as {
          success: boolean;
          data?: { sections?: Array<{ id: string; name: string; is_active?: boolean }> };
        };
        for (const s of sd.data?.sections ?? []) {
          sectionList.push({ id: s.id, name: s.name, is_active: s.is_active !== false });
          sectionMap[s.id] = s.name;
        }
      }
      setSections(sectionList);

      // Fetch tables
      const tableRes = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${primary.id}/tables`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (!tableRes.ok) { setLoading(false); return; }
      const td = (await tableRes.json()) as {
        success: boolean;
        data?: {
          tables?: Array<{
            id: string; name: string; capacity: number;
            section_id?: string | null; status?: TableStatus;
            is_active?: boolean;
          }>;
        };
      };
      // Fetch active orders to determine table occupancy + payment status
      const ordersRes = await apiFetch(
        `${orderServiceUrl}/api/v1/orders/${tenantId}?branch_id=${primary.id}&status=pending,preparing,ready,completed`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      ).catch(() => null);

      // Build lookup: table_id → { hasActiveOrders, allPaid }
      const tableOrderInfo: Record<string, { hasActiveOrders: boolean; allPaid: boolean }> = {};
      if (ordersRes?.ok) {
        const od = (await ordersRes.json()) as {
          success: boolean;
          data?: { orders: Array<{ table_id?: string | null; status: string; payment_status: string }> };
        };
        for (const o of od.data?.orders ?? []) {
          if (!o.table_id) continue;
          if (!tableOrderInfo[o.table_id]) {
            tableOrderInfo[o.table_id] = { hasActiveOrders: true, allPaid: true };
          }
          // An order that isn't completed+paid means not all paid
          if (o.status !== 'completed' || o.payment_status !== 'paid') {
            tableOrderInfo[o.table_id].allPaid = false;
          }
        }
      }

      setTables(
        (td.data?.tables ?? []).map((t) => {
          const info = tableOrderInfo[t.id];
          // If table has active orders but DB says available, override to occupied
          const dbStatus = t.status ?? 'available';
          let status: TableStatus = dbStatus;
          if (dbStatus === 'available' && info?.hasActiveOrders && !info.allPaid) {
            status = 'occupied';
          }
          return {
            id: t.id, name: t.name, capacity: t.capacity,
            status,
            is_active: t.is_active !== false,
            section_id: t.section_id ?? undefined,
            section_name: t.section_id ? sectionMap[t.section_id] : undefined,
            payment_done: info?.allPaid === true && dbStatus === 'billed',
          };
        })
      );
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [tenantId, auth.token, tenantServiceUrl, orderServiceUrl]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleAddTable = async (name: string, capacity: number, sectionId?: string) => {
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ name, capacity, section_id: sectionId || undefined }),
      }
    );
    const data = (await res.json()) as { success: boolean; error?: string; data?: { table: { id: string; name: string; capacity: number; section_id?: string } } };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to create table');
    // Append new table locally — no need to refetch
    const t = data.data!.table;
    const sec = sections.find((s) => s.id === t.section_id);
    setTables((prev) => [...prev, {
      id: t.id, name: t.name, capacity: t.capacity,
      status: 'available',
      is_active: true,
      section_id: t.section_id,
      section_name: sec?.name,
    }]);
  };

  const handleAddSection = async (name: string) => {
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sections`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ name }),
      }
    );
    const data = (await res.json()) as { success: boolean; error?: string; data?: { section: { id: string; name: string } } };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to create section');
    const s = data.data!.section;
    setSections((prev) => [...prev, { id: s.id, name: s.name, is_active: true }]);
  };

  // ── Zone management ──────────────────────────────────────────────────────────

  const handleRenameSection = async (sectionId: string, newName: string) => {
    const oldSection = sections.find((s) => s.id === sectionId);
    const oldName = oldSection?.name ?? '';

    // Single endpoint: atomically renames zone + all prefixed tables in a DB transaction
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sections/${sectionId}/rename`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ name: newName }),
      }
    );
    const data = (await res.json()) as { success: boolean; error?: string };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to rename zone');

    if (activeSection === oldName) setActiveSection(newName);
    setSelectedTable(null);
    await loadData();
  };

  const handleToggleSectionActive = async (section: Section) => {
    const newActive = !section.is_active;
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sections/${section.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ is_active: newActive }),
      }
    );
    const data = (await res.json()) as { success: boolean; error?: string };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to update zone');
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, is_active: newActive } : s));
  };

  const handleDeleteSection = async (section: Section) => {
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sections/${section.id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } }
    );
    const data = (await res.json()) as { success: boolean; error?: string };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to delete zone');
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    // Tables in this zone become unassigned
    setTables((prev) => prev.map((t) =>
      t.section_id === section.id ? { ...t, section_id: undefined, section_name: undefined } : t
    ));
    setActiveSection('All');
  };

  // ── Session actions ──────────────────────────────────────────────────────────

  const handleOpenTable = async (tableId: string, pax: number) => {
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ table_id: tableId, pax }),
      }
    );
    const data = (await res.json()) as {
      success: boolean; error?: string;
      data?: { session: { id: string; status: string }; table: { id: string; status: string } };
    };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to open table');
    const newStatus = (data.data!.table.status as TableStatus) ?? 'occupied';
    const sessionId = data.data!.session.id;
    setTables((prev) => prev.map((t) =>
      t.id === tableId ? { ...t, status: newStatus, session_id: sessionId, occupied_since: new Date().toISOString() } : t
    ));
    setSelectedTable((prev) => prev?.id === tableId
      ? { ...prev, status: newStatus, session_id: sessionId, occupied_since: new Date().toISOString() }
      : prev
    );
  };

  const handleConfirmTable = async (table: TableData) => {
    if (!table.session_id) return;
    setActionLoading(true);
    setActionError('');
    try {
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sessions/${table.session_id}/confirm`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to confirm table');
      setTables((prev) => prev.map((t) =>
        t.id === table.id ? { ...t, status: 'occupied' } : t
      ));
      setSelectedTable((prev) => prev?.id === table.id
        ? { ...prev, status: 'occupied' }
        : prev
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to confirm table');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseTable = async (table: TableData) => {
    setActionLoading(true);
    setActionError('');
    try {
      // If table has a session, close it via session endpoint
      if (table.session_id) {
        const res = await apiFetch(
          `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sessions/${table.session_id}/close`,
          { method: 'PATCH', headers: { Authorization: `Bearer ${auth.token}` } }
        );
        const data = (await res.json()) as { success: boolean; error?: string };
        if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to close table');
      } else {
        // No session — directly set table status back to available
        const res = await apiFetch(
          `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${table.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ status: 'available' }),
          }
        );
        const data = (await res.json()) as { success: boolean; error?: string };
        if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to close table');
      }
      setTables((prev) => prev.map((t) =>
        t.id === table.id ? { ...t, status: 'available', session_id: undefined, occupied_since: undefined } : t
      ));
      setSelectedTable((prev) => prev?.id === table.id
        ? { ...prev, status: 'available', session_id: undefined, occupied_since: undefined }
        : prev
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to close table');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBillTable = async (table: TableData) => {
    if (!table.session_id) return;
    setActionLoading(true);
    setActionError('');
    try {
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/sessions/${table.session_id}/bill`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to generate bill');
      setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, status: 'billed' } : t));
      setSelectedTable((prev) => prev?.id === table.id ? { ...prev, status: 'billed' } : prev);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate bill');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Move table to section ────────────────────────────────────────────────────

  const handleMoveToSection = async (table: TableData, sectionId: string | null) => {
    // Auto-generate new name for the target zone (exclude current table so it doesn't self-count)
    const otherTables = tables.filter((t) => t.id !== table.id);
    const newName = autoTableName(otherTables, sectionId ?? undefined, sections);

    // Move the table
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${table.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ section_id: sectionId, name: newName }),
      }
    );
    const data = (await res.json()) as { success: boolean; error?: string };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to move table');

    // Renumber the source zone — fill the gap left by the moved table
    const sourceZoneId = table.section_id;
    const sourcePrefix = table.section_name ?? 'Table';
    const sourceZoneTables = otherTables
      .filter((t) => t.section_id === sourceZoneId)
      .sort((a, b) => {
        const getNum = (name: string) => { const m = name.match(/(\d+)$/); return m ? parseInt(m[1]!, 10) : 0; };
        return getNum(a.name) - getNum(b.name);
      });

    const sourceRenames = sourceZoneTables
      .map((t, idx) => ({ id: t.id, newName: `${sourcePrefix} ${idx + 1}` }))
      .filter((r, idx) => r.newName !== sourceZoneTables[idx]!.name);

    await Promise.all(
      sourceRenames.map(({ id, newName: sName }) =>
        apiFetch(
          `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ name: sName }),
          }
        )
      )
    );

    // Apply all changes to local state
    const newSectionName = sections.find((s) => s.id === sectionId)?.name;
    const updated = { ...table, name: newName, section_id: sectionId ?? undefined, section_name: newSectionName };
    setTables((prev) =>
      prev.map((t) => {
        if (t.id === table.id) return updated;
        const r = sourceRenames.find((x) => x.id === t.id);
        return r ? { ...t, name: r.newName } : t;
      })
    );
    setSelectedTable((prev) => prev?.id === table.id ? updated : prev);
  };

  const handleSaveCapacity = async (table: TableData, capacity: number) => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${table.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ capacity }),
        }
      );
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to update table');
      const updated = { ...table, capacity };
      setTables((prev) => prev.map((t) => t.id === table.id ? updated : t));
      setSelectedTable((prev) => prev?.id === table.id ? updated : prev);
      setEditingCapacity(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update table');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTable = async (table: TableData) => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${table.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to delete table');
      }

      // Renumber remaining tables in the same zone sequentially (1, 2, 3...)
      const zoneId = table.section_id;
      const prefix = table.section_name ?? 'Table';
      const zoneTables = tables
        .filter((t) => t.id !== table.id && t.section_id === zoneId)
        .sort((a, b) => {
          const getNum = (name: string) => { const m = name.match(/(\d+)$/); return m ? parseInt(m[1]!, 10) : 0; };
          return getNum(a.name) - getNum(b.name);
        });

      // Build rename list — skip tables already correctly named
      const renames = zoneTables
        .map((t, idx) => ({ id: t.id, newName: `${prefix} ${idx + 1}` }))
        .filter((r, idx) => r.newName !== zoneTables[idx]!.name);

      await Promise.all(
        renames.map(({ id, newName }) =>
          apiFetch(
            `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
              body: JSON.stringify({ name: newName }),
            }
          )
        )
      );

      // Update local state: remove deleted, apply renames
      setTables((prev) =>
        prev
          .filter((t) => t.id !== table.id)
          .map((t) => {
            const r = renames.find((x) => x.id === t.id);
            return r ? { ...t, name: r.newName } : t;
          })
      );
      setSelectedTable(null);
      setConfirmDelete(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete table');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleTableActive = async (table: TableData) => {
    setActionLoading(true);
    setActionError('');
    try {
      const newActive = !table.is_active;
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${table.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ is_active: newActive }),
        }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to update table');
      }
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, is_active: newActive } : t))
      );
      setSelectedTable((prev) => (prev?.id === table.id ? { ...prev, is_active: newActive } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update table');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTables = activeSection === 'All'
    ? tables
    : tables.filter((t) => (t.section_name ?? 'Unsectioned') === activeSection);

  // When a section tab is active, also show unassigned tables at the bottom
  const activeSection_obj = sections.find((s) => s.name === activeSection) ?? null;
  const unassignedTables = activeSection_obj
    ? tables.filter((t) => !t.section_id)
    : [];

  const closedSectionIds = new Set(sections.filter((s) => !s.is_active).map((s) => s.id));
  const isTableClosed = (t: TableData) =>
    !t.is_active || (t.section_id ? closedSectionIds.has(t.section_id) : false);
  const stats = {
    available: tables.filter((t) => !isTableClosed(t) && t.status === 'available').length,
    occupied: tables.filter((t) => !isTableClosed(t) && t.status === 'occupied').length,
    billed: tables.filter((t) => !isTableClosed(t) && t.status === 'billed').length,
    closed: tables.filter(isTableClosed).length,
  };

  const statusColors: Record<TableStatus, string> = {
    available: 'border-green-400 bg-green-50 hover:bg-green-100',
    occupied: 'border-amber-400 bg-amber-50 hover:bg-amber-100',
    billed: 'border-red-400 bg-red-50 hover:bg-red-100',
    pending_confirmation: 'border-brand-400 bg-brand-50 hover:bg-brand-100 animate-pulse',
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <OnboardReturnBanner />
        <SetupReturnBanner />
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-400 text-sm">Loading floor map...</div>
        </div>
      </div>
    );
  }

  // ── Empty state — no sections and no tables yet ─────────────────────────────
  if (tables.length === 0 && sections.length === 0) {
    return (
      <div>
        <OnboardReturnBanner />
        <SetupReturnBanner />
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="text-5xl mb-4">🪑</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No tables yet</h2>
          {canEditTables ? (
            <>
              <p className="text-gray-500 text-sm max-w-xs mb-6">
                Start by adding a floor zone. Tables can be added once you have at least one floor zone.
              </p>
              <button
                onClick={() => setShowAddSection(true)}
                className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-colors w-full max-w-xs"
              >
                + Add a floor zone
              </button>
            </>
          ) : (
            <p className="text-gray-500 text-sm max-w-xs">
              Your manager hasn't set up the floor map yet. Check back soon.
            </p>
          )}
        </div>

        {showAddTable && (
          <AddTableModal
            tables={tables}
            sections={sections}
            onClose={() => setShowAddTable(false)}
            onSave={handleAddTable}
          />
        )}
        {showAddSection && (
          <AddSectionModal
            onClose={() => setShowAddSection(false)}
            onSave={handleAddSection}
          />
        )}
      </div>
    );
  }

  // ── Floor map ────────────────────────────────────────────────────────────────
  return (
    <div>
      <OnboardReturnBanner />
      <SetupReturnBanner />
      <div className="p-6 h-full flex gap-4">
        <div className="flex-1">
          {/* Stats + Add buttons row */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-green-700">{stats.available}</span>
              <span className="text-green-600 ml-1">Free</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-amber-700">{stats.occupied}</span>
              <span className="text-amber-600 ml-1">Occupied</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-red-700">{stats.billed}</span>
              <span className="text-red-600 ml-1">Billed</span>
            </div>
            <div className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-gray-700">{stats.closed}</span>
              <span className="text-gray-500 ml-1">Closed</span>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setShowAddSection(true)}
                className="px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:border-gray-300 transition-colors"
              >
                + Zone
              </button>
              <button
                onClick={() => setShowAddTable(true)}
                className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                + Table
              </button>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto items-center">
            {/* All tab */}
            <button
              onClick={() => { setActiveSection('All'); setZoneMenu(null); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeSection === 'All'
                  ? 'bg-brand-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
              }`}
            >
              All
            </button>

            {/* Zone tabs */}
            {sections.map((s) => {
              const isActive = activeSection === s.name;
              const isDisabled = !s.is_active;
              return (
                <div
                  key={s.id}
                  className={`relative flex items-stretch rounded-full overflow-hidden whitespace-nowrap transition-colors ${
                    isActive
                      ? isDisabled ? 'bg-gray-400 text-white' : 'bg-brand-500 text-white'
                      : isDisabled
                        ? 'bg-white border border-gray-200 text-gray-400'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
                  }`}
                >
                  <button
                    onClick={() => { setActiveSection(s.name); setZoneMenu(null); }}
                    className={`pl-4 ${canEditTables ? 'pr-2' : 'pr-4'} py-1.5 text-sm font-medium flex items-center gap-1.5 ${isDisabled && !isActive ? 'line-through' : ''}`}
                  >
                    {isDisabled && <span className="text-xs">⚠</span>}
                    {s.name}
                    {isDisabled && <span className={`text-xs font-normal ${isActive ? 'text-white/80' : 'text-orange-500'}`}>Closed</span>}
                  </button>

                  {/* Vertical kebab menu — owners/managers only, baked into the chip */}
                  {canEditTables && (
                    <>
                      <span
                        className={`w-px my-1.5 ${isActive ? 'bg-white/30' : 'bg-gray-200'}`}
                        aria-hidden="true"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSection(s.name);
                          setZoneActionError('');
                          if (zoneMenu?.id === s.id) {
                            setZoneMenu(null);
                          } else {
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setZoneMenu({ id: s.id, x: rect.left, y: rect.bottom + 6 });
                          }
                        }}
                        className={`px-2.5 flex items-center justify-center transition-colors ${
                          isActive
                            ? 'text-white/90 hover:bg-white/10'
                            : 'text-gray-500 hover:text-brand-600 hover:bg-gray-50'
                        }`}
                        title="Manage zone"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                          <circle cx="7" cy="3" r="1.4" />
                          <circle cx="7" cy="7" r="1.4" />
                          <circle cx="7" cy="11" r="1.4" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Disabled zone banner */}
          {activeSection_obj && !activeSection_obj.is_active && (
            <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-semibold text-orange-700">⚠ Zone closed for service</span>
                <p className="text-xs text-orange-600 mt-0.5">Tables in this zone cannot be opened until the zone is re-enabled.</p>
              </div>
              {canEditTables && (
                <button
                  onClick={() => void handleToggleSectionActive(activeSection_obj).catch((err) => setZoneActionError(err instanceof Error ? err.message : 'Failed'))}
                  className="ml-4 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  Re-enable zone
                </button>
              )}
            </div>
          )}

          {/* Table grid — grouped by zone when showing All */}
          {activeSection === 'All' ? (
            <>
              {sections.map((section) => {
                const zoneTables = filteredTables.filter((t) => t.section_id === section.id);
                if (zoneTables.length === 0) return null;
                return (
                  <div key={section.id} className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{section.name}</h3>
                      <span className="text-xs text-gray-400">({zoneTables.length})</span>
                      {section.is_active === false && (
                        <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">closed</span>
                      )}
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                      {zoneTables.map((table) => {
                        const zoneDisabled = section.is_active === false;
                        const tableDisabled = !table.is_active;
                        const cardColor = zoneDisabled || tableDisabled
                          ? 'border-orange-300 bg-orange-50 hover:bg-orange-100 opacity-70'
                          : statusColors[table.status];
                        return (
                          <button
                            key={table.id}
                            onClick={() => { setSelectedTable(table); setEditingCapacity(null); setActionError(''); setConfirmDelete(false); }}
                            className={`border-2 rounded-xl p-4 text-left transition-all ${cardColor} ${
                              selectedTable?.id === table.id ? 'ring-2 ring-brand-500' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-bold text-gray-900 truncate">{table.name}</div>
                                <div className="text-xs text-gray-500">{table.capacity} seats</div>
                              </div>
                              <TableShape
                                capacity={table.capacity}
                                status={table.status}
                                disabled={zoneDisabled || tableDisabled}
                                className="shrink-0"
                              />
                            </div>
                            {table.waiter_name && (
                              <div className="text-xs text-gray-600 mt-1 truncate">👤 {table.waiter_name}</div>
                            )}
                            {table.item_count !== undefined && table.item_count > 0 && (
                              <div className="text-xs text-gray-500">{table.item_count} items</div>
                            )}
                            {table.occupied_since && (
                              <div className="text-xs font-medium text-amber-600 mt-1">⏱ {getElapsed(table.occupied_since)}</div>
                            )}
                            <div className={`mt-2 text-xs font-medium capitalize ${
                              zoneDisabled || tableDisabled ? 'text-orange-500' :
                              table.status === 'available' ? 'text-green-600' :
                              table.status === 'billed' ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {tableDisabled ? 'table closed' : zoneDisabled ? 'zone closed' : table.status.replace(/_/g, ' ')}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Unassigned tables (no zone) */}
              {(() => {
                const noZoneTables = filteredTables.filter((t) => !t.section_id);
                if (noZoneTables.length === 0) return null;
                return (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Unassigned</h3>
                      <span className="text-xs text-gray-400">({noZoneTables.length})</span>
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                      {noZoneTables.map((table) => {
                        const tableDisabled = !table.is_active;
                        const cardColor = tableDisabled
                          ? 'border-orange-300 bg-orange-50 hover:bg-orange-100 opacity-70'
                          : statusColors[table.status];
                        return (
                          <button
                            key={table.id}
                            onClick={() => { setSelectedTable(table); setEditingCapacity(null); setActionError(''); setConfirmDelete(false); }}
                            className={`border-2 rounded-xl p-4 text-left transition-all ${cardColor} ${
                              selectedTable?.id === table.id ? 'ring-2 ring-brand-500' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-bold text-gray-900 truncate">{table.name}</div>
                                <div className="text-xs text-gray-500">{table.capacity} seats</div>
                              </div>
                              <TableShape
                                capacity={table.capacity}
                                status={table.status}
                                disabled={tableDisabled}
                                className="shrink-0"
                              />
                            </div>
                            {table.waiter_name && (
                              <div className="text-xs text-gray-600 mt-1 truncate">👤 {table.waiter_name}</div>
                            )}
                            {table.item_count !== undefined && table.item_count > 0 && (
                              <div className="text-xs text-gray-500">{table.item_count} items</div>
                            )}
                            {table.occupied_since && (
                              <div className="text-xs font-medium text-amber-600 mt-1">⏱ {getElapsed(table.occupied_since)}</div>
                            )}
                            <div className={`mt-2 text-xs font-medium capitalize ${
                              tableDisabled ? 'text-orange-500' :
                              table.status === 'available' ? 'text-green-600' :
                              table.status === 'billed' ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {tableDisabled ? 'table closed' : table.status.replace(/_/g, ' ')}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {filteredTables.map((table) => {
                const zoneDisabled = table.section_id
                  ? sections.find((s) => s.id === table.section_id)?.is_active === false
                  : false;
                const tableDisabled = !table.is_active;
                const cardColor = zoneDisabled || tableDisabled
                  ? 'border-orange-300 bg-orange-50 hover:bg-orange-100 opacity-70'
                  : statusColors[table.status];
                return (
                  <button
                    key={table.id}
                    onClick={() => { setSelectedTable(table); setEditingCapacity(null); setActionError(''); setConfirmDelete(false); }}
                    className={`border-2 rounded-xl p-4 text-left transition-all ${cardColor} ${
                      selectedTable?.id === table.id ? 'ring-2 ring-brand-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 truncate">{table.name}</div>
                        <div className="text-xs text-gray-500">{table.capacity} seats</div>
                      </div>
                      <TableShape
                        capacity={table.capacity}
                        status={table.status}
                        disabled={zoneDisabled || tableDisabled}
                        className="shrink-0"
                      />
                    </div>
                    {table.waiter_name && (
                      <div className="text-xs text-gray-600 mt-1 truncate">👤 {table.waiter_name}</div>
                    )}
                    {table.item_count !== undefined && table.item_count > 0 && (
                      <div className="text-xs text-gray-500">{table.item_count} items</div>
                    )}
                    {table.occupied_since && (
                      <div className="text-xs font-medium text-amber-600 mt-1">⏱ {getElapsed(table.occupied_since)}</div>
                    )}
                    <div className={`mt-2 text-xs font-medium capitalize ${
                      zoneDisabled || tableDisabled ? 'text-orange-500' :
                      table.status === 'available' ? 'text-green-600' :
                      table.status === 'billed' ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {tableDisabled ? 'table closed' : zoneDisabled ? 'zone closed' : table.status.replace(/_/g, ' ')}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Unassigned tables — shown when a section tab is active */}
          {activeSection_obj && unassignedTables.length > 0 && (
            <UnassignedTableRow
              tables={unassignedTables}
              sectionName={activeSection_obj.name}
              sectionId={activeSection_obj.id}
              onMove={handleMoveToSection}
            />
          )}
          {activeSection_obj && unassignedTables.length === 0 && filteredTables.length === 0 && (
            <div className="mt-6 text-center text-sm text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded-xl">
              No tables in this section yet. Create one with "+ Table" above, or move existing tables here using the panel on the right.
            </div>
          )}
        </div>

        {/* Right detail panel */}
        {selectedTable && (
          <div className="w-72 bg-white border border-gray-200 rounded-2xl p-5 shrink-0 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{selectedTable.name}</h3>
              <button onClick={() => { setSelectedTable(null); setEditingCapacity(null); setActionError(''); setConfirmDelete(false); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`font-medium capitalize ${
                  selectedTable.status === 'available' ? 'text-green-600' :
                  selectedTable.status === 'billed' && selectedTable.payment_done ? 'text-green-600' :
                  selectedTable.status === 'billed' ? 'text-red-600' : 'text-amber-600'
                }`}>{
                  selectedTable.status === 'billed' && selectedTable.payment_done ? 'Paid'
                  : selectedTable.status === 'billed' ? 'Awaiting Payment'
                  : selectedTable.status.replace(/_/g, ' ')
                }</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Capacity</span>
                {canEditTables && editingCapacity !== null ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingCapacity((c) => Math.max(1, (c ?? 1) - 1))}
                      className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 font-bold hover:border-brand-400 text-sm flex items-center justify-center"
                    >−</button>
                    <span className="w-8 text-center text-sm font-semibold">{editingCapacity}</span>
                    <button
                      onClick={() => setEditingCapacity((c) => Math.min(50, (c ?? 1) + 1))}
                      className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 font-bold hover:border-brand-400 text-sm flex items-center justify-center"
                    >+</button>
                    <button
                      onClick={() => void handleSaveCapacity(selectedTable, editingCapacity)}
                      disabled={actionLoading || editingCapacity === selectedTable.capacity}
                      className="ml-1 px-2 py-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg"
                    >{actionLoading ? '...' : 'Save'}</button>
                    <button
                      onClick={() => setEditingCapacity(null)}
                      className="text-gray-400 hover:text-gray-600 text-xs px-1"
                    >✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selectedTable.capacity} seats</span>
                    {canEditTables && (
                      <button
                        onClick={() => setEditingCapacity(selectedTable.capacity)}
                        className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                      >Edit</button>
                    )}
                  </div>
                )}
              </div>
              {sections.length > 0 && canEditTables && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Zone</span>
                  <select
                    value={selectedTable.section_id ?? ''}
                    onChange={(e) => {
                      void handleMoveToSection(selectedTable, e.target.value || null).catch((err) => {
                        setActionError(err instanceof Error ? err.message : 'Failed to move table');
                      });
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-brand-500 bg-white max-w-[140px]"
                  >
                    <option value="">No zone</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {sections.length > 0 && !canEditTables && selectedTable.section_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Zone</span>
                  <span className="font-medium">{selectedTable.section_name}</span>
                </div>
              )}
              {selectedTable.waiter_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Waiter</span>
                  <span className="font-medium">{selectedTable.waiter_name}</span>
                </div>
              )}
              {selectedTable.occupied_since && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Since</span>
                  <span className="font-medium">{getElapsed(selectedTable.occupied_since)} ago</span>
                </div>
              )}
            </div>
            {actionError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-2 text-red-600 text-xs">{actionError}</div>
            )}
            <div className="mt-4 space-y-2">
              {selectedTable.status === 'available' && (() => {
                const inDisabledZone = selectedTable.section_id
                  ? sections.find((s) => s.id === selectedTable.section_id)?.is_active === false
                  : false;
                const tableInactive = !selectedTable.is_active;
                if (inDisabledZone) {
                  return (
                    <div className="text-center text-xs text-orange-600 font-medium py-2 bg-orange-50 rounded-xl border border-orange-200">
                      Zone closed — cannot open table
                    </div>
                  );
                }
                if (tableInactive) {
                  return (
                    <div className="text-center text-xs text-orange-600 font-medium py-2 bg-orange-50 rounded-xl border border-orange-200">
                      Table closed for service — re-enable to open
                    </div>
                  );
                }
                return (
                  <button
                    onClick={() => { setActionError(''); setShowOpenTable(true); }}
                    className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    Open Table
                  </button>
                );
              })()}
              {selectedTable.status === 'pending_confirmation' && (
                <>
                  <div className="text-center text-xs text-amber-600 font-medium py-1.5 bg-amber-50 rounded-xl">
                    Waiting for staff confirmation
                  </div>
                  <button
                    onClick={() => void handleConfirmTable(selectedTable)}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {actionLoading ? 'Confirming...' : 'Confirm Table'}
                  </button>
                </>
              )}
              {selectedTable.status === 'occupied' && (
                <>
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        table_id: selectedTable.id,
                        table_name: selectedTable.name,
                        type: 'dine_in',
                        ...(selectedTable.session_id ? { session_id: selectedTable.session_id } : {}),
                      });
                      navigate(`/new-order?${params.toString()}`);
                    }}
                    className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    Take Order
                  </button>
                  <button
                    onClick={() => void handleBillTable(selectedTable)}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Generate Bill'}
                  </button>
                  <button
                    onClick={() => navigate('/orders')}
                    className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
                  >
                    View Orders
                  </button>
                </>
              )}
              {selectedTable.status === 'billed' && !selectedTable.payment_done && (
                <>
                  <div className="text-center text-xs text-red-600 font-medium py-1">Bill generated — awaiting payment</div>
                  <button
                    onClick={() => navigate('/orders')}
                    className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    Go to Orders (Collect Payment)
                  </button>
                </>
              )}
              {selectedTable.status === 'billed' && selectedTable.payment_done && (
                <>
                  <div className="text-center text-xs text-green-600 font-medium py-1">Payment received — close table to free it</div>
                  <button
                    onClick={() => void handleCloseTable(selectedTable)}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {actionLoading ? 'Closing...' : 'Close Table'}
                  </button>
                </>
              )}
            </div>

            {/* Disable / enable table — owners/managers only, not while occupied/billed */}
            {canEditTables && selectedTable.status === 'available' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button
                  disabled={actionLoading}
                  onClick={() => void handleToggleTableActive(selectedTable)}
                  className={`w-full py-2 text-xs font-medium rounded-xl transition-colors disabled:opacity-40 ${
                    selectedTable.is_active
                      ? 'text-orange-600 hover:bg-orange-50 border border-orange-200'
                      : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                  }`}
                >
                  {actionLoading
                    ? 'Updating...'
                    : selectedTable.is_active
                      ? 'Close table for service'
                      : 'Re-enable table'}
                </button>
              </div>
            )}

            {/* Delete table — owners/managers only, not while occupied/billed */}
            {canEditTables && selectedTable.status === 'available' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {confirmDelete ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-600 font-medium text-center">
                      Delete {selectedTable.name}? Remaining tables in this zone will be renumbered.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2 border border-gray-200 text-gray-600 text-xs font-medium rounded-xl hover:border-gray-300"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handleDeleteTable(selectedTable)}
                        disabled={actionLoading}
                        className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors"
                      >
                        {actionLoading ? 'Deleting...' : 'Yes, delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full py-2 text-xs text-red-500 hover:text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors"
                  >
                    Delete table
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddTable && (
        <AddTableModal
          tables={tables}
          sections={sections}
          defaultSectionId={activeSection_obj?.id}
          onClose={() => setShowAddTable(false)}
          onSave={handleAddTable}
        />
      )}
      {showAddSection && (
        <AddSectionModal
          onClose={() => setShowAddSection(false)}
          onSave={handleAddSection}
        />
      )}
      {showOpenTable && selectedTable && (
        <OpenTableModal
          table={selectedTable}
          onClose={() => setShowOpenTable(false)}
          onConfirm={handleOpenTable}
        />
      )}

      {/* Rename zone modal */}
      {renamingZone && (
        <RenameZoneModal
          initialName={renamingZone.name}
          onClose={() => setRenamingZone(null)}
          onSave={async (newName) => {
            await handleRenameSection(renamingZone.id, newName);
            setRenamingZone(null);
          }}
        />
      )}

      {/* Delete zone confirmation */}
      {confirmDeleteZone && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete "{confirmDeleteZone.name}"?</h3>
            <p className="text-sm text-gray-500 mb-5">
              The zone will be removed. All tables in this zone will move to the general floor — they will not be deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteZone(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleDeleteSection(confirmDeleteZone).catch((err) => {
                    setZoneActionError(err instanceof Error ? err.message : 'Failed to delete zone');
                  });
                  setConfirmDeleteZone(null);
                }}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
              >
                Delete zone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zone dropdown — fixed position to escape overflow-x-auto clipping */}
      {zoneMenu && (() => {
        const s = sections.find((sec) => sec.id === zoneMenu.id);
        if (!s) return null;
        return (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setZoneMenu(null)} />
            <div
              className="fixed z-30 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[200px]"
              style={{ top: zoneMenu.y, left: zoneMenu.x }}
            >
              {zoneActionError && (
                <div className="px-3 py-1.5 text-xs text-red-600 border-b border-gray-100">{zoneActionError}</div>
              )}
              <button
                onClick={() => { setRenamingZone({ id: s.id, name: s.name }); setZoneMenu(null); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
              >
                ✏️ <span>Rename zone</span>
              </button>
              <button
                onClick={() => {
                  void handleToggleSectionActive(s).catch((err) => {
                    setZoneActionError(err instanceof Error ? err.message : 'Failed');
                  });
                  setZoneMenu(null);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3"
              >
                {s.is_active
                  ? <><span>🔴</span><span className="text-orange-600">Disable (maintenance)</span></>
                  : <><span>✅</span><span className="text-green-600">Re-enable zone</span></>
                }
              </button>
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => { setConfirmDeleteZone(s); setZoneMenu(null); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                >
                  🗑 <span>Delete zone</span>
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
