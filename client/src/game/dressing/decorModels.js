// What a DECOR_PROPS name stands for: the props' models (propModels.js)
// that make it, each with the lift that puts its origin where Props.jsx's
// body would hold it, and the footprint a collider (opts.collide) takes.
// Plain data, so node tools (scripts/density.mjs) can read it too.
import { DECOR_MODELS } from './registry.js';

const PI = Math.PI;

// name → [[model, dx, dy, dz, rx, ry, rz, tinted?]] (metres, radians); the
// footprint [w, h, d] a collider takes
export const BUILTIN_DECOR = {
  mug: { parts: [['mug', 0, 0.05, 0, 0, 0, 0, true], ['coffee', 0, 0.05, 0]], size: [0.1, 0.1, 0.1] },
  glass: { parts: [['glass', 0, 0.06, 0]], size: [0.08, 0.12, 0.08] },
  can: { parts: [['can', 0, 0.0575, 0]], size: [0.07, 0.115, 0.07] },
  canLying: { parts: [['can', 0, 0.033, 0, 0, 0, PI / 2]], size: [0.12, 0.066, 0.07] },
  pen: { parts: [['pen', 0, 0.008, 0, 0, 0, PI / 2, true]], size: [0.15, 0.016, 0.02] },
  sheets: { parts: [['sheets', 0, 0.006, 0, 0, 0, 0, true]], size: [0.21, 0.012, 0.3] },
  book: { parts: [['book', 0, 0.025, 0, 0, 0, 0, true]], size: [0.17, 0.05, 0.24] },
  keyboard: { parts: [['keyboard', 0, 0, 0]], size: [0.44, 0.03, 0.15] },
  monitor: { parts: [['monitor', 0, 0, 0], ['screen0', 0, 0, 0]], size: [0.55, 0.62, 0.2] },
  chair: { parts: [['chair', 0, 0, 0, 0, 0, 0, true]], size: [0.62, 0.95, 0.62] },
  cafechair: { parts: [['cafechair', 0, 0, 0, 0, 0, 0, true]], size: [0.46, 0.82, 0.46] },
  plant: { parts: [['pot', 0, 0.15, 0, 0, 0, 0, true], ['snake', 0, 0.25, 0]], size: [0.33, 0.8, 0.33] },
  plant2: { parts: [['pot', 0, 0.15, 0, 0, 0, 0, true], ['pothos', 0, 0.25, 0]], size: [0.33, 0.45, 0.33] },
  bottle: { parts: [['bottle', 0, 0.12, 0, 0, 0, 0, true]], size: [0.07, 0.24, 0.07] },
  bottleLying: { parts: [['bottle', 0, 0.035, 0, 0, 0, PI / 2, true]], size: [0.24, 0.07, 0.07] },
  basketball: { parts: [['basketball', 0, 0.121, 0]], size: [0.24, 0.24, 0.24] },
  box: { parts: [['box', 0, 0.17, 0, 0, 0, 0, true]], size: [0.34, 0.34, 0.34] },
  lamp: { parts: [['lamp', 0, 0, 0, 0, 0, 0, true]], size: [0.18, 0.5, 0.18] },
  trash: { parts: [['trash', 0, 0.175, 0, 0, 0, 0, true]], size: [0.3, 0.35, 0.3] },
  roll: { parts: [['roll', 0, 0.05, 0]], size: [0.11, 0.1, 0.11] },
  rollLying: { parts: [['roll', 0, 0.055, 0, 0, 0, PI / 2]], size: [0.1, 0.11, 0.11] },
};
export const DECOR = { ...BUILTIN_DECOR, ...DECOR_MODELS };
