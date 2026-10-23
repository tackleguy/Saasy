/**
 * exports/xlsx — the pro forma as an Excel workbook (exceljs).
 * Sheets: Summary · Assumptions · Stacking plan · Cash flow. Every figure is
 * read from the export model (no maths here); amounts are stored as numbers
 * with number formats, never as pre-formatted strings.
 */
import ExcelJS from "exceljs";
import { brandTextOnWhite } from "@/lib/brandColor";
import type { ExportModel } from "./model";
import { footerNote, generatedDate } from "./model";

const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const MONEY0 = '"$"#,##0;[Red]-"$"#,##0';
const INT = "#,##0";
const PCT = "0.0%";
const FONT = "Inter";

type Cells = ExcelJS.Worksheet;

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

/** Project name, place, generated date and the illustrative note. Returns the next free row. */
function header(ws: Cells, model: ExportModel, title: string): number {
  const p = model.project;
  ws.getCell("A1").value = p.name;
  ws.getCell("A1").font = { name: FONT, size: 16, bold: true };
  ws.getCell("A2").value = `${title} · ${p.city} · ${p.status} · generated ${generatedDate(model)}`;
  ws.getCell("A2").font = { name: FONT, size: 10, color: { argb: "FF666666" } };
  let row = 3;
  if (p.placeholder) {
    ws.getCell(`A${row}`).value = "Illustrative figures only — sample project. Not investment, valuation or financial advice.";
    ws.getCell(`A${row}`).font = { name: FONT, size: 10, italic: true, color: { argb: argb(brandTextOnWhite(model.branding.accent)) } };
    row++;
  }
  return row + 1;
}

function headRow(ws: Cells, rowNo: number, labels: string[], accent: string) {
  const row = ws.getRow(rowNo);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { name: FONT, bold: true, size: 10 };
    c.alignment = { horizontal: i === 0 ? "left" : "right", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: argb(accent) } } };
  });
}

function setRow(ws: Cells, rowNo: number, values: (ExcelJS.CellValue | undefined)[], formats: (string | undefined)[], bold = false) {
  const row = ws.getRow(rowNo);
  values.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v === undefined ? null : v;
    c.font = { name: FONT, size: 10, bold };
    if (formats[i]) c.numFmt = formats[i]!;
  });
  return row;
}

export const SUMMARY_COLUMNS = ["Building", "GDV", "TDC", "Profit", "Profit on cost", "Margin on GDV", "Equity required", "Peak debt", "Equity IRR", "Residual land value", "Units", "Sq ft", "Saleable sq ft"] as const;

export async function buildProformaWorkbook(model: ExportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = model.branding.orgName;
  wb.title = `${model.project.name} — pro forma`;
  wb.created = new Date(model.generatedAt);
  const accent = model.branding.accent;

  /* ------------------------------------------------------------ Summary */
  const sum = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  let r = header(sum, model, "Pro forma");
  headRow(sum, r, [...SUMMARY_COLUMNS], accent);
  const fmts = [undefined, MONEY, MONEY, MONEY, PCT, PCT, MONEY, MONEY, PCT, MONEY, INT, INT, INT];
  for (const b of model.buildings) {
    const m = b.metrics;
    setRow(sum, ++r, [
      b.name, m.gdv, m.totalDevelopmentCost, m.profit, m.profitOnCostPct / 100, m.marginOnGdvPct / 100, m.equityRequired, m.peakDebt,
      m.irrPct === null ? null : m.irrPct / 100, m.residualLandValue, m.totalUnits, m.totalSqFt, m.saleableSqFt,
    ], fmts);
  }
  const s = model.site;
  const siteRow = setRow(sum, ++r, [
    "Site total", s.gdv, s.totalDevelopmentCost, s.profit, s.profitOnCostPct / 100, s.marginOnGdvPct / 100, s.equityRequired, null, null, null, s.totalUnits, s.totalSqFt,
    model.buildings.reduce((t, b) => t + b.metrics.saleableSqFt, 0),
  ], fmts, true);
  siteRow.eachCell({ includeEmpty: true }, (c) => (c.border = { top: { style: "thin" } }));
  r += 2;
  sum.getCell(`A${r}`).value = `${model.siteLine}. Peak debt, IRR and residual land value are per building (blank IRR: equity flows never turn positive).`;
  sum.getCell(`A${r}`).font = { name: FONT, size: 9, color: { argb: "FF666666" } };
  sum.getCell(`A${r + 1}`).value = footerNote(model);
  sum.getCell(`A${r + 1}`).font = { name: FONT, size: 9, color: { argb: "FF666666" } };
  sum.getColumn(1).width = 30;
  for (let i = 2; i <= SUMMARY_COLUMNS.length; i++) sum.getColumn(i).width = i >= 11 ? 12 : i === 5 || i === 6 || i === 9 ? 11 : 19;

  /* -------------------------------------------------------- Assumptions */
  const as = wb.addWorksheet("Assumptions", { views: [{ showGridLines: false }] });
  r = header(as, model, "Assumptions");
  for (const b of model.buildings) {
    as.getCell(`A${r}`).value = b.name;
    as.getCell(`A${r}`).font = { name: FONT, size: 12, bold: true, color: { argb: argb(accent) } };
    if (b.usedDefaults && model.buildings.some((x) => !x.usedDefaults)) {
      as.getCell(`B${r}`).value = "Project defaults";
      as.getCell(`B${r}`).font = { name: FONT, size: 9, color: { argb: "FF666666" } };
    }
    r++;
    for (const row of b.appraisal) {
      setRow(as, r, [row.label, row.display], []);
      as.getCell(`B${r}`).alignment = { horizontal: "right" };
      as.getCell(`A${r}`).border = as.getCell(`B${r}`).border = { bottom: { style: "hair", color: { argb: "FFCCCCCC" } } };
      r++;
    }
    r++;
  }
  as.getColumn(1).width = 36;
  as.getColumn(2).width = 58;

  /* ------------------------------------------------------ Stacking plan */
  const sp = wb.addWorksheet("Stacking plan");
  r = header(sp, model, "Stacking plan (sample availability)");
  const spCols = ["Building", "Floor", "Unit", "Zone", "Sq ft", "Guide price", "Status"];
  headRow(sp, r, spCols, accent);
  sp.views = [{ state: "frozen", ySplit: r, showGridLines: false }];
  const spFmt = [undefined, undefined, undefined, undefined, INT, MONEY0, undefined];
  const totalRows: number[] = [];
  for (const b of model.buildings) {
    const first = r + 1;
    for (const u of b.units) setRow(sp, ++r, [b.name, u.floorLabel, u.code, u.zoneLabel, u.sqFt, u.price, u.status], spFmt);
    const last = r;
    const t = b.unitTotals.Total;
    const tr = setRow(sp, ++r, [
      `Total — ${b.name}`, null, `${t.count} units`, null,
      { formula: `SUM(E${first}:E${last})`, result: t.sqFt }, { formula: `SUM(F${first}:F${last})`, result: t.price },
      `${b.unitTotals.Available.count} avail · ${b.unitTotals.Reserved.count} res · ${b.unitTotals.Sold.count} sold`,
    ], spFmt, true);
    tr.eachCell({ includeEmpty: true }, (c) => (c.border = { top: { style: "thin" } }));
    totalRows.push(r);
    r++;
  }
  if (model.buildings.length > 1) {
    const all = model.buildings.reduce((a, b) => ({ count: a.count + b.unitTotals.Total.count, sqFt: a.sqFt + b.unitTotals.Total.sqFt, price: a.price + b.unitTotals.Total.price }), { count: 0, sqFt: 0, price: 0 });
    setRow(sp, ++r, [
      "Site total", null, `${all.count} units`, null,
      { formula: totalRows.map((t) => `E${t}`).join("+"), result: all.sqFt }, { formula: totalRows.map((t) => `F${t}`).join("+"), result: all.price }, null,
    ], spFmt, true);
  }
  [26, 12, 11, 13, 11, 18, 30].forEach((w, i) => (sp.getColumn(i + 1).width = w));

  /* ---------------------------------------------------------- Cash flow */
  const cf = wb.addWorksheet("Cash flow", { views: [{ showGridLines: false }] });
  r = header(cf, model, "Monthly cash flow");
  const fields = [
    ["spend", "Spend"], ["receipts", "Net receipts"], ["equityIn", "Equity in"], ["equityOut", "Equity out"], ["debt", "Debt balance"], ["equityPosition", "Equity position"],
  ] as const;
  const groupRow = r, headRowNo = r + 1;
  cf.getCell(groupRow, 1).value = null;
  model.buildings.forEach((b, bi) => {
    const c0 = 2 + bi * fields.length;
    cf.mergeCells(groupRow, c0, groupRow, c0 + fields.length - 1);
    const g = cf.getCell(groupRow, c0);
    g.value = b.name;
    g.font = { name: FONT, bold: true, size: 10, color: { argb: argb(accent) } };
    g.alignment = { horizontal: "center" };
  });
  headRow(cf, headRowNo, ["Month", ...model.buildings.flatMap(() => fields.map(([, l]) => l))], accent);
  cf.views = [{ state: "frozen", xSplit: 1, ySplit: headRowNo, showGridLines: false }];
  const months = Math.max(0, ...model.buildings.map((b) => b.cashflow.length));
  for (let mth = 0; mth < months; mth++) {
    const values: (number | null)[] = [mth];
    const formats: (string | undefined)[] = ["0"];
    for (const b of model.buildings) {
      const row = b.cashflow[mth];
      for (const [k] of fields) {
        values.push(row ? row[k] : null);
        formats.push(MONEY0);
      }
    }
    setRow(cf, headRowNo + 1 + mth, values, formats);
  }
  cf.getColumn(1).width = 8;
  for (let i = 2; i <= 1 + model.buildings.length * fields.length; i++) cf.getColumn(i).width = 16;
  cf.getCell(headRowNo + months + 2, 1).value = "Month 0 is land. Receipts are net of commission and the AURA fee; equity position is cumulative distributions less contributions.";
  cf.getCell(headRowNo + months + 2, 1).font = { name: FONT, size: 9, color: { argb: "FF666666" } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
