// Game-feel maths: how hard a landing or a wall hit should read, and where the
// chase camera should sit during a slide. Pure functions so the thresholds are
// tested (scripts/test-driving.mjs) instead of eyeballed — a landing cue that
// fires on every suspension bump, or a wall thud that fires on every drift
// catch, would be noise rather than feedback.

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

// Air time below this is the suspension skipping over a cable or a desk seam,
// not a landing.
export const LANDING_MIN_AIR_S = 0.22;

// 0…1 landing strength from the vertical speed at touchdown (units/s,
// negative = falling) and how long the car was airborne. A kerb hop reads
// nothing; a desk-to-floor drop (~0.45 s, ~20 u/s) reads about full.
export function landingStrength(vyAtTouchdown, airTime) {
  if (airTime < LANDING_MIN_AIR_S) return 0;
  return clamp01((-vyAtTouchdown - 5) / 18);
}

// Measure an impact as the horizontal speed the SOLVER took away: LocalCar
// records the speed after its own impulses (brake, grip, drag) at the end of
// a step and compares it with what the next step starts with, so only
// contacts show up. Its own forces can't trip this — the grip impulse
// catching a boosted Formula fully sideways sheds ~6 u/s in one step, which
// a before/after comparison would misread as a wall. This floor just keeps a
// wheel scuffing a skirting board out of it.
export const IMPACT_MIN_DROP = 5;

// 0…1 impact strength from horizontal speed before and after the contact
// solve. A glancing wall scrape reads light; a head-on hit at top speed reads
// full; being shoved faster reads nothing.
export function impactStrength(prevSpeed, speed) {
  const drop = prevSpeed - speed;
  if (drop <= IMPACT_MIN_DROP) return 0;
  return clamp01((drop - IMPACT_MIN_DROP) / 14);
}

// Chase-camera heading during a slide: blend the car's nose toward its
// direction of travel so a drift shows where you're GOING, not only where
// you're pointing. Writes a unit [x, z] into `out`.
// - no swing below walking pace, where velocity direction is noise
// - never swings behind the car: reversing (or a spin past ~70°) keeps the
//   camera on the nose rather than whipping round
// - at most `maxBlend` of the way to the velocity heading, so the car stays
//   in frame and the slide angle stays visible
export function chaseHeading(fwdX, fwdZ, velX, velZ, out, maxBlend = 0.45) {
  const sp = Math.hypot(velX, velZ);
  const fl = Math.hypot(fwdX, fwdZ) || 1;
  const fx = fwdX / fl, fz = fwdZ / fl;
  out[0] = fx; out[1] = fz;
  if (sp < 4) return out;
  const vx = velX / sp, vz = velZ / sp;
  const align = fx * vx + fz * vz;
  if (align < 0.35) return out;
  // fades in with speed and out toward the spin cut-off: no step anywhere,
  // so the camera never jumps as a slide crosses a threshold
  const w = maxBlend * clamp01((sp - 4) / 8) * clamp01((align - 0.35) / 0.3);
  const bx = fx + (vx - fx) * w, bz = fz + (vz - fz) * w;
  const bl = Math.hypot(bx, bz) || 1;
  out[0] = bx / bl; out[1] = bz / bl;
  return out;
}

// ---------------------------------------------------------------- antenna
// The whip antenna as a damped spring in two directions: `pitch` bends it
// fore/aft, `roll` side to side. Acceleration throws it the other way (brake
// and it whips forward, turn and it leans out), speed sweeps it back, and a
// bump or a landing sets it ringing. Lightly damped on purpose — the
// wobble after the jolt is the whole point — and clamped so no crash can
// fold it through the car.
export const ANTENNA = {
  stiffness: 170, // rad/s² per rad → ~2 Hz sway
  damping: 5.5, // ζ ≈ 0.21: rings a few times, then settles
  gain: 0.011, // rad of bend per u/s² of acceleration
  sweep: 0.012, // rad of rest lean per u/s of speed
  maxSweep: 0.32,
  max: 0.9,
};
export const newAntenna = () => ({ pitch: 0, roll: 0, vp: 0, vr: 0 });

// aLong/aLat/aUp: the car's acceleration in its own frame (u/s²; +long =
// speeding up, +lat = toward the car's right, +up = being pushed up).
// Mutates and returns the state.
export function antennaStep(st, aLong, aLat, aUp, speed, dt) {
  const A = ANTENNA;
  // rest pose: swept back by the airflow
  const restP = -Math.min(A.maxSweep, Math.abs(speed) * A.sweep);
  // inertia: the tip lags the car — speeding up bends it back, braking forward,
  // a bump drives it down (and it springs back up)
  const driveP = (-aLong - Math.abs(aUp) * 0.5) * A.gain;
  const driveR = -aLat * A.gain;
  // semi-implicit Euler, substepped so a long frame can't blow the spring up
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    st.vp += (-A.stiffness * (st.pitch - restP) - A.damping * st.vp + driveP * A.stiffness) * h;
    st.vr += (-A.stiffness * st.roll - A.damping * st.vr + driveR * A.stiffness) * h;
    st.pitch += st.vp * h;
    st.roll += st.vr * h;
  }
  if (Math.abs(st.pitch) > A.max) { st.pitch = Math.sign(st.pitch) * A.max; st.vp *= -0.3; }
  if (Math.abs(st.roll) > A.max) { st.roll = Math.sign(st.roll) * A.max; st.vr *= -0.3; }
  return st;
}
