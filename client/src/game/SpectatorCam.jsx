// Drone cam for eliminated players (Last Car Standing): a slow orbit around
// a surviving car. Click, Space or E cycles targets. LocalCar hands the
// camera over while `spectating` is set, and takes it back on match start.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store.js';
import { net, sampleRemote } from '../net.js';

export default function SpectatorCam() {
  const spectating = useStore((s) => s.spectating);
  const camera = useThree((s) => s.camera);
  const S = useRef({ angle: 0, idx: 0 }).current;

  useEffect(() => {
    if (!spectating) return;
    const next = () => { S.idx++; };
    const key = (e) => { if (e.code === 'Space' || e.code === 'KeyE') next(); };
    window.addEventListener('mousedown', next);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', next);
      window.removeEventListener('keydown', key);
    };
  }, [spectating, S]);

  useFrame((_, dt) => {
    if (!spectating) return;
    S.angle += dt * 0.35;
    // survivors only — flag 64 marks fellow ghosts
    const ids = [...net.remotes.keys()].filter((id) => !((net.flags.get(id) || 0) & 64));
    if (!ids.length) return;
    const id = ids[S.idx % ids.length];
    const s = sampleRemote(id);
    if (!s) return;
    const r = 7;
    const k = Math.min(1, dt * 3);
    camera.position.x += (s.p[0] + Math.cos(S.angle) * r - camera.position.x) * k;
    camera.position.y += ((s.p[1] || 0) + 4 - camera.position.y) * k;
    camera.position.z += (s.p[2] + Math.sin(S.angle) * r - camera.position.z) * k;
    camera.lookAt(s.p[0], (s.p[1] || 0) + 0.5, s.p[2]);
    const name = useStore.getState().players[id]?.name || null;
    if (useStore.getState().spectateTarget !== name) useStore.setState({ spectateTarget: name });
  });
  return null;
}
