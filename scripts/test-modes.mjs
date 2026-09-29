// Mode scoring, driven directly against a stub room. The ws smoke test proves
// each mode *starts* and snapshots correctly; this proves a mode taken all the
// way to its win condition pays out what it says it does.
import {
  CHECKPOINTS, MODES, KOTH_SPOTS, SUMO_ZONE, SPAWNS, MODE_VARIANTS, BEAN_SPAWNS, PICKUP_RADIUS, MAP_IDS,
  clearDropSpot, groundAt, wallBetween, M,
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
