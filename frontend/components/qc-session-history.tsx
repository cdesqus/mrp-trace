"use client";

import { useMemo, useState } from "react";
import { RecordAuditButton } from "@/components/record-audit-button";

type QCHistoryItem = {
  id: number;
  stage: "INITIAL" | "REWORK";
  sequence: number;
  result: "PASS" | "REJECT";
  reason: string | null;
  rework_code: string | null;
  session_code: string;
  source_tray: string;
  rework_tray: string | null;
  pass_tray: string | null;
  production_order: string;
  so_number: string;
  product_code: string;
  product_name: string;
  session_operator_id: string | null;
  started_station_id: string | null;
  started_at: string | null;
  completed_by_operator_id: string | null;
  completed_station_id: string | null;
  completed_at: string | null;
  finalized_by_operator_id: string | null;
  finalized_station_id: string | null;
  finalized_at: string | null;
  operator_id: string | null;
  station_id: string | null;
  inspected_at: string;
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Pending";
}

function pic(operator: string | null | undefined, station: string | null | undefined) {
  return `${operator ?? "System"}${station ? ` / ${station}` : ""}`;
}

export function QCSessionHistory({ items, stage }: { items: QCHistoryItem[]; stage: "INITIAL" | "REWORK" }) {
  const [selected, setSelected] = useState<QCHistoryItem[] | null>(null);
  const groups = useMemo(
    () =>
      Array.from(
        items
          .reduce((map, item) => {
            const key = `${item.session_code}|${item.source_tray}`;
            map.set(key, [...(map.get(key) ?? []), item]);
            return map;
          }, new Map<string, QCHistoryItem[]>())
          .values(),
      )
        .map((parts) => {
          const sorted = [...parts].sort((a, b) => a.sequence - b.sequence);
          const lastAt = [...parts].sort(
            (a, b) => new Date(b.inspected_at).getTime() - new Date(a.inspected_at).getTime(),
          )[0].inspected_at;
          return {
            parts: sorted,
            first: sorted[0],
            ok: parts.filter((item) => item.result === "PASS").length,
            ng: parts.filter((item) => item.result === "REJECT").length,
            lastAt,
          };
        })
        .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()),
    [items],
  );

  return (
    <>
      <section className="card overflow-hidden p-0">
        <header className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-xl font-black">{stage === "INITIAL" ? "Initial QC History" : "Rework QC History"}</h2>
            <p className="mt-1 text-sm text-slate-500">One row per QC Session and Source Tray. Open details to inspect every part.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{groups.length} sessions</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{["QC ID", "Source Tray", "Order / Product", "Parts", "Start", "End", "PIC", "Actions"].map((label) => <th className="px-5 py-3" key={label}>{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((group) => (
                <tr className="hover:bg-blue-50/30" key={`${stage}-${group.first.session_code}`}>
                  <td className="px-5 py-4 font-mono font-black">{group.first.session_code}</td>
                  <td className="px-5 py-4 font-mono">{group.first.source_tray}</td>
                  <td className="px-5 py-4">
                    <b>{group.first.so_number} / {group.first.product_code}</b>
                    <p className="text-xs text-slate-400">{group.first.product_name}</p>
                  </td>
                  <td className="px-5 py-4">
                    <b className="text-lg">{group.parts.length}</b>
                    <div className="mt-1 flex gap-2">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{group.ok} OK</span>
                      {stage === "INITIAL" && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">{group.ng} NG</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">{formatDate(group.first.started_at)}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{formatDate(group.first.finalized_at ?? group.first.completed_at)}</td>
                  <td className="px-5 py-4 text-sm">
                    <b>{group.first.session_operator_id ?? "System"}</b>
                    <p className="text-xs text-slate-400">Finish: {group.first.finalized_by_operator_id ?? group.first.completed_by_operator_id ?? "Pending"}</p>
                  </td>
                  <td className="px-5 py-4"><IconView label="View QC session details" onClick={() => setSelected(group.parts)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!groups.length && <p className="py-14 text-center text-sm text-slate-500">No completed {stage === "INITIAL" ? "Initial QC" : "Rework QC"} sessions yet.</p>}
      </section>
      {selected && <SessionModal items={selected} stage={stage} onClose={() => setSelected(null)} />}
    </>
  );
}

function SessionModal({ items, stage, onClose }: { items: QCHistoryItem[]; stage: "INITIAL" | "REWORK"; onClose: () => void }) {
  const first = items[0];
  return (
    <div className="fixed inset-0 z-[185] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-blue-700">{stage === "INITIAL" ? "Initial QC Session" : "Rework QC Session"}</p>
            <h2 className="mt-1 font-mono text-2xl font-black">{first.session_code}</h2>
            <p className="mt-1 text-sm text-slate-500">Source Tray {first.source_tray} / {first.so_number} / {first.product_code} / {items.length} parts</p>
          </div>
          <button aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl border text-xl" title="Close" onClick={onClose}>x</button>
        </header>
        <div className="grid gap-3 border-b bg-slate-50 p-5 md:grid-cols-3">
          <LifecycleStep title="Start QC" time={first.started_at} pic={pic(first.session_operator_id, first.started_station_id)} />
          <LifecycleStep title="End Inspection" time={first.completed_at} pic={pic(first.completed_by_operator_id, first.completed_station_id)} />
          <LifecycleStep title="Finish Output" time={first.finalized_at} pic={pic(first.finalized_by_operator_id, first.finalized_station_id)} />
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
              <tr>{["Part", "Result", "Rework Code", "NG Category", "Output Tray", "Operator", "Station", "Time", "Actions"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-black">#{item.sequence}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.result === "PASS" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{item.result === "PASS" ? "OK" : "NG"}</span></td>
                  <td className="px-4 py-3 font-mono text-sm">{item.rework_code ?? "-"}</td>
                  <td className="px-4 py-3 text-sm">{item.reason ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-sm">{stage === "REWORK" ? item.pass_tray ?? "Pending" : item.result === "PASS" ? item.pass_tray ?? "Pending" : item.rework_tray ?? "Pending"}</td>
                  <td className="px-4 py-3 text-sm font-bold">{item.operator_id ?? "System"}</td>
                  <td className="px-4 py-3 text-sm">{item.station_id ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatDate(item.inspected_at)}</td>
                  <td className="px-4 py-3">
                    <RecordAuditButton audit={{ title: `${item.session_code} / Part #${item.sequence}`, subtitle: `${item.so_number} / ${item.product_code}`, createdBy: item.operator_id, createdAt: item.inspected_at, fields: [{ label: "QC Stage", value: stage }, { label: "Result", value: item.result === "PASS" ? "OK" : "NG" }, { label: "Station", value: item.station_id }, { label: "Source Tray", value: item.source_tray }, { label: "Rework Tray", value: item.rework_tray }, { label: "Pass Tray", value: item.pass_tray }, { label: "NG Category", value: item.reason }] }} label="View part audit" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LifecycleStep({ title, time, pic }: { title: string; time: string | null; pic: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs font-black uppercase text-slate-400">{title}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{formatDate(time)}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{pic}</p>
    </div>
  );
}

function IconView({ label, onClick }: { label: string; onClick: () => void }) {
  return <button aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm hover:bg-blue-50" title={label} onClick={onClick}><svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg></button>;
}
