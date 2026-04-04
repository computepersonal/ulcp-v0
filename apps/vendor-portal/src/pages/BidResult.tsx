import { useLocation } from "react-router-dom";

interface BidResultState {
  result?: "awarded" | "rejected";
  total?: number;
}

export default function BidResult() {
  const location = useLocation();
  const { result, total } = (location.state ?? {}) as BidResultState;

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Please start from your invitation link.
      </div>
    );
  }

  const awarded = result === "awarded";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Result card */}
        <div className={`rounded-2xl shadow-sm border p-8 mb-4 text-center ${awarded ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${awarded ? "bg-green-100" : "bg-gray-200"}`}>
            {awarded ? (
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h1 className={`text-2xl font-bold mb-2 ${awarded ? "text-green-800" : "text-gray-800"}`}>
            {awarded ? "Your Bid Was Awarded!" : "Bid Not Selected"}
          </h1>
          <p className={`text-sm ${awarded ? "text-green-700" : "text-gray-500"}`}>
            {awarded
              ? "Congratulations! The buyer has chosen your bid. Expect a purchase order shortly."
              : "The buyer selected a different vendor for this request. Better luck next time!"}
          </p>
        </div>

        {/* Details */}
        {awarded && total !== undefined && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-3">Order Details</h2>
            <div className="flex justify-between items-center py-2 border-t border-gray-100">
              <span className="text-sm text-gray-600">Awarded bid amount</span>
              <span className="font-mono font-bold text-green-600 text-lg">₹{total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              A purchase order will be sent to you with delivery details. Please fulfil it within your committed lead time.
            </p>
          </div>
        )}

        {/* Next steps */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">{awarded ? "Next Steps" : "What you can do"}</h2>
          {awarded ? (
            <div className="space-y-3">
              {[
                "Watch for a purchase order from the buyer",
                "Prepare and dispatch within your committed lead time",
                "Contact the buyer if you have any questions",
              ].map((text, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-600">{text}</p>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="text-gray-400">•</span>
                Participate in future bid requests from this buyer
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400">•</span>
                Improve your rating by fulfilling other orders on time
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400">•</span>
                Offer competitive pricing in future bids
              </li>
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Questions? Contact{" "}
          <a href="mailto:support@localcommerce.app" className="underline">
            support@localcommerce.app
          </a>
        </p>
      </div>
    </div>
  );
}
