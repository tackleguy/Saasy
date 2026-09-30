/**
 * AURA Yield Engine — pure calculation functions (no React).
 * Everything here is deterministic so it is easy to unit-test or move server-side.
 */
import { FloorPlate, ZONES, ZoneId, ZONE_ORDER } from "./building";

export interface FinanceInputs {
  /** total buildable (gross) area in sq ft */
  totalSqft: number;
  /** target sale / rent price per sq ft (USD) */
  pricePerSqft: number;
  /** estimated hard build cost per sq ft (USD) */
  costPerSqft: number;
  /** % of units sold (drives the 1% success fee) 0–100 */
  soldPct: number;
}

export const DEFAULT_INPUTS: FinanceInputs = {
  totalSqft: 150_000,
  pricePerSqft: 1_450,
  costPerSqft: 720,
  soldPct: 100,
};

export const INPUT_RANGES = {
  totalSqft: { min: 50_000, max: 250_000, step: 1_000 },
  pricePerSqft: { min: 800, max: 2_500, step: 10 },
  costPerSqft: { min: 400, max: 1_200, step: 10 },
  soldPct: { min: 0, max: 100, step: 1 },
} as const;

/** The platform's success fee — 1% of revenue from SOLD units only */
export const SUCCESS_FEE_RATE = 0.01;

export interface FloorYield {
  index: number;
  label: string;
  zone: ZoneId;
  sqft: number;
  saleableSqft: number;
  units: number;
  revenue: number;
  cost: number;
}

export interface ZoneYield {
  zone: ZoneId;
  label: string;
  color: string;
  floors: number;
  sqft: number;
  units: number;
  revenue: number;
}

export interface YieldResult {
  grossRevenue: number;
  constructionCost: number;
  netProfit: number;
  /** net profit / gross revenue */
  marginPct: number;
  /** net profit / construction cost */
  roiPct: number;
  totalUnits: number;
  floors: FloorYield[];
  zones: ZoneYield[];
  // --- 1% success-fee model
  soldRevenue: number;
  platformFee: number;
  developerNet: number;
}

/**
 * Core calculation.
 *   Gross Revenue       = Total Sq Ft × Price/Sq Ft
 *   Construction Cost   = Total Sq Ft × Cost/Sq Ft
 *   Net Margin          = (Revenue − Cost) / Revenue
 *   ROI                 = (Revenue − Cost) / Cost
 * The total area is distributed across floors in proportion to each plate's
 * actual geometric footprint, so bigger plates carry more of the yield.
 */
export function computeYield(inputs: FinanceInputs, plates: FloorPlate[]): YieldResult {
  const { totalSqft, pricePerSqft, costPerSqft, soldPct } = inputs;

  const grossRevenue = totalSqft * pricePerSqft;
  const constructionCost = totalSqft * costPerSqft;
  const netProfit = grossRevenue - constructionCost;

  // Weight each floor by footprint area × (height factor for double-height crown floors count once)
  const weightSum = plates.reduce((s, p) => s + p.plateArea, 0);

  const floors: FloorYield[] = plates.map((p) => {
    const spec = ZONES[p.zone];
    const sqft = (p.plateArea / weightSum) * totalSqft;
    const saleableSqft = sqft * spec.efficiency;
    const units = Math.max(1, Math.round(saleableSqft / spec.avgUnitSqft));
    return {
      index: p.index,
      label: p.label,
      zone: p.zone,
      sqft,
      saleableSqft,
      units,
      revenue: sqft * pricePerSqft,
      cost: sqft * costPerSqft,
    };
  });

  const zones: ZoneYield[] = ZONE_ORDER.map((z) => {
    const fl = floors.filter((f) => f.zone === z);
    return {
      zone: z,
      label: ZONES[z].short,
      color: ZONES[z].color,
      floors: fl.length,
      sqft: fl.reduce((s, f) => s + f.sqft, 0),
      units: fl.reduce((s, f) => s + f.units, 0),
      revenue: fl.reduce((s, f) => s + f.revenue, 0),
    };
  });

  const soldRevenue = grossRevenue * (soldPct / 100);
  const platformFee = soldRevenue * SUCCESS_FEE_RATE;
  const developerNet = soldRevenue - constructionCost - platformFee;

  return {
    grossRevenue,
    constructionCost,
    netProfit,
    marginPct: grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0,
    roiPct: constructionCost > 0 ? (netProfit / constructionCost) * 100 : 0,
    totalUnits: floors.reduce((s, f) => s + f.units, 0),
    floors,
    zones,
    soldRevenue,
    platformFee,
    developerNet,
  };
}

/* ---------------------------------------------------------- formatting */

export function fmtMoney(n: number, compact = true): string {
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (!compact) return sign + "$" + Math.round(v).toLocaleString("en-US");
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}

export const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtPct = (n: number, d = 1) => `${n.toFixed(d)}%`;
