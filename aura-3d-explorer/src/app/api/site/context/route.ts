import { validateMapSnapshot, type MapFeature, type MapSnapshot } from "@/lib/geographicContext";
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
export async function GET() {
  return Response.json({ error: "Live coordinate lookups are disabled. Project pins stay on this device; use a downloaded map area." }, { status: 503 });
}
