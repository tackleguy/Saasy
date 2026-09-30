"use client";
/**
 * ViewportHud — floating controls over the WebGL canvas:
 * building tabs, explosion-factor slider, X-ray core toggle, reset view and
 * the zone legend for the active building.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Expand, RotateCcw, ScanEye } from "lucide-react";
import clsx from "clsx";
import type { Building, BuildingId, ZoneId } from "@/types";
import { EXPLODE_MAX, EXPLODE_MIN, SITE, ZONE_ORDER, ZONES } from "@/lib/tower";
import { RangeSlider } from "./primitives";

interface Props {
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
}

export default function ViewportHud({
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
}: Props) {
  return (
    <>
      {/* Building tabs — top centre */}
      <AnimatePresence>
        {showBuildingTabs && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute inset-x-0 top-3 z-10 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-col items-center gap-1.5 sm:top-4"
          >
            <div role="tablist" aria-label="Buildings" className="glass-card flex gap-1 rounded-full p-1">
              {SITE.map((b) => {
                const active = b.id === building.id;
                return (
                  <button
                    key={b.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => onBuildingChange(b.id)}
                    className={clsx(
                      "relative whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      active ? "text-obsidian" : "text-slate-400 hover:text-white"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="building-tab"
                        className="absolute inset-0 rounded-full bg-gradient-to-b from-gold-light to-gold"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative">
                      {b.short}
                      <span className={clsx("ml-1.5 font-mono text-[10px]", active ? "text-obsidian/70" : "text-slate-500")}>{b.floors.length}F</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="hidden text-[11px] text-slate-500 sm:block">{building.tagline} · click any floor to isolate it</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zone legend — top right */}
      <motion.nav
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        aria-label="Tower zones"
        className="glass-card absolute right-3 top-3 z-10 hidden flex-col gap-1 rounded-xl p-2.5 sm:right-4 sm:top-4 lg:flex"
      >
        <p className="eyebrow px-1.5 pb-1 text-gold/80">{building.short}</p>
        {[...ZONE_ORDER].reverse().map((z) => {
          const [a, b] = building.zones[z].floors;
          const active = selectedZone === z;
          return (
            <button
              key={z}
              onClick={() => onFocusZone(z)}
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors ${active ? "bg-white/5 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: ZONES[z].accent }} />
              {ZONES[z].short}
              <span className="ml-auto pl-4 font-mono text-[10px] tabular-nums text-slate-500">{a === b ? `F${a}` : `F${a}–${b}`}</span>
            </button>
          );
        })}
      </motion.nav>

      {/* Control dock — bottom centre */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="glass-card absolute inset-x-0 bottom-3 z-10 mx-auto flex w-[min(600px,calc(100%-1.5rem))] items-center gap-3 rounded-2xl px-4 py-3 sm:bottom-4"
      >
        <div className="min-w-0 flex-1">
          <RangeSlider
            compact
            label={`Explosion · ${building.short}`}
            icon={<Expand size={12} className="text-gold" />}
            value={explosion}
            min={EXPLODE_MIN}
            max={EXPLODE_MAX}
            step={0.05}
            display={`${explosion.toFixed(2)}×`}
            onChange={onExplosionChange}
          />
        </div>
        <button
          onClick={() => onXrayChange(!xray)}
          aria-pressed={xray}
          title="X-ray: fade the facades to reveal the structural cores"
          className={clsx(
            "flex shrink-0 items-center gap-1.5 self-end rounded-lg border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] transition",
            xray ? "border-gold/60 bg-gold/15 text-gold" : "border-white/10 text-slate-400 hover:border-gold/40 hover:text-white"
          )}
        >
          <ScanEye size={13} /> <span className="hidden sm:inline">Core</span>
        </button>
        <button
          onClick={onResetView}
          className="flex shrink-0 items-center gap-1.5 self-end rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-gold/40 hover:text-white"
          aria-label="Reset view"
        >
          <RotateCcw size={13} /> <span className="hidden sm:inline">Reset</span>
        </button>
      </motion.div>
    </>
  );
}
