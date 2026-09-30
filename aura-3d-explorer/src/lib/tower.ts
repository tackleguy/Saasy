/**
 * AURA — procedural tower generator.
 * -----------------------------------------------------------------------------
 * Pure data + maths (no React, no Three.js). A project describes each of its
 * buildings with a compact `ProjectMassing` (zone floor counts, plate sizes,
 * twist, facade articulation); `buildingFromMassing` turns that into a full
 * `BuildingSpec`, and `buildSite` generates every floor plate. The 3D scene,
 * inspector and yield engine all read from the result.
 *
 * Scale: plate sizes use the brief's dimensions in scene units. The storey
 * heights (0.85 – 1.8) only make sense as a scale model, so the scene is read
 * as 1 : 3.57 — `MODEL_SCALE` = 0.28 — giving real floor-to-floor heights of
 * ~3.0 m (residential), 3.2 m (office), 5 m (penthouse) and 6.4 m (lobby).
 * Furniture is modelled at true size in metres and scaled by MODEL_SCALE.
 */
import type { Building, BuildingSpec, FacadeSpec, FloorData, ZoneId, ZoneMeta } from "@/types";

/** Scene units per real-world metre (1 : 3.57 model). */
export const MODEL_SCALE = 0.28;

/** Vertical gap multiplier in the explosion formula (see `explodedY`). */
export const EXPLODE_SPACING = 1.2;

/** Explosion slider limits. */
export const EXPLODE_MIN = 0;
export const EXPLODE_MAX = 2.5;

/** Programme metadata shared by all buildings. */
export const ZONES: Record<ZoneId, ZoneMeta> = {
  podium: {
    id: "podium",
    label: "Podium & Grand Lobby",
    short: "Podium",
    accent: "#b8a47a",
    avgUnitSqFt: 3_200,
    unitNoun: "retail suites",
    description: "Dark basalt base with a double-volume lobby, concierge, café and lounge seating.",
  },
  office: {
    id: "office",
    label: "Commercial & Office",
    short: "Office",
    accent: "#38bdf8",
    avgUnitSqFt: 4_200,
    unitNoun: "office suites",
    description: "Open-plan workplace behind a double-glazed curtain wall, arranged around the central core.",
  },
  residential: {
    id: "residential",
    label: "Residences",
    short: "Residential",
    accent: "#a5b4c8",
    avgUnitSqFt: 1_350,
    unitNoun: "residences",
    description: "Four corner apartments per floor around the core, each with living, kitchen, dining and bedroom.",
  },
  crown: {
    id: "crown",
    label: "Crown & Sky Penthouses",
    short: "Crown",
    accent: "#f59e0b",
    avgUnitSqFt: 5_800,
    unitNoun: "penthouse",
    description: "Double-height ultra-clear glass suites with plunge pool, grand piano and warm golden interiors.",
  },
};

/** Zones in stacking order, ground → sky. */
export const ZONE_ORDER: ZoneId[] = ["podium", "office", "residential", "crown"];


/* ------------------------------------------------------------------ massing */

/** Default floor-to-floor heights per zone (scene units). */
export const DEFAULT_HEIGHTS: Record<ZoneId, number> = { podium: 1.8, office: 0.9, residential: 0.85, crown: 1.4 };

/** Compact description of one building's massing, used by the project content. */
export interface ProjectMassing {
  id: string;
  name: string;
  short: string;
  tagline: string;
  /** Ground-plane position [x, z]. */
  position: [number, number];
  /** Number of floors in each zone, bottom → top (each ≥ 1). */
  floors: Record<ZoneId, number>;
  /** Plate size [width, depth] per zone, scene units. */
  footprint: Record<ZoneId, [number, number]>;
  heights?: Partial<Record<ZoneId, number>>;
  /** Degrees of twist per floor from the first residential floor up. */
  twistDeg?: number;
  coreSize?: number;
  facade?: Partial<FacadeSpec>;
}

const DEFAULT_FACADE: FacadeSpec = { finSpacing: 1.0, balconies: false, arches: false };

/** Expand a compact massing into a full BuildingSpec (contiguous zone floor ranges). */
export function buildingFromMassing(m: ProjectMassing): BuildingSpec {
  let next = 1;
  const zones = {} as BuildingSpec["zones"];
  for (const z of ZONE_ORDER) {
    const count = Math.max(1, m.floors[z]);
    const [width, depth] = m.footprint[z];
    zones[z] = { floors: [next, next + count - 1], width, depth, height: m.heights?.[z] ?? DEFAULT_HEIGHTS[z] };
    next += count;
  }
  const minPlate = Math.min(...ZONE_ORDER.map((z) => Math.min(...m.footprint[z])));
  return {
    id: m.id,
    name: m.name,
    short: m.short,
    tagline: m.tagline,
    position: m.position,
    twistDeg: m.twistDeg ?? 0,
    // Core ≈ 36% of the smallest plate, capped — keeps corridors around it on slim crowns.
    coreSize: m.coreSize ?? Math.min(2.6, +(minPlate * 0.36).toFixed(2)),
    facade: { ...DEFAULT_FACADE, ...m.facade },
    zones,
  };
}

/** Zone that owns a given 1-based floor number in a building. */
export function zoneForFloor(spec: BuildingSpec, floorNumber: number): ZoneId {
  const zone = ZONE_ORDER.find((z) => floorNumber >= spec.zones[z].floors[0] && floorNumber <= spec.zones[z].floors[1]);
  if (!zone) throw new Error(`Floor ${floorNumber} is outside ${spec.name}`);
  return zone;
}

/**
 * Build the floor plates of one building.
 *
 * Twist: from the first residential floor up, each plate rotates
 * `R_y = floorIndex × twistDeg`, where floorIndex counts from that first
 * residential floor, so the office block stays square and the twist starts
 * smoothly. The crown continues the same progression.
 */
export function generateFloors(spec: BuildingSpec): FloorData[] {
  const floors: FloorData[] = [];
  const lastFloor = spec.zones.crown.floors[1];
  const twistStart = spec.zones.residential.floors[0];
  let y = 0;

  for (let number = 1; number <= lastFloor; number++) {
    const zone = zoneForFloor(spec, number);
    const geo = spec.zones[zone];
    const twisting = zone === "residential" || zone === "crown";
    const twistIndex = twisting ? number - twistStart : 0;

    floors.push({
      buildingId: spec.id,
      index: number - 1,
      number,
      zone,
      zoneIndex: number - geo.floors[0],
      width: geo.width,
      depth: geo.depth,
      height: geo.height,
      baseY: y,
      rotationY: (twistIndex * spec.twistDeg * Math.PI) / 180,
      footprintM2: geo.width * geo.depth,
    });
    y += geo.height;
  }
  return floors;
}


/** Generate every building of a site (specs → specs + floor plates). */
export function buildSite(specs: BuildingSpec[]): Building[] {
  return specs.map((spec) => ({ ...spec, floors: generateFloors(spec) }));
}

/** Total floor count across a site. */
export const siteFloorCount = (site: Building[]) => site.reduce((s, b) => s + b.floors.length, 0);

/**
 * Exploded-view elevation:  Y_render = Y_base + floorIndex × explosion × 1.2
 */
export function explodedY(floor: FloorData, explosion: number): number {
  return floor.baseY + floor.index * explosion * EXPLODE_SPACING;
}

/** World-space centre of a floor plate at the given explosion factor. */
export function floorCentre(building: BuildingSpec, floor: FloorData, explosion: number): [number, number, number] {
  return [building.position[0], explodedY(floor, explosion) + floor.height / 2, building.position[1]];
}

/** Height of a building's top plate at the given explosion factor. */
export function buildingHeight(building: Building, explosion: number): number {
  const top = building.floors[building.floors.length - 1];
  return explodedY(top, explosion) + top.height;
}

/** Real-world metres for a scene length (for the inspector). */
export const toMetres = (sceneUnits: number) => sceneUnits / MODEL_SCALE;
