import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../hooks/redux';
import SetupReturnBanner from '../components/SetupReturnBanner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  critical_stock: number;
  maximum_stock: number;
  reorder_quantity: number;
  unit_cost: number;
  last_purchase_price: number;
  average_cost: number;
  supplier: string | null;
  supplier_contact: string | null;
  supplier_lead_days: number;
  daily_average_usage: number;
  weeks_of_stock_remaining: number;
  is_active: boolean;
  created_at: string;
}

interface StockMovement {
  id: string;
  movement_type: string;
  quantity: number;
  unit: string;
  stock_before: number;
  stock_after: number;
  reference_type: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

type TabId = 'ingredients' | 'low_stock' | 'movements';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'dairy', 'produce', 'spice', 'grain', 'meat', 'seafood',
  'oil', 'sauce', 'beverage', 'packaging', 'cleaning', 'other',
];

const UNITS = ['kg', 'g', 'ml', 'l', 'pcs', 'dozen', 'pack', 'box', 'bag'];

const MOVEMENT_COLORS: Record<string, string> = {
  purchase: 'bg-green-50 text-green-700 border-green-200',
  manual_add: 'bg-green-50 text-green-700 border-green-200',
  opening: 'bg-blue-50 text-blue-700 border-blue-200',
  transfer_in: 'bg-blue-50 text-blue-700 border-blue-200',
  order_deduct: 'bg-red-50 text-red-600 border-red-200',
  manual_remove: 'bg-red-50 text-red-600 border-red-200',
  waste: 'bg-amber-50 text-amber-700 border-amber-200',
  transfer_out: 'bg-amber-50 text-amber-700 border-amber-200',
};

function getStockLevel(i: Ingredient): { label: string; class: string } {
  if (i.critical_stock > 0 && i.current_stock <= i.critical_stock) {
    return { label: 'Critical', class: 'bg-red-100 text-red-700 border-red-300 animate-pulse' };
  }
  if (i.minimum_stock > 0 && i.current_stock <= i.minimum_stock) {
    return { label: 'Low', class: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  return { label: 'OK', class: 'bg-green-50 text-green-700 border-green-200' };
}

function formatCurrency(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Inventory() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<TabId>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Add ingredient modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', category: 'produce', unit: 'kg',
    current_stock: '', minimum_stock: '', critical_stock: '',
    unit_cost: '', supplier: '',
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Stock adjustment modal
  const [adjustingItem, setAdjustingItem] = useState<Ingredient | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustType, setAdjustType] = useState<string>('manual_add');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Movement history for selected ingredient
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const inventoryUrl = import.meta.env.VITE_INVENTORY_SERVICE_URL ?? 'http://localhost:3005';
  const tenantId = auth.user?.tenant_id ?? '';
  // We need a branch_id — fetch primary branch from tenant-service or use stored one
  const [branchId, setBranchId] = useState<string>('');

  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  // ─── Fetch branch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId || !auth.token) return;
    (async () => {
      try {
        const res = await fetch(`${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; data?: { branches: { id: string; is_primary: boolean }[] } };
          const primary = data.data?.branches?.find((b) => b.is_primary) ?? data.data?.branches?.[0];
          if (primary) setBranchId(primary.id);
        }
      } catch { /* empty */ }
    })();
  }, [tenantId, auth.token, tenantServiceUrl]);

  // ─── Fetch ingredients ─────────────────────────────────────────────────
  const loadIngredients = useCallback(async () => {
    if (!tenantId || !branchId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (categoryFilter) params.set('category', categoryFilter);
      const url = `${inventoryUrl}/api/v1/inventory/${tenantId}/${branchId}/ingredients?${params}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { items: Ingredient[] } };
        setIngredients(data.data?.items ?? []);
      }
    } catch { /* empty */ } finally {
      setLoading(false);
    }
  }, [tenantId, branchId, inventoryUrl, searchQuery, categoryFilter]);

  // ─── Fetch low stock ───────────────────────────────────────────────────
  const loadLowStock = useCallback(async () => {
    if (!tenantId || !branchId) return;
    try {
      const res = await fetch(`${inventoryUrl}/api/v1/inventory/${tenantId}/${branchId}/ingredients?low_stock=true`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { items: Ingredient[] } };
        setLowStockItems(data.data?.items ?? []);
      }
    } catch { /* empty */ }
  }, [tenantId, branchId, inventoryUrl]);

  useEffect(() => { if (branchId) { void loadIngredients(); void loadLowStock(); } }, [branchId, loadIngredients, loadLowStock]);

  // ─── Load movements ────────────────────────────────────────────────────
  const loadMovements = async (ingredient: Ingredient) => {
    setSelectedIngredient(ingredient);
    setMovementsLoading(true);
    setTab('movements');
    try {
      const res = await fetch(`${inventoryUrl}/api/v1/inventory/${tenantId}/${branchId}/ingredients/${ingredient.id}/movements`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { movements: StockMovement[] } };
        setMovements(data.data?.movements ?? []);
      }
    } catch { /* empty */ } finally {
      setMovementsLoading(false);
    }
  };

  // ─── Add ingredient ────────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !branchId) return;
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch(`${inventoryUrl}/api/v1/inventory/${tenantId}/${branchId}/ingredients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          category: addForm.category,
          unit: addForm.unit,
          current_stock: parseFloat(addForm.current_stock) || 0,
          minimum_stock: parseFloat(addForm.minimum_stock) || 0,
          critical_stock: parseFloat(addForm.critical_stock) || 0,
          unit_cost: parseFloat(addForm.unit_cost) || 0,
          supplier: addForm.supplier || undefined,
        }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (data.success) {
        setShowAdd(false);
        setAddForm({ name: '', category: 'produce', unit: 'kg', current_stock: '', minimum_stock: '', critical_stock: '', unit_cost: '', supplier: '' });
        void loadIngredients();
        void loadLowStock();
      } else {
        setAddError(data.error ?? 'Failed to add ingredient');
      }
    } catch {
      setAddError('Something went wrong');
    } finally {
      setAdding(false);
    }
  };

  // ─── Stock adjustment ──────────────────────────────────────────────────
  const handleAdjust = async () => {
    if (!adjustingItem || !adjustDelta) return;
    setAdjusting(true);
    try {
      const delta = parseFloat(adjustDelta);
      const actualDelta = adjustType.includes('remove') || adjustType === 'waste' || adjustType === 'transfer_out' ? -Math.abs(delta) : Math.abs(delta);
      await fetch(`${inventoryUrl}/api/v1/inventory/${tenantId}/${branchId}/ingredients/${adjustingItem.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delta: actualDelta,
          movement_type: adjustType,
          notes: adjustNotes || undefined,
        }),
      });
      setAdjustingItem(null);
      setAdjustDelta('');
      setAdjustNotes('');
      void loadIngredients();
      void loadLowStock();
    } catch { /* empty */ } finally {
      setAdjusting(false);
    }
  };

  // ─── Filtered list ─────────────────────────────────────────────────────
  const filtered = ingredients.filter((i) => {
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (categoryFilter && i.category !== categoryFilter) return false;
    return true;
  });

  if (!branchId && !loading) {
    return (
      <div><SetupReturnBanner />
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-400 text-sm">No branch found. Create a branch first.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SetupReturnBanner />
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}
              {lowStockItems.length > 0 && (
                <span className="text-red-500 font-medium ml-2">
                  {lowStockItems.length} low stock alert{lowStockItems.length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + Add Ingredient
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
          {([
            { id: 'ingredients' as TabId, label: `All (${ingredients.length})` },
            { id: 'low_stock' as TabId, label: `Low Stock`, badge: lowStockItems.length || undefined },
            { id: 'movements' as TabId, label: selectedIngredient ? `History: ${selectedIngredient.name}` : 'History' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap relative ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── All Ingredients Tab ──────────────────────────────────────── */}
        {tab === 'ingredients' && (
          <div>
            {/* Search + Filter */}
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ingredients..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 bg-white"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-gray-400 text-sm">Loading inventory...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                <div className="text-3xl mb-2">&#128230;</div>
                <div className="text-sm font-medium text-gray-700 mb-1">No ingredients yet</div>
                <div className="text-xs text-gray-400">Add your first ingredient to start tracking stock.</div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-medium">Ingredient</th>
                      <th className="text-left px-5 py-3 font-medium">Category</th>
                      <th className="text-right px-5 py-3 font-medium">Stock</th>
                      <th className="text-left px-5 py-3 font-medium">Status</th>
                      <th className="text-right px-5 py-3 font-medium">Unit Cost</th>
                      <th className="text-left px-5 py-3 font-medium">Supplier</th>
                      <th className="text-left px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item, idx) => {
                      const level = getStockLevel(item);
                      return (
                        <tr key={item.id} className={`${idx > 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50`}>
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-900">{item.name}</div>
                          </td>
                          <td className="px-5 py-3 capitalize text-gray-600">{item.category}</td>
                          <td className="px-5 py-3 text-right">
                            <span className="font-semibold text-gray-900 font-mono">{item.current_stock}</span>
                            <span className="text-gray-400 ml-1">{item.unit}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${level.class}`}>
                              {level.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600 font-mono text-xs">
                            {item.unit_cost > 0 ? formatCurrency(item.unit_cost) : '\u2014'}
                          </td>
                          <td className="px-5 py-3 text-gray-500 text-xs">{item.supplier ?? '\u2014'}</td>
                          <td className="px-5 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setAdjustingItem(item); setAdjustType('manual_add'); }}
                                className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => { void loadMovements(item); }}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                History
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Low Stock Tab ────────────────────────────────────────────── */}
        {tab === 'low_stock' && (
          <div>
            {lowStockItems.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                <div className="text-3xl mb-2">&#9989;</div>
                <div className="text-sm font-medium text-gray-700 mb-1">All stock levels OK</div>
                <div className="text-xs text-gray-400">No ingredients are below their minimum stock threshold.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((item) => {
                  const level = getStockLevel(item);
                  const pct = item.minimum_stock > 0 ? Math.min((item.current_stock / item.minimum_stock) * 100, 100) : 100;
                  return (
                    <div key={item.id} className={`bg-white border rounded-xl p-4 shadow-sm ${level.label === 'Critical' ? 'border-red-200' : 'border-amber-200'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{item.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${level.class}`}>
                              {level.label}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            <span className="font-mono font-bold text-gray-900">{item.current_stock}</span> / {item.minimum_stock} {item.unit}
                            {item.reorder_quantity > 0 && (
                              <span className="ml-2 text-gray-400">Reorder qty: {item.reorder_quantity} {item.unit}</span>
                            )}
                          </div>
                          {/* Stock bar */}
                          <div className="w-48 h-2 bg-gray-100 rounded-full mt-2">
                            <div
                              className={`h-2 rounded-full transition-all ${level.label === 'Critical' ? 'bg-red-500' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => { setAdjustingItem(item); setAdjustType('manual_add'); }}
                          className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          + Add Stock
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Movements Tab ────────────────────────────────────────────── */}
        {tab === 'movements' && (
          <div>
            {!selectedIngredient ? (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                <div className="text-3xl mb-2">&#128203;</div>
                <div className="text-sm font-medium text-gray-700 mb-1">Select an ingredient</div>
                <div className="text-xs text-gray-400">Click "History" on any ingredient to view its stock movements.</div>
              </div>
            ) : movementsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-gray-400 text-sm">Loading history...</div>
              </div>
            ) : movements.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                <div className="text-sm font-medium text-gray-700 mb-1">No movements yet</div>
                <div className="text-xs text-gray-400">Stock adjustments for {selectedIngredient.name} will appear here.</div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-medium">Type</th>
                      <th className="text-right px-5 py-3 font-medium">Qty</th>
                      <th className="text-right px-5 py-3 font-medium">Before</th>
                      <th className="text-right px-5 py-3 font-medium">After</th>
                      <th className="text-left px-5 py-3 font-medium">Notes</th>
                      <th className="text-left px-5 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m, idx) => (
                      <tr key={m.id} className={`${idx > 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50`}>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${MOVEMENT_COLORS[m.movement_type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {m.movement_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          <span className={m.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                            {m.quantity > 0 ? '+' : ''}{m.quantity} {m.unit}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-gray-500">{m.stock_before}</td>
                        <td className="px-5 py-3 text-right font-mono text-gray-900 font-medium">{m.stock_after}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{m.notes ?? '\u2014'}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Add Ingredient Modal ─────────────────────────────────────── */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-[440px] shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Add Ingredient</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>
              {addError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-sm text-red-600">{addError}</p>
                </div>
              )}
              <form onSubmit={(e) => { void handleAdd(e); }} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
                  <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} required placeholder="e.g. Tomatoes" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                    <select value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 bg-white">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Unit</label>
                    <select value={addForm.unit} onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 bg-white">
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Current Stock</label>
                    <input type="number" step="0.01" value={addForm.current_stock} onChange={(e) => setAddForm({ ...addForm, current_stock: e.target.value })} placeholder="0" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Min Stock</label>
                    <input type="number" step="0.01" value={addForm.minimum_stock} onChange={(e) => setAddForm({ ...addForm, minimum_stock: e.target.value })} placeholder="0" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Critical</label>
                    <input type="number" step="0.01" value={addForm.critical_stock} onChange={(e) => setAddForm({ ...addForm, critical_stock: e.target.value })} placeholder="0" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Unit Cost (paise)</label>
                    <input type="number" value={addForm.unit_cost} onChange={(e) => setAddForm({ ...addForm, unit_cost: e.target.value })} placeholder="0" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Supplier</label>
                    <input value={addForm.supplier} onChange={(e) => setAddForm({ ...addForm, supplier: e.target.value })} placeholder="Optional" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={adding || !addForm.name} className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl">
                    {adding ? 'Adding...' : 'Add Ingredient'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── Stock Adjustment Modal ───────────────────────────────────── */}
        {adjustingItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-96 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Adjust Stock</h3>
                <button onClick={() => setAdjustingItem(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <div className="font-medium text-sm text-gray-900">{adjustingItem.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Current: <span className="font-mono font-bold">{adjustingItem.current_stock}</span> {adjustingItem.unit}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
                  <select value={adjustType} onChange={(e) => setAdjustType(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white">
                    <option value="manual_add">Add Stock</option>
                    <option value="manual_remove">Remove Stock</option>
                    <option value="waste">Waste / Spoilage</option>
                    <option value="opening">Opening Stock</option>
                    <option value="transfer_in">Transfer In</option>
                    <option value="transfer_out">Transfer Out</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Quantity ({adjustingItem.unit})</label>
                  <input type="number" step="0.01" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} placeholder="Enter quantity" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Notes (optional)</label>
                  <input value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} placeholder="Reason for adjustment" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setAdjustingItem(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Cancel</button>
                <button
                  onClick={() => { void handleAdjust(); }}
                  disabled={adjusting || !adjustDelta}
                  className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl"
                >
                  {adjusting ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
