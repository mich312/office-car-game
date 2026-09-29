// Bot navigation over a map's doors. The racing line alone is a loop, not a
// graph: a bot whose goal sits behind a wall used to head for the racing-line
// waypoint nearest the goal in a straight line — often on the wrong side of
// that wall — and jam there. Here every map gets a visibility graph built
// from its own walls: the racing line, a node either side of every doorway
// (found from the gaps in the wall runs, so a new map needs no extra data)
// and every room centre. Routing is a distance field over that graph.
import { M } from '@rc/shared';

const CAR_PAD = 0.35; // a car's half-width: bots keep this far off a wall

// Wall AABBs (padded by a car's half-width) per map, built once.
const boxCache = new WeakMap();
export function wallBoxesOf(map) {
  let b = boxCache.get(map);
  if (!b) {
    b = map.WALLS.filter((w) => !w.low).map((w) => ({
      minX: w.x - w.w / 2 - CAR_PAD, maxX: w.x + w.w / 2 + CAR_PAD,
      minZ: w.z - w.d / 2 - CAR_PAD, maxZ: w.z + w.d / 2 + CAR_PAD,
    }));
    boxCache.set(map, b);
  }
  return b;
}

export function lineBlocked(wallBoxes, x1, z1, x2, z2) {
  // sampled 2D segment vs wall AABBs — cheap and good enough for nav
  const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.5) + 1;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const b of wallBoxes) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
  }
  return false;
}

// Line of sight through the walls themselves (unpadded): can a zone at A
// see a car at B? Glass counts — you can't score through a window.
const sightCache = new WeakMap();
export function sightBlocked(map, x1, z1, x2, z2) {
  let boxes = sightCache.get(map);
  if (!boxes) {
    boxes = map.WALLS.filter((w) => !w.low).map((w) => ({
      minX: w.x - w.w / 2, maxX: w.x + w.w / 2, minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2,
    }));
    sightCache.set(map, boxes);
  }
  const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.25) + 1;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const b of boxes) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
  }
  return false;
}

const inBoxes = (boxes, x, z) => boxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);

// Doorways: gaps between collinear wall segments. Runs are authored as one
// line of segments with gaps (hwall/vwall), so a gap a car fits through
// between two segments on the same line is a door. Pillars are skipped.
export function doorsOf(map) {
  const runs = new Map();
  for (const w of map.WALLS) {
    if (w.low) continue;
    const horiz = w.w > w.d;
    if (Math.max(w.w, w.d) < 0.5 * M) continue; // a pillar
    const key = `${horiz ? 'h' : 'v'}${Math.round((horiz ? w.z : w.x) * 10)}`;
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push(horiz
      ? { a: w.x - w.w / 2, b: w.x + w.w / 2, at: w.z, horiz }
      : { a: w.z - w.d / 2, b: w.z + w.d / 2, at: w.x, horiz });
  }
  const doors = [];
  for (const segs of runs.values()) {
    segs.sort((s, t) => s.a - t.a);
    for (let i = 1; i < segs.length; i++) {
      const gap = segs[i].a - segs[i - 1].b;
      if (gap < 0.45 * M || gap > 6 * M) continue;
      const mid = (segs[i].a + segs[i - 1].b) / 2;
      const s = segs[i];
      doors.push(s.horiz ? { x: mid, z: s.at, horiz: true, w: gap } : { x: s.at, z: mid, horiz: false, w: gap });
    }
  }
  return doors;
}

const navCache = new WeakMap();
export function navOf(map) {
  let nav = navCache.get(map);
  if (nav) return nav;
  const boxes = wallBoxesOf(map);
  const nodes = [];
  const add = (x, z) => { if (!inBoxes(boxes, x, z)) nodes.push({ x, z, room: map.roomAt(x, z)?.id ?? null }); };
  for (const w of map.BOT_PATH) add(w.x, w.z);
  const off = 0.9 * M; // a car length and a bit either side of the doorway
  for (const d of doorsOf(map)) {
    if (d.horiz) { add(d.x, d.z - off); add(d.x, d.z + off); } else { add(d.x - off, d.z); add(d.x + off, d.z); }
  }
  for (const r of map.ROOMS) add(r.x, r.z);
  const adj = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 30 * M || lineBlocked(boxes, a.x, a.z, b.x, b.z)) continue;
      adj[i].push([j, d]); adj[j].push([i, d]);
    }
  }
  nav = { nodes, adj, boxes, fields: new Map() };
  navCache.set(map, nav);
  return nav;
}

// Distance from every node to the nearest source, over the graph. `sources`
// are points; a node that sees a source starts at the straight-line
// distance. `penalty(node)` makes a node dearer to pass through (Last Car
// Standing's closed rooms) without forbidding it.
export function navField(map, sources, penalty = null, key = null) {
  const nav = navOf(map);
  if (key && nav.fields.has(key)) return nav.fields.get(key);
  const { nodes, adj, boxes } = nav;
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const cost = nodes.map((n) => (penalty ? penalty(n) : 0));
  for (let i = 0; i < nodes.length; i++) {
    for (const s of sources) {
      const d = Math.hypot(nodes[i].x - s.x, nodes[i].z - s.z);
      if (d + cost[i] < dist[i] && !lineBlocked(boxes, nodes[i].x, nodes[i].z, s.x, s.z)) dist[i] = d + cost[i];
    }
  }
  // Dijkstra with a linear scan — a map has ~100 nodes
  const done = new Uint8Array(nodes.length);
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const [v, d] of adj[u]) {
      const nd = dist[u] + d + cost[v];
      if (nd < dist[v]) dist[v] = nd;
    }
  }
  if (key) {
    if (nav.fields.size > 64) nav.fields.clear();
    nav.fields.set(key, dist);
  }
  return dist;
}

// Where to steer from `from` to follow a field downhill: the visible node
// with the least (distance to it + its field value). Nodes right under the
// car are skipped so it moves on instead of circling the one it reached.
export function navStep(map, from, field) {
  const { nodes, boxes } = navOf(map);
  const cand = [];
  for (let i = 0; i < nodes.length; i++) {
    if (field[i] === Infinity) continue;
    const d = Math.hypot(nodes[i].x - from.x, nodes[i].z - from.z);
    if (d < 1.5) continue;
    cand.push([d + field[i], -d, i]);
  }
  cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, , i] of cand) {
    if (!lineBlocked(boxes, from.x, from.z, nodes[i].x, nodes[i].z)) return nodes[i];
  }
  return null;
}

// One goal: straight at it when it's in sight, else along the graph.
export function navTo(map, from, goal) {
  const { boxes } = navOf(map);
  if (!lineBlocked(boxes, from.x, from.z, goal.x, goal.z)) return goal;
  const key = `${Math.round(goal.x * 2)},${Math.round(goal.z * 2)}`;
  return navStep(map, from, navField(map, [goal], null, key)) || goal;
}
