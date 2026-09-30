/**
 * AURA — procedural site definition (three towers).
 * -----------------------------------------------------------------------------
 * Pure data + maths (no React, no Three.js). Change a building here and the
 * 3D scene, inspector and yield engine all follow.
 *
 * Scale: plate sizes use the brief's dimensions in scene units. The storey
 * heights (0.85 – 1.8) only make sense as a scale model, so the scene is read
 * as 1 : 3.57 — `MODEL_SCALE` = 0.28 — giving real floor-to-floor heights of
 * ~3.0 m (residential), 3.2 m (office), 5 m (penthouse) and 6.4 m (lobby).
 * Furniture is modelled at true size in metres and scaled by MODEL_SCALE.
 */
import type { Building, BuildingId, BuildingSpec, FloorData, ZoneId, ZoneMeta } from "@/types";

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

/**
 * The three buildings. Positions are chosen so that, from the default camera
 * angle, the site reads left → right as Lofts · Meridian · Spire.
 */
export const BUILDING_SPECS: BuildingSpec[] = [
  {
    id: "meridian",
    name: "The Meridian",
    short: "Meridian",
    tagline: "20-storey twisting mixed-use tower",
    position: [0, 0],
    twistDeg: 3.5,
    coreSize: 2.4,
    facade: { finSpacing: 1.0, balconies: true, arches: true },
    zones: {
      podium: { floors: [1, 1], width: 12, depth: 12, height: 1.8 },
      office: { floors: [2, 7], width: 10, depth: 10, height: 0.9 },
      residential: { floors: [8, 18], width: 8.5, depth: 8.5, height: 0.85 },
      crown: { floors: [19, 20], width: 6.5, depth: 6.5, height: 1.4 },
    },
  },
  {
    id: "spire",
    name: "Meridian Spire",
    short: "Spire",
    tagline: "30-storey counter-twisting landmark",
    position: [17, -17],
    twistDeg: -2.5,
    coreSize: 2.1,
    facade: { finSpacing: 0.75, balconies: false, arches: false },
    zones: {
      podium: { floors: [1, 1], width: 11, depth: 11, height: 1.8 },
      office: { floors: [2, 11], width: 9, depth: 9, height: 0.9 },
      residential: { floors: [12, 27], width: 7.5, depth: 7.5, height: 0.85 },
      crown: { floors: [28, 30], width: 5.5, depth: 5.5, height: 1.4 },
    },
  },
  {
    id: "lofts",
    name: "Meridian Lofts",
    short: "Lofts",
    tagline: "10-storey residential courtyard block",
    position: [-17, 16],
    twistDeg: 0,
    coreSize: 2.6,
    facade: { finSpacing: 1.3, balconies: true, arches: true },
    zones: {
      podium: { floors: [1, 1], width: 14, depth: 10, height: 1.8 },
      office: { floors: [2, 3], width: 13, depth: 9, height: 0.9 },
      residential: { floors: [4, 9], width: 12, depth: 8.5, height: 0.85 },
      crown: { floors: [10, 10], width: 9, depth: 6.5, height: 1.4 },
    },
  },
];

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

/** Every building with its generated floors — deterministic, so shared. */
export const SITE: Building[] = BUILDING_SPECS.map((spec) => ({ ...spec, floors: generateFloors(spec) }));

export const BUILDING_IDS = SITE.map((b) => b.id);

export function getBuilding(id: BuildingId): Building {
  return SITE.find((b) => b.id === id)!;
}

export const TOTAL_FLOORS = SITE.reduce((s, b) => s + b.floors.length, 0);

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
