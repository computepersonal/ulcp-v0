import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMyInvoices, formatCurrency, formatDate } from "../lib/api";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  partially_paid: "bg-indigo-100 text-indigo-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  disputed: "bg-rose-100 text-rose-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function MyInvoices() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-invoices", token],
    queryFn: () => getMyInvoices(token!),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (error) return <div className="p-6 text-red-600">Failed to load invoices.</div>;

  const bills = data?.bills ?? [];
  const totals = data?.totals ?? { total_billed: 0, total_paid: 0, outstanding: 0 };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">My Invoices</h1>
          <PortalNav token={token!} active="invoices" />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total billed" value={formatCurrency(totals.total_billed)} />
          <Stat label="Total paid" value={formatCurrency(totals.total_paid)} tone="green" />
          <Stat label="Outstanding" value={formatCurrency(totals.outstanding)} tone="amber" />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">Bill date</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bills.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No invoices yet.</td></tr>
              )}
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{b.bill_number}<div className="text-[10px] text-gray-400">{b.internal_ref}</div></td>
                  <td className="px-4 py-3">{formatDate(b.bill_date)}</td>
                  <td className="px-4 py-3">{formatDate(b.due_date)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(b.total_amount)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatCurrency(b.amount_paid)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(b.amount_due)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[b.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {b.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  const cls = tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

export function PortalNav({ token, active }: { token: string; active: "profile" | "invoices" | "catalog" }) {
  const link = (key: string, label: string, path: string) => (
    <Link to={path} className={`px-3 py-1.5 rounded-lg text-sm ${active === key ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</Link>
  );
  return (
    <nav className="flex gap-1">
      {link("profile", "Profile", `/vendor/portal/${token}`)}
      {link("invoices", "Invoices", `/vendor/portal/${token}/invoices`)}
      {link("catalog", "Catalog", `/vendor/portal/${token}/catalog`)}
    </nav>
  );
}
