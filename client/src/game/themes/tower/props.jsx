// The 48th floor's loose things: every one a live physics body (propBody's
// <Body>), so they join the shared chaos — sixteen leather chairs round the
// boardroom table, laptops and name placards on it, golf balls on the green,
// orchids on the assistants' desks, a brass bar cart that rolls when you hit
// it. Each type is one merged geometry per material, shared by every copy:
// a chair is two draws, a golf ball one.
import { useMemo, useEffect } from 'react';
import { CuboidCollider, CylinderCollider, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { Body } from '../../propBody.jsx';
import { mat, propGeometry, G, canvas, SHADOW_MATS } from './kit.js';
import { C } from './build.js';

// A body sits 0.4 units above its spawn point (propBody.jsx); every model
// here is built with its base at that offset so it lands, not drops.
const B0 = -0.4 / M;
const u = (v) => v * M;

// Only the big things cast shadows: a golf ball's shadow is a pixel, and
// every caster is another draw in the shadow pass.
function Meshes({ geos, shadow = false }) {
  return Object.entries(geos).map(([key, g]) => (
    <mesh key={key} geometry={g} material={mat(key)} castShadow={shadow && SHADOW_MATS.has(key)} receiveShadow={key !== 'glow'} />
  ));
}

// ----------------------------------------------------------- chairs
// A five-star base, a gas lift, a seat and a back. The boardroom chair is
// high-backed oxblood... no: black leather and chrome; the task chair is
// grey mesh on black.
function chairParts(p, task) {
  const seat = task ? '#3a3d44' : '#1f1b1a', frame = task ? '#26282c' : '#d6dbe0';
  // the task chair's frame is black plastic: one material, one draw
  const fm = task ? 'satin' : 'metal';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.add(G.box(0.05, 0.03, 0.3), fm, frame, Math.sin(a) * 0.15, B0 + 0.07, Math.cos(a) * 0.15, 0, a, 0);
    p.add(G.sphere(0.028, 8, 6), 'satin', '#15161a', Math.sin(a) * 0.29, B0 + 0.028, Math.cos(a) * 0.29);
  }
  p.post(fm, frame, 0.025, 0.36, 0, B0 + 0.08, 0, 10);
  p.add(G.box(0.5, 0.08, 0.48, 0.035), 'satin', seat, 0, B0 + 0.47, 0.02);
  const backH = task ? 0.5 : 0.66;
  p.add(G.box(0.48, backH, 0.07, 0.03), 'satin', seat, 0, B0 + 0.52 + backH / 2, -0.23, -0.12, 0, 0);
  if (!task) {
    // a stitched roll along the top of the back, chrome arms
    p.rod('satin', seat, 0.045, 0.46, 0, B0 + 0.54 + backH, -0.28, 'x', 10);
    for (const s of [-1, 1]) {
      p.box('metal', frame, 0.03, 0.02, 0.36, s * 0.27, B0 + 0.66, 0.0, 0.008);
      p.box('metal', frame, 0.025, 0.16, 0.025, s * 0.27, B0 + 0.57, -0.14, 0.004);
    }
  } else {
    for (const s of [-1, 1]) p.box('satin', '#15161a', 0.04, 0.2, 0.26, s * 0.27, B0 + 0.6, -0.02, 0.01);
  }
}
function Chair({ p, task = false }) {
  const geos = propGeometry(task ? 'tchair' : 'bchair', (q) => chairParts(q, task));
  return (
    <Body p={p} mass={task ? 3 : 4} angularDamping={0.1} friction={0.35}>
      <CylinderCollider args={[u(0.02), u(0.3)]} position={[0, u(B0 + 0.06), 0]} />
      <CylinderCollider args={[u(0.18), u(0.03)]} position={[0, u(B0 + 0.26), 0]} />
      <CuboidCollider args={[u(0.25), u(0.04), u(0.24)]} position={[0, u(B0 + 0.47), u(0.02)]} />
      <CuboidCollider args={[u(0.24), u(task ? 0.25 : 0.33), u(0.04)]} position={[0, u(B0 + 0.52 + (task ? 0.25 : 0.33)), u(-0.24)]} />
      <Meshes geos={geos} shadow />
    </Body>
  );
}

// a flat screen on a stand, lit (the keyboard is part of the desk)
function Monitor({ p }) {
  const geos = propGeometry('monitor', (q) => {
    q.add(G.box(0.2, 0.012, 0.16, 0.004), 'satin', '#2a2d33', 0, B0 + 0.006, 0);
    q.box('satin', '#2a2d33', 0.04, 0.2, 0.025, 0, B0 + 0.11, -0.03, 0.004);
    q.add(G.box(0.56, 0.34, 0.02, 0.006), 'satin', '#15161a', 0, B0 + 0.33, 0);
    q.add(G.plane(0.53, 0.3), 'glow', '#2c4e78', 0, B0 + 0.33, 0.011);
  });
  return (
    <Body p={p} mass={2.2} friction={0.6}>
      <CuboidCollider args={[u(0.1), u(0.006), u(0.08)]} position={[0, u(B0 + 0.006), 0]} />
      <CuboidCollider args={[u(0.28), u(0.17), u(0.015)]} position={[0, u(B0 + 0.33), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

// a cup and saucer: fine bone china, one draw
function Cup({ p }) {
  const geos = propGeometry('cup', (q) => {
    q.post('gloss', '#f6f4ef', 0.075, 0.008, 0, B0, 0, 20, 0.06);
    const prof = [[0.001, 0.008], [0.03, 0.008], [0.045, 0.03], [0.048, 0.075], [0.044, 0.075], [0.041, 0.035], [0.001, 0.03]].map(([x, y]) => new THREE.Vector2(x, y));
    q.add(new THREE.LatheGeometry(prof, 18), 'gloss', '#f6f4ef', 0, B0, 0);
    q.post('gloss', '#3a2012', 0.042, 0.002, 0, B0 + 0.06, 0, 14);
    q.add(G.torus(0.018, 0.005, 6, 10, Math.PI), 'gloss', '#f6f4ef', 0.05, B0 + 0.05, 0, 0, 0, -Math.PI / 2);
  });
  return (
    <Body p={p} mass={0.3} friction={0.5} restitution={0.15}>
      <CylinderCollider args={[u(0.04), u(0.06)]} position={[0, u(B0 + 0.04), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

// ---------------------------------------------------- on the table
function Laptop({ p }) {
  const geos = propGeometry('laptop', (q) => {
    q.add(G.box(0.32, 0.016, 0.22, 0.004), 'metal', '#b8bcc2', 0, B0 + 0.008, 0);
    q.add(G.box(0.28, 0.002, 0.1), 'satin', '#1b1c20', 0, B0 + 0.0165, 0.02);
    q.add(G.box(0.32, 0.22, 0.008, 0.004), 'metal', '#b8bcc2', 0, B0 + 0.12, -0.13, -0.26, 0, 0);
    q.add(G.plane(0.29, 0.19), 'glow', '#2d4f7a', 0, B0 + 0.121, -0.1245, -0.26, 0, 0);
  });
  return (
    <Body p={p} mass={1.3} friction={0.5}>
      <CuboidCollider args={[u(0.16), u(0.008), u(0.11)]} position={[0, u(B0 + 0.008), 0]} />
      <CuboidCollider args={[u(0.16), u(0.11), u(0.005)]} position={[0, u(B0 + 0.12), u(-0.13)]} rotation={[-0.26, 0, 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

// name tents: CEO, CFO, COO, HEAD OF SYNERGY — in turn round the table
const NAMES = ['CEO', 'CFO', 'COO', 'HEAD OF SYNERGY'];
const placardMat = (name) => new THREE.MeshStandardMaterial({
  roughness: 0.5,
  map: canvas(`tplacard-${name}`, 256, 80, (g, w, h) => {
    g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8893b'; g.fillRect(0, h - 8, w, 8);
    g.fillStyle = '#1f2a44'; g.font = `bold ${name.length > 6 ? 26 : 44}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 - 3);
  }, { wrap: false }),
});
const placardMats = {};
function Placard({ p }) {
  // by the prop's index, so every client (and every visit) seats the same
  // names — a mount counter drifted on each trip back to the tower
  const name = NAMES[(p.i ?? 0) % NAMES.length];
  const m = placardMats[name] || (placardMats[name] = placardMat(name));
  const geo = useMemo(() => new THREE.BoxGeometry(u(0.24), u(0.08), u(0.004)), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <Body p={p} mass={0.1} friction={0.6}>
      <CuboidCollider args={[u(0.12), u(0.035), u(0.03)]} position={[0, u(B0 + 0.035), 0]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo} material={m} position={[0, u(B0 + 0.037), u(s * 0.02)]} rotation-x={s * -0.5} rotation-y={s > 0 ? 0 : Math.PI} />
      ))}
    </Body>
  );
}

function Carafe({ p }) {
  const geos = propGeometry('carafe', (q) => {
    const prof = [[0.001, 0], [0.06, 0], [0.065, 0.02], [0.065, 0.12], [0.04, 0.2], [0.03, 0.26], [0.034, 0.27]].map(([x, y]) => new THREE.Vector2(x, y));
    q.add(new THREE.LatheGeometry(prof, 20), 'glass', null, 0, B0, 0);
    const water = [[0.001, 0.004], [0.058, 0.004], [0.061, 0.02], [0.061, 0.12], [0.001, 0.12]].map(([x, y]) => new THREE.Vector2(x, y));
    q.add(new THREE.LatheGeometry(water, 20), 'gloss', '#9fc3cf', 0, B0, 0);
  });
  return (
    <Body p={p} mass={0.9} friction={0.5} restitution={0.1}>
      <CylinderCollider args={[u(0.135), u(0.06)]} position={[0, u(B0 + 0.135), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

function Binder({ p }) {
  const geos = propGeometry('binder', (q) => {
    q.add(G.box(0.3, 0.032, 0.22, 0.004), 'satin', '#1f2a44', 0, B0 + 0.016, 0);
    q.add(G.box(0.296, 0.024, 0.214), 'matte', '#f2efe6', 0.006, B0 + 0.016, 0);
    q.add(G.box(0.12, 0.002, 0.03), 'metal', '#b8893b', 0, B0 + 0.033, 0.04);
  });
  return (
    <Body p={p} mass={0.7} friction={0.6}>
      <CuboidCollider args={[u(0.15), u(0.016), u(0.11)]} position={[0, u(B0 + 0.016), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

// ------------------------------------------------- the corner office
function GolfBall({ p }) {
  const geos = propGeometry('golf', (q) => q.add(G.sphere(0.0214, 14, 10), 'gloss', '#f7f7f4', 0, B0 + 0.0214, 0));
  return (
    <Body p={p} mass={0.05} friction={0.3} restitution={0.6} angularDamping={0.4} ccd>
      <BallCollider args={[u(0.0214)]} position={[0, u(B0 + 0.0214), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

function Putter({ p }) {
  const geos = propGeometry('putter', (q) => {
    q.rod('metal', '#d6dbe0', 0.006, 0.86, 0, B0 + 0.012, 0, 'x', 8);
    q.rod('satin', '#15161a', 0.012, 0.26, -0.36, B0 + 0.014, 0, 'x', 8);
    q.box('metal', '#9aa0a8', 0.03, 0.024, 0.11, 0.44, B0 + 0.012, 0.03, 0.004);
  });
  return (
    <Body p={p} mass={0.4} friction={0.5}>
      <CuboidCollider args={[u(0.46), u(0.012), u(0.02)]} position={[0, u(B0 + 0.012), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

function Orchid({ p }) {
  const geos = propGeometry('orchid', (q) => {
    q.post('gloss', '#f4f2ee', 0.06, 0.12, 0, B0, 0, 16, 0.05);
    q.post('matte', C.soil, 0.055, 0.005, 0, B0 + 0.115, 0, 12);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      q.add(G.sphere(0.07, 10, 6), 'matte', '#2f5a2a', Math.sin(a) * 0.05, B0 + 0.13, Math.cos(a) * 0.05, 0, a, 0, 1, 0.12, 0.45);
    }
    q.add(G.cyl(0.003, 0.003, 0.38), 'matte', '#4a6a3a', 0.01, B0 + 0.3, 0, 0, 0, 0.12);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      q.add(G.sphere(0.028, 8, 6), 'matte', i % 2 ? '#f6f1f4' : '#f3d9e6', 0.03 + t * 0.12, B0 + 0.44 - t * t * 0.1, Math.sin(i) * 0.02, 0, 0, 0, 1, 0.55, 1);
    }
  });
  return (
    <Body p={p} mass={0.6} friction={0.6}>
      <CylinderCollider args={[u(0.06), u(0.06)]} position={[0, u(B0 + 0.06), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

// ---------------------------------------------------------- the lounge
function ClubChair({ p }) {
  const geos = propGeometry('clubchair', (q) => {
    const L = '#5a1f1b';
    for (const s of [-1, 1]) for (const k of [-1, 1]) q.post('matte', '#3b2a1f', 0.025, 0.08, s * 0.33, B0, k * 0.3, 8, 0.018);
    q.add(G.box(0.84, 0.3, 0.8, 0.06), 'satin', L, 0, B0 + 0.23, 0);
    q.add(G.box(0.56, 0.1, 0.6, 0.05), 'satin', L, 0, B0 + 0.42, 0.08);
    q.add(G.box(0.84, 0.44, 0.2, 0.08), 'satin', L, 0, B0 + 0.58, -0.3);
    for (const s of [-1, 1]) {
      q.add(G.box(0.16, 0.3, 0.8, 0.06), 'satin', L, s * 0.34, B0 + 0.48, 0);
      q.rod('satin', L, 0.085, 0.8, s * 0.35, B0 + 0.62, 0, 'z', 12);
    }
  });
  return (
    <Body p={p} mass={14} friction={0.8} angularDamping={0.6}>
      <CuboidCollider args={[u(0.42), u(0.2), u(0.4)]} position={[0, u(B0 + 0.28), 0]} />
      <CuboidCollider args={[u(0.42), u(0.2), u(0.1)]} position={[0, u(B0 + 0.62), u(-0.3)]} />
      <Meshes geos={geos} shadow />
    </Body>
  );
}

function BarCart({ p }) {
  const geos = propGeometry('barcart', (q) => {
    for (const [x, z] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) q.box('metal', '#c09045', 0.02, 0.8, 0.02, x, B0 + 0.47, z, 0.004);
    for (const y of [0.3, 0.8]) {
      q.box('glass', null, 0.76, 0.01, 0.4, 0, B0 + y, 0, 0);
      q.box('metal', '#c09045', 0.8, 0.02, 0.02, 0, B0 + y, 0.21, 0.004);
      q.box('metal', '#c09045', 0.8, 0.02, 0.02, 0, B0 + y, -0.21, 0.004);
    }
    q.rod('metal', '#c09045', 0.012, 0.5, -0.44, B0 + 0.86, 0, 'z', 8);
    for (const [x, z] of [[0.38, -0.2], [0.38, 0.2]]) q.rod('satin', '#15161a', 0.07, 0.03, x, B0 + 0.07, z, 'z', 16);
    for (const [x, z] of [[-0.38, -0.2], [-0.38, 0.2]]) q.post('satin', '#15161a', 0.025, 0.07, x, B0, z, 8);
    const bottles = [['#6b3a12', -0.25], ['#2f4a26', -0.1], ['#d8d2c0', 0.05]];
    for (const [c, x] of bottles) { q.post('gloss', c, 0.035, 0.22, x, B0 + 0.81, -0.08, 10); q.post('gloss', c, 0.012, 0.07, x, B0 + 1.03, -0.08, 6); }
    q.post('metal', '#c09045', 0.06, 0.14, 0.22, B0 + 0.81, 0.06, 14, 0.05);
    q.post('gloss', '#e8f0f2', 0.035, 0.08, -0.2, B0 + 0.31, 0.1, 10);
  });
  return (
    <Body p={p} mass={6} friction={0.12} angularDamping={0.5}>
      <CuboidCollider args={[u(0.42), u(0.43), u(0.22)]} position={[0, u(B0 + 0.45), 0]} />
      <Meshes geos={geos} shadow />
    </Body>
  );
}

function Stool({ p }) {
  const geos = propGeometry('stool', (q) => {
    q.post('metal', '#26282c', 0.2, 0.02, 0, B0, 0, 20);
    q.post('metal', '#d6dbe0', 0.025, 0.66, 0, B0 + 0.02, 0, 10);
    q.add(G.torus(0.16, 0.01, 6, 24), 'metal', '#c09045', 0, B0 + 0.28, 0, Math.PI / 2, 0, 0);
    q.post('satin', '#5a1f1b', 0.18, 0.06, 0, B0 + 0.68, 0, 20, 0.16);
  });
  return (
    <Body p={p} mass={3} friction={0.5}>
      <CylinderCollider args={[u(0.01), u(0.2)]} position={[0, u(B0 + 0.01), 0]} />
      <CylinderCollider args={[u(0.33), u(0.03)]} position={[0, u(B0 + 0.35), 0]} />
      <CylinderCollider args={[u(0.03), u(0.18)]} position={[0, u(B0 + 0.71), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

// ------------------------------------------------------------- the rest
function Briefcase({ p }) {
  const geos = propGeometry('briefcase', (q) => {
    q.add(G.box(0.44, 0.32, 0.1, 0.02), 'satin', '#3a2418', 0, B0 + 0.16, 0);
    q.add(G.torus(0.05, 0.01, 6, 12, Math.PI), 'satin', '#2a1a12', 0, B0 + 0.32, 0);
    for (const s of [-1, 1]) q.box('metal', '#c09045', 0.03, 0.02, 0.012, s * 0.12, B0 + 0.3, 0.05, 0.003);
  });
  return (
    <Body p={p} mass={1.6} friction={0.7}>
      <CuboidCollider args={[u(0.22), u(0.16), u(0.05)]} position={[0, u(B0 + 0.16), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

function Fruit({ p }) {
  const geos = propGeometry('fruit', (q) => {
    const prof = [[0.001, 0], [0.07, 0], [0.14, 0.06], [0.16, 0.09], [0.15, 0.09], [0.001, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
    q.add(new THREE.LatheGeometry(prof, 24), 'gloss', '#f2f0ea', 0, B0, 0);
    const fr = [[0, 0, '#f0891a'], [0.07, 0.02, '#f0891a'], [-0.06, 0.04, '#c8282a'], [0.02, -0.07, '#9bc23a'], [-0.03, -0.03, '#f0891a']];
    fr.forEach(([x, z, c], i) => q.add(G.sphere(0.038, 12, 8), 'satin', c, x, B0 + 0.07 + (i === 0 ? 0.04 : 0), z));
  });
  return (
    <Body p={p} mass={1} friction={0.6}>
      <CylinderCollider args={[u(0.05), u(0.15)]} position={[0, u(B0 + 0.05), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

function Janitor({ p }) {
  const geos = propGeometry('janitor', (q) => {
    q.box('matte', '#5c6168', 0.9, 0.04, 0.5, 0, B0 + 0.12, 0, 0.01);
    q.box('matte', '#5c6168', 0.9, 0.04, 0.5, 0, B0 + 0.6, 0, 0.01);
    for (const [x, z] of [[-0.43, -0.23], [0.43, -0.23], [-0.43, 0.23], [0.43, 0.23]]) {
      q.box('matte', '#3a3d44', 0.03, 0.9, 0.03, x, B0 + 0.5, z, 0.004);
      q.rod('satin', '#15161a', 0.04, 0.025, x, B0 + 0.04, z, 'z', 12);
    }
    q.post('satin', '#f2c21a', 0.17, 0.3, -0.18, B0 + 0.14, 0, 16, 0.14);
    q.post('matte', '#8aa0b0', 0.155, 0.01, -0.18, B0 + 0.43, 0, 16);
    q.add(G.cyl(0.013, 0.013, 1.3), 'matte', '#2a6ab0', -0.18, B0 + 0.8, 0.05, 0.1, 0, 0.12);
    q.post('satin', '#15161a', 0.16, 0.5, 0.25, B0 + 0.62, 0, 12, 0.18);
    q.box('matte', '#e9e1cf', 0.2, 0.25, 0.3, 0.3, B0 + 0.28, 0, 0.02);
  });
  return (
    <Body p={p} mass={9} friction={0.25} angularDamping={0.6}>
      <CuboidCollider args={[u(0.46), u(0.5), u(0.26)]} position={[0, u(B0 + 0.52), 0]} />
      <Meshes geos={geos} shadow />
    </Body>
  );
}

function Cushion({ p }) {
  const geos = propGeometry('cushion', (q) => q.add(G.box(0.5, 0.1, 0.5, 0.045), 'fabric', C.ivory, 0, B0 + 0.05, 0));
  return (
    <Body p={p} mass={0.4} friction={0.9} angularDamping={0.5}>
      <CuboidCollider args={[u(0.25), u(0.05), u(0.25)]} position={[0, u(B0 + 0.05), 0]} />
      <Meshes geos={geos} />
    </Body>
  );
}

export const PROPS = {
  tower_chair: Chair,
  tower_taskchair: (props) => <Chair {...props} task />,
  tower_laptop: Laptop,
  tower_monitor: Monitor,
  tower_cup: Cup,
  tower_placard: Placard,
  tower_carafe: Carafe,
  tower_binder: Binder,
  tower_golfball: GolfBall,
  tower_putter: Putter,
  tower_orchid: Orchid,
  tower_clubchair: ClubChair,
  tower_barcart: BarCart,
  tower_stool: Stool,
  tower_briefcase: Briefcase,
  tower_fruit: Fruit,
  tower_janitor: Janitor,
  tower_cushion: Cushion,
};
