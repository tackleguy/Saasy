#!/usr/bin/env python3
"""Fetch pinned public downtown map envelopes and emit bounded local runtime tiles.

No customer location is read or transmitted. Coordinates come only from the
checked-in downtown-areas.json public viewing envelopes. These deliberately
broad rectangles are visualization coverage, not official district boundaries.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import math
from pathlib import Path
from shapely.geometry import box, mapping, shape
from shapely.strtree import STRtree

SPEC = importlib.util.spec_from_file_location("fetch_context", Path(__file__).with_name("fetch-context.py"))
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)
ROOT = BASE.ROOT
TILE_METRES = 1750
MAX_TILE_BYTES = 12 * 1024 * 1024


def prepare_features(area, near_bounds, layers):
    """Preserve source topology and heights, with the near-detail rectangle removed."""
    extent = box(*area["bounds"]).difference(box(*near_bounds))
    features, provenance = [], {}
    repairs, omitted = 0, 0

    def convert(raw, kind, source_layer):
        nonlocal repairs
        properties = raw.get("properties") or {}
        if kind == "building" and properties.get("is_underground"):
            return None
        geometry, repaired = BASE.clipped_geometry(raw["geometry"], extent, kind != "road")
        repairs += int(repaired)
        if not geometry:
            return None
        identifier = f'{source_layer}:{raw["id"]}'
        feature = {"id": identifier, "kind": kind, "geometry": geometry}
        name = (properties.get("names") or {}).get("primary")
        if isinstance(name, str) and name.strip():
            feature["name"] = " ".join(name.split())[:160]
        if kind == "building":
            feature.update(BASE.height_fields(properties))
        features.append(feature)
        provenance[identifier] = {"id": raw["id"], "layer": source_layer,
            "sources": properties.get("sources", []),
            **{key: properties[key] for key in ("names", "building_id", "height", "min_height", "num_floors", "min_floor", "has_parts", "class", "subclass", "subtype", "width_rules", "level_rules", "road_flags") if key in properties}}
        return feature

    # Parent replacement must consider the whole downloaded envelope: a part
    # wholly inside near coverage still replaces its parent's distant outline.
    parents = {(raw.get("properties") or {}).get("building_id") for raw in layers["building_part"]
               if not (raw.get("properties") or {}).get("is_underground")
               and shape(raw["geometry"]).intersects(box(*area["bounds"]))}
    for raw in layers["building_part"]:
        convert(raw, "building", "building_part")
    for raw in layers["building"]:
        if raw["id"] in parents:
            omitted += 1
        else:
            convert(raw, "building", "building")
    for raw in layers["water"]:
        convert(raw, "water", "water")
    for raw in layers["segment"]:
        properties = raw.get("properties") or {}
        if properties.get("subtype") != "road" or properties.get("class") not in BASE.ROAD_CLASSES:
            continue
        rules = properties.get("level_rules") or []
        if rules and all((r.get("value") or 0) < 0 for r in rules):
            continue
        convert(raw, "road", "segment")
    features.sort(key=lambda feature: (feature["kind"], feature["id"]))
    return features, provenance, {"outlinesReplacedByParts": omitted, "invalidGeometriesRepaired": repairs}


def grid(bounds, metres=TILE_METRES):
    west, south, east, north = bounds
    rows = max(1, math.ceil((north-south)*111_320/metres))
    columns = max(1, math.ceil((east-west)*111_320*math.cos(math.radians((south+north)/2))/metres))
    for row in range(rows):
        for column in range(columns):
            yield f"{column}-{row}", [west+(east-west)*column/columns, south+(north-south)*row/rows,
                                      west+(east-west)*(column+1)/columns, south+(north-south)*(row+1)/rows]


def tile_features(features, bounds):
    extent = box(*bounds)
    result = []
    for feature in features:
        geometry, _ = BASE.clipped_geometry(feature["geometry"], extent, feature["kind"] != "road")
        if geometry:
            result.append({**feature, "geometry": geometry})
    return result


def bounded_tiles(features, bounds, tile_id, max_features=BASE.MAX_FEATURES, max_vertices=BASE.MAX_VERTICES, depth=0, max_bytes=MAX_TILE_BYTES):
    clipped = tile_features(features, bounds)
    count = sum(BASE.vertices(f["geometry"]["coordinates"]) for f in clipped)
    # Reserve metadata overhead; the actual serialized snapshot is checked too.
    byte_count = len(json.dumps(clipped, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    if len(clipped) <= max_features and count <= max_vertices and byte_count <= max_bytes - 4096:
        yield tile_id, bounds, clipped, count
        return
    if depth > 16:
        raise ValueError(f"Unable to partition dense geography safely: {tile_id}")
    west, south, east, north = bounds
    mid_x, mid_y = (west+east)/2, (south+north)/2
    children = [(west,south,mid_x,mid_y), (mid_x,south,east,mid_y), (west,mid_y,mid_x,north), (mid_x,mid_y,east,north)]
    for index, child in enumerate(children):
        yield from bounded_tiles(clipped, list(child), f"{tile_id}-{index}", max_features, max_vertices, depth+1, max_bytes)


def build_area(area, near, layers, downloads, output):
    features, sources, extra_stats = prepare_features(area, near["bounds"], layers)
    captured = max(item["capturedAt"] for item in downloads)
    source_url = f"https://stac.overturemaps.org/{BASE.RELEASE}/catalog.json"
    common = {"capturedAt": captured, "attribution": BASE.ATTRIBUTION,
              "sourceUrl": source_url, "release": BASE.RELEASE,
              "license": "ODbL-1.0", "licenseUrl": BASE.LICENSE_URL,
              "provenanceUrl": f'/maps/downtown/{area["id"]}/provenance.json'}
    geometries = [shape(f["geometry"]) for f in features]
    index = STRtree(geometries)
    tiles = []
    total_vertices = 0
    total_features = 0
    for tile_key, bounds in grid(area["bounds"]):
        candidates = [features[int(i)] for i in index.query(box(*bounds), predicate="intersects")]
        candidates.sort(key=lambda feature: (feature["kind"], feature["id"]))
        for key, tile_bounds, tile_data, count in bounded_tiles(candidates, bounds, tile_key):
            if not tile_data:
                continue
            tile_id = f'{area["id"]}-downtown-{key}'
            relative = f"tiles/{key}.json"
            snapshot = {**common, "id": tile_id, "label": area["label"], "bounds": tile_bounds, "features": tile_data}
            serialized_bytes = len(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + 1
            if serialized_bytes > MAX_TILE_BYTES:
                raise ValueError(f"Tile exceeds runtime byte budget: {tile_id}")
            BASE.write_json(output / area["id"] / relative, snapshot)
            tiles.append({"id": tile_id, "url": f'/maps/downtown/{area["id"]}/{relative}',
                          "bounds": tile_bounds, "features": len(tile_data), "vertices": count})
            total_vertices += count
            total_features += len(tile_data)
    stats = {"tiles": len(tiles), "features": total_features, "vertices": total_vertices,
             "uniqueFeatures": len(features),
             "buildings": sum(f["kind"] == "building" for f in features),
             "recordedHeights": sum(f.get("heightSource") == "recorded" for f in features),
             "estimatedHeights": sum(f.get("heightSource") == "levels" for f in features),
             "unknownHeights": sum(f.get("heightSource") == "unknown" for f in features),
             "roads": sum(f["kind"] == "road" for f in features), "water": sum(f["kind"] == "water" for f in features),
             "coverageSquareKilometres": round(box(*area["bounds"]).area*111.32**2*math.cos(math.radians((area["bounds"][1]+area["bounds"][3])/2)), 2),
             **extra_stats}
    manifest = {**common, "version": 1, "id": area["id"], "label": area["label"], "bounds": area["bounds"],
                "nearBounds": near["bounds"], "coverage": area["coverage"], "tileSizeMetres": TILE_METRES,
                "statistics": stats, "tiles": tiles}
    BASE.write_json(output / area["id"] / "manifest.json", manifest)
    BASE.write_json(output / area["id"] / "provenance.json", {**common, "id": area["id"], "bounds": area["bounds"],
        "nearBounds": near["bounds"], "tools": {name: importlib.metadata.version(name) for name in ("overturemaps", "shapely")},
        "transformations": ["Selected public downtown viewing envelopes; these are not official administrative boundaries",
            "Clipped to documented bounds and subtracted near-detail coverage without simplifying source geometry",
            "Partitioned all remaining geography into bounded runtime tiles; recursively subdivided if required, never randomly dropped features",
            "Retained polygon holes, source building parts and recorded heights; floor-derived heights are explicitly estimated at 3.2 m per floor",
            "Kept missing or conflicting heights as flat footprints",
            "Replaced loaded building parent outlines with parts; excluded underground buildings and exclusively underground roads",
            "Retained vehicular road classes; water centre lines are not rendered as water surfaces",
            "Tile boundaries may divide a source feature; its identifier and shared provenance remain stable across pieces"],
        "downloads": downloads, "statistics": stats, "features": sources})
    print(json.dumps({"id": area["id"], **stats}), flush=True)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", action="append")
    parser.add_argument("--cache", type=Path, default=Path("/tmp/aura-downtown/raw"))
    parser.add_argument("--output", type=Path, default=ROOT / "public/maps/downtown")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--discard-downloads", action="store_true", help="Remove only this dedicated downtown cache after each source group is built")
    args = parser.parse_args()
    areas = json.loads((ROOT / "src/content/downtown-areas.json").read_text())
    sites = {site["id"]: site for site in json.loads((ROOT / "src/content/map-sites.json").read_text())}
    if args.site:
        requested = set(args.site)
        if requested - {area["id"] for area in areas}:
            parser.error("Unknown downtown area ID")
        areas = [area for area in areas if area["id"] in requested]
    grouped = {}
    for area in areas:
        grouped.setdefault((area.get("sourceId", area["id"]), tuple(area["bounds"])), []).append(area)
    for (source_id, bounds), group in grouped.items():
        query = {"id": source_id, "bounds": list(bounds)}
        layers, downloads = {}, []
        for layer in BASE.LAYERS:
            print(f"Downloading public downtown {source_id}/{layer}", flush=True)
            raw, details = BASE.fetch_layer(query, layer, args.cache, args.offline)
            layers[layer] = raw
            downloads.append(details)
        for area in group:
            build_area(area, sites[area["id"]], layers, downloads, args.output)
        if args.discard_downloads:
            # Scope is exactly this source's bounds-keyed generated files, never
            # the older source cache or another envelope sharing the prefix.
            fingerprint = hashlib.sha256(json.dumps(query["bounds"]).encode()).hexdigest()[:12]
            for generated in (args.cache / BASE.RELEASE).glob(f"{source_id}-{fingerprint}-*"):
                if generated.suffix in (".geojson", ".json"):
                    generated.unlink()
        del layers


if __name__ == "__main__":
    main()
