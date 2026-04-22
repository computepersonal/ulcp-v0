import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { addItem, updateQuantity } from '../store/cartSlice';
import { setAuth } from '../store/authSlice';
import FloatingCart from '../components/FloatingCart';
import BottomNav from '../components/BottomNav';
import ProfileDrawer from '../components/ProfileDrawer';
import AliasSelect from '../components/social/AliasSelect';
import SocialRoom from '../components/social/SocialRoom';
import { useSocial } from '../context/SocialContext';

const DINE_IN_TYPES = [
  'seated_food_only', 'seated_full_service', 'seated_self_order',
  'self_service_cafe', 'restaurant_plus_delivery',
];

interface CatalogueItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  mrp?: number;
  images?: Array<{ url: string; isPrimary: boolean }>;
  veg_type?: 'veg' | 'vegan' | 'non_veg' | 'egg';
  is_available: boolean;
  section_id: string;
}

interface Section {
  id: string;
  name: string;
  position: number;
}

interface TenantInfo {
  tenant_id: string;
  branch_id: string;
  name: string;
  logo_url?: string;
  cover_url?: string;
  business_type?: string;
}

// ─── OTP Login Sheet ─────────────────────────────────────────────────────────

interface LoginResult { token: string; customerId: string; name: string; phone: string; }

function LoginSheet({ onSuccess, onClose }: { onSuccess: (auth: LoginResult) => void; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const sendOtp = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/customer/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${phone}` })
      });
      if (res.ok) { setStep('otp'); setCountdown(45); }
      else setError('Failed to send OTP. Try again.');
    } catch { setError('Connection error. Try again.'); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    const otp = digits.join('');
    if (otp.length !== 6) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/customer/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${phone}`, otp, name: name.trim() })
      });
      const data = (await res.json()) as {
        success: boolean;
        data?: { token: string; customerId: string; name: string };
        error?: string;
      };
      if (res.ok && data.success && data.data) {
        const resolvedName = data.data.name || name.trim();
        const authResult = { token: data.data.token, customerId: data.data.customerId, name: resolvedName, phone };
        dispatch(setAuth(authResult));
        onSuccess(authResult);
      } else {
        setError(data.error ?? 'Invalid OTP. Try again.');
      }
    } catch { setError('Verification failed. Try again.'); }
    finally { setLoading(false); }
  };

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[index] = digit; setDigits(next);
    if (digit && index < 5) (document.getElementById(`otp-${index + 1}`) as HTMLInputElement)?.focus();
  };
  const handleDigitKey = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0)
      (document.getElementById(`otp-${index - 1}`) as HTMLInputElement)?.focus();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-2xl p-6 w-full" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'details' ? 'Login to place order' : 'Enter OTP'}
          </h2>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <p className="text-gray-500 text-sm mb-5">
          {step === 'details'
            ? 'Enter your name and phone number'
            : `Code sent to +91 ${phone}`}
        </p>

        {step === 'details' ? (
          <>
            <input
              type="text" value={name} autoFocus
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 mb-3"
            />
            <div className="flex gap-2 mb-4">
              <div className="bg-gray-100 rounded-xl px-3 py-3 text-gray-600 font-medium text-sm">+91</div>
              <input
                type="tel" value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500"
              />
            </div>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={() => { void sendOtp(); }}
              disabled={phone.length !== 10 || name.trim().length < 2 || loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </>
        ) : (
          <>
            <div className="flex gap-2 mb-4 justify-center">
              {digits.map((d, i) => (
                <input key={i} id={`otp-${i}`} type="text" inputMode="numeric"
                  maxLength={2} value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleDigitKey(i, e)}
                  className="w-11 h-12 text-center text-xl font-bold border-2 border-gray-200 focus:border-brand-500 rounded-xl outline-none"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
            <button
              onClick={() => { void verifyOtp(); }}
              disabled={digits.join('').length !== 6 || loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl mb-3"
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <div className="text-center text-sm text-gray-500">
              {countdown > 0 ? `Resend in ${countdown}s` : (
                <button onClick={() => { void sendOtp(); }} className="text-brand-500 font-medium">Resend OTP</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Catalogue ───────────────────────────────────────────────────────────

export default function Catalogue() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('table'); // ?table=TABLE_ID from QR code
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const cart = useAppSelector(s => s.cart);
  const auth = useAppSelector(s => s.auth);
  const { joinRoom, leaveRoom, state: socialState } = useSocial();

  const isLoggedIn = !!auth.token;

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notOpen, setNotOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showLogin, setShowLogin] = useState(false);
  const [pendingItem, setPendingItem] = useState<CatalogueItem | null>(null);
  // Profile + Social Room state
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showAliasSelect, setShowAliasSelect] = useState(false);
  const [showSocialRoom, setShowSocialRoom] = useState(false);
  // Session state for dine-in
  const [_sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const isDineIn = !!tableId && DINE_IN_TYPES.includes(tenantInfo?.business_type ?? '');

  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const catalogueServiceUrl = import.meta.env.VITE_CATALOGUE_SERVICE_URL ?? 'http://localhost:3003';

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      try {
        const tenantRes = await fetch(`${tenantServiceUrl}/api/v1/tenants/by-slug/${slug}`);
        if (!tenantRes.ok) { setLoading(false); return; }
        const tenantData = (await tenantRes.json()) as { success: boolean; data?: TenantInfo };
        if (!tenantData.success || !tenantData.data) { setLoading(false); return; }
        setTenantInfo(tenantData.data);

        // Pin this place first in saved_places (it's the current QR scan)
        try {
          type SavedPlace = { tenantId: string; slug: string; name: string; businessType: string; visitCount: number; isPinned: boolean; pinnedAt?: number };
          const existing = JSON.parse(localStorage.getItem('saved_places') ?? '[]') as SavedPlace[];
          const idx = existing.findIndex(p => p.tenantId === tenantData.data!.tenant_id);
          if (idx >= 0) {
            existing[idx].visitCount = (existing[idx].visitCount ?? 0) + 1;
            existing[idx].isPinned = true;
            existing[idx].pinnedAt = Date.now();
          } else {
            existing.unshift({
              tenantId: tenantData.data.tenant_id,
              slug,
              name: tenantData.data.name,
              businessType: tenantData.data.business_type ?? 'restaurant',
              visitCount: 1,
              isPinned: true,
              pinnedAt: Date.now(),
            });
          }
          // Keep max 50, pinned always first
          const pinned = existing.filter(p => p.isPinned).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
          const unpinned = existing.filter(p => !p.isPinned);
          localStorage.setItem('saved_places', JSON.stringify([...pinned, ...unpinned].slice(0, 50)));
        } catch { /* ignore */ }

        const catRes = await fetch(`${catalogueServiceUrl}/api/v1/catalogue/${tenantData.data.tenant_id}/public`);
        if (catRes.status === 403) {
          setNotOpen(true);
        } else if (catRes.ok) {
          const catData = (await catRes.json()) as { success: boolean; data?: { sections: Section[]; items: CatalogueItem[] } };
          if (catData.success && catData.data) {
            setSections(catData.data.sections);
            setItems(catData.data.items);
          }
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    void load();
  }, [slug, tenantServiceUrl, catalogueServiceUrl]);

  const filteredItems = items.filter(item => {
    if (!item.is_available) return false;
    if (vegOnly && item.veg_type !== 'veg' && item.veg_type !== 'vegan') return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const cartCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const doAddItem = (item: CatalogueItem) => {
    if (!tenantInfo || !slug) return;
    const existing = cart.items.find(i => i.item_id === item.id);
    if (existing) {
      dispatch(updateQuantity({ id: existing.id, quantity: existing.quantity + 1 }));
    } else {
      dispatch(addItem({ id: item.id, item_id: item.id, name: item.name, price: item.price, quantity: 1, tenant_id: tenantInfo.tenant_id, branch_id: tenantInfo.branch_id, business_type: tenantInfo.business_type ?? 'seated_food_only', slug }));
    }
  };

  const handleAddItem = (item: CatalogueItem) => {
    if (!isLoggedIn) {
      setPendingItem(item);
      setShowLogin(true);
      return;
    }
    doAddItem(item);
  };

  const handleRemoveItem = (item: CatalogueItem) => {
    const existing = cart.items.find(i => i.item_id === item.id);
    if (!existing) return;
    dispatch(updateQuantity({ id: existing.id, quantity: existing.quantity - 1 }));
  };

  const createSession = async (customerAuth: { token: string; customerId: string; name: string; phone: string }) => {
    if (!tenantInfo || !tableId) return;
    try {
      const res = await fetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantInfo.tenant_id}/branches/${tenantInfo.branch_id}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAuth.token}` },
          body: JSON.stringify({
            table_id: tableId,
            customer_id: customerAuth.customerId,
            customer_phone: customerAuth.phone,
            customer_name: customerAuth.name,
            pax: 1,
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean;
          data?: { session: { id: string; status: string }; needs_confirmation: boolean };
        };
        if (data.success && data.data) {
          setSessionId(data.data.session.id);
          setSessionStatus(data.data.session.status);
        }
      }
    } catch { /* non-blocking */ }
  };

  const handleLoginSuccess = (customerAuth: { token: string; customerId: string; name: string; phone: string }) => {
    setShowLogin(false);
    // Create table session for dine-in after login
    if (isDineIn) void createSession(customerAuth);
    if (pendingItem) { doAddItem(pendingItem); setPendingItem(null); }
  };

  const handleOpenSocial = () => {
    if (!tenantInfo) return;
    // Require login before entering social room
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }
    // Already in the room — just show the panel (no rejoin)
    if (socialState.alias) {
      setShowSocialRoom(true);
      return;
    }
    const savedAlias = localStorage.getItem(`social:alias:${tenantInfo.tenant_id}`);
    const savedMode = localStorage.getItem(`social:mode:${tenantInfo.tenant_id}`) as 'public' | 'private' | null;
    const savedIntentRaw = localStorage.getItem(`social:intent:${tenantInfo.tenant_id}`);
    const savedIntent = (savedIntentRaw === 'socialize' || savedIntentRaw === 'date') ? savedIntentRaw : null;
    if (savedAlias) {
      joinRoom(tenantInfo.tenant_id, tenantInfo.branch_id, savedAlias, savedMode ?? 'public', savedIntent);
      setShowSocialRoom(true);
    } else {
      setShowAliasSelect(true);
    }
  };

  const handleAliasEnter = (alias: string, mode: 'public' | 'private', intent: 'socialize' | 'date' | null) => {
    if (!tenantInfo) return;
    localStorage.setItem(`social:alias:${tenantInfo.tenant_id}`, alias);
    localStorage.setItem(`social:mode:${tenantInfo.tenant_id}`, mode);
    localStorage.setItem(`social:intent:${tenantInfo.tenant_id}`, intent ?? 'none');
    joinRoom(tenantInfo.tenant_id, tenantInfo.branch_id, alias, mode, intent);
    setShowAliasSelect(false);
    setShowSocialRoom(true);
  };

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full mx-auto mb-3" />
          <div className="text-gray-500">Loading menu...</div>
        </div>
      </div>
    );
  }

  if (notOpen) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-5">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {tenantInfo?.name ?? 'This place'} isn't open yet
        </h1>
        <p className="text-gray-500 text-sm max-w-xs">
          The business is still setting up. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 flex-shrink-0">←</button>
          <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center text-brand-500 font-bold overflow-hidden flex-shrink-0">
            {tenantInfo?.logo_url ? <img src={tenantInfo.logo_url} alt="" className="w-full h-full object-cover" /> : tenantInfo?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-base truncate">{tenantInfo?.name ?? slug}</div>
            <span className="text-xs text-green-600 font-medium">● Open</span>
          </div>
          {/* Profile button */}
          <button onClick={() => setShowProfileDrawer(true)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">👤</button>
          {/* Social Room button */}
          <button onClick={handleOpenSocial} className="relative flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-600 text-xs font-semibold px-2.5 py-1.5 rounded-full flex-shrink-0">
            👥
            {socialState.publicCount > 0 && (
              <span className="bg-brand-500 text-white text-xs rounded-full px-1 min-w-[16px] text-center">{socialState.publicCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Search & filters */}
      <div className="bg-white px-4 py-2 border-b border-gray-100">
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search menu..."
          className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none mb-2"
        />
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-brand-500 text-white font-medium">All</button>
          <button
            onClick={() => setVegOnly(v => !v)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${vegOnly ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            🟢 Veg Only
          </button>
          <button className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-white text-gray-600 border border-gray-200 font-medium">Available</button>
          <button className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-white text-gray-600 border border-gray-200 font-medium">On Offer</button>
        </div>
      </div>

      {/* Table / session banner */}
      {isDineIn && isLoggedIn && sessionStatus === 'pending_confirmation' && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="text-2xl animate-pulse">🔔</div>
          <div>
            <div className="text-sm font-semibold text-amber-800">Waiting for staff to confirm your table</div>
            <div className="text-xs text-amber-600 mt-0.5">A waiter will confirm shortly. You can browse the menu.</div>
          </div>
        </div>
      )}
      {isDineIn && isLoggedIn && sessionStatus === 'open' && (
        <div className="mx-4 mt-3 bg-green-50 border border-green-300 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="text-2xl">✅</div>
          <div>
            <div className="text-sm font-semibold text-green-800">Table confirmed — ready to order!</div>
            <div className="text-xs text-green-600 mt-0.5">Add items to your cart and place your order.</div>
          </div>
        </div>
      )}
      {tableId && !isLoggedIn && (
        <div className="mx-4 mt-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-brand-800">Dine-in order — login to begin</div>
            <div className="text-xs text-brand-600 mt-0.5">Login with your phone number to confirm your table</div>
          </div>
          <button onClick={() => setShowLogin(true)} className="text-xs bg-brand-500 text-white font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap">Login</button>
        </div>
      )}
      {/* Guest banner — no table QR */}
      {!isLoggedIn && !tableId && (
        <div className="mx-4 mt-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-brand-800">Browse freely, login to order</div>
            <div className="text-xs text-brand-600 mt-0.5">You'll be asked to login when you add an item</div>
          </div>
          <button onClick={() => setShowLogin(true)} className="text-xs bg-brand-500 text-white font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap">Login</button>
        </div>
      )}

      {/* Sections + Items */}
      <div className="px-4 py-4">
        {sections.length === 0 && filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">🍽</div>
            <div className="font-medium">No items available</div>
          </div>
        ) : sections.length > 0 ? (
          sections.map(section => {
            const sectionItems = filteredItems.filter(i => i.section_id === section.id);
            if (sectionItems.length === 0) return null;
            const collapsed = collapsedSections.has(section.id);
            return (
              <div key={section.id} className="mb-6">
                <button onClick={() => toggleSection(section.id)} className="w-full flex items-center justify-between py-2 text-left">
                  <h3 className="font-semibold text-gray-900">{section.name} ({sectionItems.length})</h3>
                  <span className="text-gray-400">{collapsed ? '▶' : '▼'}</span>
                </button>
                {!collapsed && (
                  <div className="space-y-3 mt-1">
                    {sectionItems.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        cartQty={isLoggedIn ? (cart.items.find(i => i.item_id === item.id)?.quantity ?? 0) : 0}
                        onAdd={() => handleAddItem(item)}
                        onRemove={() => handleRemoveItem(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                cartQty={isLoggedIn ? (cart.items.find(i => i.item_id === item.id)?.quantity ?? 0) : 0}
                onAdd={() => handleAddItem(item)}
                onRemove={() => handleRemoveItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      {isLoggedIn && <FloatingCart count={cartCount} total={cartTotal} slug={slug ?? ''} />}
      <BottomNav homeLink="/" menuLink={`/place/${slug}`} showMenu={true} />

      {/* Login bottom sheet */}
      {showLogin && (
        <LoginSheet
          onSuccess={handleLoginSuccess}
          onClose={() => { setShowLogin(false); setPendingItem(null); }}
        />
      )}

      {/* Profile Drawer */}
      <ProfileDrawer
        isOpen={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
        onLoginRequest={() => { setShowProfileDrawer(false); setShowLogin(true); }}
      />

      {/* Alias Select */}
      {showAliasSelect && tenantInfo && (
        <AliasSelect
          placeName={tenantInfo.name}
          savedAlias={localStorage.getItem(`social:alias:${tenantInfo.tenant_id}`) ?? undefined}
          savedMode={(localStorage.getItem(`social:mode:${tenantInfo.tenant_id}`) as 'public' | 'private') ?? undefined}
          savedIntent={(() => { const v = localStorage.getItem(`social:intent:${tenantInfo.tenant_id}`); return (v === 'socialize' || v === 'date') ? v : null; })()}
          onEnter={handleAliasEnter}
          onClose={() => setShowAliasSelect(false)}
        />
      )}

      {/* Social Room */}
      {showSocialRoom && tenantInfo && (
        <SocialRoom
          tenantId={tenantInfo.tenant_id}
          branchId={tenantInfo.branch_id}
          placeName={tenantInfo.name}
          onClose={() => setShowSocialRoom(false)}
          onLeaveRoom={() => {
            leaveRoom(tenantInfo.tenant_id, tenantInfo.branch_id);
            localStorage.removeItem(`social:alias:${tenantInfo.tenant_id}`);
            localStorage.removeItem(`social:mode:${tenantInfo.tenant_id}`);
            localStorage.removeItem(`social:intent:${tenantInfo.tenant_id}`);
            setShowSocialRoom(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item, cartQty, onAdd, onRemove }: {
  item: CatalogueItem;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const primaryImage = item.images?.find(i => i.isPrimary)?.url ?? item.images?.[0]?.url;
  const vegColor = item.veg_type === 'veg' || item.veg_type === 'vegan' ? 'border-green-500' : item.veg_type === 'non_veg' ? 'border-red-500' : 'border-yellow-500';

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex gap-3 shadow-sm">
      <div className="flex-1">
        {item.veg_type && (
          <div className={`inline-block w-4 h-4 border-2 ${vegColor} rounded-sm mb-1 relative`}>
            <div className={`absolute inset-0.5 rounded-full ${item.veg_type === 'non_veg' ? 'bg-red-500' : 'bg-green-500'}`} />
          </div>
        )}
        <div className="font-medium text-gray-900 text-sm">{item.name}</div>
        {item.description && <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</div>}
        <div className="text-brand-600 font-semibold text-sm mt-1 font-mono">
          ₹{(item.price / 100).toFixed(0)}
          {item.mrp > 0 && item.mrp > item.price && (
            <span className="text-gray-400 line-through ml-2 font-normal">₹{(item.mrp / 100).toFixed(0)}</span>
          )}
        </div>
      </div>
      <div className="relative shrink-0">
        <div className="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden">
          {primaryImage
            ? <img src={primaryImage} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full flex items-center justify-center text-2xl">🍽</div>
          }
        </div>
        {cartQty === 0 ? (
          <button
            onClick={e => { e.stopPropagation(); onAdd(); }}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow whitespace-nowrap"
          >
            ADD
          </button>
        ) : (
          <div
            onClick={e => e.stopPropagation()}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center bg-brand-500 rounded-full shadow"
          >
            <button onClick={onRemove} className="text-white font-bold text-sm px-2.5 py-1 hover:bg-brand-600 rounded-l-full transition-colors">−</button>
            <span className="text-white text-xs font-bold px-1 min-w-4 text-center">{cartQty}</span>
            <button onClick={onAdd} className="text-white font-bold text-sm px-2.5 py-1 hover:bg-brand-600 rounded-r-full transition-colors">+</button>
          </div>
        )}
      </div>
    </div>
  );
}
