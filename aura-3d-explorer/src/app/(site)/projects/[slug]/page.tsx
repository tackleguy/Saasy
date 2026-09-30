import type { Metadata } from "next";
import Link from "next/link";
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

const SECTIONS = [
  { href: "#overview", label: "Overview" },
  { href: "#explore", label: "Explore in 3D" },
  { href: "#availability", label: "Availability" },
  { href: "#enquire", label: "Enquire" },
];

export default async function ProjectPage({ params }: Params) {
  const project = getProject((await params).slug);
  if (!project) notFound();

  // Estimated unit count from the default pro forma (server-side, pure).
  const units = projectSite(project).reduce((s, b) => s + computeYield(project.finance[b.id] ?? DEFAULT_INPUTS, b.floors).totalUnits, 0);

  // Next project in the portfolio, for the closing link.
  const i = PROJECTS.findIndex((p) => p.slug === project.slug);
  const next = PROJECTS[(i + 1) % PROJECTS.length];

  return (
    <>
      <HeroCarousel project={project} />

      {/* In-page navigation — sticks under the site header */}
      <nav aria-label="On this page" className="no-print sticky top-16 z-30 border-b border-plaster bg-paper/90 backdrop-blur-md">
        <div className="shell no-scrollbar flex items-center gap-6 overflow-x-auto">
          <ul className="flex shrink-0 gap-6">
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <a href={s.href} className="block whitespace-nowrap py-3.5 text-[13px] text-ash transition-colors hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <a href="#enquire" className="btn-primary ml-auto hidden shrink-0 py-2 text-[13px] sm:inline-flex">
            Request pro forma
          </a>
        </div>
      </nav>

      <section id="overview" aria-label="Overview" className="shell grid scroll-mt-32 gap-12 py-16 sm:py-24 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="font-serif text-display-sm text-ink">{project.summary}</p>
          {project.placeholder && <p className="mt-6 text-[13px] text-ash">Sample project: names, imagery and figures are illustrative.</p>}
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <KeyFacts project={project} units={units} />
        </div>
      </section>

      <ProjectWorkspace project={project} />

      {next && next.slug !== project.slug && (
        <section aria-label="Next project" className="border-t border-plaster">
          <Link href={`/projects/${next.slug}`} className="group shell flex flex-wrap items-end justify-between gap-4 py-14 sm:py-20">
            <span>
              <span className="block text-[13px] text-ash">Next project</span>
              <span className="mt-2 block font-serif text-display-lg text-ink transition-transform duration-500 ease-calm group-hover:translate-x-2">
                {next.name}
              </span>
            </span>
            <span className="text-[13px] text-ash">
              {next.city} · {next.status} <span aria-hidden>→</span>
            </span>
          </Link>
        </section>
      )}
    </>
  );
}
