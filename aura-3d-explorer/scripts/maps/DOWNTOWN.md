# Rebuilding the downtown context

The input definitions are the fixed public viewing envelopes in
`src/content/downtown-areas.json`. The builder does not read or transmit customer
project coordinates. Original detailed map snapshots are separate inputs and
are never modified by this script.

```sh
UV_CACHE_DIR=/tmp/aura-map-uv-cache uv run \
  --with overturemaps==1.0.2 --with shapely==2.1.2 \
  python scripts/maps/fetch-downtown.py --discard-downloads
node --import tsx scripts/maps/validate-downtown.mjs
UV_CACHE_DIR=/tmp/aura-map-uv-cache uv run \
  --with overturemaps==1.0.2 --with shapely==2.1.2 \
  python -m unittest discover -s scripts/maps -p 'test_*.py'
```

Use repeatable `--site <id>` arguments to rebuild specific areas. `--offline`
requires cached extracts; omit `--discard-downloads` to preserve new downloads
for subsequent offline regeneration. The dedicated default downtown cache is
`/tmp/aura-downtown/raw`, distinct from the existing near-map source cache.
Discarding downloads removes only the freshly generated files for the exact
source ID and bounds hash that have just been converted; the resulting data and
provenance hashes remain in `public/maps/downtown`.

The pinned release is inherited from `fetch-context.py`. All four source layers
(buildings, building parts, polygon water and vehicular road segments) are
fetched with bounded requests and provider rate-limit backoff. Jersey City and
New York share one source envelope download, while their separately masked
tiles match their own original near-detail coverage.

Tiles are recursively subdivided if they exceed 12,000 features, 500,000 vertices
or a 12 MiB serialized response budget. Geography is never randomly discarded
to fit those limits. The manifest records tile totals separately from unique
source counts because features crossing tile edges appear in multiple tiles.
Validation checks every installed tile against the application's real schema,
source heights, bounds, near-area exclusion, response-size budget and source
provenance. Offline conversion tests verify preservation of holes, the union of
partitioned geometry, non-overlapping interiors and density/byte subdivision.
