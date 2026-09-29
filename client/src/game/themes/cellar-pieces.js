// The cellar's furniture, built as parts into the static batch (cellar-kit.js).
// Every builder works in the piece's own frame, in metres: origin on the floor
// at the middle of the footprint, front toward +z, width along x. Colliders
// are separate (cellar.jsx PIECE_COLLIDERS) — they stay simple boxes.
//
// Detail follows the camera: it sits half a metre up and looks along the
// floor, so feet, plinths, kick plates and the first metre of every front get
// real geometry; the tops of tall things get silhouette only.
import { M } from '@rc/shared';
import { rng, unitCyl } from './cellar-kit.js';

// ------------------------------------------------------------- palette
export const C = {
  rack: '#1a1c20', rackEdge: '#2a2d33', steel: '#8c9297', galv: '#a9afb2', chrome: '#d6dadd', black: '#141516',
  white: '#e6e8e6', cream: '#d9d3bf', beige: '#cfc5a8', red: '#b3342b', boiler: '#7c2f28', yellow: '#e6c229',
  orange: '#e0762a', blue: '#2f6fd6', paleBlue: '#6d8fb3', green: '#3d8b4f', meshGreen: '#3f7a3a', copper: '#b87333',
  brass: '#b59a4a', conc: '#9a9b95', rubber: '#1c1c1c', wood: '#b89464', mdf: '#a88a62', laminate: '#c8ccc4',
  esd: '#3f6e8c', door: '#6f7e76', veneer: '#9c7a52', plastic: '#2f333b',
};

// the frame a furniture entry lives in: position, turn, local dims (metres)
export function pieceFrame(f) {
  const rot = f.face ?? f.rotY ?? 0;
  const quarter = f.face != null && Math.abs(Math.sin(f.face)) > 0.7;
  return {
    x: f.x / M, z: f.z / M, rot,
    w: (quarter ? f.d : f.w) / M, d: (quarter ? f.w : f.d) / M, h: f.h / M,
  };
}
const seedOf = (f) => Math.abs(Math.round(f.x * 131 + f.z * 977)) + 1;

// ----------------------------------------------------------------- bits
// A CRT monitor: beige box, deep tapering back, a curved dark glass front.
export function crt(k, x, y, z, ry = 0, tint = C.beige, sc = 1) {
  k.at(x, y, z, ry, () => {
    const s = sc;
    k.rbox('plastic', [0.38 * s, 0.34 * s, 0.1 * s], 0.02 * s, [0, 0.19 * s, 0.13 * s], { c: tint });
    k.part('plastic', unitCyl(4, 0.55), [0, 0.18 * s, -0.04 * s], { s: [0.28 * s, 0.26 * s, 0.28 * s], r: [-Math.PI / 2, Math.PI / 4, 0], c: tint });
    k.box('plastic', [0.3 * s, 0.24 * s, 0.01 * s], [0, 0.19 * s, 0.181 * s], { c: '#1d2622' });
    k.block('plastic', [0.26 * s, 0.03 * s, 0.22 * s], [0, 0, 0.06 * s], { c: tint }); // swivel foot
  });
}
// a beige PC tower
export function tower(k, x, y, z, ry = 0, tint = C.beige) {
  k.at(x, y, z, ry, () => {
    k.rbox('plastic', [0.18, 0.42, 0.44], 0.012, [0, 0.21, 0], { c: tint });
    k.box('plastic', [0.14, 0.05, 0.005], [0, 0.34, 0.222], { c: '#9d9582' }); // floppy / CD bay
    k.box('plastic', [0.14, 0.05, 0.005], [0, 0.28, 0.222], { c: '#9d9582' });
    k.box('plastic', [0.012, 0.012, 0.004], [0.05, 0.12, 0.223], { c: '#3a5a3a' }); // a power LED, long dark
  });
}
export function keyboard(k, x, y, z, ry = 0, tint = C.beige) {
  k.at(x, y, z, ry, () => {
    k.block('plastic', [0.45, 0.03, 0.16], [0, 0, 0], { c: tint });
    k.block('plastic', [0.42, 0.012, 0.12], [0, 0.03, 0.005], { c: '#8f8878' });
  });
}
// a card box with the tape stripe, from the shared cardboard texture
export function cardBox(k, x, y, z, ry, [w, h, d], shade = '#ffffff') {
  k.at(x, y, z, ry, () => k.block('card', [w, h, d], [0, 0, 0], { c: shade }));
}
// a loose tangle of cable: random wandering tubes, deliberately heaped
export function tangle(k, x, y, z, rad, n, seed, colors = ['#1c1c1c', '#2b2b2b', '#e6e6e6', C.blue, '#555']) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    let px = x + (r() - 0.5) * rad, py = y + r() * rad * 0.3, pz = z + (r() - 0.5) * rad;
    const c = colors[i % colors.length];
    for (let s = 0; s < 7; s++) {
      const a = r() * Math.PI * 2;
      const nx = x + (px - x) * 0.6 + Math.cos(a) * rad * 0.5;
      const nz = z + (pz - z) * 0.6 + Math.sin(a) * rad * 0.5;
      const ny = Math.max(y + 0.01, y + r() * rad * 0.45);
      k.rod('rubber', 0.006, [px, py, pz], [nx, ny, nz], { c, seg: 5 });
      px = nx; py = ny; pz = nz;
    }
  }
}
// three-spoke hand wheel in the xy plane
export function handWheel(k, x, y, z, rad, color) {
  k.ring('steel', rad, 0.012, [x, y, z], { c: color });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    k.rod('steel', 0.007, [x, y, z], [x + Math.cos(a) * rad, y + Math.sin(a) * rad, z], { c: color, seg: 5 });
  }
  k.cyl('steel', 0.02, 0.04, [x, y, z], { r: [Math.PI / 2, 0, 0], c: '#444' });
}


// ================================================================= pieces
// Racks: the server hall's rows. Perforated doors front and back (the LEDs
// behind are instanced and blink — cellar.jsx), servers and blanking panels
// behind the front door, cable waterfalls and blue power-strip LEDs behind
// the back one. The network rack is open: patch panels and cable loops.
function rack(k, { w, d, h }, f, r) {
  const open = f.kind === 'network';
  const t = 0.03;
  // plinth, levelling feet, casters
  k.block('rubber', [w - 0.04, 0.06, d - 0.04], [0, 0.02, 0], { c: C.black });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('steel', 0.025, 0.03, [sx * (w / 2 - 0.06), 0.015, sz * (d / 2 - 0.06)], { c: C.galv, seg: 8 });
  }
  // frame: side panels, roof, posts
  for (const sx of [-1, 1]) k.block('paint', [t, h - 0.08, d], [sx * (w / 2 - t / 2), 0.08, 0], { c: C.rack });
  k.block('paint', [w, 0.05, d], [0, h - 0.05, 0], { c: C.rack });
  k.block('rubber', [w * 0.5, 0.012, 0.1], [0, h, -d * 0.25], { c: '#0b0b0b' }); // cable entry brush
  // the servers
  const v0 = r() * 0.25;
  k.quad('bezel', [w - 2 * t, h - 0.2], [0, 0.1 + (h - 0.2) / 2, d / 2 - 0.06], { uv: [0, v0, 1, v0 + 0.75] });
  if (!open) {
    // perforated door in a solid edge frame, with a swing handle
    k.quad('rackdoor', [w - 0.1, h - 0.22], [0, 0.11 + (h - 0.22) / 2, d / 2 - 0.004], { c: C.rack });
    k.box('paint', [w, 0.05, 0.02], [0, 0.1, d / 2 - 0.01], { c: C.rackEdge });
    k.box('paint', [w, 0.07, 0.02], [0, h - 0.085, d / 2 - 0.01], { c: C.rackEdge });
    for (const sx of [-1, 1]) k.box('paint', [0.05, h - 0.12, 0.02], [sx * (w / 2 - 0.025), h / 2, d / 2 - 0.01], { c: C.rackEdge });
    k.box('steel', [0.025, 0.16, 0.03], [w / 2 - 0.08, 1.1, d / 2 + 0.01], { c: C.chrome });
    k.box('label', [0.14, 0.035, 0.002], [-w / 2 + 0.14, h - 0.12, d / 2 + 0.002], { uv: k.slots.rackTag });
    // back door, perforated too; through it: cable waterfalls and PDUs
    k.quad('rackdoor', [w - 0.1, h - 0.22], [0, 0.11 + (h - 0.22) / 2, -d / 2 + 0.004], { r: [0, Math.PI, 0], c: C.rack });
    k.box('paint', [w, 0.05, 0.02], [0, 0.1, -d / 2 + 0.01], { c: C.rackEdge });
    k.box('paint', [w, 0.07, 0.02], [0, h - 0.085, -d / 2 + 0.01], { c: C.rackEdge });
    for (const sx of [-1, 1]) k.box('paint', [0.05, h - 0.12, 0.02], [sx * (w / 2 - 0.025), h / 2, -d / 2 + 0.01], { c: C.rackEdge });
    k.quad('bezel', [w - 2 * t, h - 0.2], [0, 0.1 + (h - 0.2) / 2, -d / 2 + 0.07], { r: [0, Math.PI, 0], uv: [0, 0.75 - v0, 1, 1 - v0], c: '#6a6a6a' });
    for (const sx of [-1, 1]) {
      // vertical power strips, their outlets lit blue
      k.box('paint', [0.05, h - 0.4, 0.04], [sx * (w / 2 - 0.08), h / 2, -d / 2 + 0.1], { c: '#222' });
      for (let i = 0; i < 10; i++) k.box('glow', [0.018, 0.014, 0.004], [sx * (w / 2 - 0.08), 0.35 + i * 0.15, -d / 2 + 0.078], { c: '#5a9bff' });
    }
    const cols = ['#2f6fd6', '#e6c229', '#d8d8d8', '#2b2b2b', '#c43b2f'];
    for (let i = 0; i < 7; i++) {
      const x = -w / 2 + 0.16 + i * ((w - 0.32) / 6);
      // a bundle dropping from the roof, sweeping to the side at the bottom
      k.rod('rubber', 0.012 + r() * 0.01, [x, h - 0.1, -d / 2 + 0.12], [x + (r() - 0.5) * 0.06, 0.5 + r() * 0.3, -d / 2 + 0.14], { c: cols[i % cols.length], seg: 6 });
    }
  } else {
    // open network rack: a patch field, cable loops sagging out front
    const cols = ['#2f6fd6', '#e6c229', '#c43b2f', '#2f6fd6', '#e6e6e6'];
    for (let p = 0; p < 4; p++) {
      const y = 1.1 + p * 0.22;
      k.box('steel', [w - 0.1, 0.045, 0.02], [0, y, d / 2 - 0.03], { c: '#2a2a2a' });
      for (let i = 0; i < 8; i++) {
        const x = -w / 2 + 0.1 + i * ((w - 0.2) / 7);
        const c = cols[(p + i) % cols.length];
        // a U-loop of patch lead hanging from each port
        const sag = 0.08 + r() * 0.12;
        k.rod('rubber', 0.005, [x, y, d / 2 - 0.01], [x + 0.02, y - sag, d / 2 + 0.05], { c, seg: 4 });
        k.rod('rubber', 0.005, [x + 0.02, y - sag, d / 2 + 0.05], [x + 0.14 * (i < 4 ? 1 : -1), y - 0.04, d / 2 + 0.02], { c, seg: 4 });
      }
    }
    for (const sx of [-1, 1]) {
      // vertical cable managers
      k.block('paint', [0.07, h - 0.15, 0.12], [sx * (w / 2 + 0.035), 0.08, d / 2 - 0.08], { c: C.rack });
    }
  }
}

// Precision air conditioner: a big white box that roars.
function crac(k, { w, d, h }) {
  k.block('rubber', [w - 0.04, 0.08, d - 0.04], [0, 0, 0], { c: C.black });
  k.rbox('paint', [w, h - 0.08, d], 0.02, [0, 0.08 + (h - 0.08) / 2, 0], { c: C.white });
  // three front panels with seams and lift-off handles
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + (i + 0.5) * (w / 3);
    k.box('paint', [0.006, h - 0.2, 0.004], [-w / 2 + (i + 1) * (w / 3), 0.1 + (h - 0.2) / 2, d / 2 + 0.002], { c: '#9aa09c' });
    k.box('steel', [0.1, 0.02, 0.02], [x, 1.25, d / 2 + 0.012], { c: C.chrome });
    // lower intake louvres
    for (let s = 0; s < 6; s++) k.box('steel', [w / 3 - 0.1, 0.012, 0.015], [x, 0.2 + s * 0.05, d / 2 + 0.006], { c: '#7b817f' });
  }
  // top discharge grille, the LCD and a keypad
  for (let s = 0; s < 8; s++) k.box('steel', [w - 0.1, 0.012, 0.02], [0, h - 0.3 + s * 0.03, d / 2 + 0.008], { c: '#5e6462' });
  k.box('plastic', [0.26, 0.14, 0.01], [w / 3, 1.5, d / 2 + 0.006], { c: '#2a2e30' });
  k.box('labelGlow', [0.2, 0.08, 0.002], [w / 3, 1.51, d / 2 + 0.012], { uv: k.slots.cracLcd });
  k.box('label', [0.3, 0.1, 0.002], [-w / 3, 1.5, d / 2 + 0.003], { uv: k.slots.cracPlate });
}

// The UPS: a black cabinet run with vent grilles, a small LCD, a status bar.
function ups(k, { w, d, h }) {
  k.block('rubber', [w - 0.04, 0.06, d - 0.04], [0, 0, 0], { c: C.black });
  k.block('paint', [w, h - 0.06, d], [0, 0.06, 0], { c: '#1d1f22' });
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + (i + 0.5) * (w / 3);
    k.box('paint', [0.005, h - 0.1, 0.004], [-w / 2 + (i + 1) * (w / 3), h / 2, d / 2 + 0.002], { c: '#0c0c0e' });
    for (let s = 0; s < 14; s++) k.box('paint', [w / 3 - 0.14, 0.012, 0.006], [x, 0.18 + s * 0.035, d / 2 + 0.003], { c: '#0a0a0b' });
  }
  k.box('labelGlow', [0.16, 0.07, 0.002], [0, 1.2, d / 2 + 0.003], { uv: k.slots.upsLcd });
  for (let i = 0; i < 5; i++) k.box('glow', [0.02, 0.008, 0.003], [-0.05 + i * 0.025, 1.12, d / 2 + 0.003], { c: i < 4 ? '#3dff7a' : '#ffb347' });
  k.box('label', [0.24, 0.05, 0.002], [-w / 3, 1.32, d / 2 + 0.003], { uv: k.slots.upsPlate });
}

// Fire suppression: a red cylinder strapped to the wall, a valve head, a
// pipe to the ceiling.
function cylinder(k, { h }) {
  k.cyl('paint', 0.13, h - 0.25, [0, (h - 0.25) / 2, 0], { c: C.red, seg: 16 });
  k.sphere('paint', 0.13, [0, h - 0.25, 0], { sy: 0.6, c: C.red, seg: 14 });
  k.cyl('steel', 0.04, 0.12, [0, h - 0.12, 0], { c: C.brass, seg: 10 });
  k.cyl('steel', 0.045, 0.03, [0, h - 0.04, 0], { c: '#333', seg: 10 });
  k.rod('steel', 0.018, [0, h - 0.02, 0], [0, 2.55, 0], { c: C.red });
  for (const y of [0.35, h - 0.45]) k.cyl('steel', 0.135, 0.03, [0, y, 0], { c: '#2a2a2a', seg: 16 });
  k.box('label', [0.14, 0.2, 0.002], [0, 0.8, 0.131], { uv: k.slots.fm200 });
  k.cyl('steel', 0.035, 0.02, [0.08, h - 0.15, 0.06], { r: [Math.PI / 2, 0, 0], c: '#eee' }); // gauge
}

// A stack of spare floor tiles and the suction lifter left on top.
function tiles(k, { w, d, h }) {
  const n = Math.round(h / 0.035);
  for (let i = 0; i < n; i++) {
    const j = (i % 3 - 1) * 0.015;
    k.block('raised', [w - 0.01, 0.033, d - 0.01], [j, i * 0.035, -j], { c: '#ffffff' });
    k.block('paint', [w - 0.005, 0.006, d - 0.005], [j, i * 0.035, -j], { c: '#2a2d31' });
  }
  const top = n * 0.035;
  for (const sx of [-1, 1]) k.cyl('rubber', 0.05, 0.02, [sx * 0.08, top + 0.01, 0], { c: '#222', seg: 12 });
  k.block('plastic', [0.26, 0.03, 0.04], [0, top + 0.02, 0], { c: '#e0762a' });
  k.box('plastic', [0.2, 0.025, 0.03], [0, top + 0.08, 0], { c: '#e0762a' });
}

// The boiler: a red drum on a concrete plinth, flanged flues to the ceiling,
// a burner housing at the bottom front with a sight glass (the pilot flame
// in it flickers — cellar.jsx), a control panel with the fault lamp.
function boiler(k, { w, h }) {
  const R = w / 2 - 0.1;
  k.block('conc', [w + 0.2, 0.1, w + 0.2], [0, 0, 0], { c: '#b0b1ab' });
  k.cyl('paint', R, h - 0.3, [0, 0.1 + (h - 0.3) / 2, 0], { c: C.boiler, seg: 32 });
  k.sphere('paint', R, [0, h - 0.2, 0], { sy: 0.32, c: C.boiler, seg: 24 });
  // insulation panel seams and steel bands
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.box('paint', [0.012, h - 0.45, 0.01], [Math.sin(a) * (R + 0.004), 0.25 + (h - 0.45) / 2, Math.cos(a) * (R + 0.004)], { r: [0, a, 0], c: '#5e2520' });
  }
  for (const y of [0.3, 1.2, 2.0]) k.cyl('steel', R + 0.012, 0.05, [0, y, 0], { c: '#3a3d42', seg: 32 });
  // burner housing, the sight glass ring, a gas train into it
  k.rbox('paint', [0.6, 0.5, 0.3], 0.03, [0, 0.35, R + 0.1], { c: '#4a4f55' });
  k.cyl('steel', 0.055, 0.03, [0, 0.4, R + 0.26], { r: [Math.PI / 2, 0, 0], c: '#222', seg: 16 });
  for (let i = 0; i < 6; i++) k.box('steel', [0.5, 0.01, 0.01], [0, 0.16 + i * 0.03, R + 0.255], { c: '#2a2d30' });
  k.rod('paint', 0.025, [0.3, 0.3, R + 0.1], [0.62, 0.3, R + 0.1], { c: C.yellow });
  // pressure gauge and control panel (the fault lamp lives on it)
  k.cyl('steel', 0.14, 0.06, [-0.5, 1.5, R + 0.02], { r: [Math.PI / 2, 0, 0], c: '#3a3d42', seg: 20 });
  k.cyl('matt', 0.12, 0.004, [-0.5, 1.5, R + 0.052], { r: [Math.PI / 2, 0, 0], c: '#f4f2ea', seg: 20 });
  k.box('glow', [0.008, 0.09, 0.002], [-0.48, 1.52, R + 0.056], { r: [0, 0, -0.8], c: '#dd2222' });
  k.rbox('paint', [0.36, 0.3, 0.12], 0.02, [0.5, 1.15, R + 0.03], { c: '#d8d8d2' });
  k.box('label', [0.28, 0.1, 0.002], [0.5, 1.21, R + 0.092], { uv: k.slots.boilerPanel });
  k.box('label', [0.32, 0.16, 0.002], [-0.45, 0.95, R + 0.013], { uv: k.slots.boilerPlate });
  // two flanged flues from the dome to the ceiling, a handwheel valve
  for (const [px, pr] of [[-0.35, 0.1], [0.4, 0.07]]) {
    const y0 = h - 0.05;
    k.rod('steel', pr, [px, y0 - 0.2, 0], [px, 2.8, 0], { c: '#8a8f94', seg: 12 });
    for (const y of [y0 + 0.02, 2.3, 2.7]) k.cyl('steel', pr + 0.03, 0.03, [px, y, 0], { c: '#5d6166', seg: 12 });
  }
  k.rod('steel', 0.05, [R * 0.72, 1.2, R * 0.72], [R + 0.25, 1.2, R + 0.05], { c: '#8a8f94' });
  handWheel(k, R + 0.3, 1.2, R + 0.1, 0.12, C.red);
}

// Water heater: a white drum on three legs, copper to the ceiling, a gas
// control at the bottom and a relief pipe down to the floor.
function heater(k, { w, h }) {
  const R = w / 2 - 0.05;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.rod('steel', 0.025, [Math.sin(a) * R * 0.7, 0, Math.cos(a) * R * 0.7], [Math.sin(a) * R * 0.7, 0.12, Math.cos(a) * R * 0.7], { c: '#555' });
  }
  k.cyl('paint', R, h - 0.3, [0, 0.12 + (h - 0.3) / 2, 0], { c: '#e9e7e0', seg: 28 });
  k.sphere('paint', R, [0, h - 0.18, 0], { sy: 0.3, c: '#e9e7e0', seg: 20 });
  k.cyl('steel', R + 0.01, 0.04, [0, 0.14, 0], { c: '#3a3d42', seg: 28 });
  for (const px of [-0.15, 0.15]) {
    k.rod('steel', 0.022, [px, h - 0.1, 0], [px, 2.8, 0], { c: C.copper });
  }
  k.rbox('paint', [0.16, 0.14, 0.1], 0.01, [0, 0.32, R + 0.03], { c: '#222' });
  k.cyl('paint', 0.03, 0.03, [0.04, 0.34, R + 0.09], { r: [Math.PI / 2, 0, 0], c: C.red });
  k.rod('steel', 0.016, [R * 0.6, h - 0.5, R * 0.8], [R * 0.6 + 0.1, 0.05, R * 0.8 + 0.12], { c: C.copper });
  k.box('label', [0.2, 0.26, 0.002], [0, 1.2, R + 0.004], { uv: k.slots.heaterPlate });
}

// Counters: the boiler-room kitchenette, or the helpdesk's ticket counter.
function counter(k, { w, d, h }, f, r) {
  if (f.kind === 'helpdesk') {
    // customer side (+z): a full-height modesty front on a steel kick,
    // a high ledge; staff side: a desk-height worktop and a monitor
    k.block('steel', [w, 0.1, 0.05], [0, 0, d / 2 - 0.04], { c: '#555a5e' });
    k.block('matt', [w, h - 0.14, 0.04], [0, 0.1, d / 2 - 0.04], { c: '#7f93a6' });
    k.block('matt', [w + 0.06, 0.04, d * 0.45], [0, h - 0.04, d / 2 - d * 0.2], { c: '#d9d3bf' });
    k.block('matt', [w, 0.03, d * 0.6], [0, 0.74, -d * 0.18], { c: '#d9d3bf' });
    for (const sx of [-1, 1]) k.block('matt', [0.03, 0.74, d * 0.6], [sx * (w / 2 - 0.015), 0, -d * 0.18], { c: '#5f7488' });
    k.box('label', [0.9, 0.2, 0.002], [0, 0.65, d / 2 - 0.018], { uv: k.slots.helpdeskFront });
    for (let i = 1; i < 4; i++) k.box('matt', [0.008, h - 0.18, 0.004], [-w / 2 + (i * w) / 4, 0.1 + (h - 0.18) / 2, d / 2 - 0.018], { c: '#4d6072' });
    // the sneeze screen: perspex on steel posts, a slot at the bottom
    for (const sx of [-1, 0, 1]) k.block('steel', [0.025, 0.55, 0.025], [sx * (w / 2 - 0.05), h, d / 2 - 0.15], { c: C.chrome });
    k.box('glass', [w - 0.1, 0.46, 0.008], [0, h + 0.33, d / 2 - 0.15], { c: '#ffffff' });
    // ticket dispenser, a bell, the staff monitor seen from behind
    k.block('plastic', [0.14, 0.2, 0.12], [-w / 2 + 0.2, h, d / 2 - 0.12], { c: '#c62828' });
    k.box('matt', [0.06, 0.004, 0.08], [-w / 2 + 0.2, h + 0.1, d / 2 - 0.03], { r: [0.4, 0, 0], c: '#f0e9c8' });
    k.cyl('steel', 0.04, 0.035, [0.4, h + 0.018, d / 2 - 0.12], { top: 0.4, c: C.chrome, seg: 14 });
    k.block('plastic', [0.5, 0.32, 0.04], [0.1, 0.77 + 0.12, -d * 0.2], { c: '#1a1a1a' });
    k.block('plastic', [0.06, 0.12, 0.06], [0.1, 0.77, -d * 0.2], { c: '#1a1a1a' });
    return;
  }
  // kitchenette: base units with doors, a worktop, a kettle and a microwave
  k.block('matt', [w - 0.04, 0.1, d - 0.12], [0, 0, -0.06], { c: '#2b2b2b' });
  k.block('matt', [w, h - 0.14, d - 0.05], [0, 0.1, -0.025], { c: '#ece6d4' });
  const n = Math.round(w / 0.6);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    k.box('matt', [w / n - 0.008, h - 0.18, 0.018], [x, 0.1 + (h - 0.18) / 2, d / 2 - 0.02], { c: '#f2ecda' });
    k.box('steel', [0.12, 0.012, 0.02], [x, h - 0.2, d / 2 - 0.001], { c: C.chrome });
  }
  k.block('matt', [w + 0.02, 0.04, d + 0.02], [0, h - 0.04, 0], { c: '#6d6358' });
  k.block('plastic', [0.18, 0.2, 0.14], [-w / 2 + 0.3, h, 0.05], { c: '#e8e4dc' });
  k.block('plastic', [0.5, 0.3, 0.36], [w / 2 - 0.38, h, -0.1], { c: '#d8d8d8' });
  k.box('plastic', [0.3, 0.2, 0.005], [w / 2 - 0.44, h + 0.15, 0.081], { c: '#1a1a1a' });
  k.box('label', [0.42, 0.3, 0.002], [0.25, h + 0.35, -d / 2 + 0.002], { uv: k.slots.kitchenNote });
}

// Shelving: galvanised boltless shelves, or blue-and-orange pallet racking.
function shelf(k, { w, d, h }, f, r) {
  const racking = f.kind === 'racking';
  const up = racking ? C.blue : C.galv;
  const post = racking ? 0.07 : 0.04;
  const nx = Math.max(2, Math.round(w / 1.2) + 1);
  for (let i = 0; i < nx; i++) {
    const x = -w / 2 + post / 2 + i * ((w - post) / (nx - 1));
    for (const sz of [-1, 1]) k.block('paint', [post, h, post], [x, 0, sz * (d / 2 - post / 2)], { c: up });
    if (racking) {
      // diagonal bracing on the frame
      for (let j = 0; j < 3; j++) k.rod('steel', 0.01, [x, 0.1 + j * 0.6, -d / 2 + 0.05], [x, 0.7 + j * 0.6, d / 2 - 0.05], { c: up, seg: 4 });
    }
  }
  const levels = racking ? [0.12, 1.0, 1.9] : [0.12, 0.55, 1.0, 1.42, h - 0.04];
  levels.forEach((y, li) => {
    if (racking) {
      for (const sz of [-1, 1]) k.box('paint', [w, 0.1, 0.05], [0, y + 0.05, sz * (d / 2 - 0.03)], { c: C.orange });
    } else {
      k.block('steel', [w, 0.025, d], [0, y, 0], { c: C.galv });
    }
    if (li === levels.length - 1 && !racking) return;
    // what's on it
    let x = -w / 2 + 0.08;
    while (x < w / 2 - 0.25) {
      const bw = 0.25 + r() * 0.3, bh = racking ? 0.35 + r() * 0.4 : 0.18 + r() * 0.2;
      const pick = r();
      if (pick < 0.55) cardBox(k, x + bw / 2, y + 0.03, (r() - 0.5) * 0.05, (r() - 0.5) * 0.2, [bw, bh, d * 0.8], ['#ffffff', '#e8dcc8', '#d8c8b0'][li % 3]);
      else if (pick < 0.8) k.block('plastic', [bw, bh * 0.7, d * 0.7], [x + bw / 2, y + 0.03, 0], { c: ['#2f6fd6', '#e0762a', '#3d8b4f', '#c43b2f'][(li + (x * 3 | 0)) & 3] });
      else if (!racking) tangle(k, x + bw / 2, y + 0.03, 0, 0.2, 3, seedOf(f) + li * 17 + (x * 10 | 0));
      x += bw + 0.03 + r() * 0.12;
    }
  });
}

// A EUR pallet (1.2 × 0.8 m, 14.4 cm), stacked to the entry's height; a
// load on top if the map asks for one.
export function pallet(k, { w, d, h }, f, r) {
  const layers = Math.max(1, Math.round(h / 0.15));
  const lh = h / layers;
  const sx = w / 1.2, sz = d / 0.8;
  for (let L = 0; L < layers; L++) {
    const y0 = L * lh, s = lh / 0.144;
    const shade = ['#ffffff', '#e8e0d0', '#d6cbb8'][L % 3];
    k.at(0, y0, 0, L % 2 ? 0.03 : -0.02, () => {
      for (const zz of [-0.35, 0, 0.35]) {
        k.block('wood', [1.2 * sx, 0.022 * s, 0.1 * sz], [0, 0, zz * sz], { c: shade }); // bottom boards
        for (const xx of [-0.525, 0, 0.525]) k.block('wood', [0.145 * sx, 0.078 * s, 0.1 * sz], [xx * sx, 0.022 * s, zz * sz], { c: shade }); // blocks
      }
      for (const xx of [-0.525, 0, 0.525]) k.block('wood', [0.145 * sx, 0.022 * s, 0.8 * sz], [xx * sx, 0.1 * s, 0], { c: shade }); // stringer boards
      for (const zz of [-0.35, -0.175, 0, 0.175, 0.35]) k.block('wood', [1.2 * sx, 0.022 * s, 0.1 * sz], [0, 0.122 * s, zz * sz], { c: shade }); // deck
    });
  }
  if (f.load === 'boxes') {
    for (let i = 0; i < 3; i++) cardBox(k, (i - 1) * 0.38 * sx, h, (r() - 0.5) * 0.1, (r() - 0.5) * 0.3, [0.36, 0.3, 0.5], '#e8dcc8');
    cardBox(k, 0, h + 0.3, 0, 0.3, [0.4, 0.26, 0.4], '#ffffff');
  } else if (f.load === 'wrap') {
    // shrink-wrapped stack: boxes under a milky film
    k.block('card', [w * 0.94, 0.7, d * 0.94], [0, h, 0], { c: '#d8c8b0' });
    k.rbox('glass', [w * 0.97, 0.72, d * 0.97], 0.04, [0, h + 0.36, 0], { c: '#ffffff' });
  } else if (f.load === 'crts') {
    // monitors, stacked by somebody who read the sign and ignored it
    crt(k, -0.7, h, -0.2, 0.2); crt(k, -0.2, h, -0.25, -0.1, '#c9bf9f'); crt(k, 0.3, h, -0.2, 0.1);
    crt(k, -0.45, h + 0.34, -0.2, 0.05, '#d4ccb2'); crt(k, 0.05, h + 0.34, -0.25, -0.2);
    tower(k, 0.85, h, 0.1, 1.4); keyboard(k, -0.4, h, 0.35, 0.1);
  }
}

// The e-waste cage: posts and rails, welded mesh, a padlocked door, dead kit.
function cage(k, { w, d, h }, f, r) {
  const post = 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block('paint', [post, h, post], [sx * (w / 2 - post / 2), 0, sz * (d / 2 - post / 2)], { c: '#5d6368' });
  for (const y of [0.05, 1.0, h - 0.03]) {
    for (const sz of [-1, 1]) k.box('paint', [w, 0.03, 0.03], [0, y, sz * (d / 2 - 0.015)], { c: '#5d6368' });
    for (const sx of [-1, 1]) k.box('paint', [0.03, 0.03, d], [sx * (w / 2 - 0.015), y, 0], { c: '#5d6368' });
  }
  const mc = '#aab1b8';
  k.quad('mesh', [w, h], [0, h / 2, d / 2 - 0.01], { c: mc });
  k.quad('mesh', [w, h], [0, h / 2, -d / 2 + 0.01], { c: mc });
  for (const sx of [-1, 1]) k.quad('mesh', [d, h], [sx * (w / 2 - 0.01), h / 2, 0], { r: [0, Math.PI / 2, 0], c: mc });
  k.quad('mesh', [w, d], [0, h - 0.01, 0], { r: [-Math.PI / 2, 0, 0], c: mc });
  // the door: its own frame, a hasp and a padlock at car height... almost
  k.box('paint', [0.03, h - 0.1, 0.03], [0.1, h / 2, d / 2 + 0.02], { c: '#5d6368' });
  k.box('steel', [0.08, 0.05, 0.02], [0.14, 1.05, d / 2 + 0.03], { c: C.chrome });
  k.box('steel', [0.05, 0.06, 0.02], [0.15, 0.99, d / 2 + 0.045], { c: C.brass });
  k.ring('steel', 0.02, 0.005, [0.15, 1.035, d / 2 + 0.045], { c: C.chrome });
  k.box('label', [0.3, 0.2, 0.002], [-0.45, 1.3, d / 2 + 0.01], { uv: k.slots.weee });
  // inside: CRTs, towers, a cable tangle
  crt(k, -0.55, 0, -0.2, 0.3); crt(k, -0.5, 0.34, -0.2, 0.2, '#c9bf9f'); crt(k, 0.3, 0, -0.3, -0.4, '#d4ccb2');
  tower(k, 0.7, 0, 0.1, 1.2); tower(k, 0.72, 0.42, 0.05, 1.3, '#bdb49a'); tower(k, 0.1, 0, 0.3, 1.9);
  tangle(k, -0.1, 0.02, 0.1, 0.5, 6, seedOf(f));
}

// A green mesh cage bin on castors, full of the smaller dead things.
function bin(k, { w, d, h }, f) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('rubber', 0.04, 0.03, [sx * (w / 2 - 0.08), 0.04, sz * (d / 2 - 0.08)], { r: [0, 0, Math.PI / 2], c: '#222', seg: 10 });
    k.block('paint', [0.035, h - 0.08, 0.035], [sx * (w / 2 - 0.02), 0.08, sz * (d / 2 - 0.02)], { c: C.meshGreen });
  }
  k.block('paint', [w, 0.04, d], [0, 0.08, 0], { c: C.meshGreen });
  for (const sz of [-1, 1]) {
    k.quad('mesh', [w, h - 0.12], [0, 0.12 + (h - 0.12) / 2, sz * (d / 2 - 0.02)], { c: '#6fae5f' });
    k.box('paint', [w, 0.035, 0.035], [0, h, sz * (d / 2 - 0.02)], { c: C.meshGreen });
  }
  for (const sx of [-1, 1]) {
    k.quad('mesh', [d, h - 0.12], [sx * (w / 2 - 0.02), 0.12 + (h - 0.12) / 2, 0], { r: [0, Math.PI / 2, 0], c: '#6fae5f' });
    k.box('paint', [0.035, 0.035, d], [sx * (w / 2 - 0.02), h, 0], { c: C.meshGreen });
  }
  crt(k, -0.3, 0.12, -0.1, 0.4, C.beige, 0.9); crt(k, 0.25, 0.12, 0.05, -0.6, '#c9bf9f', 0.9);
  crt(k, -0.05, 0.43, -0.05, 0.9, '#d4ccb2', 0.9);
  keyboard(k, 0.3, 0.45, -0.2, 0.7); keyboard(k, -0.35, 0.44, 0.2, -0.4, '#9c9888');
  tangle(k, 0.1, 0.7, 0.1, 0.5, 5, seedOf(f) + 3);
}

// A heap on a pallet by the corridor door: stacked on purpose, waiting for a
// collection that keeps getting moved to next Thursday.
function heap(k, { w, d, h }, f) {
  pallet(k, { w, d, h: 0.144 }, {}, rng(3));
  const y = 0.144;
  crt(k, -0.35, y, -0.15, 0.1); crt(k, 0.1, y, -0.2, -0.15, '#c9bf9f'); crt(k, 0.42, y, 0.25, 1.4, '#d4ccb2');
  crt(k, -0.15, y + 0.34, -0.18, 0.3, '#d4ccb2');
  tower(k, -0.45, y, 0.28, 1.6); tower(k, -0.1, y, 0.3, 1.5, '#bdb49a');
  keyboard(k, 0.05, y + 0.68, -0.15, 0.4); keyboard(k, 0.3, y + 0.34, -0.1, -0.2, '#9c9888');
  k.block('plastic', [0.42, 0.22, 0.34], [0.25, y + 0.34, 0.2], { r: [0, 0.2, 0], c: '#e8e8e2' }); // a dead printer
  tangle(k, 0.1, y + 0.02, 0.3, 0.45, 5, seedOf(f));
  k.box('label', [0.3, 0.22, 0.004], [0.2, y + 0.36, 0.38], { r: [-0.2, 0.2, 0], uv: k.slots.collection });
}

// Lab workbench: square steel legs, a laminate top, the blue ESD mat with its
// grounding lead, a lower shelf against the wall, a pegboard of tools behind,
// a vice, a soldering station, an oscilloscope on one of them.
function bench(k, { w, d, h }, f) {
  const leg = 0.05, top = 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.block('paint', [leg, h - top, leg], [sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)], { c: '#4a5058' });
    k.cyl('rubber', 0.03, 0.015, [sx * (w / 2 - 0.06), 0.008, sz * (d / 2 - 0.06)], { c: '#111' });
  }
  k.box('paint', [w - 0.1, 0.05, 0.03], [0, h - top - 0.05, d / 2 - 0.06], { c: '#4a5058' }); // front rail
  k.block('matt', [w, top, d], [0, h - top, 0], { c: C.laminate });
  k.box('matt', [w * 0.55, 0.004, d * 0.7], [w * 0.1, h + 0.002, 0.02], { c: C.esd });
  k.rod('rubber', 0.004, [w * 0.1 - w * 0.27, h + 0.005, 0.1], [-w / 2 + 0.05, h - 0.3, -d / 2 + 0.05], { c: '#1d7a3a', seg: 4 });
  k.block('matt', [w - 0.12, 0.018, 0.3], [0, 0.2, -d / 2 + 0.17], { c: C.mdf }); // lower shelf
  cardBox(k, -0.6, 0.218, -d / 2 + 0.17, 0.1, [0.35, 0.22, 0.26], '#e8dcc8');
  k.block('plastic', [0.4, 0.15, 0.26], [0.3, 0.218, -d / 2 + 0.17], { c: C.blue });
  // pegboard, mounted on the wall behind
  k.box('label', [w * 0.9, 1.1, 0.012], [0, h + 0.65, -d / 2 - 0.08], { uv: k.slots.pegboard });
  // vice, power strip, soldering station
  k.block('paint', [0.12, 0.09, 0.14], [-w / 2 + 0.2, h, d / 2 - 0.1], { c: '#2e5b87' });
  k.box('steel', [0.03, 0.03, 0.2], [-w / 2 + 0.2, h + 0.1, d / 2 - 0.1], { c: C.chrome });
  k.block('plastic', [0.5, 0.04, 0.06], [0.3, h, -d / 2 + 0.05], { c: '#f0f0ea' });
  for (let i = 0; i < 4; i++) k.box('glow', [0.008, 0.008, 0.003], [0.12 + i * 0.1, h + 0.025, -d / 2 + 0.081], { c: '#ff5a3c' });
  k.block('plastic', [0.18, 0.1, 0.16], [-0.45, h, -0.1], { c: '#2a2a2a' });
  k.box('glow', [0.06, 0.025, 0.002], [-0.45, h + 0.06, -0.019], { c: '#ff3b2a' });
  k.rod('steel', 0.006, [-0.3, h + 0.08, -0.1], [-0.1, h + 0.02, 0.05], { c: '#333', seg: 4 });
  if (f.kind === 'scope') {
    // the oscilloscope: its screen is drawn live (cellar.jsx)
    k.rbox('plastic', [0.36, 0.2, 0.28], 0.015, [0.55, h + 0.1, -0.12], { c: '#d6d6cc' });
    k.box('plastic', [0.18, 0.12, 0.004], [0.49, h + 0.11, 0.022], { c: '#0a120c' });
    for (let i = 0; i < 6; i++) k.cyl('plastic', 0.012, 0.015, [0.62 + (i % 2) * 0.05, h + 0.06 + Math.floor(i / 2) * 0.05, 0.024], { r: [Math.PI / 2, 0, 0], c: '#333' });
  }
}

// Compact mobile shelving: a carriage on wheels over the floor rails, steel
// shelves loaded with lever-arch files and archive boxes, cream end panels
// with a hand wheel. Long along z; the aisles open and close along x.
export function mobile(k, { w, d, h }, f, r) {
  k.block('paint', [w + 0.04, 0.09, d], [0, 0.02, 0], { c: '#4d5358' });
  for (let z = -d / 2 + 0.3; z < d / 2; z += 1) {
    for (const sx of [-1, 1]) k.cyl('rubber', 0.03, 0.03, [sx * (w / 2 - 0.05), 0.03, z], { r: [0, 0, Math.PI / 2], c: '#222', seg: 10 });
  }
  const levels = 6, lh = (h - 0.2) / levels;
  for (let i = 0; i <= levels; i++) k.block('steel', [w, 0.02, d - 0.04], [0, 0.12 + i * lh, 0], { c: '#b9bdbd' });
  k.block('steel', [0.02, h - 0.12, d - 0.04], [0, 0.11, 0], { c: '#9aa0a0' }); // spine
  for (let i = 0; i < levels; i++) {
    for (const sx of [-1, 1]) {
      const strip = (i + (sx > 0 ? 1 : 0) + Math.floor(r() * 4)) % 4;
      const u0 = r() * 0.3;
      k.quad('files', [d - 0.06, lh - 0.04], [sx * (w / 2 - 0.02), 0.14 + i * lh + (lh - 0.04) / 2, 0],
        { r: [0, sx * Math.PI / 2, 0], uv: [u0, 1 - (strip + 1) / 4 + 0.004, u0 + 0.68, 1 - strip / 4 - 0.004] });
    }
  }
  // end panels, both ends, with a hand wheel on each
  for (const sz of [-1, 1]) {
    k.block('paint', [w + 0.06, h - 0.02, 0.03], [0, 0.02, sz * (d / 2 - 0.015)], { c: C.cream });
    k.block('paint', [w + 0.06, 0.08, 0.035], [0, 0.02, sz * (d / 2 - 0.015)], { c: '#4d5358' });
    handWheel(k, 0, 1.1, sz * (d / 2 + 0.04), 0.14, '#c9c9c4');
    k.box('label', [0.2, 0.14, 0.002], [0, 1.55, sz * (d / 2 + 0.001)], { r: [0, sz < 0 ? Math.PI : 0, 0], uv: k.slots[`shelf${Math.floor(r() * 4)}`] });
  }
}

// Steel filing cabinets, a bank of three: drawers with seams, recessed
// pulls, chrome label holders, a kick and a lock at the top.
function cabinet(k, { w, d, h }) {
  const n = Math.max(1, Math.round(w / 0.7));
  const cw = w / n;
  for (let c = 0; c < n; c++) {
    const x = -w / 2 + (c + 0.5) * cw;
    k.block('paint', [cw - 0.004, 0.05, d - 0.03], [x, 0, -0.015], { c: '#5d6368' });
    k.block('paint', [cw - 0.004, h - 0.05, d], [x, 0.05, 0], { c: '#9ca3a0' });
    const dr = Math.max(2, Math.round((h - 0.05) / 0.32));
    const dh = (h - 0.08) / dr;
    for (let i = 0; i < dr; i++) {
      const y = 0.06 + i * dh + dh / 2;
      k.box('paint', [cw - 0.02, dh - 0.006, 0.012], [x, y, d / 2 + 0.006], { c: '#a8afab' });
      k.box('paint', [0.2, 0.025, 0.01], [x, y + dh * 0.18, d / 2 + 0.01], { c: '#4d5358' });
      k.box('steel', [0.08, 0.03, 0.004], [x, y - dh * 0.12, d / 2 + 0.014], { c: C.chrome });
      k.box('matt', [0.07, 0.022, 0.002], [x, y - dh * 0.12, d / 2 + 0.0165], { c: '#f3efe3' });
    }
    k.cyl('steel', 0.012, 0.01, [x + cw / 2 - 0.06, h - 0.04, d / 2 + 0.005], { r: [Math.PI / 2, 0, 0], c: C.chrome });
  }
}

// Take-a-number post: a pole on a weighted foot, a red dispenser head.
function ticketpost(k, { h }) {
  k.cyl('paint', 0.16, 0.03, [0, 0.015, 0], { c: '#333', seg: 16 });
  k.cyl('steel', 0.022, h - 0.2, [0, (h - 0.2) / 2, 0], { c: C.chrome, seg: 10 });
  k.rbox('plastic', [0.18, 0.24, 0.12], 0.03, [0, h - 0.08, 0], { c: '#c62828' });
  k.box('label', [0.14, 0.08, 0.002], [0, h - 0.02, 0.061], { uv: k.slots.takeNumber });
  k.box('matt', [0.05, 0.004, 0.07], [0, h - 0.19, 0.08], { r: [0.3, 0, 0], c: '#f0e9c8' });
}

// A steel trolley of returned laptops, each tagged.
function trolley(k, { w, d, h }, f, r) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.block('steel', [0.025, h - 0.1, 0.025], [sx * (w / 2 - 0.02), 0.1, sz * (d / 2 - 0.02)], { c: C.galv });
    k.cyl('rubber', 0.04, 0.03, [sx * (w / 2 - 0.05), 0.04, sz * (d / 2 - 0.05)], { r: [0, 0, Math.PI / 2], c: '#222', seg: 10 });
  }
  k.rod('steel', 0.012, [-w / 2, h + 0.1, -d / 2 + 0.02], [-w / 2, h + 0.1, d / 2 - 0.02], { c: C.galv });
  for (const y of [0.18, h - 0.03]) {
    k.block('steel', [w, 0.025, d], [0, y, 0], { c: C.galv });
    let yy = y + 0.025;
    for (let i = 0; i < (y < 0.5 ? 4 : 6); i++) {
      const lw = 0.34, ld = 0.24, tint = ['#2b2d31', '#3a3c40', '#8f959b', '#1d1e21'][Math.floor(r() * 4)];
      k.at((r() - 0.5) * 0.3, yy, (r() - 0.5) * 0.08, (r() - 0.5) * 0.3, () => {
        k.block('plastic', [lw, 0.022, ld], [0, 0, 0], { c: tint });
        k.box('matt', [0.06, 0.004, 0.035], [lw / 2 - 0.05, 0.024, ld / 2 - 0.03], { c: '#f6d84a' }); // the ticket tag
      });
      yy += 0.024;
    }
  }
  k.box('label', [0.3, 0.12, 0.002], [0, 0.45, d / 2 + 0.002], { uv: k.slots.returns });
}

// Water cooler: grey body, blue bottle, red/blue taps, cup tube on the side.
function cooler(k, { w, d, h }) {
  const bh = 0.95;
  k.block('plastic', [w, bh, d], [0, 0, 0], { c: '#d8dcdc' });
  k.block('plastic', [w - 0.04, 0.05, d - 0.06], [0, 0, 0.03], { c: '#555a5e' });
  k.box('plastic', [0.2, 0.012, 0.1], [0, 0.55, d / 2 + 0.04], { c: '#3a3d40' });
  k.box('plastic', [0.03, 0.04, 0.04], [-0.05, 0.72, d / 2 + 0.015], { c: '#2f6fd6' });
  k.box('plastic', [0.03, 0.04, 0.04], [0.05, 0.72, d / 2 + 0.015], { c: '#c62828' });
  k.cyl('glass', 0.13, h - bh, [0, bh + (h - bh) / 2, 0], { c: '#66a8e8', seg: 16 });
  k.cyl('plastic', 0.035, 0.3, [w / 2 + 0.04, 0.6, 0], { c: '#f0f0f0', seg: 10 });
}

// Fire doors. A leaf on its hinge, propped at 90° into the room with a wedge
// (the wedge is a prop you can knock away), or two leaves held back flat
// against the corridor walls on magnets. Kick plate, wired-glass vision
// panel, push plate, closer.
function leaf(k, { w, d, h }, f) {
  // leaves are authored in world axes: the long side is the leaf's width
  const along = w > d ? 'x' : 'z';
  const L = Math.max(w, d), T = Math.min(w, d);
  k.at(0, 0, 0, along === 'x' ? 0 : Math.PI / 2, () => {
    k.block('matt', [L, h, T], [0, 0, 0], { c: C.veneer });
    k.box('paint', [L + 0.004, 0.03, T + 0.004], [0, h - 0.015, 0], { c: '#56635c' });
    for (const s of [-1, 1]) {
      const z = s * (T / 2 + 0.002);
      k.box('steel', [L - 0.04, 0.25, 0.003], [0, 0.14, z], { c: '#b7bcbf' }); // kick plate
      k.box('steel', [0.1, 0.3, 0.003], [(f.magnet ? -1 : 1) * (L / 2 - 0.12), 1.1, z], { c: '#b7bcbf' }); // push plate
      k.box('glass', [0.22, 0.7, 0.004], [0, 1.45, z * 0.5], { c: '#dfeef0' });
      k.box('mesh', [0.22, 0.7, 0.002], [0, 1.45, z * 0.3], { c: '#777' });
      k.box('paint', [0.28, 0.76, 0.01], [0, 1.45, z * 0.4], { c: '#2c2f30' });
      k.box('label', [0.22, 0.08, 0.002], [0, 1.9, z * 1.05], { r: [0, s < 0 ? Math.PI : 0, 0], uv: k.slots.fireDoor });
    }
    k.box('steel', [0.3, 0.03, 0.04], [(f.magnet ? 1 : -1) * (L / 2 - 0.2), h - 0.06, T / 2 + 0.02], { c: C.galv }); // closer arm
  });
}

// The loading platform: concrete with a yellow steel edge on the drive face,
// rubber dock bumpers with bolt heads, a chequer-plate leveller let into the
// top. Built in the piece's frame: the drive face is +z.
function dock(k, { w, d, h }) {
  k.block('conc', [w, h - 0.02, d], [0, 0, 0], { c: '#e8e8e2' });
  k.block('checker', [w, 0.02, d], [0, h - 0.02, 0], { c: '#8d9296' });
  k.box('hazard', [w, 0.1, 0.012], [0, h - 0.05, d / 2 + 0.006], { c: '#ffffff' });
  k.box('paint', [w, 0.012, 0.1], [0, h + 0.006, d / 2 - 0.05], { c: C.yellow });
  for (const kx of [-0.4, -0.13, 0.13, 0.4]) {
    k.block('rubber', [0.3, h * 0.6, 0.1], [kx * w, h * 0.2, d / 2 + 0.05], { c: '#161616' });
    for (const by of [0.3, 0.6]) for (const bx of [-0.1, 0.1]) k.cyl('steel', 0.015, 0.012, [kx * w + bx, h * by, d / 2 + 0.105], { r: [Math.PI / 2, 0, 0], c: '#888' });
  }
  // the leveller: a plate with a hinged lip, flush in the top
  k.box('paint', [2, 0.006, 1.8], [0, h + 0.003, -d / 2 + 0.95], { c: '#3a3d40' });
  k.box('checker', [1.96, 0.008, 1.76], [0, h + 0.005, -d / 2 + 0.95], { c: '#b0b4b8' });
  k.box('paint', [2, 0.03, 0.1], [0, h + 0.015, -d / 2 + 1.85], { c: C.yellow });
}

// Pallet jack: yellow body and handle, two lowered forks (the fork tips are
// ramps in the map, so they kick you up), load wheels at the tips.
function palletjack(k, { w, d, h }) {
  k.rbox('paint', [w, 0.22, d * 0.6], 0.03, [0, 0.14, -d * 0.1], { c: C.yellow });
  k.cyl('rubber', 0.08, 0.06, [0, 0.08, -d * 0.2], { r: [0, 0, Math.PI / 2], c: '#1a1a1a', seg: 14 });
  k.cyl('paint', 0.04, 0.3, [0, 0.4, -d * 0.1], { c: '#333' }); // hydraulic ram
  k.rod('steel', 0.02, [0, 0.5, -d * 0.1], [0, h, -d * 0.45], { c: '#2a2a2a' });
  k.ring('steel', 0.1, 0.018, [0, h + 0.05, -d * 0.48], { c: '#222' });
  for (const sx of [-0.27, 0.27]) {
    k.block('paint', [0.16, 0.075, 1.15], [sx, 0, d / 2 + 1.15 / 2], { c: C.yellow });
    k.cyl('rubber', 0.03, 0.06, [sx, 0.03, d / 2 + 1.05], { r: [0, 0, Math.PI / 2], c: '#333', seg: 10 });
  }
}

// An old column radiator on the wall: sections, top and bottom manifolds, a
// valve at each end and the pipes down into the floor.
function radiator(k, { w, d, h }) {
  const n = Math.round(w / 0.065);
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * sw;
    k.block('paint', [sw * 0.72, h - 0.16, d * 0.8], [x, 0.12, 0], { c: '#d9d6c8' });
  }
  for (const y of [0.13, h - 0.07]) k.box('paint', [w, 0.05, d * 0.5], [0, y, 0], { c: '#cfccbe' });
  for (const s of [-1, 1]) {
    k.rod('paint', 0.012, [s * (w / 2 + 0.05), 0, 0], [s * (w / 2 + 0.05), 0.14, 0], { c: '#cfccbe', seg: 6 });
    k.rod('paint', 0.012, [s * (w / 2 + 0.05), 0.14, 0], [s * (w / 2 - 0.01), 0.14, 0], { c: '#cfccbe', seg: 6 });
    k.cyl('steel', 0.02, 0.05, [s * (w / 2 + 0.05), 0.19, 0], { c: s < 0 ? '#e8e8e2' : '#b9bdbd', seg: 8 });
  }
  k.block('matt', [w + 0.2, 0.004, d + 0.06], [0, 0, 0], { c: '#2a2622' }); // a dusty shadow line under it
}

// Linked waiting-room chairs on a steel beam: moulded seats, chrome legs —
// the leg forest is what you see from a car.
function waitchairs(k, { w, d }, f, r) {
  const n = Math.max(2, Math.round(w / 0.55));
  const sw = w / n;
  k.box('steel', [w - 0.1, 0.05, 0.06], [0, 0.4, -0.05], { c: '#3a3d42' });
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.12);
    k.rod('steel', 0.016, [x, 0, d / 2 - 0.08], [x, 0.4, -0.05], { c: C.chrome, seg: 6 });
    k.rod('steel', 0.016, [x, 0, -d / 2 + 0.06], [x, 0.4, -0.05], { c: C.chrome, seg: 6 });
    k.block('steel', [0.06, 0.012, d - 0.1], [x, 0, -0.01], { c: '#3a3d42' });
  }
  const cols = ['#c0573f', '#c0573f', '#3f6e8c', '#c0573f'];
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * sw;
    if (f.kind !== 'full' && r() < 0.15) continue; // one's been taken for spares
    k.rbox('plastic', [sw - 0.06, 0.03, d * 0.8], 0.012, [x, 0.45, 0.02], { c: cols[i % cols.length] });
    k.rbox('plastic', [sw - 0.06, 0.38, 0.03], 0.012, [x, 0.66, -d / 2 + 0.06], { r: [-0.15, 0, 0], c: cols[i % cols.length] });
  }
}

function bollard(k, { h }) {
  k.cyl('steel', 0.1, 0.012, [0, 0.006, 0], { c: '#555', seg: 12 });
  k.cyl('paint', 0.055, h, [0, h / 2, 0], { c: C.yellow, seg: 14 });
  k.sphere('paint', 0.055, [0, h, 0], { sy: 0.5, c: C.yellow, seg: 12 });
  for (const y of [0.55, 0.75]) k.cyl('paint', 0.057, 0.06, [0, y, 0], { c: '#1a1a1a', seg: 14 });
}

export const BUILDERS = {
  cellar_rack: rack, cellar_crac: crac, cellar_ups: ups, cellar_cylinder: cylinder, cellar_tiles: tiles,
  cellar_boiler: boiler, cellar_heater: heater, cellar_counter: counter, cellar_shelf: shelf, cellar_pallet: pallet,
  cellar_cage: cage, cellar_bin: bin, cellar_heap: heap, cellar_bench: bench, cellar_mobile: mobile,
  cellar_cabinet: cabinet, cellar_ticketpost: ticketpost, cellar_trolley: trolley, cellar_cooler: cooler,
  cellar_leaf: leaf, cellar_dock: dock, cellar_palletjack: palletjack, cellar_bollard: bollard, cellar_radiator: radiator, cellar_waitchairs: waitchairs,
};

// Build one furniture entry into the kit (skipping the rolling shelf — it
// moves, so it is built on its own).
export function buildPiece(k, f) {
  const b = BUILDERS[f.type];
  if (!b || f.roll) return false;
  const fr = pieceFrame(f);
  const r = rng(seedOf(f));
  k.at(fr.x, 0, fr.z, fr.rot, () => b(k, fr, f, r));
  return true;
}
