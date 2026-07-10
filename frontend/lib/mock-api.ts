type MockStore = {
  nextId: number;
  branding: {app_name:string;login_wallpaper_data_url:string|null;updated_at:string};
  customers: Array<{ id: number; code: string; name: string; is_active: boolean; created_at?: string; updated_at?: string; created_by?: string; updated_by?: string }>;
  products: Array<{ id: number; code: string; name: string; is_active: boolean; qc_image_data_url?: string | null; created_at?: string; updated_at?: string; created_by?: string; updated_by?: string }>;
  packaging: Array<{
    id: number; product_id: number; name: string; version: number;
    parts_per_small_box: number; small_boxes_per_master_box: number; is_active: boolean;
    created_at?: string; updated_at?: string; created_by?: string; updated_by?: string;
  }>;
  salesOrders: Array<{
    id: number; so_number: string; customer_id: number; order_date: string;
    target_delivery_date: string | null; status: string;
    created_by?: string; created_at?: string; updated_by?: string; updated_at?: string;
    lines: Array<{ product_id: number; packaging_config_id: number; quantity: number }>;
  }>;
  trays: Array<{ id: number; tray_code: string; tray_type: "GENERAL" | "SOURCE" | "PASS" | "REWORK"; is_active?: boolean; created_at?: string; updated_at?: string; created_by?: string; updated_by?: string }>;
  ngCategories: Array<{ id: number; code: string; name: string; description: string; sort_order: number; is_active: boolean; created_at?: string; updated_at?: string; created_by?: string; updated_by?: string }>;
  activity: Array<{id:number;action:string;entity_type:string;entity_id:string|null;module:string;created_at:string;user:{full_name:string;username:string}}>;
  reworkTrayLocks: string[];
  authUsers: Array<{id:number;username:string;password:string;full_name:string;email:string|null;is_active:boolean;roles:string[];must_change_password:boolean;last_login_at:string|null;created_at:string}>;
  rolePermissions: Record<string,string[]>;
  roleMetadata: Record<string,{id:number;role_name:string;description:string;is_system:boolean;is_active:boolean}>;
  trayCycles: Array<{
    id: number; tray_cycle_code: string; tray_code: string; production_order_id: number;
    planned_qty: number; operator_id: string; status: string; started_at: string;
  }>;
  qcSessions: Array<{
    id: number; session_code: string; tray_code: string; production_order_id: number;
    actual_qty: number; inspected_qty: number; status: string; started_at: string;
    pass_tray_code?: string | null; rework_tray_code?: string | null; finalized_at?: string | null;
  }>;
  preLaserItems: Array<{
    id: number; qc_session_id: number; inspection_sequence: number;
    status: "QC_PENDING" | "REWORK" | "QC_PASSED_UNMARKED" | "LASER_RESERVED" | "LASER_MARKED";
    initial_result: "PASS" | "REJECT" | null; rework_code: string | null;
    ng_reason: string | null; inspected_at: string | null; rework_passed_at: string | null;
    commercial_unit_id: number | null;
    pass_tray_code?: string | null; rework_tray_code?: string | null;
  }>;
  nextSerialSequence: number;
  serialGroups: Array<{
    id: number; production_order_id: number; tray_cycle_id: number; packaging_config_id: number;
    group_number: number; group_size: number; production_date: string; status: string;
  }>;
  units: Array<{
    id: number; serial_sequence: number; serial_number: string; serial_group_id: number;
    tray_cycle_id: number; group_position: number; status: string;
    rework_code: string | null; rework_reason: string | null;
  }>;
  qcEvents: Array<{
    id: number; unit_id: number; result: "PASS" | "REJECT"; reason: string | null;
    operator_id: string; station_id: string; inspected_at: string; inspection_type: "INITIAL" | "REWORK";
  }>;
  smallBoxes: Array<{
    id: number; box_code: string; status: "LOCKED" | "MASTERED";
    serial_group_id: number; production_order_id: number; packaging_config_id: number;
    actual_qty: number; serial_from: string; serial_to: string; packed_at: string;
  }>;
  masterBoxes: Array<{
    id: number; master_box_code: string; small_box_ids: number[];
    production_order_id: number; packaging_config_id: number; actual_unit_qty: number;
    created_at: string;
  }>;
  laserBatches: Array<{
    id: number; batch_code: string; tray_cycle_id: number; production_order_id: number;
    total_qty: number; serial_from: string; serial_to: string;
    status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
    transmission_attempts: number; last_error: string | null;
    created_at: string; updated_at: string; sent_at: string | null;
    demo_result?: "SUCCESS" | "FAILURE";
    source_type?: "DIRECT" | "REWORK";
    carrier_tray_code?: string;
    unit_ids?: number[];
    pre_laser_item_ids?: number[];
  }>;
};

const key = "mrp-traceability-demo-v1";
const demoSessionKey = "mrp-demo-auth-user";
const demoRolePermissions:Record<string,string[]>={
  ADMIN:["dashboard.view","master.view","master.manage","sales.view","sales.manage","qc.view","qc.operate","laser.view","laser.operate","packing.view","packing.operate","inventory.view","delivery.view","delivery.manage","trace.view","settings.view","settings.manage"],
  SUPERVISOR:["dashboard.view","master.view","sales.view","sales.manage","qc.view","qc.operate","laser.view","laser.operate","packing.view","inventory.view","delivery.view","trace.view"],
  QC_OPERATOR:["dashboard.view","qc.view","qc.operate"],
  PACKING_OPERATOR:["dashboard.view","packing.view","packing.operate","inventory.view"],
  LOGISTICS:["dashboard.view","inventory.view","delivery.view","delivery.manage","trace.view"],
};

function initialStore(): MockStore {
  return {
    nextId: 100,
    branding: {app_name:"MRP Traceability",login_wallpaper_data_url:null,updated_at:new Date().toISOString()},
    customers: [],
    products: [],
    packaging: [],
    salesOrders: [],
    trays: [
      { id: 1, tray_code: "TRAY-001", tray_type: "SOURCE" },
      { id: 2, tray_code: "TRAY-002", tray_type: "PASS" },
      { id: 3, tray_code: "TRAY-003", tray_type: "REWORK" },
      { id: 4, tray_code: "TRAY-004", tray_type: "REWORK" },
    ],
    ngCategories: [
      { id: 20, code: "SCRATCH_DENT", name: "Visual Scratch / Dent", description: "Visible scratch, dent, or cosmetic damage.", sort_order: 10, is_active: true },
      { id: 21, code: "DIMENSION_OOS", name: "Dimension Out of Spec", description: "Part dimension is outside the approved tolerance.", sort_order: 20, is_active: true },
      { id: 22, code: "FUNCTION_FAIL", name: "Functional Test Failed", description: "Part failed functional or fit test.", sort_order: 30, is_active: true },
      { id: 23, code: "ASSEMBLY_DEFECT", name: "Assembly Defect", description: "Assembly is incomplete, loose, reversed, or incorrect.", sort_order: 40, is_active: true },
      { id: 24, code: "CONTAMINATION", name: "Contamination", description: "Oil, dust, foreign material, or other contamination found.", sort_order: 50, is_active: true },
      { id: 25, code: "MARKING_DEFECT", name: "Marking Defect", description: "Label, marking, print, or identification issue.", sort_order: 60, is_active: true },
    ],
    activity: [],
    reworkTrayLocks: [],
    authUsers: [{id:1,username:"admin",password:"password",full_name:"System Administrator",email:"admin@local",is_active:true,roles:["ADMIN"],must_change_password:true,last_login_at:null,created_at:new Date().toISOString()}],
    rolePermissions: structuredClone(demoRolePermissions),
    roleMetadata: Object.fromEntries(Object.keys(demoRolePermissions).map((code,index)=>[code,{id:index+1,role_name:code.replaceAll("_"," "),description:"System role",is_system:true,is_active:true}])),
    trayCycles: [],
    qcSessions: [],
    preLaserItems: [],
    nextSerialSequence: 1,
    serialGroups: [],
    units: [],
    qcEvents: [],
    smallBoxes: [],
    masterBoxes: [],
    laserBatches: [],
  };
}

function read(): MockStore {
  const raw = window.localStorage.getItem(key);
  if (!raw) return initialStore();
  try {
    const saved = JSON.parse(raw) as Partial<MockStore>;
    const defaults = initialStore();
    return {
      ...defaults,
      ...saved,
      branding: saved.branding ?? defaults.branding,
      customers: saved.customers ?? defaults.customers,
      products: saved.products ?? defaults.products,
      packaging: saved.packaging ?? defaults.packaging,
      salesOrders: saved.salesOrders ?? defaults.salesOrders,
      trays: (saved.trays ?? defaults.trays).map((tray,index)=>({...tray,tray_type:tray.tray_type??(["SOURCE","PASS","REWORK","REWORK"][index]??"GENERAL")})),
      ngCategories: saved.ngCategories ?? defaults.ngCategories,
      activity: saved.activity ?? defaults.activity,
      reworkTrayLocks: saved.reworkTrayLocks ?? defaults.reworkTrayLocks,
      authUsers: saved.authUsers ?? defaults.authUsers,
      rolePermissions: saved.rolePermissions ?? defaults.rolePermissions,
      roleMetadata: saved.roleMetadata ?? defaults.roleMetadata,
      trayCycles: saved.trayCycles ?? defaults.trayCycles,
      qcSessions: saved.qcSessions ?? defaults.qcSessions,
      preLaserItems: saved.preLaserItems ?? defaults.preLaserItems,
      nextSerialSequence: saved.nextSerialSequence ?? defaults.nextSerialSequence,
      serialGroups: saved.serialGroups ?? defaults.serialGroups,
      units: saved.units ?? defaults.units,
      qcEvents: saved.qcEvents ?? defaults.qcEvents,
      smallBoxes: saved.smallBoxes ?? defaults.smallBoxes,
      masterBoxes: saved.masterBoxes ?? defaults.masterBoxes,
      laserBatches: saved.laserBatches ?? defaults.laserBatches,
    };
  }
  catch { return initialStore(); }
}

function write(store: MockStore) {
  window.localStorage.setItem(key, JSON.stringify(store));
}

function jsonBody(init?: RequestInit): Record<string, unknown> {
  return init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
}

export function recordMockActivity(path: string, method: string) {
  if (method === "GET" || method === "HEAD" || path.startsWith("/api/auth/") || path === "/api/audit-logs") return;
  const store = read();
  const userID = Number(window.localStorage.getItem(demoSessionKey));
  const user = store.authUsers.find((item) => item.id === userID);
  const pathname = new URL(path, window.location.origin).pathname;
  const module = pathname.startsWith("/api/master/") ? "Master Data"
    : pathname.startsWith("/api/qc/") ? "Quality Control"
    : pathname.startsWith("/api/packing/") || pathname.startsWith("/api/finished-goods") || pathname.startsWith("/api/delivery-orders") ? "Logistics & Packing"
    : pathname.startsWith("/api/settings/") ? "Settings"
    : pathname.startsWith("/api/trace/") ? "Analytics" : "Production";
  const segments = pathname.split("/").filter(Boolean);
  const entityType = (segments[1] === "master" ? segments[2] : segments[1] ?? "system").replaceAll("-", "_");
  const entityID = segments.find((value) => /^\d+$/.test(value)) ?? null;
  const action = method === "POST" ? "CREATE" : method === "DELETE" ? "DELETE" : "UPDATE";
  store.activity.unshift({id:store.nextId++,action,entity_type:entityType,entity_id:entityID,module,created_at:new Date().toISOString(),user:{full_name:user?.full_name??"Demo Operator",username:user?.username??"demo"}});
  store.activity = store.activity.slice(0, 200);
  write(store);
}

export async function mockApi<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 20));
  const store = read();
  const url = new URL(path, window.location.origin);
  const method = init?.method?.toUpperCase() ?? "GET";

  if (url.pathname === "/api/public/branding" && method === "GET") return store.branding as T;
  if (url.pathname === "/api/settings/branding" && method === "PUT") {
    const body=jsonBody(init);
    const wallpaper=body.login_wallpaper_data_url?String(body.login_wallpaper_data_url):null;
    if(wallpaper&&!/^data:image\/(jpeg|png|webp);base64,/.test(wallpaper))throw new Error("Wallpaper must be JPEG, PNG, or WebP.");
    if((wallpaper?.length??0)>7*1024*1024)throw new Error("Wallpaper exceeds the 5 MB limit.");
    store.branding={app_name:String(body.app_name??"MRP Traceability").trim(),login_wallpaper_data_url:wallpaper,updated_at:new Date().toISOString()};
    write(store);
    return store.branding as T;
  }

  if (url.pathname === "/api/audit-logs" && method === "GET") {
    const module = url.searchParams.get("module") ?? "";
    return {items:store.activity.filter((item)=>!module||item.module===module)} as T;
  }

  if (url.pathname === "/api/auth/login" && method === "POST") {
    const body=jsonBody(init);const username=String(body.username??"").toLowerCase();const password=String(body.password??"");
    const user=store.authUsers.find(item=>item.username.toLowerCase()===username&&item.password===password&&item.is_active);
    if(!user)throw new Error("Invalid username or password.");
    user.last_login_at=new Date().toISOString();write(store);window.localStorage.setItem(demoSessionKey,String(user.id));
    return {id:user.id,username:user.username,full_name:user.full_name,email:user.email,roles:user.roles,permissions:Array.from(new Set(user.roles.flatMap(role=>store.rolePermissions[role]??[]))),must_change_password:user.must_change_password} as T;
  }
  if (url.pathname === "/api/auth/me" && method === "GET") {
    const id=Number(window.localStorage.getItem(demoSessionKey));const user=store.authUsers.find(item=>item.id===id&&item.is_active);
    if(!user)throw new Error("Authentication required.");
    return {id:user.id,username:user.username,full_name:user.full_name,email:user.email,roles:user.roles,permissions:Array.from(new Set(user.roles.flatMap(role=>store.rolePermissions[role]??[]))),must_change_password:user.must_change_password} as T;
  }
  if (url.pathname === "/api/auth/logout" && method === "POST") {window.localStorage.removeItem(demoSessionKey);return {status:"SIGNED_OUT"} as T}
  if (url.pathname === "/api/settings/users" && method === "GET") return {items:store.authUsers.map(({password,...user})=>user)} as T;
  if (url.pathname === "/api/settings/users" && method === "POST") {
    const body=jsonBody(init);const username=String(body.username??"").trim().toLowerCase();const password=String(body.password??"");
    if(password.length<8)throw new Error("Password must contain at least 8 characters.");
    if(store.authUsers.some(user=>user.username===username))throw new Error("Username already exists.");
    const user={id:store.nextId++,username,password,full_name:String(body.full_name??"").trim(),email:body.email?String(body.email):null,is_active:true,roles:(body.role_codes as string[])??[],must_change_password:true,last_login_at:null,created_at:new Date().toISOString()};
    store.authUsers.push(user);write(store);return {id:user.id,username} as T;
  }
  const settingsUserMatch=url.pathname.match(/^\/api\/settings\/users\/(\d+)$/);
  if(settingsUserMatch&&method==="PATCH"){const user=store.authUsers.find(item=>item.id===Number(settingsUserMatch[1]));if(!user)throw new Error("User not found.");const body=jsonBody(init);if(typeof body.full_name==="string")user.full_name=body.full_name;if(typeof body.email==="string")user.email=body.email||null;if(typeof body.password==="string"&&body.password){if(body.password.length<8)throw new Error("Password must contain at least 8 characters.");user.password=body.password;user.must_change_password=true}if(typeof body.is_active==="boolean")user.is_active=body.is_active;if(Array.isArray(body.role_codes))user.roles=body.role_codes as string[];write(store);return{id:user.id,updated:true} as T}
  if(settingsUserMatch&&method==="DELETE"){const id=Number(settingsUserMatch[1]);const user=store.authUsers.find(item=>item.id===id);if(!user)throw new Error("User not found.");if(user.username==="admin")throw new Error("Bootstrap administrator cannot be deleted.");store.authUsers=store.authUsers.filter(item=>item.id!==id);write(store);return{id,deleted:true} as T}
  if(url.pathname==="/api/settings/roles"&&method==="GET"){const items=Object.entries(store.rolePermissions).map(([code,permissions])=>{const meta=store.roleMetadata[code];return{id:meta.id,role_code:code,role_name:meta.role_name,description:meta.description,is_system:meta.is_system,is_active:meta.is_active,user_count:store.authUsers.filter(user=>user.roles.includes(code)).length,permissions}});return{items} as T}
  if(url.pathname==="/api/settings/roles"&&method==="POST"){const body=jsonBody(init);const code=String(body.role_code??"").trim().toUpperCase();if(store.rolePermissions[code])throw new Error("Role code already exists.");const id=store.nextId++;store.rolePermissions[code]=(body.permission_codes as string[])??[];store.roleMetadata[code]={id,role_name:String(body.role_name??code),description:String(body.description??""),is_system:false,is_active:true};write(store);return{id,role_code:code} as T}
  const settingsRoleMatch=url.pathname.match(/^\/api\/settings\/roles\/(\d+)$/);
  if(settingsRoleMatch&&method==="PATCH"){const id=Number(settingsRoleMatch[1]);const code=Object.keys(store.roleMetadata).find(key=>store.roleMetadata[key].id===id);if(!code)throw new Error("Role not found.");const body=jsonBody(init);if(typeof body.role_name==="string")store.roleMetadata[code].role_name=body.role_name;if(typeof body.description==="string")store.roleMetadata[code].description=body.description;if(typeof body.is_active==="boolean")store.roleMetadata[code].is_active=body.is_active;if(Array.isArray(body.permission_codes))store.rolePermissions[code]=body.permission_codes as string[];write(store);return{id,updated:true} as T}
  if(settingsRoleMatch&&method==="DELETE"){const id=Number(settingsRoleMatch[1]);const code=Object.keys(store.roleMetadata).find(key=>store.roleMetadata[key].id===id);if(!code)throw new Error("Role not found.");if(store.roleMetadata[code].is_system)throw new Error("System roles cannot be deleted.");if(store.authUsers.some(user=>user.roles.includes(code)))throw new Error("Remove this role from users before deleting it.");delete store.roleMetadata[code];delete store.rolePermissions[code];write(store);return{id,deleted:true} as T}
  const settingsRolePermissionMatch=url.pathname.match(/^\/api\/settings\/roles\/(\d+)\/permissions$/);
  if(settingsRolePermissionMatch&&method==="PATCH"){const id=Number(settingsRolePermissionMatch[1]);const roleCode=Object.keys(store.roleMetadata).find(key=>store.roleMetadata[key].id===id);if(!roleCode)throw new Error("Role not found.");store.rolePermissions[roleCode]=(jsonBody(init).permission_codes as string[])??[];write(store);return{role_id:id,permissions:store.rolePermissions[roleCode]} as T}
  if(url.pathname==="/api/settings/permissions"&&method==="GET"){const permissions=Array.from(new Set(Object.values(demoRolePermissions).flat()));return{items:permissions.map(code=>({permission_code:code,permission_name:code.replaceAll("."," "),module:code.split(".")[0]}))} as T}

  if (url.pathname === "/api/master/customers" && method === "GET") {
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    return { items: store.customers.filter((item) => includeInactive || item.is_active) } as T;
  }
  if (url.pathname === "/api/master/customers" && method === "POST") {
    const body = jsonBody(init);
    const code = String(body.code ?? "").trim().toUpperCase();
    if (store.customers.some((item) => item.code === code)) throw new Error("Customer code already exists.");
    const actor=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";const now=new Date().toISOString();
    const item = { id: store.nextId++, code, name: String(body.name ?? "").trim(), is_active: true,created_at:now,updated_at:now,created_by:actor,updated_by:actor };
    store.customers.push(item); write(store);
    return { id: item.id } as T;
  }
  const customerMatch = url.pathname.match(/^\/api\/master\/customers\/(\d+)$/);
  if (customerMatch && method === "PATCH") {
    const item = store.customers.find((entry) => entry.id === Number(customerMatch[1]));
    if (!item) throw new Error("Customer not found.");
    const body = jsonBody(init); item.code=String(body.code??item.code).toUpperCase();item.name = String(body.name ?? item.name); item.is_active = Boolean(body.is_active);item.updated_at=new Date().toISOString();item.updated_by=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";write(store);
    return { id: item.id } as T;
  }

  if (url.pathname === "/api/master/ng-categories" && method === "GET") {
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    return { items: store.ngCategories.filter((item) => includeInactive || item.is_active).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name)) } as T;
  }
  if (url.pathname === "/api/master/ng-categories" && method === "POST") {
    const body = jsonBody(init);
    const name = String(body.name ?? "").trim();
    const code = String(body.code || name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!name) throw new Error("NG category name is required.");
    if (!code) throw new Error("NG category code is required.");
    if (store.ngCategories.some((item) => item.code === code)) throw new Error("NG category code already exists.");
    const actor=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";const now=new Date().toISOString();
    const item={id:store.nextId++,code,name,description:String(body.description??""),sort_order:Number(body.sort_order||100),is_active:true,created_at:now,updated_at:now,created_by:actor,updated_by:actor};
    store.ngCategories.push(item);write(store);return{id:item.id} as T;
  }
  const ngCategoryMatch = url.pathname.match(/^\/api\/master\/ng-categories\/(\d+)$/);
  if (ngCategoryMatch && method === "PATCH") {
    const item = store.ngCategories.find((entry) => entry.id === Number(ngCategoryMatch[1]));
    if (!item) throw new Error("NG category not found.");
    const body = jsonBody(init);
    const nextName=String(body.name??item.name).trim();
    const nextCode=String(body.code||nextName).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (store.ngCategories.some((entry)=>entry.id!==item.id&&entry.code===nextCode)) throw new Error("NG category code already exists.");
    item.code=nextCode;item.name=nextName;item.description=String(body.description??item.description??"");item.sort_order=Number(body.sort_order||item.sort_order||100);item.is_active=Boolean(body.is_active);item.updated_at=new Date().toISOString();item.updated_by=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";write(store);
    return { id: item.id } as T;
  }

  if (url.pathname === "/api/master/products" && method === "GET") {
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    const items = store.products.filter((item) => includeInactive || item.is_active).map((product) => ({
      ...product,
      packaging: store.packaging.filter((config) => config.product_id === product.id && config.is_active).map((config) => ({
        id: config.id, name: config.name, version: config.version,
        parts_per_small_box: config.parts_per_small_box,
        small_boxes_per_master_box: config.small_boxes_per_master_box,
        parts_per_master_box: config.parts_per_small_box * config.small_boxes_per_master_box,
      })),
    }));
    return { items } as T;
  }
  if (url.pathname === "/api/master/products" && method === "POST") {
    const body = jsonBody(init);
    const code = String(body.code ?? "").trim().toUpperCase();
    if (store.products.some((item) => item.code === code)) throw new Error("Product code already exists.");
    const actor=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";const now=new Date().toISOString();
    const item = { id: store.nextId++, code, name: String(body.name ?? "").trim(), is_active: true,created_at:now,updated_at:now,created_by:actor,updated_by:actor };
    store.products.push(item); write(store);
    return { id: item.id } as T;
  }
  const productMatch = url.pathname.match(/^\/api\/master\/products\/(\d+)$/);
  if (productMatch && method === "PATCH") {
    const item = store.products.find((entry) => entry.id === Number(productMatch[1]));
    if (!item) throw new Error("Product not found.");
    const body = jsonBody(init);item.code=String(body.code??item.code).toUpperCase();item.name = String(body.name ?? item.name); item.is_active = Boolean(body.is_active);item.updated_at=new Date().toISOString();item.updated_by=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";write(store);
    return { id: item.id } as T;
  }
  const productQCImageMatch = url.pathname.match(/^\/api\/master\/products\/(\d+)\/qc-image$/);
  if (productQCImageMatch && method === "PUT") {
    const item = store.products.find((entry) => entry.id === Number(productQCImageMatch[1]));
    if (!item) throw new Error("Product not found.");
    const image = String(jsonBody(init).image_data_url ?? "");
    if (image && !/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw new Error("QC image must be JPEG, PNG, or WebP.");
    if (image.length > 7 * 1024 * 1024) throw new Error("QC image exceeds the 5 MB limit.");
    item.qc_image_data_url = image || null; write(store);
    return { id: item.id, has_qc_image: !!image } as T;
  }

  if (url.pathname === "/api/master/packaging-configs" && method === "GET") {
    const items = store.packaging.map((config) => {
      const product = store.products.find((item) => item.id === config.product_id);
      return {
        ...config, product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product",
        parts_per_master_box: config.parts_per_small_box * config.small_boxes_per_master_box,
      };
    });
    return { items } as T;
  }
  if (url.pathname === "/api/master/packaging-configs" && method === "POST") {
    const body = jsonBody(init);
    const productId = Number(body.product_id);
    const name = String(body.name ?? "").trim();
    const previous = store.packaging.filter((item) => item.product_id === productId && item.name === name);
    previous.forEach((item) => { item.is_active = false; });
    const item = {
      id: store.nextId++, product_id: productId, name,
      version: Math.max(0, ...previous.map((entry) => entry.version)) + 1,
      parts_per_small_box: Number(body.parts_per_small_box),
      small_boxes_per_master_box: Number(body.small_boxes_per_master_box),
      is_active: true,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      created_by:store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator",
      updated_by:store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator",
    };
    store.packaging.push(item); write(store);
    return { id: item.id, version: item.version } as T;
  }
  const packagingMatch = url.pathname.match(/^\/api\/master\/packaging-configs\/(\d+)\/status$/);
  if (packagingMatch && method === "PATCH") {
    const item = store.packaging.find((entry) => entry.id === Number(packagingMatch[1]));
    if (!item) throw new Error("Packaging configuration not found.");
    item.is_active = Boolean(jsonBody(init).is_active);item.updated_at=new Date().toISOString();item.updated_by=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";write(store);
    return { id: item.id, is_active: item.is_active } as T;
  }
  const packagingEditMatch = url.pathname.match(/^\/api\/master\/packaging-configs\/(\d+)$/);
  if (packagingEditMatch && method === "PATCH") {
    const old = store.packaging.find((entry) => entry.id === Number(packagingEditMatch[1]));
    if (!old) throw new Error("Packaging configuration not found.");
    const body=jsonBody(init);old.is_active=false;old.updated_at=new Date().toISOString();
    const actor=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";
    const name=String(body.name??old.name);const productId=Number(body.product_id??old.product_id);
    const version=Math.max(0,...store.packaging.filter(item=>item.product_id===productId&&item.name===name).map(item=>item.version))+1;
    const item={id:store.nextId++,product_id:productId,name,version,parts_per_small_box:Number(body.parts_per_small_box),small_boxes_per_master_box:Number(body.small_boxes_per_master_box),is_active:true,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:actor,updated_by:actor};
    store.packaging.push(item);write(store);return{id:item.id,replaces_id:old.id,version} as T;
  }

  if (url.pathname === "/api/sales-orders" && method === "GET") {
    const query = (url.searchParams.get("search") ?? "").toLowerCase();
    const status = url.searchParams.get("status") ?? "";
    const items = store.salesOrders.map((order) => {
      const customer = store.customers.find((item) => item.id === order.customer_id);
      return {
        ...order, customer_code: customer?.code ?? "UNKNOWN", customer_name: customer?.name ?? "Unknown Customer",
        line_count: order.lines.length, order_qty: order.lines.reduce((sum, line) => sum + line.quantity, 0),
        pass_qty: 0, created_at: order.order_date,
      };
    }).filter((item) => (!query || item.so_number.toLowerCase().includes(query) || item.customer_name.toLowerCase().includes(query)) && (!status || item.status === status));
    return { items } as T;
  }
  if (url.pathname === "/api/sales-orders" && method === "POST") {
    const body = jsonBody(init);
    const number = String(body.so_number ?? "").trim();
    if (store.salesOrders.some((item) => item.so_number === number)) throw new Error("Sales Order number already exists.");
    const item = {
      id: store.nextId++, so_number: number, customer_id: Number(body.customer_id),
      order_date: String(body.order_date), target_delivery_date: body.target_delivery_date ? String(body.target_delivery_date) : null,
      status: "OPEN", lines: body.lines as MockStore["salesOrders"][number]["lines"],
      created_by:store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator",
      created_at:new Date().toISOString(),updated_by:store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator",updated_at:new Date().toISOString(),
    };
    store.salesOrders.unshift(item); write(store);
    return { id: item.id, so_number: item.so_number } as T;
  }

  if (url.pathname === "/api/production-orders" && method === "GET") {
    const items = store.salesOrders.flatMap((order) =>
      order.lines.map((line, index) => {
        const id = order.id * 1000 + index + 1;
        const product = store.products.find((item) => item.id === line.product_id);
        const cycles = store.trayCycles.filter((cycle) => cycle.production_order_id === id && cycle.status !== "CANCELLED");
        const assignedQty = cycles.reduce((sum, cycle) => sum + cycle.planned_qty, 0);
        return {
          id,
          production_order_number: `PO-${order.so_number}-${String(index + 1).padStart(2, "0")}`,
          so_number: order.so_number,
          product_code: product?.code ?? "UNKNOWN",
          product_name: product?.name ?? "Unknown Product",
          created_by:order.created_by,created_at:order.created_at??order.order_date,updated_by:order.updated_by,updated_at:order.updated_at,
          planned_qty: line.quantity,
          assigned_qty: assignedQty,
          pass_qty: 0,
          status: assignedQty > 0 ? "IN_PROGRESS" : "OPEN",
        };
      }),
    );
    return { items } as T;
  }
  if (url.pathname === "/api/trays" && method === "GET") {
    const items = store.trays.map((tray) => {
      const cycle = store.trayCycles.find((item) => item.tray_code === tray.tray_code && !["COMPLETED", "CANCELLED"].includes(item.status));
      const production = cycle
        ? store.salesOrders.flatMap((order) => order.lines.map((_, index) => ({
            id: order.id * 1000 + index + 1,
            number: `PO-${order.so_number}-${String(index + 1).padStart(2, "0")}`,
          }))).find((item) => item.id === cycle.production_order_id)
        : null;
      return {
        id: tray.id,
        tray_code: tray.tray_code,
        status: cycle ? "IN_PRODUCTION" : "AVAILABLE",
        active_cycle_id: cycle?.id ?? null,
        active_cycle_code: cycle?.tray_cycle_code ?? null,
        production_order_number: production?.number ?? null,
        planned_qty: cycle?.planned_qty ?? null,
        operator_id: cycle?.operator_id ?? null,
      };
    });
    return { items } as T;
  }
  if (url.pathname === "/api/tray-cycles" && method === "GET") {
    const productions = store.salesOrders.flatMap((order) => order.lines.map((_, index) => ({
      id: order.id * 1000 + index + 1,
      number: `PO-${order.so_number}-${String(index + 1).padStart(2, "0")}`,
    })));
    const items = store.trayCycles.map((cycle) => ({
      ...cycle,
      production_order_number: productions.find((item) => item.id === cycle.production_order_id)?.number ?? "UNKNOWN",
      serialized_qty: 0,
      pass_qty: 0,
      completed_at: null,
    }));
    return { items } as T;
  }
  if (url.pathname === "/api/trays/assign" && method === "POST") {
    const body = jsonBody(init);
    const productionOrderId = Number(body.production_order_id);
    const trayCode = String(body.tray_code ?? "").trim().toUpperCase();
    const quantity = Number(body.quantity);
    const tray = store.trays.find((item) => item.tray_code === trayCode);
    if (!tray) throw new Error("Tray ID is not registered. Use TRAY-001 through TRAY-004 in Local Demo Mode.");
    if (store.trayCycles.some((item) => item.tray_code === trayCode && !["COMPLETED", "CANCELLED"].includes(item.status))) {
      throw new Error("Tray is currently used by another active cycle.");
    }
    const orderLines = store.salesOrders.flatMap((order) => order.lines.map((line, index) => ({
      id: order.id * 1000 + index + 1,
      quantity: line.quantity,
    })));
    const production = orderLines.find((item) => item.id === productionOrderId);
    if (!production) throw new Error("Production Order was not found.");
    const assigned = store.trayCycles.filter((item) => item.production_order_id === productionOrderId && item.status !== "CANCELLED").reduce((sum, item) => sum + item.planned_qty, 0);
    if (quantity <= 0 || assigned + quantity > production.quantity) throw new Error("Tray quantity exceeds the remaining Production Order quantity.");
    const trayCycleNumber = store.trayCycles.filter((item) => item.tray_code === trayCode).length + 1;
    const cycle = {
      id: store.nextId++,
      tray_cycle_code: `${trayCode}-C${String(trayCycleNumber).padStart(6, "0")}`,
      tray_code: trayCode,
      production_order_id: productionOrderId,
      planned_qty: quantity,
      operator_id: "DEMO-OPERATOR",
      status: "IN_PRODUCTION",
      started_at: new Date().toISOString(),
    };
    store.trayCycles.unshift(cycle);
    write(store);
    return { tray_cycle_id: cycle.id, tray_cycle_code: cycle.tray_cycle_code } as T;
  }

  function productionDetails(productionOrderId: number) {
    return store.salesOrders.flatMap((order) => order.lines.map((line, index) => ({
      id: order.id * 1000 + index + 1,
      number: `PO-${order.so_number}-${String(index + 1).padStart(2, "0")}`,
      line,
    }))).find((item) => item.id === productionOrderId);
  }

  function laserBatchSummary(batch: MockStore["laserBatches"][number]) {
    const cycle = store.trayCycles.find((item) => item.id === batch.tray_cycle_id);
    const production = productionDetails(batch.production_order_id);
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    const batchUnits = batch.unit_ids?.length
      ? store.units.filter((item) => batch.unit_ids?.includes(item.id))
      : store.units.filter((item) => item.tray_cycle_id === batch.tray_cycle_id);
    const processed = batchUnits.filter((item) => !["ALLOCATED", "LASER_PENDING"].includes(item.status)).length;
    return {
      ...batch,
      tray_code: cycle?.tray_code ?? "UNKNOWN",
      tray_cycle_code: cycle?.tray_cycle_code ?? "UNKNOWN",
      production_order_number: production?.number ?? "UNKNOWN",
      product_code: product?.code ?? "UNKNOWN",
      product_name: product?.name ?? "Unknown Product",
      processed_qty: processed,
    };
  }

  function advanceLaserBatches() {
    let changed = false;
    for (const batch of store.laserBatches) {
      if (!["PENDING", "PROCESSING"].includes(batch.status)) continue;
      const elapsed = Date.now() - new Date(batch.updated_at).getTime();
      if (elapsed < 500) continue;
      if (batch.demo_result === "FAILURE") {
        if (elapsed >= 1200) {
          batch.status = "FAILED";
          batch.last_error = "Simulated TCP connection drop: machine did not acknowledge the batch.";
          changed = true;
        }
        continue;
      }
      batch.status = "PROCESSING";
      const target = Math.min(batch.total_qty, Math.max(1, Math.floor((elapsed - 500) / 90)));
      const batchUnits = store.units
        .filter((item) => batch.unit_ids?.length ? batch.unit_ids.includes(item.id) : item.tray_cycle_id === batch.tray_cycle_id)
        .sort((a, b) => a.serial_sequence - b.serial_sequence);
      batchUnits.slice(0, target).forEach((item) => {
        if (item.status === "LASER_PENDING") item.status = "PASSED_UNBOXED";
      });
      if (target >= batch.total_qty) {
        batch.status = "SENT";
        batch.sent_at = new Date().toISOString();
        store.preLaserItems.filter((item) => batch.pre_laser_item_ids?.includes(item.id)).forEach((item) => { item.status = "LASER_MARKED"; });
        const groupIDs = new Set(batchUnits.map((item) => item.serial_group_id));
        store.serialGroups.filter((group) => groupIDs.has(group.id)).forEach((group) => {
          const units = store.units.filter((item) => item.serial_group_id === group.id);
          group.status = units.length === group.group_size && units.every((item) => item.status === "PASSED_UNBOXED") ? "READY_TO_PACK" : "QC_PROCESS";
        });
      }
      changed = true;
    }
    if (changed) write(store);
  }

  if (url.pathname === "/api/master/trays" && method === "GET") {
    return { items: store.trays.map((tray) => ({ ...tray, is_active: tray.is_active??true, created_at:tray.created_at??new Date().toISOString(),updated_at:tray.updated_at??tray.created_at??new Date().toISOString(),created_by:tray.created_by??"System Administrator",updated_by:tray.updated_by??tray.created_by??"System Administrator" })) } as T;
  }
  if (url.pathname === "/api/master/trays" && method === "POST") {
    const body = jsonBody(init);
    const code = String(body.tray_code ?? "").trim().toUpperCase();
    const trayType = String(body.tray_type ?? "").trim().toUpperCase() as "GENERAL" | "SOURCE" | "PASS" | "REWORK";
    if (!code) throw new Error("Tray ID is required.");
    if (!["GENERAL","SOURCE","PASS","REWORK"].includes(trayType)) throw new Error("Select a valid Tray Type.");
    if (store.trays.some((tray) => tray.tray_code === code)) throw new Error("Tray ID already exists.");
    const actor=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";const now=new Date().toISOString();
    const tray = { id: store.nextId++, tray_code: code, tray_type: trayType,is_active:true,created_at:now,updated_at:now,created_by:actor,updated_by:actor };
    store.trays.push(tray); write(store);
    return tray as T;
  }
  const trayMasterMatch=url.pathname.match(/^\/api\/master\/trays\/(\d+)$/);
  if(trayMasterMatch&&method==="PATCH"){const tray=store.trays.find(item=>item.id===Number(trayMasterMatch[1]));if(!tray)throw new Error("Tray not found.");const body=jsonBody(init);tray.tray_code=String(body.tray_code??tray.tray_code).toUpperCase();tray.tray_type=String(body.tray_type??tray.tray_type) as typeof tray.tray_type;tray.is_active=Boolean(body.is_active);tray.updated_at=new Date().toISOString();tray.updated_by=store.authUsers.find(user=>user.id===Number(window.localStorage.getItem(demoSessionKey)))?.full_name??"Demo Operator";write(store);return tray as T}

  if (url.pathname === "/api/qc/setup/orders" && method === "GET") {
    const items = store.salesOrders.flatMap((order) => order.lines.map((line, index) => {
      const id = order.id * 1000 + index + 1;
      const product = store.products.find((item) => item.id === line.product_id);
      const started = store.qcSessions.filter((session) => session.production_order_id === id).reduce((sum, session) => sum + session.actual_qty, 0);
      return { production_order_id: id, production_order_number: `PO-${order.so_number}-${String(index + 1).padStart(2, "0")}`, so_number: order.so_number, product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product", order_qty: line.quantity, started_qty: started };
    })).filter((item) => item.started_qty < item.order_qty);
    return { items } as T;
  }

  if (url.pathname === "/api/qc/v2/history" && method === "GET") {
    const stage=(url.searchParams.get("stage")??"INITIAL").toUpperCase();
    const items=store.preLaserItems.filter(item=>stage==="REWORK"?!!item.rework_passed_at:!!item.initial_result).map(item=>{
      const session=store.qcSessions.find(value=>value.id===item.qc_session_id);
      const production=session?productionDetails(session.production_order_id):null;
      const product=production?store.products.find(value=>value.id===production.line.product_id):null;
      const salesOrder=session?store.salesOrders.find(order=>order.lines.some((_,index)=>order.id*1000+index+1===session.production_order_id)):null;
      return{id:item.id,stage,sequence:item.inspection_sequence,result:stage==="REWORK"?"PASS":item.initial_result,reason:item.ng_reason,rework_code:item.rework_code,session_code:session?.session_code??"UNKNOWN",source_tray:session?.tray_code??"UNKNOWN",rework_tray:item.rework_tray_code??null,pass_tray:item.pass_tray_code??null,production_order:production?.number??"UNKNOWN",so_number:salesOrder?.so_number??"UNKNOWN",product_code:product?.code??"UNKNOWN",product_name:product?.name??"Unknown Product",operator_id:"Demo QC Operator",station_id:"QC-DEMO",inspected_at:stage==="REWORK"?item.rework_passed_at:item.inspected_at};
    }).sort((a,b)=>new Date(String(b.inspected_at)).getTime()-new Date(String(a.inspected_at)).getTime());
    return{items,stage} as T;
  }

  const qcTrayValidationMatch = url.pathname.match(/^\/api\/qc\/v2\/trays\/([^/]+)\/validate$/);
  if (qcTrayValidationMatch && method === "GET") {
    const trayCode = decodeURIComponent(qcTrayValidationMatch[1]).trim().toUpperCase();
    const purpose = (url.searchParams.get("purpose") ?? "SOURCE").toUpperCase();
    if (!["SOURCE", "REWORK", "PASS", "OUTPUT_REWORK"].includes(purpose)) throw new Error("Invalid tray validation purpose.");
    const tray = store.trays.find((item) => item.tray_code === trayCode);
    if (!tray) throw new Error(`Tray ${trayCode} is not registered or inactive.`);
    const expectedType = purpose === "SOURCE" ? "SOURCE" : purpose === "PASS" ? "PASS" : "REWORK";
    if (tray.tray_type !== "GENERAL" && tray.tray_type !== expectedType) throw new Error(`Tray ${trayCode} is type ${tray.tray_type}; this step requires a ${expectedType} tray.`);
    const reworkItems = store.preLaserItems.filter((item) => item.rework_tray_code === trayCode && (item.status === "REWORK" || (item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code)));
    if (purpose === "REWORK") {
      if (!reworkItems.length) throw new Error(`Tray ${trayCode} has no open Rework QC items.`);
      return { valid: true, tray_code: trayCode, purpose, item_count: reworkItems.length } as T;
    }
    if (purpose === "OUTPUT_REWORK") {
      const session = store.qcSessions.find((item) => item.id === Number(url.searchParams.get("session_id")) && item.status === "AWAITING_OUTPUT_TRAYS");
      if (!session) throw new Error("QC session is not ready to assign output trays.");
      if (store.reworkTrayLocks.includes(trayCode)) throw new Error(`Rework Tray ${trayCode} is locked for Rework QC.`);
      const productID = productionDetails(session.production_order_id)?.line.product_id;
      const incompatible = reworkItems.some((item) => {
        const existingSession = store.qcSessions.find((candidate) => candidate.id === item.qc_session_id);
        return !existingSession || productionDetails(existingSession.production_order_id)?.line.product_id !== productID;
      });
      const busyOther = store.qcSessions.some((candidate) => candidate.tray_code === trayCode && (candidate.status === "QC_IN_PROGRESS" || candidate.status === "AWAITING_OUTPUT_TRAYS"))
        || store.preLaserItems.some((item) => item.pass_tray_code === trayCode && (item.status === "QC_PASSED_UNMARKED" || item.status === "LASER_RESERVED"));
      if (busyOther) throw new Error(`Tray ${trayCode} is assigned to another active process.`);
      if (incompatible) throw new Error(`Rework Tray ${trayCode} contains a different product.`);
      const newQty = store.preLaserItems.filter((item) => item.qc_session_id === session.id && item.initial_result === "REJECT").length;
      return { valid: true, tray_code: trayCode, purpose, existing_qty: reworkItems.length, new_qty: newQty, after_qty: reworkItems.length + newQty, status: "COLLECTING" } as T;
    }
    const activeSource = store.qcSessions.some((session) => session.tray_code === trayCode && (session.status === "QC_IN_PROGRESS" || session.status === "AWAITING_OUTPUT_TRAYS"));
    const activePass = store.preLaserItems.some((item) => item.pass_tray_code === trayCode && (item.status === "QC_PASSED_UNMARKED" || item.status === "LASER_RESERVED"));
    if (activeSource || activePass || reworkItems.length) throw new Error(`Tray ${trayCode} is still assigned to another active process.`);
    return { valid: true, tray_code: trayCode, purpose } as T;
  }

  const reworkTrayLockMatch = url.pathname.match(/^\/api\/qc\/v2\/rework-trays\/([^/]+)\/lock$/);
  if (reworkTrayLockMatch && method === "POST") {
    const trayCode = decodeURIComponent(reworkTrayLockMatch[1]).trim().toUpperCase();
    const tray = store.trays.find((item) => item.tray_code === trayCode);
    if (!tray) throw new Error("Rework Tray is not registered or inactive.");
    if (tray.tray_type !== "GENERAL" && tray.tray_type !== "REWORK") throw new Error(`Tray ${trayCode} is type ${tray.tray_type}; Rework QC requires a REWORK tray.`);
    const count = store.preLaserItems.filter((item) => item.rework_tray_code === trayCode && (item.status === "REWORK" || (item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code))).length;
    if (!count) throw new Error(`Tray ${trayCode} has no open Rework QC items.`);
    if (!store.reworkTrayLocks.includes(trayCode)) store.reworkTrayLocks.push(trayCode);
    write(store);
    return { tray_code: trayCode, status: "LOCKED_FOR_QC", item_count: count } as T;
  }
  if (reworkTrayLockMatch && method === "DELETE") {
    const trayCode = decodeURIComponent(reworkTrayLockMatch[1]).trim().toUpperCase();
    store.reworkTrayLocks = store.reworkTrayLocks.filter((code) => code !== trayCode);
    write(store);
    return { tray_code: trayCode, status: "COLLECTING" } as T;
  }

  if (url.pathname === "/api/qc/sessions" && method === "POST") {
    const body = jsonBody(init);
    const productionOrderID = Number(body.production_order_id);
    const trayCode = String(body.tray_code ?? "").trim().toUpperCase();
    const actualQty = Number(body.actual_qty);
    if (!productionDetails(productionOrderID)) throw new Error("Select a valid Sales Order product line.");
    const sourceTray = store.trays.find((tray) => tray.tray_code === trayCode);
    if (!sourceTray) throw new Error("Tray label is not registered in Master Data.");
    if (sourceTray.tray_type !== "GENERAL" && sourceTray.tray_type !== "SOURCE") throw new Error(`Initial QC requires a SOURCE tray; scanned tray is ${sourceTray.tray_type}.`);
    const activeSource = store.qcSessions.some((session) => session.tray_code === trayCode && (session.status === "QC_IN_PROGRESS" || session.status === "AWAITING_OUTPUT_TRAYS"));
    const activeCarrier = store.preLaserItems.some((item) => (item.pass_tray_code === trayCode && (item.status === "QC_PASSED_UNMARKED" || item.status === "LASER_RESERVED")) || (item.rework_tray_code === trayCode && (item.status === "REWORK" || (item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code))));
    if (activeSource || activeCarrier) throw new Error(`Tray ${trayCode} is still assigned to another active process.`);
    if (!Number.isInteger(actualQty) || actualQty <= 0) throw new Error("Actual tray quantity must be positive.");
    const cycleNumber = store.trayCycles.filter((cycle) => cycle.tray_code === trayCode).length + 1;
    const cycle = { id: store.nextId++, tray_cycle_code: `${trayCode}-QC${String(cycleNumber).padStart(6, "0")}`, tray_code: trayCode, production_order_id: productionOrderID, planned_qty: actualQty, operator_id: "DEMO-OPERATOR", status: "QC_PROCESS", started_at: new Date().toISOString() };
    store.trayCycles.push(cycle);
    const session = { id: store.nextId++, session_code: `QCS-DEMO-${String(store.nextId).padStart(6, "0")}`, tray_code: trayCode, production_order_id: productionOrderID, actual_qty: actualQty, inspected_qty: 0, status: "QC_IN_PROGRESS", started_at: new Date().toISOString() };
    store.qcSessions.push(session);
    for (let sequence = 1; sequence <= actualQty; sequence++) store.preLaserItems.push({ id: store.nextId++, qc_session_id: session.id, inspection_sequence: sequence, status: "QC_PENDING", initial_result: null, rework_code: null, ng_reason: null, inspected_at: null, rework_passed_at: null, commercial_unit_id: null });
    write(store);
    return { id: session.id, session_code: session.session_code, tray_cycle_id: cycle.id } as T;
  }

  const qcSessionMatch = url.pathname.match(/^\/api\/qc\/sessions\/(\d+)$/);
  if (qcSessionMatch && method === "GET") {
    const session = store.qcSessions.find((item) => item.id === Number(qcSessionMatch[1]));
    if (!session) throw new Error("QC Session not found.");
    const production = productionDetails(session.production_order_id);
    const order = store.salesOrders.find((candidate) => candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === session.production_order_id));
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    const items = store.preLaserItems.filter((item) => item.qc_session_id === session.id);
    return { ...session, production_order_number: production?.number ?? "UNKNOWN", so_number: order?.so_number ?? "UNKNOWN", product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product", qc_image_data_url: product?.qc_image_data_url ?? null, ok_qty: items.filter((item) => item.initial_result === "PASS").length, ng_qty: items.filter((item) => item.initial_result === "REJECT").length, remaining_qty: session.actual_qty - session.inspected_qty } as T;
  }

  const qcEvaluateMatch = url.pathname.match(/^\/api\/qc\/sessions\/(\d+)\/evaluate$/);
  if (qcEvaluateMatch && method === "POST") {
    const session = store.qcSessions.find((item) => item.id === Number(qcEvaluateMatch[1]));
    const body = jsonBody(init);
    if (!session) throw new Error("QC Session not found.");
    const item = store.preLaserItems.find((candidate) => candidate.qc_session_id === session.id && candidate.status === "QC_PENDING");
    if (!item) throw new Error("QC Session has no remaining item.");
    const result = String(body.result);
    const ngCategory = result === "REJECT" ? store.ngCategories.find((category) => category.id === Number(body.ng_category_id) && category.is_active) : null;
    if (result === "REJECT" && !ngCategory) throw new Error("Select an active NG category.");
    item.initial_result = result === "REJECT" ? "REJECT" : "PASS";
    item.status = result === "REJECT" ? "REWORK" : "QC_PASSED_UNMARKED";
    item.ng_reason = result === "REJECT" ? ngCategory?.name ?? null : null;
    item.rework_code = result === "REJECT" ? `RW-${String(item.id).padStart(10, "0")}` : null;
    item.inspected_at = new Date().toISOString();
    session.inspected_qty++;
    if (session.inspected_qty === session.actual_qty) session.status = "AWAITING_OUTPUT_TRAYS";
    write(store);
    return { inspection_sequence: item.inspection_sequence, result, rework_code: item.rework_code, print_status: result === "REJECT" ? "SIMULATED" : undefined } as T;
  }

  const qcFinishMatch = url.pathname.match(/^\/api\/qc\/sessions\/(\d+)\/finish$/);
  if (qcFinishMatch && method === "POST") {
    const session = store.qcSessions.find((item) => item.id === Number(qcFinishMatch[1]));
    if (!session || session.status !== "AWAITING_OUTPUT_TRAYS") throw new Error("QC Session is not ready to finish.");
    const body = jsonBody(init);
    const passTray = String(body.pass_tray_code ?? "").trim().toUpperCase();
    const reworkTray = String(body.rework_tray_code ?? "").trim().toUpperCase();
    const items = store.preLaserItems.filter((item) => item.qc_session_id === session.id);
    const okQty = items.filter((item) => item.initial_result === "PASS").length;
    const ngQty = items.filter((item) => item.initial_result === "REJECT").length;
    const passTrayRecord = store.trays.find((tray) => tray.tray_code === passTray);
    const reworkTrayRecord = store.trays.find((tray) => tray.tray_code === reworkTray);
    if (okQty && !passTrayRecord) throw new Error("Scan a registered Pass Tray.");
    if (okQty && passTrayRecord?.tray_type !== "GENERAL" && passTrayRecord?.tray_type !== "PASS") throw new Error(`Pass output requires a PASS tray; scanned tray is ${passTrayRecord?.tray_type}.`);
    if (ngQty && !reworkTrayRecord) throw new Error("Scan a registered Rework Tray.");
    if (ngQty && reworkTrayRecord?.tray_type !== "GENERAL" && reworkTrayRecord?.tray_type !== "REWORK") throw new Error(`NG output requires a REWORK tray; scanned tray is ${reworkTrayRecord?.tray_type}.`);
    if ([passTray, reworkTray].filter(Boolean).includes(session.tray_code) || (passTray && reworkTray && passTray === reworkTray)) throw new Error("Source, Pass, and Rework trays must be different.");
    const trayOccupied = (trayCode: string) => store.qcSessions.some((candidate) => candidate.id !== session.id && candidate.tray_code === trayCode && (candidate.status === "QC_IN_PROGRESS" || candidate.status === "AWAITING_OUTPUT_TRAYS"))
      || store.preLaserItems.some((item) => (item.pass_tray_code === trayCode && (item.status === "QC_PASSED_UNMARKED" || item.status === "LASER_RESERVED")) || (item.rework_tray_code === trayCode && (item.status === "REWORK" || (item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code))));
    if (passTray && trayOccupied(passTray)) throw new Error("Selected Pass Tray is still assigned to another active process.");
    if (reworkTray) {
      if (store.reworkTrayLocks.includes(reworkTray)) throw new Error("Selected Rework Tray is locked for Rework QC.");
      const productID = productionDetails(session.production_order_id)?.line.product_id;
      const existing = store.preLaserItems.filter((item) => item.rework_tray_code === reworkTray && (item.status === "REWORK" || (item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code)));
      const incompatible = existing.some((item) => {
        const existingSession = store.qcSessions.find((candidate) => candidate.id === item.qc_session_id);
        return !existingSession || productionDetails(existingSession.production_order_id)?.line.product_id !== productID;
      });
      const busyOther = store.qcSessions.some((candidate) => candidate.id !== session.id && candidate.tray_code === reworkTray && (candidate.status === "QC_IN_PROGRESS" || candidate.status === "AWAITING_OUTPUT_TRAYS"))
        || store.preLaserItems.some((item) => item.pass_tray_code === reworkTray && (item.status === "QC_PASSED_UNMARKED" || item.status === "LASER_RESERVED"));
      if (busyOther) throw new Error("Selected Rework Tray is assigned to another active process.");
      if (incompatible) throw new Error("Selected Rework Tray contains a different product.");
    }
    items.forEach((item) => { if (item.initial_result === "PASS") item.pass_tray_code = passTray; if (item.initial_result === "REJECT") item.rework_tray_code = reworkTray; });
    session.pass_tray_code = passTray || null; session.rework_tray_code = reworkTray || null; session.finalized_at = new Date().toISOString(); session.status = "READY_FOR_LASER";
    write(store);
    return { id: session.id, ok_qty: okQty, ng_qty: ngQty, status: session.status } as T;
  }

  if (url.pathname === "/api/qc/v2/rework/open" && method === "GET") {
    const items = store.preLaserItems.filter((item) => item.status === "REWORK" && !!item.rework_tray_code).map((item) => {
      const session = store.qcSessions.find((candidate) => candidate.id === item.qc_session_id)!;
      const production = productionDetails(session.production_order_id);
      const order = store.salesOrders.find((candidate) => candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === session.production_order_id));
      const product = production ? store.products.find((candidate) => candidate.id === production.line.product_id) : null;
      return { rework_code: item.rework_code, reason: item.ng_reason, ng_at: item.inspected_at, session_code: session.session_code, original_tray: session.tray_code, rework_tray: item.rework_tray_code ?? session.rework_tray_code ?? null, production_order: production?.number ?? "UNKNOWN", so_number: order?.so_number ?? "UNKNOWN", product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product" };
    });
    return { items } as T;
  }

  const reworkDetailV2Match = url.pathname.match(/^\/api\/qc\/v2\/rework\/(RW-[^/]+)$/);
  if (reworkDetailV2Match && method === "GET") {
    const code = decodeURIComponent(reworkDetailV2Match[1]).toUpperCase();
    const item = store.preLaserItems.find((candidate) => candidate.rework_code === code && candidate.status === "REWORK" && !!candidate.rework_tray_code);
    if (!item) throw new Error("Open rework item not found.");
    const session = store.qcSessions.find((candidate) => candidate.id === item.qc_session_id)!;
    const production = productionDetails(session.production_order_id);
    const order = store.salesOrders.find((candidate) => candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === session.production_order_id));
    const product = production ? store.products.find((candidate) => candidate.id === production.line.product_id) : null;
    return { rework_code: code, reason: item.ng_reason, status: item.status, session_code: session.session_code, original_tray: session.tray_code, rework_tray: item.rework_tray_code ?? session.rework_tray_code ?? null, production_order: production?.number ?? "UNKNOWN", so_number: order?.so_number ?? "UNKNOWN", product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product", qc_image_data_url: product?.qc_image_data_url ?? null } as T;
  }

  const reworkPassV2Match = url.pathname.match(/^\/api\/qc\/v2\/rework\/(.+)\/pass$/);
  if (reworkPassV2Match && method === "POST") {
    const code = decodeURIComponent(reworkPassV2Match[1]).toUpperCase();
    const item = store.preLaserItems.find((candidate) => candidate.rework_code === code && candidate.status === "REWORK" && !!candidate.rework_tray_code);
    if (!item) throw new Error("Rework item is unavailable.");
    item.status = "QC_PASSED_UNMARKED"; item.rework_passed_at = new Date().toISOString(); write(store);
    return { rework_code: code, status: item.status } as T;
  }

  if (url.pathname === "/api/qc/v2/rework/staged" && method === "GET") {
    const items = store.preLaserItems.filter((item) => item.initial_result === "REJECT" && item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code).map((item) => {
      const session = store.qcSessions.find((candidate) => candidate.id === item.qc_session_id)!;
      const production = productionDetails(session.production_order_id);
      const order = store.salesOrders.find((candidate) => candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === session.production_order_id));
      const product = production ? store.products.find((candidate) => candidate.id === production.line.product_id) : null;
      return { rework_code: item.rework_code, reason: item.ng_reason, session_code: session.session_code, original_tray: session.tray_code, rework_tray: item.rework_tray_code ?? session.rework_tray_code ?? null, so_number: order?.so_number ?? "UNKNOWN", product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product" };
    });
    return { items } as T;
  }

  if (url.pathname === "/api/qc/v2/rework/finish" && method === "POST") {
    const body = jsonBody(init); const codes = (body.rework_codes as string[] | undefined) ?? [];
    const passTray = String(body.pass_tray_code ?? "").trim().toUpperCase();
    const destinationTray = store.trays.find((tray) => tray.tray_code === passTray);
    if (!destinationTray) throw new Error("Scan a registered Pass Tray.");
    if (destinationTray.tray_type !== "GENERAL" && destinationTray.tray_type !== "PASS") throw new Error("Destination tray must be type PASS.");
    const destinationBusy = store.qcSessions.some((session) => session.tray_code === passTray && (session.status === "QC_IN_PROGRESS" || session.status === "AWAITING_OUTPUT_TRAYS"))
      || store.preLaserItems.some((item) => (item.pass_tray_code === passTray && (item.status === "QC_PASSED_UNMARKED" || item.status === "LASER_RESERVED")) || (item.rework_tray_code === passTray && (item.status === "REWORK" || (item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code))));
    if (destinationBusy) throw new Error("Destination Pass Tray is still assigned to another active process.");
    const items = store.preLaserItems.filter((item) => item.rework_code && codes.includes(item.rework_code) && item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code);
    if (!codes.length || items.length !== codes.length) throw new Error("One or more staged rework items are unavailable.");
    const reworkTrays = [...new Set(items.map((item) => item.rework_tray_code))];
    if (reworkTrays.length !== 1 || !reworkTrays[0]) throw new Error("Selected rework items must belong to one Rework Tray.");
    if (reworkTrays[0] === passTray) throw new Error("Destination Pass Tray must be different from the Rework Tray.");
    const unfinished = store.preLaserItems.filter((item) => item.rework_tray_code === reworkTrays[0] && item.status === "REWORK");
    const allStaged = store.preLaserItems.filter((item) => item.rework_tray_code === reworkTrays[0] && item.status === "QC_PASSED_UNMARKED" && !item.pass_tray_code);
    if (unfinished.length || allStaged.length !== items.length) throw new Error("Complete every item in the Rework Tray before release.");
    items.forEach((item) => { item.pass_tray_code = passTray; });
    store.reworkTrayLocks = store.reworkTrayLocks.filter((code) => code !== reworkTrays[0]);
    write(store);
    return { pass_tray_code: passTray, quantity: items.length } as T;
  }

  if (url.pathname === "/api/laser/ready" && method === "GET") {
    const items = store.qcSessions.map((session) => {
      const production = productionDetails(session.production_order_id);
      const order = store.salesOrders.find((candidate) => candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === session.production_order_id));
      const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
      const ready = store.preLaserItems.filter((item) => item.qc_session_id === session.id && item.status === "QC_PASSED_UNMARKED" && !!item.pass_tray_code);
      return { qc_session_id: session.id, session_code: session.session_code, original_tray: session.tray_code, direct_pass_tray: ready.find((item) => item.initial_result === "PASS")?.pass_tray_code ?? null, rework_pass_tray: ready.find((item) => item.initial_result === "REJECT")?.pass_tray_code ?? null, production_order: production?.number ?? "UNKNOWN", so_number: order?.so_number ?? "UNKNOWN", product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product", direct_ready_qty: ready.filter((item) => item.initial_result === "PASS").length, rework_ready_qty: ready.filter((item) => item.initial_result === "REJECT").length, total_ready_qty: ready.length };
    }).filter((item) => item.total_ready_qty > 0);
    return { items } as T;
  }

  if (url.pathname === "/api/laser/batches/v2" && method === "POST") {
    const body = jsonBody(init);
    const sessionID = Number(body.qc_session_id);
    const source = body.source_type === "REWORK" ? "REWORK" : "DIRECT";
    const session = store.qcSessions.find((item) => item.id === sessionID);
    if (!session) throw new Error("QC Session is unavailable.");
    const carrierCode = String(body.carrier_tray_code ?? "").trim().toUpperCase();
    const carrierTray = store.trays.find((tray) => tray.tray_code === carrierCode);
    if (!carrierTray) throw new Error("Laser carrier tray is not registered.");
    if (carrierTray.tray_type !== "GENERAL" && carrierTray.tray_type !== "PASS") throw new Error("Laser input requires a PASS tray.");
    const selected = store.preLaserItems.filter((item) => item.qc_session_id === sessionID && item.status === "QC_PASSED_UNMARKED" && (source === "REWORK" ? item.initial_result === "REJECT" : item.initial_result === "PASS"));
    if (!selected.length) throw new Error("No QC-passed items are ready for this laser batch.");
    const production = productionDetails(session.production_order_id)!;
    const config = store.packaging.find((item) => item.id === production.line.packaging_config_id)!;
    const cycle = store.trayCycles.find((item) => item.production_order_id === session.production_order_id && item.tray_code === session.tray_code)!;
    const unitIDs: number[] = []; const serials: string[] = [];
    for (const preItem of selected) {
      let group = store.serialGroups.find((candidate) => candidate.production_order_id === session.production_order_id && candidate.status === "QC_PROCESS" && store.units.filter((unit) => unit.serial_group_id === candidate.id).length < candidate.group_size);
      if (!group) {
        group = { id: store.nextId++, production_order_id: session.production_order_id, tray_cycle_id: cycle.id, packaging_config_id: config.id, group_number: store.serialGroups.filter((item) => item.production_order_id === session.production_order_id).length + 1, group_size: config.parts_per_small_box, production_date: new Date().toISOString().slice(0, 10), status: "QC_PROCESS" };
        store.serialGroups.push(group);
      }
      const sequence = store.nextSerialSequence++;
      const serial = `${new Date().toISOString().slice(2, 10).replaceAll("-", "")}${String(sequence).padStart(8, "0")}`;
      const groupPosition = store.units.filter((unit) => unit.serial_group_id === group!.id).length + 1;
      const unit = { id: store.nextId++, serial_sequence: sequence, serial_number: serial, serial_group_id: group.id, tray_cycle_id: cycle.id, group_position: groupPosition, status: "LASER_PENDING", rework_code: preItem.rework_code, rework_reason: preItem.ng_reason };
      store.units.push(unit); unitIDs.push(unit.id); serials.push(serial); preItem.status = "LASER_RESERVED"; preItem.commercial_unit_id = unit.id;
    }
    const now = new Date().toISOString();
    const batch: MockStore["laserBatches"][number] = { id: store.nextId++, batch_code: `LB-DEMO-${String(store.nextId).padStart(6, "0")}`, tray_cycle_id: cycle.id, production_order_id: session.production_order_id, total_qty: selected.length, serial_from: serials[0], serial_to: serials.at(-1)!, status: "PENDING", transmission_attempts: 1, last_error: null, created_at: now, updated_at: now, sent_at: null, demo_result: body.simulate_result === "FAILURE" ? "FAILURE" : "SUCCESS", source_type: source, carrier_tray_code: carrierCode, unit_ids: unitIDs, pre_laser_item_ids: selected.map((item) => item.id) };
    store.laserBatches.push(batch); write(store);
    return laserBatchSummary(batch) as T;
  }

  if (url.pathname === "/api/laser/batches" && method === "GET") {
    advanceLaserBatches();
    return { items: store.laserBatches.slice().reverse().map(laserBatchSummary) } as T;
  }

  if (url.pathname === "/api/laser/batches" && method === "POST") {
    const body = jsonBody(init);
    const trayCycleId = Number(body.tray_cycle_id);
    const cycle = store.trayCycles.find((item) => item.id === trayCycleId);
    if (!cycle) throw new Error("Tray Cycle is not available.");
    const existing = store.laserBatches.find((item) => item.tray_cycle_id === trayCycleId);
    if (existing) return laserBatchSummary(existing) as T;
    const production = productionDetails(cycle.production_order_id);
    if (!production) throw new Error("Production Order was not found.");
    const config = store.packaging.find((item) => item.id === production.line.packaging_config_id);
    const productionDate = String(body.production_date);
    const existingUnits = store.units.filter((item) => item.tray_cycle_id === trayCycleId);
    // Local Demo Mode migration: older builds generated and evaluated units directly
    // from QC before Laser Batch existed. Preserve their commercial serials, but reset
    // the obsolete downstream state so the same demo Tray can enter the corrected flow.
    const legacyStateReset = existingUnits.some((item) => !["ALLOCATED", "LASER_PENDING"].includes(item.status));
    if (legacyStateReset) {
      existingUnits.forEach((item) => {
        item.status = "LASER_PENDING";
        item.rework_code = null;
        item.rework_reason = null;
      });
      const legacyGroupIDs = new Set(existingUnits.map((item) => item.serial_group_id));
      store.serialGroups
        .filter((group) => legacyGroupIDs.has(group.id))
        .forEach((group) => { group.status = "ALLOCATED"; });
    }
    let remaining = cycle.planned_qty - existingUnits.length;
    while (remaining > 0) {
      const groupSize = Math.min(config?.parts_per_small_box ?? remaining, remaining);
      const groupNumber = store.serialGroups.filter((item) => item.production_order_id === cycle.production_order_id).length + 1;
      const group = {
        id: store.nextId++, production_order_id: cycle.production_order_id, tray_cycle_id: trayCycleId,
        packaging_config_id: config?.id ?? 0, group_number: groupNumber, group_size: groupSize,
        production_date: productionDate, status: "ALLOCATED",
      };
      store.serialGroups.push(group);
      const datePrefix = productionDate.replaceAll("-", "").slice(2);
      for (let position = 1; position <= groupSize; position++) {
        const sequence = store.nextSerialSequence++;
        store.units.push({
          id: store.nextId++, serial_sequence: sequence,
          serial_number: `${datePrefix}${String(sequence).padStart(8, "0")}`,
          serial_group_id: group.id, tray_cycle_id: trayCycleId, group_position: position,
          status: "LASER_PENDING", rework_code: null, rework_reason: null,
        });
      }
      remaining -= groupSize;
    }
    store.units.filter((item) => item.tray_cycle_id === trayCycleId).forEach((item) => { item.status = "LASER_PENDING"; });
    const serials = store.units.filter((item) => item.tray_cycle_id === trayCycleId).sort((a, b) => a.serial_sequence - b.serial_sequence);
    const now = new Date().toISOString();
    const batch: MockStore["laserBatches"][number] = {
      id: store.nextId++, batch_code: `LB-DEMO-${String(store.nextId).padStart(6, "0")}`,
      tray_cycle_id: trayCycleId, production_order_id: cycle.production_order_id,
      total_qty: serials.length, serial_from: serials[0].serial_number, serial_to: serials.at(-1)!.serial_number,
      status: "PENDING", transmission_attempts: 1, last_error: null,
      created_at: now, updated_at: now, sent_at: null,
      demo_result: body.simulate_result === "FAILURE" ? "FAILURE" : "SUCCESS",
    };
    store.laserBatches.push(batch);
    write(store);
    return { ...laserBatchSummary(batch), legacy_state_reset: legacyStateReset } as T;
  }

  const laserBatchDetailMatch = url.pathname.match(/^\/api\/laser\/batches\/(\d+)$/);
  if (laserBatchDetailMatch && method === "GET") {
    advanceLaserBatches();
    const batch = store.laserBatches.find((item) => item.id === Number(laserBatchDetailMatch[1]));
    if (!batch) throw new Error("Laser Batch not found.");
    const serials = store.units.filter((item) => batch.unit_ids?.length ? batch.unit_ids.includes(item.id) : item.tray_cycle_id === batch.tray_cycle_id)
      .sort((a, b) => a.serial_sequence - b.serial_sequence)
      .map((item, index) => {
        const preLaser = store.preLaserItems.find((candidate) => candidate.commercial_unit_id === item.id);
        const session = preLaser ? store.qcSessions.find((candidate) => candidate.id === preLaser.qc_session_id) : null;
        return {
          position: index + 1,
          serial_number: item.serial_number,
          status: item.status,
          source_type: preLaser?.initial_result === "REJECT" ? "REWORK" : batch.source_type ?? "DIRECT",
          rework_code: preLaser?.rework_code ?? item.rework_code,
          original_tray: session?.tray_code ?? store.trayCycles.find((cycle) => cycle.id === item.tray_cycle_id)?.tray_code ?? null,
        };
      });
    return { id: batch.id, batch_code: batch.batch_code, status: batch.status, total_qty: batch.total_qty, serials } as T;
  }

  const laserResendMatch = url.pathname.match(/^\/api\/laser\/batches\/(\d+)\/resend$/);
  if (laserResendMatch && method === "POST") {
    const batch = store.laserBatches.find((item) => item.id === Number(laserResendMatch[1]));
    if (!batch) throw new Error("Laser Batch not found.");
    if (batch.status === "SENT") throw new Error("A sent batch cannot be resent.");
    const body = jsonBody(init);
    batch.status = "PENDING"; batch.transmission_attempts += 1; batch.last_error = null;
    batch.demo_result = body.simulate_result === "FAILURE" ? "FAILURE" : "SUCCESS";
    batch.updated_at = new Date().toISOString();
    store.units.filter((item) => item.tray_cycle_id === batch.tray_cycle_id && item.status === "QC_PENDING")
      .forEach((item) => { item.status = "LASER_PENDING"; });
    write(store);
    return laserBatchSummary(batch) as T;
  }

  const qcTrayMatch = url.pathname.match(/^\/api\/qc\/trays\/(.+)$/);
  if (qcTrayMatch && method === "GET") {
    const trayCode = decodeURIComponent(qcTrayMatch[1]).toUpperCase();
    const cycle = store.trayCycles.find((item) => item.tray_code === trayCode && !["COMPLETED", "CANCELLED"].includes(item.status));
    if (!cycle) throw new Error("No active Tray Cycle found. Assign this tray in Production & Trays first.");
    const production = store.salesOrders.flatMap((order) => order.lines.map((line, index) => ({
      id: order.id * 1000 + index + 1,
      number: `PO-${order.so_number}-${String(index + 1).padStart(2, "0")}`,
      line,
    }))).find((item) => item.id === cycle.production_order_id);
    if (!production) throw new Error("Production Order was not found.");
    const product = store.products.find((item) => item.id === production.line.product_id);
    const config = store.packaging.find((item) => item.id === production.line.packaging_config_id);
    const units = store.units.filter((item) => item.tray_cycle_id === cycle.id).sort((a, b) => b.id - a.id);
    const groups = store.serialGroups.filter((item) => item.tray_cycle_id === cycle.id && item.status !== "PACKED").sort((a, b) => b.id - a.id);
    const activeGroup = groups[0];
    const count = (status: string) => units.filter((item) => item.status === status).length;
    return {
      tray_code: trayCode,
      tray_cycle_id: cycle.id,
      tray_cycle_code: cycle.tray_cycle_code,
      production_order_id: production.id,
      production_order_number: production.number,
      packaging_config_id: config?.id ?? 0,
      parts_per_small_box: config?.parts_per_small_box ?? 1,
      product_code: product?.code ?? "UNKNOWN",
      product_name: product?.name ?? "Unknown Product",
      planned_qty: cycle.planned_qty,
      counts: {
        allocated: count("ALLOCATED"),
        laser_pending: count("LASER_PENDING"),
        qc_pending: count("QC_PENDING"),
        rework: count("REWORK"),
        passed: units.filter((item) => ["PASSED_UNBOXED", "PACKED"].includes(item.status)).length,
      },
      active_group_id: activeGroup?.id ?? null,
      active_group_status: activeGroup?.status ?? null,
      active_group_allocated: activeGroup ? units.filter((item) => item.serial_group_id === activeGroup.id && item.status === "ALLOCATED").length : 0,
      units: units.slice(0, 30).map((unit) => {
        const group = store.serialGroups.find((item) => item.id === unit.serial_group_id);
        return {
          serial_number: unit.serial_number,
          status: unit.status,
          group_position: unit.group_position,
          group_number: group?.group_number ?? 0,
          rework_code: unit.rework_code,
          rework_reason: unit.rework_reason,
        };
      }),
    } as T;
  }

  if (url.pathname === "/api/qc/serial-groups" && method === "POST") {
    const body = jsonBody(init);
    const productionOrderId = Number(body.production_order_id);
    const trayCycleId = Number(body.tray_cycle_id);
    const productionDate = String(body.production_date);
    const cycle = store.trayCycles.find((item) => item.id === trayCycleId && item.production_order_id === productionOrderId);
    if (!cycle) throw new Error("Tray Cycle is not available.");
    const production = store.salesOrders.flatMap((order) => order.lines.map((line, index) => ({
      id: order.id * 1000 + index + 1,
      line,
    }))).find((item) => item.id === productionOrderId);
    if (!production) throw new Error("Production Order was not found.");
    const config = store.packaging.find((item) => item.id === production.line.packaging_config_id);
    const allocatedToCycle = store.units.filter((item) => item.tray_cycle_id === trayCycleId).length;
    const remaining = cycle.planned_qty - allocatedToCycle;
    if (remaining <= 0) throw new Error("All Tray Cycle quantities have already been serialized.");
    const groupSize = Math.min(config?.parts_per_small_box ?? remaining, remaining);
    const groupNumber = store.serialGroups.filter((item) => item.production_order_id === productionOrderId).length + 1;
    const group = {
      id: store.nextId++,
      production_order_id: productionOrderId,
      tray_cycle_id: trayCycleId,
      packaging_config_id: config?.id ?? 0,
      group_number: groupNumber,
      group_size: groupSize,
      production_date: productionDate,
      status: "ALLOCATED",
    };
    store.serialGroups.push(group);
    const datePrefix = productionDate.replaceAll("-", "").slice(2);
    for (let position = 1; position <= groupSize; position++) {
      const sequence = store.nextSerialSequence++;
      store.units.push({
        id: store.nextId++,
        serial_sequence: sequence,
        serial_number: `${datePrefix}${String(sequence).padStart(8, "0")}`,
        serial_group_id: group.id,
        tray_cycle_id: trayCycleId,
        group_position: position,
        status: "ALLOCATED",
        rework_code: null,
        rework_reason: null,
      });
    }
    write(store);
    return {
      serial_group_id: group.id,
      size: groupSize,
      serials: store.units.filter((item) => item.serial_group_id === group.id).map((item) => item.serial_number),
    } as T;
  }

  if (url.pathname === "/api/qc/laser-next" && method === "POST") {
    const body = jsonBody(init);
    const groupID = Number(body.serial_group_id);
    const unit = store.units.filter((item) => item.serial_group_id === groupID && item.status === "ALLOCATED").sort((a, b) => a.group_position - b.group_position)[0];
    if (!unit) throw new Error("No allocated unit remains in this serial group.");
    unit.status = "QC_PENDING";
    const group = store.serialGroups.find((item) => item.id === groupID);
    if (group) group.status = "QC_PROCESS";
    write(store);
    return { unit_id: unit.id, serial_number: unit.serial_number, print_status: "SIMULATED" } as T;
  }

  if (url.pathname === "/api/qc/evaluate" && method === "POST") {
    const body = jsonBody(init);
    const serial = String(body.serial_number).trim().toUpperCase();
    const result = String(body.result);
    const unit = store.units.find((item) => item.serial_number === serial);
    if (!unit) throw new Error("Serial not found.");
    if (["PASSED_UNBOXED", "PACKED"].includes(unit.status)) {
      throw new Error("This serial has already passed QC and cannot be evaluated again.");
    }
    if (!["QC_PENDING", "REWORK"].includes(unit.status)) throw new Error(`This serial is currently at ${unit.status.replaceAll("_", " ")} and is not ready for QC.`);
    if (unit.status === "REWORK" && result !== "PASS") throw new Error("A rework return can only be completed with OK.");
    if (result === "REJECT" && !String(body.reason ?? "").trim()) throw new Error("An NG reason is required.");
    const inspectionType = unit.status === "REWORK" ? "REWORK" : "INITIAL";
    if (result === "PASS") {
      unit.status = "PASSED_UNBOXED";
    } else {
      unit.status = "REWORK";
      unit.rework_reason = String(body.reason ?? "").trim();
      unit.rework_code = unit.rework_code ?? `RW-${String(unit.id).padStart(10, "0")}`;
    }
    store.qcEvents.unshift({
      id: store.nextId++,
      unit_id: unit.id,
      result: result === "REJECT" ? "REJECT" : "PASS",
      reason: result === "REJECT" ? unit.rework_reason : null,
      operator_id: "DEMO-OPERATOR",
      station_id: "QC-DEMO",
      inspected_at: new Date().toISOString(),
      inspection_type: inspectionType,
    });
    const group = store.serialGroups.find((item) => item.id === unit.serial_group_id);
    if (group) {
      const groupUnits = store.units.filter((item) => item.serial_group_id === group.id);
      group.status = groupUnits.every((item) => item.status === "PASSED_UNBOXED")
        ? "READY_TO_PACK"
        : groupUnits.some((item) => item.status === "REWORK") ? "WAITING_REWORK" : "QC_PROCESS";
    }
    write(store);
    return { serial_number: serial, result, inspection_type: inspectionType, rework_code: unit.rework_code, print_status: result === "REJECT" ? "SIMULATED" : undefined } as T;
  }

  if (url.pathname === "/api/qc/history" && method === "GET") {
    const query = (url.searchParams.get("serial") ?? "").trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const items = store.qcEvents
      .map((event) => {
        const unit = store.units.find((item) => item.id === event.unit_id);
        const cycle = unit ? store.trayCycles.find((item) => item.id === unit.tray_cycle_id) : null;
        return unit ? {
          id: event.id,
          serial_number: unit.serial_number,
          tray_code: cycle?.tray_code ?? "UNKNOWN",
          inspection_type: event.inspection_type,
          result: event.result,
          reason: event.reason,
          rework_code: unit.rework_code,
          operator_id: event.operator_id,
          station_id: event.station_id,
          inspected_at: event.inspected_at,
        } : null;
      })
      .filter((item): item is NonNullable<typeof item> => !!item && (!query || item.serial_number.toLowerCase().includes(query)))
      .sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))
      .slice(0, limit);
    return { items } as T;
  }

  if (url.pathname === "/api/qc/rework/open" && method === "GET") {
    const items = store.units
      .filter((unit) => unit.status === "REWORK")
      .map((unit) => {
        const cycle = store.trayCycles.find((item) => item.id === unit.tray_cycle_id);
        const group = store.serialGroups.find((item) => item.id === unit.serial_group_id);
        const production = cycle ? productionDetails(cycle.production_order_id) : null;
        const ngEvent = store.qcEvents
          .filter((event) => event.unit_id === unit.id && event.result === "REJECT")
          .sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))[0];
        return {
          serial_number: unit.serial_number,
          tray_code: cycle?.tray_code ?? "UNKNOWN",
          rework_code: unit.rework_code,
          reason: unit.rework_reason,
          ng_at: ngEvent?.inspected_at ?? new Date().toISOString(),
          production_order: production?.number ?? "UNKNOWN",
          group_number: group?.group_number ?? 0,
          group_size: group?.group_size ?? 0,
          group_position: unit.group_position,
          status: "WAITING_REWORK",
        };
      })
      .sort((a, b) => a.ng_at.localeCompare(b.ng_at));
    return { items } as T;
  }

  const reworkMatch = url.pathname.match(/^\/api\/qc\/rework\/(.+)$/);
  if (reworkMatch && method === "GET") {
    const code = decodeURIComponent(reworkMatch[1]).toUpperCase();
    const unit = store.units.find((item) => item.rework_code === code);
    if (!unit) throw new Error("Rework code not found.");
    const cycle = store.trayCycles.find((item) => item.id === unit.tray_cycle_id);
    const production = cycle ? store.salesOrders.flatMap((order) => order.lines.map((line, index) => ({
      id: order.id * 1000 + index + 1,
      line,
    }))).find((item) => item.id === cycle.production_order_id) : null;
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    return {
      rework_code: code,
      serial_number: unit.serial_number,
      reason: unit.rework_reason,
      status: unit.status,
      rework_status: unit.status === "REWORK" ? "OPEN" : "PASSED",
      product_code: product?.code ?? "UNKNOWN",
      product_name: product?.name ?? "Unknown Product",
      tray_code: cycle?.tray_code ?? "UNKNOWN",
      previously_ng: true,
      qc_attempts: store.qcEvents.filter((event) => event.unit_id === unit.id).length,
      last_inspected_at: store.qcEvents.find((event) => event.unit_id === unit.id)?.inspected_at ?? null,
    } as T;
  }

  const qcSerialMatch = url.pathname.match(/^\/api\/qc\/serials\/(\d{14})$/);
  if (qcSerialMatch && method === "GET") {
    const unit = store.units.find((item) => item.serial_number === qcSerialMatch[1]);
    if (!unit) throw new Error("Serial not found. Mark the part in Laser Marking first.");
    const cycle = store.trayCycles.find((item) => item.id === unit.tray_cycle_id);
    const production = cycle ? store.salesOrders.flatMap((order) => order.lines.map((line, index) => ({ id: order.id * 1000 + index + 1, line }))).find((item) => item.id === cycle.production_order_id) : null;
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    const events = store.qcEvents.filter((event) => event.unit_id === unit.id).sort((a, b) => b.inspected_at.localeCompare(a.inspected_at));
    return {
      serial_number: unit.serial_number,
      status: unit.status,
      product_code: product?.code ?? "UNKNOWN",
      product_name: product?.name ?? "Unknown Product",
      tray_code: cycle?.tray_code ?? "UNKNOWN",
      rework_code: unit.rework_code,
      rework_reason: unit.rework_reason,
      previously_ng: events.some((event) => event.result === "REJECT") || !!unit.rework_code,
      qc_attempts: events.length,
      last_inspected_at: events[0]?.inspected_at ?? null,
    } as T;
  }

  const traceMatch = url.pathname.match(/^\/api\/trace\/(\d{14})$/);
  if (traceMatch && method === "GET") {
    const unit = store.units.find((item) => item.serial_number === traceMatch[1]);
    if (!unit) throw new Error("Serial not found.");
    const cycle = store.trayCycles.find((item) => item.id === unit.tray_cycle_id);
    const production = cycle ? productionDetails(cycle.production_order_id) : null;
    const order = cycle ? store.salesOrders.find((candidate) =>
      candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === cycle.production_order_id),
    ) : null;
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    const events = store.qcEvents
      .filter((event) => event.unit_id === unit.id)
      .sort((a, b) => a.inspected_at.localeCompare(b.inspected_at))
      .map((event) => ({
        id: event.id,
        inspection_type: event.inspection_type,
        result: event.result,
        reason: event.reason,
        rework_code: unit.rework_code,
        operator_id: event.operator_id,
        station_id: event.station_id,
        inspected_at: event.inspected_at,
      }));
    const preLaser = store.preLaserItems.find((item) => item.commercial_unit_id === unit.id);
    const qcSession = preLaser ? store.qcSessions.find((item) => item.id === preLaser.qc_session_id) : null;
    const laserBatch = store.laserBatches.find((batch) => batch.unit_ids?.includes(unit.id));
    return {
      serial_number: unit.serial_number,
      status: unit.status,
      sales_order: order?.so_number ?? "UNKNOWN",
      production_order: production?.number ?? "UNKNOWN",
      product: product?.code ?? "UNKNOWN",
      tray_cycle: cycle?.tray_cycle_code ?? "UNKNOWN",
      qc_session: qcSession?.session_code ?? cycle?.tray_cycle_code ?? "UNKNOWN",
      original_tray: qcSession?.tray_code ?? cycle?.tray_code ?? "UNKNOWN",
      laser_carrier_tray: laserBatch?.carrier_tray_code ?? qcSession?.tray_code ?? cycle?.tray_code ?? "UNKNOWN",
      laser_batch: laserBatch?.batch_code ?? null,
      rework_code: unit.rework_code,
      previously_ng: preLaser?.initial_result === "REJECT" || events.some((event) => event.result === "REJECT") || !!unit.rework_code,
      qc_attempts: preLaser ? (preLaser.initial_result === "REJECT" ? 2 : 1) : events.length,
      qc_history: preLaser ? [
        { id: preLaser.id, inspection_type: "INITIAL", result: preLaser.initial_result === "REJECT" ? "REJECT" : "PASS", reason: preLaser.ng_reason, rework_code: preLaser.rework_code, operator_id: "DEMO-OPERATOR", station_id: "QC-DEMO", inspected_at: preLaser.inspected_at },
        ...(preLaser.initial_result === "REJECT" && preLaser.rework_passed_at ? [{ id: preLaser.id + 1, inspection_type: "REWORK", result: "PASS", reason: null, rework_code: preLaser.rework_code, operator_id: "DEMO-OPERATOR", station_id: "QC-DEMO", inspected_at: preLaser.rework_passed_at }] : []),
      ] : events,
      small_box: null,
      master_box: null,
      delivery_order: null,
    } as T;
  }

  if (url.pathname === "/api/packing/queue" && method === "GET") {
    const items = store.serialGroups
      .filter((group) => ["QC_PROCESS", "WAITING_REWORK", "READY_TO_PACK"].includes(group.status))
      .map((group) => {
        const units = store.units.filter((unit) => unit.serial_group_id === group.id).sort((a, b) => a.group_position - b.group_position);
        const production = productionDetails(group.production_order_id);
        const passed = units.filter((unit) => ["PASSED_UNBOXED", "PACKED"].includes(unit.status)).length;
        const reworkUnits = units.filter((unit) => unit.status === "REWORK");
        const qcPending = units.filter((unit) => unit.status === "QC_PENDING").length;
        return {
          serial_group_id: group.id,
          production_order: production?.number ?? "UNKNOWN",
          group_number: group.group_number,
          quantity: group.group_size,
          serial_from: units[0]?.serial_number ?? "",
          serial_to: units.at(-1)?.serial_number ?? "",
          ready_at: group.production_date,
          status: group.status,
          passed_qty: passed,
          rework_qty: reworkUnits.length,
          qc_pending_qty: qcPending,
          rework_serials: reworkUnits.map((unit) => unit.serial_number),
          is_ready: group.status === "READY_TO_PACK" && passed === group.group_size,
        };
      })
      .filter((group) => group.passed_qty + group.rework_qty > 0);
    return { items } as T;
  }

  if (url.pathname === "/api/packing/small-boxes" && method === "GET") {
    const status = url.searchParams.get("status") ?? "LOCKED";
    const items = store.smallBoxes.filter((box) => box.status === status).map((box) => {
      const production = productionDetails(box.production_order_id);
      const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
      const config = store.packaging.find((item) => item.id === box.packaging_config_id);
      return {
        ...box,
        production_order_number: production?.number ?? "UNKNOWN",
        product_code: product?.code ?? "UNKNOWN",
        product_name: product?.name ?? "Unknown Product",
        master_box_capacity: config?.small_boxes_per_master_box ?? 1,
      };
    });
    return { items } as T;
  }

  if (url.pathname === "/api/packing/small-box" && method === "POST") {
    const groupID = Number(jsonBody(init).serial_group_id);
    const group = store.serialGroups.find((item) => item.id === groupID);
    if (!group || group.status !== "READY_TO_PACK") throw new Error("Serial group is not ready to pack.");
    if (store.smallBoxes.some((box) => box.serial_group_id === groupID)) throw new Error("This serial group is already packed.");
    const units = store.units.filter((item) => item.serial_group_id === groupID).sort((a, b) => a.group_position - b.group_position);
    if (units.length !== group.group_size || units.some((unit) => unit.status !== "PASSED_UNBOXED")) throw new Error("Serial group is incomplete.");
    const box = {
      id: store.nextId++,
      box_code: `SB-DEMO-${String(store.nextId).padStart(6, "0")}`,
      status: "LOCKED" as const,
      serial_group_id: groupID,
      production_order_id: group.production_order_id,
      packaging_config_id: group.packaging_config_id,
      actual_qty: units.length,
      serial_from: units[0].serial_number,
      serial_to: units.at(-1)!.serial_number,
      packed_at: new Date().toISOString(),
    };
    store.smallBoxes.push(box);
    group.status = "PACKED";
    units.forEach((unit) => { unit.status = "PACKED"; });
    write(store);
    return { small_box_id: box.id, box_code: box.box_code, quantity: box.actual_qty, print_status: "SIMULATED" } as T;
  }

  const smallBoxMatch = url.pathname.match(/^\/api\/packing\/small-boxes\/(.+)$/);
  if (smallBoxMatch && method === "GET") {
    const code = decodeURIComponent(smallBoxMatch[1]).toUpperCase();
    const box = store.smallBoxes.find((item) => item.box_code === code);
    if (!box) throw new Error("Small Box not found.");
    const production = productionDetails(box.production_order_id);
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    const config = store.packaging.find((item) => item.id === box.packaging_config_id);
    return {
      ...box,
      production_order_number: production?.number ?? "UNKNOWN",
      product_code: product?.code ?? "UNKNOWN",
      product_name: product?.name ?? "Unknown Product",
      master_box_capacity: config?.small_boxes_per_master_box ?? 1,
    } as T;
  }

  if (url.pathname === "/api/packing/master-box" && method === "POST") {
    const codes = (jsonBody(init).small_box_codes as string[] | undefined) ?? [];
    const boxes = codes.map((code) => store.smallBoxes.find((item) => item.box_code === code));
    if (!codes.length || boxes.some((box) => !box || box.status !== "LOCKED")) throw new Error("One or more Small Boxes are unavailable.");
    const validBoxes = boxes as MockStore["smallBoxes"];
    const first = validBoxes[0];
    if (validBoxes.some((box) => box.production_order_id !== first.production_order_id || box.packaging_config_id !== first.packaging_config_id)) {
      throw new Error("Small Boxes must use the same Production Order and packaging configuration.");
    }
    const config = store.packaging.find((item) => item.id === first.packaging_config_id);
    const capacity = config?.small_boxes_per_master_box ?? 1;
    if (validBoxes.length !== capacity) throw new Error(`Master Box requires exactly ${capacity} Small Boxes.`);
    const production = productionDetails(first.production_order_id);
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    const packedAt = new Date().toISOString();
    const master = {
      id: store.nextId++,
      master_box_code: `MB-DEMO-${String(store.nextId).padStart(6, "0")}`,
      small_box_ids: validBoxes.map((box) => box.id),
      production_order_id: first.production_order_id,
      packaging_config_id: first.packaging_config_id,
      actual_unit_qty: validBoxes.reduce((sum, box) => sum + box.actual_qty, 0),
      created_at: packedAt,
    };
    store.masterBoxes.push(master);
    validBoxes.forEach((box) => { box.status = "MASTERED"; });
    write(store);
    return {
      master_box_id: master.id,
      master_box_code: master.master_box_code,
      small_box_count: validBoxes.length,
      small_box_codes: codes,
      unit_quantity: master.actual_unit_qty,
      production_order_number: production?.number ?? "UNKNOWN",
      product_code: product?.code ?? "UNKNOWN",
      product_name: product?.name ?? "Unknown Product",
      serial_from: validBoxes.map((box) => box.serial_from).sort()[0],
      serial_to: validBoxes.map((box) => box.serial_to).sort().at(-1),
      packed_at: packedAt,
      print_status: "SIMULATED",
    } as T;
  }

  if (url.pathname === "/api/dashboard" && method === "GET") {
    const today=new Date().toISOString().slice(0,10);
    const inspectedToday=store.preLaserItems.filter(item=>item.inspected_at?.slice(0,10)===today);
    const availableFG=store.masterBoxes.reduce((sum,item)=>sum+item.actual_unit_qty,0);
    const throughput=Array.from({length:7},(_,offset)=>{
      const date=new Date();date.setDate(date.getDate()-(6-offset));const keyDate=date.toISOString().slice(0,10);
      const inspected=store.preLaserItems.filter(item=>item.inspected_at?.slice(0,10)===keyDate);
      const passed=inspected.filter(item=>item.initial_result==="PASS").length;
      return{date:keyDate,qc_inspected:inspected.length,qc_passed:passed,packed:store.smallBoxes.filter(box=>box.packed_at.slice(0,10)===keyDate).reduce((sum,box)=>sum+box.actual_qty,0),pass_rate:inspected.length?Math.round(passed/inspected.length*1000)/10:0};
    });
    const orders=store.salesOrders.flatMap(order=>order.lines.map((line,index)=>{
      const productionID=order.id*1000+index+1;const product=store.products.find(item=>item.id===line.product_id);
      const packed=store.serialGroups.filter(group=>group.production_order_id===productionID).flatMap(group=>store.units.filter(unit=>unit.serial_group_id===group.id&&unit.status==="PACKED")).length;
      const progress=line.quantity?Math.round(packed/line.quantity*1000)/10:0;
      const target=order.target_delivery_date;const risk=target&&new Date(target).getTime()<=Date.now()+172800000&&progress<90?"AT_RISK":"ON_TRACK";
      const customer=store.customers.find(item=>item.id===order.customer_id);
      return{so_number:order.so_number,customer:customer?.name??"UNKNOWN",product_code:product?.code??"UNKNOWN",ordered_qty:line.quantity,packed_qty:packed,shipped_qty:0,progress,target_date:target,risk};
    })).slice(0,10);
    const defectMap=new Map<string,number>();store.preLaserItems.filter(item=>item.initial_result==="REJECT").forEach(item=>defectMap.set(item.ng_reason??"Unspecified",(defectMap.get(item.ng_reason??"Unspecified")??0)+1));
    const inspected=store.preLaserItems.filter(item=>item.inspected_at);const passed=inspected.filter(item=>item.initial_result==="PASS").length;
    const inventoryMap=new Map<number,{product_code:string;product_name:string;master_boxes:number;available_qty:number;allocated_qty:number;oldest_at:string|null}>();
    store.masterBoxes.forEach(master=>{const detail=productionDetails(master.production_order_id);const product=detail?store.products.find(item=>item.id===detail.line.product_id):null;if(!product)return;const current=inventoryMap.get(product.id)??{product_code:product.code,product_name:product.name,master_boxes:0,available_qty:0,allocated_qty:0,oldest_at:null};current.master_boxes++;current.available_qty+=master.actual_unit_qty;if(!current.oldest_at||master.created_at<current.oldest_at)current.oldest_at=master.created_at;inventoryMap.set(product.id,current)});
    const agingRework=store.preLaserItems.filter(item=>item.status==="REWORK"&&item.inspected_at&&new Date(item.inspected_at).getTime()<Date.now()-7200000).length;
    const awaitingTrays=store.qcSessions.filter(session=>session.status==="AWAITING_OUTPUT_TRAYS").length;
    const blocked=store.serialGroups.filter(group=>group.status==="WAITING_REWORK").length;
    const actions=[
      agingRework?{level:"HIGH",title:"Aging Rework",detail:`${agingRework} parts have waited more than two hours.`,href:"/qc/rework",count:agingRework}:null,
      awaitingTrays?{level:"MEDIUM",title:"QC Output Tray Required",detail:`${awaitingTrays} QC sessions are waiting for output trays.`,href:"/qc",count:awaitingTrays}:null,
      blocked?{level:"MEDIUM",title:"Packing Groups Blocked",detail:`${blocked} serial groups are waiting for rework completion.`,href:"/packing",count:blocked}:null,
      orders.filter(order=>order.risk==="AT_RISK").length?{level:"HIGH",title:"Sales Orders Near Target",detail:`${orders.filter(order=>order.risk==="AT_RISK").length} Sales Orders require attention.`,href:"/sales-orders",count:orders.filter(order=>order.risk==="AT_RISK").length}:null,
    ].filter(Boolean);
    return{
      generated_at:new Date().toISOString(),
      kpis:{open_sales_orders:store.salesOrders.filter(order=>!["CLOSED","CANCELLED"].includes(order.status)).length,open_order_qty:store.salesOrders.flatMap(order=>order.lines).reduce((sum,line)=>sum+line.quantity,0),qc_today:inspectedToday.length,qc_pass_rate:inspectedToday.length?Math.round(inspectedToday.filter(item=>item.initial_result==="PASS").length/inspectedToday.length*1000)/10:0,open_rework:store.preLaserItems.filter(item=>item.status==="REWORK").length,available_fg:availableFG,available_master_boxes:store.masterBoxes.length,deliveries_due:0},
      throughput,
      wip:[{key:"INITIAL_QC",label:"Initial QC",quantity:store.preLaserItems.filter(item=>item.status==="QC_PENDING").length,href:"/qc"},{key:"REWORK",label:"Rework",quantity:store.preLaserItems.filter(item=>item.status==="REWORK").length,href:"/qc/rework"},{key:"WAITING_LASER",label:"Waiting Laser",quantity:store.preLaserItems.filter(item=>item.status==="QC_PASSED_UNMARKED").length,href:"/laser-marking"},{key:"WAITING_PACKING",label:"Waiting Packing",quantity:store.units.filter(item=>item.status==="PASSED_UNBOXED").length,href:"/packing"},{key:"FINISHED_GOODS",label:"Finished Goods",quantity:availableFG,href:"/finished-goods"}],
      orders,quality:{total:inspected.length,passed,rejected:inspected.length-passed,defects:Array.from(defectMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([reason,count])=>({reason,count}))},inventory:Array.from(inventoryMap.values()),deliveries:[],actions,
    } as T;
  }

  if (url.pathname === "/api/finished-goods" && method === "GET") {
    const items = store.masterBoxes.slice().reverse().map((master) => {
      const production = productionDetails(master.production_order_id);
      const order = store.salesOrders.find((candidate) => candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === master.production_order_id));
      const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
      const boxes = master.small_box_ids.map((id) => store.smallBoxes.find((box) => box.id === id)).filter(Boolean) as MockStore["smallBoxes"];
      return {
        id: master.id, master_box_code: master.master_box_code,
        small_box_qty: boxes.length, unit_qty: master.actual_unit_qty, packed_at: master.created_at,
        production_order: production?.number ?? "UNKNOWN", so_number: order?.so_number ?? "UNKNOWN",
        product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product",
        stock_status: "AVAILABLE", delivery_order: null,
        small_box_codes: boxes.map((box) => box.box_code),
        serial_from: boxes.map((box) => box.serial_from).sort()[0] ?? null,
        serial_to: boxes.map((box) => box.serial_to).sort().at(-1) ?? null,
      };
    });
    return { items } as T;
  }

  const finishedGoodMatch = url.pathname.match(/^\/api\/finished-goods\/(.+)$/);
  if (finishedGoodMatch && method === "GET") {
    const code = decodeURIComponent(finishedGoodMatch[1]).toUpperCase();
    const master = store.masterBoxes.find((item) => item.master_box_code === code);
    if (!master) throw new Error("Finished Goods Master Box not found.");
    const production = productionDetails(master.production_order_id);
    const order = store.salesOrders.find((candidate) => candidate.lines.some((_, index) => candidate.id * 1000 + index + 1 === master.production_order_id));
    const product = production ? store.products.find((item) => item.id === production.line.product_id) : null;
    const boxes = master.small_box_ids.map((id) => store.smallBoxes.find((box) => box.id === id)).filter(Boolean) as MockStore["smallBoxes"];
    return {
      id: master.id, master_box_code: master.master_box_code,
      small_box_qty: boxes.length, unit_qty: master.actual_unit_qty, packed_at: master.created_at,
      production_order: production?.number ?? "UNKNOWN", so_number: order?.so_number ?? "UNKNOWN",
      product_code: product?.code ?? "UNKNOWN", product_name: product?.name ?? "Unknown Product",
      stock_status: "AVAILABLE", delivery_order: null,
      small_boxes: boxes.map((box) => ({
        box_code: box.box_code, qty: box.actual_qty, packed_at: box.packed_at,
        serial_from: box.serial_from, serial_to: box.serial_to,
        serials: store.units.filter((unit) => unit.serial_group_id === box.serial_group_id).sort((a,b) => a.group_position-b.group_position).map((unit) => unit.serial_number),
      })),
    } as T;
  }

  if (url.pathname === "/api/delivery-orders" && method === "GET") {
    return { items: [] } as T;
  }

  throw new Error("This action requires the connected backend server and is not available in Local Demo Mode.");
}
