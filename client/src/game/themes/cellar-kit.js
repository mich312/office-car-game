// Static batching for the cellar. Everything that never moves — walls, door
// frames, racks, shelving, pipes, the junk in the e-waste room — is described
// as parts (a box, a cylinder, a rounded box, any geometry) with a surface and
// a colour, and merged at load into ONE mesh per surface per room. A rack is
// forty parts and costs nothing extra: the whole server hall's steel is one
// draw call. Colour rides in the vertex colours, so a surface ("gloss paint",
// "steel", "plastic") is a material and the colours are free.
//
// Surfaces that want real-world texture scale (block walls, floors, mesh)
// get world-space UVs in metres, projected along each face's normal — so a
// block is 40 cm on every wall and the coursing runs on round corners.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from '@rc/shared';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();

// Unit shapes, non-indexed with only position/normal/uv, so any mix merges.
const clean = (g) => {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  return ng;
};
const shapes = new Map();
const shape = (key, make) => {
  let g = shapes.get(key);
  if (!g) { g = clean(make()); shapes.set(key, g); }
  return g;
};
export const unitBox = () => shape('box', () => new THREE.BoxGeometry(1, 1, 1));
// a cylinder of height 1, bottom radius 1 and top radius `top`
export const unitCyl = (seg = 12, top = 1, open = false) =>
  shape(`cyl${seg}:${top}:${open}`, () => new THREE.CylinderGeometry(top, 1, 1, seg, 1, open));
export const unitPlane = () => shape('plane', () => new THREE.PlaneGeometry(1, 1));
export const unitSphere = (seg = 10) => shape(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1)));
export const unitTorus = (tube = 0.12, seg = 16) => shape(`tor${tube}:${seg}`, () => new THREE.TorusGeometry(1, tube, 6, seg));
export const roundBox = (w, h, d, r, seg = 2) => {
  const rr = Math.min(r, Math.min(w, h, d) * 0.48);
  return shape(`rb${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${rr.toFixed(3)}:${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rr));
};
// a closed prism from a 2D outline (x, y) extruded along z by `depth`
export const prism = (key, pts, depth) => shape(`pr${key}`, () => {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
});

// Surfaces that differ only in colour and a little roughness share one
// material (and so one draw call): plastic is paint, rubber is matt.
const ALIAS = { plastic: 'paint', rubber: 'matt' };

// A batch in the making. Positions are metres in the caller's frame; the
// frame stack (at / pop) places a piece in the world. `cell` picks the merged
// mesh a part lands in (one per room, so a room out of view is culled whole).
export class Kit {
  constructor(worldUV = new Set()) {
    this.worldUV = worldUV;
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
    this.cell = 'all';
    // cell → the merged mesh it lands in (see Dressing: a few big zones)
    this.zone = null;
  }

  get frame() { return this.stack[this.stack.length - 1]; }

  // enter a local frame: origin (x, y, z) metres, turned rotY about y
  at(x, y, z, rotY = 0, fn) {
    _m.makeRotationY(rotY).setPosition(x * M, y * M, z * M);
    this.stack.push(this.frame.clone().multiply(_m));
    try { fn(); } finally { this.stack.pop(); }
  }

  // a part: geometry `g` (in units already, or unit-sized and scaled by `s`
  // metres), placed at p (metres), rotated r (radians, XYZ), coloured c
  part(mat0, g, p = [0, 0, 0], { r, s, c, uv, a } = {}) {
    const mat = ALIAS[mat0] || mat0;
    _e.set(r?.[0] || 0, r?.[1] || 0, r?.[2] || 0);
    _q.setFromEuler(_e);
    _p.set(p[0] * M, p[1] * M, p[2] * M);
    if (s) _s.set(s[0] * M, s[1] * M, s[2] * M); else _s.set(M, M, M);
    _m.compose(_p, _q, _s).premultiply(this.frame);
    const geo = g.clone();
    geo.applyMatrix4(_m);
    const n = geo.attributes.position.count;
    // colour per vertex (and alpha, for the decals — every part of a
    // surface must agree on which)
    const k = a == null ? 3 : 4;
    const col = new Float32Array(n * k);
    _c.set(c ?? '#ffffff');
    for (let i = 0; i < n; i++) {
      col[i * k] = _c.r; col[i * k + 1] = _c.g; col[i * k + 2] = _c.b;
      if (k === 4) col[i * k + 3] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, k));
    const uvs = geo.attributes.uv;
    if (this.worldUV.has(mat)) {
      // planar projection along the face normal, in metres
      const pos = geo.attributes.position, nor = geo.attributes.normal;
      for (let i = 0; i < n; i++) {
        _v.fromBufferAttribute(pos, i).divideScalar(M);
        _n.fromBufferAttribute(nor, i);
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        if (ay >= ax && ay >= az) uvs.setXY(i, _v.x, -_v.z);
        else if (ax >= az) uvs.setXY(i, _n.x > 0 ? -_v.z : _v.z, _v.y);
        else uvs.setXY(i, _n.z > 0 ? _v.x : -_v.x, _v.y);
      }
    } else if (uv) {
      // remap 0..1 into an atlas rect [u0, v0, u1, v1]
      for (let i = 0; i < n; i++) uvs.setXY(i, uv[0] + uvs.getX(i) * (uv[2] - uv[0]), uv[1] + uvs.getY(i) * (uv[3] - uv[1]));
    }
    const key = this.zone ? this.zone(this.cell) : this.cell;
    let cell = this.buckets.get(key);
    if (!cell) this.buckets.set(key, (cell = new Map()));
    let list = cell.get(mat);
    if (!list) cell.set(mat, (list = []));
    list.push(geo);
    return this;
  }

  // ---- shorthands (sizes and positions in metres) ----
  // box centred at p
  box(mat, [w, h, d], p, o = {}) { return this.part(mat, unitBox(), p, { ...o, s: [w, h, d] }); }
  // box standing on y = p[1] (p is the centre of its footprint)
  block(mat, [w, h, d], [x, y, z], o = {}) { return this.part(mat, unitBox(), [x, y + h / 2, z], { ...o, s: [w, h, d] }); }
  // upright cylinder centred at p; o.top = top radius / bottom radius
  cyl(mat, rad, h, p, o = {}) {
    return this.part(mat, unitCyl(o.seg || 12, o.top ?? 1, !!o.open), p, { ...o, s: [rad, h, rad] });
  }
  // a cylinder between two points (pipes, rods, cables)
  rod(mat, rad, a, b, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return this;
    _v.set(dx, dy, dz).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
    _e.setFromQuaternion(_q);
    return this.part(mat, unitCyl(o.seg || 8, 1, !!o.open), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      { ...o, r: [_e.x, _e.y, _e.z], s: [rad, len, rad] });
  }
  // rounded box centred at p (radius in metres)
  rbox(mat, [w, h, d], rad, p, o = {}) { return this.part(mat, roundBox(w * M, h * M, d * M, rad * M), p, { ...o, s: [1 / M, 1 / M, 1 / M] }); }
  // a flat quad facing +z (rotate with o.r), w × h metres
  quad(mat, [w, h], p, o = {}) { return this.part(mat, unitPlane(), p, { ...o, s: [w, h, 1] }); }
  sphere(mat, rad, p, o = {}) { return this.part(mat, unitSphere(o.seg || 10), p, { ...o, s: [rad * (o.sx || 1), rad * (o.sy || 1), rad * (o.sz || 1)] }); }
  // a ring (hand wheels, valve wheels) in the xy plane, radius rad
  ring(mat, rad, tube, p, o = {}) { return this.part(mat, unitTorus(tube / rad, o.seg || 16), p, { ...o, s: [rad, rad, rad] }); }

  // merge: [{ cell, mat, geometry }]
  finish() {
    const out = [];
    for (const [cell, mats] of this.buckets) {
      for (const [mat, list] of mats) {
        const geometry = mergeGeometries(list, false);
        for (const g of list) g.dispose();
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        out.push({ cell, mat, geometry });
      }
    }
    this.buckets.clear();
    return out;
  }
}

// Deterministic randomness for dressing: the same junk in the same heap on
// every client (and every reload).
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
