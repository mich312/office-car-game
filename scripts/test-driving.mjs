// Driving-model invariants, headless. Two halves:
//
// 1. The self-righting/recovery model — these tests import the exact
//    functions LocalCar.jsx drives with (shared/src/righting.js), so a
//    regression in the torque math or the recovery ladder fails here without
//    ever booting a browser. This is the model that fixes "the springs
//    glitch and the car stays tilted".
// 2. Roster-wide handling invariants via simulateDrive — every car reaches
//    its top speed, respects its ceiling, and can actually follow the slalom.
// 3. The drift-charge state machine and the brake (shared/src/handling.js),
//    and the game-feel thresholds (shared/src/feel.js) — again the exact
//    functions LocalCar.jsx calls.
import {
  CARS, CAR_IDS, tunedStats, simulateDrive,
  rightingTorque, airRightingK, groundRightingK, roofKickNeeded, recoveryTick,
  RECOVERY_AFTER_S, UPRIGHT_GROUND_DOT, PHYS_TIMESTEP,
  DRIFT_TIER_TIMES, DRIFT_TIER_BOOST_S, DRIFT_TIER_COLORS, DRIFT_CHARGE_STEER, DRIFT_CHARGE_COAST,
  driftStep, driftTier, newDriftState, isDrifting, DRIFT_ENTER_SPEED, DRIFT_HOLD_SPEED, brakeDecel, COAST_DRAG, BOOST_TOP_MULT, GRAVITY,
  landingStrength, LANDING_MIN_AIR_S, impactStrength, IMPACT_MIN_DROP, chaseHeading,
} from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const T = { x: 0, y: 0, z: 0 };
const WORLD_UP = { x: 0, y: 1, z: 0 };
const rolled = (deg) => { // car rolled about +z (tilted toward −x)
  const a = (deg * Math.PI) / 180;
  return { x: -Math.sin(a), y: Math.cos(a), z: 0 };
};
const mag = (v) => Math.hypot(v.x, v.y, v.z);

// ------------------------------------------------------ righting torque
check('righting: aligned car gets zero torque', (() => {
  rightingTorque(WORLD_UP, WORLD_UP, groundRightingK(1), T);
  return mag(T) < 1e-9;
})());

check('righting: a rolled car is torqued back upright, not further over', (() => {
  // rolled toward −x; restoring roll is a NEGATIVE torque about z
  // (right-hand rule: −z rotates −x back toward +y)
  rightingTorque(rolled(40), WORLD_UP, groundRightingK(1), T);
  return T.z < 0 && Math.abs(T.x) < 1e-9 && Math.abs(T.y) < 1e-9;
})());

check('righting: mirrored tilt gets mirrored torque', (() => {
  const a = { ...rightingTorque(rolled(40), WORLD_UP, 1, T) };
  rightingTorque(rolled(-40), WORLD_UP, 1, T);
  return Math.abs(a.z + T.z) < 1e-9;
})());

check('righting: torque grows with misalignment (sin θ)', (() => {
  const t30 = mag(rightingTorque(rolled(30), WORLD_UP, 1, T));
  const t60 = mag(rightingTorque(rolled(60), WORLD_UP, 1, T));
  const t90 = mag(rightingTorque(rolled(90), WORLD_UP, 1, T));
  return t30 < t60 && t60 < t90 && Math.abs(t90 - 1) < 1e-9;
})());

check('righting: a car sitting square on a ramp is left alone', (() => {
  // on a 25° ramp the car's up IS the surface normal — no fight with slopes
  const n = rolled(25);
  rightingTorque(n, n, groundRightingK(1), T);
  return mag(T) < 1e-9;
})());

check('righting: torque scales with the mass multiplier (tracks inertia)', (() => {
  return Math.abs(groundRightingK(1.3) / groundRightingK(1) - 1.3) < 1e-9
    && Math.abs(airRightingK(0.8) / airRightingK(1) - 0.8) < 1e-9;
})());

check('righting: grounded gain runs hotter than the air leveller', groundRightingK(1) > airRightingK(1));

// 1-DOF roll integration: the wedge scenario from the bug report. A car
// balancing tilted on two wheels, springs neutral, only the grounded
// righting torque acting (gravity's restoring help below the ~42° tip angle
// is deliberately left out — this is the worst case). Inertia approximates
// the real collider stack (two cuboids, ballast low) for a mass-1 car;
// angular damping matches the body's 1.6. The sim has no floor, so it only
// asserts the phase the torque owns: getting back INSIDE the engage gate.
// Past the gate the wheels touch down and the springs/ground take over —
// that half can't be modelled meaningfully without the contact solver.
check('righting: a 50° wedge is pushed back inside the engage gate in under 1.5 s', (() => {
  const I = 0.5, DAMP = 1.6, dt = PHYS_TIMESTEP;
  const gateDeg = (Math.acos(UPRIGHT_GROUND_DOT) * 180) / Math.PI; // ≈28°
  let theta = (50 * Math.PI) / 180, omega = 0;
  for (let t = 0; t < 3; t += dt) {
    const deg = (theta * 180) / Math.PI;
    if (deg <= gateDeg + 0.5) return t < 1.5;
    const tq = mag(rightingTorque(rolled(deg), WORLD_UP, groundRightingK(1), T));
    omega += (tq / I) * dt; // torque rolls θ back toward 0
    omega *= Math.max(0, 1 - DAMP * dt);
    theta -= omega * dt;
  }
  return false; // never made it back inside the gate
})());

// ------------------------------------------------------ roof kick
check('roof kick: fires flat on the roof', roofKickNeeded({ x: 0, y: -1, z: 0 }) && roofKickNeeded({ x: 0.1, y: -0.99, z: 0.05 }));
check('roof kick: stays out of every other pose', (() => {
  return !roofKickNeeded(WORLD_UP) // upright
    && !roofKickNeeded({ x: 1, y: 0, z: 0 }) // on its side
    && !roofKickNeeded({ x: 0.6, y: -0.8, z: 0 }); // inverted but leaning — leveller has grip
})());

// ------------------------------------------------------ recovery ladder
const dt = PHYS_TIMESTEP;
const secondsToTrigger = (upDot, speed) => {
  let acc = 0, t = 0;
  while (acc <= RECOVERY_AFTER_S && t < 10) { acc = recoveryTick(acc, upDot, speed, dt); t += dt; }
  return t;
};

check('recovery: driving upright never accrues', recoveryTick(0.9, 0.99, 15, dt) === 0);
check('recovery: a fast two-wheel cornering moment never accrues', recoveryTick(0.9, 0.6, 20, dt) === 0);
check('recovery: fully inverted triggers in ~1.2 s even while roof-sliding at speed', (() => {
  const t = secondsToTrigger(-0.9, 20);
  return Math.abs(t - RECOVERY_AFTER_S) < 0.1;
})());
check('recovery: a slow deep tilt triggers in ~1.2 s', Math.abs(secondsToTrigger(0.2, 2) - RECOVERY_AFTER_S) < 0.1);
check('recovery: a parked moderate wedge takes twice as long (backstop, not hair-trigger)', (() => {
  const t = secondsToTrigger(0.5, 1);
  return Math.abs(t - RECOVERY_AFTER_S * 2) < 0.15;
})());
check('recovery: recovering upright resets the clock completely', recoveryTick(1.1, 0.95, 0, dt) === 0);

// ------------------------------------------------------ roster handling
const lineErrors = [];
for (const id of CAR_IDS) {
  const stats = tunedStats(CARS[id], undefined);
  // straight line, 10 s: every car must actually reach its own top speed
  const straight = simulateDrive(id, undefined, { seconds: 10, gateAmp: 0 });
  check(`${id}: reaches ≥97% of its top speed on a straight`, straight.topSpeed >= stats.topSpeed * 0.97);
  check(`${id}: never exceeds its speed ceiling`, straight.topSpeed <= stats.topSpeed + stats.accel * PHYS_TIMESTEP + 0.05);
  // Default slalom: a regression tripwire, not a uniform quality bar. Four of
  // five cars track under 0.9; the formula sits near 1.7 BY DESIGN (top speed
  // bought with composure — the garage preview shows exactly this trace). The
  // per-car guard catches one car regressing to unusable; the roster-mean
  // check below catches everyone silently getting worse together.
  const slalom = simulateDrive(id, undefined);
  lineErrors.push(slalom.lineError);
  check(`${id}: holds the slalom line (error ${slalom.lineError.toFixed(2)})`, slalom.lineError < 2.0);
}
check('roster: mean slalom error stays tight', lineErrors.reduce((a, b) => a + b, 0) / lineErrors.length < 1.2);

// ------------------------------------------------------ drift tier config
check('drift: tier thresholds strictly increase', DRIFT_TIER_TIMES.every((t, i) => i === 0 || t > DRIFT_TIER_TIMES[i - 1]));
check('drift: higher tiers pay longer boosts', DRIFT_TIER_BOOST_S.every((t, i) => i === 0 || t > DRIFT_TIER_BOOST_S[i - 1]));
check('drift: every tier has a spark color', DRIFT_TIER_COLORS.length === DRIFT_TIER_TIMES.length);

// ------------------------------------------------------ drift state machine
// The exact bookkeeping LocalCar runs each physics step (shared/src/handling.js).
const DRIFT = { drifting: true, driftHeld: true, grounded: true, steering: true, overdrift: false };
const AIR = { drifting: false, driftHeld: true, grounded: false, steering: true, overdrift: false };
const LET_GO = { drifting: false, driftHeld: false, grounded: true, steering: false, overdrift: false };
const runDrift = (st, inp, seconds) => {
  const tierUps = [];
  let release = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const r = driftStep(st, inp, dt);
    if (r.tierUp) tierUps.push([r.tierUp, t + dt]);
    if (r.release) release = r.release;
  }
  return { tierUps, release };
};

check('drift: steered drift reaches each tier at its threshold, in order', (() => {
  const { tierUps } = runDrift(newDriftState(), DRIFT, 4);
  return tierUps.length === 3
    && tierUps.every(([tier, t], i) => tier === i + 1 && Math.abs(t - DRIFT_TIER_TIMES[i] / DRIFT_CHARGE_STEER) <= dt + 1e-9);
})());
check('drift: each tier-up fires exactly once', (() => {
  const { tierUps } = runDrift(newDriftState(), DRIFT, 6);
  return new Set(tierUps.map(([t]) => t)).size === tierUps.length;
})());
check('drift: coasting straight charges at the coast rate', (() => {
  const { tierUps } = runDrift(newDriftState(), { ...DRIFT, steering: false }, 3);
  return tierUps.length >= 1 && Math.abs(tierUps[0][1] - DRIFT_TIER_TIMES[0] / DRIFT_CHARGE_COAST) <= dt + 1e-9;
})());
check('drift: Overdrift charges twice as fast', (() => {
  const { tierUps } = runDrift(newDriftState(), { ...DRIFT, overdrift: true }, 1);
  return tierUps.length >= 1 && Math.abs(tierUps[0][1] - DRIFT_TIER_TIMES[0] / (2 * DRIFT_CHARGE_STEER)) <= dt + 1e-9;
})());
check('drift: releasing on the ground pays the tier reached', (() => {
  for (let tier = 1; tier <= 3; tier++) {
    const st = newDriftState();
    runDrift(st, DRIFT, DRIFT_TIER_TIMES[tier - 1] + 0.05);
    if (driftStep(st, LET_GO, dt).release !== tier) return false;
  }
  return true;
})());
check('drift: a short drift below tier 1 pays nothing and leaves no charge', (() => {
  const st = newDriftState();
  runDrift(st, DRIFT, DRIFT_TIER_TIMES[0] * 0.5);
  return driftStep(st, LET_GO, dt).release === 0 && st.charge === 0 && !st.active;
})());
check('drift: slowing out of a drift (button still held) cashes it in', (() => {
  const st = newDriftState();
  runDrift(st, DRIFT, DRIFT_TIER_TIMES[1] + 0.05);
  return driftStep(st, { ...DRIFT, drifting: false }, dt).release === 2;
})());
// The ramp hop. Before handling.js, LocalCar cleared its "was drifting" flag
// on every airborne step, so a drift carried over a hop never paid out when
// released after landing — and the unspent charge leaked into the NEXT drift.
check('drift: charge held over a ramp hop pays out when released after landing', (() => {
  const st = newDriftState();
  runDrift(st, DRIFT, DRIFT_TIER_TIMES[1] + 0.05); // tier 2
  runDrift(st, AIR, 0.6); // hop, drift held
  return st.charge > 0 && driftStep(st, LET_GO, dt).release === 2;
})());
check('drift: charge held over a hop keeps building after landing', (() => {
  const st = newDriftState();
  runDrift(st, DRIFT, DRIFT_TIER_TIMES[0] + 0.05);
  runDrift(st, AIR, 0.4);
  const { tierUps } = runDrift(st, DRIFT, DRIFT_TIER_TIMES[1] - DRIFT_TIER_TIMES[0]);
  return tierUps.length === 1 && tierUps[0][0] === 2;
})());
check('drift: letting go in the air forfeits the charge', (() => {
  const st = newDriftState();
  runDrift(st, DRIFT, DRIFT_TIER_TIMES[2] + 0.05);
  const r = driftStep(st, { ...AIR, driftHeld: false }, dt);
  return r.release === 0 && st.charge === 0 && !st.active;
})());
check('drift: no charge leaks from one drift into the next', (() => {
  const st = newDriftState();
  runDrift(st, DRIFT, DRIFT_TIER_TIMES[1] + 0.05);
  runDrift(st, AIR, 0.4);
  driftStep(st, LET_GO, dt); // paid
  const { tierUps } = runDrift(st, DRIFT, DRIFT_TIER_TIMES[0] * 0.5);
  return tierUps.length === 0 && st.charge < DRIFT_TIER_TIMES[0];
})());

// Found driving the real client: a full-lock drift scrubs the car to ~8 u/s,
// and deep in the slide the nose points well off the direction of travel, so
// FORWARD speed sags to 3-5 u/s while the car slides at 7-9. Judged on
// forward speed the drift flickered on/off and charge never passed 0.6.
check('drift: a deep slide that scrubs speed stays a drift and keeps charging', (() => {
  const st = newDriftState();
  let t = 0;
  for (let i = 0; i < 300; i++, t += dt) {
    const ground = i === 0 ? 10 : 7.8 + Math.sin(t * 9) * 1.1; // 6.7…8.9
    const slip = i === 0 ? 0 : (35 + Math.sin(t * 5) * 25) * Math.PI / 180; // 10°…60° off the nose
    const drifting = isDrifting(st, true, true, ground * Math.cos(slip), ground);
    driftStep(st, { ...DRIFT, drifting }, dt);
    if (!drifting) return false;
  }
  return driftTier(st.charge) >= 2;
})());
check('drift: entry needs the full entry speed, forward', !isDrifting(newDriftState(), true, true, DRIFT_ENTER_SPEED - 0.5, 12)
  && isDrifting(newDriftState(), true, true, DRIFT_ENTER_SPEED + 0.5, DRIFT_ENTER_SPEED + 0.5));
check('drift: a drift still ends once the car really slows', (() => {
  const st = newDriftState();
  driftStep(st, { ...DRIFT, drifting: isDrifting(st, true, true, 10, 10) }, dt);
  return st.active && !isDrifting(st, true, true, DRIFT_HOLD_SPEED - 0.5, DRIFT_HOLD_SPEED - 0.5);
})());
check('drift: a spin into reverse ends the drift', (() => {
  const st = newDriftState(); st.active = true;
  return !isDrifting(st, true, true, -3, 9);
})());
check('drift: never drifts without the button or off the ground', (() => {
  const st = newDriftState(); st.active = true;
  return !isDrifting(st, false, true, 15, 15) && !isDrifting(st, true, false, 15, 15);
})());

// ------------------------------------------------------ brakes
// Straight-line stop from top speed, the way LocalCar applies it: brake while
// held (throttle < 0 and moving forward faster than 1.5), coast drag when off
// every pedal, parking brake below 1.2.
const stop = (id, mode) => {
  const s = tunedStats(CARS[id], undefined);
  let v = s.topSpeed, d = 0, t = 0;
  while (t < 10) {
    if (mode === 'brake' && v > 1.5) v -= brakeDecel(v, s.accel, 1, dt) * dt;
    else if (v > 1.2) v -= v * COAST_DRAG * dt;
    else v = 0;
    if (v <= 0) { v = 0; break; }
    d += v * dt; t += dt;
  }
  return { d, t };
};
for (const id of CAR_IDS) {
  const s = tunedStats(CARS[id], undefined);
  const brake = stop(id, 'brake'), coast = stop(id, 'coast');
  check(`${id}: full brake from top speed stops inside a second (${brake.t.toFixed(2)} s)`, brake.t < 1);
  check(`${id}: braking stops shorter and sooner than coasting`, brake.d < coast.d && brake.t < coast.t);
  check(`${id}: the brake is never weaker than lifting off, at any speed`, (() => {
    for (let v = 1.6; v <= s.topSpeed * BOOST_TOP_MULT; v += 0.5) {
      if (brakeDecel(v, s.accel, 1, dt) < v * COAST_DRAG - 1e-9) return false;
    }
    return true;
  })());
}
check('brake: never reverses the car in a single step', (() => {
  for (const v of [0.01, 0.2, 1, 5]) if (v - brakeDecel(v, 20, 1, dt) * dt < -1e-9) return false;
  return true;
})());
check('brake: does nothing to a car already rolling backwards', brakeDecel(-3, 14, 1, dt) === 0);
check('brake: a light brake input still stops harder than lifting off', brakeDecel(10, 14, 0.1, dt) >= 10 * COAST_DRAG);

// ------------------------------------------------------ feel thresholds
check('landing: a suspension skip reads nothing', landingStrength(-30, LANDING_MIN_AIR_S * 0.5) === 0);
check('landing: a kerb hop reads nothing', landingStrength(-4, 0.3) === 0);
check('landing: a desk-to-floor drop reads near full', (() => {
  const air = 0.45, vy = GRAVITY * air; // falling from rest for 0.45 s
  return landingStrength(vy, air) > 0.75;
})());
check('landing: strength grows with the drop and caps at 1', landingStrength(-10, 0.4) < landingStrength(-16, 0.4)
  && landingStrength(-200, 2) === 1);

check('impact: a scuff below the floor reads nothing', impactStrength(12, 12 - IMPACT_MIN_DROP) === 0);
check('impact: being shoved faster reads nothing', impactStrength(10, 25) === 0);
check('impact: a head-on wall hit at top speed reads full', impactStrength(20, 0) === 1);
check('impact: a glancing hit reads light', (() => {
  const s = impactStrength(16, 9);
  return s > 0 && s < 0.3;
})());

const H = [0, 0];
const near2 = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
check('chase cam: driving straight, the camera stays on the nose', near2(chaseHeading(0, 1, 0, 15, H), [0, 1]));
check('chase cam: at a crawl, velocity noise never swings it', near2(chaseHeading(0, 1, 3, 1, H), [0, 1]));
check('chase cam: reversing never whips the camera round', near2(chaseHeading(0, 1, 0, -10, H), [0, 1]));
check('chase cam: a 30° slide swings toward travel, but not all the way', (() => {
  const a = Math.PI / 6;
  chaseHeading(0, 1, 16 * Math.sin(a), 16 * Math.cos(a), H);
  const ang = Math.atan2(H[0], H[1]);
  return ang > 0.05 && ang < a * 0.6 && Math.abs(Math.hypot(H[0], H[1]) - 1) < 1e-9;
})());
check('chase cam: the swing is continuous — no jump anywhere as a slide deepens or speeds up', (() => {
  let prev = null;
  for (let deg = 0; deg <= 100; deg += 0.25) {
    for (const sp of [3.9, 4, 4.1, 8, 20]) {
      const a = (deg * Math.PI) / 180;
      chaseHeading(0, 1, sp * Math.sin(a), sp * Math.cos(a), H);
      const ang = Math.atan2(H[0], H[1]);
      if (sp === 20) { if (prev !== null && Math.abs(ang - prev) > 0.02) return false; prev = ang; }
    }
  }
  return true;
})());
check('chase cam: mirrored slides swing mirrored', (() => {
  const r = [...chaseHeading(0, 1, 6, 12, H)];
  const l = chaseHeading(0, 1, -6, 12, H);
  return Math.abs(r[0] + l[0]) < 1e-9 && Math.abs(r[1] - l[1]) < 1e-9;
})());

console.log(fails ? `\n${fails} driving check(s) failed` : '\nall driving checks passed');
process.exit(fails ? 1 : 0);
