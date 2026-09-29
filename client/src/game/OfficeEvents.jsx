// Visuals for the every-minute office events: paper storms, server sparks…
// (Wind & earthquake forces are applied in LocalCar; lights-out in Lighting.)
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { currentMap } from './activeMap.js';
import { useStore } from '../store.js';
import { burst } from './particles.jsx';

const bounds = () => currentMap().MAP_BOUNDS;

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
    x: bounds().minX + Math.random() * (bounds().maxX - bounds().minX),
    z: bounds().minZ + Math.random() * (bounds().maxZ - bounds().minZ),
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
        d.x = bounds().minX + Math.random() * (bounds().maxX - bounds().minX);
        d.z = bounds().minZ + Math.random() * (bounds().maxZ - bounds().minZ);
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
    x: bounds().minX + Math.random() * (bounds().maxX - bounds().minX),
    z: bounds().minZ + Math.random() * (bounds().maxZ - bounds().minZ),
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
      // a sheet is airborne for many seconds and can drift tens of units —
      // recycle it when it leaves the building, not only when it lands,
      // or the storm visibly blows out through the glass walls
      const out = s.x < bounds().minX - 2 || s.x > bounds().maxX + 2
        || s.z < bounds().minZ - 2 || s.z > bounds().maxZ + 2;
      if (s.y < 0.3 || out) { s.y = 10 + Math.random() * 6; s.x = bounds().minX + Math.random() * (bounds().maxX - bounds().minX); s.z = bounds().minZ + Math.random() * (bounds().maxZ - bounds().minZ); }
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

// the server racks of every floor (the factory's racking holds pallets)
const SERVER_RACKS = new Set(['rack', 'cellar_rack', 'garage_serverrack']);

function ServerSparks() {
  const acc = useRef(0);
  // sparks fly off whichever server racks this map has
  const racks = useMemo(() => currentMap().FURNITURE.filter((f) => SERVER_RACKS.has(f.type)), []);
  const mid = useMemo(() => racks.reduce((a, r) => [a[0] + r.x / racks.length, a[1] + r.z / racks.length], [0, 0]), [racks]);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.22 && racks.length) {
      acc.current = 0;
      const r = racks[Math.floor(Math.random() * racks.length)];
      const x = r.x + (Math.random() - 0.5) * r.w;
      const z = r.z + (Math.random() > 0.5 ? 1 : -1) * r.d * 0.55;
      burst([x, 2.2 * M * Math.random() + 2, z], { count: 8, color: ['#ffe27a', '#ff9d3c', '#fff'], speed: 7, size: 0.06, ttl: 0.6 });
    }
  });
  // no racks, no glow (it used to hang at the world origin)
  return racks.length ? (
    <pointLight position={[mid[0], 6, mid[1]]} intensity={10} distance={30} color="#ff7733" />
  ) : null;
}

function WindStreaks() {
  const ref = useRef();
  const N = 60;
  const streaks = useMemo(() => Array.from({ length: N }, () => ({
    x: bounds().minX + Math.random() * (bounds().maxX - bounds().minX),
    z: bounds().minZ + Math.random() * (bounds().maxZ - bounds().minZ),
    y: 0.5 + Math.random() * 8,
    speed: 30 + Math.random() * 30,
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    streaks.forEach((s, i) => {
      s.x += s.speed * dt;
      if (s.x > bounds().maxX) s.x = bounds().minX;
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
