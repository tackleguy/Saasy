/**
 * Architecture helpers for the Studio's Architect mode — pure, no Three.js.
 * -----------------------------------------------------------------------------
 *   • ArchView / ArchitectSceneState — what the 3D scene needs to know about
 *     the architect tools (drawing view, measure, sun study, clay, zoning).
 *   • sunPosition — solar elevation and azimuth from latitude, day of year and
 *     local solar time (standard declination / hour-angle formulas, ±1°).
 *   • sunDirectionWorld — that position as a direction in the scene. The site
 *     convention is north = −Z and east = +X, so the default afternoon sun
 *     (towards +Z) sits in the south.
 *   • areaSchedule / siteSchedule — gross floor area by zone, heights, plate
 *     sizes, FAR and site coverage from the generated floor plates.
 */
import type { Building, ZoneId } from "@/types";
import { MODEL_SCALE, ZONE_ORDER } from "./tower";

export type ArchView = "perspective" | "plan" | "north" | "east" | "south" | "west";

export const ARCH_VIEWS: { id: ArchView; label: string; short: string }[] = [
  { id: "perspective", label: "Perspective", short: "3D" },
  { id: "plan", label: "Plan (top)", short: "Plan" },
  { id: "north", label: "North elevation", short: "N" },
  { id: "east", label: "East elevation", short: "E" },
  { id: "south", label: "South elevation", short: "S" },
  { id: "west", label: "West elevation", short: "W" },
];

export type Vec3 = [number, number, number];

export interface Measurement {
  id: number;
  a: Vec3;
  b: Vec3;
}

/** Everything the 3D scene reads from Architect mode. */
export interface ArchitectSceneState {
  view: ArchView;
  /** Bumped to re-frame the current drawing view. */
  viewNonce: number;
  measuring: boolean;
  measurements: Measurement[];
  onMeasure: (a: Vec3, b: Vec3) => void;
  /** Level markers and a height dimension on the active building. */
  dimensions: boolean;
  /** White clay-model render. */
  clay: boolean;
  /** Sun study: null keeps the city preset's light. */
  sun: { elevation: number; azimuth: number } | null;
  /** Zoning height limit in metres (drawn as a plane), or null. */
  heightLimitM: number | null;
}

/* -------------------------------------------------------------------- sun */

/** Day of year (1–365) for the 21st of a month (0 = January): solstices and equinoxes land on 21 Mar/Jun/Sep/Dec. */
export const dayOfYear = (month: number) => [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355][month];

/**
 * Solar position for a latitude (degrees, north positive), day of year and
 * local solar time (hours, 12 = solar noon). Azimuth is degrees clockwise
 * from north. Elevation is negative when the sun is below the horizon.
 */
export function sunPosition(latitude: number, day: number, hour: number): { elevation: number; azimuth: number } {
  const rad = Math.PI / 180;
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (284 + day)) * rad;
  const lat = latitude * rad;
  const H = (hour - 12) * 15 * rad;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return { elevation: elevation / rad, azimuth: ((az / rad) % 360 + 360) % 360 };
}

/** Unit direction towards the sun in the scene (north = −Z, east = +X). */
export function sunDirectionWorld(elevation: number, azimuth: number): Vec3 {
  const e = (elevation * Math.PI) / 180;
  const a = (azimuth * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* --------------------------------------------------------------- schedule */

const M = (units: number) => units / MODEL_SCALE;
const M2 = (units2: number) => units2 / (MODEL_SCALE * MODEL_SCALE);
export const SQFT_PER_M2 = 10.7639;

export interface ZoneRow {
  zone: ZoneId;
  floors: number;
  /** Level of the first floor and top of the zone, metres above grade. */
  fromM: number;
  toM: number;
  /** Floor-to-floor height, metres. */
  f2fM: number;
  /** Typical (first) plate, metres. */
  plateM: [number, number];
  gfaM2: number;
}

export interface BuildingSchedule {
  id: string;
  name: string;
  short: string;
  floors: number;
  heightM: number;
  gfaM2: number;
  /** Ground-floor footprint, m². */
  footprintM2: number;
  zones: ZoneRow[];
}

export function areaSchedule(b: Building): BuildingSchedule {
  const zones: ZoneRow[] = [];
  for (const z of ZONE_ORDER) {
    const fl = b.floors.filter((f) => f.zone === z);
    if (!fl.length) continue;
    const first = fl[0];
    const last = fl[fl.length - 1];
    zones.push({
      zone: z,
      floors: fl.length,
      fromM: M(first.baseY),
      toM: M(last.baseY + last.height),
      f2fM: M(first.height),
      plateM: [M(first.width), M(first.depth)],
      gfaM2: fl.reduce((s, f) => s + M2(f.footprintM2), 0),
    });
  }
  const top = b.floors[b.floors.length - 1];
  return {
    id: b.id,
    name: b.name,
    short: b.short,
    floors: b.floors.length,
    heightM: M(top.baseY + top.height),
    gfaM2: zones.reduce((s, z) => s + z.gfaM2, 0),
    footprintM2: M2(b.floors[0].footprintM2),
    zones,
  };
}

export interface SiteSchedule {
  buildings: BuildingSchedule[];
  gfaM2: number;
  siteAreaM2: number;
  /** Floor area ratio: total GFA ÷ site area. */
  far: number;
  /** Share of the site covered by ground-floor footprints, 0–1. */
  coverage: number;
  tallestM: number;
}

export function siteSchedule(site: Building[], siteAreaSqFt: number): SiteSchedule {
  const buildings = site.map(areaSchedule);
  const siteAreaM2 = siteAreaSqFt / SQFT_PER_M2;
  const gfaM2 = buildings.reduce((s, b) => s + b.gfaM2, 0);
  const footprint = buildings.reduce((s, b) => s + b.footprintM2, 0);
  return {
    buildings,
    gfaM2,
    siteAreaM2,
    far: siteAreaM2 > 0 ? gfaM2 / siteAreaM2 : 0,
    coverage: siteAreaM2 > 0 ? footprint / siteAreaM2 : 0,
    tallestM: Math.max(...buildings.map((b) => b.heightM)),
  };
}

/** Round up to a tidy step (for default zoning limits that the scheme passes). */
export const roundUp = (v: number, step: number) => Math.ceil(v / step) * step;
