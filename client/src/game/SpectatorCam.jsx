// Drone cam for eliminated players (Last Car Standing): a slow orbit around
// a surviving car. Click, Space or E cycles targets. LocalCar hands the
// camera over while `spectating` is set, and takes it back on match start.
// Also home of photo mode: an orbit around your own car, and the aerial —
// the ceiling faces down (backface-culled from above), so the office reads
// as a dollhouse from the air.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { currentMap } from './activeMap.js';
import { net, sampleRemote } from '../net.js';
import { carView, clearLens } from './carView.js';

const _p = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Pull a lens at `p` in toward a target at (tx, ty, tz) until it's clear of
// walls and big props (the chase rig's probe, carView.js).
function clearOf(p, tx, ty, tz) {
  const f = clearLens(tx, ty, tz, p.x, p.y, p.z);
  if (f < 1) p.set(tx + (p.x - tx) * f, ty + (p.y - ty) * f, tz + (p.z - tz) * f);
  return p;
}

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
    // a low, close orbit — near enough to watch the car work, with the
    // chase rig's wall probe so a wall between drone and car pulls it in
    // instead of filling the screen
    const r = 5;
    const ty = (s.p[1] || 0) + 0.5;
    _p.set(s.p[0] + Math.cos(S.angle) * r, (s.p[1] || 0) + 2.5, s.p[2] + Math.sin(S.angle) * r);
    clearOf(_p, s.p[0], ty, s.p[2]);
    const k = Math.min(1, dt * 3);
    camera.position.x += (_p.x - camera.position.x) * k;
    camera.position.y += (_p.y - camera.position.y) * k;
    camera.position.z += (_p.z - camera.position.z) * k;
    camera.lookAt(s.p[0], (s.p[1] || 0) + 0.3, s.p[2]);
    const name = useStore.getState().players[id]?.name || null;
    if (useStore.getState().spectateTarget !== name) useStore.setState({ spectateTarget: name });
  });
  return null;
}

// Photo mode (P). Two lenses, C switches:
// - car: an orbit round your own car — drag or the arrow keys swing it,
//   the wheel zooms (1.2–6 u). A portrait lens, and nothing but the car:
//   the chase camera never shows the car from the side or the front.
// - aerial: a slow cinematic sweep over the whole floor — the establishing
//   shot. It pendulums along the southern side (a full orbit would fly
//   through the skyline towers behind the north windows).
// WASD still drive: a photo of a car mid-drift is the point.
const ARROWS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1 };
const PHOTO_FOV = 42;
const AERIAL_FOV = 58; // what the sweep's distances were framed with
export function PhotoOrbitCam() {
  const photoMode = useStore((s) => s.photoMode);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const S = useRef({ t: 0, lens: 'car', az: 0, el: 0.32, r: 2.8, drag: null, keys: {}, fresh: true }).current;

  useEffect(() => {
    if (!photoMode) return undefined;
    S.fresh = true; // each visit starts behind the car
    S.keys = {};
    const canvas = gl.domElement;
    // capture phase: a drag on the world is the orbit, not a click that
    // fires your item (useControls listens on the window too)
    const down = (e) => {
      if (e.button !== 0 || e.target !== canvas) return;
      S.drag = [e.clientX, e.clientY];
      e.stopImmediatePropagation();
    };
    const move = (e) => {
      if (!S.drag) return;
      S.az -= (e.clientX - S.drag[0]) * 0.006;
      S.el = clamp(S.el + (e.clientY - S.drag[1]) * 0.005, -0.04, 1.35);
      S.drag = [e.clientX, e.clientY];
    };
    const up = () => { S.drag = null; };
    const wheel = (e) => { e.preventDefault(); S.r = clamp(S.r * Math.exp(e.deltaY * 0.0012), 1.2, 6); };
    // arrows orbit instead of drive (keydown is swallowed; keyup is let
    // through, so an arrow held on the way in still lets go of the car)
    const keydown = (e) => {
      if (ARROWS[e.code]) { S.keys[e.code] = true; e.stopImmediatePropagation(); e.preventDefault(); }
      if (e.code === 'KeyC' && !e.repeat) S.lens = S.lens === 'car' ? 'aerial' : 'car';
    };
    const keyup = (e) => { if (ARROWS[e.code]) S.keys[e.code] = false; };
    window.addEventListener('mousedown', down, true);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup);
      S.drag = null;
    };
  }, [photoMode, gl, S]);

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
    if (S.lens === 'car' && carView.ready) {
      if (S.fresh) {
        // start where the chase camera was: behind the car, a little high
        S.az = carView.yaw + Math.PI;
        S.el = 0.32;
        S.fresh = false;
        camera.position.set(carView.x + Math.sin(S.az) * S.r, carView.y + 0.9, carView.z + Math.cos(S.az) * S.r);
      }
      const K = S.keys;
      S.az += ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * dt * 1.6;
      S.el = clamp(S.el + ((K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0)) * dt * 0.9, -0.04, 1.35);
      const tx = carView.x, ty = carView.y + 0.02, tz = carView.z;
      const ce = Math.cos(S.el);
      _p.set(tx + Math.sin(S.az) * ce * S.r, ty + 0.12 + Math.sin(S.el) * S.r, tz + Math.cos(S.az) * ce * S.r);
      clearOf(_p, tx, ty + 0.3, tz);
      const k = 1 - Math.exp(-Math.min(dt, 0.5) / 0.08);
      camera.position.lerp(_p, k);
      camera.lookAt(tx, ty, tz);
      if (Math.abs(camera.fov - PHOTO_FOV) > 0.05) { camera.fov = PHOTO_FOV; camera.updateProjectionMatrix(); }
      return;
    }
    S.t += dt * 0.1;
    const az = Math.sin(S.t) * 0.85; // sweep angle around south
    const k = Math.min(1, dt * 2);
    // sized to the floor: the office's numbers (72 / 46 / 52) scale with the
    // map's extent, centred on it
    const B = currentMap().MAP_BOUNDS;
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    const sx = (B.maxX - B.minX) / 186.7, sz = (B.maxZ - B.minZ) / 106.7;
    camera.position.x += (cx + Math.sin(az) * 72 * sx - camera.position.x) * k;
    camera.position.y += (46 * Math.max(sx, sz) - camera.position.y) * k;
    camera.position.z += ((cz - Math.cos(az) * 52 * sz - 6) - camera.position.z) * k;
    camera.lookAt(cx, -2, cz + 2);
    if (Math.abs(camera.fov - AERIAL_FOV) > 0.05) { camera.fov = AERIAL_FOV; camera.updateProjectionMatrix(); }
  });
  return null;
}
