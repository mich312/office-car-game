// The handcrafted office: floors, walls, glass, windows, ceiling, big
// furniture, ramps, rain, skyline, dust and floating paper. Static physics.
import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { ROOMS, WALLS, FURNITURE, RAMPS, WALL_HEIGHT, M, MAP_BOUNDS, roomAt } from '@rc/shared';
import { useStore } from '../store.js';
import { lightingFor } from './daylight.js';
import { carpetTex, woodTex, tileTex, concreteTex, stainTex, smudgeTex, skylineTex, glowTex, shaftTex } from './textures.js';

const FLOOR_MATS = {
  carpet: () => new THREE.MeshStandardMaterial({ map: carpetTex('#3e4a5e'), roughness: 0.95 }),
  carpet2: () => new THREE.MeshStandardMaterial({ map: carpetTex('#4a3e5e'), roughness: 0.95 }),
  tile: () => new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.25, metalness: 0.05, envMapIntensity: 0.8 }),
  wood: () => new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.45, envMapIntensity: 0.6 }),
  dark: () => new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.4, metalness: 0.2 }),
  concrete: () => new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9 }),
};

export default function Office() {
  return (
    <group>
      <Floors />
      <Walls />
      <Ceiling />
      <BigFurniture />
      <Ramps />
      <Outside />
      <Ambience />
      <LightPools />
      <LightShafts />
    </group>
  );
}

// -------------------------------------------- baked-look light pools & shafts
// Positions mirror the ceiling pointLights in Lighting.jsx. Additive floor
// quads sell the fixtures' cast for free; brightest at night, dead in a
// blackout (only the server-room emergency pool stays, turning red).
const POOL_SPOTS = [[-17.5, -6], [-1, 1.5], [2.5, -8], [-0.5, 9.5], [17, 1.5], [17, -7], [-11, -1]];

function LightPools() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const light = lightingFor(hour, lightsOut);
  const glow = useMemo(() => glowTex(), []);
  const warmMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: glow, color: '#ffe3b0', transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }), [glow]);
  const serverMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: glow, color: '#3d7bff', transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }), [glow]);
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 2.5);
    warmMat.opacity += (light.pool - warmMat.opacity) * k;
    serverMat.opacity += ((lightsOut ? 0.4 : Math.max(0.12, light.pool)) - serverMat.opacity) * k;
    serverMat.color.lerp(new THREE.Color(lightsOut ? '#ff5040' : '#3d7bff'), k);
  });
  return (
    <group>
      {POOL_SPOTS.map(([x, z], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x * M, 0.03, z * M]} material={warmMat}>
          <planeGeometry args={[11, 11]} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[9.5 * M, 0.03, 4.5 * M]} material={serverMat}>
        <planeGeometry args={[9, 9]} />
      </mesh>
    </group>
  );
}

// Light through the north windows, laid down as giant parallel slabs. These
// are the bands you drive through, so they take their tilt from the sun's
// elevation: a low golden-hour sun lays them almost flat along the floor and
// a high afternoon sun drops them steeply onto it.
function LightShafts() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const group = useRef();
  const mat = useRef();
  const tex = useMemo(() => shaftTex(), []);
  const light = lightingFor(hour, lightsOut);
  useFrame((_, dt) => {
    if (!mat.current) return;
    const k = Math.min(1, dt * 1.8);
    const s = light.shaft;
    mat.current.opacity += (s.opacity - mat.current.opacity) * k;
    mat.current.color.lerp(new THREE.Color(s.color), k);
    if (group.current) {
      group.current.rotation.x += (s.tilt - group.current.rotation.x) * k;
      group.current.rotation.y += (s.yaw - group.current.rotation.y) * k;
      const sc = s.length / 22;
      group.current.scale.y += (sc - group.current.scale.y) * k;
    }
  });
  // shared material across all shafts (first mesh's ref drives them all)
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: tex, color: '#8fa8ff', transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }), [tex]);
  mat.current = material;
  return (
    <group ref={group} position={[0, 6.1, 50]} rotation-x={0.99}>
      {[-50, -20, 10, 40, 70].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} material={material}>
          <planeGeometry args={[7, 22]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ floors
function Floors() {
  const mats = useMemo(() => Object.fromEntries(Object.entries(FLOOR_MATS).map(([k, fn]) => [k, fn()])), []);
  const stain = useMemo(() => new THREE.MeshBasicMaterial({ map: stainTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), []);
  const stains = useMemo(() => [
    [-17.5, -4, 2.4], [-1, 0.5, 2], [2.5, -8.8, 3], [9.5, -1, 1.6], [0, 9.7, 2.2],
    [17, 8, 1.7], [-11, -1, 1.8], [16.5, -7, 2], [-6, -6.2, 1.5],
  ], []);
  return (
    <>
      {/* one big physics slab under the whole building + balcony */}
      <RigidBody type="fixed" colliders={false} friction={1.1}>
        <CuboidCollider args={[(MAP_BOUNDS.maxX - MAP_BOUNDS.minX) / 2 + 1, 2, (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ) / 2 + 1]} position={[0, -2, 0]} />
      </RigidBody>
      {ROOMS.map((r) => (
        <mesh key={r.id} rotation-x={-Math.PI / 2} position={[r.x, r.floor === 'concrete' ? -0.02 : 0, r.z]} receiveShadow material={mats[r.floor]}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
      {/* coffee stains */}
      {stains.map(([x, z, s], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} rotation-z={i * 1.7} position={[x * M, 0.02, z * M]} material={stain}>
          <planeGeometry args={[s * M * 0.35, s * M * 0.3]} />
        </mesh>
      ))}
    </>
  );
}

// ------------------------------------------------------------------- walls
// One static rigid body holds every wall collider; all solid walls render
// as a single instanced mesh (glass stays individual for transparency).
function Walls() {
  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e4da', roughness: 0.85 }), []);
  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#bfe3ee', transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0,
    envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
  }), []);
  const railMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8f98a6', metalness: 0.8, roughness: 0.3 }), []);
  const smudge = useMemo(() => new THREE.MeshBasicMaterial({ map: smudgeTex(), transparent: true, opacity: 0.5, depthWrite: false }), []);
  const solid = useMemo(() => WALLS.filter((w) => !w.glass && !w.low), []);
  const glass = useMemo(() => WALLS.filter((w) => w.glass), []);
  const rails = useMemo(() => WALLS.filter((w) => w.low), []);
  const inst = useRef();
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    solid.forEach((w, i) => {
      dummy.position.set(w.x, w.h / 2, w.z);
      dummy.scale.set(w.w, w.h, w.d);
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  }, [solid]);

  return (
    <group>
      <RigidBody type="fixed" colliders={false} friction={0.2}>
        {WALLS.map((w, i) => (
          <CuboidCollider key={i} args={[w.w / 2, w.h / 2, w.d / 2]} position={[w.x, w.h / 2, w.z]} />
        ))}
      </RigidBody>
      <instancedMesh ref={inst} args={[null, null, solid.length]} material={paint} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {rails.map((w, i) => (
        <mesh key={i} position={[w.x, w.h / 2, w.z]} material={railMat}>
          <boxGeometry args={[w.w, w.h, w.d]} />
        </mesh>
      ))}
      {glass.map((w, i) => (
        <group key={i}>
          <mesh position={[w.x, w.h / 2, w.z]} material={glassMat}>
            <boxGeometry args={[w.w, w.h, w.d]} />
          </mesh>
          <mesh position={[w.x + (w.w < w.d ? 0.06 : 0), 1.2, w.z + (w.w < w.d ? 0 : 0.06)]} rotation-y={w.w < w.d ? Math.PI / 2 : 0} material={smudge}>
            <planeGeometry args={[Math.max(w.w, w.d) * 0.9, 2.2]} />
          </mesh>
          <mesh position={[w.x, w.h - 0.1, w.z]} material={railMat}>
            <boxGeometry args={[w.w + 0.05, 0.2, w.d + 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ----------------------------------------------------------------- ceiling
function Ceiling() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const panelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4dd', emissiveIntensity: 1.6 }), []);
  panelMat.emissiveIntensity = lightingFor(hour, lightsOut).panel;
  const panels = useMemo(() => {
    const out = [];
    for (let x = -19.4; x <= 19.4; x += 3.4) {
      for (let z = -10.4; z <= 10.4; z += 3.2) {
        if (roomAt(x * M, z * M)?.outdoor) continue; // balcony is open sky
        out.push([x * M, z * M]);
      }
    }
    return out;
  }, []);
  const inst = useRef();
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    panels.forEach(([x, z], i) => {
      dummy.position.set(x, WALL_HEIGHT - 0.06, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  }, [panels]);
  return (
    <group>
      {/* main slab covers everything east of the balcony… */}
      <mesh rotation-x={Math.PI / 2} position={[3.5 * M, WALL_HEIGHT, 0]}>
        <planeGeometry args={[35.4 * M, 24.4 * M]} />
        <meshStandardMaterial color="#d5d2ca" roughness={0.9} />
      </mesh>
      {/* …plus the reception strip (the balcony above stays open sky) */}
      <mesh rotation-x={Math.PI / 2} position={[-17.5 * M, WALL_HEIGHT, -6.5 * M]}>
        <planeGeometry args={[7.4 * M, 11.4 * M]} />
        <meshStandardMaterial color="#d5d2ca" roughness={0.9} />
      </mesh>
      <instancedMesh ref={inst} args={[null, null, panels.length]} material={panelMat} frustumCulled={false}>
        <planeGeometry args={[1.2 * M, 0.6 * M]} />
      </instancedMesh>
    </group>
  );
}

// ------------------------------------------------------------ big furniture
const WOOD = () => new THREE.MeshStandardMaterial({ map: woodTex([2, 1]), roughness: 0.5, envMapIntensity: 0.5 });
const METAL = () => new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.85, roughness: 0.35 });
const FABRIC = (c = '#5b8bd6') => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
const PLASTIC = (c = '#e8e8e8') => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });

function BigFurniture() {
  const mats = useMemo(() => ({
    wood: WOOD(), metal: METAL(), fabric: FABRIC(), fabric2: FABRIC('#c0573f'),
    white: PLASTIC(), dark: PLASTIC('#2f333b'), grey: PLASTIC('#b9bfc7'),
    ceramic: new THREE.MeshStandardMaterial({ color: '#f2f4f6', roughness: 0.22, envMapIntensity: 0.7 }),
    felt: new THREE.MeshStandardMaterial({ color: '#2e7d4f', roughness: 0.9 }),
    teal: FABRIC('#3f7d7a'),
  }), []);
  return (
    <group>
      {FURNITURE.map((f, i) => <Furniture key={i} f={f} mats={mats} />)}
    </group>
  );
}

function Furniture({ f, mats }) {
  const { type, x, z, w, d, h, rotY } = f;
  const legIn = 0.28;
  switch (type) {
    case 'desk':
    case 'table':
    case 'ceodesk': {
      const top = 0.12;
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
          {/* cars drive UNDER desks — collider is just the top slab + legs */}
          <CuboidCollider args={[w / 2, top / 2, d / 2]} position={[0, h - top / 2, 0]} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <CuboidCollider key={i} args={[0.1, h / 2, 0.1]} position={[sx * (w / 2 - legIn), h / 2, sz * (d / 2 - legIn)]} />
          ))}
          <mesh position={[0, h - top / 2, 0]} castShadow receiveShadow material={type === 'ceodesk' ? mats.dark : mats.wood}>
            <boxGeometry args={[w, top, d]} />
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (w / 2 - legIn), (h - top) / 2, sz * (d / 2 - legIn)]} castShadow material={mats.metal}>
              <cylinderGeometry args={[0.09, 0.09, h - top, 8]} />
            </mesh>
          ))}
        </RigidBody>
      );
    }
    case 'sofa':
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
          <CuboidCollider args={[w / 2, (h * 0.55) / 2, d / 2]} position={[0, h * 0.275, 0]} />
          <CuboidCollider args={[w / 2, h / 2, d * 0.14]} position={[0, h / 2, -d / 2 + d * 0.14]} />
          <mesh position={[0, h * 0.275, 0]} castShadow receiveShadow material={mats.fabric}>
            <boxGeometry args={[w, h * 0.55, d]} />
          </mesh>
          <mesh position={[0, h * 0.6, -d / 2 + d * 0.14]} castShadow material={mats.fabric}>
            <boxGeometry args={[w, h * 0.8, d * 0.28]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (w / 2 - 0.15), h * 0.45, 0]} castShadow material={mats.fabric}>
              <boxGeometry args={[0.3, h * 0.9, d]} />
            </mesh>
          ))}
        </RigidBody>
      );
    case 'rack':
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} friction={0.4}>
          <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={mats.dark}>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          <ServerLights w={w} h={h} d={d} />
        </RigidBody>
      );
    case 'fridge':
      return (
        <SimpleBox x={x} z={z} w={w} d={d} h={h} mat={mats.grey}>
          <mesh position={[0, h * 0.55, d / 2 + 0.02]} material={mats.metal}>
            <boxGeometry args={[0.08, h * 0.5, 0.06]} />
          </mesh>
        </SimpleBox>
      );
    case 'copier':
      return (
        <SimpleBox x={x} z={z} w={w} d={d} h={h} mat={mats.white}>
          <mesh position={[0, h + 0.05, 0]} castShadow material={mats.dark}>
            <boxGeometry args={[w * 0.8, 0.1, d * 0.6]} />
          </mesh>
          <mesh position={[0, h * 0.6, d / 2 + 0.01]} material={mats.dark}>
            <planeGeometry args={[w * 0.5, 0.25]} />
          </mesh>
        </SimpleBox>
      );
    case 'whiteboard':
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY}>
          <CuboidCollider args={[w / 2 + 0.02, h / 2, d / 2]} position={[0, h / 2 + 0.4, 0]} />
          <mesh position={[0, h / 2 + 0.4, 0]} castShadow material={mats.white}>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          <mesh position={[w / 2 + 0.01, h / 2 + 0.5, 0]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[d * 0.9, h * 0.85]} />
            <meshStandardMaterial color="#f6f8f9" roughness={0.3} />
          </mesh>
        </RigidBody>
      );
    case 'bookshelf':
      return (
        <SimpleBox x={x} z={z} w={w} d={d} h={h} mat={mats.wood}>
          <ShelfBooks w={w} d={d} />
        </SimpleBox>
      );
    // ------------------------------------------------ decor (no colliders)
    case 'rug': {
      const c = ['#7a4f3f', '#3f5a7a', '#54707a', '#6b5a7a'][Math.abs(Math.round(x * 0.7 + z * 1.3)) % 4];
      return (
        <mesh rotation-x={-Math.PI / 2} position={[x, 0.018, z]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={c} roughness={1} />
        </mesh>
      );
    }
    case 'art': {
      const size = Math.max(w, d);
      const c = ['#e2704d', '#4d8fe2', '#57b878', '#c9a54a'][Math.abs(Math.round(x + z)) % 4];
      return (
        <group position={[x, 7.2, z]} rotation-y={rotY}>
          <mesh material={mats.dark}>
            <boxGeometry args={[size, h, 0.08]} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[size * 0.85, h * 0.8]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.1, 0.06]} rotation-z={0.4}>
            <planeGeometry args={[size * 0.45, h * 0.22]} />
            <meshStandardMaterial color="#f0ede4" roughness={0.9} />
          </mesh>
        </group>
      );
    }
    case 'tv':
      return (
        <group position={[x, 6.8, z]} rotation-y={rotY}>
          <mesh material={mats.dark}>
            <boxGeometry args={[Math.max(w, d), h, 0.14]} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <planeGeometry args={[Math.max(w, d) * 0.92, h * 0.85]} />
            <meshStandardMaterial color="#0d3b52" emissive="#155a7d" emissiveIntensity={0.8} roughness={0.3} />
          </mesh>
        </group>
      );
    // --------------------------------------------------- new interior kit
    case 'booth':
      // focus pod: tall fabric shell open on one side, cushion inside
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.8}>
          <CuboidCollider args={[w / 2, h / 2, 0.09]} position={[0, h / 2, -d / 2 + 0.09]} />
          {[-1, 1].map((s) => (
            <CuboidCollider key={s} args={[0.09, h / 2, d / 2]} position={[s * (w / 2 - 0.09), h / 2, 0]} />
          ))}
          <CuboidCollider args={[w / 2 - 0.18, 0.3, d / 2 - 0.25]} position={[0, 0.3, -0.12]} />
          <mesh castShadow receiveShadow material={mats.teal} position={[0, h / 2, -d / 2 + 0.09]}>
            <boxGeometry args={[w, h, 0.18]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow material={mats.teal} position={[s * (w / 2 - 0.09), h / 2, 0]}>
              <boxGeometry args={[0.18, h, d]} />
            </mesh>
          ))}
          <mesh castShadow material={mats.fabric} position={[0, 0.42, -0.12]}>
            <boxGeometry args={[w - 0.4, 0.5, d - 0.5]} />
          </mesh>
        </RigidBody>
      );
    case 'stall':
      return <SimpleBox x={x} z={z} w={w} d={d} h={h} rotY={rotY} mat={mats.grey} />;
    case 'sink':
      return (
        <SimpleBox x={x} z={z} w={w} d={d} h={h} rotY={rotY} mat={mats.ceramic}>
          {[-w / 4, w / 4].map((sx) => (
            <group key={sx} position={[sx, h, 0]}>
              <mesh material={mats.metal} position={[0, 0.12, -d / 4]}>
                <cylinderGeometry args={[0.05, 0.05, 0.35, 8]} />
              </mesh>
              <mesh material={mats.metal} position={[0, 0.28, -d / 4 + 0.14]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.04, 0.04, 0.3, 8]} />
              </mesh>
              <mesh position={[0, 0.03, 0.05]} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.14, 0.3, 16]} />
                <meshStandardMaterial color="#d9dee3" roughness={0.15} metalness={0.2} />
              </mesh>
            </group>
          ))}
        </SimpleBox>
      );
    case 'toilet':
      // load-bearing comedy
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY}>
          <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, -0.05]} />
          <mesh castShadow material={mats.ceramic} position={[0, h * 0.72, -d / 2 + 0.18]}>
            <boxGeometry args={[w * 0.92, h * 0.85, 0.36]} />
          </mesh>
          <mesh castShadow material={mats.ceramic} position={[0, h * 0.32, 0.1]}>
            <cylinderGeometry args={[w * 0.42, w * 0.28, h * 0.62, 14]} />
          </mesh>
          <mesh material={mats.ceramic} position={[0, h * 0.66, 0.1]} rotation-x={-Math.PI / 2}>
            <torusGeometry args={[w * 0.36, 0.1, 8, 18]} />
          </mesh>
          <mesh castShadow material={mats.ceramic} position={[0, h * 0.98, -d / 2 + 0.4]} rotation-x={-0.4}>
            <cylinderGeometry args={[w * 0.4, w * 0.4, 0.06, 14]} />
          </mesh>
          <mesh material={mats.metal} position={[w * 0.28, h * 1.18, -d / 2 + 0.18]}>
            <boxGeometry args={[0.18, 0.06, 0.1]} />
          </mesh>
        </RigidBody>
      );
    case 'bartop': {
      const long = Math.max(w, d);
      const alongX = w >= d;
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
          <CuboidCollider args={[w / 2, 0.07, d / 2]} position={[0, h - 0.07, 0]} />
          {[-1, 1].map((s) => (
            <CuboidCollider
              key={s}
              args={[0.07, (h - 0.14) / 2, 0.07]}
              position={[alongX ? s * (long / 2 - 0.25) : 0, (h - 0.14) / 2, alongX ? 0 : s * (long / 2 - 0.25)]}
            />
          ))}
          <mesh castShadow receiveShadow material={mats.wood} position={[0, h - 0.07, 0]}>
            <boxGeometry args={[w, 0.14, d]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              castShadow
              material={mats.metal}
              position={[alongX ? s * (long / 2 - 0.25) : 0, (h - 0.14) / 2, alongX ? 0 : s * (long / 2 - 0.25)]}
            >
              <cylinderGeometry args={[0.07, 0.09, h - 0.14, 10]} />
            </mesh>
          ))}
        </RigidBody>
      );
    }
    case 'foosball':
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.9}>
          <CuboidCollider args={[w / 2, h * 0.25, d / 2]} position={[0, h * 0.75, 0]} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <CuboidCollider key={i} args={[0.09, h * 0.25, 0.09]} position={[sx * (w / 2 - 0.2), h * 0.25, sz * (d / 2 - 0.2)]} />
          ))}
          <mesh castShadow receiveShadow material={mats.wood} position={[0, h * 0.75, 0]}>
            <boxGeometry args={[w, h * 0.5, d]} />
          </mesh>
          <mesh receiveShadow material={mats.felt} position={[0, h + 0.005, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[w * 0.86, d * 0.82]} />
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} castShadow material={mats.dark} position={[sx * (w / 2 - 0.2), h * 0.25, sz * (d / 2 - 0.2)]}>
              <boxGeometry args={[0.18, h * 0.5, 0.18]} />
            </mesh>
          ))}
          {[-0.3, -0.1, 0.1, 0.3].map((fx, i) => (
            <group key={i} position={[fx * w * 2, h + 0.16, 0]}>
              <mesh material={mats.metal} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.03, 0.03, d + 0.5, 8]} />
              </mesh>
              {[-0.22, 0, 0.22].map((mz, j) => (
                <mesh key={j} position={[0, -0.1, mz * d]} castShadow>
                  <boxGeometry args={[0.08, 0.2, 0.07]} />
                  <meshStandardMaterial color={i % 2 ? '#e8332a' : '#3498db'} roughness={0.5} />
                </mesh>
              ))}
            </group>
          ))}
        </RigidBody>
      );
    case 'hoop':
      // mini basketball hoop — backboard against the wall, ring over the court
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY}>
          <CuboidCollider args={[0.09, h / 2, 0.09]} position={[0, h / 2, -0.2]} />
          <CuboidCollider args={[0.6, 0.42, 0.06]} position={[0, h * 0.82, 0]} />
          <mesh castShadow material={mats.metal} position={[0, h / 2, -0.2]}>
            <cylinderGeometry args={[0.08, 0.1, h, 10]} />
          </mesh>
          <mesh castShadow material={mats.white} position={[0, h * 0.82, 0]}>
            <boxGeometry args={[1.2, 0.84, 0.08]} />
          </mesh>
          <mesh position={[0, h * 0.74, 0.05]}>
            <planeGeometry args={[0.5, 0.4]} />
            <meshStandardMaterial color="#e8332a" roughness={0.6} />
          </mesh>
          <mesh material={mats.metal} position={[0, h * 0.68, 0.35]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.32, 0.035, 8, 20]} />
          </mesh>
          <mesh position={[0, h * 0.6, 0.35]}>
            <cylinderGeometry args={[0.32, 0.2, 0.35, 12, 1, true]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.9} transparent opacity={0.55} side={THREE.DoubleSide} />
          </mesh>
        </RigidBody>
      );
    case 'bench':
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
          <CuboidCollider args={[w / 2, 0.06, d / 2]} position={[0, h, 0]} />
          {[-1, 1].map((s) => (
            <CuboidCollider key={s} args={[w / 2 - 0.05, h / 2, 0.06]} position={[0, h / 2, s * (d / 2 - 0.15)]} />
          ))}
          {[-0.32, 0, 0.32].map((sx, i) => (
            <mesh key={i} castShadow material={mats.wood} position={[sx * w, h, 0]}>
              <boxGeometry args={[w * 0.28, 0.1, d]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow material={mats.metal} position={[0, h / 2, s * (d / 2 - 0.15)]}>
              <boxGeometry args={[w - 0.1, h, 0.1]} />
            </mesh>
          ))}
        </RigidBody>
      );
    case 'planter':
      return (
        <SimpleBox x={x} z={z} w={w} d={d} h={h} rotY={rotY} mat={mats.grey}>
          <mesh position={[0, h + 0.01, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[w * 0.9, d * 0.9]} />
            <meshStandardMaterial color="#2e2218" roughness={1} />
          </mesh>
          {(() => {
            const n = Math.max(2, Math.round(Math.max(w, d) / 3));
            const alongX = w >= d;
            return Array.from({ length: n }, (_, i) => {
              const t = n === 1 ? 0 : i / (n - 1) - 0.5;
              return (
                <mesh key={i} castShadow position={[alongX ? t * (w - 1) : 0, h + 0.55 + (i % 2) * 0.2, alongX ? 0 : t * (d - 1)]}>
                  <sphereGeometry args={[0.5 + (i % 3) * 0.12, 8, 6]} />
                  <meshStandardMaterial color={['#2ecc71', '#27a85c', '#3a9e52'][i % 3]} roughness={0.85} flatShading />
                </mesh>
              );
            });
          })()}
        </SimpleBox>
      );
    case 'vending':
      // Ram it at speed: a can drops, sometimes golden (the server pays out).
      return (
        <SimpleBox x={x} z={z} w={w} d={d} h={h} mat={mats.dark}>
          {/* glowing front panel facing into the kitchen (+z) */}
          <mesh position={[0, h * 0.58, d / 2 + 0.01]}>
            <planeGeometry args={[w * 0.72, h * 0.62]} />
            <meshStandardMaterial color="#0d2b38" emissive="#1f7a9e" emissiveIntensity={0.7} roughness={0.3} />
          </mesh>
          {/* can rows behind the glass */}
          {[0.35, 0.55, 0.75].map((fy, row) => (
            <group key={row}>
              {[-0.28, -0.09, 0.1, 0.29].map((fx, col) => (
                <mesh key={col} position={[fx * w, h * fy, d / 2 + 0.02]} rotation-x={Math.PI / 2}>
                  <cylinderGeometry args={[0.055, 0.055, 0.02, 8]} />
                  <meshStandardMaterial color={['#e8332a', '#f1c40f', '#2ecc71', '#3498db'][(row + col) % 4]} emissive="#222" roughness={0.3} />
                </mesh>
              ))}
            </group>
          ))}
          {/* dispensing slot */}
          <mesh position={[0, h * 0.14, d / 2 + 0.01]}>
            <planeGeometry args={[w * 0.6, h * 0.1]} />
            <meshStandardMaterial color="#08090c" roughness={0.9} />
          </mesh>
        </SimpleBox>
      );
    default:
      return <SimpleBox x={x} z={z} w={w} d={d} h={h} rotY={rotY} mat={type === 'recdesk' ? mats.wood : type === 'island' || type === 'counter' ? mats.grey : mats.white} />;
  }
}

function SimpleBox({ x, z, w, d, h, rotY = 0, mat, children }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.8}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={mat}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {children}
    </RigidBody>
  );
}

// Static instanced book rows for the CEO bookshelf (one draw call)
const BOOK_COLORS = ['#a33f3f', '#3f6ea3', '#3fa36a', '#a3823f', '#7a3fa3'];
function ShelfBooks({ w, d }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let n = 0;
    [0.35, 0.85, 1.35, 1.85].forEach((sy, i) => {
      for (let j = 0; j < 7; j++) {
        dummy.position.set(-w / 2 - 0.09, sy * M * 0.36 + 0.5, -d / 2 + 0.25 + j * (d - 0.5) / 6);
        dummy.scale.set(1, 1 + (j % 3) * 0.14, 1);
        dummy.updateMatrix();
        ref.current.setMatrixAt(n, dummy.matrix);
        ref.current.setColorAt(n, color.set(BOOK_COLORS[(i + j) % BOOK_COLORS.length]));
        n++;
      }
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, [w, d]);
  return (
    <instancedMesh ref={ref} args={[null, null, 28]} frustumCulled={false}>
      <boxGeometry args={[0.14, 0.42, 0.12]} />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}

// Blinking server LEDs — one instanced mesh per rack, colors toggled per frame
const _ledColor = new THREE.Color();
function ServerLights({ w, h, d }) {
  const ref = useRef();
  const leds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    y: 0.4 + (i % 7) * (h * 0.55) / 7 + h * 0.2,
    x: -w * 0.3 + (i > 6 ? w * 0.6 : 0),
    speed: 2 + Math.random() * 9,
    phase: Math.random() * 10,
    color: new THREE.Color(Math.random() > 0.3 ? '#37ff7c' : '#ffb347'),
  })), [w, h]);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    leds.forEach((l, i) => {
      dummy.position.set(l.x, l.y, d / 2 + 0.015);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [leds, d]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    leds.forEach((l, i) => {
      const on = Math.sin(t * l.speed + l.phase) > 0;
      _ledColor.copy(l.color).multiplyScalar(on ? 1 : 0.08);
      ref.current.setColorAt(i, _ledColor);
    });
    ref.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, 14]} frustumCulled={false}>
      <planeGeometry args={[0.06, 0.06]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------- ramps
function Ramps() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c8b28a', roughness: 0.7 }), []);
  return (
    <group>
      {RAMPS.map((r, i) => {
        const angle = Math.atan2(r.rise, r.l);
        const len = Math.hypot(r.l, r.rise);
        return (
          <RigidBody key={i} type="fixed" colliders={false} position={[r.x, 0, r.z]} rotation-y={r.rotY} friction={1.2}>
            <group rotation-x={-angle} position={[0, r.rise / 2, 0]}>
              <CuboidCollider args={[r.w / 2, 0.04, len / 2]} />
              <mesh castShadow receiveShadow material={mat}>
                <boxGeometry args={[r.w, 0.08, len]} />
              </mesh>
            </group>
          </RigidBody>
        );
      })}
    </group>
  );
}

// ------------------------------------------- outside: skyline, rain, night
function Outside() {
  const hour = useStore((s) => s.timeOfDay);
  const wet = lightingFor(hour, false).wet;
  const sky = useMemo(() => skylineTex(), []);
  return (
    <group>
      {/* city backdrop past the north windows */}
      <mesh position={[0, 10 * M * 0.32, 27 * M]} rotation-y={Math.PI}>
        <planeGeometry args={[140 * M, 11 * M]} />
        <meshBasicMaterial map={sky} fog={false} />
      </mesh>
      <mesh position={[-27 * M, 10 * M * 0.32, 5 * M]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[90 * M, 11 * M]} />
        <meshBasicMaterial map={sky} fog={false} />
      </mesh>
      <Rain />
      {/* wet balcony sheen once the light has gone */}
      {wet && (
        <mesh rotation-x={-Math.PI / 2} position={[-17.5 * M, 0.01, 5.5 * M]}>
          <planeGeometry args={[7 * M, 13 * M]} />
          <meshStandardMaterial color="#20242e" roughness={0.08} metalness={0.4} transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

const RAIN_COUNT = 350;
function Rain() {
  const ref = useRef();
  const drops = useMemo(() => Array.from({ length: RAIN_COUNT }, () => ({
    // over the balcony terrace and just outside the north windows
    x: Math.random() < 0.55 ? (-21 + Math.random() * 7) * M : (-14 + Math.random() * 35) * M,
    z: 0,
    y: Math.random() * 60,
    speed: 55 + Math.random() * 25,
  })), []);
  useMemo(() => {
    drops.forEach((d) => {
      d.z = d.x < -14 * M ? (-1 + Math.random() * 13) * M : (12.5 + Math.random() * 6) * M;
    });
  }, [drops]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const d = drops[i];
      d.y -= d.speed * dt;
      if (d.y < 0) d.y = 55 + Math.random() * 10;
      dummy.position.set(d.x, d.y, d.z);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, RAIN_COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.03, 1.4, 0.03]} />
      <meshBasicMaterial color="#9fb6d8" transparent opacity={0.4} />
    </instancedMesh>
  );
}

// -------------------------------------------------- dust + floating paper
function Ambience() {
  const papers = useRef();
  const paperData = useMemo(() => Array.from({ length: 12 }, () => ({
    x: (Math.random() * 36 - 18) * M,
    z: (Math.random() * 20 - 10) * M,
    y: 3 + Math.random() * 10,
    phase: Math.random() * 10,
    spin: 0.3 + Math.random(),
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!papers.current) return;
    const t = clock.elapsedTime;
    paperData.forEach((p, i) => {
      dummy.position.set(
        p.x + Math.sin(t * 0.3 + p.phase) * 3,
        p.y + Math.sin(t * 0.5 + p.phase * 2) * 1.5,
        p.z + Math.cos(t * 0.24 + p.phase) * 3,
      );
      dummy.rotation.set(t * p.spin, p.phase + t * 0.4, Math.sin(t + p.phase));
      dummy.updateMatrix();
      papers.current.setMatrixAt(i, dummy.matrix);
    });
    papers.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <Sparkles count={140} scale={[140, 15, 90]} position={[0, 8, 0]} size={2.2} speed={0.25} opacity={0.35} color="#ffe9c9" />
      <instancedMesh ref={papers} args={[null, null, 12]} frustumCulled={false}>
        <planeGeometry args={[1.16, 1.65]} />
        <meshStandardMaterial color="#f4f2ec" side={THREE.DoubleSide} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
