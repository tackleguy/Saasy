"use client";
/**
 * Massing editor: the buildings on a customer's site, edited as the same
 * `ProjectMassing` the sample projects use (src/lib/tower). Every change
 * re-renders the live 3D preview; "Save" in the editor writes it to the
 * project record. Values are in metres and storeys; the scene works in
 * MODEL_SCALE units internally.
 */
import { Plus, Trash2 } from "lucide-react";
import type { ProjectMassing } from "@/lib/tower";
import { MODEL_SCALE } from "@/lib/tower";
import type { PlanShapeKind, ZoneId } from "@/types";

const ZONES: { id: ZoneId; label: string }[] = [
  { id: "podium", label: "Podium" },
  { id: "office", label: "Office" },
  { id: "residential", label: "Residential" },
  { id: "crown", label: "Crown" },
];
const SHAPES: PlanShapeKind[] = ["rect", "rounded", "ellipse", "hexagon", "octagon", "triangle", "l-shape", "cross", "chamfer"];
const SHAPE_LABEL: Record<PlanShapeKind, string> = { rect: "Rectangle", rounded: "Rounded", ellipse: "Ellipse", hexagon: "Hexagon", octagon: "Octagon", triangle: "Triangle", "l-shape": "L-shape", cross: "Cross", chamfer: "Chamfered" };
export const MAX_BUILDINGS = 6;

const metres = (units: number) => Math.round((units / MODEL_SCALE) * 10) / 10;
const units = (m: number) => m * MODEL_SCALE;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const shapeOf = (m: ProjectMassing): PlanShapeKind => (typeof m.shape === "string" ? m.shape : m.shape?.kind) ?? "rect";

function NumberField({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <label className="block">
      <span className="caption">{label}{suffix ? ` (${suffix})` : ""}</span>
      <input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value), min, max))} className="field mt-1 tabular-nums" />
    </label>
  );
}

export function newBuilding(index: number, name: string): ProjectMassing {
  return {
    id: `building-${Date.now().toString(36)}-${index}`,
    name, short: name.slice(0, 16), tagline: "",
    position: [index * 18, 0],
    floors: { podium: 1, office: 2, residential: 10, crown: 1 },
    footprint: { podium: [12, 10], office: [10, 9], residential: [9, 8], crown: [7, 6] },
    coreSize: 2.2,
    facade: { finSpacing: 1, balconies: true, arches: false },
  };
}

export default function MassingPanel({ massing, onChange }: { massing: ProjectMassing[]; onChange: (next: ProjectMassing[], added?: ProjectMassing, removed?: string) => void }) {
  const update = (i: number, patch: Partial<ProjectMassing>) => onChange(massing.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  return (
    <div className="space-y-6">
      {massing.map((m, i) => {
        const storeys = ZONES.reduce((s, z) => s + m.floors[z.id], 0);
        return (
          <fieldset key={m.id} className="space-y-3 border border-plaster p-4">
            <legend className="px-1 font-serif text-xl text-ink">{m.name || `Building ${i + 1}`}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="caption">Name</span>
                <input value={m.name} maxLength={60} onChange={(e) => update(i, { name: e.target.value, short: e.target.value.slice(0, 16) })} className="field mt-1" />
              </label>
              <label className="block">
                <span className="caption">Plan shape</span>
                <select value={shapeOf(m)} onChange={(e) => update(i, { shape: e.target.value as PlanShapeKind })} className="field mt-1">
                  {SHAPES.map((s) => <option key={s} value={s}>{SHAPE_LABEL[s]}</option>)}
                </select>
              </label>
            </div>
            <p className="caption tabular-nums">{storeys} storeys · about {Math.round(storeys * 3.4)} m tall</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ZONES.map((z) => (
                <NumberField key={z.id} label={`${z.label} floors`} value={m.floors[z.id]} min={1} max={z.id === "residential" ? 120 : 60}
                  onChange={(v) => update(i, { floors: { ...m.floors, [z.id]: Math.round(v) } })} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ZONES.map((z) => (
                <div key={z.id} className="space-y-2">
                  <NumberField label={`${z.label} width`} suffix="m" value={metres(m.footprint[z.id][0])} min={6} max={120} step={0.5}
                    onChange={(v) => update(i, { footprint: { ...m.footprint, [z.id]: [units(v), m.footprint[z.id][1]] } })} />
                  <NumberField label={`${z.label} depth`} suffix="m" value={metres(m.footprint[z.id][1])} min={6} max={120} step={0.5}
                    onChange={(v) => update(i, { footprint: { ...m.footprint, [z.id]: [m.footprint[z.id][0], units(v)] } })} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField label="Twist per floor" suffix="°" value={m.twistDeg ?? 0} min={-6} max={6} step={0.1} onChange={(v) => update(i, { twistDeg: v || undefined })} />
              <NumberField label="Taper at top" suffix="%" value={Math.round((1 - (m.taper ?? 1)) * 100)} min={0} max={60} onChange={(v) => update(i, { taper: v ? 1 - v / 100 : undefined })} />
              <NumberField label="Position east" suffix="m" value={metres(m.position[0])} min={-400} max={400} step={1} onChange={(v) => update(i, { position: [units(v), m.position[1]] })} />
              <NumberField label="Position south" suffix="m" value={metres(m.position[1])} min={-400} max={400} step={1} onChange={(v) => update(i, { position: [m.position[0], units(v)] })} />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={!!m.facade?.balconies} onChange={(e) => update(i, { facade: { ...m.facade, balconies: e.target.checked } })} /> Balconies</label>
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={!!m.facade?.arches} onChange={(e) => update(i, { facade: { ...m.facade, arches: e.target.checked } })} /> Arcaded podium</label>
              {massing.length > 1 && (
                <button type="button" className="btn-ghost ml-auto text-xs text-negative" onClick={() => onChange(massing.filter((_, k) => k !== i), undefined, m.id)}>
                  <Trash2 size={14} aria-hidden /> Remove building
                </button>
              )}
            </div>
          </fieldset>
        );
      })}
      {massing.length < MAX_BUILDINGS && (
        <button type="button" className="btn-secondary text-xs" onClick={() => { const b = newBuilding(massing.length, `Building ${massing.length + 1}`); onChange([...massing, b], b); }}>
          <Plus size={14} aria-hidden /> Add a building
        </button>
      )}
    </div>
  );
}
