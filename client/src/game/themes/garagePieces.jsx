// Garage Zero's furniture (the map's FURNITURE entries with garage_ types).
// Each piece is a static body with its own colliders; its look is a kit
// (garageKit.js) merged into a few meshes, built once per size and cached.
// A piece faces +z in its own frame; `face` (or rotY) turns it, and w/d in
// the map are always the world x/z extents.
import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M } from '@rc/shared';
import { kit, cached, slotMat, NO_SHADOW, canvasTex, tvTex, rng } from './garageKit.js';
import { buildCar, carColliders, CAR } from './garageCar.js';
import { audio } from '../../audio.js';

// ----------------------------------------------------------------- helpers
const yawOf = (f) => f.face ?? f.rotY ?? 0;
function dims(f) {
  const q = Math.abs(Math.sin(yawOf(f))) > 0.7;
  return { L: (q ? f.d : f.w) / M, D: (q ? f.w : f.d) / M, H: f.h / M };
}

export function KitMeshes({ geos, shadow = true }) {
  return Object.entries(geos).map(([slot, g]) => (
    <mesh key={slot} geometry={g} material={slotMat(slot)} castShadow={shadow && !NO_SHADOW.has(slot)} receiveShadow={!NO_SHADOW.has(slot)} />
  ));
}

// Static looks are not drawn per piece: every garage piece's kit is merged
// per room and material (FurnitureBatch, in the dressing), so forty pieces
// cost a few draws per room instead of a few each. A piece component draws
// only its colliders and whatever moves. STATIC maps a type to its builder.
const STATIC = {};
const stat = (type, build) => { STATIC[type] = build; };

export function FurnitureBatch({ map }) {
  const batches = useMemo(() => {
    const buckets = {};
    const m = new THREE.Matrix4();
    for (const f of map.FURNITURE) {
      const build = STATIC[f.type];
      if (!build) continue;
      const geos = build(f);
      m.makeRotationY(yawOf(f)).setPosition(f.x, 0, f.z);
      const room = map.roomAt(f.x, f.z)?.id || 'out';
      for (const [slot, g] of Object.entries(geos)) {
        ((buckets[room] ||= {})[slot] ||= []).push(g.clone().applyMatrix4(m));
      }
    }
    return Object.entries(buckets).map(([room, slots]) => [room, Object.fromEntries(
      Object.entries(slots).map(([slot, list]) => {
        const g = mergeGeometries(list, false);
        g.computeBoundingSphere();
        return [slot, g];
      }),
    )]);
  }, [map]);
  return batches.map(([room, geos]) => <group key={room}><KitMeshes geos={geos} /></group>);
}

function Fixed({ f, children, friction = 0.8 }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[f.x, 0, f.z]} rotation-y={yawOf(f)} friction={friction}>
      {children}
    </RigidBody>
  );
}
// a box collider given in metres: half extents and centre
const Box = ({ h, p = [0, 0, 0], r }) => (
  <CuboidCollider args={[h[0] * M, h[1] * M, h[2] * M]} position={[p[0] * M, p[1] * M, p[2] * M]} rotation={r} />
);
const key = (...a) => a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join('|');

// colours
const PINE = '#caa874', PLY = '#dcc091', MAPLE = '#dcbc8c', WALNUT = '#6e4b33';
const BLACK = '#1d1e20', STEEL = '#8d949b', WIRE = '#cfd4d9', RED = '#c8261e', WHITE = '#efece5';

// ------------------------------------------------------------ door desks
// A hollow-core door on two black folding sawhorses. The underside is the
// view you get: sawhorse legs, a wire cable tray, a power strip, droopy leads.
function buildDoorDesk(L, D, H, variant) {
  const k = kit();
  const T = 0.04;
  const top = variant % 3 === 1 ? '#b98d62' : '#ece7dc'; // lauan veneer, or primed white
  k.box('satin', [L, T, D], [0, H - T / 2, 0], top, null, 0.008);
  // the hole where the door knob used to be, with a brass ring round it
  k.cyl('matte', 0.028, 0.028, 0.004, [L / 2 - 0.08, H + 0.001, D / 2 - 0.12], '#2a2622', null, 14);
  k.torus('metal', 0.03, 0.005, [L / 2 - 0.08, H + 0.002, D / 2 - 0.12], '#c9a24a', [Math.PI / 2, 0, 0], 14);
  // two sawhorses: a beam under the door across its depth, A-frame legs
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.28);
    const y = H - T;
    k.box('satin', [0.07, 0.06, D * 0.9], [x, y - 0.03, 0], BLACK);
    for (const sz of [-1, 1]) {
      for (const lx of [-1, 1]) {
        k.bar('satin', [x + lx * 0.03, y - 0.05, sz * D * 0.36], [x + lx * 0.2, 0.01, sz * D * 0.44], 0.035, BLACK);
      }
      // the spreader between each pair of legs
      k.box('satin', [0.3, 0.025, 0.025], [x, 0.22, sz * D * 0.42], BLACK);
      k.box('matte', [0.06, 0.02, 0.06], [x - 0.2, 0.01, sz * D * 0.44], '#101010');
      k.box('matte', [0.06, 0.02, 0.06], [x + 0.2, 0.01, sz * D * 0.44], '#101010');
    }
  }
  // cable tray under the back edge: a wire basket, cables sagging out
  const ty = H - T - 0.12;
  k.box('metal', [L * 0.6, 0.006, 0.12], [0, ty, -D / 2 + 0.1], '#2b2d30');
  for (const sz of [-1, 1]) k.box('metal', [L * 0.6, 0.06, 0.006], [0, ty + 0.03, -D / 2 + 0.1 + sz * 0.06], '#2b2d30');
  for (let i = -3; i <= 3; i++) k.box('metal', [0.006, 0.07, 0.12], [i * L * 0.1, ty + 0.03, -D / 2 + 0.1], '#2b2d30');
  // power strip in the tray, its switch glowing red
  k.box('satin', [0.36, 0.04, 0.06], [0.1, ty + 0.03, -D / 2 + 0.1], '#e9e7e2');
  k.box('glow', [0.03, 0.012, 0.02], [0.25, ty + 0.055, -D / 2 + 0.1], '#ff3a2a');
  // leads drooping from the tray to the floor
  const r = rng(variant + 3);
  for (let i = 0; i < 3; i++) {
    const x0 = (r() - 0.5) * L * 0.5;
    const pts = [new THREE.Vector3(x0, ty, -D / 2 + 0.12), new THREE.Vector3(x0 + 0.05, ty * 0.5, -D / 2 + 0.2 + r() * 0.1),
      new THREE.Vector3(x0 + 0.1, 0.02, -D / 2 + 0.28 + r() * 0.1), new THREE.Vector3(x0 + 0.3, 0.012, -D / 2 + 0.1)];
    k.add('matte', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.006, 4), ['#111', '#f2f2f2', '#2a4d8f'][i]);
  }
  if (variant === 9) {
    // the founder's desk: a lava lamp and a succulent
    k.cyl('metal', 0.05, 0.07, 0.1, [L / 2 - 0.25, H + 0.05, D / 2 - 0.2], '#8a8f96', null, 12);
    k.cyl('warm', 0.035, 0.05, 0.22, [L / 2 - 0.25, H + 0.21, D / 2 - 0.2], '#ff5a2c', null, 12);
    k.cyl('metal', 0.02, 0.035, 0.06, [L / 2 - 0.25, H + 0.35, D / 2 - 0.2], '#8a8f96', null, 12);
    k.cyl('satin', 0.05, 0.04, 0.08, [-L / 2 + 0.2, H + 0.04, D / 2 - 0.15], '#d8c7a8', null, 12);
    k.sphere('matte', 0.05, [-L / 2 + 0.2, H + 0.1, D / 2 - 0.15], '#5f8a4a', [1, 0.7, 1], 8);
  }
  return k.build();
}

function DoorDesk({ f }) {
  const { L, D, H } = dims(f);
  const variant = f.rotY === Math.PI ? 9 : Math.abs(Math.round(f.x * 3)) % 7;
  const x = L / 2 - 0.28;
  return (
    <Fixed f={f} friction={1}>
      <Box h={[L / 2, 0.02, D / 2]} p={[0, H - 0.02, 0]} />
      {[-1, 1].map((s) => <Box key={s} h={[0.2, (H - 0.04) / 2, D * 0.44]} p={[s * x, (H - 0.04) / 2, 0]} />)}
    </Fixed>
  );
}
stat('garage_doordesk', (f) => {
  const { L, D, H } = dims(f);
  const variant = f.rotY === Math.PI ? 9 : Math.abs(Math.round(f.x * 3)) % 7;
  const geos = cached(key('doordesk', L, D, H, variant), () => buildDoorDesk(L, D, H, variant));
  return geos;
});

// ---------------------------------------------------------- workbench
// Butcher block on 2×4 legs, pegboard above it (a wall board), and the 3D
// printer: its bed runs back and forth and its head sweeps across, beeping
// now and then when a layer finishes.
function buildWorkbench(L, D, H) {
  const k = kit();
  const T = 0.06;
  k.box('wood', [L, T, D], [0, H - T / 2, 0], MAPLE, null, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box('wood', [0.09, H - T, 0.09], [sx * (L / 2 - 0.1), (H - T) / 2, sz * (D / 2 - 0.08)], PINE);
  }
  // apron under the top, and a back stretcher low against the wall
  k.box('wood', [L - 0.1, 0.1, 0.04], [0, H - T - 0.05, D / 2 - 0.06], PINE);
  k.box('wood', [L - 0.1, 0.1, 0.04], [0, H - T - 0.05, -D / 2 + 0.06], PINE);
  k.box('wood', [L - 0.1, 0.09, 0.04], [0, 0.18, -D / 2 + 0.08], PINE);
  // a vise bolted to the front corner
  const vx = L / 2 - 0.2;
  k.box('metal', [0.16, 0.08, 0.2], [vx, H + 0.04, D / 2 - 0.02], '#3c5a7a');
  k.box('metal', [0.16, 0.1, 0.04], [vx, H + 0.05, D / 2 + 0.1], '#3c5a7a');
  k.cyl('chrome', 0.008, 0.008, 0.25, [vx, H + 0.04, D / 2 + 0.16], '#c9cdd2', [0, 0, Math.PI / 2], 6);
  // a laptop, open, and a soldering station
  k.box('metal', [0.32, 0.015, 0.22], [0.15, H + 0.008, 0.05], '#9da3aa');
  k.box('metal', [0.32, 0.22, 0.01], [0.15, H + 0.11, -0.06], '#9da3aa', [-0.25, 0, 0]);
  k.box('glow', [0.29, 0.18, 0.002], [0.15, H + 0.11, -0.052], '#3b6fb0', [-0.25, 0, 0]);
  k.box('satin', [0.14, 0.08, 0.12], [0.6, H + 0.04, -0.15], '#2e3136');
  k.box('glow', [0.05, 0.02, 0.002], [0.6, H + 0.06, -0.089], '#ff6a2a');
  // the printer's frame (the moving parts are separate meshes)
  const px = -0.62;
  const P = { x: px, y: H, z: 0 };
  k.box('satin', [0.42, 0.05, 0.4], [P.x, P.y + 0.025, P.z], '#1f2226');
  for (const sx of [-1, 1]) k.box('satin', [0.03, 0.42, 0.04], [P.x + sx * 0.2, P.y + 0.26, P.z - 0.05], '#1f2226');
  k.box('satin', [0.43, 0.03, 0.04], [P.x, P.y + 0.46, P.z - 0.05], '#1f2226');
  k.box('matte', [0.12, 0.08, 0.05], [P.x + 0.12, P.y + 0.06, P.z + 0.2], '#1f2226');
  k.box('glow', [0.07, 0.04, 0.002], [P.x + 0.12, P.y + 0.07, P.z + 0.226], '#8ad7ff');
  // filament spool on the top bar
  k.cyl('matte', 0.09, 0.09, 0.06, [P.x, P.y + 0.53, P.z - 0.05], '#ff7a1a', [Math.PI / 2, 0, 0], 20);
  k.cyl('matte', 0.1, 0.1, 0.008, [P.x, P.y + 0.53, P.z - 0.02], '#2a2a2a', [Math.PI / 2, 0, 0], 20);
  k.cyl('matte', 0.1, 0.1, 0.008, [P.x, P.y + 0.53, P.z - 0.08], '#2a2a2a', [Math.PI / 2, 0, 0], 20);
  // offcuts and screws
  k.box('wood', [0.4, 0.04, 0.09], [0.9, H + 0.02, 0.2], PINE, [0, 0.3, 0]);
  k.cyl('satin', 0.05, 0.05, 0.1, [0.35, H + 0.05, 0.25], '#3a7d44', null, 10);
  return k.build();
}
function buildPrinterParts() {
  const bed = kit(); // the heated bed and the thing being printed on it
  bed.box('metal', [0.3, 0.012, 0.3], [0, 0, 0], '#26282c');
  bed.box('satin', [0.28, 0.003, 0.28], [0, 0.008, 0], '#c9a33a');
  bed.box('satin', [0.07, 0.04, 0.05], [0.02, 0.03, 0.01], '#2f7fe0'); // a half-printed boat
  bed.box('satin', [0.04, 0.03, 0.03], [0.02, 0.06, 0.0], '#2f7fe0');
  const head = kit(); // the carriage on the x gantry
  head.box('satin', [0.06, 0.07, 0.05], [0, 0, 0], '#e8591a');
  head.box('metal', [0.012, 0.03, 0.012], [0, -0.05, 0], '#c9cdd2');
  head.box('glow', [0.01, 0.01, 0.002], [0.018, 0.02, 0.026], '#7cff9a');
  const gantry = kit();
  gantry.box('metal', [0.42, 0.012, 0.012], [0, 0, 0], '#c9cdd2');
  gantry.box('metal', [0.42, 0.012, 0.012], [0, 0.03, 0], '#c9cdd2');
  return { bed: bed.build(), head: head.build(), gantry: gantry.build() };
}

function Workbench({ f }) {
  const { L, D, H } = dims(f);
  const parts = cached('printer', buildPrinterParts);
  const bed = useRef(), head = useRef(), gantry = useRef();
  const beep = useRef(6 + Math.random() * 6);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    // the print: a quick raster, head along x, bed along z, layer by layer
    if (head.current) head.current.position.x = (-0.62 + Math.sin(t * 5.3) * 0.12 + Math.sin(t * 13) * 0.02) * M;
    if (bed.current) bed.current.position.z = (Math.sin(t * 2.1) * 0.08) * M;
    if (gantry.current) gantry.current.position.y = (H + 0.2 + ((t * 0.004) % 0.05)) * M;
    if (head.current && gantry.current) head.current.position.y = gantry.current.position.y + 0.02 * M;
    beep.current -= dt;
    if (beep.current < 0) {
      // layer done: a soft two-tone chirp from the bench
      beep.current = 11 + Math.random() * 10;
      const at = [f.x + (-0.62) * M * Math.cos(yawOf(f)), 1 * M, f.z];
      audio.ding(at, 0.12, 2093);
      setTimeout(() => audio.ding(at, 0.1, 2637), 140);
    }
  });
  return (
    <Fixed f={f} friction={1}>
      <Box h={[L / 2, 0.03, D / 2]} p={[0, H - 0.03, 0]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Box key={i} h={[0.045, (H - 0.06) / 2, 0.045]} p={[sx * (L / 2 - 0.1), (H - 0.06) / 2, sz * (D / 2 - 0.08)]} />
      ))}
      <Box h={[0.21, 0.24, 0.2]} p={[-0.62, H + 0.24, 0]} />
      <group ref={bed} position={[-0.62 * M, (H + 0.06) * M, 0]}><KitMeshes geos={parts.bed} shadow={false} /></group>
      <group ref={gantry} position={[-0.62 * M, (H + 0.2) * M, -0.02 * M]}><KitMeshes geos={parts.gantry} shadow={false} /></group>
      <group ref={head} position={[-0.62 * M, (H + 0.22) * M, -0.02 * M]}><KitMeshes geos={parts.head} shadow={false} /></group>
    </Fixed>
  );
}
stat('garage_workbench', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('bench', L, D, H), () => buildWorkbench(L, D, H));
  return geos;
});

// ------------------------------------------------------------ tool chest
function buildToolChest(L, D, H) {
  const k = kit();
  const base = H * 0.64;
  k.box('gloss', [L, base - 0.08, D], [0, 0.08 + (base - 0.08) / 2, 0], RED, null, 0.015);
  k.box('gloss', [L * 0.98, H - base - 0.02, D * 0.92], [0, base + 0.01 + (H - base - 0.02) / 2, -D * 0.02], RED, null, 0.015);
  // drawer seams and chrome pulls on the front
  const drawers = [0.12, 0.09, 0.09, 0.14, 0.14];
  let y = base - 0.02;
  for (const dh of drawers) {
    y -= dh;
    k.box('matte', [L * 0.94, 0.006, 0.004], [0, y, D / 2 + 0.001], '#5a0f0b');
    k.box('chrome', [L * 0.7, 0.014, 0.02], [0, y + dh * 0.6, D / 2 + 0.01], '#d6dadf');
  }
  for (let i = 0; i < 4; i++) {
    const yy = base + 0.04 + i * 0.07;
    k.box('matte', [L * 0.9, 0.005, 0.004], [0, yy, D * 0.44 + 0.001], '#5a0f0b');
    k.box('chrome', [L * 0.6, 0.012, 0.016], [0, yy + 0.035, D * 0.44 + 0.01], '#d6dadf');
  }
  // side handle, casters
  k.bar('chrome', [L / 2 + 0.03, base - 0.1, -D * 0.3], [L / 2 + 0.03, base - 0.1, D * 0.3], 0.018, '#d6dadf');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box('metal', [0.05, 0.02, 0.05], [sx * (L / 2 - 0.06), 0.075, sz * (D / 2 - 0.06)], '#3a3d42');
    k.cyl('matte', 0.03, 0.03, 0.025, [sx * (L / 2 - 0.06), 0.035, sz * (D / 2 - 0.06)], '#111', [0, 0, Math.PI / 2], 10);
  }
  // stickers on the side: brand block and a band sticker
  k.box('matte', [0.002, 0.08, 0.2], [-L / 2 - 0.001, base - 0.2, 0], '#f0c419');
  k.box('matte', [0.002, 0.1, 0.1], [-L / 2 - 0.001, base - 0.4, 0.1], '#1b1b1b');
  return k.build();
}
function ToolChest({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_toolchest', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('chest', L, D, H), () => buildToolChest(L, D, H));
  return geos;
});

// ------------------------------------------------------ garage shelving
// Boltless steel shelving along the back wall: tubs, paint, a cooler, boxes.
function buildShelf(L, D, H) {
  const k = kit();
  const levels = [0.12, 0.62, 1.12, 1.62];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box('metal', [0.035, H, 0.035], [sx * (L / 2 - 0.02), H / 2, sz * (D / 2 - 0.02)], '#5d6368');
  }
  for (const y of levels) {
    k.box('wood', [L - 0.04, 0.018, D - 0.04], [0, y, 0], '#cdb48a');
    for (const sz of [-1, 1]) k.box('metal', [L, 0.04, 0.02], [0, y - 0.02, sz * (D / 2 - 0.02)], '#5d6368');
  }
  const r = rng(41);
  const tub = (x, y, w, h, c, lid) => {
    k.box('satin', [w, h, D * 0.8], [x, y + h / 2, 0], c, null, 0.02);
    k.box('satin', [w + 0.02, 0.025, D * 0.82], [x, y + h + 0.01, 0], lid, null, 0.01);
  };
  tub(-0.85, 0.13, 0.55, 0.3, '#d9dde0', '#2f63b8');
  tub(-0.2, 0.13, 0.55, 0.3, '#d9dde0', '#2f63b8');
  tub(0.6, 0.13, 0.6, 0.34, '#3b3f45', '#f0c419');
  // cooler, paint tins, a stack of boxes, a helmet
  k.box('satin', [0.55, 0.32, D * 0.75], [-0.8, 0.79, 0], '#2c7fc2', null, 0.03);
  k.box('satin', [0.58, 0.06, D * 0.78], [-0.8, 0.97, 0], '#f2f2f2', null, 0.02);
  for (let i = 0; i < 5; i++) {
    const x = -0.25 + i * 0.2;
    k.cyl('metal', 0.08, 0.08, 0.18, [x, 0.72, (r() - 0.5) * 0.1], '#c2c7cc', null, 14);
    k.cyl('matte', 0.081, 0.081, 0.08, [x, 0.72, (r() - 0.5) * 0.1], ['#e6c34a', '#3e7d57', '#b5473a', '#f2f2f2', '#355c9e'][i], null, 14);
  }
  k.box('matte', [0.5, 0.36, D * 0.8], [0.85, 0.81, 0], '#b98a54');
  k.box('matte', [0.5, 0.36, D * 0.8], [-0.6, 1.31, 0], '#b98a54');
  k.box('matte', [0.46, 0.3, D * 0.75], [-0.1, 1.28, 0], '#c79a63');
  k.box('matte', [0.4, 0.26, D * 0.7], [0.55, 1.26, 0], '#b98a54');
  k.sphere('gloss', 0.13, [0.95, 1.75, 0], '#e8332a', [1, 0.8, 1.15], 12);
  k.box('matte', [0.5, 0.2, D * 0.8], [0.2, 1.73, 0], '#8a6a4a');
  k.box('satin', [0.6, 0.22, D * 0.6], [-0.7, 1.74, 0], '#6f7a45', null, 0.04); // a rolled-up tent bag
  return k.build();
}
function Shelf({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_shelf', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('shelf', L, D, H), () => buildShelf(L, D, H));
  return geos;
});

// ---------------------------------------------------------- tyre stack
function tyreLathe(R, w) {
  const pts = [];
  pts.push(new THREE.Vector2(R * 0.62, -w));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI;
    pts.push(new THREE.Vector2(R - 0.05 + Math.cos(a) * 0.05, Math.sin(a) * w));
  }
  pts.push(new THREE.Vector2(R * 0.62, w));
  return new THREE.LatheGeometry(pts, 22);
}
function buildTyres(L, H) {
  const k = kit();
  const R = L / 2 - 0.01, n = Math.max(1, Math.round(H / 0.21));
  for (let i = 0; i < n; i++) {
    k.add('matte', tyreLathe(R, 0.095), '#1a1a1a', [0.02 * Math.sin(i * 2), 0.105 + i * 0.205, 0.015 * Math.cos(i * 3)]);
  }
  // one with a wheel still on it, leaning
  return k.build();
}
function Tyres({ f }) {
  const { L, H } = dims(f);
  return (
    <Fixed f={f}>
      <CylinderCollider args={[(H / 2) * M, (L / 2) * M]} position={[0, (H / 2) * M, 0]} />
    </Fixed>
  );
}
stat('garage_tyres', (f) => {
  const { L, H } = dims(f);
  const geos = cached(key('tyres', L, H), () => buildTyres(L, H));
  return geos;
});

// -------------------------------------------------------- chest freezer
function buildFreezer(L, D, H) {
  const k = kit();
  k.box('satin', [L, H - 0.06, D], [0, 0.03 + (H - 0.06) / 2, 0], '#f1f0ec', null, 0.03);
  k.box('satin', [L + 0.01, 0.06, D + 0.01], [0, H - 0.03, 0], '#e8e7e2', null, 0.02);
  k.box('satin', [0.3, 0.03, 0.04], [0, H - 0.07, D / 2 + 0.02], '#b9bcc0', null, 0.01);
  k.box('matte', [L - 0.04, 0.04, D - 0.04], [0, 0.02, 0], '#2a2a2a');
  k.box('matte', [L * 0.7, 0.06, 0.004], [0, 0.18, D / 2 + 0.002], '#9aa0a6'); // vent grille
  k.box('glow', [0.02, 0.02, 0.004], [L / 2 - 0.12, H - 0.18, D / 2 + 0.003], '#39ff6a');
  // on the lid: a sack of charcoal and a box of lightbulbs
  k.box('matte', [0.45, 0.14, 0.3], [-0.2, H + 0.07, 0], '#2b2b2b', [0, 0.2, 0], 0.05);
  k.box('matte', [0.25, 0.12, 0.2], [0.3, H + 0.06, 0.05], '#e8c64a');
  return k.build();
}
function Freezer({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_freezer', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('freezer', L, D, H), () => buildFreezer(L, D, H));
  return geos;
});

// ------------------------------------------------------------ lawnmower
function buildMower(L, D, H) {
  const k = kit();
  k.box('gloss', [L * 0.9, 0.16, D * 0.55], [0, 0.17, 0.1], '#2f8a3a', null, 0.05);
  k.cyl('satin', 0.13, 0.15, 0.14, [0, 0.3, 0.12], '#222', null, 14); // engine
  k.cyl('satin', 0.05, 0.05, 0.05, [0, 0.4, 0.12], '#c8261e', null, 10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('matte', 0.08, 0.08, 0.05, [sx * L * 0.44, 0.08, 0.1 + sz * D * 0.24], '#1a1a1a', [0, 0, Math.PI / 2], 14);
  }
  k.box('matte', [L * 0.8, 0.28, 0.35], [0, 0.2, -D * 0.33], '#383c40', null, 0.04); // grass bag
  for (const sx of [-1, 1]) k.bar('metal', [sx * 0.2, 0.2, -0.05], [sx * 0.22, 0.95, -0.55], 0.02, '#2a2a2a');
  k.bar('metal', [-0.22, 0.95, -0.55], [0.22, 0.95, -0.55], 0.022, '#2a2a2a');
  return k.build();
}
function Mower({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_mower', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('mower', L, D, H), () => buildMower(L, D, H));
  return geos;
});

// --------------------------------------------------------- wheelie bins
function buildBins(L, D, H) {
  const k = kit();
  const w = L / 2 - 0.04;
  [['#2f5d3a', '#2f5d3a'], ['#2f5d3a', '#f0c419']].forEach(([body, lid], i) => {
    const x = (i - 0.5) * (w + 0.06);
    k.add('satin', new THREE.CylinderGeometry(1, 0.88, 1, 4, 1).rotateY(Math.PI / 4).scale(w * 0.7, H - 0.1, D * 0.68).translate(0, (H - 0.1) / 2 + 0.03, 0), body, [x, 0, 0]);
    k.box('satin', [w + 0.02, 0.05, D + 0.02], [x, H - 0.05, 0.01], lid, [0.04, 0, 0], 0.02);
    k.box('satin', [w * 0.8, 0.04, 0.05], [x, H - 0.1, -D / 2 - 0.02], body);
    for (const sx of [-1, 1]) k.cyl('matte', 0.1, 0.1, 0.05, [x + sx * w * 0.35, 0.1, -D / 2 + 0.08], '#151515', [0, 0, Math.PI / 2], 14);
  });
  return k.build();
}
function Bins({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_bins', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('bins', L, D, H), () => buildBins(L, D, H));
  return geos;
});

// ------------------------------------------------------------ mini fridge
function buildMiniFridge(L, D, H) {
  const k = kit();
  k.box('satin', [L, H, D - 0.05], [0, H / 2, -0.025], '#e9e9e6', null, 0.03);
  k.box('satin', [L - 0.01, H - 0.02, 0.05], [0, H / 2, D / 2 - 0.03], '#f2f2ef', null, 0.02);
  k.box('chrome', [0.02, 0.3, 0.03], [L / 2 - 0.06, H * 0.6, D / 2 + 0.01], '#c9cdd2');
  // stickers: the company logo, a sticker from every conference
  const r = rng(52);
  const cols = ['#ff3d8b', '#2fb7e0', '#f0c419', '#1b1b1b', '#6fd06a', '#ff7a1a'];
  for (let i = 0; i < 9; i++) {
    k.box('matte', [0.07 + r() * 0.06, 0.05 + r() * 0.05, 0.002], [(r() - 0.5) * (L - 0.15), 0.15 + r() * (H - 0.3), D / 2 + 0.0 + 0.002], cols[i % cols.length], [0, 0, (r() - 0.5) * 0.6]);
  }
  // cans on top
  for (let i = 0; i < 3; i++) k.cyl('metal', 0.033, 0.033, 0.16, [-0.15 + i * 0.1, H + 0.08, 0], ['#1c1c1c', '#2f6fd6', '#7cff4a'][i], null, 10);
  return k.build();
}
function MiniFridge({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_minifridge', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('mini', L, D, H), () => buildMiniFridge(L, D, H));
  return geos;
});

// --------------------------------------------- extension-cord spaghetti
// Decor: leads snaking along the floor behind the dev pit's chairs, power
// strips daisy-chained, their switches glowing.
function buildCords(L, D) {
  const k = kit();
  const r = rng(77);
  const cols = ['#f07a1a', '#1a1a1a', '#f2f2f2', '#1a1a1a', '#2a4d8f', '#f07a1a'];
  for (let c = 0; c < 6; c++) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      pts.push(new THREE.Vector3(-L / 2 + (i / n) * L + (r() - 0.5) * 0.4, 0.012, (r() - 0.5) * D));
    }
    k.add('satin', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.009, 5), cols[c]);
  }
  for (let i = 0; i < 4; i++) {
    const x = -L / 2 + (i + 0.5) * (L / 4);
    k.box('satin', [0.34, 0.04, 0.07], [x, 0.02, (r() - 0.5) * D * 0.6], '#ecebe7', [0, (r() - 0.5) * 0.8, 0], 0.01);
    k.box('glow', [0.03, 0.012, 0.02], [x + 0.13, 0.045, 0], '#ff3a2a');
  }
  return k.build();
}
function Cords() {
  return null; // all static: drawn by the batch
}
stat('garage_cords', (f) => {
  const { L, D } = dims(f);
  const geos = cached(key('cords', L, D), () => buildCords(L, D));
  return geos;
});

// ------------------------------------------------------ the server shelf
// Chrome wire shelving: old beige towers on the bottom shelves, six silver
// mini-PCs and a router up top, a box fan on the floor blowing at it all.
// The router's and switch's LEDs blink (one instanced mesh), the fan spins.
function buildServerRack(L, D, H) {
  const k = kit();
  const levels = [0.08, 0.52, 0.96, 1.4, H - 0.02];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('chrome', 0.013, 0.013, H, [sx * (L / 2 - 0.015), H / 2, sz * (D / 2 - 0.015)], WIRE, null, 8);
    k.cyl('matte', 0.02, 0.02, 0.02, [sx * (L / 2 - 0.015), 0.01, sz * (D / 2 - 0.015)], '#222', null, 8);
  }
  for (const y of levels) {
    for (const sz of [-1, 1]) k.box('chrome', [L, 0.012, 0.012], [0, y, sz * (D / 2 - 0.015)], WIRE);
    for (const sx of [-1, 1]) k.box('chrome', [0.012, 0.012, D], [sx * (L / 2 - 0.015), y, 0], WIRE);
    for (let i = 1; i < 12; i++) k.box('chrome', [0.004, 0.004, D - 0.03], [-L / 2 + i * (L / 12), y - 0.004, 0], WIRE);
  }
  // beige towers (the "cluster"): front bezels with drive bays and a power LED
  const tower = (x, y) => {
    k.box('satin', [0.19, 0.42, D - 0.06], [x, y + 0.21, 0], '#d8d0bb', null, 0.01);
    k.box('satin', [0.18, 0.12, 0.004], [x, y + 0.34, D / 2 - 0.028], '#cbc2aa');
    k.box('matte', [0.14, 0.012, 0.004], [x, y + 0.36, D / 2 - 0.025], '#3a3a3a');
    k.box('matte', [0.14, 0.012, 0.004], [x, y + 0.32, D / 2 - 0.025], '#3a3a3a');
    k.box('glow', [0.012, 0.012, 0.004], [x + 0.06, y + 0.08, D / 2 - 0.025], '#3aff6a');
  };
  tower(-0.4, 0.09); tower(-0.18, 0.09); tower(0.05, 0.09); tower(0.3, 0.09);
  tower(-0.35, 0.53); tower(-0.12, 0.53);
  k.box('satin', [0.44, 0.18, 0.3], [0.28, 0.62, 0], '#2a2d31', null, 0.02); // a UPS
  k.box('glow', [0.06, 0.03, 0.004], [0.2, 0.66, 0.152], '#7cd7ff');
  // six mini-PCs, stacked in two piles
  for (let i = 0; i < 6; i++) {
    const x = i < 3 ? -0.3 : 0.05;
    const y = 0.97 + (i % 3) * 0.045;
    k.box('metal', [0.2, 0.04, 0.2], [x, y + 0.02, 0], '#b5bac0', null, 0.008);
    k.box('glow', [0.008, 0.008, 0.004], [x + 0.08, y + 0.02, 0.101], '#5fa8ff');
  }
  // the router with its antennas, and a switch
  k.box('satin', [0.34, 0.05, 0.22], [-0.1, 1.43, 0], '#1f2226', null, 0.01);
  for (let i = 0; i < 4; i++) k.box('satin', [0.015, 0.2, 0.01], [-0.24 + i * 0.09, 1.55, -0.1], '#1f2226', [0.15 * (i - 1.5), 0, 0]);
  k.box('metal', [0.44, 0.045, 0.2], [0.3, 1.43, 0], '#2f3338', null, 0.005);
  // patch leads looping down the front
  const r = rng(8);
  for (let i = 0; i < 7; i++) {
    const x = 0.15 + i * 0.045;
    const pts = [new THREE.Vector3(x, 1.43, 0.1), new THREE.Vector3(x + (r() - 0.5) * 0.1, 1.2, 0.2), new THREE.Vector3(x - 0.2, 1.0, 0.18), new THREE.Vector3(x - 0.3, 0.97, 0.05)];
    k.add('matte', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.005, 4), ['#2f7fe0', '#f0c419', '#e8332a', '#2f7fe0', '#f2f2f2', '#6fd06a', '#2f7fe0'][i]);
  }
  // the fan's housing (blades are separate): a 0.5 m box fan on the floor
  const fx = L / 2 + 0.33, fz = 0.25;
  k.box('satin', [0.5, 0.52, 0.12], [fx, 0.28, fz], '#e4e1d8', [0, -0.6, 0], 0.03);
  k.box('matte', [0.44, 0.02, 0.1], [fx, 0.02, fz], '#555', [0, -0.6, 0]);
  return k.build();
}
function buildFanBlades() {
  const k = kit();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box('satin', [0.07, 0.19, 0.008], [Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0], '#9fb8c8', [0.3, 0, -a]);
  }
  k.cyl('satin', 0.04, 0.04, 0.03, [0, 0, 0], '#6a7a86', [Math.PI / 2, 0, 0], 12);
  // the front grille: a few rings
  const g = kit();
  for (const r of [0.08, 0.14, 0.2]) g.torus('metal', r, 0.003, [0, 0, 0.03], '#9aa0a6', null, 24);
  g.box('metal', [0.44, 0.006, 0.006], [0, 0, 0.03], '#9aa0a6');
  g.box('metal', [0.006, 0.44, 0.006], [0, 0, 0.03], '#9aa0a6');
  return { blades: k.build(), grille: g.build() };
}

const _o = new THREE.Object3D();
const _col = new THREE.Color();
function ServerRack({ f }) {
  const { L, D, H } = dims(f);
  const fan = cached('fanblades', buildFanBlades);
  const blades = useRef();
  const leds = useRef();
  const ledSpots = useMemo(() => {
    const out = [];
    for (let i = 0; i < 8; i++) out.push([-0.22 + i * 0.03, 1.44, 0.111, i]); // router front
    for (let i = 0; i < 12; i++) out.push([0.12 + i * 0.03, 1.43, 0.101, i + 20]); // switch ports
    return out;
  }, []);
  const ledMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useLayoutEffect(() => {
    ledSpots.forEach(([x, y, z], i) => {
      _o.position.set(x * M, y * M, z * M);
      _o.updateMatrix();
      leds.current.setMatrixAt(i, _o.matrix);
      leds.current.setColorAt(i, _col.set('#3aff6a'));
    });
    leds.current.instanceMatrix.needsUpdate = true;
  }, [ledSpots]);
  useFrame(({ clock }, dt) => {
    if (blades.current) blades.current.rotation.z -= dt * 14;
    const t = clock.elapsedTime;
    const m = leds.current;
    if (!m) return;
    ledSpots.forEach(([, , , s], i) => {
      // traffic: each port flickers on its own pseudo-random rhythm
      const on = Math.sin(t * (7 + (s % 5) * 3.1) + s * 1.7) + Math.sin(t * 17.3 + s) > 0.2;
      m.setColorAt(i, _col.set(s < 20 ? (s === 0 ? '#5fa8ff' : '#3aff6a') : '#ffb13a').multiplyScalar(on ? 1.6 : 0.12));
    });
    m.instanceColor.needsUpdate = true;
  });
  const fx = L / 2 + 0.33, fz = 0.25;
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
      <Box h={[0.27, 0.27, 0.1]} p={[fx, 0.27, fz]} r={[0, -0.6, 0]} />
      <group position={[fx * M, 0.3 * M, fz * M]} rotation-y={-0.6}>
        <group position={[0, 0, 0.04 * M]}>
          <group ref={blades}><KitMeshes geos={fan.blades} shadow={false} /></group>
        </group>
        <KitMeshes geos={fan.grille} shadow={false} />
      </group>
      <instancedMesh ref={leds} args={[null, null, ledSpots.length]} material={ledMat} frustumCulled={false}>
        <boxGeometry args={[0.012 * M, 0.01 * M, 0.004 * M]} />
      </instancedMesh>
    </Fixed>
  );
}
stat('garage_serverrack', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('srv', L, D, H), () => buildServerRack(L, D, H));
  return geos;
});

// ------------------------------------------------------- washer / dryer
function buildWasher(L, D, H, dryer) {
  const k = kit();
  k.box('satin', [L, H, D], [0, H / 2, 0], '#f3f3f0', null, 0.025);
  k.box('satin', [L - 0.02, 0.12, 0.02], [0, H - 0.07, D / 2], '#e6e6e2', null, 0.01);
  k.cyl('chrome', 0.03, 0.03, 0.03, [L / 2 - 0.12, H - 0.07, D / 2 + 0.01], '#c9cdd2', [Math.PI / 2, 0, 0], 14);
  k.box('glow', [0.1, 0.035, 0.004], [-0.1, H - 0.07, D / 2 + 0.012], dryer ? '#ffb13a' : '#7cd7ff');
  // the porthole: chrome ring, dark glass
  k.torus('chrome', 0.18, 0.025, [0, H * 0.45, D / 2 + 0.01], '#d4d8dc', null, 28);
  k.cyl('glass', 0.17, 0.17, 0.01, [0, H * 0.45, D / 2 + 0.005], '#233241', [Math.PI / 2, 0, 0], 28);
  k.box('matte', [L - 0.04, 0.05, 0.02], [0, 0.03, D / 2 - 0.005], '#c9c9c5');
  if (!dryer) {
    // a bottle of detergent and a stack of towels on top
    k.box('satin', [0.12, 0.22, 0.08], [-0.15, H + 0.11, -0.05], '#2f7fe0', null, 0.02);
    k.box('fabric', [0.3, 0.12, 0.25], [0.12, H + 0.06, 0], '#d9745a', null, 0.03);
  } else {
    // the network switch that lives on the dryer (really)
    k.box('metal', [0.3, 0.04, 0.18], [0, H + 0.02, 0], '#2f3338', null, 0.005);
  }
  return k.build();
}
function buildDrum() {
  const k = kit();
  k.cyl('matte', 0.16, 0.16, 0.01, [0, 0, 0], '#6d7a86', [Math.PI / 2, 0, 0], 20);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.box('fabric', [0.14, 0.07, 0.01], [Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.006], ['#e05a4a', '#f2f2f2', '#3a6fd6'][i], [0, 0, a]);
  }
  return k.build();
}
function Washer({ f }) {
  const { L, D, H } = dims(f);
  const drum = cached('drum', buildDrum);
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * (f.dryer ? 2.5 : 5); });
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
      <group ref={ref} position={[0, H * 0.45 * M, (D / 2 - 0.004) * M]}><KitMeshes geos={drum} shadow={false} /></group>
    </Fixed>
  );
}
stat('garage_washer', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('washer', L, D, H, !!f.dryer), () => buildWasher(L, D, H, !!f.dryer));
  return geos;
});

// ------------------------------------------------------ kitchen island
function buildIsland(L, D, H) {
  const k = kit();
  const T = 0.04, over = 0.25; // worktop overhang on the stool side (+z)
  const bd = D - over;
  const bz = -over / 2;
  k.box('satin', [L - 0.04, H - T - 0.1, bd], [0, 0.1 + (H - T - 0.1) / 2, bz], '#8fa58a', null, 0.01);
  k.box('matte', [L - 0.1, 0.1, bd - 0.08], [0, 0.05, bz - 0.02], '#2c2e2c'); // toe kick
  k.box('gloss', [L, T, D], [0, H - T / 2, 0], '#ecebe6', null, 0.012);
  // shaker doors on the kitchen side (−z) and panels on the stool side
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * (L / n);
    for (const side of [-1, 1]) {
      const z = bz + side * (bd / 2 + 0.004);
      k.box('satin', [L / n - 0.07, H - T - 0.2, 0.012], [x, 0.1 + (H - T - 0.1) / 2, z], '#99ae94', null, 0.004);
      k.box('satin', [L / n - 0.17, H - T - 0.33, 0.014], [x, 0.1 + (H - T - 0.1) / 2, z], '#8aa085', null, 0.004);
      if (side < 0) k.box('chrome', [0.012, 0.14, 0.02], [x + L / n / 2 - 0.08, H - T - 0.16, z - 0.012], '#c9cdd2');
    }
  }
  // corbels under the overhang, a fruit bowl, a stack of mail
  for (const sx of [-1, 1]) k.box('wood', [0.05, 0.14, over - 0.02], [sx * (L / 2 - 0.2), H - T - 0.07, D / 2 - over / 2], '#e8e4da');
  k.cyl('satin', 0.13, 0.08, 0.07, [0.7, H + 0.035, -0.2], '#2a4d8f', null, 16);
  k.sphere('gloss', 0.04, [0.68, H + 0.08, -0.2], '#f2c230');
  k.sphere('gloss', 0.04, [0.74, H + 0.08, -0.17], '#7fb13a');
  k.sphere('gloss', 0.04, [0.71, H + 0.1, -0.23], '#d23a2a');
  return k.build();
}
function Island({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2 - 0.02, (H - 0.04) / 2, (D - 0.25) / 2]} p={[0, (H - 0.04) / 2, -0.125]} />
      <Box h={[L / 2, 0.02, D / 2]} p={[0, H - 0.02, 0]} />
    </Fixed>
  );
}
stat('garage_island', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('island', L, D, H), () => buildIsland(L, D, H));
  return geos;
});

// --------------------------------------------------------- kitchen counter
// White shaker base units with a wood top; the south run carries the
// toaster and microwave (the coffee machine lands on its clear end in
// Coffee Run), the east run the sink and the dish rack.
function buildCounter(L, D, H, sink) {
  const k = kit();
  const T = 0.04;
  k.box('satin', [L, H - T - 0.1, D - 0.04], [0, 0.1 + (H - T - 0.1) / 2, -0.02], WHITE, null, 0.008);
  k.box('matte', [L - 0.04, 0.1, D - 0.1], [0, 0.05, -0.05], '#2c2c2c');
  k.box('wood', [L + 0.02, T, D], [0, H - T / 2, 0], '#b8875a', null, 0.006);
  const n = Math.max(2, Math.round(L / 0.6));
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * (L / n);
    k.box('satin', [L / n - 0.02, 0.16, 0.014], [x, H - T - 0.1, D / 2 - 0.035], '#f6f4ef', null, 0.004);
    k.box('satin', [L / n - 0.02, H - T - 0.34, 0.014], [x, 0.1 + (H - T - 0.3) / 2, D / 2 - 0.035], '#f6f4ef', null, 0.004);
    k.box('satin', [L / n - 0.12, H - T - 0.46, 0.016], [x, 0.1 + (H - T - 0.3) / 2, D / 2 - 0.03], '#eeebe4', null, 0.004);
    k.box('metal', [0.12, 0.012, 0.02], [x, H - T - 0.1, D / 2 - 0.02], '#2c2c2c');
  }
  // subway-tile splashback up the wall behind
  k.box('gloss', [L, 0.45, 0.012], [0, H + 0.225, -D / 2 + 0.006], '#f4f3ee');
  for (let row = 0; row < 6; row++) k.box('matte', [L, 0.004, 0.004], [0, H + 0.075 * row, -D / 2 + 0.013], '#cfccc4');
  if (sink) {
    k.box('metal', [0.6, 0.02, 0.42], [0.2, H + 0.002, 0.02], '#b8bec4');
    k.box('metal', [0.52, 0.004, 0.36], [0.2, H + 0.013, 0.02], '#6f767d');
    k.bar('chrome', [0.2, H, -0.2], [0.2, H + 0.3, -0.2], 0.024, '#d4d8dc');
    k.bar('chrome', [0.2, H + 0.3, -0.2], [0.2, H + 0.28, -0.03], 0.02, '#d4d8dc');
    // dish rack with plates
    k.box('metal', [0.4, 0.1, 0.3], [-0.55, H + 0.05, 0], '#d4d8dc');
    for (let i = 0; i < 5; i++) k.cyl('gloss', 0.1, 0.1, 0.012, [-0.7 + i * 0.07, H + 0.12, 0], '#f6f6f2', [0, 0, Math.PI / 2], 16);
    k.cyl('satin', 0.03, 0.03, 0.2, [0.75, H + 0.1, -0.15], '#3c8a4a', null, 10); // washing-up liquid
  } else {
    // toaster, microwave, a knife block
    k.box('metal', [0.28, 0.18, 0.16], [-0.9, H + 0.09, -0.05], '#c9cdd2', null, 0.03);
    k.box('matte', [0.2, 0.004, 0.03], [-0.9, H + 0.181, -0.08], '#111');
    k.box('matte', [0.2, 0.004, 0.03], [-0.9, H + 0.181, -0.02], '#111');
    k.box('satin', [0.5, 0.3, 0.38], [-0.3, H + 0.15, -0.04], '#2a2c2f', null, 0.02);
    k.box('glass', [0.33, 0.22, 0.004], [-0.36, H + 0.15, 0.152], '#101418');
    k.box('glow', [0.06, 0.025, 0.002], [-0.1, H + 0.24, 0.153], '#6fff7a');
    k.box('wood', [0.12, 0.2, 0.14], [1.15, H + 0.1, -0.12], '#6e4b33', [0.2, 0, 0]);
  }
  return k.build();
}
function Counter({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_counter', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('counter', L, D, H, !!f.sink), () => buildCounter(L, D, H, !!f.sink));
  return geos;
});

// ------------------------------------------------------- ping-pong table
// The boardroom table. Drive under it; on top, the net is a 15 cm fence.
function buildPingPong(L, D, H) {
  const k = kit();
  const T = 0.03;
  k.box('satin', [L, T, D], [0, H - T / 2, 0], '#1f4f86', null, 0.006);
  // white lines: edges and the centre line
  k.box('matte', [L, 0.002, 0.02], [0, H + 0.001, D / 2 - 0.01], '#f4f4f0');
  k.box('matte', [L, 0.002, 0.02], [0, H + 0.001, -D / 2 + 0.01], '#f4f4f0');
  k.box('matte', [0.02, 0.002, D], [L / 2 - 0.01, H + 0.001, 0], '#f4f4f0');
  k.box('matte', [0.02, 0.002, D], [-L / 2 + 0.01, H + 0.001, 0], '#f4f4f0');
  k.box('matte', [L, 0.002, 0.004], [0, H + 0.001, 0], '#f4f4f0');
  // the net
  k.box('matte', [0.012, 0.1525, D + 0.2], [0, H + 0.076, 0], '#f2f2f2');
  k.box('glass', [0.004, 0.13, D + 0.18], [0, H + 0.07, 0], '#20242a');
  for (const sz of [-1, 1]) k.box('metal', [0.03, 0.17, 0.03], [0, H + 0.08, sz * (D / 2 + 0.1)], '#2a2a2a');
  // undercarriage: folding frame, legs with wheels
  k.box('metal', [L * 0.9, 0.05, 0.04], [0, H - T - 0.03, D * 0.35], '#3a3d42');
  k.box('metal', [L * 0.9, 0.05, 0.04], [0, H - T - 0.03, -D * 0.35], '#3a3d42');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (L / 2 - 0.35), z = sz * (D / 2 - 0.15);
    k.box('metal', [0.04, H - T - 0.04, 0.04], [x, (H - T) / 2, z], '#3a3d42');
    k.cyl('matte', 0.05, 0.05, 0.03, [x, 0.05, z], '#151515', [0, 0, Math.PI / 2], 12);
  }
  // meeting notes, bats and a ball
  k.box('matte', [0.21, 0.004, 0.297], [0.6, H + 0.004, 0.3], '#f6f5f0', [0, 0.2, 0]);
  k.box('matte', [0.21, 0.004, 0.297], [0.75, H + 0.006, 0.25], '#fbfaf5', [0, -0.3, 0]);
  for (const [x, z, r] of [[-0.8, 0.35, 0.5], [0.9, -0.4, 2.2]]) {
    k.cyl('satin', 0.075, 0.075, 0.012, [x, H + 0.008, z], '#c8261e', null, 16);
    k.box('wood', [0.03, 0.02, 0.1], [x + Math.cos(r) * 0.11, H + 0.012, z + Math.sin(r) * 0.11], '#c9a06a', [0, -r + Math.PI / 2, 0]);
  }
  k.sphere('satin', 0.02, [-0.2, H + 0.02, -0.3], '#f6f6f0', null, 10);
  return k.build();
}
function PingPong({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f} friction={0.9}>
      <Box h={[L / 2, 0.015, D / 2]} p={[0, H - 0.015, 0]} />
      <Box h={[0.01, 0.076, D / 2 + 0.1]} p={[0, H + 0.076, 0]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Box key={i} h={[0.03, (H - 0.03) / 2, 0.03]} p={[sx * (L / 2 - 0.35), (H - 0.03) / 2, sz * (D / 2 - 0.15)]} />
      ))}
    </Fixed>
  );
}
stat('garage_pingpong', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('pong', L, D, H), () => buildPingPong(L, D, H));
  return geos;
});

// ---------------------------------------------------------- coffee table
function buildCoffeeTable(L, D, H) {
  const k = kit();
  k.box('wood', [L, 0.04, D], [0, H - 0.02, 0], WALNUT, null, 0.012);
  k.box('wood', [L - 0.1, 0.02, D - 0.1], [0, 0.14, 0], WALNUT);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.bar('wood', [sx * (L / 2 - 0.08), H - 0.04, sz * (D / 2 - 0.08)], [sx * (L / 2 - 0.04), 0, sz * (D / 2 - 0.05)], 0.035, '#4e3524');
  }
  // magazines on the shelf, a laptop and a pizza-stained plate on top
  const r = rng(61);
  for (let i = 0; i < 5; i++) k.box('matte', [0.28, 0.008, 0.21], [-0.2 + r() * 0.1, 0.155 + i * 0.009, (r() - 0.5) * 0.1], ['#d23a2a', '#f2f2f2', '#2a4d8f', '#f0c419', '#1b1b1b'][i], [0, (r() - 0.5) * 0.5, 0]);
  k.box('metal', [0.32, 0.015, 0.22], [0.3, H + 0.008, 0.05], '#3a3d42', [0, 0.3, 0]);
  k.cyl('gloss', 0.12, 0.1, 0.015, [-0.3, H + 0.008, -0.05], '#f4f2ec', null, 18);
  return k.build();
}
function CoffeeTable({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_coffeetable', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('ctable', L, D, H), () => buildCoffeeTable(L, D, H));
  return geos;
});

// ------------------------------------------------ sideboard + the inkjet
function buildSideboard(L, D, H) {
  const k = kit();
  const leg = 0.18;
  k.box('wood', [L, H - leg, D], [0, leg + (H - leg) / 2, 0], '#8a5a3a', null, 0.01);
  for (let i = 0; i < 2; i++) {
    k.box('wood', [L / 2 - 0.02, H - leg - 0.06, 0.012], [(i - 0.5) * L / 2, leg + (H - leg) / 2, D / 2 + 0.004], i ? '#9b6a46' : '#94643f');
    k.box('metal', [0.01, 0.1, 0.02], [(i - 0.5) * 0.08, leg + (H - leg) / 2, D / 2 + 0.015], '#c9a24a');
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.bar('wood', [sx * (L / 2 - 0.1), leg, sz * (D / 2 - 0.08)], [sx * (L / 2 - 0.06), 0, sz * (D / 2 - 0.05)], 0.03, '#5a3a24');
  }
  // the inkjet: a white box, paper tray out, a sheet half-printed
  const px = -0.3;
  k.box('satin', [0.44, 0.17, 0.32], [px, H + 0.085, -0.02], '#eeeeea', null, 0.02);
  k.box('satin', [0.3, 0.012, 0.18], [px, H + 0.05, 0.2], '#dcdcd6', [-0.1, 0, 0]);
  k.box('matte', [0.21, 0.003, 0.2], [px, H + 0.065, 0.22], '#fbfbf7', [-0.1, 0, 0]);
  k.box('satin', [0.2, 0.006, 0.12], [px, H + 0.178, -0.1], '#dcdcd6', [0.5, 0, 0]);
  k.box('glow', [0.05, 0.02, 0.002], [px + 0.15, H + 0.14, 0.141], '#7cff9a');
  // a record player and a stack of records, a plant
  k.box('wood', [0.4, 0.1, 0.34], [0.35, H + 0.05, 0], '#3d2a1e', null, 0.01);
  k.cyl('matte', 0.15, 0.15, 0.008, [0.33, H + 0.105, 0], '#111', null, 24);
  k.cyl('matte', 0.04, 0.04, 0.009, [0.33, H + 0.106, 0], '#d23a2a', null, 12);
  k.cyl('satin', 0.07, 0.055, 0.14, [0.72, H + 0.07, 0], '#e8e1d4', null, 14);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box('matte', [0.03, 0.26, 0.012], [0.72 + Math.cos(a) * 0.04, H + 0.25, Math.sin(a) * 0.04], '#4f8a3f', [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]);
  }
  return k.build();
}
function Sideboard({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_sideboard', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('side', L, D, H), () => buildSideboard(L, D, H));
  return geos;
});

// -------------------------------------------------------------- the TV
// A low media unit, a big TV paused on the all-hands call, a console LED.
let _tvMat = null;
function TvStand({ f }) {
  const { L, D, H } = dims(f);
  if (!_tvMat) _tvMat = new THREE.MeshBasicMaterial({ map: tvTex(), toneMapped: false, color: '#bfc6d6' });
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
      <mesh position={[0.1 * M, (H + 0.5) * M, -0.053 * M]} material={_tvMat}>
        <planeGeometry args={[1.19 * M, 0.67 * M]} />
      </mesh>
    </Fixed>
  );
}
stat('garage_tvstand', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('tv', L, D, H), () => {
    const k = kit();
    k.box('wood', [L, H - 0.08, D], [0, 0.08 + (H - 0.08) / 2, 0], '#e8e2d6', null, 0.01);
    for (const sx of [-1, 1]) k.box('matte', [0.05, 0.08, D - 0.1], [sx * (L / 2 - 0.1), 0.04, 0], '#2a2a2a');
    k.box('matte', [L - 0.1, 0.012, 0.01], [0, H * 0.55, D / 2 + 0.002], '#b8b0a2');
    k.box('satin', [0.3, 0.06, 0.25], [-0.35, H + 0.03, 0], '#f2f2f2', null, 0.02);
    k.box('glow', [0.08, 0.005, 0.002], [-0.35, H + 0.03, 0.126], '#5fa8ff');
    // the TV on its foot
    k.box('satin', [0.3, 0.02, 0.2], [0.1, H + 0.01, -0.05], '#1a1a1c');
    k.box('satin', [0.05, 0.12, 0.04], [0.1, H + 0.08, -0.08], '#1a1a1c');
    k.box('satin', [1.25, 0.73, 0.05], [0.1, H + 0.5, -0.08], '#141416', null, 0.01);
    return k.build();
  });
  return geos;
});

// ---------------------------------------------------------- floor lamp
function Lamp({ f }) {
  const { H } = dims(f);
  return (
    <Fixed f={f}>
      <CylinderCollider args={[(H * 0.35) * M, 0.15 * M]} position={[0, H * 0.35 * M, 0]} />
    </Fixed>
  );
}
stat('garage_lamp', (f) => {
  const { H } = dims(f);
  const geos = cached(key('lamp', H), () => {
    const k = kit();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.bar('wood', [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [0, H * 0.7, 0], 0.025, '#6e4b33');
    }
    k.cyl('metal', 0.012, 0.012, H * 0.3, [0, H * 0.82, 0], '#2a2a2a', null, 6);
    k.cyl('fabric', 0.2, 0.26, 0.3, [0, H - 0.1, 0], '#efe3c8', null, 20, true);
    k.cyl('warm', 0.18, 0.24, 0.26, [0, H - 0.1, 0], '#ffcf8a', null, 16, true);
    return k.build();
  });
  return geos;
});

// ------------------------------------------------------------ mattress
function buildMattress(L, D, H) {
  const k = kit();
  k.box('fabric', [L, H, D], [0, H / 2, 0], '#e8e4da', null, 0.06);
  // rumpled duvet over two thirds, a pillow, a laptop left open
  k.box('fabric', [L + 0.06, 0.06, D * 0.68], [0.02, H + 0.02, -D * 0.14], '#4b6f8f', [0, 0.04, 0.02], 0.03);
  k.box('fabric', [L * 0.5, 0.05, 0.25], [-0.15, H + 0.07, -D * 0.2], '#4b6f8f', [0, 0.4, 0.1], 0.03);
  k.box('fabric', [0.6, 0.12, 0.35], [0, H + 0.06, D / 2 - 0.25], '#f4f1ea', [0, 0.1, 0], 0.05);
  k.box('metal', [0.32, 0.015, 0.22], [0.3, H + 0.01 + 0.06, 0.15], '#9da3aa', [0, -0.4, 0]);
  return k.build();
}
function Mattress({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f} friction={1.1}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_mattress', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('mattress', L, D, H), () => buildMattress(L, D, H));
  return geos;
});

// ---------------------------------------------------------------- bbq
function buildBbq(L, D, H) {
  const k = kit();
  const bh = 0.82;
  k.box('satin', [L * 0.62, 0.3, D * 0.8], [0, bh - 0.1, 0], '#1f2124', null, 0.03);
  k.add('satin', new THREE.CylinderGeometry(D * 0.4, D * 0.4, L * 0.62, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), '#1f2124', [0, bh + 0.05, 0], [Math.PI / 2, 0, 0]);
  k.bar('chrome', [-0.2, bh + 0.2, D * 0.42], [0.2, bh + 0.2, D * 0.42], 0.02, '#c9cdd2');
  for (const sx of [-1, 1]) {
    k.box('metal', [L * 0.18, 0.02, D * 0.7], [sx * L * 0.4, bh - 0.02, 0], '#8d949b');
    for (const sz of [-1, 1]) k.box('metal', [0.03, bh - 0.25, 0.03], [sx * L * 0.28, (bh - 0.25) / 2, sz * D * 0.33], '#2a2a2a');
  }
  k.box('metal', [L * 0.56, 0.02, D * 0.6], [0, 0.18, 0], '#2a2a2a');
  k.cyl('satin', 0.15, 0.15, 0.4, [0, 0.4, 0], '#e8e8e2', null, 16); // the gas bottle
  k.cyl('metal', 0.03, 0.03, 0.06, [0, 0.63, 0], '#8d949b', null, 8);
  for (let i = 0; i < 3; i++) k.cyl('chrome', 0.02, 0.02, 0.03, [-0.1 + i * 0.1, bh - 0.02, D * 0.41], '#c9cdd2', [Math.PI / 2, 0, 0], 8);
  return k.build();
}
function Bbq({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L * 0.31, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_bbq', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('bbq', L, D, H), () => buildBbq(L, D, H));
  return geos;
});

// ------------------------------------------------------- paddling pool
let _water = null;
function Pool({ f }) {
  const { L, H } = dims(f);
  if (!_water) _water = new THREE.MeshStandardMaterial({ color: '#7fd0ff', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55, envMapIntensity: 1.6 });
  return (
    <group position={[f.x, 0, f.z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.09 * M, 0]} material={_water}>
        <circleGeometry args={[(L / 2 - 0.1) * M, 32]} />
      </mesh>
    </group>
  );
}
stat('garage_pool', (f) => {
  const { L, H } = dims(f);
  const geos = cached(key('pool', L, H), () => {
    const k = kit();
    const R = L / 2;
    for (let i = 0; i < 2; i++) k.torus('gloss', R - 0.08, 0.06, [0, 0.06 + i * 0.1, 0], ['#3aa0e8', '#f2f2f2'][i], [Math.PI / 2, 0, 0], 32);
    k.cyl('gloss', R - 0.08, R - 0.08, 0.01, [0, 0.005, 0], '#5fc0f0', null, 32);
    // a rubber duck
    k.sphere('gloss', 0.05, [0.3, 0.1, 0.2], '#f7d21e', [1.2, 0.9, 1], 10);
    k.sphere('gloss', 0.035, [0.34, 0.16, 0.2], '#f7d21e', null, 10);
    return k.build();
  });
  return geos;
});

// ----------------------------------------------------------------- tree
// A garden tree: a trunk and a crown of lumpy blobs (shared with the street
// trees in the dressing).
export function buildTree(H, seed = 1) {
  const k = kit();
  const r = rng(seed);
  const trunk = H * 0.42;
  k.cyl('matte', 0.1, 0.16, trunk, [0, trunk / 2, 0], '#5b4636', null, 10);
  k.bar('matte', [0, trunk * 0.8, 0], [0.6, trunk + 0.5, 0.2], 0.07, '#5b4636');
  k.bar('matte', [0, trunk * 0.7, 0], [-0.5, trunk + 0.4, -0.3], 0.07, '#5b4636');
  const greens = ['#4f7a34', '#5f8a3c', '#6d9a44', '#46702e'];
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = r() * 1.2;
    const y = trunk + 0.4 + r() * (H - trunk - 1.2);
    const s = 0.9 + r() * 0.7;
    k.add('matte', new THREE.IcosahedronGeometry(s, 1), greens[i % 4], [Math.cos(a) * d, y, Math.sin(a) * d], [r(), r(), r()], [1, 0.8, 1]);
  }
  return k.build();
}
function Tree({ f }) {
  const { H } = dims(f);
  return (
    <Fixed f={f}>
      <CylinderCollider args={[1.5 * M, 0.18 * M]} position={[0, 1.5 * M, 0]} />
    </Fixed>
  );
}
stat('garage_tree', (f) => {
  const { H } = dims(f);
  const geos = cached(key('tree', H, f.x), () => buildTree(H, Math.round(f.x * 7)));
  return geos;
});

// ---------------------------------------------------------- veg bed
function buildVegBed(L, D, H) {
  const k = kit();
  for (const sz of [-1, 1]) k.box('wood', [L, H, 0.05], [0, H / 2, sz * (D / 2 - 0.025)], '#9a7650');
  for (const sx of [-1, 1]) k.box('wood', [0.05, H, D], [sx * (L / 2 - 0.025), H / 2, 0], '#9a7650');
  k.box('matte', [L - 0.1, 0.02, D - 0.1], [0, H - 0.04, 0], '#3b2a1e');
  const r = rng(71);
  for (let i = 0; i < 14; i++) {
    const x = -L / 2 + 0.2 + (i % 7) * ((L - 0.4) / 6), z = i < 7 ? -0.18 : 0.18;
    k.add('matte', new THREE.IcosahedronGeometry(0.1 + r() * 0.05, 0), i < 7 ? '#6fae4a' : '#8ac25a', [x, H + 0.06, z], [r(), r(), r()], [1, 0.7, 1]);
  }
  // tomato canes
  for (let i = 0; i < 3; i++) {
    k.bar('wood', [L / 2 - 0.3 - i * 0.3, H, 0], [L / 2 - 0.3 - i * 0.3, H + 0.9, 0], 0.015, '#b99a6a');
    k.sphere('gloss', 0.03, [L / 2 - 0.28 - i * 0.3, H + 0.5, 0.05], '#d82a1a', null, 8);
  }
  return k.build();
}
function VegBed({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_vegbed', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('veg', L, D, H), () => buildVegBed(L, D, H));
  return geos;
});

// ------------------------------------------------------------- funbox
function buildFunbox(L, D, H) {
  const k = kit();
  k.box('wood', [L, 0.02, D], [0, H - 0.01, 0], PLY);
  for (const sz of [-1, 1]) k.box('satin', [L, H - 0.02, 0.02], [0, (H - 0.02) / 2, sz * (D / 2 - 0.01)], '#3a3d42');
  for (const sx of [-1, 1]) k.box('satin', [0.02, H - 0.02, D], [sx * (L / 2 - 0.01), (H - 0.02) / 2, 0], '#3a3d42');
  // steel coping where the ramps meet the deck, scuffed grip on top
  for (const sx of [-1, 1]) k.cyl('chrome', 0.025, 0.025, D, [sx * (L / 2 - 0.01), H, 0], '#c9cdd2', [Math.PI / 2, 0, 0], 10);
  const r = rng(91);
  for (let i = 0; i < 10; i++) k.box('matte', [0.2 + r() * 0.4, 0.001, 0.02 + r() * 0.03], [(r() - 0.5) * L * 0.8, H + 0.001, (r() - 0.5) * D * 0.8], '#2a2622', [0, (r() - 0.5) * 0.6, 0]);
  // stickers on the sides
  const cols = ['#ff3d8b', '#f0c419', '#2fb7e0', '#f2f2f2', '#6fd06a'];
  for (let i = 0; i < 6; i++) k.box('matte', [0.08 + r() * 0.1, 0.05 + r() * 0.06, 0.002], [(r() - 0.5) * L * 0.8, 0.08 + r() * (H - 0.18), (i % 2 ? 1 : -1) * (D / 2 + 0.001)], cols[i % cols.length], [0, 0, (r() - 0.5) * 0.5]);
  return k.build();
}
function Funbox({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f} friction={1.1}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_funbox', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('funbox', L, D, H), () => buildFunbox(L, D, H));
  return geos;
});

// ---------------------------------------------------------- garden hose
// Across the driveway: a 3 cm bump (a real collider) with a reel at the
// house end.
function Hose({ f }) {
  const { L, D } = dims(f);
  return (
    <group position={[f.x, 0, f.z]} rotation-y={yawOf(f)}>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[0.05 * M, 0.015 * M, (D / 2 - 0.2) * M]} position={[0, 0.015 * M, 0]} />
      </RigidBody>
    </group>
  );
}
stat('garage_hose', (f) => {
  const { L, D } = dims(f);
  const geos = cached(key('hose', L, D), () => {
    const k = kit();
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector3(Math.sin(t * 9) * 0.25 + Math.sin(t * 3.1) * 0.3, 0.015, (t - 0.5) * D));
    }
    k.add('satin', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.015, 6), '#3f9a3a');
    // reel at the north (house) end, spray gun at the south end
    k.cyl('satin', 0.22, 0.22, 0.14, [0.3, 0.3, D / 2 + 0.15], '#3f9a3a', [0, 0, Math.PI / 2], 18);
    k.box('satin', [0.34, 0.5, 0.25], [0.3, 0.25, D / 2 + 0.15], '#2a2d31', null, 0.02);
    k.box('satin', [0.05, 0.14, 0.16], [pts[0].x, 0.05, -D / 2 - 0.05], '#f07a1a', [0.3, 0, 0], 0.01);
    return k.build();
  });
  return geos;
});

// -------------------------------------------------------------- mailbox
function Mailbox({ f }) {
  return (
    <Fixed f={f}>
      <Box h={[0.1, 0.58, 0.1]} p={[0, 0.58, 0]} />
    </Fixed>
  );
}
stat('garage_mailbox', (f) => {

  const geos = cached('mailbox', () => {
    const k = kit();
    k.box('wood', [0.09, 1.0, 0.09], [0, 0.5, 0], '#f1efe8');
    k.box('gloss', [0.2, 0.2, 0.46], [0, 1.08, 0], '#1f2a3a', null, 0.05);
    k.box('gloss', [0.02, 0.18, 0.04], [0.11, 1.18, -0.1], '#d8261e');
    k.box('matte', [0.002, 0.05, 0.16], [0.101, 1.06, 0.05], '#f1efe8'); // house number
    return k.build();
  });
  return geos;
});

// ------------------------------------------------------------ sprinkler
// An impulse sprinkler: the head ticks round one way, then swings back;
// the spray is an arc of droplets (instanced) that follows it.
const DROPS = 42;
function Sprinkler({ f }) {
  const head = useRef();
  const drops = useRef();
  const dropMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.55, depthWrite: false }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // tick round over 7 s in 30 small steps, then swing back in 1.5 s
    const c = t % 8.5;
    const a = c < 7 ? -1.2 + Math.floor(c / (7 / 30)) * (2.4 / 30) : 1.2 - ((c - 7) / 1.5) * 2.4;
    if (head.current) head.current.rotation.y = a;
    const m = drops.current;
    if (!m) return;
    for (let i = 0; i < DROPS; i++) {
      // droplets along a parabola out to ~2.2 m, streaming outward
      const s = ((i / DROPS) + t * 0.9) % 1;
      const d = s * 2.2;
      const y = 0.22 + d * 0.9 - d * d * 0.5;
      const spread = Math.sin(i * 12.9898) * 0.08;
      _o.position.set(Math.sin(a + spread) * d * M, Math.max(0.02, y) * M, Math.cos(a + spread) * d * M);
      _o.scale.setScalar(0.6 + (i % 3) * 0.3);
      _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[f.x, 0, f.z]}>
      <group ref={head} position={[0, 0.22 * M, 0]}>
        <mesh position={[0, 0, 0.06 * M]} rotation-x={-0.7}>
          <cylinderGeometry args={[0.01 * M, 0.01 * M, 0.14 * M, 6]} />
          <meshStandardMaterial color="#b08d57" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
      <instancedMesh ref={drops} args={[null, null, DROPS]} material={dropMat} frustumCulled={false}>
        <sphereGeometry args={[0.012 * M, 4, 3]} />
      </instancedMesh>
    </group>
  );
}
stat('garage_sprinkler', (f) => {

  const geos = cached('sprinkler', () => {
    const k = kit();
    k.cyl('satin', 0.08, 0.1, 0.03, [0, 0.015, 0], '#2a2d31', null, 12);
    k.cyl('metal', 0.012, 0.012, 0.18, [0, 0.12, 0], '#b08d57', null, 8);
    return k.build();
  });
  return geos;
});

// ------------------------------------------------------------- shrubs
// Low box hedges and flowers along the front of the house.
function Shrubs({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_shrubs', (f) => {
  const { L, D, H } = dims(f);
  const geos = cached(key('shrubs', L, D, H), () => {
    const k = kit();
    k.box('matte', [L, 0.04, D], [0, 0.02, 0], '#4a3322');
    const r = rng(Math.round(L * 10));
    const n = Math.round(L / 0.55);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      k.add('matte', new THREE.IcosahedronGeometry(0.3, 1), ['#3f6b2c', '#4a7a33', '#3a6428'][i % 3], [x, H * 0.55, (r() - 0.5) * 0.1], [r(), r(), r()], [1, H / 0.6, D / 0.62]);
      for (let j = 0; j < 3; j++) k.sphere('matte', 0.035, [x + (r() - 0.5) * 0.4, H * 0.4 + r() * H * 0.5, D / 2 - 0.05], ['#ff6fa8', '#fff2a8', '#b58cff', '#ff9a3a'][(i + j) % 4], null, 6);
    }
    return k.build();
  });
  return geos;
});

// ------------------------------------------------------ clothes airer
// A folding drying rack in the laundry, hung with the company's t-shirts.
function buildAirer(L, D, H) {
  const k = kit();
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) k.bar('metal', [sx * L / 2, 0, sz * D / 2], [sx * L / 2, H, sz * 0.05], 0.014, '#e8e8e4');
    for (let i = 0; i < 4; i++) {
      const t = 0.3 + i * 0.22, z = sz * (D / 2 - (D / 2 - 0.05) * t);
      k.bar('metal', [-L / 2, H * t, z], [L / 2, H * t, z], 0.008, '#e8e8e4');
    }
  }
  k.bar('metal', [-L / 2, H, 0], [L / 2, H, 0], 0.012, '#e8e8e4');
  // tees over the top rail: the logo, the hackathon, the launch
  const tees = [['#1b1b1b', '#ff3d8b'], ['#f2f2f2', '#2f7fe0'], ['#2f7fe0', '#f2f2f2'], ['#ff7a1a', '#1b1b1b']];
  tees.forEach(([c, logo], i) => {
    const x = -L / 2 + 0.17 + i * 0.29;
    for (const sz of [-1, 1]) {
      k.box('fabric', [0.26, 0.42, 0.012], [x, H - 0.2, sz * 0.03], c, [sz * 0.14, 0, 0]);
      k.box('matte', [0.1, 0.1, 0.004], [x, H - 0.16, sz * 0.043], logo, [sz * 0.14, 0, 0]);
    }
  });
  // socks on the lower rails
  for (let i = 0; i < 5; i++) k.box('fabric', [0.05, 0.16, 0.012], [-0.4 + i * 0.2, H * 0.52 - 0.08, D * 0.22], ['#e8332a', '#f2f2f2', '#6fd06a', '#1b1b1b', '#f0c419'][i], [0.2, 0, 0]);
  return k.build();
}
function Airer({ f }) {
  const { L, D, H } = dims(f);
  return (
    <Fixed f={f}>
      <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
    </Fixed>
  );
}
stat('garage_airer', (f) => { const { L, D, H } = dims(f); return cached(key('airer', L, D, H), () => buildAirer(L, D, H)); });

// laundry basket, the dog's bed, a guitar on its stand, patio chairs, a
// drip tray: small things that make rooms somebody's
function buildBasket(L, D, H) {
  const k = kit();
  k.box('satin', [L, H, D], [0, H / 2, 0], '#f2f2ee', null, 0.04);
  for (let i = 0; i < 6; i++) k.box('satin', [0.04, H * 0.5, 0.004], [-L / 2 + 0.06 + i * (L - 0.12) / 5, H * 0.55, D / 2 + 0.001], '#d8d8d2');
  k.box('fabric', [L - 0.06, 0.12, D - 0.06], [0, H - 0.02, 0], '#6a8fc0', [0.1, 0.2, 0.05], 0.04);
  k.box('fabric', [0.3, 0.1, 0.2], [0.05, H + 0.05, 0.02], '#d9745a', [0.3, 0.6, 0.1], 0.04);
  return k.build();
}
function buildDogBed(L, D, H) {
  const k = kit();
  k.torus('fabric', L / 2 - 0.1, 0.1, [0, 0.1, 0], '#8a6a52', [Math.PI / 2, 0, 0], 24);
  k.cyl('fabric', L / 2 - 0.12, L / 2 - 0.12, 0.08, [0, 0.05, 0], '#c9b89a', null, 24);
  k.sphere('satin', 0.035, [0.1, 0.13, 0.05], '#d6f24a', null, 10); // a tennis ball
  k.box('satin', [0.14, 0.03, 0.04], [-0.1, 0.1, -0.08], '#f2efe6', [0, 0.6, 0], 0.015); // a chew bone
  return k.build();
}
function buildGuitar() {
  const k = kit();
  // the stand
  k.bar('metal', [-0.15, 0, 0.12], [0, 0.35, 0.02], 0.012, '#1b1b1b');
  k.bar('metal', [0.15, 0, 0.12], [0, 0.35, 0.02], 0.012, '#1b1b1b');
  k.bar('metal', [0, 0, -0.14], [0, 0.6, -0.04], 0.012, '#1b1b1b');
  // the guitar: two lobes of body, the neck, the headstock
  k.cyl('wood', 0.19, 0.19, 0.1, [0, 0.3, 0.05], '#c98a4a', [Math.PI / 2 - 0.2, 0, 0], 20);
  k.cyl('wood', 0.15, 0.15, 0.1, [0, 0.55, 0.0], '#c98a4a', [Math.PI / 2 - 0.2, 0, 0], 20);
  k.cyl('matte', 0.05, 0.05, 0.102, [0, 0.47, 0.02], '#1b1b1b', [Math.PI / 2 - 0.2, 0, 0], 14);
  k.box('wood', [0.05, 0.5, 0.03], [0, 0.92, -0.06], '#5a3a24', [-0.2, 0, 0]);
  k.box('wood', [0.08, 0.16, 0.03], [0, 1.24, -0.13], '#3a2618', [-0.2, 0, 0]);
  return k.build();
}
function buildPatioChair() {
  const k = kit();
  const c = '#f2f0e8';
  for (let i = 0; i < 5; i++) k.box('satin', [0.1, 0.02, 0.5], [-0.24 + i * 0.12, 0.38, 0.05], c, [-0.08, 0, 0]);
  for (let i = 0; i < 5; i++) k.box('satin', [0.1, 0.62 - Math.abs(i - 2) * 0.04, 0.02], [-0.24 + i * 0.12, 0.72, -0.26], c, [-0.35, 0, 0]);
  for (const sx of [-1, 1]) {
    k.box('satin', [0.13, 0.02, 0.62], [sx * 0.37, 0.6, 0.02], c);
    k.box('satin', [0.05, 0.6, 0.05], [sx * 0.37, 0.3, 0.28], c);
    k.box('satin', [0.05, 0.42, 0.05], [sx * 0.33, 0.21, -0.2], c, [0.25, 0, 0]);
  }
  return k.build();
}
function buildDripTray(L, D) {
  const k = kit();
  k.box('metal', [L, 0.035, D], [0, 0.0175, 0], '#4a4f55', null, 0.01);
  k.box('gloss', [L - 0.06, 0.004, D - 0.06], [0, 0.034, 0], '#15120e');
  k.box('matte', [0.12, 0.2, 0.12], [L / 2 + 0.1, 0.1, 0], '#1f4f86', null, 0.02); // a can of oil
  return k.build();
}
const simple = (type, build) => {
  stat(type, (f) => { const { L, D, H } = dims(f); return cached(key(type, L, D, H), () => build(L, D, H)); });
  return function SimplePiece({ f }) {
    const { L, D, H } = dims(f);
    return (
      <Fixed f={f}>
        <Box h={[L / 2, H / 2, D / 2]} p={[0, H / 2, 0]} />
      </Fixed>
    );
  };
};
const Basket = simple('garage_basket', buildBasket);
const DogBed = simple('garage_dogbed', buildDogBed);
const Guitar = simple('garage_guitar', buildGuitar);
const PatioChair = simple('garage_patiochair', buildPatioChair);
stat('garage_driptray', (f) => { const { L, D } = dims(f); return cached(key('drip', L, D), () => buildDripTray(L, D)); });
const DripTray = () => null;

// -------------------------------------------------------- the classic car
function ClassicCar({ f }) {
  const cols = useMemo(() => carColliders(), []);
  return (
    <Fixed f={f} friction={0.9}>
      {cols.map((c, i) => <Box key={i} h={c.half} p={c.pos} r={c.rot} />)}
    </Fixed>
  );
}
stat('garage_classic', (f) => {

  const geos = cached('classic', buildCar);
  return geos;
});

// what themes/index.js registers
export const PIECES = {
  garage_classic: ClassicCar,
  garage_airer: Airer,
  garage_basket: Basket,
  garage_dogbed: DogBed,
  garage_guitar: Guitar,
  garage_patiochair: PatioChair,
  garage_driptray: DripTray,
  garage_doordesk: DoorDesk,
  garage_workbench: Workbench,
  garage_toolchest: ToolChest,
  garage_shelf: Shelf,
  garage_tyres: Tyres,
  garage_freezer: Freezer,
  garage_mower: Mower,
  garage_bins: Bins,
  garage_minifridge: MiniFridge,
  garage_cords: Cords,
  garage_serverrack: ServerRack,
  garage_washer: Washer,
  garage_island: Island,
  garage_counter: Counter,
  garage_pingpong: PingPong,
  garage_coffeetable: CoffeeTable,
  garage_sideboard: Sideboard,
  garage_tvstand: TvStand,
  garage_lamp: Lamp,
  garage_mattress: Mattress,
  garage_bbq: Bbq,
  garage_pool: Pool,
  garage_tree: Tree,
  garage_vegbed: VegBed,
  garage_funbox: Funbox,
  garage_hose: Hose,
  garage_mailbox: Mailbox,
  garage_sprinkler: Sprinkler,
  garage_shrubs: Shrubs,
};
export { CAR };
