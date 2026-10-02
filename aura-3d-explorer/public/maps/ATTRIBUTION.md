# Map data attribution and license


These neighborhood map databases are derived from Overture Maps release **2026-09-23.1**. They are made available under the **Open Database License (ODbL) 1.0**. The map data license is separate from AURA's application code license.

- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)
- [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [bundled license text](./LICENSE-ODbL-1.0.txt)
- [Overture attribution and licensing](https://docs.overturemaps.org/attribution/)
- [Pinned source catalog](https://stac.overturemaps.org/2026-09-23.1/catalog.json)

Contributing sources in these extracts include OpenStreetMap; Microsoft's Global ML Building Footprints (ODbL); USGS 3D Elevation Program / USGS Lidar height data; TomTom transportation data; Instituto Geográfico Nacional (España); and [Esri Community Maps contributors](https://communitymaps.arcgis.com/) (CC BY 4.0). Work derived from [BTN 2024, IGN](https://www.ign.es/) is available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Each map's `provenance/<map-id>.json` preserves the exact upstream source records, source license values, feature identifiers, update dates, and height provenance. Consult those records for the sources of an individual feature.

The downloadable `<map-id>.json` files contain the transformed map databases. Their corresponding provenance files record the transformation and original identifiers. Transformations select a neighborhood, clip geometry to its bounds, retain loaded building parts in place of their parent outlines, omit underground buildings and exclusively underground roads, and select vehicular road classes. Water center lines, footways, paths, steps, pedestrian streets, cycleways, railways, and ferries are excluded. Missing building heights remain unknown unless a recorded floor count supports an explicitly marked estimate of 3.2 metres per floor. No replacement height is invented for an unknown building.

Coordinates remain WGS84 longitude/latitude in GeoJSON order. Building positions, footprint holes, and water boundaries derive from the source geometry. These are map-derived models, not architectural surveys or photorealistic facade models. The example project pins identify demonstration locations, not verified project addresses.

License text was obtained from the [SPDX license list](https://github.com/spdx/license-list-data/blob/main/text/ODbL-1.0.txt), which reproduces the linked ODbL 1.0 terms.
