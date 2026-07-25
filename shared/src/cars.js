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

// Paint finish changes the shading model itself, not just the hue: gloss keeps
// the banded toon look the whole art direction is built on, the rest reach for
// PBR so a metallic flake or a pearl clearcoat actually catches the office
// strip lights. `toon: false` is the client's cue to switch material class.
export const FINISHES = {
  gloss: { name: 'Toy Gloss', toon: true },
  matte: { name: 'Matte Wrap', toon: false, roughness: 0.85, metalness: 0.05 },
  metal: { name: 'Metal Flake', toon: false, roughness: 0.3, metalness: 0.85 },
  pearl: { name: 'Pearl Coat', toon: false, roughness: 0.16, metalness: 0.35, clearcoat: 1, iridescence: 0.55 },
};
export const FINISH_IDS = Object.keys(FINISHES);

// Accent package: trim colour for splitter, mirror caps, wing blade, roll cage
// and the driver's helmet. `null` = painted body colour, i.e. no two-tone.
export const ACCENT_COLORS = [null, '#f5f5f5', '#17181c', '#ffd166', '#ff5c5c', '#7ab8ff', '#2eff8f', '#d4af37'];

// ---------------------------------------------------------------------------
// Bolt-on parts. This is the tuning that matters in a garage: a bumper, a
// hood, a roof, a pipe, sills, arches, rubber and glass. Every option is pure
// visuals — nothing here touches handling — and every option fits every body,
// because the parts mount off surfaces measured from each shell rather than
// hand-placed per car.
//
// Slot order is the order they appear in the garage, front of the car to back.
export const PART_SLOTS = [
  {
    id: 'front',
    name: 'Front end',
    focus: 'front',
    options: {
      stock: 'Stock bumper',
      splitter: 'Splitter lip',
      bar: 'Bull bar',
      winch: 'Winch bumper',
    },
  },
  {
    id: 'hood',
    name: 'Hood',
    focus: 'front',
    options: { stock: 'Smooth', scoop: 'Ram scoop', vents: 'Twin vents', pins: 'Pinned' },
  },
  {
    id: 'roof',
    name: 'Roof',
    focus: 'roof',
    options: { none: 'Bare', rack: 'Cargo rack', lightbar: 'Light bar', tray: 'Inbox tray' },
  },
  {
    id: 'skirts',
    name: 'Sills',
    focus: 'side',
    options: { none: 'Clean', skirt: 'Side skirts', steps: 'Running boards' },
  },
  {
    id: 'flares',
    name: 'Arches',
    focus: 'side',
    options: { stock: 'Stock arches', wide: 'Widebody' },
  },
  {
    id: 'tyre',
    name: 'Tyres',
    focus: 'wheel',
    options: { road: 'Road', knobby: 'Knobbly', slick: 'Slicks' },
  },
  {
    id: 'exhaust',
    name: 'Exhaust',
    focus: 'rear',
    options: { single: 'Single tip', twin: 'Twin tips', side: 'Side pipes', stacks: 'Stacks' },
  },
  {
    id: 'tint',
    name: 'Glass',
    focus: 'side',
    options: { clear: 'Clear', smoke: 'Smoked', limo: 'Limo black' },
  },
];

export const PART_SLOT_IDS = PART_SLOTS.map((s) => s.id);
const PART_DEFAULTS = {
  front: 'stock', hood: 'stock', roof: 'none', skirts: 'none',
  flares: 'stock', tyre: 'road', exhaust: 'single', tint: 'clear',
};

// Plate text: 7 characters of facilities-issue asset tag. Empty = fall back to
// the driver name, which is what shipped before plates were editable.
export const PLATE_MAX = 7;
export function sanitizePlate(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, PLATE_MAX).trim();
}

export const DEFAULT_STYLE = {
  wheels: 'stock', spoiler: 'none', vinyl: 'none', vinylColor: '#f5f5f5', glow: null,
  finish: 'gloss', accent: null, plate: '', ...PART_DEFAULTS,
};

// Server-side (and load-time) validation: any unknown value falls back to stock.
export function sanitizeStyle(s) {
  const st = s && typeof s === 'object' ? s : {};
  const parts = {};
  for (const slot of PART_SLOTS) {
    parts[slot.id] = slot.options[st[slot.id]] ? st[slot.id] : PART_DEFAULTS[slot.id];
  }
  return {
    ...parts,
    plate: sanitizePlate(st.plate),
    wheels: WHEEL_STYLES[st.wheels] ? st.wheels : 'stock',
    spoiler: SPOILER_STYLES[st.spoiler] ? st.spoiler : 'none',
    vinyl: VINYL_STYLES[st.vinyl] ? st.vinyl : 'none',
    vinylColor: VINYL_COLORS.includes(st.vinylColor) ? st.vinylColor : '#f5f5f5',
    glow: GLOW_COLORS.includes(st.glow) ? st.glow : null,
    finish: FINISHES[st.finish] ? st.finish : 'gloss',
    accent: ACCENT_COLORS.includes(st.accent) ? st.accent : null,
  };
}

// Bots roll a random build so the lobby looks like a car meet.
export function randomStyle() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const parts = {};
  for (const slot of PART_SLOTS) parts[slot.id] = pick(Object.keys(slot.options));
  return {
    ...parts,
    wheels: pick(WHEEL_IDS),
    spoiler: pick(SPOILER_IDS),
    vinyl: pick(VINYL_IDS),
    vinylColor: pick(VINYL_COLORS),
    glow: pick(GLOW_COLORS),
    finish: pick(FINISH_IDS),
    accent: pick(ACCENT_COLORS),
  };
}

// Cosmetic unlocks earned through play (XP thresholds). Three equip slots —
// hat, antenna, trail — plus paints. Values are ids the client knows how to
// render (CarModel hats/antennas, Trail ribbon kinds).
export const UNLOCKS = [
  { xp: 0, type: 'paint', value: '#ff6b35', name: 'Safety Orange' },
  { xp: 0, type: 'paint', value: '#3498db', name: 'Corporate Blue' },
  { xp: 50, type: 'paint', value: '#2ecc71', name: 'Plant Green' },
  { xp: 100, type: 'antenna', value: 'ball', name: 'Bobble Antenna' },
  { xp: 150, type: 'paint', value: '#f1c40f', name: 'Highlighter' },
  { xp: 220, type: 'hat', value: 'cone', name: 'Tiny Traffic Cone' },
  { xp: 280, type: 'antenna', value: 'flag', name: 'Deadline Flag' },
  { xp: 300, type: 'paint', value: '#e84393', name: 'HR Pink' },
  { xp: 400, type: 'trail', value: 'rainbow', name: 'Rainbow Trail' },
  { xp: 470, type: 'hat', value: 'propeller', name: 'Propeller Beanie' },
  { xp: 520, type: 'hat', value: 'tophat', name: 'CEO Top Hat' },
  { xp: 600, type: 'trail', value: 'flame', name: 'Flame Trail' },
  { xp: 650, type: 'paint', value: '#2d3436', name: 'Stealth Ninja' },
  { xp: 750, type: 'hat', value: 'plant', name: 'Emotional Support Plant' },
  { xp: 900, type: 'paint', value: '#d4af37', name: 'Quarterly Bonus Gold' },
];

// Wire-safe cosmetic ids per slot — the server validates HELLO against these.
export const COSMETIC_IDS = {
  hat: ['cone', 'tophat', 'propeller', 'plant'],
  antenna: ['ball', 'flag'],
  trail: ['rainbow', 'flame'],
};
