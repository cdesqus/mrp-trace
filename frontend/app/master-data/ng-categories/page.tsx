"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { api } from "@/lib/api";

type NGCategory = {
  id: number;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

const emptyForm = { code: "", name: "", description: "", sort_order: "100", is_active: true };

export default function NGCategoriesPage() {
  const [items, setItems] = useState<NGCategory[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<NGCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try {
      setItems((await api<{ items: NGCategory[] }>("/api/master/ng-categories?include_inactive=true")).items);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(query)) : items;
  }, [items, search]);

  function edit(item: NGCategory) {
    setEditing(item);
    setCreateOpen(true);
    setForm({
      code: item.code,
      name: item.name,
      description: item.description ?? "",
      sort_order: String(item.sort_order),
      is_active: item.is_active,
    });
    setError("");
  }

  function reset() {
    setEditing(null);
    setForm(emptyForm);
    setCreateOpen(false);
    setError("");
  }

  function newCategory() {
    setEditing(null);
    setForm(emptyForm);
    setCreateOpen(true);
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(editing ? `/api/master/ng-categories/${editing.id}` : "/api/master/ng-categories", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          description: form.description,
          sort_order: Number(form.sort_order || 100),
          is_active: editing ? form.is_active : true,
        }),
      });
      reset();
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: NGCategory) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/master/ng-categories/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...item, is_active: !item.is_active }),
      });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <ModulePage eyebrow="Master Data" title="NG Categories" description="Maintain reject categories used by QC operators." actions={<button className="primary" onClick={newCategory}>+ New NG Category</button>}>
    {(createOpen || editing) && <section className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-wider text-blue-700">{editing ? "Edit Category" : "Create Category"}</p><h2 className="mt-1 text-xl font-black">{editing ? editing.name : "New NG Category"}</h2></div>
        <button className="rounded-xl border px-4 py-2 text-sm font-bold" onClick={reset} type="button">{editing ? "Cancel Edit" : "Cancel"}</button>
      </div>
      <form className="grid gap-3 lg:grid-cols-[180px_1fr_1fr_120px_auto]" onSubmit={save}>
        <input className="field uppercase" placeholder="CODE optional" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })}/>
        <input className="field" placeholder="Category name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/>
        <input className="field" placeholder="Description optional" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/>
        <input className="field" min="1" placeholder="Order" type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })}/>
        <button className="primary" disabled={busy || !form.name.trim()}>{busy ? "Saving..." : editing ? "Save Changes" : "Create"}</button>
      </form>
      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    </section>}

    <section className="card mt-5 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <input className="field py-2.5 text-base" placeholder="Search NG categories..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-slate-50" onClick={() => void load()} type="button">Refresh</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Code", "Category", "Description", "Order", "Created By", "Status", "Actions"].map((heading) => <th className="px-5 py-3.5" key={heading}>{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading && Array.from({ length: 4 }).map((_, index) => <tr key={index}><td className="px-5 py-5" colSpan={7}><div className="h-4 animate-pulse rounded bg-slate-100" /></td></tr>)}
            {!loading && rows.map((item) => <tr className="hover:bg-blue-50/40" key={item.id}>
              <td className="px-5 py-4 font-mono font-bold text-blue-900">{item.code}</td>
              <td className="px-5 py-4 font-semibold">{item.name}</td>
              <td className="px-5 py-4 text-sm text-slate-500">{item.description || "-"}</td>
              <td className="px-5 py-4">{item.sort_order}</td>
              <td className="px-5 py-4"><p className="text-sm font-bold">{item.created_by ?? "System"}</p><p className="text-xs text-slate-400">{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</p></td>
              <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.is_active ? "ACTIVE" : "INACTIVE"}</span></td>
              <td className="px-5 py-4"><div className="flex gap-2"><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => edit(item)} type="button">Edit</button><button className={`rounded-lg border px-3 py-2 text-xs font-bold ${item.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`} disabled={busy} onClick={() => void toggle(item)} type="button">{item.is_active ? "Deactivate" : "Reactivate"}</button></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && <div className="py-16 text-center"><h3 className="font-black">No NG categories found</h3><p className="mt-1 text-sm text-slate-500">Create categories so QC operators can reject parts consistently.</p></div>}
    </section>
  </ModulePage>;
}
