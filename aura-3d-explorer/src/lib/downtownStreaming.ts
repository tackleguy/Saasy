import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import type { Building } from "@/types";

/** Near-only edits cannot intersect the outer tiles. Once any proposal extends
 * beyond that hole, retain a stable geometry signature so cached outer tiles
 * are rebuilt when clearing those proposal footprints changes. */
export function outerProposalSignature(nearBounds: MapSnapshot["bounds"], location: ProjectLocation, buildings: Building[]): string {
  const a = geographicToWorld([nearBounds[0], nearBounds[1]], location), b = geographicToWorld([nearBounds[2], nearBounds[3]], location);
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]), minZ = Math.min(a[1], b[1]), maxZ = Math.max(a[1], b[1]);
  const outside = buildings.some(building => {
    const radius = building.floors.reduce((largest, floor) => Math.max(largest, Math.hypot(floor.width, floor.depth) / 2), 0);
    return building.position[0] - radius < minX || building.position[0] + radius > maxX || building.position[1] - radius < minZ || building.position[1] + radius > maxZ;
  });
  if (!outside) return "";
  return JSON.stringify(buildings.map(building => [building.id, building.position, building.floors.map(floor => [floor.index, floor.baseY, floor.height, floor.width, floor.depth, floor.rotationY, floor.shape.kind, floor.shape.amount ?? null])]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
}

/** Leave the loading state in place until the owning job releases its slot.
 * Setting it idle here could start a replacement while the old builder runs. */
export function abortUnwantedDowntownLoads(records: readonly { tile: { id: string }; state: string; controller?: AbortController }[], wanted: ReadonlySet<string>): number {
  let aborted = 0;
  for (const record of records) {
    if (record.state === "loading" && !wanted.has(record.tile.id) && record.controller && !record.controller.signal.aborted) { record.controller.abort(); aborted++; }
  }
  return aborted;
}

/** Match failures to the requested city, even when a valid older manifest is
 * still displayed. Tile retries must not swallow a failed manifest refresh. */
export function downtownRetryTarget(id: string | undefined, manifest: { id: string } | null, failure: { id: string } | null): "manifest" | "tiles" | "none" {
  if (!id) return "none";
  return manifest?.id !== id || failure?.id === id ? "manifest" : "tiles";
}
