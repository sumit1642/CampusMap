import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

import { buildGraph, nearestNode, edgeLatLngs, haversine } from './graph.js';
import { shortestPath, routeStreets } from './algorithms.js';
import { compareResults, formatDistance, formatMs } from './summary.js';
import { runWavefront, perFrameForSpeed } from './animation.js';
import { ngraphShortestPath } from './verify.js';

const COLORS = { dijkstra: '#1f6fe0', astar: '#e8590c', route: '#12a150', network: '#9aa7b5' };
const MAX_SNAP_M = 250; // ignore clicks farther than this from any road node

const $ = (id) => document.getElementById(id);
const el = {
  status: $('status'),
  banner: $('data-banner'),
  results: $('results'),
  btnRandom: $('btn-random'),
  btnClear: $('btn-clear'),
  btnReplay: $('btn-replay'),
  btnRace: $('btn-race'),
  speed: $('speed'),
  showNetwork: $('show-network'),
};

let graph = null;
let map = null;
let canvas = null;
let networkLayer = null;
let wavefrontLayer = null;
let routeLayer = null;
let markerLayer = null;

const state = { source: null, target: null, results: null, anim: null };

init().catch((err) => {
  console.error(err);
  el.status.textContent = `Could not load map data: ${err.message}`;
});

async function init() {
  const res = await fetch(`${import.meta.env.BASE_URL}graph.json`);
  if (!res.ok) throw new Error(`graph.json not found (HTTP ${res.status}). Run: npm run data:sample`);
  graph = buildGraph(await res.json());

  map = L.map('map', { zoomControl: true, preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.fitBounds(graph.bounds, { padding: [20, 20] });

  canvas = L.canvas({ padding: 0.5 });
  networkLayer = L.layerGroup().addTo(map);
  wavefrontLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  drawNetwork();

  if (graph.meta.synthetic) {
    el.banner.hidden = false;
    el.banner.textContent =
      'Demo mode: this is a synthetic sample network, not real map data. Run "npm run data:real" (see README) to load your actual campus from OpenStreetMap.';
  }

  map.on('click', onMapClick);
  el.btnRandom.addEventListener('click', randomRoute);
  el.btnClear.addEventListener('click', clearAll);
  el.btnReplay.addEventListener('click', () => animate(selectedAlgorithm()));
  el.btnRace.addEventListener('click', () => animate('race'));
  el.showNetwork.addEventListener('change', () => {
    if (el.showNetwork.checked) networkLayer.addTo(map);
    else map.removeLayer(networkLayer);
  });
  document.querySelectorAll('input[name="algo"]').forEach((r) =>
    r.addEventListener('change', () => {
      if (state.results) {
        showResults();
        animate(selectedAlgorithm());
      }
    }),
  );

  setStatus('Click the map to choose a <b>source</b>.');
}

/* ---------- drawing helpers ---------- */

function drawNetwork() {
  const lines = graph.edges.map((e, i) => edgeLatLngs(graph, i, e.u));
  L.polyline(lines, { renderer: canvas, color: COLORS.network, weight: 1.5, opacity: 0.8, interactive: false }).addTo(networkLayer);
}

function segmentsFor(result, from, to) {
  const segs = [];
  for (let i = from; i < to; i++) {
    const edge = result.visitedEdge[i];
    if (edge === -1) continue; // the source node has no incoming edge
    segs.push(edgeLatLngs(graph, edge, result.visitedFrom[i]));
  }
  return segs;
}

function dot(node, color, label) {
  return L.circleMarker([graph.lat[node], graph.lon[node]], {
    radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, interactive: false,
  }).bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8] });
}

function drawRoute(result, color) {
  routeLayer.clearLayers();
  if (!result.found) return;
  const pts = [];
  result.pathEdges.forEach((edge, i) => {
    const seg = edgeLatLngs(graph, edge, result.path[i]);
    pts.push(...(i === 0 ? seg : seg.slice(1)));
  });
  L.polyline(pts, { renderer: canvas, color: '#fff', weight: 9, opacity: 0.9, interactive: false }).addTo(routeLayer);
  L.polyline(pts, { renderer: canvas, color, weight: 5, opacity: 1, interactive: false }).addTo(routeLayer);
}

/* ---------- interaction ---------- */

function onMapClick(e) {
  const { index, distance } = nearestNode(graph, e.latlng.lat, e.latlng.lng);
  if (distance > MAX_SNAP_M) {
    toast('That point is too far from any road in the loaded area.');
    return;
  }
  if (state.source === null || state.target !== null) {
    clearAll();
    state.source = index;
    markerLayer.addLayer(dot(index, '#12a150', 'Source'));
    setStatus('Now click the <b>destination</b>.');
  } else {
    if (index === state.source) {
      toast('Destination is the same as the source — pick a different point.');
      return;
    }
    state.target = index;
    markerLayer.addLayer(dot(index, '#d92d20', 'Destination'));
    compute();
  }
}

function randomRoute() {
  clearAll();
  const minSep = 250; // metres, so the demo route is not trivial
  for (let tries = 0; tries < 200; tries++) {
    const a = Math.floor(Math.random() * graph.size);
    const b = Math.floor(Math.random() * graph.size);
    if (a !== b && haversine(graph.lat[a], graph.lon[a], graph.lat[b], graph.lon[b]) > minSep) {
      state.source = a;
      state.target = b;
      markerLayer.addLayer(dot(a, '#12a150', 'Source'));
      markerLayer.addLayer(dot(b, '#d92d20', 'Destination'));
      compute();
      return;
    }
  }
}

function clearAll() {
  if (state.anim) state.anim.cancel();
  state.anim = null;
  state.source = state.target = null;
  state.results = null;
  wavefrontLayer.clearLayers();
  routeLayer.clearLayers();
  markerLayer.clearLayers();
  el.results.hidden = true;
  el.btnReplay.disabled = true;
  el.btnRace.disabled = true;
  setStatus('Click the map to choose a <b>source</b>.');
}

function selectedAlgorithm() {
  return document.querySelector('input[name="algo"]:checked').value;
}

/* ---------- computation + results ---------- */

function compute() {
  const dijkstra = shortestPath(graph, state.source, state.target, 'dijkstra');
  const astar = shortestPath(graph, state.source, state.target, 'astar');
  state.results = { dijkstra, astar };
  if (!dijkstra.found) {
    el.results.hidden = true;
    setStatus('No walkable route exists between those two points in this network. Try another pair.');
    el.btnReplay.disabled = el.btnRace.disabled = true;
    return;
  }
  el.btnReplay.disabled = el.btnRace.disabled = false;
  showResults();
  animate(selectedAlgorithm());
}

function showResults() {
  const { dijkstra, astar } = state.results;
  el.results.hidden = false;
  $('d-nodes').textContent = dijkstra.nodesVisited.toLocaleString();
  $('a-nodes').textContent = astar.nodesVisited.toLocaleString();
  $('d-dist').textContent = formatDistance(dijkstra.distance);
  $('a-dist').textContent = formatDistance(astar.distance);
  $('d-time').textContent = formatMs(dijkstra.timeMs);
  $('a-time').textContent = formatMs(astar.timeMs);

  const cmp = compareResults(dijkstra, astar);
  const insight = $('insight');
  if (cmp.fasterAlgorithm === 'astar') {
    insight.textContent = `A* explored ${cmp.nodesSaved.toLocaleString()} fewer nodes (${cmp.percentFewer.toFixed(0)}% less) and found the same route length.`;
  } else if (cmp.fasterAlgorithm === 'tie') {
    insight.textContent = 'Both algorithms explored the same number of nodes for this pair.';
  } else {
    insight.textContent = 'Dijkstra explored fewer nodes for this pair.';
  }
  if (!cmp.sameDistance) insight.textContent += ' (Warning: route lengths differ!)';

  // independent check against the ngraph.path library
  const ref = ngraphShortestPath(graph, state.source, state.target);
  const verify = $('verify');
  const ok = ref.found && Math.abs(ref.distance - dijkstra.distance) < 0.01;
  verify.className = ok ? 'verify' : 'verify bad';
  verify.textContent = ok
    ? `✓ Route length verified against the ngraph.path library (${formatDistance(ref.distance)}).`
    : '✗ Route length does NOT match ngraph.path — please report this.';

  const list = $('streets');
  list.replaceChildren();
  for (const s of routeStreets(graph, dijkstra.pathEdges)) {
    const li = document.createElement('li');
    li.append(s.name + ' ');
    const m = document.createElement('span');
    m.className = 'm';
    m.textContent = `— ${formatDistance(s.distance)}`;
    li.append(m);
    list.append(li);
  }
  setStatus(`Route found: <b>${formatDistance(dijkstra.distance)}</b>. Pick new points anytime, or press <b>Race both</b>.`);
}

/* ---------- wavefront animation ---------- */

function animate(mode) {
  if (!state.results) return;
  if (state.anim) state.anim.cancel();
  wavefrontLayer.clearLayers();
  routeLayer.clearLayers();

  const algos = mode === 'race' ? ['dijkstra', 'astar'] : [mode];
  const tracks = algos.map((name) => {
    const result = state.results[name];
    return {
      name,
      total: result.visited.length,
      draw(from, to) {
        const segs = segmentsFor(result, from, to);
        if (segs.length) {
          L.polyline(segs, {
            renderer: canvas, color: COLORS[name], weight: 2.5, opacity: mode === 'race' ? 0.65 : 0.8, interactive: false,
          }).addTo(wavefrontLayer);
        }
      },
    };
  });

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const perFrame = reduce ? Infinity : perFrameForSpeed(Number(el.speed.value));
  const handle = runWavefront({ tracks, perFrame });
  state.anim = handle;
  el.btnReplay.disabled = el.btnRace.disabled = true;

  handle.done.then((finished) => {
    if (!finished) return;
    el.btnReplay.disabled = el.btnRace.disabled = false;
    const winner = mode === 'race' ? 'dijkstra' : mode;
    drawRoute(state.results[winner], COLORS.route);
  });
}

/* ---------- small UI helpers ---------- */

function setStatus(html) {
  el.status.innerHTML = html;
}

let toastTimer = null;
function toast(message) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'alert');
    $('map').append(t);
  }
  t.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}
