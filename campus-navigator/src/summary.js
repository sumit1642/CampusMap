/** Compare two search results for the same source/target (DOM-free, unit-tested). */
export function compareResults(dijkstra, astar) {
  const out = {
    sameDistance: false,
    nodesSaved: 0,
    percentFewer: 0,
    fasterAlgorithm: null,
  };
  if (!dijkstra.found || !astar.found) return out;
  out.sameDistance = Math.abs(dijkstra.distance - astar.distance) < 0.01;
  out.nodesSaved = dijkstra.nodesVisited - astar.nodesVisited;
  out.percentFewer = dijkstra.nodesVisited > 0 ? (out.nodesSaved / dijkstra.nodesVisited) * 100 : 0;
  out.fasterAlgorithm =
    astar.nodesVisited < dijkstra.nodesVisited ? 'astar' : astar.nodesVisited > dijkstra.nodesVisited ? 'dijkstra' : 'tie';
  return out;
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function formatMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  return ms < 0.1 ? '<0.1 ms' : `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
}
