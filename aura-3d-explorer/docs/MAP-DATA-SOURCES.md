# Geographic skyline data

The skyline context uses local neighborhood extracts from **Overture Maps release 2026-09-23.1**, retrieved on **2026-10-02**. Building outlines and parts carry actual longitude/latitude coordinates. Water polygons and road center lines use that same coordinate reference system. No customer request calls a public mapping API, no API key is required, and no Sketchfab asset is downloaded or changed by this pipeline.

## Sources and attribution

- [Overture buildings](https://docs.overturemaps.org/guides/buildings/) supplies global building footprints, building parts, optional recorded heights, floor counts, and upstream source identifiers.
- [Overture transportation](https://docs.overturemaps.org/guides/transportation/) supplies road center lines.
- [Overture base data](https://docs.overturemaps.org/guides/base/) supplies water polygons.
- [Pinned STAC catalog](https://stac.overturemaps.org/2026-09-23.1/catalog.json) identifies the exact release, avoiding silent changes when a later dataset is published.
- [Attribution and licensing](https://docs.overturemaps.org/attribution/) identifies the ODbL license and upstream contributors. The public data includes [its attribution notice](../public/maps/ATTRIBUTION.md), the full ODbL text, and feature-level provenance files.

The example locations and download bounds are declared in `src/content/map-sites.json`. They are chosen demonstration locations; none is presented as the verified address of a project.

## Reproduce the data

The extractor is a build-time tool. It adds no browser or application dependency. Use a temporary Python environment with Python 3.12 and these pinned packages:

```sh
uv run --with overturemaps==1.0.2 --with shapely==2.1.2 \
  python scripts/maps/fetch-context.py
```

To regenerate only one area or use already downloaded sources:

```sh
uv run --with overturemaps==1.0.2 --with shapely==2.1.2 \
  python scripts/maps/fetch-context.py --site jersey-city --offline
```

The source cache defaults to `/tmp/aura-maps/raw`, with release, map ID, and a bounding-box fingerprint in its path. `--cache` and `--output` accept other locations. At most two public source requests run concurrently, starts are spaced five seconds apart, and HTTP429 triggers bounded backoff. Downloads and generated files are validated before atomic replacement. A failed fetch does not replace the published snapshot with a partial file. Overture retires older remote releases; retain the source cache for later exact rebuilds. The committed public snapshots continue to work independently of remote release retention.

`public/maps/<id>.json` is the runtime snapshot. `public/maps/provenance/<id>.json` preserves each retained feature's Overture ID, exact upstream `sources` entries, recorded height/levels, source download hashes, tool versions, transformations, and counts. The runtime snapshot links to that provenance. The public ODbL data remains downloadable alongside the application.

## Transformation rules

1. Select source features intersecting the declared bounds, then clip their geometry to those bounds. The source API selects bounding boxes; it does not clip large rivers or long road segments itself. Polygon holes and multipart geometry are preserved.
2. Prefer `building_part` records where their actual parent `building_id` is present in the downloaded data. A `has_parts` flag alone never deletes a building whose parts are missing.
3. Use recorded `height` and `min_height` without rescaling. If height is absent, a known floor count becomes a height estimate at 3.2 m per floor and is marked `heightSource: "levels"`. Otherwise height stays absent and `heightSource: "unknown"`; the renderer can show only its footprint. A minimum-floor estimate that reaches above the recorded top also remains footprint-only instead of producing inverted or invented geometry. Original measurements stay in provenance.
4. Exclude explicitly underground buildings and roads whose level rules are exclusively below ground. Road rendering uses vehicular classes, preserving the selected center-line coordinates; sidewalks, steps, paths, cycleways, pedestrian streets, railways, and ferries are excluded.
5. Retain water polygons, including holes and islands. Water center lines never become invented rectangular water surfaces.
6. Reject outputs beyond 12,000 features or 500,000 vertices. The extractor fails rather than randomly removing buildings to meet a limit.

The data models real positions and source-supported massing. Optional roof-shape and facade details are not reconstructed by these flat-roof footprint extrusions. Road grade, terrain elevation, and photographic facade textures are not supplied by the runtime snapshots. Unknown source heights and example pins remain explicit.

## Verification

Offline converter regressions cover recorded versus estimated versus unknown height, minimum-height semantics, water clipping with an island hole, road clipping, missing building parts, and underground parts that must not hide an above-ground parent. Run them with the same temporary Python environment:

```sh
uv run --with overturemaps==1.0.2 --with shapely==2.1.2 \
  python -m unittest discover -s scripts/maps -p 'test_*.py'
```

All **14 snapshots** pass `node --import tsx scripts/maps/validate-snapshots.mjs`: the runtime schema, every vertex inside its published coverage, all example pins inside coverage, preserved recorded heights, correctly marked floor estimates, unknown-height footprints, source records, and download hashes. The **9 converter regressions** pass. A complete offline rebuild from cached source files also passes.

The selected areas contain **66,372 building footprints/parts**, **24,287 vehicular road segments**, and **720 water polygons**. Each area is within the 12,000-feature/500,000-vertex limits. Raw snapshot JSON totals 34.85 MB across all 14 areas (8.61 MB when gzip-compressed for comparison); an explorer loads its one selected area. Provenance is a separate download and is not required for rendering.

| Area | Buildings/parts | Recorded heights | Estimated from floors | Unknown height | Roads | Water | JSON MB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jersey-city | 5,501 | 5,147 | 76 | 278 | 1,615 | 89 | 2.69 |
| miami-beach | 2,172 | 1,836 | 57 | 279 | 1,066 | 93 | 1.15 |
| chicago | 2,328 | 1,438 | 349 | 541 | 1,701 | 118 | 1.58 |
| dubai | 1,827 | 543 | 129 | 1,155 | 2,231 | 32 | 1.46 |
| toronto | 4,177 | 1,381 | 1,976 | 820 | 1,656 | 45 | 2.20 |
| bayonne | 6,048 | 4,201 | 8 | 1,839 | 1,101 | 5 | 2.25 |
| lorenskog | 5,759 | 3,307 | 37 | 2,415 | 1,525 | 12 | 2.50 |
| madrid | 7,417 | 365 | 2,205 | 4,847 | 1,876 | 96 | 4.06 |
| london | 6,787 | 2,592 | 2,043 | 2,152 | 2,497 | 24 | 3.46 |
| seattle | 2,226 | 1,603 | 295 | 328 | 1,646 | 16 | 1.57 |
| new-york | 7,725 | 7,596 | 26 | 103 | 933 | 34 | 3.26 |
| los-angeles | 3,568 | 3,292 | 157 | 119 | 2,598 | 107 | 2.62 |
| san-francisco | 7,516 | 6,529 | 536 | 451 | 2,076 | 40 | 4.21 |
| boston | 3,321 | 2,471 | 675 | 175 | 1,766 | 9 | 1.84 |

During validation, the initial Madrid, London, and Midtown bounds exceeded the feature budget. Their published coverage was explicitly narrowed in the site catalog; every building inside the new bounds was retained. Two Seattle building parts had minimum-floor estimates exceeding recorded top heights. Those parts remain as footprints and keep the source values in provenance. No height was clamped or fabricated to pass validation.

The Overture metadata service returned one HTTP429 during extraction. Request spacing/backoff handled it; no failed request replaced a published snapshot. Public customer runtime does not depend on that service.

