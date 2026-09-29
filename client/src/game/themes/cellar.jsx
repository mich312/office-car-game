// The IT Cellar's own dressing: the thing it is about is the light.
//
// Every room hangs a grid of twin-tube fluorescent fixtures from a low
// concrete ceiling, and most of them are fine. A few are not: the one over
// the crossroads is dying (it stutters, strikes, holds, drops out and tries
// again, buzzing each time it catches), one in the e-waste room is dead but
// for the odd flash, the archive's pulses, the loading dock's stutters. The
// flicker drives the tube, the light pool under it and — for the worst one —
// a real point light and a positional buzz, so the flicker is something you
// drive through rather than wallpaper.
//
// Also here: pipes and cable trays along the ceiling, painted floor markings
// (a centre line down Corridor B-1 and a box junction at the crossroads),
// stencilled signs, exit signs, and the cellar's own furniture.
import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import { roundedBox } from '../roundedGeo.js';
import { glowTex } from '../textures.js';

const TUBE_LEN = 1.25 * M;
const TUBE_W = 0.2 * M;

// ------------------------------------------------------------ flicker
// Deterministic value noise: the same tube misbehaves the same way on every
// client, so a flicker two players drive through is the same flicker.
const hash = (n) => {
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

// Fixtures per room: long rooms (the corridor) get one line down the long
// axis, square rooms a grid.
function tubeLayout(map) {
  const out = [];
  for (const r of map.ROOMS) {
    const long = Math.max(r.w, r.d) / Math.min(r.w, r.d) > 3;
    if (long) {
      const alongX = r.w > r.d;
      const len = Math.max(r.w, r.d);
      const n = Math.floor(len / (3 * M));
      for (let i = 0; i < n; i++) {
        const s = -len / 2 + (i + 0.5) * (len / n);
        out.push({ x: alongX ? r.x + s : r.x, z: alongX ? r.z : r.z + s, rotY: alongX ? 0 : Math.PI / 2 });
      }
    } else {
      const nx = Math.max(1, Math.round(r.w / (3.4 * M)));
      const nz = Math.max(1, Math.round(r.d / (2.8 * M)));
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          out.push({ x: r.x - r.w / 2 + (i + 0.5) * (r.w / nx), z: r.z - r.d / 2 + (j + 0.5) * (r.d / nz), rotY: 0 });
        }
      }
    }
  }
  // the misbehaving ones: the nearest fixture to each FLICKER spot
  for (const [k, fl] of (map.FLICKER || []).entries()) {
    let best = null, bd = Infinity;
    for (const tb of out) {
      const d = Math.hypot(tb.x - fl.at[0] * M, tb.z - fl.at[1] * M);
      if (d < bd && !tb.kind) { bd = d; best = tb; }
    }
    if (best) { best.kind = fl.kind; best.seed = k + 1; best.light = !!fl.light; }
  }
  return out;
}

export function Dressing({ map }) {
  return (
    <group>
      <CeilingAndTubes map={map} />
      <Pipes map={map} />
      <FloorMarkings map={map} />
      <Signs map={map} />
    </group>
  );
}

// ---------------------------------------------------- ceiling and tubes
const _c = new THREE.Color();
const _o = new THREE.Object3D();

function CeilingAndTubes({ map }) {
  const H = map.WALL_HEIGHT;
  const B = map.MAP_BOUNDS;
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const tubes = useMemo(() => tubeLayout(map), [map]);
  const bad = useMemo(() => tubes.map((t, i) => (t.kind ? i : -1)).filter((i) => i >= 0), [tubes]);
  const worst = useMemo(() => tubes.find((t) => t.light), [tubes]);

  const housing = useRef();
  const glow = useRef();
  const pools = useRef();
  const flickLight = useRef();
  const lastLevel = useRef(new Map());
  const lastBuzz = useRef(0);

  const housingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9ddd6', roughness: 0.55, metalness: 0.3 }), []);
  // the tubes themselves: unlit, over-bright so bloom picks them up; each
  // instance's colour carries its brightness
  const tubeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), []);
  const poolMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: glowTex(), color: '#ffffff', transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }), []);
  const ceilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5d625e', roughness: 0.95 }), []);
  const beamMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#747a74', roughness: 0.9 }), []);

  const TUBE_ON = useMemo(() => new THREE.Color(1.9, 2.2, 2.05), []);
  const POOL_ON = useMemo(() => new THREE.Color('#bff5dc'), []);

  useLayoutEffect(() => {
    tubes.forEach((tb, i) => {
      _o.position.set(tb.x, H - 0.09 * M, tb.z);
      _o.rotation.set(0, tb.rotY, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      housing.current.setMatrixAt(i, _o.matrix);
      _o.position.y = H - 0.16 * M;
      _o.updateMatrix();
      glow.current.setMatrixAt(i, _o.matrix);
      glow.current.setColorAt(i, TUBE_ON);
      _o.position.set(tb.x, 0.025, tb.z);
      _o.rotation.set(-Math.PI / 2, 0, tb.rotY);
      _o.updateMatrix();
      pools.current.setMatrixAt(i, _o.matrix);
      pools.current.setColorAt(i, POOL_ON);
    });
    for (const m of [housing.current, glow.current, pools.current]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [tubes, H, TUBE_ON, POOL_ON]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = glow.current, p = pools.current;
    if (!g || !p) return;
    if (lightsOut) {
      // blackout: every tube dies at once (the exit signs stay on)
      for (let i = 0; i < tubes.length; i++) {
        g.setColorAt(i, _c.setRGB(0.02, 0.02, 0.02));
        p.setColorAt(i, _c.setRGB(0, 0, 0));
      }
      g.instanceColor.needsUpdate = true;
      p.instanceColor.needsUpdate = true;
      if (flickLight.current) flickLight.current.intensity = 0;
      lastLevel.current.clear();
      return;
    }
    if (lastLevel.current.size === 0 && bad.length === 0) return;
    for (const i of bad) {
      const tb = tubes[i];
      const lv = tubeLevel(tb.kind, t, tb.seed);
      g.setColorAt(i, _c.copy(TUBE_ON).multiplyScalar(Math.max(0.03, lv)));
      p.setColorAt(i, _c.copy(POOL_ON).multiplyScalar(lv));
      const prev = lastLevel.current.get(i) ?? lv;
      // a strike: the tube catches — buzz from where it hangs (throttled so a
      // stutter is a crackle, not a machine gun)
      if (prev < 0.3 && lv > 0.7 && (tb.kind === 'dying' || tb.kind === 'dead') && t - lastBuzz.current > 0.12) {
        lastBuzz.current = t;
        audio.tubeBuzz([tb.x, H, tb.z], tb.kind === 'dead' ? 0.6 : 1);
      }
      lastLevel.current.set(i, lv);
      if (tb === worst && flickLight.current) flickLight.current.intensity = 9 * lv;
    }
    g.instanceColor.needsUpdate = true;
    p.instanceColor.needsUpdate = true;
  });

  // after a blackout, relight everything in one pass
  useLayoutEffect(() => {
    if (lightsOut || !glow.current) return;
    tubes.forEach((_, i) => {
      glow.current.setColorAt(i, TUBE_ON);
      pools.current.setColorAt(i, POOL_ON);
    });
    glow.current.instanceColor.needsUpdate = true;
    pools.current.instanceColor.needsUpdate = true;
  }, [lightsOut, tubes, TUBE_ON, POOL_ON]);

  const W = B.maxX - B.minX, D = B.maxZ - B.minZ;
  const beams = useMemo(() => {
    const out = [];
    for (let x = B.minX + 6 * M; x < B.maxX - 1; x += 6 * M) out.push(x);
    return out;
  }, [B]);

  return (
    <group>
      {/* the slab */}
      <mesh rotation-x={Math.PI / 2} position={[(B.minX + B.maxX) / 2, H, (B.minZ + B.maxZ) / 2]} material={ceilMat}>
        <planeGeometry args={[W + 2, D + 2]} />
      </mesh>
      {/* downstand beams, north–south */}
      {beams.map((x, i) => (
        <mesh key={i} position={[x, H - 0.15 * M, (B.minZ + B.maxZ) / 2]} material={beamMat} castShadow>
          <boxGeometry args={[0.3 * M, 0.3 * M, D]} />
        </mesh>
      ))}
      <instancedMesh ref={housing} args={[null, null, tubes.length]} material={housingMat} frustumCulled={false}>
        <boxGeometry args={[TUBE_LEN + 0.06 * M, 0.07 * M, TUBE_W]} />
      </instancedMesh>
      <instancedMesh ref={glow} args={[null, null, tubes.length]} material={tubeMat} frustumCulled={false}>
        <boxGeometry args={[TUBE_LEN, 0.05 * M, TUBE_W * 0.7]} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[null, null, tubes.length]} material={poolMat} frustumCulled={false}>
        <planeGeometry args={[TUBE_LEN * 4.2, TUBE_LEN * 3.2]} />
      </instancedMesh>
      {worst && (
        <pointLight ref={flickLight} position={[worst.x, H - 0.35 * M, worst.z]}
          intensity={9} distance={11 * M} decay={1.6} color="#e4fff2" />
      )}
    </group>
  );
}

// ------------------------------------------------------------- pipes
// Straight runs along the ceiling. Decor only: they hang above anything a
// car can reach.
function Pipes({ map }) {
  const H = map.WALL_HEIGHT;
  const mats = useMemo(() => ({
    red: new THREE.MeshStandardMaterial({ color: '#b3342b', roughness: 0.45, metalness: 0.4 }),
    grey: new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.35, metalness: 0.75 }),
    lagged: new THREE.MeshStandardMaterial({ color: '#d8d6cc', roughness: 0.95 }),
    tray: new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.5, metalness: 0.5 }),
    cable: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.7 }),
    cable2: new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.6 }),
    bracket: new THREE.MeshStandardMaterial({ color: '#5c6166', roughness: 0.6, metalness: 0.6 }),
  }), []);
  const runs = map.PIPES || [];
  const trays = map.CABLE_TRAYS || [];
  return (
    <group>
      {runs.map((r, i) => {
        const [x1, z1, x2, z2] = r.from.concat(r.to).map((v) => v * M);
        const len = Math.hypot(x2 - x1, z2 - z1);
        const rad = r.r * M;
        const y = H - r.drop * M;
        const rotY = Math.atan2(x2 - x1, z2 - z1);
        const hangers = Math.max(1, Math.floor(len / (2.5 * M)));
        return (
          <group key={i} position={[(x1 + x2) / 2, y, (z1 + z2) / 2]} rotation-y={rotY}>
            <mesh rotation-x={Math.PI / 2} material={mats[r.mat]} castShadow>
              <cylinderGeometry args={[rad, rad, len, 12]} />
            </mesh>
            {Array.from({ length: hangers }, (_, k) => (
              <mesh key={k} position={[0, (H - y) / 2, -len / 2 + (k + 0.5) * (len / hangers)]} material={mats.bracket}>
                <boxGeometry args={[0.02 * M, H - y, 0.02 * M]} />
              </mesh>
            ))}
          </group>
        );
      })}
      {trays.map((r, i) => {
        const [x1, z1, x2, z2] = r.from.concat(r.to).map((v) => v * M);
        const len = Math.hypot(x2 - x1, z2 - z1);
        const rotY = Math.atan2(x2 - x1, z2 - z1);
        const w = 0.3 * M, y = H - 0.32 * M;
        return (
          <group key={`t${i}`} position={[(x1 + x2) / 2, y, (z1 + z2) / 2]} rotation-y={rotY}>
            <mesh material={mats.tray}><boxGeometry args={[w, 0.01 * M, len]} /></mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * w / 2, 0.04 * M, 0]} material={mats.tray}>
                <boxGeometry args={[0.01 * M, 0.08 * M, len]} />
              </mesh>
            ))}
            {[-0.08, -0.03, 0.03, 0.08].map((dx, k) => (
              <mesh key={k} position={[dx * M, 0.03 * M, 0]} rotation-x={Math.PI / 2} material={k === 2 ? mats.cable2 : mats.cable}>
                <cylinderGeometry args={[0.018 * M, 0.018 * M, len, 6]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------ floor markings
// Painted lines are the cheapest way to make a corridor read as a road at RC
// scale: a dashed centre line, and a yellow box junction where the figure-8
// crosses itself.
function stripeTex(kind) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  if (kind === 'junction') {
    g.strokeStyle = 'rgba(236, 196, 40, 0.92)';
    g.lineWidth = 14;
    g.strokeRect(10, 10, 236, 236);
    g.lineWidth = 8;
    for (let k = -256; k < 512; k += 44) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 256, 256); g.stroke();
      g.beginPath(); g.moveTo(k + 256, 0); g.lineTo(k, 256); g.stroke();
    }
  } else {
    // hazard: black and yellow diagonals
    g.fillStyle = '#e2b623';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1b1b1b';
    for (let k = -256; k < 512; k += 64) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 32, 0); g.lineTo(k + 32 + 256, 256); g.lineTo(k + 256, 256); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function FloorMarkings({ map }) {
  const marks = map.MARKINGS || {};
  const lineMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e9c63a', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2,
  }), []);
  const junctionMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: stripeTex('junction'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }), []);
  const hazardMat = useMemo(() => new THREE.MeshStandardMaterial({ map: stripeTex('hazard'), roughness: 0.7 }), []);
  const dashes = useMemo(() => {
    const out = [];
    for (const l of marks.centreLines || []) {
      const [x1, z, x2] = l;
      for (let x = x1; x < x2; x += 1.1) {
        if ((marks.gaps || []).some(([a, b]) => x + 0.55 > a && x < b)) continue;
        out.push([x + 0.275, z]);
      }
    }
    return out;
  }, [marks]);
  const inst = useRef();
  useLayoutEffect(() => {
    if (!inst.current) return;
    dashes.forEach(([x, z], i) => {
      _o.position.set(x * M, 0.015, z * M);
      _o.rotation.set(-Math.PI / 2, 0, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      inst.current.setMatrixAt(i, _o.matrix);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  }, [dashes]);
  return (
    <group>
      {dashes.length > 0 && (
        <instancedMesh ref={inst} args={[null, null, dashes.length]} material={lineMat} receiveShadow frustumCulled={false}>
          <planeGeometry args={[0.55 * M, 0.06 * M]} />
        </instancedMesh>
      )}
      {(marks.junctions || []).map(([x, z, w, d], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x * M, 0.018, z * M]} material={junctionMat}>
          <planeGeometry args={[w * M, d * M]} />
        </mesh>
      ))}
      {(marks.hazard || []).map(([x, y, z, w, d, rotX], i) => (
        <mesh key={`h${i}`} rotation-x={rotX} position={[x * M, y * M, z * M]} material={hazardMat}>
          <planeGeometry args={[w * M, d * M]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------- signs
function signTex(text, fg, bg, sub = '') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
  g.fillStyle = fg;
  g.font = `bold ${sub ? 64 : 78}px "Arial Narrow", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, sub ? 62 : 82);
  if (sub) { g.font = 'bold 30px Arial, sans-serif'; g.fillText(sub, 256, 124); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Signs({ map }) {
  const signs = map.SIGNS || [];
  const mats = useMemo(() => signs.map((s) => (s.exit
    ? new THREE.MeshBasicMaterial({ map: signTex(s.text, '#ffffff', '#12a150', s.sub), toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: signTex(s.text, s.fg || '#1c1c1c', s.bg || '#e9e4d4', s.sub), roughness: 0.8 }))),
  [signs]);
  return (
    <group>
      {signs.map((s, i) => (
        <mesh key={i} position={[s.at[0] * M, s.at[1] * M, s.at[2] * M]} rotation-y={s.rotY || 0} material={mats[i]}>
          <planeGeometry args={[s.w * M, s.w * M * (160 / 512)]} />
        </mesh>
      ))}
    </group>
  );
}

// -------------------------------------------------------- furniture
// The cellar's own pieces. Office.jsx hands these types over; colliders
// follow the same rules as upstairs (static, one body per piece).
const CONCRETE = () => new THREE.MeshStandardMaterial({ color: '#8a8b86', roughness: 0.95 });
const pieceMats = {};
function pm(key, make) {
  if (!pieceMats[key]) pieceMats[key] = make();
  return pieceMats[key];
}

export function CellarPiece({ f, mats }) {
  const { type, x, z, w, d, h, rotY } = f;
  switch (type) {
    case 'boiler':
    case 'heater': {
      const r = Math.min(w, d) / 2;
      const body = type === 'boiler'
        ? pm('boiler', () => new THREE.MeshStandardMaterial({ color: '#7c2f28', roughness: 0.5, metalness: 0.45 }))
        : pm('heater', () => new THREE.MeshStandardMaterial({ color: '#e9e7e0', roughness: 0.35, metalness: 0.1 }));
      const band = pm('band', () => new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.4, metalness: 0.8 }));
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} friction={0.4}>
          <CylinderCollider args={[h / 2, r]} position={[0, h / 2, 0]} />
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={body}>
            <cylinderGeometry args={[r, r, h, 28]} />
          </mesh>
          {[0.15, 0.5, 0.85].map((k) => (
            <mesh key={k} position={[0, h * k, 0]} material={band}>
              <cylinderGeometry args={[r * 1.02, r * 1.02, 0.05 * M, 28]} />
            </mesh>
          ))}
          {/* domed top */}
          <mesh position={[0, h, 0]} scale={[1, 0.35, 1]} castShadow material={body}>
            <sphereGeometry args={[r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          {type === 'boiler' && (
            <group position={[0, h * 0.62, r * 1.01]}>
              {/* pressure gauge: a white face with a red needle, at car-eye… well, above it */}
              <mesh rotation-x={Math.PI / 2} material={band}>
                <cylinderGeometry args={[0.14 * M, 0.14 * M, 0.06 * M, 20]} />
              </mesh>
              <mesh position={[0, 0, 0.032 * M]}>
                <circleGeometry args={[0.12 * M, 20]} />
                <meshStandardMaterial color="#f4f2ea" roughness={0.4} />
              </mesh>
              <mesh position={[0.03 * M, 0.02 * M, 0.036 * M]} rotation-z={-0.8}>
                <planeGeometry args={[0.012 * M, 0.1 * M]} />
                <meshBasicMaterial color="#d22" />
              </mesh>
            </group>
          )}
        </RigidBody>
      );
    }
    case 'dock': {
      const conc = pm('dock', CONCRETE);
      const rubber = pm('rubber', () => new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.9 }));
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
          <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={conc} geometry={roundedBox(w, h, d, 0.05)} />
          {/* rubber dock bumpers on the drive face */}
          {[-0.3, 0.3].map((k) => (
            <mesh key={k} position={[w / 2 + 0.05 * M, h * 0.5, k * d]} material={rubber}>
              <boxGeometry args={[0.1 * M, h * 0.6, 0.35 * M]} />
            </mesh>
          ))}
        </RigidBody>
      );
    }
    case 'pallet': {
      const wood = pm('pallet', () => new THREE.MeshStandardMaterial({ color: '#b89464', roughness: 0.85 }));
      const layers = Math.max(1, Math.round(h / (0.15 * M)));
      const lh = h / layers;
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
          <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
          {Array.from({ length: layers }, (_, L) => (
            <group key={L} position={[0, L * lh, 0]}>
              {/* stringers */}
              {[-0.42, 0, 0.42].map((k) => (
                <mesh key={k} position={[0, lh * 0.45, k * d]} castShadow receiveShadow material={wood}>
                  <boxGeometry args={[w, lh * 0.7, 0.09 * M]} />
                </mesh>
              ))}
              {/* top boards */}
              {[-0.42, -0.21, 0, 0.21, 0.42].map((k) => (
                <mesh key={`b${k}`} position={[k * w, lh * 0.9, 0]} castShadow receiveShadow material={wood}>
                  <boxGeometry args={[w * 0.15, lh * 0.2, d]} />
                </mesh>
              ))}
            </group>
          ))}
        </RigidBody>
      );
    }
    case 'cage': {
      const frame = pm('cageFrame', () => new THREE.MeshStandardMaterial({ color: '#6e7479', roughness: 0.5, metalness: 0.7 }));
      const mesh = pm('cageMesh', () => {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        g.strokeStyle = '#9aa1a8'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(10, 10);
        return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
      });
      const post = 0.04 * M;
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.5}>
          <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * w / 2, h / 2, sz * d / 2]} castShadow material={frame}>
              <boxGeometry args={[post, h, post]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`x${s}`} position={[0, h / 2, s * d / 2]} material={mesh}>
              <planeGeometry args={[w, h]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`z${s}`} position={[s * w / 2, h / 2, 0]} rotation-y={Math.PI / 2} material={mesh}>
              <planeGeometry args={[d, h]} />
            </mesh>
          ))}
          <mesh position={[0, h, 0]} rotation-x={Math.PI / 2} material={mesh}>
            <planeGeometry args={[w, d]} />
          </mesh>
        </RigidBody>
      );
    }
    case 'workbench': {
      const top = 0.06 * M;
      const legIn = 0.2;
      const laminate = pm('bench', () => new THREE.MeshStandardMaterial({ color: '#c8ccc4', roughness: 0.6 }));
      const esd = pm('esd', () => new THREE.MeshStandardMaterial({ color: '#3f6e8c', roughness: 0.8 }));
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={1}>
          {/* drive under it, like a desk */}
          <CuboidCollider args={[w / 2, top / 2, d / 2]} position={[0, h - top / 2, 0]} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <CuboidCollider key={i} args={[0.1, h / 2, 0.1]} position={[sx * (w / 2 - legIn), h / 2, sz * (d / 2 - legIn)]} />
          ))}
          <RoundedBox position={[0, h - top / 2, 0]} args={[w, top, d]} radius={0.05} smoothness={2}
            castShadow receiveShadow material={laminate} />
          {/* the blue anti-static mat everyone forgets to use */}
          <mesh position={[w * 0.1, h + 0.003 * M, 0]} rotation-x={-Math.PI / 2} material={esd}>
            <planeGeometry args={[w * 0.55, d * 0.7]} />
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (w / 2 - legIn), (h - top) / 2, sz * (d / 2 - legIn)]} castShadow material={mats.metal}>
              <boxGeometry args={[0.12, h - top, 0.12]} />
            </mesh>
          ))}
        </RigidBody>
      );
    }
    case 'cabinet': {
      const steel = pm('cabinet', () => new THREE.MeshStandardMaterial({ color: '#9ca3a0', roughness: 0.45, metalness: 0.55 }));
      const long = w >= d;
      const drawers = Math.max(2, Math.round(h / (0.35 * M)));
      return (
        <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation-y={rotY} friction={0.6}>
          <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={steel} geometry={roundedBox(w, h, d, 0.04)} />
          {/* drawer handles on the long face that looks into the room */}
          {Array.from({ length: drawers }, (_, k) => (
            <mesh key={k} position={long ? [0, (k + 0.6) * (h / drawers), -d / 2 - 0.01] : [-w / 2 - 0.01, (k + 0.6) * (h / drawers), 0]} material={mats.dark}>
              <boxGeometry args={long ? [w * 0.5, 0.03 * M, 0.02 * M] : [0.02 * M, 0.03 * M, d * 0.5]} />
            </mesh>
          ))}
        </RigidBody>
      );
    }
    default:
      return null;
  }
}

// what themes/index.js registers: furniture type → component, prop type → component
export const PIECES = Object.fromEntries(['boiler', 'heater', 'dock', 'pallet', 'cage', 'workbench', 'cabinet'].map((t) => [t, CellarPiece]));
export const PROPS = {};
