// Setup-sheet maths: validation, trade-off direction, and the guarantee that
// no sheet can tune a car past the physics safety rails.
import {
  CARS, CAR_IDS, BOOST_TOP_MULT, SPEED_HARD_CAP, MAX_PLAUSIBLE_SPEED,
  TUNE_AXIS_IDS, TUNE_PRESETS, TUNE_PRESET_IDS, STOCK_TUNE, TUNE_MIN, TUNE_MAX,
  sanitizeTune, tunedStats, tuneMetrics, tuneLabel, matchingPreset, isStockTune,
  simulateDrive, randomTune,
} from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- validation
check('sanitizeTune fills every axis from junk', (() => {
  const t = sanitizeTune({ gearing: 99, tires: 'soft', nope: 5 });
  return TUNE_AXIS_IDS.every((id) => Number.isInteger(t[id]) && t[id] >= TUNE_MIN && t[id] <= TUNE_MAX)
    && t.gearing === TUNE_MAX && t.tires === 0 && !('nope' in t);
})());
check('sanitizeTune(undefined) is the stock sheet', isStockTune(sanitizeTune(undefined)));
check('random sheets always validate', Array.from({ length: 50 }).every(() => {
  const t = randomTune();
  return TUNE_AXIS_IDS.every((id) => t[id] === sanitizeTune(t)[id]);
}));

// --- stock sheet must be a no-op, or every existing car changes feel
check('stock sheet reproduces the roster stats exactly', CAR_IDS.every((id) => {
  const c = CARS[id];
  const T = tunedStats(c, STOCK_TUNE);
  return near(T.accel, c.accel) && near(T.topSpeed, c.topSpeed) && near(T.handling, c.handling)
    && near(T.grip, c.grip) && near(T.drift, c.drift) && near(T.boost, c.boost)
    && near(T.mass, c.mass) && near(T.springMul, 1) && near(T.dampMul, 1) && near(T.downforceMul, 1);
}));

// --- every axis is a trade: one stat up, another down
const base = tunedStats('balanced', STOCK_TUNE);
const axisMoves = {
  gearing: (t) => t.topSpeed > base.topSpeed && t.accel < base.accel,
  tires: (t) => t.grip > base.grip && t.drift > base.drift && t.topSpeed < base.topSpeed,
  suspension: (t) => t.handling > base.handling && t.springMul > 1,
  wing: (t) => t.downforceMul > 1 && t.topSpeed < base.topSpeed,
  ballast: (t) => t.mass > base.mass && t.accel < base.accel && t.handling < base.handling,
};
for (const id of TUNE_AXIS_IDS) {
  const up = tunedStats('balanced', { ...STOCK_TUNE, [id]: 2 });
  const down = tunedStats('balanced', { ...STOCK_TUNE, [id]: -2 });
  check(`${id}: +2 gives and takes`, axisMoves[id](up));
  check(`${id}: −2 mirrors +2`, !axisMoves[id](down));
}

// --- ride height follows spring rate (the garage stance preview)
check('stiff springs stand the car up, soft springs slam it', (() => {
  const stiff = tunedStats('balanced', { ...STOCK_TUNE, suspension: 2 });
  const soft = tunedStats('balanced', { ...STOCK_TUNE, suspension: -2 });
  return stiff.settle > base.settle && base.settle > soft.settle && soft.settle > 0;
})());

// --- safety rails: no sheet on any car may reach the anti-teleport ceiling
let worst = 0;
const notches = [TUNE_MIN, -1, 0, 1, TUNE_MAX];
for (const id of CAR_IDS) {
  for (const g of notches) {
    for (const w of notches) {
      for (const ti of notches) {
        const T = tunedStats(id, { ...STOCK_TUNE, gearing: g, wing: w, tires: ti });
        worst = Math.max(worst, T.topSpeed * BOOST_TOP_MULT);
      }
    }
  }
}
check(`fastest tuned + boost (${worst.toFixed(1)}) stays under the hard cap ${SPEED_HARD_CAP}`, worst < SPEED_HARD_CAP);
check(`fastest tuned + boost stays under MAX_PLAUSIBLE_SPEED ${MAX_PLAUSIBLE_SPEED}`, worst < MAX_PLAUSIBLE_SPEED);
check('grip and drift stay inside their clamps for every sheet', CAR_IDS.every((id) => notches.every((ti) => {
  const T = tunedStats(id, { ...STOCK_TUNE, tires: ti, suspension: ti, wing: ti });
  return T.grip > 0.29 && T.grip <= 1.15 && T.drift >= 0.16 && T.drift <= 0.85;
})));

// --- preview: deterministic, and it agrees with the stats it reports
const a = simulateDrive('balanced', STOCK_TUNE);
const b = simulateDrive('balanced', STOCK_TUNE);
check('simulateDrive is deterministic', JSON.stringify(a.path) === JSON.stringify(b.path));
// one engine step of overshoot is inherent to the model's `if (v < top)` gate,
// plus a hair from yaw rotating lateral velocity into the forward axis
check('simulateDrive respects the speed ceiling', a.topSpeed <= base.topSpeed + base.accel / 60 + 0.05);
check('a sprint sheet covers more ground than stock in 6 s',
  simulateDrive('balanced', TUNE_PRESETS.sprint.tune).progress > a.progress);
check('a bruiser sheet covers less ground than stock in 6 s',
  simulateDrive('balanced', TUNE_PRESETS.bruiser.tune).progress < a.progress);
check('the slalom weaves instead of spinning (lateral stays small)',
  Math.abs(a.path[a.path.length - 1][0]) < a.progress * 0.5);
check('metrics report a sane scale speed and launch time', (() => {
  const m = tuneMetrics('formula', STOCK_TUNE);
  return m.kmh > 50 && m.kmh < 400 && m.zeroToTop > 0.3 && m.zeroToTop < 5 && m.path.length > 100;
})());

// --- presets & labels
check('every preset validates and is recognised back', TUNE_PRESET_IDS.every((id) => {
  const t = sanitizeTune(TUNE_PRESETS[id].tune);
  return matchingPreset(t) === id;
}));
check('tuneLabel names the stock sheet and marks maxed axes',
  tuneLabel(STOCK_TUNE) === 'Stock Sheet'
  && tuneLabel({ ...STOCK_TUNE, gearing: 2 }) === 'Tall+'
  && tuneLabel({ ...STOCK_TUNE, ballast: -1 }) === 'Stripped');

console.log(fails ? `\n${fails} FAILURES` : '\nall tuning checks passed');
process.exit(fails ? 1 : 0);
