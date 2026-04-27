import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { clearCart } from '../store/cartSlice';
import { NativeAdCard } from '../components/ads/NativeAdCard';
import { useAds } from '../components/ads/useAds';
import OtpModal from '../components/OtpModal';

type PaymentMethod = 'upi' | 'card' | 'cod' | 'tab';

export default function Checkout() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const cart = useAppSelector(s => s.cart);
  const auth = useAppSelector(s => s.auth);

  // Pay-later (table tab) only works when we know which table — without a table_id
  // the restaurant has no tab to hold against, so force pay-now regardless of config.
  const isPayLater = cart.billing_mode === 'pay_later' && !!cart.table_id;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(isPayLater ? 'tab' : 'upi');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [confirmedTableName, setConfirmedTableName] = useState<string | null>(null);
  const [showOtp, setShowOtp] = useState(!auth.token);

  const { ads: postCheckoutAds } = useAds({
    placement: 'post_checkout',
    tenant_id: cart.tenant_id ?? undefined,
    limit: 3,
    enabled: !!confirmedOrderId,
  });

  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + gst;

  const handlePlaceOrder = async () => {
    if (!auth.token) {
      setShowOtp(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${orderServiceUrl}/api/v1/orders/customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          tenant_id: cart.tenant_id,
          branch_id: cart.branch_id,
          type: 'dine_in',
          business_type: cart.business_type ?? 'seated_food_only',
          ...(cart.table_id ? { table_id: cart.table_id } : {}),
          ...(cart.table_name ? { table_name: cart.table_name } : {}),
          items: cart.items.map(i => ({
            id: i.item_id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            ...(i.variant ? { variant_name: i.variant } : {})
          })),
          // In pay_later mode the actual method (cash/upi/card) is recorded
          // when staff settles the tab — leave it unset on the order.
          ...(isPayLater ? {} : { payment_method: paymentMethod }),
        })
      });
      const data = (await res.json()) as { success: boolean; data?: { id: string }; error?: string };
      if (res.ok && data.success && data.data) {
        // Prepaid confirmation — UPI / Card are "pay now" methods. Tells the backend the money
        // has been collected so staff POS shows "Already Paid" instead of re-prompting.
        // (COD stays pending → paid on delivery. Tab/pay_later stays pending → paid at counter.)
        if (!isPayLater && (paymentMethod === 'upi' || paymentMethod === 'card')) {
          try {
            await fetch(`${orderServiceUrl}/api/v1/orders/customer/${cart.tenant_id}/${data.data.id}/payment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
              },
              body: JSON.stringify({ payment_method: paymentMethod }),
            });
          } catch { /* non-blocking — staff POS can still collect manually */ }
        }

        // Save to order history in localStorage
        try {
          const history = JSON.parse(localStorage.getItem('order_history') ?? '[]') as Array<Record<string, unknown>>;
          history.unshift({
            id: data.data.id,
            tenant_id: cart.tenant_id,
            branch_id: cart.branch_id,
            place_name: cart.place_name ?? slug ?? 'Unknown',
            slug: slug ?? '',
            items: cart.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, variant: i.variant })),
            total,
            payment_method: paymentMethod,
            placed_at: new Date().toISOString(),
            status: 'placed',
          });
          // Keep last 50 orders
          localStorage.setItem('order_history', JSON.stringify(history.slice(0, 50)));
        } catch { /* ignore */ }

        // Save active order for floating tracker (supports multiple)
        try {
          const activeOrders = JSON.parse(localStorage.getItem('active_orders') ?? '[]') as Array<Record<string, unknown>>;
          activeOrders.unshift({
            id: data.data.id,
            slug: slug ?? '',
            place_name: cart.place_name ?? slug ?? 'Unknown',
            status: 'pending',
            placed_at: new Date().toISOString(),
            items_count: cart.items.reduce((sum, i) => sum + i.quantity, 0),
          });
          localStorage.setItem('active_orders', JSON.stringify(activeOrders));
        } catch { /* ignore */ }

        setConfirmedTableName(cart.table_name);
        dispatch(clearCart());
        setConfirmedOrderId(data.data.id);
      } else {
        setError(data.error ?? 'Failed to place order. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // OTP gate — must be logged in before checkout
  if (showOtp) {
    return (
      <OtpModal
        open={true}
        tenantId={cart.tenant_id ?? ''}
        onSuccess={(_token: string) => setShowOtp(false)}
        onClose={() => navigate(-1)}
      />
    );
  }

  // Post-checkout success screen with ads
  if (confirmedOrderId) {
    return (
      <div className="min-h-screen bg-gray-50 pb-8">
        <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
          {/* Success state */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
            <div className="text-5xl mb-3">📋</div>
            <div className="font-bold text-gray-900 text-xl mb-1">
              {isPayLater ? 'Order Added to Your Tab!' : 'Order Placed!'}
            </div>
            <div className="text-gray-500 text-sm">
              {isPayLater
                ? 'Your order has been sent to the kitchen. Pay when you\'re done.'
                : paymentMethod === 'cod'
                  ? 'Pay on delivery. Track for live updates.'
                  : 'Payment received. Track for live updates.'}
            </div>
            {isPayLater && confirmedTableName && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                Table {confirmedTableName}
              </div>
            )}
          </div>

          {/* Post-checkout ads — horizontal scroll */}
          {postCheckoutAds.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Explore nearby while you wait</div>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {postCheckoutAds.map(ad => (
                  <div key={ad.campaign_id} className="min-w-[200px] max-w-[200px]">
                    <NativeAdCard
                      ad={ad}
                      onClick={() => { window.open(ad.cta_url, '_blank', 'noreferrer'); }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Social room suggestion while the order is prepared */}
          {slug && (
            <div className="bg-gradient-to-r from-brand-50 to-purple-50 rounded-2xl p-4 border border-brand-100">
              <div className="flex items-center gap-3">
                <div className="text-2xl">💬</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900">While you wait...</div>
                  <div className="text-xs text-gray-500 mt-0.5">Join the social room! Chat, play trivia, or request songs 🎵</div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/place/${slug}?tab=social`)}
                className="w-full mt-3 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Join Social Room →
              </button>
            </div>
          )}

          {/* Track order button */}
          <button
            onClick={() => navigate(`/place/${slug}/order/${confirmedOrderId}`)}
            className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl transition-colors"
          >
            Track My Order →
          </button>
          <button
            onClick={() => navigate(slug ? `/place/${slug}` : '/')}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-2xl transition-colors"
          >
            {slug ? '← Back to Menu' : 'Back to Home'}
          </button>
        </div>
      </div>
    );
  }

  const paymentMethods: Array<{ id: PaymentMethod; icon: string; label: string }> = [
    { id: 'upi', icon: '⚡', label: 'UPI' },
    { id: 'card', icon: '💳', label: 'Card' },
    { id: 'cod', icon: '💵', label: 'Cash on Delivery' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-600 text-xl">←</button>
          <h1 className="font-bold text-gray-900">
            {isPayLater ? 'Confirm Order' : 'Payment'}
          </h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Order items breakdown (pay_later shows full list, pay_now shows summary) */}
        {isPayLater ? (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3">Your Order</h3>
            <div className="space-y-3">
              {cart.items.map(item => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                    {item.variant && <div className="text-xs text-gray-500">{item.variant}</div>}
                    <div className="text-xs text-gray-400">Qty: {item.quantity}</div>
                  </div>
                  <div className="text-sm font-mono text-gray-700 ml-3">
                    ₹{((item.price * item.quantity) / 100).toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 mt-3 pt-3 space-y-1">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span className="font-mono">₹{(subtotal / 100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>GST (5%)</span>
                <span className="font-mono">₹{(gst / 100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Total</span>
                <span className="font-mono text-brand-600">₹{(total / 100).toFixed(0)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">
                  {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'}
                </div>
                <div className="text-sm text-gray-500">from {slug}</div>
              </div>
              <div className="font-bold text-brand-600 text-lg font-mono">₹{(total / 100).toFixed(0)}</div>
            </div>
          </div>
        )}

        {/* Pay later info banner */}
        {isPayLater && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-lg mt-0.5">📋</span>
            <div>
              <div className="font-medium text-amber-800 text-sm">Pay at the counter</div>
              <div className="text-amber-600 text-xs mt-0.5">
                Your order will be added to your table tab. Pay all orders together when you're done dining.
              </div>
            </div>
          </div>
        )}

        {/* Payment methods — only for pay_now */}
        {!isPayLater && (
          <>
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-3">Payment Method</h3>
              <div className="space-y-2">
                {paymentMethods.map(pm => (
                  <button
                    key={pm.id}
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                      paymentMethod === pm.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <span className="text-xl">{pm.icon}</span>
                    <span className={`font-medium text-sm ${paymentMethod === pm.id ? 'text-brand-700' : 'text-gray-700'}`}>
                      {pm.label}
                    </span>
                    {paymentMethod === pm.id && <span className="ml-auto text-brand-500">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
              🔒 Secured by Razorpay · PCI-DSS compliant
            </div>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm text-center">
            {error}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3">
        <button
          onClick={() => { void handlePlaceOrder(); }}
          disabled={loading}
          className={`w-full max-w-lg mx-auto block py-4 font-bold rounded-2xl text-base disabled:opacity-60 transition-colors ${
            isPayLater
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-brand-500 hover:bg-brand-600 text-white'
          }`}
        >
          {loading
            ? 'Processing...'
            : isPayLater
              ? 'Confirm Order'
              : `Pay ₹${(total / 100).toFixed(0)}`
          }
        </button>
      </div>
    </div>
  );
}
