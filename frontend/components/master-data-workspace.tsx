"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { api } from "@/lib/api";

type Mode = "customers" | "products" | "packaging";
type AuditFields = { created_at?: string; updated_at?: string; created_by?: string; updated_by?: string };
type Customer = AuditFields & { id: number; code: string; name: string; is_active: boolean };
type Product = AuditFields & { id: number; code: string; name: string; is_active: boolean; qc_image_data_url?: string | null };
type Packaging = AuditFields & {
  id: number; product_id: number; product_code: string; product_name: string; name: string;
  version: number; parts_per_small_box: number; small_boxes_per_master_box: number;
  parts_per_master_box: number; is_active: boolean;
};
type MasterItem = Customer | Product | Packaging;

const copy = {
  customers: { title: "Customers", description: "Maintain customer identities used by Sales and Delivery Orders.", button: "New Customer" },
  products: { title: "Products", description: "Maintain finished-good products, QC references, and ownership history.", button: "New Product" },
  packaging: { title: "Packaging Configurations", description: "Version box capacities without changing historical orders.", button: "New Configuration" },
};
const emptyForm = { code: "", name: "", product_id: "", parts_per_small_box: "", small_boxes_per_master_box: "" };

export function MasterDataWorkspace({ mode }: { mode: Mode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packaging, setPackaging] = useState<Packaging[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [viewing, setViewing] = useState<MasterItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [imageProduct, setImageProduct] = useState<Product | null>(null);
  const [imageSaving, setImageSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "customers") setCustomers((await api<{ items: Customer[] }>("/api/master/customers?include_inactive=true")).items);
      if (mode === "products") setProducts((await api<{ items: Product[] }>("/api/master/products?include_inactive=true")).items);
      if (mode === "packaging") {
        const [configs, productData] = await Promise.all([
          api<{ items: Packaging[] }>("/api/master/packaging-configs"),
          api<{ items: Product[] }>("/api/master/products"),
        ]);
        setPackaging(configs.items);
        setProducts(productData.items);
      }
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const source: MasterItem[] = mode === "customers" ? customers : mode === "products" ? products : packaging;
    const query = search.trim().toLowerCase();
    return query ? source.filter((item) => JSON.stringify(item).toLowerCase().includes(query)) : source;
  }, [mode, customers, products, packaging, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setEditorOpen(true);
  }
  function openEdit(item: MasterItem) {
    setEditing(item);
    setForm({
      code: "code" in item ? item.code : "",
      name: item.name,
      product_id: "product_id" in item ? String(item.product_id) : "",
      parts_per_small_box: "parts_per_small_box" in item ? String(item.parts_per_small_box) : "",
      small_boxes_per_master_box: "small_boxes_per_master_box" in item ? String(item.small_boxes_per_master_box) : "",
    });
    setFormError("");
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (mode === "customers") await api(editing ? `/api/master/customers/${editing.id}` : "/api/master/customers", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ code: form.code, name: form.name, is_active: editing?.is_active ?? true }),
      });
      if (mode === "products") await api(editing ? `/api/master/products/${editing.id}` : "/api/master/products", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ code: form.code, name: form.name, is_active: editing?.is_active ?? true }),
      });
      if (mode === "packaging") await api(editing ? `/api/master/packaging-configs/${editing.id}` : "/api/master/packaging-configs", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          product_id: Number(form.product_id), name: form.name,
          parts_per_small_box: Number(form.parts_per_small_box),
          small_boxes_per_master_box: Number(form.small_boxes_per_master_box),
        }),
      });
      closeEditor();
      await load();
    } catch (reason) {
      setFormError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: MasterItem) {
    try {
      if (mode === "customers") await api(`/api/master/customers/${item.id}`, { method: "PATCH", body: JSON.stringify({ code: "code" in item ? item.code : "", name: item.name, is_active: !item.is_active }) });
      if (mode === "products") await api(`/api/master/products/${item.id}`, { method: "PATCH", body: JSON.stringify({ code: "code" in item ? item.code : "", name: item.name, is_active: !item.is_active }) });
      if (mode === "packaging") await api(`/api/master/packaging-configs/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function saveQCImage(imageDataURL: string) {
    if (!imageProduct) return;
    setImageSaving(true);
    try {
      await api(`/api/master/products/${imageProduct.id}/qc-image`, { method: "PUT", body: JSON.stringify({ image_data_url: imageDataURL }) });
      setImageProduct((current) => current ? { ...current, qc_image_data_url: imageDataURL || null } : null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setImageSaving(false);
    }
  }
  function selectQCImage(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("QC image must be JPEG, PNG, or WebP.");
    if (file.size > 5 * 1024 * 1024) return setError("QC image must not exceed 5 MB.");
    const reader = new FileReader();
    reader.onload = () => void saveQCImage(String(reader.result));
    reader.onerror = () => setError("The selected QC image could not be read.");
    reader.readAsDataURL(file);
  }

  const activeCount = rows.filter((item) => item.is_active).length;
  const configTotal = Number(form.parts_per_small_box || 0) * Number(form.small_boxes_per_master_box || 0);

  return (
    <ModulePage eyebrow="Master Data" title={copy[mode].title} description={copy[mode].description} actions={<button className="primary" onClick={openCreate}>+ {copy[mode].button}</button>}>
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Total Records", rows.length], ["Active", activeCount], ["Inactive", rows.length - activeCount]].map(([label, value]) => (
          <article className="card" key={label}><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-blue-950">{value}</p></article>
        ))}
      </div>
      <section className="card mt-5 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <input className="field py-2.5 text-base" placeholder={`Search ${copy[mode].title.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-slate-50" onClick={() => void load()}>Refresh</button>
        </div>
        {error && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              {mode === "customers" && <tr>{["Customer Code", "Customer Name", "Created By", "Status", "Actions"].map((item) => <th className="px-5 py-3.5" key={item}>{item}</th>)}</tr>}
              {mode === "products" && <tr>{["Product Code", "Product Name", "QC Reference", "Created By", "Status", "Actions"].map((item) => <th className="px-5 py-3.5" key={item}>{item}</th>)}</tr>}
              {mode === "packaging" && <tr>{["Product", "Configuration", "Version", "Small Box", "Master Box", "Created By", "Status", "Actions"].map((item) => <th className="px-5 py-3.5" key={item}>{item}</th>)}</tr>}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && Array.from({ length: 4 }).map((_, index) => <tr key={index}><td className="px-5 py-5" colSpan={8}><div className="h-4 animate-pulse rounded bg-slate-100" /></td></tr>)}
              {!loading && mode === "customers" && (rows as Customer[]).map((item) => <tr className="hover:bg-blue-50/40" key={item.id}><td className="px-5 py-4 font-mono font-bold text-blue-900">{item.code}</td><td className="px-5 py-4 font-semibold">{item.name}</td><AuditCell item={item}/><StatusCell active={item.is_active}/><ActionCell item={item} onEdit={() => openEdit(item)} onToggle={() => void toggle(item)} onView={() => setViewing(item)}/></tr>)}
              {!loading && mode === "products" && (rows as Product[]).map((item) => <tr className="hover:bg-blue-50/40" key={item.id}><td className="px-5 py-4 font-mono font-bold text-blue-900">{item.code}</td><td className="px-5 py-4 font-semibold">{item.name}</td><td className="px-5 py-4">{item.qc_image_data_url ? <button className="flex items-center gap-2 rounded-xl border bg-blue-50 p-2 text-xs font-black text-blue-700" onClick={() => setImageProduct(item)}><img alt="" className="h-10 w-14 rounded object-cover" src={item.qc_image_data_url}/>View / Replace</button> : <button className="rounded-xl border border-dashed px-3 py-2 text-xs font-bold text-slate-500" onClick={() => setImageProduct(item)}>+ Upload Image</button>}</td><AuditCell item={item}/><StatusCell active={item.is_active}/><ActionCell item={item} onEdit={() => openEdit(item)} onToggle={() => void toggle(item)} onView={() => setViewing(item)}/></tr>)}
              {!loading && mode === "packaging" && (rows as Packaging[]).map((item) => <tr className="hover:bg-blue-50/40" key={item.id}><td className="px-5 py-4"><p className="font-semibold">{item.product_name}</p><p className="text-xs text-slate-400">{item.product_code}</p></td><td className="px-5 py-4 font-bold">{item.name}</td><td className="px-5 py-4">v{item.version}</td><td className="px-5 py-4">{item.parts_per_small_box} FG</td><td className="px-5 py-4">{item.small_boxes_per_master_box} boxes · {item.parts_per_master_box} FG</td><AuditCell item={item}/><StatusCell active={item.is_active}/><ActionCell item={item} onEdit={() => openEdit(item)} onToggle={() => void toggle(item)} onView={() => setViewing(item)}/></tr>)}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length && <div className="py-16 text-center"><h3 className="font-black">No master data found</h3><p className="mt-1 text-sm text-slate-500">Create the first record to use it in operational modules.</p></div>}
      </section>

      {editorOpen && <EditorModal mode={mode} editing={editing} form={form} setForm={setForm} products={products} configTotal={configTotal} error={formError} saving={saving} onClose={closeEditor} onSubmit={save}/>}
      {viewing && <ViewModal item={viewing} onClose={() => setViewing(null)} onEdit={() => { const item = viewing; setViewing(null); openEdit(item); }}/>}
      {imageProduct && <ImageModal product={imageProduct} saving={imageSaving} onClose={() => setImageProduct(null)} onFile={selectQCImage} onRemove={() => void saveQCImage("")}/>}
    </ModulePage>
  );
}

function EditorModal({ mode, editing, form, setForm, products, configTotal, error, saving, onClose, onSubmit }: {
  mode: Mode; editing: MasterItem | null; form: typeof emptyForm; setForm: (value: typeof emptyForm) => void;
  products: Product[]; configTotal: number; error: string; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent) => void;
}) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="w-full max-w-xl rounded-3xl bg-white shadow-2xl" onSubmit={onSubmit}><header className="border-b px-6 py-5"><p className="text-xs font-black uppercase tracking-wider text-blue-700">Master Data</p><h2 className="mt-1 text-2xl font-black">{editing ? "Edit Record" : "Create Record"}</h2>{editing && mode === "packaging" && <p className="mt-1 text-sm text-slate-500">Saving creates a new version to protect historical orders.</p>}</header><div className="space-y-4 p-6">{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{mode !== "packaging" ? <><Field label={mode === "customers" ? "Customer Code" : "Product Code"}><input autoFocus className="field mt-2 uppercase" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })}/></Field><Field label={mode === "customers" ? "Customer Name" : "Product Name"}><input className="field mt-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field></> : <><Field label="Product"><select autoFocus className="field mt-2" value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })}><option value="">Select product</option>{products.filter((item) => item.is_active || String(item.id) === form.product_id).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></Field><Field label="Configuration Name"><input className="field mt-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><div className="grid grid-cols-2 gap-4"><Field label="FG per Small Box"><input className="field mt-2" min="1" type="number" value={form.parts_per_small_box} onChange={(event) => setForm({ ...form, parts_per_small_box: event.target.value })}/></Field><Field label="Small Boxes per Master"><input className="field mt-2" min="1" type="number" value={form.small_boxes_per_master_box} onChange={(event) => setForm({ ...form, small_boxes_per_master_box: event.target.value })}/></Field></div><div className="rounded-xl bg-blue-50 p-4"><p className="text-xs font-black uppercase text-blue-600">Master Capacity</p><p className="mt-1 text-2xl font-black text-blue-950">{configTotal} FG</p></div></>}</div><footer className="flex justify-end gap-3 border-t p-4"><button className="rounded-xl border px-5 py-3 font-bold" type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving || !form.name || (mode !== "packaging" ? !form.code : !form.product_id || configTotal <= 0)}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Record"}</button></footer></form></div>;
}

function ViewModal({ item, onClose, onEdit }: { item: MasterItem; onClose: () => void; onEdit: () => void }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"><header className="border-b p-6"><p className="text-xs font-black uppercase tracking-wider text-blue-700">Record Details</p><h2 className="mt-1 text-2xl font-black">{"code" in item ? item.code : `${item.product_code} · ${item.name}`}</h2></header><dl className="grid grid-cols-2 gap-5 p-6 text-sm"><Detail label="Name" value={item.name}/><Detail label="Status" value={item.is_active ? "Active" : "Inactive"}/>{"parts_per_small_box" in item && <><Detail label="Version" value={`v${item.version}`}/><Detail label="Small Box" value={`${item.parts_per_small_box} FG`}/><Detail label="Master Box" value={`${item.small_boxes_per_master_box} boxes`}/></>}<Detail label="Created By" value={item.created_by ?? "System"}/><Detail label="Created At" value={formatDate(item.created_at)}/><Detail label="Last Updated By" value={item.updated_by ?? item.created_by ?? "System"}/><Detail label="Last Updated" value={formatDate(item.updated_at)}/></dl><footer className="flex justify-end gap-3 border-t p-4"><button className="rounded-xl border px-5 py-3 font-bold" onClick={onClose}>Close</button><button className="primary" onClick={onEdit}>Edit Record</button></footer></section></div>;
}

function ImageModal({ product, saving, onClose, onFile, onRemove }: { product: Product; saving: boolean; onClose: () => void; onFile: (file?: File) => void; onRemove: () => void }) {
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><section className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex justify-between border-b p-6"><div><p className="text-xs font-black uppercase tracking-wider text-blue-700">QC Reference Image</p><h2 className="mt-1 text-2xl font-black">{product.code} · {product.name}</h2></div><button className="rounded-xl p-2 text-xl" onClick={onClose}>×</button></header><div className="bg-slate-100 p-6">{product.qc_image_data_url ? <img alt={`QC guide for ${product.name}`} className="mx-auto max-h-[55vh] w-full rounded-2xl bg-white object-contain" src={product.qc_image_data_url}/> : <div className="flex min-h-64 items-center justify-center rounded-2xl border-2 border-dashed bg-white text-slate-500">No QC image uploaded</div>}</div><footer className="flex justify-end gap-3 border-t p-4">{product.qc_image_data_url && <button className="rounded-xl px-4 py-3 font-bold text-red-600" disabled={saving} onClick={onRemove}>Remove Image</button>}<label className="primary cursor-pointer">{saving ? "Saving…" : product.qc_image_data_url ? "Replace Image" : "Upload Image"}<input accept="image/jpeg,image/png,image/webp" className="hidden" type="file" onChange={(event) => onFile(event.target.files?.[0])}/></label></footer></section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-bold">{label}{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 font-bold text-slate-800">{value}</dd></div>; }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : "—"; }
function AuditCell({ item }: { item: AuditFields }) { return <td className="px-5 py-4"><p className="text-sm font-bold">{item.created_by ?? "System"}</p><p className="text-xs text-slate-400">{formatDate(item.created_at)}</p></td>; }
function StatusCell({ active }: { active: boolean }) { return <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{active ? "ACTIVE" : "INACTIVE"}</span></td>; }
function ActionCell({ item, onView, onEdit, onToggle }: { item: MasterItem; onView: () => void; onEdit: () => void; onToggle: () => void }) {
  return <td className="px-5 py-4"><div className="flex items-center gap-2"><IconAction icon="view" label="View record" tone="blue" onClick={onView}/><IconAction icon="edit" label="Edit record" tone="slate" onClick={onEdit}/><IconAction icon={item.is_active?"deactivate":"activate"} label={item.is_active?"Deactivate record":"Reactivate record"} tone={item.is_active?"red":"green"} onClick={onToggle}/></div></td>;
}
function IconAction({icon,label,tone,onClick}:{icon:"view"|"edit"|"deactivate"|"activate";label:string;tone:"blue"|"slate"|"red"|"green";onClick:()=>void}) {
  const color={blue:"border-blue-200 text-blue-700 hover:bg-blue-50",slate:"border-slate-300 text-slate-700 hover:bg-slate-50",red:"border-red-200 text-red-600 hover:bg-red-50",green:"border-emerald-200 text-emerald-700 hover:bg-emerald-50"}[tone];
  const path={view:<><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,edit:<><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 7 3.5 3.5"/></>,deactivate:<><circle cx="12" cy="12" r="9"/><path d="m6 18 12-12"/></>,activate:<><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>}[icon];
  return <button aria-label={label} className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-white shadow-sm ${color}`} title={label} onClick={onClick}><svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">{path}</svg></button>;
}
