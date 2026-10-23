import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import { CARRIAGEWAY_WIDTH_M, STREET_WIDTH_M } from "./mappedGeometry";
import { MODEL_SCALE as M, planOutline, pointInPolygon, type PlanPoint } from "./tower";
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

/**
 * Occupancy raster of everything a tree must not stand in: mapped buildings,
 * mapped water and the proposal's floor outlines. One byte per ~1.4 m cell.
 * Rasterising once makes each candidate an O(1) lookup, so thousands of trees
 * are planned in tens of milliseconds instead of seconds of polygon tests.
 */
function occupancy(snapshot: MapSnapshot, location: ProjectLocation, buildings: Building[], extent: number) {
  const cell = 0.4, size = Math.ceil((extent * 2) / cell);
  const grid = new Uint8Array(size * size);
  // Even-odd scanline fill across every ring, so holes (courtyards, islands) stay open.
  const fill = (rings: PlanPoint[][]) => {
    if (!rings[0] || rings[0].length < 3) return;
    let minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const [x, z] of rings[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    if (maxX < -extent || maxZ < -extent || minX > extent || minZ > extent) return;
    const j0 = Math.max(0, Math.floor((minZ + extent) / cell)), j1 = Math.min(size - 1, Math.floor((maxZ + extent) / cell));
    const crossings: number[] = [];
    for (let j = j0; j <= j1; j++) {
      const z = -extent + (j + 0.5) * cell;
      crossings.length = 0;
      for (const ring of rings) for (let k = 0, n = ring.length; k < n; k++) {
        const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % n];
        if ((az <= z) !== (bz <= z)) crossings.push(ax + ((z - az) / (bz - az)) * (bx - ax));
      }
      crossings.sort((p, q) => p - q);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((crossings[k] + extent) / cell - 0.5)), i1 = Math.min(size - 1, Math.floor((crossings[k + 1] + extent) / cell - 0.5));
        if (i1 >= i0) grid.fill(1, j * size + i0, j * size + i1 + 1);
      }
    }
  };
  for (const feature of snapshot.features) {
    if (feature.kind !== "building" && feature.kind !== "water") continue;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    for (const polygon of polygons) fill(polygon.map((ring) => ring.map((point) => geographicToWorld(point, location)) as PlanPoint[]));
  }
  for (const building of buildings) {
    const seen = new Set<string>();
    for (const floor of building.floors) {
      const key = JSON.stringify([floor.shape, floor.width, floor.depth, floor.rotationY]);
      if (seen.has(key)) continue;
      seen.add(key);
      const c = Math.cos(floor.rotationY), s = Math.sin(floor.rotationY);
      fill([planOutline(floor.shape, floor.width, floor.depth).map(([x, z]): PlanPoint => [building.position[0] + x * c + z * s, building.position[1] - x * s + z * c])]);
    }
  }
  /** True when a crown of this radius around (x, z) touches nothing occupied. */
  return (x: number, z: number, radius: number) => {
    const i0 = Math.floor((x - radius + extent) / cell), i1 = Math.floor((x + radius + extent) / cell);
    const j0 = Math.floor((z - radius + extent) / cell), j1 = Math.floor((z + radius + extent) / cell);
    if (i0 < 0 || j0 < 0 || i1 >= size || j1 >= size) return false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (grid[j * size + i]) return false;
    return true;
  };
}

/** Deterministic tree layout for a map snapshot
 * building and water polygon, the proposal footprints and each other.
 * `extent` bounds the square (scene units around the pin) that receives trees. */
export function planCityTrees(snapshot: MapSnapshot | null, location: ProjectLocation, buildings: Building[], budget: { park: number; street: number }, extent = 560): CityTree[] {
  if (!snapshot) return [];
  const clear = occupancy(snapshot, location, buildings, extent);
  const rand = random(0x5eed + snapshot.features.length);
  const trees: CityTree[] = [];
  // Spacing between trees: a hash of 4-unit buckets holds the trees already placed.
  const placed = new Map<string, CityTree[]>();
  const bucket = (x: number, z: number) => `${Math.floor(x / 4)}:${Math.floor(z / 4)}`;
  const crowded = (x: number, z: number, radius: number) => {
    const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const t of placed.get(`${bx + dx}:${bz + dz}`) ?? []) if (Math.hypot(t.x - x, t.z - z) < radius + t.height * 0.275) return true;
    }
    return false;
  };
  const place = (x: number, z: number, height: number) => {
    const radius = height * 0.275;
    if (!clear(x, z, radius) || crowded(x, z, radius)) return false;
    const tree = { x, z, height, variant: rand() };
    trees.push(tree);
    const key = bucket(x, z);
    (placed.get(key) ?? placed.set(key, []).get(key)!).push(tree);
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
