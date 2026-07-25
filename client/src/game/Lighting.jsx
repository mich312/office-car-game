// HDR-ish lighting rig: environment for reflections, a sun (or moon) coming
// through the north windows, warm ceiling panels, and a day/night switch.
// The lights_out office event kills everything except emergency strips.
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../store.js';

// ---------------------------------------------------------- shadow tracking
// The sun used to light the whole building from a fixed 210×150-unit ortho box.
// At 2048² that is 10 cm per texel — a tenth of a car length — and every desk
// in the office was redrawn into the map every frame whether or not it was on
// screen. The box now follows what the camera is looking at: 1.75× the texel
// density, and the ortho frustum culls most of the office out of the shadow
// pass — measured at −17% draw calls and −17% triangles, same spawn, same mode.
// The knob: smaller = sharper shadows and fewer casters drawn, but geometry
// past the box stops casting. 60 covers roughly 75 units ahead of the chase
// cam, which is past every sightline the office's walls actually leave open.
const SHADOW_HALF = 60;
const SHADOW_MAP = 2048;
const SHADOW_TEXEL = (SHADOW_HALF * 2) / SHADOW_MAP;
// Same direction the fixed sun had, kept at a constant distance from the box
// centre so near/far can be tight.
const SUN_DIR = new THREE.Vector3(60, 90, 140).normalize();
const SUN_DIST = 176;
const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();

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

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 2.5);
    if (sun.current) {
      sun.current.intensity += (target.sun - sun.current.intensity) * k;
      sun.current.color.lerp(new THREE.Color(target.sunColor), k);
      // Centre the shadow box on the floor point the camera is aimed at, so
      // this works the same for the chase cam, the spectator drone and the
      // photo orbit without any of them knowing about it.
      state.camera.getWorldPosition(_camPos);
      state.camera.getWorldDirection(_camDir);
      const hit = _camDir.y < -0.02 ? Math.min(110, -_camPos.y / _camDir.y) : 45;
      // Snap the centre to shadow-map texels: without this the map resamples
      // every frame and shadow edges crawl while the camera moves.
      const cx = Math.round((_camPos.x + _camDir.x * hit) / SHADOW_TEXEL) * SHADOW_TEXEL;
      const cz = Math.round((_camPos.z + _camDir.z * hit) / SHADOW_TEXEL) * SHADOW_TEXEL;
      sun.current.position.set(cx + SUN_DIR.x * SUN_DIST, SUN_DIR.y * SUN_DIST, cz + SUN_DIR.z * SUN_DIST);
      sun.current.target.position.set(cx, 0, cz);
      sun.current.target.updateMatrixWorld();
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
      {/* `frames={1}` means this cubemap is rendered once at load, so its
          resolution is a load-time cost and nothing else. At 64 every glass
          wall, tile floor, chrome bar and metal-flake paint job in the game
          was reflecting mush. */}
      <Environment resolution={256} frames={1} environmentIntensity={lightsOut ? 0.06 : night ? 0.35 : 0.7}>
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
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.12}
      >
        {/* near/far bracket a box that now sits a fixed distance away */}
        <orthographicCamera
          attach="shadow-camera"
          args={[-SHADOW_HALF, SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, SUN_DIST - 110, SUN_DIST + 110]}
        />
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
