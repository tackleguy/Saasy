# Skyline detail — 2026-10-02

Status: the scoped skyline visual review is approved; the performance and full-launch limitations below remain open. The user rejected the earlier gray, schematic skyline. That rejection supersedes its prior visual acceptance and the mineral-only skyline finish rule in [SALES-PRESENTATION.md](SALES-PRESENTATION.md). The established paper, ink and bronze interface and buyer sequence continue.

## Source placement and illustrative detail

The fourteen local Overture map snapshots remain the geographic basis: building footprints and parts, source heights, road centre lines, water boundaries and polygon holes retain their coordinates. The renderer uses the saved project pin and metre-based projection. The existing proposal-clearing rule omits mapped polygons that intersect actual proposal floor outlines; this pass does not move surrounding buildings to improve the view.

Unknown or unusable heights remain flat footprints. Heights derived from floor counts retain their estimate status. Terrain remains flat. Facades, roof equipment, road widths, planting, vehicles and occupancy are illustrative architectural detail, not a reconstruction or survey of the corresponding real buildings. Authored project models retain their supplied geometry.

Example map areas and pins remain explicitly labelled. The map panel reports source heights, floor-count estimates and footprints without heights; presentation labels facades, roofs and street details illustrative. Automatic live coordinate lookup/export remains disabled: the context route returns 503, and uncovered pins use the unavailable-data state. The explicit “Open map” link remains available to the user.

## Facades and light

Mapped walls receive edge-local metre coordinates and a deterministic building identity. Brick, stone-toned masonry and glass treatments therefore follow each wall's orientation and width without stretching one texture over an entire building or changing when the project pin moves. Illustrative floor spacing is 3.05m for masonry and 3.8m for glass towers; these divisions do not establish the source building's storey count. Roof membranes have a separate, subdued seam treatment at the source roof height.

Window boundaries use derivative-based antialiasing. As bays become too small to resolve, the material blends toward average glazing coverage; roof seams also fade with distance. Glass uses environment reflections, lower roughness and a restrained height gradient. Mapped glass uses roughness 0.2 and metalness 0.48; proposal glazing uses metalness 0.25 at distance, with transmission reserved for the close view. Their environment strengths, 1.8 and 1.6 respectively, are multipliers of the current `scene.environmentIntensity`, not absolute intensities. Each material explicitly binds the shared scene environment texture without cloning or taking ownership of it, so reflections follow the selected lighting preset.

Dusk occupancy is sparse and deterministic: the threshold uses 75% individual-room variation and 25% grouped variation. Distant occupancy blends toward a low average glow instead of preserving unresolved clusters. Illumination follows the selected sun preset; it is not evidence of actual occupancy.

## Roof and street scale

Roof equipment uses three instanced batches: pads, housings and vents. Only recorded-height roofs within 300m are candidates; estimated and unknown roofs receive no equipment. Pads must fit within the full roof polygon, avoid holes, higher overlapping parts, other equipment and proposal-cleared polygons. Equipment is aligned to the roof's longest edge. The original roof surface stays at its source height.

Street dressing follows existing road centre lines. Full-footprint checks reject mapped buildings, water, actual proposal outlines and previously reserved objects, including polygon-hole boundaries. Street trees and parked cars are limited to 85 scene units from the project; rendered street strips have a 1,800-segment cap. Widths, markings and parked positions remain illustrative. See [street-detail rules](SKYLINE-STREET-DETAILS.md).

| Quality | Roof equipment units | Trees, including parks | Parked cars | Lamps | Pedestrian anchors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 18 | 24 | 0 | 24 | 0 |
| Medium | 64 | 48 | 20 | 44 | 28 |
| High | 140 | 72 | 36 | 64 | 44 |

These are upper bounds, not required density. Low quality retains mapped envelopes while reducing secondary detail.

## Water, atmosphere and composition

Water shading stays within the existing shoreline polygons. Two small-amplitude normal-wave frequencies provide metre-scale ripples; both fade toward flat shading when unresolved. There is no broad wave modulation. Water animation stops on Low quality and with reduced motion enabled. These are material reflections and illustrative ripples, not simulated water conditions.

The sky shader converges to the same haze color used by fog and the scene background at the horizon. Dusk uses haze `#465669`. The blend spans vertical viewing directions from 0 to 0.22, retaining atmospheric variation above it. Low quality also applies this horizon blend after output-color conversion, matching Three's direct-rendered fog path without tone-mapping the haze twice; the extra output-space blend is limited to Low.

`mappedOverview` considers at most 48 candidate poses using twelve weighted sightlines per proposal, including podium samples at 6% of its height. The first 36 poses use three inclinations and twelve azimuths. If podium sightlines remain blocked, twelve higher fallback poses use a vertical direction component of 1.2; a fallback is accepted only when podium visibility and the overall penalized score improve. The helper favors the existing direction and lower angles.

Obstruction checks use conservative source-height boxes. A convex hull enclosing the candidate camera orbit and proposal bounds rejects irrelevant boxes before repeated sightline tests. For ordinary local longitude bounds, two corner projections produce exact box bounds; longitude-wrapping bounds use full vertex projection. These filters reduce camera-planning work without altering rendered geometry. Camera distance also accounts for the tallest proposal and viewport aspect. Box approximations and a finite candidate set do not guarantee every facade or podium is unobstructed. Selected-floor views and explicit photo angles retain their own camera poses. Full-screen presentation hides the editing dock, including `graphics=1` mode.

## Evidence and remaining limits

The [previous sales captures](qa/sales-gallery/final/) record the rejected baseline: [desktop](qa/sales-gallery/final/chrome-1440-presentation.png), [dusk](qa/sales-gallery/final/chrome-1440-dusk.png) and [phone](qa/sales-gallery/final/chrome-390-presentation.png). The [first skyline-detail captures](qa/skyline-detail/first/) record the initial implementation: [Jersey City](qa/skyline-detail/first/chrome-jersey-city.png), [New York](qa/skyline-detail/first/chrome-new-york.png), [dusk](qa/skyline-detail/first/chrome-dusk.png) and [phone](qa/skyline-detail/first/chrome-phone.png).

The first review recorded obstructed proposal views, broad water stripes, a hard horizon band, a visible debug dock in presentation and overly dark/clustered glazing. The source now contains the bounded corrections described above. Final verification remains pending, including the Low-quality horizon capture; these notes do not declare those findings closed or approved. The unchanged 100ms camera wall-time assertion remains an open timing finding: it has intermittently failed during parallel Node fixture work and browser startup. See the current [QA report](QA-REPORT.md).

This pass uses local snapshots, procedural materials/geometry and existing lighting assets. It introduces no paid API, new asset download or dependency. It does not establish photorealism, survey accuracy, global map coverage, sustained device performance or sales uplift; existing full-product launch limitations remain.

## Final verification — 2026-10-02

- Production build and TypeScript pass. All 105 tests pass with test files executed serially; no test is skipped and the 100ms camera budget remains unchanged. [Test log](qa/skyline-detail/tests-final.log).
- Chrome checks all 14 mapped areas and 390/768/1280/1920 widths; Firefox and WebKit check Jersey City day/dusk. The 27 browser result entries pass, with zero uncaught exceptions, zero shader failures and zero presentation-only axe violations. The final Low-only shader correction is additionally checked in Chrome with three matched viewport captures and actual Low-tier telemetry.
- Twenty-five final images are saved. [Day](qa/skyline-detail/final/chrome-jersey-city.png), [dusk](qa/skyline-detail/final/chrome-dusk.png), [dense Manhattan](qa/skyline-detail/final/chrome-new-york.png), [phone](qa/skyline-detail/final/chrome-phone.png), [Low phone](qa/skyline-detail/final/chrome-phone-low.png), [Low dusk](qa/skyline-detail/final/chrome-phone-low-dusk.png).
- The Low horizon test reproduces an 18-level adjacent-row color discontinuity in the [failing image](qa/skyline-detail/low-before.png). Corrected day and dusk measure 1 level against a maximum of 3. [Pixel regression](qa/skyline-detail/final/chrome-low-horizon.json).
- Final independent visual verdict: **ship this skyline rendering improvement**. All five reviewed visual issues are sufficiently resolved. Dense Manhattan retains real foreground overlap; this finite camera search does not promise every facade is unobstructed.

**Still open:** the camera wall-clock budget under concurrent work, existing Clock/Firefox warnings, sustained FPS and GPU/device benchmarks, native Safari/Edge/iOS/Android coverage, full-product launch checks and commercial savings/uplift claims. Recorded browser FPS samples include 14 in WebKit, 31 in Firefox and 40 in Chrome; these runs are render checks, not a performance pass. Failed timing logs are retained, and the unchanged budget is not marked resolved by serializing test fixtures.
