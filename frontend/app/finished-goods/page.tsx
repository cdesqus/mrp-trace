"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { api } from "@/lib/api";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { useSearchParams } from "next/navigation";

type FinishedGood={
  id:number;master_box_code:string;small_box_qty:number;unit_qty:number;packed_at:string;
  production_order:string;so_number:string;product_code:string;product_name:string;
  stock_status:"AVAILABLE"|"ALLOCATED"|"SHIPPED";delivery_order:string|null;
  small_box_codes:string[];serial_from:string|null;serial_to:string|null;
};
type BoxDetail={box_code:string;qty:number;packed_at:string;serial_from:string;serial_to:string;serials:string[]};
type FinishedGoodDetail=FinishedGood&{small_boxes:BoxDetail[]};

export default function FinishedGoodsPage(){
  const searchParams=useSearchParams();
  const [items,setItems]=useState<FinishedGood[]>([]);
  const [query,setQuery]=useState(searchParams.get("search")??"");
  const [status,setStatus]=useState("ALL");
  const [selected,setSelected]=useState<FinishedGoodDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{setLoading(true);try{setItems((await api<{items:FinishedGood[]}>("/api/finished-goods")).items);setMessage("")}catch(e){setMessage((e as Error).message)}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  async function open(code:string){try{setSelected(await api<FinishedGoodDetail>(`/api/finished-goods/${encodeURIComponent(code)}`))}catch(e){setMessage((e as Error).message)}}
  useHardwareScanner(code=>void open(code.trim().toUpperCase()),true);
  const visible=useMemo(()=>items.filter(item=>{
    const text=`${item.master_box_code} ${item.product_code} ${item.product_name} ${item.production_order} ${item.so_number} ${item.delivery_order??""}`.toLowerCase();
    return (status==="ALL"||item.stock_status===status)&&text.includes(query.trim().toLowerCase());
  }),[items,query,status]);
  const summary=useMemo(()=>({
    available:items.filter(item=>item.stock_status==="AVAILABLE").reduce((sum,item)=>sum+item.unit_qty,0),
    allocated:items.filter(item=>item.stock_status==="ALLOCATED").reduce((sum,item)=>sum+item.unit_qty,0),
    shipped:items.filter(item=>item.stock_status==="SHIPPED").reduce((sum,item)=>sum+item.unit_qty,0),
    masters:items.filter(item=>item.stock_status==="AVAILABLE").length,
  }),[items]);
  return <ModulePage eyebrow="Logistics & Packing" title="Finished Goods" description="Automatic stock visibility from completed Master Boxes. No manual stock entry is required." actions={<button className="rounded-xl border bg-white px-4 py-2.5 text-sm font-black text-blue-700" onClick={()=>void load()}>Refresh Stock</button>}>
    {message&&<p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StockCard label="Available FG" value={summary.available} detail={`${summary.masters} Master Boxes`} tone="emerald"/>
      <StockCard label="Allocated to Delivery" value={summary.allocated} detail="Reserved for open DO" tone="blue"/>
      <StockCard label="Shipped FG" value={summary.shipped} detail="Completed delivery" tone="slate"/>
      <StockCard label="Total Master Boxes" value={items.length} detail="All stock statuses" tone="amber"/>
    </section>
    <section className="card mt-5 overflow-hidden p-0">
      <header className="grid gap-3 border-b p-5 lg:grid-cols-[1fr_220px]"><input autoFocus className="field text-base" placeholder="Scan or search Master Box, Product, PO, SO…" value={query} onChange={e=>setQuery(e.target.value)}/><select className="field text-base" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All Statuses</option><option value="AVAILABLE">Available</option><option value="ALLOCATED">Allocated</option><option value="SHIPPED">Shipped</option></select></header>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Master Box","Product","PO / SO","Small Boxes","FG Qty","Packed","Status","Actions"].map(h=><th className="px-5 py-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y">{visible.map(item=><tr className="hover:bg-slate-50" key={item.id}><td className="px-5 py-4 font-mono font-black">{item.master_box_code}</td><td className="px-5 py-4"><b>{item.product_code}</b><p className="text-xs text-slate-500">{item.product_name}</p></td><td className="px-5 py-4 text-sm"><b>{item.production_order}</b><p className="text-xs text-slate-500">{item.so_number}</p></td><td className="px-5 py-4 font-black">{item.small_box_qty}</td><td className="px-5 py-4 text-lg font-black">{item.unit_qty}</td><td className="px-5 py-4 text-sm text-slate-500">{new Date(item.packed_at).toLocaleString()}</td><td className="px-5 py-4"><Status value={item.stock_status}/>{item.delivery_order&&<p className="mt-1 text-xs font-bold">{item.delivery_order}</p>}</td><td className="px-5 py-4"><button className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50" onClick={()=>void open(item.master_box_code)}>Parts</button></td></tr>)}</tbody></table></div>
      {!loading&&!visible.length&&<p className="py-16 text-center text-sm text-slate-500">No Finished Goods match this filter.</p>}
      {loading&&<p className="py-16 text-center text-sm font-bold text-slate-500">Loading Finished Goods…</p>}
    </section>
    {selected&&<div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex justify-between gap-4 border-b p-6"><div><p className="text-xs font-black uppercase tracking-wider text-blue-700">Finished Goods Trace</p><h2 className="mt-1 font-mono text-2xl font-black">{selected.master_box_code}</h2><p className="mt-1 text-sm text-slate-500">{selected.product_code} · {selected.unit_qty} FG · <Status value={selected.stock_status}/></p></div><button className="h-10 w-10 rounded-xl border text-xl" onClick={()=>setSelected(null)}>×</button></header><div className="overflow-y-auto p-6"><div className="grid gap-3 md:grid-cols-3"><Info label="Production Order" value={selected.production_order}/><Info label="Sales Order" value={selected.so_number}/><Info label="Delivery Order" value={selected.delivery_order??"Not allocated"}/></div><h3 className="mt-6 text-lg font-black">Contained Small Boxes &amp; Serials</h3><div className="mt-3 space-y-3">{selected.small_boxes.map((box,index)=><details className="rounded-2xl border bg-slate-50 p-4" key={box.box_code}><summary className="cursor-pointer list-none"><div className="flex justify-between gap-4"><div><span className="mr-3 rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">#{index+1}</span><b className="font-mono">{box.box_code}</b></div><span className="text-sm font-black">{box.qty} FG</span></div><p className="mt-2 font-mono text-xs text-slate-500">{box.serial_from} → {box.serial_to}</p></summary><div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-3 lg:grid-cols-4">{box.serials.map(serial=><span className="rounded-lg bg-white px-2 py-1.5 font-mono text-xs font-bold ring-1 ring-slate-200" key={serial}>{serial}</span>)}</div></details>)}</div></div></section></div>}
  </ModulePage>
}

function StockCard({label,value,detail,tone}:{label:string;value:number;detail:string;tone:"emerald"|"blue"|"slate"|"amber"}){
  const style={emerald:"bg-emerald-50 text-emerald-900",blue:"bg-blue-50 text-blue-900",slate:"bg-slate-100 text-slate-900",amber:"bg-amber-50 text-amber-900"}[tone];
  return <article className={`rounded-2xl p-5 ${style}`}><p className="text-xs font-black uppercase tracking-wider opacity-70">{label}</p><p className="mt-2 text-4xl font-black">{value.toLocaleString()}</p><p className="mt-1 text-sm opacity-70">{detail}</p></article>
}
function Status({value}:{value:string}){const style=value==="AVAILABLE"?"bg-emerald-50 text-emerald-700":value==="ALLOCATED"?"bg-blue-50 text-blue-700":"bg-slate-200 text-slate-700";return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${style}`}>{value}</span>}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div>}
function TableViewIcon({label,onClick}:{label:string;onClick:()=>void}){return <button aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm hover:bg-blue-50" title={label} onClick={onClick}><svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button>}
