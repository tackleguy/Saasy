"use client";
/**
 * HTML controls floating over the WebGL canvas:
 * explode slider, furnishing toggle, camera reset, zone legend,
 * hover tooltip and the selected-floor detail panel.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Armchair, Expand, RotateCcw, X, MousePointerClick } from "lucide-react";
import * as RSlider from "@radix-ui/react-slider";
import { useAura } from "@/lib/store";
import { ZONES, ZONE_ORDER } from "@/lib/building";
import { fmtMoney, fmtNum } from "@/lib/finance";
import Switch from "@/components/ui/Switch";

export default function ViewportOverlay() {
  const { plates, explode, setExplode, furnish, setFurnish, selected, setSelected, hovered, resetCamera, yieldResult } = useAura();
  const sel = selected !== null ? plates[selected] : null;
  const selY = selected !== null ? yieldResult.floors[selected] : null;
  const hov = hovered !== null && hovered !== selected ? plates[hovered] : null;

  return (
    <>
      {/* Zone legend — clicking jumps to the first floor of that zone */}
      <div className="pointer-events-auto absolute right-4 top-4 hidden flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-obsidian/70 p-3 backdrop-blur md:flex">
        {[...ZONE_ORDER].reverse().map((z) => {
          const first = plates.find((p) => p.zone === z)!;
          return (
            <button key={z} onClick={() => setSelected(first.index)} className="flex items-center gap-2 text-left text-[11px] text-mist transition-colors hover:text-white">
              <span className="h-2 w-2 rounded-full" style={{ background: ZONES[z].color }} />
              {ZONES[z].short}
              <span className="ml-auto pl-4 tabular-nums text-mist/60">{ZONES[z].floors} fl</span>
            </button>
          );
        })}
      </div>

      {/* First-run hint */}
      <AnimatePresence>
        {selected === null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.06] bg-obsidian/70 px-3.5 py-1.5 text-[11px] text-mist backdrop-blur"
          >
            <MousePointerClick size={12} className="text-gold" /> Click any floor · drag to orbit · scroll to zoom
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover tooltip */}
      <AnimatePresence>
        {hov && (
          <motion.div
            key={hov.index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-28 left-4 rounded-lg border border-white/10 bg-obsidian-700/90 px-3 py-2 text-xs backdrop-blur"
          >
            <span className="font-serif text-sm text-white">{hov.label}</span>
            <span className="ml-2 text-mist">{ZONES[hov.zone].label}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected floor detail */}
      <AnimatePresence>
        {sel && selY && (
          <motion.div
            key={sel.index}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-auto absolute left-4 top-4 w-[280px] rounded-2xl border border-gold/30 bg-obsidian/85 p-4 shadow-gold backdrop-blur-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: ZONES[sel.zone].color }}>
                  {ZONES[sel.zone].label}
                </p>
                <h4 className="font-serif text-3xl text-white">Level {sel.index}</h4>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full p-1 text-mist hover:bg-white/5 hover:text-white" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-mist">{ZONES[sel.zone].description}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <dt className="text-mist">Gross area</dt>
              <dd className="text-right tabular-nums text-white">{fmtNum(selY.sqft)} sf</dd>
              <dt className="text-mist">Saleable</dt>
              <dd className="text-right tabular-nums text-white">{fmtNum(selY.saleableSqft)} sf</dd>
              <dt className="text-mist">Units</dt>
              <dd className="text-right tabular-nums text-white">
                {selY.units} {ZONES[sel.zone].unitNoun}
              </dd>
              <dt className="text-mist">Ceiling</dt>
              <dd className="text-right tabular-nums text-white">{sel.zone === "crown" ? "Double-height" : `${(sel.height * 3.28).toFixed(0)} ft f2f`}</dd>
              <dt className="text-mist">Floor revenue</dt>
              <dd className="text-right font-serif text-base tabular-nums text-gold">{fmtMoney(selY.revenue)}</dd>
            </dl>
            <div className="mt-3 flex gap-2">
              <button
                disabled={sel.index === 0}
                onClick={() => setSelected(sel.index - 1)}
                className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs text-mist transition hover:border-gold/40 hover:text-white disabled:opacity-30"
              >
                ↓ Floor below
              </button>
              <button
                disabled={sel.index === plates.length - 1}
                onClick={() => setSelected(sel.index + 1)}
                className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs text-mist transition hover:border-gold/40 hover:text-white disabled:opacity-30"
              >
                Floor above ↑
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control dock */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex w-[min(640px,calc(100%-2rem))] -translate-x-1/2 flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-white/[0.07] bg-obsidian/80 px-5 py-3.5 backdrop-blur-md">
        <div className="flex min-w-[200px] flex-1 items-center gap-3">
          <Expand size={15} className="shrink-0 text-gold" />
          <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-mist">Explode</span>
          <RSlider.Root
            className="relative flex h-5 w-full touch-none select-none items-center"
            value={[explode * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => setExplode(v / 100)}
            aria-label="Exploded view"
          >
            <RSlider.Track className="relative h-[3px] grow rounded-full bg-obsidian-500">
              <RSlider.Range className="absolute h-full rounded-full bg-gold" />
            </RSlider.Track>
            <RSlider.Thumb className="block h-4 w-4 rounded-full border-2 border-gold bg-obsidian shadow-gold outline-none" />
          </RSlider.Root>
          <span className="w-9 text-right text-xs tabular-nums text-white">{Math.round(explode * 100)}%</span>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5">
          <Armchair size={15} className={furnish ? "text-gold" : "text-mist"} />
          <span className="text-[11px] uppercase tracking-[0.14em] text-mist">Furnish</span>
          <Switch checked={furnish} onChange={setFurnish} label="Show furnishing layouts" />
        </label>

        <button
          onClick={() => {
            setExplode(0);
            resetCamera();
          }}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-mist transition hover:border-gold/40 hover:text-white"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>
    </>
  );
}
