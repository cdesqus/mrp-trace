"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Activity = {
  id: number;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  created_at: string;
  user: { full_name: string; username: string };
};

export function ActivityTrail({ module }: { module: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ items: Activity[] }>(`/api/audit-logs?module=${encodeURIComponent(module)}`);
      setItems(result.items);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <>
      <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700" onClick={() => setOpen(true)}>
        <span aria-hidden>◷</span> Activity
      </button>
      {open && (
        <div className="fixed inset-0 z-[180] bg-slate-950/40 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside className="ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{module}</p>
                <h2 className="mt-1 text-2xl font-black">Activity Trail</h2>
                <p className="mt-1 text-sm text-slate-500">Who performed each change and when.</p>
              </div>
              <button aria-label="Close activity trail" className="rounded-xl p-2 text-xl text-slate-400 hover:bg-slate-100" onClick={() => setOpen(false)}>×</button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">
              {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              {loading && <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <div className="h-20 animate-pulse rounded-2xl bg-slate-100" key={index} />)}</div>}
              {!loading && !items.length && !error && <div className="py-20 text-center"><p className="text-3xl">◷</p><h3 className="mt-3 font-black">No recorded activity yet</h3><p className="mt-1 text-sm text-slate-500">New changes in this module will appear here.</p></div>}
              {!loading && <div className="space-y-3">{items.map((item) => (
                <article className="rounded-2xl border border-slate-200 p-4" key={item.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">{item.action}</span>
                    <time className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time>
                  </div>
                  <p className="mt-3 font-bold capitalize">{item.entity_type.replaceAll("_", " ")}{item.entity_id ? ` #${item.entity_id}` : ""}</p>
                  <p className="mt-1 text-sm text-slate-500">by <strong className="text-slate-700">{item.user.full_name}</strong> · @{item.user.username}</p>
                </article>
              ))}</div>}
            </div>
            <footer className="border-t p-4"><button className="w-full rounded-xl border py-3 font-black hover:bg-slate-50" onClick={() => void load()}>Refresh Activity</button></footer>
          </aside>
        </div>
      )}
    </>
  );
}
