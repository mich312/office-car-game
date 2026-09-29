// Garage Zero's dressing: what makes a suburban double garage that grew into
// the house next door read as that from 18 cm up.
//
// The walls are the theme's own (WALL_STYLES): house walls with a finish on
// each face — taped drywall in the garage, cream paint in the house, a
// dark accent wall behind the dev pit's whiteboards, lap siding outside —
// with real window openings, so the sun comes in through them. Door
// openings get headers and casings, and the doors themselves stand open
// against the wall. The yards are fenced in white pickets.
//
// Inside the garage you see up into the trusses: a plywood loft with the
// canoe and the Christmas boxes, LED battens on chains (one slow to come
// on), the roller door rolled up into its tracks with the opener's rail and
// the tennis ball on a string. Edison string lights cross the dev pit and
// the backyard; the whiteboards, kanban and burndown are canvases; a pink
// SHIP IT neon hangs over the garage goal. Outside (garageWorld.jsx): the
// sky, the street, the neighbours, the house's own roofs.
//
// Things that move: the 3D printer, the box fan, the router LEDs, the
// washer, the sprinkler (garagePieces.jsx); here, the neon's stutter, the
// batten warming up, the motion-sensor floodlight, birds by day, crickets
// at night.
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M } from '@rc/shared';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import { useMap } from '../activeMap.js';
import { lightingFor } from '../daylight.js';
import { glowTex } from '../textures.js';
import { kit, cached, slotMat, FINISH_TEX, BOARD_TEX, neonTex, chalkTex, rng } from './garageKit.js';
import { KitMeshes, PIECES, FurnitureBatch } from './garagePieces.jsx';
import { PROPS, tickScreens } from './garageProps.jsx';
import { World, addNeighbourhood, addRoofs, addTurf } from './garageWorld.jsx';

// ------------------------------------------------------------ wall finishes
// One material per finish; UVs are world metres, so the drywall joints and
// the siding boards run on unbroken from segment to segment.
const FINISH = {
  house: { color: '#efe8dc', tex: 'house' },
  kitchen: { color: '#e9dcc0', tex: 'house' },
  founder: { color: '#cfd9e2', tex: 'house' },
  accent: { color: '#2e4c55', tex: 'house' },
  drywall: { color: '#e7e2d6', tex: 'drywall' },
  siding: { color: '#b3c3ca', tex: 'siding' },
  trim: { color: '#f3f0e9', tex: null },
};
const finishMats = {};
function finishMat(k) {
  if (!finishMats[k]) {
    const F = FINISH[k];
    finishMats[k] = new THREE.MeshStandardMaterial({
      color: F.color, map: F.tex ? FINISH_TEX[F.tex]() : null, roughness: k === 'trim' ? 0.55 : 0.93,
    });
  }
  return finishMats[k];
}

// A face collector: quads in world metres, UVs in metres along the wall.
function faces() {
  const B = {};
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
  return {
    // four corners (CCW or not — fixed up against the wanted normal), uv per corner
    quad(fin, p, uv, normal) {
      const b = (B[fin] ||= { pos: [], uv: [] });
      _a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
      _b.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
      _n.crossVectors(_a, _b);
      const flip = _n.dot(new THREE.Vector3(...normal)) < 0;
      const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const i of order) { b.pos.push(...p[i]); b.uv.push(...uv[i]); }
    },
    build() {
      const out = {};
      for (const [fin, b] of Object.entries(B)) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos.map((v) => v * M), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        out[fin] = g;
      }
      return out;
    },
  };
}

// A wall-shaped box in the collector: [a0,a1] along the wall, [y0,y1] up,
// the wall's centre line c on the other axis, half-thickness ht. Its two big
// faces take the wall's finishes, the rest (reveals, soffits) the trim.
function wallBox(F, along, c, ht, a0, a1, y0, y1, neg, pos) {
  const P = along === 'x' ? (a, y, s) => [a, y, c + s * ht] : (a, y, s) => [c + s * ht, y, a];
  const N = along === 'x' ? (s) => [0, 0, s] : (s) => [s, 0, 0];
  const A = along === 'x' ? (s) => [s, 0, 0] : (s) => [0, 0, s];
  for (const [s, fin] of [[-1, neg], [1, pos]]) {
    F.quad(fin, [P(a0, y0, s), P(a1, y0, s), P(a1, y1, s), P(a0, y1, s)], [[a0, y0], [a1, y0], [a1, y1], [a0, y1]], N(s));
  }
  // reveals at both ends (door jambs, window sides)
  for (const [a, s] of [[a0, -1], [a1, 1]]) {
    F.quad('trim', [P(a, y0, -1), P(a, y0, 1), P(a, y1, 1), P(a, y1, -1)], [[0, y0], [0.2, y0], [0.2, y1], [0, y1]], A(s));
  }
  // top (a sill, or the wall head) and underside (a lintel soffit)
  F.quad('trim', [P(a0, y1, -1), P(a1, y1, -1), P(a1, y1, 1), P(a0, y1, 1)], [[a0, 0], [a1, 0], [a1, 0.2], [a0, 0.2]], [0, 1, 0]);
  if (y0 > 0.001) F.quad('trim', [P(a0, y0, -1), P(a1, y0, -1), P(a1, y0, 1), P(a0, y0, 1)], [[a0, 0], [a1, 0], [a1, 0.2], [a0, 0.2]], [0, -1, 0]);
}

const SKIRT = { drywall: ['wood', '#caa874', 0.14], siding: ['matte', '#9d988d', 0.24] };
const SKIRT_DEFAULT = ['satin', '#f1ede4', 0.12];

function buildHouseWalls(walls, doors, H) {
  const F = faces();
  const k = kit();
  const lines = walls.map((w) => {
    const along = w.w >= w.d ? 'x' : 'z';
    const a = (along === 'x' ? w.x : w.z) / M, len = (along === 'x' ? w.w : w.d) / M;
    return { w, along, c: (along === 'x' ? w.z : w.x) / M, ht: (along === 'x' ? w.d : w.w) / M / 2, a0: a - len / 2, a1: a + len / 2 };
  });
  const P = (L, a, y, s) => (L.along === 'x' ? [a, y, L.c + s * L.ht] : [L.c + s * L.ht, y, a]);
  for (const L of lines) {
    const { w } = L;
    const wh = w.h / M;
    // split the segment round its windows
    const wins = [...(w.win || [])].sort((p, q) => p[0] - q[0]);
    let cur = L.a0;
    for (const [w0, w1, sill, head] of wins) {
      if (w0 > cur) wallBox(F, L.along, L.c, L.ht, cur, w0, 0, wh, w.neg, w.pos);
      if (sill > 0.001) wallBox(F, L.along, L.c, L.ht, w0, w1, 0, sill, w.neg, w.pos);
      wallBox(F, L.along, L.c, L.ht, w0, w1, head, wh, w.neg, w.pos);
      cur = w1;
      windowParts(k, L, P, w0, w1, sill, head, w.neg === 'siding' ? -1 : w.pos === 'siding' ? 1 : 0);
    }
    if (L.a1 > cur) wallBox(F, L.along, L.c, L.ht, cur, L.a1, 0, wh, w.neg, w.pos);
    // skirting along both faces (under the windows too, unless a pane goes to the floor)
    for (const [s, fin] of [[-1, w.neg], [1, w.pos]]) {
      const [slot, col, sh] = SKIRT[fin] || SKIRT_DEFAULT;
      const spans = [];
      let a = L.a0;
      for (const [w0, w1, sill] of wins) { if (sill < 0.2) { spans.push([a, w0]); a = w1; } }
      spans.push([a, L.a1]);
      for (const [p0, p1] of spans) {
        if (p1 - p0 < 0.02) continue;
        const mid = P(L, (p0 + p1) / 2, sh / 2, s);
        const out = s * 0.012;
        k.box(slot, L.along === 'x' ? [p1 - p0, sh, 0.024] : [0.024, sh, p1 - p0], L.along === 'x' ? [mid[0], mid[1], mid[2] + out] : [mid[0] + out, mid[1], mid[2]], col);
      }
    }
  }
  // headers over the door openings, casings round them, and the doors
  for (const d of doors) {
    const along = d.along;
    const a = along === 'x' ? d.x : d.z, c = along === 'x' ? d.z : d.x;
    const a0 = a - d.w / 2, a1 = a + d.w / 2;
    const L = { along, c, ht: 0.1 };
    wallBox(F, along, c, 0.1, a0, a1, d.head, H, d.neg, d.pos);
    doorParts(k, L, P, lines, d, a0, a1);
  }
  return { faces: F.build(), parts: k.build() };
}

const TRIM = '#f3f0e9';

// A window in a wall: a frame through the wall's depth, a mullion and a
// transom on the big ones, the pane; outside (on the siding face, `ext` is
// its side) casing boards round it, inside a deep sill to put things on.
function windowParts(k, L, P, w0, w1, sill, head, ext) {
  const fw = 0.05, depth = L.ht * 2 + 0.012;
  // a box along the wall, centred at (a, y), `off` metres off the centre line
  const bx = (len, h, dep, a, y, off = 0, col = TRIM, slot = 'satin') => {
    const p = P(L, a, y, 0);
    if (L.along === 'x') p[2] += off; else p[0] += off;
    k.box(slot, L.along === 'x' ? [len, h, dep] : [dep, h, len], p, col);
  };
  const mid = (w0 + w1) / 2, ym = (sill + head) / 2, hh = head - sill;
  bx(w1 - w0, fw, depth, mid, head - fw / 2);
  if (sill > 0.02) bx(w1 - w0, fw, depth, mid, sill + fw / 2);
  bx(fw, hh, depth, w0 + fw / 2, ym);
  bx(fw, hh, depth, w1 - fw / 2, ym);
  if (w1 - w0 > 1.3) bx(0.04, hh, depth, mid, ym);
  if (hh > 1.6) bx(w1 - w0, 0.04, depth, mid, sill + hh * 0.72);
  bx(w1 - w0 - 0.04, hh - 0.04, 0.01, mid, ym, 0, '#b9d3e0', 'glass');
  if (!ext) return;
  const out = ext * (L.ht + 0.008);
  bx(w1 - w0 + 0.18, 0.09, 0.016, mid, head + 0.045, out);
  if (sill > 0.02) bx(w1 - w0 + 0.24, 0.05, 0.016, mid, sill - 0.025, out);
  bx(0.09, hh, 0.016, w0 - 0.045, ym, out);
  bx(0.09, hh, 0.016, w1 + 0.045, ym, out);
  if (sill > 0.3) bx(w1 - w0 + 0.1, 0.03, 0.07, mid, sill - 0.015, -ext * (L.ht + 0.035));
}

// is there wall on this line covering [p0, p1]? (for where an open door can lie)
function wallCovers(lines, along, c, p0, p1) {
  return lines.some((L) => L.along === along && Math.abs(L.c - c) < 0.05 && L.a0 <= p0 + 0.01 && L.a1 >= p1 - 0.01);
}

function doorParts(k, L, P, lines, d, a0, a1) {
  const col = d.kind === 'slider' ? '#3b352f' : TRIM;
  const box = (len, h, dep, a, y, s, off, c = col, slot = 'satin') => {
    const p = P(L, a, y, s);
    const o = s * off;
    const pos = L.along === 'x' ? [p[0], p[1], p[2] + o] : [p[0] + o, p[1], p[2]];
    k.box(slot, L.along === 'x' ? [len, h, dep] : [dep, h, len], pos, c);
  };
  const head = d.head;
  if (d.kind === 'roller') {
    // outside: a trim surround; the door itself is drawn by RollerDoor
    for (const s of [-1]) {
      box(d.w + 0.2, 0.1, 0.03, (a0 + a1) / 2, head + 0.05, s, 0.1, '#f3f0e9');
      box(0.1, head, 0.03, a0 - 0.05, head / 2, s, 0.1, '#f3f0e9');
      box(0.1, head, 0.03, a1 + 0.05, head / 2, s, 0.1, '#f3f0e9');
    }
    return;
  }
  // casings on both faces (raw pine on the garage's drywall side)
  for (const [s, fin] of [[-1, d.neg], [1, d.pos]]) {
    const c = d.kind === 'slider' ? col : fin === 'drywall' ? '#caa874' : '#f3f0e9';
    const slot = fin === 'drywall' && d.kind !== 'slider' ? 'wood' : 'satin';
    box(d.w + 0.14, 0.07, 0.02, (a0 + a1) / 2, head + 0.035, s, 0.1, c, slot);
    box(0.07, head, 0.02, a0 - 0.035, head / 2, s, 0.1, c, slot);
    box(0.07, head, 0.02, a1 + 0.035, head / 2, s, 0.1, c, slot);
  }
  if (d.kind === 'slider') {
    // the sliding panel, pushed open behind the fixed pane on the outside
    box(0.05, 0.02, 0.24, (a0 + a1) / 2, 0.01, 1, 0, '#3b352f', 'metal');
    const pa0 = a1 + 0.05, pa1 = a1 + 0.05 + d.w * 0.62;
    const mid = (pa0 + pa1) / 2;
    box(pa1 - pa0, 0.06, 0.05, mid, 0.03, -1, 0.14, col, 'metal');
    box(pa1 - pa0, 0.06, 0.05, mid, head - 0.05, -1, 0.14, col, 'metal');
    box(0.06, head, 0.05, pa0 + 0.03, head / 2, -1, 0.14, col, 'metal');
    box(0.06, head, 0.05, pa1 - 0.03, head / 2, -1, 0.14, col, 'metal');
    box(pa1 - pa0 - 0.1, head - 0.1, 0.01, mid, head / 2, -1, 0.14, '#b9d3e0', 'glass');
    return;
  }
  if (d.kind === 'door' || d.kind === 'front') {
    const leafCol = d.kind === 'front' ? '#9e2f28' : '#f4f2ec';
    const lw = d.w / 2 - 0.02, lh = head - 0.06;
    const s = d.swing || 1;
    for (const [hinge, dir] of [[a0, -1], [a1, 1]]) {
      const p0 = Math.min(hinge, hinge + dir * lw), p1 = Math.max(hinge, hinge + dir * lw);
      if (!wallCovers(lines, L.along, L.c, p0, p1)) continue;
      const am = (p0 + p1) / 2;
      box(lw, lh, 0.04, am, lh / 2 + 0.01, s, 0.14, leafCol, 'satin');
      // two raised panels on the room side, a brass knob
      for (const y of [lh * 0.3, lh * 0.72]) box(lw * 0.7, lh * 0.32, 0.012, am, y, s, 0.165, leafCol, 'satin');
      k.sphere('metal', 0.03, (() => { const p = P(L, hinge + dir * (lw - 0.07), 1.0, s); const o = s * 0.2; return L.along === 'x' ? [p[0], p[1], p[2] + o] : [p[0] + o, p[1], p[2]]; })(), '#c9a24a', null, 10);
    }
  }
}

function HouseWalls({ walls }) {
  const map = useMap();
  const H = map.WALL_HEIGHT / M;
  const built = useMemo(() => buildHouseWalls(walls, map.DOORS || [], H), [walls, map, H]);
  return (
    <group>
      {Object.entries(built.faces).map(([fin, g]) => (
        <mesh key={fin} geometry={g} material={finishMat(fin)} castShadow receiveShadow />
      ))}
      <KitMeshes geos={built.parts} />
    </group>
  );
}

// ------------------------------------------------------------ picket fence
// White pickets every 14 cm (one instanced mesh for the whole yard), posts
// every 2.4 m and two rails on the inside.
function picketGeo() {
  // a 7.5 × 2 cm board with a pointed top
  const w = 0.075, h = 0.94, t = 0.02;
  const board = new THREE.BoxGeometry(w, h, t).translate(0, h / 2, 0);
  const tip = new THREE.ConeGeometry(w / Math.SQRT2, 0.06, 4, 1).rotateY(Math.PI / 4).scale(1, 1, t / w).translate(0, h + 0.03, 0);
  const g = mergeGeometries([board.toNonIndexed(), tip.toNonIndexed()]);
  g.computeVertexNormals();
  g.scale(M, M, M);
  return g;
}
const _o = new THREE.Object3D();
function PicketFence({ walls }) {
  const { pickets, geos } = useMemo(() => {
    const out = [];
    const k = kit();
    for (const w of walls) {
      const along = w.w >= w.d ? 'x' : 'z';
      const a = (along === 'x' ? w.x : w.z) / M, len = (along === 'x' ? w.w : w.d) / M;
      const c = (along === 'x' ? w.z : w.x) / M;
      const inward = -Math.sign(c) || 1;
      const P = (aa, y, off) => (along === 'x' ? [aa, y, c + off] : [c + off, y, aa]);
      const n = Math.round(len / 0.14);
      for (let i = 0; i < n; i++) {
        const aa = a - len / 2 + (i + 0.5) * (len / n);
        const p = P(aa, 0, -inward * 0.02);
        // pickets settle a little unevenly
        out.push({ p, rotY: along === 'x' ? 0 : Math.PI / 2, s: 0.97 + ((i * 7919) % 13) / 13 * 0.06 });
      }
      const posts = Math.max(1, Math.ceil(len / 2.4));
      for (let i = 0; i <= posts; i++) {
        const aa = a - len / 2 + (i / posts) * len;
        k.box('satin', [0.09, 1.12, 0.09], P(aa, 0.56, inward * 0.04), '#eeebe2');
        k.box('satin', [0.12, 0.03, 0.12], P(aa, 1.13, inward * 0.04), '#eeebe2');
      }
      for (const y of [0.22, 0.78]) k.box('satin', along === 'x' ? [len, 0.08, 0.035] : [0.035, 0.08, len], P(a, y, inward * 0.03), '#e6e2d8');
    }
    return { pickets: out, geos: k.build() };
  }, [walls]);
  const ref = useRef();
  const geo = useMemo(picketGeo, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 }), []);
  useLayoutEffect(() => {
    pickets.forEach(({ p, rotY, s }, i) => {
      _o.position.set(p[0] * M, 0, p[2] * M);
      _o.rotation.set(0, rotY, 0);
      _o.scale.set(1, s, 1);
      _o.updateMatrix();
      ref.current.setMatrixAt(i, _o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [pickets]);
  return (
    <group>
      <instancedMesh ref={ref} args={[geo, mat, pickets.length]} castShadow receiveShadow frustumCulled={false} />
      <KitMeshes geos={geos} />
    </group>
  );
}

// ------------------------------------------------------------- ramp skins
// Drawn in the ramp's frame: rising toward +z, foot at z = −l/2, top at +l/2.
function PlankRamp({ r, len, angle }) {
  const l = r.l / M, w = r.w / M, rise = r.rise / M;
  const geos = cached(`plank${l.toFixed(2)}|${w.toFixed(2)}|${rise.toFixed(2)}`, () => {
    const k = kit();
    const a = Math.atan2(rise, l), L = Math.hypot(l, rise);
    // a sheet of ply, its layered edge showing, and a 2×4 cleat at the foot
    k.box('wood', [w, 0.02, L], [0, rise / 2 + 0.005, 0], '#dcc091', [-a, 0, 0]);
    for (const sx of [-1, 1]) k.box('matte', [0.004, 0.02, L], [sx * (w / 2 + 0.002), rise / 2 + 0.005, 0], '#b89a68', [-a, 0, 0]);
    k.box('wood', [w, 0.04, 0.09], [0, 0.02, -l / 2 + 0.05], '#caa874');
    // propped up on paint tins — as many as it takes to reach half way
    const n = Math.max(1, Math.round((rise * 0.5) / 0.19));
    const z = -l / 2 + l * ((n * 0.19) / rise) - 0.06;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const y = 0.095 + i * 0.19;
        k.cyl('metal', 0.085, 0.085, 0.188, [sx * w * 0.28, y, z], '#c2c7cc', null, 14);
        k.cyl('matte', 0.086, 0.086, 0.08, [sx * w * 0.28, y - 0.01, z], ['#e6c34a', '#3e7d57', '#b5473a', '#f2f2f2'][(i + (sx > 0 ? 1 : 0)) % 4], null, 14);
      }
    }
    return k.build();
  });
  void len; void angle;
  return <KitMeshes geos={geos} />;
}

function wedge(l, w, rise) {
  const s = new THREE.Shape();
  s.moveTo(-l / 2, 0); s.lineTo(l / 2, 0); s.lineTo(l / 2, rise); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(-Math.PI / 2); // the shape's x runs along the ramp (+z), extrusion across it
  return g;
}

function SkateRamp({ r }) {
  const l = r.l / M, w = r.w / M, rise = r.rise / M;
  const geos = cached(`skate${l.toFixed(2)}|${w.toFixed(2)}|${rise.toFixed(2)}`, () => {
    const k = kit();
    const a = Math.atan2(rise, l), L = Math.hypot(l, rise);
    k.add('satin', wedge(l, w - 0.04, rise - 0.015), '#3a3d42');
    k.box('wood', [w, 0.018, L], [0, rise / 2, 0], '#cfae7a', [-a, 0, 0]);
    // the steel kicker plate at the foot, and scuffs
    k.box('metal', [w, 0.006, 0.22], [0, 0.012 + 0.11 * Math.sin(a), -l / 2 + 0.11], '#9aa0a6', [-a, 0, 0]);
    const rr = rng(Math.round(l * 100 + w));
    for (let i = 0; i < 6; i++) {
      const t = rr();
      k.box('matte', [0.1 + rr() * 0.3, 0.001, 0.015], [(rr() - 0.5) * w * 0.7, rise * t + 0.012, -l / 2 + l * t], '#2a2622', [-a, (rr() - 0.5) * 0.5, 0]);
    }
    k.box('matte', [0.002, rise * 0.4, l * 0.3], [w / 2 - 0.018, rise * 0.25, 0.1], '#ff3d8b');
    return k.build();
  });
  return <KitMeshes geos={geos} />;
}

function PillowRamp({ r }) {
  const l = r.l / M, w = r.w / M, rise = r.rise / M;
  const geos = cached(`pillow${l.toFixed(2)}|${w.toFixed(2)}|${rise.toFixed(2)}`, () => {
    const k = kit();
    const s = new THREE.Shape();
    s.moveTo(-l / 2, 0); s.lineTo(l / 2, 0); s.lineTo(l / 2, rise); s.lineTo(l / 2 - 0.06, rise + 0.02); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w - 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.04, bevelSegments: 3 });
    g.translate(0, 0, -(w - 0.08) / 2);
    g.rotateY(-Math.PI / 2);
    k.add('fabric', g, '#e9e2d4');
    return k.build();
  });
  return <KitMeshes geos={geos} />;
}

// --------------------------------------------------------------- the robot
// The cleaning-robot event here is the house's robot vacuum.
function RobotVacuum() {
  const geos = cached('robovac', () => {
    const k = kit();
    const R = 0.34;
    k.cyl('satin', R, R, 0.08, [0, 0.055, 0], '#f2f2f0', null, 32);
    k.cyl('satin', R * 0.98, R * 0.98, 0.012, [0, 0.1, 0], '#26282c', null, 32);
    k.torus('matte', R + 0.005, 0.02, [0, 0.05, 0], '#3a3d42', [Math.PI / 2, 0, 0], 32, Math.PI);
    k.cyl('satin', 0.06, 0.06, 0.02, [0, 0.11, R * 0.45], '#1f2226', null, 16);
    k.box('glow', [0.05, 0.004, 0.012], [0, 0.113, R * 0.7], '#5fdcff');
    return k.build();
  });
  const brush = useRef();
  useFrame((_, dt) => { if (brush.current) brush.current.rotation.y += dt * 20; });
  return (
    <group>
      <KitMeshes geos={geos} />
      <group ref={brush} position={[0.24 * M, 0.02 * M, 0.2 * M]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation-y={(i / 3) * Math.PI * 2} position={[0, 0, 0]}>
            <boxGeometry args={[0.16 * M, 0.006 * M, 0.01 * M]} />
            <meshStandardMaterial color="#3a3d42" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- dressing
export function Dressing({ map }) {
  // Everything static the dressing adds is merged into two kits — one that
  // casts shadows, one flat on the ground that doesn't — so the neighbourhood,
  // the roofs, the trusses' company, the ceilings and the chalk cost a draw
  // per material, not per thing.
  const statics = useMemo(() => {
    const H = map.WALL_HEIGHT / M;
    const lit = kit(), flat = kit();
    addNeighbourhood(lit);
    addRoofs(lit, H);
    addGarageBits(lit, H);
    addRollerDoor(lit, H);
    addCeilings(lit, map, H);
    addBoardFrames(lit, map.BOARDS_ON_WALLS || []);
    addStringWires(flat, map.STRINGS || []);
    addTurf(flat, map);
    addGround(flat);
    return { lit: lit.build(), flat: flat.build() };
  }, [map]);
  return (
    <group>
      <KitMeshes geos={statics.lit} />
      <KitMeshes geos={statics.flat} shadow={false} />
      <World map={map} />
      <FurnitureBatch map={map} />
      <GarageInterior map={map} />
      <StringLights map={map} />
      <WallBoards map={map} />
      <Neon map={map} />
      <Chalk map={map} />
      <Practicals map={map} />
      <FloorPools map={map} />
      <Soundscape map={map} />
    </group>
  );
}

// ---- the practical level: bulbs dim by day, blaze at night
function Practicals({ map }) {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const target = lightingFor(hour, lightsOut, map).practical;
  const warm = slotMat('warm');
  const tick = useRef(0);
  useFrame((_, dt) => {
    tick.current += dt;
    if (tick.current > 0.3) { tick.current = 0; tickScreens(); }
    // on but modest by day; 1.6× over-bright at night so bloom catches them
    const want = lightsOut ? 0.05 : 0.55 + target * 1.1;
    const c = warm.color.r;
    warm.color.setScalar(c + (want - c) * Math.min(1, dt * 2));
  });
  return null;
}

// ---- light on the floor: additive pools under the practicals, strongest
// at night (the string lights, lamps, the TV, the monitors' spill)
const POOLS = [
  // [x, z, size m, colour]
  [-1, 0.5, 9, '#ffb46b'], [-12, 8.6, 8, '#ffb46b'], [-14, -3.2, 7, '#ffb46b'],
  [-5.2, 10.9, 3.2, '#ffc27a'], [9.0, 7.2, 3.6, '#7fa6ff'], [-2.5, -2.6, 7, '#8ec8ff'],
  [17.5, 10.8, 2.4, '#ff7a3a'], [15.2, 0.4, 3.6, '#ffd9a0'], [12.6, 10.8, 2.6, '#8ec8ff'],
];
function FloorPools({ map }) {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const level = lightingFor(hour, lightsOut, map).practical;
  const tex = useMemo(() => glowTex(), []);
  const mats = useMemo(() => {
    const by = {};
    for (const [, , , c] of POOLS) {
      by[c] ||= new THREE.MeshBasicMaterial({
        map: tex, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      });
    }
    return by;
  }, [tex]);
  useFrame((_, dt) => {
    const want = Math.max(0, level - 0.3) * 0.32;
    for (const m of Object.values(mats)) m.opacity += (want - m.opacity) * Math.min(1, dt * 2);
  });
  return POOLS.map(([x, z, sz, c], i) => (
    <mesh key={i} rotation-x={-Math.PI / 2} position={[x * M, 0.035, z * M]} material={mats[c]}>
      <planeGeometry args={[sz * M, sz * M]} />
    </mesh>
  ));
}

// ---- house ceilings: flat drywall over every indoor room but the garage,
// a flush light fitting at each ceiling light
function addCeilings(k, map, H) {
  for (const r of map.ROOMS) {
    if (r.outdoor || r.id === 'garage_bay') continue;
    k.box('matte', [r.w / M + 0.2, 0.02, r.d / M + 0.2], [r.x / M, H + 0.01, r.z / M], '#f4f2ee');
  }
  for (const [x, z] of map.CEILING_LIGHTS) {
    const room = map.roomAt(x * M, z * M);
    if (!room || room.id === 'garage_bay') continue;
    k.cyl('satin', 0.2, 0.2, 0.02, [x, H - 0.01, z], '#f4f2ee', null, 20);
    k.sphere('warm', 0.17, [x, H - 0.02, z], '#fff1d8', [1, 0.35, 1], 16);
  }
  // three pendants over the kitchen island
  for (const x of [14.4, 15.2, 16.0]) {
    k.bar('matte', [x, H, 0.4], [x, 2.1, 0.4], 0.004, '#1a1a1a');
    k.cyl('metal', 0.03, 0.14, 0.16, [x, 2.02, 0.4], '#2a2d31', null, 16, true);
    k.sphere('warm', 0.045, [x, 1.95, 0.4], '#ffd9a0', null, 10);
  }
  return k;
}

// ---- the garage's open roof space, its lights and its door
const GAR = { x0: -20, x1: -8, z0: -4, z1: 5, ridge: 3.9 };
function buildTruss(H) {
  // one W-truss in the z–y plane (x = 0): chord, rafters, king post, webs
  const k = kit();
  const T = 0.04, D = 0.14, c = '#caa874';
  const zc = (GAR.z0 + GAR.z1) / 2, half = (GAR.z1 - GAR.z0) / 2 + 0.25;
  k.box('wood', [T, D, GAR.z1 - GAR.z0], [0, H + D / 2, zc], c);
  const R = GAR.ridge;
  // rafters: their top edges run just under the roof deck, which passes
  // through the wall heads and the ridge
  const pitch = (R - H) / (zc - GAR.z0);
  const rafter = (z0, z1) => {
    const y0 = z0 < zc ? H + (z0 - GAR.z0) * pitch : H + (GAR.z1 - z0) * pitch;
    const y1 = z1 <= zc + 1e-6 ? H + (z1 - GAR.z0) * pitch : H + (GAR.z1 - z1) * pitch;
    const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
    const phi = Math.atan2(-dy, dz);
    const off = D / 2 + 0.006;
    k.box('wood', [T, D, len], [0, (y0 + y1) / 2 - Math.cos(phi) * off, (z0 + z1) / 2 - Math.sin(phi) * off], c, [phi, 0, 0]);
  };
  rafter(zc - half, zc);
  rafter(zc, zc + half);
  k.box('wood', [T, R - H - 0.1, 0.09], [0, (H + R) / 2, zc], c);
  for (const s of [-1, 1]) {
    k.bar('wood', [0, H + D, zc + s * 1.5], [0, H + (R - H) * 0.6, zc + s * 1.1], 0.045, c);
    k.bar('wood', [0, H + D, zc + s * 1.5], [0, H + (R - H) * 0.3, zc + s * 3.0], 0.045, c);
  }
  // the steel plates at the joints
  for (const s of [-1, 1]) k.box('metal', [T + 0.004, 0.12, 0.2], [0, H + 0.07, zc + s * 1.5], '#b0b5ba');
  return k.build();
}

function addGarageBits(k, H) {
  // plywood loft over the west end, the canoe and the boxes on it
  k.box('wood', [3.6, 0.018, 8.4], [-18.1, H + 0.15, 0.5], '#d6bd8f');
  k.box('wood', [0.04, 0.3, 8.4], [-16.3, H + 0.15, 0.5], '#caa874');
  // the canoe, upside down: a stretched hull
  const hull = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  k.add('gloss', hull, '#c8261e', [-18.4, H + 0.2, 0.3], [Math.PI, 0, 0], [0.42, 0.28, 2.3]);
  for (let i = 0; i < 5; i++) {
    const x = -19.5 + (i % 3) * 0.6, z = 3.0 + Math.floor(i / 3) * 0.7;
    k.box('matte', [0.55, 0.4, 0.45], [x, H + 0.36 + (i === 4 ? 0.4 : 0), z - (i === 4 ? 0.7 : 0)], '#b98a54');
    k.box('matte', [0.3, 0.1, 0.004], [x, H + 0.4 + (i === 4 ? 0.4 : 0), z - 0.226 - (i === 4 ? 0.7 : 0)], '#d8261e'); // XMAS
  }
  k.box('matte', [0.8, 0.35, 0.5], [-17.2, H + 0.33, -2.6], '#8a8f96'); // a suitcase
  // the opener: a motor box on the ceiling, its rail out to the door
  k.box('satin', [0.36, 0.2, 0.5], [-14, 2.55, 2.4], '#e6e3da', null, 0.03);
  k.box('glow', [0.2, 0.02, 0.2], [-14, 2.44, 2.4], '#fff6e0');
  k.box('metal', [0.05, 0.04, 6.3], [-14, 2.58, -0.95], '#8d949b');
  k.bar('metal', [-14, 2.62, 2.2], [-14, H + 0.14, 2.2], 0.03, '#8d949b');
  k.bar('metal', [-14, 2.62, -1.2], [-14, H + 0.14, -1.2], 0.03, '#8d949b');
  // the red release handle on its cord
  k.bar('matte', [-14, 2.56, -3.2], [-14, 1.95, -3.2], 0.006, '#d8261e');
  k.box('satin', [0.09, 0.05, 0.03], [-14, 1.92, -3.2], '#d8261e', null, 0.01);
  // the tennis ball on a string, just touching the windscreen
  k.bar('matte', [-14.2, H + 0.1, 0.6], [-14.2, 1.55, 0.6], 0.003, '#f2f2f2');
  k.sphere('fabric', 0.034, [-14.2, 1.52, 0.6], '#d6f24a', null, 12);
  // LED battens on chains
  for (const [x, z] of [[-17, -1.5], [-17, 2.2], [-10.8, -1.5], [-10.8, 2.2]]) {
    k.box('satin', [0.12, 0.05, 1.5], [x, 2.47, z], '#eef0f2', null, 0.015);
    for (const dz of [-0.6, 0.6]) k.bar('metal', [x, 2.5, z + dz], [x, H + 0.02, z + dz], 0.008, '#7a8086');
  }
  // bikes on hooks on the east wall, over the mower
  for (const [z, col] of [[3.4, '#2f7fe0'], [4.3, '#d8261e']]) {
    const x = -8.45;
    k.torus('matte', 0.3, 0.02, [x, 1.95, z], '#1a1a1a', [0, Math.PI / 2, 0], 24);
    k.torus('matte', 0.3, 0.02, [x, 0.95, z], '#1a1a1a', [0, Math.PI / 2, 0], 24);
    k.bar('satin', [x, 1.95, z], [x, 1.35, z + 0.05], 0.03, col);
    k.bar('satin', [x, 1.35, z + 0.05], [x, 0.95, z], 0.03, col);
    k.bar('satin', [x, 1.95, z], [x, 1.3, z - 0.22], 0.03, col);
    k.bar('satin', [x, 1.3, z - 0.22], [x, 1.35, z + 0.05], 0.03, col);
    k.bar('metal', [-8.1, 2.28, z], [x, 2.28, z], 0.012, '#555');
  }
  // a floor drain in the middle of the bay
  k.cyl('metal', 0.14, 0.14, 0.006, [-11.3, 0.003, 0.4], '#3a3d42', null, 16);
  return k;
}

function GarageInterior({ map }) {
  const H = map.WALL_HEIGHT / M;
  const truss = useMemo(() => buildTruss(H), [H]);
  const xs = useMemo(() => {
    const out = [];
    for (let x = GAR.x0 + 0.3; x < GAR.x1 - 0.1; x += 0.6) out.push(x);
    return out;
  }, []);
  const refs = useRef({});
  useLayoutEffect(() => {
    for (const m of Object.values(refs.current)) {
      if (!m) continue;
      xs.forEach((x, i) => {
        _o.position.set(x * M, 0, 0);
        _o.rotation.set(0, 0, 0);
        _o.scale.set(1, 1, 1);
        _o.updateMatrix();
        m.setMatrixAt(i, _o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  }, [xs, truss]);

  // one batten is slow to come on: it stutters for the first few seconds
  const slow = useRef();
  const t0 = useRef(null);
  const slowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f4f8ff', toneMapped: false }), []);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    const on = t > 5.5 || (Math.sin(t * 23) > 0.3 && Math.sin(t * 3.7) > -0.2);
    slowMat.color.setScalar(on ? 2.2 : 0.08);
  });
  const battenMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.25, 2.4), toneMapped: false }), []);
  return (
    <group>
      {Object.entries(truss).map(([slot, g]) => (
        <instancedMesh key={slot} ref={(m) => { refs.current[slot] = m; }} args={[g, slotMat(slot), xs.length]} castShadow frustumCulled={false} />
      ))}
      {/* the batten tubes themselves */}
      {[[-17, 2.2], [-10.8, -1.5], [-10.8, 2.2]].map(([x, z], i) => (
        <mesh key={i} position={[x * M, 2.44 * M, z * M]} material={battenMat}>
          <boxGeometry args={[0.07 * M, 0.012 * M, 1.44 * M]} />
        </mesh>
      ))}
      <mesh ref={slow} position={[-17 * M, 2.44 * M, -1.5 * M]} material={slowMat}>
        <boxGeometry args={[0.07 * M, 0.012 * M, 1.44 * M]} />
      </mesh>
    </group>
  );
}

// the roller door, rolled up: its sections lie flat in the ceiling tracks
function addRollerDoor(k, H) {
  const x0 = -17, x1 = -11, w = x1 - x0;
  const y = 2.36;
  // tracks: vertical up the jambs, curving into horizontals under the roof
  for (const x of [x0 - 0.04, x1 + 0.04]) {
    k.box('metal', [0.04, 2.1, 0.07], [x, 1.05, -3.82], '#9aa0a6');
    k.box('metal', [0.04, 0.07, 2.9], [x, y + 0.04, -2.45], '#9aa0a6');
    k.torus('metal', 0.22, 0.02, [x, 2.14, -3.6], '#9aa0a6', [0, Math.PI / 2, 0], 8, Math.PI / 2);
    k.bar('metal', [x, y + 0.05, -1.1], [x, H + 0.1, -1.1], 0.03, '#7a8086');
  }
  // four sections, ribbed every 0.5 m (seen from below: the inside face)
  for (let i = 0; i < 4; i++) {
    const z = -3.55 + i * 0.58;
    k.box('satin', [w, 0.04, 0.56], [(x0 + x1) / 2, y, z], '#f1f0ec');
    for (let r = 0; r < 12; r++) k.box('satin', [0.03, 0.015, 0.56], [x0 + 0.25 + r * 0.5, y - 0.027, z], '#e2e0da');
    for (let r = 0; r < 2; r++) k.box('metal', [w, 0.02, 0.02], [(x0 + x1) / 2, y - 0.03, z - 0.27 + r * 0.54], '#b6bbc0');
  }
  // the bottom rail with its rubber seal, and the handle, facing down
  k.box('metal', [w, 0.05, 0.05], [(x0 + x1) / 2, y - 0.01, -3.85], '#b6bbc0');
  k.box('matte', [w, 0.03, 0.02], [(x0 + x1) / 2, y - 0.035, -3.88], '#1a1a1a');
  k.box('metal', [0.15, 0.04, 0.03], [(x0 + x1) / 2, y - 0.04, -3.7], '#555');
  // the torsion spring bar over the opening, inside
  k.cyl('metal', 0.03, 0.03, w + 0.3, [(x0 + x1) / 2, 2.52, -3.75], '#6a7076', [0, 0, Math.PI / 2], 8);
  k.cyl('metal', 0.05, 0.05, 1.4, [-14.8, 2.52, -3.75], '#2a2a2a', [0, 0, Math.PI / 2], 10);
  // the motion-sensor floodlight over the door, outside
  k.box('satin', [0.3, 0.14, 0.12], [-14, 2.55, -4.2], '#2a2d31', null, 0.02);
  k.cyl('satin', 0.05, 0.05, 0.06, [-13.7, 2.5, -4.2], '#2a2d31', null, 10);
  return k;
}

// ---- Edison string lights: a bulb every 30 cm on a sagging line
function catenary(a, b, sag, step) {
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(2, Math.round(L / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return pts;
}
// the wires the bulbs hang on, and a pole where a run ends in the yard
function addStringWires(k, strings) {
  for (const [a, b, sag] of strings) {
    const line = catenary(a, b, sag, 0.1);
    k.add('matte', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line.map((p) => new THREE.Vector3(...p))), line.length * 2, 0.004, 4), '#1a1a1a');
    for (const e of [a, b]) {
      if (Math.abs(e[0]) > 19.5 && e[2] > 5 && e[1] > 1.5) {
        k.box('wood', [0.08, e[1] + 0.1, 0.08], [e[0] + 0.1, (e[1] + 0.1) / 2, e[2] - 0.1], '#8a6a4a');
      }
    }
  }
  return k;
}
function StringLights({ map }) {
  const strings = map.STRINGS || [];
  const bulbs = useMemo(() => {
    const out = [];
    for (const [a, b, sag] of strings) {
      const bl = catenary(a, b, sag, 0.3);
      for (let i = 1; i < bl.length - 1; i++) out.push(bl[i]);
    }
    return out;
  }, [strings]);
  const bulbRef = useRef(), capRef = useRef();
  useLayoutEffect(() => {
    bulbs.forEach(([x, y, z], i) => {
      _o.position.set(x * M, (y - 0.05) * M, z * M);
      _o.rotation.set(0, 0, 0);
      _o.scale.set(1, 1.35, 1);
      _o.updateMatrix();
      bulbRef.current.setMatrixAt(i, _o.matrix);
      _o.position.set(x * M, (y - 0.015) * M, z * M);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      capRef.current.setMatrixAt(i, _o.matrix);
    });
    bulbRef.current.instanceMatrix.needsUpdate = true;
    capRef.current.instanceMatrix.needsUpdate = true;
  }, [bulbs]);
  const bulbGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(0.028 * M, 8, 6);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color('#ffb46b');
    for (let i = 0; i < n; i++) { col[i * 3] = c.r * 1.6; col[i * 3 + 1] = c.g * 1.6; col[i * 3 + 2] = c.b * 1.6; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  return (
    <group>
      <instancedMesh ref={bulbRef} args={[bulbGeo, slotMat('warm'), bulbs.length]} frustumCulled={false} />
      <instancedMesh ref={capRef} args={[null, null, bulbs.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.012 * M, 0.012 * M, 0.03 * M, 6]} />
        <meshStandardMaterial color="#222" metalness={0.5} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}

// ---- wall boards: whiteboards, the kanban, the burndown, the pegboard, HQ
const BOARD_FRAME = { arch: '#b9bec4', demo: '#b9bec4', burndown: '#b9bec4', kanban: '#6d4a26', pegboard: '#8a6a4a', hq: '#8a6a4a', poster: '#1b1b1b' };
function WallBoards({ map }) {
  const boards = map.BOARDS_ON_WALLS || [];
  const mats = useMemo(() => boards.map((b) => new THREE.MeshStandardMaterial({
    map: BOARD_TEX[b.kind](), roughness: ['kanban', 'pegboard', 'hq', 'server'].includes(b.kind) ? 0.9 : 0.35,
  })), [boards]);
  return (
    <group>
      {boards.map((b, i) => {
        const [x, y, z] = b.at;
        const off = 0.028;
        return (
          <mesh key={i} position={[(x + Math.sin(b.rotY) * off) * M, y * M, (z + Math.cos(b.rotY) * off) * M]} rotation-y={b.rotY} material={mats[i]} receiveShadow>
            <planeGeometry args={[b.w * M, b.h * M]} />
          </mesh>
        );
      })}
    </group>
  );
}
function addBoardFrames(k, boards) {
  for (const b of boards) {
    const [x, y, z] = b.at;
    const cs = Math.cos(b.rotY), sn = Math.sin(b.rotY);
    const put = (dx, dy, dz) => [x + dx * cs + dz * sn, y + dy, z - dx * sn + dz * cs];
    const fw = 0.03, col = BOARD_FRAME[b.kind];
    if (!col) continue; // taped up, no frame
    const slot = col === '#b9bec4' ? 'metal' : 'wood';
    k.box(slot, [b.w + fw * 2, fw, 0.03], put(0, b.h / 2 + fw / 2, 0.012), col, [0, b.rotY, 0]);
    k.box(slot, [b.w + fw * 2, fw, 0.03], put(0, -b.h / 2 - fw / 2, 0.012), col, [0, b.rotY, 0]);
    k.box(slot, [fw, b.h, 0.03], put(-b.w / 2 - fw / 2, 0, 0.012), col, [0, b.rotY, 0]);
    k.box(slot, [fw, b.h, 0.03], put(b.w / 2 + fw / 2, 0, 0.012), col, [0, b.rotY, 0]);
    if (slot === 'metal') {
      // a marker tray and two markers
      k.box('metal', [b.w * 0.4, 0.02, 0.06], put(0, -b.h / 2 - 0.04, 0.04), '#9aa0a6', [0, b.rotY, 0]);
      k.box('satin', [0.13, 0.018, 0.018], put(-0.1, -b.h / 2 - 0.02, 0.04), '#1d4fa8', [0, b.rotY, 0]);
      k.box('satin', [0.13, 0.018, 0.018], put(0.08, -b.h / 2 - 0.02, 0.05), '#b3261e', [0, b.rotY, 0]);
    }
    if (b.kind === 'pegboard') {
      // a few real tools proud of the board: a hammer, a coil of lead
      k.box('wood', [0.03, 0.3, 0.03], put(-1.45, 0.05, 0.05), '#6d4a2a', [0, b.rotY, 0]);
      k.box('metal', [0.14, 0.04, 0.04], put(-1.45, 0.21, 0.05), '#555a60', [0, b.rotY, 0]);
      k.torus('satin', 0.14, 0.02, put(1.4, 0.0, 0.05), '#f07a1a', [0, b.rotY, 0], 16);
      k.box('metal', [0.02, 0.02, 0.08], put(-0.4, 0.45, 0.04), '#777', [0, b.rotY, 0]);
    }
  }
  return k;
}

// ---- the SHIP IT neon: a glow on a clear acrylic backing; now and then the
// "IT" stutters
function Neon({ map }) {
  const n = map.NEON;
  const glowMat = useMemo(() => n && new THREE.MeshBasicMaterial({
    map: neonTex(n.text, n.color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    color: new THREE.Color(1.6, 1.6, 1.6),
  }), [n]);
  const wash = useMemo(() => n && new THREE.MeshBasicMaterial({
    map: glowTex(), color: n.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
  }), [n]);
  useFrame(({ clock }) => {
    if (!glowMat) return;
    const t = clock.elapsedTime;
    const c = t % 9;
    const flick = c > 7.6 && c < 8.2 && Math.sin(t * 60) > 0 ? 0.35 : 1;
    glowMat.color.setScalar(1.6 * flick);
    wash.opacity = 0.32 * flick;
  });
  if (!n) return null;
  const [x, y, z] = n.at;
  const h = n.w * (200 / 768);
  const nx = Math.sin(n.rotY), nz = Math.cos(n.rotY);
  return (
    <group>
      <mesh position={[(x + nx * 0.02) * M, y * M, (z + nz * 0.02) * M]} rotation-y={n.rotY}>
        <planeGeometry args={[n.w * 1.05 * M, h * 1.1 * M]} />
        <meshStandardMaterial color="#d9e4ea" transparent opacity={0.18} roughness={0.1} />
      </mesh>
      <mesh position={[(x + nx * 0.03) * M, y * M, (z + nz * 0.03) * M]} rotation-y={n.rotY} material={glowMat}>
        <planeGeometry args={[n.w * M, h * M]} />
      </mesh>
      {/* the pink it throws on the wall and the floor below */}
      <mesh position={[(x + nx * 0.01) * M, (y - 0.3) * M, (z + nz * 0.01) * M]} rotation-y={n.rotY} material={wash}>
        <planeGeometry args={[n.w * 2.2 * M, 1.6 * M]} />
      </mesh>
      <mesh position={[(x + nx * 1.2) * M, 0.02, (z + nz * 1.2) * M]} rotation-x={-Math.PI / 2} material={wash}>
        <planeGeometry args={[2.6 * M, 2.4 * M]} />
      </mesh>
    </group>
  );
}

// ---- chalk on the driveway, its expansion joints, the lawn's stepping stones
function addGround(k) {
  const r = rng(13);
  // expansion joints: a saw-cut every 3 m across the drive and one down it
  for (let x = -18; x <= 5; x += 3) k.box('matte', [0.012, 0.004, 8], [x, 0.0, -8], '#5f5a52');
  k.box('matte', [26, 0.004, 0.012], [-7, 0.0, -8], '#5f5a52');
  // stepping stones across the lawn to the front door
  const stones = [];
  for (let x = 6.4; x < 15.2; x += 0.62) stones.push([x, -8.2 + (r() - 0.5) * 0.12]);
  for (let z = -7.6; z < -4.7; z += 0.62) stones.push([15.5 + (r() - 0.5) * 0.12, z]);
  for (const [x, z] of stones) {
    const g = new THREE.CylinderGeometry(0.25, 0.26, 0.022, 16);
    const pos = g.attributes.position;
    const ph = r() * 6;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), pz = pos.getZ(i), a = Math.atan2(pz, px);
      const w = 1 + 0.12 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(a * 5 + ph * 2);
      pos.setXYZ(i, px * w * (0.9 + r() * 0.02), pos.getY(i), pz * w);
    }
    g.computeVertexNormals();
    k.add('matte', g, ['#a8a39a', '#9c978d', '#b1aca2'][Math.floor(r() * 3)], [x, 0.011, z], [0, r() * 3, 0]);
  }
  // patio pavers outside the slider
  for (let x = -9.5; x < -6.1; x += 0.6) {
    for (let z = 6.9; z < 10.7; z += 0.6) {
      k.box('matte', [0.57, 0.012, 0.57], [x + 0.3, 0.006, z + 0.3], ['#b9b0a2', '#c4bbad', '#aea597'][Math.floor(r() * 3)]);
    }
  }
  // the front step: a concrete pad at the door
  k.box('matte', [2.4, 0.02, 0.9], [15.5, 0.008, -4.55], '#b9b4aa');
  return k;
}

function Chalk({ map }) {
  const c = map.CHALK || {};
  const mats = useMemo(() => {
    const m = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.9 });
    return { grid: m(chalkTex('grid')), finish: m(chalkTex('finish')), hop: m(chalkTex('hopscotch')) };
  }, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[-17.4 * M, 0.02, -8.7 * M]} material={mats.grid}>
        <planeGeometry args={[4.4 * M, 3.4 * M]} />
      </mesh>
      {c.finish && (
        <mesh rotation-x={-Math.PI / 2} position={[c.finish[0] * M, 0.021, c.finish[1] * M]} material={mats.finish}>
          <planeGeometry args={[c.finish[2] * 2 * M, c.finish[2] * 2 * M]} />
        </mesh>
      )}
      {c.hopscotch && (
        <mesh rotation-x={-Math.PI / 2} rotation-z={0.2} position={[c.hopscotch[0] * M, 0.022, c.hopscotch[1] * M]} material={mats.hop}>
          <planeGeometry args={[1.0 * M, 2.0 * M]} />
        </mesh>
      )}
    </group>
  );
}

// ---- what you hear: birds by day, crickets at night, the floodlight's click
function Soundscape({ map }) {
  const hour = useStore((s) => s.timeOfDay);
  const next = useRef(3);
  useEffect(() => { next.current = 2 + Math.random() * 3; }, [hour]);
  useFrame((_, dt) => {
    next.current -= dt;
    if (next.current > 0) return;
    const night = hour === 'night';
    // somewhere outside: a tree across the street, or over the back fence
    const spots = [[-12, 3, -18], [6, 3, -20], [-14, 4, 16], [4, 4, 18], [26, 3, 2]];
    const at = spots[Math.floor(Math.random() * spots.length)].map((v) => v * M);
    if (night) {
      next.current = 1.5 + Math.random() * 3;
      for (let i = 0; i < 3; i++) setTimeout(() => audio.ding(at, 0.035, 4400 + Math.random() * 200), i * 70);
    } else {
      next.current = 4 + Math.random() * 7;
      const n = 2 + Math.floor(Math.random() * 3);
      const base = 2600 + Math.random() * 1200;
      for (let i = 0; i < n; i++) setTimeout(() => audio.ding(at, 0.07, base * (1 + (i % 2 ? 0.18 : 0) + i * 0.03)), i * (90 + Math.random() * 60));
    }
  });
  void map;
  return null;
}

// ---------------------------------------------------------------- registry
// wall finishes and fences are styles; furniture and props from their files
export const WALL_STYLES = { garage_wall: HouseWalls, garage_picket: PicketFence };
export const RAMP_SKINS = { garage_plank: PlankRamp, garage_skate: SkateRamp, garage_pillow: PillowRamp };
export const Robot = RobotVacuum;
export { PIECES, PROPS };
