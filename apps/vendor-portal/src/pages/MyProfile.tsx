import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyProfile, updateMyProfile, formatCurrency, type VendorProfile } from "../lib/api";
import { PortalNav } from "./MyInvoices";

export default function MyProfile() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-profile", token],
    queryFn: () => getMyProfile(token!),
    enabled: !!token,
  });

  const [form, setForm] = useState<Partial<VendorProfile> | null>(null);
  useEffect(() => { if (data?.vendor) setForm(data.vendor); }, [data]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<VendorProfile>) => updateMyProfile(token!, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile", token] }),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>;
  if (error) return <div className="p-6 text-red-600">Failed to load profile.</div>;
  if (!form) return null;

  const v = data!.vendor;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">My Profile</h1>
          <PortalNav token={token!} active="profile" />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{v.name}</h2>
              <div className="text-sm text-gray-500 mt-1">Status: <span className="font-medium text-gray-900">{v.status}</span></div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{v.rating.toFixed(1)}<span className="text-amber-500"> ★</span></div>
              <div className="text-xs text-gray-500">{v.total_orders} orders</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            <Stat label="Total earned" value={formatCurrency(v.total_spent)} />
            <Stat label="Outstanding" value={formatCurrency(v.outstanding_balance)} tone="amber" />
            <Stat label="Orders" value={v.total_orders.toString()} />
          </div>
        </div>

        <Section title="Contact details">
          <Field label="Contact name" value={form.contact_name ?? ""} onChange={(v) => setForm({ ...form, contact_name: v })} />
          <Field label="Email" value={form.contact_email ?? ""} onChange={(v) => setForm({ ...form, contact_email: v })} />
          <Field label="Phone" value={form.contact_phone ?? ""} onChange={(v) => setForm({ ...form, contact_phone: v })} />
          <Field label="WhatsApp" value={form.contact_whatsapp ?? ""} onChange={(v) => setForm({ ...form, contact_whatsapp: v })} />
        </Section>

        <Section title="Address">
          <Field label="Address" value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} full />
          <Field label="City" value={form.city ?? ""} onChange={(v) => setForm({ ...form, city: v })} />
          <Field label="State" value={form.state ?? ""} onChange={(v) => setForm({ ...form, state: v })} />
          <Field label="Pincode" value={form.pincode ?? ""} onChange={(v) => setForm({ ...form, pincode: v })} />
        </Section>

        <Section title="Tax & Banking">
          <Field label="GSTIN" value={form.gstin ?? ""} onChange={(v) => setForm({ ...form, gstin: v })} />
          <Field label="PAN" value={form.pan ?? ""} onChange={(v) => setForm({ ...form, pan: v })} />
          <Field label="Bank account" value={form.bank_account ?? ""} onChange={(v) => setForm({ ...form, bank_account: v })} />
          <Field label="IFSC" value={form.bank_ifsc ?? ""} onChange={(v) => setForm({ ...form, bank_ifsc: v })} />
          <Field label="Bank name" value={form.bank_name ?? ""} onChange={(v) => setForm({ ...form, bank_name: v })} full />
        </Section>

        <div className="flex justify-end">
          <button
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
            className="px-6 py-2.5 bg-brand-500 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving..." : saveMut.isSuccess ? "Saved!" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  const cls = tone === "amber" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}
