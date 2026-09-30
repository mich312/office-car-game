// Sunbeams through the glass: the light you see in the air, and the dust
// that makes it visible.
//
// The sun on the floor is real (the directional light, through the glass —
// the ceiling casts). What a real room adds is the light *in the air*: hazy
// sheets from each window bay, slanting down toward the floor. These are
// additive sheets whose shape comes from the sun itself — each one runs from
// the top of the glass along the light's direction until it meets the floor,
// so a low golden sun lays them almost flat across the room and a high one
// drops them steeply by the windows. They swing with the hour because the
// sun does.
//
// The first version was five fixed cards, and from 20 cm up — the only
// place anyone ever sees them from — an edge-on card is a glowing vertical
// bar. So each sheet fades:
//   · as it turns edge-on to the camera (a thin sheet of haze seen edge-on
//     is invisible, not brighter)
//   · close to the camera (driving through a beam is a glow, not a wall)
//   · toward car height (nothing bright standing on the floor)
// and a soft patch on the floor where the beam lands ties it down, carrying
// the glow past the edge of the sun's shadow box.
//
// Dust (dust.jsx's bounded glow, so it can't blow up) hangs only inside the
// beams, tinted by the beam: it glitters in golden light and is gone when
// the sun is.
//
// One draw for every sheet and patch, one for the dust. No lights.
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DUST_GLOW } from './dust.jsx';

// the beam: a point on the sheet from the top of bay `bay` (x centre, half
// width) at across-bay u ∈ [−1, 1] and along-beam v ∈ [0, 1]
const BEAM = /* glsl */`
  uniform vec3 uDir;     // the light's travel direction
  uniform vec3 uWin;     // glass plane z, top of the glass y, longest beam
  float beamLen() { return min(uWin.y / max(-uDir.y, 0.03), uWin.z); }
  vec3 beamTop(vec2 bay, float u) { return vec3(bay.x + u * bay.y, uWin.y, uWin.x); }
`;

const sheetVert = /* glsl */`
  ${BEAM}
  attribute vec3 aBay;   // x centre, half width, kind (0 sheet, 1 floor patch)
  attribute vec2 aUV;
  varying vec2 vUV;
  varying vec3 vW;
  varying float vKind;
  varying vec3 vN;
  void main() {
    float t = beamLen();
    vec3 top = beamTop(aBay.xy, aUV.x);
    vec3 p;
    if (aBay.z < 0.5) {
      p = top + uDir * (aUV.y * t);
    } else {
      // the floor under the beam: from the foot of the glass to where the
      // ray over the top of the glass lands
      vec3 land = top + uDir * t;
      p = mix(vec3(top.x, 0.0, top.z), vec3(land.x, 0.0, land.z), aUV.y);
      p.y = 0.035;
    }
    vUV = aUV;
    vKind = aBay.z;
    vN = normalize(cross(vec3(1.0, 0.0, 0.0), uDir));
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const sheetFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uUnit;   // world units per metre
  varying vec2 vUV;
  varying vec3 vW;
  varying float vKind;
  varying vec3 vN;
  void main() {
    float edge = smoothstep(1.0, 0.55, abs(vUV.x));
    // mullions and blinds: soft stripes across each bay
    float slats = 0.72 + 0.28 * sin(vUV.x * 9.4 + 0.6);
    float a;
    if (vKind < 0.5) {
      vec3 toCam = cameraPosition - vW;
      float facing = abs(dot(normalize(toCam), vN));
      a = edge * slats
        * smoothstep(0.0, 0.1, vUV.y) * (1.0 - smoothstep(0.45, 1.0, vUV.y)) // out of the glass, gone before the floor
        * smoothstep(0.06, 0.4, facing)                                      // edge-on: nothing
        * smoothstep(0.35 * uUnit, 1.6 * uUnit, length(toCam))               // in your face: nothing
        * smoothstep(0.12 * uUnit, 0.7 * uUnit, vW.y);                       // no bars at car height
    } else {
      a = edge * slats * 0.55 * smoothstep(0.0, 0.12, vUV.y) * (1.0 - smoothstep(0.6, 1.0, vUV.y));
    }
    a *= uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const dustVert = /* glsl */`
  ${BEAM}
  uniform float uTime;
  uniform float pixelRatio;
  attribute vec2 aBay;
  attribute vec4 aSeed;  // u, v, height fraction, speed
  varying float vFade;
  void main() {
    float t = beamLen();
    // drift slowly down the beam and wrap; bob a little
    float v = fract(aSeed.y + uTime * aSeed.w * 0.015);
    vec3 p = beamTop(aBay, aSeed.x) + uDir * (v * t);
    p.y *= aSeed.z; // somewhere in the wedge of lit air under the sheet
    p.x += sin(uTime * 0.37 + aSeed.w * 40.0) * 0.12;
    p.y += sin(uTime * 0.51 + aSeed.x * 17.0) * 0.1;
    vFade = smoothstep(0.0, 0.1, v) * (1.0 - smoothstep(0.7, 1.0, v)) * (0.55 + 0.45 * sin(uTime * (1.3 + aSeed.w) + aSeed.x * 30.0));
    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 1.3 * 25.0 * pixelRatio / max(-mv.z, 0.1);
  }
`;

const dustFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  ${DUST_GLOW}
  void main() {
    float a = dustGlow(gl_PointCoord) * vFade * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * 1.6, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// bays: [[xCentre, width], …] metres; glass: { z, top } metres
export default function SunShafts({ light, bays, glass, M, maxLen = 16, motes = 26 }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const shared = useMemo(() => ({
    uDir: { value: new THREE.Vector3(0.5, -0.2, -0.8).normalize() },
    uWin: { value: new THREE.Vector3(glass.z * M, glass.top * M, maxLen * M) },
    uColor: { value: new THREE.Color('#ffb266') },
    uOpacity: { value: 0 },
    uUnit: { value: M },
  }), [glass, M, maxLen]);

  const sheets = useMemo(() => {
    const bay = [], uv = [], idx = [];
    for (const kind of [0, 1]) {
      for (const [x, w] of bays) {
        const b = bay.length / 3;
        for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { bay.push(x * M, (w / 2) * M, kind); uv.push(u, v); }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    // positions are made in the vertex shader; this only sizes the draw
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(bay.length), 3));
    g.setAttribute('aBay', new THREE.Float32BufferAttribute(bay, 3));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: sheetVert, fragmentShader: sheetFrag, uniforms: shared,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    return { g, mat };
  }, [bays, M, shared]);

  const dust = useMemo(() => {
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = bays.length * motes;
    const bay = new Float32Array(n * 2), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const [x, w] = bays[Math.floor(i / motes)];
      bay[i * 2] = x * M; bay[i * 2 + 1] = (w / 2) * M;
      seed.set([(r() * 2 - 1) * 0.8, r(), 0.15 + r() * 0.8, 0.5 + r()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aBay', new THREE.Float32BufferAttribute(bay, 2));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      vertexShader: dustVert, fragmentShader: dustFrag,
      uniforms: { ...shared, uTime: { value: 0 }, pixelRatio: { value: 1 } },
      transparent: true, depthWrite: false, fog: false,
    });
    return { g, mat };
  }, [bays, M, motes, shared]);

  const tmp = useMemo(() => ({ v: new THREE.Vector3(), c: new THREE.Color() }), []);
  useFrame(({ clock }, dt) => {
    const L = light();
    const k = Math.min(1, dt * 1.8);
    // travel direction = away from the sun; no beams through a north wall
    // when the sun is south of it
    tmp.v.set(-L.sun.pos[0], -L.sun.pos[1], -L.sun.pos[2]).normalize();
    shared.uDir.value.lerp(tmp.v, k).normalize();
    const through = THREE.MathUtils.smoothstep(-shared.uDir.value.z, 0.05, 0.2);
    shared.uOpacity.value += (L.shaft.opacity * through - shared.uOpacity.value) * k;
    shared.uColor.value.lerp(tmp.c.set(L.shaft.color), k);
    dust.mat.uniforms.uTime.value = clock.elapsedTime;
    dust.mat.uniforms.pixelRatio.value = dpr;
  });

  return (
    <group>
      <mesh geometry={sheets.g} material={sheets.mat} frustumCulled={false} renderOrder={3} />
      <points geometry={dust.g} material={dust.mat} frustumCulled={false} renderOrder={4} />
    </group>
  );
}
