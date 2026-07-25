// Diegetic drive cluster: a toy RC transmitter held at the bottom-left of
// the screen. The sticks physically mirror your steering/throttle, the LCD
// shows speed, the LED ladder is the boost meter, and the antenna sways
// with speed. Replaces the flat speed/boost HUD on fine-pointer devices.
//
// It lives INSIDE the game canvas (portaled onto the camera), so it catches
// the same bloom/tone mapping as the world; depthTest is off so office
// geometry never clips through it.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../store.js';
import { telemetry } from './LocalCar.jsx';

const BODY = '#232837';
const BODY_DARK = '#191d2a';
const ACCENT = '#ffb454';
const LED_ON = new THREE.Color('#5cc8ff');
const LED_FULL = new THREE.Color('#ffb454');
const LED_OFF = new THREE.Color('#11151f');
const LED_COUNT = 8;
const LOWFX = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lowfx');

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

  // LCD speed readout on a small canvas texture, redrawn when the value changes
  const lcd = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 96;
    const g = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas, g, texture, last: -1, lastFrac: -1, acc: 1 };
  }, []);

  useFrame((state, delta) => {
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    // pin to the bottom-left of the view (fov animates with speed, so
    // recompute every frame)
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.5;
    const halfW = halfH * camera.aspect;
    g.position.set(-halfW + 0.44, -halfH + 0.3, -1.5);

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
    if (steerStick.current) steerStick.current.rotation.y += (-steer * 0.5 - steerStick.current.rotation.y) * k;
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

  return createPortal(
    <group ref={root} renderOrder={1000}>
      {/* private fill light so the transmitter reads regardless of where the
          camera is in the office (tight falloff keeps it off the world;
          skipped on ?lowfx where every scene light costs shader time) */}
      {!LOWFX && <pointLight position={[0.25, 0.35, 0.55]} intensity={3} distance={1.3} decay={2} color="#e8eeff" />}
      {/* main shell + grip strip */}
      <mesh renderOrder={1000}>
        <boxGeometry args={[0.5, 0.3, 0.07]} />
        {mat({ color: BODY, roughness: 0.55, metalness: 0.1 })}
      </mesh>
      <mesh position={[0, -0.165, 0]} renderOrder={1000}>
        <boxGeometry args={[0.44, 0.09, 0.062]} />
        {mat({ color: BODY_DARK, roughness: 0.6 })}
      </mesh>
      {/* accent stripe along the top edge */}
      <mesh position={[0, 0.118, 0.036]} renderOrder={1001}>
        <boxGeometry args={[0.5, 0.016, 0.004]} />
        {mat({ color: ACCENT, roughness: 0.4 })}
      </mesh>

      {/* antenna (top-left), swaying with speed */}
      <group ref={antenna} position={[-0.21, 0.14, 0]} renderOrder={1001}>
        <mesh position={[0, 0.14, 0]} renderOrder={1001}>
          <cylinderGeometry args={[0.006, 0.009, 0.3, 6]} />
          {mat({ color: '#39445f', roughness: 0.35, metalness: 0.7 })}
        </mesh>
        <mesh position={[0, 0.3, 0]} renderOrder={1001}>
          <sphereGeometry args={[0.016, 8, 8]} />
          {mat({ color: '#e33b2f', roughness: 0.4 })}
        </mesh>
      </group>

      {/* link LED (top-right) */}
      <mesh position={[0.215, 0.115, 0.038]} renderOrder={1001}>
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
      <mesh position={[0.09, 0.05, 0.036]} renderOrder={1001}>
        <planeGeometry args={[0.27, 0.15]} />
        {mat({ color: BODY_DARK, roughness: 0.3 })}
      </mesh>
      <mesh position={[0.09, 0.05, 0.038]} renderOrder={1002}>
        <planeGeometry args={[0.25, 0.125]} />
        <meshBasicMaterial map={lcd.texture} depthTest={false} toneMapped={false} />
      </mesh>

      {/* boost LED ladder under the LCD */}
      {Array.from({ length: LED_COUNT }, (_, i) => (
        <mesh key={i} position={[-0.01 + i * 0.028, -0.045, 0.038]} renderOrder={1002}>
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

      {/* steer stick (left) — mirrors your actual steering */}
      <group position={[-0.155, 0.01, 0.035]} renderOrder={1002}>
        <mesh rotation-x={Math.PI / 2} renderOrder={1002}>
          <cylinderGeometry args={[0.052, 0.058, 0.016, 16]} />
          {mat({ color: BODY_DARK, roughness: 0.5 })}
        </mesh>
        {/* resting tilt keeps the knob silhouetted off its base at idle */}
        <group ref={steerStick} rotation-x={-0.22}>
          <mesh position={[0, 0, 0.042]} rotation-x={Math.PI / 2} renderOrder={1002}>
            <cylinderGeometry args={[0.011, 0.015, 0.08, 8]} />
            {mat({ color: '#8b97b4', roughness: 0.35, emissive: '#39445f', emissiveIntensity: 0.5 })}
          </mesh>
          <mesh position={[0, 0, 0.09]} renderOrder={1002}>
            <sphereGeometry args={[0.03, 12, 10]} />
            {mat({ color: ACCENT, roughness: 0.45, emissive: ACCENT, emissiveIntensity: 0.45 })}
          </mesh>
        </group>
      </group>

      {/* throttle stick (bottom-right) — leans forward with the gas */}
      <group position={[0.1, -0.1, 0.035]} renderOrder={1002}>
        <mesh rotation-x={Math.PI / 2} renderOrder={1002}>
          <cylinderGeometry args={[0.042, 0.048, 0.016, 16]} />
          {mat({ color: BODY_DARK, roughness: 0.5 })}
        </mesh>
        <group rotation-y={-0.2}>
        <group ref={throttleStick}>
          <mesh position={[0, 0, 0.036]} rotation-x={Math.PI / 2} renderOrder={1002}>
            <cylinderGeometry args={[0.01, 0.014, 0.068, 8]} />
            {mat({ color: '#8b97b4', roughness: 0.35, emissive: '#39445f', emissiveIntensity: 0.5 })}
          </mesh>
          <mesh position={[0, 0, 0.077]} renderOrder={1002}>
            <sphereGeometry args={[0.026, 12, 10]} />
            {mat({ color: '#c9cfd8', roughness: 0.45, emissive: '#9aa7c0', emissiveIntensity: 0.4 })}
          </mesh>
        </group>
        </group>
      </group>
    </group>,
    camera,
  );
}
