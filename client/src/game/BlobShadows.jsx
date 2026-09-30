// A soft dark contact patch under every car, in one instanced draw.
//
// The sun's shadow does most of the grounding when it's there, but it isn't
// always: a car in the shade of a desk, at night, or on ?lowfx (no shadow
// maps at all) floated on the floor, and nothing told you how high a jump
// had carried it. The patch sits where a ray straight down from the car
// meets the ground — tilted onto ramps, on the desk top when you're on the
// desk — and shrinks and fades as the car climbs, so height reads at a
// glance. On ?lowfx it is the only height cue there is.
import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';

const LOWFX = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lowfx');
const MAX = 16;
const RANGE = 45; // beyond this from the lens a patch is a few pixels
const PEAK = LOWFX ? 0.62 : 0.42; // with real shadows it only has to darken the contact
const FADE_H = 2.4; // gone by this height above the ground (u)
const RIDE = 0.28; // car centre over the ground at rest
// ground: fixed and loose colliders that aren't sensors — not the other cars
// (QueryFilterFlags EXCLUDE_KINEMATIC | EXCLUDE_SENSORS)
const GROUND = 2 | 8;

// id → { obj: the car's drawn group, body?: ref to a rigid body the ray must
// skip (the local car's own) }. LocalCar and RemoteCars register here.
export const blobCars = new Map();

const VERT = /* glsl */`
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */`
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    // a rounded rectangle (signed distance) with a wide feather: dense under
    // the chassis, fading out a little past the tyres
    vec2 q = abs(vUv) - vec2(0.35, 0.5);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float a = 1.0 - smoothstep(-0.3, 0.5, sd);
    a = a * a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.015, 0.014, 0.02, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3();
const _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _qn = new THREE.Quaternion(), _qy = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3();

export default function BlobShadows() {
  const { world, rapier } = useRapier();
  const S = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', alpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return { mesh, alpha, ray: null, warm: 3 }; // drawn empty at first: compiles with the scene
  }, []);
  useEffect(() => () => { S.mesh.geometry.dispose(); S.mesh.material.dispose(); S.mesh.dispose(); }, [S]);

  useFrame(({ camera }) => {
    const ray = S.ray || (S.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
    let n = 0;
    for (const car of blobCars.values()) {
      if (n >= MAX) break;
      const obj = car.obj;
      if (!obj || !obj.visible || !obj.parent) continue;
      obj.getWorldPosition(_p);
      if (_p.y < -5 || _p.distanceTo(camera.position) > RANGE) continue; // ghosts, far away
      ray.origin.x = _p.x; ray.origin.y = _p.y + 0.1; ray.origin.z = _p.z;
      const hit = world.castRayAndGetNormal(ray, FADE_H + RIDE + 0.2, true, GROUND, undefined, undefined, car.body?.current || undefined);
      if (!hit) continue;
      const toi = hit.timeOfImpact ?? hit.toi;
      const h = Math.max(0, toi - 0.1 - RIDE);
      const fade = 1 - Math.min(1, h / FADE_H);
      if (fade <= 0.01) continue;
      // lie on the ground, turned with the car
      obj.getWorldQuaternion(_q);
      _f.set(0, 0, 1).applyQuaternion(_q);
      _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      if (_n.y < 0.5) _n.copy(_up); // a wall under the ray: lie flat
      _qy.setFromAxisAngle(_up, Math.atan2(_f.x, _f.z));
      _qn.setFromUnitVectors(_up, _n).multiply(_qy);
      const scale = obj.scale.x * (1 - 0.3 * (1 - fade)); // the Shrink Ray shrinks it too
      _s.set(1.2 * scale, 1, 1.5 * scale);
      _p.y = _p.y + 0.1 - toi + 0.012;
      S.mesh.setMatrixAt(n, _m.compose(_p, _qn, _s));
      S.alpha.array[n] = PEAK * fade * fade;
      n++;
    }
    S.mesh.count = n;
    S.mesh.visible = n > 0 || S.warm > 0;
    if (S.warm > 0) S.warm--;
    if (n) {
      S.mesh.instanceMatrix.needsUpdate = true;
      S.alpha.needsUpdate = true;
    }
  });

  return <primitive object={S.mesh} />;
}
