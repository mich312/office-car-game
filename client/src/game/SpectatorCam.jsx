// Drone cam for eliminated players (Last Car Standing): a slow orbit around
// a surviving car. Click, Space or E cycles targets. LocalCar hands the
// camera over while `spectating` is set, and takes it back on match start.
// Also home of the photo-mode aerial: the ceiling faces down (backface-
// culled from above), so the office reads as a dollhouse from the air.
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
    // survivors only — flag bit 128 marks fellow ghosts
    const ids = [...net.remotes.keys()].filter((id) => !((net.flags.get(id) || 0) & 128));
    if (!ids.length) return;
    const id = ids[S.idx % ids.length];
    const s = sampleRemote(id);
    if (!s) return;
    // high half-orbit: enough altitude to clear walls and read the room
    const r = 9;
    const k = Math.min(1, dt * 3);
    camera.position.x += (s.p[0] + Math.cos(S.angle) * r - camera.position.x) * k;
    camera.position.y += ((s.p[1] || 0) + 6 - camera.position.y) * k;
    camera.position.z += (s.p[2] + Math.sin(S.angle) * r - camera.position.z) * k;
    camera.lookAt(s.p[0], (s.p[1] || 0) + 0.5, s.p[2]);
    const name = useStore.getState().players[id]?.name || null;
    if (useStore.getState().spectateTarget !== name) useStore.setState({ spectateTarget: name });
  });
  return null;
}

// Photo mode (P): a slow cinematic aerial sweep over the whole office —
// the establishing shot the chase cam can never give you. The camera
// pendulums along the southern side (a full orbit would fly through the
// skyline towers behind the north windows).
export function PhotoOrbitCam() {
  const photoMode = useStore((s) => s.photoMode);
  const camera = useThree((s) => s.camera);
  const S = useRef({ t: 0 }).current;
  useFrame((_, dt) => {
    if (!photoMode) return;
    // free-camera hook for screenshots/tooling: set window.__rcCamOverride
    // to { x, y, z, tx, ty, tz } while in photo mode to park the camera
    const o = typeof window !== 'undefined' ? window.__rcCamOverride : null;
    if (o) {
      camera.position.set(o.x, o.y, o.z);
      camera.lookAt(o.tx, o.ty, o.tz);
      return;
    }
    S.t += dt * 0.1;
    const az = Math.sin(S.t) * 0.85; // sweep angle around south
    const k = Math.min(1, dt * 2);
    camera.position.x += (Math.sin(az) * 72 - camera.position.x) * k;
    camera.position.y += (46 - camera.position.y) * k;
    camera.position.z += ((-Math.cos(az) * 52 - 6) - camera.position.z) * k;
    camera.lookAt(0, -2, 2);
  });
  return null;
}
