"use client";
/**
 * ProjectWorkspace — the interactive part of a project page:
 *   1. live 3D presentation (project defaults)
 *   2. unit-availability stacking plan (linked to the explorer)
 *   3. "Request Pro Forma / Book Viewing" enquiry
 *   4. development appraisal and financial controls
 * All four share one explorer and one yield state, so choosing a unit can
 * fly the camera to its floor and pre-fill the enquiry.
 */
import { useCallback, useState } from "react";
import clsx from "clsx";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { useExplorer } from "@/hooks/useExplorer";
import { useYieldCalculator } from "@/hooks/useYieldCalculator";
import { useRegisterExplorer } from "@/components/assistant/AssistantBridge";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";
import FinancialSidebar from "@/components/ui/FinancialSidebar";
import CommissionModelCard from "@/components/ui/CommissionModelCard";
import FinancialChart from "@/components/ui/FinancialChart";
import SensitivityTable from "@/components/ui/SensitivityTable";
import StackingPlan, { type UnitInfo } from "./StackingPlan";
import EnquiryForm from "./EnquiryForm";
import SectionHeading from "@/components/site/SectionHeading";

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}

export default function ProjectWorkspace({ project }: { project: Project }) {
  const site = projectSite(project);
  const yieldCalc = useYieldCalculator(site, project.finance);
  const x = useExplorer(site, { city: project.backdrop, projectSlug: project.slug });
  useRegisterExplorer(x, { project, yieldCalc }); // lets the AURA assistant see + drive this explorer
  const [enquiryUnit, setEnquiryUnit] = useState<string | null>(null);

  const building = x.building;
  const metrics = yieldCalc.metricsById[building.id];

  const showFloor = useCallback(
    (floorIndex: number) => {
      x.setExplosion((e) => Math.max(e, 1));
      x.selectFloor(building.floors[floorIndex]);
      scrollToSection("explore");
    },
    [x, building]
  );

  const enquire = useCallback((u: UnitInfo) => {
    setEnquiryUnit(u.code);
    scrollToSection("enquire");
  }, []);

  return (
    <>
      {/* 1 — Architecture leads; the appraisal has its own section below. */}
      <section aria-labelledby="explore" className="shell pb-20 sm:pb-28">
        <SectionHeading id="explore" title="Explore in 3D" size="md" className="mb-8 sm:mb-10">
          Explore the architecture from every angle. Choose a building, open a floor and step inside.
        </SectionHeading>
        <ExplorerViewport explorer={x} metricsById={yieldCalc.metricsById} intro={false} className="h-[70dvh] min-h-[460px] sm:min-h-[560px] lg:min-h-[640px]" />
        <div className="flex flex-col gap-6 border-b border-plaster py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="font-serif text-2xl leading-tight text-ink sm:text-3xl">{project.name}</p>
            <p className="mt-1.5 text-sm text-ash">{project.city}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href="#availability" className="btn-primary min-h-11">View unit availability</a>
            <a href="#appraisal" className="link-draw inline-flex min-h-11 items-center text-sm text-ash hover:text-ink">Development appraisal</a>
          </div>
        </div>
        {project.placeholder && <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ash">Sample project. Architecture, imagery and figures are illustrative.</p>}
      </section>

      {/* 2 — Stacking plan */}
      <section aria-labelledby="availability" className="shell pb-20 sm:pb-28">
        <SectionHeading id="availability" title="Unit availability" size="md" className="mb-10">
          Find a unit, review its details and explore its floor in 3D. The availability shown is sample data.
        </SectionHeading>
        {site.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Building">
            {site.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => x.selectBuilding(b.id)}
                aria-pressed={b.id === building.id}
                className={clsx(
                  "min-h-11 border px-4 py-2.5 text-[13px] transition-colors duration-300",
                  b.id === building.id ? "border-ink bg-ink text-paper" : "border-plaster text-ink hover:border-ink/50"
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
        <StackingPlan slug={project.slug} status={project.status} building={building} metrics={metrics} onShowFloor={showFloor} onEnquire={enquire} />
      </section>

      {/* 3 — Enquiry follows unit selection directly. */}
      <section aria-labelledby="enquire" className="bg-stone">
        <div className="shell grid gap-10 py-16 sm:py-24 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 id="enquire" className="font-serif text-display-md text-ink">
              Request more information.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ash">
              Choose a viewing enquiry or a pro forma for {project.name}. This demo form does not send a request.
            </p>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <EnquiryForm projectName={project.name} unitCode={enquiryUnit} />
          </div>
        </div>
      </section>

      {/* 4 — Complete development tools remain available, after the buyer journey. */}
      <section aria-labelledby="appraisal" className="shell py-20 sm:py-28">
        <SectionHeading id="appraisal" title="Development appraisal" size="md" className="mb-10">
          Adjust the assumptions and review the pro forma for {project.name}. Figures update with your selections.
        </SectionHeading>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-8">
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
            onFocusZone={(zone) => { x.focusZone(zone); scrollToSection("explore"); }}
          />
          <div className="min-w-0 space-y-6">
            <FinancialChart metrics={metrics} buildingName={building.name} />
            <SensitivityTable inputs={yieldCalc.inputsById[building.id]} floors={building.floors} buildingName={building.short} />
            <CommissionModelCard metrics={metrics} site={yieldCalc.site} buildingName={building.short} />
          </div>
        </div>
      </section>

    </>
  );
}
