// The IT Cellar's dressing kinds, placed from shared/src/maps/cellar.js
// (CLUTTER, SCATTER, DECALS). See kinds/common.js for the contract.
//
// Two families. The LOW ones (≤ 5 cm: cable ramps, rubber mats, a loose
// floor tile, flattened cartons, a drift of dead keyboards) are what the
// side bands of the lap can carry — 0.6–1.2 m off the racing line, things a
// car bumps over. The TALL ones stand back against the walls, ≥ 1.2 m off
// it: drums, archive boxes, dead CRTs, pallets, a cable drum, the pipework
// round the boiler — what the building has been quietly filling up with.
//
// Materials: two keys the cellar's static batch already draws everywhere
// (tint and trim; see FINISH below), so none of this costs a draw call of
// its own; prints and labels ride the map's one decal mesh. Nothing yellow (the beans) or purple (the
// pads): hazard orange, oxide red, steel blue, beige plastic, cardboard.
import { box, rbox, cyl, lathe, tube, sphere, bush, torus, extrude, shape } from '../../kit.js';
import { floorCable, pick } from './common.js';
import { CABLES } from '../../furniture.js';

const PI = Math.PI;

// ------------------------------------------------------------- helpers
// Every part goes into the static batch under one of two keys the cellar's
// batch draws everywhere anyway: 'trim' (satin, the wall band's vents) and
// 'tint' (plain). A key the batch only had in one corner (the copier's
// rubber, the vending machine's glass) would otherwise stop being culled
// with that corner and cost its draws in every view. So each finish below
// is a colour on one of those two.
const FINISH = {
  rubber: ['tint', '#1b1c1e'], plasticBlack: ['tint', '#1d1e21'], plasticGrey: ['tint', '#9ea4ab'],
  plasticWhite: ['tint', '#e6e6e1'], paper: ['tint', '#f2efe6'], glassClear: ['tint', '#1c2a33'],
  chrome: ['trim', '#c3c8cd'], powderGrey: ['trim', '#8e959c'], powderBlack: ['trim', '#26282b'], louvre: ['trim', '#2a2d32'],
};
const add = (p, finish, geo, pos, rot = null, scale = null, color = null) => {
  const [key, c] = FINISH[finish];
  p.add(key, geo, pos, rot, scale, color || c);
};

// a hull for a low slab with bevelled edges: w × d, h tall, e the bevel run
const slabHull = (w, d, h, e = 0.03) => {
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push([sx * w / 2, 0, sz * d / 2]);
    pts.push([sx * (w / 2 - e), h, sz * (d / 2 - e)]);
  }
  return pts;
};
// beige that went beige in 1997, in a few shades
const BEIGE = ['#d9d1bb', '#cfc6ad', '#e0d9c4', '#c8bea3'];
const DRUMS = ['#2f5a8a', '#8e2f26', '#3d4a44', '#6b7178', '#2f5a8a'];
const CARD = ['#b08c5c', '#a7824f', '#bb9767', '#9c7a4c'];

// ------------------------------------------------------------ painters
const blob = (g, x, y, rx, ry, rgb, a0, a1 = 0, rot = 0) => {
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(1, `rgba(${rgb},${a1})`);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, PI * 2); g.fill();
  g.restore();
};
const word = (g, s, x, y, px, color, weight = 900, font = 'system-ui, sans-serif') => {
  g.fillStyle = color; g.font = `${weight} ${px}px ${font}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y);
};
// knock paint out of a stencil: scuffed by wheels and mops
const wearOut = (g, W, H, r, n, a = 0.7) => {
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * a})`;
    g.fillRect(r() * W, r() * H, (4 + r() * 30) * W / 512, (1 + r() * 3) * H / 256);
  }
  g.globalCompositeOperation = 'source-over';
};

export const DECAL_KINDS = {
  // KEEP CLEAR, stencilled on the floor in front of a door (white: tint it)
  cellar_keepclear: {
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2, k = S / 256;
      g.strokeStyle = 'rgba(245,244,238,0.95)'; g.lineWidth = 9 * k;
      g.strokeRect(10 * k, 22 * k, W - 20 * k, S - 44 * k);
      word(g, 'KEEP CLEAR', W / 2, S / 2 + 3 * k, 92 * k, 'rgba(245,244,238,0.95)', 900, 'Impact, "Arial Narrow", sans-serif');
      wearOut(g, W, S, r, 260);
    },
  },
  // a centre circle in masking tape, laid by hand (the lab's pitch)
  cellar_tapering: {
    span: [2, 2],
    draw(g, S, r) {
      const W = S * 2, k = S / 256, R = W * 0.43;
      g.lineCap = 'butt';
      // strips of tape, each a little off the true circle, overlapping
      for (let a = 0; a < PI * 2; a += 0.32) {
        const a1 = a + 0.36 + r() * 0.04, rr = R + (r() - 0.5) * 3 * k;
        g.strokeStyle = `rgba(${226 + r() * 14 | 0},${222 + r() * 12 | 0},${204 + r() * 10 | 0},0.96)`;
        g.lineWidth = 11 * k;
        g.beginPath(); g.arc(W / 2, W / 2, rr, a, a1); g.stroke();
      }
      // scuffed where the wheels cross it
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.8})`; g.fillRect(r() * W, r() * W, (4 + r() * 16) * k, (2 + r() * 5) * k); }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(230,226,208,0.95)'; g.fillRect(W / 2 - 7 * k, W / 2 - 7 * k, 14 * k, 14 * k); // the spot
    },
  },
  // the floor number, stencilled big where the corridor starts
  cellar_b1: {
    draw(g, S, r) {
      const k = S / 256;
      word(g, 'B-1', S / 2, S / 2 + 6 * k, 150 * k, 'rgba(245,244,238,0.95)', 900, 'Impact, "Arial Narrow", sans-serif');
      wearOut(g, S, S, r, 200);
    },
  },
  // a rust bloom where a drum or a pipe has wept onto the concrete
  cellar_rust: {
    draw(g, S, r) {
      for (let i = 0; i < 16; i++) blob(g, S * (0.25 + r() * 0.5), S * (0.25 + r() * 0.5), S * (0.06 + r() * 0.2), S * (0.05 + r() * 0.16), r() < 0.5 ? '120,62,28' : '92,48,24', 0.4, 0, r() * 3);
      for (let i = 0; i < 30; i++) blob(g, S * (0.1 + r() * 0.8), S * (0.1 + r() * 0.8), S * 0.02, S * 0.015, '140,74,30', 0.5);
      // the ring the drum stood in
      g.strokeStyle = 'rgba(78,40,20,0.55)'; g.lineWidth = S * 0.025;
      g.beginPath(); g.arc(S * 0.5, S * 0.5, S * 0.36, 0.3, 5.6); g.stroke();
    },
  },
  // salt and damp: a pale tide line where water sat against a wall
  cellar_tide: {
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2;
      for (let i = 0; i < 40; i++) blob(g, r() * W, S * (0.35 + r() * 0.4), S * (0.08 + r() * 0.16), S * (0.04 + r() * 0.08), '214,220,206', 0.28);
      g.strokeStyle = 'rgba(200,206,190,0.5)'; g.lineWidth = S * 0.02;
      g.beginPath(); g.moveTo(0, S * 0.3);
      for (let x = 0; x <= W; x += S * 0.1) g.lineTo(x, S * (0.3 + (r() - 0.5) * 0.1));
      g.stroke();
      for (let i = 0; i < 24; i++) blob(g, r() * W, S * (0.55 + r() * 0.3), S * 0.06, S * 0.04, '40,44,38', 0.3);
    },
  },
  // an anti-fatigue mat's face: honeycomb holes in black rubber
  cellar_honey: {
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = 'rgba(58,60,62,1)'; g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(8,8,9,1)';
      const R = 11 * k;
      for (let y = 0, row = 0; y < S + R; y += R * 1.55, row++) {
        for (let x = (row % 2) * R * 0.9; x < S + R; x += R * 1.8) {
          g.beginPath();
          for (let a = 0; a < 6; a++) g.lineTo(x + Math.cos(a * PI / 3) * R * 0.66, y + Math.sin(a * PI / 3) * R * 0.66);
          g.fill();
        }
      }
    },
  },
  // archive box label: a printed slip, a year, a department, a barcode
  cellar_boxlbl: {
    draw(g, S, r) {
      const k = S / 256;
      g.fillStyle = '#f4f1e6'; g.fillRect(S * 0.1, S * 0.2, S * 0.8, S * 0.6);
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 3 * k; g.strokeRect(S * 0.1, S * 0.2, S * 0.8, S * 0.6);
      word(g, `${1998 + ((r() * 13) | 0)}`, S / 2, S * 0.36, 44 * k, '#1d1d1d', 800);
      word(g, pick(['FINANCE', 'HR', 'LEGAL', 'IT', 'SALES'], r), S / 2, S * 0.54, 28 * k, '#2f4f7e', 800);
      for (let x = S * 0.2; x < S * 0.8; x += 5 * k) if (r() < 0.6) { g.fillStyle = '#111'; g.fillRect(x, S * 0.64, (1 + r() * 3) * k, S * 0.1); }
    },
  },
  // a hazard triangle with a lightning bolt (batteries, the UPS)
  cellar_volts: {
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#16181b';
      g.beginPath(); g.moveTo(S / 2, S * 0.08); g.lineTo(S * 0.94, S * 0.86); g.lineTo(S * 0.06, S * 0.86); g.closePath(); g.fill();
      g.fillStyle = '#f07d25';
      g.beginPath(); g.moveTo(S / 2, S * 0.2); g.lineTo(S * 0.84, S * 0.8); g.lineTo(S * 0.16, S * 0.8); g.closePath(); g.fill();
      g.fillStyle = '#16181b';
      g.beginPath(); g.moveTo(S * 0.53, S * 0.34); g.lineTo(S * 0.4, S * 0.58); g.lineTo(S * 0.5, S * 0.58); g.lineTo(S * 0.45, S * 0.76);
      g.lineTo(S * 0.62, S * 0.5); g.lineTo(S * 0.52, S * 0.5); g.lineTo(S * 0.6, S * 0.34); g.closePath(); g.fill();
      g.lineWidth = 2 * k;
    },
  },
  // an asset tag: "WIPED" in marker on a strip of masking tape
  cellar_wiped: {
    draw(g, S, r) {
      const k = S / 256;
      g.fillStyle = '#e9dfc2'; g.save(); g.translate(S / 2, S / 2); g.rotate((r() - 0.5) * 0.2);
      g.fillRect(-S * 0.44, -S * 0.16, S * 0.88, S * 0.32);
      word(g, pick(['WIPED', 'DEAD', 'SPARES?', 'DO NOT USE'], r), 0, 4 * k, 46 * k, '#1d2a6b', 700, '"Comic Sans MS", "Marker Felt", cursive');
      g.restore();
    },
  },
};

// ------------------------------------------------------------ clutter
export const CLUTTER_KINDS = {
  // =================================================== LOW (side bands)
  // A rubber cable ramp carrying a run of cables across or along the floor:
  // 50 cm wide, 5 cm tall, a dark lid (or hazard orange) jointed every
  // 90 cm, cables spilling out of both ends. len runs along the kind's x.
  cellar_ramp: {
    size: (o) => [o.len || 1.8, 0.05, 0.5],
    collide: 'low',
    colliders(o) {
      const L = (o.len || 1.8) / 2;
      const prof = [[0, -0.25], [0, 0.25], [0.05, 0.09], [0.05, -0.09]];
      return [{ hull: [-L, L].flatMap((x) => prof.map(([y, z]) => [x, y, z])) }];
    },
    build(p, o, r) {
      const L = o.len || 1.8;
      const lid = o.lid || '#3a3d42';
      // the body in 90 cm sections, each a trapezoid prism; a lid strip
      const n = Math.max(1, Math.round(L / 0.9)), s = L / n;
      const hump = extrude(`cellarramp${s.toFixed(3)}`, shape([[-0.25, 0], [0.25, 0], [0.09, 0.05], [-0.09, 0.05]]), s - 0.006, 0);
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * s;
        add(p, 'rubber', hump, [x, 0, 0], [0, PI / 2, 0]);
        p.add('tint', box(s - 0.012, 0.004, 0.17), [x, 0.051, 0], null, null, lid);
        // hazard chevrons on the slopes, both sides
        if (o.hazard) for (const sd of [-1, 1]) p.decal('hazard', s - 0.04, 0.11, [x, 0.026, sd * 0.17], [sd * -1.26, sd < 0 ? PI : 0, 0], 0.9, '#f07d25');
      }
      // the ramp's end cables, fanned out
      if (o.cables !== false) {
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
          const z0 = (k - 1) * 0.045;
          floorCable(p, [[sx * L / 2, z0], [sx * (L / 2 + 0.2), z0 + 0.03 * sx], [sx * (L / 2 + 0.45 + r() * 0.2), z0 * 2.5 + (r() - 0.5) * 0.1]], CABLES[k + (o.seed || 0) % 2], k, false);
        }
      }
    },
  },
  // An anti-fatigue mat: 3 cm of honeycomb rubber, bevelled all round (in
  // front of a counter, a bench, a machine you stand at).
  cellar_mat: {
    size: (o) => [o.w || 1.2, 0.03, o.d || 0.8],
    collide: 'low',
    colliders: (o) => [{ hull: slabHull(o.w || 1.2, o.d || 0.8, 0.03, 0.04) }],
    build(p, o) {
      const w = o.w || 1.2, d = o.d || 0.8;
      add(p, 'rubber', rbox(w, 0.03, d, 0.014, 2), [0, 0.015, 0]);
      p.decal('cellar_honey', w - 0.08, d - 0.08, [0, 0.0305, 0], [-PI / 2, 0, 0], 0.95);
      if (o.edge) for (const sz of [-1, 1]) p.add('tint', box(w - 0.06, 0.004, 0.035), [0, 0.028, sz * (d / 2 - 0.02)], [sz * 0.5, 0, 0], null, o.edge);
    },
  },
  // An anti-static bench mat run out along the floor: 5 mm of blue-grey
  // vinyl with its earthing lead to a stud. Flat — the pitch can take it.
  cellar_esdmat: {
    size: (o) => [o.w || 2.0, 0.005, o.d || 0.6],
    collide: 'none',
    build(p, o, r) {
      const w = o.w || 2.0, d = o.d || 0.6;
      p.add('tint', rbox(w, 0.005, d, 0.002, 1), [0, 0.0025, 0], [0, (r() - 0.5) * 0.02, 0], null, o.color || '#5d7486');
      p.decal('scuff', w * 0.6, d * 0.8, [w * 0.1, 0.0056, 0], [-PI / 2, 0, 0.3], 0.5);
      p.add('tint', cyl(0.012, 0.012, 0.01, 8), [w / 2 - 0.08, 0.008, -d / 2 + 0.08], null, null, '#c9a24a');
      floorCable(p, [[w / 2 - 0.08, -d / 2 + 0.08], [w / 2 + 0.1, -d / 2 - 0.02], [w / 2 + 0.2, -d / 2 - 0.15]], '#2a8a4a', 1, false);
    },
  },
  // Raised-floor tiles lifted out and left lying: 600 × 600, 33 mm each —
  // one flat (n: 1), or a second on top for off-lane stacks (n: 2).
  cellar_floortile: {
    size: (o) => [0.62, 0.034 * (o.n || 1), 0.62],
    collide: 'low',
    colliders: (o) => [{ hull: slabHull(0.6, 0.6, 0.034 * (o.n || 1), 0.01) }],
    build(p, o, r) {
      const n = o.n || 1;
      for (let i = 0; i < n; i++) {
        const yaw = (r() - 0.5) * 0.3, y = i * 0.034;
        p.at([(r() - 0.5) * 0.04, y, (r() - 0.5) * 0.04], [0, yaw, 0], () => {
          add(p, 'powderGrey', rbox(0.6, 0.03, 0.6, 0.004, 1), [0, 0.015, 0]);
          add(p, 'plasticGrey', box(0.58, 0.003, 0.58), [0, 0.0315, 0], null, null, '#aab1b4');
          add(p, 'plasticBlack', box(0.6, 0.004, 0.02), [0, 0.031, 0.29]); // the edge trim
        });
      }
    },
  },
  // Flattened cartons in a slithering pile, strapped once: 4 cm.
  cellar_flatcard: {
    size: (o) => [o.w || 1.0, 0.04, o.d || 0.7],
    collide: 'low',
    colliders: (o) => [{ hull: slabHull(o.w || 1.0, o.d || 0.7, 0.04, 0.05) }],
    build(p, o, r) {
      const w = o.w || 1.0, d = o.d || 0.7;
      for (let i = 0; i < 6; i++) {
        const sw = w * (0.75 + r() * 0.2), sd = d * (0.7 + r() * 0.25);
        p.add('tint', box(sw, 0.005, sd), [(r() - 0.5) * (w - sw), 0.0035 + i * 0.006, (r() - 0.5) * (d - sd)], [0, (r() - 0.5) * 0.25, 0], null, pick(CARD, r));
        if (r() < 0.5) p.decal('tape', sw * 0.9, 0.1, [(r() - 0.5) * 0.1, 0.0068 + i * 0.006, (r() - 0.5) * sd * 0.5], [-PI / 2, 0, (r() - 0.5) * 0.2], 0.85, '#c9a26a');
      }
      p.add('tint', box(0.025, 0.004, d * 0.95), [w * 0.2, 0.039, 0], null, null, '#2f5f9e'); // the strap
    },
  },
  // A drift of dead input devices: keyboards, a mouse or two, their cables.
  // Nothing over 4.5 cm; you plough through the edge of it.
  cellar_keyheap: {
    size: (o) => [o.w || 0.9, 0.045, o.d || 0.6],
    collide: 'low',
    colliders: (o) => [{ hull: slabHull(o.w || 0.9, o.d || 0.6, 0.035, 0.12) }],
    build(p, o, r) {
      const w = o.w || 0.9, d = o.d || 0.6;
      for (let i = 0; i < (o.n || 5); i++) {
        const c = r() < 0.6 ? pick(BEIGE, r) : '#26282c';
        const x = (r() - 0.5) * (w - 0.42), z = (r() - 0.5) * (d - 0.2), y = r() < 0.35 ? 0.018 : 0;
        p.at([x, y, z], [(r() - 0.5) * 0.12, r() * PI, (r() - 0.5) * 0.12], () => {
          p.add('tint', rbox(0.44, 0.022, 0.15, 0.006, 1), [0, 0.012, 0], null, null, c);
          add(p, c === '#26282c' ? 'plasticGrey' : 'plasticBlack', box(0.4, 0.004, 0.11), [0, 0.024, 0.005]);
          floorCable(p, [[0, -0.08], [0.05 + r() * 0.1, -0.2], [-0.1 + r() * 0.2, -0.3]], c === '#26282c' ? '#1b1c1f' : '#bdb49c', i, false);
        });
      }
      for (let i = 0; i < 2; i++) p.add('tint', sphere(0.03, 10, 6), [(r() - 0.5) * w * 0.7, 0.012, (r() - 0.5) * d * 0.7], null, [1, 0.6, 1.8], pick(BEIGE, r));
    },
  },

  // ==================================================== TALL (at walls)
  // Steel drums, one to three in a row (o.n), sealed, labelled: oil,
  // glycol, whatever the boiler man left. Their backs to the wall.
  cellar_drums: {
    size: (o) => [0.62 * (o.n || 2), 0.9, 0.62],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 2;
      for (let i = 0; i < n; i++) {
        const c = o.color || pick(DRUMS, r);
        const x = (i - (n - 1) / 2) * 0.62 + (r() - 0.5) * 0.03;
        p.at([x, 0, (r() - 0.5) * 0.04], [0, r() * PI, 0], () => {
          p.add('trim', lathe([[0, 0], [0.285, 0], [0.29, 0.02], [0.29, 0.27], [0.298, 0.285], [0.29, 0.3], [0.29, 0.58], [0.298, 0.595], [0.29, 0.61], [0.29, 0.86], [0.295, 0.88], [0.285, 0.885], [0, 0.885]], 22), [0, 0, 0], null, null, c);
          add(p, 'chrome', cyl(0.03, 0.03, 0.012, 10), [0.17, 0.89, 0.05]);
          if (r() < 0.6) p.decal('cellar_volts', 0.2, 0.2, [0, 0.45, 0.292]);
        });
        // a rust ring where it stood before
        p.decal('cellar_rust', 0.8, 0.8, [x + 0.08, 0.002, 0.1], [-PI / 2, 0, r() * 6], 0.6);
      }
    },
  },
  // Archive boxes: o.cols × o.rows banker's boxes, lids on, labelled on the
  // end that faces out; the top row a little skew.
  cellar_archive: {
    size: (o) => [0.34 * (o.cols || 2) + 0.02, 0.27 * (o.rows || 2), 0.42],
    collide: 'box',
    build(p, o, r) {
      const cols = o.cols || 2, rows = o.rows || 2;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (j === rows - 1 && i === cols - 1 && o.gap) continue;
        const x = (i - (cols - 1) / 2) * 0.345, y = j * 0.27;
        const yaw = (r() - 0.5) * (j ? 0.14 : 0.04);
        const c = pick(['#d9ceb4', '#cfc3a4', '#ddd4bd', '#c5b797'], r);
        p.at([x + (r() - 0.5) * 0.02, y, (r() - 0.5) * 0.03], [0, yaw, 0], () => {
          p.add('tint', box(0.33, 0.24, 0.4), [0, 0.12, 0], null, null, c);
          p.add('tint', box(0.345, 0.035, 0.415), [0, 0.2525, 0], null, null, c); // the lid
          add(p, 'plasticBlack', box(0.08, 0.025, 0.004), [0, 0.2, 0.2015]); // the hand hole
          p.decal('cellar_boxlbl', 0.14, 0.12, [0, 0.12, 0.2015], null, 0.95);
        });
      }
    },
  },
  // Dead CRT monitors, stacked two or three high, screens every which way.
  cellar_crts: {
    size: (o) => [0.42 * (o.cols || 2), 0.38 * (o.rows || 2), 0.44],
    collide: 'box',
    build(p, o, r) {
      const cols = o.cols || 2, rows = o.rows || 2;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols - (j === rows - 1 && o.gap ? 1 : 0); i++) {
        const c = pick(BEIGE, r);
        const x = (i - (cols - 1) / 2) * 0.42, y = j * 0.37;
        const turned = r() < 0.3;
        p.at([x + (r() - 0.5) * 0.03, y, (r() - 0.5) * 0.03], [0, (turned ? PI : 0) + (r() - 0.5) * 0.3, 0], () => {
          p.add('tint', rbox(0.39, 0.34, 0.2, 0.02, 1), [0, 0.17, 0.1], null, null, c); // the bezel box
          p.add('tint', rbox(0.3, 0.26, 0.2, 0.04, 1), [0, 0.16, -0.08], null, null, c); // the tube's back
          add(p, 'glassClear', box(0.3, 0.24, 0.004), [0, 0.18, 0.2005]);
          add(p, 'plasticBlack', box(0.3, 0.24, 0.002), [0, 0.18, 0.199]);
          if (r() < 0.4) p.decal('cellar_wiped', 0.14, 0.14, [0.08, 0.3, 0.202], null, 0.95);
        });
      }
    },
  },
  // Beige PC towers in a row against the wall, one lying down in front.
  cellar_towers: {
    size: (o) => [0.22 * (o.n || 4), 0.44, 0.5],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 4;
      for (let i = 0; i < n; i++) {
        const c = r() < 0.75 ? pick(BEIGE, r) : '#2a2c30';
        const x = (i - (n - 1) / 2) * 0.22;
        p.at([x, 0, (r() - 0.5) * 0.05], [0, (r() - 0.5) * 0.12, 0], () => {
          p.add('tint', rbox(0.18, 0.42, 0.44, 0.008, 1), [0, 0.21, 0], null, null, c);
          add(p, 'plasticGrey', box(0.14, 0.05, 0.004), [0, 0.35, 0.221]); // the drive bay
          add(p, 'plasticBlack', box(0.14, 0.012, 0.004), [0, 0.28, 0.221]);
          if (r() < 0.5) p.decal('cellar_wiped', 0.12, 0.12, [0, 0.18, 0.222], null, 0.95);
        });
      }
    },
  },
  // Empty pallets, stacked (o.n high): deck boards, three stringers.
  cellar_pallets: {
    size: (o) => [1.2, 0.145 * (o.n || 4), 1.0],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 4;
      for (let k = 0; k < n; k++) {
        const wood = pick(['#b59466', '#a78658', '#c2a276', '#9b7c52'], r);
        p.at([(r() - 0.5) * 0.06, k * 0.145, (r() - 0.5) * 0.06], [0, (r() - 0.5) * 0.06, 0], () => {
          for (let i = 0; i < 7; i++) p.add('tint', box(1.2, 0.022, 0.1), [0, 0.134, -0.45 + i * 0.15], null, null, wood);
          for (const z of [-0.45, 0, 0.45]) p.add('tint', box(1.2, 0.1, 0.1), [0, 0.072, z], null, null, wood);
          for (let i = 0; i < 3; i++) p.add('tint', box(0.1, 0.022, 1.0), [-0.55 + i * 0.55, 0.011, 0], null, null, wood);
        });
      }
    },
  },
  // A wooden cable drum on its edge, half a drum of steel-wire armoured
  // cable still on it.
  cellar_drum: {
    size: [0.46, 0.8, 0.8],
    collide: 'box',
    build(p, o, r) {
      const R = 0.4;
      p.at([0, R, 0], [0, 0, PI / 2], () => {
        for (const s of [-1, 1]) p.add('tint', cyl(R, R, 0.04, 20), [0, s * 0.2, 0], null, null, '#a8865a');
        p.add('tint', cyl(0.13, 0.13, 0.38, 14), [0, 0, 0], null, null, '#8f7048');
        p.add('tint', cyl(0.28, 0.28, 0.36, 18), [0, 0, 0], null, null, o.cable || '#1e1f22');
        p.add('tint', cyl(0.05, 0.05, 0.44, 10), [0, 0, 0], null, null, '#3a2e22');
      });
      p.add('tint', tube([[0.1, 0.12, 0.28], [0.12, 0.02, 0.4], [0.05, 0.01, 0.7]], 0.012, 6, true, 16), [0, 0, 0], null, null, o.cable || '#1e1f22');
    },
  },
  // An aluminium stepladder, folded, leaning on the wall.
  cellar_ladder: {
    size: [0.5, 1.8, 0.3],
    collide: 'box',
    colliders: () => [{ box: [0.5, 1.8, 0.25], at: [0, 0.9, -0.02] }],
    build(p) {
      const lean = 0.12;
      p.at([0, 0, 0.1], [-lean, 0, 0], () => {
        for (const s of [-1, 1]) p.add('trim', box(0.05, 1.8, 0.022), [s * 0.22, 0.9, 0], null, null, '#b7bcc0');
        for (let y = 0.3; y < 1.7; y += 0.28) p.add('trim', box(0.42, 0.02, 0.07), [0, y, 0.02], null, null, '#a9aeb2');
        p.add('tint', rbox(0.5, 0.05, 0.1, 0.01, 1), [0, 1.8, 0.02], null, null, '#8e2f26');
        for (const s of [-1, 1]) add(p, 'rubber', box(0.06, 0.03, 0.04), [s * 0.22, 0.015, 0]);
      });
    },
  },
  // The boiler's pipework at the wall base: flow and return, lagged, on
  // saddle stands, a gate valve with a red wheel, a gauge. len along x.
  cellar_pipes: {
    size: (o) => [o.len || 2.4, 0.5, 0.3],
    collide: 'box',
    build(p, o, r) {
      const L = o.len || 2.4;
      const ys = [0.16, 0.36];
      ys.forEach((y, i) => {
        const rad = i ? 0.055 : 0.07;
        p.add(i ? 'trim' : 'tint', cyl(rad, rad, L, 14), [0, y, 0.02], [0, 0, PI / 2], null, i ? '#8e2f26' : '#c8cbc6');
        // the lagging's aluminium bands
        if (!i) for (let x = -L / 2 + 0.2; x < L / 2; x += 0.45) add(p, 'chrome', cyl(rad + 0.004, rad + 0.004, 0.02, 14), [x, y, 0.02], [0, 0, PI / 2]);
      });
      for (let x = -L / 2 + 0.25; x < L / 2; x += 0.9) {
        add(p, 'powderBlack', box(0.04, 0.42, 0.06), [x, 0.21, -0.1]);
        for (const y of ys) add(p, 'powderBlack', box(0.04, 0.02, 0.18), [x, y - 0.075, -0.04]);
      }
      // a gate valve on the return, its wheel facing out
      const vx = (r() - 0.5) * L * 0.4;
      p.add('trim', cyl(0.07, 0.07, 0.16, 12), [vx, 0.36, 0.02], [0, 0, PI / 2], null, '#3d4a44');
      p.add('trim', cyl(0.018, 0.018, 0.14, 8), [vx, 0.36, 0.1], [PI / 2, 0, 0], null, '#3d4a44');
      p.add('trim', torus(0.07, 0.01, 6, 20), [vx, 0.36, 0.17], null, null, '#c0271f');
      // a pressure gauge on a stub
      add(p, 'chrome', cyl(0.01, 0.01, 0.1, 8), [vx + 0.5, 0.22, 0.02]);
      add(p, 'chrome', cyl(0.045, 0.045, 0.03, 16), [vx + 0.5, 0.29, 0.02], [PI / 2, 0, 0]);
      add(p, 'paper', cyl(0.038, 0.038, 0.004, 16), [vx + 0.5, 0.29, 0.037], [PI / 2, 0, 0]);
    },
  },
  // An expansion vessel: a red tank on three legs, a flexible hose to the
  // flow pipe.
  cellar_tank: {
    size: [0.5, 0.95, 0.5],
    collide: 'box',
    build(p) {
      p.add('trim', lathe([[0, 0.18], [0.12, 0.2], [0.2, 0.26], [0.22, 0.34], [0.22, 0.72], [0.2, 0.8], [0.12, 0.86], [0, 0.88]], 20), [0, 0, 0], null, null, '#b8322a');
      for (let i = 0; i < 3; i++) {
        const a = i * 2.09;
        add(p, 'powderBlack', cyl(0.012, 0.012, 0.24, 6), [Math.cos(a) * 0.15, 0.11, Math.sin(a) * 0.15], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]);
      }
      add(p, 'chrome', cyl(0.02, 0.02, 0.06, 8), [0, 0.91, 0]);
      p.add('tint', tube([[0, 0.94, 0], [0, 1.0, -0.05], [0, 0.9, -0.2], [0, 0.4, -0.24]], 0.012, 6, true, 12), [0, 0, 0], null, null, '#1b1c1f');
      p.decal('cellar_volts', 0.12, 0.12, [0, 0.55, 0.222], null, 0.9);
    },
  },
  // Black sacks, tied, slumped against each other.
  cellar_bags: {
    size: (o) => [0.5 * (o.n || 3) * 0.8 + 0.2, 0.55, 0.55],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 3;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.4 + (r() - 0.5) * 0.06;
        const h = 0.42 + r() * 0.12, c = r() < 0.8 ? '#1d1f22' : '#39506b';
        p.add('tint', bush(0.26, 1, (i * 3 + 2) % 7), [x, h * 0.45, (r() - 0.5) * 0.08], [0, r() * 6, 0], [1, h / 0.52, 0.95], c);
        p.add('tint', cyl(0.02, 0.05, 0.08, 7), [x, h * 0.9, 0], [0, 0, (r() - 0.5) * 0.4], null, c); // the tied neck
      }
    },
  },
  // UPS batteries out of service: black blocks stacked on a pallet board.
  cellar_batteries: {
    size: (o) => [0.8, 0.44, 0.5],
    collide: 'box',
    build(p, o, r) {
      p.add('tint', box(0.8, 0.04, 0.5), [0, 0.02, 0], null, null, '#a78658');
      for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
        if (j && i === 2 && r() < 0.7) continue;
        const x = -0.26 + i * 0.26 + (r() - 0.5) * 0.02, y = 0.04 + j * 0.2;
        p.at([x, y, (r() - 0.5) * 0.03], [0, (r() - 0.5) * 0.08, 0], () => {
          add(p, 'plasticBlack', rbox(0.24, 0.18, 0.4, 0.008, 1), [0, 0.09, 0]);
          for (const s of [-1, 1]) p.add('tint', cyl(0.012, 0.012, 0.015, 8), [s * 0.07, 0.19, 0.12], null, null, s < 0 ? '#c0271f' : '#26282c');
          p.decal('cellar_volts', 0.09, 0.09, [0, 0.1, 0.2015], null, 0.95);
        });
      }
    },
  },
  // Decommissioned rack servers stacked like pizza boxes on the floor.
  cellar_servers: {
    size: (o) => [0.48, 0.045 * (o.n || 5) + 0.01, 0.75],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 5;
      for (let i = 0; i < n; i++) {
        const u = r() < 0.3 ? 2 : 1, y = i * 0.045;
        p.at([(r() - 0.5) * 0.03, y, (r() - 0.5) * 0.04], [0, (r() - 0.5) * 0.1, 0], () => {
          add(p, 'powderGrey', box(0.44, 0.043 * u * 0.95, 0.7), [0, 0.021 * u, 0]);
          add(p, 'powderBlack', box(0.48, 0.043 * u * 0.95, 0.02), [0, 0.021 * u, 0.36]); // the ears and bezel
          add(p, 'louvre', box(0.3, 0.03 * u * 0.8, 0.004), [-0.04, 0.021 * u, 0.371]);
        });
        if (u === 2) i++;
      }
      p.decal('cellar_wiped', 0.12, 0.12, [0.12, 0.1, 0.372], null, 0.95);
    },
  },
  // A pedestal fan aimed at the racks: the air-con can't keep up.
  cellar_fan: {
    size: [0.45, 1.3, 0.45],
    collide: 'box',
    colliders: () => [{ box: [0.4, 1.3, 0.4], at: [0, 0.65, 0] }],
    build(p) {
      add(p, 'plasticWhite', lathe([[0, 0.002], [0.2, 0], [0.205, 0.02], [0.18, 0.04], [0.03, 0.05], [0, 0.05]], 20));
      add(p, 'chrome', cyl(0.014, 0.014, 0.95, 8), [0, 0.52, 0]);
      p.at([0, 1.08, 0], [-0.1, 0, 0], () => {
        add(p, 'plasticWhite', rbox(0.12, 0.14, 0.18, 0.03, 2), [0, 0, -0.08]);
        add(p, 'chrome', torus(0.2, 0.006, 5, 28), [0, 0, 0.04]);
        for (let i = 0; i < 10; i++) add(p, 'chrome', box(0.4, 0.003, 0.003), [0, 0, 0.05], [0, 0, i * PI / 10]);
        for (let i = 0; i < 3; i++) p.add('tint', box(0.16, 0.06, 0.004), [Math.cos(i * 2.09) * 0.08, Math.sin(i * 2.09) * 0.08, 0.02], [0, 0.3, i * 2.09], null, '#6fa0c8');
        add(p, 'plasticWhite', sphere(0.03, 10, 6), [0, 0, 0.03]);
      });
    },
  },
  // Traffic cones by the shutter, one knocked over.
  cellar_cones: {
    size: (o) => [0.4 * (o.n || 2), 0.5, 0.4],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 2;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.4;
        const down = o.down === i;
        p.at([x, down ? 0.12 : 0, 0], down ? [0, r() * 6, PI / 2 - 0.15] : [0, r() * 6, 0], () => {
          p.add('tint', box(0.34, 0.03, 0.34), [0, 0.015, 0], null, null, '#1d1f22');
          p.add('tint', cyl(0.025, 0.14, 0.46, 16), [0, 0.26, 0], null, null, '#e8612a');
          add(p, 'plasticWhite', cyl(0.07, 0.095, 0.08, 16), [0, 0.24, 0]);
        });
      }
    },
  },
  // Water-cooler refills: blue-tinted 19-litre bottles in their rack.
  cellar_water: {
    size: [0.7, 1.05, 0.34],
    collide: 'box',
    build(p, o, r) {
      for (const s of [-1, 1]) {
        add(p, 'powderGrey', box(0.03, 1.05, 0.34), [s * 0.335, 0.525, 0]);
      }
      for (let j = 0; j < 3; j++) {
        add(p, 'powderGrey', box(0.67, 0.02, 0.34), [0, 0.02 + j * 0.34, 0]);
        for (let i = 0; i < 2; i++) {
          if (r() < 0.2) continue;
          p.at([(i - 0.5) * 0.32, 0.17 + j * 0.34, 0], [PI / 2, 0, 0], () => {
            p.add('tint', lathe([[0, -0.2], [0.13, -0.19], [0.14, -0.1], [0.14, 0.12], [0.06, 0.18], [0.03, 0.2], [0, 0.2]], 14), [0, 0, 0], null, null, '#8fbfd6');
            p.add('tint', cyl(0.035, 0.035, 0.03, 10), [0, 0.215, 0], null, null, '#2f6fb5'); // the cap
          });
        }
      }
    },
  },
};

// Wall-base bands by wall style. The block walls already carry their conduit
// and sockets (cellar-set.js); the band adds vents and scuffs, a little
// denser than it was, and scuffs on the server hall's glazed kick rail.
export const BANDS = {
  cellar_block: { vents: 5, scuffs: 1.6 },
  cellar_glass: { scuffs: 3 },
};
