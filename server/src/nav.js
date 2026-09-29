// Bot navigation over a map's doors. The racing line alone is a loop, not a
// graph: a bot whose goal sits behind a wall used to head for the racing-line
// waypoint nearest the goal in a straight line — often on the wrong side of
// that wall — and jam there. Here every map gets a visibility graph built
// from its own walls: the racing line, a node either side of every doorway
// (found from the gaps in the wall runs, so a new map needs no extra data)
// and every room centre. Routing is a distance field over that graph.
import { M } from '@rc/shared';

const CAR_PAD = 0.35; // a car's half-width: bots keep this far off a wall
// a node this close counts as reached: a bot at speed turns wider than a
// car length, and aiming at a node it has just overshot makes it circle
const NODE_REACHED = 3.5;

// Wall AABBs (padded by a car's half-width) per map, built once.
const boxCache = new WeakMap();
export function wallBoxesOf(map) {
  let b = boxCache.get(map);
  if (!b) {
    // low walls too: a railing or a balustrade stops a car as surely as a
    // wall (bots ignored them and drove off the tower's terrace into the sky)
    b = map.WALLS.map((w) => ({
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
      const rooms = roomsAlong(map, a, b);
      adj[i].push([j, d, rooms]); adj[j].push([i, d, rooms]);
    }
  }
  nav = { nodes, adj, boxes, fields: new Map() };
  navCache.set(map, nav);
  return nav;
}

// Every room a straight leg passes through (sampled every half metre).
function roomsAlong(map, a, b) {
  const out = [];
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (0.5 * M)) + 1;
  for (let k = 0; k <= n; k++) {
    const id = map.roomAt(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n)?.id;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
const legWeight = (weight, rooms) => {
  let w = 1;
  for (const r of rooms) w = Math.max(w, weight(r));
  return w;
};

// Distance from every node to the nearest source, over the graph. `sources`
// are points; a node that sees a source starts at the straight-line
// distance. `weight(roomId)` (≥ 1) scales every leg through that room: Last
// Car Standing makes a closed room's floor expensive (or impossible) to
// drive across.
export function navField(map, sources, weight = null, key = null) {
  const nav = navOf(map);
  if (key && nav.fields.has(key)) return nav.fields.get(key);
  const { nodes, adj, boxes } = nav;
  const dist = new Float64Array(nodes.length).fill(Infinity);
  for (let i = 0; i < nodes.length; i++) {
    for (const s of sources) {
      let d = Math.hypot(nodes[i].x - s.x, nodes[i].z - s.z);
      if (d >= dist[i] || lineBlocked(boxes, nodes[i].x, nodes[i].z, s.x, s.z)) continue;
      if (weight) d *= legWeight(weight, roomsAlong(map, nodes[i], s));
      if (d < dist[i]) dist[i] = d;
    }
  }
  // Dijkstra with a linear scan — a map has ~100 nodes
  const done = new Uint8Array(nodes.length);
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const [v, d, rooms] of adj[u]) {
      const nd = dist[u] + (weight ? d * legWeight(weight, rooms) : d);
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
// with the least (distance to it + its field value). A best node that is
// already under the car counts as reached: steer for its best visible
// neighbour instead, so the car carries on through a doorway rather than
// circling the node it just overshot.
export function navStep(map, from, field, weight = null) {
  const { nodes, adj, boxes } = navOf(map);
  const cand = [];
  for (let i = 0; i < nodes.length; i++) {
    if (field[i] === Infinity) continue;
    const d = Math.hypot(nodes[i].x - from.x, nodes[i].z - from.z);
    cand.push([d + field[i], -d, i]);
  }
  cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const seen = (i) => !lineBlocked(boxes, from.x, from.z, nodes[i].x, nodes[i].z);
  // the leg from the car, priced like any other (lazily: only for candidates
  // good enough to be worth checking)
  const leg = (i) => (weight ? legWeight(weight, roomsAlong(map, from, nodes[i])) : 1);
  let best = null, bc = Infinity;
  for (const [c0, negD, i] of cand) {
    if (c0 >= bc) break; // the leg weight only ever raises the price
    if (!seen(i)) continue;
    const c = -negD * leg(i) + field[i];
    if (c < bc || (c === bc && best && -negD > best[1])) { bc = c; best = [i, -negD]; }
  }
  if (!best) return null;
  const [i, d] = best;
  if (d >= NODE_REACHED) return nodes[i];
  let next = null, nb = Infinity;
  for (const [j] of adj[i]) {
    if (field[j] >= field[i] || !seen(j)) continue;
    const c = Math.hypot(nodes[j].x - from.x, nodes[j].z - from.z) * leg(j) + field[j];
    if (c < nb) { nb = c; next = nodes[j]; }
  }
  return next || nodes[i];
}

// One goal: straight at it when it's in sight, else along the graph.
export function navTo(map, from, goal) {
  const { boxes } = navOf(map);
  if (!lineBlocked(boxes, from.x, from.z, goal.x, goal.z)) return goal;
  const key = `${Math.round(goal.x * 2)},${Math.round(goal.z * 2)}`;
  return navStep(map, from, navField(map, [goal], null, key)) || goal;
}

// Which rooms open into which: two rooms are neighbours when some stretch of
// the boundary they share has no wall on it (a doorway, or open plan).
const roomGraphCache = new WeakMap();
export function roomGraph(map) {
  let g = roomGraphCache.get(map);
  if (g) return g;
  const walls = map.WALLS.filter((w) => !w.low);
  const walled = (x, z) => walls.some((w) => Math.abs(x - w.x) <= w.w / 2 + 0.05 && Math.abs(z - w.z) <= w.d / 2 + 0.05);
  g = new Map(map.ROOMS.map((r) => [r.id, new Set()]));
  const R = map.ROOMS;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      const ax0 = a.x - a.w / 2, ax1 = a.x + a.w / 2, az0 = a.z - a.d / 2, az1 = a.z + a.d / 2;
      const bx0 = b.x - b.w / 2, bx1 = b.x + b.w / 2, bz0 = b.z - b.d / 2, bz1 = b.z + b.d / 2;
      const samples = [];
      const eps = 0.2;
      // a shared vertical edge (x) or horizontal edge (z)
      for (const [x, lo, hi] of [[ax1, Math.max(az0, bz0), Math.min(az1, bz1)], [ax0, Math.max(az0, bz0), Math.min(az1, bz1)]]) {
        if ((Math.abs(x - bx0) < eps || Math.abs(x - bx1) < eps) && hi - lo > 0.4 * M) {
          for (let z = lo + 0.3 * M; z < hi - 0.3 * M; z += 0.25 * M) samples.push([x, z]);
        }
      }
      for (const [z, lo, hi] of [[az1, Math.max(ax0, bx0), Math.min(ax1, bx1)], [az0, Math.max(ax0, bx0), Math.min(ax1, bx1)]]) {
        if ((Math.abs(z - bz0) < eps || Math.abs(z - bz1) < eps) && hi - lo > 0.4 * M) {
          for (let x = lo + 0.3 * M; x < hi - 0.3 * M; x += 0.25 * M) samples.push([x, z]);
        }
      }
      if (samples.some(([x, z]) => !walled(x, z))) { g.get(a.id).add(b.id); g.get(b.id).add(a.id); }
    }
  }
  roomGraphCache.set(map, g);
  return g;
}

// Are these rooms all reachable from each other without leaving the set?
export function roomsConnected(map, ids) {
  if (ids.length <= 1) return true;
  const g = roomGraph(map);
  const want = new Set(ids);
  const seen = new Set([ids[0]]);
  const q = [ids[0]];
  while (q.length) {
    for (const n of g.get(q.shift()) || []) if (want.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
  }
  return seen.size === want.size;
}
