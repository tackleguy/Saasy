"use client";
/**
 * useYieldCalculator — the financial state engine.
 * -----------------------------------------------------------------------------
 * Holds the pro-forma inputs and derives every metric in real time:
 *
 *   Gross Project Revenue   = totalBuildableSqFt × avgPricePerSqFt
 *   Total Construction Cost = totalBuildableSqFt × buildCostPerSqFt
 *   Gross Profit            = Revenue − Cost
 *   Gross Margin (%)        = Gross Profit ÷ Revenue × 100
 *   Developer Net Revenue   = Revenue × 0.99 − Cost
 *   Platform 1% Success Fee = Revenue × 0.01
 *
 * The headline figures follow those formulas exactly. The `unitMixStrategy`
 * does not change the totals — it decides WHERE the value sits: which zones
 * earn a premium, how revenue is attributed floor by floor, and how large
 * the residential units are (and therefore how many there are).
 *
 * Each building on the site has its own set of inputs; `site` rolls all
 * three up into a development-wide total.
 *
 * `computeYield` is exported as a pure function so it can be unit-tested or
 * moved server-side without React.
 */
import { useCallback, useMemo, useState } from "react";
import type {
  BuildingId,
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
import { getBuilding, SITE, ZONE_ORDER, ZONES } from "@/lib/tower";

/** The platform's success fee: 1% of gross project revenue. */
export const PLATFORM_FEE_RATE = 0.01;

/** Default assumptions per building (The Meridian uses the brief's defaults). */
export const DEFAULT_INPUTS: Record<BuildingId, YieldInputs> = {
  meridian: { totalBuildableSqFt: 120_000, avgPricePerSqFt: 1_450, buildCostPerSqFt: 650, unitMixStrategy: "balanced" },
  spire: { totalBuildableSqFt: 185_000, avgPricePerSqFt: 1_650, buildCostPerSqFt: 720, unitMixStrategy: "luxury_heavy" },
  lofts: { totalBuildableSqFt: 68_000, avgPricePerSqFt: 1_150, buildCostPerSqFt: 560, unitMixStrategy: "balanced" },
};

export const INPUT_RANGES: Record<Exclude<keyof YieldInputs, "unitMixStrategy">, InputRange> = {
  totalBuildableSqFt: { min: 50_000, max: 300_000, step: 1_000 },
  avgPricePerSqFt: { min: 800, max: 2_500, step: 10 },
  buildCostPerSqFt: { min: 400, max: 1_200, step: 10 },
};

interface StrategyProfile {
  label: string;
  description: string;
  /** Relative value per sq ft of each zone (normalised away, so only ratios matter). */
  valueWeight: Record<ZoneId, number>;
  /** Multiplier on the residential average unit size. */
  residentialUnitScale: number;
}

export const STRATEGIES: Record<UnitMixStrategy, StrategyProfile> = {
  balanced: {
    label: "Balanced",
    description: "Even value across podium retail, offices and residences.",
    valueWeight: { podium: 1, office: 1, residential: 1.05, crown: 1.4 },
    residentialUnitScale: 1,
  },
  luxury_heavy: {
    label: "Luxury Heavy",
    description: "Larger residences and trophy penthouses carry the scheme.",
    valueWeight: { podium: 0.8, office: 0.7, residential: 1.25, crown: 2.6 },
    residentialUnitScale: 1.45,
  },
  commercial_focus: {
    label: "Commercial Focus",
    description: "Grade-A offices and retail lead, compact residences above.",
    valueWeight: { podium: 1.5, office: 1.45, residential: 0.85, crown: 1.1 },
    residentialUnitScale: 0.8,
  },
};

/** Pure calculation — deterministic for a given set of inputs and floors. */
export function computeYield(inputs: YieldInputs, floors: FloorData[]): YieldMetrics {
  const { totalBuildableSqFt, avgPricePerSqFt, buildCostPerSqFt, unitMixStrategy } = inputs;
  const strategy = STRATEGIES[unitMixStrategy];

  // ---- Headline pro forma (exact spec formulas)
  const grossProjectRevenue = totalBuildableSqFt * avgPricePerSqFt;
  const totalConstructionCost = totalBuildableSqFt * buildCostPerSqFt;
  const grossProfit = grossProjectRevenue - totalConstructionCost;
  const grossMarginPct = grossProjectRevenue > 0 ? (grossProfit / grossProjectRevenue) * 100 : 0;
  const developerNetRevenue = grossProjectRevenue * (1 - PLATFORM_FEE_RATE) - totalConstructionCost;
  const platformSuccessFee = grossProjectRevenue * PLATFORM_FEE_RATE;

  // ---- Floor attribution
  // Area follows the physical plate size; value is area × the strategy's zone weight.
  const areaTotal = floors.reduce((s, f) => s + f.footprintM2, 0);
  const valueTotal = floors.reduce((s, f) => s + f.footprintM2 * strategy.valueWeight[f.zone], 0);

  const floorYields: FloorYield[] = floors.map((f) => {
    const areaShare = f.footprintM2 / areaTotal;
    const valueShare = (f.footprintM2 * strategy.valueWeight[f.zone]) / valueTotal;
    const sqFt = totalBuildableSqFt * areaShare;
    const unitSize = ZONES[f.zone].avgUnitSqFt * (f.zone === "residential" ? strategy.residentialUnitScale : 1);
    const revenue = grossProjectRevenue * valueShare;
    const cost = totalConstructionCost * areaShare;
    return {
      index: f.index,
      zone: f.zone,
      sqFt,
      units: Math.max(1, Math.round(sqFt / unitSize)),
      revenue,
      cost,
      profit: revenue - cost,
    };
  });

  // ---- Zone roll-up
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
      share: grossProjectRevenue > 0 ? revenue / grossProjectRevenue : 0,
    };
  });

  return {
    grossProjectRevenue,
    totalConstructionCost,
    grossProfit,
    grossMarginPct,
    developerNetRevenue,
    platformSuccessFee,
    totalUnits: floorYields.reduce((s, f) => s + f.units, 0),
    floors: floorYields,
    zones,
  };
}

/** Sum every building's metrics into a site-wide total. */
export function computeSite(all: YieldMetrics[]): SiteMetrics {
  const sum = (f: (m: YieldMetrics) => number) => all.reduce((s, m) => s + f(m), 0);
  const grossProjectRevenue = sum((m) => m.grossProjectRevenue);
  const grossProfit = sum((m) => m.grossProfit);
  return {
    grossProjectRevenue,
    totalConstructionCost: sum((m) => m.totalConstructionCost),
    grossProfit,
    grossMarginPct: grossProjectRevenue > 0 ? (grossProfit / grossProjectRevenue) * 100 : 0,
    developerNetRevenue: sum((m) => m.developerNetRevenue),
    platformSuccessFee: sum((m) => m.platformSuccessFee),
    totalUnits: sum((m) => m.totalUnits),
    totalFloors: sum((m) => m.floors.length),
    totalSqFt: sum((m) => m.floors.reduce((s, f) => s + f.sqFt, 0)),
  };
}

/** React state wrapper: one set of inputs per building + a site roll-up. */
export function useYieldCalculator() {
  const [inputsById, setInputsById] = useState<Record<BuildingId, YieldInputs>>(DEFAULT_INPUTS);

  const setInput = useCallback(<K extends keyof YieldInputs>(building: BuildingId, key: K, value: YieldInputs[K]) => {
    setInputsById((prev) => ({ ...prev, [building]: { ...prev[building], [key]: value } }));
  }, []);

  const reset = useCallback((building: BuildingId) => {
    setInputsById((prev) => ({ ...prev, [building]: DEFAULT_INPUTS[building] }));
  }, []);

  const metricsById = useMemo(
    () =>
      Object.fromEntries(SITE.map((b) => [b.id, computeYield(inputsById[b.id], getBuilding(b.id).floors)])) as Record<
        BuildingId,
        YieldMetrics
      >,
    [inputsById]
  );

  const site = useMemo(() => computeSite(Object.values(metricsById)), [metricsById]);

  return { inputsById, setInput, reset, metricsById, site };
}

export type YieldCalculator = ReturnType<typeof useYieldCalculator>;
