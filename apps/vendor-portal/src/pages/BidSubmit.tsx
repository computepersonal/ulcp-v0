import { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { submitBid, type BidRequestDetail } from "../lib/api";

export default function BidSubmit() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const bid_request = location.state?.bid_request as BidRequestDetail | undefined;

  const [items, setItems] = useState<Array<{ ingredient_id: string; unit_price: number; quantity_available: number; notes: string }>>(
    (bid_request?.items ?? []).map((i) => ({
      ingredient_id: i.ingredient_id,
      unit_price: 0,
      quantity_available: i.quantity,
      notes: "",
    }))
  );
  const [leadTime, setLeadTime] = useState(2);
  const [paymentTerms, setPaymentTerms] = useState("net_7");
  const [deliveryIncluded, setDeliveryIncluded] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0]!;
  });
  const [notes, setNotes] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.unit_price * (bid_request?.items.find((r) => r.ingredient_id === i.ingredient_id)?.quantity ?? 0), 0);
  const totalAmount = deliveryIncluded ? subtotal : subtotal + deliveryCharge;

  const mutation = useMutation({
    mutationFn: () =>
      submitBid(token!, {
        items: items.map((i) => ({ ingredient_id: i.ingredient_id, unit_price: i.unit_price * 100, quantity_available: i.quantity_available, notes: i.notes || undefined })),
        total_amount: totalAmount * 100,
        lead_time_days: leadTime,
        valid_until: new Date(validUntil).toISOString(),
        payment_terms: paymentTerms,
        delivery_included: deliveryIncluded,
        delivery_charge: deliveryIncluded ? 0 : deliveryCharge * 100,
        notes: notes || undefined,
      }),
    onSuccess: (data) => {
      navigate(`/vendor/bid/${token}/confirmed`, { state: { bid_id: data.bid.id, items, total: totalAmount } });
    },
  });

  if (!bid_request) return <div className="min-h-screen flex items-center justify-center text-gray-500">Please start from your invitation link.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h1 className="text-xl font-bold text-gray-900">{bid_request.title}</h1>
          <p className="text-sm text-gray-500 mt-1">Fill in your pricing and terms below</p>
        </div>

        {/* Item rows */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Your Pricing</h2>
          <div className="space-y-4">
            {bid_request.items.map((req_item, i) => {
              const row = items[i]!;
              const rowTotal = row.unit_price * req_item.quantity;
              return (
                <div key={req_item.ingredient_id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-medium text-gray-900">{req_item.ingredient_name}</p>
                      <p className="text-xs text-gray-500">Qty needed: {req_item.quantity} {req_item.unit}</p>
                    </div>
                    {row.unit_price > 0 && (
                      <p className="text-sm font-semibold text-brand-600">Row total: ₹{rowTotal.toFixed(2)}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Unit price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unit_price || ""}
                        onChange={(e) => {
                          const next = [...items];
                          next[i] = { ...row, unit_price: parseFloat(e.target.value) || 0 };
                          setItems(next);
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Qty available</label>
                      <input
                        type="number"
                        min="0"
                        value={row.quantity_available}
                        onChange={(e) => {
                          const next = [...items];
                          next[i] = { ...row, quantity_available: parseFloat(e.target.value) || 0 };
                          setItems(next);
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...row, notes: e.target.value };
                        setItems(next);
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Brand, quality details..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary & terms */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Summary & Terms</h2>
          <div className="space-y-4">
            <div className="flex justify-between text-sm py-2 border-b border-gray-100">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-mono font-semibold">₹{subtotal.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Delivery included?</span>
              <button
                type="button"
                onClick={() => setDeliveryIncluded((v) => !v)}
                className={`w-12 h-6 rounded-full transition-colors ${deliveryIncluded ? "bg-brand-500" : "bg-gray-200"} relative`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${deliveryIncluded ? "left-7" : "left-1"}`} />
              </button>
            </div>

            {!deliveryIncluded && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Delivery charge (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={deliveryCharge || ""}
                  onChange={(e) => setDeliveryCharge(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="0.00"
                />
              </div>
            )}

            <div className="flex justify-between text-base font-bold py-2 border-t border-gray-200">
              <span>Grand Total</span>
              <span className="font-mono text-brand-600">₹{totalAmount.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Lead time (days)</label>
                <input
                  type="number"
                  min="1"
                  value={leadTime}
                  onChange={(e) => setLeadTime(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Payment terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="advance">Advance</option>
                  <option value="on_delivery">On Delivery</option>
                  <option value="net_7">Net 7</option>
                  <option value="net_15">Net 15</option>
                  <option value="net_30">Net 30</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Bid valid until</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Additional notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                placeholder="Certifications, special conditions, delivery details..."
              />
            </div>
          </div>
        </div>

        {mutation.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
            {(mutation.error as Error).message}
          </div>
        )}

        <button
          onClick={() => setShowConfirm(true)}
          disabled={items.some((i) => !i.unit_price) || mutation.isPending}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-base shadow-sm"
        >
          {mutation.isPending ? "Submitting..." : "Submit Bid"}
        </button>

        {/* Confirm modal */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Submission</h3>
              <p className="text-sm text-gray-600 mb-4">
                You're submitting a bid of <span className="font-bold text-brand-600">₹{totalAmount.toFixed(2)}</span> with {leadTime}-day lead time. This cannot be changed after submission.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowConfirm(false); mutation.mutate(); }}
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
