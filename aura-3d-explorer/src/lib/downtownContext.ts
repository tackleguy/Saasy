import { validateMapSnapshot, type MapSnapshot } from "./geographicContext";

export const MAX_DOWNTOWN_MANIFEST_BYTES = 256 * 1024;
export const MAX_DOWNTOWN_TILE_BYTES = 12 * 1024 * 1024;
const MAX_TILES = 256, MAX_FEATURES = 12000, MAX_VERTICES = 500000;
type Bounds = MapSnapshot["bounds"];
export interface DowntownTile { id: string; url: string; bounds: Bounds; features: number; vertices: number }
export interface DowntownManifest {
  id: string; label: string; bounds: Bounds; nearBounds: Bounds;
  release: string; capturedAt: string; attribution: string; sourceUrl: string;
  license: string; licenseUrl: string; provenanceUrl: string;
  tiles: DowntownTile[]; statistics: Record<string, number>;
  version?: 1; coverage?: string; tileSizeMetres?: number;
}
export interface DowntownFetchOptions { signal: AbortSignal; request?: typeof fetch; timeoutMs?: number }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const count = (value: unknown, max: number): value is number => finite(value, 0, max) && Number.isSafeInteger(value);
const validId = (value: unknown): value is string => text(value, 64) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const validBounds = (value: unknown): value is Bounds => Array.isArray(value) && value.length === 4 && finite(value[0], -180, 180) && finite(value[1], -85, 85) && finite(value[2], -180, 180) && finite(value[3], -85, 85) && value[0] < value[2] && value[1] < value[3];
const contains = (outer: Bounds, inner: Bounds) => inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
function referenceUrl(value: unknown): value is string {
  if (!text(value, 2048)) return false;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function validateTile(value: unknown, expectedCity?: string): DowntownTile | null {
  if (!object(value) || !text(value.id, 160) || !text(value.url, 256) || !validBounds(value.bounds) || !count(value.features, MAX_FEATURES) || !count(value.vertices, MAX_VERTICES)) return null;
  // Match the raw string, before URL normalisation can erase traversal or
  // reinterpret encoded separators. Only checked-in tile JSON is fetchable.
  const path = /^\/maps\/downtown\/([a-z0-9]+(?:-[a-z0-9]+)*)\/tiles\/([0-9]+-[0-9]+(?:-[0-9]+)*)\.json$/.exec(value.url);
  if (!path || !validId(path[1]) || (expectedCity !== undefined && path[1] !== expectedCity) || value.id !== `${path[1]}-downtown-${path[2]}`) return null;
  return { id: value.id, url: value.url, bounds: [...value.bounds], features: value.features, vertices: value.vertices };
}

/** Validate and copy the installed manifest. Metadata URLs are attribution
 * links only; the loader never requests them or sends a project pin anywhere. */
export function validateDowntownManifest(value: unknown, expectedId?: string): DowntownManifest | null {
  if (!object(value) || !validId(value.id) || (expectedId !== undefined && value.id !== expectedId) || !text(value.label, 200) || !validBounds(value.bounds) || !validBounds(value.nearBounds) || !contains(value.bounds, value.nearBounds) || !text(value.release, 64) || !text(value.capturedAt, 64) || !Number.isFinite(Date.parse(value.capturedAt)) || !text(value.attribution, 2000) || !referenceUrl(value.sourceUrl) || !text(value.license, 100) || !referenceUrl(value.licenseUrl) || value.provenanceUrl !== `/maps/downtown/${value.id}/provenance.json` || !Array.isArray(value.tiles) || value.tiles.length > MAX_TILES || !object(value.statistics)) return null;
  if (value.version !== undefined && value.version !== 1) return null;
  if (value.coverage !== undefined && !text(value.coverage, 1000)) return null;
  if (value.tileSizeMetres !== undefined && !finite(value.tileSizeMetres, 1, 100000)) return null;
  const tiles: DowntownTile[] = [], ids = new Set<string>(), urls = new Set<string>();
  let features = 0, vertices = 0;
  for (const candidate of value.tiles) {
    const tile = validateTile(candidate, value.id);
    if (!tile || ids.has(tile.id) || urls.has(tile.url) || !contains(value.bounds, tile.bounds)) return null;
    ids.add(tile.id); urls.add(tile.url); tiles.push(tile); features += tile.features; vertices += tile.vertices;
  }
  const statistics: Record<string, number> = {};
  const entries = Object.entries(value.statistics);
  if (entries.length > 64) return null;
  for (const [key, number] of entries) {
    if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(key) || (key === "coverageSquareKilometres" ? !finite(number, 0, 510100000) : !count(number, MAX_TILES * MAX_VERTICES))) return null;
    statistics[key] = number as number;
  }
  if (statistics.tiles !== tiles.length || statistics.features !== features || statistics.vertices !== vertices) return null;
  return { id: value.id, label: value.label, bounds: [...value.bounds], nearBounds: [...value.nearBounds], release: value.release, capturedAt: value.capturedAt, attribution: value.attribution, sourceUrl: value.sourceUrl, license: value.license, licenseUrl: value.licenseUrl, provenanceUrl: value.provenanceUrl, tiles, statistics, ...(value.version === 1 ? { version: 1 } : {}), ...(typeof value.coverage === "string" ? { coverage: value.coverage } : {}), ...(typeof value.tileSizeMetres === "number" ? { tileSizeMetres: value.tileSizeMetres } : {}) };
}

const cancelled = () => new DOMException("Downtown map request cancelled", "AbortError");
class DowntownLoadError extends Error {}
function cancelBody(body: ReadableStream<Uint8Array> | null) { if (body) void body.cancel().catch(() => {}); }
/** Count UTF-8 bytes as they arrive, including responses without an honest
 * Content-Length. Cancellation never awaits an uncooperative stream source. */
async function boundedJson(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length.trim()) && Number(length) > limit) { cancelBody(response.body); throw new RangeError("Downtown map data exceeds the size limit. Retry or choose another map area."); }
  if (!response.body) throw new DowntownLoadError("Downtown map data is empty. Retry to load this area.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw cancelled();
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > limit - total) throw new RangeError("Downtown map data exceeds the size limit. Retry or choose another map area.");
      chunks.push(value); total += value.byteLength;
    }
    if (signal.aborted) throw cancelled();
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) { cancel(); throw error; }
  finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

async function fetchLocalJson(url: string, limit: number, kind: "manifest" | "tile", { signal, request = fetch, timeoutMs = 30000 }: DowntownFetchOptions): Promise<unknown> {
  if (signal.aborted) throw cancelled();
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) throw new RangeError("Invalid downtown map timeout");
  const controller = new AbortController();
  let timeout = false, rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
  const abort = () => { controller.abort(); rejectInterrupted(cancelled()); };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timeout = true; controller.abort(); rejectInterrupted(new Error("Downtown map loading timed out. Retry when your connection is available.")); }, timeoutMs);
  try {
    const loading = async () => {
      const response = await request(url, { signal: controller.signal, credentials: "omit", mode: "same-origin", redirect: "error" });
      if (controller.signal.aborted) { cancelBody(response.body); throw cancelled(); }
      if (!response.ok || response.redirected) { cancelBody(response.body); throw new DowntownLoadError(kind === "tile" ? "Part of the downtown map could not load. Retry to load this area." : "The downtown map could not load. Retry to load this area."); }
      return await boundedJson(response, limit, controller.signal);
    };
    return await Promise.race([loading(), interrupted]);
  } catch (error) {
    controller.abort();
    if (signal.aborted) throw cancelled();
    if (timeout) throw new Error("Downtown map loading timed out. Retry when your connection is available.");
    if (error instanceof RangeError) throw error;
    if (error instanceof SyntaxError || error instanceof TypeError) throw new Error("Downtown map data could not be read. Retry to load this area.");
    if (error instanceof DowntownLoadError) throw error;
    throw new Error(kind === "tile" ? "Part of the downtown map could not load. Retry to load this area." : "The downtown map could not load. Retry to load this area.");
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

export async function fetchDowntownManifest(id: string, options: DowntownFetchOptions): Promise<DowntownManifest> {
  if (!validId(id)) throw new Error("This downtown map area is invalid. Choose another map area.");
  const raw = await fetchLocalJson(`/maps/downtown/${id}/manifest.json`, MAX_DOWNTOWN_MANIFEST_BYTES, "manifest", options);
  const manifest = validateDowntownManifest(raw, id);
  if (!manifest) throw new Error("The downtown map manifest is invalid. Retry or choose another map area.");
  return manifest;
}

export async function fetchDowntownTile(candidate: DowntownTile, options: DowntownFetchOptions): Promise<MapSnapshot> {
  const tile = validateTile(candidate);
  if (!tile) throw new Error("This downtown map tile is invalid. Retry or choose another map area.");
  const raw = await fetchLocalJson(tile.url, MAX_DOWNTOWN_TILE_BYTES, "tile", options);
  const snapshot = validateMapSnapshot(raw);
  if (!snapshot || snapshot.id !== tile.id || snapshot.features.length !== tile.features || snapshot.bounds.some((number, index) => number !== tile.bounds[index])) throw new Error("Part of the downtown map is invalid. Retry to load this area.");
  let vertices = 0;
  for (const feature of snapshot.features) {
    const geometry = feature.geometry;
    if (geometry.type === "LineString") vertices += geometry.coordinates.length;
    else if (geometry.type === "MultiPolygon") for (const polygon of geometry.coordinates) for (const ring of polygon) vertices += ring.length;
    else for (const line of geometry.coordinates) vertices += line.length;
  }
  if (vertices !== tile.vertices) throw new Error("Part of the downtown map is incomplete. Retry to load this area.");
  return snapshot;
}
