// Garage Zero's own physics props (the map's PROPS entries with garage_
// types): energy drinks, pizza boxes, beanbags, bar stools, dead towers,
// paint tins, cones, skateboards, garden gnomes, plastic flamingos. Each is
// one or two merged meshes in a shared <Body> (../propBody.jsx), so they
// join the shared chaos like the office's mugs.
import { CuboidCollider, CylinderCollider, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { makeScreen } from '../textures.js';
import { Body } from '../propBody.jsx';
import { kit, cached } from './garageKit.js';
import { KitMeshes } from './garagePieces.jsx';

const u = (v) => v * M;

// Energy drinks: three brands nobody admits to buying in bulk.
const CAN_STYLES = [['#1c1c1c', '#7cff4a'], ['#2f6fd6', '#d9dde2'], ['#f07a1a', '#1c1c1c']];
function Can({ p }) {
  const v = (p.i ?? 0) % 3;
  const [body, band] = CAN_STYLES[v];
  const geos = cached(`can${v}`, () => {
    const k = kit();
    k.cyl('metal', 0.033, 0.033, 0.13, [0, 0, 0], body, null, 12);
    k.cyl('metal', 0.0335, 0.0335, 0.035, [0, 0.01, 0], band, null, 12);
    k.cyl('metal', 0.028, 0.033, 0.012, [0, 0.071, 0], '#d9dde2', null, 12);
    k.cyl('metal', 0.033, 0.028, 0.01, [0, -0.07, 0], '#d9dde2', null, 12);
    return k.build();
  });
  return (
    <Body p={p} mass={0.35} restitution={0.35} angularDamping={0.05}>
      <CylinderCollider args={[u(0.076), u(0.033)]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

function Pizza({ p }) {
  const geos = cached('pizza', () => {
    const k = kit();
    k.box('matte', [0.36, 0.045, 0.36], [0, 0, 0], '#e9e2d2', null, 0.004);
    k.cyl('matte', 0.09, 0.09, 0.002, [0, 0.0235, 0], '#c8261e', null, 16);
    k.box('matte', [0.12, 0.002, 0.03], [0, 0.0237, 0.12], '#c8261e');
    k.box('matte', [0.2, 0.002, 0.004], [0.02, 0.0236, -0.13], '#b59a6a'); // a grease mark
    return k.build();
  });
  return (
    <Body p={p} mass={0.5} friction={0.8}>
      <CuboidCollider args={[u(0.18), u(0.0225), u(0.18)]} />
      <KitMeshes geos={geos} shadow={false} />
    </Body>
  );
}

// Beanbags: heavy, bouncy, and in the way — the dev pit's bumpers.
const BAG_COLS = ['#e0703a', '#3f8f8a', '#7a4fa0', '#d9b43a'];
function Beanbag({ p }) {
  const v = (p.i ?? 0) % 4;
  const geos = cached(`bag${v}`, () => {
    const k = kit();
    // a sagging blob: a sphere squashed, the top pushed in where someone sat
    const g = new THREE.SphereGeometry(0.45, 20, 14);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let ny = y * 0.62;
      const r = Math.hypot(x, z);
      if (y > 0) ny -= Math.max(0, 0.18 - r * 0.45) * (y / 0.45); // the dent
      const bulge = y < 0 ? 1 + (-y / 0.45) * 0.12 : 1;
      pos.setXYZ(i, x * bulge + Math.sin(y * 9 + x * 4) * 0.01, ny, z * bulge);
    }
    g.computeVertexNormals();
    k.add('fabric', g, BAG_COLS[v], [0, 0.0, 0]);
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(0.28) }} mass={5} restitution={0.55} friction={0.9} angularDamping={2.5}>
      <CylinderCollider args={[u(0.22), u(0.42)]} position={[0, u(-0.05), 0]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

// Bar stools at the island: tall, light, and they go over.
function Stool({ p }) {
  const geos = cached('stool', () => {
    const k = kit();
    k.cyl('satin', 0.18, 0.18, 0.04, [0, 0.33, 0], '#b8875a', null, 18);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.bar('satin', [Math.cos(a) * 0.1, 0.31, Math.sin(a) * 0.1], [Math.cos(a) * 0.19, -0.33, Math.sin(a) * 0.19], 0.022, '#1f2226');
    }
    k.torus('satin', 0.155, 0.01, [0, -0.08, 0], '#1f2226', [Math.PI / 2, 0, 0], 20);
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(0.33) }} mass={2.5} angularDamping={0.4}>
      <CylinderCollider args={[u(0.02), u(0.18)]} position={[0, u(0.33), 0]} />
      <CylinderCollider args={[u(0.31), u(0.14)]} position={[0, 0, 0]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

// A dead beige tower, waiting to be "repurposed".
function Tower({ p }) {
  const geos = cached('tower', () => {
    const k = kit();
    k.box('satin', [0.19, 0.42, 0.44], [0, 0, 0], '#d8d0bb', null, 0.012);
    k.box('satin', [0.18, 0.12, 0.004], [0, 0.12, 0.221], '#cbc2aa');
    k.box('satin', [0.14, 0.012, 0.004], [0, 0.14, 0.223], '#3a3a3a');
    k.box('satin', [0.14, 0.012, 0.004], [0, 0.1, 0.223], '#3a3a3a');
    k.box('satin', [0.06, 0.02, 0.004], [0, -0.08, 0.223], '#8a8272');
    k.box('satin', [0.002, 0.3, 0.3], [0.096, 0, 0], '#c9c1ab');
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(0.21) }} mass={4} friction={0.8}>
      <CuboidCollider args={[u(0.095), u(0.21), u(0.22)]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

function PaintCan({ p }) {
  const v = (p.i ?? 0) % 3;
  const geos = cached(`paint${v}`, () => {
    const k = kit();
    const col = ['#e6c34a', '#3e7d57', '#b5473a'][v];
    k.cyl('metal', 0.085, 0.085, 0.19, [0, 0, 0], '#c2c7cc', null, 16);
    k.cyl('metal', 0.086, 0.086, 0.1, [0, -0.01, 0], '#f2f0ea', null, 16);
    k.cyl('metal', 0.087, 0.087, 0.04, [0, 0.0, 0], col, null, 16);
    k.box('metal', [0.02, 0.07, 0.004], [0.04, 0.09, 0.075], col, [0, 0.5, 0]); // a drip
    k.torus('metal', 0.08, 0.004, [0, 0.1, 0], '#8d949b', [0, 0, 0], 12, Math.PI);
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(0.095) }} mass={1.2}>
      <CylinderCollider args={[u(0.095), u(0.085)]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

function Cone({ p }) {
  const geos = cached('cone', () => {
    const k = kit();
    k.box('satin', [0.3, 0.03, 0.3], [0, -0.21, 0], '#f0561a', null, 0.01);
    k.cyl('satin', 0.02, 0.12, 0.42, [0, 0.0, 0], '#f0561a', null, 14);
    k.cyl('satin', 0.052, 0.074, 0.07, [0, 0.03, 0], '#f4f4f0', null, 14);
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(0.2) }} mass={0.6} restitution={0.3}>
      <CuboidCollider args={[u(0.15), u(0.015), u(0.15)]} position={[0, u(-0.21), 0]} />
      <CylinderCollider args={[u(0.2), u(0.07)]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

function Skateboard({ p }) {
  const geos = cached('skate', () => {
    const k = kit();
    k.box('wood', [0.2, 0.015, 0.8], [0, 0.03, 0], '#c9a06a', null, 0.006);
    k.box('satin', [0.2, 0.002, 0.8], [0, 0.0385, 0], '#1d1d1d'); // grip tape
    k.box('satin', [0.19, 0.002, 0.6], [0, 0.022, 0], '#ff3d8b'); // graphic underneath
    for (const z of [-0.28, 0.28]) {
      k.box('satin', [0.14, 0.02, 0.04], [0, 0.012, z], '#b9bec4');
      for (const x of [-0.08, 0.08]) k.cyl('satin', 0.026, 0.026, 0.03, [x, -0.004, z], '#f2f0e8', [0, 0, Math.PI / 2], 10);
    }
    return k.build();
  });
  return (
    <Body p={p} mass={0.9} friction={0.04} angularDamping={0.5}>
      <CuboidCollider args={[u(0.1), u(0.03), u(0.4)]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

function Gnome({ p }) {
  const geos = cached('gnome', () => {
    const k = kit();
    k.cyl('satin', 0.07, 0.09, 0.14, [0, -0.06, 0], '#2f5fb0', null, 12); // coat
    k.sphere('satin', 0.05, [0, 0.04, 0], '#f0c8a8', null, 10); // face
    k.add('satin', new THREE.ConeGeometry(0.055, 0.1, 10), '#f4f2ec', [0, 0.0, 0.035], [0.5, 0, 0]); // beard
    k.add('satin', new THREE.ConeGeometry(0.06, 0.15, 12), '#d8261e', [0, 0.14, -0.01], [-0.2, 0, 0]); // hat
    k.sphere('satin', 0.012, [0, 0.045, 0.05], '#e07070', null, 6);
    k.box('satin', [0.14, 0.03, 0.12], [0, -0.14, 0.01], '#5a3a24', null, 0.01);
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(0.15) }} mass={1.5} restitution={0.2}>
      <CylinderCollider args={[u(0.14), u(0.075)]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

function Flamingo({ p }) {
  const geos = cached('flamingo', () => {
    const k = kit();
    const pink = '#ff6fa8';
    k.sphere('gloss', 0.1, [0, 0.2, 0], pink, [0.8, 0.7, 1.4], 12);
    const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.24, 0.1), new THREE.Vector3(0, 0.38, 0.06), new THREE.Vector3(0, 0.44, 0.14)]);
    k.add('gloss', new THREE.TubeGeometry(neck, 10, 0.02, 6), pink);
    k.sphere('gloss', 0.035, [0, 0.46, 0.16], pink, null, 10);
    k.add('gloss', new THREE.ConeGeometry(0.012, 0.06, 6), '#1b1b1b', [0, 0.44, 0.21], [Math.PI / 2 + 0.6, 0, 0]);
    k.bar('gloss', [0.02, 0.14, 0], [0.02, -0.26, 0], 0.006, '#3a3a3a');
    k.bar('gloss', [-0.02, 0.14, 0], [-0.03, -0.26, 0.02], 0.006, '#3a3a3a');
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(0.26) }} mass={0.4} angularDamping={0.3}>
      <BallCollider args={[u(0.09)]} position={[0, u(0.2), 0]} />
      <CuboidCollider args={[u(0.03), u(0.2), u(0.03)]} position={[0, u(-0.06), 0]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

// Monitors: one merged body and a screen showing the office's scrolling
// code (a few shared canvases, ticked by the dressing).
const SCREENS = [];
function screen(i) {
  if (!SCREENS.length) for (const k of ['code', 'code', 'chart']) SCREENS.push(makeScreen(k));
  return SCREENS[i % SCREENS.length];
}
export function tickScreens() {
  for (const sc of SCREENS) if (Math.random() > 0.4) sc.tick();
}
const screenMats = new Map();
function Monitor({ p }) {
  const sc = screen(p.i ?? 0);
  let mat = screenMats.get(sc);
  if (!mat) { mat = new THREE.MeshBasicMaterial({ map: sc.tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }); screenMats.set(sc, mat); }
  const geos = cached('monitor', () => {
    const k = kit();
    k.box('satin', [0.24, 0.018, 0.18], [0, 0.009, 0], '#26282c', null, 0.008);
    k.box('satin', [0.045, 0.32, 0.03], [0, 0.17, -0.05], '#26282c');
    k.box('satin', [0.62, 0.37, 0.03], [0, 0.4, -0.02], '#17181b', null, 0.008);
    k.box('satin', [0.14, 0.012, 0.004], [0, 0.225, -0.003], '#3a3d42');
    return k.build();
  });
  return (
    <Body p={p} mass={1.4} angularDamping={0.6}>
      <CuboidCollider args={[u(0.12), u(0.01), u(0.09)]} position={[0, u(0.01), 0]} />
      <CuboidCollider args={[u(0.31), u(0.185), u(0.02)]} position={[0, u(0.4), u(-0.02)]} />
      <KitMeshes geos={geos} />
      <mesh position={[0, u(0.405), u(-0.004)]} material={mat}>
        <planeGeometry args={[u(0.59), u(0.335)]} />
      </mesh>
    </Body>
  );
}

// Keyboards: mechanical, with an RGB underglow.
function Keyboard({ p }) {
  const geos = cached('keyboard', () => {
    const k = kit();
    k.box('satin', [0.44, 0.025, 0.14], [0, 0.0125, 0], '#1d1e21', null, 0.006);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 15; col++) {
        if (row === 4 && col > 3 && col < 11) continue;
        k.box('satin', [0.022, 0.012, 0.022], [-0.2 + col * 0.0285, 0.03, -0.055 + row * 0.027], col % 7 === 3 && row === 1 ? '#e8591a' : '#2e3034');
      }
    }
    k.box('satin', [0.2, 0.012, 0.022], [0, 0.03, 0.053], '#2e3034');
    k.box('glow', [0.42, 0.004, 0.004], [0, 0.004, 0.071], '#b04dff');
    return k.build();
  });
  return (
    <Body p={p} mass={0.6}>
      <CuboidCollider args={[u(0.22), u(0.02), u(0.07)]} position={[0, u(0.02), 0]} />
      <KitMeshes geos={geos} shadow={false} />
    </Body>
  );
}

// Chairs: gaming chairs at the desks, folding chairs round the ping-pong
// table. One merged mesh each.
function Chair({ p }) {
  const folding = (p.i ?? 0) % 2 === 1 && p.x < u(10) && p.z > u(5); // the boardroom's
  const v = folding ? 'fold' : ['#c8261e', '#2f7fe0', '#6fd06a'][(p.i ?? 0) % 3];
  const geos = cached(`chair${v}`, () => {
    const k = kit();
    if (folding) {
      k.box('satin', [0.44, 0.03, 0.42], [0, 0.46, 0], '#6d737a', null, 0.01);
      k.box('satin', [0.42, 0.26, 0.025], [0, 0.72, -0.2], '#6d737a', [-0.12, 0, 0], 0.01);
      for (const sx of [-1, 1]) {
        k.bar('satin', [sx * 0.2, 0.0, -0.2], [sx * 0.2, 0.86, -0.24], 0.022, '#8d949b');
        k.bar('satin', [sx * 0.2, 0.0, 0.2], [sx * 0.2, 0.46, -0.05], 0.022, '#8d949b');
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.bar('satin', [0, 0.08, 0], [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], 0.04, '#1b1c1f');
        k.sphere('satin', 0.03, [Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3], '#111', null, 8);
      }
      k.cyl('satin', 0.025, 0.025, 0.34, [0, 0.25, 0], '#8d949b', null, 8);
      k.box('satin', [0.52, 0.1, 0.5], [0, 0.46, 0], '#1b1c1f', null, 0.04);
      k.box('satin', [0.36, 0.02, 0.4], [0, 0.515, 0.02], v);
      k.box('satin', [0.48, 0.66, 0.09], [0, 0.86, -0.26], '#1b1c1f', [-0.12, 0, 0], 0.04);
      k.box('satin', [0.18, 0.5, 0.02], [0, 0.86, -0.215], v, [-0.12, 0, 0]);
      k.box('satin', [0.3, 0.09, 0.1], [0, 1.15, -0.29], '#1b1c1f', [-0.12, 0, 0], 0.04);
      for (const sx of [-1, 1]) {
        k.box('satin', [0.06, 0.03, 0.26], [sx * 0.27, 0.66, 0], '#1b1c1f', null, 0.01);
        k.box('satin', [0.03, 0.16, 0.03], [sx * 0.27, 0.57, -0.05], '#1b1c1f');
        k.box('satin', [0.03, 0.42, 0.08], [sx * 0.23, 0.88, -0.24], v, [-0.12, 0, 0]);
      }
    }
    return k.build();
  });
  return (
    <Body p={p} mass={3} angularDamping={0.4}>
      <CuboidCollider args={[u(0.25), u(0.05), u(0.24)]} position={[0, u(0.46), 0]} />
      <CuboidCollider args={[u(0.24), u(0.3), u(0.05)]} position={[0, u(0.85), u(-0.25)]} />
      <CylinderCollider args={[u(0.2), u(0.06)]} position={[0, u(0.22), 0]} />
      <CuboidCollider args={[u(0.26), u(0.02), u(0.26)]} position={[0, u(0.04), 0]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

// Moving boxes: taped cardboard, one mesh. (The office's box is two.)
function MovingBox({ p }) {
  const v = (p.i ?? 0) % 3;
  const S = [0.34, 0.3, 0.38][v];
  const geos = cached(`mbox${v}`, () => {
    const k = kit();
    k.box('matte', [S, S, S], [0, 0, 0], ['#c1935a', '#b98a54', '#caa06a'][v]);
    k.box('matte', [S * 0.22, 0.003, S + 0.004], [0, S / 2 + 0.001, 0], '#d8c49a'); // tape
    k.box('matte', [S * 0.4, S * 0.25, 0.003], [0, 0.02, S / 2 + 0.001], '#f4f1e8'); // label
    return k.build();
  });
  return (
    <Body p={{ ...p, y: p.y + u(S / 2) }} mass={1.4} friction={0.9}>
      <CuboidCollider args={[u(S / 2), u(S / 2), u(S / 2)]} />
      <KitMeshes geos={geos} />
    </Body>
  );
}

export const PROPS = {
  garage_box: MovingBox,
  garage_monitor: Monitor,
  garage_keyboard: Keyboard,
  garage_chair: Chair,
  garage_can: Can,
  garage_pizza: Pizza,
  garage_beanbag: Beanbag,
  garage_stool: Stool,
  garage_tower: Tower,
  garage_paintcan: PaintCan,
  garage_cone: Cone,
  garage_skateboard: Skateboard,
  garage_gnome: Gnome,
  garage_flamingo: Flamingo,
};
