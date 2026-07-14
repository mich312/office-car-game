// The handcrafted office: floors, walls, glass, windows, ceiling, big
// furniture, ramps, rain, skyline, dust and floating paper. Static physics.
import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { ROOMS, WALLS, FURNITURE, RAMPS, WALL_HEIGHT, M, MAP_BOUNDS } from '@rc/shared';
import { useStore } from '../store.js';
import { carpetTex, woodTex, tileTex, concreteTex, stainTex, smudgeTex, skylineTex } from './textures.js';

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
    </group>
  );
}

// ------------------------------------------------------------------ floors
function Floors() {
  const mats = useMemo(() => Object.fromEntries(Object.entries(FLOOR_MATS).map(([k, fn]) => [k, fn()])), []);
  const stain = useMemo(() => new THREE.MeshBasicMaterial({ map: stainTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), []);
  const stains = useMemo(() => [
    [-11.5, -3, 2.4], [-2, -5, 1.8], [11.8, -4.6, 3], [6.3, -5.6, 1.6], [0.8, 6.4, 2.2], [12.6, 6.8, 1.7],
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
  const night = useStore((s) => s.night);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const panelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4dd', emissiveIntensity: 1.6 }), []);
  panelMat.emissiveIntensity = lightsOut ? 0.02 : night ? 2.2 : 1.4;
  const panels = useMemo(() => {
    const out = [];
    for (let x = -13; x <= 13; x += 3.4) {
      for (let z = -7.5; z <= 7.5; z += 3.2) {
        if (x < -9.2 && z > 0.2) continue; // balcony is open sky
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
      <mesh rotation-x={Math.PI / 2} position={[3 * M, WALL_HEIGHT, 0]}>
        <planeGeometry args={[24.4 * M, 18.4 * M]} />
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
  const night = useStore((s) => s.night);
  const sky = useMemo(() => skylineTex(), []);
  return (
    <group>
      {/* city backdrop past the north windows */}
      <mesh position={[3 * M, 10 * M * 0.32, 24 * M]} rotation-y={Math.PI}>
        <planeGeometry args={[110 * M, 11 * M]} />
        <meshBasicMaterial map={sky} fog={false} />
      </mesh>
      <mesh position={[-24 * M, 10 * M * 0.32, 4 * M]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[70 * M, 11 * M]} />
        <meshBasicMaterial map={sky} fog={false} />
      </mesh>
      <Rain />
      {/* wet balcony sheen at night */}
      {night && (
        <mesh rotation-x={-Math.PI / 2} position={[-12 * M, 0.01, 4.5 * M]}>
          <planeGeometry args={[6 * M, 9 * M]} />
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
    // over the balcony and just outside the north windows
    x: Math.random() < 0.55 ? (-15 + Math.random() * 6.5) * M : (-9 + Math.random() * 26) * M,
    z: 0,
    y: Math.random() * 60,
    speed: 55 + Math.random() * 25,
  })), []);
  useMemo(() => {
    drops.forEach((d) => {
      d.z = d.x < -9 * M ? (0.2 + Math.random() * 8.6) * M : (9.5 + Math.random() * 6) * M;
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
  const paperData = useMemo(() => Array.from({ length: 10 }, () => ({
    x: (Math.random() * 24 - 12) * M,
    z: (Math.random() * 14 - 7) * M,
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
      <instancedMesh ref={papers} args={[null, null, 10]} frustumCulled={false}>
        <planeGeometry args={[1.16, 1.65]} />
        <meshStandardMaterial color="#f4f2ec" side={THREE.DoubleSide} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
