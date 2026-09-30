"use client";
/**
 * Right-hand sidebar: financial inputs, live KPIs, floor-by-floor yield chart,
 * zone breakdown and the 1% success-fee card.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, DollarSign, Hammer, Layers, Percent, TrendingUp, Home } from "lucide-react";
import { useAura } from "@/lib/store";
import { ZONES } from "@/lib/building";
import { fmtMoney, fmtNum, fmtPct, INPUT_RANGES } from "@/lib/finance";
import Card from "@/components/ui/Card";
import Slider from "@/components/ui/Slider";
import FeeCard from "./FeeCard";

/* Animated number: re-mounts & fades when the value string changes */
function Live({ v, className }: { v: string; className?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={v}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className={className}
      >
        {v}
      </motion.span>
    </AnimatePresence>
  );
}

function Kpi({ label, value, icon, accent, sub }: { label: string; value: string; icon: React.ReactNode; accent?: boolean; sub?: string }) {
  return (
    <div className={`rounded-xl border p-3.5 ${accent ? "border-gold/30 bg-gold/[0.06]" : "border-white/[0.06] bg-obsidian-700/60"}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-mist">
        {icon}
        {label}
      </div>
      <div className={`font-serif text-[22px] leading-tight tabular-nums ${accent ? "text-gold" : "text-white"}`}>
        <Live v={value} />
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-mist/70">{sub}</div>}
    </div>
  );
}

export default function YieldDashboard() {
  const { inputs, setInput, yieldResult: y, selected, setSelected, hovered, setHovered } = useAura();
  const R = INPUT_RANGES;

  // Chart data top floor first so it reads like a section through the tower
  const chartData = [...y.floors].reverse().map((f) => ({ ...f, name: f.label }));

  return (
    <div className="space-y-4">
      {/* ---------------- Inputs */}
      <Card eyebrow="Assumptions" title="Development Inputs">
        <div className="space-y-5">
          <Slider
            label="Total Buildable Area"
            icon={<Layers size={12} />}
            value={inputs.totalSqft}
            {...R.totalSqft}
            display={`${fmtNum(inputs.totalSqft)} sf`}
            onChange={(v) => setInput("totalSqft", v)}
          />
          <Slider
            label="Target Sale Price / sf"
            icon={<DollarSign size={12} />}
            value={inputs.pricePerSqft}
            {...R.pricePerSqft}
            display={`$${fmtNum(inputs.pricePerSqft)}`}
            onChange={(v) => setInput("pricePerSqft", v)}
          />
          <Slider
            label="Build Cost / sf"
            icon={<Hammer size={12} />}
            value={inputs.costPerSqft}
            {...R.costPerSqft}
            display={`$${fmtNum(inputs.costPerSqft)}`}
            onChange={(v) => setInput("costPerSqft", v)}
          />
        </div>
      </Card>

      {/* ---------------- KPIs */}
      <Card eyebrow="Live Output" title="Projected Yield">
        <div className="grid grid-cols-2 gap-2.5">
          <Kpi label="Gross Revenue" icon={<TrendingUp size={11} />} value={fmtMoney(y.grossRevenue)} sub="Area × Price / sf" />
          <Kpi label="Construction" icon={<Hammer size={11} />} value={fmtMoney(y.constructionCost)} sub="Area × Cost / sf" />
          <Kpi label="Net Profit" icon={<DollarSign size={11} />} value={fmtMoney(y.netProfit)} accent />
          <Kpi label="Net Margin" icon={<Percent size={11} />} value={fmtPct(y.marginPct)} sub={`ROI ${fmtPct(y.roiPct)}`} accent />
          <Kpi label="Total Units" icon={<Home size={11} />} value={fmtNum(y.totalUnits)} sub={`across ${y.floors.length} floors`} />
          <Kpi label="Blended Yield" icon={<Building2 size={11} />} value={fmtMoney(y.grossRevenue / y.floors.length)} sub="avg revenue / floor" />
        </div>
      </Card>

      {/* ---------------- Floor chart */}
      <Card eyebrow="Section" title="Floor-by-Floor Revenue">
        <p className="-mt-2 mb-3 text-xs text-mist">Click a bar to fly the camera to that floor.</p>
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: -8, right: 8, top: 0, bottom: 0 }} barCategoryGap={3}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={42} tick={{ fill: "#9aa3b2", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
              <Tooltip
                cursor={{ fill: "rgba(212,175,55,0.06)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const f = payload[0].payload as (typeof chartData)[number];
                  return (
                    <div className="rounded-lg border border-white/10 bg-obsidian-700 px-3 py-2 text-xs shadow-xl">
                      <div className="font-serif text-sm text-white">
                        {f.label} · {ZONES[f.zone].short}
                      </div>
                      <div className="text-mist">{fmtNum(f.sqft)} sf · {f.units} {ZONES[f.zone].unitNoun}</div>
                      <div className="text-gold">{fmtMoney(f.revenue)}</div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="revenue"
                radius={[0, 3, 3, 0]}
                isAnimationActive={false}
                onClick={(d: unknown) => {
                  const idx = (d as { index?: number; payload?: { index: number } }).payload?.index;
                  if (typeof idx === "number") setSelected(selected === idx ? null : idx);
                }}
                onMouseEnter={(d: unknown) => setHovered((d as { payload?: { index: number } }).payload?.index ?? null)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                {chartData.map((f) => {
                  const active = selected === f.index || hovered === f.index;
                  const dim = selected !== null && selected !== f.index;
                  return <Cell key={f.index} fill={active ? "#d4af37" : ZONES[f.zone].color} fillOpacity={dim ? 0.25 : 0.85} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Zone summary table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-xs">
            <thead className="bg-obsidian-700/70 text-[10px] uppercase tracking-[0.12em] text-mist">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Zone</th>
                <th className="px-2 py-2 text-right font-medium">Fl.</th>
                <th className="px-2 py-2 text-right font-medium">Area</th>
                <th className="px-2 py-2 text-right font-medium">Units</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {[...y.zones].reverse().map((z) => (
                <tr key={z.zone} className="border-t border-white/[0.04] text-white/90">
                  <td className="px-3 py-2">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: z.color }} />
                    {z.label}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-mist">{z.floors}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtNum(z.sqft / 1000)}k</td>
                  <td className="px-2 py-2 text-right tabular-nums">{z.units}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gold">{fmtMoney(z.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------------- 1% fee */}
      <FeeCard />
    </div>
  );
}
