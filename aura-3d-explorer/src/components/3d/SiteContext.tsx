"use client";
/**
 * SiteContext — daylight urban context around the project.
 * -----------------------------------------------------------------------------
 * Laid out in the rotated "screen" frame from `lib/siteLayout.ts` (u across
 * the view, w towards the viewer), so the default camera looks over water,
 * a promenade and a street at the towers, like a waterfront archviz render.
 * The city preset (lib/cityPresets) restyles all of it: New York, Miami,
 * Los Angeles, London…
 *
 *   • Ground     — textured plinth, sidewalks, main road with kerbs and zebra
 *                  crossings, promenade, and the city's secondary street grid
 *   • City       — neighbouring blocks in four facade kinds with city tints,
 *                  setbacks, rooftop plant and (NYC) water tanks
 *   • Landmarks  — generic skyline silhouettes and bridges for the city
 *   • Water      — rippled planar reflection + motor boats
 *   • Trees      — three broadleaf species plus palms, per-tree colour
 *   • Traffic    — cars, taxis and buses, moving and parked
 *   • People     — walking and standing pedestrians
 *   • Furniture  — lamp posts and benches
 *
 * Everything is non-interactive (raycast disabled). See ./context/*.
 */
import Ground from "./context/Ground";
import City from "./context/City";
import Landmarks from "./context/Landmarks";
import Water from "./context/Water";
import Trees from "./context/Trees";
import Traffic from "./context/Traffic";
import People from "./context/People";
import StreetFurniture from "./context/StreetFurniture";
import type { CityPreset } from "@/lib/cityPresets";

export default function SiteContext({ quality, preset }: { quality: "high" | "low"; preset: CityPreset }) {
  // Keyed by city so instanced meshes are rebuilt with the new counts.
  return (
    <group key={preset.id}>
      <Ground preset={preset} />
      <City preset={preset} />
      <Landmarks preset={preset} />
      <Water quality={quality} color={preset.water} />
      <Trees preset={preset} />
      <Traffic preset={preset} />
      <People preset={preset} />
      <StreetFurniture />
    </group>
  );
}
