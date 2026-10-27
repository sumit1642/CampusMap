# Campus Route & Shortest-Path Navigator

An interactive web app that models a real campus/locality as a weighted graph built from
**OpenStreetMap** data, then finds the shortest path between two clicked points with
**Dijkstra's algorithm** and **A\***. The search is animated on the map as an expanding
"wavefront", and the two algorithms are compared by nodes visited, route length and time.

> **Important — the bundled map is a demo.** `public/graph.json` that ships in this zip is a
> *synthetic* sample network (so the app runs instantly, even offline). The app shows a yellow
> "Demo mode" banner while it is in use. For your submission, replace it with the real campus
> using the one command in **Step 2** below.

---

## Quick start

Requirements: **Node.js 18+** (and Python 3.10+ only for downloading real map data).

```bash
npm install
npm run dev          # open the URL it prints (usually http://localhost:5173)
```

Using the app:

1. Click the map to set the **source**, click again for the **destination**
   (clicks snap to the nearest road node). A third click starts over.
   *Random route* picks a pair for you.
2. Choose **Dijkstra** or **A\*** — the search wavefront animates, then the final route turns green.
3. **Race both ▶** animates both algorithms at the same pace in different colours
   (blue = Dijkstra, orange = A\*). A\* finishes first because it expands fewer nodes.
4. The **Results** card shows nodes visited, route length, search time, the streets along the
   route, and a ✓ check that the length matches the `ngraph.path` library.

## Step 2 — Load your real campus (OpenStreetMap + OSMnx)

```bash
pip install -r requirements.txt
python data/prepare_graph.py --point <LAT> <LON> --dist 800
```

* Find `<LAT> <LON>`: open <https://www.openstreetmap.org>, right-click the middle of the campus,
  choose **Show address** — the coordinates appear in the sidebar/URL.
* `--dist` is the radius in metres. **500–1000 m is ideal**; larger areas make the animation slow.
* Other options: `--place "Clement Town, Dehradun, India"`, `--network-type walk|bike|drive|all`
  (default `walk`), `--out some/other/path.json`.
* Refresh the browser. The demo banner disappears and you are on real data.

On Windows, if `python3` is not recognised, use `python` or `py` instead
(the `npm run data:*` shortcuts call `python3`, so run the commands above directly).

The script downloads the street network with OSMnx, keeps the largest connected component,
re-indexes nodes to `0..n-1`, and writes `public/graph.json`
(nodes with lat/lon, undirected edges with real length in metres, street name, and curve geometry).
OSMnx caches downloads in a `cache/` folder, so re-running is fast.

## How it works (maps to the synopsis stages 5.1 – 5.8)

| Synopsis stage | Where it lives |
|---|---|
| 5.1 Real-world data extraction | `data/prepare_graph.py` (OSMnx → `public/graph.json`) |
| 5.2 Map rendering | `src/main.js` (Leaflet + OSM tiles, road network overlay) |
| 5.3 Client-side graph construction | `src/graph.js` (`buildGraph`: validation + adjacency lists) |
| 5.4 Source/destination selection | `src/main.js` + `nearestNode()` in `src/graph.js` |
| 5.5 Shortest-path computation | `src/algorithms.js` (Dijkstra & A\*, Haversine heuristic) + `src/heap.js` |
| 5.6 Wavefront animation | `src/animation.js` (frame scheduler) + `src/main.js` (drawing) |
| 5.7 Algorithm comparison | `src/summary.js`, results card, **Race both** |
| 5.8 Result display | results card: distance, streets along the route, node counts |

### Why the search is implemented in `algorithms.js` and `ngraph.path` is used for verification

The animation needs the **exact order in which nodes are expanded**. `ngraph.path` returns only the
final path: its documented options (`distance`, `heuristic`, `oriented`, `blocked`) contain no hook
for the visit order. So the project does this:

* `src/algorithms.js` — a small, readable Dijkstra/A\* (one loop; A\* only adds the heuristic) that
  records the visit order. It is built on a binary min-heap (`src/heap.js`).
* `src/verify.js` — runs the existing **`ngraph.path`** library on the same graph, and the UI shows
  a ✓ when both give the same route length. The unit tests also compare them on 150 random pairs.

So the existing library is genuinely integrated and used to prove correctness, while the
animation data comes from code you can explain line by line in your viva.

**Heuristic:** A\* uses the Haversine (great-circle) distance to the goal. It never overestimates the
true road distance (roads are never shorter than a straight line), so A\* returns the same optimal
route as Dijkstra. The loader also clamps each edge weight to at least the straight-line distance,
which keeps the heuristic consistent even after coordinate rounding.

## Project structure

```
campus-navigator/
├─ index.html              page layout
├─ public/graph.json       road network (demo data now; replace with real data)
├─ data/
│  ├─ prepare_graph.py     OSMnx download + export  ← run this for real data
│  └─ make_sample_graph.py generator for the synthetic demo graph
├─ src/
│  ├─ main.js              map, clicks, results, animation wiring
│  ├─ graph.js             graph loading/validation, Haversine, nearest node
│  ├─ algorithms.js        Dijkstra + A*, route street list
│  ├─ heap.js              binary min-heap priority queue
│  ├─ animation.js         wavefront frame engine
│  ├─ summary.js           comparison + number formatting
│  ├─ verify.js            ngraph.path cross-check
│  └─ style.css
├─ tests/                  JS (node:test) and Python (unittest) tests
├─ requirements.txt        Python deps for the data step only
└─ package.json
```

## Tests

```bash
npm test             # 32 JavaScript tests
npm run test:py      # 14 Python tests
```

They cover: heap ordering; graph validation; Haversine; correct shortest paths on a hand-made graph;
source = destination; disconnected graphs ("no path"); Dijkstra = A\* route length and A\* ≤ Dijkstra
nodes visited on 150 random pairs; agreement with `ngraph.path` on 150 random pairs; the animation
engine (pacing, cancel, race finishing order); and the Python export (island removal, parallel
edges, geometry orientation, compatibility with real OSMnx graph objects).

## Build for hosting / demo

```bash
npm run build        # outputs dist/
npm run preview      # serves dist/ locally
```

Serve `dist/` over HTTP (GitHub Pages, Netlify, `npm run preview`). Opening `index.html` directly
with `file://` will not work because the browser blocks loading `graph.json` that way.

## Ideas for your report and viva

* **Screenshots to take:** the network overlay; Dijkstra's circular wavefront; A\*'s narrow wavefront
  toward the goal; the race mid-way; the results card.
* **Experiment table:** run ~10 source/destination pairs of short, medium and long distance and
  record nodes visited (Dijkstra vs A\*), % fewer, and time. Expect A\* to save the most on long routes.
* **Likely questions:** Why does Dijkstra expand in rings? What makes a heuristic admissible /
  consistent? What is the time complexity with a binary heap (O((V+E) log V))? Why snap clicks to the
  nearest node? Why Haversine instead of Euclidean on lat/lon? What if the graph had negative
  weights (Dijkstra fails; use Bellman-Ford)?

## Known limitations

* Routing is **walking-style** on an undirected graph: one-way streets and turn restrictions are
  ignored (appropriate for a campus).
* Edge weight is **distance only** (no elevation, crowding or surface).
* Large areas (thousands of nodes) work but animate slowly; keep the radius around 500–1000 m.
* Map tiles need an internet connection; routing itself works offline once the page is loaded.
* Search time (ms) is measured in the browser and is tiny on small graphs, so compare **nodes visited**
  rather than milliseconds.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Built with [Leaflet](https://leafletjs.com), [OSMnx](https://github.com/gboeing/osmnx),
[ngraph.graph / ngraph.path](https://github.com/anvaka/ngraph.path) and [Vite](https://vitejs.dev).
