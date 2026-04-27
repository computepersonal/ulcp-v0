import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { setAuth, setOnboardingStatus, clearAuth } from '../store/authSlice';

// ─── Business type catalogue ──────────────────────────────────────────────────

interface BusinessType {
  value: string;
  label: string;
  emoji: string;
  description: string;
  category: string;
}

const BUSINESS_TYPES: BusinessType[] = [
  { value: 'self_service_cafe', label: 'Café / Counter', emoji: '☕', description: 'Token pickup, no table service', category: 'Dine-in' },
  { value: 'seated_food_only', label: 'Restaurant', emoji: '🍽️', description: 'Waiter service, food only', category: 'Dine-in' },
  { value: 'seated_full_service', label: 'Restaurant + Bar', emoji: '🍸', description: 'Food & drinks, separate bar KDS', category: 'Dine-in' },
  { value: 'seated_self_order', label: 'QR Self-Order', emoji: '📱', description: 'Customers order via QR', category: 'Dine-in' },
  { value: 'home_kitchen', label: 'Home Kitchen', emoji: '🏠', description: 'Delivery only, WhatsApp orders', category: 'Delivery' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchen', emoji: '☁️', description: 'Delivery only, near + far', category: 'Delivery' },
  { value: 'restaurant_plus_delivery', label: 'Restaurant + Delivery', emoji: '🛵', description: 'Dine-in and delivery unified', category: 'Delivery' },
  { value: 'food_truck', label: 'Food Truck', emoji: '🚚', description: 'Daily location, walk-in & delivery', category: 'Delivery' },
  { value: 'catering', label: 'Catering', emoji: '🎪', description: 'Advance bookings, partial payments', category: 'Delivery' },
  { value: 'gated_community', label: 'Gated Community', emoji: '🏘️', description: 'Tower/flat delivery, monthly tab', category: 'Delivery' },
  { value: 'kirana', label: 'Kirana / Grocery', emoji: '🛒', description: 'General store, daily essentials', category: 'Retail' },
  { value: 'boutique', label: 'Boutique / Clothing', emoji: '👗', description: 'Fashion, apparel, accessories', category: 'Retail' },
  { value: 'pharmacy', label: 'Pharmacy', emoji: '💊', description: 'Medicine, health products', category: 'Retail' },
  { value: 'bakery', label: 'Bakery', emoji: '🥐', description: 'Breads, cakes, pastries', category: 'Retail' },
  { value: 'nursery', label: 'Nursery / Plants', emoji: '🌱', description: 'Plants, seeds, gardening', category: 'Retail' },
  { value: 'custom', label: 'Other Business', emoji: '🏪', description: 'Any other type', category: 'Retail' },
];

const CATEGORIES = ['Dine-in', 'Delivery', 'Retail'];

// ─── API response types ───────────────────────────────────────────────────────

interface TenantResponse {
  success: boolean;
  data?: { tenant: { id: string; name: string; slug: string } };
  error?: string;
}

interface RefreshResponse {
  success: boolean;
  data?: { access_token: string; refresh_token: string };
  error?: string;
}

interface MeResponse {
  success: boolean;
  data?: {
    user: {
      user_id: string;
      tenant_id: string | null;
      role: string;
      name: string;
      email: string;
      permissions: string[];
    };
  };
}

interface OnboardingStateResponse {
  success: boolean;
  data?: {
    onboarding_step: number;
    onboarding_completed: boolean;
    name: string;
    business_type: string;
    slug: string;
  };
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEP_LABELS = ['Business type', 'Details', 'Profile', 'Catalogue', 'Operations', 'Go live'];
const TOTAL_STEPS = 6;

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function Onboard() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const reduxToken = useAppSelector((s) => s.auth.token);
  const reduxRefreshToken = useAppSelector((s) => s.auth.refreshToken);
  const reduxUser = useAppSelector((s) => s.auth.user);

  const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';
  const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  // Wizard state
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveToken, setLiveToken] = useState(reduxToken ?? '');

  // Business details
  const [businessType, setBusinessType] = useState('');
  const [bizName, setBizName] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizCity, setBizCity] = useState('');
  const [bizState, setBizState] = useState('');
  const [bizAddress, setBizAddress] = useState('');

  // After tenant creation
  const [tenantId, setTenantId] = useState('');
  const [slug, setSlug] = useState('');
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstin, setGstin] = useState('');

  // On mount: verify token, check server onboarding state, resume at correct step
  useEffect(() => {
    void (async () => {
      if (!reduxToken) {
        setAuthError(true);
        return;
      }

      // Fetch /me to get real user state
      const meRes = await fetch(`${identityUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${reduxToken}` },
      }).catch(() => null);

      let currentToken = reduxToken;
      let serverUser = reduxUser;

      if (meRes?.ok) {
        const meData = (await meRes.json()) as MeResponse;
        if (meData.data?.user) serverUser = meData.data.user;
      } else {
        // Token expired — try refresh
        if (!reduxRefreshToken) {
          dispatch(clearAuth());
          setAuthError(true);
          return;
        }

        const refreshRes = await fetch(`${identityUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: reduxRefreshToken }),
          credentials: 'include',
        }).catch(() => null);

        if (!refreshRes?.ok) {
          dispatch(clearAuth());
          setAuthError(true);
          return;
        }

        const refreshData = (await refreshRes.json()) as RefreshResponse;
        if (!refreshData.success || !refreshData.data) {
          dispatch(clearAuth());
          setAuthError(true);
          return;
        }

        currentToken = refreshData.data.access_token;

        const me2Res = await fetch(`${identityUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        }).catch(() => null);
        if (me2Res?.ok) {
          const me2Data = (await me2Res.json()) as MeResponse;
          if (me2Data.data?.user) serverUser = me2Data.data.user;
        }

        dispatch(setAuth({
          token: currentToken,
          refreshToken: refreshData.data.refresh_token,
          user: serverUser!,
        }));
      }

      setLiveToken(currentToken);

      // If user has a tenant, fetch onboarding state from server
      if (serverUser?.tenant_id && serverUser.role !== 'pending_onboarding') {
        try {
          const obRes = await fetch(
            `${tenantUrl}/api/v1/onboarding/${serverUser.tenant_id}`,
            { headers: { Authorization: `Bearer ${currentToken}` } }
          );
          if (obRes.ok) {
            const obData = (await obRes.json()) as OnboardingStateResponse;
            if (obData.success && obData.data) {
              dispatch(setOnboardingStatus({
                completed: obData.data.onboarding_completed,
                step: obData.data.onboarding_step,
              }));

              // Already completed — go to dashboard
              if (obData.data.onboarding_completed) {
                navigate('/floor-map', { replace: true });
                return;
              }

              // Resume at server step
              setTenantId(serverUser.tenant_id);
              setBizName(obData.data.name ?? '');
              setBusinessType(obData.data.business_type ?? '');
              setSlug(obData.data.slug ?? '');

              // Tenant already exists — steps 1-2 (type + create business) are done.
              // Floor to 3 so legacy/stale onboarding_step=1 records don't send
              // the user back to a "create business" screen that would collide on slug.
              const serverStep = Math.max(obData.data.onboarding_step, 3);
              setStep(Math.min(serverStep, TOTAL_STEPS));
              setReady(true);
              return;
            }
          }
        } catch {
          // Non-fatal — let them start fresh
        }
      }

      // No tenant yet — start from step 1
      setReady(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth error screen ──────────────────────────────────────────────────────
  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Session expired</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your session has expired. Please sign in again to continue setting up your business.
          </p>
          <Link
            to="/login"
            className="block w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading while verifying token ──────────────────────────────────────────
  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const goToStep = (n: number) => {
    setError('');
    setStep(n);
  };

  const handle401 = (apiErr: string | undefined) => {
    const msg = apiErr ?? '';
    if (msg.toLowerCase().includes('token') || msg.toLowerCase().includes('unauthorized')) {
      dispatch(clearAuth());
      setAuthError(true);
      return true;
    }
    return false;
  };

  // ── Step 2: Create tenant ─────────────────────────────────────────────────
  const createTenant = async () => {
    if (!bizName.trim()) {
      setError('Business name is required');
      return;
    }
    if (!businessType) {
      setError('Please select a business type first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${tenantUrl}/api/v1/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${liveToken}`,
        },
        body: JSON.stringify({
          name: bizName.trim(),
          business_type: businessType,
          phone: bizPhone.trim() || undefined,
          city: bizCity.trim() || undefined,
          state: bizState.trim() || undefined,
          address: bizAddress.trim() || undefined,
        }),
      });

      const data = (await res.json()) as TenantResponse;

      if (res.status === 401) {
        handle401(data.error);
        return;
      }
      if (!res.ok || !data.success || !data.data) {
        setError(data.error ?? 'Failed to create business. Please try again.');
        return;
      }

      const newTenantId = data.data.tenant.id;
      setTenantId(newTenantId);
      setSlug(data.data.tenant.slug);

      // Refresh token so JWT now includes tenant_id + tenant_owner role
      const refreshRes = await fetch(`${identityUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: reduxRefreshToken ?? '' }),
        credentials: 'include',
      }).catch(() => null);

      if (refreshRes?.ok) {
        const refreshData = (await refreshRes.json()) as RefreshResponse;
        if (refreshData.success && refreshData.data) {
          const newToken = refreshData.data.access_token;
          setLiveToken(newToken);
          dispatch(setAuth({
            token: newToken,
            refreshToken: refreshData.data.refresh_token,
            user: { ...reduxUser!, tenant_id: newTenantId, role: 'tenant_owner' },
          }));
        }
      }

      goToStep(3);
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Save profile ──────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${tenantUrl}/api/v1/onboarding/${tenantId}/step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${liveToken}`,
        },
        body: JSON.stringify({
          step: 3,
          data: {
            name: bizName.trim(),
            slug: slug.trim() || undefined,
            gst_registered: gstRegistered,
            gstin: gstRegistered ? gstin.trim() : undefined,
          },
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (res.status === 401) { handle401(data.error); return; }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to save profile.');
        return;
      }
      goToStep(4);
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 4: Save catalogue step (mark as visited) ─────────────────────────
  const saveCatalogueStep = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${tenantUrl}/api/v1/onboarding/${tenantId}/step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${liveToken}`,
        },
        body: JSON.stringify({ step: 4, data: { confirmed: true } }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (res.status === 401) { handle401(data.error); return; }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to save step.');
        return;
      }
      goToStep(5);
    } catch {
      setError('Unable to connect.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 5: Save operations step ──────────────────────────────────────────
  const saveOperationsStep = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${tenantUrl}/api/v1/onboarding/${tenantId}/step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${liveToken}`,
        },
        body: JSON.stringify({ step: 5, data: { confirmed: true } }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (res.status === 401) { handle401(data.error); return; }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to save step.');
        return;
      }
      goToStep(6);
    } catch {
      setError('Unable to connect.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 6: Complete onboarding ───────────────────────────────────────────
  const finishOnboarding = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${tenantUrl}/api/v1/onboarding/${tenantId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${liveToken}` },
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (res.status === 401) { handle401(data.error); return; }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to complete setup.');
        return;
      }

      dispatch(setOnboardingStatus({ completed: true, step: 6 }));
      navigate('/setup');
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // ── Progress ──────────────────────────────────────────────────────────────
  const progressPct = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="text-xl font-bold text-brand-500">ULCP</span>
          <button
            onClick={() => { dispatch(clearAuth()); navigate('/login'); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-brand-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Step indicators */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-1">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1 ${active ? 'text-brand-500' : done ? 'text-green-500' : 'text-gray-300'}`}>
                  <div className={`w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center border-2 flex-shrink-0 ${
                    active ? 'border-brand-500 bg-brand-50 text-brand-500' :
                    done ? 'border-green-500 bg-green-500 text-white' :
                    'border-gray-200 bg-white text-gray-300'
                  }`}>
                    {done ? '✓' : n}
                  </div>
                  <span className={`text-xs font-medium hidden lg:block ${active ? 'text-brand-500' : done ? 'text-green-500' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`flex-1 h-px ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <Step1BusinessType
            selected={businessType}
            onSelect={setBusinessType}
            onNext={() => goToStep(2)}
          />
        )}

        {step === 2 && (
          <Step2Details
            bizName={bizName} setBizName={setBizName}
            bizPhone={bizPhone} setBizPhone={setBizPhone}
            bizCity={bizCity} setBizCity={setBizCity}
            bizState={bizState} setBizState={setBizState}
            bizAddress={bizAddress} setBizAddress={setBizAddress}
            loading={loading}
            onBack={() => goToStep(1)}
            onNext={() => void createTenant()}
          />
        )}

        {step === 3 && (
          <Step3Profile
            slug={slug} setSlug={setSlug}
            gstRegistered={gstRegistered} setGstRegistered={setGstRegistered}
            gstin={gstin} setGstin={setGstin}
            loading={loading}
            onNext={() => void saveProfile()}
            // Tenant already exists — Back to step 2 would re-trigger createTenant
            // and fail on slug uniqueness. No back button at this step.
            onBack={tenantId ? null : () => goToStep(2)}
          />
        )}

        {step === 4 && (
          <Step4Catalogue
            loading={loading}
            onNext={() => void saveCatalogueStep()}
            onSkip={() => void saveCatalogueStep()}
            onBack={() => goToStep(3)}
          />
        )}

        {step === 5 && (
          <Step5Operations
            businessType={businessType}
            loading={loading}
            onNext={() => void saveOperationsStep()}
            onSkip={() => void saveOperationsStep()}
            onBack={() => goToStep(4)}
          />
        )}

        {step === 6 && (
          <Step6GoLive
            bizName={bizName}
            businessType={businessType}
            loading={loading}
            onComplete={() => void finishOnboarding()}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Business Type ───────────────────────────────────────────────────

function Step1BusinessType({
  selected, onSelect, onNext,
}: { selected: string; onSelect: (v: string) => void; onNext: () => void }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">What kind of business?</h2>
      <p className="text-gray-500 text-sm mb-8">This sets up the right features and workflows for you.</p>

      {CATEGORIES.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{cat}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {BUSINESS_TYPES.filter((t) => t.category === cat).map((type) => (
              <button
                key={type.value}
                onClick={() => onSelect(type.value)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selected === type.value
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-2">{type.emoji}</div>
                <div className={`text-sm font-semibold ${selected === type.value ? 'text-brand-600' : 'text-gray-800'}`}>
                  {type.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 leading-tight">{type.description}</div>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end mt-4">
        <button
          onClick={onNext}
          disabled={!selected}
          className="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Business Details ────────────────────────────────────────────────

function Step2Details({
  bizName, setBizName, bizPhone, setBizPhone,
  bizCity, setBizCity, bizState, setBizState, bizAddress, setBizAddress,
  loading, onBack, onNext,
}: {
  bizName: string; setBizName: (v: string) => void;
  bizPhone: string; setBizPhone: (v: string) => void;
  bizCity: string; setBizCity: (v: string) => void;
  bizState: string; setBizState: (v: string) => void;
  bizAddress: string; setBizAddress: (v: string) => void;
  loading: boolean; onBack: () => void; onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Tell us about your business</h2>
      <p className="text-gray-500 text-sm mb-8">You can update these details later from Settings.</p>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Business name <span className="text-red-500">*</span></label>
          <input
            type="text" value={bizName} onChange={(e) => setBizName(e.target.value)}
            required autoFocus placeholder="e.g. Ravi's Cafe"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Phone number</label>
          <input
            type="tel" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">City</label>
            <input
              type="text" value={bizCity} onChange={(e) => setBizCity(e.target.value)}
              placeholder="Bangalore"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">State</label>
            <input
              type="text" value={bizState} onChange={(e) => setBizState(e.target.value)}
              placeholder="Karnataka"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Address</label>
          <input
            type="text" value={bizAddress} onChange={(e) => setBizAddress(e.target.value)}
            placeholder="Shop 12, MG Road"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 transition-colors">
          Back
        </button>
        <button
          onClick={onNext} disabled={loading || !bizName.trim()}
          className="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? 'Setting up...' : 'Create business'}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Profile ─────────────────────────────────────────────────────────

function Step3Profile({
  slug, setSlug, gstRegistered, setGstRegistered, gstin, setGstin,
  loading, onNext, onBack,
}: {
  slug: string; setSlug: (v: string) => void;
  gstRegistered: boolean; setGstRegistered: (v: boolean) => void;
  gstin: string; setGstin: (v: string) => void;
  loading: boolean; onNext: () => void; onBack: (() => void) | null;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Your business profile</h2>
      <p className="text-gray-500 text-sm mb-8">Customers will see this when they scan your QR code.</p>

      <div className="space-y-5">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Business URL slug</label>
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-brand-500 transition-colors">
            <span className="px-3 py-3 bg-gray-50 text-gray-400 text-sm border-r border-gray-200 whitespace-nowrap">ulcp.app/</span>
            <input
              type="text" value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="ravis-cafe"
              className="flex-1 px-3 py-3 text-sm outline-none bg-white"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only.</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">GST registered business</p>
              <p className="text-xs text-gray-400 mt-0.5">Generates Tax Invoices with CGST / SGST breakdown</p>
            </div>
            <button
              onClick={() => setGstRegistered(!gstRegistered)}
              className={`relative w-11 h-6 rounded-full transition-colors ${gstRegistered ? 'bg-brand-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${gstRegistered ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {gstRegistered && (
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700 block mb-1">GSTIN</label>
              <input
                type="text" value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="27AAPFU0939F1ZV" maxLength={15}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-brand-500 transition-colors bg-white"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between mt-8">
        {onBack ? (
          <button onClick={onBack} className="px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 transition-colors">
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onNext} disabled={loading}
          className="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? 'Saving...' : 'Save & continue'}
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Catalogue ───────────────────────────────────────────────────────

function Step4Catalogue({
  loading, onNext, onSkip, onBack,
}: { loading: boolean; onNext: () => void; onSkip: () => void; onBack: () => void }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Add your catalogue</h2>
      <p className="text-gray-500 text-sm mb-8">
        Add your menu items, products, or services. You can always add more later from the Catalogue page.
      </p>

      <div className="bg-brand-50 border border-brand-100 rounded-2xl p-6 mb-6">
        <div className="text-3xl mb-3">📋</div>
        <p className="text-sm text-brand-800 font-medium mb-1">You can set up your catalogue after onboarding</p>
        <p className="text-xs text-brand-600">
          This step is optional during onboarding. You'll be able to add items, sections, prices, and photos from the Catalogue page in your dashboard.
        </p>
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 transition-colors">
          Back
        </button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-6 py-3 text-gray-400 font-medium rounded-xl hover:text-gray-600 transition-colors">
            Skip for now
          </button>
          <button
            onClick={onNext} disabled={loading}
            className="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Operations ──────────────────────────────────────────────────────

const DINE_IN_TYPES = [
  'self_service_cafe', 'seated_food_only', 'seated_full_service',
  'seated_self_order', 'restaurant_plus_delivery',
];

function Step5Operations({
  businessType, loading, onNext, onSkip, onBack,
}: { businessType: string; loading: boolean; onNext: () => void; onSkip: () => void; onBack: () => void }) {
  const isDineIn = DINE_IN_TYPES.includes(businessType);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Operations setup</h2>
      <p className="text-gray-500 text-sm mb-8">
        {isDineIn
          ? 'Set up your tables and floor layout. You can configure this from the Floor Map page later.'
          : 'Set up your delivery zones and settings. You can configure these from Settings later.'}
      </p>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="text-3xl mb-3">{isDineIn ? '🪑' : '🛵'}</div>
        <p className="text-sm text-gray-800 font-medium mb-1">
          {isDineIn ? 'Tables & Floor Map' : 'Delivery Zones'}
        </p>
        <p className="text-xs text-gray-500">
          {isDineIn
            ? 'Add tables, create sections (indoor, outdoor, VIP), and assign seating capacity. You can do this from the Floor Map page after onboarding.'
            : 'Configure your delivery radius, pricing, and zones. You can set this up from Settings after onboarding.'}
        </p>
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 transition-colors">
          Back
        </button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-6 py-3 text-gray-400 font-medium rounded-xl hover:text-gray-600 transition-colors">
            Skip for now
          </button>
          <button
            onClick={onNext} disabled={loading}
            className="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 6: Go Live ─────────────────────────────────────────────────────────

function Step6GoLive({
  bizName, businessType, loading, onComplete,
}: { bizName: string; businessType: string; loading: boolean; onComplete: () => void }) {
  const [goLive, setGoLive] = useState(false);
  const typeLabel = BUSINESS_TYPES.find((t) => t.value === businessType)?.label ?? businessType;

  const checklist = [
    { done: true, text: 'Account created' },
    { done: true, text: `Business type set — ${typeLabel}` },
    { done: true, text: `"${bizName}" profile ready` },
    { done: false, text: 'Add your menu / catalogue items' },
    { done: false, text: 'Invite your first staff member' },
    { done: false, text: 'Configure tables or delivery zones' },
  ];

  return (
    <div>
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">{goLive ? '🚀' : '🎉'}</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Almost there!</h2>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Review your setup and flip the switch when you're ready to go live.
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 text-left mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Setup checklist</p>
        <div className="space-y-3">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-green-500' : 'border-2 border-gray-200'}`}>
                {item.done && <span className="text-white text-xs">✓</span>}
              </div>
              <span className={`text-sm ${item.done ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{item.text}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Remaining tasks can be completed from your dashboard.</p>
      </div>

      {/* Go Live toggle */}
      <div className={`border-2 rounded-2xl p-5 mb-6 transition-colors ${goLive ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-base font-bold ${goLive ? 'text-green-700' : 'text-gray-900'}`}>
              {goLive ? 'Your business is live!' : 'Go Live'}
            </p>
            <p className={`text-xs mt-0.5 ${goLive ? 'text-green-600' : 'text-gray-500'}`}>
              {goLive
                ? 'QR codes will work. Customers can place orders.'
                : 'Flip this switch to activate your business and start accepting orders.'}
            </p>
          </div>
          <button
            onClick={() => setGoLive(!goLive)}
            className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${goLive ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${goLive ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4 mb-8 text-left">
        <p className="text-xs font-semibold text-brand-600 mb-1">Free plan activated</p>
        <p className="text-xs text-brand-500">Start with our free plan. Upgrade anytime to unlock inventory, analytics, and more.</p>
      </div>

      <button
        onClick={onComplete}
        disabled={loading}
        className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl text-base transition-colors"
      >
        {loading ? 'Setting up your dashboard...' : 'Go to Dashboard'}
      </button>
    </div>
  );
}
