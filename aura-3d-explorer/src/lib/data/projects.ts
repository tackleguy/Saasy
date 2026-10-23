/**
 * One way to load "a project", whether it is a public sample or a customer's.
 * Both are the same document (`Project`, see src/content/projects.ts) stored
 * in `projects.data`; customer projects add their id, organization, real
 * address and an optional uploaded model.
 *
 * Without Supabase configured, the public portfolio comes from the bundled
 * sample content (identical to the seed migration), so the site keeps working.
 */
import { PROJECTS, type Project } from "@/content/projects";
import { isProjectLocation, validateMapSnapshot, type MapSnapshot, type ProjectLocation } from "@/lib/geographicContext";
import { CITY_PRESETS, type CityId } from "@/lib/cityPresets";
import type { ProjectStatus } from "@/types";

/** A customer project as stored: the sample-shaped document plus ownership and site. */
export interface StoredProject {
  id: string;
  orgId: string | null;
  slug: string;
  isPublic: boolean;
  project: Project;
  /** Saved real address pin (customer projects). */
  location: ProjectLocation | null;
  /** OpenStreetMap surroundings fetched for that address, if the owner loaded them. */
  siteSnapshot: MapSnapshot | null;
  modelPath: string | null;
  updatedAt: string | null;
}

const STATUSES: ProjectStatus[] = ["Concept", "Approved", "Under Construction", "Selling"];
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Rebuild a `Project` from untrusted stored JSON, filling safe defaults. */
export function projectFromDocument(data: unknown, fallbackSlug: string): Project | null {
  if (!record(data)) return null;
  const massing = Array.isArray(data.massing) ? data.massing : [];
  if (!massing.length) return null;
  const backdrop = CITY_PRESETS.some((c) => c.id === data.backdrop) ? (data.backdrop as CityId) : "generic";
  return {
    slug: typeof data.slug === "string" ? data.slug : fallbackSlug,
    name: typeof data.name === "string" ? data.name : "Untitled project",
    placeholder: data.placeholder === true,
    client: typeof data.client === "string" ? data.client : "",
    architect: typeof data.architect === "string" ? data.architect : "",
    city: typeof data.city === "string" ? data.city : "",
    backdrop,
    status: STATUSES.includes(data.status as ProjectStatus) ? (data.status as ProjectStatus) : "Concept",
    completion: typeof data.completion === "string" ? data.completion : "",
    summary: typeof data.summary === "string" ? data.summary : "",
    siteAreaSqFt: Number.isFinite(data.siteAreaSqFt) ? Number(data.siteAreaSqFt) : 0,
    gfaSqFt: Number.isFinite(data.gfaSqFt) ? Number(data.gfaSqFt) : 0,
    programMix: (record(data.programMix) ? data.programMix : { podium: 10, office: 20, residential: 60, crown: 10 }) as Project["programMix"],
    heroImages: Array.isArray(data.heroImages) ? (data.heroImages as Project["heroImages"]).filter((i) => i && typeof i.src === "string" && typeof i.alt === "string") : [],
    palette: (record(data.palette) ? data.palette : { sky: "#dfe6e8", ground: "#d8d0c2", accent: "#9C7A52" }) as Project["palette"],
    massing: massing as Project["massing"],
    finance: (record(data.finance) ? data.finance : {}) as Project["finance"],
    flagship: data.flagship === true,
  };
}

export function storedProjectFromRow(row: { id: string; org_id: string | null; slug: string; is_public: boolean; data: unknown; model_path?: string | null; site_snapshot?: unknown; updated_at?: string | null }): StoredProject | null {
  const project = projectFromDocument(row.data, row.slug);
  if (!project) return null;
  const doc = record(row.data) ? row.data : {};
  return {
    id: row.id, orgId: row.org_id, slug: row.slug, isPublic: row.is_public, project,
    location: isProjectLocation(doc.location) ? doc.location : null,
    siteSnapshot: row.site_snapshot ? validateMapSnapshot(row.site_snapshot) : null,
    modelPath: row.model_path ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** The document written back to `projects.data` (location travels inside it). */
export function documentFromProject(project: Project, location: ProjectLocation | null): Record<string, unknown> {
  return { ...project, ...(location ? { location } : {}) };
}

/** URL-safe slug from a project or organization name. */
export function slugify(name: string, max = 60): string {
  const slug = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
  return slug || "project";
}

/** Public portfolio, sample content when no database is configured. */
export const SAMPLE_PROJECTS: Project[] = PROJECTS;
