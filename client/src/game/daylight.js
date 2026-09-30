// The office as a place that has a time of day.
//
// One table, four hours of the day, consumed by everything that emits or receives light:
// Lighting.jsx (sun, ambient, ceiling points, the procedural environment, fog,
// exposure), Office.jsx (window shafts, floor pools, ceiling panels, the sky
// past the glass) and Effects.jsx (bloom and the grade). Nothing reads a
// boolean any more — a phase is a whole lighting state, and the renderers
// cross-fade between them.
//
// The two numbers that carry the look are the sun's *elevation* and its
// *colour*: low + warm is the entire golden-hour read, and shadow length falls
// out of it for free because it is a real directional light.
//
// KEY AND FILL. The frame reads flat or deep on one ratio: how much of the
// floor's light comes from the sun (directional, shadowed) against how much
// comes from everywhere (ambient, hemisphere, the environment map). The first
// version of this table lit a golden-hour floor about four times more from
// the fill than from the sun, so sun and shade differed by under 20% and no
// shadow had any weight. The hours below are key-lit: little fill, a strong
// sun, and exposure (the `exposure` key, applied before the tone curve)
// brings the frame back up. That is what a camera does in a dim room — it
// opens up — and it is why the shadows now have depth instead of the room
// merely being darker.
//
// UNITS, so rows can be compared at a glance:
//   sun.intensity   irradiance on a surface facing the sun; a floor gets
//                   intensity × sin(elevation) — a golden sun at 8° gives a
//                   floor ~0.14 of its number
//   ceiling         the floor's irradiance straight under a ceiling fixture,
//                   whatever the ceiling height or world scale (Lighting.jsx
//                   converts it into a point-light intensity). 0.5 is a lit
//                   office at night; the pools fall off from there (decay 2)
//   exposure        multiplies the scene before ACES (1 = neutral)
//   fog             FogExp2 in world units: the haze reaches
//                   1 − exp(−(density·d)²) at distance d
//   grade           applied after the tone curve, in perceptual space:
//                   contrast (round mid-grey), sat, a split tone — `shadow`
//                   and `high` tints keyed on luminance, `split` how much,
//                   `lift` how far the shadow tint lifts the blacks —
//                   vignette and film grain
//
// Sun positions are in world units. +z is north (the glass wall and the city
// backdrop), +x is east, so morning light rakes in from the east corner and
// golden hour comes back the other way across the open-plan floor.
//
// SCALE WARNING for the `shadow` block. `normalBias` is measured in WORLD
// UNITS (a car length) — so normalBias 0.62 is most of a car. The first pass
// used values borrowed from 1-unit-per-metre scenes to fight acne on a
// grazing sun, and pushed every contact shadow clean off its caster: cars
// floated, a pencil on the floor cast nothing at all. Anything above ~0.1
// here detaches shadows from car-sized objects. The tight following frustum
// (Lighting.jsx) also means far less bias is needed than the old
// building-wide map wanted.

export const HOURS = ['morning', 'afternoon', 'golden', 'night'];

// A grade, in the order the shader applies it.
const G = (contrast, sat, shadow, high, split, lift, vignette, grain) => ({ contrast, sat, shadow, high, split, lift, vignette, grain });

export const DAYLIGHT = {
  morning: {
    label: 'Morning',
    clock: '07:40',
    // low and east: long shadows thrown west off every chair leg, a cold
    // blue room with the sun laid across it in pale gold bars
    sun: { pos: [165, 46, 96], color: '#ffe6c8', intensity: 3.6 },
    amb: { intensity: 0.08, color: '#b9c9ec' },
    hemi: { intensity: 0.3, sky: '#c8d8ff', ground: '#3b3a30' },
    ceiling: 0.32, // strips are on but losing to the windows
    env: {
      intensity: 0.42,
      bg: '#3c4c6e',
      window: { color: '#dce9ff', intensity: 4.2 },
      ceil: { color: '#e8eeff', intensity: 0.9 },
      warm: { color: '#ffd9a8', intensity: 0.8 },
      key: { color: '#eaf2ff', intensity: 1.8 },
    },
    // shafts: shallow tilt = a low sun, laid down the floor rather than onto it
    shaft: { opacity: 0.2, color: '#ffe8cc', tilt: 0.72, yaw: 0.22, length: 30 },
    pool: 0.05,
    panel: 1.1,
    bloom: { intensity: 0.7, threshold: 1.15 },
    shadow: { bias: -0.0003, normalBias: 0.06, opacity: 0.9 },
    practical: 0.18,
    wet: false,
    exposure: 1.12,
    fog: { color: '#8ea3c4', density: 0.0042 },
    grade: G(1.1, 1.0, '#44609a', '#fff0d8', 0.1, 0.015, 0.3, 0.025),
  },

  afternoon: {
    label: 'Afternoon',
    clock: '14:20',
    // high and near-overhead. The ceiling casts now, so the sun reaches the
    // floor only through the north glass: a bright strip by the windows and
    // a room lit by its fittings and the sky. Still the day's brightest hour
    // — this is the office at work — but with the contrast of a real room.
    sun: { pos: [40, 190, 74], color: '#fff3e2', intensity: 5.2 },
    amb: { intensity: 0.2, color: '#dfe6f6' },
    hemi: { intensity: 0.5, sky: '#e6eeff', ground: '#4a4334' },
    ceiling: 0.4, // daylight wins; the strips are almost redundant
    env: {
      intensity: 0.75,
      bg: '#8fa8cc',
      window: { color: '#ffffff', intensity: 6 },
      ceil: { color: '#fff6e4', intensity: 1.4 },
      warm: { color: '#ffe6c4', intensity: 1.2 },
      key: { color: '#ffffff', intensity: 2.8 },
    },
    shaft: { opacity: 0.08, color: '#fff4dc', tilt: 1.24, yaw: 0.05, length: 20 },
    pool: 0.03,
    panel: 0.9,
    bloom: { intensity: 0.6, threshold: 1.1 },
    shadow: { bias: -0.00015, normalBias: 0.03, opacity: 0.95 },
    practical: 0.06,
    wet: false,
    exposure: 1.05,
    fog: { color: '#b4c4da', density: 0.0028 },
    grade: G(1.1, 1.04, '#44608f', '#fff4e2', 0.06, 0.0, 0.24, 0.02),
  },

  golden: {
    label: 'Golden hour',
    clock: '19:05',
    // very low and west: the longest shadows in the game, deep orange key
    sun: { pos: [-172, 30, 108], color: '#ff9440', intensity: 7 },
    // Warm sun, COOL fill. Every light here used to be orange, and a scene lit
    // in one hue has nothing to separate: walls, floor and ceiling merged into
    // one orange, and the blue car rendered green (orange light × blue paint
    // leaves mostly green — measured 153° against its true 204°, under every
    // tone mapper, so it was never ACES). Real golden hour has a blue sky
    // filling the shadows; that warm/cool split is the Firewatch read. The
    // fill is now a fifth of what it was, so the split carries: the sun's
    // bars are the brightest thing on the floor and the shade between them
    // is blue-violet, not beige.
    amb: { intensity: 0.08, color: '#aca2c2' },
    hemi: { intensity: 0.3, sky: '#a8a4c8', ground: '#4a3020' },
    // most troffers are off after hours (Office.jsx): the ones still on
    // cluster round the ceiling points, so these are pools, not a wash
    ceiling: 0.42,
    env: {
      intensity: 0.3,
      bg: '#6a5260',
      window: { color: '#ffb060', intensity: 6.5 },
      ceil: { color: '#c8c0e0', intensity: 0.7 },
      warm: { color: '#ff9c4a', intensity: 2.4 },
      key: { color: '#ffd0a0', intensity: 2.6 },
    },
    // the money shot: wide, bright, near-horizontal bands across the track
    shaft: { opacity: 0.34, color: '#ffa850', tilt: 0.5, yaw: -0.3, length: 38 },
    pool: 0.12,
    panel: 1.3,
    bloom: { intensity: 0.85, threshold: 1.0 },
    shadow: { bias: -0.00035, normalBias: 0.07, opacity: 0.9 },
    practical: 0.45,
    wet: false,
    exposure: 1.3,
    fog: { color: '#3d2e40', density: 0.0052 },
    grade: G(1.14, 1.06, '#3a4680', '#ffb066', 0.12, 0.022, 0.4, 0.03),
  },

  night: {
    label: 'Night',
    clock: '23:40',
    // moon only — everything readable has to come from a practical light
    sun: { pos: [-96, 128, 152], color: '#7f9fff', intensity: 0.7 },
    amb: { intensity: 0.05, color: '#aab6d8' },
    hemi: { intensity: 0.12, sky: '#8a9cd0', ground: '#2a2620' },
    // the strips are now the whole lighting budget — but only the few on
    // motion sensors near where someone is still working (Office.jsx)
    ceiling: 1.05,
    env: {
      intensity: 0.16,
      bg: '#070b16',
      window: { color: '#4c6cb8', intensity: 1.2 },
      ceil: { color: '#ffe8c4', intensity: 1.2 },
      warm: { color: '#ffd9a8', intensity: 0.6 },
      key: { color: '#ffffff', intensity: 0.6 },
    },
    // moonbeams: barely there — brighter, they streak the glass
    shaft: { opacity: 0.04, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
    pool: 0.34,
    panel: 2.4,
    bloom: { intensity: 0.9, threshold: 0.95 },
    // the moon barely casts; faint or it reads as a second sun
    shadow: { bias: -0.0002, normalBias: 0.05, opacity: 0.5 },
    practical: 1,
    wet: true,
    exposure: 1.45,
    fog: { color: '#0b1226', density: 0.0058 },
    grade: G(1.16, 0.95, '#2a3664', '#ffc890', 0.12, 0.028, 0.46, 0.035),
  },
};

// The blackout event is not a time of day — it is every phase, extinguished.
export const LIGHTS_OUT = {
  label: 'Lights out',
  clock: '--:--',
  sun: { pos: [-96, 128, 152], color: '#7f9fff', intensity: 0.08 },
  amb: { intensity: 0.02, color: '#8f9ec4' },
  hemi: { intensity: 0.04, sky: '#7f90c0', ground: '#1a1814' },
  ceiling: 0,
  env: {
    intensity: 0.1,
    bg: '#05060a',
    window: { color: '#3a4e88', intensity: 1.0 },
    ceil: { color: '#5a4a34', intensity: 0.2 },
    warm: { color: '#4a3a28', intensity: 0.2 },
    key: { color: '#5a6480', intensity: 0.3 },
  },
  shaft: { opacity: 0.03, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
  pool: 0,
  panel: 0.02,
  bloom: { intensity: 1.0, threshold: 0.9 },
  shadow: { bias: -0.0002, normalBias: 0.05, opacity: 0.2 },
  // screens and charger LEDs are on a UPS — in a blackout they are the only
  // way to read the room, which makes them navigation rather than decoration
  practical: 0.85,
  wet: true,
  // the eye adapts: exposure well up, so the city through the glass and the
  // practicals read, and the shadow tint lifts the black to a deep blue
  // rather than the void it was
  exposure: 2.1,
  fog: { color: '#05070f', density: 0.006 },
  grade: G(1.18, 0.88, '#1e2a50', '#ff9a70', 0.16, 0.03, 0.52, 0.04),
};

// What a map's own table falls back to for the keys it leaves out (a map
// that has not been given a grade or fog yet still gets the house mood for
// that hour). A windowless `fixed` floor borrows night's grade: lit by its
// fittings, deep shadow between them.
const MOOD_KEYS = ['exposure', 'fog', 'grade'];
const MOOD_DEFAULTS = {
  morning: DAYLIGHT.morning,
  afternoon: DAYLIGHT.afternoon,
  golden: DAYLIGHT.golden,
  night: DAYLIGHT.night,
  lightsOut: LIGHTS_OUT,
  fixed: {
    exposure: 1.25,
    fog: { color: '#141a20', density: 0.006 },
    grade: G(1.12, 0.96, '#1c3040', '#fff0d8', 0.14, 0.03, 0.44, 0.035),
  },
};

export const hourAfter = (id) => HOURS[(HOURS.indexOf(id) + 1) % HOURS.length];

// Each state object gets its defaults merged once and cached, so callers can
// keep comparing states by identity (Lighting.jsx re-bakes the environment
// only when the state object changes).
const merged = new WeakMap();
function withMood(state, key) {
  let out = merged.get(state);
  if (out) return out;
  const d = MOOD_DEFAULTS[key] || MOOD_DEFAULTS.golden;
  out = { ...state };
  for (const k of MOOD_KEYS) {
    if (state[k] === undefined) out[k] = d[k];
    else if (typeof state[k] === 'object') out[k] = { ...d[k], ...state[k] };
  }
  merged.set(state, out);
  return out;
}

// What the renderers actually ask for: the blackout wins over the clock.
// A map can bring its own light (map.LIGHTING, shared/src/maps/*.js): a
// `fixed` state for a windowless floor, or its own table per hour; anything
// it leaves out falls back to the office's daylight.
export const lightingFor = (hour, lightsOut, map = null) => {
  const L = map?.LIGHTING;
  if (lightsOut) return withMood(L?.lightsOut || LIGHTS_OUT, 'lightsOut');
  if (L?.fixed) return withMood(L.fixed, 'fixed');
  const h = L?.[hour] ? hour : DAYLIGHT[hour] ? hour : 'golden';
  return withMood(L?.[h] || DAYLIGHT[h], h);
};

// The hour a floor opens on (map.DEFAULT_HOUR): each map is shown first at
// the hour it looks best at.
export const defaultHour = (map) => (HOURS.includes(map?.DEFAULT_HOUR) ? map.DEFAULT_HOUR : 'golden');

// Whether the sun can only reach this floor through its openings — a real
// roof or ceiling overhead that casts. Past the edge of the following shadow
// box (Lighting.jsx) three.js treats everything as sunlit; on a roofed floor
// that is wrong (it would be under the ceiling), so the box's edge fades to
// shade instead. Outdoor floors (the garage's lawn and drive) and a floor
// whose roof is glazing (the factory's sawtooth) keep the default.
export const isRoofed = (map) => map?.LIGHTING?.roofed ?? !map?.LIGHTING;
