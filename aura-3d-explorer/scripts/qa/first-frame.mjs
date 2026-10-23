// Time to the first rendered 3D frame of the landing hero.
// Chrome with 4× CPU throttling (DevTools Emulation.setCPUThrottlingRate).
// "First frame" = the first animation frame in which the WebGL canvas holds
// non-uniform pixels (the scene drew something), read through
// preserveDrawingBuffer. Reported from navigation start, in milliseconds.
//
//   QA_URL=http://127.0.0.1:3137 node scripts/qa/first-frame.mjs
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.QA_URL || 'http://127.0.0.1:3137';
const route = process.env.QA_ROUTE || '/';
const runs = Number(process.env.QA_RUNS || 3);
const throttle = Number(process.env.QA_CPU || 4);
const output = process.env.QA_OUT || 'docs/qa/overnight/first-frame.json';
const gpuArgs = process.env.QA_GPU === '1' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: gpuArgs });
const results = [];
try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.addInitScript(() => {
      const probe = document.createElement('canvas');
      probe.width = 32; probe.height = 20;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      const marks = {};
      window.__auraFirstFrame = marks;
      const tick = () => {
        const gl = document.querySelector('canvas:not([data-probe])');
        if (gl && !marks.canvas) marks.canvas = performance.now();
        if (gl && gl.width > 0) {
          ctx.drawImage(gl, 0, 0, probe.width, probe.height);
          const d = ctx.getImageData(0, 0, probe.width, probe.height).data;
          let min = 255, max = 0;
          for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; min = Math.min(min, v); max = Math.max(max, v); }
          if (max - min > 30) { marks.frame = performance.now(); return; }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(base + route, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__auraFirstFrame?.frame, null, { timeout: 180000, polling: 250 }).catch(() => null);
    const marks = await page.evaluate(() => ({ ...window.__auraFirstFrame, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null }));
    results.push({ run, ...Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v === null ? null : Math.round(v)])) });
    console.log(`run ${run + 1}: canvas ${Math.round(marks.canvas)} ms, first 3D frame ${marks.frame ? Math.round(marks.frame) : 'none'} ms, FCP ${Math.round(marks.fcp ?? 0)} ms`);
    await context.close();
  }
} finally {
  await browser.close();
}
const frames = results.map((r) => r.frame).filter(Boolean).sort((a, b) => a - b);
const summary = { url: base + route, cpuThrottle: throttle, renderer: gpuArgs.length ? 'SwiftShader (software WebGL, no GPU)' : 'hardware GPU', runs: results, medianFirstFrameMs: frames[Math.floor(frames.length / 2)] ?? null };
await fs.mkdir('docs/qa/overnight', { recursive: true });
await fs.writeFile(output, JSON.stringify(summary, null, 2));
console.log('median first frame', summary.medianFirstFrameMs, 'ms');
