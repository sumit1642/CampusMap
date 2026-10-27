import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/graph.js';

export function loadSampleGraph() {
  const file = fileURLToPath(new URL('../public/graph.json', import.meta.url));
  return buildGraph(JSON.parse(readFileSync(file, 'utf8')));
}

/** Small deterministic PRNG so "random" tests are reproducible. */
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiny hand-made graph near (30N, 78E). Coordinates are given in metres (north, east). */
export function tinyGraphData() {
  //  2 ---(60)--- 3
  //  |            |        0-2-3 = 130 + 60 = 190   <- shortest
  // (130)       (100)      0-1-3 = 100 + 100 = 200
  //  |            |
  //  0 ---(100)-- 1        4 - 5 is a separate island (disconnected)
  // Every edge length is >= the straight-line distance, as in real road data.
  const latPerM = 1 / 111320;
  const lonPerM = 1 / (111320 * Math.cos((30 * Math.PI) / 180));
  const at = (id, north, east) => ({ id, lat: 30 + north * latPerM, lon: 78 + east * lonPerM });
  return {
    meta: {},
    nodes: [at(0, 0, 0), at(1, 0, 50), at(2, 50, 0), at(3, 50, 50), { id: 4, lat: 30.01, lon: 78.01 }, { id: 5, lat: 30.011, lon: 78.01 }],
    edges: [
      { u: 0, v: 1, length: 100, name: 'Alpha Road' },
      { u: 1, v: 3, length: 100, name: 'Alpha Road' },
      { u: 0, v: 2, length: 130, name: 'Beta Lane' },
      { u: 2, v: 3, length: 60, name: 'Gamma Walk' },
      { u: 4, v: 5, length: 120, name: 'Island Road' },
    ],
  };
}
