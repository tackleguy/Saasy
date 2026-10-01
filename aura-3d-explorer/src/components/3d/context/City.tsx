"use client";
/**
 * City — neighbouring blocks as instanced building models (Kenney's CC0
 * City Kit Commercial: mid-rise blocks, low-detail distant masses, and five
 * skyscrapers). Lots still come from `cityPlan`, so each preset keeps its own
 * skyline: downtown clusters pick the towers, and a moved project building
 * hides whatever stands inside its clearing.
 *
 * Models: public/models/city (see LICENSE.txt). One scene unit ≈ 3.57 m;
 * each mesh is scaled onto its lot without leaving the block.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";
import type { CityPreset } from "@/lib/cityPresets";
import { rectsOverlap, type UWRect } from "@/lib/siteLayout";
import { ALONG_U, noRaycast, placeUW, rng, uploadInstances } from "./shared";
import { cityPlan, type CityBuilding } from "./cityPlan";

const MID = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"].map((s) => `building-${s}`);
const TOWERS = ["a", "b", "c", "d", "e"].map((s) => `building-skyscraper-${s}`);
const LOW = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "wide-a", "wide-b"].map((s) => `low-detail-building-${s}`);
const MODELS = [...MID, ...TOWERS, ...LOW];
const URLS = MODELS.map((name) => `/models/city/${name}.glb`);

for (const url of URLS) useGLTF.preload(url);

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

type Role = "low" | "mid" | "tower";

interface Prepared {
  name: string;
  role: Role;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  size: THREE.Vector3;
}

interface Lot {
  u: number;
  w: number;
  su: number;
  sw: number;
  h: number;
}

/** One model per ground-floor piece; height includes the setbacks stacked on it. */
function lotsOf(buildings: CityBuilding[]): Lot[] {
  const bases = buildings.filter((b) => b.y < 0.05);
  return bases.map((base) => {
    let top = base.h;
    for (const p of buildings) {
      if (Math.abs(p.u - base.u) <= base.su * 0.55 && Math.abs(p.w - base.w) <= base.sw * 0.55) top = Math.max(top, p.y + p.h);
    }
    return { u: base.u, w: base.w, su: base.su, sw: base.sw, h: top };
  });
}

function roleFor(h: number, w: number): Role {
  if (h > 18) return "tower";
  if (w < -140 || h < 7) return "low";
  return "mid";
}

function firstMesh(root: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  if (!found) throw new Error("City model has no mesh");
  return found;
}

/** City-tint the atlas just enough that a brick city reads warm and a stone city cool. */
function cityTint(preset: CityPreset): THREE.Color {
  const samples = [...preset.tints.brick, ...preset.tints.stone, ...preset.tints.plaster];
  const c = new THREE.Color(0);
  for (const hex of samples) c.add(new THREE.Color(hex));
  c.multiplyScalar(1 / samples.length);
  return c.lerp(new THREE.Color("#ffffff"), 0.58);
}

function CityModels({ preset, clearings }: { preset: CityPreset; clearings: UWRect[] }) {
  const gltfs = useGLTF(URLS) as GLTF[];
  const tint = useMemo(() => cityTint(preset), [preset]);

  const prepared = useMemo<Prepared[]>(() => {
    return gltfs.map((gltf, i) => {
      const mesh = firstMesh(gltf.scene);
      const geo = mesh.geometry.clone();
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      geo.computeBoundingBox();
      const size = new THREE.Vector3();
      geo.boundingBox!.getSize(size);
      const src = mesh.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.color.copy(tint);
      mat.roughness = 0.68;
      mat.metalness = 0.06;
      mat.envMapIntensity = 0.55;
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = 16;
        mat.map.minFilter = THREE.LinearMipmapLinearFilter;
        mat.map.magFilter = THREE.LinearFilter;
        mat.map.needsUpdate = true;
      }
      const name = MODELS[i];
      const role: Role = name.startsWith("building-skyscraper") ? "tower" : name.startsWith("low-detail") ? "low" : "mid";
      return { name, role, geo, mat, size };
    });
  }, [gltfs, tint]);

  useEffect(() => {
    return () => {
      for (const p of prepared) {
        p.geo.dispose();
        p.mat.dispose();
      }
    };
  }, [prepared]);

  const groups = useMemo(() => {
    const pools: Record<Role, Prepared[]> = {
      low: prepared.filter((p) => p.role === "low"),
      mid: prepared.filter((p) => p.role === "mid"),
      tower: prepared.filter((p) => p.role === "tower"),
    };
    const buckets = new Map<string, THREE.Matrix4[]>(prepared.map((p) => [p.name, []]));
    const q = new THREE.Quaternion();
    const yaw = new THREE.Quaternion();

    for (const lot of lotsOf(cityPlan(preset).buildings)) {
      const roll = rng((Math.abs(Math.round(lot.u * 10) * 13 + Math.round(lot.w * 10) * 29) % 2147483646) + 1);
      const proto = pools[roleFor(lot.h, lot.w)][0] ?? prepared[0];
      // Footprint in scene units, so a downtown lot holds one tower and a long block holds a short row.
      const footprint = lot.h > 18 ? 12 : lot.h > 8 ? 8 : 6;
      let nu = Math.max(1, Math.round(lot.su / footprint));
      let nw = Math.max(1, Math.round(lot.sw / footprint));
      while (nu * nw > 4) {
        if (nu >= nw && nu > 1) nu -= 1;
        else if (nw > 1) nw -= 1;
        else break;
      }
      const cellU = lot.su / nu;
      const cellW = lot.sw / nw;

      for (let iu = 0; iu < nu; iu++) {
        for (let iw = 0; iw < nw; iw++) {
          const u = lot.u - lot.su / 2 + cellU * (iu + 0.5);
          const w = lot.w - lot.sw / 2 + cellW * (iw + 0.5);
          const peak = nu * nw === 1 || (iu === (nu - 1) >> 1 && iw === (nw - 1) >> 1);
          const targetH = lot.h * (peak ? 1 : 0.62 + roll() * 0.28);
          const pool = pools[roleFor(targetH, w)];
          const model = pool[Math.floor(roll() * pool.length)] ?? proto;
          const fit = Math.min(cellU / model.size.x, cellW / model.size.z) * 0.9;
          const byHeight = targetH / model.size.y;
          const s = Math.min(fit, byHeight);
          const sy = Math.min(byHeight, s * 1.28);
          const footprint = { u0: u - (model.size.x * s) / 2, u1: u + (model.size.x * s) / 2, w0: w - (model.size.z * s) / 2, w1: w + (model.size.z * s) / 2 };
          const turns = Math.floor(roll() * 4);
          q.copy(ALONG_U);
          if (turns) q.multiply(yaw.setFromAxisAngle(Y_AXIS, turns * Math.PI * 0.5));
          const hidden = clearings.some((c) => rectsOverlap(footprint, c));
          buckets.get(model.name)!.push(hidden || s < 0.15 ? HIDDEN : placeUW(u, w, 0, q, new THREE.Vector3(s, sy, s)));
        }
      }
    }

    return prepared
      .map((p) => ({ ...p, matrices: buckets.get(p.name)! }))
      .filter((g) => g.matrices.length > 0);
  }, [prepared, preset, clearings]);

  return (
    <group>
      {groups.map((g) => (
        <instancedMesh
          key={g.name}
          ref={(m) => uploadInstances(m, g.matrices)}
          args={[g.geo, g.mat, g.matrices.length]}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}

export default function City({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  return <CityModels preset={preset} clearings={clearings} />;
}
