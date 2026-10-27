#!/usr/bin/env python3
"""
make_sample_graph.py — create a SYNTHETIC demo graph (public/graph.json).

This exists only so the web app works straight after `npm install`, without an
internet connection. It is NOT real map data: it is a jittered street grid with
a few blocks removed (think "buildings / sports ground") and some diagonal
shortcuts, placed near Dehradun so it lines up with the OSM tiles.

For the real project run data/prepare_graph.py (OSMnx) to overwrite this file.
Deterministic: the same seed always gives the same graph.
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import networkx as nx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_graph import build_payload, haversine  # noqa: E402

CENTER_LAT, CENTER_LON = 30.2700, 78.0000  # approximate, Dehradun area
ROWS, COLS = 28, 28
SPACING_M = 38.0
JITTER_M = 7.0
ROW_NAMES = ["Main Avenue", "Library Road", "Hostel Lane", "Sports Road", "Admin Street", "Garden Path", "Canteen Road"]
COL_NAMES = ["Gate Road", "Academic Boulevard", "Lab Lane", "Cedar Walk", "Auditorium Road", "Park Street", "Workshop Lane"]


def build_sample(seed: int = 42) -> nx.MultiDiGraph:
    rng = random.Random(seed)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(CENTER_LAT))

    # blocks (row range, col range) that are "buildings" -> no nodes there
    holes = [(range(6, 12), range(5, 11)), (range(15, 22), range(14, 21)), (range(4, 9), range(18, 24))]
    in_hole = lambda r, c: any(r in rr and c in cc for rr, cc in holes)  # noqa: E731

    G = nx.MultiDiGraph()
    ids = {}
    nid = 7_000_000_000
    for r in range(ROWS):
        for c in range(COLS):
            if in_hole(r, c):
                continue
            north = (r - ROWS / 2) * SPACING_M + rng.uniform(-JITTER_M, JITTER_M)
            east = (c - COLS / 2) * SPACING_M + rng.uniform(-JITTER_M, JITTER_M)
            nid += 1
            ids[(r, c)] = nid
            G.add_node(nid, y=CENTER_LAT + north / m_per_deg_lat, x=CENTER_LON + east / m_per_deg_lon)

    def connect(a, b, name):
        la, lo = G.nodes[a]["y"], G.nodes[a]["x"]
        lb, lob = G.nodes[b]["y"], G.nodes[b]["x"]
        length = haversine(la, lo, lb, lob) * rng.uniform(1.0, 1.06)  # real roads are never shorter than the straight line
        G.add_edge(a, b, length=length, name=name)
        G.add_edge(b, a, length=length, name=name)

    for r in range(ROWS):
        for c in range(COLS):
            a = ids.get((r, c))
            if a is None:
                continue
            if (r, c + 1) in ids and rng.random() > 0.10:  # ~10% of streets missing
                connect(a, ids[(r, c + 1)], ROW_NAMES[r % len(ROW_NAMES)])
            if (r + 1, c) in ids and rng.random() > 0.10:
                connect(a, ids[(r + 1, c)], COL_NAMES[c % len(COL_NAMES)])
            if (r + 1, c + 1) in ids and rng.random() < 0.06:  # occasional diagonal footpath
                connect(a, ids[(r + 1, c + 1)], "Diagonal Footpath")
    return G


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "public" / "graph.json"
    G = build_sample()
    payload = build_payload(
        G,
        source="SYNTHETIC SAMPLE (not real map data) — run data/prepare_graph.py for a real OpenStreetMap network",
        network_type="walk",
        extra_meta={"synthetic": True, "attribution": "Synthetic demo data"},
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    m = payload["meta"]
    print(f"Wrote {out}  ({m['node_count']} nodes, {m['edge_count']} edges, synthetic=True)")


if __name__ == "__main__":
    main()
