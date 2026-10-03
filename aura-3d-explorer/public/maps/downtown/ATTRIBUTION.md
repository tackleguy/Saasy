# Downtown map context

© OpenStreetMap contributors and Overture Maps Foundation.

This derived database uses Overture Maps release **2026-09-23.1** and is available
under the [Open Database License 1.0](../LICENSE-ODbL-1.0.txt).

- [Overture building data and source documentation](https://docs.overturemaps.org/guides/buildings/)
- [Pinned source catalog](https://stac.overturemaps.org/2026-09-23.1/catalog.json)
- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)

Each area has a `manifest.json` describing coverage and every runtime tile, and
one shared `provenance.json` containing source identifiers, attribution records,
original height metadata, download timestamps, input SHA-256 hashes and exact
transformations. Source attribution is retained once per area rather than copied
into every tile.

The bounds in `src/content/downtown-areas.json` are broad downtown **viewing
envelopes**, not administrative boundaries. They include surrounding waterfronts
and adjoining central neighbourhoods so the skyline does not stop at the original
project-area rectangle. The original near-detail rectangle is removed from these
tiles because AURA renders it from its existing detailed snapshot.

Geometry is clipped to those two boundaries and partitioned into approximately
1.75 km tiles. There is no random building thinning and no source-geometry
simplification. Polygon holes, building parts and recorded heights are retained.
Features spanning a tile edge keep the same source identifier. Source floor counts
become explicitly estimated heights at 3.2 m per floor only when no recorded
height exists. Missing or inconsistent heights remain flat footprints.

Façade materials and decorative details in the application are illustrative;
they are not part of this geographic source database. This is mapped context,
not a survey or photogrammetric reconstruction, and source coverage may include
outdated records or omit structures.
