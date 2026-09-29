// The pieces of the grounded driving model that are decisions rather than
// forces: the drift-charge state machine and the brake. LocalCar.jsx drives
// with these exact functions, so scripts/test-driving.mjs can hold them to
// their promises (tier timing, release payouts, ramp hops, stopping
// distances) without booting a browser.
import {
  DRIFT_TIER_TIMES, DRIFT_CHARGE_STEER, DRIFT_CHARGE_COAST, BRAKE_STRENGTH,
} from './constants.js';

// Off-throttle rolling resistance: velocity bled per second, as a fraction.
export const COAST_DRAG = 2.2;

export const driftTier = (charge) => (
  charge >= DRIFT_TIER_TIMES[2] ? 3 : charge >= DRIFT_TIER_TIMES[1] ? 2 : charge >= DRIFT_TIER_TIMES[0] ? 1 : 0
);

export const newDriftState = () => ({ charge: 0, active: false });

// Entering a drift takes DRIFT_ENTER_SPEED of forward speed; staying in one
// takes DRIFT_HOLD_SPEED of ground speed in ANY direction short of reversing.
// Both halves were found driving the real client: a full-lock drift scrubs
// the car down to about the entry speed, and deep in the slide the nose
// points well away from the direction of travel, so its FORWARD speed dips
// under any forward threshold while the car is still sliding at 7-9 u/s.
// Judged on forward speed alone the drift flickered off and on every few
// frames, throwing its charge away each time, and a tight drift never
// reached tier 1.
export const DRIFT_ENTER_SPEED = 8;
export const DRIFT_HOLD_SPEED = 6;

export function isDrifting(st, driftHeld, grounded, fwdSpeed, groundSpeed) {
  if (!driftHeld || !grounded) return false;
  if (!st.active) return fwdSpeed > DRIFT_ENTER_SPEED;
  return groundSpeed > DRIFT_HOLD_SPEED && fwdSpeed > -1;
}

// One physics step of drift bookkeeping. `drifting` is the grounded, at-speed,
// button-held state LocalCar computes; `driftHeld` is just the button.
//
// A drift is a session, not a single grounded run: holding drift over a ramp
// hop keeps the session (and its charge) alive in the air, Mario Kart style,
// and the payout comes when you let go back on the ground. Letting go in the
// air forfeits it. Every session ends with its charge spent — paid or not —
// so nothing leaks into the next drift.
//
// Returns { tierUp, release }: the tier just reached this step (0 if none),
// and the tier being cashed in as a mini-turbo (0 if none).
export function driftStep(st, { drifting, driftHeld, grounded, steering, overdrift }, dt) {
  let tierUp = 0, release = 0;
  if (drifting) {
    const before = driftTier(st.charge);
    st.charge += (steering ? DRIFT_CHARGE_STEER : DRIFT_CHARGE_COAST) * (overdrift ? 2 : 1) * dt;
    const after = driftTier(st.charge);
    if (after > before) tierUp = after;
    st.active = true;
  } else if (st.active && !(driftHeld && !grounded)) {
    // session over: released on the ground (or slowed out of it) pays out;
    // released in the air is forfeit
    if (grounded) release = driftTier(st.charge);
    st.charge = 0;
    st.active = false;
  }
  return { tierUp, release };
}

// Brake deceleration (units/s²) for this step. Two floors and a ceiling:
// - the brake proper, a multiple of the engine
// - never weaker than lifting off: rolling resistance is proportional to
//   speed, so at the top end it out-pulls the brake, and a brake that slows
//   you LESS than letting go of the gas feels broken for the first moment
//   you press it
// - capped at what zeroes the forward speed in one step: a brake only ever
//   stops the car, reversing is the throttle's job
export function brakeDecel(fwdSpeed, accel, brakeInput, dt) {
  if (fwdSpeed <= 0) return 0;
  return Math.min(fwdSpeed / dt, Math.max(accel * BRAKE_STRENGTH * brakeInput, COAST_DRAG * fwdSpeed));
}
