# Downtown coverage

AURA’s local map context now covers the broader downtown around each built-in example site. The original near-detail snapshots remain in place; additional mapped buildings, roads and water extend the context beyond those small rectangles.

These are deliberately broad **viewing envelopes**, not official administrative or neighbourhood boundaries. The map sources are pinned to Overture Maps release **2026-09-23.1**. Public example project pins and the original near-map coverage definitions are unchanged; this work does not establish or change a customer project’s real address.

## Coverage

Jersey City now has a **126.19 km²** viewing envelope, spanning the Jersey City and Hoboken waterfronts, the Hudson River, Lower Manhattan, Midtown and the surrounding river shores. New York uses the same source envelope, with a different near-detail exclusion matching its Midtown example site. This preserves the surrounding urban fabric instead of stopping the skyline at the former project-area rectangle.

Bounds below use **west longitude, south latitude, east longitude, north latitude** in WGS84. Coverage area is the approximate area of the whole viewing envelope, including its separately rendered near-detail rectangle; it is not a land-only or administrative area measurement.

| Area | Bounds (west, south, east, north) | Coverage | Outer tiles | Tile features |
| --- | --- | ---: | ---: | ---: |
| Jersey City, Lower Manhattan and Midtown | `-74.075, 40.686, -73.947, 40.791` | 126.19 km² | 47 | 125,445 |
| Manhattan and the Hudson waterfront | `-74.075, 40.686, -73.947, 40.791` | 126.19 km² | 49 | 124,052 |
| Downtown Miami, Brickell and Miami Beach | `-80.222, 25.744, -80.105, 25.832` | 114.88 km² | 42 | 44,094 |
| Downtown Chicago and the lakefront | `-87.665, 41.851, -87.588, 41.927` | 53.99 km² | 20 | 32,250 |
| Downtown Dubai, DIFC and Business Bay | `55.23, 25.15, 55.329, 25.245` | 105.46 km² | 42 | 62,119 |
| Downtown Toronto and the waterfront | `-79.438, 43.62, -79.332, 43.685` | 61.78 km² | 24 | 57,759 |
| Bayonne and the Upper Bay waterfront | `-74.163, 40.624, -74.055, 40.716` | 93.39 km² | 36 | 60,133 |
| Lørenskog town centre and surrounding neighbourhoods | `10.903, 59.894, 11.013, 59.962` | 46.45 km² | 20 | 24,047 |
| Central Madrid | `-3.742, 40.392, -3.652, 40.481` | 75.55 km² | 29 | 92,929 |
| Central London and Canary Wharf | `-0.174, 51.478, 0.019, 51.538` | 89.32 km² | 32 | 125,231 |
| Downtown Seattle and the central waterfront | `-122.379, 47.579, -122.306, 47.643` | 39.03 km² | 19 | 31,902 |
| Downtown Los Angeles | `-118.29, 34.012, -118.205, 34.091` | 68.95 km² | 29 | 72,288 |
| Downtown San Francisco and the northeast waterfront | `-122.455, 37.749, -122.353, 37.819` | 69.93 km² | 29 | 53,800 |
| Downtown Boston, Back Bay and the harbour | `-71.12, 42.321, -70.998, 42.384` | 70.39 km² | 29 | 57,007 |

**What each envelope includes:**

- **Jersey City, Lower Manhattan and Midtown:** Jersey City and Hoboken waterfront, Lower Manhattan, Midtown and the surrounding river shores.
- **Manhattan and the Hudson waterfront:** Lower Manhattan through Midtown and Central Park South, with the Hudson and East River waterfronts.
- **Downtown Miami, Brickell and Miami Beach:** Downtown Miami, Brickell, Biscayne Bay and South/Mid Beach.
- **Downtown Chicago and the lakefront:** The Loop, West Loop, River North, Streeterville, South Loop and adjoining lakefront.
- **Downtown Dubai, DIFC and Business Bay:** Downtown Dubai, Business Bay and the DIFC/SZ Road skyline.
- **Downtown Toronto and the waterfront:** Downtown Toronto from the Exhibition waterfront to the Don River and north to Bloor Street.
- **Bayonne and the Upper Bay waterfront:** The Bayonne peninsula, Broadway downtown, Newark Bay and Upper Bay waterfront.
- **Lørenskog town centre and surrounding neighbourhoods:** Lørenskog centre, Solheim, Skårer, Lørenskog station and the neighbouring town fabric.
- **Central Madrid:** Madrid's historic centre, Retiro, Chamberí and the Castellana business corridor.
- **Central London and Canary Wharf:** Westminster, West End, the City, South Bank, London Bridge and Canary Wharf.
- **Downtown Seattle and the central waterfront:** Downtown, Pioneer Square, Belltown, Seattle Center, South Lake Union and the waterfront.
- **Downtown Los Angeles:** Downtown LA, Bunker Hill, Civic Center, Arts District, South Park and Chinatown.
- **Downtown San Francisco and the northeast waterfront:** Financial District, Union Square, SoMa, Mission Bay, North Beach and the northern waterfront.
- **Downtown Boston, Back Bay and the harbour:** Downtown, Back Bay, North End, Charlestown, Seaport and the inner harbour.

There are **447 outer-context tiles**, containing **963,056 tile feature records** and **8,099,920 source vertices** across the 14 packages. These are not globally unique feature or building counts: source features may be split across tile boundaries, and the Jersey City and New York packages cover much of the same geography. Each manifest separately records unique source-feature counts within its own package.

## How near and outer coverage fit together

The builder subtracts the exact near-detail rectangle from every outer source layer before partitioning it into tiles. It then clips the remaining geometry to an approximately 1.75 km grid. Polygon holes and source building parts survive these operations. Tile interiors do not overlap, and no outer geometry occupies the near-detail interior. Adjacent pieces can share a boundary and keep the same source identifier.

There is no random thinning of buildings and no source-geometry simplification. A dense tile is recursively subdivided if it exceeds 12,000 features, 500,000 vertices or a 12 MiB serialized-response budget. The largest installed tile is 2,888,498 bytes. Per-area manifests identify every tile and its bounds, feature count and vertex count. Shared provenance is stored once per area, rather than duplicated in every tile.

## Source accuracy and limitations

- Recorded source heights are retained. Where only a floor count exists, a height of 3.2 metres per floor is explicitly marked as an estimate.
- Missing heights and conflicting minimum/top-height values remain flat footprints. They do not become invented towers. Height completeness varies by city and is particularly uneven outside well-mapped high-rise cores.
- Source building parts replace their parent outline where those parts are available. Underground structures and exclusively underground roads are excluded; vehicular road segments and polygonal water are retained.
- Footprints, heights and source dates do not establish survey-grade accuracy. Open-data records can be incomplete or outdated and may include planned or altered structures. The coverage envelopes do not promise an exact reconstruction of every current building.
- Application façade materials and decorative roof/street details are illustrative. Those finishes are not supplied by the geographic source database.
- Public example pins remain examples. No customer coordinates are read or transmitted by this build pipeline, and runtime downtown assets are served locally by AURA.

## Reproduction and attribution

Definitions are in `src/content/downtown-areas.json`. The builder is `scripts/maps/fetch-downtown.py`; it uses the pinned release and source conversion rules shared with `scripts/maps/fetch-context.py`. Each area’s `provenance.json` records download bounds and timestamps, input SHA-256 hashes, tool versions, source identifiers, upstream attribution, original height metadata and transformations. Runtime manifests and tiles are in `public/maps/downtown/<area>/`.

```sh
UV_CACHE_DIR=/tmp/aura-map-uv-cache uv run \
  --with overturemaps==1.0.2 --with shapely==2.1.2 \
  python scripts/maps/fetch-downtown.py --discard-downloads
node --import tsx scripts/maps/validate-downtown.mjs
UV_CACHE_DIR=/tmp/aura-map-uv-cache uv run \
  --with overturemaps==1.0.2 --with shapely==2.1.2 \
  python -m unittest discover -s scripts/maps -p 'test_*.py'
```

Repeat `--site <id>` to rebuild selected areas. The dedicated raw download cache defaults to `/tmp/aura-downtown/raw`; it is separate from the existing near-map source cache. Omit `--discard-downloads` to preserve those new extracts for a subsequent `--offline` rebuild. Downloads are bounded, use provider rate-limit backoff, and are shared for the two Hudson/Manhattan packages. The pinned release must remain available upstream unless its raw extracts have been retained.

© OpenStreetMap contributors and Overture Maps Foundation. This derived database is distributed under **ODbL 1.0**, with the license in `public/maps/LICENSE-ODbL-1.0.txt` and additional attribution in `public/maps/downtown/ATTRIBUTION.md`.

- [Overture buildings and building-parts documentation](https://docs.overturemaps.org/guides/buildings/)
- [Overture Python download client](https://docs.overturemaps.org/getting-data/overturemaps-py/)
- [Pinned Overture source catalog](https://stac.overturemaps.org/2026-09-23.1/catalog.json)
- [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)

## Verification status — 2026-10-02

**Data verification passed:** all 14 installed packages and all 447 tiles pass the application’s existing snapshot schema, response-size limits, coordinate bounds, near-area exclusion, provenance/source-hash checks, recorded/estimated/unknown-height checks, and manifest total checks. All 16 Python conversion tests pass, including seven downtown regressions for near subtraction, preserved water holes, partition completeness, non-overlapping interiors, density/byte subdivision and height handling.

**Browser and runtime verification: pending integration.** Source-data checks do not certify loading time, frame rate, GPU memory, camera composition, seams, visual quality or browser compatibility. Those results and screenshots must be added after the integrated rendering audit. This document is not launch approval.
