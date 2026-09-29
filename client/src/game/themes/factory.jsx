// Werk 2's own dressing: a printer factory, seen from 18 cm up.
//
// The hero is Line 2. A green transfer belt you can ride (the map's ZONES
// push you along it) runs beside the assembly line, where half-built
// printers crawl from the CHASSIS hood to EOL TEST, one every 6.4 s, and four
// orange six-axis arms work on each one as it passes. Everything on the line
// runs off the server's clock (performance.now() + net.clockOffset), so every
// client sees the same printer under the same arm — and the two big arms
// south of the belt, whose swings cross it, knock the same cars off it.
//
// Around the line: pallet racking to the roof, a sawtooth roof of north
// glazing with high-bay LEDs, painted floors (the identity of a factory at
// car height — aisle lines, hazard stripes, stencils), an Andon board over
// the grid that counts the race start down, stack lights that warn when a
// big arm is about to swing, an HVLS fan, an overhead chain conveyor of
// printer housings always moving across the top of the screen, QA printers
// pushing out test pages, a stretch-wrap turntable that turns, an AGV for
// the robot event, and dock doors with daylight under them.
//
// Draw calls are the budget in an open hall where everything is in view at
// once. Everything static that repeats — racking, stock, pallets, bollards,
// benches, tables, the smaller machines — is merged into a handful of
// vertex-coloured batches (StaticStock; those pieces keep only their
// colliders); moving repeats are instanced; the rest is built once per kind
// and cached.
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider, ConvexHullCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M } from '@rc/shared';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import { net, on } from '../../net.js';
import { Body } from '../propBody.jsx';
import { glowTex } from '../textures.js';
import { roundedBox } from '../roundedGeo.js';
import { useEventLight } from '../eventLight.jsx';

const m = (v) => v * M; // metres → world units

// ---------------------------------------------------------------- palette
const C = {
  yellow: '#f2c200', black: '#1c1d1f', orange: '#f07a1a', joint: '#26282b',
  frame: '#c4c8cc', belt: '#1d1e20',
  printer: '#e8e8e4', printerDark: '#3a3d42', brand: '#1f6fd6', card: '#b88a58',
  upright: '#1f4fa0', beam: '#e2611f', wall: '#e9ebe8', dado: '#848c92',
  steel: '#8e969d', galv: '#b8bec3', rubber: '#141516', wood: '#b08a5a',
  red: '#d8322a', white: '#f4f4f0', grey: '#5b6167', blueGrey: '#46505a',
};

// -------------------------------------------------------- shared clock
// The server's time in seconds: the same on every client, so the line runs
// in lockstep everywhere. A Line Stop freezes the line; when it restarts it
// runs at double speed until it has made up the lost time and is back on the
// server's clock. So the line never carries a history of its own: a player
// who joined after the stop (or a tab that slept through it) sees the arms,
// and meets the big arms' grippers, exactly where everyone else does.
const shopTime = () => (performance.now() + net.clockOffset) / 1000;
const LINE = { t: 0, lag: 0, last: null, stopped: false };
function tickLine(stopped) {
  const now = shopTime();
  // a long gap is a slept tab or a clock resync, not line time
  const dt = LINE.last === null ? 0 : Math.min(0.1, Math.max(0, now - LINE.last));
  LINE.lag = stopped ? LINE.lag + dt : Math.max(0, LINE.lag - dt);
  LINE.last = now;
  LINE.stopped = stopped;
  LINE.t = now - LINE.lag;
  return LINE.t;
}

// The assembly line: printers every 3.2 m at 0.5 m/s, so one reaches each
// station every 6.4 s; they come out of the CHASSIS hood at x −8.6 and go
// into EOL TEST at x 7.4. Stations are whole spacings from the start, so
// every station has a printer centred under it at the same moment.
const ASM = { x0: m(-8.6), len: m(16), z: m(9.6), top: m(0.85), v: m(0.5), gap: m(3.2), n: 5, period: 6.4 };
const asmX = (t, i) => ASM.x0 + (((ASM.v * t + i * ASM.gap) % ASM.len) + ASM.len) % ASM.len;
// where we are in the station cycle: −3.2…3.2 s, 0 = a printer centred
const cyclePhase = (t) => {
  let c = t % ASM.period;
  if (c < 0) c += ASM.period;
  return c >= ASM.period / 2 ? c - ASM.period : c;
};

// ------------------------------------------------------------ geometry kit
// Collects boxes/cylinders with a colour each, per material key, and merges
// them into one geometry per key: a whole row of racking is one draw call.
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();

class Kit {
  constructor() { this.parts = new Map(); }
  add(key, geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    // bare steel shares the paint batch: a draw call per piece saved, and at
    // this light galvanised grey reads the same either way
    if (key === 'metal') key = 'paint';
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _eul.set(rot[0], rot[1], rot[2]);
    _quat.setFromEuler(_eul);
    _mat4.compose(_pos.set(pos[0], pos[1], pos[2]), _quat, _scl.set(scale[0], scale[1], scale[2]));
    g.applyMatrix4(_mat4);
    if (this.frame) g.applyMatrix4(this.frame);
    _col.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  // build a piece in its own frame (at x, z turned by rotY) into a world kit
  inFrame(x, z, rotY, fn) {
    this.frame = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0), new THREE.Vector3(1, 1, 1));
    fn(this);
    this.frame = null;
    return this;
  }
  // a box of w×h×d (units) centred at pos
  box(key, color, w, h, d, pos, rot) { return this.add(key, new THREE.BoxGeometry(w, h, d), color, pos, rot); }
  cyl(key, color, r0, r1, h, pos, rot, seg = 12) { return this.add(key, new THREE.CylinderGeometry(r0, r1, h, seg), color, pos, rot); }
  // a box with rounded edges (cast machine housings, moulded plastic)
  rbox(key, color, w, h, d, pos, rot, r = Math.min(w, h, d) * 0.3) { return this.add(key, roundedBox(w, h, d, r, 2), color, pos, rot); }
  // a box between two heights, handy for legs: bottom y0, top y1
  post(key, color, w, d, x, y0, y1, z) { return this.box(key, color, w, y1 - y0, d, [x, (y0 + y1) / 2, z]); }
  build() {
    const out = {};
    for (const [k, list] of this.parts) out[k] = mergeGeometries(list);
    return out;
  }
}

// ------------------------------------------------------------- materials
const cache = {};
const once = (key, make) => cache[key] || (cache[key] = make());
// vertex-coloured families: painted (and bare) steel and plastics, matte
// (card, rubber, wood), and unlit (LEDs, lamps — bloom picks them up)
const MAT = {
  paint: () => once('paint', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 })),
  matte: () => once('matte', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 })),
  glow: () => once('glow', () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
  carton: () => once('carton', () => new THREE.MeshStandardMaterial({ map: cartonTex(), roughness: 0.9 })),
  film: () => once('film', () => new THREE.MeshStandardMaterial({
    color: '#dfe8ee', transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide,
  })),
  mesh: () => once('mesh', () => new THREE.MeshStandardMaterial({
    map: meshTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4, color: '#ffffff',
  })),
  hazard: () => once('hazard', () => new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6 })),
  pane: () => once('pane', () => new THREE.MeshStandardMaterial({
    color: '#bfe3ee', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.6,
    side: THREE.DoubleSide, depthWrite: false,
  })),
  meshGalv: () => once('meshGalv', () => new THREE.MeshStandardMaterial({
    map: meshTex(), color: '#c8ced4', alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6,
  })),
};
const matFor = (key) => MAT[key]();

// What a mount builds for itself (merged batches, per-map atlases, its own
// materials) is freed when it unmounts: quick play changes map every round,
// and R3F only disposes what it created from JSX. Cached kinds (`once`,
// `cached`) live for the session and never come through here.
function free(x) {
  if (!x) return;
  if (x.isBufferGeometry || x.isMaterial || x.isTexture) x.dispose();
  else if (Array.isArray(x)) x.forEach(free);
  else if (Object.getPrototypeOf(x) === Object.prototype) Object.values(x).forEach(free);
}
const useFree = (...xs) => useEffect(() => () => free(xs), xs);

// ------------------------------------------------------------- textures
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Kraft carton with the brand on it. Every face shows the same print, which
// is how printer boxes are printed anyway.
const cartonTex = () => once('cartonTex', () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = C.card; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = i % 2 ? 'rgba(90,60,30,0.07)' : 'rgba(255,240,210,0.06)';
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1);
  }
  // tape seam across the top edge
  g.fillStyle = 'rgba(160,120,70,0.9)'; g.fillRect(0, 0, w, 18);
  g.fillStyle = '#1f3f7a';
  g.font = 'bold 44px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('INKORA', w / 2, 92);
  // a printer pictogram
  g.strokeStyle = '#1f3f7a'; g.lineWidth = 6;
  g.strokeRect(78, 128, 100, 52); g.strokeRect(96, 110, 64, 18); g.strokeRect(96, 180, 64, 22);
  g.font = 'bold 20px Arial, sans-serif';
  g.fillText('JX-40 · 1 UNIT', w / 2, 226);
  // this way up
  g.fillStyle = '#2b2b2b';
  for (const x of [22, 234]) {
    g.beginPath(); g.moveTo(x, 36); g.lineTo(x - 12, 58); g.lineTo(x + 12, 58); g.fill();
    g.fillRect(x - 4, 56, 8, 22);
  }
}));

// Welded mesh guarding: black wire on transparent, 50 mm squares
const meshTex = () => once('meshTex', () => {
  const t = canvas(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#1c1d1f'; g.lineWidth = 7;
    g.strokeRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});

// Black and yellow, 45°
const hazardTex = () => once('hazardTex', () => {
  const t = canvas(128, 128, (g, w, h) => {
    g.fillStyle = C.yellow; g.fillRect(0, 0, w, h);
    g.fillStyle = '#18181a';
    for (let k = -w; k < 2 * w; k += 64) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 32, 0); g.lineTo(k + 32 + h, h); g.lineTo(k + h, h); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});

// The belts: a green PVC transfer belt and a dark assembly belt, both with
// faint transverse joints so you can see them move. Each belt family gets
// its own texture (offsets animate per texture).
const beltTex = (key, base, line) => once(`belt${key}`, () => {
  const t = canvas(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
      g.fillRect(Math.random() * w, Math.random() * h, 3, 1);
    }
    g.fillStyle = line; g.fillRect(0, 0, 3, h); g.fillRect(32, 0, 1, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});
const BELT_TILE = m(0.5); // one texture tile = 50 cm of belt
const BELTS = {
  transfer: { speed: m(1), mat: () => once('beltT', () => new THREE.MeshStandardMaterial({ map: beltTex('T', '#3a8a55', 'rgba(20,50,30,0.6)'), roughness: 0.7 })) },
  assembly: { speed: m(0.5), mat: () => once('beltA', () => new THREE.MeshStandardMaterial({ map: beltTex('A', '#2a2c2f', 'rgba(0,0,0,0.5)'), roughness: 0.8 })) },
};

// A kit's meshes, one per material. Lit things (glow) and film neither cast
// nor take shadows: a shadow-map draw for an LED is a draw wasted.
function KitMeshes({ geo, cast = true, receive = true }) {
  return Object.entries(geo).map(([k, g]) => {
    const lit = k === 'glow' || k === 'film' || k === 'pane';
    return <mesh key={k} geometry={g} material={matFor(k)} castShadow={cast && !lit} receiveShadow={receive && !lit} />;
  });
}

// ------------------------------------------------------------ the pieces
// Office.jsx hands these types over; each owns its (static) colliders.

// Pieces whose steel is drawn by the Dressing's batch (StaticStock): here
// they are only colliders.
function ColliderPiece({ f }) {
  const { type, x, z, w, d, h, rotY } = f;
  if (type === 'factory_bollard') {
    return (
      <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
        <CylinderCollider args={[h / 2, w / 2]} position={[0, h / 2, 0]} />
      </RigidBody>
    );
  }
  if (type === 'factory_rackbay') {
    // drive-through: the stock above the first beam is solid, the floor isn't
    const y0 = m(1.14);
    return (
      <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.6}>
        <CuboidCollider args={[w / 2, (h - y0) / 2, d / 2]} position={[0, (h + y0) / 2, 0]} />
      </RigidBody>
    );
  }
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.7}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
    </RigidBody>
  );
}

// ---- conveyors
// A 20 cm bed on legs; its length runs along local x (h0 at −x, h1 at +x).
// Colliders: the bed, the kick rails, the legs. The belt surface is one
// quad whose UVs run in world metres, so every conveyor shares a texture and
// one offset animates them all.
const BED = m(0.2), RAIL_H = m(0.08), RAIL_T = m(0.03);
const geoCache = new Map();
const cached = (key, make) => geoCache.get(key) || geoCache.set(key, make()).get(key);

function beltQuad(len, width) {
  const g = new THREE.PlaneGeometry(len, width);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + len / 2) / BELT_TILE, (pos.getY(i) + width / 2) / width);
  g.rotateX(-Math.PI / 2);
  return g;
}

function Conveyor({ f }) {
  const { x, z, w: L, d: W, h, rotY } = f;
  const h0 = f.h0 ?? h, h1 = f.h1 ?? h;
  const rise = h1 - h0;
  const ang = Math.atan2(rise, L);
  const deck = Math.hypot(L, rise);
  const mid = (h0 + h1) / 2;
  const legsEvery = m(f.legs || 2);
  const topAt = (lx) => h0 + rise * ((lx + L / 2) / L);
  const legXs = useMemo(() => {
    const n = Math.max(1, Math.floor(L / legsEvery));
    return Array.from({ length: n + 1 }, (_, i) => -L / 2 + m(0.25) + i * ((L - m(0.5)) / n));
  }, [L, legsEvery]);
  const geo = useMemo(() => cached(`conv${L.toFixed(2)}|${h0.toFixed(2)}|${h1.toFixed(2)}|${f.bridge ? 1 : 0}|${f.belt}`, () => {
    const k = new Kit();
    const sideRot = [0, 0, ang];
    // the side channels, rails and belt edge, in the sloped frame
    for (const s of [-1, 1]) {
      k.box('paint', '#b9bec3', deck, BED, m(0.04), [0, mid - BED / 2, s * (W / 2 - m(0.02))], sideRot);
      k.box('paint', f.belt === 'transfer' ? C.yellow : C.frame, deck, RAIL_H, RAIL_T, [0, mid + RAIL_H / 2, s * (W / 2 - RAIL_T / 2)], sideRot);
    }
    // the bed's underside: a slider pan, and return rollers carrying the
    // belt back (what you see from the ground twin, driving underneath)
    k.box('paint', '#9aa1a7', deck, m(0.01), W - m(0.08), [0, mid - BED + m(0.02), 0], sideRot);
    k.box('paint', f.belt === 'transfer' ? '#2f6e45' : '#26282b', deck, m(0.006), W - m(0.1), [0, mid - BED - m(0.035), 0], sideRot);
    for (let lx = -L / 2 + m(0.6); lx < L / 2 - m(0.2); lx += m(1.2)) {
      k.cyl('metal', C.galv, m(0.018), m(0.018), W - m(0.06), [lx, topAt(lx) - BED - m(0.02), 0], [Math.PI / 2, 0, 0], 8);
    }
    // legs and feet — no cross braces low down: the underside is a road
    for (const lx of legXs) {
      const top = topAt(lx) - BED;
      for (const s of [-1, 1]) {
        k.post('metal', C.galv, m(0.05), m(0.05), lx, 0, top, s * (W / 2 - m(0.05)));
        k.box('metal', C.steel, m(0.12), m(0.015), m(0.12), [lx, m(0.008), s * (W / 2 - m(0.05))]);
      }
    }
    // an e-stop pull cord along the aisle side, with a red box at each end
    k.box('paint', C.yellow, deck, m(0.008), m(0.008), [0, mid - m(0.05), W / 2 + m(0.04)], sideRot);
    for (const s of [-1, 1]) k.box('paint', C.red, m(0.08), m(0.1), m(0.06), [s * (L / 2 - m(0.15)), topAt(s * (L / 2 - m(0.15))) - m(0.08), W / 2 + m(0.05)]);
    if (f.bridge) {
      // over the aisle: a truss portal each end and guard mesh on both sides
      for (const s of [-1, 1]) {
        for (const e of [-1, 1]) {
          k.post('paint', C.yellow, m(0.12), m(0.12), e * (L / 2 - m(0.25)), 0, mid - BED, s * (W / 2 + m(0.02)));
          k.box('paint', C.black, m(0.14), m(0.3), m(0.14), [e * (L / 2 - m(0.25)), m(0.15), s * (W / 2 + m(0.02))]);
        }
        k.box('paint', C.yellow, L, m(0.05), m(0.05), [0, mid + m(0.42), s * (W / 2 + m(0.02))]);
        for (let lx = -L / 2 + m(0.25); lx <= L / 2; lx += m(0.9)) {
          k.post('paint', C.yellow, m(0.04), m(0.04), lx, mid, mid + m(0.42), s * (W / 2 + m(0.02)));
        }
      }
      // the truss under the deck
      for (const s of [-1, 1]) k.box('paint', C.frame, L, m(0.12), m(0.06), [0, mid - BED - m(0.08), s * (W / 2 - m(0.06))]);
      for (let lx = -L / 2 + m(0.5); lx < L / 2; lx += m(0.6)) {
        k.box('paint', C.frame, m(0.03), m(0.14), W - m(0.1), [lx, mid - BED - m(0.08), 0]);
      }
      // the sign on the bridge fascia, both sides
      for (const s of [-1, 1]) k.box('paint', C.black, m(1.6), m(0.24), m(0.02), [0, mid - BED - m(0.28), s * (W / 2 + m(0.05))]);
    }
    return k.build();
  }), [L, W, h0, h1, f.bridge, f.belt, ang, deck, mid, legXs]);
  const belt = useMemo(() => cached(`belt${deck.toFixed(2)}`, () => beltQuad(deck, W - RAIL_T * 2)), [deck, W]);
  const beltMat = BELTS[f.belt || 'transfer'].mat();
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
      <group position={[0, mid - BED / 2, 0]} rotation-z={ang}>
        <CuboidCollider args={[deck / 2, BED / 2, W / 2]} />
        {[-1, 1].map((s) => (
          <CuboidCollider key={s} args={[deck / 2, RAIL_H / 2, RAIL_T / 2]} position={[0, BED / 2 + RAIL_H / 2, s * (W / 2 - RAIL_T / 2)]} />
        ))}
      </group>
      {f.bridge && [-1, 1].map((s) => (
        // guard rails along the bridge: they keep a rider on it
        <CuboidCollider key={`g${s}`} args={[L / 2, m(0.21), m(0.03)]} position={[0, mid + m(0.21), s * (W / 2 + m(0.02))]} />
      ))}
      {legXs.map((lx) => [-1, 1].map((s) => (
        <CuboidCollider key={`${lx}${s}`} args={[m(0.03), (topAt(lx) - BED) / 2, m(0.03)]} position={[lx, (topAt(lx) - BED) / 2, s * (W / 2 - m(0.05))]} />
      )))}
      <KitMeshes geo={geo} />
      <mesh geometry={belt} material={beltMat} position={[0, mid + m(0.002), 0]} rotation-z={ang} receiveShadow />
    </RigidBody>
  );
}

// The roller curve: tapered rollers radiating from its centre (a real
// powered curve), the bed approximated by three straight colliders.
function Curve({ f }) {
  const { cx, cz, r, h } = f;
  const W = m(0.8);
  const geo = useMemo(() => cached('curve', () => {
    const k = new Kit();
    const ri = r - W / 2, ro = r + W / 2;
    // the arcs run from north (+z) round to east (+x): a torus arc starts on
    // +x and sweeps toward +y, so tipping +y onto +z puts it in that quadrant
    const ring = (rad, y, t, col, key) => {
      k.add(key, new THREE.TorusGeometry(rad, t, 6, 24, Math.PI / 2), col, [0, y, 0], [Math.PI / 2, 0, 0]);
    };
    ring(ro, h - m(0.08), m(0.04), C.frame, 'metal');
    ring(ri, h - m(0.08), m(0.04), C.frame, 'metal');
    ring(ro - RAIL_T / 2, h + RAIL_H / 2, RAIL_T / 2 + m(0.01), C.yellow, 'paint');
    ring(ri + RAIL_T / 2, h + RAIL_H / 2, RAIL_T / 2 + m(0.01), C.yellow, 'paint');
    // the bed under the rollers, and its underside skirt
    k.add('paint', new THREE.RingGeometry(ri, ro, 24, 1, -Math.PI / 2, Math.PI / 2), '#6f777e', [0, h - m(0.07), 0], [-Math.PI / 2, 0, 0]);
    k.add('paint', new THREE.RingGeometry(ri, ro, 24, 1, -Math.PI / 2, Math.PI / 2), '#9aa1a7', [0, h - BED + m(0.01), 0], [Math.PI / 2, 0, Math.PI / 2]);
    // tapered rollers, radial: fat end outside, like a real powered curve
    for (let a = 0.05; a < Math.PI / 2; a += 0.075) {
      k.add('metal', new THREE.CylinderGeometry(m(0.032), m(0.022), W - m(0.06), 8), C.galv,
        [Math.sin(a) * r, h - m(0.03), Math.cos(a) * r], [0, a - Math.PI / 2, -Math.PI / 2]);
    }
    // a motor pod on the outside, the legs
    k.box('paint', C.brand, m(0.25), m(0.2), m(0.2), [Math.sin(Math.PI / 4) * (ro + m(0.14)), h - m(0.2), Math.cos(Math.PI / 4) * (ro + m(0.14))], [0, Math.PI / 4, 0]);
    for (const a of [0.2, Math.PI / 4, Math.PI / 2 - 0.2]) {
      for (const rad of [ri + m(0.05), ro - m(0.05)]) k.post('metal', C.galv, m(0.05), m(0.05), Math.sin(a) * rad, 0, h - BED, Math.cos(a) * rad);
    }
    return k.build();
  }), [r, h, W]);
  // six chords of 15°, each long enough to cover the outer edge's arc, so
  // there is no gap for a wheel to drop into; the rails follow both edges
  const segs = [1, 3, 5, 7, 9, 11].map((i) => (i * Math.PI) / 24);
  const ro = r + W / 2 - RAIL_T / 2, ri = r - W / 2 + RAIL_T / 2;
  return (
    <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]} friction={1}>
      {segs.map((a) => (
        <group key={a} rotation-y={a}>
          <CuboidCollider args={[(r + W / 2) * 0.15, BED / 2, W / 2]} position={[0, h - BED / 2, r]} />
          <CuboidCollider args={[ro * 0.14, RAIL_H / 2, RAIL_T / 2]} position={[0, h + RAIL_H / 2, ro]} />
          <CuboidCollider args={[ri * 0.14, RAIL_H / 2, RAIL_T / 2]} position={[0, h + RAIL_H / 2, ri]} />
        </group>
      ))}
      <KitMeshes geo={geo} />
    </RigidBody>
  );
}

// ---- the hoods at the ends of the assembly line
function Hood({ f }) {
  const { x, z, w, d, h } = f;
  const geo = useMemo(() => cached(`hood${f.label}`, () => {
    const k = new Kit();
    // a sheet-steel tunnel over the belt with a window and a stack light
    k.box('paint', '#dfe3e6', w, h - m(0.95), d, [0, m(0.95) + (h - m(0.95)) / 2, 0]);
    for (const s of [-1, 1]) k.box('paint', '#dfe3e6', w, m(0.95), m(0.1), [0, m(0.475), s * (d / 2 - m(0.05))]);
    k.box('paint', C.blueGrey, w + m(0.02), m(0.12), d + m(0.02), [0, h - m(0.06), 0]);
    k.box('paint', C.yellow, w + m(0.03), m(0.06), d + m(0.03), [0, m(1.0), 0]);
    // the HMI panel on the aisle side
    k.box('paint', C.joint, m(0.34), m(0.26), m(0.06), [m(-0.3), m(1.35), -d / 2 - m(0.03)]);
    k.box('glow', '#4fa3ff', m(0.28), m(0.18), m(0.01), [m(-0.3), m(1.35), -d / 2 - m(0.065)]);
    // stack light: red, amber, green
    k.cyl('paint', C.joint, m(0.02), m(0.02), m(0.3), [w / 2 - m(0.15), h + m(0.15), d / 2 - m(0.15)]);
    ['#ff3b30', '#ffb020', '#2ee06a'].forEach((c, i) => k.cyl(i === 2 ? 'glow' : 'paint', i === 2 ? c : '#5a2a22', m(0.045), m(0.045), m(0.08), [w / 2 - m(0.15), h + m(0.34) + i * m(0.085), d / 2 - m(0.15)]));
    return k.build();
  }), [w, d, h, f.label]);
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} friction={0.6}>
      <CuboidCollider args={[w / 2, (h - m(0.95)) / 2, d / 2]} position={[0, m(0.95) + (h - m(0.95)) / 2, 0]} />
      {[-1, 1].map((s) => <CuboidCollider key={s} args={[w / 2, m(0.475), m(0.05)]} position={[0, m(0.475), s * (d / 2 - m(0.05))]} />)}
      <KitMeshes geo={geo} />
      <Label text={f.label} at={[0, h - m(0.4), -d / 2 - m(0.012)]} w={w * 0.8} />
    </RigidBody>
  );
}

// ---- the robots
// A six-axis arm drawn as base, turret, upper arm, forearm, wrist and
// gripper, posed by two-link IK toward a gripper target that follows the
// station cycle: work on the printer passing under it, retract, pick the
// next part, come back. The two south arms are big ones; their path from
// the parts rack to the assembly line crosses the transfer belt at car
// height, and their gripper is a kinematic collider.
const ROBOT = {
  N: { L1: m(1.0), L2: m(0.9), shoulder: m(0.95), tool: m(0.28) },
  S: { L1: m(1.4), L2: m(1.3), shoulder: m(1.05), tool: m(0.3) },
};
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const lerp3 = (out, a, b, k) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };

// gripper target at station-cycle time τ (−3.2…3.2 s) for an arm at (bx, bz)
function gripTarget(out, side, bx, bz, tau) {
  const printerTop = ASM.top + m(0.25);
  const px = bx + ASM.v * tau; // the printer under this station
  const work = [px, printerTop + m(0.1) + m(0.3) * Math.min(1, (tau * tau) / 1.2), ASM.z];
  const home = side === 'N' ? [bx + m(0.25), m(1.5), bz + m(0.7)] : [bx, m(1.35), bz - m(0.7)];
  const pick = [home[0], home[1] - m(0.22), home[2]];
  if (tau > -1.1 && tau < 1.1) return lerp3(out, work, work, 0);
  // retract (1.1 → 2.2), dip to pick (2.2 → 2.8), come back (2.8 → −1.1)
  const w1 = [bx + ASM.v * 1.1, printerTop + m(0.46), ASM.z];
  const w0 = [bx - ASM.v * 1.1, printerTop + m(0.46), ASM.z];
  let k, a, b;
  if (tau >= 1.1 && tau < 2.2) { k = smooth(1.1, 2.2, tau); a = w1; b = home; }
  else if (tau >= 2.2 && tau < 2.8) { const d = Math.sin(((tau - 2.2) / 0.6) * Math.PI); return lerp3(out, home, pick, d); }
  else { const tt = tau >= 2.8 ? tau : tau + ASM.period; k = smooth(2.8, 5.3, tt); a = home; b = w0; }
  lerp3(out, a, b, k);
  // the big arms swing low across the transfer belt on the way (that's the
  // hazard): a dip in the middle of the move
  if (side === 'S') out[1] -= m(0.42) * Math.sin(Math.PI * k);
  else out[1] += m(0.15) * Math.sin(Math.PI * k);
  return out;
}

const _t3 = [0, 0, 0];
const _kv = { x: 0, y: 0, z: 0 };
function Arm({ f }) {
  const { x, z } = f;
  const side = f.side || 'N';
  const R = ROBOT[side];
  const turret = useRef(), upper = useRef(), fore = useRef(), wrist = useRef();
  const kin = useRef();
  const lastPhase = useRef(0);
  const big = side === 'S' ? 1.25 : 1;
  const geo = useMemo(() => cached(`robot${side}`, () => {
    const base = new Kit(), tur = new Kit(), up = new Kit(), fo = new Kit(), wr = new Kit();
    const b = big, S = R.shoulder - m(0.6);
    // riser and base: a dark steel pedestal on a bolted plate
    base.rbox('paint', C.joint, m(0.56) * b, m(0.45), m(0.56) * b, [0, m(0.225), 0], [0, 0, 0], m(0.03));
    base.box('paint', C.yellow, m(0.66) * b, m(0.025), m(0.66) * b, [0, m(0.0125), 0]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) base.cyl('paint', C.steel, m(0.02), m(0.02), m(0.03), [sx * m(0.28) * b, m(0.035), sz * m(0.28) * b], [0, 0, 0], 6);
    base.cyl('paint', C.orange, m(0.25) * b, m(0.28) * b, m(0.15), [0, m(0.525), 0], [0, 0, 0], 24);
    // turret: the carousel, its yaw motor, the shoulder housing
    tur.cyl('paint', C.orange, m(0.23) * b, m(0.25) * b, m(0.16), [0, m(0.08), 0], [0, 0, 0], 24);
    tur.rbox('paint', C.orange, m(0.34) * b, S + m(0.2) * b, m(0.34) * b, [0, (S + m(0.2) * b) / 2, m(0.06)], [0, 0, 0], m(0.07) * b);
    tur.cyl('paint', C.grey, m(0.07) * b, m(0.07) * b, m(0.2) * b, [m(-0.18) * b, m(0.2), m(-0.1) * b], [0, 0, 0], 14);
    tur.cyl('paint', C.joint, m(0.15) * b, m(0.15) * b, m(0.44) * b, [0, S, m(0.12) * b], [0, 0, Math.PI / 2], 20);
    tur.cyl('paint', C.grey, m(0.08) * b, m(0.08) * b, m(0.12) * b, [m(0.26) * b, S, m(0.12) * b], [0, 0, Math.PI / 2], 14);
    // the balancer: a grey spring cylinder from the carousel's back
    tur.cyl('paint', C.galv, m(0.045) * b, m(0.045) * b, m(0.5) * b, [m(-0.19) * b, S - m(0.1), m(-0.12) * b], [0.5, 0, 0], 10);
    // upper arm along +z, elbow at L1: a cast box that narrows toward the elbow
    up.rbox('paint', C.orange, m(0.19) * b, m(0.24) * b, R.L1 * 0.62, [0, 0, R.L1 * 0.33], [0, 0, 0], m(0.07) * b);
    up.rbox('paint', C.orange, m(0.16) * b, m(0.19) * b, R.L1 * 0.5, [0, 0, R.L1 * 0.72], [0, 0, 0], m(0.06) * b);
    up.cyl('paint', C.joint, m(0.12) * b, m(0.12) * b, m(0.26) * b, [0, 0, R.L1], [0, 0, Math.PI / 2], 18);
    up.cyl('paint', C.orange, m(0.14) * b, m(0.14) * b, m(0.3) * b, [0, 0, 0], [0, 0, Math.PI / 2], 18);
    // forearm: motor pack behind the elbow, a tapering tube to the wrist
    fo.rbox('paint', C.orange, m(0.22) * b, m(0.24) * b, m(0.34) * b, [0, m(0.02), m(-0.06) * b], [0, 0, 0], m(0.07) * b);
    fo.cyl('paint', C.grey, m(0.06) * b, m(0.06) * b, m(0.14) * b, [m(0.08) * b, m(0.04), m(-0.24) * b], [Math.PI / 2, 0, 0], 12);
    fo.cyl('paint', C.grey, m(0.06) * b, m(0.06) * b, m(0.14) * b, [m(-0.08) * b, m(0.04), m(-0.24) * b], [Math.PI / 2, 0, 0], 12);
    fo.cyl('paint', C.orange, m(0.07) * b, m(0.095) * b, R.L2 * 0.8, [0, 0, R.L2 * 0.5], [Math.PI / 2, 0, 0], 16);
    fo.cyl('paint', C.black, m(0.018), m(0.018), R.L2 * 0.8, [m(0.1) * b, m(0.06), R.L2 * 0.45], [Math.PI / 2, 0, 0], 6);
    // wrist, flange, a two-finger gripper
    wr.rbox('paint', C.orange, m(0.13), m(0.13), m(0.14), [0, 0, m(0.03)], [0, 0, 0], m(0.04));
    wr.cyl('paint', C.joint, m(0.055), m(0.055), m(0.05), [0, 0, m(0.12)], [Math.PI / 2, 0, 0], 14);
    wr.rbox('paint', C.galv, m(0.17), m(0.06), m(0.07), [0, 0, m(0.17)], [0, 0, 0], m(0.015));
    wr.box('paint', C.brand, m(0.05), m(0.03), m(0.05), [0, m(0.045), m(0.16)]);
    for (const s2 of [-1, 1]) wr.box('paint', C.steel, m(0.02), m(0.04), m(0.1), [s2 * m(0.05), 0, m(0.25)]);
    // one mesh per link: everything is vertex-coloured paint
    return { base: base.build().paint, tur: tur.build().paint, up: up.build().paint, fo: fo.build().paint, wr: wr.build().paint };
  }), [side, R, big]);

  useFrame(() => {
    const t = LINE.t;
    const tau = cyclePhase(t);
    gripTarget(_t3, side, x, z, tau);
    // a pneumatic hiss when a move starts, a clank when the tool lands
    const ph = tau < -1.1 ? 0 : tau < 1.1 ? 1 : tau < 2.2 ? 2 : 3;
    if (ph !== lastPhase.current && !LINE.stopped) {
      if (ph === 1) audio.clank([_t3[0], _t3[1], _t3[2]], side === 'S' ? 0.5 : 0.35);
      else if (ph === 2 || ph === 0) audio.hiss([x, m(1.2), z], 0.3, 0.25);
      lastPhase.current = ph;
    }
    // IK: yaw toward the wrist point, then two links in that vertical plane
    const wx = _t3[0], wy = _t3[1] + R.tool, wz = _t3[2];
    const yaw = Math.atan2(wx - x, wz - z);
    const sx = m(0.12) * big; // shoulder sits forward of the turret axis
    const r = Math.max(0.01, Math.hypot(wx - x, wz - z) - sx);
    const dy = wy - R.shoulder;
    const D = Math.min(R.L1 + R.L2 - 0.02, Math.max(Math.abs(R.L1 - R.L2) + 0.02, Math.hypot(r, dy)));
    const a1 = Math.atan2(dy, r) + Math.acos((R.L1 * R.L1 + D * D - R.L2 * R.L2) / (2 * R.L1 * D));
    const elbow = Math.acos((R.L1 * R.L1 + R.L2 * R.L2 - D * D) / (2 * R.L1 * R.L2));
    const a2 = a1 - (Math.PI - elbow);
    if (turret.current) turret.current.rotation.y = yaw;
    if (upper.current) upper.current.rotation.x = -a1;
    if (fore.current) fore.current.rotation.x = a1 - a2;
    if (wrist.current) wrist.current.rotation.x = a2 + Math.PI / 2;
    if (kin.current) {
      _kv.x = _t3[0]; _kv.y = _t3[1] - m(0.02); _kv.z = _t3[2];
      kin.current.setNextKinematicTranslation(_kv);
    }
  });

  const meshes = (g) => <mesh geometry={g} material={matFor('paint')} castShadow />;
  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
        <CylinderCollider args={[m(0.35), m(0.3) * big]} position={[0, m(0.35), 0]} />
        {meshes(geo.base)}
        <group ref={turret} position={[0, m(0.6), 0]}>
          {meshes(geo.tur)}
          <group ref={upper} position={[0, R.shoulder - m(0.6), m(0.12) * big]}>
            {meshes(geo.up)}
            <group ref={fore} position={[0, 0, R.L1]}>
              {meshes(geo.fo)}
              <group ref={wrist} position={[0, 0, R.L2]}>
                {meshes(geo.wr)}
              </group>
            </group>
          </group>
        </group>
      </RigidBody>
      {side === 'S' && (
        // the gripper, as something a car can be hit by
        <RigidBody ref={kin} type="kinematicPosition" colliders={false} position={[x, m(1.3), z - m(0.7)]}>
          <CuboidCollider args={[m(0.12), m(0.1), m(0.12)]} />
        </RigidBody>
      )}
    </>
  );
}

// ---- forklift: parked, forks raised with a pallet on them (the ramp
// beside it runs you up onto the pallet — a kicker at the forklift lane)
function Forklift({ f }) {
  const { x, z, w, d, h, rotY } = f;
  const geo = useMemo(() => cached('forklift', () => {
    const k = new Kit();
    // body: a rounded chassis, the counterweight at the back (+x), the cab
    // (seat, steering wheel, overhead guard on four posts), the mast at −x
    k.rbox('paint', C.orange, w * 0.78, m(0.5), d, [w * 0.05, m(0.42), 0], [0, 0, 0], m(0.08));
    k.rbox('paint', C.joint, w * 0.26, m(0.62), d * 0.98, [w * 0.36, m(0.5), 0], [0, 0, 0], m(0.12));
    k.box('paint', C.orange, w * 0.3, m(0.04), d * 1.02, [-w * 0.22, m(0.66), 0]);
    k.rbox('matte', C.black, m(0.44), m(0.12), m(0.46), [w * 0.12, m(0.73), 0], [0, 0, 0], m(0.04)); // seat
    k.rbox('matte', C.black, m(0.1), m(0.42), m(0.44), [w * 0.23, m(0.95), 0], [0, 0, -0.15], m(0.04));
    k.cyl('matte', C.black, m(0.02), m(0.02), m(0.45), [-w * 0.12, m(0.85), 0], [0, 0, 0.5], 6);
    k.add('matte', new THREE.TorusGeometry(m(0.13), m(0.018), 6, 16), C.black, [-w * 0.17, m(1.05), 0], [0, Math.PI / 2, -0.9]);
    for (const s of [-1, 1]) {
      for (const e of [-1, 1]) k.post('paint', C.joint, m(0.05), m(0.05), w * 0.08 + e * m(0.48), m(0.66), h, s * (d / 2 - m(0.06)));
      // tyres with a hub
      k.add('matte', new THREE.CylinderGeometry(m(0.24), m(0.24), m(0.2), 18), C.rubber, [-w * 0.24, m(0.24), s * (d / 2 - m(0.07))], [Math.PI / 2, 0, 0]);
      k.add('paint', new THREE.CylinderGeometry(m(0.12), m(0.12), m(0.205), 12), C.galv, [-w * 0.24, m(0.24), s * (d / 2 - m(0.07))], [Math.PI / 2, 0, 0]);
      k.add('matte', new THREE.CylinderGeometry(m(0.19), m(0.19), m(0.17), 18), C.rubber, [w * 0.32, m(0.19), s * (d / 2 - m(0.08))], [Math.PI / 2, 0, 0]);
      // mast channels, a chain up each
      k.post('metal', C.joint, m(0.07), m(0.1), -w / 2 + m(0.04), m(0.06), m(2.35), s * m(0.33));
      k.post('metal', C.joint, m(0.05), m(0.08), -w / 2 - m(0.02), m(0.06), m(2.25), s * m(0.24));
      k.box('metal', '#3d4247', m(0.02), m(1.9), m(0.03), [-w / 2 + m(0.1), m(1.2), s * m(0.18)]);
      // work light on the guard
      k.box('glow', '#fff4d8', m(0.02), m(0.06), m(0.1), [w * 0.08 - m(0.5), h - m(0.08), s * (d / 2 - m(0.1))]);
    }
    k.box('paint', C.joint, m(0.08), m(0.12), m(0.72), [-w / 2 + m(0.04), m(2.35), 0]);
    k.box('paint', C.joint, m(0.08), m(0.1), m(0.62), [-w / 2 + m(0.04), m(1.0), 0]);
    // the overhead guard: a frame with slats
    for (const s of [-1, 1]) k.box('paint', C.joint, m(1.02), m(0.05), m(0.05), [w * 0.08, h, s * (d / 2 - m(0.06))]);
    for (let i = -2; i <= 2; i++) k.box('paint', C.joint, m(0.04), m(0.04), d - m(0.1), [w * 0.08 + i * m(0.22), h, 0]);
    // carriage and the forks (raised to 0.3 m, the pallet on them)
    k.box('paint', C.joint, m(0.1), m(0.55), m(0.84), [-w / 2 - m(0.03), m(0.6), 0]);
    for (const s of [-1, 1]) {
      k.box('metal', C.steel, m(1.15), m(0.045), m(0.12), [-w / 2 - m(0.62), m(0.3), s * m(0.28)]);
      k.box('metal', C.steel, m(0.045), m(0.4), m(0.12), [-w / 2 - m(0.06), m(0.5), s * m(0.28)]);
    }
    palletInto(k, -w / 2 - m(0.62), m(0.3), 0, 0);
    // amber beacon base, the plate and the rear lights
    k.cyl('paint', C.joint, m(0.05), m(0.05), m(0.05), [w * 0.3, h + m(0.03), 0]);
    k.box('paint', C.white, m(0.3), m(0.1), m(0.01), [w * 0.2, m(0.5), d / 2 + m(0.005)]);
    for (const s of [-1, 1]) k.box('glow', '#ff3b30', m(0.02), m(0.06), m(0.08), [w / 2 + m(0.005), m(0.7), s * m(0.35)]);
    return k.build();
  }), [w, d, h]);
  const beacon = useRef();
  useFrame(() => {
    if (beacon.current) beacon.current.rotation.y = shopTime() * 5;
  });
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.8}>
      <CuboidCollider args={[w / 2, m(0.45), d / 2]} position={[0, m(0.45), 0]} />
      <CuboidCollider args={[m(0.5), m(0.5), d / 2]} position={[w * 0.1, m(1.3), 0]} />
      <CuboidCollider args={[m(0.08), m(1.1), d * 0.4]} position={[-w / 2, m(1.15), 0]} />
      {/* the raised pallet: top at 0.45 m, flush with the ramp */}
      <CuboidCollider args={[m(0.6), m(0.075), m(0.5)]} position={[-w / 2 - m(0.62), m(0.375), 0]} />
      <KitMeshes geo={geo} />
      {/* the blue safety spot it projects on the floor 3 m ahead */}
      <mesh position={[-w / 2 - m(3), m(0.02), 0]} rotation-x={-Math.PI / 2} material={blueSpot()}>
        <circleGeometry args={[m(0.45), 24]} />
      </mesh>
      <group ref={beacon} position={[w * 0.3, h + m(0.1), 0]}>
        <mesh>
          <cylinderGeometry args={[m(0.045), m(0.05), m(0.09), 12]} />
          <meshBasicMaterial color="#ffae3d" toneMapped={false} />
        </mesh>
        <mesh position={[m(0.05), 0, 0]} rotation-z={Math.PI / 2}>
          <coneGeometry args={[m(0.06), m(0.08), 10, 1, true]} />
          <meshBasicMaterial color="#ffd27a" toneMapped={false} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </RigidBody>
  );
}

const blueSpot = () => once('blueSpot', () => new THREE.MeshBasicMaterial({
  map: glowTex(), color: '#3d7bff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
}));

// a Euro pallet (1.2 × 1.0 × 0.15 m) into a kit, at (x, y, z) turned by rotY
function palletInto(k, x, y, z, rotY, wood = C.wood) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const at = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  for (const lz of [-0.42, 0, 0.42]) k.box('matte', '#8f6f47', m(1.2), m(0.1), m(0.1), at(0, m(0.05), m(lz)), [0, rotY, 0]);
  for (const lx of [-0.5, -0.25, 0, 0.25, 0.5]) k.box('matte', wood, m(0.14), m(0.025), m(1.0), at(m(lx), m(0.137), 0), [0, rotY, 0]);
}

// ---- benches: QA and line-side. Drive under (0.9 m, like a desk).
function benchInto(k, f) {
  const { w, d, h } = f;
  const top = m(0.05);
  k.box('paint', '#c9cdc6', w, top, d, [0, h - top / 2, 0]);
  k.box('paint', f.qa ? '#3f6e8c' : '#556066', w * 0.9, m(0.004), d * 0.8, [0, h + m(0.002), 0]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.post('paint', C.blueGrey, m(0.05), m(0.05), sx * (w / 2 - m(0.08)), 0, h - top, sz * (d / 2 - m(0.08)));
    k.box('paint', C.blueGrey, m(0.04), m(0.04), d - m(0.1), [sx * (w / 2 - m(0.08)), m(0.12), 0]);
  }
  // a shelf at the back (over the tops of car roofs) and a light over it
  k.post('paint', C.blueGrey, m(0.04), m(0.04), -w / 2 + m(0.1), h, h + m(0.7), -d / 2 + m(0.05));
  k.post('paint', C.blueGrey, m(0.04), m(0.04), w / 2 - m(0.1), h, h + m(0.7), -d / 2 + m(0.05));
  k.box('paint', '#c9cdc6', w, m(0.03), m(0.3), [0, h + m(0.4), -d / 2 + m(0.16)]);
  k.box('paint', '#d9dcdf', w * 0.8, m(0.05), m(0.1), [0, h + m(0.7), -d / 2 + m(0.12)]);
  k.box('glow', '#f4f8ff', w * 0.76, m(0.01), m(0.06), [0, h + m(0.674), -d / 2 + m(0.12)]);
  if (f.qa) {
    // printers under test on the shelf (QaPages feeds their pages out)
    for (const px of QA_SLOTS) {
      const at = [px * w, h + m(0.415), -d / 2 + m(0.16)];
      k.rbox('paint', C.printer, m(0.36), m(0.16), m(0.26), [at[0], at[1] + m(0.08), at[2]], [0, 0, 0], m(0.02));
      k.box('paint', C.printerDark, m(0.36), m(0.025), m(0.26), [at[0], at[1] + m(0.17), at[2]]);
      k.box('paint', C.printerDark, m(0.22), m(0.015), m(0.1), [at[0], at[1] + m(0.05), at[2] + m(0.16)], [0.35, 0, 0]);
      k.box('glow', '#2ee06a', m(0.012), m(0.012), m(0.004), [at[0] + m(0.14), at[1] + m(0.12), at[2] + m(0.132)]);
    }
    // a test-page tray and the clutter of a lab bench
    k.box('paint', '#2a2d31', m(0.34), m(0.04), m(0.26), [w * 0.02, h + m(0.02), m(0.05)]);
  }
}

function Bench({ f }) {
  const { x, z, w, d, h, rotY } = f;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
      <CuboidCollider args={[w / 2, m(0.025), d / 2]} position={[0, h - m(0.025), 0]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <CuboidCollider key={i} args={[m(0.03), (h - m(0.05)) / 2, m(0.03)]} position={[sx * (w / 2 - m(0.08)), (h - m(0.05)) / 2, sz * (d / 2 - m(0.08))]} />
      ))}
      <CuboidCollider args={[w / 2, m(0.35), m(0.15)]} position={[0, h + m(0.35), -d / 2 + m(0.16)]} />
    </RigidBody>
  );
}

// Printers on the QA shelves push a test page out every few seconds; it
// slides out, tips off the shelf and flutters down onto the bench — onto
// whoever is driving along it. One instanced mesh for every page in flight.
const QA_SLOTS = [-0.28, 0.28];
const QA_PERIOD = 3.2;
const _pg = new THREE.Object3D();
function QaPages({ map }) {
  const ref = useRef();
  const slots = useMemo(() => {
    const out = [];
    for (const b of map.FURNITURE.filter((e) => e.type === 'factory_bench' && e.qa)) {
      const c = Math.cos(b.rotY), sn = Math.sin(b.rotY);
      for (const px of QA_SLOTS) {
        const lx = px * b.w, lz = -b.d / 2 + m(0.16);
        out.push({ x: b.x + lx * c + lz * sn, z: b.z - lx * sn + lz * c, y: b.h + m(0.47), top: b.h, rot: b.rotY, seed: out.length * 1.37 });
      }
    }
    return out;
  }, [map]);
  const drift = useMemo(() => {
    // pages that already made it to the floor, around the benches and the
    // big printer (the paper-storm event's aftermath, every day)
    const k = new Kit();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [cx, cz, n, spread] of map.PAPER || []) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
        k.add('paper', new THREE.PlaneGeometry(m(0.21), m(0.297)), i % 5 ? '#f6f6f2' : '#e8eef8', [m(cx + Math.cos(a) * r), 0.02 + i * 0.0006, m(cz + Math.sin(a) * r)], [-Math.PI / 2, 0, rnd() * Math.PI]);
      }
    }
    return k.parts.size ? k.build().paper : null;
  }, [map]);
  const paperMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }), []);
  useFree(drift, paperMat);
  useFrame(() => {
    if (!ref.current) return;
    const t = LINE.t;
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      const c = ((t + sl.seed) % QA_PERIOD) / QA_PERIOD; // 0…1 through one page
      const out = Math.min(1, c / 0.35); // feeding out of the printer
      const fall = Math.max(0, (c - 0.35) / 0.3); // tipping off the shelf
      const f2 = Math.min(1, fall);
      const fwd = m(0.14) + out * m(0.16) + f2 * m(0.22);
      const cs = Math.cos(sl.rot), sn = Math.sin(sl.rot);
      _pg.position.set(sl.x + fwd * sn, sl.y - f2 * f2 * (sl.y - sl.top - 0.02) + Math.sin(f2 * Math.PI) * m(0.03), sl.z + fwd * cs);
      _pg.rotation.set(-Math.PI / 2 + (1 - f2) * 0.15 + Math.sin(f2 * 9 + sl.seed) * 0.25 * (1 - f2), sl.rot + f2 * 0.6, 0);
      _pg.scale.setScalar(c > 0.94 ? 0.0001 : 1);
      _pg.updateMatrix();
      ref.current.setMatrixAt(i, _pg.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={ref} args={[null, null, Math.max(1, slots.length)]} frustumCulled={false}>
        <planeGeometry args={[m(0.21), m(0.297)]} />
        <meshStandardMaterial color="#f8f8f4" roughness={0.9} side={THREE.DoubleSide} />
      </instancedMesh>
      {drift && <mesh geometry={drift} material={paperMat} receiveShadow />}
    </group>
  );
}

// ---- the SMT clean room's machines
function smtMachineInto(k, f) {
  const { w, d, h, type } = f;
  const oven = type === 'factory_oven';
  k.box('paint', '#e4e7ea', w, h - m(0.25), d, [0, m(0.25) + (h - m(0.25)) / 2, 0]);
  k.box('paint', C.joint, w - m(0.1), m(0.25), d - m(0.1), [0, m(0.125), 0]);
  k.box('paint', oven ? '#3a3d42' : C.brand, w + m(0.01), m(0.08), d + m(0.01), [0, h - m(0.3), 0]);
  if (oven) {
    // the long orange window along the front, and the conveyor mouth
    k.box('glow', '#ff7a1a', w * 0.8, m(0.12), m(0.01), [0, m(0.85), -d / 2 - m(0.006)]);
    for (let i = 0; i < 6; i++) k.box('paint', '#9aa0a6', m(0.02), m(0.2), m(0.012), [-w * 0.4 + i * (w * 0.16), m(0.85), -d / 2 - m(0.012)]);
    for (let i = 0; i < 10; i++) k.box('paint', '#c8ccd0', m(0.12), m(0.06), m(0.08), [-w / 2 + m(0.3) + i * (w - m(0.6)) / 9, h + m(0.03), 0]);
  } else {
    // the machine's glass lid, the feeder bank along the front
    k.box('paint', C.joint, w * 0.9, m(0.3), m(0.12), [0, m(0.55), -d / 2 - m(0.06)]);
    for (let i = 0; i < 8; i++) k.box('paint', i % 3 ? '#d4d6d8' : '#2f6fd6', w * 0.1, m(0.14), m(0.1), [-w * 0.4 + i * w * 0.115, m(0.78), -d / 2 - m(0.05)]);
    k.box('glow', '#7fc4ff', m(0.3), m(0.2), m(0.01), [w * 0.3, h - m(0.55), -d / 2 - m(0.006)]);
    // stack light
    k.cyl('paint', C.joint, m(0.02), m(0.02), m(0.3), [w / 2 - m(0.1), h + m(0.15), d / 2 - m(0.1)]);
    k.cyl('glow', '#2ee06a', m(0.045), m(0.045), m(0.08), [w / 2 - m(0.1), h + m(0.34), d / 2 - m(0.1)]);
    k.box('pane', '#ffffff', w * 0.9, m(0.26), d * 0.8, [0, h - m(0.14), 0]);
  }
}

function SmtMachine({ f }) {
  const { x, z, w, d, h } = f;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} friction={0.6}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
    </RigidBody>
  );
}

// ---- the carton sealer: a tunnel of rollers the lap drives through
function sealerInto(k, f) {
  const { w, d, h } = f;
  const IN = m(0.95), CLEAR = m(0.72); // inner width, headroom
  const side = (d - IN) / 2;
  for (const s of [-1, 1]) {
    const zc = s * (IN / 2 + side / 2);
    k.rbox('paint', '#dfe3e6', w, CLEAR, side, [0, CLEAR / 2, zc], [0, 0, 0], m(0.04));
    k.box('paint', C.brand, w + m(0.01), m(0.06), side + m(0.01), [0, CLEAR - m(0.1), zc]);
    k.box('paint', C.joint, w - m(0.1), m(0.08), side + m(0.01), [0, m(0.04), zc]);
    // side belts that squeeze the carton, and their drive pulleys
    k.box('matte', C.belt, w - m(0.2), m(0.2), m(0.03), [0, m(0.28), s * (IN / 2 - m(0.015))]);
    for (const e of [-1, 1]) k.cyl('paint', C.galv, m(0.05), m(0.05), m(0.22), [e * (w / 2 - m(0.1)), m(0.28), s * (IN / 2 - m(0.02))], [0, 0, 0], 12);
  }
  k.rbox('paint', '#dfe3e6', w, h - CLEAR, d, [0, CLEAR + (h - CLEAR) / 2, 0], [0, 0, 0], m(0.04));
  k.box('paint', C.joint, w + m(0.01), m(0.05), d + m(0.01), [0, CLEAR + m(0.02), 0]);
  // the tape head hanging in the mouth
  k.box('paint', C.joint, m(0.18), m(0.1), m(0.3), [0, CLEAR - m(0.05), 0]);
  k.cyl('matte', '#c9a36a', m(0.09), m(0.09), m(0.05), [m(0.1), CLEAR - m(0.1), 0], [Math.PI / 2, 0, 0], 14);
  // the control panel on the Packing side: a screen, a green run lamp, the
  // big red stop
  k.box('paint', C.joint, m(0.34), m(0.26), m(0.05), [0, CLEAR + m(0.25), d / 2 + m(0.025)]);
  k.box('glow', '#4fa3ff', m(0.22), m(0.14), m(0.005), [m(-0.04), CLEAR + m(0.27), d / 2 + m(0.052)]);
  k.box('glow', '#2ee06a', m(0.03), m(0.03), m(0.01), [m(0.12), CLEAR + m(0.31), d / 2 + m(0.052)]);
  k.cyl('paint', C.red, m(0.03), m(0.03), m(0.03), [m(0.12), CLEAR + m(0.2), d / 2 + m(0.06)], [Math.PI / 2, 0, 0], 12);
  // the roller beds in and out, flush with the floor (you drive over them
  // like a carton would)
  for (const e of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      k.cyl('paint', C.galv, m(0.018), m(0.018), IN - m(0.05), [e * (w / 2 + m(0.08) + i * m(0.1)), m(0.012), 0], [Math.PI / 2, 0, 0], 8);
    }
    for (const s of [-1, 1]) k.box('paint', C.yellow, m(0.72), m(0.025), m(0.04), [e * (w / 2 + m(0.38)), m(0.0125), s * (IN / 2 - m(0.02))]);
  }
  for (const s of [-1, 1]) k.add('hazard', worldPlane(d, m(0.1), m(0.1)), '#ffffff', [s * (w / 2 + m(0.004)), CLEAR + m(0.08), 0], [0, s * Math.PI / 2, 0]);
}

function Sealer({ f }) {
  const { x, z, w, d, h } = f;
  const IN = m(0.95), CLEAR = m(0.72); // inner width, headroom
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} friction={0.6}>
      {[-1, 1].map((s) => (
        <CuboidCollider key={s} args={[w / 2, CLEAR / 2, (d - IN) / 4]} position={[0, CLEAR / 2, s * (IN / 2 + (d - IN) / 4)]} />
      ))}
      <CuboidCollider args={[w / 2, (h - CLEAR) / 2, d / 2]} position={[0, CLEAR + (h - CLEAR) / 2, 0]} />
    </RigidBody>
  );
}

// ---- the stretch-wrap turntable: 12 rpm, a kinematic platform that carries
// (and throws) whatever parks on it. Bevelled so a car can drive on.
function Turntable({ f }) {
  const { x, z, w, h } = f;
  const R = w / 2;
  const body = useRef(), deck = useRef();
  const hull = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(Math.cos(a) * (R + m(0.18)), 0, Math.sin(a) * (R + m(0.18)));
      pts.push(Math.cos(a) * R, h, Math.sin(a) * R);
    }
    return new Float32Array(pts);
  }, [R, h]);
  const geo = useMemo(() => cached('turntable', () => {
    const k = new Kit();
    k.add('paint', new THREE.CylinderGeometry(R, R + m(0.18), h, 40), '#3a3d42', [0, h / 2, 0]);
    k.add('metal', new THREE.CylinderGeometry(R * 0.98, R * 0.98, m(0.005), 40), C.galv, [0, h + m(0.002), 0]);
    for (let i = 0; i < 4; i++) k.box('paint', C.yellow, R * 1.9, m(0.004), m(0.05), [0, h + m(0.006), 0], [0, (i * Math.PI) / 4, 0]);
    return k.build();
  }), [R, h]);
  const mast = useMemo(() => cached('wrapmast', () => {
    const k = new Kit();
    k.box('paint', '#dfe3e6', m(0.4), m(0.3), m(0.5), [0, m(0.15), 0]);
    k.post('paint', '#dfe3e6', m(0.18), m(0.18), 0, m(0.3), m(2.4), 0);
    k.box('paint', C.brand, m(0.2), m(0.1), m(0.2), [0, m(2.4), 0]);
    k.box('paint', C.joint, m(0.3), m(0.4), m(0.25), [m(-0.12), m(1.1), 0]); // the film carriage
    k.cyl('matte', '#dfe8ee', m(0.06), m(0.06), m(0.5), [m(-0.28), m(1.1), 0]);
    return k.build();
  }), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    const a = (shopTime() * Math.PI * 2 * 12) / 60; // 12 rpm
    q.setFromAxisAngle(axis, a);
    body.current?.setNextKinematicRotation(q);
    if (deck.current) deck.current.rotation.y = a;
  });
  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[x, 0, z]} friction={1.4}>
        <ConvexHullCollider args={[hull]} />
      </RigidBody>
      <group ref={deck} position={[x, 0, z]}>
        {Object.entries(geo).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} receiveShadow />)}
      </group>
      <RigidBody type="fixed" colliders={false} position={[x - R - m(0.55), 0, z]}>
        <CuboidCollider args={[m(0.2), m(1.2), m(0.25)]} position={[0, m(1.2), 0]} />
        <KitMeshes geo={mast} receive={false} />
      </RigidBody>
    </>
  );
}

// ---- the packing station: a table you drive under, the kit on top
function packTableInto(k, f) {
  const { w, d, h } = f;
  const top = m(0.04);
  k.box('paint', '#c9b48a', w, top, d, [0, h - top / 2, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.post('paint', C.blueGrey, m(0.05), m(0.05), sx * (w / 2 - m(0.06)), 0, h - top, sz * (d / 2 - m(0.06)));
  // a carton being packed, flaps open, a printer going in
  k.box('carton', '#ffffff', m(0.5), m(0.42), m(0.4), [-w * 0.2, h + m(0.21), 0]);
  for (const s of [-1, 1]) k.box('matte', C.card, m(0.5), m(0.01), m(0.2), [-w * 0.2, h + m(0.47), s * m(0.28)], [s * 0.9, 0, 0]);
  k.box('paint', C.printer, m(0.42), m(0.1), m(0.32), [-w * 0.2, h + m(0.47), 0]);
  // the tape gun, a scale with its display, a label printer, a monitor
  k.box('paint', C.red, m(0.18), m(0.12), m(0.05), [w * 0.1, h + m(0.06), m(0.2)]);
  k.cyl('matte', '#c9a36a', m(0.05), m(0.05), m(0.05), [w * 0.1 + m(0.06), h + m(0.1), m(0.2)], [Math.PI / 2, 0, 0], 12);
  k.box('metal', C.galv, m(0.36), m(0.04), m(0.36), [w * 0.32, h + m(0.02), 0]);
  k.box('glow', '#7fe3a0', m(0.12), m(0.04), m(0.01), [w * 0.32, h + m(0.03), m(0.186)]);
  k.box('paint', '#e8e8e4', m(0.22), m(0.18), m(0.26), [w * 0.1, h + m(0.09), m(-0.22)]);
  k.post('paint', C.joint, m(0.03), m(0.03), w * 0.42, h, h + m(0.5), -d / 2 + m(0.06));
  k.box('paint', C.joint, m(0.4), m(0.26), m(0.03), [w * 0.42, h + m(0.52), -d / 2 + m(0.1)]);
  k.box('glow', '#4fa3ff', m(0.36), m(0.22), m(0.005), [w * 0.42, h + m(0.52), -d / 2 + m(0.118)]);
  // a roll of bubble wrap and flat cartons on the shelf underneath (above
  // car roofs — the shelf is at 0.45 m and cars drive under the table)
  k.box('paint', C.blueGrey, w - m(0.1), m(0.02), d - m(0.1), [0, m(0.55), 0]);
  k.box('carton', '#ffffff', w * 0.6, m(0.08), d * 0.7, [-w * 0.1, m(0.6), 0]);
  k.cyl('film', '#dfe8ee', m(0.14), m(0.14), d * 0.8, [w * 0.33, m(0.7), 0], [Math.PI / 2, 0, 0], 16);
}

function PackTable({ f }) {
  const { x, z, w, d, h, rotY } = f;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
      <CuboidCollider args={[w / 2, (h - m(0.54)) / 2, d / 2]} position={[0, (h + m(0.54)) / 2, 0]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <CuboidCollider key={i} args={[m(0.025), m(0.27), m(0.025)]} position={[sx * (w / 2 - m(0.06)), m(0.27), sz * (d / 2 - m(0.06))]} />
      ))}
    </RigidBody>
  );
}

// ---- canteen: long tables you drive under, vending machines
function tableInto(k, f) {
  const { w, d, h } = f;
  const top = m(0.03), inX = m(0.12);
  k.box('paint', '#eceae4', w, top, d, [0, h - top / 2, 0]);
  k.box('paint', '#9aa0a6', w + m(0.01), m(0.012), d + m(0.01), [0, h - top - m(0.006), 0]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.post('paint', '#5b6167', m(0.04), m(0.04), sx * (w / 2 - inX), 0, h - top, sz * (d / 2 - inX));
  }
  // the rails under the top run along the long side, above car height
  const along = w >= d;
  for (const s of [-1, 1]) {
    k.box('paint', '#5b6167', along ? w - inX * 2 : m(0.03), m(0.05), along ? m(0.03) : d - inX * 2, along ? [0, h - top - m(0.035), s * (d / 2 - inX)] : [s * (w / 2 - inX), h - top - m(0.035), 0]);
  }
}

function Table({ f }) {
  const { x, z, w, d, h, rotY } = f;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
      <CuboidCollider args={[w / 2, m(0.03), d / 2]} position={[0, h - m(0.03), 0]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <CuboidCollider key={i} args={[m(0.02), (h - m(0.03)) / 2, m(0.02)]} position={[sx * (w / 2 - m(0.12)), (h - m(0.03)) / 2, sz * (d / 2 - m(0.12))]} />
      ))}
    </RigidBody>
  );
}

// a drinks or snacks machine beside the real vending machine (the one the
// event pays out of is the built-in 'vending'); faces +z
function vendingInto(k, f) {
  const { w, d, h } = f;
  const snacks = f.kind === 'snacks';
  k.box('paint', snacks ? '#1f6fd6' : '#c4221a', w, h, d, [0, h / 2, 0]);
  k.box('paint', C.joint, w * 0.7, h * 0.66, m(0.02), [-w * 0.08, h * 0.58, d / 2 + m(0.005)]);
  // the lit products behind the glass
  const cols = ['#f2c200', '#e8332a', '#2ecc71', '#f07a1a', '#ffffff', '#3498db'];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      k.box('glow', cols[(row * 3 + col) % cols.length], w * 0.12, m(snacks ? 0.1 : 0.14), m(0.01), [-w * 0.33 + col * w * 0.17, h * 0.34 + row * h * 0.1, d / 2 + m(0.018)]);
    }
  }
  k.box('glow', '#e8f4ff', w * 0.7, m(0.02), m(0.01), [-w * 0.08, h * 0.9, d / 2 + m(0.018)]);
  k.box('paint', '#d9dcdf', w * 0.18, h * 0.3, m(0.03), [w * 0.36, h * 0.62, d / 2 + m(0.01)]);
  k.box('paint', C.black, w * 0.6, h * 0.08, m(0.03), [-w * 0.08, h * 0.14, d / 2 + m(0.01)]);
}

function Vending({ f }) {
  const { x, z, w, d, h } = f;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} friction={0.6}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
    </RigidBody>
  );
}

// small canvas labels (machine names)
function Label({ text, at, w, rotY = 0, fg = '#ffffff', bg = '#1f2429' }) {
  const mat = useMemo(() => once(`label${text}${fg}${bg}`, () => new THREE.MeshStandardMaterial({
    map: canvas(256, 64, (g, cw, ch) => {
      g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
      g.fillStyle = fg; g.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, cw / 2, ch / 2 + 2);
    }),
    roughness: 0.6,
  })), [text, fg, bg]);
  return (
    <mesh position={at} rotation-y={rotY + Math.PI} material={mat}>
      <planeGeometry args={[w, w / 4]} />
    </mesh>
  );
}

// static pieces drawn by the Dressing's batch (StaticStock), not per piece
const BATCHED = {
  factory_bench: benchInto, factory_table: tableInto, factory_vending: vendingInto,
  factory_packtable: packTableInto, factory_ppm: smtMachineInto, factory_oven: smtMachineInto, factory_sealer: sealerInto,
};

// what themes/index.js registers
export const PIECES = {
  factory_rack: ColliderPiece,
  factory_rackbay: ColliderPiece,
  factory_bollard: ColliderPiece,
  factory_pallet: ColliderPiece,
  factory_flowrack: ColliderPiece,
  factory_locker: ColliderPiece,
  factory_conveyor: Conveyor,
  factory_curve: Curve,
  factory_hood: Hood,
  factory_robot: Arm,
  factory_forklift: Forklift,
  factory_bench: Bench,
  factory_ppm: SmtMachine,
  factory_oven: SmtMachine,
  factory_sealer: Sealer,
  factory_turntable: Turntable,
  factory_table: Table,
  factory_packtable: PackTable,
  factory_vending: Vending,
};

// ------------------------------------------------------------- dressing
export function Dressing({ map }) {
  const event = useStore((s) => s.event);
  const stopped = event?.id === 'server_overload';
  // a new floor starts on the server's clock, whatever the last one owed
  useEffect(() => { LINE.lag = 0; LINE.last = null; }, []);
  useFrame(() => {
    tickLine(stopped);
    // the belts: one texture offset moves every conveyor of a kind. The
    // transfer belt keeps running through a Line Stop (it's another line —
    // and the map's push zones can't stop); the assembly belt stops with
    // the robots.
    BELTS.transfer.mat().map.offset.x = -((shopTime() * BELTS.transfer.speed) / BELT_TILE) % 1;
    BELTS.assembly.mat().map.offset.x = -((LINE.t * BELTS.assembly.speed) / BELT_TILE) % 1;
  });
  return (
    <group>
      <group name="Building"><Building map={map} /></group>
      <group name="HighBays"><HighBays map={map} /></group>
      <group name="FloorPaint"><FloorPaint map={map} /></group>
      <group name="Signs"><Signs map={map} /></group>
      <group name="StaticStock"><StaticStock map={map} /></group>
      <group name="AsmPrinters"><AssemblyPrinters /></group>
      <group name="Chain"><ChainConveyor /></group>
      <group name="Fan"><Fan at={map.FAN} /></group>
      <group name="Andon"><Andon map={map} /></group>
      <group name="Safety"><SafetyBoard map={map} /></group>
      <group name="Curtains"><Curtains map={map} /></group>
      <group name="Shopfloor"><Shopfloor /></group>
      <group name="QaPages"><QaPages map={map} /></group>
    </group>
  );
}

// Everything static that repeats, merged: the racking and its stock, the
// pallets and their loads, the flow racks and their bins, the lockers, the
// bollards. Five draw calls for most of the hall's clutter.
function StaticStock({ map }) {
  const { geo, mesh } = useMemo(() => {
    const k = new Kit();
    const meshPanels = [];
    const hash = (a, b) => {
      let h = (Math.round(a * 97) * 374761393 + Math.round(b * 131) * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const F = map.FURNITURE;
    // ---- racking: uprights at every bay edge of a row, beams, stock
    const rows = {};
    for (const b of F.filter((e) => e.type === 'factory_rack' || e.type === 'factory_rackbay')) (rows[b.x] ||= []).push(b);
    for (const [rx, bays] of Object.entries(rows)) {
      const x = Number(rx);
      const w = bays[0].w, H = bays[0].h;
      const edges = new Set();
      for (const b of bays) { edges.add((b.z - b.d / 2).toFixed(3)); edges.add((b.z + b.d / 2).toFixed(3)); }
      for (const ez of edges) {
        const z = Number(ez);
        for (const s of [-1, 1]) {
          k.post('paint', C.upright, m(0.09), m(0.07), x + s * (w / 2 - m(0.045)), 0, H, z);
          k.box('paint', C.upright, m(0.16), m(0.01), m(0.14), [x + s * (w / 2 - m(0.045)), m(0.005), z]);
        }
        // the frame's bracing across the depth
        for (let y = m(0.3); y < H - m(0.2); y += m(0.9)) {
          k.box('paint', C.upright, w - m(0.1), m(0.03), m(0.03), [x, y, z]);
          k.box('paint', C.upright, Math.hypot(w - m(0.1), m(0.9)), m(0.025), m(0.025), [x, y + m(0.45), z], [0, 0, Math.atan2(m(0.9), w - m(0.1))]);
        }
      }
      for (const b of bays) {
        const levels = [m(1.2), m(2.4), m(3.6)];
        for (const y of levels) {
          for (const s of [-1, 1]) k.box('paint', C.beam, m(0.05), m(0.12), b.d - m(0.07), [x + s * (w / 2 - m(0.06)), y - m(0.06), b.z]);
        }
        // stock: the ground level of a full bay, and each beam level
        const floors = b.type === 'factory_rack' ? [0, ...levels] : levels;
        for (const y0 of floors) {
          const r = hash(b.z + y0, x);
          if (y0 > 0 && r < 0.12) continue; // the odd empty slot
          for (const pz of [-0.55, 0.55]) {
            const cz = b.z + m(pz);
            palletInto(k, x, y0, cz, Math.PI / 2);
            const wrapped = r > 0.72;
            const tall = y0 === m(3.6) ? 0.8 : 0.95;
            if (wrapped) {
              k.box('film', '#dfe8ee', m(1.0), m(tall), m(1.0), [x, y0 + m(0.15) + m(tall / 2), cz]);
            }
            // cartons: two tiers of 2 × 2 (a slot is 1.0 × 1.0 m)
            const tiers = tall > 0.9 ? 2 : 2;
            for (let t = 0; t < tiers; t++) {
              for (const ox of [-0.25, 0.25]) {
                for (const oz of [-0.25, 0.25]) {
                  if (t === 1 && hash(cz + ox, oz + y0) < 0.15) continue;
                  k.box('carton', '#ffffff', m(0.48), m(0.44), m(0.48), [x + m(ox), y0 + m(0.15) + m(0.22) + t * m(0.45), cz + m(oz)], [0, (hash(ox, cz) - 0.5) * 0.08, 0]);
                }
              }
            }
          }
        }
      }
      // row end: a yellow upright guard at the aisle end
      const zMin = Math.min(...bays.map((b) => b.z - b.d / 2));
      for (const s of [-1, 1]) k.box('paint', C.yellow, m(0.14), m(0.4), m(0.14), [x + s * (w / 2 - m(0.045)), m(0.2), zMin - m(0.06)]);
      k.box('paint', C.yellow, w, m(0.12), m(0.08), [x, m(0.25), zMin - m(0.14)]);
    }
    // ---- pallets on the floor with their loads
    for (const p of F.filter((e) => e.type === 'factory_pallet')) {
      // a pallet and its load are 1.2 × 1.0 along their own x; one authored
      // 1.0 × 1.2 lies the other way round, and so must what is on it, or
      // the load hangs out of its collider
      const rotY = p.rotY + (p.w < p.d ? Math.PI / 2 : 0);
      palletInto(k, p.x, 0, p.z, rotY);
      const top = p.h - m(0.15);
      if (top <= 0) continue;
      const c = Math.cos(rotY), s = Math.sin(rotY);
      const at = (lx, y, lz) => [p.x + lx * c + lz * s, y, p.z - lx * s + lz * c];
      if (p.load === 'wrapped' || p.load === 'cartons') {
        const tiers = Math.max(1, Math.round(top / m(0.44)));
        const th = top / tiers;
        for (let t = 0; t < tiers; t++) {
          for (const ox of [-0.3, 0.3]) {
            for (const oz of [-0.25, 0.25]) {
              k.box('carton', '#ffffff', m(0.58), th - m(0.01), m(0.48), at(m(ox), m(0.15) + th / 2 + t * th, m(oz)), [0, rotY, 0]);
            }
          }
        }
        if (p.load === 'wrapped') k.box('film', '#dfe8ee', m(1.22), top + m(0.02), m(1.02), [p.x, m(0.15) + top / 2, p.z], [0, rotY, 0]);
      } else if (p.load === 'parts') {
        // a gitterbox of parts: galvanised frame, mesh sides, parts heaped in
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('metal', C.galv, m(0.04), top, m(0.04), at(sx * m(0.58), m(0.15) + top / 2, sz * m(0.48)), [0, rotY, 0]);
        for (const [lx, lz, len, r] of [[0, 0.5, 1.2, 0], [0, -0.5, 1.2, 0], [0.6, 0, 1.0, Math.PI / 2], [-0.6, 0, 1.0, Math.PI / 2]]) {
          k.box('metal', C.galv, m(len), m(0.03), m(0.03), at(m(lx), m(0.15) + top, m(lz)), [0, rotY + r, 0]);
          const g = worldPlane(m(len), top - m(0.03), m(0.05));
          _eul.set(0, rotY + r, 0); _quat.setFromEuler(_eul);
          g.applyMatrix4(_mat4.compose(_pos.set(...at(m(lx), m(0.15) + top / 2, m(lz))), _quat, _scl.set(1, 1, 1)));
          meshPanels.push(g);
        }
        for (let i = 0; i < 9; i++) {
          k.box('paint', ['#3a3d42', '#1f6fd6', '#b9bec3'][i % 3], m(0.22), m(0.1), m(0.16), at(m(-0.4 + (i % 3) * 0.4), m(0.15) + top - m(0.08) - (i > 5 ? m(0.08) : 0), m(-0.3 + Math.floor(i / 3) * 0.3)), [0, rotY + i, 0]);
        }
      } else if (p.load === 'flat') {
        // flat-packed cartons, strapped
        k.box('carton', '#ffffff', m(1.18), top, m(0.98), at(0, m(0.15) + top / 2, 0), [0, rotY, 0]);
        for (const ox of [-0.3, 0.3]) k.box('matte', '#2a5fb0', m(0.02), top + m(0.01), m(1.0), at(m(ox), m(0.15) + top / 2, 0), [0, rotY, 0]);
      } else if (p.load === 'empties') {
        for (let t = 1; t * m(0.15) < p.h; t++) palletInto(k, p.x, t * m(0.15), p.z, rotY + t * 0.03);
      }
    }
    // ---- flow racks: tilted shelves of coloured bins
    const BINS = ['#1f6fd6', '#d8322a', '#f2c200', '#2f7d4a', '#8a9096'];
    for (const r of F.filter((e) => e.type === 'factory_flowrack')) {
      const c = Math.cos(r.rotY), s = Math.sin(r.rotY);
      const at = (lx, y, lz) => [r.x + lx * c + lz * s, y, r.z - lx * s + lz * c];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.post('metal', C.galv, m(0.04), m(0.04), ...[at(sx * (r.w / 2 - m(0.02)), 0, sz * (r.d / 2 - m(0.02)))].map(([ax, , az]) => [ax, 0, r.h, az]).flat());
      const shelves = Math.max(2, Math.round(r.h / m(0.4)));
      for (let i = 0; i < shelves; i++) {
        const y = m(0.25) + i * ((r.h - m(0.3)) / shelves);
        k.box('metal', C.galv, r.w, m(0.02), r.d, at(0, y, 0), [0.12, r.rotY, 0]);
        const n = Math.max(2, Math.floor(r.w / m(0.3)));
        for (let j = 0; j < n; j++) {
          k.box('paint', BINS[(i + j + Math.round(r.x)) % BINS.length], m(0.26), m(0.14), r.d * 0.8, at(-r.w / 2 + (j + 0.5) * (r.w / n), y + m(0.08), 0), [0.12, r.rotY, 0]);
        }
      }
    }
    // ---- lockers: grey steel, a door per 0.4 m, vents
    // (a bank runs along its own x, doors on its front, +z — like the collider)
    for (const l of F.filter((e) => e.type === 'factory_locker')) {
      const c = Math.cos(l.rotY), s = Math.sin(l.rotY);
      const at = (lx, y, lz) => [l.x + lx * c + lz * s, y, l.z - lx * s + lz * c];
      const rot = [0, l.rotY, 0];
      k.box('paint', '#8fa0ad', l.w, l.h, l.d, at(0, l.h / 2, 0), rot);
      const n = Math.round(l.w / m(0.4));
      for (let i = 0; i < n; i++) {
        const x = -l.w / 2 + (i + 0.5) * (l.w / n);
        k.box('paint', i % 4 === 2 ? '#2f6fd6' : '#9fb0bd', l.w / n - m(0.02), l.h - m(0.2), m(0.01), at(x, l.h / 2 + m(0.05), l.d / 2 + m(0.005)), rot);
        k.box('paint', C.joint, m(0.02), m(0.1), m(0.015), at(x + l.w / n / 2 - m(0.07), l.h * 0.55, l.d / 2 + m(0.012)), rot);
      }
      k.box('paint', C.blueGrey, l.w + m(0.02), m(0.1), l.d + m(0.02), at(0, m(0.05), 0), rot);
    }
    // ---- the static pieces whose colliders are their own (benches, tables,
    // vending, the packing table, the SMT machines, the sealer): drawn here
    for (const e of F) {
      const into = BATCHED[e.type];
      if (into) k.inFrame(e.x, e.z, e.rotY, () => into(k, e));
    }
    // ---- bollards: yellow steel with black bands
    for (const b of F.filter((e) => e.type === 'factory_bollard')) {
      k.cyl('paint', C.yellow, b.w / 2, b.w / 2, b.h, [b.x, b.h / 2, b.z], [0, 0, 0], 14);
      for (const y of [0.55, 0.85]) k.cyl('paint', C.black, b.w / 2 + m(0.004), b.w / 2 + m(0.004), m(0.07), [b.x, m(y), b.z], [0, 0, 0], 14);
      k.add('paint', new THREE.SphereGeometry(b.w / 2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.yellow, [b.x, b.h, b.z]);
    }
    return { geo: k.build(), mesh: meshPanels.length ? mergeGeometries(meshPanels) : null };
  }, [map]);
  useFree(geo, mesh);
  return (
    <group>
      <KitMeshes geo={geo} />
      {mesh && <mesh geometry={mesh} material={matFor('meshGalv')} />}
    </group>
  );
}

// The printers riding the assembly line, instanced (one draw call for the
// bodies, one for the parts each station adds), plus a kinematic collider
// each so a car that hops onto the assembly line meets them.
const _o = new THREE.Object3D();
const _v = { x: 0, y: 0, z: 0 };
const LAMPS = ['#ff3b30', '#ffb020', '#2ee06a'].map((c) => new THREE.Color(c));
function AssemblyPrinters() {
  const bodies = useRef([]);
  const shell = useRef(), parts = useRef();
  const geo = useMemo(() => cached('asmPrinter', () => {
    const a = new Kit(), b = new Kit();
    // chassis: a light grey tub with its paper path open
    a.box('paint', C.printer, m(0.45), m(0.16), m(0.35), [0, m(0.08), 0]);
    a.box('paint', C.printerDark, m(0.4), m(0.02), m(0.3), [0, m(0.165), 0]);
    a.box('paint', C.printerDark, m(0.47), m(0.03), m(0.37), [0, m(0.015), 0]);
    for (const s of [-1, 1]) a.box('paint', C.printer, m(0.45), m(0.09), m(0.03), [0, m(0.2), s * m(0.16)]);
    // what the stations add: rollers, the toner, the top cover
    b.cyl('paint', C.joint, m(0.022), m(0.022), m(0.38), [0, m(0.19), m(-0.06)], [0, 0, Math.PI / 2], 8);
    b.box('paint', C.brand, m(0.2), m(0.07), m(0.08), [m(0.06), m(0.2), m(0.06)]);
    b.box('paint', C.printer, m(0.45), m(0.06), m(0.35), [0, m(0.27), 0]);
    b.box('paint', C.printerDark, m(0.15), m(0.01), m(0.08), [m(0.12), m(0.305), m(-0.1)]);
    return { a: a.build().paint, b: b.build().paint };
  }), []);
  useFrame(() => {
    const t = LINE.t;
    for (let i = 0; i < ASM.n; i++) {
      const x = asmX(t, i);
      _o.position.set(x, ASM.top, ASM.z);
      _o.rotation.set(0, 0, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      shell.current?.setMatrixAt(i, _o.matrix);
      // the covers go on at the third station
      const built = x > ASM.x0 + ASM.gap * 2 + m(0.1);
      _o.scale.setScalar(built ? 1 : 0.0001);
      _o.updateMatrix();
      parts.current?.setMatrixAt(i, _o.matrix);
      const body = bodies.current[i];
      if (body) {
        _v.x = x; _v.y = ASM.top + m(0.1); _v.z = ASM.z;
        // back to the start inside the CHASSIS hood: a teleport, not a 16 m
        // kinematic move in one step (that is a 1,000 m/s shove for whatever
        // is sitting at the hood's mouth)
        if (Math.abs(body.translation().x - x) > m(1)) body.setTranslation(_v, true);
        body.setNextKinematicTranslation(_v);
      }
    }
    if (shell.current) shell.current.instanceMatrix.needsUpdate = true;
    if (parts.current) parts.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={shell} args={[geo.a, matFor('paint'), ASM.n]} castShadow frustumCulled={false} />
      <instancedMesh ref={parts} args={[geo.b, matFor('paint'), ASM.n]} castShadow frustumCulled={false} />
      {Array.from({ length: ASM.n }, (_, i) => (
        <RigidBody key={i} ref={(r) => { bodies.current[i] = r; }} type="kinematicPosition" colliders={false} position={[ASM.x0, ASM.top + m(0.1), ASM.z]}>
          <CuboidCollider args={[m(0.22), m(0.1), m(0.17)]} />
        </RigidBody>
      ))}
    </group>
  );
}

// ------------------------------------------------------------- building
// A plane with UVs in world units / `cell`, so a texture keeps its scale
// across walls of any size (hazard bands, mesh guarding).
function worldPlane(w, h, cellU, cellV = cellU) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / cellU, (uv.getY(i) * h) / cellV);
  return g;
}
// the faces of a wall box: [centre x, centre z, length, rotY] for each side
// (a plane faces +z at rotY 0)
function wallFaces(w, eps = m(0.004)) {
  if (w.w >= w.d) {
    return [[w.x, w.z + w.d / 2 + eps, w.w, 0], [w.x, w.z - w.d / 2 - eps, w.w, Math.PI]];
  }
  return [[w.x + w.w / 2 + eps, w.z, w.d, Math.PI / 2], [w.x - w.w / 2 - eps, w.z, w.d, -Math.PI / 2]];
}

// The shell: a sawtooth roof glazed to the north, steel trusses in every
// valley, the painted walls' grey dado and hazard band, fire points. The
// glazing takes its colour from the hour (map.SKY).
function Building({ map }) {
  const hour = useStore((s) => s.timeOfDay);
  const B = map.MAP_BOUNDS, H = map.WALL_HEIGHT;
  const W = B.maxX - B.minX, D = B.maxZ - B.minZ;
  const TEETH = 4, TOOTH = D / TEETH, RISE = m(2.4);
  const { roof, geo } = useMemo(() => {
    const k = new Kit();
    const ang = Math.atan2(RISE, TOOTH), len = Math.hypot(RISE, TOOTH);
    for (let i = 0; i < TEETH; i++) {
      const z0 = B.minZ + i * TOOTH, z1 = z0 + TOOTH;
      // the sloping deck (solid, facing south) and its ribs
      k.box('matte', '#cfd3d6', W, m(0.04), len, [0, H + RISE / 2, (z0 + z1) / 2], [-ang, 0, 0]);
      for (let x = B.minX + m(1.5); x < B.maxX; x += m(3)) {
        k.box('paint', '#9aa2a8', m(0.12), m(0.22), len, [x, H + RISE / 2 - m(0.12), (z0 + z1) / 2], [-ang, 0, 0]);
      }
      // mullions in the north glazing
      for (let x = B.minX; x <= B.maxX; x += m(1.5)) k.box('paint', '#5b6167', m(0.06), RISE, m(0.08), [x, H + RISE / 2, z1 - m(0.02)]);
      k.box('paint', '#5b6167', W, m(0.1), m(0.12), [0, H + m(0.05), z1 - m(0.02)]);
      // the truss along each valley: chords, verticals, diagonals
      const zt = z0 + m(0.05);
      const bot = H - m(0.7);
      k.box('paint', '#aeb6bd', W, m(0.12), m(0.12), [0, H - m(0.06), zt]);
      k.box('paint', '#aeb6bd', W, m(0.1), m(0.1), [0, bot, zt]);
      for (let x = B.minX + m(0.75); x < B.maxX; x += m(1.5)) {
        k.box('paint', '#aeb6bd', m(0.05), m(0.6), m(0.05), [x, bot + m(0.3), zt]);
        k.box('paint', '#aeb6bd', Math.hypot(m(1.5), m(0.6)), m(0.04), m(0.04), [x + m(0.75), bot + m(0.3), zt], [0, 0, (Math.round((x - B.minX) / m(1.5)) % 2 ? 1 : -1) * Math.atan2(m(0.6), m(1.5))]);
      }
    }
    // the end walls' gables above the eaves (the triangles the teeth leave)
    for (const x of [B.minX - m(0.1), B.maxX + m(0.1)]) {
      for (let i = 0; i < TEETH; i++) {
        const z0 = B.minZ + i * TOOTH;
        const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(TOOTH, 0), new THREE.Vector2(TOOTH, RISE)]);
        k.add('matte', new THREE.ShapeGeometry(shape), C.wall, [x, H, z0], [0, -Math.PI / 2, 0]);
        k.add('matte', new THREE.ShapeGeometry(shape), C.wall, [x, H, z0], [0, -Math.PI / 2, 0], [1, 1, 1]);
      }
    }
    const roofGeo = k.build();
    k.parts.clear();
    // walls: the dado (2 m on the outer walls, 1.2 m on block partitions),
    // cladding seams above it on the outer walls
    const plain = map.WALLS.filter((w) => !w.glass && !w.low && !w.style);
    const outer = (w) => Math.abs(Math.abs(w.z) - B.maxZ) < m(0.3) || Math.abs(Math.abs(w.x) - B.maxX) < m(0.3);
    for (const w of plain) {
      const isOuter = outer(w);
      for (const [fx, fz, flen, rot] of wallFaces(w)) {
        // outer walls: only the inside face
        if (isOuter && (Math.abs(fz) > Math.abs(w.z) || Math.abs(fx) > Math.abs(w.x))) continue;
        const top = isOuter ? m(2) : Math.min(m(1.2), w.h);
        k.add('paint', new THREE.PlaneGeometry(flen, top - m(0.12)), C.dado, [fx, m(0.12) + (top - m(0.12)) / 2, fz], [0, rot, 0]);
        k.add('paint', new THREE.PlaneGeometry(flen, m(0.04)), C.yellow, [fx, top, fz], [0, rot, 0]);
        if (isOuter) {
          for (let y = m(3); y < H; y += m(1)) k.add('paint', new THREE.PlaneGeometry(flen, m(0.03)), '#cfd3d2', [fx, y, fz], [0, rot, 0]);
        }
      }
    }
    // fire points on the outer walls: extinguisher, sign, red backboard
    for (const [x, z, rot] of map.FIRE_POINTS || []) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const at = (dx, y, dz) => [m(x) + dx * c + dz * s, y, m(z) - dx * s + dz * c];
      k.box('paint', C.red, m(0.4), m(0.9), m(0.02), at(0, m(0.9), m(0.01)), [0, rot, 0]);
      k.cyl('paint', '#c4221a', m(0.07), m(0.07), m(0.45), at(0, m(0.52), m(0.1)), [0, 0, 0], 10);
      k.cyl('paint', C.black, m(0.03), m(0.03), m(0.08), at(0, m(0.8), m(0.1)), [0, 0, 0], 8);
      k.box('glow', '#e8f4ff', m(0.3), m(0.2), m(0.01), at(0, m(1.5), m(0.02)), [0, rot, 0]);
    }
    return { roof: roofGeo, geo: k.build() };
  }, [map, B, H, W, D, TOOTH, RISE]);
  // the roof goes when the camera is above it (the plan view, a spectator
  // flying high)
  const roofRef = useRef();
  useFrame(({ camera }) => {
    if (roofRef.current) roofRef.current.visible = camera.position.y < H + RISE * 0.8;
  });
  // the hazard band at the foot of the outer walls, world-scaled stripes
  const hazard = useMemo(() => {
    const list = [];
    for (const w of map.WALLS.filter((ww) => !ww.glass && !ww.low && !ww.style)) {
      const isOuter = Math.abs(Math.abs(w.z) - B.maxZ) < m(0.3) || Math.abs(Math.abs(w.x) - B.maxX) < m(0.3);
      if (!isOuter) continue;
      for (const [fx, fz, flen, rot] of wallFaces(w, m(0.006))) {
        if (Math.abs(fz) > Math.abs(w.z) || Math.abs(fx) > Math.abs(w.x)) continue;
        const g = worldPlane(flen, m(0.16), m(0.16));
        _eul.set(0, rot, 0); _quat.setFromEuler(_eul);
        g.applyMatrix4(_mat4.compose(_pos.set(fx, m(0.2), fz), _quat, _scl.set(1, 1, 1)));
        list.push(g);
      }
    }
    return list.length ? mergeGeometries(list) : null;
  }, [map, B]);
  const glazing = useMemo(() => {
    const list = [];
    for (let i = 0; i < TEETH; i++) {
      const z1 = B.minZ + (i + 1) * TOOTH;
      const g = new THREE.PlaneGeometry(W, RISE);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, H + RISE / 2, z1 - m(0.04)));
      list.push(g);
    }
    // a clerestory band high in the long walls: panes between the steel
    for (const z of [B.minZ + m(0.11), B.maxZ - m(0.11)]) {
      for (let x = B.minX + m(1.5); x < B.maxX - m(1); x += m(3)) {
        const g = new THREE.PlaneGeometry(m(2.6), m(0.9));
        g.applyMatrix4(new THREE.Matrix4().makeTranslation(x + m(1.3), H - m(1.2), z));
        list.push(g);
      }
    }
    return mergeGeometries(list);
  }, [B, W, H, TOOTH, RISE]);
  const glassMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfe8f4', side: THREE.DoubleSide, toneMapped: false, fog: false }), []);
  useFree(roof, geo, hazard, glazing, glassMat);
  useEffect(() => {
    glassMat.color.set(map.SKY?.[hour] || '#dfe8f4');
  }, [hour, map, glassMat]);
  return (
    <group>
      <group ref={roofRef}>
        {Object.entries(roof).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} />)}
        <mesh geometry={glazing} material={glassMat} />
      </group>
      {Object.entries(geo).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} receiveShadow={k !== 'glow'} />)}
      {hazard && <mesh geometry={hazard} material={matFor('hazard')} />}
    </group>
  );
}

// High-bay LED fixtures: a grid of discs at 6.6 m, instanced (housing, lens).
// Dead in a blackout, like everything on the mains.
function HighBays({ map }) {
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const B = map.MAP_BOUNDS, H = map.WALL_HEIGHT;
  const spots = useMemo(() => {
    const out = [];
    for (let x = B.minX + m(2); x < B.maxX; x += m(4)) {
      for (let z = B.minZ + m(2.2); z < B.maxZ; z += m(4.3)) out.push([x, z]);
    }
    return out;
  }, [B]);
  const housing = useRef(), lens = useRef(), rod = useRef();
  const lensMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.3, 2.5), toneMapped: false }), []);
  useFree(lensMat);
  useLayoutEffect(() => {
    spots.forEach(([x, z], i) => {
      _o.position.set(x, H - m(0.45), z); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      housing.current.setMatrixAt(i, _o.matrix);
      _o.position.y = H - m(0.53); _o.rotation.set(-Math.PI / 2, 0, 0); _o.updateMatrix();
      lens.current.setMatrixAt(i, _o.matrix);
      _o.position.y = H - m(0.18); _o.rotation.set(0, 0, 0); _o.updateMatrix();
      rod.current.setMatrixAt(i, _o.matrix);
    });
    for (const r of [housing, lens, rod]) r.current.instanceMatrix.needsUpdate = true;
  }, [spots, H]);
  useEffect(() => {
    lensMat.color.setRGB(...(lightsOut ? [0.03, 0.03, 0.04] : [2.2, 2.3, 2.5]));
  }, [lightsOut, lensMat]);
  return (
    <group>
      <instancedMesh ref={housing} args={[null, null, spots.length]} frustumCulled={false}>
        <cylinderGeometry args={[m(0.2), m(0.28), m(0.16), 16]} />
        <meshStandardMaterial color="#6d747a" roughness={0.45} metalness={0.6} />
      </instancedMesh>
      <instancedMesh ref={lens} args={[null, null, spots.length]} material={lensMat} frustumCulled={false}>
        <circleGeometry args={[m(0.24), 16]} />
      </instancedMesh>
      <instancedMesh ref={rod} args={[null, null, spots.length]} frustumCulled={false}>
        <boxGeometry args={[m(0.02), m(0.4), m(0.02)]} />
        <meshStandardMaterial color="#555b61" roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------- floor paint
// A factory is legible from 18 cm up because of its floor: yellow aisle
// lines, green walkways, hazard stripes, stencilled zone names. All of it is
// three draw calls — flat paint (vertex colour), stripes (one texture,
// world-scaled) and stencils (one atlas of words).
const ATLAS_CELL = [256, 64];
function stencilAtlas(texts) {
  const key = `atlas${texts.join('|')}`;
  return once(key, () => {
    const cols = 4, rows = Math.ceil(texts.length / cols);
    const cw = ATLAS_CELL[0], ch = ATLAS_CELL[1];
    const cells = {};
    const tex = canvas(cols * cw, Math.max(1, rows) * ch, (g) => {
      g.clearRect(0, 0, cols * cw, rows * ch);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      texts.forEach((t, i) => {
        const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
        if (t === '👣') {
          // a pair of boot prints
          for (const [ox, oy, r] of [[-26, 6, 0.2], [26, -6, -0.2]]) {
            g.save(); g.translate(cx + cw / 2 + ox, cy + ch / 2 + oy); g.rotate(Math.PI / 2 + r);
            g.beginPath(); g.ellipse(0, -8, 9, 15, 0, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.ellipse(0, 16, 7, 8, 0, 0, Math.PI * 2); g.fill();
            g.restore();
          }
        } else {
          g.font = `bold ${t.length > 8 ? 40 : 50}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
          g.fillText(t, cx + cw / 2, cy + ch / 2 + 2);
        }
        cells[t] = [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows, 1 / cols, 1 / rows];
      });
      // worn paint: knock specks out of everything
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.5})`;
        g.fillRect(Math.random() * cols * cw, Math.random() * rows * ch, 1 + Math.random() * 3, 1 + Math.random() * 2);
      }
    });
    return { tex, cells };
  });
}

function FloorPaint({ map }) {
  const mk = map.MARKINGS || {};
  const Y = 0.014;
  const { flat, stripes, words, atlas } = useMemo(() => {
    const k = new Kit();
    const quad = (key, color, x, z, w, d, rot = 0) => k.add(key, new THREE.PlaneGeometry(w, d), color, [x, Y, z], [-Math.PI / 2, 0, rot]);
    // lines: [x1, z1, x2, z2, width, colour?]
    const line = (x1, z1, x2, z2, wd, color) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      quad('flat', color, (x1 + x2) / 2, (z1 + z2) / 2, len, wd, -Math.atan2(z2 - z1, x2 - x1));
    };
    for (const [x1, z1, x2, z2, wd = 0.1, color = C.yellow] of mk.lines || []) line(m(x1), m(z1), m(x2), m(z2), m(wd), color);
    // dashed lines: same, with gaps
    for (const [x1, z1, x2, z2, wd = 0.1, color = C.white] of mk.dashes || []) {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / 1.2);
      for (let i = 0; i < n; i++) {
        const a = (i * 1.2) / len, b = (i * 1.2 + 0.6) / len;
        line(m(x1 + (x2 - x1) * a), m(z1 + (z2 - z1) * a), m(x1 + (x2 - x1) * b), m(z1 + (z2 - z1) * b), m(wd), color);
      }
    }
    // filled areas: walkways, the forklift lane's darker resin
    for (const [x, z, w, d, color, rot = 0] of mk.areas || []) quad('flat', color, m(x), m(z), m(w), m(d), rot);
    // zebra crossings: [x, z, w (along the aisle), d (across it)]
    for (const [x, z, w, d] of mk.zebras || []) {
      for (let dz = -d / 2 + 0.25; dz < d / 2; dz += 0.5) quad('flat', C.white, m(x), m(z + dz), m(w), m(0.25));
    }
    // circles: [x, z, r, width, colour]
    for (const [x, z, r, wd, color = C.yellow] of mk.circles || []) {
      k.add('flat', new THREE.RingGeometry(m(r - wd / 2), m(r + wd / 2), 48), color, [m(x), Y, m(z)], [-Math.PI / 2, 0, 0]);
    }
    // the AGV's blue tape loop, straight off the robot patrol
    const R = map.ROBOT_PATH;
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length];
      line(a.x, a.z, b.x, b.z, m(0.05), '#1f6fd6');
    }
    const flatGeo = k.build().flat;
    // hazard stripe areas: [x, z, w, d, rot]
    const sl = [];
    for (const [x, z, w, d, rot = 0] of mk.hazard || []) {
      const g = worldPlane(m(w), m(d), m(0.4));
      g.rotateX(-Math.PI / 2); g.rotateY(rot);
      g.translate(m(x), Y + 0.002, m(z));
      sl.push(g);
    }
    // box junctions: a yellow hatch as stripes too (drawn by the flat kit
    // below as a frame + diagonals)
    const kj = new Kit();
    for (const [x, z, w, d] of mk.junctions || []) {
      const X = m(x), Z = m(z), Wd = m(w), Dd = m(d), t = m(0.1);
      for (const s of [-1, 1]) {
        kj.add('flat', new THREE.PlaneGeometry(Wd, t), C.yellow, [X, Y, Z + s * (Dd / 2 - t / 2)], [-Math.PI / 2, 0, 0]);
        kj.add('flat', new THREE.PlaneGeometry(t, Dd), C.yellow, [X + s * (Wd / 2 - t / 2), Y, Z], [-Math.PI / 2, 0, 0]);
      }
      const diag = Math.hypot(Wd, Dd) * 0.5;
      for (let o = -1; o <= 1; o += 0.5) {
        for (const s of [-1, 1]) {
          const cx = X + o * Wd * 0.25 * s, cz = Z + o * Dd * 0.25;
          kj.add('flat', new THREE.PlaneGeometry(diag * (1 - Math.abs(o) * 0.8), m(0.08)), C.yellow, [cx, Y, cz], [-Math.PI / 2, 0, s * Math.atan2(Dd, Wd)]);
        }
      }
    }
    const jGeo = kj.parts.size ? kj.build().flat : null;
    // stencils: [text, x, z, size (m, text height), rotY, colour]
    const texts = [...new Set((mk.stencils || []).map((s) => s[0]))];
    const at = stencilAtlas(texts);
    const wl = [];
    for (const [text, x, z, size, rot = 0, color = C.white] of mk.stencils || []) {
      const [u0, v0, du, dv] = at.cells[text];
      const g = new THREE.PlaneGeometry(m(size) * 4, m(size));
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
      g.rotateX(-Math.PI / 2); g.rotateY(rot);
      g.translate(m(x), Y + 0.004, m(z));
      _col.set(color);
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      wl.push(g);
    }
    return {
      flat: jGeo ? mergeGeometries([flatGeo, jGeo]) : flatGeo,
      stripes: sl.length ? mergeGeometries(sl) : null,
      words: wl.length ? mergeGeometries(wl) : null,
      atlas: at.tex,
    };
  }, [map, mk]);
  const mats = useMemo(() => ({
    flat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    stripes: new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    words: new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  }), [atlas]);
  useFree(flat, stripes, words, mats);
  return (
    <group>
      {flat && <mesh geometry={flat} material={mats.flat} receiveShadow />}
      {stripes && <mesh geometry={stripes} material={mats.stripes} receiveShadow />}
      {words && <mesh geometry={words} material={mats.words} receiveShadow />}
    </group>
  );
}

// ------------------------------------------------------------- signs
// Wall signs (SIGNS, like the cellar's), zone boards hanging on chains from
// the trusses (HANGING, yellow on black, both faces), and the name on the
// wall at the end of the aisle, big enough to read from the grid.
// Every sign on the floor is drawn into one canvas atlas and laid out as
// one merged mesh (plus one for the lit exit signs): a sign is a quad, not a
// draw call. Slots are 512 × 160; a wide logo takes two.
function drawSign(g, x, y, w, h, s) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = s.bg; g.fillRect(x, y, w, h);
  g.fillStyle = s.fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (s.wide) {
    g.font = 'bold 110px "Arial Black", "Arial Narrow", Arial, sans-serif';
    g.fillText(s.text, x + w / 2, y + h / 2 + 6);
  } else {
    g.font = `bold ${s.sub ? 64 : 78}px "Arial Narrow", Arial, sans-serif`;
    g.fillText(s.text, x + w / 2, y + (s.sub ? 62 : 82));
    if (s.sub) { g.font = 'bold 30px Arial, sans-serif'; g.fillText(s.sub, x + w / 2, y + 124); }
  }
  g.restore();
}
function signAtlas(list) {
  const SW = 512, SH = 160, COLS = 4;
  const cells = [];
  let slot = 0;
  for (const s of list) {
    const span = s.wide ? 2 : 1;
    if ((slot % COLS) + span > COLS) slot += COLS - (slot % COLS);
    cells.push([slot % COLS, Math.floor(slot / COLS), span]);
    slot += span;
  }
  const rows = Math.max(1, Math.ceil(slot / COLS));
  const W = SW * COLS, H = SH * rows;
  const tex = canvas(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    list.forEach((s, i) => { const [cx, cy, span] = cells[i]; drawSign(g, cx * SW, cy * SH, SW * span, SH, s); });
  });
  // uv rect per sign (canvas y runs down, uv v runs up)
  return { tex, uv: cells.map(([cx, cy, span]) => [(cx * SW) / W, 1 - ((cy + 1) * SH) / H, (span * SW) / W, SH / H]) };
}
function signQuad(w, h, [u0, v0, du, dv], pos, rotY) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  g.rotateY(rotY);
  g.translate(pos[0], pos[1], pos[2]);
  return g;
}

function Signs({ map }) {
  const { lit, painted, chains } = useMemo(() => {
    const signs = map.SIGNS || [], hanging = map.HANGING || [];
    const paintedList = [], litList = [];
    for (const s of signs) {
      const e = { ...s, fg: s.exit ? '#ffffff' : s.fg || '#1c1c1c', bg: s.exit ? '#12a150' : s.bg || '#e9e4d4' };
      (s.exit ? litList : paintedList).push(e);
    }
    // hanging zone boards: yellow on black, a face each way
    for (const hg of hanging) paintedList.push({ ...hg, fg: C.yellow, bg: '#16181a', hanging: true });
    const build = (list) => {
      if (!list.length) return null;
      const at = signAtlas(list);
      const geos = [];
      list.forEach((s, i) => {
        const w = m(s.w), h = w * (s.wide ? 160 / 1024 : 160 / 512);
        if (s.hanging) {
          const r = s.rotY || 0;
          for (const flip of [0, Math.PI]) {
            geos.push(signQuad(w, h, at.uv[i], [m(s.at[0]) + Math.sin(r + flip) * m(0.025), m(s.y), m(s.at[1]) + Math.cos(r + flip) * m(0.025)], r + flip));
          }
        } else {
          geos.push(signQuad(w, h, at.uv[i], [m(s.at[0]), m(s.at[1]), m(s.at[2])], s.rotY || 0));
        }
      });
      return { geo: mergeGeometries(geos), tex: at.tex };
    };
    const k = new Kit();
    for (const hg of hanging) {
      const w = m(hg.w), top = map.WALL_HEIGHT - m(0.7);
      const c = Math.cos(hg.rotY || 0), s = Math.sin(hg.rotY || 0);
      for (const e of [-0.42, 0.42]) {
        k.box('metal', C.steel, m(0.012), top - m(hg.y) - w * 0.156, m(0.012), [m(hg.at[0]) + e * w * c, (top + m(hg.y) + w * 0.156) / 2, m(hg.at[1]) - e * w * s]);
      }
      k.box('paint', '#16181a', w + m(0.06), w * 0.3125 + m(0.06), m(0.04), [m(hg.at[0]), m(hg.y), m(hg.at[1])], [0, hg.rotY || 0, 0]);
    }
    return { lit: build(litList), painted: build(paintedList), chains: k.parts.size ? k.build() : {} };
  }, [map]);
  const mats = useMemo(() => ({
    painted: painted && new THREE.MeshStandardMaterial({ map: painted.tex, roughness: 0.7, alphaTest: 0.4 }),
    lit: lit && new THREE.MeshBasicMaterial({ map: lit.tex, toneMapped: false }),
  }), [painted, lit]);
  useFree(lit, painted, chains, mats);
  return (
    <group>
      {painted && <mesh geometry={painted.geo} material={mats.painted} />}
      {lit && <mesh geometry={lit.geo} material={mats.lit} />}
      {Object.entries(chains).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} />)}
    </group>
  );
}

// ------------------------------------------------ the overhead conveyor
// A power-and-free chain conveyor over the aisle at 3.6 m: an I-beam loop
// and printer housings hanging off it, always moving across the top of the
// screen. The housings are one instanced mesh; the track one merged mesh.
const CHAIN = { x0: m(-9), x1: m(11), z: m(0.55), r: m(0.55), y: m(3.7), gap: m(1.5), v: m(0.3) };
function chainPoint(s, out) {
  const straight = CHAIN.x1 - CHAIN.x0, arc = Math.PI * CHAIN.r;
  const total = 2 * straight + 2 * arc;
  s = ((s % total) + total) % total;
  if (s < straight) { out.x = CHAIN.x0 + s; out.z = CHAIN.z; out.a = 0; return out; }
  s -= straight;
  if (s < arc) { const a = s / CHAIN.r; out.x = CHAIN.x1 + Math.sin(a) * CHAIN.r; out.z = Math.cos(a) * CHAIN.r; out.a = a; return out; }
  s -= arc;
  if (s < straight) { out.x = CHAIN.x1 - s; out.z = -CHAIN.z; out.a = Math.PI; return out; }
  s -= straight;
  const a = s / CHAIN.r;
  out.x = CHAIN.x0 - Math.sin(a) * CHAIN.r; out.z = -Math.cos(a) * CHAIN.r; out.a = Math.PI + a;
  return out;
}
const _cp = { x: 0, z: 0, a: 0 };
function ChainConveyor() {
  const total = 2 * (CHAIN.x1 - CHAIN.x0) + 2 * Math.PI * CHAIN.r;
  const n = Math.floor(total / CHAIN.gap);
  const ref = useRef();
  const track = useMemo(() => {
    const k = new Kit();
    for (let s = 0; s < total; s += m(0.25)) {
      chainPoint(s, _cp);
      k.box('paint', C.frame, m(0.26), m(0.12), m(0.05), [_cp.x, CHAIN.y, _cp.z], [0, _cp.a, 0]);
    }
    // hangers up to the trusses every 3 m
    for (let x = CHAIN.x0; x <= CHAIN.x1; x += m(3)) {
      for (const z of [-CHAIN.z, CHAIN.z]) k.box('paint', C.steel, m(0.03), m(2.6), m(0.03), [x, CHAIN.y + m(1.3), z]);
    }
    return k.build();
  }, [total]);
  useFree(track);
  const carrier = useMemo(() => cached('chainCarrier', () => {
    const k = new Kit();
    k.box('metal', C.steel, m(0.02), m(0.35), m(0.02), [0, -m(0.2), 0]);
    k.box('metal', C.steel, m(0.3), m(0.02), m(0.02), [0, -m(0.37), 0]);
    // a printer housing (the top shell), hanging by its hook
    k.box('paint', C.printer, m(0.42), m(0.16), m(0.32), [0, -m(0.48), 0]);
    k.box('paint', C.printerDark, m(0.3), m(0.02), m(0.12), [m(0.04), -m(0.4), m(0.08)]);
    k.box('paint', C.brand, m(0.42), m(0.02), m(0.01), [0, -m(0.5), m(0.161)]);
    return k.build().paint;
  }), []);
  useFrame(() => {
    if (!ref.current) return;
    const base = LINE.t * CHAIN.v;
    for (let i = 0; i < n; i++) {
      chainPoint(base + i * CHAIN.gap, _cp);
      _o.position.set(_cp.x, CHAIN.y, _cp.z);
      _o.rotation.set(0, _cp.a, Math.sin(LINE.t * 1.3 + i) * 0.03);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      ref.current.setMatrixAt(i, _o.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      {Object.entries(track).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} />)}
      <instancedMesh ref={ref} args={[carrier, matFor('paint'), n]} frustumCulled={false} />
    </group>
  );
}

// -------------------------------------------------------------- the fan
// A 6 m HVLS fan over the Shipping Hall: yellow hub, six blades, 20 rpm.
function Fan({ at }) {
  const blades = useRef();
  const geo = useMemo(() => cached('fan', () => {
    const k = new Kit();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.box('metal', '#c9ced3', m(2.7), m(0.03), m(0.2), [Math.cos(a) * m(1.6), 0, -Math.sin(a) * m(1.6)], [0.08, a, 0]);
      k.box('paint', C.yellow, m(0.04), m(0.12), m(0.22), [Math.cos(a) * m(2.95), m(0.04), -Math.sin(a) * m(2.95)], [0, a, 0]);
    }
    k.cyl('paint', C.yellow, m(0.3), m(0.34), m(0.28), [0, 0, 0], [0, 0, 0], 20);
    k.cyl('paint', C.joint, m(0.18), m(0.18), m(0.3), [0, m(0.28), 0], [0, 0, 0], 16);
    return k.build();
  }), []);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.y -= dt * ((20 * Math.PI * 2) / 60);
  });
  if (!at) return null;
  return (
    <group position={[m(at[0]), m(6.3), m(at[1])]}>
      <mesh position={[0, m(0.8), 0]}>
        <cylinderGeometry args={[m(0.04), m(0.04), m(1.3), 8]} />
        <meshStandardMaterial color="#6d747a" metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={blades}>
        <KitMeshes geo={geo} receive={false} />
      </group>
    </group>
  );
}

// --------------------------------------------------------------- Andon
// Over the grid: a portal beam holding the line's status board. PLAN is
// fixed, ACT counts up with every lap and goal on the floor; the stack light
// on the portal counts the race start down red, amber, green; a Line Stop
// turns everything red and sounds the siren.
function andonDraw(g, w, h, s) {
  g.fillStyle = '#07090b'; g.fillRect(0, 0, w, h);
  const red = s.stop;
  g.fillStyle = red ? '#ff3b30' : '#2ee06a';
  g.fillRect(0, 0, w, 30);
  g.fillStyle = '#07090b';
  g.font = 'bold 24px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(red ? 'LINE 2 · STOPPED' : 'LINE 2 · RUNNING', 12, 16);
  g.textAlign = 'right';
  g.fillText(s.clock, w - 12, 16);
  // PLAN and ACT, big; TAKT and OEE underneath
  const big = [['PLAN', '1300', '#ffae3d'], ['ACT', String(s.act), red ? '#ff3b30' : s.act >= 1300 ? '#2ee06a' : '#ffae3d']];
  big.forEach(([k, v, col], i) => {
    const x = i * (w / 2) + 12;
    g.textAlign = 'left';
    g.fillStyle = '#8a9096'; g.font = 'bold 20px Arial, sans-serif';
    g.fillText(k, x, 50);
    g.fillStyle = col; g.font = 'bold 62px "Courier New", monospace';
    g.fillText(v, x + 70, 64);
  });
  g.fillStyle = '#1a1e22'; g.fillRect(0, 104, w, 2);
  g.textAlign = 'center'; g.fillStyle = '#ffae3d'; g.font = 'bold 30px "Courier New", monospace';
  g.fillText(`TAKT 42 s   OEE ${s.oee}%   JX-40`, w / 2, 134);
}
function Andon({ map }) {
  const A = map.ANDON;
  const phase = useStore((s) => s.phase);
  const countdownEnd = useStore((s) => s.countdownEnd);
  const event = useStore((s) => s.event);
  const stop = event?.id === 'server_overload';
  const goals = useRef(0);
  const state = useRef({ act: 1184, oee: 87, clock: '', stop: false, last: '' });
  const lights = useRef([]);
  const beacon = useRef();
  const beaconStop = useRef(false);
  const sirenAt = useRef(0);
  const board = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { c, tex, mat: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) };
  }, []);
  useEffect(() => on('fx', (fx) => {
    if (fx.type === 'goal') {
      goals.current++;
      if (A) audio.ding([m(A.x), m(2.5), 0], 0.5, 1568);
    }
  }), [A]);
  const lampMats = useMemo(() => ['#ff3b30', '#ffb020', '#2ee06a'].map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false })), []);
  const LAMP = useMemo(() => ['#ff3b30', '#ffb020', '#2ee06a'].map((c) => new THREE.Color(c)), []);
  useFree(board.tex, board.mat, lampMats);
  const acc = useRef(0);
  useFrame((_, dt) => {
    const now = Date.now();
    // stack light: race countdown, then steady green; red and flashing in a stop
    let lit = 2, level = 1; // which lamp (red, amber, green) and how bright
    if (phase === 'countdown' && countdownEnd > now) {
      const left = (countdownEnd - now) / 1000;
      lit = left > 2 ? 0 : left > 1 ? 1 : 2;
    }
    if (stop) { lit = 0; level = (now % 600) < 300 ? 1 : 0.15; }
    for (let i = 0; i < 3; i++) lampMats[i].color.copy(LAMP[i]).multiplyScalar((i === lit ? level : 0.08) * 1.6);
    if (beacon.current) {
      beacon.current.rotation.y += dt * (stop ? 9 : 4);
      // recolour only when the line's state changes, not every frame
      if (beaconStop.current !== stop) {
        beaconStop.current = stop;
        for (const c of beacon.current.children) c.material?.color?.set(stop ? '#ff3b30' : '#ffae3d');
      }
    }
    // the siren: a two-tone wail from the board while the line is stopped
    if (stop && A && now - sirenAt.current > 700) {
      sirenAt.current = now;
      audio.ding([m(A.x), m(2.5), 0], 0.45, (Math.floor(now / 700) % 2) ? 880 : 660);
    }
    acc.current += dt;
    if (acc.current < 0.5) return;
    acc.current = 0;
    const st = useStore.getState();
    const laps = Object.values(st.raceProgress || {}).reduce((a, p) => a + (Array.isArray(p) ? p[0] || 0 : 0), 0);
    const s = state.current;
    s.act = 1184 + laps + goals.current + Math.floor(LINE.t / 42) % 60;
    s.stop = stop;
    const d = new Date(now);
    s.clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const key = `${s.act}|${s.stop}|${s.clock}`;
    if (key === s.last) return;
    s.last = key;
    andonDraw(board.c.getContext('2d'), 512, 160, s);
    board.tex.needsUpdate = true;
  });
  const frame = useMemo(() => cached('andonFrame', () => {
    if (!A) return {};
    const k = new Kit();
    const span = m(A.span);
    k.box('paint', C.yellow, m(0.2), m(0.25), span + m(0.25), [0, m(2.53), 0]);
    k.box('paint', '#16181a', m(0.12), m(0.9), m(3.1), [0, m(1.75), 0]);
    for (const s of [-1, 1]) k.box('metal', C.steel, m(0.03), m(0.2), m(0.03), [0, m(2.3), s * m(1.2)]);
    // the stack light's column on the north leg
    k.cyl('paint', C.joint, m(0.025), m(0.025), m(0.2), [0, m(2.75), span / 2 - m(0.1)]);
    return k.build();
  }), [A]);
  if (!A) return null;
  return (
    <group position={[m(A.x), 0, m(A.z)]}>
      <KitMeshes geo={frame} receive={false} />
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * m(0.065), m(1.75), 0]} rotation-y={s > 0 ? Math.PI / 2 : -Math.PI / 2} material={board.mat}>
          <planeGeometry args={[m(2.9), m(0.8)]} />
        </mesh>
      ))}
      {lampMats.map((mm, i) => (
        <mesh key={i} ref={(r) => { lights.current[i] = r; }} position={[0, m(2.9) + (2 - i) * m(0.11), m(A.span) / 2 - m(0.1)]} material={mm}>
          <cylinderGeometry args={[m(0.06), m(0.06), m(0.1), 14]} />
        </mesh>
      ))}
      <group ref={beacon} position={[0, m(2.72), -m(A.span) / 2 + m(0.2)]}>
        <mesh>
          <cylinderGeometry args={[m(0.06), m(0.07), m(0.12), 14]} />
          <meshBasicMaterial color="#ffae3d" toneMapped={false} />
        </mesh>
        <mesh position={[m(0.08), 0, 0]} rotation-z={Math.PI / 2}>
          <coneGeometry args={[m(0.09), m(0.12), 12, 1, true]} />
          <meshBasicMaterial color="#ffae3d" toneMapped={false} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// "214 DAYS WITHOUT A LOST-TIME INCIDENT" — until someone has a big crash.
function SafetyBoard({ map }) {
  const S = map.SAFETY;
  const days = useRef(214);
  const board = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { c, tex, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }) };
  }, []);
  useFree(board.tex, board.mat);
  const draw = () => {
    const g = board.c.getContext('2d');
    g.fillStyle = '#1d6b3a'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffffff'; g.fillRect(10, 10, 492, 236);
    g.fillStyle = '#1d6b3a'; g.fillRect(16, 16, 480, 52);
    g.fillStyle = '#ffffff'; g.font = 'bold 34px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SAFETY FIRST · WERK 2', 256, 43);
    g.fillStyle = '#16181a'; g.fillRect(150, 82, 212, 100);
    g.fillStyle = days.current === 0 ? '#ff3b30' : '#ffae3d';
    g.font = 'bold 92px "Courier New", monospace';
    g.fillText(String(days.current).padStart(3, '0'), 256, 134);
    g.fillStyle = '#16181a'; g.font = 'bold 28px "Arial Narrow", Arial, sans-serif';
    g.fillText('DAYS WITHOUT A LOST-TIME INCIDENT', 256, 214);
    board.tex.needsUpdate = true;
  };
  useEffect(() => {
    draw();
    return on('fx', (fx) => {
      // a big crash anywhere on the floor resets the count
      if (fx.type === 'bump' && fx.kind === 'hit' && fx.rel > 22 && days.current !== 0) { days.current = 0; draw(); }
    });
  }, []);
  if (!S) return null;
  return (
    <mesh position={[m(S.at[0]), m(S.at[1]), m(S.at[2])]} rotation-y={S.rotY || 0} material={board.mat}>
      <planeGeometry args={[m(1.1), m(0.55)]} />
    </mesh>
  );
}

// Strip curtains in the lab doorways: PVC strips you drive through.
function Curtains({ map }) {
  const geo = useMemo(() => {
    const k = new Kit();
    for (const [x, z, w, rot] of map.CURTAINS || []) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const n = Math.round(w / 0.2);
      for (let i = 0; i < n; i++) {
        const o = m(-w / 2 + (i + 0.5) * (w / n));
        k.add('film', new THREE.PlaneGeometry(m(0.19), m(2.1)), '#cfe6ee', [m(x) + o * c, m(1.15), m(z) - o * s], [0, rot + (i % 2 ? 0.04 : -0.04), 0]);
      }
      k.box('paint', C.steel, m(w + 0.1), m(0.05), m(0.05), [m(x), m(2.22), m(z)], [0, rot, 0]);
    }
    return k.parts.size ? k.build() : {};
  }, [map]);
  useFree(geo);
  return (
    <group>
      {Object.entries(geo).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} />)}
    </group>
  );
}

// The rest of what makes the floor go: LED bars and cable reels over the
// robot cells, and the sounds of the place — PA chimes, an air line.
function Shopfloor() {
  const nextPa = useRef(0);
  const geo = useMemo(() => cached('shopfloor', () => {
    const k = new Kit();
    // LED task bars over the robot cells, on drop rods
    for (const x of [-2.2, 4.2, -5.4, 1.0]) {
      const z = x === -5.4 || x === 1.0 ? 10.6 : 7.4;
      k.box('paint', '#d5d9dc', m(1.6), m(0.06), m(0.12), [m(x), m(2.6), m(z)]);
      k.box('glow', '#f2f6ff', m(1.5), m(0.01), m(0.08), [m(x), m(2.568), m(z)]);
      for (const e of [-0.7, 0.7]) k.box('metal', C.steel, m(0.015), m(4.2), m(0.015), [m(x + e), m(4.7), m(z)]);
      // a cable reel hanging over the cell, the cable coiling down
      k.cyl('paint', C.yellow, m(0.18), m(0.18), m(0.12), [m(x + 0.9), m(4.2), m(z)], [Math.PI / 2, 0, 0], 16);
      k.cyl('matte', C.black, m(0.012), m(0.012), m(1.6), [m(x + 0.9), m(3.3), m(z)], [0, 0, 0], 6);
      k.box('paint', C.joint, m(0.1), m(0.14), m(0.06), [m(x + 0.9), m(2.45), m(z)]);
      // the cell's stack light pole (the lamps are instanced below)
      const sx = x === -5.4 || x === 1.0 ? x + 0.6 : x - 1.55, sz = x === -5.4 || x === 1.0 ? 11.6 : 6.1;
      k.post('paint', C.joint, m(0.03), m(0.03), m(sx), m(1.2), m(1.68), m(sz));
      k.cyl('paint', C.joint, m(0.045), m(0.045), m(0.03), [m(sx), m(1.99), m(sz)], [0, 0, 0], 12);
    }
    return k.build();
  }), []);
  // stack lights on each robot cell: green while it works, amber while a
  // big arm is swinging across the transfer belt (your warning), red when
  // the line stops. One instanced mesh, colours per frame.
  const lamps = useRef();
  const cells = useMemo(() => [[-2.2, 'S'], [4.2, 'S'], [-5.4, 'N'], [1.0, 'N']].map(([x, side]) => ({
    x: m(side === 'S' ? x - 1.55 : x + 0.6), z: m(side === 'S' ? 6.1 : 11.6), side,
  })), []);
  useLayoutEffect(() => {
    cells.forEach((c, i) => {
      for (let j = 0; j < 3; j++) {
        _o.position.set(c.x, m(1.72) + j * m(0.09), c.z);
        _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
        lamps.current.setMatrixAt(i * 3 + j, _o.matrix);
      }
    });
    lamps.current.instanceMatrix.needsUpdate = true;
  }, [cells]);
  useFrame(() => {
    const t = shopTime();
    if (lamps.current) {
      const tau = cyclePhase(LINE.t);
      const swinging = (tau > 1.1 && tau < 2.2) || tau > 2.8 || tau < -1.1;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const state = LINE.stopped ? 0 : c.side === 'S' && swinging ? 1 : 2; // red, amber, green
        const blink = LINE.stopped ? ((t * 2) % 1 < 0.5 ? 1 : 0.15) : 1;
        for (let j = 0; j < 3; j++) {
          lamps.current.setColorAt(i * 3 + j, _col.copy(LAMPS[2 - j]).multiplyScalar(j === 2 - state ? 1.8 * blink : 0.1));
        }
      }
      lamps.current.instanceColor.needsUpdate = true;
    }
    // PA chime, every 45 s of shop time, heard across the hall
    const slot = Math.floor(t / 45);
    if (slot !== nextPa.current) {
      if (nextPa.current !== 0) {
        audio.ding([0, m(5), 0], 0.35, 1046);
        setTimeout(() => audio.ding([0, m(5), 0], 0.35, 784), 380);
      }
      nextPa.current = slot;
    }
  });
  return (
    <group>
      {Object.entries(geo).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} />)}
      <instancedMesh ref={lamps} args={[null, null, cells.length * 3]} frustumCulled={false}>
        <cylinderGeometry args={[m(0.04), m(0.04), m(0.085), 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ------------------------------------------------------------ wall styles
// Colliders stay in Office.jsx; these draw the walls.

// Welded mesh guarding: yellow posts every ~1.5 m, a black kick plate, the
// mesh panel between (100 mm squares, world-scaled so every panel matches).
function MeshFence({ walls }) {
  const { steel, panels } = useMemo(() => {
    const k = new Kit();
    const pl = [];
    for (const w of walls) {
      const along = w.w >= w.d;
      const len = along ? w.w : w.d, h = w.h;
      const rot = along ? 0 : Math.PI / 2;
      const n = Math.max(1, Math.round(len / m(1.5)));
      const c = Math.cos(rot), s = Math.sin(rot);
      for (let i = 0; i <= n; i++) {
        const o = -len / 2 + (i * len) / n;
        k.post('paint', C.yellow, m(0.06), m(0.06), w.x + o * c, 0, h, w.z - o * s);
        k.box('paint', C.yellow, m(0.12), m(0.01), m(0.12), [w.x + o * c, m(0.005), w.z - o * s]);
      }
      k.box('paint', C.yellow, len, m(0.04), m(0.04), [w.x, h - m(0.02), w.z], [0, rot, 0]);
      k.box('paint', C.black, len, m(0.2), m(0.02), [w.x, m(0.1), w.z], [0, rot, 0]);
      const g = worldPlane(len, h - m(0.24), m(0.05));
      _eul.set(0, rot, 0); _quat.setFromEuler(_eul);
      g.applyMatrix4(_mat4.compose(_pos.set(w.x, m(0.2) + (h - m(0.24)) / 2, w.z), _quat, _scl.set(1, 1, 1)));
      pl.push(g);
    }
    return { steel: k.build(), panels: mergeGeometries(pl) };
  }, [walls]);
  useFree(steel, panels);
  return (
    <group>
      <KitMeshes geo={steel} />
      <mesh geometry={panels} material={matFor('mesh')} />
    </group>
  );
}

// knee-high yellow steel barrier (under the bridge)
function GuardRail({ walls }) {
  const geo = useMemo(() => {
    const k = new Kit();
    for (const w of walls) {
      const along = w.w >= w.d, len = along ? w.w : w.d, rot = along ? 0 : Math.PI / 2;
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const e of [-1, 1]) k.post('paint', C.yellow, m(0.08), m(0.08), w.x + e * (len / 2 - m(0.05)) * c, 0, w.h, w.z - e * (len / 2 - m(0.05)) * s);
      for (const y of [0.25, 0.5]) k.box('paint', C.yellow, len, m(0.08), m(0.06), [w.x, m(y), w.z], [0, rot, 0]);
      k.box('paint', C.black, len, m(0.08), m(0.065), [w.x, m(0.375), w.z], [0, rot, 0]);
    }
    return k.build();
  }, [walls]);
  useFree(geo);
  return <group><KitMeshes geo={geo} receive={false} /></group>;
}

// steel columns: an I-section, a black and yellow wrap at the foot
function Columns({ walls }) {
  const { steel, wrap } = useMemo(() => {
    const k = new Kit();
    const wl = [];
    for (const w of walls) {
      const s = Math.min(w.w, w.d);
      if (w.h < m(4)) {
        // a portal leg: yellow box section on a base plate
        k.box('paint', C.yellow, s, w.h, s, [w.x, w.h / 2, w.z]);
        k.box('paint', C.joint, s * 1.6, m(0.03), s * 1.6, [w.x, m(0.015), w.z]);
        continue;
      }
      k.box('paint', '#9ea7ae', s, w.h, s * 0.18, [w.x, w.h / 2, w.z - s * 0.41]);
      k.box('paint', '#9ea7ae', s, w.h, s * 0.18, [w.x, w.h / 2, w.z + s * 0.41]);
      k.box('paint', '#9ea7ae', s * 0.16, w.h, s, [w.x, w.h / 2, w.z]);
      k.box('paint', C.joint, s * 1.4, m(0.02), s * 1.4, [w.x, m(0.01), w.z]);
      const g = new THREE.CylinderGeometry(s * 0.78, s * 0.78, m(1.2), 4, 1, true);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4 * (s * 1.1) / m(0.3), uv.getY(i) * m(1.2) / m(0.3));
      g.rotateY(Math.PI / 4);
      g.translate(w.x, m(0.6), w.z);
      wl.push(g);
    }
    return { steel: k.build(), wrap: mergeGeometries(wl) };
  }, [walls]);
  useFree(steel, wrap);
  return (
    <group>
      <KitMeshes geo={steel} />
      <mesh geometry={wrap} material={matFor('hazard')} castShadow />
    </group>
  );
}

// A dock door in an outer wall: a sectional door rolled up to 1.6 m, a
// yellow safety gate across the opening, and the yard in daylight beyond.
// The wall collider is still there; this is what it looks like.
// the yard under the doors, by the hour: morning sun comes in from the
// south, golden hour from the west, the night yard is sodium-lit
const YARD = { morning: '#fff3dc', afternoon: '#f2f6fb', golden: '#ffb870', night: '#3a3350' };
function DockDoors({ walls }) {
  const hour = useStore((s) => s.timeOfDay);
  const outsideMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f2f6fb', toneMapped: false, fog: false }), []);
  useEffect(() => { outsideMat.color.set(YARD[hour] || YARD.afternoon); }, [hour, outsideMat]);
  const { geo, outside } = useMemo(() => {
    const k = new Kit();
    const ol = [];
    for (const w of walls) {
      const along = w.w >= w.d, len = along ? w.w : w.d;
      // outward normal: away from the middle of the floor
      const nx = along ? 0 : Math.sign(w.x), nz = along ? Math.sign(w.z) : 0;
      const rot = along ? 0 : Math.PI / 2;
      const c = Math.cos(rot), s = Math.sin(rot);
      const OPEN = m(3.2), LEAF = m(1.6);
      const inner = (d) => [w.x - nx * d, w.z - nz * d];
      // the wall above the opening
      k.box('matte', C.wall, along ? len : w.w, w.h - OPEN, along ? w.d : len, [w.x, OPEN + (w.h - OPEN) / 2, w.z]);
      // the door leaf, raised: panels with a window row
      const [lx, lz] = inner(m(0.02));
      for (let i = 0; i < 3; i++) {
        const y = LEAF + m(0.27) + i * m(0.53);
        k.box('paint', i === 1 ? '#8fa0ad' : '#dfe3e6', len - m(0.1), m(0.5), m(0.05), [lx, y, lz], [0, rot, 0]);
      }
      // the frame: black dock seals, yellow-black jambs
      for (const e of [-1, 1]) {
        const [jx, jz] = [w.x + e * (len / 2 - m(0.08)) * c - nx * m(0.08), w.z - e * (len / 2 - m(0.08)) * s - nz * m(0.08)];
        k.box('matte', C.rubber, m(0.16), OPEN, m(0.16), [jx, OPEN / 2, jz], [0, rot, 0]);
        k.box('paint', C.yellow, m(0.18), m(0.9), m(0.18), [jx - nx * m(0.02), m(0.45), jz - nz * m(0.02)], [0, rot, 0]);
      }
      // the safety gate across the bottom: posts and bars
      const [gx, gz] = inner(m(0.12));
      k.box('paint', C.yellow, len - m(0.3), m(0.06), m(0.06), [gx, m(1.1), gz], [0, rot, 0]);
      k.box('paint', C.yellow, len - m(0.3), m(0.06), m(0.06), [gx, m(0.35), gz], [0, rot, 0]);
      for (let o = -len / 2 + m(0.3); o <= len / 2 - m(0.25); o += m(0.14)) {
        k.box('paint', o % m(0.56) < m(0.14) ? C.black : C.yellow, m(0.025), m(1.05), m(0.025), [gx + o * c, m(0.58), gz - o * s]);
      }
      // the dock leveller plate on the floor inside, and its lip
      const [px, pz] = inner(m(0.9));
      k.box('metal', '#6f777e', len - m(0.3), m(0.02), m(1.6), [px, m(0.01), pz], [0, rot, 0]);
      // the yard outside: a lit backdrop, a trailer's tail lights
      const [ox, oz] = [w.x + nx * m(0.6), w.z + nz * m(0.6)];
      const g = new THREE.PlaneGeometry(len, LEAF);
      g.rotateY(rot + (nx < 0 || nz < 0 ? 0 : Math.PI));
      g.translate(ox, LEAF / 2, oz);
      ol.push(g);
      k.box('matte', '#3a3f45', len, m(0.1), m(1.2), [w.x + nx * m(0.3), -m(0.04), w.z + nz * m(0.3)], [0, rot, 0]);
    }
    return { geo: k.build(), outside: mergeGeometries(ol) };
  }, [walls]);
  useFree(geo, outside, outsideMat);
  return (
    <group>
      <KitMeshes geo={geo} />
      <mesh geometry={outside} material={outsideMat} />
    </group>
  );
}

// Glazed partitions (the labs): aluminium framing every 1.2 m, a grey kick
// panel at car height, one pane — the whole building's glass in two draws.
function GlassWalls({ walls }) {
  const { frame, glass } = useMemo(() => {
    const k = new Kit();
    const gl = [];
    for (const w of walls) {
      const along = w.w >= w.d, len = along ? w.w : w.d, rot = along ? 0 : Math.PI / 2;
      const c = Math.cos(rot), s = Math.sin(rot);
      const n = Math.max(1, Math.round(len / m(1.2)));
      for (let i = 0; i <= n; i++) {
        const o = -len / 2 + (i * len) / n;
        k.post('paint', '#aeb4ba', m(0.05), m(0.08), w.x + o * c, 0, w.h, w.z - o * s);
      }
      k.box('paint', '#6f777e', len, m(0.3), m(0.06), [w.x, m(0.15), w.z], [0, rot, 0]);
      k.box('paint', '#aeb4ba', len, m(0.06), m(0.1), [w.x, w.h - m(0.03), w.z], [0, rot, 0]);
      k.box('paint', '#aeb4ba', len, m(0.04), m(0.07), [w.x, m(0.32), w.z], [0, rot, 0]);
      // the frosted manifestation band, so nobody walks into it
      k.box('paint', '#e8eef2', len, m(0.05), m(0.02), [w.x, m(1.05), w.z], [0, rot, 0]);
      const g = new THREE.PlaneGeometry(len, w.h - m(0.36));
      g.rotateY(rot);
      g.translate(w.x, m(0.34) + (w.h - m(0.36)) / 2, w.z);
      gl.push(g);
    }
    return { frame: k.build(), glass: mergeGeometries(gl) };
  }, [walls]);
  useFree(frame, glass);
  return (
    <group>
      <KitMeshes geo={frame} />
      <mesh geometry={glass} material={matFor('pane')} />
    </group>
  );
}

export const WALL_STYLES = {
  factory_glass: GlassWalls,
  factory_mesh: MeshFence,
  factory_guard: GuardRail,
  factory_column: Columns,
  factory_dockdoor: DockDoors,
};

// ----------------------------------------------------------- ramp skins
// Drawn in the ramp's frame: rising toward +z, foot at −l/2, top at +l/2.
function wedge(l, w, rise) {
  const x0 = -w / 2, x1 = w / 2, z0 = -l / 2, z1 = l / 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1, x0, rise, z1, x1, rise, z1], 3));
  g.setIndex([0, 5, 1, 0, 4, 5, 3, 2, 5, 3, 5, 4, 0, 1, 2, 0, 2, 3, 0, 3, 4, 1, 5, 2]);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

// The solid under a ramp's deck, as a collider (a skin renders inside the
// ramp's body, so this joins it): without it a car coming the other way
// slides under the deck and wedges itself where it meets the floor.
function WedgeCollider({ r }) {
  const pts = useMemo(() => {
    const w = r.w * 0.45, l = r.l / 2, h = r.rise * 0.94;
    return new Float32Array([-w, 0, -l, w, 0, -l, -w, 0, l, w, 0, l, -w, h, l - m(0.02), w, h, l - m(0.02)]);
  }, [r]);
  return <ConvexHullCollider args={[pts]} />;
}

const checkerTex = () => once('checker', () => {
  const t = canvas(64, 64, (g, w, h) => {
    g.fillStyle = '#8e969d'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        g.save(); g.translate(x * 16 + 8, y * 16 + 8); g.rotate(((x + y) % 2 ? 1 : -1) * 0.785);
        g.fillStyle = '#b8bec3'; g.fillRect(-6, -1.5, 12, 3);
        g.fillStyle = '#5d646a'; g.fillRect(-6, 1.5, 12, 1);
        g.restore();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});

// checker plate on a steel wedge, yellow edges
function PlateRamp({ r, len, angle }) {
  const geo = useMemo(() => {
    const k = new Kit();
    k.add('metal', wedge(r.l, r.w * 0.96, r.rise - m(0.02)), '#6f777e');
    for (const s of [-1, 1]) {
      k.box('paint', C.yellow, m(0.04), m(0.04), len, [s * (r.w / 2 - m(0.02)), r.rise / 2 + m(0.03), 0], [-angle, 0, 0]);
    }
    k.box('paint', C.yellow, r.w, m(0.02), m(0.06), [0, m(0.01), -r.l / 2 + m(0.03)]);
    return k.build();
  }, [r, len, angle]);
  const deck = useMemo(() => worldPlane(r.w * 0.92, len, m(0.2)), [r.w, len]);
  useFree(geo, deck);
  const mat = useMemo(() => once('plateMat', () => new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.4, metalness: 0.7 })), []);
  return (
    <group>
      <WedgeCollider r={r} />
      <KitMeshes geo={geo} />
      <mesh geometry={deck} material={mat} position={[0, r.rise / 2 + m(0.012), 0]} rotation-x={-Math.PI / 2 - angle} receiveShadow />
    </group>
  );
}

// the feed ramp: an inclined belt conveyor on legs, same green belt
function FeedRamp({ r, len, angle }) {
  const geo = useMemo(() => {
    const k = new Kit();
    for (const s of [-1, 1]) {
      k.box('metal', C.frame, m(0.04), m(0.2), len, [s * (r.w / 2 - m(0.02)), r.rise / 2 - m(0.08), 0], [-angle, 0, 0]);
      k.box('paint', C.yellow, RAIL_T, RAIL_H, len, [s * (r.w / 2 - RAIL_T / 2), r.rise / 2 + RAIL_H / 2, 0], [-angle, 0, 0]);
      for (const f of [0.2, 0.55, 0.9]) {
        const zz = -r.l / 2 + f * r.l, top = f * r.rise - m(0.18);
        if (top > m(0.05)) k.post('metal', C.galv, m(0.05), m(0.05), s * (r.w / 2 - m(0.05)), 0, top, zz);
      }
    }
    k.box('paint', C.yellow, r.w, m(0.03), m(0.1), [0, m(0.015), -r.l / 2 + m(0.05)]);
    // the nose roller at the foot
    k.cyl('metal', C.galv, m(0.05), m(0.05), r.w - m(0.06), [0, m(0.05), -r.l / 2 + m(0.05)], [0, 0, Math.PI / 2], 12);
    return k.build();
  }, [r, len, angle]);
  const belt = useMemo(() => {
    const g = beltQuad(len, r.w - RAIL_T * 2);
    g.rotateY(-Math.PI / 2); // run the belt's length along z
    return g;
  }, [len, r.w]);
  useFree(geo, belt);
  return (
    <group>
      <KitMeshes geo={geo} />
      <mesh geometry={belt} material={BELTS.transfer.mat()} position={[0, r.rise / 2 + m(0.004), 0]} rotation-x={-angle} receiveShadow />
    </group>
  );
}

// the gravity roller chute: rollers across a steel frame
function RollerChute({ r, len, angle }) {
  const geo = useMemo(() => {
    const k = new Kit();
    k.add('metal', wedge(r.l, r.w * 0.9, Math.max(m(0.01), r.rise - m(0.06))), C.steel);
    for (const s of [-1, 1]) k.box('paint', C.yellow, m(0.04), m(0.1), len, [s * (r.w / 2 - m(0.02)), r.rise / 2 + m(0.02), 0], [-angle, 0, 0]);
    const n = Math.floor(len / m(0.1));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      k.cyl('metal', C.galv, m(0.024), m(0.024), r.w - m(0.08), [0, f * r.rise, -r.l / 2 + f * r.l], [0, 0, Math.PI / 2], 8);
    }
    return k.build();
  }, [r, len, angle]);
  useFree(geo);
  return <group><WedgeCollider r={r} /><KitMeshes geo={geo} /></group>;
}

// a kicker knocked together from what was lying around: pallets stacked
// into a rough wedge, a plywood sheet on top, tape on the leading edge
function PalletRamp({ r, len, angle }) {
  const geo = useMemo(() => {
    const k = new Kit();
    const n = Math.max(1, Math.floor(r.rise / m(0.15)));
    for (let i = 0; i < n; i++) {
      // each layer stops where the deck comes down to its top, so the stack
      // steps back under the plank instead of poking through it
      const ll = r.l * (1 - Math.min(0.95, ((i + 1) * m(0.15)) / r.rise));
      const zc = r.l / 2 - ll / 2;
      for (const lz of [-0.4, 0, 0.4]) k.box('matte', '#8f6f47', r.w * 0.96, m(0.1), m(0.09), [0, i * m(0.15) + m(0.05), zc + lz * ll]);
      for (let j = -2; j <= 2; j++) k.box('matte', C.wood, r.w * 0.16, m(0.025), ll, [j * r.w * 0.2, i * m(0.15) + m(0.137), zc]);
    }
    k.box('paint', C.yellow, r.w, m(0.02), m(0.05), [0, m(0.01), -r.l / 2 + m(0.03)]);
    return k.build();
  }, [r]);
  useFree(geo);
  return (
    <group>
      <WedgeCollider r={r} />
      <KitMeshes geo={geo} />
      <mesh position={[0, r.rise / 2 + m(0.012), 0]} rotation-x={-angle} castShadow receiveShadow>
        <boxGeometry args={[r.w, m(0.02), len]} />
        <meshStandardMaterial color="#bf9760" roughness={0.85} />
      </mesh>
    </group>
  );
}

export const RAMP_SKINS = {
  factory_pallets: PalletRamp,
  factory_plate: PlateRamp,
  factory_feed: FeedRamp,
  factory_rollers: RollerChute,
};

// ------------------------------------------------------------ the AGV
// The cleaning-robot event, reskinned: an automated cart with a lidar, a
// blue warning spot on the floor ahead and a rack of totes. Its position is
// driven for it (and the group it sits in spins); this faces it along its
// direction of travel instead.
export function Robot() {
  const inner = useRef();
  // its blue floor light is the pooled event light (eventLight.jsx)
  const glow = useEventLight('#3d7bff', 4, m(4));
  const last = useRef(null);
  const heading = useRef(0);
  const lidar = useRef();
  const geo = useMemo(() => cached('agv', () => {
    const k = new Kit();
    k.box('paint', C.orange, m(0.6), m(0.22), m(0.9), [0, m(0.14), 0]);
    k.box('paint', C.joint, m(0.62), m(0.06), m(0.92), [0, m(0.04), 0]);
    k.box('paint', C.yellow, m(0.61), m(0.05), m(0.05), [0, m(0.2), m(0.45)]);
    k.box('paint', C.black, m(0.61), m(0.05), m(0.05), [0, m(0.2), -m(0.45)]);
    // a tote rack on top, totes in it
    for (const s of [-1, 1]) for (const e of [-1, 1]) k.post('metal', C.galv, m(0.03), m(0.03), s * m(0.26), m(0.25), m(0.75), e * m(0.4));
    for (const y of [0.3, 0.55]) {
      k.box('metal', C.galv, m(0.56), m(0.02), m(0.84), [0, m(y), 0]);
      k.box('paint', y > 0.4 ? C.brand : C.red, m(0.5), m(0.18), m(0.36), [0, m(y + 0.1), m(0.2)]);
      k.box('paint', C.brand, m(0.5), m(0.18), m(0.36), [0, m(y + 0.1), -m(0.2)]);
    }
    k.box('glow', '#4fa3ff', m(0.5), m(0.02), m(0.02), [0, m(0.23), m(0.46)]);
    return k.build();
  }), []);
  useFrame(({ clock }) => {
    const g = inner.current;
    if (!g || !g.parent) return;
    const p = g.parent.position;
    if (last.current) {
      const dx = p.x - last.current.x, dz = p.z - last.current.z;
      if (dx * dx + dz * dz > 1e-5) heading.current = Math.atan2(dx, dz);
      last.current.set(p.x, p.y, p.z);
    } else last.current = p.clone();
    g.rotation.y = heading.current - g.parent.rotation.y;
    if (lidar.current) lidar.current.rotation.y = clock.elapsedTime * 8;
    const L = glow(g.parent.visible); // only while the robot is out
    if (L) L.position.set(0, m(0.5), m(0.6)).applyMatrix4(g.matrixWorld);
  });
  const spot = useMemo(() => new THREE.MeshBasicMaterial({
    map: glowTex(), color: '#3d7bff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  }), []);
  useFree(spot);
  return (
    <group ref={inner}>
      <KitMeshes geo={geo} receive={false} />
      <mesh ref={lidar} position={[0, m(0.8), m(0.3)]}>
        <cylinderGeometry args={[m(0.05), m(0.05), m(0.06), 12]} />
        <meshStandardMaterial color="#1c1d1f" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.03, m(1.4)]} rotation-x={-Math.PI / 2} material={spot}>
        <circleGeometry args={[m(0.4), 20]} />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------------------- props
// The factory's own loose objects. One merged, vertex-coloured mesh each
// (the carton uses the carton print), so a hall full of them stays cheap.
function propGeo(key, build) {
  return cached(`prop${key}`, () => {
    const k = new Kit();
    build(k);
    const b = k.build();
    return b;
  });
}
function PropMeshes({ geo }) {
  return Object.entries(geo).map(([k, g]) => <mesh key={k} geometry={g} material={matFor(k)} castShadow receiveShadow />);
}

const Carton = ({ p }) => {
  const geo = propGeo('carton', (k) => k.box('carton', '#ffffff', m(0.48), m(0.44), m(0.48), [0, 0, 0]));
  return (
    <Body p={p} mass={1.6} friction={0.9}>
      <CuboidCollider args={[m(0.24), m(0.22), m(0.24)]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

const Printer = ({ p }) => {
  const geo = propGeo('printer', (k) => {
    k.box('paint', C.printer, m(0.45), m(0.22), m(0.36), [0, 0, 0]);
    k.box('paint', C.printerDark, m(0.45), m(0.04), m(0.36), [0, m(0.13), 0]);
    k.box('paint', C.printerDark, m(0.3), m(0.02), m(0.16), [0, m(0.05), m(0.18)], [0.5, 0, 0]);
    k.box('paint', C.brand, m(0.12), m(0.02), m(0.005), [m(0.12), m(0.07), m(0.181)]);
    k.box('paint', '#2ee06a', m(0.015), m(0.015), m(0.005), [m(0.19), m(0.07), m(0.182)]);
  });
  return (
    <Body p={p} mass={2.4} friction={0.8}>
      <CuboidCollider args={[m(0.225), m(0.13), m(0.18)]} position={[0, m(0.02), 0]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

const Toner = ({ p }) => {
  const geo = propGeo('toner', (k) => {
    k.box('paint', C.printerDark, m(0.34), m(0.08), m(0.1), [0, 0, 0]);
    k.box('paint', C.brand, m(0.1), m(0.081), m(0.101), [m(0.1), 0, 0]);
    k.box('paint', '#f07a1a', m(0.02), m(0.03), m(0.06), [m(-0.17), m(0.02), 0]);
  });
  return (
    <Body p={p} mass={0.5} friction={0.8}>
      <CuboidCollider args={[m(0.17), m(0.04), m(0.05)]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

const Cone = ({ p }) => {
  const geo = propGeo('cone', (k) => {
    k.box('matte', '#1c1d1f', m(0.3), m(0.03), m(0.3), [0, m(-0.2), 0]);
    k.cyl('paint', '#ff6a1a', m(0.025), m(0.12), m(0.42), [0, m(0.02), 0], [0, 0, 0], 14);
    k.cyl('paint', '#f4f4f0', m(0.068), m(0.09), m(0.08), [0, m(0.03), 0], [0, 0, 0], 14);
  });
  return (
    <Body p={p} mass={0.4} friction={0.9} angularDamping={0.3}>
      <CuboidCollider args={[m(0.15), m(0.015), m(0.15)]} position={[0, m(-0.2), 0]} />
      <CylinderCollider args={[m(0.2), m(0.07)]} position={[0, m(0.02), 0]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

const Tote = ({ p }) => {
  const geo = propGeo('tote', (k) => {
    k.box('paint', C.brand, m(0.4), m(0.03), m(0.3), [0, m(-0.1), 0]);
    for (const s of [-1, 1]) {
      k.box('paint', C.brand, m(0.4), m(0.22), m(0.02), [0, 0, s * m(0.14)]);
      k.box('paint', C.brand, m(0.02), m(0.22), m(0.3), [s * m(0.19), 0, 0]);
    }
    k.box('paint', '#f4f4f0', m(0.12), m(0.06), m(0.004), [0, m(0.02), m(0.152)]);
  });
  return (
    <Body p={p} mass={0.8} friction={0.8}>
      <CuboidCollider args={[m(0.2), m(0.11), m(0.15)]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

const Reel = ({ p }) => {
  const geo = propGeo('reel', (k) => {
    for (const s of [-1, 1]) k.cyl('matte', '#b08a5a', m(0.25), m(0.25), m(0.03), [0, 0, s * m(0.13)], [Math.PI / 2, 0, 0], 20);
    k.cyl('matte', '#1c1d1f', m(0.17), m(0.17), m(0.23), [0, 0, 0], [Math.PI / 2, 0, 0], 20);
    k.cyl('matte', '#8f6f47', m(0.05), m(0.05), m(0.3), [0, 0, 0], [Math.PI / 2, 0, 0], 10);
  });
  return (
    <Body p={p} mass={2} friction={0.7} angularDamping={0.05}>
      <CylinderCollider args={[m(0.145), m(0.25)]} rotation-x={Math.PI / 2} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

// a hand pallet jack: heavy, it takes some shoving
const Jack = ({ p }) => {
  const geo = propGeo('jack', (k) => {
    for (const s of [-1, 1]) k.box('paint', '#d8322a', m(1.15), m(0.06), m(0.16), [m(0.1), m(-0.05), s * m(0.19)]);
    k.box('paint', '#d8322a', m(0.25), m(0.2), m(0.56), [m(-0.55), m(0.02), 0]);
    k.box('metal', C.steel, m(0.05), m(0.9), m(0.05), [m(-0.72), m(0.45), 0], [0, 0, 0.35]);
    k.box('matte', C.black, m(0.06), m(0.04), m(0.28), [m(-0.88), m(0.88), 0]);
    k.cyl('matte', C.black, m(0.08), m(0.08), m(0.1), [m(-0.55), m(-0.08), 0], [Math.PI / 2, 0, 0], 12);
  });
  return (
    <Body p={p} mass={9} friction={0.6}>
      <CuboidCollider args={[m(0.6), m(0.05), m(0.28)]} />
      <CuboidCollider args={[m(0.13), m(0.12), m(0.28)]} position={[m(-0.55), m(0.04), 0]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

const Helmet = ({ p }) => {
  const geo = propGeo('helmet', (k) => {
    k.add('paint', new THREE.SphereGeometry(m(0.12), 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.yellow, [0, m(-0.04), 0]);
    k.cyl('paint', C.yellow, m(0.15), m(0.15), m(0.012), [0, m(-0.04), m(0.02)], [0, 0, 0], 16);
  });
  return (
    <Body p={p} mass={0.3} friction={0.6}>
      <CylinderCollider args={[m(0.06), m(0.13)]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

// a canteen stacking chair: a plastic shell on a steel frame
const Stool = ({ p }) => {
  const geo = propGeo('stool', (k) => {
    k.box('paint', '#f07a1a', m(0.4), m(0.03), m(0.38), [0, m(0.02), 0]);
    k.box('paint', '#f07a1a', m(0.4), m(0.34), m(0.03), [0, m(0.2), m(-0.18)], [-0.12, 0, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('paint', '#9aa0a6', m(0.02), m(0.44), m(0.02), [sx * m(0.18), m(-0.22), sz * m(0.16)]);
  });
  return (
    <Body p={p} mass={0.9} friction={0.7}>
      <CuboidCollider args={[m(0.2), m(0.22), m(0.19)]} position={[0, m(-0.2), 0]} />
      <CuboidCollider args={[m(0.2), m(0.17), m(0.02)]} position={[0, m(0.2), m(-0.18)]} />
      <PropMeshes geo={geo} />
    </Body>
  );
};

export const PROPS = {
  factory_stool: Stool,
  factory_carton: Carton,
  factory_printer: Printer,
  factory_toner: Toner,
  factory_cone: Cone,
  factory_tote: Tote,
  factory_reel: Reel,
  factory_jack: Jack,
  factory_helmet: Helmet,
};
