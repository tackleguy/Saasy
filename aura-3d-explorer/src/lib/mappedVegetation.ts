import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import { createMappedStreetPlacement, streetDetailFootprint } from "./mappedStreetPlacement";
import { CARRIAGEWAY_WIDTH_M, STREET_WIDTH_M } from "./mappedGeometry";
import { MODEL_SCALE as M, pointInPolygon, type PlanPoint } from "./tower";
import type { Building } from "@/types";

/** One illustrative tree: scene position, height (scene units) and a 0…1 variant seed. */
export interface CityTree { x: number; z: number; height: number; variant: number }

export const CITY_TREE_BUDGET = {
  low: { park: 700, street: 0 },
  medium: { park: 1600, street: 1400 },
  high: { park: 3200, street: 3000 },
} as const;

/** Trees stand in mapped parks and along mapped streets, on the pavement band
 * between the carriageway and the kerb line. Positions are illustrative: the
 * snapshot records parks and street centrelines, not individual trees. */
export const STREET_TREE_OFFSET_M = (CARRIAGEWAY_WIDTH_M / 2 + STREET_WIDTH_M / 2) / 2 + 0.4;

function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic tree layout for a map snapshot, kept clear of every mapped
 * building and water polygon, the proposal footprints and each other.
 * `extent` bounds the square (scene units around the pin) that receives trees. */
export function planCityTrees(snapshot: MapSnapshot | null, location: ProjectLocation, buildings: Building[], budget: { park: number; street: number }, extent = 560): CityTree[] {
  if (!snapshot) return [];
  const placement = createMappedStreetPlacement(snapshot, location, buildings, extent);
  const rand = random(0x5eed + snapshot.features.length);
  const trees: CityTree[] = [];
  const place = (x: number, z: number, height: number) => {
    if (!placement.reserve(streetDetailFootprint(x, z, height * 0.55))) return false;
    trees.push({ x, z, height, variant: rand() });
    return true;
  };
  const inside = (x: number, z: number) => Math.abs(x) < extent - 2 && Math.abs(z) < extent - 2;

  let parks = 0;
  const spacing = 11 * M;
  for (const feature of snapshot.features) {
    if (feature.kind !== "park" || parks >= budget.park) continue;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    for (const polygon of polygons) {
      const rings = polygon.map(ring => ring.map(point => geographicToWorld(point, location)) as PlanPoint[]);
      const outer = rings[0];
      if (!outer || outer.length < 3) continue;
      const xs = outer.map(p => p[0]), zs = outer.map(p => p[1]);
      for (let x = Math.min(...xs) + spacing / 2; x < Math.max(...xs) && parks < budget.park; x += spacing) {
        for (let z = Math.min(...zs) + spacing / 2; z < Math.max(...zs) && parks < budget.park; z += spacing) {
          // Jittered grid with clearings: parks read as groves and lawns, not orchards.
          if (rand() < 0.28) continue;
          const px = x + (rand() - 0.5) * spacing * 0.8, pz = z + (rand() - 0.5) * spacing * 0.8;
          if (!inside(px, pz) || !pointInPolygon(outer, px, pz) || rings.slice(1).some(hole => pointInPolygon(hole, px, pz))) continue;
          if (place(px, pz, (7 + rand() * 7) * M)) parks++;
        }
      }
    }
  }

  let street = 0;
  const offset = STREET_TREE_OFFSET_M * M, pitch = 13 * M;
  for (const feature of snapshot.features) {
    if (feature.kind !== "road" || street >= budget.street) continue;
    const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [];
    for (const line of lines) for (let i = 1; i < line.length && street < budget.street; i++) {
      const a = geographicToWorld(line[i - 1], location), b = geographicToWorld(line[i], location);
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      // Leave junction corners open for sightlines.
      if (length < pitch * 2) continue;
      for (let t = pitch; t < length - pitch && street < budget.street; t += pitch) {
        for (const side of [-1, 1]) {
          const x = a[0] + dx * t / length - dz / length * offset * side, z = a[1] + dz * t / length + dx / length * offset * side;
          if (inside(x, z) && place(x, z, (6 + rand() * 4) * M)) street++;
        }
      }
    }
  }
  return trees;
}
