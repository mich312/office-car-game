// The colour grade: what the frame looks like after the tone curve.
//
// Contrast, saturation, a split tone, a vignette and film grain — one effect,
// merged by postprocessing into the same full-screen pass as bloom, the speed
// FX and the ACES curve (Effects.jsx), so the whole grade costs a few ALU ops
// per pixel and no extra pass.
//
// It works in perceptual space (gamma 2.2 over the tone-mapped linear image),
// because that is where "contrast" means what an eye means by it: pivoting
// round linear 0.5 would crush every shadow in the room.
//
// The split tone is the Firewatch half of the look: shadows lean to the
// hour's sky colour, highlights to its sun, keyed on luminance. The tints are
// normalised to mid-grey, so a tint moves hue and leaves brightness alone —
// an authored '#2c3c7c' reads as "blue shade", not "darker". `lift` lets the
// shadow tint into the blacks, so a night room bottoms out at deep blue
// instead of the void.
//
// The vignette is rounded and centred a little below the middle of the frame
// — on the car, not the ceiling — which also keeps the bottom corners (where
// the diegetic transmitter sits) lighter than the top ones.
//
// Every number comes from the hour (daylight.js `grade`) and is lerped here
// like every other light, so `N` cross-fades the grade with the sun.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Effect } from 'postprocessing';
import { Uniform, Color, Vector2 } from 'three';

const frag = /* glsl */`
  uniform float uContrast;
  uniform float uSat;
  uniform vec3 uShadow;
  uniform vec3 uHigh;
  uniform float uSplit;
  uniform float uLift;
  uniform float uVignette;
  uniform vec2 uVigCenter;
  uniform float uGrain;

  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

  float gradeHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 p = pow(clamp(inputColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
    // contrast round perceptual mid-grey
    p = clamp((p - 0.46) * uContrast + 0.46, 0.0, 1.0);
    float l = dot(p, LUMA);
    // saturation
    p = max(mix(vec3(l), p, uSat), 0.0);
    // split tone: luminance-keyed tints whose own luma is 1
    float wS = 1.0 - smoothstep(0.04, 0.55, l);
    float wH = smoothstep(0.42, 0.95, l);
    p *= mix(vec3(1.0), uShadow * 2.0, uSplit * wS) * mix(vec3(1.0), uHigh * 2.0, uSplit * wH);
    p += uShadow * (2.0 * uLift) * (1.0 - l) * (1.0 - l) * (1.0 - l);
    // vignette
    vec2 d = (uv - uVigCenter) * vec2(aspect, 1.0);
    float r = length(d) / (0.5 * length(vec2(aspect, 1.0)));
    p *= 1.0 - uVignette * smoothstep(0.3, 1.25, r);
    // grain, strongest in the mid-tones (film has none in paper-white or
    // in black, and a noisy black reads as a broken screen)
    float n = gradeHash(uv * resolution + fract(time * 7.13) * 317.0) - 0.5;
    p += n * uGrain * max(0.0, 1.0 - abs(l - 0.45) * 1.8);
    outputColor = vec4(pow(clamp(p, 0.0, 1.0), vec3(2.2)), inputColor.a);
  }
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', frag, {
      uniforms: new Map([
        ['uContrast', new Uniform(1)], ['uSat', new Uniform(1)],
        ['uShadow', new Uniform(new Color(0.5, 0.5, 0.5))], ['uHigh', new Uniform(new Color(0.5, 0.5, 0.5))],
        ['uSplit', new Uniform(0)], ['uLift', new Uniform(0)],
        ['uVignette', new Uniform(0)], ['uVigCenter', new Uniform(new Vector2(0.5, 0.44))],
        ['uGrain', new Uniform(0)],
      ]),
    });
  }
}

// a tint colour, normalised so its luma is mid-grey (0.5 = neutral). In
// sRGB terms, like the grade itself: a linear-space tint of a dark blue is
// several times bluer than the swatch it was picked from.
const LUMA = [0.2126, 0.7152, 0.0722];
const _c = new Color();
const tint = (hex) => {
  _c.set(hex).convertLinearToSRGB();
  const l = _c.r * LUMA[0] + _c.g * LUMA[1] + _c.b * LUMA[2];
  return _c.multiplyScalar(0.5 / Math.max(0.02, l));
};

// → a GradeEffect that follows `read()` (a daylight.js state) every frame.
// `grain: false` drops the grain (medium quality).
export function useGrade(read, { grain = true } = {}) {
  const effect = useMemo(() => new GradeEffect(), []);
  useFrame((_, dt) => {
    const g = read().grade;
    const U = effect.uniforms;
    const k = Math.min(1, dt * 1.8);
    const lerp = (name, v) => { const u = U.get(name); u.value += (v - u.value) * k; };
    lerp('uContrast', g.contrast);
    lerp('uSat', g.sat);
    lerp('uSplit', g.split);
    lerp('uLift', g.lift);
    lerp('uVignette', g.vignette);
    lerp('uGrain', grain ? g.grain : 0);
    U.get('uShadow').value.lerp(tint(g.shadow), k);
    U.get('uHigh').value.lerp(tint(g.high), k);
  });
  return effect;
}
