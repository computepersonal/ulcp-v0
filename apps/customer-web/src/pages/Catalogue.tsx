import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { addItem, updateQuantity } from '../store/cartSlice';
import { setAuth } from '../store/authSlice';
import FloatingCart from '../components/FloatingCart';
import FloatingOrderTracker from '../components/FloatingOrderTracker';
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
  prep_time_mins?: number;
  calories?: number;
  rating?: number;
  rating_count?: number;
}

interface Section {
  id: string;
  name: string;
  position: number;
}

interface ComboItemRow {
  id: string;
  item_id: string;
  quantity: number;
  variant_name?: string | null;
  item: {
    id: string;
    name: string;
    price: number;
    veg_type?: 'veg' | 'vegan' | 'non_veg' | 'egg';
  };
}

interface Combo {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  price: number;
  mrp?: number;
  is_available: boolean;
  items: ComboItemRow[];
}

interface TenantInfo {
  tenant_id: string;
  branch_id: string;
  name: string;
  logo_url?: string;
  cover_url?: string;
  business_type?: string;
  dine_in_billing_mode?: 'pay_later' | 'pay_now';
}

// ─── OTP Login Sheet ─────────────────────────────────────────────────────────

interface LoginResult { token: string; customerId: string; name: string; phone: string; }

function LoginSheet({ onSuccess, onClose }: { onSuccess: (auth: LoginResult) => void; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<'phone' | 'otp' | 'name'>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [verifiedData, setVerifiedData] = useState<{ token: string; customerId: string } | null>(null);
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
        body: JSON.stringify({ phone: `+91${phone}`, otp })
      });
      const data = (await res.json()) as {
        success: boolean;
        data?: { token: string; customerId: string; name: string };
        error?: string;
      };
      if (res.ok && data.success && data.data) {
        if (data.data.name) {
          // Existing user — sign in directly
          const authResult = { token: data.data.token, customerId: data.data.customerId, name: data.data.name, phone };
          dispatch(setAuth(authResult));
          onSuccess(authResult);
        } else {
          // New user — collect name
          setVerifiedData({ token: data.data.token, customerId: data.data.customerId });
          setStep('name');
        }
      } else {
        setError(data.error ?? 'Invalid OTP. Try again.');
      }
    } catch { setError('Verification failed. Try again.'); }
    finally { setLoading(false); }
  };

  const completeName = () => {
    if (!verifiedData || name.trim().length < 2) return;
    const authResult = { token: verifiedData.token, customerId: verifiedData.customerId, name: name.trim(), phone };
    dispatch(setAuth(authResult));
    onSuccess(authResult);
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

  const stepTitle = step === 'phone' ? 'Login to place order'
    : step === 'otp' ? 'Enter OTP'
    : 'Welcome!';
  const stepDesc = step === 'phone' ? 'Enter your mobile number'
    : step === 'otp' ? `Code sent to +91 ${phone}`
    : "You're new here. What should we call you?";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-2xl p-6 w-full" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">{stepTitle}</h2>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <p className="text-gray-500 text-sm mb-5">{stepDesc}</p>

        {step === 'phone' ? (
          <>
            <div className="flex gap-2 mb-4">
              <div className="bg-gray-100 rounded-xl px-3 py-3 text-gray-600 font-medium text-sm">+91</div>
              <input
                type="tel" value={phone} autoFocus
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500"
              />
            </div>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={() => { void sendOtp(); }}
              disabled={phone.length !== 10 || loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </>
        ) : step === 'otp' ? (
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
        ) : (
          <>
            <input
              type="text" value={name} autoFocus
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 mb-4"
            />
            <button
              onClick={completeName}
              disabled={name.trim().length < 2}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl"
            >
              Continue
            </button>
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
  const tabParam = searchParams.get('tab'); // ?tab=social → auto-open social room
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const cart = useAppSelector(s => s.cart);
  const auth = useAppSelector(s => s.auth);
  const { joinRoom, leaveRoom, state: socialState } = useSocial();

  const isLoggedIn = !!auth.token;

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notOpen, setNotOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showLogin, setShowLogin] = useState(false);
  const [pendingItem, setPendingItem] = useState<CatalogueItem | null>(null);
  const [fbtItem, setFbtItem] = useState<CatalogueItem | null>(null);
  const [fbtDismissed, setFbtDismissed] = useState<Set<string>>(new Set());
  const [showMenuJump, setShowMenuJump] = useState(false);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  // Profile + Social Room state
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showAliasSelect, setShowAliasSelect] = useState(false);
  const [showSocialRoom, setShowSocialRoom] = useState(false);
  // Session state for dine-in
  const [_sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string | null>(null);
  const isDineIn = !!tableId && DINE_IN_TYPES.includes(tenantInfo?.business_type ?? '');

  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const catalogueServiceUrl = import.meta.env.VITE_CATALOGUE_SERVICE_URL ?? 'http://localhost:3003';

  // Track whether the floating order tracker is showing — so the Menu button can lift above it
  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem('active_orders');
        if (!raw) { setHasActiveOrder(false); return; }
        const list = JSON.parse(raw) as Array<{ status?: string }>;
        const isTerminal = (s?: string) => s === 'served' || s === 'delivered' || s === 'completed' || s === 'cancelled';
        setHasActiveOrder(list.some(o => !isTerminal(o.status)));
      } catch { setHasActiveOrder(false); }
    };
    check();
    window.addEventListener('active_orders:changed', check);
    window.addEventListener('storage', check);
    return () => {
      window.removeEventListener('active_orders:changed', check);
      window.removeEventListener('storage', check);
    };
  }, []);

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
          const catData = (await catRes.json()) as { success: boolean; data?: { sections: Section[]; items: CatalogueItem[]; combos?: Combo[] } };
          if (catData.success && catData.data) {
            setSections(catData.data.sections);
            setItems(catData.data.items);
            setCombos(catData.data.combos ?? []);
          }
        }

        // Fetch table info if dine-in with table param
        if (tableId && tenantData.data.branch_id) {
          try {
            const tableRes = await fetch(`${tenantServiceUrl}/api/v1/tenants/${tenantData.data.tenant_id}/branches/${tenantData.data.branch_id}/tables/public/${tableId}`);
            if (tableRes.ok) {
              const tableData = (await tableRes.json()) as { success: boolean; data?: { id: string; name: string; is_active: boolean; zone_active: boolean; can_order: boolean } };
              if (tableData.success && tableData.data) {
                setTableName(tableData.data.name);
                if (!tableData.data.can_order) {
                  setNotOpen(true);
                }
              }
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    void load();
  }, [slug, tenantServiceUrl, catalogueServiceUrl]);

  // Scroll to section when ?section= param is present (e.g. from in-house ad click)
  const sectionParam = searchParams.get('section');
  useEffect(() => {
    if (!sectionParam || sections.length === 0) return;
    const sectionSlug = sectionParam.toLowerCase().replace(/\s+/g, '-');
    // Try exact match first, then partial match
    const el = document.getElementById(`section-${sectionSlug}`)
      ?? Array.from(document.querySelectorAll('[id^="section-"]')).find(
        e => e.id.includes(sectionSlug)
      );
    if (el) {
      // Ensure section is not collapsed
      const matchedSection = sections.find(s =>
        s.name.toLowerCase().replace(/\s+/g, '-').includes(sectionSlug)
      );
      if (matchedSection && collapsedSections.has(matchedSection.id)) {
        setCollapsedSections(prev => {
          const next = new Set(prev);
          next.delete(matchedSection.id);
          return next;
        });
      }
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [sectionParam, sections, collapsedSections]);

  const filteredItems = items.filter(item => {
    if (!item.is_available) return false;
    if (vegOnly && item.veg_type !== 'veg' && item.veg_type !== 'vegan') return false;
    if (search) {
      const q = search.toLowerCase();
      const section = sections.find(s => s.id === item.section_id);
      const matchesItem = item.name.toLowerCase().includes(q);
      const matchesSection = section?.name.toLowerCase().includes(q);
      if (!matchesItem && !matchesSection) return false;
    }
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
      dispatch(addItem({ id: item.id, item_id: item.id, name: item.name, price: item.price, quantity: 1, tenant_id: tenantInfo.tenant_id, branch_id: tenantInfo.branch_id, business_type: tenantInfo.business_type ?? 'seated_food_only', billing_mode: tenantInfo.dine_in_billing_mode, slug, place_name: tenantInfo.name, ...(tableId ? { table_id: tableId } : {}), ...(tableName ? { table_name: tableName } : {}) }));
    }
  };

  const handleAddItem = (item: CatalogueItem) => {
    if (!isLoggedIn) {
      setPendingItem(item);
      setShowLogin(true);
      return;
    }
    const wasInCart = cart.items.some(i => i.item_id === item.id);
    doAddItem(item);
    // Trigger "Frequently bought together" 1s after the first ADD for this item
    if (!wasInCart && !fbtDismissed.has(item.id)) {
      setTimeout(() => setFbtItem(item), 1000);
    }
  };

  const handleRemoveItem = (item: CatalogueItem) => {
    const existing = cart.items.find(i => i.item_id === item.id);
    if (!existing) return;
    dispatch(updateQuantity({ id: existing.id, quantity: existing.quantity - 1 }));
  };

  const doAddCombo = (combo: Combo) => {
    if (!tenantInfo || !slug) return;
    const existing = cart.items.find(i => i.item_id === combo.id);
    if (existing) {
      dispatch(updateQuantity({ id: existing.id, quantity: existing.quantity + 1 }));
    } else {
      dispatch(addItem({ id: combo.id, item_id: combo.id, name: `🎁 ${combo.name}`, price: combo.price, quantity: 1, tenant_id: tenantInfo.tenant_id, branch_id: tenantInfo.branch_id, business_type: tenantInfo.business_type ?? 'seated_food_only', billing_mode: tenantInfo.dine_in_billing_mode, slug, place_name: tenantInfo.name, ...(tableId ? { table_id: tableId } : {}), ...(tableName ? { table_name: tableName } : {}) }));
    }
  };

  const handleAddCombo = (combo: Combo) => {
    if (!isLoggedIn) {
      // Same gating as items: prompt login first; combos require login to add
      setShowLogin(true);
      return;
    }
    doAddCombo(combo);
  };

  const handleRemoveCombo = (combo: Combo) => {
    const existing = cart.items.find(i => i.item_id === combo.id);
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
    // Join directly only if the user has BOTH an alias and a vibe choice on file.
    // After a permanent leave we wipe mode+intent (not alias) so users get to re-pick their vibe.
    if (savedAlias && savedMode) {
      joinRoom(tenantInfo.tenant_id, tenantInfo.branch_id, savedAlias, savedMode, savedIntent);
      setShowSocialRoom(true);
    } else {
      setShowAliasSelect(true);
    }
  };

  // Auto-open social room when arriving with ?tab=social (from order tracking / checkout)
  useEffect(() => {
    if (tabParam !== 'social' || !tenantInfo || showSocialRoom || showAliasSelect) return;
    handleOpenSocial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam, tenantInfo]);

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

  const jumpToSection = (section: Section) => {
    if (collapsedSections.has(section.id)) {
      setCollapsedSections(prev => {
        const next = new Set(prev);
        next.delete(section.id);
        return next;
      });
    }
    const slugId = `section-${section.name.toLowerCase().replace(/\s+/g, '-')}`;
    setTimeout(() => {
      document.getElementById(slugId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const jumpableSections = sections.filter(
    s => filteredItems.some(i => i.section_id === s.id),
  );

  const fbtSuggestions: CatalogueItem[] = fbtItem
    ? items
        .filter(i => i.is_available && i.id !== fbtItem.id && i.section_id === fbtItem.section_id)
        .slice(0, 3)
    : [];

  const closeFbt = () => {
    if (fbtItem) {
      setFbtDismissed(prev => {
        const next = new Set(prev);
        next.add(fbtItem.id);
        return next;
      });
    }
    setFbtItem(null);
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
          {(() => {
            const unreadDMs = Object.values(socialState.privateChatMeta).reduce((s, m) => s + m.unread, 0);
            const isDetour = !showSocialRoom && !!socialState.alias; // closed but still connected
            return (
              <button onClick={handleOpenSocial} className="relative flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-600 text-xs font-semibold px-2.5 py-1.5 rounded-full flex-shrink-0">
                👥
                {socialState.publicCount > 0 && (
                  <span className="bg-brand-500 text-white text-xs rounded-full px-1 min-w-[16px] text-center">{socialState.publicCount}</span>
                )}
                {isDetour && unreadDMs > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold animate-bounce">
                    {unreadDMs > 9 ? '9+' : unreadDMs}
                  </span>
                )}
                {isDetour && unreadDMs === 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" title="You're still in the room" />
                )}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Search & filters */}
      <div className="bg-white px-4 py-2 border-b border-gray-100">
        <div className="relative mb-2">
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search menu..."
            className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none pr-8"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
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

      {/* Combos & Deals */}
      {combos.filter(c => c.is_available).length > 0 && (
        <div className="px-4 pt-4 pb-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🎁</span>
            <h3 className="font-semibold text-gray-900">Combos & Deals</h3>
            <span className="text-xs text-gray-400">({combos.filter(c => c.is_available).length})</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
            {combos.filter(c => c.is_available).map(combo => (
              <ComboCard
                key={combo.id}
                combo={combo}
                cartQty={isLoggedIn ? (cart.items.find(i => i.item_id === combo.id)?.quantity ?? 0) : 0}
                onAdd={() => handleAddCombo(combo)}
                onRemove={() => handleRemoveCombo(combo)}
              />
            ))}
          </div>
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
              <div key={section.id} id={`section-${section.name.toLowerCase().replace(/\s+/g, '-')}`} className="mb-6 scroll-mt-24">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="sticky top-14 z-20 w-full flex items-center justify-between py-2 px-1 text-left bg-gray-50/95 backdrop-blur border-b border-gray-100 -mx-1"
                >
                  <h3 className="font-semibold text-gray-900">{section.name} ({sectionItems.length})</h3>
                  <span className="text-gray-400">{collapsed ? '▶' : '▼'}</span>
                </button>
                {!collapsed && (
                  <div className="space-y-3 mt-2">
                    {sectionItems.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        cartQty={isLoggedIn ? (cart.items.find(i => i.item_id === item.id)?.quantity ?? 0) : 0}
                        onAdd={() => handleAddItem(item)}
                        onRemove={() => handleRemoveItem(item)}
                        onOpen={() => navigate(`/place/${slug}/item/${item.id}`, { state: { item: { ...item, tenant_id: tenantInfo?.tenant_id } } })}
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
                onOpen={() => navigate(`/place/${slug}/item/${item.id}`, { state: { item: { ...item, tenant_id: tenantInfo?.tenant_id } } })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Swiggy-style Menu floating button + upward popup — shown when 2+ sections have items */}
      {jumpableSections.length >= 2 && (
        <>
          {showMenuJump && (
            <div
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowMenuJump(false)}
            />
          )}
          <div
            className={`fixed right-4 z-50 transition-[bottom] duration-200 ${
              isLoggedIn && (cartCount > 0 || hasActiveOrder) ? 'bottom-32' : 'bottom-20'
            }`}
          >
            {showMenuJump && (
              <div className="absolute bottom-14 right-0 mb-2 w-56 max-h-[60vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100 sticky top-0 bg-white">
                  Menu
                </div>
                <div className="flex flex-col-reverse">
                  {jumpableSections.map(s => {
                    const count = filteredItems.filter(i => i.section_id === s.id).length;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          jumpToSection(s);
                          setShowMenuJump(false);
                        }}
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left border-t border-gray-50"
                      >
                        <span className="text-sm font-medium text-gray-800 truncate">{s.name}</span>
                        <span className="text-xs text-gray-400 ml-2 shrink-0">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button
              onClick={() => setShowMenuJump(v => !v)}
              className="h-12 px-4 bg-gray-900 hover:bg-black text-white rounded-full shadow-xl flex items-center gap-2 text-sm font-semibold transition-transform active:scale-95"
            >
              {showMenuJump ? (
                <>
                  <span className="text-base leading-none">×</span>
                  <span>Close</span>
                </>
              ) : (
                <>
                  <span className="text-base leading-none">☰</span>
                  <span>Menu</span>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">{jumpableSections.length}</span>
                </>
              )}
            </button>
          </div>
        </>
      )}

      {isLoggedIn && cartCount > 0 && <FloatingCart count={cartCount} total={cartTotal} slug={slug ?? ''} />}
      {isLoggedIn && cartCount === 0 && <FloatingOrderTracker />}
      <BottomNav homeLink="/" showMenu={false} />

      {/* Login bottom sheet */}
      {showLogin && (
        <LoginSheet
          onSuccess={handleLoginSuccess}
          onClose={() => { setShowLogin(false); setPendingItem(null); }}
        />
      )}

      {/* Frequently bought together — auto-shown 1s after ADD */}
      {fbtItem && fbtSuggestions.length > 0 && (
        <FrequentlyBoughtSheet
          trigger={fbtItem}
          suggestions={fbtSuggestions}
          cartItemIds={new Set(cart.items.map(i => i.item_id))}
          onAddOne={(s) => doAddItem(s)}
          onRemoveOne={(s) => handleRemoveItem(s)}
          onClose={closeFbt}
        />
      )}

      {/* Profile Drawer */}
      <ProfileDrawer
        isOpen={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
        onLoginRequest={() => { setShowProfileDrawer(false); setShowLogin(true); }}
      />

      {/* Alias Select */}
      {showAliasSelect && tenantInfo && (() => {
        // Prefer the live social-context alias (set once the user is in the room).
        // Fallback to localStorage (covers cold-start entries before any join).
        const currentAlias = socialState.alias || localStorage.getItem(`social:alias:${tenantInfo.tenant_id}`) || '';
        const currentMode = (socialState.mode as 'public' | 'private' | undefined)
          ?? (localStorage.getItem(`social:mode:${tenantInfo.tenant_id}`) as 'public' | 'private' | null)
          ?? undefined;
        const storedIntent = localStorage.getItem(`social:intent:${tenantInfo.tenant_id}`);
        const currentIntent = (storedIntent === 'socialize' || storedIntent === 'date') ? storedIntent : null;
        return (
          <AliasSelect
            placeName={tenantInfo.name}
            savedAlias={currentAlias || undefined}
            savedMode={currentMode}
            savedIntent={currentIntent}
            startAtVibe={!!currentAlias}
            onEnter={handleAliasEnter}
            onClose={() => setShowAliasSelect(false)}
          />
        );
      })()}

      {/* Social Room */}
      {showSocialRoom && tenantInfo && (
        <SocialRoom
          tenantId={tenantInfo.tenant_id}
          branchId={tenantInfo.branch_id}
          placeName={tenantInfo.name}
          slug={slug ?? ''}
          onClose={() => setShowSocialRoom(false)}
          onLeaveRoom={() => {
            leaveRoom(tenantInfo.tenant_id, tenantInfo.branch_id);
            // Keep alias (same identity) but wipe vibe + visibility so the user
            // gets to re-pick them the next time they enter the room.
            localStorage.removeItem(`social:mode:${tenantInfo.tenant_id}`);
            localStorage.removeItem(`social:intent:${tenantInfo.tenant_id}`);
            setShowSocialRoom(false);
          }}
          onChangePreferences={() => {
            // Edit vibe/visibility without leaving — reopen AliasSelect at vibe step,
            // re-join on submit with new mode/intent (alias stays the same).
            setShowSocialRoom(false);
            setShowAliasSelect(true);
          }}
        />
      )}
    </div>
  );
}

// ─── Frequently Bought Together Sheet ────────────────────────────────────────

function FrequentlyBoughtSheet({ trigger, suggestions, cartItemIds, onAddOne, onRemoveOne, onClose }: {
  trigger: CatalogueItem;
  suggestions: CatalogueItem[];
  cartItemIds: Set<string>;
  onAddOne: (item: CatalogueItem) => void;
  onRemoveOne: (item: CatalogueItem) => void;
  onClose: () => void;
}) {
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) setDragY(delta);
  };
  const handleTouchEnd = () => {
    if (dragY > 80) {
      onClose();
    } else {
      setDragY(0);
    }
    startYRef.current = null;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl w-full pb-5 transition-transform"
        style={{ transform: `translateY(${dragY}px)` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — swipe down to dismiss */}
        <div
          className="pt-3 pb-1 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto" />
        </div>
        <div className="px-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-900">Frequently bought together</h3>
            <button onClick={onClose} className="text-gray-400 text-lg leading-none">✕</button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Goes well with <span className="font-medium text-gray-700">{trigger.name}</span></p>

          <div className="space-y-2.5 mb-4">
            {suggestions.map(s => {
              const inCart = cartItemIds.has(s.id);
              const img = s.images?.find(i => i.isPrimary)?.url ?? s.images?.[0]?.url;
              return (
                <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-2.5">
                  <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
                    {img
                      ? <img src={img} alt={s.name} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-lg">🍽</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
                    <div className="text-brand-600 font-semibold text-sm font-mono">₹{(s.price / 100).toFixed(0)}</div>
                  </div>
                  <button
                    onClick={() => inCart ? onRemoveOne(s) : onAddOne(s)}
                    title={inCart ? 'Remove from cart' : 'Add to cart'}
                    className={`w-8 h-8 rounded-full font-bold text-base flex items-center justify-center shadow-sm transition-colors ${
                      inCart
                        ? 'bg-emerald-500 hover:bg-red-500 text-white'
                        : 'bg-brand-500 hover:bg-brand-600 text-white'
                    }`}
                  >
                    {inCart ? '✓' : '+'}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl"
          >
            Back to cart
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Combo Card ───────────────────────────────────────────────────────────────

function ComboCard({ combo, cartQty, onAdd, onRemove }: {
  combo: Combo;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const itemsTotal = combo.items.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);
  const savings = itemsTotal > combo.price ? itemsTotal - combo.price : 0;
  const savingsPct = itemsTotal > 0 ? Math.round((savings / itemsTotal) * 100) : 0;

  return (
    <div className="flex-shrink-0 w-64 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="relative h-32 bg-gradient-to-br from-amber-100 to-rose-100">
        {combo.image_url
          ? <img src={combo.image_url} alt={combo.name} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-4xl">🎁</div>
        }
        {savings > 0 && (
          <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
            SAVE ₹{(savings / 100).toFixed(0)} ({savingsPct}%)
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-semibold text-gray-900 text-sm leading-tight line-clamp-1">{combo.name}</div>
        {combo.description && <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{combo.description}</div>}
        <div className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 leading-snug">
          {combo.items.length === 0
            ? 'No items'
            : combo.items.map(ci => `${ci.quantity}× ${ci.item.name}`).join(' + ')}
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-brand-600 font-bold text-base font-mono">₹{(combo.price / 100).toFixed(0)}</span>
            {savings > 0 && (
              <span className="text-gray-400 line-through text-xs font-mono">₹{(itemsTotal / 100).toFixed(0)}</span>
            )}
          </div>
          {cartQty === 0 ? (
            <button
              onClick={e => { e.stopPropagation(); onAdd(); }}
              className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow"
            >
              ADD
            </button>
          ) : (
            <div className="flex items-center bg-brand-500 rounded-full shadow">
              <button onClick={onRemove} className="text-white font-bold text-sm px-2.5 py-1 hover:bg-brand-600 rounded-l-full">−</button>
              <span className="text-white text-xs font-bold px-1 min-w-4 text-center">{cartQty}</span>
              <button onClick={onAdd} className="text-white font-bold text-sm px-2.5 py-1 hover:bg-brand-600 rounded-r-full">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item, cartQty, onAdd, onRemove, onOpen }: {
  item: CatalogueItem;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const primaryImage = item.images?.find(i => i.isPrimary)?.url ?? item.images?.[0]?.url;
  const vegColor = item.veg_type === 'veg' || item.veg_type === 'vegan' ? 'border-green-500' : item.veg_type === 'non_veg' ? 'border-red-500' : 'border-yellow-500';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="bg-white rounded-xl border border-gray-100 p-3 flex gap-3 shadow-sm cursor-pointer hover:shadow-md hover:border-brand-200 transition-all"
    >
      <div className="flex-1">
        {item.veg_type && (
          <div className={`inline-block w-4 h-4 border-2 ${vegColor} rounded-sm mb-1 relative`}>
            <div className={`absolute inset-0.5 rounded-full ${item.veg_type === 'non_veg' ? 'bg-red-500' : 'bg-green-500'}`} />
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="font-medium text-gray-900 text-sm">{item.name}</div>
          {typeof item.prep_time_mins === 'number' && item.prep_time_mins > 0 && item.prep_time_mins < 30 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              ⏱ {item.prep_time_mins} min
            </span>
          )}
        </div>
        {item.description && <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</div>}
        <div className="text-brand-600 font-semibold text-sm mt-1 font-mono">
          ₹{(item.price / 100).toFixed(0)}
          {item.mrp && item.mrp > 0 && item.mrp > item.price && (
            <span className="text-gray-400 line-through ml-2 font-normal">₹{(item.mrp / 100).toFixed(0)}</span>
          )}
        </div>
        {typeof item.calories === 'number' && item.calories > 0 && (
          <div className="text-[11px] text-gray-400 mt-0.5">{item.calories} cal</div>
        )}
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
