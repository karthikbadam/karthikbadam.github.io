// Thumbnail capture for the San(key)ⁿ demo: waits for the sankey to render,
// then clips to the chart panel (header + legend + chart) in landscape.
// Usage: node scripts/shot-sankeyn.mjs <dark|light> <out.png>
import { chromium } from "playwright-core";

const theme = process.argv[2] ?? "dark";
const out = process.argv[3];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1240 },
  deviceScaleFactor: 2,
});
await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
await page.goto("http://localhost:5173/#/sankeyn");
await page.waitForFunction(
  () => document.querySelectorAll("svg path").length > 100,
  { timeout: 60000 },
);
await page.waitForTimeout(2500);

const rect = await page.evaluate(() => {
  let best = null;
  for (const s of document.querySelectorAll("svg")) {
    const r = s.getBoundingClientRect();
    if (!best || r.width * r.height > best.width * best.height) best = r;
  }
  return { x: best.x, y: best.y, width: best.width, height: best.height };
});
await page.screenshot({
  path: out,
  clip: {
    x: Math.max(0, rect.x - 8),
    y: Math.max(0, rect.y - 44),
    width: rect.width + 16,
    height: rect.height + 52,
  },
});
await browser.close();
