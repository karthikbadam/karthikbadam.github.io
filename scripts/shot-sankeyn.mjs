import { chromium } from "playwright-core";
const theme = process.argv[2] ?? "dark";
const out = process.argv[3];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1300 },
  deviceScaleFactor: 2,
});
await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
await page.goto("http://localhost:5173/#/sankeyn");
await page.waitForFunction(() => document.querySelectorAll("svg path").length > 100, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
await browser.close();
