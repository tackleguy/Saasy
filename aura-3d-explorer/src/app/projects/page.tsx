import type { Metadata } from "next";
import { PROJECTS } from "@/content/projects";
import ProjectGrid from "@/components/portfolio/ProjectGrid";

export const metadata: Metadata = {
  title: "Projects",
  description: "Developments presented with AURA — live 3D, stacking plans and a developer-grade pro forma for every project.",
  openGraph: { images: [PROJECTS[0].heroImages[0].src] },
};

export default function ProjectsPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-5xl text-ink sm:text-6xl">Projects</h1>
          <p className="mt-2 max-w-xl text-ash">Residential, hospitality, workplace and mixed-use developments. Every project opens into a live 3D model and pro forma.</p>
        </div>
        <p className="caption">{PROJECTS.length} projects · sample portfolio</p>
      </header>
      <ProjectGrid projects={PROJECTS} />
    </div>
  );
}
