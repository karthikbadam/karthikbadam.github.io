// Thumbnail capture for the San(key)ⁿ demo: waits for the sankey to render,
// then clips to the chart panel (header + legend + chart) in landscape.
// Usage: node scripts/shot-sankeyn.mjs <dark|light> <out.png>
import { chromium } from "playwright-core";

const theme = process.argv[2] ?? "dark";
const out = process.argv[3];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 960, height: 780 },
  deviceScaleFactor: 1.5,
});
await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
await page.goto("http://localhost:5173/#/sankeyn");
await page.waitForFunction(
  () => document.querySelectorAll("svg path").length > 100,
  { timeout: 60000 },
);
await page.waitForTimeout(2500);

// Frame from just below the navbar through the chart, so the card shows the
// title, dataset cards, and slider for context above the sankey.
const rect = await page.evaluate(() => {
  const nav = document.querySelector("header")?.getBoundingClientRect();
  let best = null;
  for (const s of document.querySelectorAll("svg")) {
    const r = s.getBoundingClientRect();
    if (!best || r.width * r.height > best.width * best.height) best = r;
  }
  return { top: nav ? nav.bottom : 0, bottom: best.bottom + 8 };
});
await page.screenshot({
  path: out,
  clip: {
    x: 0,
    y: rect.top,
    width: page.viewportSize().width,
    height: rect.bottom - rect.top,
  },
});
await browser.close();
