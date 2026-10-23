// Second end-to-end customer flow (keyboard-driven; file pickers via setInputFiles):
//   branding (logo + accent) → project at an address outside the bundled map
//   areas → load surroundings (OpenStreetMap; AURA_OVERPASS_URL may point at
//   scripts/qa/mock-overpass.mjs where the network blocks overpass-api.de) →
//   upload the customer's own model (STL) → reload: model and surroundings
//   persist → save a still to the gallery → password-protected share link with
//   financials → private window: wrong / right password, branded page,
//   appraisal visible, Excel export → another company cannot open the project.
//
//   QA_URL=http://127.0.0.1:3137 QA_MAILPIT=http://127.0.0.1:54324 node scripts/qa/customer-flow-2.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';

const base = process.env.QA_URL || 'http://127.0.0.1:3137';
const mailpit = process.env.QA_MAILPIT || 'http://127.0.0.1:54324';
const out = 'docs/qa/overnight/customer-flow-2';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const steps = [], errors = [];
let active = null;
const step = async (name, fn) => {
  const started = Date.now();
  try { await fn(); steps.push({ name, ok: true, ms: Date.now() - started }); console.log(`✓ ${name} (${Date.now() - started} ms)`); }
  catch (error) {
    steps.push({ name, ok: false, error: String(error).slice(0, 400) });
    console.log(`✗ ${name}: ${String(error).slice(0, 300)}`);
    if (active) await active.screenshot({ path: `${out}/fail.png`, timeout: 120000 }).catch(() => {});
    throw error;
  }
};
const press = async (l, key = 'Enter') => { await l.focus(); await l.page().keyboard.press(key); };
const type = async (l, text) => { await l.focus(); await l.page().keyboard.press('Control+A'); await l.page().keyboard.type(text); };
const section = (p, name) => p.locator('summary').filter({ hasText: new RegExp(`^${name}`) });

/** A tiny valid PNG (solid colour), for the logo upload. */
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** ASCII STL of a 20 × 20 × 60 m box (a simple tower), units in metres. */
function stl() {
  const v = (x, y, z) => `vertex ${x} ${y} ${z}`;
  const f = (a, b, c) => `facet normal 0 0 0\nouter loop\n${v(...a)}\n${v(...b)}\n${v(...c)}\nendloop\nendfacet`;
  const p = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0], [0, 0, 60], [20, 0, 60], [20, 20, 60], [0, 20, 60]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return `solid tower\n${faces.map(([a, b, c]) => f(p[a], p[b], p[c])).join('\n')}\nendsolid tower\n`;
}
async function signIn(page, email) {
  await page.goto(`${base}/sign-in`);
  await type(page.getByLabel('Work email'), email);
  await press(page.getByRole('button', { name: 'Email me a sign-in link' }));
  await page.getByText('Check your inbox.').waitFor();
  let link = '';
  for (let i = 0; i < 30 && !link; i++) {
    const list = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) link = /(https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+)/.exec((await (await fetch(`${mailpit}/api/v1/message/${id}`)).json()).HTML ?? '')?.[1]?.replace(/&amp;/g, '&') ?? '';
    if (!link) await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(link, 'magic link');
  await page.goto(link);
  await page.waitForURL(/\/app$/);
}

const stamp = Date.now().toString(36);
const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await owner.newPage(); active = page;
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => errors.push(`owner: ${e.message}`));
let projectUrl = '', shareUrl = '';
const orgSlug = `crest-${stamp}`;
await fs.writeFile(`${out}/logo.png`, png(240, 60, [24, 64, 96]));
await fs.writeFile(`${out}/tower.stl`, stl());

try {
  await step('sign in and create a branded company', async () => {
    await signIn(page, `owner+${stamp}@crest.example`);
    await type(page.getByLabel('Company name'), 'Crest Living');
    await type(page.getByLabel(/Short name for links/), orgSlug);
    await press(page.getByRole('button', { name: 'Create company' }));
    await page.getByRole('heading', { name: 'Your projects' }).waitFor();
    await press(page.getByRole('link', { name: 'Branding' }));
    await page.getByLabel('Upload logo').setInputFiles(`${out}/logo.png`);
    await page.locator('input[type=color]').evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '#1f6f5c'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await press(page.getByRole('button', { name: 'Save branding' }));
    await page.getByText('Branding saved.').waitFor();
    await page.getByRole('img', { name: /Crest Living logo/ }).waitFor();
  });
  await step('create a project at an address outside the bundled map areas', async () => {
    await page.goto(`${base}/app`);
    await type(page.getByLabel('Project name'), 'Capitol Terraces');
    await type(page.getByLabel('City', { exact: true }), 'Boise, ID');
    await press(page.getByRole('button', { name: 'Create project' }));
    await page.waitForURL(/\/app\/projects\/[0-9a-f-]{36}$/);
    projectUrl = page.url();
    await press(section(page, 'Site and address'));
    await type(page.getByLabel('Street address and city'), 'Boise City Hall, Boise');
    await press(page.getByRole('button', { name: 'Find address' }));
    const result = page.locator('ul button').filter({ hasText: /Boise/ }).first();
    await result.waitFor();
    await press(result);
    await press(page.getByRole('button', { name: 'Save project' }));
    await page.getByText(/^Saved /).waitFor();
  });
  await step('load the surroundings from OpenStreetMap and keep them with the project', async () => {
    await press(page.getByRole('button', { name: /Load surroundings from OpenStreetMap/ }));
    await page.getByText(/^Loaded [\d,]+ mapped buildings/).waitFor();
  });
  await step('upload the customer model (STL) through the import review', async () => {
    await press(section(page, 'Model and images'));
    await press(page.getByRole('button', { name: 'Upload a model' }));
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type=file]').setInputFiles(`${out}/tower.stl`);
    const confirm = dialog.getByRole('checkbox').first();
    await confirm.waitFor();
    await confirm.check();
    const place = dialog.getByRole('button', { name: 'Place reviewed model' });
    await place.waitFor();
    if (await place.isDisabled()) {
      // The review needs a site location confirmation when none was passed in.
      await dialog.getByRole('checkbox').last().check().catch(() => {});
    }
    await press(place);
    await page.getByText(/tower\.stl uploaded\. Save the project/).waitFor();
    await press(page.getByRole('button', { name: 'Save project' }));
    await page.getByText(/^Saved /).waitFor();
  });
  await step('reload: model and surroundings persist', async () => {
    await page.reload();
    await press(section(page, 'Model and images'));
    await page.getByText('Kept with this project: tower.stl').waitFor();
    await press(section(page, 'Site and address'));
    await page.getByText(/^Surroundings: [\d,]+ features/).waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('Loading your model'), null, { timeout: 120000 });
    assert.ok(!(await page.getByText('Your saved model could not be loaded').count()), 'stored model rebuilt');
  });
  await step('save a 2× still to the gallery and use it as a project image', async () => {
    await page.waitForTimeout(8000);
    await press(page.getByRole('button', { name: 'Save still to gallery' }));
    await page.getByText(/^Still saved to the gallery \(\d+ × \d+\)\./).waitFor();
    await press(page.getByRole('button', { name: 'Use as project image' }).first());
    await press(page.getByRole('button', { name: 'Save project' }));
    await page.getByText(/^Saved /).waitFor();
  });
  await step('create a password-protected link that shares financials', async () => {
    await press(section(page, 'Share'));
    await type(page.getByLabel('Label (for you)'), 'Lender pack');
    await type(page.getByLabel('Expires after (days, optional)'), '7');
    await type(page.getByLabel('Password (optional)'), 'capitol-2029');
    await page.getByLabel('Share financials (pro forma)').focus();
    await page.keyboard.press('Space');
    await press(page.getByRole('button', { name: 'Create share link' }));
    shareUrl = await page.getByLabel('New share link').inputValue();
    await page.screenshot({ path: `${out}/editor.png`, timeout: 180000 });
    await page.goto('about:blank');
  });

  const visitor = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const guest = await visitor.newPage(); active = guest;
  guest.setDefaultTimeout(180000);
  guest.on('pageerror', (e) => errors.push(`guest: ${e.message}`));
  await step('private window: password gate, branded page, appraisal and Excel export', async () => {
    await guest.goto(shareUrl);
    await type(guest.getByLabel('Password'), 'wrong-password');
    await press(guest.getByRole('button', { name: 'Open presentation' }));
    await guest.getByText('That password is not right.').waitFor();
    await type(guest.getByLabel('Password'), 'capitol-2029');
    await press(guest.getByRole('button', { name: 'Open presentation' }));
    await guest.getByRole('heading', { name: 'Capitol Terraces', level: 1 }).waitFor();
    assert.equal(await guest.locator('h1').count(), 1, 'one h1');
    await guest.getByRole('img', { name: 'Crest Living' }).waitFor();
    assert.equal(await guest.getByRole('link', { name: 'Enquire' }).evaluate((a) => getComputedStyle(a).backgroundColor), 'rgb(31, 111, 92)');
    await guest.locator('h2#appraisal').waitFor();
    await guest.getByText('Powered by AURA').waitFor();
    const download = guest.waitForEvent('download');
    await press(guest.getByRole('button', { name: 'Download pro forma and stacking plan as Excel' }));
    const file = await download;
    await file.saveAs(`${out}/shared.xlsx`);
    assert.equal((await fs.readFile(`${out}/shared.xlsx`)).subarray(0, 2).toString('latin1'), 'PK');
    await guest.waitForTimeout(8000);
    await guest.screenshot({ path: `${out}/share-branded.png`, timeout: 180000 });
    await guest.goto('about:blank');
  });
  await step('another company cannot open the project or its branded page', async () => {
    const rival = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const other = await rival.newPage();
    other.setDefaultTimeout(120000);
    await signIn(other, `rival+${stamp}@other.example`);
    await type(other.getByLabel('Company name'), 'Rival Group');
    await press(other.getByRole('button', { name: 'Create company' }));
    await other.getByRole('heading', { name: 'Your projects' }).waitFor();
    assert.equal((await other.goto(projectUrl)).status(), 404);
    assert.equal((await other.goto(`${base}/o/${orgSlug}/projects/${projectUrl.split('/').pop()}`)).status(), 404);
    assert.equal(await other.goto(`${base}/app`).then(() => other.getByText('Capitol Terraces').count()), 0);
    await rival.close();
  });
} finally {
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ base, finishedAt: new Date().toISOString(), steps, pageErrors: errors, overpass: process.env.AURA_OVERPASS_URL ?? 'see server env' }, null, 2));
  await browser.close();
}
console.log(steps.every((s) => s.ok) ? 'PASS' : 'FAIL');
