"use client";
/**
 * Trees — three species of low-poly canopy, plus palms in palm cities, with organic, noise-displaced
 * lobes, a bark-textured trunk and per-tree colour variation (instanceColor).
 * Street trees line both sides of the main road and the promenade; larger
 * specimens sit in the plaza and the courtyard behind the site.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LAYOUT, pointInRect, type UWRect } from "@/lib/siteLayout";
import type { CityPreset } from "@/lib/cityPresets";
import { barkTexture, leafTexture } from "../textures";
import { noRaycast, placeUW, rng, uploadInstances } from "./shared";

interface Tree {
  u: number;
  w: number;
  s: number;
  species: number;
  hue: THREE.Color;
}

/** Displace an icosphere's vertices radially by hashed noise → a clumpy lobe. */
function lobe(radius: number, seed: number, offset: [number, number, number]) {
  const g = new THREE.IcosahedronGeometry(radius, 2);
  const p = g.getAttribute("position");
  const r = rng(seed);
  const jitter = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) jitter[i] = 0.82 + r() * 0.36;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    // Same jitter for coincident vertices (icosphere seams) via a position hash.
    const h = Math.abs(Math.round(v.x * 37 + v.y * 91 + v.z * 53)) % p.count;
    v.multiplyScalar(jitter[h]);
    // Flatten the underside a little
    if (v.y < 0) v.y *= 0.7;
    p.setXYZ(i, v.x + offset[0], v.y + offset[1], v.z + offset[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** Three canopy shapes: round, tall-oval, spreading. */
function canopyGeometry(species: number) {
  const parts =
    species === 0
      ? [lobe(1, 3, [0, 0, 0]), lobe(0.6, 5, [0.55, 0.35, 0.2]), lobe(0.55, 7, [-0.5, 0.25, -0.3])]
      : species === 1
        ? [lobe(0.8, 9, [0, 0.35, 0]), lobe(0.7, 11, [0, -0.25, 0]), lobe(0.5, 13, [0.1, 0.9, 0.1])]
        : [lobe(1.15, 15, [0, 0, 0]), lobe(0.7, 17, [0.9, -0.1, 0.4]), lobe(0.65, 19, [-0.8, -0.05, -0.5]), lobe(0.5, 21, [0.2, 0.55, -0.7])];
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

function layout(preset: CityPreset): Tree[] {
  const r = rng(11);
  const out: Tree[] = [];
  const { hues, palms, density } = preset.trees;
  // Palm cities swap a share of the broadleaf trees for palms (species 3).
  const add = (u: number, w: number, s: number, species = Math.floor(r() * 3)) =>
    out.push({ u, w, s, species: r() < palms ? PALM : species, hue: new THREE.Color(hues[Math.floor(r() * hues.length)]) });

  // Promenade row (water side) — dense
  for (let u = -110; u <= 110; u += (5.5 + r() * 2) / density) add(u + (r() - 0.5), LAYOUT.sidewalkFar[1] + 1.1, 0.5 + r() * 0.18);
  // Near sidewalk — sparse, clear of the arcades
  for (const u of [-70, -58, -44, -8, 8, 44, 58, 70]) add(u, LAYOUT.sidewalkNear[0] + 0.8, 0.46 + r() * 0.12);
  // Plaza specimens between the podiums
  for (const [u, w] of [[-34, 6], [34, 6], [-12, -14], [12, -14], [-42, -26], [42, -26]] as [number, number][]) add(u + (r() - 0.5) * 2, w, 0.8 + r() * 0.35, 2);
  // Courtyard behind the site and along the side streets
  for (let i = 0; i < Math.round(26 * density); i++) add(-190 + r() * 380, -44 - r() * 200, 0.55 + r() * 0.5);
  for (let i = 0; i < Math.round(14 * density); i++) add((r() > 0.5 ? 1 : -1) * (64 + r() * 120), -40 + r() * 54, 0.5 + r() * 0.4);
  return out;
}

/* ------------------------------------------------------------------ palms */

const PALM = 3;

/** Palm trunk (gently curved, 1 unit tall at scale 1) and a crown of drooping fronds. */
const PALM_GEOMETRY = (() => {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0.08, 1, 0));
  const trunk = new THREE.TubeGeometry(curve, 10, 0.022, 7, false);
  const fronds: THREE.BufferGeometry[] = [];
  const N = 11;
  for (let f = 0; f < N; f++) {
    const a = (f / N) * Math.PI * 2 + (f % 2) * 0.2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const lift = f % 3 === 0 ? 0.12 : 0; // a few younger fronds point up
    const pos: number[] = [];
    const idx: number[] = [];
    const SEG = 7;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      // Out along the frond, rising a little then drooping.
      const c = new THREE.Vector3(0.08, 1.0, 0).addScaledVector(dir, t * 0.42).add(new THREE.Vector3(0, (lift + 0.08) * t - 0.34 * t * t, 0));
      const half = 0.085 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.004;
      const l = c.clone().addScaledVector(side, half).add(new THREE.Vector3(0, -half * 0.35, 0));
      const rr = c.clone().addScaledVector(side, -half).add(new THREE.Vector3(0, -half * 0.35, 0));
      pos.push(l.x, l.y, l.z, c.x, c.y, c.z, rr.x, rr.y, rr.z);
      if (k > 0) {
        const b = (k - 1) * 3;
        const n = k * 3;
        idx.push(b, n, b + 1, b + 1, n, n + 1, b + 1, n + 1, b + 2, b + 2, n + 1, n + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    fronds.push(g);
  }
  const crown = mergeGeometries(fronds, false)!;
  crown.computeVertexNormals();
  fronds.forEach((g) => g.dispose());
  return { trunk, crown };
})();

function Palms({ trees }: { trees: Tree[] }) {
  const { matrices, colors } = useMemo(() => {
    const H = 3.1; // ≈ 11 m at s = 0.5 × 2
    return {
      matrices: trees.map((t, i) => placeUW(t.u, t.w, 0, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.3), t.s * 2 * H)),
      colors: trees.map((t) => t.hue),
    };
  }, [trees]);
  if (!trees.length) return null;
  return (
    <group>
      <instancedMesh ref={(m) => uploadInstances(m, matrices)} args={[PALM_GEOMETRY.trunk, undefined, trees.length]} castShadow raycast={noRaycast}>
        <meshStandardMaterial map={barkTexture()} color="#b39c7c" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, matrices, colors)} args={[PALM_GEOMETRY.crown, undefined, trees.length]} castShadow raycast={noRaycast}>
        <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

export default function Trees({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  const planted = useMemo(() => layout(preset), [preset]);
  // Trees under a building moved on the site map are removed.
  const all = useMemo(() => planted.filter((t) => !clearings.some((c) => pointInRect(t.u, t.w, c))), [planted, clearings]);
  const trees = useMemo(() => all.filter((t) => t.species !== PALM), [all]);
  const palms = useMemo(() => all.filter((t) => t.species === PALM), [all]);
  const geos = useMemo(() => [0, 1, 2].map(canopyGeometry), []);
  const bark = barkTexture();
  const leaf = leafTexture();

  const trunk = useMemo(
    () => trees.map((t) => placeUW(t.u, t.w, 0.85 * t.s, new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s))),
    [trees]
  );

  return (
    <group>
      <Palms trees={palms} />
      {trees.length > 0 && <instancedMesh ref={(m) => uploadInstances(m, trunk)} args={[undefined, undefined, trees.length]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.06, 0.12, 1.7, 7]} />
        <meshStandardMaterial map={bark} roughness={0.95} />
      </instancedMesh>}
      {geos.map((geo, species) => {
        const items = trees.filter((t) => t.species === species);
        if (!items.length) return null;
        const matrices = items.map((t, i) =>
          placeUW(t.u, t.w, 2.35 * t.s, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), new THREE.Vector3(1.35 * t.s, 1.5 * t.s, 1.35 * t.s))
        );
        const colors = items.map((t) => t.hue);
        return (
          <instancedMesh key={species} ref={(m) => uploadInstances(m, matrices, colors)} args={[geo, undefined, items.length]} castShadow receiveShadow raycast={noRaycast}>
            <meshStandardMaterial map={leaf} roughness={0.9} />
          </instancedMesh>
        );
      })}
    </group>
  );
}
