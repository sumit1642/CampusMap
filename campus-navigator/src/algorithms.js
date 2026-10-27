import { MinHeap } from './heap.js';
import { haversine } from './graph.js';

/**
 * Shortest path with Dijkstra's algorithm or A*.
 *
 * Both are the SAME search loop; the only difference is the priority used to
 * order the queue:
 *   Dijkstra:  f(n) = g(n)                 (uninformed — expands in rings)
 *   A*:        f(n) = g(n) + h(n)          (h = Haversine distance to the goal)
 *
 * The function records the exact order in which nodes are *expanded* (popped
 * and closed). That order drives the wavefront animation and the
 * "nodes visited" comparison.
 *
 * @param graph      graph from buildGraph()
 * @param source     start node index
 * @param target     goal node index
 * @param algorithm  'dijkstra' | 'astar'
 */
export function shortestPath(graph, source, target, algorithm = 'dijkstra') {
  if (algorithm !== 'dijkstra' && algorithm !== 'astar') {
    throw new Error(`Unknown algorithm "${algorithm}"`);
  }
  const n = graph.size;
  if (!Number.isInteger(source) || !Number.isInteger(target) || source < 0 || target < 0 || source >= n || target >= n) {
    throw new Error('Source/target must be valid node indices.');
  }

  const t0 = now();
  const { lat, lon, adj } = graph;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const tLat = lat[target];
  const tLon = lon[target];
  const h = algorithm === 'astar' ? (i) => haversine(lat[i], lon[i], tLat, tLon) : () => 0;

  const visited = []; // node indices, in expansion order
  const visitedEdge = []; // edge used to reach each visited node (-1 for the source)
  const visitedFrom = []; // parent node of each visited node (-1 for the source)

  const heap = new MinHeap();
  dist[source] = 0;
  heap.push(source, h(source));

  let found = false;
  while (heap.size > 0) {
    const u = heap.pop();
    if (closed[u]) continue; // stale duplicate entry
    closed[u] = 1;
    visited.push(u);
    visitedEdge.push(prevEdge[u]);
    visitedFrom.push(prev[u]);
    if (u === target) {
      found = true;
      break;
    }
    const du = dist[u];
    for (const { to, w, edge } of adj[u]) {
      if (closed[to]) continue;
      const nd = du + w;
      if (nd < dist[to]) {
        dist[to] = nd;
        prev[to] = u;
        prevEdge[to] = edge;
        heap.push(to, nd + h(to));
      }
    }
  }

  const result = {
    algorithm,
    source,
    target,
    found,
    path: [],
    pathEdges: [],
    distance: found ? dist[target] : Infinity,
    visited,
    visitedEdge,
    visitedFrom,
    nodesVisited: visited.length,
    timeMs: 0,
  };

  if (found) {
    const path = [];
    const pathEdges = [];
    for (let v = target; v !== -1; v = prev[v]) {
      path.push(v);
      if (prevEdge[v] !== -1) pathEdges.push(prevEdge[v]);
    }
    path.reverse();
    pathEdges.reverse();
    result.path = path;
    result.pathEdges = pathEdges;
  }
  result.timeMs = now() - t0;
  return result;
}

/**
 * Turn the edges of a route into a readable list of streets:
 * consecutive edges with the same name are merged and their lengths summed.
 * @returns {{name: string, distance: number}[]}
 */
export function routeStreets(graph, pathEdges) {
  const out = [];
  for (const idx of pathEdges) {
    const { name, w } = graph.edges[idx];
    const label = name || 'Unnamed path';
    const last = out[out.length - 1];
    if (last && last.name === label) last.distance += w;
    else out.push({ name: label, distance: w });
  }
  return out;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
