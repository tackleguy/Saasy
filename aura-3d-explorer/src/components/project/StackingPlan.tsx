"use client";
/**
 * StackingPlan — unit availability, floors × units, for the active building.
 * -----------------------------------------------------------------------------
 * Rows are floors (top first), cells are units (count from the yield engine,
 * capped at 8 per row for legibility). Status is SAMPLE data: seeded from the
 * project, building, floor and unit so it is stable between visits, and
 * weighted by the project's sales status. Clicking a cell opens a unit sheet;
 * clicking a floor label isolates that floor in the 3D explorer.
 */
import { useMemo, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import clsx from "clsx";
import type { Building, FloorYield, ProjectStatus, YieldMetrics } from "@/types";
import { ZONES } from "@/lib/tower";
import { fmtMoney, fmtNum } from "@/lib/format";
import { AMENITY_ACCENT, amenityName } from "@/lib/amenities";
import AmenityIcon from "@/components/ui/AmenityIcon";

import { buildUnits, type UnitInfo, type UnitStatus } from "@/lib/stackingUnits";
export { buildUnits, type UnitInfo, type UnitStatus } from "@/lib/stackingUnits";

const CELL: Record<UnitStatus, string> = {
  Available: "border-ink/40 bg-paper text-ink hover:bg-stone",
  Reserved: "border-brass bg-brass/40 text-ink hover:bg-brass/60",
  Sold: "border-ink bg-ink/80 text-paper hover:bg-ink",
};

interface Props {
  slug: string;
  status: ProjectStatus;
  building: Building;
  metrics: YieldMetrics;
  /** Isolate a floor in the 3D explorer. */
  onShowFloor: (floorIndex: number) => void;
  /** Prefill the enquiry form with a unit. */
  onEnquire: (unit: UnitInfo) => void;
  /** Guide prices come from the pro forma; share links without financials hide them. */
  showPrices?: boolean;
  /** Sample projects show illustrative availability; customer projects list every unit as available. */
  sample?: boolean;
}

export default function StackingPlan({ slug, status, building, metrics, onShowFloor, onEnquire, showPrices = true, sample = true }: Props) {
  const rows = useMemo(() => buildUnits(slug, status, building, metrics, sample ? "sample" : "none"), [slug, status, building, metrics, sample]);
  const [unit, setUnit] = useState<UnitInfo | null>(null);

  const counts = useMemo(() => {
    const c = { Available: 0, Reserved: 0, Sold: 0 };
    // Count each unit once (the penthouse appears on every crown row).
    new Map(rows.flat().map((u) => [u.code, u])).forEach((u) => c[u.status]++);
    return c;
  }, [rows]);

  return (
    <div>
      {/* Legend + totals */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {(Object.keys(counts) as UnitStatus[]).map((k) => (
          <span key={k} className="flex items-center gap-2 text-[13px] text-ink">
            <span className={clsx("h-3 w-3 border", CELL[k].split(" ").slice(0, 2).join(" "))} aria-hidden />
            {k} <span className="tabular-nums text-ash">{counts[k]}</span>
          </span>
        ))}
        <span className="ml-auto text-xs text-ash">{sample ? "Sample availability" : "Unit status tracking is not connected yet: all units listed as available"} · {building.name}</span>
      </div>

      <div className="thin-scroll max-h-[560px] overflow-y-auto border-y border-plaster">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Unit availability by floor for {building.name}</caption>
          <tbody>
            {rows.map((row, i) => ({ row, f: building.floors[i] })).reverse().map(({ row, f }) => {
              return (
                <tr key={f.index} className="border-b border-plaster/60 last:border-0">
                  <th scope="row" className="w-14 py-1 pr-2 text-left font-normal sm:w-24 sm:pr-3">
                    <button
                      type="button"
                      onClick={() => onShowFloor(f.index)}
                      aria-label={`Show floor ${f.number} in 3D`}
                      className="flex min-h-11 min-w-11 items-center gap-2 text-ash transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40"
                      title={`Show floor ${f.number} in 3D`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.amenity ? AMENITY_ACCENT : ZONES[f.zone].accent }} aria-hidden />
                      <span className="tabular-nums">F{f.number}</span>
                    </button>
                  </th>
                  <td className="py-1">
                    {f.amenity ? (
                      <button
                        type="button"
                        onClick={() => onShowFloor(f.index)}
                        className="flex min-h-11 w-full items-center gap-2 border px-2 text-left text-[11px] text-ink transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50"
                        style={{ borderColor: `${AMENITY_ACCENT}66`, background: `${AMENITY_ACCENT}14` }}
                        title={`Show ${amenityName(f)} in 3D`}
                      >
                        <AmenityIcon kind={f.amenity} size={13} style={{ color: AMENITY_ACCENT }} />
                        <span className="truncate">{amenityName(f)}</span>
                        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide" style={{ color: AMENITY_ACCENT }}>
                          Amenity
                        </span>
                      </button>
                    ) : (
                    <div
                      className="grid grid-cols-[repeat(var(--mobile-unit-columns),minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(var(--unit-columns),minmax(0,1fr))]"
                      style={{ "--mobile-unit-columns": Math.min(row.length, 4), "--unit-columns": row.length } as CSSProperties}
                    >
                      {row.map((u) => (
                        <button
                          key={u.code}
                          type="button"
                          onClick={() => setUnit(u)}
                          aria-label={`Unit ${u.code}, ${u.status}, ${fmtNum(u.sqFt)} square feet`}
                          title={`Unit ${u.code} · ${u.status}`}
                          className={clsx("flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 border px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50", CELL[u.status])}
                        >
                          <span className="text-[11px] font-medium leading-tight tabular-nums">{u.code.slice(u.code.lastIndexOf("-") + 1)}</span>
                          <span className="text-[10px] leading-tight">{u.status === "Available" ? "Avail." : u.status === "Reserved" ? "Res." : "Sold"}</span>
                        </button>
                      ))}
                    </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unit sheet */}
      <Dialog.Root open={!!unit} onOpenChange={(o) => !o && setUnit(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
          <Dialog.Content className="panel fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 p-6 focus:outline-none">
            {unit && (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="caption">
                      {building.name} · {ZONES[unit.zone].label}
                    </p>
                    <Dialog.Title className="font-serif text-4xl leading-tight text-ink">Unit {unit.code}</Dialog.Title>
                  </div>
                  <Dialog.Close className="btn-ghost min-h-11 min-w-11 justify-center" aria-label="Close unit sheet">
                    <X size={18} />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="caption mt-1">{sample ? "Sample unit sheet — figures derived from the current pro forma." : "Unit sheet — area from the massing; guide price from the project's pro forma."}</Dialog.Description>
                <dl className="mt-4 grid grid-cols-2 border-t border-plaster text-sm">
                  {[
                    ["Status", unit.status],
                    ["Floor", unit.levels && unit.levels[0] !== unit.levels[1] ? `F${unit.levels[0]}–F${unit.levels[1]}` : `F${unit.floorNumber}`],
                    ...(unit.beds ? [["Bedrooms / baths", `${unit.beds} bed / ${unit.baths} bath`]] : []),
                    ["Area", `${fmtNum(unit.sqFt)} sf`],
                    ...(showPrices ? [["Guide price", fmtMoney(unit.price)] as [string, string]] : []),
                    ["Orientation", unit.orientation],
                    ["View", unit.view],
                  ].map(([k, v]) => (
                    <div key={k} className="border-b border-plaster py-2 odd:pr-3 even:pl-3">
                      <dt className="caption">{k}</dt>
                      <dd className="tabular-nums text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex gap-2">
                  <button
                    className="btn-secondary min-h-11 flex-1"
                    onClick={() => {
                      onShowFloor(unit.floorIndex);
                      setUnit(null);
                    }}
                  >
                    Show in 3D
                  </button>
                  <button
                    className="btn-primary min-h-11 flex-1"
                    disabled={unit.status === "Sold"}
                    onClick={() => {
                      onEnquire(unit);
                      setUnit(null);
                    }}
                  >
                    {unit.status === "Sold" ? "Sold" : "Enquire"}
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
