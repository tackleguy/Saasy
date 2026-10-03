import type { Building } from "@/types";
import { geographicToWorld, type LonLat, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import { MODEL_SCALE, planOutline, pointInPolygon, signedArea, type PlanPoint } from "./tower";

export type RoofDetailTier = "high" | "medium" | "low";
export type RoofDetailKind = "pads" | "housings" | "vents";
export interface RoofDetailInstance {
  roofId: string;
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
}
export interface MappedRoofDetailPlan {
  batches: Record<RoofDetailKind, RoofDetailInstance[]>;
  decoratedRoofs: number;
  units: number;
}
export const ROOF_DETAIL_BUDGET: Record<RoofDetailTier, number> = { high: 140, medium: 64, low: 18 };
const CANDIDATE_BUDGET: Record<RoofDetailTier, number> = { high: 240, medium: 120, low: 48 };
const RANGE = 300 * MODEL_SCALE;
const EPSILON = 1e-7;
type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };
type Polygon = { rings: PlanPoint[][]; bounds: Bounds };
type Roof = Polygon & { id: string; height: number; recorded: boolean; distance: number };
const boundsOf = (points: PlanPoint[]): Bounds => points.reduce((bounds, [x, z]) => ({ minX: Math.min(bounds.minX, x), minZ: Math.min(bounds.minZ, z), maxX: Math.max(bounds.maxX, x), maxZ: Math.max(bounds.maxZ, z) }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
const overlap = (a: Bounds, b: Bounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const inside = (polygon: Polygon, point: PlanPoint) => pointInPolygon(polygon.rings[0], ...point) && !polygon.rings.slice(1).some(hole => pointInPolygon(hole, ...point));

function intersects(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): boolean {
  const cross = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const on = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => Math.abs(cross(p, q, r)) <= EPSILON && r[0] >= Math.min(p[0], q[0]) - EPSILON && r[0] <= Math.max(p[0], q[0]) + EPSILON && r[1] >= Math.min(p[1], q[1]) - EPSILON && r[1] <= Math.max(p[1], q[1]) + EPSILON;
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  return (ac * ad < 0 && ca * cb < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}
function boundariesIntersect(a: Polygon, b: Polygon): boolean {
  for (const ar of a.rings) for (const br of b.rings) {
    for (let i = 0; i < ar.length; i++) for (let j = 0; j < br.length; j++) {
      if (intersects(ar[i], ar[(i + 1) % ar.length], br[j], br[(j + 1) % br.length])) return true;
    }
  }
  return false;
}
function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  return overlap(a.bounds, b.bounds) && (boundariesIntersect(a, b) || a.rings[0].some(point => inside(b, point)) || b.rings[0].some(point => inside(a, point)));
}
function containsPad(roof: Polygon, pad: Polygon): boolean {
  return pad.rings[0].every(point => inside(roof, point)) && !boundariesIntersect(roof, pad)
    && !roof.rings.slice(1).some(hole => pointInPolygon(pad.rings[0], ...hole[0]));
}
function rectangle(x: number, z: number, width: number, depth: number, rotation: number): Polygon {
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const ring: PlanPoint[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dz]) => [x + dx * width / 2 * cosine + dz * depth / 2 * sine, z - dx * width / 2 * sine + dz * depth / 2 * cosine]);
  return { rings: [ring], bounds: boundsOf(ring) };
}
function randomFor(id: string) {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return () => { value = Math.imul(value, 1664525) + 1013904223 | 0; return (value >>> 0) / 4294967296; };
}
function proposalPolygons(buildings: Building[]): Polygon[] {
  return buildings.flatMap(building => {
    const seen = new Set<string>();
    return building.floors.flatMap(floor => {
      const key = JSON.stringify([floor.width, floor.depth, floor.rotationY, floor.shape]);
      if (seen.has(key)) return [];
      seen.add(key);
      const cosine = Math.cos(floor.rotationY), sine = Math.sin(floor.rotationY);
      const ring = planOutline(floor.shape, floor.width, floor.depth).map(([x, z]): PlanPoint => [building.position[0] + x * cosine + z * sine, building.position[1] - x * sine + z * cosine]);
      return [{ rings: [ring], bounds: boundsOf(ring) }];
    });
  });
}

/** Sparse illustrative equipment, not surveyed rooftop assets. Geometry and
 * elevation come from recorded map roofs; unknown/estimated roofs stay untouched. */
export function buildMappedRoofDetails(snapshot: MapSnapshot, origin: ProjectLocation, buildings: Building[] = [], tier: RoofDetailTier = "medium"): MappedRoofDetailPlan {
  const batches: MappedRoofDetailPlan["batches"] = { pads: [], housings: [], vents: [] };
  const proposals = proposalPolygons(buildings);
  const roofs: Roof[] = [];
  const projectPolygon = (coordinates: LonLat[][]): Polygon | null => {
    // Reject distant bounding boxes before projecting every coordinate.
    const geographicBounds = boundsOf(coordinates[0]);
    const a = geographicToWorld([geographicBounds.minX, geographicBounds.minZ], origin), b = geographicToWorld([geographicBounds.maxX, geographicBounds.maxZ], origin);
    const bounds = boundsOf([a, b]);
    const nearestX = Math.max(bounds.minX, Math.min(0, bounds.maxX)), nearestZ = Math.max(bounds.minZ, Math.min(0, bounds.maxZ));
    if (Math.hypot(nearestX, nearestZ) > RANGE) return null;
    const rings = coordinates.map(ring => {
      const local = ring.map(point => geographicToWorld(point, origin));
      if (local.length > 1 && local[0][0] === local.at(-1)![0] && local[0][1] === local.at(-1)![1]) local.pop();
      return local;
    });
    return rings.some(ring => ring.length < 3) ? null : { rings, bounds };
  };
  for (const feature of snapshot.features) {
    if (feature.kind !== "building" || !Number.isFinite(feature.height) || feature.height! <= Math.max(0, feature.minHeight ?? 0) || feature.heightSource === "unknown") continue;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    polygons.forEach((coordinates, index) => {
      const polygon = projectPolygon(coordinates);
      // The main mapped builder removes this entire footprint on intersection;
      // decorating any remaining corner would otherwise create floating details.
      if (!polygon || proposals.some(proposal => polygonsOverlap(polygon, proposal))) return;
      const { bounds } = polygon;
      roofs.push({ ...polygon, id: `${feature.id}:${index}`, height: feature.height! * MODEL_SCALE, recorded: feature.heightSource === "recorded", distance: Math.hypot((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2) });
    });
  }
  const candidates = roofs.filter(roof => roof.recorded)
    .sort((a, b) => a.distance - b.distance || b.height - a.height || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, CANDIDATE_BUDGET[tier]);
  const accepted: { polygon: Polygon; height: number }[] = [];
  let decoratedRoofs = 0;
  for (const roof of candidates) {
    if (batches.pads.length >= ROOF_DETAIL_BUDGET[tier]) break;
    const area = (Math.abs(signedArea(roof.rings[0])) - roof.rings.slice(1).reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0)) / MODEL_SCALE ** 2;
    if (area < 24) continue;
    const random = randomFor(roof.id), desired = tier === "low" ? 1 : area > 600 ? 3 : area > 150 ? 2 : 1;
    let longest = 0, rotationY = 0, count = 0;
    const ring = roof.rings[0];
    for (let i = 0; i < ring.length; i++) {
      const next = ring[(i + 1) % ring.length], dx = next[0] - ring[i][0], dz = next[1] - ring[i][1], length = Math.hypot(dx, dz);
      if (length > longest) { longest = length; rotationY = Math.atan2(-dz, dx); }
    }
    const blockers = roofs.filter(other => other !== roof && other.height > roof.height + EPSILON && overlap(other.bounds, roof.bounds));
    for (let attempt = 0; attempt < desired * 16 && count < desired && batches.pads.length < ROOF_DETAIL_BUDGET[tier]; attempt++) {
      const width = (1.4 + random() * .9) * MODEL_SCALE, depth = (.9 + random() * .5) * MODEL_SCALE, height = (.55 + random() * .25) * MODEL_SCALE;
      const x = roof.bounds.minX + (.12 + random() * .76) * (roof.bounds.maxX - roof.bounds.minX), z = roof.bounds.minZ + (.12 + random() * .76) * (roof.bounds.maxZ - roof.bounds.minZ);
      const padWidth = width + .7 * MODEL_SCALE, padDepth = depth + .7 * MODEL_SCALE, padHeight = .09 * MODEL_SCALE;
      const pad = rectangle(x, z, padWidth, padDepth, rotationY);
      if (pad.rings[0].some(([px, pz]) => Math.hypot(px, pz) > RANGE) || !containsPad(roof, pad) || blockers.some(other => polygonsOverlap(other, pad)) || accepted.some(other => Math.abs(other.height - roof.height) < MODEL_SCALE && polygonsOverlap(other.polygon, pad))) continue;
      const base = roof.height + .008;
      const instance = (positionY: number, size: [number, number, number]): RoofDetailInstance => ({ roofId: roof.id, position: [x, positionY, z], size, rotationY });
      batches.pads.push(instance(base + padHeight / 2, [padWidth, padHeight, padDepth]));
      batches.housings.push(instance(base + padHeight + height / 2, [width, height, depth]));
      const ventHeight = .025 * MODEL_SCALE;
      batches.vents.push(instance(base + padHeight + height + ventHeight / 2, [width * .72, ventHeight, depth * .7]));
      accepted.push({ polygon: pad, height: roof.height });
      count++;
    }
    if (count) decoratedRoofs++;
  }
  return { batches, decoratedRoofs, units: batches.pads.length };
}
