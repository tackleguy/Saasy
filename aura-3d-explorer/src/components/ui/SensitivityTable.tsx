"use client";
/**
 * SensitivityTable — profit on cost for sale price ±10% × hard cost ±10%,
 * as a heatmap. Cells are coloured on a diverging scale around the target
 * profit on cost (below target → terracotta, above → green).
 */
import { useMemo } from "react";
import clsx from "clsx";
import type { FloorData, YieldInputs } from "@/types";
import { SENSITIVITY_STEPS, sensitivity } from "@/lib/finance";
import { Panel } from "./primitives";

const label = (d: number) => (d === 0 ? "Base" : `${d > 0 ? "+" : "−"}${Math.abs(d * 100)}%`);

/** Diverging colour around the target: rgba of positive / negative tokens. */
function cellColour(v: number, target: number) {
  const t = Math.max(-1, Math.min(1, (v - target) / 20));
  return t >= 0 ? `rgb(74 120 88 / ${0.1 + t * 0.55})` : `rgb(170 78 62 / ${0.1 + -t * 0.55})`;
}

export default function SensitivityTable({ inputs, floors, buildingName }: { inputs: YieldInputs; floors: FloorData[]; buildingName: string }) {
  const grid = useMemo(() => sensitivity(inputs, floors), [inputs, floors]);
  const target = inputs.targetProfitOnCostPct;

  return (
    <Panel index={4} kicker={`Sensitivity · ${buildingName}`} title="Profit on Cost">
      <table className="w-full table-fixed border-collapse text-xs tabular-nums">
        <caption className="caption mb-2 text-left">Rows: sale price · Columns: hard cost · Target {target}% on cost</caption>
        <thead>
          <tr>
            <th scope="col" className="caption w-[18%] pb-1 text-left font-normal">
              Price ↓ Cost →
            </th>
            {SENSITIVITY_STEPS.map((c) => (
              <th key={c} scope="col" className="caption pb-1 text-center font-normal">
                {label(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              <th scope="row" className="caption py-0.5 pr-1 text-left font-normal">
                {label(SENSITIVITY_STEPS[ri])}
              </th>
              {row.map((v, ci) => {
                const base = SENSITIVITY_STEPS[ri] === 0 && SENSITIVITY_STEPS[ci] === 0;
                return (
                  <td key={ci} className="p-0.5">
                    <div className={clsx("py-2 text-center text-ink", base && "outline outline-1 outline-ink")} style={{ background: cellColour(v, target) }}>
                      {v.toFixed(1)}%
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
