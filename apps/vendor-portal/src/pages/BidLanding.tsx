import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBidRequest, formatDate, timeUntil } from "../lib/api";
import StatusMessage from "../components/StatusMessage";

export default function BidLanding() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["bid-request", token],
    queryFn: () => getBidRequest(token!),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    const msg = (error as Error).message;
    if (msg.includes("expired")) return <StatusMessage type="error" title="Bid Request Expired" message="This bid request is no longer accepting submissions. Please contact the business for more information." />;
    if (msg.includes("already submitted")) return <StatusMessage type="info" title="Already Submitted" message="You have already submitted a bid for this request. You will be notified when a decision is made." />;
    return <StatusMessage type="error" title="Invalid Link" message="This link is invalid or has been used. Please contact the business." />;
  }

  if (!data) return null;
  const { bid_request } = data;

  const recurrenceLabels: Record<string, string> = {
    one_time: "One-time order",
    daily: "Daily recurring order",
    weekly: "Weekly recurring order",
    fortnightly: "Fortnightly recurring order",
    monthly: "Monthly recurring order",
    on_demand: "On-demand order",
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-lg">P</div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Procurement Request</p>
              <h1 className="text-xl font-bold text-gray-900">{bid_request.title}</h1>
            </div>
          </div>

          {bid_request.description && (
            <p className="text-gray-600 text-sm mb-4">{bid_request.description}</p>
          )}

          <div className="flex flex-wrap gap-3 text-sm">
            {bid_request.bid_close_at && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full font-medium border border-amber-200">
                ⏱ {timeUntil(bid_request.bid_close_at)} · Closes {formatDate(bid_request.bid_close_at)}
              </span>
            )}
            {bid_request.recurrence !== "one_time" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-600 rounded-full font-medium border border-brand-100">
                🔁 {recurrenceLabels[bid_request.recurrence] ?? bid_request.recurrence}
              </span>
            )}
          </div>
        </div>

        {/* Items needed */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Items Needed</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Ingredient</th>
                  <th className="pb-2 font-medium text-right">Quantity</th>
                  <th className="pb-2 font-medium text-right">Unit</th>
                  <th className="pb-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bid_request.items.map((item, i) => (
                  <tr key={i} className="py-2">
                    <td className="py-2.5 font-medium text-gray-900">{item.ingredient_name}</td>
                    <td className="py-2.5 text-right font-mono text-gray-700">{item.quantity}</td>
                    <td className="py-2.5 text-right text-gray-500">{item.unit}</td>
                    <td className="py-2.5 text-gray-500 text-xs">{item.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delivery */}
        {(bid_request.delivery_location || bid_request.delivery_notes) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-2">Delivery</h2>
            {bid_request.delivery_location && <p className="text-sm text-gray-700">📍 {bid_request.delivery_location}</p>}
            {bid_request.delivery_notes && <p className="text-sm text-gray-500 mt-1">{bid_request.delivery_notes}</p>}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => navigate(`/vendor/bid/${token}/submit`, { state: { bid_request } })}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-colors text-base shadow-sm"
        >
          Submit Your Bid →
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">Your response is confidential and only visible to the buyer</p>
      </div>
    </div>
  );
}
