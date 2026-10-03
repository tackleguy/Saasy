import * as THREE from "three";
import { geographicToWorld, type LonLat, type MapFeature, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import { MODEL_SCALE, planOutline, pointInPolygon, signedArea, type PlanPoint } from "./tower";
import type { Building } from "@/types";

export type MapBatchKind = "walls" | "roofs" | "footprints" | "water" | "parks" | "roads";
export interface MapGeometryBatch { kind: MapBatchKind; geometry: THREE.BufferGeometry }
export interface MappedGeometry {
  batches: MapGeometryBatch[];
  sourceId: string;
  featureCount: number;
  buildingPolygons: number;
  hiddenBuildingPolygons: number;
  unknownHeightFootprints: number;
  dispose(): void;
}
type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };
type Footprint = { ring: PlanPoint[]; bounds: Bounds };
type SurfaceAttributes = { facade: number[]; building: number[] };
type SurfaceIdentity = { seed: number; height: number };
type CapAttributes = SurfaceIdentity & { target: SurfaceAttributes; bounds: Bounds; width: number };
const EPSILON = 1e-8;
const boundsOf = (ring: PlanPoint[]): Bounds => ring.reduce((b, [x, z]) => ({ minX: Math.min(b.minX, x), minZ: Math.min(b.minZ, z), maxX: Math.max(b.maxX, x), maxZ: Math.max(b.maxZ, z) }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
const overlaps = (a: Bounds, b: Bounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/** Feature identity is independent of traversal order, chunk size and project
 * pin. Use 24 bits so Float32 attributes never round the seed up to 1. */
function buildingSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 8) / 16777216;
}

/** Use the actual floor outlines, including twist and non-rectangular plans.
 * An enclosing rectangle would erase unrelated buildings beside an L-shaped site. */
function proposalFootprints(buildings: Building[]): Footprint[] {
  return buildings.flatMap(building => {
    const seen = new Set<string>();
    return building.floors.flatMap(floor => {
      const key = JSON.stringify([floor.width, floor.depth, floor.rotationY, floor.shape]);
      if (seen.has(key)) return [];
      seen.add(key);
      const cosine = Math.cos(floor.rotationY), sine = Math.sin(floor.rotationY);
      const ring = planOutline(floor.shape, floor.width, floor.depth).map(([x, z]): PlanPoint => [building.position[0] + x * cosine + z * sine, building.position[1] - x * sine + z * cosine]);
      return [{ ring, bounds: boundsOf(ring) }];
    });
  });
}

function segmentsIntersect(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): boolean {
  const cross = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const on = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => Math.abs(cross(p, q, r)) <= EPSILON && r[0] >= Math.min(p[0], q[0]) - EPSILON && r[0] <= Math.max(p[0], q[0]) + EPSILON && r[1] >= Math.min(p[1], q[1]) - EPSILON && r[1] <= Math.max(p[1], q[1]) + EPSILON;
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return ((abC > EPSILON && abD < -EPSILON || abC < -EPSILON && abD > EPSILON) && (cdA > EPSILON && cdB < -EPSILON || cdA < -EPSILON && cdB > EPSILON)) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

function intersectsProposal(rings: PlanPoint[][], proposals: Footprint[]): boolean {
  const outer = rings[0], bounds = boundsOf(outer);
  return proposals.some(proposal => {
    if (!overlaps(bounds, proposal.bounds)) return false;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) for (let j = 0; j < proposal.ring.length; j++) {
      if (segmentsIntersect(ring[i], ring[(i + 1) % ring.length], proposal.ring[j], proposal.ring[(j + 1) % proposal.ring.length])) return true;
    }
    if (proposal.ring.some(([x, z]) => pointInPolygon(outer, x, z) && !rings.slice(1).some(hole => pointInPolygon(hole, x, z)))) return true;
    return outer.some(([x, z]) => pointInPolygon(proposal.ring, x, z));
  });
}

function worldRings(coordinates: LonLat[][], origin: ProjectLocation): PlanPoint[][] {
  return coordinates.map((ring, index) => {
    const points = ring.map(point => geographicToWorld(point, origin));
    if (points.length > 1 && points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1]) points.pop();
    // Outer walls face out; courtyard walls face into their holes.
    if ((signedArea(points) > 0) !== (index === 0)) points.reverse();
    return points;
  });
}

function cap(target: number[], rings: PlanPoint[][], y: number, up = true, attributes?: CapAttributes): void {
  const vectors = rings.map(ring => ring.map(([x, z]) => new THREE.Vector2(x, z)));
  const points = rings.flat();
  const triangles = THREE.ShapeUtils.triangulateShape(vectors[0], vectors.slice(1));
  for (const triangle of triangles) {
    const a = points[triangle[0]], b = points[triangle[1]], c = points[triangle[2]];
    // A positive 2D cross in X/Z points down in the Y-up world.
    const normalY = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    const ordered = (normalY > 0) === up ? [a, b, c] : [a, c, b];
    for (const point of ordered) {
      target.push(point[0], y, point[1]);
      if (attributes) {
        attributes.target.facade.push((point[0] - attributes.bounds.minX) / MODEL_SCALE, (point[1] - attributes.bounds.minZ) / MODEL_SCALE);
        attributes.target.building.push(attributes.seed, attributes.height, attributes.width);
      }
    }
  }
}

function walls(target: number[], rings: PlanPoint[][], bottom: number, top: number, attributes: SurfaceAttributes, identity: SurfaceIdentity): void {
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    target.push(a[0], bottom, a[1], a[0], top, a[1], b[0], top, b[1], a[0], bottom, a[1], b[0], top, b[1], b[0], bottom, b[1]);
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]) / MODEL_SCALE;
    const low = bottom / MODEL_SCALE, high = top / MODEL_SCALE;
    // Edge-local metres let the shader fit complete facade bays to a real wall
    // without stretching a texture or depending on world-axis orientation.
    attributes.facade.push(0, low, 0, high, width, high, 0, low, width, high, width, low);
    for (let vertex = 0; vertex < 6; vertex++) attributes.building.push(identity.seed, identity.height, width);
  }
}

/** Incremental CPU builder: the renderer yields between batches so larger map
 * snapshots do not monopolize the browser while footprints are triangulated. */
export function createMappedGeometryBuilder(snapshot: MapSnapshot, origin: ProjectLocation, buildings: Building[]) {
  const proposals = proposalFootprints(buildings);
  const positions: Record<MapBatchKind, number[]> = { walls: [], roofs: [], footprints: [], water: [], parks: [], roads: [] };
  const attributes: Record<"walls" | "roofs", SurfaceAttributes> = { walls: { facade: [], building: [] }, roofs: { facade: [], building: [] } };
  let index = 0, buildingPolygons = 0, hiddenBuildingPolygons = 0, unknownHeightFootprints = 0;

  function add(feature: MapFeature) {
    if (feature.kind === "road") {
      const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [];
      for (const line of lines) for (let i = 1; i < line.length; i++) {
        const a = geographicToWorld(line[i - 1], origin), b = geographicToWorld(line[i], origin);
        positions.roads.push(a[0], 0.04, a[1], b[0], 0.04, b[1]);
      }
      return;
    }
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    for (const polygon of polygons) {
      const rings = worldRings(polygon, origin);
      if (!rings[0] || rings.some(ring => ring.length < 3)) continue;
      if (feature.kind === "water" || feature.kind === "park") {
        cap(positions[feature.kind === "water" ? "water" : "parks"], rings, feature.kind === "water" ? 0.015 : 0.02);
        continue;
      }
      if (intersectsProposal(rings, proposals)) { hiddenBuildingPolygons++; continue; }
      buildingPolygons++;
      const minimum = Math.max(0, feature.minHeight ?? 0);
      if (feature.heightSource === "unknown" || !Number.isFinite(feature.height) || feature.height! <= minimum) {
        cap(positions.footprints, rings, 0.03);
        unknownHeightFootprints++;
        continue;
      }
      const bottom = minimum * MODEL_SCALE, top = feature.height! * MODEL_SCALE;
      const identity = { seed: buildingSeed(feature.id), height: feature.height! };
      const bounds = boundsOf(rings[0]);
      const width = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / MODEL_SCALE;
      walls(positions.walls, rings, bottom, top, attributes.walls, identity);
      cap(positions.roofs, rings, top, true, { ...identity, target: attributes.roofs, bounds, width });
      // Elevated parts need a closed underside, but must not receive a vertical
      // facade treatment. Width zero identifies these faces in the wall batch.
      if (bottom > 0) cap(positions.walls, rings, bottom, false, { ...identity, target: attributes.walls, bounds, width: 0 });
    }
  }

  return {
    get complete() { return index === snapshot.features.length; },
    step(maxFeatures = 64) {
      const until = Math.min(snapshot.features.length, index + maxFeatures);
      while (index < until) add(snapshot.features[index++]);
    },
    finish(): MappedGeometry {
      if (index !== snapshot.features.length) throw new Error("Map geometry is still being prepared");
      const batches = (Object.keys(positions) as MapBatchKind[]).flatMap(kind => {
        if (!positions[kind].length) return [];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions[kind], 3));
        if (kind === "walls" || kind === "roofs") {
          geometry.setAttribute("auraFacade", new THREE.Float32BufferAttribute(attributes[kind].facade, 2));
          geometry.setAttribute("auraBuilding", new THREE.Float32BufferAttribute(attributes[kind].building, 3));
          attributes[kind].facade = [];
          attributes[kind].building = [];
        }
        if (kind !== "roads") geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        positions[kind] = [];
        return [{ kind, geometry }];
      });
      let disposed = false;
      return { batches, sourceId: snapshot.id, featureCount: snapshot.features.length, buildingPolygons, hiddenBuildingPolygons, unknownHeightFootprints, dispose() { if (disposed) return; disposed = true; batches.forEach(batch => batch.geometry.dispose()); } };
    },
  };
}

/** Synchronous entry point for independent geometry tests and small snapshots. */
export function buildMappedGeometry(snapshot: MapSnapshot, origin: ProjectLocation, buildings: Building[] = []): MappedGeometry {
  const builder = createMappedGeometryBuilder(snapshot, origin, buildings);
  while (!builder.complete) builder.step();
  return builder.finish();
}
