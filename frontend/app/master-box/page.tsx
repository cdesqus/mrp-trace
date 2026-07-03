"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";

const capacity = Number(process.env.NEXT_PUBLIC_MASTER_BOX_CAPACITY ?? 12);

export default function MasterBoxPage() {
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("Scan Small Box QR");
  const [busy, setBusy] = useState(false);
  function add(code: string) {
    if (busy || codes.includes(code)) return;
    const next = [...codes, code];
    setCodes(next);
    if (next.length === capacity) void lock(next);
  }
  useHardwareScanner(add, !busy);
  async function lock(items: string[]) {
    setBusy(true);
    try {
      const result = await api<{ master_box_code: string }>("/api/packing/master-box", {
        method: "POST", body: JSON.stringify({ small_box_codes: items, idempotency_key: crypto.randomUUID() }),
      });
      setMessage(`${result.master_box_code} completed`); setCodes([]);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <main className="mx-auto max-w-3xl p-6 text-center">
      <h1 className="text-3xl font-black">Master Box Packing</h1>
      <div className="card mt-6">
        <p className="text-7xl font-black text-blue-800">{codes.length} / {capacity}</p>
        <p className="mt-4 text-slate-600">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="primary" disabled={!codes.length || busy} onClick={() => setCodes(value => value.slice(0, -1))}>Undo Last Scan</button>
          <button className="primary" disabled={!codes.length || busy} onClick={() => lock(codes)}>Lock Partial Box</button>
        </div>
      </div>
    </main>
  );
}
