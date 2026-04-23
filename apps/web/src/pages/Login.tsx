import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../hooks/redux';
import { setAuth, setOnboardingStatus } from '../store/authSlice';

interface TenantChoice {
  tenant_id: string;
  role: string;
  business_name: string;
  business_type: string;
}

interface LoginResponse {
  success: boolean;
  data?: {
    access_token: string;
    user: { user_id: string; tenant_id: string; role: string; name: string; email: string; permissions: string[] };
  };
  error?: string;
}

interface TenantSelectionResponse {
  success: false;
  error: 'TENANT_SELECTION_REQUIRED';
  data: { tenants: TenantChoice[] };
}

const ROLE_LABELS: Record<string, string> = {
  tenant_owner: 'Owner',
  managing_partner: 'Managing Partner',
  branch_manager: 'Branch Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  head_chef: 'Head Chef',
};

export default function Login() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Business picker state
  const [tenants, setTenants] = useState<TenantChoice[]>([]);
  const [pickingTenant, setPickingTenant] = useState(false);

  const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';
  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  const doLogin = async (tenant_id?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(tenant_id ? { tenant_id } : {}) }),
      });

      const data = (await res.json()) as LoginResponse | TenantSelectionResponse;

      // Multiple businesses found — show picker
      if (!data.success && 'error' in data && data.error === 'TENANT_SELECTION_REQUIRED') {
        const sel = data as TenantSelectionResponse;
        setTenants(sel.data.tenants);
        setPickingTenant(true);
        return;
      }

      const loginData = data as LoginResponse;
      if (!res.ok || !loginData.success || !loginData.data) {
        setError(loginData.error ?? 'Invalid credentials. Please try again.');
        return;
      }

      const { access_token, user: loggedInUser } = loginData.data;
      dispatch(setAuth({ token: access_token, user: loggedInUser }));

      // pending_onboarding → hasn't created a business yet
      if (loggedInUser.role === 'pending_onboarding') {
        navigate('/onboard');
        return;
      }

      // Has a tenant — check if onboarding is complete
      if (loggedInUser.tenant_id) {
        try {
          const obRes = await fetch(
            `${tenantServiceUrl}/api/v1/onboarding/${loggedInUser.tenant_id}`,
            { headers: { Authorization: `Bearer ${access_token}` } }
          );
          if (obRes.ok) {
            const obData = (await obRes.json()) as {
              success: boolean;
              data?: { onboarding_completed: boolean; onboarding_step: number };
            };
            if (obData.success && obData.data) {
              dispatch(setOnboardingStatus({
                completed: obData.data.onboarding_completed,
                step: obData.data.onboarding_step,
              }));
              if (!obData.data.onboarding_completed) {
                navigate('/onboard');
                return;
              }
            }
          }
        } catch {
          // If onboarding check fails, let them through — don't block login
        }
      }

      navigate('/floor-map');
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doLogin();
  };

  // ── Business picker screen ───────────────────────────────────────────────────
  if (pickingTenant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-md">
          <button
            onClick={() => { setPickingTenant(false); setTenants([]); }}
            className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Select your business</h1>
          <p className="text-sm text-gray-500 mb-6">
            Your account is linked to multiple businesses. Choose one to continue.
          </p>
          <div className="space-y-3">
            {tenants.map((t) => (
              <button
                key={t.tenant_id}
                onClick={() => void doLogin(t.tenant_id)}
                disabled={loading}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors text-left disabled:opacity-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{t.business_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ROLE_LABELS[t.role] ?? t.role}
                    {t.business_type ? ` · ${t.business_type.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
                <span className="text-brand-500 text-lg">→</span>
              </button>
            ))}
          </div>
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Login form ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-brand-500 mb-2">ULCP</div>
          <h1 className="text-xl font-semibold text-gray-900">Staff Portal</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@business.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          New to ULCP?{' '}
          <Link to="/register" className="text-brand-500 font-medium hover:underline">
            Set up your business
          </Link>
        </p>
      </div>
    </div>
  );
}
