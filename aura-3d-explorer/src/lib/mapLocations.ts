import sampleAddresses from "@/content/sample-sites.json";
import sites from "@/content/map-sites.json";
import type { CityId } from "./cityPresets";
import { geographicToWorld, isProjectLocation, type ProjectLocation } from "./geographicContext";

export const MAP_SITES = sites;
export function defaultMapLocation(city: CityId, projectSlug?: string): ProjectLocation {
  // Catalog pins have downloaded coverage and proposal/water regression checks.
  // A geocoded sample address is not a verified project site and must not silently
  // replace that audited default. Explicitly saved user pins always take priority.
  const projectSite = sites.find(s => s.city === city && projectSlug && s.projects.includes(projectSlug));
  if (projectSite) return { latitude: projectSite.latitude, longitude: projectSite.longitude, label: projectSite.label, example: true };
  const address = projectSlug && !sites.some(s => s.projects.includes(projectSlug)) ? (sampleAddresses as Record<string, {lat: number; lon: number; label: string}>)[projectSlug] : undefined;
  if (address) return { latitude: address.lat, longitude: address.lon, label: address.label, example: true };
  const site = sites.find(s => s.city === city && projectSlug && s.projects.includes(projectSlug))
    ?? sites.find(s => s.id === city) ?? sites.find(s => s.city === city) ?? sites[0];
  return { latitude: site.latitude, longitude: site.longitude, label: site.label, example: true };
}
export function mapCoverage(location: ProjectLocation): (typeof sites)[number] | undefined {
  if (!isProjectLocation(location)) return undefined;
  const distance = (site: (typeof sites)[number]) => Math.hypot(...geographicToWorld([site.longitude, site.latitude], location));
  return sites.filter(s => location.longitude >= s.bounds[0] && location.longitude <= s.bounds[2]
    && location.latitude >= s.bounds[1] && location.latitude <= s.bounds[3])
    .sort((a,b) => distance(a) - distance(b))[0];
}

const DECIMAL = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const DECIMAL_VALUE = new RegExp(`^${DECIMAL}$`);
const COORDINATE_PAIR = new RegExp(`^\\s*(${DECIMAL})\\s*,\\s*(${DECIMAL})\\s*$`);
const MAP_CENTER = new RegExp(`@(${DECIMAL}),(${DECIMAL})(?=[,/]|$)`);
const GOOGLE_HOST = /^(?:(?:www|maps)\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

/** Read explicit coordinates only, without fetching links or geocoding names.
 * Google @ coordinates and OSM #map coordinates describe the shared map centre. */
export function parseMapPin(value: string): Pick<ProjectLocation,"latitude"|"longitude"> | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const input = value.trim();
  let pair: string[] | null = input.match(COORDINATE_PAIR)?.slice(1, 3) ?? null;
  if (!pair) {
    try {
      const url = new URL(input);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
      if (["openstreetmap.org", "www.openstreetmap.org"].includes(url.hostname)) {
        const latitudes = url.searchParams.getAll("mlat"), longitudes = url.searchParams.getAll("mlon");
        if (latitudes.length || longitudes.length) {
          if (latitudes.length !== 1 || longitudes.length !== 1) return null;
          pair = [latitudes[0].trim(), longitudes[0].trim()];
        } else {
          const map = new URLSearchParams(url.hash.slice(1)).getAll("map");
          if (map.length !== 1) return null;
          const parts = map[0].split("/");
          if (parts.length !== 3 || !/^\d+(?:\.\d+)?$/.test(parts[0]) || Number(parts[0]) > 30) return null;
          pair = parts.slice(1).map(part => part.trim());
        }
      } else if (GOOGLE_HOST.test(url.hostname)) {
        const queryKeys = ["q", "query", "ll"].filter(key => url.searchParams.has(key));
        if (queryKeys.length) {
          // Ambiguous multiple coordinate parameters are not a verified pin.
          if (queryKeys.length !== 1 || url.searchParams.getAll(queryKeys[0]).length !== 1) return null;
          pair = url.searchParams.get(queryKeys[0])!.match(COORDINATE_PAIR)?.slice(1, 3) ?? null;
        } else {
          pair = decodeURIComponent(url.pathname).match(MAP_CENTER)?.slice(1, 3) ?? null;
        }
      } else return null;
    } catch { return null; }
  }
  if (!pair || pair.some(part => !DECIMAL_VALUE.test(part))) return null;
  const location = { latitude: Number(pair[0]), longitude: Number(pair[1]), label: "Project pin", example: false };
  return isProjectLocation(location) ? { latitude: location.latitude, longitude: location.longitude } : null;
}
export const openStreetMapUrl=(location:ProjectLocation)=>`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`;
