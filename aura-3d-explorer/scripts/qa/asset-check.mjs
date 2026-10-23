// HEAD-requests every map tile, model and HDR under public/ against a running
// site and reports HTTP status and Cache-Control. Use it on a local build and
// on the deployed site:
//   QA_URL=https://saasy-mocha.vercel.app node scripts/qa/asset-check.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.QA_URL || 'http://127.0.0.1:3137').replace(/\/$/, '');
const output = process.env.QA_OUT || 'docs/qa/overnight/asset-check.json';
async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (/\.(json|glb|hdr|bin|png|jpg)$/i.test(entry.name) && !/attribution|manifest\.schema/i.test(entry.name)) out.push(full);
  }
  return out;
}
const files = [];
for (const root of ['public/maps', 'public/models', 'public/hdri']) files.push(...await walk(root));
const results = [];
let next = 0;
async function worker() {
  while (next < files.length) {
    const file = files[next++];
    const url = `${base}/${path.relative('public', file).split(path.sep).map(encodeURIComponent).join('/')}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      results.push({ path: url.slice(base.length), status: res.status, cacheControl: res.headers.get('cache-control'), bytes: Number(res.headers.get('content-length')) || null });
    } catch (error) {
      results.push({ path: url.slice(base.length), status: 0, error: String(error).slice(0, 120) });
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
results.sort((a, b) => a.path.localeCompare(b.path));
const bad = results.filter((r) => r.status !== 200);
const uncached = results.filter((r) => r.status === 200 && !/immutable/.test(r.cacheControl ?? ''));
const summary = { base, checked: results.length, ok: results.length - bad.length, failures: bad.length, notImmutable: uncached.length, statuses: Object.fromEntries([...new Set(results.map((r) => r.status))].map((s) => [s, results.filter((r) => r.status === s).length])), failuresSample: bad.slice(0, 20), results };
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ base, checked: summary.checked, ok: summary.ok, failures: summary.failures, notImmutable: summary.notImmutable, statuses: summary.statuses }));
if (bad.length || uncached.length) process.exitCode = 1;
