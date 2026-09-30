"use client";
/**
 * HeaderNav — branding, viewport mode toggles, live status badges and the
 * CAD import call-to-action.
 */
import { motion } from "framer-motion";
import { Box, Layers3, Rows3, Sofa, UploadCloud } from "lucide-react";
import type { ViewMode } from "@/types";
import { fmtMoney } from "@/lib/format";
import { SegmentedControl, AnimatedValue } from "./primitives";

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Site-wide gross development value (all buildings). */
  siteRevenue: number;
  siteMarginPct: number;
  buildingCount: number;
  floorCount: number;
  onImportCad: () => void;
}

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
  { value: "massing", label: "Massing", icon: <Box size={12} /> },
  { value: "exploded", label: "Exploded", icon: <Rows3 size={12} /> },
  { value: "interior", label: "Interior", icon: <Sofa size={12} /> },
];

/** Small status pill with a pulsing dot. */
function StatusBadge({ label, tone = "gold" }: { label: string; tone?: "gold" | "emerald" }) {
  const dot = tone === "emerald" ? "bg-emerald-500" : "bg-gold";
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dot}`} />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}

export default function HeaderNav({ viewMode, onViewModeChange, siteRevenue, siteMarginPct, buildingCount, floorCount, onImportCad }: Props) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-20 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/[0.06] bg-obsidian/80 px-4 py-3 backdrop-blur-xl lg:flex-nowrap lg:px-6"
    >
      {/* Brand */}
      <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gradient-to-b from-gold/20 to-gold/5 font-serif text-xl text-gold">
          A
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-serif text-[22px] leading-none tracking-wide text-white">
            AURA <span className="italic text-gold-metal">3D Explorer</span>
          </h1>
          <p className="mt-1 truncate text-[10px] uppercase tracking-[0.22em] text-slate-500">Yield Engine · The Meridian Quarter</p>
        </div>
      </div>

      {/* View toggles */}
      <div className="order-3 w-full lg:order-none lg:w-auto">
        <SegmentedControl ariaLabel="Viewport mode" layoutId="view-mode" value={viewMode} options={VIEW_OPTIONS} onChange={onViewModeChange} />
      </div>

      {/* Status badges */}
      <div className="no-scrollbar hidden items-center gap-2 overflow-x-auto xl:flex">
        <StatusBadge label="Live Pro Forma" tone="emerald" />
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
          <Layers3 size={11} className="text-gold" /> {buildingCount} Towers · {floorCount} Floors
        </span>
      </div>

      {/* GDV + CTA */}
      <div className="ml-auto flex shrink-0 items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Site GDV · Margin</p>
          <p className="font-serif text-xl tabular-nums leading-tight">
            <AnimatedValue value={fmtMoney(siteRevenue)} className="text-gold-metal" />
            <span className={`ml-2 text-sm ${siteMarginPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              <AnimatedValue value={`${siteMarginPct.toFixed(1)}%`} />
            </span>
          </p>
        </div>
        <button
          onClick={onImportCad}
          aria-label="Import CAD"
          className="flex items-center gap-2 rounded-full border border-gold/50 bg-gold/10 px-3 py-2 text-xs sm:px-4 font-semibold uppercase tracking-[0.14em] text-gold transition hover:bg-gold hover:text-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
        >
          <UploadCloud size={14} />
          <span className="hidden sm:inline">Import CAD</span>
        </button>
      </div>
    </motion.header>
  );
}
