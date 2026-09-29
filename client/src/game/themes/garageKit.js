// Garage Zero's toolbox: a tiny geometry kit, the shared materials it draws
// with, and the procedural canvas textures the garage theme needs
// (themes/garage.jsx). Nothing here is an asset file.
//
// Why a kit: the garage is dense with small things (sawhorse legs, shelf
// wires, hinges, handles, bolts) and at 18 cm car scale every one of them is
// in frame. Drawn as individual meshes that is thousands of draw calls. So a
// piece is authored as a list of primitives in METERS, each tagged with a
// material slot and a colour, and merged into one geometry per slot (colour
// rides in the vertex colours). A workbench with forty parts is three draws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from '@rc/shared';
import { fabricNormal, orangePeel, woodNormal } from '../textures.js';

// ------------------------------------------------------------- materials
// One material per slot, shared by every garage piece and prop.
const slotMats = {};
const MAKE = {
  matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
  satin: () => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.5, normalMap: orangePeel('gk-satin', 0.5, [3, 3]), normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  gloss: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, envMapIntensity: 1.2 }),
  metal: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.8 }),
  chrome: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 1, envMapIntensity: 1.4 }),
  fabric: () => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, normalMap: fabricNormal([2, 2]), normalScale: new THREE.Vector2(0.8, 0.8),
  }),
  // wood grain in world metres (the kit writes metre UVs): a pale grain the
  // vertex colour tints to pine, plywood, maple or walnut
  wood: () => new THREE.MeshStandardMaterial({
    vertexColors: true, map: grainTex(), normalMap: woodNormal([1.4, 1.4]), normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.72,
  }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  // practical bulbs (string lights, lamp shades, the lava lamp): the dressing
  // dims this one with the hour — on but modest by day, blazing at night
  warm: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: () => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.42, envMapIntensity: 1.8, depthWrite: false,
  }),
};
export function slotMat(slot) {
  if (!slotMats[slot]) slotMats[slot] = MAKE[slot]();
  return slotMats[slot];
}
// a theme file can add its own textured slots (wall finishes, shingles…)
export function defineSlot(slot, make, noShadow = false) {
  if (!MAKE[slot]) MAKE[slot] = make;
  if (noShadow) NO_SHADOW.add(slot);
}

// Pale wood grain: long streaks with a faint plank joint every 18 cm, light
// enough that a vertex colour can take it anywhere from plywood to walnut.
let _grain = null;
function grainTex() {
  if (_grain) return _grain;
  _grain = canvasTex(256, 256, (g, W, H) => {
    const r = rng(5);
    g.fillStyle = '#f2e6d2'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
      const y = r() * H;
      g.strokeStyle = `rgba(${150 + r() * 50 | 0},${100 + r() * 40 | 0},${50 + r() * 30 | 0},${0.08 + r() * 0.14})`;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + r() * 6 - 3, W * 0.7, y + r() * 6 - 3, W, y); g.stroke();
    }
    for (let k = 0; k < 3; k++) {
      g.fillStyle = 'rgba(190,150,100,0.25)';
      g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 5, 2 + r() * 2, 0, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [1.4, 1.4] });
  return _grain;
}
// slots that should not throw a shadow (emissive bits, glass)
export const NO_SHADOW = new Set(['glow', 'glass', 'warm']);

// ------------------------------------------------------------------- kit
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// A box's UVs in metres, so a textured slot tiles at the same density on a
// 2 m desk and a 5 cm batten (BoxGeometry faces are 0..1 whatever their size).
function metreUVs(g, w, h, d) {
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z — four vertices each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

function prep(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  _c.set(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.morphAttributes = {};
  return g;
}

// kit() → an object you add primitives to (metres, local frame), then
// build() → { slot: BufferGeometry } in world units, ready for <mesh>.
export function kit() {
  const parts = {};
  const push = (slot, geo, color, pos, rot, scl) => {
    pos = pos || [0, 0, 0]; rot = rot || [0, 0, 0]; scl = scl || [1, 1, 1];
    const g = prep(geo, color);
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    _m.compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(...scl));
    g.applyMatrix4(_m);
    (parts[slot] ||= []).push(g);
    return api;
  };
  const api = {
    add: push,
    // a box w×h×d centred at pos (r > 0 rounds its edges)
    box(slot, [w, h, d], pos, color, rot, r = 0) {
      const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.48)) : metreUVs(new THREE.BoxGeometry(w, h, d), w, h, d);
      return push(slot, g, color, pos, rot);
    },
    // a box given by its min/max corners (handy for frames)
    span(slot, [x0, y0, z0], [x1, y1, z1], color) {
      return api.box(slot, [x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color);
    },
    cyl(slot, rt, rb, h, pos, color, rot, seg = 12, open = false) {
      return push(slot, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), color, pos, rot);
    },
    // a round bar from a to b (metres)
    rod(slot, a, b, r, color, seg = 6) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const len = A.distanceTo(B);
      const g = prep(new THREE.CylinderGeometry(r, r, len, seg, 1, true), color);
      const dir = B.clone().sub(A).normalize();
      _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(_m);
      (parts[slot] ||= []).push(g);
      return api;
    },
    // a square-section bar from a to b
    bar(slot, a, b, t, color) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const len = A.distanceTo(B);
      const g = prep(metreUVs(new THREE.BoxGeometry(t, len, t), t, len, t), color);
      _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(_m);
      (parts[slot] ||= []).push(g);
      return api;
    },
    sphere(slot, r, pos, color, scl = [1, 1, 1], seg = 12) {
      return push(slot, new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0)), color, pos, [0, 0, 0], scl);
    },
    torus(slot, r, tube, pos, color, rot, seg = 16, arc = Math.PI * 2) {
      return push(slot, new THREE.TorusGeometry(r, tube, 6, seg, arc), color, pos, rot);
    },
    // a flat panel facing +z (rotate it where it should face)
    plane(slot, w, h, pos, color, rot) {
      return push(slot, new THREE.PlaneGeometry(w, h), color, pos, rot);
    },
    // an extruded 2D outline (x, y in metres) of the given depth, centred on z
    extrude(slot, pts, depth, pos, color, rot, bevel = 0) {
      const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(s, {
        depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6,
      });
      g.translate(0, 0, -(depth - bevel * 2) / 2);
      return push(slot, g, color, pos, rot);
    },
    build(scale = M) {
      const out = {};
      for (const [slot, list] of Object.entries(parts)) {
        const g = mergeGeometries(list, false);
        g.scale(scale, scale, scale);
        g.computeBoundingSphere();
        g.computeBoundingBox();
        out[slot] = g;
      }
      return out;
    },
  };
  return api;
}

// Built kits are cached by a key, so twelve identical cans share one geometry.
const built = new Map();
export function cached(key, make) {
  let g = built.get(key);
  if (!g) { g = make(); built.set(key, g); }
  return g;
}

// --------------------------------------------------------------- canvases
export function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// deterministic noise for canvases (the same garage on every machine)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HAND = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", "Segoe Print", cursive';
const BLOCK = '"Arial Narrow", "Barlow Condensed", Arial, sans-serif';

// Wall finishes: one texture tile per metre of wall (UVs are in metres).
export const FINISH_TEX = {
  // painted plasterboard: barely-there roller texture
  house: () => canvasTex(128, 128, (g) => {
    const r = rng(3);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = 238 + (r() * 17 | 0);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * 128, r() * 128, 2, 2);
    }
  }, { repeat: [1, 1] }),
  // unpainted garage drywall: grey-cream board, a white joint-compound stripe
  // every 1.2 m and rows of screw dimples
  drywall: () => canvasTex(256, 128, (g) => {
    const r = rng(7);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 1400; i++) {
      const v = 226 + (r() * 22 | 0);
      g.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
      g.fillRect(r() * 256, r() * 128, 2, 2);
    }
    // the taped joint: a soft wide band, feathered
    const grd = g.createLinearGradient(0, 0, 44, 0);
    grd.addColorStop(0, 'rgba(255,255,252,0)');
    grd.addColorStop(0.5, 'rgba(255,255,252,0.95)');
    grd.addColorStop(1, 'rgba(255,255,252,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 44, 128);
    g.fillStyle = 'rgba(150,140,120,0.5)';
    for (let y = 8; y < 128; y += 26) { g.fillRect(64, y, 2, 2); g.fillRect(128, y + 6, 2, 2); g.fillRect(192, y, 2, 2); }
  }, { repeat: [1 / 1.2, 1] }),
  // horizontal lap siding: 18 cm boards with a shadow line under each
  siding: () => canvasTex(64, 256, (g) => {
    const r = rng(11);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 256);
    for (let b = 0; b < 4; b++) {
      const y0 = b * 64;
      const grd = g.createLinearGradient(0, y0, 0, y0 + 64);
      grd.addColorStop(0, '#d9dcdc'); grd.addColorStop(0.12, '#ffffff'); grd.addColorStop(1, '#eceeee');
      g.fillStyle = grd; g.fillRect(0, y0, 64, 64);
      g.fillStyle = 'rgba(40,50,60,0.45)'; g.fillRect(0, y0 + 60, 64, 4);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * 64, y0 + r() * 60, 6, 1); }
    }
  }, { repeat: [1, 1 / 0.72] }),
};

// Whiteboards, the kanban, the burndown, the pegboard: canvases drawn once.
export const BOARD_TEX = {
  arch: () => canvasTex(1024, 512, (g, W, H) => {
    whiteboard(g, W, H);
    g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round';
    const boxy = (x, y, w, h, label, col = '#1d4fa8') => {
      g.strokeStyle = col; g.strokeRect(x, y, w, h);
      g.fillStyle = col; g.font = `bold 30px ${HAND}`; g.textAlign = 'center'; g.fillText(label, x + w / 2, y + h / 2 + 10);
    };
    const arrow = (x0, y0, x1, y1, col = '#222') => {
      g.strokeStyle = col; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 18 * Math.cos(a - 0.4), y1 - 18 * Math.sin(a - 0.4));
      g.moveTo(x1, y1); g.lineTo(x1 - 18 * Math.cos(a + 0.4), y1 - 18 * Math.sin(a + 0.4)); g.stroke();
    };
    g.fillStyle = '#222'; g.font = `bold 44px ${HAND}`; g.textAlign = 'left';
    g.fillText('ARCHITECTURE v7 (final) (real)', 40, 64);
    boxy(40, 120, 170, 80, 'app');
    boxy(300, 110, 190, 100, 'API gw');
    boxy(580, 90, 170, 80, 'auth');
    boxy(580, 230, 170, 80, 'queue');
    boxy(820, 150, 160, 100, 'DB', '#b3261e');
    boxy(300, 330, 190, 90, 'workers', '#11793b');
    arrow(210, 160, 300, 160); arrow(490, 150, 580, 130); arrow(490, 170, 580, 260);
    arrow(750, 270, 820, 220); arrow(750, 130, 820, 180); arrow(665, 310, 480, 360, '#11793b');
    g.strokeStyle = '#b3261e'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(900, 200, 110, 75, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#b3261e'; g.font = `bold 34px ${HAND}`; g.fillText('SPOF?!', 830, 320);
    g.fillStyle = '#222'; g.font = `28px ${HAND}`; g.fillText('k8s?? — no. just ONE box', 40, 470);
    g.fillText('cache ↗ later', 600, 440);
  }),
  demo: () => canvasTex(1024, 512, (g, W, H) => {
    whiteboard(g, W, H);
    g.fillStyle = '#b3261e'; g.font = `bold 92px ${HAND}`; g.textAlign = 'center';
    g.fillText('DEMO DAY', W / 2, 130);
    g.font = `bold 70px ${HAND}`; g.fillText('IN 3 DAYS', W / 2, 220);
    g.strokeStyle = '#b3261e'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(250, 240); g.bezierCurveTo(400, 262, 620, 250, 780, 236); g.stroke();
    g.fillStyle = '#1d4fa8'; g.font = `36px ${HAND}`; g.textAlign = 'left';
    ['☐ fix login', '☑ pitch deck', '☐ stop the car leaking', '☐ sleep'].forEach((t, i) => g.fillText(t, 90, 320 + i * 46));
    g.fillStyle = '#222'; g.font = `30px ${HAND}`; g.fillText('investors ♥ graphs →', 600, 330);
    g.strokeStyle = '#11793b'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(620, 470); g.lineTo(720, 440); g.lineTo(800, 450); g.lineTo(900, 350); g.lineTo(960, 360); g.stroke();
  }),
  kanban: () => canvasTex(640, 400, (g, W, H) => {
    // cork board, three columns of sticky notes: TODO 23, DOING 7, DONE 1
    g.fillStyle = '#b98f5e'; g.fillRect(0, 0, W, H);
    const r = rng(19);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${90 + r() * 60 | 0},${60 + r() * 40 | 0},30,0.35)`; g.fillRect(r() * W, r() * H, 2, 2); }
    g.strokeStyle = '#6d4a26'; g.lineWidth = 14; g.strokeRect(0, 0, W, H);
    const cols = [['TODO', 23, 0], ['DOING', 7, 1], ['DONE', 1, 2]];
    const colours = ['#ffe27a', '#ff9fb3', '#9fe0ff', '#b8f28c', '#ffc27a'];
    for (const [name, n, c] of cols) {
      const x0 = 24 + c * 205;
      g.fillStyle = '#fbfaf5'; g.fillRect(x0 + 20, 20, 150, 40);
      g.fillStyle = '#222'; g.font = `bold 30px ${BLOCK}`; g.textAlign = 'center'; g.fillText(`${name} ${n}`, x0 + 95, 50);
      for (let k = 0; k < n; k++) {
        const x = x0 + 8 + (k % 4) * 46 + r() * 6, y = 76 + Math.floor(k / 4) * 50 + r() * 6;
        g.save(); g.translate(x + 20, y + 20); g.rotate((r() - 0.5) * 0.3);
        g.fillStyle = colours[(k + c) % colours.length]; g.fillRect(-20, -20, 40, 40);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-14, -8, 26, 2); g.fillRect(-14, 0, 20, 2);
        g.restore();
      }
    }
  }),
  burndown: () => canvasTex(900, 550, (g, W, H) => {
    whiteboard(g, W, H);
    g.fillStyle = '#222'; g.font = `bold 44px ${HAND}`; g.textAlign = 'left'; g.fillText('BURNDOWN — sprint 57', 40, 60);
    g.strokeStyle = '#222'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(80, 90); g.lineTo(80, 480); g.lineTo(860, 480); g.stroke();
    g.setLineDash([16, 14]); g.strokeStyle = '#1d4fa8'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(80, 110); g.lineTo(840, 470); g.stroke(); g.setLineDash([]);
    // the real line: goes the wrong way
    g.strokeStyle = '#b3261e'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(80, 110);
    [[180, 150], [260, 140], [340, 200], [420, 170], [500, 120], [580, 150], [660, 100], [740, 95]].forEach(([x, y]) => g.lineTo(x, y));
    g.stroke();
    g.fillStyle = '#b3261e'; g.font = `bold 34px ${HAND}`; g.fillText('scope creep :(', 520, 240);
    g.fillStyle = '#222'; g.font = `28px ${HAND}`; g.fillText('ideal', 700, 430);
  }),
  pegboard: () => canvasTex(1024, 342, (g, W, H) => {
    // perforated hardboard with the tools hung on it and their outlines drawn
    g.fillStyle = '#b48a5a'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(40,24,10,0.85)';
    for (let x = 9; x < W; x += 18) for (let y = 9; y < H; y += 18) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    const tool = (draw, x, y, s, col) => {
      g.save(); g.translate(x, y); g.scale(s, s);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.fillStyle = 'rgba(0,0,0,0)'; draw(true); // marker outline
      g.translate(-4, -4); g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; draw(false);
      g.restore();
    };
    const hammer = () => { g.fillRect(-6, 0, 12, 120); g.strokeRect(-6, 0, 12, 120); g.fillRect(-30, -12, 60, 22); g.strokeRect(-30, -12, 60, 22); };
    const wrench = () => {
      g.fillRect(-6, 0, 12, 130); g.strokeRect(-6, 0, 12, 130);
      g.beginPath(); g.arc(0, -8, 18, 0.9, Math.PI * 2 + 0.3); g.fill(); g.stroke();
    };
    const saw = () => {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(150, 30); g.lineTo(150, 60); g.lineTo(0, 60); g.closePath(); g.fill(); g.stroke();
      g.fillRect(-40, 5, 44, 50); g.strokeRect(-40, 5, 44, 50);
    };
    const screwdriver = () => { g.fillRect(-9, 0, 18, 50); g.strokeRect(-9, 0, 18, 50); g.fillRect(-3, 50, 6, 70); };
    const pliers = () => {
      g.beginPath(); g.moveTo(-4, 0); g.lineTo(-14, 110); g.lineTo(-4, 110); g.lineTo(2, 30); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(4, 0); g.lineTo(14, 110); g.lineTo(4, 110); g.lineTo(-2, 30); g.closePath(); g.fill(); g.stroke();
    };
    tool(hammer, 90, 70, 1.4, '#6d4a2a');
    tool(wrench, 190, 60, 1.3, '#a9b1ba'); tool(wrench, 240, 70, 1.1, '#a9b1ba'); tool(wrench, 282, 80, 0.9, '#a9b1ba');
    tool(saw, 360, 90, 1.3, '#c8261e');
    tool(screwdriver, 640, 70, 1.3, '#e8b21f'); tool(screwdriver, 690, 70, 1.3, '#c8261e'); tool(screwdriver, 740, 70, 1.3, '#2b6cc4');
    tool(pliers, 820, 60, 1.3, '#c8261e'); tool(pliers, 900, 60, 1.2, '#2b6cc4');
    // a reel of blue tape and a coil of extension lead
    g.fillStyle = '#2b6cc4'; g.beginPath(); g.arc(580, 260, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b48a5a'; g.beginPath(); g.arc(580, 260, 16, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f07a1a'; g.lineWidth = 9;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(930, 250, 50 - k * 4, 60 - k * 3, 0.2, 0, Math.PI * 2); g.stroke(); }
  }),
  server: () => canvasTex(300, 424, (g, W, H) => {
    // an A4 sheet taped by the laundry door, printed and then corrected
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center';
    g.font = `bold 46px ${BLOCK}`; g.fillText('SERVER', W / 2, 80); g.fillText('ROOM', W / 2, 130);
    g.font = `26px ${BLOCK}`; g.fillText('DO NOT UNPLUG', W / 2, 190); g.fillText('ANYTHING', W / 2, 222);
    g.fillStyle = '#b3261e'; g.font = `bold 30px ${HAND}`;
    g.save(); g.translate(W / 2, 300); g.rotate(-0.08); g.fillText('(also: laundry)', 0, 0); g.fillText('no hot washes', 0, 40); g.restore();
    g.fillStyle = 'rgba(230,220,160,0.7)'; g.fillRect(W / 2 - 50, -6, 100, 26); g.fillRect(W / 2 - 50, H - 20, 100, 26);
  }),
  poster: () => canvasTex(350, 500, (g, W, H) => {
    // the founder's motivational poster, lightly ironic
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1d2f5a'); grd.addColorStop(1, '#e8743a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe9b0'; g.beginPath(); g.arc(W / 2, H * 0.58, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#10182c'; g.beginPath(); g.moveTo(0, H * 0.72); g.lineTo(W * 0.3, H * 0.5); g.lineTo(W * 0.55, H * 0.66); g.lineTo(W * 0.8, H * 0.44); g.lineTo(W, H * 0.6); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center';
    g.font = `bold 52px ${BLOCK}`; g.fillText('SHIP IT', W / 2, 90);
    g.font = `20px ${BLOCK}`; g.fillText('THEN FIX IT', W / 2, 124);
    g.font = `16px ${BLOCK}`; g.fillText('DAY 1 · 2024', W / 2, H - 24);
  }),
  hq: () => canvasTex(512, 136, (g, W, H) => {
    // hand-painted plywood: "HQ" and the company name, a little wonky
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#d2a86e'); grd.addColorStop(0.5, '#dcb47c'); grd.addColorStop(1, '#c99e66');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const r = rng(23);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(120,80,40,${0.1 + r() * 0.15})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = r() * H; g.moveTo(0, y); g.bezierCurveTo(W / 3, y + 6, W * 2 / 3, y - 6, W, y + r() * 4); g.stroke(); }
    g.save(); g.translate(W / 2, H / 2 + 6); g.rotate(-0.03);
    g.fillStyle = '#1b3b6b'; g.font = `bold 80px ${HAND}`; g.textAlign = 'center';
    g.fillText('ZERO HQ', 0, 22);
    g.restore();
    g.fillStyle = '#c8261e'; g.font = `bold 20px ${HAND}`; g.fillText('est. day 1', 28, H - 14);
  }),
};

function whiteboard(g, W, H) {
  g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, W, H);
  const r = rng(W + H);
  // ghosts of every diagram that was ever wiped off
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(90,110,140,${0.05 + r() * 0.06})`; g.lineWidth = 3 + r() * 6;
    g.beginPath(); g.moveTo(r() * W, r() * H); g.bezierCurveTo(r() * W, r() * H, r() * W, r() * H, r() * W, r() * H); g.stroke();
  }
}

// The neon: text drawn soft on black, used as an additive glow with the
// tubes themselves drawn crisp over it.
export function neonTex(text, color) {
  return canvasTex(768, 200, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.font = `italic bold 128px "Brush Script MT", ${HAND}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 38;
    g.fillStyle = color;
    g.fillText(text, W / 2, H / 2 + 6);
    g.shadowBlur = 12;
    g.fillStyle = '#ffe0ef';
    g.fillText(text, W / 2, H / 2 + 6);
  });
}

// Chalk on the driveway: the grid boxes, FINISH, the hopscotch. Drawn white
// on transparent and laid flat.
export function chalkTex(kind) {
  if (kind === 'finish') {
    // laid with canvas-right = east (the way the race runs): a chequered
    // band down the canvas (across the drive), FINISH written sideways so it
    // reads from the driver's seat, chevrons pointing on
    return canvasTex(512, 512, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      const r = rng(29);
      const s = 32;
      for (let x = 224; x < 288; x += s) for (let y = 0; y < H; y += s) {
        if (((x / s) + (y / s)) % 2 < 1) continue;
        g.fillStyle = `rgba(250,250,245,${0.7 + r() * 0.2})`; g.fillRect(x + r() * 2, y + r() * 2, s - 2, s - 2);
      }
      g.save(); g.translate(150, H / 2); g.rotate(Math.PI / 2 + 0.04);
      g.fillStyle = 'rgba(255,240,120,0.85)'; g.font = `bold 84px ${HAND}`; g.textAlign = 'center'; g.fillText('FINISH', 0, 30);
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(340, 110 + k * 140); g.lineTo(380, 140 + k * 140); g.lineTo(340, 170 + k * 140); g.stroke(); }
    }, { aniso: 8 });
  }
  if (kind === 'hopscotch') {
    return canvasTex(256, 512, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,190,220,0.85)'; g.lineWidth = 7; g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = `bold 48px ${HAND}`; g.textAlign = 'center';
      const cells = [[1, 0], [1, 1], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4], [1, 5]];
      cells.forEach(([cx, cy], i) => {
        const w = cx === 1 ? 84 : 80, x = cx === 1 ? 86 : cx === 0 ? 46 : 130;
        const y = H - 70 - cy * 70;
        g.strokeRect(x, y, w, 66); g.fillText(String(i + 1), x + w / 2, y + 50);
      });
      g.beginPath(); g.arc(128, 64, 50, Math.PI, 0); g.stroke();
    }, { aniso: 8 });
  }
  // the grid: boxes open toward the finish (canvas right = east), numbered
  // front row first and written to read from the driver's seat
  return canvasTex(512, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 6;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      const x = 20 + (3 - row) * 124, y = 16 + col * 78;
      g.beginPath(); g.moveTo(x + 104, y); g.lineTo(x, y); g.lineTo(x, y + 66); g.lineTo(x + 104, y + 66); g.stroke();
      g.save(); g.translate(x + 30, y + 33); g.rotate(Math.PI / 2);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = `bold 34px ${HAND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(row * 3 + (2 - col) + 1), 0, 0);
      g.restore();
    }
  }, { aniso: 8 });
}

// Screens on the dev pit's monitors are the office's; the TV gets its own:
// a paused video call grid, faces as blobs.
export function tvTex() {
  return canvasTex(512, 288, (g, W, H) => {
    g.fillStyle = '#10141c'; g.fillRect(0, 0, W, H);
    const cols = ['#5a7fa8', '#8a6a5a', '#6a8a6a', '#8a7aa8', '#a88a5a', '#5a8a8a'];
    for (let i = 0; i < 6; i++) {
      const x = 12 + (i % 3) * 164, y = 14 + Math.floor(i / 3) * 132;
      g.fillStyle = '#26303f'; g.fillRect(x, y, 156, 122);
      g.fillStyle = cols[i]; g.beginPath(); g.arc(x + 78, y + 58, 30, 0, Math.PI * 2); g.fill();
      g.fillRect(x + 38, y + 90, 80, 32);
      g.fillStyle = '#ffffff'; g.font = '14px Arial'; g.fillText(['founder', 'VC (muted)', 'Priya', 'dev #2', 'mom', 'intern'][i], x + 6, y + 116);
    }
  });
}
