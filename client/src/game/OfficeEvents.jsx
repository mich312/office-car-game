// Visuals for the every-minute office events: paper storms, server sparks…
// (Wind & earthquake forces are applied in LocalCar; lights-out in Lighting.)
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../store.js';
import { burst } from './particles.jsx';

const SHEETS = 80;

export default function OfficeEvents() {
  const event = useStore((s) => s.event);
  return (
    <group>
      {event?.id === 'paper_storm' && <PaperStorm />}
      {event?.id === 'server_overload' && <ServerSparks />}
      {event?.id === 'ac_wind' && <WindStreaks />}
      {event?.id === 'sprinklers' && <SprinklerRain />}
    </group>
  );
}

// Indoor rain: fast vertical streaks from the ceiling, everywhere at once.
function SprinklerRain() {
  const ref = useRef();
  const N = 160;
  const drops = useMemo(() => Array.from({ length: N }, () => ({
    x: (Math.random() * 30 - 15) * M,
    z: (Math.random() * 18 - 9) * M,
    y: Math.random() * 12,
    speed: 16 + Math.random() * 10,
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    drops.forEach((d, i) => {
      d.y -= d.speed * dt;
      if (d.y < 0.1) {
        d.y = 11 + Math.random() * 2;
        d.x = (Math.random() * 30 - 15) * M;
        d.z = (Math.random() * 18 - 9) * M;
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, N]} frustumCulled={false}>
      <boxGeometry args={[0.015, 0.7, 0.015]} />
      <meshBasicMaterial color="#9fd0ff" transparent opacity={0.4} />
    </instancedMesh>
  );
}

function PaperStorm() {
  const ref = useRef();
  const sheets = useMemo(() => Array.from({ length: SHEETS }, () => ({
    x: (Math.random() * 28 - 14) * M,
    z: (Math.random() * 16 - 8) * M,
    y: 5 + Math.random() * 12,
    vx: (Math.random() - 0.5) * 8,
    vz: (Math.random() - 0.5) * 8,
    phase: Math.random() * 10,
    spin: 1 + Math.random() * 3,
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    sheets.forEach((s, i) => {
      s.y -= (2 + Math.sin(t + s.phase)) * dt;
      s.x += (s.vx + Math.sin(t * 2 + s.phase) * 4) * dt;
      s.z += s.vz * dt;
      if (s.y < 0.3) { s.y = 10 + Math.random() * 6; s.x = (Math.random() * 28 - 14) * M; s.z = (Math.random() * 16 - 8) * M; }
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(t * s.spin + s.phase, s.phase, Math.sin(t * 2 + s.phase));
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, SHEETS]} frustumCulled={false}>
      <planeGeometry args={[1.16, 1.65]} />
      <meshStandardMaterial color="#f7f5ef" side={THREE.DoubleSide} roughness={0.9} />
    </instancedMesh>
  );
}

function ServerSparks() {
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.22) {
      acc.current = 0;
      const x = (10.5 + Math.random() * 3) * M;
      const z = (Math.random() > 0.5 ? -0.6 : 1.6) * M;
      burst([x, 2.2 * M * Math.random() + 2, z], { count: 8, color: ['#ffe27a', '#ff9d3c', '#fff'], speed: 7, size: 0.06, ttl: 0.6 });
    }
  });
  return (
    <pointLight position={[12 * M, 6, 0.5 * M]} intensity={10} distance={30} color="#ff7733" />
  );
}

function WindStreaks() {
  const ref = useRef();
  const N = 60;
  const streaks = useMemo(() => Array.from({ length: N }, () => ({
    x: (Math.random() * 30 - 15) * M,
    z: (Math.random() * 18 - 9) * M,
    y: 0.5 + Math.random() * 8,
    speed: 30 + Math.random() * 30,
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    streaks.forEach((s, i) => {
      s.x += s.speed * dt;
      if (s.x > 15 * M) s.x = -15 * M;
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.z = Math.PI / 2;
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, N]} frustumCulled={false}>
      <boxGeometry args={[0.02, 1.8, 0.02]} />
      <meshBasicMaterial color="#bcd8ff" transparent opacity={0.25} />
    </instancedMesh>
  );
}
