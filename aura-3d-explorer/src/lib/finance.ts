/**
 * finance — AURA's developer pro forma (pure functions, no React).
 * -----------------------------------------------------------------------------
 * Area & value
 *   Buildable area is attributed to floors by plate footprint. Each floor's
 *   value = its area × the sale price of its zone, so GDV = Σ floor values.
 *
 * Costs
 *   Hard         = area × hard cost / sf
 *   Soft         = hard × soft %
 *   Contingency  = (hard + soft) × contingency %
 *   Sales costs  = GDV × (commission % + AURA fee %)
 *   Finance      = capitalised interest from the monthly cash flow (below)
 *   TDC          = land + hard + soft + contingency + finance + sales costs
 *
 * Monthly cash flow
 *   • Month 0: land is paid.
 *   • Months 1…T: hard + soft + contingency are spent on an S-curve
 *     (raised-cosine weights → slow start, peak mid-build, slow finish).
 *   • Spend is funded equity-first: equity covers (1 − LTC) of land + dev
 *     cost, then the loan draws. Interest accrues monthly on the loan balance
 *     and is capitalised.
 *   • Sales launch at 40% of the build; units sell at the absorption rate.
 *     Pre-sales close at completion, later sales close as they sell.
 *     Receipts (net of commission + fee) repay the loan first, then equity.
 *
 * Returns
 *   Profit = GDV − TDC · profit on cost · margin on GDV · equity required ·
 *   equity IRR (monthly IRR annualised) · residual land value at the target
 *   profit on cost: RLV = GDV ÷ (1 + target) − (TDC − land). (Finance cost is
 *   held constant in the RLV — a standard simplification.)
 *
 * Everything is deterministic, so it is easy to unit-test or run server-side.
 */
import type {
  CashflowMonth,
  FloorData,
  FloorYield,
  InputRange,
  SiteMetrics,
  UnitMixStrategy,
  YieldInputs,
  YieldMetrics,
  ZoneId,
  ZoneYield,
} from "@/types";
import { ZONE_ORDER, ZONES } from "@/lib/tower";

/** The platform's success fee: 1% of sales. */
export const PLATFORM_FEE_RATE = 0.01;
/** A typical traditional sales & marketing load, for comparison. */
export const TRADITIONAL_LOAD_RATE = 0.05;

/* ------------------------------------------------------------------ presets */

interface StrategyProfile {
  label: string;
  description: string;
  /** Relative price per sq ft of each zone (multiplied by the blended price). */
  priceWeight: Record<ZoneId, number>;
  /** Multiplier on the residential average unit size. */
  residentialUnitScale: number;
}

export const STRATEGIES: Record<UnitMixStrategy, StrategyProfile> = {
  balanced: {
    label: "Balanced",
    description: "Even value across podium retail, offices and residences.",
    priceWeight: { podium: 0.85, office: 0.9, residential: 1.0, crown: 1.45 },
    residentialUnitScale: 1,
  },
  luxury_heavy: {
    label: "Luxury Heavy",
    description: "Larger residences and trophy penthouses carry the scheme.",
    priceWeight: { podium: 0.7, office: 0.75, residential: 1.08, crown: 2.1 },
    residentialUnitScale: 1.45,
  },
  commercial_focus: {
    label: "Commercial Focus",
    description: "Grade-A offices and retail lead, compact residences above.",
    priceWeight: { podium: 1.15, office: 1.1, residential: 0.9, crown: 1.2 },
    residentialUnitScale: 0.8,
  },
};

/** Typical share of GFA by zone, used to keep a preset's blended price honest. */
const TYPICAL_AREA_MIX: Record<ZoneId, number> = { podium: 0.06, office: 0.25, residential: 0.59, crown: 0.1 };

/**
 * Zone prices from a blended $/sf and a strategy (rounded to $10). Weights are
 * normalised against a typical area mix so the resulting blended price stays
 * close to `blended` — a preset reshuffles value between zones, it doesn't
 * inflate it.
 */
export function zonePrices(blended: number, strategy: UnitMixStrategy): Record<ZoneId, number> {
  const w = STRATEGIES[strategy].priceWeight;
  const norm = ZONE_ORDER.reduce((s, z) => s + TYPICAL_AREA_MIX[z] * w[z], 0);
  return Object.fromEntries(ZONE_ORDER.map((z) => [z, Math.round((blended * w[z]) / norm / 10) * 10])) as Record<ZoneId, number>;
}

/**
 * Build a full set of inputs from a few headline numbers — used by the
 * project content. Land defaults to 14% of an indicative GDV.
 */
export function proforma(
  totalBuildableSqFt: number,
  blendedPricePerSqFt: number,
  hardCostPerSqFt: number,
  unitMixStrategy: UnitMixStrategy = "balanced",
  overrides: Partial<YieldInputs> = {}
): YieldInputs {
  return {
    totalBuildableSqFt,
    landCost: Math.round((totalBuildableSqFt * blendedPricePerSqFt * 0.14) / 100_000) * 100_000,
    hardCostPerSqFt,
    softCostPct: 18,
    contingencyPct: 5,
    ltcPct: 60,
    interestRatePct: 8.5,
    termMonths: 30,
    pricePerSqFt: zonePrices(blendedPricePerSqFt, unitMixStrategy),
    absorptionUnitsPerMonth: 4,
    salesCommissionPct: 2,
    auraFeePct: PLATFORM_FEE_RATE * 100,
    targetProfitOnCostPct: 20,
    unitMixStrategy,
    ...overrides,
  };
}

/** Fallback inputs (the original brief's headline numbers). */
export const DEFAULT_INPUTS: YieldInputs = proforma(120_000, 1_450, 650);

/** Slider ranges for the numeric inputs. */
export const INPUT_RANGES = {
  totalBuildableSqFt: { min: 50_000, max: 1_500_000, step: 5_000 },
  landCost: { min: 0, max: 400_000_000, step: 500_000 },
  hardCostPerSqFt: { min: 400, max: 1_200, step: 10 },
  softCostPct: { min: 5, max: 35, step: 0.5 },
  contingencyPct: { min: 0, max: 15, step: 0.5 },
  ltcPct: { min: 0, max: 80, step: 1 },
  interestRatePct: { min: 3, max: 14, step: 0.25 },
  termMonths: { min: 12, max: 60, step: 1 },
  price: { min: 400, max: 4_000, step: 10 },
  absorptionUnitsPerMonth: { min: 1, max: 20, step: 0.5 },
  salesCommissionPct: { min: 0, max: 6, step: 0.25 },
  targetProfitOnCostPct: { min: 5, max: 35, step: 0.5 },
} satisfies Record<string, InputRange>;

/* ------------------------------------------------------------------- engine */

/** Monthly IRR by bisection on NPV; null if flows never change sign or it fails to bracket. */
export function irr(flows: number[]): number | null {
  const npv = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  if (!flows.some((f) => f < 0) || !flows.some((f) => f > 0)) return null;
  let lo = -0.99;
  let hi = 1;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Raised-cosine S-curve weights over `n` months (sum = 1). */
function sCurve(n: number): number[] {
  const w = Array.from({ length: n }, (_, i) => 1 - Math.cos((2 * Math.PI * (i + 0.5)) / n));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

interface Adjust {
  /** Multiplier on all sale prices (sensitivity). */
  price?: number;
  /** Multiplier on hard cost (sensitivity). */
  cost?: number;
}

/** Full pro forma for one building. */
export function computeYield(inputs: YieldInputs, floors: FloorData[], adjust: Adjust = {}): YieldMetrics {
  const priceAdj = adjust.price ?? 1;
  const costAdj = adjust.cost ?? 1;
  const strategy = STRATEGIES[inputs.unitMixStrategy];
  const sqft = inputs.totalBuildableSqFt;

  // ---- Floor attribution (area by footprint, value by zone price)
  const areaTotal = floors.reduce((s, f) => s + f.footprintM2, 0);
  const floorBase = floors.map((f) => {
    const share = f.footprintM2 / areaTotal;
    const floorSqFt = sqft * share;
    const unitSize = ZONES[f.zone].avgUnitSqFt * (f.zone === "residential" ? strategy.residentialUnitScale : 1);
    return {
      f,
      share,
      sqFt: floorSqFt,
      units: Math.max(1, Math.round(floorSqFt / unitSize)),
      revenue: floorSqFt * inputs.pricePerSqFt[f.zone] * priceAdj,
    };
  });
  const gdv = floorBase.reduce((s, x) => s + x.revenue, 0);
  const totalUnits = floorBase.reduce((s, x) => s + x.units, 0);

  // ---- Costs
  const landCost = inputs.landCost;
  const hardCost = sqft * inputs.hardCostPerSqFt * costAdj;
  const softCost = hardCost * (inputs.softCostPct / 100);
  const contingency = (hardCost + softCost) * (inputs.contingencyPct / 100);
  const devCost = hardCost + softCost + contingency;
  const salesCommission = gdv * (inputs.salesCommissionPct / 100);
  const platformFee = gdv * (inputs.auraFeePct / 100);
  const salesCostRate = (inputs.salesCommissionPct + inputs.auraFeePct) / 100;

  // ---- Monthly cash flow
  const T = Math.max(1, Math.round(inputs.termMonths));
  const launch = Math.round(T * 0.4);
  const salesMonths = Math.ceil(totalUnits / Math.max(0.1, inputs.absorptionUnitsPerMonth));
  const lastSale = launch + salesMonths;
  const horizon = Math.max(T, lastSale) + 1;
  const pricePerUnit = gdv / totalUnits;

  const spend = new Array(horizon + 1).fill(0);
  spend[0] = landCost;
  sCurve(T).forEach((w, i) => (spend[i + 1] += devCost * w));

  // Gross receipts: pre-sales close at completion (month T), later sales in their month.
  const receipts = new Array(horizon + 1).fill(0);
  let sold = 0;
  for (let m = launch; sold < totalUnits && m <= horizon; m++) {
    const n = Math.min(inputs.absorptionUnitsPerMonth, totalUnits - sold);
    receipts[Math.max(m, T)] += n * pricePerUnit;
    sold += n;
  }

  const equityCap = (1 - inputs.ltcPct / 100) * (landCost + devCost);
  const r = inputs.interestRatePct / 100 / 12;
  let equityIn = 0;
  let debt = 0;
  let interest = 0;
  let peakDebt = 0;
  let equityPosition = 0;
  const equityFlows: number[] = [];
  const cashflow: CashflowMonth[] = [];

  for (let m = 0; m <= horizon; m++) {
    // Interest on last month's balance, capitalised.
    const i = debt * r;
    interest += i;
    debt += i;

    // Fund this month's spend: equity first, then debt.
    let need = spend[m];
    const fromEquity = Math.min(need, Math.max(0, equityCap - equityIn));
    equityIn += fromEquity;
    need -= fromEquity;
    debt += need;
    peakDebt = Math.max(peakDebt, debt);

    // Net receipts repay debt first, then flow to equity.
    const net = receipts[m] * (1 - salesCostRate);
    const repay = Math.min(debt, net);
    debt -= repay;
    const toEquity = net - repay;

    equityPosition += toEquity - fromEquity;
    equityFlows.push(toEquity - fromEquity);
    cashflow.push({ month: m, spend: spend[m], receipts: net, equityIn: fromEquity, equityOut: toEquity, debt, equityPosition });
  }

  const financeCost = interest;
  const totalDevelopmentCost = landCost + devCost + financeCost + salesCommission + platformFee;
  const profit = gdv - totalDevelopmentCost;
  const monthly = irr(equityFlows);
  const irrPct = monthly === null ? null : (Math.pow(1 + monthly, 12) - 1) * 100;
  const target = inputs.targetProfitOnCostPct / 100;

  // ---- Floor & zone roll-ups
  const floorYields: FloorYield[] = floorBase.map((x) => {
    const cost = totalDevelopmentCost * x.share;
    return { index: x.f.index, zone: x.f.zone, sqFt: x.sqFt, units: x.units, revenue: x.revenue, cost, profit: x.revenue - cost };
  });
  const zones: ZoneYield[] = ZONE_ORDER.map((zone) => {
    const inZone = floorYields.filter((f) => f.zone === zone);
    const revenue = inZone.reduce((s, f) => s + f.revenue, 0);
    return {
      zone,
      label: ZONES[zone].short,
      accent: ZONES[zone].accent,
      floorCount: inZone.length,
      sqFt: inZone.reduce((s, f) => s + f.sqFt, 0),
      units: inZone.reduce((s, f) => s + f.units, 0),
      revenue,
      share: gdv > 0 ? revenue / gdv : 0,
    };
  });

  return {
    gdv,
    landCost,
    hardCost,
    softCost,
    contingency,
    financeCost,
    salesCommission,
    platformFee,
    totalDevelopmentCost,
    profit,
    profitOnCostPct: totalDevelopmentCost > 0 ? (profit / totalDevelopmentCost) * 100 : 0,
    marginOnGdvPct: gdv > 0 ? (profit / gdv) * 100 : 0,
    equityRequired: equityIn,
    peakDebt,
    irrPct,
    equityMultiple: equityIn > 0 ? (equityIn + profit) / equityIn : 0,
    residualLandValue: gdv / (1 + target) - (totalDevelopmentCost - landCost),
    durationMonths: horizon,
    totalUnits,
    cashflow,
    floors: floorYields,
    zones,
  };
}

/* -------------------------------------------------------------- sensitivity */

export const SENSITIVITY_STEPS = [-0.1, -0.05, 0, 0.05, 0.1];

/** Profit on cost (%) for sale price ±10% (rows) × hard cost ±10% (columns). */
export function sensitivity(inputs: YieldInputs, floors: FloorData[]): number[][] {
  return SENSITIVITY_STEPS.map((dp) => SENSITIVITY_STEPS.map((dc) => computeYield(inputs, floors, { price: 1 + dp, cost: 1 + dc }).profitOnCostPct));
}

/* -------------------------------------------------------------------- site */

/** Sum every building's metrics into a site-wide total. */
export function computeSite(all: YieldMetrics[]): SiteMetrics {
  const sum = (f: (m: YieldMetrics) => number) => all.reduce((s, m) => s + f(m), 0);
  const gdv = sum((m) => m.gdv);
  const tdc = sum((m) => m.totalDevelopmentCost);
  const profit = sum((m) => m.profit);
  return {
    gdv,
    totalDevelopmentCost: tdc,
    profit,
    profitOnCostPct: tdc > 0 ? (profit / tdc) * 100 : 0,
    marginOnGdvPct: gdv > 0 ? (profit / gdv) * 100 : 0,
    platformFee: sum((m) => m.platformFee),
    equityRequired: sum((m) => m.equityRequired),
    totalUnits: sum((m) => m.totalUnits),
    totalFloors: sum((m) => m.floors.length),
    totalSqFt: sum((m) => m.floors.reduce((s, f) => s + f.sqFt, 0)),
  };
}
