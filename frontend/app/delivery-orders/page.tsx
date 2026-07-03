"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { RecordAuditButton } from "@/components/record-audit-button";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { api } from "@/lib/api";

type Delivery = { id: number; do_number: string; delivery_date: string; status: string; sales_order_id: number; so_number: string; customer_code: string; customer_name: string; master_box_qty: number; unit_qty: number; created_by?:string;created_at?:string };
type SalesOrder = { id: number; so_number: string; customer_name: string; status: string };

export default function DeliveryOrdersPage() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ do_number: "", sales_order_id: "", delivery_date: new Date().toISOString().slice(0, 10) });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deliveryData, orderData] = await Promise.all([api<{ items: Delivery[] }>("/api/delivery-orders"), api<{ items: SalesOrder[] }>("/api/sales-orders?limit=100")]);
      setItems(deliveryData.items); setOrders(orderData.items); setMessage("");
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function assign(code: string) {
    if (!selected) { setMessage("Select an open Delivery Order before scanning a Master Box."); return; }
    try {
      await api(`/api/delivery-orders/${selected.id}/master-boxes`, { method: "POST", body: JSON.stringify({ master_box_code: code }) });
      setMessage(`${code} assigned to ${selected.do_number}.`); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  useHardwareScanner((code) => void assign(code.trim()), !!selected);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/delivery-orders", { method: "POST", body: JSON.stringify({ ...form, sales_order_id: Number(form.sales_order_id) }) });
      setCreateOpen(false); setForm({ do_number: "", sales_order_id: "", delivery_date: new Date().toISOString().slice(0, 10) }); await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  const summary = useMemo(() => ({ open: items.filter((item) => item.status === "OPEN").length, masters: items.reduce((sum, item) => sum + item.master_box_qty, 0), units: items.reduce((sum, item) => sum + item.unit_qty, 0) }), [items]);

  return (
    <ModulePage eyebrow="Logistics & Packing" title="Delivery Orders" description="Build customer shipments by scanning validated Master Boxes into a Sales Order-linked delivery." actions={<button className="primary" onClick={() => setCreateOpen(true)}>New Delivery Order</button>}>
      <div className="grid gap-4 md:grid-cols-3">{[["Open Deliveries", summary.open], ["Assigned Master Boxes", summary.masters], ["Assigned Finished Goods", summary.units.toLocaleString()]].map(([label, value]) => <div className="card" key={label}><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-blue-950">{value}</p></div>)}</div>
      {message && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-800">{message}</div>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
        <section className="card overflow-hidden p-0">
          <div className="border-b px-5 py-4"><h2 className="font-black">Delivery Schedule</h2><p className="text-sm text-slate-500">Select an open row to activate Master Box scanning.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Delivery Order", "Customer", "Sales Order", "Date", "Master Boxes", "FG Qty", "Status", "Actions"].map((label) => <th className="px-5 py-3.5" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{!loading && items.map((item) => <tr className={`cursor-pointer transition hover:bg-blue-50 ${selected?.id === item.id ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : ""}`} key={item.id} onClick={() => setSelected(item.status === "OPEN" ? item : null)}><td className="px-5 py-4 font-bold text-blue-900">{item.do_number}</td><td className="px-5 py-4"><p className="font-semibold">{item.customer_name}</p><p className="text-xs text-slate-400">{item.customer_code}</p></td><td className="px-5 py-4">{item.so_number}</td><td className="px-5 py-4 text-sm">{item.delivery_date}</td><td className="px-5 py-4 font-bold">{item.master_box_qty}</td><td className="px-5 py-4">{item.unit_qty.toLocaleString()}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{item.status}</span></td><td className="px-5 py-4"><RecordAuditButton audit={{title:item.do_number,subtitle:item.customer_name,createdBy:item.created_by,createdAt:item.created_at,fields:[{label:"Sales Order",value:item.so_number},{label:"Delivery Date",value:item.delivery_date},{label:"Master Boxes",value:item.master_box_qty},{label:"FG Qty",value:item.unit_qty.toLocaleString()}]}} label="View Info"/></td></tr>)}</tbody></table></div>
          {!loading && !items.length && <div className="py-16 text-center text-slate-500">No Delivery Orders created.</div>}
        </section>
        <aside className="card h-fit"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Scanner Assignment</p><h3 className="mt-2 text-xl font-black">{selected?.do_number ?? "Select a Delivery Order"}</h3>{selected ? <><p className="mt-2 text-sm text-slate-500">{selected.customer_name} · {selected.so_number}</p><div className="mt-5 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-8 text-center"><p className="text-3xl">▣</p><p className="mt-2 font-bold text-blue-900">Scanner active</p><p className="text-xs text-blue-600">Scan a Master Box QR</p></div></> : <p className="mt-3 text-sm leading-6 text-slate-500">Only open Delivery Orders can accept Master Boxes. Click a row to begin.</p>}</aside>
      </div>

      {createOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><form className="w-full max-w-lg rounded-3xl bg-white shadow-2xl" onSubmit={create}><header className="border-b px-6 py-5"><h2 className="text-2xl font-black">Create Delivery Order</h2></header><div className="space-y-4 p-6"><label className="block text-sm font-bold">DO Number<input className="field mt-2 text-base" placeholder="DO-2026-0001" value={form.do_number} onChange={(event) => setForm({ ...form, do_number: event.target.value })} /></label><label className="block text-sm font-bold">Sales Order<select className="field mt-2 text-base" value={form.sales_order_id} onChange={(event) => setForm({ ...form, sales_order_id: event.target.value })}><option value="">Select Sales Order</option>{orders.filter((item) => item.status !== "CANCELLED").map((item) => <option value={item.id} key={item.id}>{item.so_number} — {item.customer_name}</option>)}</select></label><label className="block text-sm font-bold">Delivery Date<input className="field mt-2 text-base" type="date" value={form.delivery_date} onChange={(event) => setForm({ ...form, delivery_date: event.target.value })} /></label></div><footer className="flex justify-end gap-3 border-t px-6 py-4"><button className="rounded-xl border px-5 py-3 font-bold" onClick={() => setCreateOpen(false)} type="button">Cancel</button><button className="primary" disabled={!form.do_number || !form.sales_order_id} type="submit">Create Delivery Order</button></footer></form></div>}
    </ModulePage>
  );
}
