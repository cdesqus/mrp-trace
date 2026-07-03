"use client";

import { useState } from "react";
import { ModulePage } from "@/components/module-page";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { api } from "@/lib/api";

type QCTraceEvent = {
  id: number;
  inspection_type: "INITIAL" | "REWORK";
  result: "PASS" | "REJECT";
  reason: string | null;
  rework_code: string | null;
  operator_id: string;
  station_id: string;
  inspected_at: string;
};

type Trace = {
  serial_number: string;
  status: string;
  sales_order: string;
  production_order: string;
  product: string;
  tray_cycle: string;
  qc_session?: string;
  original_tray?: string;
  laser_carrier_tray?: string;
  laser_batch?: string | null;
  rework_code: string | null;
  previously_ng: boolean;
  qc_attempts: number;
  qc_history: QCTraceEvent[];
  small_box: string | null;
  master_box: string | null;
  delivery_order: string | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

export default function TraceabilityPage() {
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<Trace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(value = serial) {
    const normalized = value.trim().toUpperCase();
    if (!normalized || loading) return;
    setLoading(true);
    try {
      setError("");
      setResult(await api<Trace>(`/api/trace/${encodeURIComponent(normalized)}`));
      setSerial(normalized);
    } catch (reason) {
      setResult(null);
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useHardwareScanner((value) => void search(value), !loading);

  const journey = result ? [
    ["Sales Order", result.sales_order, true],
    ["Production Order", result.production_order, true],
    ["Original QC Tray", result.original_tray ?? result.tray_cycle, true],
    ["QC Result", result.previously_ng ? `Reworked · ${result.qc_attempts} attempts` : result.qc_attempts ? "Direct Pass" : "Awaiting QC", result.qc_attempts > 0],
    ["Small Box", result.small_box ?? "Not packed", !!result.small_box],
    ["Master Box", result.master_box ?? "Not mastered", !!result.master_box],
    ["Delivery Order", result.delivery_order ?? "Not assigned", !!result.delivery_order],
  ] as const : [];

  return (
    <ModulePage eyebrow="Analytics" title="Product Traceability" description="Scan one commercial serial to reconstruct its order, production, QC, rework, packing, and delivery history.">
      <section className="card">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input autoFocus className="field font-mono text-base" placeholder="Scan or enter 14-digit serial number" value={serial} onChange={(event) => setSerial(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} />
            <span className="absolute right-4 top-3.5 text-xs font-bold text-slate-400">SCANNER READY</span>
          </div>
          <button className="primary sm:w-36" disabled={!serial.trim() || loading} onClick={() => void search()}>{loading ? "Tracing…" : "Trace Serial"}</button>
        </div>
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
      </section>

      {result ? (
        <>
          <section className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950 to-blue-800 p-6 text-white shadow-lg">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Commercial Serial</p>
                <h2 className="mt-2 break-all font-mono text-3xl font-black tracking-wider">{result.serial_number}</h2>
                <p className="mt-2 text-blue-100">Product: {result.product}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.previously_ng && <span className="rounded-full bg-amber-300 px-4 py-2 text-sm font-black text-amber-950">Previously NG</span>}
                <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold ring-1 ring-white/20">{result.status.replaceAll("_", " ")}</span>
              </div>
            </div>
          </section>

          {result.previously_ng && (
            <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div><p className="text-xs font-black uppercase tracking-wider text-amber-700">Root Cause Alert</p><h2 className="mt-1 text-xl font-black text-amber-950">This serial has an NG and Rework history</h2><p className="mt-1 text-sm text-amber-800">Final PASS does not remove the original inspection record.</p></div>
                <div className="flex gap-3"><span className="rounded-xl bg-white px-4 py-2 text-center ring-1 ring-amber-200"><b className="block text-xl text-amber-950">{result.qc_attempts}</b><small className="text-amber-700">QC attempts</small></span>{result.rework_code && <span className="rounded-xl bg-white px-4 py-2 font-mono font-black text-amber-950 ring-1 ring-amber-200">{result.rework_code}</span>}</div>
              </div>
            </section>
          )}

          <section className="card mt-5">
            <div className="mb-6"><h2 className="text-xl font-black">Serial Journey</h2><p className="mt-1 text-sm text-slate-500">Forward and backward genealogy from customer demand to delivery.</p></div>
            <div className="grid gap-3 lg:grid-cols-7">
              {journey.map(([label, value, complete], index) => (
                <div className="relative" key={label}>
                  <article className={`h-full rounded-2xl border p-4 ${complete ? "border-blue-200 bg-blue-50/60" : "border-dashed border-slate-200 bg-slate-50"}`}>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${complete ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-500"}`}>{index + 1}</span>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 break-words text-sm font-black text-slate-800">{value}</p>
                  </article>
                  {index < journey.length - 1 && <span className="absolute -right-3 top-1/2 z-10 hidden text-blue-300 lg:block">›</span>}
                </div>
              ))}
            </div>
          </section>

          <section className="card mt-5 overflow-hidden p-0">
            <header className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div><h2 className="text-xl font-black">QC &amp; Rework Timeline</h2><p className="mt-1 text-sm text-slate-500">Immutable inspection evidence for this commercial serial.</p></div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${result.previously_ng ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{result.previously_ng ? "REWORKED SERIAL" : result.qc_attempts ? "DIRECT PASS" : "AWAITING QC"}</span>
              </div>
            </header>
            {result.qc_history.length ? (
              <div className="p-6">
                <ol className="relative space-y-5 border-l-2 border-slate-200 pl-7">
                  {result.qc_history.map((event, index) => {
                    const rejected = event.result === "REJECT";
                    return (
                      <li className="relative" key={event.id}>
                        <span className={`absolute -left-[2.15rem] top-1 flex h-4 w-4 rounded-full ring-4 ring-white ${rejected ? "bg-red-500" : "bg-emerald-500"}`} />
                        <article className={`rounded-2xl border p-4 ${rejected ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/40"}`}>
                          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                            <div>
                              <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black uppercase tracking-wider text-slate-500">Attempt {index + 1} · {event.inspection_type === "REWORK" ? "Rework QC" : "Initial QC"}</span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${rejected ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{rejected ? "NG" : "OK"}</span></div>
                              <p className="mt-2 font-black text-slate-900">{rejected ? event.reason ?? "NG reason not recorded" : event.inspection_type === "REWORK" ? "Rework verified and completed" : "Passed initial quality inspection"}</p>
                              {event.rework_code && <p className="mt-1 font-mono text-sm font-bold text-amber-700">{event.rework_code}</p>}
                            </div>
                            <div className="text-sm sm:text-right"><p className="font-bold text-slate-700">{formatTime(event.inspected_at)}</p><p className="mt-1 text-xs text-slate-400">{event.operator_id} · {event.station_id}</p></div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : <div className="px-6 py-12 text-center"><p className="font-black text-slate-700">No QC inspection recorded yet</p><p className="mt-1 text-sm text-slate-500">This serial has completed laser marking but has not entered QC.</p></div>}
          </section>

          <section className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="card"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">QC &amp; Tray Lineage</p><p className="mt-3 font-semibold">Original: {result.original_tray ?? result.tray_cycle} → {result.rework_code ?? "Direct OK"} → Laser Carrier: {result.laser_carrier_tray ?? result.original_tray ?? result.tray_cycle}</p><p className="mt-2 text-xs text-slate-400">{result.qc_session ?? result.tray_cycle} · {result.laser_batch ?? "Laser pending"}</p></div>
            <div className="card"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Delivery Path</p><p className="mt-3 font-semibold">{result.small_box ?? "Pending"} → {result.master_box ?? "Pending"} → {result.delivery_order ?? "Pending"}</p></div>
          </section>
        </>
      ) : !error && (
        <section className="card mt-5 py-20 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl text-blue-700">⌕</div>
          <h2 className="mt-5 text-xl font-black">Ready to trace</h2>
          <p className="mt-2 text-sm text-slate-500">Use the hardware scanner or enter a serial number above.</p>
        </section>
      )}
    </ModulePage>
  );
}
