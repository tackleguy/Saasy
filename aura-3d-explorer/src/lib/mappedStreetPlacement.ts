import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import { planOutline, pointInPolygon, type PlanPoint } from "./tower";
import type { Building } from "@/types";

type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };
type Obstacle = { rings: PlanPoint[][]; bounds: Bounds };
const EPSILON = 1e-7;
const boundsOf = (ring: PlanPoint[]): Bounds => ring.reduce((b, [x, z]) => ({ minX: Math.min(b.minX, x), minZ: Math.min(b.minZ, z), maxX: Math.max(b.maxX, x), maxZ: Math.max(b.maxZ, z) }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
const overlaps = (a: Bounds, b: Bounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
function intersects(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const cross = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const on = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => Math.abs(cross(p, q, r)) <= EPSILON && r[0] >= Math.min(p[0], q[0]) - EPSILON && r[0] <= Math.max(p[0], q[0]) + EPSILON && r[1] >= Math.min(p[1], q[1]) - EPSILON && r[1] <= Math.max(p[1], q[1]) + EPSILON;
  const p = cross(a, b, c), q = cross(a, b, d), r = cross(c, d, a), s = cross(c, d, b);
  return ((p > EPSILON && q < -EPSILON || p < -EPSILON && q > EPSILON) && (r > EPSILON && s < -EPSILON || r < -EPSILON && s > EPSILON)) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}
function collides(candidate: PlanPoint[], bounds: Bounds, obstacle: Obstacle) {
  if (!overlaps(bounds, obstacle.bounds)) return false;
  for (const ring of obstacle.rings) for (let i = 0; i < ring.length; i++) for (let j = 0; j < candidate.length; j++) {
    if (intersects(ring[i], ring[(i + 1) % ring.length], candidate[j], candidate[(j + 1) % candidate.length])) return true;
  }
  const [outer, ...holes] = obstacle.rings;
  return candidate.some(([x, z]) => pointInPolygon(outer, x, z) && !holes.some(hole => pointInPolygon(hole, x, z))) || outer.some(([x, z]) => pointInPolygon(candidate, x, z));
}

/** Ground footprint for a detail whose local X follows the road direction. */
export function streetDetailFootprint(x: number, z: number, length: number, width = length, heading = 0): PlanPoint[] {
  const cosine = Math.cos(heading), sine = Math.sin(heading);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as PlanPoint[]).map(([u, v]) => [x + u * length / 2 * cosine - v * width / 2 * sine, z + u * length / 2 * sine + v * width / 2 * cosine]);
}

/** A near-site spatial index keeps full-polygon clearance checks inexpensive.
 * Holes are preserved: a courtyard or an island is usable, its edge is not. */
export function createMappedStreetPlacement(snapshot: MapSnapshot | null, location: ProjectLocation, buildings: Building[]) {
  const grid = new Map<string, Obstacle[]>(), occupied: Obstacle[] = [];
  const region = { minX: -220, minZ: -220, maxX: 220, maxZ: 220 }, cellSize = 16;
  const keys = (bounds: Bounds) => {
    const result: string[] = [];
    for (let x = Math.floor(Math.max(region.minX, bounds.minX) / cellSize); x <= Math.floor(Math.min(region.maxX, bounds.maxX) / cellSize); x++) {
      for (let z = Math.floor(Math.max(region.minZ, bounds.minZ) / cellSize); z <= Math.floor(Math.min(region.maxZ, bounds.maxZ) / cellSize); z++) result.push(`${x}:${z}`);
    }
    return result;
  };
  const add = (rings: PlanPoint[][]) => {
    if (!rings[0] || rings[0].length < 3) return;
    const obstacle = { rings, bounds: boundsOf(rings[0]) };
    if (!overlaps(obstacle.bounds, region)) return;
    for (const key of keys(obstacle.bounds)) { const cell = grid.get(key) ?? []; cell.push(obstacle); grid.set(key, cell); }
  };
  for (const feature of snapshot?.features ?? []) {
    if (feature.kind !== "building" && feature.kind !== "water") continue;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    for (const polygon of polygons) add(polygon.map(ring => ring.slice(0, -1).map(point => geographicToWorld(point, location))));
  }
  for (const building of buildings) {
    const seen = new Set<string>();
    for (const floor of building.floors) {
      const key = JSON.stringify([floor.shape, floor.width, floor.depth, floor.rotationY]);
      if (seen.has(key)) continue; seen.add(key);
      const cosine = Math.cos(floor.rotationY), sine = Math.sin(floor.rotationY);
      add([planOutline(floor.shape, floor.width, floor.depth).map(([x, z]): PlanPoint => [building.position[0] + x * cosine + z * sine, building.position[1] - x * sine + z * cosine])]);
    }
  }
  const isClear = (footprint: PlanPoint[]) => {
    const bounds = boundsOf(footprint);
    if (footprint.length < 3 || !footprint.every(point => point.every(Number.isFinite)) || bounds.minX < region.minX || bounds.maxX > region.maxX || bounds.minZ < region.minZ || bounds.maxZ > region.maxZ) return false;
    const candidates = new Set(keys(bounds).flatMap(key => grid.get(key) ?? []));
    return ![...candidates].some(obstacle => collides(footprint, bounds, obstacle));
  };
  return {
    isClear,
    reserve(footprint: PlanPoint[]) {
      const bounds = boundsOf(footprint);
      if (!isClear(footprint) || occupied.some(obstacle => collides(footprint, bounds, obstacle))) return false;
      occupied.push({ rings: [footprint], bounds });
      return true;
    },
  };
}

export const STREET_DETAIL_BUDGET = {
  low: { trees: 24, cars: 0, lamps: 24, people: 0 },
  medium: { trees: 48, cars: 20, lamps: 44, people: 28 },
  high: { trees: 72, cars: 36, lamps: 64, people: 44 },
} as const;
