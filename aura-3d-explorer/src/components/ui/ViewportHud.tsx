"use client";
/**
 * ViewportHud — floating controls over the WebGL canvas:
 * building tabs, city backdrop picker, explosion-factor slider, X-ray core
 * toggle, reset view, photo angles and the zone legend for the active building.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Expand, Footprints, RotateCcw, ScanEye } from "lucide-react";
import clsx from "clsx";
import type { Building, BuildingId, ZoneId } from "@/types";
import { EXPLODE_MAX, EXPLODE_MIN, ZONE_ORDER, ZONES } from "@/lib/tower";
import { RangeSlider } from "./primitives";
import { PHOTO_ANGLES, type PhotoAngle } from "@/lib/explorer";
import type { CityId } from "@/lib/cityPresets";
import CityPicker from "./CityPicker";

interface Props {
  /** Every building on the project site (for the building tabs). */
  site: Building[];
  building: Building;
  onBuildingChange: (id: BuildingId) => void;
  explosion: number;
  onExplosionChange: (v: number) => void;
  xray: boolean;
  onXrayChange: (v: boolean) => void;
  onResetView: () => void;
  onFocusZone: (zone: ZoneId) => void;
  selectedZone: ZoneId | null;
  /** Hidden while a floor is isolated (the inspector takes the space). */
  showBuildingTabs: boolean;
  /** Present when a floor is isolated: enter the walk-through. */
  onWalk?: () => void;
  photoAngle: PhotoAngle | null;
  onPhotoAngle: (a: PhotoAngle) => void;
  /** Export the current view as a 2× PNG. */
  onCapture: () => void;
  capturing: boolean;
  /** City backdrop for the urban context. */
  city: CityId;
  onCityChange: (id: CityId) => void;
}

export default function ViewportHud({
  site,
  building,
  onBuildingChange,
  explosion,
  onExplosionChange,
  xray,
  onXrayChange,
  onResetView,
  onFocusZone,
  selectedZone,
  showBuildingTabs,
  onWalk,
  photoAngle,
  onPhotoAngle,
  onCapture,
  capturing,
  city,
  onCityChange,
}: Props) {
  return (
    <>
      {/* City backdrop — top left (the floor inspector takes this corner when a floor is isolated) */}
      {showBuildingTabs && <CityPicker value={city} onChange={onCityChange} showBlurb className="absolute left-3 top-3 z-10 hidden sm:left-4 sm:top-4 sm:flex" />}

      {/* Building tabs — top centre */}
      <AnimatePresence>
        {showBuildingTabs && site.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute inset-x-0 top-3 z-10 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-col items-center gap-1.5 sm:top-4"
          >
            <div role="tablist" aria-label="Buildings" className="overlay flex gap-1 rounded-full p-1">
              {site.map((b) => {
                const active = b.id === building.id;
                return (
                  <button
                    key={b.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => onBuildingChange(b.id)}
                    className={clsx(
                      "relative whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      active ? "text-paper" : "text-ash hover:text-ink"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="building-tab"
                        className="absolute inset-0 rounded-full bg-ink"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative">
                      {b.short}
                      <span className={clsx("ml-1.5 font-mono text-[10px]", active ? "text-paper/70" : "text-ash")}>{b.floors.length}F</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="overlay hidden rounded-full px-3 py-1 text-[11px] text-ash sm:block">{building.tagline} · click any floor to isolate it</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zone legend — top right */}
      <motion.nav
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        aria-label="Tower zones"
        className="overlay absolute right-3 top-3 z-10 hidden flex-col gap-1 rounded-[3px] p-2.5 sm:right-4 sm:top-4 lg:flex"
      >
        <p className="caption px-1.5 pb-1 text-oak">{building.short}</p>
        {[...ZONE_ORDER].reverse().map((z) => {
          const [a, b] = building.zones[z].floors;
          const active = selectedZone === z;
          return (
            <button
              key={z}
              onClick={() => onFocusZone(z)}
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors ${active ? "bg-stone text-ink" : "text-ash hover:text-ink"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: ZONES[z].accent }} />
              {ZONES[z].short}
              <span className="ml-auto pl-4 font-mono text-[10px] tabular-nums text-ash">{a === b ? `F${a}` : `F${a}–${b}`}</span>
            </button>
          );
        })}
      </motion.nav>

      {/* Control dock — bottom centre (compact on phones) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="overlay absolute inset-x-0 bottom-3 z-10 mx-auto flex w-[min(640px,calc(100%-1.5rem))] flex-col gap-2.5 px-3 py-2.5 sm:bottom-4 sm:px-4 sm:py-3"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <RangeSlider
              compact
              label={`Explosion · ${building.short}`}
              icon={<Expand size={12} className="text-oak" aria-hidden />}
              value={explosion}
              min={EXPLODE_MIN}
              max={EXPLODE_MAX}
              step={0.05}
              display={`${explosion.toFixed(2)}×`}
              onChange={onExplosionChange}
            />
          </div>
          {onWalk && (
            <button onClick={onWalk} className="btn-primary shrink-0 self-end px-2.5 py-1.5 text-[11px]">
              <Footprints size={13} aria-hidden /> <span className="hidden sm:inline">Walk in</span>
            </button>
          )}
          <button
            onClick={() => onXrayChange(!xray)}
            aria-pressed={xray}
            aria-label="Core X-ray"
            title="X-ray: fade the facades to reveal the structural cores"
            className={clsx(
              "flex shrink-0 items-center gap-1.5 self-end border px-2.5 py-1.5 text-[11px] transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
              xray ? "border-oak bg-oak/10 text-oak" : "border-plaster text-ash hover:border-ink/30 hover:text-ink"
            )}
          >
            <ScanEye size={13} aria-hidden /> <span className="hidden sm:inline">Core</span>
          </button>
          <button onClick={onResetView} className="btn-secondary shrink-0 self-end px-2.5 py-1.5 text-[11px]" aria-label="Reset view">
            <RotateCcw size={13} aria-hidden /> <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

        {/* Photo angles + capture */}
        <div className="flex items-center gap-2 border-t border-plaster pt-2.5">
          <CityPicker value={city} onChange={onCityChange} className="shrink-0 sm:hidden" />
          <span className="caption hidden shrink-0 sm:inline">Photo angle</span>
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto" role="group" aria-label="Photo angles">
            {PHOTO_ANGLES.map((a) => (
              <button
                key={a.id}
                onClick={() => onPhotoAngle(a.id)}
                aria-pressed={photoAngle === a.id}
                className={clsx(
                  "shrink-0 border px-2.5 py-1 text-[11px] transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
                  photoAngle === a.id ? "border-ink bg-ink text-paper" : "border-plaster text-ash hover:border-ink/30 hover:text-ink"
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button onClick={onCapture} disabled={capturing} className="btn-secondary shrink-0 px-2.5 py-1 text-[11px]" aria-label="Capture render as PNG">
            <Camera size={13} aria-hidden /> {capturing ? "Rendering…" : "Capture"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
