# Skyline street-detail audit

Date: 2026-10-02

## Findings before changes

1. **High — existing street dressing ignores mapped obstacles.** `MappedSiteDetails` only checks a circular approximation of proposed towers. Existing lamp and pedestrian anchors, and park trees, can overlap mapped building footprints or water. Polygon holes and the full size of the placed object are not considered.
2. **Medium — streets lack useful scale cues.** Streets are mostly continuous dark bands. Vegetation is restricted to a few mapped parks, leaving nearby mapped streets without street trees or parked vehicles to establish architectural scale.
3. **Medium — street detail has a fixed budget across device quality.** The same potential tree and lamp counts are prepared for every quality tier.

## Agreed design decision

Add sparse, deterministic street trees and parked vehicles only beside existing mapped road centre lines. Road widths, planting and parked vehicles are illustrative presentation detail, not surveyed conditions. Keep all source road paths, building footprints, heights, water boundaries and holes unchanged. Use full-footprint obstacle checks and bounded instance counts; do not invent roads, plazas or water.

## Verification

Implemented full-footprint obstacle checks with a near-site spatial index. Trees, parked cars, lamp anchors and pedestrian anchors reject mapped buildings, water, and actual proposal floor outlines. Courtyard and water polygon holes remain usable only when the entire placed footprint fits. Reserved details cannot overlap one another. Source road coordinates and the existing road visibility rule remain unchanged.

Street trees and parked cars use deterministic positions beside existing source road segments within 85 scene units of the project. Planting stays modest; vehicle paint uses four muted colours. The additions use instancing, no assets, textures or new dependencies.

| Quality | Total trees, including parks | Parked cars | Lamps | Pedestrian anchors |
| --- | ---: | ---: | ---: | ---: |
| Low | 24 | 0 | 24 | 0 |
| Medium | 48 | 20 | 44 | 28 |
| High | 72 | 36 | 64 | 44 |

The street component has at most ten mesh draw batches, excluding the pre-existing People component and shadow passes: three ground surfaces, two vegetation batches, two lamp batches and three vehicle batches. Low quality adds no vehicle draws. Each tree uses five instanced canopy clusters; each car uses one body, one glazing volume and four wheels. Source road strips are capped at 1,800 segments.

Validation: all five `mapped-street-placement.test.ts` tests pass, covering shoreline/wall overlap with an otherwise clear centre, holes, rotated proposals, multipolygons, detail collisions, deterministic placement and quality limits. TypeScript passes. Shared browser review remains with the main task; this record does not claim a visual pass.
