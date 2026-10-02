"use client";
/**
 * CommissionModelCard — the 1% performance-fee simulator.
 * -----------------------------------------------------------------------------
 *   AURA fee       = GDV × 1%
 *   Traditional    = GDV × load % (2 – 6%, default 5%) instead of the AURA fee
 *   Kept by developer = traditional fee − AURA fee (added straight to profit)
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Handshake } from "lucide-react";
import type { SiteMetrics, YieldMetrics } from "@/types";
import { TRADITIONAL_LOAD_RATE } from "@/lib/finance";
import { fmtMoney, fmtPct } from "@/lib/format";
import { AnimatedValue, EASE, Panel, RangeSlider } from "./primitives";

interface Props {
  metrics: YieldMetrics;
  site: SiteMetrics;
  buildingName: string;
}

export default function CommissionModelCard({ metrics: m, site, buildingName }: Props) {
  const [traditionalPct, setTraditionalPct] = useState(TRADITIONAL_LOAD_RATE * 100);

  const traditionalFee = m.gdv * (traditionalPct / 100);
  const kept = traditionalFee - m.platformFee;
  const traditionalProfit = m.profit + m.platformFee - traditionalFee;
  const loss = m.profit < 0;

  // Distribution of GDV: costs (excl. fee) | AURA fee | profit
  const base = Math.max(m.gdv, 1);
  const costShare = Math.min(1, (m.totalDevelopmentCost - m.platformFee) / base);
  const feeShare = Math.min(1 - costShare, m.platformFee / base);
  const profitShare = Math.max(0, 1 - costShare - feeShare);
  const tween = { duration: 0.5, ease: EASE };

  return (
    <Panel index={5} kicker={`Aligned incentives · ${buildingName}`} icon={<Handshake size={11} aria-hidden />} title="1% Success Fee">
      <p className="-mt-1 mb-4 text-xs leading-relaxed text-ash">AURA earns only when the scheme sells — 1% of sales, no retainer, no licence.</p>

      <div className="flex h-2.5 w-full overflow-hidden bg-stone" aria-hidden>
        <motion.div className="h-full bg-ash/60" animate={{ width: `${costShare * 100}%` }} transition={tween} />
        <motion.div className="h-full bg-brass" animate={{ width: `${Math.max(feeShare * 100, feeShare > 0 ? 1 : 0)}%` }} transition={tween} />
        <motion.div className="h-full bg-positive" animate={{ width: `${profitShare * 100}%` }} transition={tween} />
      </div>
      <div className="caption mt-2 flex justify-between">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 bg-ash/60" />
          Costs
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 bg-brass" />
          AURA fee
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 bg-positive" />
          Profit
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="border border-plaster bg-stone/40 p-3.5">
          <div className="caption">AURA fee</div>
          <div className="font-serif text-[24px] leading-tight tabular-nums text-ink">
            <AnimatedValue value={fmtMoney(m.platformFee)} />
          </div>
          <div className="caption">GDV × 1%</div>
        </div>
        <div className="border border-plaster bg-stone/40 p-3.5">
          <div className="caption">Developer profit</div>
          <div className="font-serif text-[24px] leading-tight tabular-nums">
            <AnimatedValue value={fmtMoney(m.profit)} className={loss ? "text-negative" : "text-positive"} />
          </div>
          <div className="caption">after all costs and fee</div>
        </div>
      </div>

      <div className="mt-4 border border-plaster p-4">
        <RangeSlider compact label="Traditional sales load" value={traditionalPct} min={2} max={6} step={0.25} display={fmtPct(traditionalPct, 2)} onChange={setTraditionalPct} />
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="caption">Traditional fee / profit</div>
            <div className="text-sm tabular-nums text-ash line-through decoration-negative/60">{fmtMoney(traditionalFee)}</div>
            <div className="caption tabular-nums">profit {fmtMoney(traditionalProfit)}</div>
          </div>
          <div className="text-right">
            <div className="caption">Kept by the developer</div>
            <div className="font-serif text-[26px] leading-tight tabular-nums text-oak">
              <AnimatedValue value={`+${fmtMoney(kept)}`} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-plaster pt-3 text-xs">
        <span className="text-ash">Site-wide AURA fee · all buildings</span>
        <span className="font-serif text-base tabular-nums text-ink">{fmtMoney(site.platformFee)}</span>
      </div>
    </Panel>
  );
}
