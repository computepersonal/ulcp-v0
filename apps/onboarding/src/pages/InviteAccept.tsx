import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { goToPos, POS } from '../lib/posLinks';

interface InviteInfo {
  email: string;
  role: string;
  tenant_id: string;
  expires_at: string;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('Invalid invite link');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${tenantServiceUrl}/api/v1/staff-invite/validate/${token}`);
        const data = (await res.json()) as { success: boolean; data?: { invite: InviteInfo }; error?: string };
        if (data.success && data.data?.invite) {
          setInvite(data.data.invite);
        } else {
          setError(data.error ?? 'Invalid or expired invite link');
        }
      } catch {
        setError('Could not validate invite. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, tenantServiceUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${tenantServiceUrl}/api/v1/staff-invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const data = (await res.json()) as { success: boolean; data?: { message: string; email: string; role: string }; error?: string };
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error ?? 'Failed to create account');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Validating your invite...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-green-600 text-2xl font-bold">&#10003;</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Account Created!</h1>
          <p className="text-sm text-gray-500 mb-1">
            Your staff account has been set up successfully.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            You can now log in with <span className="font-medium text-gray-700">{invite?.email}</span> and the password you just set.
          </p>
          <button
            onClick={() => goToPos(POS.login)}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-2xl">!</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invite</h1>
          <p className="text-sm text-gray-500 mb-6">
            {error ?? 'This invite link is invalid or has expired. Ask your manager to send a new one.'}
          </p>
          <button
            onClick={() => goToPos(POS.login)}
            className="w-full py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-brand-600 text-lg font-bold">U</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Join the team</h1>
          <p className="text-sm text-gray-500 mt-1">
            You've been invited as <span className="font-medium text-brand-600 capitalize">{invite.role.replace(/_/g, ' ')}</span>
          </p>
        </div>

        {/* Invite details */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Email</span>
            <span className="font-medium text-gray-900">{invite.email}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-500">Role</span>
            <span className="font-medium text-gray-900 capitalize">{invite.role.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Rahul Sharma"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Set Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Re-enter your password"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !name || !password}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors mt-2"
          >
            {submitting ? 'Creating account...' : 'Create Account & Join'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-4">
          Already have an account?{' '}
          <button onClick={() => goToPos(POS.login)} className="text-brand-500 hover:text-brand-600 font-medium">
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}
