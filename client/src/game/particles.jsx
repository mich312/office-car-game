// One pooled particle system for every burst in the game: glass shards,
// soil, sparks, confetti, coffee beans, smoke puffs. Imperative API so
// physics callbacks can fire bursts without React churn.
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const MAX = 900;
const pool = [];
let cursor = 0;
for (let i = 0; i < MAX; i++) {
  pool.push({ life: 0, ttl: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, color: new THREE.Color(), gravity: 1, spin: 0 });
}

export function burst(pos, { count = 12, color = '#ffffff', speed = 8, ttl = 0.9, size = 0.12, gravity = 1, up = 4 } = {}) {
  const colors = Array.isArray(color) ? color : [color];
  for (let i = 0; i < count; i++) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * speed;
    p.life = ttl * (0.6 + Math.random() * 0.4);
    p.ttl = p.life;
    p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
    p.vx = Math.cos(a) * r;
    p.vz = Math.sin(a) * r;
    p.vy = Math.random() * up + up * 0.3;
    p.size = size * (0.5 + Math.random());
    p.gravity = gravity;
    p.spin = (Math.random() - 0.5) * 10;
    p.color.set(colors[(Math.random() * colors.length) | 0]);
  }
}

// Continuous emitters (tire smoke) call this per frame.
export function puff(pos, vel, size = 0.35, color = '#cfcfcf', ttl = 0.7) {
  const p = pool[cursor];
  cursor = (cursor + 1) % MAX;
  p.life = ttl; p.ttl = ttl;
  p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
  p.vx = vel[0] + (Math.random() - 0.5) * 2;
  p.vy = vel[1] + Math.random() * 1.5;
  p.vz = vel[2] + (Math.random() - 0.5) * 2;
  p.size = size * (0.7 + Math.random() * 0.6);
  p.gravity = -0.35; // smoke rises
  p.spin = (Math.random() - 0.5) * 4;
  p.color.set(color);
}

const GRAV = 30;

export default function Particles() {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (p.life <= 0) {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0.0001);
      } else {
        p.life -= step;
        p.vy -= GRAV * p.gravity * step;
        p.x += p.vx * step; p.y += p.vy * step; p.z += p.vz * step;
        if (p.y < 0.03 && p.gravity > 0) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.8; p.vz *= 0.8; }
        const k = Math.max(0, p.life / p.ttl);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.spin * p.life, p.spin * 0.7 * p.life, 0);
        dummy.scale.setScalar(p.size * (p.gravity < 0 ? (1.6 - k * 0.9) : (0.3 + k)));
        mesh.setColorAt(i, p.color);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, MAX]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
