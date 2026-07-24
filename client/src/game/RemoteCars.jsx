// Other players & bots: kinematic bodies driven by interpolated snapshots,
// so the local car physically bounces off them.
import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Detailed } from '@react-three/drei';
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

const RemoteCar = memo(function RemoteCar({ player }) {
  const rb = useRef();
  const group = useRef();
  const speedRef = useRef(0);
  const steerRef = useRef(0);
  const boostingRef = useRef(false);
  const flagsRef = useRef(0);
  const last = useRef(null);

  useFrame((_, dt) => {
    const s = sampleRemote(player.id);
    if (!s || !rb.current) return;
    rb.current.setNextKinematicTranslation({ x: s.p[0], y: s.p[1], z: s.p[2] });
    rb.current.setNextKinematicRotation({ x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] });
    flagsRef.current = s.f || 0;
    if (last.current && dt > 0) {
      const dx = s.p[0] - last.current[0], dz = s.p[2] - last.current[2];
      speedRef.current = speedRef.current * 0.8 + (Math.hypot(dx, dz) / dt) * 0.2;
    }
    last.current = [...s.p];
    if (group.current) {
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
            style={player.style}
            name={player.name}
            team={useStore.getState().modeId === 'soccer' ? player.team : undefined}
            speedRef={speedRef}
            steerRef={steerRef}
            boostingRef={boostingRef}
            flagsRef={flagsRef}
          />
          <CarProxy carId={player.car} paint={player.paint} />
        </Detailed>
      </group>
    </RigidBody>
  );
});
