"use client";

import { FormEvent, useEffect, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { api } from "@/lib/api";

type Branding={app_name:string;login_wallpaper_data_url:string|null;updated_at?:string};

export default function BrandingPage(){
  const [form,setForm]=useState<Branding>({app_name:"MRP Traceability",login_wallpaper_data_url:null});
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{void api<Branding>("/api/public/branding").then(setForm).catch(reason=>setError((reason as Error).message))},[]);

  function selectWallpaper(file?:File){
    if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError("Wallpaper must be JPEG, PNG, or WebP.");return}
    if(file.size>5*1024*1024){setError("Wallpaper must not exceed 5 MB.");return}
    const reader=new FileReader();
    reader.onload=()=>{setForm(current=>({...current,login_wallpaper_data_url:String(reader.result)}));setError("");setMessage("")};
    reader.onerror=()=>setError("The selected wallpaper could not be read.");
    reader.readAsDataURL(file);
  }

  async function save(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");setMessage("");
    try{const result=await api<Branding>("/api/settings/branding",{method:"PUT",body:JSON.stringify(form)});setForm(result);setMessage("Login branding saved. Refresh the login page to view it.")}
    catch(reason){setError((reason as Error).message)}
    finally{setSaving(false)}
  }

  return <ModulePage eyebrow="Settings" title="Branding" description="Customize the application identity and login wallpaper.">
    <form className="grid gap-5 xl:grid-cols-[420px_1fr]" onSubmit={save}>
      <section className="card h-fit">
        <h2 className="text-lg font-black">Application Identity</h2>
        <label className="mt-5 block text-sm font-black">Application Name<input className="field mt-2 text-base" maxLength={100} value={form.app_name} onChange={event=>setForm({...form,app_name:event.target.value})}/></label>
        <div className="mt-5"><p className="text-sm font-black">Login Wallpaper</p><p className="mt-1 text-xs leading-5 text-slate-500">JPEG, PNG, or WebP. Recommended 1920 × 1080, maximum 5 MB.</p><div className="mt-3 flex gap-2"><label className="primary cursor-pointer text-center">Choose Image<input accept="image/jpeg,image/png,image/webp" className="hidden" type="file" onChange={event=>selectWallpaper(event.target.files?.[0])}/></label>{form.login_wallpaper_data_url&&<button className="rounded-xl border border-red-200 px-4 py-3 font-black text-red-600 hover:bg-red-50" type="button" onClick={()=>setForm({...form,login_wallpaper_data_url:null})}>Remove</button>}</div></div>
        {error&&<p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
        {message&&<p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>}
        <button className="primary mt-6 w-full" disabled={saving||!form.app_name.trim()}>{saving?"Saving…":"Save Branding"}</button>
      </section>
      <section className="card overflow-hidden p-0">
        <header className="border-b p-5"><h2 className="font-black">Login Preview</h2></header>
        <div className="grid min-h-[600px] overflow-hidden lg:grid-cols-[1.15fr_.85fr]">
          <div className="relative bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-700 bg-cover bg-center p-8 text-white" style={form.login_wallpaper_data_url?{backgroundImage:`url("${form.login_wallpaper_data_url}")`}:undefined}><div className="absolute inset-0 bg-gradient-to-br from-slate-950/75 via-blue-950/35 to-blue-900/15"/><h3 className="relative text-4xl font-black leading-none tracking-tight">{form.app_name||"MRP Traceability"}</h3></div>
          <div className="relative flex items-center overflow-hidden bg-gradient-to-br from-white via-blue-50/40 to-slate-100 p-7"><div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-blue-200/50 blur-3xl"/><div className="relative w-full rounded-3xl border border-white bg-white/80 p-6 shadow-xl"><span className="block h-1.5 w-12 rounded-full bg-gradient-to-r from-blue-700 to-indigo-500"/><h3 className="mt-5 text-3xl font-black">Sign In</h3><div className="mt-7 space-y-4"><div className="h-12 rounded-xl border bg-white"/><div className="h-12 rounded-xl border bg-white"/><div className="h-12 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600"/></div></div></div>
        </div>
      </section>
    </form>
  </ModulePage>
}
