import type { Metadata } from "next";
import { PROJECTS } from "@/content/projects";
import ProjectIndex from "@/components/portfolio/ProjectIndex";

export const metadata: Metadata = {
  title: "Projects",
  description: "Developments presented with AURA — live 3D, stacking plans and a developer-grade pro forma for every project.",
  openGraph: { images: [PROJECTS[0].heroImages[0].src] },
};

export default function ProjectsPage() {
  const cities = new Set(PROJECTS.map((p) => p.city.split(",").pop()?.trim())).size;
  return (
    <div className="shell pb-24 pt-12 sm:pt-20">
      <header className="mb-12 grid gap-8 lg:grid-cols-12 lg:items-end">
        <h1 className="font-serif text-display-xl text-ink lg:col-span-7">Projects</h1>
        <div className="lg:col-span-4 lg:col-start-9">
          <p className="max-w-md text-[15px] leading-relaxed text-ash">
            Residential, hospitality, workplace and mixed-use developments. Every project opens into a live 3D model, a stacking plan and a
            developer-grade pro forma.
          </p>
          <p className="mt-4 text-[13px] tabular-nums text-ink">
            {PROJECTS.length} projects · {cities} {cities === 1 ? "region" : "regions"} · sample portfolio
          </p>
        </div>
      </header>
      <h2 className="sr-only">All projects</h2>
      <ProjectIndex projects={PROJECTS} />
    </div>
  );
}
