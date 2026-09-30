"use client";
/**
 * FloorAnnotations — readability aids for the active building's stack.
 * -----------------------------------------------------------------------------
 *   • Level labels ("L12 · Residential") in a column beside the exploded
 *     stack — only zone boundaries, every Nth floor, the roof and the
 *     isolated floor, so the column never clutters. Click a label to isolate.
 *   • A crisp screen-space outline (fat line, drawn over everything) around
 *     the isolated plate at slab and ceiling level, following its twist and
 *     plan outline.
 * Both ride the eased explosion height exactly like the plates do.
 */
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import type { Building, FloorData } from "@/types";
import { explodedY, ZONES } from "@/lib/tower";
import { plateOutline, rotateY } from "@/lib/plateOutline";
import { SLAB_THICKNESS } from "./FurnitureOverlay";

const OUTLINE = "#9C7A52"; // oak

interface Props {
  building: Building;
  explosion: number;
  selectedIndex: number | null;
  /** Show the level-label column (active building, exploded, not walking). */
  labels: boolean;
  /** Show the isolated-floor outline (not while walking). */
  outline: boolean;
  onSelect: (floor: FloorData) => void;
}

/** A group that eases to a floor's exploded elevation. */
function FloorRig({ floor, explosion, children }: { floor: FloorData; explosion: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.position.y = THREE.MathUtils.lerp(g.current.position.y, explodedY(floor, explosion), 1 - Math.pow(0.0008, dt));
  });
  return (
    <group ref={g} position={[0, explodedY(floor, explosion), 0]}>
      {children}
    </group>
  );
}

/** Floors worth labelling: zone starts, every Nth floor (away from boundaries), the roof and the selection. */
function labelledFloors(floors: FloorData[], selectedIndex: number | null): FloorData[] {
  const n = floors.length;
  const step = n <= 24 ? 4 : n <= 48 ? 8 : n <= 90 ? 10 : 20;
  const starts = new Set(floors.filter((f) => f.zoneIndex === 0).map((f) => f.index));
  const nearStart = (i: number) => [...starts].some((s) => Math.abs(s - i) <= Math.max(1, Math.floor(step / 3)));
  return floors.filter(
    (f) => starts.has(f.index) || f.index === n - 1 || f.index === selectedIndex || (f.number % step === 0 && !nearStart(f.index) && f.index < n - 2)
  );
}

export default function FloorAnnotations({ building, explosion, selectedIndex, labels, outline, onSelect }: Props) {
  const floors = building.floors;
  const labelX = useMemo(() => Math.max(...floors.map((f) => Math.hypot(f.width, f.depth) / 2)) + 0.8, [floors]);
  const shown = useMemo(() => (labels ? labelledFloors(floors, selectedIndex) : []), [labels, floors, selectedIndex]);
  const sel = selectedIndex !== null ? floors[selectedIndex] ?? null : null;

  const loops = useMemo(() => {
    if (!sel) return null;
    const pts = plateOutline(sel).map((p) => rotateY(p, sel.rotationY));
    const ring = (y: number) => [...pts, pts[0]].map(([x, z]) => new THREE.Vector3(x, y, z));
    const posts = pts.length <= 8 ? pts.map(([x, z]) => [new THREE.Vector3(x, SLAB_THICKNESS, z), new THREE.Vector3(x, sel.height - 0.01, z)]) : [];
    return { bottom: ring(SLAB_THICKNESS + 0.005), top: ring(sel.height - 0.01), posts };
  }, [sel]);

  return (
    <>
      {shown.map((f) => {
        const selected = f.index === selectedIndex;
        const zone = ZONES[f.zone];
        return (
          <FloorRig key={f.index} floor={f} explosion={explosion}>
            <Html position={[labelX, f.height / 2, 0]} zIndexRange={[15, 0]}>
              <button
                onClick={() => onSelect(f)}
                className={`flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] tabular-nums backdrop-blur transition-colors ${
                  selected ? "border-ink bg-ink text-paper" : "border-plaster bg-paper/85 text-ink hover:border-oak/50"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: zone.accent }} />
                L{f.number}
                <span className={selected ? "text-paper/70" : "text-ash"}>· {zone.short}</span>
              </button>
            </Html>
          </FloorRig>
        );
      })}

      {outline && sel && loops && (
        <FloorRig floor={sel} explosion={explosion}>
          <group userData={{ noClip: true }}>
            {[loops.bottom, loops.top, ...loops.posts].map((pts, i) => (
              <Line key={i} points={pts} color={OUTLINE} lineWidth={i < 2 ? 2.2 : 1.2} transparent opacity={0.95} depthTest={false} renderOrder={10} raycast={() => null} />
            ))}
          </group>
        </FloorRig>
      )}
    </>
  );
}
