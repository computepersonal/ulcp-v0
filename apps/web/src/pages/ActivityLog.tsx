import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';

interface AuditEntry {
  id: string;
  actor_id: string;
  actor_name: string | null;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  metadata: Record<string, unknown> | null;
  branch_id: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  'table.created':          'Table created',
  'table.deleted':          'Table deleted',
  'table.capacity_changed': 'Capacity changed',
  'table.zone_changed':     'Table moved to zone',
  'table.renamed':          'Table renamed',
  'section.created':        'Floor zone created',
  'section.deleted':        'Floor zone deleted',
  'section.renamed':        'Floor zone renamed',
  'reservation.created':    'Reservation created',
  'reservation.confirmed':  'Reservation confirmed',
  'reservation.cancelled':  'Reservation cancelled',
};

const ACTION_COLORS: Record<string, string> = {
  'table.created':          'bg-green-100 text-green-700',
  'table.deleted':          'bg-red-100 text-red-700',
  'table.capacity_changed': 'bg-blue-100 text-blue-700',
  'table.zone_changed':     'bg-purple-100 text-purple-700',
  'table.renamed':          'bg-gray-100 text-gray-700',
  'section.created':        'bg-green-100 text-green-700',
  'section.deleted':        'bg-red-100 text-red-700',
  'section.renamed':        'bg-gray-100 text-gray-700',
  'reservation.created':    'bg-green-100 text-green-700',
  'reservation.confirmed':  'bg-blue-100 text-blue-700',
  'reservation.cancelled':  'bg-red-100 text-red-700',
};

function formatMetadata(action: string, meta: Record<string, unknown> | null): string {
  if (!meta) return '';
  switch (action) {
    case 'table.capacity_changed':
      return `${meta['from']} → ${meta['to']} seats`;
    case 'table.zone_changed':
      return `${meta['old_name'] ?? '?'} → ${meta['new_name'] ?? '?'}`;
    case 'table.renamed':
      return `"${meta['from']}" → "${meta['to']}"`;
    case 'table.created':
      return `${meta['capacity']} seats${meta['section_id'] ? '' : ' · no zone'}`;
    case 'table.deleted':
      return `${meta['capacity']} seats`;
    default:
      return '';
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ENTITY_FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'table',       label: 'Tables' },
  { value: 'section',     label: 'Floor zones' },
  { value: 'reservation', label: 'Reservations' },
];

export default function ActivityLog() {
  const auth = useAppSelector((s) => s.auth);
  const tenantId = auth.user?.tenant_id ?? '';
  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  const [logs, setLogs]         = useState<AuditEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');

  const LIMIT = 25;

  const load = useCallback(async (p: number) => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (entityFilter) params.set('entity_type', entityFilter);
      if (dateFrom)     params.set('from', dateFrom);

      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/audit-logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { logs: AuditEntry[]; total: number; page: number };
      };
      if (!res.ok || !data.success) { setError(data.error ?? 'Failed to load'); return; }
      setLogs(data.data?.logs ?? []);
      setTotal(data.data?.total ?? 0);
    } catch {
      setError('Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, [tenantId, auth.token, tenantServiceUrl, entityFilter, dateFrom]);

  useEffect(() => {
    setPage(1);
    void load(1);
  }, [entityFilter, dateFrom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-sm text-gray-500 mt-1">All staff actions — who did what and when</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {ENTITY_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setEntityFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                entityFilter === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-brand-500 transition-colors"
        />
        {dateFrom && (
          <button
            onClick={() => setDateFrom('')}
            className="text-sm text-gray-400 hover:text-gray-600 px-2"
          >
            Clear date
          </button>
        )}
        <span className="ml-auto text-sm text-gray-400 self-center">{total} entries</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm">No activity yet</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            {logs.map((entry) => {
              const detail = formatMetadata(entry.action, entry.metadata);
              return (
                <div key={entry.id} className="px-5 py-4 flex items-start gap-4">
                  {/* Action badge */}
                  <span className={`mt-0.5 shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${ACTION_COLORS[entry.action] ?? 'bg-gray-100 text-gray-600'}`}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>

                  {/* Entity name + detail */}
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{entry.entity_name}</span>
                    {detail && <span className="text-gray-500 text-sm ml-2">{detail}</span>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      <span className="font-medium text-gray-600">
                        {entry.actor_name ?? 'Unknown'}
                      </span>
                      <span className="mx-1">·</span>
                      {entry.actor_role.replace(/_/g, ' ')}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-medium text-gray-500">{timeAgo(entry.created_at)}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatDate(entry.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
