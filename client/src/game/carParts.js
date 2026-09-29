// What bolts onto each shell: lamps, grilles, bumpers, the diffuser and tow
// hook everyone stares at from the chase cam, the chassis and battery seen on
// every flip, each body's own signature pieces (roll cage, bed, wings, the
// buggy's open drivetrain) and every garage part option. All of it is
// primitives handed to the Parts builder, so a whole kitted car collapses to
// one draw per material. Mount points come from the shell itself (carShell's
// surface queries), so parts sit ON the paint instead of in it.
import * as THREE from 'three';
import { Parts, COL, LENS, mat4, tyreGeo, cylGeo } from './carKit.js';
import { BODIES, bodyX, surfaceY, deckY, endZ, shellBounds, shellGeos } from './carShell.js';

// Per-body mount points that are design decisions rather than geometry:
//   head/tail: lamp centre [x, y] and lens [w, h]   grille: [y, halfW, halfH]
//   intake: lower bumper opening [y, halfW, halfH]  plate: [y, width]
//   mirror: z of the door mirrors   hood/roof: z centre of hood/roof parts
//   seat: driver [y, z, scale]   antenna: [x, z]   sill: [z0, z1]
//   pipe: stock exhaust tip [x, y]   deck: z where a bolt-on wing mounts
const ANCHOR = {
  balanced: {
    head: [0.19, 0.042, 0.1, 0.042], tail: [0.2, 0.074, 0.085, 0.048], grille: [0.03, 0.095, 0.018],
    intake: [-0.05, 0.14, 0.024], plate: [0.012, 0.15], bumper: [-0.085, -0.085], mirror: 0.1, hood: 0.3, roof: -0.16,
    seat: [-0.02, -0.08, 0.84], antenna: [-0.2, -0.4], sill: [-0.17, 0.17], pipe: [0.13, -0.075], deck: -0.345,
  },
  drift: {
    head: [0.2, 0.02, 0.11, 0.03], tail: [0.19, 0.063, 0.11, 0.034], grille: [-0.01, 0.12, 0.016],
    intake: [-0.065, 0.16, 0.022], plate: [0.005, 0.15], bumper: [-0.09, -0.09], mirror: 0.12, hood: 0.3, roof: -0.05,
    seat: [-0.05, -0.06, 0.8], antenna: [-0.2, -0.42], sill: [-0.17, 0.17], pipe: [0.15, -0.08], deck: -0.42,
  },
  monster: {
    head: [0.165, 0.152, 0.06, 0.04], tail: [0.2, 0.165, 0.036, 0.055], grille: [0.135, 0.1, 0.034],
    intake: null, plate: [0.1, 0.14], bumper: [0.09, 0.09], mirror: 0.15, hood: 0.28, roof: 0.0,
    seat: [0.13, -0.02, 0.8], antenna: [-0.2, -0.36], sill: [-0.14, 0.14], pipe: [0.15, 0.08], deck: -0.36,
  },
  buggy: {
    head: [0.07, 0.05, 0.035, 0.035], tail: [0.14, 0.13, 0.03, 0.025], grille: null,
    intake: null, plate: [0.06, 0.12], bumper: [-0.04, -0.04], mirror: null, hood: 0.3, roof: -0.12,
    seat: [0.05, -0.06, 1], antenna: [-0.18, -0.26], sill: [-0.15, 0.15], pipe: [0.11, -0.01], deck: -0.28,
  },
  formula: {
    head: null, tail: null, grille: null,
    intake: null, plate: [0.06, 0.1], bumper: [-0.045, -0.045], mirror: 0.13, hood: 0.3, roof: -0.2,
    seat: [0.0, 0.035, 0.82], antenna: [-0.1, -0.3], sill: [-0.2, 0.1], pipe: [0, 0.035], deck: -0.32,
  },
};
export const anchorsOf = (carId) => ANCHOR[carId] || ANCHOR.balanced;

// Shut lines, the thin dark grooves between panels that make a die-cast
// read as pressed metal: doors [z, y0, y1] down each flank, lids [z] across
// the top (hood, trunk), and the tailgate [y] across the back.
const SHUT = {
  balanced: { doors: [[0.108, -0.1, 0.108], [-0.118, -0.1, 0.112]], lids: [0.16], gate: 0.03 },
  drift: { doors: [[0.13, -0.1, 0.08], [-0.17, -0.1, 0.085]], lids: [0.19, -0.39], gate: null },
  monster: { doors: [[0.165, 0.08, 0.2], [-0.1, 0.08, 0.2]], lids: [0.2], gate: null },
};

const PI = Math.PI;

// Builds are shared by every car on the same parts, and counted: a mounted
// car holds its build (holdCar/dropCar). Bots are rolled fresh every match,
// so a cache that kept everything grew by ~13 MB of vertex data a match; a
// build nobody holds is freed a few seconds later (a remount in between
// picks it straight back up).
const cache = new Map();
const FREE_AFTER_MS = 4000;
export function holdCar(build) { build.holds = (build.holds || 0) + 1; }
export function dropCar(build) {
  if (--build.holds > 0) return;
  setTimeout(() => {
    if (build.holds > 0 || cache.get(build.key) !== build) return;
    cache.delete(build.key);
    for (const g of Object.values(build.slots)) g.dispose();
  }, FREE_AFTER_MS);
}
// o: { wide, front, hood, roof, skirts, exhaust, spoiler, wing, wheelR,
//      trim (accent fitted?), mid (bake wheels, fold metal into kit) }
export function buildCar(carId, o) {
  const id = BODIES[carId] ? carId : 'balanced';
  const key = [id, o.wide, o.front, o.hood, o.roof, o.skirts, o.exhaust, o.spoiler, o.wing, o.wheelR.toFixed(3), o.wheelW?.toFixed(3), o.mid, o.trackOut, o.restY?.toFixed(3), o.trim].join('|');
  if (cache.has(key)) return cache.get(key);
  // no accent colour fitted: trim is just more paint, so it joins that draw
  const P = new Parts(o.trim ? {} : { trim: 'paint' });
  const A = anchorsOf(id);
  const wide = !!o.wide;
  const S = {
    id, A, wide, B: BODIES[id], bounds: shellBounds(id, wide),
    nose: (x, y) => endZ(id, 1, x, y, wide),
    tail: (x, y) => endZ(id, -1, x, y, wide),
    side: (z, y) => bodyX(id, z, y, wide),
    top: (z, x = 0) => surfaceY(id, z, x, wide),
    deck: (z, x = 0) => deckY(id, z, x, wide),
  };
  const out = { anchors: {} };
  // the shell itself joins the paint, glass and outline draws
  const shell = shellGeos(id, wide, !!o.mid);
  P.add('paint', shell.paint, null);
  if (shell.glass) P.add('glass', shell.glass, null);
  P.add('outline', shell.outline, null);
  stockKit(P, S, o, out);
  if (!o.mid) shutLines(P, S);
  SIGNATURE[id](P, S, o, out);
  frontEnd(P, S, o);
  hood(P, S, o);
  roof(P, S, o, out);
  sills(P, S, o);
  exhaust(P, S, o, out);
  spoiler(P, S, o);
  if (o.mid) bakeWheels(P, S, o);
  const slots = P.build();
  if (o.mid && slots.metal) {
    // at distance metal reads as its colour: fold it into the kit draw
    slots.kit = slots.kit ? mergeTwo(slots.kit, slots.metal) : slots.metal;
    delete slots.metal;
  }
  out.slots = slots;
  out.key = key;
  cache.set(key, out);
  return out;
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'color']) {
    const A = a.attributes[k], B = b.attributes[k];
    const arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array); arr.set(B.array, A.array.length);
    g.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize));
  }
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------- everyone
// Lamps, plate, rear diffuser + tow hook, underside (chassis plate, battery,
// body posts). `head`/`tail` go to the unlit lens draws.
function stockKit(P, S, o, out) {
  const { A, id } = S;
  // underside: a carbon chassis plate and the battery in blue shrink-wrap
  const floorY = Math.min(S.B.axleY + 0.035, S.bounds.botY + 0.004);
  P.box('kit', [0.34, 0.016, 0.86], [0, floorY, 0], null, COL.carbon, 0.004);
  P.box('kit', [0.14, 0.05, 0.36], [0, floorY + 0.032, -0.02], null, COL.battery, 0.01);
  P.box('kit', [0.142, 0.052, 0.04], [0, floorY + 0.032, 0.11], null, COL.label, 0.008);
  // head lamps: a lens in a dark bucket, let into the actual nose
  if (A.head) {
    const [hx, hy, hw, hh] = A.head;
    for (const s of [-1, 1]) {
      const z = S.nose(hx + hw * 0.45, hy);
      const zi = S.nose(hx - hw * 0.45, hy);
      const yaw = Math.atan2(zi - z, hw * 0.9) * s; // follow the plan taper
      P.box('kit', [hw + 0.012, hh + 0.012, 0.03], [s * hx, hy, (z + zi) / 2 - 0.012], [0, yaw, 0], COL.black, 0.008);
      P.box('head', [hw, hh, 0.02], [s * hx, hy, (z + zi) / 2 - 0.004], [0, yaw, 0], LENS.head, Math.min(hh, hw) * 0.45);
      // a projector bead in the middle of the lens
      P.cyl('metal', hh * 0.28, hh * 0.28, 0.008, [s * (hx - hw * 0.18), hy, (z + zi) / 2 + 0.005], [PI / 2, 0, 0], COL.chrome, 10);
    }
  }
  // tail lamps: red lens + white reverse inset, in a dark frame
  if (A.tail) {
    const [tx, ty, tw, th] = A.tail;
    const pair = tx > 0 ? [-1, 1] : [0];
    for (const s of pair) {
      const x = s * tx;
      const z = S.tail(Math.abs(x) + tw * 0.4, ty), zi = S.tail(Math.max(0, Math.abs(x) - tw * 0.4), ty);
      const yaw = -Math.atan2(zi - z, tw * 0.8) * s;
      const zc = (z + zi) / 2;
      P.box('kit', [tw + 0.014, th + 0.012, 0.024], [x, ty, zc + 0.01], [0, yaw, 0], COL.black, 0.007);
      P.box('tail', [tw, th, 0.014], [x, ty, zc + 0.002], [0, yaw, 0], LENS.tail, Math.min(tw, th) * 0.3);
      if (tx > 0) P.box('tail', [tw * 0.3, th * 0.45, 0.012], [x - s * tw * 0.28, ty - th * 0.12, zc - 0.002], [0, yaw, 0], LENS.reverse, 0.004);
    }
  }
  // plate: a dark frame; the plate itself is its own textured quad
  const [py, pw] = A.plate;
  const pz = S.tail(pw * 0.5, py) - 0.001;
  P.box('kit', [pw + 0.016, pw * 0.5 + 0.016, 0.01], [0, py, pz + 0.004], null, COL.black, 0.004);
  out.plate = { pos: [0, py, pz - 0.0025], w: pw, h: pw * 0.5 };
  // rear valance: a dark band across the bottom of the bumper
  if (S.B.green) {
    const vy = A.bumper[1] + 0.008;
    const vz = S.tail(0.1, vy);
    const vw = S.side(vz + 0.04, vy) * 1.7;
    P.box('kit', [vw, 0.026, 0.03], [0, vy, vz + 0.01], null, COL.plastic, 0.008);
  }
  // rear diffuser: a dark undertray kicking up under the bumper, three fins
  if (id !== 'buggy') {
    const dz = S.tail(0, S.bounds.botY + 0.03);
    const dy = S.bounds.botY + 0.012;
    const dw = id === 'formula' ? 0.2 : 0.4;
    P.box('kit', [dw, 0.014, 0.12], [0, dy, dz + 0.07], [-0.22, 0, 0], COL.carbon, 0.004);
    for (const fx of [-dw * 0.3, 0, dw * 0.3]) P.box('kit', [0.012, 0.04, 0.09], [fx, dy - 0.004, dz + 0.055], [-0.22, 0, 0], COL.carbon, 0.003);
    // tow hook: a red loop under the tail
    P.torus('kit', 0.016, 0.005, [dw * 0.33, dy + 0.02, dz - 0.008], [0, PI / 2, 0], COL.red, PI * 2, 5, 12);
  }
  // body posts and R-clips on the hood and deck: this is an RC body shell
  if (S.B.green || id === 'monster') {
    for (const z of [0.3, -0.36]) {
      // only where the post comes through paint, not glass
      if (S.B.green && z < S.B.green.z[0] && z > S.B.green.z[3]) continue;
      const y = S.top(z, 0);
      if (y < 0) continue;
      P.cyl('metal', 0.006, 0.006, 0.02, [0, y + 0.006, z], null, COL.steel, 6);
      P.torus('metal', 0.012, 0.0025, [0.006, y + 0.012, z], [0, PI / 2, 0], COL.chrome, PI * 1.6, 4, 10);
    }
  }
  // door mirrors on the flank at the A-pillar foot
  if (A.mirror !== null && S.B.green) {
    const z = A.mirror;
    const y = S.top(z, S.B.green.base * 0.95) + 0.024;
    const x = S.side(z, y - 0.03);
    for (const s of [-1, 1]) {
      P.box('kit', [0.03, 0.01, 0.014], [s * (x + 0.008), y - 0.006, z], null, COL.black, 0.003);
      P.box('trim', [0.036, 0.028, 0.03], [s * (x + 0.03), y, z - 0.004], [0, 0, 0], null, 0.01);
      P.box('metal', [0.028, 0.02, 0.004], [s * (x + 0.03), y, z - 0.02], null, '#9fb2c8', 0.002);
    }
  }
  // cabin: a dark interior under the glass (not painted bodywork) with a
  // seat behind the driver and a dash under the windshield
  if (S.B.green) {
    const [zf, , , zb] = S.B.green.z;
    const zc = (zf + zb) / 2;
    const y = S.deck(zc, 0) + 0.003;
    const hw = S.B.green.base * 0.9;
    P.box('kit', [hw * 2, 0.008, zf - zb - 0.04], [0, y, zc], null, COL.plastic, 0.004);
    P.box('kit', [0.13, 0.075, 0.03], [0, y + 0.04, A.seat[1] - 0.055], [-0.18, 0, 0], '#2b2f38', 0.012);
    P.box('kit', [hw * 1.9, 0.03, 0.05], [0, y + 0.015, zf - 0.06], null, COL.black, 0.01);
  }
  // wipers resting at the windshield base
  if (S.B.green) {
    const zf = S.B.green.z[0];
    // lying on the glass just above its base, one each side
    for (const s of [-1, 1]) {
      const x = s * 0.06 - 0.02, z = zf - 0.022;
      P.box('kit', [0.14, 0.005, 0.008], [x, S.top(z, x) + 0.004, z], [0, 0.08 * s, 0.06], COL.black, 0.002);
    }
  }
  out.anchors.seat = A.seat;
}

function shutLines(P, S) {
  const L = SHUT[S.id];
  if (!L) return;
  const r = 0.0022, c = '#0d0e11';
  for (const [z, y0, y1] of L.doors) {
    for (const s of [-1, 1]) {
      let prev = null;
      for (let k = 0; k <= 6; k++) {
        const y = y0 + ((y1 - y0) * k) / 6;
        const x = S.side(z, y);
        if (x < 0) { prev = null; continue; }
        const pt = [s * (x + 0.0006), y, z];
        if (prev) P.rod('kit', prev, pt, r, c, 4);
        prev = pt;
      }
    }
  }
  for (const z of L.lids) {
    let prev = null;
    const hw = S.side(z, S.deck(z, 0) - 0.03);
    for (let k = 0; k <= 8; k++) {
      const x = -hw * 0.92 + (hw * 1.84 * k) / 8;
      const pt = [x, S.deck(z, x) + 0.0008, z];
      if (prev) P.rod('kit', prev, pt, r, c, 4);
      prev = pt;
    }
  }
  if (L.gate !== null) {
    let prev = null;
    for (let k = 0; k <= 8; k++) {
      const x = -0.22 + (0.44 * k) / 8;
      const pt = [x, L.gate, S.tail(Math.abs(x), L.gate) - 0.0008];
      if (prev) P.rod('kit', prev, pt, r, c, 4);
      prev = pt;
    }
  }
}

// ------------------------------------------------------------- signatures
// The pieces that make each body itself. Built-ins that a garage slot also
// offers (drift/formula wing, monster bull bar and stacks) only appear while
// that slot is at stock — the slot part replaces them, never doubles up.
const SIGNATURE = {
  balanced(P, S, o) {
    const { A } = S;
    // grille: honeycomb-dark panel with a chrome strip, and the lower intake
    const [gy, ghw, ghh] = A.grille;
    const gz = S.nose(ghw, gy);
    P.box('kit', [ghw * 2, ghh * 2, 0.02], [0, gy, gz - 0.006], [-0.15, 0, 0], COL.plastic, 0.008);
    P.box('metal', [ghw * 2 + 0.01, 0.006, 0.01], [0, gy + ghh + 0.002, gz - 0.002], null, COL.chrome, 0.003);
    intake(P, S);
    // roof spoiler over the hatch glass (stock lip; a fitted wing replaces it)
    if (o.spoiler === 'none') {
      const z = S.B.green.z[2] - 0.02;
      const y = S.top(z, 0);
      P.box('paint', [S.B.green.roofHw * 2 - 0.02, 0.012, 0.05], [0, y + 0.003, z - 0.012], [-0.08, 0, 0], null, 0.005);
    }
    // fuel filler and door handles, the details you only notice missing
    const hz = -0.02, hy = 0.09;
    for (const s of [-1, 1]) P.box('kit', [0.006, 0.01, 0.034], [s * (S.side(hz, hy) + 0.001), hy, hz], null, COL.black, 0.003);
    P.cyl('kit', 0.018, 0.018, 0.004, [-(S.side(-0.3, 0.09) + 0.001), 0.09, -0.3], [0, 0, PI / 2], COL.plastic, 12);
  },
  drift(P, S, o) {
    const { A } = S;
    const [gy, ghw, ghh] = A.grille;
    const gz = S.nose(ghw, gy);
    P.box('kit', [ghw * 2, ghh * 2, 0.02], [0, gy, gz - 0.006], [-0.3, 0, 0], COL.plastic, 0.006);
    intake(P, S);
    // canards on the bumper corners
    for (const s of [-1, 1]) {
      const z = S.nose(0.24, -0.04);
      P.box('trim', [0.06, 0.006, 0.04], [s * 0.25, -0.04, z - 0.02], [0.1, -s * 0.5, 0], null, 0.002);
    }
    // stock wing: swan-neck stands on the ducktail
    if (o.spoiler === 'none') {
      const z = -0.44, y = S.top(z, 0.2);
      for (const s of [-1, 1]) P.box('kit', [0.012, 0.09, 0.05], [s * 0.19, y + 0.04, z], [0.25, 0, 0], COL.black, 0.004);
      wingBlade(P, 'trim', [0, y + 0.09, z - 0.01], 0.3, 0.1, 0.1 + o.wing * 0.075);
    }
    // front tow strap, bright red, zip-tied to the bumper
    P.box('kit', [0.02, 0.05, 0.004], [0.13, -0.05, S.nose(0.13, -0.05) + 0.004], [0.2, 0, 0], COL.red, 0.002);
  },
  monster(P, S, o, out) {
    const bed = S.B.bed;
    const deck = S.top((bed[0] + bed[1]) / 2, 0);
    const bw = S.side(-0.3, deck - 0.02);
    // the open load bed: liner, walls, tailgate
    P.box('kit', [bw * 2 - 0.03, 0.006, bed[1] - bed[0] - 0.02], [0, deck + 0.001, (bed[0] + bed[1]) / 2], null, COL.plastic, 0.002);
    for (const s of [-1, 1]) P.box('paint', [0.022, 0.07, bed[1] - bed[0]], [s * (bw - 0.011), deck + 0.03, (bed[0] + bed[1]) / 2], null, null, 0.008);
    P.box('paint', [bw * 2, 0.07, 0.022], [0, deck + 0.03, bed[0] + 0.011], null, null, 0.008);
    // roll bar in the bed with a pair of lamps
    const rz = bed[1] - 0.04;
    P.rod('metal', [-bw + 0.03, deck, rz], [-bw + 0.05, deck + 0.13, rz], 0.011, COL.black);
    P.rod('metal', [bw - 0.03, deck, rz], [bw - 0.05, deck + 0.13, rz], 0.011, COL.black);
    P.rod('metal', [-bw + 0.05, deck + 0.13, rz], [bw - 0.05, deck + 0.13, rz], 0.011, COL.black);
    if (o.roof === 'none') {
      for (const s of [-1, 1]) {
        P.cyl('kit', 0.024, 0.02, 0.03, [s * 0.08, deck + 0.155, rz], [PI / 2, 0, 0], COL.black, 12);
        P.cyl('head', 0.019, 0.019, 0.004, [s * 0.08, deck + 0.155, rz + 0.016], [PI / 2, 0, 0], LENS.head, 12);
      }
    }
    // chrome grille
    const [gy, ghw, ghh] = S.A.grille;
    const gz = S.nose(ghw, gy);
    P.box('metal', [ghw * 2 + 0.02, ghh * 2 + 0.02, 0.014], [0, gy, gz - 0.002], null, COL.chrome, 0.008);
    for (let i = -2; i <= 2; i++) P.box('kit', [ghw * 2 - 0.01, 0.008, 0.01], [0, gy + i * ghh * 0.38, gz + 0.004], null, COL.black, 0.002);
    // ladder frame rails you see between the tyres
    const fy = S.bounds.botY - 0.018;
    for (const s of [-1, 1]) P.box('kit', [0.03, 0.035, 0.78], [s * 0.12, fy, 0], null, COL.black, 0.006);
    // fender flares in black plastic over the big tyres
    fenderFlares(P, S, o, null, 0.04, [0.95, 0.95, 2.1], PI * 0.5);
    // stock bumpers are tube (the bull bar is the front slot's stock)
    const tz = S.tail(0, 0.1);
    P.rod('metal', [-0.2, 0.08, tz - 0.03], [0.2, 0.08, tz - 0.03], 0.016, COL.black, 8);
    for (const s of [-1, 1]) P.rod('metal', [s * 0.14, 0.08, tz - 0.03], [s * 0.14, 0.09, tz + 0.03], 0.01, COL.black);
    out.anchors.bedDeck = deck;
  },
  buggy(P, S, o, out) {
    const [cz0, cz1, chw] = S.B.cockpit;
    const ty = S.top(0, 0);
    // open tub: a dark seat pan and a black coaming round the opening
    P.box('kit', [chw * 2, 0.012, cz1 - cz0], [0, ty - 0.001, (cz0 + cz1) / 2], null, COL.black, 0.005);
    P.rod('kit', [-chw, ty + 0.004, cz0], [-chw, ty + 0.004, cz1], 0.007, COL.plastic);
    P.rod('kit', [chw, ty + 0.004, cz0], [chw, ty + 0.004, cz1], 0.007, COL.plastic);
    P.rod('kit', [-chw, ty + 0.004, cz1], [chw, ty + 0.004, cz1], 0.007, COL.plastic);
    // seat back
    P.box('kit', [0.13, 0.12, 0.03], [0, ty + 0.04, cz0 + 0.03], [-0.25, 0, 0], COL.plastic, 0.012);
    // roll cage: main hoop behind the driver, braces forward to the cowl
    const hz = cz0 + 0.02, top = 0.31;
    const cage = (a, b) => P.rod('metal', a, b, 0.011, '#d8dde5', 7);
    for (const s of [-1, 1]) {
      cage([s * 0.15, ty - 0.01, hz], [s * 0.13, top - 0.03, hz + 0.01]);
      cage([s * 0.13, top - 0.03, hz + 0.01], [s * 0.1, top, hz + 0.05]);
      cage([s * 0.1, top, hz + 0.05], [s * 0.14, S.top(cz1 + 0.04, 0.14) + 0.005, cz1 + 0.05]);
      cage([s * 0.15, ty - 0.01, hz], [s * 0.1, S.top(-0.29, 0) - 0.02, -0.33]); // rear stay
    }
    cage([-0.1, top, hz + 0.05], [0.1, top, hz + 0.05]);
    cage([-0.13, top - 0.03, hz + 0.01], [0.13, top - 0.03, hz + 0.01]);
    out.anchors.roofY = top + 0.012;
    out.anchors.roofZ = hz + 0.1;
    // exposed drivetrain behind the tub, and the carbon shock towers the
    // coil-overs hang off
    drivetrain(P, -0.07, -0.37, 1);
    P.rod('metal', [-0.3, S.B.axleY, -0.34], [0.3, S.B.axleY, -0.34], 0.008, COL.steel); // driveshafts
    // shock towers: a slim carbon bar across each axle, braced to the chassis
    for (const [tz, lean] of [[-0.31, 0.15], [0.3, -0.15]]) {
      P.box('kit', [0.56, 0.03, 0.012], [0, 0.195, tz], [lean, 0, 0], COL.carbon, 0.005);
      for (const s of [-1, 1]) P.rod('kit', [s * 0.07, 0.04, tz + (tz < 0 ? 0.04 : -0.04)], [s * 0.1, 0.19, tz], 0.008, COL.carbon, 5);
    }
    // rear guard hoop and a front bumper + skid plate
    P.rod('kit', [-0.14, -0.06, -0.46], [0.14, -0.06, -0.46], 0.014, COL.black);
    for (const s of [-1, 1]) P.rod('kit', [s * 0.14, -0.06, -0.46], [s * 0.1, -0.05, -0.33], 0.012, COL.black);
    P.box('kit', [0.34, 0.016, 0.16], [0, -0.035, 0.46], [0.5, 0, 0], COL.plastic, 0.006);
    P.rod('kit', [-0.16, 0.0, 0.5], [0.16, 0.0, 0.5], 0.014, COL.black);
    // rear lamps live on the shock tower
    for (const s of [-1, 1]) P.cyl('tail', 0.013, 0.013, 0.006, [s * 0.2, 0.195, -0.322], [PI / 2 - 0.15, 0, 0], LENS.tail, 10);
    // headlamp pods on the cowl
    for (const s of [-1, 1]) {
      const z = S.nose(0.07, 0.05);
      P.cyl('kit', 0.024, 0.02, 0.03, [s * 0.07, 0.05, z - 0.008], [PI / 2, 0, 0], COL.black, 12);
      P.cyl('head', 0.019, 0.019, 0.004, [s * 0.07, 0.05, z + 0.008], [PI / 2, 0, 0], LENS.head, 12);
    }
  },
  formula(P, S, o, out) {
    const [cz0, cz1, chw] = S.B.cockpit;
    const cy = S.top((cz0 + cz1) / 2, 0);
    // cockpit opening with a padded rim
    P.box('kit', [chw * 2, 0.014, cz1 - cz0], [0, cy, (cz0 + cz1) / 2], null, COL.black, 0.006);
    P.torus('kit', chw, 0.008, [0, cy + 0.006, (cz0 + cz1) / 2], [PI / 2, 0, 0], COL.plastic, PI * 2, 5, 18);
    // airbox over the driver's head, intake mouth dark
    const az = cz0 - 0.07, ay = S.top(az, 0);
    P.box('paint', [0.07, 0.07, 0.14], [0, ay + 0.02, az], [0.12, 0, 0], null, 0.03);
    P.box('kit', [0.05, 0.035, 0.02], [0, ay + 0.035, az + 0.066], null, COL.black, 0.012);
    // the roof socket is the airbox's top: a hat or a roof part on the engine
    // cover behind it sat half inside it
    out.anchors.roofY = ay + 0.06;
    out.anchors.roofZ = az;
    // sidepod intakes
    const [pz0, pz1, pw, py] = S.B.pods;
    for (const s of [-1, 1]) P.box('kit', [0.07, 0.035, 0.02], [s * (pw - 0.05), py - 0.02, pz1 + 0.012], [0, 0, 0], COL.black, 0.012);
    // front wing: mainplane, flap, endplates, pylons to the nose
    const fz = 0.47, fy = -0.07;
    wingBlade(P, 'trim', [0, fy, fz], 0.3, 0.09, -0.04);
    wingBlade(P, 'trim', [0, fy + 0.02, fz - 0.05], 0.27, 0.05, 0.28);
    for (const s of [-1, 1]) P.box('kit', [0.008, 0.06, 0.12], [s * 0.305, fy + 0.02, fz - 0.02], null, COL.black, 0.003);
    for (const s of [-1, 1]) P.box('kit', [0.008, 0.06, 0.05], [s * 0.035, fy + 0.03, fz - 0.02], [0.3, 0, 0], COL.black, 0.003);
    // stock rear wing on a centre pylon (a fitted spoiler replaces it)
    if (o.spoiler === 'none') {
      const rz = -0.46, ry = 0.17;
      wingBlade(P, 'trim', [0, ry, rz], 0.26, 0.1, 0.08 + o.wing * 0.075);
      wingBlade(P, 'trim', [0, ry + 0.035, rz - 0.05], 0.25, 0.05, 0.45 + o.wing * 0.075);
      for (const s of [-1, 1]) P.box('kit', [0.008, 0.085, 0.13], [s * 0.265, ry + 0.005, rz - 0.025], null, COL.black, 0.003);
      P.box('kit', [0.014, 0.14, 0.05], [0, ry - 0.07, rz + 0.03], [0.3, 0, 0], COL.black, 0.004);
    }
    // mirrors on stalks and the camera pod on the roll hoop
    for (const s of [-1, 1]) {
      P.rod('kit', [s * 0.07, cy + 0.01, S.A.mirror], [s * 0.13, cy + 0.045, S.A.mirror], 0.004, COL.black);
      P.box('trim', [0.04, 0.022, 0.018], [s * 0.14, cy + 0.05, S.A.mirror], null, null, 0.007);
    }
    P.box('kit', [0.018, 0.018, 0.03], [0, ay + 0.065, az + 0.02], null, COL.black, 0.005);
    // carbon cross-bars carrying the coil-over tops at each axle
    for (const tz of [-0.306, 0.306]) P.box('kit', [0.46, 0.022, 0.012], [0, 0.1, tz], null, COL.carbon, 0.004);
    // gearbox and motor out in the open under the rear wing, a rain light on
    // the back of the gearbox
    drivetrain(P, -0.085, -0.4, 0.8);
    P.rod('metal', [-0.3, S.B.axleY, -0.34], [0.3, S.B.axleY, -0.34], 0.007, COL.steel);
    P.box('kit', [0.05, 0.03, 0.016], [0, -0.03, -0.448], null, COL.black, 0.005);
    P.box('tail', [0.04, 0.02, 0.01], [0, -0.03, -0.456], null, LENS.tail, 0.004);
  },
};

// RC drivetrain: gearbox, a gold motor can with heat-sink fins, the white
// spur gear and pinion. Centred on the car at (y, z); `k` scales it.
function drivetrain(P, y, z, k) {
  P.box('kit', [0.16 * k, 0.08 * k, 0.09 * k], [0, y, z + 0.01], null, COL.plastic, 0.012 * k);
  const my = y + 0.05 * k, mz = z - 0.01;
  P.cyl('metal', 0.045 * k, 0.045 * k, 0.12 * k, [0.06 * k, my, mz], [0, 0, PI / 2], COL.gold, 18);
  for (let i = 0; i < 6; i++) {
    const a = (i * PI) / 3;
    P.box('metal', [0.1 * k, 0.008, 0.006], [0.06 * k, my + Math.cos(a) * 0.048 * k, mz + Math.sin(a) * 0.048 * k], [a, 0, 0], COL.alu, 0.002);
  }
  P.cyl('metal', 0.02 * k, 0.02 * k, 0.02, [0.13 * k, my, mz], [0, 0, PI / 2], COL.copper, 10);
  P.cyl('kit', 0.06 * k, 0.06 * k, 0.01, [-0.085 * k, y + 0.02 * k, mz + 0.01], [0, 0, PI / 2], '#e8e8e8', 36);
  P.cyl('kit', 0.018 * k, 0.018 * k, 0.016, [-0.085 * k, y + 0.02 * k, mz + 0.01], [0, 0, PI / 2], COL.black, 10);
}

function intake(P, S) {
  const I = S.A.intake;
  if (!I) return;
  const [y, hw, hh] = I;
  const z = S.nose(hw * 0.7, y);
  P.box('kit', [hw * 2, hh * 2, 0.02], [0, y, z - 0.008], null, COL.black, 0.01);
  for (const s of [-1, 1]) P.box('head', [0.024, 0.012, 0.01], [s * (hw + 0.04), y, S.nose(hw + 0.04, y) - 0.002], null, LENS.amber, 0.004);
}

// A wing blade: an aerofoil-ish slab (thick leading edge, fine trailing edge),
// `aoa` rakes it. Centred at pos, half-span hw, chord c.
function wingBlade(P, slot, pos, hw, c, aoa) {
  const sh = new THREE.Shape();
  sh.moveTo(c * 0.5, 0);
  sh.bezierCurveTo(c * 0.5, 0.012, c * 0.3, 0.014, 0, 0.01);
  sh.lineTo(-c * 0.5, 0.002);
  sh.lineTo(-c * 0.5, -0.002);
  sh.bezierCurveTo(0, -0.004, c * 0.4, -0.006, c * 0.5, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: hw * 2, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -hw);
  g.rotateY(-PI / 2); // chord along z, span along x
  P.geo(slot, g, pos, [aoa, 0, 0], null);
}

// Fender flares: an arc over each tyre, pushed out past the flank.
function fenderFlares(P, S, o, color, radius, scale, arc = PI * 0.7) {
  for (const [x, z] of [[-0.3, 0.34], [0.3, 0.34], [-0.3, -0.34], [0.3, -0.34]]) {
    const R = o.wheelR + radius;
    const g = new THREE.TorusGeometry(R, 0.028, 5, 12, arc);
    g.rotateZ((PI - arc) / 2);
    g.scale(scale[0], scale[1], scale[2]);
    g.rotateY(PI / 2);
    const slot = color ? 'kit' : 'trim';
    P.geo(slot, g, [x + Math.sign(x) * (o.trackOut || 0), S.B.axleY, z], null, color);
  }
}

// ------------------------------------------------------------- slots
function noseInfo(S) {
  const y = S.A.bumper[0];
  const z = S.nose(0, y);
  const hw = Math.max(0.12, S.side(z - 0.05, y) * 0.92);
  return { y, z, hw };
}

function frontEnd(P, S, o) {
  const { y, z, hw } = noseInfo(S);
  switch (o.front) {
    case 'splitter': // a flat blade under the nose with little endplates
      P.box('trim', [hw * 2 + 0.04, 0.012, 0.08], [0, y - 0.012, z - 0.02], [-0.04, 0, 0], null, 0.004);
      for (const s of [-1, 1]) P.box('kit', [0.008, 0.028, 0.06], [s * (hw + 0.02), y, z - 0.02], null, COL.black, 0.003);
      break;
    case 'bar': // bull bar: a chrome hoop on two uprights
      barHoop(P, S, y + 0.03, z + 0.02, hw, 1.15);
      break;
    case 'winch': { // steel bumper, winch drum, hook in the trim colour
      P.box('kit', [hw * 1.9, 0.06, 0.05], [0, y + 0.03, z + 0.01], null, COL.black, 0.008);
      P.cyl('metal', 0.028, 0.028, 0.12, [0, y + 0.07, z + 0.012], [0, 0, PI / 2], COL.steel, 12);
      P.cyl('kit', 0.034, 0.034, 0.01, [-0.065, y + 0.07, z + 0.012], [0, 0, PI / 2], COL.black, 12);
      P.cyl('kit', 0.034, 0.034, 0.01, [0.065, y + 0.07, z + 0.012], [0, 0, PI / 2], COL.black, 12);
      P.torus('trim', 0.02, 0.007, [0, y + 0.045, z + 0.045], [0, 0, 0], null, PI * 2, 5, 12);
      for (const s of [-1, 1]) P.cyl('metal', 0.008, 0.008, 0.02, [s * hw * 0.8, y + 0.03, z + 0.035], [PI / 2, 0, 0], COL.chrome, 6);
      break;
    }
    default:
      // stock: monster wears its bull bar, everyone else a lower lip
      if (S.id === 'monster') barHoop(P, S, y + 0.03, z + 0.02, hw, 1);
      else if (S.id !== 'formula' && S.id !== 'buggy') P.box('kit', [hw * 1.8, 0.014, 0.04], [0, y - 0.006, z - 0.012], [-0.1, 0, 0], COL.black, 0.005);
  }
}

function barHoop(P, S, y, z, hw, size) {
  const r = 0.016 * size;
  const h = 0.09 * size;
  P.rod('metal', [-hw * 0.95, y, z], [hw * 0.95, y, z], r, COL.chrome, 8);
  P.rod('metal', [-hw * 0.95, y, z], [-hw * 0.7, y + h, z - 0.01], r, COL.chrome, 8);
  P.rod('metal', [hw * 0.95, y, z], [hw * 0.7, y + h, z - 0.01], r, COL.chrome, 8);
  P.rod('metal', [-hw * 0.7, y + h, z - 0.01], [hw * 0.7, y + h, z - 0.01], r, COL.chrome, 8);
  for (const s of [-1, 1]) P.box('kit', [0.03, 0.03, 0.06], [s * hw * 0.55, y, z - 0.035], null, COL.black, 0.006);
}

function hood(P, S, o) {
  const z = S.A.hood;
  const y = S.top(z, 0);
  const tilt = Math.atan2(S.top(z - 0.05, 0) - S.top(z + 0.05, 0), 0.1);
  switch (o.hood) {
    case 'scoop':
      P.box('paint', [0.19, 0.05, 0.22], [0, y + 0.012, z - 0.01], [tilt, 0, 0], null, 0.02);
      P.box('kit', [0.15, 0.03, 0.02], [0, y + 0.022, z + 0.098], [tilt, 0, 0], COL.black, 0.01);
      break;
    case 'vents':
      for (const s of [-1, 1]) {
        P.box('kit', [0.1, 0.006, 0.1], [s * 0.08, y + 0.001, z], [tilt, 0, 0], COL.black, 0.003);
        for (const dz of [-0.03, 0, 0.03]) P.box('kit', [0.09, 0.004, 0.012], [s * 0.08, y + 0.005, z + dz], [tilt - 0.35, 0, 0], COL.plastic, 0.002);
      }
      break;
    case 'pins':
      for (const [x, dz] of [[-0.13, 0.08], [0.13, 0.08], [-0.13, -0.08], [0.13, -0.08]]) {
        const yy = S.top(z + dz, x);
        if (yy < 0) continue;
        P.cyl('metal', 0.014, 0.014, 0.006, [x, yy + 0.002, z + dz], null, COL.chrome, 10);
        P.torus('metal', 0.012, 0.003, [x, yy + 0.006, z + dz], [PI / 2, 0, 0], COL.steel, PI * 2, 4, 10);
      }
      break;
    default:
  }
}

// Roof parts sit on the greenhouse roof, the monster's cab, the buggy's cage
// or the formula's engine cover — wherever this body's top is.
function roof(P, S, o, out) {
  let z = out.anchors.roofZ ?? S.A.roof;
  let y = out.anchors.roofY ?? S.top(z, 0);
  const hw = S.B.green ? S.B.green.roofHw * 0.85 : 0.13;
  out.anchors.roofY = y;
  out.anchors.roofZ = z;
  switch (o.roof) {
    case 'rack': {
      for (const x of [-hw, hw]) {
        P.box('kit', [0.018, 0.012, 0.34], [x, y + 0.03, z], null, COL.black, 0.004);
        for (const dz of [-0.14, 0.14]) P.box('kit', [0.02, 0.03, 0.02], [x, y + 0.012, z + dz], null, COL.black, 0.004);
      }
      for (const dz of [-0.1, 0.1]) P.box('kit', [hw * 2, 0.01, 0.014], [0, y + 0.038, z + dz], null, COL.black, 0.003);
      // an office file box strapped down
      P.box('kit', [0.24, 0.09, 0.19], [0, y + 0.09, z - 0.01], null, COL.box, 0.008);
      P.box('kit', [0.245, 0.02, 0.195], [0, y + 0.13, z - 0.01], null, '#a47a4b', 0.006);
      P.box('kit', [0.02, 0.095, 0.2], [0.05, y + 0.092, z - 0.01], null, COL.black, 0.003);
      P.box('kit', [0.06, 0.03, 0.002], [-0.05, y + 0.09, z + 0.086], null, COL.label, 0.001);
      break;
    }
    case 'lightbar': {
      P.box('kit', [0.42, 0.045, 0.05], [0, y + 0.04, z + 0.06], null, COL.black, 0.01);
      for (const x of [-0.15, -0.05, 0.05, 0.15]) P.cyl('head', 0.018, 0.018, 0.006, [x, y + 0.04, z + 0.086], [PI / 2, 0, 0], LENS.head, 12);
      for (const x of [-0.19, 0.19]) P.box('kit', [0.02, 0.04, 0.03], [x, y + 0.012, z + 0.06], null, COL.black, 0.005);
      break;
    }
    case 'tray': { // stacked inbox trays, because this is an office
      for (const [dy, c] of [[0, '#e7e3da'], [0.05, '#3b4252']]) {
        P.box('kit', [0.3, 0.01, 0.22], [0, y + 0.014 + dy, z], null, c, 0.003);
        for (const dz of [-0.105, 0.105]) P.box('kit', [0.3, 0.03, 0.01], [0, y + 0.028 + dy, z + dz], null, c, 0.003);
        P.box('kit', [0.26, 0.012, 0.18], [0, y + 0.024 + dy, z], [0, 0.05, 0], COL.label, 0.001);
      }
      for (const x of [-0.14, 0.14]) for (const dz of [-0.1, 0.1]) P.box('metal', [0.008, 0.05, 0.008], [x, y + 0.04, z + dz], null, COL.chrome, 0.002);
      break;
    }
    default:
  }
  // the hat sits on whatever is fitted up there (it was buried in the file
  // box and the trays); the stacks keep to the roof itself
  out.anchors.hatY = y + (ROOF_TOP[o.roof] || 0);
}
const ROOF_TOP = { rack: 0.14, tray: 0.093 };

function sills(P, S, o) {
  const [z0, z1] = S.A.sill;
  const zc = (z0 + z1) / 2, len = z1 - z0;
  const y = S.bounds.botY + 0.018;
  const x = S.side(zc, y + 0.02);
  if (x < 0) return;
  if (o.skirts === 'skirt') {
    for (const s of [-1, 1]) P.box('trim', [0.024, 0.04, len], [s * (x + 0.006), y, zc], [0, 0, 0.1 * s], null, 0.008);
  } else if (o.skirts === 'steps') {
    for (const s of [-1, 1]) {
      P.box('kit', [0.06, 0.012, len * 0.9], [s * (x + 0.03), y - 0.02, zc], null, COL.black, 0.004);
      for (let i = 0; i < 6; i++) P.box('metal', [0.05, 0.003, 0.012], [s * (x + 0.03), y - 0.013, z0 + len * (0.12 + i * 0.15)], null, COL.alu, 0.001);
      for (const dz of [-len * 0.3, len * 0.3]) P.box('kit', [0.03, 0.03, 0.02], [s * (x + 0.005), y - 0.008, zc + dz], null, COL.black, 0.004);
    }
  }
}

function exhaust(P, S, o, out) {
  const [px, py] = S.A.pipe;
  const tip = (x, y, z, r = 0.022, len = 0.07, rot = [PI / 2, 0, 0]) => {
    P.cyl('metal', r, r * 1.1, len, [x, y, z], rot, COL.chrome, 12, true);
    P.cyl('kit', r * 0.8, r * 0.8, len * 0.9, [x, y, z], rot, COL.black, 10); // soot inside
  };
  const tz = S.tail(Math.abs(px), py);
  switch (o.exhaust) {
    case 'twin':
      for (const s of [-1, 1]) tip(s * Math.max(0.1, px), py, tz + 0.012);
      out.anchors.flame = [0, py, tz - 0.05];
      break;
    case 'side': { // pipes along the sills, out behind the door
      const y = S.bounds.botY + 0.03;
      const x = S.side(-0.1, y + 0.02) + 0.02;
      for (const s of [-1, 1]) {
        P.cyl('metal', 0.02, 0.02, 0.36, [s * x, y, -0.05], [PI / 2, 0, 0], COL.chrome, 12);
        P.cyl('kit', 0.016, 0.016, 0.02, [s * x, y, -0.225], [PI / 2, 0, 0], COL.black, 10);
        P.box('kit', [0.02, 0.01, 0.02], [s * (x - 0.012), y, 0.05], null, COL.black, 0.003);
      }
      out.anchors.flame = [0, py, tz - 0.05];
      break;
    }
    case 'stacks': { // stacks up the back of the cab / behind the seat
      const z = S.B.green ? S.B.green.z[2] + 0.02 : (S.B.bed ? S.B.bed[1] - 0.02 : -0.3);
      const hw = S.B.green ? S.B.green.base + 0.035 : 0.17;
      const base = S.top(z, hw) > 0 ? S.top(z, hw) : 0.05;
      const top = (out.anchors.roofY ?? base + 0.15) + 0.07;
      for (const s of [-1, 1]) {
        P.cyl('metal', 0.02, 0.024, top - base, [s * hw, (top + base) / 2, z], null, COL.chrome, 12);
        P.cyl('kit', 0.022, 0.022, 0.012, [s * hw, top + 0.004, z], [0.3, 0, 0], COL.black, 12);
      }
      out.anchors.flame = [0, py, tz - 0.05];
      break;
    }
    default:
      if (S.id === 'monster') {
        // stock monster: a pair of short chrome stacks out of the bed
        const deck = out.anchors.bedDeck;
        for (const s of [-1, 1]) P.cyl('metal', 0.016, 0.02, 0.16, [s * 0.17, deck + 0.08, -0.17], null, COL.chrome, 12);
      } else {
        tip(px, py, tz + 0.012, 0.026);
      }
      out.anchors.flame = [px, py, tz - 0.05];
  }
}

// Bolt-on wings, rake from the setup sheet's downforce notch.
function spoiler(P, S, o) {
  if (o.spoiler === 'none') return;
  // hatch: the wing sits on the roof's trailing edge; everyone else on the deck
  let z = S.A.deck;
  let deckY = S.top(z, 0.15);
  // a deck behind the shell's own tail has no surface (top() says −1):
  // step forward onto the body rather than build the wing under the car
  for (let k = 0; k < 20 && deckY < 0; k++) deckY = S.top((z += 0.01), 0.15);
  if (deckY < 0) return;
  const side = S.side(z, deckY - 0.02);
  const hw = S.id === 'formula' ? 0.24 : side > 0.15 ? Math.min(0.27, side - 0.005) : 0.22;
  const rake = o.wing * 0.075;
  switch (o.spoiler) {
    case 'duck':
      P.box('trim', [hw * 2, 0.016, 0.1], [0, deckY + 0.02, z - 0.02], [-0.32 - rake, 0, 0], null, 0.006);
      break;
    case 'gt':
      for (const s of [-1, 1]) P.box('kit', [0.014, 0.1, 0.04], [s * hw * 0.6, deckY + 0.045, z], [0.15, 0, 0], COL.black, 0.004);
      wingBlade(P, 'trim', [0, deckY + 0.1, z - 0.01], hw, 0.13, 0.12 + rake);
      for (const s of [-1, 1]) P.box('trim', [0.012, 0.06, 0.15], [s * hw, deckY + 0.095, z - 0.01], null, null, 0.004);
      break;
    case 'mega':
      for (const s of [-1, 1]) P.box('kit', [0.018, 0.22, 0.04], [s * hw * 0.7, deckY + 0.1, z], [0.1, 0, 0], COL.black, 0.005);
      wingBlade(P, 'trim', [0, deckY + 0.21, z - 0.01], hw + 0.06, 0.16, 0.16 + rake);
      wingBlade(P, 'trim', [0, deckY + 0.24, z - 0.07], hw + 0.05, 0.07, 0.5 + rake);
      for (const s of [-1, 1]) P.box('trim', [0.014, 0.1, 0.2], [s * (hw + 0.06), deckY + 0.215, z - 0.03], null, null, 0.005);
      break;
    default:
  }
}

// Mid LOD: bake four static wheels into the kit draw.
function bakeWheels(P, S, o) {
  const r = o.wheelR, w = o.wheelW;
  const tyre = tyreGeo('slick', r, w, 16);
  for (const [x, z] of [[-0.3, 0.34], [0.3, 0.34], [-0.3, -0.34], [0.3, -0.34]]) {
    const px = x + Math.sign(x) * (o.trackOut || 0);
    P.add('kit', tyre, mat4([px, o.restY, z], [0, x < 0 ? PI : 0, 0]), COL.rubber);
    P.add('kit', cylGeo(r * 0.64, r * 0.64, w * 1.02, 12), mat4([px, o.restY, z], [0, 0, PI / 2]), COL.alu);
  }
}
