/**
 * Post-import normalisation + archviz materials for imported CAD / 3D models.
 * -----------------------------------------------------------------------------
 * `normalizeImport(model, hints)` wraps the loaded object so it sits in the
 * scene like the procedural towers:
 *
 *   1. Up axis  — CAD formats (STL, DXF) are usually Z-up; glTF/FBX are Y-up
 *                 (FBXLoader converts). OBJ is detected from the bounds. Z-up
 *                 models are rotated −90° about X.
 *   2. Units    — declared units win (DXF $INSUNITS, FBX UnitScaleFactor);
 *                 otherwise guessed from the height, assuming a building is
 *                 ~10–400 m tall: m → mm → cm → ft → in. Anything smaller is
 *                 treated as a unitless massing and fitted to 60 m.
 *   3. Scale    — metres × MODEL_SCALE (1 scene unit ≈ 3.57 m, see lib/tower).
 *   4. Placement— centred on XZ, base dropped to y = 0.
 *   5. Normals  — computed where missing.
 *
 * `applyArchMaterials(root)` swaps every material for a warm plaster, or a
 * tinted physical glass when a mesh / material name suggests glazing, turns
 * shadows on, and adds a toggleable 30° edge-line overlay (skipped on very
 * heavy meshes). Everything returned is a plain report for the ingest terminal.
 */
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
const MIN_BUILDING_M = 10;
const MAX_BUILDING_M = 400;
const UNITLESS_FIT_M = 60;
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
  if (hint === "z") {
    // CAD convention — unless the bounds clearly say it was already exported Y-up.
    zUp = !(size.y > size.z * 1.5);
    if (!zUp) upSource = "detected";
  } else if (hint === "auto") {
    upSource = "detected";
    // Tall along Z relative to the Y extent and to the footprint → Z-up.
    zUp = size.z > size.y * 1.5 && size.z > size.x * 0.8;
  }
  if (zUp) pivot.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  box.setFromObject(root).getSize(size);
  const rawH = Math.max(size.y, 1e-6);

  // 2. Units
  let unit = { id: "unitless" as UnitId, label: "unitless", m: UNITLESS_FIT_M / rawH };
  if (hints.metresPerUnit) {
    unit = { id: "declared", label: `declared (${hints.metresPerUnit} m/unit)`, m: hints.metresPerUnit };
    const named = UNIT_GUESSES.find((u) => Math.abs(u.m - hints.metresPerUnit!) < 1e-9);
    if (named) unit = { id: named.id, label: `${named.label} (declared)`, m: named.m };
  } else {
    const guess = UNIT_GUESSES.find((u) => rawH * u.m >= MIN_BUILDING_M && rawH * u.m <= MAX_BUILDING_M);
    if (guess) unit = { id: guess.id, label: guess.label, m: guess.m };
    else if (rawH * 0.0254 > MAX_BUILDING_M) unit = { id: "mm", label: "millimetres (best guess)", m: 0.001 };
  }

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

/** Replace every material with the archviz set; adds an edge overlay (hidden by `edges: false`). */
export function applyArchMaterials(root: THREE.Object3D, { edges = true }: { edges?: boolean } = {}): MaterialReport {
  const plaster = new THREE.MeshPhysicalMaterial({
    name: "aura-plaster",
    color: 0xece6dc,
    roughness: 0.75,
    metalness: 0,
    clearcoat: 0,
    side: THREE.DoubleSide, // CAD exports often have inconsistent winding
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: "aura-glass",
    color: 0xb9ccd3,
    roughness: 0.05,
    metalness: 0,
    transmission: 0, // off for performance — opacity carries the see-through
    envMapIntensity: 2.2,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2b2722, transparent: true, opacity: 0.28, depthWrite: false });

  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const { tris } = countTris(root);
  const buildEdges = edges && tris <= EDGE_TRI_LIMIT;

  const report: MaterialReport = { plaster: 0, glass: 0, edges: buildEdges, edgeSegments: 0 };
  for (const m of meshes) {
    const old = Array.isArray(m.material) ? m.material : [m.material];
    // Glazing if the mesh / its parent / any of its materials is named like it.
    const names = [m.name, m.parent?.name ?? "", ...old.map((x) => x?.name ?? "")].join(" ");
    const isGlass = GLASS_RE.test(names) && meshes.length > 1;
    if (Array.isArray(m.material)) {
      m.material = old.map((x) => (GLASS_RE.test(x?.name ?? "") ? glass : plaster));
    } else {
      m.material = isGlass ? glass : plaster;
    }
    for (const x of old) if (x && x !== plaster && x !== glass) x.dispose();
    if (isGlass) report.glass++;
    else report.plaster++;
    m.castShadow = true;
    m.receiveShadow = !isGlass;

    if (buildEdges) {
      const eg = new THREE.EdgesGeometry(m.geometry, 30);
      report.edgeSegments += eg.getAttribute("position").count / 2;
      const lines = new THREE.LineSegments(eg, edgeMat);
      lines.name = "aura-edges";
      lines.userData.isEdgeOverlay = true;
      lines.raycast = () => {};
      m.add(lines);
    }
  }
  root.userData.hasEdges = buildEdges;
  root.userData.edgesVisible = buildEdges;
  return report;
}

/** Show / hide the edge overlay built by `applyArchMaterials`. */
export function setEdgesVisible(root: THREE.Object3D, visible: boolean) {
  root.traverse((o) => {
    if (o.userData.isEdgeOverlay) o.visible = visible;
  });
  root.userData.edgesVisible = visible;
}
