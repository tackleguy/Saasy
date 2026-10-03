#!/usr/bin/env python3
"""Build local, attributed map snapshots from a pinned Overture release.

Run with a temporary Python environment containing overturemaps==1.0.2 and
shapely==2.1.2. These are build tools, not application dependencies.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import subprocess
import sys
import threading
import time

from shapely import make_valid
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
RELEASE = "2026-09-23.1"
LAYERS = ("building", "building_part", "water", "segment")
ATTRIBUTION = "© OpenStreetMap contributors, Overture Maps Foundation"
LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/"
MAX_FEATURES = 12_000
MAX_VERTICES = 500_000
ROAD_CLASSES = {"motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "service", "unknown"}
DOWNLOAD_LOCK = threading.Lock()
LAST_DOWNLOAD = 0.0


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    temporary.replace(path)


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def height_fields(properties):
    """Recorded height always wins. Floor-derived height is explicitly estimated."""
    result = {"heightSource": "unknown"}
    if positive(properties.get("height")):
        result.update(height=properties["height"], heightSource="recorded")
    elif positive(properties.get("num_floors")):
        result.update(height=round(properties["num_floors"] * 3.2, 3), heightSource="levels")
    if positive(properties.get("min_height")):
        result["minHeight"] = properties["min_height"]
    elif positive(properties.get("min_floor")):
        result["minHeight"] = round(properties["min_floor"] * 3.2, 3)
    if "height" in result and result.get("minHeight", 0) >= result["height"]:
        # A floor-derived bottom can conflict with a recorded top. Neither
        # clamp the geometry nor invent a corrected measurement: show its
        # mapped footprint and retain both source values in provenance.
        return {"heightSource": "unknown"}
    return result


def components(geometry, polygonal):
    allowed = ("Polygon", "MultiPolygon") if polygonal else ("LineString", "MultiLineString")
    if geometry.geom_type in allowed:
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [piece for item in geometry.geoms for piece in components(item, polygonal)]
    return []


def clipped_geometry(raw, extent, polygonal):
    original = shape(raw)
    repaired = not original.is_valid
    if repaired:
        original = make_valid(original)
    clipped = original.intersection(extent)
    pieces = components(clipped, polygonal)
    if not pieces:
        return None, repaired
    result = unary_union(pieces)
    if result.is_empty:
        return None, repaired
    return mapping(result), repaired


def vertices(coordinates):
    if coordinates and isinstance(coordinates[0], (float, int)):
        return 1
    return sum(vertices(child) for child in coordinates)


def fetch_layer(site, layer, cache, offline):
    global LAST_DOWNLOAD
    fingerprint = hashlib.sha256(json.dumps(site["bounds"]).encode()).hexdigest()[:12]
    output = cache / RELEASE / f'{site["id"]}-{fingerprint}-{layer}.geojson'
    metadata = output.with_suffix(".metadata.json")
    if not output.exists():
        # A narrower area can reuse a recorded superset extract, preserving
        # its original query bounds and hash in provenance without more traffic.
        for candidate in sorted((cache / RELEASE).glob(f'{site["id"]}-*-{layer}.metadata.json')):
            details = json.loads(candidate.read_text())
            bounds = details.get("downloadBounds")
            target = site["bounds"]
            source = candidate.with_name(candidate.name.replace(".metadata.json", ".geojson"))
            if bounds and bounds[0] <= target[0] and bounds[1] <= target[1] and bounds[2] >= target[2] and bounds[3] >= target[3] and source.exists():
                output, metadata = source, candidate
                break
    if not output.exists():
        if offline:
            raise FileNotFoundError(f"Cached source is missing: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(".download.geojson")
        command = [sys.executable, "-m", "overturemaps", "download",
                   "--bbox=" + ",".join(map(str, site["bounds"])),
                   "--release", RELEASE, "--stac", "--connect_timeout", "20",
                   "--request_timeout", "60", "-f", "geojson", "--type", layer,
                   "-o", str(temporary)]
        started = time.monotonic()
        for attempt in range(3):
            # Spread metadata requests as well as limiting concurrent downloads.
            with DOWNLOAD_LOCK:
                time.sleep(max(0, 5 - (time.monotonic() - LAST_DOWNLOAD)))
                LAST_DOWNLOAD = time.monotonic()
            completed = subprocess.run(command, capture_output=True, text=True, timeout=240)
            if completed.returncode == 0:
                break
            if "429" not in completed.stderr or attempt == 2:
                break
            delay = 30 * (attempt + 1)
            print(f'{site["id"]}/{layer}: provider rate limit; retrying after {delay}s', flush=True)
            time.sleep(delay)
        if completed.returncode:
            raise RuntimeError(f'{site["id"]}/{layer}: {completed.stderr[-1500:]}')
        # Validate before a failed/partial download can replace a cached source.
        document = json.loads(temporary.read_text())
        if document.get("type") != "FeatureCollection" or not isinstance(document.get("features"), list):
            raise ValueError(f"Invalid FeatureCollection: {temporary}")
        temporary.replace(output)
        write_json(metadata, {"capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "downloadBounds": site["bounds"],
                              "seconds": round(time.monotonic() - started, 3)})
    document = json.loads(output.read_text())
    details = json.loads(metadata.read_text()) if metadata.exists() else {"capturedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    details.setdefault("downloadBounds", site["bounds"])
    details.update(layer=layer, count=len(document["features"]), bytes=output.stat().st_size,
                   sha256=hashlib.sha256(output.read_bytes()).hexdigest())
    return document["features"], details


def build_snapshot(site, layers, captured_at):
    extent = box(*site["bounds"])
    features, provenance = [], {}
    repairs, omitted = 0, 0

    def convert(raw, kind, source_layer):
        nonlocal repairs
        properties = raw.get("properties") or {}
        if kind == "building" and properties.get("is_underground"):
            return None
        # Water centre lines are not water surfaces. Keep polygons only.
        polygonal = kind != "road"
        geometry, repaired = clipped_geometry(raw["geometry"], extent, polygonal)
        repairs += int(repaired)
        if not geometry:
            return None
        identifier = f'{source_layer}:{raw["id"]}'
        feature = {"id": identifier, "kind": kind, "geometry": geometry}
        name = (properties.get("names") or {}).get("primary")
        if isinstance(name, str) and name.strip():
            feature["name"] = " ".join(name.split())[:160]
        if kind == "building":
            feature.update(height_fields(properties))
        features.append(feature)
        provenance[identifier] = {
            "id": raw["id"], "layer": source_layer,
            "sources": properties.get("sources", []),
            **{key: properties[key] for key in ("names", "building_id", "height", "min_height", "num_floors", "min_floor", "has_parts", "class", "subclass", "subtype", "width_rules", "level_rules", "road_flags") if key in properties},
        }
        return feature

    loaded_parents = set()
    for raw in layers["building_part"]:
        part = convert(raw, "building", "building_part")
        parent = (raw.get("properties") or {}).get("building_id")
        if part and parent:
            loaded_parents.add(parent)
    for raw in layers["building"]:
        if raw["id"] in loaded_parents:
            omitted += 1
            continue
        convert(raw, "building", "building")
    for raw in layers["water"]:
        convert(raw, "water", "water")
    for raw in layers["segment"]:
        properties = raw.get("properties") or {}
        if properties.get("subtype") != "road" or properties.get("class") not in ROAD_CLASSES:
            continue
        # Do not flatten explicitly underground roads into surface streets.
        rules = properties.get("level_rules") or []
        if rules and all((r.get("value") or 0) < 0 for r in rules):
            continue
        convert(raw, "road", "segment")
    features.sort(key=lambda feature: (feature["kind"], feature["id"]))
    count = sum(vertices(feature["geometry"]["coordinates"]) for feature in features)
    if len(features) > MAX_FEATURES or count > MAX_VERTICES:
        raise ValueError(f'{site["id"]}: budget exceeded ({len(features)} features, {count} vertices); narrow the source area, never silently truncate geography')
    snapshot = {
        "id": site["id"], "label": site["label"], "bounds": site["bounds"],
        "capturedAt": captured_at, "attribution": ATTRIBUTION,
        "sourceUrl": f"https://stac.overturemaps.org/{RELEASE}/catalog.json",
        "release": RELEASE, "license": "ODbL-1.0", "licenseUrl": LICENSE_URL,
        "provenanceUrl": f'/maps/provenance/{site["id"]}.json',
        "features": features,
    }
    stats = {
        "features": len(features), "vertices": count,
        "buildings": sum(f["kind"] == "building" for f in features),
        "recordedHeights": sum(f.get("heightSource") == "recorded" for f in features),
        "estimatedHeights": sum(f.get("heightSource") == "levels" for f in features),
        "unknownHeights": sum(f.get("heightSource") == "unknown" for f in features),
        "roads": sum(f["kind"] == "road" for f in features),
        "water": sum(f["kind"] == "water" for f in features),
        "outlinesReplacedByParts": omitted, "invalidGeometriesRepaired": repairs,
    }
    return snapshot, provenance, stats


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", action="append", help="Only build a named map-site ID (repeatable)")
    parser.add_argument("--cache", type=Path, default=Path("/tmp/aura-maps/raw"))
    parser.add_argument("--output", type=Path, default=ROOT / "public/maps")
    parser.add_argument("--offline", action="store_true", help="Rebuild from already downloaded source files")
    args = parser.parse_args()
    sites = json.loads((ROOT / "src/content/map-sites.json").read_text())
    if args.site:
        requested = set(args.site)
        if requested - {site["id"] for site in sites}:
            parser.error("Unknown site ID")
        sites = [site for site in sites if site["id"] in requested]
    for site in sites:
        # At most two public data requests are active at a time.
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            values = list(pool.map(lambda layer: fetch_layer(site, layer, args.cache, args.offline), LAYERS))
        layers = {layer: value[0] for layer, value in zip(LAYERS, values)}
        manifests = [value[1] for value in values]
        captured = max(item["capturedAt"] for item in manifests)
        snapshot, sources, stats = build_snapshot(site, layers, captured)
        write_json(args.output / f'{site["id"]}.json', snapshot)
        write_json(args.output / "provenance" / f'{site["id"]}.json', {
            "id": site["id"], "release": RELEASE, "capturedAt": captured,
            "attribution": ATTRIBUTION, "license": "ODbL-1.0", "licenseUrl": LICENSE_URL,
            "sourceUrl": snapshot["sourceUrl"], "bounds": site["bounds"],
            "tools": {name: importlib.metadata.version(name) for name in ("overturemaps", "shapely")},
            "transformations": ["Selected by source bounding box", "Clipped geometry to map bounds", "Retained building parts in place of their loaded parent outlines", "Excluded underground buildings and exclusively underground roads", "Retained vehicular road classes; excluded footways, paths, steps, pedestrian streets, cycleways, railways, and ferries", "Converted floor counts to estimated heights at 3.2 metres per floor when no height was recorded", "Kept footprints only where the minimum-height estimate conflicts with the top height", "Normalized display-name whitespace and limited labels to 160 characters; original names retained here", "Excluded water centre lines; no invented water polygon or building height"],
            "downloads": manifests, "statistics": stats, "features": sources,
        })
        print(json.dumps({"id": site["id"], **stats}), flush=True)


if __name__ == "__main__":
    main()
