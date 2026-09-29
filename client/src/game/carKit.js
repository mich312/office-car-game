// The car's parts bin: a builder that merges every static bit of a car into
// one geometry per material, the shared materials those draws use, and the
// moving parts (wheels, suspension, driver) as cached geometry.
//
// Why a builder: a kitted car used to be ~130 meshes — every lamp, fin, nut
// and strut its own draw call, times twelve cars, times the shadow pass. Here
// a part is described as primitives tagged with a material slot and a colour
// ("kit" plastics and "metal" take per-vertex colour), and the whole body's
// worth of them collapses into a handful of draws, cached per build.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedBox } from './roundedGeo.js';
import { orangePeel } from './textures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

export function mat4(pos = [0, 0, 0], rot, scale = [1, 1, 1]) {
  rot = rot || [0, 0, 0];
  _e.set(rot[0], rot[1], rot[2], rot.length > 3 ? rot[3] : 'XYZ');
  return new THREE.Matrix4().compose(_p.set(...pos), _q.setFromEuler(_e), _s.set(...scale));
}

// ------------------------------------------------------------- builder
// Slots: paint, trim (accent colour, falls back to paint), glass, kit
// (vertex-coloured plastics), metal (vertex-coloured metals), head/tail
// (lamp lenses, vertex-coloured and unlit so they bloom).
export class Parts {
  // remap: { slot: otherSlot } — e.g. trim drawn as paint when no accent
  constructor(remap = {}) { this.slots = {}; this.remap = remap; }

  add(slot, geo, matrix, color = '#ffffff') {
    slot = this.remap[slot] || slot;
    (this.slots[slot] ||= []).push({ geo, matrix: matrix ? matrix.clone() : null, color });
    return this;
  }

  // rounded box: nothing on a car has a razor edge
  box(slot, [w, h, d], pos, rot, color, r = 0.006) {
    // one bevel segment is plenty at this size; hairline radii are plain boxes
    const geo = r > 0.0025 && Math.min(w, h, d) > 0.008 ? roundedBox(w, h, d, r, 1) : boxGeo(w, h, d);
    return this.add(slot, geo, mat4(pos, rot), color);
  }

  // cylinder along local y (rotate to point it elsewhere)
  cyl(slot, rt, rb, h, pos, rot, color, seg = 12, open = false) {
    return this.add(slot, cylGeo(rt, rb, h, seg, open), mat4(pos, rot), color);
  }

  // tube between two points
  rod(slot, a, b, r, color, seg = 6) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(slot, cylGeo(r, r, len, seg, true), m, color);
  }

  sphere(slot, r, pos, color, ws = 10, hs = 8, scale = [1, 1, 1]) {
    return this.add(slot, sphereGeo(r, ws, hs), mat4(pos, [0, 0, 0], scale), color);
  }

  torus(slot, R, r, pos, rot, color, arc = Math.PI * 2, rs = 6, ts = 16) {
    return this.add(slot, torusGeo(R, r, rs, ts, arc), mat4(pos, rot), color);
  }

  geo(slot, geo, pos, rot, color, scale) {
    return this.add(slot, geo, mat4(pos, rot, scale), color);
  }

  // → { slot: BufferGeometry } — one merged, non-indexed geometry per slot
  build() {
    const out = {};
    for (const [slot, list] of Object.entries(this.slots)) {
      const parts = list.map(({ geo, matrix, color }) => {
        let g = geo.index ? geo.toNonIndexed() : geo.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (matrix) g.applyMatrix4(matrix);
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        if (Array.isArray(color)) _c.setRGB(color[0], color[1], color[2]);
        else _c.set(color || '#ffffff');
        for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.morphAttributes = {};
        return g;
      });
      const merged = mergeGeometries(parts, false);
      merged.computeBoundingSphere();
      out[slot] = merged;
    }
    return out;
  }
}

// cached primitive geometries (the builder clones on use)
const pcache = new Map();
const cached = (key, make) => { let g = pcache.get(key); if (!g) { g = make(); pcache.set(key, g); } return g; };
const k3 = (...a) => a.map((v) => (typeof v === 'number' ? v.toFixed(4) : String(v))).join('|');
export const boxGeo = (w, h, d) => cached(`b${k3(w, h, d)}`, () => new THREE.BoxGeometry(w, h, d));
export const cylGeo = (rt, rb, h, seg = 12, open = false) => cached(`c${k3(rt, rb, h, seg, open)}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sphereGeo = (r, ws, hs) => cached(`s${k3(r, ws, hs)}`, () => new THREE.SphereGeometry(r, ws, hs));
export const torusGeo = (R, r, rs, ts, arc) => cached(`t${k3(R, r, rs, ts, arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));

// ------------------------------------------------------------- palette
// Fixed colours the kit plastics and metals carry per vertex.
export const COL = {
  black: '#16171b', plastic: '#24262c', rubber: '#141518', carbon: '#1d1f24', grey: '#4a4f58',
  chrome: '#e6eaf0', alu: '#aab2bd', steel: '#7d848f', gold: '#d9a441', copper: '#c07a45',
  battery: '#2e6fd8', label: '#f2f2f2', red: '#c42b22', amber: '#ff9a1a', paper: '#d9d2c4', box: '#b58a57',
  suit: '#2a3246', skin: '#e7b48f', glove: '#111216', lens: '#d9e4ee',
};

// ------------------------------------------------------------- materials
// Shared, module-level: every car in the lobby draws with the same handful.
export const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: '#0b0c12', side: THREE.BackSide });
export const KIT_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.05 });
export const METAL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.92, envMapIntensity: 1.1 });
// Lamp lenses are unlit and HDR (vertex colours above 1) so they bloom;
// the headlamp pair has a day and a night brightness.
export const HEAD_DAY = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
export const HEAD_NIGHT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(3.2, 3.2, 3.2) });
export const TAIL_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
// lens colours (linear, HDR)
export const LENS = {
  head: [1.1, 1.08, 0.98], tail: [1.6, 0.06, 0.05], reverse: [1.1, 1.1, 1.1], amber: [1.5, 0.5, 0.05],
  dimTail: [0.5, 0.02, 0.02],
};

// Window tint. Clear glass still reads dark against the paint, so the three
// steps are about how much of the cabin (and the driver) you can make out.
const TINTS = {
  clear: { color: '#2e4460', opacity: 0.62 },
  smoke: { color: '#161c26', opacity: 0.84 },
  limo: { color: '#07080b', opacity: 1 },
};
const glassCache = new Map();
export function glassMat(tint) {
  const t = TINTS[tint] || TINTS.clear;
  if (!glassCache.has(tint)) {
    glassCache.set(tint, new THREE.MeshPhysicalMaterial({
      color: t.color, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05,
      transparent: t.opacity < 1, opacity: t.opacity, envMapIntensity: 1.4, depthWrite: t.opacity >= 1,
    }));
  }
  return glassCache.get(tint);
}

// Paint. Every finish is a real clearcoat now, including Toy Gloss: the
// banded toon shell read as flat plastic next to the PBR office, and a
// lacquer that catches the strip lights is what sells a die-cast body. The
// finishes differ the way paint does — flake under the lacquer, a matte wrap
// with no lacquer at all, pearl that shifts colour.
const paintCache = new Map();
export function paintMat(color, finishId, FINISHES) {
  const key = `${color}|${finishId}`;
  if (paintCache.has(key)) return paintCache.get(key);
  const f = FINISHES[finishId] || FINISHES.gloss;
  const peel = orangePeel('carpaint', 0.35, [3, 3]);
  let m;
  if (f.toon) {
    m = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.34, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.06,
      clearcoatNormalMap: peel, clearcoatNormalScale: new THREE.Vector2(0.15, 0.15), envMapIntensity: 1.0,
    });
  } else if (f.clearcoat !== undefined || f.iridescence !== undefined) {
    m = new THREE.MeshPhysicalMaterial({
      color, roughness: f.roughness, metalness: f.metalness, clearcoat: f.clearcoat ?? 0, clearcoatRoughness: 0.08,
      iridescence: f.iridescence ?? 0, iridescenceIOR: 1.4, envMapIntensity: 1.15,
    });
  } else if (f.metalness > 0.5) {
    // metal flake: metallic base under a clear lacquer
    m = new THREE.MeshPhysicalMaterial({
      color, roughness: f.roughness, metalness: f.metalness, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 1.1,
    });
  } else {
    m = new THREE.MeshStandardMaterial({ color, roughness: f.roughness, metalness: f.metalness, normalMap: peel, normalScale: new THREE.Vector2(0.4, 0.4) });
  }
  paintCache.set(key, m);
  return m;
}

// Wheel rims: one per style colour. Double-sided so the barrel reads from
// inside through the spokes.
const rimCache = new Map();
export function rimMat(color) {
  if (!rimCache.has(color)) {
    rimCache.set(color, new THREE.MeshStandardMaterial({
      color, vertexColors: true, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide, envMapIntensity: 1.2,
    }));
  }
  return rimCache.get(color);
}

// Plate: one material per label, shared by everyone running that plate.
const plateCache = new Map();
export function plateMat(tex, label) {
  if (!plateCache.has(label)) plateCache.set(label, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.1 }));
  return plateCache.get(label);
}

// ------------------------------------------------------------- canvas maps
const texCache = new Map();
function canvas(key, w, h, draw, linear = false) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// height field → tangent-space normal map (wraps in u, like the tyre does)
function toNormal(g, w, h, strength) {
  const src = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h);
  const at = (x, y) => src[(Math.min(h - 1, Math.max(0, y)) * w + ((x % w) + w) % w) * 4];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = ((at(x - 1, y) - at(x + 1, y)) / 255) * strength;
      const dy = ((at(x, y - 1) - at(x, y + 1)) / 255) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      out.data[i] = (dx / l * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
}

// Tyre maps. u runs round the tyre (TYRE_U repeats), v across the profile:
// inner sidewall 0–0.3, tread 0.3–0.7, outer sidewall 0.7–1. The outer
// sidewall carries raised lettering; the tread its pattern.
const TYRE_U = 2;
function tyreHeight(type) {
  return (g, w, h) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    const tv0 = h * 0.3, tv1 = h * 0.7;
    if (type === 'road') {
      // sipes: short diagonal cuts across the shoulder blocks
      g.fillStyle = 'rgb(40,40,40)';
      for (let x = 0; x < w; x += 12) {
        for (const [a, b] of [[0.31, 0.4], [0.6, 0.69]]) {
          g.save(); g.translate(x, h * a); g.transform(1, 0, 0.35, 1, 0, 0); g.fillRect(0, 0, 2.5, h * (b - a)); g.restore();
        }
      }
    } else if (type === 'knobby') {
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = 'rgb(175,175,175)';
        g.fillRect(x + 2, tv0 + 2, 5, (tv1 - tv0) * 0.4);
      }
    } else {
      // slicks: a faint scuffed band where the rubber has been worked
      for (let i = 0; i < 400; i++) {
        const v = 110 + Math.random() * 30;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(Math.random() * w, tv0 + Math.random() * (tv1 - tv0), 3 + Math.random() * 6, 1);
      }
    }
    // outer sidewall lettering + a rim-protector rib on both sides
    g.fillStyle = 'rgb(200,200,200)';
    g.fillRect(0, h * 0.94, w, 2); g.fillRect(0, h * 0.06 - 2, w, 2);
    g.font = `bold ${Math.round(h * 0.13)}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) g.fillText('RC MAYHEM · GRIP 18', w * (0.08 + i * 0.5), h * 0.83);
  };
}
export function tyreMaps(type) {
  const key = `tyre-${type}`;
  const normalMap = canvas(`${key}-n`, 512, 128, (g, w, h) => { tyreHeight(type)(g, w, h); toNormal(g, w, h, 2.2); }, true);
  const map = canvas(`${key}-a`, 512, 128, (g, w, h) => {
    g.fillStyle = '#1c1d21'; g.fillRect(0, 0, w, h);
    // sidewalls a shade warmer and matter than the tread
    g.fillStyle = '#212226'; g.fillRect(0, 0, w, h * 0.3); g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = 'rgba(210,214,220,0.8)';
    g.font = `bold ${Math.round(h * 0.13)}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) g.fillText('RC MAYHEM · GRIP 18', w * (0.08 + i * 0.5), h * 0.83);
    // dust in the shoulder
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(140,130,120,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, h * (0.25 + Math.random() * 0.5), 2, 1);
    }
  });
  return { map, normalMap };
}
const tyreMatCache = new Map();
export function tyreMat(type) {
  if (!tyreMatCache.has(type)) {
    const { map, normalMap } = tyreMaps(type);
    tyreMatCache.set(type, new THREE.MeshStandardMaterial({
      map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: type === 'slick' ? 0.55 : 0.88, metalness: 0,
      vertexColors: true,
    }));
  }
  return tyreMatCache.get(type);
}

// ------------------------------------------------------------- tyres
// A lathe round the wheel axis (local x; +x = the outer face), with its
// profile drawn like a real tyre: bead on the rim, a bulging sidewall, a
// rounded shoulder and a crowned tread. Road tyres have two circumferential
// grooves, knobblies real lug blocks in the silhouette, slicks nothing.
const tyreCache = new Map();
export function tyreGeo(type, r, w, seg) {
  const key = k3(type, r, w, seg || 0);
  if (tyreCache.has(key)) return tyreCache.get(key);
  const hw = w / 2;
  // profile: [radius share, x share of half-width], inner bead → outer bead
  let prof = [
    [0.64, -0.8], [0.72, -0.98], [0.82, -1.0], [0.9, -0.97], [0.955, -0.88], [0.985, -0.7],
    [1, -0.4], [1, 0], [1, 0.4], [0.985, 0.7], [0.955, 0.88], [0.9, 0.97], [0.82, 1.0], [0.72, 0.98], [0.64, 0.8],
  ];
  if (type === 'road') {
    prof = [
      ...prof.slice(0, 6), [0.998, -0.5], [0.998, -0.3], [0.975, -0.28], [0.975, -0.16], [1, -0.14], [1, 0.14],
      [0.975, 0.16], [0.975, 0.28], [0.998, 0.3], [0.998, 0.5], ...prof.slice(9),
    ];
  }
  const S = seg || (type === 'knobby' ? 40 : 32);
  const P = prof.length;
  const pos = [], uv = [], col = [];
  // arc length across the profile for v
  const vs = [0];
  for (let j = 1; j < P; j++) vs.push(vs[j - 1] + Math.hypot((prof[j][0] - prof[j - 1][0]) * r, (prof[j][1] - prof[j - 1][1]) * hw));
  for (let i = 0; i <= S; i++) {
    const a = (i / S) * Math.PI * 2;
    for (let j = 0; j < P; j++) {
      let [rr, xx] = prof[j];
      let shade = 1;
      if (type === 'knobby' && rr > 0.9) {
        // staggered lug blocks, two rows; the grooves between drop 7%
        const row = xx < 0 ? 0 : 1;
        const ph = ((i + row * 2.5) % 5) / 5;
        const lug = ph < 0.55;
        if (!lug) { rr -= (rr - 0.9) * 0.9 + 0.02; shade = 0.8; }
      }
      pos.push(xx * hw, Math.cos(a) * rr * r, Math.sin(a) * rr * r);
      uv.push((i / S) * TYRE_U, vs[j] / vs[P - 1]);
      col.push(shade, shade, shade);
    }
  }
  const idx = [];
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j, b = (i + 1) * P + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (type === 'knobby') { g = g.toNonIndexed(); g.computeVertexNormals(); } // crisp lug edges
  g.computeBoundingSphere();
  tyreCache.set(key, g);
  return g;
}

// ------------------------------------------------------------- rims
// One merged geometry per (style, r, w): barrel, backplate, spokes or face,
// hub, nuts and lip. Vertex colour darkens the parts that aren't the finish.
const rimGeoCache = new Map();
export function rimGeo(style, r, w) {
  const key = k3(style.name, r, w);
  if (rimGeoCache.has(key)) return rimGeoCache.get(key);
  const P = new Parts();
  const hw = w / 2;
  const R = r * 0.64; // bead seat
  const face = hw * 0.62; // how far out the spoke face sits
  const WHITE = [1, 1, 1], DIM = [0.42, 0.42, 0.45], DARK = [0.12, 0.12, 0.13];
  // barrel: a short open tube inside the bead, and a dark backplate so you
  // never see daylight through the wheel
  P.cyl('rim', R, R, w * 0.92, [0, 0, 0], [0, 0, Math.PI / 2], DIM, 24, true);
  P.cyl('rim', R * 0.98, R * 0.98, 0.004, [-hw * 0.3, 0, 0], [0, 0, Math.PI / 2], DARK, 20);
  // outer lip: a rolled edge proud of the bead
  const lipR = style.lip ? r * 0.7 : r * 0.665;
  P.torus('rim', R, style.lip ? 0.014 : 0.008, [hw * 0.9, 0, 0], [0, Math.PI / 2, 0], WHITE, Math.PI * 2, 6, 28);
  if (style.lip) {
    // deep dish: a polished cone from the lip down to a recessed spoke face
    const lathe = new THREE.LatheGeometry([new THREE.Vector2(R * 0.72, 0), new THREE.Vector2(lipR * 0.97, hw * 0.55)], 28);
    P.geo('rim', lathe, [hw * 0.35, 0, 0], [0, 0, -Math.PI / 2], WHITE);
  }
  const fx = style.lip ? hw * 0.3 : face;
  if (style.disc) {
    // turbofan: a flat disc with raked fan blades
    P.cyl('rim', R * 0.97, R * 0.97, 0.012, [fx, 0, 0], [0, 0, Math.PI / 2], DIM, 28);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      P.box('rim', [0.012, R * 0.62, R * 0.16], [fx + 0.008, Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58], [a + 0.0, 0, 0, 'XYZ'], WHITE, 0.003);
    }
  } else if (style.spokes) {
    const n = style.spokes;
    const mesh = style.name === 'Star Mesh';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (mesh) {
        // star mesh: a V of thin spokes per arm
        for (const off of [-0.2, 0.2]) {
          const b = a + off;
          P.rod('rim', [fx, Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25], [fx - 0.005, Math.cos(b) * R * 0.95, Math.sin(b) * R * 0.95], r * 0.045, WHITE, 5);
        }
      } else {
        // tapered spoke, concave: the outer end steps back into the barrel
        const sp = taperedSpoke(R * 0.78, r * 0.2, r * 0.12, 0.022);
        P.add('rim', sp, new THREE.Matrix4().makeRotationX(a).multiply(mat4([fx, R * 0.2, 0], [0, 0, 0])), WHITE);
      }
    }
  } else {
    // stock steelie: a pressed dish with a raised ring and four windows'
    // worth of shadow, painted in the rim colour
    P.cyl('rim', R * 0.98, R * 0.98, 0.01, [face * 0.8, 0, 0], [0, 0, Math.PI / 2], WHITE, 28);
    P.torus('rim', R * 0.62, 0.012, [face * 0.8 + 0.006, 0, 0], [0, Math.PI / 2, 0], WHITE, Math.PI * 2, 5, 22);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      P.cyl('rim', R * 0.13, R * 0.13, 0.004, [face * 0.8 + 0.004, Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78], [0, 0, Math.PI / 2], DARK, 10);
    }
  }
  // hub, centre cap and nuts
  P.cyl('rim', r * 0.2, r * 0.23, 0.03, [fx + 0.008, 0, 0], [0, 0, Math.PI / 2], WHITE, 16);
  P.sphere('rim', r * 0.1, [fx + 0.022, 0, 0], DIM, 10, 6, [0.5, 1, 1]);
  const nuts = style.spokes || 4;
  for (let i = 0; i < Math.max(4, nuts); i++) {
    const a = (i / Math.max(4, nuts)) * Math.PI * 2 + 0.3;
    P.cyl('rim', r * 0.035, r * 0.035, 0.016, [fx + 0.022, Math.cos(a) * r * 0.14, Math.sin(a) * r * 0.14], [0, 0, Math.PI / 2], DIM, 6);
  }
  const g = P.build().rim;
  rimGeoCache.set(key, g);
  return g;
}

// box spoke running radially (+y) from the hub, narrowing toward the rim and
// stepping back in x (concave face)
function taperedSpoke(len, w0, w1, depth) {
  const g = new THREE.BoxGeometry(depth, len, 1, 1, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len + 0.5; // 0 hub → 1 rim
    p.setZ(i, p.getZ(i) * (w0 + (w1 - w0) * t));
    p.setX(i, p.getX(i) - t * t * depth * 1.4);
    p.setY(i, p.getY(i) + len / 2);
  }
  g.computeVertexNormals();
  return g;
}

// Brake: a drilled-look disc and a caliper at the top-rear, in the accent
// colour. Doesn't spin (the caliper is bolted to the upright).
const brakeCache = new Map();
export function brakeGeo(r, w, caliper) {
  const key = k3(r, w, caliper);
  if (brakeCache.has(key)) return brakeCache.get(key);
  const P = new Parts();
  P.cyl('b', r * 0.5, r * 0.5, 0.012, [w * 0.05, 0, 0], [0, 0, Math.PI / 2], '#8a9099', 22);
  P.cyl('b', r * 0.22, r * 0.22, 0.03, [w * 0.08, 0, 0], [0, 0, Math.PI / 2], '#50555e', 12);
  P.box('b', [0.035, r * 0.26, r * 0.34], [w * 0.06, r * 0.4, -r * 0.18], [0.45, 0, 0], caliper, 0.008);
  const g = P.build().b;
  brakeCache.set(key, g);
  return g;
}

// ------------------------------------------------------------- suspension
// Unit-length parts stretched between their ends every frame.
let _susp = null;
export function suspGeos() {
  if (_susp) return _susp;
  // coil along +y, 0..1 long: 7 turns, 10 segments a turn, 4-sided tube
  const turns = 7, per = 10, pts = [];
  for (let i = 0; i <= turns * per; i++) {
    const a = (i / per) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.028, i / (turns * per), Math.sin(a) * 0.028));
  }
  const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * per, 0.0065, 4, false);
  // damper: body, shaft and a reservoir cap, 0..1 along +y
  const D = new Parts();
  D.cyl('d', 0.014, 0.014, 0.55, [0, 0.3, 0], [0, 0, 0], '#c9ced6', 8);
  D.cyl('d', 0.006, 0.006, 0.45, [0, 0.75, 0], [0, 0, 0], '#e8ecf2', 6);
  D.cyl('d', 0.018, 0.018, 0.06, [0, 0.97, 0], [0, 0, 0], '#2a2d33', 8);
  // A-arm: two rods converging from the chassis pivots to the hub, 0..1 on x
  const A = new Parts();
  A.rod('a', [0, 0, 0.05], [1, 0, 0.004], 0.008, '#2a2d33', 5);
  A.rod('a', [0, 0, -0.05], [1, 0, -0.004], 0.008, '#2a2d33', 5);
  A.box('a', [0.08, 0.012, 0.03], [0.96, 0, 0], [0, 0, 0], '#2a2d33', 0.004);
  _susp = { coil, damper: D.build().d, arm: A.build().a };
  return _susp;
}

// ------------------------------------------------------------- driver
// The tiny racer, origin at the hips, facing +z: helmet (painted in the
// accent), a tinted visor, and a suited torso with arms out to a wheel.
let _driver = null;
export function driverGeos() {
  if (_driver) return _driver;
  const S = new Parts();
  // torso: a capsule leaning back into the seat
  S.add('s', new THREE.CapsuleGeometry(0.048, 0.06, 4, 10), mat4([0, 0.07, -0.01], [-0.2, 0, 0], [1.08, 1, 0.82]), COL.suit);
  S.cyl('s', 0.026, 0.03, 0.03, [0, 0.13, 0], [0, 0, 0], COL.suit, 8); // neck roll
  // arms: shoulder → hands on the wheel
  for (const s of [-1, 1]) {
    S.rod('s', [s * 0.052, 0.1, -0.005], [s * 0.05, 0.07, 0.06], 0.017, COL.suit, 6);
    S.rod('s', [s * 0.05, 0.07, 0.06], [s * 0.036, 0.085, 0.1], 0.015, COL.suit, 6);
    S.sphere('s', 0.016, [s * 0.034, 0.087, 0.104], COL.glove, 6, 5);
  }
  // steering wheel on its column
  S.torus('s', 0.04, 0.0065, [0, 0.085, 0.108], [0.35, 0, 0], COL.black, Math.PI * 2, 5, 16);
  S.rod('s', [0, 0.078, 0.115], [0, 0.04, 0.2], 0.006, COL.black, 5);
  // helmet shell, with a chin bar
  const H = new Parts();
  H.sphere('h', 0.068, [0, 0.19, 0], '#ffffff', 16, 12, [1, 1, 1.08]);
  H.box('h', [0.1, 0.03, 0.05], [0, 0.155, 0.045], [0.2, 0, 0], '#ffffff', 0.012);
  // visor: a band of a slightly larger sphere across the face
  const V = new Parts();
  const vis = new THREE.SphereGeometry(0.0705, 16, 6, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.2);
  V.geo('v', vis, [0, 0.19, 0.004], [0, 0, 0], '#0e1218', [1, 1, 1.08]);
  _driver = { suit: S.build().s, helmet: H.build().h, visor: V.build().v };
  return _driver;
}
