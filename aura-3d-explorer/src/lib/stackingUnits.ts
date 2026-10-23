/**
 * Sample unit availability for the stacking plan: floors × units, priced from
 * the pro forma (unit price = floor revenue / units on the floor). Plain module
 * so server routes (PDF / XLSX exports) and the client plan share one source.
 */
import type { Building, FloorYield, ProjectStatus, YieldMetrics } from "@/types";
import { UNIT_MIX } from "@/lib/tower";

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

/** `sample`: illustrative sold / reserved shares by project status (sample projects).
 * `none`: no sales data is connected, so every unit is listed as available (customer projects). */
export function buildUnits(slug: string, status: ProjectStatus, building: Building, metrics: YieldMetrics, availability: "sample" | "none" = "sample"): UnitInfo[][] {
  const mix = availability === "none" ? { sold: 0, reserved: 0 } : MIX[status];
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

