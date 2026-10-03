"""Offline regressions for geography-preserving map conversion."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from shapely.geometry import box, mapping, shape

SPEC = importlib.util.spec_from_file_location("fetch_context", Path(__file__).with_name("fetch-context.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def feature(identifier, properties=None, geometry=None):
    return {"id": identifier, "type": "Feature", "properties": properties or {},
            "geometry": geometry or mapping(box(1, 1, 2, 2))}


class MapConversionTests(unittest.TestCase):
    def test_narrower_area_reuses_cached_source_with_original_bounds(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            folder = cache / MODULE.RELEASE
            folder.mkdir()
            (folder / "fixture-original-building.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [feature("house")]}))
            (folder / "fixture-original-building.metadata.json").write_text(json.dumps({"capturedAt": "2026-10-02T00:00:00Z", "downloadBounds": [-1, -1, 10, 10]}))
            data, provenance = MODULE.fetch_layer({"id": "fixture", "bounds": [0, 0, 5, 5]}, "building", cache, True)
            self.assertEqual(data[0]["id"], "house")
            self.assertEqual(provenance["downloadBounds"], [-1, -1, 10, 10])
            self.assertEqual(len(provenance["sha256"]), 64)

    def test_height_provenance_and_missing_height(self):
        self.assertEqual(MODULE.height_fields({"height": 123, "num_floors": 20}), {"height": 123, "heightSource": "recorded"})
        self.assertEqual(MODULE.height_fields({"num_floors": 10}), {"height": 32, "heightSource": "levels"})
        self.assertEqual(MODULE.height_fields({}), {"heightSource": "unknown"})
        self.assertEqual(MODULE.height_fields({"height": float("nan")}), {"heightSource": "unknown"})

    def test_minimum_height_is_not_added_to_the_recorded_top(self):
        self.assertEqual(MODULE.height_fields({"height": 60, "min_height": 20}), {"height": 60, "minHeight": 20, "heightSource": "recorded"})

    def test_conflicting_minimum_floor_estimate_stays_a_footprint(self):
        self.assertEqual(MODULE.height_fields({"height": 107, "min_floor": 34}), {"heightSource": "unknown"})
        self.assertEqual(MODULE.height_fields({"height": 50, "min_height": 60}), {"heightSource": "unknown"})

    def test_clip_water_without_filling_island_hole(self):
        water = {"type": "Polygon", "coordinates": [
            [[-4, -4], [4, -4], [4, 4], [-4, 4], [-4, -4]],
            [[-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1]],
        ]}
        clipped, repaired = MODULE.clipped_geometry(water, box(-2, -2, 2, 2), True)
        self.assertFalse(repaired)
        self.assertEqual(shape(clipped).area, 12)
        self.assertEqual(len(clipped["coordinates"]), 2)

    def test_road_clipping_never_creates_a_water_surface(self):
        line = {"type": "LineString", "coordinates": [[-10, 0], [10, 0]]}
        clipped, _ = MODULE.clipped_geometry(line, box(-1, -1, 1, 1), False)
        self.assertEqual(list(shape(clipped).coords), [(-1, 0), (1, 0)])
        self.assertIsNone(MODULE.clipped_geometry(line, box(-1, -1, 1, 1), True)[0])

    def test_remove_outline_only_when_visible_parts_really_loaded(self):
        site = {"id": "fixture", "label": "Fixture", "bounds": [0, 0, 5, 5]}
        layers = {"building": [feature("parent", {"has_parts": True}), feature("orphan", {"has_parts": True})],
                  "building_part": [feature("part", {"building_id": "parent", "height": 30})], "water": [], "segment": []}
        snapshot, _, stats = MODULE.build_snapshot(site, layers, "2026-10-02T00:00:00Z")
        self.assertEqual({f["id"] for f in snapshot["features"]}, {"building_part:part", "building:orphan"})
        self.assertEqual(stats["outlinesReplacedByParts"], 1)

    def test_underground_part_does_not_hide_visible_parent(self):
        site = {"id": "fixture", "label": "Fixture", "bounds": [0, 0, 5, 5]}
        layers = {"building": [feature("parent", {"has_parts": True, "height": 20})],
                  "building_part": [feature("basement", {"building_id": "parent", "is_underground": True})], "water": [], "segment": []}
        snapshot, _, _ = MODULE.build_snapshot(site, layers, "2026-10-02T00:00:00Z")
        self.assertEqual([f["id"] for f in snapshot["features"]], ["building:parent"])

    def test_exclude_pedestrian_network_and_keep_named_vehicular_road(self):
        site = {"id": "fixture", "label": "Fixture", "bounds": [0, 0, 5, 5]}
        geometry = {"type": "LineString", "coordinates": [[1, 1], [4, 4]]}
        layers = {"building": [], "building_part": [], "water": [], "segment": [
            feature("street", {"subtype": "road", "class": "primary", "names": {"primary": "Main\nStreet"}}, geometry),
            feature("walk", {"subtype": "road", "class": "footway"}, geometry),
            feature("tunnel", {"subtype": "road", "class": "primary", "level_rules": [{"value": -1}]}, geometry),
        ]}
        snapshot, provenance, _ = MODULE.build_snapshot(site, layers, "2026-10-02T00:00:00Z")
        self.assertEqual([f["id"] for f in snapshot["features"]], ["segment:street"])
        self.assertEqual(snapshot["features"][0]["name"], "Main Street")
        self.assertEqual(provenance["segment:street"]["names"]["primary"], "Main\nStreet")


if __name__ == "__main__":
    unittest.main()
