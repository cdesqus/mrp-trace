"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { api } from "@/lib/api";
import QRCode from "qrcode";

type Group = {
  serial_group_id: number;
  production_order: string;
  group_number: number;
  quantity: number;
  serial_from: string;
  serial_to: string;
  ready_at: string;
  status: string;
  passed_qty: number;
  rework_qty: number;
  qc_pending_qty: number;
  rework_serials: string[];
  is_ready: boolean;
};

type SmallBox = {
  id: number;
  box_code: string;
  status: string;
  production_order_id: number;
  production_order_number: string;
  packaging_config_id: number;
  actual_qty: number;
  product_code: string;
  product_name: string;
  small_box_capacity: number;
  master_box_capacity: number;
  serial_from: string;
  serial_to: string;
  packed_at: string;
};

type MasterBoxLabelData = {
  master_box_id: number;
  master_box_code: string;
  small_box_count: number;
  small_box_codes: string[];
  master_box_capacity: number;
  box_status: "FULL" | "PARTIAL";
  unit_quantity: number;
  production_order_number: string;
  product_code: string;
  product_name: string;
  serial_from: string;
  serial_to: string;
  packed_at: string;
  print_status: string;
};

export default function PackingPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeMaster, setActiveMaster] = useState<SmallBox[]>([]);
  const [availableBoxes, setAvailableBoxes] = useState<SmallBox[]>([]);
  const [message, setMessage] = useState("Pick the next ready group, pack the parts, then print the Small Box label.");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");
  const [smallBoxLabel, setSmallBoxLabel] = useState<SmallBox | null>(null);
  const [lastSmallBoxLabel, setLastSmallBoxLabel] = useState<SmallBox | null>(null);
  const [masterBoxLabel, setMasterBoxLabel] = useState<MasterBoxLabelData | null>(null);
  const [lastMasterBoxLabel, setLastMasterBoxLabel] = useState<MasterBoxLabelData | null>(null);
  const [completedMaster, setCompletedMaster] = useState<MasterBoxLabelData | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, locked] = await Promise.all([
        api<{ items: Group[] }>("/api/packing/queue"),
        api<{ items: SmallBox[] }>("/api/packing/small-boxes?status=LOCKED"),
      ]);
      setGroups(queue.items);
      setAvailableBoxes(locked.items);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const readyGroups = groups.filter((group) => group.is_ready);
  const pendingGroups = groups.filter((group) => !group.is_ready);
  const activeCapacity = activeMaster[0]?.master_box_capacity ?? 0;
  const activeUnits = activeMaster.reduce((sum, box) => sum + box.actual_qty, 0);
  const visibleAvailableBoxes = availableBoxes.filter((box) => {
    if (activeMaster.some((selected) => selected.id === box.id)) return false;
    const query = availableSearch.trim().toLowerCase();
    return !query || box.box_code.toLowerCase().includes(query) || box.product_code.toLowerCase().includes(query) || box.production_order_number.toLowerCase().includes(query);
  });

  const workStep = useMemo(() => {
    if (masterBoxLabel) return { label: "Attach Master Label", detail: `${masterBoxLabel.master_box_code} is printed. Attach the label to release this Master Box to Finished Goods.` };
    if (smallBoxLabel) return { label: "Attach Small Label", detail: `${smallBoxLabel.box_code} is printed. Attach the label, then place the Small Box into the active Master Box.` };
    if (activeMaster.length) return { label: "Pack Next Small Box", detail: `Master Box in progress: ${activeMaster.length}/${activeCapacity} Small Boxes, ${activeUnits} FG.` };
    return { label: "Start Packing", detail: "Choose the next ready serial group. The system will create the Small Box label first." };
  }, [activeCapacity, activeMaster.length, activeUnits, masterBoxLabel, smallBoxLabel]);

  async function packSmallBox(group: Group) {
    setBusy(true);
    setCompletedMaster(null);
    try {
      const result = await api<{ box_code: string }>("/api/packing/small-box", {
        method: "POST",
        body: JSON.stringify({ serial_group_id: group.serial_group_id, idempotency_key: crypto.randomUUID() }),
      });
      const label = await api<SmallBox>(`/api/packing/small-boxes/${encodeURIComponent(result.box_code)}`);
      setSmallBoxLabel(label);
      setLastSmallBoxLabel(label);
      setMessage(`${label.box_code} created. Print and attach the Small Box label.`);
      await refresh();
      playScanTone("success");
    } catch (error) {
      setMessage((error as Error).message);
      playScanTone("error");
    } finally {
      setBusy(false);
    }
  }

  async function addSmallBoxToMaster(box: SmallBox) {
    if (activeMaster.some((item) => item.id === box.id)) {
      setMessage(`${box.box_code} is already inside the active Master Box.`);
      playScanTone("error");
      return;
    }
    const first = activeMaster[0];
    if (first && (box.production_order_id !== first.production_order_id || box.packaging_config_id !== first.packaging_config_id)) {
      setMessage("This Small Box belongs to a different Production Order or packaging. Finish the current Master Box first.");
      playScanTone("error");
      return;
    }
    if (first && activeMaster.length >= first.master_box_capacity) {
      setMessage(`The active Master Box is already full (${first.master_box_capacity} Small Boxes).`);
      playScanTone("error");
      return;
    }
    const next = [...activeMaster, box];
    setActiveMaster(next);
    setSmallBoxLabel(null);
    setMessage(`${box.box_code} added to active Master Box (${next.length}/${box.master_box_capacity}).`);
    playScanTone("scan");
    if (next.length === box.master_box_capacity) {
      await finishMasterBox(next);
    }
  }

  async function scanExistingSmallBox(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!normalized || busy || smallBoxLabel || masterBoxLabel) return;
    setBusy(true);
    try {
      const box = await api<SmallBox>(`/api/packing/small-boxes/${encodeURIComponent(normalized)}`);
      if (box.status !== "LOCKED") throw new Error(`${normalized} is already assigned to a Master Box.`);
      await addSmallBoxToMaster(box);
      setScanInput("");
    } catch (error) {
      setMessage((error as Error).message);
      playScanTone("error");
    } finally {
      setBusy(false);
    }
  }

  useHardwareScanner((code) => void scanExistingSmallBox(code), !busy && !smallBoxLabel && !masterBoxLabel);

  async function finishMasterBox(items = activeMaster) {
    if (!items.length) return;
    setBusy(true);
    try {
      const result = await api<MasterBoxLabelData>("/api/packing/master-box", {
        method: "POST",
        body: JSON.stringify({ small_box_codes: items.map((item) => item.box_code), idempotency_key: crypto.randomUUID() }),
      });
      setMasterBoxLabel(result);
      setLastMasterBoxLabel(result);
      setActiveMaster([]);
      setMessage(`${result.master_box_code} completed with ${result.unit_quantity} FG. Print and attach the Master Box label.`);
      await refresh();
      playScanTone("success");
    } catch (error) {
      setMessage((error as Error).message);
      playScanTone("error");
    } finally {
      setBusy(false);
    }
  }

  function confirmMasterLabel(label: MasterBoxLabelData) {
    setMasterBoxLabel(null);
    setCompletedMaster(label);
    setMessage(`${label.master_box_code} is now available in Finished Goods. Create or open a Delivery Order when ready.`);
  }

  return (
    <ModulePage eyebrow="Logistics & Packing" title="Packing Workbench" description="Pack parts into Small Boxes, build the active Master Box, then release Finished Goods for delivery.">
      <section className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs font-black uppercase tracking-wider text-blue-700">Current Step</p>
          <h2 className="mt-2 text-3xl font-black text-blue-950">{workStep.label}</h2>
          <p className="mt-2 text-sm font-semibold text-blue-800">{workStep.detail}</p>
        </div>
        <div className={`rounded-2xl border p-5 ${completedMaster ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Last Result</p>
          {completedMaster ? (
            <>
              <h3 className="mt-2 font-mono text-2xl font-black text-emerald-950">{completedMaster.master_box_code}</h3>
              <p className="mt-1 text-sm font-bold text-emerald-800">{completedMaster.unit_quantity} FG available / {completedMaster.box_status} Master Box</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-800" href={`/finished-goods?search=${encodeURIComponent(completedMaster.master_box_code)}`}>Open Finished Goods</Link>
                <Link className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-black text-emerald-800 hover:bg-emerald-50" href="/delivery-orders">Go to Delivery</Link>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Completed Master Boxes will appear here with shortcuts to Finished Goods and Delivery.</p>
          )}
        </div>
      </section>

      {message && <div className={`mb-5 rounded-xl border p-4 text-sm font-semibold ${/cannot|different|already|unavailable|incomplete|error|failed/i.test(message) ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="space-y-5">
          <section className="card overflow-hidden p-0">
            <header className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-black">Pack Next Small Box</h2>
                <p className="text-sm text-slate-500">Pick one ready group, put the physical parts into a Small Box, then print its label.</p>
              </div>
              <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50" disabled={loading} onClick={() => void refresh()}>Refresh</button>
            </header>
            <div className="space-y-3 p-5">
              {loading && Array.from({ length: 3 }).map((_, index) => <div className="h-24 animate-pulse rounded-2xl bg-slate-100" key={index} />)}
              {!loading && readyGroups.map((group, index) => (
                <article className="rounded-2xl border border-emerald-200 bg-white p-4 transition hover:border-emerald-400" key={group.serial_group_id}>
                  <div className="grid gap-4 lg:grid-cols-[48px_1fr_190px] lg:items-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-lg font-black text-emerald-700">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black">{group.production_order}</h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Group {group.group_number}</span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{group.quantity} PCS</span>
                      </div>
                      <p className="mt-2 font-mono text-sm font-bold text-blue-950 sm:text-base">{group.serial_from} to {group.serial_to}</p>
                    </div>
                    <button className="rounded-xl bg-emerald-600 px-4 py-4 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-slate-300" disabled={busy || !!smallBoxLabel || !!masterBoxLabel} onClick={() => void packSmallBox(group)}>Print Small Label</button>
                  </div>
                </article>
              ))}
              {!loading && !readyGroups.length && <EmptyState title="No groups ready" text="Ready serial groups will appear here after QC and laser marking are complete." />}
            </div>
          </section>

          {!!pendingGroups.length && (
            <details className="card overflow-hidden p-0">
              <summary className="cursor-pointer list-none border-b p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">Waiting Groups</h2>
                    <p className="text-sm text-slate-500">Groups blocked by QC pending or rework.</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{pendingGroups.length} waiting</span>
                </div>
              </summary>
              <div className="space-y-3 p-5">
                {pendingGroups.map((group) => (
                  <article className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4" key={group.serial_group_id}>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row">
                      <div>
                        <b>{group.production_order} / Group {group.group_number}</b>
                        <p className="mt-1 font-mono text-sm text-slate-600">{group.serial_from} to {group.serial_to}</p>
                      </div>
                      <p className="font-black text-amber-800">{group.passed_qty}/{group.quantity} OK</p>
                    </div>
                    {!!group.rework_serials.length && <p className="mt-2 text-xs font-bold text-red-700">Waiting rework: {group.rework_serials.join(", ")}</p>}
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>

        <aside className="space-y-5">
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-blue-700">Active Master Box</p>
                <h2 className="mt-1 text-xl font-black">{activeMaster.length ? `${activeMaster.length}/${activeCapacity} Small Boxes` : "Waiting for Small Box"}</h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${activeMaster.length && activeMaster.length < activeCapacity ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{activeMaster.length ? activeMaster.length === activeCapacity ? "FULL" : "IN PROGRESS" : "EMPTY"}</span>
            </div>
            {!!activeCapacity && <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${Math.min(100, activeMaster.length / activeCapacity * 100)}%` }} /></div>}
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Production Order</dt><dd className="font-bold">{activeMaster[0]?.production_order_number ?? "-"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Product</dt><dd className="font-bold">{activeMaster[0]?.product_code ?? "-"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Total FG</dt><dd className="font-bold">{activeUnits}</dd></div>
            </dl>
            <div className="mt-5 max-h-60 space-y-2 overflow-y-auto pr-1">
              {activeMaster.map((box, index) => (
                <div className="rounded-xl border bg-slate-50 p-3" key={box.id}>
                  <div className="flex justify-between gap-3">
                    <b className="font-mono text-sm">{box.box_code}</b>
                    <button className="text-xs font-black text-red-600 hover:underline" disabled={busy} onClick={() => setActiveMaster((current) => current.filter((item) => item.id !== box.id))}>Remove</button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">#{index + 1} / {box.actual_qty} FG / {box.serial_from} to {box.serial_to}</p>
                </div>
              ))}
              {!activeMaster.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Small Boxes you confirm will be stacked here automatically.</p>}
            </div>
            <button className="primary mt-5 w-full" disabled={!activeMaster.length || busy || !!smallBoxLabel || !!masterBoxLabel} onClick={() => void finishMasterBox()}>
              {activeMaster.length && activeCapacity && activeMaster.length < activeCapacity ? "Finish Partial Master Box" : activeMaster.length ? "Finish Master Box" : "Pack Small Box First"}
            </button>
          </section>

          <section className="card">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setManualOpen((value) => !value)} type="button">
              <span>
                <b>Manual / Recovery</b>
                <p className="mt-1 text-sm text-slate-500">Use for old Small Box labels, reprint, or interrupted work.</p>
              </span>
              <span className={`text-xl transition ${manualOpen ? "rotate-90" : ""}`}>{">"}</span>
            </button>
            {manualOpen && (
              <div className="mt-5 border-t pt-5">
                <div className="flex gap-2">
                  <input className="field min-w-0 font-mono uppercase" placeholder="Scan SB-..." value={scanInput} onChange={(event) => setScanInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void scanExistingSmallBox(scanInput); }} />
                  <button className="rounded-xl bg-blue-700 px-4 font-black text-white disabled:bg-slate-300" disabled={busy || !scanInput.trim()} onClick={() => void scanExistingSmallBox(scanInput)}>Add</button>
                </div>
                <input className="field mt-3 text-sm" placeholder="Search existing Small Boxes" value={availableSearch} onChange={(event) => setAvailableSearch(event.target.value)} />
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                  {visibleAvailableBoxes.map((box) => {
                    const compatible = !activeMaster[0] || (box.production_order_id === activeMaster[0].production_order_id && box.packaging_config_id === activeMaster[0].packaging_config_id);
                    return (
                      <article className={`rounded-xl border p-3 ${compatible ? "bg-white" : "bg-slate-50 opacity-60"}`} key={box.id}>
                        <p className="font-mono text-sm font-black">{box.box_code}</p>
                        <p className="mt-1 text-xs text-slate-500">{box.product_code} / {box.production_order_number} / {box.actual_qty} FG</p>
                        <div className="mt-3 flex gap-2">
                          <button className="rounded-lg border px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50" onClick={() => setSmallBoxLabel(box)}>Reprint</button>
                          <button className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300" disabled={busy || !compatible} onClick={() => void addSmallBoxToMaster(box)}>Add to Master</button>
                        </div>
                      </article>
                    );
                  })}
                  {!visibleAvailableBoxes.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">No unassigned Small Boxes found.</p>}
                </div>
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3">
            <button className="rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-40" disabled={!lastSmallBoxLabel} onClick={() => lastSmallBoxLabel && setSmallBoxLabel(lastSmallBoxLabel)}>Reprint Small</button>
            <button className="rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-40" disabled={!lastMasterBoxLabel} onClick={() => lastMasterBoxLabel && setMasterBoxLabel(lastMasterBoxLabel)}>Reprint Master</button>
          </section>
        </aside>
      </div>

      {smallBoxLabel && <SmallBoxLabel box={smallBoxLabel} onConfirm={() => void addSmallBoxToMaster(smallBoxLabel)} onClose={() => setSmallBoxLabel(null)} />}
      {masterBoxLabel && <MasterBoxLabel label={masterBoxLabel} onConfirm={() => confirmMasterLabel(masterBoxLabel)} onClose={() => setMasterBoxLabel(null)} />}
    </ModulePage>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center"><p className="font-black text-slate-700">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}

function playScanTone(kind: "scan" | "success" | "error") {
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const frequencies = kind === "success" ? [660, 880] : kind === "error" ? [190] : [520];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.12;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.11);
    });
    window.setTimeout(() => void context.close(), 500);
  } catch {}
}

function SmallBoxLabel({ box, onConfirm, onClose }: { box: SmallBox; onConfirm: () => void; onClose: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    void QRCode.toDataURL(box.box_code, { errorCorrectionLevel: "M", margin: 1, width: 320, color: { dark: "#020617", light: "#ffffff" } }).then(setQr);
  }, [box.box_code]);
  return <div className="fixed inset-0 z-[170] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
    <section className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="label-print-root mx-auto overflow-hidden rounded-2xl border-2 border-slate-950 bg-white text-slate-950">
        <header className="flex items-center justify-between border-b-2 border-slate-950 bg-slate-950 px-5 py-3 text-white"><div><p className="text-xs font-black tracking-[0.2em]">MRP TRACEABILITY</p><h2 className="text-xl font-black">SMALL BOX</h2></div><span className="rounded-full border border-white/40 px-3 py-1 text-xs font-black">QC PASSED</span></header>
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_150px]">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Product</p>
            <p className="mt-0.5 text-xl font-black">{box.product_code}</p>
            <p className="text-sm font-semibold">{box.product_name}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-300 py-3 text-sm">
              <div><p className="text-[10px] font-black uppercase text-slate-500">Quantity</p><p className="text-lg font-black">{box.actual_qty} / {box.small_box_capacity || box.actual_qty} PCS</p><p className={`text-[10px] font-black ${box.small_box_capacity && box.actual_qty < box.small_box_capacity ? "text-amber-700" : "text-emerald-700"}`}>{box.small_box_capacity && box.actual_qty < box.small_box_capacity ? "PARTIAL SMALL BOX" : "FULL SMALL BOX"}</p></div>
              <div><p className="text-[10px] font-black uppercase text-slate-500">Packed Date</p><p className="font-black">{new Date(box.packed_at).toLocaleDateString("en-GB")}</p><p className="text-xs">{new Date(box.packed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p></div>
            </div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Consecutive Serial Range</p><p className="mt-1 font-mono text-sm font-black">{box.serial_from}</p><p className="font-mono text-xs text-slate-500">TO</p><p className="font-mono text-sm font-black">{box.serial_to}</p></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Production Order</p><p className="truncate text-sm font-black">{box.production_order_number}</p></div>
          </div>
          <div className="flex flex-col items-center justify-center border-slate-300 sm:border-l sm:pl-4">{qr ? <img alt={`QR ${box.box_code}`} className="h-36 w-36" src={qr} /> : <div className="h-36 w-36 animate-pulse bg-slate-100" />}<p className="mt-2 break-all text-center font-mono text-sm font-black">{box.box_code}</p><p className="mt-1 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500">Scan Box ID</p></div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-bold text-amber-800 print:hidden">Print this label, attach it to the Small Box, then put the Small Box into the active Master Box.</div>
      <div className="mt-5 flex flex-col gap-3 print:hidden sm:flex-row"><button className="flex-1 rounded-xl border py-3 font-black" disabled={!qr} onClick={() => window.print()}>Print / Reprint Label</button><button className="primary flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onConfirm}>Label Attached, Add to Master</button><button className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}

function MasterBoxLabel({ label, onConfirm, onClose }: { label: MasterBoxLabelData; onConfirm: () => void; onClose: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    void QRCode.toDataURL(label.master_box_code, { errorCorrectionLevel: "M", margin: 1, width: 320, color: { dark: "#020617", light: "#ffffff" } }).then(setQr);
  }, [label.master_box_code]);
  return <div className="fixed inset-0 z-[175] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
    <section className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="label-print-root mx-auto overflow-hidden rounded-2xl border-2 border-slate-950 bg-white text-slate-950">
        <header className="flex items-center justify-between border-b-2 border-slate-950 bg-blue-950 px-5 py-3 text-white"><div><p className="text-xs font-black tracking-[0.2em]">MRP TRACEABILITY</p><h2 className="text-2xl font-black">MASTER BOX</h2></div><span className="rounded-full border border-white/40 px-3 py-1 text-xs font-black">PACKED AND VERIFIED</span></header>
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_165px]">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Product</p><p className="text-xl font-black">{label.product_code}</p><p className="text-sm font-semibold">{label.product_name}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-y border-slate-300 py-3 text-center"><div><p className="text-[9px] font-black uppercase text-slate-500">Small Boxes</p><p className="text-xl font-black">{label.small_box_count} / {label.master_box_capacity || label.small_box_count}</p><p className={`text-[9px] font-black ${label.box_status === "PARTIAL" ? "text-amber-700" : "text-emerald-700"}`}>{label.box_status} MASTER</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Total FG</p><p className="text-xl font-black">{label.unit_quantity}</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Packed</p><p className="text-sm font-black">{new Date(label.packed_at).toLocaleDateString("en-GB")}</p><p className="text-[10px]">{new Date(label.packed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p></div></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Complete Serial Range</p><p className="font-mono text-sm font-black">{label.serial_from}</p><p className="font-mono text-xs text-slate-500">TO</p><p className="font-mono text-sm font-black">{label.serial_to}</p></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Production Order</p><p className="truncate text-sm font-black">{label.production_order_number}</p></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Contained Small Boxes</p><p className="mt-1 font-mono text-[10px] font-bold leading-4">{label.small_box_codes.join(" / ")}</p></div>
          </div>
          <div className="flex flex-col items-center justify-center border-slate-300 sm:border-l sm:pl-4">{qr ? <img alt={`QR ${label.master_box_code}`} className="h-40 w-40" src={qr} /> : <div className="h-40 w-40 animate-pulse bg-slate-100" />}<p className="mt-2 break-all text-center font-mono text-sm font-black">{label.master_box_code}</p><p className="mt-1 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500">Scan Master Box ID</p></div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-bold text-amber-800 print:hidden">Print this label and attach it to the physical Master Box. After confirmation it is visible in Finished Goods and can be assigned to Delivery.</div>
      <div className="mt-5 flex flex-col gap-3 print:hidden sm:flex-row"><button className="flex-1 rounded-xl border py-3 font-black" disabled={!qr} onClick={() => window.print()}>Print / Reprint Master Label</button><button className="primary flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onConfirm}>Label Attached, Release FG</button><button className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}
