"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { RecordAuditButton } from "@/components/record-audit-button";
import { api } from "@/lib/api";

type Customer = { id: number; code: string; name: string };
type Packaging = {
  id: number; name: string; version: number;
  parts_per_small_box: number; small_boxes_per_master_box: number; parts_per_master_box: number;
};
type Product = { id: number; code: string; name: string; packaging: Packaging[] };
type SalesOrder = {
  id: number; so_number: string; customer_code: string; customer_name: string;
  order_date: string; target_delivery_date: string | null; status: string;
  line_count: number; order_qty: number; pass_qty: number;
  created_by?: string; created_at?: string; updated_by?: string; updated_at?: string;
};
type OrderLine = { product_id: string; packaging_config_id: string; quantity: string };

const statuses = ["", "OPEN", "PRODUCTION", "COMPLETED", "DELIVERY", "CLOSED", "CANCELLED"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function compactCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14) || "CUSTOMER";
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-sky-50 text-sky-700 ring-sky-600/20",
    PRODUCTION: "bg-amber-50 text-amber-700 ring-amber-600/20",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    DELIVERY: "bg-violet-50 text-violet-700 ring-violet-600/20",
    CLOSED: "bg-slate-100 text-slate-700 ring-slate-500/20",
    CANCELLED: "bg-red-50 text-red-700 ring-red-600/20",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${colors[status] ?? colors.CLOSED}`}>{status}</span>;
}

function Icon({ name, className = "h-5 w-5" }: { name: "plus" | "search" | "refresh" | "close" | "trash" | "order"; className?: string }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
    refresh: <><path d="M20 7h-6V1" /><path d="M20 7a9 9 0 1 0 1 8" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
    order: <><path d="M6 3h12v18H6Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  };
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [customSONumber, setCustomSONumber] = useState(false);
  const [form, setForm] = useState({
    so_number: "", customer_id: "", order_date: today(), target_delivery_date: "",
    lines: [{ product_id: "", packaging_config_id: "", quantity: "" }] as OrderLine[],
  });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      const response = await api<{ items: SalesOrder[] }>(`/api/sales-orders?${params}`);
      setOrders(response.items);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(loadOrders, 250);
    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  useEffect(() => {
    Promise.all([
      api<{ items: Customer[] }>("/api/master/customers"),
      api<{ items: Product[] }>("/api/master/products"),
    ]).then(([customerData, productData]) => {
      setCustomers(customerData.items);
      setProducts(productData.items);
    }).catch(() => undefined);
  }, []);

  const summary = useMemo(() => ({
    total: orders.length,
    open: orders.filter((item) => item.status === "OPEN").length,
    production: orders.filter((item) => item.status === "PRODUCTION").length,
    ordered: orders.reduce((sum, item) => sum + item.order_qty, 0),
  }), [orders]);

  function suggestedSONumber(customerId = form.customer_id, orderDate = form.order_date) {
    const customer = customers.find((item) => String(item.id) === customerId);
    const customerPart = compactCode(customer?.name || customer?.code || "CUSTOMER");
    const datePart = (orderDate || today()).replaceAll("-", "");
    const sequence = String(orders.length + 1).padStart(3, "0");
    return `SO-${customerPart}-${datePart}-${sequence}`;
  }

  function openCreateModal() {
    setCustomSONumber(false);
    const orderDate = today();
    setForm({ so_number: suggestedSONumber("", orderDate), customer_id: "", order_date: orderDate, target_delivery_date: "", lines: [{ product_id: "", packaging_config_id: "", quantity: "" }] });
    setFormError("");
    setModalOpen(true);
  }

  useEffect(() => {
    if (!modalOpen || customSONumber) return;
    const suggested = suggestedSONumber(form.customer_id, form.order_date);
    if (form.so_number !== suggested) setForm((current) => ({ ...current, so_number: suggested }));
  }, [modalOpen, customSONumber, form.customer_id, form.order_date, form.so_number, customers, orders.length]);

  function resetForm() {
    setForm({ so_number: "", customer_id: "", order_date: today(), target_delivery_date: "", lines: [{ product_id: "", packaging_config_id: "", quantity: "" }] });
    setCustomSONumber(false);
    setFormError("");
  }

  function updateLine(index: number, patch: Partial<OrderLine>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.so_number.trim() || !form.customer_id || form.lines.some((line) => !line.product_id || !line.packaging_config_id || Number(line.quantity) <= 0)) {
      setFormError("Complete the order header and every product line before saving.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      await api("/api/sales-orders", {
        method: "POST",
        body: JSON.stringify({
          so_number: form.so_number.trim(),
          customer_id: Number(form.customer_id),
          order_date: form.order_date,
          target_delivery_date: form.target_delivery_date,
          lines: form.lines.map((line) => ({
            product_id: Number(line.product_id),
            packaging_config_id: Number(line.packaging_config_id),
            quantity: Number(line.quantity),
          })),
        }),
      });
      setModalOpen(false);
      resetForm();
      await loadOrders();
    } catch (reason) {
      setFormError((reason as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModulePage
      eyebrow="Production"
      title="Sales Orders"
      description="Manage customer demand and automatically generate controlled Production Orders."
      actions={<button className="primary flex items-center gap-2" onClick={openCreateModal}><Icon name="plus" />New Sales Order</button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Orders in View", summary.total.toLocaleString(), "Current search result"],
          ["Open Orders", summary.open.toLocaleString(), "Waiting for production"],
          ["In Production", summary.production.toLocaleString(), "Currently processing"],
          ["Ordered Quantity", summary.ordered.toLocaleString(), "Finished goods"],
        ].map(([label, value, detail]) => (
          <article className="card" key={label}>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-blue-950">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{detail}</p>
          </article>
        ))}
      </div>

      <section className="card mt-5 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            {!search && <Icon name="search" className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />}
            <input className={`field py-2.5 text-base transition-[padding] ${search ? "pl-4" : "pl-11"}`} placeholder="Search SO number or customer…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className="field py-2.5 text-base lg:w-52" value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map((item) => <option key={item} value={item}>{item || "All statuses"}</option>)}
          </select>
          <button aria-label="Refresh orders" className="rounded-xl border border-slate-300 p-3 text-slate-600 transition hover:bg-slate-50" onClick={loadOrders}><Icon name="refresh" /></button>
        </div>

        {error && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>Backend unavailable.</strong> {error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>{["Sales Order", "Customer", "Order Date", "Delivery Target", "Lines", "Progress", "Status", "Actions"].map((heading) => <th className="px-5 py-3.5 font-bold" key={heading}>{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && Array.from({ length: 4 }).map((_, index) => <tr key={index}>{Array.from({ length: 8 }).map((__, cell) => <td className="px-5 py-5" key={cell}><div className="h-4 animate-pulse rounded bg-slate-100" /></td>)}</tr>)}
              {!loading && orders.map((order) => {
                const progress = order.order_qty ? Math.min(100, Math.round(order.pass_qty / order.order_qty * 100)) : 0;
                return (
                  <tr className="transition hover:bg-blue-50/40" key={order.id}>
                    <td className="px-5 py-4"><p className="font-bold text-blue-900">{order.so_number}</p><p className="text-xs text-slate-400">ID #{order.id}</p></td>
                    <td className="px-5 py-4"><p className="font-semibold">{order.customer_name}</p><p className="text-xs text-slate-400">{order.customer_code}</p></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{order.order_date}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{order.target_delivery_date ?? "Not set"}</td>
                    <td className="px-5 py-4 text-sm font-semibold">{order.line_count}</td>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div><span className="text-xs font-bold text-slate-600">{progress}%</span></div><p className="mt-1 text-xs text-slate-400">{order.pass_qty.toLocaleString()} / {order.order_qty.toLocaleString()} FG</p></td>
                    <td className="px-5 py-4"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-4"><RecordAuditButton audit={{title:order.so_number,subtitle:order.customer_name,createdBy:order.created_by,createdAt:order.created_at??order.order_date,updatedBy:order.updated_by,updatedAt:order.updated_at,fields:[{label:"Status",value:order.status},{label:"Order Qty",value:order.order_qty.toLocaleString()},{label:"Lines",value:order.line_count},{label:"Target",value:order.target_delivery_date}]}} label="View Info"/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && !orders.length && !error && <div className="flex flex-col items-center px-6 py-16 text-center"><span className="rounded-2xl bg-blue-50 p-4 text-blue-700"><Icon name="order" className="h-8 w-8" /></span><h3 className="mt-4 text-lg font-bold">No Sales Orders found</h3><p className="mt-1 text-sm text-slate-500">Create the first order or adjust your filters.</p></div>}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <form className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl" onSubmit={submit}>
            <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-6 py-5 backdrop-blur">
              <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">New Customer Demand</p><h2 className="mt-1 text-2xl font-black">Create Sales Order</h2></div>
              <button aria-label="Close" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setModalOpen(false)} type="button"><Icon name="close" /></button>
            </header>
            <div className="space-y-7 p-6">
              {formError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{formError}</div>}
              <section>
                <h3 className="font-bold">Order Information</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">Sales Order Number<input className="field mt-2 text-base" placeholder="SO-CUSTOMER-20260710-001" value={form.so_number} onChange={(event) => { setCustomSONumber(true); setForm({ ...form, so_number: event.target.value }); }} /></label>
                  <label className="text-sm font-semibold text-slate-700">Customer<select className="field mt-2 text-base" value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">Select customer</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.code} — {item.name}</option>)}</select></label>
                  <label className="text-sm font-semibold text-slate-700">Order Date<input className="field mt-2 text-base" type="date" value={form.order_date} onChange={(event) => { const order_date = event.target.value; setForm({ ...form, order_date, so_number: customSONumber ? form.so_number : suggestedSONumber(form.customer_id, order_date) }); }} /></label>
                  <label className="text-sm font-semibold text-slate-700">Target Delivery Date<input className="field mt-2 text-base" type="date" value={form.target_delivery_date} onChange={(event) => setForm({ ...form, target_delivery_date: event.target.value })} /></label>
                </div>
              </section>
              <section>
                <div className="flex items-center justify-between"><div><h3 className="font-bold">Product Lines</h3><p className="text-sm text-slate-500">Production Orders are generated automatically per line.</p></div><button className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50" type="button" onClick={() => setForm({ ...form, lines: [...form.lines, { product_id: "", packaging_config_id: "", quantity: "" }] })}>+ Add Line</button></div>
                <div className="mt-4 space-y-3">
                  {form.lines.map((line, index) => {
                    const product = products.find((item) => String(item.id) === line.product_id);
                    return (
                      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[1fr_1fr_150px_44px]" key={index}>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Product<select className="field mt-2 text-base" value={line.product_id} onChange={(event) => updateLine(index, { product_id: event.target.value, packaging_config_id: "" })}><option value="">Select product</option>{products.map((item) => <option value={item.id} key={item.id}>{item.code} — {item.name}</option>)}</select></label>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Packaging<select className="field mt-2 text-base" disabled={!product} value={line.packaging_config_id} onChange={(event) => updateLine(index, { packaging_config_id: event.target.value })}><option value="">Select configuration</option>{product?.packaging.map((item) => <option value={item.id} key={item.id}>{item.name}: {item.parts_per_small_box} FG/small, {item.small_boxes_per_master_box} small/master</option>)}</select></label>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity<input className="field mt-2 text-base" min="1" placeholder="0" type="number" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
                        <button aria-label="Remove line" className="mt-7 rounded-xl p-3 text-slate-400 hover:bg-red-50 hover:text-red-600" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) })} type="button"><Icon name="trash" /></button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
            <footer className="sticky bottom-0 flex justify-end gap-3 border-t bg-white/95 px-6 py-4 backdrop-blur"><button className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50" onClick={() => setModalOpen(false)} type="button">Cancel</button><button className="primary" disabled={submitting} type="submit">{submitting ? "Creating…" : "Create Sales Order"}</button></footer>
          </form>
        </div>
      )}
    </ModulePage>
  );
}
