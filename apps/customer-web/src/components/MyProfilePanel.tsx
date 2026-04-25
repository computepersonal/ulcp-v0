import { useState, useEffect, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../hooks/redux';
import { clearAuth, setName as setNameAction } from '../store/authSlice';

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Eggetarian', 'Non-Veg', 'Jain', 'Halal'] as const;
const ALLERGEN_OPTIONS = ['Gluten', 'Dairy', 'Eggs', 'Nuts', 'Peanuts', 'Soy', 'Fish', 'Shellfish', 'Sesame', 'Mustard'] as const;

interface Preferences {
  birthday: string;
  anniversary: string;
  dietary: string[];
  allergens: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function MyProfilePanel({ isOpen, onClose }: Props) {
  const auth = useAppSelector(s => s.auth);
  const dispatch = useAppDispatch();
  const [name, setName] = useState(auth.name ?? '');
  const [bio, setBio] = useState('');
  const [editing, setEditing] = useState(false);

  // Email state
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';

  // Preferences state
  const [prefs, setPrefs] = useState<Preferences>({ birthday: '', anniversary: '', dietary: [], allergens: [] });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // Load preferences from identity-service
  const loadPrefs = useCallback(() => {
    if (!auth.token) return;
    fetch(`${identityUrl}/api/v1/auth/customer/me`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then(r => r.json())
      .then((data: { success: boolean; data?: { email?: string; email_verified?: boolean; birthday?: string; anniversary?: string; preferences?: { dietary?: string[]; allergens?: string[] } } }) => {
        if (data.success && data.data) {
          if (data.data.email) { setEmail(data.data.email); setEmailVerified(!!data.data.email_verified); setEmailOtpStep(data.data.email_verified ? 'verified' : 'idle'); }
          setPrefs({
            birthday: data.data.birthday ? data.data.birthday.slice(0, 10) : '',
            anniversary: data.data.anniversary ? data.data.anniversary.slice(0, 10) : '',
            dietary: data.data.preferences?.dietary ?? [],
            allergens: data.data.preferences?.allergens ?? [],
          });
        }
      })
      .catch(() => undefined);
  }, [auth.token, identityUrl]);

  useEffect(() => { if (isOpen) loadPrefs(); }, [isOpen, loadPrefs]);

  const savePrefs = async () => {
    if (!auth.token) return;
    setPrefsSaving(true);
    try {
      await fetch(`${identityUrl}/api/v1/auth/customer/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({
          birthday: prefs.birthday || null,
          anniversary: prefs.anniversary || null,
          preferences: { dietary: prefs.dietary, allergens: prefs.allergens },
        }),
      });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2000);
    } catch { /* ignore */ }
    setPrefsSaving(false);
  };

  const toggleItem = (list: string[], item: string): string[] =>
    list.includes(item) ? list.filter(x => x !== item) : [...list, item];

  const sendEmailOtp = async () => {
    if (!auth.token || !email) return;
    setEmailLoading(true); setEmailError('');
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/customer/email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ email }),
      });
      if (res.ok) { setEmailOtpStep('sent'); }
      else { setEmailError('Failed to send verification code.'); }
    } catch { setEmailError('Connection error.'); }
    finally { setEmailLoading(false); }
  };

  const verifyEmailOtp = async () => {
    if (!auth.token || emailOtp.length !== 6) return;
    setEmailLoading(true); setEmailError('');
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/customer/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ email, otp: emailOtp }),
      });
      if (res.ok) { setEmailVerified(true); setEmailOtpStep('verified'); setEditingEmail(false); }
      else { setEmailError('Invalid code. Try again.'); }
    } catch { setEmailError('Verification failed.'); }
    finally { setEmailLoading(false); }
  };

  const displayName = name || auth.name || '';
  const initials = displayName ? displayName[0].toUpperCase() : auth.phone?.[0] ?? '?';

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel — slides in from right */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-full flex flex-col shadow-2xl z-50 transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: '#F9FAFB' }}
      >
        {/* Header */}
        <div className="bg-brand-500 px-5 pt-12 pb-6 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-sm"
          >
            ✕
          </button>
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold mb-3">
            {initials}
          </div>
          <div className="text-white font-semibold text-lg">{displayName || 'You'}</div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Display name */}
          <div className="px-5 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Display Name</span>
              <button
                onClick={() => setEditing(v => !v)}
                className="text-xs text-brand-500 font-medium"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editing ? (
              <div className="flex gap-2 mt-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 40))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500"
                  placeholder="Your name"
                  autoFocus
                />
                <button
                  onClick={() => { dispatch(setNameAction(name.trim())); setEditing(false); }}
                  className="bg-brand-500 text-white text-sm font-semibold px-3 py-2 rounded-lg"
                >
                  Save
                </button>
              </div>
            ) : (
              <p className="text-gray-800 font-medium mt-1">{displayName || '—'}</p>
            )}
          </div>

          {/* Phone number (read-only) */}
          <div className="px-5 py-5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Phone</span>
            <p className="text-gray-800 font-medium mt-1">+91 {auth.phone ?? '—'}</p>
            <p className="text-xs text-gray-400 mt-1">Phone number cannot be changed</p>
          </div>

          {/* Email */}
          <div className="px-5 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</span>
              {email && emailVerified && !editingEmail && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px]">✓</span>
                  Verified
                </span>
              )}
              {email && !emailVerified && emailOtpStep === 'idle' && !editingEmail && (
                <span className="text-xs text-amber-500 font-medium">Not verified</span>
              )}
            </div>

            {!email && !editingEmail ? (
              <button
                onClick={() => setEditingEmail(true)}
                className="mt-1 text-sm text-brand-500 font-medium"
              >
                + Add email address
              </button>
            ) : !editingEmail && emailOtpStep !== 'sent' ? (
              <div>
                <p className="text-gray-800 font-medium mt-1">{email}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { setEditingEmail(true); setEmailOtpStep('idle'); setEmailOtp(''); setEmailError(''); }}
                    className="text-xs text-brand-500 font-medium"
                  >
                    Change
                  </button>
                  {!emailVerified && (
                    <button
                      onClick={() => { void sendEmailOtp(); }}
                      disabled={emailLoading}
                      className="text-xs text-brand-500 font-medium"
                    >
                      {emailLoading ? 'Sending...' : 'Verify now'}
                    </button>
                  )}
                </div>
              </div>
            ) : editingEmail ? (
              <div className="mt-2">
                <div className="flex gap-2">
                  <input
                    type="email" value={email} autoFocus
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500"
                  />
                  <button
                    onClick={() => {
                      setEditingEmail(false);
                      setEmailVerified(false);
                      setEmailOtpStep('idle');
                      void sendEmailOtp();
                    }}
                    disabled={!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || emailLoading}
                    className="bg-brand-500 text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    {emailLoading ? '...' : 'Verify'}
                  </button>
                </div>
                <button onClick={() => setEditingEmail(false)} className="text-xs text-gray-400 mt-2">Cancel</button>
                {emailError && <p className="text-red-500 text-xs mt-2">{emailError}</p>}
              </div>
            ) : emailOtpStep === 'sent' ? (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-2">Verification code sent to {email}</p>
                <div className="flex gap-2">
                  <input
                    type="text" inputMode="numeric" value={emailOtp} autoFocus
                    onChange={e => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 text-center tracking-widest font-mono"
                  />
                  <button
                    onClick={() => { void verifyEmailOtp(); }}
                    disabled={emailOtp.length !== 6 || emailLoading}
                    className="bg-brand-500 text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    {emailLoading ? '...' : 'Verify'}
                  </button>
                </div>
                {emailError && <p className="text-red-500 text-xs mt-2">{emailError}</p>}
                <button
                  onClick={() => { void sendEmailOtp(); }}
                  disabled={emailLoading}
                  className="text-xs text-brand-500 font-medium mt-2"
                >
                  Resend code
                </button>
              </div>
            ) : null}
          </div>

          {/* Bio */}
          <div className="px-5 py-5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Bio</span>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 150))}
              rows={3}
              placeholder="Tell others a little about yourself..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 resize-none"
            />
            <div className="text-right text-xs text-gray-300 mt-1">{bio.length}/150</div>
          </div>

          {/* Interests */}
          <div className="px-5 py-5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">Interests</span>
            <div className="flex flex-wrap gap-2">
              {['🍕 Food', '🎵 Music', '📚 Books', '🏋️ Fitness', '🎮 Gaming', '🎨 Art', '✈️ Travel', '☕ Coffee'].map(tag => (
                <button
                  key={tag}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-100 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Preferences — Birthday, Anniversary, Dietary, Allergens */}
          <div className="px-5 py-5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">Preferences</span>

            <div className="space-y-4">
              {/* Birthday */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Birthday</label>
                <input
                  type="date"
                  value={prefs.birthday}
                  onChange={e => setPrefs(p => ({ ...p, birthday: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500"
                />
                <p className="text-xs text-gray-400 mt-1">Get a special offer on your birthday!</p>
              </div>

              {/* Anniversary */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Anniversary</label>
                <input
                  type="date"
                  value={prefs.anniversary}
                  onChange={e => setPrefs(p => ({ ...p, anniversary: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500"
                />
              </div>

              {/* Dietary */}
              <div>
                <label className="text-xs text-gray-500 block mb-2">Dietary Preference</label>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setPrefs(p => ({ ...p, dietary: toggleItem(p.dietary, opt) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        prefs.dietary.includes(opt)
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Allergens */}
              <div>
                <label className="text-xs text-gray-500 block mb-2">Allergens</label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGEN_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setPrefs(p => ({ ...p, allergens: toggleItem(p.allergens, opt) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        prefs.allergens.includes(opt)
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">We'll highlight dishes with your allergens</p>
              </div>

              <button
                onClick={() => { void savePrefs(); }}
                disabled={prefsSaving}
                className="w-full py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {prefsSaved ? '✓ Saved' : prefsSaving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>

          {/* Social settings */}
          <div className="px-5 py-5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">Social Room</span>
            <div className="space-y-3">
              {[
                { label: 'Show me in People list', defaultOn: true },
                { label: 'Allow private messages', defaultOn: true },
                { label: 'Share my order activity', defaultOn: false },
              ].map(setting => (
                <div key={setting.label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{setting.label}</span>
                  <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${setting.defaultOn ? 'bg-brand-500' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${setting.defaultOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sign out */}
          <div className="px-5 py-5">
            <button
              onClick={() => { dispatch(clearAuth()); onClose(); }}
              className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-semibold border border-red-100 hover:bg-red-100 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
