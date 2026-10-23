/**
 * exports/model — the single source of figures for downloadable pro formas.
 * -----------------------------------------------------------------------------
 * `buildExportModel` runs the same finance.ts engine as the Studio sidebar and
 * the print report (computeYield per building, computeSite for the total) and
 * returns a plain model the XLSX and PDF writers render without doing any
 * maths of their own. Appraisal rows are the exact strings ProFormaReport
 * prints; stacking-plan rows match StackingPlan's `buildUnits` unit for unit.
 *
 * Server-safe: no React, no "use client" imports (see `stackingUnits`).
 */
import { buildUnits } from "@/lib/stackingUnits";
import type { Building, BuildingId, CashflowMonth, ProjectStatus, SiteMetrics, YieldInputs, YieldMetrics, ZoneId } from "@/types";
import { computeSite, computeYield } from "@/lib/finance";
import { fmtMoney, fmtNum } from "@/lib/format";
import { ZONE_ORDER, ZONES } from "@/lib/tower";
import { validYieldInputs } from "@/lib/scenarioStorage";
import { projectSite, type Project } from "@/content/projects";

/** The fields of a project an export needs. A sample `Project` or a database row of the same shape. */
export type ExportProject = Pick<Project, "slug" | "name" | "city" | "status" | "client" | "architect" | "completion" | "placeholder" | "massing" | "finance">;

export interface ExportBranding {
  orgName?: string;
  /** Hex colour for rules and headings, e.g. "#9C7A52". */
  accent?: string;
  /** PNG or JPEG bytes (anything else is ignored by the PDF writer). */
  logo?: Buffer | null;
}

export type ExportUnitStatus = "Available" | "Reserved" | "Sold";

export interface ExportUnit {
  /** Lowest floor number the unit is on. */
  floorNumber: number;
  /** "F12", or "F48–F52" for the penthouse. */
  floorLabel: string;
  code: string;
  zone: ZoneId;
  zoneLabel: string;
  sqFt: number;
  /** Guide price, $. */
  price: number;
  status: ExportUnitStatus;
}

export interface UnitTally {
  count: number;
  sqFt: number;
  price: number;
}

export interface ExportAppraisalRow {
  label: string;
  /** Exactly as the printed pro forma shows it. */
  display: string;
}

export interface ExportBuilding {
  id: BuildingId;
  name: string;
  short: string;
  floorCount: number;
  inputs: YieldInputs;
  /** True when the caller's override for this building was missing or invalid and the project default was used. */
  usedDefaults: boolean;
  metrics: Omit<YieldMetrics, "cashflow" | "floors" | "zones"> & { totalSqFt: number; saleableSqFt: number };
  /** The rows of ProFormaReport's per-building table, same order and strings. */
  appraisal: ExportAppraisalRow[];
  cashflow: CashflowMonth[];
  /** One row per unit (the penthouse once), top floor first. */
  units: ExportUnit[];
  unitTotals: Record<ExportUnitStatus | "Total", UnitTally>;
}

export interface ExportModel {
  /** ISO timestamp. */
  generatedAt: string;
  project: { slug: string; name: string; city: string; status: ProjectStatus; client: string; architect: string; completion: string; placeholder: boolean };
  branding: { orgName: string; accent: string; logo: Buffer | null };
  site: SiteMetrics & { buildingCount: number };
  /** The print report's site summary line, e.g. "2 building(s) · 98 floors · 1,250,000 sf · 412 units". */
  siteLine: string;
  buildings: ExportBuilding[];
}

export const DEFAULT_BRANDING = { orgName: "AURA", accent: "#9C7A52" } as const;

const pct = (v: number | null, d = 1) => (v === null ? "—" : `${v.toFixed(d)}%`);

/** ProFormaReport's per-building rows, verbatim. */
export function appraisalRows(i: YieldInputs, m: YieldMetrics): ExportAppraisalRow[] {
  const rows: [string, string][] = [
    ["Buildable area", `${fmtNum(i.totalBuildableSqFt)} sf`],
    ...ZONE_ORDER.map((z) => [`${ZONES[z].short} price`, `$${fmtNum(i.pricePerSqFt[z])}/sf`] as [string, string]),
    ["Absorption", `${i.absorptionUnitsPerMonth} units/mo`],
    ["Land", fmtMoney(m.landCost, false)],
    ["Hard cost", `${fmtMoney(m.hardCost, false)} ($${fmtNum(i.hardCostPerSqFt)}/sf)`],
    ["Soft cost", `${fmtMoney(m.softCost, false)} (${i.softCostPct}%)`],
    ["Contingency", `${fmtMoney(m.contingency, false)} (${i.contingencyPct}%)`],
    ["Finance", `${fmtMoney(m.financeCost, false)} (${i.ltcPct}% LTC, ${i.interestRatePct}%, ${i.termMonths} mo)`],
    ["Sales commission", `${fmtMoney(m.salesCommission, false)} (${i.salesCommissionPct}%)`],
    ["AURA fee", `${fmtMoney(m.platformFee, false)} (${i.auraFeePct}%)`],
    ["GDV", fmtMoney(m.gdv, false)],
    ["Total development cost", fmtMoney(m.totalDevelopmentCost, false)],
    ["Profit", fmtMoney(m.profit, false)],
    ["Profit on cost / margin", `${pct(m.profitOnCostPct)} / ${pct(m.marginOnGdvPct)}`],
    ["Equity IRR / multiple", `${pct(m.irrPct)} / ${m.equityMultiple.toFixed(2)}×`],
    ["Equity required / peak debt", `${fmtMoney(m.equityRequired, false)} / ${fmtMoney(m.peakDebt, false)}`],
    [`Residual land value (${i.targetProfitOnCostPct}% on cost)`, fmtMoney(m.residualLandValue, false)],
  ];
  return rows.map(([label, display]) => ({ label, display }));
}

/* ------------------------------------------------------------ stacking plan */

/** Sellable units of a building, each once (the penthouse spans every crown floor), in floor order bottom-up.
 * Derived from the same `buildUnits` the on-screen stacking plan uses. */
export function stackingUnits(slug: string, status: ProjectStatus, building: Building, metrics: YieldMetrics): (ExportUnit & { floorIndex: number })[] {
  const seen = new Set<string>();
  const out: (ExportUnit & { floorIndex: number })[] = [];
  for (const u of buildUnits(slug, status, building, metrics).flat()) {
    if (seen.has(u.code)) continue;
    seen.add(u.code);
    const [first, last] = u.levels ?? [u.floorNumber, u.floorNumber];
    out.push({
      floorIndex: u.floorIndex, floorNumber: u.floorNumber,
      floorLabel: first === last ? `F${first}` : `F${first}–F${last}`,
      code: u.code, zone: u.zone, zoneLabel: ZONES[u.zone].short,
      sqFt: u.sqFt, price: u.price, status: u.status,
    });
  }
  return out;
}

function tally(units: ExportUnit[]): Record<ExportUnitStatus | "Total", UnitTally> {
  const zero = (): UnitTally => ({ count: 0, sqFt: 0, price: 0 });
  const t = { Available: zero(), Reserved: zero(), Sold: zero(), Total: zero() };
  for (const u of units) {
    for (const k of [u.status, "Total"] as const) {
      t[k].count += 1;
      t[k].sqFt += u.sqFt;
      t[k].price += u.price;
    }
  }
  return t;
}

/* --------------------------------------------------------------------- model */

export interface BuildExportModelArgs {
  project: ExportProject;
  /** Inputs currently on screen, per building id. Missing or invalid entries fall back to `project.finance`. */
  inputsById?: Partial<Record<BuildingId, unknown>> | null;
  branding?: ExportBranding | null;
  /** Defaults to now (pass one for reproducible files). */
  generatedAt?: Date;
}

export function buildExportModel({ project, inputsById, branding, generatedAt = new Date() }: BuildExportModelArgs): ExportModel {
  // projectSite only reads `slug` and `massing`; it is typed for the full Project.
  const buildings = projectSite(project as Project);
  const rows = buildings.map((b) => {
    const override = inputsById?.[b.id];
    const valid = override !== undefined && validYieldInputs(override);
    const inputs: YieldInputs = valid ? (override as YieldInputs) : project.finance[b.id];
    if (!inputs) throw new Error(`Project "${project.slug}" has no finance inputs for building "${b.id}".`);
    return { b, inputs, usedDefaults: !valid, metrics: computeYield(inputs, b.floors) };
  });
  const site = computeSite(rows.map((r) => r.metrics));

  const out: ExportBuilding[] = rows.map(({ b, inputs, usedDefaults, metrics: m }) => {
    const units = stackingUnits(project.slug, project.status, b, m);
    const { cashflow, floors, zones: _zones, ...headline } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
    return {
      id: b.id,
      name: b.name,
      short: b.short,
      floorCount: b.floors.length,
      inputs: { ...inputs, pricePerSqFt: { ...inputs.pricePerSqFt } },
      usedDefaults,
      metrics: {
        ...headline,
        totalSqFt: floors.reduce((s, f) => s + f.sqFt, 0),
        saleableSqFt: floors.filter((f) => f.revenue > 0).reduce((s, f) => s + f.sqFt, 0),
      },
      appraisal: appraisalRows(inputs, m),
      cashflow: cashflow.map((c) => ({ ...c })),
      units: units
        .sort((a, z) => z.floorIndex - a.floorIndex)
        .map(({ floorIndex: _f, ...u }) => u), // eslint-disable-line @typescript-eslint/no-unused-vars
      unitTotals: tally(units),
    };
  });

  return {
    generatedAt: generatedAt.toISOString(),
    project: {
      slug: project.slug,
      name: project.name,
      city: project.city,
      status: project.status,
      client: project.client,
      architect: project.architect,
      completion: project.completion,
      placeholder: project.placeholder,
    },
    branding: {
      orgName: branding?.orgName?.trim() || DEFAULT_BRANDING.orgName,
      accent: branding?.accent && /^#[0-9a-f]{6}$/i.test(branding.accent) ? branding.accent : DEFAULT_BRANDING.accent,
      logo: branding?.logo ?? null,
    },
    site: { ...site, buildingCount: buildings.length },
    siteLine: `${buildings.length} building(s) · ${site.totalFloors} floors · ${fmtNum(site.totalSqFt)} sf · ${fmtNum(site.totalUnits)} units`,
    buildings: out,
  };
}

/** "23 October 2026" for headers. */
export const generatedDate = (model: ExportModel) =>
  new Date(model.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "illustrative figures only" unless the project is real. */
export const footerNote = (model: ExportModel) =>
  model.project.placeholder ? "Prepared with AURA · illustrative figures only" : "Prepared with AURA";
