// Outside Garage Zero: the sky, the street and the neighbours, and the
// house's own roofs (the roof is real — it casts, so indoors is lit by the
// room and the sun only gets in where there's a hole in the house).
//
// Everything here is cheap on purpose: the neighbourhood is a few merged
// meshes (one per material), the trees are two instanced meshes, the far
// suburbs are a painted band, and the sky is one shader on a dome that rides
// with the camera. It only has to hold up past a picket fence at 18 cm.
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import { lightingFor } from '../daylight.js';
import { glowTex } from '../textures.js';
import { kit, slotMat, defineSlot, FINISH_TEX, canvasTex, rng } from './garageKit.js';
import { KitMeshes, buildTree } from './garagePieces.jsx';

// ------------------------------------------------------------ slots
// textured slots for the outside, tinted by vertex colour
const tinted = (tex, rough = 0.9, extra = {}) => () => new THREE.MeshStandardMaterial({ vertexColors: true, map: tex(), roughness: rough, ...extra });
defineSlot('siding', tinted(() => FINISH_TEX.siding()));
defineSlot('drywall', tinted(() => FINISH_TEX.drywall()));
defineSlot('shingle', tinted(() => canvasTex(128, 128, (g, W, H) => {
  // three-tab asphalt shingles: staggered rows, grainy
  const r = rng(17);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const v = 150 + r() * 105 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
  for (let row = 0; row < 4; row++) {
    const y = row * 32;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, y + 29, W, 3);
    for (let x = (row % 2) * 21; x < W; x += 42) g.fillRect(x, y, 2, 30);
  }
}, { repeat: [1 / 1.0, 1 / 0.8] })));
defineSlot('asphalt', tinted(() => canvasTex(128, 128, (g, W, H) => {
  const r = rng(23);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) { const v = 120 + r() * 135 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W, r() * H, 1.3, 1.3); }
}, { repeat: [1 / 2, 1 / 2] }), 0.95));
defineSlot('turf', tinted(() => canvasTex(128, 128, (g, W, H) => {
  const r = rng(29);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) { const v = 140 + r() * 115 | 0; g.fillStyle = `rgb(${v * 0.9 | 0},${v},${v * 0.8 | 0})`; g.fillRect(r() * W, r() * H, 1.5, 3); }
}, { repeat: [1 / 1.5, 1 / 1.5] }), 1));

// --------------------------------------------------------------- the sky
// Per hour: zenith, horizon and the glow round the sun (or the moon).
const SKY = {
  morning: { top: '#5f8fd6', hor: '#d6e3ef', glow: '#ffe6c0', stars: 0, cloud: '#ffffff' },
  afternoon: { top: '#3f78d0', hor: '#c6dcf0', glow: '#fff6e0', stars: 0, cloud: '#ffffff' },
  golden: { top: '#4a5f9e', hor: '#ffb27a', glow: '#ff9446', stars: 0, cloud: '#ffd2b0' },
  night: { top: '#03060f', hor: '#141d38', glow: '#8ea4e8', stars: 1, cloud: '#1b2238' },
};
const skyVert = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }`;
const skyFrag = `
  uniform vec3 uTop, uHor, uGlow, uCloud, uSun;
  uniform float uStars;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(vec3(i, 0.0)), b = hash(vec3(i + vec2(1.0, 0.0), 0.0));
    float c = hash(vec3(i + vec2(0.0, 1.0), 0.0)), d = hash(vec3(i + vec2(1.0, 1.0), 0.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHor, uTop, pow(h, 0.55));
    // below the horizon: the haze colour (hidden behind the suburb anyway)
    if (d.y < 0.0) col = uHor * 0.85;
    float s = max(dot(d, normalize(uSun)), 0.0);
    col += uGlow * (pow(s, 8.0) * 0.45 + pow(s, 300.0) * 2.5);
    // soft cloud streaks low in the sky
    vec2 q = d.xz / max(d.y + 0.15, 0.05) * 1.3;
    float c = noise(q) * 0.6 + noise(q * 2.3) * 0.3 + noise(q * 5.1) * 0.1;
    c = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.5, 0.9, h));
    col = mix(col, uCloud, c * 0.6);
    // stars
    if (uStars > 0.0) {
      vec3 g = floor(d * 180.0);
      float st = step(0.9965, hash(g)) * smoothstep(0.05, 0.3, h);
      col += vec3(st) * uStars * 0.9;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function Sky({ map }) {
  const hour = useStore((s) => s.timeOfDay);
  const mesh = useRef();
  const { scene } = useThree();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uStars: { value: 0 },
    },
  }), []);
  const tmp = useMemo(() => ({ c: new THREE.Color(), v: new THREE.Vector3() }), []);
  // The scene's fog is the office's night-blue haze; out here the haze is
  // the sky's horizon colour and much further off. Put it back on the way out.
  useEffect(() => {
    const f = scene.fog;
    if (!f) return undefined;
    const saved = { color: f.color.clone(), near: f.near, far: f.far };
    f.near = 60 * M; f.far = 190 * M;
    return () => { f.color.copy(saved.color); f.near = saved.near; f.far = saved.far; };
  }, [scene]);
  const first = useRef(true);
  useFrame(({ camera }, dt) => {
    const S = SKY[hour] || SKY.golden;
    const sun = lightingFor(hour, false, map).sun.pos;
    const k = first.current ? 1 : Math.min(1, dt * 1.8);
    first.current = false;
    const U = mat.uniforms;
    U.uTop.value.lerp(tmp.c.set(S.top), k);
    U.uHor.value.lerp(tmp.c.set(S.hor), k);
    U.uGlow.value.lerp(tmp.c.set(S.glow), k);
    U.uCloud.value.lerp(tmp.c.set(S.cloud), k);
    U.uSun.value.lerp(tmp.v.set(...sun).normalize(), k);
    U.uStars.value += (S.stars - U.uStars.value) * k;
    if (scene.fog) scene.fog.color.copy(U.uHor.value).multiplyScalar(0.92);
    if (mesh.current) mesh.current.position.copy(camera.position);
  });
  return (
    <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}

// ------------------------------------------------------ the neighbourhood
function house(k, x0, z0, w, d, facing, opts) {
  // a single-storey suburban house: siding walls, white trim, windows, a
  // front door and a garage door facing the street, a gable roof
  const { siding, trim = '#f3f0e9', roof = '#565250', door = '#2f4f6f', hoop = false, garage = true } = opts;
  const H = 2.8, ridge = 4.6;
  const cx = x0 + w / 2, cz = z0 + d / 2;
  k.box('siding', [w, H, d], [cx, H / 2, cz], siding);
  k.box('matte', [w + 0.06, 0.3, d + 0.06], [cx, 0.15, cz], '#9d988d');
  // gable roof, ridge along x
  const a = Math.atan2(ridge - H, d / 2);
  const Ls = Math.hypot(d / 2, ridge - H) + 0.5;
  for (const s of [-1, 1]) {
    const zc = cz + s * (d / 4 + 0.2 * Math.cos(a));
    k.box('shingle', [w + 0.8, 0.14, Ls], [cx, (H + ridge) / 2 - 0.05, zc], roof, [s * a, 0, 0]);
  }
  for (const sx of [-1, 1]) {
    k.extrude('siding', [[-d / 2, 0], [d / 2, 0], [0, ridge - H]], 0.2, [cx + sx * (w / 2 - 0.1), H, cz], siding, [0, Math.PI / 2, 0]);
  }
  // the street face: windows, the door, the garage door
  const fz = facing > 0 ? z0 + d + 0.01 : z0 - 0.01;
  const win = (x, y, ww, hh) => {
    k.box('glass', [ww, hh, 0.04], [x, y, fz], '#3e4f5e');
    k.box('satin', [ww + 0.16, 0.08, 0.06], [x, y + hh / 2 + 0.04, fz], trim);
    k.box('satin', [ww + 0.2, 0.06, 0.1], [x, y - hh / 2 - 0.03, fz], trim);
    k.box('satin', [0.06, hh, 0.06], [x, y, fz], trim);
    // shutters
    k.box('satin', [0.3, hh, 0.04], [x - ww / 2 - 0.2, y, fz], door);
    k.box('satin', [0.3, hh, 0.04], [x + ww / 2 + 0.2, y, fz], door);
  };
  const gx = garage ? x0 + 3.2 : null;
  if (garage) {
    k.box('satin', [5, 2.3, 0.05], [gx, 1.15, fz], '#eeece6');
    for (let i = 1; i < 4; i++) k.box('satin', [5, 0.03, 0.07], [gx, i * 0.575, fz], '#d5d2ca');
    k.box('satin', [5.3, 0.14, 0.08], [gx, 2.37, fz], trim);
    if (hoop) {
      // a basketball hoop over the garage door: backboard, orange ring, net
      k.box('satin', [1.2, 0.8, 0.04], [gx, 3.1, fz + facing * 0.35], '#f6f6f2');
      k.box('satin', [0.45, 0.35, 0.045], [gx, 2.95, fz + facing * 0.35], '#d8261e');
      k.box('satin', [0.41, 0.31, 0.05], [gx, 2.95, fz + facing * 0.35], '#f6f6f2');
      k.torus('metal', 0.23, 0.012, [gx, 2.78, fz + facing * 0.62], '#f07a1a', [Math.PI / 2, 0, 0], 16);
      k.cyl('glass', 0.23, 0.15, 0.35, [gx, 2.6, fz + facing * 0.62], '#f2f2f2', null, 12, true);
      k.bar('metal', [gx, 2.6, fz], [gx, 2.9, fz + facing * 0.35], 0.04, '#555');
    }
  }
  const dx = garage ? x0 + 6.8 : x0 + w * 0.3;
  k.box('satin', [1.0, 2.1, 0.05], [dx, 1.05, fz], door);
  k.box('satin', [1.2, 0.1, 0.06], [dx, 2.15, fz], trim);
  k.box('matte', [1.6, 0.15, 1.1], [dx, 0.075, fz + facing * 0.55], '#b9b4aa');
  for (let x = dx + 1.4; x < x0 + w - 0.8; x += 1.7) win(x, 1.55, 1.1, 1.1);
  // a driveway to the street and a path to the door
  if (garage) k.box('matte', [5.2, 0.02, 5.4], [gx, 0.01, fz + facing * 2.7], '#b8b2a6');
  return k;
}

export function addNeighbourhood(k) {
  // ground: lawns everywhere the map isn't
  k.box('turf', [200, 0.02, 160], [0, -0.07, 0], '#5a7f38');
  // our side of the street: sidewalk, verge, kerb
  k.box('matte', [140, 0.04, 2.0], [0, -0.02, -13.25], '#c7c2b6');
  for (let x = -69; x < 70; x += 1.5) k.box('matte', [0.02, 0.041, 2.0], [x, -0.02, -13.25], '#8a867d');
  k.box('turf', [140, 0.04, 1.2], [0, -0.02, -14.85], '#5f8a3c');
  k.box('matte', [140, 0.14, 0.16], [0, 0.03, -15.53], '#b5b0a6');
  // the road, its centre line, the far kerb and sidewalk
  k.box('asphalt', [140, 0.02, 8], [0, -0.04, -19.6], '#4a4c50');
  for (let x = -68; x < 70; x += 3) k.box('matte', [1.5, 0.022, 0.12], [x, -0.03, -19.6], '#e8d25a');
  k.box('matte', [140, 0.14, 0.16], [0, 0.03, -23.67], '#b5b0a6');
  k.box('turf', [140, 0.04, 1.2], [0, -0.02, -24.35], '#5f8a3c');
  k.box('matte', [140, 0.04, 2.0], [0, -0.02, -25.95], '#c7c2b6');
  // across the street: four houses, one with a hoop over its garage
  house(k, -40, -37, 13, 9, 1, { siding: '#d9cfbd', roof: '#5a4a44', door: '#7a3a2f' });
  house(k, -21, -37.5, 13.5, 9, 1, { siding: '#a9bfa6', roof: '#4a4c52', door: '#2f4f3f', hoop: true });
  house(k, -1, -36.5, 12, 8.5, 1, { siding: '#e8e4da', roof: '#6a4d3e', door: '#2f4f6f' });
  house(k, 18, -37, 13, 9, 1, { siding: '#c7b8d0', roof: '#4d4a4a', door: '#8a2f4a', garage: false });
  house(k, 36, -37.5, 12, 9, 1, { siding: '#d6c6a6', roof: '#5a524a', door: '#2f3f5f' });
  // next door, west and east (side walls toward us), and the backs of the
  // houses over the back fence
  house(k, -35, -9, 10, 17, 1, { siding: '#cdd6d9', roof: '#4f4b48', garage: false });
  house(k, 24, -8, 11, 16, 1, { siding: '#e2d6c0', roof: '#5b4a40', garage: false });
  house(k, -22, 22, 14, 9, -1, { siding: '#d8d0c2', roof: '#4d4c4f', garage: false });
  house(k, 2, 23, 13, 9, -1, { siding: '#b9c8d4', roof: '#56504a', garage: false });
  // hedges round our yards, a privacy fence behind the backyard
  k.box('matte', [0.9, 1.7, 24.5], [-20.75, 0.85, 0], '#3f6a2e', null, 0.3);
  k.box('matte', [0.9, 1.6, 8.3], [20.75, 0.8, -8], '#3f6a2e', null, 0.3);
  k.box('wood', [15.2, 1.85, 0.06], [-13.1, 0.925, 12.75], '#8a6a4a');
  for (let x = -20.5; x < -5.5; x += 1.8) k.box('wood', [0.1, 1.95, 0.1], [x, 0.975, 12.8], '#6d523a');
  k.box('matte', [26.5, 1.8, 0.9], [7, 0.9, 13.1], '#436f31', null, 0.3);
  // the neighbour's shed over the back hedge
  k.box('wood', [3, 2.2, 2.4], [9, 1.1, 17.5], '#8f6b4a');
  k.box('shingle', [3.4, 0.1, 2.9], [9, 2.35, 17.5], '#4a4c52', [0.12, 0, 0]);
  // a parked car at the kerb, our side: a little teal hatchback
  const cx = -3.5, cz = -16.5;
  k.box('gloss', [4.0, 0.62, 1.75], [cx, 0.52, cz], '#2f7f86', null, 0.18);
  k.box('gloss', [2.3, 0.5, 1.6], [cx - 0.25, 1.05, cz], '#2f7f86', null, 0.15);
  k.box('glass', [2.2, 0.4, 1.62], [cx - 0.25, 1.08, cz], '#1d2833');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('matte', 0.31, 0.31, 0.2, [cx + sx * 1.3, 0.31, cz + sz * 0.8], '#151515', [Math.PI / 2, 0, 0], 16);
  k.box('glow', [0.05, 0.12, 0.3], [cx - 2.0, 0.66, cz - 0.6], '#fff4d8');
  k.box('glow', [0.05, 0.12, 0.3], [cx - 2.0, 0.66, cz + 0.6], '#fff4d8');
  // power poles along the far side, a streetlight on ours
  for (let x = -45; x <= 45; x += 30) {
    k.cyl('wood', 0.13, 0.16, 8, [x, 4, -24.9], '#6a5440', null, 8);
    k.box('wood', [0.1, 0.12, 1.6], [x, 7.4, -24.9], '#6a5440');
  }
  // the sodium streetlight at the lawn's corner
  k.cyl('metal', 0.07, 0.09, 5.2, [13.2, 2.6, -13.6], '#6a7076', null, 10);
  k.bar('metal', [13.2, 5.1, -13.6], [13.2, 5.3, -14.9], 0.06, '#6a7076');
  k.box('satin', [0.3, 0.14, 0.6], [13.2, 5.25, -15.1], '#3a3d42', null, 0.04);
  k.box('warm', [0.22, 0.03, 0.46], [13.2, 5.17, -15.1], '#ffae4a');
  // wires between the poles
  for (let x = -45; x < 45; x += 30) {
    for (const dz of [-0.6, 0.6]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(x + t * 30, 7.45 - Math.sin(t * Math.PI) * 0.7, -24.9 + dz)); }
      k.add('matte', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 3), '#1a1a1a');
    }
  }
  return k;
}

// Street and garden trees: one instanced mesh per material of a single tree.
const TREES = [
  [-30, -14.8, 6.5], [-17, -14.8, 7], [-5, -14.8, 6], [22, -14.8, 7.5], [34, -14.8, 6.5],
  [-33, -27.5, 7], [-10, -27.5, 8], [9, -27.5, 7], [29, -27.5, 7.5],
  [-26, 5, 8], [-24, 14, 7], [-12, 16, 9], [-2, 16.5, 8], [14, 15, 8.5], [22, 13, 7.5], [27, 3, 7], [26, -12, 6.5],
];
const _o = new THREE.Object3D();
function Trees() {
  const geos = useMemo(() => buildTree(6.5, 5), []);
  const refs = useRef({});
  useLayoutEffect(() => {
    for (const m of Object.values(refs.current)) {
      if (!m) continue;
      TREES.forEach(([x, z, h], i) => {
        _o.position.set(x * M, 0, z * M);
        _o.rotation.set(0, i * 1.7, 0);
        _o.scale.setScalar(h / 6.5);
        _o.updateMatrix();
        m.setMatrixAt(i, _o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  }, [geos]);
  return Object.entries(geos).map(([slot, g]) => (
    <instancedMesh key={slot} ref={(m) => { refs.current[slot] = m; }} args={[g, slotMat(slot), TREES.length]} castShadow frustumCulled={false} />
  ));
}

// The far suburbs: a painted band of roofs and trees on a ring, in the haze.
function farTex() {
  return canvasTex(2048, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const r = rng(99);
    // trees behind
    for (let i = 0; i < 90; i++) {
      const x = r() * W, rr = 20 + r() * 40, y = H - 50 - r() * 60;
      g.fillStyle = `rgba(${50 + r() * 30 | 0},${80 + r() * 30 | 0},${50 + r() * 20 | 0},1)`;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
    // roofs
    let x = 0;
    while (x < W) {
      const w = 90 + r() * 120, h = 30 + r() * 30, y = H - 30;
      g.fillStyle = ['#d9cfbd', '#b9c8d4', '#e8e4da', '#c7b8d0', '#cdd6d9'][Math.floor(r() * 5)];
      g.fillRect(x, y - h, w, h + 30);
      g.fillStyle = ['#4d4a4a', '#5a4a44', '#56504a'][Math.floor(r() * 3)];
      g.beginPath(); g.moveTo(x - 8, y - h); g.lineTo(x + w / 2, y - h - 30 - r() * 20); g.lineTo(x + w + 8, y - h); g.fill();
      g.fillStyle = 'rgba(40,50,60,0.6)';
      for (let k2 = 0; k2 < 3; k2++) g.fillRect(x + 12 + k2 * (w / 3), y - h + 10, 16, 14);
      x += w + 10 + r() * 40;
    }
    g.fillStyle = '#4f6a3a'; g.fillRect(0, H - 30, W, 30);
    // a water tower
    g.fillStyle = '#9aa3aa'; g.fillRect(1500, 60, 70, 50); g.fillRect(1530, 110, 10, 100);
  }, { srgb: true });
}
function FarRing() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: farTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, fog: true }), []);
  return (
    <mesh position={[0, 5.5 * M, 0]} material={mat}>
      <cylinderGeometry args={[70 * M, 70 * M, 11 * M, 48, 1, true]} />
    </mesh>
  );
}

// ------------------------------------------------------- our house's roofs
// Garage: a low gable, ridge 3.9 m along x, open inside (you see the deck
// between the trusses). House: a steeper gable over the front rooms and
// another over the back wing, meeting in a valley over the z = 5 wall.
function slope(k, x0, x1, zw, zr, yr, H, over, dir) {
  // a roof slab whose underside passes through (zw, H) and (zr, yr); `over`
  // metres of eave past the wall line, away from the ridge
  const run = zr - zw, rise = yr - H;
  const a = Math.atan2(rise, Math.abs(run));
  const len = Math.hypot(run, rise);
  const s = Math.sign(run);
  // from the eave to the ridge along the slope
  const ez = zw - s * over * Math.cos(a), ey = H - over * Math.sin(a);
  const L = len + over;
  const cz = (ez + zr) / 2, cy = (ey + yr) / 2;
  const rx = s > 0 ? -a : a;
  const nz = Math.sin(rx), ny = Math.cos(rx); // slab's up
  const T = 0.1;
  k.box(dir === 'open' ? 'wood' : 'matte', [x1 - x0, T, L], [(x0 + x1) / 2, cy + ny * T / 2, cz + nz * T / 2], dir === 'open' ? '#cdb087' : '#f1eee7', [rx, 0, 0]);
  k.box('shingle', [x1 - x0 + 0.02, 0.03, L + 0.02], [(x0 + x1) / 2, cy + ny * (T + 0.015), cz + nz * (T + 0.015)], '#5c5854', [rx, 0, 0]);
  // fascia and gutter along the eave
  k.box('satin', [x1 - x0, 0.2, 0.03], [(x0 + x1) / 2, ey - 0.02, ez - s * 0.015], '#f3f0e9');
  k.box('satin', [x1 - x0, 0.1, 0.12], [(x0 + x1) / 2, ey - 0.02, ez - s * 0.08], '#e7e4dc');
  // soffit under the overhang
  k.box('matte', [x1 - x0, 0.015, over], [(x0 + x1) / 2, ey + 0.02, zw - s * over / 2], '#f1eee7');
}
function gable(k, x, z0, z1, H, ridge, inner, outer, sx) {
  // a triangle end wall at x: `outer` finish faces +x*sx
  const zc = (z0 + z1) / 2;
  const tri = [[z0 - zc, 0], [z1 - zc, 0], [0, ridge - H]];
  k.extrude(outer, tri, 0.1, [x + sx * 0.05, H, zc], '#ffffff', [0, Math.PI / 2, 0]);
  k.extrude(inner, tri, 0.1, [x - sx * 0.05, H, zc], '#ffffff', [0, Math.PI / 2, 0]);
}
export function addRoofs(k, H) {
  // the garage: open underneath
  slope(k, -20.35, -8, -4, 0.5, 3.9, H, 0.45, 'open');
  slope(k, -20.35, -8, 5, 0.5, 3.9, H, 0.45, 'open');
  gable(k, -20, -4, 5, H, 3.9, 'drywall', 'siding', -1);
  gable(k, -8.12, -4, 5, H, 3.9, 'siding', 'drywall', 1); // its inner face looks into the garage
  // the house: front rooms and the back wing
  slope(k, -8.35, 20.35, -4, 0.5, 4.3, H, 0.45, 'closed');
  slope(k, -8.35, -5.9, 5, 0.5, 4.3, H, 0.45, 'closed');
  slope(k, -5.9, 20.35, 5, 0.5, 4.3, H, 0, 'closed');
  slope(k, -6.35, 20.35, 12, 8.5, 4.1, H, 0.45, 'closed');
  slope(k, -6.35, 20.35, 5, 8.5, 4.1, H, 0, 'closed');
  gable(k, -7.95, -4, 5, H, 4.3, 'siding', 'siding', -1);
  gable(k, 20, -4, 5, H, 4.3, 'siding', 'siding', 1);
  gable(k, -6, 5, 12, H, 4.1, 'siding', 'siding', -1);
  gable(k, 20, 5, 12, H, 4.1, 'siding', 'siding', 1);
  // a brick chimney, solar panels on the street side (it IS a startup)
  k.box('matte', [0.7, 2.2, 0.7], [3, 3.9, 9.5], '#8a4a3a');
  k.box('matte', [0.8, 0.1, 0.8], [3, 5.0, 9.5], '#6a3a2e');
  const a = Math.atan2(4.3 - H, 4.5);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      const z = -2.2 + j * 1.8, y = H + (z + 4) * Math.tan(a) + 0.19;
      k.box('gloss', [1.0, 0.04, 1.65], [0.5 + i * 1.1, y, z], '#1e2c48', [-a, 0, 0]);
      k.box('metal', [1.02, 0.02, 1.67], [0.5 + i * 1.1, y - 0.03, z], '#b9bec4', [-a, 0, 0]);
    }
  }
  // the porch hood over the front door, its light and the house number
  k.box('shingle', [2.6, 0.06, 1.0], [15.5, 2.5, -4.6], '#5c5854', [0.25, 0, 0]);
  k.box('satin', [2.6, 0.12, 0.04], [15.5, 2.36, -5.1], '#f3f0e9');
  for (const x of [14.3, 16.7]) k.bar('satin', [x, 2.0, -4.12], [x, 2.38, -4.95], 0.06, '#f3f0e9');
  k.box('satin', [0.14, 0.22, 0.1], [17.0, 1.9, -4.15], '#2a2d31');
  k.box('warm', [0.1, 0.14, 0.02], [17.0, 1.9, -4.21], '#ffcf8a');
  k.box('satin', [0.4, 0.14, 0.02], [14.0, 1.9, -4.12], '#2a2d31');
  return k;
}

// ---------------------------------------- night lights spilling outside
// Additive pools for the streetlight, the porch lamp and the garage's
// motion-sensor floodlight — the floodlight clicks on when a car rolls past.
function OutsideGlows({ map }) {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const level = lightingFor(hour, lightsOut, map).practical;
  const tex = useMemo(() => glowTex(), []);
  const mk = (color) => new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const mats = useMemo(() => ({ sodium: mk('#ffae4a'), porch: mk('#ffcf8a'), flood: mk('#dfe8f4') }), [tex]);
  const flood = useRef({ until: 0, on: false });
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const night = Math.max(0, level - 0.5) * 2; // 0 by day, 1 at night
    const k = Math.min(1, dt * 2);
    mats.sodium.opacity += (night * 0.5 - mats.sodium.opacity) * k;
    mats.porch.opacity += (night * 0.4 - mats.porch.opacity) * k;
    const car = window.__rcTelemetry;
    if (night > 0.3 && car && Math.hypot(car.x / M + 14, car.z / M + 6) < 4.5) {
      if (!flood.current.on) audio.clank([-14 * M, 2.5 * M, -4.2 * M], 0.12);
      flood.current.until = t + 20;
      flood.current.on = true;
    }
    if (t > flood.current.until) flood.current.on = false;
    const want = flood.current.on ? 0.22 : 0;
    mats.flood.opacity += (want - mats.flood.opacity) * Math.min(1, dt * (flood.current.on ? 12 : 1.5));
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[13.2 * M, 0.03, -13.6 * M]} material={mats.sodium}>
        <planeGeometry args={[11 * M, 9 * M]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[15.5 * M, 0.035, -5.2 * M]} material={mats.porch}>
        <planeGeometry args={[4 * M, 3.5 * M]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-14 * M, 0.04, -7 * M]} material={mats.flood}>
        <planeGeometry args={[9 * M, 8 * M]} />
      </mesh>
    </group>
  );
}

// The yards' turf. The floor under it is carpet2 (turf drives like pile);
// this is what it looks like: mown grass in stripes, tufts along the fences.
export function addTurf(k, map) {
  for (const r of map.ROOMS) {
    if (!r.outdoor || r.floor !== 'carpet2') continue;
    const x = r.x / M, z = r.z / M, w = r.w / M, d = r.d / M;
    k.box('turf', [w, 0.004, d], [x, 0.004, z], '#7fae4c');
    // mowing stripes: every other 1 m band a shade lighter
    for (let i = 0; i < Math.floor(w); i += 2) k.box('turf', [1, 0.004, d], [x - w / 2 + i + 0.5, 0.0045, z], '#8dbb57');
  }
  return k;
}
function Tufts() {
  const tufts = useMemo(() => {
    const out = [];
    const r = rng(33);
    const edge = (x0, z0, x1, z1, n) => {
      for (let i = 0; i < n; i++) {
        const t = r();
        out.push([x0 + (x1 - x0) * t + (r() - 0.5) * 0.3, z0 + (z1 - z0) * t + (r() - 0.5) * 0.3, 0.6 + r() * 0.8, r() * 6]);
      }
    };
    edge(6.2, -11.8, 19.8, -11.8, 60); edge(19.8, -11.8, 19.8, -4.9, 30);
    edge(-19.8, 5.2, -19.8, 11.8, 30); edge(-19.8, 11.8, -6.2, 11.8, 60);
    edge(-20, -11.8, 6, -11.8, 30); edge(-19.8, -11.8, -19.8, -4.2, 20);
    // and scattered through the lawns
    for (let i = 0; i < 60; i++) out.push([6.5 + r() * 13, -11.5 + r() * 6.5, 0.4 + r() * 0.5, r() * 6]);
    for (let i = 0; i < 50; i++) out.push([-19.5 + r() * 13, 5.5 + r() * 6, 0.4 + r() * 0.5, r() * 6]);
    return out;
  }, []);
  const ref = useRef();
  const tuftGeo = useMemo(() => {
    // three crossed blades of grass
    const k = kit();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Shape();
      s.moveTo(-0.035, 0); s.lineTo(0.035, 0); s.lineTo(0.004, 0.11); s.closePath();
      const g = new THREE.ShapeGeometry(s);
      k.add('matte', g, '#6f9f3c', [0, 0, 0], [0, (i / 3) * Math.PI, (i - 1) * 0.25]);
    }
    return k.build().matte;
  }, []);
  const tuftMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), []);
  useLayoutEffect(() => {
    tufts.forEach(([x, z, s, a], i) => {
      _o.position.set(x * M, 0, z * M);
      _o.rotation.set(0, a, 0);
      _o.scale.set(s, s * (0.8 + (i % 5) * 0.12), s);
      _o.updateMatrix();
      ref.current.setMatrixAt(i, _o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [tufts]);
  return (
    <instancedMesh ref={ref} args={[tuftGeo, tuftMat, tufts.length]} frustumCulled={false} />
  );
}

export function World({ map }) {
  return (
    <group>
      <Sky map={map} />
      <FarRing />
      <Tufts />
      <Trees />
      <OutsideGlows map={map} />
    </group>
  );
}
