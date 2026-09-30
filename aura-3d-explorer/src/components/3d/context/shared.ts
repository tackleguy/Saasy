/**
 * Helpers shared by the urban-context components.
 */
import * as THREE from "three";
import { SITE_ROTATION_Y, uwToXZ } from "@/lib/siteLayout";

export const noRaycast = () => null;

/** Seeded PRNG so the context is identical on every load. */
export function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Quaternion that turns a model's local +X along +u (the street direction). */
export const ALONG_U = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SITE_ROTATION_Y);
/** …and along −u. */
export const ALONG_MINUS_U = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SITE_ROTATION_Y + Math.PI);
/** Flat plane (XY → ground) aligned to the u/w frame. */
export const FLAT_UW = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, SITE_ROTATION_Y));

/** Compose an instance matrix at screen-frame (u, w). */
export function placeUW(u: number, w: number, y: number, q: THREE.Quaternion, scale: THREE.Vector3 | number, out = new THREE.Matrix4()) {
  const [x, z] = uwToXZ(u, w);
  const s = typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : scale;
  return out.compose(new THREE.Vector3(x, y, z), q, s);
}

/** Upload matrices (and optional colours) to an InstancedMesh once. */
export function uploadInstances(mesh: THREE.InstancedMesh | null, matrices: THREE.Matrix4[], colors?: THREE.Color[]) {
  if (!mesh) return;
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  if (colors) {
    colors.forEach((c, i) => mesh.setColorAt(i, c));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
}
