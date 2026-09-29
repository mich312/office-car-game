// The cellar's surfaces: procedural canvases (no asset files) and the shared
// materials the static batch draws with. Every texture here is laid in
// metres — the kit gives world-space UVs to the surfaces listed in WORLD_UV —
// so a concrete block is 40 × 20 cm and a floor tile 30 cm wherever it is.
// Randomness is seeded: every client paints the same scuffs.
import * as THREE from 'three';
import { rng } from './cellar-kit.js';

const cache = new Map();
const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};
function tex(key, w, h, draw, { repeat = [1, 1], data = false, wrap = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: data });
  draw(g, w, h, rng(key.length * 7919 + key.charCodeAt(0)));
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// height (red channel) → tangent-space normal, wrapping at the seams
function toNormal(g, w, h, strength) {
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
const normalTex = (key, w, h, draw, strength, repeat) =>
  tex(`n:${key}`, w, h, (g, W, H, r) => { draw(g, W, H, r); toNormal(g, W, H, strength); }, { repeat, data: true });

const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
function speckle(g, w, h, r, n, size, alpha, light = 0.5) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < light ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
}
function blotches(g, w, h, r, n, rad, rgb, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rr = rad * (0.4 + r());
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, `rgba(${rgb},${alpha * (0.4 + r() * 0.6)})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
}

// ------------------------------------------------------------ block walls
// 40 × 20 cm blocks in stretcher bond, painted over (the joints are soft
// hollows, not grout). The texture spans 3.2 m; the lower band's albedo
// spans exactly its 1.4 m height, so the scuffs sit at 0.1–0.4 m everywhere.
const PX = 160; // px per metre on the walls
const courses = (g, W, H, heightM, fn) => {
  for (let row = 0; row * 0.2 < heightM; row++) {
    const y0 = H - (row + 1) * 0.2 * PX; // v = 0 at the bottom of the canvas
    const off = row % 2 ? 0.2 : 0;
    for (let x = -off; x < W / PX; x += 0.4) fn(x * PX, y0, 0.4 * PX, 0.2 * PX, row);
  }
};
export const blockLowTex = () => tex('blockLow', 3.2 * PX, 1.4 * PX, (g, W, H, r) => {
  g.fillStyle = '#6f8578';
  g.fillRect(0, 0, W, H);
  // each block's paint catches the light a hair differently
  courses(g, W, H, 1.4, (x, y, w, h) => {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.035})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(20,32,26,0.28)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  });
  speckle(g, W, H, r, 1600, 1.4, 0.12);
  // grime creeping up from the floor
  const gr = g.createLinearGradient(0, H, 0, H - 0.5 * PX);
  gr.addColorStop(0, 'rgba(30,34,28,0.45)');
  gr.addColorStop(1, 'rgba(30,34,28,0)');
  g.fillStyle = gr;
  g.fillRect(0, H - 0.5 * PX, W, 0.5 * PX);
  // trolley scuffs at 0.1–0.4 m: long black rubber streaks, chipped paint
  for (let i = 0; i < 26; i++) {
    const y = H - (0.1 + r() * 0.3) * PX, x = r() * W, len = (0.15 + r() * 0.7) * PX;
    g.strokeStyle = `rgba(18,18,16,${0.25 + r() * 0.35})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y + (r() - 0.5) * 8, x + len, y + (r() - 0.5) * 10); g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const y = H - (0.08 + r() * 0.35) * PX, x = r() * W;
    g.fillStyle = `rgba(150,150,140,${0.5 + r() * 0.4})`; // chips down to grey block
    g.beginPath(); g.ellipse(x, y, 2 + r() * 7, 1 + r() * 3, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // a gloss paint drip or two under the stripe
  for (let i = 0; i < 5; i++) {
    const x = r() * W, l = (0.05 + r() * 0.15) * PX;
    g.fillStyle = 'rgba(40,60,50,0.35)';
    g.fillRect(x, 0, 2, l);
  }
}, { repeat: [1 / 3.2, 1 / 1.4] });

export const blockHighTex = () => tex('blockHigh', 3.2 * PX, 1.6 * PX, (g, W, H, r) => {
  g.fillStyle = '#c3cabb';
  g.fillRect(0, 0, W, H);
  courses(g, W, H, 1.6, (x, y, w, h) => {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '60,60,50'},${0.03 + r() * 0.04})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(90,96,84,0.22)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  });
  speckle(g, W, H, r, 1200, 1.3, 0.1);
  // damp: tide marks bleeding down from the ceiling
  blotches(g, W, 0.5 * PX, r, 5, 0.5 * PX, '120,110,70', 0.14);
}, { repeat: [1 / 3.2, 1 / 1.6] });

export const blockNormal = () => normalTex('blockN', 3.2 * PX, 1.6 * PX, (g, W, H, r) => {
  g.fillStyle = grey(200);
  g.fillRect(0, 0, W, H);
  courses(g, W, H, 1.6, (x, y, w, h) => {
    // a soft hollow at each joint, a slightly pillowed face
    g.fillStyle = grey(120);
    g.fillRect(x, y, w, h);
    g.fillStyle = grey(170);
    g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = grey(200 + r() * 20);
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
  });
  speckle(g, W, H, r, 2500, 1.2, 0.12);
}, 2.2, [1 / 3.2, 1 / 1.6]);

// ------------------------------------------------------------------ floors
// Corridor B-1: 30 cm speckled vinyl tiles, laid chequer-wise so the grain
// alternates, each tile a shade off its neighbours.
export const vinylTex = () => tex('vinyl', 512, 512, (g, W, H, r) => {
  const n = 8, s = W / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = 150 + r() * 16;
      g.fillStyle = `rgb(${v * 0.99 | 0},${v * 1.04 | 0},${v * 0.99 | 0})`;
      g.fillRect(i * s, j * s, s, s);
    }
  }
  speckle(g, W, H, r, 9000, 1.6, 0.35, 0.45);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = ['rgba(60,70,64,0.5)', 'rgba(230,236,226,0.45)', 'rgba(120,90,70,0.35)'][i % 3];
    g.fillRect(r() * W, r() * H, 2, 1.5);
  }
  // joints, and a darker scuff down the middle where everyone walks
  g.strokeStyle = 'rgba(40,46,42,0.5)';
  g.lineWidth = 1.5;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, H); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(W, i * s); g.stroke();
  }
  blotches(g, W, H, r, 14, 60, '50,56,48', 0.1);
}, { repeat: [1 / 2.4, 1 / 2.4] });
export const vinylNormal = () => normalTex('vinyl', 256, 256, (g, W, H, r) => {
  g.fillStyle = grey(200); g.fillRect(0, 0, W, H);
  g.strokeStyle = grey(90); g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = (i * W) / 8;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke();
  }
  speckle(g, W, H, r, 1500, 1, 0.2);
}, 1.5, [1 / 2.4, 1 / 2.4]);

// Server hall: 60 cm access-floor panels with dark trim.
export const raisedTex = () => tex('raised', 512, 512, (g, W, H, r) => {
  g.fillStyle = '#2a2d31'; g.fillRect(0, 0, W, H);
  const n = 4, s = W / n, t = 5;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = 138 + r() * 14;
      g.fillStyle = `rgb(${v | 0},${v * 1.03 | 0},${v * 1.07 | 0})`;
      g.fillRect(i * s + t, j * s + t, s - 2 * t, s - 2 * t);
      // the lifting-suction marks near two corners
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath(); g.arc(i * s + s * 0.2, j * s + s * 0.2, 7, 0, 7); g.fill();
      g.beginPath(); g.arc(i * s + s * 0.8, j * s + s * 0.8, 7, 0, 7); g.fill();
    }
  }
  speckle(g, W, H, r, 5000, 1.2, 0.18);
  blotches(g, W, H, r, 10, 50, '30,30,40', 0.12);
}, { repeat: [1 / 2.4, 1 / 2.4] });
// perforated panel: hex holes; the emissive map lights the holes from below
const perfDraw = (holes) => (g, W, H) => {
  g.fillStyle = holes ? '#000' : '#2a2d31'; g.fillRect(0, 0, W, H);
  const t = 5;
  g.fillStyle = holes ? '#000' : '#8b9299';
  g.fillRect(t, t, W - 2 * t, H - 2 * t);
  g.fillStyle = holes ? '#fff' : '#101418';
  const p = 13;
  for (let row = 0, y = 18; y < H - 14; y += p * 0.866, row++) {
    for (let x = 18 + (row % 2) * p / 2; x < W - 14; x += p) {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(x + Math.cos(a) * 4.6, y + Math.sin(a) * 4.6);
      }
      g.fill();
    }
  }
};
export const perfTex = () => tex('perf', 256, 256, perfDraw(false), { repeat: [1 / 0.6, 1 / 0.6] });
export const perfGlow = () => tex('perfGlow', 256, 256, perfDraw(true), { repeat: [1 / 0.6, 1 / 0.6] });

// Hardware lab: grey anti-static vinyl sheet, copper grounding strips under
// the seams every 60 cm (they show through as a warm line).
export const esdTex = () => tex('esd', 512, 512, (g, W, H, r) => {
  g.fillStyle = '#8e9aa3'; g.fillRect(0, 0, W, H);
  // conductive fibres: fine dark threads
  for (let i = 0; i < 700; i++) {
    g.strokeStyle = `rgba(40,50,60,${0.1 + r() * 0.2})`;
    g.lineWidth = 0.6;
    const x = r() * W, y = r() * H, a = r() * 6.3, l = 3 + r() * 10;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  speckle(g, W, H, r, 3000, 1, 0.12);
  const s = W / 4;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(184,115,51,0.6)';
    g.fillRect(i * s - 1, 0, 2, H);
    g.fillStyle = 'rgba(60,70,80,0.45)';
    g.fillRect(0, i * s - 1, W, 1.5);
  }
  blotches(g, W, H, r, 8, 60, '70,80,90', 0.1);
}, { repeat: [1 / 2.4, 1 / 2.4] });

// Bare concrete: power-floated, dirty, with saw-cut joints every 2 m (the
// engine's concrete seams sit on the same grid).
export const concTex = () => tex('conc', 1024, 1024, (g, W, H, r) => {
  g.fillStyle = '#7b7c74'; g.fillRect(0, 0, W, H);
  blotches(g, W, H, r, 60, 120, '96,98,90', 0.35);
  blotches(g, W, H, r, 40, 90, '58,58,52', 0.25);
  speckle(g, W, H, r, 22000, 1.5, 0.22);
  // trowel swirls
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    g.lineWidth = 6 + r() * 12;
    const x = r() * W, y = r() * H;
    g.beginPath(); g.arc(x, y, 40 + r() * 90, r() * 6, r() * 6 + 1.5); g.stroke();
  }
  // hairline cracks
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = 'rgba(30,30,28,0.45)'; g.lineWidth = 1;
    let x = r() * W, y = r() * H;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 12; k++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(28,28,26,0.75)';
  g.fillRect(0, 0, W, 3); g.fillRect(0, H / 2 - 1, W, 3);
  g.fillRect(0, 0, 3, H); g.fillRect(W / 2 - 1, 0, 3, H);
}, { repeat: [1 / 4, 1 / 4] });
export const concNormal = () => normalTex('conc', 512, 512, (g, W, H, r) => {
  g.fillStyle = grey(180); g.fillRect(0, 0, W, H);
  speckle(g, W, H, r, 12000, 1.4, 0.45);
  g.fillStyle = grey(60);
  g.fillRect(0, 0, W, 2); g.fillRect(0, H / 2 - 1, W, 2);
  g.fillRect(0, 0, 2, H); g.fillRect(W / 2 - 1, 0, 2, H);
}, 2, [1 / 4, 1 / 4]);

// Board-marked concrete soffit: the grain of the formwork boards, 15 cm wide.
export const ceilTex = () => tex('ceil', 512, 512, (g, W, H, r) => {
  g.fillStyle = '#6a6e69'; g.fillRect(0, 0, W, H);
  const bw = W / 16;
  for (let i = 0; i < 16; i++) {
    const v = 95 + r() * 22;
    g.fillStyle = `rgb(${v},${v + 3},${v})`;
    g.fillRect(i * bw, 0, bw - 1, H);
    for (let k = 0; k < 10; k++) {
      g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
      g.lineWidth = 1;
      const x = i * bw + r() * bw;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 3, H * 0.3, x - 3, H * 0.6, x + 1, H); g.stroke();
    }
    g.fillStyle = 'rgba(20,20,20,0.35)';
    g.fillRect(i * bw + bw - 1, 0, 1.5, H);
  }
  blotches(g, W, H, r, 12, 70, '40,42,38', 0.25);
}, { repeat: [1 / 2.4, 1 / 2.4] });

// ----------------------------------------------------------------- metals
// Welded mesh, 5 cm squares (the alpha cuts the holes).
export const meshAlpha = () => tex('mesh', 128, 128, (g, W, H) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) { g.fillRect(i * 32, 0, 3, H); g.fillRect(0, i * 32, W, 3); }
}, { repeat: [1 / 0.2, 1 / 0.2], data: true });
// chequer plate: raised diagonal lozenges
export const checkerNormal = () => normalTex('checker', 256, 256, (g, W, H) => {
  g.fillStyle = grey(120); g.fillRect(0, 0, W, H);
  g.fillStyle = grey(230);
  const s = W / 8;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      g.save();
      g.translate(i * s + s / 2, j * s + s / 2);
      g.rotate((i + j) % 2 ? Math.PI / 4 : -Math.PI / 4);
      g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.1, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
}, 3, [1 / 0.3, 1 / 0.3]);
// hazard stripes, 45°, 10 cm bands
export const hazardTex = () => tex('hazard', 256, 256, (g, W, H, r) => {
  g.fillStyle = '#e2b623'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b1b1b';
  for (let k = -W; k < W * 2; k += W / 2) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + W / 4, 0); g.lineTo(k + W / 4 + H, H); g.lineTo(k + H, H); g.fill();
  }
  speckle(g, W, H, r, 1500, 2, 0.25);
  blotches(g, W, H, r, 6, 40, '40,40,30', 0.3);
}, { repeat: [1 / 0.4, 1 / 0.4] });
// the perforated door on a rack: small hexes, black steel
export const rackDoorAlpha = () => tex('rackdoor', 128, 128, (g, W, H) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#000';
  const p = 16;
  for (let row = 0, y = 0; y < H + p; y += p * 0.866, row++) {
    for (let x = (row % 2) * p / 2; x < W + p; x += p) {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(x + Math.cos(a) * 6.8, y + Math.sin(a) * 6.8);
      }
      g.fill();
    }
  }
}, { repeat: [1 / 0.12, 1 / 0.12], data: true });
// server faces behind the doors: 1U/2U boxes, drive bays, vents
export const bezelTex = () => tex('bezel', 256, 1024, (g, W, H, r) => {
  g.fillStyle = '#0c0d10'; g.fillRect(0, 0, W, H);
  let y = 12;
  while (y < H - 20) {
    const u = r() < 0.25 ? 0 : r() < 0.6 ? 1 : r() < 0.85 ? 2 : 4;
    const h = u === 0 ? 20 : u * 22;
    if (u === 0) {
      // a blanking panel
      g.fillStyle = '#16181c'; g.fillRect(8, y, W - 16, h - 2);
    } else {
      const shade = 55 + r() * 45;
      g.fillStyle = r() < 0.25 ? '#c9cdd2' : `rgb(${shade},${shade + 2},${shade + 6})`;
      g.fillRect(8, y, W - 16, h - 2);
      // drive bays
      const bays = u >= 2 ? 8 : 4;
      for (let b = 0; b < bays; b++) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(40 + b * ((W - 80) / bays), y + 3, (W - 80) / bays - 3, h - 8);
      }
      // vent slots and handles
      g.fillStyle = 'rgba(0,0,0,0.6)';
      for (let v = 0; v < 5; v++) g.fillRect(14 + v * 4, y + 4, 2, h - 8);
      g.fillStyle = 'rgba(200,200,210,0.5)';
      g.fillRect(10, y + 2, 3, h - 6); g.fillRect(W - 13, y + 2, 3, h - 6);
    }
    y += h;
  }
}, { wrap: false });

// ---------------------------------------------------------------- organics
export const palletTex = () => tex('pallet', 256, 256, (g, W, H, r) => {
  g.fillStyle = '#b89464'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = `rgba(${90 + r() * 40},${60 + r() * 25},30,${0.15 + r() * 0.2})`;
    g.lineWidth = 1 + r() * 2;
    const y = r() * H;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + r() * 6 - 3, W * 0.7, y + r() * 6 - 3, W, y); g.stroke();
  }
  blotches(g, W, H, r, 10, 40, '70,50,30', 0.3);
  g.fillStyle = 'rgba(40,40,40,0.8)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(r() * W, r() * H, 2, 0, 7); g.fill(); } // nail heads
});
export const cardTex = () => tex('card', 256, 256, (g, W, H, r) => {
  g.fillStyle = '#c1935a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 4) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`; g.fillRect(i, 0, 2, H); }
  blotches(g, W, H, r, 5, 50, '120,85,45', 0.3);
  g.fillStyle = 'rgba(200,170,110,0.85)'; g.fillRect(W * 0.42, 0, W * 0.16, H); // tape
  g.fillStyle = '#f4f0e4'; g.fillRect(W * 0.1, H * 0.6, W * 0.28, H * 0.18); // label
  g.fillStyle = 'rgba(30,30,30,0.7)';
  for (let k = 0; k < 3; k++) g.fillRect(W * 0.12, H * 0.63 + k * 9, W * (0.15 + r() * 0.08), 3);
});

// Floor decals in one atlas (4 × 4 slots): tyre marks, scuffs, a drain, oil,
// water, a dusty daylight line.
export const DECAL = {
  tyre: 0, tyre2: 1, scuff: 2, drain: 3, oil: 4, wet: 5, ring: 6, dust: 7, grime: 8, footprints: 9, crack: 10, puddle: 11,
};
export const decalUV = (k) => {
  const i = DECAL[k] ?? 0, s = 0.25;
  const u = (i % 4) * s, v = 1 - (Math.floor(i / 4) + 1) * s;
  return [u + 0.004, v + 0.004, u + s - 0.004, v + s - 0.004];
};
export const decalTex = () => tex('decals', 1024, 1024, (g, W, H, r) => {
  g.clearRect(0, 0, W, H);
  const S = W / 4;
  const slot = (k, fn) => {
    const i = DECAL[k];
    g.save();
    g.translate((i % 4) * S, Math.floor(i / 4) * S);
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    fn(S);
    g.restore();
  };
  const tyre = (s, curve) => {
    for (const off of [-40, 40]) {
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = `rgba(15,15,14,${0.08 + r() * 0.12})`;
        g.lineWidth = 2 + r() * 3;
        g.beginPath();
        g.moveTo(s / 2 + off + (r() - 0.5) * 16, 0);
        g.bezierCurveTo(s / 2 + off + curve, s * 0.35, s / 2 + off + curve, s * 0.65, s / 2 + off + (r() - 0.5) * 16, s);
        g.stroke();
      }
    }
  };
  slot('tyre', (s) => tyre(s, 0));
  slot('tyre2', (s) => tyre(s, 60));
  slot('scuff', (s) => {
    for (let k = 0; k < 30; k++) {
      g.strokeStyle = `rgba(10,10,10,${0.1 + r() * 0.3})`; g.lineWidth = 1 + r() * 4;
      const x = s * 0.1 + r() * s * 0.8, y = s * 0.2 + r() * s * 0.6;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + (r() - 0.5) * 30, x + 20 + r() * 80, y + (r() - 0.5) * 40); g.stroke();
    }
  });
  slot('drain', (s) => {
    g.fillStyle = '#2a2b2a'; g.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    g.fillStyle = '#6b6d6a'; g.fillRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
    g.fillStyle = '#0a0b0a';
    for (let k = 0; k < 9; k++) g.fillRect(s * 0.2 + k * s * 0.068, s * 0.2, s * 0.04, s * 0.6);
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.5);
    gr.addColorStop(0, 'rgba(40,36,28,0.5)'); gr.addColorStop(1, 'rgba(40,36,28,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  slot('oil', (s) => {
    for (let k = 0; k < 7; k++) {
      const x = s * (0.3 + r() * 0.4), y = s * (0.3 + r() * 0.4), rr = s * (0.08 + r() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(12,10,8,0.7)'); gr.addColorStop(0.7, 'rgba(20,16,12,0.45)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  });
  slot('wet', (s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.48);
    gr.addColorStop(0, 'rgba(30,40,40,0.55)'); gr.addColorStop(0.8, 'rgba(30,40,40,0.4)'); gr.addColorStop(1, 'rgba(30,40,40,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.48, s * 0.36, 0.3, 0, 7); g.fill();
  });
  slot('ring', (s) => {
    g.strokeStyle = 'rgba(80,50,20,0.55)'; g.lineWidth = 6;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.3, 0, 5.8); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(s / 2 + 8, s / 2 - 4, s * 0.28, 1, 4); g.stroke();
  });
  slot('dust', (s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  slot('grime', (s) => {
    for (let k = 0; k < 12; k++) {
      const x = r() * s, y = r() * s, rr = s * (0.1 + r() * 0.25);
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(25,24,20,0.3)'); gr.addColorStop(1, 'rgba(25,24,20,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  });
  slot('footprints', (s) => {
    for (let k = 0; k < 8; k++) {
      g.fillStyle = 'rgba(30,26,20,0.3)';
      g.beginPath(); g.ellipse(s * 0.35 + (k % 2) * s * 0.3, s - k * s * 0.12 - 20, 10, 22, 0.1, 0, 7); g.fill();
    }
  });
  slot('crack', (s) => {
    g.strokeStyle = 'rgba(20,20,18,0.6)'; g.lineWidth = 1.5;
    let x = 0, y = s * 0.5;
    g.beginPath(); g.moveTo(x, y);
    while (x < s) { x += 8 + r() * 14; y += (r() - 0.5) * 16; g.lineTo(x, y); }
    g.stroke();
  });
  slot('puddle', (s) => {
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2, rr = s * (0.36 + Math.sin(k * 2.3) * 0.06 + r() * 0.04);
      g.lineTo(s / 2 + Math.cos(a) * rr, s / 2 + Math.sin(a) * rr * 0.75);
    }
    g.fill();
  });
}, { wrap: false });

// The fixture louvre: a parabolic aluminium grid (alpha) seen from below.
export const louvreTex = () => tex('louvre', 256, 64, (g, W, H) => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff';
  for (let i = 0; i <= 16; i++) g.fillRect(i * (W / 16) - 1.5, 0, 3, H); // cross blades
  g.fillRect(0, 0, W, 5); g.fillRect(0, H - 5, W, 5); g.fillRect(0, H / 2 - 2, W, 4);
}, { wrap: false });

// Lever-arch files and archive boxes: one atlas of shelf fronts, 4 strips.
export const filesTex = () => tex('files', 512, 512, (g, W, H, r) => {
  const S = H / 4;
  const pal = ['#2c4f8c', '#8c2c2c', '#2c6e3c', '#222', '#c9a227', '#6d3c8c', '#d8d4c6', '#4a6f8c'];
  for (let strip = 0; strip < 4; strip++) {
    const y0 = strip * S;
    g.fillStyle = '#1a1a1a'; g.fillRect(0, y0, W, S);
    let x = 0;
    while (x < W) {
      if (strip === 3 || (strip === 2 && r() < 0.5)) {
        // archive boxes: brown card with a label and a hand hole
        const w = 60 + r() * 30;
        g.fillStyle = `rgb(${170 + r() * 30},${130 + r() * 20},${80 + r() * 20})`;
        g.fillRect(x + 1, y0 + S * 0.08, w - 2, S * 0.92);
        g.fillStyle = '#f2eee2'; g.fillRect(x + w * 0.2, y0 + S * 0.3, w * 0.6, S * 0.28);
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(x + w * 0.25, y0 + S * 0.36, w * 0.4, 3); g.fillRect(x + w * 0.25, y0 + S * 0.46, w * 0.3, 3);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(x + w / 2, y0 + S * 0.78, w * 0.18, 5, 0, 0, 7); g.fill();
        x += w;
      } else {
        // lever-arch files: coloured spines, a ring-pull hole and a label
        const w = 18 + r() * 8;
        const top = y0 + S * (0.02 + r() * 0.1);
        g.fillStyle = pal[(r() * pal.length) | 0];
        g.fillRect(x + 0.5, top, w - 1, y0 + S - top);
        g.fillStyle = '#efeadc'; g.fillRect(x + 3, top + S * 0.12, w - 6, S * 0.3);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 5, top + S * 0.18, w - 10, 2);
        g.fillStyle = '#111'; g.beginPath(); g.arc(x + w / 2, top + S * 0.66, 4, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 1, top, 2, y0 + S - top);
        x += w;
        if (r() < 0.06) x += 20 + r() * 20; // a gap where a file went missing
      }
    }
  }
}, { wrap: false });

// ------------------------------------------------------------- label atlas
// Every sign, room plate, poster and data plate on the floor painted into one
// canvas, so they all draw as one mesh.
export class Atlas {
  constructor(size = 2048) {
    this.c = canvas(size, size);
    this.g = this.c.getContext('2d');
    this.size = size;
    this.x = 0; this.y = 0; this.row = 0;
    this.slots = new Map();
    this.texture = new THREE.CanvasTexture(this.c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  // allocate w × h px, draw into it, return its uv rect
  slot(key, w, h, draw) {
    if (this.slots.has(key)) return this.slots.get(key);
    if (this.x + w > this.size) { this.x = 0; this.y += this.row + 2; this.row = 0; }
    const x = this.x, y = this.y;
    this.x += w + 2;
    this.row = Math.max(this.row, h);
    const g = this.g;
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    draw(g, w, h);
    g.restore();
    const S = this.size;
    const uv = [(x + 0.5) / S, 1 - (y + h - 0.5) / S, (x + w - 0.5) / S, 1 - (y + 0.5) / S];
    this.slots.set(key, uv);
    this.texture.needsUpdate = true;
    return uv;
  }
}

// ---------------------------------------------------------------- materials
// Surfaces the static batch draws with. World-UV ones are listed in WORLD_UV.
export const WORLD_UV = new Set(['wallLow', 'wallHigh', 'vinyl', 'raised', 'perf', 'esd', 'conc', 'mesh', 'checker', 'hazard', 'rackdoor', 'ceil']);

const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
let MATS = null;
export function cellarMats() {
  if (MATS) return MATS;
  const v2 = (a) => new THREE.Vector2(a, a);
  MATS = {
    wallLow: std({ map: blockLowTex(), normalMap: blockNormal(), normalScale: v2(0.55), roughness: 0.32, metalness: 0.05 }),
    wallHigh: std({ map: blockHighTex(), normalMap: blockNormal(), normalScale: v2(0.7), roughness: 0.88 }),
    vinyl: std({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, map: vinylTex(), normalMap: vinylNormal(), normalScale: v2(0.4), roughness: 0.42 }),
    raised: std({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, map: raisedTex(), roughness: 0.55, metalness: 0.15 }),
    perf: std({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, map: perfTex(), emissiveMap: perfGlow(), emissive: new THREE.Color('#4fa3ff'), emissiveIntensity: 1.2, roughness: 0.5, metalness: 0.3 }),
    esd: std({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, map: esdTex(), roughness: 0.6 }),
    conc: std({ map: concTex(), normalMap: concNormal(), normalScale: v2(0.5), roughness: 0.9 }),
    ceil: std({ map: ceilTex(), roughness: 0.95 }),
    mesh: std({ alphaMap: meshAlpha(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.45 }),
    checker: std({ normalMap: checkerNormal(), normalScale: v2(0.9), metalness: 0.75, roughness: 0.38 }),
    hazard: std({ map: hazardTex(), roughness: 0.6 }),
    rackdoor: std({ alphaMap: rackDoorAlpha(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.45 }),
    bezel: std({ map: bezelTex(), roughness: 0.45, metalness: 0.3, emissiveMap: bezelTex(), emissive: new THREE.Color('#1c2a3a') }),
    paint: std({ roughness: 0.46, metalness: 0.2 }),
    matt: std({ roughness: 0.88 }),
    steel: std({ roughness: 0.34, metalness: 0.8 }),
    wood: std({ map: palletTex(), roughness: 0.85 }),
    card: std({ map: cardTex(), roughness: 0.95 }),
    files: std({ map: filesTex(), roughness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#bfe3ee', transparent: true, opacity: 0.16, roughness: 0.05, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
    }),
    // unlit and over-bright: LEDs, screens, pilot lights — bloom picks them up
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    decal: new THREE.MeshStandardMaterial({
      map: decalTex(), vertexColors: true, transparent: true, depthWrite: false, roughness: 0.8,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }),
    // light you can see but that lights nothing: daylight under the shutter,
    // the cold aisle's uplight — additive, from the decal atlas's gradients
    light: new THREE.MeshBasicMaterial({
      map: decalTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    }),
  };
  return MATS;
}
// the surfaces whose shadows read (everything flat, lit, printed or
// see-through casts none: a shadow pass per surface is a draw call each)
export const CASTS = new Set(['paint', 'matt', 'steel', 'wallLow', 'wood', 'card', 'conc']);
