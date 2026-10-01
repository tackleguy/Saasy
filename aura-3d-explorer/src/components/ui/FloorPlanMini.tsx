"use client";
/**
 * FloorPlanMini — 2D plan of the isolated floor for the inspector card.
 * -----------------------------------------------------------------------------
 * Drawn in real metres in the plate's local (un-twisted) frame, the same
 * frame as the furniture layout and walk viewpoints:
 *   • plate outline (plan shape if present, else the width × depth box)
 *   • the core (square to the world, so rotated against a twisted plate)
 *   • furniture footprints from `layoutFloor`, unit dividers on residences
 *   • interior walls with their door openings (the same plan the 3D walls use)
 *     and room labels (Living, Kitchen, Bed 1, Bath, WC, Laundry, WIR…)
 *   • inside the core: lift cars, stair, and on residential / office floors
 *     the service passage, refuse room (chutes) and riser closet
 *   • numbered walk viewpoints — click one to walk in from there
 *   • north arrow (world −Z, turned by the plate twist) and a scale bar
 */
import { useMemo } from "react";
import type { FloorData } from "@/types";
import { MODEL_SCALE, ZONES } from "@/lib/tower";
import { plateOutline, rotateY } from "@/lib/plateOutline";
import { viewpointsFor } from "@/lib/viewpoints";
import { layoutFloor } from "@/components/3d/furniture/layouts";
import { PIECES } from "@/components/3d/furniture/kit";
import { CORE_ACCENT } from "@/components/3d/CoreShaft";
import { interiorPlanFor } from "@/components/3d/interior/plan";
import { DEFAULT_FIT, type FloorFit } from "@/lib/apartmentFit";
import { SERVICE_ROOMS, isServiceRoom } from "@/components/3d/furniture/rooms";
import { coreLayout, coreServiceOpen } from "@/lib/coreLayout";
import { liftBank } from "@/lib/lift";

const LABELS: Record<string, string> = { living: "Living", kitchen: "Kitchen", bed: "Bed 1", bedDouble: "Bed 2", bathroom: "Bath", dining4: "Dining" };
const labelFor = (piece: string) => LABELS[piece] ?? (isServiceRoom(piece) && piece !== "coat" ? SERVICE_ROOMS[piece].label : null);

interface Props {
  floor: FloorData;
  coreSize: number;
  /** Floors in the building's crown (the penthouse spans them all). */
  crownFloors: number;
  /** Walk in from viewpoint `i` (lib/viewpoints). */
  onViewpoint?: (i: number) => void;
  fit?: FloorFit;
}

const M = 1 / MODEL_SCALE;

export default function FloorPlanMini({ floor, coreSize, crownFloors, onViewpoint, fit = DEFAULT_FIT }: Props) {
  const plan = useMemo(() => {
    const A = (floor.width * M) / 2;
    const B = (floor.depth * M) / 2;
    const r = floor.rotationY;
    const outline = plateOutline(floor).map(([x, z]) => [x * M, z * M] as const);
    // Core corners (world-square) expressed in the plate frame: rotate by −R_y.
    const h = (coreSize * M) / 2;
    const core = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ].map((p) => rotateY(p as [number, number], -r));
    const coreHalfM = h * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)));
    let rooms: { x: number; z: number; w: number; d: number; rot: number; piece: string }[] = [];
    try {
      rooms = layoutFloor(floor.zone, floor.width * M, floor.depth * M, h, -r, floor.zone === "crown" ? floor.zoneIndex : 0, crownFloors, floor.shape, floor.amenity, fit).map((p) => ({
        ...p,
        w: PIECES[p.piece].w,
        d: PIECES[p.piece].d,
      }));
    } catch {
      rooms = [];
    }
    const views = viewpointsFor(floor, crownFloors, coreSize, fit);
    // Interior walls (solid runs between openings), plate-local metres.
    let walls: { a: [number, number]; b: [number, number]; t: number; glass: boolean }[] = [];
    try {
      const ip = interiorPlanFor(floor, coreSize, crownFloors, fit);
      for (const w of ip.walls) {
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        if (L < 1e-3) continue;
        const at = (t: number): [number, number] => [w.a[0] + ((w.b[0] - w.a[0]) * t) / L, w.a[1] + ((w.b[1] - w.a[1]) * t) / L];
        let t0 = 0;
        for (const o of w.openings) {
          if (o.t0 > t0) walls.push({ a: at(t0), b: at(o.t0), t: w.thickness, glass: w.kind === "glass" });
          t0 = Math.max(t0, o.t1);
        }
        if (L > t0) walls.push({ a: at(t0), b: at(L), t: w.thickness, glass: w.kind === "glass" });
      }
    } catch {
      walls = [];
    }
    // Core contents (building frame, scene units) → plate metres.
    const P = (x: number, z: number) => rotateY([x * M, z * M], -r);
    const quad = (x0: number, x1: number, z0: number, z1: number) => [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)];
    const lay = coreLayout(coreSize);
    const bank = liftBank(coreSize);
    const sv = coreServiceOpen(floor.zone) ? lay.service : null;
    const coreParts = {
      cars: bank.cars.map((c) => quad(c.x - c.cabW / 2, c.x + c.cabW / 2, bank.zBack, bank.zFront)),
      stair: quad(lay.stair.x0, lay.stair.x1, lay.stair.z0, lay.stair.z1),
      passage: sv ? quad(sv.passage.x0, sv.passage.x1, sv.passage.z0, sv.passage.z1) : null,
      walk: sv?.walk ? quad(sv.walk.x0, sv.walk.x1, sv.walk.z0, sv.walk.z1) : null,
      refuse: sv ? quad(sv.refuse.x0, sv.refuse.x1, sv.refuse.z0, sv.refuse.z1) : null,
      electrical: sv ? quad(sv.electrical.x0, sv.electrical.x1, sv.electrical.z0, sv.electrical.z1) : null,
      chutes: sv ? sv.chutes.map((k) => ({ c: P(k.x, k.z), r: k.r * M, kind: k.kind })) : [],
      refuseLabel: sv ? P((sv.refuse.x0 + sv.refuse.x1) / 2, sv.refuse.z1 - (sv.refuse.z1 - sv.refuse.z0) * 0.25) : null,
    };
    const labels = rooms.flatMap((p) => {
      const t = labelFor(p.piece);
      return t ? [{ t, x: p.x, z: p.z }] : [];
    });
    // North = world −Z, seen from the plate frame.
    const north: [number, number] = [Math.sin(r), -Math.cos(r)];
    const pad = Math.max(A, B) * 0.28 + 2;
    const scale = A * 2 > 40 ? 10 : 5;
    return { A, B, outline, core, rooms, views, north, pad, scale, coreHalfM, walls, coreParts, labels };
  }, [floor, coreSize, crownFloors, fit]);

  const { A, B, outline, core, rooms, views, north, pad, scale, coreHalfM, walls, coreParts, labels } = plan;
  const s = Math.max(A, B); // text / glyph scale
  const fs = s * 0.075;
  const accent = ZONES[floor.zone].accent;
  const pts = (arr: readonly (readonly [number, number])[]) => arr.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).join(" ");
  const vb = [-A - pad, -B - pad, 2 * (A + pad), 2 * (B + pad)];
  const nx = A + pad * 0.55;
  const ny = -B - pad * 0.45;

  return (
    <figure className="mt-3 border-t border-plaster pt-3">
      <figcaption className="caption mb-1.5 flex items-center justify-between">
        <span>Plan · L{floor.number}</span>
        {onViewpoint && <span className="text-[10px]">Click a view to walk in</span>}
      </figcaption>
      <svg viewBox={vb.join(" ")} className="block h-auto max-h-[200px] w-full" role="img" aria-label={`Floor plan of level ${floor.number}`}>
        {/* Plate */}
        <polygon points={pts(outline)} className="fill-paper stroke-ink" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />

        {/* Residential unit dividers (four corner apartments) */}
        {floor.zone === "residential" && (
          <g className="stroke-ash" strokeWidth={0.8} strokeDasharray="3 2" vectorEffect="non-scaling-stroke">
            <line x1={coreHalfM} y1={0} x2={A} y2={0} vectorEffect="non-scaling-stroke" />
            <line x1={-coreHalfM} y1={0} x2={-A} y2={0} vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={coreHalfM} x2={0} y2={B} vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={-coreHalfM} x2={0} y2={-B} vectorEffect="non-scaling-stroke" />
          </g>
        )}

        {/* Furniture / room footprints */}
        <g>
          {rooms.map((p, i) => (
            <rect
              key={i}
              x={-p.w / 2}
              y={-p.d / 2}
              width={p.w}
              height={p.d}
              transform={`translate(${p.x.toFixed(2)} ${p.z.toFixed(2)}) rotate(${((-p.rot * 180) / Math.PI).toFixed(1)})`}
              fill={accent}
              fillOpacity={0.22}
              className="stroke-ink/30"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            >
              <title>{p.piece}</title>
            </rect>
          ))}
        </g>

        {floor.zone === "residential" &&
          [
            [1, 1, "A"],
            [-1, 1, "B"],
            [-1, -1, "C"],
            [1, -1, "D"],
          ].map(([sx, sz, l]) => (
            <text key={l as string} x={(sx as number) * A * 0.55} y={(sz as number) * B * 0.2} fontSize={fs * 1.2} textAnchor="middle" dominantBaseline="middle" className="fill-ash font-serif">
              {l}
            </text>
          ))}

        {/* Interior walls (openings left out) */}
        <g strokeLinecap="square">
          {walls.map((w, i) => (
            <line
              key={i}
              x1={w.a[0]}
              y1={w.a[1]}
              x2={w.b[0]}
              y2={w.b[1]}
              className={w.glass ? "stroke-ash" : "stroke-ink"}
              strokeWidth={w.glass ? 0.6 : w.t > 0.2 ? 1.6 : 1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* Room labels */}
        <g className="pointer-events-none fill-ink/70 font-mono" fontSize={fs * 0.55} textAnchor="middle" dominantBaseline="central">
          {labels.map((l, i) => (
            <text key={i} x={l.x} y={l.z}>
              {l.t}
            </text>
          ))}
        </g>

        {/* Core: lifts, stair, and the service passage → refuse room (chutes) + riser closet */}
        <polygon points={pts(core)} fill={CORE_ACCENT} fillOpacity={0.85} stroke={CORE_ACCENT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <g fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={0.6} vectorEffect="non-scaling-stroke">
          {coreParts.cars.map((q, i) => (
            <polygon key={i} points={pts(q)} vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={pts(coreParts.stair)} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
        </g>
        {coreParts.passage && <polygon points={pts(coreParts.passage)} className="fill-paper" vectorEffect="non-scaling-stroke" />}
        {coreParts.walk && <polygon points={pts(coreParts.walk)} className="fill-paper" vectorEffect="non-scaling-stroke" />}
        {coreParts.refuse && <polygon points={pts(coreParts.refuse)} className="fill-paper" fillOpacity={0.85} vectorEffect="non-scaling-stroke" />}
        {coreParts.electrical && <polygon points={pts(coreParts.electrical)} className="fill-paper" fillOpacity={0.6} vectorEffect="non-scaling-stroke" />}
        {coreParts.chutes.map((k) => (
          <circle key={k.kind} cx={k.c[0]} cy={k.c[1]} r={k.r} fill={k.kind === "refuse" ? "#5b6168" : "#3f6b4a"}>
            <title>{k.kind === "refuse" ? "Refuse chute" : "Recycling chute"}</title>
          </circle>
        ))}
        {coreParts.refuseLabel && (
          <text x={coreParts.refuseLabel[0]} y={coreParts.refuseLabel[1]} fontSize={fs * 0.45} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-ink font-mono">
            Refuse
          </text>
        )}

        {/* Walk viewpoints */}
        {views.map((v, i) => {
          const dx = v.look[0] - v.from[0];
          const dz = v.look[1] - v.from[1];
          const len = Math.hypot(dx, dz) || 1;
          const ray = s * 0.14;
          return (
            <g
              key={v.id}
              role={onViewpoint ? "button" : undefined}
              tabIndex={onViewpoint ? 0 : undefined}
              aria-label={`Walk in: ${v.label}`}
              onClick={() => onViewpoint?.(i)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onViewpoint?.(i)}
              className={onViewpoint ? "cursor-pointer focus:outline-none [&:hover_circle]:fill-oak [&:focus-visible_circle]:fill-oak" : undefined}
            >
              <title>{v.label}</title>
              <line x1={v.from[0]} y1={v.from[1]} x2={v.from[0] + (dx / len) * ray} y2={v.from[1] + (dz / len) * ray} className="stroke-ink" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              <circle cx={v.from[0]} cy={v.from[1]} r={fs * 0.9} className="fill-ink transition-colors" />
              <text x={v.from[0]} y={v.from[1]} fontSize={fs} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-paper font-mono">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* North arrow */}
        <g transform={`translate(${nx} ${ny})`}>
          <circle r={fs * 1.6} className="fill-none stroke-plaster" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={-north[0] * fs * 1.3} y1={-north[1] * fs * 1.3} x2={north[0] * fs * 1.3} y2={north[1] * fs * 1.3} className="stroke-ink" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          <circle cx={north[0] * fs * 1.3} cy={north[1] * fs * 1.3} r={fs * 0.3} className="fill-ink" />
          <text x={north[0] * fs * 2.4} y={north[1] * fs * 2.4} fontSize={fs} textAnchor="middle" dominantBaseline="central" className="fill-ink font-mono">
            N
          </text>
        </g>

        {/* Scale bar */}
        <g transform={`translate(${-A} ${B + pad * 0.55})`}>
          <rect x={0} y={-fs * 0.25} width={scale / 2} height={fs * 0.5} className="fill-ink" />
          <rect x={scale / 2} y={-fs * 0.25} width={scale / 2} height={fs * 0.5} className="fill-paper stroke-ink" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <text x={scale + fs * 0.6} y={0} fontSize={fs} dominantBaseline="central" className="fill-ash font-mono">
            {scale} m
          </text>
        </g>
      </svg>
      {onViewpoint && (
        <ol className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-ash">
          {views.map((v, i) => (
            <li key={v.id}>
              <button onClick={() => onViewpoint(i)} className="truncate text-left transition-colors hover:text-ink">
                <span className="font-mono text-ink">{i + 1}</span> {v.label}
              </button>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
