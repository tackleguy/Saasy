import { notFound } from "next/navigation";
import { getProject, PROJECTS } from "@/content/projects";
import RenderView from "@/components/explorer/RenderView";

/**
 * /render/[slug] — a bare, full-viewport 3D view used by
 * `scripts/capture-heroes.mjs` to photograph each project. Options come from
 * the query string, read on the client (see RenderView):
 *   angle    photo angle (waterfront | street | aerial | podium | skyline | drone)
 *   building building id on the site (defaults to the first)
 *   walk=1   stand inside `floor` at walk-through view `view`
 *   city     city backdrop id (new-york | miami | los-angeles | …), defaults to the project's
 */
export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}
export const metadata = { title: "Render", robots: { index: false } };

export default async function RenderPage({ params }: { params: Promise<{ slug: string }> }) {
  const project = getProject((await params).slug);
  if (!project) notFound();
  return <main><h1 className="sr-only">{project.name} render</h1><RenderView project={project} /></main>;
}
