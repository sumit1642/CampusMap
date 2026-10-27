import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/graph.js';
import { shortestPath, routeStreets } from '../src/algorithms.js';
import { ngraphShortestPath } from '../src/verify.js';
import { compareResults } from '../src/summary.js';
import { loadSampleGraph, tinyGraphData, mulberry32 } from './helpers.js';

const ALGOS = ['dijkstra', 'astar'];

for (const algo of ALGOS) {
  test(`${algo}: picks the shorter of two routes on the tiny graph`, () => {
    const g = buildGraph(tinyGraphData());
    const r = shortestPath(g, 0, 3, algo);
    assert.equal(r.found, true);
    assert.deepEqual(r.path, [0, 2, 3]); // 150 + 40 = 190 < 200
    assert.ok(Math.abs(r.distance - 190) < 0.5);
    assert.equal(r.pathEdges.length, 2);
  });

  test(`${algo}: source === target gives a zero-length path`, () => {
    const g = buildGraph(tinyGraphData());
    const r = shortestPath(g, 1, 1, algo);
    assert.equal(r.found, true);
    assert.deepEqual(r.path, [1]);
    assert.equal(r.distance, 0);
    assert.equal(r.nodesVisited, 1);
  });

  test(`${algo}: reports no path between disconnected components`, () => {
    const g = buildGraph(tinyGraphData());
    const r = shortestPath(g, 0, 5, algo);
    assert.equal(r.found, false);
    assert.deepEqual(r.path, []);
    assert.equal(r.distance, Infinity);
  });

  test(`${algo}: path is a valid walk whose edge weights sum to the distance`, () => {
    const g = loadSampleGraph();
    const rnd = mulberry32(11);
    for (let i = 0; i < 25; i++) {
      const s = Math.floor(rnd() * g.size);
      const t = Math.floor(rnd() * g.size);
      const r = shortestPath(g, s, t, algo);
      assert.equal(r.found, true);
      assert.equal(r.path[0], s);
      assert.equal(r.path.at(-1), t);
      let total = 0;
      r.pathEdges.forEach((eIdx, k) => {
        const e = g.edges[eIdx];
        const a = r.path[k];
        const b = r.path[k + 1];
        assert.ok((e.u === a && e.v === b) || (e.u === b && e.v === a), 'edge must connect consecutive path nodes');
        total += e.w;
      });
      assert.ok(Math.abs(total - r.distance) < 1e-6);
    }
  });

  test(`${algo}: visit order starts at the source, has no repeats, and ends at the target`, () => {
    const g = loadSampleGraph();
    const r = shortestPath(g, 0, g.size - 1, algo);
    assert.equal(r.visited[0], 0);
    assert.equal(r.visited.at(-1), g.size - 1);
    assert.equal(new Set(r.visited).size, r.visited.length);
    assert.equal(r.visitedEdge.length, r.visited.length);
    assert.equal(r.visitedFrom.length, r.visited.length);
    assert.equal(r.visitedEdge[0], -1);
  });
}

test('rejects unknown algorithm names and invalid indices', () => {
  const g = buildGraph(tinyGraphData());
  assert.throws(() => shortestPath(g, 0, 1, 'bfs'), /Unknown algorithm/);
  assert.throws(() => shortestPath(g, 0, 99), /valid node indices/);
  assert.throws(() => shortestPath(g, -1, 2), /valid node indices/);
});

test('Dijkstra and A* find equal-length routes, and A* never visits more nodes (150 random pairs)', () => {
  const g = loadSampleGraph();
  const rnd = mulberry32(2024);
  let astarFewer = 0;
  for (let i = 0; i < 150; i++) {
    const s = Math.floor(rnd() * g.size);
    const t = Math.floor(rnd() * g.size);
    const d = shortestPath(g, s, t, 'dijkstra');
    const a = shortestPath(g, s, t, 'astar');
    assert.ok(Math.abs(d.distance - a.distance) < 1e-6, `pair ${s}->${t}: ${d.distance} vs ${a.distance}`);
    assert.ok(a.nodesVisited <= d.nodesVisited, `pair ${s}->${t}: A* visited ${a.nodesVisited} > Dijkstra ${d.nodesVisited}`);
    if (a.nodesVisited < d.nodesVisited) astarFewer++;
  }
  assert.ok(astarFewer > 100, `A* should be strictly more efficient on most pairs (was ${astarFewer}/150)`);
});

test('cross-check: our route length equals the ngraph.path library (150 random pairs)', () => {
  const g = loadSampleGraph();
  const rnd = mulberry32(99);
  for (let i = 0; i < 150; i++) {
    const s = Math.floor(rnd() * g.size);
    const t = Math.floor(rnd() * g.size);
    const ours = shortestPath(g, s, t, 'dijkstra');
    const ref = ngraphShortestPath(g, s, t);
    assert.equal(ref.found, true);
    assert.ok(Math.abs(ours.distance - ref.distance) < 1e-6, `pair ${s}->${t}: ours ${ours.distance} vs ngraph ${ref.distance}`);
  }
});

test('ngraph cross-check also reports "no path" on a disconnected graph', () => {
  const g = buildGraph(tinyGraphData());
  assert.equal(ngraphShortestPath(g, 0, 5).found, false);
});

test('routeStreets merges consecutive edges with the same name', () => {
  const g = buildGraph(tinyGraphData());
  const r = shortestPath(g, 0, 3, 'dijkstra');
  const streets = routeStreets(g, r.pathEdges);
  assert.deepEqual(streets.map((s) => s.name), ['Beta Lane', 'Gamma Walk']);
  // path 0-1-3 uses "Alpha Road" twice -> should merge into one entry of ~200 m
  const alt = routeStreets(g, [0, 1]);
  assert.equal(alt.length, 1);
  assert.equal(alt[0].name, 'Alpha Road');
  assert.ok(Math.abs(alt[0].distance - 200) < 0.5);
});

test('compareResults summarises the comparison', () => {
  const g = loadSampleGraph();
  const d = shortestPath(g, 0, g.size - 1, 'dijkstra');
  const a = shortestPath(g, 0, g.size - 1, 'astar');
  const c = compareResults(d, a);
  assert.equal(c.sameDistance, true);
  assert.equal(c.nodesSaved, d.nodesVisited - a.nodesVisited);
  assert.ok(c.percentFewer >= 0 && c.percentFewer <= 100);
  assert.equal(compareResults({ found: false }, a).sameDistance, false);
});
