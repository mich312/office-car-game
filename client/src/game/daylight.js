// The office as a place that has a time of day.
//
// One table, four hours of the day, consumed by everything that emits or receives light:
// Lighting.jsx (sun, ambient, ceiling points, the procedural environment),
// Office.jsx (window shafts, floor pools, ceiling panels, balcony sheen) and
// Effects.jsx (bloom). Nothing reads a boolean any more — a phase is a whole
// lighting state, and the renderers cross-fade between them.
//
// The two numbers that carry the look are the sun's *elevation* and its
// *colour*: low + warm is the entire golden-hour read, and shadow length falls
// out of it for free because it is a real directional light.
//
// Sun positions are in world units. +z is north (the glass wall and the city
// backdrop), +x is east, so morning light rakes in from the east corner and
// golden hour comes back the other way across the open-plan floor.

export const HOURS = ['morning', 'afternoon', 'golden', 'night'];

export const DAYLIGHT = {
  morning: {
    label: 'Morning',
    clock: '07:40',
    // low and east: long shadows thrown west off every chair leg
    sun: { pos: [165, 46, 96], color: '#cfe0ff', intensity: 2.1 },
    amb: { intensity: 0.3, color: '#c6d4f2' },
    hemi: { intensity: 0.5, sky: '#d6e4ff', ground: '#3b3a30' },
    ceiling: 6, // strips are on but losing to the windows
    env: {
      intensity: 0.72,
      bg: '#3c4c6e',
      window: { color: '#dce9ff', intensity: 4.2 },
      ceil: { color: '#fff0d8', intensity: 1.8 },
      warm: { color: '#ffd9a8', intensity: 1.1 },
      key: { color: '#eaf2ff', intensity: 2.2 },
    },
    // shafts: shallow tilt = a low sun, laid down the floor rather than onto it
    shaft: { opacity: 0.16, color: '#dbe8ff', tilt: 0.72, yaw: 0.22, length: 30 },
    pool: 0.06,
    panel: 1.1,
    bloom: { intensity: 0.5, threshold: 0.85 },
    // low sun = grazing angles = acne unless normalBias goes up
    shadow: { bias: -0.0007, normalBias: 0.55, opacity: 0.72 },
    practical: 0.18,
    wet: false,
  },

  afternoon: {
    label: 'Afternoon',
    clock: '14:20',
    // high and near-overhead: short, crisp, hard-edged shadows
    sun: { pos: [40, 190, 74], color: '#fff6e6', intensity: 3.1 },
    amb: { intensity: 0.38, color: '#dfe6f6' },
    hemi: { intensity: 0.62, sky: '#eaf1ff', ground: '#4a4334' },
    ceiling: 2, // daylight wins; the strips are almost redundant
    env: {
      intensity: 0.9,
      bg: '#8fa8cc',
      window: { color: '#ffffff', intensity: 6 },
      ceil: { color: '#fff6e4', intensity: 2 },
      warm: { color: '#ffe6c4', intensity: 1.5 },
      key: { color: '#ffffff', intensity: 3.4 },
    },
    shaft: { opacity: 0.07, color: '#fff4dc', tilt: 1.24, yaw: 0.05, length: 20 },
    pool: 0.03,
    panel: 0.9,
    bloom: { intensity: 0.72, threshold: 0.78 },
    shadow: { bias: -0.0004, normalBias: 0.28, opacity: 0.9 },
    practical: 0.06,
    wet: false,
  },

  golden: {
    label: 'Golden hour',
    clock: '19:05',
    // very low and west: the longest shadows in the game, deep orange key
    sun: { pos: [-172, 30, 108], color: '#ff9a3c', intensity: 3.4 },
    amb: { intensity: 0.26, color: '#ffcf9a' },
    hemi: { intensity: 0.42, sky: '#ffc98a', ground: '#4a3020' },
    ceiling: 4,
    env: {
      intensity: 0.82,
      bg: '#c4703a',
      window: { color: '#ffb060', intensity: 6.5 },
      ceil: { color: '#ffe0b0', intensity: 1.4 },
      warm: { color: '#ff9c4a', intensity: 2.4 },
      key: { color: '#ffd0a0', intensity: 2.6 },
    },
    // the money shot: wide, bright, near-horizontal bands across the track
    shaft: { opacity: 0.3, color: '#ffb266', tilt: 0.5, yaw: -0.3, length: 38 },
    pool: 0.05,
    panel: 1.1,
    bloom: { intensity: 1.05, threshold: 0.66 },
    shadow: { bias: -0.0008, normalBias: 0.62, opacity: 0.6 },
    practical: 0.3,
    wet: false,
  },

  night: {
    label: 'Night',
    clock: '23:40',
    // moon only — everything readable has to come from a practical light
    sun: { pos: [-96, 128, 152], color: '#7f9fff', intensity: 0.55 },
    amb: { intensity: 0.12, color: '#aab6d8' },
    hemi: { intensity: 0.18, sky: '#93a6d8', ground: '#2a2620' },
    ceiling: 22, // the strips are now the whole lighting budget
    env: {
      intensity: 0.35,
      bg: '#070b16',
      window: { color: '#4c6cb8', intensity: 1.2 },
      ceil: { color: '#ffe8c4', intensity: 2.2 },
      warm: { color: '#ffd9a8', intensity: 0.6 },
      key: { color: '#ffffff', intensity: 0.8 },
    },
    shaft: { opacity: 0.12, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
    pool: 0.3,
    panel: 2.2,
    bloom: { intensity: 0.62, threshold: 0.8 },
    // the moon barely casts; soft and faint or it looks like a second sun
    shadow: { bias: -0.0005, normalBias: 0.45, opacity: 0.35 },
    practical: 1,
    wet: true,
  },
};

// The blackout event is not a time of day — it is every phase, extinguished.
export const LIGHTS_OUT = {
  label: 'Lights out',
  clock: '--:--',
  sun: { pos: [-96, 128, 152], color: '#7f9fff', intensity: 0.02 },
  amb: { intensity: 0.03, color: '#8f9ec4' },
  hemi: { intensity: 0.02, sky: '#7f90c0', ground: '#1a1814' },
  ceiling: 0,
  env: {
    intensity: 0.06,
    bg: '#05060a',
    window: { color: '#3a4e88', intensity: 0.8 },
    ceil: { color: '#5a4a34', intensity: 0.2 },
    warm: { color: '#4a3a28', intensity: 0.2 },
    key: { color: '#5a6480', intensity: 0.3 },
  },
  shaft: { opacity: 0.15, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
  pool: 0,
  panel: 0.02,
  bloom: { intensity: 0.5, threshold: 0.86 },
  shadow: { bias: -0.0005, normalBias: 0.45, opacity: 0.15 },
  // screens and charger LEDs are on a UPS — in a blackout they are the only
  // way to read the room, which makes them navigation rather than decoration
  practical: 0.85,
  wet: true,
};

export const hourAfter = (id) => HOURS[(HOURS.indexOf(id) + 1) % HOURS.length];

// What the renderers actually ask for: the blackout wins over the clock.
export const lightingFor = (hour, lightsOut) =>
  (lightsOut ? LIGHTS_OUT : DAYLIGHT[hour] || DAYLIGHT.golden);
