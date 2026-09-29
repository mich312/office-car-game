// The view from the 48th floor: what sells the tower.
//
// Two hundred metres of air, then a city laid out like a map: a street
// grid, a river, other towers' roofs below you and a few peers level with
// you, their red beacons blinking; clouds drifting at eye level; haze that
// thickens with distance and turns the far city into a silhouette. At night
// the grid lights up and the headlights move.
//
// It is all far away, so it is drawn like a skybox: the whole city rides with
// the camera (no parallax — at these distances there is almost none to see),
// scaled down about the eye by CITY so it fits inside the camera's far plane.
// Scaling about the eye preserves every angle, so the horizon, the street
// grid and the tower tops sit exactly where the real ones would. Five draws:
// sky, ground (streets, river, traffic — all procedural, in one shader),
// towers (instanced, windows procedural), beacons, clouds.
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../../../store.js';
import { hash, canvas } from './kit.js';
import { audio } from '../../../audio.js';
import { lightingFor } from '../../daylight.js';

// world units per real metre out there: the city at 1/14 scale
export const CITY = M / 14;
const DROP = 200; // metres down to the street
const GROUND_Y = -DROP * CITY;

// The palette per hour (the lighting table has the light; this is the air).
const SKY = {
  morning: { zenith: '#6d8cc4', horizon: '#dfe3e6', ground: '#b9c1c9', haze: '#c9d2da', sun: '#fff1dc', glow: 0.3, lit: 0.05, sunSize: 1, city: 0.9 },
  afternoon: { zenith: '#3f71c0', horizon: '#c9dcee', ground: '#b7c3cf', haze: '#c6d3e0', sun: '#fffaf0', glow: 0.2, lit: 0.02, sunSize: 0.6, city: 1 },
  golden: { zenith: '#39497e', horizon: '#f5a667', ground: '#b98a74', haze: '#d9a07c', sun: '#ffd09a', glow: 1, lit: 0.25, sunSize: 1.6, city: 0.72 },
  night: { zenith: '#03060f', horizon: '#1d2236', ground: '#140f12', haze: '#221a20', sun: '#6d7fb0', glow: 0.05, lit: 1, sunSize: 0.3, city: 0.12 },
  out: { zenith: '#020308', horizon: '#0b0d16', ground: '#07070a', haze: '#0b0b10', sun: '#000000', glow: 0, lit: 0.6, sunSize: 0, city: 0.08 },
};

const colors = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v]));
const SKY_C = Object.fromEntries(Object.entries(SKY).map(([k, v]) => [k, colors(v)]));

// shared uniforms: every shader out there reads the same air
function makeUniforms() {
  const c = SKY_C.golden;
  return {
    uZenith: { value: c.zenith.clone() }, uHorizon: { value: c.horizon.clone() }, uGround: { value: c.ground.clone() },
    uHaze: { value: c.haze.clone() }, uSun: { value: c.sun.clone() }, uSunDir: { value: new THREE.Vector3(-1, 0.15, 0.2).normalize() },
    uGlow: { value: c.glow }, uLit: { value: c.lit }, uSunSize: { value: c.sunSize }, uCity: { value: c.city },
    uTime: { value: 0 }, uScale: { value: CITY }, uGroundY: { value: GROUND_Y },
  };
}

const TAIL = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ------------------------------------------------------------------ sky
const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // on the far plane, always behind everything
  }
`;
const skyFrag = /* glsl */`
  uniform vec3 uZenith, uHorizon, uGround, uHaze, uSun, uSunDir;
  uniform float uGlow, uSunSize;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col = y > 0.0 ? mix(uHorizon, uZenith, pow(clamp(y * 1.4, 0.0, 1.0), 0.55)) : mix(uHaze, uGround, clamp(-y * 5.0, 0.0, 1.0));
    // a bright band of haze sitting on the horizon
    col = mix(col, uHaze, exp(-abs(y - 0.01) * 28.0) * 0.55);
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(s, 900.0 / max(uSunSize, 0.05)) * 6.0 * step(0.0, y + 0.02) + pow(s, 7.0) * 0.4 * uGlow);
    gl_FragColor = vec4(col, 1.0);
    ${TAIL}
  }
`;

// --------------------------------------------------------------- ground
// Blocks of 110 m with 16 m streets and every fourth an avenue; parks and
// a river; at night sodium streets, lit windows seen from above and two
// lanes of traffic on every street. Detail fades with distance so the grid
// never shimmers into moiré at the horizon.
const groundVert = /* glsl */`
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const groundFrag = /* glsl */`
  uniform vec3 uHorizon, uZenith, uHaze, uSun, uSunDir, uGround;
  uniform float uLit, uTime, uScale, uCity, uGlow;
  uniform vec3 uCam;
  varying vec3 vW;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  void main() {
    // world position in real metres, anchored to the city (not the camera)
    vec2 m = (vW.xz - uCam.xz) / uScale + uCam.xz / ${M.toFixed(4)};
    float dist = length(vW.xz - uCam.xz) / uScale;
    float BL = 110.0, ST = 16.0;
    vec2 cell = floor(m / BL), f = mod(m, BL);
    vec2 av = step(mod(cell, 4.0), vec2(0.5));
    vec2 sw = ST * (1.0 + av * 0.8);
    vec2 edge = min(f, BL - f);
    float aa = max(fwidth(m.x), fwidth(m.y)) * 1.5;
    float streetX = 1.0 - smoothstep(sw.x * 0.5 - aa, sw.x * 0.5 + aa, edge.x);
    float streetZ = 1.0 - smoothstep(sw.y * 0.5 - aa, sw.y * 0.5 + aa, edge.y);
    float street = max(streetX, streetZ);
    float r = h21(cell);
    // lots: a mosaic of roofs in greys and warm stone
    vec2 lot = floor(f / 27.0);
    float lr = h21(cell * 7.0 + lot);
    vec3 roof = mix(vec3(0.42, 0.41, 0.4), vec3(0.62, 0.57, 0.5), lr) * (0.75 + 0.25 * h21(lot + cell));
    float park = step(0.9, r);
    roof = mix(roof, vec3(0.2, 0.33, 0.18) * (0.8 + 0.3 * lr), park);
    // the river winds east–west south of the tower
    float rz = 520.0 + 140.0 * sin(m.x / 640.0) + 60.0 * sin(m.x / 211.0);
    float river = 1.0 - smoothstep(80.0 - aa * 2.0, 80.0 + aa * 2.0, abs(m.y + rz));
    float bank = (1.0 - smoothstep(94.0 - aa, 94.0 + aa, abs(m.y + rz))) - river;
    vec3 day = mix(roof, vec3(0.2, 0.2, 0.22), street);
    day = mix(day, vec3(0.55, 0.53, 0.48), bank);
    vec3 water = mix(uHorizon, uZenith, 0.35) * 0.85;
    day = mix(day, water, river);
    // lit by the sun, dimmed by the hour
    day *= (0.55 + 0.45 * max(uSunDir.y * 2.0, 0.0)) * uCity;
    // night: sodium streets, scattered windows, traffic
    vec3 night = vec3(0.02, 0.018, 0.02) + street * vec3(1.0, 0.55, 0.2) * (0.25 + 0.2 * av.x + 0.2 * av.y);
    night += (1.0 - street) * (1.0 - river) * (1.0 - park) * step(0.93, h21(floor(m / 7.0))) * vec3(1.0, 0.8, 0.55) * 0.6;
    // traffic: dots running both ways down every street (white one way, red the other)
    float lane = streetX > 0.5 ? (f.x < BL * 0.5 ? f.x : f.x - BL) : (f.y < BL * 0.5 ? f.y : f.y - BL);
    float along = streetX > 0.5 ? m.y : m.x;
    float dir = sign(lane + 0.001);
    float car = step(0.86, fract((along + dir * uTime * 14.0) / 38.0 + h21(cell + dir) )) * street;
    car *= 1.0 - smoothstep(1500.0, 2600.0, dist);
    vec3 carCol = dir > 0.0 ? vec3(1.6, 1.5, 1.3) : vec3(1.4, 0.15, 0.1);
    night += car * carCol * (0.8 + av.x + av.y);
    night *= (1.0 - river * 0.85);
    night += river * mix(uHorizon, vec3(0.4, 0.3, 0.25), 0.4) * 0.3;
    vec3 col = mix(day, night + day * 0.05, uLit);
    // aerial perspective: the street is 200 m of air away before it starts
    float fog = 1.0 - exp(-(dist + 200.0) / 3000.0);
    col = mix(col, uHaze, clamp(fog * 1.05, 0.0, 1.0));
    col = mix(col, uGround, smoothstep(2000.0, 2550.0, dist));
    gl_FragColor = vec4(col, 1.0);
    ${TAIL}
  }
`;

// --------------------------------------------------------------- towers
const towerVert = /* glsl */`
  uniform float uScale;
  varying vec3 vN, vW, vL, vTint;
  varying float vSeed;
  void main() {
    vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vL = (position + vec3(0.5, 0.0, 0.5)) * sc / uScale; // metres, from the base corner
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(0.6);
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const towerFrag = /* glsl */`
  uniform vec3 uHorizon, uZenith, uHaze, uSun, uSunDir, uGround;
  uniform float uLit, uScale, uCity, uGroundY;
  varying vec3 vN, vW, vL, vTint;
  varying float vSeed;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  void main() {
    vec3 n = normalize(vN);
    float dist = length(vW - cameraPosition) / uScale;
    float sunL = max(dot(n, normalize(uSunDir)), 0.0);
    vec3 col;
    if (n.y > 0.5) {
      // a roof: plant, a darker parapet line
      col = vTint * 0.55 * (0.6 + 0.4 * uCity);
      col *= 0.8 + 0.2 * h21(floor(vL.xz / 6.0));
    } else {
      float u = abs(n.x) > 0.5 ? vL.z : vL.x;
      float v = vL.y;
      float fh = 3.6 + vSeed * 0.8, fw = 2.6 + vSeed * 1.8;
      vec2 cell = vec2(floor(u / fw), floor(v / fh));
      vec2 q = vec2(fract(u / fw), fract(v / fh));
      float aa = fwidth(u / fw) * 1.2;
      float win = smoothstep(0.1 - aa, 0.1 + aa, q.x) * smoothstep(0.9 + aa, 0.9 - aa, q.x) * smoothstep(0.22, 0.3, q.y) * smoothstep(0.92, 0.84, q.y);
      win = mix(win, 0.55, clamp(aa * 3.0, 0.0, 1.0)); // far away: an average, not moiré
      vec3 wall = vTint * (0.35 + 0.65 * sunL * uCity + 0.25 * uCity);
      // day: glass reflects the sky, brighter where it faces the sun
      vec3 glass = mix(uHorizon, uZenith, 0.25 + 0.3 * h21(cell + vSeed)) * (0.55 + 0.35 * sunL) + uSun * pow(sunL, 12.0) * 0.8 * uCity;
      vec3 day = mix(wall, glass, win * (0.55 + vSeed * 0.4));
      // night: a scatter of lit offices
      float on = step(1.0 - (0.18 + 0.3 * vSeed), h21(cell * 1.31 + vSeed * 17.0));
      vec3 lamp = mix(vec3(1.0, 0.78, 0.5), vec3(0.75, 0.85, 1.0), step(0.7, h21(cell + 3.0))) * 1.3;
      vec3 night = vTint * 0.05 + win * on * lamp;
      col = mix(day, night, uLit);
    }
    // lower storeys sink into the haze first
    float fog = 1.0 - exp(-(dist + 100.0) / 3600.0);
    float low = 1.0 - smoothstep(uGroundY, uGroundY + 90.0 * uScale, vW.y);
    col = mix(col, uHaze, clamp(fog + low * 0.3, 0.0, 0.92));
    gl_FragColor = vec4(col, 1.0);
    ${TAIL}
  }
`;

// deterministic skyline: a ring of towers round us, a few peers our height
function cityLayout() {
  const out = [];
  let s = 1;
  const r = () => hash(s++);
  for (let i = 0; i < 340; i++) {
    const a = r() * Math.PI * 2;
    const d = 430 + Math.pow(r(), 0.7) * 2150;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    // keep the river clear
    const rz = 520 + 140 * Math.sin(x / 640) + 60 * Math.sin(x / 211);
    if (Math.abs(z + rz) < 130) continue;
    const near = d < 1100;
    let h = 30 + Math.pow(r(), 2.2) * (near ? 170 : 150);
    // peers: the few that rise level with (or above) the 48th floor
    const peer = d > 950 && r() > 0.9;
    if (peer) h = 200 + r() * 90;
    const fw = 22 + r() * 40, fd = 22 + r() * 40;
    const tint = [0.55 + r() * 0.3, 0.55 + r() * 0.28, 0.56 + r() * 0.3];
    if (r() > 0.7) { tint[0] *= 0.6; tint[1] *= 0.66; tint[2] *= 0.75; } // dark glass
    out.push({ x, z, h, fw, fd, tint, peer, rot: r() > 0.8 ? r() * 0.8 : 0 });
    // a setback crown on some of the tall ones
    if (h > 120 && r() > 0.4) out.push({ x, z, h: h + 12 + r() * 30, fw: fw * 0.55, fd: fd * 0.55, tint, crown: true, rot: 0 });
  }
  return out;
}

// soft cloud puffs
const cloudTex = () => canvas('tcloud', 256, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  let s = 3;
  for (let i = 0; i < 26; i++) {
    const x = w * (0.18 + hash(s++) * 0.64), y = h * (0.45 + hash(s++) * 0.25), rr = 18 + hash(s++) * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
}, { wrap: false });

const _o = new THREE.Object3D();
const _col = new THREE.Color();
const _sun = new THREE.Vector3();

export function CityView({ map }) {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const target = lightsOut ? SKY_C.out : SKY_C[hour] || SKY_C.golden;
  const group = useRef();
  const uniforms = useMemo(makeUniforms, []);
  const layout = useMemo(cityLayout, []);
  const beacons = useMemo(() => layout.filter((t) => t.peer || (t.crown && t.h > 170)), [layout]);
  const towers = useRef();
  const beaconRef = useRef();
  const clouds = useRef();
  const cloudData = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    a: hash(i * 3 + 1) * Math.PI * 2, d: 380 + hash(i * 3 + 2) * 400, y: -18 + hash(i * 3 + 3) * 70,
    s: 70 + hash(i * 5) * 110, v: 0.004 + hash(i * 7) * 0.006,
  })), []);

  const mats = useMemo(() => ({
    sky: new THREE.ShaderMaterial({ uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false }),
    ground: new THREE.ShaderMaterial({ uniforms: { ...uniforms, uCam: { value: new THREE.Vector3() } }, vertexShader: groundVert, fragmentShader: groundFrag, fog: false }),
    tower: new THREE.ShaderMaterial({ uniforms, vertexShader: towerVert, fragmentShader: towerFrag, fog: false }),
    beacon: new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false, fog: false }),
    cloud: new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, depthWrite: false, fog: false, opacity: 0.8 }),
  }), [uniforms]);

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useEffect(() => () => { Object.values(mats).forEach((m) => m.dispose()); boxGeo.dispose(); }, [mats, boxGeo]);

  useLayoutEffect(() => {
    layout.forEach((t, i) => {
      _o.position.set(t.x * CITY, GROUND_Y, t.z * CITY);
      _o.rotation.set(0, t.rot, 0);
      _o.scale.set(t.fw * CITY, t.h * CITY, t.fd * CITY);
      _o.updateMatrix();
      towers.current.setMatrixAt(i, _o.matrix);
      towers.current.setColorAt(i, _col.setRGB(...t.tint));
    });
    towers.current.instanceMatrix.needsUpdate = true;
    towers.current.instanceColor.needsUpdate = true;
    beacons.forEach((t, i) => {
      _o.position.set(t.x * CITY, GROUND_Y + (t.h + 1.5) * CITY, t.z * CITY);
      _o.rotation.set(0, 0, 0);
      _o.scale.setScalar(1);
      _o.updateMatrix();
      beaconRef.current.setMatrixAt(i, _o.matrix);
    });
    beaconRef.current.instanceMatrix.needsUpdate = true;
  }, [layout, beacons]);

  useFrame(({ camera, clock }, dt) => {
    const g = group.current;
    if (!g) return;
    g.position.set(camera.position.x, 0, camera.position.z);
    const k = Math.min(1, dt * 1.5);
    const U = uniforms;
    U.uZenith.value.lerp(target.zenith, k); U.uHorizon.value.lerp(target.horizon, k);
    U.uGround.value.lerp(target.ground, k); U.uHaze.value.lerp(target.haze, k); U.uSun.value.lerp(target.sun, k);
    U.uGlow.value += (target.glow - U.uGlow.value) * k;
    U.uLit.value += (target.lit - U.uLit.value) * k;
    U.uSunSize.value += (target.sunSize - U.uSunSize.value) * k;
    U.uCity.value += (target.city - U.uCity.value) * k;
    U.uTime.value = clock.elapsedTime;
    mats.ground.uniforms.uCam.value.copy(camera.position);
    // the sun's direction: the same hour table Lighting.jsx aims the light
    // from, swung round the same way (the camera has no parent to find the
    // light through, which left the sun disc parked in the west all day)
    const L = lightingFor(useStore.getState().timeOfDay, lightsOut, map);
    _sun.set(L.sun.pos[0], L.sun.pos[1], L.sun.pos[2]).normalize();
    U.uSunDir.value.lerp(_sun, k).normalize();
    // beacons: one second on, one off, like every other tower top at night
    const on = Math.floor(clock.elapsedTime * 1.1) % 2 === 0;
    mats.beacon.color.setRGB(on ? 2.4 : 0.15, on ? 0.2 : 0.02, on ? 0.12 : 0.01);
    // clouds drift round slowly, lit by the hour
    mats.cloud.color.copy(U.uHaze.value).lerp(U.uSun.value, 0.35 * U.uCity.value).multiplyScalar(0.6 + 0.6 * U.uCity.value + U.uLit.value * 0.1);
    for (let i = 0; i < cloudData.length; i++) {
      const c = cloudData[i];
      c.a += c.v * dt * 0.1;
      _o.position.set(Math.sin(c.a) * c.d, c.y, Math.cos(c.a) * c.d);
      _o.lookAt(0, c.y, 0);
      _o.scale.set(c.s, c.s * 0.42, 1);
      _o.updateMatrix();
      clouds.current.setMatrixAt(i, _o.matrix);
    }
    clouds.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <mesh material={mats.sky} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[850, 32, 16]} />
      </mesh>
      <mesh material={mats.ground} rotation-x={-Math.PI / 2} position={[0, GROUND_Y, 0]} frustumCulled={false}>
        <circleGeometry args={[830, 72]} />
      </mesh>
      <instancedMesh ref={towers} args={[boxGeo, mats.tower, layout.length]} frustumCulled={false} />
      <instancedMesh ref={beaconRef} args={[null, mats.beacon, beacons.length]} frustumCulled={false}>
        <sphereGeometry args={[0.9, 8, 6]} />
      </instancedMesh>
      <instancedMesh ref={clouds} args={[null, mats.cloud, cloudData.length]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <Helicopter />
    </group>
  );
}

// ------------------------------------------------------------ helicopter
// Every minute or so an executive's helicopter crosses the view a little
// above eye level, strobes blinking, rotor chop faint through the glass.
const HELI_PERIOD = 75, HELI_PASS = 26;
function chopper() {
  const G = audio.graph();
  if (!G) return null;
  const { ctx, bus, noiseBuffer } = G;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(2); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
  const am = ctx.createGain(); am.gain.value = 0.5;
  const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11;
  const depth = ctx.createGain(); depth.gain.value = 0.5;
  lfo.connect(depth); depth.connect(am.gain);
  const out = ctx.createGain(); out.gain.value = 0;
  src.connect(lp); lp.connect(am); am.connect(out); out.connect(bus.amb);
  src.start(); lfo.start();
  return { ctx, out, stop: () => { src.stop(); lfo.stop(); out.disconnect(); } };
}

function Helicopter() {
  const ref = useRef();
  const strobe = useRef();
  const snd = useRef(undefined);
  const body = useMemo(() => new THREE.MeshBasicMaterial({ color: '#15171c', fog: false }), []);
  const light = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false, fog: false }), []);
  const rotor = useMemo(() => new THREE.MeshBasicMaterial({ color: '#15171c', transparent: true, opacity: 0.25, depthWrite: false, fog: false }), []);
  // a looping noise source and an LFO per visit: stop and unhook them on the
  // way out, or every trip to the tower leaves another pair running
  useEffect(() => () => {
    body.dispose(); light.dispose(); rotor.dispose();
    if (snd.current) snd.current.stop();
    snd.current = undefined;
  }, [body, light, rotor]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + 30;
    const k = (t % HELI_PERIOD) / HELI_PASS; // 0..1 while crossing
    const on = k < 1;
    const g = ref.current;
    if (!g) return;
    g.visible = on;
    // a different line across the sky on every pass
    const pass = Math.floor(t / HELI_PERIOD);
    const a = hash(pass * 7) * Math.PI * 2;
    const d = 210 + hash(pass * 7 + 1) * 120;
    const cx = Math.sin(a) * d, cz = Math.cos(a) * d;
    const ex = Math.cos(a), ez = -Math.sin(a);
    const along = (k - 0.5) * 520;
    g.position.set(cx + ex * along, 6 + hash(pass) * 10, cz + ez * along);
    g.rotation.set(0, Math.atan2(ex, ez), 0);
    if (strobe.current) strobe.current.visible = (t % 1.2) < 0.12;
    // the chop: loudest at the closest point of the pass
    if (snd.current === undefined) snd.current = chopper();
    if (snd.current) {
      const vol = on ? Math.max(0, 1 - Math.abs(k - 0.5) * 2.2) * 0.05 : 0;
      snd.current.out.gain.setTargetAtTime(vol, snd.current.ctx.currentTime, 0.3);
    }
  });
  return (
    <group ref={ref} visible={false}>
      <mesh material={body} scale={[1, 0.8, 2]}><sphereGeometry args={[1.2, 10, 8]} /></mesh>
      <mesh material={body} position={[0, 0.3, -3]}><boxGeometry args={[0.25, 0.3, 3.4]} /></mesh>
      <mesh material={rotor} position={[0, 1.2, 0]}><cylinderGeometry args={[4.2, 4.2, 0.03, 20]} /></mesh>
      <mesh ref={strobe} material={light} position={[0, -0.9, 0]}><sphereGeometry args={[0.35, 8, 6]} /></mesh>
    </group>
  );
}
