// The founder's car: a 1960s saloon in burgundy, parked nose-in with its dust
// cover half pulled back — the hero piece of Garage Zero and the lap's
// signature jump (a plank onto the bonnet, over the roof, off the boot).
//
// Everything is in metres in the car's own frame: +z is the nose, y up, the
// car's centre on the floor at the origin. The body is an extruded side
// profile (the only way a car reads as a car from 18 cm up is its
// silhouette); the greenhouse is a narrower extrusion on top; chrome, glass
// and the whitewall tyres are separate kit parts. The collider profile below
// follows the same numbers, so what you see is what you drive on.
import * as THREE from 'three';
import { kit } from './garageKit.js';

export const CAR = {
  len: 4.7, halfW: 0.875, cabinHalfW: 0.72,
  wheelR: 0.31, wheelS: 1.45, // wheel radius and ± position along the car
  paint: '#6b2230', chrome: '#d9dde2', cover: '#b9ad95',
};

// The drivable top line (s = along the car, nose +; y = height), tail to nose.
export const TOP = [
  [-2.3, 0.925], // boot lip
  [-1.42, 0.95], // base of the rear window
  [-0.92, 1.37], // back of the roof
  [0.32, 1.37], // top of the windscreen
  [1.12, 0.87], // cowl
  [2.3, 0.77], // bonnet front
];

// side silhouette of the lower body, wheel arches cut in
function bodyProfile() {
  const pts = [];
  const arch = (c, r, from, to) => {
    for (let k = 0; k <= 10; k++) {
      const a = from + (to - from) * (k / 10);
      pts.push([c + Math.cos(a) * r, 0.3 + Math.sin(a) * r]);
    }
  };
  pts.push([2.26, 0.25]);
  arch(1.45, 0.4, 0, Math.PI); // front arch, nose side first
  pts.push([1.02, 0.21], [-1.02, 0.21]);
  arch(-1.45, 0.4, 0, Math.PI);
  pts.push([-2.28, 0.25], [-2.34, 0.34], [-2.36, 0.6], [-2.33, 0.88], [-2.26, 0.925], [-1.42, 0.945],
    [-1.2, 0.9], [1.12, 0.875], [2.18, 0.8], [2.31, 0.76], [2.35, 0.7], [2.36, 0.52], [2.33, 0.34]);
  return pts;
}

function cabinProfile() {
  return [[1.12, 0.86], [0.34, 1.35], [0.1, 1.375], [-0.4, 1.385], [-0.9, 1.365], [-1.42, 0.94], [-1.42, 0.86]];
}

// The body extrusions run along local x; turn them so the profile's s axis
// is the car's z (nose +z).
const SIDE = [0, -Math.PI / 2, 0];

export function buildCar() {
  const k = kit();
  const { paint, chrome } = CAR;
  k.extrude('gloss', bodyProfile(), CAR.halfW * 2, [0, 0, 0], paint, SIDE, 0.05);
  k.extrude('gloss', cabinProfile(), CAR.cabinHalfW * 2, [0, 0, 0], paint, SIDE, 0.04);
  // underbody: dark, so the gap under the sills reads as a gap
  k.box('matte', [1.6, 0.12, 4.3], [0, 0.26, 0], '#1b1a19');

  // --- glass: side windows (a hair proud of the cabin), windscreen, rear
  const sideA = [[1.0, 0.92], [0.37, 1.31], [-0.18, 1.32], [-0.18, 0.92]];
  const sideB = [[-0.27, 0.92], [-0.27, 1.32], [-0.86, 1.31], [-1.28, 0.93]];
  for (const w of [sideA, sideB]) k.extrude('glass', w, CAR.cabinHalfW * 2 + 0.02, [0, 0, 0], '#1d2833', SIDE);
  const pane = (a, b, w, color) => {
    const dz = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dz, dy);
    k.box('glass', [w, 0.012, len], [0, (a[1] + b[1]) / 2 + 0.012, (a[0] + b[0]) / 2], color, [Math.atan2(-dy, dz), 0, 0]);
  };
  pane([0.38, 1.33], [1.07, 0.9], 1.3, '#1d2833');
  pane([-1.36, 0.97], [-0.95, 1.33], 1.25, '#1d2833');

  // --- chrome: bumpers, grille, lamp rings, the flank strip, hubcaps
  for (const s of [1, -1]) {
    const z = s * 2.41;
    k.box('chrome', [1.78, 0.1, 0.1], [0, 0.36, z], chrome, null, 0.045);
    for (const x of [-0.95, 0.95]) k.box('chrome', [0.14, 0.1, 0.16], [x * 0.93, 0.36, z - s * 0.04], chrome, [0, x * 0.5 * s, 0], 0.045);
    // overriders
    for (const x of [-0.45, 0.45]) k.box('chrome', [0.06, 0.2, 0.08], [x, 0.4, z + s * 0.02], chrome, null, 0.025);
  }
  // grille: a chrome frame with dark slats behind
  k.box('matte', [0.9, 0.2, 0.04], [0, 0.56, 2.345], '#141414');
  k.box('chrome', [0.96, 0.03, 0.05], [0, 0.67, 2.355], chrome);
  k.box('chrome', [0.96, 0.03, 0.05], [0, 0.45, 2.355], chrome);
  for (let i = -4; i <= 4; i++) k.box('chrome', [0.015, 0.2, 0.03], [i * 0.1, 0.56, 2.36], chrome);
  // headlamps
  for (const x of [-0.64, 0.64]) {
    k.cyl('chrome', 0.1, 0.1, 0.05, [x, 0.6, 2.33], chrome, [Math.PI / 2, 0, 0], 16);
    k.cyl('glow', 0.08, 0.08, 0.02, [x, 0.6, 2.36], '#e9e4cf', [Math.PI / 2, 0, 0], 16);
  }
  // tail lamps: red lenses, chrome bezels
  for (const x of [-0.66, 0.66]) {
    k.box('chrome', [0.3, 0.14, 0.04], [x, 0.66, -2.35], chrome, null, 0.02);
    k.box('gloss', [0.26, 0.1, 0.03], [x, 0.66, -2.37], '#b0121b', null, 0.015);
  }
  // flank strip and door handles
  for (const x of [-1, 1]) {
    k.box('chrome', [0.012, 0.018, 3.9], [x * (CAR.halfW + 0.003), 0.7, 0.05], chrome);
    k.box('chrome', [0.02, 0.025, 0.12], [x * (CAR.halfW + 0.01), 0.8, 0.1], chrome);
    k.box('chrome', [0.02, 0.025, 0.12], [x * (CAR.halfW + 0.01), 0.8, -0.7], chrome);
    // wing mirror
    k.cyl('chrome', 0.008, 0.008, 0.1, [x * 0.8, 0.93, 1.0], chrome);
    k.sphere('chrome', 0.05, [x * 0.82, 0.99, 1.0], chrome, [1, 0.7, 1.3], 8);
  }
  // bonnet ornament and the badge
  k.box('chrome', [0.02, 0.05, 0.1], [0, 0.8, 2.2], chrome, [0.3, 0, 0], 0.01);
  k.box('chrome', [0.14, 0.03, 0.01], [0, 0.72, -2.36], chrome);

  // --- wheels: black tyre, whitewall, chrome hubcap
  const tyre = tyreGeometry();
  for (const s of [1, -1]) for (const x of [-1, 1]) {
    const pos = [x * (CAR.halfW - 0.13), CAR.wheelR, s * CAR.wheelS];
    k.add('matte', tyre.clone(), '#141414', pos, [0, 0, Math.PI / 2]);
    k.cyl('matte', 0.25, 0.25, 0.012, [pos[0] + x * 0.098, pos[1], pos[2]], '#ece8dc', [0, 0, Math.PI / 2], 24);
    k.cyl('chrome', 0.17, 0.19, 0.03, [pos[0] + x * 0.1, pos[1], pos[2]], chrome, [0, 0, Math.PI / 2], 20);
    k.cyl('chrome', 0.05, 0.07, 0.03, [pos[0] + x * 0.12, pos[1], pos[2]], chrome, [0, 0, Math.PI / 2], 10);
  }
  // exhaust
  k.cyl('metal', 0.03, 0.03, 0.2, [0.45, 0.2, -2.3], '#555', [Math.PI / 2, 0, 0], 8);

  // --- the dust cover over the back half, and its bunched front edge
  coverSheet(k);
  return k.build();
}

// A tyre as a lathe: rounded shoulders, not a cylinder.
function tyreGeometry() {
  const pts = [];
  const R = CAR.wheelR, w = 0.095, ri = 0.2;
  pts.push(new THREE.Vector2(ri, -w));
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + (k / 6) * Math.PI;
    pts.push(new THREE.Vector2(R - 0.05 + Math.cos(a) * 0.05, Math.sin(a) * w));
  }
  pts.push(new THREE.Vector2(ri, w));
  return new THREE.LatheGeometry(pts, 20);
}

// Height of the car's top line at s (for the cover to drape over).
function topAt(s) {
  if (s <= TOP[0][0]) return TOP[0][1];
  for (let i = 0; i < TOP.length - 1; i++) {
    const [s0, y0] = TOP[i], [s1, y1] = TOP[i + 1];
    if (s >= s0 && s <= s1) return y0 + ((s - s0) / (s1 - s0)) * (y1 - y0);
  }
  return TOP[TOP.length - 1][1];
}

// The cover: a sheet laid over the car from the middle of the roof back past
// the boot, hanging down both flanks and the tail, with folds that deepen
// toward the hem. Built as a grid: i runs along the car, j round the
// cross-section (left hem → over the top → right hem).
function coverSheet(k) {
  const NI = 28, NJ = 26;
  const s0 = -0.1, s1 = -2.55;
  const pos = [], uv = [];
  const P = (i, j) => {
    const t = i / NI;
    let s = s0 + (s1 - s0) * t;
    // past the tail the sheet falls away: top line drops toward the hem
    const past = Math.max(0, -2.34 - s);
    const cab = s > -1.42;
    let top = topAt(Math.max(s, -2.3)) + 0.03 - past * 3.2;
    const hem = 0.34 + 0.05 * Math.sin(s * 7.3 + 1) + 0.03 * Math.sin(s * 17);
    top = Math.max(top, hem + 0.05);
    const wb = CAR.halfW + 0.04; // over the flank
    const wt = (cab ? CAR.cabinHalfW : CAR.halfW - 0.08) + 0.03; // over the top
    const belt = Math.min(0.93, top);
    // cross-section: hem → shoulder → top edge → across → mirror
    const v = j / NJ; // 0..1
    const side = v < 0.5 ? -1 : 1;
    const q = v < 0.5 ? v * 2 : (1 - v) * 2; // 0 at the hem, 1 at the centre line
    let x, y;
    if (q < 0.45) { // flank: hem up to the belt
      const a = q / 0.45;
      x = wb; y = hem + (belt - hem) * a;
    } else if (q < 0.7) { // shoulder: belt to the top edge, pulled in
      const a = (q - 0.45) / 0.25;
      const e = Math.sin(a * Math.PI / 2);
      x = wb + (wt - wb) * e; y = belt + (top - belt) * Math.sin(a * Math.PI / 2 + 0.2) / Math.sin(Math.PI / 2 + 0.2);
    } else { // across the top
      const a = (q - 0.7) / 0.3;
      x = wt * (1 - a); y = top + 0.02 * Math.sin(a * Math.PI / 2);
    }
    // folds: vertical ripples down the flanks, slack near the hem
    const slack = Math.max(0, 1 - q / 0.55);
    const fold = (0.028 * Math.sin(s * 11 + side * 1.7) + 0.018 * Math.sin(s * 23.5 + 2)) * slack;
    x += fold;
    // the front edge is pulled back and gathered: it rides up and bulges
    const gather = Math.max(0, 1 - t / 0.08);
    y += gather * 0.05 * (0.5 + 0.5 * Math.sin(j * 1.9));
    x += gather * 0.03;
    s += gather * 0.04 * Math.sin(j * 2.3);
    return [side * x, y, s];
  };
  const grid = [];
  for (let i = 0; i <= NI; i++) {
    grid.push([]);
    for (let j = 0; j <= NJ; j++) grid[i].push(P(i, j));
  }
  for (let i = 0; i < NI; i++) {
    for (let j = 0; j < NJ; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      const u0 = i / NI * 3, u1 = (i + 1) / NI * 3, v0 = j / NJ * 2, v1 = (j + 1) / NJ * 2;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // double-sided cloth: add the back faces too (the hem is seen from below)
  const back = g.clone();
  const idx = back.attributes.position.array;
  for (let t = 0; t < idx.length; t += 9) {
    for (let c = 0; c < 3; c++) { const tmp = idx[t + 3 + c]; idx[t + 3 + c] = idx[t + 6 + c]; idx[t + 6 + c] = tmp; }
  }
  back.computeVertexNormals();
  k.add('fabric', g, CAR.cover);
  k.add('fabric', back, '#a39780');
  // the gathered roll at the front edge
  const roll = [];
  for (let j = 0; j <= NJ; j++) {
    const p = grid[0][j];
    roll.push(new THREE.Vector3(p[0], p[1] + 0.02, p[2] + 0.02));
  }
  const curve = new THREE.CatmullRomCurve3(roll);
  const tube = new THREE.TubeGeometry(curve, 40, 0.045, 6, false);
  k.add('fabric', tube, '#c4b8a0');
}

// Collider slabs: a cuboid whose top face runs along each segment of TOP.
// → [{ pos: [x, y, z], rot: [rx, 0, 0], half: [hx, hy, hz] }] in metres.
export function carColliders() {
  const out = [];
  const T = 0.14;
  for (let i = 0; i < TOP.length - 1; i++) {
    const [s0, y0] = TOP[i], [s1, y1] = TOP[i + 1];
    const dz = s1 - s0, dy = y1 - y0, len = Math.hypot(dz, dy);
    const phi = Math.atan2(-dy, dz);
    const nx = Math.cos(phi), nz = Math.sin(phi); // the slab's up (y, z) after rotation
    const hw = (i >= 1 && i <= 3) ? CAR.cabinHalfW : CAR.halfW;
    out.push({
      pos: [0, (y0 + y1) / 2 - nx * T / 2, (s0 + s1) / 2 - nz * T / 2],
      rot: [phi, 0, 0],
      half: [hw, T / 2, len / 2 + 0.02],
    });
  }
  // the solid body under all of it: sills to beltline, and the cabin block
  out.push({ pos: [0, 0.45, 0], rot: [0, 0, 0], half: [CAR.halfW, 0.3, 2.34] });
  out.push({ pos: [0, 1.0, -0.3], rot: [0, 0, 0], half: [CAR.cabinHalfW, 0.25, 0.8] });
  return out;
}
