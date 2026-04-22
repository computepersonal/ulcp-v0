import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../hooks/redux';
import SetupReturnBanner from '../components/SetupReturnBanner';
import { apiFetch } from '../lib/apiFetch';

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
  images?: Array<{ url: string; isPrimary?: boolean }>;
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
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [desc, setDesc] = useState('');
  const [sectionId, setSectionId] = useState(defaultSectionId ?? '');
  const [isFood, setIsFood] = useState(true);
  const [vegType, setVegType] = useState<'veg' | 'non_veg' | 'egg' | 'vegan'>('veg');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      await onSave({
        name: name.trim(),
        price,
        description: desc.trim() || undefined,
        section_id: sectionId || undefined,
        is_food: isFood,
        veg_type: isFood ? vegType : undefined,
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

// ─── Edit Item Modal ──────────────────────────────────────────────────────────

function EditItemModal({
  item,
  onClose,
  onSave,
}: {
  item: CatalogueItem;
  onClose: () => void;
  onSave: (data: { name: string; price: number; mrp?: number; description?: string; is_food?: boolean; veg_type?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [priceStr, setPriceStr] = useState(String(item.price / 100));
  const [mrpStr, setMrpStr] = useState(item.mrp ? String(item.mrp / 100) : '');
  const [desc, setDesc] = useState(item.description ?? '');
  const [isFood, setIsFood] = useState(item.is_food !== false);
  const [vegType, setVegType] = useState<'veg' | 'non_veg' | 'egg' | 'vegan'>(
    (item.veg_type as 'veg' | 'non_veg' | 'egg' | 'vegan') ?? 'veg'
  );
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
        is_food: isFood,
        veg_type: isFood ? vegType : undefined,
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
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

  const [editMode, setEditMode] = useState(false);
  const [sections, setSections] = useState<CatalogueSection[]>([]);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddSection, setShowAddSection] = useState(false);
  const [addItemForSection, setAddItemForSection] = useState<string | undefined>(undefined);
  const [showAddItemGlobal, setShowAddItemGlobal] = useState(false);

  // Delete confirmations
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);

  // Edit item — store ID only so the modal always reads the latest price from `items` state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const editingItem = editingItemId ? (items.find((i) => i.id === editingItemId) ?? null) : null;

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
        const [secRes, itemRes] = await Promise.all([
          apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/sections`, { headers: header }),
          apiFetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantId}/items`, { headers: header }),
        ]);
        const [secData, itemData] = await Promise.all([
          secRes.ok ? secRes.json() as Promise<{ success: boolean; data?: { sections: CatalogueSection[] } }> : Promise.resolve({ success: false }),
          itemRes.ok ? itemRes.json() as Promise<{ success: boolean; data?: { items: CatalogueItem[] } }> : Promise.resolve({ success: false }),
        ]);
        if (cancelled) return;
        if (secData.success) setSections((secData as { success: boolean; data?: { sections: CatalogueSection[] } }).data?.sections ?? []);
        if (itemData.success) setItems((itemData as { success: boolean; data?: { items: CatalogueItem[] } }).data?.items ?? []);
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
    section_id?: string; is_food?: boolean; veg_type?: string;
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
    data: { name: string; price: number; mrp?: number; description?: string; is_food?: boolean; veg_type?: string }
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

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
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
          onClose={() => setEditingItemId(null)}
          onSave={(data) => handleEditItem(editingItem.id, data)}
        />
      )}

      <div className="p-6 max-w-5xl">
        {/* Header — only show title row; Edit toggle hidden when catalogue is empty */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Catalogue</h1>
            {(sections.length > 0 || items.length > 0) && (
              <p className="text-xs text-gray-400 mt-0.5">{items.length} items · {sections.length} sections</p>
            )}
          </div>
          {/* Edit controls — only when catalogue has content */}
          {canEdit && (sections.length > 0 || items.length > 0) && (
            <div className="flex items-center gap-2">
              {editMode && (
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

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>
        )}

        {/* Empty state */}
        {sections.length === 0 && items.length === 0 && (
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

        {/* Sections */}
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
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const primaryImage = item.images?.find((img) => img.isPrimary) ?? item.images?.[0];

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${!item.is_available ? 'opacity-55' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {item.is_food && <VegDot type={item.veg_type} />}
            <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
          </div>
          {item.description && (
            <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{item.description}</p>
          )}
          <div className="text-brand-600 font-semibold text-sm mt-1.5 font-mono">
            ₹{(item.price / 100).toFixed(0)}
            {item.mrp > 0 && item.mrp > item.price && (
              <span className="ml-1.5 line-through text-gray-400 font-normal text-xs">₹{(item.mrp / 100).toFixed(0)}</span>
            )}
          </div>
        </div>
        {primaryImage ? (
          <img src={primaryImage.url} alt={item.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xl shrink-0">
            {item.is_food ? '🍽' : '📦'}
          </div>
        )}
      </div>

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
