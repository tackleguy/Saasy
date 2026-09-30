import { FLAGSHIP, PROJECTS } from "@/content/projects";
import CinematicTour from "@/components/explorer/CinematicTour";

/**
 * /tour — self-running cinematic reel of every project, rendered live.
 * Lives outside the (site) group so the scene fills the viewport.
 */
export const metadata = { title: "Live reel" };

export default function TourPage() {
  const ordered = [FLAGSHIP, ...PROJECTS.filter((p) => p.slug !== FLAGSHIP.slug)];
  return <CinematicTour projects={ordered} startSlug={FLAGSHIP.slug} />;
}
