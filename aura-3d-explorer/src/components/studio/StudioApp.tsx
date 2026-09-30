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
 *
 * "Import CAD" opens CadUploadModal; a model with geometry replaces the
 * active building's procedural tower (see useExplorer.setImportedModel).
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { FileDown } from "lucide-react";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { siteFloorCount } from "@/lib/tower";
import { useYieldCalculator } from "@/hooks/useYieldCalculator";
import { useExplorer } from "@/hooks/useExplorer";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";
import FinancialSidebar from "@/components/ui/FinancialSidebar";
import FinancialChart from "@/components/ui/FinancialChart";
import CommissionModelCard from "@/components/ui/CommissionModelCard";
import SensitivityTable from "@/components/ui/SensitivityTable";
import { SegmentedControl } from "@/components/ui/primitives";
import StudioToolbar from "./StudioToolbar";
import ScenarioDrawer from "./ScenarioDrawer";
import ProFormaReport from "./ProFormaReport";

// The CAD modal pulls in Three's model loaders — load it only when first opened.
const CadUploadModal = dynamic(() => import("@/components/ui/CadUploadModal"), { ssr: false });

export default function StudioApp({ project }: { project: Project }) {
  const siteBuildings = projectSite(project);
  const [cadOpen, setCadOpen] = useState(false);
  const yieldCalc = useYieldCalculator(siteBuildings, project.finance);
  const x = useExplorer(siteBuildings, { keyboard: true, keyboardPaused: cadOpen, city: project.backdrop });

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
        siteRevenue={yieldCalc.site.gdv}
        siteMarginPct={yieldCalc.site.marginOnGdvPct}
        onImportCad={() => setCadOpen(true)}
      >
        <ScenarioDrawer projectSlug={project.slug} current={yieldCalc.inputsById} onLoad={yieldCalc.load} explorer={x} />
        <button onClick={() => window.print()} className="btn-secondary py-2 text-xs" aria-label="Export pro forma as PDF">
          <FileDown size={14} aria-hidden />
          <span className="hidden sm:inline">Export PDF</span>
        </button>
        <div className="hidden w-[132px] xl:block" title={x.autoLowered ? "Switched to Low automatically to keep the frame rate smooth" : undefined}>
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
          <SensitivityTable inputs={inputs} floors={building.floors} buildingName={building.short} />
          <CommissionModelCard metrics={metrics} site={yieldCalc.site} buildingName={building.short} />
          <p className="caption pb-2 pt-1 text-center">Illustrative figures only · not investment advice</p>
        </aside>
      </div>

      <ProFormaReport
        projectName={project.name}
        city={project.city}
        buildings={siteBuildings}
        inputsById={yieldCalc.inputsById}
        metricsById={yieldCalc.metricsById}
        site={yieldCalc.site}
      />

      {cadOpen && (
        <CadUploadModal
          open={cadOpen}
          onOpenChange={setCadOpen}
          inputs={inputs}
          building={building}
          onComplete={(model) => {
            setCadOpen(false);
            if (model) {
              // Stand the import on the active plot and fly the hero camera to it.
              x.setImportedModel(model);
              x.resetView();
            } else {
              x.reveal();
            }
          }}
        />
      )}
    </div>
  );
}
