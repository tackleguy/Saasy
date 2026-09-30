"use client";
/**
 * ExplorerViewport — the live 3D explorer for a project site.
 * -----------------------------------------------------------------------------
 * Renders the WebGL scene plus its overlays (HUD dock, floor inspector,
 * walk-through HUD) from an `ExplorerState` (see hooks/useExplorer).
 *
 *   variant="full" — every control (Studio, project pages)
 *   variant="hero" — landing-page hero: photo-angle chips only, no inspector
 *
 * The scene is dynamically imported with SSR off (Three.js needs `window`)
 * and so it never blocks first paint.
 */
import dynamic from "next/dynamic";
import clsx from "clsx";
import type { BuildingId, YieldMetrics } from "@/types";
import type { ExplorerState } from "@/hooks/useExplorer";
import ViewportHud from "@/components/ui/ViewportHud";
import FloorInspectorCard from "@/components/ui/FloorInspectorCard";
import WalkHud from "@/components/ui/WalkHud";
import { PHOTO_ANGLES } from "@/lib/explorer";

const BuildingScene = dynamic(() => import("@/components/3d/BuildingScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone/60">
      <div className="h-8 w-8 animate-spin rounded-full border border-plaster border-t-ink" />
      <p className="caption">Generating massing…</p>
    </div>
  ),
});

interface Props {
  explorer: ExplorerState;
  /** Per-building yield, for the floor inspector's figures. */
  metricsById?: Record<BuildingId, YieldMetrics>;
  variant?: "full" | "hero";
  className?: string;
  /** Play the eye-level dolly-out opening shot. */
  intro?: boolean;
}

export default function ExplorerViewport({ explorer: x, metricsById, variant = "full", className, intro = true }: Props) {
  const floorYield = x.selectedIndex !== null ? metricsById?.[x.building.id]?.floors[x.selectedIndex] ?? null : null;

  return (
    <section aria-label={`3D model of ${x.building.name}`} className={clsx("relative overflow-hidden bg-stone", className)}>
      <BuildingScene
        buildings={x.site}
        activeBuildingId={x.activeBuildingId}
        explosion={x.explosion}
        selectedIndex={x.selectedIndex}
        xray={x.xray}
        onSelect={x.selectFloor}
        resetNonce={x.resetNonce}
        walking={x.walking}
        viewIndex={x.viewIndex}
        viewNonce={x.viewNonce}
        quality={x.quality}
        onPerformanceDecline={x.lowerQualityAutomatically}
        photoAngle={x.photoAngle}
        photoNonce={x.photoNonce}
        captureRef={x.captureRef}
        intro={intro}
      />

      {variant === "hero" ? (
        // Minimal chrome for the landing hero: just the photo-angle presets.
        <div className="absolute bottom-3 left-3 z-10 flex gap-1 sm:bottom-4 sm:left-4" role="group" aria-label="Photo angles">
          {PHOTO_ANGLES.map((a) => (
            <button
              key={a.id}
              onClick={() => x.choosePhotoAngle(a.id)}
              aria-pressed={x.photoAngle === a.id}
              className={clsx(
                "border px-2.5 py-1 text-[11px] backdrop-blur transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
                x.photoAngle === a.id ? "border-ink bg-ink text-paper" : "border-plaster bg-paper/85 text-ink hover:bg-paper"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : x.walking && x.selectedFloor ? (
        <WalkHud building={x.building} floor={x.selectedFloor} viewIndex={x.viewIndex} onView={x.goToView} onExit={x.stopWalk} />
      ) : (
        <>
          <ViewportHud
            site={x.site}
            building={x.building}
            onBuildingChange={x.selectBuilding}
            explosion={x.explosion}
            onExplosionChange={x.setExplosion}
            xray={x.xray}
            onXrayChange={x.setXray}
            onResetView={x.resetView}
            onFocusZone={x.focusZone}
            selectedZone={x.selectedFloor?.zone ?? null}
            showBuildingTabs={x.selectedIndex === null}
            onWalk={x.selectedIndex !== null ? x.startWalk : undefined}
            photoAngle={x.photoAngle}
            onPhotoAngle={x.choosePhotoAngle}
            onCapture={x.capture}
            capturing={x.capturing}
          />
          <FloorInspectorCard
            building={x.building}
            floor={x.selectedFloor}
            floorYield={floorYield}
            onClose={() => x.selectFloor(null)}
            onStep={x.stepFloor}
            onWalk={x.startWalk}
          />
        </>
      )}
    </section>
  );
}
