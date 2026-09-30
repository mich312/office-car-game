// Far-only depth of field: the room past your car goes soft, your car and
// the floor in front of it stay sharp. It is the cheapest "this car is 20 cm
// long" cue there is (a real camera that close to a toy can't hold the far
// wall in focus), and the one the art direction kept asking for.
//
// Not postprocessing's TiltShift: that masks a screen band with a hard step
// while its half-res blur never quite matches the sharp image, so a
// horizontal seam ran across every frame at the band's edge — and it knows
// nothing about depth, so a rival close by in the upper frame went soft and
// the far floor at the bottom stayed sharp. This one keys on depth: the blend
// toward a half-resolution Kawase blur of the frame ramps smoothly with
// distance past the focus (the chase camera's distance to the car), so there
// is no edge anywhere to see.
//
// Readability is a mechanic here (12 cars must stay findable), so the blur
// is capped: a small kernel at half resolution, a blend that never reaches
// 1, and it only starts a few car lengths past the car — a rival close
// enough to matter is still sharp.
//
// It sits first in the merged effect pass: its blurred copy is taken from the
// pass's input (the HDR frame after AO), so the blend happens in the same
// space, before bloom and the tone curve.
import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Effect, EffectAttribute, KawaseBlurPass, KernelSize, Resolution } from 'postprocessing';
import { Uniform, WebGLRenderTarget, Vector3 } from 'three';

const frag = /* glsl */`
  #ifdef FRAMEBUFFER_PRECISION_HIGH
    uniform mediump sampler2D map;
  #else
    uniform lowp sampler2D map;
  #endif
  uniform vec3 uFocus; // start of the blur, where it is full, how strong
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float t = uFocus.z * smoothstep(uFocus.x, uFocus.y, -getViewZ(depth));
    outputColor = t > 0.002 ? mix(inputColor, texture2D(map, uv), t) : inputColor;
  }
`;

export class FarBlurEffect extends Effect {
  constructor({ kernelSize = KernelSize.SMALL, resolutionScale = 0.5 } = {}) {
    super('FarBlurEffect', frag, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([['map', new Uniform(null)], ['uFocus', new Uniform(new Vector3(5, 30, 0))]]),
    });
    this.renderTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.renderTarget.texture.name = 'FarBlur.Target';
    this.uniforms.get('map').value = this.renderTarget.texture;
    this.blurPass = new KawaseBlurPass({ kernelSize, resolutionScale });
    const resolution = this.resolution = new Resolution(this, Resolution.AUTO_SIZE, Resolution.AUTO_SIZE, resolutionScale);
    resolution.addEventListener('change', () => this.setSize(resolution.baseWidth, resolution.baseHeight));
  }

  get strength() { return this.uniforms.get('uFocus').value.z; }

  // the blur is only rendered while it is visible
  update(renderer, inputBuffer) {
    if (this.strength > 0.002) this.blurPass.render(renderer, inputBuffer, this.renderTarget);
  }

  setSize(width, height) {
    const resolution = this.resolution;
    resolution.setBaseSize(width, height);
    this.renderTarget.setSize(resolution.width, resolution.height);
    this.blurPass.resolution.copy(resolution);
  }

  initialize(renderer, alpha, frameBufferType) {
    this.blurPass.initialize(renderer, alpha, frameBufferType);
    if (frameBufferType !== undefined) this.renderTarget.texture.type = frameBufferType;
  }

  dispose() {
    this.renderTarget.dispose();
    this.blurPass.dispose();
    super.dispose();
  }
}

// → a FarBlurEffect focused on the local car every frame. `enabled()` says
// whether the frame should have it at all (not in photo mode's establishing
// shots, the spectator drone or the plan view: there the car is not the
// subject). The focus is the chase camera's distance to the car
// (window.__rcTelemetry.camDist when the camera publishes it).
const MAX_BLEND = 0.8;
export function useFarBlur(enabled) {
  const effect = useMemo(() => new FarBlurEffect(), []);
  useEffect(() => () => effect.dispose(), [effect]);
  useFrame(({ camera }, dt) => {
    const f = effect.uniforms.get('uFocus').value;
    const t = typeof window !== 'undefined' ? window.__rcTelemetry : null;
    let focus = t?.camDist;
    if (!(focus > 0) && t) focus = Math.hypot(camera.position.x - t.x, camera.position.y - (t.y || 0), camera.position.z - t.z);
    if (!(focus > 0.5 && focus < 12)) focus = 2.3;
    // sharp to ~3 focus distances (a few car lengths past the car), soft by
    // ~20 — rooms away
    const want = enabled() ? MAX_BLEND : 0;
    const k = Math.min(1, dt * 3);
    f.x += (focus * 3.2 - f.x) * k;
    f.y += (focus * 20 - f.y) * k;
    f.z += (want - f.z) * Math.min(1, dt * 4);
  });
  return effect;
}
