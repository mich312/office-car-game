// The cellar's moving parts: rack LEDs, the boiler's pilot flame and fault
// lamp, the dock beacon, the helpdesk's NOW SERVING board, the lab's scope,
// PVC strip curtains that part round a car, the archive's rolling shelf bay,
// the server hall badge reader, sprinkler heads, a drip, and the room tone.
// Everything is cheap: instanced, or a single small mesh, and nothing
// allocates per frame.
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, ConvexHullCollider } from '@react-three/rapier';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import { net } from '../../net.js';
import { glowTex } from '../textures.js';
import { pieceFrame, mobile } from './cellar-pieces.js';
import { Kit, rng } from './cellar-kit.js';
import { cellarMats, WORLD_UV, decalTex, decalUV } from './cellar-tex.js';
import { tubeLayout, tubeLevel, cellarNow } from './cellar-tubes.jsx';
import { labelsFor } from './cellar-labels.js';
import { useMap } from '../activeMap.js';

const _o = new THREE.Object3D();
const _c = new THREE.Color();

// a piece's local point → world units
function toWorld(fr, lx, ly, lz, out = new THREE.Vector3()) {
  const c = Math.cos(fr.rot), s = Math.sin(fr.rot);
  return out.set((fr.x + lx * c + lz * s) * M, ly * M, (fr.z - lx * s + lz * c) * M);
}
// every car we know about, [x, z] in units (reused array)
const _cars = [];
function carSpots() {
  _cars.length = 0;
  const me = typeof window !== 'undefined' ? window.__rcTelemetry : null;
  if (me && me.x !== undefined) _cars.push(me.x, me.z);
  for (const buf of net.remotes.values()) {
    const s = buf[buf.length - 1];
    if (s?.p) _cars.push(s.p[0], s.p[2]);
  }
  return _cars;
}
const serverSeconds = () => (performance.now() + net.clockOffset) / 1000;
// What a component builds for itself (geometry, materials, canvas textures)
// is handed back to the GPU when it unmounts: quick play changes the map
// every round, and R3F only disposes what it created from JSX.
export function useDispose(...things) {
  useEffect(() => () => {
    for (const t of things) {
      if (t?.dispose) t.dispose();
      else if (t) for (const v of Object.values(t)) v?.dispose?.();
    }
  }, things);
}
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

// ------------------------------------------------------------ rack LEDs
// Behind each perforated door: drive-activity blinks, steady status lights,
// the odd amber. Seeded, so every client's hall blinks alike.
export function RackLeds({ map }) {
  const ref = useRef();
  const leds = useMemo(() => {
    const out = [];
    for (const f of map.FURNITURE) {
      if (f.type !== 'cellar_rack') continue;
      const fr = pieceFrame(f);
      const r = rng(Math.round(f.x * 13 + f.z * 7) + 5);
      const net_ = f.kind === 'network';
      const n = net_ ? 40 : 30;
      for (let i = 0; i < n; i++) {
        const lx = -fr.w / 2 + 0.1 + r() * (fr.w - 0.2);
        const ly = net_ ? 1.12 + Math.floor(r() * 4) * 0.22 : 0.2 + r() * (fr.h - 0.45);
        // in front of the perforated door: through the holes they'd alias away
        const lz = fr.d / 2 + (net_ ? -0.015 : 0.004);
        const kind = r();
        out.push({
          p: toWorld(fr, lx, ly, lz), rot: fr.rot,
          color: new THREE.Color(kind < 0.62 ? '#39ff7a' : kind < 0.85 ? '#3d9bff' : '#ffb347').multiplyScalar(2.2),
          speed: kind < 0.4 ? 6 + r() * 14 : 0.4 + r() * 1.5, phase: r() * 20, steady: kind > 0.4 && kind < 0.7,
        });
      }
    }
    return out;
  }, [map]);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.016 * M, 0.011 * M), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useDispose(geo, mat);
  useLayoutEffect(() => {
    leds.forEach((l, i) => {
      _o.position.copy(l.p);
      _o.rotation.set(0, l.rot, 0);
      _o.updateMatrix();
      ref.current.setMatrixAt(i, _o.matrix);
      ref.current.setColorAt(i, l.color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [leds]);
  const lightsOut = useStore((s) => s.event?.id === 'lights_out');
  const frame = useRef(0);
  useFrame(() => {
    // the UPS carries the racks through a blackout: they keep blinking
    if (!ref.current || (frame.current++ & 1)) return;
    const t = cellarNow();
    leds.forEach((l, i) => {
      const on = l.steady || Math.sin(t * l.speed + l.phase) + Math.sin(t * l.speed * 2.7 + l.phase) > -0.2;
      ref.current.setColorAt(i, _c.copy(l.color).multiplyScalar(on ? (lightsOut ? 1.4 : 1) : 0.06));
    });
    ref.current.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, leds.length)]} />;
}

// --------------------------------------------------------------- boiler
// A pilot flame in the sight glass that never quite settles, a red fault
// lamp blinking at 0.5 Hz (nobody knows why), and every so often the burner
// lights with a whoomp and the sight glass flares.
export const burnerCycle = (t) => {
  const c = t % 24;
  return c < 7 ? Math.min(1, c * 2) * (1 - Math.max(0, c - 5) / 2) : 0; // 0…1: the main burner firing
};
export function Boiler({ map }) {
  const f = map.FURNITURE.find((x) => x.type === 'cellar_boiler');
  const spots = useMemo(() => {
    if (!f) return null;
    const fr = pieceFrame(f);
    const R = fr.w / 2 - 0.1;
    return {
      flame: toWorld(fr, 0, 0.4, R + 0.29), lamp: toWorld(fr, 0.62, 1.2, R + 0.1), floor: toWorld(fr, 0, 0.005, R + 0.9),
      rot: fr.rot,
    };
  }, [f]);
  const flame = useRef();
  const mats = useMemo(() => ({
    flame: new THREE.MeshBasicMaterial({ color: '#ff9d4a', toneMapped: false }),
    lamp: new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }),
    pool: additive('#ff8a3c', 0.5),
  }), []);
  useDispose(mats);
  const lit = useRef(false);
  useFrame(() => {
    if (!spots) return;
    const t = cellarNow();
    const burn = burnerCycle(t);
    if (burn > 0 && !lit.current) audio.hiss([spots.flame.x, spots.flame.y, spots.flame.z], 0.5, 0.5);
    lit.current = burn > 0;
    const flick = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1);
    const k = 0.6 * flick + burn * 1.8;
    mats.flame.color.setRGB(1.5 * k, 0.55 * k, 0.12 * k);
    if (flame.current) flame.current.scale.setScalar(0.7 + 0.3 * flick + burn * 0.5);
    const on = Math.floor(t) % 2 === 0; // 0.5 Hz
    mats.lamp.color.setRGB(on ? 3 : 0.15, on ? 0.2 : 0.02, on ? 0.12 : 0.01);
    mats.pool.opacity = 0.18 * flick + burn * 0.5;
  });
  if (!spots) return null;
  return (
    <group>
      <mesh ref={flame} position={spots.flame} rotation-y={spots.rot} material={mats.flame}>
        <circleGeometry args={[0.03 * M, 14]} />
      </mesh>
      <mesh position={spots.lamp} material={mats.lamp}>
        <sphereGeometry args={[0.022 * M, 10, 8]} />
      </mesh>
      <mesh position={spots.floor} rotation-x={-Math.PI / 2} material={mats.pool}>
        <planeGeometry args={[1.6 * M, 1.4 * M]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------- dock beacon
// Amber, turning, over the roller shutter; and dust in the daylight under it.
export function Dock({ map }) {
  const S = map.SHUTTER;
  const spin = useRef();
  const dome = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffae2a', toneMapped: false, transparent: true, opacity: 0.9 }), []);
  const beam = useMemo(() => additive('#ffae2a', 0.5), []);
  useDispose(dome, beam);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (spin.current) spin.current.rotation.y = t * 4.2;
    const k = 0.6 + 0.4 * Math.abs(Math.sin(t * 4.2));
    dome.color.setRGB(2.6 * k, 1.3 * k, 0.2 * k);
  });
  if (!S) return null;
  const w = S.x2 - S.x1, cx = (S.x1 + S.x2) / 2, zf = S.z + 0.1;
  const at = [(cx + w / 2 + 0.25) * M, (S.h + 0.3) * M, (zf + 0.06) * M];
  return (
    <group>
      <group position={at}>
        <mesh material={dome}><sphereGeometry args={[0.055 * M, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <group ref={spin}>
          {[0, Math.PI].map((a) => (
            <mesh key={a} rotation-y={a} position={[Math.sin(a) * 0.5 * M, 0.02 * M, Math.cos(a) * 0.5 * M]} material={beam}>
              <planeGeometry args={[1 * M, 0.25 * M]} />
            </mesh>
          ))}
        </group>
      </group>
      <Sparkles count={36} scale={[w * M, 0.5 * M, 1.4 * M]} position={[cx * M, 0.25 * M, (zf + 0.7) * M]}
        size={1.6} speed={0.18} opacity={0.55} color="#ffcf8a" noise={0.6} />
    </group>
  );
}

// ------------------------------------------------------- NOW SERVING
// The helpdesk's red seven-segment board. It counts up every time somebody
// finishes a lap or scores a goal — the queue is always moving, never for you.
function sevenSeg(g, x, y, w, h, digit, on, off) {
  const segs = [0x7e, 0x30, 0x6d, 0x79, 0x33, 0x5b, 0x5f, 0x70, 0x7f, 0x7b][digit];
  const t = w * 0.18;
  const S = [
    [t, 0, w - 2 * t, t], [w - t, t, t, h / 2 - t], [w - t, h / 2, t, h / 2 - t], [t, h - t, w - 2 * t, t],
    [0, h / 2, t, h / 2 - t], [0, t, t, h / 2 - t], [t, h / 2 - t / 2, w - 2 * t, t],
  ];
  S.forEach(([sx, sy, sw, sh], i) => {
    g.fillStyle = segs & (0x40 >> i) ? on : off;
    g.fillRect(x + sx + 1, y + sy + 1, sw - 2, sh - 2);
  });
}
export function NowServing({ map }) {
  const NS = map.NOW_SERVING;
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    return c;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }), [tex]);
  useDispose(tex, mat);
  // laps banked across the room, goals scored: the queue
  const served = useStore((s) => {
    let n = 0;
    for (const v of Object.values(s.raceProgress || {})) n += v?.[0] || 0;
    return n + (s.teamScores?.[0] || 0) + (s.teamScores?.[1] || 0);
  });
  const last = useRef(null);
  useEffect(() => {
    const g = canvas.getContext('2d');
    const n = ((NS?.start || 0) + served) % 1000;
    g.fillStyle = '#0c0707'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ff3b24'; g.font = 'bold 15px Arial'; g.textAlign = 'left';
    g.fillText('NOW SERVING', 12, 20);
    g.fillText('TICKET', 12, 46);
    g.fillStyle = '#5a1510'; g.fillText('→ DESK', 12, 72);
    const digits = String(n).padStart(3, '0');
    for (let i = 0; i < 3; i++) sevenSeg(g, 118 + i * 44, 12, 36, 72, +digits[i], '#ff3b24', '#2a0c08');
    tex.needsUpdate = true;
    if (last.current !== null && served > last.current && NS) audio.ding([NS.at[0] * M, NS.at[1] * M, NS.at[2] * M], 0.8);
    last.current = served;
  }, [served, canvas, tex, NS]);
  if (!NS) return null;
  const [x, y, z] = NS.at;
  return (
    <mesh position={[(x + Math.sin(NS.rotY) * 0.062) * M, y * M, (z + Math.cos(NS.rotY) * 0.062) * M]} rotation-y={NS.rotY} material={mat}>
      <planeGeometry args={[0.84 * M, 0.315 * M]} />
    </mesh>
  );
}

// -------------------------------------------------------- oscilloscope
// A green trace on the lab bench, redrawn ten times a second.
export function Scope({ map }) {
  const f = map.FURNITURE.find((x) => x.type === 'cellar_bench' && x.kind === 'scope');
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = 128; c.height = 96; return c; }, []);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t; }, [canvas]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }), [tex]);
  useDispose(tex, mat);
  const acc = useRef(0);
  useFrame(({ clock }, dt) => {
    acc.current += dt;
    if (acc.current < 0.1) return;
    acc.current = 0;
    const t = clock.elapsedTime;
    const g = canvas.getContext('2d');
    g.fillStyle = '#061208'; g.fillRect(0, 0, 128, 96);
    g.strokeStyle = 'rgba(80,160,90,0.35)'; g.lineWidth = 1;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, 96); g.stroke(); }
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(128, i * 16); g.stroke(); }
    g.strokeStyle = '#6dff8a'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x <= 128; x += 2) {
      const ph = x * 0.12 + t * 6;
      const y = 48 - Math.sin(ph) * 22 - Math.sin(ph * 3.1) * 5 * Math.sin(t * 0.7);
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    tex.needsUpdate = true;
  });
  if (!f) return null;
  const fr = pieceFrame(f);
  const p = toWorld(fr, 0.49, fr.h + 0.11, 0.025);
  return (
    <mesh position={p} rotation-y={fr.rot} material={mat}>
      <planeGeometry args={[0.17 * M, 0.11 * M]} />
    </mesh>
  );
}

// ------------------------------------------------------ strip curtains
// Clear PVC strips across both ends of the cold aisle. They part round a car
// and swing back; the chase camera goes through them a beat later, which is
// a half-second of blue-grey blur you can use in Tag.
const STRIP_W = 0.2;
export function Curtains({ map }) {
  const strips = useMemo(() => {
    const out = [];
    for (const [x, z1, z2] of map.CURTAINS || []) {
      const n = Math.ceil((z2 - z1) / (STRIP_W * 0.8));
      for (let i = 0; i < n; i++) out.push({ x, z: z1 + (i + 0.5) * ((z2 - z1) / n), a: 0, v: 0 });
    }
    return out;
  }, [map]);
  const ref = useRef();
  const top = 2.25;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(STRIP_W * M, (top - 0.02) * M);
    g.translate(0, -(top - 0.02) * M / 2, 0); // hinge at the rail
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#b8d8e6', transparent: true, opacity: 0.38, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4,
  }), []);
  useDispose(geo, mat);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const cars = carSpots();
    const d = Math.min(dt, 0.05);
    strips.forEach((s, i) => {
      // pushed by any car within reach, away from it; a spring brings it home
      let push = 0;
      for (let c = 0; c < cars.length; c += 2) {
        const dx = cars[c] / M - s.x, dz = cars[c + 1] / M - s.z;
        if (Math.abs(dz) < 0.28 && Math.abs(dx) < 0.35) push += (dx > 0 ? -1 : 1) * (1 - Math.abs(dx) / 0.35) * 5;
      }
      s.v += (push * 1.2 - s.a * 9 - s.v * 2.2) * d;
      s.a = Math.max(-1.1, Math.min(1.1, s.a + s.v * d));
      _o.position.set(s.x * M, top * M, s.z * M);
      _o.rotation.set(0, 0, s.a);
      _o.updateMatrix();
      ref.current.setMatrixAt(i, _o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, strips.length)]} frustumCulled={false} />;
}

// ---------------------------------------------------- the rolling bay
// One bay of the archive's compact shelving rolls along its rails on the
// shared clock: open for a while, closed for a while, grinding in between.
// Kinematic, so it shoves whatever is in the way.
const ROLL_PERIOD = 38;
export function rollOffset(f, t) {
  const [a, b] = f.roll;
  const c = t % ROLL_PERIOD;
  const ease = (u) => u * u * (3 - 2 * u);
  if (c < 15) return a;
  if (c < 19) return a + (b - a) * ease((c - 15) / 4);
  if (c < 34) return b;
  return b + (a - b) * ease((c - 34) / 4);
}
export function RollingShelf({ f }) {
  const fr = pieceFrame(f);
  const body = useRef();
  const map = useMap();
  const parts = useMemo(() => {
    const k = new Kit(WORLD_UV);
    k.slots = labelsFor(map).slots;
    mobile(k, fr, f, rng(9));
    return k.finish();
  }, [f, map]);
  const mats = { ...cellarMats(), ...labelsFor(map).mats };
  const moving = useRef(false);
  useFrame(() => {
    if (!body.current) return;
    const off = rollOffset(f, serverSeconds());
    body.current.setNextKinematicTranslation({ x: (fr.x + off) * M, y: 0, z: fr.z * M });
    const now = off !== f.roll[0] && off !== f.roll[1];
    if (now !== moving.current) audio.clank([(fr.x + off) * M, 0.5 * M, fr.z * M], 0.8);
    moving.current = now;
  });
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[(fr.x + f.roll[0]) * M, 0, fr.z * M]}>
      <CuboidCollider args={[f.w / 2, f.h / 2, f.d / 2]} position={[0, f.h / 2, 0]} />
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={mats[p.mat]} castShadow receiveShadow />
      ))}
    </RigidBody>
  );
}

// ------------------------------------------------------- badge reader
// Red until a car comes to the server hall door, then green and a beep.
export function Badge({ map }) {
  const door = (map.DOORS || []).find((d) => map.DOOR_DRESS?.[d.id]?.badge);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false }), []);
  useDispose(mat);
  const until = useRef(0);
  const spot = useMemo(() => {
    if (!door) return null;
    const side = door.z > 1 ? -1 : 1;
    const x = door.x - side * (door.w / 2 + 0.14), z = door.z + side * (door.t / 2 + 0.022 + 0.016);
    return [x * M, 1.14 * M, z * M];
  }, [door]);
  useFrame(({ clock }) => {
    if (!door) return;
    const t = clock.elapsedTime;
    const cars = carSpots();
    for (let c = 0; c < cars.length; c += 2) {
      if (Math.hypot(cars[c] / M - door.x, cars[c + 1] / M - door.z) < 1.3) {
        if (t > until.current) audio.ding(spot, 0.4, 2093);
        until.current = t + 1.6;
      }
    }
    const ok = t < until.current;
    mat.color.setRGB(ok ? 0.2 : 2.6, ok ? 2.6 : 0.15, ok ? 0.4 : 0.1);
  });
  if (!spot) return null;
  return (
    <mesh position={spot} material={mat}>
      <sphereGeometry args={[0.008 * M, 8, 6]} />
    </mesh>
  );
}

// ---------------------------------------------------------- sprinklers
// The Sprinkler Test: every head on the red mains near you sprays a cone.
const SPRAY = 700;
export function Sprinklers({ heads }) {
  const on = useStore((s) => s.event?.id === 'sprinklers');
  const ref = useRef();
  const drops = useMemo(() => Array.from({ length: SPRAY }, (_, i) => ({ h: 0, t: (i * 0.618) % 1, a: i * 2.39996, r: 0.3 + ((i * 0.37) % 1) })), []);
  const geo = useMemo(() => new THREE.BoxGeometry(0.007 * M, 0.16 * M, 0.007 * M), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.7, depthWrite: false }), []);
  useDispose(geo, mat);
  const near = useRef([]);
  const acc = useRef(9);
  useFrame(({ camera }, dt) => {
    if (!on || !ref.current || !heads.length) return;
    acc.current += dt;
    if (acc.current > 0.5) {
      // the eight heads nearest the camera get the drops
      acc.current = 0;
      near.current = heads.map((h, i) => [Math.hypot(h[0] * M - camera.position.x, h[2] * M - camera.position.z), i])
        .sort((a, b) => a[0] - b[0]).slice(0, 8).map((e) => e[1]);
    }
    const hs = near.current;
    const step = Math.min(dt, 0.1) * 0.9;
    drops.forEach((d, i) => {
      d.t += step;
      if (d.t > 1) { d.t %= 1; d.h = hs[i % hs.length] ?? 0; }
      const h = heads[d.h];
      const fall = d.t;
      // out of the deflector sideways, then down
      const rad = (0.15 + fall * 1.2) * d.r;
      _o.position.set((h[0] + Math.cos(d.a) * rad) * M, (h[1] - fall * fall * h[1]) * M, (h[2] + Math.sin(d.a) * rad) * M);
      _o.rotation.set(Math.sin(d.a) * 0.3, 0, -Math.cos(d.a) * 0.3);
      _o.updateMatrix();
      ref.current.setMatrixAt(i, _o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  if (!on || !heads.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, SPRAY]} frustumCulled={false} />;
}

// ---------------------------------------------------------------- drip
// A drop gathers under the heating main, falls, rings the bucket.
export function Drips({ map }) {
  const spots = map.DRIPS || [];
  const drop = useRef(), ring = useRef();
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8 }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.5, depthWrite: false }), []);
  useDispose(mat, ringMat);
  const top = 2.36, bottom = 0.25;
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (!spots.length || !drop.current) return;
    const t = clock.elapsedTime;
    const P = 2.1, c = t % P;
    const [x, z] = spots[0];
    let y = top;
    if (c < 1.2) { drop.current.scale.setScalar(0.3 + c / 1.2 * 0.7); } else {
      const f = c - 1.2;
      y = top - 4.9 * f * f;
      drop.current.scale.setScalar(1);
    }
    const landed = y <= bottom;
    drop.current.visible = !landed;
    drop.current.position.set(x * M, Math.max(bottom, y) * M, z * M);
    const cycle = Math.floor(t / P);
    if (landed && last.current !== cycle) {
      last.current = cycle;
      plink([x * M, bottom * M, z * M]);
    }
    if (ring.current) {
      const since = landed ? c - 1.2 - Math.sqrt((top - bottom) / 4.9) : 1;
      ring.current.scale.setScalar(0.2 + since * 2.5);
      ringMat.opacity = Math.max(0, 0.5 - since * 0.8);
      ring.current.position.set(x * M, bottom * M + 0.01, z * M);
    }
  });
  if (!spots.length) return null;
  return (
    <group>
      <mesh ref={drop} material={mat}><sphereGeometry args={[0.007 * M, 8, 6]} /></mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} material={ringMat}><ringGeometry args={[0.04 * M, 0.048 * M, 20]} /></mesh>
    </group>
  );
}

// The puddle by the boiler: a dark, glossy sheet the tubes reflect in.
export function Puddles({ map }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    map: decalTex(), color: '#39434a', transparent: true, opacity: 0.75, roughness: 0.03, metalness: 0.6,
    envMapIntensity: 2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5,
  }), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    const [u0, v0, u1, v1] = decalUV('puddle');
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return g;
  }, []);
  useDispose(mat, geo);
  return (
    <group>
      {(map.PUDDLES || []).map(([x, z, w, d], i) => (
        <mesh key={i} geometry={geo} material={mat} position={[x * M, 0.03, z * M]} rotation={[-Math.PI / 2, 0, 0.3]} scale={[w * M, d * M, 1]} />
      ))}
    </group>
  );
}

// -------------------------------------------------- floor-level bumps
// The corridor's cable protectors and the archive's shelf rails are real:
// low enough to drive over, high enough to kick the car.
export function FloorBumps({ map }) {
  const humps = map.HUMPS || [];
  const R = map.RAILS;
  const hull = useMemo(() => {
    // trapezoid 50 cm wide, 5 cm tall, across the corridor
    const out = [];
    for (const z of [-0.88, 2.88]) for (const [x, y] of [[-0.25, 0], [0.25, 0], [0.09, 0.05], [-0.09, 0.05]]) out.push(x * M, y * M, z * M);
    return new Float32Array(out);
  }, []);
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {humps.map((x) => <ConvexHullCollider key={x} args={[hull]} position={[x * M, 0, 0]} />)}
      {R && R.zs.map((z) => (
        <CuboidCollider key={z} args={[((R.x2 - R.x1) / 2) * M, 0.01 * M, 0.025 * M]} position={[((R.x1 + R.x2) / 2) * M, 0.01 * M, z * M]} />
      ))}
    </RigidBody>
  );
}

// --------------------------------------------------------------- sound
// The room tone the engine's beds can't do: the CRAC roaring in the server
// hall (low-passed, and muffled further when you're outside it), a buzz that
// hangs on the nearest bad tube and follows its flicker, drips, the burner's
// whoomp, a distant flush in the pipes.
function plink(at) {
  const G = audio.graph();
  if (!G) return;
  const { ctx, bus } = G;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(1500 + Math.random() * 300, t);
  o.frequency.exponentialRampToValueAtTime(700, t + 0.07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.04, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  const p = pan(ctx, at, bus.sfx);
  o.connect(g); g.connect(p); o.start(t); o.stop(t + 0.15);
}
function pan(ctx, at, dest) {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
  p.refDistance = 3; p.rolloffFactor = 1.1; p.maxDistance = 80;
  p.positionX.value = at[0]; p.positionY.value = at[1]; p.positionZ.value = at[2];
  p.connect(dest);
  return p;
}
export function CellarSound({ map }) {
  const tubes = useMemo(() => tubeLayout(map).filter((t) => t.kind), [map]);
  const crac = map.FURNITURE.find((f) => f.type === 'cellar_crac');
  const boiler = map.FURNITURE.find((f) => f.type === 'cellar_boiler');
  const nodes = useRef(null);
  const lightsOut = useStore((s) => s.event?.id === 'lights_out');
  useEffect(() => {
    const G = audio.graph();
    if (!G) return undefined;
    const { ctx, bus, noiseBuffer } = G;
    const out = {};
    if (crac) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(4); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 900;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = pan(ctx, [crac.x, 1 * M, crac.z], bus.amb);
      src.connect(lp); lp.connect(lp2); lp2.connect(g); g.connect(p); src.start();
      out.crac = { src, g, lp2, p };
    }
    {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 100;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.9;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = pan(ctx, [0, map.WALL_HEIGHT, 0], bus.amb);
      p.refDistance = 2;
      o.connect(bp); bp.connect(g); g.connect(p); o.start();
      out.buzz = { o, g, p };
    }
    out.G = G;
    nodes.current = out;
    return () => {
      try { out.crac?.src.stop(); out.buzz?.o.stop(); } catch { /* already stopped */ }
      out.crac?.g.disconnect(); out.buzz?.g.disconnect();
      out.crac?.p.disconnect(); out.buzz?.p.disconnect();
      nodes.current = null;
    };
  }, [map, crac]);
  const acc = useRef(0);
  const next = useRef({ flush: 30 });
  const lastBurn = useRef(0);
  useFrame(({ camera, clock }, dt) => {
    const N = nodes.current;
    if (!N) return;
    const t = cellarNow(), tl = clock.elapsedTime;
    const G = N.G;
    const now = G.ctx.currentTime;
    // the buzz follows the nearest bad tube, as loud as it is lit
    if (N.buzz && tubes.length) {
      let best = tubes[0], bd = Infinity;
      for (const tb of tubes) {
        const d = Math.hypot(tb.x * M - camera.position.x, tb.z * M - camera.position.z);
        if (d < bd) { bd = d; best = tb; }
      }
      const l = lightsOut ? 0 : tubeLevel(best.kind, t, best.seed);
      N.buzz.g.gain.setTargetAtTime(l > 0.3 ? 0.012 * l : 0, now, 0.02);
      N.buzz.p.positionX.setTargetAtTime(best.x * M, now, 0.1);
      N.buzz.p.positionZ.setTargetAtTime(best.z * M, now, 0.1);
    }
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    // the CRAC: full inside the hall, a muffled rumble through the glass
    if (N.crac) {
      const inHall = map.roomAt(camera.position.x, camera.position.z)?.id === 'server_hall';
      N.crac.g.gain.setTargetAtTime(inHall ? 0.07 : 0.025, now, 0.4);
      N.crac.lp2.frequency.setTargetAtTime(inHall ? 900 : 320, now, 0.4);
    }
    // the burner lights with a whoomp when the pilot flares (Boiler above)
    const burn = burnerCycle(t);
    if (boiler && burn > 0 && lastBurn.current === 0) whoomp(G, [boiler.x, 0.5 * M, boiler.z]);
    lastBurn.current = burn;
    // counted from the floor's arrival: on the page's clock alone, a cellar
    // loaded late in a session flushed the moment it appeared
    if (!next.current.started) { next.current.started = true; next.current.flush += tl; }
    if (tl > next.current.flush) {
      next.current.flush = tl + 40 + Math.random() * 30;
      flush(G, [(Math.random() * 30 - 15) * M, map.WALL_HEIGHT, 2.5 * M]);
    }
  });
  return null;
}
function whoomp({ ctx, bus, noiseBuffer }, at) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(120, t); lp.frequency.linearRampToValueAtTime(260, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.35, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(lp); lp.connect(g); g.connect(pan(ctx, at, bus.sfx)); src.start(t); src.stop(t + 1);
}
function flush({ ctx, bus, noiseBuffer }, at) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(1100, t + 1.2); bp.frequency.linearRampToValueAtTime(500, t + 3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.03, t + 0.5);
  g.gain.linearRampToValueAtTime(0.0001, t + 3);
  src.connect(bp); bp.connect(g); g.connect(pan(ctx, at, bus.amb)); src.start(t); src.stop(t + 3.1);
}
