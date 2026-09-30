// Boost "juice": radial zoom-blur + anime speed-line vignette, driven by the
// local car's telemetry. One merged effect pass — near-free when idle.
//
// The car itself stays sharp: the close chase lens puts it big in the lower
// middle of the frame, right where a zoom blur about the screen centre would
// smear it by ~30 px. Both the blur and the streaks fade out over the car's
// projected footprint (uCar, uClear), so the room streams past a crisp car.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Effect } from 'postprocessing';
import { Uniform, Vector2, Vector3 } from 'three';
import { telemetry } from './LocalCar.jsx';
import { carView } from './carView.js';

const frag = /* glsl */ `
  uniform float uStrength;
  uniform float uTime;
  uniform vec2 uCar;     // the car's centre on screen (uv)
  uniform float uClear;  // its radius on screen (uv height units)
  uniform float uAspect;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 color = inputColor;
    if (uStrength > 0.003) {
      vec2 dir = uv - 0.5;
      float d = length(dir);
      // 0 over the car, 1 clear of it
      vec2 dc = (uv - uCar) * vec2(uAspect, 1.0);
      float clear = smoothstep(uClear, uClear * 1.6 + 0.04, length(dc));
      float s = uStrength * clear;
      // radial zoom blur: a few taps toward screen center, stronger at edges
      vec4 acc = color;
      for (int i = 1; i <= 4; i++) {
        vec2 offs = dir * (float(i) * 0.022 * s * d);
        acc += texture2D(inputBuffer, uv - offs);
      }
      color = acc / 5.0;
      // flickering anime speed lines, edges only
      float a = atan(dir.y, dir.x);
      float streak = hash(floor(a * 70.0) + floor(uTime * 24.0) * 7.0);
      float mask = smoothstep(0.32, 0.72, d) * step(0.86, streak);
      color.rgb = mix(color.rgb, vec3(1.0), mask * s * 0.45);
    }
    outputColor = color;
  }
`;

class SpeedFXImpl extends Effect {
  constructor() {
    super('SpeedFX', frag, {
      uniforms: new Map([
        ['uStrength', new Uniform(0)],
        ['uTime', new Uniform(0)],
        ['uCar', new Uniform(new Vector2(0.5, 0.26))],
        ['uClear', new Uniform(0.12)],
        ['uAspect', new Uniform(16 / 9)],
      ]),
    });
  }
}

const _c = new Vector3(), _e = new Vector3(), _r = new Vector3();

export default function SpeedFX() {
  const effect = useMemo(() => new SpeedFXImpl(), []);
  useFrame(({ camera, size }, dt) => {
    const target = telemetry.boosting ? 1 : 0;
    const u = effect.uniforms.get('uStrength');
    u.value += (target - u.value) * Math.min(1, dt * (target > u.value ? 7 : 4));
    effect.uniforms.get('uTime').value += dt;
    if (u.value <= 0.003) return;
    // where the car is on screen, and how big: its centre, and a point half a
    // car length off to the side along the lens's right
    _c.set(carView.x, carView.y, carView.z);
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    _e.copy(_c).addScaledVector(_r, 0.6).project(camera);
    _c.project(camera);
    const aspect = size.width / Math.max(1, size.height);
    effect.uniforms.get('uAspect').value = aspect;
    if (_c.z < 1) {
      effect.uniforms.get('uCar').value.set(_c.x * 0.5 + 0.5, _c.y * 0.5 + 0.5);
      effect.uniforms.get('uClear').value = Math.min(0.4, Math.hypot((_e.x - _c.x) * 0.5 * aspect, (_e.y - _c.y) * 0.5));
    } else {
      effect.uniforms.get('uClear').value = 0; // behind the lens: nothing to keep clear
    }
  });
  return <primitive object={effect} />;
}
