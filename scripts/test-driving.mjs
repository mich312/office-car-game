// Driving-model invariants, headless. Two halves:
//
// 1. The self-righting/recovery model — these tests import the exact
//    functions LocalCar.jsx drives with (shared/src/righting.js), so a
//    regression in the torque math or the recovery ladder fails here without
//    ever booting a browser. This is the model that fixes "the springs
//    glitch and the car stays tilted".
// 2. Roster-wide handling invariants via simulateDrive — every car reaches
//    its top speed, respects its ceiling, and can actually follow the slalom.
import {
  CARS, CAR_IDS, tunedStats, simulateDrive,
  rightingTorque, airRightingK, groundRightingK, roofKickNeeded, recoveryTick,
  RECOVERY_AFTER_S, UPRIGHT_GROUND_DOT, PHYS_TIMESTEP,
  DRIFT_TIER_TIMES, DRIFT_TIER_BOOST_S, DRIFT_TIER_COLORS,
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

console.log(fails ? `\n${fails} driving check(s) failed` : '\nall driving checks passed');
process.exit(fails ? 1 : 0);
