"""Offline regressions for non-overlapping, topology-preserving downtown tiles."""
import importlib.util
import json
from pathlib import Path
import unittest
from shapely.geometry import box, mapping, shape, Polygon
from shapely.ops import unary_union

SPEC = importlib.util.spec_from_file_location("fetch_downtown", Path(__file__).with_name("fetch-downtown.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def raw(identifier, geometry, properties=None):
    return {"id": identifier, "geometry": mapping(geometry), "properties": properties or {}}


def layers(**values):
    return {key: values.get(key, []) for key in MODULE.BASE.LAYERS}


class DowntownConversionTests(unittest.TestCase):
    def test_near_coverage_is_subtracted_without_removing_outside_features(self):
        feature = raw("one", box(0, 0, 10, 10), {"height": 81})
        result, _, _ = MODULE.prepare_features({"bounds": [0, 0, 10, 10]}, [2, 2, 4, 4], layers(building=[feature]))
        self.assertEqual(len(result), 1)
        footprint = shape(result[0]["geometry"])
        self.assertEqual(footprint.area, 96)
        self.assertEqual(footprint.intersection(box(2, 2, 4, 4)).area, 0)
        self.assertEqual(result[0]["height"], 81)
        self.assertEqual(result[0]["heightSource"], "recorded")

    def test_water_island_hole_and_near_hole_survive_partition(self):
        water = Polygon(box(0, 0, 10, 10).exterior.coords, [box(1, 1, 2, 2).exterior.coords])
        result, _, _ = MODULE.prepare_features({"bounds": [0, 0, 10, 10]}, [3, 3, 4, 4], layers(water=[raw("water", water)]))
        pieces = []
        for bounds in ([0, 0, 5, 5], [5, 0, 10, 5], [0, 5, 5, 10], [5, 5, 10, 10]):
            pieces.extend(shape(f["geometry"]) for f in MODULE.tile_features(result, bounds))
        self.assertEqual(unary_union(pieces).area, 98)
        self.assertEqual(unary_union(pieces).intersection(box(1, 1, 2, 2)).area, 0)
        for index, piece in enumerate(pieces):
            for other in pieces[index+1:]:
                self.assertEqual(piece.intersection(other).area, 0)

    def test_density_splits_tiles_without_dropping_geography(self):
        features = [{"id": str(index), "kind": "building", "heightSource": "unknown",
                     "geometry": mapping(box(index, 0, index+.8, .8))} for index in range(8)]
        parts = list(MODULE.bounded_tiles(features, [0, 0, 8, 1], "0-0", max_features=2))
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(part[2]) <= 2 for part in parts))
        self.assertEqual({f["id"] for _, _, values, _ in parts for f in values}, set(map(str, range(8))))
        expected = unary_union([shape(f["geometry"]) for f in features])
        actual = unary_union([shape(f["geometry"]) for _, _, values, _ in parts for f in values])
        self.assertTrue(actual.equals(expected))

    def test_serialized_byte_budget_also_triggers_subdivision(self):
        features = [{"id": str(index), "kind": "building", "name": "x" * 1500,
                     "heightSource": "unknown", "geometry": mapping(box(index, 0, index+.8, .8))}
                    for index in range(4)]
        parts = list(MODULE.bounded_tiles(features, [0, 0, 4, 1], "0-0", max_bytes=8192))
        self.assertGreater(len(parts), 1)
        for _, _, values, _ in parts:
            encoded = json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.assertLessEqual(len(encoded), 8192 - 4096)
        self.assertEqual({f["id"] for _, _, values, _ in parts for f in values}, set(map(str, range(4))))

    def test_inside_near_part_does_not_leave_parent_outline_outside(self):
        result, _, stats = MODULE.prepare_features({"bounds": [0, 0, 10, 10]}, [2, 2, 4, 4], layers(
            building=[raw("parent", box(1, 1, 5, 5), {"height": 90})],
            building_part=[raw("part", box(2.2, 2.2, 3.8, 3.8), {"building_id": "parent", "height": 90})]))
        self.assertEqual(result, [])
        self.assertEqual(stats["outlinesReplacedByParts"], 1)

    def test_missing_height_stays_flat_and_recorded_height_is_unchanged(self):
        result, provenance, _ = MODULE.prepare_features({"bounds": [0, 0, 10, 10]}, [8, 8, 9, 9], layers(building=[
            raw("unknown", box(1, 1, 2, 2)), raw("known", box(3, 3, 4, 4), {"height": 382, "num_floors": 4})]))
        values = {f["id"]: f for f in result}
        self.assertNotIn("height", values["building:unknown"])
        self.assertEqual(values["building:unknown"]["heightSource"], "unknown")
        self.assertEqual(values["building:known"]["height"], 382)
        self.assertEqual(provenance["building:known"]["height"], 382)

    def test_grid_has_no_gaps_or_overlapping_interiors(self):
        bounds = [-74.075, 40.686, -73.947, 40.791]
        cells = [box(*cell) for _, cell in MODULE.grid(bounds)]
        self.assertTrue(unary_union(cells).equals(box(*bounds)))
        self.assertAlmostEqual(sum(cell.area for cell in cells), box(*bounds).area)
        self.assertLessEqual(len(cells), 64)


if __name__ == "__main__":
    unittest.main()
