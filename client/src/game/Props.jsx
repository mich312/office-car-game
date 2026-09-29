// Every small object in the office is a live physics body. Nothing is
// decoration: mugs tip, chairs spin, papers scatter, glasses shatter,
// plants dump soil, monitors face-plant off desks.
//
// Shared chaos: when the LOCAL car whacks a prop, its resulting momentum is
// relayed (throttled) through the server, and every other client applies the
// same impulse to its copy of that prop — so the mug you punted crosses your
// friend's racing line too. Exact resting spots may differ; props settle, so
// divergence self-heals.
//
// What they look like lives in propModels.js; here each prop is its body
// (colliders, mass, behaviour) plus <Inst> markers that the instancer
// (propKit.jsx) draws — every mug on the floor in one call.
import { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider, BallCollider, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useMap, currentMap } from './activeMap.js';
import { makeScreen } from './textures.js';
import { burst } from './particles.jsx';
import { audio } from '../audio.js';
import { on } from '../net.js';
import { Body, propRefs, flushPropHits, impactSound } from './propBody.jsx';
import { PropInstances, Inst, defineMaterial, seeded, pick } from './propKit.jsx';
import './propModels.js';
import { PROP_PIECES } from './themes/index.js';

const m2u = M; // meters → units shorthand

// A map's PROPS entries + their index, built once per map so the identity
// stays stable across renders (the prop components are memo'd on it).
const indexedCache = new WeakMap();
const indexedProps = (map) => {
  let l = indexedCache.get(map);
  if (!l) { l = map.PROPS.map((base, i) => ({ ...base, i })); indexedCache.set(map, l); }
  return l;
};

// Three live desktop screens shared by every monitor (a monitor shows one of
// them), each drawn by its own instanced screen model.
let _screens = null;
const screens = () => (_screens ??= [makeScreen('code'), makeScreen('chart'), makeScreen('code')]);
for (let k = 0; k < 3; k++) {
  defineMaterial(`screen${k}`, () => new THREE.MeshBasicMaterial({ map: screens()[k].tex, toneMapped: false }));
}

export default function Props() {
  const map = useMap();
  useEffect(() => {
    const iv = setInterval(() => screens().forEach((s) => Math.random() > 0.4 && s.tick()), 300);
    return () => clearInterval(iv);
  }, []);
  // apply relayed whacks from other players to our local copies
  useEffect(() => on('fx', (fx) => {
    if (fx.type !== 'prop' || !Array.isArray(fx.im)) return;
    const b = propRefs.get(fx.i)?.current;
    if (!b) return;
    b.wakeUp?.();
    b.applyImpulse({ x: fx.im[0], y: fx.im[1], z: fx.im[2] }, true);
  }), []);
  useFrame(flushPropHits);
  let monitorIdx = 0;
  return (
    <group>
      <SpawnedProps />
      {indexedProps(map).map((p, i) => {
        // The index rides along so a whacked prop knows which slot to relay,
        // but it's attached to a copy — PROPS is shared module state that the
        // server imports too, and render is no place to mutate it.
        const key = `${p.type}${i}`;
        switch (p.type) {
          case 'mug': return <Mug key={key} p={p} />;
          case 'glass': return <GlassCup key={key} p={p} />;
          case 'pen': return <Pen key={key} p={p} />;
          case 'stack': return <PaperStack key={key} p={p} />;
          case 'book': return <Book key={key} p={p} />;
          case 'keyboard': return <Keyboard key={key} p={p} />;
          case 'monitor': return <Monitor key={key} p={p} screen={monitorIdx++ % 3} />;
          case 'chair': return <Chair key={key} p={p} />;
          case 'plant': return <Plant key={key} p={p} />;
          case 'bottle': return <Bottle key={key} p={p} />;
          case 'basketball': return <Basketball key={key} p={p} />;
          case 'marble': return <Marble key={key} p={p} />;
          case 'box': return <CardboardBox key={key} p={p} />;
          case 'lamp': return <Lamp key={key} p={p} />;
          case 'trash': return <Trash key={key} p={p} />;
          case 'roll': return <Roll key={key} p={p} />;
          default: {
            // a map theme's own props (themes/*.jsx)
            const Piece = PROP_PIECES[p.type];
            return Piece ? <Piece key={key} p={p} /> : null;
          }
        }
      })}
      {/* last: its frame callback must run after everything above has moved */}
      <PropInstances />
    </group>
  );
}

// Per-prop variety that every client agrees on: a map prop is seeded by its
// map and index; a spawned one (no index) by its own random seed.
function useSeed(p, salt = 0) {
  return useMemo(() => (p.i === undefined ? Math.random() : seeded(currentMap().id, p.i, salt)), [p, salt]);
}
const colorCache = new Map();
const col = (hex) => {
  let c = colorCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); }
  return c;
};

// -------------------------------------------- server-spawned ephemera
// Mug Rain drops mugs from the ceiling, the vending machine ejects cans
// (golden = the rammer got a free powerup), the printer blasts paper.
// All clients get the same events, so everyone sees the same debris.
function SpawnedProps() {
  const [items, setItems] = useState([]);
  useEffect(() => on('fx', (fx) => {
    if (fx.type === 'mug_drop' && Array.isArray(fx.at)) {
      // its prop object is made once, here: a fresh one per render re-rolled
      // every mug's glaze each time another mug or a can arrived
      setItems((l) => [...l.slice(-17), { kind: 'mug', p: { x: fx.at[0], y: fx.at[1], z: fx.at[2] }, key: Math.random() }]);
    } else if (fx.type === 'vending') {
      audio.blip(fx.golden ? 990 : 520, 0.12, 0.16);
      const flap = vendingFlap(currentMap());
      burst([flap.x, 1.1, flap.z], { count: fx.golden ? 26 : 10, color: fx.golden ? ['#ffd700', '#fff2b0'] : ['#e8332a', '#dfe4ea'], speed: 6, size: 0.09, ttl: 0.8 });
      setItems((l) => [...l.slice(-17), { kind: 'can', golden: fx.golden, key: Math.random() }]);
    } else if (fx.type === 'printer' && Array.isArray(fx.at)) {
      burst([fx.at[0], 3.2, fx.at[2]], { count: 46, color: ['#f7f5ef', '#ffffff', '#e8e4da'], speed: 11, size: 0.16, ttl: 1.4, up: 3 });
      audio.blip(220, 0.25, 0.12);
    }
  }), []);
  return items.map((it) => (it.kind === 'mug'
    ? <Mug key={it.key} p={it.p} />
    : <Can key={it.key} golden={it.golden} />));
}

// The vending machine's dispensing flap: low on its front face. The machine
// faces its local +z turned by rotY (VENDING.rotY, else the furniture entry's
// own); the flap sits 12 cm out from the front so a can never spawns inside
// the machine's collider.
function vendingFlap(map) {
  const V = map.VENDING;
  const F = map.FURNITURE.find((f) => f.type === 'vending' && Math.hypot(f.x - V.x, f.z - V.z) < 0.6 * M);
  const rotY = V.rotY ?? F?.rotY ?? 0;
  const out = (F?.d ?? 0.8 * M) / 2 + 0.12 * M;
  return { x: V.x + Math.sin(rotY) * out, z: V.z + Math.cos(rotY) * out, rotY };
}

function Can({ golden }) {
  const R = 0.033 * m2u, H = 0.115 * m2u;
  const { spawn, v } = useMemo(() => {
    const f = vendingFlap(currentMap());
    const side = (Math.random() - 0.5) * 0.3 * M;
    const s = Math.sin(f.rotY), c = Math.cos(f.rotY);
    return {
      // lying across the flap (its axis along the body's x): it rolls out
      // rather than sliding end-first
      spawn: { x: f.x + side * c, y: 0.15 * M, z: f.z - side * s, rotY: f.rotY + (Math.random() - 0.5) * 0.5 },
      // rolls out of the flap toward whoever rammed the machine
      v: [s * 1.2 * M, 0.4 * M, c * 1.2 * M],
    };
  }, []);
  return (
    <Body p={spawn} mass={0.35} restitution={0.4} angularDamping={0.05} base={R} linvel={v}>
      <group rotation-z={Math.PI / 2}>
        <CylinderCollider args={[H / 2, R]} />
        <Inst model={golden ? 'canGold' : 'can'} />
      </group>
    </Body>
  );
}

const GLAZES = ['#f4f1ea', '#e8503a', '#2f6f8f', '#e3b23c', '#9db59a', '#23395d', '#f4f1ea', '#d9d4ec'];
function Mug({ p }) {
  const glaze = col(pick(GLAZES, useSeed(p)));
  const R = 0.045 * m2u, H = 0.1 * m2u;
  return (
    <Body p={p} mass={0.5} base={H / 2}>
      <CylinderCollider args={[H / 2, R]} />
      <Inst model="mug" color={glaze} />
      <Inst model="coffee" />
    </Body>
  );
}

function GlassCup({ p }) {
  const [broken, setBroken] = useState(false);
  const R = 0.04 * m2u, H = 0.12 * m2u;
  if (broken) return null;
  return (
    <Body
      p={p}
      mass={0.3}
      restitution={0.1}
      base={H / 2}
      onForce={(e) => {
        if (e.totalForceMagnitude > 4200 && !broken) {
          setBroken(true);
          const t = e.target.rigidBody?.translation();
          if (t) burst([t.x, t.y, t.z], { count: 22, color: ['#cfeef5', '#ffffff', '#9fd8e8'], speed: 9, size: 0.08, ttl: 1.1 });
          audio.glass();
        }
      }}
    >
      <CylinderCollider args={[H / 2, R]} />
      <Inst model="glass" />
    </Body>
  );
}

const INKS = ['#1b5fd6', '#d7302a', '#26282c', '#1f9a55', '#1b5fd6'];
function Pen({ p }) {
  const ink = col(pick(INKS, useSeed(p)));
  const R = 0.009 * m2u, L = 0.145 * m2u;
  return (
    <Body p={p} mass={0.05} friction={0.4} angularDamping={0.05} base={R}>
      <group rotation-z={Math.PI / 2}>
        <CylinderCollider args={[L / 2, R]} />
        <Inst model="pen" color={ink} />
      </group>
    </Body>
  );
}

// A stack of loose bundles — hitting it sends paper flying
const PAPERS = [col('#fbfaf5'), col('#f0eee6'), col('#fbfaf5'), col('#f3efdc')];
function PaperStack({ p }) {
  const W = 0.21 * m2u, D = 0.297 * m2u, T = 0.012 * m2u;
  // The scatter jitter must be memoized: rapier's transform props are
  // reactive, so fresh values on every parent re-render (mute toggle,
  // mutator change, …) would setTranslation every sheet — teleporting
  // scattered paper back into neat stacks mid-match. Seeded, so every
  // client stacks it the same way.
  const sheets = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const r = (k) => seeded(currentMap().id, p.i ?? 0, i * 7 + k) - 0.5;
    return {
      i,
      pos: [p.x + r(1) * 0.05, p.y + 0.15 + i * (T + 0.015), p.z + r(2) * 0.05],
      rotY: (p.rotY || 0) + r(3) * 0.2,
      color: PAPERS[(i + (p.i ?? 0)) % PAPERS.length],
    };
  }), [p, T]);
  return (
    <group>
      {sheets.map(({ i, pos, rotY, color }) => (
        <RigidBody
          key={i}
          position={pos}
          rotation-y={rotY}
          colliders={false}
          mass={0.04}
          friction={0.5}
          linearDamping={0.6}
          angularDamping={0.4}
        >
          <CuboidCollider args={[W / 2, T / 2, D / 2]} />
          <Inst model="sheets" color={color} />
        </RigidBody>
      ))}
    </group>
  );
}

const CLOTHS = ['#8e3b3b', '#2f4f7e', '#2f6e4b', '#a68a3f', '#5c3b8e', '#2f3542', '#b0513a', '#1f5f66'];
function Book({ p }) {
  const cloth = col(pick(CLOTHS, useSeed(p)));
  const W = 0.17 * m2u, H = 0.05 * m2u, L = 0.24 * m2u;
  return (
    <Body p={p} mass={0.9} friction={0.9} base={H / 2}>
      <CuboidCollider args={[W / 2, H / 2, L / 2]} />
      <Inst model="book" color={cloth} />
    </Body>
  );
}

// Origin on the desk. The collider was a 5 cm brick; a keyboard is 3 cm at
// the back, so wheels no longer ride 2 cm above one lying on the floor.
function Keyboard({ p }) {
  const W = 0.44 * m2u, H = 0.032 * m2u, D = 0.15 * m2u;
  // the cellar's IT stock is a decade older than the office's
  const retro = currentMap().theme === 'cellar';
  return (
    <Body p={p} mass={0.7} friction={0.8} base={0}>
      <CuboidCollider args={[W / 2, H / 2, D / 2]} position={[0, H / 2, 0]} />
      <Inst model={retro ? 'keyboardRetro' : 'keyboard'} />
    </Body>
  );
}

function Monitor({ p, screen }) {
  const W = 0.55 * m2u, H = 0.33 * m2u;
  // Origin at the FOOT of the stand: spawned on a desk it settles flat
  // instead of depenetrating downward through the desktop (the old
  // screen-center origin buried the base inside the slab on spawn). The
  // wide, heavy base also keeps desks looking tidy until someone hits them.
  const panelY = 0.45 + H / 2;
  return (
    <Body p={p} mass={1.4} angularDamping={0.6} base={0}>
      {/* stand */}
      <CuboidCollider args={[0.35, 0.03, 0.25]} position={[0, 0.03, 0]} />
      <CuboidCollider args={[0.06, 0.2, 0.06]} position={[0, 0.26, 0]} />
      {/* panel */}
      <CuboidCollider args={[W / 2, H / 2, 0.05]} position={[0, panelY, 0]} />
      <Inst model="monitor" />
      <Inst model={`screen${screen}`} />
    </Body>
  );
}

// Toilet paper — rolls beautifully, weighs nothing, matters deeply.
function Roll({ p }) {
  const R = 0.055 * m2u, W2 = 0.05 * m2u;
  return (
    <Body p={p} mass={0.15} friction={0.5} angularDamping={0.04} base={R}>
      <group rotation-z={Math.PI / 2}>
        <CylinderCollider args={[W2, R]} />
        <Inst model="roll" />
      </group>
    </Body>
  );
}

// Origin on the floor under the casters (it used to be the seat, which put
// the star base 35 cm inside the floor on spawn). Colliders are the same
// shapes as ever, lifted with it. Café and meeting-room chairs are moulded
// shells on dowel legs; the rest are task chairs.
// the café chair's legs, as its model draws them (propModels.js cafechair):
// top under the seat, foot splayed out on the floor
const CAFE_LEGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => {
  const top = new THREE.Vector3(sx * 0.12, 0.43, sz * 0.11 + 0.02), foot = new THREE.Vector3(sx * 0.21, 0, sz * 0.2 + 0.02);
  const d = top.clone().sub(foot);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const mid = top.clone().add(foot).multiplyScalar(0.5 * m2u);
  return { at: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z], half: (d.length() * m2u) / 2 - 0.013 * m2u };
});
const FABRICS = { office: ['#c23b2e', '#c23b2e', '#c23b2e', '#2f4f7e', '#3d4046'], cellar: ['#4a5563', '#3b4a5e', '#5b5f66', '#6b4a3a'] };
const SHELLS = ['#f2efe8', '#e3b23c', '#2f8f8a', '#e8664d', '#f2efe8', '#3b3d42'];
function Chair({ p }) {
  const seatH = 0.45 * m2u;
  const lift = seatH - 0.04; // the old origin's height above the floor
  const r = useSeed(p);
  const { cafe, color } = useMemo(() => {
    const map = currentMap();
    const room = map.roomAt(p.x, p.z)?.id;
    const isCafe = room === 'cafeteria' || room === 'meeting';
    return { cafe: isCafe, color: col(pick(isCafe ? SHELLS : FABRICS[map.theme === 'cellar' ? 'cellar' : 'office'], r)) };
  }, [p, r]);
  return (
    <Body p={p} mass={3.5} angularDamping={0.08} friction={0.3} base={0}>
      {cafe ? (
        // four splayed dowel legs, no column
        CAFE_LEGS.map((l, i) => <CapsuleCollider key={i} args={[l.half, 0.013 * m2u]} position={l.at} rotation={l.rot} />)
      ) : (
        <>
          {/* the star base's arms and casters stand 11 cm tall, the column */}
          <CylinderCollider args={[0.055 * m2u, 0.31 * m2u]} position={[0, 0.055 * m2u, 0]} />
          <CylinderCollider args={[seatH / 2, 0.045 * m2u]} position={[0, -seatH / 2 + 0.1 + lift, 0]} />
        </>
      )}
      {/* seat + back */}
      <CuboidCollider args={[0.24 * m2u, 0.05 * m2u, 0.24 * m2u]} position={[0, 0.1 + lift, 0]} />
      <CuboidCollider args={[0.22 * m2u, 0.26 * m2u, 0.04 * m2u]} position={[0, 0.32 * m2u + lift, -0.22 * m2u]} />
      <Inst model={cafe ? 'cafechair' : 'chair'} color={color} />
    </Body>
  );
}

const POTS = ['#b5623f', '#b5623f', '#ebe6dc', '#3b3d42', '#6f8796'];
function Plant({ p }) {
  const ref = useRef();
  const spilled = useRef(false);
  const leaves = useRef();
  const r = useSeed(p);
  const pot = col(pick(POTS, useSeed(p, 3)));
  useFrame(({ clock }) => {
    if (leaves.current) leaves.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + p.x) * 0.05;
    const rb = ref.current;
    if (rb && !spilled.current) {
      const rot = rb.rotation();
      // tipped over → scatter soil once
      const up = 1 - 2 * (rot.x * rot.x + rot.z * rot.z);
      if (up < 0.45) {
        spilled.current = true;
        const t = rb.translation();
        burst([t.x, t.y + 0.5, t.z], { count: 26, color: ['#4a3220', '#2f2013', '#5c4127'], speed: 6, size: 0.1, ttl: 1.4 });
        audio.impact(0.5);
      }
    }
  });
  const potR = 0.16 * m2u, potH = 0.3 * m2u;
  return (
    <RigidBody ref={ref} position={[p.x, p.y + potH / 2 + 0.05, p.z]} rotation-y={r * Math.PI * 2} colliders={false} mass={2.5} angularDamping={0.4} friction={0.8}
      onContactForce={(e) => impactSound(e.totalForceMagnitude)}>
      <CylinderCollider args={[potH / 2, potR]} />
      <CylinderCollider args={[0.35 * m2u, 0.12 * m2u]} position={[0, potH / 2 + 0.35 * m2u, 0]} />
      <Inst model="pot" color={pot} />
      {/* leaves sway about the soil line */}
      <group ref={leaves} position={[0, 0.1 * m2u, 0]}>
        <Inst model={r < 0.5 ? 'snake' : 'pothos'} />
      </group>
    </RigidBody>
  );
}

const CAPS = ['#2d7fd0', '#2d7fd0', '#e9ecef', '#39a860'];
function Bottle({ p }) {
  const cap = col(pick(CAPS, useSeed(p)));
  const R = 0.035 * m2u, H = 0.24 * m2u;
  return (
    <Body p={p} mass={0.4} restitution={0.35} angularDamping={0.05} base={R}>
      <group rotation-z={Math.PI / 2}>
        <CylinderCollider args={[H / 2, R]} />
        <Inst model="bottle" color={cap} />
      </group>
    </Body>
  );
}

function Basketball({ p }) {
  const R = 0.121 * m2u;
  return (
    <Body p={p} mass={0.62} restitution={0.82} friction={0.9} angularDamping={0.1} base={R}>
      <BallCollider args={[R]} />
      <Inst model="basketball" />
    </Body>
  );
}

function Marble({ p }) {
  const R = 0.016 * m2u;
  const r = useSeed(p);
  const color = useMemo(() => new THREE.Color().setHSL(r, 0.75, 0.55), [r]);
  return (
    <Body p={p} mass={0.06} restitution={0.6} friction={0.15} ccd base={R}>
      <BallCollider args={[R]} />
      <Inst model="marble" color={color} rotation={[r * 6, r * 17, r * 3]} />
    </Body>
  );
}

// Same carton, a slightly different batch of board each time.
const BOARDS = [col('#ffffff'), col('#f1e8dc'), col('#e8e2da'), col('#fff6e8')];
function CardboardBox({ p }) {
  const S = 0.34 * m2u;
  const board = pick(BOARDS, useSeed(p));
  return (
    <Body p={p} mass={1.4} friction={0.9} base={S / 2}>
      <CuboidCollider args={[S / 2, S / 2, S / 2]} />
      <Inst model="box" color={board} />
    </Body>
  );
}

// Origin under the base (it was mid-stem, which buried the base 12 cm in the
// desk on spawn); the three colliders are unchanged, lifted with it.
const SHADES = ['#e0b03c', '#26282d', '#c23b2e', '#ebe7de'];
function Lamp({ p }) {
  const shade = col(pick(SHADES, useSeed(p)));
  const lift = 0.215 * m2u;
  return (
    <Body p={p} mass={1} angularDamping={0.2} base={0}>
      <CuboidCollider args={[0.09 * m2u, 0.015 * m2u, 0.09 * m2u]} position={[0, -0.2 * m2u + lift, 0]} />
      <CuboidCollider args={[0.02 * m2u, 0.2 * m2u, 0.02 * m2u]} position={[0, lift, 0]} />
      <CuboidCollider args={[0.07 * m2u, 0.05 * m2u, 0.07 * m2u]} position={[0.06 * m2u, 0.2 * m2u + lift, 0]} />
      <Inst model="lamp" color={shade} />
    </Body>
  );
}

const FINISHES = [col('#ffffff'), col('#ffffff'), col('#3a3c42')];
function Trash({ p }) {
  const finish = pick(FINISHES, useSeed(p));
  const R = 0.14 * m2u, H = 0.35 * m2u;
  return (
    <Body p={p} mass={0.9} friction={0.6} base={H / 2}>
      <CylinderCollider args={[H / 2, R]} />
      <Inst model="trash" color={finish} />
    </Body>
  );
}
