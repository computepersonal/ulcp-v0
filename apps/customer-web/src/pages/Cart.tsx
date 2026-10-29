import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { updateQuantity } from '../store/cartSlice';
import OtpModal from '../components/OtpModal';

export default function Cart() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const cart = useAppSelector(s => s.cart);
  const auth = useAppSelector(s => s.auth);

  const [showOtp, setShowOtp] = useState(false);
  const [instructions, setInstructions] = useState('');

  const tenantId = cart.tenant_id ?? '';
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const gst = Math.round(subtotal * 0.05);

  const totalDiscount = 0;
  const total = subtotal + gst - totalDiscount;

  const handlePlaceOrder = () => {
    if (!auth.token) {
      setShowOtp(true);
    } else {
      navigate(`/place/${slug}/checkout`);
    }
  };

  const handleOtpSuccess = (_token: string) => {
    setShowOtp(false);
    navigate(`/place/${slug}/checkout`);
  };

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="text-5xl mb-4">🛒</div>
        <div className="font-semibold text-gray-700 text-lg mb-2">Your cart is empty</div>
        <button
          onClick={() => navigate(`/place/${slug}`)}
          className="mt-4 px-6 py-3 bg-brand-500 text-white rounded-xl font-medium"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-600 text-xl">←</button>
          <h1 className="font-bold text-gray-900">Your Cart</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Items */}
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          {cart.items.map((item, idx) => (
            <div key={item.id} className={`flex items-center gap-3 p-4 ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
              <div className="flex-1">
                <div className="font-medium text-gray-900 text-sm">{item.name}</div>
                {item.variant && <div className="text-xs text-gray-400">{item.variant}</div>}
                <div className="font-semibold text-brand-600 text-sm mt-1 font-mono">
                  ₹{(item.price / 100).toFixed(0)}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-2 py-1.5">
                <button
                  onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity - 1 }))}
                  className="w-6 h-6 flex items-center justify-center text-brand-500 font-bold"
                >
                  −
                </button>
                <span className="w-5 text-center font-bold text-sm">{item.quantity}</span>
                <button
                  onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                  className="w-6 h-6 flex items-center justify-center text-brand-500 font-bold"
                >
                  +
                </button>
              </div>
              <div className="font-semibold text-gray-900 text-sm font-mono w-14 text-right">
                ₹{((item.price * item.quantity) / 100).toFixed(0)}
              </div>
            </div>
          ))}
        </div>

        {/* Special instructions */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <label className="font-medium text-gray-900 text-sm block mb-2">Special Instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Any requests for the kitchen..."
            rows={2}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-brand-500 resize-none"
          />
        </div>

        {/* Bill summary */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-3">Bill Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-mono">₹{(subtotal / 100).toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST (5%)</span>
              <span className="font-mono">₹{(gst / 100).toFixed(0)}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
              <span>Total</span>
              <span className="font-mono text-brand-600">₹{(total / 100).toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3">
        <button
          onClick={handlePlaceOrder}
          className="w-full max-w-lg mx-auto block py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl text-base"
        >
          Place Order — ₹{(total / 100).toFixed(0)}
        </button>
      </div>

      <OtpModal
        open={showOtp}
        tenantId={tenantId}
        onSuccess={handleOtpSuccess}
        onClose={() => setShowOtp(false)}
      />
    </div>
  );
}
