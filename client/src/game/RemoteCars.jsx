// Other players & bots: kinematic bodies driven by interpolated snapshots,
// so the local car physically bounces off them.
import { useRef, memo, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Detailed } from '@react-three/drei';
import * as THREE from 'three';
import { CARS, CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH, POWERUP_EFFECT, LEAN, leanTarget } from '@rc/shared';
import { useStore } from '../store.js';
import { net, sampleRemote } from '../net.js';
import CarModel, { CarMid, CarProxy } from './CarModel.jsx';
import { smoke } from './particles.jsx';
import { skid } from './SkidMarks.jsx';
import { blobCars } from './BlobShadows.jsx';

export default function RemoteCars() {
  const players = useStore((s) => s.players);
  const myId = useStore((s) => s.myId);
  return (
    <group>
      {Object.values(players)
        .filter((p) => p.id !== myId)
        .map((p) => <RemoteCar key={p.id} player={p} />)}
    </group>
  );
}

// scratch for remote weight-transfer math
const _rq = new THREE.Quaternion();
const _rfwd = new THREE.Vector3();
const _rright = new THREE.Vector3();
const _rcorner = new THREE.Vector3();
const _lean = {};
const REAR = [[-0.28, -0.15, -0.34], [0.28, -0.15, -0.34]];
const RIDE = 0.27; // car centre over its floor: remote drift smoke is laid there
const FX_RANGE = 40; // drift smoke & skid marks only near the camera

// Where every remote car is and how it sounds, for the engine voices
// (audio.updateRivals picks the nearest few). Written per frame below.
export const rivalAudio = new Map();

const RemoteCar = memo(function RemoteCar({ player }) {
  const rb = useRef();
  const group = useRef();
  const speedRef = useRef(0);
  const steerRef = useRef(0);
  const boostingRef = useRef(false);
  const flagsRef = useRef(0);
  const leanRef = useRef({ roll: 0, pitch: 0, slip: 0, spin: 0 });
  const lastYaw = useRef(null);
  // last position and velocity, and this car's engine record for the mixer:
  // written in place every frame (no allocation per remote car per frame)
  const last = useRef(null);
  const lastVel = useRef(null);
  const voice = useMemo(() => ({ id: player.id, x: 0, y: 0, z: 0, speed: 0, car: player.car, boosting: false }), [player.id, player.car]);

  const skidKeys = [`${player.id}:0`, `${player.id}:1`];
  // stable, or every re-render re-applies the body's transform (see LocalCar)
  const userData = useMemo(() => ({ playerId: player.id }), [player.id]);
  useEffect(() => () => rivalAudio.delete(player.id), [player.id]);
  // a contact shadow under this car too (BlobShadows)
  useEffect(() => {
    blobCars.set(player.id, { obj: group.current });
    return () => blobCars.delete(player.id);
  }, [player.id]);

  useFrame((state, dt) => {
    const s = sampleRemote(player.id);
    if (!s || !rb.current) return;
    // a Last Car Standing ghost is out of the world, collider and all — its
    // interpolated body must not linger as an invisible car where it died
    const ghost = ((s.f || 0) & 128) && useStore.getState().modeId === 'last_standing';
    rb.current.setNextKinematicTranslation(ghost ? { x: 0, y: -50, z: 0 } : { x: s.p[0], y: s.p[1], z: s.p[2] });
    rb.current.setNextKinematicRotation({ x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] });
    flagsRef.current = s.f || 0;
    if (last.current && dt > 0) {
      const dx = s.p[0] - last.current[0], dz = s.p[2] - last.current[2];
      speedRef.current = speedRef.current * 0.8 + (Math.hypot(dx, dz) / dt) * 0.2;
      // weight transfer from the interpolated motion, same model as LocalCar
      const vx = dx / dt, vz = dz / dt;
      if (lastVel.current) {
        const clampA = (n) => Math.max(-60, Math.min(60, n));
        const ax = clampA((vx - lastVel.current[0]) / dt);
        const az = clampA((vz - lastVel.current[1]) / dt);
        _rq.set(s.q[0], s.q[1], s.q[2], s.q[3]);
        _rfwd.set(0, 0, 1).applyQuaternion(_rq);
        _rright.set(1, 0, 0).applyQuaternion(_rq);
        const grounded = (s.f || 0) & 2;
        const L = leanRef.current;
        L.aLat = ax * _rright.x + az * _rright.z; // for the antenna
        L.aLong = ax * _rfwd.x + az * _rfwd.z;
        L.aUp = 0;
        leanTarget(L.aLat, L.aLong, grounded, _lean);
        const k = 1 - Math.exp(-dt * LEAN.rate);
        L.roll += (_lean.roll - L.roll) * k;
        L.pitch += (_lean.pitch - L.pitch) * k;
        // what their wheels do: slip angle (counter-steer in a slide), and
        // the rears spinning up in a drift
        const fwdV = vx * _rfwd.x + vz * _rfwd.z;
        const slipT = grounded && fwdV > 2 ? Math.atan2(vx * _rright.x + vz * _rright.z, fwdV) : 0;
        L.slip += (slipT - L.slip) * Math.min(1, dt * 10);
        L.spin = grounded && (s.f & 1) ? 3 + Math.abs(fwdV) * 0.5 : 0;
      }
      // Their front wheels steer. Snapshots carry no input, but the yaw rate
      // is the steering: full lock turns ~3.6 rad/s once rolling (it was
      // never written, so every rival drove with its wheels dead straight).
      _rq.set(s.q[0], s.q[1], s.q[2], s.q[3]);
      _rfwd.set(0, 0, 1).applyQuaternion(_rq);
      const yaw = Math.atan2(_rfwd.x, _rfwd.z);
      if (lastYaw.current !== null) {
        const yawRate = Math.atan2(Math.sin(yaw - lastYaw.current), Math.cos(yaw - lastYaw.current)) / dt;
        const target = Math.max(-1, Math.min(1, yawRate / (3.6 * Math.max(0.3, Math.min(1, speedRef.current / 10)))));
        steerRef.current += (target - steerRef.current) * Math.min(1, dt * 10);
      }
      lastYaw.current = yaw;
      if (lastVel.current) { lastVel.current[0] = vx; lastVel.current[1] = vz; } else lastVel.current = [vx, vz];
    }
    if (last.current) { last.current[0] = s.p[0]; last.current[1] = s.p[1]; last.current[2] = s.p[2]; } else last.current = [s.p[0], s.p[1], s.p[2]];

    // Rivals' drifts and boosts, from the snapshot flags (bit 1 drifting,
    // 2 grounded, 256 boosting). The drifting bit was always sent and never
    // drawn, so nobody ever saw anyone else drift.
    const f = s.f || 0;
    boostingRef.current = !!(f & 256);
    // knocked-out ghosts in Last Car Standing make no sound
    if ((f & 128) && useStore.getState().modeId === 'last_standing') rivalAudio.delete(player.id);
    else {
      voice.x = s.p[0]; voice.y = s.p[1]; voice.z = s.p[2];
      voice.speed = speedRef.current; voice.boosting = !!(f & 256);
      rivalAudio.set(player.id, voice);
    }
    const cam = state.camera.position;
    const near = Math.hypot(s.p[0] - cam.x, s.p[2] - cam.z) < FX_RANGE;
    if (near && (f & 1) && (f & 2) && speedRef.current > 4) {
      _rq.set(s.q[0], s.q[1], s.q[2], s.q[3]);
      for (let i = 0; i < 2; i++) {
        _rcorner.set(REAR[i][0], REAR[i][1], REAR[i][2]).applyQuaternion(_rq);
        const x = s.p[0] + _rcorner.x, z = s.p[2] + _rcorner.z;
        skid(skidKeys[i], x, z);
        if (Math.random() < 0.3) {
          const gy = s.p[1] - RIDE;
          const v = lastVel.current || [0, 0];
          smoke([x, gy + 0.06, z], [v[0] * 0.45, 0.25, v[1] * 0.45], { size: 0.2, grow: 5.2, ttl: 1.4, color: '#efedea', alpha: 0.24, floor: gy, jitter: 0.9, drag: 0.08 });
        }
      }
    } else {
      skid(skidKeys[0], null);
      skid(skidKeys[1], null);
    }
    if (group.current) {
      // KO flag (bit 128): Last Car Standing ghosts vanish; sumo KOs keep
      // driving as mobile chicanes, so they stay visible there
      group.current.visible = !(((s.f || 0) & 128) && useStore.getState().modeId === 'last_standing');
      const shrunk = (s.f || 0) & 16;
      const target = shrunk ? POWERUP_EFFECT.SHRINK_SCALE : 1;
      const cur = group.current.scale.x;
      group.current.scale.setScalar(cur + (target - cur) * Math.min(1, dt * 6));
    }
  });

  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} userData={userData} position={[0, -50, 0]}>
      <CuboidCollider args={[CAR_WIDTH / 2, CAR_HEIGHT / 2, CAR_LENGTH / 2]} />
      <group ref={group}>
        {/* LOD: full model near, merged mid model (baked wheels, no
            suspension or driver, but the status overlays) past 12 units,
            2-draw proxy past 28; a little hysteresis so a car hovering at
            a threshold doesn't flicker between the two */}
        <Detailed distances={[0, 12, 28]} hysteresis={0.1}>
          <CarModel
            carId={player.car}
            paint={player.paint}
            cosmetics={player.cos}
            style={player.style}
            tune={player.tune}
            name={player.bot ? `🤖 ${player.name}` : player.name}
            team={useStore.getState().modeId === 'soccer' ? player.team : undefined}
            speedRef={speedRef}
            steerRef={steerRef}
            boostingRef={boostingRef}
            flagsRef={flagsRef}
            leanRef={leanRef}
          />
          <CarMid
            carId={player.car}
            paint={player.paint}
            style={player.style}
            tune={player.tune}
            name={player.bot ? `🤖 ${player.name}` : player.name}
            team={useStore.getState().modeId === 'soccer' ? player.team : undefined}
            flagsRef={flagsRef}
            boostingRef={boostingRef}
          />
          <CarProxy carId={player.car} paint={player.paint} />
        </Detailed>
      </group>
    </RigidBody>
  );
});
