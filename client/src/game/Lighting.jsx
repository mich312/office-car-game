// HDR-ish lighting rig: environment for reflections, a sun (or moon) coming
// through the north windows, warm ceiling panels, and a day/night switch.
// The lights_out office event kills everything except emergency strips.
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../store.js';

export default function Lighting() {
  const night = useStore((s) => s.night);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const sun = useRef();
  const amb = useRef();
  const hemi = useRef();
  const ceiling = useRef();

  const target = useMemo(() => {
    const day = { sun: 2.4, sunColor: '#fff4e0', amb: 0.35, hemi: 0.5, ceil: 13, bg: '#aac4e8' };
    const nite = { sun: 0.55, sunColor: '#7f9fff', amb: 0.12, hemi: 0.18, ceil: 22, bg: '#0b0f1c' };
    const out = { sun: 0.02, sunColor: '#7f9fff', amb: 0.03, hemi: 0.02, ceil: 0, bg: '#05060a' };
    return lightsOut ? out : night ? nite : day;
  }, [night, lightsOut]);

  useFrame((_, dt) => {
    const k = Math.min(1, dt * 2.5);
    if (sun.current) {
      sun.current.intensity += (target.sun - sun.current.intensity) * k;
      sun.current.color.lerp(new THREE.Color(target.sunColor), k);
    }
    if (amb.current) amb.current.intensity += (target.amb - amb.current.intensity) * k;
    if (hemi.current) hemi.current.intensity += (target.hemi - hemi.current.intensity) * k;
    if (ceiling.current) {
      for (const l of ceiling.current.children) l.intensity += (target.ceil - l.intensity) * k;
    }
  });

  return (
    <>
      {/* Procedural HDR environment — no external assets: a soft sky dome,
          warm ceiling panels and a cool window strip, rendered to a cubemap */}
      <Environment resolution={64} frames={1} environmentIntensity={lightsOut ? 0.06 : night ? 0.35 : 0.7}>
        <color attach="background" args={[night ? '#070b16' : '#42506b']} />
        <Lightformer form="rect" intensity={night ? 1.2 : 4} color={night ? '#4c6cb8' : '#cfe0ff'} position={[0, 8, -18]} scale={[30, 8, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ffe8c4" position={[0, 14, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="rect" intensity={night ? 0.6 : 1.4} color="#ffd9a8" position={[16, 6, 4]} rotation-y={-Math.PI / 2} scale={[14, 5, 1]} />
        <Lightformer form="circle" intensity={night ? 0.8 : 2.4} color="#ffffff" position={[-12, 10, 8]} scale={6} />
      </Environment>
      <ambientLight ref={amb} intensity={0.3} color="#cdd6f4" />
      <hemisphereLight ref={hemi} intensity={0.4} color="#dfe8ff" groundColor="#3a3226" />
      {/* Sun / moon through the north glass wall */}
      <directionalLight
        ref={sun}
        position={[60, 90, 140]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.35}
      >
        <orthographicCamera attach="shadow-camera" args={[-105, 105, 75, -75, 10, 380]} />
      </directionalLight>
      {/* Warm office downlights — few big points; panels/env do the rest.
          Light count is the #1 fragment cost, so keep this list short. */}
      <group ref={ceiling}>
        {[[-17.5, -6], [-1, 1.5], [2.5, -8], [-0.5, 9.5], [17, -2], [-11, 0]].map(([x, z], i) => (
          <pointLight
            key={i}
            position={[x * M, 2.7 * M, z * M]}
            intensity={night ? 22 : 13}
            distance={26 * M}
            decay={1.5}
            color="#fff2dc"
          />
        ))}
      </group>
      {/* Server room ominous glow (doubles as the lights-out emergency light) */}
      <pointLight position={[9.5 * M, 1.2 * M, 4.5 * M]} intensity={lightsOut ? 8 : 4} distance={9 * M} color={lightsOut ? '#ff5040' : '#3d7bff'} />
    </>
  );
}
