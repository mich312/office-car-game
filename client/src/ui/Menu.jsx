// The garage is a real 3D place now: your RC car sits on a workbench desk
// under a lamp, surrounded by tools. Everything you used to click in a flat
// menu lives inside the world — stats & tuning on the bench monitor, the
// controls cheat-sheet on a propped clipboard, and a big red RACE button.
import { useState, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  CARS, CAR_IDS, UNLOCKS, PAINT_COLORS, ABILITIES,
  WHEEL_STYLES, WHEEL_IDS, SPOILER_STYLES, SPOILER_IDS,
  VINYL_STYLES, VINYL_IDS, VINYL_COLORS, GLOW_COLORS,
  FINISHES, FINISH_IDS, ACCENT_COLORS, DEFAULT_STYLE, randomStyle,
  PART_SLOTS, PLATE_MAX,
  TUNE_AXES, TUNE_MIN, TUNE_MAX, TUNE_PRESETS, TUNE_PRESET_IDS,
  STOCK_TUNE, tunedStats, tuneMetrics, tuneLabel, matchingPreset,
} from '@rc/shared';
import { useStore } from '../store.js';
import { audio } from '../audio.js';
import CarModel from '../game/CarModel.jsx';
import { woodTex } from '../game/textures.js';

const play = () => {
  audio.start();
  audio.blip(880, 0.1);
  const store = useStore.getState();
  const name = store.name.trim() || `Intern${(Math.random() * 99) | 0}`;
  useStore.setState({ name, screen: 'game' });
  store.save();
};

export default function Menu() {
  return (
    <div className="garage3d">
      <Canvas dpr={[1, 2]} shadows camera={{ position: [0, 2.6, 5.2], fov: 42 }} gl={{ antialias: true }}>
        <color attach="background" args={['#0a0d18']} />
        <fog attach="fog" args={['#0a0d18', 9, 18]} />
        <Suspense fallback={null}>
          <GarageScene />
        </Suspense>
      </Canvas>
      <div className="garage-overlay">
        <h1>TINY <span>RC</span> MAYHEM</h1>
        <p>the workshop · 2–12 players · one giant office</p>
      </div>
    </div>
  );
}

function GarageScene() {
  const carId = useStore((s) => s.car);
  const paint = useStore((s) => s.paint);
  const style = useStore((s) => s.style);
  const tune = useStore((s) => s.tune);
  const cos = useStore((s) => s.cos);
  const driverName = useStore((s) => s.name);
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

      <Rig />
      <Desk />
      <Backdrop />

      {/* the star of the show, on its turntable — stance, tyre width and wing
          angle update live as the setup sheet on the monitor changes */}
      <Turntable>
        <CarModel
          carId={carId}
          paint={paint}
          style={style}
          tune={tune}
          name={driverName}
          cosmetics={cos}
          isLocal
        />
      </Turntable>
      <ContactShadows position={[0, 0.07, 0]} opacity={0.65} blur={2.4} scale={7} />

      {/* desk lamp bathing the car in warm light */}
      <primitive object={lampTarget} position={[0, 0.3, 0]} />
      <DeskLamp position={[-2.3, 0, -1.6]} target={lampTarget} />

      <Monitor position={[2.35, 0, -0.7]} rotation={[0, -0.55, 0]} />
      <Clipboard position={[-2.05, 0, 0.55]} rotation={[0, 0.62, 0]} />
      <StartButton position={[1.75, 0, 1.35]} />
      <Tools />

      <EffectComposer>
        <Bloom intensity={0.55} luminanceThreshold={0.8} mipmapBlur />
        <Vignette darkness={0.55} />
      </EffectComposer>
    </>
  );
}

// Where the bench camera goes, and which way the turntable parks, when you are
// fitting a part. Every slot in PART_SLOTS names one of these regions, so
// changing a bumper swings the nose round and pulls the camera in on it.
const FOCUS_VIEWS = {
  // angle 0 points the nose at the bench camera; +π turns the tail round
  front: { angle: -0.35, cam: [0.55, 1.3, 3.1], look: [0, 0.48, 0.15] },
  rear: { angle: Math.PI - 0.35, cam: [0.5, 1.35, 3.1], look: [0, 0.48, -0.1] },
  side: { angle: Math.PI / 2, cam: [0.15, 1.2, 2.95], look: [0, 0.46, 0] },
  roof: { angle: -0.5, cam: [0.4, 2.35, 2.15], look: [0, 0.52, 0] },
  wheel: { angle: Math.PI / 2 - 0.3, cam: [0.8, 0.92, 2.4], look: [0.1, 0.3, 0.2] },
};
const DEFAULT_CAM = [0, 2.6, 5.2];
const DEFAULT_LOOK = [0.1, 0.75, 0];
const _camGoal = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();
const _look = new THREE.Vector3();

// Head-tracking parallax so the desk feels like a diorama, plus the part-focus
// dolly: with a focus set the camera eases to that region's viewpoint and the
// pointer parallax stands down.
function Rig() {
  const look = useRef(new THREE.Vector3(...DEFAULT_LOOK));
  useFrame(({ camera, pointer }, dt) => {
    const view = FOCUS_VIEWS[useStore.getState().focus];
    const k = 1 - Math.pow(0.004, Math.min(dt, 0.1));
    if (view) {
      _camGoal.set(...view.cam);
      _lookGoal.set(...view.look);
    } else {
      _camGoal.set(DEFAULT_CAM[0] + pointer.x * 0.45, DEFAULT_CAM[1] + pointer.y * 0.25, DEFAULT_CAM[2]);
      _lookGoal.set(...DEFAULT_LOOK);
    }
    camera.position.lerp(_camGoal, k);
    look.current.lerp(_lookGoal, k);
    camera.lookAt(look.current);
  });
  return null;
}

function Turntable({ children }) {
  const ref = useRef();
  const spin = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const view = FOCUS_VIEWS[useStore.getState().focus];
    if (view) {
      // shortest way round to the parked angle
      let d = (view.angle - spin.current) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      spin.current += d * Math.min(1, dt * 4.5);
    } else {
      spin.current += dt * 0.4; // back to the slow showroom spin
    }
    ref.current.rotation.y = spin.current;
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

// The bench monitor runs the tuning software — the whole old menu UI lives
// on this screen, projected into the world via a CSS3D transform.
function Monitor({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* stand */}
      <mesh position={[0, 0.14, -0.1]} castShadow>
        <cylinderGeometry args={[0.09, 0.3, 0.28, 12]} />
        <meshStandardMaterial color="#22262f" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* frame */}
      <mesh position={[0, 1.28, -0.05]} castShadow>
        <boxGeometry args={[3.05, 2.05, 0.1]} />
        <meshStandardMaterial color="#191d26" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* glowing screen backing (bloom halo behind the DOM UI) */}
      <mesh position={[0, 1.28, 0.008]}>
        <planeGeometry args={[2.85, 1.85]} />
        <meshBasicMaterial color="#0c1322" toneMapped={false} />
      </mesh>
      <Html transform position={[0, 1.28, 0.02]} distanceFactor={1.63}>
        <MonitorUI />
      </Html>
      {/* sticky note on the frame */}
      <mesh position={[1.28, 0.2, 0.02]} rotation-z={-0.12}>
        <planeGeometry args={[0.42, 0.42]} />
        <meshBasicMaterial color="#ffe27a" />
      </mesh>
    </group>
  );
}

function MonitorUI() {
  const store = useStore();
  const [tab, setTab] = useState('car');
  const [carIdx, setCarIdx] = useState(Math.max(0, CAR_IDS.indexOf(store.car)));
  const carId = CAR_IDS[carIdx];
  const car = CARS[carId];
  const unlocked = store.unlocked();
  const paints = unlocked.filter((u) => u.type === 'paint');
  const nextUnlock = UNLOCKS.find((u) => u.xp > store.xp);
  // the same numbers the physics step will use, recomputed as sliders move
  const tuned = useMemo(() => tunedStats(car, store.tune), [car, store.tune]);
  const activePreset = matchingPreset(store.tune);
  const buildLabel = fittedLabel(store.style);

  const pick = (d) => {
    const i = (carIdx + d + CAR_IDS.length) % CAR_IDS.length;
    setCarIdx(i);
    useStore.setState({ car: CAR_IDS[i] });
    audio.blip(520 + i * 60, 0.06);
  };
  const setStyle = (patch, focus) => {
    useStore.getState().setStyle(patch);
    if (focus) useStore.getState().setFocus(focus);
    audio.blip(700, 0.05);
  };

  return (
    <div className="monitor-ui" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <b>🔧 RC TUNER v2.0</b>
        <span className="mu-xp">CAREER {store.xp} XP{nextUnlock ? ` · next: ${nextUnlock.name} @ ${nextUnlock.xp}` : ''}</span>
      </header>
      <nav>
        <button className={tab === 'car' ? 'sel' : ''} onClick={() => setTab('car')}>CAR</button>
        <button className={tab === 'parts' ? 'sel' : ''} onClick={() => setTab('parts')}>PARTS</button>
        <button className={tab === 'paint' ? 'sel' : ''} onClick={() => setTab('paint')}>PAINT</button>
        <button className={tab === 'tune' ? 'sel' : ''} onClick={() => setTab('tune')}>SETUP</button>
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
          {/* bars show the car AS TUNED, with a tick where stock sits */}
          <div className="mu-stats">
            <Stat label="Speed" v={tuned.topSpeed / 20} base={car.topSpeed / 20} />
            <Stat label="Accel" v={tuned.accel / 16} base={car.accel / 16} />
            <Stat label="Handling" v={tuned.handling / 4} base={car.handling / 4} />
            <Stat label="Drift" v={1 - tuned.drift / 0.6} base={1 - car.drift / 0.6} />
            <Stat label="Boost" v={tuned.boost / 13} base={car.boost / 13} />
          </div>
          <p className="mu-setup">
            SETUP · <b>{tuneLabel(store.tune)}</b>
            <button className="mu-linkbtn" onClick={() => setTab('tune')}>setup sheet →</button>
          </p>
          <p className="mu-ability">{ABILITIES[carId]?.icon} <b>{ABILITIES[carId]?.name}</b> · {ABILITIES[carId]?.desc} <kbd>Q</kbd></p>
          <p className="mu-built">
            BUILD · <b>{buildLabel}</b>
            <button className="mu-linkbtn" onClick={() => setTab('parts')}>fit parts →</button>
          </p>
        </div>
      )}

      {tab === 'tune' && (
        <div className="mu-body">
          <div className="mu-row mu-presets">
            {TUNE_PRESET_IDS.map((id) => (
              <button
                key={id}
                className={activePreset === id ? 'sel' : ''}
                title={TUNE_PRESETS[id].desc}
                onClick={() => { store.applyTunePreset(id); audio.blip(660, 0.06); }}
              >
                {TUNE_PRESETS[id].name}
              </button>
            ))}
          </div>
          <div className="mu-tune">
            {TUNE_AXES.map((axis) => {
              const v = store.tune[axis.id];
              return (
                <div className="mu-tune-row" key={axis.id} title={`${axis.desc}  +${axis.gains} / −${axis.costs}`}>
                  <span className="mu-tune-name">{axis.icon} {axis.name}</span>
                  <span className="mu-tune-end">{axis.low}</span>
                  <input
                    type="range"
                    min={TUNE_MIN}
                    max={TUNE_MAX}
                    step={1}
                    value={v}
                    aria-label={axis.name}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      store.setTune({ [axis.id]: n });
                      audio.blip(560 + n * 45, 0.04);
                    }}
                  />
                  <span className="mu-tune-end">{axis.high}</span>
                  <span className={`mu-tune-val ${v ? 'on' : ''}`}>
                    {v === 0 ? '·' : `${v > 0 ? '+' : ''}${v}`}
                  </span>
                </div>
              );
            })}
          </div>
          <TunePreview carId={carId} tune={store.tune} />
        </div>
      )}

      {tab === 'parts' && (
        <div className="mu-body">
          <div className="mu-parts">
            {PART_SLOTS.map((slot) => (
              <PartRow
                key={slot.id}
                label={slot.name}
                options={slot.options}
                value={store.style[slot.id]}
                onPick={(v) => setStyle({ [slot.id]: v }, slot.focus)}
              />
            ))}
            <PartRow
              label="Wheels"
              options={WHEEL_NAMES}
              value={store.style.wheels}
              onPick={(v) => setStyle({ wheels: v }, 'wheel')}
            />
            <PartRow
              label="Spoiler"
              options={SPOILER_NAMES}
              value={store.style.spoiler}
              onPick={(v) => setStyle({ spoiler: v }, 'rear')}
            />
          </div>
          <div className="mu-plate">
            <label className="mu-label" htmlFor="platetext">PLATE</label>
            <input
              id="platetext"
              value={store.style.plate}
              maxLength={PLATE_MAX}
              placeholder={(store.name || 'driver').toUpperCase().slice(0, PLATE_MAX)}
              onChange={(e) => setStyle({ plate: e.target.value }, 'rear')}
            />
            <button onClick={() => {
              useStore.getState().setStyle(randomStyle());
              useStore.getState().setFocus('side');
              audio.blip(880, 0.08);
            }}>🎲 SURPRISE ME</button>
            <button onClick={() => {
              useStore.getState().setStyle({ ...DEFAULT_STYLE, plate: store.style.plate });
              useStore.getState().setFocus('side');
              audio.blip(320, 0.08);
            }}>STRIP TO STOCK</button>
          </div>
          <p className="mu-hint mu-partshint">
            Every part fits every body · the bench camera swings round to whatever you just fitted
          </p>
        </div>
      )}

      {tab === 'paint' && (
        <div className="mu-body">
          <label className="mu-label">FINISH</label>
          <div className="mu-row">
            {FINISH_IDS.map((id) => (
              <button key={id} className={store.style.finish === id ? 'sel' : ''}
                onClick={() => setStyle({ finish: id }, 'side')}>{FINISHES[id].name}</button>
            ))}
          </div>
          <label className="mu-label">PAINT</label>
          <div className="mu-swatches">
            {paints.map((p) => (
              <button
                key={p.value}
                className={`swatch ${store.paint === p.value ? 'sel' : ''}`}
                style={{ background: p.value }}
                title={p.name}
                onClick={() => {
                  useStore.setState({ paint: p.value });
                  useStore.getState().save();
                  useStore.getState().setFocus('side');
                  audio.blip(700, 0.05);
                }}
              />
            ))}
            <button className={`swatch none ${!store.paint ? 'sel' : ''}`} title="Stock paint"
              onClick={() => { useStore.setState({ paint: null }); useStore.getState().save(); }}>✕</button>
          </div>
          <label className="mu-label">VINYL</label>
          <div className="mu-row">
            {VINYL_IDS.map((id) => (
              <button key={id} className={store.style.vinyl === id ? 'sel' : ''}
                onClick={() => setStyle({ vinyl: id }, 'side')}>{VINYL_STYLES[id].name}</button>
            ))}
          </div>
          <div className="mu-cols mu-cols3">
            <div>
              <label className="mu-label">VINYL COLOR</label>
              <div className="mu-swatches">
                {VINYL_COLORS.map((c) => (
                  <button key={c} className={`swatch ${store.style.vinylColor === c ? 'sel' : ''}`}
                    style={{ background: c }} onClick={() => setStyle({ vinylColor: c })} />
                ))}
              </div>
            </div>
            <div>
              <label className="mu-label">UNDERGLOW</label>
              <div className="mu-swatches">
                {GLOW_COLORS.map((c) => (
                  <button key={c || 'off'} className={`swatch ${c ? '' : 'none'} ${store.style.glow === c ? 'sel' : ''}`}
                    style={c ? { background: c, boxShadow: `0 0 8px ${c}` } : undefined}
                    onClick={() => setStyle({ glow: c })}>{c ? '' : '✕'}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="mu-label" title="splitter · mirrors · wing · helmet">TRIM</label>
              <div className="mu-swatches">
                {ACCENT_COLORS.map((c) => (
                  <button key={c || 'body'} className={`swatch ${c ? '' : 'none'} ${store.style.accent === c ? 'sel' : ''}`}
                    style={c ? { background: c } : undefined} title={c || 'body colour'}
                    onClick={() => setStyle({ accent: c })}>{c ? '' : '✕'}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}


      {tab === 'gear' && (
        <div className="mu-body">
          {[['hat', 'HAT'], ['antenna', 'ANTENNA'], ['trail', 'TRAIL']].map(([slot, label]) => {
            const items = unlocked.filter((u) => u.type === slot);
            return (
              <div key={slot}>
                <label className="mu-label">{label}</label>
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
        <input
          value={store.name}
          maxLength={16}
          placeholder="DRIVER NAME"
          onChange={(e) => useStore.setState({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && play()}
        />
        <label className="mu-auto" title="car accelerates on its own">
          <input type="checkbox" checked={store.autoGas}
            onChange={(e) => { useStore.setState({ autoGas: e.target.checked }); useStore.getState().save(); }} />
          auto-gas
        </label>
        <button className="mu-play" onClick={play}>ENTER THE OFFICE →</button>
      </footer>
    </div>
  );
}

// A stat bar. With `base` it also draws a tick where the untuned car sits, so
// the setup sheet's effect is visible at a glance instead of remembered.
// Fitted-parts summary for the CAR tab: names only the parts you changed.
function fittedLabel(style) {
  const parts = [];
  for (const slot of PART_SLOTS) {
    const v = style[slot.id];
    if (v !== DEFAULT_STYLE[slot.id]) parts.push(slot.options[v]);
  }
  if (style.wheels !== DEFAULT_STYLE.wheels) parts.push(WHEEL_NAMES[style.wheels]);
  if (style.spoiler !== DEFAULT_STYLE.spoiler) parts.push(SPOILER_NAMES[style.spoiler]);
  return parts.length ? parts.join(' · ') : 'Showroom stock';
}

const WHEEL_NAMES = Object.fromEntries(WHEEL_IDS.map((id) => [id, WHEEL_STYLES[id].name]));
const SPOILER_NAMES = Object.fromEntries(SPOILER_IDS.map((id) => [id, SPOILER_STYLES[id].name]));

// One fitted part: name, the option you have on, and arrows to flip through the
// rest. Cycling is the point — the car changes under you as you click.
function PartRow({ label, options, value, onPick }) {
  const keys = Object.keys(options);
  const i = Math.max(0, keys.indexOf(value));
  const step = (d) => onPick(keys[(i + d + keys.length) % keys.length]);
  return (
    <div className="mu-part">
      <span className="mu-part-label">{label}</span>
      <button className="mu-part-arrow" onClick={() => step(-1)} aria-label={`previous ${label}`}>‹</button>
      <span className="mu-part-val" title={options[keys[i]]}>{options[keys[i]]}</span>
      <button className="mu-part-arrow" onClick={() => step(1)} aria-label={`next ${label}`}>›</button>
      <span className="mu-part-dots" aria-hidden="true">
        {keys.map((k, n) => <i key={k} className={n === i ? 'on' : ''} />)}
      </span>
    </div>
  );
}

function Stat({ label, v, base }) {
  const pct = Math.round(Math.min(1, Math.max(0, v)) * 100);
  const basePct = base === undefined ? null : Math.round(Math.min(1, Math.max(0, base)) * 100);
  const delta = basePct === null ? 0 : pct - basePct;
  return (
    <div className="mu-stat">
      <span>{label}</span>
      <div className="bar">
        <div style={{ width: `${pct}%` }} />
        {basePct !== null && Math.abs(delta) > 0 && <i className="tick" style={{ left: `${basePct}%` }} />}
      </div>
      {basePct !== null && (
        <em className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
          {delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta}`}
        </em>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- preview
// Honest preview: `simulateDrive` re-runs the grounded driving model from
// LocalCar.jsx with these numbers, so the trace is what the car will actually
// do on a flat floor at full throttle — stock dashed, your sheet solid.
function TunePreview({ carId, tune }) {
  const { m, base } = useMemo(() => ({
    m: tuneMetrics(carId, tune),
    base: tuneMetrics(carId, STOCK_TUNE),
  }), [carId, tune]);

  // Progress runs left→right, lateral up/down. The two axes have different
  // scales — this is telemetry, not a map: length = ground covered in 6 s,
  // wobble around the dotted course = how tidily the car tracks it.
  const W = 296, H = 62, PAD = 5;
  const live = m.path;
  const ghost = base.path;
  const zMax = Math.max(...live.map((p) => p[1]), ...ghost.map((p) => p[1]), 1);
  const xMax = Math.max(1.6, ...live.map((p) => Math.abs(p[0])), ...ghost.map((p) => Math.abs(p[0])));
  const pts = (path) => path
    .map(([x, z]) => `${(PAD + (z / zMax) * (W - 2 * PAD)).toFixed(1)},${(H / 2 - (x / xMax) * (H / 2 - PAD)).toFixed(1)}`)
    .join(' ');
  // the course itself, sampled the whole width so you can see what it aimed at
  const coursePts = pts(Array.from({ length: 60 }, (_, i) => {
    const z = (i / 59) * zMax;
    return [m.course(z), z];
  }));
  const end = live[live.length - 1];

  return (
    <div className="mu-preview">
      <label className="mu-label">PREVIEW · 6 s slalom from a standing start · dashed = stock</label>
      <svg viewBox={`0 0 ${W} ${H}`} className="mu-trace" preserveAspectRatio="none">
        <polyline points={coursePts} className="axis" />
        <polyline points={pts(ghost)} className="ghost" />
        <polyline points={pts(live)} className="live" />
        <circle
          cx={PAD + (end[1] / zMax) * (W - 2 * PAD)}
          cy={H / 2 - (end[0] / xMax) * (H / 2 - PAD)}
          r="2.6"
          className="dot"
        />
      </svg>
      <div className="mu-metrics">
        <Metric label="TOP" v={m.kmh} base={base.kmh} unit=" km/h" digits={0} />
        <Metric label="0→TOP" v={m.zeroToTop} base={base.zeroToTop} unit=" s" digits={1} lowerIsBetter />
        <Metric label="TURN" v={m.turnRate} base={base.turnRate} unit="°/s" digits={0} />
        <Metric label="LINE" v={m.lineError} base={base.lineError} unit="u off" digits={2} lowerIsBetter />
        <Metric label="MASS" v={m.stats.mass} base={base.stats.mass} unit="×" digits={2} neutral />
        <Metric label="6 s RUN" v={m.slalomDistance} base={base.slalomDistance} unit="u" digits={0} />
      </div>
    </div>
  );
}

function Metric({ label, v, base, unit = '', digits = 0, lowerIsBetter = false, neutral = false }) {
  const d = v - base;
  const better = lowerIsBetter ? d < 0 : d > 0;
  const cls = Math.abs(d) < Math.pow(10, -digits) / 2 || neutral ? '' : better ? 'up' : 'down';
  return (
    <div className="mu-metric">
      <span>{label}</span>
      <b>{v.toFixed(digits)}{unit}</b>
      <em className={cls}>{cls ? `${d > 0 ? '+' : ''}${d.toFixed(digits)}` : '·'}</em>
    </div>
  );
}

// Controls cheat-sheet on a clipboard leaning against a coffee mug.
function Clipboard({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <group rotation-x={-0.32}>
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
        <Html transform position={[0, 0.76, 0.03]} distanceFactor={1.36}>
          <div className="clipboard-ui">
            <h3>— CONTROLS —</h3>
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
      <Html position={[0, 0.75, 0]} center className="race-tag">
        <div onClick={play}>RACE!</div>
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
