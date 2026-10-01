"use client";
/**
 * StudioToolbar — the thin bar under the site header in AURA Studio:
 * project title, Developer / Architect mode switch, viewport mode toggle,
 * the headline figure for the mode (site GDV, or GFA and FAR) and the
 * studio actions.
 * Extra actions (quality, scenarios, export) are passed in as children.
 */
import { Box, DraftingCompass, Rows3, Sofa, TrendingUp, UploadCloud } from "lucide-react";
import type { StudioMode } from "@/hooks/useArchitect";
import type { ReactNode } from "react";
import type { ViewMode } from "@/types";
import { fmtMoney } from "@/lib/format";
import { AnimatedValue, SegmentedControl } from "@/components/ui/primitives";

interface Props {
  title: string;
  subtitle: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Site-wide gross development value (all buildings). */
  siteRevenue: number;
  siteMarginPct: number;
  onImportCad: () => void;
  /** Developer (finance) or Architect (design tools) mode. */
  studioMode: StudioMode;
  onStudioModeChange: (mode: StudioMode) => void;
  /** Replaces the GDV figure (Architect mode shows area and FAR). */
  summary?: { label: string; value: string; sub: string };
  children?: ReactNode;
}

const MODE_OPTIONS: { value: StudioMode; label: string; icon: ReactNode }[] = [
  { value: "developer", label: "Developer", icon: <TrendingUp size={12} aria-hidden /> },
  { value: "architect", label: "Architect", icon: <DraftingCompass size={12} aria-hidden /> },
];

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: ReactNode }[] = [
  { value: "massing", label: "Massing", icon: <Box size={12} aria-hidden /> },
  { value: "exploded", label: "Exploded", icon: <Rows3 size={12} aria-hidden /> },
  { value: "interior", label: "Interior", icon: <Sofa size={12} aria-hidden /> },
];

export default function StudioToolbar({ title, subtitle, viewMode, onViewModeChange, siteRevenue, siteMarginPct, onImportCad, studioMode, onStudioModeChange, summary, children }: Props) {
  return (
    <div className="no-print flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-plaster bg-paper px-4 py-2.5 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-medium leading-tight text-ink">{title}</h1>
        <p className="caption truncate">{subtitle}</p>
      </div>

      <div className="w-[196px] shrink-0">
        <SegmentedControl ariaLabel="Studio mode" layoutId="studio-mode" size="sm" value={studioMode} options={MODE_OPTIONS} onChange={onStudioModeChange} />
      </div>

      <div className="order-3 w-full sm:order-none sm:w-auto">
        <SegmentedControl ariaLabel="Viewport mode" layoutId="view-mode" size="sm" value={viewMode} options={VIEW_OPTIONS} onChange={onViewModeChange} />
      </div>

      <div className="ml-auto flex items-center gap-4">
        {summary ? (
          <div className="hidden text-right md:block">
            <p className="caption">{summary.label}</p>
            <p className="font-serif text-lg leading-tight tabular-nums">
              <AnimatedValue value={summary.value} className="text-ink" />
              <span className="ml-2 text-sm text-oak">
                <AnimatedValue value={summary.sub} />
              </span>
            </p>
          </div>
        ) : (
          <div className="hidden text-right md:block">
            <p className="caption">Site GDV · margin</p>
            <p className="font-serif text-lg leading-tight tabular-nums">
              <AnimatedValue value={fmtMoney(siteRevenue)} className="text-ink" />
              <span className={`ml-2 text-sm ${siteMarginPct >= 0 ? "text-positive" : "text-negative"}`}>
                <AnimatedValue value={`${siteMarginPct.toFixed(1)}%`} />
              </span>
            </p>
          </div>
        )}
        {children}
        <button onClick={onImportCad} className="btn-secondary py-2 text-xs" aria-label="Import CAD">
          <UploadCloud size={14} aria-hidden />
          <span className="hidden sm:inline">Import CAD</span>
        </button>
      </div>
    </div>
  );
}
