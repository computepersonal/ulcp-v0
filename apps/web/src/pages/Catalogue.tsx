import { useState, useEffect } from 'react';
import { useAppSelector } from '../hooks/redux';

interface CatalogueItem {
  id: string;
  name: string;
  price: number;
  section_id: string;
  is_available: boolean;
  images?: Array<{ url: string }>;
}

interface CatalogueSection {
  id: string;
  name: string;
}

const DEMO_SECTIONS: CatalogueSection[] = [
  { id: 's1', name: 'Starters' },
  { id: 's2', name: 'Main Course' },
  { id: 's3', name: 'Beverages' }
];

const DEMO_ITEMS: CatalogueItem[] = [
  { id: 'i1', name: 'Paneer Tikka', price: 28000, section_id: 's1', is_available: true },
  { id: 'i2', name: 'Veg Spring Rolls', price: 18000, section_id: 's1', is_available: true },
  { id: 'i3', name: 'Dal Makhani', price: 24000, section_id: 's2', is_available: true },
  { id: 'i4', name: 'Butter Chicken', price: 32000, section_id: 's2', is_available: false },
  { id: 'i5', name: 'Mango Lassi', price: 12000, section_id: 's3', is_available: true }
];

export default function Catalogue() {
  const auth = useAppSelector((s) => s.auth);
  const [editMode, setEditMode] = useState(false);
  const [sections, setSections] = useState<CatalogueSection[]>(DEMO_SECTIONS);
  const [items, setItems] = useState<CatalogueItem[]>(DEMO_ITEMS);

  const catalogueServiceUrl = import.meta.env.VITE_CATALOGUE_SERVICE_URL ?? 'http://localhost:3003';

  const canEdit =
    auth.user?.role === 'tenant_owner' ||
    auth.user?.role === 'head_chef' ||
    auth.user?.role === 'branch_manager';

  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const load = async () => {
      try {
        // Branchless endpoint — catalogue-service auto-resolves the primary branch
        const res = await fetch(
          `${catalogueServiceUrl}/api/v1/catalogue/${auth.user!.tenant_id}/public`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          success: boolean;
          data?: { sections: CatalogueSection[]; items: CatalogueItem[] };
        };
        if (data.success && data.data) {
          if (data.data.sections.length > 0) setSections(data.data.sections);
          if (data.data.items.length > 0) setItems(data.data.items);
        }
      } catch {
        // Use demo data
      }
    };
    void load();
  }, [auth, catalogueServiceUrl]);

  const toggleAvailability = (itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, is_available: !i.is_available } : i))
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Catalogue</h1>
        {canEdit && (
          <div className="flex items-center gap-3">
            {editMode && (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-xs font-medium text-orange-700">Live editing</span>
                <span className="text-xs text-orange-500">Changes visible immediately</span>
              </div>
            )}
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                editMode
                  ? 'bg-orange-50 border-orange-300 text-orange-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'
              }`}
            >
              {editMode ? '👁 View Mode' : '✏️ Edit Mode'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {sections.map((section) => {
          const sectionItems = items.filter((i) => i.section_id === section.id);
          return (
            <div key={section.id}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
                  {section.name} ({sectionItems.length})
                </h3>
                {editMode && (
                  <div className="flex gap-2">
                    <button className="text-xs text-brand-500 hover:text-brand-600 font-medium">Rename</button>
                    <button className="text-xs text-gray-400 hover:text-gray-600">Toggle</button>
                    <button className="text-xs text-red-400 hover:text-red-500">Delete</button>
                  </div>
                )}
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {sectionItems.map((item) => (
                  <div
                    key={item.id}
                    className={`bg-white border rounded-xl p-4 shadow-sm transition-opacity ${
                      !item.is_available ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 text-sm">{item.name}</div>
                        <div className="text-brand-600 font-semibold text-sm mt-1 font-mono">
                          ₹{(item.price / 100).toFixed(0)}
                        </div>
                      </div>
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xl shrink-0">🍽</div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      {!editMode ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.is_available
                              ? 'bg-green-50 text-green-700'
                              : 'bg-red-50 text-red-600'
                          }`}
                        >
                          {item.is_available ? 'Available' : 'Unavailable'}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleAvailability(item.id)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${item.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.is_available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </button>
                          <span className="text-xs text-gray-500 flex-1">
                            {item.is_available ? 'On' : 'Off'}
                          </span>
                          <button className="text-xs text-red-400 hover:text-red-500 font-medium">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {editMode && (
                  <button className="border-2 border-dashed border-brand-200 rounded-xl p-4 text-brand-400 hover:bg-brand-50 hover:border-brand-400 transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                    + Add Item
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
