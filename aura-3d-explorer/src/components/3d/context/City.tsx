"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { SUN, useCinematic } from "../environment/settings";
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
import CleanGeometricSkyline from "./CleanGeometricSkyline";
import { applyArchitecturalFacade, setFacadeNight } from "./architecturalContextMaterial";

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
  const { tier, time } = useCinematic();
  const gl = useThree((state) => state.gl);
  const highTextures = model.textured && tier === "high";
  const [object, setObject] = useState<THREE.Group | null>(null);
  const { attempt } = useCityModelStatus(model.uid);

  useFrame(() => {
    setFacadeNight(SUN[time].night);
  });

  useEffect(() => {
    const controller = new AbortController();
    let rootGroup: THREE.Group | null = null;
    setObject(null);
    setCityModelStatus(model.uid, "loading");
    async function load() {
      try {
        const response = await fetch(`/models/sketchfab/${model.uid}/${highTextures ? "model-hq.glb" : "model.glb"}`, { signal: controller.signal });
        if (!response.ok) throw new Error("City model unavailable");
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
        const loaded = gltf.scene;
        if (controller.signal.aborted) { disposeCity(loaded); return; }

        const root = new THREE.Group();
        rootGroup = root;

        const district = new THREE.Group();
        district.add(loaded);
        loaded.rotation.y += model.rotation;
        district.updateMatrixWorld(true);

        // Filter out flat GIS ground / terrain meshes (e.g. ESRI export satellite ground planes)
        loaded.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const nameLower = node.name.toLowerCase();
          if (
            nameLower.includes("export_esri") ||
            nameLower.includes("rastmat") ||
            nameLower.includes("topo") ||
            nameLower.includes("ground") ||
            nameLower.includes("terrain")
          ) {
            node.visible = false;
          }
        });

        const bounds = new THREE.Box3().setFromObject(district, true);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = model.width / Math.max(size.x, size.z, 0.001);

        // Align the modelled ground surface, not the lowest underground vertex.
        loaded.position.sub(new THREE.Vector3(center.x, model.groundY, center.z));
        district.scale.setScalar(scale);

        // Georeferenced positioning:
        if (model.worldPosition) {
          district.position.set(model.worldPosition[0], model.worldPosition[1], model.worldPosition[2]);
        } else {
          const offsetU = model.offsetU ?? 0;
          const offsetW = model.offsetW ?? (-55 - size.z * scale / 2);
          const [x, z] = uwToXZ(offsetU, offsetW);
          district.position.set(x, 0.04, z);
        }
        district.rotation.y = SITE_ROTATION_Y;
        root.add(district);

        const adapted = new Set<THREE.Material>();
        loaded.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          if (!node.visible) return;
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
            if (material instanceof THREE.MeshStandardMaterial) {
              if (!material.map) {
                // Procedural architectural facade texturing for untextured building meshes
                applyArchitecturalFacade(material, {
                  defaultColor: model.uid === "570076f49f0c4b63a51948db40e92c31" ? "#889fae" : "#72808c",
                });
              } else {
                for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
                  value.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
                  value.needsUpdate = true;
                }
              }
            }
          }
        });

        // Load authored Sketchfab landmark models anchored into this city's skyline
        if (model.landmarks && model.landmarks.length > 0) {
          for (const lm of model.landmarks) {
            if (controller.signal.aborted) break;
            try {
              const lmRes = await fetch(`/models/sketchfab/${lm.uid}/model.glb`, { signal: controller.signal });
              if (!lmRes.ok) continue;
              const lmGltf = await new GLTFLoader().parseAsync(await lmRes.arrayBuffer(), "");
              if (controller.signal.aborted) {
                disposeCity(lmGltf.scene);
                break;
              }
              const lmScene = lmGltf.scene;
              const lmBounds = new THREE.Box3().setFromObject(lmScene);
              const lmCenter = lmBounds.getCenter(new THREE.Vector3());
              const lmSize = lmBounds.getSize(new THREE.Vector3());
              lmScene.position.set(-lmCenter.x, -lmBounds.min.y, -lmCenter.z);

              const lmGroup = new THREE.Group();
              lmGroup.add(lmScene);

              const pos: [number, number, number] = lm.position
                ? lm.position
                : lm.uw
                ? [uwToXZ(lm.uw[0], lm.uw[1])[0], 0.04, uwToXZ(lm.uw[0], lm.uw[1])[1]]
                : [0, 0.04, 0];
              lmGroup.position.set(pos[0], pos[1], pos[2]);

              const lmScale = lm.targetHeight ? (lm.targetHeight / Math.max(lmSize.y, 0.001)) : (lm.scale ?? 1);
              lmGroup.scale.setScalar(lmScale);

              if (lm.rotationY !== undefined) {
                lmGroup.rotation.y = lm.rotationY;
              }

              lmScene.traverse((node) => {
                if (!(node instanceof THREE.Mesh)) return;
                node.raycast = noRaycast;
                node.castShadow = true;
                node.receiveShadow = false;
                for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
                  mat.fog = false;
                  if (mat instanceof THREE.MeshStandardMaterial && !mat.map) {
                    applyArchitecturalFacade(mat, {
                      defaultColor: lm.uid === "191cf9a66d204ccc941e097bcfe90f27" ? "#95b0be" : "#7c8b96",
                    });
                  }
                }
              });
              root.add(lmGroup);
            } catch (err) {
              console.warn(`Landmark ${lm.name} could not load:`, err);
            }
          }
        }

        setObject(root);
        setCityModelStatus(model.uid, "ready");
        invalidateShadows();
      } catch {
        if (!controller.signal.aborted) setCityModelStatus(model.uid, "failed");
      }
    }
    void load();
    return () => {
      controller.abort();
      if (rootGroup) disposeCity(rootGroup);
      invalidateShadows();
    };
  }, [model, attempt, highTextures, gl]);
  if (!object) return null;
  return <primitive object={object} dispose={null} />;
}

export default function City({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  const model = CITY_MODELS[preset.id];
  return model ? (
    <District key={model.uid} model={model} />
  ) : (
    <CleanGeometricSkyline preset={preset} clearings={clearings} />
  );
}
