// The IT Cellar's theme: Dressing, PIECES, PROPS, RAMP_SKINS, WALL_STYLES.
//
// Almost everything here is static and drawn through one batch: walls,
// doors, floors, pipes, signs and every piece of furniture are described as
// parts (cellar-set.js, cellar-pieces.js) and merged into one mesh per
// surface per room (cellar-kit.js), so the whole floor costs a few dozen
// draw calls however much junk is in the e-waste room. What moves has its
// own small component: the tubes (cellar-tubes.jsx — the thing the place is
// about), rack LEDs, the boiler, the dock beacon, the queue board, the strip
// curtains, the rolling shelf bay, sprinklers and sound (cellar-live.jsx).
//
// The pieces themselves (PIECES) are colliders only — static boxes and
// cylinders the server's list agrees with; what you see of them is in the
// batch.
import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { Body } from '../propBody.jsx';
import { useMap } from '../activeMap.js';
import { Kit, prism } from './cellar-kit.js';
import { cellarMats, WORLD_UV, CASTS } from './cellar-tex.js';
import { labelsFor } from './cellar-labels.js';
import { buildWalls, buildGlass, buildDoors, buildFloors, buildMarkings, buildCeiling, buildSigns, buildFixtures } from './cellar-set.js';
import { buildPiece, pieceFrame, crt, tower, keyboard, C } from './cellar-pieces.js';
import Tubes from './cellar-tubes.jsx';
import {
  RackLeds, Boiler, Dock, NowServing, Scope, Curtains, RollingShelf, Badge, Sprinklers, Drips, Puddles, FloorBumps, CellarSound, useDispose,
} from './cellar-live.jsx';

export { tubeLevel } from './cellar-tubes.jsx';

// Everything that never moves, merged: [{ cell, mat, geometry }] + the
// sprinkler heads (for the Sprinkler Test's spray).
function buildStatic(map) {
  const k = new Kit(WORLD_UV);
  const { slots } = labelsFor(map);
  k.slots = slots;
  // three zones: the rooms north of the corridor, the corridor, the rooms
  // south of it — from the corridor you see into all of them anyway, and
  // inside a room the other side of the building is culled whole
  const side = Object.fromEntries(map.ROOMS.map((r) => [r.id, r.id === 'corridor' ? 'corridor' : r.z > 0 ? 'north' : 'south']));
  k.zone = (cell) => side[cell] || 'corridor';
  buildFloors(k, map);
  buildMarkings(k, map);
  buildWalls(k, map, slots);
  buildGlass(k, map);
  buildDoors(k, map, slots);
  const sprinklers = buildCeiling(k, map);
  buildSigns(k, map, slots);
  buildFixtures(k, map, slots);
  for (const f of map.FURNITURE) {
    k.cell = map.roomAt(f.x, f.z)?.id || 'corridor';
    buildPiece(k, f);
  }
  return { parts: k.finish(), sprinklers };
}

export function Dressing({ map }) {
  const { parts, sprinklers } = useMemo(() => buildStatic(map), [map]);
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  const mats = useMemo(() => ({ ...cellarMats(), ...labelsFor(map).mats }), [map]);
  return (
    <group name="cellar-dressing">
      {parts.map((p, i) => (
        <mesh key={`${p.cell}:${p.mat}:${i}`} geometry={p.geometry} material={mats[p.mat]}
          castShadow={CASTS.has(p.mat)} receiveShadow={p.mat !== 'glow' && p.mat !== 'light'} />
      ))}
      <Tubes map={map} />
      <RackLeds map={map} />
      <Boiler map={map} />
      <Dock map={map} />
      <NowServing map={map} />
      <Scope map={map} />
      <Curtains map={map} />
      <Badge map={map} />
      <Sprinklers heads={sprinklers} />
      <Drips map={map} />
      <Puddles map={map} />
      <FloorBumps map={map} />
      <CellarSound map={map} />
    </group>
  );
}

// ------------------------------------------------------------ colliders
// Per type, in the piece's frame (metres): boxes [w, h, d, x, y, z] and
// cylinders { r, h, x, z }. Anything not listed is its full box.
const COLLIDERS = {
  cellar_bench: ({ w, h, d }) => [
    [w, 0.04, d, 0, h - 0.02, 0],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [0.05, h, 0.05, sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06)]),
    [w - 0.12, 0.2, 0.3, 0, 0.1, -d / 2 + 0.17],
  ],
  cellar_boiler: ({ w, h }) => [[w + 0.2, 0.1, w + 0.2, 0, 0.05, 0], { r: w / 2 - 0.1, h }],
  cellar_heater: ({ w, h }) => [{ r: w / 2 - 0.05, h }],
  cellar_cylinder: ({ h }) => [{ r: 0.13, h }],
  cellar_bollard: ({ h }) => [{ r: 0.06, h }],
  cellar_palletjack: ({ w, d }) => [
    [w, 0.35, d * 0.6, 0, 0.175, -d * 0.1],
    // the forks' flat run (their tapered tips are ramps in the map)
    ...[-0.27, 0.27].map((x) => [0.16, 0.075, 0.91, x, 0.0375, d / 2 + 0.455]),
  ],
};

function Piece({ f }) {
  if (f.roll) return <RollingShelf f={f} />;
  const fr = pieceFrame(f);
  const shapes = COLLIDERS[f.type]?.(fr, f) || [[fr.w, fr.h, fr.d, 0, fr.h / 2, 0]];
  return (
    <RigidBody type="fixed" colliders={false} position={[fr.x * M, 0, fr.z * M]} rotation-y={fr.rot}
      friction={f.type === 'cellar_dock' || f.type === 'cellar_pallet' ? 1 : 0.5}>
      {shapes.map((s, i) => (Array.isArray(s)
        ? <CuboidCollider key={i} args={[s[0] * M / 2, s[1] * M / 2, s[2] * M / 2]} position={[s[3] * M, s[4] * M, s[5] * M]} />
        : <CylinderCollider key={i} args={[s.h * M / 2, s.r * M]} position={[(s.x || 0) * M, s.h * M / 2, (s.z || 0) * M]} />))}
    </RigidBody>
  );
}

export const PIECES = Object.fromEntries([
  'cellar_rack', 'cellar_crac', 'cellar_ups', 'cellar_cylinder', 'cellar_tiles', 'cellar_boiler', 'cellar_heater',
  'cellar_counter', 'cellar_shelf', 'cellar_pallet', 'cellar_cage', 'cellar_bin', 'cellar_heap', 'cellar_bench',
  'cellar_mobile', 'cellar_cabinet', 'cellar_ticketpost', 'cellar_trolley', 'cellar_cooler', 'cellar_leaf',
  'cellar_dock', 'cellar_palletjack', 'cellar_bollard', 'cellar_radiator', 'cellar_waitchairs',
].map((t) => [t, Piece]));

// Walls are drawn by the batch above; the styles only tell Office.jsx not to.
export const WALL_STYLES = { cellar_block: () => null, cellar_glass: () => null };

// ---------------------------------------------------------------- props
// Physics junk of the cellar's own. Each prop type is one cached merged
// geometry per surface (usually one), built with the same kit; its body sits
// on the floor (the Body origin is 0.4 units above p.y).
const PROP_SPECS = {
  cellar_box: { mass: 1.3, friction: 0.9, box: [0.4, 0.3, 0.32, 0, 0.15, 0], build: (k) => k.block('card', [0.4, 0.3, 0.32], [0, 0, 0], { c: '#f0e6d4' }) },
  cellar_keyboard: { mass: 0.6, box: [0.45, 0.04, 0.16, 0, 0.02, 0], build: (k) => keyboard(k, 0, 0, 0) },
  cellar_wastebin: {
    mass: 0.8, cyl: { r: 0.14, h: 0.34 },
    build: (k) => {
      k.cyl('paint', 0.14, 0.34, [0, 0.17, 0], { top: 1.1, open: true, seg: 14, c: '#6d7784' });
      k.cyl('paint', 0.14, 0.01, [0, 0.005, 0], { seg: 14, c: '#4d5460' });
      k.sphere('paint', 0.09, [0.02, 0.28, 0.01], { sy: 0.5, c: '#f2f0e8' }); // screwed-up paper
    },
  },
  cellar_papers: {
    mass: 0.5, box: [0.3, 0.07, 0.22, 0, 0.035, 0],
    build: (k) => {
      for (let i = 0; i < 4; i++) k.block('paint', [0.3, 0.017, 0.215], [0, i * 0.018, 0], { r: [0, (i % 2 ? 1 : -1) * 0.05, 0], c: i % 2 ? '#f4f2ea' : '#e8e4d8' });
      k.box('paint', [0.03, 0.012, 0.03], [0, 0.074, -0.1], { c: '#111' });
    },
  },
  // a drum of blue patch cable, lying on its side: it rolls
  cellar_reel: {
    mass: 0.6, angularDamping: 0.05, cylX: { r: 0.12, h: 0.12 },
    build: (k) => {
      for (const s of [-1, 1]) k.cyl('paint', 0.12, 0.012, [s * 0.055, 0.12, 0], { r: [0, 0, Math.PI / 2], seg: 16, c: '#c8a874' });
      k.cyl('paint', 0.09, 0.1, [0, 0.12, 0], { r: [0, 0, Math.PI / 2], seg: 16, c: '#2f6fd6' });
    },
  },
  cellar_crt: { mass: 2.6, box: [0.38, 0.36, 0.36, 0, 0.18, 0.01], build: (k) => crt(k, 0, 0, 0) },
  cellar_tower: { mass: 1.8, box: [0.18, 0.42, 0.44, 0, 0.21, 0], build: (k) => tower(k, 0, 0, 0) },
  cellar_extinguisher: {
    mass: 1.4, cyl: { r: 0.08, h: 0.6 },
    build: (k) => {
      k.cyl('paint', 0.075, 0.48, [0, 0.24, 0], { c: C.red, seg: 14 });
      k.sphere('paint', 0.075, [0, 0.48, 0], { sy: 0.45, c: C.red, seg: 12 });
      k.cyl('paint', 0.022, 0.06, [0, 0.53, 0], { c: '#222' });
      k.box('paint', [0.13, 0.015, 0.03], [0.03, 0.57, 0], { r: [0, 0, -0.2], c: '#222' });
      k.box('paint', [0.1, 0.14, 0.004], [0, 0.26, 0.074], { c: '#f0ece0' }); // the instructions label
      k.box('paint', [0.1, 0.03, 0.005], [0, 0.31, 0.075], { c: '#1d1d1d' });
      k.rod('paint', 0.008, [0.02, 0.55, 0.02], [0.08, 0.2, 0.05], { c: '#111', seg: 5 });
      k.cyl('paint', 0.08, 0.02, [0, 0.01, 0], { c: '#111', seg: 14 });
    },
  },
  cellar_wedge: {
    mass: 0.15, box: [0.05, 0.04, 0.13, 0, 0.02, 0],
    build: (k) => k.part('wood', prism('wedge', [[-0.065 * M, 0], [0.065 * M, 0], [0.065 * M, 0.04 * M]], 0.05 * M), [0, 0, 0],
      { s: [1 / M, 1 / M, 1 / M], r: [0, Math.PI / 2, 0], c: '#c09a64' }),
  },
  cellar_cart: {
    mass: 5, friction: 0.25, box: [0.52, 1.0, 0.46, 0, 0.5, 0],
    build: (k) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        k.block('paint', [0.025, 0.9, 0.025], [sx * 0.24, 0.07, sz * 0.2], { c: C.galv });
        k.cyl('paint', 0.035, 0.03, [sx * 0.22, 0.035, sz * 0.18], { r: [0, 0, Math.PI / 2], c: '#222', seg: 10 });
      }
      for (const y of [0.18, 0.62, 0.95]) k.block('paint', [0.52, 0.02, 0.46], [0, y, 0], { c: '#9aa0a3' });
      k.block('plastic', [0.36, 0.26, 0.05], [0, 0.97, -0.05], { c: '#1d1f22' }); // a flat monitor
      k.box('paint', [0.32, 0.2, 0.002], [0, 1.1, -0.024], { c: '#1d3a66' });
      k.block('plastic', [0.4, 0.025, 0.14], [0, 0.64, 0.12], { c: '#222' }); // keyboard on its tray
      k.block('plastic', [0.2, 0.2, 0.3], [0.08, 0.2, 0], { c: '#2b2d31' }); // the KVM box, a UPS brick
      k.rod('paint', 0.01, [0.2, 0.97, -0.2], [0.26, 0.3, -0.22], { c: '#111', seg: 5 });
      k.box('paint', [0.2, 0.08, 0.002], [0, 0.4, 0.232], { c: '#f0f0e8' }); // asset tag
    },
  },
  cellar_bucket: {
    mass: 1.6, cyl: { r: 0.16, h: 0.3 },
    build: (k) => {
      k.cyl('plastic', 0.16, 0.28, [0, 0.14, 0], { top: 1.12, open: true, c: C.yellow, seg: 16 });
      k.cyl('plastic', 0.16, 0.01, [0, 0.005, 0], { c: C.yellow, seg: 16 });
      k.cyl('paint', 0.165, 0.005, [0, 0.2, 0], { c: '#3a5456', seg: 16 }); // grey mop water
      k.block('plastic', [0.2, 0.08, 0.1], [0, 0.27, 0.09], { c: '#6d6d6d' }); // the wringer
      k.ring('paint', 0.17, 0.006, [0, 0.36, 0], { r: [Math.PI / 2, 0, 0], c: '#888', seg: 16 });
      for (const sx of [-1, 1]) k.cyl('paint', 0.03, 0.02, [sx * 0.13, 0.02, 0.12], { r: [0, 0, Math.PI / 2], c: '#222', seg: 8 });
    },
  },
  cellar_wetsign: {
    mass: 0.5, box: [0.3, 0.62, 0.22, 0, 0.31, 0],
    build: (k) => {
      for (const s of [-1, 1]) {
        k.box('plastic', [0.3, 0.6, 0.012], [0, 0.3, s * 0.08], { r: [s * -0.26, 0, 0], c: C.yellow });
        k.box('label', [0.24, 0.24, 0.002], [0, 0.34, s * 0.093], { r: [s * -0.26, s < 0 ? Math.PI : 0, 0], uv: k.slots.wetFloor });
      }
      k.box('plastic', [0.3, 0.03, 0.05], [0, 0.61, 0], { c: C.yellow });
    },
  },
};

const propCache = new Map();
function propParts(type, map) {
  let parts = propCache.get(type);
  if (!parts) {
    const k = new Kit(WORLD_UV);
    k.slots = labelsFor(map).slots;
    PROP_SPECS[type].build(k);
    parts = k.finish();
    propCache.set(type, parts);
  }
  return parts;
}

const U = 0.4; // the Body's origin above the prop's floor, in units
function CellarProp({ p, spec, type, map }) {
  const parts = propParts(type, map);
  const mats = useMemo(() => ({ ...cellarMats(), ...labelsFor(map).mats }), [map]);
  return (
    <Body p={p} mass={spec.mass} friction={spec.friction ?? 0.7} angularDamping={spec.angularDamping ?? 0.15}>
      {spec.box && (
        <CuboidCollider args={[spec.box[0] * M / 2, spec.box[1] * M / 2, spec.box[2] * M / 2]}
          position={[spec.box[3] * M, spec.box[4] * M - U, spec.box[5] * M]} />
      )}
      {spec.cyl && <CylinderCollider args={[spec.cyl.h * M / 2, spec.cyl.r * M]} position={[0, spec.cyl.h * M / 2 - U, 0]} />}
      {spec.cylX && (
        <CylinderCollider args={[spec.cylX.h * M / 2, spec.cylX.r * M]} position={[0, spec.cylX.r * M - U, 0]} rotation={[0, 0, Math.PI / 2]} />
      )}
      <group position={[0, -U, 0]}>
        {parts.map((q, i) => <mesh key={i} geometry={q.geometry} material={mats[q.mat]} castShadow={CASTS.has(q.mat)} receiveShadow />)}
      </group>
    </Body>
  );
}

const propOf = (type) => function CellarPropType({ p }) {
  return <CellarProp p={p} spec={PROP_SPECS[type]} type={type} map={useMap()} />;
};
export const PROPS = Object.fromEntries(Object.keys(PROP_SPECS).map((t) => [t, propOf(t)]));

// ---------------------------------------------------------------- robot
// The cleaning-robot event, cellar edition: a round autonomous scrubber in
// safety yellow, brush skirt, squeegee, and an amber beacon that means it.
const scrubberParts = () => {
  const k = new Kit(WORLD_UV);
  k.cyl('matt', 0.37, 0.05, [0, 0.035, 0], { c: '#2f6fd6', seg: 24 }); // brush skirt
  k.cyl('paint', 0.36, 0.12, [0, 0.12, 0], { c: '#3a3d42', seg: 24 });
  k.cyl('paint', 0.32, 0.26, [0, 0.31, 0], { top: 0.85, c: C.yellow, seg: 24 });
  k.sphere('paint', 0.27, [0, 0.44, 0], { sy: 0.35, c: C.yellow, seg: 18 });
  k.box('matt', [0.62, 0.04, 0.05], [0, 0.03, -0.34], { c: '#111' }); // squeegee
  k.box('paint', [0.18, 0.08, 0.004], [0, 0.34, 0.285], { c: '#1a1a1a' });
  k.box('glow', [0.1, 0.03, 0.002], [0, 0.35, 0.288], { c: '#3dff7a' });
  k.cyl('paint', 0.03, 0.05, [0, 0.54, 0], { c: '#222' });
  return k.finish();
};
function Robot() {
  const parts = useMemo(scrubberParts, []);
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  const mats = cellarMats();
  const beacon = useRef();
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffae2a', toneMapped: false }), []);
  useDispose(glow);
  useFrame(({ clock }) => {
    const on = Math.sin(clock.elapsedTime * 9) > 0;
    glow.color.setRGB(on ? 3 : 0.4, on ? 1.5 : 0.2, on ? 0.2 : 0.03);
  });
  return (
    <group>
      {parts.map((q, i) => <mesh key={i} geometry={q.geometry} material={mats[q.mat]} castShadow={CASTS.has(q.mat)} />)}
      <mesh ref={beacon} position={[0, 0.6 * M, 0]} material={glow}><sphereGeometry args={[0.04 * M, 10, 8]} /></mesh>
    </group>
  );
}
export { Robot };

// ----------------------------------------------------------- ramp skins
// Drawn in the ramp's frame (rising toward +z, foot at z = −l/2). A steel dock
// plate on a painted steel wedge; a scaffold plank propped on whatever it
// leads up to; the lifted floor tile leaned on the spares. The pallet jack's
// fork tips are ramps too, but the jack draws its own forks.
function useSkin(build, r) {
  const parts = useMemo(() => {
    const k = new Kit(WORLD_UV);
    build(k, { l: r.l / M, w: r.w / M, rise: r.rise / M });
    return k.finish();
  }, [r.l, r.w, r.rise]);
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  const mats = cellarMats();
  return parts.map((q, i) => <mesh key={i} geometry={q.geometry} material={mats[q.mat]} castShadow={CASTS.has(q.mat)} receiveShadow />);
}
const deck = (k, { l, rise }, fn) => {
  const angle = Math.atan2(rise, l), len = Math.hypot(l, rise);
  k.stack.push(k.frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, (rise / 2) * M, 0)).multiply(new THREE.Matrix4().makeRotationX(-angle)));
  try { fn(len); } finally { k.stack.pop(); }
};
function DockPlate({ r }) {
  return useSkin((k, d) => {
    const side = [[-d.l / 2 * M, 0], [d.l / 2 * M, 0], [d.l / 2 * M, (d.rise - 0.012) * M]];
    k.part('paint', prism(`dockw${d.l}:${d.rise}`, side, d.w * 0.96 * M), [0, 0, 0], { s: [1 / M, 1 / M, 1 / M], r: [0, -Math.PI / 2, 0], c: '#4a4f55' });
    deck(k, d, (len) => {
      k.box('checker', [d.w, 0.012, len], [0, 0, 0], { c: '#b0b4b8' });
      for (const s of [-1, 1]) k.box('hazard', [0.06, 0.014, len], [s * (d.w / 2 - 0.03), 0.001, 0], { c: '#ffffff' });
      k.box('paint', [d.w, 0.016, 0.05], [0, 0, -len / 2 + 0.025], { c: C.yellow });
    });
  }, r);
}
function Plank({ r }) {
  return useSkin((k, d) => deck(k, d, (len) => {
    k.box('wood', [d.w, 0.035, len], [0, 0, 0], { c: '#d2b27c' });
    for (const s of [-1, 1]) k.box('steel', [d.w + 0.004, 0.039, 0.03], [0, 0, s * (len / 2 - 0.04)], { c: '#9aa0a3' });
    for (let z = -len / 2 + 0.3; z < len / 2 - 0.2; z += 0.4) k.box('matt', [0.01, 0.002, 0.01], [d.w * 0.3, 0.018, z], { c: '#444' });
  }), r);
}
function LiftedTile({ r }) {
  return useSkin((k, d) => deck(k, d, (len) => {
    k.box('raised', [d.w, 0.033, len], [0, 0, 0], { c: '#ffffff' });
    k.box('paint', [d.w + 0.004, 0.02, len + 0.004], [0, -0.012, 0], { c: '#2a2d31' });
  }), r);
}
export const RAMP_SKINS = { cellar_dockplate: DockPlate, cellar_plank: Plank, cellar_tile: LiftedTile, cellar_fork: () => null };
