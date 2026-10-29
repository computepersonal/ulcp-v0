import { useState, useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store, type RootState } from './store';
import { setAuth } from './store/authSlice';
import Home from './pages/Home';
import Catalogue from './pages/Catalogue';
import ItemDetail from './pages/ItemDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderTracking from './pages/OrderTracking';
import OrderHistory from './pages/OrderHistory';

function GuestLanding() {
  const dispatch = useDispatch();
  const [showLogin, setShowLogin] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp' | 'name'>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  // Temp hold verified data until name is collected (for new users)
  const [verifiedData, setVerifiedData] = useState<{ token: string; customerId: string } | null>(null);
  const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? '';

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
          dispatch(setAuth({
            token: data.data.token,
            customerId: data.data.customerId,
            name: data.data.name,
            phone,
          }));
        } else {
          // New user — need to collect name
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
    dispatch(setAuth({
      token: verifiedData.token,
      customerId: verifiedData.customerId,
      name: name.trim(),
      phone,
    }));
  };

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[index] = digit; setDigits(next);
    if (digit && index < 5) (document.getElementById(`guest-otp-${index + 1}`) as HTMLInputElement)?.focus();
  };
  const handleDigitKey = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0)
      (document.getElementById(`guest-otp-${index - 1}`) as HTMLInputElement)?.focus();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4">📷</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Scan a QR code</h1>
      <p className="text-gray-500 text-sm max-w-xs">
        Point your camera at a QR code at any restaurant or shop to browse their menu and place orders.
      </p>

      <div className="mt-8 w-full max-w-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 uppercase">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {!showLogin ? (
          <button
            onClick={() => setShowLogin(true)}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-colors"
          >
            Sign in to your account
          </button>
        ) : step === 'phone' ? (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 text-left">
            <h3 className="font-semibold text-gray-900 mb-1">Sign In</h3>
            <p className="text-gray-500 text-xs mb-4">Enter your mobile number to continue</p>
            <div className="flex gap-2 mb-3">
              <div className="bg-gray-100 rounded-xl px-3 py-3 text-gray-600 font-medium text-sm">+91</div>
              <input
                type="tel" value={phone} autoFocus
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile"
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
            <button onClick={() => setShowLogin(false)} className="w-full mt-2 text-sm text-gray-400">Cancel</button>
          </div>
        ) : step === 'otp' ? (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 text-left">
            <h3 className="font-semibold text-gray-900 mb-1">Enter OTP</h3>
            <p className="text-gray-500 text-xs mb-4">Code sent to +91 {phone}</p>
            <div className="flex gap-2 mb-4 justify-center">
              {digits.map((d, i) => (
                <input key={i} id={`guest-otp-${i}`} type="text" inputMode="numeric"
                  maxLength={2} value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleDigitKey(i, e)}
                  className="w-10 h-11 text-center text-lg font-bold border-2 border-gray-200 focus:border-brand-500 rounded-xl outline-none"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
            <button
              onClick={() => { void verifyOtp(); }}
              disabled={digits.join('').length !== 6 || loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl mb-2"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <div className="text-center text-sm text-gray-500">
              {countdown > 0 ? `Resend in ${countdown}s` : (
                <button onClick={() => { void sendOtp(); }} className="text-brand-500 font-medium">Resend OTP</button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 text-left">
            <h3 className="font-semibold text-gray-900 mb-1">Welcome!</h3>
            <p className="text-gray-500 text-xs mb-4">You're new here. What should we call you?</p>
            <input
              type="text" value={name} autoFocus
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 mb-3"
            />
            <button
              onClick={completeName}
              disabled={name.trim().length < 2}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl"
            >
              Continue
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-gray-400">Already have a place link? Open it directly in your browser.</div>
    </div>
  );
}

// Chooses the landing screen from the stored login
function AppWithProviders() {
  const authToken = useSelector((s: RootState) => s.auth.token);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            {/* Home — shows saved places if logged in, scan prompt if guest */}
            <Route path="/" element={
              authToken
                ? <Home />
                : <GuestLanding />
            } />
            {/* Place/catalogue — public, no login required to browse */}
            <Route path="/place/:slug" element={<Catalogue />} />
            <Route path="/place/:slug/item/:id" element={<ItemDetail />} />
            <Route path="/place/:slug/cart" element={<Cart />} />
            <Route path="/place/:slug/checkout" element={<Checkout />} />
            <Route path="/place/:slug/order/:id" element={<OrderTracking />} />
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/place/:slug/orders" element={<OrderHistory />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppWithProviders />
    </Provider>
  );
}
