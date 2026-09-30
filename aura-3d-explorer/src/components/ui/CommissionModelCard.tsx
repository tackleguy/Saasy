"use client";
/**
 * CommissionModelCard — the 1% performance-fee simulator.
 * -----------------------------------------------------------------------------
 *   Platform 1% Success Fee   = Gross Project Revenue × 0.01
 *   Developer Net (after fee) = Gross Project Revenue × 0.99 − Construction Cost
 *
 * A comparison slider models a traditional sales & marketing load (2 – 6%)
 * so the developer can see how much more of the upside they keep.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { BadgePercent, Handshake, Scale } from "lucide-react";
import type { SiteMetrics, YieldMetrics } from "@/types";
import { PLATFORM_FEE_RATE } from "@/lib/finance";
import { fmtMoney, fmtPct } from "@/lib/format";
import { AnimatedValue, Panel, RangeSlider } from "./primitives";

const SPRING = { type: "spring", stiffness: 140, damping: 22 } as const;

interface Props {
  metrics: YieldMetrics;
  site: SiteMetrics;
  buildingName: string;
}

export default function CommissionModelCard({ metrics: m, site, buildingName }: Props) {
  /** Traditional brokerage / sales-load rate, in percent. */
  const [traditionalPct, setTraditionalPct] = useState(5);

  const revenue = m.grossProjectRevenue;
  const traditionalFee = revenue * (traditionalPct / 100);
  const traditionalNet = revenue - traditionalFee - m.totalConstructionCost;
  const retained = traditionalFee - m.platformSuccessFee;

  // Stacked distribution of revenue: cost | fee | developer net (clamped for loss cases)
  const base = Math.max(revenue, 1);
  const costShare = Math.min(1, m.totalConstructionCost / base);
  const feeShare = Math.min(1 - costShare, m.platformSuccessFee / base);
  const netShare = Math.max(0, 1 - costShare - feeShare);
  const loss = m.developerNetRevenue < 0;

  return (
    <Panel
      index={4}
      kicker={`Aligned Incentives · ${buildingName}`}
      icon={<Handshake size={11} />}
      title="1% Performance Fee"
      action={
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-oak/40 bg-oak/10 px-2.5 py-1 text-[10px] font-semibold text-oak">
          <BadgePercent size={12} /> {fmtPct(PLATFORM_FEE_RATE * 100, 0)} of GDV
        </span>
      }
    >
      <p className="-mt-1 mb-4 text-xs leading-relaxed text-ash">
        AURA earns only when the scheme sells — a flat 1% success fee on gross project revenue, with no retainers.
      </p>

      {/* Stacked distribution bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone">
        <motion.div className="h-full bg-negative/70" animate={{ width: `${costShare * 100}%` }} transition={SPRING} />
        <motion.div className="h-full bg-brass" animate={{ width: `${Math.max(feeShare * 100, feeShare > 0 ? 1 : 0)}%` }} transition={SPRING} />
        <motion.div className="h-full bg-positive" animate={{ width: `${netShare * 100}%` }} transition={SPRING} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ash/80">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-negative/70" />Build cost</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brass" />1% fee</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-positive" />Developer net</span>
      </div>

      {/* Fee + net tiles */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <div className="rounded-[3px] border border-oak/30 bg-oak/[0.06] p-3.5">
          <div className="text-[10px] text-ash">Platform fee</div>
          <div className="font-serif text-[24px] tabular-nums leading-tight">
            <AnimatedValue value={fmtMoney(m.platformSuccessFee)} className="text-ink" />
          </div>
          <div className="text-[11px] text-ash/80">GDV × 0.01</div>
        </div>
        <div className={`rounded-[3px] border p-3.5 ${loss ? "border-negative/30 bg-negative/10" : "border-positive/30 bg-positive/10"}`}>
          <div className="text-[10px] text-ash">Developer net</div>
          <div className="font-serif text-[24px] tabular-nums leading-tight">
            <AnimatedValue value={fmtMoney(m.developerNetRevenue)} className={loss ? "text-negative" : "text-positive"} />
          </div>
          <div className="text-[11px] text-ash/80">GDV × 0.99 − cost</div>
        </div>
      </div>

      {/* Traditional comparison */}
      <div className="mt-5 rounded-[3px] border border-plaster bg-stone/40 p-4">
        <RangeSlider
          compact
          label="Traditional sales load"
          icon={<Scale size={12} />}
          value={traditionalPct}
          min={2}
          max={6}
          step={0.25}
          display={fmtPct(traditionalPct, 2)}
          onChange={setTraditionalPct}
        />
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] text-ash/80">Traditional fee / net</div>
            <div className="text-sm tabular-nums text-ink/60 line-through decoration-negative/60">{fmtMoney(traditionalFee)}</div>
            <div className="text-[11px] tabular-nums text-ash/80">net {fmtMoney(traditionalNet)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-oak">Retained with AURA</div>
            <div className="font-serif text-[26px] tabular-nums leading-tight">
              <AnimatedValue value={`+${fmtMoney(retained)}`} className="text-ink" />
            </div>
          </div>
        </div>
      </div>

      {/* Site-wide fee */}
      <div className="mt-3 flex items-center justify-between rounded-[3px] border border-plaster px-4 py-2.5 text-xs">
        <span className="text-ash">Site-wide 1% fee · all buildings</span>
        <span className="font-serif text-base tabular-nums text-ink">{fmtMoney(site.platformSuccessFee)}</span>
      </div>
    </Panel>
  );
}
