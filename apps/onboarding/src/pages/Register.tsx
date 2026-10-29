import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { goToPos, POS } from '../lib/posLinks';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { setAuth, clearAuth } from '../store/authSlice';

interface RegisterResponse {
  success: boolean;
  data?: {
    access_token: string;
    refresh_token: string;
    user: { user_id: string; tenant_id: string | null; role: string; name: string; email: string; permissions: string[] };
  };
  error?: string;
}

interface MeResponse {
  success: boolean;
  data?: { user: { role: string } };
}

export default function Register() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const role = useAppSelector((s) => s.auth.user?.role);

  const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';

  // If there's a stored token, verify it's still valid before redirecting.
  // Stale/expired tokens should clear so the user sees the register form fresh.
  useEffect(() => {
    if (!token) return;

    void (async () => {
      try {
        const res = await fetch(`${identityUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          // Token is invalid or expired — clear stale auth and show form
          dispatch(clearAuth());
          return;
        }
        const data = (await res.json()) as MeResponse;
        const currentRole = data.data?.user.role ?? role;
        if (currentRole === 'pending_onboarding') {
          navigate('/', { replace: true });
        } else {
          goToPos(POS.floorMap);
        }
      } catch {
        dispatch(clearAuth());
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // While we're verifying the token, don't flash the form
  if (token) return null;

  return <RegisterForm identityUrl={identityUrl} dispatch={dispatch} navigate={navigate} />;
}

function RegisterForm({
  identityUrl,
  dispatch,
  navigate,
}: {
  identityUrl: string;
  dispatch: ReturnType<typeof useAppDispatch>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = (await res.json()) as RegisterResponse;

      if (!res.ok || !data.success || !data.data) {
        setError(data.error ?? 'Registration failed. Please try again.');
        return;
      }

      dispatch(setAuth({
        token: data.data.access_token,
        refreshToken: data.data.refresh_token,
        user: data.data.user,
      }));
      navigate('/');
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-brand-500 mb-2">ULCP</div>
          <h1 className="text-xl font-semibold text-gray-900">Create your account</h1>
          <p className="text-gray-500 text-sm mt-1">Set up your business in minutes</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Ravi Kumar"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@email.com"
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
              placeholder="Min. 8 characters"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="Re-enter password"
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
            disabled={loading || !name || !email || !password || !confirm}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-brand-500 font-medium hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
