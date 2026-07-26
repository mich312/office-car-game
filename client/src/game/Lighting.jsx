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

// ---------------------------------------------------------------- shadows
//
// A single map over the whole 42×24 m floor is the wrong trade at this scale.
// Covering ±125 units with 2048 texels puts a texel at ~2.7 cm — and the cars
// are 18 cm long, so a car's own shadow was six texels across and every chair
// leg turned to mush.
//
// So the shadow frustum follows the player instead of covering the building:
// a tight box centred just ahead of your car, which drops a texel to ~5 mm.
// The cost is that shadows stop at the box edge, which is why HALF is sized to
// roughly two rooms rather than one — golden hour's long shadows have to fit
// inside it or the whole point of a low sun is lost.
//
// Following a moving box makes shadow edges crawl as texels re-quantise, so
// the focus point is snapped to the light's own texel grid every frame. That
// snap is the difference between "follows you" and "shimmers constantly".
const SHADOW = {
  half: 46,   // ≈ 20.7 m across — two rooms, and long shadows still fit
  dist: 210,  // how far back along the sun direction the light sits
  near: 1,
  far: 430,
};

export default function Lighting() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const sun = useRef();
  const amb = useRef();
  const hemi = useRef();
  const ceiling = useRef();

  const target = useMemo(() => lightingFor(hour, lightsOut), [hour, lightsOut]);

  // Scratch colours and vectors, allocated once — this runs every frame.
  const tmp = useMemo(() => ({
    sun: new THREE.Color(), amb: new THREE.Color(),
    sky: new THREE.Color(), ground: new THREE.Color(),
    pos: new THREE.Vector3(), dir: new THREE.Vector3(),
    focus: new THREE.Vector3(), snap: new THREE.Vector3(),
  }), []);

  // Deliberately the same 2048 the fixed rig used, so this change costs exactly
  // what it did before and every bit of the gain comes from the frustum being
  // tight instead of the map being bigger. 4096 is a one-line change if
  // profiling on real hardware says there's room — it was measurably too slow
  // under software rendering, which is a fair proxy for a weak integrated GPU.
  const mapSize = 2048;
  const texel = (SHADOW.half * 2) / mapSize;

  // The environment can't be lerped (it bakes to a cubemap), so it snaps to the
  // new phase while the real lights fade — imperceptible at 1.5 s, and it keeps
  // the expensive part off the frame loop.
  const [env, setEnv] = useState(target.env);
  useEffect(() => { setEnv(target.env); }, [target]);

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 1.8);
    if (sun.current) {
      const L = sun.current;
      L.intensity += (target.sun.intensity - L.intensity) * k;
      L.color.lerp(tmp.sun.set(target.sun.color), k);

      // The sun *direction* is what the hour actually changes; lerp it as a
      // direction so the light swings round the room instead of sliding.
      tmp.pos.set(...target.sun.pos).normalize();
      tmp.dir.lerp(tmp.pos, k).normalize();

      // Focus a little ahead of the car — you look where you're going, and
      // shadows behind you are never in frame. Falls back to the camera before
      // the local car exists (menu, spectator, first frames).
      const car = typeof window !== 'undefined' ? window.__rcTelemetry : null;
      if (car) {
        tmp.focus.set(
          car.x + Math.sin(car.heading) * 9,
          0,
          car.z + Math.cos(car.heading) * 9,
        );
      } else {
        tmp.focus.set(state.camera.position.x, 0, state.camera.position.z);
      }

      // Snap the focus to the light's own texel grid. Without this the shadow
      // edges crawl every frame as the box slides under them.
      L.position.copy(tmp.focus).addScaledVector(tmp.dir, SHADOW.dist);
      L.target.position.copy(tmp.focus);
      L.target.updateMatrixWorld();
      L.updateMatrixWorld();
      const sc = L.shadow.camera;
      sc.updateMatrixWorld();
      tmp.snap.copy(tmp.focus).applyMatrix4(sc.matrixWorldInverse);
      tmp.snap.x = Math.round(tmp.snap.x / texel) * texel;
      tmp.snap.y = Math.round(tmp.snap.y / texel) * texel;
      tmp.snap.applyMatrix4(sc.matrixWorld);

      L.position.copy(tmp.snap).addScaledVector(tmp.dir, SHADOW.dist);
      L.target.position.copy(tmp.snap);
      L.target.updateMatrixWorld();

      // Bias belongs to the hour: a grazing low sun needs far more slope bias
      // than an overhead one, and the moon wants a faint shadow, not a sharp.
      L.shadow.bias = target.shadow.bias;
      L.shadow.normalBias = target.shadow.normalBias;
      L.shadow.intensity += (target.shadow.opacity - L.shadow.intensity) * k;
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

      {/* Sun / moon. Position, direction, bias and shadow strength are all
          driven per-frame above — the frustum below is a tight box that rides
          with the player, not a fixed one covering the building. */}
      <directionalLight
        ref={sun}
        position={[60, 90, 140]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.35}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-SHADOW.half, SHADOW.half, SHADOW.half, -SHADOW.half, SHADOW.near, SHADOW.far]}
        />
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
