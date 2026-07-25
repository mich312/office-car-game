// Diegetic drive cluster: a toy RC transmitter held at the bottom-left of
// the screen. The sticks physically mirror your steering/throttle, the LCD
// shows speed, the LED ladder is the boost meter, the antenna sways with
// speed — and the powerup (E) and ability (Q) live on it as physical lit
// buttons with a radial cooldown wipe. Replaces the flat speed/boost HUD
// and the action tray on fine-pointer devices.
//
// It lives INSIDE the game canvas (portaled onto the camera), so it catches
// the same bloom/tone mapping as the world; depthTest is off so office
// geometry never clips through it. Everything animates in useFrame straight
// off telemetry/store state — zero React re-renders per frame.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { M, POWERUPS, ABILITIES, ABILITY_COOLDOWN_S } from '@rc/shared';
import { useStore } from '../store.js';
import { telemetry } from './LocalCar.jsx';

const BODY = '#262c3d';
const BODY_DARK = '#181c29';
const FACE = '#2e3548';
const ACCENT = '#ffb454';
const STICK = '#8b97b4';
const LED_ON = new THREE.Color('#5cc8ff');
const LED_FULL = new THREE.Color('#ffb454');
const LED_OFF = new THREE.Color('#11151f');
const GOOD = new THREE.Color('#4ade80');
const AMBER = new THREE.Color('#ffb454');
const DIM = new THREE.Color('#39445f');
const LED_COUNT = 8;
const LOWFX = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lowfx');
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const makeCanvasTex = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, g: canvas.getContext('2d'), texture };
};

// static faceplate print: brand line + Q/E keycaps next to their buttons
function drawDeco({ canvas, g, texture }) {
  const W = canvas.width, H = canvas.height; // maps the 0.6 × 0.34 face
  const px = (x) => (x / 0.6 + 0.5) * W;
  const py = (y) => (0.5 - y / 0.34) * H;
  g.clearRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(154, 167, 192, 0.5)';
  g.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText('A F T E R   H O U R S   R C   ·   M K - I I', px(0), py(-0.086));
  const keycap = (label, x, y) => {
    g.fillStyle = 'rgba(24, 28, 41, 0.9)';
    g.strokeStyle = 'rgba(154, 167, 192, 0.55)';
    g.lineWidth = 1.5;
    const w = 22, h = 22, cx = px(x) - w / 2, cy = py(y) - h / 2;
    g.beginPath();
    g.roundRect(cx, cy, w, h, 5);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(238, 242, 250, 0.85)';
    g.font = '700 14px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText(label, px(x), py(y) + 1);
  };
  keycap('Q', -0.128, -0.124);
  keycap('E', 0.128, -0.124);
  texture.needsUpdate = true;
}

// round button face: emoji icon + state ring + cooldown wipe
function drawButtonFace({ canvas, g, texture }, icon, { frac = 0, ring = null, dim = false } = {}) {
  const S = canvas.width;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#10141f';
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, 7);
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (icon) {
    g.globalAlpha = dim ? 0.35 : 1;
    g.font = `52px ${EMOJI_FONT}`;
    g.fillStyle = '#eef2fa';
    g.fillText(icon, S / 2, S / 2 + 3);
    g.globalAlpha = 1;
  } else {
    g.fillStyle = 'rgba(130, 145, 174, 0.45)';
    g.font = '700 46px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('?', S / 2, S / 2 + 2);
  }
  // cooldown: dark wipe over the remaining fraction, clockwise from 12
  if (frac > 0) {
    g.fillStyle = 'rgba(8, 10, 16, 0.82)';
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    g.arc(S / 2, S / 2, S / 2 - 2, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  if (ring) {
    g.strokeStyle = ring;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 4, 0, 7);
    g.stroke();
  }
  texture.needsUpdate = true;
}

export default function ControllerHUD() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const spectating = useStore((s) => s.spectating);
  const photoMode = useStore((s) => s.photoMode);

  // children of the camera only render while the camera is in the scene graph
  useEffect(() => {
    scene.add(camera);
    return () => scene.remove(camera);
  }, [scene, camera]);

  const root = useRef();
  const steerStick = useRef();
  const throttleStick = useRef();
  const antenna = useRef();
  const ledMats = useRef([]);
  const signalMat = useRef();
  const abilityBtn = useRef();
  const powerupBtn = useRef();
  const abilityRim = useRef();
  const powerupRim = useRef();

  const lcd = useMemo(() => ({ ...makeCanvasTex(192, 96), last: -1, lastFrac: -1, acc: 1 }), []);
  const deco = useMemo(() => {
    const c = makeCanvasTex(480, 272);
    // the display font may not be loaded yet on first paint — redraw when it is
    drawDeco(c);
    if (document.fonts?.ready) document.fonts.ready.then(() => drawDeco(c));
    return c;
  }, []);
  const abilityFace = useMemo(() => ({ ...makeCanvasTex(96, 96), key: '' }), []);
  const powerupFace = useMemo(() => ({ ...makeCanvasTex(96, 96), key: '' }), []);
  const press = useRef({ prevPowerup: null, prevReadyAt: 0, powerupT: 1, abilityT: 1 });

  useFrame((state, delta) => {
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const st = useStore.getState();

    // pin to the bottom-left of the view (fov animates with speed, so
    // recompute every frame)
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.5;
    const halfW = halfH * camera.aspect;
    g.position.set(-halfW + 0.47, -halfH + 0.31, -1.5);

    const steer = telemetry.steer || 0; // +1 = left
    const throttle = telemetry.throttle || 0;
    const speedFrac = Math.min(1, Math.abs(telemetry.speed) / 20);

    // body english: lean into the steer, nudge on throttle, rattle on boost
    g.rotation.set(
      -0.26 - throttle * 0.04,
      0.2,
      steer * 0.06 + (telemetry.boosting ? (Math.random() - 0.5) * 0.014 : 0),
    );

    const k = Math.min(1, delta * 14);
    if (steerStick.current) steerStick.current.rotation.y += (-steer * 0.4 - steerStick.current.rotation.y) * k;
    if (throttleStick.current) throttleStick.current.rotation.x += (-throttle * 0.45 - throttleStick.current.rotation.x) * k;
    if (antenna.current) antenna.current.rotation.z = 0.14 + Math.sin(t * (2 + speedFrac * 9)) * (0.02 + speedFrac * 0.07);

    // boost LED ladder
    const frac = Math.max(0, Math.min(1, telemetry.boost / 100));
    const lit = Math.round(frac * LED_COUNT);
    const full = frac >= 0.995;
    for (let i = 0; i < LED_COUNT; i++) {
      const m = ledMats.current[i];
      if (!m) continue;
      if (i < lit) {
        m.color.copy(full ? LED_FULL : LED_ON);
        m.emissive.copy(full ? LED_FULL : LED_ON);
        m.emissiveIntensity = telemetry.boosting ? 2.2 : 1.1;
      } else {
        m.color.copy(LED_OFF);
        m.emissive.copy(LED_OFF);
        m.emissiveIntensity = 0;
      }
    }
    // link LED: steady soft pulse
    if (signalMat.current) signalMat.current.emissiveIntensity = 0.9 + Math.sin(t * 4) * 0.6;

    // ---- powerup button (E)
    const P = press.current;
    if (st.powerup !== P.prevPowerup) {
      if (!st.powerup && P.prevPowerup) P.powerupT = 0; // fired → press animation
      P.prevPowerup = st.powerup;
    }
    const pwKey = st.powerup || 'none';
    if (powerupFace.key !== pwKey) {
      powerupFace.key = pwKey;
      drawButtonFace(powerupFace, st.powerup ? POWERUPS[st.powerup]?.icon : null,
        { ring: st.powerup ? 'rgba(255, 180, 84, 0.9)' : null });
    }
    if (powerupRim.current) {
      powerupRim.current.emissive.copy(st.powerup ? AMBER : DIM);
      powerupRim.current.emissiveIntensity = st.powerup ? 0.9 + Math.sin(t * 5) * 0.25 : 0.15;
    }

    // ---- ability button (Q)
    if (st.abilityReadyAt !== P.prevReadyAt) {
      if (st.abilityReadyAt > P.prevReadyAt) P.abilityT = 0; // used → press animation
      P.prevReadyAt = st.abilityReadyAt;
    }
    const cdLeft = Math.max(0, st.abilityReadyAt - Date.now());
    const cdFrac = Math.min(1, cdLeft / (ABILITY_COOLDOWN_S * 1000));
    const ab = ABILITIES[st.car] || ABILITIES.balanced;
    const abKey = `${ab.icon}:${cdFrac.toFixed(2)}`;
    if (abilityFace.key !== abKey) {
      abilityFace.key = abKey;
      drawButtonFace(abilityFace, ab.icon, {
        frac: cdFrac,
        ring: cdFrac <= 0 ? 'rgba(74, 222, 128, 0.9)' : null,
        dim: cdFrac > 0,
      });
    }
    if (abilityRim.current) {
      abilityRim.current.emissive.copy(cdFrac <= 0 ? GOOD : DIM);
      abilityRim.current.emissiveIntensity = cdFrac <= 0 ? 0.9 + Math.sin(t * 5) * 0.25 : 0.15;
    }

    // press dip: buttons sink for ~0.2 s after firing
    P.powerupT = Math.min(1, P.powerupT + delta * 5);
    P.abilityT = Math.min(1, P.abilityT + delta * 5);
    const dip = (x) => Math.sin(Math.min(1, x) * Math.PI) * 0.012;
    if (powerupBtn.current) powerupBtn.current.position.z = 0.036 - dip(P.powerupT);
    if (abilityBtn.current) abilityBtn.current.position.z = 0.036 - dip(P.abilityT);

    // LCD redraw, throttled and only when the shown value changes
    lcd.acc += delta;
    const cms = Math.round(Math.abs(telemetry.speed) * (100 / M));
    if (lcd.acc > 0.08 && (cms !== lcd.last || Math.abs(frac - lcd.lastFrac) > 0.03)) {
      lcd.acc = 0;
      lcd.last = cms;
      lcd.lastFrac = frac;
      const { g: ctx, canvas } = lcd;
      ctx.fillStyle = '#0d1120';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = ACCENT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '700 62px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(String(cms), 138, 66);
      ctx.font = '600 20px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillStyle = 'rgba(255, 180, 84, 0.65)';
      ctx.fillText('CM/S', 182, 66);
      ctx.fillStyle = 'rgba(255, 180, 84, 0.9)';
      ctx.fillRect(12, 80, 168 * frac, 4);
      lcd.texture.needsUpdate = true;
    }
  });

  if (spectating || photoMode) return null;

  const mat = (props) => <meshStandardMaterial depthTest={false} {...props} />;

  const Stick = ({ x, knob, stickRef, restTilt }) => (
    <group position={[x, -0.012, 0.03]} renderOrder={1002}>
      {/* well + gaiter */}
      <mesh rotation-x={Math.PI / 2} renderOrder={1002}>
        <cylinderGeometry args={[0.055, 0.061, 0.018, 20]} />
        {mat({ color: BODY_DARK, roughness: 0.5 })}
      </mesh>
      {/* rest tilt lives on a wrapper so the animated axes never stomp it */}
      <group rotation-x={restTilt}>
      <group ref={stickRef}>
        <mesh position={[0, 0, 0.02]} renderOrder={1002}>
          <coneGeometry args={[0.034, 0.045, 12, 1, true]} />
          {mat({ color: '#10141f', roughness: 0.85, side: THREE.DoubleSide })}
        </mesh>
        <mesh position={[0, 0, 0.045]} rotation-x={Math.PI / 2} renderOrder={1002}>
          <cylinderGeometry args={[0.011, 0.015, 0.08, 10]} />
          {mat({ color: STICK, roughness: 0.35, emissive: '#39445f', emissiveIntensity: 0.5 })}
        </mesh>
        <mesh position={[0, 0, 0.092]} renderOrder={1002}>
          <sphereGeometry args={[0.032, 14, 12]} />
          {mat({ color: knob, roughness: 0.45, emissive: knob, emissiveIntensity: 0.7 })}
        </mesh>
      </group>
      </group>
    </group>
  );

  const ActionButton = ({ x, rimRef, btnRef, face }) => (
    <group position={[x, -0.118, 0]} renderOrder={1002}>
      {/* collar — emissive rim carries the ready/armed state */}
      <mesh position={[0, 0, 0.033]} rotation-x={Math.PI / 2} renderOrder={1002}>
        <cylinderGeometry args={[0.045, 0.049, 0.012, 20]} />
        <meshStandardMaterial
          ref={rimRef}
          depthTest={false}
          color={BODY_DARK}
          emissive={DIM}
          emissiveIntensity={0.15}
          toneMapped={false}
        />
      </mesh>
      {/* the button itself (dips when fired) */}
      <group ref={btnRef} position={[0, 0, 0.036]}>
        <mesh rotation-x={Math.PI / 2} renderOrder={1002}>
          <cylinderGeometry args={[0.038, 0.04, 0.014, 20]} />
          {mat({ color: FACE, roughness: 0.5 })}
        </mesh>
        <mesh position={[0, 0, 0.0075]} renderOrder={1003}>
          <circleGeometry args={[0.034, 24]} />
          <meshBasicMaterial map={face.texture} transparent depthTest={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );

  return createPortal(
    <group ref={root} renderOrder={1000}>
      {/* private fill light so the transmitter reads regardless of where the
          camera is in the office (tight falloff keeps it off the world;
          skipped on ?lowfx where every scene light costs shader time) */}
      {!LOWFX && <pointLight position={[0.25, 0.35, 0.55]} intensity={3.2} distance={1.3} decay={2} color="#e8eeff" />}

      {/* rounded two-tone shell: dark rim + lighter faceplate */}
      <RoundedBox args={[0.6, 0.34, 0.07]} radius={0.028} smoothness={3} renderOrder={1000}>
        {mat({ color: BODY, roughness: 0.55, metalness: 0.08 })}
      </RoundedBox>
      <RoundedBox args={[0.56, 0.3, 0.016]} radius={0.02} smoothness={3} position={[0, 0, 0.031]} renderOrder={1001}>
        {mat({ color: FACE, roughness: 0.6 })}
      </RoundedBox>
      {/* printed faceplate: brand line + Q/E keycap labels */}
      <mesh position={[0, 0, 0.0402]} renderOrder={1002}>
        <planeGeometry args={[0.6, 0.34]} />
        <meshBasicMaterial map={deco.texture} transparent depthTest={false} />
      </mesh>
      {/* accent stripe */}
      <mesh position={[0, 0.132, 0.04]} renderOrder={1002}>
        <boxGeometry args={[0.56, 0.014, 0.004]} />
        {mat({ color: ACCENT, roughness: 0.4 })}
      </mesh>
      {/* corner screws */}
      {[[-0.26, 0.145], [0.26, 0.145], [-0.26, -0.145], [0.26, -0.145]].map(([x, y]) => (
        <mesh key={`${x}${y}`} position={[x, y, 0.0395]} rotation-x={Math.PI / 2} renderOrder={1002}>
          <cylinderGeometry args={[0.008, 0.008, 0.004, 8]} />
          {mat({ color: '#454f68', roughness: 0.3, metalness: 0.7 })}
        </mesh>
      ))}

      {/* antenna (top-left), swaying with speed */}
      <group ref={antenna} position={[-0.245, 0.16, 0]} renderOrder={1001}>
        <mesh position={[0, 0.02, 0]} renderOrder={1001}>
          <cylinderGeometry args={[0.014, 0.017, 0.05, 10]} />
          {mat({ color: BODY_DARK, roughness: 0.5 })}
        </mesh>
        <mesh position={[0, 0.16, 0]} renderOrder={1001}>
          <cylinderGeometry args={[0.005, 0.008, 0.28, 6]} />
          {mat({ color: '#454f68', roughness: 0.35, metalness: 0.7 })}
        </mesh>
        <mesh position={[0, 0.31, 0]} renderOrder={1001}>
          <sphereGeometry args={[0.017, 8, 8]} />
          {mat({ color: '#e33b2f', roughness: 0.4, emissive: '#e33b2f', emissiveIntensity: 0.25 })}
        </mesh>
      </group>

      {/* link LED (top-right) */}
      <mesh position={[0.25, 0.128, 0.042]} renderOrder={1002}>
        <sphereGeometry args={[0.011, 8, 8]} />
        <meshStandardMaterial
          ref={signalMat}
          depthTest={false}
          color="#4ade80"
          emissive="#4ade80"
          emissiveIntensity={1}
          toneMapped={false}
        />
      </mesh>

      {/* LCD speed readout (bezel behind, screen in front) */}
      <mesh position={[0, 0.06, 0.0405]} renderOrder={1002}>
        <planeGeometry args={[0.27, 0.15]} />
        {mat({ color: BODY_DARK, roughness: 0.3 })}
      </mesh>
      <mesh position={[0, 0.06, 0.0425]} renderOrder={1003}>
        <planeGeometry args={[0.25, 0.125]} />
        <meshBasicMaterial map={lcd.texture} depthTest={false} toneMapped={false} />
      </mesh>

      {/* boost LED ladder under the LCD */}
      {Array.from({ length: LED_COUNT }, (_, i) => (
        <mesh key={i} position={[-0.098 + i * 0.028, -0.042, 0.042]} renderOrder={1002}>
          <boxGeometry args={[0.018, 0.02, 0.008]} />
          <meshStandardMaterial
            ref={(m) => { ledMats.current[i] = m; }}
            depthTest={false}
            color={LED_OFF}
            emissive={LED_OFF}
            emissiveIntensity={0}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* sticks: left steers, right throttles */}
      <Stick x={-0.2} knob={ACCENT} stickRef={steerStick} restTilt={-0.22} />
      <Stick x={0.2} knob="#c9cfd8" stickRef={throttleStick} restTilt={-0.22} />

      {/* Q ability + E powerup as physical lit buttons */}
      <ActionButton x={-0.062} rimRef={abilityRim} btnRef={abilityBtn} face={abilityFace} />
      <ActionButton x={0.062} rimRef={powerupRim} btnRef={powerupBtn} face={powerupFace} />
    </group>,
    camera,
  );
}
