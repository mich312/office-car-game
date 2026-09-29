// Mode scoring, driven directly against a stub room. The ws smoke test proves
// each mode *starts* and snapshots correctly; this proves a mode taken all the
// way to its win condition pays out what it says it does.
import {
  CHECKPOINTS, MODES, KOTH_SPOTS, SUMO_ZONE, SPAWNS, MODE_VARIANTS,
  raceCheckpoints, raceBotPath, raceSpawn, rollVariant, variantOf, sumoCenter, kothHopSeconds, BOT_PATH, MAPS,
} from '../shared/src/index.js';
import { createMode } from '../server/src/modes.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };

function player(id, name) {
  return {
    id, name, bot: false, p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1],
    score: 0, lap: 0, nextCp: 0, finished: false, finishBonus: 0,
    beans: 0, hasBattery: false, stunUntil: 0, sumoDead: false, eliminated: false,
  };
}

function stubRoom(players) {
  return {
    players: new Map(players.map((p) => [p.id, p])),
    map: MAPS.office,
    modeId: 'desk_dash',
    endsAt: Date.now() + 1e6,
    feed() {}, broadcast() {}, scoreChanged() {},
    nearest() { return null; },
  };
}

// Park a car on its next checkpoint and let the mode notice.
function driveCheckpoints(mode, p, n) {
  for (let i = 0; i < n; i++) {
    const cp = CHECKPOINTS[p.nextCp % CHECKPOINTS.length];
    p.p = [cp.x, 0, cp.z];
    mode.update();
  }
}

// ------------------------------------------------------------- Desk Dash
const LAPS = MODES.desk_dash.laps;
const N = CHECKPOINTS.length;

{
  const a = player('p1', 'Alice');
  const mode = createMode('desk_dash', stubRoom([a]));
  driveCheckpoints(mode, a, 5);
  check('race: mid-lap score is pure checkpoint progress', a.score === 5 * 8);
  check('race: no lap banked yet', a.lap === 0 && !a.finished);
}

{
  const a = player('p1', 'Alice');
  const mode = createMode('desk_dash', stubRoom([a]));
  driveCheckpoints(mode, a, N);
  check('race: completing a lap scores the lap, not the checkpoints twice', a.score === 200 && a.lap === 1);
}

{
  // The regression this guards: the progress score is recomputed from
  // lap+checkpoint every tick, so folding the finish bonus back into it made
  // the final lap count its own progress a second time (900 → 1236).
  const a = player('p1', 'Alice');
  const mode = createMode('desk_dash', stubRoom([a]));
  driveCheckpoints(mode, a, N * LAPS);
  check('race: finisher is marked finished', a.finished && a.lap === LAPS);
  check(`race: winner scores laps + place bonus exactly (${LAPS * 200 + 500})`,
    a.score === LAPS * 200 + 500);
}

{
  const a = player('p1', 'Alice'), b = player('p2', 'Bob');
  const room = stubRoom([a, b]);
  const mode = createMode('desk_dash', room);
  driveCheckpoints(mode, a, N * LAPS);
  driveCheckpoints(mode, b, N * LAPS);
  check('race: second place gets the second bonus', b.score === LAPS * 200 + 350);
  check('race: finishing order is reflected in the scores', a.score > b.score);
  check('race: a finished car stops accruing', (() => {
    const before = a.score;
    driveCheckpoints(mode, a, 4);
    return a.score === before;
  })());
}

// ----------------------------------------------------------- Coffee Run
{
  const a = player('p1', 'Alice');
  const room = stubRoom([a]);
  room.modeId = 'coffee_run';
  const mode = createMode('coffee_run', room);
  a.beans = 4;
  mode.onHit(player('p2', 'Bob'), a);
  check('coffee: a hit spills about half the load, never all of it', a.beans > 0 && a.beans < 4);
  const carried = a.beans;
  a.p = [0, -20, 0];
  mode.onFall(a);
  check('coffee: a fall spills everything', a.beans === 0 && carried > 0);
}

{
  const a = player('p1', 'Alice');
  const room = stubRoom([a]);
  room.modeId = 'coffee_run';
  const mode = createMode('coffee_run', room);
  const base = mode.beans.length;
  a.beans = 5;
  a.p = [0, -20, 0];
  mode.onFall(a); // spill everything → 5 dropped beans, each with an expiry
  a.p = [500, 0, 500]; // park far away so nothing gets re-collected
  const spilled = mode.beans.filter((b) => b.id >= 1000);
  check('coffee: spilled beans carry an expiry', spilled.length === 5 && spilled.every((b) => b.expiresAt > Date.now()));
  mode.update();
  check('coffee: spills survive until the expiry', mode.beans.filter((b) => b.id >= 1000).length === 5);
  for (const b of spilled) b.expiresAt = Date.now() - 1;
  mode.update();
  check('coffee: expired spills are swept up', mode.beans.every((b) => b.id < 1000));
  check('coffee: base beans survive the sweep', mode.beans.length === base);
}

// --------------------------------------------------------------- Sumo
{
  const a = player('p1', 'Alice'), b = player('p2', 'Bob'), c = player('p3', 'Cass');
  const room = stubRoom([a, b, c]);
  room.modeId = 'sumo';
  const mode = createMode('sumo', room);
  mode.update(); // starts round 1
  mode.eliminate(a, 'test');
  mode.eliminate(b, 'test');
  check('sumo: first out scores nothing for placement', a.score === 0);
  check('sumo: outlasting one car pays one place', b.score === MODES.sumo.placeScore);
  check('sumo: last car rolling banks places + win bonus',
    c.score === MODES.sumo.placeScore * 2 + MODES.sumo.winBonus);
}

// ----------------------------------------------------------- variants
check('variants: every variant list starts with the classic layout', Object.values(MODE_VARIANTS).every((l) => l[0].id === 'classic'));
check('variants: modes without variants always roll classic', rollVariant('coffee_run', () => 0) === 'classic');
check('variants: a variant mode rolls classic about half the time', (() => {
  let n = 0;
  for (let i = 0; i < 1000; i++) if (rollVariant('desk_dash', Math.random) !== 'classic') n++;
  return n > 400 && n < 600;
})());
check('variants: an unknown id falls back to classic', variantOf('sumo', 'nope').id === 'classic');

const rev = raceCheckpoints('reverse', MAPS.office);
check('reverse: the same checkpoints, the other way round', rev.length === CHECKPOINTS.length
  && rev.every((c, i) => c === CHECKPOINTS[CHECKPOINTS.length - 1 - i]));
check('reverse: the finish stays on the start straight (checkpoint 0 closes the lap)', rev[rev.length - 1] === CHECKPOINTS[0]);
check('reverse: the bots\' line is the classic loop reversed', (() => {
  const r = raceBotPath('reverse', MAPS.office);
  return r.length === BOT_PATH.length && r[0] === BOT_PATH[0] && r[1] === BOT_PATH[BOT_PATH.length - 1] && r[r.length - 1] === BOT_PATH[1];
})());
// The grid lines up in parallel like a real one, beside checkpoint 0 rather
// than behind it, so the classic grid's worst slot is ~73° off its first
// checkpoint. The reverse grid must face ITS first checkpoint (north, 17)
// at least as well — pointing it east like the classic grid would send
// every car the wrong way off the line.
const worstOff = (variant) => {
  const first = raceCheckpoints(variant, MAPS.office)[0];
  return Math.max(...SPAWNS.map((_, i) => {
    const s = raceSpawn(i, variant, MAPS.office);
    let d = Math.atan2(first.x - s.x, first.z - s.z) - s.rotY;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  }));
};
const deg = (r) => (r * 180 / Math.PI).toFixed(0);
check(`reverse: the grid faces its first checkpoint at least as well as classic does (${deg(worstOff('reverse'))}° vs ${deg(worstOff('classic'))}°)`,
  worstOff('reverse') <= worstOff('classic'));
check('reverse: the classic grid heading would point the reverse race the wrong way', (() => {
  const first = raceCheckpoints('reverse', MAPS.office)[0];
  const s = SPAWNS[0];
  let d = Math.atan2(first.x - s.x, first.z - s.z) - s.rotY;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) > worstOff('reverse');
})());
{
  // a full reverse lap scores exactly like a forward one; forward order does nothing
  const a = player('p1', 'Alice'), b = player('p2', 'Bob');
  const room = stubRoom([a, b]);
  room.variant = 'reverse';
  const mode = createMode('desk_dash', room);
  for (let i = 0; i < N; i++) { const cp = rev[a.nextCp % N]; a.p = [cp.x, 0, cp.z]; mode.update(); }
  check('reverse: a lap driven backwards counts as a lap', a.lap === 1 && a.score === 200);
  b.p = [CHECKPOINTS[1].x, 0, CHECKPOINTS[1].z]; mode.update();
  check('reverse: driving the classic way round does not progress', b.nextCp === 0);
  check('reverse: the race progress points into the reversed list', mode.snapshot().race.p1[1] === 0);
}
{
  // Moving Meeting: the ring lands on a standup spot as the round runs out
  const a = player('p1', 'Alice'), b = player('p2', 'Bob');
  const room = stubRoom([a, b]);
  room.modeId = 'sumo';
  room.variant = 'drift';
  const mode = createMode('sumo', room);
  mode.update(); // round 1
  const target = mode.target;
  check('moving meeting: each round picks a standup spot to close in on', KOTH_SPOTS.includes(target));
  check('moving meeting: the ring starts where it always does', mode.zone.x === SUMO_ZONE.x && mode.zone.z === SUMO_ZONE.z);
  a.p = [target.x, 0, target.z]; b.p = [target.x, 0, target.z];
  mode.roundEndsAt = Date.now() + 5; // the last moment of the round
  mode.update();
  check('moving meeting: …and ends the round on it', Math.hypot(mode.zone.x - target.x, mode.zone.z - target.z) < 0.5);
  check('moving meeting: the slide is continuous (eases in from the start centre)', (() => {
    let prev = sumoCenter(SUMO_ZONE, target, 0);
    for (let f = 0.01; f <= 1; f += 0.01) {
      const c = sumoCenter(SUMO_ZONE, target, f);
      if (Math.hypot(c.x - prev.x, c.z - prev.z) > 5) return false;
      prev = c;
    }
    return true;
  })());
  const classicRoom = stubRoom([player('p1', 'A'), player('p2', 'B')]);
  classicRoom.modeId = 'sumo';
  const classic = createMode('sumo', classicRoom);
  classic.update();
  check('classic sumo: the ring never moves', classic.target === null && classic.zone.x === SUMO_ZONE.x);
}
check('rush hour: the meeting moves twice as often', kothHopSeconds(MODES.koth.hopSeconds, 'rush') === MODES.koth.hopSeconds / 2
  && kothHopSeconds(MODES.koth.hopSeconds, 'classic') === MODES.koth.hopSeconds);

console.log(fails ? `\n${fails} mode check(s) failed` : '\nall mode checks passed');
process.exit(fails ? 1 : 0);
