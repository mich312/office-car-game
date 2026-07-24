// Procedural RC car visuals — five body styles, spinning/steering wheels,
// body roll, boost flame, headlights, shield bubble, battery pack, name tag,
// and equipped cosmetics (hats, antenna variants, trails).
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CARS, SUSPENSION_SETTLE, WHEEL_STYLES, DEFAULT_STYLE, sanitizeStyle } from '@rc/shared';
import { vinylTopTex, vinylSideTex, glowTex } from './textures.js';
import { useStore } from '../store.js';
import TextSprite from './TextSprite.jsx';
import Trail from './Trail.jsx';

const WHEEL_POS = [
  [-0.3, 0.34], [0.3, 0.34],
  [-0.3, -0.34], [0.3, -0.34],
];

// Where a bolt-on spoiler mounts per body: [deck y, deck z, half width]
const SPOILER_MOUNT = {
  buggy: [0.13, -0.42, 0.23],
  drift: [0.06, -0.44, 0.27],
  monster: [0.24, -0.36, 0.24],
  formula: [0.05, -0.46, 0.24],
  balanced: [0.09, -0.42, 0.26],
};

// Vinyl wrap planes per body: top [w, l, y, z], side [l, h, y, x, z]
const DECAL_FIT = {
  buggy: { top: [0.46, 0.8, 0.155, 0.02], side: [0.8, 0.14, 0.02, 0.26, 0] },
  drift: { top: [0.5, 0.9, 0.2, -0.06], side: [0.9, 0.11, -0.01, 0.28, 0] },
  monster: { top: [0.42, 0.7, 0.395, 0], side: [0.75, 0.18, 0.11, 0.26, 0] },
  formula: { top: [0.24, 0.85, 0.115, 0.1], side: [0.85, 0.1, -0.02, 0.14, 0.1] },
  balanced: { top: [0.5, 0.9, 0.245, -0.1], side: [0.9, 0.15, 0, 0.28, 0] },
};

// 4-step toon ramp (shared): banded shading gives the cars a plastic-toy pop
// against the realistic office. NearestFilter keeps the bands crisp.
let _ramp = null;
function toonRamp() {
  if (_ramp) return _ramp;
  const data = new Uint8Array([70, 135, 200, 255]);
  _ramp = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
  _ramp.needsUpdate = true;
  return _ramp;
}

// Inverted-hull outline — rendered backface-only so it draws a clean dark
// rim around the painted shell (works for boxes and extruded shells alike).
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: '#0b0c12', side: THREE.BackSide });

// ---------------------------------------------------------------- shells
// Die-cast-toy silhouettes: each body is a 2D side profile (x = length,
// +x = nose; y = height) extruded across the car's width with a bevel.
// Geometries are cached per car id and shared by every car in the lobby.
const SHELL_W = { buggy: 0.5, drift: 0.54, monster: 0.5, formula: 0.26, balanced: 0.54 };
const shellCache = new Map();
function shellGeo(carId) {
  if (shellCache.has(carId)) return shellCache.get(carId);
  const s = new THREE.Shape();
  switch (carId) {
    case 'buggy': // chunky open-top with a sloped nose
      s.moveTo(-0.44, -0.06); s.lineTo(-0.44, 0.09); s.lineTo(-0.3, 0.13); s.lineTo(0.02, 0.13);
      s.quadraticCurveTo(0.24, 0.12, 0.36, 0.06); s.quadraticCurveTo(0.45, 0.02, 0.44, -0.06);
      break;
    case 'drift': // low coupe: ducktail, fast roofline
      s.moveTo(-0.48, -0.07); s.lineTo(-0.48, 0.06); s.lineTo(-0.44, 0.1); s.lineTo(-0.34, 0.09);
      s.quadraticCurveTo(-0.26, 0.17, -0.14, 0.17); s.lineTo(0.03, 0.17);
      s.quadraticCurveTo(0.16, 0.13, 0.26, 0.07); s.lineTo(0.44, 0.05);
      s.quadraticCurveTo(0.48, 0.03, 0.48, -0.07);
      break;
    case 'monster': // tall pickup cab over a stubby bed
      s.moveTo(-0.4, -0.02); s.lineTo(-0.4, 0.14); s.lineTo(-0.16, 0.14); s.lineTo(-0.13, 0.3);
      s.quadraticCurveTo(0.0, 0.32, 0.08, 0.3); s.lineTo(0.19, 0.16); s.lineTo(0.38, 0.14);
      s.quadraticCurveTo(0.42, 0.1, 0.4, -0.02);
      break;
    case 'formula': // needle nose, engine cover behind the driver
      s.moveTo(-0.45, -0.05); s.lineTo(-0.45, 0.07); s.quadraticCurveTo(-0.28, 0.11, -0.12, 0.09);
      s.lineTo(0.06, 0.07); s.lineTo(0.4, 0.03); s.quadraticCurveTo(0.47, 0.02, 0.47, -0.05);
      break;
    default: // balanced hatch: honest two-box
      s.moveTo(-0.48, -0.08); s.lineTo(-0.48, 0.1); s.quadraticCurveTo(-0.44, 0.13, -0.34, 0.14);
      s.quadraticCurveTo(-0.3, 0.21, -0.2, 0.22); s.lineTo(0.0, 0.22);
      s.quadraticCurveTo(0.12, 0.2, 0.2, 0.12); s.lineTo(0.42, 0.1);
      s.quadraticCurveTo(0.48, 0.07, 0.48, -0.08);
      break;
  }
  s.closePath();
  const w = SHELL_W[carId] ?? 0.54;
  const depth = Math.max(0.1, w - 0.06); // bevel adds the rest of the width
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 5,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2); // profile length → world +z (car forward)
  shellCache.set(carId, geo);
  return geo;
}

// The tiny driver: helmet, visor, torso. Leans into corners via driverRef.
function Driver({ mats, y, z, s = 1, refGroup }) {
  return (
    <group ref={refGroup} position={[0, y, z]} scale={s}>
      <mesh castShadow position={[0, 0.05, 0]} material={mats.dark}>
        <boxGeometry args={[0.16, 0.12, 0.1]} />
      </mesh>
      <mesh castShadow position={[0, 0.16, 0]} material={mats.accent}>
        <sphereGeometry args={[0.075, 10, 8]} />
      </mesh>
      <mesh position={[0, 0.155, 0.055]} material={mats.glassDark}>
        <boxGeometry args={[0.09, 0.045, 0.03]} />
      </mesh>
    </group>
  );
}

// Roof height per body style — where hats sit.
const ROOF_Y = { buggy: 0.3, drift: 0.22, monster: 0.4, formula: 0.21, balanced: 0.29 };

export default function CarModel({ carId, paint, style, name, cosmetics, isLocal = false, speedRef, steerRef, boostingRef, flagsRef, wheelYRef, leanRef, team }) {
  const car = CARS[carId] || CARS.balanced;
  const color = paint || car.color;
  const st = useMemo(() => (style ? sanitizeStyle(style) : DEFAULT_STYLE), [style]);
  const night = useStore((s) => s.night);
  const event = useStore((s) => s.event);
  const dark = night || event?.id === 'lights_out';
  const wheels = useRef([]);
  const wheelGroups = useRef([]);
  const bodyRef = useRef();
  const flameRef = useRef();
  const shieldRef = useRef();
  const batteryRef = useRef();
  const stunRef = useRef();
  const antennaRef = useRef();
  const propellerRef = useRef();
  const driverRef = useRef();
  const trailAnchor = useRef();
  const spin = useRef(0);
  // spotlight targets must live in the scene graph to follow the car — a
  // loose `target-position` stays fixed in world space (the old headlight bug)
  const beamTarget = useMemo(() => new THREE.Object3D(), []);
  const wheelStyle = WHEEL_STYLES[st.wheels] || WHEEL_STYLES.stock;

  const mats = useMemo(() => ({
    // toon-shaded shell + accents; metal rims and glass stay PBR for sparkle
    body: new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() }),
    dark: new THREE.MeshToonMaterial({ color: '#191c22', gradientMap: toonRamp() }),
    tire: new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: wheelStyle.rim, metalness: 0.92, roughness: 0.18 }),
    glassDark: new THREE.MeshStandardMaterial({ color: '#0e1116', roughness: 0.1, metalness: 0.6 }),
    accent: new THREE.MeshToonMaterial({ color: '#f5f5f5', gradientMap: toonRamp() }),
  }), [color, wheelStyle.rim]);

  useFrame((state, dt) => {
    const speed = speedRef?.current ?? 0;
    const steer = steerRef?.current ?? 0;
    const t = state.clock.elapsedTime;
    spin.current += (speed / 0.14) * dt;
    wheels.current.forEach((w, i) => {
      if (!w) return;
      w.rotation.x = spin.current;
      if (i < 2 && w.parent) w.parent.rotation.y = steer * 0.42;
      // wheels follow the suspension rays (local car) — touch the ground, compress, droop
      const g = wheelGroups.current[i];
      if (g && wheelYRef?.current) {
        g.position.y += (wheelYRef.current[i] - g.position.y) * Math.min(1, dt * 22);
      }
    });
    if (bodyRef.current) {
      // Weight transfer on the visual shell. With a leanRef (in-game cars,
      // local & remote) roll/pitch come from measured acceleration: outward
      // roll in curves, squat under throttle, dive under braking, easing back
      // to neutral. Without one (garage preview) fall back to steer-based roll.
      const lean = leanRef?.current;
      const tRoll = lean ? lean.roll : steer * Math.min(1, Math.abs(speed) / 25) * 0.09;
      const tPitch = lean ? lean.pitch : 0;
      bodyRef.current.rotation.z += (tRoll - bodyRef.current.rotation.z) * Math.min(1, dt * 8);
      bodyRef.current.rotation.x += (tPitch - bodyRef.current.rotation.x) * Math.min(1, dt * 8);
    }
    if (flameRef.current) {
      const on = boostingRef?.current;
      flameRef.current.visible = !!on;
      if (on) flameRef.current.scale.setScalar(0.8 + Math.random() * 0.5);
    }
    const flags = flagsRef?.current ?? 0;
    if (shieldRef.current) {
      // bit 8 = shield item (blue), bit 64 = spawn protection (green pulse)
      const prot = !!(flags & 64) && !(flags & 8);
      shieldRef.current.visible = !!(flags & 8) || !!(flags & 64);
      if (shieldRef.current.visible) {
        shieldRef.current.rotation.y += dt * 2;
        shieldRef.current.material.color.set(prot ? '#7dffb0' : '#7ad8ff');
        shieldRef.current.material.opacity = prot ? 0.14 + Math.abs(Math.sin(performance.now() / 180)) * 0.1 : 0.22;
      }
    }
    if (batteryRef.current) batteryRef.current.visible = !!(flags & 32);
    if (stunRef.current) {
      stunRef.current.visible = !!(flags & 4);
      if (stunRef.current.visible) stunRef.current.rotation.y += dt * 8;
    }
    // antenna sway: whips back with speed, bobbles with time, leans in turns
    if (antennaRef.current) {
      const sway = Math.min(1, Math.abs(speed) / 12);
      antennaRef.current.rotation.x = Math.sin(t * 6) * 0.14 * sway - Math.min(0.35, Math.abs(speed) * 0.014);
      antennaRef.current.rotation.z = steer * 0.18 * sway;
    }
    if (propellerRef.current) propellerRef.current.rotation.y += dt * (3 + Math.abs(speed) * 0.8);
    // the driver leans into corners and hunkers down with speed
    if (driverRef.current) {
      const lean = -steer * Math.min(1, Math.abs(speed) / 14) * 0.35;
      driverRef.current.rotation.z += (lean - driverRef.current.rotation.z) * Math.min(1, dt * 7);
      driverRef.current.rotation.x = Math.min(0.18, Math.abs(speed) * 0.008);
    }
  });

  const wheelR = carId === 'monster' ? 0.18 : 0.13;
  const wheelW = carId === 'formula' ? 0.1 : 0.14;
  // rest pose: wheels at equilibrium suspension sag, tires kissing the floor
  const restY = -0.05 - SUSPENSION_SETTLE + wheelR;
  const decal = DECAL_FIT[carId] || DECAL_FIT.balanced;

  return (
    <group>
      <group ref={bodyRef}>
        <Body carId={carId} mats={mats} driverRef={driverRef} />
        {st.vinyl !== 'none' && <Vinyl id={st.vinyl} color={st.vinylColor} fit={decal} />}
        {st.spoiler !== 'none' && (
          <Spoiler id={st.spoiler} mount={SPOILER_MOUNT[carId] || SPOILER_MOUNT.balanced} mats={mats} />
        )}
        {/* headlights */}
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.02, 0.5]}>
            <boxGeometry args={[0.09, 0.06, 0.02]} />
            <meshStandardMaterial color="#fffce0" emissive="#fff6c0" emissiveIntensity={dark ? 3.5 : 0.4} toneMapped={false} />
          </mesh>
        ))}
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.04, -0.5]}>
            <boxGeometry args={[0.08, 0.05, 0.02]} />
            <meshStandardMaterial color="#3d0505" emissive="#ff2222" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        ))}
        {isLocal && dark && (
          <>
            {/* the target is a child of the car body, so the beam always
                shines out of the front and dips toward the road ahead */}
            <primitive object={beamTarget} position={[0, -0.6, 7]} />
            <spotLight position={[0, 0.15, 0.5]} target={beamTarget} angle={0.55} intensity={30} distance={30} penumbra={0.5} color="#fff3cf" />
          </>
        )}
        {/* antenna (equipped variant or the stock whip) */}
        <group ref={antennaRef} position={[-0.2, 0.14, -0.4]}>
          <Antenna kind={cosmetics?.antenna} />
        </group>
        {/* hat, socketed to the roof */}
        {cosmetics?.hat && (
          <group position={[0, ROOF_Y[carId] ?? 0.28, -0.05]}>
            <Hat kind={cosmetics.hat} propellerRef={propellerRef} />
          </group>
        )}
      </group>
      {/* wheels */}
      {WHEEL_POS.map(([x, z], i) => (
        <group key={i} ref={(el) => (wheelGroups.current[i] = el)} position={[x, restY, z]}>
          <group>
            <Wheel
              style={wheelStyle}
              r={wheelR}
              w={wheelW}
              mats={mats}
              innerRef={(el) => (wheels.current[i] = el)}
            />
          </group>
        </group>
      ))}
      {/* underglow */}
      {st.glow && (
        <group>
          <mesh position={[0, restY - wheelR + 0.015, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.15, 1.55]} />
            <meshBasicMaterial
              map={glowTex()}
              color={st.glow}
              transparent
              opacity={dark ? 0.95 : 0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {isLocal && dark && <pointLight position={[0, -0.1, 0]} color={st.glow} intensity={5} distance={2.2} />}
        </group>
      )}
      {/* boost flame */}
      <mesh ref={flameRef} position={[0, -0.02, -0.62]} rotation-x={-Math.PI / 2} visible={false}>
        <coneGeometry args={[0.09, 0.42, 8]} />
        <meshBasicMaterial color="#7ab8ff" toneMapped={false} transparent opacity={0.9} />
      </mesh>
      {/* shield bubble */}
      <mesh ref={shieldRef} visible={false}>
        <sphereGeometry args={[0.85, 18, 14]} />
        <meshPhysicalMaterial color="#7ad8ff" transparent opacity={0.22} roughness={0} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* battery pack */}
      <group ref={batteryRef} visible={false} position={[0, 0.35, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.18, 0.5]} />
          <meshStandardMaterial color="#2ecc71" emissive="#2ecc71" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.28]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.05, 0.05, 0.08, 8]} />
          <meshStandardMaterial color="#f1c40f" />
        </mesh>
      </group>
      {/* stun stars */}
      <group ref={stunRef} visible={false} position={[0, 0.55, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.35, 0, Math.sin((i / 3) * Math.PI * 2) * 0.35]}>
            <sphereGeometry args={[0.05, 6, 6]} />
            <meshBasicMaterial color="#ffe27a" toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* trail anchor + ribbon (world-space, portaled to the scene root) */}
      <group ref={trailAnchor} position={[0, 0.06, -0.55]} />
      {cosmetics?.trail && <Trail kind={cosmetics.trail} anchorRef={trailAnchor} speedRef={speedRef} />}
      {/* name tag */}
      {!isLocal && name && (
        <TextSprite text={name} size={0.34} y={1.2} color={team === 1 ? '#7ab8ff' : team === 0 ? '#ffb37a' : 'white'} />
      )}
    </group>
  );
}

// One wheel: tire + styled rim. innerRef is the spin group (rotation.x per
// frame); the wheel axis runs along local x.
function Wheel({ style, r, w, mats, innerRef }) {
  const spokes = [];
  for (let i = 0; i < (style.spokes || 0); i++) spokes.push((i / style.spokes) * Math.PI * 2);
  return (
    <group ref={innerRef}>
      <mesh rotation-z={Math.PI / 2} castShadow material={mats.tire}>
        <cylinderGeometry args={[r, r, w, 14]} />
      </mesh>
      {/* hub */}
      <mesh rotation-z={Math.PI / 2} material={mats.rim}>
        <cylinderGeometry args={[r * (style.disc ? 0.72 : 0.2), r * (style.disc ? 0.72 : 0.2), w + 0.012, style.disc ? 18 : 8]} />
      </mesh>
      {/* spokes radiate in the wheel plane (yz) */}
      {spokes.map((a, i) => (
        <group key={i} rotation-x={a}>
          <mesh position={[0, r * 0.36, 0]} material={mats.rim}>
            <boxGeometry args={[w * 0.55, r * 0.75, 0.045]} />
          </mesh>
        </group>
      ))}
      {/* outer ring ties the spokes together */}
      {!style.disc && style.spokes > 0 && (
        <mesh rotation-y={Math.PI / 2} material={mats.rim}>
          <torusGeometry args={[r * 0.68, 0.022, 6, 18]} />
        </mesh>
      )}
      {/* deep-dish lip */}
      {style.lip && (
        <mesh rotation-y={Math.PI / 2} material={mats.rim}>
          <torusGeometry args={[r * 0.6, 0.035, 6, 18]} />
        </mesh>
      )}
      {/* stock steelie keeps the simple flat cap */}
      {!style.disc && !style.spokes && (
        <mesh rotation-z={Math.PI / 2} material={mats.rim}>
          <cylinderGeometry args={[r * 0.55, r * 0.55, w + 0.01, 8]} />
        </mesh>
      )}
    </group>
  );
}

// Bolt-on spoilers, painted body color with dark struts.
function Spoiler({ id, mount, mats }) {
  const [y, z, hw] = mount;
  switch (id) {
    case 'duck':
      return (
        <mesh castShadow material={mats.body} position={[0, y + 0.04, z]} rotation-x={0.38}>
          <boxGeometry args={[hw * 2, 0.022, 0.13]} />
        </mesh>
      );
    case 'gt':
      return (
        <group position={[0, y, z]}>
          {[-hw * 0.7, hw * 0.7].map((x) => (
            <mesh key={x} material={mats.dark} position={[x, 0.06, 0]}>
              <boxGeometry args={[0.025, 0.12, 0.03]} />
            </mesh>
          ))}
          <mesh castShadow material={mats.body} position={[0, 0.13, 0]} rotation-x={0.12}>
            <boxGeometry args={[hw * 2, 0.022, 0.15]} />
          </mesh>
          {[-hw, hw].map((x) => (
            <mesh key={x} material={mats.body} position={[x, 0.13, 0]}>
              <boxGeometry args={[0.02, 0.07, 0.15]} />
            </mesh>
          ))}
        </group>
      );
    case 'mega':
      return (
        <group position={[0, y, z]}>
          {[-hw * 0.75, hw * 0.75].map((x) => (
            <mesh key={x} material={mats.dark} position={[x, 0.11, 0]}>
              <boxGeometry args={[0.03, 0.22, 0.035]} />
            </mesh>
          ))}
          <mesh castShadow material={mats.body} position={[0, 0.23, 0]} rotation-x={0.16}>
            <boxGeometry args={[hw * 2 + 0.12, 0.026, 0.17]} />
          </mesh>
          {[-(hw + 0.06), hw + 0.06].map((x) => (
            <mesh key={x} material={mats.body} position={[x, 0.23, 0]}>
              <boxGeometry args={[0.025, 0.1, 0.18]} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

// Vinyl wrap: transparent decal planes hugging the roof/hood and doors.
function Vinyl({ id, color, fit }) {
  const topT = vinylTopTex(id, color);
  const sideT = vinylSideTex(id, color);
  const [tw, tl, ty, tz] = fit.top;
  const [sl, sh, sy, sx, sz] = fit.side;
  const mat = (tex) => (
    <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
  );
  return (
    <group>
      <mesh position={[0, ty + 0.004, tz]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[tw, tl]} />
        {mat(topT)}
      </mesh>
      {[1, -1].map((s) => (
        // mirrored so the flames pour nose-to-tail on both doors
        <mesh key={s} position={[sx * s, sy, sz]} rotation-y={(Math.PI / 2) * s} scale-x={s}>
          <planeGeometry args={[sl, sh]} />
          {mat(sideT)}
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------- cosmetics
const FLAG_SHAPE = new THREE.Shape();
FLAG_SHAPE.moveTo(0, 0); FLAG_SHAPE.lineTo(0.22, 0.06); FLAG_SHAPE.lineTo(0, 0.12);

function Antenna({ kind }) {
  return (
    <group>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.008, 0.012, 0.45, 6]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {kind === 'ball' ? (
        <mesh position={[0, 0.48, 0]}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#ffb347" emissive="#ff8c00" emissiveIntensity={0.35} roughness={0.3} />
        </mesh>
      ) : kind === 'flag' ? (
        <mesh position={[0.005, 0.34, 0]} rotation-y={Math.PI / 2}>
          <shapeGeometry args={[FLAG_SHAPE]} />
          <meshStandardMaterial color="#e8332a" side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ) : (
        <mesh position={[0, 0.46, 0]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#ff3333" />
        </mesh>
      )}
    </group>
  );
}

function Hat({ kind, propellerRef }) {
  switch (kind) {
    case 'cone':
      return (
        <group>
          <mesh castShadow position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.13, 0.15, 0.025, 10]} />
            <meshStandardMaterial color="#ff6b1a" roughness={0.7} />
          </mesh>
          <mesh castShadow position={[0, 0.11, 0]}>
            <coneGeometry args={[0.1, 0.2, 10]} />
            <meshStandardMaterial color="#ff6b1a" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.075, 0.085, 0.045, 10]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.7} />
          </mesh>
        </group>
      );
    case 'tophat':
      return (
        <group>
          <mesh castShadow position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.02, 14]} />
            <meshStandardMaterial color="#15161c" roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.1, 0.11, 0.2, 14]} />
            <meshStandardMaterial color="#15161c" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.035, 0]}>
            <cylinderGeometry args={[0.112, 0.112, 0.03, 14]} />
            <meshStandardMaterial color="#c0392b" roughness={0.6} />
          </mesh>
        </group>
      );
    case 'propeller':
      return (
        <group>
          <mesh castShadow position={[0, 0.035, 0]}>
            <sphereGeometry args={[0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#3498db" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.06, 6]} />
            <meshStandardMaterial color="#f1c40f" />
          </mesh>
          <group ref={propellerRef} position={[0, 0.15, 0]}>
            {[0, Math.PI / 2].map((r) => (
              <mesh key={r} rotation-y={r}>
                <boxGeometry args={[0.3, 0.012, 0.045]} />
                <meshStandardMaterial color="#e8332a" roughness={0.5} />
              </mesh>
            ))}
          </group>
        </group>
      );
    case 'plant':
      return (
        <group>
          <mesh castShadow position={[0, 0.045, 0]}>
            <cylinderGeometry args={[0.07, 0.055, 0.09, 10]} />
            <meshStandardMaterial color="#b5651d" roughness={0.85} />
          </mesh>
          {[[0, 0.14, 0, 0.06], [-0.045, 0.12, 0.02, 0.045], [0.04, 0.125, -0.03, 0.05]].map(([x, y, z, r], i) => (
            <mesh key={i} castShadow position={[x, y, z]}>
              <sphereGeometry args={[r, 8, 6]} />
              <meshStandardMaterial color="#2ecc71" roughness={0.8} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

// Far-LOD stand-in: the shared shell geometry + a dark base — two meshes
// instead of ~20, but the silhouette matches so the LOD switch is invisible.
export function CarProxy({ carId, paint }) {
  const car = CARS[carId] || CARS.balanced;
  const color = paint || car.color;
  const mat = useMemo(() => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() }), [color]);
  return (
    <group position={[0, -0.05, 0]}>
      <mesh geometry={shellGeo(carId)} material={mat} />
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[0.62, 0.14, 0.8]} />
        <meshBasicMaterial color="#17181c" />
      </mesh>
    </group>
  );
}

function Body({ carId, mats, driverRef }) {
  const geo = shellGeo(carId);
  const shell = (
    <>
      <mesh geometry={geo} material={OUTLINE_MAT} scale={1.06} />
      <mesh castShadow geometry={geo} material={mats.body} />
    </>
  );
  switch (carId) {
    case 'buggy':
      return (
        <group>
          {shell}
          <Driver mats={mats} y={0.11} z={-0.08} refGroup={driverRef} />
          {/* roll cage */}
          {[-0.16, 0.16].map((x) => (
            <mesh key={x} castShadow material={mats.rim} position={[x, 0.2, -0.05]} rotation-x={0.2}>
              <torusGeometry args={[0.16, 0.02, 6, 10, Math.PI]} />
            </mesh>
          ))}
          {/* front skid plate */}
          <mesh castShadow material={mats.dark} position={[0, -0.01, 0.42]} rotation-x={0.5}>
            <boxGeometry args={[0.44, 0.02, 0.14]} />
          </mesh>
        </group>
      );
    case 'drift':
      return (
        <group>
          {shell}
          {/* raked windshield + rear glass */}
          <mesh castShadow material={mats.glassDark} position={[0, 0.13, 0.12]} rotation-x={-0.6}>
            <boxGeometry args={[0.44, 0.02, 0.16]} />
          </mesh>
          <mesh castShadow material={mats.glassDark} position={[0, 0.13, -0.23]} rotation-x={0.55}>
            <boxGeometry args={[0.44, 0.02, 0.15]} />
          </mesh>
          {/* big spoiler */}
          <mesh castShadow material={mats.body} position={[0, 0.2, -0.44]}>
            <boxGeometry args={[0.56, 0.025, 0.14]} />
          </mesh>
          {[-0.22, 0.22].map((x) => (
            <mesh key={x} castShadow material={mats.dark} position={[x, 0.14, -0.44]}>
              <boxGeometry args={[0.03, 0.1, 0.1]} />
            </mesh>
          ))}
          {/* side exhaust */}
          <mesh castShadow material={mats.rim} position={[0.24, -0.03, -0.42]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.025, 0.03, 0.1, 8]} />
          </mesh>
        </group>
      );
    case 'monster':
      return (
        <group position={[0, 0.06, 0]}>
          {shell}
          {/* windshield + bull bar + exhaust stacks */}
          <mesh castShadow material={mats.glassDark} position={[0, 0.23, 0.17]} rotation-x={-0.7}>
            <boxGeometry args={[0.4, 0.02, 0.17]} />
          </mesh>
          <mesh castShadow material={mats.rim} position={[0, 0.02, 0.42]}>
            <boxGeometry args={[0.5, 0.08, 0.06]} />
          </mesh>
          {[-0.19, 0.19].map((x) => (
            <mesh key={x} castShadow material={mats.rim} position={[x, 0.2, -0.12]}>
              <cylinderGeometry args={[0.02, 0.025, 0.16, 8]} />
            </mesh>
          ))}
        </group>
      );
    case 'formula':
      return (
        <group>
          {shell}
          <Driver mats={mats} y={0.06} z={-0.02} s={0.85} refGroup={driverRef} />
          {/* airbox behind the driver */}
          <mesh castShadow material={mats.dark} position={[0, 0.1, -0.2]}>
            <sphereGeometry args={[0.08, 10, 8]} />
          </mesh>
          {/* wings */}
          <mesh castShadow material={mats.accent} position={[0, 0.0, 0.5]}>
            <boxGeometry args={[0.6, 0.02, 0.14]} />
          </mesh>
          <mesh castShadow material={mats.accent} position={[0, 0.14, -0.45]}>
            <boxGeometry args={[0.56, 0.02, 0.16]} />
          </mesh>
          {[-0.26, 0.26].map((x) => (
            <mesh key={x} castShadow material={mats.body} position={[x, 0.08, -0.45]}>
              <boxGeometry args={[0.02, 0.12, 0.16]} />
            </mesh>
          ))}
        </group>
      );
    default: // balanced hatchback
      return (
        <group>
          {shell}
          <mesh castShadow material={mats.glassDark} position={[0, 0.17, 0.13]} rotation-x={-0.55}>
            <boxGeometry args={[0.44, 0.02, 0.19]} />
          </mesh>
          <mesh castShadow material={mats.glassDark} position={[0, 0.17, -0.29]} rotation-x={0.5}>
            <boxGeometry args={[0.44, 0.02, 0.17]} />
          </mesh>
          {/* roof rail accents */}
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} castShadow material={mats.dark} position={[x, 0.23, -0.1]}>
              <boxGeometry args={[0.02, 0.015, 0.34]} />
            </mesh>
          ))}
        </group>
      );
  }
}
