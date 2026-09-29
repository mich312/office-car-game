// Rounded boxes, built once per size and shared. The art direction's first
// rule is "nothing has a razor edge": at 18 cm car scale a 1-2 cm radius is a
// visible highlight along every edge, and it's most of what stops furniture
// reading as greybox. drei's <RoundedBox> builds a fresh geometry per
// instance; 21 chairs would be 21 copies of the same backrest, so pieces that
// repeat come from here instead.
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const cache = new Map();
const key = (...n) => n.map((v) => v.toFixed(3)).join('|');

// radius is clamped to what the box can take (just under half its thinnest side)
export function roundedBox(w, h, d, radius, segments = 2) {
  const r = Math.min(radius, Math.min(w, h, d) * 0.48);
  const k = key(w, h, d, r, segments);
  let g = cache.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, r);
    cache.set(k, g);
  }
  return g;
}
