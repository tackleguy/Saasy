import * as THREE from "three";

export const MODEL_PARTS = ["Core", "Doors", "Floors", "Furniture", "Plants", "People"] as const;
export type ModelPart = typeof MODEL_PARTS[number];
const names: Record<ModelPart, RegExp> = {
  Core: /core|shaft|stair|elevator|lift|ifcstair/i,
  Doors: /door|porte|ifcdoor/i,
  Floors: /floor|slab|storey|story|ifcslab/i,
  Furniture: /furn|sofa|chair|table|bed|desk|cabinet/i,
  Plants: /plant|tree|foliage|vegetation/i,
  People: /person|people|human|pedestrian|character/i,
};
export interface ModelReview {
  meshes: number; triangles: number; materials: number; textured: number;
  parts: Record<ModelPart, number>; issues: string[]; errors: string[];
}
export function reviewModel(root: THREE.Object3D): ModelReview {
  const report: ModelReview = { meshes: 0, triangles: 0, materials: 0, textured: 0,
    parts: { Core: 0, Doors: 0, Floors: 0, Furniture: 0, Plants: 0, People: 0 }, issues: [], errors: [] };
  const materials = new Set<THREE.Material>();
  let invalid = 0, missingNormals = 0, missingUV = 0;
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    report.meshes++;
    const pos = mesh.geometry.getAttribute("position");
    if (!pos || pos.count < 3) { invalid++; return; }
    for (let i = 0; i < pos.count; i++) {
      if (![pos.getX(i), pos.getY(i), pos.getZ(i)].every(Number.isFinite)) { invalid++; break; }
    }
    report.triangles += (mesh.geometry.index?.count ?? pos.count) / 3;
    if (!mesh.geometry.getAttribute("normal")) missingNormals++;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let label = mesh.name;
    for (let parent = mesh.parent; parent; parent = parent.parent) label += ` ${parent.name}`;
    label += mats.map(m => m?.name ?? "").join(" ");
    for (const key of MODEL_PARTS) if (names[key].test(label)) report.parts[key]++;
    for (const mat of mats) {
      if (!mat) continue;
      materials.add(mat);
      if ((mat as THREE.MeshStandardMaterial).map && !mesh.geometry.getAttribute("uv")) missingUV++;
    }
  });
  report.materials = materials.size;
  report.textured = [...materials].filter(m => (m as THREE.MeshStandardMaterial).map).length;
  if (!report.meshes) report.errors.push("No renderable meshes. Export a GLB, FBX, OBJ or 3D CAD file.");
  if (invalid) report.errors.push(`${invalid} meshes contain empty or non-finite geometry. Repair them in the source model.`);
  if (missingNormals) report.issues.push(`Surface normals will be generated for ${missingNormals} meshes.`);
  if (missingUV) report.issues.push(`${missingUV} textured surfaces have no UV coordinates. Re-export texture coordinates to restore them.`);
  if (!report.textured) report.issues.push("No image textures found. Surface detail is limited to the supplied materials.");
  if (report.triangles > 2_000_000) report.issues.push("Dense model: over two million triangles. Lower quality may be needed for smooth movement.");
  if (Object.values(report.parts).some(n => !n)) report.issues.push("Parts are identified from object names. ‘Unidentified’ can mean missing geometry or unnamed objects; inspect the preview.");
  return report;
}

/** Dispose resources owned by a local import after replacement or cancellation. */
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}
