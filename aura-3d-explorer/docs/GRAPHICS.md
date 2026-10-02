# AURA cinematic graphics

The scene keeps the project's existing floor data, selection, furnishing, CAD import, financial calculations and exterior controls. The checkout uses Next.js 16.3.8, React 19 and Three.js r186; its actual graphics folder is `src/components/3d`, rather than the older paths in the brief. No application version downgrade is needed.

The scene opens with **Context → Cinematic**, using the seeded city, dark Sky, local HDR and tiered bay described below. Choose **Context → Existing city** to return to the authored lighting and landscape. The new presentation controls join the existing bottom dock when its host is present; the bare render route uses a compact top-right fallback.

## Light and atmosphere

`environment/settings.tsx` holds Dawn, Golden Hour, Dusk and Night. The viewport's Sun menu selects one. A GSAP transition interpolates sun direction, warmth, intensity, sky scattering, reflected light and haze over 1.5 seconds. Reduced-motion users see the destination immediately. The Architect sun study still overrides the sun's elevation and azimuth.

The Golden Hour key is #FFD9A8 at intensity 3.5 and 22 degrees elevation. A cool #9EB7D9 / #1A1C22 hemisphere fills the shadows. Drei's physical Sky is graded into an obsidian horizon instead of becoming a bright blue background; dusk adds a faint warm horizon. Exponential fog at 0.0032 softens distant blocks. Night hides the solar sky.

`public/hdri/dusk.hdr` supplies reflections only. It is the bundled 1024 × 512 Potsdamer Platz urban HDR by Greg Zaal, from [Poly Haven](https://polyhaven.com/a/potsdamer_platz), under CC0. `public/hdri/LICENSE` records attribution. It is 1,540,678 bytes (1.47 MiB), reused from the existing local asset. The name describes its role; the original capture is overcast daytime. New downloadable scene assets total 1.47 MiB. Other maps are generated in memory, at 512 pixels or less for new maps.

Shadow maps are 4096, 2048 or 1024 pixels. The shadow camera's extent follows the site's tower heights and positions. Bias −0.00008 and normal bias 0.025 are tuned to the model scale. Maps update during changes, then sleep. Three r186 removed PCFSoftShadowMap, so this scene uses its supported PCFShadowMap replacement. Contact shadows ground the cinematic site on High and Medium; their single rendered frame is a static approximation of the initial ground-level massing.

## Materials and architecture

`FloorPlate.tsx` retains the existing procedural four-zone massing, stone arcades, continuous balcony bands, per-apartment terraces, plan shapes, twist and interiors. Its curtain wall now uses #BFD3D8 physical glass: transmission 0.85, thickness 0.6, IOR 1.52, roughness 0.04, clearcoat 1, environment strength 1.3 and #9FC2CC attenuation. Exterior glass fades for inspection, X-ray and walking as before.

Bronze is #6E5537 with metalness 0.85 and roughness 0.3. Scene units are 0.28 metres-to-model scale: mullion pitch 0.42 represents 1.5 m; office fins default to 0.84 pitch, 0.034 thickness and 0.168 depth (3 m, 0.12 m and 0.6 m). Existing project-specific fin spacing remains authoritative. Existing rounded balcony bands retain their 0.45-unit overhang, matching the existing balcony furniture layout (about 1.6 m, rather than shrinking it to the brief's 1.2 m).

`environment/FacadeDetails.tsx` walks each floor's polygon. A seeded 70% occupancy pattern places warm #FFE2B0 interior window panels behind the glazing. Three building-wide instance batches carry windows/underside lights, roof screens/planters/parapets/canopy, and shrubs. Each instance retains its source floor and follows its twist, eased exploded height and dimming. X-ray, section and walking modes hide these exterior extras. Selecting a floor hides its window panels and dims the other floors’ additions. In the full explorer, the scene controls portal into the existing bottom dock, preserving the map and zone controls. A locally generated AURA sign sits under the canopy. The crown's former needle becomes a tapered triangular gold blade.

`mergedStatics.ts` batches idle floor geometry by material role while leaving per-floor glass available to raycasting. It restores individual meshes for explode, focus, walking and section mode. Identical glazing now shares a batch; the structural concrete shares another. The cache belongs to the mounted building root, avoiding cross-viewport collisions, and disposes its geometry/material clones on unmount. Texture clones introduced here also have explicit cleanup. Existing shared procedural geometry/texture caches remain owned by their original modules.

## City and waterfront

`environment/City.tsx` creates up to 180 seeded addresses on a street grid, with rectangular, slab, L-wing and setback buildings. Near building heights range from 5.4–10.8 model units and mid buildings from 10.8–36, approximating 6–12 and 12–40 storeys at 0.9 units per storey; these are solid context masses with a repeating window texture, not individually modelled floors. The far ring uses fog-softened silhouettes. All wings and setbacks fit into three instanced draw batches; Low removes the far batch. Dark glass/concrete materials keep the hero brighter. A tiny repeating window map lights the city at dusk/night. City choice changes the deterministic seed, and moved-building clearings are respected.

`environment/Site.tsx` supplies asphalt, faint lane markings, sidewalks, waterfront promenade, up to 54 trees after site clearings, lamps, 12 looping cars and three softly drifting cloud sprites. Trees alternate two canopy proportions with a gentle sway. Dusk/night light the street lamps and vehicle front/rear panels. The bay uses Drei MeshReflectorMaterial on High (mirror 0.75, blur 400/100, strength 1.5, #0E141C) with moving ripple normals. Medium and Low use the HDR reflection without the extra planar scene pass.

The optional **Context → Existing city** retains the previous imported city, water, traffic, landscape and lighting system. Its asset size and performance are separate from the new procedural context. The Sun presets apply to cinematic lighting; the existing context keeps its original lighting controls.

## Camera and capture

The opening move lasts four seconds, from a low waterfront position to the overview. Pointer, wheel or keyboard input cancels the move. Street, Waterfront, Aerial, Podium and Crown photo angles move camera, target and field of view together over 1.4 seconds with power3.inOut. Existing Skyline and Drone controls remain supported. Waterfront and Aerial distances scale with tower height. Floor selection still wins over a photo angle and drives depth of field.

After 20 seconds without input the camera slowly orbits. Dragging, walking, selecting a floor, drawing views and reduced-motion preference prevent automatic orbiting. Capture temporarily doubles the pixel ratio, capped at 4, copies the current post-processed frame to a PNG, adds a small gold AURA watermark, triggers download and restores resolution in a finally block.

## Quality tiers

The table describes **Context → Cinematic**. In Existing city, context lighting and water continue to use the original caller-provided quality setting; the presentation tier still controls pixel ratio and post-processing.

| Tier | Pixel ratio | Shadows | Effects | Bay |
| --- | --- | --- | --- | --- |
| High | Up to 2 | 4096 | N8AO, Bloom, selected-floor DoF, vignette, SMAA, ACES | Planar reflection |
| Medium | 1.5 | 2048 | Same, without DoF | HDR reflection |
| Low | 1 | 1024 | Renderer ACES only | HDR reflection; no far city ring |

Bloom threshold is 0.85, smoothing 0.2, intensity 0.35. DoF uses bokeh scale 2.5 and is absent without a selection. Vignette darkness is 0.3. Exposure is 1.1. PerformanceMonitor steps Auto downward after the first ten seconds; explicit quality selection prevents automatic changes. The dock displays the actual selected tier. The scene remains in the existing lazy client bundle, and suspended scene assets display an indeterminate gold progress ring with “Preparing site…”.

## How to tweak

| Setting | File | Value to change |
| --- | --- | --- |
| Sun angle and warmth | `environment/settings.tsx` | `SUN.golden.elevation`, `azimuth`, `color`, `intensity` |
| Glass tint | `FloorPlate.tsx` | `glassColor` and material color; attenuationColor |
| City density | `environment/City.tsx` | 180 address count, 20 columns, 22/28 street spacing |
| Water colour | `environment/Site.tsx` | Bay material color #0E141C |
| Haze | `LightingEnvironment.tsx` | FogExp2 density 0.0032 |
| Occupancy | `environment/FacadeDetails.tsx` | Seed 71, occupancy threshold 0.7 |
| Idle orbit | `BuildingScene.tsx` | 20,000 ms delay and 0.12 speed |
| Camera photo poses | `BuildingScene.tsx` | `photoPose` |

## Known differences from the brief

- Crown floors retain their existing footprint and procedural shape. The triangular gold blade changes the rooftop accent; it does not implement a new faceted crown envelope.
- Balcony overhang remains 0.45 model units (about 1.6 m) to preserve the current furniture and terrace layout, rather than the requested 1.2 m.
- The local urban HDR is an overcast daytime capture used for reflections. The dusk appearance comes from the scene's lighting and grading, not a dusk-source HDR.
- The full-frame draw-call target remains unmet. Batching reduces visible tower meshes, but transmission, planar reflections and post-processing render additional passes. Do not report the mesh count as a passed draw-call budget.
- Reduced motion disables the opening move and idle orbit and makes camera/lighting transitions immediate. Traffic, water ripples, canopy sway and clouds still animate.

## Verification

Run the app, then:

```sh
GRAPHICS_URL=http://localhost:3100 node docs/capture-graphics.mjs
GRAPHICS_URL=http://localhost:3100 GRAPHICS_SOAK=1 node docs/capture-graphics.mjs
```

For cinematic verification, explicitly select **Context → Cinematic** before recording captures and telemetry, even though it is the default. Record Existing city results separately because it uses a different lighting and context path.

The Playwright script uses installed Chrome, takes 1600 × 1000 screenshots of all four sun presets and five photo angles, captures Medium/Low and a 390 × 844 mobile viewport, and records browser errors and renderer counters in `docs/screens/results.json`. The optional soak enables motion and samples a ten-minute automatic orbit into `docs/screens/soak.json`. `?graphics=1` explicitly enables the presentation dock on the otherwise bare render route.

`Telemetry.tsx` disables automatic renderer counter resets and samples complete frames, including transmission, water reflection and post-processing passes. Therefore its `calls` value must not be compared with a count of visible meshes as if those were equivalent. `towerMeshes` counts scene meshes on camera layers, not multiplied offscreen render passes. Hardware targets need physical-device tests; viewport emulation does not establish iPhone GPU performance.

### Final validation — pending

Fill this section after the production capture run and ten-minute soak. No final success or performance claim is made here yet.

- Production build and regression checks: [pending]
- Capture artifacts, tested context and visual review: [pending]
- Complete-frame calls, triangles and measured frame rate by tier: [pending]
- Ten-minute soak duration, browser errors and memory-counter changes: [pending]
- Remaining brief targets and physical-device validation: [pending]
