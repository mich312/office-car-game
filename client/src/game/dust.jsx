// Floating dust, as drei's Sparkles — with its own shaders but a glow that
// can't blow up (every floor's dust uses this, never Sparkles bare).
import { useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

// drei's Sparkles, with its own shaders but a glow that can't blow up: theirs
// is 0.05 / (distance to the sprite's centre), so a pixel landing right on a
// mote wrote an infinite alpha into the half-float frame, and bloom smeared
// it over the whole screen — about every other aerial frame came out black.
const DUST_VERT = /* glsl */`
  uniform float pixelRatio;
  uniform float time;
  attribute float size;
  attribute float speed;
  attribute float opacity;
  attribute vec3 noise;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vec4 p = modelMatrix * vec4(position, 1.0);
    p.y += sin(time * speed + p.x * noise.x * 100.0) * 0.2;
    p.z += cos(time * speed + p.x * noise.y * 100.0) * 0.2;
    p.x += cos(time * speed + p.x * noise.z * 100.0) * 0.2;
    vec4 v = viewMatrix * p;
    gl_Position = projectionMatrix * v;
    gl_PointSize = size * 25.0 * pixelRatio / max(-v.z, 0.1);
    vColor = color;
    vOpacity = opacity;
  }
`;
const DUST_FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float strength = clamp(0.05 / max(d, 0.04) - 0.1, 0.0, 1.0);
    gl_FragColor = vec4(vColor, strength * vOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function Dust(props) {
  const dpr = useThree((s) => s.viewport.dpr);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  material.uniforms.pixelRatio.value = dpr;
  useFrame(({ clock }) => { material.uniforms.time.value = clock.elapsedTime; });
  return (
    <Sparkles {...props}>
      <primitive object={material} attach="material" />
    </Sparkles>
  );
}
