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
 *
 * Plan shapes: each zone (or the whole building) has a `PlanShape` — rect,
 * rounded, ellipse, hexagon, octagon, triangle, l-shape, cross or chamfer.
 * `planOutline` turns a shape + bounding box into a 2D polygon in plan
 * coordinates (x, z); the renderer extrudes it and runs the facade along its
 * perimeter. FloorData keeps width / depth as the bounding box (site layout
 * relies on it) and outlines never leave that box; `footprintM2` is the true
 * polygon area.
 *
 * Vertical profile: besides twist and (now easable) taper, a building can
 * step in at setbacks (wedding-cake) and bulge (belly) over its shaft. All
 * modifiers only ever shrink plates, so zone width / depth stay the maxima.
 */
import type { AmenitySpec, Building, BuildingSpec, FacadeSpec, FloorData, MassingProfile, PlanShape, PlanShapeKind, ZoneId, ZoneMeta } from "@/types";

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
    description: "Four corner residences per floor around the core — each 2 bed / 2 bath with living, kitchen and dining.",
  },
  crown: {
    id: "crown",
    label: "Crown & Sky Penthouse",
    short: "Crown",
    accent: "#f59e0b",
    avgUnitSqFt: 5_800,
    unitNoun: "penthouse",
    description: "One penthouse across the whole crown — 4 bed / 4 bath, with plunge pool, grand piano and warm golden interiors.",
  },
};

/**
 * Fixed unit mix for the residential programme:
 *   • every residential floor holds four corner residences, each 2 bed / 2 bath
 *   • the crown (all of its floors together) is a single 4 bed / 4 bath penthouse
 * The yield engine, stacking plan, inspector and furniture layouts all read this.
 */
export const UNIT_MIX = {
  residential: { perFloor: 4, beds: 2, baths: 2 },
  penthouse: { beds: 4, baths: 4 },
} as const;

/**
 * Penthouse bedrooms (each with an ensuite) on crown floor `zoneIndex` of
 * `crownFloors`. A single-floor crown holds all four; otherwise the lowest
 * crown floor is the living level with one guest suite and the rest are
 * spread over the floors above.
 */
/** Number of floors in a building's crown (the penthouse spans them all). */
export function crownFloorCount(spec: Pick<BuildingSpec, "zones">): number {
  const [a, b] = spec.zones.crown.floors;
  return b - a + 1;
}

export function penthouseBedsOnFloor(zoneIndex: number, crownFloors: number): number {
  const total = UNIT_MIX.penthouse.beds;
  if (crownFloors <= 1) return total;
  if (zoneIndex === 0) return 1;
  const upper = crownFloors - 1;
  const rest = total - 1;
  return Math.floor(rest / upper) + (zoneIndex - 1 < rest % upper ? 1 : 0);
}

/** Zones in stacking order, ground → sky. */
export const ZONE_ORDER: ZoneId[] = ["podium", "office", "residential", "crown"];


/* -------------------------------------------------------------- plan shapes */

/** A point in plan: [x, z] in the plate's local (un-twisted) frame. */
export type PlanPoint = [x: number, z: number];

/** A plan shape given by kind alone, or with its parameter. */
export type ShapeInput = PlanShapeKind | PlanShape;

export const RECT: PlanShape = { kind: "rect" };

/** Default `amount` per shape kind (see PlanShape). */
const DEFAULT_AMOUNT: Partial<Record<PlanShapeKind, number>> = {
  rounded: 0.45,
  triangle: 0.12,
  chamfer: 0.18,
  "l-shape": 0.42,
  cross: 0.46,
};

export const toShape = (s: ShapeInput | undefined): PlanShape => (s === undefined ? RECT : typeof s === "string" ? { kind: s } : s);

/** Signed shoelace area (positive = counter-clockwise in the x/z maths plane). */
export function signedArea(pts: PlanPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

export const polygonArea = (pts: PlanPoint[]) => Math.abs(signedArea(pts));

const ccw = (pts: PlanPoint[]) => (signedArea(pts) < 0 ? pts.reverse() : pts);

/** Round every corner of a polygon with an arc of radius r (clamped per corner). */
function fillet(pts: PlanPoint[], r: number, segs: number): PlanPoint[] {
  if (r <= 1e-4) return pts;
  const out: PlanPoint[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [px, pz] = pts[i];
    const [ax, az] = pts[(i + n - 1) % n];
    const [bx, bz] = pts[(i + 1) % n];
    const la = Math.hypot(ax - px, az - pz);
    const lb = Math.hypot(bx - px, bz - pz);
    const ux = (ax - px) / la, uz = (az - pz) / la;
    const vx = (bx - px) / lb, vz = (bz - pz) / lb;
    const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uz * vz))) / 2;
    if (half < 1e-3 || half > Math.PI / 2 - 1e-3) {
      out.push([px, pz]);
      continue;
    }
    // Tangent distance, clamped so neighbouring fillets can't overlap.
    const t = Math.min(r / Math.tan(half), la / 2, lb / 2);
    const rr = t * Math.tan(half);
    let mx = ux + vx, mz = uz + vz;
    const ml = Math.hypot(mx, mz);
    mx /= ml;
    mz /= ml;
    const cd = rr / Math.sin(half);
    const cx = px + mx * cd, cz = pz + mz * cd;
    const a0 = Math.atan2(pz + uz * t - cz, px + ux * t - cx);
    let a1 = Math.atan2(pz + vz * t - cz, px + vx * t - cx);
    let sweep = a1 - a0;
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    if (sweep < -Math.PI) sweep += Math.PI * 2;
    a1 = a0 + sweep;
    for (let k = 0; k <= segs; k++) {
      const a = a0 + (sweep * k) / segs;
      out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
  }
  return out;
}

const rectPts = (hx: number, hz: number): PlanPoint[] => [
  [-hx, -hz],
  [hx, -hz],
  [hx, hz],
  [-hx, hz],
];

const chamferPts = (hx: number, hz: number, c: number): PlanPoint[] => [
  [-hx + c, -hz],
  [hx - c, -hz],
  [hx, -hz + c],
  [hx, hz - c],
  [hx - c, hz],
  [-hx + c, hz],
  [-hx, hz - c],
  [-hx, -hz + c],
];

const outlineCache = new Map<string, PlanPoint[]>();

/**
 * Plan outline of a floor plate: a simple counter-clockwise polygon (x, z)
 * that fits exactly inside the w × d bounding box, centred on the origin.
 * Pure and cached — callers must not mutate the result.
 */
export function planOutline(shape: PlanShape, w: number, d: number): PlanPoint[] {
  const key = `${shape.kind}:${shape.amount ?? ""}:${w}:${d}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const hx = w / 2;
  const hz = d / 2;
  const m = Math.min(w, d);
  const a = shape.amount ?? DEFAULT_AMOUNT[shape.kind] ?? 0;
  let pts: PlanPoint[];
  switch (shape.kind) {
    case "rounded":
      pts = fillet(rectPts(hx, hz), Math.min(1, a) * (m / 2), 8);
      break;
    case "ellipse": {
      const n = 64;
      pts = Array.from({ length: n }, (_, i): PlanPoint => {
        const t = (i / n) * Math.PI * 2;
        return [Math.cos(t) * hx, Math.sin(t) * hz];
      });
      break;
    }
    case "hexagon": {
      const s60 = Math.sin(Math.PI / 3);
      pts = Array.from({ length: 6 }, (_, i): PlanPoint => {
        const t = (i / 6) * Math.PI * 2;
        return [Math.cos(t) * hx, (Math.sin(t) / s60) * hz];
      });
      break;
    }
    case "octagon":
      pts = chamferPts(hx, hz, ((1 - Math.tan(Math.PI / 8)) / 2) * m);
      break;
    case "chamfer":
      pts = chamferPts(hx, hz, Math.min(0.45, a) * m);
      break;
    case "triangle":
      pts = fillet([[0, -hz], [hx, hz], [-hx, hz]], a * m, 8);
      break;
    case "l-shape": {
      const nx = Math.min(0.8, a) * w;
      const nz = Math.min(0.8, a) * d;
      pts = [[-hx, -hz], [hx - nx, -hz], [hx - nx, -hz + nz], [hx, -hz + nz], [hx, hz], [-hx, hz]];
      break;
    }
    case "cross": {
      const ax = (Math.min(0.95, a) * w) / 2;
      const az = (Math.min(0.95, a) * d) / 2;
      pts = [
        [-ax, -hz], [ax, -hz], [ax, -az], [hx, -az], [hx, az], [ax, az],
        [ax, hz], [-ax, hz], [-ax, az], [-hx, az], [-hx, -az], [-ax, -az],
      ];
      break;
    }
    default:
      pts = rectPts(hx, hz);
  }
  const out = ccw(pts);
  outlineCache.set(key, out);
  return out;
}

/**
 * Offset a CCW polygon outwards by `dist` (negative = inwards) with mitred
 * corners (miter length capped at 3 × |dist|).
 */
export function offsetOutline(pts: PlanPoint[], dist: number): PlanPoint[] {
  if (dist === 0) return pts;
  const n = pts.length;
  return pts.map(([px, pz], i): PlanPoint => {
    const [ax, az] = pts[(i + n - 1) % n];
    const [bx, bz] = pts[(i + 1) % n];
    const n1 = edgeNormal(ax, az, px, pz);
    const n2 = edgeNormal(px, pz, bx, bz);
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const cos = mx * n1[0] + mz * n1[1];
    const len = Math.min(Math.abs(dist / Math.max(cos, 1e-3)), Math.abs(dist) * 3) * Math.sign(dist);
    return [px + mx * len, pz + mz * len];
  });
}

/** Outward unit normal of the edge a → b of a CCW polygon. */
export function edgeNormal(ax: number, az: number, bx: number, bz: number): PlanPoint {
  const dx = bx - ax, dz = bz - az;
  const l = Math.hypot(dx, dz) || 1;
  return [dz / l, -dx / l];
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(pts: PlanPoint[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Clamp a shape's parameter so the central core (plus `clear` margin,
 * half-size in scene units) never pokes out of the plate: the L notch stops
 * short of the core and cross arms are at least as wide as the core.
 */
function fitShapeToCore(shape: PlanShape, w: number, d: number, clear: number): PlanShape {
  const a = shape.amount ?? DEFAULT_AMOUNT[shape.kind] ?? 0;
  if (shape.kind === "l-shape") {
    const max = Math.max((w / 2 - clear) / w, (d / 2 - clear) / d);
    return a > max ? { ...shape, amount: +Math.max(0.05, max).toFixed(3) } : shape;
  }
  if (shape.kind === "cross") {
    const min = Math.max((2 * clear) / w, (2 * clear) / d);
    return a < min ? { ...shape, amount: +Math.min(0.95, min).toFixed(3) } : shape;
  }
  return shape;
}

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
  /** Residential plates shrink to this fraction at the top of the zone (1 = none). */
  taper?: number;
  /** Easing of the taper (default linear). */
  taperCurve?: MassingProfile["taperCurve"];
  /** Wedding-cake setbacks (see MassingProfile). */
  setbacks?: MassingProfile["setbacks"];
  /** Belly profile over the office + residential shaft (0 – ~0.4). */
  bulge?: number;
  /** Plan shape for every zone (default rect). */
  shape?: ShapeInput;
  /** Per-zone plan-shape overrides (e.g. an L-shaped podium under a round tower). */
  zoneShapes?: Partial<Record<ZoneId, ShapeInput>>;
  coreSize?: number;
  facade?: Partial<FacadeSpec>;
  /** Shared amenity floors (1-based storeys; not sold — see lib/amenities). */
  amenities?: AmenitySpec[];
}

const DEFAULT_FACADE: FacadeSpec = { finSpacing: 1.0, balconies: false, arches: false };

/** Expand a compact massing into a full BuildingSpec (contiguous zone floor ranges). */
export function buildingFromMassing(m: ProjectMassing): BuildingSpec {
  let next = 1;
  const zones = {} as BuildingSpec["zones"];
  for (const z of ZONE_ORDER) {
    const count = Math.max(1, m.floors[z]);
    const [width, depth] = m.footprint[z];
    zones[z] = { floors: [next, next + count - 1], width, depth, height: m.heights?.[z] ?? DEFAULT_HEIGHTS[z], shape: toShape(m.zoneShapes?.[z] ?? m.shape) };
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
    taper: m.taper ?? 1,
    // Core ≈ 36% of the smallest plate, capped — keeps corridors around it on slim crowns.
    coreSize: m.coreSize ?? Math.min(2.6, +(minPlate * 0.36).toFixed(2)),
    profile: { setbacks: m.setbacks ?? [], taperCurve: m.taperCurve ?? "linear", bulge: m.bulge ?? 0 },
    facade: { ...DEFAULT_FACADE, ...m.facade },
    zones,
    ...(m.amenities?.length ? { amenities: m.amenities } : {}),
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
 *
 * Plate scale = taper (residential, eased) × bulge (office + residential
 * shaft) × setback (office + residential), all ≤ 1.
 */
export function generateFloors(spec: BuildingSpec): FloorData[] {
  const floors: FloorData[] = [];
  const lastFloor = spec.zones.crown.floors[1];
  const twistStart = spec.zones.residential.floors[0];
  const profile = spec.profile ?? { setbacks: [], taperCurve: "linear", bulge: 0 };
  const shaftStart = spec.zones.office.floors[0];
  const shaftEnd = spec.zones.residential.floors[1];
  // Keep-out half-size for the core in the plate frame (a twisted plate sees it rotated).
  const clear = (spec.coreSize / 2) * (spec.twistDeg ? Math.SQRT2 : 1) + 0.25;
  let y = 0;

  for (let number = 1; number <= lastFloor; number++) {
    const zone = zoneForFloor(spec, number);
    const geo = spec.zones[zone];
    const twisting = zone === "residential" || zone === "crown";
    const twistIndex = twisting ? number - twistStart : 0;
    // Taper: residential plates scale linearly from 1 (bottom) to `taper` (top).
    const resCount = geo.floors[1] - geo.floors[0];
    const t = zone === "residential" && resCount > 0 ? (number - geo.floors[0]) / resCount : 0;
    let scale = zone === "residential" ? 1 + (spec.taper - 1) * ease(t, profile.taperCurve) : 1;
    const shaft = zone === "office" || zone === "residential";
    if (shaft && profile.bulge > 0 && shaftEnd > shaftStart) {
      const s = (number - shaftStart) / (shaftEnd - shaftStart);
      scale *= 1 - profile.bulge * (1 - Math.sin(Math.PI * s));
    }
    if (shaft && profile.setbacks.length) {
      const f = (number - 1) / lastFloor;
      let sb = 1;
      for (const step of profile.setbacks) if (f >= step.at) sb = step.scale;
      scale *= Math.min(1, sb);
    }
    let width = +(geo.width * scale).toFixed(3);
    let depth = +(geo.depth * scale).toFixed(3);
    // With setbacks / bulge the crown must not overhang the stepped-in floor below it.
    const prev = floors[floors.length - 1];
    if (zone === "crown" && prev && (profile.setbacks.length || profile.bulge > 0)) {
      width = Math.min(width, prev.width);
      depth = Math.min(depth, prev.depth);
    }
    const shape = fitShapeToCore(geo.shape ?? RECT, width, depth, clear);

    floors.push({
      buildingId: spec.id,
      index: number - 1,
      number,
      zone,
      zoneIndex: number - geo.floors[0],
      width,
      depth,
      shape,
      height: geo.height,
      baseY: y,
      rotationY: (twistIndex * spec.twistDeg * Math.PI) / 180,
      footprintM2: shape.kind === "rect" ? width * depth : +polygonArea(planOutline(shape, width, depth)).toFixed(3),
      ...amenityFields(spec, number),
    });
    y += geo.height;
  }
  return floors;
}


/** `amenity` / `amenityName` for a floor (empty when it is an ordinary floor). */
function amenityFields(spec: BuildingSpec, number: number): Pick<FloorData, "amenity" | "amenityName"> {
  const a = spec.amenities?.find((x) => x.floor === number);
  return a ? { amenity: a.kind, ...(a.name ? { amenityName: a.name } : {}) } : {};
}

/** Taper easing curves, t ∈ [0, 1]. */
function ease(t: number, curve: MassingProfile["taperCurve"]): number {
  switch (curve) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    default:
      return t;
  }
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
