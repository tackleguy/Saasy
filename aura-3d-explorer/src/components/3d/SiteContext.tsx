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
import type { UWRect } from "@/lib/siteLayout";

export interface SiteEdits {
  /** Areas where moved buildings stand: neighbouring blocks, trees and people inside are removed. */
  clearings: UWRect[];
  /** Paved pads under buildings moved off the plinth. */
  pads: UWRect[];
}

const NO_EDITS: SiteEdits = { clearings: [], pads: [] };

export default function SiteContext({ quality, preset, edits = NO_EDITS }: { quality: "high" | "low"; preset: CityPreset; edits?: SiteEdits }) {
  // Keyed by city so instanced meshes are rebuilt with the new counts.
  return (
    <group key={preset.id}>
      <Ground preset={preset} pads={edits.pads} />
      <City preset={preset} clearings={edits.clearings} />
      <Landmarks preset={preset} />
      <Water quality={quality} color={preset.water} />
      <Trees preset={preset} clearings={edits.clearings} />
      <Traffic preset={preset} />
      <People preset={preset} clearings={edits.clearings} />
      <StreetFurniture />
    </group>
  );
}
