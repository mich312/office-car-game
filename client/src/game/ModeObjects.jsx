// Server-owned entities rendered on the client: checkpoints, coffee beans,
// the battery, the soccer ball & goals, powerup pads, puddles, rockets and
// the dreaded cleaning robot.
import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import TextSprite from './TextSprite.jsx';
import {
  CHECKPOINTS, POWERUP_PADS, COFFEE_MACHINE, SOCCER, POWERUP_EFFECT, M,
} from '@rc/shared';
import { useStore } from '../store.js';
import { net, on } from '../net.js';
import { burst } from './particles.jsx';

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
    </group>
  );
}

// ------------------------------------------------------------- race
function RaceCheckpoints() {
  const myId = useStore((s) => s.myId);
  const prog = useStore((s) => s.raceProgress[myId]);
  const next = (prog?.[1] ?? 0) % CHECKPOINTS.length;
  const cp = CHECKPOINTS[next];
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
  const MAXB = 40;
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
  const rb = useRef();
  useEffect(() => on('fx', (fx) => {
    if (fx.type === 'goal') {
      const g = SOCCER.goals[1 - fx.team];
      burst([g?.x ?? 0, 2, g?.z ?? 0], { count: 60, color: ['#ffd166', '#06d6a0', '#ef476f', '#118ab2'], speed: 14, size: 0.14, ttl: 1.6 });
    }
  }), []);
  useFrame((_, dt) => {
    const b = net.ball;
    if (!b || !rb.current) return;
    // lerp toward server ball with light extrapolation
    const cur = rb.current.translation();
    const k = Math.min(1, dt * 10);
    rb.current.setNextKinematicTranslation({
      x: cur.x + (b.p[0] + b.v[0] * 0.05 - cur.x) * k,
      y: Math.max(SOCCER.ballRadius * 0.9, cur.y + (b.p[1] - cur.y) * k),
      z: cur.z + (b.p[2] + b.v[2] * 0.05 - cur.z) * k,
    });
  });
  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={[SOCCER.ballSpawn.x, 2, SOCCER.ballSpawn.z]}>
      <BallCollider args={[SOCCER.ballRadius]} />
      <mesh castShadow>
        <sphereGeometry args={[SOCCER.ballRadius, 24, 20]} />
        <meshStandardMaterial color="#fff8ee" roughness={0.35} envMapIntensity={0.8} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[SOCCER.ballRadius * 0.99, 0.012, 6, 40]} />
        <meshBasicMaterial color="#e8b84a" />
      </mesh>
    </RigidBody>
  );
}

function Goals() {
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
function PowerupPads() {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    POWERUP_PADS.forEach((pad, i) => {
      const g = refs.current[i];
      if (!g) return;
      const ready = (net.padCooldowns.get(i) || 0) < Date.now();
      g.children[1].rotation.y = t * 1.4 + i;
      g.children[1].position.y = 0.9 + Math.sin(t * 2 + i) * 0.12;
      g.children[1].visible = ready;
      g.children[0].material.opacity = ready ? 0.5 : 0.08;
    });
  });
  return (
    <group>
      {POWERUP_PADS.map((pad, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} position={[pad.x, 0, pad.z]}>
          <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.9, 1.5, 24]} />
            <meshBasicMaterial color="#c77bff" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <group position={[0, 0.9, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.55, 0.55, 0.55]} />
              <meshStandardMaterial color="#7b2ff2" emissive="#a95bff" emissiveIntensity={0.9} roughness={0.2} />
            </mesh>
            <TextSprite text="?" size={0.5} color="white" />
          </group>
        </group>
      ))}
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

function Rockets() {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const MAXR = 6;
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rockets = net.rockets || [];
    for (let i = 0; i < MAXR; i++) {
      const r = rockets[i];
      if (r) {
        dummy.position.set(r.p[0], r.p[1] + 0.4, r.p[2]);
        dummy.scale.setScalar(1);
        burst([r.p[0], r.p[1] + 0.4, r.p[2]], { count: 1, color: '#ffb347', speed: 1, size: 0.07, ttl: 0.35, up: 1, gravity: -0.2 });
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
    <instancedMesh ref={ref} args={[null, null, MAXR]} frustumCulled={false}>
      <coneGeometry args={[0.14, 0.5, 8]} />
      <meshStandardMaterial color="#e8332a" emissive="#ff6b35" emissiveIntensity={1.4} />
    </instancedMesh>
  );
}

function Robot() {
  const group = useRef();
  useFrame(({ clock }) => {
    const r = net.robot;
    if (!group.current) return;
    group.current.visible = !!r;
    if (!r) return;
    const cur = group.current.position;
    cur.x += (r.x - cur.x) * 0.15;
    cur.z += (r.z - cur.z) * 0.15;
    cur.y = 0;
    group.current.rotation.y = clock.elapsedTime * 0.7;
  });
  return (
    <group ref={group} visible={false}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[1.7, 1.85, 0.7, 24]} />
        <meshStandardMaterial color="#33363e" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.12, 16]} />
        <meshStandardMaterial color="#22242a" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.86, 0]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshBasicMaterial color="#ff2222" toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.4, 0]} intensity={6} distance={9} color="#ff3322" />
    </group>
  );
}
