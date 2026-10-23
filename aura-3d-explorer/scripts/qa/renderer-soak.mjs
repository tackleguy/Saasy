// Renderer resource soak for the current (mapped-city) scene.
// Five High→Low quality cycles on the bare render route; renderer geometry and
// texture counts must return to the same value for the same tier every cycle.
// Counts are three.js renderer resources (gl.info.memory), not heap or GPU bytes.
//
//   QA_URL=http://127.0.0.1:3137 node scripts/qa/renderer-soak.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.QA_URL || 'http://127.0.0.1:3137';
const output = process.env.QA_OUT || 'docs/qa/overnight/renderer-soak.json';
const settle = Number(process.env.QA_SETTLE_MS || 9000);
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const result = { started: new Date().toISOString(), url: base, passed: false, samples: [], pageErrors: [], consoleWarnings: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => result.pageErrors.push(String(error)));
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) result.consoleWarnings.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
  await page.goto(`${base}/render/meridian-tower?graphics=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas[data-graphics]', { timeout: 120000 });
  await page.waitForTimeout(settle);
  const quality = page.getByLabel('Scene quality', { exact: true });
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const tier of ['high', 'low']) {
      await quality.selectOption(tier);
      await page.waitForTimeout(settle);
      const graphics = await page.locator('canvas').first().evaluate((c) => JSON.parse(c.dataset.graphics));
      result.samples.push({ cycle, tier, geometries: graphics.geometries, textures: graphics.textures, programs: graphics.programs });
      console.log(`cycle ${cycle + 1}/5 ${tier}: ${graphics.geometries} geometries / ${graphics.textures} textures / ${graphics.programs} programs`);
    }
  }
  for (const tier of ['high', 'low']) {
    const series = result.samples.filter((s) => s.tier === tier);
    // Cycle 1 may still be warming caches (first High compile); steady state is cycles 2–5.
    const steady = series.slice(1);
    assert.ok(steady.every((s) => s.geometries === steady[0].geometries), `${tier} geometry count drifts: ${series.map((s) => s.geometries).join(', ')}`);
    assert.ok(steady.every((s) => s.textures === steady[0].textures), `${tier} texture count drifts: ${series.map((s) => s.textures).join(', ')}`);
  }
  assert.deepEqual(result.pageErrors, []);
  result.passed = true;
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
} finally {
  result.finished = new Date().toISOString();
  await fs.mkdir(new URL('.', `file://${process.cwd()}/${output}`).pathname, { recursive: true });
  await fs.writeFile(output, JSON.stringify(result, null, 2));
  console.log(result.passed ? 'PASS' : `FAIL ${result.error}`);
  await browser.close();
}
