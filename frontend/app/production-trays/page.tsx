"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { RecordAuditButton } from "@/components/record-audit-button";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { api } from "@/lib/api";

type ProductionOrder = {
  id: number; production_order_number: string; so_number: string;
  product_code: string; product_name: string; planned_qty: number;
  assigned_qty: number; pass_qty: number; status: string;
  created_by?: string; created_at?: string; updated_by?: string; updated_at?: string;
};
type Tray = {
  id: number; tray_code: string; status: string; active_cycle_code: string | null;
  production_order_number: string | null; planned_qty: number | null; operator_id: string | null;
};
type TrayCycle = {
  id: number; tray_cycle_code: string; tray_code: string; production_order_number: string;
  planned_qty: number; serialized_qty: number; pass_qty: number; operator_id: string;
  status: string; started_at: string;
};

function Badge({ status }: { status: string }) {
  const color = status === "AVAILABLE" || status === "COMPLETED"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : status === "IN_PROGRESS" || status === "IN_PRODUCTION"
      ? "bg-blue-50 text-blue-700 ring-blue-600/20"
      : status === "WAITING_QC"
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : "bg-slate-100 text-slate-700 ring-slate-500/20";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${color}`}>{status.replaceAll("_", " ")}</span>;
}

export default function ProductionTraysPage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [trays, setTrays] = useState<Tray[]>([]);
  const [cycles, setCycles] = useState<TrayCycle[]>([]);
  const [tab, setTab] = useState<"orders" | "trays" | "cycles">("orders");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ production_order_id: "", tray_code: "", quantity: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderData, trayData, cycleData] = await Promise.all([
        api<{ items: ProductionOrder[] }>("/api/production-orders"),
        api<{ items: Tray[] }>("/api/trays"),
        api<{ items: TrayCycle[] }>("/api/tray-cycles"),
      ]);
      setOrders(orderData.items); setTrays(trayData.items); setCycles(cycleData.items); setError("");
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useHardwareScanner((code) => { if (assignOpen) setForm((current) => ({ ...current, tray_code: code })); }, assignOpen);

  const metrics = useMemo(() => ({
    activeOrders: orders.filter((item) => item.status === "IN_PROGRESS").length,
    availableTrays: trays.filter((item) => item.status === "AVAILABLE").length,
    activeCycles: cycles.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length,
    planned: orders.reduce((sum, item) => sum + item.planned_qty, 0),
  }), [orders, trays, cycles]);

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!form.production_order_id || !form.tray_code || Number(form.quantity) <= 0) {
      setMessage("Select a Production Order, scan a tray, and enter a valid quantity.");
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/trays/assign", {
        method: "POST",
        body: JSON.stringify({
          production_order_id: Number(form.production_order_id),
          tray_code: form.tray_code.trim(),
          quantity: Number(form.quantity),
        }),
      });
      setAssignOpen(false); setForm({ production_order_id: "", tray_code: "", quantity: "" }); setMessage(""); await load();
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <ModulePage
      eyebrow="Production"
      title="Production & Trays"
      description="Control Production Orders and every reusable tray cycle from assignment through QC completion."
      actions={<button className="primary" onClick={() => setAssignOpen(true)}>Assign Tray Cycle</button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active Production Orders", metrics.activeOrders],
          ["Available Trays", metrics.availableTrays],
          ["Active Tray Cycles", metrics.activeCycles],
          ["Total Planned FG", metrics.planned.toLocaleString()],
        ].map(([label, value]) => <article className="card" key={label}><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-blue-950">{value}</p></article>)}
      </div>

      <section className="card mt-5 overflow-hidden p-0">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 pt-4 sm:flex-row sm:items-end">
          <div className="flex gap-1 overflow-x-auto">
            {([["orders", "Production Orders"], ["trays", "Tray Availability"], ["cycles", "Cycle History"]] as const).map(([value, label]) => (
              <button className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${tab === value ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-900"}`} key={value} onClick={() => setTab(value)}>{label}</button>
            ))}
          </div>
          <button className="mb-3 rounded-lg px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50" onClick={load}>Refresh data</button>
        </div>
        {error && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>Backend unavailable.</strong> {error}</div>}
        <div className="overflow-x-auto">
          {tab === "orders" && (
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Production Order", "Sales Order", "Product", "Planned", "Tray Assigned", "Passed", "Progress", "Status", "Actions"].map((item) => <th className="px-5 py-3.5" key={item}>{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && orders.map((item) => {
                  const progress = item.planned_qty ? Math.round(item.pass_qty / item.planned_qty * 100) : 0;
                  return <tr className="hover:bg-blue-50/40" key={item.id}><td className="px-5 py-4 font-bold text-blue-900">{item.production_order_number}</td><td className="px-5 py-4 text-sm">{item.so_number}</td><td className="px-5 py-4"><p className="font-semibold">{item.product_name}</p><p className="text-xs text-slate-400">{item.product_code}</p></td><td className="px-5 py-4 font-semibold">{item.planned_qty.toLocaleString()}</td><td className="px-5 py-4">{item.assigned_qty.toLocaleString()}</td><td className="px-5 py-4">{item.pass_qty.toLocaleString()}</td><td className="px-5 py-4"><div className="h-2 w-28 overflow-hidden rounded bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${Math.min(100, progress)}%` }} /></div><span className="text-xs text-slate-500">{progress}%</span></td><td className="px-5 py-4"><Badge status={item.status} /></td><td className="px-5 py-4"><RecordAuditButton audit={{title:item.production_order_number,subtitle:item.product_name,createdBy:item.created_by,createdAt:item.created_at,updatedBy:item.updated_by,updatedAt:item.updated_at,fields:[{label:"Sales Order",value:item.so_number},{label:"Status",value:item.status},{label:"Planned",value:item.planned_qty.toLocaleString()},{label:"Passed",value:item.pass_qty.toLocaleString()}]}} label="View Info"/></td></tr>;
                })}
              </tbody>
            </table>
          )}
          {tab === "trays" && (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {!loading && trays.map((item) => <article className="rounded-2xl border border-slate-200 p-5 transition hover:border-blue-300 hover:shadow-md" key={item.id}><div className="flex items-start justify-between"><div><p className="font-mono text-xl font-black">{item.tray_code}</p><p className="mt-1 text-xs text-slate-400">Permanent reusable label</p></div><Badge status={item.status} /></div>{item.active_cycle_code ? <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">{item.active_cycle_code}</p><p className="mt-1 text-slate-600">{item.production_order_number} · {item.planned_qty} FG</p><p className="text-xs text-slate-400">Operator: {item.operator_id}</p></div> : <p className="mt-6 text-sm text-emerald-700">Ready for assignment</p>}</article>)}
            </div>
          )}
          {tab === "cycles" && (
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Cycle", "Tray", "Production Order", "Qty", "Serialized", "Passed", "Operator", "Status", "Actions"].map((item) => <th className="px-5 py-3.5" key={item}>{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{!loading && cycles.map((item) => <tr className="hover:bg-blue-50/40" key={item.id}><td className="px-5 py-4 font-bold text-blue-900">{item.tray_cycle_code}</td><td className="px-5 py-4 font-mono">{item.tray_code}</td><td className="px-5 py-4">{item.production_order_number}</td><td className="px-5 py-4">{item.planned_qty}</td><td className="px-5 py-4">{item.serialized_qty}</td><td className="px-5 py-4">{item.pass_qty}</td><td className="px-5 py-4 text-sm">{item.operator_id}</td><td className="px-5 py-4"><Badge status={item.status} /></td><td className="px-5 py-4"><RecordAuditButton audit={{title:item.tray_cycle_code,subtitle:item.production_order_number,createdBy:item.operator_id,createdAt:item.started_at,fields:[{label:"Tray",value:item.tray_code},{label:"Quantity",value:item.planned_qty},{label:"Passed",value:item.pass_qty},{label:"Status",value:item.status}]}} label="View Info"/></td></tr>)}</tbody>
            </table>
          )}
        </div>
        {!loading && !error && ((tab === "orders" && !orders.length) || (tab === "trays" && !trays.length) || (tab === "cycles" && !cycles.length)) && <div className="py-14 text-center text-slate-500">No records available in this view.</div>}
      </section>

      {assignOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssignOpen(false); }}>
          <form className="w-full max-w-xl rounded-3xl bg-white shadow-2xl" onSubmit={assign}>
            <header className="border-b px-6 py-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Reusable Tray Control</p><h2 className="mt-1 text-2xl font-black">Assign New Tray Cycle</h2></header>
            <div className="space-y-4 p-6">
              {message && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{message}</div>}
              <label className="block text-sm font-bold text-slate-700">Production Order<select className="field mt-2 text-base" value={form.production_order_id} onChange={(event) => setForm({ ...form, production_order_id: event.target.value })}><option value="">Select Production Order</option>{orders.filter((item) => item.status !== "COMPLETED" && item.assigned_qty < item.planned_qty).map((item) => <option value={item.id} key={item.id}>{item.production_order_number} — {item.product_code} ({item.planned_qty - item.assigned_qty} remaining)</option>)}</select></label>
              <label className="block text-sm font-bold text-slate-700">Tray QR / ID<input autoFocus className="field mt-2 font-mono text-base" placeholder="Scan TRAY-001" value={form.tray_code} onChange={(event) => setForm({ ...form, tray_code: event.target.value })} /><span className="mt-1 block text-xs font-normal text-slate-400">Hardware scanner input is active while this dialog is open.</span></label>
              <label className="block text-sm font-bold text-slate-700">Cycle Quantity<input className="field mt-2 text-base" min="1" placeholder="Number of FG in this tray" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
            </div>
            <footer className="flex justify-end gap-3 border-t px-6 py-4"><button className="rounded-xl border border-slate-300 px-5 py-3 font-bold" onClick={() => setAssignOpen(false)} type="button">Cancel</button><button className="primary" disabled={submitting} type="submit">{submitting ? "Assigning…" : "Start Tray Cycle"}</button></footer>
          </form>
        </div>
      )}
    </ModulePage>
  );
}
