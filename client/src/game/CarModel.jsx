// Procedural RC car visuals — five body styles, spinning/steering wheels,
// body roll, boost flame, headlights, shield bubble, battery pack, name tag,
// plus the garage customization layer: wheel styles, spoilers, vinyl wraps
// and underglow (NFS Underground energy, office-toy scale).
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CARS, SUSPENSION_SETTLE, WHEEL_STYLES, DEFAULT_STYLE, sanitizeStyle } from '@rc/shared';
import { useStore } from '../store.js';
import { vinylTopTex, vinylSideTex, glowTex } from './textures.js';
import TextSprite from './TextSprite.jsx';

const WHEEL_POS = [
  [-0.3, 0.34], [0.3, 0.34],
  [-0.3, -0.34], [0.3, -0.34],
];

// Where a spoiler bolts on per body: [deck y, deck z, half width]
const SPOILER_MOUNT = {
  buggy: [0.13, -0.42, 0.23],
  drift: [0.06, -0.44, 0.27],
  monster: [0.24, -0.36, 0.24],
  formula: [0.05, -0.46, 0.24],
  balanced: [0.09, -0.42, 0.26],
};

// Vinyl wrap planes per body: top [w, l, y, z], side [l, h, y, x, z]
const DECAL_FIT = {
  buggy: { top: [0.46, 0.8, 0.105, 0.02], side: [0.8, 0.14, 0.02, 0.255, 0] },
  drift: { top: [0.5, 0.9, 0.058, 0], side: [0.9, 0.11, -0.01, 0.275, 0] },
  monster: { top: [0.46, 0.75, 0.215, 0], side: [0.75, 0.18, 0.11, 0.255, 0] },
  formula: { top: [0.24, 0.85, 0.045, 0.1], side: [0.85, 0.1, -0.02, 0.135, 0.1] },
  balanced: { top: [0.5, 0.9, 0.09, 0], side: [0.9, 0.15, 0, 0.275, 0] },
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

// Inverted-hull outline for a box shape — rendered backface-only so it draws
// a clean dark rim around the painted shell.
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: '#0b0c12', side: THREE.BackSide });
function Outline({ args, position, rotation }) {
  return (
    <mesh position={position} rotation={rotation} scale={1.08} material={OUTLINE_MAT}>
      <boxGeometry args={args} />
    </mesh>
  );
}

export default function CarModel({ carId, paint, style, name, isLocal = false, speedRef, steerRef, boostingRef, flagsRef, wheelYRef, team }) {
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

  useFrame((_, dt) => {
    const speed = speedRef?.current ?? 0;
    const steer = steerRef?.current ?? 0;
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
      // body roll from steering + squat from acceleration
      const roll = steer * Math.min(1, Math.abs(speed) / 25) * 0.09;
      bodyRef.current.rotation.z += (roll - bodyRef.current.rotation.z) * Math.min(1, dt * 8);
    }
    if (flameRef.current) {
      const on = boostingRef?.current;
      flameRef.current.visible = !!on;
      if (on) flameRef.current.scale.setScalar(0.8 + Math.random() * 0.5);
    }
    const flags = flagsRef?.current ?? 0;
    if (shieldRef.current) {
      shieldRef.current.visible = !!(flags & 8);
      if (shieldRef.current.visible) shieldRef.current.rotation.y += dt * 2;
    }
    if (batteryRef.current) batteryRef.current.visible = !!(flags & 32);
    if (stunRef.current) {
      stunRef.current.visible = !!(flags & 4);
      if (stunRef.current.visible) stunRef.current.rotation.y += dt * 8;
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
        <Body carId={carId} mats={mats} />
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
        {/* antenna */}
        <group position={[-0.2, 0.14, -0.4]}>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.008, 0.012, 0.45, 6]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#ff3333" />
          </mesh>
        </group>
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
        // mirrored so the flames pour nose→tail on both doors
        <mesh key={s} position={[sx * s, sy, sz]} rotation-y={(Math.PI / 2) * s} scale-x={s}>
          <planeGeometry args={[sl, sh]} />
          {mat(sideT)}
        </mesh>
      ))}
    </group>
  );
}

// Far-LOD stand-in: three boxes instead of ~20 meshes. Remote cars swap to
// this beyond ~28 units so 12-player lobbies stay cheap.
export function CarProxy({ carId, paint }) {
  const car = CARS[carId] || CARS.balanced;
  const color = paint || car.color;
  const mat = useMemo(() => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() }), [color]);
  return (
    <group position={[0, -0.05, 0]}>
      <mesh material={mat} position={[0, 0.02, 0]}>
        <boxGeometry args={[0.54, 0.2, 0.95]} />
      </mesh>
      <mesh material={mat} position={[0, 0.16, -0.06]}>
        <boxGeometry args={[0.44, 0.13, 0.5]} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[0.62, 0.14, 0.8]} />
        <meshBasicMaterial color="#17181c" />
      </mesh>
    </group>
  );
}

function Body({ carId, mats }) {
  switch (carId) {
    case 'buggy':
      return (
        <group>
          <Outline args={[0.5, 0.16, 0.85]} position={[0, 0.02, 0]} />
          <mesh castShadow material={mats.body} position={[0, 0.02, 0]}>
            <boxGeometry args={[0.5, 0.16, 0.85]} />
          </mesh>
          <mesh castShadow material={mats.dark} position={[0, 0.14, -0.05]}>
            <boxGeometry args={[0.4, 0.12, 0.4]} />
          </mesh>
          {/* roll cage */}
          {[-0.16, 0.16].map((x) => (
            <mesh key={x} castShadow material={mats.rim} position={[x, 0.2, -0.05]} rotation-x={0.2}>
              <torusGeometry args={[0.16, 0.02, 6, 10, Math.PI]} />
            </mesh>
          ))}
          <mesh castShadow material={mats.body} position={[0, 0.1, -0.44]} rotation-x={0.5}>
            <boxGeometry args={[0.46, 0.02, 0.2]} />
          </mesh>
        </group>
      );
    case 'drift':
      return (
        <group>
          <Outline args={[0.54, 0.13, 0.95]} position={[0, -0.01, 0]} />
          <mesh castShadow material={mats.body} position={[0, -0.01, 0]}>
            <boxGeometry args={[0.54, 0.13, 0.95]} />
          </mesh>
          <mesh castShadow material={mats.glassDark} position={[0, 0.1, -0.06]}>
            <boxGeometry args={[0.44, 0.11, 0.45]} />
          </mesh>
          {/* big spoiler */}
          <mesh castShadow material={mats.body} position={[0, 0.18, -0.44]}>
            <boxGeometry args={[0.56, 0.025, 0.14]} />
          </mesh>
          {[-0.22, 0.22].map((x) => (
            <mesh key={x} castShadow material={mats.dark} position={[x, 0.12, -0.44]}>
              <boxGeometry args={[0.03, 0.12, 0.1]} />
            </mesh>
          ))}
        </group>
      );
    case 'monster':
      return (
        <group position={[0, 0.06, 0]}>
          <Outline args={[0.5, 0.2, 0.8]} position={[0, 0.05, 0]} />
          <mesh castShadow material={mats.body} position={[0, 0.05, 0]}>
            <boxGeometry args={[0.5, 0.2, 0.8]} />
          </mesh>
          <mesh castShadow material={mats.glassDark} position={[0, 0.2, 0.05]}>
            <boxGeometry args={[0.42, 0.14, 0.4]} />
          </mesh>
          <mesh castShadow material={mats.rim} position={[0, 0.0, 0.42]}>
            <boxGeometry args={[0.5, 0.08, 0.06]} />
          </mesh>
        </group>
      );
    case 'formula':
      return (
        <group>
          <Outline args={[0.26, 0.12, 0.9]} position={[0, -0.02, 0.1]} />
          <mesh castShadow material={mats.body} position={[0, -0.02, 0.1]}>
            <boxGeometry args={[0.26, 0.12, 0.9]} />
          </mesh>
          <mesh castShadow material={mats.dark} position={[0, 0.08, -0.02]}>
            <sphereGeometry args={[0.11, 10, 8]} />
          </mesh>
          {/* wings */}
          <mesh castShadow material={mats.accent} position={[0, 0.02, 0.5]}>
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
          <Outline args={[0.54, 0.17, 0.95]} position={[0, 0, 0]} />
          <Outline args={[0.48, 0.14, 0.55]} position={[0, 0.14, -0.08]} />
          <mesh castShadow material={mats.body} position={[0, 0, 0]}>
            <boxGeometry args={[0.54, 0.17, 0.95]} />
          </mesh>
          <mesh castShadow material={mats.body} position={[0, 0.14, -0.08]}>
            <boxGeometry args={[0.48, 0.14, 0.55]} />
          </mesh>
          <mesh castShadow material={mats.glassDark} position={[0, 0.14, 0.21]} rotation-x={-0.5}>
            <boxGeometry args={[0.44, 0.02, 0.2]} />
          </mesh>
          <mesh castShadow material={mats.glassDark} position={[0, 0.14, -0.37]} rotation-x={0.4}>
            <boxGeometry args={[0.44, 0.02, 0.18]} />
          </mesh>
        </group>
      );
  }
}
