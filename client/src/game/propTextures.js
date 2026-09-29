// The props' textures: one shared colour atlas plus a few tiling detail maps.
// Everything procedural, drawn once on first use.
//
// The atlas holds every printed thing a prop carries — the mug slogan, can
// and bottle labels, book covers and page edges, the paper's print, carton
// artwork, the basketball's seams — so all props share one texture and the
// few materials in propKit.jsx. A part either maps into its region or samples
// the white patch, where the texture is a no-op and vertex colour rules.
//
// The detail maps (orange peel, weave, pebble, perforation) live on the
// second UV set, which is in metres (1 UV unit = 1 m, the furniture kit's
// convention): their repeat is 1 / tile size, so one texture sits at the same
// density on a 5 cm pen cap and a 50 cm seat.
import * as THREE from 'three';

const SIZE = 1024;
const PAD = 6; // px between regions: keeps mip levels from bleeding across

// Region sizes in px (w, h) and what's drawn in each; packed into shelves.
// Proportions follow the surface each is wrapped on (mug band 0.27 × 0.07 m,
// A4 sheet 0.21 × 0.297 m...), so print never stretches.
const REGIONS = [
  ['mug', 512, 128, drawMug],
  ['can', 256, 112, drawCan],
  ['canGold', 256, 112, drawCanGold],
  ['paper', 192, 272, drawPaper],
  ['cover', 192, 272, drawCover],
  ['spine', 272, 64, drawSpine],
  ['pages', 272, 64, drawPages],
  ['bottle', 256, 96, drawBottle],
  ['ball', 256, 128, drawBall],
  ['roll', 256, 64, drawRoll],
  ['marble', 128, 64, drawMarble],
  ['snake', 64, 256, drawSnake],
  ['mesh', 128, 128, drawMesh],
  ['white', 48, 48, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }],
  ['keys', 128, 32, drawKeyLegends],
  ['boxSide', 256, 256, drawBoxSide],
  ['boxLabel', 256, 256, drawBoxLabel],
  ['boxFragile', 256, 256, drawBoxFragile],
  ['boxTop', 256, 256, drawBoxTop],
];

// Deterministic noise for the drawings: the atlas looks the same on every
// client and every load.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let atlas = null;

// UV rect of a region: [u0, v0, u1, v1] (v up, like three's texture space).
export function region(name) {
  build();
  return atlas.rects[name];
}

export function atlasTex() {
  build();
  return atlas.tex;
}

function build() {
  if (atlas) return;
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, SIZE, SIZE);
  const rects = {};
  let x = 0, y = 0, rowH = 0;
  for (const [name, w, h, draw] of REGIONS) {
    if (x + w > SIZE) { x = 0; y += rowH + PAD; rowH = 0; }
    // each region on its own canvas, then stamped in: putImageData ignores
    // the transform and clip, so drawing in place would land at the origin
    const rc = document.createElement('canvas');
    rc.width = w; rc.height = h;
    draw(rc.getContext('2d'), w, h);
    g.drawImage(rc, x, y);
    // half a texel in so bilinear filtering never samples the neighbour
    rects[name] = [(x + 0.5) / SIZE, 1 - (y + h - 0.5) / SIZE, (x + w - 0.5) / SIZE, 1 - (y + 0.5) / SIZE];
    x += w + PAD;
    rowH = Math.max(rowH, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  atlas = { tex, rects };
}

// ------------------------------------------------------------- the drawings

function noise(g, w, h, n, alpha, seed, light = true, dark = true) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = r() > 0.5 ? (light ? 255 : 0) : (dark ? 0 : 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(r() * w, r() * h, 1 + r(), 1 + r());
  }
}

// Mug band: the lathe starts at the handle, so u = 0.25 and 0.75 are the two
// faces you see with the handle to one side. Ink on white — the glaze tint
// (instance colour) multiplies it, so a red mug gets dark red lettering.
function drawMug(g, w, h) {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const ink = '#2a2a2e';
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = w * 0.25;
  g.font = 'bold 22px Georgia, serif';
  g.fillText("WORLD'S", cx, h * 0.3);
  g.font = 'bold 30px Georgia, serif';
  g.fillText('OKAYEST', cx, h * 0.54);
  g.font = 'bold 22px Georgia, serif';
  g.fillText('DEV', cx, h * 0.78);
  // the other face: a tiny RC car in a ring — the company logo
  const lx = w * 0.75, ly = h * 0.52;
  g.strokeStyle = ink; g.lineWidth = 4;
  g.beginPath(); g.arc(lx, ly, 34, 0, Math.PI * 2); g.stroke();
  g.fillRect(lx - 20, ly - 6, 40, 12);
  g.fillRect(lx - 10, ly - 14, 20, 10);
  g.beginPath(); g.arc(lx - 11, ly + 8, 6, 0, Math.PI * 2); g.arc(lx + 11, ly + 8, 6, 0, Math.PI * 2); g.fill();
}

// Soda can: red wrap, a white swoosh, the brand across the front.
function drawCan(g, w, h) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#b3131d'); grad.addColorStop(0.5, '#e02a2f'); grad.addColorStop(1, '#a8111b');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, h * 0.72);
  g.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.95, w, h * 0.66); g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic bold 30px system-ui, sans-serif';
  g.fillText('FIZZ', w * 0.25, h * 0.38);
  g.fillText('FIZZ', w * 0.75, h * 0.38);
  g.font = 'bold 10px system-ui, sans-serif';
  g.fillText('330 ml · ORIGINAL', w * 0.5, h * 0.12);
}

// The golden can: embossed lettering on bare gold (the material is gold).
function drawCanGold(g, w, h) {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b89a55'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic bold 30px system-ui, sans-serif';
  g.fillText('FIZZ', w * 0.25, h * 0.45);
  g.fillText('FIZZ', w * 0.75, h * 0.45);
  g.fillRect(0, h * 0.8, w, 3);
  g.fillRect(0, h * 0.14, w, 3);
}

// Top sheet of a paper bundle: a report — heading bar, text, a bar chart.
function drawPaper(g, w, h) {
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
  const r = rng(7);
  g.fillStyle = '#2f5d9e'; g.fillRect(16, 18, w * 0.55, 9);
  g.fillStyle = '#8a8f99';
  let y = 40;
  for (let i = 0; i < 9; i++, y += 9) g.fillRect(16, y, (w - 32) * (0.55 + r() * 0.45), 3);
  // chart
  g.strokeStyle = '#8a8f99'; g.lineWidth = 1;
  g.strokeRect(16, y + 6, w - 32, 70);
  const bars = ['#2f5d9e', '#e0773a', '#2f5d9e', '#4c9a5b', '#2f5d9e', '#e0773a'];
  bars.forEach((c, i) => {
    const bh = 14 + r() * 50;
    g.fillStyle = c; g.fillRect(26 + i * 25, y + 72 - bh, 15, bh);
  });
  y += 88;
  g.fillStyle = '#8a8f99';
  for (let i = 0; i < 8; i++, y += 9) g.fillRect(16, y, (w - 32) * (0.5 + r() * 0.5), 3);
  noise(g, w, h, 400, 0.03, 3);
}

// Hardback cover (tinted per book): cloth grain, a spine-side band and a
// title plate. Light values only — the tint supplies the colour.
function drawCover(g, w, h) {
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 2600, 0.06, 11);
  g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 34, h);
  g.fillStyle = '#f2f2f2'; g.fillRect(36, 0, 3, h);
  g.fillStyle = '#ffffff'; g.fillRect(64, 44, 98, 56);
  g.strokeStyle = '#9a9a9a'; g.lineWidth = 2; g.strokeRect(58, 38, 110, 68);
  g.fillStyle = '#8c8c8c';
  g.fillRect(76, 60, 74, 7); g.fillRect(84, 76, 58, 5);
  g.fillRect(90, h - 42, 46, 4);
}

// Spine: gilt-ish bands at head and tail, a title block between.
function drawSpine(g, w, h) {
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 900, 0.06, 12);
  g.fillStyle = '#f7f1dc';
  for (const x of [14, 22, w - 26, w - 18]) g.fillRect(x, 0, 4, h);
  g.fillStyle = '#9b9b9b'; g.fillRect(70, h * 0.3, 120, h * 0.4);
  g.fillStyle = '#f7f1dc'; g.fillRect(80, h * 0.42, 96, h * 0.16);
}

// Page block edge: hundreds of sheets, fine lines along the length.
function drawPages(g, w, h) {
  g.fillStyle = '#efe7d2'; g.fillRect(0, 0, w, h);
  const r = rng(5);
  for (let y = 0; y < h; y += 1.6) {
    g.fillStyle = `rgba(120,105,80,${0.05 + r() * 0.12})`;
    g.fillRect(0, y, w, 0.7);
  }
}

// Water bottle label: blue band, a white wave, the brand.
function drawBottle(g, w, h) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1d5fae'); grad.addColorStop(1, '#2d8fd6');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9f5ff';
  g.beginPath(); g.moveTo(0, h * 0.7);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.7 + Math.sin(x / 18) * 5);
  g.lineTo(w, h); g.lineTo(0, h); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillText('AQUA', w * 0.3, h * 0.36);
  g.font = 'bold 13px system-ui, sans-serif';
  g.fillText('still · 500 ml', w * 0.3, h * 0.6);
  g.fillText('SPRING WATER', w * 0.78, h * 0.4);
}

// Basketball: equirectangular (u = longitude, v = latitude) orange pebble
// with the eight-panel seams — two great circles and the two curved seams.
function drawBall(g, w, h) {
  const img = g.createImageData(w, h);
  const d = img.data;
  const r = rng(21);
  for (let py = 0; py < h; py++) {
    const lat = (0.5 - (py + 0.5) / h) * Math.PI;
    for (let px = 0; px < w; px++) {
      const lon = ((px + 0.5) / w) * Math.PI * 2;
      // same frame as three's SphereGeometry: x = -cos(lon) cos(lat), z = sin(lon) cos(lat)
      const x = -Math.cos(lon) * Math.cos(lat), y = Math.sin(lat), z = Math.sin(lon) * Math.cos(lat);
      const curve = Math.abs(Math.abs(x) - 0.72 - 0.2 * (y * y - z * z));
      const seam = Math.min(Math.abs(y), Math.abs(z), curve);
      const k = (py * w + px) * 4;
      const peb = 0.9 + r() * 0.14;
      if (seam < 0.028) { d[k] = 26; d[k + 1] = 18; d[k + 2] = 14; }
      else { d[k] = 214 * peb; d[k + 1] = 104 * peb; d[k + 2] = 38 * peb; }
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// Toilet roll: quilted emboss, barely there.
function drawRoll(g, w, h) {
  g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(150,145,135,0.22)';
  for (let y = 4; y < h; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 8; x < w; x += 8) g.fillRect(x, y, 2, 2);
  }
}

// Marble: a cat's-eye vane. Mid grey body, bright swirls — the tint
// (instance colour) makes it red, blue, green...
function drawMarble(g, w, h) {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    g.lineWidth = 7 - i * 2;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * (0.3 + i * 0.2) + Math.sin(x / 11 + i) * 12);
    g.stroke();
  }
}

// Snake plant blade: the pale wavy cross-bands over a darker ground (u across
// the blade, v along it). The greens and the yellow margins are vertex colour.
function drawSnake(g, w, h) {
  g.fillStyle = '#a9a9a9'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let y = 3; y < h; y += 11) {
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin(x / 7 + y * 0.7) * 3);
    for (let x = w; x >= 0; x -= 4) g.lineTo(x, y + 3.5 + Math.sin(x / 7 + y * 0.7 + 1) * 2);
    g.fill();
  }
}

// Task-chair mesh back: dark weave, a fine lighter diamond grid.
function drawMesh(g, w, h) {
  g.fillStyle = '#3b3d42'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(205,210,220,0.24)'; g.lineWidth = 1;
  for (let i = -h; i < w; i += 3) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
  }
}

// Keycap tops: a pale legend blob on dark — sampled per key, it reads as
// printed legends at this scale without any real glyphs.
function drawKeyLegends(g, w, h) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c9ccd2';
  g.fillRect(w * 0.3, h * 0.3, w * 0.12, h * 0.34);
}

function kraft(g, w, h, seed) {
  g.fillStyle = '#c69c64'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 3000, 0.05, seed);
  // the corrugation shows through the liner as faint vertical bands
  g.fillStyle = 'rgba(90,60,30,0.05)';
  for (let x = 0; x < w; x += 5) g.fillRect(x, 0, 2, h);
}

function drawBoxSide(g, w, h) {
  kraft(g, w, h, 31);
  g.fillStyle = '#3a2c20';
  // two "this way up" arrows
  for (const x of [w * 0.34, w * 0.52]) {
    g.fillRect(x - 5, 60, 10, 46);
    g.beginPath(); g.moveTo(x - 16, 64); g.lineTo(x, 40); g.lineTo(x + 16, 64); g.fill();
  }
  g.fillRect(w * 0.26, 110, w * 0.34, 5);
  g.font = 'bold 16px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('THIS SIDE UP', w * 0.43, 140);
  g.font = 'bold 12px system-ui, sans-serif';
  g.fillText('RC-MAYHEM SUPPLY CO.', w * 0.5, h - 40);
  g.strokeStyle = '#3a2c20'; g.lineWidth = 3; g.strokeRect(w * 0.7, 36, 50, 50);
  g.fillText('24', w * 0.7 + 25, 67);
}

function drawBoxLabel(g, w, h) {
  kraft(g, w, h, 32);
  // shipping label: white card, address lines, a barcode
  g.fillStyle = '#f7f6f1'; g.fillRect(40, 56, 150, 104);
  g.fillStyle = '#26262a';
  g.fillRect(50, 66, 80, 7);
  for (let i = 0; i < 4; i++) g.fillRect(50, 82 + i * 9, 60 + (i % 2) * 40, 4);
  const r = rng(9);
  for (let x = 50; x < 180; x += 2 + (r() * 3 | 0)) g.fillRect(x, 124, 1 + (r() * 2 | 0), 28);
  g.fillStyle = '#c0392b'; g.fillRect(150, 64, 32, 14);
  // printed recycling mark
  g.strokeStyle = '#3a2c20'; g.lineWidth = 3;
  g.beginPath(); g.arc(w - 50, h - 50, 18, 0, Math.PI * 2); g.stroke();
}

function drawBoxFragile(g, w, h) {
  kraft(g, w, h, 33);
  g.fillStyle = '#b3261e';
  g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('FRAGILE', w / 2, 70);
  // broken-glass pictogram
  g.strokeStyle = '#b3261e'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(w / 2 - 28, 96); g.lineTo(w / 2 + 28, 96); g.lineTo(w / 2 + 16, 150); g.lineTo(w / 2 - 16, 150); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(w / 2, 96); g.lineTo(w / 2 - 8, 116); g.lineTo(w / 2 + 6, 128); g.stroke();
  g.fillRect(w / 2 - 3, 150, 6, 30); g.fillRect(w / 2 - 18, 178, 36, 6);
}

// Top: the two flaps meet down the middle (u runs across the seam).
function drawBoxTop(g, w, h) {
  kraft(g, w, h, 34);
  g.fillStyle = 'rgba(60,40,20,0.7)'; g.fillRect(w / 2 - 1, 0, 2, h);
  g.fillStyle = 'rgba(60,40,20,0.18)'; g.fillRect(w / 2 - 6, 0, 4, h);
}

// -------------------------------------------------------- detail maps (uv1)
// Height fields differentiated into normal maps, like textures.js does it,
// but kept here: these sample the metre UV set (texture.channel = 1) and a
// shared textures.js texture can't be switched to another channel.

const detailCache = new Map();

function heightToNormal(g, w, h, strength) {
  const src = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h);
  const d = out.data;
  const at = (x, y) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = ((at(x - 1, y) - at(x + 1, y)) / 255) * strength;
      const dy = ((at(x, y - 1) - at(x, y + 1)) / 255) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = ((dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
}

// tile: metres per repeat. normal: differentiate (else it's a scalar map).
function detail(key, px, tile, draw, normal = 0) {
  if (detailCache.has(key)) return detailCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, px, px);
  if (normal) heightToNormal(g, px, px, normal);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tile, 1 / tile);
  tex.channel = 1; // the metre UV set
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  detailCache.set(key, tex);
  return tex;
}

const grey = (g, w, h, v) => { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, w, h); };

// Moulded plastic and glaze: faint orange peel, 6 cm tile.
export const peelNormal = () => detail('peel', 128, 0.06, (g, w, h) => {
  grey(g, w, h, 128);
  const r = rng(41);
  for (let i = 0; i < 500; i++) {
    const x = r() * w, y = r() * h, rad = 3 + r() * 6;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() > 0.5 ? 160 : 96;
    grad.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
}, 0.5);

// Upholstery weave: 16 threads across a 3 cm tile.
export const weaveNormal = () => detail('weave', 64, 0.03, (g, w, h) => {
  grey(g, w, h, 110);
  for (let i = 0; i < w; i += 4) {
    g.fillStyle = 'rgb(190,190,190)';
    g.fillRect(i, 0, 2, h);
    g.fillStyle = 'rgb(160,160,160)';
    g.fillRect(0, i + 2, w, 1);
  }
}, 2.2);

// Basketball pebbling: ~2 mm bumps.
export const pebbleNormal = () => detail('pebble', 64, 0.025, (g, w, h) => {
  grey(g, w, h, 90);
  const r = rng(43);
  g.fillStyle = 'rgb(210,210,210)';
  for (let i = 0; i < 150; i++) { g.beginPath(); g.arc(r() * w, r() * h, 1.6 + r(), 0, Math.PI * 2); g.fill(); }
}, 2.4);

// Perforated steel: round holes on a 6 mm staggered pitch (alpha: white = metal).
export const perfAlpha = () => detail('perf', 64, 0.024, (g, w, h) => {
  grey(g, w, h, 255);
  g.fillStyle = '#000';
  const p = w / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 5; x++) {
      g.beginPath(); g.arc(x * p + (y % 2) * p / 2, y * p + p / 2, p * 0.3, 0, Math.PI * 2); g.fill();
    }
  }
});
