"use client";
/**
 * AURA Studio — the interactive explorer + yield engine for a project.
 * -----------------------------------------------------------------------------
 *
 *   ┌─────────────────────── StudioToolbar ───────────────────────┐
 *   │  ExplorerViewport (≈68%)               │  Sidebar (≈32%)    │
 *   │  3D scene + HUD + inspector + walk     │  FinancialSidebar  │
 *   │                                        │  FinancialChart    │
 *   │                                        │  CommissionModel   │
 *   └────────────────────────────────────────┴────────────────────┘
 *
 * One building is "active" at a time: it explodes, its floors can be
 * isolated, and the sidebar edits its pro forma. On small screens the panes
 * stack: viewport on top, cards below.
 */
import { useState } from "react";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { siteFloorCount } from "@/lib/tower";
import { useYieldCalculator } from "@/hooks/useYieldCalculator";
import { useExplorer } from "@/hooks/useExplorer";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";
import FinancialSidebar from "@/components/ui/FinancialSidebar";
import FinancialChart from "@/components/ui/FinancialChart";
import CommissionModelCard from "@/components/ui/CommissionModelCard";
import CadUploadModal from "@/components/ui/CadUploadModal";
import { SegmentedControl } from "@/components/ui/primitives";
import StudioToolbar from "./StudioToolbar";

export default function StudioApp({ project }: { project: Project }) {
  const siteBuildings = projectSite(project);
  const [cadOpen, setCadOpen] = useState(false);
  const yieldCalc = useYieldCalculator(siteBuildings, project.finance);
  const x = useExplorer(siteBuildings, { keyboard: true, keyboardPaused: cadOpen });

  const building = x.building;
  const inputs = yieldCalc.inputsById[building.id];
  const metrics = yieldCalc.metricsById[building.id];

  return (
    // On desktop the studio fills the viewport under the 56px site header.
    <div className="flex flex-col bg-paper lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      <StudioToolbar
        title="AURA Studio"
        subtitle={`${project.name} · ${siteBuildings.length} building${siteBuildings.length > 1 ? "s" : ""} · ${siteFloorCount(siteBuildings)} floors`}
        viewMode={x.viewMode}
        onViewModeChange={x.setViewMode}
        siteRevenue={yieldCalc.site.grossProjectRevenue}
        siteMarginPct={yieldCalc.site.grossMarginPct}
        onImportCad={() => setCadOpen(true)}
      >
        <div className="hidden w-[132px] lg:block" title={x.autoLowered ? "Switched to Low automatically to keep the frame rate smooth" : undefined}>
          <SegmentedControl
            ariaLabel="Rendering quality"
            layoutId="quality"
            size="sm"
            value={x.quality}
            options={[
              { value: "low", label: "Low" },
              { value: "high", label: "High" },
            ]}
            onChange={x.setQuality}
          />
        </div>
      </StudioToolbar>

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <ExplorerViewport explorer={x} metricsById={yieldCalc.metricsById} className="h-[60dvh] min-h-[420px] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1" />

        <aside
          aria-label="Financial dashboard"
          className="thin-scroll space-y-4 border-plaster bg-stone/40 p-3 sm:p-4 lg:w-[32%] lg:min-w-[360px] lg:flex-none lg:overflow-y-auto lg:border-l lg:p-5"
        >
          <FinancialSidebar
            buildings={siteBuildings}
            siteName={project.name}
            building={building}
            inputs={inputs}
            metrics={metrics}
            metricsById={yieldCalc.metricsById}
            site={yieldCalc.site}
            onBuildingChange={x.selectBuilding}
            setInput={(key, value) => yieldCalc.setInput(building.id, key, value)}
            onReset={() => yieldCalc.reset(building.id)}
            onFocusZone={x.focusZone}
          />
          <FinancialChart metrics={metrics} buildingName={building.name} />
          <CommissionModelCard metrics={metrics} site={yieldCalc.site} buildingName={building.short} />
          <p className="caption pb-2 pt-1 text-center">Illustrative figures only · not investment advice</p>
        </aside>
      </div>

      <CadUploadModal
        open={cadOpen}
        onOpenChange={setCadOpen}
        inputs={inputs}
        building={building}
        onComplete={() => {
          setCadOpen(false);
          x.reveal();
        }}
      />
    </div>
  );
}
