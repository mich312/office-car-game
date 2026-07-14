// Car styles. All differences are feel/handling — nothing pay-to-win.
// accel: engine force multiplier, topSpeed: units/s, handling: steering rate,
// grip: lateral grip (1 = full), drift: grip multiplier while drifting,
// boost: extra force while boosting, mass: rigid body mass.
export const CARS = {
  buggy: {
    id: 'buggy',
    name: 'Dune Buggy',
    desc: 'Bouncy all-rounder with big travel suspension.',
    accel: 26,
    topSpeed: 32,
    handling: 2.7,
    grip: 0.82,
    drift: 0.42,
    boost: 22,
    mass: 1.0,
    color: '#ff6b35',
  },
  drift: {
    id: 'drift',
    name: 'Drift King',
    desc: 'Low, loose and sideways. Corners are a lifestyle.',
    accel: 25,
    topSpeed: 34,
    handling: 3.2,
    grip: 0.66,
    drift: 0.28,
    boost: 24,
    mass: 0.95,
    color: '#b967ff',
  },
  monster: {
    id: 'monster',
    name: 'Micro Monster',
    desc: 'Heavy, unstoppable, climbs keyboards like gravel.',
    accel: 30,
    topSpeed: 27,
    handling: 2.2,
    grip: 0.92,
    drift: 0.55,
    boost: 19,
    mass: 1.45,
    color: '#2ecc71',
  },
  formula: {
    id: 'formula',
    name: 'Formula Fun',
    desc: 'Fastest in a straight line, twitchy everywhere else.',
    accel: 28,
    topSpeed: 38,
    handling: 2.9,
    grip: 0.88,
    drift: 0.5,
    boost: 27,
    mass: 0.85,
    color: '#e74c3c',
  },
  balanced: {
    id: 'balanced',
    name: 'Office Hatch',
    desc: 'The sensible company car. Good at everything.',
    accel: 27,
    topSpeed: 33,
    handling: 2.8,
    grip: 0.85,
    drift: 0.45,
    boost: 22,
    mass: 1.0,
    color: '#3498db',
  },
};

export const CAR_IDS = Object.keys(CARS);

export const PAINT_COLORS = [
  '#ff6b35', '#b967ff', '#2ecc71', '#e74c3c', '#3498db',
  '#f1c40f', '#1abc9c', '#e84393', '#ecf0f1', '#2d3436',
];

// Cosmetic unlocks earned through play (XP thresholds).
export const UNLOCKS = [
  { xp: 0, type: 'paint', value: '#ff6b35', name: 'Safety Orange' },
  { xp: 0, type: 'paint', value: '#3498db', name: 'Corporate Blue' },
  { xp: 50, type: 'paint', value: '#2ecc71', name: 'Plant Green' },
  { xp: 100, type: 'antenna', value: 'ball', name: 'Bobble Antenna' },
  { xp: 150, type: 'paint', value: '#f1c40f', name: 'Highlighter' },
  { xp: 220, type: 'hat', value: 'cone', name: 'Tiny Traffic Cone' },
  { xp: 300, type: 'paint', value: '#e84393', name: 'HR Pink' },
  { xp: 400, type: 'trail', value: 'rainbow', name: 'Rainbow Trail' },
  { xp: 520, type: 'hat', value: 'tophat', name: 'CEO Top Hat' },
  { xp: 650, type: 'paint', value: '#2d3436', name: 'Stealth Ninja' },
];
