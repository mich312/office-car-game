// The driving test: five things every new driver needs before their first
// race, taught by doing, in the lobby (where you can already drive while
// everyone readies up). Pure — the lesson machine and the hint rules run in
// Node (scripts/test-tutorial.mjs); ui/Coach.jsx only draws them.
//
// Each lesson says what to press on each device and when it's been done,
// judged from the car's telemetry — not from a keypress, so a lesson can't
// be passed by mashing the right key while parked in a corner.

// Prompts per input device. `keys` are keycaps; `touch` names the on-screen
// button's icon, so the prompt shows the very button to press. Every {token}
// in a touch prompt is a glyph Coach.jsx draws (its ICONS set, all Toy icons:
// scripts/test-tutorial.mjs holds the three lists together).
export const LESSONS = [
  {
    id: 'drive',
    title: 'Hit the gas',
    say: { keys: 'Hold {W} to drive', pad: 'Squeeze {RT} to drive', touch: 'Auto-gas has you rolling — the car drives itself' },
  },
  {
    id: 'steer',
    title: 'Take a corner',
    say: { keys: '{A} and {D} steer', pad: 'Steer with the left stick', touch: 'Drag the {steer} stick to steer' },
  },
  {
    id: 'brake',
    title: 'Brake',
    say: { keys: 'Tap {S} at speed', pad: 'Squeeze {LT} at speed', touch: 'Hit BRAKE at speed' },
  },
  {
    id: 'drift',
    title: 'Drift for a turbo',
    say: {
      keys: 'Hold {Shift} through a turn — sparks go blue, orange, pink — let go for a boost',
      pad: 'Hold {X} through a turn — sparks go blue, orange, pink — let go for a boost',
      touch: 'Hold {drift} through a turn — sparks go blue, orange, pink — let go for a boost',
    },
  },
  {
    id: 'boost',
    title: 'Boost',
    say: { keys: 'Hold {Space} to burn the boost meter', pad: 'Hold {A} to burn the boost meter', touch: 'Hold {flame} to burn the boost meter' },
  },
];

// How much of each thing counts as "done".
export const PASS = {
  driveSpeed: 8, // units/s — properly moving, not creeping
  steerRadians: Math.PI, // half a turn of heading, in either direction
  brakeSeconds: 0.25, // braking at speed, held this long
  brakeMinSpeed: 6,
  boostSeconds: 0.5, // on the meter, not a mini-turbo
};

export const newTest = () => ({ step: 0, done: false, acc: { turned: 0, lastHeading: null, braking: 0, boosting: 0, turbos: null } });

const wrap = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

// One telemetry sample → progress. t: { speed, heading, throttle, boostHeld,
// miniTurbos, grounded }. Mutates and returns the test state; `passed` is
// the lesson just completed this sample (or null).
export function stepTest(test, t, dt) {
  if (test.done) return { test, passed: null };
  const lesson = LESSONS[test.step];
  const a = test.acc;
  let ok = false;
  switch (lesson.id) {
    case 'drive':
      ok = t.speed >= PASS.driveSpeed;
      break;
    case 'steer':
      // Heading swept while actually moving. Respawns and spins in place
      // don't count; the jump guard ignores a teleport's heading snap.
      if (a.lastHeading !== null && t.speed > 3) {
        const d = wrap(t.heading - a.lastHeading);
        if (Math.abs(d) < 1) a.turned += Math.abs(d);
      }
      a.lastHeading = t.heading;
      ok = a.turned >= PASS.steerRadians;
      break;
    case 'brake':
      a.braking = t.throttle < 0 && t.speed > PASS.brakeMinSpeed ? a.braking + dt : 0;
      ok = a.braking >= PASS.brakeSeconds;
      break;
    case 'drift':
      // a mini-turbo cashed in since this lesson began
      if (a.turbos === null) a.turbos = t.miniTurbos;
      ok = t.miniTurbos > a.turbos;
      break;
    case 'boost':
      a.boosting = t.boostHeld ? a.boosting + dt : 0;
      ok = a.boosting >= PASS.boostSeconds;
      break;
    default:
      break;
  }
  if (!ok) return { test, passed: null };
  test.step++;
  if (test.step >= LESSONS.length) test.done = true;
  return { test, passed: lesson.id };
}

// Split a prompt into text and key/icon tokens for rendering: '{W}' → key.
export function tokens(text) {
  return text.split(/(\{[^}]+\})/).filter(Boolean).map((p) => (p.startsWith('{') ? { key: p.slice(1, -1) } : { text: p }));
}

// ---------------------------------------------------------------- hints
// One-time tips during your first matches. Each fires once ever (the seen
// set is saved), only while a match is on, and never on top of another.
export const HINTS = {
  item: { keys: 'Press {E} to fire your {item}', pad: 'Press {Y} to fire your {item}', touch: 'Tap {gift} to fire your {item}' },
  stuck: { keys: 'Stuck? {R} puts you back on the road', pad: 'Stuck? {Start} puts you back on the road', touch: 'Stuck? Hold BRAKE to back out' },
  ability: {
    keys: 'Your car has a special: press {Q} for {ability} — {abilityDesc}',
    pad: 'Your car has a special: press {RB} for {ability} — {abilityDesc}',
    touch: 'Your car has a special: tap {star} for {ability} — {abilityDesc}',
  },
};
// the names Coach.jsx fills into a hint ({item} → "Rocket"); every other
// {token} in a prompt is a keycap or, in a touch prompt, a button glyph
export const HINT_FILL = ['item', 'ability', 'abilityDesc'];
export const STUCK_AFTER_S = 3; // on the gas, going nowhere, this long
export const ABILITY_HINT_AFTER_S = 25; // into your first match, if you haven't used it

// ctx: { phase, seen: Set, showing, holdingItem, stuckFor, matchTime, usedAbility }
// → the hint id to show now, or null.
export function nextHint(ctx) {
  if (ctx.phase !== 'playing' || ctx.showing) return null;
  if (ctx.holdingItem && !ctx.seen.has('item')) return 'item';
  if (ctx.stuckFor >= STUCK_AFTER_S && !ctx.seen.has('stuck')) return 'stuck';
  if (ctx.matchTime >= ABILITY_HINT_AFTER_S && !ctx.usedAbility && !ctx.seen.has('ability')) return 'ability';
  return null;
}
