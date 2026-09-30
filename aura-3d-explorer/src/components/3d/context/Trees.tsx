"use client";
/**
 * Trees — three species of low-poly canopy with organic, noise-displaced
 * lobes, a bark-textured trunk and per-tree colour variation (instanceColor).
 * Street trees line both sides of the main road and the promenade; larger
 * specimens sit in the plaza and the courtyard behind the site.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LAYOUT } from "@/lib/siteLayout";
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

function layout(): Tree[] {
  const r = rng(11);
  const out: Tree[] = [];
  const hues = ["#7d8f6c", "#6f8a5e", "#8c9a6a", "#728b66", "#9aa470"];
  const add = (u: number, w: number, s: number, species = Math.floor(r() * 3)) =>
    out.push({ u, w, s, species, hue: new THREE.Color(hues[Math.floor(r() * hues.length)]) });

  // Promenade row (water side) — dense
  for (let u = -110; u <= 110; u += 5.5 + r() * 2) add(u + (r() - 0.5), LAYOUT.sidewalkFar[1] + 1.1, 0.5 + r() * 0.18);
  // Near sidewalk — sparse, clear of the arcades
  for (const u of [-70, -58, -44, -8, 8, 44, 58, 70]) add(u, LAYOUT.sidewalkNear[0] + 0.8, 0.46 + r() * 0.12);
  // Plaza specimens between the podiums
  for (const [u, w] of [[-34, 6], [34, 6], [-12, -14], [12, -14], [-42, -26], [42, -26]] as [number, number][]) add(u + (r() - 0.5) * 2, w, 0.8 + r() * 0.35, 2);
  // Courtyard behind the site and along the side streets
  for (let i = 0; i < 26; i++) add(-190 + r() * 380, -44 - r() * 200, 0.55 + r() * 0.5);
  for (let i = 0; i < 14; i++) add((r() > 0.5 ? 1 : -1) * (64 + r() * 120), -40 + r() * 54, 0.5 + r() * 0.4);
  return out;
}

export default function Trees() {
  const trees = useMemo(layout, []);
  const geos = useMemo(() => [0, 1, 2].map(canopyGeometry), []);
  const bark = barkTexture();
  const leaf = leafTexture();

  const trunk = useMemo(
    () => trees.map((t) => placeUW(t.u, t.w, 0.85 * t.s, new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s))),
    [trees]
  );

  return (
    <group>
      <instancedMesh ref={(m) => uploadInstances(m, trunk)} args={[undefined, undefined, trees.length]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.06, 0.12, 1.7, 7]} />
        <meshStandardMaterial map={bark} roughness={0.95} />
      </instancedMesh>
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
