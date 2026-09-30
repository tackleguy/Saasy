"use client";
/**
 * FinancialSidebar — site summary, pro-forma inputs and live yield KPIs.
 * -----------------------------------------------------------------------------
 * The site card lists all three buildings (click one to make it active) with
 * a development-wide total. Below it, three sliders + the unit-mix strategy
 * drive the ACTIVE building's pro forma; the KPI grid and programme-mix bar
 * update on every change. Clicking a programme flies the camera to that zone.
 */
import { motion } from "framer-motion";
import clsx from "clsx";
import { Building2, Calculator, DollarSign, Hammer, Home, Landmark, Percent, RotateCcw, Ruler, TrendingUp } from "lucide-react";
import type { Building, BuildingId, SiteMetrics, UnitMixStrategy, YieldInputs, YieldMetrics, ZoneId } from "@/types";
import { INPUT_RANGES, STRATEGIES } from "@/lib/finance";
import { ZONES } from "@/lib/tower";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { Panel, Metric, RangeSlider, SegmentedControl } from "./primitives";

interface Props {
  /** Every building on the project site. */
  buildings: Building[];
  /** Label for the site card, e.g. the project name. */
  siteName: string;
  building: Building;
  inputs: YieldInputs;
  metrics: YieldMetrics;
  metricsById: Record<BuildingId, YieldMetrics>;
  site: SiteMetrics;
  onBuildingChange: (id: BuildingId) => void;
  /** Edits the active building's inputs. */
  setInput: <K extends keyof YieldInputs>(key: K, value: YieldInputs[K]) => void;
  onReset: () => void;
  /** Jump to the first floor of a zone. */
  onFocusZone: (zone: ZoneId) => void;
}

const STRATEGY_OPTIONS = (Object.keys(STRATEGIES) as UnitMixStrategy[]).map((value) => ({
  value,
  label: STRATEGIES[value].label,
}));

export default function FinancialSidebar({
  buildings,
  siteName,
  building,
  inputs,
  metrics: m,
  metricsById,
  site,
  onBuildingChange,
  setInput,
  onReset,
  onFocusZone,
}: Props) {
  const R = INPUT_RANGES;
  const profitable = m.grossProfit >= 0;

  return (
    <>
      {/* ---------------------------------------------------- Site */}
      {buildings.length > 1 && (
        <Panel index={0} kicker={siteName} icon={<Landmark size={11} aria-hidden />} title="Site Portfolio">
          <ul className="space-y-1.5">
            {buildings.map((b) => {
              const bm = metricsById[b.id];
              const active = b.id === building.id;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => onBuildingChange(b.id)}
                    aria-pressed={active}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-[3px] border px-3 py-2.5 text-left transition",
                      active ? "border-oak/40 bg-oak/[0.07]" : "border-plaster bg-stone/40 hover:border-plaster",
                    )}
                  >
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", active ? "bg-ink" : "bg-plaster")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{b.name}</span>
                      <span className="block truncate text-[11px] text-ash/80">
                        {b.floors.length} floors · {fmtNum(bm.totalUnits)} units
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-serif text-lg tabular-nums leading-tight text-ink">{fmtMoney(bm.grossProjectRevenue)}</span>
                      <span className={clsx("block text-[11px] tabular-nums", bm.grossMarginPct >= 0 ? "text-positive" : "text-negative")}>
                        {fmtPct(bm.grossMarginPct)} margin
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-end justify-between border-t border-plaster pt-3">
            <div>
              <p className="text-[10px] text-ash/80">Site total</p>
              <p className="text-[11px] text-ash/80">
                {site.totalFloors} floors · {fmtNum(site.totalSqFt)} sf · {fmtNum(site.totalUnits)} units
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-2xl tabular-nums leading-tight text-ink">{fmtMoney(site.grossProjectRevenue)}</p>
              <p className="text-[11px] tabular-nums text-positive">{fmtMoney(site.grossProfit)} profit</p>
            </div>
          </div>
        </Panel>
      )}

      {/* ---------------------------------------------------- Assumptions */}
      <Panel
        index={1}
        kicker={`Yield Calculator · ${building.short}`}
        icon={<Calculator size={11} />}
        title="Development Inputs"
        action={
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded-full border border-plaster px-2.5 py-1 text-[10px] text-ash transition hover:border-oak/40 hover:text-ink"
            aria-label="Reset inputs to defaults"
          >
            <RotateCcw size={11} /> Reset
          </button>
        }
      >
        <div className="space-y-5">
          <RangeSlider
            label="Total Buildable Area"
            icon={<Ruler size={12} />}
            value={inputs.totalBuildableSqFt}
            {...R.totalBuildableSqFt}
            display={`${fmtNum(inputs.totalBuildableSqFt)} sf`}
            bounds={["50k sf", "300k sf"]}
            onChange={(v) => setInput("totalBuildableSqFt", v)}
          />
          <RangeSlider
            label="Avg Sale Price / sf"
            icon={<DollarSign size={12} />}
            value={inputs.avgPricePerSqFt}
            {...R.avgPricePerSqFt}
            display={`$${fmtNum(inputs.avgPricePerSqFt)}`}
            bounds={["$800", "$2,500"]}
            onChange={(v) => setInput("avgPricePerSqFt", v)}
          />
          <RangeSlider
            label="Build Cost / sf"
            icon={<Hammer size={12} />}
            value={inputs.buildCostPerSqFt}
            {...R.buildCostPerSqFt}
            display={`$${fmtNum(inputs.buildCostPerSqFt)}`}
            bounds={["$400", "$1,200"]}
            onChange={(v) => setInput("buildCostPerSqFt", v)}
          />

          <div className="space-y-2">
            <span className="flex items-center gap-2 text-[11px] font-medium text-ash">
              <Building2 size={12} /> Unit Mix Strategy
            </span>
            <SegmentedControl
              ariaLabel="Unit mix strategy"
              layoutId="unit-mix"
              size="sm"
              value={inputs.unitMixStrategy}
              options={STRATEGY_OPTIONS}
              onChange={(v) => setInput("unitMixStrategy", v)}
            />
            <p className="text-[11px] leading-relaxed text-ash/80">{STRATEGIES[inputs.unitMixStrategy].description}</p>
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------------- KPIs */}
      <Panel index={2} kicker={`Live Output · ${building.short}`} icon={<TrendingUp size={11} />} title="Projected Yield">
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Gross Revenue" icon={<TrendingUp size={11} />} value={fmtMoney(m.grossProjectRevenue)} sub="Area × price / sf" tone="accent" />
          <Metric label="Construction" icon={<Hammer size={11} />} value={fmtMoney(m.totalConstructionCost)} sub="Area × cost / sf" tone="negative" />
          <Metric
            label="Gross Profit"
            icon={<DollarSign size={11} />}
            value={fmtMoney(m.grossProfit)}
            sub="Revenue − cost"
            tone={profitable ? "positive" : "negative"}
          />
          <Metric
            label="Gross Margin"
            icon={<Percent size={11} />}
            value={fmtPct(m.grossMarginPct)}
            sub="Profit ÷ revenue"
            tone={profitable ? "positive" : "negative"}
          />
        </div>

        {/* Programme mix — share of revenue by zone */}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-medium text-ash">Revenue by Programme</span>
            <span className="flex items-center gap-1 text-[11px] text-ash/80">
              <Home size={11} /> {fmtNum(m.totalUnits)} units
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-stone">
            {m.zones.map((z) => (
              <motion.div
                key={z.zone}
                className="h-full"
                style={{ background: z.accent }}
                animate={{ width: `${z.share * 100}%` }}
                transition={{ type: "spring", stiffness: 140, damping: 22 }}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {m.zones.map((z) => (
              <li key={z.zone}>
                <button
                  onClick={() => onFocusZone(z.zone)}
                  className="group flex w-full items-center gap-2 rounded-md py-0.5 text-left text-xs text-ash transition hover:text-ink"
                  title={`Fly to ${ZONES[z.zone].label}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.accent }} />
                  <span className="truncate">{z.label}</span>
                  <span className="ml-auto tabular-nums text-ink/80">{fmtPct(z.share * 100, 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </>
  );
}
