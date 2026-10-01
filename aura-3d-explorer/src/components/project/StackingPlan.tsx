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
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import clsx from "clsx";
import type { Building, FloorYield, ProjectStatus, YieldMetrics } from "@/types";
import { UNIT_MIX, ZONES } from "@/lib/tower";
import { fmtMoney, fmtNum } from "@/lib/format";
import { AMENITY_ACCENT, amenityName } from "@/lib/amenities";
import AmenityIcon from "@/components/ui/AmenityIcon";

export type UnitStatus = "Available" | "Reserved" | "Sold";

export interface UnitInfo {
  code: string;
  floorIndex: number;
  floorNumber: number;
  unitIndex: number;
  zone: FloorYield["zone"];
  sqFt: number;
  price: number;
  status: UnitStatus;
  orientation: string;
  view: string;
  /** Bedrooms / bathrooms for residences and the penthouse. */
  beds?: number;
  baths?: number;
  /** Floor numbers the unit spans (the penthouse covers every crown floor). */
  levels?: [number, number];
}

const MAX_PER_ROW = 8;

/** Share of units sold / reserved by project status (sample data). */
const MIX: Record<ProjectStatus, { sold: number; reserved: number }> = {
  Concept: { sold: 0, reserved: 0.05 },
  Approved: { sold: 0.12, reserved: 0.12 },
  "Under Construction": { sold: 0.35, reserved: 0.15 },
  Selling: { sold: 0.48, reserved: 0.14 },
};

/** Small deterministic hash → [0, 1). */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const ORIENTATIONS = ["North", "East", "South", "West"];

export function buildUnits(slug: string, status: ProjectStatus, building: Building, metrics: YieldMetrics): UnitInfo[][] {
  const mix = MIX[status];
  const prefix = building.short.slice(0, 3).toUpperCase();

  // The whole crown is ONE penthouse: every crown row shows the same unit.
  const crown = building.floors.filter((f) => f.zone === "crown");
  const phStatus = (() => {
    const r = hash01(`${slug}:${building.id}:penthouse`) * 0.85;
    return r < mix.sold ? "Sold" : r < mix.sold + mix.reserved ? "Reserved" : "Available";
  })() as UnitStatus;
  const penthouse: UnitInfo | null = crown.length
    ? {
        code: `${prefix}-PH`,
        floorIndex: crown[0].index,
        floorNumber: crown[0].number,
        unitIndex: 0,
        zone: "crown",
        sqFt: crown.reduce((s, f) => s + metrics.floors[f.index].sqFt, 0),
        price: crown.reduce((s, f) => s + metrics.floors[f.index].revenue, 0),
        status: phStatus,
        orientation: "All four",
        view: "360° skyline & water",
        beds: UNIT_MIX.penthouse.beds,
        baths: UNIT_MIX.penthouse.baths,
        levels: [crown[0].number, crown[crown.length - 1].number],
      }
    : null;

  return building.floors.map((f) => {
    // Shared amenity floors are not sold: no unit cells (the row shows an amenity band).
    if (f.amenity) return [];
    if (f.zone === "crown" && penthouse) return [penthouse];
    const fy = metrics.floors[f.index];
    const count = Math.max(1, Math.min(MAX_PER_ROW, fy.units));
    return Array.from({ length: count }, (_, u) => {
      // Higher floors sell first.
      const r = hash01(`${slug}:${building.id}:${f.index}:${u}`) * (1.15 - (f.index / building.floors.length) * 0.3);
      const st: UnitStatus = r < mix.sold ? "Sold" : r < mix.sold + mix.reserved ? "Reserved" : "Available";
      return {
        code: `${prefix}-${String(f.number).padStart(2, "0")}${String(u + 1).padStart(2, "0")}`,
        floorIndex: f.index,
        floorNumber: f.number,
        unitIndex: u,
        zone: f.zone,
        sqFt: fy.sqFt / count,
        price: fy.revenue / count,
        status: st,
        orientation: ORIENTATIONS[u % 4],
        view: f.index > building.floors.length * 0.55 ? "Skyline & water" : f.zone === "podium" ? "Street & plaza" : "City & park",
        ...(f.zone === "residential" ? { beds: UNIT_MIX.residential.beds, baths: UNIT_MIX.residential.baths } : {}),
      };
    });
  });
}

const CELL: Record<UnitStatus, string> = {
  Available: "border-ink/40 bg-paper hover:bg-stone",
  Reserved: "border-brass bg-brass/40 hover:bg-brass/60",
  Sold: "border-ink bg-ink/80 hover:bg-ink",
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
}

export default function StackingPlan({ slug, status, building, metrics, onShowFloor, onEnquire }: Props) {
  const rows = useMemo(() => buildUnits(slug, status, building, metrics), [slug, status, building, metrics]);
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
        <span className="ml-auto text-xs text-ash">Sample availability · {building.name}</span>
      </div>

      <div className="thin-scroll max-h-[560px] overflow-y-auto border-y border-plaster">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Unit availability by floor for {building.name}</caption>
          <tbody>
            {rows.map((row, i) => ({ row, f: building.floors[i] })).reverse().map(({ row, f }) => {
              return (
                <tr key={f.index} className="border-b border-plaster/60 last:border-0">
                  <th scope="row" className="w-24 py-1 pr-3 text-left font-normal">
                    <button
                      onClick={() => onShowFloor(f.index)}
                      className="flex items-center gap-2 text-ash transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40"
                      title={`Show floor ${f.number} in 3D`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.amenity ? AMENITY_ACCENT : ZONES[f.zone].accent }} aria-hidden />
                      <span className="tabular-nums">F{f.number}</span>
                    </button>
                  </th>
                  <td className="py-1">
                    {f.amenity ? (
                      <button
                        onClick={() => onShowFloor(f.index)}
                        className="flex h-7 w-full items-center gap-2 border px-2 text-left text-[11px] text-ink transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50"
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
                    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${MAX_PER_ROW}, minmax(0, 1fr))` }}>
                      {row.map((u) => (
                        <button
                          key={u.code}
                          onClick={() => setUnit(u)}
                          aria-label={`Unit ${u.code}, ${u.status}, ${fmtNum(u.sqFt)} square feet`}
                          className={clsx("h-7 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50", CELL[u.status])}
                          style={{ gridColumn: `span ${Math.max(1, Math.floor(MAX_PER_ROW / row.length))}` }}
                        />
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
                  <Dialog.Close className="btn-ghost" aria-label="Close unit sheet">
                    <X size={18} />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="caption mt-1">Sample unit sheet — figures derived from the current pro forma.</Dialog.Description>
                <dl className="mt-4 grid grid-cols-2 border-t border-plaster text-sm">
                  {[
                    ["Status", unit.status],
                    ["Floor", unit.levels && unit.levels[0] !== unit.levels[1] ? `F${unit.levels[0]}–F${unit.levels[1]}` : `F${unit.floorNumber}`],
                    ...(unit.beds ? [["Bedrooms / baths", `${unit.beds} bed / ${unit.baths} bath`]] : []),
                    ["Area", `${fmtNum(unit.sqFt)} sf`],
                    ["Guide price", fmtMoney(unit.price)],
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
                    className="btn-secondary flex-1"
                    onClick={() => {
                      onShowFloor(unit.floorIndex);
                      setUnit(null);
                    }}
                  >
                    Show in 3D
                  </button>
                  <button
                    className="btn-primary flex-1"
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
