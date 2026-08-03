// Mode scoring, driven directly against a stub room. The ws smoke test proves
// each mode *starts* and snapshots correctly; this proves a mode taken all the
// way to its win condition pays out what it says it does.
import { CHECKPOINTS, MODES } from '../shared/src/index.js';
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

console.log(fails ? `\n${fails} mode check(s) failed` : '\nall mode checks passed');
process.exit(fails ? 1 : 0);
