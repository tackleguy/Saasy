import areas from "@/content/downtown-areas.json";
import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import { MODEL_SCALE } from "./tower";
import { exteriorNearPlane } from "./renderDepth";

type Vec3 = [number, number, number];
export interface DowntownWorldBounds { min: Vec3; max: Vec3 }
export const DOWNTOWN_MAX_DISTANCE = 40000;
export const DOWNTOWN_SKY_SIZE = 150000;

/** Area extents stay available before their progressively loaded tiles arrive.
 * An unlisted custom map falls back to its declared geographic coverage. The
 * vertical envelope is a framing allowance, never generated architecture. */
export function downtownWorldBounds(snapshot: MapSnapshot | null, origin: ProjectLocation, siteHeight = 0): DowntownWorldBounds | null {
  if (!snapshot) return null;
  const bounds = areas.find(area => area.id === snapshot.id)?.bounds ?? snapshot.bounds;
  const northwest = geographicToWorld([bounds[0], bounds[3]], origin);
  const southeast = geographicToWorld([bounds[2], bounds[1]], origin);
  return {
    min: [Math.min(northwest[0], southeast[0]), 0, Math.min(northwest[1], southeast[1])],
    max: [Math.max(northwest[0], southeast[0]), Math.max(1000 * MODEL_SCALE, Number.isFinite(siteHeight) ? siteHeight : 0), Math.max(northwest[1], southeast[1])],
  };
}

/** Fit all eight corners through both perspective field-of-view constraints.
 * A narrow phone must move farther back than a wide desktop; using only the
 * vertical FOV would silently crop the ends of a downtown skyline. */
export function downtownCameraPose(bounds: DowntownWorldBounds, aspect: number, fov = 38): { position: Vec3; target: Vec3 } {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeFov = Number.isFinite(fov) && fov > 1 && fov < 179 ? fov : 38;
  const target: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, bounds.max[1] * .3, (bounds.min[2] + bounds.max[2]) / 2];
  // A higher city-only oblique angle gives the complete street fabric useful
  // vertical space on a phone without changing the near-project hero view.
  const magnitude = Math.hypot(1, 1.25, 1);
  const direction: Vec3 = [1 / magnitude, 1.25 / magnitude, 1 / magnitude];
  const right: Vec3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const up: Vec3 = [-direction[1] * Math.SQRT1_2, Math.hypot(direction[0], direction[2]), -direction[1] * Math.SQRT1_2];
  const tanVertical = Math.tan(safeFov * Math.PI / 360);
  const tanHorizontal = tanVertical * safeAspect * .88;
  // Reserve the actual presentation region: title above, controls below. A
  // phone's wrapped toolbar requires more bottom space. Horizontal framing
  // remains unchanged, so a phone already limited by its width need not shrink.
  const bottom = safeAspect < .7 ? -.4 : -.6;
  const top = .64;
  const upwardBias = .04;
  let distance = 100;
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
    const point = [x - target[0], y - target[1], z - target[2]];
    const depth = point.reduce((sum, value, i) => sum + value * direction[i], 0);
    const horizontal = Math.abs(point.reduce((sum, value, i) => sum + value * right[i], 0));
    const vertical = point.reduce((sum, value, i) => sum + value * up[i], 0);
    // Solve both off-centre perspective inequalities, including each corner's
    // depth. This keeps the near map edge above controls, not merely its centre.
    distance = Math.max(distance, depth + horizontal / tanHorizontal,
      (vertical / tanVertical + depth * top) / (top - upwardBias),
      (-vertical / tanVertical - depth * bottom) / (upwardBias - bottom));
  }
  const shift = distance * tanVertical * upwardBias;
  const framedTarget = target.map((value, i) => value - up[i] * shift) as Vec3;
  return { position: direction.map((value, i) => framedTarget[i] + value * distance) as Vec3, target: framedTarget };
}

/** Retain the established near atmosphere; reduce extinction continuously as
 * the camera moves out to kilometre-scale views instead of hiding the city. */
export function downtownFogDensity(targetDistance: number): number {
  if (!Number.isFinite(targetDistance)) return .00075;
  return .00075 * Math.min(1, 600 / Math.max(600, targetDistance));
}

/** Preserve near-view depth precision while keeping the far side of the city
 * inside the camera projection when the viewer zooms out. */
export function downtownFarPlane(targetDistance: number): number {
  if (!Number.isFinite(targetDistance)) return 5000;
  if (targetDistance <= 600) return 5000;
  // Ground must continue until atmospheric extinction reaches the sky haze.
  // Clipping it at 2.5× distance leaves a visible horizontal colour boundary.
  const blend = Math.min(1, (targetDistance - 600) / 400);
  return 5000 + (targetDistance * 10 + 1500 - 5000) * blend;
}

/** A city overview sits above the source's supported 1,000 m height envelope.
 * Use part of that clear air to improve depth precision, while preserving the
 * existing near plane at eye level, inside the skyline and close to the plot. */
export function downtownNearPlane(targetDistance: number, elevation: number): number {
  const nearby = exteriorNearPlane(targetDistance, elevation);
  if (!Number.isFinite(targetDistance) || !Number.isFinite(elevation) || targetDistance <= 600) return nearby;
  return Math.max(nearby, Math.min(160, (targetDistance - 600) * .02, Math.max(0, elevation - 1000 * MODEL_SCALE) * .1));
}
