// Micro-scatter: paper, post-its, leaves, crumbs, grass — the floor-level
// litter a car's eye actually crosses. One InstancedMesh per kind per
// neighbourhood (rows of a kind within CLUSTER_M share one), matrices set
// once, bounds computed so a patch out of view isn't drawn, nothing casts a
// shadow, and ?lowfx skips it all.
//
// A map lists it as SCATTER: [kind, x, z, w, d, n, opts] in metres — n
// instances seeded over the w × d rect centred on (x, z). opts:
//   rot    the rect's turn about the vertical (a band along a fence)
//   seed   a different throw of the same rect
//   s      [min, max] scale (default [0.8, 1.2])
//   edge   0..1: how much of it drifts to the rect's edges (leaves against
//          a railing, grass along a fence)
//   colors override the kind's palette
//
// A kind (BUILTIN_SCATTER below, or a kinds file's SCATTER_KINDS):
//   geo()   a BufferGeometry in METRES, lying on y = 0
//   atlas   a decal kind: the geometry's uvs map into its cell, the
//           material alpha-tests the atlas (paper, leaves); without it the
//           geometry's own vertex colours are used (crumbs, grass)
//   colors  instance colours (multiply the texture or the vertex colours)
//   lift    metres off the floor; tilt: radians of random lean
//   double  draw both faces (thin blades)
// Garage lawns: the 'tuft' kind is garageWorld's grass tuft, generalised.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { rng } from '../textures.js';
import { decalAtlas, decalUV, LOWFX } from './decals.js';
import { SCATTER_KINDS } from './registry.js';

const PI = Math.PI;

// a w × l quad on the floor, bowed up by `bow` metres across its middle (a
// curled sheet, a cupped leaf): 2 × 2 cells, 8 triangles
function bentQuad(w, l, bow = 0) {
  const g = new THREE.PlaneGeometry(w, l, 2, 2);
  g.rotateX(-PI / 2);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i) / (w / 2), z = P.getZ(i) / (l / 2);
    P.setY(i, bow * (x * x * 0.7 + z * z * 0.3));
  }
  g.computeVertexNormals();
  return g;
}

// three crossed grass blades, as garageWorld's Tufts draws them
function tuft() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Shape();
    s.moveTo(-0.035, 0); s.lineTo(0.035, 0); s.lineTo(0.004, 0.11); s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateZ((i - 1) * 0.25); g.rotateY((i / 3) * PI);
    parts.push(g);
  }
  const g = mergeAll(parts);
  const col = new Float32Array(g.attributes.position.count * 3);
  const c = new THREE.Color('#6f9f3c'), tip = new THREE.Color('#9bbd5a');
  for (let i = 0; i < g.attributes.position.count; i++) {
    const t = g.attributes.position.getY(i) / 0.11;
    const k = c.clone().lerp(tip, t);
    col.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// a lumpy little solid (crumbs, pebbles, crumpled paper), vertex-coloured white
function lump(r, detail = 0, flat = 1, seed = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const P = g.attributes.position;
  const rand = rng(seed);
  const seen = new Map();
  for (let i = 0; i < P.count; i++) {
    const key = `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
    let f = seen.get(key);
    if (f === undefined) { f = 0.7 + rand() * 0.5; seen.set(key, f); }
    P.setXYZ(i, P.getX(i) * f, P.getY(i) * f * flat + r * flat * 0.8, P.getZ(i) * f);
  }
  g.computeVertexNormals();
  return white(g);
}

function white(g) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

function mergeAll(list) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of flat) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of flat) {
    g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}

export const BUILTIN_SCATTER = {
  paper: { atlas: 'paper', geo: () => bentQuad(0.21 / 0.7, 0.297, 0.012), colors: ['#ffffff', '#fbf8ef', '#f2efe6'], lift: 0.002, tilt: 0.05 },
  postit: { atlas: 'postit', geo: () => bentQuad(0.076 / 0.8, 0.076 / 0.8, 0.004), colors: ['#ff8fb1', '#7fd3f7', '#9be37d', '#ffa552', '#ff8fb1'], lift: 0.002, tilt: 0.1 },
  leaf: { atlas: 'leaf', geo: () => bentQuad(0.09, 0.06, 0.012), colors: ['#a0612a', '#b8862f', '#7a5a2a', '#8f7a38', '#b04a22', '#6f7a34'], lift: 0.003, tilt: 0.35, double: true },
  crumb: { geo: () => lump(0.004, 0, 0.6, 3), colors: ['#c49a62', '#8a5a30', '#e2c796', '#a87a48'], lift: 0 },
  scrap: { geo: () => lump(0.028, 1, 0.8, 7), colors: ['#f4f2ec', '#f1e9d0', '#ffffff'], lift: 0 },
  pebble: { geo: () => lump(0.012, 0, 0.5, 11), colors: ['#8a8784', '#6f6c68', '#a39f98', '#5d5a57'], lift: 0 },
  butt: {
    geo: () => {
      const f = new THREE.CylinderGeometry(0.004, 0.004, 0.022, 6); f.rotateZ(PI / 2); f.translate(-0.006, 0.004, 0);
      const t = new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 6); t.rotateZ(PI / 2); t.translate(0.011, 0.004, 0);
      const g = mergeAll([f, t]);
      const col = new Float32Array(g.attributes.position.count * 3);
      const nf = f.toNonIndexed().attributes.position.count;
      for (let i = 0; i < g.attributes.position.count; i++) col.set(i < nf ? [0.94, 0.92, 0.87] : [0.79, 0.52, 0.27], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    },
    colors: ['#ffffff', '#e8e4dc'],
    lift: 0,
  },
  tuft: { geo: tuft, colors: ['#ffffff', '#e8f0d8', '#d4e2b8', '#f2f6e8'], lift: 0, tilt: 0.15, double: true },
};

const KINDS = { ...BUILTIN_SCATTER, ...SCATTER_KINDS };

// geometries and materials per kind, made once for the session
const geos = new Map(), mats = new Map();
function geoOf(kind) {
  let g = geos.get(kind);
  if (g) return g;
  const def = KINDS[kind];
  g = def.geo();
  if (def.atlas) {
    const [u0, v0, u1, v1] = decalUV(def.atlas);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  g.scale(M, M, M);
  geos.set(kind, g);
  return g;
}
function matOf(kind) {
  let m = mats.get(kind);
  if (m) return m;
  const def = KINDS[kind];
  m = def.atlas
    ? new THREE.MeshStandardMaterial({ map: decalAtlas(), alphaTest: 0.5, roughness: 0.85, side: def.double ? THREE.DoubleSide : THREE.FrontSide })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: def.double ? THREE.DoubleSide : THREE.FrontSide });
  m.name = `scatter-${kind}`;
  mats.set(kind, m);
  return m;
}

const _o = new THREE.Object3D(), _c = new THREE.Color();

// Rows of a kind within this many metres of each other share a mesh: one
// kind scattered in two rooms at opposite ends of the floor would otherwise
// get bounds the size of the floor and never be culled.
const CLUSTER_M = 7;

// every instance of a map's scatter, grouped by kind and neighbourhood:
// [{ key, kind, list: [{ x, z, s, yaw, lean, roll, color }] }]
export function scatterOf(map) {
  const by = new Map();
  const centres = new Map(); // kind → [[x, z, key]]
  (map.SCATTER || []).forEach(([kind, x, z, w, d, n, o = {}], row) => {
    const def = KINDS[kind];
    if (!def) { console.warn(`scatter: no kind '${kind}'`); return; }
    const r = rng(9001 + row * 77 + (o.seed || 0) * 131);
    const [s0, s1] = o.s || [0.8, 1.2];
    const colors = o.colors || def.colors || ['#ffffff'];
    const c = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
    const near = (centres.get(kind) || []).find(([cx, cz]) => Math.hypot(cx - x, cz - z) < CLUSTER_M);
    const key = near ? near[2] : `${kind}#${row}`;
    if (!near) (centres.get(kind) || centres.set(kind, []).get(kind)).push([x, z, key]);
    const list = by.get(key) || by.set(key, []).get(key);
    list.kind = kind;
    for (let i = 0; i < n; i++) {
      let u = r() - 0.5, v = r() - 0.5;
      if (o.edge && r() < o.edge) {
        // drift it into the outer 12% of the rect, on a side picked by length
        const band = 0.5 - r() * 0.12;
        if (r() < w / (w + d)) v = Math.sign(v || 1) * band; else u = Math.sign(u || 1) * band;
      }
      const lx = u * w, lz = v * d;
      list.push({
        x: x + lx * c + lz * sn, z: z - lx * sn + lz * c,
        s: s0 + r() * (s1 - s0), yaw: r() * PI * 2,
        lean: (r() - 0.5) * 2 * (def.tilt || 0), roll: (r() - 0.5) * 2 * (def.tilt || 0),
        color: colors[(r() * colors.length) | 0],
      });
    }
  });
  return [...by].map(([key, list]) => ({ key, kind: list.kind, list }));
}

function ScatterKind({ kind, list }) {
  const ref = useRef();
  const def = KINDS[kind];
  const geo = geoOf(kind), mat = matOf(kind);
  useLayoutEffect(() => {
    const mesh = ref.current;
    list.forEach((it, i) => {
      _o.position.set(it.x * M, (def.lift || 0) * M + 0.004, it.z * M);
      _o.rotation.set(it.lean, it.yaw, it.roll, 'YXZ');
      _o.scale.setScalar(it.s);
      _o.updateMatrix();
      mesh.setMatrixAt(i, _o.matrix);
      mesh.setColorAt(i, _c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // the bounds of every instance: a kind entirely off screen is culled
    mesh.computeBoundingSphere();
  }, [list, def]);
  return <instancedMesh ref={ref} args={[geo, mat, list.length]} receiveShadow />;
}

export default function Scatter({ map }) {
  const kinds = useMemo(() => (LOWFX ? [] : scatterOf(map)), [map]);
  if (!kinds.length) return null;
  return (
    <group name="scatter">
      {kinds.map(({ key, kind, list }) => <ScatterKind key={key} kind={kind} list={list} />)}
    </group>
  );
}
