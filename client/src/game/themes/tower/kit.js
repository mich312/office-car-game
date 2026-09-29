// The 48th floor's kit: its materials, its procedural textures and the baker
// that turns every static thing on the floor into a handful of draw calls.
//
// The rule the whole floor follows: a piece of furniture is a list of parts
// (a geometry in metres, a material key, a colour, a local transform), not a
// component full of meshes. The Dressing collects the parts of every piece,
// wall, ramp and fixture on the map, transforms them into place and merges
// them per material — so the whole floor's walnut is one mesh, all of its
// brass another. The cellar corridor costs ~850 draws; this floor's busiest
// view is a fraction of that.
//
// UVs are re-projected in world metres after placement (a box projection on
// each face's dominant axis), so one walnut material shows the same grain
// density on a 20 cm drawer front and an 8 m table top, and the grain runs
// along the long side of whatever it's on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from '@rc/shared';
import { fabricNormal, orangePeel, wearRough, glowTex } from '../../textures.js';

// ------------------------------------------------------------- hashing
// deterministic: the same book is the same colour on every client
export const hash = (n) => {
  let h = (n * 374761393) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------ textures
const texCache = new Map();
export function canvas(key, w, h, draw, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const k = `${key}@${repeat.join('x')}`;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t);
  return t;
}

// Walnut veneer: long wavy grain along u, one 1.6 × 0.4 m flitch per tile.
// Deterministic noise so the grain matches across clients (it's decor, but
// screenshots should be stable).
const walnutTex = () => canvas('twalnut', 512, 256, (g, w, h) => {
  g.fillStyle = '#6a4630';
  g.fillRect(0, 0, w, h);
  let s = 1;
  const r = () => hash(s++);
  // broad colour bands
  for (let i = 0; i < 14; i++) {
    const y = r() * h, hh = 8 + r() * 30;
    g.fillStyle = `rgba(${40 + r() * 40},${24 + r() * 20},${12 + r() * 12},${0.12 + r() * 0.2})`;
    g.fillRect(0, y, w, hh);
  }
  // grain lines: long, gently wandering, wrapping cleanly at the tile edge
  for (let i = 0; i < 150; i++) {
    const y0 = r() * h, amp = 2 + r() * 7, f1 = 1 + Math.floor(r() * 3), ph = r() * 6.28;
    g.strokeStyle = r() > 0.5 ? `rgba(38,22,12,${0.16 + r() * 0.3})` : `rgba(150,105,70,${0.08 + r() * 0.14})`;
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin((x / w) * Math.PI * 2 * f1 + ph) * amp;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  // cathedral figure: a few stacked arches
  for (let k = 0; k < 3; k++) {
    const cx = r() * w, cy = h * (0.2 + r() * 0.6);
    for (let j = 0; j < 7; j++) {
      g.strokeStyle = `rgba(40,24,12,${0.14 + j * 0.02})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(cx, cy, 60 + j * 16, 8 + j * 5, 0, Math.PI * 0.9, Math.PI * 2.1);
      g.stroke();
    }
  }
}, { repeat: [1 / 1.6, 1 / 0.4] });

// White statuary marble for walls and tops: soft grey veins, book-matched
// (the right half mirrors the left), one 1.2 m slab per tile.
const whiteMarbleTex = () => canvas('twhitemarble', 512, 512, (g, w, h) => {
  g.fillStyle = '#eeeae4';
  g.fillRect(0, 0, w, h);
  let s = 404;
  const r = () => hash(s++);
  for (let i = 0; i < 30; i++) {
    const x = r() * w / 2, y = r() * h, rr = 30 + r() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, `rgba(${200 + r() * 30},${198 + r() * 30},${195 + r() * 30},0.3)`);
    grd.addColorStop(1, 'rgba(230,228,224,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w / 2, h);
  }
  // veins: soft, drawn as several passes of widening, fading strokes
  for (let i = 0; i < 9; i++) {
    const pts = [];
    let x = r() * w / 2, y = -20;
    const dx = (r() - 0.5) * 60;
    while (y < h + 20) { pts.push([x, y]); x += dx * 0.3 + (r() - 0.5) * 34; y += 20 + r() * 30; }
    const bold = i < 3;
    for (const [lw, a] of [[9, 0.03], [4, 0.06], [1.4, bold ? 0.4 : 0.18]]) {
      g.strokeStyle = `rgba(140,140,146,${a})`;
      g.lineWidth = lw * (bold ? 1.3 : 0.8);
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
    }
  }
  // book-match: mirror the left half onto the right
  g.save(); g.translate(w, 0); g.scale(-1, 1); g.drawImage(g.canvas, 0, 0, w / 2, h, 0, 0, w / 2, h); g.restore();
}, { repeat: [1 / 1.2, 1 / 1.2] });

// Black marble (Nero Marquina): near-black with bright white veins.
const blackMarbleTex = () => canvas('tblackmarble', 256, 256, (g, w, h) => {
  g.fillStyle = '#1a1a1c';
  g.fillRect(0, 0, w, h);
  let s = 77;
  const r = () => hash(s++);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(230,230,232,${i < 5 ? 0.55 : 0.12 + r() * 0.12})`;
    g.lineWidth = i < 5 ? 1.2 : 0.6;
    g.beginPath();
    let x = r() * w, y = r() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 10; k++) { x += (r() - 0.35) * 50; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
}, { repeat: [1 / 1.2, 1 / 1.2] });

// Honey onyx: translucent banded stone. As an emissive map it reads as the
// backlit reception desk.
const onyxTex = () => canvas('tonyx', 256, 512, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#f3c48a'); grd.addColorStop(0.5, '#ffdcaa'); grd.addColorStop(1, '#e9ae6c');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  let s = 311;
  const r = () => hash(s++);
  for (let i = 0; i < 60; i++) {
    const y0 = r() * h, amp = 6 + r() * 20, ph = r() * 6.28;
    g.strokeStyle = r() > 0.5 ? `rgba(170,92,40,${0.1 + r() * 0.25})` : `rgba(255,240,215,${0.15 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 5;
    g.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = y0 + Math.sin((x / w) * Math.PI * 2 + ph) * amp + Math.sin(x * 0.05 + ph) * 2;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
}, { repeat: [1 / 0.8, 1 / 1.6] });

// Putting green: mown stripes, a fringe, the cup.
export const turfTex = () => canvas('tturf', 512, 256, (g, w, h) => {
  g.fillStyle = '#2f6b33';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect((i * w) / 8, 0, w / 8, h);
  }
  let s = 5;
  for (let i = 0; i < 5000; i++) {
    const v = hash(s++);
    g.fillStyle = v > 0.5 ? 'rgba(180,230,140,0.08)' : 'rgba(10,40,10,0.1)';
    g.fillRect(hash(s++) * w, hash(s++) * h, 1.5, 1.5);
  }
  // fringe
  g.strokeStyle = '#24522a';
  g.lineWidth = 14;
  g.strokeRect(7, 7, w - 14, h - 14);
  // the cup near the east end
  g.fillStyle = '#0c0c0c';
  g.beginPath(); g.arc(w * 0.9, h * 0.5, 9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f2f2f2'; g.lineWidth = 2;
  g.beginPath(); g.arc(w * 0.9, h * 0.5, 9, 0, Math.PI * 2); g.stroke();
}, { wrap: false });

// A Persian rug in oxblood and navy.
export const rugTex = (key, a = '#6b1f1c', b = '#1f2a44') => canvas(`trug${key}`, 512, 384, (g, w, h) => {
  g.fillStyle = a;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d8c39a'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
  g.strokeStyle = b; g.lineWidth = 22; g.strokeRect(40, 40, w - 80, h - 80);
  g.strokeStyle = '#d8c39a'; g.lineWidth = 3; g.strokeRect(58, 58, w - 116, h - 116);
  // border motif
  g.fillStyle = '#c9a86a';
  for (let x = 50; x < w - 40; x += 22) { g.fillRect(x, 36, 6, 8); g.fillRect(x, h - 44, 6, 8); }
  for (let y = 50; y < h - 40; y += 22) { g.fillRect(36, y, 8, 6); g.fillRect(w - 44, y, 8, 6); }
  // central medallion
  g.save();
  g.translate(w / 2, h / 2);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = [b, '#c9a86a', '#8a2a24', '#e8dcc0'][k];
    g.beginPath();
    const R = 110 - k * 26;
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2, rr = i % 2 ? R * 0.72 : R;
      g.lineTo(Math.cos(ang) * rr * 1.25, Math.sin(ang) * rr * 0.85);
    }
    g.closePath(); g.fill();
  }
  g.restore();
  // field speckle and wear
  let s = 99;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = hash(s++) > 0.5 ? 'rgba(255,230,190,0.07)' : 'rgba(0,0,0,0.08)';
    g.fillRect(hash(s++) * w, hash(s++) * h, 2, 2);
  }
}, { wrap: false });

// The compass star inlaid at the start line: black marble and brass on the
// white floor (transparent elsewhere).
export const starTex = () => canvas('tstar', 512, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  const ring = (r, lw, c) => { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(238, 14, '#161618');
  ring(224, 4, '#b8893b');
  const pts = (n, R, r0, rot) => {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? r0 : R;
      g.lineTo(Math.sin(a) * rr, -Math.cos(a) * rr);
    }
    g.closePath();
  };
  pts(8, 170, 48, Math.PI / 8); g.fillStyle = '#b8893b'; g.fill();
  pts(4, 222, 46, 0); g.fillStyle = '#161618'; g.fill();
  g.strokeStyle = '#b8893b'; g.lineWidth = 3; g.stroke();
  ring(30, 10, '#b8893b');
  g.fillStyle = '#161618'; g.font = 'bold 36px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#b8893b'; g.fillText('N', 0, -196);
}, { wrap: false });

// Big abstract canvases for the long walls: colour fields, a Rothko the
// board bought at auction.
export const artTex = (key, cols) => canvas(`tart${key}`, 256, 320, (g, w, h) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, w, h);
  let s = key.length * 31;
  const blocks = [[0.08, 0.06, 0.84, 0.46], [0.08, 0.56, 0.84, 0.36]];
  blocks.forEach(([x, y, bw, bh], i) => {
    g.fillStyle = cols[i + 1];
    g.globalAlpha = 0.92;
    g.fillRect(x * w, y * h, bw * w, bh * h);
    // soft, brushed edges
    for (let k = 0; k < 160; k++) {
      g.globalAlpha = 0.05;
      g.fillRect(x * w + (hash(s++) - 0.5) * 10, y * h + hash(s++) * bh * h, bw * w, 3);
    }
  });
  g.globalAlpha = 1;
}, { wrap: false });

// A sepia world for the globe bar.
export const globeTex = () => canvas('tglobe', 512, 256, (g, w, h) => {
  g.fillStyle = '#c9b48a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8a6a3a';
  for (const [x, y, rx, ry] of CONTINENTS) {
    g.beginPath(); g.ellipse(x * w, y * h, rx * w, ry * h, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(80,50,20,0.35)'; g.lineWidth = 1;
  for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo((i * w) / 12, 0); g.lineTo((i * w) / 12, h); g.stroke(); }
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, (i * h) / 6); g.lineTo(w, (i * h) / 6); g.stroke(); }
}, { wrap: false });

// continents as blobs: [x, y, rx, ry] in 0..1 (equirectangular)
export const CONTINENTS = [
  [0.2, 0.3, 0.09, 0.11], [0.25, 0.22, 0.07, 0.07], [0.29, 0.64, 0.05, 0.14], [0.31, 0.55, 0.04, 0.06],
  [0.5, 0.26, 0.05, 0.07], [0.53, 0.52, 0.06, 0.15], [0.57, 0.4, 0.04, 0.05], [0.66, 0.3, 0.13, 0.1],
  [0.72, 0.42, 0.05, 0.06], [0.84, 0.68, 0.05, 0.05], [0.79, 0.52, 0.03, 0.04], [0.43, 0.14, 0.03, 0.03],
];

// ------------------------------------------------------------ materials
// One registry, built lazily and shared by every map load. Keys are what a
// part names; `vc` materials take their colour from the part.
const matCache = {};
const std = (o) => new THREE.MeshStandardMaterial(o);
const DEFS = {
  walnut: () => std({ map: walnutTex(), roughness: 0.5, envMapIntensity: 0.6 }),
  lacquer: () => std({ map: walnutTex(), color: '#c9b3a6', roughness: 0.14, envMapIntensity: 1.3 }),
  marble: () => std({
    map: whiteMarbleTex(), roughness: 0.14, envMapIntensity: 1.1,
  }),
  blackMarble: () => std({ map: blackMarbleTex(), roughness: 0.1, envMapIntensity: 1.2 }),
  onyx: () => std({ map: onyxTex(), emissiveMap: onyxTex(), emissive: '#ffb366', emissiveIntensity: 0.9, roughness: 0.25 }),
  brass: () => std({ color: '#b8893b', metalness: 1, roughness: 0.3, roughnessMap: wearRough('tbrass', 80, 30, [2, 2]) }),
  bronze: () => std({ color: '#6d4a2a', metalness: 1, roughness: 0.42 }),
  steel: () => std({ color: '#a9adb3', metalness: 0.9, roughness: 0.35, roughnessMap: wearRough('tsteel', 90, 26, [3, 3]) }),
  chrome: () => std({ color: '#dfe4ea', metalness: 1, roughness: 0.12 }),
  anodised: () => std({ color: '#2b2f36', metalness: 0.7, roughness: 0.38 }),
  leather: () => std({ color: '#5a1f1b', roughness: 0.42, normalMap: orangePeel('tleather', 0.8, [6, 6]), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.7 }),
  leatherBlack: () => std({ color: '#1f1b1a', roughness: 0.4, normalMap: orangePeel('tleather', 0.8, [6, 6]), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.7 }),
  fabric: () => std({ vertexColors: true, roughness: 1, normalMap: fabricNormal([4, 4]), normalScale: new THREE.Vector2(0.8, 0.8) }),
  matte: () => std({ vertexColors: true, roughness: 0.62, normalMap: orangePeel('tmatte', 0.5, [2, 2]), normalScale: new THREE.Vector2(0.25, 0.25) }),
  plaster: () => std({ vertexColors: true, roughness: 0.92, normalMap: orangePeel('paint', 0.55, [3, 3]), normalScale: new THREE.Vector2(0.3, 0.3) }),
  gloss: () => std({ vertexColors: true, roughness: 0.16, envMapIntensity: 1.2 }),
  // leather, lacquered plastics: between matte and gloss
  satin: () => std({ vertexColors: true, roughness: 0.42, normalMap: orangePeel('tleather', 0.8, [6, 6]), normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 0.8 }),
  // the ceiling's lights: their brightness follows the hour (the Dressing
  // scales this material's colour)
  lamp: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  metal: () => std({ vertexColors: true, metalness: 0.85, roughness: 0.3 }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  teak: () => std({ map: walnutTex(), color: '#e0b890', roughness: 0.7 }),
  turf: () => std({ map: turfTex(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }),
  rug: () => std({ map: rugTex('a'), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  rug2: () => std({ map: rugTex('b', '#1f2a44', '#6b1f1c'), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  star: () => std({ map: starTex(), transparent: true, roughness: 0.12, envMapIntensity: 1.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
  globe: () => std({ map: globeTex(), roughness: 0.35, envMapIntensity: 0.8 }),
  art1: () => std({ map: artTex('a', ['#2a1714', '#7a1f18', '#b8622a']), roughness: 0.9 }),
  art2: () => std({ map: artTex('b', ['#10182a', '#28406e', '#8a8f9a']), roughness: 0.9 }),
  art3: () => std({ map: artTex('c', ['#2b2620', '#c8a15a', '#5b3a24']), roughness: 0.9 }),
  glass: () => new THREE.MeshPhysicalMaterial({
    color: '#cfe6ee', transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0,
    envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false,
  }),
  // facade glass is tinted: that grey-green high-rise glazing
  facade: () => new THREE.MeshPhysicalMaterial({
    color: '#a9c4c4', transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0,
    envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false,
  }),
  frosted: () => std({ color: '#f2f4f5', transparent: true, opacity: 0.62, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false }),
};
// which baked materials cast shadows (the rest are trim, light, glass)
export const SHADOW_MATS = new Set(['satin', 'walnut', 'lacquer', 'marble', 'blackMarble', 'leather', 'leatherBlack', 'fabric', 'matte',
  'plaster', 'gloss', 'metal', 'anodised', 'steel', 'teak', 'brass', 'bronze', 'onyx']);

export function mat(key) {
  if (!matCache[key]) matCache[key] = DEFS[key]();
  return matCache[key];
}

// --------------------------------------------------------- geometries
// All in metres; the baker scales them into world units.
const geoCache = new Map();
const gk = (...a) => a.map((v) => (typeof v === 'number' ? v.toFixed(4) : String(v))).join('|');
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
export const G = {
  box: (w, h, d, r = 0) => cached(gk('b', w, h, d, r), () => (r > 0
    ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.48))
    : new THREE.BoxGeometry(w, h, d))),
  cyl: (rt, rb, h, seg = 16, open = false) => cached(gk('c', rt, rb, h, seg, open), () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sphere: (r, ws = 16, hs = 12, t0 = 0, tl = Math.PI) => cached(gk('s', r, ws, hs, t0, tl), () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, t0, tl)),
  torus: (R, r, rs = 8, ts = 24, arc = Math.PI * 2) => cached(gk('t', R, r, rs, ts, arc), () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
  ico: (r, d = 1) => cached(gk('i', r, d), () => new THREE.IcosahedronGeometry(r, d)),
  knot: (R, r) => cached(gk('k', R, r), () => new THREE.TorusKnotGeometry(R, r, 96, 10, 2, 3)),
  cone: (r, h, seg = 12) => cached(gk('co', r, h, seg), () => new THREE.ConeGeometry(r, h, seg)),
  plane: (w, h) => cached(gk('p', w, h), () => new THREE.PlaneGeometry(w, h)),
  // a prism: triangle [x, z] points extruded up by h (for wedges and the speakerphone)
  shape: (pts, h, key) => cached(gk('sh', key, h), () => {
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 24 });
    g.rotateX(Math.PI / 2); // extrude along −y… then lift so it spans 0..h
    g.translate(0, h, 0);
    return g;
  }),
};

// ------------------------------------------------------------- parts
// A part list builder: everything in the piece's own frame, metres, +z front.
export function parts() {
  const list = [];
  const api = {
    list,
    add(g, m, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, opt) {
      list.push({ g, m, c, p: [x, y, z], r: [rx, ry, rz], s: [sx, sy, sz], keepUV: opt?.keepUV });
      return api;
    },
    // a box by its centre
    box(m, c, w, h, d, x, y, z, r = 0.006, rx = 0, ry = 0, rz = 0) {
      return api.add(G.box(w, h, d, r), m, c, x, y, z, rx, ry, rz);
    },
    // a box standing on y0
    slab(m, c, w, h, d, x, y0, z, r = 0.006, ry = 0) {
      return api.add(G.box(w, h, d, r), m, c, x, y0 + h / 2, z, 0, ry, 0);
    },
    // an upright cylinder standing on y0
    post(m, c, r, h, x, y0, z, seg = 12, r2 = r) {
      return api.add(G.cyl(r, r2, h, seg), m, c, x, y0 + h / 2, z);
    },
    // a horizontal cylinder along x (axis 'x') or z
    rod(m, c, r, len, x, y, z, axis = 'x', seg = 10) {
      return api.add(G.cyl(r, r, len, seg), m, c, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
    },
  };
  return api;
}

// ------------------------------------------------------------- baking
const _m = new THREE.Matrix4();
const _l = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Vector3();

// The matrix that puts a piece's metre-frame into the world: scale to units,
// turn by rotY, move to (x, y, z) world units.
export function placeMatrix(x, z, rotY = 0, y = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(0, rotY, 0)), _s.set(M, M, M)).clone();
}

// parts × a placement → geometries grouped by material key, UVs in metres
export function bakeInto(groups, list, place) {
  for (const pt of list) {
    let g = pt.g.index ? pt.g.toNonIndexed() : pt.g.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _l.compose(_v.set(...pt.p), _q.setFromEuler(_e.set(...pt.r)), _s.set(...pt.s));
    _m.multiplyMatrices(place, _l);
    g.applyMatrix4(_m);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    _c.set(pt.c || '#ffffff');
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      if (pt.keepUV) continue;
      // world metres, projected on the face's dominant axis
      _n.fromBufferAttribute(nor, i);
      const x = pos.getX(i) / M, y = pos.getY(i) / M, z = pos.getZ(i) / M;
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      if (ay >= ax && ay >= az) uv.setXY(i, x, z);
      else if (ax >= az) uv.setXY(i, z, y);
      else uv.setXY(i, x, y);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    (groups[pt.m] ||= []).push(g);
  }
  return groups;
}

export function mergeGroups(groups) {
  const out = [];
  for (const [key, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const g = mergeGeometries(list, false);
    if (!g) continue;
    g.computeBoundingSphere();
    out.push({ key, geometry: g });
    for (const l of list) l.dispose();
  }
  return out;
}

// a one-off merged geometry for a prop: parts in metres around the body's
// origin (the baker's placement is just the metre→unit scale)
const propGeoCache = new Map();
export function propGeometry(key, build) {
  let v = propGeoCache.get(key);
  if (!v) {
    const p = parts();
    build(p);
    const merged = mergeGroups(bakeInto({}, p.list, placeMatrix(0, 0, 0)));
    v = Object.fromEntries(merged.map((m) => [m.key, m.geometry]));
    propGeoCache.set(key, v);
  }
  return v;
}

export { glowTex };
