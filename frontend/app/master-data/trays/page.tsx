"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { api } from "@/lib/api";

type TrayType = "SOURCE" | "PASS" | "REWORK";
type Tray = { id: number; tray_code: string; tray_type: TrayType; is_active: boolean; created_at: string; updated_at?: string; created_by?: string; updated_by?: string };

const code39: Record<string, string> = {0:"nnnwwnwnn",1:"wnnwnnnnw",2:"nnwwnnnnw",3:"wnwwnnnnn",4:"nnnwwnnnw",5:"wnnwwnnnn",6:"nnwwwnnnn",7:"nnnwnnwnw",8:"wnnwnnwnn",9:"nnwwnnwnn",A:"wnnnnwnnw",B:"nnwnnwnnw",C:"wnwnnwnnn",D:"nnnnwwnnw",E:"wnnnwwnnn",F:"nnwnwwnnn",G:"nnnnnwwnw",H:"wnnnnwwnn",I:"nnwnnwwnn",J:"nnnnwwwnn",K:"wnnnnnnww",L:"nnwnnnnww",M:"wnwnnnnwn",N:"nnnnwnnww",O:"wnnnwnnwn",P:"nnwnwnnwn",Q:"nnnnnnwww",R:"wnnnnnwwn",S:"nnwnnnwwn",T:"nnnnwnwwn",U:"wwnnnnnnw",V:"nwwnnnnnw",W:"wwwnnnnnn",X:"nwnnwnnnw",Y:"wwnnwnnnn",Z:"nwwnwnnnn","-":"nwnnnnwnw","*":"nwnnwnwnn"};

function Barcode({ value }: { value: string }) {
  let x = 0;
  const bars: Array<{ x: number; width: number }> = [];
  `*${value.toUpperCase()}*`.split("").forEach((char) => {
    (code39[char] ?? code39["-"]).split("").forEach((kind, index) => {
      const width = kind === "w" ? 3 : 1;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
    x += 1;
  });
  return <svg aria-label={`Barcode ${value}`} className="h-28 w-full" preserveAspectRatio="none" viewBox={`0 0 ${x} 60`}>{bars.map((bar, index) => <rect fill="#020617" height="60" key={index} width={bar.width} x={bar.x} />)}</svg>;
}

export default function TrayMasterPage() {
  const [items, setItems] = useState<Tray[]>([]);
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [trayType, setTrayType] = useState<TrayType>("SOURCE");
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState<Tray | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<Tray | null>(null);
  const [label, setLabel] = useState<Tray | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Tray[] }>("/api/master/trays")).items);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? items.filter((item) => `${item.tray_code} ${item.tray_type} ${item.created_by ?? ""}`.toLowerCase().includes(query)) : items;
  }, [items, search]);

  function reset() {
    setCode("");
    setTrayType("SOURCE");
    setActive(true);
    setEditing(null);
    setCreateOpen(false);
    setError("");
  }

  function newTray() {
    reset();
    setCreateOpen(true);
  }

  function edit(item: Tray) {
    setEditing(item);
    setCreateOpen(true);
    setCode(item.tray_code);
    setTrayType(item.tray_type);
    setActive(item.is_active);
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/master/trays/${editing.id}`, { method: "PATCH", body: JSON.stringify({ tray_code: code, tray_type: trayType, is_active: active }) });
      } else {
        const tray = await api<Tray>("/api/master/trays", { method: "POST", body: JSON.stringify({ tray_code: code, tray_type: trayType }) });
        setLabel({ ...tray, is_active: true, created_at: new Date().toISOString() });
      }
      reset();
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: Tray) {
    setBusy(true);
    try {
      await api(`/api/master/trays/${item.id}`, { method: "PATCH", body: JSON.stringify({ tray_code: item.tray_code, tray_type: item.tray_type, is_active: !item.is_active }) });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <ModulePage eyebrow="Master Data" title="Tray Labels" description="Maintain permanent reusable Tray identities, ownership, type, and label history." actions={<button className="primary" onClick={newTray}>+ New Tray Label</button>}>
    <section className="card mt-5 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <input className="field py-2.5 text-base" placeholder="Search tray label, type, or creator..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-slate-50" onClick={() => void load()} type="button">Refresh</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Tray ID", "Type", "Created By", "Status", "Actions"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
          <tbody className="divide-y">{rows.map((item) => <tr className="hover:bg-blue-50/40" key={item.id}>
            <td className="px-5 py-4 font-mono text-lg font-black">{item.tray_code}</td>
            <td className="px-5 py-4"><TypeBadge type={item.tray_type} /></td>
            <td className="px-5 py-4"><p className="font-bold">{item.created_by ?? "System"}</p><p className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</p></td>
            <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.is_active ? "ACTIVE" : "INACTIVE"}</span></td>
            <td className="px-5 py-4"><div className="flex gap-2"><TrayAction label="View tray" icon="o" tone="blue" onClick={() => setViewing(item)} /><TrayAction label="Edit tray" icon="E" tone="slate" onClick={() => edit(item)} /><TrayAction label="Print label" icon="#" tone="blue" onClick={() => setLabel(item)} /><TrayAction label={item.is_active ? "Deactivate tray" : "Reactivate tray"} icon={item.is_active ? "!" : "Y"} tone={item.is_active ? "red" : "green"} disabled={busy} onClick={() => void toggle(item)} /></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.length && <div className="py-16 text-center text-sm text-slate-500">No Tray Labels found.</div>}
    </section>

    {(createOpen || editing) && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) reset(); }}>
      <section className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b p-6"><div><p className="text-xs font-black uppercase tracking-wider text-blue-700">{editing ? "Edit Tray" : "Create Tray"}</p><h2 className="mt-1 text-2xl font-black">{editing ? editing.tray_code : "Generate Permanent Label"}</h2></div><button className="h-10 w-10 rounded-xl border font-black" onClick={reset} type="button">X</button></header>
        <form className="space-y-4 p-6" onSubmit={save}>
          <label className="block text-sm font-bold">Tray ID<input autoFocus className="field mt-2 font-mono text-base uppercase" placeholder={trayType === "SOURCE" ? "SRC-005" : trayType === "PASS" ? "PAS-005" : "RWK-005"} value={code} onChange={(event) => setCode(event.target.value)} /></label>
          <label className="block text-sm font-bold">Tray Type<select className="field mt-2" value={trayType} onChange={(event) => setTrayType(event.target.value as TrayType)}><option value="SOURCE">Source Tray</option><option value="PASS">Pass Tray</option><option value="REWORK">Rework Tray</option></select></label>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <footer className="flex justify-end gap-3 pt-2"><button className="rounded-xl border px-5 py-3 font-bold" onClick={reset} type="button">Cancel</button><button className="primary shrink-0" disabled={busy || !code.trim()}>{busy ? "Saving..." : editing ? "Save Changes" : "Generate Tray Label"}</button></footer>
        </form>
      </section>
    </div>}

    {viewing && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}><section className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"><header className="border-b p-6"><p className="text-xs font-black uppercase text-blue-700">Tray Details</p><h2 className="mt-1 font-mono text-2xl font-black">{viewing.tray_code}</h2></header><dl className="grid grid-cols-2 gap-5 p-6 text-sm"><Detail label="Tray Type" value={viewing.tray_type} /><Detail label="Status" value={viewing.is_active ? "Active" : "Inactive"} /><Detail label="Created By" value={viewing.created_by ?? "System"} /><Detail label="Created At" value={new Date(viewing.created_at).toLocaleString()} /><Detail label="Last Updated By" value={viewing.updated_by ?? viewing.created_by ?? "System"} /><Detail label="Last Updated" value={viewing.updated_at ? new Date(viewing.updated_at).toLocaleString() : "-"} /></dl><footer className="flex justify-end gap-3 border-t p-4"><button className="rounded-xl border px-5 py-3 font-bold" onClick={() => setViewing(null)}>Close</button><button className="primary" onClick={() => { edit(viewing); setViewing(null); }}>Edit Tray</button></footer></section></div>}
    {label && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-4 print:static print:bg-white"><section className={`label-print-root w-full max-w-md rounded-3xl border-t-8 bg-white p-7 text-center shadow-2xl ${label.tray_type === "SOURCE" ? "border-blue-600" : label.tray_type === "PASS" ? "border-emerald-600" : "border-amber-500"}`}><p className="mb-4 text-sm font-black tracking-[0.2em]">{label.tray_type} TRAY</p><Barcode value={label.tray_code} /><h2 className="mt-5 font-mono text-3xl font-black">{label.tray_code}</h2><p className="mt-1 text-sm text-slate-500">PERMANENT REUSABLE TRAY ID - CODE 39</p><div className="mt-6 flex gap-3 print:hidden"><button className="flex-1 rounded-xl border py-3 font-bold" onClick={() => setLabel(null)}>Close</button><button className="primary flex-1" onClick={() => window.print()}>Print Label</button></div></section></div>}
  </ModulePage>;
}

function TypeBadge({ type }: { type: TrayType }) { return <span className={`rounded-full px-3 py-1 text-xs font-black ${type === "SOURCE" ? "bg-blue-50 text-blue-700" : type === "PASS" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{type}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>; }
function TrayAction({ label, icon, tone, disabled, onClick }: { label: string; icon: string; tone: "blue" | "slate" | "red" | "green"; disabled?: boolean; onClick: () => void }) { const color = { blue: "border-blue-200 text-blue-700 hover:bg-blue-50", slate: "border-slate-300 text-slate-700 hover:bg-slate-50", red: "border-red-200 text-red-600 hover:bg-red-50", green: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" }[tone]; return <button aria-label={label} className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-white text-xs font-black shadow-sm ${color}`} disabled={disabled} title={label} onClick={onClick}>{icon}</button>; }
