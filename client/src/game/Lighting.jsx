// The office has a time of day. Four phases (morning / afternoon / golden hour
// / night) come from one table in daylight.js; everything here cross-fades
// between them so `N` reads as the light changing rather than a switch flipping.
//
// The sun genuinely moves. Elevation is what sells the hour — a low sun throws
// shadows the length of the open-plan floor, which is both the Firewatch cue
// and, at RC scale, a free reminder of how small the cars are. The environment
// cubemap is re-rendered on a phase change (it is 64px and procedural, so this
// is cheap) because reflections have to agree with the key light or metal paint
// looks pasted on.
import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../store.js';
import { lightingFor } from './daylight.js';

// Ceiling downlights — few big points; the environment does the rest. Light
// count is the #1 fragment cost, so this list stays short.
const CEILING = [[-17.5, -6], [-1, 1.5], [2.5, -8], [-0.5, 9.5], [17, -2], [-11, 0]];

export default function Lighting() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const sun = useRef();
  const amb = useRef();
  const hemi = useRef();
  const ceiling = useRef();

  const target = useMemo(() => lightingFor(hour, lightsOut), [hour, lightsOut]);

  // Scratch colours, allocated once — this runs every frame during a fade.
  const tmp = useMemo(() => ({
    sun: new THREE.Color(), amb: new THREE.Color(),
    sky: new THREE.Color(), ground: new THREE.Color(),
    pos: new THREE.Vector3(),
  }), []);

  // The environment can't be lerped (it bakes to a cubemap), so it snaps to the
  // new phase while the real lights fade — imperceptible at 1.5 s, and it keeps
  // the expensive part off the frame loop.
  const [env, setEnv] = useState(target.env);
  useEffect(() => { setEnv(target.env); }, [target]);

  useFrame((_, dt) => {
    const k = Math.min(1, dt * 1.8);
    if (sun.current) {
      sun.current.intensity += (target.sun.intensity - sun.current.intensity) * k;
      sun.current.color.lerp(tmp.sun.set(target.sun.color), k);
      // moving the light is the whole point: shadow length tracks elevation
      tmp.pos.set(...target.sun.pos);
      sun.current.position.lerp(tmp.pos, k);
    }
    if (amb.current) {
      amb.current.intensity += (target.amb.intensity - amb.current.intensity) * k;
      amb.current.color.lerp(tmp.amb.set(target.amb.color), k);
    }
    if (hemi.current) {
      hemi.current.intensity += (target.hemi.intensity - hemi.current.intensity) * k;
      hemi.current.color.lerp(tmp.sky.set(target.hemi.sky), k);
      hemi.current.groundColor.lerp(tmp.ground.set(target.hemi.ground), k);
    }
    if (ceiling.current) {
      for (const l of ceiling.current.children) {
        l.intensity += (target.ceiling - l.intensity) * k;
      }
    }
  });

  return (
    <>
      {/* Procedural HDR environment — no external assets: a sky dome, warm
          ceiling panels and a window strip, rendered to a 64px cubemap. */}
      <Environment resolution={64} frames={1} environmentIntensity={env.intensity}>
        <color attach="background" args={[env.bg]} />
        <Lightformer form="rect" intensity={env.window.intensity} color={env.window.color}
          position={[0, 8, -18]} scale={[30, 8, 1]} />
        <Lightformer form="rect" intensity={env.ceil.intensity} color={env.ceil.color}
          position={[0, 14, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="rect" intensity={env.warm.intensity} color={env.warm.color}
          position={[16, 6, 4]} rotation-y={-Math.PI / 2} scale={[14, 5, 1]} />
        <Lightformer form="circle" intensity={env.key.intensity} color={env.key.color}
          position={[-12, 10, 8]} scale={6} />
      </Environment>

      <ambientLight ref={amb} intensity={0.3} color="#cdd6f4" />
      <hemisphereLight ref={hemi} intensity={0.4} color="#dfe8ff" groundColor="#3a3226" />

      {/* Sun / moon through the north glass wall. The shadow camera is sized
          for the whole floor because a low sun throws shadows a long way — clip
          it to the old bounds and golden hour loses them off the near plane. */}
      <directionalLight
        ref={sun}
        position={[60, 90, 140]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.35}
      >
        <orthographicCamera attach="shadow-camera" args={[-125, 125, 95, -95, 10, 460]} />
      </directionalLight>

      <group ref={ceiling}>
        {CEILING.map(([x, z], i) => (
          <pointLight
            key={i}
            position={[x * M, 2.7 * M, z * M]}
            intensity={13}
            distance={26 * M}
            decay={1.5}
            color="#fff2dc"
          />
        ))}
      </group>

      {/* Server room ominous glow (doubles as the lights-out emergency light) */}
      <pointLight
        position={[9.5 * M, 1.2 * M, 4.5 * M]}
        intensity={lightsOut ? 8 : 4}
        distance={9 * M}
        color={lightsOut ? '#ff5040' : '#3d7bff'}
      />
    </>
  );
}
