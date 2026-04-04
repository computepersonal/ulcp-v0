import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getDirectOrder, respondToDirectOrder, formatCurrency, formatDate } from "../lib/api";
import StatusMessage from "../components/StatusMessage";

export default function DirectOrderView() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0]!;
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["direct-order", token],
    queryFn: () => getDirectOrder(token!),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => respondToDirectOrder(token!, true, deliveryDate),
    onSuccess: () => {
      navigate(`/vendor/order/${token}/done`, {
        state: { result: "accepted", vendor: data?.vendor },
        replace: true,
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => respondToDirectOrder(token!, false, undefined, declineReason || undefined),
    onSuccess: () => {
      navigate(`/vendor/order/${token}/done`, {
        state: { result: "declined" },
        replace: true,
      });
    },
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
    if (msg.includes("expired")) return <StatusMessage type="error" title="Order Link Expired" message="This order link is no longer valid. Please contact the buyer." />;
    if (msg.includes("already")) return <StatusMessage type="info" title="Already Responded" message="You have already responded to this order." />;
    return <StatusMessage type="error" title="Invalid Link" message="This link is invalid or has been used. Please contact the buyer." />;
  }

  if (!data) return null;
  const { order, vendor } = data;

  const isPending = order.status === "pending";

  const paymentLabels: Record<string, string> = {
    advance: "Advance payment",
    on_delivery: "On delivery",
    net_7: "Net 7 days",
    net_15: "Net 15 days",
    net_30: "Net 30 days",
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-lg">P</div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Direct Purchase Order</p>
              <h1 className="text-xl font-bold text-gray-900">Order for {vendor.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2.5 py-1 rounded-full font-medium border ${
              order.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
              order.status === "confirmed" ? "bg-blue-50 text-blue-700 border-blue-200" :
              order.status === "dispatched" ? "bg-purple-50 text-purple-700 border-purple-200" :
              order.status === "delivered" ? "bg-green-50 text-green-700 border-green-200" :
              "bg-gray-100 text-gray-600 border-gray-200"
            }`}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
            <span className="px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600 border border-gray-200">
              {paymentLabels[order.payment_terms] ?? order.payment_terms}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Items Ordered</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                  <th className="pb-2 font-medium text-right">Unit</th>
                  <th className="pb-2 font-medium text-right">Unit Price</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-gray-900">{item.ingredient_name}</td>
                    <td className="py-2.5 text-right font-mono text-gray-700">{item.quantity}</td>
                    <td className="py-2.5 text-right text-gray-500">{item.unit}</td>
                    <td className="py-2.5 text-right font-mono text-gray-700">{formatCurrency(item.unit_price)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(item.unit_price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={4} className="pt-3 text-right font-semibold text-gray-700">Grand Total</td>
                  <td className="pt-3 text-right font-mono font-bold text-brand-600 text-base">{formatCurrency(order.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Delivery info */}
        {(order.expected_delivery_date || order.delivery_notes) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-2">Delivery Details</h2>
            {order.expected_delivery_date && (
              <p className="text-sm text-gray-700">
                Expected by: <span className="font-semibold">{formatDate(order.expected_delivery_date)}</span>
              </p>
            )}
            {order.delivery_notes && (
              <p className="text-sm text-gray-500 mt-1">{order.delivery_notes}</p>
            )}
          </div>
        )}

        {/* Response section — only when pending */}
        {isPending && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-4">Confirm Delivery Date</h2>
            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1 block">When can you deliver?</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {acceptMutation.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">
                {(acceptMutation.error as Error).message}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDecline(true)}
                disabled={acceptMutation.isPending}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Decline
              </button>
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending || !deliveryDate}
                className="flex-2 flex-grow py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm"
              >
                {acceptMutation.isPending ? "Accepting..." : "Accept Order →"}
              </button>
            </div>
          </div>
        )}

        {/* Status banner for non-pending */}
        {!isPending && (
          <div className={`rounded-2xl p-4 text-center text-sm font-medium ${
            order.status === "confirmed" ? "bg-blue-50 text-blue-700 border border-blue-200" :
            order.status === "dispatched" ? "bg-purple-50 text-purple-700 border border-purple-200" :
            order.status === "delivered" ? "bg-green-50 text-green-700 border border-green-200" :
            "bg-gray-100 text-gray-600 border border-gray-200"
          }`}>
            {order.status === "confirmed" && "You've accepted this order. Please prepare and dispatch it."}
            {order.status === "dispatched" && "Order has been marked as dispatched."}
            {order.status === "delivered" && "Order successfully delivered. Thank you!"}
            {order.status === "cancelled" && "This order has been cancelled."}
          </div>
        )}

        {/* Decline modal */}
        {showDecline && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Decline Order?</h3>
              <p className="text-sm text-gray-600 mb-3">
                Please let the buyer know why you're declining this order.
              </p>
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none mb-3"
                placeholder="Out of stock, unable to deliver to location..."
              />
              {declineMutation.error && (
                <p className="text-sm text-red-600 mb-3">{(declineMutation.error as Error).message}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDecline(false)}
                  disabled={declineMutation.isPending}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowDecline(false); declineMutation.mutate(); }}
                  disabled={declineMutation.isPending}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
                >
                  {declineMutation.isPending ? "Declining..." : "Decline"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
