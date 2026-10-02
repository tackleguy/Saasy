"use client";
import { useThree } from "@react-three/fiber";
import { useCinematic } from "../environment/settings";
import { useEffect, useState } from "react";
import { setCityModelStatus, useCityModelStatus } from "@/lib/cityModelStatus";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CityPreset } from "@/lib/cityPresets";
import { CITY_MODELS, type CityModel } from "@/lib/cityModels";
import { SITE_ROTATION_Y, uwToXZ, type UWRect } from "@/lib/siteLayout";
import { invalidateShadows } from "../staticShadows";
import { noRaycast } from "./shared";
import IllustrativeCity from "./IllustrativeCity";

/** Release large district resources when switching cities, including a cancelled load. */
function disposeCity(root: THREE.Object3D) {
  const resources = new Set<{ dispose: () => void }>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  resources.forEach((resource) => {
    if (resource instanceof THREE.Texture) {
      const bitmap = resource.source.data;
      if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap) bitmap.close();
    }
    resource.dispose();
  });
}

function District({ model }: { model: CityModel }) {
  const { tier } = useCinematic();
  const gl = useThree((state) => state.gl);
  const highTextures = model.textured && tier === "high";
  const [object, setObject] = useState<THREE.Group | null>(null);
  const { attempt } = useCityModelStatus(model.uid);
  useEffect(() => {
    const controller = new AbortController();
    let loaded: THREE.Group | null = null;
    setObject(null);
    setCityModelStatus(model.uid, "loading");
    async function load() {
      try {
        const response = await fetch(`/models/sketchfab/${model.uid}/${highTextures ? "model-hq.glb" : "model.glb"}`, { signal: controller.signal });
        if (!response.ok) throw new Error("City model unavailable");
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
        loaded = gltf.scene;
        if (controller.signal.aborted) { disposeCity(loaded); loaded = null; return; }
        const root = new THREE.Group();
        root.add(loaded);
        loaded.rotation.y += model.rotation;
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root, true);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = model.width / Math.max(size.x, size.z, 0.001);
        // Align the modelled ground surface, not the lowest underground vertex.
        loaded.position.sub(new THREE.Vector3(center.x, model.groundY, center.z));
        root.scale.setScalar(scale);
        // Keep the author's entire layout intact, behind the separate proposal site.
        const [x, z] = uwToXZ(0, -55 - size.z * scale / 2);
        root.position.set(x, 0.04, z);
        root.rotation.y = SITE_ROTATION_Y;
        const adapted = new Set<THREE.Material>();
        loaded.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.raycast = noRaycast;
          // Photogrammetry already contains lighting. Avoid re-shadowing its baked surfaces.
          node.castShadow = false;
          node.receiveShadow = false;
          // Manhattan’s base color is photographic: do not light its baked shadows twice.
          if (model.uid === "372bc495b3a941308f4a3198bc45e17b") {
            const unlit = (material: THREE.Material) => {
              if (!(material instanceof THREE.MeshStandardMaterial)) return material;
              const replacement = new THREE.MeshBasicMaterial({ map: material.map, color: material.color, side: material.side, transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest });
              material.dispose();
              return replacement;
            };
            node.material = Array.isArray(node.material) ? node.material.map(unlit) : unlit(node.material);
          }
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (adapted.has(material)) continue;
            adapted.add(material);
            material.fog = false;
            if (!model.textured && material instanceof THREE.MeshStandardMaterial) {
              material.color.multiplyScalar(0.65);
              material.roughness = 0.9;
              material.metalness = 0;
            }
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
              value.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
              value.needsUpdate = true;
            }
          }
        });
        setObject(root);
        setCityModelStatus(model.uid, "ready");
        invalidateShadows();
      } catch {
        if (!controller.signal.aborted) setCityModelStatus(model.uid, "failed");
      }
    }
    void load();
    return () => { controller.abort(); if (loaded) disposeCity(loaded); invalidateShadows(); };
  }, [model, attempt, highTextures, gl]);
  if (!object) return null;
  return <primitive object={object} dispose={null} />;
}

export default function City({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  const model = CITY_MODELS[preset.id];
  return model ? <District key={model.uid} model={model} /> : <IllustrativeCity preset={preset} clearings={clearings} />;
}
