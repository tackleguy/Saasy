"use client";
/**
 * Balconies — per-apartment balconies (residential) and penthouse terraces
 * (crown), visible in the normal exterior view.
 * -----------------------------------------------------------------------------
 * Planned by `balconyPlan` (lib/roomPlan): a strip of facade walked along the
 * plate outline (an arc on curved plates), projecting BALCONY_DEPTH outwards:
 *   • grey paved slab, top flush with the floor slab
 *   • glass balustrade with a dark bronze top rail and posts
 *   • a sliding glass door in the curtain wall (bronze frame, two leaves,
 *     one slid open, a transom bar for the multi-pane look)
 *   • a bistro set (two chairs + round table) beside the door and two potted
 *     plants at the ends
 *
 * Cheap: per plate shape + size everything is merged into THREE geometries
 * (paving, glass, and one vertex-coloured "solid" for frames, rails,
 * furniture and plants), cached and shared by every floor with that plate —
 * three draw calls per floor. Materials are per floor so they can fade with
 * the plate (dimmed / X-ray).
 *
 * Facade balcony band: when a building has `facade.balconies`, its band is
 * already a continuous slab with a glass rail around every residential floor,
 * so residential balconies skip their own slab + balustrade and just add the
 * slider and furniture on the band (depth matched to the band). Crown floors
 * have no band and always get full terraces.
 *
 * Plate-local METRES; render inside the twisted plate group, in a group at
 * y = SLAB_THICKNESS scaled by MODEL_SCALE.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BalconySpec, Pt } from "@/lib/roomPlan";
import { pavingBump, pavingTexture } from "../textures";
import { DETAIL } from "../layers";
import { mergeTag } from "../mergedStatics";

const TAG = { paving: mergeTag("balc-paving"), solid: mergeTag("balc-solid"), glass: mergeTag("balc-glass") };

const noRaycast = () => null;

const SLAB_T = 0.2;
const RAIL_H = 1.05;
const DOOR_H = 2.3;

const COLORS = {
  bronze: new THREE.Color("#3b2f25"),
  teak: new THREE.Color("#9a6b43"),
  pot: new THREE.Color("#8d867c"),
  leaf: new THREE.Color("#5f7f55"),
  leaf2: new THREE.Color("#78966a"),
  soil: new THREE.Color("#3e3128"),
};

interface BalconyGeo {
  paving: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  solid: THREE.BufferGeometry | null;
}

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const unit = (a: Pt): Pt => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/** Collects coloured primitives for one merged geometry. */
class Parts {
  readonly list: THREE.BufferGeometry[] = [];
  private push(g: THREE.BufferGeometry, color?: THREE.Color) {
    if (color) {
      const n = g.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    }
    this.list.push(g);
  }
  /** Box running a → b (plan), y0 → y1, `t` thick. */
  run(a: Pt, b: Pt, y0: number, y1: number, t: number, color?: THREE.Color) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-3) return;
    const g = new THREE.BoxGeometry(L, y1 - y0, t);
    g.rotateY(Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
    g.translate((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2);
    this.push(g, color);
  }
  /** Box of size (sx, sy, sz) centred at (c, y), rotated `rot` about Y. */
  box(c: Pt, y: number, sx: number, sy: number, sz: number, rot: number, color?: THREE.Color) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.rotateY(rot);
    g.translate(c[0], y, c[1]);
    this.push(g, color);
  }
  cyl(c: Pt, y0: number, r0: number, r1: number, h: number, color?: THREE.Color, seg = 14) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg);
    g.translate(c[0], y0 + h / 2, c[1]);
    this.push(g, color);
  }
  sphere(c: Pt, y: number, r: number, sy: number, color?: THREE.Color) {
    const g = new THREE.SphereGeometry(r, 12, 9);
    g.scale(1, sy, 1);
    g.translate(c[0], y, c[1]);
    this.push(g, color);
  }
  merge(): THREE.BufferGeometry | null {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    this.list.forEach((p) => p.dispose());
    return g;
  }
}

/** Kit-convention placement: local (lx, lz) rotated by `rot` about Y, then moved to `p`. */
function at(p: Pt, rot: number, lx: number, lz: number): Pt {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [p[0] + lx * c + lz * s, p[1] - lx * s + lz * c];
}

function chair(parts: Parts, p: Pt, rot: number) {
  const { bronze, teak } = COLORS;
  for (const [lx, lz] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ])
    parts.box(at(p, rot, lx, lz), 0.22, 0.03, 0.44, 0.03, rot, bronze);
  parts.box(at(p, rot, 0, 0), 0.46, 0.46, 0.04, 0.46, rot, teak);
  parts.box(at(p, rot, 0, -0.22), 0.72, 0.46, 0.34, 0.03, rot, teak);
}

function plant(parts: Parts, p: Pt) {
  parts.cyl(p, 0, 0.19, 0.24, 0.5, COLORS.pot);
  parts.cyl(p, 0.47, 0.21, 0.21, 0.02, COLORS.soil);
  parts.sphere(p, 0.95, 0.34, 1.3, COLORS.leaf);
  parts.sphere(add(p, [0.1, -0.06]), 1.35, 0.22, 1.2, COLORS.leaf2);
}

const geoCache = new Map<string, BalconyGeo>();

function buildGeo(specs: BalconySpec[]): BalconyGeo {
  const paving: THREE.BufferGeometry[] = [];
  const glass = new Parts();
  const solid = new Parts();
  for (const b of specs) {
    const n = b.inner.length;
    if (b.slab) {
      // Slab: inner line + outer line reversed, extruded down from y = 0.
      const shape = new THREE.Shape();
      const poly = [...b.inner, ...[...b.outer].reverse()];
      poly.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: SLAB_T, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); // shape (x, y) → (x, depth, −y): plan z = −y
      g.translate(0, -SLAB_T, 0);
      paving.push(g);

      // Balustrade along the outer edge + returns at both ends, inset from the slab edge.
      const inset = 0.06;
      const rail: Pt[] = b.outer.map((p, k) => {
        const nrm = unit(sub(p, b.inner[k]));
        return sub(p, mul(nrm, inset));
      });
      const path: Pt[] = [add(b.inner[0], mul(unit(sub(rail[0], b.inner[0])), 0.05)), ...rail, add(b.inner[n - 1], mul(unit(sub(rail[n - 1], b.inner[n - 1])), 0.05))];
      // Returns run from the facade to the outer edge; step them in along the edge so they sit on the slab.
      const along0 = unit(sub(b.inner[1], b.inner[0]));
      const along1 = unit(sub(b.inner[n - 2], b.inner[n - 1]));
      path[0] = add(path[0], mul(along0, inset));
      path[1] = add(path[1], mul(along0, inset));
      path[path.length - 1] = add(path[path.length - 1], mul(along1, inset));
      path[path.length - 2] = add(path[path.length - 2], mul(along1, inset));
      for (let k = 0; k + 1 < path.length; k++) {
        glass.run(path[k], path[k + 1], 0.04, RAIL_H - 0.04, 0.016);
        solid.run(path[k], path[k + 1], RAIL_H - 0.04, RAIL_H + 0.01, 0.05, COLORS.bronze);
        solid.run(path[k], path[k + 1], 0, 0.04, 0.04, COLORS.bronze);
      }
      // Posts at every vertex and every ~1.2 m
      const posts: Pt[] = [path[0]];
      for (let k = 1; k < path.length; k++) {
        const L = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
        const m = Math.floor(L / 1.2);
        for (let j = 1; j <= m; j++) posts.push(add(path[k - 1], mul(sub(path[k], path[k - 1]), j / (m + 1))));
        posts.push(path[k]);
      }
      for (const p of posts) solid.box(p, RAIL_H / 2, 0.035, RAIL_H, 0.035, 0, COLORS.bronze);
    }

    // Sliding door in the curtain wall: bronze frame, two leaves (one slid open), transom bar.
    const { a, b: bb, n: out } = b.door;
    const e = unit(sub(bb, a));
    const W = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    const off = mul(out, 0.03);
    const A0 = add(a, off);
    const B0 = add(bb, off);
    const F = 0.06;
    const rot = Math.atan2(-e[1], e[0]);
    solid.box(add(A0, mul(e, F / 2)), DOOR_H / 2, F, DOOR_H, 0.08, rot, COLORS.bronze);
    solid.box(add(B0, mul(e, -F / 2)), DOOR_H / 2, F, DOOR_H, 0.08, rot, COLORS.bronze);
    solid.run(A0, B0, DOOR_H, DOOR_H + F, 0.08, COLORS.bronze);
    solid.run(A0, B0, 0, 0.03, 0.1, COLORS.bronze);
    const pw = (W - F * 2) / 2 + 0.03;
    const fixedC = add(B0, mul(e, -(F + pw / 2)));
    const slideC = add(add(B0, mul(e, -(F + pw * 0.62))), mul(out, 0.035));
    for (const c of [fixedC, slideC]) {
      glass.box(c, 0.05 + (DOOR_H - 0.1) / 2, pw - 0.08, DOOR_H - 0.1, 0.016, rot);
      for (const s of [-1, 1]) solid.box(add(c, mul(e, (s * (pw - 0.04)) / 2)), DOOR_H / 2, 0.04, DOOR_H - 0.02, 0.04, rot, COLORS.bronze);
      solid.box(c, 1.55, pw, 0.035, 0.035, rot, COLORS.bronze); // transom bar
      solid.box(c, 0.07, pw, 0.05, 0.04, rot, COLORS.bronze);
      solid.box(c, DOOR_H - 0.04, pw, 0.05, 0.04, rot, COLORS.bronze);
    }

    // Bistro set and plants
    solid.cyl(b.table, 0, 0.2, 0.2, 0.02, COLORS.bronze);
    solid.cyl(b.table, 0.02, 0.025, 0.025, 0.68, COLORS.bronze);
    solid.cyl(b.table, 0.7, 0.32, 0.32, 0.03, COLORS.teak, 20);
    for (const c of b.chairs) chair(solid, c.p, c.rot);
    const inNrm = (k: number) => unit(sub(b.outer[k], b.inner[k]));
    const endA = add(add(b.inner[0], mul(inNrm(0), b.depth * 0.6)), mul(unit(sub(b.inner[1], b.inner[0])), 0.45));
    const endB = add(add(b.inner[n - 1], mul(inNrm(n - 1), b.depth * 0.6)), mul(unit(sub(b.inner[n - 2], b.inner[n - 1])), 0.45));
    plant(solid, endA);
    plant(solid, endB);
  }
  return {
    paving: paving.length ? (mergeGeometries(paving, false) ?? null) : null,
    glass: glass.merge(),
    solid: solid.merge(),
  };
}

/** Merged balcony geometry for a plate (cached by key). */
export function balconyGeometry(key: string, specs: BalconySpec[]): BalconyGeo {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = buildGeo(specs);
  geoCache.set(key, g);
  return g;
}

interface Props {
  specs: BalconySpec[];
  /** Cache key for the merged geometry (plate zone + size + shape + band). */
  geoKey: string;
  dimmed?: boolean;
  xray?: boolean;
}

/** Ease an opaque material's opacity, flagging it transparent only while faded (see FloorPlate). */
function fadeSolid(m: THREE.Material, target: number, k: number) {
  m.opacity = THREE.MathUtils.lerp(m.opacity, target, k);
  const faded = m.opacity < 0.995;
  if (m.transparent !== faded) {
    m.transparent = faded;
    m.needsUpdate = true;
  }
  m.depthWrite = !faded;
}

export default function Balconies({ specs, geoKey, dimmed = false, xray = false }: Props) {
  const geo = useMemo(() => balconyGeometry(geoKey, specs), [geoKey, specs]);
  const mats = useMemo(() => {
    const map = pavingTexture().clone();
    const bump = pavingBump().clone();
    map.wrapS = map.wrapT = bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    map.repeat.set(0.6, 0.6); // ExtrudeGeometry UVs are in metres here
    bump.repeat.set(0.6, 0.6);
    map.needsUpdate = true;
    bump.needsUpdate = true;
    return {
      paving: new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.04, color: "#d4d0c8", roughness: 0.82 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#d7e3e5", roughness: 0.08, transparent: true, opacity: 0.32, depthWrite: false }),
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }),
    };
  }, []);
  useEffect(
    () => () => {
      mats.paving.map?.dispose();
      mats.paving.bumpMap?.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats]
  );

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0008, dt);
    const target = dimmed ? 0.15 : xray ? 0.4 : 1;
    fadeSolid(mats.paving, target, k);
    fadeSolid(mats.solid, target, k);
    mats.glass.opacity = THREE.MathUtils.lerp(mats.glass.opacity, dimmed ? 0.05 : 0.32, k);
  });

  return (
    <group>
      {geo.paving && <mesh geometry={geo.paving} material={mats.paving} castShadow receiveShadow raycast={noRaycast} userData={TAG.paving} />}
      {geo.solid && <mesh geometry={geo.solid} material={mats.solid} castShadow receiveShadow raycast={noRaycast} layers={DETAIL} userData={TAG.solid} />}
      {geo.glass && <mesh geometry={geo.glass} material={mats.glass} raycast={noRaycast} layers={DETAIL} userData={TAG.glass} />}
    </group>
  );
}
