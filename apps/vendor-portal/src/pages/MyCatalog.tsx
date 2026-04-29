import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyCatalog, addCatalogItem, updateCatalogItem, deleteCatalogItem, formatCurrency, type CatalogItem } from "../lib/api";
import { PortalNav } from "./MyInvoices";

export default function MyCatalog() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-catalog", token],
    queryFn: () => getMyCatalog(token!),
    enabled: !!token,
  });

  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const updateMut = useMutation({
    mutationFn: (item: CatalogItem) => updateCatalogItem(token!, item.id, {
      unit_price: item.unit_price,
      min_order_quantity: item.min_order_quantity,
      lead_time_days: item.lead_time_days,
      is_available: item.is_available,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["my-catalog", token] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCatalogItem(token!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-catalog", token] }),
  });

  if (isLoading) return <Spinner />;
  if (error) return <div className="p-6 text-red-600">Failed to load catalog.</div>;

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">My Catalog</h1>
          <PortalNav token={token!} active="catalog" />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-600">{items.length} items in your catalog</p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600">+ Add item</button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Ingredient</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Min order</th>
                <th className="px-4 py-3 text-right">Lead time</th>
                <th className="px-4 py-3 text-center">Available</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No items yet. Add your first ingredient.</td></tr>
              )}
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-3 font-medium">{it.ingredient_name}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(it.unit_price)} / {it.unit}</td>
                  <td className="px-4 py-3 text-right">{it.min_order_quantity} {it.unit}</td>
                  <td className="px-4 py-3 text-right">{it.lead_time_days}d</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs ${it.is_available ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {it.is_available ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => setEditing(it)} className="text-brand-600 hover:underline text-xs">Edit</button>
                    <button onClick={() => { if (confirm(`Delete ${it.ingredient_name}?`)) deleteMut.mutate(it.id); }} className="text-red-600 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditModal item={editing} onClose={() => setEditing(null)} onSave={(it) => updateMut.mutate(it)} saving={updateMut.isPending} />
      )}
      {showAdd && (
        <AddModal token={token!} onClose={() => setShowAdd(false)} onAdded={() => { void qc.invalidateQueries({ queryKey: ["my-catalog", token] }); setShowAdd(false); }} />
      )}
    </div>
  );
}

function EditModal({ item, onClose, onSave, saving }: { item: CatalogItem; onClose: () => void; onSave: (it: CatalogItem) => void; saving: boolean }) {
  const [draft, setDraft] = useState(item);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-4">Edit {item.ingredient_name}</h3>
        <div className="space-y-3">
          <Field label="Unit price (paise)" type="number" value={draft.unit_price} onChange={(v) => setDraft({ ...draft, unit_price: parseInt(v, 10) || 0 })} />
          <Field label="Min order quantity" type="number" value={draft.min_order_quantity} onChange={(v) => setDraft({ ...draft, min_order_quantity: parseFloat(v) || 0 })} />
          <Field label="Lead time (days)" type="number" value={draft.lead_time_days} onChange={(v) => setDraft({ ...draft, lead_time_days: parseInt(v, 10) || 0 })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.is_available} onChange={(e) => setDraft({ ...draft, is_available: e.target.checked })} />
            Currently available
          </label>
        </div>
        <div className="flex gap-2 mt-6 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => onSave(draft)} disabled={saving} className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function AddModal({ token, onClose, onAdded }: { token: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    ingredient_id: "", ingredient_name: "", unit: "kg",
    unit_price: 0, min_order_quantity: 1, lead_time_days: 1, is_available: true,
  });
  const addMut = useMutation({
    mutationFn: () => addCatalogItem(token, form),
    onSuccess: onAdded,
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-4">Add catalog item</h3>
        <div className="space-y-3">
          <Field label="Ingredient ID (from buyer)" value={form.ingredient_id} onChange={(v) => setForm({ ...form, ingredient_id: v })} />
          <Field label="Ingredient name" value={form.ingredient_name} onChange={(v) => setForm({ ...form, ingredient_name: v })} />
          <Field label="Unit (kg, l, pcs)" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
          <Field label="Unit price (paise)" type="number" value={form.unit_price} onChange={(v) => setForm({ ...form, unit_price: parseInt(v, 10) || 0 })} />
          <Field label="Min order quantity" type="number" value={form.min_order_quantity} onChange={(v) => setForm({ ...form, min_order_quantity: parseFloat(v) || 0 })} />
          <Field label="Lead time (days)" type="number" value={form.lead_time_days} onChange={(v) => setForm({ ...form, lead_time_days: parseInt(v, 10) || 0 })} />
        </div>
        {addMut.isError && <p className="text-red-600 text-sm mt-2">{(addMut.error as Error).message}</p>}
        <div className="flex gap-2 mt-6 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => addMut.mutate()} disabled={addMut.isPending || !form.ingredient_id || !form.ingredient_name} className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm disabled:opacity-50">{addMut.isPending ? "Adding..." : "Add"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string | number; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
    </label>
  );
}

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>;
}
