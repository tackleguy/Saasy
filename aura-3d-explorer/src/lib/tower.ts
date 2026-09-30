/**
 * AURA — procedural tower definition.
 * -----------------------------------------------------------------------------
 * Pure data + maths (no React, no Three.js) describing the 20-floor tower.
 * Change a zone here and the 3D scene, inspector and yield engine all follow.
 *
 * Units: 1 scene unit = 1 metre.
 */
import type { FloorData, ZoneId, ZoneSpec } from "@/types";

/** Degrees of twist added per residential (and crown) floor. */
export const TWIST_DEG_PER_FLOOR = 3.5;

/** Vertical gap multiplier in the explosion formula (see `explodedY`). */
export const EXPLODE_SPACING = 1.2;

/** Explosion slider limits. */
export const EXPLODE_MIN = 0;
export const EXPLODE_MAX = 2.5;

export const ZONES: Record<ZoneId, ZoneSpec> = {
  podium: {
    id: "podium",
    label: "Podium & Grand Lobby",
    short: "Podium",
    floors: [1, 1],
    width: 12,
    depth: 12,
    height: 1.8,
    accent: "#b8a47a",
    avgUnitSqFt: 3_200,
    unitNoun: "retail suites",
    description: "Dark basalt base with a double-volume lobby, concierge and street-front retail.",
  },
  office: {
    id: "office",
    label: "Commercial & Office",
    short: "Office",
    floors: [2, 7],
    width: 10,
    depth: 10,
    height: 0.9,
    accent: "#38bdf8",
    avgUnitSqFt: 4_200,
    unitNoun: "office suites",
    description: "Column-free plates behind a double-glazed curtain wall, optimised for open-plan work.",
  },
  residential: {
    id: "residential",
    label: "Mid-Tower Residences",
    short: "Residential",
    floors: [8, 18],
    width: 8.5,
    depth: 8.5,
    height: 0.85,
    accent: "#a5b4c8",
    avgUnitSqFt: 1_350,
    unitNoun: "residences",
    description: "Frosted-glass residences, each plate twisting 3.5° to open new views floor by floor.",
  },
  crown: {
    id: "crown",
    label: "The Crown & Sky Penthouses",
    short: "Crown",
    floors: [19, 20],
    width: 6.5,
    depth: 6.5,
    height: 1.4,
    accent: "#f59e0b",
    avgUnitSqFt: 5_800,
    unitNoun: "penthouse",
    description: "Double-height, ultra-clear glass sky suites lit by warm golden interiors.",
  },
};

/** Zones in stacking order, ground → sky. */
export const ZONE_ORDER: ZoneId[] = ["podium", "office", "residential", "crown"];

/** Zone that owns a given 1-based floor number. */
export function zoneForFloor(floorNumber: number): ZoneId {
  const zone = ZONE_ORDER.find((z) => floorNumber >= ZONES[z].floors[0] && floorNumber <= ZONES[z].floors[1]);
  if (!zone) throw new Error(`Floor ${floorNumber} is outside the tower`);
  return zone;
}

/**
 * Build the 20 floor plates.
 *
 * Twist: residential floors rotate `R_y = floorIndex × 3.5°`, where floorIndex
 * counts from the first residential floor (so the office block stays square
 * and the twist starts smoothly). The crown continues the same progression so
 * the silhouette reads as one continuous gesture.
 */
export function generateTower(): FloorData[] {
  const floors: FloorData[] = [];
  const lastFloor = ZONES.crown.floors[1];
  const twistStart = ZONES.residential.floors[0];
  let y = 0;

  for (let number = 1; number <= lastFloor; number++) {
    const zone = zoneForFloor(number);
    const spec = ZONES[zone];
    const twisting = zone === "residential" || zone === "crown";
    const twistIndex = twisting ? number - twistStart : 0;

    floors.push({
      index: number - 1,
      number,
      zone,
      zoneIndex: number - spec.floors[0],
      width: spec.width,
      depth: spec.depth,
      height: spec.height,
      baseY: y,
      rotationY: (twistIndex * TWIST_DEG_PER_FLOOR * Math.PI) / 180,
      footprintM2: spec.width * spec.depth,
    });
    y += spec.height;
  }
  return floors;
}

/**
 * Exploded-view elevation:  Y_render = Y_base + floorIndex × explosion × 1.2
 */
export function explodedY(floor: FloorData, explosion: number): number {
  return floor.baseY + floor.index * explosion * EXPLODE_SPACING;
}

/** World-space centre of a floor plate at the given explosion factor. */
export function floorCentre(floor: FloorData, explosion: number): [number, number, number] {
  return [0, explodedY(floor, explosion) + floor.height / 2, 0];
}

/** Total tower height (top of the last plate) at the given explosion factor. */
export function towerHeight(floors: FloorData[], explosion: number): number {
  const top = floors[floors.length - 1];
  return explodedY(top, explosion) + top.height;
}

/** The tower is deterministic, so a single shared instance is enough. */
export const TOWER: FloorData[] = generateTower();
