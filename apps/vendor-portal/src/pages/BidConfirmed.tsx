import { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { withdrawBid } from "../lib/api";

export default function BidConfirmed() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { bid_id, items, total } = (location.state ?? {}) as {
    bid_id?: string;
    items?: Array<{ ingredient_id: string; unit_price: number; quantity_available: number; notes: string }>;
    total?: number;
  };

  const [showWithdraw, setShowWithdraw] = useState(false);

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawBid(bid_id!),
    onSuccess: () => {
      navigate(`/vendor/bid/${token}`, { replace: true });
    },
  });

  if (!bid_id) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Please start from your invitation link.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Bid Submitted!</h1>
          <p className="text-gray-500 text-sm">
            Your bid has been received. You will be notified when a decision is made.
          </p>
        </div>

        {/* Summary */}
        {total !== undefined && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-3">Bid Summary</h2>
            <div className="flex justify-between items-center py-2 border-t border-gray-100">
              <span className="text-sm text-gray-600">Total bid amount</span>
              <span className="font-mono font-bold text-brand-600 text-lg">₹{total.toFixed(2)}</span>
            </div>
            {items && items.length > 0 && (
              <div className="mt-3 space-y-1">
                {items.map((item) => (
                  item.unit_price > 0 && (
                    <div key={item.ingredient_id} className="flex justify-between text-xs text-gray-500">
                      <span>Unit price</span>
                      <span className="font-mono">₹{item.unit_price.toFixed(2)}</span>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}

        {/* What happens next */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">What happens next?</h2>
          <div className="space-y-3">
            {[
              { step: "1", text: "The buyer reviews all submitted bids after the deadline" },
              { step: "2", text: "Bids are ranked by price, lead time, and payment terms" },
              { step: "3", text: "You'll be notified if your bid is selected or rejected" },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step}
                </div>
                <p className="text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => setShowWithdraw(true)}
            className="w-full py-3 border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-xl transition-colors text-sm"
          >
            Withdraw Bid
          </button>
          <p className="text-center text-xs text-gray-400">
            Need help? Contact the buyer or{" "}
            <a href="mailto:support@localcommerce.app" className="underline">
              reach our support
            </a>
          </p>
        </div>

        {/* Withdraw confirm modal */}
        {showWithdraw && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Withdraw Bid?</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will permanently withdraw your bid. You will not be eligible for this procurement request.
              </p>
              {withdrawMutation.error && (
                <p className="text-sm text-red-600 mb-3">{(withdrawMutation.error as Error).message}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowWithdraw(false)}
                  disabled={withdrawMutation.isPending}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  {withdrawMutation.isPending ? "Withdrawing..." : "Yes, Withdraw"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
