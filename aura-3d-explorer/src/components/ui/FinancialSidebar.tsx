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
import { INPUT_RANGES, STRATEGIES } from "@/hooks/useYieldCalculator";
import { SITE, ZONES } from "@/lib/tower";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { GlassCard, Metric, RangeSlider, SegmentedControl } from "./primitives";

interface Props {
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

export default function FinancialSidebar({ building, inputs, metrics: m, metricsById, site, onBuildingChange, setInput, onReset, onFocusZone }: Props) {
  const R = INPUT_RANGES;
  const profitable = m.grossProfit >= 0;

  return (
    <>
      {/* ---------------------------------------------------- Site */}
      <GlassCard index={0} eyebrow="The Meridian Quarter" icon={<Landmark size={11} />} title="Site Portfolio">
        <ul className="space-y-1.5">
          {SITE.map((b) => {
            const bm = metricsById[b.id];
            const active = b.id === building.id;
            return (
              <li key={b.id}>
                <button
                  onClick={() => onBuildingChange(b.id)}
                  aria-pressed={active}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                    active ? "border-gold/40 bg-gold/[0.07]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"
                  )}
                >
                  <span className={clsx("h-2 w-2 shrink-0 rounded-full", active ? "bg-gold" : "bg-slate-600")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{b.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {b.floors.length} floors · {fmtNum(bm.totalUnits)} units
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-serif text-lg tabular-nums leading-tight text-white">{fmtMoney(bm.grossProjectRevenue)}</span>
                    <span className={clsx("block text-[11px] tabular-nums", bm.grossMarginPct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {fmtPct(bm.grossMarginPct)} margin
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-end justify-between border-t border-white/[0.06] pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Site total</p>
            <p className="text-[11px] text-slate-500">
              {site.totalFloors} floors · {fmtNum(site.totalSqFt)} sf · {fmtNum(site.totalUnits)} units
            </p>
          </div>
          <div className="text-right">
            <p className="font-serif text-2xl tabular-nums leading-tight text-gold-metal">{fmtMoney(site.grossProjectRevenue)}</p>
            <p className="text-[11px] tabular-nums text-emerald-400">{fmtMoney(site.grossProfit)} profit</p>
          </div>
        </div>
      </GlassCard>

      {/* ---------------------------------------------------- Assumptions */}
      <GlassCard
        index={1}
        eyebrow={`Yield Calculator · ${building.short}`}
        icon={<Calculator size={11} />}
        title="Development Inputs"
        action={
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-gold/40 hover:text-white"
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
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
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
            <p className="text-[11px] leading-relaxed text-slate-500">{STRATEGIES[inputs.unitMixStrategy].description}</p>
          </div>
        </div>
      </GlassCard>

      {/* ---------------------------------------------------- KPIs */}
      <GlassCard index={2} eyebrow={`Live Output · ${building.short}`} icon={<TrendingUp size={11} />} title="Projected Yield">
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Gross Revenue" icon={<TrendingUp size={11} />} value={fmtMoney(m.grossProjectRevenue)} sub="Area × price / sf" tone="gold" />
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
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Revenue by Programme</span>
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <Home size={11} /> {fmtNum(m.totalUnits)} units
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
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
                  className="group flex w-full items-center gap-2 rounded-md py-0.5 text-left text-xs text-slate-400 transition hover:text-white"
                  title={`Fly to ${ZONES[z.zone].label}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.accent }} />
                  <span className="truncate">{z.label}</span>
                  <span className="ml-auto tabular-nums text-white/80">{fmtPct(z.share * 100, 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </GlassCard>
    </>
  );
}
