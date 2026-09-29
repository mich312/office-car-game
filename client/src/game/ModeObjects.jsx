// Server-owned entities rendered on the client: checkpoints, coffee beans,
// the battery, the soccer ball & goals, powerup pads, puddles, rockets and
// the dreaded cleaning robot.
import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import TextSprite from './TextSprite.jsx';
import {
  POWERUP_EFFECT, M,
  raceCheckpoints,
} from '@rc/shared';
import { useMap } from './activeMap.js';
import { THEMES } from './themes/index.js';
import { useStore } from '../store.js';
import { net, on, sampleRemote } from '../net.js';
import { burst } from './particles.jsx';
import { roundedBox } from './roundedGeo.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default function ModeObjects() {
  const modeId = useStore((s) => s.modeId);
  const phase = useStore((s) => s.phase);
  const active = phase === 'playing' || phase === 'countdown';
  return (
    <group>
      <PowerupPads />
      <Puddles />
      <Rockets />
      <Robot />
      {active && modeId === 'desk_dash' && <RaceCheckpoints />}
      {active && modeId === 'coffee_run' && <><Beans /><CoffeeMachine /></>}
      {active && modeId === 'battery' && <Battery />}
      {active && modeId === 'soccer' && <><SoccerBall /><Goals /></>}
      {active && modeId === 'koth' && <><Zone color="#ffd166" label="📍 STANDUP" standup /><NextZone color="#ffd166" /></>}
      {active && modeId === 'sumo' && <Zone color="#ff5c5c" label="🥋 RING" wall />}
      {active && modeId === 'tag' && <ItCrown />}
      {active && modeId === 'last_standing' && <><LockedRooms /><Zone color="#ff5f6b" label="⚡ LAST MEETING" wall /></>}
    </group>
  );
}

// ---------------------------------------------------- zone (koth & sumo)
// A translucent ring + wall driven directly from net.zone: unit-radius
// geometry scaled to the live radius, so the sumo shrink animates for free.
// The standup turns red while it's contested, and its ring is also drawn on
// top of any furniture standing in it (the meeting table), since a floor
// ring under a tabletop is invisible from a car's seat.
const CONTESTED = new THREE.Color('#ff6b4a');
function Zone({ color, label, wall = false, standup = false }) {
  const map = useMap();
  const group = useRef();
  const ring = useRef();
  const wallRef = useRef();
  const labelRef = useRef();
  const base = useMemo(() => new THREE.Color(color), [color]);
  const [spot, setSpot] = useState(null); // standup: the spot the zone is on
  const tops = useMemo(() => (spot ? furnitureIn(map, spot.x, spot.z, spot.r) : []), [map, spot]);
  const labelY = Math.max(3.2, ...tops.map((f) => f.h + 1.6));
  const topMat = useMemo(() => zoneTopMaterial(color), [color]);
  useEffect(() => () => topMat.dispose(), [topMat]);
  useFrame(({ clock }) => {
    const z = net.zone;
    if (!group.current) return;
    group.current.visible = !!z;
    if (!z) return;
    if (standup && (!spot || spot.x !== z.x || spot.z !== z.z)) setSpot({ x: z.x, z: z.z, r: z.r });
    group.current.position.x += (z.x - group.current.position.x) * 0.2;
    group.current.position.z += (z.z - group.current.position.z) * 0.2;
    const hot = standup && (z.n || 0) > 1;
    if (ring.current) {
      ring.current.scale.setScalar(z.r);
      ring.current.rotation.z = clock.elapsedTime * 0.4;
      ring.current.material.opacity = 0.55 + Math.sin(clock.elapsedTime * (hot ? 9 : 3)) * 0.2;
      ring.current.material.color.copy(hot ? CONTESTED : base);
    }
    const u = topMat.uniforms;
    u.uCenter.value.set(group.current.position.x, group.current.position.z);
    u.uR.value = z.r;
    u.uColor.value.copy(hot ? CONTESTED : base);
    u.uOpacity.value = 0.55 + Math.sin(clock.elapsedTime * (hot ? 9 : 3)) * 0.2;
    if (wallRef.current) {
      wallRef.current.scale.set(z.r, 1, z.r);
      wallRef.current.material.opacity = 0.1 + Math.sin(clock.elapsedTime * 2) * 0.04;
    }
    if (labelRef.current) labelRef.current.position.y = labelY + Math.sin(clock.elapsedTime * 1.5) * 0.2;
  });
  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={ring} position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.94, 1, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        {wall && (
          <mesh ref={wallRef} position={[0, 1.4, 0]}>
            <cylinderGeometry args={[1, 1, 2.8, 64, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        )}
        <group ref={labelRef} position={[0, labelY, 0]}>
          <TextSprite text={label} size={0.9} color={color} />
        </group>
      </group>
      {tops.map((f, i) => (
        <mesh key={i} position={[f.x, f.h + 0.03, f.z]} rotation-x={-Math.PI / 2} material={topMat}>
          <planeGeometry args={[f.w, f.d]} />
        </mesh>
      ))}
    </>
  );
}

// Solid furniture whose footprint reaches into a disc: the tops a zone ring
// has to be drawn on. Quarter-turned pieces swap their footprint.
function furnitureIn(map, x, z, r) {
  const out = [];
  for (const f of map.FURNITURE) {
    if (f.type === 'rug' || f.type === 'art' || f.type === 'tv' || f.decor || f.h < 0.25 * M) continue;
    const q = Math.abs(Math.sin(f.rotY || 0)) > 0.7;
    const w = q ? f.d : f.w, d = q ? f.w : f.d;
    const cx = Math.max(f.x - w / 2, Math.min(x, f.x + w / 2)), cz = Math.max(f.z - d / 2, Math.min(z, f.z + d / 2));
    if (Math.hypot(cx - x, cz - z) < r) out.push({ x: f.x, z: f.z, w, d, h: f.h });
  }
  return out;
}

// A plane that draws only the band of the zone ring passing over it.
function zoneTopMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: {
      uCenter: { value: new THREE.Vector2() }, uR: { value: 1 },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.6 },
    },
    vertexShader: `varying vec2 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec2 uCenter; uniform float uR; uniform vec3 uColor; uniform float uOpacity; varying vec2 vW;
      void main() {
        float d = distance(vW, uCenter);
        float band = step(uR * 0.94, d) * step(d, uR);
        float fill = step(d, uR) * 0.12;
        float a = max(band, fill) * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}

// Standup: where the meeting goes next, shown for its last five seconds so
// nobody is late — a ghost ring on the floor and a marker above it.
function NextZone({ color }) {
  const group = useRef();
  const ring = useRef();
  useFrame(({ clock }) => {
    const z = net.zone;
    if (!group.current) return;
    const left = z?.until ? z.until - net.clockOffset - performance.now() : Infinity;
    const show = !!z?.next && left < 5000;
    group.current.visible = show;
    if (!show) return;
    group.current.position.set(z.next.x, 0, z.next.z);
    ring.current.scale.setScalar(z.r);
    ring.current.rotation.z = -clock.elapsedTime * 0.8;
    ring.current.material.opacity = 0.25 + (Math.sin(clock.elapsedTime * 8) + 1) * 0.12;
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={ring} position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.9, 1, 48, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <TextSprite text="📍 NEXT" size={0.7} y={3} color={color} />
    </group>
  );
}

// -------------------------------------------------------- tag mode crown
// A spinning cone hovering over whoever is It — including you.
function ItCrown() {
  const group = useRef();
  useFrame(({ clock }) => {
    const id = net.it;
    if (!group.current) return;
    let pos = null;
    if (id && id === net.myId) {
      const t = window.__rcTelemetry;
      if (t) pos = [t.x, t.y, t.z];
    } else if (id) {
      const s = sampleRemote(id);
      if (s) pos = s.p;
    }
    group.current.visible = !!pos;
    if (!pos) return;
    group.current.position.set(pos[0], (pos[1] || 0) + 1.35 + Math.sin(clock.elapsedTime * 3) * 0.12, pos[2]);
    group.current.rotation.y = clock.elapsedTime * 2.5;
  });
  return (
    <group ref={group} visible={false}>
      <mesh rotation-x={Math.PI}>
        <coneGeometry args={[0.28, 0.42, 4]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={1.2} />
      </mesh>
      <pointLight intensity={2.5} distance={5} color="#ffd166" />
    </group>
  );
}

// -------------------------------------------------- last car standing
// Locked rooms fill with a red haze, the next victim pulses amber.
// The zone is a zap field, not a wall — you can drive through, briefly.
function LockedRooms() {
  const { ROOMS, WALL_HEIGHT } = useMap();
  const lcs = useStore((s) => s.lcs);
  const warnRef = useRef();
  useFrame(({ clock }) => {
    if (warnRef.current) warnRef.current.material.opacity = 0.08 + (Math.sin(clock.elapsedTime * 6) + 1) * 0.07;
  });
  if (!lcs) return null;
  const warnRoom = lcs.warn ? ROOMS.find((r) => r.id === lcs.warn.room) : null;
  return (
    <group>
      {(lcs.locked || []).map((id) => {
        const r = ROOMS.find((rm) => rm.id === id);
        if (!r) return null;
        return (
          <group key={id} position={[r.x, 0, r.z]}>
            <mesh position={[0, WALL_HEIGHT / 2, 0]}>
              <boxGeometry args={[r.w, WALL_HEIGHT, r.d]} />
              <meshBasicMaterial color="#ff2f3d" transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <ClosedLabel text="⛔ CLOSED" y={WALL_HEIGHT * LABEL_AT} color="#ff5f6b" />
          </group>
        );
      })}
      {warnRoom && (
        <group position={[warnRoom.x, 0, warnRoom.z]}>
          <mesh ref={warnRef} position={[0, WALL_HEIGHT / 2, 0]}>
            <boxGeometry args={[warnRoom.w, WALL_HEIGHT, warnRoom.d]} />
            <meshBasicMaterial color="#ffb020" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <ClosedLabel text="🚧 CLOSING" y={WALL_HEIGHT * LABEL_AT} color="#ffcf6b" />
        </group>
      )}
    </group>
  );
}

// The room labels hang under the ceiling (above it, where they used to be,
// the ceiling slab hid them from every camera) and draw over the room's
// furniture so a label is readable from the doorway.
const LABEL_AT = 0.62; // of the wall height
function ClosedLabel({ text, y, color }) {
  return <TextSprite text={text} size={1.1} y={y} color={color} overlay />;
}

// ------------------------------------------------------------- race
function RaceCheckpoints() {
  const myId = useStore((s) => s.myId);
  const prog = useStore((s) => s.raceProgress[myId]);
  const cps = raceCheckpoints(useStore((s) => s.variant), useMap());
  const next = (prog?.[1] ?? 0) % cps.length;
  const cp = cps[next];
  const ring = useRef();
  const beam = useRef();
  useFrame(({ clock }) => {
    if (ring.current) {
      ring.current.rotation.z = clock.elapsedTime * 1.5;
      ring.current.position.y = 1.6 + Math.sin(clock.elapsedTime * 2) * 0.3;
    }
    if (beam.current) beam.current.material.opacity = 0.16 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });
  return (
    <group position={[cp.x, 0, cp.z]}>
      <mesh ref={beam} position={[0, 7, 0]}>
        <cylinderGeometry args={[2.6, 3.4, 14, 20, 1, true]} />
        <meshBasicMaterial color="#4da3ff" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ring} position={[0, 1.6, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[2.4, 0.09, 8, 40]} />
        <meshBasicMaterial color="#7ec8ff" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------- coffee run
function Beans() {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  // Matches the wire cap (u8 length in the snapshot codec). 26 base spawns
  // respawn 9 s after pickup while spills append to the END of the list, so a
  // busy match easily runs past the old cap of 40 — and the overflow entries
  // were exactly the freshly-spilled beans, invisible but still collectable.
  const MAXB = 255;
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    const beans = net.beans || [];
    for (let i = 0; i < MAXB; i++) {
      const b = beans[i];
      if (b) {
        dummy.position.set(b[1], 0.7 + Math.sin(t * 3 + i) * 0.18, b[2]);
        dummy.rotation.set(0.5, t * 2 + i, 0);
        dummy.scale.setScalar(1);
      } else {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0.001);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, MAXB]} frustumCulled={false}>
      <capsuleGeometry args={[0.28, 0.3, 4, 10]} />
      <meshStandardMaterial color="#6b4226" roughness={0.4} emissive="#3a2010" emissiveIntensity={0.4} />
    </instancedMesh>
  );
}

function CoffeeMachine() {
  const { COFFEE_MACHINE } = useMap();
  const glow = useRef();
  useFrame(({ clock }) => {
    if (glow.current) glow.current.material.opacity = 0.25 + Math.sin(clock.elapsedTime * 2.5) * 0.12;
  });
  const cm = COFFEE_MACHINE;
  return (
    <group>
      {/* the machine itself sits on the kitchen counter */}
      <group position={[cm.x, 0.92 * M, cm.z]}>
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[1.6, 2, 1.4]} />
          <meshStandardMaterial color="#2a2d33" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.55, 0.72]}>
          <planeGeometry args={[0.9, 0.5]} />
          <meshBasicMaterial color="#3fffaa" toneMapped={false} />
        </mesh>
      </group>
      {/* delivery zone on the floor */}
      <mesh ref={glow} position={[cm.deliverX, 0.04, cm.deliverZ]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[cm.radius * 2, 24]} />
        <meshBasicMaterial color="#3fffaa" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <group position={[cm.deliverX, 0, cm.deliverZ]}>
        <TextSprite text="☕ DELIVER" size={0.9} y={3.4} color="#3fffaa" />
      </group>
    </group>
  );
}

// ------------------------------------------------------------- battery
function Battery() {
  const group = useRef();
  useFrame(({ clock }) => {
    const b = net.battery;
    if (!b || !group.current) return;
    const carried = !!b.carrier;
    const y = carried ? 1.1 : 0.6 + Math.sin(clock.elapsedTime * 2.5) * 0.15;
    group.current.position.set(b.x, y, b.z);
    group.current.rotation.y = clock.elapsedTime * (carried ? 0 : 1.2);
    group.current.visible = !carried; // carriers show it on their roof via flags
  });
  return (
    <group ref={group}>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.3, 0.9]} />
        <meshStandardMaterial color="#2ecc71" emissive="#2ecc71" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.5]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.08, 0.08, 0.12, 8]} />
        <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={0.5} />
      </mesh>
      <pointLight intensity={3} distance={6} color="#2ecc71" />
    </group>
  );
}

// ------------------------------------------------------------- soccer
function SoccerBall() {
  const { SOCCER } = useMap();
  const rb = useRef();
  // Giant Ball mutator: the server dictates the radius via snapshots
  const [radius, setRadius] = useState(SOCCER.ballRadius);
  useEffect(() => on('fx', (fx) => {
    if (fx.type === 'goal') {
      const g = SOCCER.goals[1 - fx.team];
      burst([g?.x ?? 0, 2, g?.z ?? 0], { count: 60, color: ['#ffd166', '#06d6a0', '#ef476f', '#118ab2'], speed: 14, size: 0.14, ttl: 1.6 });
    }
  }), []);
  useFrame((_, dt) => {
    const b = net.ball;
    if (!b || !rb.current) return;
    if (b.r && Math.abs(b.r - radius) > 0.01) setRadius(b.r);
    // lerp toward server ball with light extrapolation
    const cur = rb.current.translation();
    const k = Math.min(1, dt * 10);
    rb.current.setNextKinematicTranslation({
      x: cur.x + (b.p[0] + b.v[0] * 0.05 - cur.x) * k,
      y: Math.max(radius * 0.9, cur.y + (b.p[1] - cur.y) * k),
      z: cur.z + (b.p[2] + b.v[2] * 0.05 - cur.z) * k,
    });
  });
  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={[SOCCER.ballSpawn.x, 2, SOCCER.ballSpawn.z]}>
      <BallCollider key={radius} args={[radius]} />
      <mesh castShadow>
        <sphereGeometry key={radius} args={[radius, 24, 20]} />
        <meshStandardMaterial color="#fff8ee" roughness={0.35} envMapIntensity={0.8} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry key={radius} args={[radius * 0.99, 0.012, 6, 40]} />
        <meshBasicMaterial color="#e8b84a" />
      </mesh>
    </RigidBody>
  );
}

function Goals() {
  const { SOCCER } = useMap();
  return (
    <group>
      {SOCCER.goals.map((g, i) => (
        <group key={i} position={[g.x, 0, g.z]}>
          <mesh position={[0, 1.4, 0]}>
            <boxGeometry args={[0.15, 2.8, g.width]} />
            <meshBasicMaterial color={g.team === 0 ? '#ffb37a' : '#7ab8ff'} transparent opacity={0.25} depthWrite={false} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 1.4, s * g.width / 2]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 2.8, 8]} />
              <meshStandardMaterial color={g.team === 0 ? '#ff8c42' : '#4da3ff'} emissive={g.team === 0 ? '#ff8c42' : '#4da3ff'} emissiveIntensity={0.7} />
            </mesh>
          ))}
          <TextSprite text={g.team === 0 ? '🟠 GOAL' : '🔵 GOAL'} size={0.8} y={3.4} color={g.team === 0 ? '#ffb37a' : '#7ab8ff'} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------- powerups
// Every pad on the map is two instanced draws: the floor rings and the
// item cubes (a rounded box with a "?" on every face). A pad cooling down
// dims its ring and hides its cube.
const PAD_READY = new THREE.Color('#c77bff');
const PAD_COOL = new THREE.Color('#2e2140');
let _padTex = null;
function padTexture() {
  if (_padTex) return _padTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7b2ff2';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#c9a2ff';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 112, 112);
  g.fillStyle = '#ffffff';
  g.font = '900 92px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  _padTex = new THREE.CanvasTexture(c);
  _padTex.colorSpace = THREE.SRGBColorSpace;
  _padTex.anisotropy = 4;
  return _padTex;
}
function PowerupPads() {
  const { POWERUP_PADS } = useMap();
  const rings = useRef();
  const cubes = useRef();
  const n = POWERUP_PADS.length;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cubeGeo = useMemo(() => roundedBox(0.55, 0.55, 0.55, 0.1, 3), []);
  const tex = useMemo(() => padTexture(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!rings.current || !cubes.current) return;
    const now = Date.now();
    POWERUP_PADS.forEach((pad, i) => {
      const ready = (net.padCooldowns.get(i) || 0) < now;
      dummy.position.set(pad.x, 0.03, pad.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      rings.current.setMatrixAt(i, dummy.matrix);
      rings.current.setColorAt(i, ready ? PAD_READY : PAD_COOL);
      dummy.position.set(pad.x, 0.9 + Math.sin(t * 2 + i) * 0.12, pad.z);
      dummy.rotation.set(0.35, t * 1.4 + i, 0.2);
      dummy.scale.setScalar(ready ? 1 : 0.0001);
      dummy.updateMatrix();
      cubes.current.setMatrixAt(i, dummy.matrix);
    });
    rings.current.instanceMatrix.needsUpdate = true;
    if (rings.current.instanceColor) rings.current.instanceColor.needsUpdate = true;
    cubes.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh key={`r${n}`} ref={rings} args={[null, null, n]} frustumCulled={false}>
        <ringGeometry args={[0.9, 1.5, 32]} />
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`c${n}`} ref={cubes} args={[cubeGeo, null, n]} castShadow frustumCulled={false}>
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.25} />
      </instancedMesh>
    </group>
  );
}

function Puddles() {
  const [puddles, setPuddles] = useState([]);
  useFrame(() => {
    const cur = net.puddles || [];
    if (cur.length !== puddles.length || cur.some((p, i) => p.id !== puddles[i]?.id)) setPuddles([...cur]);
  });
  return (
    <group>
      {puddles.map((p) => (
        <mesh key={p.id} position={[p.x, 0.025, p.z]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[POWERUP_EFFECT.PUDDLE_RADIUS, 22]} />
          <meshStandardMaterial
            color={p.kind === 'oil' ? '#0d0f14' : '#4a2c14'}
            roughness={0.05}
            metalness={0.4}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

// Rockets: body, nose cone and three fins, merged once into one geometry
// (vertex-coloured) and drawn instanced, each pointing the way it flies.
let _rocketGeo = null;
function rocketGeometry() {
  if (_rocketGeo) return _rocketGeo;
  const tint = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  // built along +y, then turned to fly along +z
  const body = tint(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 12), '#f2f2ee');
  const band = tint(new THREE.CylinderGeometry(0.103, 0.103, 0.06, 12).translate(0, 0.08, 0), '#e8332a');
  const nose = tint(new THREE.ConeGeometry(0.1, 0.18, 12).translate(0, 0.27, 0), '#e8332a');
  const nozzle = tint(new THREE.CylinderGeometry(0.07, 0.05, 0.06, 10).translate(0, -0.21, 0), '#2b2d33');
  const fins = [0, 1, 2].map((k) => {
    const f = new THREE.BoxGeometry(0.012, 0.13, 0.1).translate(0, -0.13, 0.13);
    f.rotateY((k * Math.PI * 2) / 3);
    return tint(f, '#e8332a');
  });
  const parts = [body, band, nose, nozzle, ...fins].map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out.attributes.uv) out.deleteAttribute('uv');
    return out;
  });
  _rocketGeo = mergeGeometries(parts);
  _rocketGeo.rotateX(Math.PI / 2);
  _rocketGeo.scale(1.4, 1.4, 1.4);
  return _rocketGeo;
}
function Rockets() {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => rocketGeometry(), []);
  const heading = useMemo(() => new Map(), []); // rocket id → last position and facing
  const MAXR = 6;
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rockets = net.rockets || [];
    const live = new Set();
    for (let i = 0; i < MAXR; i++) {
      const r = rockets[i];
      if (r) {
        live.add(r.id);
        const x = r.p[0], y = r.p[1] + 0.4, z = r.p[2];
        const h = heading.get(r.id) || { x, y, z, dir: new THREE.Vector3(0, 0, 1) };
        const d = new THREE.Vector3(x - h.x, y - h.y, z - h.z);
        if (d.lengthSq() > 1e-4) h.dir.lerp(d.normalize(), 0.5).normalize();
        h.x = x; h.y = y; h.z = z;
        heading.set(r.id, h);
        dummy.position.set(x, y, z);
        dummy.lookAt(x + h.dir.x, y + h.dir.y, z + h.dir.z);
        dummy.scale.setScalar(1);
        burst([x - h.dir.x * 0.4, y - h.dir.y * 0.4, z - h.dir.z * 0.4], { count: 1, color: '#ffb347', speed: 1, size: 0.07, ttl: 0.35, up: 1, gravity: -0.2 });
      } else {
        dummy.position.set(0, -999, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.001);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    for (const id of heading.keys()) if (!live.has(id)) heading.delete(id);
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, null, MAXR]} frustumCulled={false}>
      <meshStandardMaterial vertexColors emissive="#ff6b35" emissiveIntensity={0.35} roughness={0.35} metalness={0.2} />
    </instancedMesh>
  );
}

// The cleaning robot: a robot vacuum at RC-car scale — a round body with a
// black front bumper, a lid with a button and a red ring LED round the lidar
// turret, two spinning side brushes and its two drive wheels. It faces the
// way it's driving. A floor can dress it its own way (themes/*.jsx Robot).
function Robot() {
  const group = useRef();
  const brushes = useRef([]);
  const led = useRef();
  const Skin = THEMES[useMap().theme]?.Robot;
  useFrame(({ clock }, dt) => {
    const r = net.robot;
    if (!group.current) return;
    group.current.visible = !!r;
    if (!r) return;
    const cur = group.current.position;
    const nx = cur.x + (r.x - cur.x) * 0.15, nz = cur.z + (r.z - cur.z) * 0.15;
    const dx = nx - cur.x, dz = nz - cur.z;
    if (dx * dx + dz * dz > 1e-5) {
      // turn toward the direction of travel, the short way round
      let a = Math.atan2(dx, dz) - group.current.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      group.current.rotation.y += a * Math.min(1, dt * 6);
    }
    cur.set(nx, 0, nz);
    for (const b of brushes.current) if (b) b.rotation.y += dt * 14 * (b.userData.dir || 1);
    if (led.current) led.current.material.opacity = 0.6 + Math.sin(clock.elapsedTime * 5) * 0.35;
  });
  if (Skin) {
    return (
      <group ref={group} visible={false}>
        <Skin />
      </group>
    );
  }
  return (
    <group ref={group} visible={false}>
      {/* body and lid */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[1.72, 1.82, 0.62, 40]} />
        <meshStandardMaterial color="#d8dade" metalness={0.15} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.745, 0]}>
        <cylinderGeometry args={[1.5, 1.6, 0.05, 40]} />
        <meshStandardMaterial color="#2a2c33" metalness={0.4} roughness={0.25} />
      </mesh>
      {/* front bumper shell: the leading half, in black */}
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[1.86, 1.86, 0.46, 40, 1, true, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#141519" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* lidar turret and its ring LED */}
      <mesh position={[0, 0.9, -0.35]} castShadow>
        <cylinderGeometry args={[0.42, 0.44, 0.3, 24]} />
        <meshStandardMaterial color="#1b1c21" roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh ref={led} position={[0, 0.78, -0.35]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.55, 0.045, 8, 32]} />
        <meshBasicMaterial color="#ff2222" transparent opacity={0.9} toneMapped={false} />
      </mesh>
      {/* the button */}
      <mesh position={[0, 0.79, 0.8]}>
        <cylinderGeometry args={[0.2, 0.22, 0.06, 20]} />
        <meshStandardMaterial color="#e9eaec" roughness={0.3} />
      </mesh>
      {/* drive wheels, just showing under the skirt */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.66, 0.28, 0]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.2, 18]} />
          <meshStandardMaterial color="#18191c" roughness={0.9} />
        </mesh>
      ))}
      {/* side brushes: three prongs each, spinning in opposite directions */}
      {[-1, 1].map((s, k) => (
        <group key={s} position={[s * 1.25, 0.05, 1.3]} ref={(el) => { brushes.current[k] = el; if (el) el.userData.dir = s; }}>
          <mesh>
            <cylinderGeometry args={[0.14, 0.14, 0.06, 12]} />
            <meshStandardMaterial color="#2c2e35" />
          </mesh>
          {[0, 1, 2].map((j) => (
            <mesh key={j} rotation-y={(j * Math.PI * 2) / 3} position={[Math.sin((j * Math.PI * 2) / 3) * 0.32, 0, Math.cos((j * Math.PI * 2) / 3) * 0.32]}>
              <boxGeometry args={[0.03, 0.02, 0.62]} />
              <meshStandardMaterial color="#c9ced6" roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      <pointLight position={[0, 1.4, 0]} intensity={6} distance={9} color="#ff3322" />
    </group>
  );
}
