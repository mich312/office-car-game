// Practical lights: the things in the office that are themselves lit.
//
// Desk lamps, monitor glow, backlit keyboards and charger LEDs. At night these
// are what make the floor legible — pools you can drive between, and dark
// corners you can't see into — which turns lighting into level design rather
// than decoration.
//
// None of them is a real light. Scene lights are the #1 fragment cost here and
// there are already seven; adding a dozen more would cost more than the whole
// post chain. So every practical is emissive geometry plus an additive quad,
// which bloom then picks up and blows into something that reads as a light
// source. The cheat is invisible because nothing in this room needs a
// practical to cast an accurate shadow.
//
// Positions come from the shared map rather than being typed out again, so a
// desk that moves takes its lamp glow with it.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PROPS, M } from '@rc/shared';
import { useStore } from '../store.js';
import { lightingFor } from './daylight.js';
import { glowTex } from './textures.js';

const DESK_Y = 0.74 * M + 0.06; // just clear of the desk surface
const at = (p) => [p.x, DESK_Y, p.z];

// Monitors face the sitter (rotY === PI means the desk's south side), so their
// spill belongs in front of the screen rather than centred on the panel.
const inFrontOf = (p) => {
  const dir = p.rotY ? -1 : 1;
  return [p.x, DESK_Y, p.z - dir * 0.2 * M];
};

// Additive material shared by a whole family of practicals — one material,
// one opacity to animate, N meshes.
function useAdditive(color, opacity = 0) {
  const tex = useMemo(() => glowTex(), []);
  return useMemo(() => new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }), [tex, color]);
}

export default function Practicals() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const level = lightingFor(hour, lightsOut).practical;

  const lamps = useMemo(() => PROPS.filter((p) => p.type === 'lamp'), []);
  const monitors = useMemo(() => PROPS.filter((p) => p.type === 'monitor'), []);
  const keyboards = useMemo(() => PROPS.filter((p) => p.type === 'keyboard'), []);

  const lampMat = useAdditive('#ffc266');
  const lampFloorMat = useAdditive('#ffb655');
  const screenMat = useAdditive('#8ec8ff');
  const rgbMat = useAdditive('#ffffff');
  const ledMat = useAdditive('#7dff9c');

  const rgbHue = useRef(0);
  // Each monitor gets its own flicker offset, so eight screens never blink as
  // one — that synchronisation is the tell that gives away fake screen light.
  const offsets = useMemo(() => monitors.map((_, i) => i * 1.37), [monitors]);
  const screens = useRef([]);

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 2);
    const t = state.clock.elapsedTime;

    lampMat.opacity += (level * 0.45 - lampMat.opacity) * k;
    lampFloorMat.opacity += (level * 0.24 - lampFloorMat.opacity) * k;
    ledMat.opacity += ((0.35 + Math.sin(t * 1.6) * 0.18) * level - ledMat.opacity) * k;

    // Backlit keycaps drift round the hue wheel slowly enough to be ambient
    // rather than a disco.
    rgbHue.current = (rgbHue.current + dt * 0.045) % 1;
    rgbMat.color.setHSL(rgbHue.current, 0.5, 0.55);
    rgbMat.opacity += (level * 0.16 - rgbMat.opacity) * k;

    // Monitors: a slow bright base with an occasional fast dip, which is what
    // a screen refreshing on a bad camera actually looks like.
    screenMat.opacity += (level * 0.3 - screenMat.opacity) * k;
    for (let i = 0; i < screens.current.length; i++) {
      const m = screens.current[i];
      if (!m) continue;
      const o = offsets[i] ?? 0;
      const slow = 0.86 + Math.sin(t * 0.7 + o) * 0.1;
      const blink = Math.sin(t * 13 + o * 3) > 0.985 ? 0.55 : 1;
      m.scale.setScalar(slow * blink);
    }
  });

  return (
    <group>
      {/* desk lamps: a hot pool on the desk and a wider soft one on the floor */}
      {lamps.map((p, i) => (
        <group key={`lamp${i}`}>
          <mesh position={at(p)} rotation-x={-Math.PI / 2} material={lampMat}>
            <planeGeometry args={[5, 5]} />
          </mesh>
          <mesh position={[p.x, 0.04, p.z]} rotation-x={-Math.PI / 2} material={lampFloorMat}>
            <planeGeometry args={[11, 11]} />
          </mesh>
        </group>
      ))}

      {/* monitor spill: on the desk in front of the screen, and scaled by the
          per-screen flicker above */}
      {monitors.map((p, i) => (
        <mesh
          key={`mon${i}`}
          ref={(el) => { screens.current[i] = el; }}
          position={inFrontOf(p)}
          rotation-x={-Math.PI / 2}
          material={screenMat}
        >
          <planeGeometry args={[3.4, 3.4]} />
        </mesh>
      ))}

      {/* backlit keycaps */}
      {keyboards.map((p, i) => (
        <mesh key={`kb${i}`} position={at(p)} rotation-x={-Math.PI / 2} material={rgbMat}>
          <planeGeometry args={[1.9, 1.3]} />
        </mesh>
      ))}

      {/* charger LEDs — tiny, breathing, and the only thing still lit in a
          blackout, so they double as breadcrumbs */}
      {LED_SPOTS.map(([x, z, y], i) => (
        <mesh key={`led${i}`} position={[x * M, y * M, z * M]} material={ledMat}>
          <planeGeometry args={[1.1, 1.1]} />
        </mesh>
      ))}
    </group>
  );
}

// Hand-placed: a phone charger by reception, the server rack, a laptop brick
// in the lounge, the printer, the kitchen machine.
const LED_SPOTS = [
  [-17.0, -10.4, 0.78],
  [9.5, 4.2, 0.5],
  [-2.0, 1.4, 0.76],
  [6.4, -8.2, 0.7],
  [-8.4, -9.6, 0.9],
];
