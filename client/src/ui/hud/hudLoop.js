// One shared requestAnimationFrame loop for every fast HUD readout (speed,
// boost, drift charge, the clock, cooldown rings, the telegraph fuse…).
// Fast values never go through React state: each writer reads telemetry /
// the store and writes textContent, a CSS custom property or a class on its
// own refs, touching the DOM only when the value changed. ~30 Hz is plenty
// for a readout, and it costs zero React renders (SPEC-TOYBOX §4.0).
//
//   const write = useCallback((t) => { setSlots(spd.current, String(cms)); setVar(bar.current, '--v', v); }, []);
//   useHudWriter(write);            // (keep the function stable: useCallback / module scope)
import { useEffect } from 'react';

export { setSlots } from './format.js';

const writers = new Set();
const failed = new WeakSet();
let raf = 0;
let last = 0;
const STEP_MS = 33;

function tick(t) {
  raf = requestAnimationFrame(tick);
  if (t - last < STEP_MS) return;
  last = t;
  for (const w of writers) {
    try {
      w(t);
    } catch (err) {
      // one broken readout must not stop the others: report it once
      if (!failed.has(w)) { failed.add(w); console.error('hud writer failed', err); }
    }
  }
}

// Non-hook form, for module-level samplers (matchStats) that live outside a component.
export function addHudWriter(fn) {
  writers.add(fn);
  if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  return () => removeHudWriter(fn);
}
export function removeHudWriter(fn) {
  writers.delete(fn);
  if (!writers.size && raf) { cancelAnimationFrame(raf); raf = 0; }
}

export function useHudWriter(fn) {
  useEffect(() => (fn ? addHudWriter(fn) : undefined), [fn]);
}

// ------------------------------------------------ change-only DOM writes
export function setText(el, s) {
  if (el && el.textContent !== s) el.textContent = s;
}
// custom property (numbers are written with 3 decimals, enough for a bar)
export function setVar(el, name, v) {
  if (!el) return;
  const s = typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
  if (el.style.getPropertyValue(name) !== s) el.style.setProperty(name, s);
}
export function setClass(el, cls, on) {
  if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
}
