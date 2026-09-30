// The building itself, as kit parts: every wall with a skirting board, a
// frame round every doorway (derived from the gaps between wall segments),
// glass partitions with mullions, a base channel, a manifestation band and a
// transom over their doors, the balcony's balustrade — and, on every floor,
// the band a car actually looks at, the first 30 cm of wall (bandOf below):
// sockets, trunking and conduit, vents, cable clips, door stops, scuffs,
// corner guards, threshold strips, floor convectors along the windows.
// Colliders stay in Office.jsx (one box per wall, as always); this is only
// what they look like.
//
// The map's clutter (dressing/clutter.js) rides along into the same batch:
// it's in world metres too, and in the building's materials it costs no
// draw call at all.
//
// Parts are in METRES, placed in world space (the batch scales by M), so
// every surface gets the same metre UVs as the furniture.
import { M } from '@rc/shared';
import { Piece, box, rbox, card, cyl, tube } from './kit.js';
import { rng } from './textures.js';
import { BANDS } from './dressing/registry.js';
import { clutterOf } from './dressing/clutter.js';

const DOOR_MIN = 0.5, DOOR_MAX = 3.2; // a gap this wide between two segments is a doorway
const HEAD = 2.1; // door head height
const SKIRT_H = 0.12, SKIRT_T = 0.016;

const m = (v) => v / M;

// Wall segments in metres, with their run direction: 'x' runs along x.
function segments(walls) {
  return walls.map((w) => {
    const alongX = w.w >= w.d;
    return {
      w, alongX,
      x: m(w.x), z: m(w.z), h: m(w.h),
      len: m(alongX ? w.w : w.d), t: m(alongX ? w.d : w.w),
      a: m(alongX ? w.x - w.w / 2 : w.z - w.d / 2), b: m(alongX ? w.x + w.w / 2 : w.z + w.d / 2),
      line: m(alongX ? w.z : w.x),
    };
  });
}

// Doorways: consecutive segments on one line, a door-sized gap between them.
export function doorways(walls) {
  const segs = segments(walls).filter((s) => s.len > 0.3);
  const out = [];
  const byLine = new Map();
  for (const s of segs) {
    const k = `${s.alongX ? 'x' : 'z'}${s.line.toFixed(2)}`;
    (byLine.get(k) || byLine.set(k, []).get(k)).push(s);
  }
  for (const list of byLine.values()) {
    list.sort((p, q) => p.a - q.a);
    for (let i = 1; i < list.length; i++) {
      const p = list[i - 1], q = list[i];
      const gap = q.a - p.b;
      if (gap < DOOR_MIN || gap > DOOR_MAX) continue;
      out.push({
        alongX: p.alongX, line: p.line, a: p.b, b: q.a, t: Math.max(p.t, q.t), h: Math.min(p.h, q.h),
        glass: p.w.glass && q.w.glass,
      });
    }
  }
  return out;
}

// Build a run's parts in a frame where the run lies along +x at the origin,
// then place that frame on the wall's line. (A z-running wall turns −90°:
// its local +x is world +z and its local +z face looks toward world −x.)
const worldAt = (s, x, z) => (s.alongX ? [x, s.line + z] : [s.line - z, x]);
function onLine(p, s, fn) {
  const pos = s.alongX ? [0, 0, s.line] : [s.line, 0, 0];
  p.at(pos, s.alongX ? null : [0, -Math.PI / 2, 0], fn);
}

export function buildArchitecture(map, opts) {
  const p = new Piece();
  const look = map.LOOK || {};
  const base = look.wall || '#e8e4da';
  // A room can have its own paint (LOOK.rooms: { roomId: colour }): each
  // face of a wall takes the colour of the room it looks into, as a skin
  // 1.5 mm proud, so one wall can be blue on one side and green on the
  // other. All of it is one material, coloured per vertex.
  const roomPaint = (x, z) => look.rooms?.[map.roomAt(x * M, z * M)?.id];
  const skins = (s, a, b, y0, y1, t) => {
    for (const side of [-1, 1]) {
      let run = null;
      const flush = (end) => {
        if (run && end - run.a > 0.05) p.add('wall', box(end - run.a, y1 - y0, 0.003), [(run.a + end) / 2, (y0 + y1) / 2, side * (t / 2 + 0.0015)], null, null, run.c);
      };
      for (let x = a; x <= b + 1e-6; x += 0.1) {
        const c = roomPaint(...worldAt(s, Math.min(x + 0.05, b), side * (t / 2 + 0.25))) || null;
        if (!run || run.c !== c) { if (run?.c) flush(x); run = { a: x, c }; }
      }
      if (run?.c) flush(b);
    }
  };
  const skirt = `trim:${look.skirt || '#d8d2c6'}`;
  const frame = `trim:${look.frame || (opts.office ? '#f3f1ec' : look.skirt || '#8c9297')}`;
  const plain = map.WALLS.filter((w) => !(w.style && opts.styled.has(w.style)));
  const solid = plain.filter((w) => !w.glass && !w.low);
  const glass = plain.filter((w) => w.glass);
  const low = plain.filter((w) => w.low);
  const doors = doorways([...solid, ...glass]);

  // ------------------------------------------------------------ solid
  for (const s of segments(solid)) {
    onLine(p, s, () => {
      const cx = (s.a + s.b) / 2;
      p.add('wall', box(s.len, s.h, s.t), [cx, s.h / 2, 0], null, null, base);
      skins(s, s.a, s.b, SKIRT_H - 0.01, s.h, s.t);
      // and its ends, in the paint of the room each looks into (a pillar's
      // other two faces came out base colour: two-tone in a green café)
      for (const end of [-1, 1]) {
        const ex = end > 0 ? s.b : s.a;
        const c = roomPaint(...worldAt(s, ex + end * 0.25, 0));
        if (c) p.add('wall', box(0.003, s.h - SKIRT_H + 0.01, s.t), [ex + end * 0.0015, (s.h + SKIRT_H - 0.01) / 2, 0], null, null, c);
      }
      // skirting on both faces and the exposed ends (pillars get all four)
      for (const side of [-1, 1]) {
        p.add(skirt, rbox(s.len + SKIRT_T * 2, SKIRT_H, SKIRT_T, 0.004, 1), [cx, SKIRT_H / 2, side * (s.t / 2 + SKIRT_T / 2)]);
      }
      for (const end of [-1, 1]) {
        p.add(skirt, rbox(SKIRT_T, SKIRT_H, s.t, 0.004, 1), [end > 0 ? s.b + SKIRT_T / 2 : s.a - SKIRT_T / 2, SKIRT_H / 2, 0]);
      }
    });
  }

  // ---------------------------------------------------------- doorways
  // a lintel down to the door head, an architrave round both faces with
  // plinth blocks where the skirting stops; glass doors get an aluminium
  // frame and a glass transom instead
  for (const d of doors) {
    const hd = Math.min(HEAD, d.h - 0.3);
    const w = d.b - d.a;
    const cx = (d.a + d.b) / 2;
    onLine(p, d, () => {
      if (d.glass) {
        p.add('glassPane', box(w, d.h - hd - 0.1, 0.012), [cx, hd + (d.h - hd - 0.1) / 2, 0]);
        p.add('aluminium', rbox(w, 0.05, d.t + 0.02, 0.004, 1), [cx, hd, 0]);
        for (const e of [d.a, d.b]) p.add('aluminium', rbox(0.05, d.h, d.t + 0.02, 0.004, 1), [e, d.h / 2, 0]);
        return;
      }
      p.add('wall', box(w, d.h - hd, d.t), [cx, hd + (d.h - hd) / 2, 0], null, null, base);
      skins(d, d.a, d.b, hd, d.h, d.t);
      if (look.frames === false) return;
      for (const side of [-1, 1]) {
        const z = side * (d.t / 2 + 0.009);
        p.add(frame, rbox(0.07, hd + 0.07, 0.018, 0.005, 1), [d.a - 0.035, (hd + 0.07) / 2, z]);
        p.add(frame, rbox(0.07, hd + 0.07, 0.018, 0.005, 1), [d.b + 0.035, (hd + 0.07) / 2, z]);
        p.add(frame, rbox(w + 0.14, 0.07, 0.018, 0.005, 1), [cx, hd + 0.035, z]);
        for (const e of [d.a - 0.036, d.b + 0.036]) p.add(frame, rbox(0.08, 0.16, 0.026, 0.004, 1), [e, 0.08, side * (d.t / 2 + 0.013)]);
      }
      // the reveal: a lining board round the inside of the opening
      for (const e of [d.a + 0.006, d.b - 0.006]) p.add(frame, box(0.012, hd, d.t), [e, hd / 2, 0]);
      p.add(frame, box(w, 0.012, d.t), [cx, hd - 0.006, 0]);
      if (opts.office) {
        // stainless kick guards on the jambs: this is where everyone clips it
        for (const [e, dir] of [[d.a, 1], [d.b, -1]]) p.add('brushedSteel', box(0.002, 0.3, d.t + 0.004), [e + dir * 0.0135, 0.15, 0]);
      }
    });
  }

  // ------------------------------------------------------- glass walls
  for (const s of segments(glass)) {
    onLine(p, s, () => {
      const cx = (s.a + s.b) / 2;
      p.add('glassPane', box(s.len, s.h - 0.16, 0.012), [cx, 0.06 + (s.h - 0.16) / 2, 0]);
      p.add('aluminium', rbox(s.len, 0.06, s.t, 0.004, 1), [cx, 0.03, 0]);
      p.add('aluminium', rbox(s.len + 0.05, 0.1, s.t + 0.03, 0.006, 1), [cx, s.h - 0.05, 0]);
      const n = Math.max(1, Math.round(s.len / 1.5));
      for (let i = 0; i <= n; i++) {
        const x = s.a + i * s.len / n;
        p.add('aluminium', rbox(0.045, s.h, s.t + 0.012, 0.004, 1), [Math.min(s.b - 0.022, Math.max(s.a + 0.022, x)), s.h / 2, 0]);
      }
      // a frosted band at 1 m so people (and cars) see the glass
      p.add('frost', box(s.len, 0.1, 0.014), [cx, 1.05, 0]);
      p.add('smudge', card(s.len * 0.9, 2.2, [0, 0, 1, 1]), [cx, 1.2, 0.012]);
    });
  }

  // ---------------------------------------------------- balustrades
  for (const s of segments(low)) {
    onLine(p, s, () => {
      const cx = (s.a + s.b) / 2;
      p.add('glassPane', box(s.len, s.h - 0.1, 0.012), [cx, 0.05 + (s.h - 0.1) / 2, 0]);
      // the base channel is the collider's full depth: a car stops on it, not
      // on thin air in front of the glass
      p.add('brushedSteel', rbox(s.len, 0.05, s.t, 0.006, 1), [cx, 0.025, 0]);
      p.add('brushedSteel', rbox(s.len + 0.04, 0.045, 0.07, 0.02, 2), [cx, s.h, 0]);
      const n = Math.max(1, Math.round(s.len / 1.2));
      for (let i = 0; i <= n; i++) {
        p.add('brushedSteel', rbox(0.045, s.h, 0.045, 0.006, 1), [s.a + 0.03 + i * (s.len - 0.06) / n, s.h / 2, 0]);
      }
    });
  }
  return [...p.parts, ...bandOf(map).parts, ...clutterOf(map).parts];
}

// ------------------------------------------------------------ the band
// The first 30 cm of every wall, which from a car's seat IS the wall. What
// a face carries comes from a profile (dressing/kinds/*.js BANDS), looked up
// by the wall's style, or for an unstyled wall by 'plain' / 'glass' / 'low'
// — first as '<kind>:<theme>' (the office's own is 'plain:office'), then
// the shared default. A profile (metres; every key optional):
//
//   sockets    one double socket per this many metres of face, at 0.3 m
//   trunking   room ids (or true): a white dado trunking along those faces,
//              the sockets on it instead of in the wall
//   conduit    room ids (or true): grey conduit at 0.22 m on saddle clips,
//              a junction box now and then
//   clips      room ids (or true): a cable clipped along the skirting's top
//   vents      a low grille per this many metres
//   scuffs     a scuff mark per this many metres
//   stops      door stops beside the doorways
//   thresholds a metal strip across a doorway where the floor changes
//   guards     steel corner guards up every pillar
//   convector  'exterior' | 'all': a floor grille along the face
//   scuppers   (railings) a drain at the base every this many metres
//   faces      (wall, side) => bool: which faces take it at all (side −1:
//              the wall's −x/−z face, +1: its +x/+z face)
//   face       where the visible face is, metres proud of the collider's
//
// Each face is split where the room it looks into changes, so a long wall
// between two rooms gets each room's dressing on its own side, and a face
// that looks at nothing (outside the building, into another wall) gets none.
const within = (list, id) => list === true || (Array.isArray(list) && list.includes(id));
const bandCache = new WeakMap();

export function bandOf(map) {
  let out = bandCache.get(map);
  if (out) return out;
  const p = new Piece();
  const r = rng(7);
  const B = map.MAP_BOUNDS;
  const solidWalls = map.WALLS.filter((w) => !w.low);
  // the room a point (metres) is in, or null: outside, or inside a wall
  const roomAt = (x, z) => {
    if (x * M <= B.minX || x * M >= B.maxX || z * M <= B.minZ || z * M >= B.maxZ) return null;
    if (solidWalls.some((w) => Math.abs(x * M - w.x) < w.w / 2 && Math.abs(z * M - w.z) < w.d / 2)) return null;
    return map.roomAt(x * M, z * M);
  };
  const profileOf = (w) => {
    // a styled wall takes its style's profile, or nothing (a fence, mesh
    // guarding, a dock door carry no sockets)
    if (w.style) return BANDS[w.style] ?? null;
    const kind = w.glass ? 'glass' : w.low ? 'low' : 'plain';
    return BANDS[`${kind}:${map.theme}`] ?? BANDS[kind] ?? null;
  };
  // (a theme's own walls draw their own doors: stops and strips are for the
  // doorways this file frames)
  const doors = doorways(solidWalls.filter((w) => !w.style));

  for (const s of segments(map.WALLS)) {
    const prof = profileOf(s.w);
    if (!prof || s.len < 0.25) continue;
    const pillar = s.len < 0.6 && s.t > 0.3;
    for (const side of [-1, 1]) {
      // faces() is asked in world terms: −1 the wall's −x/−z face, +1 its
      // +x/+z (a z-running run's local +z is world −x)
      if (prof.faces && !prof.faces(s.w, s.alongX ? side : -side)) continue;
      const fz = side * (s.t / 2 + (prof.face || 0)); // the face, in the run's frame
      // split the face by the room it looks into
      const runs = [];
      for (let a = s.a; a < s.b - 1e-6; a += 0.25) {
        const mid = Math.min(a + 0.125, s.b);
        const id = roomAt(...worldAt(s, mid, side * (s.t / 2 + 0.3)))?.id || null;
        // an exterior face: nothing but sky on the wall's other side
        const outside = !roomAt(...worldAt(s, mid, -side * (s.t / 2 + 0.3)));
        const last = runs[runs.length - 1];
        if (last && last.id === id) { last.b = Math.min(a + 0.25, s.b); last.exterior &&= outside; }
        else runs.push({ id, exterior: outside, a, b: Math.min(a + 0.25, s.b) });
      }
      for (const run of runs) {
        if (!run.id) continue;
        const L = run.b - run.a;
        onLine(p, s, () => p.at([0, 0, fz], side < 0 ? [0, Math.PI, 0] : null, () => {
          // in here, local +z points into the room and x runs along the wall
          // (mirrored on the far face: the run's a..b map to −x)
          const X = (x) => side * x;
          bandRun(p, r, prof, run, L, X, pillar);
        }));
      }
    }
    // steel corner guards up a pillar's four corners, skirting to 1.2 m: an
    // angle, one leaf on each face that meets there
    if (prof.guards && pillar) {
      onLine(p, s, () => {
        const cx = (s.a + s.b) / 2, h = 1.2 - SKIRT_H;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          p.add('brushedSteel', box(0.03, h, 0.002), [cx + sx * (s.len / 2 - 0.015), SKIRT_H + h / 2, sz * (s.t / 2 + 0.001)]);
          p.add('brushedSteel', box(0.002, h, 0.03), [cx + sx * (s.len / 2 + 0.001), SKIRT_H + h / 2, sz * (s.t / 2 - 0.015)]);
        }
      });
    }
  }

  // doorways: stops on the wall beside them, strips across them
  const plainProf = BANDS[`plain:${map.theme}`] ?? BANDS.plain ?? {};
  for (const d of doors) {
    const w = d.b - d.a;
    const cx = (d.a + d.b) / 2;
    const sides = [-1, 1].map((side) => roomAt(...worldAt(d, cx, side * (d.t / 2 + 0.4))));
    if (plainProf.thresholds && sides[0] && sides[1] && sides[0].floor !== sides[1].floor) {
      onLine(p, d, () => {
        p.add('aluminium', rbox(w, 0.004, d.t + 0.04, 0.0015, 1), [cx, 0.002, 0]);
        p.add('plasticBlack', box(w, 0.0015, 0.006), [cx, 0.0042, 0]);
      });
    }
    if (plainProf.stops && !d.glass) {
      // one stop, on the face and jamb a door would swing to
      const side = r() < 0.5 ? -1 : 1;
      if (!sides[side < 0 ? 0 : 1]) continue;
      const along = r() < 0.5 ? d.a - 0.12 : d.b + 0.12;
      onLine(p, d, () => p.at([along, 0.1, side * (d.t / 2)], side < 0 ? [0, Math.PI, 0] : null, () => {
        p.add('brushedSteel', cyl(0.011, 0.011, 0.055, 8, true), [0, 0, 0.0275], [Math.PI / 2, 0, 0]);
        p.add('rubber', cyl(0.014, 0.012, 0.018, 8), [0, 0, 0.062], [Math.PI / 2, 0, 0]);
        p.add('brushedSteel', cyl(0.02, 0.02, 0.004, 8), [0, 0, 0.002], [Math.PI / 2, 0, 0]);
      }));
    }
  }
  out = { parts: p.parts, decals: p.decals };
  bandCache.set(map, out);
  return out;
}

// One run of face, a..b metres along the wall, looking into room `run.id`.
// X(x) maps the run's coordinate into the face's local frame.
function bandRun(p, r, prof, run, L, X, pillar) {
  const { id } = run;
  const at = X;
  const trunk = within(prof.trunking, id) && L > 1.2;
  const conduit = within(prof.conduit, id) && L > 1.2;
  const clips = within(prof.clips, id) && L > 1.5;
  const TY = SKIRT_H + 0.055; // trunking centre, sitting on the skirting
  if (trunk) {
    const a = run.a + 0.08, b = run.b - 0.08;
    p.add('plasticWhite', rbox(b - a, 0.1, 0.045, 0.004, 1), [at((a + b) / 2), TY, 0.0225]);
    p.add('plasticGrey', box(b - a, 0.004, 0.002), [at((a + b) / 2), TY, 0.046]);
    for (const e of [a, b]) p.add('plasticWhite', rbox(0.012, 0.104, 0.049, 0.004, 1), [at(e), TY, 0.0245]);
  }
  if (conduit) {
    const a = run.a + 0.1, b = run.b - 0.1, y = 0.22;
    p.add('plasticGrey', cyl(0.011, 0.011, b - a, 8), [at((a + b) / 2), y, 0.028], [0, 0, Math.PI / 2]);
    for (let x = a + 0.2; x < b; x += 0.8) p.add('brushedSteel', box(0.018, 0.034, 0.03), [at(x), y, 0.022]);
    if (L > 3) {
      const x = a + (b - a) * (0.3 + r() * 0.4);
      p.add('plasticGrey', rbox(0.1, 0.1, 0.05, 0.006, 1), [at(x), y, 0.03]);
      p.add('plasticGrey', cyl(0.011, 0.011, 0.07, 8), [at(x), y + 0.09, 0.028]);
    }
  }
  if (clips) {
    const a = run.a + 0.1, b = run.b - 0.1, y = SKIRT_H + 0.008;
    p.add('tint', cyl(0.003, 0.003, b - a, 5), [at((a + b) / 2), y, 0.02], [0, 0, Math.PI / 2], null, '#1d1f24');
    for (let x = a + 0.15; x < b; x += 0.35) p.add('plasticWhite', box(0.008, 0.012, 0.01), [at(x), y, 0.021]);
  }
  // sockets: on the trunking, or flush in the wall at 0.3 m
  if (prof.sockets && L > 1) {
    const n = Math.max(trunk ? 1 : 0, Math.floor(L / prof.sockets));
    for (let i = 0; i < n; i++) {
      const x = run.a + (i + 0.5 + (r() - 0.5) * 0.3) * (L / n);
      const y = trunk ? TY : 0.3, z = trunk ? 0.045 : 0;
      p.at([at(x), y, z], null, () => {
        p.add('plasticWhite', rbox(0.146, 0.086, 0.012, 0.004, 1), [0, 0, 0.006]);
        for (const k of [-1, 1]) p.add('plasticBlack', box(0.03, 0.028, 0.002), [k * 0.036, 0, 0.0125]);
        // now and then something's plugged in
        if (r() < 0.35) {
          p.add('plasticBlack', rbox(0.035, 0.045, 0.03, 0.006, 1), [0.036, 0, 0.028]);
          p.add('tint', tube([[0.036, -0.02, 0.03], [0.04, -0.08, 0.05], [0.06, -y + 0.01, 0.1], [0.14, -y + 0.005, 0.2]], 0.0035, 4, true, 12), [0, 0, 0], null, null, '#1d1f24');
        }
      });
    }
  }
  if (prof.vents && !trunk && L > 1.4) {
    const n = Math.floor(L / prof.vents + r() * 0.8);
    for (let i = 0; i < n; i++) {
      const x = run.a + 0.4 + r() * (L - 0.8);
      p.add('trim:#e2e2dc', rbox(0.34, 0.16, 0.006, 0.002, 1), [at(x), 0.24, 0.003]);
      p.decal('vent', 0.32, 0.14, [at(x), 0.24, 0.0065]);
    }
  }
  if (prof.scuffs && L > 0.8) {
    const n = Math.floor(L / prof.scuffs + r() * 0.6);
    for (let i = 0; i < n; i++) {
      const x = run.a + 0.2 + r() * (L - 0.4);
      const w = 0.15 + r() * 0.5, h = 0.04 + r() * 0.12;
      // one cell of the 2 × 2 scuff atlas
      const cu = r() < 0.5 ? 0 : 0.5, cv = r() < 0.5 ? 0 : 0.5;
      p.add('scuff', card(w, h, [cu, cv, cu + 0.5, cv + 0.5]), [at(x), SKIRT_H + 0.02 + h / 2 + r() * 0.2, trunk ? 0.047 : 0.0045]);
    }
  }
  if (prof.convector && !pillar && (prof.convector === 'all' || run.exterior)) {
    const a = run.a + 0.05, b = run.b - 0.05;
    if (b - a > 0.4) {
      p.add('aluminium', rbox(b - a, 0.006, 0.26, 0.002, 1), [at((a + b) / 2), 0.003, 0.14]);
      p.add('louvre', box(b - a - 0.03, 0.002, 0.22), [at((a + b) / 2), 0.0062, 0.14]);
    }
  }
  if (prof.scuppers && L > 1) {
    const n = Math.max(1, Math.floor(L / prof.scuppers));
    for (let i = 0; i < n; i++) {
      const x = run.a + (i + 0.5) * (L / n);
      p.decal('drain', 0.22, 0.22, [at(x), 0.006, 0.14], [-Math.PI / 2, 0, 0], 0.95);
      p.decal('moss', 0.9, 0.25, [at(x + 0.3), 0.0058, 0.12], [-Math.PI / 2, 0, 0], 0.8);
    }
  }
}
