"use client";
/**
 * Doors — door leaves, frames and handles for an isolated floor, instanced.
 * -----------------------------------------------------------------------------
 * Plate-local METRES, same frame as Walls. Per DoorSpec (lib/roomPlan):
 *   • door    — espresso-walnut frame (jambs + head) and leaf, drawn OPEN
 *               (DOOR_OPEN, ~75°) so every opening reads from above, with a
 *               brass lever on both faces
 *   • arch    — the kit's round-headed arch gets a pair of half-arch leaves
 *               (no frame: the plaster arch is the surround)
 *   • slider  — two glass panels in dark bronze frames, the sliding one
 *               parked over the fixed one (half the opening is clear)
 *   • passage — frame only (a cased opening in front of a bathroom door)
 * ~6 InstancedMeshes per floor.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DOOR_OPEN, type DoorSpec, type Pt } from "@/lib/roomPlan";
import { interiorMaterials, UNIT_BOX, type InteriorMatKey } from "./materials";

const noRaycast = () => null;

const JAMB = 0.05;
const LEAF_T = 0.045;
const PANEL_T = 0.02;
const STILE = 0.045;

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];

/** Half of a round-headed leaf: hinge at x = 0, meeting stile at x = r; top rises from `spring` to `spring + r`. */
let archLeafGeo: THREE.BufferGeometry | null = null;
function archLeaf(): THREE.BufferGeometry {
  if (archLeafGeo) return archLeafGeo;
  // Unit leaf (r = 1, spring s = 2.5 in r units) scaled per instance: x by r, y by r, z by thickness.
  const s = new THREE.Shape();
  const n = 16;
  const spring = 2.5;
  s.moveTo(0, 0);
  s.lineTo(1, 0);
  s.lineTo(1, spring + 1);
  for (let i = 1; i <= n; i++) {
    const a = Math.PI / 2 + (i / n) * (Math.PI / 2); // from the top (x = 1) round to the jamb (x = 0)
    s.lineTo(1 + Math.cos(a), spring + Math.sin(a));
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  archLeafGeo = g;
  return g;
}

interface Batches {
  frame: THREE.Matrix4[];
  leaf: THREE.Matrix4[];
  arch: THREE.Matrix4[];
  handle: THREE.Matrix4[];
  glass: THREE.Matrix4[];
  bronze: THREE.Matrix4[];
}

const Y = new THREE.Vector3(0, 1, 0);

/** Box centred at (c, y) with its local X along `dir`. */
function boxAt(c: Pt, y: number, dir: Pt, sx: number, sy: number, sz: number): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(-dir[1], dir[0]));
  return new THREE.Matrix4().compose(new THREE.Vector3(c[0], y, c[1]), q, new THREE.Vector3(sx, sy, sz));
}

function build(doors: DoorSpec[]): Batches {
  const out: Batches = { frame: [], leaf: [], arch: [], handle: [], glass: [], bronze: [] };
  for (const d of doors) {
    const dx = d.b[0] - d.a[0];
    const dz = d.b[1] - d.a[1];
    const W = Math.hypot(dx, dz);
    if (W < 0.2) continue;
    const e: Pt = [dx / W, dz / W];
    const n: Pt = [-e[1], e[0]];
    const mid = mul(add(d.a, d.b), 0.5);
    const H = d.height;
    const depth = d.wallThickness + 0.03;

    if (d.arch) {
      // Pair of half-arch leaves hung on the jambs, both opening to the swing side.
      const r = d.arch.radius - 0.012;
      const scaleY = r; // unit shape is in r units; spring was modelled as 2.5 r
      const springFix = (d.arch.spring - 0.012) / (2.5 * r);
      for (const [hinge, closed] of [
        [d.a, e],
        [d.b, mul(e, -1)],
      ] as [Pt, Pt][]) {
        const open = add(mul(closed, Math.cos(DOOR_OPEN)), mul(n, d.swing * Math.sin(DOOR_OPEN)));
        const h = add(add(hinge, mul(closed, 0.01)), mul(n, d.swing * (d.wallThickness / 2 - LEAF_T / 2)));
        const q = new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(-open[1], open[0]));
        // Non-uniform Y so the spring height matches the kit arch exactly.
        const m = new THREE.Matrix4().compose(new THREE.Vector3(h[0], 0.005, h[1]), q, new THREE.Vector3(r, scaleY * springFix, LEAF_T));
        out.arch.push(m);
        const tip = add(h, mul(open, r - 0.08));
        const ln: Pt = [-open[1], open[0]];
        for (const side of [-1, 1]) out.handle.push(boxAt(add(tip, mul(ln, side * (LEAF_T / 2 + 0.012))), 1.0, open, 0.12, 0.02, 0.025));
      }
      continue;
    }

    // Frame: jambs + head (all kinds except arch)
    const frameMat = d.glass ? out.bronze : out.frame;
    frameMat.push(boxAt(add(d.a, mul(e, JAMB / 2)), H / 2, e, JAMB, H, depth));
    frameMat.push(boxAt(add(d.b, mul(e, -JAMB / 2)), H / 2, e, JAMB, H, depth));
    frameMat.push(boxAt(mid, H + JAMB / 2, e, W + JAMB * 0.5, JAMB, depth));

    const clearW = W - JAMB * 2;
    if (d.kind === "door") {
      const hingeAtA = d.hinge === "a";
      const closed: Pt = hingeAtA ? e : mul(e, -1);
      const hinge = hingeAtA ? add(d.a, mul(e, JAMB)) : add(d.b, mul(e, -JAMB));
      const h = add(hinge, mul(n, d.swing * (d.wallThickness / 2)));
      const open = add(mul(closed, Math.cos(DOOR_OPEN)), mul(n, d.swing * Math.sin(DOOR_OPEN)));
      const lw = clearW - 0.01;
      const lh = H - 0.015;
      const c = add(h, mul(open, lw / 2));
      out.leaf.push(boxAt(c, 0.008 + lh / 2, open, lw, lh, LEAF_T));
      const tip = add(h, mul(open, lw - 0.07));
      const ln: Pt = [-open[1], open[0]];
      for (const side of [-1, 1]) out.handle.push(boxAt(add(tip, mul(ln, side * (LEAF_T / 2 + 0.012))), 1.0, open, 0.12, 0.02, 0.025));
    } else if (d.kind === "slider") {
      // Fixed panel on the far half, sliding panel parked mostly over it.
      const pw = clearW / 2 + 0.03;
      const ph = H - 0.02;
      const fixedC = add(d.b, mul(e, -(JAMB + pw / 2)));
      const slideC = add(add(d.b, mul(e, -(JAMB + pw / 2 + pw * 0.04))), mul(n, PANEL_T * 1.6));
      for (const [c, off] of [
        [fixedC, 0],
        [slideC, 1],
      ] as [Pt, number][]) {
        out.glass.push(boxAt(c, 0.01 + ph / 2, e, pw - STILE, ph - STILE * 2, PANEL_T));
        for (const s of [-1, 1]) out.bronze.push(boxAt(add(c, mul(e, (s * (pw - STILE)) / 2)), 0.01 + ph / 2, e, STILE, ph, PANEL_T + 0.01 + off * 0.002));
        for (const y of [0.01 + STILE / 2, ph - STILE / 2 + 0.01]) out.bronze.push(boxAt(c, y, e, pw, STILE, PANEL_T + 0.01));
      }
    }
    // passage: frame only
  }
  return out;
}

function Batch({ matrices, mat, geo = UNIT_BOX, shadows = true }: { matrices: THREE.Matrix4[]; mat: InteriorMatKey; geo?: THREE.BufferGeometry; shadows?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return <instancedMesh ref={ref} args={[geo, interiorMaterials()[mat], matrices.length]} castShadow={shadows} receiveShadow raycast={noRaycast} />;
}

export default function Doors({ doors }: { doors: DoorSpec[] }) {
  const b = useMemo(() => build(doors), [doors]);
  return (
    <group>
      <Batch key={`f${b.frame.length}`} matrices={b.frame} mat="walnut" />
      <Batch key={`l${b.leaf.length}`} matrices={b.leaf} mat="walnut" />
      <Batch key={`a${b.arch.length}`} matrices={b.arch} mat="walnut" geo={archLeaf()} />
      <Batch key={`h${b.handle.length}`} matrices={b.handle} mat="brass" shadows={false} />
      <Batch key={`g${b.glass.length}`} matrices={b.glass} mat="glass" shadows={false} />
      <Batch key={`b${b.bronze.length}`} matrices={b.bronze} mat="bronze" />
    </group>
  );
}
