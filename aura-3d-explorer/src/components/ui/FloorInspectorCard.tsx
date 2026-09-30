"use client";
/**
 * FloorInspectorCard — metadata overlay for the isolated floor.
 * -----------------------------------------------------------------------------
 * Floats over the top-left of the viewport. Shows the plate's geometry and
 * its share of the pro forma, and lets the user step up / down the tower.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Footprints, X } from "lucide-react";
import type { Building, FloorData, FloorYield } from "@/types";
import { toMetres, ZONES } from "@/lib/tower";
import { fmtMoney, fmtNum } from "@/lib/format";

interface Props {
  building: Building;
  floor: FloorData | null;
  floorYield: FloorYield | null;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  /** Enter the first-person walk-through of this floor. */
  onWalk: () => void;
}

const MATERIALS = {
  podium: "Basalt marble · metal 0.9 / rough 0.1",
  office: "Double-glazed curtain wall · 65% opacity",
  residential: "Frosted glass · brushed-aluminium trims",
  crown: "Ultra-clear glass · warm interior light",
} as const;

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right tabular-nums ${accent ? "font-serif text-base text-gold-metal" : "text-white"}`}>{value}</dd>
    </>
  );
}

export default function FloorInspectorCard({ building, floor, floorYield, onClose, onStep, onWalk }: Props) {
  const floorCount = building.floors.length;
  return (
    <AnimatePresence mode="wait">
      {floor && floorYield && (
        <motion.aside
          key={`${building.id}:${floor.index}`}
          initial={{ opacity: 0, x: -18, filter: "blur(4px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -12, filter: "blur(4px)" }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card pointer-events-auto absolute left-3 top-3 z-10 w-[min(300px,calc(100%-1.5rem))] rounded-2xl border-gold/25 p-4 shadow-gold sm:left-4 sm:top-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="eyebrow" style={{ color: ZONES[floor.zone].accent }}>
                {building.short} · {ZONES[floor.zone].label}
              </p>
              <h4 className="font-serif text-[34px] leading-none text-white">
                Floor {floor.number}
                <span className="ml-1.5 text-base text-slate-500">/ {floorCount}</span>
              </h4>
            </div>
            <button onClick={onClose} className="rounded-full p-1 text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label="Close floor inspector">
              <X size={16} />
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">{ZONES[floor.zone].description}</p>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-white/[0.06] pt-3 text-xs">
            <Row label="Model plate (W×D×H)" value={`${floor.width} × ${floor.depth} × ${floor.height}`} />
            <Row label="Real plate" value={`${toMetres(floor.width).toFixed(0)} × ${toMetres(floor.depth).toFixed(0)} m · ${toMetres(floor.height).toFixed(1)} m f2f`} />
            <Row label="Twist (R_y)" value={`${((floor.rotationY * 180) / Math.PI).toFixed(1)}°`} />
            <Row label="Gross area" value={`${fmtNum(floorYield.sqFt)} sf`} />
            <Row label="Units" value={`${floorYield.units} ${ZONES[floor.zone].unitNoun}`} />
            <Row label="Build cost" value={fmtMoney(floorYield.cost)} />
            <Row label="Floor profit" value={fmtMoney(floorYield.profit)} />
            <Row label="Floor revenue" value={fmtMoney(floorYield.revenue)} accent />
          </dl>

          <p className="mt-3 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">{MATERIALS[floor.zone]}</p>

          <button
            onClick={onWalk}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-gold-light to-gold py-2 text-xs font-semibold uppercase tracking-[0.14em] text-obsidian transition hover:brightness-110"
          >
            <Footprints size={14} /> Walk inside
          </button>

          <div className="mt-2 flex gap-2">
            <button
              disabled={floor.index === 0}
              onClick={() => onStep(-1)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 py-1.5 text-xs text-slate-400 transition hover:border-gold/40 hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronDown size={14} /> Below
            </button>
            <button
              disabled={floor.index === floorCount - 1}
              onClick={() => onStep(1)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 py-1.5 text-xs text-slate-400 transition hover:border-gold/40 hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronUp size={14} /> Above
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
