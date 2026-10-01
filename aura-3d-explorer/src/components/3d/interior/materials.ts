/**
 * Interior materials — the "dollhouse cutaway" look.
 * -----------------------------------------------------------------------------
 * Crisp white plaster walls with flat cut tops, espresso-walnut doors and
 * frames, dark bronze glazing frames, pale tiles for kitchens, a stone lift
 * lobby. Shared by every isolated floor (only one floor mounts walls and
 * doors at a time), created lazily on first use. Textured materials tile per
 * real metre on instanced unit boxes via `tilePerUnit`.
 */
import * as THREE from "three";
import { brushedMetalBump, brushedMetalTexture, marbleBump, marbleTexture, plasterBump, plasterTexture, stoneBump, stoneTexture, tilePerUnit, woodBump, woodTexture } from "../textures";

export type InteriorMatKey = "wall" | "glass" | "bronze" | "walnut" | "skirting" | "brass" | "tile" | "lobby";

let mats: Record<InteriorMatKey, THREE.Material> | null = null;

export function interiorMaterials(): Record<InteriorMatKey, THREE.Material> {
  if (mats) return mats;
  const wall = new THREE.MeshStandardMaterial({ map: plasterTexture("#f7f5f1"), bumpMap: plasterBump("#f7f5f1"), bumpScale: 0.012, color: "#ffffff", roughness: 0.9 });
  tilePerUnit(wall, 0.5);
  const walnut = new THREE.MeshStandardMaterial({ map: woodTexture("#6a4630", "#2f1d13", 47), bumpMap: woodBump("#6a4630", "#2f1d13", 47), bumpScale: 0.04, roughness: 0.4 });
  tilePerUnit(walnut, 1.2);
  const tile = new THREE.MeshStandardMaterial({ map: marbleTexture(), bumpMap: marbleBump(), bumpScale: 0.018, color: "#f7f4ee", roughness: 0.16, envMapIntensity: 0.7 });
  tilePerUnit(tile, 0.8);
  const lobby = new THREE.MeshStandardMaterial({ map: stoneTexture(), bumpMap: stoneBump(), bumpScale: 0.045, color: "#f4efe6", roughness: 0.32 });
  tilePerUnit(lobby, 0.5);
  const bronze = new THREE.MeshStandardMaterial({ map: brushedMetalTexture("#3b2f25"), bumpMap: brushedMetalBump("#3b2f25"), bumpScale: 0.012, roughness: 0.34, metalness: 0.72, envMapIntensity: 1.05 });
  tilePerUnit(bronze, 1.6);
  const brass = new THREE.MeshStandardMaterial({ map: brushedMetalTexture("#c9a24a"), bumpMap: brushedMetalBump("#c9a24a"), bumpScale: 0.008, roughness: 0.26, metalness: 1, envMapIntensity: 1.15 });
  tilePerUnit(brass, 2);
  const skirting = new THREE.MeshStandardMaterial({ map: plasterTexture("#efebe4"), bumpMap: plasterBump("#efebe4"), bumpScale: 0.01, roughness: 0.55 });
  tilePerUnit(skirting, 1);
  mats = {
    wall,
    // Thin transmissive glass for partitions and sliders (the scene already renders a transmission pass for the curtain walls).
    glass: new THREE.MeshPhysicalMaterial({ color: "#e6f0f1", roughness: 0.04, metalness: 0, transmission: 0.92, thickness: 0.02, ior: 1.5, transparent: true, opacity: 0.9, depthWrite: false }),
    bronze,
    walnut,
    skirting,
    brass,
    tile,
    lobby,
  };
  return mats;
}

/** Shared unit box (scaled per instance). */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
