"use client";
/**
 * CityContext — a procedural dusk skyline around the site.
 * -----------------------------------------------------------------------------
 * Gives the walk-through window views (and the overview) something to look
 * at. ~140 towers in a ring beyond the site, drawn as three InstancedMeshes
 * (low / mid / high-rise) so the whole city costs three draw calls. Each
 * class has its own canvas-generated facade texture with randomly lit warm
 * windows. Deterministic (seeded), non-interactive.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Seeded PRNG so the skyline is identical on every load. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Facade texture: a grid of windows, some lit warm, most dark. */
function windowTexture(cols: number, rows: number, seed: number): THREE.CanvasTexture {
  const r = rng(seed);
  const cw = 16;
  const ch = 20;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = r();
      ctx.fillStyle = v > 0.72 ? (r() > 0.3 ? "#ffcf8a" : "#dfe9ff") : v > 0.55 ? "#2a3345" : "#0b0e14";
      ctx.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface Tower {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
}

// Roughly one window row per storey (1 scene unit ≈ 3.5 m).
const CLASSES = [
  { maxH: 16, rows: 12, cols: 10 },
  { maxH: 38, rows: 28, cols: 11 },
  { maxH: Infinity, rows: 56, cols: 12 },
];

function useCity() {
  return useMemo(() => {
    const r = rng(42);
    const groups: Tower[][] = [[], [], []];
    for (let i = 0; i < 180; i++) {
      const a = r() * Math.PI * 2;
      // Keep the foreground (towards the default camera, +X +Z) open like a plaza.
      const towardCamera = Math.cos(a - Math.PI / 4);
      if (towardCamera > 0.55 && r() > 0.15) continue;
      const dist = 88 + Math.pow(r(), 0.8) * 160;
      // Taller towers cluster in a "downtown" direction (behind the site from the default view)
      const downtown = Math.max(0, Math.cos(a + Math.PI * 0.75));
      const h = 5 + Math.pow(r(), 2.2) * 45 + downtown * r() * 40;
      const t: Tower = { x: Math.cos(a) * dist, z: Math.sin(a) * dist, w: 6 + r() * 10, d: 6 + r() * 10, h, rot: r() * Math.PI };
      groups[CLASSES.findIndex((c) => h <= c.maxH)].push(t);
    }
    return groups;
  }, []);
}

function CityClass({ towers, cls, seed }: { towers: Tower[]; cls: (typeof CLASSES)[number]; seed: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => {
    const tex = windowTexture(cls.cols, cls.rows, seed);
    return new THREE.MeshStandardMaterial({
      color: "#1a202c",
      roughness: 0.6,
      metalness: 0.4,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tex,
      emissiveIntensity: 0.5,
    });
  }, [cls, seed]);
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  }, []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    towers.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.w, t.h, t.d)));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [towers]);

  if (!towers.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, towers.length]} raycast={() => null} receiveShadow />;
}

export default function CityContext() {
  const groups = useCity();
  return (
    <group>
      {CLASSES.map((cls, i) => (
        <CityClass key={i} towers={groups[i]} cls={cls} seed={7 + i * 13} />
      ))}
    </group>
  );
}
