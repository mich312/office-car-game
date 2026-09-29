// What every static thing on the 48th floor is made of: furniture, walls,
// ramps and ceiling fixtures as part lists (kit.js), plus the colliders each
// furniture piece owns. Everything is in metres in the piece's own frame,
// +z is its front, y = 0 is the floor.
//
// Detail goes where the camera is: an 18 cm car sees the kick plinths,
// the legs, the undersides and the first metre of every wall, and only the
// silhouette of anything above that.
import * as THREE from 'three';
import { M } from '@rc/shared';
import { G, hash } from './kit.js';

const H = 3.3; // floor to ceiling

// colours for the vertex-coloured materials
export const C = {
  plaster: '#dcd5ca', white: '#ecebe6', ivory: '#f2ede2', black: '#1b1c20', charcoal: '#3a3d44',
  graphite: '#2a2d33', screen: '#0c1118', steelDark: '#5c6168', brown: '#4a3222', soil: '#2d2217',
  cream: '#e9e1cf', sage: '#6d7f6a', navy: '#1f2a44', oxblood: '#5a1f1b', warm: '#ffcf8a', cool: '#dfe9ff',
  concrete: '#b8b3aa', leaf: '#6f7d5a', leafDark: '#4f5c3e', bark: '#5e5448',
};
const BOOKS = ['#5a1f1b', '#1f2a44', '#2f4a36', '#8a6a3a', '#e9e1cf', '#1b1c20', '#6b3a22', '#3d4f6b', '#a88c5a'];
const SCREENS = ['#1d3456', '#16402c', '#3c2c14', '#2a2350', '#123a44'];

// ======================================================== furniture
// build(p, w, d, h, f): p is a parts() list; w/d/h the piece's size in metres

// the reception desk's crescent (plan view), fitted inside w × d: the
// apex of the curve touches the front (+z), its ends reach back
function crescent(w, d, band = 0.5) {
  const c = w / 2, s = d - band * 0.72;
  const R = (c * c + s * s) / (2 * s);
  const zc = d / 2 - 0.02 - R;
  const a = Math.asin(Math.min(1, c / R));
  const outer = [], inner = [];
  for (let i = 0; i <= 24; i++) {
    const t = -a + (2 * a * i) / 24;
    outer.push([Math.sin(t) * R, zc + Math.cos(t) * R]);
    inner.push([Math.sin(t) * (R - band), zc + Math.cos(t) * (R - band)]);
  }
  return { pts: [...outer, ...inner.reverse()], R, zc, a, band };
}

export const BUILD = {
  // the video wall's surround: walnut, floor to ceiling, screens inset
  // (the screens themselves are live, tower/live.jsx), a low media shelf
  tower_mediawall(p, w, d, h) {
    p.slab('walnut', null, w, h - 0.12, d, 0, 0.12, 0, 0.006);
    p.slab('matte', C.black, w, 0.12, d - 0.02, 0, 0, -0.01, 0.004);
    for (let i = 1; i < 6; i++) p.box('matte', C.black, 0.006, h - 0.12, 0.004, -w / 2 + (w / 6) * i, 0.12 + (h - 0.12) / 2, d / 2 + 0.001, 0);
    p.slab('blackMarble', null, w - 0.3, 0.04, 0.3, 0, 0.42, d / 2 + 0.15, 0.004);
    p.box('glow', '#5aa0ff', w - 0.3, 0.008, 0.01, 0, 0.415, d / 2 + 0.28, 0);
  },
  // an executive's walnut desk: slab ends, a leather inlay, a modesty panel
  // on the visitor side (+z) that stops short of the floor — cars go under
  tower_desk(p, w, d, h) {
    p.slab('walnut', null, w, 0.04, d, 0, h - 0.04, 0, 0.01);
    p.slab('leatherBlack', null, w * 0.5, 0.003, d * 0.45, 0, h, -d * 0.18, 0.002);
    for (const s2 of [-1, 1]) {
      p.slab('walnut', null, 0.04, h - 0.04, d - 0.04, s2 * (w / 2 - 0.02), 0, 0, 0.006);
      p.slab('brass', null, 0.05, 0.012, d - 0.02, s2 * (w / 2 - 0.02), 0, 0, 0.003);
    }
    p.slab('walnut', null, w - 0.08, h - 0.4, 0.02, 0, 0.36, d / 2 - 0.04, 0.004);
    // the keyboard and phone live on the desk
    p.slab('satin', '#d8dade', 0.44, 0.015, 0.14, 0, h, -d * 0.2, 0.004);
    p.slab('satin', C.black, 0.18, 0.04, 0.2, w / 2 - 0.25, h, -d * 0.15, 0.01);
    p.box('satin', C.black, 0.05, 0.025, 0.19, w / 2 - 0.3, h + 0.05, -d * 0.15, 0.01);
  },
  // the espresso bar on the pantry's east wall: long along z, its front to −x
  tower_espresso(p, w, d, h) {
    p.slab('matte', C.black, w - 0.1, 0.08, d - 0.06, 0.05, 0, 0, 0.004);
    p.slab('walnut', null, w - 0.04, h - 0.12, d, 0.02, 0.08, 0, 0.01);
    for (let i = 0; i < Math.floor((d - 0.1) / 0.06); i++) p.rod('walnut', null, 0.02, h - 0.2, -w / 2 + 0.03, 0.08 + (h - 0.2) / 2, -d / 2 + 0.08 + i * 0.06, 'y', 8);
    p.slab('marble', null, w + 0.04, 0.04, d + 0.04, -0.02, h - 0.04, 0, 0.004);
    // onyx splashback, a brass shelf of cups
    p.box('onyx', null, 0.03, 0.6, d - 0.1, w / 2 - 0.03, h + 0.3, 0, 0.004);
    p.box('brass', null, 0.24, 0.02, d - 0.2, w / 2 - 0.14, h + 0.66, 0, 0.004);
    for (let i = 0; i < 10; i++) p.post('gloss', i % 3 ? '#f4f2ee' : '#1b1c20', 0.03, 0.06, w / 2 - 0.14, h + 0.67, -d / 2 + 0.3 + i * ((d - 0.6) / 9), 12, 0.025);
    // the house machine: chrome, two group heads, a steam wand
    const z = -d / 2 + 0.45;
    p.slab('chrome', null, 0.46, 0.4, 0.62, 0.02, h, z, 0.03);
    p.slab('matte', C.black, 0.4, 0.04, 0.56, 0.02, h + 0.4, z, 0.01);
    for (const k of [-0.13, 0.13]) {
      p.post('chrome', null, 0.035, 0.05, -0.23, h + 0.2, z + k, 12);
      p.rod('satin', C.black, 0.012, 0.14, -0.3, h + 0.21, z + k, 'x', 8);
      p.post('gloss', '#f4f2ee', 0.03, 0.06, -0.24, h + 0.02, z + k, 12, 0.025);
    }
    p.add(G.cyl(0.006, 0.006, 0.2), 'chrome', null, -0.24, h + 0.22, z + 0.28, 0, 0, 0.3);
    p.box('glow', '#58d0ff', 0.004, 0.03, 0.08, -0.215, h + 0.33, z, 0);
  },
  // integrated tall units along the pantry wall: glass-door drinks fridges,
  // lit, between walnut larder cupboards
  tower_fridgewall(p, w, d, h) {
    p.slab('matte', C.black, w - 0.04, 0.1, d - 0.08, 0, 0, -0.03, 0.004);
    p.slab('walnut', null, w, h - 0.1, d, 0, 0.1, 0, 0.01);
    const bays = 5;
    for (let i = 0; i < bays; i++) {
      const x = -w / 2 + (w / bays) * (i + 0.5), bw = w / bays - 0.04;
      p.box('matte', C.black, 0.006, h - 0.14, 0.006, -w / 2 + (w / bays) * i, 0.1 + (h - 0.1) / 2, d / 2 + 0.003, 0);
      if (i % 2 === 1) {
        // a fridge: lit interior, shelves of bottles behind glass
        p.box('glow', C.cool, bw - 0.06, h - 0.35, 0.01, x, 0.12 + (h - 0.35) / 2 + 0.05, -d / 2 + 0.06, 0);
        for (let r = 0; r < 5; r++) {
          const y = 0.25 + r * 0.36;
          p.box('glass', null, bw - 0.08, 0.01, d - 0.15, x, y, 0, 0);
          for (let k = 0; k < 6; k++) p.post('gloss', r % 2 ? '#3f8a52' : '#cfe4e8', 0.028, 0.24, x - bw / 2 + 0.1 + k * ((bw - 0.2) / 5), y + 0.005, 0.02, 8);
        }
        p.box('glass', null, bw, h - 0.2, 0.012, x, 0.1 + (h - 0.2) / 2, d / 2 + 0.008, 0);
        p.box('steel', null, 0.02, 0.6, 0.03, x + bw / 2 - 0.06, 1.1, d / 2 + 0.03, 0.004);
      } else {
        p.box('brass', null, 0.02, 0.4, 0.025, x + bw / 2 - 0.06, 1.0, d / 2 + 0.015, 0.004);
      }
    }
    p.box('glow', C.warm, w - 0.1, 0.01, 0.012, 0, 0.06, d / 2 + 0.02, 0);
  },
  // a framed abstract on the wall (decor): d is how far it stands off the wall
  tower_art(p, w, d, h, f) {
    const key = ['art1', 'art2', 'art3'][Math.floor(hash(Math.round(f.x * 3 + f.z)) * 3)];
    p.box('walnut', null, w + 0.08, h + 0.08, 0.04, 0, 1.0 + h / 2, -d / 2 + 0.02, 0.006);
    p.add(G.plane(w, h), key, null, 0, 1.0 + h / 2, -d / 2 + 0.041, 0, 0, 0, 1, 1, 1, { keepUV: true });
  },
  tower_reception(p, w, d, h) {
    const cr = crescent(w, d);
    const key = `rec${w}x${d}`;
    // backlit onyx body on a black plinth, a black marble top
    p.add(G.shape(cr.pts, 0.08, key), 'matte', C.black, 0, 0, -0.012, 0, 0, 0, 0.99, 1, 0.99);
    p.add(G.shape(cr.pts, h - 0.12, key), 'onyx', null, 0, 0.08, 0);
    p.add(G.shape(cr.pts, 0.045, key), 'blackMarble', null, 0, h - 0.045, 0.015, 0, 0, 0, 1.012, 1, 1.02);
    p.add(G.shape(cr.pts, 0.012, key), 'brass', null, 0, h - 0.057, 0.01, 0, 0, 0, 1.005, 1, 1.01);
    // the receptionist's worktop behind, lower, in walnut
    const inner = crescent(w - 0.7, d - 0.35, 0.34);
    p.add(G.shape(inner.pts, 0.035, `rec-in${w}`), 'walnut', null, 0, 0.74, -0.33);
  },
  tower_plinth(p, w, d, h) {
    p.slab('blackMarble', null, w, h - 0.05, d, 0, 0.05, 0, 0.004);
    p.slab('brass', null, w + 0.02, 0.05, d + 0.02, 0, 0, 0, 0.004);
    // a bronze knot: "Synergy", 2011
    p.add(G.knot(0.2, 0.05), 'bronze', null, 0, h + 0.36, 0, 0.3, 0.6, 0.2);
    p.slab('bronze', null, 0.16, 0.08, 0.16, 0, h, 0, 0.01);
    p.box('brass', null, 0.22, 0.07, 0.01, 0, h * 0.72, d / 2 + 0.006, 0.002);
  },
  tower_bench(p, w, d, h) {
    // Barcelona bench: tufted black leather on a chrome X-frame
    p.slab('leatherBlack', null, w, 0.09, d, 0, h - 0.09, 0, 0.035);
    for (let i = 0; i < 6; i++) p.box('leatherBlack', null, 0.004, 0.01, d * 0.9, -w / 2 + (w / 6) * (i + 0.5), h + 0.001, 0, 0.002);
    for (const sx of [-1, 1]) {
      for (const k of [-1, 1]) {
        p.add(G.box(0.03, 0.46, 0.02), 'chrome', null, sx * (w / 2 - 0.12), (h - 0.09) / 2, 0, k * 0.55, 0, 0);
      }
      p.box('chrome', null, 0.04, 0.02, d, sx * (w / 2 - 0.12), h - 0.1, 0, 0.005);
    }
  },
  tower_star(p, w, d) {
    // the compass star and the black-marble start band it sits on
    p.add(G.plane(w, d), 'star', null, 0, 0.004, 0, -Math.PI / 2);
    p.box('blackMarble', null, 0.3, 0.006, 5.8, -0.8, 0.003, -1, 0);
    p.box('brass', null, 0.012, 0.007, 5.8, -0.64, 0.0035, -1, 0);
    p.box('brass', null, 0.012, 0.007, 5.8, -0.96, 0.0035, -1, 0);
  },
  tower_credenza(p, w, d, h) {
    p.slab('matte', C.black, w - 0.06, 0.08, d - 0.06, 0, 0, -0.01, 0.004);
    p.slab('walnut', null, w, h - 0.08, d, 0, 0.08, 0, 0.012);
    const doors = Math.max(2, Math.round(w / 0.6));
    for (let i = 1; i < doors; i++) p.box('matte', C.black, 0.006, h - 0.16, 0.006, -w / 2 + (w / doors) * i, 0.08 + (h - 0.08) / 2, d / 2 + 0.001, 0);
    for (let i = 0; i < doors; i++) p.box('brass', null, 0.12, 0.012, 0.018, -w / 2 + (w / doors) * (i + 0.5), h - 0.12, d / 2 + 0.008, 0.004);
    p.slab('blackMarble', null, w + 0.02, 0.025, d + 0.02, 0, h - 0.004, 0, 0.004);
  },
  tower_rug(p, w, d, h, f) {
    p.add(G.plane(w, d), hash(Math.round(f.x + f.z)) > 0.5 ? 'rug' : 'rug2', null, 0, 0.006, 0, -Math.PI / 2, 0, 0, 1, 1, 1, { keepUV: true });
  },
  tower_fireplace(p, w, d, h) {
    // a bioethanol burner in a black marble trough, glass screens both sides
    p.slab('blackMarble', null, w, 0.42, d, 0, 0, 0, 0.01);
    p.slab('matte', C.black, w - 0.04, 0.06, d - 0.04, 0, 0, 0.02, 0.004);
    p.slab('anodised', null, 0.14, 0.05, d - 0.3, 0, 0.42, 0, 0.004);
    for (let i = 0; i < 18; i++) p.add(G.ico(0.025, 0), 'matte', i % 3 ? '#35312d' : '#5a544c', (hash(i) - 0.5) * 0.3, 0.445, (hash(i + 40) - 0.5) * (d - 0.2));
    for (const s of [-1, 1]) {
      p.box('glass', null, 0.012, h - 0.42, d, s * (w / 2 - 0.03), 0.42 + (h - 0.42) / 2, 0, 0);
      p.box('steel', null, 0.02, 0.02, d, s * (w / 2 - 0.03), h, 0, 0.004);
    }
  },
  tower_sofa(p, w, d, h) {
    // chesterfield in oxblood leather: rolled arms level with the back
    const seatH = 0.42;
    for (const s of [-1, 1]) for (const k of [-1, 1]) p.post('walnut', null, 0.035, 0.1, s * (w / 2 - 0.12), 0, k * (d / 2 - 0.12), 10, 0.025);
    p.slab('leather', null, w - 0.04, seatH - 0.1, d - 0.04, 0, 0.1, 0, 0.05);
    p.slab('leather', null, w - 0.44, 0.1, d - 0.28, 0, seatH - 0.02, 0.1, 0.045);
    p.slab('leather', null, w, h - 0.12, 0.24, 0, 0.1, -d / 2 + 0.12, 0.08);
    p.rod('leather', null, 0.12, w, 0, h - 0.04, -d / 2 + 0.13, 'x', 14);
    for (const s of [-1, 1]) {
      p.slab('leather', null, 0.22, h - 0.26, d, s * (w / 2 - 0.11), 0.1, 0, 0.07);
      p.rod('leather', null, 0.12, d, s * (w / 2 - 0.1), h - 0.14, 0, 'z', 14);
    }
    // deep buttoning on the back
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 9; i++) {
        const x = -w / 2 + 0.34 + ((w - 0.68) / 8) * i + (r % 2 ? 0.08 : 0);
        if (x > w / 2 - 0.3) continue;
        p.add(G.sphere(0.012, 6, 4), 'leatherBlack', null, x, seatH + 0.1 + r * 0.1, -d / 2 + 0.245);
      }
    }
  },
  tower_bar(p, w, d, h) {
    p.slab('matte', C.black, w - 0.1, 0.1, d - 0.12, 0, 0, -0.05, 0.004);
    p.slab('walnut', null, w, h - 0.15, d - 0.1, 0, 0.1, -0.03, 0.01);
    // fluted walnut front: vertical reeds catch the light at car height
    for (let i = 0; i < Math.floor(w / 0.06); i++) p.rod('walnut', null, 0.022, h - 0.2, -w / 2 + 0.04 + i * 0.06, 0.1 + (h - 0.2) / 2, d / 2 - 0.06, 'y', 8);
    p.slab('blackMarble', null, w + 0.08, 0.05, d + 0.1, 0, h - 0.05, 0.03, 0.01);
    // brass foot rail on brackets, LED under the overhang
    p.rod('brass', null, 0.022, w - 0.2, 0, 0.22, d / 2 + 0.16, 'x', 12);
    for (const x of [-w / 2 + 0.3, 0, w / 2 - 0.3]) p.box('brass', null, 0.02, 0.02, 0.16, x, 0.22, d / 2 + 0.08, 0.004);
    p.box('glow', C.warm, w, 0.01, 0.012, 0, h - 0.06, d / 2 + 0.05, 0);
  },
  tower_backbar(p, w, d, h) {
    p.slab('walnut', null, w, 0.9, d, 0, 0, 0, 0.01);
    p.slab('blackMarble', null, w + 0.02, 0.03, d + 0.02, 0, 0.9, 0, 0.004);
    // backlit onyx: the lounge's warm glow
    p.box('onyx', null, w - 0.3, 1.05, 0.03, 0, 1.5, -d / 2 + 0.03, 0.004);
    for (const y of [1.3, 1.68]) {
      p.box('glass', null, w - 0.3, 0.012, d * 0.7, 0, y, -d / 2 + d * 0.38, 0);
      for (let i = 0; i < 14; i++) {
        const x = -w / 2 + 0.3 + i * ((w - 0.6) / 13);
        const c = ['#6b3a12', '#2f4a26', '#d8d2c0', '#8a2a1a', '#3a2412'][Math.floor(hash(i * 7 + y * 10) * 5)];
        const bh = 0.2 + hash(i + y) * 0.12;
        p.post('gloss', c, 0.035, bh, x, y + 0.006, -d / 2 + 0.16, 10);
        p.post('gloss', c, 0.012, 0.07, x, y + bh, -d / 2 + 0.16, 6);
      }
    }
    for (const s of [-1, 1]) p.slab('walnut', null, 0.15, h - 0.93, d, s * (w / 2 - 0.075), 0.93, 0, 0.008);
    p.slab('walnut', null, w, 0.1, d, 0, h - 0.1, 0, 0.008);
  },
  tower_piano(p, w, d) {
    // a concert grand, lid up. Its belly is 0.65 m off the floor — the only
    // piano in the building you can drive under.
    const outline = pianoOutline(w, d);
    const key = `piano${w}x${d}`;
    p.add(G.shape(outline, 0.3, key), 'gloss', C.black, 0, 0.65, 0);
    p.add(G.shape(outline, 0.012, key), 'gloss', '#3a2a1c', 0, 0.94, 0, 0, 0, 0, 0.98, 1, 0.98);
    // the lid on its prop stick, hinged along the straight (bass) side
    const lid = outline.map(([x, z]) => [x + w / 2, z]);
    p.add(G.shape(lid, 0.018, `${key}lid`), 'gloss', C.black, -w / 2, 0.955, 0, 0, 0, 0.62);
    p.add(G.cyl(0.008, 0.008, 0.62), 'gloss', C.black, -w / 2 + 1.05, 1.2, -0.1, 0, 0, 0.35);
    // keyboard
    p.box('gloss', C.black, w - 0.02, 0.09, 0.3, 0, 0.7, d / 2 + 0.12, 0.01);
    p.box('gloss', '#f4f1e8', w - 0.2, 0.02, 0.15, 0, 0.755, d / 2 + 0.18, 0.002);
    // black keys: groups of two and three
    for (let i = 0; i < 34; i++) {
      if (i % 7 === 2 || i % 7 === 6) continue;
      p.box('gloss', C.black, 0.014, 0.014, 0.09, -w / 2 + 0.13 + (i + 1) * ((w - 0.26) / 35), 0.772, d / 2 + 0.15, 0.001);
    }
    p.add(G.box(w * 0.5, 0.2, 0.012), 'gloss', C.black, 0, 1.08, d / 2 - 0.12, -0.25, 0, 0);
    // three tapered legs on brass castors, the pedal lyre
    for (const [x, z] of [[-w / 2 + 0.14, d / 2 - 0.12], [w / 2 - 0.14, d / 2 - 0.12], [-w / 2 + 0.3, -d / 2 + 0.35]]) {
      p.post('gloss', C.black, 0.05, 0.6, x, 0.05, z, 12, 0.035);
      p.post('brass', null, 0.028, 0.05, x, 0, z, 10);
    }
    p.slab('gloss', C.black, 0.12, 0.55, 0.05, 0, 0.1, d / 2 - 0.25, 0.01);
    for (const x of [-0.04, 0, 0.04]) p.box('brass', null, 0.02, 0.01, 0.08, x, 0.11, d / 2 - 0.2, 0.002);
  },
  tower_ceodesk(p, w, d, h) {
    // a walnut slab on blade legs; cars go under, or up the easel onto it
    p.slab('walnut', null, w, 0.06, d, 0, h - 0.06, 0, 0.02);
    for (const s of [-1, 1]) {
      p.slab('brass', null, 0.025, h - 0.06, d - 0.2, s * (w / 2 - 0.25), 0, 0, 0.004);
      p.slab('brass', null, 0.06, 0.01, d - 0.16, s * (w / 2 - 0.25), 0, 0, 0.003);
    }
    p.slab('leatherBlack', null, 0.9, 0.004, 0.5, 0.3, h, -0.18, 0.002);
    p.box('anodised', null, w - 0.8, 0.06, 0.14, 0, h - 0.12, -d / 2 + 0.2, 0.004);
  },
  tower_green(p, w, d) {
    p.add(G.plane(w, d), 'turf', null, 0, 0.005, 0, -Math.PI / 2, 0, 0, 1, 1, 1, { keepUV: true });
    // the flag in the cup (no collider: a toy car goes straight through it)
    const cx = 0.4 * w;
    p.post('steel', null, 0.005, 1.0, cx, 0, 0, 6);
    p.box('matte', '#c8282a', 0.22, 0.14, 0.004, cx + 0.11, 0.92, 0, 0);
  },
  tower_globe(p, w, d, h) {
    const r = 0.34, cy = 0.58;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      p.add(G.cyl(0.025, 0.02, cy + 0.02), 'walnut', null, Math.sin(a) * 0.3, (cy + 0.02) / 2, Math.cos(a) * 0.3, Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22);
    }
    p.add(G.torus(0.3, 0.012, 6, 32), 'walnut', null, 0, 0.18, 0, Math.PI / 2, 0, 0);
    p.add(G.torus(r + 0.03, 0.018, 6, 40), 'brass', null, 0, cy, 0, Math.PI / 2, 0, 0);
    // the lower hemisphere, and the upper swung open on its meridian hinge
    p.add(G.sphere(r, 24, 12, Math.PI / 2, Math.PI / 2), 'globe', null, 0, cy, 0, 0, 0, 0, 1, 1, 1, { keepUV: true });
    p.add(G.sphere(r, 24, 12, 0, Math.PI / 2), 'globe', null, 0, cy + 0.02, -r * 0.4, -1.15, 0, 0, 1, 1, 1, { keepUV: true });
    p.add(G.torus(r + 0.035, 0.012, 6, 40, Math.PI), 'brass', null, 0, cy, 0, 0, Math.PI / 2, 0);
    // lit inside: decanters on a glowing floor
    p.add(G.cyl(r * 0.92, r * 0.92, 0.01, 24), 'glow', C.warm, 0, cy - 0.02, 0);
    for (const [x, z, c] of [[-0.1, 0.05, '#7a3a12'], [0.08, -0.06, '#b08a3a'], [0.05, 0.12, '#dcd6c6']]) {
      p.post('gloss', c, 0.045, 0.2, x, cy - 0.01, z, 10);
      p.post('gloss', c, 0.015, 0.06, x, cy + 0.19, z, 6);
    }
  },
  tower_telescope(p, w, d, h) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      p.add(G.cyl(0.015, 0.012, 1.2), 'walnut', null, Math.sin(a) * 0.2, 0.58, Math.cos(a) * 0.2, Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    }
    // aimed out over the city, north-west
    p.add(G.cyl(0.06, 0.045, 1.0, 16), 'brass', null, 0, 1.2, 0, -0.9, 0.7, 0);
    p.add(G.cyl(0.07, 0.07, 0.08, 16), 'brass', null, 0.24, 1.49, 0.24, -0.9, 0.7, 0);
  },
  tower_bookcase(p, w, d, h) {
    p.slab('walnut', null, w, h, 0.02, 0, 0, -d / 2 + 0.01, 0.004);
    for (const s of [-1, 1]) p.slab('walnut', null, 0.04, h, d, s * (w / 2 - 0.02), 0, 0, 0.006);
    const shelves = [0, 0.42, 0.82, 1.22, 1.62, 2.02];
    for (const y of shelves) p.slab('walnut', null, w, y === 0 ? 0.1 : 0.03, d, 0, y, 0, 0.004);
    p.slab('walnut', null, w + 0.04, 0.06, d + 0.02, 0, h - 0.06, 0, 0.006);
    // books: runs of spines, a stack lying flat, the odd brass thing
    let n = Math.round((w * 13) + h * 7);
    for (let s = 0; s < shelves.length - 1; s++) {
      const y0 = shelves[s] + (s === 0 ? 0.1 : 0.03);
      let x = -w / 2 + 0.06;
      while (x < w / 2 - 0.1) {
        const r = hash(n++);
        if (r < 0.06) { // an ornament
          p.add(G.sphere(0.06, 12, 8), 'brass', null, x + 0.08, y0 + 0.06, 0);
          x += 0.2; continue;
        }
        if (r < 0.12) { // a stack lying flat
          for (let k = 0; k < 4; k++) p.slab('matte', BOOKS[Math.floor(hash(n++) * BOOKS.length)], 0.24, 0.035, 0.2, x + 0.13, y0 + k * 0.036, 0.02, 0.003);
          x += 0.3; continue;
        }
        if (r < 0.17) { x += 0.12; continue; } // a gap
        const bw = 0.025 + hash(n++) * 0.035, bh = 0.2 + hash(n++) * 0.14;
        p.slab('matte', BOOKS[Math.floor(hash(n++) * BOOKS.length)], bw, bh, 0.2 + hash(n++) * 0.04, x + bw / 2, y0, 0.02, 0.003);
        x += bw + 0.003;
      }
    }
  },
  tower_boardtable(p, w, d, h) {
    // eight metres of lacquered walnut on two pedestals
    p.slab('lacquer', null, w, 0.05, d, 0, h - 0.05, 0, 0.022);
    p.box('brass', null, w - 0.5, 0.003, 0.03, 0, h + 0.001, 0, 0.001);
    for (const s of [-1, 1]) {
      p.slab('walnut', null, 0.5, h - 0.05, 0.7, s * 2.4, 0, 0, 0.012);
      p.slab('brass', null, 0.62, 0.03, 0.82, s * 2.4, 0, 0, 0.006);
      p.slab('matte', C.black, 0.52, 0.02, 0.72, s * 2.4, h - 0.07, 0, 0.004);
    }
    // an apron rail under the top edge, lit underneath so the low line glows
    p.box('walnut', null, w - 0.3, 0.04, 0.03, 0, h - 0.07, d / 2 - 0.12, 0.004);
    p.box('walnut', null, w - 0.3, 0.04, 0.03, 0, h - 0.07, -d / 2 + 0.12, 0.004);
    p.box('glow', C.warm, w - 0.4, 0.006, 0.01, 0, h - 0.092, d / 2 - 0.12, 0);
    p.box('glow', C.warm, w - 0.4, 0.006, 0.01, 0, h - 0.092, -d / 2 + 0.12, 0);
    // a leather blotter at every seat
    for (let i = 0; i < 7; i++) {
      const x = -3.4 + i * 1.1 + 0.15;
      p.slab('leatherBlack', null, 0.46, 0.003, 0.32, x, h, -d / 2 + 0.26, 0.001);
      p.slab('leatherBlack', null, 0.46, 0.003, 0.32, x + 0.3, h, d / 2 - 0.26, 0.001);
    }
    // the speakerphone (a bump on the high line) and the folio at the far
    // end that kicks you into the air
    const tri = [[0, 0.2], [0.17, -0.1], [-0.17, -0.1]];
    p.add(G.shape(tri, 0.045, 'spk'), 'matte', C.graphite, SPK[0], h, SPK[1]);
    for (const [x, z] of tri) p.add(G.cyl(0.03, 0.035, 0.05, 10), 'matte', '#44484f', SPK[0] + x * 0.9, h + 0.025, SPK[1] + z * 0.9);
    p.add(G.box(0.02, 0.006, 0.02), 'glow', '#5ad08a', SPK[0], h + 0.047, SPK[1]);
    p.add(G.box(KICK.l, 0.014, KICK.w), 'leather', null, KICK.x, h + KICK.y, KICK.z, 0, 0, KICK.ang, 1, 1, 1);
    p.add(G.box(KICK.l, KICK.rise * 0.5, KICK.w - 0.04), 'leather', null, KICK.x + 0.05, h + KICK.rise * 0.25, KICK.z, 0, 0, 0, 0.8, 1, 1);
    for (const s of [-1, 1]) p.box('brass', null, 0.04, 0.016, 0.04, KICK.x + KICK.l / 2 - 0.03, h + KICK.rise - 0.004, KICK.z + s * (KICK.w / 2 - 0.02), 0.003);
  },
  tower_terracebench(p, w, d, h) {
    for (const x of [-w / 2 + 0.4, 0, w / 2 - 0.4]) p.slab('matte', C.concrete, 0.5, h - 0.05, d - 0.1, x, 0, 0, 0.02);
    for (let i = 0; i < 5; i++) p.slab('teak', null, w, 0.045, d / 5 - 0.02, 0, h - 0.045, -d / 2 + (d / 5) * (i + 0.5), 0.006);
    p.box('glow', C.warm, w - 1.2, 0.01, 0.01, 0, 0.05, d / 2 - 0.08, 0);
  },
  tower_olive(p, w, d, h) {
    p.slab('anodised', null, w, h, d, 0, 0, 0, 0.02);
    p.slab('matte', C.soil, w - 0.08, 0.02, d - 0.08, 0, h - 0.03, 0, 0.004);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      p.add(G.cyl(0.035, 0.05, 1.0, 8), 'matte', C.bark, Math.sin(a) * 0.06, h + 0.45, Math.cos(a) * 0.06, Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18);
    }
  },
  tower_lounger(p, w, d, h) {
    p.slab('teak', null, w, 0.05, d, 0, h - 0.13, 0, 0.01);
    for (const s of [-1, 1]) for (const k of [-1, 1]) p.slab('teak', null, 0.05, h - 0.13, 0.05, s * (w / 2 - 0.05), 0, k * (d / 2 - 0.1), 0.004);
    p.slab('fabric', C.ivory, w - 0.06, 0.07, d * 0.62, 0, h - 0.08, -d * 0.18, 0.03);
    p.add(G.box(w - 0.06, 0.07, d * 0.34, 0.03), 'fabric', C.ivory, 0, h + 0.1, d / 2 - d * 0.16, 0.7, 0, 0);
  },
  tower_mast(p, w, d, h) {
    p.slab('matte', C.concrete, w, 0.25, d, 0, 0, 0, 0.02);
    p.post('steel', null, 0.045, h - 0.25, 0, 0.25, 0, 10, 0.06);
    p.post('steel', null, 0.1, 0.02, 0, h * 0.6, 0, 12);
    p.post('anodised', null, 0.04, 0.06, 0, h - 0.02, 0, 10);
  },
  tower_island(p, w, d, h) {
    p.slab('matte', C.black, w - 0.2, 0.08, d - 0.2, 0, 0, 0, 0.004);
    p.slab('walnut', null, w - 0.1, h - 0.12, d - 0.1, 0, 0.08, 0, 0.01);
    for (let i = 0; i < Math.floor((w - 0.2) / 0.06); i++) {
      for (const s2 of [-1, 1]) p.rod('walnut', null, 0.02, h - 0.2, -w / 2 + 0.13 + i * 0.06, 0.08 + (h - 0.2) / 2, s2 * (d / 2 - 0.05), 'y', 8);
    }
    p.slab('marble', null, w, 0.04, d, 0, h - 0.04, 0, 0.004);
    for (const s of [-1, 1]) p.slab('marble', null, 0.04, h - 0.04, d, s * (w / 2 - 0.02), 0, 0, 0.004);
  },
  tower_deskrow(p, w, d, h) {
    // double bench desking along z: white tops either side of a fabric
    // privacy screen that runs to the floor (the rows are a slalom, not a
    // tunnel), steel trestles, three screens per seat
    for (const s of [-1, 1]) p.slab('matte', C.white, w / 2 - 0.04, 0.025, d, s * (w / 4 + 0.01), h - 0.025, 0, 0.006);
    p.slab('fabric', C.charcoal, 0.05, 1.16, d - 0.02, 0, 0.04, 0, 0.012);
    p.slab('matte', C.steelDark, 0.07, 0.04, d, 0, 0, 0, 0.004);
    const bays = Math.max(2, Math.round(d / 1.5));
    for (let i = 0; i <= bays; i++) {
      const z = -d / 2 + 0.08 + ((d - 0.16) / bays) * i;
      for (const s of [-1, 1]) p.slab('matte', C.steelDark, 0.04, h - 0.025, 0.06, s * (w / 2 - 0.08), 0, z, 0.004);
      p.box('matte', C.steelDark, w - 0.16, 0.04, 0.05, 0, h - 0.06, z, 0.004);
      p.box('matte', C.steelDark, w - 0.16, 0.03, 0.05, 0, 0.08, z, 0.004);
    }
    // cable trays under both tops
    for (const s of [-1, 1]) p.box('matte', C.graphite, 0.14, 0.05, d - 0.4, s * 0.12, h - 0.12, 0, 0.004);
    let k = Math.round(d * 10 + w * 3);
    for (let i = 0; i < bays; i++) {
      const z0 = -d / 2 + ((d) / bays) * (i + 0.5);
      for (const s of [-1, 1]) {
        for (const m of [-1, 0, 1]) {
          const sc = SCREENS[Math.floor(hash(k++) * SCREENS.length)];
          // facing the seat on this side, the outer two angled in
          const ry = Math.atan2(s, -m * 0.42), nx = Math.sin(ry), nz = Math.cos(ry);
          const x = s * 0.12 - nx * 0.02, z = z0 + m * 0.5;
          p.add(G.box(0.53, 0.32, 0.018, 0.004), 'matte', C.black, x, h + 0.25, z, 0, ry, 0);
          p.add(G.plane(0.5, 0.29), 'glow', sc, x + nx * 0.0095, h + 0.25, z + nz * 0.0095, 0, ry, 0);
          p.add(G.box(0.03, 0.14, 0.03), 'matte', C.steelDark, x - nx * 0.03, h + 0.07, z - nz * 0.03, 0, ry, 0);
        }
        p.box('matte', C.graphite, 0.14, 0.012, 0.44, s * 0.45, h + 0.006, z0, 0.004);
      }
    }
  },
  tower_booth(p, w, d, h) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.slab('anodised', null, 0.04, h, 0.04, sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02), 0.004);
    p.slab('anodised', null, w, 0.1, d, 0, h - 0.1, 0, 0.01);
    p.slab('matte', C.graphite, w, 0.04, d, 0, 0, 0, 0.006);
    p.box('fabric', C.sage, w - 0.08, h - 0.2, 0.04, 0, h / 2, -d / 2 + 0.04, 0.01);
    for (const s of [-1, 1]) p.box('glass', null, 0.012, h - 0.16, d - 0.08, s * (w / 2 - 0.02), h / 2, 0, 0);
    p.box('glass', null, w - 0.08, h - 0.16, 0.012, 0, h / 2, d / 2 - 0.02, 0);
    p.box('steel', null, 0.02, 0.4, 0.03, w / 2 - 0.12, 1.05, d / 2 + 0.01, 0.004);
    p.slab('walnut', null, w - 0.12, 0.03, 0.3, 0, 0.95, -d / 2 + 0.2, 0.006);
    p.post('leather', null, 0.17, 0.46, 0, 0, 0.1, 16);
    p.box('glow', C.warm, w - 0.2, 0.01, d - 0.2, 0, h - 0.105, 0, 0);
  },
};

// the speakerphone and the kicker, in table-local metres (shared with the
// colliders so what you see is what you hit)
const SPK = [-0.8, 0.3];
const KICK = { x: 3.55, z: 0.4, l: 0.5, w: 0.62, rise: 0.055, ang: Math.atan2(0.055, 0.5) };
// the folio's centre height over the table: sunk by its half-thickness so its
// leading edge is flush with the lacquer (a 1 cm lip there stopped cars dead,
// and jammed any placard they were pushing)
KICK.y = KICK.rise / 2 - 0.01;

function pianoOutline(w, d) {
  const hw = w / 2, hd = d / 2;
  const pts = [[-hw, hd], [hw, hd], [hw, hd - 0.4]];
  // the treble side's bentside curves in toward the tail…
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    pts.push([hw - (w - 0.45) * (0.5 - 0.5 * Math.cos(t * Math.PI)), hd - 0.4 - t * (d - 0.75)]);
  }
  // …and rounds off into the tail against the straight bass side
  pts.push([-hw + 0.32, -hd + 0.1], [-hw + 0.16, -hd + 0.01], [-hw + 0.04, -hd + 0.06]);
  pts.push([-hw, -hd + 0.2]);
  return pts;
}

// ===================================================== colliders
// cuboid colliders per furniture type, local metres:
// [halfW, halfH, halfD, x, y, z, rotZ?, rotY?]
export const COLLIDE = {
  tower_reception: (w, d, h) => {
    const cr = crescent(w, d);
    const Rm = cr.R - cr.band / 2;
    const out = [];
    for (let i = 0; i < 5; i++) {
      const t = -cr.a + ((2 * cr.a) / 5) * (i + 0.5);
      const L = 2 * Rm * Math.sin(cr.a / 5) + 0.05;
      out.push([L / 2, h / 2, cr.band / 2, Math.sin(t) * Rm, h / 2, cr.zc + Math.cos(t) * Rm, 0, t]);
    }
    return out;
  },
  tower_plinth: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0], [0.18, 0.3, 0.18, 0, h + 0.3, 0]],
  // the seat on its two chrome X-frames: open underneath, like it looks
  tower_bench: (w, d, h) => [
    [w / 2, 0.045, d / 2, 0, h - 0.045, 0],
    [0.02, (h - 0.09) / 2, 0.14, -(w / 2 - 0.12), (h - 0.09) / 2, 0], [0.02, (h - 0.09) / 2, 0.14, w / 2 - 0.12, (h - 0.09) / 2, 0],
  ],
  tower_credenza: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
  tower_fireplace: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
  tower_sofa: (w, d, h) => [[w / 2, 0.21, d / 2, 0, 0.21, 0], [w / 2, h / 2, 0.12, 0, h / 2, -d / 2 + 0.12]],
  tower_bar: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
  tower_backbar: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
  tower_piano: (w, d) => [
    [w / 2, 0.16, d / 2, 0, 0.81, 0],
    [w / 2 - 0.01, 0.05, 0.15, 0, 0.7, d / 2 + 0.12],
    [0.05, 0.33, 0.05, -w / 2 + 0.14, 0.33, d / 2 - 0.12], [0.05, 0.33, 0.05, w / 2 - 0.14, 0.33, d / 2 - 0.12],
    [0.05, 0.33, 0.05, -w / 2 + 0.3, 0.33, -d / 2 + 0.35], [0.06, 0.3, 0.03, 0, 0.35, d / 2 - 0.25],
  ],
  tower_ceodesk: (w, d, h) => [
    [w / 2, 0.03, d / 2, 0, h - 0.03, 0],
    [0.015, (h - 0.06) / 2, d / 2 - 0.1, -(w / 2 - 0.25), (h - 0.06) / 2, 0],
    [0.015, (h - 0.06) / 2, d / 2 - 0.1, w / 2 - 0.25, (h - 0.06) / 2, 0],
  ],
  tower_globe: (w, d, h) => [[0.36, h / 2, 0.36, 0, h / 2, 0]],
  tower_telescope: () => [[0.24, 0.7, 0.24, 0, 0.7, 0]],
  tower_bookcase: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
  tower_boardtable: (w, d, h) => [
    [w / 2, 0.025, d / 2, 0, h - 0.025, 0],
    [0.25, (h - 0.05) / 2, 0.35, -2.4, (h - 0.05) / 2, 0], [0.25, (h - 0.05) / 2, 0.35, 2.4, (h - 0.05) / 2, 0],
    [0.12, 0.022, 0.12, SPK[0], h + 0.022, SPK[1]],
    [KICK.l / 2, 0.01, KICK.w / 2, KICK.x, h + KICK.y, KICK.z, KICK.ang],
  ],
  // the teak top on three concrete plinths (there's 40 cm of air between them)
  tower_terracebench: (w, d, h) => [
    [w / 2, 0.0225, d / 2, 0, h - 0.0225, 0],
    ...[-w / 2 + 0.4, 0, w / 2 - 0.4].map((x) => [0.25, (h - 0.05) / 2, (d - 0.1) / 2, x, (h - 0.05) / 2, 0]),
  ],
  tower_olive: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0], [0.08, 0.5, 0.08, 0, h + 0.5, 0]],
  // the slatted bed, its raised back and four legs — a car fits underneath
  tower_lounger: (w, d, h) => [
    [w / 2, 0.075, d / 2, 0, h - 0.055, 0],
    [w / 2, 0.12, d * 0.16, 0, h + 0.08, d / 2 - d * 0.16],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([s, k]) => [0.025, (h - 0.13) / 2, 0.025, s * (w / 2 - 0.05), (h - 0.13) / 2, k * (d / 2 - 0.1)]),
  ],
  tower_mast: (w, d, h) => [[w / 2, 0.125, d / 2, 0, 0.125, 0], [0.06, h / 2, 0.06, 0, h / 2, 0]],
  tower_island: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
  tower_mediawall: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0], [w / 2 - 0.15, 0.02, 0.15, 0, 0.42, d / 2 + 0.15]],
  tower_desk: (w, d, h) => [
    [w / 2, 0.02, d / 2, 0, h - 0.02, 0],
    [0.02, (h - 0.04) / 2, d / 2 - 0.02, -(w / 2 - 0.02), (h - 0.04) / 2, 0], [0.02, (h - 0.04) / 2, d / 2 - 0.02, w / 2 - 0.02, (h - 0.04) / 2, 0],
    [w / 2 - 0.04, (h - 0.4) / 2, 0.01, 0, 0.36 + (h - 0.4) / 2, d / 2 - 0.04],
  ],
  tower_espresso: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0], [0.24, 0.2, 0.32, 0.02, h + 0.2, -d / 2 + 0.45]],
  tower_fridgewall: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
  // top, privacy screen, and every trestle as drawn (two legs and the low
  // bar between them) — not a solid panel at each end and nothing between
  tower_deskrow: (w, d, h) => {
    const out = [[w / 2 - 0.02, 0.0125, d / 2, 0, h - 0.0125, 0], [0.05, 0.6, d / 2, 0, 0.6, 0]];
    const bays = Math.max(2, Math.round(d / 1.5));
    for (let i = 0; i <= bays; i++) {
      const z = -d / 2 + 0.08 + ((d - 0.16) / bays) * i;
      for (const s of [-1, 1]) out.push([0.02, (h - 0.025) / 2, 0.03, s * (w / 2 - 0.08), (h - 0.025) / 2, z]);
      out.push([w / 2 - 0.08, 0.015, 0.025, 0, 0.08, z]);
    }
    return out;
  },
  tower_booth: (w, d, h) => [[w / 2, h / 2, d / 2, 0, h / 2, 0]],
};
export const FRICTION = { tower_boardtable: 0.5, tower_ceodesk: 0.9, tower_terracebench: 1.1, tower_bar: 0.8, tower_island: 0.7 };

// ========================================================= walls
// Each styled wall entry (world units) → parts in its own frame: metres,
// centred, long axis along local x.
export function wallFrame(wl) {
  const alongX = wl.w >= wl.d;
  return { L: (alongX ? wl.w : wl.d) / M, T: (alongX ? wl.d : wl.w) / M, rotY: alongX ? 0 : Math.PI / 2, x: wl.x, z: wl.z, h: wl.h / M };
}

export const WALL_BUILD = {
  // floor-to-ceiling tinted glazing between slim anodised mullions; blinds
  // on the west and east facades (the low suns come through those)
  tower_curtain(p, L, T, h, wl) {
    p.box('facade', null, L, h, 0.02, 0, h / 2, 0, 0);
    p.box('anodised', null, L, 0.1, 0.16, 0, h - 0.05, 0, 0.004);
    p.box('anodised', null, L, 0.05, 0.14, 0, 0.025, 0, 0.004);
    const n = Math.max(1, Math.round(L / 1.5));
    for (let i = 0; i <= n; i++) p.box('anodised', null, 0.05, h, 0.14, -L / 2 + (L / n) * i, h / 2, 0, 0.004);
    // half-lowered venetian blinds hang inside the glass (inside = −x side
    // for the east facade, +x for the west; the frame turns them)
    const west = wl.x < -20 * M, east = wl.x > 20 * M && wl.z < 3 * M;
    if (west || east) {
      const inside = west ? 1 : -1; // wall-local z: rotY π/2 turns local +z to world +x
      const bottom = west ? 1.9 : 2.35;
      for (let y = h - 0.14; y > bottom; y -= 0.055) p.add(G.box(L, 0.003, 0.05), 'matte', '#e3ddd2', 0, y, inside * 0.12, 0.55, 0, 0);
      p.box('matte', '#cfc8bb', L, 0.02, 0.06, 0, bottom - 0.02, inside * 0.12, 0.004);
      p.box('matte', '#cfc8bb', L, 0.06, 0.07, 0, h - 0.13, inside * 0.12, 0.004);
    }
  },
  tower_glass(p, L, T, h) {
    p.box('glass', null, L, h - 0.12, 0.012, 0, h / 2, 0, 0);
    p.box('frosted', null, L, 0.6, 0.014, 0, 1.2, 0, 0);
    p.box('steel', null, L, 0.07, 0.1, 0, h - 0.035, 0, 0.004);
    p.box('steel', null, L, 0.05, 0.08, 0, 0.025, 0, 0.004);
    for (const s of [-1, 1]) p.box('steel', null, 0.04, h, 0.1, s * (L / 2 - 0.02), h / 2, 0, 0.004);
  },
  tower_stone(p, L, T, h) {
    p.box('marble', null, L, h - 0.12, T, 0, 0.12 + (h - 0.12) / 2, 0, 0.004);
    p.box('blackMarble', null, L + 0.02, 0.12, T + 0.02, 0, 0.06, 0, 0.004);
    p.box('brass', null, L + 0.022, 0.008, T + 0.022, 0, 0.124, 0, 0.001);
  },
  tower_balustrade(p, L) {
    p.box('glass', null, L, 1.03, 0.016, 0, 0.6, 0, 0);
    p.box('anodised', null, L, 0.12, 0.1, 0, 0.06, 0, 0.006);
    p.rod('steel', null, 0.025, L, 0, 1.13, 0, 'x', 10);
  },
  tower_core(p, L, T, h, wl, lifts) {
    const xw = wl.x / M, zw = wl.z / M;
    // plaster box on a walnut skirting
    const front = zw < -2 ? 0.9 : 0; // the lift block has a stone front
    p.box('plaster', C.plaster, L, h, T - front, 0, h / 2, front / 2, 0.004);
    p.box('walnut', null, L + 0.03, 0.12, T - front + 0.03, 0, 0.06, front / 2, 0.004);
    if (zw > 0) {
      // the north-west block: its war room face is walnut panelling
      p.box('walnut', null, L, h - 0.12, 0.02, 0, 0.12 + (h - 0.12) / 2, T / 2 + 0.01, 0.004);
      for (let i = 1; i < 5; i++) p.box('matte', C.black, 0.008, h - 0.12, 0.004, -L / 2 + (L / 5) * i, 0.12 + (h - 0.12) / 2, T / 2 + 0.022, 0);
      return;
    }
    // the lift lobby face: marble piers, six openings, the walnut logo wall
    const z0 = -T / 2; // the lobby face (world z = −4)
    const holes = lifts.map((x) => [x - xw - 0.55, x - xw + 0.55]);
    const edges = [-L / 2, ...holes.flat(), -2.3 - xw, 2.3 - xw, L / 2].sort((a, b) => a - b);
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i], b = edges[i + 1], mid = (a + b) / 2;
      if (b - a < 0.01) continue;
      const hole = holes.some(([h0, h1]) => mid > h0 && mid < h1);
      const logo = Math.abs(mid + xw) < 2.3;
      if (hole) {
        p.box('marble', null, b - a, h - 2.4, front, mid, 2.4 + (h - 2.4) / 2, z0 + front / 2, 0.004);
        continue;
      }
      p.box(logo ? 'walnut' : 'marble', null, b - a, h - 0.12, front, mid, 0.12 + (h - 0.12) / 2, z0 + front / 2, 0.004);
      p.box('blackMarble', null, b - a + 0.01, 0.12, front + 0.02, mid, 0.06, z0 + front / 2, 0.004);
    }
    // cove light over the logo
    p.box('glow', C.warm, 4.5, 0.012, 0.02, -xw, h - 0.02, z0 - 0.04, 0);
    for (const [h0, h1] of holes) {
      const cx = (h0 + h1) / 2;
      // the car: a lit box with a steel back and a brass handrail
      p.box('steel', null, 1.1, 2.4, 0.02, cx, 1.2, z0 + front - 0.02, 0);
      for (const s of [-1, 1]) p.box('brass', null, 0.02, 2.4, front, cx + s * 0.55, 1.2, z0 + front / 2, 0);
      p.box('matte', '#2a2522', 1.1, 0.01, front, cx, 0.005, z0 + front / 2, 0);
      p.box('glow', C.warm, 1.0, 0.012, front - 0.1, cx, 2.39, z0 + front / 2, 0);
      p.rod('brass', null, 0.015, 0.9, cx, 0.9, z0 + front - 0.07, 'x', 8);
      // brass architrave
      for (const s of [-1, 1]) p.box('brass', null, 0.06, 2.46, 0.04, cx + s * 0.58, 1.23, z0 - 0.015, 0.004);
      p.box('brass', null, 1.22, 0.06, 0.04, cx, 2.43, z0 - 0.015, 0.004);
      // the landing sill
      p.box('brass', null, 1.1, 0.006, 0.12, cx, 0.003, z0 - 0.05, 0);
    }
  },
};

// ========================================================= ramps
// Ramp skins, drawn in the ramp's frame (metres): rising toward +z, foot at
// −l/2, top at +l/2, `rise` high, `w` wide. The collider is Office.jsx's.
export const RAMP_BUILD = {
  // a staircase of annual reports, the top one open like a lid, a stack of
  // binders for the sides
  tower_binders(p, l, w, rise) {
    // step i's front edge sits exactly on the slope, so nothing pokes through the deck
    const n = 12;
    for (let i = 1; i < n; i++) {
      const len = l * (1 - i / n), col = ['#e9e1cf', '#1f2a44', '#e9e1cf', '#5a1f1b', '#e9e1cf', '#b8893b'][i % 6];
      p.slab('matte', col, w - 0.03 + (hash(i) - 0.5) * 0.03, (rise / n) * 0.97, len, (hash(i + 9) - 0.5) * 0.02, (rise * (i - 1)) / n, l / 2 - len / 2, 0.004);
    }
    p.add(wedge(l, w - 0.06, rise - 0.03), 'matte', '#d8d0bd', 0, 0, 0);
    // the deck: a single hard-cover annual report lying on the slope
    const ang = Math.atan2(rise, l);
    p.add(G.box(w, 0.012, Math.hypot(l, rise)), 'matte', '#1f2a44', 0, rise / 2 + 0.008, 0, -ang, 0, 0);
    p.add(G.box(w * 0.5, 0.002, 0.3), 'brass', null, 0, rise / 2 + 0.016, 0.1, -ang, 0, 0);
  },
  // an A-frame easel, knocked over, leaning on the desk
  tower_easel(p, l, w, rise) {
    const ang = Math.atan2(rise, l), len = Math.hypot(l, rise);
    p.add(G.box(w, 0.025, len), 'teak', null, 0, rise / 2 + 0.005, 0, -ang, 0, 0);
    for (const s of [-1, 1]) p.add(G.box(0.04, 0.05, len + 0.1), 'teak', null, s * (w / 2 - 0.02), rise / 2 - 0.02, 0, -ang, 0, 0);
    p.add(G.box(w + 0.1, 0.03, 0.04), 'teak', null, 0, 0.02, -l / 2 + 0.1, 0, 0, 0);
    // the flip chart it was holding: a sheet of paper and the Q3 numbers
    p.add(G.box(w - 0.1, 0.004, len * 0.7), 'matte', '#f4f2ec', 0, rise / 2 + 0.02, 0.05, -ang, 0, 0);
    p.add(G.box(0.3, 0.004, 0.02), 'matte', '#c8282a', 0.05, rise / 2 + 0.024, 0.1, -ang, 0, 0.1);
    p.add(G.box(0.2, 0.004, 0.02), 'matte', '#1f5aa8', -0.08, rise / 2 + 0.024, -0.1, -ang, 0, -0.2);
  },
  // coffee-table books, a leaning tower of them
  tower_books(p, l, w, rise) {
    const n = 14;
    for (let i = 1; i < n; i++) {
      const len = l * (1 - i / n);
      p.slab('matte', BOOKS[i % BOOKS.length], w - 0.05 + (hash(i * 3) - 0.5) * 0.05, (rise / n) * 0.97, len, (hash(i * 5) - 0.5) * 0.04, (rise * (i - 1)) / n, l / 2 - len / 2, 0.006);
    }
    const ang = Math.atan2(rise, l);
    p.add(G.box(w, 0.015, Math.hypot(l, rise)), 'leather', null, 0, rise / 2 + 0.01, 0, -ang, 0, 0);
  },
  // teak decking step
  tower_deck(p, l, w, rise) {
    const ang = Math.atan2(rise, l), len = Math.hypot(l, rise);
    p.add(G.shape([[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]], 0.001, 'deckbase'), 'matte', C.concrete, 0, 0, 0);
    p.add(wedge(l, w - 0.04, rise - 0.03), 'matte', C.concrete, 0, 0, 0);
    for (let i = 0; i < 5; i++) p.add(G.box(w / 5 - 0.015, 0.03, len), 'teak', null, -w / 2 + (w / 5) * (i + 0.5), rise / 2, 0, -ang, 0, 0);
  },
  // crates of sparkling water
  tower_crates(p, l, w, rise) {
    const n = 4;
    for (let i = 1; i < n; i++) {
      const len = l * (1 - i / n);
      p.slab('matte', i % 2 ? '#2f5d8a' : '#3a6fa0', w, (rise / n) * 0.96, len, 0, (rise * (i - 1)) / n, l / 2 - len / 2, 0.012);
    }
    p.add(wedge(l, w - 0.02, rise - 0.03), 'matte', '#2f5d8a', 0, 0, 0);
    const ang = Math.atan2(rise, l);
    p.add(G.box(w, 0.02, Math.hypot(l, rise)), 'teak', null, 0, rise / 2 + 0.008, 0, -ang, 0, 0);
  },
};

function wedge(l, w, rise) {
  const key = `wedge${l.toFixed(3)}${w.toFixed(3)}${rise.toFixed(3)}`;
  if (!wedge.cache) wedge.cache = new Map();
  let g = wedge.cache.get(key);
  if (!g) {
    const x0 = -w / 2, x1 = w / 2, z0 = -l / 2, z1 = l / 2;
    const v = [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1, x0, rise, z1, x1, rise, z1];
    const idx = [0, 5, 1, 0, 4, 5, 3, 2, 5, 3, 5, 4, 0, 1, 2, 0, 2, 3, 0, 3, 4, 1, 5, 2];
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    b.setIndex(idx);
    g = b.toNonIndexed();
    g.computeVertexNormals();
    wedge.cache.set(key, g);
  }
  return g;
}

// ================================================ ceiling fixtures
// Everything that glows on the ceiling, as parts in world metres (placed at
// the origin): downlight rims, the war room's LED ring, the lobby's rings,
// the bar's pendants. The glowing parts use the 'lamp' key (their brightness
// follows the hour); the trim is ordinary metal.
export function ceilingParts(p, map) {
  const lamps = [];
  const rooms = map.ROOMS.filter((r) => !r.outdoor);
  const cx = (r) => r.x / M, cz = (r) => r.z / M;
  for (const r of rooms) {
    const w = r.w / M, d = r.d / M;
    if (r.id === 'tower_lobby' || r.id === 'tower_warroom' || r.id === 'tower_bullpen') continue;
    const nx = Math.max(1, Math.round(w / 2.4)), nz = Math.max(1, Math.round(d / 2.4));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = cx(r) - w / 2 + (i + 0.5) * (w / nx), z = cz(r) - d / 2 + (j + 0.5) * (d / nz);
        // the core's blocks have no ceiling light of their own
        if (r.id === 'tower_core' && !(Math.abs(z + 0.5) < 0.8 || (x > -3 && x < 3 && z > 0))) continue;
        lamps.push([x, z]);
      }
    }
  }
  for (const [x, z] of lamps) {
    p.add(G.cyl(0.09, 0.09, 0.01, 16), 'lamp', C.warm, x, H - 0.006, z);
    p.add(G.torus(0.1, 0.012, 6, 20), 'brass', null, x, H - 0.008, z, Math.PI / 2, 0, 0);
  }
  // the bullpen: long linear slots
  for (let z = -11; z <= -3; z += 2) {
    p.box('lamp', C.cool, 12, 0.012, 0.08, 14, H - 0.008, z, 0);
    p.box('anodised', null, 12.1, 0.02, 0.14, 14, H - 0.012, z, 0);
  }
  // the lobby: three brass-rimmed light rings
  for (const x of [-4, 0, 4]) {
    p.add(G.torus(1.1, 0.03, 8, 64), 'lamp', C.warm, x, 2.75, -8.4, Math.PI / 2, 0, 0);
    p.add(G.torus(1.1, 0.045, 8, 64), 'brass', null, x, 2.8, -8.4, Math.PI / 2, 0, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      p.add(G.cyl(0.003, 0.003, H - 2.8), 'steel', null, x + Math.sin(a) * 1.1, (H + 2.8) / 2, -8.4 + Math.cos(a) * 1.1);
    }
  }
  // the war room: a 7 m LED ring over the table, on wires
  p.box('anodised', null, 7.2, 0.06, 0.08, -1.6, 2.5, 7.0, 0.01);
  p.box('anodised', null, 7.2, 0.06, 0.08, -1.6, 2.5, 8.2, 0.01);
  for (const s of [-1, 1]) p.box('anodised', null, 0.08, 0.06, 1.28, -1.6 + s * 3.6, 2.5, 7.6, 0.01);
  for (const z of [7.0, 8.2]) p.box('lamp', C.warm, 7.1, 0.01, 0.05, -1.6, 2.468, z, 0);
  for (const [x, z] of [[-5, 7.0], [1.8, 7.0], [-5, 8.2], [1.8, 8.2]]) p.add(G.cyl(0.002, 0.002, H - 2.5), 'steel', null, x, (H + 2.5) / 2, z);
  // war room downlights round the edge
  for (const [x, z] of [[-7.5, 4.5], [-7.5, 10.5], [4.5, 4.5], [4.5, 10.5], [-1.6, 4.3], [-1.6, 11]]) {
    p.add(G.cyl(0.09, 0.09, 0.01, 16), 'lamp', C.warm, x, H - 0.006, z);
    p.add(G.torus(0.1, 0.012, 6, 20), 'brass', null, x, H - 0.008, z, Math.PI / 2, 0, 0);
  }
  // three brass globe pendants over the bar
  for (const x of [-11, -9.9, -8.8]) {
    p.add(G.sphere(0.13, 16, 10), 'lamp', C.warm, x, 2.35, -2.4);
    p.add(G.cyl(0.05, 0.08, 0.06, 12), 'brass', null, x, 2.5, -2.4);
    p.add(G.cyl(0.003, 0.003, H - 2.5), 'brass', null, x, (H + 2.5) / 2, -2.4);
  }
  // pendants over the pantry island
  for (const x of [11.8, 12.8, 13.8]) {
    p.add(G.cone(0.14, 0.18, 16), 'brass', null, x, 2.3, 0.6);
    p.add(G.cyl(0.1, 0.1, 0.01, 16), 'lamp', C.warm, x, 2.205, 0.6);
    p.add(G.cyl(0.003, 0.003, H - 2.39), 'steel', null, x, (H + 2.39) / 2, 0.6);
  }
  return lamps;
}
