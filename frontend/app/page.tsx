"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type DashboardData={
  generated_at:string;
  kpis:{open_sales_orders:number;open_order_qty:number;qc_today:number;qc_pass_rate:number;open_rework:number;available_fg:number;available_master_boxes:number;deliveries_due:number};
  throughput:Array<{date:string;qc_inspected:number;qc_passed:number;packed:number;pass_rate:number}>;
  wip:Array<{key:string;label:string;quantity:number;href:string}>;
  orders:Array<{so_number:string;customer:string;product_code:string;ordered_qty:number;packed_qty:number;shipped_qty:number;progress:number;target_date:string|null;risk:string}>;
  quality:{total:number;passed:number;rejected:number;defects:Array<{reason:string;count:number}>};
  inventory:Array<{product_code:string;product_name:string;master_boxes:number;available_qty:number;allocated_qty:number;oldest_at:string|null}>;
  deliveries:Array<{do_number:string;customer:string;delivery_date:string;allocated_qty:number;status:string}>;
  actions:Array<{level:"HIGH"|"MEDIUM";title:string;detail:string;href:string;count:number}>;
};

export default function Dashboard(){
  const [data,setData]=useState<DashboardData|null>(null),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);try{setData(await api<DashboardData>("/api/dashboard"));setMessage("")}catch(e){setMessage((e as Error).message)}finally{setLoading(false)}},[]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer)},[load]);
  if(!data)return <main className="mx-auto w-full max-w-[1500px] p-6 lg:p-8">{message?<p className="rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{message}</p>:<DashboardSkeleton/>}</main>;
  const qualityRate=data.quality.total?Math.round(data.quality.passed/data.quality.total*1000)/10:0;
  return <main className="mx-auto w-full max-w-[1500px] p-5 lg:p-8">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="flex items-center gap-3"><p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">Main Overview</p><span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"/>LIVE</span></div><h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Operations Dashboard</h1></div><div className="print-hidden flex items-center gap-2"><p className="mr-2 text-xs text-slate-400">Updated {new Date(data.generated_at).toLocaleTimeString()}</p><button className="rounded-xl border bg-white px-4 py-2.5 text-sm font-black text-blue-700 shadow-sm" onClick={()=>void load()}>Refresh</button><button className="rounded-xl border bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm" onClick={()=>window.print()}>Print</button></div></header>
    {message&&<p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</p>}

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KPI label="Open Sales Orders" value={data.kpis.open_sales_orders} detail={`${data.kpis.open_order_qty.toLocaleString()} ordered FG`} color="blue" href="/sales-orders"/>
      <KPI label="QC Output Today" value={data.kpis.qc_today} detail={`${data.kpis.qc_pass_rate}% pass rate`} color="indigo" href="/qc"/>
      <KPI label="Open Rework" value={data.kpis.open_rework} detail={data.kpis.open_rework?"Action required":"Queue is clear"} color="amber" href="/qc/rework"/>
      <KPI label="Available Finished Goods" value={data.kpis.available_fg} detail={`${data.kpis.available_master_boxes} Master Boxes`} color="emerald" href="/finished-goods"/>
      <KPI label="Delivery Due" value={data.kpis.deliveries_due} detail="Due today or overdue" color="rose" href="/delivery-orders"/>
    </section>

    <section className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <article className="card overflow-hidden"><Title title="Production Throughput" subtitle="Daily QC output, packing completion, and pass-rate trend · Last 7 days"/><ThroughputChart items={data.throughput}/></article>
      <article className="card"><Title title="Current WIP Pipeline" subtitle="Live quantity at each operational stage"/><div className="mt-5 space-y-3">{data.wip.map((stage,index)=><WIPRow item={stage} max={Math.max(...data.wip.map(item=>item.quantity),1)} index={index} key={stage.key}/>)}</div></article>
    </section>

    <section className="card mt-5 overflow-hidden p-0"><header className="flex items-center justify-between border-b p-5"><Title title="Sales Order Fulfillment" subtitle="Packed and shipped progress against customer demand"/><Link className="print-hidden text-sm font-black text-blue-700" href="/sales-orders">View all →</Link></header><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Sales Order","Customer / Product","Ordered","Packed","Shipped","Fulfillment","Target","Status"].map(h=><th className="px-5 py-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y">{data.orders.map(order=><tr className="hover:bg-slate-50" key={`${order.so_number}-${order.product_code}`}><td className="px-5 py-4 font-black text-blue-950">{order.so_number}</td><td className="px-5 py-4"><b>{order.customer}</b><p className="text-xs text-slate-500">{order.product_code}</p></td><td className="px-5 py-4 font-bold">{order.ordered_qty.toLocaleString()}</td><td className="px-5 py-4">{order.packed_qty.toLocaleString()}</td><td className="px-5 py-4">{order.shipped_qty.toLocaleString()}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${order.risk==="AT_RISK"?"bg-rose-500":"bg-blue-600"}`} style={{width:`${Math.min(100,order.progress)}%`}}/></div><b className="text-sm">{order.progress}%</b></div></td><td className="px-5 py-4 text-sm text-slate-500">{order.target_date?new Date(order.target_date).toLocaleDateString():"—"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${order.risk==="AT_RISK"?"bg-rose-50 text-rose-700":"bg-emerald-50 text-emerald-700"}`}>{order.risk==="AT_RISK"?"AT RISK":"ON TRACK"}</span></td></tr>)}</tbody></table></div>{!data.orders.length&&<Empty text="No Sales Orders available."/>}</section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
      <article className="card"><Title title="Quality Snapshot" subtitle="Initial QC performance and top NG categories"/><div className="mt-5 grid items-center gap-6 sm:grid-cols-[170px_1fr]"><QualityDonut rate={qualityRate} passed={data.quality.passed} rejected={data.quality.rejected}/><div className="space-y-3">{data.quality.defects.map(defect=><DefectBar item={defect} max={Math.max(...data.quality.defects.map(item=>item.count),1)} key={defect.reason}/>)}{!data.quality.defects.length&&<p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">No NG recorded in this period.</p>}</div></div></article>
      <article className="card overflow-hidden p-0"><header className="flex items-center justify-between border-b p-5"><Title title="Finished Goods Snapshot" subtitle="Available and allocated FG by product"/><Link className="print-hidden text-sm font-black text-blue-700" href="/finished-goods">Open stock →</Link></header><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Product","Master Boxes","Available FG","Allocated FG","Oldest Stock"].map(h=><th className="px-5 py-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y">{data.inventory.map(item=><tr key={item.product_code}><td className="px-5 py-4"><b>{item.product_code}</b><p className="text-xs text-slate-500">{item.product_name}</p></td><td className="px-5 py-4 font-black">{item.master_boxes}</td><td className="px-5 py-4 text-lg font-black text-emerald-700">{item.available_qty.toLocaleString()}</td><td className="px-5 py-4 font-bold text-blue-700">{item.allocated_qty.toLocaleString()}</td><td className="px-5 py-4 text-sm text-slate-500">{item.oldest_at?`${Math.max(0,Math.floor((Date.now()-new Date(item.oldest_at).getTime())/86400000))} days`:"—"}</td></tr>)}</tbody></table></div>{!data.inventory.length&&<Empty text="No Finished Goods available."/>}</article>
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <article className="card overflow-hidden p-0"><header className="flex items-center justify-between border-b p-5"><Title title="Delivery Readiness" subtitle="Upcoming Delivery Orders and allocated FG"/><Link className="print-hidden text-sm font-black text-blue-700" href="/delivery-orders">Open deliveries →</Link></header><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Delivery Order","Customer","Delivery Date","Allocated FG","Status"].map(h=><th className="px-5 py-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y">{data.deliveries.map(item=><tr key={item.do_number}><td className="px-5 py-4 font-black">{item.do_number}</td><td className="px-5 py-4">{item.customer}</td><td className="px-5 py-4 text-sm">{new Date(item.delivery_date).toLocaleDateString()}</td><td className="px-5 py-4 text-lg font-black">{item.allocated_qty.toLocaleString()}</td><td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{item.status}</span></td></tr>)}</tbody></table></div>{!data.deliveries.length&&<Empty text="No upcoming Delivery Orders."/>}</article>
      <article className="card"><div className="flex items-center justify-between"><Title title="Action Required" subtitle="Business-process exceptions requiring attention"/><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">{data.actions.length}</span></div><div className="mt-5 space-y-3">{data.actions.map(action=><Link className="block rounded-2xl border p-4 transition hover:border-blue-300 hover:bg-blue-50/40" href={action.href} key={action.title}><div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${action.level==="HIGH"?"bg-rose-500":"bg-amber-500"}`}/><div><div className="flex items-center gap-2"><b>{action.title}</b><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${action.level==="HIGH"?"bg-rose-50 text-rose-700":"bg-amber-50 text-amber-700"}`}>{action.level}</span></div><p className="mt-1 text-sm leading-5 text-slate-500">{action.detail}</p></div></div></Link>)}{!data.actions.length&&<div className="rounded-2xl bg-emerald-50 p-5 text-center"><p className="text-2xl">✓</p><p className="mt-2 font-black text-emerald-800">No urgent actions</p><p className="text-sm text-emerald-600">Current business flow is on track.</p></div>}</div></article>
    </section>
  </main>
}

function KPI({label,value,detail,color,href}:{label:string;value:number;detail:string;color:"blue"|"indigo"|"amber"|"emerald"|"rose";href:string}){const style={blue:"from-blue-600 to-blue-800",indigo:"from-indigo-600 to-violet-700",amber:"from-amber-500 to-orange-600",emerald:"from-emerald-500 to-teal-700",rose:"from-rose-500 to-red-700"}[color];return <Link className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl ${style}`} href={href}><span className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10"/><p className="relative text-xs font-black uppercase tracking-wider text-white/75">{label}</p><p className="relative mt-3 text-4xl font-black">{value.toLocaleString()}</p><p className="relative mt-1 text-sm text-white/75">{detail}</p></Link>}
function Title({title,subtitle}:{title:string;subtitle:string}){return <div><h2 className="text-lg font-black">{title}</h2><p className="mt-0.5 text-sm text-slate-500">{subtitle}</p></div>}
function WIPRow({item,max,index}:{item:DashboardData["wip"][number];max:number;index:number}){const colors=["bg-blue-600","bg-amber-500","bg-indigo-600","bg-violet-600","bg-emerald-600"];return <Link className="block rounded-xl border p-3 transition hover:border-blue-300 hover:bg-blue-50" href={item.href}><div className="flex items-center justify-between"><span className="text-sm font-bold">{item.label}</span><span className="text-lg font-black">{item.quantity.toLocaleString()}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${colors[index%colors.length]}`} style={{width:`${Math.max(item.quantity?4:0,item.quantity/max*100)}%`}}/></div></Link>}
function ThroughputChart({items}:{items:DashboardData["throughput"]}){
  const max=Math.max(...items.flatMap(item=>[item.qc_inspected,item.packed]),1);
  const width=820,leftPad=54,rightPad=58,plotTop=24,plotH=172,plotW=width-leftPad-rightPad,step=plotW/Math.max(items.length,1);
  const yForQty=(value:number)=>plotTop+plotH-(value/max*plotH);
  const yForRate=(value:number)=>plotTop+plotH-(Math.max(0,Math.min(100,value))/100*plotH);
  const points=items.map((item,index)=>`${leftPad+step*index+step/2},${yForRate(item.pass_rate)}`).join(" ");
  const qtyTicks=[max,Math.round(max/2),0];
  const rateTicks=[100,50,0];
  return <div className="mt-4">
    <div className="overflow-x-auto pb-1">
      <svg className="h-[268px] min-w-[720px] w-full" viewBox={`0 0 ${width} 258`} role="img" aria-label="Seven day throughput chart">
        <defs><linearGradient id="qcBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2563eb"/><stop offset="1" stopColor="#93c5fd"/></linearGradient></defs>
        {[0,1,2,3,4].map(index=><line key={index} x1={leftPad} x2={width-rightPad} y1={plotTop+index*plotH/4} y2={plotTop+index*plotH/4} stroke="#e2e8f0" strokeDasharray="4 5"/>)}
        {qtyTicks.map(value=><text key={`qty-${value}`} x={leftPad-10} y={yForQty(value)+4} textAnchor="end" fill="#64748b" fontSize="10" fontWeight="700">{value}</text>)}
        {rateTicks.map(value=><text key={`rate-${value}`} x={width-rightPad+10} y={yForRate(value)+4} fill="#d97706" fontSize="10" fontWeight="700">{value}%</text>)}
        <text x={leftPad} y={12} fill="#64748b" fontSize="10" fontWeight="800">Qty</text>
        <text x={width-rightPad} y={12} textAnchor="end" fill="#d97706" fontSize="10" fontWeight="800">Pass rate</text>
        {items.map((item,index)=>{
          const center=leftPad+step*index+step/2;
          const barWidth=Math.min(32,step*.32);
          const gap=6;
          const both=item.qc_inspected>0&&item.packed>0;
          const qcX=both?center-gap/2-barWidth:center-barWidth/2;
          const packedX=both?center+gap/2:center-barWidth/2;
          const qcH=item.qc_inspected/max*plotH;
          const packedH=item.packed/max*plotH;
          const qcY=yForQty(item.qc_inspected);
          const packedY=yForQty(item.packed);
          return <g key={item.date}>
            <title>{`${formatChartDate(item.date)}: ${item.qc_inspected} QC inspected, ${item.packed} packed FG, ${item.pass_rate}% pass rate`}</title>
            {item.qc_inspected>0&&<><rect x={qcX} y={qcY} width={barWidth} height={qcH} rx="6" fill="url(#qcBar)"/><text x={qcX+barWidth/2} y={Math.max(12,qcY-7)} textAnchor="middle" fill="#2563eb" fontSize="11" fontWeight="700">{item.qc_inspected}</text></>}
            {item.packed>0&&<><rect x={packedX} y={packedY} width={barWidth} height={packedH} rx="6" fill="#10b981"/><text x={packedX+barWidth/2} y={Math.max(12,packedY-7)} textAnchor="middle" fill="#059669" fontSize="11" fontWeight="700">{item.packed}</text></>}
            <text x={center} y={226} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">{formatChartDate(item.date)}</text>
          </g>;
        })}
        <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round"/>
        {items.map((item,index)=>{
          const x=leftPad+step*index+step/2,y=yForRate(item.pass_rate);
          return <g key={item.date}>
            <circle cx={x} cy={y} r="4" fill="#fff" stroke="#f59e0b" strokeWidth="3"/>
            {item.pass_rate>0&&<text x={x} y={Math.max(12,y-10)} textAnchor="middle" fill="#d97706" fontSize="10" fontWeight="800">{item.pass_rate}%</text>}
          </g>;
        })}
      </svg>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-7 gap-y-2 px-2 text-xs font-semibold text-slate-500">
      <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-blue-600"/>QC Inspected</span>
      <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-emerald-500"/>Packed FG</span>
      <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-amber-500"/>Pass Rate (%)</span>
    </div>
  </div>
}
function formatChartDate(date:string){return new Date(`${date}T00:00:00`).toLocaleDateString("en-US",{day:"2-digit",month:"short"})}
function QualityDonut({rate,passed,rejected}:{rate:number;passed:number;rejected:number}){return <div className="text-center"><div className="relative mx-auto h-40 w-40 rounded-full" style={{background:`conic-gradient(#10b981 0 ${rate}%,#f43f5e ${rate}% 100%)`}}><div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white"><b className="text-3xl">{rate}%</b><span className="text-xs font-bold text-slate-500">FPY</span></div></div><div className="mt-3 flex justify-center gap-4 text-xs"><span className="font-bold text-emerald-700">● {passed} OK</span><span className="font-bold text-rose-700">● {rejected} NG</span></div></div>}
function DefectBar({item,max}:{item:{reason:string;count:number};max:number}){return <div><div className="flex justify-between gap-3 text-xs"><span className="font-bold">{item.reason}</span><b>{item.count}</b></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-500" style={{width:`${item.count/max*100}%`}}/></div></div>}
function Empty({text}:{text:string}){return <p className="py-12 text-center text-sm text-slate-500">{text}</p>}
function DashboardSkeleton(){return <div className="space-y-5"><div className="h-24 animate-pulse rounded-2xl bg-slate-200"/><div className="grid grid-cols-5 gap-4">{Array.from({length:5}).map((_,i)=><div className="h-32 animate-pulse rounded-2xl bg-slate-200" key={i}/>)}</div><div className="h-80 animate-pulse rounded-2xl bg-slate-200"/></div>}
