/**
 * Client-side CAD / 3D model import.
 * -----------------------------------------------------------------------------
 * Reads a dropped file in the browser (nothing is uploaded) and returns a
 * `CadReport`: human-readable facts for the ingestion terminal plus, whenever
 * the format carries geometry, the loaded `THREE.Object3D` (`report.model`)
 * ready for `normalizeImport` (lib/importNormalize).
 *
 *   .stl          STLLoader → one mesh (facet normals recomputed)
 *   .obj          OBJLoader → group of meshes (names / materials kept)
 *   .glb / .gltf  GLTFLoader, single-file only (binary, or embedded base64 buffers)
 *   .fbx          FBXLoader (its own up-axis conversion; UnitScaleFactor → units hint)
 *   .dxf          text scan of ENTITIES / LAYER tables, plus geometry:
 *                 3DFACE → triangles, LINE → line segments, closed
 *                 LWPOLYLINE → extruded floor plates (thickness, or one storey)
 *   .dwg          binary header sniff only (release version) — no geometry
 *
 * Heavy loaders are dynamically imported so they load only when used.
 */
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export type CadFormat = "STL" | "DXF" | "DWG" | "OBJ" | "GLTF" | "FBX";

export interface CadReport {
  fileName: string;
  sizeKb: number;
  format: CadFormat;
  facts: { label: string; value: string }[];
  estimatedFloors?: number;
  /** Loaded geometry (un-normalised), when the format carries any. */
  model?: THREE.Object3D;
  /** Up-axis convention of the source: "z" = CAD-style, "y" = glTF-style, "auto" = detect. */
  upHint?: "y" | "z" | "auto";
  /** Metres per file unit, when the file declares it (DXF $INSUNITS, FBX UnitScaleFactor). */
  metresPerUnit?: number;
}

const DWG_VERSIONS: Record<string, string> = {
  AC1009: "AutoCAD R11/12",
  AC1012: "AutoCAD R13",
  AC1014: "AutoCAD R14",
  AC1015: "AutoCAD 2000",
  AC1018: "AutoCAD 2004",
  AC1021: "AutoCAD 2007",
  AC1024: "AutoCAD 2010",
  AC1027: "AutoCAD 2013",
  AC1032: "AutoCAD 2018+",
};

const DXF_UNITS: Record<string, { name: string; m?: number }> = {
  "0": { name: "Unitless" },
  "1": { name: "Inches", m: 0.0254 },
  "2": { name: "Feet", m: 0.3048 },
  "4": { name: "Millimetres", m: 0.001 },
  "5": { name: "Centimetres", m: 0.01 },
  "6": { name: "Metres", m: 1 },
};

export const ACCEPTED = [".stl", ".obj", ".glb", ".gltf", ".fbx", ".dxf", ".dwg"];

/** Count meshes and triangles under an object. */
function meshStats(root: THREE.Object3D) {
  let meshes = 0;
  let tris = 0;
  const materials = new Set<string>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.getAttribute("position")?.count ?? 0) / 3;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat) materials.add(mat.name || mat.uuid);
  });
  return { meshes, tris: Math.round(tris), materials: materials.size };
}

function rawSize(root: THREE.Object3D) {
  const s = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  return `${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)}`;
}

function meshFacts(root: THREE.Object3D) {
  const st = meshStats(root);
  return [
    { label: "Meshes", value: `${st.meshes} · ${st.materials} material${st.materials === 1 ? "" : "s"}` },
    { label: "Triangles", value: st.tris.toLocaleString() },
    { label: "Raw bounds", value: rawSize(root) },
  ];
}

/* ------------------------------------------------------------------ DXF --- */

interface DxfEntity {
  type: string;
  layer: string;
  codes: [number, string][];
}

/** Split the ENTITIES section into (type, group-code list) records. */
function readDxfEntities(lines: string[]): DxfEntity[] {
  const out: DxfEntity[] = [];
  let inEntities = false;
  let cur: DxfEntity | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    const val = lines[i + 1];
    if (code === 2 && val === "ENTITIES") {
      inEntities = true;
      continue;
    }
    if (!inEntities) continue;
    if (code === 0) {
      if (cur) out.push(cur);
      if (val === "ENDSEC") break;
      cur = { type: val, layer: "0", codes: [] };
    } else if (cur) {
      if (code === 8) cur.layer = val;
      cur.codes.push([code, val]);
    }
  }
  return out;
}

/** Build meshes / lines from 3DFACE, LINE and closed LWPOLYLINE entities (Z-up, file units). */
function dxfGeometry(ents: DxfEntity[], storeyInUnits: number): { root: THREE.Group; faces: number; lines: number; plates: number } {
  const facePos: number[] = [];
  const linePos: number[] = [];
  const root = new THREE.Group();
  root.name = "dxf";
  let faces = 0;
  let lines = 0;
  let plates = 0;
  const plateGeos: THREE.BufferGeometry[] = [];

  for (const e of ents) {
    const get = (c: number) => {
      const hit = e.codes.find(([k]) => k === c);
      return hit ? parseFloat(hit[1]) : 0;
    };
    if (e.type === "3DFACE") {
      const v = [0, 1, 2, 3].map((k) => [get(10 + k), get(20 + k), get(30 + k)]);
      facePos.push(...v[0], ...v[1], ...v[2]);
      const quad = v[3][0] !== v[2][0] || v[3][1] !== v[2][1] || v[3][2] !== v[2][2];
      if (quad) facePos.push(...v[0], ...v[2], ...v[3]);
      faces++;
    } else if (e.type === "LINE") {
      linePos.push(get(10), get(20), get(30), get(11), get(21), get(31));
      lines++;
    } else if (e.type === "LWPOLYLINE") {
      if ((get(70) & 1) === 0) continue; // open polyline — not a plate
      const pts: THREE.Vector2[] = [];
      let x: number | null = null;
      for (const [c, v] of e.codes) {
        if (c === 10) x = parseFloat(v);
        else if (c === 20 && x !== null) {
          pts.push(new THREE.Vector2(x, parseFloat(v)));
          x = null;
        }
      }
      if (pts.length < 3) continue;
      const depth = Math.abs(get(39)) || storeyInUnits;
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false });
      geo.translate(0, 0, get(38)); // elevation
      plateGeos.push(geo);
      plates++;
    }
  }

  if (facePos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(facePos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    m.name = "3dfaces";
    root.add(m);
  }
  for (const g of plateGeos) {
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    m.name = "floor_plate";
    root.add(m);
  }
  if (linePos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2b2722, transparent: true, opacity: 0.5 }));
    l.name = "dxf_lines";
    root.add(l);
  }
  return { root, faces, lines, plates };
}

/* ----------------------------------------------------------------- parse --- */

export async function parseCadFile(file: File): Promise<CadReport> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const sizeKb = file.size / 1024;
  const buf = await file.arrayBuffer();
  const base = { fileName: file.name, sizeKb };

  if (ext === "stl") {
    const geo = new STLLoader().parse(buf);
    // Many exporters write zeroed facet normals — recompute for correct shading
    geo.deleteAttribute("normal");
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    mesh.name = file.name.replace(/\.[^.]+$/, "");
    return { ...base, format: "STL", model: mesh, upHint: "z", facts: meshFacts(mesh) };
  }

  if (ext === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    const group = new OBJLoader().parse(new TextDecoder().decode(buf));
    return { ...base, format: "OBJ", model: group, upHint: "auto", facts: meshFacts(group) };
  }

  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    let gltf;
    try {
      gltf = await new GLTFLoader().parseAsync(ext === "gltf" ? new TextDecoder().decode(buf) : buf, "");
    } catch (e) {
      throw new Error(
        ext === "gltf"
          ? "This .gltf references external .bin/texture files. Export a single-file .glb (or embedded .gltf) instead."
          : `Could not read the GLB: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return { ...base, format: "GLTF", model: gltf.scene, upHint: "y", facts: meshFacts(gltf.scene) };
  }

  if (ext === "fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    // Silence texture 404s: materials are replaced by the archviz set anyway.
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(() => "data:,");
    const group = new FBXLoader(manager).parse(buf, "");
    const usf = group.userData.unitScaleFactor as number | undefined; // centimetres per unit
    return {
      ...base,
      format: "FBX",
      model: group,
      upHint: "y",
      metresPerUnit: usf ? usf / 100 : undefined,
      facts: meshFacts(group),
    };
  }

  if (ext === "dxf") {
    const text = new TextDecoder().decode(buf);
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const layers = new Set<string>();
    let unitCode = "";
    for (let i = 0; i < lines.length - 2; i++) {
      if (lines[i] === "$INSUNITS") unitCode = lines[i + 2];
      if (lines[i] === "8" && lines[i + 1]) layers.add(lines[i + 1]);
    }
    const unit = DXF_UNITS[unitCode];
    const ents = readDxfEntities(lines);
    const counts: Record<string, number> = {};
    for (const e of ents) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ");
    // One storey (3.5 m) in file units — used for plates without a thickness.
    const storey = 3.5 / (unit?.m ?? 1);
    const geo = dxfGeometry(ents, storey);
    const hasSolid = geo.faces > 0 || geo.plates > 0;
    const facts = [
      { label: "Entities", value: ents.length.toLocaleString() },
      { label: "Top types", value: top || "—" },
      { label: "Layers", value: String(layers.size) },
      { label: "Units", value: unit?.name ?? "Unknown" },
      {
        label: "Geometry",
        value: hasSolid
          ? `${geo.faces} 3DFACE · ${geo.plates} plates extruded · ${geo.lines} lines`
          : geo.lines
          ? `${geo.lines} lines (no closed polylines or faces to extrude)`
          : "none usable (2D annotation only)",
      },
    ];
    return {
      ...base,
      format: "DXF",
      facts,
      model: hasSolid || geo.lines ? geo.root : undefined,
      upHint: "z",
      metresPerUnit: unit?.m,
    };
  }

  if (ext === "dwg") {
    const code = new TextDecoder("ascii").decode(buf.slice(0, 6));
    return {
      ...base,
      format: "DWG",
      facts: [
        { label: "Release", value: DWG_VERSIONS[code] ?? `Unknown (${code})` },
        { label: "Header", value: code },
        { label: "Geometry", value: "Binary DWG — header only (export DXF / GLB for 3D)" },
      ],
    };
  }

  throw new Error(`Unsupported file type ".${ext}". Please use ${ACCEPTED.join(", ")}.`);
}

/** Build a tiny stepped-tower ASCII STL so visitors can try the parser without a file */
export function makeSampleStl(): File {
  const boxes = [
    [0, 0, 0, 30, 5, 22],
    [4, 5, 3, 22, 24, 16],
    [6, 29, 4, 18, 34, 14],
    [8, 63, 5, 14, 12, 12],
  ];
  const tri = (a: number[], b: number[], c: number[]) =>
    `facet normal 0 0 0\n outer loop\n  vertex ${a.join(" ")}\n  vertex ${b.join(" ")}\n  vertex ${c.join(" ")}\n endloop\nendfacet\n`;
  let out = "solid aura_sample\n";
  for (const [x, y, z, w, h, d] of boxes) {
    const v = [
      [x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z],
      [x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d],
    ];
    const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
    for (const [a, b, c] of faces) out += tri(v[a], v[b], v[c]);
  }
  out += "endsolid aura_sample\n";
  return new File([out], "aura_sample_tower.stl", { type: "model/stl" });
}
