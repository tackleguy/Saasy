// Presentation mode keyboard check at 1920 × 1080 (desktop) and 1024 × 768 (iPad
// landscape, touch). ← / → camera views, F / Shift+F floors, E explode, W walk,
// Esc leaves the walk then presentation. Screenshots to docs/qa/overnight/presentation/.
//   QA_URL=http://127.0.0.1:3137 node scripts/qa/presentation-keys.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.QA_URL || 'http://127.0.0.1:3137';
const out = 'docs/qa/overnight/presentation';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
for (const [name, options] of [['desktop-1920', { viewport: { width: 1920, height: 1080 } }], ['ipad-1024', { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false }]]) {
  const page = await (await browser.newContext(options)).newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const checks = [];
  const check = async (label, fn) => { try { await fn(); checks.push({ label, ok: true }); } catch (e) { checks.push({ label, ok: false, error: String(e).slice(0, 300) }); } };
  await page.goto(`${base}/projects/meridian-tower`);
  await page.getByRole('button', { name: 'Present building' }).first().click();
  const exit = page.getByRole('button', { name: 'Exit presentation' });
  await exit.waitFor();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}-open.png` });
  const pressedAngle = () => page.getByRole('group', { name: 'Photo angles' }).locator('[aria-pressed="true"]').innerText().catch(() => null);
  // Full-page captures: element screenshots wait for a still canvas, which a live 3D scene never is.
  const frame = () => page.screenshot({ timeout: 240000 });
  const walkExit = page.getByRole('button', { name: 'Exit', exact: true });
  await check('→ moves to the next camera view', async () => { const angle = await pressedAngle(); const before = await frame(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(3000); if (angle) assert.notEqual(await pressedAngle(), angle); else assert.ok(!before.equals(await frame()), 'view changed'); });
  await check('← moves back', async () => { const before = await frame(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(5000); assert.ok(!before.equals(await frame()), 'view changed'); });
  const floorStatus = page.getByRole('status').filter({ hasText: /Floor \d+ \/ \d+/ });
  await check('F selects a floor (label shows it)', async () => { await page.keyboard.press('f'); await floorStatus.waitFor({ timeout: 15000 }); await page.screenshot({ path: `${out}/${name}-floor.png` }); });
  await check('F / Shift+F step floors', async () => { await page.keyboard.press('f'); await page.waitForTimeout(800); const before = await floorStatus.innerText(); await page.keyboard.press('Shift+F'); await page.waitForTimeout(800); assert.notEqual(await floorStatus.innerText(), before); });
  await check('E explodes the stack', async () => { const before = await frame(); await page.keyboard.press('e'); await page.waitForTimeout(3500); await page.screenshot({ path: `${out}/${name}-exploded.png` }); assert.ok(!before.equals(await frame()), 'scene changed'); await page.keyboard.press('e'); await page.waitForTimeout(2000); });
  await check('W starts the walk-through', async () => { await page.keyboard.press('w'); await walkExit.waitFor({ timeout: 30000 }); assert.ok(await page.getByRole('button', { name: 'Walk forward' }).count() > 0, 'touch movement buttons shown'); for (const control of [walkExit, page.getByRole('button', { name: 'Walk forward' }), page.locator('p:has-text("Walk-through") + div button').first()]) assert.ok(await control.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && el.contains(hit); }), 'walk control is not covered'); await page.waitForTimeout(6000); await page.screenshot({ path: `${out}/${name}-walk.png` }); });
  await check('Esc leaves the walk, still presenting', async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(500); await page.waitForTimeout(2000); assert.equal(await walkExit.count(), 0); assert.ok(await exit.isVisible()); });
  await check('Esc again leaves presentation', async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(2000); assert.equal(await exit.count(), 0); });
  await check('no horizontal overflow', async () => assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))));
  results.push({ name, checks, pageErrors: errors });
  console.log(name, checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label}${c.error ? ' — ' + c.error.slice(0, 160) : ''}`).join('\n  '));
  await page.context().close();
}
await browser.close();
await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
if (results.some((r) => r.checks.some((c) => !c.ok) || r.pageErrors.length)) process.exitCode = 1;
