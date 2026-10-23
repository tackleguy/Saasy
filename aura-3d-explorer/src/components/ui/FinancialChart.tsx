"use client";
/**
 * FinancialChart — Recharts views of the pro forma.
 *   • Costs — land, hard, soft, contingency, finance, sales & AURA fee and
 *     profit, which together add up to GDV.
 *   • Cash flow — monthly cumulative equity position and outstanding debt
 *     (the classic J-curve: equity goes in, debt peaks, sales pay it back).
 *   • Zones — GDV attributed to each programme zone.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import type { YieldMetrics } from "@/types";
import { fmtMoney } from "@/lib/format";
import { Panel, SegmentedControl } from "./primitives";
import type { ChartView as View, Datum } from "./FinancialChartPlot";

// Recharts loads with the chart, not with the page; the fixed-height box keeps the layout still.
const FinancialChartPlot = dynamic(() => import("./FinancialChartPlot"), { ssr: false, loading: () => <div className="h-full w-full bg-stone/40" aria-hidden /> });

export default function FinancialChart({ metrics: m, buildingName }: { metrics: YieldMetrics; buildingName: string }) {
  const [view, setView] = useState<View>("stack");

  const stack: Datum[] = [
    { name: "Land", value: m.landCost, color: "#B89A5C" },
    { name: "Hard", value: m.hardCost, color: "#9C7A52" },
    { name: "Soft", value: m.softCost, color: "#b8a88f" },
    { name: "Cont.", value: m.contingency, color: "#cfc3ae" },
    { name: "Finance", value: m.financeCost, color: "#8E9E86" },
    { name: "Sales", value: m.salesCommission + m.platformFee, color: "#6E6A63" },
    { name: "Profit", value: m.profit, color: m.profit >= 0 ? "rgb(74 120 88)" : "rgb(170 78 62)" },
  ];
  const programme: Datum[] = m.zones.map((z) => ({ name: z.label, value: z.revenue, color: z.accent }));
  const cash = m.cashflow.map((c) => ({ month: c.month, equity: c.equityPosition, debt: -c.debt }));
  const bars = view === "stack" ? stack : programme;

  return (
    <Panel
      index={3}
      kicker={`Breakdown · ${buildingName}`}
      title="Cost, Cash & Value"
      action={
        <div className="w-[200px]">
          <SegmentedControl
            ariaLabel="Chart view"
            layoutId={`chart-${buildingName}`}
            size="sm"
            value={view}
            options={[
              { value: "stack", label: "Costs" },
              { value: "cashflow", label: "Cash flow" },
              { value: "programme", label: "Zones" },
            ]}
            onChange={setView}
          />
        </div>
      }
    >
      <div className="h-[220px]" role="img" aria-label={view === "cashflow" ? "Cumulative equity position and debt by month" : "Cost and value breakdown"}>
        <FinancialChartPlot view={view} cash={cash} bars={bars} gdv={m.gdv} />
      </div>
      <p className="caption mt-3">
        {view === "stack" && `Costs + profit = GDV ${fmtMoney(m.gdv)}.`}
        {view === "cashflow" && `Equity in first, then debt; sales repay debt, then equity. Peak debt ${fmtMoney(m.peakDebt)}.`}
        {view === "programme" && "GDV attributed to each zone by area × zone price."}
      </p>
    </Panel>
  );
}
