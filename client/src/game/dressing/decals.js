// Floor decals for every map: one procedural atlas, one merged mesh.
//
// A map lists them as DECALS: [kind, x, z, w, d, rotation, opacity, extra?]
// in metres (the cellar's format, which this is a superset of): a w × d
// card laid on the floor at (x, z), turned by `rotation` about the vertical;
// u runs along w, v along d. `extra` is a tint ('#hex') or { tint, y } — y
// lifts the card onto a raised floor. Its STAINS (the office's coffee
// rings: [x, z, size]) join the same mesh, and so do the printed labels,
// stickers and tape strips that clutter builders put on their models
// (kit.js Piece.decal) — every one of them one draw for the whole map.
//
// Two layers: 'matte' (almost everything) and 'gloss' (oil, water, a soda
// spill — the ones that should catch the lights). A layer with nothing in
// it isn't drawn.
//
// Opacity: the car's eye is ~20 cm off the floor, so every floor decal is
// seen at a grazing angle that eats faint ones. Near the lane use 0.6–0.9;
// 0.3 reads as nothing.
//
// A per-map artist adds a kind in dressing/kinds/<map>.js (DECAL_KINDS):
//   { draw(g, S, r), span?: [cols, rows], layer?: 'gloss' }
// draw paints one cell on a 2D canvas: S px square per span unit, origin at
// the cell's top-left, r a seeded random. Paint on transparent; the colour
// under transparent texels is bled in afterwards, so edges never go dark.
import * as THREE from 'three';
import { M } from '@rc/shared';
import { rng } from '../textures.js';

export const LOWFX = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lowfx');

// y of every floor card, world units: above rugs (4 mm) and the concrete
// floors' −0.02, with a polygon offset on top so nothing z-fights
export const DECAL_Y = 0.02;
const GRID = 8; // cells per side

// ------------------------------------------------------------ painters
// Helpers every painter can use: soft blob, speckle, text.
const blob = (g, x, y, rx, ry, rgb, a0, a1 = 0, rot = 0) => {
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(1, `rgba(${rgb},${a1})`);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
  g.restore();
};
const text = (g, s, x, y, px, color, weight = 800) => {
  g.fillStyle = color; g.font = `${weight} ${px}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y);
};
const rrect = (g, x, y, w, h, rad) => {
  g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
};
// one tyre track down the cell at x: rubber streaks, broken like a tread
function track(g, S, r, x, w, curve, alpha) {
  const k = S / 256;
  for (let i = 0; i < 26; i++) {
    const off = (r() - 0.5) * w;
    g.strokeStyle = `rgba(14,13,12,${alpha * (0.25 + r() * 0.5)})`;
    g.lineWidth = (1.2 + r() * 2.6) * k;
    g.setLineDash([(6 + r() * 20) * k, (2 + r() * 6) * k]);
    g.beginPath();
    g.moveTo(x + off, 0);
    g.bezierCurveTo(x + off + curve, S * 0.35, x + off + curve, S * 0.65, x + off + (r() - 0.5) * 3 * k, S);
    g.stroke();
  }
  g.setLineDash([]);
}

// The built-in kinds, in atlas order. The cellar's twelve come first under
// the names it uses, so its DECALS lists work unchanged here.
export const BUILTIN_DECALS = {
  tyre: { draw(g, S, r) { track(g, S, r, S * 0.3, 18 * S / 256, 0, 1); track(g, S, r, S * 0.7, 18 * S / 256, 0, 1); } },
  tyre2: { draw(g, S, r) { track(g, S, r, S * 0.28, 18 * S / 256, S * 0.22, 1); track(g, S, r, S * 0.68, 18 * S / 256, S * 0.22, 1); } },
  scuff: {
    draw(g, S, r) {
      const k = S / 256;
      for (let i = 0; i < 34; i++) {
        g.strokeStyle = `rgba(12,12,12,${0.1 + r() * 0.35})`; g.lineWidth = (1 + r() * 4) * k;
        const x = S * (0.1 + r() * 0.6), y = S * (0.2 + r() * 0.6);
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + 30 * k, y + (r() - 0.5) * 30 * k, x + (20 + r() * 80) * k, y + (r() - 0.5) * 40 * k); g.stroke();
      }
    },
  },
  drain: {
    draw(g, S) {
      const k = S / 256;
      blob(g, S / 2, S / 2, S * 0.5, S * 0.5, '40,36,28', 0.5);
      g.fillStyle = '#2a2b2a'; rrect(g, S * 0.12, S * 0.12, S * 0.76, S * 0.76, 6 * k); g.fill();
      g.fillStyle = '#7b7e7b'; rrect(g, S * 0.15, S * 0.15, S * 0.7, S * 0.7, 4 * k); g.fill();
      g.fillStyle = '#0b0c0b';
      for (let i = 0; i < 9; i++) g.fillRect(S * 0.21 + i * S * 0.067, S * 0.2, S * 0.038, S * 0.6);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(S * 0.15, S * 0.15, S * 0.7, 2 * k);
    },
  },
  oil: {
    layer: 'gloss',
    draw(g, S, r) {
      for (let i = 0; i < 7; i++) blob(g, S * (0.3 + r() * 0.4), S * (0.3 + r() * 0.4), S * (0.08 + r() * 0.2), S * (0.08 + r() * 0.16), '14,12,10', 0.75, 0, r() * 3);
    },
  },
  wet: {
    layer: 'gloss',
    draw(g, S) {
      g.save(); g.translate(S / 2, S / 2); g.rotate(0.3); g.scale(1, 0.75);
      const gr = g.createRadialGradient(0, 0, S * 0.1, 0, 0, S * 0.48);
      gr.addColorStop(0, 'rgba(34,42,46,0.6)'); gr.addColorStop(0.8, 'rgba(34,42,46,0.42)'); gr.addColorStop(1, 'rgba(34,42,46,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, S * 0.48, 0, 7); g.fill(); g.restore();
    },
  },
  ring: {
    draw(g, S) {
      const k = S / 256;
      g.strokeStyle = 'rgba(86,52,20,0.6)'; g.lineWidth = 6 * k;
      g.beginPath(); g.arc(S / 2, S / 2, S * 0.3, 0, 5.8); g.stroke();
      g.lineWidth = 2 * k; g.beginPath(); g.arc(S / 2 + 8 * k, S / 2 - 4 * k, S * 0.28, 1, 4); g.stroke();
    },
  },
  dust: {
    draw(g, S) {
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    },
  },
  grime: { draw(g, S, r) { for (let i = 0; i < 14; i++) blob(g, S * (0.15 + r() * 0.7), S * (0.15 + r() * 0.7), S * (0.1 + r() * 0.22), S * (0.08 + r() * 0.2), '25,24,20', 0.32); } },
  footprints: {
    // shoe prints walking up a tall cell (lay it ~0.5 × 1 m): five steps, a
    // sole and a heel each, fading as the shoes dry
    span: [1, 2],
    draw(g, S, r) {
      for (let i = 0; i < 5; i++) {
        const x = S * (0.5 + (i % 2 ? 0.16 : -0.16)), y = S * 2 - (i + 0.55) * S * 0.38;
        g.fillStyle = `rgba(38,32,26,${(0.55 - i * 0.07) * (0.8 + r() * 0.2)})`;
        g.beginPath(); g.ellipse(x, y - S * 0.06, S * 0.085, S * 0.15, (i % 2 ? 0.08 : -0.08), 0, 7); g.fill();
        g.beginPath(); g.ellipse(x + (i % 2 ? 1 : -1) * S * 0.01, y + S * 0.16, S * 0.07, S * 0.07, 0, 0, 7); g.fill();
      }
    },
  },
  crack: {
    draw(g, S, r) {
      const k = S / 256;
      const branch = (x, y, dx, len, w) => {
        g.lineWidth = w * k; g.beginPath(); g.moveTo(x, y);
        for (let t = 0; t < len; t++) { x += dx * (8 + r() * 12) * k; y += (r() - 0.5) * 16 * k; g.lineTo(x, y); }
        g.stroke();
      };
      g.strokeStyle = 'rgba(18,18,16,0.75)';
      branch(0, S * 0.5, 1, 18, 2);
      g.strokeStyle = 'rgba(18,18,16,0.5)';
      for (let i = 0; i < 4; i++) branch(S * (0.15 + r() * 0.6), S * (0.4 + r() * 0.2), r() < 0.5 ? 1 : -1, 3 + (r() * 4 | 0), 1.2);
    },
  },
  puddle: {
    layer: 'gloss',
    draw(g, S, r) {
      g.fillStyle = 'rgba(30,38,46,0.82)';
      g.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2, rr = S * (0.36 + Math.sin(i * 2.3) * 0.05 + r() * 0.04);
        g.lineTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr * 0.72);
      }
      g.fill();
      blob(g, S / 2, S / 2, S * 0.48, S * 0.36, '30,38,46', 0.3);
    },
  },
  // ---- the rest of the shared set
  stain: {
    // a dried coffee spill: pale inside, a darker tide mark (the office's
    // STAINS, as the old per-stain meshes drew them)
    draw(g, S) {
      const gr = g.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(74,46,18,0)'); gr.addColorStop(0.62, 'rgba(74,46,18,0.3)');
      gr.addColorStop(0.78, 'rgba(60,36,14,0.55)'); gr.addColorStop(0.86, 'rgba(60,36,14,0.12)'); gr.addColorStop(1, 'rgba(60,36,14,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(S / 2, S / 2, S / 2 - 2, S / 2 - 10, 0.3, 0, Math.PI * 2); g.fill();
    },
  },
  crumbs: {
    draw(g, S, r) {
      for (let i = 0; i < 160; i++) {
        const a = r() * 6.3, d = Math.pow(r(), 0.7) * S * 0.45;
        const c = r() < 0.5 ? '176,132,78' : r() < 0.5 ? '120,84,48' : '222,196,150';
        g.fillStyle = `rgba(${c},${0.6 + r() * 0.4})`;
        const s = (1 + r() * 3.5) * S / 256;
        g.fillRect(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.8, s, s * (0.6 + r() * 0.8));
      }
    },
  },
  paper: {
    // an A4 sheet, printed: a heading, body lines, a table
    draw(g, S, r) {
      const k = S / 256, x0 = S * 0.15, w = S * 0.7;
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0 + 2 * k, 3 * k, w, S - 4 * k);
      g.fillStyle = '#f7f6f1'; g.fillRect(x0, 0, w, S - 4 * k);
      g.fillStyle = '#2c3440'; g.fillRect(x0 + 14 * k, 16 * k, w * 0.5, 7 * k);
      g.fillStyle = 'rgba(40,44,52,0.55)';
      for (let y = 36 * k; y < S * 0.62; y += 7 * k) g.fillRect(x0 + 14 * k, y, (w - 28 * k) * (0.6 + r() * 0.4), 2.2 * k);
      g.strokeStyle = 'rgba(40,44,52,0.4)'; g.lineWidth = 1 * k;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x0 + 14 * k, S * 0.68 + i * 12 * k); g.lineTo(x0 + w - 14 * k, S * 0.68 + i * 12 * k); g.stroke(); }
    },
  },
  postit: {
    // white, so the instance/vertex tint gives it its colour
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(S * 0.1 + 3 * k, S * 0.1 + 4 * k, S * 0.8, S * 0.8);
      g.fillStyle = '#ffffff'; g.fillRect(S * 0.1, S * 0.1, S * 0.8, S * 0.8);
      const gr = g.createLinearGradient(0, S * 0.1, 0, S * 0.9);
      gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = gr; g.fillRect(S * 0.1, S * 0.1, S * 0.8, S * 0.8);
      g.strokeStyle = 'rgba(30,40,80,0.7)'; g.lineWidth = 3 * k;
      g.beginPath(); g.moveTo(S * 0.22, S * 0.4); g.bezierCurveTo(S * 0.4, S * 0.3, S * 0.5, S * 0.5, S * 0.72, S * 0.36); g.stroke();
      g.beginPath(); g.moveTo(S * 0.22, S * 0.6); g.lineTo(S * 0.6, S * 0.58); g.stroke();
    },
  },
  leaves: {
    // a drift of fallen leaves, autumn colours
    draw(g, S, r) {
      const k = S / 256;
      for (let i = 0; i < 26; i++) {
        const x = S * (0.12 + r() * 0.76), y = S * (0.12 + r() * 0.76), l = (14 + r() * 16) * k, a = r() * 6.3;
        const c = ['150,86,34', '176,120,40', '110,70,30', '128,110,44', '160,60,30'][(r() * 5) | 0];
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = `rgba(${c},${0.75 + r() * 0.25})`;
        g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, -l * 0.55, l, 0); g.quadraticCurveTo(0, l * 0.55, -l, 0); g.fill();
        g.strokeStyle = 'rgba(60,36,14,0.5)'; g.lineWidth = 1 * k; g.beginPath(); g.moveTo(-l * 1.2, 0); g.lineTo(l, 0); g.stroke();
        g.restore();
      }
    },
  },
  leaf: {
    // one leaf filling the cell, pale — scatter tints each instance
    draw(g, S) {
      const k = S / 256;
      g.save(); g.translate(S / 2, S / 2);
      g.fillStyle = '#e8d8b8';
      g.beginPath(); g.moveTo(-S * 0.46, 0); g.quadraticCurveTo(-S * 0.05, -S * 0.4, S * 0.44, 0); g.quadraticCurveTo(-S * 0.05, S * 0.4, -S * 0.46, 0); g.fill();
      g.strokeStyle = 'rgba(90,60,30,0.55)'; g.lineWidth = 3 * k;
      g.beginPath(); g.moveTo(-S * 0.48, 0); g.lineTo(S * 0.42, 0); g.stroke();
      g.lineWidth = 1.5 * k;
      for (let i = -3; i <= 3; i++) {
        if (!i) continue;
        const x = i * S * 0.1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + S * 0.08, S * 0.14); g.moveTo(x, 0); g.lineTo(x + S * 0.08, -S * 0.14); g.stroke();
      }
      g.restore();
    },
  },
  tape: {
    // gaffer tape, 5 cm across the cell's width, torn ends; tint colours it
    draw(g, S, r) {
      const k = S / 256;
      g.fillStyle = '#d9d9d6';
      g.beginPath(); g.moveTo(0, S * 0.3);
      for (let x = 0; x <= S; x += 8 * k) g.lineTo(x, S * 0.3 + (r() - 0.5) * 3 * k);
      g.lineTo(S, S * 0.7);
      for (let x = S; x >= 0; x -= 8 * k) g.lineTo(x, S * 0.7 + (r() - 0.5) * 3 * k);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let x = 0; x < S; x += 3 * k) g.fillRect(x, S * 0.3, 1 * k, S * 0.4);
    },
    span: [2, 1],
  },
  floorbox: {
    // a floor power box lid: brushed-steel frame, carpet insert, a cable flap
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#9ea4aa'; rrect(g, S * 0.08, S * 0.08, S * 0.84, S * 0.84, 10 * k); g.fill();
      g.fillStyle = '#50565e'; g.fillRect(S * 0.16, S * 0.16, S * 0.68, S * 0.68);
      g.fillStyle = '#3a4250'; g.fillRect(S * 0.18, S * 0.18, S * 0.64, S * 0.64);
      g.fillStyle = '#1c1f24'; rrect(g, S * 0.38, S * 0.76, S * 0.24, S * 0.07, 4 * k); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(S * 0.08, S * 0.08, S * 0.84, 2 * k);
    },
  },
  chalk: {
    // chalk on the floor: a hopscotch-ish doodle, an arrow, a smiley
    draw(g, S, r) {
      const k = S / 256;
      g.strokeStyle = 'rgba(245,245,240,0.8)'; g.lineWidth = 4 * k; g.lineCap = 'round';
      g.beginPath(); g.arc(S * 0.3, S * 0.3, S * 0.14, 0, 6.3); g.stroke();
      g.beginPath(); g.arc(S * 0.25, S * 0.27, 3 * k, 0, 6.3); g.arc(S * 0.35, S * 0.27, 3 * k, 0, 6.3); g.stroke();
      g.beginPath(); g.arc(S * 0.3, S * 0.32, S * 0.07, 0.3, 2.8); g.stroke();
      g.beginPath(); g.moveTo(S * 0.55, S * 0.75); g.lineTo(S * 0.85, S * 0.45); g.lineTo(S * 0.72, S * 0.46); g.moveTo(S * 0.85, S * 0.45); g.lineTo(S * 0.84, S * 0.58); g.stroke();
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(245,245,240,${r() * 0.3})`; g.fillRect(r() * S, r() * S, 2 * k, 2 * k); }
    },
  },
  bunny: {
    // a dust bunny: grey fluff, darker core
    draw(g, S, r) {
      for (let i = 0; i < 40; i++) blob(g, S / 2 + (r() - 0.5) * S * 0.4, S / 2 + (r() - 0.5) * S * 0.3, S * (0.05 + r() * 0.1), S * (0.05 + r() * 0.1), '120,116,110', 0.35);
      const k = S / 256;
      g.strokeStyle = 'rgba(90,88,84,0.4)'; g.lineWidth = 1 * k;
      for (let i = 0; i < 40; i++) {
        const a = r() * 6.3, l = S * (0.1 + r() * 0.25);
        g.beginPath(); g.moveTo(S / 2, S / 2); g.quadraticCurveTo(S / 2 + Math.cos(a + 1) * l * 0.5, S / 2 + Math.sin(a + 1) * l * 0.5, S / 2 + Math.cos(a) * l, S / 2 + Math.sin(a) * l); g.stroke();
      }
    },
  },
  mat: {
    // a coir entrance mat with a black rubber border
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2, k = S / 256;
      g.fillStyle = '#26282b'; rrect(g, 2 * k, 2 * k, W - 4 * k, S - 4 * k, 14 * k); g.fill();
      g.fillStyle = '#8a6a44'; g.fillRect(18 * k, 18 * k, W - 36 * k, S - 36 * k);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(60,40,20,0.35)' : 'rgba(190,150,100,0.3)';
        g.fillRect(18 * k + r() * (W - 36 * k), 18 * k + r() * (S - 36 * k), 1.5 * k, (2 + r() * 4) * k);
      }
      g.strokeStyle = 'rgba(40,28,16,0.5)'; g.lineWidth = 3 * k; g.strokeRect(30 * k, 30 * k, W - 60 * k, S - 60 * k);
    },
  },
  matlogo: {
    // a grey entrance mat with the company mark woven in
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2, k = S / 256;
      g.fillStyle = '#1e2126'; rrect(g, 2 * k, 2 * k, W - 4 * k, S - 4 * k, 12 * k); g.fill();
      g.fillStyle = '#454b54'; g.fillRect(16 * k, 16 * k, W - 32 * k, S - 32 * k);
      for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)'; g.fillRect(16 * k + r() * (W - 32 * k), 16 * k + r() * (S - 32 * k), 2 * k, 2 * k); }
      g.fillStyle = '#e07a2e'; g.beginPath(); g.arc(W * 0.24, S / 2, 34 * k, 0, 6.3); g.fill();
      text(g, 'RC', W * 0.24, S / 2 + 2 * k, 30 * k, '#1e2126', 900);
      text(g, 'MAYHEM INC', W * 0.6, S / 2, 44 * k, '#d8dbe0', 800);
    },
  },
  butts: {
    draw(g, S, r) {
      const k = S / 256;
      for (let i = 0; i < 16; i++) blob(g, S * (0.2 + r() * 0.6), S * (0.2 + r() * 0.6), 10 * k, 7 * k, '70,70,70', 0.35);
      for (let i = 0; i < 9; i++) {
        const x = S * (0.2 + r() * 0.6), y = S * (0.2 + r() * 0.6), a = r() * 6.3;
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = '#efe9dc'; g.fillRect(-12 * k, -3 * k, 16 * k, 6 * k);
        g.fillStyle = '#c98a4a'; g.fillRect(4 * k, -3 * k, 9 * k, 6 * k);
        g.fillStyle = '#3a3634'; g.fillRect(-14 * k, -3 * k, 2.5 * k, 6 * k);
        g.restore();
      }
    },
  },
  spill: {
    layer: 'gloss',
    // soda, sticky: a splash with droplets
    draw(g, S, r) {
      g.fillStyle = 'rgba(92,40,22,0.62)';
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2, rr = S * (0.22 + r() * 0.12);
        g.lineTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr * 0.8);
      }
      g.fill();
      for (let i = 0; i < 12; i++) { const a = r() * 6.3, d = S * (0.33 + r() * 0.12); blob(g, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * 0.025, S * 0.025, '92,40,22', 0.7, 0.5); }
    },
  },
  gum: { draw(g, S, r) { for (let i = 0; i < 7; i++) { const x = S * (0.15 + r() * 0.7), y = S * (0.15 + r() * 0.7); blob(g, x, y, S * 0.05, S * 0.045, '70,70,74', 0.85, 0.5); blob(g, x, y, S * 0.03, S * 0.028, '120,120,126', 0.5); } } },
  arrow: {
    // a painted floor arrow, white (tint it), worn
    draw(g, S, r) {
      g.fillStyle = 'rgba(250,250,248,0.95)';
      g.beginPath(); g.moveTo(S * 0.5, S * 0.06); g.lineTo(S * 0.86, S * 0.44); g.lineTo(S * 0.62, S * 0.44); g.lineTo(S * 0.62, S * 0.94);
      g.lineTo(S * 0.38, S * 0.94); g.lineTo(S * 0.38, S * 0.44); g.lineTo(S * 0.14, S * 0.44); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.6})`; g.fillRect(r() * S, r() * S, S * 0.03 * r(), S * 0.01); }
      g.globalCompositeOperation = 'source-over';
    },
  },
  hazard: {
    // diagonal hazard stripes: dark bands on white (tint the white)
    span: [2, 1],
    draw(g, S) {
      const W = S * 2;
      g.fillStyle = '#f2f2ee'; g.fillRect(0, S * 0.1, W, S * 0.8);
      g.save(); g.beginPath(); g.rect(0, S * 0.1, W, S * 0.8); g.clip();
      g.fillStyle = '#1b1c1e';
      for (let x = -S; x < W + S; x += S * 0.5) { g.beginPath(); g.moveTo(x, S * 0.9); g.lineTo(x + S * 0.25, S * 0.9); g.lineTo(x + S * 1.05, S * 0.1); g.lineTo(x + S * 0.8, S * 0.1); g.fill(); }
      g.restore();
    },
  },
  deck: {
    // a 60 cm hardwood deck tile: six slats, gaps, weathered
    draw(g, S, r) {
      const k = S / 256, n = 6, w = S / n;
      for (let i = 0; i < n; i++) {
        const v = 0.8 + r() * 0.25;
        g.fillStyle = `rgb(${(128 * v) | 0},${(94 * v) | 0},${(64 * v) | 0})`;
        g.fillRect(i * w + 1.5 * k, 1.5 * k, w - 3 * k, S - 3 * k);
        for (let j = 0; j < 14; j++) { g.fillStyle = `rgba(60,40,24,${0.08 + r() * 0.1})`; g.fillRect(i * w + r() * w, 0, 1 * k, S); }
      }
    },
  },
  moss: { draw(g, S, r) { for (let i = 0; i < 40; i++) blob(g, S * (0.1 + r() * 0.8), S * (0.35 + r() * 0.3), S * (0.03 + r() * 0.08), S * (0.02 + r() * 0.05), r() < 0.5 ? '70,92,40' : '52,70,34', 0.55); } },
  scraps: {
    // a few bits of torn paper and a receipt
    draw(g, S, r) {
      const k = S / 256;
      for (let i = 0; i < 9; i++) {
        g.save(); g.translate(S * (0.15 + r() * 0.7), S * (0.15 + r() * 0.7)); g.rotate(r() * 6.3);
        g.fillStyle = r() < 0.3 ? '#f2e3c6' : '#f6f5f0';
        const w = (10 + r() * 26) * k, h = (6 + r() * 16) * k;
        g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2 + r() * 3 * k); g.lineTo(w / 2 - r() * 4 * k, h / 2); g.lineTo(-w / 2, h / 2); g.fill();
        g.restore();
      }
      g.save(); g.translate(S * 0.6, S * 0.4); g.rotate(0.4);
      g.fillStyle = '#fbfaf6'; g.fillRect(-12 * k, -40 * k, 24 * k, 80 * k);
      g.fillStyle = 'rgba(40,40,40,0.5)'; for (let y = -34; y < 34; y += 5) g.fillRect(-9 * k, y * k, (8 + r() * 10) * k, 1.4 * k);
      g.restore();
    },
  },
  joint: {
    // an expansion joint / paving seam: a dark line with a little spalling
    span: [2, 1],
    draw(g, S, r) {
      const W = S * 2, k = S / 256;
      g.fillStyle = 'rgba(20,20,18,0.8)'; g.fillRect(0, S / 2 - 2 * k, W, 4 * k);
      for (let i = 0; i < 40; i++) blob(g, r() * W, S / 2 + (r() - 0.5) * 8 * k, (3 + r() * 6) * k, (2 + r() * 3) * k, '30,30,28', 0.35);
    },
  },
  // ---- prints for clutter (labels, stickers, signage) — cards on models
  lbl_paper: { draw(g, S) { label(g, S, '#2f6fb5', 'PAPER'); } },
  lbl_plastic: { draw(g, S) { label(g, S, '#e07a2e', 'PLASTIC'); } },
  lbl_waste: { draw(g, S) { label(g, S, '#3a3d42', 'WASTE'); } },
  lbl_glass: { draw(g, S) { label(g, S, '#2e8b57', 'GLASS'); } },
  parcel: {
    // a shipping label: barcode, address block
    draw(g, S, r) {
      const k = S / 256;
      g.fillStyle = '#fbfbf8'; g.fillRect(S * 0.08, S * 0.12, S * 0.84, S * 0.76);
      g.fillStyle = '#111';
      for (let x = S * 0.14; x < S * 0.86; x += (2 + r() * 5) * k) g.fillRect(x, S * 0.18, (1 + r() * 3) * k, S * 0.2);
      g.fillStyle = 'rgba(20,20,20,0.7)';
      for (let i = 0; i < 5; i++) g.fillRect(S * 0.14, S * 0.46 + i * 12 * k, S * (0.3 + r() * 0.4), 4 * k);
      g.fillStyle = '#c0392b'; g.fillRect(S * 0.66, S * 0.66, S * 0.2, S * 0.16);
    },
  },
  fragile: {
    draw(g, S) {
      const k = S / 256;
      g.strokeStyle = '#b8322a'; g.lineWidth = 6 * k; g.strokeRect(S * 0.1, S * 0.25, S * 0.8, S * 0.5);
      text(g, 'FRAGILE', S / 2, S * 0.43, 40 * k, '#b8322a', 900);
      text(g, 'THIS SIDE UP', S / 2, S * 0.62, 18 * k, '#b8322a', 800);
    },
  },
  wetfloor: {
    // the A-frame's print: warning triangle, slipping figure, words
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#16181b';
      g.beginPath(); g.moveTo(S / 2, S * 0.06); g.lineTo(S * 0.9, S * 0.62); g.lineTo(S * 0.1, S * 0.62); g.closePath(); g.fill();
      g.fillStyle = '#f36b21';
      g.beginPath(); g.moveTo(S / 2, S * 0.15); g.lineTo(S * 0.8, S * 0.57); g.lineTo(S * 0.2, S * 0.57); g.closePath(); g.fill();
      g.strokeStyle = '#16181b'; g.lineWidth = 7 * k; g.lineCap = 'round';
      g.beginPath(); g.arc(S * 0.52, S * 0.28, 7 * k, 0, 6.3); g.fill();
      g.beginPath(); g.moveTo(S * 0.5, S * 0.33); g.lineTo(S * 0.44, S * 0.45); g.lineTo(S * 0.34, S * 0.5);
      g.moveTo(S * 0.44, S * 0.45); g.lineTo(S * 0.56, S * 0.5); g.moveTo(S * 0.49, S * 0.36); g.lineTo(S * 0.62, S * 0.38); g.stroke();
      text(g, 'CAUTION', S / 2, S * 0.74, 34 * k, '#16181b', 900);
      text(g, 'WET FLOOR', S / 2, S * 0.88, 30 * k, '#16181b', 900);
    },
  },
  nosmoke: {
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#f7f7f4'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.44, 0, 6.3); g.fill();
      g.fillStyle = '#222'; g.fillRect(S * 0.24, S * 0.47, S * 0.42, S * 0.07);
      g.fillStyle = '#c98a4a'; g.fillRect(S * 0.66, S * 0.47, S * 0.08, S * 0.07);
      g.strokeStyle = '#c0392b'; g.lineWidth = 14 * k;
      g.beginPath(); g.arc(S / 2, S / 2, S * 0.38, 0, 6.3); g.stroke();
      g.beginPath(); g.moveTo(S * 0.23, S * 0.23); g.lineTo(S * 0.77, S * 0.77); g.stroke();
    },
  },
  brand: {
    // a crate / cooler logo: a white wave on a coloured roundel (tint it)
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#ffffff'; rrect(g, S * 0.06, S * 0.2, S * 0.88, S * 0.6, 20 * k); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 8 * k;
      g.beginPath(); g.moveTo(S * 0.14, S * 0.56); g.bezierCurveTo(S * 0.35, S * 0.3, S * 0.6, S * 0.72, S * 0.86, S * 0.44); g.stroke();
      text(g, 'AQUA', S / 2, S * 0.38, 30 * k, 'rgba(0,0,0,0.6)', 900);
    },
  },
  vent: {
    // a louvred grille face (wall vents, convector ends), for a card
    draw(g, S) {
      const k = S / 256;
      g.fillStyle = '#d9dbdc'; rrect(g, S * 0.04, S * 0.04, S * 0.92, S * 0.92, 8 * k); g.fill();
      for (let y = S * 0.12; y < S * 0.86; y += 14 * k) {
        g.fillStyle = '#2b2e33'; g.fillRect(S * 0.1, y, S * 0.8, 7 * k);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(S * 0.1, y + 7 * k, S * 0.8, 1.5 * k);
      }
    },
  },
};

// recycling-bin label: a coloured band, the word, a recycle mark
function label(g, S, color, word) {
  const k = S / 256;
  g.fillStyle = color; rrect(g, S * 0.04, S * 0.28, S * 0.92, S * 0.44, 10 * k); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 5 * k;
  const cx = S * 0.2, cy = S / 2, rr = 20 * k;
  for (let i = 0; i < 3; i++) {
    const a0 = i * 2.1 + 0.3;
    g.beginPath(); g.arc(cx, cy, rr, a0, a0 + 1.5); g.stroke();
  }
  text(g, word, S * 0.6, S / 2 + 1 * k, (word.length > 6 ? 36 : 42) * k, '#ffffff', 900);
}

// ------------------------------------------------------------ the atlas
// Cells are handed out in registry order (built-ins, then each map's kinds
// file), row-major, each kind taking its span. The layout is a pure
// function of the registry, so uvs are known before the texture exists.
let layout = null;
let registry = BUILTIN_DECALS;
export function setDecalKinds(kinds) { registry = kinds; layout = null; }
function cells() {
  if (layout) return layout;
  const used = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
  layout = new Map();
  for (const [kind, def] of Object.entries(registry)) {
    const [sw, sh] = def.span || [1, 1];
    let placed = false;
    for (let cy = 0; cy <= GRID - sh && !placed; cy++) {
      for (let cx = 0; cx <= GRID - sw && !placed; cx++) {
        let free = true;
        for (let y = 0; y < sh && free; y++) for (let x = 0; x < sw && free; x++) if (used[cy + y][cx + x]) free = false;
        if (!free) continue;
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) used[cy + y][cx + x] = true;
        layout.set(kind, { cx, cy, sw, sh, def });
        placed = true;
      }
    }
    if (!placed && typeof console !== 'undefined') console.warn(`decals: atlas full, no room for ${kind}`);
  }
  return layout;
}

// uv rect [u0, v0, u1, v1] of a kind's cell (an unknown kind: the first)
export function decalUV(kind) {
  const L = cells();
  const c = L.get(kind) || L.values().next().value;
  const pad = 2.5 / 256 / GRID; // half a few texels in: no bleed from the neighbours
  return [c.cx / GRID + pad, 1 - (c.cy + c.sh) / GRID + pad, (c.cx + c.sw) / GRID - pad, 1 - c.cy / GRID - pad];
}
export const decalLayer = (kind) => cells().get(kind)?.def.layer || 'matte';
export const hasDecal = (kind) => cells().has(kind);

// The texture: painted on a canvas, read back, the colour of each cell
// bled under its transparent texels (a canvas stores premultiplied colour,
// so transparent texels come back black and mipmaps would ring every paper
// sheet in grey), then uploaded as straight alpha.
let atlasTex = null;
export function decalAtlas() {
  if (atlasTex) return atlasTex;
  const size = LOWFX ? 1024 : 2048, S = size / GRID;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, size, size);
  let seed = 11;
  for (const c of cells().values()) {
    g.save();
    g.translate(c.cx * S, c.cy * S);
    g.beginPath(); g.rect(0, 0, c.sw * S, c.sh * S); g.clip();
    try { c.def.draw(g, S, rng(seed++)); } catch (e) { console.warn('decals: painter failed', e); }
    g.restore();
  }
  const img = g.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);
  for (const c of cells().values()) {
    const x0 = c.cx * S, y0 = c.cy * S, x1 = x0 + c.sw * S, y1 = y0 + c.sh * S;
    let R = 0, G = 0, B = 0, A = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * size + x) * 4, a = img[i + 3];
      R += img[i] * a; G += img[i + 1] * a; B += img[i + 2] * a; A += a;
    }
    const br = A ? R / A : 128, bg = A ? G / A : 128, bb = A ? B / A : 128;
    for (let y = y0; y < y1; y++) {
      const row = (size - 1 - y) * size; // flip: canvas rows run down, v runs up
      for (let x = x0; x < x1; x++) {
        const i = (y * size + x) * 4, o = (row + x) * 4, a = img[i + 3];
        // faint texels keep a colour between their own and the cell's average
        const t = a >= 48 ? 1 : a / 48;
        out[o] = img[i] * t + br * (1 - t); out[o + 1] = img[i + 1] * t + bg * (1 - t); out[o + 2] = img[i + 2] * t + bb * (1 - t);
        out[o + 3] = a;
      }
    }
  }
  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  atlasTex = tex;
  return tex;
}

// The two decal materials. Lit (a stain in the shade is in the shade),
// transparent, never writing depth, pulled toward the camera.
const mats = {};
export function decalMaterial(layer = 'matte') {
  if (mats[layer]) return mats[layer];
  const gloss = layer === 'gloss';
  mats[layer] = new THREE.MeshStandardMaterial({
    map: decalAtlas(), vertexColors: true, transparent: true, depthWrite: false,
    roughness: gloss ? 0.06 : 0.9, metalness: gloss ? 0.4 : 0, envMapIntensity: gloss ? 1.8 : 0.6,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mats[layer].name = `decal-${layer}`;
  return mats[layer];
}

// ------------------------------------------------------------ geometry
// Quads in WORLD UNITS: floor cards from (x, z, w, d, rot) in metres, and
// cards with a full matrix in world metres (labels on clutter).
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color();

export function decalGeometry(floor, cards) {
  const byLayer = {};
  const push = (kind, corners, normal, a, tint) => {
    const L = (byLayer[decalLayer(kind)] ||= { P: [], N: [], U: [], C: [] });
    const [u0, v0, u1, v1] = decalUV(kind);
    const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    _c.set(tint || '#ffffff');
    for (const t of [0, 1, 2, 0, 2, 3]) {
      L.P.push(...corners[t]); L.N.push(normal.x, normal.y, normal.z);
      L.U.push(...uv[t]); L.C.push(_c.r, _c.g, _c.b, a);
    }
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (const { kind, x, z, w, d, rot = 0, a = 1, tint = null, y = 0 } of floor) {
    // the cellar's frame: a plane turned rot in its own plane, then laid
    // flat (local y → world −z)
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (px, py) => [(x + px * c - py * s) * M, y * M + DECAL_Y, (z - (px * s + py * c)) * M];
    push(kind, [at(-w / 2, -d / 2), at(w / 2, -d / 2), at(w / 2, d / 2), at(-w / 2, d / 2)], up, a, tint);
  }
  for (const { kind, m, w, h, a = 1, tint = null } of cards) {
    _nm.getNormalMatrix(m);
    _n.set(0, 0, 1).applyMatrix3(_nm).normalize();
    const at = (px, py) => { _v.set(px, py, 0).applyMatrix4(m).multiplyScalar(M); return [_v.x, _v.y, _v.z]; };
    push(kind, [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)], _n.clone(), a, tint);
  }
  const out = {};
  for (const [layer, L] of Object.entries(byLayer)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(L.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(L.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(L.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(L.C, 4));
    g.computeBoundingSphere();
    out[layer] = g;
  }
  return out;
}

// A map's floor cards: its DECALS (unless its theme draws them itself) and
// its STAINS, as { kind, x, z, w, d, rot, a, tint, y } in metres.
export function floorDecals(map, { ownDecals = false } = {}) {
  const out = [];
  if (!ownDecals) {
    for (const [kind, x, z, w, d, rot = 0, a = 1, extra] of map.DECALS || []) {
      const o = typeof extra === 'string' ? { tint: extra } : extra || {};
      out.push({ kind, x, z, w, d, rot, a, tint: o.tint || null, y: o.y || 0 });
    }
  }
  // the old stain meshes: a size-s stain was s·0.35 × s·0.3 m, turned i·1.7
  (map.STAINS || []).forEach(([x, z, s], i) => out.push({ kind: 'stain', x, z, w: s * 0.35, d: s * 0.3, rot: i * 1.7, a: 1 }));
  return out;
}
