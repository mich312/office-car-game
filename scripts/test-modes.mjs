// Mode scoring, driven directly against a stub room. The ws smoke test proves
// each mode *starts* and snapshots correctly; this proves a mode taken all the
// way to its win condition pays out what it says it does.
import {
  CHECKPOINTS, MODES, KOTH_SPOTS, SUMO_ZONE, SPAWNS, MODE_VARIANTS, BEAN_SPAWNS, PICKUP_RADIUS, MAP_IDS,
  clearDropSpot, groundAt, wallBetween, M, MUTATORS, soccerGoalHeight,
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

{
  // Every place pays a different bonus: with 6th onward all on +100, a
  // 12-car race tied them and the podium ordered them by join order.
  const cars = Array.from({ length: 12 }, (_, i) => player(`p${i + 1}`, `P${i + 1}`));
  const mode = createMode('desk_dash', stubRoom(cars));
  // finish in reverse join order, so a stable sort by join order is wrong
  for (const c of [...cars].reverse()) driveCheckpoints(mode, c, N * LAPS);
  const byScore = [...cars].sort((x, y) => y.score - x.score).map((c) => c.id);
  check('race: twelve finishers get twelve different scores', new Set(cars.map((c) => c.score)).size === 12);
  check('race: score order is finishing order all the way down', byScore.join() === mode.finished.join());
  check('race: the last finisher still outscores a car a checkpoint short of the line',
    Math.min(...cars.map((c) => c.score)) > (LAPS - 1) * 200 + (N - 1) * 8);
}

{
  // A finished car is out of the running: no rocket lock on it
  const a = player('p1', 'Alice'), b = player('p2', 'Bob'), c = player('p3', 'Cat');
  const mode = createMode('desk_dash', stubRoom([a, b, c]));
  driveCheckpoints(mode, a, N * LAPS);
  driveCheckpoints(mode, b, 3);
  driveCheckpoints(mode, c, 1);
  check('race: a rocket from the back locks on the car ahead that is still racing', mode.rocketTarget(c) === b);
  check('race: the leader of the cars still racing has nobody ahead to lock on', mode.rocketTarget(b) === null);
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
  a.poseRing = [[BEAN_SPAWNS[6].x, BEAN_SPAWNS[6].z]]; // last floor it drove on
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

// Spills land beyond the victim's reach, never in or through a wall, and
// the victim can't scoop its own spill straight back up.
for (const mapId of MAP_IDS) {
  const map = MAPS[mapId];
  const a = player('p1', 'Alice');
  const room = stubRoom([a]);
  room.map = map;
  const mode = createMode('coffee_run', room);
  let total = 0, inReach = 0, bad = 0, spots = 0;
  for (const r of map.ROOMS) {
    for (let k = 0; k < 12; k++) {
      const x = r.x + ((k % 4) / 3 - 0.5) * r.w * 0.85, z = r.z + (Math.floor(k / 4) / 2 - 0.5) * r.d * 0.85;
      if (!clearDropSpot(map, x, z, x, z)) continue;
      spots++;
      a.p = [x, 0.24, z]; a.beans = 5;
      const before = mode.beans.length;
      mode.spill(a, 'test');
      for (const b of mode.beans.slice(before)) {
        total++;
        if (Math.hypot(b.x - x, b.z - z) < PICKUP_RADIUS) inReach++;
        else if (!clearDropSpot(map, x, z, b.x, b.z, { pad: 0 })) bad++;
      }
      mode.beans.length = before;
    }
  }
  check(`${mapId} coffee: spills land beyond the victim's reach (${inReach}/${total} in reach)`, inReach / total < 0.1);
  check(`${mapId} coffee: no spilled bean lands in or through a wall (${bad}/${total})`, bad === 0 && spots > 20);
  // the victim sits on its own spill: nothing comes back for a second
  a.p = [map.BEAN_SPAWNS[0].x, 0.24, map.BEAN_SPAWNS[0].z]; a.beans = 5;
  mode.spill(a, 'test');
  const left = a.beans;
  for (const b of mode.beans.filter((q) => q.id >= 1000)) { b.x = a.p[0]; b.z = a.p[2]; }
  mode.beans = mode.beans.filter((q) => q.id >= 1000);
  mode.update();
  check(`${mapId} coffee: the victim can't scoop its own spill back up`, a.beans === left);
  for (const b of mode.beans) b.noPickup.until = Date.now() - 1;
  mode.update();
  check(`${mapId} coffee: …for long`, a.beans > left);
}

{
  // a fall off the balcony rings the beans round the last floor driven on;
  // with no such floor they're gone rather than floating past the railing
  const a = player('p1', 'Alice');
  const room = stubRoom([a]);
  const mode = createMode('coffee_run', room);
  const base = mode.beans.length;
  a.beans = 5; a.p = [-21.5 * M, -12, 5 * M]; a.poseRing = [];
  mode.onFall(a);
  check('coffee: a fall with no floor on record spills nowhere', a.beans === 0 && mode.beans.length === base);
  a.beans = 5; a.poseRing = [[-20.6 * M, 5 * M]];
  mode.onFall(a);
  const fallen = mode.beans.filter((b) => b.id >= 1000);
  check('coffee: a fall spill lands on the floor, inside the building', fallen.length === 5
    && fallen.every((b) => b.y === 0 && room.map.roomAt(b.x, b.z) && b.x > room.map.MAP_BOUNDS.minX));
}

// Beans are delivered in sight of the machine: on the cellar the zone's
// circle reached through the boiler-room wall into the corridor.
for (const mapId of MAP_IDS) {
  const map = MAPS[mapId];
  const cm = map.COFFEE_MACHINE;
  const a = player('p1', 'Alice');
  const room = stubRoom([a]);
  room.map = map;
  const mode = createMode('coffee_run', room);
  mode.beans = [];
  let through = 0, inSight = 0;
  for (let i = 0; i < 400; i++) {
    const ang = i * 2.399, rr = cm.radius * 2 * Math.sqrt((i % 20 + 0.5) / 20);
    const x = cm.deliverX + Math.cos(ang) * rr, z = cm.deliverZ + Math.sin(ang) * rr;
    a.p = [x, 0.24, z]; a.beans = 2; a.score = 0;
    mode.update();
    if (wallBetween(map, cm.deliverX, cm.deliverZ, x, z)) { if (a.beans === 0) through++; } else if (a.beans === 0) inSight++;
  }
  check(`${mapId} coffee: no delivery through a wall (${through}), deliveries in sight of the machine (${inSight})`, through === 0 && inSight > 0);
}
{
  // the cellar's ring is inside the boiler room, clear of the race grid
  const map = MAPS.cellar, cm = map.COFFEE_MACHINE;
  const boiler = map.ROOMS.find((r) => r.id === 'boiler');
  check('cellar coffee: the delivery ring stays in the boiler room', cm.deliverZ - cm.radius * 2 > boiler.z - boiler.d / 2);
}

// Capture the Battery: a hit knocks it clear and the victim can't grab it back.
for (const mapId of MAP_IDS) {
  const map = MAPS[mapId];
  const v = player('p1', 'Vic'), r = player('p2', 'Ram');
  const room = stubRoom([v, r]); // Vic joined first: first in Map order
  room.map = map;
  const mode = createMode('battery', room);
  const s = map.BATTERY_SPAWN;
  v.p = [s.x - 0.9, 0.24, s.z]; r.p = [s.x, 0.24, s.z];
  mode.update(0.05);
  check(`${mapId} battery: the nearest car grabs it, not the first to join`, mode.battery.carrier === 'p2');
  mode.battery.carrier = 'p1'; r.hasBattery = false; v.hasBattery = true;
  v.p = [s.x, 0.24, s.z]; r.p = [s.x - 0.9, 0.24, s.z];
  mode.battery.grabbedAt = Date.now();
  mode.onHit(r, v);
  check(`${mapId} battery: a fresh grab holds for a moment`, mode.battery.carrier === 'p1');
  mode.battery.grabbedAt = Date.now() - 5000;
  mode.onHit(r, v);
  check(`${mapId} battery: a hit knocks it clear of the victim`, mode.battery.carrier === null
    && Math.hypot(mode.battery.x - v.p[0], mode.battery.z - v.p[2]) > PICKUP_RADIUS
    && clearDropSpot(map, v.p[0], v.p[2], mode.battery.x, mode.battery.z, { pad: 0 }));
  v.p = [mode.battery.x, 0.24, mode.battery.z]; r.p = [s.x - 20, 0.24, s.z];
  mode.update(0.05);
  check(`${mapId} battery: the victim can't grab it straight back`, mode.battery.carrier === null);
  mode.battery.noPickup.until = Date.now() - 1;
  mode.update(0.05);
  check(`${mapId} battery: …for long`, mode.battery.carrier === 'p1');
}
{
  // dropped on the cellar's loading dock, it sits on the dock, not inside it
  const map = MAPS.cellar;
  const dock = map.FURNITURE.find((f) => f.type === 'dock');
  const v = player('p1', 'Vic');
  const room = stubRoom([v]);
  room.map = map;
  const mode = createMode('battery', room);
  v.p = [dock.x, dock.h + 0.24, dock.z];
  mode.battery.carrier = 'p1'; v.hasBattery = true;
  mode.onHit(null, v);
  const onDock = Math.abs(mode.battery.x - dock.x) < dock.w / 2 && Math.abs(mode.battery.z - dock.z) < dock.d / 2;
  check('battery: a drop on the loading dock lands on top of it', onDock && Math.abs(mode.battery.y - dock.h) < 0.01);
  check('battery: the dock top is a surface groundAt knows', Math.abs(groundAt(map, dock.x, dock.z, dock.h + 1) - dock.h) < 1e-9
    && groundAt(map, dock.x, dock.z, 0.5) === 0);
}

// ------------------------------------------------------------ RC Soccer
// A stub room with nobody near the ball: the ball alone against the map.
function soccerRoom(mapId, mutator = null) {
  const a = player('p1', 'Alice');
  a.p = [1e4, 0, 1e4]; // far off, never touches the ball
  const room = stubRoom([a]);
  room.map = MAPS[mapId];
  room.mutator = mutator;
  const mode = createMode('soccer', room);
  return { room, mode };
}
const SOCCER_SPAWN = () => MAPS.office.SOCCER.ballSpawn;
const runBall = (mode, secs, each) => { for (let i = 0; i < secs * 20; i++) { mode.update(0.05); each?.(); } };
for (const mapId of MAP_IDS) {
  const map = MAPS[mapId];
  for (const mut of [null, MUTATORS.giant_ball]) {
    for (const g of map.SOCCER.goals) {
      const { mode } = soccerRoom(mapId, mut);
      const R = mode.R;
      mode.ball = { p: [g.x + g.dir * 4, R, g.z], v: [-g.dir * 20, 0, 0] };
      runBall(mode, 1);
      check(`${mapId} soccer: a ${mut ? 'giant ' : ''}ball rolled through the ${g.name} scores`, mode.teamScores[1 - g.team] === 1);
    }
  }
  for (const g of map.SOCCER.goals) {
    // lofted under the crossbar, then drifting out of the mouth band
    const { mode } = soccerRoom(mapId);
    const R = mode.R;
    mode.ball = { p: [g.x + g.dir * 0.5, R + 2.0, g.z + g.width * 0.1], v: [-g.dir * 50, 0, 12] };
    mode.update(0.05);
    check(`${mapId} soccer: a lofted shot over the line under the bar counts (${g.name})`, mode.teamScores[1 - g.team] === 1);
    const hi = soccerRoom(mapId).mode;
    hi.ball = { p: [g.x + g.dir * 1.5, R + soccerGoalHeight(R) + 1, g.z], v: [-g.dir * 30, 0, 0] };
    hi.update(0.05);
    check(`${mapId} soccer: over the bar is no goal (${g.name})`, hi.teamScores[1 - g.team] === 0);
    const back = soccerRoom(mapId).mode;
    back.ball = { p: [g.x - g.dir * (R + 3), R, g.z], v: [g.dir * 20, 0, 0] };
    runBall(back, 0.3);
    check(`${mapId} soccer: rolling out of a goal from behind is no goal (${g.name})`, back.teamScores[0] + back.teamScores[1] === 0);
  }
  {
    // out of play: off the pitch (not through a goal) for a moment → dropped
    // back on the spot, with a word in the feed; on the pitch it plays on
    const { room, mode } = soccerRoom(mapId);
    const A = map.SOCCER.arena, R = mode.R;
    const feed = [];
    room.feed = (t) => feed.push(t);
    const outside = [
      { x: (A.minX + A.maxX) / 2, z: A.minZ - R - 3 }, { x: (A.minX + A.maxX) / 2, z: A.maxZ + R + 3 },
    ].find((pt) => map.roomAt(pt.x, pt.z)) || { x: A.minX - 6, z: A.minZ + 1 };
    mode.ball = { p: [outside.x, R, outside.z], v: [0, 0, 0] };
    runBall(mode, 1);
    check(`${mapId} soccer: a ball off the pitch plays on for a moment`, Math.hypot(mode.ball.p[0] - outside.x, mode.ball.p[2] - outside.z) < 3);
    runBall(mode, 1);
    const s = map.SOCCER.ballSpawn;
    check(`${mapId} soccer: …then is dropped back on the spot, announced`, Math.hypot(mode.ball.p[0] - s.x, mode.ball.p[2] - s.z) < 0.01 && feed.some((t) => /Out of play/.test(t)));
    const on = soccerRoom(mapId).mode;
    on.ball = { p: [(A.minX + A.maxX) / 2 + 3, on.R, (A.minZ + A.maxZ) / 2], v: [0, 0, 0] };
    runBall(on, 3);
    check(`${mapId} soccer: a ball on the pitch is never reset`, on.outT === 0 && Math.abs(on.ball.p[0] - ((A.minX + A.maxX) / 2 + 3)) < 0.5);
  }
}
{
  // Moon Gravity floats the ball like it floats the cars
  const fall = (mut) => {
    const { mode } = soccerRoom('office', mut);
    mode.ball = { p: [SOCCER_SPAWN().x, 10, SOCCER_SPAWN().z], v: [0, 0, 0] };
    let n = 0;
    while (mode.ball.p[1] > mode.R + 0.01 && n < 200) { mode.update(0.05); n++; }
    return n;
  };
  check(`soccer: moon gravity slows the ball's fall (${fall(MUTATORS.moon_gravity)} vs ${fall(null)} ticks)`, fall(MUTATORS.moon_gravity) > fall(null) * 1.3);
}
{
  // the ball rides up ramps and is pushed out of a box it ends up inside
  const map = MAPS.cellar;
  const ramp = map.RAMPS.find((r) => r.x > 0 && r.x < 9 * M && r.z < 0); // the lab's bench ramp
  const { mode } = soccerRoom('cellar');
  const c = Math.cos(ramp.rotY), sn = Math.sin(ramp.rotY); // local +z = uphill
  const lo = ramp.l / 2 + mode.R;
  mode.ball = { p: [ramp.x - sn * lo, mode.R, ramp.z - c * lo], v: [sn * 15, 0, c * 15] };
  let top = 0;
  runBall(mode, 0.6, () => { top = Math.max(top, mode.ball.p[1] - mode.R); });
  check(`soccer: the ball rolls up a ramp instead of through it (${top.toFixed(2)} of ${ramp.rise.toFixed(2)} up)`, top > ramp.rise * 0.6);
  const desk = MAPS.office.FURNITURE.find((f) => f.type === 'desk');
  const o = soccerRoom('office').mode;
  o.ball = { p: [desk.x, o.R, desk.z], v: [0, 0, 0] };
  o.update(0.05);
  const inDesk = Math.abs(o.ball.p[0] - desk.x) < desk.w / 2 && Math.abs(o.ball.p[2] - desk.z) < desk.d / 2;
  check('soccer: a ball inside a desk box is pushed out of it', !inDesk);
  o.ball = { p: [desk.x, desk.h + o.R + 2, desk.z], v: [0, 0, 0] };
  let low = Infinity;
  runBall(o, 4, () => { low = Math.min(low, o.ball.p[1]); });
  check('soccer: a ball dropped on a desk comes to rest on its top', low > desk.h + o.R - 0.05 && Math.abs(o.ball.p[1] - (desk.h + o.R)) < 0.3);
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
// every map plays every variant, so no blurb may name one floor
check('variants: no variant blurb names the office', Object.values(MODE_VARIANTS).flat().every((v) => !/office/i.test(v.desc)));

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
