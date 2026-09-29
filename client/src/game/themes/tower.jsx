// The 48th floor's own dressing: a management tower, and the view.
//
// What the floor is about is height and polish. Floor-to-ceiling glass on
// every side with the city two hundred metres down (tower/view.jsx); a
// marble sky lobby with six brass lifts that come and go; the war room,
// where an eight-metre lacquered table runs toward a wall of live screens;
// walnut, brass, oxblood leather, backlit onyx.
//
// How it's built (tower/kit.js): every static thing — furniture, the
// facade, the interior glass, the lift core, ramps, the ceiling and its
// lights — is a part list, and all of it is baked into ONE merged mesh per
// material for the whole floor. So the pieces registered below own only
// their colliders, and the ramp skins and wall styles draw nothing
// themselves: the Dressing has already drawn them, in a dozen draw calls.
// What moves (lifts, screens, fire, trees, the gondola) lives in
// tower/live.jsx.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { M, isDecor } from '@rc/shared';
import { useStore } from '../../store.js';
import { lightingFor } from '../daylight.js';
import { mat, G, parts, bakeInto, mergeGroups, placeMatrix, SHADOW_MATS } from './tower/kit.js';
import { BUILD, COLLIDE, FRICTION, WALL_BUILD, RAMP_BUILD, wallFrame, ceilingParts, C } from './tower/build.js';
import { CityView } from './tower/view.jsx';
import { Lifts, VideoWall, Signs, Ticker, Fire, Terrace, Pools, FloorSounds, RainGlass } from './tower/live.jsx';
import { PROPS as TOWER_PROPS } from './tower/props.jsx';

const H = 3.3;
const u = (v) => v * M;

// ------------------------------------------------------------ baking
function bakeFloor(map) {
  const groups = {};
  for (const f of map.FURNITURE) {
    const build = BUILD[f.type];
    if (!build) continue;
    const p = parts();
    build(p, f.w / M, f.d / M, f.h / M, f);
    bakeInto(groups, p.list, placeMatrix(f.x, f.z, f.rotY || 0));
  }
  for (const wl of map.WALLS) {
    const build = WALL_BUILD[wl.style];
    if (!build) continue;
    const fr = wallFrame(wl);
    const p = parts();
    build(p, fr.L, fr.T, H, wl, map.LIFTS || []);
    bakeInto(groups, p.list, placeMatrix(fr.x, fr.z, fr.rotY));
  }
  for (const r of map.RAMPS) {
    const build = RAMP_BUILD[r.skin];
    if (!build) continue;
    const p = parts();
    build(p, r.l / M, r.w / M, r.rise / M);
    bakeInto(groups, p.list, placeMatrix(r.x, r.z, r.rotY));
  }
  // the ceiling: a slab over everything but the terrace, and its lights
  const p = parts();
  const B = map.MAP_BOUNDS;
  const x0 = B.minX / M - 0.1, x1 = B.maxX / M + 0.1, z0 = B.minZ / M - 0.1, z1 = B.maxZ / M + 0.1;
  // (planes facing down: from above — the plan camera — the floor shows through)
  p.add(G.plane(7.08 - x0, z1 - z0), 'plaster', '#e9e6e0', (x0 + 7.08) / 2, H, (z0 + z1) / 2, Math.PI / 2, 0, 0);
  p.add(G.plane(x1 - 7.08, 3.07 - z0), 'plaster', '#e9e6e0', (x1 + 7.08) / 2, H, (z0 + 3.07) / 2, Math.PI / 2, 0, 0);
  // the terrace's soffit edge and the tower above it
  p.box('anodised', null, 14.1, 0.4, 0.3, 14.05, H + 0.2, 3.07, 0.01);
  p.box('anodised', null, 0.3, 0.4, 9, 7.08, H + 0.2, 7.55, 0.01);
  const lamps = ceilingParts(p, map);
  // the video wall's black frame and the ticker's housing
  const V = map.VIDEO_WALL;
  if (V) p.box('matte', C.black, 0.06, V.h + 0.06, V.w + 0.06, V.x - 0.215, V.y0 + V.h / 2, V.z, 0.01);
  const T = map.TICKER;
  if (T) p.box('matte', C.black, T.w + 0.06, T.w * 0.035 + 0.06, 0.05, T.at[0], T.at[1], T.at[2] + 0.028, 0.01);
  bakeInto(groups, p.list, placeMatrix(0, 0, 0));
  return { meshes: mergeGroups(groups), lamps };
}

function StaticFloor({ baked }) {
  const lampRef = useRef(1);
  const onyxRef = useRef(0.9);
  useFrame((_, dt) => {
    const st = useStore.getState();
    const L = lightingFor(st.timeOfDay, st.event?.id === 'lights_out');
    const k = Math.min(1, dt * 1.8);
    lampRef.current += (0.45 + L.panel * 0.75 - lampRef.current) * k;
    mat('lamp').color.setScalar(lampRef.current);
    // the onyx and backbar glow harder as the daylight goes
    onyxRef.current += (0.45 + L.practical * 1.1 - onyxRef.current) * k;
    mat('onyx').emissiveIntensity = onyxRef.current;
  });
  return (
    <group>
      {baked.meshes.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mat(key)} castShadow={SHADOW_MATS.has(key)}
          receiveShadow={!['glass', 'facade', 'frosted', 'glow', 'lamp'].includes(key)} frustumCulled={false} />
      ))}
    </group>
  );
}

export function Dressing({ map }) {
  const baked = useMemo(() => bakeFloor(map), [map]);
  const fire = map.FURNITURE.find((f) => f.type === 'tower_fireplace');
  return (
    <group>
      <StaticFloor baked={baked} />
      <CityView />
      <Lifts map={map} />
      {map.VIDEO_WALL && <VideoWall map={map} />}
      <Signs map={map} />
      {map.TICKER && <Ticker map={map} />}
      {fire && <Fire at={[fire.x / M, fire.z / M]} len={fire.d / M - 0.4} />}
      <Terrace map={map} />
      <Pools spots={baked.lamps} />
      <FloorSounds map={map} />
      <RainGlass map={map} />
    </group>
  );
}

// -------------------------------------------------------- furniture
// Colliders only: the visuals are baked into the Dressing.
function TowerPiece({ f }) {
  const spec = COLLIDE[f.type];
  if (!spec || isDecor(f)) return null;
  const boxes = spec(f.w / M, f.d / M, f.h / M);
  return (
    <RigidBody type="fixed" colliders={false} position={[f.x, 0, f.z]} rotation-y={f.rotY || 0} friction={FRICTION[f.type] ?? 0.8}>
      {boxes.map(([hx, hy, hz, x, y, z, rz = 0, ry = 0], i) => (
        <CuboidCollider key={i} args={[u(hx), u(hy), u(hz)]} position={[u(x), u(y), u(z)]} rotation={[0, ry, rz]} />
      ))}
    </RigidBody>
  );
}
export const PIECES = Object.fromEntries(Object.keys(BUILD).map((t) => [t, TowerPiece]));
export const PROPS = TOWER_PROPS;

// ramps and walls with a tower skin/style are already in the baked floor
const Baked = () => null;
export const RAMP_SKINS = Object.fromEntries(Object.keys(RAMP_BUILD).map((k) => [k, Baked]));
export const WALL_STYLES = Object.fromEntries(Object.keys(WALL_BUILD).map((k) => [k, Baked]));

// ------------------------------------------------------------ robot
// The cleaning-robot event on this floor: an autonomous floor scrubber,
// yellow and grey, amber beacon turning, doing slow laps of the lobby marble.
export function Robot() {
  const beacon = useRef();
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2c21a', roughness: 0.4 }), []);
  const grey = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.5, metalness: 0.3 }), []);
  const amber = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffaa22', toneMapped: false }), []);
  useFrame(({ clock }) => {
    if (beacon.current) beacon.current.intensity = 3 + Math.sin(clock.elapsedTime * 12) * 2.5;
  });
  return (
    <group>
      <mesh position={[0, 0.12, 0]} material={grey} castShadow>
        <cylinderGeometry args={[1.9, 1.95, 0.22, 28]} />
      </mesh>
      <mesh position={[0, 0.55, 0]} material={body} castShadow>
        <cylinderGeometry args={[1.7, 1.85, 0.66, 28]} />
      </mesh>
      <mesh position={[0, 0.9, 0]} material={grey}>
        <cylinderGeometry args={[1.2, 1.5, 0.1, 28]} />
      </mesh>
      <mesh position={[0.9, 1.1, 0]} material={amber}>
        <cylinderGeometry args={[0.18, 0.18, 0.3, 12]} />
      </mesh>
      <mesh position={[-0.6, 1.0, 0]} material={grey}>
        <boxGeometry args={[0.9, 0.1, 0.9]} />
      </mesh>
      <pointLight ref={beacon} position={[0.9, 1.5, 0]} intensity={4} distance={8} color="#ffaa22" />
    </group>
  );
}
