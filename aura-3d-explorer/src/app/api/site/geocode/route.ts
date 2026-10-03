const cache = new Map<string, { expires: number; results: unknown[] }>();
let nextRequest = 0;
const AGENT = "AURA3D/1.0 (https://github.com/tackleguy/Saasy)";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 5 || q.length > 200) return Response.json({ error: "Enter a street address and city." }, { status: 400 });
  const key = q.toLowerCase();
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return Response.json({ results: saved.results });
  // Explicit submitted searches only; never autocomplete. A busy worker asks the user to retry.
  if (Date.now() < nextRequest) return Response.json({ error: "Address search is busy. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "2" } });
  nextRequest = Date.now() + 1100;
  try {
    const base = process.env.AURA_GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search";
    const url = new URL(base);
    url.search = new URLSearchParams({ q, format: "jsonv2", limit: "5", addressdetails: "1" }).toString();
    const response = await fetch(url, { headers: { "User-Agent": AGENT, "Accept": "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Address search is unavailable. Please retry shortly.");
    const data = await response.json() as { lat: string; lon: string; display_name: string; osm_type: string; osm_id: number }[];
    const results = data.map(r => ({ label: r.display_name, lat: Number(r.lat), lon: Number(r.lon), osmType: r.osm_type, osmId: r.osm_id }))
      .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && Math.abs(r.lat) <= 85);
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { results, expires: Date.now() + 86400000 });
    return Response.json({ results });
  } catch {
    return Response.json({ error: "Address search could not connect. Try again; your model is still available." }, { status: 502 });
  }
}
