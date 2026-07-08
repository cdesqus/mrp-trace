"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { RecordAuditButton } from "@/components/record-audit-button";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { api, apiBlob } from "@/lib/api";

type Delivery = {
  id: number;
  do_number: string;
  delivery_date: string;
  status: string;
  sales_order_id: number;
  so_number: string;
  customer_code: string;
  customer_name: string;
  master_box_qty: number;
  unit_qty: number;
  created_by?: string;
  created_at?: string;
};
type SalesOrder = { id: number; so_number: string; customer_name: string; status: string };
type AvailableMasterBox = {
  id: number;
  master_box_code: string;
  actual_small_box_qty: number;
  actual_unit_qty: number;
  packed_at: string;
  production_order_number: string;
  product_code: string;
  product_name: string;
};

export default function DeliveryOrdersPage() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [available, setAvailable] = useState<AvailableMasterBox[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [form, setForm] = useState({ do_number: "", sales_order_id: "", delivery_date: new Date().toISOString().slice(0, 10) });

  const loadAvailable = useCallback(async (delivery: Delivery | null) => {
    if (!delivery || !["OPEN", "READY"].includes(delivery.status)) {
      setAvailable([]);
      return;
    }
    const data = await api<{ items: AvailableMasterBox[] }>(`/api/delivery-orders/${delivery.id}/available-master-boxes`);
    setAvailable(data.items);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deliveryData, orderData] = await Promise.all([
        api<{ items: Delivery[] }>("/api/delivery-orders"),
        api<{ items: SalesOrder[] }>("/api/sales-orders?limit=100"),
      ]);
      setItems(deliveryData.items);
      setOrders(orderData.items);
      setSelected((current) => current ? deliveryData.items.find((item) => item.id === current.id) ?? null : current);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectDelivery(item: Delivery) {
    setSelected(item);
    setMessage("");
    try {
      await loadAvailable(item);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function assign(code: string) {
    if (!selected) {
      setMessage("Select an open Delivery Order before scanning a Master Box.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/delivery-orders/${selected.id}/master-boxes`, { method: "POST", body: JSON.stringify({ master_box_code: code }) });
      setMessage(`${code} assigned to ${selected.do_number}.`);
      setManualCode("");
      await load();
      await loadAvailable(selected);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useHardwareScanner((code) => void assign(code.trim().toUpperCase()), !!selected && ["OPEN", "READY"].includes(selected.status) && !busy);

  async function assignSuggested() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/delivery-orders/${selected.id}/auto-assign`, { method: "POST" });
      setMessage(`Available Master Boxes assigned to ${selected.do_number}.`);
      await load();
      await loadAvailable(selected);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function ship() {
    if (!selected) return;
    if (!window.confirm(`Confirm Delivery Out for ${selected.do_number}?`)) return;
    setBusy(true);
    try {
      await api(`/api/delivery-orders/${selected.id}/ship`, { method: "POST" });
      setMessage(`${selected.do_number} shipped. Delivery Out PDF is ready.`);
      setAvailable([]);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openPDF(delivery: Delivery) {
    try {
      const blob = await apiBlob(`/api/delivery-orders/${delivery.id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/delivery-orders", { method: "POST", body: JSON.stringify({ ...form, sales_order_id: Number(form.sales_order_id) }) });
      setCreateOpen(false);
      setForm({ do_number: "", sales_order_id: "", delivery_date: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  const summary = useMemo(
    () => ({
      open: items.filter((item) => item.status === "OPEN").length,
      ready: items.filter((item) => item.status === "READY").length,
      shipped: items.filter((item) => item.status === "SHIPPED").length,
      units: items.reduce((sum, item) => sum + item.unit_qty, 0),
    }),
    [items],
  );
  const availableUnits = available.reduce((sum, item) => sum + item.actual_unit_qty, 0);

  return (
    <ModulePage eyebrow="Logistics & Packing" title="Delivery Orders" description="" actions={<button className="primary" onClick={() => setCreateOpen(true)}>New Delivery Order</button>}>
      <div className="grid gap-4 md:grid-cols-4">
        {[["Open DO", summary.open], ["Ready DO", summary.ready], ["Shipped DO", summary.shipped], ["Assigned FG", summary.units.toLocaleString()]].map(([label, value]) => (
          <div className="card" key={label}>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-blue-950">{value}</p>
          </div>
        ))}
      </div>
      {message && <div className={`mt-5 rounded-xl border p-4 text-sm font-medium ${/cannot|failed|error|assign at least|unavailable/i.test(message) ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{message}</div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_420px]">
        <section className="card overflow-hidden p-0">
          <div className="border-b px-5 py-4">
            <h2 className="font-black">Delivery Schedule</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{["Delivery Order", "Customer", "Sales Order", "Date", "Master Boxes", "FG Qty", "Status", "Actions"].map((label) => <th className="px-5 py-3.5" key={label}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && items.map((item) => (
                  <tr className={`transition hover:bg-blue-50 ${selected?.id === item.id ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : ""}`} key={item.id}>
                    <td className="px-5 py-4 font-bold text-blue-900">{item.do_number}</td>
                    <td className="px-5 py-4"><p className="font-semibold">{item.customer_name}</p><p className="text-xs text-slate-400">{item.customer_code}</p></td>
                    <td className="px-5 py-4">{item.so_number}</td>
                    <td className="px-5 py-4 text-sm">{item.delivery_date}</td>
                    <td className="px-5 py-4 font-bold">{item.master_box_qty}</td>
                    <td className="px-5 py-4">{item.unit_qty.toLocaleString()}</td>
                    <td className="px-5 py-4"><StatusPill status={item.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50" onClick={() => void selectDelivery(item)}>Open</button>
                        <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" onClick={() => void openPDF(item)}>PDF</button>
                        <RecordAuditButton audit={{ title: item.do_number, subtitle: item.customer_name, createdBy: item.created_by, createdAt: item.created_at, fields: [{ label: "Sales Order", value: item.so_number }, { label: "Delivery Date", value: item.delivery_date }, { label: "Master Boxes", value: item.master_box_qty }, { label: "FG Qty", value: item.unit_qty.toLocaleString() }] }} label="Info" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !items.length && <div className="py-16 text-center text-slate-500">No Delivery Orders created.</div>}
        </section>

        <aside className="space-y-4">
          <section className="card">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Delivery Workspace</p>
            <h3 className="mt-2 text-2xl font-black">{selected?.do_number ?? "Select a Delivery Order"}</h3>
            {selected ? (
              <>
                <p className="mt-1 text-sm text-slate-500">{selected.customer_name} · {selected.so_number}</p>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-blue-50 p-3"><p className="text-xs font-bold text-blue-600">Assigned</p><p className="text-2xl font-black text-blue-950">{selected.master_box_qty}</p></div>
                  <div className="rounded-2xl bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-600">FG</p><p className="text-2xl font-black text-emerald-950">{selected.unit_qty}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Status</p><p className="text-sm font-black text-slate-900">{selected.status}</p></div>
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-black">Available Finished Goods</p>
                  <p className="mt-1 text-sm text-slate-500">{available.length} Master Boxes · {availableUnits.toLocaleString()} FG can be assigned.</p>
                  <button className="primary mt-4 w-full" disabled={busy || !available.length || selected.status === "SHIPPED"} onClick={() => void assignSuggested()}>
                    Assign Suggested Boxes
                  </button>
                </div>
                <div className="mt-4 flex gap-2">
                  <input className="field min-w-0 font-mono uppercase" placeholder="Scan/manual MB-..." value={manualCode} onChange={(event) => setManualCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void assign(manualCode.trim().toUpperCase()); }} />
                  <button className="rounded-xl bg-blue-700 px-4 font-black text-white disabled:bg-slate-300" disabled={busy || !manualCode.trim() || selected.status === "SHIPPED"} onClick={() => void assign(manualCode.trim().toUpperCase())}>Add</button>
                </div>
                <div className="mt-5 grid gap-2">
                  <button className="rounded-xl border border-blue-200 py-3 font-black text-blue-700 hover:bg-blue-50" onClick={() => void openPDF(selected)}>Open Delivery PDF</button>
                  <button className="rounded-xl bg-emerald-600 py-3 font-black text-white disabled:bg-slate-300" disabled={busy || !selected.master_box_qty || selected.status === "SHIPPED"} onClick={() => void ship()}>Confirm Delivery Out</button>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-500">Open a Delivery Order to assign ready Master Boxes and print its Delivery Out PDF.</p>
            )}
          </section>

          {selected && (
            <section className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-black">Suggested Master Boxes</h3>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{available.length} ready</span>
              </div>
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                {available.map((box) => (
                  <article className="rounded-xl border border-slate-200 p-3" key={box.id}>
                    <p className="font-mono text-sm font-black text-blue-950">{box.master_box_code}</p>
                    <p className="mt-1 text-xs text-slate-500">{box.product_code} · {box.production_order_number}</p>
                    <p className="mt-2 text-sm font-black">{box.actual_small_box_qty} Small Boxes · {box.actual_unit_qty} FG</p>
                  </article>
                ))}
                {!available.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No unassigned Master Boxes for this Sales Order.</p>}
              </div>
            </section>
          )}
        </aside>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <form className="w-full max-w-lg rounded-3xl bg-white shadow-2xl" onSubmit={create}>
            <header className="border-b px-6 py-5"><h2 className="text-2xl font-black">Create Delivery Order</h2></header>
            <div className="space-y-4 p-6">
              <label className="block text-sm font-bold">DO Number<input className="field mt-2 text-base" placeholder="DO-2026-0001" value={form.do_number} onChange={(event) => setForm({ ...form, do_number: event.target.value })} /></label>
              <label className="block text-sm font-bold">Sales Order<select className="field mt-2 text-base" value={form.sales_order_id} onChange={(event) => setForm({ ...form, sales_order_id: event.target.value })}><option value="">Select Sales Order</option>{orders.filter((item) => item.status !== "CANCELLED").map((item) => <option value={item.id} key={item.id}>{item.so_number} — {item.customer_name}</option>)}</select></label>
              <label className="block text-sm font-bold">Delivery Date<input className="field mt-2 text-base" type="date" value={form.delivery_date} onChange={(event) => setForm({ ...form, delivery_date: event.target.value })} /></label>
            </div>
            <footer className="flex justify-end gap-3 border-t px-6 py-4"><button className="rounded-xl border px-5 py-3 font-bold" onClick={() => setCreateOpen(false)} type="button">Cancel</button><button className="primary" disabled={!form.do_number || !form.sales_order_id} type="submit">Create Delivery Order</button></footer>
          </form>
        </div>
      )}
    </ModulePage>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = status === "SHIPPED" ? "bg-emerald-50 text-emerald-700" : status === "READY" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${color}`}>{status}</span>;
}
