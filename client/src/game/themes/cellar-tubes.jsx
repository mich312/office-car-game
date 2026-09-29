// The thing the cellar is about is the light.
//
// Every room hangs a grid of louvred fluorescent battens from the concrete —
// 1.5 m twin-tube fittings with a parabolic aluminium grid underneath — and
// most of them are fine. A few are not: the one over the crossroads is dying
// (it stutters, strikes, holds, drops out and tries again, its ends glowing
// orange while it tries), one in the e-waste room is dead but for the odd
// flash, the archive's pulses, the loading dock's stutters. The flicker
// drives the tube, the louvre, the light pool on the floor, the wash on the
// nearest wall and — for the worst one — a real point light and a buzz.
//
// Old tubes are not all one colour: each is a few percent off by hash, their
// last 6 cm are blackened, and every room has one warm replacement somebody
// fitted from the wrong box.
import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import { glowTex } from '../textures.js';
import { louvreTex } from './cellar-tex.js';
import { Kit } from './cellar-kit.js';

const FIX_L = 1.5, FIX_W = 0.22; // metres
const TUBE_L = 1.44, TUBE_R = 0.013;

// ------------------------------------------------------------ flicker
// Deterministic value noise: the same tube misbehaves the same way on every
// client, so a flicker two players drive through is the same flicker.
export const hash = (n) => {
  let h = (n * 374761393) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// → brightness 0…1 for a tube of this kind at time t
export function tubeLevel(kind, t, seed = 0) {
  switch (kind) {
    case 'dying': {
      // a 7.5 s cycle: stutter while it tries to strike, catch and hold with a
      // faint flutter, then drop out and sit dark before the next attempt
      const c = (t + seed * 3.1) % 7.5;
      if (c < 1.4) return hash(Math.floor(t * 16) + seed * 977) > 0.5 ? 1 : 0.05;
      if (c < 5.6) return 0.9 + 0.1 * Math.sin(t * 90);
      return 0.04;
    }
    case 'stutter':
      // mostly on, with short bursts of dropout
      return hash(Math.floor(t * 10) + seed * 131) > 0.92 ? 0.1 : 0.95;
    case 'pulse':
      // an old starter: slow breathing brightness
      return 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2 + seed));
    case 'dead':
      // dark, and every few seconds a flash that makes you look
      return hash(Math.floor(t * 8) + seed * 53) > 0.975 ? 1 : 0.02;
    default:
      return 1;
  }
}
// the cathode ends: a tube trying to strike glows orange at both ends while
// its middle stays dark; a dead one keeps a dull ember
export function endGlow(kind, t, seed = 0) {
  if (kind === 'dying') {
    const c = (t + seed * 3.1) % 7.5;
    if (c < 1.4) return 1;
    if (c >= 5.6) return 0.35 + 0.1 * Math.sin(t * 7);
    return 0;
  }
  if (kind === 'dead') return 0.22;
  return 0;
}

// Fixtures per room: long rooms (the corridor) get one line down the long
// axis, square rooms a grid. Metres.
export function tubeLayout(map) {
  const out = [];
  for (const r of map.ROOMS) {
    const rx = r.x / M, rz = r.z / M, rw = r.w / M, rd = r.d / M;
    const long = Math.max(rw, rd) / Math.min(rw, rd) > 3;
    const start = out.length;
    if (long) {
      const alongX = rw > rd;
      const len = Math.max(rw, rd);
      const n = Math.floor(len / 3);
      for (let i = 0; i < n; i++) {
        const s = -len / 2 + (i + 0.5) * (len / n);
        out.push({ x: alongX ? rx + s : rx, z: alongX ? rz : rz + s, rotY: alongX ? 0 : Math.PI / 2, room: r.id });
      }
    } else {
      const nx = Math.max(1, Math.round(rw / 3.4));
      const nz = Math.max(1, Math.round(rd / 2.8));
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          out.push({ x: rx - rw / 2 + (i + 0.5) * (rw / nx), z: rz - rd / 2 + (j + 0.5) * (rd / nz), rotY: 0, room: r.id });
        }
      }
    }
    // one warm replacement tube per room, somewhere in the middle
    const pick = start + Math.floor(hash(start * 31 + 7) * (out.length - start));
    if (out[pick]) out[pick].warm = hash(pick) > 0.5 ? 1 : 0;
  }
  // the misbehaving ones: the nearest fixture to each FLICKER spot
  for (const [k, fl] of (map.FLICKER || []).entries()) {
    let best = null, bd = Infinity;
    for (const tb of out) {
      const d = Math.hypot(tb.x - fl.at[0], tb.z - fl.at[1]);
      if (d < bd && !tb.kind) { bd = d; best = tb; }
    }
    if (best) { best.kind = fl.kind; best.seed = k + 1; best.light = !!fl.light; delete best.warm; }
  }
  return out;
}

// the nearest wall face within reach of a fixture: where its light washes
function washSpots(map, tubes) {
  const walls = map.WALLS.filter((w) => !w.glass).map((w) => ({ x: w.x / M, z: w.z / M, w: w.w / M, d: w.d / M }));
  const out = [];
  tubes.forEach((tb, i) => {
    let best = null;
    for (const w of walls) {
      // closest point on the wall box, and the face it lies on
      const cx = Math.max(w.x - w.w / 2, Math.min(w.x + w.w / 2, tb.x));
      const cz = Math.max(w.z - w.d / 2, Math.min(w.z + w.d / 2, tb.z));
      const d = Math.hypot(tb.x - cx, tb.z - cz);
      if (d > 0.05 && d < 1.9 && (!best || d < best.d)) best = { d, cx, cz, nx: (tb.x - cx) / d, nz: (tb.z - cz) / d };
    }
    if (best && (Math.abs(best.nx) > 0.9 || Math.abs(best.nz) > 0.9)) out.push({ i, ...best, k: 1 - best.d / 1.9 });
  });
  return out;
}

const _c = new THREE.Color();
const _o = new THREE.Object3D();
const COOL = new THREE.Color('#e8fff4');
const WARM = new THREE.Color('#ffe0b0');

// tube geometry: a white middle, blackened last 6 cm, as vertex colours
function tubeGeometry() {
  const k = new Kit();
  const end = 0.06;
  k.cyl('glow', TUBE_R, TUBE_L - 2 * end, [0, 0, 0], { r: [0, 0, Math.PI / 2], seg: 8, c: '#ffffff' });
  for (const s of [-1, 1]) {
    k.cyl('glow', TUBE_R, end, [s * (TUBE_L / 2 - end / 2), 0, 0], { r: [0, 0, Math.PI / 2], seg: 8, c: '#262320' });
    k.cyl('glow', TUBE_R * 0.8, 0.02, [s * (TUBE_L / 2 + 0.01), 0, 0], { r: [0, 0, Math.PI / 2], seg: 6, c: '#555555' });
  }
  return k.finish()[0].geometry;
}
// housing: a shallow steel body, end caps, the reflector wings
function housingGeometry() {
  const k = new Kit();
  k.box('paint', [FIX_L, 0.05, FIX_W], [0, 0.025, 0], { c: '#d9ddd6' });
  for (const s of [-1, 1]) {
    k.box('paint', [FIX_L, 0.06, 0.012], [0, -0.02, s * (FIX_W / 2 - 0.006)], { c: '#cfd3cc' });
    k.box('paint', [0.012, 0.06, FIX_W], [s * (FIX_L / 2 - 0.006), -0.02, 0], { c: '#cfd3cc' });
    k.box('paint', [0.03, 0.03, 0.03], [s * (FIX_L / 2 - 0.1), 0.065, 0], { c: '#666' }); // hanger
  }
  return k.finish()[0].geometry;
}
// a quad facing down (for the louvre and the lit reflector)
function downQuad(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(Math.PI / 2);
  return g;
}

export default function Tubes({ map }) {
  const H = map.WALL_HEIGHT;
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const tubes = useMemo(() => tubeLayout(map), [map]);
  const bad = useMemo(() => tubes.map((t, i) => (t.kind ? i : -1)).filter((i) => i >= 0), [tubes]);
  const worst = useMemo(() => tubes.find((t) => t.light), [tubes]);
  const wash = useMemo(() => washSpots(map, tubes), [map, tubes]);
  const washOf = useMemo(() => {
    const m = new Map();
    wash.forEach((w, j) => m.set(w.i, j));
    return m;
  }, [wash]);

  const housing = useRef(), tubeMesh = useRef(), ends = useRef(), louvre = useRef(), plate = useRef(), pools = useRef(), washes = useRef();
  const flickLight = useRef();
  const lastLevel = useRef(new Map());
  const lastBuzz = useRef(0);

  const G = useMemo(() => ({
    tube: tubeGeometry(),
    housing: housingGeometry(),
    end: new THREE.CylinderGeometry(TUBE_R * 1.25 * M, TUBE_R * 1.25 * M, 0.08 * M, 8).rotateZ(Math.PI / 2),
    louvre: downQuad(FIX_L * M - 0.1, FIX_W * M - 0.06),
    plate: downQuad(FIX_L * M - 0.1, FIX_W * M - 0.06),
    pool: new THREE.PlaneGeometry(FIX_L * M * 3.6, FIX_L * M * 2.8).rotateX(-Math.PI / 2),
    wash: new THREE.PlaneGeometry(2.6 * M, 2.2 * M),
  }), []);
  const mats = useMemo(() => {
    const glow = glowTex();
    return {
      housing: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }),
      // unlit and over-bright so bloom picks them up; instance colour is level
      tube: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      end: new THREE.MeshBasicMaterial({ toneMapped: false }),
      louvre: new THREE.MeshBasicMaterial({ alphaMap: louvreTex(), alphaTest: 0.4, side: THREE.DoubleSide, toneMapped: false }),
      plate: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({
        map: glow, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
      wash: new THREE.MeshBasicMaterial({
        map: glow, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2,
      }),
    };
  }, []);

  // each tube's own colour: ±5 % by hash, the warm replacement warmer
  const base = useMemo(() => tubes.flatMap((tb, i) => [0, 1].map((j) => {
    const c = new THREE.Color().copy(tb.warm === j ? WARM : COOL);
    const v = 1 + (hash(i * 7 + j * 3 + 11) - 0.5) * 0.1;
    c.offsetHSL((hash(i * 13 + j) - 0.5) * 0.02, 0, 0);
    return c.multiplyScalar(2.1 * v);
  })), [tubes]);
  const POOL = useMemo(() => new THREE.Color('#bff5dc'), []);
  const LOUV = useMemo(() => new THREE.Color(1.15, 1.25, 1.2), []);
  const EMBER = useMemo(() => new THREE.Color(2.6, 0.95, 0.5), []); // #ff8a5c, over-bright

  useLayoutEffect(() => {
    const Y = H - 0.02 * M;
    tubes.forEach((tb, i) => {
      _o.rotation.set(0, tb.rotY, 0);
      _o.scale.set(1, 1, 1);
      _o.position.set(tb.x * M, Y - 0.05 * M, tb.z * M);
      _o.updateMatrix();
      housing.current.setMatrixAt(i, _o.matrix);
      _o.position.y = Y - 0.035 * M;
      _o.updateMatrix();
      plate.current.setMatrixAt(i, _o.matrix);
      _o.position.y = Y - 0.105 * M;
      _o.updateMatrix();
      louvre.current.setMatrixAt(i, _o.matrix);
      for (const j of [0, 1]) {
        const off = (j ? 1 : -1) * 0.05 * M;
        // the pair sits side by side across the fitting
        _o.position.set(tb.x * M + (tb.rotY ? off : 0), Y - 0.07 * M, tb.z * M + (tb.rotY ? 0 : off));
        _o.updateMatrix();
        tubeMesh.current.setMatrixAt(i * 2 + j, _o.matrix);
        tubeMesh.current.setColorAt(i * 2 + j, base[i * 2 + j]);
      }
      _o.position.set(tb.x * M, 0.04, tb.z * M);
      _o.rotation.set(0, tb.rotY, 0);
      _o.updateMatrix();
      pools.current.setMatrixAt(i, _o.matrix);
      pools.current.setColorAt(i, POOL);
      louvre.current.setColorAt(i, LOUV);
      plate.current.setColorAt(i, _c.copy(LOUV).multiplyScalar(1.3));
    });
    // cathode-end glows for the bad tubes: 2 tubes × 2 ends each
    bad.forEach((i, b) => {
      const tb = tubes[i];
      for (let e = 0; e < 4; e++) {
        const off = (e & 1 ? 1 : -1) * 0.05 * M;
        const along = (e & 2 ? 1 : -1) * (TUBE_L / 2 - 0.04) * M;
        _o.rotation.set(0, tb.rotY, 0);
        _o.position.set(tb.x * M + (tb.rotY ? off : along), H - 0.09 * M, tb.z * M + (tb.rotY ? -along : off));
        _o.updateMatrix();
        ends.current.setMatrixAt(b * 4 + e, _o.matrix);
        ends.current.setColorAt(b * 4 + e, _c.setRGB(0, 0, 0));
      }
    });
    wash.forEach((w, j) => {
      // on the wall face, centred high, looking back into the room
      _o.position.set(w.cx * M + w.nx * 0.03, H - 0.9 * M, w.cz * M + w.nz * 0.03);
      _o.rotation.set(0, Math.atan2(w.nx, w.nz), 0);
      _o.updateMatrix();
      washes.current.setMatrixAt(j, _o.matrix);
      washes.current.setColorAt(j, _c.copy(POOL).multiplyScalar(w.k));
    });
    for (const m of [housing.current, tubeMesh.current, ends.current, louvre.current, plate.current, pools.current, washes.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [tubes, H, base, bad, wash, POOL, LOUV]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const tm = tubeMesh.current, p = pools.current, lv = louvre.current, pl = plate.current, en = ends.current, wa = washes.current;
    if (!tm || !p) return;
    if (lightsOut) {
      // blackout: every tube dies at once (the exit signs stay on)
      if (lastLevel.current.get(-1) !== 0) {
        for (let i = 0; i < tubes.length; i++) {
          tm.setColorAt(i * 2, _c.setRGB(0.02, 0.02, 0.02)); tm.setColorAt(i * 2 + 1, _c);
          p.setColorAt(i, _c.setRGB(0, 0, 0)); lv.setColorAt(i, _c.setRGB(0.04, 0.04, 0.04)); pl.setColorAt(i, _c);
        }
        for (let j = 0; j < wash.length; j++) wa.setColorAt(j, _c.setRGB(0, 0, 0));
        for (const m of [tm, p, lv, pl, wa]) m.instanceColor.needsUpdate = true;
        lastLevel.current.clear();
        lastLevel.current.set(-1, 0);
      }
      if (flickLight.current) flickLight.current.intensity = 0;
      return;
    }
    if (lastLevel.current.get(-1) === 0) {
      // after a blackout, relight everything in one pass
      lastLevel.current.clear();
      tubes.forEach((_, i) => {
        tm.setColorAt(i * 2, base[i * 2]); tm.setColorAt(i * 2 + 1, base[i * 2 + 1]);
        p.setColorAt(i, POOL); lv.setColorAt(i, LOUV); pl.setColorAt(i, _c.copy(LOUV).multiplyScalar(1.3));
      });
      wash.forEach((w, j) => wa.setColorAt(j, _c.copy(POOL).multiplyScalar(w.k)));
    }
    bad.forEach((i, b) => {
      const tb = tubes[i];
      const l = tubeLevel(tb.kind, t, tb.seed);
      const e = endGlow(tb.kind, t, tb.seed);
      const mid = Math.max(0.03, l);
      tm.setColorAt(i * 2, _c.copy(base[i * 2]).multiplyScalar(mid));
      tm.setColorAt(i * 2 + 1, _c.copy(base[i * 2 + 1]).multiplyScalar(tb.kind === 'dying' ? mid : Math.min(1, mid * 1.4)));
      p.setColorAt(i, _c.copy(POOL).multiplyScalar(l));
      lv.setColorAt(i, _c.copy(LOUV).multiplyScalar(0.1 + 0.9 * l));
      pl.setColorAt(i, _c.copy(LOUV).multiplyScalar(0.12 + 1.2 * l));
      for (let k = 0; k < 4; k++) en.setColorAt(b * 4 + k, _c.copy(EMBER).multiplyScalar(e * (0.85 + 0.15 * Math.sin(t * 40 + k))));
      const j = washOf.get(i);
      if (j !== undefined) wa.setColorAt(j, _c.copy(POOL).multiplyScalar(wash[j].k * (0.08 + l)));
      const prev = lastLevel.current.get(i) ?? l;
      // a strike: the tube catches — buzz from where it hangs (throttled so a
      // stutter is a crackle, not a machine gun)
      if (prev < 0.3 && l > 0.7 && (tb.kind === 'dying' || tb.kind === 'dead') && t - lastBuzz.current > 0.12) {
        lastBuzz.current = t;
        audio.tubeBuzz([tb.x * M, H, tb.z * M], tb.kind === 'dead' ? 0.6 : 1);
      }
      lastLevel.current.set(i, l);
      if (tb === worst && flickLight.current) flickLight.current.intensity = 9 * l;
    });
    for (const m of [tm, p, lv, pl, en, wa]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  });

  const nBad = Math.max(1, bad.length * 4);
  return (
    <group>
      <instancedMesh ref={housing} args={[G.housing, mats.housing, tubes.length]} />
      <instancedMesh ref={plate} args={[G.plate, mats.plate, tubes.length]} />
      <instancedMesh ref={tubeMesh} args={[G.tube, mats.tube, tubes.length * 2]} />
      <instancedMesh ref={ends} args={[G.end, mats.end, nBad]} />
      <instancedMesh ref={louvre} args={[G.louvre, mats.louvre, tubes.length]} />
      <instancedMesh ref={pools} args={[G.pool, mats.pool, tubes.length]} />
      <instancedMesh ref={washes} args={[G.wash, mats.wash, Math.max(1, wash.length)]} />
      {worst && (
        <pointLight ref={flickLight} position={[worst.x * M, H - 0.35 * M, worst.z * M]}
          intensity={9} distance={11 * M} decay={1.6} color="#e4fff2" />
      )}
    </group>
  );
}
