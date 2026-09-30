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

/** Envelope description per zone, reflecting the building's facade options. */
function materialLine(zone: FloorData["zone"], facade: Building["facade"]) {
  switch (zone) {
    case "podium":
      return facade.arches ? "Stone arcade · recessed lobby glazing" : "Curtain wall · bronze mullions";
    case "office":
      return facade.finSpacing > 0 ? "Curtain wall · bronze vertical fins" : "Curtain wall · slim mullions";
    case "residential":
      return facade.balconies ? "Curtain wall · curved balcony bands" : "Curtain wall · slim mullions";
    default:
      return "Ultra-clear glass · warm interior light";
  }
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <>
      <dt className="text-ash">{label}</dt>
      <dd className={`text-right tabular-nums ${accent ? "font-serif text-base text-ink" : "text-ink"}`}>{value}</dd>
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
          className="overlay pointer-events-auto absolute left-3 top-3 z-10 w-[min(300px,calc(100%-1.5rem))] rounded-[3px] border-oak/25 p-4 sm:left-4 sm:top-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="caption" style={{ color: ZONES[floor.zone].accent }}>
                {building.short} · {ZONES[floor.zone].label}
              </p>
              <h4 className="font-serif text-[34px] leading-none text-ink">
                Floor {floor.number}
                <span className="ml-1.5 text-base text-ash">/ {floorCount}</span>
              </h4>
            </div>
            <button onClick={onClose} className="rounded-full p-1 text-ash transition hover:bg-stone hover:text-ink" aria-label="Close floor inspector">
              <X size={16} />
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-ash">{ZONES[floor.zone].description}</p>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-plaster pt-3 text-xs">
            <Row label="Model plate (W×D×H)" value={`${floor.width} × ${floor.depth} × ${floor.height}`} />
            <Row label="Real plate" value={`${toMetres(floor.width).toFixed(0)} × ${toMetres(floor.depth).toFixed(0)} m · ${toMetres(floor.height).toFixed(1)} m f2f`} />
            <Row label="Twist (R_y)" value={`${((floor.rotationY * 180) / Math.PI).toFixed(1)}°`} />
            <Row label="Gross area" value={`${fmtNum(floorYield.sqFt)} sf`} />
            <Row label="Units" value={`${floorYield.units} ${ZONES[floor.zone].unitNoun}`} />
            <Row label="Build cost" value={fmtMoney(floorYield.cost)} />
            <Row label="Floor profit" value={fmtMoney(floorYield.profit)} />
            <Row label="Floor revenue" value={fmtMoney(floorYield.revenue)} accent />
          </dl>

          <p className="mt-3 rounded-[3px] bg-stone/50 px-2.5 py-1.5 text-[10px] text-ash">{materialLine(floor.zone, building.facade)}</p>

          <button
            onClick={onWalk}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[3px] bg-ink py-2 text-xs font-semibold text-paper transition hover:brightness-110"
          >
            <Footprints size={14} /> Walk inside
          </button>

          <div className="mt-2 flex gap-2">
            <button
              disabled={floor.index === 0}
              onClick={() => onStep(-1)}
              className="flex flex-1 items-center justify-center gap-1 rounded-[3px] border border-plaster py-1.5 text-xs text-ash transition hover:border-oak/40 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronDown size={14} /> Below
            </button>
            <button
              disabled={floor.index === floorCount - 1}
              onClick={() => onStep(1)}
              className="flex flex-1 items-center justify-center gap-1 rounded-[3px] border border-plaster py-1.5 text-xs text-ash transition hover:border-oak/40 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronUp size={14} /> Above
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
