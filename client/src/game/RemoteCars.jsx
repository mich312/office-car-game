// Other players & bots: kinematic bodies driven by interpolated snapshots,
// so the local car physically bounces off them.
import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Detailed } from '@react-three/drei';
import * as THREE from 'three';
import { CARS, CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH, POWERUP_EFFECT } from '@rc/shared';
import { useStore } from '../store.js';
import { net, sampleRemote } from '../net.js';
import CarModel, { CarProxy } from './CarModel.jsx';

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

const RemoteCar = memo(function RemoteCar({ player }) {
  const rb = useRef();
  const group = useRef();
  const speedRef = useRef(0);
  const steerRef = useRef(0);
  const boostingRef = useRef(false);
  const flagsRef = useRef(0);
  const leanRef = useRef({ roll: 0, pitch: 0 });
  const last = useRef(null);
  const lastVel = useRef(null);

  useFrame((_, dt) => {
    const s = sampleRemote(player.id);
    if (!s || !rb.current) return;
    rb.current.setNextKinematicTranslation({ x: s.p[0], y: s.p[1], z: s.p[2] });
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
        const tRoll = grounded ? Math.max(-0.14, Math.min(0.14, (ax * _rright.x + az * _rright.z) * 0.0032)) : 0;
        const tPitch = grounded ? Math.max(-0.09, Math.min(0.09, -(ax * _rfwd.x + az * _rfwd.z) * 0.0035)) : 0;
        const k = Math.min(1, dt * 7);
        leanRef.current.roll += (tRoll - leanRef.current.roll) * k;
        leanRef.current.pitch += (tPitch - leanRef.current.pitch) * k;
      }
      lastVel.current = [vx, vz];
    }
    last.current = [...s.p];
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
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} userData={{ playerId: player.id }} position={[0, -50, 0]}>
      <CuboidCollider args={[CAR_WIDTH / 2, CAR_HEIGHT / 2, CAR_LENGTH / 2]} />
      <group ref={group}>
        {/* LOD: full model near, 3-box proxy past ~28 units */}
        <Detailed distances={[0, 28]}>
          <CarModel
            carId={player.car}
            paint={player.paint}
            cosmetics={player.cos}
            style={player.style}
            name={player.name}
            team={useStore.getState().modeId === 'soccer' ? player.team : undefined}
            speedRef={speedRef}
            steerRef={steerRef}
            boostingRef={boostingRef}
            flagsRef={flagsRef}
            leanRef={leanRef}
          />
          <CarProxy carId={player.car} paint={player.paint} />
        </Detailed>
      </group>
    </RigidBody>
  );
});
