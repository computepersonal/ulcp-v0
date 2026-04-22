import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Minus, Plus, ShoppingCart, X, Loader2 } from 'lucide-react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CatalogueSection {
  id: string;
  name: string;
  position: number;
}

interface CatalogueItem {
  id: string;
  name: string;
  description?: string;
  price: number;        // paise
  mrp?: number;
  section_id?: string | null;
  is_available: boolean;
  is_food?: boolean;
  veg_type?: 'veg' | 'vegan' | 'non_veg' | 'egg';
  item_type?: string;
  station?: string;     // "kitchen" | "bar"
  gst_rate?: number;
  is_tax_inclusive?: boolean;
  images?: Array<{ url: string; isPrimary?: boolean }>;
}

interface CartItem extends CatalogueItem {
  quantity: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(paise: number): string {
  return `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
}

const VEG_DOT: Record<string, string> = {
  veg: 'border-green-600 bg-green-600',
  vegan: 'border-green-600 bg-green-600',
  non_veg: 'border-red-600 bg-red-600',
  egg: 'border-amber-500 bg-amber-500',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useAppSelector((s) => s.auth);
  const tenantId = auth.user?.tenant_id ?? '';

  // Table context from FloorMap navigation
  const paramTableId = searchParams.get('table_id') ?? undefined;
  const paramTableName = searchParams.get('table_name') ?? undefined;
  const paramSessionId = searchParams.get('session_id') ?? undefined;
  const orderType = (searchParams.get('type') ?? 'dine_in') as 'dine_in' | 'takeaway';

  // Service URLs
  const catalogueUrl = import.meta.env.VITE_CATALOGUE_SERVICE_URL ?? 'http://localhost:3003';
  const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const orderUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';

  // Data state
  const [sections, setSections] = useState<CatalogueSection[]>([]);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [branchId, setBranchId] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Table selection (when no table_id in URL)
  interface TableOption {
    id: string;
    name: string;
    status: string;
    session_id?: string;
  }
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | undefined>(paramTableId);
  const [selectedTableName, setSelectedTableName] = useState<string | undefined>(paramTableName);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(paramSessionId);

  // Derived table values — prefer URL params, fall back to manual selection
  const tableId = paramTableId ?? selectedTableId;
  const tableName = paramTableName ?? selectedTableName;
  const sessionId = paramSessionId ?? selectedSessionId;

  // UI state
  const [activeSection, setActiveSection] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [type, setType] = useState<'dine_in' | 'takeaway'>(orderType);

  // ── Load tenant config + catalogue ─────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    const headers = { Authorization: `Bearer ${auth.token}` };

    try {
      // 1. Fetch tenant info (business_type) + branches in parallel
      const [tenantRes, branchRes] = await Promise.all([
        apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}`, { headers }),
        apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/branches`, { headers }),
      ]);

      const tenantData = tenantRes.ok
        ? (await tenantRes.json()) as { success: boolean; data?: { tenant?: { business_type?: string } } }
        : { success: false };
      const branchData = branchRes.ok
        ? (await branchRes.json()) as { success: boolean; data?: { branches?: Array<{ id: string; is_primary?: boolean }> } }
        : { success: false };

      const bType = (tenantData as { data?: { tenant?: { business_type?: string } } }).data?.tenant?.business_type ?? '';
      setBusinessType(bType);

      const branches = (branchData as { data?: { branches?: Array<{ id: string; is_primary?: boolean }> } }).data?.branches ?? [];
      const primary = branches.find((b) => b.is_primary) ?? branches[0];
      if (!primary) {
        setError('No branch found. Complete setup first.');
        setLoading(false);
        return;
      }
      setBranchId(primary.id);

      // 2. Fetch catalogue
      const [secRes, itemRes] = await Promise.all([
        apiFetch(`${catalogueUrl}/api/v1/catalogue/${tenantId}/sections`, { headers }),
        apiFetch(`${catalogueUrl}/api/v1/catalogue/${tenantId}/items`, { headers }),
      ]);

      const secData = secRes.ok
        ? (await secRes.json()) as { success: boolean; data?: { sections: CatalogueSection[] } }
        : { success: false as const };
      const itemData = itemRes.ok
        ? (await itemRes.json()) as { success: boolean; data?: { items: CatalogueItem[] } }
        : { success: false as const };

      if (secData.success) {
        setSections(
          ((secData as { data?: { sections: CatalogueSection[] } }).data?.sections ?? [])
            .sort((a, b) => a.position - b.position)
        );
      }
      if (itemData.success) {
        setItems(
          ((itemData as { data?: { items: CatalogueItem[] } }).data?.items ?? [])
            .filter((i) => i.is_available)
        );
      }

      // 3. If no table from URL, fetch tables + sessions for the picker
      if (!paramTableId) {
        const [tableRes, sessionRes] = await Promise.all([
          apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/branches/${primary.id}/tables`, { headers }),
          apiFetch(`${tenantUrl}/api/v1/tenants/${tenantId}/branches/${primary.id}/sessions?status=open,pending_confirmation`, { headers }),
        ]);

        // Build session lookup: table_id → session_id
        const sessionMap: Record<string, string> = {};
        if (sessionRes.ok) {
          const sessData = (await sessionRes.json()) as {
            success: boolean;
            data?: { sessions: Array<{ id: string; table_id: string; status: string }> };
          };
          for (const s of sessData.data?.sessions ?? []) {
            sessionMap[s.table_id] = s.id;
          }
        }

        if (tableRes.ok) {
          const tableData = (await tableRes.json()) as {
            success: boolean;
            data?: { tables: Array<{ id: string; name: string; status: string }> };
          };
          if (tableData.success) {
            setTables(
              (tableData.data?.tables ?? []).map((t) => ({
                ...t,
                session_id: sessionMap[t.id],
              }))
            );
          }
        }
      }
    } catch {
      setError('Failed to load catalogue');
    } finally {
      setLoading(false);
    }
  }, [tenantId, auth.token, catalogueUrl, tenantUrl, paramTableId]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Cart operations ────────────────────────────────────────────────────────

  const addToCart = (item: CatalogueItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => c.id === itemId ? { ...c, quantity: c.quantity + delta } : c)
        .filter((c) => c.quantity > 0)
    );
  };

  const getCartQty = (itemId: string): number => {
    return cart.find((c) => c.id === itemId)?.quantity ?? 0;
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // ── Submit order ───────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (cart.length === 0 || !branchId || !businessType) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const body = {
        branch_id: branchId,
        table_id: tableId,
        table_name: tableName,
        session_id: sessionId,
        type,
        business_type: businessType,
        items: cart.map((c) => ({
          id: c.id,
          name: c.name,
          price: c.price,
          quantity: c.quantity,
          veg_type: c.veg_type,
          gst_rate: c.gst_rate,
          is_tax_inclusive: c.is_tax_inclusive,
          station: c.station,
        })),
        notes: notes.trim() || undefined,
      };

      const res = await apiFetch(`${orderUrl}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to place order');
      }

      // Navigate back to orders page on success
      navigate('/orders');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filter items ───────────────────────────────────────────────────────────

  const filteredItems = items.filter((item) => {
    if (activeSection !== 'all' && item.section_id !== activeSection) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="text-red-500 text-sm mb-4">{error}</div>
        <button onClick={() => navigate(-1)} className="text-brand-600 text-sm font-medium hover:underline">Go back</button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ── Left: Catalogue browser ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">New Order</h1>
              {tableName && (
                <span className="text-xs text-brand-600 font-medium">{tableName}</span>
              )}
            </div>

            <div className="ml-auto flex items-center gap-3">
              {/* Table selector — when no table was pre-selected */}
              {!paramTableId && type === 'dine_in' && tables.length > 0 && (
                <select
                  value={selectedTableId ?? ''}
                  onChange={(e) => {
                    const t = tables.find((t) => t.id === e.target.value);
                    if (t) {
                      setSelectedTableId(t.id);
                      setSelectedTableName(t.name);
                      setSelectedSessionId(t.session_id);
                    } else {
                      setSelectedTableId(undefined);
                      setSelectedTableName(undefined);
                      setSelectedSessionId(undefined);
                    }
                  }}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-400 bg-white"
                >
                  <option value="">Select table...</option>
                  {tables
                    .filter((t) => t.status === 'occupied' || t.status === 'available')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.status === 'occupied' ? 'occupied' : 'free'})
                      </option>
                    ))}
                </select>
              )}

              {/* Order type toggle */}
              {!paramTableId && (
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setType('dine_in')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      type === 'dine_in' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    Dine-in
                  </button>
                  <button
                    onClick={() => {
                      setType('takeaway');
                      setSelectedTableId(undefined);
                      setSelectedTableName(undefined);
                      setSelectedSessionId(undefined);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      type === 'takeaway' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    Takeaway
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Section tabs */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveSection('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeSection === 'all'
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {sections.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeSection === sec.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {sec.name}
              </button>
            ))}
          </div>
        </div>

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-16">
              {searchQuery ? 'No items match your search' : 'No items available'}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((item) => {
                const qty = getCartQty(item.id);
                const dotClass = item.veg_type ? VEG_DOT[item.veg_type] : '';

                return (
                  <div
                    key={item.id}
                    className={`bg-white border rounded-xl p-3 transition-all ${
                      qty > 0 ? 'border-brand-300 ring-1 ring-brand-100' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Veg dot */}
                    {dotClass && (
                      <div className={`w-3.5 h-3.5 border-2 rounded-sm mb-1.5 ${dotClass.split(' ')[0]}`}>
                        <div className={`w-1.5 h-1.5 rounded-full m-auto mt-[2px] ${dotClass.split(' ')[1]}`} />
                      </div>
                    )}

                    <div className="font-medium text-gray-900 text-sm leading-tight">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description}</div>
                    )}

                    <div className="flex items-center justify-between mt-2">
                      <span className="font-semibold text-gray-900 text-sm font-mono">{fmt(item.price)}</span>

                      {qty === 0 ? (
                        <button
                          onClick={() => addToCart(item)}
                          className="px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ADD
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-6 h-6 flex items-center justify-center bg-brand-100 text-brand-600 rounded-md hover:bg-brand-200 transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-5 text-center text-sm font-bold text-brand-700">{qty}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-6 h-6 flex items-center justify-center bg-brand-500 text-white rounded-md hover:bg-brand-600 transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating cart pill — visible on small screens or when cart panel is hidden */}
        {cartCount > 0 && !showCart && (
          <button
            onClick={() => setShowCart(true)}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 lg:hidden flex items-center gap-3 bg-brand-500 hover:bg-brand-600 text-white pl-4 pr-5 py-3 rounded-2xl shadow-lg transition-colors z-30"
          >
            <ShoppingCart size={18} />
            <span className="font-semibold text-sm">{cartCount} items</span>
            <span className="text-sm">|</span>
            <span className="font-bold text-sm font-mono">{fmt(cartTotal)}</span>
          </button>
        )}
      </div>

      {/* ── Right: Cart panel (always visible on lg+, toggleable on mobile) ── */}
      <div
        className={`${
          showCart ? 'fixed inset-0 z-40 lg:relative lg:inset-auto' : 'hidden lg:block'
        } w-full lg:w-80 shrink-0`}
      >
        {/* Mobile overlay */}
        {showCart && (
          <div
            className="absolute inset-0 bg-black/40 lg:hidden"
            onClick={() => setShowCart(false)}
          />
        )}

        <div className="relative h-full bg-white border-l border-gray-200 flex flex-col z-10 ml-auto w-80 lg:w-full">
          {/* Cart header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <h2 className="font-bold text-gray-900">Order Cart</h2>
              <div className="text-xs text-gray-500 mt-0.5">
                {type === 'dine_in' && tableName ? tableName : type === 'takeaway' ? 'Takeaway' : 'Dine-in'}
              </div>
            </div>
            <button
              onClick={() => setShowCart(false)}
              className="lg:hidden text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-12">
                Add items from the menu to start an order
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{fmt(item.price)}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-6 h-6 flex items-center justify-center border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-6 h-6 flex items-center justify-center border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 font-mono w-16 text-right">
                      {fmt(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes + total + submit */}
          {cart.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-4 shrink-0 space-y-3">
              {/* Notes */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Kitchen notes (optional)"
                rows={2}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-400 resize-none transition-colors"
              />

              {/* Bill summary */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Items ({cartCount})</span>
                  <span className="font-mono">{fmt(cartTotal)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span className="font-mono">{fmt(cartTotal)}</span>
                </div>
              </div>

              {submitError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {submitError}
                </div>
              )}

              <button
                onClick={() => { void handleSubmit(); }}
                disabled={submitting || cart.length === 0}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Placing Order...
                  </>
                ) : (
                  `Place Order · ${fmt(cartTotal)}`
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
