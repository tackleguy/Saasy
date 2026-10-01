/**
 * Merged statics — draw-call batching for idle buildings.
 * -----------------------------------------------------------------------------
 * Every floor plate is ~10 meshes (slab, core slice, lift doors, ceiling, fins,
 * balcony band / balustrade, arcade stone, balcony paving / furniture / glass),
 * so a 160-floor site is well over a thousand draw calls. While a building is
 * idle — no explosion, no isolated floor, no X-ray / section / walk — none of
 * those parts move or fade, so they are baked into ONE merged mesh per part
 * type (`userData.merge` tag) for the whole building and the per-floor
 * originals are switched off.
 *
 * The originals stay mounted (React keeps them, FloorPlate keeps easing them);
 * they're only hidden by clearing their layer mask, which also drops them from
 * the shadow pass and the water reflection. As soon as the building stops
 * being idle the originals are restored, so explode / isolate / X-ray / fades
 * work exactly as before; the bake is cached per building and reused when it
 * goes idle again.
 *
 * Curtain-wall glass is batched too, but as a separate "hover" group: the
 * per-floor glass is the click / hover target, so while merged it keeps only
 * RAYCAST_LAYER (still hit by the pointer, drawn by no camera). While any floor
 * of the building is hovered the per-floor glass comes back (it carries the
 * hover tint) and the merged glass steps aside.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { invalidateShadows, SETTLE_MS } from "./staticShadows";
import { RAYCAST_LAYER } from "./layers";

/**
 * `userData` tag for a mesh that may be merged into its building's batch of `key`.
 * `hover`: part of the hover group (curtain-wall glass) — stays raycastable while merged.
 * `rest`: material values the merged copy must have at rest (e.g. no hover tint),
 * in case the bake catches a floor mid-hover.
 */
export const mergeTag = (key: string, hover = false, rest?: Record<string, number>) => ({ merge: key, ...(hover && { mergeHover: true }), ...(rest && { mergeRest: rest }) });

/** How long after the pointer leaves a building its glass waits to re-merge (the hover tint fades out first). */
const HOVER_REMERGE_MS = 1200;

interface Baked {
  /** Merged meshes (building-local space), one per tag. */
  meshes: THREE.Mesh[];
  /** Tags that merged successfully: their originals are hidden while applied. */
  keys: Set<string>;
  /** Tags of the hover group (glass). */
  hoverKeys: Set<string>;
}

/** Latest bake per building id: { the building data it was baked from, result }. */
const cache = new Map<string, { source: unknown; baked: Baked }>();

const noRaycast = () => {};

function shown(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[];
  return !Array.isArray(m) && m.visible && m.opacity > 0.01;
}

interface Part {
  geometry: THREE.BufferGeometry;
  /** Building-local transform of this part. */
  matrix: THREE.Matrix4;
}

/**
 * Merge transformed parts into one geometry, writing straight into the output
 * arrays (no per-part clones): positions by the part matrix, normals by its
 * normal matrix, other shared attributes (uv, color) copied. Attributes not
 * present on every part are dropped; the result is indexed only if every part is.
 */
function mergeParts(parts: Part[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const first = parts[0].geometry;
  const names = Object.keys(first.attributes).filter(
    (n) => n !== "tangent" && parts.every((p) => p.geometry.getAttribute(n)?.itemSize === first.getAttribute(n).itemSize)
  );
  if (!names.includes("position")) return null;
  const indexed = parts.every((p) => p.geometry.index);
  const counts = parts.map((p) => (indexed || !p.geometry.index ? p.geometry.getAttribute("position").count : p.geometry.index.count));
  const total = counts.reduce((a, b) => a + b, 0);
  const out: Record<string, Float32Array> = {};
  for (const n of names) out[n] = new Float32Array(total * first.getAttribute(n).itemSize);
  const index = indexed ? new Uint32Array(parts.reduce((a, p) => a + p.geometry.index!.count, 0)) : null;

  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  let base = 0;
  let ib = 0;
  parts.forEach((p, k) => {
    const g = p.geometry;
    const gi = g.index;
    const expand = !indexed && gi; // indexed part into a non-indexed result
    const n = counts[k];
    nm.getNormalMatrix(p.matrix);
    const e = p.matrix.elements;
    const ne = nm.elements;
    const idx = expand ? (gi.array as ArrayLike<number>) : null;
    for (const name of names) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      const size = a.itemSize;
      const dst = out[name];
      const fast = !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !a.normalized;
      if (!fast) {
        // Rare (interleaved / normalised data): generic accessors.
        for (let i = 0; i < n; i++) {
          const src = idx ? idx[i] : i;
          const o = (base + i) * size;
          if (name === "position") v.fromBufferAttribute(a, src).applyMatrix4(p.matrix);
          else if (name === "normal") v.fromBufferAttribute(a, src).applyMatrix3(nm).normalize();
          if (name === "position" || name === "normal") {
            dst[o] = v.x;
            dst[o + 1] = v.y;
            dst[o + 2] = v.z;
          } else for (let c = 0; c < size; c++) dst[o + c] = a.getComponent(src, c);
        }
        continue;
      }
      const arr = (a as THREE.BufferAttribute).array as ArrayLike<number>;
      if (name === "position") {
        for (let i = 0; i < n; i++) {
          const s3 = (idx ? idx[i] : i) * 3;
          const x = arr[s3], y = arr[s3 + 1], z = arr[s3 + 2];
          const o = (base + i) * 3;
          dst[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
          dst[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          dst[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
      } else if (name === "normal") {
        for (let i = 0; i < n; i++) {
          const s3 = (idx ? idx[i] : i) * 3;
          const x = arr[s3], y = arr[s3 + 1], z = arr[s3 + 2];
          const nx = ne[0] * x + ne[3] * y + ne[6] * z;
          const ny = ne[1] * x + ne[4] * y + ne[7] * z;
          const nz = ne[2] * x + ne[5] * y + ne[8] * z;
          const l = Math.hypot(nx, ny, nz) || 1;
          const o = (base + i) * 3;
          dst[o] = nx / l;
          dst[o + 1] = ny / l;
          dst[o + 2] = nz / l;
        }
      } else if (!idx) {
        dst.set(size * n === arr.length ? (arr as Float32Array) : Array.prototype.slice.call(arr, 0, size * n), base * size);
      } else {
        for (let i = 0; i < n; i++) {
          const sI = idx[i] * size;
          const o = (base + i) * size;
          for (let c = 0; c < size; c++) dst[o + c] = arr[sI + c];
        }
      }
    }
    if (index && gi) {
      const ia = gi.array as ArrayLike<number>;
      for (let i = 0; i < gi.count; i++) index[ib + i] = ia[i] + base;
      ib += gi.count;
    }
    base += n;
  });

  const merged = new THREE.BufferGeometry();
  for (const n of names) merged.setAttribute(n, new THREE.BufferAttribute(out[n], first.getAttribute(n).itemSize));
  if (index) merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}

function bake(root: THREE.Object3D): Baked {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { src: THREE.Mesh; parts: Part[] }>();
  const inst = new THREE.Matrix4();
  root.traverse((o) => {
    const key = o.userData?.merge as string | undefined;
    const mesh = o as THREE.Mesh;
    if (!key || !mesh.isMesh || !shown(o, root)) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { src: mesh, parts: [] }));
    const im = mesh as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, inst);
        g.parts.push({ geometry: im.geometry, matrix: rel.clone().multiply(inst) });
      }
    } else {
      g.parts.push({ geometry: mesh.geometry, matrix: rel });
    }
  });

  const baked: Baked = { meshes: [], keys: new Set(), hoverKeys: new Set() };
  for (const [key, { src, parts }] of groups) {
    const geometry = mergeParts(parts);
    if (!geometry) continue;
    const material = (src.material as THREE.Material).clone();
    if (src.userData.mergeRest) Object.assign(material, src.userData.mergeRest);
    const m = new THREE.Mesh(geometry, material);
    m.name = `merged:${key}`;
    m.castShadow = src.castShadow;
    m.receiveShadow = src.receiveShadow;
    m.layers.mask = src.layers.mask;
    m.renderOrder = src.renderOrder;
    m.raycast = noRaycast; // clicks go to the per-floor glass
    m.matrixAutoUpdate = false;
    m.userData.mergedBatch = true;
    baked.meshes.push(m);
    baked.keys.add(key);
    if (src.userData.mergeHover) baked.hoverKeys.add(key);
  }
  return baked;
}

function disposeBaked(b: Baked) {
  for (const m of b.meshes) {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
}

function bakeFor(id: string, source: unknown, root: THREE.Object3D): Baked {
  const hit = cache.get(id);
  if (hit && hit.source === source) return hit.baked;
  if (hit) disposeBaked(hit.baked);
  const baked = bake(root);
  cache.set(id, { source, baked });
  return baked;
}

const RAYCAST_ONLY = 1 << RAYCAST_LAYER;

/** Hide the tagged originals of the statics (hover = false) or the hover group, add their merged meshes; returns the undo. */
function apply(root: THREE.Group, baked: Baked, hover: boolean): () => void {
  const inGroup = (key: string) => baked.keys.has(key) && baked.hoverKeys.has(key) === hover;
  const hidden: [THREE.Object3D, number][] = [];
  root.traverse((o) => {
    const key = o.userData?.merge as string | undefined;
    if (key && !o.userData.mergedBatch && inGroup(key)) {
      hidden.push([o, o.layers.mask]);
      // Drawn by no camera and casts no shadow; hover-group parts stay pickable.
      o.layers.mask = o.userData.mergeHover ? RAYCAST_ONLY : 0;
    }
  });
  const added = baked.meshes.filter((m) => inGroup(m.name.slice("merged:".length)));
  added.forEach((m) => root.add(m));
  return () => {
    added.forEach((m) => root.remove(m));
    hidden.forEach(([o, mask]) => (o.layers.mask = mask));
  };
}

/* One bake per idle slot, so several buildings never bake in the same frame. */
const queue: (() => void)[] = [];
let pumping = false;
function pump() {
  if (pumping || !queue.length) return;
  pumping = true;
  const run = () => {
    pumping = false;
    queue.shift()?.();
    pump();
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 500 });
  else setTimeout(run, 30);
}

/**
 * Batch a building's tagged floor parts while `idle`; the glass (hover group)
 * only while none of its floors is `hovering` either.
 * `source` identifies the building data the bake depends on (re-baked when it changes).
 */
export function useMergedStatics(root: RefObject<THREE.Group | null>, id: string, source: unknown, idle: boolean, hovering: boolean) {
  const first = useRef(true);
  const [baked, setBaked] = useState<Baked | null>(null);

  useLayoutEffect(() => {
    if (!root.current || !idle) return;
    let undo: (() => void) | null = null;
    let cancelled = false;
    // First mount: everything is already at rest. Later: let fades / explode settle first.
    const timer = setTimeout(
      () => {
        queue.push(() => {
          if (cancelled || !root.current) return;
          const b = bakeFor(id, source, root.current);
          undo = apply(root.current, b, false);
          setBaked(b);
          invalidateShadows();
        });
        pump();
      },
      first.current ? 300 : SETTLE_MS
    );
    first.current = false;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setBaked(null);
      if (undo) {
        undo();
        invalidateShadows();
      }
    };
  }, [root, id, source, idle]);

  // Glass: merged while idle and not hovered (re-merged once the hover tint has faded).
  const wasHovering = useRef(false);
  useLayoutEffect(() => {
    if (!baked || !idle || hovering || !root.current) {
      if (hovering) wasHovering.current = true;
      return;
    }
    let undo: (() => void) | null = null;
    const merge = () => root.current && (undo = apply(root.current, baked, true));
    const timer = wasHovering.current ? setTimeout(merge, HOVER_REMERGE_MS) : null;
    if (!timer) merge();
    wasHovering.current = false;
    return () => {
      if (timer) clearTimeout(timer);
      undo?.();
    };
  }, [root, baked, idle, hovering]);
}
