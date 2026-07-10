const pptxgen = require("../proposal-tools/node_modules/pptxgenjs");
const path = require("path");
const fs = require("fs");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "MRP Traceability";
pptx.company = "MRP Traceability";
pptx.subject = "Proposal Implementasi MRP Traceability";
pptx.title = "Proposal Implementasi MRP Traceability";
pptx.lang = "id-ID";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "id-ID",
};
pptx.defineLayout({ name: "CUSTOM_WIDE", width: 13.333, height: 7.5 });
pptx.layout = "CUSTOM_WIDE";

const OUT = __dirname;
const SHOTS = path.join(OUT, "screenshots");
const ROOT = path.resolve(__dirname, "..", "..");
const flowMain = path.join(ROOT, "output", "flowcharts", "01-flow-utama-mrp.png");
const flowQc = path.join(ROOT, "output", "flowcharts", "02-flow-qc-rework-packing.png");

const C = {
  navy: "172554",
  blue: "2563EB",
  sky: "EFF6FF",
  cyan: "06B6D4",
  green: "10B981",
  amber: "F59E0B",
  red: "EF4444",
  slate: "334155",
  muted: "64748B",
  light: "F8FAFC",
  line: "CBD5E1",
  white: "FFFFFF",
};

function addBg(slide, title, subtitle) {
  slide.background = { color: C.light };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: C.blue }, line: { color: C.blue } });
  slide.addText("MRP Traceability", { x: 0.55, y: 0.35, w: 2.4, h: 0.25, fontSize: 9, bold: true, color: C.blue, margin: 0 });
  slide.addText(title, { x: 0.55, y: 0.72, w: 7.7, h: 0.46, fontSize: 23, bold: true, color: "0F172A", margin: 0 });
  if (subtitle) slide.addText(subtitle, { x: 0.57, y: 1.17, w: 7.9, h: 0.28, fontSize: 9.5, color: C.muted, margin: 0 });
}

function titleSlide() {
  const s = pptx.addSlide();
  s.background = { color: C.navy };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.navy }, line: { color: C.navy } });
  s.addShape(pptx.ShapeType.rect, { x: 8.7, y: -0.2, w: 5.2, h: 7.9, fill: { color: "1D4ED8", transparency: 15 }, line: { color: "1D4ED8", transparency: 100 } });
  s.addText("PROPOSAL IMPLEMENTASI", { x: 0.72, y: 0.95, w: 4.1, h: 0.28, fontSize: 11, bold: true, color: "93C5FD", charSpace: 2, margin: 0 });
  s.addText("MRP Traceability\nSystem", { x: 0.72, y: 1.45, w: 6.6, h: 1.5, fontSize: 40, bold: true, color: C.white, breakLine: false, margin: 0 });
  s.addText("Digitalisasi proses Sales Order, QC, Rework, Laser Marking, Packing, Finished Goods, Delivery, dan traceability end-to-end.", { x: 0.76, y: 3.18, w: 5.9, h: 0.55, fontSize: 14, color: "DBEAFE", margin: 0.02, breakLine: false });
  [
    ["Traceability", "Serial, tray, box, dan delivery dapat ditelusuri"],
    ["Operational Control", "Status WIP, QC, packing, dan delivery terlihat real-time"],
    ["Audit Ready", "PIC, waktu proses, dan aktivitas sistem terdokumentasi"],
  ].forEach((item, i) => {
    const y = 4.25 + i * 0.62;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.76, y, w: 5.6, h: 0.44, rectRadius: 0.06, fill: { color: "1E3A8A", transparency: 5 }, line: { color: "60A5FA", transparency: 35 } });
    s.addText(item[0], { x: 1.0, y: y + 0.09, w: 1.45, h: 0.18, fontSize: 9.5, bold: true, color: C.white, margin: 0 });
    s.addText(item[1], { x: 2.45, y: y + 0.09, w: 3.6, h: 0.18, fontSize: 8.5, color: "BFDBFE", margin: 0 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.25, y: 1.15, w: 4.2, h: 4.85, rectRadius: 0.08, fill: { color: C.white, transparency: 2 }, line: { color: "BFDBFE", transparency: 40 } });
  const shot = path.join(SHOTS, "dashboard.png");
  if (fs.existsSync(shot)) s.addImage({ path: shot, x: 8.47, y: 1.42, w: 3.75, h: 2.35 });
  s.addText("Prepared for Customer Presentation", { x: 8.55, y: 4.13, w: 3.5, h: 0.3, fontSize: 14, bold: true, color: "0F172A", margin: 0 });
  s.addText("Scope: one-month implementation proposal and application overview", { x: 8.55, y: 4.55, w: 3.5, h: 0.45, fontSize: 10.5, color: C.muted, margin: 0.02 });
  s.addText("July 2026", { x: 8.55, y: 5.15, w: 2.0, h: 0.25, fontSize: 10, bold: true, color: C.blue, margin: 0 });
}

function addCard(slide, x, y, w, h, title, body, color = C.blue) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line, transparency: 20 } });
  slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h, fill: { color }, line: { color } });
  slide.addText(title, { x: x + 0.25, y: y + 0.18, w: w - 0.45, h: 0.25, fontSize: 12, bold: true, color: "0F172A", margin: 0 });
  slide.addText(body, { x: x + 0.25, y: y + 0.55, w: w - 0.45, h: h - 0.75, fontSize: 9.5, color: C.slate, margin: 0.02, breakLine: false, fit: "shrink" });
}

function backgroundSlide() {
  const s = pptx.addSlide();
  addBg(s, "Background & Current Condition", "Kondisi awal customer saat proses masih manual dan belum memakai sistem terintegrasi.");
  addCard(s, 0.7, 1.75, 3.85, 4.15, "Kondisi Saat Ini", "- Pencatatan Sales Order, produksi, QC, packing, dan delivery masih manual.\n- Identitas tray, serial, dan box rawan tidak konsisten antar proses.\n- Monitoring progress bergantung pada komunikasi operator dan dokumen terpisah.\n- Data historis sulit dicari kembali saat ada pertanyaan customer atau audit.", C.red);
  addCard(s, 4.85, 1.75, 3.85, 4.15, "Dampak Operasional", "- Risiko salah input dan duplikasi data.\n- Lead time investigasi lebih lama saat terjadi NG/rework/complaint.\n- Visibility WIP rendah: sulit tahu posisi barang ada di QC, laser, packing, FG, atau delivery.\n- Laporan performance dan traceability perlu rekap manual.", C.amber);
  addCard(s, 9.0, 1.75, 3.55, 4.15, "Kebutuhan Solusi", "- Sistem terpusat untuk mencatat transaksi produksi.\n- Traceability dari Sales Order sampai Delivery Order.\n- QC dan Rework yang terkontrol dengan PIC dan timestamp.\n- Dashboard untuk monitoring real-time dan laporan siap audit.", C.green);
}

function objectiveSlide() {
  const s = pptx.addSlide();
  addBg(s, "Tujuan Implementasi", "Membangun aplikasi operasional yang mempercepat proses, mengurangi risiko manual, dan meningkatkan traceability.");
  const goals = [
    ["Digital Process Control", "Mengubah proses manual menjadi workflow digital yang terstruktur per module."],
    ["End-to-End Traceability", "Melacak hubungan SO, PO, tray, QC, rework, serial, small box, master box, FG, dan DO."],
    ["Quality Visibility", "Memantau pass rate, NG category, open rework, dan histori QC per PIC."],
    ["Operational Dashboard", "Memberikan ringkasan status WIP, fulfillment order, inventory FG, dan delivery readiness."],
    ["Audit & Accountability", "Mencatat user/PIC, station, waktu transaksi, dan perubahan data penting."],
  ];
  goals.forEach((g, i) => {
    const x = 0.75 + (i % 2) * 5.9;
    const y = 1.75 + Math.floor(i / 2) * 1.35;
    addCard(s, x, y, i === 4 ? 11.8 : 5.55, 1.0, g[0], g[1], [C.blue, C.green, C.amber, C.cyan, C.navy][i]);
  });
}

function flowSlide() {
  const s = pptx.addSlide();
  addBg(s, "Flow Apps", "Alur utama aplikasi dari order sampai delivery dan backward traceability.");
  const steps = [
    ["1", "Sales Order", "Input demand customer"],
    ["2", "Production Setup", "Generate production order dan tray cycle"],
    ["3", "Initial QC", "OK masuk pass tray, NG masuk rework"],
    ["4", "Laser Marking", "Serialisasi unit komersial"],
    ["5", "Packing", "Small box dan master box"],
    ["6", "Finished Goods", "Stock tersedia untuk delivery"],
    ["7", "Delivery Order", "Assign dan ship barang"],
    ["8", "Traceability", "Cari history dari serial/box/order"],
  ];
  steps.forEach((st, i) => {
    const x = 0.55 + (i % 4) * 3.15;
    const y = 1.75 + Math.floor(i / 4) * 1.75;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.65, h: 1.05, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line } });
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.18, y: y + 0.22, w: 0.52, h: 0.52, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText(st[0], { x: x + 0.18, y: y + 0.34, w: 0.52, h: 0.15, fontSize: 9, bold: true, color: C.white, align: "center", margin: 0 });
    s.addText(st[1], { x: x + 0.82, y: y + 0.2, w: 1.6, h: 0.22, fontSize: 10.5, bold: true, color: "0F172A", margin: 0 });
    s.addText(st[2], { x: x + 0.82, y: y + 0.5, w: 1.6, h: 0.28, fontSize: 8.3, color: C.muted, margin: 0 });
    if (i % 4 !== 3) s.addShape(pptx.ShapeType.line, { x: x + 2.67, y: y + 0.52, w: 0.42, h: 0, line: { color: C.blue, width: 1.5, beginArrowType: "none", endArrowType: "triangle" } });
  });
  if (fs.existsSync(flowMain)) s.addImage({ path: flowMain, x: 1.2, y: 5.05, w: 10.9, h: 1.65 });
}

function qcFlowSlide() {
  const s = pptx.addSlide();
  addBg(s, "Flow QC, Rework, Packing", "Kontrol kualitas diposisikan sebelum serialisasi dan tetap menjaga jalur rework.");
  if (fs.existsSync(flowQc)) s.addImage({ path: flowQc, x: 0.7, y: 1.55, w: 7.0, h: 4.5 });
  addCard(s, 8.05, 1.55, 4.55, 1.2, "Initial QC", "Operator memilih order, scan source tray, input actual qty, lalu record OK/NG per item.", C.blue);
  addCard(s, 8.05, 3.0, 4.55, 1.2, "Rework QC", "Item NG diberi rework label dan masuk rework tray. Setelah diperbaiki, operator scan label untuk pass rework.", C.amber);
  addCard(s, 8.05, 4.45, 4.55, 1.2, "Packing & FG", "Item yang sudah laser marked dipacking ke small box/master box, lalu menjadi finished goods siap delivery.", C.green);
}

function moduleSlide() {
  const s = pptx.addSlide();
  addBg(s, "List Module", "Ruang lingkup module aplikasi yang disiapkan untuk proses operasional end-to-end.");
  const modules = [
    ["Dashboard", "KPI operasional, WIP pipeline, quality snapshot, FG, dan delivery readiness."],
    ["Master Data", "Customer, product, packaging config, tray label, NG category."],
    ["Sales Order", "Input demand customer dan generate production order."],
    ["Initial QC", "Start QC session, record OK/NG, rework label, output tray."],
    ["Rework QC", "Lock rework tray, scan rework label, pass rework, release ke laser."],
    ["Laser Marking", "Generate serial commercial dan kirim job ke laser device/simulator."],
    ["Packing", "Small box, master box, label, dan packing completion."],
    ["Finished Goods", "Stock FG, master box availability, allocation status."],
    ["Delivery Order", "Create DO, assign master box, ship order."],
    ["Traceability", "Backward search by serial/box/order untuk audit dan complaint handling."],
    ["User & Role", "Login, role-based access, permission per module."],
    ["Audit Log", "Catatan transaksi mutasi, PIC, waktu, dan module terkait."],
  ];
  modules.forEach((m, i) => {
    const x = 0.65 + (i % 3) * 4.2;
    const y = 1.58 + Math.floor(i / 3) * 1.22;
    addCard(s, x, y, 3.8, 0.95, m[0], m[1], [C.blue, C.green, C.amber][i % 3]);
  });
}

function timelineSlide() {
  const s = pptx.addSlide();
  addBg(s, "Timeline Implementasi 1 Bulan", "Rencana kerja ringkas untuk deployment awal, UAT, dan go-live.");
  const weeks = [
    ["Week 1", "Discovery & Setup", "Kickoff, finalisasi flow, mapping master data, setup environment, initial data template."],
    ["Week 2", "Configuration & Core Flow", "Master data, sales order, QC flow, tray setup, laser/printing simulator, role access."],
    ["Week 3", "Integration & UAT", "Packing, finished goods, delivery, traceability, audit log, test scenario bersama user."],
    ["Week 4", "Training & Go-Live", "User training, data migration awal, parallel run, issue fixing, production go-live support."],
  ];
  weeks.forEach((w, i) => {
    const x = 0.8 + i * 3.05;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 2.05, w: 2.55, h: 3.1, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.line } });
    s.addShape(pptx.ShapeType.rect, { x, y: 2.05, w: 2.55, h: 0.55, fill: { color: [C.blue, C.cyan, C.amber, C.green][i] }, line: { color: [C.blue, C.cyan, C.amber, C.green][i] } });
    s.addText(w[0], { x: x + 0.18, y: 2.22, w: 1.1, h: 0.16, fontSize: 9.5, bold: true, color: C.white, margin: 0 });
    s.addText(w[1], { x: x + 0.18, y: 2.82, w: 2.1, h: 0.34, fontSize: 15, bold: true, color: "0F172A", margin: 0 });
    s.addText(w[2], { x: x + 0.18, y: 3.42, w: 2.12, h: 1.25, fontSize: 9.5, color: C.slate, margin: 0.02, breakLine: false, fit: "shrink" });
  });
  s.addText("Output akhir: aplikasi siap demo/UAT, user training selesai, flow utama berjalan, dan dokumen issue list untuk improvement berikutnya.", { x: 1.05, y: 5.85, w: 11.2, h: 0.42, fontSize: 12, bold: true, color: C.navy, align: "center", margin: 0.02 });
}

function captureGridSlide() {
  const s = pptx.addSlide();
  addBg(s, "Capture System", "Contoh tampilan aplikasi yang sudah tersedia untuk proses operasional.");
  const shots = [
    ["Dashboard", "dashboard.png"],
    ["Initial QC", "initial-qc.png"],
    ["Rework QC", "rework-qc.png"],
    ["Laser Marking", "laser-marking.png"],
  ];
  shots.forEach((shot, i) => {
    const x = 0.7 + (i % 2) * 6.05;
    const y = 1.55 + Math.floor(i / 2) * 2.55;
    const img = path.join(SHOTS, shot[1]);
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.55, h: 2.15, rectRadius: 0.04, fill: { color: C.white }, line: { color: C.line } });
    if (fs.existsSync(img)) s.addImage({ path: img, x: x + 0.08, y: y + 0.08, w: 5.39, h: 1.72 });
    s.addText(shot[0], { x: x + 0.15, y: y + 1.88, w: 5.2, h: 0.18, fontSize: 9.5, bold: true, color: C.slate, margin: 0 });
  });
}

function captureDetailSlide(title, file, notes) {
  const s = pptx.addSlide();
  addBg(s, title, "Capture layar module aplikasi.");
  const img = path.join(SHOTS, file);
  if (fs.existsSync(img)) s.addImage({ path: img, x: 0.6, y: 1.55, w: 8.2, h: 5.13 });
  addCard(s, 9.1, 1.55, 3.55, 5.13, "Highlights", notes, C.blue);
}

function closingSlide() {
  const s = pptx.addSlide();
  s.background = { color: C.navy };
  s.addText("Next Step", { x: 0.85, y: 1.15, w: 3.8, h: 0.45, fontSize: 28, bold: true, color: C.white, margin: 0 });
  s.addText("1. Review flow dan scope module bersama customer\n2. Konfirmasi data master dan format label/serial\n3. Finalisasi timeline implementasi 1 bulan\n4. Mulai kickoff project dan UAT scenario", { x: 0.9, y: 2.05, w: 6.2, h: 1.6, fontSize: 17, color: "DBEAFE", breakLine: false, margin: 0.02 });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.0, y: 1.3, w: 4.2, h: 3.9, rectRadius: 0.08, fill: { color: C.white, transparency: 3 }, line: { color: "60A5FA", transparency: 35 } });
  s.addText("MRP Traceability System", { x: 8.35, y: 2.0, w: 3.5, h: 0.4, fontSize: 19, bold: true, color: "0F172A", margin: 0 });
  s.addText("Operational visibility, controlled quality process, and end-to-end product traceability.", { x: 8.35, y: 2.58, w: 3.35, h: 0.72, fontSize: 12, color: C.slate, margin: 0.02 });
  s.addText("Thank You", { x: 8.35, y: 4.1, w: 2.4, h: 0.35, fontSize: 20, bold: true, color: C.blue, margin: 0 });
}

titleSlide();
backgroundSlide();
objectiveSlide();
flowSlide();
qcFlowSlide();
moduleSlide();
timelineSlide();
captureGridSlide();
captureDetailSlide("Capture: Dashboard", "dashboard.png", "- Menampilkan KPI order, QC, rework, finished goods, dan delivery due.\n- WIP pipeline membantu team melihat posisi pekerjaan saat ini.\n- Quality snapshot membantu monitoring trend OK/NG.");
captureDetailSlide("Capture: Initial QC", "initial-qc.png", "- Operator start QC session berdasarkan order dan source tray.\n- Record OK/NG per item dengan histori session.\n- Output tray dikonfirmasi sebelum item lanjut ke laser.");
captureDetailSlide("Capture: Rework QC", "rework-qc.png", "- Rework tray dapat dikunci per station.\n- Operator scan rework label untuk controlled return inspection.\n- Item yang lolos rework dilepas ke pass tray.");
captureDetailSlide("Capture: Packing & Traceability", "packing.png", "- Packing mengontrol small box dan master box.\n- Finished goods dapat dialokasikan ke delivery order.\n- Traceability mendukung pencarian history produk.");
closingSlide();

pptx.writeFile({ fileName: path.join(OUT, "Proposal_MRP_Traceability.pptx") });
