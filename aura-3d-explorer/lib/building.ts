/**
 * AURA — Procedural high-rise generator
 * -------------------------------------------------------------
 * Produces a list of individual floor plates (NOT a single merged mesh).
 * Each plate carries its own 2D footprint, height, rotation and zone data,
 * so the 3D engine can explode, select, dim and furnish floors one by one,
 * and the yield engine can compute a floor-by-floor breakdown.
 *
 * Units: 1 scene unit ≈ 1 metre-ish (purely visual).
 */

export type ZoneId = "podium" | "office" | "residential" | "crown";

export interface ZoneSpec {
  id: ZoneId;
  label: string;
  short: string;
  floors: number;
  /** floor-to-floor height in scene units */
  height: number;
  /** colour used in charts / legend / selection glow */
  color: string;
  /** average saleable unit size in sq ft (drives the unit count) */
  avgUnitSqft: number;
  /** what a "unit" is called on this zone */
  unitNoun: string;
  /** net-to-gross efficiency (saleable area / gross floor area) */
  efficiency: number;
  description: string;
}

export const ZONES: Record<ZoneId, ZoneSpec> = {
  podium: {
    id: "podium",
    label: "Podium & Grand Lobby",
    short: "Podium",
    floors: 1,
    height: 6,
    color: "#b08d57",
    avgUnitSqft: 3200,
    unitNoun: "retail suites",
    efficiency: 0.78,
    description: "Wide ground-level base with a double-volume lobby and street retail.",
  },
  office: {
    id: "office",
    label: "Commercial Office",
    short: "Office",
    floors: 6,
    height: 4,
    color: "#7c93b5",
    avgUnitSqft: 4200,
    unitNoun: "office suites",
    efficiency: 0.86,
    description: "Regular rectangular plates optimised for open-plan workspace.",
  },
  residential: {
    id: "residential",
    label: "Residential Mid-Tower",
    short: "Residential",
    floors: 10,
    height: 3.4,
    color: "#9fb8a6",
    avgUnitSqft: 1350,
    unitNoun: "residences",
    efficiency: 0.82,
    description: "Stepped plates with a progressive rotational twist for views.",
  },
  crown: {
    id: "crown",
    label: "The Crown Penthouses",
    short: "Crown",
    floors: 2,
    height: 7,
    color: "#d4af37",
    avgUnitSqft: 6500,
    unitNoun: "penthouse",
    efficiency: 0.8,
    description: "Two double-height, faceted luxury floors capping the tower.",
  },
};

export const ZONE_ORDER: ZoneId[] = ["podium", "office", "residential", "crown"];

/** A 2D point in the floor plate's local XZ plane */
export type Pt = [number, number];

export interface FloorPlate {
  /** 0-based index from the ground up */
  index: number;
  /** human label, e.g. "L07" */
  label: string;
  zone: ZoneId;
  /** index of this floor inside its zone (0-based) */
  zoneIndex: number;
  /** closed polygon footprint in local coordinates (counter-clockwise) */
  footprint: Pt[];
  /** floor-to-floor height */
  height: number;
  /** base elevation when the building is NOT exploded */
  baseY: number;
  /** rotation about the vertical axis (radians) */
  rotationY: number;
  /** gross plate area in scene units² (used for relative yield shares) */
  plateArea: number;
}

/* ---------------------------------------------------------- helpers */

/** Rectangle centred on origin, optional chamfered corners */
function chamferRect(w: number, d: number, chamfer = 0): Pt[] {
  const x = w / 2;
  const z = d / 2;
  if (chamfer <= 0) return [[-x, -z], [x, -z], [x, z], [-x, z]];
  const c = chamfer;
  return [
    [-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c],
    [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c],
  ];
}

/** Faceted "crown" footprint — an elongated, asymmetric octagon with a pointed prow */
function crownShape(w: number, d: number, prow: number): Pt[] {
  const x = w / 2;
  const z = d / 2;
  return [
    [-x * 0.7, -z], [x * 0.55, -z], [x, -z * 0.35], [x + prow, 0],
    [x, z * 0.35], [x * 0.55, z], [-x * 0.7, z], [-x, z * 0.45], [-x, -z * 0.45],
  ];
}

/** Shoelace polygon area */
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/** Ray-casting point-in-polygon — used to scatter furniture inside footprints */
export function pointInPolygon([px, pz]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const hit = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/* ---------------------------------------------------------- generator */

/**
 * Generate the full tiered tower.
 * Each zone uses its own footprint logic so floor areas (and therefore yields)
 * genuinely vary floor to floor.
 */
export function generateTower(): FloorPlate[] {
  const floors: FloorPlate[] = [];
  let y = 0;
  let idx = 0;

  const push = (zone: ZoneId, zoneIndex: number, footprint: Pt[], rotationY = 0) => {
    const spec = ZONES[zone];
    floors.push({
      index: idx,
      label: idx === 0 ? "L00" : `L${String(idx).padStart(2, "0")}`,
      zone,
      zoneIndex,
      footprint,
      height: spec.height,
      baseY: y,
      rotationY,
      plateArea: polygonArea(footprint),
    });
    y += spec.height;
    idx++;
  };

  // 1. Podium — one wide, chamfered base
  push("podium", 0, chamferRect(38, 28, 4));

  // 2. Office — six regular rectangles (tiny setback at the top two for rhythm)
  for (let i = 0; i < ZONES.office.floors; i++) {
    const setback = i >= 4 ? 1 : 0;
    push("office", i, chamferRect(26 - setback, 18 - setback * 0.6, 0));
  }

  // 3. Residential — ten plates that step inward every 3 floors and twist 3.5° per floor
  for (let i = 0; i < ZONES.residential.floors; i++) {
    const step = Math.floor(i / 3) * 0.9;
    const twist = ((i + 1) * 3.5 * Math.PI) / 180;
    push("residential", i, chamferRect(21 - step, 16 - step * 0.7, 1.6), twist);
  }

  // 4. Crown — two double-height faceted penthouses, the top one smaller & counter-rotated
  const lastTwist = ((ZONES.residential.floors + 1) * 3.5 * Math.PI) / 180;
  push("crown", 0, crownShape(18, 14, 3), lastTwist + 0.12);
  push("crown", 1, crownShape(15, 11.5, 4), lastTwist - 0.18);

  return floors;
}

/** Total un-exploded tower height */
export function towerHeight(floors: FloorPlate[]): number {
  const top = floors[floors.length - 1];
  return top.baseY + top.height;
}
