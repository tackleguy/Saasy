/** Preserve authored appearance; normalize only after units and orientation are reviewed. */
import * as THREE from "three";
import { MODEL_SCALE } from "@/lib/tower";

export type UnitId = "m" | "mm" | "cm" | "ft" | "in" | "declared" | "unitless";

export interface NormalizeReport {
  upAxis: "Y" | "Z";
  /** Whether the up axis came from the format convention or was measured. */
  upSource: "format" | "detected";
  units: UnitId;
  unitsLabel: string;
  /** Metres per source unit. */
  metresPerUnit: number;
  /** Final scale applied (scene units per source unit). */
  scale: number;
  heightM: number;
  footprintM: [number, number];
  storeys: number;
  triangles: number;
  meshes: number;
  /** Model height in scene units (for camera framing). */
  heightUnits: number;
}

export interface MaterialReport {
  preserved: number;
  plaster: number;
  glass: number;
  edges: boolean;
  edgeSegments: number;
}

const UNIT_GUESSES: { id: UnitId; label: string; m: number }[] = [
  { id: "m", label: "metres", m: 1 },
  { id: "mm", label: "millimetres", m: 0.001 },
  { id: "cm", label: "centimetres", m: 0.01 },
  { id: "ft", label: "feet", m: 0.3048 },
  { id: "in", label: "inches", m: 0.0254 },
];
/** Skip the edge overlay above this many triangles (EdgesGeometry is O(n)). */
const EDGE_TRI_LIMIT = 400_000;
const STOREY_M = 3.5;

function countTris(root: THREE.Object3D) {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.getAttribute("position")?.count ?? 0) / 3;
  });
  return { tris: Math.round(tris), meshes };
}

/**
 * Wrap `model` in a normalised root group (Y-up, scene units, centred, on the ground).
 * The returned root carries `userData.heightUnits` for camera framing.
 */
export function normalizeImport(
  model: THREE.Object3D,
  hints: { upHint?: "y" | "z" | "auto"; metresPerUnit?: number } = {}
): { root: THREE.Group; report: NormalizeReport } {
  const root = new THREE.Group();
  root.name = "imported-model";
  const pivot = new THREE.Group();
  pivot.add(model);
  root.add(pivot);

  // Normals where missing (OBJ without vn, DXF faces, some FBX).
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.geometry.getAttribute("normal")) m.geometry.computeVertexNormals();
  });

  // 1. Up axis
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  root.updateMatrixWorld(true);
  box.setFromObject(root).getSize(size);
  let zUp = false;
  let upSource: NormalizeReport["upSource"] = "format";
  const hint = hints.upHint ?? "auto";
  if (hint === "z") zUp = true;
  else if (hint === "auto") {
    upSource = "detected";
    zUp = size.z > size.y * 1.5 && size.z > size.x * 0.8;
  }
  if (zUp) pivot.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  box.setFromObject(root).getSize(size);
  if (![size.x, size.y, size.z].every(Number.isFinite) || size.y <= 0) {
    throw new Error("This model has empty or invalid bounds. Re-export valid 3D geometry.");
  }
  const metres = hints.metresPerUnit ?? 1;
  if (!Number.isFinite(metres) || metres <= 0) throw new Error("Choose valid model units.");
  const named = UNIT_GUESSES.find(u => Math.abs(u.m - metres) < 1e-9);
  const unit = { id: named?.id ?? "declared" as UnitId, label: named?.label ?? `${metres} m/unit`, m: metres };

  // 3. Scale → scene units
  const scale = unit.m * MODEL_SCALE;
  pivot.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  // 4. Centre on XZ, base on y = 0
  box.setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  pivot.position.set(-c.x, -box.min.y, -c.z);
  root.updateMatrixWorld(true);
  box.setFromObject(root).getSize(size);

  const heightM = size.y / MODEL_SCALE;
  const { tris, meshes } = countTris(root);
  root.userData.heightUnits = size.y;

  return {
    root,
    report: {
      upAxis: zUp ? "Z" : "Y",
      upSource,
      units: unit.id,
      unitsLabel: unit.label,
      metresPerUnit: unit.m,
      scale,
      heightM,
      footprintM: [size.x / MODEL_SCALE, size.z / MODEL_SCALE],
      storeys: Math.max(1, Math.round(heightM / STOREY_M)),
      triangles: tris,
      meshes,
      heightUnits: size.y,
    },
  };
}

const GLASS_RE = /glass|glaz|window|vitr|curtain|pane|fenster|vidrio|verre/i;

/** Preserve PBR textures and authored finishes. Repair only missing / unlit CAD materials. */
export function applyArchMaterials(root: THREE.Object3D, { edges = false }: { edges?: boolean } = {}): MaterialReport {
  const report: MaterialReport = { preserved: 0, plaster: 0, glass: 0, edges: false, edgeSegments: 0 };
  const converted = new Map<THREE.Material, THREE.Material>();
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const buildEdges = edges && countTris(root).tris <= EDGE_TRI_LIMIT;
  for (const mesh of meshes) {
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = source.map(old => {
      if (old && (old as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        report.preserved++;
        return old;
      }
      if (old && converted.has(old)) return converted.get(old)!;
      const cad = old as THREE.MeshPhongMaterial | undefined;
      const glass = GLASS_RE.test(`${mesh.name} ${old?.name ?? ""}`) && meshes.length > 1;
      const mat = new THREE.MeshPhysicalMaterial({
        name: old?.name || (glass ? "Glazing" : "CAD surface"),
        color: cad?.color ?? new THREE.Color(glass ? "#BFD3D8" : "#D8D2C8"),
        map: cad?.map ?? null, normalMap: cad?.normalMap ?? null,
        bumpMap: cad?.bumpMap ?? null, bumpScale: cad?.bumpScale ?? 1,
        alphaMap: cad?.alphaMap ?? null, vertexColors: old?.vertexColors ?? false,
        side: old?.side ?? THREE.FrontSide,
        transparent: glass ? false : old?.transparent ?? false,
        opacity: glass ? 1 : old?.opacity ?? 1,
        alphaTest: old?.alphaTest ?? 0,
        transmission: glass ? .85 : 0, thickness: glass ? .012 * MODEL_SCALE : 0,
        ior: 1.5, roughness: glass ? .08 : .65, metalness: 0,
        clearcoat: glass ? 1 : 0, envMapIntensity: 1.3,
      });
      if (old) converted.set(old, mat);
      if (glass) report.glass++; else report.plaster++;
      return mat;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
    mesh.castShadow = !next.every(m => (m as THREE.MeshPhysicalMaterial).transmission > .5);
    mesh.receiveShadow = true;
    if (buildEdges) {
      const geo = new THREE.EdgesGeometry(mesh.geometry, 30);
      report.edgeSegments += geo.getAttribute("position").count / 2;
      const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#282728", transparent: true, opacity: .18 }));
      lines.userData.isEdgeOverlay = true;
      lines.raycast = () => {};
      mesh.add(lines);
    }
  }
  for (const old of converted.keys()) old.dispose();
  root.userData.hasEdges = buildEdges;
  root.userData.edgesVisible = buildEdges;
  report.edges = buildEdges;
  return report;
}

/** Show / hide the edge overlay built by `applyArchMaterials`. */
export function setEdgesVisible(root: THREE.Object3D, visible: boolean) {
  root.traverse((o) => {
    if (o.userData.isEdgeOverlay) o.visible = visible;
  });
  root.userData.edgesVisible = visible;
}
