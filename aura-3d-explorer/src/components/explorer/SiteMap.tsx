"use client";
/**
 * SiteMap — a plan view of the project in its city, where the project's
 * buildings can be dragged to new positions.
 * -----------------------------------------------------------------------------
 * Drawn in the same screen frame as the hero camera (u across, w towards the
 * viewer), so the map reads like the 3D view seen from above: water at the
 * bottom, the street and promenade above it, the city behind.
 *
 *   • Drag a tower (or focus it and use the arrow keys, Shift for bigger
 *     steps) to move it. The 3D scene follows live; neighbouring blocks,
 *     trees and people under its new footprint are cleared, and it gets a
 *     paved pad if it leaves the original plot.
 *   • Moves are kept on land, inside the modelled city, clear of the other
 *     project buildings and of landmark lots. A blocked move slides along
 *     the obstacle instead of stopping dead.
 *   • "Site" and "District" switch the zoom; "Reset layout" puts every
 *     building back.
 *
 * Loaded on demand (next/dynamic) because it reads the 3D city plan.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import clsx from "clsx";
import { Map as MapIcon, RotateCcw, X } from "lucide-react";
import type { Building, BuildingId } from "@/types";
import { getCityPreset, type CityId } from "@/lib/cityPresets";
import { BUILDABLE, buildingRadius, buildingUW, LAYOUT, PLINTH, rectsOverlap, uwToXZ, type UWRect } from "@/lib/siteLayout";
import { toMetres } from "@/lib/tower";
import { cityPlan, landmarkRects } from "@/components/3d/context/cityPlan";

interface Props {
  site: Building[];
  baseSite: Building[];
  activeBuildingId: BuildingId;
  city: CityId;
  clearings: UWRect[];
  pads: UWRect[];
  layoutEdited: boolean;
  onSelectBuilding: (id: BuildingId) => void;
  onMove: (id: BuildingId, position: [number, number]) => void;
  onDragChange: (dragging: boolean) => void;
  onReset: () => void;
  onClose: () => void;
  className?: string;
}

type Zoom = "site" | "district";
const VIEWS: Record<Zoom, { u0: number; w0: number; u1: number; w1: number }> = {
  site: { u0: -115, u1: 115, w0: -135, w1: 60 },
  district: { u0: -200, u1: 205, w0: -295, w1: 70 },
};
/** 100 m in scene units (1 unit ≈ 3.57 m). */
const HUNDRED_M = 100 / 3.57;

/** Plan outline of a building's largest plate, as (u, w) points. */
function outline(b: Building): string {
  const zone = Object.values(b.zones).reduce((a, z) => (z.width * z.depth > a.width * a.depth ? z : a));
  const [x, z] = b.position;
  const hw = zone.width / 2;
  const hd = zone.depth / 2;
  return [
    [x - hw, z - hd],
    [x + hw, z - hd],
    [x + hw, z + hd],
    [x - hw, z + hd],
  ]
    .map(([px, pz]) => {
      const u = (px - pz) * Math.SQRT1_2;
      const w = (px + pz) * Math.SQRT1_2;
      return `${u.toFixed(2)},${w.toFixed(2)}`;
    })
    .join(" ");
}

export default function SiteMap({ site, baseSite, activeBuildingId, city, clearings, pads, layoutEdited, onSelectBuilding, onMove, onDragChange, onReset, onClose, className }: Props) {
  const preset = getCityPreset(city);
  const plan = cityPlan(preset);
  const landmarks = useMemo(() => landmarkRects(preset), [preset]);
  const [zoom, setZoom] = useState<Zoom>("site");
  const [drag, setDrag] = useState<{ id: BuildingId; du: number; dw: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const v = VIEWS[zoom];

  // Neighbouring blocks drawn at ground level (first tier of each lot), hidden where a moved tower stands.
  const blocks = useMemo(
    () =>
      plan.buildings
        .filter((b) => b.y === 0)
        .map((b) => ({ ...b, rect: { u0: b.u - b.su / 2, u1: b.u + b.su / 2, w0: b.w - b.sw / 2, w1: b.w + b.sw / 2 } }))
        .filter((b) => !clearings.some((c) => rectsOverlap(b.rect, c))),
    [plan, clearings]
  );
  const tallest = useMemo(() => Math.max(40, ...plan.buildings.map((b) => b.y + b.h)), [plan]);

  /** Keep a proposed centre on land, inside the city, clear of other buildings and landmark lots. */
  const constrain = (b: Building, u: number, w: number): [number, number] | null => {
    const r = buildingRadius(b);
    u = Math.min(BUILDABLE.u1 - r, Math.max(BUILDABLE.u0 + r, u));
    w = Math.min(BUILDABLE.w1 - r, Math.max(BUILDABLE.w0 + r, w));
    const blocked = (cu: number, cw: number) =>
      site.some((o) => {
        if (o.id === b.id) return false;
        const [ou, ow] = buildingUW(o);
        return Math.hypot(cu - ou, cw - ow) < r + buildingRadius(o) + 0.5;
      }) || landmarks.some((l) => rectsOverlap({ u0: cu - r, u1: cu + r, w0: cw - r, w1: cw + r }, l));
    if (!blocked(u, w)) return [u, w];
    // Slide along the obstacle: keep whichever axis still works.
    const [cu, cw] = buildingUW(b);
    if (!blocked(u, cw)) return [u, cw];
    if (!blocked(cu, w)) return [cu, w];
    return null;
  };

  const moveTo = (b: Building, u: number, w: number) => {
    const next = constrain(b, u, w);
    if (next) onMove(b.id, uwToXZ(next[0], next[1]));
  };

  /** Pointer position in map (u, w) units. */
  const toMap = (e: PointerEvent): [number, number] => {
    const el = svg.current!;
    const p = el.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const m = el.getScreenCTM()!.inverse();
    const q = p.matrixTransform(m);
    return [q.x, q.y];
  };

  const onPointerDown = (e: PointerEvent<SVGGElement>, b: Building) => {
    e.preventDefault();
    const [pu, pw] = toMap(e);
    const [bu, bw] = buildingUW(b);
    svg.current?.setPointerCapture(e.pointerId);
    onDragChange(true);
    if (b.id !== activeBuildingId) onSelectBuilding(b.id);
    setDrag({ id: b.id, du: pu - bu, dw: pw - bw });
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const b = site.find((s) => s.id === drag.id);
    if (!b) return;
    const [pu, pw] = toMap(e);
    moveTo(b, pu - drag.du, pw - drag.dw);
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    svg.current?.releasePointerCapture(e.pointerId);
    setDrag(null);
    onDragChange(false);
  };

  const onKey = (e: KeyboardEvent<SVGGElement>, b: Building) => {
    const step = e.shiftKey ? 5 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (d[e.key]) {
      e.preventDefault();
      if (b.id !== activeBuildingId) onSelectBuilding(b.id);
      const [u, w] = buildingUW(b);
      moveTo(b, u + d[e.key][0], w + d[e.key][1]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectBuilding(b.id);
    }
  };

  const active = site.find((b) => b.id === activeBuildingId) ?? site[0];
  const base = baseSite.find((b) => b.id === active.id) ?? active;
  const [au, aw] = buildingUW(active);
  const [ou, ow] = buildingUW(base);
  const movedM = Math.round(toMetres(Math.hypot(au - ou, aw - ow)));
  const label = zoom === "site" ? 4.2 : 7;

  return (
    <div className={clsx("overlay flex flex-col gap-2 rounded-[3px] p-2.5", className)} role="region" aria-label="Site map">
      <div className="flex items-center gap-2">
        <MapIcon size={13} className="text-oak" aria-hidden />
        <p className="caption flex-1 text-ink">Site map · {preset.label}</p>
        <div className="flex rounded-full border border-plaster p-0.5 text-[10px]" role="group" aria-label="Map zoom">
          {(["site", "district"] as Zoom[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={clsx("rounded-full px-2 py-0.5 capitalize transition-colors", zoom === z ? "bg-ink text-paper" : "text-ash hover:text-ink")}
            >
              {z}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="rounded-full p-1 text-ash transition-colors hover:text-ink" aria-label="Close site map">
          <X size={14} aria-hidden />
        </button>
      </div>

      <svg
        ref={svg}
        viewBox={`${v.u0} ${v.w0} ${v.u1 - v.u0} ${v.w1 - v.w0}`}
        className={clsx("aspect-[23/19] w-full touch-none select-none rounded-[2px] bg-stone", drag && "cursor-grabbing")}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <title>Plan of the site: drag a building to move it</title>
        {/* Water, promenade, road */}
        <rect x={-600} y={LAYOUT.waterStart} width={1200} height={500} fill="#7fa3ae" opacity={0.55} />
        <rect x={-LAYOUT.streetHalfLength} y={LAYOUT.promenade[0]} width={LAYOUT.streetHalfLength * 2} height={LAYOUT.promenade[1] - LAYOUT.promenade[0]} className="fill-brass" opacity={0.35} />
        <rect x={-LAYOUT.streetHalfLength} y={LAYOUT.road[0]} width={LAYOUT.streetHalfLength * 2} height={LAYOUT.road[1] - LAYOUT.road[0]} className="fill-ash" opacity={0.45} />
        {/* Secondary streets */}
        {plan.streets.map((s, i) => (
          <rect key={i} x={s.u0} y={s.w0} width={s.u1 - s.u0} height={s.w1 - s.w0} className="fill-plaster" />
        ))}
        {/* The original plot, and pads under moved buildings */}
        <rect x={PLINTH.u0} y={PLINTH.w0} width={PLINTH.u1 - PLINTH.u0} height={PLINTH.w1 - PLINTH.w0} className="fill-paper stroke-oak" strokeWidth={0.5} strokeDasharray="2 1.5" opacity={0.9} />
        {pads.map((p, i) => (
          <rect key={i} x={p.u0} y={p.w0} width={p.u1 - p.u0} height={p.w1 - p.w0} className="fill-paper" opacity={0.9} />
        ))}
        {/* Neighbouring blocks, darker with height */}
        {blocks.map((b, i) =>
          b.shape === "round" ? (
            <circle key={i} cx={b.u} cy={b.w} r={b.su / 2} className="fill-ink" opacity={0.1 + 0.45 * Math.min(1, b.h / tallest)} />
          ) : (
            <rect key={i} x={b.rect.u0} y={b.rect.w0} width={b.su} height={b.sw} className="fill-ink" opacity={0.1 + 0.45 * Math.min(1, b.h / tallest)} />
          )
        )}
        {/* Landmark lots */}
        {preset.landmarks
          .filter((l) => l.kind !== "bridge")
          .map((l, i) => (
            <g key={i}>
              <circle cx={l.u} cy={l.w} r={Math.max(4, l.h * 0.06)} className="fill-ink" opacity={0.75} />
              <title>Landmark ({l.kind})</title>
            </g>
          ))}
        {preset.landmarks
          .filter((l) => l.kind === "bridge")
          .map((l, i) => (
            <rect key={`b${i}`} x={l.u - 3.8} y={-40} width={7.6} height={480} className="fill-ink" opacity={0.35} />
          ))}

        {/* Project buildings: draggable */}
        {site.map((b) => {
          const [u, w] = buildingUW(b);
          const isActive = b.id === activeBuildingId;
          const isDragging = drag?.id === b.id;
          return (
            <g
              key={b.id}
              role="button"
              tabIndex={0}
              aria-label={`${b.name}: drag or use the arrow keys to move it`}
              aria-pressed={isActive}
              onPointerDown={(e) => onPointerDown(e, b)}
              onKeyDown={(e) => onKey(e, b)}
              className={clsx("outline-none", drag ? "cursor-grabbing" : "cursor-grab", "[&:focus-visible>polygon]:stroke-ink")}
            >
              {isDragging && <circle cx={u} cy={w} r={buildingRadius(b) + 2} fill="none" className="stroke-oak" strokeWidth={0.5} strokeDasharray="1.5 1.2" />}
              <polygon points={outline(b)} className={clsx("stroke-paper transition-colors", isActive ? "fill-oak" : "fill-oak/55")} strokeWidth={0.6} />
              <text x={u} y={w + label * 0.35} textAnchor="middle" fontSize={label} className="pointer-events-none fill-paper font-medium">
                {b.short}
              </text>
            </g>
          );
        })}

        {/* Scale bar */}
        <g transform={`translate(${v.u0 + 6} ${v.w1 - 6})`} className="pointer-events-none">
          <rect x={0} y={-1.2} width={HUNDRED_M} height={1.2} className="fill-ink" />
          <text x={HUNDRED_M / 2} y={-2.6} textAnchor="middle" fontSize={label * 0.8} className="fill-ink">
            100 m
          </text>
        </g>
      </svg>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[10px] leading-snug text-ash">
          {movedM > 0 ? (
            <>
              <span className="font-medium text-ink">{active.short}</span> moved {movedM} m from its plot. Neighbours under it are cleared.
            </>
          ) : (
            <>Drag a building, or focus it and use the arrow keys. Neighbours clear automatically.</>
          )}
        </p>
        <button onClick={onReset} disabled={!layoutEdited} className="btn-secondary shrink-0 px-2 py-1 text-[10px]">
          <RotateCcw size={11} aria-hidden /> Reset layout
        </button>
      </div>
    </div>
  );
}
