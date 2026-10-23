// End-to-end customer flow against a running AURA server wired to Supabase
// (local `supabase start` is fine), operated with the keyboard only — no mouse
// clicks; file pickers use setInputFiles because a file dialog cannot be typed.
//
//   sign in (magic link from the Mailpit test inbox) → create company →
//   create project → set address → load surroundings → edit massing → save →
//   save scenario → create share link → open it in a private window →
//   export PDF and XLSX → revoke the link → private window loses access
//
//   QA_URL=http://127.0.0.1:3137 QA_MAILPIT=http://127.0.0.1:54324 node scripts/qa/customer-flow.mjs
// Writes screenshots and results to docs/qa/overnight/customer-flow/.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.QA_URL || 'http://127.0.0.1:3137';
const mailpit = process.env.QA_MAILPIT || 'http://127.0.0.1:54324';
const out = 'docs/qa/overnight/customer-flow';
const address = process.env.QA_ADDRESS || '200 Hudson Street, Jersey City';
const email = `owner+${Date.now()}@harbor.example`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const steps = [];
const errors = [];
const t0 = Date.now();
const step = async (name, fn) => {
  const started = Date.now();
  try { await fn(); steps.push({ name, ok: true, ms: Date.now() - started }); console.log(`✓ ${name} (${Date.now() - started} ms)`); }
  catch (error) {
    steps.push({ name, ok: false, error: String(error).slice(0, 400) });
    console.log(`✗ ${name}: ${String(error).slice(0, 300)}`);
    for (const [who, p] of [['owner', page], ['guest', typeof guest === 'undefined' ? null : guest]]) if (p) await p.screenshot({ path: `${out}/fail-${who}.png` }).catch(() => {});
    console.log('url', page.url());
    throw error;
  }
};
/** Focus an element and activate it with the keyboard. */
const press = async (locator, key = 'Enter') => { await locator.focus(); await locator.page().keyboard.press(key); };
const section = (name) => page.locator('summary').filter({ hasText: new RegExp(`^${name}`) });
const type = async (locator, text) => { await locator.focus(); await locator.page().keyboard.press('Control+A'); await locator.page().keyboard.type(text); };

const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await owner.newPage();
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => errors.push(`owner: ${e.message}`));
let shareUrl = '';
let projectUrl = '';
try {
  await step('sign in with an emailed magic link', async () => {
    await page.goto(`${base}/sign-in`);
    await type(page.getByLabel('Work email'), email);
    await press(page.getByRole('button', { name: 'Email me a sign-in link' }));
    await page.getByText('Check your inbox.').waitFor();
    let link = '';
    for (let i = 0; i < 30 && !link; i++) {
      const list = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
      const id = list.messages?.[0]?.ID;
      if (id) {
        const message = await (await fetch(`${mailpit}/api/v1/message/${id}`)).json();
        link = /(https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+)/.exec(message.HTML ?? message.Text ?? '')?.[1]?.replace(/&amp;/g, '&') ?? '';
      }
      if (!link) await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(link, 'magic link email arrived');
    await page.goto(link);
    await page.waitForURL(/\/app$/);
  });
  await step('create the company', async () => {
    await type(page.getByLabel('Company name'), 'Harbor Developments');
    await type(page.getByLabel(/Short name for links/), `harbor-${Date.now().toString(36)}`);
    await press(page.getByRole('button', { name: 'Create company' }));
    await page.getByRole('heading', { name: 'Your projects' }).waitFor();
  });
  await step('create a project', async () => {
    await type(page.getByLabel('Project name'), 'Harbor Point');
    await type(page.getByLabel('City', { exact: true }), 'Jersey City, NJ');
    await page.getByLabel('City style for the 3D context').focus();
    await page.getByLabel('City style for the 3D context').selectOption('new-york');
    await press(page.getByRole('button', { name: 'Create project' }));
    await page.waitForURL(/\/app\/projects\/[0-9a-f-]{36}$/);
    projectUrl = page.url();
    await page.locator('canvas').first().waitFor();
  });
  await step('edit details and save', async () => {
    await type(page.getByLabel('Architect'), 'Studio Meridian');
    await type(page.getByLabel('Summary'), 'Two residential towers on the Hudson waterfront.');
    await press(page.getByRole('button', { name: 'Save project' }));
    await page.getByText(/^Saved /).waitFor();
  });
  await step('set the real address', async () => {
    await press(page.locator('summary').filter({ hasText: /^Site and address/ }));
    await type(page.getByLabel('Street address and city'), address);
    await press(page.getByRole('button', { name: 'Find address' }));
    const result = page.locator('ul button').filter({ hasText: /Hudson/ }).first();
    await result.waitFor();
    await press(result);
    await press(page.getByRole('button', { name: 'Save project' }));
    await page.getByText(/^Saved /).waitFor();
    // Onboarding screenshot: the address step (/developers).
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${out}/step-1-address.png`, clip: { x: 0, y: 150, width: 1440, height: 850 }, timeout: 180000 });
  });
  await step('edit the massing (more residential floors, a second building) and save', async () => {
    await press(page.locator('summary').filter({ hasText: /^Massing/ }));
    const floors = page.getByLabel('Residential floors').first();
    await type(floors, '28');
    await press(page.getByRole('button', { name: 'Add a building' }));
    await page.getByRole('group', { name: 'Building 2' }).waitFor();
    await press(page.getByRole('button', { name: 'Save project' }));
    await page.getByText(/^Saved /).waitFor();
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${out}/editor.png` });
    await page.getByRole('group', { name: 'Building 2' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/step-2-massing.png`, timeout: 180000 });
  });
  await step('save a scenario to the database', async () => {
    await press(page.getByRole('button', { name: 'Saved scenarios' }));
    await type(page.getByLabel('Scenario name'), 'Lender base case');
    await press(page.getByRole('button', { name: 'Save', exact: true }));
    await page.getByText('Saved scenarios updated for your company.').waitFor();
    await page.getByText('Lender base case').waitFor();
    await page.keyboard.press('Escape');
  });
  await step('export the pro forma as PDF and Excel', async () => {
    for (const [label, ext] of [['Download pro forma as PDF', 'pdf'], ['Download pro forma and stacking plan as Excel', 'xlsx']]) {
      const download = page.waitForEvent('download');
      await press(page.getByRole('button', { name: label }));
      const file = await download;
      const path = `${out}/harbor-point.${ext}`;
      await file.saveAs(path);
      const head = (await fs.readFile(path)).subarray(0, 4).toString('latin1');
      assert.equal(head, ext === 'pdf' ? '%PDF' : 'PK\u0003\u0004', `${ext} file signature`);
    }
  });
  await step('create a share link without financials', async () => {
    await press(page.locator('summary').filter({ hasText: /^Share/ }));
    await type(page.getByLabel('Label (for you)'), 'Buyer preview');
    await press(page.getByRole('button', { name: 'Create share link' }));
    const field = page.getByLabel('New share link');
    await field.waitFor();
    shareUrl = await field.inputValue();
    assert.match(shareUrl, /\/s\/[A-Za-z0-9_-]{43}$/);
  });
} finally {
  await fs.writeFile(`${out}/owner-errors.json`, JSON.stringify(errors, null, 2));
}

// A private window: a fresh context with no cookies or storage.
var visitor = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
var guest = await visitor.newPage();
guest.setDefaultTimeout(120000);
guest.on('pageerror', (e) => errors.push(`guest: ${e.message}`));
try {
  await step('open the share link in a private window (no sign-in)', async () => {
    // One live 3D scene at a time on software-rendered CI machines.
    await page.goto('about:blank');
    const res = await guest.goto(shareUrl);
    assert.equal(res.status(), 200);
    await guest.getByRole('heading', { name: 'Harbor Point', level: 1 }).waitFor();
    await guest.locator('canvas').first().waitFor();
    assert.equal(await guest.getByRole('heading', { name: 'Development appraisal' }).count(), 0, 'pro forma hidden without financials');
    assert.ok(!(await guest.content()).includes('"finance"'), 'finance inputs are not sent to the browser');
    await guest.getByText('Studio Meridian').first().waitFor();
    await guest.waitForTimeout(10000);
    await guest.screenshot({ path: `${out}/share-private-window.png`, fullPage: false, timeout: 240000 });
  });
  await step('revoking the link blocks the private window on its next request', async () => {
    await guest.goto('about:blank');
    await page.goto(projectUrl);
    await press(page.locator('summary').filter({ hasText: /^Share/ }));
    await press(page.getByRole('button', { name: 'Revoke' }).first());
    await page.getByText('Buyer preview · Revoked').waitFor();
    const res = await guest.goto(shareUrl);
    assert.equal(res.status(), 404);
  });
} finally {
  const summary = { base, email, finishedAt: new Date().toISOString(), totalMs: Date.now() - t0, steps, pageErrors: errors, projectUrl, shareUrlShape: shareUrl.replace(/[A-Za-z0-9_-]{43}$/, '<43-char token>') };
  await fs.writeFile(`${out}/results.json`, JSON.stringify(summary, null, 2));
  await browser.close();
}
console.log(steps.every((s) => s.ok) ? 'PASS' : 'FAIL');
