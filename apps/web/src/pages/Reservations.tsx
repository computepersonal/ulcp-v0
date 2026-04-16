import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';

type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';

interface Table { id: string; name: string }

interface Reservation {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  pax: number;
  date: string;
  time_slot: string;
  status: ReservationStatus;
  notes?: string;
  table?: Table | null;
  table_id?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<ReservationStatus, string> = {
  pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  seated:    'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-gray-50 text-gray-400 border-gray-200',
  no_show:   'bg-red-50 text-red-500 border-red-200',
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  seated:    'Seated',
  cancelled: 'Cancelled',
  no_show:   'No-show',
};

// ─── Create Reservation Modal ─────────────────────────────────────────────────

interface CreateModalProps {
  tables: Table[];
  defaultDate: string;
  onClose: () => void;
  onSave: (data: {
    customer_name: string; customer_phone: string; customer_email: string;
    pax: number; date: string; time_slot: string; table_id: string; notes: string;
  }) => Promise<void>;
}

function CreateModal({ tables, defaultDate, onClose, onSave }: CreateModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pax, setPax] = useState(2);
  const [date, setDate] = useState(defaultDate);
  const [timeSlot, setTimeSlot] = useState('19:00');
  const [tableId, setTableId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) { setError('Name and phone are required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ customer_name: name.trim(), customer_phone: phone.trim(), customer_email: email.trim(), pax, date, time_slot: timeSlot, table_id: tableId, notes: notes.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reservation');
    } finally {
      setSaving(false);
    }
  };

  // Generate time slots every 30 min from 10:00 to 23:00
  const slots: string[] = [];
  for (let h = 10; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 23) slots.push(`${String(h).padStart(2, '0')}:30`);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">New Reservation</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Guest details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1">Guest name *</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="John Smith" autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Phone *</label>
              <input
                type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="optional"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Date + Time + Pax */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Date</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                min={todayStr()}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Time</label>
              <select
                value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 bg-white"
              >
                {slots.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Guests</label>
              <div className="flex items-center gap-1 border border-gray-200 rounded-xl px-2 py-2">
                <button type="button" onClick={() => setPax((p) => Math.max(1, p - 1))} className="w-7 h-7 flex items-center justify-center text-gray-600 font-bold hover:text-brand-500">−</button>
                <span className="flex-1 text-center text-sm font-semibold">{pax}</span>
                <button type="button" onClick={() => setPax((p) => Math.min(20, p + 1))} className="w-7 h-7 flex items-center justify-center text-gray-600 font-bold hover:text-brand-500">+</button>
              </div>
            </div>
          </div>

          {/* Table (optional) */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Assign table <span className="text-gray-400 font-normal">(optional)</span></label>
            <select
              value={tableId} onChange={(e) => setTableId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 bg-white"
            >
              <option value="">Assign later</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Special requests</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} placeholder="Anniversary, window seat, allergies..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 resize-none"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-gray-300">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
              {saving ? 'Saving...' : 'Create Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reservation Card ─────────────────────────────────────────────────────────

interface ReservationCardProps {
  res: Reservation;
  tables: Table[];
  onStatusChange: (id: string, status: ReservationStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ReservationCard({ res, onStatusChange, onDelete }: ReservationCardProps) {
  const [loading, setLoading] = useState(false);

  const act = async (status: ReservationStatus) => {
    setLoading(true);
    try { await onStatusChange(res.id, status); } finally { setLoading(false); }
  };

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm ${res.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{res.customer_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[res.status]}`}>
              {STATUS_LABELS[res.status]}
            </span>
          </div>
          <div className="text-sm text-gray-500 mt-0.5">{res.customer_phone}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm font-semibold text-gray-900">{res.time_slot}</div>
          <div className="text-xs text-gray-400">{res.pax} guests</div>
        </div>
      </div>

      {(res.table || res.notes) && (
        <div className="flex gap-3 text-xs text-gray-500 mb-3">
          {res.table && <span className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">🪑 {res.table.name}</span>}
          {res.notes && <span className="bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 truncate max-w-[160px]">💬 {res.notes}</span>}
        </div>
      )}

      {res.status !== 'cancelled' && res.status !== 'no_show' && res.status !== 'seated' && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {res.status === 'pending' && (
            <button
              onClick={() => void act('confirmed')}
              disabled={loading}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Confirm
            </button>
          )}
          {(res.status === 'pending' || res.status === 'confirmed') && (
            <button
              onClick={() => void act('seated')}
              disabled={loading}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Seat Now
            </button>
          )}
          {(res.status === 'pending' || res.status === 'confirmed') && (
            <button
              onClick={() => void act('no_show')}
              disabled={loading}
              className="px-3 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 text-xs font-medium rounded-lg transition-colors"
            >
              No-show
            </button>
          )}
          <button
            onClick={() => void act('cancelled')}
            disabled={loading}
            className="px-3 py-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors ml-auto"
          >
            Cancel
          </button>
        </div>
      )}
      {(res.status === 'cancelled' || res.status === 'no_show') && (
        <button
          onClick={() => void onDelete(res.id)}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors mt-1"
        >
          Remove
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Reservations() {
  const auth = useAppSelector((s) => s.auth);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const tenantId = auth.user?.tenant_id ?? '';

  // Load branch + tables once
  useEffect(() => {
    if (!tenantId) return;
    const init = async () => {
      const branchRes = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (!branchRes.ok) return;
      const bd = (await branchRes.json()) as { success: boolean; data?: { branches?: Array<{ id: string; is_primary?: boolean }> } };
      const branches = bd.data?.branches ?? [];
      if (branches.length === 0) return;
      const primary = branches.find((b) => b.is_primary) ?? branches[0]!;
      setBranchId(primary.id);

      const tableRes = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${primary.id}/tables`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (tableRes.ok) {
        const td = (await tableRes.json()) as { success: boolean; data?: { tables?: Table[] } };
        setTables(td.data?.tables ?? []);
      }
    };
    void init();
  }, [tenantId, auth.token, tenantServiceUrl]);

  // Load reservations when date or branchId changes
  const loadReservations = useCallback(async () => {
    if (!tenantId || !branchId) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/reservations?date=${selectedDate}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { reservations: Reservation[] } };
        setReservations(data.data?.reservations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId, selectedDate, auth.token, tenantServiceUrl]);

  useEffect(() => { void loadReservations(); }, [loadReservations]);

  const handleCreate = async (formData: {
    customer_name: string; customer_phone: string; customer_email: string;
    pax: number; date: string; time_slot: string; table_id: string; notes: string;
  }) => {
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/reservations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({
          ...formData,
          table_id: formData.table_id || undefined,
          customer_email: formData.customer_email || undefined,
          notes: formData.notes || undefined,
        }),
      }
    );
    const data = (await res.json()) as { success: boolean; error?: string; data?: { reservation: Reservation } };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to create reservation');
    // Add to list if same date
    if (formData.date === selectedDate && data.data?.reservation) {
      setReservations((prev) => [...prev, data.data!.reservation].sort((a, b) => a.time_slot.localeCompare(b.time_slot)));
    }
  };

  const handleStatusChange = async (id: string, status: ReservationStatus) => {
    const res = await apiFetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/reservations/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status }),
      }
    );
    const data = (await res.json()) as { success: boolean; error?: string };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to update reservation');
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  };

  const handleDelete = async (id: string) => {
    await fetch(
      `${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches/${branchId}/reservations/${id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } }
    );
    setReservations((prev) => prev.filter((r) => r.id !== id));
  };

  // Date nav helpers
  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const displayDate = new Date(selectedDate + 'T00:00:00');
  const isToday = selectedDate === todayStr();

  // Group by status for summary
  const counts = reservations.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalPax = reservations
    .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
    .reduce((sum, r) => sum + r.pax, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Reservations</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          + New Reservation
        </button>
      </div>

      {/* Date navigator */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => shiftDate(-1)} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-300 text-gray-600 transition-colors">‹</button>
        <div className="flex-1 text-center">
          <div className="font-semibold text-gray-900">
            {isToday ? 'Today — ' : ''}{displayDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <button onClick={() => shiftDate(1)} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-300 text-gray-600 transition-colors">›</button>
        <input
          type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      {/* Summary bar */}
      {reservations.length > 0 && (
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm">
            <span className="font-semibold text-gray-900">{reservations.length}</span>
            <span className="text-gray-500 ml-1">reservations</span>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm">
            <span className="font-semibold text-gray-900">{totalPax}</span>
            <span className="text-gray-500 ml-1">covers</span>
          </div>
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} className={`rounded-xl px-4 py-2 text-sm border ${STATUS_STYLES[status as ReservationStatus]}`}>
              <span className="font-semibold">{count}</span>
              <span className="ml-1">{STATUS_LABELS[status as ReservationStatus]}</span>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-gray-400 text-sm">Loading reservations...</div>
        </div>
      ) : reservations.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="text-5xl mb-4">📅</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">No reservations {isToday ? 'today' : 'on this date'}</h2>
          <p className="text-gray-500 text-sm mb-5">Create your first reservation using the button above.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + New Reservation
          </button>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {reservations.map((res) => (
            <ReservationCard
              key={res.id}
              res={res}
              tables={tables}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          tables={tables}
          defaultDate={selectedDate}
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </div>
  );
}
