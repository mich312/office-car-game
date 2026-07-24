// Cosmetic trails: a fading ribbon streamed behind the car in world space.
// Same ring-buffer trick as SkidMarks (birth times in a vertex attribute, one
// uniform to fade) but colored, additive, and one instance per equipped car.
// Rendered via portal into the scene root so the ribbon doesn't inherit the
// car's transform.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';

const MAX_QUADS = 240;
const VERTS = MAX_QUADS * 6;
const FADE_S = 1.1;
const WIDTH = 0.14;
const MIN_STEP = 0.08; // world units of travel per ribbon segment

// Per-kind fragment color, given `age` (seconds) and `vBirth` (birth time).
const KIND_GLSL = {
  rainbow: 'vec3 col = 0.55 + 0.45 * cos(6.2832 * (vBirth * 0.45 + vec3(0.0, 0.33, 0.67)));',
  flame: 'vec3 col = mix(vec3(1.0, 0.85, 0.25), vec3(1.0, 0.2, 0.05), clamp(age * 1.6, 0.0, 1.0));',
};

export default function Trail({ kind = 'rainbow', anchorRef, speedRef }) {
  const scene = useThree((s) => s.scene);
  const S = useRef({ cursor: 0, prev: null, clock: 0 }).current;

  const { geo, mat, positions, births } = useMemo(() => {
    const positions = new Float32Array(VERTS * 3);
    const births = new Float32Array(VERTS).fill(-1e9);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('birth', new THREE.BufferAttribute(births, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 500);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float birth;
        varying float vBirth;
        void main() {
          vBirth = birth;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying float vBirth;
        void main() {
          float age = uTime - vBirth;
          float a = clamp(1.0 - age / ${FADE_S.toFixed(2)}, 0.0, 1.0);
          if (a <= 0.001) discard;
          ${KIND_GLSL[kind] || KIND_GLSL.rainbow}
          gl_FragColor = vec4(col, a * 0.75);
        }
      `,
    });
    return { geo, mat, positions, births };
  }, [kind]);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  const _p = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    S.clock += dt;
    mat.uniforms.uTime.value = S.clock;
    const anchor = anchorRef?.current;
    if (!anchor) return;
    anchor.getWorldPosition(_p);
    // no ribbon while parked (or hidden under the map as a ghost)
    const moving = speedRef ? Math.abs(speedRef.current ?? 0) > 5 : true;
    if (!moving || _p.y < -2) { S.prev = null; return; }
    const prev = S.prev;
    if (!prev) { S.prev = { x: _p.x, y: _p.y, z: _p.z }; return; }
    const dx = _p.x - prev.x, dz = _p.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len > 2.5) { S.prev = { x: _p.x, y: _p.y, z: _p.z }; return; } // teleport
    if (len < MIN_STEP) return;
    // lateral half-width perpendicular to travel, flat ribbon at anchor height
    const px = (-dz / len) * WIDTH, pz = (dx / len) * WIDTH;
    const i = S.cursor * 6;
    S.cursor = (S.cursor + 1) % MAX_QUADS;
    const quad = [
      [prev.x - px, prev.y, prev.z - pz], [prev.x + px, prev.y, prev.z + pz], [_p.x + px, _p.y, _p.z + pz],
      [prev.x - px, prev.y, prev.z - pz], [_p.x + px, _p.y, _p.z + pz], [_p.x - px, _p.y, _p.z - pz],
    ];
    for (let v = 0; v < 6; v++) {
      positions[(i + v) * 3] = quad[v][0];
      positions[(i + v) * 3 + 1] = quad[v][1];
      positions[(i + v) * 3 + 2] = quad[v][2];
      births[i + v] = S.clock;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.birth.needsUpdate = true;
    S.prev = { x: _p.x, y: _p.y, z: _p.z };
  });

  return createPortal(<mesh geometry={geo} material={mat} frustumCulled={false} />, scene);
}
