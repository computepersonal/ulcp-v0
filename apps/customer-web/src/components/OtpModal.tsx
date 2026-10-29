import { useState, useRef, useEffect } from 'react';
import { useAppDispatch } from '../hooks/redux';
import { setAuth } from '../store/authSlice';

interface OtpModalProps {
  open: boolean;
  tenantId: string;
  onSuccess: (token: string) => void;
  onClose: () => void;
}

export default function OtpModal({ open, tenantId, onSuccess, onClose }: OtpModalProps) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? '';

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  if (!open) return null;

  const sendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/customer/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, tenant_id: tenantId })
      });
      if (res.ok) {
        setStep('otp');
        setCountdown(45);
        setTimeout(() => digitRefs.current[0]?.focus(), 100);
      } else {
        setError('Failed to send OTP. Please try again.');
      }
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    const otp = digits.join('');
    if (otp.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${identityUrl}/api/v1/auth/customer/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, tenant_id: tenantId })
      });
      const data = (await res.json()) as {
        success: boolean;
        data?: { token: string; customerId: string; name: string };
        error?: string;
      };
      if (res.ok && data.success && data.data) {
        dispatch(setAuth({
          token: data.data.token,
          customerId: data.data.customerId,
          name: data.data.name,
          phone
        }));
        onSuccess(data.data.token);
      } else {
        setError(data.error ?? 'Invalid OTP. Please try again.');
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white rounded-t-2xl p-6 w-full max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {step === 'phone' ? 'Enter your phone number' : 'Enter OTP'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {step === 'phone' ? (
          <>
            <p className="text-gray-500 text-sm mb-4">We'll send you a 6-digit code to verify your number</p>
            <div className="flex gap-2 mb-4">
              <div className="bg-gray-100 rounded-lg px-3 py-3 text-gray-600 font-medium">+91</div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile number"
                maxLength={10}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-brand-500"
                autoFocus
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
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-4">Code sent to +91 {phone}</p>
            <div className="flex gap-2 mb-4 justify-center">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { digitRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                  className="w-11 h-12 text-center text-xl font-bold border-2 border-gray-300 focus:border-brand-500 rounded-lg outline-none"
                />
              ))}
            </div>
            {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
            <button
              onClick={() => { void verifyOtp(); }}
              disabled={digits.join('').length !== 6 || loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-xl mb-3"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <div className="text-center text-sm text-gray-500">
              {countdown > 0 ? (
                `Resend in ${countdown}s`
              ) : (
                <button
                  onClick={() => { void sendOtp(); }}
                  className="text-brand-500 hover:text-brand-600 font-medium"
                >
                  Resend OTP
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
