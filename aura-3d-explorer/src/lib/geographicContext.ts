import { MODEL_SCALE } from "./tower";

export type LonLat = [number, number];
export interface ProjectLocation { latitude: number; longitude: number; label: string; example: boolean }
export type MapGeometry =
  | { type: "Polygon"; coordinates: LonLat[][] }
  | { type: "MultiPolygon"; coordinates: LonLat[][][] }
  | { type: "LineString"; coordinates: LonLat[] }
  | { type: "MultiLineString"; coordinates: LonLat[][] };
export interface MapFeature {
  id: string;
  kind: "building" | "road" | "water" | "park";
  name?: string;
  geometry: MapGeometry;
  height?: number;
  minHeight?: number;
  heightSource?: "recorded" | "levels" | "unknown";
}
export interface MapSnapshot {
  id: string;
  label: string;
  /** Geographic coverage: west, south, east, north. Wrapped boxes are unsupported. */
  bounds: [number, number, number, number];
  capturedAt: string;
  attribution: string;
  sourceUrl: string;
  features: MapFeature[];
}

const RAD = Math.PI / 180;
const WGS84_A = 6378137;
const WGS84_E2 = 6.6943799901413165e-3;
const MAX_FEATURES = 12000;
const MAX_VERTICES = 500000;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const coordinate = (value: unknown): value is LonLat => Array.isArray(value) && value.length === 2 && number(value[0], -180, 180) && number(value[1], -85, 85);

export function isProjectLocation(value: unknown): value is ProjectLocation {
  return object(value) && number(value.latitude, -85, 85) && number(value.longitude, -180, 180) && text(value.label, 160) && typeof value.example === "boolean";
}

/** Local tangent-plane scales from the WGS84 ellipsoid at the project pin.
 * Suitable for a neighborhood, not a continental or survey-grade projection. */
function scales(origin: ProjectLocation): [number, number] {
  if (!isProjectLocation(origin)) throw new RangeError("Invalid project location");
  const latitude = origin.latitude * RAD;
  const denominator = 1 - WGS84_E2 * Math.sin(latitude) ** 2;
  const east = WGS84_A * Math.cos(latitude) / Math.sqrt(denominator);
  const north = WGS84_A * (1 - WGS84_E2) / denominator ** 1.5;
  return [east * RAD * MODEL_SCALE, north * RAD * MODEL_SCALE];
}
const wrappedLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;

/** Scene X points east; scene Z points south. One real metre is MODEL_SCALE. */
export function geographicToWorld(point: LonLat, origin: ProjectLocation): [number, number] {
  if (!coordinate(point)) throw new RangeError("Invalid geographic coordinate");
  const [east, north] = scales(origin);
  return [wrappedLongitude(point[0] - origin.longitude) * east, -(point[1] - origin.latitude) * north];
}

export function worldToGeographic(point: [number, number], origin: ProjectLocation): LonLat {
  if (!Array.isArray(point) || point.length !== 2 || point.some(value => typeof value !== "number" || !Number.isFinite(value))) throw new RangeError("Invalid scene coordinate");
  const [east, north] = scales(origin);
  const result: LonLat = [wrappedLongitude(origin.longitude + point[0] / east), origin.latitude - point[1] / north];
  if (!coordinate(result)) throw new RangeError("Scene coordinate is outside the supported geographic range");
  return result;
}

function validBounds(value: unknown): value is MapSnapshot["bounds"] {
  return Array.isArray(value) && value.length === 4 && number(value[0], -180, 180) && number(value[1], -85, 85) && number(value[2], -180, 180) && number(value[3], -85, 85) && value[0] < value[2] && value[1] < value[3];
}

export function snapshotContains(snapshot: MapSnapshot, location: ProjectLocation): boolean {
  if (!snapshot || !validBounds(snapshot.bounds) || !isProjectLocation(location)) return false;
  const [west, south, east, north] = snapshot.bounds;
  return location.longitude >= west && location.longitude <= east && location.latitude >= south && location.latitude <= north;
}

/** Validate and copy only supported map data. Text stays plain text; it must be
 * rendered through React text nodes, never inserted as HTML. */
export function validateMapSnapshot(value: unknown): MapSnapshot | null {
  if (!object(value) || !text(value.id, 160) || !text(value.label, 160) || !validBounds(value.bounds) || !text(value.attribution, 2000) || !text(value.sourceUrl, 2048) || !text(value.capturedAt, 64) || !Number.isFinite(Date.parse(value.capturedAt)) || !Array.isArray(value.features) || value.features.length > MAX_FEATURES) return null;
  try {
    const url = new URL(value.sourceUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  } catch { return null; }

  let vertices = 0;
  const line = (input: unknown, ring: boolean): LonLat[] | null => {
    if (!Array.isArray(input) || input.length < (ring ? 4 : 2) || input.length > MAX_VERTICES - vertices) return null;
    const result: LonLat[] = [];
    for (const point of input) {
      if (!coordinate(point)) return null;
      result.push([point[0], point[1]]);
    }
    vertices += result.length;
    if (ring) {
      const first = result[0], last = result[result.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) return null;
      let area = 0;
      for (let i = 1; i < result.length - 1; i++) {
        area += (result[i][0] - first[0]) * (result[i + 1][1] - first[1]) - (result[i + 1][0] - first[0]) * (result[i][1] - first[1]);
      }
      if (area === 0) return null;
    }
    return result;
  };
  const lines = (input: unknown, ring: boolean): LonLat[][] | null => {
    if (!Array.isArray(input) || input.length === 0 || input.length > MAX_VERTICES) return null;
    const result: LonLat[][] = [];
    for (const item of input) {
      const validated = line(item, ring);
      if (!validated) return null;
      result.push(validated);
    }
    return result;
  };
  const geometry = (input: unknown): MapGeometry | null => {
    if (!object(input)) return null;
    if (input.type === "LineString") {
      const coordinates = line(input.coordinates, false);
      return coordinates ? { type: "LineString", coordinates } : null;
    }
    if (input.type === "Polygon" || input.type === "MultiLineString") {
      const coordinates = lines(input.coordinates, input.type === "Polygon");
      return coordinates ? { type: input.type, coordinates } : null;
    }
    if (input.type === "MultiPolygon") {
      if (!Array.isArray(input.coordinates) || input.coordinates.length === 0 || input.coordinates.length > MAX_VERTICES) return null;
      const coordinates: LonLat[][][] = [];
      for (const polygon of input.coordinates) {
        const validated = lines(polygon, true);
        if (!validated) return null;
        coordinates.push(validated);
      }
      return { type: "MultiPolygon", coordinates };
    }
    return null;
  };

  const features: MapFeature[] = [];
  const ids = new Set<string>();
  for (const feature of value.features) {
    if (!object(feature) || !text(feature.id, 160) || ids.has(feature.id) || !["building", "road", "water", "park"].includes(feature.kind as string)) return null;
    if (feature.name !== undefined && !text(feature.name, 160)) return null;
    if (feature.height !== undefined && !number(feature.height, 0, 1000)) return null;
    if (feature.minHeight !== undefined && !number(feature.minHeight, 0, 1000)) return null;
    if (typeof feature.height === "number" && typeof feature.minHeight === "number" && feature.minHeight > feature.height) return null;
    if (feature.heightSource !== undefined && !["recorded", "levels", "unknown"].includes(feature.heightSource as string)) return null;
    const shape = geometry(feature.geometry);
    if (!shape) return null;
    const valid: MapFeature = { id: feature.id, kind: feature.kind as MapFeature["kind"], geometry: shape };
    if (typeof feature.name === "string") valid.name = feature.name;
    if (typeof feature.height === "number") valid.height = feature.height;
    if (typeof feature.minHeight === "number") valid.minHeight = feature.minHeight;
    if (feature.heightSource !== undefined) valid.heightSource = feature.heightSource as MapFeature["heightSource"];
    ids.add(valid.id);
    features.push(valid);
  }
  return { id: value.id, label: value.label, bounds: [...value.bounds], capturedAt: value.capturedAt, attribution: value.attribution, sourceUrl: value.sourceUrl, features };
}
