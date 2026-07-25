import { useEffect, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { GRAVITY, MUTATORS } from '@rc/shared';
import { useStore } from '../store.js';
import { connect, disconnect } from '../net.js';
import { audio } from '../audio.js';
import Lighting from './Lighting.jsx';
import Office from './Office.jsx';
import Props from './Props.jsx';
import LocalCar from './LocalCar.jsx';
import RemoteCars from './RemoteCars.jsx';
import ModeObjects from './ModeObjects.jsx';
import OfficeEvents from './OfficeEvents.jsx';
import Emotes from './Emotes.jsx';
import SpectatorCam, { PhotoOrbitCam } from './SpectatorCam.jsx';
import Effects from './Effects.jsx';
import { FLAGS, isSoftwareRenderer } from './flags.js';

// Low-effects mode for weak GPUs (and CI): ?lowfx disables shadows + post.
// Everything else in FLAGS is a measurement knob — see flags.js.
//
// Software rasterisers take the same path automatically. Chrome falls back to
// SwiftShader silently when there is no usable GPU, and measured on that path
// the full stack runs at 0.72 fps (1383 ms/frame) — those players were being
// served ambient occlusion they could not afford and had no way to switch off.
// `?forcefx` overrides, for when you want to measure the full stack in
// software on purpose, which is exactly how the numbers above were taken.
const SOFTWARE = !FLAGS.forcefx && isSoftwareRenderer();
const LOWFX = FLAGS.lowfx || SOFTWARE;

// Renderer stats hook for perf testing: accumulate across all passes in a
// frame (autoReset off), publish at end of frame, reset manually.
// NB: a positive-priority useFrame disables R3F auto-render, which is only
// safe when the EffectComposer drives rendering — so lowfx reads live counters.
function Stats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (LOWFX) window.__glInfo = () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles });
    else gl.info.autoReset = false;
  }, [gl]);
  useFrame(LOWFX ? () => {} : () => {
    window.__glStats = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
  }, LOWFX ? 0 : 100);
  return null;
}

export default function Game() {
  const muted = useStore((s) => s.muted);
  const mutator = useStore((s) => s.mutator);
  // Moon Gravity mutator: the whole physics world floats
  const gravity = mutator === 'moon_gravity' ? GRAVITY * MUTATORS.moon_gravity.gravity : GRAVITY;

  useEffect(() => {
    connect();
    audio.start();
    return () => disconnect();
  }, []);

  useEffect(() => { audio.setMuted(muted); }, [muted]);

  return (
    <Canvas
      shadows={!LOWFX && !FLAGS.noshadow}
      // Fill is the whole cost in software: same 787 draw calls measured
      // 633 ms at scale 1.0 and 117 ms at 0.35. Resolution, not geometry.
      dpr={FLAGS.scale ?? (SOFTWARE ? 0.35 : LOWFX ? [0.75, 1] : [1, 1.5])}
      camera={{ position: [-70, 14, -25], fov: 60, near: 0.1, far: 900 }}
      gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <Stats />
      <color attach="background" args={['#0b0f1c']} />
      <fog attach="fog" args={['#141a2a', 170, 420]} />
      <Suspense fallback={null}>
        <Lighting />
        <Physics gravity={[0, gravity, 0]} timeStep={1 / 60} maxCcdSubsteps={2}>
          <Office />
          <Props />
          <LocalCar />
          <RemoteCars />
          <ModeObjects />
        </Physics>
        <OfficeEvents />
        <Emotes />
        <SpectatorCam />
        <PhotoOrbitCam />
        {!LOWFX && <Effects />}
      </Suspense>
    </Canvas>
  );
}
