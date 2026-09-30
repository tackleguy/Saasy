"use client";
/**
 * ProjectWorkspace — the interactive part of a project page:
 *   1. live 3D explorer + yield engine (project defaults)
 *   2. unit-availability stacking plan (linked to the explorer)
 *   3. "Request Pro Forma / Book Viewing" enquiry
 * All three share one explorer and one yield state, so choosing a unit can
 * fly the camera to its floor and pre-fill the enquiry.
 */
import { useCallback, useState } from "react";
import clsx from "clsx";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { useExplorer } from "@/hooks/useExplorer";
import { useYieldCalculator } from "@/hooks/useYieldCalculator";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";
import FinancialSidebar from "@/components/ui/FinancialSidebar";
import CommissionModelCard from "@/components/ui/CommissionModelCard";
import FinancialChart from "@/components/ui/FinancialChart";
import SensitivityTable from "@/components/ui/SensitivityTable";
import StackingPlan, { type UnitInfo } from "./StackingPlan";
import EnquiryForm from "./EnquiryForm";

function SectionHeading({ id, title, caption }: { id: string; title: string; caption: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-2">
      <h2 id={id} className="font-serif text-3xl text-ink sm:text-4xl">
        {title}
      </h2>
      <p className="caption max-w-md">{caption}</p>
    </header>
  );
}

export default function ProjectWorkspace({ project }: { project: Project }) {
  const site = projectSite(project);
  const yieldCalc = useYieldCalculator(site, project.finance);
  const x = useExplorer(site, { city: project.backdrop });
  const [enquiryUnit, setEnquiryUnit] = useState<string | null>(null);

  const building = x.building;
  const metrics = yieldCalc.metricsById[building.id];

  const showFloor = useCallback(
    (floorIndex: number) => {
      x.setExplosion((e) => Math.max(e, 1));
      x.selectFloor(building.floors[floorIndex]);
      document.getElementById("explore")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [x, building]
  );

  const enquire = useCallback((u: UnitInfo) => {
    setEnquiryUnit(u.code);
    document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <>
      {/* 1 — Explorer + yield engine */}
      <section aria-labelledby="explore" className="mx-auto w-full max-w-[1600px] scroll-mt-20 px-4 py-12 sm:px-6">
        <SectionHeading id="explore" title="Explore in 3D" caption="Orbit, explode the stack, isolate a floor and walk inside. Figures update live with the pro forma." />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <ExplorerViewport explorer={x} metricsById={yieldCalc.metricsById} intro={false} className="h-[60vh] min-h-[420px] lg:h-[74vh]" />
          <div className="thin-scroll space-y-4 lg:h-[74vh] lg:overflow-y-auto">
            <FinancialSidebar
              buildings={site}
              siteName={project.name}
              building={building}
              inputs={yieldCalc.inputsById[building.id]}
              metrics={metrics}
              metricsById={yieldCalc.metricsById}
              site={yieldCalc.site}
              onBuildingChange={x.selectBuilding}
              setInput={(key, value) => yieldCalc.setInput(building.id, key, value)}
              onReset={() => yieldCalc.reset(building.id)}
              onFocusZone={x.focusZone}
            />
            <FinancialChart metrics={metrics} buildingName={building.name} />
            <SensitivityTable inputs={yieldCalc.inputsById[building.id]} floors={building.floors} buildingName={building.short} />
            <CommissionModelCard metrics={metrics} site={yieldCalc.site} buildingName={building.short} />
          </div>
        </div>
      </section>

      {/* 2 — Stacking plan */}
      <section aria-labelledby="availability" className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6">
        <SectionHeading id="availability" title="Unit Availability" caption="Each row is a floor, each cell a unit. Select a unit for its sheet, or a floor to see it in 3D." />
        {site.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Building">
            {site.map((b) => (
              <button
                key={b.id}
                onClick={() => x.selectBuilding(b.id)}
                aria-pressed={b.id === building.id}
                className={clsx(
                  "border px-3 py-1.5 text-xs transition-colors duration-300",
                  b.id === building.id ? "border-ink bg-ink text-paper" : "border-plaster text-ash hover:text-ink"
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
        <StackingPlan slug={project.slug} status={project.status} building={building} metrics={metrics} onShowFloor={showFloor} onEnquire={enquire} />
      </section>

      {/* 3 — Enquiry */}
      <section aria-labelledby="enquire" className="mx-auto w-full max-w-[1600px] scroll-mt-20 px-4 pb-16 pt-12 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="enquire" className="font-serif text-3xl text-ink sm:text-4xl">
              Request Pro Forma / Book Viewing
            </h2>
            <p className="mt-3 max-w-md text-ash">
              Get the full development appraisal for {project.name}, or arrange a guided viewing of the marketing suite and show apartment.
            </p>
          </div>
          <EnquiryForm projectName={project.name} unitCode={enquiryUnit} />
        </div>
      </section>
    </>
  );
}
