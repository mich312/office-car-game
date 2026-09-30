// Server-owned entities rendered on the client: checkpoints, coffee beans,
// the battery, the soccer ball & goals, powerup pads, puddles, rockets and
// the dreaded cleaning robot.
import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import TextSprite from './TextSprite.jsx';
import { roundedBox } from './roundedGeo.js';
import {
  POWERUP_EFFECT, M, MODES, MUTATORS,
  raceCheckpoints, raceLaps, wallBetween, soccerGoalHeight,
} from '@rc/shared';
import { useMap } from './activeMap.js';
import { THEMES } from './themes/index.js';
import { useStore } from '../store.js';
import { net, on, sampleRemote } from '../net.js';
import { burst } from './particles.jsx';
import { useEventLight } from './eventLight.jsx';

// World labels speak the HUD's colours: hazard labels cherry, objectives lime
// (TextSprite draws them in Kanit with an ink outline).
const HAZARD_LABEL = '#ff7a84';
const GO_LABEL = '#b0f27c';

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
      {active && modeId === 'desk_dash' && <NextCheckpoint />}
      {active && modeId === 'coffee_run' && <><Beans /><CoffeeMachine /></>}
      {active && modeId === 'battery' && <Battery />}
      {active && modeId === 'soccer' && <><SoccerBall /><Goals /><TeamMarker /></>}
      {active && modeId === 'koth' && <><Zone color="#ffd166" label="STANDUP" labelColor={GO_LABEL} standup /><NextZone color="#ffd166" /></>}
      {active && modeId === 'sumo' && <Zone color="#ff5c5c" label="RING" labelColor={HAZARD_LABEL} wall />}
      {active && modeId === 'tag' && <ItCrown />}
      {active && modeId === 'last_standing' && <><LockedRooms /><Zone color="#ff5f6b" label="LAST MEETING" labelColor={HAZARD_LABEL} wall /></>}
    </group>
  );
}

// Small canvas textures for the mode props, made once.
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// ---------------------------------------------------- zone (koth & sumo)
// A translucent ring + wall driven directly from net.zone: unit-radius
// geometry scaled to the live radius, so the sumo shrink animates for free.
// The standup turns red while it's contested, and its ring is also drawn on
// top of any furniture standing in it (the meeting table), since a floor
// ring under a tabletop is invisible from a car's seat.
const CONTESTED = new THREE.Color('#ff6b4a');
function Zone({ color, label, labelColor = color, wall = false, standup = false }) {
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
          <TextSprite text={label} size={0.9} color={labelColor} />
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
      <TextSprite text="NEXT STANDUP" size={0.7} y={3} color={GO_LABEL} />
    </group>
  );
}

// -------------------------------------------------------- tag mode crown
// A little gold crown hovering over whoever is It — including you: a band,
// five points and a bead on each, merged into one mesh.
function crownGeometry() {
  const parts = [new THREE.CylinderGeometry(0.24, 0.21, 0.12, 20, 1, true)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pt = new THREE.ConeGeometry(0.06, 0.17, 4);
    pt.translate(Math.cos(a) * 0.225, 0.14, Math.sin(a) * 0.225);
    const bead = new THREE.SphereGeometry(0.035, 8, 6);
    bead.translate(Math.cos(a) * 0.225, 0.24, Math.sin(a) * 0.225);
    parts.push(pt, bead);
  }
  // non-indexed all round so the parts merge
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function ItCrown() {
  const group = useRef();
  const geo = useMemo(crownGeometry, []);
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
    group.current.position.set(pos[0], (pos[1] || 0) + 1.7 + Math.sin(clock.elapsedTime * 3) * 0.12, pos[2]); // above the name tag
    group.current.rotation.y = clock.elapsedTime * 1.8;
  });
  return (
    <group ref={group} visible={false}>
      <mesh geometry={geo} rotation-z={0.12}>
        <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={0.9} metalness={0.8} roughness={0.28} side={THREE.DoubleSide} />
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
            <ClosedLabel text="CLOSED" y={WALL_HEIGHT * LABEL_AT} color={HAZARD_LABEL} />
          </group>
        );
      })}
      {warnRoom && (
        <group position={[warnRoom.x, 0, warnRoom.z]}>
          <mesh ref={warnRef} position={[0, WALL_HEIGHT / 2, 0]}>
            <boxGeometry args={[warnRoom.w, WALL_HEIGHT, warnRoom.d]} />
            <meshBasicMaterial color="#ffb020" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <ClosedLabel text="CLOSING" y={WALL_HEIGHT * LABEL_AT} color={HAZARD_LABEL} />
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
// A finished car has no next checkpoint: its progress reads [laps, 0], and
// a beacon on checkpoint 0 said "go round again".
function NextCheckpoint() {
  const myId = useStore((s) => s.myId);
  const lap = useStore((s) => s.raceProgress[myId]?.[0] ?? 0);
  return lap >= raceLaps(useMap(), MODES.desk_dash.laps) ? null : <RaceCheckpoints />;
}

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
// A coffee bean: an ellipsoid with the crease pressed into its flat face.
function beanGeometry() {
  const g = new THREE.SphereGeometry(0.3, 18, 12);
  g.scale(1, 0.7, 1.4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    if (y > 0) p.setY(i, y - 0.09 * Math.exp(-((x / 0.06) ** 2)) * (y / 0.21));
  }
  g.computeVertexNormals();
  return g;
}

function Beans() {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(beanGeometry, []);
  // Matches the wire cap (u8 length in the snapshot codec); only the live
  // beans are drawn (mesh.count), not all 255 every frame.
  const MAXB = 255;
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    const beans = net.beans || [];
    const n = Math.min(MAXB, beans.length);
    for (let i = 0; i < n; i++) {
      const [id, x, z, y = 0] = beans[i];
      // bob and spin keyed to the bean's id, not its place in the list, so
      // collecting one bean doesn't make every later one jump
      dummy.position.set(x, y + 0.7 + Math.sin(t * 3 + id) * 0.18, z);
      dummy.rotation.set(0.5, t * 2 + id, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, null, MAXB]} frustumCulled={false}>
      <meshStandardMaterial color="#6b4226" roughness={0.35} emissive="#3a2010" emissiveIntensity={0.4} />
    </instancedMesh>
  );
}

// The delivery ring, cut to what's in sight of its centre — the server only
// counts a delivery with no wall in between, and on the cellar the plain
// circle showed a slice on the corridor floor behind the boiler-room wall.
function deliveryZoneGeometry(map) {
  const cm = map.COFFEE_MACHINE;
  const R = cm.radius * 2, N = 72;
  const pts = [0, 0, 0];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let lo = 0, hi = R;
    if (wallBetween(map, cm.deliverX, cm.deliverZ, cm.deliverX + dx * R, cm.deliverZ + dz * R)) {
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        if (wallBetween(map, cm.deliverX, cm.deliverZ, cm.deliverX + dx * mid, cm.deliverZ + dz * mid)) hi = mid; else lo = mid;
      }
    } else lo = R;
    pts.push(dx * lo, 0, dz * lo);
  }
  const idx = [];
  for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  return g;
}

const screenTex = () => canvasTex('coffee-screen', 256, 160, (g, w, h) => {
  g.fillStyle = '#07120d';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#3fffaa';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('DELIVER', w / 2, h * 0.36);
  g.font = '52px system-ui, sans-serif';
  g.fillText('☕', w / 2, h * 0.74);
});

// A bean-to-cup machine, 36 x 58 x 45 cm, standing on the worktop and facing
// the delivery ring: steel body, black head, a hopper of beans on top, a
// drip tray with a cup under the twin spout, and a touchscreen.
function CoffeeMachine() {
  const map = useMap();
  const cm = map.COFFEE_MACHINE;
  const glow = useRef();
  const zone = useMemo(() => deliveryZoneGeometry(map), [map]);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.material.opacity = 0.25 + Math.sin(clock.elapsedTime * 2.5) * 0.12;
  });
  // the worktop under the machine (a counter the map lists there), else the office's
  const top = map.FURNITURE.find((f) => Math.abs(f.x - cm.x) < f.w / 2 + 0.1 && Math.abs(f.z - cm.z) < f.d / 2 + 0.1 && f.h < 1.2 * M)?.h ?? 0.92 * M;
  const face = Math.atan2(cm.deliverX - cm.x, cm.deliverZ - cm.z);
  const m = (v) => v * M;
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b8bdc4', metalness: 0.85, roughness: 0.32 }), []);
  const black = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c1e22', metalness: 0.2, roughness: 0.45 }), []);
  return (
    <group>
      <group position={[cm.x, top, cm.z]} rotation-y={face}>
        <mesh castShadow geometry={roundedBox(m(0.36), m(0.5), m(0.34), m(0.02))} material={steel} position={[0, m(0.25), m(-0.05)]} />
        {/* black head across the front, with the twin spout */}
        <mesh castShadow geometry={roundedBox(m(0.36), m(0.12), m(0.12), m(0.02))} material={black} position={[0, m(0.44), m(0.16)]} />
        <mesh geometry={roundedBox(m(0.12), m(0.05), m(0.08), m(0.012))} material={black} position={[0, m(0.355), m(0.17)]} />
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * m(0.025), m(0.32), m(0.18)]} material={steel}>
            <cylinderGeometry args={[m(0.008), m(0.008), m(0.03), 8]} />
          </mesh>
        ))}
        {/* touchscreen */}
        <mesh position={[0, m(0.44), m(0.221)]}>
          <planeGeometry args={[m(0.16), m(0.1)]} />
          <meshBasicMaterial map={screenTex()} toneMapped={false} />
        </mesh>
        {/* hopper: smoked glass over a heap of beans, black lid */}
        <mesh position={[0, m(0.54), m(-0.08)]}>
          <boxGeometry args={[m(0.2), m(0.08), m(0.18)]} />
          <meshPhysicalMaterial color="#6b4a2e" transparent opacity={0.35} roughness={0.05} />
        </mesh>
        <mesh position={[0, m(0.525), m(-0.08)]}>
          <boxGeometry args={[m(0.18), m(0.045), m(0.16)]} />
          <meshStandardMaterial color="#4a2c16" roughness={0.8} />
        </mesh>
        <mesh geometry={roundedBox(m(0.21), m(0.02), m(0.19), m(0.008))} material={black} position={[0, m(0.585), m(-0.08)]} />
        {/* drip tray with a grille, and a cup under the spout */}
        <mesh geometry={roundedBox(m(0.3), m(0.03), m(0.15), m(0.008))} material={black} position={[0, m(0.015), m(0.155)]} />
        <mesh position={[0, m(0.0305), m(0.155)]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[m(0.26), m(0.11)]} />
          <meshStandardMaterial color="#8d939b" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0, m(0.071), m(0.17)]} castShadow>
          <cylinderGeometry args={[m(0.035), m(0.03), m(0.08), 16]} />
          <meshStandardMaterial color="#f4f1ea" roughness={0.3} />
        </mesh>
      </group>
      {/* delivery zone on the floor, cut to what's in sight */}
      <mesh ref={glow} geometry={zone} position={[cm.deliverX, 0.04, cm.deliverZ]}>
        <meshBasicMaterial color="#3fffaa" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <group position={[cm.deliverX, 0, cm.deliverZ]}>
        <TextSprite text="DELIVER BEANS" size={0.9} y={3.4} color={GO_LABEL} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------- battery
const lipoLabelTex = () => canvasTex('lipo-label', 256, 128, (g, w, h) => {
  g.fillStyle = '#16181c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2ecc71';
  g.fillRect(0, h * 0.72, w, h * 0.14);
  g.fillStyle = '#e9edf2';
  g.font = 'bold 34px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('5000mAh', 16, h * 0.24);
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillStyle = '#9fe8bd';
  g.fillText('2S  7.4V  50C', 16, h * 0.52);
});

// A LiPo hard case: black shell, printed label with a glowing green stripe,
// red and black leads to a yellow XT60, and the white balance lead.
function Battery() {
  const group = useRef();
  const leads = useMemo(() => {
    const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 16, r, 6);
    return {
      red: tube([[0.07, 0, 0.45], [0.09, 0.02, 0.58], [0.05, 0.05, 0.7], [0.02, 0.04, 0.78]], 0.025),
      black: tube([[-0.07, 0, 0.45], [-0.08, -0.02, 0.58], [-0.03, 0.03, 0.7], [-0.01, 0.04, 0.78]], 0.025),
      balance: tube([[0.16, 0.06, 0.45], [0.24, 0.1, 0.52], [0.26, 0.08, 0.62]], 0.012),
    };
  }, []);
  useFrame(({ clock }) => {
    const b = net.battery;
    if (!b || !group.current) return;
    const carried = !!b.carrier;
    // drops carry the height they landed at (the loading dock, a pallet)
    const y = (b.y || 0) + 0.6 + Math.sin(clock.elapsedTime * 2.5) * 0.15;
    group.current.position.set(b.x, y, b.z);
    group.current.rotation.y = clock.elapsedTime * 1.2;
    group.current.visible = !carried; // carriers show it on their roof via flags
  });
  return (
    <group ref={group}>
      <mesh castShadow geometry={roundedBox(0.5, 0.3, 0.9, 0.05)}>
        <meshStandardMaterial color="#17191d" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.151, 0]} rotation-x={-Math.PI / 2} rotation-z={Math.PI / 2}>
        <planeGeometry args={[0.8, 0.42]} />
        <meshStandardMaterial map={lipoLabelTex()} emissiveMap={lipoLabelTex()} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.6} />
      </mesh>
      <mesh geometry={leads.red}><meshStandardMaterial color="#d8322a" roughness={0.5} /></mesh>
      <mesh geometry={leads.black}><meshStandardMaterial color="#111" roughness={0.5} /></mesh>
      <mesh geometry={leads.balance}><meshStandardMaterial color="#eeeeee" roughness={0.6} /></mesh>
      <mesh position={[0, 0.04, 0.82]} geometry={roundedBox(0.16, 0.08, 0.1, 0.02)}>
        <meshStandardMaterial color="#f2c21a" roughness={0.45} />
      </mesh>
      <mesh position={[0.26, 0.08, 0.65]} geometry={roundedBox(0.08, 0.04, 0.06, 0.01)}>
        <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
      </mesh>
      <pointLight intensity={3} distance={6} color="#2ecc71" />
    </group>
  );
}

// ------------------------------------------------------------- soccer
// The "huge ping pong ball": a gold seam round its middle and the ★★★ of a
// match ball printed on both sides.
const ballTex = () => canvasTex('ball-3star', 512, 256, (g, w, h) => {
  g.fillStyle = '#fff8ee';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8b84a';
  g.fillRect(0, h / 2 - 2, w, 4);
  g.fillStyle = '#ff8c2e';
  g.font = 'bold 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const x of [w * 0.25, w * 0.75]) g.fillText('★★★', x, h * 0.34);
});

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
    const cur = rb.current.translation();
    // A goal or a drop ball jumps the server ball back to the spot: snap,
    // don't sweep a kinematic ball across the pitch through everyone's cars
    if (Math.hypot(b.p[0] - cur.x, b.p[2] - cur.z) > 6) {
      rb.current.setTranslation({ x: b.p[0], y: Math.max(radius * 0.9, b.p[1]), z: b.p[2] }, true);
      return;
    }
    // lerp toward server ball with light extrapolation
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
        <sphereGeometry key={radius} args={[radius, 32, 20]} />
        <meshStandardMaterial map={ballTex()} roughness={0.35} envMapIntensity={0.8} />
      </mesh>
    </RigidBody>
  );
}

const TEAM_COLOR = ['#ff8c42', '#4da3ff'];
const TEAM_SOFT = ['#ffb37a', '#7ab8ff'];

const netTex = () => {
  const t = canvasTex('goal-net', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
};

// A proper goal in each doorway: white posts and crossbar (as tall as the
// server's goal mouth — taller for a Giant Ball), a back frame, a net on
// the sides, back and top, and a team-colour strip on the goal line.
function Goals() {
  const { SOCCER } = useMap();
  const mutator = useStore((s) => s.mutator);
  const R = SOCCER.ballRadius * (mutator === 'giant_ball' ? MUTATORS.giant_ball.scale : 1);
  const H = soccerGoalHeight(R);
  const depth = 1.6;
  const tube = 0.08;
  return (
    <group>
      {SOCCER.goals.map((g, i) => {
        const back = -g.dir * depth; // the net hangs on the far side of the line
        const W = g.width;
        const net = netTex();
        return (
          <group key={i} position={[g.x, 0, g.z]}>
            {/* posts, crossbar and the back frame */}
            {[-1, 1].map((sz) => (
              <group key={sz}>
                <mesh position={[0, H / 2, sz * W / 2]} castShadow>
                  <cylinderGeometry args={[tube, tube, H, 10]} />
                  <meshStandardMaterial color="#f4f6f8" roughness={0.3} metalness={0.2} />
                </mesh>
                <mesh position={[back, H / 2, sz * W / 2]}>
                  <cylinderGeometry args={[tube * 0.6, tube * 0.6, H, 8]} />
                  <meshStandardMaterial color="#d9dde2" roughness={0.4} />
                </mesh>
                <mesh position={[back / 2, H, sz * W / 2]} rotation-z={Math.PI / 2}>
                  <cylinderGeometry args={[tube * 0.6, tube * 0.6, depth, 8]} />
                  <meshStandardMaterial color="#d9dde2" roughness={0.4} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, H, 0]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[tube, tube, W + tube * 2, 10]} />
              <meshStandardMaterial color="#f4f6f8" roughness={0.3} metalness={0.2} />
            </mesh>
            {/* net: back, both sides, top */}
            <mesh position={[back, H / 2, 0]} rotation-y={Math.PI / 2}>
              <planeGeometry args={[W, H]} />
              <meshBasicMaterial map={net} transparent alphaTest={0.3} side={THREE.DoubleSide} color="#e9edf2" />
            </mesh>
            {[-1, 1].map((sz) => (
              <mesh key={sz} position={[back / 2, H / 2, sz * W / 2]}>
                <planeGeometry args={[depth, H]} />
                <meshBasicMaterial map={net} transparent alphaTest={0.3} side={THREE.DoubleSide} color="#e9edf2" />
              </mesh>
            ))}
            <mesh position={[back / 2, H, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[depth, W]} />
              <meshBasicMaterial map={net} transparent alphaTest={0.3} side={THREE.DoubleSide} color="#e9edf2" />
            </mesh>
            {/* team-colour goal line */}
            <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.3, W]} />
              <meshBasicMaterial color={TEAM_COLOR[g.team]} toneMapped={false} />
            </mesh>
            <TextSprite text={g.team === 0 ? 'ORANGE GOAL' : 'BLUE GOAL'} size={0.8} y={H + 0.9} color={TEAM_SOFT[g.team]} />
          </group>
        );
      })}
    </group>
  );
}

// Your own car in team colour: a ring on the floor under it, with a chevron
// pointing at the goal you attack — the HUD chip says it, this shows it.
function TeamMarker() {
  const map = useMap();
  const myId = useStore((s) => s.myId);
  const team = useStore((s) => s.players[s.myId]?.team) ?? 0;
  const group = useRef();
  const arrow = useRef();
  const target = map.SOCCER.goals.find((g) => g.team !== team) || map.SOCCER.goals[0];
  useFrame(({ clock }) => {
    const t = window.__rcTelemetry;
    if (!group.current || !t || !myId) return;
    group.current.position.set(t.x, Math.max(0.07, (t.y || 0) - 0.15), t.z);
    if (arrow.current) {
      arrow.current.rotation.y = Math.atan2(target.x - t.x, target.z - t.z);
      arrow.current.children[0].material.opacity = 0.55 + Math.sin(clock.elapsedTime * 4) * 0.25;
    }
  });
  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.78, 0.9, 40]} />
        <meshBasicMaterial color={TEAM_COLOR[team]} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={arrow}>
        <mesh position={[0, 0, 1.2]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.28, 3, -Math.PI / 2]} />
          <meshBasicMaterial color={TEAM_COLOR[1 - team]} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
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
  // its red warning light is the pooled event light (eventLight.jsx); a
  // skin brings its own
  const warn = useEventLight('#ff3322', 6, 9);
  useFrame(({ clock }, dt) => {
    const r = net.robot;
    if (!group.current) return;
    group.current.visible = !!r;
    const L = warn(!!r && !Skin);
    if (!r) return;
    if (L) L.position.set(0, 1.4, 0).applyMatrix4(group.current.matrixWorld);
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
    </group>
  );
}
