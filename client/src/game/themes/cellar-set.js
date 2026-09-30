// The cellar as architecture, built into the static batch: painted block
// walls with their skirting, stripe and conduit; steel door frames, lintels
// and thresholds; the fire doors' frames; the glazing to the server hall;
// floor finishes, decals and markings; the ceiling with its pipes and trays;
// signs and notices; the dock's roller shutter. All in metres.
import { M } from '@rc/shared';
import { rng, prism, unitTorus } from './cellar-kit.js';
import { decalUV } from './cellar-tex.js';
import { C } from './cellar-pieces.js';

const LOW = 1.4; // top of the gloss band
const STRIPE = 0.04;
const SKIRT = 0.1;
export const FLOOR_Y = 0.0027; // the finishes, just proud of the engine's floor
const DECAL_Y = 0.005;
const MARK_Y = 0.0068;

const wallsOf = (map, style) => map.WALLS.filter((w) => w.style === style)
  .map((w) => ({ x: w.x / M, z: w.z / M, w: w.w / M, d: w.d / M, h: w.h / M }));

// which side of a wall is a room (not the void outside, not another wall)
function openAt(map, walls, x, z) {
  const B = map.MAP_BOUNDS;
  if (x * M <= B.minX || x * M >= B.maxX || z * M <= B.minZ || z * M >= B.maxZ) return false;
  return !walls.some((w) => Math.abs(x - w.x) < w.w / 2 + 0.02 && Math.abs(z - w.z) < w.d / 2 + 0.02);
}

// the long faces of a wall that look into a room: [{ x, z, nx, nz, len, along }]
function roomFaces(map, walls, w) {
  const out = [];
  const alongX = w.w >= w.d;
  for (const s of [-1, 1]) {
    const nx = alongX ? 0 : s, nz = alongX ? s : 0;
    const fx = w.x + nx * (w.w / 2), fz = w.z + nz * (w.d / 2);
    if (openAt(map, walls, fx + nx * 0.3, fz + nz * 0.3)) out.push({ x: fx, z: fz, nx, nz, len: alongX ? w.w : w.d, alongX });
  }
  return out;
}

// is something else hung on this stretch of wall? (signs, notices, doors)
function busy(map, x, z, nx, nz, y0, y1) {
  const near = (px, pz, hw) => (nx ? Math.abs(pz - z) < hw && Math.abs(px - x) < 0.25 : Math.abs(px - x) < hw && Math.abs(pz - z) < 0.25);
  for (const s of map.SIGNS || []) if (s.at[1] - 0.3 < y1 && near(s.at[0], s.at[2], s.w / 2 + 0.15)) return true;
  for (const n of map.NOTICES || []) if (near(n[0], n[2], n[4] / 2 + 0.15)) return true;
  for (const f of map.FURNITURE) {
    if (f.type !== 'cellar_leaf' && f.type !== 'cellar_counter' && f.type !== 'cellar_cooler' && f.type !== 'cellar_cabinet') continue;
    if (near(f.x / M, f.z / M, Math.max(f.w, f.d) / M / 2 + 0.2)) return true;
  }
  return y0 < 0;
}

export function buildWalls(k, map, slots) {
  const H = map.WALL_HEIGHT / M;
  const walls = wallsOf(map, 'cellar_block');
  const all = map.WALLS.map((w) => ({ x: w.x / M, z: w.z / M, w: w.w / M, d: w.d / M }));
  for (const w of walls) {
    k.cell = map.roomAt(w.x * M, w.z * M)?.id || 'corridor';
    const column = w.w < 0.6 && w.d < 0.6;
    k.block('rubber', [w.w + 0.024, SKIRT, w.d + 0.024], [w.x, 0, w.z], { c: '#1a1b1a' });
    k.block('wallLow', [w.w, LOW - SKIRT, w.d], [w.x, SKIRT, w.z], { c: '#ffffff' });
    k.block('paint', [w.w + 0.006, STRIPE, w.d + 0.006], [w.x, LOW, w.z], { c: '#3f4f46' });
    k.block('wallHigh', [w.w, H - LOW - STRIPE, w.d], [w.x, LOW + STRIPE, w.z], { c: '#ffffff' });
    if (column) {
      // steel corner guards and a hazard wrap at bumper height
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        k.block('paint', [0.05, 1.2, 0.05], [w.x + sx * (w.w / 2), SKIRT, w.z + sz * (w.d / 2)], { c: C.steel });
      }
      k.block('hazard', [w.w + 0.03, 0.3, w.d + 0.03], [w.x, SKIRT + 0.02, w.z], { c: '#ffffff' });
      continue;
    }
    // conduit along the room faces, dropping to sockets at 0.3 m
    const r = rng(Math.round(w.x * 100 + w.z * 37) + 7);
    for (const fc of roomFaces(map, all, w)) {
      if (fc.len < 1.6) continue;
      const off = 0.022;
      const px = fc.x + fc.nx * off, pz = fc.z + fc.nz * off;
      const half = fc.len / 2 - 0.2;
      const P = (s, y) => (fc.alongX ? [px + s, y, pz] : [px, y, pz + s]);
      const run = r() < 0.7;
      if (run) k.rod('paint', 0.012, P(-half, 2.42), P(half, 2.42), { c: '#9aa0a3', seg: 6 });
      const n = Math.max(1, Math.floor(fc.len / 3.6));
      for (let i = 0; i < n; i++) {
        const s = -half + (i + 0.3 + r() * 0.4) * ((2 * half) / n);
        const cx = fc.alongX ? px + s : px, cz = fc.alongX ? pz : pz + s;
        if (busy(map, cx, cz, fc.nx, fc.nz, 0.2, 2.4)) continue;
        const top = run ? 2.42 : H;
        k.rod('paint', 0.011, P(s, top), P(s, 0.36), { c: '#9aa0a3', seg: 6 });
        const rot = [0, Math.atan2(fc.nx, fc.nz), 0];
        // back box and a double socket
        k.box('plastic', [0.16, 0.09, 0.04], P(s, 0.3), { r: rot, c: '#e8e8e2' });
        k.box('label', [0.13, 0.065, 0.002], [P(s, 0.3)[0] + fc.nx * 0.021, 0.3, P(s, 0.3)[2] + fc.nz * 0.021], { r: rot, uv: slots.socket });
        if (run) k.box('paint', [0.08, 0.08, 0.04], P(s, 2.42), { r: rot, c: '#9aa0a3' });
        for (const cy of [0.9, 1.7]) k.box('steel', [0.03, 0.012, 0.02], P(s, cy), { r: rot, c: '#777' }); // saddle clips
      }
    }
  }
}

// the server hall's glazing: panes between steel mullions, a kick rail, a
// transom at door height
export function buildGlass(k, map) {
  const H = map.WALL_HEIGHT / M;
  for (const w of wallsOf(map, 'cellar_glass')) {
    k.cell = 'server_hall';
    const alongX = w.w >= w.d, L = alongX ? w.w : w.d;
    const P = (s, y) => (alongX ? [w.x + s, y, w.z] : [w.x, y, w.z + s]);
    const dims = (l, h, t) => (alongX ? [l, h, t] : [t, h, l]);
    k.box('glass', dims(L, H - 0.14, 0.012), P(0, 0.12 + (H - 0.14) / 2), { c: '#ffffff' });
    k.block('paint', dims(L, 0.12, 0.1), P(0, 0), { c: C.steel });
    k.block('paint', dims(L, 0.05, 0.08), P(0, 2.1), { c: C.steel });
    k.block('paint', dims(L, 0.08, 0.1), P(0, H - 0.08), { c: C.steel });
    const n = Math.ceil(L / 1.5);
    for (let i = 0; i <= n; i++) k.block('paint', dims(0.06, H, 0.1), P(-L / 2 + (i * L) / n, 0), { c: C.steel });
  }
}

// Doorways: steel frames, lintels over them, thresholds, room plates, the
// server hall's badge reader.
export function buildDoors(k, map, slots) {
  const H = map.WALL_HEIGHT / M;
  const dress = map.DOOR_DRESS || {};
  for (const d of map.DOORS || []) {
    const ax = d.along === 'x';
    k.cell = map.roomAt((d.x + (ax ? 0 : 0.3)) * M, (d.z + (ax ? 0.3 : 0)) * M)?.id || 'corridor';
    k.at(d.x, 0, d.z, ax ? 0 : Math.PI / 2, () => {
      const hw = d.w / 2, t = d.t;
      const DH = 2.1;
      // lintel (block, or a glazed transom on the glass front)
      if (d.glass) {
        k.box('glass', [d.w, H - DH - 0.06, 0.012], [0, DH + 0.06 + (H - DH - 0.06) / 2, 0], { c: '#ffffff' });
        k.block('paint', [d.w + 0.1, 0.07, 0.1], [0, DH, 0], { c: C.steel });
      } else {
        k.block('wallHigh', [d.w, H - DH - 0.06, t], [0, DH + 0.06, 0], { c: '#ffffff' });
      }
      // jamb liners and architraves on both faces
      for (const sx of [-1, 1]) {
        k.block('paint', [0.03, DH + 0.06, t + 0.04], [sx * (hw - 0.015), 0, 0], { c: C.steel });
        for (const sz of [-1, 1]) {
          k.block('paint', [0.07, DH + 0.07, 0.02], [sx * (hw + 0.035), 0, sz * (t / 2 + 0.01)], { c: C.steel });
          k.block('rubber', [0.074, 0.1, 0.024], [sx * (hw + 0.035), 0, sz * (t / 2 + 0.012)], { c: '#1a1b1a' });
        }
      }
      for (const sz of [-1, 1]) k.block('paint', [d.w + 0.14, 0.07, 0.02], [0, DH, sz * (t / 2 + 0.01)], { c: C.steel });
      k.block('steel', [d.w, 0.006, t + 0.12], [0, 0, 0], { c: '#a9aeb1' }); // threshold strip
      const ds = dress[d.id];
      if (!ds) return;
      // the corridor side: z = 3 walls face south, z = -1 walls face north
      const side = ax ? (d.z > 1 ? -1 : 1) : 1;
      const zf = side * (t / 2 + 0.022);
      k.box('label', [0.3, 0.11, 0.004], [side * (hw + 0.32), 1.55, zf], { r: [0, side < 0 ? Math.PI : 0, 0], uv: slots[`plate_${d.id}`] });
      if (ds.badge) {
        // the reader itself; its LED is live (red → green as a car comes)
        k.box('plastic', [0.07, 0.11, 0.025], [-side * (hw + 0.14), 1.1, zf], { c: '#26292d' });
        k.box('label', [0.05, 0.07, 0.002], [-side * (hw + 0.14), 1.1, zf + side * 0.014], { r: [0, side < 0 ? Math.PI : 0, 0], uv: slots.badge });
      }
    });
  }
  // corridor fire-door screens: side posts, a header, hold-open magnets
  for (const fx of map.FIRE_SCREENS || []) {
    k.cell = 'corridor';
    for (const [z, s] of [[2.9, -1], [-0.9, 1]]) {
      k.block('paint', [0.09, 2.2, 0.07], [fx, 0, z + s * 0.035], { c: C.steel });
      k.box('steel', [0.06, 0.09, 0.05], [fx + 1.86, 1.9, z + s * 0.025], { c: '#555' }); // magnet
      k.box('steel', [0.05, 0.05, 0.02], [fx + 1.86, 1.9, z + s * 0.062], { c: '#999' });
    }
    k.block('paint', [0.1, 0.12, 3.8], [fx, 2.18, 1], { c: C.steel });
    for (const s of [-1, 1]) k.box('label', [0.62, 0.1, 0.002], [fx + s * 0.052, 2.24, 1], { r: [0, s * Math.PI / 2, 0], uv: slots.fireHold });
  }
}

// Floors: vinyl in the corridor (with a darker border), access-floor panels
// in the server hall (perforated down the cold aisle), anti-static sheet in
// the lab, dirty concrete where the work is done.
export function buildFloors(k, map) {
  const up = [-Math.PI / 2, 0, 0];
  const rect = (mat, x1, z1, x2, z2, c = '#ffffff', y = FLOOR_Y) => {
    if (x2 - x1 < 0.01 || z2 - z1 < 0.01) return;
    k.quad(mat, [x2 - x1, z2 - z1], [(x1 + x2) / 2, y, (z1 + z2) / 2], { r: up, c });
  };
  for (const room of map.ROOMS) {
    const x1 = (room.x - room.w / 2) / M, x2 = (room.x + room.w / 2) / M;
    const z1 = (room.z - room.d / 2) / M, z2 = (room.z + room.d / 2) / M;
    k.cell = room.id;
    if (room.id === 'corridor') {
      const b = 0.3, dark = '#8a908c';
      rect('vinyl', x1 + b, z1 + b, x2 - b, z2 - b);
      rect('vinyl', x1, z1, x2, z1 + b, dark); rect('vinyl', x1, z2 - b, x2, z2, dark);
      rect('vinyl', x1, z1 + b, x1 + b, z2 - b, dark); rect('vinyl', x2 - b, z1 + b, x2, z2 - b, dark);
    } else if (room.floor === 'dark') {
      const [ax1, az1, ax2, az2] = map.COLD_AISLE || [0, 0, 0, 0];
      rect('raised', x1, z1, x2, az1); rect('raised', x1, az2, x2, z2);
      rect('raised', x1, az1, ax1, az2); rect('raised', ax2, az1, x2, az2);
      rect('perf', ax1, az1, ax2, az2);
    } else if (room.floor === 'tile') {
      rect('esd', x1, z1, x2, z2);
    } else if (room.floor === 'concrete') {
      rect('conc', x1, z1, x2, z2);
    } else if (room.floor === 'carpet' || room.floor === 'carpet2') {
      rect('carpet', x1, z1, x2, z2, room.floor === 'carpet' ? '#9aa8b8' : '#a8988a');
    }
  }
  // (the floor decals, map.DECALS, are the shared dressing layer's now:
  // dressing/decals.js draws them in the map's one decal mesh)
  // the puddles, darker and wetter than the decal under them
  for (const [x, z, w, d] of map.PUDDLES || []) {
    k.cell = map.roomAt(x * M, z * M)?.id || 'corridor';
    k.quad('decal', [w * 1.2, d * 1.2], [x, DECAL_Y, z], { r: [-Math.PI / 2, 0, 0.3], uv: decalUV('wet'), c: '#ffffff', a: 0.9 });
  }
}

// Painted lines: the centre line down the corridor, the yellow box junction
// at the crossroads, and the cable protectors across the straight.
export function buildMarkings(k, map) {
  const marks = map.MARKINGS || {};
  k.cell = 'corridor';
  for (const [x1, z, x2] of marks.centreLines || []) {
    for (let x = x1; x < x2; x += 1.1) {
      if ((marks.gaps || []).some(([a, b]) => x + 0.55 > a && x < b)) continue;
      k.quad('paint', [0.55, 0.06], [x + 0.275, MARK_Y, z], { r: [-Math.PI / 2, 0, 0], c: '#e9c63a' });
    }
  }
  for (const [x, z, w, d] of marks.junctions || []) {
    // the box: a border and a lattice of diagonals
    const Y = MARK_Y, lw = 0.07, c = '#e2bb2e', up = [-Math.PI / 2, 0, 0];
    k.quad('paint', [w, lw], [x, Y, z - d / 2 + lw / 2], { r: up, c }); k.quad('paint', [w, lw], [x, Y, z + d / 2 - lw / 2], { r: up, c });
    k.quad('paint', [lw, d], [x - w / 2 + lw / 2, Y, z], { r: up, c }); k.quad('paint', [lw, d], [x + w / 2 - lw / 2, Y, z], { r: up, c });
    // diagonals both ways, clipped to the inside of the border
    const a = w / 2 - lw, b = d / 2 - lw;
    for (const dir of [1, -1]) {
      for (let c0 = -(a + b); c0 <= a + b; c0 += 0.42) {
        // the line z' = dir * (x' - c0), as x' runs inside the box
        const lo = Math.max(-a, dir > 0 ? c0 - b : c0 - b), hi = Math.min(a, c0 + b);
        if (hi - lo < 0.08) continue;
        const mx = (lo + hi) / 2, mz = dir * (mx - c0);
        k.quad('paint', [(hi - lo) * Math.SQRT2, 0.045], [x + mx, Y - 0.0004, z + mz], { r: [-Math.PI / 2, 0, -dir * Math.PI / 4], c });
      }
    }
  }
  // painted lines on the floor: [x1, z1, x2, z2, width, colour]
  for (const [x1, z1, x2, z2, lw, col] of marks.lines || []) {
    k.cell = map.roomAt(((x1 + x2) / 2) * M, ((z1 + z2) / 2) * M)?.id || 'corridor';
    const len = Math.hypot(x2 - x1, z2 - z1);
    k.quad('paint', [lw, len], [(x1 + x2) / 2, MARK_Y, (z1 + z2) / 2], { r: [-Math.PI / 2, 0, Math.atan2(x2 - x1, z2 - z1)], c: col });
  }
  // hatched keep-clear boxes: [x, z, w, d]
  for (const [x, z, w, d] of marks.hatch || []) {
    k.cell = map.roomAt(x * M, z * M)?.id || 'corridor';
    k.quad('hazard', [w, d], [x, MARK_Y, z], { r: [-Math.PI / 2, 0, 0], c: '#ffffff' });
  }
  k.cell = 'corridor';
  for (const [x, y, z, w, d, rotX] of marks.hazard || []) {
    k.quad('hazard', [w, d], [x, y, z], { r: [rotX, 0, 0], c: '#ffffff' });
  }
  // cable protectors: black ramps, a yellow lid, jointed every 0.9 m
  const prof = [[-0.25, 0], [0.25, 0], [0.09, 0.05], [-0.09, 0.05]];
  for (const hx of map.HUMPS || []) {
    for (let z = -0.88; z < 2.88 - 0.1; z += 0.9) {
      const len = Math.min(0.88, 2.88 - z);
      k.part('rubber', prism('hump', prof.map(([a, b]) => [a * M, b * M]), 1), [hx, 0, z + len / 2], { s: [1 / M, 1 / M, len], c: '#1e1e1e' });
      k.box('paint', [0.12, 0.004, len - 0.02], [hx, 0.051, z + len / 2], { c: '#d9b21f' });
    }
  }
  // the archive's floor rails
  const R = map.RAILS;
  if (R) {
    k.cell = 'archive';
    for (const z of R.zs) {
      k.block('steel', [R.x2 - R.x1, 0.018, 0.05], [(R.x1 + R.x2) / 2, 0, z], { c: '#8d9396' });
      k.block('rubber', [R.x2 - R.x1, 0.003, 0.012], [(R.x1 + R.x2) / 2, 0.018, z], { c: '#2a2a2a' });
    }
  }
}

// The ceiling: board-marked concrete, downstand beams, pipes on hangers
// (sprinkler heads on the red mains), cable trays over the racks.
export function buildCeiling(k, map) {
  const H = map.WALL_HEIGHT / M;
  const B = map.MAP_BOUNDS;
  const x1 = B.minX / M, x2 = B.maxX / M, z1 = B.minZ / M, z2 = B.maxZ / M;
  // the slab in room-sized tiles so each room culls on its own
  for (const room of map.ROOMS) {
    k.cell = room.id;
    k.quad('ceil', [room.w / M, room.d / M], [room.x / M, H, room.z / M], { r: [Math.PI / 2, 0, 0], c: '#ffffff' });
  }
  k.cell = 'corridor';
  for (let x = x1 + 6; x < x2 - 0.5; x += 6) k.box('ceil', [0.3, 0.3, z2 - z1], [x, H - 0.15, (z1 + z2) / 2], { c: '#c8c8c0' });
  const sprinklers = [];
  for (const p of map.PIPES || []) {
    const [ax, az] = p.from, [bx, bz] = p.to;
    const y = H - p.drop;
    const len = Math.hypot(bx - ax, bz - az);
    k.cell = map.roomAt(((ax + bx) / 2) * M, ((az + bz) / 2) * M)?.id || 'corridor';
    const col = { red: '#b3342b', grey: '#8b9096', lagged: '#d8d6cc' }[p.mat];
    k.rod(p.mat === 'lagged' ? 'matt' : 'paint', p.r, [ax, y, az], [bx, y, bz], { c: col, seg: 12 });
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let s = 1.25; s < len; s += 2.5) {
      const px = ax + ux * s, pz = az + uz * s;
      k.rod('steel', 0.008, [px, y, pz], [px, H, pz], { c: '#5c6166', seg: 4 });
      k.part('steel', unitTorus(0.2, 12), [px, y, pz], { s: [p.r + 0.012, p.r + 0.012, p.r + 0.012], r: [0, Math.atan2(ux, uz), 0], c: '#5c6166' });
    }
    if (p.mat === 'lagged') {
      // aluminium bands on the lagging
      for (let s = 0.6; s < len; s += 1.2) k.rod('steel', p.r + 0.004, [ax + ux * s, y, az + uz * s], [ax + ux * (s + 0.04), y, az + uz * (s + 0.04)], { c: '#c9ced2', seg: 12 });
    } else {
      // flanges now and then
      for (let s = 3; s < len; s += 6) k.rod('paint', p.r + 0.025, [ax + ux * s, y, az + uz * s], [ax + ux * (s + 0.03), y, az + uz * (s + 0.03)], { c: col, seg: 12 });
    }
    if (p.sprinklers) {
      for (let s = 1.5; s < len; s += 3) {
        const px = ax + ux * s, pz = az + uz * s;
        k.rod('paint', 0.012, [px, y, pz], [px, y - 0.12, pz], { c: col, seg: 6 });
        k.cyl('steel', 0.012, 0.04, [px, y - 0.14, pz], { c: C.brass, seg: 8 });
        k.cyl('steel', 0.03, 0.004, [px, y - 0.165, pz], { c: C.brass, seg: 10 });
        sprinklers.push([px, y - 0.17, pz]);
      }
    }
  }
  for (const t of map.CABLE_TRAYS || []) {
    const [ax, az] = t.from, [bx, bz] = t.to;
    const len = Math.hypot(bx - ax, bz - az);
    const y = H - 0.36, w = 0.3;
    k.cell = map.roomAt(((ax + bx) / 2) * M, ((az + bz) / 2) * M)?.id || 'corridor';
    k.at((ax + bx) / 2, y, (az + bz) / 2, Math.atan2(bx - ax, bz - az), () => {
      k.box('paint', [w, 0.01, len], [0, 0, 0], { c: C.yellow });
      for (const s of [-1, 1]) k.box('paint', [0.01, 0.08, len], [s * w / 2, 0.04, 0], { c: C.yellow });
      const cols = ['#23262b', '#2f6fd6', '#23262b', '#e6c229', '#c43b2f', '#23262b'];
      cols.forEach((c, i) => k.box('rubber', [0.03, 0.03, len], [-0.11 + i * 0.044, 0.02 + (i % 2) * 0.02, 0], { c }));
      for (let s = -len / 2 + 0.5; s < len / 2; s += 1.5) {
        for (const sx of [-1, 1]) k.rod('steel', 0.006, [sx * (w / 2 + 0.02), -0.01, s], [sx * (w / 2 + 0.02), 0.36, s], { c: '#777', seg: 4 });
        k.box('steel', [w + 0.08, 0.02, 0.03], [0, -0.015, s], { c: '#777' });
      }
    });
  }
  return sprinklers;
}

// Signs, room notices, the corridor boards: label-atlas quads with a backing.
export function buildSigns(k, map, slots) {
  (map.SIGNS || []).forEach((s, i) => {
    const [x, y, z] = s.at;
    k.cell = map.roomAt(x * M, z * M)?.id || 'corridor';
    const h = s.w * (160 / 512);
    const nx = Math.sin(s.rotY || 0), nz = Math.cos(s.rotY || 0);
    if (s.exit) {
      k.box('plastic', [s.w + 0.04, h + 0.04, 0.05], [x - nx * 0.02, y, z - nz * 0.02], { r: [0, s.rotY || 0, 0], c: '#f0f0ea' });
      k.quad('labelGlow', [s.w, h], [x + nx * 0.008, y, z + nz * 0.008], { r: [0, s.rotY || 0, 0], uv: slots[`sign${i}`] });
    } else {
      k.box('paint', [s.w + 0.02, h + 0.02, 0.012], [x - nx * 0.004, y, z - nz * 0.004], { r: [0, s.rotY || 0, 0], c: '#3a3d3a' });
      k.quad('label', [s.w, h], [x + nx * 0.004, y, z + nz * 0.004], { r: [0, s.rotY || 0, 0], uv: slots[`sign${i}`] });
    }
  });
  (map.NOTICES || []).forEach(([x, y, z, rotY, w, h, kind], i) => {
    k.cell = map.roomAt(x * M, z * M)?.id || 'corridor';
    const nx = Math.sin(rotY), nz = Math.cos(rotY);
    if (kind === 'board') k.box('paint', [w + 0.03, h + 0.03, 0.025], [x - nx * 0.01, y, z - nz * 0.01], { r: [0, rotY, 0], c: '#5a4228' });
    k.quad('label', [w, h], [x + nx * 0.004, y, z + nz * 0.004], { r: [0, rotY, 0], uv: slots[`notice${i}`] });
  });
}

// The boiler room's plumbing and the dock's shutter: set pieces fixed to the
// walls rather than standing on the floor.
export function buildFixtures(k, map, slots) {
  // the gas line: low along the north wall, up a riser, over into the boiler
  k.cell = 'boiler';
  const gz = 10.85, gy = 0.34;
  k.rod('paint', 0.028, [-17.85, gy, gz], [-12.2, gy, gz], { c: C.yellow, seg: 10 });
  k.rod('paint', 0.028, [-12.2, gy, gz], [-12.2, 1.6, gz], { c: C.yellow, seg: 10 });
  k.rod('paint', 0.028, [-12.2, 1.6, gz], [-12.2, 1.6, 8.95], { c: C.yellow, seg: 10 });
  for (let x = -17.4; x < -12.3; x += 1.1) k.box('steel', [0.03, 0.08, 0.05], [x, gy, gz + 0.02], { c: '#666' });
  k.cyl('paint', 0.045, 0.1, [-12.2, 1.05, gz], { c: C.yellow, seg: 10 });
  k.ring('paint', 0.1, 0.014, [-12.2, 1.05, gz - 0.12], { c: C.red });
  k.rod('steel', 0.01, [-12.2, 1.05, gz - 0.12], [-12.2, 1.05, gz], { c: '#555' });
  k.rbox('paint', [0.36, 0.3, 0.2], 0.02, [-17.3, 1.3, gz - 0.1], { c: '#d8d8d2' });
  k.box('label', [0.26, 0.2, 0.002], [-17.3, 1.32, gz - 0.2 - 0.002], { r: [0, Math.PI, 0], uv: slots.gasMeter });
  k.rod('paint', 0.028, [-17.3, 1.15, gz], [-17.3, gy, gz], { c: C.yellow, seg: 10 });
  // a distribution board by the door
  k.rbox('paint', [0.42, 0.62, 0.12], 0.015, [-17.88 + 0.06, 1.45, 6.2], { c: '#c9ccc6' });
  k.box('label', [0.3, 0.4, 0.002], [-17.88 + 0.121, 1.45, 6.2], { r: [0, Math.PI / 2, 0], uv: slots.breaker });
  // the dock's roller shutter, in the south wall at floor level
  const S = map.SHUTTER;
  if (S) {
    k.cell = 'loading';
    const zf = S.z + 0.1, w = S.x2 - S.x1, cx = (S.x1 + S.x2) / 2;
    for (const x of [S.x1 - 0.05, S.x2 + 0.05]) k.block('paint', [0.1, S.h + 0.05, 0.1], [x, 0, zf + 0.05], { c: '#6e7479' });
    k.box('paint', [w + 0.4, 0.42, 0.42], [cx, S.h + 0.21, zf + 0.21], { c: '#6e7479' });
    // the curtain: interlocking slats, a hand of dirt at the bottom
    const n = Math.round((S.h - 0.03) / 0.075);
    for (let i = 0; i < n; i++) {
      const y = 0.03 + i * 0.075;
      k.block('steel', [w, 0.068, 0.02], [cx, y, zf + 0.03], { c: i < 3 ? '#9aa0a3' : i % 2 ? '#c3c8cb' : '#b8bdc0' });
      k.block('steel', [w, 0.008, 0.028], [cx, y + 0.066, zf + 0.032], { c: '#8a9093' });
    }
    k.block('rubber', [w, 0.03, 0.05], [cx, 0.04, zf + 0.03], { c: '#1a1a1a' }); // bottom rail, 4 cm off the floor
    // daylight: the gap glows, and throws a warm line and a fan across the floor
    k.box('glow', [w - 0.02, 0.038, 0.004], [cx, 0.021, zf + 0.056], { c: '#ffe2ae' });
    k.quad('light', [w, 0.05], [cx, 0.006, zf + 0.08], { r: [-Math.PI / 2, 0, 0], uv: decalUV('dust'), c: '#ffcf8a' });
    k.quad('light', [w * 1.1, 2.4], [cx, 0.0055, zf + 0.05], { r: [-Math.PI / 2, 0, 0], uv: decalUV('dust'), c: '#6e5230' });
    k.box('hazard', [w + 0.3, 0.12, 0.02], [cx, S.h + 0.06, zf + 0.43], { c: '#ffffff' });
    // the amber beacon above (its light turns — cellar.jsx)
    k.cyl('plastic', 0.06, 0.04, [cx + w / 2 + 0.25, S.h + 0.25, zf + 0.06], { c: '#333', seg: 12 });
  }
  // the cold aisle: blue uplight rising out of the perforated tiles
  const A = map.COLD_AISLE;
  if (A) {
    k.cell = 'server_hall';
    const [ax1, az1, ax2, az2] = A;
    const cz = (az1 + az2) / 2;
    for (const dz of [-0.45, 0, 0.45]) {
      k.quad('light', [ax2 - ax1, 2.4], [(ax1 + ax2) / 2, 0, cz + dz], { uv: decalUV('dust'), c: '#1d4f8a' });
    }
    // the curtain rails
    for (const [x, z1, z2] of map.CURTAINS || []) {
      k.box('steel', [0.05, 0.05, z2 - z1 + 0.1], [x, 2.25, (z1 + z2) / 2], { c: '#8d9396' });
      for (const z of [z1, z2]) k.rod('steel', 0.008, [x, 2.25, z], [x, map.WALL_HEIGHT / M, z], { c: '#777', seg: 4 });
    }
  }
  // a wall shelf of component bins over the lab (above the ball)
  k.cell = 'lab';
  for (const [x1, x2] of [[4.4, 8.4]]) {
    const z = -1.1 - 0.15, y = 1.45;
    k.box('steel', [x2 - x1, 0.02, 0.3], [(x1 + x2) / 2, y, z], { c: C.galv });
    for (const x of [x1 + 0.1, x2 - 0.1]) k.box('steel', [0.02, 0.2, 0.28], [x, y - 0.1, z], { c: '#777' });
    for (let x = x1 + 0.1; x < x2 - 0.2; x += 0.2) {
      const c = ['#2f6fd6', '#e0762a', '#e6c229', '#3d8b4f', '#2f6fd6', '#c43b2f'][Math.round(x * 5) % 6];
      k.block('plastic', [0.17, 0.12, 0.26], [x + 0.085, y + 0.01, z], { c });
      k.box('plastic', [0.1, 0.04, 0.002], [x + 0.085, y + 0.07, z - 0.131], { c: '#f0f0e8' });
    }
  }
  // "please wait here", on the helpdesk carpet in front of the counter
  const counterF = map.FURNITURE.find((f) => f.kind === 'helpdesk');
  if (counterF) {
    k.cell = 'helpdesk';
    k.quad('label', [0.9, 0.3], [counterF.x / M, DECAL_Y + 0.001, counterF.z / M - 1.25], { r: [-Math.PI / 2, 0, Math.PI], uv: slots.waitHere });
  }
  // the helpdesk's queue display frame (the digits are live)
  const NS = map.NOW_SERVING;
  if (NS) {
    k.cell = 'helpdesk';
    const [x, y, z] = NS.at;
    k.box('plastic', [0.9, 0.36, 0.06], [x + Math.sin(NS.rotY) * 0.03, y, z + Math.cos(NS.rotY) * 0.03], { r: [0, NS.rotY, 0], c: '#18191b' });
  }
}
