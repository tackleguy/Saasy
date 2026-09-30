/**
 * Photographs every project from the live 3D scene and writes the hero
 * renders the site uses:
 *
 *   public/projects/<slug>/hero-1.jpg   waterfront (also the OpenGraph image)
 *   public/projects/<slug>/hero-2.jpg   street level at the podium
 *   public/projects/<slug>/hero-3.jpg   interior — living room walk-through view
 *
 * Needs a running production build:  npm run build && npm start
 * Then:                               node scripts/capture-heroes.mjs [--base http://localhost:3000] [--only slug]
 *
 * Uses the installed Google Chrome (headless, software GL is fine — it's
 * slow, not wrong) via playwright-core, and sharp to encode 1600×1000 JPGs.
 */
import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = opt("base", "http://localhost:3123");
const ONLY = opt("only", null);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "projects");

const SLUGS = ["meridian-tower", "seaform-hotel", "chess-towers", "infiniti", "refad-place", "broadway-bayonne", "lorenskog-quarter", "sports-world"];
const SHOTS = [
  { file: "hero-1.jpg", query: "angle=waterfront" },
  { file: "hero-2.jpg", query: "angle=street" },
  { file: "hero-3.jpg", query: "walk=1&view=0" },
];

const browser = await chromium.launch({ channel: "chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240_000);
page.on("pageerror", (e) => console.error("  page error:", e.message));

for (const slug of SLUGS) {
  if (ONLY && slug !== ONLY) continue;
  for (const shot of SHOTS) {
    const url = `${BASE}/render/${slug}?${shot.query}`;
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    // RenderView flags readiness ~6 s after mount; give the walk glide and post FX a little more.
    await page.waitForSelector("html[data-render-ready]", { timeout: 120_000 });
    if (shot.query.startsWith("walk")) await page.waitForSelector("html[data-walking]", { timeout: 120_000 });
    await page.waitForTimeout(shot.query.startsWith("walk") ? 8000 : 4000);
    // The main thread is busy with software GL, so a compositor screenshot can
    // stall; the canvas keeps its drawing buffer, so read the last frame directly.
    const dataUrl = await page.evaluate(() => document.querySelector("canvas")?.toDataURL("image/png") ?? "");
    if (!dataUrl) throw new Error(`no canvas for ${url}`);
    const png = Buffer.from(dataUrl.split(",")[1], "base64");
    const out = join(root, slug, shot.file);
    mkdirSync(dirname(out), { recursive: true });
    await sharp(png).jpeg({ quality: 86, progressive: true, mozjpeg: true }).toFile(out);
    console.log("✓", slug, shot.file);
  }
}
await browser.close();
