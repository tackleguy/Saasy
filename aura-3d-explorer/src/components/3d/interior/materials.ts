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
import { marbleTexture, plasterTexture, stoneTexture, tilePerUnit, woodTexture } from "../textures";

export type InteriorMatKey = "wall" | "glass" | "bronze" | "walnut" | "skirting" | "brass" | "tile" | "lobby";

let mats: Record<InteriorMatKey, THREE.Material> | null = null;

export function interiorMaterials(): Record<InteriorMatKey, THREE.Material> {
  if (mats) return mats;
  const wall = new THREE.MeshStandardMaterial({ map: plasterTexture("#f7f5f1"), color: "#ffffff", roughness: 0.92 });
  tilePerUnit(wall, 0.5);
  const walnut = new THREE.MeshStandardMaterial({ map: woodTexture("#6a4630", "#2f1d13", 47), roughness: 0.48 });
  tilePerUnit(walnut, 1.2);
  const tile = new THREE.MeshStandardMaterial({ map: marbleTexture(), color: "#f4f1ec", roughness: 0.22 });
  tilePerUnit(tile, 0.8);
  const lobby = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: "#e9e3d8", roughness: 0.35 });
  tilePerUnit(lobby, 0.5);
  mats = {
    wall,
    // Thin transmissive glass for partitions and sliders (the scene already renders a transmission pass for the curtain walls).
    glass: new THREE.MeshPhysicalMaterial({ color: "#e6f0f1", roughness: 0.04, metalness: 0, transmission: 0.92, thickness: 0.02, ior: 1.5, transparent: true, opacity: 0.9, depthWrite: false }),
    bronze: new THREE.MeshStandardMaterial({ color: "#3b2f25", roughness: 0.38, metalness: 0.65 }),
    walnut,
    skirting: new THREE.MeshStandardMaterial({ color: "#efebe4", roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: "#c9a24a", roughness: 0.28, metalness: 1 }),
    tile,
    lobby,
  };
  return mats;
}

/** Shared unit box (scaled per instance). */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
