// Everything with writing on it — signs, room plates, notices, data plates,
// screens that don't move — painted into one atlas (cellar-tex.js Atlas), so
// the whole floor's print is two draw calls (lit, and self-lit).
import * as THREE from 'three';
import { rng } from './cellar-kit.js';
import { Atlas } from './cellar-tex.js';

const FONT = '"Arial Narrow", Arial, Helvetica, sans-serif';

function text(g, s, x, y, size, color, { weight = 'bold', align = 'center', font = FONT, max } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y, max);
}
function scribble(g, x, y, w, lines, r, color = 'rgba(30,30,40,0.7)', lh = 7) {
  g.fillStyle = color;
  for (let i = 0; i < lines; i++) g.fillRect(x, y + i * lh, w * (0.4 + r() * 0.6), 2.5);
}
function paper(g, x, y, w, h, r, tint = '#f4f1e6') {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate((r() - 0.5) * 0.12);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);
  g.fillStyle = tint;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.restore();
}
const pin = (g, x, y, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); };

// A wall sign from map.SIGNS
function sign(g, w, h, s) {
  const bg = s.exit ? '#12a150' : s.bg || '#e9e4d4';
  const fg = s.exit ? '#ffffff' : s.fg || '#1c1c1c';
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  if (s.exit) {
    // running man and arrow, the pictogram everyone knows
    g.fillStyle = fg;
    g.beginPath(); g.arc(w * 0.14, h * 0.3, h * 0.09, 0, 7); g.fill();
    g.lineWidth = h * 0.08; g.strokeStyle = fg; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.14, h * 0.42); g.lineTo(w * 0.12, h * 0.65); g.lineTo(w * 0.2, h * 0.85); g.stroke();
    g.beginPath(); g.moveTo(w * 0.12, h * 0.65); g.lineTo(w * 0.06, h * 0.85); g.stroke();
    g.beginPath(); g.moveTo(w * 0.07, h * 0.5); g.lineTo(w * 0.2, h * 0.5); g.stroke();
    text(g, s.text, w * 0.56, h * 0.54, h * 0.52, fg);
    g.beginPath(); g.moveTo(w * 0.86, h * 0.54); g.lineTo(w * 0.95, h * 0.54); g.stroke();
    return;
  }
  text(g, s.text, w / 2, s.sub ? h * 0.4 : h * 0.52, s.sub ? h * 0.4 : h * 0.5, fg, { max: w - 20 });
  if (s.sub) text(g, s.sub, w / 2, h * 0.78, h * 0.18, fg, { max: w - 20 });
}

// "B-1.07  ARCHIVE" room plates, engraved white on grey
function plate(g, w, h, num, name) {
  g.fillStyle = '#5b6560'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6c7671'; g.fillRect(4, 4, w - 8, h - 8);
  text(g, num, w / 2, h * 0.36, h * 0.36, '#ffffff');
  text(g, name, w / 2, h * 0.75, h * 0.18, '#e6ebe8', { max: w - 12 });
}

function noticeBoard(g, w, h, r) {
  g.fillStyle = '#6b5332'; g.fillRect(0, 0, w, h); // frame
  g.fillStyle = '#b48a55'; g.fillRect(10, 10, w - 20, h - 20); // cork
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,60,30,${r() * 0.3})`; g.fillRect(10 + r() * (w - 20), 10 + r() * (h - 20), 2, 2); }
  const notes = [
    ['FIRE ASSEMBLY POINT', '#f4f1e6'], ['LOST: USB STICK (IMPORTANT)', '#fff59b'], ['CHRISTMAS PARTY 2019', '#f4c6c6'],
    ['DO NOT UNPLUG THE GREY ONE', '#f4f1e6'], ['KEYS FOR CAGE → ASK DAVE', '#c9e7f4'], ['PASSWORDS EXPIRE EVERY 30 DAYS', '#f4f1e6'],
    ['BIKE FOR SALE', '#d6f4c9'], ['ROTA', '#f4f1e6'],
  ];
  let x = 22, y = 22;
  for (const [t, c] of notes) {
    const nw = 70 + r() * 60, nh = 60 + r() * 50;
    if (x + nw > w - 16) { x = 22; y += 110; }
    if (y + nh > h - 16) break;
    paper(g, x, y, nw, nh, r, c);
    text(g, t.split(' ').slice(0, 2).join(' '), x + nw / 2, y + 14, 10, '#222', { max: nw - 8 });
    scribble(g, x + 8, y + 28, nw - 16, Math.floor((nh - 34) / 8), r);
    pin(g, x + nw / 2, y + 5, ['#d33', '#33d', '#3a3', '#dd3'][Math.floor(r() * 4)]);
    x += nw + 12 + r() * 10;
  }
}

function poster(g, w, h, kind, r) {
  g.fillStyle = '#f7f4ea'; g.fillRect(0, 0, w, h);
  if (kind === 'fire') {
    g.fillStyle = '#c62828'; g.fillRect(0, 0, w, h * 0.22);
    text(g, 'FIRE ACTION', w / 2, h * 0.11, h * 0.1, '#fff');
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#c62828'; g.beginPath(); g.arc(w * 0.14, h * (0.32 + i * 0.16), h * 0.04, 0, 7); g.fill();
      text(g, `${i + 1}`, w * 0.14, h * (0.32 + i * 0.16), h * 0.05, '#fff');
      scribble(g, w * 0.26, h * (0.3 + i * 0.16), w * 0.62, 2, r, 'rgba(40,40,40,0.8)', 8);
    }
  } else if (kind === 'clean') {
    g.fillStyle = '#2e7d4f'; g.fillRect(0, 0, w, h * 0.3);
    text(g, 'CLEAN DESK', w / 2, h * 0.1, h * 0.08, '#fff');
    text(g, 'POLICY', w / 2, h * 0.2, h * 0.08, '#fff');
    scribble(g, w * 0.12, h * 0.38, w * 0.76, 12, r, 'rgba(40,40,40,0.7)', 12);
  } else {
    g.fillStyle = '#1d3b6b'; g.fillRect(0, 0, w, h * 0.3);
    text(g, 'RAISE A', w / 2, h * 0.1, h * 0.08, '#fff');
    text(g, 'TICKET', w / 2, h * 0.2, h * 0.08, '#fff');
    text(g, 'ext. 4357', w / 2, h * 0.45, h * 0.08, '#1d3b6b');
    text(g, '(HELP)', w / 2, h * 0.55, h * 0.06, '#1d3b6b');
    scribble(g, w * 0.12, h * 0.66, w * 0.76, 6, r, 'rgba(40,40,40,0.7)', 12);
  }
}

// Plain data plates and notices: a title, a few rows of small print.
function dataPlate(g, w, h, title, rows, { bg = '#d9d9d2', fg = '#222', bar = null } = {}, r) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  if (bar) { g.fillStyle = bar; g.fillRect(4, 4, w - 8, h * 0.28); }
  text(g, title, w / 2, h * 0.17, h * 0.15, bar ? '#fff' : fg, { max: w - 12 });
  for (let i = 0; i < rows; i++) scribble(g, 12, h * 0.38 + i * (h * 0.55 / rows), w - 24, 1, r, 'rgba(30,30,30,0.7)');
}

// Pegboard with tool outlines (the tools long since walked)
function pegboard(g, w, h, r) {
  g.fillStyle = '#c9b48a'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(60,40,20,0.55)';
  for (let y = 8; y < h; y += 14) for (let x = 8; x < w; x += 14) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  const tools = ['#23262b', '#b33', '#2e5b87', '#e0762a', '#3d8b4f'];
  for (let i = 0; i < 14; i++) {
    const x = 30 + (i % 7) * (w - 60) / 6, y = 50 + Math.floor(i / 7) * h * 0.45;
    const missing = r() < 0.35;
    g.strokeStyle = 'rgba(20,20,20,0.7)'; g.lineWidth = 2;
    g.fillStyle = missing ? 'rgba(0,0,0,0)' : tools[i % tools.length];
    const tw = 12 + r() * 14, th = 50 + r() * 60;
    g.beginPath(); g.rect(x - tw / 2, y, tw, th); if (!missing) g.fill(); g.stroke();
    g.beginPath(); g.arc(x, y, tw * 0.9, 0, 7); if (!missing) g.fill(); g.stroke();
  }
  // a reel of solder and a coil of wire hanging on hooks
  g.strokeStyle = '#b87333'; g.lineWidth = 5; g.beginPath(); g.arc(w * 0.85, h * 0.2, 20, 0, 7); g.stroke();
}

function lcd(g, w, h, lines, color = '#7fe3ff') {
  g.fillStyle = '#04141a'; g.fillRect(0, 0, w, h);
  lines.forEach((l, i) => text(g, l, 8, (i + 0.7) * (h / lines.length), h / lines.length * 0.62, color, { align: 'left', font: 'monospace' }));
}

// Paint every label the floor needs; returns { key: uv rect }.
export function paintLabels(atlas, map) {
  const r = rng(77);
  const slots = {};
  // signs, 512 × 160 like upstairs
  (map.SIGNS || []).forEach((s, i) => { slots[`sign${i}`] = atlas.slot(`sign${i}`, 512, 160, (g, w, h) => sign(g, w, h, s)); });
  for (const [id, d] of Object.entries(map.DOOR_DRESS || {})) {
    slots[`plate_${id}`] = atlas.slot(`plate_${id}`, 256, 96, (g, w, h) => plate(g, w, h, d.plate, d.name));
  }
  (map.NOTICES || []).forEach((n, i) => {
    const [, , , , nw, nh, kind] = n;
    const pw = Math.round(nw * 300), ph = Math.round(nh * 300);
    slots[`notice${i}`] = atlas.slot(`notice${i}`, pw, ph, (g, w, h) => (kind === 'board' ? noticeBoard(g, w, h, r) : poster(g, w, h, kind, r)));
  });
  const dp = (key, w, h, title, rows, o) => { slots[key] = atlas.slot(key, w, h, (g, W, H) => dataPlate(g, W, H, title, rows, o, r)); };
  dp('rackTag', 128, 32, 'SRV-B1-' + String(Math.floor(r() * 90) + 10), 0, { bg: '#f0f0e8' });
  dp('cracPlate', 192, 64, 'LIEBERT 30kW', 2, { bg: '#dcdcd6' });
  dp('upsPlate', 160, 40, 'UPS 3 × 40 kVA', 1, { bg: '#2a2c30', fg: '#ddd' });
  dp('fm200', 96, 144, 'FM-200', 6, { bg: '#f4f1e6', bar: '#c62828' });
  dp('boilerPanel', 192, 64, 'BURNER CONTROL', 2, { bg: '#e8e8e2' });
  dp('boilerPlate', 192, 96, 'VIESSMANN 1987', 4, { bg: '#c9b36a' });
  dp('heaterPlate', 96, 128, 'WATER HEATER', 5, { bg: '#dcdcd4' });
  dp('kitchenNote', 160, 112, 'WASH YOUR MUG', 5, { bg: '#fff59b' });
  dp('weee', 160, 112, 'WEEE ONLY', 4, { bg: '#f4f1e6', bar: '#2e7d4f' });
  dp('collection', 160, 112, 'COLLECTION THURS', 3, { bg: '#fff59b' });
  dp('fireDoor', 160, 56, 'FIRE DOOR KEEP SHUT', 0, { bg: '#1d4fa0', fg: '#fff' });
  dp('fireHold', 256, 48, 'FIRE DOOR — KEEP CLEAR', 0, { bg: '#1d4fa0', fg: '#fff' });
  dp('waitHere', 256, 86, 'PLEASE WAIT HERE', 0, { bg: '#e6c229', fg: '#1a1a1a' });
  dp('returns', 160, 64, 'RETURNS — DO NOT TAKE', 0, { bg: '#f4f1e6' });
  dp('takeNumber', 96, 56, 'TAKE A NUMBER', 0, { bg: '#fff', fg: '#c62828' });
  dp('helpdeskFront', 320, 72, 'HAVE YOU TRIED TURNING IT OFF AND ON AGAIN?', 0, { bg: '#5f7488', fg: '#fff' });
  dp('gasMeter', 128, 96, 'GAS', 3, { bg: '#e6c229' });
  dp('breaker', 128, 160, 'DB-B1', 8, { bg: '#d8d8d2' });
  dp('socket', 32, 32, '', 0, { bg: '#e8e8e2' });
  slots.wetFloor = atlas.slot('wetFloor', 96, 96, (g, w, h) => {
    g.fillStyle = '#e6c229'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 8, h * 0.62); g.lineTo(8, h * 0.62); g.closePath(); g.fill();
    g.fillStyle = '#e6c229'; g.beginPath(); g.moveTo(w / 2, 18); g.lineTo(w - 20, h * 0.56); g.lineTo(20, h * 0.56); g.closePath(); g.fill();
    g.fillStyle = '#111'; g.fillRect(w / 2 - 3, 28, 6, 18); g.fillRect(w / 2 - 3, 50, 6, 5);
    text(g, 'WET FLOOR', w / 2, h * 0.8, 15, '#111');
  });
  dp('badge', 48, 72, '', 0, { bg: '#26292d' });
  for (let i = 0; i < 4; i++) dp(`shelf${i}`, 96, 64, `${1998 + i * 3}–${2001 + i * 3}`, 2, { bg: '#f4f1e6' });
  slots.pegboard = atlas.slot('pegboard', 512, 256, (g, w, h) => pegboard(g, w, h, r));
  slots.cracLcd = atlas.slot('cracLcd', 128, 48, (g, w, h) => lcd(g, w, h, ['RET 24.1°C', 'SUP 17.8°C']));
  slots.upsLcd = atlas.slot('upsLcd', 128, 48, (g, w, h) => lcd(g, w, h, ['ONLINE', 'LOAD 61%'], '#8fff9f'));
  // tiny self-lit swatches for LEDs that don't blink
  return slots;
}

// One atlas per map, shared by the dressing and the pieces that build their
// own meshes (the rolling shelf): { atlas, slots, mats: { label, labelGlow } }
const perMap = new WeakMap();
export function labelsFor(map) {
  let L = perMap.get(map);
  if (!L) {
    const atlas = new Atlas(2048);
    const slots = paintLabels(atlas, map);
    L = {
      atlas, slots,
      mats: {
        label: new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 }),
        labelGlow: new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }),
      },
    };
    perMap.set(map, L);
  }
  return L;
}
