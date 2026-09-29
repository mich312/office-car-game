// The props' model kit: geometry helpers authored in METRES, a baker that
// merges a model's parts into one geometry per material, a small shared
// material registry, and the instancer that draws every copy of a prop part
// in one call.
//
// Conventions (shared with the furniture kit, so the two can be unified):
//  * Models are built in metres and scaled to world units (M) when baked.
//  * uv1 is metres: 1 UV unit = 1 m on every surface. Detail maps (peel,
//    weave, pebble, perforation) sample it with repeat = 1 / tile size.
//  * uv is the colour atlas (propTextures.js): a part maps its own 0..1 UVs
//    into a named region, or samples the white patch.
//  * colour is a vertex colour with a TINT MASK in alpha: where a = 1 the
//    instance colour multiplies in (a mug's glaze, a book's cloth, a pen's
//    cap), where a = 0 it doesn't (the coffee, the page block). So one mesh
//    carries many colours and variants cost nothing: no material per colour.
//
// Why instancing: there are ~145 props on the office floor and each is its own
// physics body. Drawn as meshes that was ~400 draw calls; drawn per part-kind
// as InstancedMeshes fed from the bodies' transforms it's ~40, however much
// detail the models carry. Props render an <Inst> marker (an empty group)
// inside their <Body>; every frame, after the physics step has moved the
// bodies, the instancer copies each marker's world matrix into its slot.
import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from '@rc/shared';
import { atlasTex, region, peelNormal, weaveNormal, pebbleNormal, perfAlpha } from './propTextures.js';

// ------------------------------------------------------------ geometry (m)
// Every helper returns a fresh BufferGeometry in metres; `part()` positions
// it and says how it's coloured and textured, `bake()` merges.

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Rounded box; segments 1 is a smooth-shaded chamfer (108 tris), which at
// prop scale is all the roundness the eye can find.
export const rbox = (w, h, d, r, seg = 1) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.48));

export const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

// Lathe around +y from a profile of [r, y] points (bottom to top). u runs
// around from phiStart, v along the profile — so a band lathe maps straight
// onto a label region. uv1: u = arc length at the widest radius, v = profile
// length, both in metres.
export function lathe(pts, seg = 16, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLength);
  let len = 0, rMax = 0;
  for (let i = 0; i < pts.length; i++) {
    rMax = Math.max(rMax, pts[i][0]);
    if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const uv = g.attributes.uv;
  const uv1 = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    uv1[i * 2] = uv.getX(i) * phiLength * rMax;
    uv1[i * 2 + 1] = uv.getY(i) * len;
  }
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  return g;
}

// A tube along a path of [x, y, z] points (a Catmull-Rom through them).
export const tube = (pts, r, seg = 12, radial = 6, closed = false) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, radial, closed);

// A frustum along +y: a (bw × bd) rectangle at y = 0 rising to (tw × td) at
// y = h, open at the bottom. Keycaps, housings, tapered feet — 10 tris.
export function frustum(bw, bd, tw, td, h, bottom = false) {
  const b = [[-bw / 2, 0, -bd / 2], [bw / 2, 0, -bd / 2], [bw / 2, 0, bd / 2], [-bw / 2, 0, bd / 2]];
  const t = [[-tw / 2, h, -td / 2], [tw / 2, h, -td / 2], [tw / 2, h, td / 2], [-tw / 2, h, td / 2]];
  const pos = [], uv = [];
  const quad = (a, b2, c, d) => {
    pos.push(...a, ...b2, ...c, ...a, ...c, ...d);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  quad(t[0], t[3], t[2], t[1]); // top (counter-clockwise seen from above)
  const sides = uv.length;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(b[j], b[i], t[i], t[j]);
  }
  if (bottom) quad(b[0], b[1], b[2], b[3]);
  // only the top carries the region (a keycap legend); sides sample its corner
  uv.fill(0.02, sides);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Several pieces welded into one geometry (a caster, a lamp joint): each
// entry is { geo, at, rot, scale } like a part, minus colour and texture.
export function combine(entries) {
  return mergeGeometries(entries.map((e) => {
    const g = e.geo.index ? e.geo.toNonIndexed() : e.geo.clone();
    g.applyMatrix4(xform(e));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    return g;
  }));
}

// ----------------------------------------------------------------- parts
// part(geo, mat, opts): opts = {
//   at: [x, y, z], rot: [x, y, z] (euler, radians), scale: [x, y, z] | n,
//   color: '#hex' | [r, g, b] (linear 0..1), tint: 0 | 1,
//   region: 'name' (map the geometry's own uv into that atlas region;
//            default: the white patch; 'own' keeps the uv as it is — a
//            material with its own texture), faces: { 0..5: region } for boxes,
//   swapUV: true (the geometry's u/v run the other way to the region's),
// }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

function xform(o) {
  _e.set(...(o.rot || [0, 0, 0]));
  _q.setFromEuler(_e);
  const sc = o.scale ?? 1;
  _s.set(...(Array.isArray(sc) ? sc : [sc, sc, sc]));
  _p.set(...(o.at || [0, 0, 0]));
  return _m.compose(_p, _q, _s);
}

export function part(geo, mat, opts = {}) {
  return { geo, mat, ...opts };
}

function prepare(pt) {
  let g = pt.geo;
  // a box's faces are groups 0..5 (+x −x +y −y +z −z); remember them before
  // toNonIndexed flattens the index
  const faceOf = pt.faces && g.groups.length ? faceTable(g) : null;
  g = g.index ? g.toNonIndexed() : g.clone();
  g.applyMatrix4(xform(pt));
  const n = g.attributes.position.count;
  // metre UVs: keep the builder's (lathe), else project by dominant normal
  if (!g.attributes.uv1) {
    const uv1 = new Float32Array(n * 2);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
      const [a, b] = ax >= ay && ax >= az ? [P.getZ(i), P.getY(i)] : ay >= az ? [P.getX(i), P.getZ(i)] : [P.getX(i), P.getY(i)];
      uv1[i * 2] = a; uv1[i * 2 + 1] = b;
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  }
  // atlas UVs
  const src = g.attributes.uv;
  const uv = new Float32Array(n * 2);
  const white = region('white');
  const wu = (white[0] + white[2]) / 2, wv = (white[1] + white[3]) / 2;
  for (let i = 0; i < n; i++) {
    const name = faceOf ? pt.faces[faceOf[i]] : pt.region;
    const r = name === 'own' ? [0, 0, 1, 1] : name ? region(name) : null;
    if (r && src) {
      const a = pt.swapUV ? src.getY(i) : src.getX(i), b = pt.swapUV ? src.getX(i) : src.getY(i);
      uv[i * 2] = r[0] + a * (r[2] - r[0]);
      uv[i * 2 + 1] = r[1] + b * (r[3] - r[1]);
    } else { uv[i * 2] = wu; uv[i * 2 + 1] = wv; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // colour + tint mask
  // (a hand-built geometry may bring its own rgb per vertex; it multiplies)
  const own = g.attributes.color;
  const col = new Float32Array(n * 4);
  if (Array.isArray(pt.color)) _c.setRGB(...pt.color); else _c.set(pt.color ?? '#ffffff');
  for (let i = 0; i < n; i++) {
    const k = own ? [own.getX(i), own.getY(i), own.getZ(i)] : [1, 1, 1];
    col.set([_c.r * k[0], _c.g * k[1], _c.b * k[2], pt.tint ? 1 : 0], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'uv1', 'color'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  return g;
}

// per-vertex face index (0..5) of an indexed BoxGeometry, after toNonIndexed
function faceTable(g) {
  const out = new Uint8Array(g.index ? g.index.count : g.attributes.position.count);
  g.groups.forEach((gr, fi) => out.fill(fi, gr.start, gr.start + gr.count));
  return out;
}

// Merge parts by material; scale metres → world units. Returns { mat: geo }.
export function bake(parts) {
  const by = {};
  for (const pt of parts) (by[pt.mat] ||= []).push(prepare(pt));
  const out = {};
  for (const [mat, list] of Object.entries(by)) {
    const g = mergeGeometries(list);
    g.scale(M, M, M);
    g.computeBoundingSphere();
    out[mat] = g;
  }
  return out;
}

// ------------------------------------------------------------- materials
// Every material patches three's vertex-colour chunk so the colour
// attribute's alpha is a tint mask for the instance colour (see top).
function tintMask(mat) {
  mat.vertexColors = true;
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <color_vertex>', `
#if defined( USE_COLOR_ALPHA )
  vColor = vec4( color.rgb, 1.0 );
  #ifdef USE_INSTANCING_COLOR
    vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, color.a );
  #endif
#endif`);
  };
  mat.customProgramCacheKey = () => 'propTint';
  return mat;
}

const peelScale = new THREE.Vector2(0.35, 0.35);
const weaveScale = new THREE.Vector2(0.9, 0.9);
const pebbleScale = new THREE.Vector2(0.8, 0.8);

// name → [factory, casts a shadow]
const MAT_DEFS = {
  plastic: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.45, normalMap: peelNormal(), normalScale: peelScale }), true],
  matte: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.8 }), true],
  ceramic: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.16, normalMap: peelNormal(), normalScale: peelScale }), true],
  metal: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), metalness: 0.9, roughness: 0.28 }), true],
  paper: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.92 }), true],
  fabric: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.95, normalMap: weaveNormal(), normalScale: weaveScale }), true],
  foliage: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.55, side: THREE.DoubleSide }), true],
  ball: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.72, normalMap: pebbleNormal(), normalScale: pebbleScale }), true],
  marble: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), roughness: 0.04, metalness: 0.1, envMapIntensity: 2 }), false],
  gold: [() => new THREE.MeshStandardMaterial({ map: atlasTex(), color: '#ffd24a', metalness: 0.95, roughness: 0.16, emissive: '#8a6d00', emissiveIntensity: 0.45 }), true],
  coffee: [() => new THREE.MeshStandardMaterial({ color: '#2a170a', roughness: 0.06 }), false],
  // Clear stuff: tinted, no transmission (too expensive); depthWrite off so a
  // glass never punches a hole in what's behind it.
  glass: [() => new THREE.MeshPhysicalMaterial({ color: '#e4f4f8', transparent: true, opacity: 0.26, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false }), false],
  pet: [() => new THREE.MeshPhysicalMaterial({ color: '#8fd0f0', transparent: true, opacity: 0.42, roughness: 0.08, clearcoat: 1, depthWrite: false }), false],
  // Perforated steel: alpha-tested holes, both faces (you see the inside wall
  // through the front). No shadow — a solid one would lie about the holes.
  perf: [() => new THREE.MeshStandardMaterial({ color: '#9aa2ad', metalness: 0.8, roughness: 0.38, alphaMap: perfAlpha(), alphaTest: 0.5, side: THREE.DoubleSide }), false],
  glow: [() => new THREE.MeshBasicMaterial({ color: '#fff1c8', toneMapped: false }), false],
};

const mats = new Map();
export function mat(name) {
  let m = mats.get(name);
  if (!m) {
    const def = MAT_DEFS[name];
    if (!def) throw new Error(`propKit: no material ${name}`);
    m = tintMask(def[0]());
    mats.set(name, m);
  }
  return m;
}

// Props.jsx adds its screen materials (they carry live canvas textures).
export function defineMaterial(name, factory, casts = false) {
  MAT_DEFS[name] = [factory, casts];
}

// ------------------------------------------------------------- instancing
// MODELS: name → build(lo) → { matName: geometry } (built once, cached).
// A model with a LOD distance (metres) is also built with lo = true — fewer
// segments, the small parts dropped — and each copy draws as one or the
// other by its distance from the camera. 21 chairs are 2.4k tris up close
// and 0.5k across the room.
const MODELS = {};
export function defineModel(name, build, lod = 0) { MODELS[name] = { build, lod: lod * M }; }

const models = new Map();
export function model(name, lo = false) {
  const key = lo ? `${name}~` : name;
  let m = models.get(key);
  if (!m) { m = MODELS[name].build(lo); models.set(key, m); }
  return m;
}

export const instanceRoot = new THREE.Group();
instanceRoot.name = 'prop-instances';
const kinds = new Map(); // `${model}|${mat}` → kind

function kindFor(modelName, matName, geo, lo) {
  const key = `${modelName}${lo ? '~' : ''}|${matName}`;
  let k = kinds.get(key);
  if (!k) {
    k = { key, geo, mat: mat(matName), cast: MAT_DEFS[matName][1], items: new Set(), mesh: null, cap: 0 };
    kinds.set(key, k);
  }
  return k;
}

function grow(k, need) {
  if (k.cap >= need) return;
  const cap = Math.max(4, Math.ceil(need * 1.5));
  if (k.mesh) { instanceRoot.remove(k.mesh); k.mesh.dispose(); }
  const mesh = new THREE.InstancedMesh(k.geo, k.mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  // culled per instance below, against each prop's own bounds
  mesh.frustumCulled = false;
  mesh.castShadow = k.cast;
  mesh.receiveShadow = true;
  mesh.count = 0;
  instanceRoot.add(mesh);
  k.mesh = mesh;
  k.cap = cap;
}

const WHITE = new THREE.Color(1, 1, 1);
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sphere = new THREE.Sphere(), _v = new THREE.Vector3();
// Padding on the per-instance cull: a prop just off screen still casts a
// shadow onto it.
const CULL_PAD = 0.6 * M;

let frame = 0;
function sync(camera) {
  frame++;
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pv);
  for (const k of kinds.values()) {
    if (!k.items.size && !k.mesh) continue;
    grow(k, k.items.size);
    const { mesh } = k;
    const bs = k.geo.boundingSphere;
    let n = 0;
    for (const it of k.items) {
      const o = it.obj;
      // a prop with several parts shares one marker: update it once a frame
      if (o.userData.propFrame !== frame) { o.updateWorldMatrix(true, false); o.userData.propFrame = frame; }
      if (it.lod) {
        _v.setFromMatrixPosition(o.matrixWorld);
        if ((_v.distanceToSquared(camera.position) > it.lod * it.lod) !== it.lo) continue;
      }
      _sphere.center.copy(bs.center).applyMatrix4(o.matrixWorld);
      _sphere.radius = bs.radius + CULL_PAD;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      mesh.setMatrixAt(n, o.matrixWorld);
      mesh.setColorAt(n, it.color || WHITE);
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}

// Mount once, inside <Physics> and after the props: useFrame callbacks run in
// subscription order, so this runs after rapier's step has moved the bodies
// (and after a plant's sway) — the instances never trail their bodies.
export function PropInstances() {
  useFrame(({ camera }) => sync(camera));
  return <primitive object={instanceRoot} />;
}

// A prop's visual: an empty group that stands in for the whole model. Put
// it where the model's origin goes; `color` tints the masked parts.
export function Inst({ model: name, color = null, ...props }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const obj = ref.current;
    const { lod } = MODELS[name];
    const items = [];
    for (const lo of lod ? [false, true] : [false]) {
      for (const [m, geo] of Object.entries(model(name, lo))) {
        const k = kindFor(name, m, geo, lo);
        const it = { obj, color, lod, lo };
        k.items.add(it);
        items.push([k, it]);
      }
    }
    return () => items.forEach(([k, it]) => k.items.delete(it));
  }, [name, color]);
  return <group ref={ref} {...props} />;
}

// ---------------------------------------------------------------- seeding
// Deterministic per-prop variety (glaze, cover, pen colour, plant species):
// the same on every client, unlike Math.random.
export function seeded(mapId, i, salt = 0) {
  let h = 2166136261 ^ salt;
  const s = `${mapId}:${i}`;
  for (let c = 0; c < s.length; c++) h = Math.imul(h ^ s.charCodeAt(c), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];
