"use client";
/**
 * MappedCityTrees — illustrative trees across the mapped city: groves in every
 * mapped park and rows along mapped streets (see lib/mappedVegetation). Three
 * instanced draws (trunks, broadleaf crowns, palm fronds) for thousands of
 * trees. The city preset sets crown hues, palm share and density. Crowns get a
 * world-space clump pattern in the shader so they read as foliage, not balls.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CityPreset } from "@/lib/cityPresets";
import type { MapSnapshot, ProjectLocation } from "@/lib/geographicContext";
import { CITY_TREE_BUDGET, planCityTrees, type CityTree } from "@/lib/mappedVegetation";
import type { Building } from "@/types";
import { useCinematic } from "../environment/settings";
import { invalidateShadows } from "../staticShadows";
import { noRaycast } from "./shared";

function foliageMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, metalness: 0, envMapIntensity: 0.5 });
  material.name = "city-tree-foliage";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 vAuraLeaf;\n" + shader.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvAuraLeaf = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = `varying vec3 vAuraLeaf;
float auraLeafHash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 41.3))) * 43758.5453); }
float auraLeafNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(auraLeafHash(i), auraLeafHash(i + vec3(1,0,0)), f.x), mix(auraLeafHash(i + vec3(0,1,0)), auraLeafHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(auraLeafHash(i + vec3(0,0,1)), auraLeafHash(i + vec3(1,0,1)), f.x), mix(auraLeafHash(i + vec3(0,1,1)), auraLeafHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
` + shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float clumps = auraLeafNoise(vAuraLeaf * 3.2) * 0.65 + auraLeafNoise(vAuraLeaf * 9.0) * 0.35;
      // Sunlit crowns brighten toward the top; inner gaps read darker.
      diffuseColor.rgb *= mix(0.55, 1.18, clumps) * mix(0.82, 1.08, clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0));
    `);
  };
  material.customProgramCacheKey = () => "aura-city-foliage-v1";
  return material;
}

function Batch({ geometry, material, matrices, colors, shadows }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors?: THREE.Color[]; shadows: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    colors?.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidateShadows();
  }, [matrices, colors]);
  if (!matrices.length) return null;
  return <instancedMesh key={matrices.length} ref={ref} args={[geometry, material, matrices.length]} castShadow={shadows} receiveShadow={shadows} raycast={noRaycast} frustumCulled={false} dispose={null} />;
}

export default function MappedCityTrees({ snapshot, location, buildings, preset }: { snapshot: MapSnapshot | null; location: ProjectLocation; buildings: Building[]; preset: CityPreset }) {
  const { tier } = useCinematic();
  // Planned after the first frame (≈0.1 s of work on a full city) so trees never delay the city appearing.
  const [trees, setTrees] = useState<CityTree[]>([]);
  useEffect(() => {
    const base = CITY_TREE_BUDGET[tier], density = preset.trees.density;
    const run = () => setTrees(planCityTrees(snapshot, location, buildings, { park: Math.round(base.park * density), street: Math.round(base.street * density) }));
    const idle = typeof requestIdleCallback === "function" ? requestIdleCallback(run, { timeout: 1500 }) : null;
    const timer = idle === null ? setTimeout(run, 300) : null;
    return () => { if (idle !== null) cancelIdleCallback(idle); if (timer !== null) clearTimeout(timer); };
  }, [snapshot, location.latitude, location.longitude, buildings, tier, preset]);

  const assets = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.06, 0.1, 1, 5, 1).translate(0, 0.5, 0),
    crown: new THREE.IcosahedronGeometry(1, 1),
    frond: new THREE.ConeGeometry(1, 0.35, 7, 1).translate(0, -0.1, 0),
    bark: new THREE.MeshStandardMaterial({ color: "#5b4a3a", roughness: 0.95 }),
    leaves: foliageMaterial(),
  }), []);
  useEffect(() => () => { Object.values(assets).forEach((a) => a.dispose()); }, [assets]);

  const batches = useMemo(() => {
    const trunk: THREE.Matrix4[] = [], crown: THREE.Matrix4[] = [], frond: THREE.Matrix4[] = [], crownColors: THREE.Color[] = [], frondColors: THREE.Color[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const hues = preset.trees.hues.map((h) => new THREE.Color(h));
    for (const t of trees) {
      const palm = t.variant < preset.trees.palms;
      const hue = hues[Math.floor(t.variant * 997) % hues.length].clone().multiplyScalar(0.72 + ((t.variant * 31) % 1) * 0.3);
      q.setFromAxisAngle(up, t.variant * Math.PI * 2);
      if (palm) {
        const h = t.height * 1.35;
        trunk.push(m.compose(p.set(t.x, 0, t.z), q, s.set(h * 0.32, h, h * 0.32)).clone());
        frond.push(m.compose(p.set(t.x, h, t.z), q, s.set(h * 0.32, h * 0.32, h * 0.32)).clone());
        frondColors.push(hue);
      } else {
        const h = t.height, r = h * (0.3 + ((t.variant * 7) % 1) * 0.1);
        trunk.push(m.compose(p.set(t.x, 0, t.z), q, s.set(h * 0.5, h * 0.55, h * 0.5)).clone());
        crown.push(m.compose(p.set(t.x, h * 0.62, t.z), q, s.set(r, r * 1.12, r)).clone());
        crownColors.push(hue);
      }
    }
    return { trunk, crown, frond, crownColors, frondColors };
  }, [trees, preset]);

  const shadows = tier === "high";
  return <group name="mapped-city-trees" userData={{ trees: trees.length, illustrative: true }}>
    <Batch geometry={assets.trunk} material={assets.bark} matrices={batches.trunk} shadows={shadows} />
    <Batch geometry={assets.crown} material={assets.leaves} matrices={batches.crown} colors={batches.crownColors} shadows={shadows} />
    <Batch geometry={assets.frond} material={assets.leaves} matrices={batches.frond} colors={batches.frondColors} shadows={shadows} />
  </group>;
}
