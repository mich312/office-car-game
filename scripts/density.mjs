// How dressed is a floor, seen from a car? Per map and per room, from the
// shared map data plus the client-only dressing (CLUTTER, DECOR_PROPS,
// SCATTER, DECALS): counts per 100 m², the biggest empty expanses, and the
// number that matters — how much of a lap's racing line runs more than
// 1 m (and ~4.4 car lengths) from any 3D object. Flat decor (decals,
// stains, scatter, rugs, mats) is counted separately: from 20 cm up it
// hardly reads. Then a lint of the dressing against the game's keep-outs.
//
//   node scripts/density.mjs [mapId…] [--json] [--rooms] [--bare[=m]] [--lint-props=N]
//
// --rooms prints the per-room table; --bare lists the lap's bare stretches
// (≥ 1.5 m, or =m, more than 1 m from any 3D object: where the side bands
// need something); --lint-props=N also lints PROPS from index N on (the ones you
// appended). Not part of npm test: it's a tool for whoever dresses a map.
// Exit code 1 if the lint finds anything.
import { MAPS, MAP_IDS, isDecor, M, CAR_UNIT_M } from '../shared/src/index.js';
import { clutterFootprints } from '../client/src/game/dressing/clutter.js';
import { DECOR } from '../client/src/game/dressing/decorModels.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const roomsTable = args.includes('--rooms');
const bareArg = args.find((a) => a.startsWith('--bare'));
const bareList = !!bareArg;
const bareMin = +(bareArg?.split('=')[1] ?? 1.5);
const lintFrom = +(args.find((a) => a.startsWith('--lint-props='))?.split('=')[1] ?? Infinity);
const ids = args.filter((a) => !a.startsWith('--'));

const CELL = 0.2; // metres
const m = (v) => v / M;
// what a car length is in metres at this scale: the "bare" thresholds
const CAR_M = M ? 1 / M : CAR_UNIT_M;
const BARE_CAR = 4.4 * CAR_M; // the study's 1 m, in car lengths at the old scale

// approximate floor footprint radius (m) of a prop by type
const PROP_R = {
  chair: 0.3, tower_chair: 0.3, tower_taskchair: 0.3, garage_chair: 0.3, tower_clubchair: 0.4, tower_barcart: 0.35,
  tower_janitor: 0.5, factory_stool: 0.2, tower_stool: 0.2, garage_stool: 0.2, plant: 0.2, garage_plant: 0.2,
  trash: 0.15, garage_bin: 0.2, cellar_wastebin: 0.15, box: 0.17, cellar_box: 0.17, garage_box: 0.17,
  factory_carton: 0.25, factory_tote: 0.25, factory_jack: 0.5, cellar_cart: 0.35, garage_beanbag: 0.4, basketball: 0.12,
  cellar_crt: 0.22, cellar_tower: 0.15, cellar_bucket: 0.18, cellar_wetsign: 0.2, cellar_reel: 0.2, tower_briefcase: 0.2,
  garage_cone: 0.15, factory_cone: 0.15, garage_gnome: 0.12, garage_flamingo: 0.15, garage_skateboard: 0.2,
  garage_paintcan: 0.1, garage_tower: 0.15, tower_cushion: 0.2, factory_reel: 0.25, factory_printer: 0.25,
};
const propR = (t) => PROP_R[t] ?? 0.08;
const BIG_PROP = 0.15; // a floor prop at least this big "reads" from a car
const FLAT_H = 0.03; // clutter lower than this is flat decor

// distance from point to segment
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
// corners of a rotated w × d rect (three.js rotation-y), for distance tests
const corners = (x, z, w, d, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => {
    const lx = a * w / 2, lz = b * d / 2;
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  });
};

function analyse(map) {
  const B = map.MAP_BOUNDS;
  const x0 = m(B.minX), z0 = m(B.minZ), x1 = m(B.maxX), z1 = m(B.maxZ);
  const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
  const N = nx * nz;
  const room = new Int16Array(N).fill(-1);
  const wall = new Uint8Array(N);
  const solid = new Uint8Array(N); // furniture (any non-decor incl. drive-under) + ramps
  const prop = new Uint8Array(N); // floor props, 3D clutter, floor decor props
  const deco = new Uint8Array(N); // rugs, decor furniture, stains, decals, markings, flat clutter, scatter
  const cx = (i) => x0 + (i + 0.5) * CELL, cz = (j) => z0 + (j + 0.5) * CELL;
  const roomIdx = new Map(map.ROOMS.map((r, k) => [r.id, k]));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const r = map.roomAt(cx(i) * M, cz(j) * M);
    if (r) room[j * nx + i] = roomIdx.get(r.id);
  }
  const rect = (layer, x, z, w, d, rotY = 0, pad = 0) => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const R = Math.hypot(w, d) / 2 + pad;
    const i0 = Math.max(0, Math.floor((x - R - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((x + R - x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - R - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((z + R - z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = cx(i) - x, dz = cz(j) - z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= w / 2 + pad && Math.abs(lz) <= d / 2 + pad) layer[j * nx + i] = 1;
    }
  };
  const disc = (layer, x, z, r) => rect(layer, x, z, 0, 0, 0, r);
  for (const w of map.WALLS) rect(wall, m(w.x), m(w.z), m(w.w), m(w.d), 0, CELL / 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) wall[j * nx + i] = 1;
  const counts = map.ROOMS.map(() => ({ solid: 0, under: 0, decor: 0, floorProps: 0, bigFloorProps: 0, topProps: 0, ramps: 0, flat: 0, clutter: 0 }));
  const roomOf = (xm, zm) => roomIdx.get(map.roomAt(xm * M, zm * M)?.id);
  const bump = (xm, zm, key) => { const k = roomOf(xm, zm); if (k !== undefined) counts[k][key]++; };
  for (const f of map.FURNITURE) {
    const rot = f.rotY || 0;
    if (isDecor(f)) {
      if (['art', 'tv', 'tower_art'].includes(f.type)) continue;
      rect(deco, m(f.x), m(f.z), m(f.w), m(f.d), rot);
      bump(m(f.x), m(f.z), 'decor');
    } else {
      rect(solid, m(f.x), m(f.z), m(f.w), m(f.d), rot);
      bump(m(f.x), m(f.z), f.driveUnder || ['desk', 'table', 'ceodesk'].includes(f.type) ? 'under' : 'solid');
    }
  }
  for (const r of map.RAMPS) { rect(solid, m(r.x), m(r.z), m(r.w), m(r.l), r.rotY); bump(m(r.x), m(r.z), 'ramps'); }
  for (const p of map.PROPS) {
    if (m(p.y) > 0.05) { bump(m(p.x), m(p.z), 'topProps'); continue; }
    const r = propR(p.type);
    disc(prop, m(p.x), m(p.z), Math.max(r, 0.1));
    bump(m(p.x), m(p.z), 'floorProps');
    if (r >= BIG_PROP) bump(m(p.x), m(p.z), 'bigFloorProps');
  }
  // the dressing
  const clutter = clutterFootprints(map);
  for (const c of clutter) {
    if (c.h < FLAT_H) { rect(deco, c.x, c.z, c.w, c.d, c.rot); bump(c.x, c.z, 'flat'); continue; }
    rect(prop, c.x, c.z, c.w, c.d, c.rot);
    bump(c.x, c.z, 'clutter');
  }
  for (const [name, x, y, z, rot = 0] of map.DECOR_PROPS || []) {
    const def = DECOR[name];
    if (!def || y > 0.05) continue;
    const [w, h, d] = def.size;
    if (h < FLAT_H) rect(deco, x, z, w, d, rot); else { rect(prop, x, z, w, d, rot); bump(x, z, 'clutter'); }
  }
  for (const [x, z, s] of map.STAINS || []) { rect(deco, x, z, s * 0.35, s * 0.3); bump(x, z, 'flat'); }
  for (const d of map.DECALS || []) { rect(deco, d[1], d[2], d[3], d[4], d[5]); bump(d[1], d[2], 'flat'); }
  for (const [, x, z, w, d, n, o = {}] of map.SCATTER || []) { if (n >= 3) rect(deco, x, z, w, d, o.rot || 0); bump(x, z, 'flat'); }
  const MK = map.MARKINGS;
  if (MK) {
    for (const l of MK.lines || []) {
      const [ax, az, bx, bz] = l.length >= 4 && typeof l[3] === 'number' ? l : [l[0], l[1], l[2], l[1]];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += CELL) disc(deco, ax + (bx - ax) * t / (L || 1), az + (bz - az) * t / (L || 1), 0.05);
    }
    for (const a of MK.areas || []) rect(deco, a[0], a[1], a[2], a[3]);
    for (const a of MK.zebras || []) rect(deco, a[0], a[1], a[2], a[3]);
    for (const a of MK.junctions || []) rect(deco, a[0], a[1], a[2], a[3]);
    for (const a of MK.hazard || []) rect(deco, a[0], a[1], a[2], a[3], a[4] || 0);
    for (const c of MK.circles || []) for (let t = 0; t < Math.PI * 2; t += 0.1) disc(deco, c[0] + Math.cos(t) * c[2], c[1] + Math.sin(t) * c[2], 0.05);
    for (const s of MK.stencils || []) rect(deco, s[1], s[2], s[3] * Math.max(1, String(s[0]).length * 0.6), s[3]);
    for (const c of MK.centreLines || []) for (let x = c[0]; x <= c[2]; x += CELL) disc(deco, x, c[1], 0.05);
  }
  const P = map.BOT_PATH.map((w) => [m(w.x), m(w.z)]);
  const lane = new Uint8Array(N);
  for (let k = 0; k < P.length; k++) {
    const [ax, az] = P[k], [bx, bz] = P[(k + 1) % P.length];
    const L = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= L; t += CELL) disc(lane, ax + (bx - ax) * t / (L || 1), az + (bz - az) * t / (L || 1), 1.2);
  }
  const dt = (occ) => {
    const INF = 1e9, d = new Float32Array(N).fill(INF);
    for (let c = 0; c < N; c++) if (occ(c)) d[c] = 0;
    const a = 1, b = Math.SQRT2;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i; let v = d[c];
      if (i > 0) v = Math.min(v, d[c - 1] + a);
      if (j > 0) { v = Math.min(v, d[c - nx] + a); if (i > 0) v = Math.min(v, d[c - nx - 1] + b); if (i < nx - 1) v = Math.min(v, d[c - nx + 1] + b); }
      d[c] = v;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const c = j * nx + i; let v = d[c];
      if (i < nx - 1) v = Math.min(v, d[c + 1] + a);
      if (j < nz - 1) { v = Math.min(v, d[c + nx] + a); if (i < nx - 1) v = Math.min(v, d[c + nx + 1] + b); if (i > 0) v = Math.min(v, d[c + nx - 1] + b); }
      d[c] = v;
    }
    for (let c = 0; c < N; c++) d[c] *= CELL;
    return d;
  };
  const dAny = dt((c) => wall[c] || solid[c] || prop[c] || deco[c] || room[c] < 0);
  const dObj = dt((c) => wall[c] || solid[c] || prop[c] || room[c] < 0);
  const rows = map.ROOMS.map((r, k) => {
    let cells = 0, barren15 = 0, best = 0, bx = 0, bz = 0, laneCells = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (room[c] !== k || wall[c] || solid[c]) continue;
      cells++;
      if (lane[c]) laneCells++;
      if (dAny[c] > 1.5) barren15++;
      if (dObj[c] > best) { best = dObj[c]; bx = cx(i); bz = cz(j); }
    }
    const area = (r.w / M) * (r.d / M);
    const cnt = counts[k];
    const read = cnt.solid + cnt.under + cnt.bigFloorProps + cnt.ramps + cnt.clutter;
    return {
      room: r.id, area: +area.toFixed(0), ...cnt,
      readPer100: +(read / area * 100).toFixed(1),
      pctBarren15: +(barren15 / Math.max(1, cells) * 100).toFixed(0),
      emptiestObjR: +best.toFixed(1), emptiestObjAt: [+bx.toFixed(1), +bz.toFixed(1)],
      pctLane: +(laneCells / Math.max(1, cells) * 100).toFixed(0),
    };
  });
  // the racing line: distance to anything, and to 3D things only
  const lapRooms = {};
  const stretches = [];
  let run = null;
  let lapLen = 0, bareAny = 0, bare3D = 0, bare3Dcar = 0;
  for (let k = 0; k < P.length; k++) {
    const [ax, az] = P[k], [bx, bz] = P[(k + 1) % P.length];
    const L = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < L; t += 0.25) {
      const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L;
      const i = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / CELL))), j = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / CELL)));
      const d = dAny[j * nx + i], d3 = dObj[j * nx + i];
      const rid = map.roomAt(x * M, z * M)?.id || '?';
      const e = (lapRooms[rid] ||= { len: 0, bare: 0, bare3D: 0 });
      e.len += 0.25; lapLen += 0.25;
      if (d > 1.0) bareAny += 0.25;
      if (d3 > 1.0) {
        bare3D += 0.25; e.bare3D += 0.25;
        if (!run) { run = { from: [x, z], to: [x, z], len: 0, room: rid }; stretches.push(run); }
        run.to = [x, z]; run.len += 0.25;
      } else run = null;
      if (d3 > BARE_CAR) bare3Dcar += 0.25;
      if (d > 1.0) e.bare += 0.25;
    }
  }
  return {
    rows, lapRooms, stretches: stretches.filter((r) => r.len >= bareMin),
    totals: {
      map: map.id, lapM: +lapLen.toFixed(0),
      bareAny: +(bareAny / lapLen * 100).toFixed(0), bare3D: +(bare3D / lapLen * 100).toFixed(0), bare3Dcar: +(bare3Dcar / lapLen * 100).toFixed(0),
      clutter: clutter.length, decor: (map.DECOR_PROPS || []).length, decals: (map.DECALS || []).length,
      scatter: (map.SCATTER || []).reduce((s, r) => s + (r[5] || 0), 0), props: map.PROPS.length,
    },
    lint: lint(map, clutter),
  };
}

// The rules (docs: the dressing study): 3D dressing keeps ≥ 0.8 m off
// pads, beans, checkpoints and spawns and out of KOTH discs; anything taller
// than 5 cm keeps ≥ 1.2 m off the bot line, humps ≥ 0.6 m; no client-only
// collider on a soccer pitch (the server's ball can't see it).
function lint(map, clutter) {
  const out = [];
  const pts = (list) => (list || []).map((p) => [m(p.x), m(p.z)]);
  const keep = [
    ['pad', pts(map.POWERUP_PADS), 0.8], ['bean', pts(map.BEAN_SPAWNS), 0.8], ['checkpoint', pts(map.CHECKPOINTS), 0.8],
    ['spawn', pts(map.SPAWNS), 0.8], ['koth', pts(map.KOTH_SPOTS), 2.2],
  ];
  const P = map.BOT_PATH.map((w) => [m(w.x), m(w.z)]);
  const laneDist = (x, z) => Math.min(...P.map(([ax, az], k) => segDist(x, z, ax, az, ...P[(k + 1) % P.length])));
  const A = map.SOCCER?.arena;
  const inArena = (x, z) => A && x * M > A.minX && x * M < A.maxX && z * M > A.minZ && z * M < A.maxZ;
  const check = (tag, x, z, w, d, rot, h, collide) => {
    if (h < FLAT_H) return;
    const cs = corners(x, z, w, d, rot);
    for (const [name, list, r] of keep) {
      for (const [px, pz] of list) {
        const dd = Math.min(...cs.map(([a, b]) => Math.hypot(a - px, b - pz)));
        if (dd < r) out.push(`${tag}: ${dd.toFixed(2)} m from a ${name} at (${px.toFixed(1)}, ${pz.toFixed(1)})`);
      }
    }
    const ld = Math.min(...cs.map(([a, b]) => laneDist(a, b)));
    const need = h > 0.05 ? 1.2 : 0.6;
    if (ld < need) out.push(`${tag}: ${ld.toFixed(2)} m from the bot line (needs ${need})`);
    if (collide !== 'none' && cs.some(([a, b]) => inArena(a, b))) out.push(`${tag}: a client-only collider on the soccer pitch`);
  };
  for (const c of clutter) check(`CLUTTER ${c.kind} (${c.x}, ${c.z})`, c.x, c.z, c.w, c.d, c.rot, c.h, c.collide);
  for (const [name, x, y, z, rot = 0, , o] of map.DECOR_PROPS || []) {
    const def = DECOR[name];
    if (!def) { out.push(`DECOR_PROPS: no model '${name}'`); continue; }
    if (y > 0.05) continue;
    check(`DECOR ${name} (${x}, ${z})`, x, z, def.size[0], def.size[2], rot, def.size[1], o?.collide || 'none');
  }
  map.PROPS.forEach((p, i) => {
    if (i < lintFrom || m(p.y) > 0.05) return;
    const r = propR(p.type);
    for (const [name, list, rr] of keep) {
      if (name === 'checkpoint' || name === 'spawn') continue;
      for (const [px, pz] of list) {
        const dd = Math.hypot(m(p.x) - px, m(p.z) - pz) - r;
        if (dd < rr) out.push(`PROPS[${i}] ${p.type}: ${dd.toFixed(2)} m from a ${name}`);
      }
    }
    const ld = laneDist(m(p.x), m(p.z)) - r;
    if (ld < 0.5) out.push(`PROPS[${i}] ${p.type}: ${ld.toFixed(2)} m from the bot line (side bands start at 0.6)`);
  });
  return out;
}

const all = {};
for (const id of ids.length ? ids : MAP_IDS) all[id] = analyse(MAPS[id]);
if (json) { console.log(JSON.stringify(all, null, 1)); process.exit(0); }
let bad = 0;
for (const [id, { rows, totals: t, lapRooms, stretches, lint: l }] of Object.entries(all)) {
  console.log(`\n=== ${id}: lap ${t.lapM} m · clutter ${t.clutter} · decor props ${t.decor} · decals ${t.decals} · scatter ${t.scatter} · props ${t.props}`);
  console.log(`  lap >1 m from any 3D object: ${t.bare3D}%  (>${BARE_CAR.toFixed(2)} m = 4.4 car lengths: ${t.bare3Dcar}%)  · >1 m from anything incl. flat decor: ${t.bareAny}%`);
  console.log('  by room (m of lap, % bare of 3D): ' + Object.entries(lapRooms).sort((a, b) => b[1].bare3D - a[1].bare3D)
    .map(([r, e]) => `${r} ${e.len.toFixed(0)}m ${(e.bare3D / e.len * 100).toFixed(0)}%`).join(' · '));
  if (roomsTable) {
    console.log('  ' + 'room'.padEnd(18) + 'm2'.padStart(5) + '  sol und fPr big cl flat  read/100 %>1.5  emptiest(3D)');
    for (const r of rows.sort((a, b) => a.readPer100 - b.readPer100)) {
      console.log('  ' + r.room.padEnd(18) + String(r.area).padStart(5) + '  ' + [r.solid, r.under, r.floorProps, r.bigFloorProps, r.clutter, r.flat].map((v) => String(v).padStart(3)).join(' ')
        + String(r.readPer100).padStart(9) + String(r.pctBarren15).padStart(6) + `  ${r.emptiestObjR} m @ (${r.emptiestObjAt})`);
    }
  }
  if (bareList) {
    console.log('  bare stretches (lap > 1 m from any 3D object):');
    for (const r of stretches) console.log(`    ${r.room.padEnd(16)} ${r.len.toFixed(1).padStart(5)} m  (${r.from.map((v) => v.toFixed(1))}) → (${r.to.map((v) => v.toFixed(1))})`);
  }
  if (l.length) { bad += l.length; console.log(`  LINT (${l.length}):\n    ` + l.join('\n    ')); } else console.log('  lint: clean');
}
process.exit(bad ? 1 : 0);
