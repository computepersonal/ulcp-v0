import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { updateQuantity } from '../store/cartSlice';
import OtpModal from '../components/OtpModal';

interface LoyaltyOffer {
  id: string;
  name: string;
  description: string | null;
  auto_apply: boolean;
  value_type: string;
  value: number;
}

interface LoyaltyInfo {
  points_balance: number;
  wallet_balance: number;
  active_offers: LoyaltyOffer[];
}

export default function Cart() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const cart = useAppSelector(s => s.cart);
  const auth = useAppSelector(s => s.auth);

  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [instructions, setInstructions] = useState('');

  // Loyalty state
  const loyaltyUrl = import.meta.env.VITE_LOYALTY_SERVICE_URL ?? 'http://localhost:3011';
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);

  const tenantId = cart.tenant_id ?? '';
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const gst = Math.round(subtotal * 0.05);

  // Calculate loyalty discount
  const offerDiscount = (() => {
    if (!selectedOffer || !loyalty) return 0;
    const offer = loyalty.active_offers.find(o => o.id === selectedOffer);
    if (!offer) return 0;
    if (offer.value_type === 'percentage') return Math.round(subtotal * offer.value / 100);
    return Math.min(offer.value, subtotal);
  })();
  const pointsValue = usePoints && loyalty ? Math.min(loyalty.points_balance * 10, subtotal - offerDiscount) : 0;
  const walletValue = useWallet && loyalty ? Math.min(loyalty.wallet_balance, subtotal - offerDiscount - pointsValue) : 0;
  const totalDiscount = offerDiscount + pointsValue + walletValue;
  const total = subtotal + gst - totalDiscount;

  // Fetch loyalty info when logged in
  useEffect(() => {
    if (!auth.token || !tenantId) return;
    fetch(`${loyaltyUrl}/api/v1/loyalty/${tenantId}/me`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then(r => r.json())
      .then((data: { success: boolean; data?: { loyalty: { points_balance: number; wallet_balance: number }; active_offers: LoyaltyOffer[] } }) => {
        if (data.success && data.data) {
          setLoyalty({
            points_balance: data.data.loyalty.points_balance,
            wallet_balance: data.data.loyalty.wallet_balance,
            active_offers: data.data.active_offers,
          });
          // Auto-select auto_apply offers
          const autoOffer = data.data.active_offers.find(o => o.auto_apply);
          if (autoOffer) setSelectedOffer(autoOffer.id);
        }
      })
      .catch(() => undefined);
  }, [auth.token, tenantId, loyaltyUrl]);

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

        {/* Coupon */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <div className="flex gap-2">
            <input
              type="text"
              value={coupon}
              onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponError(''); }}
              placeholder="Enter coupon code"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <button
              onClick={() => setCouponError('Invalid coupon code')}
              className="px-4 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-xl"
            >
              Apply
            </button>
          </div>
          {couponError && <p className="text-red-500 text-xs mt-2">{couponError}</p>}
        </div>

        {/* Loyalty Redemption */}
        {auth.token && loyalty && (loyalty.active_offers.length > 0 || loyalty.points_balance > 0 || loyalty.wallet_balance > 0) && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span>🎁</span> Rewards
            </h3>

            {/* Available offers */}
            {loyalty.active_offers.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Offers</div>
                {loyalty.active_offers.map(offer => (
                  <button
                    key={offer.id}
                    onClick={() => setSelectedOffer(selectedOffer === offer.id ? null : offer.id)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${
                      selectedOffer === offer.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {offer.auto_apply && (
                        <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded font-semibold">AUTO</span>
                      )}
                      <span className="text-sm font-medium text-gray-900">{offer.name}</span>
                      {selectedOffer === offer.id && <span className="ml-auto text-brand-500">✓</span>}
                    </div>
                    {offer.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{offer.description}</div>
                    )}
                    <div className="text-xs text-brand-600 font-medium mt-1">
                      {offer.value_type === 'percentage' ? `${offer.value}% off` : `₹${(offer.value / 100).toFixed(0)} off`}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Points redemption */}
            {loyalty.points_balance > 0 && (
              <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePoints}
                  onChange={(e) => setUsePoints(e.target.checked)}
                  className="w-4 h-4 accent-brand-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Use points</div>
                  <div className="text-xs text-gray-500">
                    {loyalty.points_balance.toLocaleString()} pts = ₹{(loyalty.points_balance * 10 / 100).toFixed(0)} value
                  </div>
                </div>
                {usePoints && pointsValue > 0 && (
                  <span className="text-sm font-semibold text-green-600">-₹{(pointsValue / 100).toFixed(0)}</span>
                )}
              </label>
            )}

            {/* Wallet balance */}
            {loyalty.wallet_balance > 0 && (
              <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useWallet}
                  onChange={(e) => setUseWallet(e.target.checked)}
                  className="w-4 h-4 accent-brand-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Use wallet</div>
                  <div className="text-xs text-gray-500">
                    Balance: ₹{(loyalty.wallet_balance / 100).toFixed(2)}
                  </div>
                </div>
                {useWallet && walletValue > 0 && (
                  <span className="text-sm font-semibold text-green-600">-₹{(walletValue / 100).toFixed(0)}</span>
                )}
              </label>
            )}
          </div>
        )}

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
            {offerDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Offer discount</span>
                <span className="font-mono">-₹{(offerDiscount / 100).toFixed(0)}</span>
              </div>
            )}
            {pointsValue > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Points redeemed</span>
                <span className="font-mono">-₹{(pointsValue / 100).toFixed(0)}</span>
              </div>
            )}
            {walletValue > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Wallet</span>
                <span className="font-mono">-₹{(walletValue / 100).toFixed(0)}</span>
              </div>
            )}
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
