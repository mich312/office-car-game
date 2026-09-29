// The built-in furniture, as pure builders. Each one takes a map's FURNITURE
// entry and returns
//
//   { parts, colliders, leds, friction }
//
//   parts      the visuals, in METRES in the piece's own frame (origin on the
//              floor at its centre, +z its front) — kit.js Piece parts, baked
//              room by room into one draw per material (Office.jsx)
//   colliders  the physics, in WORLD UNITS in the same frame (as they always
//              were: gameplay doesn't change when the looks do)
//   leds       blinking status lights for the map-wide LED instancer
//
// Every piece honours the rotY contract (w, d are its own; +z is its front)
// and draws from materials.js by key. A theme can hand the batch its own
// builders the same way (themes' BUILDERS).
import * as THREE from 'three';
import { M } from '@rc/shared';
import { Piece, box, rbox, cyl, lathe, tube, torus, sphere, bush, card, extrude, shape } from './kit.js';
import { atlasRect, atlasCell, rng } from './textures.js';

const DEG = Math.PI / 180;
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const CABLES = ['#1b1c1f', '#2a2c31', '#3a3d44', '#1d3b6b', '#c9a227'];

// colliders, in world units, piece frame
const cuboid = (hx, hy, hz, x = 0, y = 0, z = 0, rot = null) => ({ box: [hx, hy, hz], at: [x, y, z], rot });
const cylinder = (halfH, r, x = 0, y = 0, z = 0) => ({ cyl: [halfH, r], at: [x, y, z] });
const solidBox = (f) => [cuboid(f.w / 2, f.h / 2, f.d / 2, 0, f.h / 2, 0)];

const dims = (f) => [f.w / M, f.d / M, f.h / M];

// a horizontal bar handle on two standoffs, centred at (x, y) on the face z
function barHandle(p, mat, x, y, z, len = 0.16, vertical = false) {
  const r = 0.006, off = 0.03;
  p.at([x, y, z], vertical ? [0, 0, Math.PI / 2] : null, () => {
    p.add(mat, cyl(r, r, len, 8), [0, 0, off], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) p.add(mat, cyl(0.004, 0.004, off, 6), [s * (len / 2 - 0.02), 0, off / 2], [Math.PI / 2, 0, 0]);
  });
}

// cables drooping from a to b (metres), a few strands side by side
function cableRun(p, pts, strands = 3, r = 0.006, seed = 0) {
  for (let i = 0; i < strands; i++) {
    const o = (i - (strands - 1) / 2) * r * 2.1;
    p.add('tint', tube(pts.map(([x, y, z]) => [x + o * 0.3, y, z + o]), r, 4, true, 12), [0, 0, 0], null, null, CABLES[(i + seed) % CABLES.length]);
  }
}

// ======================================================= desks and tables
// Cars drive UNDER desks: the collider is the top slab and four legs, placed
// where they always were (legs 0.28 u in from each edge).
const LEG_IN = 0.28;
const TOP = 0.12;
const deskColliders = (f) => [
  cuboid(f.w / 2, TOP / 2, f.d / 2, 0, f.h - TOP / 2, 0),
  ...CORNERS.map(([sx, sz]) => cuboid(0.1, f.h / 2, 0.1, sx * (f.w / 2 - LEG_IN), f.h / 2, sz * (f.d / 2 - LEG_IN))),
];

function desk(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const back = ctx.backSign; // the side facing the desk opposite in a pod
  const T = 0.025;
  const lx = W / 2 - LEG_IN / M, lz = D / 2 - LEG_IN / M;
  p.add('veneerOak', rbox(W, T, D, 0.006), [0, H - T / 2, 0]);
  // black ABS edge under the top's rim: the line you see from car height
  p.add('plasticBlack', rbox(W - 0.01, 0.006, D - 0.01, 0.002, 1), [0, H - T - 0.002, 0]);
  p.add('plasticBlack', cyl(0.03, 0.03, 0.004, 16), [W * 0.32, H + 0.001, back * (D / 2 - 0.1)]);
  const legH = H - T - 0.015;
  for (const [sx, sz] of CORNERS) {
    p.add('powderWhite', rbox(0.05, legH, 0.05, 0.005, 1), [sx * lx, 0.015 + legH / 2, sz * lz]);
    p.add('plasticBlack', cyl(0.022, 0.025, 0.015, 10), [sx * lx, 0.0075, sz * lz]);
  }
  // the frame is what you see from below: two long rails, two short
  const railY = H - T - 0.028;
  for (const s of [-1, 1]) {
    p.add('powderWhite', rbox(2 * lx - 0.05, 0.05, 0.03, 0.004, 1), [0, railY, s * lz]);
    p.add('powderWhite', rbox(0.03, 0.05, 2 * lz - 0.05, 0.004, 1), [s * lx, railY, 0]);
  }
  // modesty panel on the back, from 0.37 m up: cars still drive under
  const pTop = H - T - 0.055, pBot = 0.37;
  p.add('powderWhite', rbox(2 * lx - 0.07, pTop - pBot, 0.012, 0.004, 1), [0, (pTop + pBot) / 2, back * (lz + 0.032)]);
  // cable tray under the back edge, a power strip in it, cables to the floor
  const ty = H - T - 0.12, tz = back * (lz - 0.1);
  p.add('powderBlack', rbox(1.2, 0.004, 0.1, 0.0015, 1), [0, ty - 0.04, tz]);
  for (const s of [-1, 1]) p.add('powderBlack', rbox(1.2, 0.08, 0.004, 0.0015, 1), [0, ty, tz + s * 0.05]);
  p.add('plasticWhite', rbox(0.3, 0.035, 0.05, 0.006, 1), [0.25, ty - 0.02, tz]);
  p.add('tint', rbox(0.022, 0.012, 0.026, 0.003, 1), [0.14, ty, tz], null, null, '#ff7a1a');
  cableRun(p, [[-0.35, ty - 0.02, tz], [-0.5, ty - 0.1, tz], [-lx + 0.05, ty - 0.3, back * lz], [-lx + 0.04, 0.12, back * lz + back * 0.03], [-lx + 0.02, 0.008, back * (lz + 0.14)]], 3, 0.006, ctx.index);
  return { parts: p.parts, colliders: deskColliders(f), friction: 1 };
}

function table(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  // ---- coffee table (under 0.5 m): walnut, a lower shelf, splayed legs
  if (H < 0.5) {
    const T = 0.03;
    p.add('veneerWalnut', rbox(W, T, D, 0.01), [0, H - T / 2, 0]);
    p.add('veneerWalnut', rbox(W - 0.16, 0.018, D - 0.14, 0.004, 1), [0, 0.11, 0]);
    const lx = W / 2 - 0.08, lz = D / 2 - 0.07;
    for (const [sx, sz] of CORNERS) {
      p.add('veneerWalnut', cyl(0.025, 0.018, H - T, 10), [sx * lx, (H - T) / 2, sz * lz], [sz * 4 * DEG, 0, -sx * 4 * DEG]);
      p.add('brass', cyl(0.019, 0.019, 0.02, 10), [sx * (lx + 0.012), 0.01, sz * (lz + 0.012)]);
    }
    return { parts: p.parts, colliders: deskColliders(f), friction: 1 };
  }
  // ---- café table (square footprint): a round top on one column
  if (Math.abs(W - D) < 0.1) {
    const R0 = W / 2;
    p.add('laminateWhite', cyl(R0, R0, 0.025, 48), [0, H - 0.0125, 0]);
    p.add('plasticBlack', cyl(R0 + 0.001, R0 + 0.001, 0.02, 48, true), [0, H - 0.0125, 0]);
    p.add('brushedSteel', cyl(0.12, 0.12, 0.015, 24), [0, H - 0.033, 0]);
    p.add('brushedSteel', cyl(0.035, 0.035, H - 0.06, 16), [0, (H - 0.04) / 2 + 0.02, 0]);
    for (const a of [45, -45]) {
      p.add('brushedSteel', rbox(0.62, 0.02, 0.06, 0.006, 1), [0, 0.02, 0], [0, a * DEG, 0]);
    }
    for (const [sx, sz] of CORNERS) p.add('plasticBlack', cyl(0.02, 0.02, 0.01, 10), [sx * 0.22, 0.005, sz * 0.22]);
    const r = f.w / 2;
    return {
      parts: p.parts,
      colliders: [
        cylinder(TOP / 2, r, 0, f.h - TOP / 2, 0),
        cylinder((f.h - TOP) / 2, 0.05 * M, 0, (f.h - TOP) / 2, 0),
        cuboid(0.31 * M, 0.012 * M, 0.03 * M, 0, 0.012 * M, 0, [0, Math.PI / 4, 0]),
        cuboid(0.31 * M, 0.012 * M, 0.03 * M, 0, 0.012 * M, 0, [0, -Math.PI / 4, 0]),
      ],
      friction: 1,
    };
  }
  // ---- meeting table (long): oak on two black trestle panels
  if (W > 3 || D > 3) {
    const long = W >= D;
    const L = Math.max(W, D), S = Math.min(W, D);
    const T = 0.035;
    p.at([0, 0, 0], long ? null : [0, Math.PI / 2, 0], () => {
      p.add('veneerOak', rbox(L, T, S, 0.008), [0, H - T / 2, 0]);
      p.add('plasticBlack', rbox(L - 0.01, 0.006, S - 0.01, 0.002, 1), [0, H - T - 0.002, 0]);
      for (const s of [-1, 1]) {
        const x = s * (L / 2 - 0.45);
        p.add('powderBlack', rbox(0.05, H - T - 0.03, 1.0, 0.008), [x, (H - T - 0.03) / 2 + 0.03, 0]);
        p.add('powderBlack', rbox(0.08, 0.03, 1.1, 0.008, 1), [x, 0.015, 0]);
        p.add('powderBlack', rbox(0.06, 0.04, S - 0.2, 0.006, 1), [x, H - T - 0.02, 0]);
      }
      // stretcher between the trestles, high enough to drive under
      p.add('powderBlack', rbox(L - 0.9, 0.06, 0.04, 0.006, 1), [0, H - T - 0.1, 0]);
      // flush cable box in the top, two cables dropping into it
      p.add('brushedSteel', rbox(0.3, 0.004, 0.12, 0.002, 1), [0, H + 0.001, 0]);
      cableRun(p, [[0.05, H + 0.002, 0], [0.05, H - 0.08, 0.02], [0.2, H - 0.15, 0.03], [L / 2 - 0.47, 0.4, 0.05], [L / 2 - 0.47, 0.02, 0.1]], 2, 0.006, 1);
    });
    const hx = (L / 2 - 0.45) * M;
    return {
      parts: p.parts,
      colliders: [
        cuboid(f.w / 2, TOP / 2, f.d / 2, 0, f.h - TOP / 2, 0),
        ...[-1, 1].map((s) => (long
          ? cuboid(0.035 * M, (f.h - TOP) / 2, 0.5 * M, s * hx, (f.h - TOP) / 2, 0)
          : cuboid(0.5 * M, (f.h - TOP) / 2, 0.035 * M, 0, (f.h - TOP) / 2, s * hx))),
      ],
      friction: 1,
    };
  }
  return desk(f, { ...ctx, backSign: -1 });
}

// The CEO's desk: walnut, a leather writing inlay, a full modesty panel on
// the visitors' side (where the book ramp lands), a drawer pedestal.
function ceodesk(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const T = 0.04;
  p.add('veneerWalnut', rbox(W, T, D, 0.008), [0, H - T / 2, 0]);
  p.add('leather', rbox(Math.min(1.6, W - 0.5), 0.002, Math.min(0.55, D - 0.3), 0.001, 1), [0, H + 0.001, 0.05]);
  // visitor side (−z): a panel flush with the top's edge, lifted 0.25 m
  const pBot = 0.25;
  p.add('veneerWalnut', rbox(W - 0.1, H - T - pBot, 0.03, 0.006), [0, pBot + (H - T - pBot) / 2, -D / 2 + 0.02]);
  p.add('brass', rbox(W - 0.1, 0.012, 0.004, 0.002, 1), [0, pBot + 0.04, -D / 2 + 0.003]);
  // pedestal at −x: three drawers facing the chair (+z)
  const pw = 0.45, ph = H - T;
  const px = -W / 2 + pw / 2 + 0.03;
  p.add('veneerWalnut', rbox(pw, ph, D - 0.12, 0.006), [px, ph / 2, 0.02]);
  for (let i = 0; i < 3; i++) {
    const dy = 0.06 + i * (ph - 0.08) / 3 + (ph - 0.08) / 6;
    p.add('veneerWalnut', rbox(pw - 0.03, (ph - 0.08) / 3 - 0.006, 0.02, 0.004, 1), [px, dy, D / 2 - 0.05]);
    barHandle(p, 'brass', px, dy + 0.05, D / 2 - 0.04, 0.12);
  }
  p.add('plasticBlack', rbox(pw - 0.02, 0.05, D - 0.16, 0.004, 1), [px, 0.025, 0.02]);
  // panel leg at +x
  p.add('veneerWalnut', rbox(0.04, H - T, D - 0.12, 0.006), [W / 2 - 0.06, (H - T) / 2, 0.02]);
  const lx = (W / 2 - 0.06) * M;
  return {
    parts: p.parts,
    colliders: [
      cuboid(f.w / 2, TOP / 2, f.d / 2, 0, f.h - TOP / 2, 0),
      cuboid(0.03 * M, (f.h - TOP) / 2, (D - 0.12) / 2 * M, lx, (f.h - TOP) / 2, 0.02 * M),
      cuboid(pw / 2 * M, (f.h - TOP) / 2, (D - 0.12) / 2 * M, px * M, (f.h - TOP) / 2, 0.02 * M),
      cuboid((W - 0.1) / 2 * M, (H - T - pBot) / 2 * M, 0.03 * M, 0, (pBot + (H - T - pBot) / 2) * M, (-D / 2 + 0.02) * M),
    ],
    friction: 1,
  };
}

// ============================================================ reception
// The first thing seen at the race start. Visitor face +z (the ramp lands
// on it), a walnut transaction ledge, the company logo at car-eye height.
function recdesk(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const plinth = 0.1;
  // carcass and kick plinth, recessed: the shadow line at eye level
  p.add('powderBlack', rbox(W - 0.1, plinth, D - 0.12, 0.004, 1), [0, plinth / 2, -0.01]);
  p.add('laminateWhite', rbox(W, H - plinth - 0.03, D - 0.05, 0.01), [0, plinth + (H - plinth - 0.03) / 2, -0.025]);
  // visitor front: white panel, an oak band, the logo
  const fz = D / 2 - 0.02;
  p.add('laminateWhite', rbox(W, H - plinth - 0.03, 0.04, 0.012), [0, plinth + (H - plinth - 0.03) / 2, fz]);
  p.add('veneerOak', rbox(W + 0.02, 0.15, 0.045, 0.006), [0, 0.675, fz + 0.004]);
  // the logo off to one side: the ramp up the middle would hide it
  p.add('labels', card(0.8, 0.25, atlasRect('logo')), [-W / 4 - 0.1, 0.36, fz + 0.021]);
  // brushed kick strip where the vacuum cleaner hits it
  p.add('brushedSteel', rbox(W - 0.1, 0.03, 0.003, 0.001, 1), [0, plinth + 0.015, fz + 0.021]);
  // the top: a walnut ledge overhanging the front, white worktop behind
  p.add('veneerWalnut', rbox(W + 0.1, 0.03, 0.35, 0.008), [0, H - 0.015, D / 2 + 0.08 - 0.175]);
  p.add('laminateWhite', rbox(W, 0.025, D - 0.3, 0.006), [0, H - 0.0125, -0.15]);
  // staff side (−z): drawer pedestals with bar pulls
  for (const x of [-W / 2 + 0.35, W / 2 - 0.35]) {
    for (let i = 0; i < 3; i++) {
      const y = 0.2 + i * 0.26;
      p.add('laminateWhite', rbox(0.5, 0.24, 0.02, 0.004, 1), [x, y, -D / 2 + 0.0]);
      barHandle(p, 'brushedSteel', x, y + 0.07, -D / 2 - 0.03, 0.14);
    }
  }
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// ===================================================== kitchen counters
// Modules 0.6 m wide: sage doors with bar handles over a recessed black toe
// kick, a stone worktop. The office counter gets a sink, a dishwasher, an
// oven, a splashback and wall cabinets; the island is butcher block with
// doors on both long sides.
function counter(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const island = f.type === 'island';
  const kick = 0.1, wt = 0.04, inset = 0.03;
  const long = W >= D;
  const L = long ? W : D, S = long ? D : W;
  const run = () => {
    // carcass (sides show at the ends), toe kick
    p.add('laminateWhite', rbox(L - inset * 2, H - wt - kick, S - inset * 2, 0.006), [0, kick + (H - wt - kick) / 2, 0]);
    p.add('powderBlack', rbox(L - inset * 2 - 0.02, kick, S - inset * 2 - 0.12, 0.004, 1), [0, kick / 2, 0]);
    const n = Math.max(1, Math.round((L - inset * 2) / 0.6));
    const mw = (L - inset * 2) / n;
    const doorH = H - wt - kick - 0.012;
    const faces = island ? [1, -1] : [1];
    // which modules are appliances (the long office run only)
    const at = (x) => Math.round((x + L / 2 - inset) / mw - 0.5);
    const special = {};
    if (!island && L > 6) {
      const sink = at(-2.0);
      special[sink] = 'sink';
      special[sink - 1] = 'dishwasher';
      special[at(-4.4)] = 'oven';
      special[at(0)] = 'drawers'; // under the coffee machine
    }
    for (const side of faces) {
      const z = side * (S / 2 - inset + 0.009);
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + inset + (i + 0.5) * mw;
        const kind = special[i] || (i % 4 === 1 ? 'drawers' : 'door');
        const y0 = kick + 0.006;
        p.at([x, 0, z], side < 0 ? [0, Math.PI, 0] : null, () => {
          if (kind === 'dishwasher') {
            p.add('brushedSteel', rbox(mw - 0.004, doorH, 0.02, 0.003, 1), [0, y0 + doorH / 2, 0]);
            p.add('plasticBlack', rbox(mw - 0.04, 0.05, 0.005, 0.002, 1), [0, y0 + doorH - 0.04, 0.012]);
            barHandle(p, 'brushedSteel', 0, y0 + doorH - 0.1, 0.01, mw - 0.14);
          } else if (kind === 'oven') {
            p.add('powderBlack', rbox(mw - 0.004, doorH, 0.02, 0.003, 1), [0, y0 + doorH / 2, 0]);
            p.add('glassBlack', rbox(mw - 0.08, doorH * 0.55, 0.006, 0.002, 1), [0, y0 + doorH * 0.42, 0.012]);
            barHandle(p, 'brushedSteel', 0, y0 + doorH * 0.82, 0.01, mw - 0.12);
            for (let k = 0; k < 4; k++) p.add('brushedSteel', cyl(0.012, 0.012, 0.015, 12), [-0.18 + k * 0.12, y0 + doorH - 0.04, 0.015], [Math.PI / 2, 0, 0]);
          } else if (kind === 'drawers') {
            const dh = (doorH - 0.008) / 3;
            for (let k = 0; k < 3; k++) {
              const yy = y0 + dh / 2 + k * (dh + 0.004);
              p.add('laminateSage', rbox(mw - 0.004, dh, 0.018, 0.003, 1), [0, yy, 0]);
              barHandle(p, 'brushedSteel', 0, yy + dh / 2 - 0.04, 0.009, 0.16);
            }
          } else {
            p.add('laminateSage', rbox(mw - 0.004, doorH, 0.018, 0.003, 1), [0, y0 + doorH / 2, 0]);
            // handles meet in pairs: vertical, near the shared edge
            const hx = (i % 2 ? -1 : 1) * (mw / 2 - 0.05);
            barHandle(p, 'brushedSteel', hx, y0 + doorH - 0.13, 0.009, 0.16, true);
          }
        });
      }
    }
    // worktop: exactly the footprint (the collider), a hole for the sink
    const top = island ? 'butcherBlock' : 'stoneTop';
    const sinkI = Object.keys(special).find((k) => special[k] === 'sink');
    if (sinkI !== undefined) {
      const sx = -L / 2 + inset + (+sinkI + 0.5) * mw;
      const outline = shape([[-L / 2, -S / 2], [L / 2, -S / 2], [L / 2, S / 2], [-L / 2, S / 2]]);
      const hole = new THREE.Path();
      const hw = 0.25, hd = 0.2, hr = 0.04, hz = 0.03;
      hole.moveTo(sx - hw + hr, hz - hd);
      hole.lineTo(sx + hw - hr, hz - hd); hole.quadraticCurveTo(sx + hw, hz - hd, sx + hw, hz - hd + hr);
      hole.lineTo(sx + hw, hz + hd - hr); hole.quadraticCurveTo(sx + hw, hz + hd, sx + hw - hr, hz + hd);
      hole.lineTo(sx - hw + hr, hz + hd); hole.quadraticCurveTo(sx - hw, hz + hd, sx - hw, hz + hd - hr);
      hole.lineTo(sx - hw, hz - hd + hr); hole.quadraticCurveTo(sx - hw, hz - hd, sx - hw + hr, hz - hd);
      outline.holes.push(hole);
      // the shape is drawn in (x, z); extrude runs along its z, laid flat
      p.add(top, extrude(`worktop${L}x${S}@${sinkI}`, outline, wt), [0, H - wt / 2, 0], [Math.PI / 2, 0, 0]);
      // a stainless undermount basin under the hole, a gooseneck tap behind
      const bd = 0.18;
      p.at([sx, H - wt, hz], null, () => {
        p.add('brushedSteel', rbox(hw * 2, 0.004, hd * 2, 0.002, 1), [0, -bd, 0]);
        for (const s of [-1, 1]) {
          p.add('brushedSteel', rbox(0.004, bd, hd * 2, 0.001, 1), [s * hw, -bd / 2, 0]);
          p.add('brushedSteel', rbox(hw * 2, bd, 0.004, 0.001, 1), [0, -bd / 2, s * hd]);
        }
        p.add('plasticBlack', cyl(0.035, 0.035, 0.004, 16), [0, -bd + 0.004, 0]);
        p.add('chrome', cyl(0.025, 0.03, 0.03, 16), [0, wt + 0.015, -hd - 0.06]);
        p.add('chrome', tube([[0, wt + 0.02, -hd - 0.06], [0, wt + 0.25, -hd - 0.06], [0, wt + 0.33, -hd + 0.02], [0, wt + 0.3, -hd + 0.12], [0, wt + 0.2, -hd + 0.16]], 0.012, 8), [0, 0, 0]);
        p.add('chrome', rbox(0.012, 0.012, 0.09, 0.005, 1), [0.04, wt + 0.08, -hd - 0.06], [0.4, 0, 0]);
      });
    } else {
      p.add(top, rbox(L, wt, S, 0.008), [0, H - wt / 2, 0]);
    }
    if (!island) {
      // splashback on the wall behind, 0.6 m of subway tile
      p.add('subway', box(L, 0.6, 0.008), [0, H + 0.3, -S / 2 + 0.004]);
      p.add('brushedSteel', rbox(L, 0.012, 0.012, 0.004, 1), [0, H + 0.006, -S / 2 + 0.012]);
      if (L > 6) {
        // wall cabinets over the east half, a hood over the oven
        const cx0 = 1.0, cx1 = L / 2 - 0.1;
        const cn = Math.round((cx1 - cx0) / 0.6);
        const cw = (cx1 - cx0) / cn;
        p.add('laminateWhite', rbox(cx1 - cx0, 0.7, 0.34, 0.006), [(cx0 + cx1) / 2, 1.82, -S / 2 + 0.17]);
        for (let i = 0; i < cn; i++) {
          const x = cx0 + (i + 0.5) * cw;
          p.add('laminateSage', rbox(cw - 0.004, 0.68, 0.018, 0.003, 1), [x, 1.82, -S / 2 + 0.35]);
          barHandle(p, 'brushedSteel', (i % 2 ? -1 : 1) * (cw / 2 - 0.05) + x, 1.54, -S / 2 + 0.36, 0.14, true);
        }
        p.add('lampStrip', box(cx1 - cx0 - 0.1, 0.006, 0.02), [(cx0 + cx1) / 2, 1.466, -S / 2 + 0.3]);
        const ox = -L / 2 + inset + (at(-4.4) + 0.5) * mw;
        p.add('brushedSteel', box(0.62, 0.08, 0.48), [ox, 1.6, -S / 2 + 0.24]);
        p.add('brushedSteel', cyl(0.12, 0.12, 1.4, 16), [ox, 2.32, -S / 2 + 0.16]);
        p.add('plasticBlack', rbox(0.58, 0.006, 0.44, 0.002, 1), [ox, 1.557, -S / 2 + 0.24]);
      }
    }
  };
  p.at([0, 0, 0], long ? null : [0, Math.PI / 2, 0], run);
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// ================================================================ sofas
// A plinth of tapered feet (the 0.1 m shadow gap under a sofa is the cue
// that sells it at eye level), a frame, loose seat and back cushions,
// rolled arms and a couple of throw pillows. Upholstery by room.
const SOFA_COVER = {
  reception: 'fabric:#4a4e57', games: 'fabric:#c0573f', ceo: 'leather',
};
const LOUNGE_COVERS = ['fabric:#3f6fa8', 'fabric:#3f7d7a', 'fabric:#6d5a8a'];
const PILLOWS = ['fabric:#e0b04a', 'fabric:#e9e2d0', 'fabric:#d9785a', 'fabric:#8fb3a0'];

function sofa(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const cover = SOFA_COVER[ctx.room] || LOUNGE_COVERS[ctx.index % LOUNGE_COVERS.length];
  const foot = 0.1, armW = 0.18, seatTop = f.h * 0.55 / M;
  const n = W > 1.9 ? 3 : 2;
  // feet: six walnut tapers
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 1]) {
      p.add('veneerWalnut', cyl(0.03, 0.02, foot, 10), [sx * (W / 2 - 0.08), foot / 2, sz * (D / 2 - 0.08)], [sz * -6 * DEG, 0, sx * 6 * DEG]);
    }
  }
  // frame: the base the cushions sit on
  p.add(cover, rbox(W - 0.02, 0.2, D - 0.02, 0.04), [0, foot + 0.1, 0]);
  // back frame
  const bz = -D / 2 + 0.09;
  p.add(cover, rbox(W - 0.02, H - foot - 0.1, 0.18, 0.06), [0, foot + 0.1 + (H - foot - 0.1) / 2, bz]);
  // arms
  for (const s of [-1, 1]) p.add(cover, rbox(armW, H * 0.8 - foot, D, 0.08), [s * (W / 2 - armW / 2), foot + (H * 0.8 - foot) / 2, 0]);
  // seat and back cushions, reclined back 8°
  const cw = (W - armW * 2) / n - 0.012;
  const sd = D - 0.2;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + armW + (i + 0.5) * (cw + 0.012);
    p.add(cover, rbox(cw, seatTop - foot - 0.2 + 0.02, sd, 0.05), [x, foot + 0.2 + (seatTop - foot - 0.2) / 2, D / 2 - sd / 2 - 0.01]);
    p.add(cover, rbox(cw, H - seatTop + 0.02, 0.16, 0.07), [x, seatTop + (H - seatTop) / 2 - 0.02, bz + 0.14], [-8 * DEG, 0, 0]);
  }
  // two throw pillows, askew
  const pil = PILLOWS[(ctx.index + 1) % PILLOWS.length];
  for (const s of [-1, 1]) {
    p.add(pil, rbox(0.4, 0.4, 0.12, 0.06), [s * (W / 2 - armW - 0.24), seatTop + 0.2, bz + 0.26], [-18 * DEG, s * 12 * DEG, s * 15 * DEG]);
  }
  return {
    parts: p.parts,
    colliders: [
      cuboid(f.w / 2, (f.h * 0.55) / 2, f.d / 2, 0, f.h * 0.275, 0),
      cuboid(f.w / 2, f.h / 2, f.d * 0.14, 0, f.h / 2, -f.d / 2 + f.d * 0.14),
    ],
    friction: 1,
  };
}

// ========================================================= server racks
// A 42U cabinet: black frame and side panels, a perforated front door with
// the servers behind it (their LEDs show through the holes), a perforated
// back with cable waterfalls, and the cable bundles rising to the ceiling.
function rack(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const r = rng(ctx.seed);
  const pl = 0.1;
  p.add('powderBlack', rbox(W - 0.04, pl - 0.03, D - 0.04, 0.006, 1), [0, 0.03 + (pl - 0.03) / 2, 0]);
  for (const [sx, sz] of CORNERS) {
    p.add('brushedSteel', cyl(0.016, 0.022, 0.03, 10), [sx * (W / 2 - 0.06), 0.015, sz * (D / 2 - 0.06)]);
  }
  const bodyH = H - pl;
  for (const [sx, sz] of CORNERS) p.add('powderBlack', rbox(0.04, bodyH, 0.04, 0.004, 1), [sx * (W / 2 - 0.02), pl + bodyH / 2, sz * (D / 2 - 0.02)]);
  p.add('powderBlack', rbox(W, 0.04, D, 0.008), [0, H - 0.02, 0]);
  // side panels with two seams each
  for (const s of [-1, 1]) {
    p.add('powderBlack', rbox(0.015, bodyH - 0.04, D - 0.06, 0.004, 1), [s * (W / 2 - 0.0085), pl + (bodyH - 0.04) / 2, 0]);
    for (const k of [-1, 1]) p.add('plasticBlack', box(0.003, bodyH - 0.08, 0.006), [s * (W / 2 + 0.0002), pl + (bodyH - 0.04) / 2, k * D / 6]);
  }
  // cable exit in the roof
  p.add('plasticBlack', rbox(0.2, 0.01, 0.1, 0.003, 1), [0.1, H + 0.004, -D / 4]);
  const faceH = bodyH - 0.14;
  for (const side of [1, -1]) {
    p.at([0, 0, side * D / 2], side < 0 ? [0, Math.PI, 0] : null, () => {
      // door border and the perforated panel inset in it
      const dh = bodyH - 0.06;
      for (const s of [-1, 1]) {
        p.add('powderBlack', rbox(0.03, dh, 0.02, 0.004, 1), [s * (W / 2 - 0.035), pl + 0.02 + dh / 2, -0.01]);
        p.add('powderBlack', rbox(W - 0.1, 0.03, 0.02, 0.004, 1), [0, pl + 0.02 + (s > 0 ? dh - 0.015 : 0.015), -0.01]);
      }
      p.add('perfBlack', box(W - 0.1, dh - 0.06, 0.002), [0, pl + 0.02 + dh / 2, -0.01]);
      p.add('chrome', rbox(0.02, 0.25, 0.02, 0.006, 1), [W / 2 - 0.09, 1.2, 0.012]);
      if (side > 0) {
        // the servers: faces from the atlas, a dark void behind
        p.add('serverFaces', card(W - 0.14, faceH, atlasRect('servers')), [0, pl + 0.05 + faceH / 2, -0.07]);
      } else {
        // the back: cable waterfalls and a blue-lit power strip
        p.add('plasticBlack', box(W - 0.12, faceH, 0.01), [0, pl + 0.05 + faceH / 2, -0.12]);
        for (let k = 0; k < 3; k++) {
          const x = -0.2 + k * 0.2;
          cableRun(p, [[x, H - 0.1, -0.1], [x + 0.02, H * 0.6, -0.08], [x - 0.01, 0.25, -0.09], [x, pl + 0.03, -0.14]], 3, 0.007, k + ctx.index);
        }
        p.add('plasticBlack', rbox(0.05, faceH - 0.1, 0.04, 0.005, 1), [W / 2 - 0.1, pl + 0.05 + faceH / 2, -0.09]);
      }
    });
  }
  // bundles up into the ceiling
  const ceil = ctx.ceiling;
  cableRun(p, [[0.06, H, -D / 4], [0.06, H + 0.2, -D / 4], [0.03, ceil - 0.05, -D / 4 - 0.02], [0.03, ceil + 0.05, -D / 4 - 0.02]], 3, 0.012, ctx.index);
  const leds = [];
  const colors = ['#37ff7c', '#37ff7c', '#37ff7c', '#ffb347', '#4fa3ff'];
  for (let i = 0; i < 18; i++) {
    leds.push({ at: [-0.22 + r() * 0.12 + (i % 3) * 0.19, pl + 0.12 + r() * (faceH - 0.14), D / 2 - 0.066], yaw: 0, c: colors[(r() * colors.length) | 0], speed: 2 + r() * 9, phase: r() * 10 });
  }
  for (let i = 0; i < 5; i++) leds.push({ at: [W / 2 - 0.1, pl + 0.2 + i * (faceH - 0.3) / 4, -D / 2 + 0.068], yaw: Math.PI, c: '#4fa3ff', speed: 0.3, phase: i });
  return { parts: p.parts, colliders: solidBox(f), leds, friction: 0.4 };
}

// ================================================================ fridge
// Side-by-side, brushed steel: two doors on a 4 mm seam, long bar handles,
// a water dispenser, a louvred kick grille, magnets and sticky notes.
function fridge(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const pl = 0.1, dd = 0.05;
  p.add('brushedSteel', rbox(W, H - pl, D - dd, 0.01), [0, pl + (H - pl) / 2, -dd / 2]);
  p.add('powderBlack', rbox(W - 0.02, pl, D - 0.08, 0.004, 1), [0, pl / 2, -0.03]);
  p.add('louvre', box(W - 0.1, 0.07, 0.01), [0, 0.05, D / 2 - 0.035]);
  p.add('plasticBlack', rbox(W, 0.03, D - dd, 0.006, 1), [0, H - 0.015, -dd / 2]);
  const dh = H - pl - 0.05;
  for (const s of [-1, 1]) {
    p.add('brushedSteel', rbox(W / 2 - 0.003, dh, dd, 0.008), [s * (W / 4 + 0.0015), pl + 0.01 + dh / 2, D / 2 - dd / 2]);
    barHandle(p, 'brushedSteel', s * 0.05, pl + 0.01 + dh * 0.55, D / 2, 0.9, true);
  }
  p.add('plasticBlack', box(0.004, dh, dd * 0.8), [0, pl + 0.01 + dh / 2, D / 2 - dd / 2]);
  // dispenser in the left door
  p.at([-W / 4 - 0.02, 1.2, D / 2 + 0.001], null, () => {
    p.add('plasticBlack', rbox(0.22, 0.32, 0.012, 0.01, 1), [0, 0, 0]);
    p.add('powderGrey', rbox(0.08, 0.12, 0.02, 0.006, 1), [0, 0.02, 0.012], [0.2, 0, 0]);
    p.add('ledBlue', box(0.06, 0.012, 0.002), [0, 0.13, 0.008]);
  });
  // the notes on the right door
  p.add('labels', card(0.34, 0.17, atlasRect('notes')), [W / 4 + 0.02, 1.34, D / 2 + 0.001]);
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// ================================================================ copier
// A floor-standing multifunction: two paper drawers on casters, the body
// with its output bay (where the paper blast comes from), a scanner with a
// document feeder, and a tilted touch panel that glows.
function copier(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const pl = 0.08;
  p.add('plasticBlack', rbox(W - 0.08, pl - 0.03, D - 0.08, 0.006, 1), [0, 0.03 + (pl - 0.03) / 2, 0]);
  for (const [sx, sz] of CORNERS) {
    p.add('rubber', cyl(0.028, 0.028, 0.022, 12), [sx * (W / 2 - 0.08), 0.028, sz * (D / 2 - 0.1)], [0, 0, Math.PI / 2]);
    p.add('chrome', rbox(0.04, 0.02, 0.04, 0.004, 1), [sx * (W / 2 - 0.08), 0.058, sz * (D / 2 - 0.1)]);
  }
  // base cabinet + two paper drawers
  p.add('plasticWhite', rbox(W, 0.55 - pl, D - 0.02, 0.012), [0, pl + (0.55 - pl) / 2, 0]);
  for (let i = 0; i < 2; i++) {
    const y = pl + 0.125 + i * 0.235;
    p.add('plasticWhite', rbox(W - 0.1, 0.22, 0.02, 0.006, 1), [0, y, D / 2]);
    p.add('plasticBlack', rbox(0.18, 0.03, 0.012, 0.006, 1), [0, y + 0.07, D / 2 + 0.008]);
    p.add('plasticBlack', rbox(0.03, 0.09, 0.006, 0.003, 1), [W / 2 - 0.12, y - 0.02, D / 2 + 0.01]);
    p.add('paper', box(0.012, 0.06 - i * 0.03, 0.004), [W / 2 - 0.12, y - 0.045 + (0.06 - i * 0.03) / 2 - 0.02, D / 2 + 0.012]);
  }
  // body, the front door panel, the output bay on +x
  p.add('plasticWhite', rbox(W, 0.45, D, 0.012), [0, 0.775, 0]);
  p.add('plasticGrey', rbox(W - 0.1, 0.3, 0.02, 0.008, 1), [0, 0.76, D / 2]);
  p.add('plasticBlack', box(0.01, 0.12, 0.7), [W / 2 + 0.001, 0.86, 0]);
  p.at([W / 2 + 0.1, 0.8, 0], [0, 0, -5 * DEG], () => {
    p.add('plasticGrey', rbox(0.22, 0.012, 0.5, 0.004, 1), [0, 0, 0]);
    for (let k = 0; k < 4; k++) p.add('paper', box(0.21, 0.003, 0.297), [0.01 + k * 0.004, 0.009 + k * 0.004, (k % 2) * 0.01 - 0.005], [0, (k - 1.5) * 2 * DEG, 0]);
  });
  p.add('louvre', box(0.004, 0.18, 0.32), [-W / 2 - 0.001, 0.36, -0.2]);
  p.add('plasticGrey', rbox(0.02, 0.18, 0.42, 0.006, 1), [-W / 2 - 0.012, 0.78, 0.05]);
  // scanner, lid, document feeder
  p.add('plasticWhite', rbox(W - 0.02, 0.12, D - 0.1, 0.01), [0, 1.06, -0.05]);
  p.add('plasticGrey', rbox(0.9, 0.05, 0.62, 0.012), [0, 1.145, -0.12]);
  p.at([0.05, 1.2, -0.12], [0, 0, 10 * DEG], () => {
    p.add('plasticGrey', rbox(0.42, 0.014, 0.32, 0.005, 1), [0, 0, 0]);
    for (let k = 0; k < 3; k++) p.add('paper', box(0.297, 0.003, 0.21), [0.02, 0.009 + k * 0.003, 0]);
  });
  // touch panel on an arm, front right
  p.add('plasticGrey', rbox(0.08, 0.05, 0.12, 0.01, 1), [W / 2 - 0.2, 1.05, D / 2 - 0.02]);
  p.at([W / 2 - 0.2, 1.1, D / 2 + 0.06], [-60 * DEG, 0, 0], () => {
    p.add('plasticBlack', rbox(0.32, 0.2, 0.025, 0.01, 1), [0, 0, 0]);
    p.add('labelsGlow', card(0.27, 0.16, atlasRect('copierUi')), [0, 0, 0.0132]);
  });
  p.add('ledGreen', box(0.012, 0.006, 0.004), [W / 2 - 0.06, 1.02, D / 2 - 0.045]);
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// ======================================================= vending machine
// A black cabinet with a backlit header, a glass window onto six shelves of
// spiral coils holding cans, a keypad column, and the pickup flap the can
// drops out of when a car rams it.
const CAN_COLORS = ['#d8263a', '#f1c40f', '#2ecc71', '#2f7fd8', '#f07a1a', '#e8e8e8'];
function vending(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const t = 0.04;
  const x0 = -W / 2 + t, x1 = x0 + 0.7, wy0 = 0.34, wy1 = 1.59;
  // the shell: back, sides, top, the front around the window
  p.add('powderBlack', rbox(W, H - 0.03, t, 0.008, 1), [0, 0.03 + (H - 0.03) / 2, -D / 2 + t / 2]);
  for (const s of [-1, 1]) p.add('powderBlack', rbox(t, H - 0.03, D, 0.01), [s * (W / 2 - t / 2), 0.03 + (H - 0.03) / 2, 0]);
  p.add('powderBlack', rbox(W, t, D, 0.01), [0, H - t / 2, 0]);
  p.add('powderBlack', rbox(W, H - wy1 - t, t, 0.008, 1), [0, wy1 + (H - wy1 - t) / 2, D / 2 - t / 2]);
  p.add('powderBlack', rbox(W, wy0 - 0.03, t, 0.008, 1), [0, 0.03 + (wy0 - 0.03) / 2, D / 2 - t / 2]);
  p.add('powderBlack', rbox(W / 2 - t - x1 + 0.04, wy1 - wy0, t, 0.006, 1), [(x1 + W / 2 - t) / 2 + 0.01, (wy0 + wy1) / 2, D / 2 - t / 2]);
  p.add('powderBlack', rbox(W - 0.02, 0.03, D - 0.1, 0.004, 1), [0, 0.015, 0]);
  p.add('labelsGlow', card(W - 0.06, 0.24, atlasRect('fizz')), [0, (wy1 + H) / 2, D / 2 + 0.001]);
  // inside: a backlit wall, shelves, coils and cans
  const cx = (x0 + x1) / 2;
  p.add('backlight', box(0.7, wy1 - wy0, 0.004), [cx, (wy0 + wy1) / 2, -D / 2 + t + 0.003]);
  const coil = [];
  for (let k = 0; k <= 20; k++) {
    const a = k / 20 * Math.PI * 2 * 2;
    coil.push([Math.cos(a) * 0.03, Math.sin(a) * 0.03 + 0.032, -0.08 + k / 20 * 0.2]);
  }
  const canGeo = lathe([[0, 0], [0.027, 0], [0.033, 0.01], [0.033, 0.1], [0.027, 0.112], [0, 0.115]], 10);
  for (let i = 0; i < 6; i++) {
    const y = wy0 + 0.02 + i * 0.205;
    p.add('powderGrey', rbox(0.68, 0.01, 0.5, 0.002, 1), [cx, y, D / 2 - t - 0.27]);
    p.add('paper', box(0.68, 0.018, 0.003), [cx, y - 0.004, D / 2 - t - 0.02]);
    for (let k = 0; k < 5; k++) {
      const x = x0 + 0.07 + k * 0.14;
      p.add('chrome', tube(coil, 0.0025, 3, true, 40), [x, y + 0.005, D / 2 - t - 0.2]);
      p.add('tint', canGeo, [x, y + 0.01, D / 2 - t - 0.09], null, null, CAN_COLORS[(i * 2 + k + ctx.index) % CAN_COLORS.length]);
    }
  }
  p.add('glassClear', box(0.7, wy1 - wy0, 0.004), [cx, (wy0 + wy1) / 2, D / 2 - 0.03]);
  // keypad column
  const kx = (x1 + W / 2 - t) / 2 + 0.01;
  p.add('labels', card(0.16, 0.24, atlasRect('keypad')), [kx, 1.18, D / 2 + 0.001]);
  p.add('chrome', rbox(0.06, 0.03, 0.01, 0.004, 1), [kx, 1.0, D / 2 + 0.004]);
  p.add('plasticBlack', rbox(0.1, 0.03, 0.01, 0.004, 1), [kx, 0.9, D / 2 + 0.004]);
  p.add('ledGreen', box(0.012, 0.012, 0.003), [kx + 0.06, 1.34, D / 2 + 0.002]);
  // the pickup flap, 5–20 cm up, tilted 10° in at the top
  p.add('plasticBlack', rbox(0.62, 0.17, 0.006, 0.004, 1), [cx, 0.13, D / 2 + 0.002]);
  p.add('powderGrey', rbox(0.58, 0.13, 0.006, 0.004, 1), [cx, 0.13, D / 2 + 0.008], [-10 * DEG, 0, 0]);
  p.add('plasticBlack', rbox(0.6, 0.02, 0.012, 0.004, 1), [cx, 0.215, D / 2 + 0.006]);
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// ============================================================ bookshelf
// An open walnut carcass, 85% full: books of seeded sizes and colours,
// every so often one leaning, a stack lying flat, a gap.
const BOOK_COLORS = ['#a33f3f', '#3f6ea3', '#3fa36a', '#a3823f', '#6a3fa3', '#2d3a4f', '#c9b48a', '#7a2f2f', '#1f5e5e', '#d8d0bf', '#4a4a4a', '#b5652b'];
// a unit book standing on y = 0, every face on the spine cell: the spine
// prints on the front, the page block tints the same (nobody reads a top)
let _book;
const book = () => _book || (_book = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const [u0, v0, u1, v1] = atlasRect('spines');
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
})());

function fillBooks(p, r, x0, x1, y, hMax, zFront) {
  let x = x0 + 0.005;
  let lean = 0;
  while (x < x1 - 0.02) {
    const roll = r();
    if (roll < 0.05) { x += 0.05 + r() * 0.1; continue; } // a gap
    if (roll < 0.1 && x < x1 - 0.3) {
      // a stack lying flat
      const n = 2 + ((r() * 4) | 0);
      let yy = y;
      const bw = 0.2 + r() * 0.08;
      for (let k = 0; k < n; k++) {
        const t = 0.025 + r() * 0.025;
        // turned onto its side: the unit book's height now runs along −x
        p.add('books', book(), [x + bw + (r() - 0.5) * 0.02, yy + t / 2, zFront - 0.1], [0, (r() - 0.5) * 0.2, Math.PI / 2], [t, bw, 0.15 + r() * 0.06], BOOK_COLORS[(r() * BOOK_COLORS.length) | 0]);
        yy += t;
      }
      x += bw + 0.02;
      continue;
    }
    const t = 0.02 + r() * 0.03;
    const h = Math.min(hMax - 0.015, 0.2 + r() * 0.12);
    const d = 0.15 + r() * 0.09;
    const c = BOOK_COLORS[(r() * BOOK_COLORS.length) | 0];
    if (++lean % 6 === 0 && x < x1 - 0.15) {
      // leaning 12° on its neighbour
      p.add('books', book(), [x + h * Math.sin(12 * DEG) + t / 2, y, zFront - d / 2], [0, 0, 12 * DEG], [t, h, d], c);
      x += t / Math.cos(12 * DEG) + h * Math.sin(12 * DEG);
    } else {
      p.add('books', book(), [x + t / 2, y, zFront - d / 2], null, [t, h, d], c);
      x += t + 0.001;
    }
  }
}

function bookshelf(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const r = rng(ctx.seed);
  const s = 0.025;
  for (const k of [-1, 1]) p.add('veneerWalnut', rbox(s, H, D, 0.005), [k * (W / 2 - s / 2), H / 2, 0]);
  p.add('veneerWalnut', rbox(W, s, D, 0.005), [0, H - s / 2, 0]);
  p.add('veneerWalnut', box(W - 2 * s, H - 0.08, 0.008), [0, 0.08 + (H - 0.08) / 2, -D / 2 + 0.004]);
  p.add('plasticBlack', box(W - 2 * s, 0.08, D - 0.04), [0, 0.04, -0.02]);
  const shelves = [0.08, 0.5, 0.92, 1.34, 1.76, H - s];
  const mid = W > 1.6;
  if (mid) p.add('veneerWalnut', rbox(0.02, H - 0.08 - s, D - 0.02, 0.004, 1), [0, 0.08 + (H - 0.08 - s) / 2, -0.01]);
  for (let i = 0; i < shelves.length - 1; i++) {
    const y = shelves[i];
    p.add('veneerWalnut', rbox(W - 2 * s, 0.02, D - 0.015, 0.004, 1), [0, y + 0.01, 0.0075]);
    const hMax = shelves[i + 1] - y - 0.02;
    const bays = mid ? [[-W / 2 + s, -0.01], [0.01, W / 2 - s]] : [[-W / 2 + s, W / 2 - s]];
    for (const [a, b] of bays) fillBooks(p, r, a, b, y + 0.02, hMax, D / 2 - 0.025);
  }
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// ======================================================= boltless shelving
// Slotted grey uprights at most 1.2 m apart, chipboard decks every 40 cm on
// orange beams, and whatever the room keeps on them: bulk boxes in storage,
// binders and archive boxes in the archive, reams by the printers.
const BINDER_COLORS = ['#2f5fa8', '#c0392b', '#27ae60', '#2d2d2d', '#8e44ad', '#f39c12', '#16a085', '#7f8c8d'];
function shelfContents(p, r, kind, x0, x1, y, hMax, S) {
  let x = x0 + 0.02;
  const put = (w) => { const c = x + w / 2; x += w + 0.015 + r() * 0.03; return c; };
  while (x < x1 - 0.1) {
    if (r() < (kind === 'binders' ? 0.08 : 0.15)) { x += 0.1 + r() * 0.25; continue; }
    const pick = kind === 'mixed' ? ['boxes', 'binders', 'reams'][(r() * 3) | 0] : kind;
    if (pick === 'reams') {
      const w = 0.3;
      if (x + w > x1) break;
      const cx = put(w);
      const n = 2 + ((r() * Math.min(5, hMax / 0.057 - 1)) | 0);
      const c = ['#2f7fd8', '#d8263a', '#f1c40f', '#27ae60'][(r() * 4) | 0];
      for (let k = 0; k < n; k++) {
        p.add('paper', box(0.297, 0.055, 0.21), [cx + (r() - 0.5) * 0.01, y + 0.028 + k * 0.056, (r() - 0.5) * 0.02], [0, (r() - 0.5) * 0.05, 0]);
        p.add('tint', box(0.3, 0.057, 0.06), [cx, y + 0.028 + k * 0.056, 0.0], null, null, c);
      }
    } else if (pick === 'binders') {
      let n = 3 + ((r() * 8) | 0);
      while (n-- > 0 && x < x1 - 0.1) {
        const w = 0.05 + (r() < 0.5 ? 0.03 : 0);
        const h = Math.min(hMax - 0.01, 0.315);
        const cx = x + w / 2;
        x += w + 0.002;
        const c = BINDER_COLORS[(r() * BINDER_COLORS.length) | 0];
        p.add('tint', box(w, h, 0.285), [cx, y + h / 2, 0], null, null, c);
        p.add('paper', box(w * 0.7, 0.12, 0.002), [cx, y + h * 0.62, 0.1435]);
        p.add('plasticBlack', box(0.022, 0.022, 0.003), [cx, y + h * 0.2, 0.1435]);
      }
      x += 0.02;
    } else {
      // a cardboard box: archive boxes are small and labelled, bulk ones big
      const arch = kind === 'binders' || r() < 0.3;
      const w = arch ? 0.33 : 0.3 + r() * 0.22;
      if (x + w > x1) break;
      const h = Math.min(hMax - 0.02, arch ? 0.26 : 0.2 + r() * 0.14);
      const d = Math.min(S - 0.05, arch ? 0.4 : 0.3 + r() * 0.12);
      const cx = put(w);
      const yaw = (r() - 0.5) * 0.12;
      p.at([cx, y, (r() - 0.5) * 0.04], [0, yaw, 0], () => {
        p.add('cardboard', box(w, h, d), [0, h / 2, 0]);
        p.add('tint', box(w + 0.002, 0.004, 0.05), [0, h, 0], null, null, '#a88452');
        p.add('paper', box(0.12, 0.07, 0.002), [arch ? -w * 0.18 : 0, h * 0.6, d / 2 + 0.001]);
        if (arch) p.add('plasticBlack', box(0.08, 0.025, 0.002), [w * 0.22, h * 0.7, d / 2 + 0.001]);
      });
    }
  }
}

function shelfrack(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const r = rng(ctx.seed);
  const long = W >= D;
  const L = long ? W : D, S = long ? D : W;
  const kind = { storage: 'boxes', archive: 'binders', printer: 'reams', loading: 'boxes' }[ctx.room] || 'mixed';
  p.at([0, 0, 0], long ? null : [0, Math.PI / 2, 0], () => {
    const n = Math.ceil((L - 0.04) / 1.2) + 1;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.02 + i * (L - 0.04) / (n - 1);
      for (const s of [-1, 1]) {
        p.add('slotGrey', box(0.04, H, 0.04), [x, H / 2, s * (S / 2 - 0.02)]);
        p.add('plasticBlack', box(0.05, 0.008, 0.05), [x, 0.004, s * (S / 2 - 0.02)]);
      }
    }
    const levels = [];
    for (let y = 0.1; y <= H - 0.05; y += 0.4) levels.push(y);
    levels.forEach((y, li) => {
      p.add('mdf', box(L - 0.04, 0.015, S - 0.04), [0, y, 0]);
      for (const s of [-1, 1]) p.add('powderOrange', rbox(L - 0.04, 0.04, 0.02, 0.004, 1), [0, y - 0.012, s * (S / 2 - 0.02)]);
      for (const e of [-1, 1]) p.add('powderOrange', rbox(0.02, 0.04, S - 0.06, 0.004, 1), [e * (L / 2 - 0.02), y - 0.012, 0]);
      const hMax = li < levels.length - 1 ? levels[li + 1] - y - 0.03 : 0.34;
      shelfContents(p, r, li === 0 && kind === 'mixed' ? 'boxes' : kind, -L / 2 + 0.04, L / 2 - 0.04, y + 0.0075, hMax, S);
    });
  });
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// ============================================================ whiteboard
// A mobile board: H-frame on casters, aluminium-framed board from 0.75 to
// 1.95 m, a marker tray. Cars drive under the board, between its feet.
function whiteboard(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const bw = W - 0.1, bh = 1.2, by = H - 0.6;
  const ux = bw / 2 + 0.035;
  p.add('plasticWhite', rbox(bw, bh, 0.02, 0.006, 1), [0, by, 0]);
  p.add('whiteboard', card(bw - 0.04, bh - 0.04, atlasRect('scribble')), [0, by, 0.0105]);
  for (const s of [-1, 1]) {
    p.add('brushedSteel', rbox(bw + 0.02, 0.022, 0.028, 0.004, 1), [0, by + s * (bh / 2), 0]);
    p.add('brushedSteel', rbox(0.022, bh, 0.028, 0.004, 1), [s * (bw / 2), by, 0]);
    // the H-frame: uprights, feet on casters, pivot knobs
    p.add('powderGrey', rbox(0.035, H - 0.06, 0.035, 0.004, 1), [s * ux, 0.06 + (H - 0.06) / 2, 0]);
    p.add('powderGrey', rbox(0.04, 0.03, D, 0.006, 1), [s * ux, 0.06, 0]);
    p.add('plasticBlack', cyl(0.025, 0.025, 0.03, 12), [s * (ux - 0.03), by, 0], [0, 0, Math.PI / 2]);
    for (const z of [-1, 1]) {
      p.add('rubber', cyl(0.025, 0.025, 0.02, 12), [s * ux, 0.025, z * (D / 2 - 0.04)], [0, 0, Math.PI / 2]);
      p.add('chrome', rbox(0.03, 0.02, 0.03, 0.004, 1), [s * ux, 0.045, z * (D / 2 - 0.04)]);
    }
  }
  p.add('powderGrey', rbox(2 * ux, 0.03, 0.03, 0.006, 1), [0, 0.3, 0]);
  // marker tray, three markers and an eraser
  p.add('brushedSteel', rbox(1.0, 0.02, 0.06, 0.004, 1), [0, by - bh / 2 - 0.02, 0.035]);
  ['#1f4fbf', '#c92a2a', '#2b8a3e'].forEach((c, i) => {
    p.add('tint', cyl(0.009, 0.009, 0.13, 8), [-0.3 + i * 0.1, by - bh / 2 - 0.001, 0.04], [0, 0.1 * i, Math.PI / 2], null, c);
  });
  p.add('plasticBlack', rbox(0.12, 0.025, 0.05, 0.006, 1), [0.3, by - bh / 2 + 0.003, 0.035]);
  return {
    parts: p.parts,
    colliders: [
      cuboid((bw / 2 + 0.02) * M, (bh / 2) * M, 0.02 * M, 0, by * M, 0),
      ...[-1, 1].map((s) => cuboid(0.02 * M, (H / 2) * M, 0.02 * M, s * ux * M, (H / 2) * M, 0)),
      ...[-1, 1].map((s) => cuboid(0.025 * M, 0.04 * M, (D / 2) * M, s * ux * M, 0.04 * M, 0)),
    ],
    friction: 0.6,
  };
}

// ================================================================== decor
// Rugs: a 4 mm pile (its top stays under the wheels' 0.018 u) with a bound
// edge; the pattern is a cell of the rug atlas, one material for them all.
function rug(f, ctx) {
  const [W, D] = dims(f);
  const p = new Piece();
  const pal = ctx.seed % 4;
  p.add('rugs', card(W, D, atlasCell(pal)), [0, 0.0041, 0], [-Math.PI / 2, 0, 0]);
  p.add('fabric:#2b2622', rbox(W + 0.012, 0.0035, D + 0.012, 0.0015, 1), [0, 0.0018, 0]);
  return { parts: p.parts, colliders: [] };
}

// Art: a mitred frame (black, oak or gilt, by seed) round a white mat and a
// print from the art atlas; hung flat on the wall.
const FRAMES = ['plasticBlack', 'veneerOak', 'brass', 'veneerWalnut'];
function art(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const cy = 7.2 / M;
  const zb = -D / 2 - ctx.snap;
  const fr = FRAMES[ctx.seed % FRAMES.length];
  p.at([0, cy, zb], null, () => {
    for (const s of [-1, 1]) {
      p.add(fr, rbox(W, 0.045, 0.03, 0.006, 1), [0, s * (H / 2 - 0.0225), 0.015]);
      p.add(fr, rbox(0.045, H - 0.09, 0.03, 0.006, 1), [s * (W / 2 - 0.0225), 0, 0.015]);
    }
    p.add('paper', box(W - 0.08, H - 0.08, 0.006), [0, 0, 0.006]);
    p.add('art', card(W - 0.22, H - 0.22, atlasCell((ctx.seed >> 2) % 4)), [0, 0, 0.0095]);
  });
  return { parts: p.parts, colliders: [] };
}

// A wall-mounted screen showing the roadmap, on a bracket, its cable in a
// white duct down to a floor box.
function tv(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const cy = 6.8 / M;
  const zb = -D / 2 - ctx.snap;
  p.at([0, 0, zb], null, () => {
    p.add('plasticBlack', rbox(0.3, 0.3, 0.04, 0.006, 1), [0, cy, 0.02]);
    p.add('plasticBlack', rbox(W * 0.7, H * 0.6, 0.04, 0.02), [0, cy, 0.06]);
    p.add('plasticBlack', rbox(W, H, 0.012, 0.004, 1), [0, cy, 0.086]);
    p.add('labelsGlow', card(W - 0.02, H - 0.02, atlasRect('roadmap')), [0, cy, 0.0925]);
    const low = cy - H * 0.3;
    p.add('plasticWhite', rbox(0.05, low - 0.1, 0.02, 0.004, 1), [W * 0.25, 0.1 + (low - 0.1) / 2, 0.01]);
    p.add('plasticWhite', rbox(0.28, 0.08, 0.08, 0.008, 1), [W * 0.25, 0.04, 0.04]);
  });
  return { parts: p.parts, colliders: [] };
}

// =============================================================== booths
// Felt focus pods: 5 cm acoustic walls, a roof with a strip light under it,
// an upholstered floor pad (the collider was always one), a wall table.
function booth(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const t = 0.05, pl = 0.05;
  p.add('plasticBlack', rbox(W - 0.02, pl, D - 0.02, 0.006, 1), [0, pl / 2, 0]);
  p.add('feltTeal', rbox(W, H - pl - t, t, 0.012), [0, pl + (H - pl - t) / 2, -D / 2 + t / 2]);
  for (const s of [-1, 1]) {
    p.add('feltTeal', rbox(t, H - pl - t, D, 0.012), [s * (W / 2 - t / 2), pl + (H - pl - t) / 2, 0]);
    p.add('powderWhite', rbox(t + 0.006, H - pl, 0.02, 0.004, 1), [s * (W / 2 - t / 2), pl + (H - pl) / 2, D / 2 - 0.01]);
  }
  p.add('powderWhite', rbox(W, t, D, 0.01), [0, H - t / 2, 0]);
  p.add('lampStrip', box(0.6, 0.012, 0.03), [0, H - t - 0.007, -D / 2 + 0.3]);
  // grooves on the outside of the back wall
  for (let k = -3; k <= 3; k++) p.add('fabric:#2f6360', box(0.012, H - pl - t - 0.1, 0.004), [k * 0.2, pl + (H - pl - t) / 2, -D / 2 - 0.001]);
  // the pad (0.135 m, as its collider), back cushions, a wall table
  const padH = 0.6 / M;
  p.add('fabric:#5b8bd6', rbox(W - 2 * t - 0.01, padH, D - t - 0.08, 0.04), [0, padH / 2, -0.035]);
  for (const s of [-1, 1]) p.add('fabric:#e0b04a', rbox(0.5, 0.36, 0.12, 0.05), [s * 0.3, padH + 0.2, -D / 2 + t + 0.1], [-12 * DEG, 0, 0]);
  p.add('laminateWhite', rbox(0.5, 0.02, 0.3, 0.004, 1), [W / 2 - t - 0.26, 0.72, -D / 2 + t + 0.15]);
  p.add('powderWhite', rbox(0.02, 0.1, 0.25, 0.004, 1), [W / 2 - t - 0.02, 0.66, -D / 2 + t + 0.14]);
  return {
    parts: p.parts,
    colliders: [
      cuboid(f.w / 2, f.h / 2, 0.09, 0, f.h / 2, -f.d / 2 + 0.09),
      ...[-1, 1].map((s) => cuboid(0.09, f.h / 2, f.d / 2, s * (f.w / 2 - 0.09), f.h / 2, 0)),
      cuboid(f.w / 2 - 0.18, 0.3, f.d / 2 - 0.25, 0, 0.3, -0.12),
    ],
    friction: 0.8,
  };
}

// ============================================================= bathroom
// Stall partitions: phenolic panels on chrome feet, lifted 15 cm — so the
// cars (and the collider) go under them.
function stall(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const lift = 0.15;
  const long = D >= W;
  const L = long ? D : W;
  p.at([0, 0, 0], long ? null : [0, Math.PI / 2, 0], () => {
    p.add('melamineGrey', rbox(0.025, H - lift, L, 0.006), [0, lift + (H - lift) / 2, 0]);
    p.add('chrome', cyl(0.02, 0.02, lift, 12), [0, lift / 2, L / 2 - 0.1]);
    p.add('chrome', cyl(0.035, 0.035, 0.008, 16), [0, 0.004, L / 2 - 0.1]);
    p.add('chrome', rbox(0.04, 0.05, 0.04, 0.006, 1), [0, lift + 0.02, L / 2 - 0.1]);
    for (const y of [0.35, H - 0.2]) p.add('chrome', rbox(0.035, 0.04, 0.03, 0.004, 1), [0, y, -L / 2 + 0.015]);
    p.add('chrome', tube([[0, H + 0.02, -L / 2], [0, H + 0.02, L / 2]], 0.013, 10, false), [0, 0, 0]);
    // a roll holder on the +x face
    p.add('chrome', rbox(0.03, 0.06, 0.1, 0.006, 1), [0.03, 0.7, 0]);
    p.add('paper', cyl(0.055, 0.055, 0.1, 16), [0.075, 0.68, 0], [Math.PI / 2, 0, 0]);
  });
  return {
    parts: p.parts,
    colliders: [cuboid(f.w / 2, (f.h - lift * M) / 2, f.d / 2, 0, lift * M + (f.h - lift * M) / 2, 0)],
    friction: 0.8,
  };
}

// The vanity: a stone top with two basins, wall-hung, the traps showing
// underneath, a mirror on the wall. Cars drive under it (its collider is
// the top, as a desk's is).
function sink(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const T = 0.03;
  const bx = [-W / 4, W / 4];
  const bz = 0.04;
  const outline = shape([[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]);
  for (const x of bx) {
    const hole = new THREE.Path();
    hole.absellipse(x, bz, 0.225, 0.175, 0, Math.PI * 2, true);
    outline.holes.push(hole);
  }
  p.add('stoneTop', extrude(`vanity${W}x${D}`, outline, T, 0.004), [0, H - T / 2, 0], [Math.PI / 2, 0, 0]);
  p.add('stoneTop', rbox(W, 0.09, 0.03, 0.006, 1), [0, H - 0.075, D / 2 - 0.015]);
  const zWall = -D / 2 - ctx.snap;
  // the bowl: a ceramic lathe under each hole, oval
  // rim first, so the lathe's faces look up and in (the side you see)
  const bowl = lathe([[0.2, 0.0], [0.2, -0.01], [0.185, -0.07], [0.14, -0.13], [0.07, -0.158], [0, -0.16]], 24);
  for (const x of bx) {
    p.add('ceramic', bowl, [x, H - T, bz], null, [1.125, 1, 0.875]);
    p.add('chrome', cyl(0.022, 0.022, 0.004, 12), [x, H - T - 0.158, bz]);
    // tap: a chrome gooseneck with a lever
    p.at([x, H, -D / 2 + 0.09], null, () => {
      p.add('chrome', cyl(0.022, 0.026, 0.02, 12), [0, 0.01, 0]);
      p.add('chrome', tube([[0, 0.01, 0], [0, 0.2, 0], [0, 0.28, 0.06], [0, 0.26, 0.14], [0, 0.2, 0.16]], 0.011, 8), [0, 0, 0]);
      p.add('chrome', rbox(0.012, 0.012, 0.08, 0.005, 1), [0.035, 0.1, -0.01], [0.5, 0, 0]);
    });
    // trap: down, a U, back into the wall
    p.add('chrome', tube([[x, H - T - 0.16, bz], [x, 0.5, bz], [x, 0.42, bz - 0.05], [x, 0.47, bz - 0.13], [x, 0.49, zWall + 0.1], [x, 0.49, zWall]], 0.018, 8), [0, 0, 0]);
  }
  p.add('stoneTop', rbox(W - 0.2, 0.02, 0.28, 0.004, 1), [0, 0.28, zWall + 0.14]);
  for (const s of [-1, 1]) p.add('chrome', rbox(0.02, 0.04, 0.2, 0.004, 1), [s * (W / 2 - 0.2), 0.26, zWall + 0.1]);
  // mirror and soap on the wall
  p.add('mirror', box(W - 0.2, 0.9, 0.006), [0, H + 0.7, zWall + 0.004]);
  p.add('brushedSteel', rbox(W - 0.18, 0.02, 0.02, 0.004, 1), [0, H + 0.25 - 0.01, zWall + 0.01]);
  for (const x of [0, -W / 2 + 0.12]) {
    p.add('plasticWhite', rbox(0.09, 0.15, 0.07, 0.012, 1), [x, H + 0.22 + 0.075 + 0.15, zWall + 0.035]);
    p.add('labels', card(0.07, 0.07, atlasRect('wash')), [x, H + 0.22 + 0.09 + 0.15, zWall + 0.0705]);
  }
  return {
    parts: p.parts,
    colliders: [cuboid(f.w / 2, 0.06 * M, f.d / 2, 0, f.h - 0.06 * M, 0)],
    friction: 0.8,
  };
}

// The toilet: a real one (lathe bowl, torus seat, open lid, a proper tank,
// a supply pipe with a stop valve) stretched to the comic footprint.
function toilet(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  p.at([0, 0, 0], null, () => {
    const bowl = lathe([[0.1, 0], [0.12, 0.02], [0.13, 0.15], [0.17, 0.3], [0.19, 0.38], [0.185, 0.4], [0.15, 0.4], [0.12, 0.35], [0.06, 0.28], [0, 0.27]], 24);
    p.add('ceramic', bowl, [0, 0, 0.1], null, [1, 1, 1.3]);
    p.add('plasticWhite', torus(0.155, 0.024, 8, 28), [0, 0.415, 0.11], [Math.PI / 2, 0, 0], [1, 1.3, 1]);
    p.add('plasticWhite', cyl(0.19, 0.19, 0.02, 28), [0, 0.63, -0.14], [-1.4, 0, 0], [1, 1, 1.25]);
    p.add('ceramic', rbox(0.42, 0.38, 0.18, 0.03), [0, 0.59, -0.26]);
    p.add('ceramic', rbox(0.44, 0.03, 0.2, 0.012, 1), [0, 0.795, -0.26]);
    p.add('chrome', rbox(0.07, 0.014, 0.014, 0.005, 1), [-0.15, 0.73, -0.165]);
    p.add('chrome', tube([[-0.16, 0.4, -0.27], [-0.18, 0.22, -0.27], [-0.18, 0.2, -0.36], [-0.18, 0.2, -0.4]], 0.007, 6, false), [0, 0, 0]);
    p.add('chrome', cyl(0.018, 0.018, 0.05, 10), [-0.18, 0.2, -0.33], [Math.PI / 2, 0, 0]);
    p.add('chrome', rbox(0.04, 0.012, 0.012, 0.004, 1), [-0.18, 0.225, -0.33]);
  }, [W / 0.5, H / 0.82, D / 0.78]);
  return { parts: p.parts, colliders: [cuboid(f.w / 2, f.h / 2, f.d / 2, 0, f.h / 2, -0.05)] };
}

// ============================================================ games etc
function bartop(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const long = W >= D;
  const L = long ? W : D, S = long ? D : W;
  const cx = L / 2 - 0.25 / M;
  p.at([0, 0, 0], long ? null : [0, Math.PI / 2, 0], () => {
    p.add('veneerOak', rbox(L, 0.04, S, 0.01), [0, H - 0.02, 0]);
    p.add('powderBlack', rbox(L - 0.3, 0.06, 0.04, 0.006, 1), [0, H - 0.07, 0]);
    for (const s of [-1, 1]) {
      p.add('brushedSteel', cyl(0.035, 0.035, H - 0.055, 16), [s * cx, (H - 0.04) / 2, 0]);
      p.add('brushedSteel', cyl(0.14, 0.15, 0.015, 32), [s * cx, 0.0075, 0]);
      p.add('powderBlack', rbox(0.2, 0.02, S - 0.1, 0.004, 1), [s * cx, H - 0.05, 0]);
      p.add('brushedSteel', tube([[s * cx, 0.25, 0.03], [s * cx, 0.25, S / 2 - 0.06]], 0.01, 8, false), [0, 0, 0]);
    }
    p.add('brushedSteel', tube([[-cx - 0.06, 0.25, S / 2 - 0.06], [cx + 0.06, 0.25, S / 2 - 0.06]], 0.015, 10, false), [0, 0, 0]);
  });
  const long2 = f.w >= f.d, lu = Math.max(f.w, f.d);
  return {
    parts: p.parts,
    colliders: [
      cuboid(f.w / 2, 0.07, f.d / 2, 0, f.h - 0.07, 0),
      ...[-1, 1].map((s) => cuboid(0.07, (f.h - 0.14) / 2, 0.07, long2 ? s * (lu / 2 - 0.25) : 0, (f.h - 0.14) / 2, long2 ? 0 : s * (lu / 2 - 0.25))),
    ],
    friction: 1,
  };
}

// Foosball: a proper table — 8 rods, 26 men, a felt pitch sunk 7 cm below
// the rim, goals in the ends, legs with braces. The collider stays the flat
// top (cars drive the rim and over the men).
function foosball(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const rim = H, pitch = H - 0.07;
  const wood = 'veneerWalnut';
  for (const s of [-1, 1]) {
    p.add(wood, rbox(W, 0.2, 0.04, 0.008), [0, rim - 0.1, s * (D / 2 - 0.02)]);
    p.add(wood, rbox(0.04, 0.2, D - 0.08, 0.008), [s * (W / 2 - 0.02), rim - 0.1, 0]);
    p.add('plasticBlack', box(0.004, 0.08, 0.2), [s * (W / 2 - 0.042), pitch + 0.04, 0]);
  }
  p.add(wood, rbox(W - 0.08, 0.13, D - 0.08, 0.006, 1), [0, rim - 0.2 + 0.065, 0]);
  p.add('labels', card(W - 0.08, D - 0.08, atlasRect('pitch')), [0, pitch + 0.001, 0], [-Math.PI / 2, 0, 0]);
  const lx = W / 2 - 0.05, lz = D / 2 - 0.05;
  for (const [sx, sz] of CORNERS) {
    p.add('laminateCharcoal', rbox(0.07, rim - 0.2, 0.07, 0.008, 1), [sx * lx, (rim - 0.2) / 2, sz * lz]);
    p.add('plasticBlack', cyl(0.03, 0.03, 0.02, 12), [sx * lx, 0.01, sz * lz]);
  }
  for (const s of [-1, 1]) p.add('laminateCharcoal', rbox(2 * lx, 0.05, 0.03, 0.006, 1), [0, 0.32, s * lz]);
  // rods: along the depth, sticking out through the sides, grips alternate
  const counts = [1, 2, 3, 5, 5, 3, 2, 1];
  const team = [0, 0, 1, 0, 1, 0, 1, 1];
  const ry = rim - 0.035;
  const man = [];
  for (let i = 0; i < 8; i++) {
    const x = (-0.5 + (i + 0.5) / 8) * (W - 0.1);
    const side = team[i] ? 1 : -1;
    p.add('chrome', cyl(0.008, 0.008, D + 0.3, 8), [x, ry, side * 0.05], [Math.PI / 2, 0, 0]);
    p.add('plasticBlack', cyl(0.018, 0.018, 0.1, 10), [x, ry, side * (D / 2 + 0.17)], [Math.PI / 2, 0, 0]);
    const n = counts[i];
    const span = D - 0.14;
    for (let k = 0; k < n; k++) {
      const z = n === 1 ? 0 : -span / 2 + (k + 0.5) * span / n;
      man.push([x, z, team[i] ? '#2f7fd8' : '#d8263a']);
    }
  }
  for (const [x, z, c] of man) {
    p.add('tint', sphere(0.012, 8, 6), [x, ry + 0.022, z], null, null, '#f0d2b0');
    p.add('tint', box(0.02, 0.035, 0.03), [x, ry, z], null, null, c);
    p.add('tint', box(0.014, 0.03, 0.022), [x, ry - 0.03, z], null, null, '#1d1f24');
  }
  p.add('plasticWhite', sphere(0.017, 10, 8), [0.05, pitch + 0.017, 0.08]);
  return {
    parts: p.parts,
    colliders: [
      cuboid(f.w / 2, f.h * 0.25, f.d / 2, 0, f.h * 0.75, 0),
      ...CORNERS.map(([sx, sz]) => cuboid(0.09, f.h * 0.25, 0.09, sx * (f.w / 2 - 0.2), f.h * 0.25, sz * (f.d / 2 - 0.2))),
    ],
    friction: 0.9,
  };
}

// The mini hoop: a glass backboard with a shooter square, an orange ring
// big enough for the basketball (inner r 0.2 m), a net, a padded pole.
function hoop(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const pz = -0.2 / M;
  const by = H * 0.82;
  p.add('powderBlack', rbox(0.08, H - 0.3, 0.08, 0.008), [0, 0.3 + (H - 0.3) / 2, pz]);
  p.add('fabric:#1f3a64', rbox(0.4, 0.3, 0.3, 0.05), [0, 0.15, pz]);
  p.add('powderBlack', rbox(0.06, 0.06, 0.08, 0.006, 1), [0, by, pz + 0.07]);
  p.add('glassClear', box(0.9, 0.6, 0.012), [0, by, 0.12]);
  for (const s of [-1, 1]) {
    p.add('plasticWhite', box(0.9, 0.03, 0.016), [0, by + s * 0.285, 0.12]);
    p.add('plasticWhite', box(0.03, 0.6, 0.016), [s * 0.435, by, 0.12]);
    p.add('tint', box(0.3, 0.018, 0.014), [0, by - 0.15 + (s > 0 ? 0.2 : 0), 0.125], null, null, '#e8332a');
    p.add('tint', box(0.018, 0.2, 0.014), [s * 0.15, by - 0.05, 0.125], null, null, '#e8332a');
  }
  const ry = by - 0.15, rz = 0.12 + 0.05 + 0.21;
  p.add('powderOrange', torus(0.21, 0.01, 8, 32), [0, ry, rz], [Math.PI / 2, 0, 0]);
  p.add('powderOrange', rbox(0.12, 0.012, 0.07, 0.004, 1), [0, ry, 0.15]);
  // the net: strands criss-crossing down to a narrower ring
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    for (const d of [-1, 1]) {
      const b = a + d * Math.PI / 12;
      p.add('paper', tube([[Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [Math.cos(b) * 0.13, -0.32, Math.sin(b) * 0.13]], 0.003, 3, false), [0, ry, rz]);
    }
  }
  p.add('paper', torus(0.13, 0.004, 4, 20), [0, ry - 0.32, rz], [Math.PI / 2, 0, 0]);
  return {
    parts: p.parts,
    colliders: [
      cuboid(0.09, f.h / 2, 0.09, 0, f.h / 2, -0.2),
      cuboid(0.45 * M, 0.3 * M, 0.06, 0, f.h * 0.82, 0.12 * M),
    ],
  };
}

// Park bench: five teak slats on two black cast-iron ends with armrests.
function bench(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const long = D >= W;
  const L = long ? D : W, S = long ? W : D;
  p.at([0, 0, 0], long ? [0, Math.PI / 2, 0] : null, () => {
    for (let i = 0; i < 5; i++) p.add('teak', rbox(L, 0.035, 0.09, 0.008), [0, H - 0.0175, -0.22 + i * 0.11]);
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - 0.15 / M);
      p.at([x, 0, 0], null, () => {
        for (const z of [-1, 1]) p.add('powderBlack', rbox(0.04, H - 0.035, 0.05, 0.008, 1), [0, (H - 0.035) / 2, z * (S / 2 - 0.08)], [z * 8 * DEG, 0, 0]);
        p.add('powderBlack', rbox(0.045, 0.045, S - 0.04, 0.008, 1), [0, H - 0.06, 0]);
        p.add('powderBlack', rbox(0.04, 0.03, S - 0.12, 0.006, 1), [0, 0.12, 0]);
        p.add('powderBlack', tube([[0, H - 0.04, S / 2 - 0.08], [0, 0.64, S / 2 - 0.13], [0, 0.66, 0], [0, 0.64, -S / 2 + 0.13], [0, H - 0.04, -S / 2 + 0.08]], 0.016, 8), [0, 0, 0]);
      });
    }
  });
  return {
    parts: p.parts,
    colliders: [
      cuboid(f.w / 2, 0.06, f.d / 2, 0, f.h, 0),
      ...[-1, 1].map((s) => cuboid(f.w / 2 - 0.05, f.h / 2, 0.06, 0, f.h / 2, s * (f.d / 2 - 0.15))),
    ],
    friction: 1,
  };
}

// A corten planter with a rolled lip: boxwood balls and grass clumps.
const GREENS = ['#3e7a3a', '#2f6b35', '#4c8a3f', '#5a8f3a'];
function planter(f, ctx) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  const r = rng(ctx.seed);
  const long = D >= W;
  const L = long ? D : W, S = long ? W : D;
  p.at([0, 0, 0], long ? [0, Math.PI / 2, 0] : null, () => {
    for (const s of [-1, 1]) {
      p.add('corten', rbox(L, H, 0.02, 0.004, 1), [0, H / 2, s * (S / 2 - 0.01)]);
      p.add('corten', rbox(0.02, H, S, 0.004, 1), [s * (L / 2 - 0.01), H / 2, 0]);
      p.add('corten', rbox(L + 0.01, 0.03, 0.035, 0.012, 1), [0, H - 0.01, s * (S / 2 - 0.012)]);
      p.add('corten', rbox(0.035, 0.03, S + 0.01, 0.012, 1), [s * (L / 2 - 0.012), H - 0.01, 0]);
    }
    p.add('soil', box(L - 0.04, 0.01, S - 0.04), [0, H - 0.05, 0]);
    const n = Math.max(2, Math.round(L / 0.55));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * L / n;
      const green = GREENS[(r() * GREENS.length) | 0];
      if (i % 2 === 0) {
        const rr = 0.2 + r() * 0.08;
        p.add('foliage', bush(rr, 1, (ctx.seed + i) % 7), [x, H - 0.05 + rr * 0.8, (r() - 0.5) * 0.06], [0, r() * 3, 0], null, green);
      } else {
        for (let b = 0; b < 16; b++) {
          const a = b / 16 * Math.PI * 2 + r();
          const lean = 0.15 + r() * 0.35;
          const h = 0.35 + r() * 0.3;
          p.add('foliage', cyl(0.001, 0.009, h, 3), [x + Math.cos(a) * 0.03, H - 0.05 + h / 2 * Math.cos(lean), Math.sin(a) * 0.03], [Math.sin(a) * lean, 0, -Math.cos(a) * lean], null, b % 3 ? '#8fa84a' : '#b8b25a');
        }
      }
    }
  });
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

// Anything else (a theme's box-shaped type with no model of its own): a
// rounded laminate box, at least with honest edges and metre UVs.
function fallback(f) {
  const [W, D, H] = dims(f);
  const p = new Piece();
  p.add('laminateWhite', rbox(W, H, D, 0.012), [0, H / 2, 0]);
  return { parts: p.parts, colliders: solidBox(f), friction: 0.8 };
}

export const BUILDERS = {
  desk, table, ceodesk, recdesk, counter, island: counter, sofa, rack, fridge, copier, vending,
  bookshelf, shelfrack, whiteboard, rug, art, tv, booth, stall, sink, toilet, bartop, foosball, hoop, bench, planter,
};

// ------------------------------------------------------------- context
// What a builder may know about where it stands: a stable seed (so every
// client draws the same books), its room, the ceiling height, which way a
// desk's pod partner lies, and how far its back is from the wall behind it.
export const pieceSeed = (mapId, i) => {
  let h = 2166136261;
  for (const ch of `${mapId}#${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

// distance (metres) from the piece's back face to the nearest wall face
// straight behind it, or 0 if there's none within half a metre
function gapBehind(f, map) {
  const bx = -Math.sin(f.rotY || 0), bz = -Math.cos(f.rotY || 0);
  const back = f.d / 2;
  let best = Infinity;
  for (const w of map.WALLS) {
    if (w.low) continue;
    // ray from the piece centre along (bx, bz) against the wall's box
    let t0 = 0, t1 = Infinity;
    for (const [o, d, c, e] of [[f.x, bx, w.x, w.w / 2], [f.z, bz, w.z, w.d / 2]]) {
      if (Math.abs(d) < 1e-6) { if (Math.abs(o - c) > e) { t0 = Infinity; } continue; }
      const a = (c - e - o) / d, b = (c + e - o) / d;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 <= t1 && t0 < best) best = t0;
  }
  const gap = (best - back) / M;
  return gap > -0.3 && gap < 0.5 ? gap : 0;
}

export function pieceContext(map, f, i) {
  let backSign = -1;
  if (f.type === 'desk') {
    // a pod partner: another desk the same way round, just across our depth
    const c = Math.cos(-(f.rotY || 0)), s = Math.sin(-(f.rotY || 0));
    for (const g of map.FURNITURE) {
      if (g === f || g.type !== 'desk') continue;
      const dx = g.x - f.x, dz = g.z - f.z;
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      if (Math.abs(lx) < 0.3 * M && Math.abs(lz) < f.d * 1.6 && Math.abs(lz) > 0.01) backSign = Math.sign(lz);
    }
  }
  return {
    index: i,
    seed: pieceSeed(map.id, i),
    room: map.roomAt(f.x, f.z)?.id,
    ceiling: map.WALL_HEIGHT / M,
    backSign,
    snap: ['art', 'tv', 'sink'].includes(f.type) ? gapBehind(f, map) : 0,
  };
}

export const buildPiece = (f, ctx) => (BUILDERS[f.type] || fallback)(f, ctx);

// ================================================================ ramps
// What a ramp looks like: the object the map's comment says it is. The
// collider (Office.jsx) is always the same deck; a skin is drawn in the
// ramp's own frame — rising toward +z, foot at z = −l/2 — in metres, and
// baked with the furniture. The deck's top face sits 9 mm above its centre
// line (the collider is 0.08 u thick).
function cheek(key, L, rise) {
  // a right triangle in the ramp's side plane, extruded 18 mm across
  return extrude(`cheek${key}`, shape([[L / 2, 0], [-L / 2, 0], [-L / 2, rise]]), 0.018);
}

const SKINS = {
  // a sheet of MDF on two plywood cheeks and a back brace: a built ramp
  plank(p, L, W, rise, len) {
    for (const s of [-1, 1]) p.add('mdf', cheek(`${L}|${rise}`, L, rise - 0.03), [s * (W / 2 - 0.03), 0, 0], [0, Math.PI / 2, 0]);
    p.add('mdf', rbox(W - 0.08, rise - 0.03, 0.018, 0.003, 1), [0, (rise - 0.03) / 2, L / 2 - 0.02]);
    p.deck(() => {
      p.add('mdf', rbox(W, 0.018, len, 0.004), [0, 0, 0]);
      p.add('brushedSteel', rbox(W, 0.003, 0.09, 0.001, 1), [0, 0.0105, -len / 2 + 0.05]);
      for (const s of [-1, 1]) p.add('tint', box(0.02, 0.002, len - 0.2), [s * (W / 2 - 0.04), 0.0095, 0.05], null, null, '#f2c200');
    });
  },
  // a giant plastic dustpan, its rubber lip on the floor, handle up top
  dustpan(p, L, W, rise, len) {
    const c = '#d8263a';
    p.deck(() => {
      p.add('tint', rbox(W, 0.012, len, 0.004), [0, 0.003, 0], null, null, c);
      p.add('rubber', rbox(W, 0.004, 0.06, 0.0015, 1), [0, 0.008, -len / 2 + 0.03]);
      for (let k = -2; k <= 2; k++) p.add('tint', rbox(0.012, 0.004, len * 0.6, 0.002, 1), [k * W / 6, 0.01, 0.1], null, null, '#b81e30');
      for (const s of [-1, 1]) {
        p.add('tint', extrude(`pan${len}`, shape([[-len / 2, 0], [len / 2, 0], [len / 2, 0.14], [-len / 2 + 0.3, 0.02]]), 0.012), [s * (W / 2 - 0.006), 0.009, 0], [0, -Math.PI / 2, 0], null, c);
      }
      p.add('tint', rbox(W, 0.14, 0.012, 0.004, 1), [0, 0.079, len / 2 - 0.006], null, null, c);
      p.add('tint', tube([[0, 0.15, len / 2 - 0.006], [0, 0.26, len / 2 - 0.03], [0, 0.34, len / 2 - 0.12]], 0.022, 10), [0, 0, 0], null, null, c);
    });
  },
  // a fat lever-arch binder leaning on the table: covers, pages, spine
  binder(p, L, W, rise, len) {
    const c = '#2f5fa8';
    p.deck(() => {
      p.add('tint', rbox(W, 0.006, len, 0.003, 1), [0, 0.006, 0], null, null, c);
      p.add('tint', rbox(W, 0.006, len, 0.003, 1), [0, -0.07, 0], null, null, c);
      p.add('paper', box(W - 0.03, 0.068, len - 0.03), [0, -0.032, 0.005]);
      p.add('tint', rbox(0.014, 0.084, len, 0.004, 1), [-W / 2, -0.032, 0], null, null, c);
      p.add('paper', box(0.002, 0.05, 0.3), [-W / 2 - 0.007, -0.032, len / 2 - 0.3]);
      p.add('plasticBlack', cyl(0.02, 0.02, 0.003, 12), [-W / 2 - 0.008, -0.032, len / 2 - 0.12], [0, 0, Math.PI / 2]);
    });
  },
  // a hardback leaning on the desk, two more lying at its foot
  books(p, L, W, rise, len) {
    p.deck(() => {
      p.add('tint', rbox(W, 0.006, len, 0.003, 1), [0, 0.006, 0], null, null, '#6b1f24');
      p.add('tint', rbox(W, 0.006, len, 0.003, 1), [0, -0.05, 0], null, null, '#6b1f24');
      p.add('paper', box(W - 0.02, 0.05, len - 0.02), [0, -0.022, 0.0]);
      p.add('tint', rbox(0.014, 0.064, len, 0.004, 1), [-W / 2, -0.022, 0], null, null, '#5a1a1e');
      p.add('brass', box(0.002, 0.03, 0.25), [-W / 2 - 0.007, -0.022, len / 2 - 0.25]);
    });
    [['#1f3a64', 0.06, 0.1], ['#2d5a3a', 0.05, -0.05]].forEach(([c, t, yaw], i) => {
      const y = i ? 0.06 : 0;
      p.add('tint', rbox(W * 0.8, t, 0.5, 0.004, 1), [W * 0.62, y + t / 2, -L / 2 + 0.3], [0, yaw, 0], null, c);
      p.add('paper', box(W * 0.8 - 0.02, t - 0.012, 0.49), [W * 0.62 + 0.012, y + t / 2, -L / 2 + 0.3], [0, yaw, 0]);
    });
  },
  // a clipboard: hardboard, a chrome clip, a sheet of paper
  clipboard(p, L, W, rise, len) {
    p.deck(() => {
      p.add('tint', rbox(W, 0.016, len, 0.03), [0, 0.001, 0], null, null, '#8a5a34');
      p.add('paper', box(W - 0.08, 0.002, len - 0.2), [0, 0.01, -0.06]);
      p.add('chrome', rbox(W * 0.5, 0.02, 0.12, 0.008, 1), [0, 0.018, len / 2 - 0.1]);
      p.add('chrome', cyl(0.012, 0.012, W * 0.55, 12), [0, 0.026, len / 2 - 0.05], [0, 0, Math.PI / 2]);
    });
  },
  // a wooden rule, centimetres ticked down both edges
  ruler(p, L, W, rise, len) {
    p.deck(() => {
      p.add('ruler', rbox(W, 0.018, len, 0.003, 1), [0, 0, 0]);
      p.add('brushedSteel', box(0.006, 0.019, len), [W / 2 - 0.004, 0, 0]);
    });
  },
  // chequer plate with yellow edges on a solid steel wedge
  steel(p, L, W, rise, len) {
    for (const s of [-1, 1]) p.add('powderGrey', cheek(`${L}|${rise}`, L, rise - 0.02), [s * (W / 2 - 0.01), 0, 0], [0, Math.PI / 2, 0]);
    p.add('powderGrey', rbox(W - 0.04, rise - 0.02, 0.018, 0.003, 1), [0, (rise - 0.02) / 2, L / 2 - 0.01]);
    p.deck(() => {
      p.add('chequer', rbox(W, 0.012, len, 0.003, 1), [0, 0.003, 0]);
      for (const s of [-1, 1]) p.add('tint', box(0.05, 0.002, len), [s * (W / 2 - 0.025), 0.01, 0], null, null, '#f2c200');
    });
  },
  // the top boards of a pallet
  pallet(p, L, W, rise, len) {
    p.deck(() => {
      const n = Math.max(3, Math.round(len / 0.14));
      for (let i = 0; i < n; i++) p.add('mdf', rbox(W, 0.018, 0.1, 0.003, 1), [0, 0, -len / 2 + 0.05 + i * (len - 0.1) / (n - 1)]);
      for (const s of [-1, 0, 1]) p.add('mdf', rbox(0.08, 0.06, len, 0.004, 1), [s * (W / 2 - 0.05), -0.04, 0]);
    });
  },
};

export function rampParts(r) {
  const L = r.l / M, W = r.w / M, rise = r.rise / M;
  const angle = Math.atan2(rise, L);
  const len = Math.hypot(L, rise);
  const p = new Piece();
  p.deck = (fn) => p.at([0, rise / 2, 0], [-angle, 0, 0], fn);
  (SKINS[r.skin] || SKINS.plank)(p, L, W, rise, len);
  return p.parts;
}
