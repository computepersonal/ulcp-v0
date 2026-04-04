import { useState, useEffect } from 'react';
import { useAppSelector } from '../hooks/redux';

type TableStatus = 'available' | 'occupied' | 'billed' | 'pending_confirmation';

interface TableData {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  waiter_name?: string;
  item_count?: number;
  occupied_since?: string;
  section_name?: string;
}

const DEMO_TABLES: TableData[] = [
  { id: '1', name: 'T1', capacity: 4, status: 'available', section_name: 'Main Hall' },
  { id: '2', name: 'T2', capacity: 2, status: 'occupied', waiter_name: 'Raj', item_count: 3, occupied_since: new Date(Date.now() - 25 * 60000).toISOString(), section_name: 'Main Hall' },
  { id: '3', name: 'T3', capacity: 6, status: 'billed', waiter_name: 'Priya', item_count: 7, occupied_since: new Date(Date.now() - 45 * 60000).toISOString(), section_name: 'Main Hall' },
  { id: '4', name: 'T4', capacity: 4, status: 'available', section_name: 'Outdoor' },
  { id: '5', name: 'T5', capacity: 4, status: 'occupied', waiter_name: 'Amit', item_count: 2, occupied_since: new Date(Date.now() - 10 * 60000).toISOString(), section_name: 'Outdoor' },
  { id: '6', name: 'T6', capacity: 8, status: 'available', section_name: 'Outdoor' },
  { id: '7', name: 'T7', capacity: 2, status: 'pending_confirmation', section_name: 'Bar' },
  { id: '8', name: 'T8', capacity: 4, status: 'available', section_name: 'Bar' }
];

function getElapsed(since?: string): string {
  if (!since) return '';
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  return `${mins}m`;
}

export default function FloorMap() {
  const auth = useAppSelector((s) => s.auth);
  const [tables, setTables] = useState<TableData[]>(DEMO_TABLES);
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [activeSection, setActiveSection] = useState<string>('All');

  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const load = async () => {
      try {
        // Step 1: get branches to find the primary branch
        const branchRes = await fetch(
          `${tenantServiceUrl}/api/v1/tenants/${auth.user!.tenant_id}/branches`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (!branchRes.ok) return;
        const branchData = (await branchRes.json()) as {
          success: boolean;
          data?: { branches?: Array<{ id: string; is_primary?: boolean }> };
        };
        const branches = branchData.data?.branches ?? [];
        if (branches.length === 0) return;
        const primary = branches.find((b) => b.is_primary) ?? branches[0]!;
        const branchId = primary.id;

        // Step 2: fetch sections for name mapping
        const sectionRes = await fetch(
          `${tenantServiceUrl}/api/v1/tenants/${auth.user!.tenant_id}/branches/${branchId}/sections`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        const sectionMap: Record<string, string> = {};
        if (sectionRes.ok) {
          const sd = (await sectionRes.json()) as {
            success: boolean;
            data?: { sections?: Array<{ id: string; name: string }> };
          };
          for (const s of sd.data?.sections ?? []) sectionMap[s.id] = s.name;
        }

        // Step 3: fetch tables for the primary branch
        const tableRes = await fetch(
          `${tenantServiceUrl}/api/v1/tenants/${auth.user!.tenant_id}/branches/${branchId}/tables`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (!tableRes.ok) return;
        const td = (await tableRes.json()) as {
          success: boolean;
          data?: { tables?: Array<{ id: string; name: string; capacity: number; section_id?: string | null; status?: TableStatus }> };
        };
        const rawTables = td.data?.tables ?? [];
        if (rawTables.length === 0) return;

        setTables(
          rawTables.map((t) => ({
            id: t.id,
            name: t.name,
            capacity: t.capacity,
            status: t.status ?? 'available',
            section_name: t.section_id ? (sectionMap[t.section_id] ?? 'Main') : 'Main',
          }))
        );
      } catch {
        // Use demo data
      }
    };
    void load();
  }, [auth, tenantServiceUrl]);

  const sections = ['All', ...new Set(tables.map((t) => t.section_name ?? 'Main'))];
  const filteredTables = activeSection === 'All' ? tables : tables.filter((t) => (t.section_name ?? 'Main') === activeSection);

  const stats = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    billed: tables.filter((t) => t.status === 'billed').length
  };

  const statusColors: Record<TableStatus, string> = {
    available: 'border-green-400 bg-green-50 hover:bg-green-100',
    occupied: 'border-amber-400 bg-amber-50 hover:bg-amber-100',
    billed: 'border-red-400 bg-red-50 hover:bg-red-100',
    pending_confirmation: 'border-brand-400 bg-brand-50 hover:bg-brand-100 animate-pulse'
  };

  return (
    <div className="p-6 h-full flex gap-4">
      <div className="flex-1">
        {/* Stats */}
        <div className="flex gap-3 mb-4">
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
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeSection === s
                  ? 'bg-brand-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Table grid */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {filteredTables.map((table) => (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`border-2 rounded-xl p-4 text-left transition-all ${statusColors[table.status]} ${selectedTable?.id === table.id ? 'ring-2 ring-brand-500' : ''}`}
            >
              <div className="font-bold text-gray-900">{table.name}</div>
              <div className="text-xs text-gray-500">{table.capacity} seats</div>
              {table.waiter_name && (
                <div className="text-xs text-gray-600 mt-1 truncate">👤 {table.waiter_name}</div>
              )}
              {table.item_count && (
                <div className="text-xs text-gray-500">{table.item_count} items</div>
              )}
              {table.occupied_since && (
                <div className="text-xs font-medium text-amber-600 mt-1">⏱ {getElapsed(table.occupied_since)}</div>
              )}
              <div className={`mt-2 text-xs font-medium capitalize ${
                table.status === 'available' ? 'text-green-600' :
                table.status === 'billed' ? 'text-red-600' :
                'text-amber-600'
              }`}>
                {table.status.replace(/_/g, ' ')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      {selectedTable && (
        <div className="w-72 bg-white border border-gray-200 rounded-2xl p-5 shrink-0 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">{selectedTable.name}</h3>
            <button onClick={() => setSelectedTable(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className={`font-medium capitalize ${
                selectedTable.status === 'available' ? 'text-green-600' :
                selectedTable.status === 'billed' ? 'text-red-600' :
                'text-amber-600'
              }`}>{selectedTable.status.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Capacity</span>
              <span className="font-medium">{selectedTable.capacity} seats</span>
            </div>
            {selectedTable.waiter_name && (
              <div className="flex justify-between">
                <span className="text-gray-500">Waiter</span>
                <span className="font-medium">{selectedTable.waiter_name}</span>
              </div>
            )}
            {selectedTable.item_count && (
              <div className="flex justify-between">
                <span className="text-gray-500">Items</span>
                <span className="font-medium">{selectedTable.item_count}</span>
              </div>
            )}
            {selectedTable.occupied_since && (
              <div className="flex justify-between">
                <span className="text-gray-500">Since</span>
                <span className="font-medium">{getElapsed(selectedTable.occupied_since)} ago</span>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {selectedTable.status === 'occupied' && (
              <>
                <button className="w-full py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl">
                  Generate Bill
                </button>
                <button className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl">
                  View Orders
                </button>
              </>
            )}
            {selectedTable.status === 'billed' && (
              <button className="w-full py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl">
                Close Table
              </button>
            )}
            {selectedTable.status === 'available' && (
              <button className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl">
                Open Table
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
