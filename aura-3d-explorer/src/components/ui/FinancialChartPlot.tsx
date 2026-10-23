"use client";
/** The Recharts plot inside FinancialChart, split out so Recharts loads on demand. */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney } from "@/lib/format";

export type ChartView = "stack" | "cashflow" | "programme";

export interface Datum {
  name: string;
  value: number;
  color: string;
}

const AXIS_TICK = { fill: "rgb(110 106 99)", fontSize: 10 };
const GRID = "rgba(28,27,25,0.08)";

function TooltipBox({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div className="panel px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 text-ink">{title}</p>
      {rows.map(([k, v, c]) => (
        <p key={k} className="flex items-center gap-2 tabular-nums text-ash">
          {c && <span className="h-2 w-2" style={{ background: c }} />}
          {k} <span className="ml-auto pl-3 text-ink">{v}</span>
        </p>
      ))}
    </div>
  );
}

export default function FinancialChartPlot({ view, cash, bars, gdv }: { view: ChartView; cash: { month: number; equity: number; debt: number }[]; bars: Datum[]; gdv: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {view === "cashflow" ? (
        <AreaChart data={cash} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `M${v}`} minTickGap={24} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} tickFormatter={(v: number) => fmtMoney(v)} />
          <ReferenceLine y={0} stroke="rgba(28,27,25,0.3)" />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={`Month ${label}`}
                  rows={[
                    ["Equity position", fmtMoney(Number(payload[0]?.value ?? 0)), "#9C7A52"],
                    ["Debt outstanding", fmtMoney(-Number(payload[1]?.value ?? 0)), "#8E9E86"],
                  ]}
                />
              ) : null
            }
          />
          <Area type="monotone" dataKey="equity" stroke="#9C7A52" fill="#9C7A52" fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} />
          <Area type="monotone" dataKey="debt" stroke="#8E9E86" fill="#8E9E86" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      ) : (
        <BarChart data={bars} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} tickFormatter={(v: number) => fmtMoney(v)} />
          <ReferenceLine y={0} stroke="rgba(28,27,25,0.3)" />
          <Tooltip
            cursor={{ fill: "rgba(28,27,25,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as Datum;
              return (
                <TooltipBox
                  title={d.name}
                  rows={[
                    ["Amount", fmtMoney(d.value, false), d.color],
                    ["Share of GDV", `${((d.value / (gdv || 1)) * 100).toFixed(1)}%`],
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" animationDuration={500}>
            {bars.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
