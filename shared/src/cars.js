// Car styles. All differences are feel/handling — nothing pay-to-win.
// accel: engine force multiplier, topSpeed: units/s, handling: steering rate,
// grip: lateral grip (1 = full), drift: grip multiplier while drifting,
// boost: extra force while boosting, mass: rigid body mass.
export const CARS = {
  buggy: {
    id: 'buggy',
    name: 'Dune Buggy',
    desc: 'Bouncy all-rounder with big travel suspension.',
    accel: 14,
    topSpeed: 16,
    handling: 3.6,
    grip: 0.9,
    drift: 0.42,
    boost: 11,
    mass: 1.0,
    color: '#ff6b35',
  },
  drift: {
    id: 'drift',
    name: 'Drift King',
    desc: 'Low, loose and sideways. Corners are a lifestyle.',
    accel: 13,
    topSpeed: 17,
    handling: 4.0,
    grip: 0.76,
    drift: 0.28,
    boost: 12,
    mass: 0.95,
    color: '#b967ff',
  },
  monster: {
    id: 'monster',
    name: 'Micro Monster',
    desc: 'Heavy, unstoppable, climbs keyboards like gravel.',
    accel: 16,
    topSpeed: 14,
    handling: 3.0,
    grip: 0.95,
    drift: 0.55,
    boost: 10,
    mass: 1.45,
    color: '#2ecc71',
  },
  formula: {
    id: 'formula',
    name: 'Formula Fun',
    desc: 'Fastest in a straight line, twitchy everywhere else.',
    accel: 14,
    topSpeed: 20,
    handling: 3.4,
    grip: 0.92,
    drift: 0.5,
    boost: 13,
    mass: 0.85,
    color: '#e74c3c',
  },
  balanced: {
    id: 'balanced',
    name: 'Office Hatch',
    desc: 'The sensible company car. Good at everything.',
    accel: 14,
    topSpeed: 17,
    handling: 3.6,
    grip: 0.9,
    drift: 0.45,
    boost: 11,
    mass: 1.0,
    color: '#3498db',
  },
};

export const CAR_IDS = Object.keys(CARS);

export const PAINT_COLORS = [
  '#ff6b35', '#b967ff', '#2ecc71', '#e74c3c', '#3498db',
  '#f1c40f', '#1abc9c', '#e84393', '#ecf0f1', '#2d3436',
];

// ---------------------------------------------------------------------------
// Visual tuning (NFS Underground / Midnight Club energy) — all cosmetic,
// picked in the garage and synced to every client so rivals see your build.
export const WHEEL_STYLES = {
  stock: { name: 'Stock Steelies', rim: '#c9cfd8', spokes: 0 },
  five: { name: 'Five-Spoke Sport', rim: '#eef1f6', spokes: 5 },
  mesh: { name: 'Star Mesh', rim: '#d8c9ff', spokes: 6 },
  turbofan: { name: 'Turbofan Disc', rim: '#aeb6c4', disc: true },
  gold: { name: 'Gold Chrome', rim: '#f2c14e', spokes: 5 },
  deepdish: { name: 'Midnight Deep-Dish', rim: '#3a3e47', spokes: 6, lip: true },
};
export const WHEEL_IDS = Object.keys(WHEEL_STYLES);

export const SPOILER_STYLES = {
  none: { name: 'Clean Deck' },
  duck: { name: 'Ducktail' },
  gt: { name: 'GT Wing' },
  mega: { name: 'Park Bench XXL' },
};
export const SPOILER_IDS = Object.keys(SPOILER_STYLES);

export const VINYL_STYLES = {
  none: { name: 'Clean' },
  stripes: { name: 'Racing Stripes' },
  flames: { name: 'Flames' },
  tribal: { name: 'Tribal' },
  hex: { name: 'Hex Camo' },
  bolt: { name: 'Thunderbolt' },
};
export const VINYL_IDS = Object.keys(VINYL_STYLES);

export const VINYL_COLORS = ['#f5f5f5', '#17181c', '#ffd166', '#ff5c5c', '#7ab8ff', '#b967ff', '#2eff8f', '#ff6bf0'];
export const GLOW_COLORS = [null, '#7ab8ff', '#b967ff', '#2eff8f', '#ff5c5c', '#ffd166', '#ff6bf0'];

export const DEFAULT_STYLE = { wheels: 'stock', spoiler: 'none', vinyl: 'none', vinylColor: '#f5f5f5', glow: null };

// Server-side (and load-time) validation: any unknown value falls back to stock.
export function sanitizeStyle(s) {
  const st = s && typeof s === 'object' ? s : {};
  return {
    wheels: WHEEL_STYLES[st.wheels] ? st.wheels : 'stock',
    spoiler: SPOILER_STYLES[st.spoiler] ? st.spoiler : 'none',
    vinyl: VINYL_STYLES[st.vinyl] ? st.vinyl : 'none',
    vinylColor: VINYL_COLORS.includes(st.vinylColor) ? st.vinylColor : '#f5f5f5',
    glow: GLOW_COLORS.includes(st.glow) ? st.glow : null,
  };
}

// Bots roll a random build so the lobby looks like a car meet.
export function randomStyle() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return {
    wheels: pick(WHEEL_IDS),
    spoiler: pick(SPOILER_IDS),
    vinyl: pick(VINYL_IDS),
    vinylColor: pick(VINYL_COLORS),
    glow: pick(GLOW_COLORS),
  };
}

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
