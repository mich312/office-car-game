// The view past the office's glass: a sky and a city that follow the hour.
//
// It used to be a baked night skyline on an unlit plane, so golden hour and
// noon both looked out on midnight — and the lounge and the open office face
// straight at it, which made it the loudest wrong note in the building. This
// is one small shader on the same two backdrop planes:
//
//   · a sky gradient from the hour's horizon to its zenith
//   · the sun (or the moon): a glow and a disc, placed from the same
//     direction the directional light shines from, so the disc sits where
//     the shadows say it should — low in the west at golden hour
//   · two layers of city silhouettes (a hazy far row, a near one), lit on
//     the sun side by day and falling to dark shapes against a burning sky
//     at dusk
//   · lit windows fading in as the light goes (each window has its own
//     threshold, so the city comes on gradually, not all at once). The city
//     keeps its power in a blackout: the office's windows become the room's
//     brightest light.
//
// The sky is over-bright on purpose (HDR): bloom finds the sun and the
// brightest horizon, and exposure brings the rest down with the room.
import * as THREE from 'three';

// Per hour: zenith, horizon, sun glow, disc colour, near and far
// silhouettes, how much of the city is lit, and the sky's brightness.
export const OFFICE_SKY = {
  morning: { top: '#6488c8', hor: '#f0d2b0', glow: '#ffd7a0', disc: '#fff0d0', near: '#63718a', far: '#a0b0c6', lit: 0.08, gain: 1.05, disc0: 1 },
  afternoon: { top: '#3f73c0', hor: '#b4cce8', glow: '#fff2dc', disc: '#fffaf0', near: '#76849a', far: '#a9b9ce', lit: 0.0, gain: 1.05, disc0: 0.6 },
  golden: { top: '#34427e', hor: '#ff9650', glow: '#ff8a3c', disc: '#ffdca0', near: '#2a2233', far: '#7a4c58', lit: 0.3, gain: 1.9, disc0: 1.6 },
  night: { top: '#03060f', hor: '#16203e', glow: '#34466e', disc: '#c8d4ff', near: '#05070e', far: '#0e1428', lit: 0.72, gain: 1, disc0: 0.5 },
};
OFFICE_SKY.lightsOut = { ...OFFICE_SKY.night, lit: 0.65 };

// The city: R near silhouettes, G far silhouettes, B each near window's
// switch-on threshold (0 = no window), A window glass (for day reflections).
// Seeded, so every client sees the same skyline.
let cityTex = null;
export function officeCityTex() {
  if (cityTex) return cityTex;
  const W = 2048, H = 512;
  const data = new Uint8Array(W * H * 4);
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const put = (x, y, c, v) => { if (x >= 0 && x < W && y >= 0 && y < H) data[(y * W + x) * 4 + c] = v; };
  // far row: tall, thin, lower contrast
  for (let x = 0; x < W;) {
    const bw = 28 + r() * 80, bh = 180 + r() * 300;
    for (let i = x; i < x + bw; i++) for (let y = 0; y < bh; y++) put(i | 0, y, 1, 255);
    x += bw + r() * 24;
  }
  // near row: wider blocks with a window grid
  for (let x = 0; x < W;) {
    const bw = 52 + r() * 140, bh = 80 + r() * 260;
    const x0 = x | 0, x1 = (x + bw) | 0;
    for (let i = x0; i < x1; i++) for (let y = 0; y < bh; y++) put(i, y, 0, 255);
    // windows: 3×3 px on a 6×7 grid (a storey is ~15 cm of backdrop at
    // 27 m: the city is far smaller than the plane is far), each with its
    // own switch-on threshold
    for (let wy = 7; wy < bh - 9; wy += 7) {
      for (let wx = x0 + 4; wx < x1 - 6; wx += 6) {
        const t = r() < 0.2 ? 0 : 1 + ((r() * 254) | 0); // a few never light
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { put(wx + i, wy + j, 2, t); put(wx + i, wy + j, 3, 255); }
      }
    }
    // a rooftop beacon on some
    if (r() > 0.7) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) put(((x0 + x1) >> 1) + j, bh + 2 + i, 2, 255);
    x += bw + 8 + r() * 44;
  }
  cityTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  cityTex.colorSpace = THREE.NoColorSpace;
  cityTex.wrapS = THREE.RepeatWrapping;
  cityTex.magFilter = THREE.LinearFilter;
  cityTex.minFilter = THREE.LinearMipmapLinearFilter;
  cityTex.generateMipmaps = true;
  cityTex.needsUpdate = true;
  return cityTex;
}

const vert = /* glsl */`
  uniform float uRepeat;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = vec2(uv.x * uRepeat, uv.y);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const frag = /* glsl */`
  uniform sampler2D uCity;
  uniform vec3 uTop, uHor, uGlow, uDisc, uNear, uFar, uSunDir;
  uniform float uLit, uGain, uDiscSize;
  varying vec2 vUv;
  varying vec3 vWorld;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float h = clamp(vUv.y, 0.0, 1.0);
    // the gradient: horizon band low, zenith above
    vec3 sky = mix(uHor, uTop, smoothstep(0.08, 0.95, h));
    float s = max(dot(dir, normalize(uSunDir)), 0.0);
    sky += uGlow * (pow(s, 5.0) * 0.55 + pow(s, 40.0) * 0.6) * (1.0 - h * 0.5);
    sky *= uGain;
    // the disc: HDR, so bloom makes it a sun
    float disc = smoothstep(1.0 - 0.0009 * uDiscSize, 1.0 - 0.0004 * uDiscSize, s);
    sky += uDisc * disc * 8.0;
    vec4 c = texture2D(uCity, vUv);
    // far row: hazy, half-way to the horizon colour
    vec3 far = mix(uFar * uGain * 0.8, uHor * uGain, 0.35);
    vec3 col = mix(sky, far, c.g * 0.9);
    // near row: lit on its sun side by day; a silhouette at dusk
    float sunSide = 0.8 + 0.4 * h21(floor(vUv.xx * 40.0));
    vec3 near = uNear * uGain * 0.7 * sunSide;
    // day glass catches the sky
    near = mix(near, sky * 0.55, c.a * 0.35 * (1.0 - uLit));
    col = mix(col, near, c.r);
    // the lit windows: each switches on at its own threshold, and flickers
    // warm or cool
    float th = c.b;
    float on = step(0.001, th) * smoothstep(1.0 - uLit, 1.0 - uLit + 0.08, th);
    vec3 lamp = mix(vec3(1.0, 0.7, 0.36), vec3(0.7, 0.82, 1.0), step(0.82, fract(th * 7.31)));
    col += c.r * on * lamp * (0.8 + 0.7 * fract(th * 13.7));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function makeOfficeSkyMaterial(repeat = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    fog: false,
    uniforms: {
      uCity: { value: officeCityTex() },
      uRepeat: { value: repeat },
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uDisc: { value: new THREE.Color() }, uNear: { value: new THREE.Color() }, uFar: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(-0.8, 0.15, 0.5) },
      uLit: { value: 0 }, uGain: { value: 1 }, uDiscSize: { value: 1 },
    },
  });
}

// Ease a set of sky materials toward the hour (called per frame). Shares
// its uniforms' values across the planes, so one lerp drives them all.
const _c = new THREE.Color(), _v = new THREE.Vector3();
export function stepOfficeSky(mats, sky, sunPos, k) {
  const U = mats[0].uniforms;
  U.uTop.value.lerp(_c.set(sky.top), k);
  U.uHor.value.lerp(_c.set(sky.hor), k);
  U.uGlow.value.lerp(_c.set(sky.glow), k);
  U.uDisc.value.lerp(_c.set(sky.disc), k);
  U.uNear.value.lerp(_c.set(sky.near), k);
  U.uFar.value.lerp(_c.set(sky.far), k);
  U.uSunDir.value.lerp(_v.set(sunPos[0], sunPos[1], sunPos[2]).normalize(), k).normalize();
  U.uLit.value += (sky.lit - U.uLit.value) * k;
  U.uGain.value += (sky.gain - U.uGain.value) * k;
  U.uDiscSize.value += (sky.disc0 - U.uDiscSize.value) * k;
  for (let i = 1; i < mats.length; i++) {
    const u = mats[i].uniforms;
    for (const key of ['uTop', 'uHor', 'uGlow', 'uDisc', 'uNear', 'uFar', 'uSunDir']) u[key].value.copy(U[key].value);
    for (const key of ['uLit', 'uGain', 'uDiscSize']) u[key].value = U[key].value;
  }
}
