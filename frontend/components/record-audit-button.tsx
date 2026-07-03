"use client";

import { useState } from "react";

export type RecordAudit = {
  title: string;
  subtitle?: string;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  fields?: Array<{ label: string; value?: string | number | null }>;
};

export function RecordAuditButton({ audit, label = "Details" }: { audit: RecordAudit; label?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50" title={label} onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
      <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
    </button>
    {open && <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b p-6"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Record Information</p><h2 className="mt-1 text-2xl font-black">{audit.title}</h2>{audit.subtitle&&<p className="mt-1 text-sm text-slate-500">{audit.subtitle}</p>}</div><button className="rounded-xl border px-3 py-2 text-lg text-slate-500 hover:bg-slate-50" onClick={() => setOpen(false)}>×</button></header>
        <div className="p-6">
          {!!audit.fields?.length && <dl className="grid grid-cols-2 gap-4 border-b pb-6">{audit.fields.map((field) => <Info key={field.label} label={field.label} value={field.value}/>)}</dl>}
          <div className="mt-6 space-y-5"><Timeline label="Created" user={audit.createdBy} time={audit.createdAt}/>{(audit.updatedAt || audit.updatedBy) && <Timeline label="Last Updated" user={audit.updatedBy ?? audit.createdBy} time={audit.updatedAt}/>}</div>
        </div>
        <footer className="border-t p-4"><button className="w-full rounded-xl bg-blue-600 py-3 font-black text-white hover:bg-blue-700" onClick={() => setOpen(false)}>Close</button></footer>
      </section>
    </div>}
  </>;
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 font-bold text-slate-800">{value ?? "—"}</dd></div>;
}
function Timeline({ label, user, time }: { label: string; user?: string | null; time?: string | null }) {
  return <div className="flex gap-4"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">✓</span><div><p className="font-black">{label}</p><p className="mt-0.5 text-sm text-slate-600">by <strong>{user || "System"}</strong></p><p className="text-xs text-slate-400">{time ? new Date(time).toLocaleString() : "Timestamp unavailable"}</p></div></div>;
}
