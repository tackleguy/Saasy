const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const HEIGHT = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))\s*(m|metres?|meters?|ft|feet|foot|'|′)?$/i;
export const MAX_LIVE_MAP_BYTES = 8 * 1024 * 1024;

/** Parse an explicit decimal coordinate; never coerce blanks, hex or labels. */
export function parseMapCoordinate(value: unknown, axis: "latitude" | "longitude"): number | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const trimmed = value.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const coordinate = Number(trimmed), limit = axis === "latitude" ? 85 : 180;
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : null;
}

export function parseLiveMapCoordinates(params: URLSearchParams): { latitude: number; longitude: number } | null {
  const latitudes = params.getAll("lat"), longitudes = params.getAll("lon");
  if (latitudes.length !== 1 || longitudes.length !== 1) return null;
  const latitude = parseMapCoordinate(latitudes[0], "latitude"), longitude = parseMapCoordinate(longitudes[0], "longitude");
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

/** OSM height values with explicitly supported units. Unsupported units, ranges,
 * lists and excessive heights remain unknown; they are never silently clamped. */
export function parseMapHeight(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  const match = value.trim().match(HEIGHT);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const feet = match[2] !== undefined && /^(?:ft|feet|foot|'|′)$/i.test(match[2]);
  const metres = amount * (feet ? 0.3048 : 1);
  return Number.isFinite(metres) && metres >= 0 && metres <= 1000 ? metres : undefined;
}

/** Bound the response before JSON allocation, including chunked responses whose
 * provider omits or understates Content-Length. Callers still validate schema. */
export async function readBoundedMapJson(response: Response, maxBytes = MAX_LIVE_MAP_BYTES): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("Invalid map response size limit");
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength.trim()) && Number(contentLength) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new RangeError("Map response exceeds the permitted size");
  }
  if (!response.body) throw new SyntaxError("Map provider returned an empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - total) throw new RangeError("Map response exceeds the permitted size");
      total += value.byteLength;
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(body) as unknown;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
