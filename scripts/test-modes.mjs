// Mode scoring, driven directly against a stub room. The ws smoke test proves
// each mode *starts* and snapshots correctly; this proves a mode taken all the
// way to its win condition pays out what it says it does.
import {
  CHECKPOINTS, MODES, LCS, M, KOTH_SPOTS, KOTH_RADIUS, SUMO_ZONE, SPAWNS, MODE_VARIANTS,
  raceCheckpoints, raceBotPath, raceSpawn, rollVariant, variantOf, sumoCenter, kothHopSeconds, BOT_PATH, MAPS,
  MAP_IDS, sumoTarget, SUMO_TARGET_MIN_DIST, isDecor,
} from '../shared/src/index.js';
import { createMode } from '../server/src/modes.js';
import { roomsConnected } from '../server/src/nav.js';

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

// ------------------------------------------------------ Standup Standoff
{
  // a car behind a wall is not at the meeting, even inside the radius: the
  // cellar Archive spot used to sit 1.6 m from a car parked in the corridor
  // on the far side of the wall, and that car scored
  const a = player('p1', 'Alice'), b = player('p2', 'Bob');
  const room = stubRoom([a, b]);
  room.map = { ...MAPS.cellar, KOTH_SPOTS: [{ x: 12.1 * M, z: -2.4 * M }] };
  room.modeId = 'koth';
  const mode = createMode('koth', room);
  mode.hopAt = Date.now() + 1e6;
  a.p = [12.1 * M, 0, -2.4 * M]; b.p = [12.1 * M, 0, -0.8 * M];
  mode.update(1);
  check('standup: a car behind a wall scores nothing, even inside the radius', b.score === 0 && a.score > 0);
}
{
  // a shared zone is a split zone
  const a = player('p1', 'Alice'), b = player('p2', 'Bob'), c = player('p3', 'Cass');
  const room = stubRoom([a, b, c]);
  room.modeId = 'koth';
  const mode = createMode('koth', room);
  mode.hopAt = Date.now() + 1e6;
  const z = mode.zonePos();
  a.p = [z.x, 0, z.z]; b.p = [z.x + 1, 0, z.z]; c.p = [z.x + 500, 0, z.z];
  mode.update(1);
  check('standup: two cars in the zone split the points', Math.abs(a.score - MODES.koth.scorePerSecond / 2) < 1e-9 && a.score === b.score && c.score === 0);
  check('standup: the snapshot says how many hold it, and where it goes next', mode.snapshot().zone.n === 2 && !!mode.snapshot().zone.next);
  b.p = [z.x + 500, 0, z.z];
  mode.update(1);
  check('standup: alone in it pays the full rate', Math.abs(a.score - MODES.koth.scorePerSecond * 1.5) < 1e-9);
  const next = mode.snapshot().zone.next;
  mode.hopAt = Date.now() - 1;
  mode.update(0);
  check('standup: it moves where it said it would', mode.zonePos().x === next.x && mode.zonePos().z === next.z);
}
{
  // Rush Hour hops to the nearer half of the floor
  const room = stubRoom([player('p1', 'A')]);
  room.modeId = 'koth';
  room.variant = 'rush';
  const spots = room.map.KOTH_SPOTS;
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const mode = createMode('koth', room);
    const cur = spots[mode.spot];
    const ds = spots.map((s) => Math.hypot(s.x - cur.x, s.z - cur.z)).filter((d) => d > 0).sort((a, b) => a - b);
    const d = Math.hypot(spots[mode.next].x - cur.x, spots[mode.next].z - cur.z);
    worst = Math.max(worst, ds.indexOf(d) / ds.length);
  }
  check('rush hour: the next spot is always in the nearer half', worst < 0.5 + 1e-9);
}

{
  // A timeout is not an N-way win: the car holding the centre takes the
  // bonus, everyone still in banks their places, and the feed says it once.
  const a = player('p1', 'Alice'), b = player('p2', 'Bob'), c = player('p3', 'Cass'), d = player('p4', 'Dee');
  const room = stubRoom([a, b, c, d]);
  const feed = [];
  room.feed = (t) => feed.push(t);
  room.modeId = 'sumo';
  const mode = createMode('sumo', room);
  mode.update(); // round 1
  const Z = mode.zone;
  a.p = [Z.x + 0.5, 0, Z.z]; b.p = [Z.x + 3, 0, Z.z]; c.p = [Z.x - 4, 0, Z.z]; d.p = [Z.x, 0, Z.z + 2];
  mode.eliminate(d, 'test');
  feed.length = 0;
  mode.roundEndsAt = Date.now() - 1;
  mode.update(0.05);
  check('sumo: on a timeout the centre takes the win bonus', a.score === MODES.sumo.placeScore + MODES.sumo.winBonus);
  check('sumo: the other survivors bank their places, no bonus', b.score === MODES.sumo.placeScore && c.score === MODES.sumo.placeScore);
  check('sumo: one feed line for the round, not one per car', feed.length === 1);
  check('sumo: the break between rounds shows no out-countdown, and says it is a break', mode.snapshot().sumo.out.length === 0 && mode.snapshot().sumo.rest > 0);
}
{
  // grace: a one-tick touch back inside the ring no longer resets it
  const a = player('p1', 'Alice'), b = player('p2', 'Bob'), c = player('p3', 'Cass');
  const room = stubRoom([a, b, c]);
  room.modeId = 'sumo';
  const mode = createMode('sumo', room);
  mode.update();
  const Z = mode.zone;
  b.p = [Z.x, 0, Z.z]; c.p = [Z.x + 1, 0, Z.z];
  const outside = () => { a.p = [Z.x + mode.zone.r + 5, 0, Z.z]; };
  const tick = (sec, fn) => { for (let t = 0; t < sec; t += 0.05) { fn(); mode.update(0.05); } };
  tick(MODES.sumo.outSeconds * 0.8, outside);
  tick(0.1, () => { a.p = [mode.zone.x, 0, mode.zone.z]; });
  check('sumo: out of the ring shows the grace left', !a.sumoDead && a.sumoOutT > 0);
  tick(MODES.sumo.outSeconds * 0.4, outside);
  check('sumo: dipping back in for a moment does not reset the grace', a.sumoDead);
}
{
  // the ring closes early, then holds at its final size
  const room = stubRoom([player('p1', 'A'), player('p2', 'B')]);
  room.modeId = 'sumo';
  const mode = createMode('sumo', room);
  mode.update();
  mode.roundEndsAt = Date.now() + mode.roundLen * (1 - MODES.sumo.closeFrac) - 10;
  mode.update(0.05);
  check('sumo: the ring is at its final size before the round runs out', Math.abs(mode.zone.r - room.map.SUMO_ZONE.r1) < 1e-6);
}
check('moving meeting: never the ring\'s own centre, never last round\'s room', MAP_IDS.every((id) => {
  const map = MAPS[id];
  let prev = null;
  for (let i = 0; i < 300; i++) {
    const t = sumoTarget(i, 'drift', map, Math.random, prev);
    if (t === prev || Math.hypot(t.x - map.SUMO_ZONE.x, t.z - map.SUMO_ZONE.z) <= SUMO_TARGET_MIN_DIST) return false;
    prev = t;
  }
  return true;
}));

// ------------------------------------------------- the match clock ends it
{
  // The last round used to start 1 s before the match clock ran out and
  // never end: survivors went unpaid, so a knockout out-scored surviving.
  const a = player('p1', 'Alice'), b = player('p2', 'Bob'), c = player('p3', 'Cass');
  const room = stubRoom([a, b, c]);
  room.modeId = 'sumo';
  room.endsAt = Date.now() + 30000;
  const mode = createMode('sumo', room);
  mode.update(); // round 1, cut to fit the match
  check('sumo: a round never outlasts the match clock', mode.roundEndsAt <= room.endsAt);
  mode.eliminate(a, 'test');
  mode.onMatchEnd();
  check('sumo: survivors of a round the clock cut short get paid', b.score >= MODES.sumo.placeScore && c.score >= MODES.sumo.placeScore);
  check('sumo: surviving the last round beats being knocked out of it', b.score > a.score && c.score > a.score);
  const room2 = stubRoom([player('p1', 'A'), player('p2', 'B')]);
  room2.modeId = 'sumo';
  room2.endsAt = Date.now() + 5000;
  const m2 = createMode('sumo', room2);
  m2.update();
  check('sumo: no round starts with too little match left to play it', m2.round === 0);
}
{
  // LCS: survivors at the timer used to get nothing but survival points,
  // so cars eliminated late outranked them.
  const cars = ['A', 'B', 'C', 'D'].map((n, i) => player(`p${i}`, n));
  const room = stubRoom(cars);
  room.modeId = 'last_standing';
  const mode = createMode('last_standing', room);
  mode.eliminate(cars[0], 'test');
  mode.eliminate(cars[1], 'test');
  mode.onMatchEnd();
  const [a, b, c, d] = cars;
  check('lcs: survivors at the timer outrank every eliminated car', Math.min(c.score, d.score) > Math.max(a.score, b.score));
  check('lcs: survivors at the timer share the crown', c.score === d.score && c.score >= LCS.WINNER_SCORE / 2);
}
{
  // LCS: once crowned, Facilities stops closing rooms.
  const a = player('p1', 'A'), b = player('p2', 'B');
  const room = stubRoom([a, b]);
  room.modeId = 'last_standing';
  const feed = [];
  room.feed = (t) => feed.push(t);
  const mode = createMode('last_standing', room);
  mode.eliminate(a, 'test');
  const scored = b.score;
  mode.nextLockAt = Date.now() - 1;
  mode.update(1);
  check('lcs: no closures after the crown', !feed.some((t) => t.includes('Facilities')) && !mode.warn);
  check('lcs: no survival points in the victory lap', b.score === scored);
}

// ------------------------------------------------------------ Open Office
{
  // style points used to come straight from the last reported flags: one
  // report of "drifting, airborne" and a silent client scored forever
  const a = player('p1', 'Afk'), b = player('p2', 'Driver');
  const room = stubRoom([a, b]);
  room.modeId = 'free_roam';
  const mode = createMode('free_roam', room);
  Object.assign(a, { drifting: true, grounded: false, lastStateAt: Date.now() - 5000, p: [0, 3, 0], v: [10, 0, 0] });
  Object.assign(b, { drifting: true, grounded: true, lastStateAt: Date.now(), p: [0, 0.3, 0], v: [0.5, 0, 0] });
  for (let i = 0; i < 20; i++) mode.update(0.05);
  check('open office: a client that went silent scores nothing', a.score === 0);
  check('open office: a drift on the spot is not style', b.score === 0);
  Object.assign(b, { v: [12, 0, 0] });
  mode.update(1);
  check('open office: a real drift scores', b.score === MODES.free_roam.driftPerS);
  Object.assign(b, { drifting: false, grounded: false, p: [0, 2, 0] });
  for (let i = 0; i < 200; i++) { b.lastStateAt = Date.now(); mode.update(0.05); }
  check('open office: air time is capped per jump', Math.abs(b.score - MODES.free_roam.driftPerS - MODES.free_roam.airPerS * MODES.free_roam.airCapS) < 0.1);
  Object.assign(b, { grounded: false, p: [0, 0.3, 0], v: [0, 0, 0] });
  const s0 = b.score;
  mode.update(1);
  check('open office: "airborne" while sitting on the floor is not air', b.score === s0);
}

// ---------------------------------------------------- Last Car Standing
for (const mapId of MAP_IDS) {
  const map = MAPS[mapId];
  const cars = ['A', 'B', 'C'].map((n, i) => player(`p${i}`, n));
  const room = stubRoom(cars);
  room.map = map;
  room.modeId = 'last_standing';
  room.endsAt = Date.now() + 210000;
  const mode = createMode('last_standing', room);
  mode.update(0.05);
  // Closures leave the open rooms connected — a hub (the cellar corridor)
  // is closed late instead of cutting the floor in half at 15 s.
  let split = 0;
  for (let k = 0; k < map.ROOMS.length - 1; k++) {
    mode.locked.push(mode.nextRoom());
    if (!roomsConnected(map, map.ROOMS.map((r) => r.id).filter((id) => !mode.locked.includes(id)))) split++;
  }
  check(`${mapId} lcs: closing rooms never cuts the open floor in two (${split} splits)`, split === 0);
  // paced to the map: the last closure leaves the finale before the whistle
  const lastClosure = LCS.FIRST_LOCK_S + mode.interval * (map.ROOMS.length - 2);
  check(`${mapId} lcs: closures are paced to the map (every ${mode.interval.toFixed(1)} s, last at ${lastClosure.toFixed(0)} s of 210)`,
    lastClosure <= 210 - LCS.FINALE_S + 1 && lastClosure >= 210 - LCS.FINALE_S - 30);
  // the finale: a zap ring closes in the refuge, on clear floor
  mode.startFinale(Date.now());
  const F = mode.finale;
  const solidAt = (x, z) => [...map.WALLS.filter((w) => !w.low), ...map.FURNITURE.filter((f) => !isDecor(f))]
    .some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
  check(`${mapId} lcs: the finale ring sits on clear floor in the refuge`, !!F && !solidAt(F.x, F.z) && map.roomAt(F.x, F.z)?.id === F.room);
  check(`${mapId} lcs: the finale ring is in the snapshot`, !!mode.snapshot().zone);
  const [a, b, c] = cars;
  a.p = [F.x, 0, F.z]; b.p = [F.x + 0.5, 0, F.z]; c.p = [F.x + F.r0 + 20, 0, F.z];
  F.start = Date.now() - LCS.FINALE_S * 1000;
  for (let i = 0; i < 70; i++) mode.update(0.05);
  check(`${mapId} lcs: outside the finale ring you are zapped`, c.eliminated && !a.eliminated && !b.eliminated);
}
{
  // the robot: deployed partway through, it eliminates what it touches
  const cars = ['A', 'B', 'C'].map((n, i) => player(`p${i}`, n));
  const room = stubRoom(cars);
  room.modeId = 'last_standing';
  const mode = createMode('last_standing', room);
  mode.deployRobot();
  check('lcs: the robot joins and is in the room snapshot', !!mode.robot && room.robot === mode.robot);
  const [a] = cars;
  a.p = [mode.robot.x, 0, mode.robot.z];
  cars[1].p = [mode.robot.x + 50, 0, mode.robot.z];
  cars[2].p = [mode.robot.x - 50, 0, mode.robot.z];
  mode.moveRobot(0.05, Date.now());
  check('lcs: the robot eliminates the car it touches', a.eliminated);
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
