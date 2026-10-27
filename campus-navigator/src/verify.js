/**
 * Independent cross-check using the existing ngraph.path library.
 *
 * Our own search (algorithms.js) records the visit order needed for the
 * animation, which ngraph.path does not expose. So we ALSO run ngraph.path's
 * A* on the same graph and confirm both find a path of the same length.
 */
import createGraph from 'ngraph.graph';
import ngraphPath from 'ngraph.path';
import { haversine } from './graph.js';

let cache = { graph: null, ng: null };

function toNgraph(graph) {
  if (cache.graph === graph) return cache.ng;
  const ng = createGraph();
  for (let i = 0; i < graph.size; i++) ng.addNode(i, { lat: graph.lat[i], lon: graph.lon[i] });
  for (const e of graph.edges) ng.addLink(e.u, e.v, { w: e.w });
  cache = { graph, ng };
  return ng;
}

/**
 * @returns {{ found: boolean, distance: number, path: number[] }}
 */
export function ngraphShortestPath(graph, source, target) {
  const ng = toNgraph(graph);
  const finder = ngraphPath.aStar(ng, {
    // ngraph.path treats the graph as undirected unless `oriented: true`
    distance: (_from, _to, link) => link.data.w,
    heuristic: (from, to) => haversine(from.data.lat, from.data.lon, to.data.lat, to.data.lon),
  });
  const nodes = finder.find(source, target); // returned goal -> start
  if (!nodes || nodes.length === 0) return { found: false, distance: Infinity, path: [] };
  const path = nodes.map((nd) => nd.id).reverse();
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    const link = ng.getLink(path[i - 1], path[i]) || ng.getLink(path[i], path[i - 1]);
    distance += link.data.w;
  }
  return { found: path[0] === source && path[path.length - 1] === target, distance, path };
}
