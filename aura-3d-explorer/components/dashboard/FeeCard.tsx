"use client";
/**
 * 1% Success-Fee calculator.
 * The platform only earns 1% of revenue on units that actually SELL,
 * so its upside is aligned with the developer's. Optional comparison
 * against a traditional flat brokerage model.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { BadgePercent, Handshake } from "lucide-react";
import { useAura } from "@/lib/store";
import { fmtMoney, fmtPct, INPUT_RANGES, SUCCESS_FEE_RATE } from "@/lib/finance";
import Card from "@/components/ui/Card";
import Slider from "@/components/ui/Slider";
import Switch from "@/components/ui/Switch";

const TRADITIONAL_RATE = 0.05; // typical new-development sales & marketing load

export default function FeeCard() {
  const { inputs, setInput, yieldResult: y } = useAura();
  const [compare, setCompare] = useState(true);

  const soldUnits = Math.round(y.totalUnits * (inputs.soldPct / 100));
  const traditionalFee = y.soldRevenue * TRADITIONAL_RATE;
  const savings = traditionalFee - y.platformFee;

  // Stacked bar segments (share of sold revenue)
  const base = Math.max(y.soldRevenue, 1);
  const costShare = Math.min(1, y.constructionCost / base);
  const feeShare = Math.min(1 - costShare, y.platformFee / base);
  const netShare = Math.max(0, 1 - costShare - feeShare);

  return (
    <Card
      eyebrow="Aligned Incentives"
      title="1% Success Fee"
      action={
        <span className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
          <BadgePercent size={12} /> {fmtPct(SUCCESS_FEE_RATE * 100, 0)} on sold
        </span>
      }
    >
      <Slider
        label="Units Sold (absorption)"
        icon={<Handshake size={12} />}
        value={inputs.soldPct}
        {...INPUT_RANGES.soldPct}
        display={`${inputs.soldPct}% · ${soldUnits} units`}
        onChange={(v) => setInput("soldPct", v)}
        hint="The fee applies only to revenue from units that actually close."
      />

      {/* Stacked distribution bar */}
      <div className="mt-5">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-obsidian-500">
          <motion.div className="h-full bg-[#4a5263]" animate={{ width: `${costShare * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
          <motion.div className="h-full bg-white" animate={{ width: `${Math.max(feeShare * 100, feeShare > 0 ? 0.8 : 0)}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
          <motion.div className="h-full bg-gradient-to-r from-gold-dim to-gold" animate={{ width: `${netShare * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.12em] text-mist">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#4a5263]" />Build cost</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-white" />AURA fee</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-gold" />Developer net</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/[0.06] bg-obsidian-700/60 p-3.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-mist">Platform fee (1%)</div>
          <div className="font-serif text-[22px] tabular-nums text-white">{fmtMoney(y.platformFee)}</div>
          <div className="text-[11px] text-mist/70">on {fmtMoney(y.soldRevenue)} sold</div>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-3.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-mist">Developer net</div>
          <div className={`font-serif text-[22px] tabular-nums ${y.developerNet >= 0 ? "text-gold" : "text-red-400"}`}>{fmtMoney(y.developerNet)}</div>
          <div className="text-[11px] text-mist/70">after cost & fee</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] px-3.5 py-3">
        <span className="text-xs text-white/90">Compare vs. traditional 5% sales load</span>
        <Switch checked={compare} onChange={setCompare} label="Compare with traditional fees" />
      </div>
      {compare && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
          <div className="mt-3 flex items-end justify-between rounded-xl bg-gradient-to-br from-gold/15 to-transparent p-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-mist">Traditional fee</div>
              <div className="text-sm tabular-nums text-white/60 line-through decoration-gold/60">{fmtMoney(traditionalFee)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.14em] text-gold">Retained by developer</div>
              <div className="font-serif text-2xl tabular-nums text-gold">+{fmtMoney(savings)}</div>
            </div>
          </div>
        </motion.div>
      )}
    </Card>
  );
}
