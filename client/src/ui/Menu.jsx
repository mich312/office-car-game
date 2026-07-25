// The garage is a real 3D place: your RC car sits on a workbench desk under
// a lamp, surrounded by tools. Stats & tuning live on the bench monitor, the
// controls cheat-sheet on a propped clipboard, and a big red RACE button.
// Clicking the monitor or clipboard docks the camera onto it (focus mode) so
// the projected DOM is stable, straight and readable — Esc backs out.
import { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  CARS, CAR_IDS, UNLOCKS, PAINT_COLORS, ABILITIES,
  WHEEL_STYLES, WHEEL_IDS, SPOILER_STYLES, SPOILER_IDS,
  VINYL_STYLES, VINYL_IDS, VINYL_COLORS, GLOW_COLORS,
} from '@rc/shared';
import { useStore } from '../store.js';
import { audio } from '../audio.js';
import CarModel from '../game/CarModel.jsx';
import { woodTex } from '../game/textures.js';
import Icon from './Icon.jsx';

const play = () => {
  audio.start();
  audio.blip(880, 0.1);
  const store = useStore.getState();
  const name = store.name.trim() || `Intern${(Math.random() * 99) | 0}`;
  useStore.setState({ name, screen: 'game' });
  store.save();
};

export default function Menu() {
  const [focus, setFocus] = useState(null); // null | 'monitor' | 'clipboard'
  const xp = useStore((s) => s.xp);
  const nextUnlock = UNLOCKS.find((u) => u.xp > xp);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFocus(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="garage3d">
      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{ position: [0, 2.6, 5.2], fov: 42 }}
        gl={{ antialias: true }}
        onPointerMissed={() => setFocus(null)}
      >
        <color attach="background" args={['#0a0d18']} />
        <fog attach="fog" args={['#0a0d18', 9, 18]} />
        <Suspense fallback={null}>
          <GarageScene focus={focus} setFocus={setFocus} />
        </Suspense>
      </Canvas>

      <div className={`garage-overlay ${focus ? 'dim' : ''}`}>
        <div className="logo">
          <span className="logo-tiny">TINY RC</span>
          <span className="logo-mayhem">MAYHEM</span>
        </div>
        <p className="logo-sub label">the workshop · 2–12 players · one giant office</p>
      </div>

      <div className="garage-xp chip">
        <span className="label">career</span>
        <span>{xp} XP</span>
        {nextUnlock && <span className="label">next · {nextUnlock.name} @ {nextUnlock.xp}</span>}
      </div>

      {focus ? (
        <button className="chip focus-back" onClick={() => setFocus(null)}>
          <Icon name="chevron-left" size={15} /> back to the bench <kbd>ESC</kbd>
        </button>
      ) : (
        <>
          <p className="garage-help label">tap the monitor to tune your car · smack the red button to race</p>
          {/* portrait phones can't reach the in-world monitor/button — give
              them real controls instead of a scavenger hunt */}
          <div className="garage-actions">
            <button className="btn btn-ghost" onClick={() => setFocus('monitor')}>
              <Icon name="wrench" size={16} /> Tune
            </button>
            <button className="btn btn-primary" onClick={play}>RACE →</button>
          </div>
        </>
      )}
    </div>
  );
}

function GarageScene({ focus, setFocus }) {
  const carId = useStore((s) => s.car);
  const paint = useStore((s) => s.paint);
  const style = useStore((s) => s.style);
  const cos = useStore((s) => s.cos);
  const lampTarget = useMemo(() => new THREE.Object3D(), []);

  return (
    <>
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#141a2c']} />
        <Lightformer form="rect" intensity={4} color="#dfe8ff" position={[0, 5, -6]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={2.5} color="#ffd9a8" position={[5, 3, 3]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="circle" intensity={3} color="#b085ff" position={[-4, 4, 2]} scale={3} />
      </Environment>
      <ambientLight intensity={0.32} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} color="#dfe6ff" />
      <pointLight position={[-3.5, 2.5, -1]} intensity={9} color="#6a8bff" />

      <Rig focus={focus} />
      <Desk />
      <Backdrop />

      {/* the star of the show, on its turntable */}
      <Turntable>
        <CarModel carId={carId} paint={paint} style={style} cosmetics={cos} isLocal />
      </Turntable>
      <ContactShadows position={[0, 0.07, 0]} opacity={0.65} blur={2.4} scale={7} />

      {/* desk lamp bathing the car in warm light */}
      <primitive object={lampTarget} position={[0, 0.3, 0]} />
      <DeskLamp position={[-2.3, 0, -1.6]} target={lampTarget} />

      <Monitor
        position={[2.35, 0, -0.7]}
        rotation={[0, -0.55, 0]}
        active={focus === 'monitor'}
        onFocus={() => setFocus('monitor')}
      />
      <Clipboard
        position={[-2.05, 0, 0.55]}
        rotation={[0, 0.62, 0]}
        active={focus === 'clipboard'}
        onFocus={() => setFocus('clipboard')}
      />
      <StartButton position={[1.75, 0, 1.35]} />
      <Tools />

      <EffectComposer>
        <Bloom intensity={0.55} luminanceThreshold={0.8} mipmapBlur />
        <Vignette darkness={0.55} />
      </EffectComposer>
    </>
  );
}

// Camera rig: subtle head-tracking parallax while roaming the bench, and a
// docked head-on pose while a surface has focus (so the projected DOM is
// stable and legible — the old always-on parallax made the monitor's buttons
// physically chase the cursor).
const POSES = {
  monitor: {
    center: new THREE.Vector3(2.34, 1.28, -0.68),
    normal: new THREE.Vector3(-0.522, 0, 0.852),
    halfW: 1.6, halfH: 1.1,
  },
  clipboard: {
    center: new THREE.Vector3(-2.05, 0.98, 0.68),
    normal: new THREE.Vector3(0.55, 0.31, 0.77),
    halfW: 0.85, halfH: 1.0,
  },
};
function Rig({ focus }) {
  const look = useRef(new THREE.Vector3(0.1, 0.75, 0));
  const tmpPos = useRef(new THREE.Vector3());
  const tmpLook = useRef(new THREE.Vector3());
  useFrame(({ camera, pointer }, delta) => {
    const pose = POSES[focus];
    let targetPos, targetLook;
    if (pose) {
      // dock on the surface's normal axis, far enough back that the whole
      // panel fits the current viewport (portrait phones need more distance)
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const tanH = tanV * camera.aspect;
      const d = Math.max((pose.halfH * 1.12) / tanV, (pose.halfW * 1.12) / tanH);
      targetPos = tmpPos.current.copy(pose.normal).multiplyScalar(d).add(pose.center);
      targetLook = pose.center;
    } else {
      targetPos = tmpPos.current.set(pointer.x * 0.45, 2.6 + pointer.y * 0.25, 5.2);
      targetLook = tmpLook.current.set(0.1, 0.75, 0);
    }
    // exponential damping — frame-rate independent, so the dock takes the
    // same ~0.6 s on a 30 fps laptop and a 144 Hz monitor
    const dt = Math.min(delta, 0.1);
    camera.position.lerp(targetPos, 1 - Math.exp(-(pose ? 7 : 2.5) * dt));
    look.current.lerp(targetLook, 1 - Math.exp(-(pose ? 8 : 3) * dt));
    camera.lookAt(look.current);
  });
  return null;
}

function Turntable({ children }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.4;
  });
  return (
    <group position={[0, 0.09, 0]}>
      {/* turntable platter */}
      <mesh position={[0, -0.035, 0]} receiveShadow>
        <cylinderGeometry args={[1.15, 1.25, 0.07, 36]} />
        <meshStandardMaterial color="#2b303c" metalness={0.6} roughness={0.35} />
      </mesh>
      <group ref={ref} position={[0, 0.275, 0]}>{children}</group>
    </group>
  );
}

function Desk() {
  const wood = woodTex([3, 3]);
  return (
    <group>
      {/* desktop */}
      <mesh position={[0, -0.21, 0]} receiveShadow>
        <boxGeometry args={[17, 0.42, 10]} />
        <meshStandardMaterial map={wood} color="#a8825c" roughness={0.8} />
      </mesh>
      {/* rubber work mat under the car */}
      <mesh position={[0, 0.012, 0.1]} receiveShadow>
        <boxGeometry args={[4.2, 0.025, 3.2]} />
        <meshStandardMaterial color="#20242e" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.026, 0.1]}>
        <boxGeometry args={[4.0, 0.002, 3.0]} />
        <meshStandardMaterial color="#2a2f3b" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Backdrop() {
  return (
    <group position={[0, 0, -4.8]}>
      <mesh position={[0, 3, 0]}>
        <planeGeometry args={[24, 9]} />
        <meshStandardMaterial color="#12151f" roughness={1} />
      </mesh>
      {/* pegboard */}
      <mesh position={[-3.4, 2.2, 0.02]}>
        <planeGeometry args={[4.6, 2.6]} />
        <meshStandardMaterial color="#1b2130" roughness={0.9} />
      </mesh>
      {/* shelf with paint cans */}
      <mesh position={[3.2, 2.0, 0.15]}>
        <boxGeometry args={[4.2, 0.08, 0.5]} />
        <meshStandardMaterial color="#3a2f22" roughness={0.8} />
      </mesh>
      {PAINT_COLORS.slice(0, 7).map((c, i) => (
        <group key={c} position={[1.6 + i * 0.5, 2.24, 0.15]}>
          <mesh>
            <cylinderGeometry args={[0.11, 0.11, 0.4, 12]} />
            <meshStandardMaterial color={c} roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.08, 8]} />
            <meshStandardMaterial color="#c9cfd8" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DeskLamp({ position, target }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.42, 0.1, 16]} />
        <meshStandardMaterial color="#2e3340" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.25, 0.75, 0.2]} rotation-z={-0.4} rotation-x={0.25} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.5, 8]} />
        <meshStandardMaterial color="#3a4152" metalness={0.7} roughness={0.3} />
      </mesh>
      <group position={[0.62, 1.42, 0.5]} rotation={[0.5, 0.35, -0.7]}>
        <mesh castShadow>
          <coneGeometry args={[0.34, 0.5, 18, 1, true]} />
          <meshStandardMaterial color="#e8b64c" metalness={0.5} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.12, 0]}>
          <sphereGeometry args={[0.13, 10, 10]} />
          <meshStandardMaterial color="#fff6d8" emissive="#ffedb0" emissiveIntensity={2.5} toneMapped={false} />
        </mesh>
      </group>
      <spotLight
        position={[0.62, 1.38, 0.5]}
        target={target}
        angle={0.65}
        intensity={60}
        distance={12}
        penumbra={0.6}
        color="#ffe9b8"
        castShadow
      />
    </group>
  );
}

// The bench monitor runs the tuning software — the menu UI lives on this
// screen, projected into the world via a CSS3D transform.
function Monitor({ position, rotation, active, onFocus }) {
  const grab = (e) => {
    e.stopPropagation();
    onFocus();
    document.body.style.cursor = '';
  };
  const over = (e) => { e.stopPropagation(); if (!active) document.body.style.cursor = 'pointer'; };
  const out = () => { document.body.style.cursor = ''; };
  return (
    <group position={position} rotation={rotation}>
      {/* stand */}
      <mesh position={[0, 0.14, -0.1]} castShadow>
        <cylinderGeometry args={[0.09, 0.3, 0.28, 12]} />
        <meshStandardMaterial color="#22262f" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* frame */}
      <mesh position={[0, 1.28, -0.05]} castShadow onClick={grab} onPointerOver={over} onPointerOut={out}>
        <boxGeometry args={[3.05, 2.05, 0.1]} />
        <meshStandardMaterial color="#191d26" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* glowing screen backing (bloom halo behind the DOM UI) */}
      <mesh position={[0, 1.28, 0.008]}>
        <planeGeometry args={[2.85, 1.85]} />
        <meshBasicMaterial color="#0c1322" toneMapped={false} />
      </mesh>
      <Html transform position={[0, 1.28, 0.02]} distanceFactor={1.63}>
        <MonitorUI active={active} onFocus={onFocus} />
      </Html>
      {/* sticky note on the frame */}
      <mesh position={[1.28, 0.2, 0.02]} rotation-z={-0.12}>
        <planeGeometry args={[0.42, 0.42]} />
        <meshBasicMaterial color="#ffe27a" />
      </mesh>
    </group>
  );
}

// Stat bars are calibrated against the roster min/max so cars actually
// differ on screen (raw values normalized ~0.8–1.0 and every bar looked full).
const STAT_DEFS = [
  ['Speed', (c) => c.topSpeed],
  ['Accel', (c) => c.accel],
  ['Handling', (c) => c.handling],
  ['Drift', (c) => 1 - c.drift],
  ['Boost', (c) => c.boost],
];
const STAT_RANGES = STAT_DEFS.map(([label, get]) => {
  const vals = CAR_IDS.map((id) => get(CARS[id]));
  return { label, get, min: Math.min(...vals), max: Math.max(...vals) };
});

function MonitorUI({ active, onFocus }) {
  const store = useStore();
  const [tab, setTab] = useState('car');
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
  const setStyle = (patch) => {
    useStore.getState().setStyle(patch);
    audio.blip(700, 0.05);
  };

  return (
    <div className="monitor-ui" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mu-titlebar">
        <span className="mu-dots"><i /><i /><i /></span>
        <span className="mu-title"><Icon name="wrench" size={14} /> RC TUNER</span>
        <span className="mu-career">
          {nextUnlock ? `next unlock: ${nextUnlock.name} @ ${nextUnlock.xp} xp` : 'v2.1 · all gear unlocked'}
        </span>
      </div>
      <nav>
        <button className={tab === 'car' ? 'sel' : ''} onClick={() => setTab('car')}>CAR</button>
        <button className={tab === 'style' ? 'sel' : ''} onClick={() => setTab('style')}>STYLE</button>
        <button className={tab === 'gear' ? 'sel' : ''} onClick={() => setTab('gear')}>GEAR</button>
      </nav>

      {tab === 'car' && (
        <div className="mu-body">
          <div className="mu-pick">
            <button className="mu-arrow" onClick={() => pick(-1)}>‹</button>
            <div>
              <h2>{car.name}</h2>
              <p>{car.desc}</p>
            </div>
            <button className="mu-arrow" onClick={() => pick(1)}>›</button>
          </div>
          <div className="mu-stats">
            {STAT_RANGES.map(({ label, get, min, max }) => (
              <Stat key={label} label={label} v={max > min ? (get(car) - min) / (max - min) : 1} />
            ))}
          </div>
          <p className="mu-ability">
            <b>{ABILITIES[carId]?.name}</b> · {ABILITIES[carId]?.desc} <kbd>Q</kbd>
          </p>
          <label className="label">Paint</label>
          <div className="mu-swatches">
            {paints.map((p) => (
              <button
                key={p.value}
                className={`swatch ${store.paint === p.value ? 'sel' : ''}`}
                style={{ background: p.value }}
                title={p.name}
                onClick={() => { useStore.setState({ paint: p.value }); useStore.getState().save(); audio.blip(700, 0.05); }}
              />
            ))}
            <button className={`swatch none ${!store.paint ? 'sel' : ''}`} title="Stock paint"
              onClick={() => { useStore.setState({ paint: null }); useStore.getState().save(); }}>✕</button>
          </div>
        </div>
      )}

      {tab === 'style' && (
        <div className="mu-body">
          <label className="label">Wheels</label>
          <div className="mu-row">
            {WHEEL_IDS.map((id) => (
              <button key={id} className={store.style.wheels === id ? 'sel' : ''}
                onClick={() => setStyle({ wheels: id })}>{WHEEL_STYLES[id].name}</button>
            ))}
          </div>
          <label className="label">Spoiler</label>
          <div className="mu-row">
            {SPOILER_IDS.map((id) => (
              <button key={id} className={store.style.spoiler === id ? 'sel' : ''}
                onClick={() => setStyle({ spoiler: id })}>{SPOILER_STYLES[id].name}</button>
            ))}
          </div>
          <label className="label">Vinyl</label>
          <div className="mu-row">
            {VINYL_IDS.map((id) => (
              <button key={id} className={store.style.vinyl === id ? 'sel' : ''}
                onClick={() => setStyle({ vinyl: id })}>{VINYL_STYLES[id].name}</button>
            ))}
          </div>
          <div className="mu-cols">
            <div>
              <label className="label">Vinyl color</label>
              <div className="mu-swatches">
                {VINYL_COLORS.map((c) => (
                  <button key={c} className={`swatch ${store.style.vinylColor === c ? 'sel' : ''}`}
                    style={{ background: c }} onClick={() => setStyle({ vinylColor: c })} />
                ))}
              </div>
            </div>
            <div>
              <label className="label">Underglow</label>
              <div className="mu-swatches">
                {GLOW_COLORS.map((c) => (
                  <button key={c || 'off'} className={`swatch ${c ? '' : 'none'} ${store.style.glow === c ? 'sel' : ''}`}
                    style={c ? { background: c, boxShadow: `0 0 8px ${c}` } : undefined}
                    onClick={() => setStyle({ glow: c })}>{c ? '' : '✕'}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'gear' && (
        <div className="mu-body">
          {[['hat', 'Hat'], ['antenna', 'Antenna'], ['trail', 'Trail']].map(([slot, label]) => {
            const items = unlocked.filter((u) => u.type === slot);
            return (
              <div key={slot}>
                <label className="label">{label}</label>
                <div className="mu-row">
                  <button className={!store.cos[slot] ? 'sel' : ''}
                    onClick={() => { store.equip(slot, null); audio.blip(440, 0.05); }}>none</button>
                  {items.map((u) => (
                    <button key={u.value} className={store.cos[slot] === u.value ? 'sel' : ''}
                      onClick={() => { store.equip(slot, u.value); audio.blip(760, 0.05); }}>{u.name}</button>
                  ))}
                  {items.length === 0 && <span className="mu-hint">earn XP to unlock</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer>
        <div className={`mu-driver ${store.name.trim() ? '' : 'attn'}`}>
          <label className="label" htmlFor="mu-name">driver</label>
          <input
            id="mu-name"
            value={store.name}
            maxLength={16}
            placeholder="type your name"
            onChange={(e) => useStore.setState({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && play()}
          />
        </div>
        <label className="mu-auto" title="car accelerates on its own">
          <input type="checkbox" checked={store.autoGas}
            onChange={(e) => { useStore.setState({ autoGas: e.target.checked }); useStore.getState().save(); }} />
          auto-gas
        </label>
        <button className="btn btn-primary mu-play" onClick={play}>ENTER THE OFFICE</button>
      </footer>

      {/* while the camera isn't docked, the whole screen is one big
          "focus me" button — no more clicking tiny moving targets */}
      {!active && <button className="mu-cover" aria-label="Open the tuner" onClick={onFocus} />}
    </div>
  );
}

function Stat({ label, v }) {
  const lit = 1 + Math.round(Math.min(1, Math.max(0, v)) * 4); // 1..5 cells
  return (
    <div className="mu-stat">
      <span>{label}</span>
      <div className="cells">
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < lit ? 'on' : ''} />)}
      </div>
    </div>
  );
}

// Controls cheat-sheet on a clipboard leaning against a coffee mug.
function Clipboard({ position, rotation, active, onFocus }) {
  const grab = (e) => { e.stopPropagation(); onFocus(); document.body.style.cursor = ''; };
  const over = (e) => { e.stopPropagation(); if (!active) document.body.style.cursor = 'pointer'; };
  const out = () => { document.body.style.cursor = ''; };
  return (
    <group position={position} rotation={rotation}>
      {/* the DOM sheet is click-transparent (read-only), so any click on the
          board/paper meshes lands here and docks the camera */}
      <group rotation-x={-0.32} onClick={grab} onPointerOver={over} onPointerOut={out}>
        {/* board */}
        <mesh position={[0, 0.78, 0]} castShadow>
          <boxGeometry args={[1.5, 1.9, 0.04]} />
          <meshStandardMaterial color="#7a5a38" roughness={0.8} />
        </mesh>
        {/* clip */}
        <mesh position={[0, 1.66, 0.03]}>
          <boxGeometry args={[0.5, 0.12, 0.06]} />
          <meshStandardMaterial color="#aab2c0" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* paper */}
        <mesh position={[0, 0.76, 0.025]}>
          <planeGeometry args={[1.34, 1.72]} />
          <meshStandardMaterial color="#f4f1e6" roughness={0.9} />
        </mesh>
        <Html transform position={[0, 0.76, 0.03]} distanceFactor={1.36} pointerEvents="none">
          <div className="clipboard-ui">
            <h3>CONTROLS</h3>
            <div><kbd>WASD</kbd> drive</div>
            <div><kbd>SHIFT</kbd> drift → sparks → mini-turbo</div>
            <div><kbd>SPACE</kbd>/<kbd>B</kbd> boost</div>
            <div><kbd>E</kbd>/<kbd>CLICK</kbd> use powerup</div>
            <div><kbd>Q</kbd> ability · <kbd>H</kbd> horn</div>
            <div><kbd>1-8</kbd> emotes</div>
            <div><kbd>R</kbd> respawn · <kbd>N</kbd> night</div>
            <div><kbd>TAB</kbd> scores · <kbd>M</kbd> mute</div>
            <div>🎮 gamepad: stick + triggers</div>
            <div className="cb-note">ramps launch you —<br />land on your wheels ✏️</div>
          </div>
        </Html>
      </group>
      {/* the mug it leans on */}
      <mesh position={[0, 0.28, -0.42]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.56, 16]} />
        <meshStandardMaterial color="#c0392b" roughness={0.5} />
      </mesh>
    </group>
  );
}

function StartButton({ position }) {
  const [hover, setHover] = useState(false);
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.14, 20]} />
        <meshStandardMaterial color="#2a2e38" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh
        position={[0, 0.16, 0]}
        onClick={play}
        onPointerOver={() => { setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
        castShadow
      >
        <sphereGeometry args={[0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#e33b2f"
          emissive="#ff2211"
          emissiveIntensity={hover ? 1.4 : 0.5}
          roughness={0.35}
          toneMapped={false}
        />
      </mesh>
      {/* click-transparent label — the glorious red dome is the button */}
      <Html position={[0, 0.75, 0]} center className="race-tag">
        <div className="sticky">RACE →</div>
      </Html>
    </group>
  );
}

function Tools() {
  return (
    <group>
      {/* screwdriver */}
      <group position={[1.15, 0.05, 1.45]} rotation-y={0.9}>
        <mesh rotation-z={Math.PI / 2} position={[0.28, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.62, 8]} />
          <meshStandardMaterial color="#b8c0cc" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh rotation-z={Math.PI / 2} position={[-0.2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.06, 0.34, 10]} />
          <meshStandardMaterial color="#e67e22" roughness={0.5} />
        </mesh>
      </group>
      {/* wrench */}
      <group position={[-1.35, 0.035, 1.6]} rotation-y={-0.5}>
        <mesh>
          <boxGeometry args={[0.75, 0.05, 0.11]} />
          <meshStandardMaterial color="#aab2c0" metalness={0.85} roughness={0.3} />
        </mesh>
        {[0.42, -0.42].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.1, 0.045, 8, 12, Math.PI * 1.5]} />
            <meshStandardMaterial color="#aab2c0" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}
      </group>
      {/* tape roll */}
      <mesh position={[2.7, 0.06, 0.9]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.2, 0.09, 10, 20]} />
        <meshStandardMaterial color="#3d4250" roughness={0.7} />
      </mesh>
      {/* loose screws */}
      {[[0.8, 1.05], [0.95, 0.9], [-0.75, 1.5], [2.2, 0.4]].map(([x, z], i) => (
        <group key={i} position={[x, 0.045, z]} rotation-y={i * 1.3}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.02, 0.02, 0.12, 6]} />
            <meshStandardMaterial color="#c9cfd8" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[-0.07, 0, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.045, 0.045, 0.03, 8]} />
            <meshStandardMaterial color="#c9cfd8" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* spare tire stack */}
      <group position={[-2.75, 0, -0.9]}>
        {[0.09, 0.27].map((y, i) => (
          <mesh key={y} position={[i * 0.04, y, 0]} rotation-x={0}>
            <cylinderGeometry args={[0.32, 0.32, 0.17, 18]} />
            <meshStandardMaterial color="#17181c" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0.02, 0.18, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.38, 14]} />
          <meshStandardMaterial color="#c9cfd8" metalness={0.85} roughness={0.25} />
        </mesh>
      </group>
      {/* pencil mug */}
      <group position={[3.1, 0, -1.7]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.22, 0.55, 14]} />
          <meshStandardMaterial color="#2980b9" roughness={0.4} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.1, 0.62, Math.sin(i * 2.1) * 0.1]} rotation-z={0.15 - i * 0.12}>
            <cylinderGeometry args={[0.022, 0.022, 0.55, 6]} />
            <meshStandardMaterial color={['#f1c40f', '#e74c3c', '#2ecc71'][i]} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
