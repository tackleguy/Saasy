"use client";
/**
 * ExplorerViewport — the live 3D explorer for a project site.
 * -----------------------------------------------------------------------------
 * Renders the WebGL scene plus its overlays (HUD dock, floor inspector,
 * walk-through HUD) from an `ExplorerState` (see hooks/useExplorer).
 *
 *   variant="full" — every control (Studio, project pages)
 *   variant="hero" — landing-page hero: photo-angle chips only, no inspector
 *   variant="bare" — no overlays at all (offline renders)
 *
 * A CAD import (explorer.importedModel) replaces its building's procedural
 * tower; the ImportedModelHud chip switches back or discards it.
 *
 * The scene is dynamically imported with SSR off (Three.js needs `window`)
 * and so it never blocks first paint.
 */
import dynamic from "next/dynamic";
import clsx from "clsx";
import type { BuildingId, YieldMetrics } from "@/types";
import type { ExplorerState } from "@/hooks/useExplorer";
import type { ArchitectSceneState } from "@/lib/architecture";
import ViewportHud from "@/components/ui/ViewportHud";
import FloorInspectorCard from "@/components/ui/FloorInspectorCard";
import WalkHud from "@/components/ui/WalkHud";
import ImportedModelHud from "@/components/ui/ImportedModelHud";
import CityPicker from "@/components/ui/CityPicker";
import StackingBar from "@/components/ui/StackingBar";
import { PHOTO_ANGLES } from "@/lib/explorer";
import { ProjectFloorPlansProvider } from "@/components/3d/floorPlanContext";
import FloorPlanImportModal from "@/components/ui/FloorPlanImportModal";

// The site map reads the 3D city plan, so it loads only when first opened.
const SiteMap = dynamic(() => import("./SiteMap"), { ssr: false });

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
  variant?: "full" | "hero" | "bare";
  className?: string;
  /** Play the eye-level dolly-out opening shot. */
  intro?: boolean;
  /** Studio Architect mode tools for the 3D scene (useArchitect().scene). */
  architect?: ArchitectSceneState;
}

export default function ExplorerViewport({ explorer: x, metricsById, variant = "full", className, intro = true, architect }: Props) {
  const floorYield = x.selectedIndex !== null ? metricsById?.[x.building.id]?.floors[x.selectedIndex] ?? null : null;

  return (
    <ProjectFloorPlansProvider plans={x.floorPlans}>
    <section aria-label={`3D model of ${x.building.name}`} className={clsx("relative overflow-hidden bg-stone", className)}>
      <BuildingScene
        showPresentationControls={variant === "full"}
        buildings={x.site}
        activeBuildingId={x.activeBuildingId}
        explosion={x.explosion}
        selectedIndex={x.selectedIndex}
        xray={x.xray}
        section={x.sectionMode}
        onSelect={x.selectFloor}
        resetNonce={x.resetNonce}
        walking={x.walking}
        viewIndex={x.viewIndex}
        viewNonce={x.viewNonce}
        lift={x.lift}
        quality={x.quality}
        onPerformanceDecline={x.lowerQualityAutomatically}
        photoAngle={x.photoAngle}
        photoNonce={x.photoNonce}
        captureRef={x.captureRef}
        intro={intro}
        city={x.city}
        siteEdits={x.siteEdits}
        cameraHold={x.dragging}
        architect={architect}
        importedModel={x.showImported ? x.importedModel : null}
        fit={x.selectedFit}
        contextModel={x.contextModel}
      />

      {variant === "bare" ? null : variant === "hero" ? (
        // Minimal chrome for the landing hero: the city backdrop and photo-angle presets.
        <>
        <CityPicker value={x.city} onChange={x.setCity} showBlurb className="absolute left-3 top-3 z-10 sm:left-4 sm:top-4" />
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
        </>
      ) : x.walking && x.selectedFloor ? (
        <WalkHud building={x.building} floor={x.selectedFloor} viewIndex={x.viewIndex} onView={x.goToView} onExit={x.stopWalk} inLift={x.inLift} liftFloor={x.liftFloor} onRide={x.rideTo} fit={x.selectedFit} />
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
            section={x.sectionMode}
            onSectionChange={x.setSectionMode}
            onResetView={x.resetView}
            onFocusZone={x.focusZone}
            selectedZone={x.selectedFloor?.zone ?? null}
            showBuildingTabs={x.selectedIndex === null}
            onWalk={x.selectedIndex !== null ? x.startWalk : undefined}
            photoAngle={x.photoAngle}
            onPhotoAngle={x.choosePhotoAngle}
            onCapture={x.capture}
            capturing={x.capturing}
            city={x.city}
            onCityChange={x.setCity}
            mapOpen={x.mapOpen}
            onMapToggle={() => x.setMapOpen(!x.mapOpen)}
          />
          {!x.mapOpen && (
            <StackingBar
              building={x.building}
              selectedIndex={x.selectedIndex}
              onSelect={x.selectFloor}
              className="absolute bottom-36 right-3 top-16 z-10 hidden w-9 sm:right-4 sm:flex lg:bottom-[150px] lg:top-[200px]"
            />
          )}
          {x.mapOpen && (
            <SiteMap
              site={x.site}
              baseSite={x.baseSite}
              activeBuildingId={x.activeBuildingId}
              city={x.city}
              clearings={x.siteEdits.clearings}
              pads={x.siteEdits.pads}
              layoutEdited={x.layoutEdited}
              onSelectBuilding={x.selectBuilding}
              onMove={x.moveBuilding}
              onDragChange={x.setDragging}
              onReset={x.resetLayout}
              onClose={() => x.setMapOpen(false)}
              className="absolute right-3 top-3 z-20 w-[min(360px,calc(100%-1.5rem))] sm:right-4 sm:top-4"
            />
          )}
          {x.importedModel && x.selectedIndex === null && (
            <ImportedModelHud
              key={x.importedModel.uuid}
              model={x.importedModel}
              shown={x.showImported}
              onShownChange={x.setShowImported}
              onClear={() => x.setImportedModel(null)}
              className="absolute left-3 top-14 z-10 sm:left-4 sm:top-[7rem]"
            />
          )}
          <FloorInspectorCard
            building={x.building}
            floor={x.selectedFloor}
            floorYield={floorYield}
            fit={x.selectedFit}
            onFit={(patch) => x.selectedFloor && x.setFloorFit(x.selectedFloor.buildingId, x.selectedFloor.index, patch)}
            onClose={() => x.selectFloor(null)}
            onStep={x.stepFloor}
            onWalk={x.startWalk}
            onViewpoint={(i) => {
              x.startWalk();
              x.goToView(i);
            }}
          />
        </>
      )}
      {variant === "full" && (
        <FloorPlanImportModal
          open={x.planImportOpen}
          onOpenChange={x.setPlanImportOpen}
          building={x.building}
          existing={x.floorPlanFor(x.building.id)}
          onComplete={(plan) => {
            x.addFloorPlan(plan);
            x.setPlanImportOpen(false);
            const floor = x.building.floors.find((f) => f.zone === "residential" && !f.amenity) ?? x.building.floors.find((f) => f.zone === "crown");
            if (floor) {
              x.setExplosion(Math.max(x.explosion, 1));
              x.selectFloor(floor);
            }
          }}
        />
      )}
    </section>
    </ProjectFloorPlansProvider>
  );
}
