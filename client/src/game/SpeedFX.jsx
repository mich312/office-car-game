// Boost "juice": radial zoom-blur + anime speed-line vignette, driven by the
// local car's telemetry. One merged effect pass — near-free when idle.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Effect } from 'postprocessing';
import { Uniform } from 'three';
import { telemetry } from './LocalCar.jsx';

const frag = /* glsl */ `
  uniform float uStrength;
  uniform float uTime;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 color = inputColor;
    if (uStrength > 0.003) {
      vec2 dir = uv - 0.5;
      float d = length(dir);
      // radial zoom blur: a few taps toward screen center, stronger at edges
      vec4 acc = color;
      for (int i = 1; i <= 4; i++) {
        vec2 offs = dir * (float(i) * 0.022 * uStrength * d);
        acc += texture2D(inputBuffer, uv - offs);
      }
      color = acc / 5.0;
      // flickering anime speed lines, edges only
      float a = atan(dir.y, dir.x);
      float streak = hash(floor(a * 70.0) + floor(uTime * 24.0) * 7.0);
      float mask = smoothstep(0.32, 0.72, d) * step(0.86, streak);
      color.rgb = mix(color.rgb, vec3(1.0), mask * uStrength * 0.45);
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
      ]),
    });
  }
}

export default function SpeedFX() {
  const effect = useMemo(() => new SpeedFXImpl(), []);
  useFrame((_, dt) => {
    const target = telemetry.boosting ? 1 : 0;
    const u = effect.uniforms.get('uStrength');
    u.value += (target - u.value) * Math.min(1, dt * (target > u.value ? 7 : 4));
    effect.uniforms.get('uTime').value += dt;
  });
  return <primitive object={effect} />;
}
