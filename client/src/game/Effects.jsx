// Post-processing: ambient occlusion, bloom, boost speed-FX, vignette + SMAA.
import { EffectComposer, Bloom, Vignette, SMAA, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import SpeedFX from './SpeedFX.jsx';

export default function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={2.2} intensity={2.4} distanceFalloff={1.6} quality="performance" halfRes />
      <Bloom intensity={0.55} luminanceThreshold={0.82} luminanceSmoothing={0.2} mipmapBlur />
      <SpeedFX />
      <Vignette eskil={false} offset={0.22} darkness={0.72} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
