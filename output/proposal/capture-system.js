const { chromium } = require("../proposal-tools/node_modules/playwright-core");
const path = require("path");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = "http://localhost:3028";
const outDir = path.join(__dirname, "screenshots");

const pages = [
  { name: "dashboard", title: "Operations Dashboard", url: "/" },
  { name: "initial-qc", title: "Initial QC Station", url: "/qc" },
  { name: "rework-qc", title: "Rework QC", url: "/qc/rework" },
  { name: "laser-marking", title: "Laser Marking", url: "/laser-marking" },
  { name: "packing", title: "Packing", url: "/packing" },
  { name: "traceability", title: "Traceability", url: "/traceability" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    window.localStorage.setItem("mrp-demo-auth-user", "1");
  });
  const page = await context.newPage();
  for (const item of pages) {
    await page.goto(`${baseUrl}${item.url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(outDir, `${item.name}.png`), fullPage: false });
    console.log(`captured ${item.title}`);
  }
  await browser.close();
})();
