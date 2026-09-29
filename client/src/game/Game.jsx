import { useEffect, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { GRAVITY, MUTATORS } from '@rc/shared';
import { useStore } from '../store.js';
import { connect, disconnect } from '../net.js';
import { audio } from '../audio.js';
import Lighting from './Lighting.jsx';
import { EventLightRig } from './eventLight.jsx';
import Office from './Office.jsx';
import Props from './Props.jsx';
import LocalCar from './LocalCar.jsx';
import RemoteCars, { rivalAudio } from './RemoteCars.jsx';
import ModeObjects from './ModeObjects.jsx';
import OfficeEvents from './OfficeEvents.jsx';
import Emotes from './Emotes.jsx';
import SpectatorCam, { PhotoOrbitCam } from './SpectatorCam.jsx';
import ControllerHUD from './ControllerHUD.jsx';
import OfficeBoard from './OfficeBoard.jsx';
import Effects from './Effects.jsx';

// Low-effects mode for weak GPUs (and CI): ?lowfx disables shadows + post.
const LOWFX = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lowfx');
// The diegetic RC-transmitter cluster replaces the flat speed/boost HUD on
// fine-pointer devices; phones keep the DOM cluster (screen space is scarce
// behind the touch controls).
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

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
    // programs: a count that jumps mid-match means a recompile hitch
    window.__glStats = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length };
    gl.info.reset();
  }, LOWFX ? 0 : 100);
  return null;
}

// The ears ride with the camera (chase, spectator drone or photo orbit alike),
// and the nearest rivals get engine voices. Default priority: a positive one
// would take over rendering (see Stats above).
function RivalAudio() {
  useFrame(({ camera }) => {
    audio.setListener(camera);
    audio.updateRivals([...rivalAudio.values()]);
  });
  useEffect(() => () => audio.silenceRivals(), []);
  return null;
}

export default function Game() {
  const muted = useStore((s) => s.muted);
  const mutator = useStore((s) => s.mutator);
  const mapId = useStore((s) => s.mapId);
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
      shadows={!LOWFX}
      dpr={LOWFX ? [0.75, 1] : [1, 1.5]}
      camera={{ position: [-70, 14, -25], fov: 60, near: 0.1, far: 900 }}
      gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <Stats />
      <color attach="background" args={['#0b0f1c']} />
      <fog attach="fog" args={['#141a2a', 170, 420]} />
      <Suspense fallback={null}>
        <Lighting />
        <EventLightRig />
        <Physics gravity={[0, gravity, 0]} timeStep={1 / 60} maxCcdSubsteps={2}>
          <Office />
          <Props key={`props-${mapId}`} />
          <LocalCar />
          <RemoteCars />
          <ModeObjects key={`mode-${mapId}`} />
        </Physics>
        <OfficeEvents />
        <OfficeBoard />
        <Emotes />
        <SpectatorCam />
        <RivalAudio />
        <PhotoOrbitCam />
        {FINE_POINTER && <ControllerHUD />}
        {!LOWFX && <Effects />}
      </Suspense>
    </Canvas>
  );
}
