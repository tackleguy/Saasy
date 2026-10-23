/**
 * Downloadable pro forma (XLSX + PDF): every exported figure is the finance.ts
 * figure the sidebar and print report show. Files are opened back up (exceljs
 * for the workbook; a small ToUnicode decoder for the uncompressed PDF) and
 * compared to computeYield / computeSite to the cent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import ExcelJS from "exceljs";
import { PROJECTS, projectSite, type Project } from "../../src/content/projects";
import { computeSite, computeYield } from "../../src/lib/finance";
import { fmtMoney } from "../../src/lib/format";
import { buildUnits } from "../../src/components/project/StackingPlan";
import { buildExportModel, type ExportModel } from "../../src/lib/exports/model";
import { buildProformaWorkbook, SUMMARY_COLUMNS } from "../../src/lib/exports/xlsx";
import { buildProformaPdf } from "../../src/lib/exports/pdf";
import { resetRateLimits } from "../../src/lib/apiGuard";
import type { BuildingId, YieldInputs, YieldMetrics } from "../../src/types";

const project = PROJECTS.find((p) => p.slug === "meridian-tower")!;
const buildings = projectSite(project);
const defaults = Object.fromEntries(buildings.map((b) => [b.id, project.finance[b.id]])) as Record<BuildingId, YieldInputs>;
const metricsFor = (inputs: Record<BuildingId, YieldInputs>) =>
  Object.fromEntries(buildings.map((b) => [b.id, computeYield(inputs[b.id], b.floors)])) as Record<BuildingId, YieldMetrics>;
const cents = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.005, `${what}: ${a} ≠ ${b}`);

/* ---------------------------------------------------------------- readers */

async function openWorkbook(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}
const num = (v: ExcelJS.CellValue): number => {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v && typeof v.result === "number") return v.result;
  throw new Error(`not a number: ${JSON.stringify(v)}`);
};
function findRow(ws: ExcelJS.Worksheet, firstCell: string): number {
  for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === firstCell) return r;
  throw new Error(`no row "${firstCell}" in ${ws.name}`);
}
function summaryRow(ws: ExcelJS.Worksheet, label: string) {
  const r = findRow(ws, label);
  return (col: (typeof SUMMARY_COLUMNS)[number]) => ws.getCell(r, SUMMARY_COLUMNS.indexOf(col) + 1).value;
}

/** Text drawn in an uncompressed pdfkit PDF, decoded through each font's ToUnicode CMap. */
function pdfText(buf: Buffer): string {
  const src = buf.toString("latin1");
  const objs = new Map<string, string>();
  for (const m of src.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objs.set(m[1], m[2]);
  const cmaps = new Map<string, Map<number, string> | null>();
  for (const m of src.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const font = objs.get(m[2]) ?? "";
    const tu = /\/ToUnicode (\d+) 0 R/.exec(font);
    if (!tu) { cmaps.set(m[1], null); continue; }
    const map = new Map<number, string>();
    const body = objs.get(tu[1]) ?? "";
    const hex = (h: string) => String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((x) => parseInt(x, 16)));
    for (const r of body.matchAll(/<([0-9a-f]+)> <([0-9a-f]+)> \[([^\]]*)\]/gi)) {
      const start = parseInt(r[1], 16);
      [...r[3].matchAll(/<([0-9a-f ]+)>/gi)].forEach((d, i) => map.set(start + i, hex(d[1].replace(/ /g, ""))));
    }
    for (const block of body.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const c of block[1].matchAll(/<([0-9a-f]+)> <([0-9a-f]+)>/gi)) map.set(parseInt(c[1], 16), hex(c[2]));
    cmaps.set(m[1], map);
  }
  let font: Map<number, string> | null = null;
  const out: string[] = [];
  for (const tok of src.matchAll(/\/(F\d+) [\d.]+ Tf|\[([^[\]]*)\] TJ/gi)) {
    if (tok[1]) { font = cmaps.get(tok[1]) ?? null; continue; }
    const line = [...tok[2].matchAll(/<([0-9a-f]*)>/gi)].map((h) => {
      const codes = font ? (h[1].match(/.{4}/g) ?? []).map((x) => font!.get(parseInt(x, 16)) ?? "?") : (h[1].match(/.{2}/g) ?? []).map((x) => String.fromCharCode(parseInt(x, 16)));
      return codes.join("");
    }).join("");
    out.push(line);
  }
  return out.join("\n");
}

/** A valid 2×2 RGBA PNG. */
function tinyPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.from([0, 156, 122, 82, 255, 156, 122, 82, 255, 0, 156, 122, 82, 255, 156, 122, 82, 255]);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const fixedDate = new Date("2026-10-23T09:00:00Z");
const baseModel = buildExportModel({ project, generatedAt: fixedDate });

/* ------------------------------------------------------------------ tests */

test("model: same buildings, inputs and stacking units as the Studio", () => {
  assert.deepEqual(baseModel.buildings.map((b) => b.id), buildings.map((b) => b.id));
  const metrics = metricsFor(defaults);
  for (const b of buildings) {
    const eb = baseModel.buildings.find((x) => x.id === b.id)!;
    assert.equal(eb.usedDefaults, true);
    // Server-safe copy of StackingPlan.buildUnits must match it unit for unit.
    const plan = [...new Map(buildUnits(project.slug, project.status, b, metrics[b.id]).flat().map((u) => [u.code, u])).values()];
    const key = (u: { code: string; sqFt: number; price: number; status: string; zone: string; floorNumber: number }) => `${u.code}|${u.zone}|${u.floorNumber}|${u.status}|${u.sqFt}|${u.price}`;
    assert.deepEqual(eb.units.map(key).sort(), plan.map(key).sort(), `${b.id} units differ from the stacking plan`);
  }
  assert.equal(baseModel.branding.orgName, "AURA");
  assert.equal(baseModel.branding.accent, "#9C7A52");
});

test("xlsx: Summary, Stacking plan and Cash flow reconcile with computeYield / computeSite", async () => {
  const metrics = metricsFor(defaults);
  const site = computeSite(buildings.map((b) => metrics[b.id]));
  const wb = await openWorkbook(await buildProformaWorkbook(baseModel));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Summary", "Assumptions", "Stacking plan", "Cash flow"]);

  const sum = wb.getWorksheet("Summary")!;
  assert.equal(sum.getCell("A1").value, project.name);
  assert.match(String(sum.getCell("A3").value), /Illustrative figures only/);
  for (const b of buildings) {
    const m = metrics[b.id], row = summaryRow(sum, b.name);
    cents(num(row("GDV")), m.gdv, `${b.id} GDV`);
    cents(num(row("TDC")), m.totalDevelopmentCost, `${b.id} TDC`);
    cents(num(row("Profit")), m.profit, `${b.id} profit`);
    assert.equal(num(row("Units")), m.totalUnits);
    if (m.irrPct === null) assert.equal(row("Equity IRR"), null);
    else assert.ok(Math.abs(num(row("Equity IRR")) - m.irrPct / 100) < 1e-12);
  }
  const total = summaryRow(sum, "Site total");
  cents(num(total("GDV")), site.gdv, "site GDV");
  cents(num(total("TDC")), site.totalDevelopmentCost, "site TDC");
  cents(num(total("Profit")), site.profit, "site profit");
  assert.equal(num(total("Units")), site.totalUnits);
  assert.equal(num(total("Sq ft")), site.totalSqFt);
  assert.equal(typeof sum.getCell(findRow(sum, "Site total"), 2).numFmt, "string");

  const sp = wb.getWorksheet("Stacking plan")!;
  for (const b of buildings) {
    const m = metrics[b.id];
    const r = findRow(sp, `Total — ${b.name}`);
    cents(num(sp.getCell(r, 6).value), m.gdv, `${b.id} stacking price total`);
    const saleable = m.floors.filter((f) => f.revenue > 0).reduce((s, f) => s + f.sqFt, 0);
    assert.ok(Math.abs(num(sp.getCell(r, 5).value) - saleable) < 1e-6, `${b.id} stacking sq ft total`);
    // and the unit rows themselves add up (not just the cached formula result)
    let price = 0, rows = 0;
    for (let i = 1; i < r; i++) if (sp.getCell(i, 1).value === b.name) { price += num(sp.getCell(i, 6).value); rows++; }
    cents(price, m.gdv, `${b.id} stacking rows`);
    assert.equal(rows, baseModel.buildings.find((x) => x.id === b.id)!.units.length);
  }

  const cf = wb.getWorksheet("Cash flow")!;
  const head = findRow(cf, "Month");
  let months = 0;
  while (typeof cf.getCell(head + 1 + months, 1).value === "number") months++;
  assert.equal(months, Math.max(...buildings.map((b) => metrics[b.id].durationMonths)) + 1);
  buildings.forEach((b, bi) => {
    const m = metrics[b.id], i = defaults[b.id], spendCol = 2 + bi * 6;
    assert.ok(m.durationMonths >= Math.round(i.termMonths) + 1, "horizon covers the build term");
    let filled = 0, spend = 0;
    for (let k = 0; k < months; k++) {
      const v = cf.getCell(head + 1 + k, spendCol).value;
      if (v !== null) { filled++; spend += num(v); }
    }
    assert.equal(filled, m.cashflow.length);
    cents(num(cf.getCell(head + 1, spendCol).value), m.landCost, `${b.id} month 0 = land`);
    cents(spend, m.landCost + m.hardCost + m.softCost + m.contingency, `${b.id} total spend`);
    cents(num(cf.getCell(head + m.cashflow.length, spendCol + 5).value), m.cashflow.at(-1)!.equityPosition, `${b.id} final equity position`);
  });
});

test("xlsx: an on-screen override (+10% residential price) moves GDV exactly as computeYield does", async () => {
  const override = Object.fromEntries(buildings.map((b) => {
    const d = defaults[b.id];
    return [b.id, { ...d, pricePerSqFt: { ...d.pricePerSqFt, residential: d.pricePerSqFt.residential * 1.1 } }];
  })) as Record<BuildingId, YieldInputs>;
  const metrics = metricsFor(override);
  const model = buildExportModel({ project, inputsById: { ...override, [buildings[0].id]: { ...override[buildings[0].id], ltcPct: 400 } } });
  // The invalid first override falls back to the project default; the rest are honoured.
  assert.equal(model.buildings[0].usedDefaults, true);
  const wb = await openWorkbook(await buildProformaWorkbook(model));
  const sum = wb.getWorksheet("Summary")!;
  const base = metricsFor(defaults);
  for (const b of buildings.slice(1)) {
    const g = num(summaryRow(sum, b.name)("GDV"));
    cents(g, metrics[b.id].gdv, `${b.id} overridden GDV`);
    assert.ok(g > base[b.id].gdv, "residential +10% raises GDV");
  }
  cents(num(summaryRow(sum, buildings[0].name)("GDV")), base[buildings[0].id].gdv, "invalid override falls back");
  const site = computeSite(buildings.map((b, i) => (i === 0 ? base[b.id] : metrics[b.id])));
  cents(num(summaryRow(sum, "Site total")("GDV")), site.gdv, "site GDV with overrides");
});

test("pdf: valid A4 document, ≥ 2 pages, carries the site figures and report strings", async () => {
  const buf = await buildProformaPdf(baseModel, { compress: false });
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.match(buf.subarray(-32).toString("latin1"), /%%EOF\s*$/);
  const pages = (buf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
  assert.ok(pages >= 2, `pages = ${pages}`);
  const text = pdfText(buf);
  const s = baseModel.site;
  for (const figure of [fmtMoney(s.gdv), fmtMoney(s.profit), fmtMoney(s.totalDevelopmentCost)]) assert.ok(text.includes(figure), `PDF missing ${figure}`);
  for (const b of baseModel.buildings) for (const row of b.appraisal) assert.ok(text.includes(row.display), `PDF missing ${b.name} ${row.label}: ${row.display}`);
  assert.ok(text.includes(project.name));
  assert.ok(text.includes("Prepared with AURA · illustrative figures only"));
  assert.ok(text.includes(`Page ${pages} of ${pages}`));
  // A real (non-sample) project drops the "illustrative" wording; a logo is accepted.
  const png = tinyPng();
  const real = await buildProformaPdf(buildExportModel({ project: { ...project, placeholder: false }, branding: { orgName: "Acme Dev", logo: png, accent: "#123456" } }), { compress: false });
  const realText = pdfText(real);
  assert.ok(!/illustrative/i.test(realText), "real project PDF must not say illustrative");
  assert.ok(realText.includes("Prepared with AURA"));
  assert.ok(realText.includes("ACME DEV"));
  assert.ok(real.toString("latin1").includes("/Subtype /Image"), "logo embedded");
  // A corrupt PNG or an SVG is skipped, never fatal.
  const broken = Buffer.from(png);
  broken[broken.indexOf("IDAT") + 6] ^= 0xff;
  for (const logo of [broken, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")]) {
    const out = await buildProformaPdf(buildExportModel({ project, branding: { logo } }), { compress: false });
    assert.ok(!out.toString("latin1").includes("/Subtype /Image"));
  }
});

test("zero units sold (no absorption, no presales): both files stay finite", async () => {
  const zero = (i: YieldInputs) => ({ ...i, absorptionUnitsPerMonth: 0, presalePct: 0 }) as YieldInputs;
  // Saved scenarios reject absorption < 0.1, so a screen override of 0 falls back…
  const rejected = buildExportModel({ project, inputsById: { [buildings[0].id]: zero(defaults[buildings[0].id]) } });
  assert.equal(rejected.buildings[0].usedDefaults, true);
  // …but a database project may carry it as its defaults.
  const edge: Project = { ...project, finance: Object.fromEntries(Object.entries(project.finance).map(([k, v]) => [k, zero(v)])) };
  const model: ExportModel = buildExportModel({ project: edge });
  for (const b of model.buildings) {
    const m = computeYield(edge.finance[b.id], buildings.find((x) => x.id === b.id)!.floors);
    cents(b.metrics.gdv, m.gdv, `${b.id} GDV`);
    cents(b.metrics.profit, m.profit, `${b.id} profit`);
    for (const [k, v] of Object.entries(b.metrics)) if (typeof v === "number") assert.ok(Number.isFinite(v), `${b.id}.${k} = ${v}`);
  }
  const wb = await openWorkbook(await buildProformaWorkbook(model));
  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => {
    const v = c.value;
    if (typeof v === "number") assert.ok(Number.isFinite(v), `${ws.name}!${c.address} = ${v}`);
    else if (v && typeof v === "object" && "result" in v) assert.ok(Number.isFinite(Number(v.result)), `${ws.name}!${c.address}`);
    else assert.ok(!/NaN|Infinity|undefined/.test(String(v)), `${ws.name}!${c.address} = ${v}`);
  }));
  const pdf = await buildProformaPdf(model, { compress: false });
  const text = pdfText(pdf);
  assert.ok(!/NaN|Infinity|undefined/.test(text), "PDF prints an invalid number");
  assert.ok(text.includes(fmtMoney(model.site.profit)));
});

test("route: 404 unknown slug, 403 cross-site, 200 xlsx for a same-origin request", async () => {
  resetRateLimits();
  const { POST } = await import("../../src/app/api/exports/proforma/route");
  const req = (body: unknown, origin = "https://aura.example") => new Request("https://aura.example/api/exports/proforma", {
    method: "POST", headers: { "content-type": "application/json", host: "aura.example", origin }, body: JSON.stringify(body),
  });
  assert.equal((await POST(req({ projectSlug: "no-such-project", format: "xlsx" }))).status, 404);
  assert.equal((await POST(req({ projectSlug: "meridian-tower", format: "xlsx" }, "https://evil.example"))).status, 403);
  assert.equal((await POST(req({ projectSlug: "meridian-tower", format: "docx" }))).status, 400);
  const res = await POST(req({ projectSlug: "meridian-tower", format: "xlsx", inputsById: defaults }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="meridian-tower-pro-forma.xlsx"');
  assert.equal(res.headers.get("cache-control"), "no-store");
  const wb = await openWorkbook(Buffer.from(await res.arrayBuffer()));
  cents(num(summaryRow(wb.getWorksheet("Summary")!, "Site total")("GDV")), baseModel.site.gdv, "route site GDV");
  const pdf = await POST(req({ projectSlug: "meridian-tower", format: "pdf" }));
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString("latin1"), "%PDF-");
});
