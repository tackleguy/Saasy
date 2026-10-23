/**
 * exports/pdf — the pro forma as an A4 PDF (pdfkit).
 * Page 1: title, logo, site summary, then one appraisal table per building
 * (the print report's rows and strings, verbatim); then a stacking-plan
 * summary per building. Every page carries the AURA footer and page number.
 *
 * Fonts: Instrument Serif (headings) and a sans for the tables, loaded from
 * node_modules if they embed cleanly, otherwise Times / Helvetica. Inter ships
 * only as a variable WOFF2 that pdfkit's subsetter cannot embed, so the sans is
 * normally Geist (bundled with Next for OG images). A font is probed once by
 * rendering a test document; a failure falls back silently, never throws.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import PDFDocument from "pdfkit";
import { brandTextOnWhite } from "@/lib/brandColor";
import { fmtMoney, fmtNum } from "@/lib/format";
import type { ExportModel, ExportUnitStatus } from "./model";
import { footerNote, generatedDate } from "./model";

export interface PdfOptions {
  /** Deflate content streams (default true). Tests pass false so text can be read back. */
  compress?: boolean;
}

/* -------------------------------------------------------------------- fonts */

const SANS_CANDIDATES = [
  "node_modules/@fontsource-variable/inter/files/inter-latin-standard-normal.woff2",
  "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
];
const SERIF_CANDIDATES = [
  "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff",
  "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
];
/** Characters every figure and label needs (fmtMoney's minus sign, separators, ×). */
const GLYPH_PROBE = "The Meridian −$1,234,567.89 · — × % 0123456789 /sf";

interface FontSet {
  sans: Buffer | null;
  serif: Buffer | null;
}
let fontCache: FontSet | null = null;

function probe(bytes: Buffer): boolean {
  try {
    const doc = new PDFDocument({ compress: false, autoFirstPage: true });
    doc.on("data", () => {});
    doc.font(bytes);
    const font = (doc as unknown as { _font?: { font?: { hasGlyphForCodePoint?: (c: number) => boolean } } })._font?.font;
    if (font?.hasGlyphForCodePoint && ![...GLYPH_PROBE].every((ch) => font.hasGlyphForCodePoint!(ch.codePointAt(0)!))) return false;
    doc.text(GLYPH_PROBE);
    doc.end(); // subsetting happens here; a font pdfkit cannot embed throws now, not later.
    return true;
  } catch {
    return false;
  }
}

function firstWorking(candidates: string[]): Buffer | null {
  for (const rel of candidates) {
    try {
      const bytes = fs.readFileSync(path.join(process.cwd(), rel));
      if (probe(bytes)) return bytes;
    } catch {
      /* missing file: try the next */
    }
  }
  return null;
}

function fonts(): FontSet {
  return (fontCache ??= { sans: firstWorking(SANS_CANDIDATES), serif: firstWorking(SERIF_CANDIDATES) });
}

/* ------------------------------------------------------------------- layout */

const A4: [number, number] = [595.28, 841.89];
const M = 48; // page margin
const W = A4[0] - M * 2;
const FOOTER_Y = A4[1] - 30;
const BOTTOM = A4[1] - M - 10;
const INK = "#1b1b1b";
const ASH = "#6b6b6b";
const RULE = "#d4d0c8";

const isPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/**
 * pdfkit inflates PNG pixel data asynchronously, so a corrupt PNG would throw
 * an uncaught zlib error after `doc.image` returns. Check the image data
 * inflates (and IHDR is sane) before handing it over.
 */
function pngDecodes(b: Buffer): boolean {
  try {
    let off = 8;
    let ihdr = false;
    const idat: Buffer[] = [];
    while (off + 8 <= b.length) {
      const len = b.readUInt32BE(off);
      const type = b.toString("latin1", off + 4, off + 8);
      if (off + 12 + len > b.length) return false;
      const data = b.subarray(off + 8, off + 8 + len);
      if (type === "IHDR") ihdr = len === 13 && data.readUInt32BE(0) > 0 && data.readUInt32BE(4) > 0 && data.readUInt32BE(0) <= 10_000 && data.readUInt32BE(4) <= 10_000;
      else if (type === "IDAT") idat.push(data);
      else if (type === "IEND") break;
      off += 12 + len;
    }
    if (!ihdr || !idat.length) return false;
    zlib.inflateSync(Buffer.concat(idat));
    return true;
  } catch {
    return false;
  }
}

interface Col {
  label: string;
  width: number;
  align?: "left" | "right";
}

export async function buildProformaPdf(model: ExportModel, options: PdfOptions = {}): Promise<Buffer> {
  const f = fonts();
  const p = model.project;
  const accent = model.branding.accent;
  const accentText = brandTextOnWhite(accent);
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: M, bottom: M, left: M, right: M },
    bufferPages: true,
    compress: options.compress ?? true,
    info: { Title: `${p.name} — pro forma`, Author: model.branding.orgName, Creator: "AURA", Subject: "Development appraisal" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (f.sans) doc.registerFont("sans", f.sans);
  if (f.serif) doc.registerFont("serif", f.serif);
  const SANS = f.sans ? "sans" : "Helvetica";
  const BOLD = f.sans ? "sans" : "Helvetica-Bold";
  const SERIF = f.serif ? "serif" : "Times-Roman";
  // Standard 14 fonts are WinAnsi: no U+2212 minus sign.
  const t = (s: string) => (f.sans ? s : s.replace(/−/g, "-"));

  const ensure = (h: number) => {
    if (doc.y + h > BOTTOM) {
      doc.addPage();
      doc.y = M;
    }
  };

  /** One line, never wrapped: shrinks (down to 5pt) to fit its column; an extreme figure may overhang rather than wrap. */
  const cell = (text: string, x: number, y: number, width: number, align: "left" | "right" = "left") => {
    const str = t(text);
    const size = (doc as unknown as { _fontSize: number })._fontSize;
    let fit = size;
    while (fit > 5 && doc.fontSize(fit).widthOfString(str) > width) fit -= 0.5;
    const w = doc.widthOfString(str);
    doc.text(str, align === "right" ? x + width - w : x, y + (size - fit) / 2, { lineBreak: false });
    doc.fontSize(size);
  };

  const table = (cols: Col[], rows: string[][], { size = 9, rowH = 15, boldLast = false } = {}) => {
    const drawHead = () => {
      ensure(rowH * 2);
      const y = doc.y;
      doc.font(BOLD).fontSize(size - 1).fillColor(ASH);
      let x = M;
      for (const c of cols) {
        cell(c.label.toUpperCase(), x, y, c.width, c.align);
        x += c.width;
      }
      doc.moveTo(M, y + rowH - 4).lineTo(M + W, y + rowH - 4).lineWidth(0.8).strokeColor(accent).stroke();
      doc.y = y + rowH;
    };
    drawHead();
    rows.forEach((row, ri) => {
      if (doc.y + rowH > BOTTOM) {
        doc.addPage();
        doc.y = M;
        drawHead();
      }
      const y = doc.y;
      const last = boldLast && ri === rows.length - 1;
      doc.font(last ? BOLD : SANS).fontSize(size).fillColor(INK);
      let x = M;
      row.forEach((v, i) => {
        cell(v, x, y + 2, cols[i].width - (i < cols.length - 1 ? 6 : 0), cols[i].align);
        x += cols[i].width;
      });
      doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).lineWidth(last ? 0.8 : 0.4).strokeColor(last ? INK : RULE).stroke();
      doc.y = y + rowH;
    });
    doc.y += 6;
  };

  const heading = (text: string, size = 16) => {
    ensure(size + 40);
    doc.font(SERIF).fontSize(size).fillColor(INK).text(t(text), M, doc.y, { width: W });
    doc.y += 2;
  };

  const kicker = (text: string, y: number) => {
    doc.font(BOLD).fontSize(8).fillColor(accentText).text(t(text.toUpperCase()), M, y, { width: W - 140, characterSpacing: 1.2, lineBreak: false });
  };

  /* ---------------------------------------------------------------- page 1 */
  const logo = model.branding.logo;
  if (logo && ((isPng(logo) && pngDecodes(logo)) || isJpeg(logo))) {
    try {
      doc.image(logo, M + W - 130, M - 6, { fit: [130, 44], align: "right" });
    } catch {
      /* a corrupt image is skipped, not fatal */
    }
  }
  kicker(`${model.branding.orgName} · Development appraisal`, M);
  doc.font(SERIF).fontSize(30).fillColor(INK).text(t(p.name), M, M + 16, { width: W - 140 });
  doc.font(SANS).fontSize(10).fillColor(INK).text(t(`${p.city} · ${p.status} · completion ${p.completion}`), M, doc.y + 2, { width: W });
  doc.font(SANS).fontSize(9).fillColor(ASH).text(t(`Client ${p.client} · Architect ${p.architect} · generated ${generatedDate(model)}`), { width: W });
  if (p.placeholder) {
    doc.moveDown(0.3);
    doc.font(SANS).fontSize(9).fillColor(accentText).text("Sample project — illustrative figures only. Not investment, valuation or financial advice.", { width: W });
  }
  doc.moveTo(M, doc.y + 8).lineTo(M + W, doc.y + 8).lineWidth(1).strokeColor(INK).stroke();
  doc.y += 22;

  heading("Site summary", 15);
  const s = model.site;
  const pct = (v: number) => `${v.toFixed(1)}%`;
  table(
    [
      { label: "Building", width: 139 },
      { label: "GDV", width: 64, align: "right" },
      { label: "TDC", width: 64, align: "right" },
      { label: "Profit", width: 64, align: "right" },
      { label: "On cost", width: 52, align: "right" },
      { label: "Margin", width: 52, align: "right" },
      { label: "Equity", width: 64, align: "right" },
    ],
    [
      ...model.buildings.map((b) => [b.name, fmtMoney(b.metrics.gdv), fmtMoney(b.metrics.totalDevelopmentCost), fmtMoney(b.metrics.profit), pct(b.metrics.profitOnCostPct), pct(b.metrics.marginOnGdvPct), fmtMoney(b.metrics.equityRequired)]),
      ["Site total", fmtMoney(s.gdv), fmtMoney(s.totalDevelopmentCost), fmtMoney(s.profit), pct(s.profitOnCostPct), pct(s.marginOnGdvPct), fmtMoney(s.equityRequired)],
    ],
    { boldLast: true }
  );
  doc.font(SANS).fontSize(8.5).fillColor(ASH).text(t(model.siteLine), M, doc.y, { width: W });
  doc.y += 14;

  for (const b of model.buildings) {
    const rowH = 15;
    ensure(30 + rowH * (b.appraisal.length + 1)); // keep each appraisal on one page
    heading(b.name, 15);
    if (b.usedDefaults && model.buildings.some((x) => !x.usedDefaults)) {
      doc.font(SANS).fontSize(8).fillColor(ASH).text("Project default assumptions", { width: W });
    }
    table([{ label: "Item", width: 210 }, { label: "Figure", width: W - 210, align: "right" }], b.appraisal.map((r) => [r.label, r.display]), { rowH });
    doc.y += 8;
  }

  /* ------------------------------------------------------- stacking plan */
  doc.addPage();
  doc.y = M;
  kicker(`${p.name} · Stacking plan`, M);
  doc.y = M + 16;
  heading("Unit availability", 22);
  doc.font(SANS).fontSize(9).fillColor(ASH).text("Sample availability by sales status. Guide prices are the pro forma value of each unit; the penthouse spans every crown floor and is counted once.", M, doc.y, { width: W });
  doc.y += 12;
  const statuses: (ExportUnitStatus | "Total")[] = ["Available", "Reserved", "Sold", "Total"];
  for (const b of model.buildings) {
    ensure(30 + 15 * 6);
    heading(b.name, 14);
    table(
      [
        { label: "Status", width: 160 },
        { label: "Units", width: 80, align: "right" },
        { label: "Sq ft", width: 110, align: "right" },
        { label: "Guide value", width: W - 350, align: "right" },
      ],
      statuses.map((k) => [k, fmtNum(b.unitTotals[k].count), fmtNum(b.unitTotals[k].sqFt), fmtMoney(b.unitTotals[k].price, false)]),
      { boldLast: true }
    );
    doc.y += 6;
  }
  ensure(40);
  doc.font(SANS).fontSize(8).fillColor(ASH).text(`${p.placeholder ? "Illustrative figures only. " : ""}Not investment, valuation or financial advice.`, M, doc.y + 4, { width: W });

  /* --------------------------------------------------------------- footers */
  const range = doc.bufferedPageRange();
  const note = footerNote(model);
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing in the margin must not open a new page
    doc.moveTo(M, FOOTER_Y - 6).lineTo(M + W, FOOTER_Y - 6).lineWidth(0.4).strokeColor(RULE).stroke();
    doc.font(SANS).fontSize(7.5).fillColor(ASH);
    doc.text(t(note), M, FOOTER_Y, { width: W - 80, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, M + W - 80, FOOTER_Y, { width: 80, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
