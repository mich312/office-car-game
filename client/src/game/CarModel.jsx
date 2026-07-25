// Procedural RC car visuals — five body styles, spinning/steering wheels,
// body roll, boost flame, headlights, shield bubble, battery pack, name tag,
// equipped cosmetics (hats, antenna variants, trails), a per-body detail kit
// (fender flares, splitter, grille, mirrors, exhaust, name plate) and the
// visible half of the setup sheet: ride height, tyre width and wing angle all
// read straight off the tuning numbers the car drives with.
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CARS, WHEEL_STYLES, DEFAULT_STYLE, sanitizeStyle, FINISHES,
  tunedStats, sanitizeTune, STOCK_TUNE,
} from '@rc/shared';
import { vinylTopTex, vinylSideTex, glowTex, plateTex } from './textures.js';
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

// Per-body detail kit. Everything here is a few boxes and cylinders, but it's
// the difference between "extruded shape" and "model of a car": lamps that sit
// on the actual nose instead of floating off it, arches over the wheels,
// a splitter, mirrors, a pipe and an asset-tag plate.
// Only the numbers that are genuinely per-body live here — heights, widths and
// which parts a body has at all. The fore/aft mounting planes are measured off
// the shell instead (see `shellBounds`): the extrude bevel grows every hull
// ~0.03 past its authored profile, so hand-written z values end up buried
// inside the bodywork.
//   arch: [radius over the tyre, y at the axle line] — null on open-wheelers
//   head/tail: [x, y] lamp pairs, mirrored across x · splitter: [y, halfWidth]
//   grille: [y, halfWidth, halfHeight] · mirrors: [y, z] · exhaust: [x, y] tips
//   plate: [y, width]
const KIT = {
  buggy: {
    arch: [0.04, -0.13], head: [0.16, 0.06], tail: [0.15, 0.08],
    splitter: null, grille: [0.05, 0.15, 0.045], mirrors: null,
    exhaust: [[0.2, -0.02]], plate: [0.0, 0.24],
  },
  drift: {
    arch: [0.04, -0.135], head: [0.18, 0.02], tail: [0.18, 0.04],
    splitter: [-0.055, 0.26], grille: [-0.005, 0.16, 0.045], mirrors: [0.115, 0.135],
    exhaust: [], plate: [-0.01, 0.26],
  },
  monster: {
    arch: [0.05, -0.08], head: [0.15, 0.12], tail: [0.15, 0.12],
    splitter: null, grille: [0.11, 0.16, 0.045], mirrors: [0.3, 0.12],
    exhaust: [], plate: [0.1, 0.26],
  },
  formula: {
    arch: null, head: [0.09, 0.04], tail: [0.07, 0.05],
    splitter: null, grille: null, mirrors: [0.11, 0.02],
    exhaust: [[0.0, 0.02]], plate: [0.13, 0.18],
  },
  balanced: {
    arch: [0.04, -0.135], head: [0.18, 0.02], tail: [0.18, 0.05],
    splitter: [-0.06, 0.26], grille: [0.0, 0.17, 0.05], mirrors: [0.155, 0.115],
    exhaust: [[0.16, -0.04]], plate: [-0.01, 0.26],
  },
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

// Paint. Gloss keeps the toon ramp the whole art direction is built on; the
// other finishes switch shading model so flake and pearl actually catch the
// office strip lights (both scenes ship an Environment, so metals reflect).
function paintMat(color, finishId) {
  const f = FINISHES[finishId] || FINISHES.gloss;
  if (f.toon) return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
  if (f.clearcoat !== undefined || f.iridescence !== undefined) {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: f.roughness,
      metalness: f.metalness,
      clearcoat: f.clearcoat ?? 0,
      clearcoatRoughness: 0.12,
      iridescence: f.iridescence ?? 0,
      iridescenceIOR: 1.4,
      envMapIntensity: 1.15,
    });
  }
  return new THREE.MeshStandardMaterial({
    color, roughness: f.roughness, metalness: f.metalness, envMapIntensity: 1,
  });
}

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

// Real outer surfaces of a shell, bevel included: where the nose, tail and
// flanks actually are. Cached alongside the geometry, and the single source of
// truth for bolting the detail kit on so nothing ends up inside the body.
const boundsCache = new Map();
function shellBounds(carId) {
  if (boundsCache.has(carId)) return boundsCache.get(carId);
  const geo = shellGeo(carId);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const b = { noseZ: bb.max.z, tailZ: bb.min.z, halfW: bb.max.x, topY: bb.max.y, botY: bb.min.y };
  boundsCache.set(carId, b);
  return b;
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

export default function CarModel({ carId, paint, style, tune, name, cosmetics, isLocal = false, speedRef, steerRef, boostingRef, flagsRef, wheelYRef, leanRef, team }) {
  const car = CARS[carId] || CARS.balanced;
  const color = paint || car.color;
  const st = useMemo(() => (style ? sanitizeStyle(style) : DEFAULT_STYLE), [style]);
  const tu = useMemo(() => (tune ? sanitizeTune(tune) : STOCK_TUNE), [tune]);
  // the setup sheet's visible half: stance from spring rate, tyre width from
  // compound, wing angle from downforce
  const T = useMemo(() => tunedStats(car, tu), [car, tu]);
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
    // painted panels follow the chosen finish; metal rims and glass stay PBR
    body: paintMat(color, st.finish),
    // trim package: accent colour where one is picked, body colour otherwise
    trim: paintMat(st.accent || color, st.finish),
    dark: new THREE.MeshToonMaterial({ color: '#191c22', gradientMap: toonRamp() }),
    tire: new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: wheelStyle.rim, metalness: 0.92, roughness: 0.18 }),
    disc: new THREE.MeshStandardMaterial({ color: '#4a505c', metalness: 0.8, roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: st.accent || '#c0392b', roughness: 0.4, metalness: 0.2 }),
    glassDark: new THREE.MeshStandardMaterial({ color: '#0e1116', roughness: 0.1, metalness: 0.6 }),
    accent: new THREE.MeshToonMaterial({ color: st.accent || '#f5f5f5', gradientMap: toonRamp() }),
    chrome: new THREE.MeshStandardMaterial({ color: '#c9cfd8', metalness: 0.9, roughness: 0.22 }),
  }), [color, wheelStyle.rim, st.finish, st.accent]);

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
  // soft compounds are fatter rubber; hard compounds are skinnier
  const wheelW = (carId === 'formula' ? 0.1 : 0.14) * (1 + 0.075 * tu.tires);
  // rest pose: wheels at the TUNED equilibrium sag, tires kissing the floor —
  // soft springs slam the car, stiff springs stand it up
  const restY = -0.05 - T.settle + wheelR;
  const decal = DECAL_FIT[carId] || DECAL_FIT.balanced;
  const kit = KIT[carId] || KIT.balanced;
  const bounds = shellBounds(carId);

  return (
    <group>
      <group ref={bodyRef}>
        <Body carId={carId} mats={mats} driverRef={driverRef} />
        <Kit kit={kit} mats={mats} name={name || 'RC'} wheelR={wheelR} bounds={bounds} />
        {st.vinyl !== 'none' && <Vinyl id={st.vinyl} color={st.vinylColor} fit={decal} />}
        {st.spoiler !== 'none' && (
          <Spoiler
            id={st.spoiler}
            mount={SPOILER_MOUNT[carId] || SPOILER_MOUNT.balanced}
            mats={mats}
            wing={tu.wing}
          />
        )}
        {/* lamps, let into the nose and tail this body actually has */}
        {[-kit.head[0], kit.head[0]].map((x) => (
          <mesh key={x} position={[x, kit.head[1], bounds.noseZ - 0.012]}>
            <boxGeometry args={[0.09, 0.06, 0.03]} />
            <meshStandardMaterial color="#fffce0" emissive="#fff6c0" emissiveIntensity={dark ? 3.5 : 0.4} toneMapped={false} />
          </mesh>
        ))}
        {[-kit.tail[0], kit.tail[0]].map((x) => (
          <mesh key={x} position={[x, kit.tail[1], bounds.tailZ + 0.012]}>
            <boxGeometry args={[0.08, 0.05, 0.03]} />
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
    <>
    {/* brake disc + caliper live OUTSIDE the spin group so the caliper stays
        bolted to the hub while the wheel turns — visible through open spokes */}
    <group>
      <mesh rotation-z={Math.PI / 2} material={mats.disc}>
        <cylinderGeometry args={[r * 0.6, r * 0.6, w * 0.3, 14]} />
      </mesh>
      <mesh position={[0, r * 0.42, -r * 0.2]} material={mats.caliper}>
        <boxGeometry args={[w * 0.34, r * 0.42, r * 0.3]} />
      </mesh>
    </group>
    <group ref={innerRef}>
      <mesh rotation-z={Math.PI / 2} castShadow material={mats.tire}>
        <cylinderGeometry args={[r, r, w, 14]} />
      </mesh>
      {/* Everything below is the RIM FACE, and every piece of it is sized to
          reach past both sidewalls (the tyre is a solid cylinder — anything
          narrower than `w` is buried inside it and the wheel style becomes
          invisible, which is exactly what used to happen). */}
      {/* hub / centre cap */}
      <mesh rotation-z={Math.PI / 2} material={mats.rim}>
        <cylinderGeometry args={[r * (style.disc ? 0.72 : 0.24), r * (style.disc ? 0.72 : 0.24), w + 0.03, style.disc ? 18 : 8]} />
      </mesh>
      {/* spokes radiate in the wheel plane (yz) */}
      {spokes.map((a, i) => (
        <group key={i} rotation-x={a}>
          <mesh position={[0, r * 0.36, 0]} material={mats.rim}>
            <boxGeometry args={[w + 0.024, r * 0.75, 0.05]} />
          </mesh>
        </group>
      ))}
      {/* outer ring ties the spokes together (scale runs before the rotation,
          so local z is what ends up across the car's width) */}
      {!style.disc && style.spokes > 0 && (
        <mesh rotation-y={Math.PI / 2} scale={[1, 1, (w + 0.024) / 0.044]} material={mats.rim}>
          <torusGeometry args={[r * 0.68, 0.022, 6, 18]} />
        </mesh>
      )}
      {/* deep-dish lip */}
      {style.lip && (
        <mesh rotation-y={Math.PI / 2} scale={[1, 1, (w + 0.03) / 0.07]} material={mats.rim}>
          <torusGeometry args={[r * 0.6, 0.035, 6, 18]} />
        </mesh>
      )}
      {/* stock steelie keeps the simple flat cap, with four wheel nuts */}
      {!style.disc && !style.spokes && (
        <>
          <mesh rotation-z={Math.PI / 2} material={mats.rim}>
            <cylinderGeometry args={[r * 0.55, r * 0.55, w + 0.024, 10]} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              rotation-z={Math.PI / 2}
              position={[0, Math.cos((i / 4) * Math.PI * 2) * r * 0.34, Math.sin((i / 4) * Math.PI * 2) * r * 0.34]}
              material={mats.dark}
            >
              <cylinderGeometry args={[r * 0.07, r * 0.07, w + 0.032, 6]} />
            </mesh>
          ))}
        </>
      )}
    </group>
    </>
  );
}

// Bolt-on spoilers, painted in the trim colour with dark struts. `wing` is the
// downforce notch (−2…2) and rakes the blade — the setup sheet you can see.
function Spoiler({ id, mount, mats, wing = 0 }) {
  const [y, z, hw] = mount;
  const rake = wing * 0.075;
  switch (id) {
    case 'duck':
      return (
        <mesh castShadow material={mats.trim} position={[0, y + 0.04, z]} rotation-x={0.38 + rake}>
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
          <mesh castShadow material={mats.trim} position={[0, 0.13, 0]} rotation-x={0.12 + rake}>
            <boxGeometry args={[hw * 2, 0.022, 0.15]} />
          </mesh>
          {[-hw, hw].map((x) => (
            <mesh key={x} material={mats.trim} position={[x, 0.13, 0]}>
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
          <mesh castShadow material={mats.trim} position={[0, 0.23, 0]} rotation-x={0.16 + rake}>
            <boxGeometry args={[hw * 2 + 0.12, 0.026, 0.17]} />
          </mesh>
          {[-(hw + 0.06), hw + 0.06].map((x) => (
            <mesh key={x} material={mats.trim} position={[x, 0.23, 0]}>
              <boxGeometry args={[0.025, 0.1, 0.18]} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

// how much of a full arch a fender flare shows (the rest is inside the body)
const ARCH_ARC = Math.PI * 0.68;

// ------------------------------------------------------------- detail kit
// Fender flares, front splitter, grille, mirrors, exhaust tip and the office
// asset-tag plate. Table-driven (see KIT) so every body gets the same parts
// fitted to its own silhouette.
function Kit({ kit, mats, name, wheelR, bounds }) {
  const { noseZ, tailZ, halfW } = bounds;
  return (
    <group>
      {/* fender flares arching over each wheel. The wrapper does the turn
          (ring plane → the car's side view) and the widening — group scale runs
          on the child's local axes, where z is the tube direction, so the tube
          spreads across the car's width instead of stretching the arc. The
          child's z-spin centres a 0.68π arc over the tyre so the flare reads as
          a fender lip and not as a ring around the wheel. */}
      {kit.arch && WHEEL_POS.map(([x, z], i) => (
        <group key={i} position={[x, kit.arch[1], z]} rotation-y={Math.PI / 2} scale={[0.85, 0.95, 1.9]}>
          <mesh castShadow material={mats.body} rotation-z={(Math.PI - ARCH_ARC) / 2}>
            <torusGeometry args={[wheelR + kit.arch[0], 0.03, 5, 9, ARCH_ARC]} />
          </mesh>
        </group>
      ))}
      {/* front splitter, jutting out under the nose */}
      {kit.splitter && (
        <mesh castShadow material={mats.trim} position={[0, kit.splitter[0], noseZ - 0.03]} rotation-x={-0.06}>
          <boxGeometry args={[kit.splitter[1] * 2, 0.018, 0.11]} />
        </mesh>
      )}
      {/* grille: dark panel let into the nose, with two chrome bars */}
      {kit.grille && (
        <group position={[0, kit.grille[0], noseZ - 0.012]}>
          <mesh material={mats.dark}>
            <boxGeometry args={[kit.grille[1] * 2, kit.grille[2] * 2, 0.03]} />
          </mesh>
          {[-kit.grille[2] * 0.55, kit.grille[2] * 0.55].map((y) => (
            <mesh key={y} material={mats.chrome} position={[0, y, 0.02]}>
              <boxGeometry args={[kit.grille[1] * 1.8, 0.012, 0.012]} />
            </mesh>
          ))}
        </group>
      )}
      {/* door mirrors on little stalks, hung off the actual flank */}
      {kit.mirrors && [-1, 1].map((s) => (
        <group key={s} position={[(halfW - 0.005) * s, kit.mirrors[0], kit.mirrors[1]]}>
          <mesh material={mats.dark} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.008, 0.008, 0.05, 5]} />
          </mesh>
          <mesh castShadow material={mats.trim} position={[0.04 * s, 0.014, 0]}>
            <boxGeometry args={[0.04, 0.03, 0.055]} />
          </mesh>
        </group>
      ))}
      {/* exhaust tip poking out of the tail */}
      {kit.exhaust?.map(([x, y], i) => (
        <mesh key={i} material={mats.chrome} position={[x, y, tailZ + 0.02]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.026, 0.03, 0.1, 8]} />
        </mesh>
      ))}
      {/* asset-tag plate: your driver name, issued by facilities */}
      {kit.plate && (
        <mesh position={[0, kit.plate[0], tailZ - 0.003]} rotation-y={Math.PI}>
          <planeGeometry args={[kit.plate[1], kit.plate[1] * 0.5]} />
          <meshStandardMaterial map={plateTex(name)} roughness={0.55} />
        </mesh>
      )}
    </group>
  );
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
          <mesh castShadow material={mats.trim} position={[0, 0.2, -0.44]}>
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
