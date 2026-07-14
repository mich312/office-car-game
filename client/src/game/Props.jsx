// Every small object in the office is a live physics body. Nothing is
// decoration: mugs tip, chairs spin, papers scatter, glasses shatter,
// plants dump soil, monitors face-plant off desks.
import { memo, useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { PROPS, M } from '@rc/shared';
import { makeScreen } from './textures.js';
import { burst } from './particles.jsx';
import { audio } from '../audio.js';

const m2u = M; // meters → units shorthand

export default function Props() {
  const screens = useMemo(() => [makeScreen('code'), makeScreen('chart'), makeScreen('code')], []);
  useEffect(() => {
    const iv = setInterval(() => screens.forEach((s) => Math.random() > 0.4 && s.tick()), 300);
    return () => clearInterval(iv);
  }, [screens]);
  let monitorIdx = 0;
  return (
    <group>
      {PROPS.map((p, i) => {
        const key = `${p.type}${i}`;
        switch (p.type) {
          case 'mug': return <Mug key={key} p={p} />;
          case 'glass': return <GlassCup key={key} p={p} />;
          case 'pen': return <Pen key={key} p={p} />;
          case 'stack': return <PaperStack key={key} p={p} />;
          case 'book': return <Book key={key} p={p} i={i} />;
          case 'keyboard': return <Keyboard key={key} p={p} />;
          case 'monitor': return <Monitor key={key} p={p} screen={screens[monitorIdx++ % screens.length]} />;
          case 'chair': return <Chair key={key} p={p} />;
          case 'plant': return <Plant key={key} p={p} />;
          case 'bottle': return <Bottle key={key} p={p} />;
          case 'basketball': return <Basketball key={key} p={p} />;
          case 'marble': return <Marble key={key} p={p} />;
          case 'box': return <CardboardBox key={key} p={p} />;
          case 'lamp': return <Lamp key={key} p={p} />;
          case 'trash': return <Trash key={key} p={p} />;
          default: return null;
        }
      })}
    </group>
  );
}

const impactSound = (() => {
  let last = 0;
  return (mag) => {
    const now = performance.now();
    if (now - last < 90 || mag < 900) return;
    last = now;
    audio.impact(Math.min(1, mag / 9000));
  };
})();

function Body({ p, mass, children, colliders = null, angularDamping = 0.15, restitution = 0.25, friction = 0.7, ccd = false, onForce }) {
  return (
    <RigidBody
      position={[p.x, p.y + 0.4, p.z]}
      rotation-y={p.rotY || 0}
      colliders={colliders}
      mass={mass}
      angularDamping={angularDamping}
      linearDamping={0.08}
      restitution={restitution}
      friction={friction}
      ccd={ccd}
      onContactForce={(e) => {
        impactSound(e.totalForceMagnitude);
        onForce?.(e);
      }}
    >
      {children}
    </RigidBody>
  );
}

const mugMat = new THREE.MeshStandardMaterial({ color: '#e8503a', roughness: 0.35 });
const mugMat2 = new THREE.MeshStandardMaterial({ color: '#f5f2ea', roughness: 0.35 });
let mugN = 0;
function Mug({ p }) {
  const mat = useMemo(() => (mugN++ % 2 ? mugMat : mugMat2), []);
  const R = 0.045 * m2u, H = 0.1 * m2u;
  return (
    <Body p={p} mass={0.5}>
      <CylinderCollider args={[H / 2, R]} />
      <mesh castShadow material={mat}>
        <cylinderGeometry args={[R, R * 0.85, H, 16]} />
      </mesh>
      <mesh position={[R + 0.05, 0, 0]} rotation-z={Math.PI / 2} castShadow material={mat}>
        <torusGeometry args={[H * 0.28, 0.035, 8, 14]} />
      </mesh>
      <mesh position={[0, H / 2 - 0.02, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[R * 0.82, 14]} />
        <meshStandardMaterial color="#4a2c14" roughness={0.15} />
      </mesh>
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
      <mesh castShadow>
        <cylinderGeometry args={[R, R * 0.8, H, 14, 1, true]} />
        <meshPhysicalMaterial color="#d7f0f7" transparent opacity={0.35} roughness={0.05} side={THREE.DoubleSide} />
      </mesh>
    </Body>
  );
}

const penColors = ['#1b6ef3', '#e8332a', '#222', '#0a9c4f'];
function Pen({ p }) {
  const color = useMemo(() => penColors[(Math.random() * penColors.length) | 0], []);
  const R = 0.009 * m2u, L = 0.145 * m2u;
  return (
    <Body p={p} mass={0.05} friction={0.4} angularDamping={0.05}>
      <group rotation-z={Math.PI / 2}>
        <CylinderCollider args={[L / 2, R]} />
        <mesh castShadow>
          <cylinderGeometry args={[R, R, L, 8]} />
          <meshStandardMaterial color={color} roughness={0.3} />
        </mesh>
        <mesh position={[0, L / 2 + 0.03, 0]} castShadow>
          <coneGeometry args={[R * 0.9, 0.09, 8]} />
          <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </Body>
  );
}

// A stack of loose sheets — hitting it sends paper flying
function PaperStack({ p }) {
  const sheets = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);
  const W = 0.21 * m2u, D = 0.297 * m2u, T = 0.012 * m2u;
  return (
    <group>
      {sheets.map((i) => (
        <RigidBody
          key={i}
          position={[p.x + (Math.random() - 0.5) * 0.05, p.y + 0.15 + i * (T + 0.015), p.z + (Math.random() - 0.5) * 0.05]}
          rotation-y={(p.rotY || 0) + (Math.random() - 0.5) * 0.2}
          colliders={false}
          mass={0.04}
          friction={0.5}
          linearDamping={0.6}
          angularDamping={0.4}
        >
          <CuboidCollider args={[W / 2, T / 2, D / 2]} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[W, T, D]} />
            <meshStandardMaterial color={i % 2 ? '#f7f5ef' : '#efede4'} roughness={0.9} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}

const bookColors = ['#8e3b3b', '#3b5f8e', '#3b8e5c', '#8e7a3b', '#5c3b8e', '#2f3542'];
function Book({ p, i }) {
  const W = 0.17 * m2u, H = 0.05 * m2u, L = 0.24 * m2u;
  return (
    <Body p={p} mass={0.9} friction={0.9}>
      <CuboidCollider args={[W / 2, H / 2, L / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, L]} />
        <meshStandardMaterial color={bookColors[i % bookColors.length]} roughness={0.7} />
      </mesh>
      <mesh position={[0.02, 0, 0]}>
        <boxGeometry args={[W - 0.08, H * 0.82, L + 0.015]} />
        <meshStandardMaterial color="#f1ead8" roughness={0.9} />
      </mesh>
    </Body>
  );
}

function Keyboard({ p }) {
  const W = 0.44 * m2u, H = 0.03 * m2u, D = 0.15 * m2u;
  const keys = useMemo(() => {
    const arr = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) arr.push([(-W / 2) + 0.14 + c * (W - 0.3) / 11, (-D / 2) + 0.12 + r * (D - 0.24) / 3]);
    return arr;
  }, [W, D]);
  return (
    <Body p={p} mass={0.7} friction={0.8}>
      <CuboidCollider args={[W / 2, H / 2 + 0.02, D / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#23262d" roughness={0.5} />
      </mesh>
      {keys.map(([x, z], i) => (
        <mesh key={i} position={[x, H / 2 + 0.012, z]}>
          <boxGeometry args={[0.09, 0.025, 0.09]} />
          <meshStandardMaterial color="#3a3f4a" roughness={0.4} />
        </mesh>
      ))}
    </Body>
  );
}

function Monitor({ p, screen }) {
  const W = 0.55 * m2u, H = 0.33 * m2u;
  return (
    <Body p={p} mass={1.4} angularDamping={0.3}>
      {/* stand */}
      <CuboidCollider args={[0.35, 0.03, 0.25]} position={[0, -H / 2 - 0.3, 0]} />
      <CuboidCollider args={[0.06, 0.18, 0.06]} position={[0, -H / 2 - 0.12, 0]} />
      {/* panel */}
      <CuboidCollider args={[W / 2, H / 2, 0.05]} />
      <mesh position={[0, -H / 2 - 0.3, 0]} castShadow>
        <boxGeometry args={[0.7, 0.06, 0.5]} />
        <meshStandardMaterial color="#2b2e35" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, -H / 2 - 0.12, 0]} castShadow>
        <boxGeometry args={[0.12, 0.36, 0.12]} />
        <meshStandardMaterial color="#2b2e35" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[W, H, 0.1]} />
        <meshStandardMaterial color="#14161a" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.055]}>
        <planeGeometry args={[W * 0.92, H * 0.88]} />
        <meshBasicMaterial map={screen.tex} toneMapped={false} />
      </mesh>
    </Body>
  );
}

function Chair({ p }) {
  const seatH = 0.45 * m2u;
  return (
    <Body p={p} mass={3.5} angularDamping={0.08} friction={0.3}>
      {/* star base + column + seat: colliders */}
      <CylinderCollider args={[0.04, 0.32 * m2u]} position={[0, -seatH + 0.08, 0]} />
      <CylinderCollider args={[seatH / 2, 0.045 * m2u]} position={[0, -seatH / 2 + 0.1, 0]} />
      <CuboidCollider args={[0.24 * m2u, 0.05 * m2u, 0.24 * m2u]} position={[0, 0.1, 0]} />
      <CuboidCollider args={[0.22 * m2u, 0.26 * m2u, 0.04 * m2u]} position={[0, 0.32 * m2u, -0.22 * m2u]} />
      {/* visuals */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation-y={(i / 5) * Math.PI * 2} position={[0, -seatH + 0.07, 0]} castShadow>
          <boxGeometry args={[0.09, 0.07, 0.62 * m2u]} />
          <meshStandardMaterial color="#3a3d44" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, -seatH / 2 + 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.05 * m2u, 0.05 * m2u, seatH, 10]} />
        <meshStandardMaterial color="#9aa1ab" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.26 * m2u, 0.24 * m2u, 0.1 * m2u, 16]} />
        <meshStandardMaterial color="#c23b2e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.32 * m2u, -0.22 * m2u]} castShadow>
        <boxGeometry args={[0.44 * m2u, 0.5 * m2u, 0.07 * m2u]} />
        <meshStandardMaterial color="#c23b2e" roughness={0.8} />
      </mesh>
    </Body>
  );
}

function Plant({ p }) {
  const ref = useRef();
  const spilled = useRef(false);
  const leaves = useRef();
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
    <RigidBody ref={ref} position={[p.x, p.y + 0.4, p.z]} colliders={false} mass={2.5} angularDamping={0.4} friction={0.8}
      onContactForce={(e) => impactSound(e.totalForceMagnitude)}>
      <CylinderCollider args={[potH / 2, potR]} />
      <CylinderCollider args={[0.35 * m2u, 0.12 * m2u]} position={[0, potH / 2 + 0.35 * m2u, 0]} />
      <mesh castShadow>
        <cylinderGeometry args={[potR, potR * 0.78, potH, 14]} />
        <meshStandardMaterial color="#b0603f" roughness={0.7} />
      </mesh>
      <mesh position={[0, potH / 2 - 0.03, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[potR * 0.9, 14]} />
        <meshStandardMaterial color="#33241a" roughness={1} />
      </mesh>
      <group ref={leaves} position={[0, potH / 2, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} rotation-y={(i / 6) * Math.PI * 2} rotation-x={-0.5} position={[0, 0.25 * m2u, 0]} castShadow>
            <coneGeometry args={[0.09 * m2u, 0.5 * m2u, 5]} />
            <meshStandardMaterial color={i % 2 ? '#2e7d3c' : '#3c9b4e'} roughness={0.8} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  );
}

function Bottle({ p }) {
  const R = 0.035 * m2u, H = 0.24 * m2u;
  return (
    <Body p={p} mass={0.4} restitution={0.35} angularDamping={0.05}>
      <group rotation-z={Math.PI / 2}>
        <CylinderCollider args={[H / 2, R]} />
        <mesh castShadow>
          <cylinderGeometry args={[R, R, H, 12]} />
          <meshPhysicalMaterial color="#5fb8e0" transparent opacity={0.5} roughness={0.1} />
        </mesh>
        <mesh position={[0, H / 2 + 0.04, 0]} castShadow>
          <cylinderGeometry args={[R * 0.4, R * 0.4, 0.1, 10]} />
          <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
        </mesh>
      </group>
    </Body>
  );
}

function Basketball({ p }) {
  const R = 0.121 * m2u;
  return (
    <Body p={p} mass={0.62} restitution={0.82} friction={0.9} angularDamping={0.1}>
      <BallCollider args={[R]} />
      <mesh castShadow>
        <sphereGeometry args={[R, 20, 20]} />
        <meshStandardMaterial color="#d3722c" roughness={0.85} />
      </mesh>
    </Body>
  );
}

function Marble({ p }) {
  const R = 0.016 * m2u;
  const color = useMemo(() => new THREE.Color().setHSL(Math.random(), 0.7, 0.55), []);
  return (
    <Body p={p} mass={0.06} restitution={0.6} friction={0.15} ccd>
      <BallCollider args={[R]} />
      <mesh castShadow>
        <sphereGeometry args={[R, 12, 12]} />
        <meshPhysicalMaterial color={color} roughness={0.05} metalness={0.1} envMapIntensity={2} />
      </mesh>
    </Body>
  );
}

function CardboardBox({ p }) {
  const S = 0.34 * m2u;
  return (
    <Body p={p} mass={1.4} friction={0.9}>
      <CuboidCollider args={[S / 2, S / 2, S / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[S, S, S]} />
        <meshStandardMaterial color="#c1935a" roughness={0.95} />
      </mesh>
      <mesh position={[0, S / 2 + 0.005, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[S * 0.3, S]} />
        <meshStandardMaterial color="#a87c46" roughness={0.95} />
      </mesh>
    </Body>
  );
}

function Lamp({ p }) {
  return (
    <Body p={p} mass={1} angularDamping={0.2}>
      <CuboidCollider args={[0.09 * m2u, 0.015 * m2u, 0.09 * m2u]} position={[0, -0.2 * m2u, 0]} />
      <CuboidCollider args={[0.02 * m2u, 0.2 * m2u, 0.02 * m2u]} />
      <CuboidCollider args={[0.07 * m2u, 0.05 * m2u, 0.07 * m2u]} position={[0.06 * m2u, 0.2 * m2u, 0]} />
      <mesh position={[0, -0.2 * m2u, 0]} castShadow>
        <cylinderGeometry args={[0.09 * m2u, 0.1 * m2u, 0.03 * m2u, 12]} />
        <meshStandardMaterial color="#2f3239" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh castShadow rotation-z={-0.15}>
        <cylinderGeometry args={[0.012 * m2u, 0.012 * m2u, 0.42 * m2u, 8]} />
        <meshStandardMaterial color="#565b64" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.06 * m2u, 0.2 * m2u, 0]} rotation-z={1.1} castShadow>
        <coneGeometry args={[0.07 * m2u, 0.14 * m2u, 12, 1, true]} />
        <meshStandardMaterial color="#e0b03c" metalness={0.3} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0.09 * m2u, 0.16 * m2u, 0]} intensity={2.2} distance={8} color="#ffe0a3" />
    </Body>
  );
}

function Trash({ p }) {
  const R = 0.14 * m2u, H = 0.35 * m2u;
  return (
    <Body p={p} mass={0.9} friction={0.6}>
      <CylinderCollider args={[H / 2, R]} />
      <mesh castShadow>
        <cylinderGeometry args={[R, R * 0.8, H, 14, 1, true]} />
        <meshStandardMaterial color="#7d8794" metalness={0.75} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -H / 2 + 0.01, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[R * 0.8, 14]} />
        <meshStandardMaterial color="#5d6470" metalness={0.7} roughness={0.4} />
      </mesh>
    </Body>
  );
}
