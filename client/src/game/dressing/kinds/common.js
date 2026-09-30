// Clutter every floor can use: bins, boxes, cables, mats, planters, the
// odd cooler. A kind is
//
//   size      [w, h, d] metres, or (o) => [w, h, d]: the footprint (w along
//             the kind's x, d along its z) and height. The density tool and
//             the placement lint read it; 'box' collision uses it.
//   collide   'none'  cars pass through (flat things, or places no car goes)
//             'low'   ≤ 5 cm humps a car drives over and feels
//             'box'   solid (wall-hugging items; keep ≥ 1.2 m off the lane)
//   colliders (o) => [{ box: [w, h, d], at: [x, y, z] } | { hull: [[x, y, z], …] }]
//             metres, the kind's frame — optional; 'box' defaults to size
//   build     (p, o, r) => void: kit.js parts into Piece p, in METRES in the
//             kind's own frame (origin on the floor at the footprint's
//             centre, +z its front: a wall-hugger's back is at −d/2). Use
//             materials.js keys (they merge into the map's static batch at
//             no draw cost) and p.decal() for prints. o = the entry's opts,
//             r = a seeded random (the same on every client).
//
// Placed from a map's CLUTTER: [kind, x, z, rotY, opts] in metres, rotY by
// the furniture contract (0 faces +z/north, π/2 east, −π/2 west, π south).
import { box, rbox, cyl, lathe, tube, torus, sphere, bush, extrude, shape } from '../../kit.js';
import { cableRun, CABLES } from '../../furniture.js';

const PI = Math.PI;
export const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];

// Colours kept clear of the game's language: nothing purple (powerup pads)
// and nothing yellow (coffee beans, the robot) in the clutter.
export const BIN_COLOURS = ['#3a3d42', '#e6e4de', '#2f5f9e', '#9ea4ab'];
export const BAG_COLOURS = ['#2c3440', '#8e3b3b', '#2f6e4b', '#3f5f8a', '#1f2226', '#6b5a4a'];
export const FABRIC_COLOURS = ['#3f6fa8', '#3f7d7a', '#c0573f', '#56606b', '#8a4a3a', '#2f6e4b'];

// A crumpled paper ball (icosahedron, jittered): bins, floors.
export const crumple = (p, at, rad, color = '#f3f1ea', seed = 1) => {
  p.add('paper', bush(rad, 0, seed), at, [seed, seed * 2, 0], null, color);
};

// An open-topped tub of radius rb at the foot, rt at the rim, height h,
// wall t, with a floor inside at y f — bins, buckets, urns.
export const tub = (p, mat, rb, rt, h, color = null, seg = 16, t = 0.008) => {
  p.add(mat, lathe([[0, 0.002], [rb - 0.01, 0], [rb, 0.01], [rt, h - 0.012], [rt + 0.004, h], [rt - t, h], [rt - t - 0.004, h - 0.01], [rb - t, 0.03], [0, 0.03]], seg), [0, 0, 0], null, null, color);
};

// A cable lying on the floor along [[x, z], …] (metres, piece frame), taped
// down every so often.
export function floorCable(p, pts, color, seed = 0, tape = true) {
  const path = pts.map(([x, z], i) => [x, 0.0045 + (i % 2) * 0.001, z]);
  p.add('tint', tube(path, 0.0045, 5, true, 10), [0, 0, 0], null, null, color || CABLES[seed % 3]);
  if (!tape) return;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    for (let t = (0.5 - (acc % 0.9)); t < L; t += 0.9) {
      if (t < 0) continue;
      const k = t / L, yaw = Math.atan2(bx - ax, bz - az);
      p.decal('tape', 0.12, 0.12, [ax + (bx - ax) * k, 0.0105, az + (bz - az) * k], [-PI / 2, 0, yaw], 0.95, '#3a3c40');
    }
    acc += L;
  }
}

export const CLUTTER_KINDS = {
  // ------------------------------------------------------------- bins
  // An office waste bin with its liner folded over the rim, paper inside.
  bin: {
    size: (o) => [0.32, o.h || 0.4, 0.32],
    collide: 'box',
    build(p, o, r) {
      const h = o.h || 0.4;
      const c = o.color || pick(BIN_COLOURS, r);
      tub(p, 'tint', 0.13, 0.155, h, c);
      p.add('plasticBlack', lathe([[0.157, h - 0.05], [0.162, h - 0.01], [0.158, h + 0.004], [0.148, h + 0.002]], 16));
      crumple(p, [0.03, h - 0.06, 0.02], 0.045, '#f3f1ea', 3);
      crumple(p, [-0.04, h - 0.07, -0.03], 0.04, '#e9e2c9', 5);
    },
  },
  // Three bins under one hood: paper, plastic, waste — labelled.
  recycling: {
    size: [1.3, 0.72, 0.42],
    collide: 'box',
    build(p) {
      const bins = [['#2f5f9e', 'lbl_paper'], ['#d86f2a', 'lbl_plastic'], ['#3a3d42', 'lbl_waste']];
      bins.forEach(([c, lbl], i) => {
        const x = (i - 1) * 0.43;
        p.add('tint', rbox(0.41, 0.62, 0.4, 0.02, 1), [x, 0.31, 0], null, null, c);
        // the lid, the slot in it, a hand pull
        p.add('plasticGrey', rbox(0.42, 0.04, 0.41, 0.012, 1), [x, 0.64, 0]);
        p.add('plasticBlack', box(0.24, 0.004, 0.08), [x, 0.661, 0.06]);
        p.add('plasticBlack', rbox(0.12, 0.02, 0.02, 0.006, 1), [x, 0.58, 0.205]);
        p.decal(lbl, 0.3, 0.3, [x, 0.4, 0.2015]);
      });
      p.add('plasticBlack', rbox(1.31, 0.03, 0.43, 0.01, 1), [0, 0.015, 0]);
      p.decal('lbl_paper', 0.12, 0.12, [-0.43, 0.664, 0.1], [-PI / 2, 0, 0], 0.9);
    },
  },
  // A pile of deliveries: two or three cartons at the base, one or two on
  // top, a padded mailer; taped, labelled.
  parcels: {
    size: (o) => [o.w || 0.95, 0.62, o.d || 0.55],
    collide: 'box',
    colliders(o) { return parcelBoxes(o).map((b) => ({ box: [b.w, b.h, b.d], at: [b.x, b.y + b.h / 2, b.z] })); },
    build(p, o, r) {
      for (const b of parcelBoxes(o)) {
        p.at([b.x, b.y, b.z], [0, b.yaw, 0], () => {
          if (b.mailer) {
            p.add('fabric:#8e9aa6', rbox(b.w, b.h, b.d, 0.012, 1), [0, b.h / 2, 0]);
            p.decal('parcel', 0.12, 0.09, [0, b.h + 0.001, 0], [-PI / 2, 0, 0.1]);
            return;
          }
          p.add('cardboard', rbox(b.w, b.h, b.d, 0.004, 1), [0, b.h / 2, 0]);
          // packing tape over the seam and down the front (the tape cell's
          // strip is 40% of its height: a 12 cm card is 5 cm of tape)
          p.decal('tape', b.d, 0.12, [0, b.h + 0.0012, 0], [-PI / 2, 0, PI / 2], 0.9, '#c9a26a');
          p.decal('tape', 0.14, 0.12, [0, b.h - 0.07, b.d / 2 + 0.0012], [0, 0, PI / 2], 0.9, '#c9a26a');
          p.decal(r() < 0.5 ? 'parcel' : 'fragile', Math.min(0.16, b.w * 0.5), Math.min(0.12, b.h * 0.5), [b.w * 0.18, b.h * 0.45, b.d / 2 + 0.0012]);
        });
      }
    },
  },
  // ------------------------------------------------------- floor power
  // A floor box: a steel frame flush with the floor and its lid, a cable
  // out of the flap. Flat: nothing to hit.
  floorbox: {
    size: [0.3, 0.008, 0.3],
    collide: 'none',
    build(p, o, r) {
      p.add('brushedSteel', rbox(0.3, 0.008, 0.3, 0.003, 1), [0, 0.004, 0]);
      p.decal('floorbox', 0.3, 0.3, [0, 0.0085, 0], [-PI / 2, 0, 0]);
      if (o.cable !== false) {
        const L = o.cable || 0.6;
        floorCable(p, [[0, 0.12], [0.03, 0.12 + L * 0.3], [-0.02, 0.12 + L * 0.7], [0.02 * r(), 0.12 + L]], null, (r() * 3) | 0, false);
      }
    },
  },
  // A rubber cable protector across a run of cables: 50 cm wide, 5 cm tall
  // — a hump cars feel. len runs along the kind's x.
  cableprotector: {
    size: (o) => [o.len || 1.2, 0.05, 0.5],
    collide: 'low',
    colliders(o) {
      const L = (o.len || 1.2) / 2;
      const prof = [[0, -0.25], [0, 0.25], [0.05, 0.09], [0.05, -0.09]];
      return [{ hull: [-L, L].flatMap((x) => prof.map(([y, z]) => [x, y, z])) }];
    },
    build(p, o) {
      const L = o.len || 1.2;
      const hump = extrude('cableprot', shape([[-0.25, 0], [0.25, 0], [0.09, 0.05], [-0.09, 0.05]]), L, 0);
      p.add('rubber', hump, [0, 0, 0], [0, PI / 2, 0]);
      // the hinged lid down the middle, a lighter grey
      p.add('plasticGrey', box(L - 0.02, 0.003, 0.17), [0, 0.0505, 0]);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
        floorCable(p, [[s * L / 2, (k - 1) * 0.04], [s * (L / 2 + 0.25), (k - 1) * 0.05 + 0.03 * s], [s * (L / 2 + 0.6), (k - 1) * 0.09]], CABLES[k], k, false);
      }
    },
  },
  // Cables along the floor: o.pts [[x, z], …] in the kind's frame (default
  // a 2 m run along x), taped every 90 cm.
  cablerun: {
    size: (o) => { const b = ptsBounds(o.pts || [[-1, 0], [1, 0]]); return [b.w + 0.02, 0.01, b.d + 0.02]; },
    collide: 'none',
    build(p, o, r) {
      const pts = o.pts || [[-1, 0], [1, 0]];
      const n = o.n || 2;
      for (let i = 0; i < n; i++) floorCable(p, pts.map(([x, z], k) => [x + (k ? (r() - 0.5) * 0.02 : 0), z + i * 0.012]), CABLES[(i + (o.seed || 0)) % CABLES.length], i, i === 0);
    },
  },
  // A six-way strip on the floor with plugs in it and cables off.
  powerstrip: {
    size: [0.42, 0.05, 0.3],
    collide: 'none',
    build(p, o, r) {
      p.add('plasticWhite', rbox(0.38, 0.04, 0.06, 0.008, 1), [0, 0.02, 0]);
      p.add('tint', rbox(0.025, 0.012, 0.03, 0.004, 1), [-0.16, 0.042, 0], null, null, '#ff7a1a');
      const n = 2 + ((r() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const x = -0.1 + i * 0.055;
        p.add('plasticBlack', rbox(0.035, 0.035, 0.04, 0.006, 1), [x, 0.058, 0]);
        floorCable(p, [[x, 0.02], [x + (r() - 0.5) * 0.1, 0.12], [x + (r() - 0.5) * 0.3, 0.25]], CABLES[i % 3], i, false);
      }
      floorCable(p, [[0.19, 0], [0.3, -0.04], [0.42, -0.12]], '#e6e4de', 0, false);
    },
  },
  // ------------------------------------------------------------- mats
  // A clear polycarbonate chair mat with its lip.
  chairmat: {
    size: [1.2, 0.004, 0.9],
    collide: 'none',
    build(p) {
      const outline = shape([[-0.6, -0.45], [0.6, -0.45], [0.6, 0.45], [0.2, 0.45], [0.18, 0.7], [-0.18, 0.7], [-0.2, 0.45], [-0.6, 0.45]]);
      p.add('glassClear', extrude('chairmat', outline, 0.004, 0), [0, 0.003, 0], [-PI / 2, 0, 0]);
    },
  },
  // A looks-only mat (never a 'rug' — that type changes grip): 6 mm of
  // rubber-backed pile with the decal of its face. o.logo for the branded one.
  mat: {
    size: (o) => [o.w || 1.2, 0.006, o.d || 0.8],
    collide: 'none',
    build(p, o) {
      const w = o.w || 1.2, d = o.d || 0.8;
      p.add('fabric:#2a2c30', rbox(w, 0.006, d, 0.003, 1), [0, 0.003, 0]);
      p.decal(o.logo ? 'matlogo' : 'mat', w, d, [0, 0.0062, 0], [-PI / 2, 0, 0]);
    },
  },
  // ----------------------------------------------------- by the door
  umbrellastand: {
    size: [0.3, 0.9, 0.3],
    collide: 'box',
    colliders: () => [{ box: [0.28, 0.5, 0.28], at: [0, 0.25, 0] }],
    build(p, o, r) {
      p.add('brushedSteel', lathe([[0, 0.004], [0.12, 0], [0.125, 0.01], [0.125, 0.48], [0.13, 0.5], [0.118, 0.5], [0.115, 0.03], [0, 0.03]], 16));
      const n = o.n || 3;
      for (let i = 0; i < n; i++) {
        const a = i * 2.2 + r(), lean = 0.08 + r() * 0.1;
        const c = pick(['#1f2226', '#2f4f7e', '#8e3b3b', '#2f6e4b', '#3a3d42'], r);
        p.at([Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05], [Math.sin(a) * lean, 0, -Math.cos(a) * lean], () => {
          p.add(`fabric:${c}`, lathe([[0.004, 0], [0.03, 0.12], [0.04, 0.45], [0.028, 0.66], [0.008, 0.72], [0.004, 0.72]], 8), [0, 0, 0]);
          p.add('chrome', cyl(0.004, 0.004, 0.08, 6), [0, 0.76, 0]);
          p.add('plasticBlack', tube([[0, 0.8, 0], [0, 0.86, 0], [0.02, 0.9, 0], [0.05, 0.89, 0], [0.055, 0.86, 0]], 0.009, 6, true, 30));
        });
      }
    },
  },
  // A coat stand: weighted base, a pole, hooks, one coat and a scarf on it.
  coatstand: {
    size: [0.46, 1.8, 0.46],
    collide: 'box',
    colliders: () => [{ box: [0.4, 1.8, 0.4], at: [0, 0.9, 0] }],
    build(p, o, r) {
      p.add('powderBlack', lathe([[0, 0.002], [0.2, 0], [0.205, 0.012], [0.19, 0.025], [0.03, 0.035], [0, 0.036]], 20));
      p.add('powderBlack', cyl(0.016, 0.016, 1.72, 10), [0, 0.88, 0]);
      p.add('powderBlack', sphere(0.028, 10, 6), [0, 1.75, 0]);
      for (let i = 0; i < 4; i++) {
        const a = i * PI / 2 + 0.4;
        p.add('powderBlack', tube([[0, 1.62, 0], [Math.cos(a) * 0.1, 1.66, Math.sin(a) * 0.1], [Math.cos(a) * 0.14, 1.71, Math.sin(a) * 0.14]], 0.007, 5, true, 20));
      }
      const c = o.color || pick(['#3b3f46', '#6b4a3a', '#2c3440', '#7a6a55'], r);
      // a coat hung by its loop: a slumped cone of cloth, shoulders to hem
      p.at([0.1, 0, 0.04], [0, 0.7, 0.05], () => {
        p.add(`fabric:${c}`, lathe([[0.02, 1.64], [0.12, 1.58], [0.16, 1.42], [0.17, 1.1], [0.2, 0.78], [0.19, 0.76]], 10), [0, 0, 0], null, [1, 1, 0.55]);
      });
      p.add('fabric:#b0413a', tube([[-0.08, 1.6, 0.03], [-0.11, 1.4, 0.05], [-0.1, 1.2, 0.04]], 0.03, 5, true, 12), [0, 0, 0], null, [1, 1, 0.5]);
    },
  },
  // A bottled-water cooler: a white cabinet, taps, the drip tray, a sleeve
  // of paper cups on the side, the bottle on top.
  watercooler: {
    size: [0.34, 1.4, 0.36],
    collide: 'box',
    build(p) {
      p.add('plasticWhite', rbox(0.32, 0.96, 0.33, 0.02, 1), [0, 0.48, 0]);
      p.add('plasticGrey', rbox(0.3, 0.22, 0.02, 0.01, 1), [0, 0.64, 0.17]);
      p.add('plasticBlack', rbox(0.2, 0.02, 0.08, 0.006, 1), [0, 0.54, 0.19]);
      p.add('tint', rbox(0.03, 0.04, 0.03, 0.006, 1), [-0.05, 0.72, 0.19], null, null, '#c0392b');
      p.add('tint', rbox(0.03, 0.04, 0.03, 0.006, 1), [0.05, 0.72, 0.19], null, null, '#2f6fb5');
      p.add('plasticGrey', rbox(0.3, 0.03, 0.3, 0.01, 1), [0, 0.975, 0]);
      p.add('plasticGrey', cyl(0.035, 0.035, 0.36, 10), [0.2, 0.62, 0.05]);
      p.add('paper', cyl(0.03, 0.03, 0.06, 10), [0.2, 0.42, 0.05]);
      // the bottle upside down in its collar: clear, the water in it
      p.add('glassClear', lathe([[0.03, 0.99], [0.03, 1.03], [0.13, 1.08], [0.135, 1.33], [0.12, 1.38], [0, 1.39]], 16));
      p.add('tint', lathe([[0.026, 0.995], [0.026, 1.03], [0.126, 1.08], [0.128, 1.25], [0, 1.25]], 14), [0, 0, 0], null, null, '#8fc3dd');
      p.decal('brand', 0.18, 0.1, [0, 1.17, 0.1305], null, 0.9, '#2f6fb5');
    },
  },
  // ------------------------------------------------------- cleaning
  mopbucket: {
    size: [0.5, 1.05, 0.34],
    collide: 'box',
    colliders: () => [{ box: [0.5, 0.42, 0.34], at: [0, 0.21, 0] }],
    build(p, o) {
      const c = o.color || '#2f6fb5';
      p.add('tint', rbox(0.46, 0.3, 0.3, 0.04, 1), [0, 0.19, 0], null, null, c);
      p.add('plasticBlack', rbox(0.2, 0.06, 0.22, 0.01, 1), [0.14, 0.37, 0]);
      p.add('plasticGrey', rbox(0.22, 0.14, 0.24, 0.02, 1), [0.13, 0.42, 0]);
      for (const [x, z] of [[-0.19, -0.11], [0.19, -0.11], [-0.19, 0.11], [0.19, 0.11]]) p.add('plasticBlack', cyl(0.025, 0.025, 0.02, 8), [x, 0.025, z], [PI / 2, 0, 0]);
      p.add('tint', rbox(0.44, 0.02, 0.28, 0.005, 1), [0, 0.305, 0], null, null, '#6d8ea8');
      // the mop, leaning out of the wringer
      p.at([-0.08, 0.3, 0], [0, 0, 0.18], () => {
        p.add('brushedSteel', cyl(0.012, 0.012, 1.1, 8), [0, 0.45, 0]);
        p.add('plasticBlack', cyl(0.016, 0.016, 0.14, 8), [0, 1.02, 0]);
        for (let i = 0; i < 10; i++) p.add('fabric:#d9d5c8', cyl(0.01, 0.012, 0.22, 4), [Math.cos(i) * 0.03, -0.08, Math.sin(i) * 0.03], [Math.sin(i) * 0.3, 0, Math.cos(i) * 0.3]);
      });
    },
  },
  // The A-frame warning sign, open, printed both sides. Orange-red, not the
  // usual yellow: yellow is the coffee beans' colour.
  wetsign: {
    size: [0.3, 0.62, 0.34],
    collide: 'box',
    build(p) {
      const tilt = 0.24;
      for (const s of [-1, 1]) {
        p.at([0, 0.3, s * 0.075], [s * -tilt, s < 0 ? PI : 0, 0], () => {
          p.add('tint', rbox(0.3, 0.62, 0.012, 0.012, 1), [0, 0, 0], null, null, '#f07d25');
          p.decal('wetfloor', 0.26, 0.4, [0, -0.05, 0.0065]);
        });
      }
      p.add('tint', rbox(0.3, 0.03, 0.03, 0.01, 1), [0, 0.6, 0], null, null, '#d8661c');
    },
  },
  // --------------------------------------------------------- crates
  // Plastic bottle crates, stacked o.n high; the top one full of bottles.
  bottlecrate: {
    size: (o) => [0.42, 0.3 * (o.n || 1), 0.3],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 1;
      const c = o.color || pick(['#b8322a', '#2f5f9e', '#2f6e4b', '#3a3d42'], r);
      for (let k = 0; k < n; k++) {
        const y = k * 0.29, yaw = (r() - 0.5) * 0.08;
        p.at([0, y, 0], [0, yaw, 0], () => {
          // walls with hand holes, a floor, a divider grid
          for (const s of [-1, 1]) {
            p.add('tint', rbox(0.42, 0.28, 0.012, 0.004, 1), [0, 0.14, s * 0.144], null, null, c);
            p.add('tint', rbox(0.012, 0.28, 0.3, 0.004, 1), [s * 0.204, 0.14, 0], null, null, c);
            p.add('plasticBlack', box(0.1, 0.03, 0.014), [0, 0.24, s * 0.145]);
          }
          p.add('tint', box(0.4, 0.01, 0.28), [0, 0.012, 0], null, null, c);
          p.decal('brand', 0.14, 0.08, [0, 0.13, 0.1512], null, 0.85, '#ffffff');
          if (k === n - 1) {
            for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
              if (r() < 0.12) continue;
              const bc = r() < 0.6 ? '#2e5a2e' : '#6b4424';
              p.add('tint', lathe([[0, 0.012], [0.031, 0.014], [0.032, 0.19], [0.014, 0.25], [0.012, 0.3], [0, 0.3]], 7), [-0.15 + i * 0.1, 0, -0.09 + j * 0.09], null, null, bc);
              p.add('chrome', cyl(0.014, 0.014, 0.012, 7), [-0.15 + i * 0.1, 0.305, -0.09 + j * 0.09]);
            }
          }
        });
      }
    },
  },
  // A wooden crate (slats), any floor.
  crate: {
    size: (o) => [o.w || 0.6, o.h || 0.4, o.d || 0.4],
    collide: 'box',
    build(p, o) {
      const w = o.w || 0.6, h = o.h || 0.4, d = o.d || 0.4, n = Math.max(2, Math.round(h / 0.1));
      for (let i = 0; i < n; i++) {
        const y = (i + 0.5) * h / n;
        for (const s of [-1, 1]) {
          p.add('mdf', rbox(w, h / n - 0.012, 0.018, 0.003, 1), [0, y, s * (d / 2 - 0.009)]);
          p.add('mdf', rbox(0.018, h / n - 0.012, d - 0.036, 0.003, 1), [s * (w / 2 - 0.009), y, 0]);
        }
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add('teak', rbox(0.04, h, 0.04, 0.004, 1), [sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02)]);
      p.add('mdf', box(w - 0.02, 0.012, d - 0.02), [0, h - 0.006, 0]);
    },
  },
  // ----------------------------------------------------------- soft
  beanbag: {
    size: [0.8, 0.45, 0.8],
    collide: 'box',
    colliders: () => [{ box: [0.72, 0.4, 0.72], at: [0, 0.2, 0] }],
    build(p, o, r) {
      const c = o.color || pick(FABRIC_COLOURS, r);
      p.add(`fabric:${c}`, bush(0.4, 2, (r() * 7) | 0), [0, 0.2, 0], [0, r() * 6, 0], [1, 0.55, 1]);
      // the dent someone left in it
      p.add(`fabric:${c}`, sphere(0.2, 10, 6), [0.05, 0.3, -0.06], null, [1.2, 0.45, 1.1]);
    },
  },
  backpack: {
    size: [0.32, 0.44, 0.24],
    collide: 'box',
    build(p, o, r) {
      const c = o.color || pick(BAG_COLOURS, r);
      // leaning back against the wall (its back is −z)
      p.at([0, 0, -0.02], [-0.12, 0, 0], () => {
        p.add(`fabric:${c}`, rbox(0.3, 0.42, 0.16, 0.06, 2), [0, 0.21, 0]);
        p.add(`fabric:${c}`, rbox(0.24, 0.18, 0.06, 0.03, 1), [0, 0.13, 0.09]);
        p.add('plasticBlack', box(0.2, 0.006, 0.004), [0, 0.225, 0.121]);
        p.add('fabric:#1f2226', torus(0.035, 0.008, 4, 10, PI), [0, 0.42, 0], [0, 0, 0]);
        for (const s of [-1, 1]) p.add('fabric:#1f2226', rbox(0.05, 0.36, 0.012, 0.004, 1), [s * 0.08, 0.22, -0.085]);
      });
    },
  },
  laptopbag: {
    size: [0.42, 0.34, 0.14],
    collide: 'box',
    build(p, o, r) {
      const c = o.color || pick(['#1f2226', '#2c3440', '#5b3423'], r);
      p.at([0, 0, 0], [-0.18, 0, 0], () => {
        p.add(`fabric:${c}`, rbox(0.4, 0.3, 0.08, 0.02, 1), [0, 0.15, 0]);
        p.add(`fabric:${c}`, rbox(0.34, 0.16, 0.03, 0.012, 1), [0, 0.12, 0.05]);
        p.add('fabric:#1f2226', tube([[-0.16, 0.3, 0], [-0.1, 0.38, 0.02], [0.1, 0.38, 0.02], [0.16, 0.3, 0]], 0.01, 5, true, 12));
      });
    },
  },
  // ---------------------------------------------------------- green
  // A planter trough: fibreglass box, soil, box balls and grass.
  trough: {
    size: (o) => [o.len || 1.2, 0.85, o.d || 0.36],
    collide: 'box',
    colliders: (o) => [{ box: [o.len || 1.2, 0.42, o.d || 0.36], at: [0, 0.21, 0] }],
    build(p, o, r) {
      const L = o.len || 1.2, D = o.d || 0.36, H = 0.42;
      const mat = o.mat || 'corten';
      p.add(mat, rbox(L, H, D, 0.012, 1), [0, H / 2, 0]);
      p.add('soil', box(L - 0.04, 0.01, D - 0.04), [0, H - 0.02, 0]);
      const n = Math.max(2, Math.round(L / 0.4));
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * L / n;
        const g = pick(['#3e7a3a', '#2f6b35', '#4c8a3f', '#5a8f3a'], r);
        if (i % 2 === 0) {
          const rr = 0.14 + r() * 0.05;
          p.add('foliage', bush(rr, 1, (i + 3) % 7), [x, H + rr * 0.75, (r() - 0.5) * 0.04], [0, r() * 3, 0], null, g);
        } else {
          for (let b = 0; b < 16; b++) {
            const a = b / 16 * PI * 2 + r(), lean = 0.1 + r() * 0.45, h = 0.2 + r() * 0.22;
            p.add('foliage', cyl(0.001, 0.007, h, 3), [x + Math.cos(a) * 0.03, H + h / 2 * Math.cos(lean), Math.sin(a) * 0.03], [Math.sin(a) * lean, 0, -Math.cos(a) * lean], null, b % 3 === 0 ? '#9aa24a' : '#6f9a3e');
          }
        }
      }
    },
  },
  // A tall plant in a big pot: a fig of stacked leaf balls.
  bigplant: {
    size: [0.5, 1.4, 0.5],
    collide: 'box',
    colliders: () => [{ box: [0.44, 0.45, 0.44], at: [0, 0.225, 0] }],
    build(p, o, r) {
      const pot = o.pot || pick(['#ebe6dc', '#3b3d42', '#b5623e'], r);
      p.add('tint', lathe([[0, 0.002], [0.17, 0], [0.19, 0.02], [0.22, 0.42], [0.225, 0.45], [0.2, 0.45], [0.19, 0.4], [0, 0.4]], 18), [0, 0, 0], null, null, pot);
      p.add('soil', cyl(0.195, 0.195, 0.01, 14), [0, 0.41, 0]);
      p.add('teak', tube([[0, 0.4, 0], [0.02, 0.8, 0.01], [-0.02, 1.1, 0]], 0.018, 5, true, 10));
      for (let i = 0; i < 5; i++) {
        const y = 0.75 + i * 0.14, rr = 0.2 - i * 0.02;
        p.add('foliage', bush(rr, 1, (i * 3 + 1) % 7), [(r() - 0.5) * 0.14, y, (r() - 0.5) * 0.14], [0, r() * 6, 0], [1, 0.8, 1], pick(['#3e7a3a', '#2f6b35', '#4c8a3f'], r));
      }
    },
  },
  // ------------------------------------------------------- building
  // A floor convector: a linear aluminium grille flush in the floor along a
  // window. len along x.
  convector: {
    size: (o) => [o.len || 2, 0.006, o.d || 0.24],
    collide: 'none',
    build(p, o) {
      const L = o.len || 2, D = o.d || 0.24;
      p.add('aluminium', rbox(L, 0.006, D, 0.002, 1), [0, 0.003, 0]);
      p.add('louvre', box(L - 0.03, 0.002, D - 0.04), [0, 0.0062, 0]);
    },
  },
  // A panel radiator on its wall brackets, valves and pipes to the floor.
  radiator: {
    size: (o) => [o.len || 1, 0.75, 0.11],
    collide: 'box',
    build(p, o) {
      const L = o.len || 1;
      p.add('powderWhite', rbox(L, 0.56, 0.07, 0.01, 1), [0, 0.45, 0.005]);
      p.add('louvre', box(L - 0.04, 0.002, 0.05), [0, 0.731, 0.005]);
      for (let x = -L / 2 + 0.05; x < L / 2; x += 0.05) p.add('powderWhite', box(0.012, 0.5, 0.004), [x, 0.45, 0.042]);
      for (const s of [-1, 1]) {
        p.add('chrome', cyl(0.012, 0.012, 0.16, 8), [s * (L / 2 + 0.03), 0.09, 0.02]);
        p.add('chrome', cyl(0.018, 0.018, 0.05, 8), [s * (L / 2 + 0.03), 0.19, 0.02]);
        p.add('powderWhite', cyl(0.011, 0.011, 0.1, 8), [s * (L / 2 + 0.015), 0.19, 0.02], [0, 0, PI / 2]);
        p.add('tint', cyl(0.02, 0.02, 0.03, 8), [s * (L / 2 + 0.03), 0.23, 0.02], null, null, s < 0 ? '#e9e9e6' : '#c0392b');
      }
    },
  },
  // Reams and magazines stacked against a wall.
  paperpile: {
    size: [0.6, 0.3, 0.34],
    collide: 'box',
    build(p, o, r) {
      for (let s = 0; s < 2; s++) {
        const h = 2 + ((r() * 4) | 0);
        for (let i = 0; i < h; i++) {
          const x = (s - 0.5) * 0.3 + (r() - 0.5) * 0.02;
          p.add('paper', rbox(0.21, 0.052, 0.297, 0.004, 1), [x, 0.026 + i * 0.053, (r() - 0.5) * 0.02], [0, (r() - 0.5) * 0.12, 0]);
          p.add('tint', box(0.212, 0.03, 0.12), [x, 0.026 + i * 0.053, 0.05], null, null, pick(['#2f5f9e', '#c0392b', '#2f6e4b', '#e6e4de'], r));
        }
      }
    },
  },
  // Magazines fanned on the floor: flat enough to drive over.
  magazines: {
    size: [0.5, 0.03, 0.45],
    collide: 'none',
    build(p, o, r) {
      for (let i = 0; i < 5; i++) {
        p.add('tint', box(0.21, 0.004, 0.28), [(r() - 0.5) * 0.18, 0.003 + i * 0.0045, (r() - 0.5) * 0.12], [0, (r() - 0.5) * 1.5, 0], null, pick(['#c0573f', '#3f6fa8', '#e6e4de', '#2f6e4b', '#1f2226'], r));
      }
    },
  },
  // A cigarette urn: a steel column, a sand tray, the evidence.
  cigurn: {
    size: [0.3, 0.66, 0.3],
    collide: 'box',
    build(p) {
      p.add('brushedSteel', lathe([[0, 0.004], [0.14, 0], [0.145, 0.02], [0.13, 0.04], [0.13, 0.6], [0.14, 0.62], [0.14, 0.66], [0.12, 0.66], [0.12, 0.64], [0, 0.64]], 18));
      p.add('tint', cyl(0.118, 0.118, 0.006, 14), [0, 0.645, 0], null, null, '#cdbf9e');
      for (let i = 0; i < 6; i++) p.add('paper', cyl(0.004, 0.004, 0.028, 5), [Math.cos(i * 2.1) * 0.06, 0.652, Math.sin(i * 2.1) * 0.06], [PI / 2, i, 0], null, i % 2 ? '#efe9dc' : '#d9a066');
      p.decal('nosmoke', 0.1, 0.1, [0, 0.45, 0.1305]);
    },
  },
  // A floor lamp: weighted disc, a pole, a drum shade.
  floorlamp: {
    size: [0.4, 1.6, 0.4],
    collide: 'box',
    colliders: () => [{ box: [0.3, 1.5, 0.3], at: [0, 0.75, 0] }],
    build(p, o) {
      p.add('powderBlack', lathe([[0, 0.002], [0.15, 0], [0.155, 0.012], [0.14, 0.022], [0, 0.026]], 20));
      p.add('brass', cyl(0.011, 0.011, 1.38, 8), [0, 0.71, 0]);
      p.add(`fabric:${o.shade || '#e9e2d0'}`, cyl(0.17, 0.2, 0.26, 20, true), [0, 1.5, 0]);
      p.add('lampStrip', cyl(0.02, 0.02, 0.05, 8), [0, 1.43, 0]);
    },
  },
  // A fire extinguisher on its floor stand, hose clipped, tag on.
  extinguisher: {
    size: [0.3, 0.62, 0.26],
    collide: 'box',
    build(p) {
      p.add('powderBlack', rbox(0.3, 0.02, 0.24, 0.006, 1), [0, 0.01, 0]);
      p.add('powderBlack', rbox(0.26, 0.2, 0.02, 0.006, 1), [0, 0.11, -0.1]);
      p.add('tint', lathe([[0, 0.02], [0.07, 0.022], [0.078, 0.04], [0.078, 0.46], [0.06, 0.52], [0.02, 0.54], [0, 0.54]], 14), [0, 0, 0.01], null, null, '#c0271f');
      p.add('powderBlack', rbox(0.04, 0.05, 0.03, 0.006, 1), [0, 0.57, 0.01]);
      p.add('chrome', rbox(0.1, 0.012, 0.02, 0.004, 1), [0.03, 0.6, 0.01], [0, 0, -0.2]);
      p.add('plasticBlack', tube([[0.02, 0.55, 0.03], [0.07, 0.5, 0.06], [0.085, 0.35, 0.07], [0.08, 0.2, 0.08]], 0.008, 5, true, 12));
      p.add('paper', box(0.09, 0.12, 0.002), [0, 0.3, 0.0885]);
    },
  },
};

// the parcel pile's cartons: deterministic from its opts
function parcelBoxes(o) {
  const w = o.w || 0.95, d = o.d || 0.55;
  const out = [
    { x: -w / 2 + 0.26, z: -d / 2 + 0.2, y: 0, w: 0.5, h: 0.34, d: 0.4, yaw: 0.04 },
    { x: w / 2 - 0.2, z: -d / 2 + 0.17, y: 0, w: 0.4, h: 0.28, d: 0.34, yaw: -0.08 },
    { x: -w / 2 + 0.24, z: -d / 2 + 0.19, y: 0.34, w: 0.38, h: 0.24, d: 0.3, yaw: -0.12 },
    { x: w / 2 - 0.24, z: d / 2 - 0.12, y: 0, w: 0.34, h: 0.06, d: 0.24, yaw: 0.3, mailer: true },
  ];
  if (o.n === 3) out.splice(2, 1);
  return out;
}

const ptsBounds = (pts) => {
  const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1]);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
};

// Decal and scatter kinds every map shares live with their systems
// (decals.js BUILTIN_DECALS, scatter.jsx BUILTIN_SCATTER); a map's own go in
// its kinds file. The default wall-base bands: any map's plain walls, glass
// and railings (a map overrides them as 'plain:<theme>' etc.).
export const BANDS = {
  plain: { sockets: 4.5, vents: 8, scuffs: 3, stops: true, thresholds: true },
};
