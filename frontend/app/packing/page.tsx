"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { api } from "@/lib/api";
import QRCode from "qrcode";

type Group = {
  serial_group_id: number; production_order: string; group_number: number; quantity: number;
  serial_from: string; serial_to: string; ready_at: string; status: string;
  passed_qty: number; rework_qty: number; qc_pending_qty: number;
  rework_serials: string[]; is_ready: boolean;
};

type SmallBox = {
  id: number; box_code: string; status: string; production_order_id: number;
  production_order_number: string; packaging_config_id: number; actual_qty: number;
  product_code: string; product_name: string; small_box_capacity: number; master_box_capacity: number;
  serial_from: string; serial_to: string; packed_at: string;
};

type MasterBoxLabelData = {
  master_box_id:number; master_box_code:string; small_box_count:number; small_box_codes:string[];
  master_box_capacity:number; box_status:"FULL"|"PARTIAL";
  unit_quantity:number; production_order_number:string; product_code:string; product_name:string;
  serial_from:string; serial_to:string; packed_at:string; print_status:string;
};

export default function PackingPage() {
  const [tab, setTab] = useState<"small" | "master">("small");
  const [groups, setGroups] = useState<Group[]>([]);
  const [boxes, setBoxes] = useState<SmallBox[]>([]);
  const [availableBoxes, setAvailableBoxes] = useState<SmallBox[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [smallBoxLabel, setSmallBoxLabel] = useState<SmallBox | null>(null);
  const [lastSmallBoxLabel, setLastSmallBoxLabel] = useState<SmallBox | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [masterBoxLabel, setMasterBoxLabel] = useState<MasterBoxLabelData | null>(null);
  const [lastMasterBoxLabel, setLastMasterBoxLabel] = useState<MasterBoxLabelData | null>(null);
  const [availableSearch, setAvailableSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [queue,locked]=await Promise.all([
        api<{ items: Group[] }>("/api/packing/queue"),
        api<{ items: SmallBox[] }>("/api/packing/small-boxes?status=LOCKED"),
      ]);
      setGroups(queue.items);
      setAvailableBoxes(locked.items);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function lockSmall(group: Group) {
    setBusy(true);
    try {
      const result = await api<{ box_code: string }>("/api/packing/small-box", {
        method: "POST",
        body: JSON.stringify({ serial_group_id: group.serial_group_id, idempotency_key: crypto.randomUUID() }),
      });
      const label = await api<SmallBox>(`/api/packing/small-boxes/${encodeURIComponent(result.box_code)}`);
      setSmallBoxLabel(label);
      setLastSmallBoxLabel(label);
      setMessage(`${result.box_code} locked. Small Box label is ready to print.`);
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function scanBox(code: string) {
    const normalized=code.trim().toUpperCase();
    if (!normalized||busy) return;
    if (boxes.some((item) => item.box_code === normalized)) { setMessage(`${normalized} has already been scanned for this Master Box.`); playScanTone("error"); return; }
    setBusy(true);
    try {
      const item = await api<SmallBox>(`/api/packing/small-boxes/${encodeURIComponent(normalized)}`);
      if (item.status !== "LOCKED") throw new Error(`${normalized} is already assigned to a Master Box.`);
      const first = boxes[0];
      if (first && (item.production_order_id !== first.production_order_id || item.packaging_config_id !== first.packaging_config_id)) {
        throw new Error("All Small Boxes must use the same Production Order and packaging configuration.");
      }
      if (first && boxes.length >= first.master_box_capacity) {
        throw new Error(`Master Box is already full (${first.master_box_capacity} Small Boxes).`);
      }
      const next = [...boxes, item];
      setBoxes(next);
      setScanInput("");
      setMessage(`${normalized} accepted (${next.length}/${item.master_box_capacity}).`);
      if (next.length === item.master_box_capacity) await lockMaster(next);
      else playScanTone("scan");
    } catch (error) {
      setMessage((error as Error).message);
      playScanTone("error");
    } finally {
      setBusy(false);
    }
  }

  useHardwareScanner((code) => { if (tab === "master") void scanBox(code.trim()); }, tab === "master" && !busy && !smallBoxLabel && !masterBoxLabel);

  async function lockMaster(items = boxes) {
    if (!items.length) return;
    setBusy(true);
    try {
      const result = await api<MasterBoxLabelData>("/api/packing/master-box", {
        method: "POST",
        body: JSON.stringify({ small_box_codes: items.map((item) => item.box_code), idempotency_key: crypto.randomUUID() }),
      });
      setMasterBoxLabel(result);
      setLastMasterBoxLabel(result);
      setMessage(`${result.master_box_code} completed with ${result.unit_quantity} FG. Master Box label is ready.`);
      setBoxes([]);
      playScanTone("success");
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unitTotal = useMemo(() => boxes.reduce((sum, item) => sum + item.actual_qty, 0), [boxes]);
  const capacity = boxes[0]?.master_box_capacity ?? 0;
  const readyGroups = groups.filter((group) => group.is_ready);
  const pendingGroups = groups.filter((group) => !group.is_ready);
  const visibleAvailableBoxes = availableBoxes.filter((box) => {
    if (boxes.some((selected) => selected.id === box.id)) return false;
    const query=availableSearch.trim().toLowerCase();
    return !query||box.box_code.toLowerCase().includes(query)||box.product_code.toLowerCase().includes(query)||box.production_order_number.toLowerCase().includes(query);
  });

  return (
    <ModulePage eyebrow="Logistics & Packing" title="Packing Operations" description="Stage fixed consecutive serial groups, complete pending rework, then lock Small and Master Boxes.">
      <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button className={`rounded-lg px-5 py-2.5 text-sm font-bold transition ${tab === "small" ? "bg-blue-700 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`} disabled={!!smallBoxLabel || !!masterBoxLabel} onClick={() => setTab("small")}>Small Box Queue</button>
        <button className={`rounded-lg px-5 py-2.5 text-sm font-bold transition ${tab === "master" ? "bg-blue-700 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`} disabled={!!smallBoxLabel || !!masterBoxLabel} onClick={() => setTab("master")}>Master Box Scanner</button>
      </div>
      {message && <div className={`mb-5 rounded-xl border p-4 text-sm font-medium ${/error|must|already|unavailable|incomplete/i.test(message) ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{message}</div>}

      {tab === "small" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <section className="space-y-6">
            {loading && Array.from({ length: 4 }).map((_, index) => <div className="card h-28 animate-pulse bg-slate-100" key={index} />)}

            {!loading && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div><h2 className="text-lg font-black">Ready to Pack</h2><p className="text-sm text-slate-500">All consecutive serials have passed QC.</p></div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{readyGroups.length} ready</span>
                </div>
                <div className="space-y-3">
                  {readyGroups.map((group, index) => (
                    <article className="card flex flex-col justify-between gap-5 border-emerald-200 transition hover:border-emerald-400 sm:flex-row sm:items-center" key={group.serial_group_id}>
                      <div className="flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 font-black text-emerald-700">{index + 1}</span>
                        <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{group.production_order}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Group {group.group_number}</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{group.passed_qty} / {group.quantity} OK</span></div><p className="mt-2 font-mono text-lg font-bold text-blue-950">{group.serial_from} → {group.serial_to}</p><p className="mt-1 text-sm text-slate-500">{group.quantity} consecutive FG ready for final box lock.</p></div>
                      </div>
                      <button className="primary shrink-0" disabled={busy || !!smallBoxLabel || !!masterBoxLabel} onClick={() => void lockSmall(group)}>Lock Small Box</button>
                    </article>
                  ))}
                  {!readyGroups.length && <EmptyState title="No groups ready to lock" text="Completed groups move here automatically." />}
                </div>
              </div>
            )}

            {!loading && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div><h2 className="text-lg font-black">Pending Completion</h2><p className="text-sm text-slate-500">Parts may be staged physically, but the Small Box cannot be locked yet.</p></div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{pendingGroups.length} pending</span>
                </div>
                <div className="space-y-3">
                  {pendingGroups.map((group) => {
                    const percentage = Math.round(group.passed_qty / group.quantity * 100);
                    return (
                      <article className="card border-amber-200" key={group.serial_group_id}>
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{group.production_order}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Group {group.group_number}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">WAITING</span></div><p className="mt-2 font-mono font-bold text-blue-950">{group.serial_from} → {group.serial_to}</p></div>
                          <div className="text-left sm:text-right"><p className="text-2xl font-black text-amber-800">{group.passed_qty} <span className="text-base text-slate-400">/ {group.quantity} OK</span></p><p className="text-xs text-slate-500">{group.rework_qty} rework · {group.qc_pending_qty} awaiting QC</p></div>
                        </div>
                        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500 transition-[width]" style={{ width: `${percentage}%` }} /></div>
                        {!!group.rework_serials.length && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3"><p className="text-xs font-black uppercase tracking-wider text-red-600">Waiting Rework Serial</p><div className="mt-2 flex flex-wrap gap-2">{group.rework_serials.map((serial) => <span className="rounded-lg bg-white px-2.5 py-1 font-mono text-xs font-black text-red-800 ring-1 ring-red-200" key={serial}>{serial}</span>)}</div></div>}
                        <button className="mt-4 w-full cursor-not-allowed rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-400" disabled>Lock unavailable — complete all QC first</button>
                      </article>
                    );
                  })}
                  {!pendingGroups.length && <EmptyState title="No groups waiting" text="There are no incomplete packing groups." />}
                </div>
              </div>
            )}
          </section>

          <aside className="card h-fit">
            <h3 className="font-black">FIFO Control</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">Serial groups stay fixed to protect consecutive box contents. Rework returns automatically complete their original group.</p>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-emerald-600">Ready</p><p className="mt-1 text-3xl font-black text-emerald-950">{readyGroups.length}</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-600">Pending</p><p className="mt-1 text-3xl font-black text-amber-950">{pendingGroups.length}</p></div></div>
            <button className="mt-4 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-bold hover:bg-slate-50" onClick={() => void refresh()}>Refresh Queue</button>
            {lastSmallBoxLabel&&<button className="mt-3 w-full rounded-xl border border-blue-200 py-2.5 text-sm font-black text-blue-700 hover:bg-blue-50" onClick={()=>setSmallBoxLabel(lastSmallBoxLabel)}>Reprint Last Label</button>}
          </aside>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className="card min-h-[470px]">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Hardware Scanner Active</p><h2 className="mt-1 text-xl font-black">Scan Small Box Labels</h2></div><p className="text-4xl font-black text-blue-900">{boxes.length} <span className="text-xl text-slate-400">/ {capacity || "—"}</span></p></div>
            <div className="mt-5 flex gap-2"><input autoFocus className="field min-w-0 font-mono text-base uppercase" placeholder="Scan or enter Small Box QR (SB-...)" value={scanInput} disabled={!!smallBoxLabel || !!masterBoxLabel} onChange={event=>setScanInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void scanBox(scanInput)}}/><button className="primary shrink-0" disabled={busy||!scanInput.trim() || !!smallBoxLabel || !!masterBoxLabel} onClick={()=>void scanBox(scanInput)}>Add Box</button></div>
            {!!capacity&&<div className="mt-4"><div className="mb-1 flex justify-between text-xs font-bold text-slate-500"><span>Master Box Progress</span><span>{boxes.length} / {capacity}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{width:`${Math.min(100,boxes.length/capacity*100)}%`}}/></div></div>}
            {!!capacity&&boxes.length>0&&boxes.length<capacity&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Partial Master Box mode: lock manually when this is the remaining shipment quantity.</div>}
            <div className="mt-5 grid gap-3 md:grid-cols-2">{boxes.map((box, index) => <article className="rounded-2xl border border-slate-200 p-4" key={box.box_code}><div className="flex items-start justify-between"><span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">#{index + 1}</span><button className="text-xs font-bold text-red-600 hover:underline" onClick={() => setBoxes((current) => current.filter((item) => item.box_code !== box.box_code))}>Remove</button></div><p className="mt-3 font-mono font-black">{box.box_code}</p><p className="mt-1 text-sm text-slate-500">{box.serial_from} → {box.serial_to}</p><p className="mt-1 text-xs text-slate-400">{box.actual_qty} FG</p></article>)}</div>
            {!boxes.length && <div className={`flex flex-col items-center justify-center text-center ${availableBoxes.length?"min-h-36":"min-h-72"}`}><div className="rounded-2xl bg-blue-50 px-6 py-5 text-4xl">▦</div><h3 className="mt-4 text-lg font-black">Waiting for first Small Box</h3><p className="mt-1 text-sm text-slate-500">Scan a label or select an existing locked box below.</p></div>}
            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-black">Available Small Boxes</h3><p className="text-sm text-slate-500">Previously locked boxes that have not been assigned to a Master Box.</p></div><span className="h-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{availableBoxes.length} recoverable</span></div>
              <input className="field mt-4 text-sm" placeholder="Search Box ID, Product, or Production Order" value={availableSearch} onChange={event=>setAvailableSearch(event.target.value)}/>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">{visibleAvailableBoxes.map(box=>{const compatible=!boxes[0]||(box.production_order_id===boxes[0].production_order_id&&box.packaging_config_id===boxes[0].packaging_config_id);return <article className={`flex flex-col justify-between gap-3 rounded-xl border p-3 sm:flex-row sm:items-center ${compatible?"bg-white":"bg-slate-50 opacity-60"}`} key={box.box_code}><div className="min-w-0"><p className="font-mono text-sm font-black">{box.box_code}</p><p className="mt-1 truncate text-xs text-slate-500">{box.product_code} · {box.production_order_number} · {box.actual_qty} FG</p></div><div className="flex shrink-0 gap-2"><button className="rounded-lg border px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50" onClick={()=>setSmallBoxLabel(box)}>Reprint</button><button className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300" disabled={busy||!compatible} onClick={()=>void scanBox(box.box_code)}>Add to Master</button></div></article>})}{!visibleAvailableBoxes.length&&<p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No matching unassigned Small Boxes.</p>}</div>
            </div>
          </section>
          <aside className="card h-fit"><h3 className="font-black">Master Box Summary</h3><dl className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Production Order</dt><dd className="font-bold">{boxes[0]?.production_order_number ?? "—"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Product</dt><dd className="font-bold">{boxes[0]?.product_code ?? "—"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Small Boxes</dt><dd className="font-bold">{boxes.length}{capacity?` / ${capacity}`:""}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Total FG</dt><dd className="font-bold">{unitTotal}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Box Type</dt><dd className={`font-black ${boxes.length&&capacity&&boxes.length<capacity?"text-amber-700":"text-emerald-700"}`}>{boxes.length&&capacity&&boxes.length<capacity?"PARTIAL":boxes.length?"FULL":"—"}</dd></div></dl><button className="primary mt-6 w-full" disabled={!capacity||!boxes.length||boxes.length>capacity||busy} onClick={() => void lockMaster()}>{busy ? "Processing…" : boxes.length===capacity&&capacity>0 ? "Lock Full Master Box" : boxes.length ? "Lock Partial Master Box" : "Scan Small Box First"}</button><button className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50" disabled={!boxes.length || busy} onClick={() => setBoxes((current) => current.slice(0, -1))}>Undo Last Scan</button>{lastMasterBoxLabel&&<button className="mt-3 w-full rounded-xl border border-blue-200 py-2.5 text-sm font-black text-blue-700 hover:bg-blue-50" onClick={()=>setMasterBoxLabel(lastMasterBoxLabel)}>Reprint Last Master Label</button>}</aside>
        </div>
      )}
      {smallBoxLabel&&<SmallBoxLabel box={smallBoxLabel} onConfirm={()=>setSmallBoxLabel(null)}/>}
      {masterBoxLabel&&<MasterBoxLabel label={masterBoxLabel} onConfirm={()=>setMasterBoxLabel(null)}/>}
    </ModulePage>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center"><p className="font-black text-slate-700">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}

function playScanTone(kind:"scan"|"success"|"error") {
  try {
    const AudioContextClass=window.AudioContext;
    const context=new AudioContextClass();
    const frequencies=kind==="success"?[660,880]:kind==="error"?[190]:[520];
    frequencies.forEach((frequency,index)=>{
      const oscillator=context.createOscillator();
      const gain=context.createGain();
      const start=context.currentTime+index*0.12;
      oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0.0001,start);
      gain.gain.exponentialRampToValueAtTime(0.16,start+0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+0.1);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);oscillator.stop(start+0.11);
    });
    window.setTimeout(()=>void context.close(),500);
  } catch {}
}

function SmallBoxLabel({box,onConfirm}:{box:SmallBox;onConfirm:()=>void}) {
  const [qr,setQr]=useState("");
  useEffect(()=>{void QRCode.toDataURL(box.box_code,{errorCorrectionLevel:"M",margin:1,width:320,color:{dark:"#020617",light:"#ffffff"}}).then(setQr)},[box.box_code]);
  return <div className="fixed inset-0 z-[170] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
    <section className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="label-print-root mx-auto overflow-hidden rounded-2xl border-2 border-slate-950 bg-white text-slate-950">
        <header className="flex items-center justify-between border-b-2 border-slate-950 bg-slate-950 px-5 py-3 text-white"><div><p className="text-xs font-black tracking-[0.2em]">MRP TRACEABILITY</p><h2 className="text-xl font-black">SMALL BOX</h2></div><span className="rounded-full border border-white/40 px-3 py-1 text-xs font-black">QC PASSED</span></header>
        <div className="grid grid-cols-[1fr_150px] gap-4 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Product</p>
            <p className="mt-0.5 text-xl font-black">{box.product_code}</p>
            <p className="text-sm font-semibold">{box.product_name}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-300 py-3 text-sm">
              <div><p className="text-[10px] font-black uppercase text-slate-500">Quantity</p><p className="text-lg font-black">{box.actual_qty} / {box.small_box_capacity || box.actual_qty} PCS</p><p className={`text-[10px] font-black ${box.small_box_capacity&&box.actual_qty<box.small_box_capacity?"text-amber-700":"text-emerald-700"}`}>{box.small_box_capacity&&box.actual_qty<box.small_box_capacity?"PARTIAL SMALL BOX":"FULL SMALL BOX"}</p></div>
              <div><p className="text-[10px] font-black uppercase text-slate-500">Packed Date</p><p className="font-black">{new Date(box.packed_at).toLocaleDateString("en-GB")}</p><p className="text-xs">{new Date(box.packed_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</p></div>
            </div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Consecutive Serial Range</p><p className="mt-1 font-mono text-sm font-black">{box.serial_from}</p><p className="font-mono text-xs text-slate-500">TO</p><p className="font-mono text-sm font-black">{box.serial_to}</p></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Production Order</p><p className="truncate text-sm font-black">{box.production_order_number}</p></div>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-slate-300 pl-4">{qr?<img alt={`QR ${box.box_code}`} className="h-36 w-36" src={qr}/>:<div className="h-36 w-36 animate-pulse bg-slate-100"/>}<p className="mt-2 break-all text-center font-mono text-sm font-black">{box.box_code}</p><p className="mt-1 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500">Scan Box ID</p></div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-bold text-amber-800 print:hidden">Print this label and attach it to the physical Small Box before continuing.</div>
      <p className="mt-3 text-center text-xs text-slate-500">QR payload: <span className="font-mono font-bold">{box.box_code}</span></p>
      <div className="mt-5 flex gap-3 print:hidden"><button className="flex-1 rounded-xl border py-3 font-black" disabled={!qr} onClick={()=>window.print()}>Print / Reprint Label</button><button className="primary flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onConfirm}>Confirm Label Attached</button></div>
    </section>
  </div>;
}

function MasterBoxLabel({label,onConfirm}:{label:MasterBoxLabelData;onConfirm:()=>void}) {
  const [qr,setQr]=useState("");
  useEffect(()=>{void QRCode.toDataURL(label.master_box_code,{errorCorrectionLevel:"M",margin:1,width:320,color:{dark:"#020617",light:"#ffffff"}}).then(setQr)},[label.master_box_code]);
  return <div className="fixed inset-0 z-[175] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
    <section className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="label-print-root mx-auto overflow-hidden rounded-2xl border-2 border-slate-950 bg-white text-slate-950">
        <header className="flex items-center justify-between border-b-2 border-slate-950 bg-blue-950 px-5 py-3 text-white"><div><p className="text-xs font-black tracking-[0.2em]">MRP TRACEABILITY</p><h2 className="text-2xl font-black">MASTER BOX</h2></div><span className="rounded-full border border-white/40 px-3 py-1 text-xs font-black">PACKED &amp; VERIFIED</span></header>
        <div className="grid grid-cols-[1fr_165px] gap-4 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Product</p><p className="text-xl font-black">{label.product_code}</p><p className="text-sm font-semibold">{label.product_name}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-y border-slate-300 py-3 text-center"><div><p className="text-[9px] font-black uppercase text-slate-500">Small Boxes</p><p className="text-xl font-black">{label.small_box_count} / {label.master_box_capacity || label.small_box_count}</p><p className={`text-[9px] font-black ${label.box_status==="PARTIAL"?"text-amber-700":"text-emerald-700"}`}>{label.box_status} MASTER</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Total FG</p><p className="text-xl font-black">{label.unit_quantity}</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Packed</p><p className="text-sm font-black">{new Date(label.packed_at).toLocaleDateString("en-GB")}</p><p className="text-[10px]">{new Date(label.packed_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</p></div></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Complete Serial Range</p><p className="font-mono text-sm font-black">{label.serial_from}</p><p className="font-mono text-xs text-slate-500">TO</p><p className="font-mono text-sm font-black">{label.serial_to}</p></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Production Order</p><p className="truncate text-sm font-black">{label.production_order_number}</p></div>
            <div className="mt-3"><p className="text-[10px] font-black uppercase text-slate-500">Contained Small Boxes</p><p className="mt-1 font-mono text-[10px] font-bold leading-4">{label.small_box_codes.join(" · ")}</p></div>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-slate-300 pl-4">{qr?<img alt={`QR ${label.master_box_code}`} className="h-40 w-40" src={qr}/>:<div className="h-40 w-40 animate-pulse bg-slate-100"/>}<p className="mt-2 break-all text-center font-mono text-sm font-black">{label.master_box_code}</p><p className="mt-1 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500">Scan Master Box ID</p></div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-bold text-amber-800 print:hidden">Print this label and attach it to the physical Master Box before continuing.</div>
      <p className="mt-3 text-center text-xs text-slate-500">QR payload: <span className="font-mono font-bold">{label.master_box_code}</span></p>
      <div className="mt-5 flex gap-3 print:hidden"><button className="flex-1 rounded-xl border py-3 font-black" disabled={!qr} onClick={()=>window.print()}>Print / Reprint Master Label</button><button className="primary flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onConfirm}>Confirm Label Attached</button></div>
    </section>
  </div>;
}
