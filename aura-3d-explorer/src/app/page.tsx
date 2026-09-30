"use client";
/**
 * AURA 3D Explorer & Yield Engine — application orchestrator.
 * -----------------------------------------------------------------------------
 * Owns all cross-cutting state and wires it into two panes:
 *
 *   ┌───────────────────────── HeaderNav ─────────────────────────┐
 *   │  Viewport (68%)                        │  Sidebar (32%)     │
 *   │  BuildingScene + HUD + FloorInspector  │  FinancialSidebar  │
 *   │                                        │  FinancialChart    │
 *   │                                        │  CommissionModel   │
 *   └────────────────────────────────────────┴────────────────────┘
 *
 * On small screens the panes stack: viewport on top, cards below.
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ViewMode, ZoneId } from "@/types";
import { TOWER, ZONES } from "@/lib/tower";
import { useYieldCalculator } from "@/hooks/useYieldCalculator";
import HeaderNav from "@/components/ui/HeaderNav";
import ViewportHud from "@/components/ui/ViewportHud";
import FloorInspectorCard from "@/components/ui/FloorInspectorCard";
import FinancialSidebar from "@/components/ui/FinancialSidebar";
import FinancialChart from "@/components/ui/FinancialChart";
import CommissionModelCard from "@/components/ui/CommissionModelCard";
import CadUploadModal from "@/components/ui/CadUploadModal";

// Three.js needs `window`, so the canvas is never server-rendered.
const BuildingScene = dynamic(() => import("@/components/3d/BuildingScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />
      <p className="eyebrow text-slate-500">Generating tower…</p>
    </div>
  ),
});

/** Explosion factor applied by the "Exploded" view preset. */
const EXPLODED_PRESET = 1.5;
/** Floor isolated by the "Interior" preset when none is selected (Floor 12, residential). */
const INTERIOR_DEFAULT_INDEX = 11;

export default function Page() {
  const { inputs, setInput, reset, metrics } = useYieldCalculator();

  const [explosion, setExplosion] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [cadOpen, setCadOpen] = useState(false);

  const selectedFloor = selectedIndex !== null ? TOWER[selectedIndex] : null;

  // The header toggle reflects the current state rather than holding its own.
  const viewMode: ViewMode = selectedIndex !== null ? "interior" : explosion > 0 ? "exploded" : "massing";

  const handleViewMode = useCallback(
    (mode: ViewMode) => {
      if (mode === "massing") {
        setSelectedIndex(null);
        setExplosion(0);
      } else if (mode === "exploded") {
        setSelectedIndex(null);
        setExplosion(EXPLODED_PRESET);
      } else {
        setExplosion((e) => Math.max(e, 1));
        setSelectedIndex((i) => i ?? INTERIOR_DEFAULT_INDEX);
      }
    },
    []
  );

  const resetView = useCallback(() => {
    setSelectedIndex(null);
    setExplosion(0);
    setResetNonce((n) => n + 1);
  }, []);

  const focusZone = useCallback((zone: ZoneId) => setSelectedIndex(ZONES[zone].floors[0] - 1), []);

  const stepFloor = useCallback((delta: 1 | -1) => {
    setSelectedIndex((i) => (i === null ? i : Math.min(TOWER.length - 1, Math.max(0, i + delta))));
  }, []);

  // After a CAD ingest, reveal the model with an exploded fly-around.
  const handleCadComplete = useCallback(() => {
    setCadOpen(false);
    setSelectedIndex(null);
    setExplosion(1.2);
    setResetNonce((n) => n + 1);
  }, []);

  // Keyboard: Esc releases the floor, ↑ / ↓ step through the tower.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cadOpen) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [role='slider'], [role='radio']")) return;
      if (e.key === "Escape") setSelectedIndex(null);
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const d = e.key === "ArrowUp" ? 1 : -1;
        setSelectedIndex((i) => (i === null ? (d === 1 ? 0 : TOWER.length - 1) : Math.min(TOWER.length - 1, Math.max(0, i + d))));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cadOpen]);

  return (
    <div className="flex min-h-dvh flex-col bg-obsidian lg:h-dvh lg:overflow-hidden">
      <HeaderNav
        viewMode={viewMode}
        onViewModeChange={handleViewMode}
        grossRevenue={metrics.grossProjectRevenue}
        grossMarginPct={metrics.grossMarginPct}
        floorCount={TOWER.length}
        onImportCad={() => setCadOpen(true)}
      />

      <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* ------------------------------------------------ 3D viewport (68%) */}
        <section aria-label="3D tower viewport" className="relative h-[64dvh] min-h-[440px] shrink-0 overflow-hidden lg:h-auto lg:min-w-0 lg:flex-1">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(212,175,55,0.08),transparent_60%)]" />
          <BuildingScene explosion={explosion} selectedIndex={selectedIndex} onSelect={setSelectedIndex} resetNonce={resetNonce} />
          <ViewportHud
            explosion={explosion}
            onExplosionChange={setExplosion}
            onResetView={resetView}
            onFocusZone={focusZone}
            selectedZone={selectedFloor?.zone ?? null}
            showHint={selectedIndex === null}
          />
          <FloorInspectorCard
            floor={selectedFloor}
            floorYield={selectedIndex !== null ? metrics.floors[selectedIndex] : null}
            floorCount={TOWER.length}
            onClose={() => setSelectedIndex(null)}
            onStep={stepFloor}
          />
        </section>

        {/* ------------------------------------------------ Sidebar (32%) */}
        <aside
          aria-label="Financial dashboard"
          className="aura-scroll space-y-4 border-white/[0.06] bg-gradient-to-b from-obsidian-900 to-obsidian p-3 sm:p-4 lg:w-[32%] lg:min-w-[360px] lg:flex-none lg:overflow-y-auto lg:border-l lg:p-5"
        >
          <FinancialSidebar inputs={inputs} metrics={metrics} setInput={setInput} onReset={reset} onFocusZone={focusZone} />
          <FinancialChart metrics={metrics} />
          <CommissionModelCard metrics={metrics} />
          <p className="pb-2 pt-1 text-center text-[10px] uppercase tracking-[0.2em] text-slate-500/70">
            Illustrative figures only · not investment advice
          </p>
        </aside>
      </main>

      <CadUploadModal open={cadOpen} onOpenChange={setCadOpen} inputs={inputs} onComplete={handleCadComplete} />
    </div>
  );
}
