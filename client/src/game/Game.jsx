import { useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { GRAVITY } from '@rc/shared';
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
import Effects from './Effects.jsx';

// Low-effects mode for weak GPUs (and CI): ?lowfx disables shadows + post.
const LOWFX = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lowfx');

export default function Game() {
  const muted = useStore((s) => s.muted);

  useEffect(() => {
    connect();
    audio.start();
    return () => disconnect();
  }, []);

  useEffect(() => { audio.setMuted(muted); }, [muted]);

  return (
    <Canvas
      shadows={!LOWFX}
      dpr={LOWFX ? [0.75, 1] : [1, 1.75]}
      camera={{ position: [-70, 14, -25], fov: 60, near: 0.1, far: 900 }}
      gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <color attach="background" args={['#0b0f1c']} />
      <fog attach="fog" args={['#141a2a', 220, 520]} />
      <Suspense fallback={null}>
        <Lighting />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} maxCcdSubsteps={2}>
          <Office />
          <Props />
          <LocalCar />
          <RemoteCars />
          <ModeObjects />
        </Physics>
        <OfficeEvents />
        {!LOWFX && <Effects />}
      </Suspense>
    </Canvas>
  );
}
