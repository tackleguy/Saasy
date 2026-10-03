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
import { useEffect, useRef, useState } from "react";
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
import PresentationControls from "@/components/ui/PresentationControls";
import type { SunPreset } from "@/components/3d/environment/settings";
import type { ModelCut } from "@/components/3d/presentationContext";

// The site map reads the 3D city plan, so it loads only when first opened.
const MappedSiteMap = dynamic(() => import("./MappedSiteMap"), { ssr: false });

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
  const viewportRef = useRef<HTMLElement>(null);
  const [existingCity, setExistingCity] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [presentationSun, setPresentationSun] = useState<SunPreset>("golden");
  const [modelCut, setModelCut] = useState<ModelCut>({ mode: "exterior", fraction: .35 });
  useEffect(() => {
    if (!presenting) return;
    const restore = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    viewportRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Exit presentation"]')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setPresenting(false); }
      if (event.key !== "Tab") return;
      const elements = [...(viewportRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select, input, summary, [tabindex="0"]') ?? [])].filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = restore; window.removeEventListener("keydown", escape); viewportRef.current?.querySelector<HTMLButtonElement>('[data-presentation-trigger]')?.focus(); };
  }, [presenting]);
  const floorYield = x.selectedIndex !== null ? metricsById?.[x.building.id]?.floors[x.selectedIndex] ?? null : null;

  return (
    <ProjectFloorPlansProvider plans={x.floorPlans}>
    <section ref={viewportRef} role={presenting ? "dialog" : undefined} aria-modal={presenting ? true : undefined} aria-label={`3D model of ${x.building.name}`} className={clsx("overflow-hidden bg-stone", presenting ? "fixed inset-0 z-[60]" : ["relative", className])}>
      <BuildingScene
        presentation={presenting}
        presentationSun={presentationSun}
        modelCut={presenting ? modelCut : undefined}
        location={x.location}
        mapSnapshot={x.mapSnapshot}
        onContextChange={setExistingCity}
        showPresentationControls={variant === "full" && !presenting}
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

      {variant === "bare" || presenting ? null : variant === "hero" ? (
        // Minimal chrome for the landing hero: the city backdrop and photo-angle presets.
        <>
        <details className="absolute bottom-20 left-4 z-30 max-w-[240px] bg-paper p-3 text-xs text-ink sm:bottom-auto sm:top-5 sm:left-5">
          <summary className="cursor-pointer py-1">{x.location.example ? "Example location" : "Project location"}</summary>
          <CityPicker location={x.location} onLocationChange={x.setLocation} onLocationOpen={() => x.setMapOpen(true)} mapLoading={x.mapLoading} mapError={x.mapError} existingCity={existingCity} value={x.city} onChange={x.setCity} className="mt-3" />
        </details>
        <div className="absolute bottom-6 left-4 right-4 z-10 flex w-fit max-w-[calc(100%-2rem)] gap-1 overflow-x-auto bg-paper p-1.5 sm:left-5 sm:right-auto" role="group" aria-label="Photo angles">
          {PHOTO_ANGLES.map((a) => (
            <button
              key={a.id}
              onClick={() => x.choosePhotoAngle(a.id)}
              aria-pressed={x.photoAngle === a.id}
              className={clsx(
                "shrink-0 border px-3 py-2.5 text-xs transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
                x.photoAngle === a.id ? "border-ink bg-ink text-paper" : "border-transparent bg-paper text-ink hover:bg-stone"
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
            location={x.location}
            onLocationChange={x.setLocation}
            onLocationOpen={() => x.setMapOpen(true)}
            mapLoading={x.mapLoading}
            mapError={x.mapError}
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
            existingCity={existingCity}
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
      {x.mapOpen && <MappedSiteMap explorer={x} onClose={() => x.setMapOpen(false)} />}
      {x.mapError && !x.mapOpen && <div role="status" className="absolute left-3 top-16 z-20 max-w-[260px] border border-plaster bg-paper p-3 text-xs"><p>{x.mapError}</p><button onClick={x.retryMap} className="mt-1 min-h-11 underline">Retry map context</button></div>}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-paper/90 px-2 text-right text-[9px] leading-3 text-ink" aria-label="Map attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a> · <a href="/maps/ATTRIBUTION.md" target="_blank" rel="noreferrer" className="underline">Overture Maps · Sources</a>
      </div>
      {variant !== "bare" && <PresentationControls explorer={x} active={presenting} onActive={setPresenting} sun={presentationSun} onSun={setPresentationSun} cut={modelCut} onCut={setModelCut}/>}
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
