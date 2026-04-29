import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
import SetupReturnBanner from '../components/SetupReturnBanner';
import { apiFetch } from '../lib/apiFetch';

function OnboardReturnBanner() {
  const navigate = useNavigate();
  if (!localStorage.getItem('onboarding_catalogue_return')) return null;
  return (
    <div className="bg-indigo-600 text-white px-4 py-2.5 flex items-center justify-between text-sm">
      <span className="font-medium">You came here from onboarding</span>
      <button
        onClick={() => {
          localStorage.removeItem('onboarding_catalogue_return');
          navigate('/onboard');
        }}
        className="flex items-center gap-1.5 bg-white text-indigo-600 font-semibold px-3 py-1 rounded-lg text-xs hover:bg-indigo-50 transition-colors"
      >
        ← Back to onboarding
      </button>
    </div>
  );
}

interface CatalogueSection {
  id: string;
  name: string;
  description?: string;
  is_available: boolean;
  position: number;
}

interface CatalogueItem {
  id: string;
  name: string;
  description?: string;
  price: number;        // paise
  mrp?: number;         // paise
  section_id?: string | null;
  is_available: boolean;
  is_food?: boolean;
  veg_type?: 'veg' | 'vegan' | 'non_veg' | 'egg';
  allergens?: string[];
  prep_time_mins?: number;
  calories?: number;
  images?: Array<{ url: string; isPrimary?: boolean }>;
}

interface ComboItemRecord {
  id: string;
  combo_id: string;
  item_id: string;
  quantity: number;
  variant_name?: string | null;
  item?: {
    id: string;
    name: string;
    price: number;
    mrp?: number;
    images?: Array<{ url: string; isPrimary?: boolean }>;
    is_available?: boolean;
    veg_type?: string;
  };
}

interface Combo {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  price: number;       // paise
  mrp?: number;        // paise
  is_available: boolean;
  items: ComboItemRecord[];
}

// ─── Add Section Modal ────────────────────────────────────────────────────────

function AddSectionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, description?: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave(name.trim(), desc.trim() || undefined);
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
          <h3 className="text-lg font-bold text-gray-900">New section</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Section name *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Starters, Drinks, Mains"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description (optional)</label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Freshly prepared every morning"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Creating...' : 'Create section'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({
  sections,
  defaultSectionId,
  onClose,
  onSave,
}: {
  sections: CatalogueSection[];
  defaultSectionId?: string;
  onClose: () => void;
  onSave: (data: {
    name: string;
    price: number;
    description?: string;
    section_id?: string;
    is_food?: boolean;
    veg_type?: string;
    allergens?: string[];
    prep_time_mins?: number;
    calories?: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [desc, setDesc] = useState('');
  const [sectionId, setSectionId] = useState(defaultSectionId ?? '');
  const [isFood, setIsFood] = useState(true);
  const [vegType, setVegType] = useState<'veg' | 'non_veg' | 'egg' | 'vegan'>('veg');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [prepTimeStr, setPrepTimeStr] = useState('');
  const [caloriesStr, setCaloriesStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleAllergen = (allergen: string) => {
    setAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Math.round(parseFloat(priceStr) * 100);
    if (!name.trim() || isNaN(price) || price < 0) {
      setError('Name and a valid price are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const prep = parseInt(prepTimeStr, 10);
      const cal = parseInt(caloriesStr, 10);
      await onSave({
        name: name.trim(),
        price,
        description: desc.trim() || undefined,
        section_id: sectionId || undefined,
        is_food: isFood,
        veg_type: isFood ? vegType : undefined,
        allergens: allergens.length > 0 ? allergens : undefined,
        prep_time_mins: !isNaN(prep) && prep >= 0 ? prep : undefined,
        calories: !isNaN(cal) && cal >= 0 ? cal : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Add item</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Item name *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paneer Tikka, Coffee, T-Shirt"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Price (₹) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="e.g. 250"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description (optional)</label>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Brief description..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prep time (mins)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={prepTimeStr}
                onChange={(e) => setPrepTimeStr(e.target.value)}
                placeholder="e.g. 15"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Calories</label>
              <input
                type="number"
                min="0"
                step="1"
                value={caloriesStr}
                onChange={(e) => setCaloriesStr(e.target.value)}
                placeholder="e.g. 320"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
          </div>
          {sections.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Section</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors bg-white"
              >
                <option value="">No section</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Food item?</span>
            <button
              type="button"
              onClick={() => setIsFood(!isFood)}
              className={`relative w-10 h-5 rounded-full transition-colors ${isFood ? 'bg-brand-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isFood ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {isFood && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['veg', 'non_veg', 'egg', 'vegan'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVegType(t)}
                    className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      vegType === t
                        ? 'bg-brand-50 border-brand-400 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {t === 'non_veg' ? 'Non-veg' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Allergens <span className="font-normal text-gray-400">(optional)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {(['gluten', 'dairy', 'eggs', 'nuts', 'peanuts', 'soy', 'fish', 'shellfish', 'sesame', 'mustard'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergen(a)}
                  className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                    allergens.includes(a)
                      ? 'bg-brand-50 border-brand-400 text-brand-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !priceStr}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Adding...' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Recipe Types & Picker ────────────────────────────────────────────────────

const RECIPE_UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'tbsp', 'tsp', 'cup'] as const;
type RecipeUnit = typeof RECIPE_UNITS[number];

interface ItemIngredientRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: RecipeUnit | null;
  ingredient_id: string | null;
  is_critical: boolean;
}

interface InventoryIngredient {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  category: string;
}

function InventoryPicker({
  inventoryServiceUrl,
  tenantId,
  branchId,
  authToken,
  onPick,
}: {
  inventoryServiceUrl: string;
  tenantId: string;
  branchId: string;
  authToken: string;
  onPick: (ing: InventoryIngredient) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InventoryIngredient[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim() || !branchId) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `${inventoryServiceUrl}/api/v1/inventory/${tenantId}/${branchId}/ingredients?search=${encodeURIComponent(query)}&limit=8`,
            { headers: { Authorization: `Bearer ${authToken}` } }
          );
          if (!res.ok) return;
          const json = (await res.json()) as { success: boolean; data?: { items: InventoryIngredient[] } };
          if (!cancelled) setResults(json.data?.items ?? []);
        } finally { if (!cancelled) setLoading(false); }
      })();
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, branchId, tenantId, inventoryServiceUrl, authToken]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search inventory…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      {open && query.trim() && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">
              No match in inventory. Add it under Inventory first to enable auto-deduct.
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(r); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center justify-between"
            >
              <span>{r.name}</span>
              <span className="text-xs text-gray-400">{r.current_stock} {r.unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Item Modal ──────────────────────────────────────────────────────────

function EditItemModal({
  item,
  tenantId,
  branchId,
  authToken,
  catalogueServiceUrl,
  inventoryServiceUrl,
  onClose,
  onSave,
}: {
  item: CatalogueItem;
  tenantId: string;
  branchId: string;
  authToken: string;
  catalogueServiceUrl: string;
  inventoryServiceUrl: string;
  onClose: () => void;
  onSave: (data: { name: string; price: number; mrp?: number; description?: string; is_food?: boolean; veg_type?: string; allergens?: string[]; prep_time_mins?: number; calories?: number }) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [priceStr, setPriceStr] = useState(String(item.price / 100));
  const [mrpStr, setMrpStr] = useState(item.mrp ? String(item.mrp / 100) : '');
  const [desc, setDesc] = useState(item.description ?? '');
  const [isFood, setIsFood] = useState(item.is_food !== false);
  const [vegType, setVegType] = useState<'veg' | 'non_veg' | 'egg' | 'vegan'>(
    (item.veg_type as 'veg' | 'non_veg' | 'egg' | 'vegan') ?? 'veg'
  );
  const [allergens, setAllergens] = useState<string[]>(item.allergens ?? []);
  const [prepTimeStr, setPrepTimeStr] = useState(
    item.prep_time_mins != null ? String(item.prep_time_mins) : ''
  );
  const [caloriesStr, setCaloriesStr] = useState(
    item.calories != null ? String(item.calories) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ─── Recipe state ──────────────────────────────────────────────────────────
  const [recipe, setRecipe] = useState<ItemIngredientRow[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(true);

  const ingredientsBase = `${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items/${item.id}/ingredients`;
  const authHdr = { Authorization: `Bearer ${authToken}` };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(ingredientsBase, { headers: authHdr });
        if (!res.ok) return;
        const json = (await res.json()) as { success: boolean; data?: { ingredients: ItemIngredientRow[] } };
        if (!cancelled) setRecipe(json.data?.ingredients ?? []);
      } finally { if (!cancelled) setRecipeLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addIngredient = async (data: Partial<ItemIngredientRow>) => {
    if (!data.name?.trim()) return;
    const res = await apiFetch(ingredientsBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHdr },
      body: JSON.stringify({
        name:          data.name.trim(),
        ingredient_id: data.ingredient_id ?? null,
        quantity:      data.quantity ?? null,
        unit:          data.unit ?? null,
        is_critical:   data.is_critical ?? false,
      }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { success: boolean; data?: { ingredient: ItemIngredientRow } };
    if (json.data?.ingredient) setRecipe((prev) => [...prev, json.data!.ingredient]);
  };

  const updateIngredient = async (id: string, patch: Partial<ItemIngredientRow>) => {
    setRecipe((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const res = await apiFetch(`${ingredientsBase}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHdr },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // revert by refetching on failure
      const fresh = await apiFetch(ingredientsBase, { headers: authHdr });
      if (fresh.ok) {
        const j = (await fresh.json()) as { data?: { ingredients: ItemIngredientRow[] } };
        setRecipe(j.data?.ingredients ?? []);
      }
    }
  };

  const removeIngredient = async (id: string) => {
    const prev = recipe;
    setRecipe((cur) => cur.filter((r) => r.id !== id));
    const res = await apiFetch(`${ingredientsBase}/${id}`, { method: 'DELETE', headers: authHdr });
    if (!res.ok) setRecipe(prev);
  };

  const toggleAllergen = (allergen: string) => {
    setAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Math.round(parseFloat(priceStr) * 100);
    const mrp = mrpStr ? Math.round(parseFloat(mrpStr) * 100) : undefined;
    if (!name.trim() || isNaN(price) || price < 0) {
      setError('Name and a valid price are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const prep = parseInt(prepTimeStr, 10);
      const cal = parseInt(caloriesStr, 10);
      await onSave({
        name: name.trim(),
        price,
        mrp,
        description: desc.trim() || undefined,
        is_food: isFood,
        veg_type: isFood ? vegType : undefined,
        allergens,
        prep_time_mins: !isNaN(prep) && prep >= 0 ? prep : undefined,
        calories: !isNaN(cal) && cal >= 0 ? cal : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Edit item</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Item name *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Price (₹) *</label>
              <input
                type="number" min="0" step="0.01"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">MRP (₹) <span className="font-normal text-gray-400">optional</span></label>
              <input
                type="number" min="0" step="0.01"
                value={mrpStr}
                onChange={(e) => setMrpStr(e.target.value)}
                placeholder="for strikethrough"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description <span className="font-normal text-gray-400">optional</span></label>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prep time (mins)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={prepTimeStr}
                onChange={(e) => setPrepTimeStr(e.target.value)}
                placeholder="e.g. 15"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Calories</label>
              <input
                type="number"
                min="0"
                step="1"
                value={caloriesStr}
                onChange={(e) => setCaloriesStr(e.target.value)}
                placeholder="e.g. 320"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Food item?</span>
            <button
              type="button"
              onClick={() => setIsFood(!isFood)}
              className={`relative w-10 h-5 rounded-full transition-colors ${isFood ? 'bg-brand-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isFood ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {isFood && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['veg', 'non_veg', 'egg', 'vegan'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVegType(t)}
                    className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      vegType === t
                        ? 'bg-brand-50 border-brand-400 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {t === 'non_veg' ? 'Non-veg' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Allergens <span className="font-normal text-gray-400">(optional)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {(['gluten', 'dairy', 'eggs', 'nuts', 'peanuts', 'soy', 'fish', 'shellfish', 'sesame', 'mustard'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergen(a)}
                  className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                    allergens.includes(a)
                      ? 'bg-brand-50 border-brand-400 text-brand-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* ── Recipe ─────────────────────────────────────────────────── */}
          <RecipeEditor
            recipe={recipe}
            loading={recipeLoading}
            onAdd={addIngredient}
            onUpdate={updateIngredient}
            onRemove={removeIngredient}
            inventoryServiceUrl={inventoryServiceUrl}
            tenantId={tenantId}
            branchId={branchId}
            authToken={authToken}
          />

          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !priceStr}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Recipe Editor ────────────────────────────────────────────────────────────

function RecipeEditor({
  recipe,
  loading,
  onAdd,
  onUpdate,
  onRemove,
  inventoryServiceUrl,
  tenantId,
  branchId,
  authToken,
}: {
  recipe: ItemIngredientRow[];
  loading: boolean;
  onAdd: (data: Partial<ItemIngredientRow>) => Promise<void>;
  onUpdate: (id: string, patch: Partial<ItemIngredientRow>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  inventoryServiceUrl: string;
  tenantId: string;
  branchId: string;
  authToken: string;
}) {
  const [draft, setDraft] = useState<{
    name: string;
    ingredient_id: string | null;
    quantity: string;
    unit: RecipeUnit | '';
    is_critical: boolean;
  }>({ name: '', ingredient_id: null, quantity: '', unit: '', is_critical: false });

  const handleAddRow = async () => {
    if (!draft.name.trim()) return;
    const qty = draft.quantity ? parseFloat(draft.quantity) : null;
    await onAdd({
      name:          draft.name,
      ingredient_id: draft.ingredient_id,
      quantity:      qty && !isNaN(qty) && qty > 0 ? qty : null,
      unit:          draft.unit || null,
      is_critical:   draft.is_critical,
    });
    setDraft({ name: '', ingredient_id: null, quantity: '', unit: '', is_critical: false });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-gray-500">
          Recipe <span className="font-normal text-gray-400">(optional, drives stock deduction)</span>
        </label>
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">Loading recipe…</div>
      ) : (
        <div className="space-y-2">
          {recipe.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => void onUpdate(r.id, { name: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-brand-500"
                />
                {r.ingredient_id ? (
                  <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                    ✓ Linked
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded" title="Link to inventory ingredient to enable auto-deduct">
                    ⚠ No stock link
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void onRemove(r.id)}
                  className="text-gray-400 hover:text-red-500 text-sm leading-none px-1"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.quantity ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    void onUpdate(r.id, { quantity: v ? parseFloat(v) : null });
                  }}
                  placeholder="Qty"
                  className="w-16 border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-brand-500 font-mono"
                />
                <select
                  value={r.unit ?? ''}
                  onChange={(e) => void onUpdate(r.id, { unit: (e.target.value || null) as RecipeUnit | null })}
                  className="border border-gray-200 rounded-md px-1.5 py-1 text-xs outline-none focus:border-brand-500"
                >
                  <option value="">—</option>
                  {RECIPE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <label className="flex items-center gap-1 ml-auto cursor-pointer text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={r.is_critical}
                    onChange={(e) => void onUpdate(r.id, { is_critical: e.target.checked })}
                    className="accent-brand-500"
                  />
                  Critical
                </label>
              </div>
            </div>
          ))}

          {/* New row form */}
          <div className="border border-dashed border-gray-300 rounded-lg p-2 space-y-1.5 bg-gray-50">
            <InventoryPicker
              inventoryServiceUrl={inventoryServiceUrl}
              tenantId={tenantId}
              branchId={branchId}
              authToken={authToken}
              onPick={(ing) => setDraft((d) => ({
                ...d,
                name:          ing.name,
                ingredient_id: ing.id,
                unit:          (RECIPE_UNITS as readonly string[]).includes(ing.unit) ? (ing.unit as RecipeUnit) : d.unit,
              }))}
            />
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value, ingredient_id: null })}
                placeholder="Or type a name (no stock link)"
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-brand-500"
              />
              {draft.ingredient_id && (
                <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                  ✓ Linked
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                placeholder="Qty"
                className="w-16 border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-brand-500 font-mono"
              />
              <select
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value as RecipeUnit | '' })}
                className="border border-gray-200 rounded-md px-1.5 py-1 text-xs outline-none focus:border-brand-500"
              >
                <option value="">—</option>
                {RECIPE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={draft.is_critical}
                  onChange={(e) => setDraft({ ...draft, is_critical: e.target.checked })}
                  className="accent-brand-500"
                />
                Critical
              </label>
              <button
                type="button"
                onClick={() => void handleAddRow()}
                disabled={!draft.name.trim()}
                className="ml-auto px-3 py-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-xs font-semibold rounded-md"
              >
                Add
              </button>
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">
              Pick from inventory to enable stock auto-deduct on order. Free-text names track allergens only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Combo modals ─────────────────────────────────────────────────────────────

function ComboFormModal({
  combo,
  onClose,
  onSave,
}: {
  combo?: Combo;
  onClose: () => void;
  onSave: (data: { name: string; price: number; mrp?: number; description?: string; image_url?: string }) => Promise<void>;
}) {
  const isEdit = !!combo;
  const [name, setName] = useState(combo?.name ?? '');
  const [priceStr, setPriceStr] = useState(combo ? String(combo.price / 100) : '');
  const [mrpStr, setMrpStr] = useState(combo?.mrp ? String(combo.mrp / 100) : '');
  const [desc, setDesc] = useState(combo?.description ?? '');
  const [imageUrl, setImageUrl] = useState(combo?.image_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Math.round(parseFloat(priceStr) * 100);
    const mrp = mrpStr ? Math.round(parseFloat(mrpStr) * 100) : undefined;
    if (!name.trim() || isNaN(price) || price < 0) {
      setError('Name and a valid price are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        price,
        mrp,
        description: desc.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save combo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit combo' : 'New combo'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Combo name *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Family Feast, Lunch Special"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Price (₹) *</label>
              <input
                type="number" min="0" step="0.01"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="599"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">MRP (₹) <span className="font-normal text-gray-400">optional</span></label>
              <input
                type="number" min="0" step="0.01"
                value={mrpStr}
                onChange={(e) => setMrpStr(e.target.value)}
                placeholder="for strikethrough"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description <span className="font-normal text-gray-400">optional</span></label>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What's in this combo..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Image URL <span className="font-normal text-gray-400">optional</span></label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !priceStr}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create combo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddComboItemModal({
  items,
  existingItemIds,
  onClose,
  onSave,
}: {
  items: CatalogueItem[];
  existingItemIds: string[];
  onClose: () => void;
  onSave: (data: { item_id: string; quantity: number }) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const eligible = items.filter((i) =>
    !existingItemIds.includes(i.id) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!pickedId) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ item_id: pickedId, quantity: qty });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Add item to combo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors mb-3"
        />
        <div className="flex-1 overflow-y-auto space-y-1.5 -mx-2 px-2">
          {eligible.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              {items.length === 0 ? 'Add some items first' : 'No matching items'}
            </p>
          ) : eligible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPickedId(item.id)}
              className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
                pickedId === item.id
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              {item.is_food && <VegDot type={item.veg_type} />}
              <span className="text-sm text-gray-800 flex-1 truncate">{item.name}</span>
              <span className="text-xs font-mono text-gray-500">₹{(item.price / 100).toFixed(0)}</span>
            </button>
          ))}
        </div>
        {pickedId && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
            <label className="text-xs font-medium text-gray-500">Quantity</label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-brand-500 font-mono"
            />
          </div>
        )}
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !pickedId}
            className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {saving ? 'Adding...' : 'Add to combo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Veg indicator dot ────────────────────────────────────────────────────────
function VegDot({ type }: { type?: string }) {
  if (!type) return null;
  const color =
    type === 'veg' ? 'border-green-600 bg-green-500' :
    type === 'vegan' ? 'border-green-700 bg-green-700' :
    type === 'egg' ? 'border-yellow-500 bg-yellow-400' :
    'border-red-600 bg-red-500';
  return (
    <span className={`inline-block w-3 h-3 rounded-sm border-2 ${color} shrink-0`} title={type} />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Catalogue() {
  const auth = useAppSelector((s) => s.auth);
  const tenantId = auth.user?.tenant_id ?? '';

  const catalogueServiceUrl = import.meta.env.VITE_CATALOGUE_SERVICE_URL ?? 'http://localhost:3003';
  const inventoryServiceUrl = import.meta.env.VITE_INVENTORY_SERVICE_URL ?? 'http://localhost:3005';
  const tenantServiceUrl    = import.meta.env.VITE_TENANT_SERVICE_URL    ?? 'http://localhost:3002';

  const [branchId, setBranchId] = useState<string>('');
  useEffect(() => {
    if (!tenantId || !auth.token) return;
    void (async () => {
      try {
        const res = await fetch(`${tenantServiceUrl}/api/v1/tenants/${tenantId}/branches`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { success: boolean; data?: { branches: { id: string; is_primary: boolean }[] } };
        const primary = json.data?.branches?.find((b) => b.is_primary) ?? json.data?.branches?.[0];
        if (primary) setBranchId(primary.id);
      } catch { /* empty */ }
    })();
  }, [tenantId, auth.token, tenantServiceUrl]);

  const [view, setView] = useState<'items' | 'combos'>('items');
  const [editMode, setEditMode] = useState(false);
  const [sections, setSections] = useState<CatalogueSection[]>([]);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddSection, setShowAddSection] = useState(false);
  const [addItemForSection, setAddItemForSection] = useState<string | undefined>(undefined);
  const [showAddItemGlobal, setShowAddItemGlobal] = useState(false);

  // Combo modals
  const [showAddCombo, setShowAddCombo] = useState(false);
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const editingCombo = editingComboId ? (combos.find((c) => c.id === editingComboId) ?? null) : null;
  const [addItemToComboId, setAddItemToComboId] = useState<string | null>(null);
  const [confirmDeleteCombo, setConfirmDeleteCombo] = useState<string | null>(null);

  // Delete confirmations
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);

  // Edit item — store ID only so the modal always reads the latest price from `items` state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const editingItem = editingItemId ? (items.find((i) => i.id === editingItemId) ?? null) : null;

  // View item — full detail modal (read-only)
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const viewingItem = viewingItemId ? (items.find((i) => i.id === viewingItemId) ?? null) : null;

  // Inline rename
  const [renamingSection, setRenamingSection] = useState<{ id: string; name: string } | null>(null);

  const canEdit = ['tenant_owner', 'primary_owner', 'managing_partner', 'head_chef', 'branch_manager'].includes(
    auth.user?.role ?? ''
  );

  const authHeader = { Authorization: `Bearer ${auth.token}` };

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const token = auth.token;
    const header = { Authorization: `Bearer ${token}` };
    void (async () => {
      try {
        const [secRes, itemRes, comboRes] = await Promise.all([
          apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/sections`, { headers: header }),
          apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items`, { headers: header }),
          apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/combos`, { headers: header }),
        ]);
        const [secData, itemData, comboData] = await Promise.all([
          secRes.ok ? secRes.json() as Promise<{ success: boolean; data?: { sections: CatalogueSection[] } }> : Promise.resolve({ success: false }),
          itemRes.ok ? itemRes.json() as Promise<{ success: boolean; data?: { items: CatalogueItem[] } }> : Promise.resolve({ success: false }),
          comboRes.ok ? comboRes.json() as Promise<{ success: boolean; data?: { combos: Combo[] } }> : Promise.resolve({ success: false }),
        ]);
        if (cancelled) return;
        if (secData.success) setSections((secData as { success: boolean; data?: { sections: CatalogueSection[] } }).data?.sections ?? []);
        if (itemData.success) setItems((itemData as { success: boolean; data?: { items: CatalogueItem[] } }).data?.items ?? []);
        if (comboData.success) setCombos((comboData as { success: boolean; data?: { combos: Combo[] } }).data?.combos ?? []);
      } catch {
        // Service unreachable — show empty state so user can still start adding items
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, auth.token, catalogueServiceUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Section actions ──────────────────────────────────────────────────────

  const handleAddSection = async (name: string, description?: string) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ name, description }),
    });
    const data = (await res.json()) as { success: boolean; error?: string; data?: { section: CatalogueSection } };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to create section');
    setSections((prev) => [...prev, data.data!.section].sort((a, b) => a.position - b.position));
  };

  const handleRenameSection = async (id: string, name: string) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/sections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { success: boolean; error?: string; data?: { section: CatalogueSection } };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to rename');
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setRenamingSection(null);
  };

  const handleToggleSection = async (section: CatalogueSection) => {
    const newAvail = !section.is_available;
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/sections/${section.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ is_available: newAvail }),
    });
    const data = (await res.json()) as { success: boolean };
    if (!res.ok || !data.success) return;
    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, is_available: newAvail } : s)));
  };

  const handleDeleteSection = async (id: string) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/sections/${id}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    if (!res.ok) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
    setItems((prev) => prev.map((i) => (i.section_id === id ? { ...i, section_id: null } : i)));
    setConfirmDeleteSection(null);
  };

  // ─── Item actions ─────────────────────────────────────────────────────────

  const handleAddItem = async (d: {
    name: string; price: number; description?: string;
    section_id?: string; is_food?: boolean; veg_type?: string; allergens?: string[];
    prep_time_mins?: number; calories?: number;
  }) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(d),
    });
    const data = (await res.json()) as { success: boolean; error?: string; data?: { item: CatalogueItem } };
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to add item');
    setItems((prev) => [...prev, data.data!.item]);
  };

  const handleToggleItem = async (item: CatalogueItem) => {
    const newAvail = !item.is_available;
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ is_available: newAvail }),
    });
    const data = (await res.json()) as { success: boolean };
    if (!res.ok || !data.success) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_available: newAvail } : i)));
  };

  const handleDeleteItem = async (id: string) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items/${id}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    if (!res.ok) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setConfirmDeleteItem(null);
  };

  const handleMoveItemToSection = async (itemId: string, sectionId: string | null) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ section_id: sectionId }),
    });
    if (!res.ok) return;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, section_id: sectionId } : i))
    );
  };

  const handleEditItem = async (
    itemId: string,
    data: { name: string; price: number; mrp?: number; description?: string; is_food?: boolean; veg_type?: string; allergens?: string[]; prep_time_mins?: number; calories?: number }
  ) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as { success: boolean; error?: string; data?: { item: CatalogueItem } };
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to save');
    // Use the API response (DB ground truth) so price/mrp are always in correct paise format
    const updated = json.data?.item;
    setItems((prev) => prev.map((i) =>
      i.id === itemId
        ? updated ? { ...i, ...updated } : { ...i, ...data, veg_type: data.veg_type as CatalogueItem['veg_type'] }
        : i
    ));
  };

  // ─── Combo actions ────────────────────────────────────────────────────────

  const handleAddCombo = async (data: { name: string; price: number; mrp?: number; description?: string; image_url?: string }) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/combos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as { success: boolean; error?: string; data?: { combo: Combo } };
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to create combo');
    if (json.data?.combo) setCombos((prev) => [...prev, { ...json.data!.combo, items: json.data!.combo.items ?? [] }]);
  };

  const handleEditCombo = async (id: string, data: { name: string; price: number; mrp?: number; description?: string; image_url?: string }) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/combos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as { success: boolean; error?: string; data?: { combo: Combo } };
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to save');
    const updated = json.data?.combo;
    setCombos((prev) => prev.map((c) => (c.id === id ? (updated ? { ...c, ...updated } : { ...c, ...data }) : c)));
  };

  const handleToggleCombo = async (combo: Combo) => {
    const newAvail = !combo.is_available;
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/combos/${combo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ is_available: newAvail }),
    });
    if (!res.ok) return;
    setCombos((prev) => prev.map((c) => (c.id === combo.id ? { ...c, is_available: newAvail } : c)));
  };

  const handleDeleteCombo = async (id: string) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/combos/${id}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    if (!res.ok) return;
    setCombos((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteCombo(null);
  };

  const handleAddComboItem = async (comboId: string, data: { item_id: string; quantity: number }) => {
    const res = await apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/combos/${comboId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as { success: boolean; error?: string; data?: { combo_item: ComboItemRecord } };
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to add item');
    if (json.data?.combo_item) {
      // Stitch the picked item's basic info onto the new combo item record so the
      // UI doesn't need to refetch the whole combo for name/price/image.
      const pickedItem = items.find((i) => i.id === data.item_id);
      const enriched: ComboItemRecord = {
        ...json.data.combo_item,
        item: pickedItem ? {
          id: pickedItem.id,
          name: pickedItem.name,
          price: pickedItem.price,
          mrp: pickedItem.mrp,
          images: pickedItem.images,
          is_available: pickedItem.is_available,
          veg_type: pickedItem.veg_type,
        } : undefined,
      };
      setCombos((prev) => prev.map((c) => (c.id === comboId ? { ...c, items: [...c.items, enriched] } : c)));
    }
  };

  const handleRemoveComboItem = async (comboId: string, comboItemId: string) => {
    const res = await apiFetch(
      `${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/combos/${comboId}/items/${comboItemId}`,
      { method: 'DELETE', headers: authHeader }
    );
    if (!res.ok) return;
    setCombos((prev) => prev.map((c) =>
      c.id === comboId ? { ...c, items: c.items.filter((ci) => ci.id !== comboItemId) } : c
    ));
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <OnboardReturnBanner />
        <SetupReturnBanner />
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-400 text-sm">Loading catalogue...</div>
        </div>
      </div>
    );
  }

  const unsectioned = items.filter((i) => !i.section_id);

  return (
    <div>
      <OnboardReturnBanner />
      <SetupReturnBanner />

      {/* Modals */}
      {showAddSection && (
        <AddSectionModal
          onClose={() => setShowAddSection(false)}
          onSave={handleAddSection}
        />
      )}
      {(showAddItemGlobal || addItemForSection !== undefined) && (
        <AddItemModal
          sections={sections}
          defaultSectionId={addItemForSection}
          onClose={() => { setShowAddItemGlobal(false); setAddItemForSection(undefined); }}
          onSave={handleAddItem}
        />
      )}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          tenantId={tenantId}
          branchId={branchId}
          authToken={auth.token ?? ''}
          catalogueServiceUrl={catalogueServiceUrl}
          inventoryServiceUrl={inventoryServiceUrl}
          onClose={() => setEditingItemId(null)}
          onSave={(data) => handleEditItem(editingItem.id, data)}
        />
      )}
      {viewingItem && (
        <ItemDetailModal
          item={viewingItem}
          tenantId={tenantId}
          authToken={auth.token ?? ''}
          catalogueServiceUrl={catalogueServiceUrl}
          canEdit={canEdit}
          onClose={() => setViewingItemId(null)}
          onEdit={() => { setViewingItemId(null); setEditingItemId(viewingItem.id); }}
        />
      )}
      {showAddCombo && (
        <ComboFormModal
          onClose={() => setShowAddCombo(false)}
          onSave={handleAddCombo}
        />
      )}
      {editingCombo && (
        <ComboFormModal
          combo={editingCombo}
          onClose={() => setEditingComboId(null)}
          onSave={(data) => handleEditCombo(editingCombo.id, data)}
        />
      )}
      {addItemToComboId && (
        <AddComboItemModal
          items={items}
          existingItemIds={
            combos.find((c) => c.id === addItemToComboId)?.items.map((ci) => ci.item_id) ?? []
          }
          onClose={() => setAddItemToComboId(null)}
          onSave={(d) => handleAddComboItem(addItemToComboId, d)}
        />
      )}

      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header — only show title row; Edit toggle hidden when catalogue is empty */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Catalogue</h1>
            {(sections.length > 0 || items.length > 0 || combos.length > 0) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {items.length} items · {sections.length} sections · {combos.length} combos
              </p>
            )}
          </div>
          {/* Edit controls — only when catalogue has content */}
          {canEdit && (sections.length > 0 || items.length > 0 || combos.length > 0) && (
            <div className="flex items-center gap-2">
              {editMode && view === 'items' && (
                <>
                  <button
                    onClick={() => setShowAddSection(true)}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-brand-300 hover:text-brand-600 font-medium transition-colors"
                  >
                    + Section
                  </button>
                  <button
                    onClick={() => setShowAddItemGlobal(true)}
                    className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    + Item
                  </button>
                </>
              )}
              {editMode && view === 'combos' && (
                <button
                  onClick={() => setShowAddCombo(true)}
                  className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  + Combo
                </button>
              )}
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  editMode
                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'
                }`}
              >
                {editMode ? '👁 View' : '✏️ Edit'}
              </button>
            </div>
          )}
        </div>

        {/* Tab toggle: Items vs Combos */}
        {(sections.length > 0 || items.length > 0 || combos.length > 0) && (
          <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
            <button
              onClick={() => setView('items')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === 'items'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Items <span className="text-xs text-gray-400 ml-1">({items.length})</span>
            </button>
            <button
              onClick={() => setView('combos')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === 'combos'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Combos <span className="text-xs text-gray-400 ml-1">({combos.length})</span>
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>
        )}

        {/* Empty state */}
        {sections.length === 0 && items.length === 0 && combos.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="text-5xl mb-4">📋</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No items yet</h2>
            <p className="text-gray-500 text-sm max-w-xs mb-6">
              Start by adding a section (like "Starters" or "Drinks"), then add items to it.
            </p>
            {canEdit && (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddSection(true)}
                  className="px-5 py-2.5 border border-brand-300 text-brand-600 hover:bg-brand-50 text-sm font-medium rounded-xl transition-colors"
                >
                  + Add section
                </button>
                <button
                  onClick={() => setShowAddItemGlobal(true)}
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  + Add item
                </button>
              </div>
            )}
          </div>
        )}

        {/* Combos view */}
        {view === 'combos' && (
          <>
            {combos.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
                <div className="text-5xl mb-4">🍱</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No combos yet</h2>
                <p className="text-gray-500 text-sm max-w-xs mb-6">
                  Bundle items together at a special price. Great for family meals, lunch specials, or value packs.
                </p>
                {canEdit && (
                  <button
                    onClick={() => setShowAddCombo(true)}
                    className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    + Create combo
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {combos.map((combo) => (
                  <ComboCard
                    key={combo.id}
                    combo={combo}
                    editMode={editMode && canEdit}
                    onToggle={() => void handleToggleCombo(combo)}
                    onEdit={() => setEditingComboId(combo.id)}
                    onAddItem={() => setAddItemToComboId(combo.id)}
                    onRemoveItem={(ciId) => void handleRemoveComboItem(combo.id, ciId)}
                    onDelete={() => setConfirmDeleteCombo(combo.id)}
                    confirmingDelete={confirmDeleteCombo === combo.id}
                    onConfirmDelete={() => void handleDeleteCombo(combo.id)}
                    onCancelDelete={() => setConfirmDeleteCombo(null)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Sections (Items view) */}
        {view === 'items' && (
        <div className="space-y-8">
          {sections.map((section) => {
            const sectionItems = items.filter((i) => i.section_id === section.id);
            const isRenaming = renamingSection?.id === section.id;
            return (
              <div key={section.id} className={!section.is_available ? 'opacity-60' : ''}>
                {/* Section header */}
                <div className="flex items-center justify-between mb-3">
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleRenameSection(section.id, renamingSection!.name);
                      }}
                      className="flex items-center gap-2 flex-1"
                    >
                      <input
                        autoFocus
                        value={renamingSection!.name}
                        onChange={(e) => setRenamingSection({ id: section.id, name: e.target.value })}
                        className="border border-brand-400 rounded-lg px-2 py-1 text-sm font-semibold outline-none"
                      />
                      <button type="submit" className="text-xs text-brand-600 font-medium hover:text-brand-700">Save</button>
                      <button type="button" onClick={() => setRenamingSection(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </form>
                  ) : (
                    <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
                      {section.name} <span className="font-normal text-gray-400 normal-case">({sectionItems.length})</span>
                      {!section.is_available && <span className="ml-2 text-xs text-orange-500 font-medium normal-case">(hidden)</span>}
                    </h3>
                  )}
                  {editMode && canEdit && !isRenaming && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAddItemForSection(section.id)}
                        className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                      >
                        + Item
                      </button>
                      <button
                        onClick={() => setRenamingSection({ id: section.id, name: section.name })}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => void handleToggleSection(section)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        {section.is_available ? 'Hide' : 'Show'}
                      </button>
                      {confirmDeleteSection === section.id ? (
                        <span className="flex items-center gap-1">
                          <button onClick={() => void handleDeleteSection(section.id)} className="text-xs text-red-500 hover:text-red-600 font-medium">Confirm</button>
                          <button onClick={() => setConfirmDeleteSection(null)} className="text-xs text-gray-400">Cancel</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteSection(section.id)}
                          className="text-xs text-red-400 hover:text-red-500"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Item grid */}
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {sectionItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      editMode={editMode && canEdit}
                      sections={sections}
                      onToggle={() => void handleToggleItem(item)}
                      onEdit={() => setEditingItemId(item.id)}
                      onDelete={() => setConfirmDeleteItem(item.id)}
                      onMoveToSection={(sid) => void handleMoveItemToSection(item.id, sid)}
                      onView={() => setViewingItemId(item.id)}
                      confirmingDelete={confirmDeleteItem === item.id}
                      onConfirmDelete={() => void handleDeleteItem(item.id)}
                      onCancelDelete={() => setConfirmDeleteItem(null)}
                    />
                  ))}
                  {editMode && canEdit && (
                    <button
                      onClick={() => setAddItemForSection(section.id)}
                      className="border-2 border-dashed border-brand-200 rounded-xl p-4 text-brand-400 hover:bg-brand-50 hover:border-brand-400 transition-colors flex items-center justify-center gap-2 text-sm font-medium min-h-20"
                    >
                      + Add item
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Unsectioned items */}
          {unsectioned.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">
                General <span className="font-normal text-gray-400 normal-case">({unsectioned.length})</span>
              </h3>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {unsectioned.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    editMode={editMode && canEdit}
                    sections={sections}
                    onToggle={() => void handleToggleItem(item)}
                    onEdit={() => setEditingItemId(item.id)}
                    onDelete={() => setConfirmDeleteItem(item.id)}
                    onMoveToSection={(sid) => void handleMoveItemToSection(item.id, sid)}
                    onView={() => setViewingItemId(item.id)}
                    confirmingDelete={confirmDeleteItem === item.id}
                    onConfirmDelete={() => void handleDeleteItem(item.id)}
                    onCancelDelete={() => setConfirmDeleteItem(null)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add section prompt when we have items but no sections yet */}
          {sections.length === 0 && items.length > 0 && editMode && canEdit && (
            <button
              onClick={() => setShowAddSection(true)}
              className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-brand-300 hover:text-brand-500 text-sm font-medium transition-colors"
            >
              + Add section
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  editMode,
  sections,
  onToggle,
  onEdit,
  onDelete,
  onMoveToSection,
  onView,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  item: CatalogueItem;
  editMode: boolean;
  sections: CatalogueSection[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveToSection: (sectionId: string | null) => void;
  onView: () => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const primaryImage = item.images?.find((img) => img.isPrimary) ?? item.images?.[0];

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm transition-all hover:shadow-md hover:border-brand-200 ${!item.is_available ? 'opacity-55' : ''}`}>
      <button
        type="button"
        onClick={onView}
        className="w-full text-left flex items-start justify-between gap-3 cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {item.is_food && <VegDot type={item.veg_type} />}
            <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
            {typeof item.prep_time_mins === 'number' && item.prep_time_mins > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                ⏱ {item.prep_time_mins} min
              </span>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{item.description}</p>
          )}
          <div className="text-brand-600 font-semibold text-sm mt-1.5 font-mono">
            ₹{(item.price / 100).toFixed(0)}
            {item.mrp > 0 && item.mrp > item.price && (
              <span className="ml-1.5 line-through text-gray-400 font-normal text-xs">₹{(item.mrp / 100).toFixed(0)}</span>
            )}
          </div>
          {typeof item.calories === 'number' && item.calories > 0 && (
            <div className="text-[11px] text-gray-400 mt-0.5">{item.calories} cal</div>
          )}
        </div>
        {primaryImage ? (
          <img src={primaryImage.url} alt={item.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xl shrink-0">
            {item.is_food ? '🍽' : '📦'}
          </div>
        )}
      </button>

      <div className="mt-3 flex items-center gap-2">
        {!editMode ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.is_available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {item.is_available ? 'Available' : 'Unavailable'}
          </span>
        ) : confirmingDelete ? (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-red-600 font-medium flex-1">Delete?</span>
            <button onClick={onConfirmDelete} className="text-xs text-red-500 hover:text-red-600 font-semibold">Yes</button>
            <button onClick={onCancelDelete} className="text-xs text-gray-400 hover:text-gray-600">No</button>
          </div>
        ) : (
          <>
            <button
              onClick={onToggle}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${item.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.is_available ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs text-gray-500 flex-1">{item.is_available ? 'On' : 'Off'}</span>
            <button onClick={onEdit} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Edit</button>
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-500 font-medium">Delete</button>
          </>
        )}
      </div>
      {/* Section assignment — only in edit mode when sections exist */}
      {editMode && !confirmingDelete && sections.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <select
            value={item.section_id ?? ''}
            onChange={(e) => onMoveToSection(e.target.value || null)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 outline-none focus:border-brand-400 transition-colors"
          >
            <option value="">No section (General)</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Item Detail Modal (full info, read-only) ─────────────────────────────────

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', dairy: 'Dairy', eggs: 'Eggs', nuts: 'Nuts', peanuts: 'Peanuts',
  soy: 'Soy', fish: 'Fish', shellfish: 'Shellfish', sesame: 'Sesame', mustard: 'Mustard',
};

interface ItemDetailIngredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  is_critical: boolean;
  ingredient_id: string | null;
  calories: number | null;
  allergens: string[];
}

function ItemDetailModal({
  item,
  tenantId,
  authToken,
  catalogueServiceUrl,
  canEdit,
  onClose,
  onEdit,
}: {
  item: CatalogueItem;
  tenantId: string;
  authToken: string;
  catalogueServiceUrl: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [recipe, setRecipe] = useState<ItemDetailIngredient[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingRecipe(true);
      try {
        const res = await fetch(
          `${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items/${item.id}/ingredients`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!res.ok) return;
        const body = await res.json() as { data?: { ingredients?: ItemDetailIngredient[] } };
        if (!cancelled) setRecipe(body.data?.ingredients ?? []);
      } catch {
        // swallow — non-critical
      } finally {
        if (!cancelled) setLoadingRecipe(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, item.id, authToken, catalogueServiceUrl]);

  const primaryImage = item.images?.find((img) => img.isPrimary) ?? item.images?.[0];
  const savings = item.mrp && item.mrp > item.price ? item.mrp - item.price : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Hero image */}
        <div className="relative">
          {primaryImage ? (
            <img src={primaryImage.url} alt={item.name} className="w-full h-56 object-cover rounded-t-2xl" />
          ) : (
            <div className="w-full h-56 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-6xl rounded-t-2xl">
              {item.is_food ? '🍽' : '📦'}
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 bg-white/90 hover:bg-white rounded-full shadow flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
          {!item.is_available && (
            <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              Unavailable
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Title + veg dot */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {item.is_food && <VegDot type={item.veg_type} />}
                <h2 className="text-xl font-bold text-gray-900">{item.name}</h2>
              </div>
              {item.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
              )}
            </div>
          </div>

          {/* Price block */}
          <div className="flex items-baseline gap-3 pb-4 border-b border-gray-100">
            <span className="text-2xl font-bold text-brand-600 font-mono">
              ₹{(item.price / 100).toFixed(0)}
            </span>
            {savings > 0 && item.mrp && (
              <>
                <span className="text-base line-through text-gray-400 font-mono">₹{(item.mrp / 100).toFixed(0)}</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Save ₹{(savings / 100).toFixed(0)}
                </span>
              </>
            )}
          </div>

          {/* Allergens */}
          {item.allergens && item.allergens.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contains allergens</div>
              <div className="flex flex-wrap gap-1.5">
                {item.allergens.map((a) => (
                  <span key={a} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-medium">
                    {ALLERGEN_LABELS[a] ?? a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recipe / ingredients */}
          {loadingRecipe ? (
            <div className="text-xs text-gray-400">Loading ingredients…</div>
          ) : recipe.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ingredients</div>
              <ul className="space-y-1.5">
                {recipe.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700">{r.name}</span>
                      {r.is_critical && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          Critical
                        </span>
                      )}
                    </div>
                    {r.quantity != null && (
                      <span className="text-xs text-gray-500 font-mono">
                        {r.quantity} {r.unit ?? ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-medium text-gray-700 transition-colors"
            >
              Close
            </button>
            {canEdit && (
              <button
                onClick={onEdit}
                className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Edit item
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Combo Card ───────────────────────────────────────────────────────────────

function ComboCard({
  combo,
  editMode,
  onToggle,
  onEdit,
  onAddItem,
  onRemoveItem,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  combo: Combo;
  editMode: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddItem: () => void;
  onRemoveItem: (comboItemId: string) => void;
  onDelete: () => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const itemsTotal = combo.items.reduce(
    (sum, ci) => sum + (ci.item?.price ?? 0) * ci.quantity,
    0
  );
  const savings = itemsTotal - combo.price;

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${!combo.is_available ? 'opacity-55' : ''}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        {combo.image_url ? (
          <img src={combo.image_url} alt={combo.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-16 h-16 bg-amber-50 rounded-lg flex items-center justify-center text-2xl shrink-0">
            🍱
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm truncate">{combo.name}</div>
          {combo.description && (
            <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{combo.description}</p>
          )}
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-brand-600 font-semibold text-sm font-mono">
              ₹{(combo.price / 100).toFixed(0)}
            </span>
            {combo.mrp && combo.mrp > combo.price && (
              <span className="line-through text-gray-400 text-xs font-mono">₹{(combo.mrp / 100).toFixed(0)}</span>
            )}
            {savings > 0 && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                Save ₹{(savings / 100).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
          {combo.items.length === 0 ? 'No items yet' : `Includes ${combo.items.length} ${combo.items.length === 1 ? 'item' : 'items'}`}
        </div>
        <div className="space-y-1.5">
          {combo.items.map((ci) => (
            <div key={ci.id} className="flex items-center gap-2 text-xs">
              {ci.item?.veg_type && <VegDot type={ci.item.veg_type} />}
              <span className="text-gray-700 flex-1 truncate">
                {ci.item?.name ?? 'Unknown item'}
                {ci.variant_name && <span className="text-gray-400"> · {ci.variant_name}</span>}
              </span>
              <span className="text-gray-500 font-mono">×{ci.quantity}</span>
              {editMode && (
                <button
                  onClick={() => onRemoveItem(ci.id)}
                  className="text-red-400 hover:text-red-500 ml-1 leading-none"
                  title="Remove from combo"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {editMode && (
            <button
              onClick={onAddItem}
              className="text-xs text-brand-500 hover:text-brand-600 font-medium mt-1"
            >
              + Add item
            </button>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
        {!editMode ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${combo.is_available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {combo.is_available ? 'Available' : 'Unavailable'}
          </span>
        ) : confirmingDelete ? (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-red-600 font-medium flex-1">Delete combo?</span>
            <button onClick={onConfirmDelete} className="text-xs text-red-500 hover:text-red-600 font-semibold">Yes</button>
            <button onClick={onCancelDelete} className="text-xs text-gray-400 hover:text-gray-600">No</button>
          </div>
        ) : (
          <>
            <button
              onClick={onToggle}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${combo.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${combo.is_available ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs text-gray-500 flex-1">{combo.is_available ? 'On' : 'Off'}</span>
            <button onClick={onEdit} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Edit</button>
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-500 font-medium">Delete</button>
          </>
        )}
      </div>
    </div>
  );
}
