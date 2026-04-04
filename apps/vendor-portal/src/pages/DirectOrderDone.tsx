import { useLocation } from "react-router-dom";

export default function DirectOrderDone() {
  const location = useLocation();
  const { result } = (location.state ?? {}) as { result?: "accepted" | "declined" };

  const accepted = result === "accepted";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className={`rounded-2xl shadow-sm border p-8 text-center ${accepted ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${accepted ? "bg-green-100" : "bg-gray-200"}`}>
            {accepted ? (
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h1 className={`text-2xl font-bold mb-2 ${accepted ? "text-green-800" : "text-gray-700"}`}>
            {accepted ? "Order Accepted!" : "Order Declined"}
          </h1>
          <p className={`text-sm ${accepted ? "text-green-700" : "text-gray-500"}`}>
            {accepted
              ? "Thank you for accepting. Please prepare the items and dispatch within your committed delivery date."
              : "You have declined this order. The buyer will be notified."}
          </p>
        </div>

        {accepted && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mt-4">
            <h2 className="font-semibold text-gray-900 mb-3">What's next?</h2>
            <div className="space-y-3">
              {[
                "Pack and prepare the ordered items",
                "Dispatch on or before your confirmed delivery date",
                "The buyer will mark the order as received",
              ].map((text, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Questions?{" "}
          <a href="mailto:support@localcommerce.app" className="underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
