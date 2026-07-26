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
      g.fillStyle = 'rgb(40,40,40)';       // board joint: a real groove
      g.fillRect(0, y, w, 2);
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
  }, 1.6, repeat);

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
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, repeat);
