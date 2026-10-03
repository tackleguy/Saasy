import * as THREE from "three";
import type { MapSnapshot, ProjectLocation } from "./geographicContext";
import { createMappedGeometryBuilder, type MapBatchKind, type MapGeometryBatch, type MappedGeometry } from "./mappedGeometry";
import type { Building } from "@/types";

/** Index only vertices whose complete attributes match bit for bit. In
 * particular, coincident corners on different walls must retain their sharp
 * normals, wall-local window coordinates and source-building identity. */
function* indexExactVertices(geometry: THREE.BufferGeometry): Generator<void> {
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => {
    // The map builder owns plain Float32 attributes; no interleaved or dynamic
    // GPU attributes are passed through this path.
    if (!(attribute instanceof THREE.BufferAttribute) || !(attribute.array instanceof Float32Array)) {
      throw new TypeError("Unexpected downtown vertex attribute");
    }
    return { name, attribute, bits: new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length) };
  });
  const count = geometry.getAttribute("position").count;
  const lookup = new Map<number, number>();
  const representatives = new Uint32Array(count);
  const links = new Int32Array(count);
  const indices = new Uint32Array(count);
  let uniqueCount = 0;

  const equal = (a: number, b: number) => {
    for (const { attribute, bits } of attributes) {
      for (let component = 0; component < attribute.itemSize; component++) {
        if (bits[a * attribute.itemSize + component] !== bits[b * attribute.itemSize + component]) return false;
      }
    }
    return true;
  };

  for (let vertex = 0; vertex < count; vertex++) {
    let hash = 2166136261;
    for (const { attribute, bits } of attributes) {
      for (let component = 0; component < attribute.itemSize; component++) {
        hash = Math.imul(hash ^ bits[vertex * attribute.itemSize + component], 16777619);
      }
    }
    const first = lookup.get(hash) ?? -1;
    let existing = first;
    while (existing !== -1 && !equal(vertex, representatives[existing])) existing = links[existing];
    if (existing !== -1) {
      indices[vertex] = existing;
    } else {
      indices[vertex] = uniqueCount;
      representatives[uniqueCount] = vertex;
      links[uniqueCount] = first;
      lookup.set(hash, uniqueCount++);
    }
    if ((vertex + 1) % 2048 === 0) yield;
  }

  const bytesPerVertex = attributes.reduce((bytes, { attribute }) => bytes + attribute.itemSize * 4, 0);
  const indexBytes = uniqueCount <= 65535 ? 2 : 4;
  // Isolated road segments and tiny shapes can cost more with an index. Keep
  // their original buffers rather than increasing storage to satisfy a rule.
  if (uniqueCount * bytesPerVertex + count * indexBytes >= count * bytesPerVertex) return;
  for (const { name, attribute } of attributes) {
    const compact = new Float32Array(uniqueCount * attribute.itemSize);
    for (let vertex = 0; vertex < uniqueCount; vertex++) {
      const source = representatives[vertex] * attribute.itemSize;
      for (let component = 0; component < attribute.itemSize; component++) {
        compact[vertex * attribute.itemSize + component] = attribute.array[source + component];
      }
      if ((vertex + 1) % 8192 === 0) yield;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(compact, attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(new THREE.BufferAttribute(indexBytes === 2 ? Uint16Array.from(indices) : indices, 1));
}

/** Bound the existing builder's typed-array conversion, normal calculation and
 * bounds pass to 64 source features, then copy into six final tile batches in
 * small blocks. A single exceptionally complex source polygon is indivisible. */
function* prepareTile(snapshot: MapSnapshot, origin: ProjectLocation, buildings: Building[], owned: Set<THREE.BufferGeometry>): Generator<void, MappedGeometry> {
  const chunks: MappedGeometry[] = [];
  let buildingPolygons = 0, hiddenBuildingPolygons = 0, unknownHeightFootprints = 0;
  for (let start = 0; start < snapshot.features.length; start += 64) {
    const builder = createMappedGeometryBuilder({ ...snapshot, features: snapshot.features.slice(start, start + 64) }, origin, buildings);
    builder.step(64);
    const chunk = builder.finish();
    chunks.push(chunk);
    buildingPolygons += chunk.buildingPolygons;
    hiddenBuildingPolygons += chunk.hiddenBuildingPolygons;
    unknownHeightFootprints += chunk.unknownHeightFootprints;
    chunk.batches.forEach(batch => owned.add(batch.geometry));
    yield;
    for (const { geometry } of chunk.batches) yield* indexExactVertices(geometry);
    yield;
  }

  const batches: MapGeometryBatch[] = [];
  for (const kind of ["walls", "roofs", "footprints", "water", "parks", "roads"] as MapBatchKind[]) {
    const sources = chunks.flatMap(chunk => chunk.batches.filter(batch => batch.kind === kind).map(batch => batch.geometry));
    if (!sources.length) continue;
    const geometry = new THREE.BufferGeometry();
    owned.add(geometry);
    const vertexCount = sources.reduce((sum, source) => sum + source.getAttribute("position").count, 0);
    const indexed = sources.some(source => source.index !== null);
    const indexCount = sources.reduce((sum, source) => sum + (source.index?.count ?? source.getAttribute("position").count), 0);
    const indices = indexed ? (vertexCount <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount)) : null;
    for (const [name, first] of Object.entries(sources[0].attributes)) {
      // Unit normals tolerate signed-byte quantization at distance. Positions,
      // metre-based facade coordinates and seeded identities stay Float32.
      const quantizedNormal = name === "normal";
      const array = quantizedNormal ? new Int8Array(vertexCount * first.itemSize) : new Float32Array(vertexCount * first.itemSize);
      let offset = 0;
      for (const source of sources) {
        const input = source.getAttribute(name).array as Float32Array;
        for (let start = 0; start < input.length; start += 16384) {
          const end = Math.min(input.length, start + 16384);
          if (quantizedNormal) {
            for (let i = start; i < end; i++) array[offset + i] = Math.round(Math.max(-1, Math.min(1, input[i])) * 127);
          } else array.set(input.subarray(start, end), offset + start);
          yield;
        }
        offset += input.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, first.itemSize, quantizedNormal || first.normalized));
    }
    let vertexOffset = 0, indexOffset = 0;
    const bounds = new THREE.Box3();
    for (const source of sources) {
      bounds.union(source.boundingBox!);
      if (indices) {
        const count = source.index?.count ?? source.getAttribute("position").count;
        for (let start = 0; start < count; start += 8192) {
          for (let i = start; i < Math.min(count, start + 8192); i++) indices[indexOffset + i] = (source.index ? source.index.getX(i) : i) + vertexOffset;
          yield;
        }
        indexOffset += count;
      }
      vertexOffset += source.getAttribute("position").count;
    }
    if (indices) geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    // Round outward so a corner never lands just outside the culling sphere.
    geometry.boundingSphere.radius += Math.max(1e-7, geometry.boundingSphere.radius * Number.EPSILON * 8);
    batches.push({ kind, geometry });
    yield;
  }
  for (const chunk of chunks) {
    chunk.dispose();
    chunk.batches.forEach(batch => owned.delete(batch.geometry));
  }
  let disposed = false;
  return {
    batches, sourceId: snapshot.id, featureCount: snapshot.features.length, buildingPolygons, hiddenBuildingPolygons, unknownHeightFootprints,
    dispose() {
      if (disposed) return;
      disposed = true;
      batches.forEach(batch => batch.geometry.dispose());
    },
  };
}

/** Distant map tiles retain every source feature, polygon hole and recorded
 * height. Only duplicate GPU vertices are removed. Roof equipment and street
 * decorations belong to the near context and are not generated here.
 *
 * Call step between animation frames. cancel releases unfinished CPU arrays;
 * once finish transfers a tile to the renderer, its dispose is caller-owned. */
export function createDowntownGeometryBuilder(snapshot: MapSnapshot, origin: ProjectLocation, buildings: Building[] = []) {
  const owned = new Set<THREE.BufferGeometry>();
  let work: Generator<void, MappedGeometry> | null = prepareTile(snapshot, origin, buildings, owned);
  let prepared: MappedGeometry | null = null;
  let cancelled = false;
  let complete = false;
  let finished: MappedGeometry | null = null;
  return {
    get complete() { return cancelled || complete; },
    get cancelled() { return cancelled; },
    step(maxFeatures = 64) {
      if (cancelled) throw new Error("Downtown geometry preparation was cancelled");
      if (!Number.isInteger(maxFeatures) || maxFeatures < 1) throw new RangeError("Downtown batch size must be a positive integer");
      if (complete) return;
      try {
        // One small indexing block per normal feature batch keeps duplicate
        // removal inside the caller's frame budget, including dense tiles.
        for (let chunk = 0; chunk < Math.max(1, Math.floor(maxFeatures / 64)); chunk++) {
          const step = work!.next();
          if (step.done) {
            prepared = step.value;
            complete = true;
            work = null;
            break;
          }
        }
      } catch (error) {
        owned.forEach(geometry => geometry.dispose());
        owned.clear();
        prepared = null;
        work = null;
        cancelled = true;
        throw error;
      }
    },
    finish(): MappedGeometry {
      if (cancelled) throw new Error("Downtown geometry preparation was cancelled");
      if (finished) return finished;
      if (!complete) throw new Error("Downtown geometry is still being prepared");
      finished = prepared!;
      prepared = null;
      owned.clear();
      return finished;
    },
    cancel() {
      if (finished) return;
      cancelled = true;
      work = null;
      owned.forEach(geometry => geometry.dispose());
      owned.clear();
      prepared = null;
    },
  };
}
