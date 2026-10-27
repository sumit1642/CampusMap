#!/usr/bin/env python3
"""
prepare_graph.py — download a REAL road network from OpenStreetMap with OSMnx
and export it as public/graph.json for the web app.

Examples
--------
# Around a point (recommended for a campus): 800 m radius, walking paths
python data/prepare_graph.py --point 30.2700 78.0000 --dist 800

# By place name (works best for towns / localities)
python data/prepare_graph.py --place "Clement Town, Dehradun, India"

Find your campus coordinates: open openstreetmap.org, right-click the middle of
the campus -> "Show address" / "Centre map here" and read lat/lon from the URL.

Output format (see src/graph.js):
  { "meta": {...},
    "nodes": [{"id": 0, "osmid": 123, "lat": .., "lon": ..}, ...],
    "edges": [{"u": 0, "v": 1, "length": 52.3, "name": "...", "geom": [[lat, lon], ...]}, ...] }
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx

EARTH_RADIUS_M = 6371009.0  # same radius OSMnx uses


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def _name(value) -> str:
    """OSM 'name' can be missing, a string, or a list of strings."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = value[0] if value else ""
    return str(value)


def build_payload(G, *, source: str, network_type: str = "walk", extra_meta: dict | None = None) -> dict:
    """
    Convert an OSMnx-style (Multi)(Di)Graph into the JSON payload used by the web app.

    Requirements on G: nodes carry 'x' (lon) and 'y' (lat); edges optionally carry
    'length' (metres), 'name', and 'geometry' (an object with .coords of (lon, lat)).

    The result is an UNDIRECTED graph (a walking network), reduced to its largest
    connected component, with nodes re-indexed 0..n-1 so the browser can use arrays.
    """
    # 1) collapse parallel / opposite edges into one undirected edge, keeping the shortest
    best: dict[tuple, dict] = {}
    for a, b, data in G.edges(data=True):
        if a == b:
            continue
        ya, xa = G.nodes[a]["y"], G.nodes[a]["x"]
        yb, xb = G.nodes[b]["y"], G.nodes[b]["x"]
        length = data.get("length")
        if length is None or not float(length) > 0:
            length = haversine(ya, xa, yb, xb)
        length = float(length)
        if length <= 0:
            continue
        key = (a, b) if str(a) <= str(b) else (b, a)
        # remember geometry in the direction a -> b of the ORIGINAL edge
        geom = data.get("geometry")
        coords = [(lat, lon) for lon, lat in geom.coords] if geom is not None else None
        cand = {"a": a, "b": b, "length": length, "name": _name(data.get("name")), "coords": coords}
        if key not in best or length < best[key]["length"]:
            best[key] = cand

    # 2) keep the largest connected component only (no unreachable islands)
    U = nx.Graph()
    for (k0, k1) in best:
        U.add_edge(k0, k1)
    if U.number_of_nodes() < 2:
        raise ValueError("The downloaded network has fewer than two connected nodes.")
    keep = max(nx.connected_components(U), key=len)

    # 3) compact re-indexing (sorted for reproducible output)
    ordered = sorted(keep, key=lambda n: (str(type(n)), n))
    index = {osmid: i for i, osmid in enumerate(ordered)}
    nodes = [
        {
            "id": index[o],
            "osmid": int(o) if isinstance(o, (int,)) or str(o).lstrip("-").isdigit() else str(o),
            "lat": round(float(G.nodes[o]["y"]), 6),
            "lon": round(float(G.nodes[o]["x"]), 6),
        }
        for o in ordered
    ]

    edges = []
    for (k0, k1), c in best.items():
        if k0 not in keep or k1 not in keep:
            continue
        i, j = index[c["a"]], index[c["b"]]
        coords = c["coords"]
        if i > j:  # store every edge as u < v; orient geometry u -> v
            i, j = j, i
            if coords:
                coords = list(reversed(coords))
        edge = {"u": i, "v": j, "length": round(c["length"], 3)}
        if c["name"]:
            edge["name"] = c["name"]
        if coords and len(coords) > 2:
            edge["geom"] = [[round(la, 6), round(lo, 6)] for la, lo in coords[1:-1]]
        edges.append(edge)
    edges.sort(key=lambda e: (e["u"], e["v"]))

    meta = {
        "source": source,
        "network_type": network_type,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "synthetic": False,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "attribution": "© OpenStreetMap contributors (ODbL)",
    }
    if extra_meta:
        meta.update(extra_meta)
    return {"meta": meta, "nodes": nodes, "edges": edges}


def download_graph(args):
    import osmnx as ox  # imported lazily so build_payload() is testable without network

    ox.settings.use_cache = True
    ox.settings.log_console = False
    if args.point:
        lat, lon = args.point
        G = ox.graph_from_point((lat, lon), dist=args.dist, network_type=args.network_type, simplify=True)
        source = f"OpenStreetMap via OSMnx — {args.dist:g} m around ({lat:.5f}, {lon:.5f})"
    else:
        G = ox.graph_from_place(args.place, network_type=args.network_type, simplify=True)
        source = f"OpenStreetMap via OSMnx — {args.place}"
    return G, source


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Download an OSM road network and export it as graph.json")
    where = ap.add_mutually_exclusive_group(required=True)
    where.add_argument("--point", nargs=2, type=float, metavar=("LAT", "LON"), help="centre point")
    where.add_argument("--place", type=str, help='place name, e.g. "Clement Town, Dehradun, India"')
    ap.add_argument("--dist", type=float, default=800, help="radius in metres for --point (default 800)")
    ap.add_argument("--network-type", default="walk", choices=["walk", "bike", "drive", "all"], help="default: walk")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "public" / "graph.json")
    args = ap.parse_args(argv)

    try:
        G, source = download_graph(args)
    except Exception as exc:  # network / geocoding problems
        print(f"ERROR: could not download the map data: {exc}", file=sys.stderr)
        print("Check your internet connection, or try --point/--dist instead of --place.", file=sys.stderr)
        return 1

    payload = build_payload(G, source=source, network_type=args.network_type)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    m = payload["meta"]
    print(f"Wrote {args.out}  ({m['node_count']} nodes, {m['edge_count']} edges)")
    if m["node_count"] > 8000:
        print("Note: that is a large graph; the animation may feel slow. Try a smaller --dist.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
