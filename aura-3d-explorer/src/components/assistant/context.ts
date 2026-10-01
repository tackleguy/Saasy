/**
 * AURA assistant — compact grounding context.
 * -----------------------------------------------------------------------------
 * Builds a small JSON snapshot of what the user is looking at (project, site,
 * active building + floor, pro-forma yield) for a 3B local model with ~4k
 * tokens of context. Money is rounded to $M, percentages to one decimal.
 */
import type { AssistantRegistration } from "./AssistantBridge";
import { PROJECTS, projectSite, type Project } from "@/content/projects";
import { computeSite, computeYield, DEFAULT_INPUTS } from "@/lib/finance";
import { PHOTO_ANGLES } from "@/lib/explorer";
import { CITY_PRESETS } from "@/lib/cityPresets";
import { amenityFloors, amenityName } from "@/lib/amenities";
import { APARTMENT_SCHEMES, FURNITURE_COPY, FURNITURE_SETS, SCHEME_COPY } from "@/lib/apartmentFit";
import type { BuildingId, SiteMetrics, YieldMetrics } from "@/types";

const $m = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : `${n.toFixed(1)}%`);

function metricsSummary(m: YieldMetrics | SiteMetrics) {
  return {
    gdv: $m(m.gdv),
    totalCost: $m(m.totalDevelopmentCost),
    profit: $m(m.profit),
    profitOnCost: pct(m.profitOnCostPct),
    marginOnGdv: pct(m.marginOnGdvPct),
    equity: $m(m.equityRequired),
    units: m.totalUnits,
    ...("irrPct" in m ? { irr: pct(m.irrPct), equityMultiple: `${m.equityMultiple.toFixed(2)}x`, months: m.durationMonths } : {}),
  };
}

/** Yield metrics from the page's live yield engine, or the project defaults. */
function projectMetrics(project: Project, reg: AssistantRegistration) {
  if (reg.yieldCalc) return { byId: reg.yieldCalc.metricsById, site: reg.yieldCalc.site, live: true };
  const byId = Object.fromEntries(
    projectSite(project).map((b) => [b.id, computeYield(project.finance[b.id] ?? DEFAULT_INPUTS, b.floors)])
  ) as Record<BuildingId, YieldMetrics>;
  return { byId, site: computeSite(Object.values(byId)), live: false };
}

export function buildAssistantContext(reg: AssistantRegistration, pathname: string) {
  const x = reg.explorer ?? null;
  const project = reg.project ?? null;
  const ctx: Record<string, unknown> = { page: pathname };

  if (!project) {
    ctx.portfolio = PROJECTS.map((p) => ({ slug: p.slug, name: p.name, city: p.city, status: p.status }));
    ctx.note = "No project open on this page. All projects are illustrative sample placeholders.";
  } else {
    const metrics = projectMetrics(project, reg);
    ctx.project = {
      name: project.name,
      placeholder: project.placeholder,
      city: project.city,
      status: project.status,
      completion: project.completion,
      siteAreaSqFt: project.siteAreaSqFt,
      gfaSqFt: project.gfaSqFt,
      programMixPct: project.programMix,
      summary: project.summary.slice(0, 280),
    };
    const site = x?.site ?? projectSite(project);
    ctx.buildings = site.map((b) => ({
      id: b.id,
      name: b.name,
      floors: b.floors.length,
      tagline: b.tagline,
      zones: Object.fromEntries(Object.entries(b.zones).map(([z, g]) => [z, `${g.floors[0]}-${g.floors[1]}`])),
      // Shared amenity floors (not sold), e.g. "75: Infinity Pool (pool)" — for "take me to the pool".
      ...(amenityFloors(b).length ? { amenities: amenityFloors(b).map((f) => `${f.number}: ${amenityName(f)} (${f.amenity})`) } : {}),
      yield: metrics.byId[b.id] ? metricsSummary(metrics.byId[b.id]) : undefined,
    }));
    ctx.siteYield = metricsSummary(metrics.site);
    ctx.yieldSource = metrics.live ? "live yield engine on this page (user inputs)" : "project default pro-forma";
  }

  if (x) {
    ctx.explorer = {
      activeBuilding: x.building?.id,
      activeBuildingFloors: x.building?.floors?.length,
      selectedFloor: x.selectedFloor
        ? { number: x.selectedFloor.number, zone: x.selectedFloor.zone, ...(x.selectedFloor.amenity ? { amenity: amenityName(x.selectedFloor) } : {}) }
        : null,
      ...(x.selectedFloor && (x.selectedFloor.zone === "residential" || x.selectedFloor.zone === "crown") && !x.selectedFloor.amenity && x.selectedFit
        ? { floorFit: { scheme: x.selectedFit.scheme, furniture: x.selectedFit.furniture } }
        : {}),
      explosion: Number((x.explosion ?? 0).toFixed(2)),
      xray: x.xray,
      walking: x.walking,
      photoAngle: x.photoAngle ?? null,
      city: x.city,
    };
    ctx.options = {
      photoAngles: PHOTO_ANGLES.map((a) => a.id),
      cities: CITY_PRESETS.map((c) => c.id),
      apartmentSchemes: APARTMENT_SCHEMES.map((id) => ({ id, label: SCHEME_COPY[id].label, blurb: SCHEME_COPY[id].blurb })),
      furnitureSets: FURNITURE_SETS.map((id) => ({ id, label: FURNITURE_COPY[id].label, blurb: FURNITURE_COPY[id].blurb })),
    };
  } else {
    ctx.explorer = null;
  }
  return ctx;
}
