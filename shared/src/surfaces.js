// What the floor is made of, and what that does to an 18 cm car.
//
// Everyone knows what a mouse pad feels like against a keyboard, so floor
// surfaces are a driving mechanic that costs nothing to explain (the art
// direction's §3). Each surface is a trade, like the setup sheet: carpet
// grips but drags, hardwood is fast but slides, tile is neutral but its grout
// clicks under the wheels, concrete is rough. Nothing is simply better.
//
// Bumps line up with what you SEE: every floor texture is laid in world space
// with a real cell size (`cell`, metres — one tile, one slab, one run of
// planks), continuous from room to room, and the seams here sit on the same
// grid (Office.jsx builds the floor UVs from these numbers).
import { MAPS, DEFAULT_MAP } from './map.js';
import { M } from './constants.js';

export const SURFACES = {
  carpet: { name: 'Carpet', grip: 1.1, drag: 1.45, top: 0.93, rough: 0.0022, cell: 1 },
  // a texture cell is 8 planks of 18 cm running east–west; the joints between
  // planks are the seams
  wood: { name: 'Hardwood', grip: 0.86, drag: 0.72, top: 1.05, rough: 0.0005, cell: 1.44, seams: { plank: 0.18, depth: 0.006, width: 0.035 } },
  tile: { name: 'Tile', grip: 0.96, drag: 0.9, top: 1.0, rough: 0.0003, cell: 0.6, seams: { grid: true, depth: 0.01, width: 0.05 } },
  concrete: { name: 'Concrete', grip: 1.02, drag: 1.08, top: 0.97, rough: 0.004, cell: 2 },
  // 60 cm access-floor panels: barely-there joints
  dark: { name: 'Raised floor', grip: 0.97, drag: 0.95, top: 1.0, rough: 0.0008, cell: 0.6, seams: { grid: true, depth: 0.003, width: 0.03 } },
  rug: { name: 'Rug', grip: 1.14, drag: 1.6, top: 0.92, rough: 0.0028 },
  // polished stone: the fastest floor in the game and the least forgiving
  marble: { name: 'Marble', grip: 0.855, drag: 0.68, top: 1.06, rough: 0.0002, cell: 1.2, seams: { grid: true, depth: 0.004, width: 0.03 } },
  // poured resin on a factory floor: neutral, smooth, a touch slow
  epoxy: { name: 'Epoxy', grip: 1.0, drag: 0.94, top: 0.985, rough: 0.0003, cell: 2 },
  // coin-pattern rubber matting: sticky and draggy
  rubber: { name: 'Rubber mat', grip: 1.12, drag: 1.5, top: 0.925, rough: 0.0018, cell: 0.5 },
};
// carpet2 is the same pile in another colour
SURFACES.carpet2 = SURFACES.carpet;

// Which surface is under (x, z) on a map: a rug wins over the room's floor.
export function surfaceAt(x, z, map = MAPS[DEFAULT_MAP]) {
  for (const r of map.RUGS) {
    const c = Math.cos(-r.rotY), s = Math.sin(-r.rotY);
    const dx = x - r.x, dz = z - r.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= r.w / 2 && Math.abs(lz) <= r.d / 2) return { id: 'rug', room: null };
  }
  for (const room of map.ROOMS) {
    if (Math.abs(x - room.x) <= room.w / 2 && Math.abs(z - room.z) <= room.d / 2) return { id: room.floor, room };
  }
  return { id: 'concrete', room: null };
}

// Cheap deterministic value noise for surface grain (no Math.random: the same
// spot of floor feels the same every lap, on every machine).
function hash(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function grain(x, z, cell) {
  const gx = x / cell, gz = z / cell;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1; // −1…1
}

// Distance from p to the nearest line of a grid of this period (world units),
// anchored at the world origin like the floor textures.
function toLine(p, period) {
  const t = p / period;
  return Math.abs(t - Math.round(t)) * period;
}

// Height of the floor under a wheel, relative to flat (units; negative = a
// groove). Grout and plank seams are shallow V-grooves; grain is a faint
// unevenness. Stays within a centimetre at 1:20 — felt, not driven around.
export function floorHeight(surf, x, z) {
  const S = SURFACES[surf.id] || SURFACES.concrete;
  let h = S.rough ? grain(x, z, 0.35) * S.rough : 0;
  const sm = S.seams;
  if (sm) {
    const d = sm.grid ? Math.min(toLine(x, S.cell * M), toLine(z, S.cell * M)) : toLine(z, sm.plank * M);
    if (d < sm.width) h -= sm.depth * (1 - d / sm.width);
  }
  return h;
}

// Which seam cell a point is in — changes when a wheel crosses grout or a
// plank joint (for the click you hear). null on seamless floors.
export function seamCell(surf, x, z) {
  const S = SURFACES[surf.id] || {};
  const sm = S.seams;
  if (!sm) return null;
  if (sm.grid) return `${Math.floor(x / (S.cell * M))}:${Math.floor(z / (S.cell * M))}`;
  return `${Math.floor(z / (sm.plank * M))}`;
}
