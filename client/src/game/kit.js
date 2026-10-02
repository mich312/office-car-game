// The geometry kit every model is built from. Pieces are authored in METRES
// in their own frame (origin on the floor at the piece's centre, +z its
// front), and every primitive here carries metre UVs — so a material from
// materials.js reads at true scale on anything (1 UV unit = 1 metre).
//
// A builder fills a Piece with parts — (material key, geometry, transform,
// colour) — and bake() merges parts into one BufferGeometry per material.
// Office.jsx bakes a whole room's furniture that way: a room of oak desks,
// white legs and black feet is three draw calls however many desks it has.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ UVs
// Box projection by dominant normal: a face's u runs along the longer of its
// two in-plane axes (measured over the whole geometry), so grain follows the
// length of a desk top, a leg, a drawer front. Positions are metres, so u and
// v are metres too.
export function metreUV(g) {
  g.computeBoundingBox();
  const s = new THREE.Vector3();
  g.boundingBox.getSize(s);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) [u, v] = s.x >= s.z ? [x, z] : [z, x];
    else if (ax >= az) [u, v] = s.z >= s.y ? [z, y] : [y, z];
    else [u, v] = s.x >= s.y ? [x, y] : [y, x];
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// map every uv of g into rect [u0, v0, u1, v1] (an atlas cell), from 0..1
export function fitUV(g, rect) {
  const uv = g.attributes.uv;
  const [u0, v0, u1, v1] = rect;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

// ------------------------------------------------------------- primitives
// Cached by their arguments: a builder asks for rbox(1.6, 0.025, 0.8) per
// desk and gets the same object; bake() reads it and never mutates it.
const cache = new Map();
const cached = (key, make) => {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g;
};
const k = (name, a) => `${name}|${a.map((v) => (typeof v === 'number' ? v.toFixed(4) : String(v))).join('|')}`;

export const box = (w, h, d) => cached(k('box', [w, h, d]), () => metreUV(new THREE.BoxGeometry(w, h, d)));

// Nothing has a razor edge: a rounded box, radius clamped to what the
// thinnest side allows. The deliberately oversized 0.5–1 cm bevel is what
// catches a highlight at 18 cm car scale. seg 1 is a single 45° chamfer
// (44 triangles — handles, trim, rails: the highlight is all that shows);
// seg 2+ rounds properly (300+) for what the camera studies up close.
export const rbox = (w, h, d, r = 0.006, seg = 2) => {
  const rr = Math.min(r, Math.min(w, h, d) * 0.48);
  if (seg <= 1) return cached(k('cbox', [w, h, d, rr]), () => metreUV(chamferBox(w, h, d, rr)));
  return cached(k('rbox', [w, h, d, rr, seg]), () => metreUV(new RoundedBoxGeometry(w, h, d, seg, rr)));
};

// A box with every edge cut at 45° by c: 6 faces, 12 edge strips, 8 corner
// triangles, flat-shaded so each chamfer is a crisp line of light.
function chamferBox(w, h, d, c) {
  const X = w / 2, Y = h / 2, Z = d / 2;
  // vertex of the corner (sx, sy, sz), pulled in by c along two axes: the
  // one on the face whose normal is `axis`
  const v = (sx, sy, sz, axis) => [
    sx * (axis === 0 ? X : X - c), sy * (axis === 1 ? Y : Y - c), sz * (axis === 2 ? Z : Z - c),
  ];
  const pos = [];
  const tri = (a, b, e) => pos.push(...a, ...b, ...e);
  const quad = (a, b, e, f) => { tri(a, b, e); tri(a, e, f); };
  const S = [-1, 1];
  // the six faces, wound outward
  for (const s of S) {
    quad(v(s, -1, -1, 0), v(s, 1, -1, 0), v(s, 1, 1, 0), v(s, -1, 1, 0));
    quad(v(-1, s, -1, 1), v(-1, s, 1, 1), v(1, s, 1, 1), v(1, s, -1, 1));
    quad(v(-1, -1, s, 2), v(1, -1, s, 2), v(1, 1, s, 2), v(-1, 1, s, 2));
  }
  // edge strips between each pair of faces, then the corner triangles
  for (const a of S) for (const b of S) {
    quad(v(-1, a, b, 1), v(1, a, b, 1), v(1, a, b, 2), v(-1, a, b, 2)); // along x
    quad(v(a, -1, b, 0), v(a, 1, b, 0), v(a, 1, b, 2), v(a, -1, b, 2)); // along y
    quad(v(a, b, -1, 0), v(a, b, 1, 0), v(a, b, 1, 1), v(a, b, -1, 1)); // along z
    for (const e of S) tri(v(a, b, e, 0), v(a, b, e, 1), v(a, b, e, 2));
  }
  // winding: make every triangle face away from the centre
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
    const ux = pos[i + 3] - ax, uy = pos[i + 4] - ay, uz = pos[i + 5] - az;
    const wx = pos[i + 6] - ax, wy = pos[i + 7] - ay, wz = pos[i + 8] - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * (ax + ux / 3 + wx / 3) + ny * (ay + uy / 3 + wy / 3) + nz * (az + uz / 3 + wz / 3) < 0) {
      for (let j = 0; j < 3; j++) { const t = pos[i + 3 + j]; pos[i + 3 + j] = pos[i + 6 + j]; pos[i + 6 + j] = t; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Cylinders: u = arc length round the side, v = height; caps project flat.
export const cyl = (rt, rb, h, seg = 16, open = false, arc = TAU) => cached(k('cyl', [rt, rb, h, seg, open, arc]), () => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, 0, arc);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const ra = (rt + rb) / 2;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nrm.getY(i)) > 0.9) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else uv.setXY(i, uv.getX(i) * arc * ra, pos.getY(i) + h / 2);
  }
  return g;
});

// Lathe from [radius, y] pairs in metres: u round the axis, v down the profile.
export const lathe = (pts, seg = 24) => cached(k('lathe', [JSON.stringify(pts), seg]), () => {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const rmax = Math.max(...pts.map((p) => p[0]));
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * rmax, uv.getY(i) * len);
  return g;
});

// A tube along points [[x, y, z]...] in metres. smooth: a Catmull-Rom curve
// (taps, cables); otherwise straight runs with sharp corners (rails, pipes).
export const tube = (pts, r, radial = 8, smooth = true, perM = 24) => cached(k('tube', [JSON.stringify(pts), r, radial, smooth, perM]), () => {
  const v = pts.map((p) => new THREE.Vector3(...p));
  let curve;
  if (smooth) curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  else {
    curve = new THREE.CurvePath();
    for (let i = 1; i < v.length; i++) curve.add(new THREE.LineCurve3(v[i - 1], v[i]));
  }
  const L = curve.getLength();
  const segs = smooth ? Math.max(4, Math.ceil(L * perM)) : (v.length - 1) * 2;
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * TAU * r);
  return g;
});

export const torus = (R, r, radial = 8, tubular = 24, arc = TAU) => cached(k('torus', [R, r, radial, tubular, arc]), () => {
  const g = new THREE.TorusGeometry(R, r, radial, tubular, arc);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * arc * R, uv.getY(i) * TAU * r);
  return g;
});

export const sphere = (r, ws = 12, hs = 8) => cached(k('sphere', [r, ws, hs]), () => metreUV(new THREE.SphereGeometry(r, ws, hs)));

// A lumpy ball (boxwood, shrubs): an icosahedron with seeded jitter.
export const bush = (r, detail = 1, seed = 1) => cached(k('bush', [r, detail, seed]), () => {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position;
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // jitter per unique position so the shell stays closed
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let f = seen.get(key);
    if (f === undefined) { f = 0.85 + rand() * 0.3; seen.set(key, f); }
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.9, pos.getZ(i) * f);
  }
  g.computeVertexNormals();
  return metreUV(g);
});

export const plane = (w, h) => cached(k('plane', [w, h]), () => {
  const g = new THREE.PlaneGeometry(w, h);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  return g;
});

// a plane whose uvs are an atlas cell (labels, art, rugs, screens)
export const card = (w, h, rect) => cached(k('card', [w, h, ...rect]), () => fitUV(new THREE.PlaneGeometry(w, h), rect));

// Extrude a 2D outline (THREE.Shape, metres) along +z by depth; optional
// bevel radius rounds its edges.
export const extrude = (key, shape, depth, bevel = 0) => cached(k('extrude', [key, depth, bevel]), () => {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12,
  });
  g.translate(0, 0, -depth / 2);
  return metreUV(g);
});

export const shape = (pts) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};

// ---------------------------------------------------------------- pieces
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const compose = (pos, rot, scale) => {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0));
  if (typeof scale === 'number') _s.set(scale, scale, scale);
  else if (scale) _s.set(scale[0], scale[1], scale[2]);
  else _s.set(1, 1, 1);
  return new THREE.Matrix4().compose(_p, _q, _s);
};

// A piece under construction: parts in its own frame, plus a transform stack
// so a builder can say "at this corner, do the leg". (Decal cards ride along
// in .decals; only the dressing layer draws them — furniture has none.)
export class Piece {
  constructor() {
    this.parts = [];
    this.decals = [];
    this.stack = [new THREE.Matrix4()];
  }
  get top() { return this.stack[this.stack.length - 1]; }
  // add(matKey, geometry, [x, y, z], [rx, ry, rz]?, scale?, colour?)
  add(mat, geo, pos = [0, 0, 0], rot = null, scale = null, color = null) {
    this.parts.push({ mat, geo, m: this.top.clone().multiply(compose(pos, rot, scale)), color });
    return this;
  }
  // A printed label, a sticker, a tape strip: a w × h card of the decal
  // atlas (dressing/decals.js) facing the frame's +z at pos. It doesn't join
  // the material batch — it rides in the map's one merged decal mesh, so a
  // label costs no draw call of its own. a = opacity, tint multiplies.
  decal(kind, w, h, pos = [0, 0, 0], rot = null, a = 1, tint = null) {
    this.decals.push({ kind, w, h, m: this.top.clone().multiply(compose(pos, rot, null)), a, tint });
    return this;
  }
  // run fn with everything it adds placed at pos/rot (nestable)
  at(pos, rot, fn, scale = null) {
    this.stack.push(this.top.clone().multiply(compose(pos, rot, scale)));
    fn();
    this.stack.pop();
    return this;
  }
  // mirror pairs without negative scales (which would flip the winding)
  each(list, fn) { list.forEach((v, i) => fn(v, i)); return this; }
}

// --------------------------------------------------------------- baking
// Merge parts into one geometry per material key, each part moved by its
// own matrix and then by `world`. Writes the arrays directly (no clones):
// the office's whole furniture set bakes in a few milliseconds. Every
// output carries position, normal, uv and colour, so any material can use
// vertex colours and every group merges with every other.
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

export function bake(parts, world = null) {
  const byMat = new Map();
  for (const part of parts) {
    const m = world ? world.clone().multiply(part.m) : part.m;
    (byMat.get(part.mat) || byMat.set(part.mat, []).get(part.mat)).push({ ...part, m });
  }
  const out = new Map();
  for (const [key, list] of byMat) {
    let n = 0;
    for (const p of list) n += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3);
    let o = 0;
    for (const p of list) {
      const g = p.geo, pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
      const cnt = idx ? idx.count : pos.count;
      _nm.getNormalMatrix(p.m);
      const flip = p.m.determinant() < 0;
      _c.set(p.color ?? '#ffffff');
      for (let t = 0; t < cnt; t++) {
        // a mirrored part keeps its faces outward: swap each triangle's 2nd and 3rd
        const tt = flip ? t - (t % 3) + [0, 2, 1][t % 3] : t;
        const i = idx ? idx.getX(tt) : tt;
        _v.fromBufferAttribute(pos, i).applyMatrix4(p.m);
        P[o * 3] = _v.x; P[o * 3 + 1] = _v.y; P[o * 3 + 2] = _v.z;
        _v.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize();
        N[o * 3] = _v.x; N[o * 3 + 1] = _v.y; N[o * 3 + 2] = _v.z;
        U[o * 2] = uv ? uv.getX(i) : 0; U[o * 2 + 1] = uv ? uv.getY(i) : 0;
        C[o * 3] = _c.r; C[o * 3 + 1] = _c.g; C[o * 3 + 2] = _c.b;
        o++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    out.set(key, g);
  }
  return out;
}

// the matrix that puts a piece authored in metres into the world: at (x, z)
// in world units, turned by rotY, scaled metres → units
export const placeMatrix = (x, z, rotY, M, y = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0), new THREE.Vector3(M, M, M));
