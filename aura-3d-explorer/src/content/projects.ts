/**
 * Portfolio content — sample projects.
 * -----------------------------------------------------------------------------
 * ALL NAMES, CLIENTS, ARCHITECTS AND FIGURES ARE PLACEHOLDERS modelled loosely
 * on archviz reference imagery; every project carries `placeholder: true` and
 * the UI labels it "Sample project". Replace with real projects before launch.
 *
 * Each project defines:
 *   • content  — name, client / architect, city, status, key facts, program mix
 *   • imagery  — hero renders under /public/projects/<slug>/ (placeholders ship)
 *   • massing  — one ProjectMassing per building, rendered live in 3D
 *   • finance  — default pro-forma inputs per building (see lib/finance `proforma`)
 */
import type { Building, BuildingId, ProjectImage, ProjectStatus, YieldInputs, ZoneId } from "@/types";
import { buildingFromMassing, buildSite, type ProjectMassing } from "@/lib/tower";
import { proforma } from "@/lib/finance";

export interface Project {
  slug: string;
  name: string;
  /** True for sample content — shown as "Sample project" in the UI. */
  placeholder: boolean;
  client: string;
  architect: string;
  city: string;
  status: ProjectStatus;
  completion: string;
  summary: string;
  siteAreaSqFt: number;
  gfaSqFt: number;
  /** Share of GFA by programme, percent. */
  programMix: Record<ZoneId, number>;
  heroImages: ProjectImage[];
  /** Palette hint used by the placeholder renders and accents. */
  palette: { sky: string; ground: string; accent: string };
  massing: ProjectMassing[];
  /** Default pro-forma inputs per building id. */
  finance: Record<BuildingId, YieldInputs>;
  /** The flagship project drives the landing hero and the Studio. */
  flagship?: boolean;
}

/** Three hero renders per project: /projects/<slug>/hero-{1,2,3}.jpg */
const heroes = (slug: string, name: string, shots: [string, string, string]): ProjectImage[] =>
  shots.map((shot, i) => ({ src: `/projects/${slug}/hero-${i + 1}.jpg`, alt: `${name} — ${shot}` }));

/** Compact zone helpers for the massing definitions below. */
const sq = (s: number): [number, number] => [s, s];

export const PROJECTS: Project[] = [
  {
    slug: "meridian-tower",
    name: "The Meridian Tower",
    placeholder: true,
    client: "AURA Development",
    architect: "AURA Studio",
    city: "Jersey City, NJ",
    status: "Selling",
    completion: "Q4 2028",
    summary:
      "A twisting 20-storey mixed-use tower on the waterfront with three companions — a counter-twisting 30-storey spire, a 10-storey residential block and the 100-storey Meridian Pinnacle rising behind them — around stone-arcaded podiums.",
    siteAreaSqFt: 148_000,
    gfaSqFt: 1_573_000,
    programMix: { podium: 6, office: 30, residential: 56, crown: 8 },
    heroImages: heroes("meridian-tower", "The Meridian Tower", ["waterfront at golden hour", "podium arcade", "sky penthouse living room"]),
    palette: { sky: "#dfe6e8", ground: "#d8d0c2", accent: "#9C7A52" },
    flagship: true,
    massing: [
      {
        id: "meridian",
        name: "The Meridian",
        short: "Meridian",
        tagline: "20-storey twisting mixed-use tower",
        position: [0, 0],
        floors: { podium: 1, office: 6, residential: 11, crown: 2 },
        footprint: { podium: sq(12), office: sq(10), residential: sq(8.5), crown: sq(6.5) },
        twistDeg: 3.5,
        coreSize: 2.4,
        facade: { finSpacing: 1.0, balconies: true, arches: true },
      },
      {
        id: "spire",
        name: "Meridian Spire",
        short: "Spire",
        tagline: "30-storey counter-twisting landmark",
        position: [17, -17],
        floors: { podium: 1, office: 10, residential: 16, crown: 3 },
        footprint: { podium: sq(11), office: sq(9), residential: sq(7.5), crown: sq(5.5) },
        twistDeg: -2.5,
        coreSize: 2.1,
        facade: { finSpacing: 0.75 },
      },
      {
        id: "lofts",
        name: "Meridian Lofts",
        short: "Lofts",
        tagline: "10-storey residential courtyard block",
        position: [-17, 16],
        floors: { podium: 1, office: 2, residential: 6, crown: 1 },
        footprint: { podium: [14, 10], office: [13, 9], residential: [12, 8.5], crown: [9, 6.5] },
        coreSize: 2.6,
        facade: { finSpacing: 1.3, balconies: true, arches: true },
      },
      {
        id: "pinnacle",
        name: "Meridian Pinnacle",
        short: "Pinnacle",
        tagline: "100-storey tapering supertall",
        position: [-21, -21],
        floors: { podium: 1, office: 24, residential: 71, crown: 4 },
        footprint: { podium: sq(16), office: sq(13), residential: sq(11.5), crown: sq(6) },
        twistDeg: 1.1,
        taper: 0.55,
        coreSize: 3.4,
        facade: { finSpacing: 0.55, balconies: false, arches: true },
      },
    ],
    finance: {
      meridian: proforma(120_000, 1_450, 650, "balanced"),
      spire: proforma(185_000, 1_650, 720, "luxury_heavy"),
      lofts: proforma(68_000, 1_150, 560, "balanced"),
      pinnacle: proforma(1_200_000, 1_850, 780, "luxury_heavy", { termMonths: 54, absorptionUnitsPerMonth: 14, softCostPct: 20 }),
    },
  },
  {
    slug: "seaform-hotel",
    name: "Seaform Hotel",
    placeholder: true,
    client: "Coastline Hospitality (placeholder)",
    architect: "Studio Littoral (placeholder)",
    city: "Miami Beach, FL",
    status: "Approved",
    completion: "Q2 2029",
    summary: "Waterfront hospitality with sweeping curved balcony bands; every key has a sea view and a private terrace.",
    siteAreaSqFt: 48_000,
    gfaSqFt: 162_000,
    programMix: { podium: 12, office: 8, residential: 72, crown: 8 },
    heroImages: heroes("seaform-hotel", "Seaform Hotel", ["curved balconies from the beach", "lobby lounge", "suite terrace"]),
    palette: { sky: "#e3eaec", ground: "#e8dfd0", accent: "#8E9E86" },
    massing: [
      {
        id: "seaform",
        name: "Seaform Hotel",
        short: "Seaform",
        tagline: "16-storey hotel with curved balcony bands",
        position: [0, 0],
        floors: { podium: 1, office: 2, residential: 12, crown: 1 },
        footprint: { podium: [16, 11], office: [15, 10], residential: [14, 9], crown: [11, 8] },
        facade: { finSpacing: 0, balconies: true, arches: false },
      },
    ],
    finance: { seaform: proforma(162_000, 1_380, 690, "luxury_heavy") },
  },
  {
    slug: "chess-towers",
    name: "Chess Towers",
    placeholder: true,
    client: "Northgate Capital (placeholder)",
    architect: "Fluted Office Architects (placeholder)",
    city: "Chicago, IL",
    status: "Under Construction",
    completion: "Q1 2028",
    summary: "Twin fluted office towers on a shared podium — tight bronze fins give the facades a pleated, chess-piece silhouette.",
    siteAreaSqFt: 72_000,
    gfaSqFt: 410_000,
    programMix: { podium: 6, office: 82, residential: 7, crown: 5 },
    heroImages: heroes("chess-towers", "Chess Towers", ["twin towers from the river", "fluted facade detail", "sky lobby"]),
    palette: { sky: "#e4e7ea", ground: "#d5d1c9", accent: "#8B6B44" },
    massing: ["a", "b"].map((k, i) => ({
      id: `chess-${k}`,
      name: `Chess Tower ${k.toUpperCase()}`,
      short: `Tower ${k.toUpperCase()}`,
      tagline: `${i === 0 ? 24 : 21}-storey fluted office tower`,
      position: (i === 0 ? [-8, 8] : [9, -9]) as [number, number],
      floors: { podium: 1, office: i === 0 ? 20 : 17, residential: 2, crown: 1 },
      footprint: { podium: sq(11), office: sq(9), residential: sq(8.5), crown: sq(7) },
      facade: { finSpacing: 0.45 },
    })),
    finance: {
      "chess-a": proforma(220_000, 1_150, 610, "commercial_focus"),
      "chess-b": proforma(190_000, 1_120, 600, "commercial_focus"),
    },
  },
  {
    slug: "infiniti",
    name: "Infiniti",
    placeholder: true,
    client: "Harbourline Estates (placeholder)",
    architect: "Facet Partners (placeholder)",
    city: "Dubai, UAE",
    status: "Selling",
    completion: "Q3 2029",
    summary: "Three faceted residential towers rising straight out of the water, their gently turning plates catching the evening sun.",
    siteAreaSqFt: 120_000,
    gfaSqFt: 610_000,
    programMix: { podium: 5, office: 5, residential: 80, crown: 10 },
    heroImages: heroes("infiniti", "Infiniti", ["three towers from the water", "marina promenade", "sky residence"]),
    palette: { sky: "#f0e6d6", ground: "#e6dccb", accent: "#B89A5C" },
    massing: [28, 34, 31].map((floors, i) => ({
      id: `infiniti-${i + 1}`,
      name: `Infiniti ${["I", "II", "III"][i]}`,
      short: ["I", "II", "III"][i],
      tagline: `${floors}-storey faceted residential tower`,
      position: ([[-18, 14], [0, 0], [16, -18]] as [number, number][])[i],
      floors: { podium: 1, office: 1, residential: floors - 4, crown: 2 },
      footprint: { podium: sq(9), office: sq(8), residential: sq(7.2), crown: sq(6) },
      twistDeg: 1.5 * (i % 2 === 0 ? 1 : -1),
      facade: { finSpacing: 0.8, balconies: false },
    })),
    finance: {
      "infiniti-1": proforma(190_000, 1_900, 780, "luxury_heavy"),
      "infiniti-2": proforma(230_000, 2_050, 820, "luxury_heavy"),
      "infiniti-3": proforma(205_000, 1_950, 800, "luxury_heavy"),
    },
  },
  {
    slug: "refad-place",
    name: "REFAD Place",
    placeholder: true,
    client: "Refad Holdings (placeholder)",
    architect: "Timberline Studio (placeholder)",
    city: "Toronto, ON",
    status: "Concept",
    completion: "Q4 2030",
    summary: "A low, wide workplace wrapped in a rhythm of warm timber fins, stepping back to planted roof terraces.",
    siteAreaSqFt: 64_000,
    gfaSqFt: 215_000,
    programMix: { podium: 10, office: 78, residential: 6, crown: 6 },
    heroImages: heroes("refad-place", "REFAD Place", ["timber fins at dusk", "atrium", "roof terrace"]),
    palette: { sky: "#e7e9e4", ground: "#d9cfbf", accent: "#9C7A52" },
    massing: [
      {
        id: "refad",
        name: "REFAD Place",
        short: "REFAD",
        tagline: "12-storey timber-fin workplace",
        position: [0, 0],
        floors: { podium: 1, office: 9, residential: 1, crown: 1 },
        footprint: { podium: [18, 13], office: [16, 12], residential: [14, 10], crown: [11, 8] },
        facade: { finSpacing: 0.6 },
      },
    ],
    finance: { refad: proforma(215_000, 980, 560, "commercial_focus") },
  },
  {
    slug: "broadway-bayonne",
    name: "Broadway in Bayonne",
    placeholder: true,
    client: "Hudson Main Street LLC (placeholder)",
    architect: "Arcade & Co. (placeholder)",
    city: "Bayonne, NJ",
    status: "Approved",
    completion: "Q2 2028",
    summary: "Main-street mixed use: a brick-and-stone arcaded podium of shops beneath two storeys of offices and loft apartments.",
    siteAreaSqFt: 38_000,
    gfaSqFt: 118_000,
    programMix: { podium: 22, office: 18, residential: 54, crown: 6 },
    heroImages: heroes("broadway-bayonne", "Broadway in Bayonne", ["arcade on Broadway", "corner retail", "loft interior"]),
    palette: { sky: "#e8e5df", ground: "#d6c7b3", accent: "#a2694a" },
    massing: [
      {
        id: "broadway",
        name: "Broadway in Bayonne",
        short: "Broadway",
        tagline: "9-storey arcaded mixed-use block",
        position: [0, 0],
        floors: { podium: 1, office: 2, residential: 5, crown: 1 },
        footprint: { podium: [18, 12], office: [17, 11], residential: [16, 10.5], crown: [12, 8] },
        facade: { finSpacing: 1.2, arches: true },
      },
    ],
    finance: { broadway: proforma(118_000, 890, 470, "balanced") },
  },
  {
    slug: "lorenskog-quarter",
    name: "Lørenskog Quarter",
    placeholder: true,
    client: "Nordvik Bolig (placeholder)",
    architect: "Fjord Arkitekter (placeholder)",
    city: "Lørenskog, Norway",
    status: "Under Construction",
    completion: "Q3 2027",
    summary: "Two timber residential blocks around a planted courtyard, with deep balconies and a shared roof garden.",
    siteAreaSqFt: 54_000,
    gfaSqFt: 96_000,
    programMix: { podium: 8, office: 4, residential: 82, crown: 6 },
    heroImages: heroes("lorenskog-quarter", "Lørenskog Quarter", ["courtyard", "timber balconies", "family living room"]),
    palette: { sky: "#e5eaec", ground: "#dcd3c4", accent: "#8E9E86" },
    massing: [7, 8].map((floors, i) => ({
      id: `lorenskog-${i + 1}`,
      name: `Block ${i + 1}`,
      short: `Block ${i + 1}`,
      tagline: `${floors}-storey timber residential block`,
      position: (i === 0 ? [-9, 7] : [9, -8]) as [number, number],
      floors: { podium: 1, office: 1, residential: floors - 3, crown: 1 },
      footprint: { podium: [14, 10], office: [14, 10], residential: [14, 10], crown: [11, 8] },
      facade: { finSpacing: 1.1, balconies: true },
    })),
    finance: {
      "lorenskog-1": proforma(46_000, 820, 430, "balanced"),
      "lorenskog-2": proforma(50_000, 840, 440, "balanced"),
    },
  },
  {
    slug: "sports-world",
    name: "Sports World",
    placeholder: true,
    client: "Arena District Partners (placeholder)",
    architect: "Perforate Studio (placeholder)",
    city: "Madrid, Spain",
    status: "Concept",
    completion: "Q1 2031",
    summary: "A slender tower wrapped in a dense, perforated screen of fins over a sports-and-leisure podium.",
    siteAreaSqFt: 42_000,
    gfaSqFt: 188_000,
    programMix: { podium: 18, office: 32, residential: 42, crown: 8 },
    heroImages: heroes("sports-world", "Sports World", ["perforated tower", "sports hall", "club lounge"]),
    palette: { sky: "#e6e8ea", ground: "#d9d3c8", accent: "#6E6A63" },
    massing: [
      {
        id: "sports",
        name: "Sports World",
        short: "Sports",
        tagline: "22-storey perforated tower",
        position: [0, 0],
        floors: { podium: 1, office: 8, residential: 11, crown: 2 },
        footprint: { podium: sq(13), office: sq(10), residential: sq(10), crown: sq(8) },
        facade: { finSpacing: 0.4 },
      },
    ],
    finance: { sports: proforma(188_000, 1_050, 590, "balanced") },
  },
];

/* ----------------------------------------------------------------- lookups */

export function getProject(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export const FLAGSHIP: Project = PROJECTS.find((p) => p.flagship) ?? PROJECTS[0];

/** Generated 3D site (buildings + floor plates) for a project — memoised. */
const siteCache = new Map<string, Building[]>();
export function projectSite(project: Project): Building[] {
  let site = siteCache.get(project.slug);
  if (!site) siteCache.set(project.slug, (site = buildSite(project.massing.map(buildingFromMassing))));
  return site;
}

/** Total floors across a project's buildings. */
export const projectFloors = (project: Project) => project.massing.reduce((s, m) => s + Object.values(m.floors).reduce((a, b) => a + b, 0), 0);
