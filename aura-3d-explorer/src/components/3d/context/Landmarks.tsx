"use client";
/**
 * Landmarks — generic skyline silhouettes that make a city preset read as
 * that city from the waterfront: a deco setback tower and a suspension bridge
 * for New York, dark bundled tubes for Chicago, a needle tower for Toronto, a
 * stepped supertall for Dubai, and so on (see `LandmarkKind` in
 * lib/cityPresets). They are massing studies, not replicas: no logos, no
 * detail beyond what reads at skyline distance.
 *
 * Each landmark is one merged geometry with world-space UVs, so the shared
 * facade textures tile at a real storey height on any shape.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityPreset, Landmark } from "@/lib/cityPresets";
import { SITE_ROTATION_Y, uwToXZ } from "@/lib/siteLayout";
import { facadeTexture } from "../textures";
import { noRaycast } from "./shared";

type Finish = "glass" | "stone" | "paint";

const FINISH: Record<Landmark["kind"], Finish> = {
  deco: "stone",
  obelisk: "glass",
  pyramid: "stone",
  needle: "paint",
  saucer: "paint",
  stepped: "glass",
  shard: "glass",
  bullet: "glass",
  bundled: "glass",
  tapered: "stone",
  crown: "glass",
  slab: "glass",
  bridge: "paint",
};

/* ------------------------------------------------------------- builders */

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (rt: number, rb: number, h: number, seg: number, y = 0, x = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z);
/** Square frustum (a 4-sided cylinder turned 45° so its faces align with x / z). */
const squareFrustum = (top: number, bottom: number, h: number, y = 0) => cyl(top * Math.SQRT2, bottom * Math.SQRT2, h, 4, y).rotateY(Math.PI / 4);
const mast = (h0: number, h1: number, r: number, x = 0, z = 0) => cyl(r * 0.4, r, h1 - h0, 6, h0, x, z);

function lathe(profile: [number, number][], seg = 16) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function build(l: Landmark): THREE.BufferGeometry[] {
  const H = l.h;
  switch (l.kind) {
    case "deco": {
      const roof = H * 0.86;
      return [
        box(H * 0.2, roof * 0.2, H * 0.13),
        box(H * 0.15, roof * 0.64, H * 0.1),
        box(H * 0.11, roof * 0.8, H * 0.075),
        box(H * 0.08, roof * 0.92, H * 0.06),
        cyl(H * 0.026, H * 0.034, roof * 0.08, 8, roof * 0.92),
        mast(roof, H, H * 0.008),
      ];
    }
    case "obelisk": {
      const roof = H * 0.78;
      const base = box(H * 0.12, H * 0.13, H * 0.12);
      // Square frustum twisted by 45° up its height → chamfered, faceted taper.
      const shaft = squareFrustum(H * 0.036, H * 0.06, roof - H * 0.13, H * 0.13);
      shaft.deleteAttribute("uv");
      const p = shaft.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const a = ((y - H * 0.13) / (roof - H * 0.13)) * (Math.PI / 4);
        const x = p.getX(i);
        const z = p.getZ(i);
        p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
      }
      shaft.computeVertexNormals();
      return [base, shaft, mast(roof, H, H * 0.006)];
    }
    case "pyramid":
      return [box(H * 0.1, H * 0.06, H * 0.1), squareFrustum(H * 0.004, H * 0.05, H * 0.94, H * 0.06)];
    case "needle":
      return [
        cyl(H * 0.012, H * 0.04, H * 0.66, 3), // Y-shaped shaft, read as a tapering tri-prism
        lathe([[0, H * 0.6], [H * 0.05, H * 0.61], [H * 0.058, H * 0.635], [H * 0.045, H * 0.66], [0, H * 0.665]]),
        cyl(H * 0.014, H * 0.016, H * 0.04, 10, H * 0.78),
        mast(H * 0.66, H, H * 0.008),
      ];
    case "saucer":
      return [
        lathe([[H * 0.12, 0], [H * 0.06, H * 0.2], [H * 0.03, H * 0.52], [H * 0.045, H * 0.72], [0, H * 0.72]], 6),
        lathe([[0, H * 0.72], [H * 0.14, H * 0.76], [H * 0.15, H * 0.79], [H * 0.11, H * 0.83], [H * 0.04, H * 0.85], [0, H * 0.86]], 20),
        mast(H * 0.85, H, H * 0.012),
      ];
    case "stepped": {
      // Y-plan: three wings around a core, each stepping back as it rises.
      const parts: THREE.BufferGeometry[] = [];
      const top = H * 0.72;
      const tiers = 9;
      for (let k = 0; k < tiers; k++) {
        const y0 = (top * k) / tiers;
        const len = H * 0.1 * (1 - k / (tiers + 1));
        const tierH = top - y0;
        for (let a = 0; a < 3; a++) {
          const wing = box(len, tierH / (tiers - k) + 0.01, H * 0.028, len / 2, y0);
          wing.rotateY((a * Math.PI * 2) / 3);
          parts.push(wing);
        }
      }
      parts.push(cyl(H * 0.022, H * 0.034, top, 12));
      parts.push(cyl(H * 0.003, H * 0.02, H - top, 8, top));
      return parts;
    }
    case "shard": {
      const g = cyl(H * 0.004, H * 0.085, H, 7);
      return [g];
    }
    case "bullet":
      return [lathe([[H * 0.11, 0], [H * 0.15, H * 0.18], [H * 0.165, H * 0.34], [H * 0.155, H * 0.52], [H * 0.12, H * 0.72], [H * 0.07, H * 0.88], [H * 0.025, H * 0.97], [0, H]], 20)];
    case "bundled": {
      const roof = H * 0.8;
      const s = H * 0.05;
      const heights = [0.46, 0.72, 0.46, 0.72, 1, 1, 0.46, 0.87, 0.87];
      const parts: THREE.BufferGeometry[] = heights.map((f, i) => box(s, roof * f, s, (Math.floor(i / 3) - 1) * s, 0, ((i % 3) - 1) * s));
      parts.push(mast(roof, H, H * 0.005, 0, s * 0.3), mast(roof, H * 0.96, H * 0.005, 0, s * 0.9));
      return parts;
    }
    case "tapered": {
      const roof = H * 0.79;
      return [squareFrustum(H * 0.05, H * 0.085, roof), mast(roof, H, H * 0.005, -H * 0.02), mast(roof, H * 0.98, H * 0.005, H * 0.02)];
    }
    case "crown":
      return [cyl(H * 0.09, H * 0.1, H * 0.86, 20), cyl(H * 0.075, H * 0.08, H * 0.07, 20, H * 0.86), cyl(H * 0.055, H * 0.06, H * 0.05, 20, H * 0.93), cyl(H * 0.03, H * 0.04, H * 0.02, 20, H * 0.98)];
    case "slab":
      return [box(H * 0.38, H * 0.97, H * 0.1), box(H * 0.36, H * 0.03, H * 0.09, 0, H * 0.97)];
    case "bridge":
      return bridge(H);
  }
}

/** Suspension bridge along local z (→ w): deck, two towers, catenary cables and hangers. */
function bridge(H: number): THREE.BufferGeometry[] {
  const deckY = H * 0.3;
  const half = 3.8; // deck half-width (≈ 27 m)
  const z0 = -40;
  const z1 = 440;
  const towers = [120, 300];
  const parts: THREE.BufferGeometry[] = [box(half * 2, 0.9, z1 - z0, 0, deckY - 0.9, (z0 + z1) / 2)];
  // Truss fascia along both deck edges
  for (const s of [-1, 1]) parts.push(box(0.25, 1.4, z1 - z0, s * half, deckY - 1.4, (z0 + z1) / 2));
  for (const tz of towers) {
    for (const s of [-1, 1]) parts.push(box(1.6, H, 1.8, s * (half + 0.4), 0, tz));
    for (const f of [0.34, 0.58, 0.8, 0.98]) parts.push(box(half * 2 + 2.4, 1.2, 1.4, 0, H * f - 0.6, tz));
  }
  // Main cables: tower-to-tower sag, and side spans down to the deck ends.
  const cable = (za: number, ya: number, zb: number, yb: number, sag: number, x: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3(x, ya + (yb - ya) * t - sag * 4 * t * (1 - t), za + (zb - za) * t));
    }
    return pts;
  };
  for (const s of [-1, 1]) {
    const x = s * (half + 0.4);
    const spans = [cable(z0, deckY + 1, towers[0], H, H * 0.12, x), cable(towers[0], H, towers[1], H, H * 0.62, x), cable(towers[1], H, z1, deckY + 1, H * 0.12, x)];
    for (const pts of spans) {
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.3, 5, false));
      // Hangers every ~6 units down to the deck
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        const len = p.y - deckY;
        if (len > 1) parts.push(box(0.08, len, 0.08, x, deckY, p.z));
      }
    }
  }
  return parts;
}

/** Planar UVs in world units (u across the face, v = height), so facade tiles keep a storey height. */
function worldUV(g: THREE.BufferGeometry) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.computeVertexNormals();
  const p = geo.getAttribute("position");
  const n = geo.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const horizontal = Math.abs(n.getX(i)) > Math.abs(n.getZ(i)) ? p.getZ(i) : p.getX(i);
    uv[i * 2] = horizontal * 1.0;
    uv[i * 2 + 1] = p.getY(i) * 1.1;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

function LandmarkMesh({ l }: { l: Landmark }) {
  const finish = FINISH[l.kind];
  const geometry = useMemo(() => {
    const parts = build(l).map((g) => {
      const geo = worldUV(g);
      for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
      return geo;
    });
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return merged;
  }, [l]);
  const material = useMemo(() => {
    if (finish === "paint") return new THREE.MeshStandardMaterial({ color: l.color, roughness: 0.6, metalness: 0.15 });
    const map = facadeTexture(finish === "glass" ? "glass" : "stone");
    return new THREE.MeshStandardMaterial({
      map,
      color: l.color,
      roughness: finish === "glass" ? 0.3 : 0.8,
      metalness: finish === "glass" ? 0.35 : 0,
      envMapIntensity: finish === "glass" ? 1.3 : 0.5,
    });
  }, [finish, l.color]);

  const [x, z] = uwToXZ(l.u, l.w);
  return <mesh geometry={geometry} material={material} position={[x, 0, z]} rotation-y={SITE_ROTATION_Y} raycast={noRaycast} />;
}

export default function Landmarks({ preset }: { preset: CityPreset }) {
  return (
    <group>
      {preset.landmarks.map((l, i) => (
        <LandmarkMesh key={`${preset.id}:${i}`} l={l} />
      ))}
    </group>
  );
}
