import { isProjectLocation, validateMapSnapshot, type MapFeature, type MapSnapshot } from "@/lib/geographicContext";
import { guardRequest } from "@/lib/apiGuard";
import { readJsonObject, RequestBodyError } from "@/lib/requestBody";
import { currentMember } from "@/lib/supabase/server";
interface Element { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }
const cache = new Map<string, { expires: number; data: MapSnapshot }>();
const pending = new Map<string, Promise<MapSnapshot>>();
function metres(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number * (/ft|feet|'/i.test(value) ? .3048 : 1) : undefined;
}
async function context(lat: number, lon: number): Promise<MapSnapshot> {
  const radius = 650, at = `(around:${radius},${lat},${lon})`;
  const query = `[out:json][timeout:20];(way[building]${at};way[highway][highway!~"motorway|motorway_link"][tunnel!=yes][bridge!=yes]${at};way[natural=water]${at};way[waterway=riverbank]${at};way[leisure=park]${at};);out geom;`;
  const response = await fetch(process.env.AURA_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AURA3D/1.0 (https://github.com/tackleguy/Saasy)" },
    body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error("Map provider unavailable");
  const raw = await response.json() as { elements: Element[]; remark?: string };
  if (!Array.isArray(raw.elements) || raw.remark) throw new Error("Incomplete map data");
  const features: MapFeature[] = [];
  for (const el of raw.elements.slice(0, 2500)) {
    const tags = el.tags ?? {}, geo = el.geometry ?? [];
    if (geo.length < 2 || geo.length > 1500 || geo.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) continue;
    const kind: MapFeature["kind"] = tags.building ? "building" : tags.highway ? "road" : tags.leisure === "park" ? "park" : "water";
    const points: [number, number][] = geo.map(p => [p.lon, p.lat]);
    if (kind !== "road" && (points.length < 4 || points[0][0] !== points.at(-1)![0] || points[0][1] !== points.at(-1)![1])) continue;
    const height = metres(tags.height), levels = Number.parseFloat(tags["building:levels"] ?? "");
    features.push({ id: `way/${el.id}`, kind,
      geometry: kind === "road" ? { type: "LineString", coordinates: points } : { type: "Polygon", coordinates: [points] },
      ...(kind === "building" ? { height: Math.min(1000, height ?? (Number.isFinite(levels) && levels > 0 ? levels * 3.2 : 0)), heightSource: height ? "recorded" : levels > 0 ? "levels" : "unknown" } : {}),
      ...(tags.name ? { name: tags.name.slice(0,160).replace(/[\u0000-\u001f\u007f]/g, "") } : {}),
    });
  }
  if (!features.length) throw new Error("No mapped geometry in this area");
  const north = radius / 111320, east = north / Math.cos(lat * Math.PI / 180);
  const snapshot = validateMapSnapshot({ id: `site-${lat.toFixed(5)}-${lon.toFixed(5)}`, label: "Address surroundings", features,
    bounds: [Math.max(-180, lon-east), Math.max(-85, lat-north), Math.min(180, lon+east), Math.min(85, lat+north)],
    capturedAt: new Date().toISOString(), attribution: "© OpenStreetMap contributors · ODbL", sourceUrl: "https://www.openstreetmap.org/copyright" });
  if (!snapshot) throw new Error("Unsupported map geometry");
  return snapshot;
}
/**
 * POST { projectId } — signed-in owners only (docs/DECISIONS.md D-06). Looks up
 * the surroundings of the project's saved address on OpenStreetMap (Overpass),
 * after the owner pressed "Load surroundings", and stores the snapshot with the
 * project so viewers and share links never trigger another lookup. Anonymous
 * visitors and sample projects keep using the bundled map areas.
 */
export async function POST(request: Request) {
  const blocked = guardRequest(request, "site-context", { limit: 10, windowMs: 60 * 60_000 });
  if (blocked) return blocked;
  const member = await currentMember();
  if (!member?.org) return Response.json({ error: "Sign in to load a project's surroundings." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await readJsonObject(request, 2_000); }
  catch (error) { return Response.json({ error: error instanceof RequestBodyError ? error.message : "Could not read the request." }, { status: 400 }); }
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  // Row-level security: only a project in the member's own organization is found.
  const { data: row } = await member.supabase.from("projects").select("id, data").eq("id", projectId).maybeSingle();
  const location = (row?.data as { location?: unknown } | undefined)?.location;
  if (!row || !isProjectLocation(location)) return Response.json({ error: "Save the project's address first." }, { status: 400 });
  const key = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
  try {
    let snapshot = cache.get(key)?.expires! > Date.now() ? cache.get(key)!.data : undefined;
    if (!snapshot) {
      let job = pending.get(key);
      if (!job) { job = context(location.latitude, location.longitude); pending.set(key, job); }
      try { snapshot = await job; } finally { pending.delete(key); }
      cache.set(key, { data: snapshot, expires: Date.now() + 86_400_000 });
    }
    const { error } = await member.supabase.from("projects").update({ site_snapshot: snapshot, site_snapshot_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return Response.json({ error: "The surroundings loaded but could not be saved. Try again." }, { status: 500 });
    return Response.json({ snapshot });
  } catch (error) {
    const message = error instanceof Error && /No mapped geometry/.test(error.message)
      ? "OpenStreetMap has no buildings or streets mapped around this address."
      : "OpenStreetMap could not be reached. Try again in a minute; your project is unchanged.";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({ error: "Use POST with a projectId (signed-in owners only)." }, { status: 405 });
}
