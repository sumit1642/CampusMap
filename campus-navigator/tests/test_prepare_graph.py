"""Tests for the Python data-preparation side (run: npm run test:py)."""
import json
import math
import sys
import unittest
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))

from prepare_graph import build_payload, haversine  # noqa: E402
import make_sample_graph  # noqa: E402

try:
    from shapely.geometry import LineString
except ImportError:  # pragma: no cover
    LineString = None


def tiny_graph() -> nx.MultiDiGraph:
    G = nx.MultiDiGraph()
    # four nodes of a connected path + a two-node island (nodes 90, 91)
    for osmid, (lat, lon) in {10: (30.000, 78.000), 20: (30.001, 78.000), 30: (30.001, 78.001), 40: (30.002, 78.001),
                              90: (30.050, 78.050), 91: (30.051, 78.050)}.items():
        G.add_node(osmid, y=lat, x=lon)
    return G


class BuildPayloadTests(unittest.TestCase):
    def test_basic_structure_and_reindexing(self):
        G = tiny_graph()
        G.add_edge(10, 20, length=111.2, name="Alpha Road")
        G.add_edge(20, 30, length=96.5, name="Beta Lane")
        G.add_edge(30, 40, length=111.2)
        p = build_payload(G, source="test")
        self.assertEqual([n["id"] for n in p["nodes"]], [0, 1, 2, 3])
        self.assertEqual([n["osmid"] for n in p["nodes"]], [10, 20, 30, 40])
        self.assertEqual(len(p["edges"]), 3)
        self.assertTrue(all(e["u"] < e["v"] for e in p["edges"]))
        self.assertEqual(p["meta"]["node_count"], 4)
        self.assertFalse(p["meta"]["synthetic"])

    def test_drops_disconnected_island(self):
        G = tiny_graph()
        G.add_edge(10, 20, length=100)
        G.add_edge(20, 30, length=100)
        G.add_edge(90, 91, length=100)  # island
        p = build_payload(G, source="test")
        self.assertEqual({n["osmid"] for n in p["nodes"]}, {10, 20, 30})

    def test_two_way_and_parallel_edges_collapse_to_the_shortest(self):
        G = tiny_graph()
        G.add_edge(10, 20, length=150)
        G.add_edge(10, 20, length=120)  # parallel, shorter
        G.add_edge(20, 10, length=130)  # opposite direction
        p = build_payload(G, source="test")
        self.assertEqual(len(p["edges"]), 1)
        self.assertEqual(p["edges"][0]["length"], 120)

    def test_self_loops_skipped_and_missing_length_falls_back_to_haversine(self):
        G = tiny_graph()
        G.add_edge(10, 10, length=5)
        G.add_edge(10, 20)  # no length attribute
        p = build_payload(G, source="test")
        self.assertEqual(len(p["edges"]), 1)
        expected = haversine(30.000, 78.000, 30.001, 78.000)
        self.assertAlmostEqual(p["edges"][0]["length"], expected, places=2)

    def test_name_may_be_a_list(self):
        G = tiny_graph()
        G.add_edge(10, 20, length=100, name=["Main Road", "NH 7"])
        p = build_payload(G, source="test")
        self.assertEqual(p["edges"][0]["name"], "Main Road")

    def test_too_small_network_raises(self):
        G = tiny_graph()
        with self.assertRaises(ValueError):
            build_payload(G, source="test")

    @unittest.skipIf(LineString is None, "shapely not installed")
    def test_geometry_is_exported_as_interior_points_and_oriented_u_to_v(self):
        G = tiny_graph()
        # curved road from node 20 to node 10 (i.e. original direction is "backwards")
        curve = LineString([(78.000, 30.001), (78.0004, 30.0006), (78.0002, 30.0003), (78.000, 30.000)])  # (lon, lat)
        G.add_edge(20, 10, length=130, geometry=curve)
        p = build_payload(G, source="test")
        e = p["edges"][0]
        # u (=10) is the south node, so interior points must run from south to north
        self.assertEqual(e["geom"], [[30.0003, 78.0002], [30.0006, 78.0004]])

    def test_output_is_json_serialisable(self):
        G = tiny_graph()
        G.add_edge(10, 20, length=100)
        json.dumps(build_payload(G, source="test"))


@unittest.skipIf(LineString is None, "shapely/osmnx not installed")
class OsmnxCompatibilityTests(unittest.TestCase):
    """Builds a graph with OSMnx's own constructor (offline) to make sure real OSMnx objects work."""

    def test_graph_from_gdfs_roundtrip(self):
        try:
            import geopandas as gpd
            import osmnx as ox
            import pandas as pd
            from shapely.geometry import Point
        except ImportError:
            self.skipTest("osmnx/geopandas not installed")
        nodes = gpd.GeoDataFrame(
            {"y": [30.000, 30.001, 30.002], "x": [78.000, 78.000, 78.001]},
            index=pd.Index([1001, 1002, 1003], name="osmid"),
            geometry=[Point(78.000, 30.000), Point(78.000, 30.001), Point(78.001, 30.002)],
            crs="EPSG:4326",
        )
        idx = pd.MultiIndex.from_tuples([(1001, 1002, 0), (1002, 1003, 0)], names=["u", "v", "key"])
        edges = gpd.GeoDataFrame(
            {"length": [111.2, 150.0], "name": ["Campus Road", None],
             "geometry": [LineString([(78.000, 30.000), (78.000, 30.001)]), LineString([(78.000, 30.001), (78.0006, 30.0015), (78.001, 30.002)])]},
            index=idx, crs="EPSG:4326",
        )
        G = ox.graph_from_gdfs(nodes, edges)
        p = build_payload(G, source="osmnx-offline")
        self.assertEqual(len(p["nodes"]), 3)
        self.assertEqual(len(p["edges"]), 2)
        self.assertEqual(p["edges"][0].get("name"), "Campus Road")
        self.assertIn("geom", p["edges"][1])


class SampleDataTests(unittest.TestCase):
    def setUp(self):
        self.payload = json.loads((ROOT / "public" / "graph.json").read_text(encoding="utf-8"))

    def test_schema(self):
        nodes, edges = self.payload["nodes"], self.payload["edges"]
        self.assertGreater(len(nodes), 100)
        self.assertEqual([n["id"] for n in nodes], list(range(len(nodes))))
        for e in edges:
            self.assertLess(e["u"], e["v"])
            self.assertGreater(e["length"], 0)
            self.assertLess(e["v"], len(nodes))

    def test_edge_lengths_are_never_shorter_than_straight_line(self):
        # Coordinates are rounded to 6 decimals (~0.1 m), so allow a small tolerance.
        # (The browser loader additionally clamps weights up to the straight-line distance,
        # which keeps the A* heuristic consistent despite this rounding.)
        nodes = self.payload["nodes"]
        for e in self.payload["edges"]:
            a, b = nodes[e["u"]], nodes[e["v"]]
            self.assertGreaterEqual(e["length"] + 0.5, haversine(a["lat"], a["lon"], b["lat"], b["lon"]))

    def test_graph_is_connected(self):
        U = nx.Graph((e["u"], e["v"]) for e in self.payload["edges"])
        self.assertEqual(U.number_of_nodes(), len(self.payload["nodes"]))
        self.assertTrue(nx.is_connected(U))

    def test_generator_is_deterministic(self):
        a = build_payload(make_sample_graph.build_sample(42), source="x")
        b = build_payload(make_sample_graph.build_sample(42), source="x")
        self.assertEqual(a["nodes"], b["nodes"])
        self.assertEqual(a["edges"], b["edges"])

    def test_sample_is_clearly_flagged_synthetic(self):
        self.assertTrue(self.payload["meta"]["synthetic"])
        self.assertIn("SYNTHETIC", self.payload["meta"]["source"])


if __name__ == "__main__":
    unittest.main()
