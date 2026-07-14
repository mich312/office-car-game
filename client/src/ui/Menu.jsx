// Main menu: garage with a live 3D car preview (with depth of field, as the
// spec demands), stats, paint unlocks, and the Play button.
import { useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField, Vignette } from '@react-three/postprocessing';
import { CARS, CAR_IDS, UNLOCKS } from '@rc/shared';
import { useStore } from '../store.js';
import { audio } from '../audio.js';
import CarModel from '../game/CarModel.jsx';

export default function Menu() {
  const store = useStore();
  const [carIdx, setCarIdx] = useState(Math.max(0, CAR_IDS.indexOf(store.car)));
  const carId = CAR_IDS[carIdx];
  const car = CARS[carId];
  const unlocked = store.unlocked();
  const paints = unlocked.filter((u) => u.type === 'paint');
  const nextUnlock = UNLOCKS.find((u) => u.xp > store.xp);

  const pick = (d) => {
    const i = (carIdx + d + CAR_IDS.length) % CAR_IDS.length;
    setCarIdx(i);
    useStore.setState({ car: CAR_IDS[i] });
    audio.blip(520 + i * 60, 0.06);
  };

  const play = () => {
    audio.start();
    audio.blip(880, 0.1);
    const name = store.name.trim() || `Intern${(Math.random() * 99) | 0}`;
    useStore.setState({ name, screen: 'game' });
    useStore.getState().save();
  };

  return (
    <div className="menu">
      <div className="menu-bg" />
      <header className="menu-title">
        <h1>TINY <span>RC</span> MAYHEM</h1>
        <p>2–12 players · one giant office · after hours</p>
      </header>

      <div className="menu-grid">
        <section className="garage panel">
          <div className="garage-view">
            <Canvas dpr={[1, 2]} camera={{ position: [1.7, 0.9, 2.1], fov: 36 }} gl={{ antialias: true }}>
              <color attach="background" args={['#101322']} />
              <Suspense fallback={null}>
                <Environment resolution={64} frames={1}>
                  <color attach="background" args={['#1a2136']} />
                  <Lightformer form="rect" intensity={5} color="#dfe8ff" position={[0, 4, -6]} scale={[12, 4, 1]} />
                  <Lightformer form="rect" intensity={3} color="#ffd9a8" position={[5, 3, 3]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
                  <Lightformer form="circle" intensity={4} color="#b085ff" position={[-4, 4, 2]} scale={3} />
                </Environment>
                <ambientLight intensity={0.4} />
                <directionalLight position={[4, 6, 3]} intensity={2.4} color="#fff2dd" />
                <pointLight position={[-3, 2, -2]} intensity={12} color="#6a8bff" />
                <Turntable>
                  <CarModel carId={carId} paint={store.paint} isLocal />
                </Turntable>
                <ContactShadows position={[0, -0.28, 0]} opacity={0.7} blur={2.2} scale={6} />
                <EffectComposer>
                  <DepthOfField focusDistance={0.025} focalLength={0.06} bokehScale={4} />
                  <Bloom intensity={0.7} luminanceThreshold={0.8} mipmapBlur />
                  <Vignette darkness={0.6} />
                </EffectComposer>
              </Suspense>
            </Canvas>
            <button className="arrow left" onClick={() => pick(-1)}>‹</button>
            <button className="arrow right" onClick={() => pick(1)}>›</button>
          </div>
          <h2>{car.name}</h2>
          <p className="car-desc">{car.desc}</p>
          <div className="stats">
            <Stat label="Speed" v={car.topSpeed / 30} />
            <Stat label="Accel" v={car.accel / 24} />
            <Stat label="Handling" v={car.handling / 2.9} />
            <Stat label="Drift" v={1 - car.drift / 0.6} />
            <Stat label="Boost" v={car.boost / 21} />
          </div>
          <div className="paints">
            {paints.map((p) => (
              <button
                key={p.value}
                className={`swatch ${store.paint === p.value ? 'sel' : ''}`}
                style={{ background: p.value }}
                title={p.name}
                onClick={() => { useStore.setState({ paint: p.value }); audio.blip(700, 0.05); }}
              />
            ))}
            <button className={`swatch none ${!store.paint ? 'sel' : ''}`} title="Stock paint"
              onClick={() => useStore.setState({ paint: null })}>✕</button>
          </div>
        </section>

        <section className="panel join">
          <label>DRIVER NAME</label>
          <input
            value={store.name}
            maxLength={16}
            placeholder="Intern"
            onChange={(e) => useStore.setState({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && play()}
          />
          <button className="play" onClick={play}>ENTER THE OFFICE</button>
          <p className="hint">Playing solo? Bots will fill the lobby.</p>

          <div className="xp">
            <div className="xp-row"><span>Career XP</span><b>{store.xp}</b></div>
            {nextUnlock && (
              <div className="xp-bar">
                <div style={{ width: `${Math.min(100, (store.xp / nextUnlock.xp) * 100)}%` }} />
                <span>next: {nextUnlock.name} @ {nextUnlock.xp} XP</span>
              </div>
            )}
          </div>

          <div className="controls-help">
            <h3>CONTROLS</h3>
            <div><kbd>WASD</kbd> drive</div>
            <div><kbd>SHIFT</kbd> drift</div>
            <div><kbd>B/CTRL</kbd> boost</div>
            <div><kbd>SPACE</kbd> jump / double jump</div>
            <div><kbd>E</kbd>/<kbd>CLICK</kbd> use powerup</div>
            <div><kbd>R</kbd> respawn · <kbd>N</kbd> day/night</div>
            <div><kbd>TAB</kbd> scoreboard · <kbd>M</kbd> mute</div>
          </div>
        </section>
      </div>
      <footer className="menu-foot">Every mug, chair, marble and monitor is physical. Be the chaos.</footer>
    </div>
  );
}

function Turntable({ children }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.5;
  });
  return <group ref={ref} position={[0, -0.1, 0]} scale={1.4}>{children}</group>;
}

function Stat({ label, v }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <div className="bar"><div style={{ width: `${Math.round(Math.min(1, v) * 100)}%` }} /></div>
    </div>
  );
}
