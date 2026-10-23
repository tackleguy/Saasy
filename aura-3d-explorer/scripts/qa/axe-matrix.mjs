// Accessibility matrix: axe-core (WCAG 2.0/2.1 A + AA) on every public route at
// 390 / 768 / 1280 / 1920 px, plus interactive states and the signed-in /
// shared pages. Needs a running server wired to Supabase (for the account and
// share states) and its Mailpit inbox for sign-in.
//
//   QA_URL=http://127.0.0.1:3137 QA_MAILPIT=http://127.0.0.1:54324 QA_SHARE=<share url> node scripts/qa/axe-matrix.mjs
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axeSource = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.env.QA_URL || 'http://127.0.0.1:3137';
const mailpit = process.env.QA_MAILPIT || 'http://127.0.0.1:54324';
const out = 'docs/qa/overnight/axe';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];

async function audit(page, label) {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  results.push({ label, violations: r, overflow, ...(unsettled ? { measuredMidAnimation: true } : {}) });
  unsettled = false;
  console.log(`${r.length || overflow ? '✗' : '✓'} ${label}${r.length ? `: ${r.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}` : ''}${overflow ? ' horizontal overflow' : ''}`);
}

// Measure only once finite CSS/Web animations have finished (colour fades and
// sliding pills report mid-transition colours otherwise); endless ones such as
// spinners are ignored. Software WebGL can stall the page for several seconds,
// so allow 30 s; if animations are still running then, audit anyway and flag it.
let unsettled = false;
const settled = (p) => p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity), null, { timeout: 30000 }).then(() => { unsettled = false; }, () => { unsettled = true; });
const routes = ['/', '/projects', '/projects/meridian-tower', '/developers', '/studio', '/engine', '/tour', '/sign-in'];
for (const width of [390, 768, 1280, 1920]) {
  const context = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await settled(page);
    await audit(page, `${route} @${width}`);
  }
  await context.close();
}

// Interactive states at 1280.
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(120000);
const state = async (label, fn) => { try { await fn(); await page.waitForTimeout(1000); await settled(page); await audit(page, label); } catch (e) { results.push({ label, error: String(e).slice(0, 300) }); console.log(`! ${label}: ${String(e).slice(0, 200)}`); } };
await page.goto(`${base}/studio`, { waitUntil: 'domcontentloaded' });
await page.locator('canvas').first().waitFor();
await page.waitForTimeout(6000);
await state('studio: floor selected', async () => { await page.getByRole('navigation', { name: 'Tower zones' }).getByRole('button', { name: /Residential/ }).click(); });
await state('studio: exploded', async () => { await page.keyboard.press('Escape'); const s = page.getByRole('slider', { name: /Explosion/ }); await s.focus(); await page.keyboard.press('End'); });
await state('studio: walk-through', async () => { await page.getByRole('navigation', { name: 'Tower zones' }).getByRole('button', { name: /Residential/ }).click(); await page.getByRole('button', { name: /Walk/ }).first().click(); await page.waitForTimeout(4000); });
await state('studio: scenario drawer', async () => { await page.keyboard.press('Escape'); await page.goto(`${base}/studio`); await page.getByRole('button', { name: 'Saved scenarios' }).click(); await page.getByRole('dialog').waitFor(); });
await state('studio: CAD import modal', async () => { await page.keyboard.press('Escape'); await page.getByRole('button', { name: /Import CAD|CAD/ }).first().click(); await page.getByRole('dialog').waitFor(); });
await state('assistant panel open', async () => { await page.keyboard.press('Escape'); await page.getByRole('button', { name: /Ask AURA/ }).click(); await page.getByRole('dialog', { name: 'Ask AURA' }).waitFor(); });
await state('presentation mode', async () => { await page.goto(`${base}/projects/meridian-tower`); await page.getByRole('button', { name: 'Present building' }).first().click(); await page.getByRole('button', { name: 'Exit presentation' }).waitFor(); });
await state('enquiry error state', async () => {
  await page.keyboard.press('Escape');
  await page.getByLabel('Full name').fill('QA'); await page.getByLabel('Email', { exact: true }).fill('qa@example.com');
  await page.getByRole('button', { name: 'Book a viewing' }).click();
  await page.waitForTimeout(2000);
});

// Signed-in pages.
const email = `axe+${Date.now()}@aura.example`;
await state('sign-in: link sent', async () => {
  await page.goto(`${base}/sign-in`); await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click(); await page.getByText('Check your inbox.').waitFor();
});
let link = '';
for (let i = 0; i < 30 && !link; i++) {
  const list = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
  const id = list.messages?.[0]?.ID;
  if (id) link = /(https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+)/.exec((await (await fetch(`${mailpit}/api/v1/message/${id}`)).json()).HTML ?? '')?.[1]?.replace(/&amp;/g, '&') ?? '';
  if (!link) await new Promise((r) => setTimeout(r, 1000));
}
if (link) {
  await page.goto(link); await page.waitForURL(/\/app$/);
  await state('dashboard: company setup', async () => {});
  await page.getByLabel('Company name').fill('Axe Developments'); await page.getByLabel(/Short name for links/).fill(`axe-${Date.now().toString(36)}`); await page.getByRole('button', { name: 'Create company' }).click();
  await state('dashboard: projects', async () => { await page.getByRole('heading', { name: 'Your projects' }).waitFor(); });
  await state('branding settings', async () => { await page.goto(`${base}/app/settings`); });
  await page.goto(`${base}/app`); await page.getByLabel('Project name').fill('Axe Tower'); await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/app\/projects\//); await page.locator('canvas').first().waitFor();
  await state('project editor (all sections open)', async () => { for (const s of await page.locator('details summary').all()) await s.click().catch(() => {}); });
  await state('project present page', async () => { await page.goto(page.url() + '/present'); await page.getByRole('button', { name: 'Exit presentation' }).waitFor(); });
}
if (process.env.QA_SHARE) {
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  guest.setDefaultTimeout(120000);
  await guest.goto(process.env.QA_SHARE); await guest.waitForTimeout(4000); await settled(guest);
  await audit(guest, 'share page (private window)');
}
await browser.close();
const failing = results.filter((r) => r.error || r.overflow || r.violations?.length);
await fs.writeFile(`${out}/results.json`, JSON.stringify({ base, checked: results.length, failing: failing.length, results }, null, 2));
console.log(`checked ${results.length}, failing ${failing.length}`);
if (failing.length) process.exitCode = 1;
