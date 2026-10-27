/**
 * Graph loading + geometry helpers (no DOM, so everything here is unit-testable).
 *
 * Input JSON format (produced by data/prepare_graph.py):
 * {
 *   "meta":  { "source": "...", "synthetic": false, ... },
 *   "nodes": [ { "id": 0, "osmid": 123456, "lat": 30.27, "lon": 78.0 }, ... ],
 *   "edges": [ { "u": 0, "v": 1, "length": 52.3, "name": "Bell Road",
 *                "geom": [[lat, lon], ...] }, ... ]      // geom optional (interior points only)
 * }
 * Edges are undirected (the campus is modelled as a walkable network).
 */

const EARTH_RADIUS_M = 6371009; // same radius OSMnx uses for edge lengths

const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle (Haversine) distance in metres between two lat/lon points. */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Validate the raw JSON and build the in-memory graph used by the algorithms.
 * Throws an Error with a readable message if the data is malformed.
 */
export function buildGraph(data) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Graph data must contain "nodes" and "edges" arrays.');
  }
  const size = data.nodes.length;
  if (size < 2) throw new Error('Graph needs at least two nodes.');

  const lat = new Float64Array(size);
  const lon = new Float64Array(size);
  const osmid = new Array(size);
  data.nodes.forEach((n, i) => {
    if (n.id !== i) throw new Error(`Node ids must be 0..n-1 in order (got ${n.id} at position ${i}).`);
    if (!Number.isFinite(n.lat) || !Number.isFinite(n.lon)) throw new Error(`Node ${i} has invalid coordinates.`);
    lat[i] = n.lat;
    lon[i] = n.lon;
    osmid[i] = n.osmid ?? n.id;
  });

  const adj = Array.from({ length: size }, () => []);
  const edges = [];
  for (const e of data.edges) {
    const { u, v } = e;
    if (!Number.isInteger(u) || !Number.isInteger(v) || u < 0 || v < 0 || u >= size || v >= size) {
      throw new Error(`Edge (${u}, ${v}) refers to a node that does not exist.`);
    }
    if (u === v) continue;
    if (!(e.length > 0)) throw new Error(`Edge (${u}, ${v}) has a non-positive length.`);
    // Guarantee weight >= straight-line distance. This keeps the Haversine
    // heuristic admissible AND consistent even if lengths were rounded in the file.
    const w = Math.max(e.length, haversine(lat[u], lon[u], lat[v], lon[v]));
    const idx = edges.length;
    edges.push({ u, v, w, name: e.name || '', geom: Array.isArray(e.geom) ? e.geom : null });
    adj[u].push({ to: v, w, edge: idx });
    adj[v].push({ to: u, w, edge: idx });
  }

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (let i = 0; i < size; i++) {
    if (lat[i] < minLat) minLat = lat[i];
    if (lat[i] > maxLat) maxLat = lat[i];
    if (lon[i] < minLon) minLon = lon[i];
    if (lon[i] > maxLon) maxLon = lon[i];
  }

  return {
    size,
    lat,
    lon,
    osmid,
    adj,
    edges,
    meta: data.meta || {},
    bounds: [[minLat, minLon], [maxLat, maxLon]],
  };
}

/** Index + distance (metres) of the graph node nearest to a clicked point. */
export function nearestNode(graph, lat, lon) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < graph.size; i++) {
    const d = haversine(lat, lon, graph.lat[i], graph.lon[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, distance: bestD };
}

/**
 * [lat, lon] points that draw edge `edgeIdx` when travelled away from node `fromNode`.
 * Uses the road's real curve (interior geometry) when the data has it.
 */
export function edgeLatLngs(graph, edgeIdx, fromNode) {
  const e = graph.edges[edgeIdx];
  const pts = [[graph.lat[e.u], graph.lon[e.u]]];
  if (e.geom) for (const p of e.geom) pts.push(p);
  pts.push([graph.lat[e.v], graph.lon[e.v]]);
  if (fromNode !== e.u) pts.reverse();
  return pts;
}
