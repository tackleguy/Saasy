"use client";
/** Sketchfab-only city context. All mesh parts retain their authored transforms and
 * materials, then share instanced draws across the existing collision-aware lots. */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";
import type { CityPreset } from "@/lib/cityPresets";
import { rectsOverlap, type UWRect } from "@/lib/siteLayout";
import { ALONG_U, noRaycast, placeUW, rng, uploadInstances } from "./shared";
import { cityPlan, type CityBuilding } from "./cityPlan";
import { libraryModel } from "@/lib/modelLibrary";
import { invalidateShadows } from "../staticShadows";
import { applyArchitecturalFacade } from "./architecturalContextMaterial";
import { RecoverableContextModel } from "../ContextModelRecovery";

const SOURCES = [
  { uid: "f943ba2828a64b7d858ee6e4bdacedc6", role: "low" },
  { uid: "14e3d5743f7546d5bb7f3befc72c9057", role: "mid" },
  { uid: "9359c41541814b968360fc4f3823892c", role: "mid" },
  { uid: "ff93086fa20345d4b4562ce95095e292", role: "tower" },
  { uid: "fa82b5beb9a9427698dafd2c3867ebf9", role: "tower" },
  { uid: "b33e54d616c44c1795fb86f433c0dfc0", role: "low" },
  { uid: "191cf9a66d204ccc941e097bcfe90f27", role: "tower" },
] as const;
export const SKETCHFAB_CITY_SOURCE_UIDS = SOURCES.map(({ uid }) => uid);
const URLS = SOURCES.map(({ uid }) => libraryModel(uid)!.path);
// Only the active scene requests these seven local files; no global preloads.

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

type Role = "low" | "mid" | "tower";

interface Prepared {
  name: string;
  role: Role;
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }[];
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
      gltf.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const offset = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
      const parts: Prepared["parts"] = [];
      gltf.scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const geo = node.geometry.clone();
        geo.applyMatrix4(node.matrixWorld).applyMatrix4(offset);
        const adapt = (source: THREE.Material) => {
          const mat = source.clone();
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.color.multiply(tint);
            mat.envMapIntensity = 0.85;
            if (!mat.map) {
              applyArchitecturalFacade(mat);
            }
          }
          return mat;
        };
        const mat = Array.isArray(node.material) ? node.material.map(adapt) : adapt(node.material);
        parts.push({ geo, mat });
      });
      return { name: SOURCES[i].uid, role: SOURCES[i].role, parts, size };
    });
  }, [gltfs, tint]);

  useEffect(() => {
    invalidateShadows();
    return () => {
      for (const model of prepared) for (const { geo, mat } of model.parts) {
        geo.dispose();
        for (const material of Array.isArray(mat) ? mat : [mat]) material.dispose();
      }
    };
  }, [prepared]);

  const groups = useMemo(() => {
    const pools: Record<Role, Prepared[]> = {
      low: prepared.filter((p) => p.role === "low"),
      mid: prepared.filter((p) => p.role === "mid"),
      tower: prepared.filter((p) => p.role === "tower" && (preset.id === "dubai" || p.name !== "191cf9a66d204ccc941e097bcfe90f27")),
    };
    const buckets = new Map<string, THREE.Matrix4[]>(prepared.map((p) => [p.name, []]));
    const q = new THREE.Quaternion();
    const yaw = new THREE.Quaternion();

    const lots = [...lotsOf(cityPlan(preset).buildings), ...preset.landmarks
      .filter((landmark) => landmark.kind !== "bridge")
      .map((landmark) => ({ u: landmark.u, w: landmark.w, su: 26, sw: 26, h: landmark.h }))];
    for (const lot of lots) {
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
          const turns = Math.floor(roll() * 4);
          const width = turns % 2 ? model.size.z : model.size.x;
          const depth = turns % 2 ? model.size.x : model.size.z;
          const fit = Math.min(cellU / width, cellW / depth) * 0.9;
          const byHeight = targetH / model.size.y;
          const s = Math.min(fit, byHeight);
          const sy = Math.min(byHeight, s * 1.28);
          const footprint = { u0: u - (width * s) / 2, u1: u + (width * s) / 2, w0: w - (depth * s) / 2, w1: w + (depth * s) / 2 };
          q.copy(ALONG_U);
          if (turns) q.multiply(yaw.setFromAxisAngle(Y_AXIS, turns * Math.PI * 0.5));
          const hidden = clearings.some((c) => rectsOverlap(footprint, c));
          buckets.get(model.name)!.push(hidden || s <= 0 ? HIDDEN : placeUW(u, w, 0, q, new THREE.Vector3(s, sy, s)));
        }
      }
    }

    return prepared
      .map((p) => ({ ...p, matrices: buckets.get(p.name)! }))
      .filter((g) => g.matrices.length > 0);
  }, [prepared, preset, clearings]);

  return (
    <group>
      {groups.flatMap((g) => g.parts.map((part, index) => (
        <instancedMesh
          key={`${g.name}:${index}`}
          ref={(m) => uploadInstances(m, g.matrices)}
          args={[part.geo, part.mat, g.matrices.length]}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      )))}
    </group>
  );
}

export default function City({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  return (
    <RecoverableContextModel label="Surrounding buildings" resource={URLS}>
      <CityModels preset={preset} clearings={clearings} />
    </RecoverableContextModel>
  );
}
