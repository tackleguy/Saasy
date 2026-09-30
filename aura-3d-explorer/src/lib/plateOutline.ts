/**
 * Plate outline helpers for the section cut, floor outlines and plan minimap.
 * -----------------------------------------------------------------------------
 * Plates may carry a non-rectangular plan shape (`floor.shape`, outlined by
 * `planOutline` in lib/tower.ts once it lands). This module reads that outline
 * defensively and falls back to the width × depth bounding box, so callers
 * always get a closed polygon of [x, z] points in the plate's local
 * (un-twisted) frame, scene units.
 */
import * as tower from "./tower";
import type { FloorData } from "@/types";

export type Pt = [number, number];

type OutlineFn = (shape: unknown, width: number, depth: number) => unknown;

function toPoints(raw: unknown): Pt[] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const pts: Pt[] = [];
  for (const p of raw) {
    if (Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") pts.push([p[0], p[1]]);
    else if (p && typeof p === "object" && typeof (p as { x?: unknown }).x === "number") {
      const o = p as { x: number; y?: number; z?: number };
      pts.push([o.x, typeof o.z === "number" ? o.z : o.y ?? 0]);
    } else return null;
  }
  return pts;
}

const rectOutline = (w: number, d: number): Pt[] => [
  [-w / 2, -d / 2],
  [w / 2, -d / 2],
  [w / 2, d / 2],
  [-w / 2, d / 2],
];

const cache = new Map<string, Pt[]>();

/** Closed plate outline (plate-local [x, z], scene units). */
export function plateOutline(floor: FloorData): Pt[] {
  const f = floor as FloorData & { outline?: unknown; shape?: unknown };
  const shapeKey = f.shape ? JSON.stringify(f.shape) : "rect";
  const key = `${shapeKey}:${floor.width}:${floor.depth}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let pts = toPoints(f.outline);
  const fn = (tower as unknown as { planOutline?: OutlineFn }).planOutline;
  if (!pts && f.shape && typeof fn === "function") {
    try {
      pts = toPoints(fn(f.shape, floor.width, floor.depth));
    } catch {
      pts = null;
    }
  }
  const out = pts ?? rectOutline(floor.width, floor.depth);
  cache.set(key, out);
  return out;
}

/** Rotate a plate-local point by the plate's twist into the building frame (R_y). */
export function rotateY([x, z]: Pt, angle: number): Pt {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * Extent of the outline along a line through the plate centre in direction
 * `dir` (unit [x, z], same frame as `pts`): returns [min, max] parameters, or
 * null if the line misses the polygon.
 */
export function lineExtent(pts: Pt[], dir: Pt): [number, number] | null {
  // Normal of the line; intersect each edge with n·p = 0.
  const nx = -dir[1];
  const nz = dir[0];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = a[0] * nx + a[1] * nz;
    const db = b[0] * nx + b[1] * nz;
    if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue;
    const t = da / (da - db);
    const px = a[0] + (b[0] - a[0]) * t;
    const pz = a[1] + (b[1] - a[1]) * t;
    const s = px * dir[0] + pz * dir[1];
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  return lo < hi ? [lo, hi] : null;
}
