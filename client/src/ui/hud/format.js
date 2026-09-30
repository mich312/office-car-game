// Shared formatting for the Toy Box HUD (foundation; frozen after it lands).
//   ordinal / withOrdinal   place suffixes (ST ND RD TH, 11-13 → TH)
//   paintOf / paintInk      a driver's paint and the text colour that reads on it
//   paintVars               the style props a .tb-name tag (or a paint chip) needs
//   mmss                    seconds → m:ss
//   FLOOR_CODE              lift-button code per floor (01 · Office, B1 · IT Cellar…)
//   Slots / setSlots        fixed-width digit slots for live Kanit numbers
//                           (Kanit has no tabular figures; see SPEC-TOYBOX §3)
import { createElement } from 'react';
import { CARS } from '@rc/shared';

// ------------------------------------------------------------ places
export const ordinal = (n) => {
  const k = Math.abs(Math.trunc(n)) % 100;
  if (k >= 11 && k <= 13) return 'TH';
  return ['TH', 'ST', 'ND', 'RD'][k % 10] || 'TH';
};
// 3 → "3rd" (running text: payslip lines, "You placed 3rd")
export const withOrdinal = (n) => `${n}${ordinal(n).toLowerCase()}`;

// ------------------------------------------------------------ paint
const INK = [20, 14, 44]; // --ink #140e2c
const FALLBACK_PAINT = '#9aa7c0';
const lum = ([r, g, b]) => {
  const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const rgb = (hex) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const inkCache = new Map();

// A player's paint: their chosen paint, else their car's own colour.
export const paintOf = (p) => p?.paint || CARS[p?.car]?.color || FALLBACK_PAINT;

// Text on a paint: ink when it reaches 4.5:1 against --ink, else paper
// (only Stealth Ninja #2d3436 among PAINT_COLORS needs paper).
export function paintInk(hex) {
  const key = String(hex || FALLBACK_PAINT).toLowerCase();
  let v = inkCache.get(key);
  if (!v) {
    const c = rgb(key) || rgb(FALLBACK_PAINT);
    const ratio = (lum(c) + 0.05) / (lum(INK) + 0.05);
    v = ratio >= 4.5 ? 'var(--ink)' : 'var(--paper)';
    inkCache.set(key, v);
  }
  return v;
}

// style={paintVars(paintOf(player))} on a .tb-name / .tb-car / paint chip
export const paintVars = (paint) => ({ '--paint': paint || FALLBACK_PAINT, '--paint-ink': paintInk(paint) });

// ------------------------------------------------------------ time
export const mmss = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ------------------------------------------------------------ floors
// the lift-panel code each floor wears (lobby vote chips, minimap tag, countdown);
// keyed by map id (= theme). Icon.jsx re-exports it next to FLOOR_TOY.
export const FLOOR_CODE = { office: '01', cellar: 'B1', tower: '48', garage: 'G0', factory: 'W2' };

// ------------------------------------------------------------ digit slots
// <Slots pattern="000" text="286" slotsRef={ref} />   → <span class="tb-slots"><i>2</i><i>8</i><i>6</i></span>
// <Slots pattern="0:00" text="245" slotsRef={ref} />  → <i>2</i><b>:</b><i>4</i><i>5</i>   (clock)
// Every '0' in the pattern is a digit slot (<i>), any other character is a
// fixed-width separator (<b>). slotsRef.current receives the <i> elements in
// order, for setSlots() in a hud-loop writer. `text` is only the first paint.
export function Slots({ pattern = '000', text = '', slotsRef, className = '' }) {
  const n = [...pattern].filter((c) => c === '0').length;
  const s = String(text).padStart(n, ' ');
  let d = 0;
  const kids = [...pattern].map((c, i) => {
    if (c !== '0') return createElement('b', { key: i }, c);
    const ch = s[d++];
    return createElement('i', { key: i }, ch === ' ' ? '' : ch);
  });
  const ref = slotsRef ? (el) => { slotsRef.current = el ? [...el.querySelectorAll(':scope > i')] : []; } : undefined;
  return createElement('span', { className: `tb-slots${className ? ` ${className}` : ''}`, ref }, kids);
}

// Write a string into digit slots, right-aligned; a leading blank slot shows
// nothing but keeps its width. Touches only the slots whose text changed.
// (More characters than slots: the leading ones are dropped. Size the
// pattern for the largest value, e.g. "00:00" for rounds of 10+ minutes.)
export function setSlots(spans, str) {
  if (!spans || !spans.length) return;
  const raw = String(str);
  const s = raw.length > spans.length ? raw.slice(-spans.length) : raw.padStart(spans.length, ' ');
  for (let i = 0; i < spans.length; i++) {
    const c = s[i] === ' ' ? '' : s[i];
    if (spans[i].textContent !== c) spans[i].textContent = c;
  }
}
