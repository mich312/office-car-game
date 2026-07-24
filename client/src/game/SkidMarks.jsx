// Tire marks: ring-buffered quad ribbons laid on the floor while the local
// car slips. Segment birth times live in a vertex attribute so fading is a
// single shader uniform — no per-frame buffer rewrites for old marks.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const MAX_QUADS = 800; // shared ring buffer across both rear wheels
const VERTS = MAX_QUADS * 6;
const FADE_S = 9;
const WIDTH = 0.09;
const Y = 0.025; // just above the floor; polygonOffset kills z-fighting

const positions = new Float32Array(VERTS * 3);
const births = new Float32Array(VERTS).fill(-1e9);
let cursor = 0; // quad index
let clockNow = 0;
const prev = [null, null]; // last contact point per rear wheel

// Called from LocalCar's physics step: wheel = 0 (rear-left) | 1 (rear-right),
// world-space contact x/z. Pass null to break the ribbon (airborne, no slip).
export function skid(wheel, x, z) {
  if (x === null) { prev[wheel] = null; return; }
  const p = prev[wheel];
  prev[wheel] = { x, z };
  if (!p) return;
  const dx = x - p.x, dz = z - p.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.04) { prev[wheel] = p; return; } // too short — wait for more travel
  if (len > 2) return; // teleport/respawn — don't smear a streak across the map
  // lateral half-width perpendicular to travel
  const px = (-dz / len) * WIDTH, pz = (dx / len) * WIDTH;
  const i = cursor * 6;
  cursor = (cursor + 1) % MAX_QUADS;
  const quad = [
    [p.x - px, p.z - pz], [p.x + px, p.z + pz], [x + px, z + pz],
    [p.x - px, p.z - pz], [x + px, z + pz], [x - px, z - pz],
  ];
  for (let v = 0; v < 6; v++) {
    positions[(i + v) * 3] = quad[v][0];
    positions[(i + v) * 3 + 1] = Y;
    positions[(i + v) * 3 + 2] = quad[v][1];
    births[i + v] = clockNow;
  }
  skidDirty = true;
}

let skidDirty = false;

export default function SkidMarks() {
  const matRef = useRef();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('birth', new THREE.BufferAttribute(births, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 500);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float birth;
      uniform float uTime;
      varying float vA;
      void main() {
        vA = clamp(1.0 - (uTime - birth) / ${FADE_S.toFixed(1)}, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        if (vA <= 0.001) discard;
        gl_FragColor = vec4(vec3(0.05, 0.05, 0.06), vA * 0.42);
      }
    `,
  }), []);
  matRef.current = mat;
  useFrame((_, dt) => {
    clockNow += dt;
    mat.uniforms.uTime.value = clockNow;
    if (skidDirty) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.birth.needsUpdate = true;
      skidDirty = false;
    }
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}
