"use client";
/**
 * SiteContext — daylight urban context around the project.
 * -----------------------------------------------------------------------------
 * Laid out in the rotated "screen" frame from `lib/siteLayout.ts` (u across
 * the view, w towards the viewer), so the default camera looks over water,
 * a promenade and a street at the towers, like a waterfront archviz render.
 *
 *   • Ground     — textured plinth, sidewalks, main road with kerbs and zebra
 *                  crossings, promenade, and a secondary street grid
 *   • City       — a grid of neighbouring blocks in four facade kinds with
 *                  rooftop plant; glass downtown in the distance
 *   • Water      — rippled planar reflection + motor boats
 *   • Trees      — three species, organic canopies, per-tree colour
 *   • Traffic    — moving and parked cars on the main road
 *   • People     — pedestrians on the promenade, sidewalks and plaza
 *   • Furniture  — lamp posts and benches
 *
 * Everything is non-interactive (raycast disabled). See ./context/*.
 */
import Ground from "./context/Ground";
import City from "./context/City";
import Water from "./context/Water";
import Trees from "./context/Trees";
import Traffic from "./context/Traffic";
import People from "./context/People";
import StreetFurniture from "./context/StreetFurniture";

export default function SiteContext({ quality }: { quality: "high" | "low" }) {
  return (
    <group>
      <Ground />
      <City />
      <Water quality={quality} />
      <Trees />
      <Traffic />
      <People />
      <StreetFurniture />
    </group>
  );
}
