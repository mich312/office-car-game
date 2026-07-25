// ---------------------------------------------------------------------------
// Garage tuning — the setup sheet under the paint.
//
// Five axes, each a pure trade-off on a −2…+2 notch scale. There is no budget
// and no "power" score to spend, because every notch gives with one hand and
// takes with the other: tall gearing buys top speed with acceleration, soft
// tyres buy grip with slide (and a hair of top speed), ballast buys shove with
// agility. A maxed-out sheet is a *specialised* car, never a stronger one —
// same rule the roster itself follows ("all differences are feel/handling").
//
// Everything here is derived, deterministic and shared: the client drives with
// these numbers, the garage previews them, the server validates them, and
// `simulateDrive()` re-runs a stripped-down copy of the real driving model so
// the preview trace on the bench monitor is honest instead of decorative.
// ---------------------------------------------------------------------------
import { CARS } from './cars.js';
import { PHYS_TIMESTEP, SUSPENSION_REST, SUSPENSION_STIFFNESS, M } from './constants.js';

export const TUNE_MIN = -2;
export const TUNE_MAX = 2;

// low/high are the labels at −2 / +2; `gains` and `costs` are what the UI
// promises the player (and what the maths below actually delivers).
export const TUNE_AXES = [
  {
    id: 'gearing',
    name: 'Gearing',
    low: 'Short',
    high: 'Tall',
    icon: '⚙️',
    desc: 'Short gears launch, tall gears run.',
    gains: 'top speed',
    costs: 'acceleration',
  },
  {
    id: 'tires',
    name: 'Tyres',
    low: 'Hard',
    high: 'Soft',
    icon: '🛞',
    desc: 'Soft rubber bites; hard rubber lets go.',
    gains: 'grip',
    costs: 'slide + a little top speed',
  },
  {
    id: 'suspension',
    name: 'Suspension',
    low: 'Soft',
    high: 'Stiff',
    icon: '🔧',
    desc: 'Stiff springs turn in; soft springs soak up desks.',
    gains: 'steering rate',
    costs: 'composure over bumps and landings',
  },
  {
    id: 'wing',
    name: 'Downforce',
    low: 'Low drag',
    high: 'High wing',
    icon: '🪁',
    desc: 'Wing angle presses you into the carpet.',
    gains: 'high-speed stability',
    costs: 'top speed',
  },
  {
    id: 'ballast',
    name: 'Ballast',
    low: 'Stripped',
    high: 'Loaded',
    icon: '🏋️',
    desc: 'Lead in the floorpan wins arguments.',
    gains: 'mass — you shove, you don\'t get shoved',
    costs: 'acceleration and agility',
  },
];

export const TUNE_AXIS_IDS = TUNE_AXES.map((a) => a.id);

export const STOCK_TUNE = { gearing: 0, tires: 0, suspension: 0, wing: 0, ballast: 0 };

// Named setup sheets. Deliberately opinionated — a preset should feel like
// somebody's build, not a slider average.
export const TUNE_PRESETS = {
  stock: { name: 'Stock Sheet', desc: 'Straight out of the box.', tune: { ...STOCK_TUNE } },
  sprint: {
    name: 'Corridor Sprint',
    desc: 'Tall gears, no wing. Built for the long hallway.',
    tune: { gearing: 2, tires: -1, suspension: 1, wing: -2, ballast: -1 },
  },
  grip: {
    name: 'Cubicle Carver',
    desc: 'Soft tyres, big wing. Point and shoot through desks.',
    tune: { gearing: -1, tires: 2, suspension: 2, wing: 2, ballast: 0 },
  },
  slide: {
    name: 'Sideways Special',
    desc: 'Hard rubber, soft springs. Everything is a drift.',
    tune: { gearing: 0, tires: -2, suspension: -1, wing: -1, ballast: -1 },
  },
  bruiser: {
    name: 'Open-Plan Bruiser',
    desc: 'Ballasted to the roof. Bumps are your item.',
    tune: { gearing: -1, tires: 1, suspension: -1, wing: 0, ballast: 2 },
  },
};

export const TUNE_PRESET_IDS = Object.keys(TUNE_PRESETS);

const clampNotch = (n) => {
  const v = Math.round(Number(n) || 0);
  return v < TUNE_MIN ? TUNE_MIN : v > TUNE_MAX ? TUNE_MAX : v;
};

// Server-side (and load-time) validation: anything unknown or out of range
// collapses to the stock sheet, so a hand-edited HELLO can't invent a setup.
export function sanitizeTune(t) {
  const src = t && typeof t === 'object' ? t : {};
  const out = {};
  for (const id of TUNE_AXIS_IDS) out[id] = clampNotch(src[id]);
  return out;
}

export function isStockTune(t) {
  const s = sanitizeTune(t);
  return TUNE_AXIS_IDS.every((id) => s[id] === 0);
}

// Bots roll a sheet too, so the lobby is full of opinions.
export function randomTune() {
  const out = {};
  for (const id of TUNE_AXIS_IDS) out[id] = TUNE_MIN + Math.floor(Math.random() * (TUNE_MAX - TUNE_MIN + 1));
  return out;
}

// Per-notch coefficients. Small on purpose: ±2 notches moves a stat by roughly
// a tenth, which is the difference between two cars in the roster — enough to
// feel, never enough to make a build mandatory.
const K = {
  gearAccel: 0.055, // tall gearing costs launch
  gearTop: 0.05,
  gearBoost: 0.02,
  tireGrip: 0.05,
  tireDriftBite: 0.07, // soft tyres refuse to slide (drift = grip while drifting)
  tireTop: 0.012, // rolling drag
  suspHandling: 0.045,
  suspGrip: 0.02,
  suspSpring: 0.2, // real spring rate — stiff cars skip and land hard
  suspDamp: 0.1,
  wingDown: 0.4,
  wingTop: 0.028,
  wingGrip: 0.015,
  ballastMass: 0.09,
  ballastAccel: 0.04,
  ballastHandling: 0.035,
};

const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

// Ride height at rest for a given spring rate: the equilibrium suspension ray
// length. Stiffer springs sag less, so the car sits taller — the garage reads
// this straight off the physics instead of faking a stance offset.
export function settleFor(springMul = 1) {
  return SUSPENSION_REST * (1 - (9.81 * M) / (SUSPENSION_STIFFNESS * springMul));
}

// The one function everything else calls: base car + setup sheet → the numbers
// the physics step actually uses.
export function tunedStats(carOrId, tune) {
  const car = (typeof carOrId === 'string' ? CARS[carOrId] : carOrId) || CARS.balanced;
  const t = sanitizeTune(tune);
  const { gearing: g, tires: ti, suspension: s, wing: w, ballast: b } = t;

  const springMul = 1 + K.suspSpring * s;
  return {
    tune: t,
    accel: car.accel * (1 - K.gearAccel * g) * (1 - K.ballastAccel * b),
    topSpeed: car.topSpeed * (1 + K.gearTop * g) * (1 - K.wingTop * w) * (1 - K.tireTop * ti),
    handling: car.handling * (1 + K.suspHandling * s) * (1 - K.ballastHandling * b),
    grip: clamp(car.grip * (1 + K.tireGrip * ti) * (1 + K.suspGrip * s) * (1 + K.wingGrip * w), 0.3, 1.15),
    drift: clamp(car.drift * (1 + K.tireDriftBite * ti), 0.16, 0.85),
    boost: car.boost * (1 + K.gearBoost * g),
    mass: (car.mass || 1) * (1 + K.ballastMass * b),
    springMul,
    dampMul: 1 + K.suspDamp * s,
    downforceMul: 1 + K.wingDown * w,
    settle: settleFor(springMul),
  };
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

// A 2D copy of the grounded driving model in LocalCar.jsx: engine force up to
// the speed ceiling, yaw rate biased toward a steering target with the
// high-speed fade, lateral velocity bled off by grip. Suspension, gravity and
// collisions are out of scope — on a flat floor at full throttle they don't
// change the shape of the line. Same numbers in, same trace out on every
// machine, so the garage preview can be diffed against stock.
// The driver is a pursuit controller — the same idea the bots use: aim at a
// point on a weaving line ahead and steer toward it. A fixed steering wave
// would let a fast car wander off-axis and turn the trace into a slow arc;
// chasing a line keeps every car on the same course, so the differences you see
// are the car's (how fast it covers the course, how much it overshoots the
// gates) instead of the input's.
export function simulateDrive(carOrId, tune, opts = {}) {
  const {
    seconds = 6,
    gatePeriod = 1.8, // seconds per weave
    gateAmp = 2.6, // units off-centre at the gates
    lookahead = 5, // how far up the course the driver aims
    steerGain = 2.2,
    dt = PHYS_TIMESTEP,
  } = opts;
  const T = tunedStats(carOrId, tune);
  let x = 0, z = 0, yaw = 0, vx = 0, vz = 0, angY = 0;
  const path = [];
  let top = 0;
  const steps = Math.round(seconds / dt);
  let gateError = 0; // running |lateral miss| against the course
  // The course: a lateral offset that weaves as you go up the corridor.
  const gateAt = (zAhead) => gateAmp * Math.sin((2 * Math.PI * zAhead) / (gatePeriod * 16));
  for (let i = 0; i < steps; i++) {
    // aim at the course a few units ahead, steer toward that bearing
    const aimX = gateAt(z + lookahead);
    const bearing = Math.atan2(aimX - x, lookahead);
    let dh = bearing - yaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * steerGain, -1, 1);
    gateError += Math.abs(gateAt(z) - x) * dt;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const fwdSpeed = vx * fx + vz * fz;
    if (fwdSpeed < T.topSpeed) {
      vx += fx * T.accel * dt;
      vz += fz * T.accel * dt;
    }
    const effSpeed = Math.max(Math.abs(fwdSpeed), 7);
    const speedFactor = Math.min(1, effSpeed / 10);
    const fadeS = clamp((Math.abs(fwdSpeed) / T.topSpeed - 0.55) / 0.55, 0, 1);
    const fade = 1 - 0.35 * fadeS * fadeS * (3 - 2 * fadeS);
    const yawTarget = steer * T.handling * speedFactor * fade;
    angY += (yawTarget - angY) * Math.min(1, dt * 14);
    yaw += angY * dt;
    const lat = vx * rx + vz * rz;
    const gripImpulse = -lat * T.grip * Math.min(1, dt * 12);
    vx += rx * gripImpulse;
    vz += rz * gripImpulse;
    x += vx * dt;
    z += vz * dt;
    if (fwdSpeed > top) top = fwdSpeed;
    if (i % 2 === 0) path.push([x, z]);
  }
  return {
    path,
    topSpeed: top,
    progress: z, // ground made up the corridor (along the start heading)
    distance: Math.hypot(x, z),
    lineError: gateError / seconds, // mean units off the course — how tidy it is
    course: (zAhead) => gateAt(zAhead),
    stats: T,
  };
}

// Headline numbers for the tuning screen. Times come from the same model the
// car drives with (engine force is mass-normalised, so a·t is exact).
export function tuneMetrics(carOrId, tune) {
  const T = tunedStats(carOrId, tune);
  const drive = simulateDrive(carOrId, tune);
  return {
    stats: T,
    topSpeed: T.topSpeed, // units/s
    kmh: scaleKmh(T.topSpeed),
    zeroToTop: T.topSpeed / T.accel, // seconds, flat out from rest
    turnRate: T.handling * (180 / Math.PI), // deg/s at full lock
    slalomDistance: drive.progress, // ground made up the corridor through the slalom
    lineError: drive.lineError, // mean units off the slalom course (lower = tidier)
    path: drive.path,
    course: drive.course,
  };
}

// Scale speed, the way RC boxes quote it: world units → m/s → km/h, then ×20
// because a 1-unit car standing in for a 4.5 m hatchback is roughly 1:20.
export const RC_SCALE = 20;
export const scaleKmh = (unitsPerSecond) => (unitsPerSecond / M) * 3.6 * RC_SCALE;

// One-line description of a sheet, for the HUD/garage ("Tall · Soft · Loaded").
export function tuneLabel(tune) {
  const t = sanitizeTune(tune);
  const parts = [];
  for (const axis of TUNE_AXES) {
    const v = t[axis.id];
    if (v === 0) continue;
    const word = v > 0 ? axis.high : axis.low;
    parts.push(Math.abs(v) === 2 ? `${word}+` : word);
  }
  return parts.length ? parts.join(' · ') : 'Stock Sheet';
}

// Does this sheet match a preset exactly? (Garage highlights the chip.)
export function matchingPreset(tune) {
  const t = sanitizeTune(tune);
  return TUNE_PRESET_IDS.find((id) => TUNE_AXIS_IDS.every((a) => TUNE_PRESETS[id].tune[a] === t[a])) || null;
}
