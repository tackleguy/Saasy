/**
 * Three.js geometry builders for floor plates & furniture.
 * Kept separate from React so they are cheap to memoise.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FloorPlate, pointInPolygon, Pt, ZoneId } from "@/lib/building";

export const SLAB_THICKNESS = 0.45;

/** Convert a footprint into a THREE.Shape (note: shape Y = −world Z, see extrudeUp) */
function toShape(pts: Pt[], scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => {
    const px = x * scale;
    const py = -z * scale;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  });
  s.closePath();
  return s;
}

/**
 * Extrude a footprint upward along +Y (ExtrudeGeometry extrudes along +Z,
 * so we rotate −90° about X which maps shape (x, y) → world (x, depth, −y)).
 */
export function extrudeUp(pts: Pt[], height: number, scale = 1, bevel = false): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(toShape(pts, scale), {
    depth: height,
    bevelEnabled: bevel,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Slab + glass geometries for one floor plate */
export function buildPlateGeometries(p: FloorPlate) {
  const slab = extrudeUp(p.footprint, SLAB_THICKNESS, 1, true);
  // The podium lobby & crown get a slightly deeper glass inset for drama
  const inset = p.zone === "podium" ? 0.94 : p.zone === "crown" ? 0.95 : 0.965;
  const glassH = p.height - SLAB_THICKNESS;
  const glass = extrudeUp(p.footprint, glassH, inset);
  glass.translate(0, SLAB_THICKNESS, 0);
  const edges = new THREE.EdgesGeometry(glass, 20);
  const slabEdges = new THREE.EdgesGeometry(slab, 20);
  return { slab, glass, edges, slabEdges };
}

/* -------------------------------------------------------------- furniture */

interface Box {
  x: number;
  z: number;
  w: number; // x size
  d: number; // z size
  h: number; // y size
  y?: number; // base elevation above the slab
}

/** Is a rectangle fully inside the footprint (with margin)? */
function fits(b: Box, poly: Pt[], margin = 0.8): boolean {
  const hx = b.w / 2 + margin;
  const hz = b.d / 2 + margin;
  const corners: Pt[] = [
    [b.x - hx, b.z - hz],
    [b.x + hx, b.z - hz],
    [b.x + hx, b.z + hz],
    [b.x - hx, b.z + hz],
  ];
  return corners.every((c) => pointInPolygon(c, poly));
}

/** Central structural/lift core — kept clear of furniture */
function inCore(x: number, z: number, cw: number, cd: number) {
  return Math.abs(x) < cw / 2 && Math.abs(z) < cd / 2;
}

function bounds(poly: Pt[]) {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Procedural low-poly layout for each programme type */
function layoutFor(zone: ZoneId, poly: Pt[], floorH: number): Box[] {
  const boxes: Box[] = [];
  const b = bounds(poly);
  const core = { w: 6, d: 4.5 };

  // Lift/stair core on every floor
  boxes.push({ x: 0, z: 0, w: core.w, d: core.d, h: floorH - SLAB_THICKNESS - 0.05 });

  const add = (bx: Box) => {
    if (fits(bx, poly) && !inCore(bx.x, bx.z, core.w + bx.w + 1.2, core.d + bx.d + 1.2)) boxes.push(bx);
  };

  if (zone === "office") {
    // Benching desk clusters: pairs of desks with chairs, on a regular grid
    for (let x = b.minX + 2; x <= b.maxX - 2; x += 3.4) {
      for (let z = b.minZ + 2; z <= b.maxZ - 2; z += 3.2) {
        const desk: Box = { x, z, w: 2.6, d: 1.5, h: 0.75 };
        if (!fits(desk, poly) || inCore(x, z, core.w + 4, core.d + 3.5)) continue;
        boxes.push(desk);
        boxes.push({ x: x - 0.65, z: z - 1.15, w: 0.55, d: 0.55, h: 0.9 });
        boxes.push({ x: x + 0.65, z: z - 1.15, w: 0.55, d: 0.55, h: 0.9 });
        boxes.push({ x: x - 0.65, z: z + 1.15, w: 0.55, d: 0.55, h: 0.9 });
        boxes.push({ x: x + 0.65, z: z + 1.15, w: 0.55, d: 0.55, h: 0.9 });
      }
    }
    // Meeting room table beside the core
    add({ x: core.w / 2 + 2.6, z: 0, w: 1.4, d: 3.2, h: 0.75 });
  } else if (zone === "residential") {
    // Residences arranged as modules around the core: each gets sofa + bed + table
    const cell = { w: 6, d: 5 };
    for (let x = b.minX + cell.w / 2; x <= b.maxX - cell.w / 2 + 0.01; x += cell.w) {
      for (let z = b.minZ + cell.d / 2; z <= b.maxZ - cell.d / 2 + 0.01; z += cell.d) {
        if (inCore(x, z, core.w + 2, core.d + 2)) continue;
        const bed: Box = { x: x - 1.4, z: z - 0.8, w: 1.6, d: 2.0, h: 0.55 };
        const sofa: Box = { x: x + 1.3, z: z + 1.3, w: 2.2, d: 0.85, h: 0.85 };
        const table: Box = { x: x + 1.3, z: z - 0.3, w: 1.0, d: 1.0, h: 0.75 };
        if (fits(bed, poly, 0.4)) boxes.push(bed, { ...bed, z: bed.z - 0.95, d: 0.12, h: 1.1 }); // headboard
        if (fits(sofa, poly, 0.4)) boxes.push(sofa, { ...sofa, z: sofa.z + 0.35, d: 0.15, h: 1.2 }); // back
        if (fits(table, poly, 0.4)) boxes.push(table);
      }
    }
  } else if (zone === "crown") {
    // Penthouse: sunken lounge, long dining table, king bed, plunge pool
    add({ x: b.minX + 4.5, z: -2.2, w: 4.2, d: 1.0, h: 0.85 });
    add({ x: b.minX + 4.5, z: 0.4, w: 1.0, d: 3.2, h: 0.85 });
    add({ x: b.minX + 6.2, z: -0.4, w: 1.6, d: 1.6, h: 0.45 });
    add({ x: 4.8, z: -3.6, w: 4.2, d: 1.2, h: 0.78 }); // dining
    add({ x: 4.8, z: 3.6, w: 2.2, d: 2.4, h: 0.6 }); // king bed
    add({ x: b.maxX - 1.5, z: 0, w: 2.2, d: 4.5, h: 0.25 }); // plunge pool
    add({ x: -1.5, z: 4.0, w: 1.6, d: 1.2, h: 1.0 }); // grand piano
  } else {
    // Podium lobby: reception desk, lounge clusters, retail partitions
    add({ x: 0, z: 5.5, w: 7, d: 1.2, h: 1.1 });
    for (const [sx, sz] of [[-10, -6], [10, -6], [-10, 6], [10, 6]] as Pt[]) {
      add({ x: sx, z: sz, w: 3.2, d: 0.9, h: 0.8 });
      add({ x: sx, z: sz + 1.6, w: 1.2, d: 1.2, h: 0.45 });
    }
    // retail shopfront partitions along the long edges
    for (let x = b.minX + 5; x <= b.maxX - 5; x += 6) {
      add({ x, z: b.minZ + 3.5, w: 0.2, d: 4, h: 3.5 });
    }
  }
  return boxes;
}

/** Build one merged low-poly geometry for a floor's furniture (rendered as wireframe edges) */
export function buildFurnitureGeometry(p: FloorPlate): THREE.BufferGeometry | null {
  const boxes = layoutFor(p.zone, p.footprint, p.height);
  if (!boxes.length) return null;
  const parts = boxes.map((bx) => {
    const g = new THREE.BoxGeometry(bx.w, bx.h, bx.d);
    g.translate(bx.x, SLAB_THICKNESS + (bx.y ?? 0) + bx.h / 2, bx.z);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged ? new THREE.EdgesGeometry(merged, 30) : null;
}
