// What's under a point, for things the server drops on the floor (the
// battery, spilled beans) and the soccer ball it rolls. The server has no
// physics of its own, so this is the map data read as solid shapes: the
// floor, furniture tops (rotated boxes) and ramp wedges. Pure, per map.
import { isDecor } from './map.js';

const cache = new WeakMap();
function shapesOf(map) {
  let s = cache.get(map);
  if (s) return s;
  const box = (o, h) => ({ x: o.x, z: o.z, c: Math.cos(o.rotY || 0), s: Math.sin(o.rotY || 0), hw: o.w / 2, hd: o.d / 2, h });
  s = {
    furniture: map.FURNITURE.filter((f) => !isDecor(f)).map((f) => box(f, f.h)),
    // a ramp's deck rises along its local +z, from 0 to `rise` over `l`
    ramps: (map.RAMPS || []).map((r) => ({ ...box({ ...r, w: r.w, d: r.l }, r.rise), l: r.l })),
    walls: map.WALLS.map((w) => ({ minX: w.x - w.w / 2, maxX: w.x + w.w / 2, minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2 })),
  };
  cache.set(map, s);
  return s;
}

// the point in a shape's own frame (three.js rotation-y), or null if outside
function local(b, x, z, pad = 0) {
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  return Math.abs(lx) <= b.hw + pad && Math.abs(lz) <= b.hd + pad ? [lx, lz] : null;
}

// Height of the highest surface at (x, z) that is no higher than maxY: the
// floor (0), a furniture top or a ramp deck. maxY is where the thing came
// from — a car on the floor under a desk drops its load on the floor, one on
// the loading dock drops it on the dock.
export function groundAt(map, x, z, maxY = Infinity) {
  const { furniture, ramps } = shapesOf(map);
  let y = 0;
  for (const b of furniture) if (b.h > y && b.h <= maxY && local(b, x, z)) y = b.h;
  for (const r of ramps) {
    const q = local(r, x, z);
    if (!q) continue;
    const h = r.h * (q[1] / r.l + 0.5);
    if (h > y && h <= maxY) y = h;
  }
  return y;
}

// Is (x, z) somewhere a dropped thing may land, seen from (fromX, fromZ)?
// On the floor plan, in a room, clear of walls and of furniture taller than
// maxY (what it was dropped from — the loading dock is a floor to a car on
// top of it), and not through a wall from where it was dropped (a spill
// used to land in the next room).
export function clearDropSpot(map, fromX, fromZ, x, z, { pad = 0.3, maxY = 0.5 } = {}) {
  const B = map.MAP_BOUNDS;
  if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ || !map.roomAt(x, z)) return false;
  const { furniture, walls } = shapesOf(map);
  for (const w of walls) {
    if (x > w.minX - pad && x < w.maxX + pad && z > w.minZ - pad && z < w.maxZ + pad) return false;
  }
  for (const b of furniture) if (b.h > maxY && local(b, x, z, pad)) return false;
  return !wallBetween(map, fromX, fromZ, x, z);
}

// Does the segment cross a wall (any wall, railings included)? Sampled —
// walls are 0.9+ units thick, the step is well under that.
export function wallBetween(map, x1, z1, x2, z2) {
  const { walls } = shapesOf(map);
  const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.4) + 1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const w of walls) if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return true;
  }
  return false;
}
