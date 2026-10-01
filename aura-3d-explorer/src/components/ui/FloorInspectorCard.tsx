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
import { crownFloorCount, penthouseBedsOnFloor, toMetres, UNIT_MIX, ZONES } from "@/lib/tower";
import { fmtMoney, fmtNum } from "@/lib/format";
import FloorPlanMini from "./FloorPlanMini";
import AmenityIcon from "./AmenityIcon";
import { AMENITIES, AMENITY_ACCENT, amenityName } from "@/lib/amenities";
import { APARTMENT_SCHEMES, FURNITURE_COPY, FURNITURE_SETS, SCHEME_COPY, type FloorFit } from "@/lib/apartmentFit";

interface Props {
  building: Building;
  floor: FloorData | null;
  floorYield: FloorYield | null;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  /** Enter the first-person walk-through of this floor. */
  onWalk: () => void;
  /** Walk in from a specific viewpoint (plan minimap). */
  onViewpoint?: (i: number) => void;
  fit?: FloorFit;
  onFit?: (patch: Partial<FloorFit>) => void;
}

function ChoiceRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="mt-2">
      <p className="caption mb-1">{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-[3px] border px-2 py-1 text-[10px] transition ${value === o.id ? "border-ink bg-ink text-paper" : "border-plaster text-ash hover:border-oak/40 hover:text-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "4 residences · 2 bed / 2 bath each", "Penthouse · 4 bed / 4 bath", … */
function unitsLine(floor: FloorData, units: number, crownFloors: number) {
  if (floor.zone === "residential") return `${units} residences · ${UNIT_MIX.residential.beds} bed / ${UNIT_MIX.residential.baths} bath each`;
  if (floor.zone === "crown") {
    const { beds, baths } = UNIT_MIX.penthouse;
    const here = penthouseBedsOnFloor(floor.zoneIndex, crownFloors);
    const level = crownFloors > 1 ? ` · level ${floor.zoneIndex + 1} of ${crownFloors}, ${here} bed${here === 1 ? "" : "s"} here` : "";
    return `1 penthouse · ${beds} bed / ${baths} bath${level}`;
  }
  return `${units} ${ZONES[floor.zone].unitNoun}`;
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

export default function FloorInspectorCard({ building, floor, floorYield, onClose, onStep, onWalk, onViewpoint, fit, onFit }: Props) {
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
          className="overlay pointer-events-auto absolute left-3 top-3 z-10 w-[min(300px,calc(100%-1.5rem))] no-scrollbar max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-[3px] border-oak/25 p-4 sm:left-4 sm:top-4 sm:max-h-[calc(100%-2rem)]"
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

          {floor.amenity ? (
            <div className="mt-2 rounded-[3px] border px-2.5 py-2" style={{ borderColor: `${AMENITY_ACCENT}55`, background: `${AMENITY_ACCENT}10` }}>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <AmenityIcon kind={floor.amenity} size={14} style={{ color: AMENITY_ACCENT }} />
                {amenityName(floor)}
              </p>
              <p className="caption mt-0.5" style={{ color: AMENITY_ACCENT }}>
                Amenity · {AMENITIES[floor.amenity].label}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ash">{AMENITIES[floor.amenity].description}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-ash">{ZONES[floor.zone].description}</p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-plaster pt-3 text-xs">
            <Row label="Model plate (W×D×H)" value={`${floor.width} × ${floor.depth} × ${floor.height}`} />
            <Row label="Real plate" value={`${toMetres(floor.width).toFixed(0)} × ${toMetres(floor.depth).toFixed(0)} m · ${toMetres(floor.height).toFixed(1)} m f2f`} />
            <Row label="Twist (R_y)" value={`${((floor.rotationY * 180) / Math.PI).toFixed(1)}°`} />
            <Row label="Gross area" value={`${fmtNum(floorYield.sqFt)} sf`} />
            {floor.amenity ? (
              <>
                <Row label="Use" value="Shared amenity · not for sale" />
                <Row label="Build + fit-out cost" value={fmtMoney(floorYield.cost)} accent />
              </>
            ) : (
              <>
                <Row label="Units" value={unitsLine(floor, floorYield.units, crownFloorCount(building))} />
                <Row label="Build cost" value={fmtMoney(floorYield.cost)} />
                <Row label="Floor profit" value={fmtMoney(floorYield.profit)} />
                <Row label="Floor revenue" value={fmtMoney(floorYield.revenue)} accent />
              </>
            )}
          </dl>

          <p className="mt-3 rounded-[3px] bg-stone/50 px-2.5 py-1.5 text-[10px] text-ash">
            {floor.amenity ? "Recessed sky-terrace glazing · warm interior light" : materialLine(floor.zone, building.facade)}
          </p>

          {(floor.zone === "residential" || floor.zone === "crown") && !floor.amenity && fit && onFit && (
            <div className="mt-3 border-t border-plaster pt-3">
              <ChoiceRow label="Room plan" value={fit.scheme} options={APARTMENT_SCHEMES.map((id) => ({ id, label: SCHEME_COPY[id].label }))} onChange={(scheme) => onFit({ scheme })} />
              <ChoiceRow label="Furniture" value={fit.furniture} options={FURNITURE_SETS.map((id) => ({ id, label: FURNITURE_COPY[id].label }))} onChange={(furniture) => onFit({ furniture })} />
              <p className="mt-1.5 text-[10px] leading-snug text-ash">
                {SCHEME_COPY[fit.scheme].blurb} {FURNITURE_COPY[fit.furniture].blurb}
              </p>
            </div>
          )}

          <FloorPlanMini floor={floor} coreSize={building.coreSize} crownFloors={crownFloorCount(building)} onViewpoint={onViewpoint} fit={fit} />

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
