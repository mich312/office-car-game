// Procedural canvas textures — no asset files, everything generated.
import * as THREE from 'three';

const cache = new Map();

function canvasTex(key, w, h, draw, repeat = [1, 1]) {
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
