/**
 * Aura Engine — structural input → engine-ready AuraScene JSON.
 * -----------------------------------------------------------------------------
 *   runEngine(fileName, text)  DXF / CAD JSON / AuraScene JSON, fully local
 *   sceneFromModel(raw, …)     an LLM's answer for a blueprint image / PDF,
 *                              validated, repaired and re-staged where needed
 *
 * Both paths end in the same place: rooms with clean CCW polygons in metres,
 * a flooring per room and furniture that passes the clearance checks.
 */
import { texturePath } from "./catalog";
import { area, cleanPolygon, round, type Poly } from "./geometry";
import { detectKind, parsePlan, type RawPlan } from "./parse";
import { classifyRoom, flooringFor, furnitureProblems, stageRoom, TYPE_LABEL, type RoomType } from "./stage";
import type { AuraFurniture, AuraRoom, AuraScene, EngineReport, EngineResult, FlooringType } from "./types";

export type { AuraScene, AuraRoom, AuraFurniture, EngineReport, EngineResult } from "./types";

const SQFT_PER_M2 = 10.7639;
export const DEFAULT_CEILING_M = 2.7;
const DEFAULT_WALL = { color: "#EFE9DF", roughness: 0.9 };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "room";

/** "MASTER BEDROOM" → "Master Bedroom". */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** Give unnamed / duplicate rooms readable names ("Bedroom 2"). */
function nameRooms(raw: { name?: string; type: RoomType }[]): string[] {
  const counts = new Map<string, number>();
  const names = raw.map((r) => (r.name ? titleCase(r.name) : TYPE_LABEL[r.type]));
  const totals = new Map<string, number>();
  for (const n of names) totals.set(n, (totals.get(n) ?? 0) + 1);
  return names.map((n) => {
    if ((totals.get(n) ?? 0) < 2) return n;
    const k = (counts.get(n) ?? 0) + 1;
    counts.set(n, k);
    return `${n} ${k}`;
  });
}

/** Rooms + furniture + project info from a parsed plan. */
export function buildScene(plan: RawPlan): AuraScene {
  const classes = plan.rooms.map((r) => classifyRoom(r.name ?? "", r.polygon));
  const names = nameRooms(plan.rooms.map((r, i) => ({ name: r.name, type: classes[i].type })));
  const chs = plan.rooms.map((r) => r.ceilingHeight).filter((v): v is number => !!v);
  const defaultCeiling = round(plan.defaultCeiling ?? mode(chs) ?? DEFAULT_CEILING_M, 2);
  const used = new Set<string>();

  const rooms: AuraRoom[] = plan.rooms.map((r, i) => {
    let id = slug(names[i]);
    while (used.has(id)) id += "_b";
    used.add(id);
    const flooring = flooringFor(classes[i]);
    return {
      id,
      name: names[i],
      ceilingHeight: round(r.ceilingHeight ?? defaultCeiling, 2),
      polygon: r.polygon.map(([x, z]) => [round(x), round(z)] as [number, number]),
      flooring: { type: flooring, texturePath: texturePath(flooring) },
      furniture: stageRoom(r.polygon, classes[i]),
    };
  });

  const kitchens = classes.filter((c) => c.type === "kitchen" || c.also === "kitchen").length;
  const totalM2 = plan.rooms.reduce((s, r) => s + area(r.polygon), 0);
  return {
    projectInfo: {
      totalSquareFeet: Math.round(totalM2 * SQFT_PER_M2),
      defaultCeilingHeight: defaultCeiling,
      unitsCount: plan.unitsCount ?? Math.max(1, kitchens),
    },
    materials: { defaultWall: { ...DEFAULT_WALL } },
    rooms,
  };
}

function mode(vs: number[]): number | undefined {
  if (!vs.length) return undefined;
  const c = new Map<number, number>();
  for (const v of vs) c.set(round(v, 2), (c.get(round(v, 2)) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Text input (DXF / CAD JSON / AuraScene JSON) → scene, entirely local. */
export function runEngine(fileName: string, text: string): EngineResult {
  const kind = detectKind(fileName, text);
  if (kind === "dwg") throw new Error("DWG is a closed binary format. Export the plan as DXF (File → Save As → DXF) and drop that in instead.");
  if (kind === "unknown") throw new Error("Unrecognised input. Drop a .dxf, CAD JSON (rooms / walls / labels), an AuraScene JSON, or a blueprint image / PDF.");

  if (kind === "scene-json") {
    const { scene, notes } = repairScene(JSON.parse(text));
    return {
      scene,
      report: { source: fileName, method: "scene-json", facts: [{ label: "Rooms", value: String(scene.rooms.length) }], warnings: notes, openings: [] },
    };
  }

  const plan = parsePlan(kind, text);
  const scene = buildScene(plan);
  const report: EngineReport = {
    source: fileName,
    method: kind,
    units: plan.units,
    facts: [...plan.facts, ...summaryFacts(scene)],
    warnings: plan.warnings,
    openings: plan.openings,
  };
  return { scene, report };
}

export function summaryFacts(scene: AuraScene) {
  const pieces = scene.rooms.reduce((s, r) => s + r.furniture.length, 0);
  return [
    { label: "Rooms", value: scene.rooms.map((r) => r.name).join(", ") || "—" },
    { label: "Area", value: `${scene.projectInfo.totalSquareFeet.toLocaleString("en-US")} sq ft (${Math.round(scene.projectInfo.totalSquareFeet / SQFT_PER_M2)} m²)` },
    { label: "Staged", value: `${pieces} pieces of furniture` },
  ];
}

/* ------------------------------------------------- model / scene validation */

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
const FLOORS: FlooringType[] = ["hardwood", "tile", "carpet", "marble"];

/**
 * Coerce any scene-shaped JSON (an LLM answer, a hand-edited file) into a
 * valid AuraScene: polygons cleaned and made CCW, heights bounded, unknown
 * flooring re-derived, and any room whose furniture breaks the clearance
 * rules (outside the room / overlapping) re-staged procedurally.
 */
export function repairScene(raw: unknown): { scene: AuraScene; notes: string[] } {
  const notes: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const info = (o.projectInfo ?? {}) as Record<string, unknown>;
  let defaultCeiling = num(info.defaultCeilingHeight, DEFAULT_CEILING_M);
  // Feet slipped through? (9 → 2.74 m)
  if (defaultCeiling > 6 && defaultCeiling < 20) defaultCeiling *= 0.3048;
  if (defaultCeiling < 2 || defaultCeiling > 8) defaultCeiling = DEFAULT_CEILING_M;

  const rawRooms = Array.isArray(o.rooms) ? (o.rooms as Record<string, unknown>[]) : [];
  const rooms: AuraRoom[] = [];
  const used = new Set<string>();
  rawRooms.forEach((r, i) => {
    const pts = (Array.isArray(r.polygon) ? r.polygon : [])
      .map((p: unknown) => (Array.isArray(p) && p.length >= 2 ? [num(p[0], NaN), num(p[1], NaN)] : null))
      .filter((p): p is [number, number] => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const poly: Poly = cleanPolygon(pts);
    const name = typeof r.name === "string" && r.name.trim() ? titleCase(r.name.trim()) : `Room ${i + 1}`;
    if (poly.length < 3 || area(poly) < 0.5) {
      notes.push(`Dropped "${name}": its polygon has no area.`);
      return;
    }
    const cls = classifyRoom(name, poly);
    let ch = num(r.ceilingHeight, defaultCeiling);
    if (ch > 6 && ch < 20) ch *= 0.3048;
    if (ch < 2 || ch > 8) ch = defaultCeiling;
    const fl = (r.flooring ?? {}) as Record<string, unknown>;
    const type = FLOORS.includes(fl.type as FlooringType) ? (fl.type as FlooringType) : flooringFor(cls);
    let id = typeof r.id === "string" && r.id ? slug(r.id) : slug(name);
    while (used.has(id)) id += "_b";
    used.add(id);

    const furniture: AuraFurniture[] = (Array.isArray(r.furniture) ? (r.furniture as Record<string, unknown>[]) : [])
      .filter((f) => typeof f.modelId === "string")
      .map((f) => {
        const p = Array.isArray(f.position) ? f.position : [];
        const rot = Array.isArray(f.rotation) ? f.rotation : [];
        const sc = Array.isArray(f.scale) ? f.scale : [];
        return {
          modelId: f.modelId as string,
          modelPath: typeof f.modelPath === "string" ? f.modelPath : "",
          position: [num(p[0], 0), num(p[1], 0), num(p[2], 0)],
          rotation: [num(rot[0], 0), num(rot[1], 0), num(rot[2], 0)],
          scale: [num(sc[0], 1), num(sc[1], 1), num(sc[2], 1)],
        };
      });
    const problems = furnitureProblems(poly, furniture);
    let staged = furniture;
    if (!furniture.length || problems.length) {
      staged = stageRoom(poly, cls);
      if (furniture.length) notes.push(`Re-staged "${name}": ${problems.slice(0, 2).join("; ")}${problems.length > 2 ? "…" : ""}.`);
    }
    rooms.push({
      id,
      name,
      ceilingHeight: round(ch, 2),
      polygon: poly.map(([x, z]) => [round(x), round(z)] as [number, number]),
      flooring: { type, texturePath: typeof fl.texturePath === "string" && fl.texturePath ? fl.texturePath : texturePath(type) },
      furniture: staged,
    });
  });

  const totalM2 = rooms.reduce((s, r) => s + area(r.polygon), 0);
  const mats = ((o.materials ?? {}) as Record<string, unknown>).defaultWall as Record<string, unknown> | undefined;
  const color = typeof mats?.color === "string" && /^#[0-9a-f]{6}$/i.test(mats.color) ? mats.color : DEFAULT_WALL.color;
  return {
    scene: {
      projectInfo: {
        totalSquareFeet: Math.round(totalM2 * SQFT_PER_M2),
        defaultCeilingHeight: round(defaultCeiling, 2),
        unitsCount: Math.max(1, Math.round(num(info.unitsCount, 1))),
      },
      materials: { defaultWall: { color, roughness: Math.min(1, Math.max(0, num(mats?.roughness, DEFAULT_WALL.roughness))) } },
      rooms,
    },
    notes,
  };
}

/** Pull the first JSON object out of a model's reply (tolerates ``` fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  return JSON.parse(body.slice(start, end + 1));
}
