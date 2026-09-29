// Car shells, lofted. Each body is a stack of cross-sections along the car
// (z, +z = nose): a side profile (roof/deck line and underside), a plan
// (half-width along the car) and a section shape — then the things that
// make a toy car read as a car and not an extruded slab: the plan tapers into
// the nose and tail, the flanks lean in above the shoulder (tumblehome), the
// fenders swell over each axle and the underside is cut away into real wheel
// arches. The closed bodies get a greenhouse on top: a narrower loft whose
// faces are all glass, with a painted skin (roof, pillars, belt moulding)
// lifted off the same grid, so windows have real edges and real side glass.
//
// Everything here is plain geometry, cached per body variant and shared by
// every car in the lobby. The same body description answers questions
// (where is the tail at this height? where is the hood at this x?), which is
// how the detail kit bolts onto the actual surface instead of hand-tuned
// numbers that end up buried in the paint.
import * as THREE from 'three';

// ------------------------------------------------------------- math bits
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Monotone cubic through [x, y] points (Fritsch–Carlson): smooth like a
// spline, but never overshoots, so a flat roof stays flat and a bumper
// never bulges past the point it was drawn to.
export function mono(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ------------------------------------------------------------- the bodies
// Units are world units (1 u = 22.5 cm); the car is 1 u long. Wheels sit at
// x ±0.3, z ±0.34 (CarModel's WHEEL_POS). `axleY` is the stock-tune hub
// height the arches are cut around.
//   top/bot: side profile, [z, y]      plan: half-width along the car
//   tumble: [y from which the flanks lean in, how much by the top]
//   swell: [extra half-width over each axle, below y]   arch: arch radius
//   ends: [tail, nose] radius of the rounded end caps
//   green: greenhouse — base/windshield/roof/rear-glass stations, roof
//          height, half-widths at the belt and at the roof, the side-glass
//          span and the B pillar
// Section shape of the lower body, right half from the bottom centre to the
// top centre: [share of the half-width, share of the height]. The shoulder
// rolls over; the sill tucks under.
const SECTION = [
  [0, 0], [0.55, 0], [0.8, 0.012], [0.92, 0.05], [0.975, 0.13], [1, 0.3], [1, 0.5],
  [0.985, 0.64], [0.955, 0.76], [0.9, 0.86], [0.8, 0.93], [0.6, 0.98], [0.3, 1], [0, 1],
];
// Greenhouse section, right belt to the roof centre, x share of the local
// half-width and y share of the glass height. Rows 0–1 are the belt moulding,
// 1–4 the side glass, 4–7 the pillar/roof-rail band, 7–10 the windshield,
// roof and rear glass (which one depends on the station).
const GREEN_SECTION = [
  [1, 0], [0.996, 0.07], [0.978, 0.36], [0.958, 0.62], [0.935, 0.79],
  [0.905, 0.875], [0.865, 0.935], [0.81, 0.972], [0.62, 0.995], [0.32, 1], [0, 1],
];
const G_BELT = 1, G_SIDE = 4, G_PILLAR = 7;

export const BODIES = {
  balanced: { // Office Hatch: a hot hatch, upright glass, square tail
    z: [-0.475, 0.49], axleY: -0.145, arch: 0.153,
    top: [[-0.475, 0.06], [-0.462, 0.108], [-0.43, 0.122], [0.12, 0.116], [0.3, 0.098], [0.42, 0.078], [0.475, 0.05], [0.49, 0.015]],
    bot: [[-0.475, -0.07], [-0.44, -0.112], [-0.3, -0.122], [0.3, -0.122], [0.44, -0.112], [0.49, -0.075]],
    plan: [[-0.475, 0.262], [-0.44, 0.29], [-0.36, 0.3], [0.3, 0.3], [0.4, 0.294], [0.46, 0.278], [0.49, 0.235]],
    tumble: [0.04, 0.08], swell: [0.05, 0.05], ends: [0.028, 0.035],
    green: {
      z: [0.13, 0.0, -0.33, -0.44], roof: [0.222, 0.218],
      base: 0.262, roofHw: 0.212, side: [-0.37, 0.11], b: [-0.13, -0.1], rake: 0.012,
    },
  },
  drift: { // Drift King: long-nose fastback on a ducktail
    z: [-0.49, 0.5], axleY: -0.145, arch: 0.152,
    top: [[-0.49, 0.05], [-0.478, 0.094], [-0.455, 0.102], [-0.37, 0.088], [0.15, 0.078], [0.3, 0.062], [0.44, 0.044], [0.485, 0.022], [0.5, -0.01]],
    bot: [[-0.49, -0.075], [-0.45, -0.118], [-0.3, -0.128], [0.3, -0.128], [0.45, -0.12], [0.5, -0.085]],
    plan: [[-0.49, 0.27], [-0.45, 0.298], [-0.36, 0.305], [0.28, 0.305], [0.4, 0.3], [0.47, 0.285], [0.5, 0.24]],
    tumble: [0.02, 0.1], swell: [0.052, 0.04], ends: [0.025, 0.03],
    green: {
      z: [0.16, 0.0, -0.11, -0.37], roof: [0.17, 0.166],
      base: 0.25, roofHw: 0.18, side: [-0.2, 0.14], b: null, rake: 0.02,
    },
  },
  monster: { // Micro Monster: a stubby pickup cab and bed, high on its tyres
    z: [-0.42, 0.42], axleY: -0.095, arch: 0,
    top: [[-0.42, 0.16], [-0.405, 0.196], [-0.38, 0.2], [-0.14, 0.205], [0.16, 0.212], [0.3, 0.198], [0.39, 0.182], [0.42, 0.14]],
    bot: [[-0.42, 0.08], [-0.39, 0.06], [0.39, 0.06], [0.42, 0.08]],
    plan: [[-0.42, 0.22], [-0.39, 0.24], [0.36, 0.24], [0.41, 0.225], [0.42, 0.2]],
    tumble: [0.14, 0.05], swell: [0.0, 0.1], ends: [0.022, 0.028],
    green: {
      z: [0.175, 0.075, -0.1, -0.13], roof: [0.37, 0.368],
      base: 0.212, roofHw: 0.19, side: [-0.11, 0.14], b: null, rake: 0.01,
    },
    bed: [-0.405, -0.145], // open load bed (walls are bolted on, see carKit)
  },
  buggy: { // Dune Buggy: an open tub, rear engine out in the air
    z: [-0.31, 0.46], axleY: -0.145, arch: 0,
    top: [[-0.31, 0.07], [-0.29, 0.1], [-0.2, 0.112], [0.14, 0.112], [0.24, 0.094], [0.38, 0.06], [0.46, 0.02]],
    bot: [[-0.31, -0.04], [-0.27, -0.075], [0.3, -0.075], [0.42, -0.05], [0.46, -0.02]],
    plan: [[-0.31, 0.16], [-0.27, 0.19], [0.1, 0.2], [0.3, 0.17], [0.42, 0.13], [0.46, 0.09]],
    tumble: [0.02, 0.1], swell: [0, 0], ends: [0.03, 0.03],
    cockpit: [-0.22, 0.13, 0.14], // [z0, z1, half-width] of the open tub
  },
  formula: { // Formula Fun: needle nose, sidepods, engine cover ending short
    // of the gearbox so the drivetrain shows under the rear wing
    z: [-0.35, 0.47], axleY: -0.145, arch: 0,
    top: [[-0.35, 0.04], [-0.32, 0.075], [-0.2, 0.1], [-0.08, 0.118], [0.0, 0.1], [0.14, 0.085], [0.3, 0.06], [0.44, 0.032], [0.47, 0.012]],
    bot: [[-0.35, -0.035], [-0.32, -0.06], [0.3, -0.06], [0.44, -0.035], [0.47, -0.02]],
    plan: [[-0.35, 0.05], [-0.3, 0.075], [-0.1, 0.1], [0.14, 0.1], [0.3, 0.07], [0.44, 0.04], [0.47, 0.03]],
    tumble: [0.04, 0.25], swell: [0, 0], ends: [0.025, 0.02],
    // sidepods: [z0, z1, half-width, top y] — a low shelf either side of the tub
    pods: [-0.3, 0.12, 0.2, 0.045],
    cockpit: [-0.06, 0.13, 0.075],
  },
};

// ------------------------------------------------------------- shape queries
// Everything below derives from a compiled body: fast closures for the side
// profile, the plan and the section at any z.
const compiled = new Map();
function compile(carId, wide = false) {
  const key = `${carId}${wide ? ':w' : ''}`;
  if (compiled.has(key)) return compiled.get(key);
  const B = BODIES[carId] || BODIES.balanced;
  const top = mono(B.top), bot0 = mono(B.bot), plan = mono(B.plan);
  const [zt, zn] = B.z;
  const axles = [-0.34, 0.34];
  const swellAmt = B.swell[0] + (wide ? 0.035 : 0);
  // Wheel arches: the underside climbs a circle round each hub. Cut across
  // the whole width — nobody sees the tunnel, and from the side it is the arch.
  const bot = (z) => {
    let y = bot0(z);
    if (B.arch) {
      for (const az of axles) {
        const dz = z - az;
        if (Math.abs(dz) < B.arch) y = Math.max(y, B.axleY + Math.sqrt(B.arch * B.arch - dz * dz));
      }
    }
    return Math.min(y, top(z) - 0.012);
  };
  const pods = B.pods;
  const hw = (z, y) => {
    let w = plan(z);
    // tumblehome: the flank leans in from the shoulder up
    const t = top(z);
    w *= 1 - B.tumble[1] * clamp01((y - B.tumble[0]) / Math.max(0.02, t - B.tumble[0]));
    // fender swell over each axle, fading out toward the shoulder
    if (swellAmt) {
      let g = 0;
      for (const az of axles) g += Math.exp(-(((z - az) / 0.13) ** 2));
      w += swellAmt * g * (1 - smooth(B.swell[1] - 0.03, B.swell[1] + 0.03, y));
    }
    // formula sidepods: a wide low shelf, blended into the tub
    if (pods) {
      const inZ = smooth(pods[0] - 0.08, pods[0] + 0.04, z) * (1 - smooth(pods[1] - 0.06, pods[1] + 0.02, z));
      const low = 1 - smooth(pods[3] - 0.02, pods[3] + 0.015, y);
      w = Math.max(w, w + (pods[2] - w) * inZ * low);
    }
    return w;
  };
  // rounded end caps: the section closes over the last few cm
  const endScale = (z) => {
    const [rt, rn] = B.ends;
    if (z < zt + rt) { const d = (zt + rt - z) / rt; return Math.sqrt(Math.max(0, 1 - d * d)); }
    if (z > zn - rn) { const d = (z - (zn - rn)) / rn; return Math.sqrt(Math.max(0, 1 - d * d)); }
    return 1;
  };
  const C = { B, key, top, bot, plan, hw, endScale, zt, zn, axles, wide };
  compiled.set(key, C);
  return C;
}

// point on the lower-body section at station z, row j (right half)
function sectionPoint(C, z, j, out) {
  const yb = C.bot(z), yt = C.top(z), e = C.endScale(z);
  const [xf, yf] = SECTION[j];
  const yc = (yb + yt) / 2;
  const y0 = yb + (yt - yb) * yf;
  const y = yc + (y0 - yc) * e;
  out[0] = C.hw(z, y0) * xf * e;
  out[1] = y;
  return out;
}

// Half-width of the lower body at (z, y), or −1 above/below it.
export function bodyX(carId, z, y, wide) {
  const C = compile(carId, wide);
  if (z < C.zt || z > C.zn) return -1;
  const p = [0, 0];
  let prev = sectionPoint(C, z, 0, [0, 0]);
  for (let j = 1; j < SECTION.length; j++) {
    sectionPoint(C, z, j, p);
    if ((prev[1] - y) * (p[1] - y) <= 0 && prev[1] !== p[1]) {
      // the outer crossing on the way up the right half
      const t = (y - prev[1]) / (p[1] - prev[1]);
      const x = prev[0] + (p[0] - prev[0]) * t;
      if (j > 1 || x > 0.001) return x;
    }
    prev = [p[0], p[1]];
  }
  return -1;
}

// Height of the body's upper surface at (z, x) — for things that sit on the
// hood, deck or roof. Includes the greenhouse roof where there is one.
// ...and the same for the painted lower body only (under the greenhouse:
// the cabin floor, the cowl the wipers rest on).
export function deckY(carId, z, x = 0, wide) {
  return surfaceBody(compile(carId, wide), z, Math.abs(x));
}

export function surfaceY(carId, z, x = 0, wide) {
  const C = compile(carId, wide);
  const ax = Math.abs(x);
  const p = [0, 0];
  let y = -1;
  // walk the top half of the section from the centre outward
  let prev = sectionPoint(C, z, SECTION.length - 1, [0, 0]);
  for (let j = SECTION.length - 2; j >= 0; j--) {
    sectionPoint(C, z, j, p);
    if (ax >= prev[0] && ax <= p[0] && p[0] > prev[0]) {
      y = prev[1] + (p[1] - prev[1]) * ((ax - prev[0]) / (p[0] - prev[0]));
      break;
    }
    prev = [p[0], p[1]];
  }
  const G = greenAt(carId, z, wide);
  if (G && ax < G.hwRoof) y = Math.max(y, G.yTop - (G.yTop - G.yBase) * (ax / G.hwRoof) ** 6);
  return y;
}

// Where the body ends along z at height y and half-width x: the nose
// (end = +1) or tail (end = −1) surface, for lamps, grilles and plates.
export function endZ(carId, end, x = 0, y = 0, wide) {
  const C = compile(carId, wide);
  const inside = (z) => bodyX(carId, z, y, wide) >= Math.abs(x);
  // march in from the end until the point is inside (the arches make the
  // body non-convex, so a plain bisection can land in a wheel tunnel)...
  const z0 = end > 0 ? C.zn : C.zt, step = -end * 0.004;
  let z = z0;
  for (let i = 0; i < 120 && !inside(z); i++) z += step;
  // ...then refine between the last outside and first inside station
  let lo = z - step, hi = z;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

export function bodyInfo(carId, wide) {
  const C = compile(carId, wide);
  return C;
}

// ------------------------------------------------------------- lofting
// Station spacing: dense at the ends (where the caps close) and through the
// arches (where the underside climbs), plus any z the caller needs crisp.
function stations(C, extra = [], coarse = false) {
  const zs = [];
  const n = coarse ? 18 : 30;
  for (let i = 0; i <= n; i++) zs.push(C.zt + (C.zn - C.zt) * (0.5 - 0.5 * Math.cos((Math.PI * i) / n)));
  const [rt, rn] = C.B.ends;
  for (let i = 1; i < (coarse ? 3 : 5); i++) { zs.push(C.zt + rt * (1 - Math.cos((i / 5) * Math.PI / 2))); zs.push(C.zn - rn * (1 - Math.cos((i / 5) * Math.PI / 2))); }
  if (C.B.arch) {
    for (const az of C.axles) {
      const m = coarse ? 3 : 6;
      for (let k = -m; k <= m; k++) zs.push(az + (k / m) * (C.B.arch + 0.01));
    }
  }
  if (C.B.pods) { const p = C.B.pods; for (const z of [p[0] - 0.08, p[0] - 0.04, p[0], p[0] + 0.04, p[1] - 0.06, p[1] - 0.02, p[1] + 0.02]) zs.push(z); }
  zs.push(...extra);
  zs.sort((a, b) => a - b);
  const out = [];
  for (const z of zs) {
    if (z < C.zt - 1e-6 || z > C.zn + 1e-6) continue;
    if (!out.length || z - out[out.length - 1] > 0.006) out.push(z);
  }
  out[0] = C.zt; out[out.length - 1] = C.zn;
  return out;
}

// Grid → indexed geometry. `ring[i][j]` = [x, y, z]; closed rings wrap.
// Winding is chosen so normals face out; uv = (z, distance round the ring).
function gridGeo(rows, closed, flip = false) {
  const S = rows.length, R = rows[0].length;
  const pos = new Float32Array(S * R * 3), uv = new Float32Array(S * R * 2);
  for (let i = 0; i < S; i++) {
    let run = 0;
    for (let j = 0; j < R; j++) {
      const p = rows[i][j], k = (i * R + j);
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      if (j > 0) { const q = rows[i][j - 1]; run += Math.hypot(p[0] - q[0], p[1] - q[1]); }
      uv[k * 2] = p[2] * 2; uv[k * 2 + 1] = run * 2;
    }
  }
  const idx = [];
  const J = closed ? R : R - 1;
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < J; j++) {
      const a = i * R + j, b = (i + 1) * R + j, c = i * R + ((j + 1) % R), d = (i + 1) * R + ((j + 1) % R);
      if (flip) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Lower body: full closed ring per station, right half then mirrored left.
function lowerRows(C, zs) {
  const rows = [];
  const p = [0, 0];
  const J = SECTION.length;
  for (const z of zs) {
    const ring = [];
    for (let j = 0; j < J; j++) { sectionPoint(C, z, j, p); ring.push([p[0], p[1], z]); }
    for (let j = J - 2; j > 0; j--) { const q = ring[j]; ring.push([-q[0], q[1], z]); }
    rows.push(ring);
  }
  return rows;
}

// Greenhouse stations and heights. Between the windshield base and the
// roof front the glass rises on an eased curve; roof; then the rear glass.
function greenAt(carId, z, wide) {
  const B = BODIES[carId];
  const G = B?.green;
  if (!G) return null;
  const [zf, zw, zr, zb] = G.z;
  if (z > zf || z < zb) return null;
  const C = compile(carId, wide);
  const roofY = G.roof[1] + (G.roof[0] - G.roof[1]) * clamp01((z - zr) / (zw - zr));
  let f;
  if (z > zw) f = 1 - ((z - zw) / (zf - zw)); // windshield
  else if (z < zr) f = 1 - ((zr - z) / (zr - zb)); // rear glass
  else f = 1;
  // ease: glass bows outward a touch rather than running dead straight
  f = f <= 0 ? 0 : 1 - (1 - f) ** 1.35;
  // plan: the greenhouse narrows toward its ends like the body under it
  const ends = 1 - 0.1 * (smooth(zw - 0.05, zf, z) + smooth(zr + 0.05, zb, z));
  const hwBase = G.base * ends, hwRoof = G.roofHw * (1 - 0.06 * (smooth(zw, zf, z) + smooth(zr, zb, z)));
  // sit the belt on the body's actual shoulder at that width, a hair inside
  const yBase = surfaceBody(C, z, hwBase) - 0.004;
  const yTop = yBase + Math.max(0, roofY - yBase) * f;
  return { yBase, yTop, hwBase, hwRoof, f };
}

// body top surface y at (z, x), lower body only
function surfaceBody(C, z, x) {
  const p = [0, 0];
  let prev = sectionPoint(C, z, SECTION.length - 1, [0, 0]);
  for (let j = SECTION.length - 2; j >= 0; j--) {
    sectionPoint(C, z, j, p);
    if (x >= prev[0] && x <= p[0] && p[0] > prev[0]) {
      return prev[1] + (p[1] - prev[1]) * ((x - prev[0]) / (p[0] - prev[0]));
    }
    prev = [p[0], p[1]];
  }
  return p[1];
}

function greenStations(carId, coarse = false) {
  const G = BODIES[carId].green;
  const [zf, zw, zr, zb] = G.z;
  const zs = [];
  const add = (a, b, n) => { for (let i = 0; i <= n; i++) zs.push(a + (b - a) * (i / n)); };
  const k = coarse ? 0.5 : 1;
  add(zb, zr, Math.ceil(6 * k)); add(zr, zw, Math.ceil(10 * k)); add(zw, zf, Math.ceil(8 * k));
  zs.push(...G.side, ...(G.b || []));
  zs.sort((a, b) => a - b);
  const out = [];
  for (const z of zs) if (!out.length || z - out[out.length - 1] > 0.004) out.push(z);
  return out;
}

function greenRows(carId, wide, zs, lift = 0) {
  const rows = [];
  for (const z of zs) {
    const g = greenAt(carId, z, wide);
    const ring = [];
    for (const [xf, yf] of GREEN_SECTION) {
      const hw = g.hwBase + (g.hwRoof - g.hwBase) * yf;
      ring.push([hw * xf, g.yBase + (g.yTop - g.yBase) * yf, z]);
    }
    for (let j = GREEN_SECTION.length - 2; j >= 0; j--) { const q = ring[j]; ring.push([-q[0], q[1], z]); }
    rows.push(ring);
  }
  if (lift) {
    // painted skin: the same grid pushed out along its normals
    const geo = gridGeo(rows, false);
    const n = geo.attributes.normal;
    const R = rows[0].length;
    rows.forEach((ring, i) => ring.forEach((p, j) => {
      const k = i * R + j;
      p[0] += n.getX(k) * lift; p[1] += n.getY(k) * lift; p[2] += n.getZ(k) * lift;
    }));
  }
  return rows;
}

// Sub-grid of faces [i0..i1] × [j0..j1] (inclusive vertex ranges) as its own
// geometry — the painted parts of the greenhouse skin.
function patch(rows, i0, i1, j0, j1) {
  const sub = [];
  for (let i = i0; i <= i1; i++) sub.push(rows[i].slice(j0, j1 + 1));
  return gridGeo(sub, false);
}

const shellCache = new Map();
// { paint, glass, outline } geometries for one body (and widebody variant).
// paint = lower body + roof/pillar skin; glass = the whole greenhouse.
// `coarse`: the mid-LOD / proxy build, about half the stations.
export function shellGeos(carId, wide = false, coarse = false) {
  const id = BODIES[carId] ? carId : 'balanced';
  const key = `${id}${wide ? ':w' : ''}${coarse ? ':c' : ''}`;
  if (shellCache.has(key)) return shellCache.get(key);
  const C = compile(id, wide);
  const G = C.B.green;
  const zs = stations(C, G ? G.z : [], coarse);
  const lower = gridGeo(lowerRows(C, zs), true);
  fixEndNormals(lower, lowerRows(C, zs)[0].length);
  const paintParts = [lower];
  let glass = null, green = null;
  if (G) {
    const gz = greenStations(id, coarse);
    green = greenRows(id, wide, gz);
    glass = gridGeo(green, false);
    const skin = greenRows(id, wide, gz, 0.0035);
    const R = skin[0].length, mid = GREEN_SECTION.length - 1; // centre column
    const iOf = (z) => gz.reduce((best, v, i) => (Math.abs(v - z) < Math.abs(gz[best] - z) ? i : best), 0);
    const last = gz.length - 1;
    const [zf, zw, zr, zb] = G.z;
    const [s0, s1] = G.side;
    for (const side of [0, 1]) {
      // column ranges on this side: belt, side glass, pillar band
      const col = (a, b) => (side ? [R - 1 - b, R - 1 - a] : [a, b]);
      const [b0, b1] = col(0, G_BELT);
      paintParts.push(patch(skin, 0, last, b0, b1)); // belt moulding
      const [p0, p1] = col(G_SIDE, G_PILLAR);
      paintParts.push(patch(skin, 0, last, p0, p1)); // A/C pillars + roof rail
      const [w0, w1] = col(G_BELT, G_SIDE);
      // side glass only between its span; the rest of the flank is painted
      if (iOf(s0) > 0) paintParts.push(patch(skin, 0, iOf(s0), w0, w1));
      if (iOf(s1) < last) paintParts.push(patch(skin, iOf(s1), last, w0, w1));
      if (G.b) paintParts.push(patch(skin, iOf(G.b[0]), iOf(G.b[1]), w0, w1));
    }
    // roof panel between the windshield header and the rear glass
    paintParts.push(patch(skin, iOf(zr), iOf(zw), G_PILLAR, R - 1 - G_PILLAR));
    void zf; void zb; void mid;
  }
  const paint = mergeSimple(paintParts);
  // Outline: the silhouette pushed out along smooth normals and drawn
  // back-faces only — a clean ink line that hugs the curves (a uniformly
  // scaled copy pulls away from the ends and sinks into the middle).
  const coarseRows = lowerRows(C, stations(C, G ? G.z : [], true));
  const outline = inflate(gridGeo(coarseRows, true), 0.011);
  const outlineParts = [outline];
  if (green) {
    const gz = greenStations(id, coarse);
    outlineParts.push(inflate(gridGeo(greenRows(id, wide, gz), false), 0.011));
  }
  const res = { paint, glass, outline: mergeSimple(outlineParts), lower };
  shellCache.set(key, res);
  return res;
}

// The collapsed end rings share one point; give them a clean axial normal.
function fixEndNormals(geo, R) {
  const n = geo.attributes.normal;
  const count = n.count;
  for (let j = 0; j < R; j++) { n.setXYZ(j, 0, 0, -1); n.setXYZ(count - R + j, 0, 0, 1); }
  n.needsUpdate = true;
}

function inflate(geo, d) {
  const g = geo.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  }
  return g;
}

// Merge indexed geometries that carry position/normal/uv only.
function mergeSimple(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    uv.set(g.attributes.uv.array, ov * 2);
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) idx[oi + k] = src[k] + ov;
    ov += g.attributes.position.count; oi += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Real outer surfaces of a shell: where the nose, tail, flanks and roof are.
const boundsCache = new Map();
export function shellBounds(carId, wide = false) {
  const key = `${carId}${wide ? ':w' : ''}`;
  if (boundsCache.has(key)) return boundsCache.get(key);
  const { paint, glass } = shellGeos(carId, wide);
  const bb = paint.boundingBox.clone();
  if (glass) { glass.computeBoundingBox(); bb.union(glass.boundingBox); }
  const b = { noseZ: bb.max.z, tailZ: bb.min.z, halfW: bb.max.x, topY: bb.max.y, botY: bb.min.y };
  boundsCache.set(key, b);
  return b;
}
