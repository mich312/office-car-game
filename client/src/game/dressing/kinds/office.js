// The office floor's own dressing kinds, and the wall-base band its plain
// walls get (architecture.js). The shared kit (kinds/common.js) covers most
// of what an office has on its floor; these are the ones only an office has:
// what makes each room itself at a car's eye height — the waiting chairs
// and the roll-up banner in reception, the pallets in storage, the stools
// at the café bar, the arcade cabinet, the CEO's putting green, the
// server room's cooling unit and crash cart, the barbecue on the terrace.
//
// Every part is in a material the office's static batch already draws
// (tint / fabric: colour per vertex), so none of them costs a draw call;
// their prints ride in the map's one decal mesh (DECAL_KINDS below).
import { rbox, box, cyl, lathe, tube, torus, sphere, extrude, shape, card } from '../../kit.js';
import { atlasRect } from '../../textures.js';
import { pick, floorCable, crumple } from './common.js';

const PI = Math.PI;

// A side panel profile [[z, y], …] (z forward) extruded t across, centred
// on x: arcade cabinets, deck-chair frames.
const side = (key, zy, t) => extrude(key, shape(zy.map(([z, y]) => [-z, y])), t);

export const CLUTTER_KINDS = {
  // Cartons of copier paper, five reams a box, stacked by the printers.
  copierpaper: {
    size: (o) => [0.46, 0.27 * (o.n || 2), 0.31],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 2;
      for (let i = 0; i < n; i++) {
        p.at([(r() - 0.5) * 0.02, i * 0.27, (r() - 0.5) * 0.02], [0, (r() - 0.5) * 0.08, 0], () => {
          p.add('cardboard', rbox(0.44, 0.26, 0.3, 0.004, 1), [0, 0.13, 0]);
          p.add('paper', box(0.445, 0.06, 0.305), [0, 0.2, 0], null, null, '#f4f2ea');
          p.decal('parcel', 0.1, 0.07, [0.12, 0.09, 0.1512]);
        });
      }
      if (o.open) p.add('paper', rbox(0.21, 0.05, 0.297, 0.004, 1), [0, 0.27 * n + 0.025, 0], [0, 0.3, 0]);
    },
  },
  // A shredder on its bin: the cutting head, the window, confetti inside.
  shredder: {
    size: [0.4, 0.62, 0.3],
    collide: 'box',
    build(p) {
      p.add('plasticBlack', rbox(0.38, 0.5, 0.28, 0.02, 1), [0, 0.25, 0]);
      p.add('glassBlack', box(0.2, 0.22, 0.004), [0, 0.24, 0.141]);
      p.add('plasticGrey', rbox(0.4, 0.1, 0.3, 0.02, 1), [0, 0.55, 0]);
      p.add('plasticBlack', box(0.26, 0.004, 0.012), [0, 0.6, 0.02]);
      p.add('ledGreen', box(0.012, 0.004, 0.012), [0.15, 0.6, 0.1]);
      p.add('paper', box(0.19, 0.12, 0.004), [0, 0.2, 0.139], null, null, '#e9e6dc');
    },
  },

  // ----------------------------------------------------------- reception
  // A waiting-room tub chair on splayed walnut legs.
  office_armchair: {
    size: [0.76, 0.8, 0.74],
    collide: 'box',
    colliders: () => [{ box: [0.72, 0.44, 0.7], at: [0, 0.22, 0] }, { box: [0.72, 0.8, 0.16], at: [0, 0.4, -0.28] }],
    build(p, o, r) {
      const c = o.color || pick(['#3f6fa8', '#c0573f', '#56606b', '#3f7d7a'], r);
      const W = 0.76, D = 0.74;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) p.add('veneerWalnut', cyl(0.018, 0.012, 0.17, 8), [sx * (W / 2 - 0.08), 0.085, sz * (D / 2 - 0.08)], [sz * 0.14, 0, -sx * 0.14]);
      }
      p.add(`fabric:${c}`, rbox(W, 0.15, D, 0.05), [0, 0.24, 0]);
      p.add(`fabric:${c}`, rbox(W - 0.26, 0.11, D - 0.22, 0.05), [0, 0.35, 0.07]);
      p.at([0, 0.56, -D / 2 + 0.09], [-0.14, 0, 0], () => p.add(`fabric:${c}`, rbox(W, 0.46, 0.15, 0.07), [0, 0, 0]));
      for (const s of [-1, 1]) p.add(`fabric:${c}`, rbox(0.13, 0.25, D - 0.08, 0.05), [s * (W / 2 - 0.065), 0.43, 0.01]);
    },
  },
  // A round pedestal side table, magazines and a cup on it.
  office_sidetable: {
    size: [0.5, 0.56, 0.5],
    collide: 'box',
    build(p, o, r) {
      p.add('powderBlack', lathe([[0, 0.002], [0.2, 0], [0.205, 0.012], [0.19, 0.022], [0, 0.026]], 20));
      p.add('powderBlack', cyl(0.022, 0.022, 0.5, 10), [0, 0.27, 0]);
      p.add('veneerOak', cyl(0.25, 0.25, 0.024, 28), [0, 0.532, 0]);
      for (let i = 0; i < 3; i++) {
        p.add('tint', box(0.21, 0.004, 0.28), [(r() - 0.5) * 0.08, 0.546 + i * 0.0045, (r() - 0.5) * 0.06], [0, (r() - 0.5) * 1.2, 0], null, pick(['#c0573f', '#3f6fa8', '#e6e4de', '#2f6e4b'], r));
      }
      if (o.cup !== false) p.add('ceramic', lathe([[0, 0], [0.035, 0], [0.04, 0.09], [0.036, 0.09], [0.031, 0.006], [0, 0.006]], 14), [0.13, 0.545, 0.1]);
    },
  },
  // A roll-up banner stand: the cassette on its feet, the pole, the print.
  office_banner: {
    size: [0.86, 2.05, 0.3],
    collide: 'box',
    colliders: () => [{ box: [0.86, 2.0, 0.22], at: [0, 1.0, 0] }],
    build(p, o) {
      p.add('aluminium', rbox(0.86, 0.075, 0.13, 0.03, 2), [0, 0.0375, 0]);
      for (const s of [-1, 1]) p.add('aluminium', rbox(0.04, 0.012, 0.3, 0.005, 1), [s * 0.36, 0.006, 0]);
      p.add('aluminium', cyl(0.008, 0.008, 1.95, 8), [0, 1.02, -0.03]);
      p.add('plasticWhite', box(0.8, 1.92, 0.004), [0, 1.035, 0]);
      p.add('aluminium', rbox(0.82, 0.022, 0.022, 0.006, 1), [0, 2.0, 0]);
      p.decal(o.print || 'office_banner', 0.8, 1.92, [0, 1.035, 0.0025]);
    },
  },
  // A showcase plinth: the company's first RC car under a glass cube.
  office_display: {
    size: [0.5, 1.27, 0.5],
    collide: 'box',
    build(p, o) {
      p.add('powderBlack', rbox(0.42, 0.05, 0.42, 0.004, 1), [0, 0.025, 0]);
      p.add('laminateWhite', rbox(0.46, 0.88, 0.46, 0.01, 1), [0, 0.49, 0]);
      p.add('veneerWalnut', rbox(0.5, 0.03, 0.5, 0.006, 1), [0, 0.945, 0]);
      p.add('glassClear', box(0.44, 0.3, 0.44), [0, 1.11, 0]);
      p.add('aluminium', rbox(0.452, 0.014, 0.452, 0.003, 1), [0, 1.266, 0]);
      const c = o.color || '#d8263a';
      p.at([0, 0.96, 0], [0, 0.6, 0], () => {
        p.add('tint', rbox(0.15, 0.04, 0.27, 0.014, 2), [0, 0.045, 0], null, null, c);
        p.add('glassBlack', rbox(0.1, 0.035, 0.11, 0.012, 1), [0, 0.078, -0.02]);
        p.add('tint', rbox(0.16, 0.012, 0.05, 0.004, 1), [0, 0.075, -0.12], null, null, '#1d1f24');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('rubber', cyl(0.028, 0.028, 0.026, 12), [sx * 0.08, 0.028, sz * 0.085], [0, 0, PI / 2]);
      });
      p.decal('office_plaque', 0.22, 0.11, [0, 0.78, 0.2305]);
    },
  },

  // ------------------------------------------------------------- storage
  // A pallet of cartons, shrink-wrapped, the top layer half picked.
  office_pallet: {
    size: (o) => [1.2, 0.14 + 0.28 * (o.n ?? 2), 0.8],
    collide: 'box',
    build(p, o, r) {
      for (const z of [-0.35, 0, 0.35]) p.add('mdf', rbox(1.2, 0.08, 0.1, 0.004, 1), [0, 0.06, z]);
      for (let i = 0; i < 7; i++) p.add('mdf', rbox(0.14, 0.022, 0.8, 0.003, 1), [-0.53 + i * 0.1767, 0.111, 0]);
      for (const x of [-0.53, 0, 0.53]) p.add('mdf', rbox(0.14, 0.02, 0.8, 0.003, 1), [x, 0.01, 0]);
      const n = o.n ?? 2;
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 2; j++) {
            if (k === n - 1 && r() < (o.gaps ?? 0.3)) continue;
            p.at([-0.39 + i * 0.39 + (r() - 0.5) * 0.02, 0.122 + k * 0.28, -0.195 + j * 0.39 + (r() - 0.5) * 0.02], [0, (r() - 0.5) * 0.06, 0], () => {
              p.add('cardboard', rbox(0.38, 0.27, 0.38, 0.004, 1), [0, 0.135, 0]);
              p.decal('tape', 0.38, 0.1, [0, 0.2712, 0], [-PI / 2, 0, PI / 2], 0.9, '#c9a26a');
              if (j === 1) p.decal(r() < 0.6 ? 'parcel' : 'fragile', 0.14, 0.1, [0.08, 0.13, 0.1912]);
            });
          }
        }
      }
      if (o.wrap !== false && n > 0) p.add('glassClear', box(1.19, 0.28 * (n - 1) + 0.2, 0.8), [0, 0.122 + (0.28 * (n - 1) + 0.2) / 2, 0]);
    },
  },
  // A folded stepladder leaning back against the wall.
  office_ladder: {
    size: [0.48, 1.72, 0.3],
    collide: 'box',
    build(p) {
      p.at([0, 0, 0.1], [-0.15, 0, 0], () => {
        for (const s of [-1, 1]) {
          p.add('aluminium', rbox(0.035, 1.7, 0.07, 0.006, 1), [s * 0.2, 0.85, 0]);
          p.add('rubber', rbox(0.05, 0.03, 0.08, 0.006, 1), [s * 0.2, 0.015, 0]);
        }
        for (let i = 0; i < 5; i++) p.add('aluminium', rbox(0.37, 0.02, 0.09, 0.004, 1), [0, 0.3 + i * 0.28, 0.012]);
        p.add('plasticGrey', rbox(0.44, 0.07, 0.15, 0.012, 1), [0, 1.69, 0.02]);
      });
    },
  },
  // Plastic stacking chairs, five high.
  office_chairstack: {
    size: (o) => [0.5, 0.82 + 0.055 * ((o.n || 5) - 1), 0.55],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 5, c = o.color || pick(['#c0573f', '#2f5f9e', '#e6e4de', '#3a3d42'], r);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) p.add('chrome', cyl(0.009, 0.009, 0.46, 6), [sx * 0.2, 0.23, sz * 0.2], [sz * 0.06, 0, -sx * 0.06]);
      }
      for (let i = 0; i < n; i++) {
        p.at([0, 0.46 + i * 0.055, (r() - 0.5) * 0.012], [0, (r() - 0.5) * 0.05, 0], () => {
          p.add('tint', rbox(0.44, 0.022, 0.42, 0.02, 1), [0, 0, 0.02], null, null, c);
          p.at([0, 0.2, -0.2], [-0.15, 0, 0], () => p.add('tint', rbox(0.42, 0.34, 0.022, 0.02, 1), [0, 0, 0], null, null, c));
          for (const sx of [-1, 1]) p.add('chrome', cyl(0.008, 0.008, 0.07, 6), [sx * 0.2, -0.035, 0.19]);
        });
      }
    },
  },
  // A cable drum on its side, a tail of cable off it.
  office_spool: {
    size: (o) => [(o.r || 0.25) * 2, (o.r || 0.25) * 2, 0.36],
    collide: 'box',
    build(p, o) {
      const R = o.r || 0.25, c = o.color || '#2f5f9e';
      p.at([0, R, 0], [PI / 2, 0, 0], () => {
        for (const s of [-1, 1]) p.add('mdf', cyl(R, R, 0.024, 24), [0, s * 0.165, 0]);
        p.add('tint', cyl(R * 0.74, R * 0.74, 0.31, 24), [0, 0, 0], null, null, c);
        p.add('powderBlack', cyl(0.035, 0.035, 0.37, 10), [0, 0, 0]);
      });
      floorCable(p, [[R * 0.7, 0.05], [R + 0.12, 0.1], [R + 0.4, 0.04], [R + 0.6, 0.12]], c, 0, false);
    },
  },
  // Archive boxes, two or three high, a year on every label.
  office_archive: {
    size: (o) => [0.345 * (o.cols || 2), 0.26 * (o.h || 2), 0.4],
    collide: 'box',
    build(p, o, r) {
      const cols = o.cols || 2, h = o.h || 2;
      for (let i = 0; i < cols; i++) {
        for (let k = 0; k < h; k++) {
          if (k === h - 1 && cols > 1 && r() < 0.3) continue;
          p.at([(i - (cols - 1) / 2) * 0.345 + (r() - 0.5) * 0.02, k * 0.26, (r() - 0.5) * 0.02], [0, (r() - 0.5) * 0.06, 0], () => {
            p.add('tint', rbox(0.33, 0.255, 0.39, 0.004, 1), [0, 0.1275, 0], null, null, '#e8e2d2');
            p.add('tint', rbox(0.336, 0.05, 0.396, 0.004, 1), [0, 0.232, 0], null, null, '#d6cdb6');
            p.add('plasticBlack', box(0.08, 0.024, 0.003), [0, 0.17, 0.1966]);
            p.decal('office_archive', 0.15, 0.1, [0, 0.085, 0.1962]);
          });
        }
      }
    },
  },
  // The office vacuum cleaner: a red tub with a face, its hose looped over.
  office_vacuum: {
    size: [0.36, 0.36, 0.36],
    collide: 'box',
    build(p, o) {
      const c = o.color || '#c0271f';
      p.add('tint', lathe([[0, 0], [0.15, 0], [0.17, 0.03], [0.17, 0.24], [0.16, 0.26], [0, 0.26]], 24), [0, 0.02, 0], null, null, c);
      p.add('plasticBlack', lathe([[0, 0.28], [0.165, 0.28], [0.17, 0.3], [0.12, 0.34], [0, 0.345]], 24));
      p.add('plasticBlack', rbox(0.1, 0.03, 0.03, 0.01, 1), [0, 0.36, 0]);
      for (const s of [-1, 1]) p.add('rubber', cyl(0.025, 0.025, 0.02, 10), [s * 0.12, 0.025, -0.1], [0, 0, PI / 2]);
      p.decal('office_face', 0.16, 0.1, [0, 0.17, 0.171]);
      p.add('plasticBlack', tube([[0.14, 0.2, 0.08], [0.24, 0.1, 0.12], [0.3, 0.02, 0.02], [0.2, 0.02, -0.14], [0, 0.03, -0.2]], 0.018, 8));
    },
  },

  // --------------------------------------------------------- café / games
  // A bar stool: chrome base and footring, a padded seat.
  office_barstool: {
    size: [0.42, 0.78, 0.42],
    collide: 'box',
    colliders: () => [{ box: [0.36, 0.78, 0.36], at: [0, 0.39, 0] }],
    build(p, o, r) {
      const c = o.color || pick(['#c0573f', '#2f4f7e', '#3a3d42', '#2f6e4b'], r);
      p.add('chrome', lathe([[0, 0.002], [0.19, 0], [0.195, 0.012], [0.17, 0.022], [0.03, 0.03], [0, 0.03]], 20));
      p.add('chrome', cyl(0.024, 0.024, 0.66, 12), [0, 0.36, 0]);
      p.add('chrome', torus(0.15, 0.009, 6, 24), [0, 0.3, 0], [PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) p.at([0, 0.3, 0], [0, i * 2.094, 0], () => p.add('chrome', cyl(0.007, 0.007, 0.13, 6), [0.08, 0, 0], [0, 0, PI / 2]));
      p.add('powderBlack', cyl(0.11, 0.09, 0.03, 16), [0, 0.705, 0]);
      p.add(`fabric:${c}`, lathe([[0, 0], [0.17, 0], [0.185, 0.02], [0.18, 0.05], [0.15, 0.064], [0, 0.07]], 20), [0, 0.715, 0]);
    },
  },
  // An upright arcade cabinet, lit, somebody's game still on the screen.
  office_arcade: {
    size: [0.68, 1.78, 0.8],
    collide: 'box',
    build(p, o) {
      const c = o.color || '#1f2a44';
      const prof = [[-0.4, 0], [0.4, 0], [0.4, 0.92], [0.25, 1.0], [0.13, 1.42], [0.19, 1.48], [0.19, 1.78], [-0.4, 1.78]];
      for (const s of [-1, 1]) p.add('tint', side('arcadeside', prof, 0.024), [s * 0.328, 0, 0], [0, PI / 2, 0], null, c);
      p.add('tint', box(0.632, 1.78, 0.02), [0, 0.89, -0.39], null, null, c);
      p.add('tint', box(0.632, 0.02, 0.59), [0, 1.77, -0.105], null, null, c);
      p.add('tint', box(0.632, 0.92, 0.02), [0, 0.46, 0.39], null, null, c);
      p.add('rubber', box(0.66, 0.04, 0.78), [0, 0.02, 0]);
      // coin door, slots lit
      p.add('powderBlack', rbox(0.3, 0.32, 0.014, 0.004, 1), [0, 0.52, 0.404]);
      for (const s of [-1, 1]) p.add('lampStrip', box(0.02, 0.05, 0.004), [s * 0.06, 0.6, 0.412]);
      // control panel, sloping back and up
      p.at([0, 0.96, 0.325], [-0.49, 0, 0], () => {
        p.add('plasticBlack', box(0.632, 0.02, 0.18), [0, 0, 0]);
        p.add('chrome', cyl(0.006, 0.006, 0.07, 6), [-0.14, 0.045, 0]);
        p.add('tint', sphere(0.021, 10, 8), [-0.14, 0.085, 0], null, null, '#d8263a');
        const bc = ['#d8263a', '#2f7fd8', '#2e8b57', '#f2f2ee'];
        bc.forEach((col, i) => p.add('tint', cyl(0.015, 0.015, 0.014, 12), [0.02 + (i % 2) * 0.05 + (i > 1 ? 0.1 : 0), 0.014, (i % 2 ? -0.02 : 0.02)], null, null, col));
      });
      // the screen, leaning back, and its bezel
      p.at([0, 1.21, 0.19], [-0.28, 0, 0], () => {
        p.add('plasticBlack', box(0.62, 0.46, 0.012), [0, 0, 0]);
        p.add('labelsGlow', card(0.5, 0.36, atlasRect('pitch')), [0, 0, 0.0066]);
      });
      // the marquee, backlit
      p.add('backlight', box(0.6, 0.2, 0.012), [0, 1.63, 0.19]);
      p.decal('office_marquee', 0.58, 0.18, [0, 1.63, 0.1966]);
      for (const s of [-1, 1]) p.decal('office_stripes', 0.62, 0.62, [s * 0.3412, 0.62, 0], [0, s * PI / 2, 0]);
    },
  },
  // A dartboard in its cabinet on the wall (o.y lifts it), darts in it.
  office_dartboard: {
    size: [0.5, 0.5, 0.07],
    collide: 'none',
    build(p) {
      p.add('veneerWalnut', rbox(0.52, 0.52, 0.03, 0.008, 1), [0, 0.26, -0.02]);
      p.add('tint', cyl(0.2, 0.2, 0.035, 32), [0, 0.26, 0.01], [PI / 2, 0, 0], null, '#1d1f24');
      p.decal('office_dart', 0.39, 0.39, [0, 0.26, 0.0285]);
      for (let i = 0; i < 3; i++) {
        p.add('chrome', cyl(0.003, 0.002, 0.03, 5), [0.04 * i - 0.05, 0.28 + (i % 2) * 0.05, 0.04], [PI / 2, 0, 0]);
        p.add('tint', box(0.02, 0.02, 0.001), [0.04 * i - 0.05, 0.28 + (i % 2) * 0.05, 0.06], null, null, '#2f7fd8');
      }
    },
  },
  // A drinks fridge, cans on top, stickers on the door.
  office_minifridge: {
    size: [0.48, 0.9, 0.5],
    collide: 'box',
    build(p, o) {
      p.add('tint', rbox(0.48, 0.82, 0.48, 0.02, 1), [0, 0.43, 0], null, null, o.color || '#b8322a');
      p.add('plasticBlack', box(0.44, 0.02, 0.44), [0, 0.01, 0]);
      p.add('chrome', rbox(0.02, 0.3, 0.03, 0.006, 1), [0.19, 0.58, 0.25]);
      p.decal('brand', 0.14, 0.08, [-0.06, 0.62, 0.2405], null, 0.9, '#ffffff');
      p.decal('office_sticker', 0.1, 0.1, [0.02, 0.36, 0.2405]);
      for (let i = 0; i < 2; i++) p.add('tint', cyl(0.033, 0.033, 0.115, 12), [-0.1 + i * 0.09, 0.8975, 0.05], null, null, i ? '#2f5f9e' : '#c0392b');
    },
  },
  // A guitar on its stand, leaning back.
  office_guitar: {
    size: [0.42, 1.05, 0.34],
    collide: 'box',
    build(p) {
      for (const s of [-1, 1]) p.add('powderBlack', cyl(0.008, 0.008, 0.6, 6), [s * 0.1, 0.28, -0.05], [-0.25, 0, s * 0.12]);
      p.add('powderBlack', cyl(0.008, 0.008, 0.3, 6), [0, 0.1, 0.06], [0, 0, PI / 2]);
      p.at([0, 0.08, 0.04], [-0.22, 0, 0], () => {
        p.add('teak', cyl(0.18, 0.18, 0.1, 28), [0, 0.2, 0], [PI / 2, 0, 0]);
        p.add('teak', cyl(0.14, 0.14, 0.1, 24), [0, 0.45, 0], [PI / 2, 0, 0]);
        p.add('plasticBlack', cyl(0.046, 0.046, 0.004, 18), [0, 0.37, 0.051], [PI / 2, 0, 0]);
        p.add('veneerWalnut', rbox(0.1, 0.02, 0.012, 0.004, 1), [0, 0.16, 0.052]);
        p.add('veneerWalnut', rbox(0.05, 0.46, 0.024, 0.006, 1), [0, 0.8, 0]);
        p.add('veneerWalnut', rbox(0.08, 0.16, 0.02, 0.006, 1), [0, 1.1, -0.006]);
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) p.add('chrome', cyl(0.006, 0.006, 0.03, 6), [s * 0.05, 1.05 + i * 0.04, -0.006], [0, 0, PI / 2]);
      });
    },
  },
  // A pizza box on the floor (a hump a car rides over).
  office_pizza: {
    size: [0.42, 0.045, 0.42],
    collide: 'low',
    colliders: () => [{ hull: [[-0.21, 0, -0.21], [0.21, 0, -0.21], [0.21, 0, 0.21], [-0.21, 0, 0.21], [-0.17, 0.045, -0.17], [0.17, 0.045, -0.17], [0.17, 0.045, 0.17], [-0.17, 0.045, 0.17]] }],
    build(p) {
      p.add('cardboard', rbox(0.42, 0.043, 0.42, 0.004, 1), [0, 0.0215, 0]);
      p.decal('office_pizza', 0.34, 0.34, [0, 0.0435, 0], [-PI / 2, 0, 0.3]);
    },
  },

  // ------------------------------------------------------ meeting / CEO
  // A flipchart easel, its pad covered in last week's plan.
  office_flipchart: {
    size: [0.72, 1.9, 0.6],
    collide: 'box',
    colliders: () => [{ box: [0.72, 1.9, 0.5], at: [0, 0.95, 0] }],
    build(p) {
      for (const s of [-1, 1]) p.add('aluminium', cyl(0.012, 0.012, 1.86, 8), [s * 0.3, 0.92, 0.07], [0.07, 0, 0]);
      p.add('aluminium', cyl(0.012, 0.012, 1.84, 8), [0, 0.9, -0.14], [-0.22, 0, 0]);
      p.at([0, 1.36, 0.1], [-0.07, 0, 0], () => {
        p.add('melamineGrey', rbox(0.7, 0.92, 0.02, 0.01, 1), [0, 0, 0]);
        p.add('paper', box(0.66, 0.86, 0.012), [0, -0.02, 0.016]);
        p.decal('office_flip', 0.62, 0.8, [0, -0.02, 0.0226]);
        p.add('aluminium', rbox(0.7, 0.03, 0.02, 0.006, 1), [0, 0.45, 0.02]);
      });
      p.add('aluminium', rbox(0.7, 0.03, 0.07, 0.006, 1), [0, 0.88, 0.16]);
      for (let i = 0; i < 3; i++) p.add('tint', cyl(0.009, 0.009, 0.13, 8), [-0.15 + i * 0.1, 0.905, 0.16], [0, 0, PI / 2], null, ['#1d1f24', '#c0392b', '#2f6fb5'][i]);
    },
  },
  // The CEO's putting green: a strip of turf with the cup; balls on it.
  office_putting: {
    size: (o) => [o.w || 2.6, 0.012, o.d || 0.7],
    collide: 'none',
    build(p, o, r) {
      const w = o.w || 2.6, d = o.d || 0.7;
      p.add('fabric:#2f7a3c', rbox(w, 0.01, d, 0.004, 1), [0, 0.005, 0]);
      p.decal('office_putt', w, d, [0, 0.0106, 0], [-PI / 2, 0, 0]);
      for (let i = 0; i < (o.balls ?? 3); i++) p.add('plasticWhite', sphere(0.021, 10, 8), [-w / 2 + 0.25 + r() * 0.7, 0.031, (r() - 0.5) * d * 0.5]);
    },
  },
  // The flag in the cup (stand it ≥ 1.2 m off the lane).
  office_flag: {
    size: [0.2, 0.62, 0.06],
    collide: 'none',
    build(p) {
      p.add('powderWhite', cyl(0.004, 0.004, 0.6, 6), [0, 0.3, 0]);
      p.add('tint', extrude('pennant', shape([[0, 0], [0.16, 0.05], [0, 0.1]]), 0.003), [0.003, 0.5, 0], null, null, '#d8263a');
    },
  },
  // A golf bag leaning back against the wall, clubs and head covers out.
  office_golfbag: {
    size: [0.3, 1.2, 0.3],
    collide: 'box',
    build(p) {
      p.at([0, 0, 0.03], [-0.12, 0, 0], () => {
        p.add('fabric:#2c3440', cyl(0.12, 0.11, 0.86, 16), [0, 0.43, 0]);
        p.add('tint', cyl(0.126, 0.126, 0.06, 16), [0, 0.86, 0], null, null, '#e6e4de');
        p.add('fabric:#b0413a', rbox(0.11, 0.42, 0.06, 0.02, 1), [0, 0.42, 0.12]);
        p.add('plasticBlack', rbox(0.2, 0.05, 0.05, 0.01, 1), [0, 0.1, 0.1]);
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26;
          p.add('chrome', cyl(0.006, 0.006, 0.26, 6), [Math.cos(a) * 0.06, 0.98, Math.sin(a) * 0.06]);
          p.add(i % 2 ? 'fabric:#1f2226' : 'fabric:#d9d5c8', rbox(0.06, 0.1, 0.09, 0.03, 1), [Math.cos(a) * 0.06, 1.14, Math.sin(a) * 0.06 + 0.02]);
        }
      });
    },
  },
  // A floor globe on a walnut tripod, the brass meridian over it.
  office_globe: {
    size: [0.52, 1.0, 0.52],
    collide: 'box',
    build(p) {
      // three legs from a wide foot up to the horizon ring at the equator
      for (let i = 0; i < 3; i++) {
        p.at([0, 0, 0], [0, -(i * 2.094 + 0.3), 0], () => p.add('veneerWalnut', cyl(0.015, 0.013, 0.762, 8), [0.2725, 0.38, 0], [0, 0, 0.072]));
      }
      p.add('veneerWalnut', torus(0.245, 0.018, 6, 32), [0, 0.76, 0], [PI / 2, 0, 0]);
      p.at([0, 0.76, 0], [0, 0.4, 0.4], () => {
        p.add('tint', sphere(0.22, 22, 16), [0, 0, 0], [0, 1.2, 0], null, '#c2a46c');
        p.add('brass', torus(0.235, 0.008, 6, 36, PI * 1.25), [0, 0, 0], [0, PI / 2, -PI * 0.62]);
      });
    },
  },

  // --------------------------------------------------------- server room
  // A down-flow cooling unit against the wall: intake grille, a display.
  office_crac: {
    size: [1.2, 1.9, 0.7],
    collide: 'box',
    build(p) {
      p.add('melamineGrey', rbox(1.2, 1.86, 0.7, 0.01, 1), [0, 0.95, 0]);
      p.add('plasticBlack', box(1.16, 0.04, 0.66), [0, 0.02, 0]);
      p.add('louvre', box(1.0, 0.56, 0.004), [0, 0.52, 0.352]);
      p.add('louvre', box(1.0, 0.36, 0.004), [0, 1.58, 0.352]);
      p.add('glassBlack', box(0.2, 0.12, 0.004), [0.33, 1.15, 0.352]);
      p.add('ledGreen', box(0.014, 0.014, 0.004), [0.18, 1.17, 0.353]);
      p.add('ledBlue', box(0.14, 0.012, 0.002), [0.33, 1.15, 0.3545]);
      for (const s of [-1, 1]) p.add('brushedSteel', rbox(0.016, 0.24, 0.03, 0.005, 1), [s * 0.02 - 0.3, 1.1, 0.365]);
      p.decal('office_keepout', 0.24, 0.12, [-0.3, 1.36, 0.3525]);
    },
  },
  // The crash cart: a trolley, a monitor and a keyboard, a server below.
  office_crashcart: {
    size: [0.6, 1.4, 0.5],
    collide: 'box',
    build(p) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          p.add('powderBlack', cyl(0.012, 0.012, 1.0, 8), [sx * 0.27, 0.56, sz * 0.22]);
          p.add('rubber', cyl(0.03, 0.03, 0.02, 10), [sx * 0.27, 0.03, sz * 0.22], [0, 0, PI / 2]);
        }
      }
      for (const y of [0.15, 0.62, 1.04]) p.add('powderGrey', rbox(0.6, 0.02, 0.5, 0.005, 1), [0, y, 0]);
      p.add('plasticBlack', rbox(0.42, 0.28, 0.03, 0.01, 1), [0, 1.28, -0.1]);
      p.add('plasticBlack', rbox(0.08, 0.12, 0.06, 0.005, 1), [0, 1.1, -0.12]);
      p.add('labelsGlow', card(0.38, 0.22, atlasRect('copierUi')), [0, 1.28, -0.0845]);
      p.add('plasticBlack', rbox(0.42, 0.016, 0.14, 0.004, 1), [0, 1.058, 0.1]);
      p.add('laminateCharcoal', rbox(0.48, 0.09, 0.42, 0.006, 1), [0, 0.205, 0]);
      p.add('ledGreen', box(0.012, 0.012, 0.004), [0.18, 0.21, 0.212]);
      p.add('ledBlue', box(0.012, 0.012, 0.004), [0.15, 0.21, 0.212]);
      floorCable(p, [[0.1, 0.24], [0.2, 0.5], [0.05, 0.8], [0.3, 1.1]], '#1d3b6b', 1, false);
    },
  },
  // A raised-floor tile lifted out and leaned on something, the suction
  // lifter still on it; the hole it left is a decal (office_void).
  office_liftedtile: {
    size: [0.62, 0.62, 0.2],
    collide: 'box',
    build(p) {
      p.at([0, 0, 0.06], [-0.26, 0, 0], () => {
        p.add('laminateCharcoal', rbox(0.6, 0.6, 0.03, 0.004, 1), [0, 0.3, 0]);
        p.add('brushedSteel', box(0.6, 0.6, 0.004), [0, 0.3, -0.017]);
        p.add('plasticGrey', rbox(0.2, 0.04, 0.03, 0.012, 1), [0, 0.42, 0.03]);
        for (const s of [-1, 1]) p.add('rubber', cyl(0.05, 0.05, 0.012, 14), [s * 0.1, 0.42, 0.02], [PI / 2, 0, 0]);
      });
    },
  },

  // ------------------------------------------------ bathroom / focus / print
  // A hand dryer on the wall (o.y lifts it).
  office_handdryer: {
    size: [0.28, 0.3, 0.18],
    collide: 'none',
    build(p) {
      p.add('plasticWhite', rbox(0.28, 0.28, 0.15, 0.05, 2), [0, 0.16, -0.015]);
      p.add('chrome', cyl(0.028, 0.034, 0.05, 12), [0, 0.0, 0.02]);
      p.add('plasticBlack', box(0.1, 0.018, 0.004), [0, 0.22, 0.062]);
    },
  },
  // A bathroom scale.
  office_scale: {
    size: [0.3, 0.04, 0.32],
    collide: 'none',
    build(p) {
      p.add('plasticWhite', rbox(0.3, 0.035, 0.32, 0.012, 1), [0, 0.0175, 0]);
      p.add('glassBlack', box(0.1, 0.002, 0.05), [0, 0.036, 0.1]);
      p.add('rubber', box(0.22, 0.002, 0.12), [0, 0.036, -0.06]);
    },
  },
  // A pouf / footstool in the booth area.
  office_pouf: {
    size: [0.42, 0.4, 0.42],
    collide: 'box',
    build(p, o, r) {
      const c = o.color || pick(['#3f7d7a', '#c0573f', '#56606b', '#8a4a3a'], r);
      p.add(`fabric:${c}`, lathe([[0, 0], [0.19, 0], [0.21, 0.04], [0.21, 0.34], [0.19, 0.39], [0, 0.4]], 24));
    },
  },
  // An A-frame sign with its own print (o.print a decal kind, o.color).
  office_aframe: {
    size: [0.34, 0.66, 0.36],
    collide: 'box',
    build(p, o) {
      const c = o.color || '#2f5f9e', print = o.print || 'office_quiet';
      for (const s of [-1, 1]) {
        p.at([0, 0.32, s * 0.075], [s * -0.24, s < 0 ? PI : 0, 0], () => {
          p.add('tint', rbox(0.3, 0.64, 0.012, 0.012, 1), [0, 0, 0], null, null, c);
          p.decal(print, 0.26, 0.52, [0, -0.02, 0.0066]);
        });
      }
      p.add('tint', rbox(0.3, 0.03, 0.03, 0.01, 1), [0, 0.64, 0], null, null, c);
    },
  },
  // Mail pigeonholes on a low cupboard, envelopes in half the slots.
  office_pigeonholes: {
    size: [1.2, 1.3, 0.42],
    collide: 'box',
    build(p, o, r) {
      p.add('laminateWhite', rbox(1.2, 0.8, 0.42, 0.008, 1), [0, 0.4, 0]);
      for (const s of [-1, 1]) {
        p.add('laminateWhite', rbox(0.585, 0.72, 0.014, 0.004, 1), [s * 0.3, 0.42, 0.214]);
        p.add('brushedSteel', rbox(0.014, 0.14, 0.02, 0.004, 1), [s * 0.04, 0.6, 0.23]);
      }
      p.add('veneerOak', rbox(1.2, 0.5, 0.3, 0.006, 1), [0, 1.05, -0.05]);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          const x = -0.5 + i * 0.2, y = 0.88 + j * 0.155;
          p.add('laminateCharcoal', box(0.18, 0.135, 0.006), [x, y, 0.1]);
          if (r() < 0.6) p.add('paper', box(0.16, 0.03 + r() * 0.06, 0.02), [x, y - 0.03, 0.108], [0.25, 0, (r() - 0.5) * 0.1], null, r() < 0.3 ? '#e9dcc0' : '#f6f5f0');
        }
      }
    },
  },

  // -------------------------------------------------------------- terrace
  // A kettle barbecue on three legs, its lid on.
  office_bbq: {
    size: [0.62, 1.02, 0.62],
    collide: 'box',
    build(p) {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + 0.5;
        p.at([0, 0, 0], [0, -a, 0], () => p.add('powderBlack', cyl(0.012, 0.012, 0.66, 8), [0.2, 0.32, 0], [0, 0, 0.3]));
      }
      p.add('aluminium', cyl(0.16, 0.16, 0.006, 16), [0, 0.28, 0]);
      for (const s of [-1, 1]) p.add('rubber', cyl(0.04, 0.04, 0.025, 12), [s * 0.2, 0.04, -0.12], [0, 0, PI / 2]);
      p.add('powderBlack', lathe([[0, 0.58], [0.13, 0.59], [0.22, 0.64], [0.275, 0.72], [0.285, 0.79]], 28));
      p.add('powderBlack', lathe([[0.285, 0.79], [0.275, 0.87], [0.22, 0.94], [0.12, 0.985], [0, 0.995]], 28));
      p.add('aluminium', cyl(0.035, 0.035, 0.012, 12), [0, 1.0, 0]);
      p.add('plasticBlack', rbox(0.12, 0.03, 0.03, 0.01, 1), [0, 0.95, 0.19], [0.6, 0, 0]);
    },
  },
  // A folding deck chair: teak frame, a striped canvas sling.
  office_deckchair: {
    size: [0.6, 0.85, 1.0],
    collide: 'box',
    colliders: () => [{ box: [0.6, 0.5, 1.0], at: [0, 0.25, 0] }],
    build(p, o) {
      const c = o.color || '#2f6e4b';
      for (const s of [-1, 1]) {
        p.add('teak', rbox(0.03, 0.03, 1.08, 0.005, 1), [s * 0.29, 0.42, -0.04], [0.62, 0, 0]);
        p.add('teak', rbox(0.03, 0.03, 0.72, 0.005, 1), [s * 0.29, 0.3, 0.15], [-0.75, 0, 0]);
        p.add('teak', rbox(0.03, 0.03, 0.5, 0.005, 1), [s * 0.29, 0.22, -0.3], [-0.2, 0, 0]);
      }
      p.add('teak', rbox(0.6, 0.03, 0.03, 0.005, 1), [0, 0.8, -0.43]);
      p.add('teak', rbox(0.6, 0.03, 0.03, 0.005, 1), [0, 0.36, 0.38]);
      p.add(`fabric:${c}`, tube([[0, 0.78, -0.42], [0, 0.5, -0.12], [0, 0.3, 0.12], [0, 0.35, 0.37]], 0.004, 3, true, 20), [0, 0, 0], null, [70, 1, 1]);
    },
  },
  // A watering can.
  office_wateringcan: {
    size: [0.4, 0.3, 0.2],
    collide: 'box',
    build(p, o) {
      const c = o.color || '#3f7d7a';
      p.add('tint', lathe([[0, 0], [0.09, 0], [0.095, 0.02], [0.095, 0.2], [0.08, 0.215], [0, 0.215]], 16), [-0.03, 0, 0], null, null, c);
      p.add('tint', tube([[0.05, 0.04, 0], [0.13, 0.13, 0], [0.19, 0.24, 0]], 0.012, 6), [0, 0, 0], null, null, c);
      p.add('tint', cyl(0.028, 0.016, 0.04, 10), [0.2, 0.255, 0], [0, 0, -0.9], null, c);
      p.add('tint', torus(0.08, 0.01, 6, 16, PI), [-0.03, 0.215, 0], [0, 0, 0], null, c);
    },
  },
};

// Prints for the kinds above and floor markings for the map (DECALS). S px
// a cell; paint on transparent. Nothing purple, nothing yellow: those are
// the pads' and the beans' colours.
const txt = (g, s, x, y, px, color, weight = 800, font = 'system-ui, sans-serif') => {
  g.fillStyle = color; g.font = `${weight} ${px}px ${font}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y);
};
const rr = (g, x, y, w, h, rad) => {
  g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
};
// gaffer tape laid along a path: a band with torn, slightly wavy edges
function tapeLine(g, pts, w, r, color = 'rgba(240,240,236,0.95)') {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt'; g.lineJoin = 'miter';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x + (r() - 0.5) * 1.5, y + (r() - 0.5) * 1.5) : g.moveTo(x, y)));
  g.stroke();
}
// worn: knock random flecks out of what is painted
function wear(g, S, r, n = 160, a = 0.55) {
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${r() * a})`; g.fillRect(r() * S * 2, r() * S * 2, S * 0.03 * r(), S * 0.012); }
  g.globalCompositeOperation = 'source-over';
}

export const DECAL_KINDS = {
  // a chequered start line in gaffer tape: two rows of squares
  office_chequer: {
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2, k = S / 256, n = 16, q = W / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? 'rgba(22,22,24,0.95)' : 'rgba(244,244,240,0.97)';
          g.fillRect(i * q, S / 2 - q + j * q + (r() - 0.5) * 1.2 * k, q + 0.6, q);
        }
      }
      wear(g, S, r, 90, 0.5);
    },
  },
  // a taped grid slot: a bracket open toward the car's nose
  office_slot: {
    draw(g, S, r) {
      const k = S / 256, t = 12 * k;
      tapeLine(g, [[S * 0.1, S * 0.12], [S * 0.1, S * 0.88], [S * 0.9, S * 0.88], [S * 0.9, S * 0.12]], t, r);
      tapeLine(g, [[S * 0.1, S * 0.12], [S * 0.24, S * 0.12]], t, r);
      tapeLine(g, [[S * 0.9, S * 0.12], [S * 0.76, S * 0.12]], t, r);
    },
  },
  // a tape circle: the soccer pitch's centre circle, a spot (tint it)
  office_ring: {
    draw(g, S, r) {
      const k = S / 256;
      g.strokeStyle = 'rgba(240,240,236,0.95)'; g.lineWidth = 11 * k;
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2, rad = S * 0.44 + (r() - 0.5) * 1.5 * k;
        g.lineTo(S / 2 + Math.cos(a) * rad, S / 2 + Math.sin(a) * rad);
      }
      g.stroke();
      g.fillStyle = 'rgba(240,240,236,0.95)'; g.beginPath(); g.arc(S / 2, S / 2, 9 * k, 0, 6.3); g.fill();
    },
  },
  // a basketball key under the hoop, painted on the boards and worn: the
  // lane, the free-throw circle (u across the key, v away from the hoop)
  office_court: {
    draw(g, S, r) {
      const k = S / 256;
      g.fillStyle = 'rgba(150,52,30,0.8)'; g.fillRect(S * 0.3, 0, S * 0.4, S * 0.62);
      g.strokeStyle = 'rgba(245,242,236,0.97)'; g.lineWidth = 11 * k;
      g.strokeRect(S * 0.3, -4 * k, S * 0.4, S * 0.62 + 4 * k);
      g.beginPath(); g.arc(S / 2, S * 0.62, S * 0.2, 0, Math.PI); g.stroke();
      g.setLineDash([10 * k, 9 * k]); g.beginPath(); g.arc(S / 2, S * 0.62, S * 0.2, Math.PI, 0); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(S / 2, 0, S * 0.47, 0.05, Math.PI - 0.05); g.stroke();
      wear(g, S / 2, r, 260, 0.6);
    },
  },
  // the roll-up banner's print
  office_banner: {
    span: [1, 2],
    draw(g, S, r) {
      const k = S / 256, H = S * 2;
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1b2a44'); grd.addColorStop(1, '#0e1522');
      g.fillStyle = grd; g.fillRect(0, 0, S, H);
      g.fillStyle = '#e07a2e'; g.beginPath(); g.arc(S / 2, H * 0.16, 44 * k, 0, 6.3); g.fill();
      txt(g, 'RC', S / 2, H * 0.162, 42 * k, '#1b2a44', 900);
      txt(g, 'MAYHEM', S / 2, H * 0.3, 50 * k, '#f2f2ee', 900);
      txt(g, 'INC.', S / 2, H * 0.355, 26 * k, '#e07a2e', 800);
      // a little car flying off a ramp
      g.fillStyle = '#e07a2e';
      g.beginPath(); g.moveTo(S * 0.12, H * 0.62); g.lineTo(S * 0.5, H * 0.62); g.lineTo(S * 0.12, H * 0.68); g.fill();
      g.save(); g.translate(S * 0.62, H * 0.53); g.rotate(-0.3);
      g.fillStyle = '#f2f2ee'; rr(g, -40 * k, -12 * k, 80 * k, 22 * k, 8 * k); g.fill();
      g.fillStyle = '#1b2a44'; g.fillRect(-16 * k, -22 * k, 30 * k, 12 * k);
      g.fillStyle = '#0a0d14'; for (const x of [-26, 24]) { g.beginPath(); g.arc(x * k, 12 * k, 11 * k, 0, 6.3); g.fill(); }
      g.restore();
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(242,242,238,0.5)'; g.fillRect(S * (0.2 + i * 0.06), H * (0.5 + i * 0.012), 30 * k, 3 * k); }
      txt(g, 'TINY CARS.', S / 2, H * 0.78, 30 * k, '#f2f2ee', 800);
      txt(g, 'BIG TROUBLE.', S / 2, H * 0.83, 30 * k, '#e07a2e', 900);
      g.fillStyle = 'rgba(242,242,238,0.35)'; g.fillRect(S * 0.2, H * 0.9, S * 0.6, 2 * k);
      txt(g, 'mayhem.inc  ·  floor 12', S / 2, H * 0.93, 15 * k, 'rgba(242,242,238,0.7)', 600);
    },
  },
  // the showcase's brass plaque
  office_plaque: {
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#b48a3c'; rr(g, S * 0.04, S * 0.26, S * 0.92, S * 0.48, 10 * k); g.fill();
      g.strokeStyle = 'rgba(60,40,10,0.6)'; g.lineWidth = 3 * k; rr(g, S * 0.08, S * 0.3, S * 0.84, S * 0.4, 8 * k); g.stroke();
      txt(g, 'MK-I · 2009', S / 2, S * 0.43, 30 * k, '#3a2a10', 900);
      txt(g, 'where it all began', S / 2, S * 0.58, 20 * k, '#3a2a10', 600);
    },
  },
  // an archive box label: department and year, handwritten
  office_archive: {
    draw(g, S, r) {
      const k = S / 256;
      g.fillStyle = '#fbfaf5'; g.fillRect(S * 0.08, S * 0.2, S * 0.84, S * 0.6);
      g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 2 * k; g.strokeRect(S * 0.08, S * 0.2, S * 0.84, S * 0.6);
      const dept = pick(['INVOICES', 'HR', 'LEGAL', 'Q3 DECKS', 'MISC', 'RECEIPTS'], r);
      txt(g, dept, S / 2, S * 0.38, 34 * k, '#23324d', 700, 'cursive');
      txt(g, String(2011 + Math.floor(r() * 12)), S / 2, S * 0.62, 50 * k, '#8e2a22', 800, 'cursive');
    },
  },
  // the vacuum cleaner's smile
  office_face: {
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#1d1f24';
      for (const x of [-1, 1]) { g.beginPath(); g.arc(S / 2 + x * 44 * k, S * 0.36, 16 * k, 0, 6.3); g.fill(); }
      g.strokeStyle = '#1d1f24'; g.lineWidth = 14 * k; g.lineCap = 'round';
      g.beginPath(); g.arc(S / 2, S * 0.4, 70 * k, 0.5, Math.PI - 0.5); g.stroke();
    },
  },
  // the arcade marquee
  office_marquee: {
    span: [2, 1],
    draw(g, S) {
      const W = S * 2, k = S / 256;
      const grd = g.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, '#d8263a'); grd.addColorStop(0.5, '#e07a2e'); grd.addColorStop(1, '#2f7fd8');
      g.fillStyle = grd; g.fillRect(0, S * 0.08, W, S * 0.84);
      g.fillStyle = 'rgba(10,12,20,0.35)'; g.fillRect(0, S * 0.72, W, S * 0.2);
      txt(g, 'DESK RACER', W / 2, S * 0.42, 84 * k, '#fdfbf4', 900);
      txt(g, 'INSERT COIN', W / 2, S * 0.82, 40 * k, '#fdfbf4', 800);
    },
  },
  // the cabinet's side art: diagonal racing stripes
  office_stripes: {
    draw(g, S) {
      g.save(); g.translate(S / 2, S / 2); g.rotate(-0.6);
      const bands = [['#d8263a', 34], ['#f2f2ee', 10], ['#e07a2e', 22], ['#f2f2ee', 10], ['#2f7fd8', 16]];
      let y = -60;
      for (const [c, h] of bands) { g.fillStyle = c; g.fillRect(-S, y * S / 256, S * 2, h * S / 256); y += h + 6; }
      g.restore();
    },
  },
  // a dartboard face: segments, rings, the bull
  office_dart: {
    draw(g, S) {
      const c = S / 2, R = S * 0.48;
      for (let i = 0; i < 20; i++) {
        const a0 = (i - 0.5) / 20 * Math.PI * 2 - Math.PI / 2, a1 = a0 + Math.PI / 10;
        const rings = [[R, R * 0.93, i % 2 ? '#2e8b57' : '#c0271f'], [R * 0.93, R * 0.6, i % 2 ? '#efe6cf' : '#1d1f24'],
          [R * 0.6, R * 0.53, i % 2 ? '#2e8b57' : '#c0271f'], [R * 0.53, R * 0.12, i % 2 ? '#efe6cf' : '#1d1f24']];
        for (const [ro, ri, col] of rings) {
          g.fillStyle = col; g.beginPath(); g.arc(c, c, ro, a0, a1); g.arc(c, c, ri, a1, a0, true); g.closePath(); g.fill();
        }
      }
      g.fillStyle = '#2e8b57'; g.beginPath(); g.arc(c, c, R * 0.12, 0, 6.3); g.fill();
      g.fillStyle = '#c0271f'; g.beginPath(); g.arc(c, c, R * 0.05, 0, 6.3); g.fill();
    },
  },
  // a fridge sticker
  office_sticker: {
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#f2f2ee'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.44, 0, 6.3); g.fill();
      g.fillStyle = '#2f7fd8'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.38, 0, 6.3); g.fill();
      txt(g, 'NO', S / 2, S * 0.38, 56 * k, '#f2f2ee', 900);
      txt(g, 'BRAKES', S / 2, S * 0.6, 40 * k, '#f2f2ee', 900);
    },
  },
  // a pizza box lid
  office_pizza: {
    draw(g, S) {
      const k = S / 256;
      g.strokeStyle = '#b8322a'; g.lineWidth = 9 * k; g.beginPath(); g.arc(S / 2, S * 0.44, S * 0.3, 0, 6.3); g.stroke();
      g.fillStyle = '#b8322a';
      for (let i = 0; i < 6; i++) { const a = i * 1.047; g.beginPath(); g.arc(S / 2 + Math.cos(a) * S * 0.15, S * 0.44 + Math.sin(a) * S * 0.15, 12 * k, 0, 6.3); g.fill(); }
      txt(g, "LUIGI'S", S / 2, S * 0.44, 34 * k, '#2e6b35', 900);
      txt(g, 'HOT & FAST', S / 2, S * 0.86, 26 * k, '#b8322a', 800);
    },
  },
  // the flipchart's page: last quarter's plan, in marker
  office_flip: {
    draw(g, S, r) {
      const k = S / 256;
      txt(g, 'Q3 PLAN', S * 0.34, S * 0.1, 30 * k, '#1d1f24', 800, 'cursive');
      g.strokeStyle = '#1d1f24'; g.lineWidth = 3 * k;
      g.beginPath(); g.moveTo(S * 0.1, S * 0.18); g.lineTo(S * 0.58, S * 0.17); g.stroke();
      g.strokeStyle = '#2f6fb5'; g.lineWidth = 4 * k;
      g.beginPath(); g.moveTo(S * 0.12, S * 0.9); g.lineTo(S * 0.12, S * 0.3); g.moveTo(S * 0.12, S * 0.9); g.lineTo(S * 0.9, S * 0.9); g.stroke();
      g.strokeStyle = '#c0392b'; g.lineWidth = 6 * k;
      g.beginPath(); g.moveTo(S * 0.14, S * 0.82); g.lineTo(S * 0.3, S * 0.7); g.lineTo(S * 0.42, S * 0.76); g.lineTo(S * 0.6, S * 0.5); g.lineTo(S * 0.72, S * 0.56); g.lineTo(S * 0.88, S * 0.3); g.stroke();
      g.beginPath(); g.moveTo(S * 0.8, S * 0.28); g.lineTo(S * 0.89, S * 0.29); g.lineTo(S * 0.87, S * 0.38); g.stroke();
      txt(g, 'MORE RAMPS!!', S * 0.5, S * 0.42, 22 * k, '#2e8b57', 800, 'cursive');
      for (let i = 0; i < 3; i++) { g.fillStyle = '#1d1f24'; g.beginPath(); g.arc(S * 0.62, S * (0.18 + i * 0.07) + 8 * k, 3 * k, 0, 6.3); g.fill(); g.fillRect(S * 0.66, S * (0.18 + i * 0.07) + 7 * k, S * (0.12 + r() * 0.12), 2.5 * k); }
    },
  },
  // the putting mat's face: mown stripes, the cup, a tee line (u along w)
  office_putt: {
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2, k = S / 256;
      for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? 'rgba(88,160,78,0.9)' : 'rgba(64,132,60,0.9)'; g.fillRect(i * W / 10, S * 0.06, W / 10 + 1, S * 0.88); }
      g.strokeStyle = 'rgba(30,70,30,0.7)'; g.lineWidth = 6 * k; rr(g, 3 * k, S * 0.06, W - 6 * k, S * 0.88, 30 * k); g.stroke();
      g.fillStyle = '#f2f2ee'; g.beginPath(); g.arc(W * 0.86, S / 2, 20 * k, 0, 6.3); g.fill();
      g.fillStyle = '#101210'; g.beginPath(); g.arc(W * 0.86, S / 2, 15 * k, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(242,242,238,0.8)'; g.lineWidth = 3 * k; g.setLineDash([8 * k, 8 * k]);
      g.beginPath(); g.arc(W * 0.86, S / 2, 60 * k, 0, 6.3); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(242,242,238,0.9)'; g.fillRect(W * 0.1, S * 0.3, 4 * k, S * 0.4);
      for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(20,60,20,${r() * 0.25})`; g.fillRect(r() * W, S * 0.06 + r() * S * 0.88, 2 * k, 4 * k); }
    },
  },
  // A-frame prints (span [1, 2]: the boards are twice as tall as wide)
  office_quiet: {
    span: [1, 2],
    draw(g, S) {
      const k = S / 256, H = S * 2;
      g.fillStyle = '#f2f2ee'; rr(g, S * 0.06, H * 0.04, S * 0.88, H * 0.9, 16 * k); g.fill();
      g.fillStyle = '#2f5f9e'; g.beginPath(); g.arc(S / 2, H * 0.26, 70 * k, 0, 6.3); g.fill();
      g.fillStyle = '#f2f2ee'; g.fillRect(S / 2 - 9 * k, H * 0.2, 18 * k, 18 * k);
      g.beginPath(); g.moveTo(S / 2 - 9 * k, H * 0.2); g.lineTo(S / 2 - 40 * k, H * 0.17); g.lineTo(S / 2 - 40 * k, H * 0.3); g.lineTo(S / 2 - 9 * k, H * 0.24); g.fill();
      g.strokeStyle = '#f2f2ee'; g.lineWidth = 8 * k; g.beginPath(); g.moveTo(S / 2 - 48 * k, H * 0.16); g.lineTo(S / 2 + 48 * k, H * 0.36); g.stroke();
      txt(g, 'QUIET', S / 2, H * 0.52, 62 * k, '#1d2a44', 900);
      txt(g, 'ZONE', S / 2, H * 0.6, 62 * k, '#1d2a44', 900);
      txt(g, 'focus booths —', S / 2, H * 0.73, 22 * k, '#1d2a44', 600);
      txt(g, 'no engines past', S / 2, H * 0.78, 22 * k, '#1d2a44', 600);
      txt(g, 'this point', S / 2, H * 0.83, 22 * k, '#1d2a44', 600);
    },
  },
  office_keepout: {
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#f2f2ee'; g.fillRect(S * 0.04, S * 0.2, S * 0.92, S * 0.6);
      g.fillStyle = '#c0271f'; g.fillRect(S * 0.04, S * 0.2, S * 0.92, S * 0.2);
      txt(g, 'DANGER', S / 2, S * 0.3, 40 * k, '#f2f2ee', 900);
      txt(g, 'AUTHORISED', S / 2, S * 0.52, 30 * k, '#1d1f24', 900);
      txt(g, 'PERSONNEL ONLY', S / 2, S * 0.68, 24 * k, '#1d1f24', 800);
    },
  },
  // a floor stencil: KEEP CLEAR, worn by trolleys (tint it)
  office_keepclear: {
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2, k = S / 256;
      g.strokeStyle = 'rgba(242,242,238,0.9)'; g.lineWidth = 8 * k; g.strokeRect(10 * k, S * 0.14, W - 20 * k, S * 0.72);
      txt(g, 'KEEP CLEAR', W / 2, S / 2 + 4 * k, 96 * k, 'rgba(242,242,238,0.92)', 900);
      wear(g, S, r, 420, 0.7);
    },
  },
  // the hole a lifted raised-floor tile leaves: the void, cables in it
  office_void: {
    draw(g, S, r) {
      const k = S / 256;
      g.fillStyle = '#9ea4aa'; g.fillRect(S * 0.04, S * 0.04, S * 0.92, S * 0.92);
      g.fillStyle = '#0c0d10'; g.fillRect(S * 0.08, S * 0.08, S * 0.84, S * 0.84);
      for (let i = 0; i < 7; i++) {
        g.strokeStyle = ['#1d3b6b', '#2a2c31', '#3a3d44', '#c0271f'][i % 4]; g.lineWidth = (5 + r() * 4) * k;
        g.beginPath(); g.moveTo(S * 0.08, S * (0.2 + r() * 0.6)); g.bezierCurveTo(S * 0.4, S * r(), S * 0.6, S * r(), S * 0.92, S * (0.2 + r() * 0.6)); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(S * 0.08, S * 0.08, S * 0.84, S * 0.1);
    },
  },
};

// The office's plain walls: double sockets every 3.6 m at 0.3 m, a white
// dado trunking round the work rooms, vents, scuffs where trolleys and RC
// cars have hit the paint, door stops, threshold strips where floors change.
export const BANDS = {
  'plain:office': {
    sockets: 3.6,
    trunking: ['open_office', 'printer', 'meeting', 'focus'],
    conduit: ['storage', 'server'],
    vents: 7,
    scuffs: 2.5,
    clips: ['lounge', 'games', 'cafeteria', 'reception'],
    stops: true,
    thresholds: true,
    guards: true,
  },
  // the north windows get a floor convector along their inside face
  'glass:office': { convector: 'exterior' },
  // the balcony railings: a drain scupper now and then, and moss
  'low:office': { scuppers: 3.5 },
};
