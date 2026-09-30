import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, PROJECTS, projectSite } from "@/content/projects";
import { computeYield, DEFAULT_INPUTS } from "@/lib/finance";
import HeroCarousel from "@/components/project/HeroCarousel";
import KeyFacts from "@/components/project/KeyFacts";
import ProjectWorkspace from "@/components/project/ProjectWorkspace";

interface Params {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const project = getProject((await params).slug);
  if (!project) return {};
  const hero = project.heroImages[0];
  return {
    title: project.name,
    description: project.summary,
    openGraph: {
      title: `${project.name} — ${project.city}`,
      description: project.summary,
      images: [{ url: hero.src, width: 1600, height: 1000, alt: hero.alt }],
    },
    twitter: { card: "summary_large_image", images: [hero.src] },
  };
}

export default async function ProjectPage({ params }: Params) {
  const project = getProject((await params).slug);
  if (!project) notFound();

  // Estimated unit count from the default pro forma (server-side, pure).
  const units = projectSite(project).reduce((s, b) => s + computeYield(project.finance[b.id] ?? DEFAULT_INPUTS, b.floors).totalUnits, 0);

  return (
    <>
      <HeroCarousel project={project} />

      <section className="mx-auto grid w-full max-w-[1600px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="caption">{project.placeholder ? "Sample project" : "Project"}</p>
          <p className="mt-2 font-serif text-3xl leading-snug text-ink sm:text-[34px]">{project.summary}</p>
        </div>
        <KeyFacts project={project} units={units} />
      </section>

      <ProjectWorkspace project={project} />
    </>
  );
}
