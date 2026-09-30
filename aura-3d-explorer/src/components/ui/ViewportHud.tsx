"use client";
/**
 * ViewportHud — floating controls over the WebGL canvas:
 * explosion-factor slider, reset view, zone legend and the interaction hint.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Expand, MousePointerClick, RotateCcw } from "lucide-react";
import type { ZoneId } from "@/types";
import { EXPLODE_MAX, EXPLODE_MIN, ZONE_ORDER, ZONES } from "@/lib/tower";
import { RangeSlider } from "./primitives";

interface Props {
  explosion: number;
  onExplosionChange: (v: number) => void;
  onResetView: () => void;
  onFocusZone: (zone: ZoneId) => void;
  selectedZone: ZoneId | null;
  showHint: boolean;
}

export default function ViewportHud({ explosion, onExplosionChange, onResetView, onFocusZone, selectedZone, showHint }: Props) {
  return (
    <>
      {/* Zone legend — top right */}
      <motion.nav
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        aria-label="Tower zones"
        className="glass-card absolute right-3 top-3 z-10 hidden flex-col gap-1 rounded-xl p-2.5 sm:right-4 sm:top-4 md:flex"
      >
        {[...ZONE_ORDER].reverse().map((z) => {
          const [a, b] = ZONES[z].floors;
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

      {/* First-run hint — top centre */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass-card pointer-events-none absolute inset-x-0 top-4 z-10 mx-auto hidden w-fit items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] text-slate-400 sm:flex"
          >
            <MousePointerClick size={12} className="text-gold" /> Click a floor to isolate · drag to orbit · scroll to zoom
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control dock — bottom centre */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="glass-card absolute inset-x-0 bottom-3 z-10 mx-auto flex w-[min(560px,calc(100%-1.5rem))] items-center gap-4 rounded-2xl px-4 py-3 sm:bottom-4"
      >
        <div className="min-w-0 flex-1">
          <RangeSlider
            compact
            label="Explosion Factor"
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
