// Every prop's model, built once in metres from propKit's parts and baked to
// one geometry per material. Origins and sizes match the colliders in
// Props.jsx: the body is the source of truth, the model dresses it.
//
// Colours: the tint mask (propKit.jsx) decides what an instance colour
// reaches — tint: 1 on the glaze, the cloth, the pen cap; plain vertex
// colour everywhere else.
import * as THREE from 'three';
import { box, rbox, cyl, lathe, tube, frustum, combine, part, bake, defineModel } from './propKit.jsx';

const PI = Math.PI;

// --------------------------------------------------------------- mug
// A thrown mug with an OPEN top: 4 mm wall, coffee 2 cm below the rim, a
// C-handle that meets the body instead of a torus sunk into it. The lathe
// starts at the handle so the print lands on the two faces you see.
defineModel('mug', (lo) => {
  const s0 = PI / 2; // lathe seam at the handle (+x)
  const n = lo ? 12 : 24;
  return bake([
    // unglazed foot ring
    part(lathe([[0, -0.05], [0.034, -0.05], [0.0375, -0.0494], [0.0395, -0.0478]], n, s0), 'ceramic', { color: '#d9d0c1' }),
    part(lathe([[0.0395, -0.0478], [0.0418, -0.0445], [0.043, -0.038], [0.043, -0.036]], n, s0), 'ceramic', { tint: 1 }),
    part(lathe([[0.043, -0.036], [0.043, 0.04]], n, s0), 'ceramic', { tint: 1, region: 'mug' }),
    // rolled rim, then down the inside wall to the coffee
    part(lathe([[0.043, 0.04], [0.0429, 0.047], [0.0422, 0.0493], [0.041, 0.05], [0.0398, 0.0494], [0.0391, 0.047], [0.039, 0.03]], n, s0), 'ceramic', { tint: 1 }),
    part(tube([[0.0405, 0.029, 0], [0.058, 0.031, 0], [0.071, 0.019, 0], [0.073, -0.004, 0], [0.066, -0.024, 0], [0.05, -0.031, 0], [0.0405, -0.03, 0]], 0.0058, lo ? 8 : 16, lo ? 4 : 7), 'ceramic', { tint: 1 }),
  ]);
}, 4);
defineModel('coffee', () => bake([
  part(new THREE.CircleGeometry(0.0392, 20).rotateX(-PI / 2), 'coffee', { at: [0, 0.03, 0] }),
]));

// --------------------------------------------------------------- glass
// A tumbler: 2 mm wall, a thick 9 mm base that catches the light.
defineModel('glass', (lo) => bake([
  part(lathe([
    [0, -0.06], [0.03, -0.06], [0.0326, -0.0586], [0.0336, -0.055], [0.0398, 0.0582], [0.0396, 0.0598],
    [0.0384, 0.0598], [0.0379, 0.058], [0.0318, -0.0505], [0.02, -0.051], [0, -0.0512],
  ], lo ? 12 : 22), 'glass'),
]), 4);

// --------------------------------------------------------------- can
// Necked top with a rim and a recessed lid, a domed base, the wrap label.
function canParts(material, label) {
  return [
    part(lathe([[0, -0.051], [0.014, -0.0535], [0.0235, -0.0575], [0.0265, -0.0575], [0.0305, -0.0545], [0.033, -0.048]], 20), material),
    part(lathe([[0.033, -0.048], [0.033, 0.039]], 20), material, { region: label }),
    part(lathe([[0.033, 0.039], [0.0328, 0.043], [0.0285, 0.052], [0.0278, 0.0555], [0.0281, 0.0575], [0.0266, 0.0577], [0.026, 0.0545], [0, 0.0545]], 20), material),
    part(rbox(0.012, 0.0012, 0.021, 0.0005), material, { at: [0, 0.0552, 0.006] }),
  ];
}
defineModel('can', () => bake(canParts('metal', 'can')));
defineModel('canGold', () => bake(canParts('gold', 'canGold')));

// --------------------------------------------------------------- pen
// A stick pen along +y: clear hex barrel, coloured cap with a clip over the
// tip end, coloured end plug. The colour parts take the instance tint.
defineModel('pen', () => bake([
  part(cyl(0.0064, 0.0064, 0.112, 6), 'plastic', { at: [0, 0.0045, 0], color: '#e8edf1' }),
  part(cyl(0.0012, 0.0045, 0.008, 8), 'metal', { at: [0, -0.056, 0], color: '#c9a44a' }),
  part(lathe([[0, -0.0725], [0.0055, -0.0722], [0.0076, -0.069], [0.0076, -0.028], [0.0068, -0.027]], 10), 'plastic', { tint: 1 }),
  part(rbox(0.0026, 0.036, 0.0042, 0.001), 'plastic', { at: [0.0086, -0.045, 0], tint: 1 }),
  part(cyl(0.0042, 0.0046, 0.009, 8), 'plastic', { at: [0, 0.064, 0], tint: 1 }),
]));

// --------------------------------------------------------------- paper
// One bundle of a stack: 1.2 cm of sheets — fine page lines round the edge,
// a printed report on top.
defineModel('sheets', () => bake([
  part(box(0.21, 0.012, 0.297), 'paper', {
    tint: 1, faces: { 0: 'pages', 1: 'pages', 2: 'paper', 4: 'pages', 5: 'pages' },
  }),
]));

// --------------------------------------------------------------- book
// A hardback lying on its back: two 3.5 mm boards overhanging a page block
// by 4 mm, a rounded spine on −x. Cloth takes the tint, pages don't.
defineModel('book', () => {
  const spine = new THREE.CylinderGeometry(0.025, 0.025, 0.24, 10, 1, true, PI, PI).rotateX(PI / 2);
  return bake([
    part(rbox(0.162, 0.0035, 0.24, 0.0012), 'paper', { at: [0.004, 0.02325, 0], tint: 1, faces: { 2: 'cover' } }),
    part(rbox(0.162, 0.0035, 0.24, 0.0012), 'paper', { at: [0.004, -0.02325, 0], tint: 1, faces: { 3: 'cover' } }),
    part(spine, 'paper', { at: [-0.076, 0, 0], scale: [0.36, 1, 1], tint: 1, region: 'spine', swapUV: true }),
    part(box(0.156, 0.043, 0.232), 'paper', { at: [0.002, 0, 0], faces: { 0: 'pages', 4: 'pages', 5: 'pages' } }),
  ]);
});

// --------------------------------------------------------------- keyboard
// Full-size, origin on the desk: a wedge deck 12 mm at the front (+z) to
// 22 mm at the back, and ~100 real keycaps (10 tris each) in rows that step
// up with the deck. Two palettes: office black, cellar beige-retro.
function keyboard(pal, lo) {
  const U = 0.019; // one key unit
  const deckY = (z) => 0.012 + (0.075 - z) / 0.15 * 0.01;
  const deck = rbox(0.44, 0.02, 0.15, 0.005);
  const P = deck.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i) + 0.01, z = P.getZ(i);
    P.setY(i, y * (deckY(z) / 0.02));
  }
  deck.computeVertexNormals();
  const parts = [part(deck, 'plastic', { color: pal.deck })];
  const keys = [];
  const row = (r, x0, widths, gapAfter = {}) => {
    let x = x0;
    widths.forEach((w, i) => {
      keys.push({ x: x + (w * U) / 2, r, w, mod: w > 1.01 || (r === 5 && i === 0) });
      x += w * U + (gapAfter[i] || 0) * U;
    });
  };
  const L = -0.44 / 2 + 0.012;
  row(0, L, [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25]);
  row(1, L, [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75]);
  row(2, L, [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25]);
  row(3, L, [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5]);
  row(4, L, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  row(5, L, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { 0: 1, 4: 0.5, 8: 0.5 });
  const N = L + 15.5 * U; // nav cluster
  row(0, N, [1, 1, 1]); row(1, N + U, [1]);
  row(3, N, [1, 1, 1]); row(4, N, [1, 1, 1]); row(5, N, [1, 1, 1]);
  const K = N + 3.5 * U; // numpad
  row(0, K, [2, 1, 1]); row(1, K, [1, 1, 1, 1]); row(2, K, [1, 1, 1, 1]); row(3, K, [1, 1, 1, 1]); row(4, K, [1, 1, 1, 1]);
  // far away: each row is one strip of caps
  if (lo) {
    for (let r = 0; r < 6; r++) {
      const z = 0.0535 - r * U - (r === 5 ? 0.005 : 0);
      parts.push(part(frustum(0.412, U - 0.003, 0.41, U - 0.0075, 0.0075), 'plastic', { at: [0, deckY(z) - 0.0015, z], color: pal.key }));
    }
    return bake(parts);
  }
  for (const k of keys) {
    const z = 0.0535 - k.r * U - (k.r === 5 ? 0.005 : 0);
    const w = k.w * U;
    parts.push(part(frustum(w - 0.003, U - 0.003, w - 0.0075, U - 0.0075, 0.0075), 'plastic', {
      at: [k.x, deckY(z) - 0.0015, z], color: k.mod ? pal.mod : pal.key, region: k.w === 6.25 ? null : 'keys',
    }));
  }
  // rubber feet at the back corners, the little legs up
  for (const x of [-0.19, 0.19]) parts.push(part(box(0.03, 0.006, 0.012), 'plastic', { at: [x, 0.003, -0.066], color: '#141414' }));
  return bake(parts);
}
defineModel('keyboard', (lo) => keyboard({ deck: '#26282d', key: '#34373e', mod: '#202226' }, lo), 4);
defineModel('keyboardRetro', (lo) => keyboard({ deck: '#cdc4ad', key: '#ddd6c4', mod: '#a9a18d' }, lo), 4);

// --------------------------------------------------------------- monitor
// Origin at the foot. A thin 8 mm-bezel panel (chin 16 mm) on a tapered back
// housing; the neck is mounted at the BACK and leans 6°; a slim oval-ish base
// plate; a cable out of the back. The screen is its own model (a live canvas).
const PANEL_Y = 0.2655;
defineModel('monitor', (lo) => bake([
  part(rbox(0.2, 0.012, 0.14, 0.006), 'plastic', { at: [0, 0.006, 0], color: '#2b2e35' }),
  part(rbox(0.05, 0.22, 0.016, 0.006), 'plastic', { at: [0, 0.118, -0.045], rot: [-0.1, 0, 0], color: '#2b2e35' }),
  part(rbox(0.07, 0.05, 0.03, 0.008), 'plastic', { at: [0, 0.232, -0.05], color: '#24262c' }),
  part(rbox(0.54, 0.32, 0.012, 0.004), 'plastic', { at: [0, PANEL_Y, 0], color: '#15171b' }),
  part(frustum(0.44, 0.27, 0.3, 0.16, 0.032), 'plastic', { at: [0, PANEL_Y, -0.005], rot: [-PI / 2, 0, 0], color: '#23252b' }),
  ...(lo ? [] : [part(tube([[0.02, 0.215, -0.062], [0.026, 0.12, -0.072], [0.03, 0.03, -0.078], [0.036, 0.0035, -0.11], [0.05, 0.0035, -0.17]], 0.0028, 14, 5), 'plastic', { color: '#16171a' })]),
  // power LED on the chin
  part(box(0.006, 0.002, 0.002), 'glow', { at: [0.24, PANEL_Y - 0.156, 0.0062], color: '#7fd0ff' }),
]), 6);
for (let k = 0; k < 3; k++) {
  defineModel(`screen${k}`, () => bake([
    part(new THREE.PlaneGeometry(0.524, 0.296), `screen${k}`, { at: [0, PANEL_Y + 0.004, 0.0063], region: 'own' }),
  ]));
}

// --------------------------------------------------------------- chairs
// Task chair, origin on the floor under the casters. Five arms (each a
// tapered spoke from the hub — not five boxes through the middle, which drew
// ten), five twin-wheel casters at eye level, gas lift with a shroud, the
// tilt mechanism, a squarish cushion (tinted fabric), a curved mesh back on
// a spine, T-arms.
const bend = (g, fn) => {
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const [x, y, z] = fn(P.getX(i), P.getY(i), P.getZ(i));
    P.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
};

const caster = (lo) => combine(lo
  ? [{ geo: box(0.03, 0.05, 0.045), at: [0, 0.03, -0.004] }]
  : [
    { geo: cyl(0.024, 0.024, 0.011, 10), at: [0.0085, 0.024, 0], rot: [0, 0, PI / 2] },
    { geo: cyl(0.024, 0.024, 0.011, 10), at: [-0.0085, 0.024, 0], rot: [0, 0, PI / 2] },
    { geo: frustum(0.008, 0.05, 0.008, 0.03, 0.022), at: [0, 0.03, -0.004] },
    { geo: cyl(0.005, 0.005, 0.02, 6), at: [0, 0.06, 0] },
  ]);

function starBase(parts, dark, lo) {
  const c = caster(lo);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    const arm = bend(new THREE.BoxGeometry(0.042, 0.036, 0.26, 1, 1, 4).toNonIndexed(), (x, y, z) => {
      const t = (z + 0.13) / 0.26;
      return [x * (1 - 0.35 * t), y * (1 - 0.3 * t) + 0.094 - 0.022 * t, z + 0.16];
    });
    parts.push(part(arm, 'plastic', { rot: [0, a, 0], color: dark }));
    const swivel = (i * 2.3) % (PI * 2);
    const cx = Math.sin(a) * 0.29, cz = Math.cos(a) * 0.29;
    parts.push(part(c, 'plastic', { at: [cx, 0, cz], rot: [0, swivel, 0], color: '#1a1b1e' }));
  }
  parts.push(part(cyl(0.042, 0.05, 0.05, lo ? 8 : 14), 'plastic', { at: [0, 0.095, 0], color: dark }));
}

defineModel('chair', (lo) => {
  const dark = '#232428';
  const seg = lo ? 1 : 2;
  const parts = [];
  starBase(parts, dark, lo);
  parts.push(
    part(cyl(0.026, 0.029, 0.16, lo ? 8 : 14), 'plastic', { at: [0, 0.19, 0], color: '#1c1d20' }),
    part(cyl(0.014, 0.014, 0.13, lo ? 6 : 10), 'metal', { at: [0, 0.33, 0], color: '#cfd5dc' }),
    part(rbox(0.2, 0.045, 0.22, 0.01), 'plastic', { at: [0, 0.4, 0], color: '#2a2b2f' }),
    // cushion on its moulded pan
    part(box(0.46, 0.022, 0.44), 'plastic', { at: [0, 0.428, 0.01], color: '#1f2023' }),
    part(bend(rbox(0.48, 0.075, 0.46, 0.034, seg), (x, y, z) => [x, y - (z > 0.15 ? (z - 0.15) * 0.12 : 0), z]), 'fabric', { at: [0, 0.474, 0.01], tint: 1 }),
    // back spine: a flat bar sweeping up from the mechanism
    part(tube([[0, 0.405, -0.08], [0, 0.415, -0.19], [0, 0.48, -0.245], [0, 0.6, -0.258]], 0.017, lo ? 4 : 10, lo ? 4 : 6), 'plastic', { color: dark, scale: [1.6, 1, 0.6] }),
    // curved mesh back in its frame, reclined a touch
    part(bend(rbox(0.44, 0.52, 0.03, 0.013, seg), (x, y, z) => [x, y, z + 0.75 * x * x - 0.03 * Math.cos((y / 0.26) * 1.4)]), 'fabric', {
      at: [0, 0.77, -0.235], rot: [-0.1, 0, 0], faces: { 0: 'mesh', 1: 'mesh', 2: 'mesh', 3: 'mesh', 4: 'mesh', 5: 'mesh' },
    }),
  );
  if (!lo) parts.push(part(box(0.09, 0.008, 0.022), 'plastic', { at: [0.14, 0.395, 0.05], rot: [0, 0.3, -0.15], color: '#2a2b2f' }));
  for (const s of [-1, 1]) {
    parts.push(
      part(tube([[s * 0.17, 0.412, 0.01], [s * 0.235, 0.418, 0.01], [s * 0.258, 0.47, 0.0], [s * 0.258, 0.64, -0.01]], 0.013, lo ? 3 : 8, lo ? 4 : 6), 'plastic', { color: dark }),
      part(lo ? box(0.07, 0.024, 0.24) : rbox(0.07, 0.024, 0.24, 0.01), 'plastic', { at: [s * 0.258, 0.655, -0.005], color: '#1c1d20' }),
    );
  }
  return bake(parts);
}, 7);

// Café / meeting chair: one moulded shell (tinted) — seat, waist and back
// swept from a side profile, sides curling up, a rolled front lip — on four
// splayed oak dowel legs with a black wire cross-brace. Same colliders as the
// task chair.
function shell(lo) {
  // side profile (z, y) from the front lip, across the seat, up the back
  const prof = new THREE.CatmullRomCurve3([
    [0.235, 0.425], [0.215, 0.452], [0.12, 0.446], [-0.05, 0.444], [-0.17, 0.46],
    [-0.215, 0.53], [-0.235, 0.64], [-0.25, 0.76], [-0.258, 0.82],
  ].map(([z, y]) => new THREE.Vector3(0, y, z)));
  const nu = lo ? 6 : 10, nv = lo ? 10 : 18, T = 0.009;
  const surf = (u, v) => {
    const p = prof.getPoint(v);
    const back = THREE.MathUtils.smoothstep(v, 0.45, 0.7);
    const halfW = 0.232 - 0.03 * Math.sin(Math.PI * THREE.MathUtils.clamp((v - 0.35) / 0.35, 0, 1)) - 0.012 * back;
    const x = (u * 2 - 1) * halfW;
    const e = Math.pow(Math.abs(u * 2 - 1), 3);
    // seat: the edges rise; back: the edges wrap forward
    return new THREE.Vector3(x, p.y + e * 0.035 * (1 - back), p.z + e * 0.05 * back);
  };
  const pos = [], idx = [];
  const grid = (off, flip) => {
    const base = pos.length / 3;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, d = 0.002;
        const p = surf(u, v);
        const n = new THREE.Vector3().subVectors(surf(Math.min(1, u + d), v), surf(Math.max(0, u - d), v))
          .cross(new THREE.Vector3().subVectors(surf(u, Math.min(1, v + d)), surf(u, Math.max(0, v - d)))).normalize();
        pos.push(p.x + n.x * off, p.y + n.y * off, p.z + n.z * off);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, b = a + nu + 1;
        if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return base;
  };
  const top = grid(0, false), bot = grid(-T, true);
  // the rim: join the two skins round the edge
  const ring = [];
  for (let i = 0; i <= nu; i++) ring.push(i);
  for (let j = 1; j <= nv; j++) ring.push(j * (nu + 1) + nu);
  for (let i = nu - 1; i >= 0; i--) ring.push(nv * (nu + 1) + i);
  for (let j = nv - 1; j >= 0; j--) ring.push(j * (nu + 1));
  for (let k = 0; k < ring.length - 1; k++) {
    const a = top + ring[k], b = top + ring[k + 1], c = bot + ring[k], d = bot + ring[k + 1];
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  // smooth the skins but keep the rim crisp: average normals by position
  return smoothNormals(flat, 0.6);
}

// Average vertex normals that share a position when they're within `cos` of
// each other — smooth curvature, sharp creases.
function smoothNormals(g, cos) {
  const P = g.attributes.position, N = g.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
  for (let i = 0; i < P.count; i++) {
    const k = key(i);
    (map.get(k) || map.set(k, []).get(k)).push(i);
  }
  const out = new Float32Array(N.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), sum = new THREE.Vector3();
  for (const list of map.values()) {
    for (const i of list) {
      a.fromBufferAttribute(N, i);
      sum.set(0, 0, 0);
      for (const j of list) { b.fromBufferAttribute(N, j); if (a.dot(b) >= cos) sum.add(b); }
      sum.normalize();
      out.set([sum.x, sum.y, sum.z], i * 3);
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

defineModel('cafechair', (lo) => {
  const parts = [
    part(shell(lo), 'plastic', { tint: 1 }),
    // the leg base's mounting plate under the seat
    part(box(0.3, 0.018, 0.26), 'plastic', { at: [0, 0.428, 0.02], color: '#1d1e21' }),
  ];
  const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [sx, sz] of legs) {
    const top = [sx * 0.12, 0.43, sz * 0.11 + 0.02], foot = [sx * 0.21, 0, sz * 0.2 + 0.02];
    const d = new THREE.Vector3(foot[0] - top[0], foot[1] - top[1], foot[2] - top[2]);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    parts.push(part(cyl(0.013, 0.01, len, lo ? 6 : 10), 'matte', {
      at: [(top[0] + foot[0]) / 2, (top[1] + foot[1]) / 2, (top[2] + foot[2]) / 2], rot: [e.x, e.y, e.z], color: '#b98a57',
    }));
    if (!lo) parts.push(part(cyl(0.011, 0.011, 0.006, 8), 'plastic', { at: [foot[0], 0.003, foot[2]], color: '#141414' }));
  }
  // wire cross-brace between the legs
  if (!lo) {
    parts.push(
      part(tube([[0.165, 0.22, 0.175], [0, 0.26, 0.02], [-0.165, 0.22, -0.135]], 0.0025, 8, 4), 'metal', { color: '#1a1a1a' }),
      part(tube([[-0.165, 0.22, 0.175], [0, 0.26, 0.02], [0.165, 0.22, -0.135]], 0.0025, 8, 4), 'metal', { color: '#1a1a1a' }),
    );
  }
  return bake(parts);
}, 7);

// --------------------------------------------------------------- plants
// Pot centred on its collider, open top, a thick lip, soil 5 cm down.
defineModel('pot', (lo) => bake([
  part(lathe([
    [0, -0.15], [0.112, -0.15], [0.12, -0.147], [0.124, -0.14], [0.148, 0.103], [0.161, 0.106], [0.164, 0.113],
    [0.164, 0.145], [0.1615, 0.15], [0.152, 0.15], [0.148, 0.145], [0.146, 0.13],
  ], lo ? 12 : 24), 'matte', { tint: 1 }),
  part(lathe([[0.146, 0.13], [0.143, 0.1]], lo ? 12 : 24), 'matte', { color: '#6d5f55' }),
  part(lathe([[0.143, 0.1], [0.11, 0.106], [0.05, 0.11], [0, 0.112]], lo ? 12 : 24), 'matte', { color: '#3a2a1d' }),
]), 8);

// Snake plant: eleven stiff blades, pointed, folded along the midrib, leaning
// out and twisting as they rise; yellow margins, pale cross-bands.
defineModel('snake', () => {
  const parts = [];
  const across = [-1, -0.72, 0, 0.72, 1];
  const cols = ['#c9bf52', '#3f7b3c', '#2b5a2f', '#3f7b3c', '#c9bf52'];
  for (let b = 0; b < 11; b++) {
    const h = 0.42 + ((b * 37) % 11) / 11 * 0.36;
    const lean = 0.08 + ((b * 53) % 7) / 7 * 0.3;
    const twist = 0.3 + ((b * 29) % 5) / 5 * 0.7;
    const segs = 6;
    const pos = [], uv = [], col = [];
    for (let j = 0; j <= segs; j++) {
      const t = j / segs;
      const w = 0.034 * (t < 0.15 ? 0.7 + t * 2 : 1) * (1 - Math.pow(t, 2.6));
      const ang = twist * t;
      const bendZ = lean * h * t * t;
      for (let i = 0; i < across.length; i++) {
        const a = across[i];
        const fold = (1 - Math.abs(a)) * 0.004;
        const lx = a * w, lz = fold;
        pos.push(lx * Math.cos(ang) - lz * Math.sin(ang), t * h, lx * Math.sin(ang) + lz * Math.cos(ang) + bendZ);
        uv.push((a + 1) / 2, t);
        const c = new THREE.Color(cols[i]);
        col.push(c.r, c.g, c.b); // linear, like the baker's colours
      }
    }
    const idx = [];
    for (let j = 0; j < segs; j++) for (let i = 0; i < across.length - 1; i++) {
      const a = j * 5 + i, b2 = a + 5;
      idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ring = b < 3 ? 0.015 : 0.055;
    const az = (b / 11) * PI * 2 + b;
    parts.push(part(g, 'foliage', { at: [Math.sin(az) * ring, 0, Math.cos(az) * ring], rot: [0, az, 0], region: 'snake' }));
  }
  return bake(parts);
});

// Pothos: a crown of heart-shaped leaves on short stalks over the soil, and
// vines arching over the lip and trailing down the pot. Leaf greens vary.
defineModel('pothos', () => {
  const heart = new THREE.Shape();
  heart.moveTo(0, 0);
  heart.bezierCurveTo(0.022, 0.008, 0.036, 0.03, 0.022, 0.056);
  heart.bezierCurveTo(0.014, 0.068, 0.003, 0.074, 0, 0.082);
  heart.bezierCurveTo(-0.003, 0.074, -0.014, 0.068, -0.022, 0.056);
  heart.bezierCurveTo(-0.036, 0.03, -0.022, 0.008, 0, 0);
  // folded along the midrib, the tip drooping
  const leaf = bend(new THREE.ShapeGeometry(heart, 3), (x, y) => [x, y, -Math.abs(x) * 0.45 + y * y * 2.2]);
  const parts = [];
  const greens = ['#3a7d33', '#4d953b', '#6aa843', '#2f6b2e', '#58a03f'];
  let n = 0;
  const addLeaf = (p, yaw, pitch, size) => {
    parts.push(part(leaf, 'foliage', { at: p, rot: [pitch, yaw, 0], scale: size, color: greens[n % greens.length] }));
    n++;
  };
  // the crown: leaves on stalks fanning up and out of the soil
  for (let i = 0; i < 12; i++) {
    const az = i * 2.4, r = 0.03 + (i % 3) * 0.035, h = 0.05 + ((i * 5) % 7) * 0.025;
    const tip = [Math.sin(az) * r * 1.6, h, Math.cos(az) * r * 1.6];
    parts.push(part(tube([[Math.sin(az) * 0.01, 0, Math.cos(az) * 0.01], [tip[0] * 0.6, h * 0.8, tip[2] * 0.6], tip], 0.0025, 4, 3), 'foliage', { color: '#5b8a3a' }));
    addLeaf(tip, az, -0.5 - (i % 3) * 0.25, 1.1 + ((i * 3) % 4) * 0.12);
  }
  // trailing vines
  const vines = [
    [[0.02, 0, 0.02], [0.1, 0.05, 0.08], [0.16, 0.01, 0.14], [0.19, -0.1, 0.17], [0.2, -0.26, 0.18]],
    [[-0.03, 0, 0.01], [-0.12, 0.05, 0.03], [-0.18, 0.0, 0.05], [-0.21, -0.16, 0.06]],
    [[0, 0, -0.03], [0.02, 0.06, -0.12], [0.03, 0.02, -0.19], [0.04, -0.12, -0.21], [0.05, -0.22, -0.22]],
    [[-0.02, 0, -0.02], [-0.09, 0.05, -0.1], [-0.14, 0.0, -0.15], [-0.16, -0.12, -0.17]],
    [[0.02, 0, -0.01], [0.12, 0.04, -0.04], [0.19, -0.02, -0.06], [0.21, -0.14, -0.07]],
  ];
  for (const v of vines) {
    const curve = new THREE.CatmullRomCurve3(v.map((p) => new THREE.Vector3(...p)));
    parts.push(part(new THREE.TubeGeometry(curve, 10, 0.0026, 3), 'foliage', { color: '#5b8a3a' }));
    const count = Math.round(curve.getLength() / 0.04);
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 0.3);
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = i % 2 ? 1 : -1;
      addLeaf([p.x, p.y, p.z], Math.atan2(tan.x, tan.z) + side * 1.3, 0.7 + ((n * 3) % 4) * 0.15, 1.2 - t * 0.35);
    }
  }
  return bake(parts);
});

// --------------------------------------------------------------- bottle
// A 500 ml water bottle along +y: PET body with a waist and a shoulder, the
// wrap label, a ribbed cap (instance tint) over the support ring.
defineModel('bottle', () => {
  const cap = cyl(0.0155, 0.0155, 0.02, 28);
  const P = cap.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), r = Math.hypot(x, z);
    if (r < 0.015) continue;
    const k = 1 + 0.045 * Math.cos(Math.atan2(z, x) * 14);
    P.setX(i, x * k); P.setZ(i, z * k);
  }
  cap.computeVertexNormals();
  return bake([
    part(lathe([
      [0, -0.117], [0.012, -0.12], [0.026, -0.119], [0.032, -0.115], [0.034, -0.107], [0.034, -0.072], [0.031, -0.066],
      [0.034, -0.06], [0.034, 0.034], [0.0322, 0.05], [0.025, 0.074], [0.016, 0.088], [0.0135, 0.094], [0.0135, 0.1],
    ], 20), 'pet'),
    part(lathe([[0.0346, -0.056], [0.0346, 0.03]], 20), 'plastic', { region: 'bottle' }),
    part(cyl(0.018, 0.018, 0.0022, 16), 'plastic', { at: [0, 0.0985, 0], color: '#dfe7ef' }),
    part(cap, 'plastic', { at: [0, 0.11, 0], tint: 1 }),
  ]);
});

// --------------------------------------------------------------- balls
defineModel('basketball', (lo) => bake([
  part(new THREE.SphereGeometry(0.121, lo ? 14 : 26, lo ? 9 : 16), 'ball', { region: 'ball' }),
]), 6);

defineModel('marble', () => bake([
  part(new THREE.SphereGeometry(0.016, 14, 9), 'marble', { region: 'marble', tint: 1 }),
]));

// --------------------------------------------------------------- box
// A shipping carton: printed sides (arrows, label, FRAGILE), the flap seam on
// top, and packing tape over the seam and 7 cm down both ends.
defineModel('box', () => bake([
  part(rbox(0.34, 0.34, 0.34, 0.006), 'paper', {
    tint: 1, faces: { 0: 'boxLabel', 1: 'boxFragile', 2: 'boxTop', 3: 'boxTop', 4: 'boxSide', 5: 'boxSide' },
  }),
  part(box(0.056, 0.0012, 0.342), 'plastic', { at: [0, 0.1702, 0], color: '#cfa66a' }),
  part(box(0.056, 0.07, 0.0012), 'plastic', { at: [0, 0.136, 0.1702], color: '#cfa66a' }),
  part(box(0.056, 0.07, 0.0012), 'plastic', { at: [0, 0.136, -0.1702], color: '#cfa66a' }),
]));

// --------------------------------------------------------------- lamp
// An architect lamp, origin under its base: weighted base, twin-rod arms with
// a spring, knuckle joints, a conical shade (instance tint) with a lit
// inside and a bulb. Arms lean back over the base so the head sits where its
// collider always was.
defineModel('lamp', () => {
  const E = [-0.055, 0.27, 0], H = [0.045, 0.39, 0];
  const rods = (a, b) => [-0.008, 0.008].map((dz) => part(tube([[a[0], a[1], dz], [b[0], b[1], dz]], 0.0035, 2, 6), 'metal', { color: '#c9cdd3' }));
  const spring = [];
  for (let i = 0; i <= 40; i++) {
    const t = 0.12 + (i / 40) * 0.7, ang = i * 1.35;
    const px = E[0] * t, py = 0.04 + (E[1] - 0.04) * t;
    spring.push([px + Math.cos(ang) * 0.004 - 0.004, py + Math.sin(ang) * 0.004 * 0.3, 0.02 + Math.sin(ang) * 0.004]);
  }
  const joint = (p) => part(cyl(0.01, 0.01, 0.028, 10), 'metal', { at: p, rot: [PI / 2, 0, 0], color: '#3a3d43' });
  const shadeRot = [0, 0, 0.75];
  return bake([
    part(lathe([[0, 0], [0.074, 0], [0.079, 0.004], [0.08, 0.017], [0.075, 0.024], [0.03, 0.028], [0.018, 0.034], [0, 0.035]], 18), 'plastic', { tint: 1 }),
    joint([0, 0.042, 0]),
    ...rods([0, 0.042], E), ...rods(E, H),
    part(tube(spring, 0.0012, 40, 3), 'metal', { color: '#9aa0a8' }),
    joint(E), joint(H),
    part(lathe([[0.072, -0.012], [0.069, -0.01], [0.06, 0], [0.03, 0.045], [0.02, 0.058], [0.012, 0.064], [0, 0.068]], 20), 'plastic', { at: [0.075, 0.405, 0], rot: shadeRot, tint: 1 }),
    part(lathe([[0, 0.059], [0.018, 0.053], [0.028, 0.041], [0.057, -0.003], [0.066, -0.009]], 20), 'glow', { at: [0.075, 0.405, 0], rot: shadeRot, color: '#ffe2a8' }),
    part(new THREE.SphereGeometry(0.019, 10, 6), 'glow', { at: [0.075 + 0.028 * Math.sin(0.75), 0.405 + 0.028 * Math.cos(0.75), 0], color: '#fff6e0' }),
  ]);
});

// --------------------------------------------------------------- trash
// A perforated steel bin (alpha-tested holes — you see the rubbish through
// it), rolled top rim, solid base, three crumpled balls of paper inside.
defineModel('trash', () => {
  const crumple = (seed, r) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const k = 0.78 + (((Math.sin(P.getX(i) * 91 + seed) * 43758.5453) % 1 + 1) % 1) * 0.35;
      P.setXYZ(i, P.getX(i) * k, P.getY(i) * k, P.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  return bake([
    part(lathe([[0.11, -0.166], [0.14, 0.168]], 28), 'perf', { tint: 1 }),
    part(lathe([[0, -0.175], [0.106, -0.175], [0.111, -0.172], [0.1125, -0.16], [0.105, -0.158], [0, -0.158]], 28), 'metal', { tint: 1, color: '#b8bec6' }),
    part(new THREE.TorusGeometry(0.1405, 0.0055, 4, 24), 'metal', { at: [0, 0.169, 0], rot: [PI / 2, 0, 0], tint: 1, color: '#b8bec6' }),
    part(crumple(1, 0.036), 'paper', { at: [0.03, -0.125, 0.02], color: '#f3f1ea' }),
    part(crumple(2, 0.032), 'paper', { at: [-0.04, -0.13, -0.012], color: '#f1e6a6' }),
    part(crumple(3, 0.03), 'paper', { at: [0.004, -0.085, -0.034], color: '#f3f1ea' }),
  ]);
});

// --------------------------------------------------------------- roll
// Toilet roll along +y: a real hollow with a 2 mm card core, soft edges,
// the quilted emboss.
defineModel('roll', (lo) => {
  const n = lo ? 12 : 24;
  return bake([
    part(lathe([[0.055, -0.047], [0.055, 0.047]], n), 'paper', { region: 'roll' }),
    part(lathe([[0.055, 0.047], [0.0535, 0.0496], [0.051, 0.05], [0.0215, 0.05]], n), 'paper', { color: '#f6f4ee' }),
    part(lathe([[0.0215, -0.05], [0.051, -0.05], [0.0535, -0.0496], [0.055, -0.047]], n), 'paper', { color: '#f6f4ee' }),
    part(lathe([[0.0215, 0.05], [0.0198, 0.0506], [0.0182, 0.05], [0.0182, -0.05], [0.0198, -0.0506], [0.0215, -0.05]], lo ? 8 : 20), 'paper', { color: '#b89c74' }),
  ]);
}, 5);
