"use client";
/**
 * FinancialSidebar — site portfolio, pro-forma assumptions and returns.
 * -----------------------------------------------------------------------------
 *   • Site Portfolio (multi-building projects): every building's GDV and
 *     profit on cost; click one to make it active.
 *   • Assumptions for the ACTIVE building, grouped in disclosure sections:
 *     Scheme · Revenue · Costs · Financing · Sales. All sliders are Radix
 *     (arrow keys, PageUp/Down, Home/End).
 *   • Returns: GDV, TDC, profit, profit on cost, margin, IRR, equity, RLV.
 *   • Revenue by programme — click a zone to fly the camera there.
 */
import { type ReactNode } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { ChevronDown, Landmark, RotateCcw } from "lucide-react";
import type { Building, BuildingId, SiteMetrics, UnitMixStrategy, YieldInputs, YieldMetrics, ZoneId } from "@/types";
import { INPUT_RANGES, STRATEGIES, zonePrices } from "@/lib/finance";
import { ZONE_ORDER, ZONES } from "@/lib/tower";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { EASE, Metric, Panel, RangeSlider, SegmentedControl } from "./primitives";

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

const STRATEGY_OPTIONS = (Object.keys(STRATEGIES) as UnitMixStrategy[]).map((value) => ({ value, label: STRATEGIES[value].label }));

/** Collapsible assumption group (native <details>: keyboard + screen-reader friendly). */
function Group({ title, summary, open, children }: { title: string; summary: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border-t border-plaster py-3 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="flex items-center gap-2">
          <span className="caption tabular-nums">{summary}</span>
          <ChevronDown size={14} className="text-ash transition-transform duration-300 group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;

export default function FinancialSidebar({ buildings, siteName, building, inputs, metrics: m, metricsById, site, onBuildingChange, setInput, onReset, onFocusZone }: Props) {
  const R = INPUT_RANGES;
  const profitable = m.profit >= 0;
  const blended = inputs.totalBuildableSqFt > 0 ? m.gdv / inputs.totalBuildableSqFt : 0;

  const setStrategy = (s: UnitMixStrategy) => {
    setInput("unitMixStrategy", s);
    // Re-balance zone prices around the current blended price.
    setInput("pricePerSqFt", zonePrices(blended, s));
  };
  const setZonePrice = (z: ZoneId, v: number) => setInput("pricePerSqFt", { ...inputs.pricePerSqFt, [z]: v });

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
                      "flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
                      active ? "border-ink/60 bg-stone/60" : "border-plaster bg-paper hover:border-ink/30"
                    )}
                  >
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", active ? "bg-ink" : "bg-plaster")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{b.name}</span>
                      <span className="caption block truncate">
                        {b.floors.length} floors · {fmtNum(bm.totalUnits)} units
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-serif text-lg leading-tight tabular-nums text-ink">{fmtMoney(bm.gdv)}</span>
                      <span className={clsx("block text-[11px] tabular-nums", bm.profitOnCostPct >= 0 ? "text-positive" : "text-negative")}>
                        {pct(bm.profitOnCostPct)} on cost
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-end justify-between border-t border-plaster pt-3">
            <div>
              <p className="caption">Site total</p>
              <p className="caption">
                {site.totalFloors} floors · {fmtNum(site.totalSqFt)} sf · {fmtNum(site.totalUnits)} units
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-2xl leading-tight tabular-nums text-ink">{fmtMoney(site.gdv)}</p>
              <p className={clsx("text-[11px] tabular-nums", site.profit >= 0 ? "text-positive" : "text-negative")}>
                {fmtMoney(site.profit)} profit · {pct(site.profitOnCostPct)} on cost
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* ---------------------------------------------------- Assumptions */}
      <Panel
        index={1}
        kicker={`Pro forma · ${building.short}`}
        title="Assumptions"
        action={
          <button onClick={onReset} className="btn-ghost border border-plaster" aria-label="Reset assumptions to project defaults">
            <RotateCcw size={12} aria-hidden /> Reset
          </button>
        }
      >
        <Group title="Scheme" summary={`${fmtNum(inputs.totalBuildableSqFt)} sf`} open>
          <RangeSlider
            label="Total buildable area"
            value={inputs.totalBuildableSqFt}
            {...R.totalBuildableSqFt}
            display={`${fmtNum(inputs.totalBuildableSqFt)} sf`}
            onChange={(v) => setInput("totalBuildableSqFt", v)}
          />
          <div className="space-y-1.5">
            <span className="text-xs text-ash">Unit mix</span>
            <SegmentedControl ariaLabel="Unit mix strategy" layoutId={`mix-${building.id}`} size="sm" value={inputs.unitMixStrategy} options={STRATEGY_OPTIONS} onChange={setStrategy} />
            <p className="caption">{STRATEGIES[inputs.unitMixStrategy].description}</p>
          </div>
        </Group>

        <Group title="Revenue" summary={`$${fmtNum(blended)}/sf blended`} open>
          {ZONE_ORDER.map((z) => (
            <RangeSlider
              key={z}
              compact
              label={`${ZONES[z].short} price / sf`}
              icon={<span className="h-1.5 w-1.5 rounded-full" style={{ background: ZONES[z].accent }} aria-hidden />}
              value={inputs.pricePerSqFt[z]}
              {...R.price}
              display={`$${fmtNum(inputs.pricePerSqFt[z])}`}
              onChange={(v) => setZonePrice(z, v)}
            />
          ))}
          <RangeSlider
            compact
            label="Absorption"
            value={inputs.absorptionUnitsPerMonth}
            {...R.absorptionUnitsPerMonth}
            display={`${inputs.absorptionUnitsPerMonth} units / mo`}
            onChange={(v) => setInput("absorptionUnitsPerMonth", v)}
          />
        </Group>

        <Group title="Costs" summary={fmtMoney(m.landCost + m.hardCost + m.softCost + m.contingency)}>
          <RangeSlider compact label="Land cost" value={inputs.landCost} {...R.landCost} display={fmtMoney(inputs.landCost)} onChange={(v) => setInput("landCost", v)} />
          <RangeSlider
            compact
            label="Hard cost / sf"
            value={inputs.hardCostPerSqFt}
            {...R.hardCostPerSqFt}
            display={`$${fmtNum(inputs.hardCostPerSqFt)}`}
            onChange={(v) => setInput("hardCostPerSqFt", v)}
          />
          <RangeSlider compact label="Soft costs (% of hard)" value={inputs.softCostPct} {...R.softCostPct} display={pct(inputs.softCostPct)} onChange={(v) => setInput("softCostPct", v)} />
          <RangeSlider compact label="Contingency" value={inputs.contingencyPct} {...R.contingencyPct} display={pct(inputs.contingencyPct)} onChange={(v) => setInput("contingencyPct", v)} />
        </Group>

        <Group title="Financing" summary={`${inputs.ltcPct}% LTC · ${inputs.interestRatePct}%`}>
          <RangeSlider compact label="Loan to cost" value={inputs.ltcPct} {...R.ltcPct} display={pct(inputs.ltcPct, 0)} onChange={(v) => setInput("ltcPct", v)} />
          <RangeSlider compact label="Interest rate" value={inputs.interestRatePct} {...R.interestRatePct} display={pct(inputs.interestRatePct, 2)} onChange={(v) => setInput("interestRatePct", v)} />
          <RangeSlider compact label="Build term" value={inputs.termMonths} {...R.termMonths} display={`${inputs.termMonths} months`} onChange={(v) => setInput("termMonths", v)} />
        </Group>

        <Group title="Sales" summary={`${pct(inputs.salesCommissionPct, 2)} + ${pct(inputs.auraFeePct, 0)} AURA`}>
          <RangeSlider
            compact
            label="Sales commission"
            value={inputs.salesCommissionPct}
            {...R.salesCommissionPct}
            display={pct(inputs.salesCommissionPct, 2)}
            onChange={(v) => setInput("salesCommissionPct", v)}
          />
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ash">AURA success fee</span>
            <span className="tabular-nums text-ink">{pct(inputs.auraFeePct, 0)} of sales</span>
          </div>
          <RangeSlider
            compact
            label="Target profit on cost (for RLV)"
            value={inputs.targetProfitOnCostPct}
            {...R.targetProfitOnCostPct}
            display={pct(inputs.targetProfitOnCostPct)}
            onChange={(v) => setInput("targetProfitOnCostPct", v)}
          />
        </Group>
      </Panel>

      {/* ---------------------------------------------------- Returns */}
      <Panel index={2} kicker={`Returns · ${building.short}`} title="Development Appraisal">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="GDV" value={fmtMoney(m.gdv)} sub={`${fmtNum(m.totalUnits)} units`} />
          <Metric label="Total dev. cost" value={fmtMoney(m.totalDevelopmentCost)} sub={`incl. ${fmtMoney(m.financeCost)} finance`} />
          <Metric label="Profit" value={fmtMoney(m.profit)} tone={profitable ? "positive" : "negative"} sub="GDV − TDC" />
          <Metric label="Profit on cost" value={pct(m.profitOnCostPct)} tone={profitable ? "positive" : "negative"} sub={`${pct(m.marginOnGdvPct)} margin on GDV`} />
          <Metric label="Equity IRR" value={m.irrPct === null ? "—" : pct(m.irrPct)} tone="accent" sub={`${m.equityMultiple.toFixed(2)}× equity multiple`} />
          <Metric label="Equity required" value={fmtMoney(m.equityRequired)} sub={`peak debt ${fmtMoney(m.peakDebt)}`} />
        </div>
        <div className="mt-2 flex items-baseline justify-between border border-plaster bg-stone/40 px-3.5 py-3">
          <span className="caption">Residual land value at {pct(inputs.targetProfitOnCostPct, 0)} on cost</span>
          <span className={clsx("font-serif text-xl tabular-nums", m.residualLandValue >= inputs.landCost ? "text-positive" : "text-negative")}>{fmtMoney(m.residualLandValue)}</span>
        </div>
        <p className="caption mt-2">
          {m.durationMonths} months land-to-last-closing · land paid {m.residualLandValue >= inputs.landCost ? "below" : "above"} residual value
        </p>

        {/* Revenue by programme */}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs text-ash">Revenue by programme</span>
          </div>
          <div className="flex h-2 w-full overflow-hidden bg-stone">
            {m.zones.map((z) => (
              <motion.div key={z.zone} className="h-full" style={{ background: z.accent }} animate={{ width: `${z.share * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
            {m.zones.map((z) => (
              <li key={z.zone}>
                <button
                  onClick={() => onFocusZone(z.zone)}
                  className="flex w-full items-center gap-2 py-0.5 text-left text-xs text-ash transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40"
                  title={`Fly to ${ZONES[z.zone].label}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.accent }} aria-hidden />
                  <span className="truncate">{z.label}</span>
                  <span className="ml-auto tabular-nums text-ink">{fmtPct(z.share * 100, 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </>
  );
}
