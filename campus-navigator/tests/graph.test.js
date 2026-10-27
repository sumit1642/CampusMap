import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, haversine, nearestNode, edgeLatLngs } from '../src/graph.js';
import { loadSampleGraph, tinyGraphData } from './helpers.js';

test('haversine: zero distance and a known value', () => {
  assert.equal(haversine(30, 78, 30, 78), 0);
  // 1 degree of latitude ≈ 111.19 km
  const d = haversine(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111195) < 100, `got ${d}`);
});

test('haversine is symmetric', () => {
  const a = haversine(30.27, 78.0, 30.28, 78.01);
  const b = haversine(30.28, 78.01, 30.27, 78.0);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('buildGraph builds undirected adjacency', () => {
  const g = buildGraph(tinyGraphData());
  assert.equal(g.size, 6);
  assert.ok(g.adj[0].some((e) => e.to === 1));
  assert.ok(g.adj[1].some((e) => e.to === 0));
  assert.equal(g.edges.length, 5);
});

test('edge weight is never below the straight-line distance', () => {
  const g = buildGraph(tinyGraphData());
  for (const e of g.edges) {
    assert.ok(e.w >= haversine(g.lat[e.u], g.lon[e.u], g.lat[e.v], g.lon[e.v]) - 1e-9);
  }
});

test('buildGraph rejects malformed input with readable errors', () => {
  assert.throws(() => buildGraph(null), /nodes/);
  assert.throws(() => buildGraph({ nodes: [{ id: 0, lat: 1, lon: 1 }], edges: [] }), /two nodes/);
  const bad = tinyGraphData();
  bad.edges.push({ u: 0, v: 99, length: 5 });
  assert.throws(() => buildGraph(bad), /does not exist/);
  const neg = tinyGraphData();
  neg.edges[0].length = -4;
  assert.throws(() => buildGraph(neg), /non-positive/);
  const ids = tinyGraphData();
  ids.nodes[1].id = 7;
  assert.throws(() => buildGraph(ids), /0\.\.n-1/);
});

test('nearestNode snaps to the closest node', () => {
  const g = buildGraph(tinyGraphData());
  const { index, distance } = nearestNode(g, g.lat[2] + 0.00001, g.lon[2]);
  assert.equal(index, 2);
  assert.ok(distance < 5);
});

test('edgeLatLngs orients geometry from the given node', () => {
  const data = tinyGraphData();
  data.edges[0].geom = [[30.0003, 78.00005]]; // one interior point on edge 0-1
  const g = buildGraph(data);
  const fwd = edgeLatLngs(g, 0, 0);
  const rev = edgeLatLngs(g, 0, 1);
  assert.equal(fwd.length, 3);
  assert.deepEqual(fwd[0], [g.lat[0], g.lon[0]]);
  assert.deepEqual(fwd[2], [g.lat[1], g.lon[1]]);
  assert.deepEqual(rev, [...fwd].reverse());
});

test('bundled graph.json is valid, connected and well-formed', () => {
  const g = loadSampleGraph();
  assert.ok(g.size > 100, 'graph should have a useful number of nodes');
  // connectivity: BFS from node 0 reaches everything (prepare script keeps the largest component)
  const seen = new Uint8Array(g.size);
  const stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const u = stack.pop();
    for (const { to } of g.adj[u]) {
      if (!seen[to]) {
        seen[to] = 1;
        count++;
        stack.push(to);
      }
    }
  }
  assert.equal(count, g.size, 'every node must be reachable');
  for (const e of g.edges) assert.ok(e.w > 0 && e.u !== e.v);
  assert.ok(g.bounds[0][0] < g.bounds[1][0]);
});
