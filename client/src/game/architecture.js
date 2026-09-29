// The building itself, as kit parts: every wall with a skirting board, a
// frame round every doorway (derived from the gaps between wall segments),
// glass partitions with mullions, a base channel, a manifestation band and a
// transom over their doors, the balcony's balustrade — and, on the office
// floor, the things that fill the 0–1.2 m band a car actually looks at:
// sockets, scuffs, corner guards. Colliders stay in Office.jsx (one box per
// wall, as always); this is only what they look like.
//
// Parts are in METRES, placed in world space (the batch scales by M), so
// every surface gets the same metre UVs as the furniture.
import { M } from '@rc/shared';
import { Piece, box, rbox, card } from './kit.js';
import { rng } from './textures.js';

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
  const r = rng(7);
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
      if (!opts.office || s.len < 1.2) return;
      // the office's eye-level band: double sockets at 0.3 m, scuffs where
      // trolleys, chairs and RC cars have hit the paint
      const n = Math.floor(s.len / 3.6);
      for (let i = 0; i < n; i++) {
        const x = s.a + (i + 0.5 + (r() - 0.5) * 0.3) * (s.len / n);
        const side = r() < 0.5 ? -1 : 1;
        p.at([x, 0.3, side * (s.t / 2)], side < 0 ? [0, Math.PI, 0] : null, () => {
          p.add('plasticWhite', rbox(0.146, 0.086, 0.012, 0.004, 1), [0, 0, 0.009]);
          for (const k of [-1, 1]) p.add('plasticBlack', box(0.03, 0.028, 0.002), [k * 0.036, 0, 0.0155]);
        });
      }
      const scuffs = Math.floor(s.len / 2.5);
      for (let i = 0; i < scuffs; i++) {
        const x = s.a + 0.2 + r() * (s.len - 0.4);
        const side = r() < 0.5 ? -1 : 1;
        const w = 0.15 + r() * 0.5, h = 0.04 + r() * 0.12;
        // one cell of the 2 × 2 scuff atlas
        const cu = r() < 0.5 ? 0 : 0.5, cv = r() < 0.5 ? 0 : 0.5;
        p.add('scuff', card(w, h, [cu, cv, cu + 0.5, cv + 0.5]), [x, SKIRT_H + 0.02 + h / 2 + r() * 0.2, side * (s.t / 2 + 0.0045)], side < 0 ? [0, Math.PI, 0] : null);
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
  return p.parts;
}
