// One pooled particle system for every burst and puff in the game, drawn as
// three instanced draws however much is alive:
//  - smoke: soft camera-facing sprites — tyre smoke, exhaust, wind, dust
//  - sparks: additive streaks stretched along their own velocity
//  - debris: small lit boxes — glass, soil, confetti, paper, beans
// Imperative API so physics callbacks can fire bursts without React churn.
//
// Smoke used to be the debris boxes too: opaque, unlit white cubes up to
// 0.66 u across. From the old far chase camera they read as chunky pixels;
// from the close one they filled the lower third of the screen. Now a puff is
// a noisy soft disc that grows, rises, drags to a stop and fades, takes the
// room's light (grey-blue at night, not neon) and fades out before the lens
// can end up inside one.
import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { lightingFor } from './daylight.js';
import { currentMap } from './activeMap.js';

const GRAV = 30;
const _c = new THREE.Color();

// ------------------------------------------------------------- pools
function makePool(n, make) {
  const items = [];
  for (let i = 0; i < n; i++) items.push(make());
  return { items, cursor: 0, next() { const p = this.items[this.cursor]; this.cursor = (this.cursor + 1) % n; return p; } };
}
const SMOKE_MAX = 640;
const SPARK_MAX = 320;
const DEBRIS_MAX = 480;
const smokePool = makePool(SMOKE_MAX, () => ({
  life: 0, ttl: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size0: 0.1, size1: 0.4, alpha: 0.4,
  rot: 0, spin: 0, r: 1, g: 1, b: 1, glow: 0, floor: -1e9, rise: 0.6, drag: 0.12, seed: 0,
}));
const sparkPool = makePool(SPARK_MAX, () => ({ life: 0, ttl: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.05, r: 1, g: 1, b: 1, gravity: 1 }));
const debrisPool = makePool(DEBRIS_MAX, () => ({ life: 0, ttl: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, color: new THREE.Color(), gravity: 1, spin: 0 }));

// ------------------------------------------------------------- API
// A burst of bits flying out of `pos`. kind 'spark' draws glowing streaks
// (metal on metal, electrics, fire); anything else is lit debris.
export function burst(pos, { count = 12, color = '#ffffff', speed = 8, ttl = 0.9, size = 0.12, gravity = 1, up = 4, kind = 'debris' } = {}) {
  const colors = Array.isArray(color) ? color : [color];
  const spark = kind === 'spark';
  for (let i = 0; i < count; i++) {
    const p = spark ? sparkPool.next() : debrisPool.next();
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
    _c.set(colors[(Math.random() * colors.length) | 0]);
    if (spark) { p.r = _c.r; p.g = _c.g; p.b = _c.b; } else { p.color.copy(_c); p.spin = (Math.random() - 0.5) * 10; }
  }
}

// One soft puff. opts:
//   size: start diameter (grows to size·grow)   ttl: seconds
//   alpha: peak opacity                          glow: 1 = self-lit (exhaust, fire)
//   floor: world y the puff may not sink below (its bottom edge stays above)
//   rise: buoyancy (u/s²)                        drag: fraction of speed kept per second
export function smoke(pos, vel, { size = 0.14, grow = 4, ttl = 0.9, color = '#e6e4df', alpha = 0.35, glow = 0, floor = -1e9, rise = 0.7, drag = 0.1, jitter = 0.6 } = {}) {
  const p = smokePool.next();
  p.life = ttl * (0.85 + Math.random() * 0.3); p.ttl = p.life;
  p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
  p.vx = vel[0] + (Math.random() - 0.5) * jitter;
  p.vy = vel[1] + Math.random() * jitter * 0.5;
  p.vz = vel[2] + (Math.random() - 0.5) * jitter;
  const s = size * (0.8 + Math.random() * 0.4);
  p.size0 = s; p.size1 = s * grow;
  p.alpha = alpha;
  p.rot = Math.random() * Math.PI * 2;
  p.spin = (Math.random() - 0.5) * 1.6;
  _c.set(color); p.r = _c.r; p.g = _c.g; p.b = _c.b;
  p.glow = glow;
  p.floor = floor;
  p.rise = rise;
  p.drag = drag;
  p.seed = Math.random() * 97;
}

// The old continuous-emitter signature, kept for anything written against
// it: a grey puff of `size`, rising. Saturated colours were always exhaust
// or wind, and stay self-lit.
const _hsl = { h: 0, s: 0, l: 0 };
export function puff(pos, vel, size = 0.35, color = '#cfcfcf', ttl = 0.7) {
  _c.set(color).getHSL(_hsl);
  smoke(pos, vel, { size: size * 0.45, grow: 3.4, ttl: ttl * 1.3, color, alpha: 0.3, glow: _hsl.s > 0.3 ? 1 : 0, jitter: 2 });
}

// ------------------------------------------------------------- shaders
const SMOKE_VERT = /* glsl */`
  attribute vec4 aPos;   // xyz, diameter
  attribute vec4 aCol;   // rgb (linear), alpha
  attribute vec3 aMisc;  // rotation, glow, noise seed
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vGlow;
  varying float vSeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
    float s = aPos.w;
    float c = cos(aMisc.x), si = sin(aMisc.x);
    mv.xy += mat2(c, si, -si, c) * position.xy * s;
    // Near the lens a puff stops being smoke and becomes a grey screen: fade
    // it out while its near edge is inside ~1 u of the camera, and fade any
    // puff that would cover more than about a third of the view at its depth.
    float depth = -mv.z;
    float nearFade = smoothstep(0.2, 1.0, depth - s * 0.5);
    float cover = 1.0 - smoothstep(0.45, 0.9, s / max(depth, 0.05));
    vCol = vec4(aCol.rgb, aCol.a * nearFade * cover);
    vGlow = aMisc.y;
    vSeed = aMisc.z;
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`;
const SMOKE_FRAG = /* glsl */`
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vGlow;
  varying float vSeed;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    // billowy: a soft disc broken up by two octaves of value noise
    vec2 q = vUv + vSeed;
    float cloud = n(q * 3.5) * 0.62 + n(q * 8.0) * 0.38;
    // a broad shoulder, not a bright pip: most of the quad is smoke, so
    // neighbouring puffs overlap into one trail
    float a = 1.0 - smoothstep(0.0, 1.0, r + (cloud - 0.5) * 0.55);
    a = pow(a, 1.3) * vCol.a;
    if (a < 0.003) discard;
    // lit from above by the room: a touch darker underneath, dim at night;
    // exhaust and fire light themselves
    vec3 lit = vCol.rgb * uLight * (0.78 + 0.3 * cloud) * mix(0.82, 1.06, vUv.y);
    vec3 col = mix(lit, vCol.rgb * 1.5, vGlow);
    gl_FragColor = vec4(min(col, vec3(4.0)), min(a, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// A spark is a quad from its head back along its velocity: a streak whose
// length reads its speed, always facing the camera.
const SPARK_VERT = /* glsl */`
  attribute vec4 aPos;  // head xyz, width
  attribute vec4 aVel;  // velocity xyz, brightness 0…1
  attribute vec3 aCol;
  varying vec3 vCol;
  varying float vA;
  varying vec2 vUv;
  void main() {
    vec4 head = modelViewMatrix * vec4(aPos.xyz, 1.0);
    vec4 tail = modelViewMatrix * vec4(aPos.xyz - aVel.xyz * 0.035, 1.0);
    vec2 axis = tail.xy - head.xy;
    float len = length(axis);
    vec2 dir = len > 1e-4 ? axis / len : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float w = aPos.w;
    // never shorter than it is wide: a spark flying at the lens is a dot
    vec4 p = mix(head, head + vec4(dir * max(len, w), tail.z - head.z, 0.0), position.y + 0.5);
    p.xy += perp * position.x * w;
    gl_Position = projectionMatrix * p;
    vCol = aCol;
    vA = aVel.w;
    vUv = position.xy + 0.5;
  }
`;
const SPARK_FRAG = /* glsl */`
  varying vec3 vCol;
  varying float vA;
  varying vec2 vUv;
  void main() {
    // hot at the head, soft across: 1 at the core, 0 at the edges
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float along = 1.0 - vUv.y;
    float a = across * across * (0.35 + 0.65 * along) * vA;
    if (a < 0.004) discard;
    // bounded on purpose: additive + half-float + mip bloom turns anything
    // unbounded into black frames (the dust sparkles, dd380e6)
    gl_FragColor = vec4(min(vCol * 2.4, vec3(4.0)), clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// one quad, instanced; attributes are packed per instance and only the live
// ones are written and uploaded
function instanced(max, layout) {
  const g = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const attrs = {};
  for (const [name, size] of Object.entries(layout)) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
    attrs[name] = a;
  }
  g.instanceCount = 0;
  return { geo: g, attrs };
}
const upload = (attr, n) => {
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, n * attr.itemSize);
  attr.needsUpdate = true;
};

// The room's light on a puff of smoke: how bright the hour's fill is, tinted
// a little by its sky. Recomputed only when the hour or the event changes.
const LIGHT = { key: '', level: new THREE.Color(1, 1, 1) };
function roomLight(target) {
  const st = useStore.getState();
  const lightsOut = st.event?.id === 'lights_out';
  const map = currentMap();
  const key = `${st.timeOfDay}|${lightsOut}|${map?.id}`;
  if (key !== LIGHT.key) {
    LIGHT.key = key;
    const L = lightingFor(st.timeOfDay, lightsOut, map);
    // floors take the key and the practicals too, so the fill alone reads
    // too dark: smoke that isn't a touch brighter than the floor vanishes
    const fill = (L.amb?.intensity ?? 0.3) + (L.hemi?.intensity ?? 0.5);
    const k = Math.max(0.32, Math.min(1.15, 0.55 + fill * 0.6));
    LIGHT.level.set(L.hemi?.sky || '#ffffff').lerp(_c.set('#ffffff'), 0.7).multiplyScalar(k);
  }
  return target.copy(LIGHT.level);
}

export default function Particles() {
  const S = useMemo(() => {
    const smokeI = instanced(SMOKE_MAX, { aPos: 4, aCol: 4, aMisc: 3 });
    const sparkI = instanced(SPARK_MAX, { aPos: 4, aVel: 4, aCol: 3 });
    const smokeMat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      uniforms: { uLight: { value: new THREE.Color(1, 1, 1) } },
      transparent: true, depthWrite: false,
    });
    const sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const smokeMesh = new THREE.Mesh(smokeI.geo, smokeMat);
    const sparkMesh = new THREE.Mesh(sparkI.geo, sparkMat);
    for (const m of [smokeMesh, sparkMesh]) { m.frustumCulled = false; m.visible = false; }
    smokeMesh.renderOrder = 2;
    sparkMesh.renderOrder = 3;
    // debris: lit boxes — they catch the sun and the strip lights like the
    // glass and soil they are
    const debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    const debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), debrisMat, DEBRIS_MAX);
    debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // the colour buffer must exist before the first compile, or the program
    // is built without USE_INSTANCING_COLOR and every box draws white
    debrisMesh.setColorAt(0, _c.set('#ffffff'));
    debrisMesh.frustumCulled = false;
    debrisMesh.count = 0;
    debrisMesh.visible = false;
    // warm: drawn (empty) for the first frames, so their programs compile
    // with the scene rather than on the first drift of the match
    return { smokeI, sparkI, smokeMesh, sparkMesh, debrisMesh, dummy: new THREE.Object3D(), warm: 3 };
  }, []);
  useEffect(() => () => {
    S.smokeI.geo.dispose(); S.sparkI.geo.dispose();
    S.smokeMesh.material.dispose(); S.sparkMesh.material.dispose();
    S.debrisMesh.geometry.dispose(); S.debrisMesh.material.dispose(); S.debrisMesh.dispose();
  }, [S]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    const warm = S.warm > 0;
    if (warm) S.warm--;
    roomLight(S.smokeMesh.material.uniforms.uLight.value);

    // ---- smoke
    {
      const { aPos, aCol, aMisc } = S.smokeI.attrs;
      const P = aPos.array, C = aCol.array, X = aMisc.array;
      let n = 0;
      for (const p of smokePool.items) {
        if (p.life <= 0) continue;
        p.life -= step;
        if (p.life <= 0) continue;
        const drag = Math.pow(p.drag, step);
        p.vx *= drag; p.vz *= drag;
        p.vy = p.vy * Math.pow(0.35, step) + p.rise * step;
        p.x += p.vx * step; p.y += p.vy * step; p.z += p.vz * step;
        p.rot += p.spin * step;
        const age = 1 - p.life / p.ttl;
        const grow = 1 - (1 - age) * (1 - age); // fast at first, then drifting
        const size = p.size0 + (p.size1 - p.size0) * grow;
        // the sprite's bottom edge stays off the floor it was laid on, or the
        // floor cuts a hard line through it
        if (p.y < p.floor + size * 0.38) p.y = p.floor + size * 0.38;
        // holds its density while it billows out, thinning late: a puff
        // that faded as it grew only ever showed as a small young pip
        const a = p.alpha * Math.min(1, age * 9) * (1 - age * age);
        P[n * 4] = p.x; P[n * 4 + 1] = p.y; P[n * 4 + 2] = p.z; P[n * 4 + 3] = size;
        C[n * 4] = p.r; C[n * 4 + 1] = p.g; C[n * 4 + 2] = p.b; C[n * 4 + 3] = a;
        X[n * 3] = p.rot; X[n * 3 + 1] = p.glow; X[n * 3 + 2] = p.seed;
        n++;
      }
      S.smokeI.geo.instanceCount = n;
      S.smokeMesh.visible = n > 0 || warm;
      if (n) { upload(aPos, n); upload(aCol, n); upload(aMisc, n); }
    }

    // ---- sparks
    {
      const { aPos, aVel, aCol } = S.sparkI.attrs;
      const P = aPos.array, V = aVel.array, C = aCol.array;
      let n = 0;
      for (const p of sparkPool.items) {
        if (p.life <= 0) continue;
        p.life -= step;
        if (p.life <= 0) continue;
        p.vy -= GRAV * p.gravity * step;
        p.x += p.vx * step; p.y += p.vy * step; p.z += p.vz * step;
        if (p.y < 0.03 && p.gravity > 0) { p.y = 0.03; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
        const k = p.life / p.ttl;
        P[n * 4] = p.x; P[n * 4 + 1] = p.y; P[n * 4 + 2] = p.z; P[n * 4 + 3] = p.size * (0.35 + 0.65 * k);
        V[n * 4] = p.vx; V[n * 4 + 1] = p.vy; V[n * 4 + 2] = p.vz; V[n * 4 + 3] = Math.min(1, k * 1.6);
        C[n * 3] = p.r; C[n * 3 + 1] = p.g; C[n * 3 + 2] = p.b;
        n++;
      }
      S.sparkI.geo.instanceCount = n;
      S.sparkMesh.visible = n > 0 || warm;
      if (n) { upload(aPos, n); upload(aVel, n); upload(aCol, n); }
    }

    // ---- debris
    {
      const mesh = S.debrisMesh, dummy = S.dummy;
      let n = 0;
      for (const p of debrisPool.items) {
        if (p.life <= 0) continue;
        p.life -= step;
        if (p.life <= 0) continue;
        p.vy -= GRAV * p.gravity * step;
        p.x += p.vx * step; p.y += p.vy * step; p.z += p.vz * step;
        if (p.y < 0.03 && p.gravity > 0) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.8; p.vz *= 0.8; }
        const k = p.life / p.ttl;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.spin * p.life, p.spin * 0.7 * p.life, 0);
        dummy.scale.setScalar(p.size * (p.gravity < 0 ? 1.6 - k * 0.9 : 0.3 + k));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, p.color);
        n++;
      }
      mesh.count = n;
      mesh.visible = n > 0 || warm;
      if (n) { upload(mesh.instanceMatrix, n); upload(mesh.instanceColor, n); }
    }
  });

  return (
    <>
      <primitive object={S.debrisMesh} />
      <primitive object={S.smokeMesh} />
      <primitive object={S.sparkMesh} />
    </>
  );
}
