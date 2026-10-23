import type { Project } from "@/content/projects";
import { proforma } from "@/lib/finance";
import type { CityId } from "@/lib/cityPresets";
import type { ProjectLocation } from "@/lib/geographicContext";

/**
 * A new customer project starts as one editable 24-storey mixed-use tower with
 * the default pro forma. The owner then sets the address, edits the massing
 * (or uploads their own model) and replaces the figures.
 */
export function newProjectDocument({ name, slug, city, backdrop, location }: { name: string; slug: string; city: string; backdrop: CityId; location: ProjectLocation | null }): Project & { location?: ProjectLocation } {
  return {
    slug,
    name,
    placeholder: false,
    client: "",
    architect: "",
    city,
    backdrop,
    status: "Concept",
    completion: "",
    summary: "",
    siteAreaSqFt: 40_000,
    gfaSqFt: 260_000,
    programMix: { podium: 8, office: 17, residential: 67, crown: 8 },
    heroImages: [],
    palette: { sky: "#dfe6e8", ground: "#d8d0c2", accent: "#9C7A52" },
    massing: [{
      id: "tower",
      name,
      short: name.split(/\s+/).slice(0, 2).join(" ").slice(0, 16) || "Tower",
      tagline: "24-storey mixed-use tower",
      position: [0, 0],
      floors: { podium: 2, office: 4, residential: 16, crown: 2 },
      footprint: { podium: [13, 11], office: [11, 10], residential: [10, 9], crown: [8, 7] },
      coreSize: 2.4,
      facade: { finSpacing: 1, balconies: true, arches: false },
    }],
    finance: { tower: proforma(260_000, 1_250, 600) },
    ...(location ? { location } : {}),
  };
}
