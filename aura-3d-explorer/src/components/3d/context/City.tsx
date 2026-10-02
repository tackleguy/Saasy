"use client";
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
  resources.forEach((resource) => resource.dispose());
}

function District({ model }: { model: CityModel }) {
  const [object, setObject] = useState<THREE.Group | null>(null);
  const { attempt } = useCityModelStatus(model.uid);
  useEffect(() => {
    const controller = new AbortController();
    let loaded: THREE.Group | null = null;
    setObject(null);
    setCityModelStatus(model.uid, "loading");
    async function load() {
      try {
        const response = await fetch(`/models/sketchfab/${model.uid}/model.glb`, { signal: controller.signal });
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
        const scale = Math.min(model.width / Math.max(size.x, size.z, 0.001), 70 / Math.max(size.y, 0.001));
        loaded.position.sub(new THREE.Vector3(center.x, bounds.min.y + size.y * (model.groundCut ?? 0.015), center.z));
        root.scale.setScalar(scale);
        // Keep the author's entire layout intact, behind the separate proposal site.
        const [x, z] = uwToXZ(0, -150 - size.z * scale / 2);
        root.position.set(x, 0.04, z);
        root.rotation.y = SITE_ROTATION_Y;
        loaded.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.raycast = noRaycast;
          // Photogrammetry already contains lighting. Avoid re-shadowing its baked surfaces.
          node.castShadow = false;
          node.receiveShadow = false;
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            material.fog = true;
            material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02)];
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
  }, [model, attempt]);
  if (!object) return null;
  return <primitive object={object} dispose={null} />;
}

export default function City({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  const model = CITY_MODELS[preset.id];
  return model ? <District key={model.uid} model={model} /> : <IllustrativeCity preset={preset} clearings={clearings} />;
}
