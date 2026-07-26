// Post-processing: ambient occlusion, bloom, boost speed-FX, vignette + SMAA.
// Bloom is the one effect that has to know the hour: golden hour wants a low
// threshold so the window bands and every chrome edge catch, while midday would
// blow out at the same setting.
import { EffectComposer, Bloom, Vignette, SMAA, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import SpeedFX from './SpeedFX.jsx';
import { useStore } from '../store.js';
import { lightingFor } from './daylight.js';

export default function Effects() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const { bloom } = lightingFor(hour, event?.id === 'lights_out');
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={2.2} intensity={2.4} distanceFalloff={1.6} quality="performance" halfRes />
      <Bloom intensity={bloom.intensity} luminanceThreshold={bloom.threshold} luminanceSmoothing={0.2} mipmapBlur />
      <SpeedFX />
      <Vignette eskil={false} offset={0.22} darkness={0.72} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
