// ---------------------------------------------------------------------------
// Self-righting math — the pure half of the car's recovery model.
//
// LocalCar.jsx drives with these functions every physics step; the headless
// suite (scripts/test-driving.mjs) asserts their invariants directly. Keeping
// them here means the tests exercise the code the car actually runs, not a
// copy that can drift out of sync.
// ---------------------------------------------------------------------------
import { UPRIGHT_ASSIST, UPRIGHT_GROUND_MULT } from './constants.js';

// Recovery ladder timing: a deeply inverted car auto-respawns after this many
// accumulated seconds; a moderate wedge accrues at half rate (≈2× as long).
export const RECOVERY_AFTER_S = 1.2;

// Torque = K · (up × n̂): zero when the wheels point at the surface, strongest
// at 90° out of shape, and always about the axis that rolls the shorter way
// back. `up` and `n` must be unit vectors ({x,y,z}); writes into `out`.
export function rightingTorque(up, n, K, out) {
  out.x = (up.y * n.z - up.z * n.y) * K;
  out.y = (up.z * n.x - up.x * n.z) * K;
  out.z = (up.x * n.y - up.y * n.x) * K;
  return out;
}

// Gains for the two regimes. Grounded righting argues with gravity, so it
// runs hotter; both scale with the car's mass multiplier so torque tracks
// inertia and every car rights at the same rate.
export const airRightingK = (massMul) => UPRIGHT_ASSIST * massMul;
export const groundRightingK = (massMul) => UPRIGHT_ASSIST * UPRIGHT_GROUND_MULT * massMul;

// Dead flat on the roof, up × world-up ≈ 0 and the leveller stalls at the
// unstable equilibrium — this is the "kick a roll about the nose" gate.
export function roofKickNeeded(up) {
  return up.y < -0.5 && Math.hypot(up.x, up.z) < 0.3;
}

// The recovery ladder. Deeply inverted counts fast — including while sliding
// on the roof at speed. A moderate wedge (tilted past ~44°, basically parked)
// counts at half rate as the backstop for poses torque can't win. Anything
// upright (or a fast two-wheel moment) resets the clock.
export function recoveryTick(acc, upDot, speed, dt) {
  const deepTilt = upDot < 0.35 && (speed < 6 || upDot < -0.4);
  const wedgedTilt = upDot < 0.72 && speed < 3;
  return deepTilt ? acc + dt : wedgedTilt ? acc + dt * 0.5 : 0;
}
