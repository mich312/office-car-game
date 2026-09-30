// Game-feel maths: how hard a landing or a wall hit should read, and where the
// chase camera sits (and swings during a slide). Pure functions so the thresholds are
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

// ---------------------------------------------------------------- chase rig
// Where the chase lens sits, as numbers the tests hold to: the framing checks
// in scripts/test-driving.mjs project the car through them. Car units,
// relative to the car's centre; LocalCar.jsx adds the smoothing, the walls
// and the shake.
//
// Close and a little long. The old rig sat 4 u back behind a position lerp
// that trailed the car by v·τ, so the faster you went the smaller the car
// got: 9% of the frame's width parked, 4% at top speed, 3% boosting — the
// roll, the steering and the slide were a few pixels. Here the car fills a
// fifth of the width at every speed, and 54° compresses the room behind it
// the way a macro shot of a real 1:10 car does.
//
// Speed still widens the lens (that IS the sense of speed), but the lens
// moves in to pay for it: `dolly` of the widening comes back as distance
// (`lift` as height), so the car keeps its size while the room streams past
// the edges.
export const CHASE = {
  fov: 54, // degrees, vertical, parked
  fovSpeed: 9, // + at top speed
  fovBoost: 6, // + while any boost burns
  dist: 2.3, // lens behind the car's centre, parked
  height: 1.02, // lens above the car's centre, parked
  dolly: 0.75, // share of a FOV change the distance compensates
  lift: 0.6, // …and the height
  distSpeed: 0.05, // a touch further back at top speed
  heightSpeed: 0.03,
  lookAhead: 2.2, // aim point ahead of the car
  lookVel: 0.03, // …plus this many seconds of travel
  lookUp: 0, // aim point height over the car's centre
  noseAim: 0.3, // how much the aim follows the nose rather than the lens
  swing: 0.5, // chaseHeading maxBlend at the call site (the default stays 0.45)
  yawTau: 0.09, // s: the lens swings round after the car, never with it
  yTau: 0.08, // s: height follow on the ground (eats suspension chatter)
  yTauAir: 0.3, // s: …and in the air, so a jump visibly rises in frame
  // launch/brake surge: the car pulls away under power and the lens catches
  // up under braking — acceleration, never speed, so nothing lags at cruise
  surgeGain: 0.02, surgeMin: -0.25, surgeMax: 0.25, surgeTau: 0.15,
  dip: 0.35, // landing dip (u at full landing strength)
};

const tanHalf = (deg) => Math.tan((deg * Math.PI) / 360);

// Target field of view (degrees) at a share of top speed (0…1). `motion`
// scales the kick for players who asked for less motion.
export function chaseFov(speedFrac, boosting, motion = 1) {
  const sf = clamp01(speedFrac);
  return CHASE.fov + (CHASE.fovSpeed * sf + (boosting ? CHASE.fovBoost : 0)) * motion;
}

// The rig for the lens's CURRENT field of view (LocalCar eases the FOV, and
// the distance has to follow the eased value or the car breathes in size):
// { fov, dist, height, lookAhead, lookUp } — lookAhead before the velocity
// term, which is the caller's (it needs the velocity).
export function chaseRig(speedFrac, fovDeg, out = {}) {
  const sf = clamp01(speedFrac);
  const k = tanHalf(CHASE.fov) / tanHalf(fovDeg);
  out.fov = fovDeg;
  out.dist = CHASE.dist * (1 - CHASE.dolly + CHASE.dolly * k) + CHASE.distSpeed * sf;
  out.height = CHASE.height * (1 - CHASE.lift + CHASE.lift * k) + CHASE.heightSpeed * sf;
  out.lookAhead = CHASE.lookAhead;
  out.lookUp = CHASE.lookUp;
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
