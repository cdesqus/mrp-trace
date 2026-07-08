"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { AuthUser } from "@/lib/auth-types";

type IconName =
  | "dashboard" | "masterdata" | "customer" | "product" | "configuration"
  | "production" | "sales" | "trays" | "quality" | "rework"
  | "logistics" | "packing" | "delivery" | "analytics" | "trace"
  | "inventory" | "settings" | "logout" | "menu" | "panel" | "chevron";

type NavGroup = {
  key: string;
  label: string;
  icon: IconName;
  children: Array<{ href: string; label: string; icon: IconName; permission: string }>;
};

const groups: NavGroup[] = [
  {
    key: "masterdata",
    label: "Master Data",
    icon: "masterdata",
    children: [
      { href: "/master-data/customers", label: "Customers", icon: "customer", permission:"master.view" },
      { href: "/master-data/products", label: "Products", icon: "product", permission:"master.view" },
      { href: "/master-data/packaging", label: "Packaging", icon: "configuration", permission:"master.view" },
      { href: "/master-data/trays", label: "Tray Labels", icon: "trays", permission:"master.view" },
    ],
  },
  {
    key: "production",
    label: "Production",
    icon: "production",
    children: [
      { href: "/sales-orders", label: "Sales Orders", icon: "sales", permission:"sales.view" },
      { href: "/laser-marking", label: "Laser Marking", icon: "trace", permission:"laser.view" },
    ],
  },
  {
    key: "quality",
    label: "Quality Control",
    icon: "quality",
    children: [
      { href: "/qc", label: "Initial QC", icon: "quality", permission:"qc.view" },
      { href: "/qc/rework", label: "Rework QC", icon: "rework", permission:"qc.view" },
    ],
  },
  {
    key: "logistics",
    label: "Logistics & Packing",
    icon: "logistics",
    children: [
      { href: "/packing", label: "Packing", icon: "packing", permission:"packing.view" },
      { href: "/finished-goods", label: "Finished Goods", icon: "inventory", permission:"inventory.view" },
      { href: "/delivery-orders", label: "Delivery Orders", icon: "delivery", permission:"delivery.view" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: "analytics",
    children: [{ href: "/traceability", label: "Traceability", icon: "trace", permission:"trace.view" }],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    children: [
      { href: "/settings/users", label: "Users", icon: "customer", permission:"settings.manage" },
      { href: "/settings/roles", label: "Roles", icon: "settings", permission:"settings.manage" },
      { href: "/settings/branding", label: "Branding", icon: "configuration", permission:"settings.manage" },
    ],
  },
];

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    masterdata: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
    customer: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    product: <><path d="m21 8-9 5-9-5" /><path d="M3 8l9-5 9 5v8l-9 5-9-5Z" /></>,
    configuration: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    production: <><path d="M3 21h18M5 21V9l5 3V9l5 3V5h4v16" /><path d="M8 17h2M14 17h2" /></>,
    sales: <><path d="M6 2h9l4 4v16H6Z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
    trays: <><path d="M4 7h16l-2 12H6Z" /><path d="M7 7V4h10v3M8 12h8" /></>,
    quality: <><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" /><path d="m8 12 3 3 5-6" /></>,
    rework: <><path d="M20 7h-6V1" /><path d="M20 7a9 9 0 1 0 1 8" /><path d="m9 12 2 2 4-4" /></>,
    logistics: <><path d="M3 6h11v11H3Z" /><path d="M14 10h4l3 3v4h-7Z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    packing: <><path d="m21 8-9 5-9-5" /><path d="M3 8l9-5 9 5v8l-9 5-9-5Z" /><path d="M12 13v8" /></>,
    delivery: <><path d="M4 4h12v16H4Z" /><path d="M8 8h4M8 12h4M8 16h3" /><path d="m16 14 4 2-4 2" /></>,
    analytics: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    trace: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5M8 11h6M11 8v6" /></>,
    inventory: <><path d="M3 7h18v14H3Z"/><path d="M5 3h14l2 4H3Z"/><path d="M9 12h6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3A1.7 1.7 0 0 0 14 21v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14v-4a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h5v18h-5"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 9l-3 3 3 3" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeHref = groups
    .flatMap((group) => group.children)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reworkCount, setReworkCount] = useState(0);
  const [appName, setAppName] = useState("MRP Traceability");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(pathname !== "/login");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    masterdata: true,
    production: true,
    quality: true,
    logistics: true,
    analytics: true,
    settings: true,
  });
  const navRef = useRef<HTMLElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const sidebarScrollKey = "mrp-sidebar-scroll-position";

  useEffect(() => {
    void api<{app_name:string}>("/api/public/branding").then(result=>setAppName(result.app_name||"MRP Traceability")).catch(()=>undefined);
  },[]);

  useEffect(() => {
    if (pathname === "/login") { setAuthLoading(false); return; }
    if (authUser) { setAuthLoading(false); return; }
    setAuthLoading(true);
    void api<AuthUser>("/api/auth/me").then(setAuthUser).catch(() => { window.location.replace("/login"); }).finally(() => setAuthLoading(false));
  }, [authUser]);

  useEffect(() => {
    const activeGroup = groups.find((group) => group.children.some((item) => pathname.startsWith(item.href)));
    if (activeGroup) setExpanded((current) => ({ ...current, [activeGroup.key]: true }));
  }, [pathname]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = Number(window.sessionStorage.getItem(sidebarScrollKey));
    if (Number.isFinite(saved) && saved > 0 && Math.abs(nav.scrollTop - saved) > 2) nav.scrollTop = saved;
    const frame = window.requestAnimationFrame(() => {
      const active = activeLinkRef.current;
      if (!active) return;
      const navBounds = nav.getBoundingClientRect();
      const activeBounds = active.getBoundingClientRect();
      if (activeBounds.top < navBounds.top + 12 || activeBounds.bottom > navBounds.bottom - 12) {
        active.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname,expanded]);

  useEffect(() => {
    if (!authUser?.permissions.includes("qc.view")) return;
    let active = true;
    const refresh = () => void api<{ items: unknown[] }>("/api/qc/v2/rework/open")
      .then((result) => { if (active) setReworkCount(result.items.length); })
      .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [authUser]);

  useEffect(() => {
    if (pathname === "/login" || !authUser) return;
    const timeoutMs=15*60*1000;
    let lastActivity=Date.now();
    let timer=0;
    let expiring=false;
    const expire=async()=>{
      if(expiring)return;
      expiring=true;
      try{await api("/api/auth/logout",{method:"POST"})}finally{window.location.replace("/login?reason=inactive")}
    };
    const arm=()=>{
      window.clearTimeout(timer);
      const remaining=timeoutMs-(Date.now()-lastActivity);
      if(remaining<=0){void expire();return}
      timer=window.setTimeout(()=>void expire(),remaining);
    };
    const markActivity=()=>{lastActivity=Date.now();arm()};
    const checkVisibility=()=>{if(document.visibilityState==="visible")arm()};
    const events:Array<keyof WindowEventMap>=["pointerdown","keydown","touchstart","wheel","scroll"];
    events.forEach(event=>window.addEventListener(event,markActivity,{passive:true}));
    document.addEventListener("visibilitychange",checkVisibility);
    arm();
    return()=>{window.clearTimeout(timer);events.forEach(event=>window.removeEventListener(event,markActivity));document.removeEventListener("visibilitychange",checkVisibility)};
  },[pathname,authUser]);

  function toggleGroup(key: string) {
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  }

  async function logout() {
    try { await api("/api/auth/logout",{method:"POST"}); } finally { window.location.replace("/login"); }
  }

  if (pathname === "/login") return <>{children}</>;
  if (authLoading || !authUser) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-300 border-t-transparent"/><p className="mt-4 font-black">Loading secure workspace…</p></div></div>;

  const visibleGroups=groups.map(group=>({...group,children:group.children.filter(item=>authUser.permissions.includes(item.permission))})).filter(group=>group.children.length);
  const requestedItem=groups.flatMap(group=>group.children).find(item=>pathname===item.href||pathname.startsWith(`${item.href}/`));
  const accessDenied=!!requestedItem&&!authUser.permissions.includes(requestedItem.permission);

  return (
    <div className="flex min-h-screen overflow-hidden bg-[#f7f9fc]">
      <aside className={`print-hidden shrink-0 overflow-hidden bg-blue-950 text-white shadow-xl transition-[width] duration-300 ease-in-out ${sidebarOpen ? "w-72" : "w-0"}`}>
        <div className="flex h-screen w-72 flex-col">
          <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
            <div className="min-w-0">
              <p className="truncate text-lg font-black">{appName}</p>
              <p className="mt-0.5 text-xs text-blue-200">Operations System</p>
            </div>
            <button aria-label="Collapse sidebar" className="rounded-xl border border-white/10 p-2.5 text-blue-100 transition hover:bg-white/10 hover:text-white" onClick={() => setSidebarOpen(false)} type="button">
              <Icon name="panel" />
            </button>
          </div>

          <nav ref={navRef} className="sidebar-scroll flex-1 overflow-y-auto px-3 py-5" aria-label="Main navigation" onScroll={(event) => window.sessionStorage.setItem(sidebarScrollKey, String(event.currentTarget.scrollTop))}>
            <Link ref={pathname === "/" ? activeLinkRef : undefined} className={`mb-2 flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition ${pathname === "/" ? "bg-blue-600 text-white shadow-md" : "text-blue-100 hover:bg-white/10 hover:text-white"}`} href="/">
              <Icon name="dashboard" /><span>Dashboard</span>
            </Link>

            <div className="space-y-1">
              {visibleGroups.map((group) => {
                const open = expanded[group.key];
                const groupActive = group.children.some((item) => item.href === activeHref);
                return (
                  <section key={group.key}>
                    <button
                      aria-expanded={open}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold transition ${groupActive ? "text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}
                      onClick={() => toggleGroup(group.key)}
                      type="button"
                    >
                      <Icon name={group.icon} />
                      <span className="flex-1">{group.label}</span>
                      <Icon name="chevron" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
                    </button>
                    <div className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <div className="min-h-0">
                        <div className="ml-5 space-y-1 border-l border-blue-800 py-1 pl-3">
                          {group.children.map((item) => {
                            const active = item.href === activeHref;
                            return (
                              <Link ref={active ? activeLinkRef : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-blue-600 text-white shadow-sm" : "text-blue-200 hover:bg-white/10 hover:text-white"}`} href={item.href} key={item.href}>
                                <Icon name={item.icon} className="h-4 w-4" /><span className="flex-1">{item.label}</span>
                                {item.href === "/qc/rework" && reworkCount > 0 && <span className="min-w-6 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[11px] font-black text-blue-950">{reworkCount}</span>}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-white/10 px-4 py-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-black">{authUser.full_name.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{authUser.full_name}</p><p className="truncate text-[11px] text-blue-300">{authUser.roles.join(", ")}</p></div><button aria-label="Sign out" className="rounded-lg p-2 text-blue-200 hover:bg-white/10 hover:text-white" onClick={()=>void logout()}><Icon name="logout" className="h-4 w-4"/></button></div>
          </div>
        </div>
      </aside>

      <section className="relative min-w-0 flex-1">
        {!sidebarOpen && (
          <button aria-label="Expand sidebar" className="print-hidden fixed left-4 top-4 z-50 rounded-xl bg-blue-950 p-3 text-white shadow-lg transition hover:bg-blue-900" onClick={() => setSidebarOpen(true)} type="button">
            <Icon name="menu" className="h-6 w-6" />
          </button>
        )}
        <div className={`h-screen overflow-y-auto transition-[padding] duration-300 ${sidebarOpen ? "" : "pt-16"}`}>{accessDenied?<div className="flex min-h-[80vh] items-center justify-center p-6"><div className="max-w-md rounded-3xl border bg-white p-8 text-center shadow"><p className="text-5xl">🔒</p><h1 className="mt-4 text-2xl font-black">Access Restricted</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p><Link className="primary mt-6 inline-block" href="/">Return to Dashboard</Link></div></div>:children}</div>
      </section>
    </div>
  );
}
