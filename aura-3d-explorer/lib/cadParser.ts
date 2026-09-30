/**
 * Client-side CAD "parsing preview".
 * - .stl  → fully parsed with Three's STLLoader (triangles, bounding box, preview mesh)
 * - .dxf  → text scan of the ENTITIES / LAYER tables (entity counts, layers, units)
 * - .dwg  → binary header sniff (AutoCAD release version)
 * Nothing is uploaded — it all runs in the browser.
 */
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export interface CadReport {
  fileName: string;
  sizeKb: number;
  format: "STL" | "DXF" | "DWG";
  facts: { label: string; value: string }[];
  geometry?: THREE.BufferGeometry;
  estimatedFloors?: number;
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

const DXF_UNITS: Record<string, string> = { "0": "Unitless", "1": "Inches", "2": "Feet", "4": "Millimetres", "5": "Centimetres", "6": "Metres" };

export const ACCEPTED = [".stl", ".dxf", ".dwg"];

export async function parseCadFile(file: File): Promise<CadReport> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const sizeKb = file.size / 1024;
  const buf = await file.arrayBuffer();

  if (ext === "stl") {
    const geo = new STLLoader().parse(buf);
    // Many exporters write zeroed facet normals — recompute for correct shading
    geo.deleteAttribute("normal");
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.center();
    const bb = geo.boundingBox!;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const tris = geo.getAttribute("position").count / 3;
    // Rough heuristic: treat the tallest axis as height and assume ~3.5 units per storey
    const h = Math.max(size.y, size.z);
    return {
      fileName: file.name,
      sizeKb,
      format: "STL",
      geometry: geo,
      estimatedFloors: Math.max(1, Math.round(h / 3.5)),
      facts: [
        { label: "Triangles", value: tris.toLocaleString() },
        { label: "Bounding box", value: `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}` },
        { label: "Est. storeys", value: String(Math.max(1, Math.round(h / 3.5))) },
      ],
    };
  }

  if (ext === "dxf") {
    const text = new TextDecoder().decode(buf);
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const counts: Record<string, number> = {};
    const layers = new Set<string>();
    let inEntities = false;
    let units = "Unknown";
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] === "$INSUNITS") units = DXF_UNITS[lines[i + 2]] ?? units;
      if (lines[i] === "2" && lines[i + 1] === "ENTITIES") inEntities = true;
      if (lines[i] === "0" && lines[i + 1] === "ENDSEC") inEntities = false;
      if (lines[i] === "8" && lines[i + 1]) layers.add(lines[i + 1]);
      if (inEntities && lines[i] === "0") {
        const t = lines[i + 1];
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ");
    return {
      fileName: file.name,
      sizeKb,
      format: "DXF",
      facts: [
        { label: "Entities", value: total.toLocaleString() },
        { label: "Top types", value: top || "—" },
        { label: "Layers", value: String(layers.size) },
        { label: "Units", value: units },
      ],
    };
  }

  if (ext === "dwg") {
    const code = new TextDecoder("ascii").decode(buf.slice(0, 6));
    return {
      fileName: file.name,
      sizeKb,
      format: "DWG",
      facts: [
        { label: "Release", value: DWG_VERSIONS[code] ?? `Unknown (${code})` },
        { label: "Header", value: code },
        { label: "Next step", value: "Full DWG geometry is extracted server-side in the paid pipeline" },
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
