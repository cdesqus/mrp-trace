"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AuthUser } from "@/lib/auth-types";

type Branding={app_name:string;login_wallpaper_data_url:string|null};

export default function LoginPage(){
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [branding,setBranding]=useState<Branding>({app_name:"MRP Traceability",login_wallpaper_data_url:null});
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [showPassword,setShowPassword]=useState(false);

  useEffect(()=>{
    void api<Branding>("/api/public/branding").then(setBranding).catch(()=>undefined);
    if(new URLSearchParams(window.location.search).get("reason")==="inactive")setNotice("Session ended after 15 minutes of inactivity.");
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");
    try{await api<AuthUser>("/api/auth/login",{method:"POST",body:JSON.stringify({username,password})});window.location.href="/"}
    catch(reason){setError((reason as Error).message)}
    finally{setBusy(false)}
  }

  const wallpaperStyle=branding.login_wallpaper_data_url?{backgroundImage:`url("${branding.login_wallpaper_data_url}")`}:undefined;
  return <main className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1.18fr)_minmax(500px,0.82fr)]">
    <section className="relative min-h-[240px] overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-700 bg-cover bg-center p-7 text-white sm:p-11 lg:min-h-screen lg:p-16" style={wallpaperStyle}>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/75 via-blue-950/35 to-blue-900/15"/>
      <div className="absolute -bottom-36 -right-36 h-[430px] w-[430px] rounded-full border-[74px] border-white/[.055]"/>
      <div className="absolute right-[12%] top-[12%] hidden h-40 w-40 rounded-full border border-white/10 lg:block"/>
      <div className="absolute left-[17%] top-[46%] hidden lg:block"><span className="absolute left-0 top-0 h-3 w-3 rounded-full bg-blue-200/80 shadow-[0_0_24px_rgba(191,219,254,.8)]"/><span className="absolute left-40 top-24 h-2.5 w-2.5 rounded-full bg-white/70"/><span className="absolute left-80 top-2 h-3 w-3 rounded-full bg-indigo-200/70"/><span className="absolute left-2 top-1 h-px w-44 origin-left rotate-[30deg] bg-gradient-to-r from-blue-200/60 to-white/10"/><span className="absolute left-40 top-24 h-px w-48 origin-left -rotate-[28deg] bg-gradient-to-r from-white/40 to-indigo-200/10"/></div>
      <div className="relative flex h-full min-h-[182px] flex-col justify-between lg:min-h-[calc(100vh-8rem)]">
        <h1 className="max-w-3xl text-[clamp(2.5rem,4vw,4.75rem)] font-black leading-[1.02] tracking-[-0.045em] drop-shadow-lg">{branding.app_name||"MRP Traceability"}</h1>
        <div className="hidden items-center gap-3 lg:flex"><span className="h-px w-20 bg-white/45"/><span className="h-2.5 w-2.5 rounded-full bg-blue-200 shadow-[0_0_18px_rgba(191,219,254,.8)]"/><span className="h-px w-36 bg-white/20"/></div>
      </div>
    </section>
    <section className="relative flex min-h-[calc(100vh-240px)] items-center justify-center overflow-hidden bg-gradient-to-br from-white via-blue-50/40 to-slate-100 px-6 py-12 sm:px-12 lg:min-h-screen lg:px-14">
      <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl"/>
      <div className="absolute -bottom-36 -left-24 h-80 w-80 rounded-full bg-indigo-200/35 blur-3xl"/>
      <div className="absolute right-12 top-12 h-24 w-24 rounded-full border border-blue-200/60"/>
      <form className="relative w-full max-w-[470px] rounded-[2rem] border border-white/80 bg-white/80 p-7 shadow-[0_30px_80px_-28px_rgba(15,23,42,.28)] backdrop-blur-xl sm:p-10" onSubmit={submit}>
        <div className="mb-9"><span className="block h-1.5 w-14 rounded-full bg-gradient-to-r from-blue-700 to-indigo-500"/><h2 className="mt-6 text-4xl font-black tracking-[-0.035em] text-slate-950">Sign In</h2></div>
        <div className="space-y-5">
          <label className="block text-sm font-black text-slate-700">Username<span className="relative mt-2 block">{!username&&<UserIcon/>}<input autoFocus className="field border-slate-300 bg-white/70 text-base shadow-sm transition-[padding] focus:bg-white" style={{paddingLeft:username?"1rem":"3rem"}} autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)}/></span></label>
          <label className="block text-sm font-black text-slate-700">Password<span className="relative mt-2 block">{!password&&<LockIcon/>}<input className="field border-slate-300 bg-white/70 pr-12 text-base shadow-sm transition-[padding] focus:bg-white" style={{paddingLeft:password?"1rem":"3rem"}} type={showPassword?"text":"password"} autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/><button aria-label={showPassword?"Hide password":"Show password"} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-700" title={showPassword?"Hide password":"Show password"} type="button" onClick={()=>setShowPassword(current=>!current)}><EyeIcon open={showPassword}/></button></span></label>
        </div>
        {notice&&<p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-700">{notice}</p>}
        {error&&<p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
        <button className="mt-7 w-full rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600 px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0" disabled={busy||!username||!password}>{busy?"Signing in…":"Sign In"}</button>
      </form>
    </section>
  </main>;
}

function UserIcon(){return <svg aria-hidden className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>}
function LockIcon(){return <svg aria-hidden className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>}
function EyeIcon({open}:{open:boolean}){return <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">{open?<><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a16.8 16.8 0 0 1-2.1 3.1M6.2 6.2C3.8 8 2.5 12 2.5 12S6 19 12 19c1.5 0 2.8-.4 4-.9"/></>:<><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7S18 19 12 19 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/></>}</svg>}
