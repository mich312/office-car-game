// Post-processing: ambient occlusion, bloom, boost speed-FX, vignette + SMAA.
import { EffectComposer, Bloom, Vignette, SMAA, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { HalfFloatType } from 'three';
import SpeedFX from './SpeedFX.jsx';

export default function Effects() {
  return (
    // HDR buffer: the scene's emissives run well above 1.0 (headlights at 3.5,
    // ceiling panels at 2.2) and an 8-bit buffer clips them all to the same
    // white before bloom ever sees them. Costs bandwidth, not draw calls.
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType}>
      {/* aoRadius is in world units and M ≈ 4.44 units/metre — 0.9 is a 20 cm
          radius, i.e. contact darkening under wheels, mugs and castors rather
          than a half-metre wash. */}
      <N8AO aoRadius={0.9} intensity={3.2} distanceFalloff={1.2} quality="performance" halfRes />
      {/* Threshold is in HDR now, above the 1.0 a fully lit white floor
          reaches and below the emissives (tails 3, panels 2.2, heads 3.5), so
          lamps bloom and lit paint doesn't. Under the old LDR buffer every
          value was clipped at 1.0 and no threshold could tell them apart. */}
      <Bloom intensity={0.6} luminanceThreshold={1.05} luminanceSmoothing={0.3} mipmapBlur />
      <SpeedFX />
      <Vignette eskil={false} offset={0.22} darkness={0.72} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
