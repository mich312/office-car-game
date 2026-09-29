// Procedural canvas textures — no asset files, everything generated.
import * as THREE from 'three';

const cache = new Map();

function canvasTex(baseKey, w, h, draw, repeat = [1, 1]) {
  // repeat is baked into the key: the same drawing at different tilings must
  // not share one texture object (callers mutate .repeat via canvasTex only)
  const key = `${baseKey}@${repeat[0]}x${repeat[1]}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export const carpetTex = (color = '#3e4a5e', repeat = [18, 18]) =>
  canvasTex(`carpet${color}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) {
      const v = Math.random();
      g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.045)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  }, repeat);

export const woodTex = (repeat = [10, 10]) =>
  canvasTex('wood', 256, 256, (g, w, h) => {
    g.fillStyle = '#8a6238';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgba(60,38,18,${0.25 + Math.random() * 0.2})`;
      g.fillRect(0, y, w, 2);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(${90 + Math.random() * 60},${55 + Math.random() * 30},25,0.16)`;
        g.beginPath();
        const yy = y + 4 + Math.random() * 26;
        g.moveTo(0, yy);
        g.bezierCurveTo(w * 0.3, yy + Math.random() * 5 - 2, w * 0.7, yy + Math.random() * 5 - 2, w, yy);
        g.stroke();
      }
    }
  }, repeat);

export const tileTex = (repeat = [14, 14]) =>
  canvasTex('tile', 128, 128, (g, w, h) => {
    g.fillStyle = '#c9cdd4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,75,88,0.7)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(6, 6, w - 12, h / 3);
  }, repeat);

export const concreteTex = (repeat = [8, 8]) =>
  canvasTex('concrete', 128, 128, (g, w, h) => {
    g.fillStyle = '#8f9299';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const v = 120 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v},${v + 6},0.12)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, repeat);

// Access-floor panels: 60 cm tiles in a steel trim grid (server rooms).
export const raisedTex = (repeat = [8, 8]) =>
  canvasTex('raised', 128, 128, (g, w, h) => {
    g.fillStyle = '#8e949a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 125 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.18)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    g.strokeStyle = '#2a2d31';
    g.lineWidth = 4;
    g.strokeRect(0, 0, w, h);
  }, repeat);

// Polished stone: large slabs, grey veins wandering across them. Slab joints
// line up with the marble surface's seams (shared/src/surfaces.js, grid 8).
export const marbleTex = (repeat = [8, 8]) =>
  canvasTex('marble', 256, 256, (g, w, h) => {
    g.fillStyle = '#e9e6e0';
    g.fillRect(0, 0, w, h);
    // soft cloudy base
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 70;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const v = 205 + Math.random() * 35;
      grad.addColorStop(0, `rgba(${v},${v - 2},${v - 6},0.35)`);
      grad.addColorStop(1, `rgba(${v},${v - 2},${v - 6},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
    // veins: long wandering strokes, a few bold, many faint
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(${90 + Math.random() * 50},${95 + Math.random() * 50},${105 + Math.random() * 50},${i < 4 ? 0.45 : 0.14})`;
      g.lineWidth = i < 4 ? 1.6 : 0.8;
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += (Math.random() - 0.3) * 60; y += (Math.random() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // slab joint
    g.strokeStyle = 'rgba(120,118,112,0.55)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, repeat);

// Poured resin: flat grey-green with coloured flake, the factory floor.
export const epoxyTex = (color = '#7e8b86', repeat = [10, 10]) =>
  canvasTex(`epoxy${color}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const flakes = ['#d9dcd6', '#3b403e', '#a7b0ab', '#5d6663'];
    for (let i = 0; i < 900; i++) {
      g.fillStyle = flakes[i % flakes.length];
      g.globalAlpha = 0.25;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1 + Math.random());
    }
    g.globalAlpha = 1;
  }, repeat);

// Coin-pattern rubber matting (garages, workshops, gyms).
export const rubberTex = (repeat = [16, 16]) =>
  canvasTex('rubber', 64, 64, (g, w, h) => {
    g.fillStyle = '#2b2d30';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#34373b';
    for (let y = 8; y < h; y += 16) {
      for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
    }
  }, repeat);

export const stainTex = () =>
  canvasTex('stain', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(74,46,18,0.0)');
    grad.addColorStop(0.62, 'rgba(74,46,18,0.28)');
    grad.addColorStop(0.78, 'rgba(60,36,14,0.5)');
    grad.addColorStop(0.86, 'rgba(60,36,14,0.1)');
    grad.addColorStop(1, 'rgba(60,36,14,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 10, 0.3, 0, Math.PI * 2);
    g.fill();
  });

export const keysTex = () =>
  canvasTex('keys', 256, 96, (g, w, h) => {
    g.fillStyle = '#23262d';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 13; c++) {
        const kw = c === 6 && r === 3 ? 52 : 16; // spacebar
        const x = 6 + c * 19, y = 8 + r * 22;
        if (c === 6 && r === 3) { if (x + kw > w - 6) continue; }
        g.fillStyle = '#3a3f4a';
        g.fillRect(x, y, kw, 16);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, y, kw, 3);
      }
    }
  });

export const smudgeTex = () =>
  canvasTex('smudge', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 9;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });

// Animated fake-terminal screen; call tick() occasionally to scroll.
export function makeScreen(kind = 'code') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let lines = [];
  const colors = kind === 'code' ? ['#7ee787', '#79c0ff', '#ffa657', '#d2a8ff'] : ['#e6edf3'];
  function tick() {
    lines.push({ w: 30 + Math.random() * 180, c: colors[(Math.random() * colors.length) | 0], indent: (Math.random() * 3 | 0) * 14 });
    if (lines.length > 13) lines.shift();
    g.fillStyle = kind === 'chart' ? '#0d1420' : '#0d1117';
    g.fillRect(0, 0, 256, 160);
    if (kind === 'chart') {
      g.strokeStyle = '#3fb950'; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, 120 - Math.random() * 70);
      g.stroke();
      g.fillStyle = '#79c0ff';
      for (let i = 0; i < 6; i++) g.fillRect(10 + i * 40, 130, 26, 18);
    } else {
      lines.forEach((l, i) => { g.fillStyle = l.c; g.fillRect(8 + l.indent, 8 + i * 11, l.w, 6); });
      g.fillStyle = '#e6edf3';
      if (Math.random() > 0.5) g.fillRect(8, 8 + lines.length * 11, 8, 8); // cursor
    }
    tex.needsUpdate = true;
  }
  for (let i = 0; i < 10; i++) tick();
  return { tex, tick };
}

// Licence plate: an office-issue asset tag. The driver name is squeezed onto
// the plate (uppercased, punctuation stripped), so every car in the lobby
// carries its owner's name in 12 px of chrome-ish plastic.
export const plateTex = (text) => {
  const label = (String(text || 'RC')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim() || 'RC').slice(0, 7);
  return canvasTex(`plate-${label}`, 192, 96, (g, w, h) => {
    g.fillStyle = '#eef1f6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8d97a8';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    // blue euro-plate stripe with a tiny office motif
    g.fillStyle = '#1e4fa8';
    g.fillRect(6, 6, 26, h - 12);
    g.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) g.fillRect(15, 22 + i * 18, 8, 6);
    g.fillStyle = '#14161c';
    g.font = 'bold 46px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, (w + 26) / 2, h / 2 + 3, w - 56);
  });
};

// Soft radial glow — floor light pools under the ceiling fixtures. Painting
// the light's "cast" into cheap additive quads fakes many lights for free.
export const glowTex = () =>
  canvasTex('glow', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });

// Vertical light-shaft card with blind-slat stripes, fading toward the floor.
export const shaftTex = () =>
  canvasTex('shaft', 128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    // slats: bright bands separated by gaps, softened edges
    for (let x = 0; x < w; x += 22) {
      g.fillRect(x + 3, 0, 13, h);
    }
    // horizontal fade at the card's left/right edges
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(0.18, 'rgba(0,0,0,0)');
    edge.addColorStop(0.82, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  });

export const skylineTex = () =>
  canvasTex('skyline', 1024, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a1024');
    grad.addColorStop(1, '#1c2b52');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w;) {
      const bw = 24 + Math.random() * 60;
      const bh = 60 + Math.random() * 160;
      g.fillStyle = '#060913';
      g.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 6; wy < h - 8; wy += 10) {
        for (let wx = x + 4; wx < x + bw - 6; wx += 9) {
          if (Math.random() > 0.55) {
            g.fillStyle = Math.random() > 0.9 ? 'rgba(255,214,140,0.95)' : 'rgba(255,214,140,0.45)';
            g.fillRect(wx, wy, 4, 5);
          }
        }
      }
      x += bw + 6 + Math.random() * 30;
    }
  });

// ---------------------------------------------------------------------------
// Vinyl decals (NFS-style). Transparent canvases wrapped onto thin planes
// hugging the car body — one for the roof/hood, one mirrored pair for the
// sides. Deterministic drawing so every client renders the same wrap.
const hexPath = (g, x, y, r) => {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
};

// Top wrap: canvas x = car width, canvas y = car length (top of canvas = rear).
export const vinylTopTex = (id, color) =>
  canvasTex(`vinylT-${id}-${color}`, 256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.strokeStyle = color;
    switch (id) {
      case 'stripes':
        g.fillRect(w * 0.34, 0, w * 0.115, h);
        g.fillRect(w * 0.545, 0, w * 0.115, h);
        break;
      case 'bolt': {
        g.beginPath();
        g.moveTo(w * 0.62, h);
        g.lineTo(w * 0.34, h * 0.52);
        g.lineTo(w * 0.52, h * 0.5);
        g.lineTo(w * 0.38, 0);
        g.lineTo(w * 0.72, h * 0.42);
        g.lineTo(w * 0.52, h * 0.45);
        g.lineTo(w * 0.78, h);
        g.closePath();
        g.fill();
        break;
      }
      case 'hex': {
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 5; c++) {
            const x = 26 + c * 52 + (r % 2) * 26;
            const y = 34 + r * 62;
            const rr = 16 + ((r * 5 + c * 3) % 3) * 5;
            g.globalAlpha = 0.35 + ((r * 7 + c * 5) % 5) * 0.13;
            hexPath(g, x, y, rr);
            if ((r + c) % 3 === 0) g.fill();
            else { g.lineWidth = 4; g.stroke(); }
          }
        }
        g.globalAlpha = 1;
        break;
      }
      case 'tribal': {
        g.lineWidth = 12;
        g.lineCap = 'round';
        for (const sx of [1, -1]) {
          g.save();
          g.translate(w / 2, 0);
          g.scale(sx, 1);
          g.beginPath();
          g.moveTo(w * 0.42, h * 0.06);
          g.bezierCurveTo(w * 0.1, h * 0.28, w * 0.46, h * 0.42, w * 0.14, h * 0.62);
          g.stroke();
          g.lineWidth = 7;
          g.beginPath();
          g.moveTo(w * 0.44, h * 0.4);
          g.bezierCurveTo(w * 0.16, h * 0.55, w * 0.42, h * 0.72, w * 0.1, h * 0.94);
          g.stroke();
          g.restore();
          g.lineWidth = 12;
        }
        break;
      }
      case 'flames': {
        // hood licks: flames creeping up from the front (bottom of canvas)
        for (let i = 0; i < 5; i++) {
          const x = w * (0.14 + i * 0.18);
          g.beginPath();
          g.moveTo(x - 14, h);
          g.quadraticCurveTo(x - 18, h * 0.9, x, h * (0.78 + (i % 2) * 0.06));
          g.quadraticCurveTo(x + 18, h * 0.9, x + 14, h);
          g.closePath();
          g.fill();
        }
        break;
      }
      default: break;
    }
  });

// Side wrap: canvas x = car length, canvas y = height.
export const vinylSideTex = (id, color) =>
  canvasTex(`vinylS-${id}-${color}`, 512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.strokeStyle = color;
    switch (id) {
      case 'stripes':
        g.fillRect(0, h * 0.62, w, h * 0.16);
        break;
      case 'bolt': {
        g.beginPath();
        g.moveTo(0, h * 0.4);
        for (let x = 0; x <= w; x += 64) {
          g.lineTo(x + 32, h * 0.62);
          g.lineTo(x + 64, h * 0.4);
        }
        g.lineTo(w, h * 0.58);
        for (let x = w; x >= 0; x -= 64) {
          g.lineTo(x - 32, h * 0.8);
          g.lineTo(x - 64, h * 0.58);
        }
        g.closePath();
        g.fill();
        break;
      }
      case 'hex': {
        for (let c = 0; c < 9; c++) {
          const x = 30 + c * 56;
          const y = h * (0.3 + ((c * 13) % 5) * 0.11);
          g.globalAlpha = 0.35 + ((c * 7) % 5) * 0.13;
          hexPath(g, x, y, 13 + ((c * 3) % 3) * 4);
          if (c % 3 === 0) g.fill();
          else { g.lineWidth = 3; g.stroke(); }
        }
        g.globalAlpha = 1;
        break;
      }
      case 'tribal': {
        g.lineWidth = 8;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(w * 0.02, h * 0.7);
        g.bezierCurveTo(w * 0.3, h * 0.15, w * 0.45, h * 0.95, w * 0.7, h * 0.4);
        g.quadraticCurveTo(w * 0.82, h * 0.16, w * 0.98, h * 0.3);
        g.stroke();
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(w * 0.1, h * 0.9);
        g.quadraticCurveTo(w * 0.4, h * 0.55, w * 0.6, h * 0.75);
        g.stroke();
        break;
      }
      case 'flames': {
        // classic flame job pouring back from the nose
        g.beginPath();
        g.moveTo(0, h);
        g.lineTo(0, h * 0.15);
        let x = 0;
        const tips = [0.45, 0.25, 0.55, 0.3, 0.65, 0.45, 0.8];
        for (let i = 0; i < tips.length; i++) {
          const nx = w * ((i + 1) / tips.length) * 0.85;
          g.quadraticCurveTo((x + nx) / 2, h * (tips[i] - 0.22), nx, h * tips[i]);
          x = nx;
        }
        g.quadraticCurveTo(w * 0.92, h * 0.9, w * 0.6, h);
        g.closePath();
        g.fill();
        break;
      }
      default: break;
    }
  });

// ---------------------------------------------------------------- surfaces
//
// Normal and roughness maps, generated the same way everything else here is:
// draw a greyscale height field on a canvas, then differentiate it. Zero
// external assets still holds — these are a Sobel pass over a drawing.
//
// Two things matter for them to actually work:
//  * the derivative wraps at the edges, so the maps tile seamlessly like the
//    albedo they sit under;
//  * they are NOT sRGB. A normal map is vector data — decode it as colour and
//    every surface tilts the wrong way, subtly, everywhere.
//
// At 18 cm car scale these are what stop a desk reading as a coloured box:
// wood grain catches a low sun, carpet fibre kills the plastic sheen, grout
// lines in the kitchen tile finally have depth.

const normalCache = new Map();

function heightToNormal(g, w, h, strength) {
  const src = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h);
  const d = out.data;
  // wrap the sample so the derivative is continuous across the tile seam
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

// Shared by normal and roughness maps: same drawing pipeline, linear data.
function dataTex(key, w, h, draw, repeat, post) {
  const id = `${key}@${repeat[0]}x${repeat[1]}`;
  if (normalCache.has(id)) return normalCache.get(id);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, w, h);
  if (post) post(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace; // vector/scalar data, never colour
  normalCache.set(id, tex);
  return tex;
}

const normalTex = (key, w, h, draw, strength, repeat) =>
  dataTex(`n:${key}:${strength}`, w, h, draw, repeat, (g, ww, hh) => heightToNormal(g, ww, hh, strength));

const scalarTex = (key, w, h, draw, repeat) => dataTex(`s:${key}`, w, h, draw, repeat);

const fill = (g, w, h, v) => { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, w, h); };

// Loop pile: dense short fibres, no direction.
export const carpetNormal = (repeat = [18, 18]) =>
  normalTex('carpet', 128, 128, (g, w, h) => {
    fill(g, w, h, 128);
    for (let i = 0; i < 5200; i++) {
      const v = 90 + Math.random() * 120;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
  }, 2.4, repeat);

// Plank grain plus the groove between boards.
export const woodNormal = (repeat = [10, 10]) =>
  normalTex('wood', 256, 256, (g, w, h) => {
    fill(g, w, h, 150);
    for (let y = 0; y < h; y += 32) {
      // A shallow joint, not a trench. At [2,1] tiling on a desk-sized slab the
      // old 2px black groove stretched into hard ridges that read as corrugated
      // siding under a raking sun — the grain is meant to carry this, not the
      // joint.
      g.fillStyle = 'rgb(96,96,96)';
      g.fillRect(0, y, w, 1);
      for (let i = 0; i < 46; i++) {
        g.strokeStyle = `rgba(${100 + Math.random() * 70},0,0,0.5)`;
        g.lineWidth = 0.8 + Math.random();
        g.beginPath();
        const yy = y + 4 + Math.random() * 26;
        g.moveTo(0, yy);
        g.bezierCurveTo(w * 0.3, yy + Math.random() * 4 - 2, w * 0.7, yy + Math.random() * 4 - 2, w, yy);
        g.stroke();
      }
    }
  }, 1.0, repeat);

// Grout is the whole point — a deep channel around a flat, faintly domed tile.
export const tileNormal = (repeat = [14, 14]) =>
  normalTex('tile', 128, 128, (g, w, h) => {
    fill(g, w, h, 30);                      // grout floor
    const r = 8;
    g.fillStyle = 'rgb(210,210,210)';
    g.beginPath();
    g.roundRect ? g.roundRect(5, 5, w - 10, h - 10, r) : g.rect(5, 5, w - 10, h - 10);
    g.fill();
  }, 3.2, repeat);

export const concreteNormal = (repeat = [8, 8]) =>
  normalTex('concrete', 128, 128, (g, w, h) => {
    fill(g, w, h, 128);
    for (let i = 0; i < 2400; i++) {
      const v = 96 + Math.random() * 90;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 1.9, 0, Math.PI * 2);
      g.fill();
    }
  }, 1.7, repeat);

// Access floor: each panel sits a hair proud of its trim.
export const raisedNormal = (repeat = [8, 8]) =>
  normalTex('raised', 128, 128, (g, w, h) => {
    fill(g, w, h, 60);
    g.fillStyle = 'rgb(200,200,200)';
    g.fillRect(3, 3, w - 6, h - 6);
  }, 1.6, repeat);

// Marble: the stone is glassy — only the slab joints have relief.
export const marbleNormal = (repeat = [8, 8]) =>
  normalTex('marble', 128, 128, (g, w, h) => {
    fill(g, w, h, 200);
    g.strokeStyle = 'rgb(40,40,40)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, 2.0, repeat);

// Rubber matting: raised coins.
export const rubberNormal = (repeat = [16, 16]) =>
  normalTex('rubber', 64, 64, (g, w, h) => {
    fill(g, w, h, 90);
    g.fillStyle = 'rgb(220,220,220)';
    for (let y = 8; y < h; y += 16) {
      for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
    }
  }, 2.6, repeat);

// Woven upholstery: a visible warp/weft grid at this scale.
export const fabricNormal = (repeat = [6, 6]) =>
  normalTex('fabric', 128, 128, (g, w, h) => {
    fill(g, w, h, 120);
    for (let i = 0; i < w; i += 4) {
      g.fillStyle = 'rgb(180,180,180)';
      g.fillRect(i, 0, 2, h);
      g.fillRect(0, i, w, 2);
    }
    for (let i = 0; i < 900; i++) {
      const v = 100 + Math.random() * 80;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
    }
  }, 2, repeat);

// Orange peel — the faint texture of moulded plastic and matt wall paint.
// Strength is low on purpose: you should never see it, only miss it.
export const orangePeel = (key = 'peel', strength = 0.7, repeat = [4, 4]) =>
  normalTex(key, 128, 128, (g, w, h) => {
    fill(g, w, h, 128);
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 3 + Math.random() * 7;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const v = Math.random() > 0.5 ? 168 : 92;
      grad.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, strength, repeat);

// Roughness breakup. Uniform roughness is the other half of why untextured
// PBR reads as plastic: real floors have polished tracks and dull patches.
export const wearRough = (key, base, spread, repeat = [6, 6]) =>
  scalarTex(`wear${key}${base}${spread}`, 128, 128, (g, w, h) => {
    fill(g, w, h, base);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 8 + Math.random() * 26;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const v = base + (Math.random() * 2 - 1) * spread;
      grad.addColorStop(0, `rgba(${v},${v},${v},0.65)`);
      // Fade to the SAME value, transparent — not to transparent black. The
      // gradient interpolates colour and alpha separately, so a fade to
      // rgba(0,0,0,0) drags the blotch's rim toward 0 on the way out: a dark
      // ring, and dark in a roughness map is GLOSS. Every blotch grew a shiny
      // halo, and a raking golden-hour sun lit the carpet up in pools.
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, repeat);

// ---------------------------------------------------------------------------
// The furniture kit's surfaces (materials.js). Every model's UVs are in
// metres (kit.js), so each of these is drawn as a real-size tile and its
// repeat is 1 / (tile size in metres): one texture then reads the same on a
// 10 m counter and a 4 cm drawer pull. Seeded, so every client draws the
// same grain, the same books, the same art.

// mulberry32: small, fast, good enough for wood grain
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

const perMetre = (w, h = w) => [1 / w, 1 / h];

// Veneer: long flowing grain, no plank joints (a desk top is one leaf). Drawn
// near-white so the material colour sets the species — oak and walnut share
// it. Canvas x = along the grain = kit u, the long side of every face.
function drawGrain(g, w, h, r, dark) {
  for (let i = 0; i < 110; i++) {
    const y = r() * h;
    const amp = 1 + r() * 4;
    const ph = r() * 6;
    g.strokeStyle = dark(r);
    g.lineWidth = 0.5 + r() * 1.6;
    g.beginPath();
    for (let x = -4; x <= w + 4; x += 8) {
      const yy = y + Math.sin(x / w * Math.PI * 2 * (1 + (i % 3)) + ph) * amp;
      x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
    }
    g.stroke();
  }
  // a few cathedral arches: the figure that says "real tree"
  for (let k = 0; k < 3; k++) {
    const cx = r() * w, cy = r() * h, len = 80 + r() * 140;
    for (let j = 0; j < 7; j++) {
      g.strokeStyle = dark(r);
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, len * (1 - j * 0.11), 6 + j * 3.2, 0, Math.PI * 0.08, Math.PI * 0.92);
      g.stroke();
    }
  }
}

export const veneerTex = () =>
  canvasTex('veneer', 512, 128, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#f4ece0';
    g.fillRect(0, 0, w, h);
    drawGrain(g, w, h, r, (q) => `rgba(${120 + q() * 50},${80 + q() * 30},${40 + q() * 20},${0.08 + q() * 0.16})`);
    // pores: short dark dashes along the grain
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(90,60,30,${0.08 + r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 5, 0.8);
    }
  }, perMetre(1.2, 0.3));

export const veneerNormal = () =>
  normalTex('veneer', 512, 128, (g, w, h) => {
    const r = rng(11);
    fill(g, w, h, 150);
    drawGrain(g, w, h, r, (q) => `rgba(${70 + q() * 40},0,0,0.5)`);
  }, 0.8, perMetre(1.2, 0.3));

// Butcher block: glued strips 4 cm wide, each its own shade.
export const butcherTex = () =>
  canvasTex('butcher', 256, 256, (g, w, h) => {
    const r = rng(5);
    for (let i = 0; i < 8; i++) {
      const v = 215 + r() * 40;
      g.fillStyle = `rgb(${v},${v * 0.93},${v * 0.84})`;
      g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(80,50,20,0.25)';
      g.fillRect(0, i * 32, w, 1);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(110,70,30,${0.06 + r() * 0.12})`;
        g.beginPath();
        const y = i * 32 + 2 + r() * 28;
        g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + r() * 3, w * 0.7, y - r() * 3, w, y);
        g.stroke();
      }
    }
  }, perMetre(1.28, 0.32));

// Brushed steel: fine streaks along u. Roughness 0.28–0.42 (data, not sRGB).
export const brushedRough = () =>
  scalarTex('brushed', 256, 64, (g, w, h) => {
    const r = rng(3);
    fill(g, w, h, 90);
    for (let i = 0; i < 700; i++) {
      const v = 71 + r() * 36;
      g.fillStyle = `rgba(${v},${v},${v},0.7)`;
      g.fillRect(r() * w, r() * h, 20 + r() * 120, 0.6 + r() * 0.8);
    }
  }, perMetre(0.5, 0.125));

// Hex perforation (rack doors, speaker grilles): white = metal, black = hole.
// An alphaMap reads green; alphaTest cuts the holes.
export const perfAlphaTex = () =>
  scalarTex('perf', 64, 111, (g, w, h) => {
    fill(g, w, h, 255);
    g.fillStyle = '#000';
    const s = 16; // 5 mm pitch: four holes across a 2 cm tile, eight rows down it
    for (let row = 0; row <= 8; row++) {
      for (let col = -1; col * s < w + s; col++) {
        const x = col * s + (row % 2) * s / 2, y = row * s * 0.866;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 + Math.PI / 6;
          g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * 6.9, y + Math.sin(a) * 6.9);
        }
        g.fill();
      }
    }
  }, perMetre(0.02, 0.02 * 111 / 64));

// Slotted angle (boltless shelving uprights): a keyhole slot every 5 cm.
export const slotAlphaTex = () =>
  scalarTex('slots', 16, 64, (g, w, h) => {
    fill(g, w, h, 255);
    g.fillStyle = '#000';
    g.fillRect(6, 10, 4, 22);
    g.beginPath(); g.arc(8, 34, 3.4, 0, Math.PI * 2); g.fill();
  }, perMetre(0.04, 0.05));

// Terrazzo worktops: stone chips in a pale binder.
export const terrazzoTex = () =>
  canvasTex('terrazzo', 256, 256, (g, w, h) => {
    const r = rng(21);
    g.fillStyle = '#e9e6df';
    g.fillRect(0, 0, w, h);
    const chips = ['#bdb7ab', '#8f8a80', '#d9cfbd', '#6d6a64', '#c9a98a', '#a7b0ae'];
    for (let i = 0; i < 900; i++) {
      g.fillStyle = chips[(r() * chips.length) | 0];
      g.globalAlpha = 0.55 + r() * 0.45;
      const x = r() * w, y = r() * h, s = 0.8 + r() * r() * 5;
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2 + r();
        g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * s * (0.6 + r() * 0.6), y + Math.sin(a) * s * (0.6 + r() * 0.6));
      }
      g.fill();
    }
    g.globalAlpha = 1;
  }, perMetre(0.6));

// Pebbled hide.
export const leatherNormal = () =>
  normalTex('leather', 128, 128, (g, w, h) => {
    const r = rng(8);
    fill(g, w, h, 150);
    for (let i = 0; i < 1300; i++) {
      const v = 90 + r() * 110;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.4, 0, Math.PI * 2); g.fill();
    }
  }, 1.4, perMetre(0.16));

// Kraft board: fibre, the odd darker scuff. The flutes show on cut edges only.
export const cardboardTex = () =>
  canvasTex('cardboard', 128, 128, (g, w, h) => {
    const r = rng(4);
    g.fillStyle = '#c29a66';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const v = r();
      g.fillStyle = v > 0.5 ? 'rgba(230,200,150,0.12)' : 'rgba(90,60,30,0.1)';
      g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
    }
  }, perMetre(0.4));

// Louvres (kick grilles, copier vents): horizontal fins every 8 mm.
export const louvreNormal = () =>
  normalTex('louvre', 16, 64, (g, w, h) => {
    for (let y = 0; y < h; y++) {
      const t = (y % 16) / 16;
      const v = Math.round(60 + 180 * Math.min(1, t * 1.6));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, y, w, 1);
    }
  }, 3, perMetre(0.032));

// Chequer plate (steel ramps, dock plates): raised diagonal lozenges.
export const chequerNormal = () =>
  normalTex('chequer', 64, 64, (g, w, h) => {
    fill(g, w, h, 100);
    g.fillStyle = 'rgb(230,230,230)';
    const lozenge = (x, y, a) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.ellipse(0, 0, 11, 2.6, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    lozenge(16, 16, Math.PI / 4); lozenge(48, 48, Math.PI / 4);
    lozenge(48, 16, -Math.PI / 4); lozenge(16, 48, -Math.PI / 4);
  }, 2.2, perMetre(0.06));

// Subway tiles for the kitchen splashback: 15 × 7.5 cm, running bond.
export const subwayTex = () =>
  canvasTex('subway', 256, 256, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#9aa0a3';
    g.fillRect(0, 0, w, h);
    const tw = 128, th = 64;
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * tw + (row % 2) * tw / 2, y = row * th;
        const v = 236 + r() * 14;
        g.fillStyle = `rgb(${v},${v},${v - 3})`;
        g.fillRect(x + 3, y + 3, tw - 6, th - 6);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x + 6, y + 6, tw - 12, 8);
      }
    }
  }, perMetre(0.3, 0.3));

export const subwayNormal = () =>
  normalTex('subway', 256, 256, (g, w, h) => {
    fill(g, w, h, 40);
    const tw = 128, th = 64;
    g.fillStyle = 'rgb(210,210,210)';
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * tw + (row % 2) * tw / 2, y = row * th;
        g.beginPath();
        g.roundRect ? g.roundRect(x + 3, y + 3, tw - 6, th - 6, 6) : g.rect(x + 3, y + 3, tw - 6, th - 6);
        g.fill();
      }
    }
  }, 2.4, perMetre(0.3, 0.3));

// ------------------------------------------------------------ atlases
// Things that are pictures, not surfaces — rugs, art, labels, screens — share
// one atlas per kind, and a model maps its face onto a cell (atlasUV): one
// material serves every rug in the building.

// Rugs: 2 × 2 palettes, each a field pattern inside a border band.
const RUG_PALETTES = [
  ['#7a4f3f', '#b98d5a', '#e6d3b0', '#3f2d27'], // terracotta kilim
  ['#34506e', '#8fa9c4', '#e8e2d2', '#1f2c3d'], // navy
  ['#54707a', '#c9b37a', '#ece6d6', '#2c3b40'], // teal and ochre
  ['#6b5a7a', '#d59a7a', '#efe6dc', '#352c3d'], // plum
];
export const rugAtlas = () =>
  canvasTex('rugs', 1024, 1024, (g) => {
    const r = rng(31);
    RUG_PALETTES.forEach(([field, accent, light, dark], i) => {
      const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 512, S = 512;
      g.save(); g.translate(ox, oy);
      g.fillStyle = field; g.fillRect(0, 0, S, S);
      // border bands
      g.fillStyle = dark; g.fillRect(0, 0, S, 44); g.fillRect(0, S - 44, S, 44); g.fillRect(0, 0, 44, S); g.fillRect(S - 44, 0, 44, S);
      g.strokeStyle = light; g.lineWidth = 5; g.strokeRect(54, 54, S - 108, S - 108);
      g.strokeStyle = accent; g.lineWidth = 3; g.strokeRect(22, 22, S - 44, S - 44);
      // field: a lattice of diamonds (kilim), or rows of stripes
      if (i % 2 === 0) {
        for (let y = 90; y < S - 80; y += 64) {
          for (let x = 90 + ((y / 64) % 2) * 32; x < S - 80; x += 64) {
            g.fillStyle = (x + y) % 128 ? accent : light;
            g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 16, y); g.lineTo(x, y + 20); g.lineTo(x - 16, y); g.fill();
          }
        }
      } else {
        for (let y = 80; y < S - 80; y += 28) {
          g.fillStyle = (y / 28) % 3 < 1 ? accent : (y / 28) % 3 < 2 ? light : field;
          g.globalAlpha = 0.7; g.fillRect(70, y, S - 140, 10); g.globalAlpha = 1;
        }
        g.fillStyle = light; g.beginPath(); g.arc(S / 2, S / 2, 60, 0, Math.PI * 2); g.fill();
        g.fillStyle = accent; g.beginPath(); g.arc(S / 2, S / 2, 40, 0, Math.PI * 2); g.fill();
      }
      // wear and pile noise
      for (let k = 0; k < 9000; k++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
        g.fillRect(r() * S, r() * S, 2, 2);
      }
      g.restore();
    });
  });

// Art: four generators — colour blocks, a grid, circles, a gradient
// landscape. Cell i of a 2 × 2 atlas; the frame picks one by seed.
export const artAtlas = () =>
  canvasTex('art', 1024, 1024, (g) => {
    const r = rng(77);
    const S = 512;
    const cell = (i, fn) => { g.save(); g.translate((i % 2) * S, Math.floor(i / 2) * S); fn(); g.restore(); };
    cell(0, () => { // colour blocks
      g.fillStyle = '#f1ece1'; g.fillRect(0, 0, S, S);
      [['#e2704d', 40, 60, 250, 200], ['#2f4f6f', 200, 220, 270, 250], ['#e8c15a', 70, 300, 150, 150], ['#1c1c1c', 330, 40, 20, 440]]
        .forEach(([c, x, y, w, h]) => { g.fillStyle = c; g.fillRect(x, y, w, h); });
    });
    cell(1, () => { // grid
      g.fillStyle = '#eeeae0'; g.fillRect(0, 0, S, S);
      const cols = ['#d94f3d', '#2d5fa8', '#f0c43c', '#eeeae0', '#eeeae0', '#eeeae0'];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        g.fillStyle = cols[(r() * cols.length) | 0];
        g.fillRect(30 + x * 92, 30 + y * 92, 84, 84);
      }
      g.strokeStyle = '#151515'; g.lineWidth = 8;
      for (let k = 0; k <= 5; k++) { g.beginPath(); g.moveTo(26 + k * 92, 26); g.lineTo(26 + k * 92, S - 26); g.stroke(); g.beginPath(); g.moveTo(26, 26 + k * 92); g.lineTo(S - 26, 26 + k * 92); g.stroke(); }
    });
    cell(2, () => { // circles
      g.fillStyle = '#1f2a33'; g.fillRect(0, 0, S, S);
      ['#e07a5f', '#f2cc8f', '#81b29a', '#f4f1de', '#3d85c6'].forEach((c, k) => {
        g.fillStyle = c; g.globalAlpha = 0.85;
        g.beginPath(); g.arc(90 + r() * 330, 90 + r() * 330, 40 + r() * 110, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        if (k === 1) { g.strokeStyle = '#f4f1de'; g.lineWidth = 4; g.beginPath(); g.arc(S / 2, S / 2, 200, 0, Math.PI * 2); g.stroke(); }
      });
    });
    cell(3, () => { // landscape
      const sky = g.createLinearGradient(0, 0, 0, S);
      sky.addColorStop(0, '#f6c28b'); sky.addColorStop(0.55, '#f08a6b'); sky.addColorStop(1, '#6b3f5f');
      g.fillStyle = sky; g.fillRect(0, 0, S, S);
      g.fillStyle = '#fff1c9'; g.beginPath(); g.arc(S * 0.66, S * 0.42, 50, 0, Math.PI * 2); g.fill();
      ['#8f4f64', '#5e3752', '#3a2340'].forEach((c, k) => {
        g.fillStyle = c; g.beginPath(); g.moveTo(0, S);
        for (let x = 0; x <= S; x += 16) g.lineTo(x, S * (0.55 + k * 0.12) + Math.sin(x / 60 + k * 2) * 30 + r() * 8);
        g.lineTo(S, S); g.fill();
      });
    });
  });

// uv rect of cell i in an n × n atlas (v runs up, the canvas runs down)
export const atlasCell = (i, n = 2) => {
  const c = i % n, rI = Math.floor(i / n) % n;
  return [c / n, 1 - (rI + 1) / n, (c + 1) / n, 1 - rI / n];
};

// Labels: every printed or backlit panel in the building, one canvas. LABELS
// names each cell in pixels; atlasRect() turns a name into a uv rect.
const LABEL_SIZE = 1024;
export const LABELS = {
  fizz: [0, 0, 512, 128], // vending header, backlit
  logo: [512, 0, 512, 160], // reception desk
  copierUi: [0, 128, 256, 160], // copier touch panel
  roadmap: [256, 128, 256, 144], // meeting-room TV
  notes: [0, 288, 256, 128], // fridge magnets + sticky notes
  scribble: [256, 288, 512, 336], // whiteboard
  keypad: [768, 288, 128, 192], // vending keypad + coin slot
  wash: [896, 288, 128, 128], // sink soap dispenser label
  court: [0, 624, 256, 192], // hoop backboard
  pitch: [256, 624, 512, 288], // foosball playfield
  servers: [768, 480, 256, 544], // a rack's worth of server fronts
  spines: [0, 816, 256, 208], // book spines (greyscale, tinted per book)
};
export const atlasRect = (name) => {
  const [x, y, w, h] = LABELS[name];
  return [x / LABEL_SIZE, 1 - (y + h) / LABEL_SIZE, (x + w) / LABEL_SIZE, 1 - y / LABEL_SIZE];
};
export const labelAtlas = () =>
  canvasTex('labels', LABEL_SIZE, LABEL_SIZE, (g) => {
    const r = rng(55);
    const at = (name, fn) => { const [x, y, w, h] = LABELS[name]; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(w, h); g.restore(); };
    const text = (s, x, y, size, color, weight = 'bold', align = 'center') => {
      g.fillStyle = color; g.font = `${weight} ${size}px system-ui, sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
    };
    at('fizz', (w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#d81e3c'); gr.addColorStop(1, '#ff5a3c');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(r() * w, r() * h, 4 + r() * 14, 0, Math.PI * 2); g.fill(); }
      text('FIZZ', w * 0.36, h * 0.52, 92, '#fff8e8', '900');
      text('ICE COLD', w * 0.76, h * 0.4, 30, '#ffe0a0');
      text('★ ★ ★', w * 0.76, h * 0.7, 26, '#ffe0a0');
    });
    at('logo', (w, h) => {
      g.fillStyle = '#20242b'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#e8b44a'; g.lineWidth = 6;
      g.beginPath(); g.arc(80, h / 2, 46, 0, Math.PI * 2); g.stroke();
      text('RC', 80, h / 2 + 2, 40, '#e8b44a', '900');
      text('RC MAYHEM INC.', w * 0.58, h * 0.42, 50, '#f3efe6', '800');
      text('TINY CARS · BIG DEADLINES', w * 0.58, h * 0.74, 22, '#9aa3ad', '600');
    });
    at('copierUi', (w, h) => {
      g.fillStyle = '#0f2744'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1e5aa0'; g.fillRect(0, 0, w, 26);
      text('READY', 50, 13, 16, '#dff0ff');
      text('12:04', w - 34, 13, 14, '#dff0ff', '600');
      ['COPY', 'SCAN', 'FAX', 'BOX'].forEach((s, i) => {
        const x = 12 + (i % 2) * 120, y = 38 + Math.floor(i / 2) * 58;
        g.fillStyle = ['#3fa0ff', '#2fc47a', '#f0a23c', '#9a7af0'][i];
        g.fillRect(x, y, 110, 50);
        text(s, x + 55, y + 26, 20, '#fff');
      });
    });
    at('roadmap', (w, h) => {
      g.fillStyle = '#10213a'; g.fillRect(0, 0, w, h);
      text('Q3 ROADMAP', 18, 20, 20, '#fff', '800', 'left');
      const lanes = ['#4f9dff', '#34d399', '#fbbf24', '#f472b6'];
      lanes.forEach((c, i) => { g.fillStyle = c; g.fillRect(20 + i * 30, 44 + i * 22, 90 + r() * 90, 14); });
      g.strokeStyle = '#ff5252'; g.lineWidth = 2; g.beginPath(); g.moveTo(160, 36); g.lineTo(160, 138); g.stroke();
      text('YOU ARE HERE', 196, 132, 11, '#ff9b9b', '700');
    });
    at('notes', (w, h) => {
      g.fillStyle = '#c9cdd1'; g.fillRect(0, 0, w, h);
      [['#ffe066', 10, 10, -0.08], ['#8ce99a', 90, 20, 0.06], ['#74c0fc', 170, 8, -0.04]].forEach(([c, x, y, a]) => {
        g.save(); g.translate(x + 35, y + 35); g.rotate(a); g.fillStyle = c; g.fillRect(-35, -35, 70, 70);
        g.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 0; k < 4; k++) g.fillRect(-26, -20 + k * 12, 30 + r() * 20, 3);
        g.restore();
      });
      ['#e03131', '#1971c2', '#f08c00'].forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.arc(40 + k * 80, 105, 10, 0, Math.PI * 2); g.fill(); });
    });
    at('scribble', (w, h) => {
      g.fillStyle = '#f7f8f6'; g.fillRect(0, 0, w, h);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const pen = (c, wd) => { g.strokeStyle = c; g.lineWidth = wd; };
      // a flow chart, a hopeful graph, some to-dos
      pen('#1f4fbf', 4);
      [[40, 40], [40, 140], [200, 90]].forEach(([x, y]) => g.strokeRect(x, y, 110, 56));
      g.beginPath(); g.moveTo(150, 68); g.lineTo(200, 110); g.moveTo(150, 168); g.lineTo(200, 124); g.stroke();
      text('IDEA', 95, 70, 24, '#1f4fbf', '700'); text('MONEY?', 95, 170, 22, '#1f4fbf', '700'); text('SHIP', 255, 120, 24, '#1f4fbf', '700');
      pen('#c92a2a', 5);
      g.beginPath(); g.moveTo(340, 280); g.lineTo(380, 240); g.lineTo(410, 256); g.lineTo(460, 170); g.lineTo(490, 60); g.stroke();
      g.beginPath(); g.moveTo(340, 290); g.lineTo(500, 290); g.moveTo(340, 290); g.lineTo(340, 50); g.stroke();
      pen('#2b8a3e', 3);
      for (let i = 0; i < 4; i++) { g.strokeRect(40, 230 + i * 24, 14, 14); g.beginPath(); g.moveTo(66, 237 + i * 24); g.lineTo(150 + r() * 120, 237 + i * 24); g.stroke(); }
      g.fillStyle = '#ffe066'; g.save(); g.translate(440, 290); g.rotate(0.1); g.fillRect(-30, -30, 60, 60); g.restore();
      g.fillStyle = 'rgba(40,60,120,0.07)'; for (let i = 0; i < 6; i++) g.fillRect(r() * w, r() * h, 120, 30); // ghosting
    });
    at('keypad', (w, h) => {
      g.fillStyle = '#1a1c20'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7ff0a8'; g.fillRect(14, 12, w - 28, 26);
      text('1.50', w / 2, 26, 18, '#0b3', '800');
      for (let i = 0; i < 12; i++) {
        const x = 16 + (i % 3) * 34, y = 50 + Math.floor(i / 3) * 30;
        g.fillStyle = '#c9ced6'; g.fillRect(x, y, 26, 22);
        text('123456789*0#'[i], x + 13, y + 12, 13, '#222');
      }
      g.fillStyle = '#9aa3ad'; g.fillRect(w / 2 - 18, 176, 36, 8);
    });
    at('wash', (w, h) => {
      g.fillStyle = '#f2f4f5'; g.fillRect(0, 0, w, h);
      text('SOAP', w / 2, h * 0.4, 28, '#3a7bd5', '800'); text('press', w / 2, h * 0.7, 18, '#6b7a8a', '600');
    });
    at('court', (w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#f7f7f7'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12);
      g.strokeStyle = '#e8332a'; g.lineWidth = 8; g.strokeRect(w * 0.32, h * 0.42, w * 0.36, h * 0.44);
    });
    at('pitch', (w, h) => {
      g.fillStyle = '#2e7d4f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'; g.fillRect(i * w / 8, 0, w / 8, h); }
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w / 2, h - 8); g.stroke();
      g.beginPath(); g.arc(w / 2, h / 2, 44, 0, Math.PI * 2); g.stroke();
      g.strokeRect(8, h / 2 - 70, 60, 140); g.strokeRect(w - 68, h / 2 - 70, 60, 140);
    });
    at('servers', (w, h) => {
      // 1U = 22 px; a rack face of mixed kit, blanking panels in the gaps
      g.fillStyle = '#121418'; g.fillRect(0, 0, w, h);
      let y = 6;
      while (y < h - 10) {
        const u = r() < 0.3 ? 2 : 1;
        const hh = u * 22 - 2;
        const kind = r();
        if (kind < 0.2) { // blanking panel
          g.fillStyle = '#1b1d22'; g.fillRect(14, y, w - 28, hh);
        } else {
          g.fillStyle = kind < 0.5 ? '#454b55' : kind < 0.8 ? '#6a717b' : '#c8ccd2';
          g.fillRect(14, y, w - 28, hh);
          // drive bays
          const bays = u === 2 ? 12 : 8;
          for (let b = 0; b < bays; b++) {
            g.fillStyle = kind < 0.8 ? (b % 3 ? '#23262c' : '#2e4a6a') : '#8d949c';
            g.fillRect(40 + b * ((w - 110) / bays), y + 3, (w - 110) / bays - 3, hh - 6);
          }
          // vent slots + ears
          g.fillStyle = 'rgba(0,0,0,0.5)';
          for (let v = 0; v < 5; v++) g.fillRect(w - 64 + v * 8, y + 4, 4, hh - 8);
          g.fillStyle = '#7d848c'; g.fillRect(14, y, 8, hh); g.fillRect(w - 22, y, 8, hh);
        }
        y += hh + 2;
      }
      // the rails
      g.fillStyle = '#50565e'; g.fillRect(4, 0, 8, h); g.fillRect(w - 12, 0, 8, h);
    });
    at('spines', (w, h) => {
      // greyscale: a title block and bands, tinted by each book's colour
      g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 16, w, 10); g.fillRect(0, h - 26, w, 10);
      g.fillStyle = '#f8f8f8'; g.fillRect(w * 0.2, 60, w * 0.6, 60);
      g.fillStyle = '#6a6a6a'; for (let k = 0; k < 3; k++) g.fillRect(w * 0.28, 72 + k * 14, w * (0.3 + r() * 0.14), 5);
    });
  });

// A wooden rule: centimetre ticks down both edges, longer every 5 and 10.
export const rulerTex = () =>
  canvasTex('ruler', 256, 128, (g, w, h) => {
    g.fillStyle = '#e9d3a2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2118';
    for (let i = 0; i < 10; i++) {
      const x = i * w / 10 + 1;
      const len = i === 0 ? 34 : i === 5 ? 22 : 12;
      g.fillRect(x, 0, 3, len);
      g.fillRect(x, h - len, 3, len);
    }
  }, [10, 1 / 0.6]);

// Scuffs: four grey-black smears on transparent (a 2 × 2 atlas) — rubber,
// chair castors, the odd RC bumper — decals low on the walls.
export const scuffTex = () =>
  canvasTex('scuffs', 256, 128, (g, w, h) => {
    const r = rng(13);
    g.clearRect(0, 0, w, h);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * 128, oy = Math.floor(cell / 2) * 64;
      for (let i = 0; i < 26; i++) {
        const x = ox + 10 + r() * 108, y = oy + 12 + r() * 40, len = 8 + r() * 40;
        g.strokeStyle = `rgba(${30 + r() * 40},${30 + r() * 30},${28 + r() * 30},${0.05 + r() * 0.2})`;
        g.lineWidth = 0.8 + r() * 2.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 8); g.stroke();
      }
    }
  });

// Suspended ceiling: a 60 cm mineral-fibre tile, fissured, in a white T-bar
// grid. Seen from below at a steep angle it's what makes an office ceiling
// an office ceiling instead of a grey lid.
export const ceilingTex = () =>
  canvasTex('ceiling', 128, 128, (g, w, h) => {
    const r = rng(17);
    g.fillStyle = '#e2dfd8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = r();
      g.fillStyle = v > 0.6 ? 'rgba(150,145,135,0.35)' : 'rgba(255,255,255,0.25)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1);
    }
    // the T-bar: bright flange, a hairline shadow inside it
    g.fillStyle = '#f7f6f2';
    g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h);
    g.fillStyle = 'rgba(80,76,70,0.45)';
    g.fillRect(4, 4, w - 4, 1.5); g.fillRect(4, 4, 1.5, h - 4);
  }, [1 / 0.6, 1 / 0.6]);
