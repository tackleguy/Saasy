"use client";
/**
 * FinancialChart — Recharts breakdown of the pro forma.
 * -----------------------------------------------------------------------------
 * Two views:
 *   • "Pro Forma"  — Revenue vs. Construction Cost vs. Platform Fee vs.
 *                    Developer Net (handles loss-making schemes: negative bars
 *                    drop below the zero line in rose).
 *   • "Programme"  — revenue attributed to each zone under the chosen mix.
 */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import type { YieldMetrics } from "@/types";
import { fmtMoney } from "@/lib/format";
import { GlassCard, SegmentedControl } from "./primitives";

type ChartView = "proforma" | "programme";

interface Datum {
  name: string;
  value: number;
  color: string;
  note: string;
}

const AXIS_TICK = { fill: "#64748b", fontSize: 10 };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-card rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="flex items-center gap-2 text-white">
        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
        {d.name}
      </div>
      <div className="mt-0.5 font-serif text-base tabular-nums text-white">{fmtMoney(d.value, false)}</div>
      <div className="text-slate-500">{d.note}</div>
    </div>
  );
}

export default function FinancialChart({ metrics: m, buildingName }: { metrics: YieldMetrics; buildingName: string }) {
  const [view, setView] = useState<ChartView>("proforma");

  const proforma: Datum[] = [
    { name: "Revenue", value: m.grossProjectRevenue, color: "#d4af37", note: "Gross project revenue" },
    { name: "Build Cost", value: m.totalConstructionCost, color: "#f43f5e", note: "Total construction cost" },
    { name: "1% Fee", value: m.platformSuccessFee, color: "#f3e5ab", note: "Platform success fee" },
    {
      name: "Dev. Net",
      value: m.developerNetRevenue,
      color: m.developerNetRevenue >= 0 ? "#10b981" : "#f43f5e",
      note: "Revenue × 0.99 − cost",
    },
  ];

  const programme: Datum[] = m.zones.map((z) => ({
    name: z.label,
    value: z.revenue,
    color: z.accent,
    note: `${z.floorCount} floor${z.floorCount > 1 ? "s" : ""} · ${Math.round(z.share * 100)}% of revenue`,
  }));

  const data = view === "proforma" ? proforma : programme;

  return (
    <GlassCard
      index={3}
      eyebrow={`Breakdown · ${buildingName}`}
      icon={<BarChart3 size={11} />}
      title="Cost vs. Revenue"
      action={
        <div className="w-[176px]">
          <SegmentedControl
            ariaLabel="Chart view"
            layoutId="chart-view"
            size="sm"
            value={view}
            options={[
              { value: "proforma", label: "Pro Forma" },
              { value: "programme", label: "Programme" },
            ]}
            onChange={setView}
          />
        </div>
      }
    >
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => fmtMoney(v)} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            <Tooltip cursor={{ fill: "rgba(212,175,55,0.06)" }} content={<ChartTooltip />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={500}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} fillOpacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.name}
          </span>
        ))}
      </div>
    </GlassCard>
  );
}
