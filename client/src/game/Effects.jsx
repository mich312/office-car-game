// Post-processing: AO → far depth of field → bloom → boost speed-FX →
// exposure + ACES → grade → SMAA.
//
// Order matters, and so does grouping. Every effect between the AO pass and
// SMAA is a plain (non-convolution) effect, so @react-three/postprocessing
// merges them into ONE full-screen pass: the depth blur, bloom's composite,
// the speed lines, the tone curve and the whole grade are a single shader.
// The old chain ran tone mapping as its own pass after SMAA (anti-aliasing
// an HDR image, which is the wrong order — edges were found before the
// curve moved them); merging it in pays for the depth blur's half-res
// passes, so the chain costs about what it did.
//
//   N8AO         contact darkening, tuned for a camera a couple of car
//                lengths off a 1-unit car; tinted, so shade is violet-blue
//                rather than grey
//   FarBlur      the room past the car goes soft (FarBlur.jsx), high only
//   Bloom        above lit-diffuse white: only emissives, practicals, the
//                sky and the sun's glints bloom — the first version bloomed
//                every sunlit wall into milky haze
//   SpeedFX      the boost zoom-blur, in HDR where it has always sat
//   ToneMapping  ACES. Exposure is the renderer's toneMappingExposure, set by
//                the hour in Lighting.jsx — the ?lowfx renderer's own ACES
//                reads the same number, so both paths agree
//   Grade        contrast, saturation, split tone, vignette, grain (Grade.jsx)
//   SMAA         last, on the finished LDR image
//
// Quality (quality.js): high is all of it; medium drops the depth blur and
// the grain; low is the ?lowfx path — no composer at all (Game.jsx), the
// renderer's ACES and exposure only.
//
// Nothing here subscribes to the hour: a re-render rebuilds the composer's
// passes, so the hour-driven numbers are lerped in frame loops instead.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, SMAA, N8AO } from '@react-three/postprocessing';
import { BloomEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import SpeedFX from './SpeedFX.jsx';
import { useStore } from '../store.js';
import { lightingFor } from './daylight.js';
import { currentMap } from './activeMap.js';
import { useGrade } from './Grade.jsx';
import { useFarBlur } from './FarBlur.jsx';
import { useGfx } from './quality.js';

// the lighting state right now — for frame loops
const now = () => {
  const st = useStore.getState();
  return lightingFor(st.timeOfDay, st.event?.id === 'lights_out', currentMap());
};

// The depth blur is for the chase camera, where the car is the subject. Photo
// mode's establishing sweep and the spectator drone look at the whole floor;
// tooling that parks a lens behind the car can ask for it (__rcCamOverride.dof).
const dofWanted = () => {
  const st = useStore.getState();
  if (st.spectating) return false;
  if (st.photoMode) return !!(typeof window !== 'undefined' && window.__rcCamOverride?.dof);
  return true;
};

function useBloom() {
  const bloom = useMemo(() => new BloomEffect({
    mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.3, intensity: 0.8, radius: 0.8, levels: 7,
  }), []);
  useFrame((_, dt) => {
    const b = now().bloom;
    const k = Math.min(1, dt * 1.8);
    bloom.intensity += (b.intensity - bloom.intensity) * k;
    const L = bloom.luminanceMaterial;
    L.threshold += (b.threshold - L.threshold) * k;
  });
  return bloom;
}

export default function Effects() {
  const gfx = useGfx();
  const high = gfx === 'high';
  const bloom = useBloom();
  const tone = useMemo(() => new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), []);
  const grade = useGrade(now, { grain: high });
  const farBlur = useFarBlur(() => high && dofWanted());
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={1.1} intensity={3} distanceFalloff={1} color="#1d1830" quality="performance" halfRes />
      {high && <primitive object={farBlur} />}
      <primitive object={bloom} />
      <SpeedFX />
      <primitive object={tone} />
      <primitive object={grade} />
      <SMAA />
    </EffectComposer>
  );
}
