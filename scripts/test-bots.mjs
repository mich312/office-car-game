// Bots, tested two ways:
// 1. Judgement (server/src/botbrain.js): put a bot in a situation, check
//    what it does with the item in its hand, and whether a pad is worth it.
// 2. Whole matches (scripts/bot-sim.mjs): a real Room full of bots on a
//    virtual clock. These are the checks that caught the bots never
//    finishing a lap and never holding an item — neither is visible from
//    any single function.
import { createSim } from './bot-sim.mjs';
import {
  shouldUseItem, padWorthDetour, ITEM_REACT_S, ITEM_FALLBACK_S, SHIELD_ROCKET_RANGE,
} from '../server/src/botbrain.js';
import { CHECKPOINTS, POWERUP_EFFECT as FX, BOOST_TOP_MULT, MSG } from '../shared/src/index.js';
import { MAPS, MAP_IDS, clearDropSpot, soccerKickoff } from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };

// ------------------------------------------------------------ judgement
const rival = (o) => ({ ahead: 0, lateral: 0, dist: 30, closing: 0, exposed: true, ...o });
const ctx = (o) => ({ held: 2, rivals: [], incomingRocketDist: Infinity, rank: 0.5, aligned: true, speedFrac: 0.8, ...o });

check('items: nothing fires in the reaction window after pickup', ['emp', 'oil', 'turbo', 'rocket', 'swap', 'shrink', 'spring', 'fake']
  .every((it) => !shouldUseItem(it, ctx({ held: ITEM_REACT_S * 0.5, rank: 1, rivals: [rival({ dist: 2, ahead: -3 })] }))));
check('emp: fires with a rival in range', shouldUseItem('emp', ctx({ rivals: [rival({ dist: 5 })] })));
check('emp: holds with nobody in range', !shouldUseItem('emp', ctx({ rivals: [rival({ dist: 20 })] })));
check('emp: a shielded rival does not count', !shouldUseItem('emp', ctx({ rivals: [rival({ dist: 4, exposed: false })] })));
check('oil: dropped on a car in our tyre tracks', shouldUseItem('oil', ctx({ rivals: [rival({ ahead: -6, lateral: 1 })] })));
check('oil: not with the only rival in front', !shouldUseItem('oil', ctx({ rivals: [rival({ ahead: 6, lateral: 0 })] })));
check('oil: not with a rival behind but well off our line', !shouldUseItem('coffee', ctx({ rivals: [rival({ ahead: -6, lateral: 9 })] })));
check('shield: raised the instant a rocket aimed at us closes in', shouldUseItem('shield', ctx({ held: 0, incomingRocketDist: SHIELD_ROCKET_RANGE - 1 })));
check('shield: raised against an incoming ram', shouldUseItem('shield', ctx({ held: 0, rivals: [rival({ dist: 2, closing: 15 })] })));
check('shield: held while nothing is coming', !shouldUseItem('shield', ctx({ held: 5, rivals: [rival({ dist: 2, closing: 1 })] })));
check('turbo: saved for the straight, not fired into a corner', !shouldUseItem('turbo', ctx({ aligned: false })) && shouldUseItem('turbo', ctx({ aligned: true })));
check('shrink: never fired while leading (it hits the leader)', !shouldUseItem('shrink', ctx({ rank: 0, held: 60 })) && shouldUseItem('shrink', ctx({ rank: 0.4 })));
check('swap: held while in front, fired from the back', !shouldUseItem('swap', ctx({ rank: 0.2 })) && shouldUseItem('swap', ctx({ rank: 0.8 })));
check('fallback: an unusable item is not hoarded forever', shouldUseItem('oil', ctx({ held: ITEM_FALLBACK_S + 1 })));

const bot = { x: 0, z: 0, heading: 0 }; // facing +z
check('pads: a close pad ahead is worth it', padWorthDetour(bot, { x: 1, z: 8 }, null));
check('pads: a pad behind is not', !padWorthDetour(bot, { x: 0, z: -6 }, null));
check('pads: a pad beyond range is not', !padWorthDetour(bot, { x: 0, z: 40 }, null));
check('pads: a pad well off the way to the goal is not', !padWorthDetour(bot, { x: 9, z: 9 }, { x: -20, z: 20 }));
check('pads: a pad on the way to the goal is', padWorthDetour(bot, { x: 1, z: 8 }, { x: 2, z: 25 }));

// ------------------------------------------------------------- races
const SEEDS = [1, 2, 3, 4, 5, 6];
const firstLaps = [];
let lapped = 0, bots = 0, pickups = 0, items = 0, emps = 0, empsHit = 0, driftT = 0, boostT = 0, ticks = 0;
for (const seed of SEEDS) {
  const sim = await createSim({ seed, mode: 'desk_dash' });
  const t0 = sim.now();
  const lapAt = new Map();
  sim.run(200, (s) => {
    for (const b of s.bots) {
      ticks++;
      if (b.drifting) driftT++;
      if (b.boostingNow) boostT++;
      if (b.lap >= 1 && !lapAt.has(b.id)) lapAt.set(b.id, (s.now() - t0) / 1000);
    }
  });
  bots += sim.bots.length;
  lapped += lapAt.size;
  firstLaps.push(...lapAt.values());
  pickups += sim.events.filter((e) => e.type === 'pad_taken').length;
  items += sim.events.filter((e) => ['emp', 'rocket', 'puddle', 'shield', 'turbo', 'spring', 'shrink', 'swap', 'fake'].includes(e.type)).length;
  const e = sim.events.filter((ev) => ev.type === 'emp');
  emps += e.length;
  empsHit += e.filter((ev) => ev.targets.length > 0).length;
}
const meanLap = firstLaps.reduce((a, b) => a + b, 0) / Math.max(1, firstLaps.length);
check(`race: bots complete laps (${lapped}/${bots} finished lap one)`, lapped >= bots * 0.9);
// Pace band. Flat out, the balanced car laps the 498-unit line in 29 s; a
// human learning the map runs ~35-45 s. Bots belong in there — rivals,
// not ghosts, and not on rails either.
check(`race: bot pace is competitive but beatable (mean first lap ${meanLap.toFixed(1)} s)`, meanLap > 34 && meanLap < 48);
check(`race: bots collect items (${(pickups / SEEDS.length).toFixed(1)} per race)`, pickups / SEEDS.length >= 10);
check(`race: bots use what they collect (${items}/${pickups})`, items >= pickups * 0.8);
check(`race: EMPs catch somebody (${empsHit}/${emps})`, emps === 0 || empsHit / emps >= 0.6);
check(`race: bots drift through corners (${(driftT / ticks * 100).toFixed(1)}% of the time)`, driftT / ticks > 0.03 && driftT / ticks < 0.2);
check(`race: bots boost on straights (${(boostT / ticks * 100).toFixed(1)}% of the time)`, boostT / ticks > 0.1 && boostT / ticks < 0.45);

// every checkpoint gets registered, including the balcony corner (#15)
// that every bot used to cut on every lap
{
  const sim = await createSim({ seed: 11, mode: 'desk_dash' });
  const seen = new Set();
  sim.run(70, (s) => { for (const b of s.bots) seen.add(b.nextCp % CHECKPOINTS.length); });
  check('race: the balcony checkpoint is reached', [...Array(CHECKPOINTS.length).keys()].every((i) => seen.has(i)));
}

// ------------------------------------------------ variants, with bots
{
  let lapped = 0, total = 0;
  const firsts = [];
  for (const seed of [1, 2, 3]) {
    const sim = await createSim({ seed, mode: 'desk_dash', variant: 'reverse' });
    const t0 = sim.now();
    const lapAt = new Map();
    sim.run(150, (s) => { for (const b of s.bots) if (b.lap >= 1 && !lapAt.has(b.id)) lapAt.set(b.id, (s.now() - t0) / 1000); });
    total += sim.bots.length; lapped += lapAt.size; firsts.push(...lapAt.values());
  }
  const mean = firsts.reduce((a, b) => a + b, 0) / Math.max(1, firsts.length);
  check(`reverse: bots race it backwards (${lapped}/${total} lapped, mean ${mean.toFixed(1)} s)`, lapped >= total * 0.9 && mean > 34 && mean < 48);
}
for (const [mode, variant] of [['sumo', 'drift'], ['koth', 'rush']]) {
  let err = null;
  try { (await createSim({ seed: 4, mode, variant })).run(90); } catch (e) { err = e; }
  check(`${mode} ${variant}: 90 s of bots without an error${err ? ` (${err.message})` : ''}`, !err);
}

// ---------------------------------------------------- swap in a race
{
  const sim = await createSim({ seed: 3, mode: 'desk_dash' });
  const [a, b, ...rest] = sim.bots;
  for (const r of rest) sim.room.players.delete(r.id);
  Object.assign(a, { lap: 1, nextCp: 3, score: 224, powerup: 'swap' });
  Object.assign(b, { lap: 0, nextCp: 10, score: 80 });
  const pa = [...a.p], pb = [...b.p];
  sim.room.usePowerup(a);
  check('swap: bodies trade places', a.p[0] === pb[0] && b.p[0] === pa[0]);
  check('swap: in a race, progress trades with them', a.lap === 0 && a.nextCp === 10 && b.lap === 1 && b.nextCp === 3 && a.score === 80);
  b.finished = true; a.powerup = 'swap';
  const before = [...a.p];
  sim.room.usePowerup(a);
  check('swap: a car that has finished cannot be swapped with', a.p[0] === before[0]);
}

// ------------------------------------------- bots feel items and floors
{
  const sim = await createSim({ seed: 5, mode: 'free_roam' });
  const b = sim.bots[0];
  sim.run(6);
  const top = b.tuned.topSpeed * b.skill;
  const follow = (kind) => () => { sim.room.puddles = [{ id: 1, kind, x: b.p[0], z: b.p[2], until: sim.now() + 1e6 }]; };
  sim.run(2, follow('coffee'));
  check(`puddles: coffee slows a bot (${b.speed.toFixed(1)} of ${top.toFixed(1)})`, b.speed <= top * 0.55 * BOOST_TOP_MULT + 0.5);
  sim.room.puddles = [];
  sim.run(1, follow('oil'));
  check('puddles: oil takes a bot\'s steering', b.oilUntil > sim.now());
  sim.room.puddles = [];
  sim.run(3);
  const t = sim.now();
  sim.room.bots.onItemUsed(b, 'turbo', t);
  let peak = 0;
  sim.run(1, () => { peak = Math.max(peak, b.speed); });
  check(`turbo: a bot's turbo item actually surges it (${peak.toFixed(1)} vs top ${top.toFixed(1)})`, peak > top * 1.05);
  // isolate the hop: no pad pickups (a second spring mid-check would keep it airborne)
  sim.room.bots.items = false; b.powerup = null;
  sim.room.bots.onItemUsed(b, 'spring', sim.now());
  let apex = 0, airborneSeen = false;
  sim.run(1.5, () => { apex = Math.max(apex, b.p[1]); if (!b.grounded) airborneSeen = true; });
  check(`spring: a bot's spring launches it (apex ${apex.toFixed(1)})`, apex > 1.5 && airborneSeen);
  check('spring: and it lands again', b.grounded && Math.abs(b.p[1] - 0.24) < 1e-9);
}

// ------------------------------------------------------------ contact
// The server decides who hit whom (the car closing faster), whoever
// reported it, and raises bot-vs-bot contacts itself: bots have no client.
{
  const human = (sim, id) => { const h = sim.room.makePlayer(id, null, { name: id }); sim.room.players.set(id, h); return h; };
  const report = (sim, from, to) => sim.room.onMessage({ playerId: from.id }, { t: MSG.BUMP, target: to.id });
  for (const map of MAP_IDS) {
    {
      const sim = await createSim({ seed: 1, mode: 'battery', map, bots: 1 });
      const bot = sim.bots[0];
      const h = human(sim, 'h1');
      Object.assign(h, { p: [0, 0.24, 0], v: [0, 0, 0], hasBattery: true });
      sim.room.mode.battery.carrier = h.id;
      Object.assign(bot, { p: [-0.9, 0.24, 0], v: [25, 0, 0] });
      report(sim, h, bot); // the rammed human's own client reports it
      check(`${map} contact: a bot ramming a parked carrier knocks the battery loose`, sim.room.mode.battery.carrier !== h.id && !h.hasBattery);
    }
    {
      const sim = await createSim({ seed: 1, mode: 'coffee_run', map, bots: 1 });
      const bot = sim.bots[0];
      const h = human(sim, 'h1');
      Object.assign(h, { p: [0, 0.24, 0], v: [0, 0, 0], beans: 5 });
      Object.assign(bot, { p: [-0.9, 0.24, 0], v: [25, 0, 0], beans: 2 });
      report(sim, h, bot);
      check(`${map} contact: the rammed car spills, not the rammer`, h.beans < 5 && bot.beans === 2);
    }
    for (const first of ['rammer', 'victim']) {
      // between two humans, report order used to pick the victim
      const sim = await createSim({ seed: 1, mode: 'coffee_run', map, bots: 0 });
      const a = human(sim, 'h1'), b = human(sim, 'h2');
      Object.assign(a, { p: [0, 0.24, 0], v: [0, 0, 0], beans: 6 });
      Object.assign(b, { p: [-0.9, 0.24, 0], v: [22, 0, 0], beans: 4 });
      if (first === 'rammer') { report(sim, b, a); report(sim, a, b); } else { report(sim, a, b); report(sim, b, a); }
      check(`${map} contact: ${first}'s report first — the parked car spills either way`, a.beans < 6 && b.beans === 4);
    }
    {
      const sim = await createSim({ seed: 1, mode: 'coffee_run', map, bots: 0 });
      const a = human(sim, 'h1'), b = human(sim, 'h2');
      Object.assign(a, { p: [0, 0.24, 0], v: [15, 0, 0], beans: 5 });
      Object.assign(b, { p: [0.95, 0.24, 0], v: [-15, 0, 0], beans: 5 });
      report(sim, a, b);
      check(`${map} contact: a head-on spills both`, a.beans < 5 && b.beans < 5);
    }
    {
      const sim = await createSim({ seed: 1, mode: 'coffee_run', map, bots: 0 });
      const a = human(sim, 'h1'), b = human(sim, 'h2');
      Object.assign(a, { p: [0, 0.24, 0], v: [0, 0, 0], beans: 5 });
      Object.assign(b, { p: [-3.2, 0.24, 0], v: [25, 0, 0], beans: 0 });
      report(sim, a, b);
      check(`${map} contact: a report from 3 units away is not believed`, a.beans === 5 && sim.room.lastBump.size === 0);
    }
    {
      // the final whistle takes the loads off (the roof battery and its
      // speed penalty used to ride on through the podium into the lobby)
      const sim = await createSim({ seed: 1, mode: 'battery', map, bots: 1 });
      const h = human(sim, 'h1');
      sim.room.mode.battery.carrier = h.id; h.hasBattery = true; h.beans = 3;
      sim.room.endsAt = sim.now();
      sim.run(0.1);
      check(`${map} battery: nobody carries it into the podium`, sim.room.phase === 'podium' && !h.hasBattery && h.beans === 0);
    }
    {
      // bots only, no items: every transfer of It is a contact the server saw
      const sim = await createSim({ seed: 2, mode: 'tag', map });
      sim.room.bots.items = false;
      for (const b of sim.bots) b.powerup = null;
      sim.run(120);
      const tags = sim.events.filter((e) => e.type === 'tag').length;
      check(`${map} tag: bots tag each other by contact (${tags} tags in 120 s)`, tags >= 3);
    }
    {
      const sim = await createSim({ seed: 3, mode: 'tag', map, bots: 2 });
      const [a, b] = sim.bots;
      sim.room.mode.setIt(a); sim.room.mode.lastTagAt = 0;
      b.p = [a.p[0] + 2, 0.24, a.p[2]];
      a.powerup = 'emp'; sim.room.usePowerup(a);
      check(`${map} tag: the It car's own EMP does not hand It to its victim`, sim.room.mode.it === a.id);
      sim.room.mode.lastTagAt = 0;
      b.powerup = 'emp'; sim.room.usePowerup(b);
      check(`${map} tag: an EMP on the It car takes It`, sim.room.mode.it === b.id);
      sim.room.mode.lastTagAt = 0;
      Object.assign(b, { p: [0, 0.24, 0], v: [0, 0, 0], shieldUntil: sim.now() + 5000, stunUntil: 0 });
      Object.assign(a, { p: [0.9, 0.24, 0], v: [-3, 0, 0], stunUntil: 0 });
      sim.room.onBump(a, b); // a rub
      check(`${map} tag: a rub does not steal It through a shield (it pops it)`, sim.room.mode.it === b.id && !(b.shieldUntil > sim.now()));
    }
  }
}

// ------------------------------------------------------- finding things
// A lone bot (no items, no office events) has to find its way anywhere on
// the floor: the racing line skips whole rooms, and on the cellar loaded
// bots circled the corridor for minutes, unable to find the boiler room.
for (const map of MAP_IDS) {
  const M = MAPS[map];
  const alone = async (seed, mode) => {
    const sim = await createSim({ seed, mode, map, bots: 1 });
    for (const o of sim.bots.slice(1)) sim.room.players.delete(o.id);
    sim.room.bots.items = false;
    sim.room.nextEventAt = Infinity;
    const b = sim.bots[0];
    b.powerup = null;
    return { sim, b };
  };
  let worst = 0, failed = 0;
  for (let i = 0; i < M.BEAN_SPAWNS.length; i += 2) {
    const { sim, b } = await alone(i + 1, 'coffee_run');
    const s = M.BEAN_SPAWNS[i];
    b.p = [s.x, 0.24, s.z]; b.beans = 5;
    sim.room.mode.beans = []; // nothing to pick up on the way
    const t0 = sim.now();
    let at = null;
    sim.run(20, (x) => { if (at === null && b.beans === 0) at = (x.now() - t0) / 1000; });
    if (at === null) failed++; else worst = Math.max(worst, at);
  }
  check(`${map} coffee: a loaded bot delivers from anywhere within 20 s (${failed} failed, slowest ${worst.toFixed(1)} s)`, failed === 0);
  const missed = [];
  let tried = 0;
  for (const r of M.ROOMS) {
    for (let k = 0; k < 6; k++) {
      const x = r.x + ((k % 3) / 2 - 0.5) * r.w * 0.7, z = r.z + (Math.floor(k / 3) - 0.5) * r.d * 0.6;
      if (!clearDropSpot(M, x, z, x, z, { pad: 0.8 })) continue;
      const { sim, b } = await alone(++tried, 'battery');
      b.p = [M.SPAWNS[0].x, 0.24, M.SPAWNS[0].z];
      Object.assign(sim.room.mode.battery, { x, z, carrier: null });
      sim.run(40, () => {});
      if (!sim.room.mode.battery.carrier) missed.push(r.id);
    }
  }
  check(`${map} battery: a bot reaches a loose battery in every room within 40 s (missed ${missed.length}/${tried}${missed.length ? `: ${missed.join(', ')}` : ''})`, missed.length === 0);
}

// ------------------------------------------------------------ RC Soccer
for (const map of MAP_IDS) {
  const M = MAPS[map];
  let goals = 0, own = 0, touchAt = 0, placed = true;
  const SEEDS2 = [1, 2, 3, 4];
  for (const seed of SEEDS2) {
    const sim = await createSim({ seed, mode: 'soccer', map });
    // bots start on their team's kickoff spots, like humans do (they used
    // to start on the race grid, a pitch away from the ball)
    const ord = [0, 0];
    for (const b of sim.bots) {
      const sp = soccerKickoff(M, b.team, ord[b.team]++);
      if (Math.hypot(b.p[0] - sp.x, b.p[2] - sp.z) > 1) placed = false; // GO's first tick has run
    }
    const t0 = sim.now();
    let first = null;
    const m = sim.room.mode;
    sim.run(240, (s) => { if (first === null && m.ball.lastTouch) first = (s.now() - t0) / 1000; });
    touchAt = Math.max(touchAt, first ?? 99);
    goals += sim.events.filter((e) => e.type === 'goal').length;
    own += sim.events.filter((e) => e.t === 'feed' && /OWN GOAL/.test(e.text)).length;
  }
  check(`${map} soccer: bots kick off from their team's kickoff spots`, placed);
  check(`${map} soccer: the ball is contested within 3 s of GO (${touchAt.toFixed(1)} s)`, touchAt < 3);
  // own goals were 30-57 % of all goals: bots came at the ball from the goal side
  check(`${map} soccer: bots score (${(goals / SEEDS2.length).toFixed(1)} goals a match)`, goals / SEEDS2.length >= 2);
  check(`${map} soccer: few own goals (${own}/${goals})`, own / Math.max(1, goals) < 0.25);
}
{
  // a countdown joiner is a drop-in: onto the smaller team, not always Orange
  const sim = await createSim({ seed: 1, mode: 'soccer', map: 'office', bots: 7 });
  sim.room.startCountdown('soccer');
  const teams = () => [...sim.room.players.values()].reduce((n, p) => { n[p.team]++; return n; }, [0, 0]);
  const [o, b] = teams();
  const ws = { send() {}, on() {} };
  sim.room.pending++;
  sim.room.onMessage(ws, { t: MSG.HELLO, name: 'Late' });
  const late = sim.room.players.get(ws.playerId);
  check(`soccer: a countdown joiner evens the teams (${o}/${b} → ${teams().join('/')})`, Math.abs(teams()[0] - teams()[1]) <= 1 && late.team === (o > b ? 1 : 0));
}

// --------------------------------------------------- every mode still runs
for (const mode of ['coffee_run', 'battery', 'soccer', 'koth', 'tag', 'sumo', 'last_standing', 'free_roam']) {
  let err = null, driftT2 = 0, t2 = 0;
  try {
    const sim = await createSim({ seed: 2, mode });
    sim.run(90, (s) => { for (const b of s.bots) { t2++; if (b.drifting) driftT2++; } });
  } catch (e) { err = e; }
  check(`${mode}: 90 s of bots without an error${err ? ` (${err.message})` : ''}`, !err);
  // bots circling a nearby target (ball, zone slot) used to drift the whole
  // time — doughnuts are not racing
  if (['soccer', 'koth', 'sumo'].includes(mode)) check(`${mode}: no doughnuts around the target (${(driftT2 / t2 * 100).toFixed(1)}% drifting)`, driftT2 / t2 < 0.1);
}

// ------------------------------------------------------ every other map
// Every map has to be raceable by bots (both directions) and survive every
// mode. Lap lengths differ per floor, so the pace band here is wide; the
// office's tight band above is the tuning reference.
for (const mapId of MAP_IDS.filter((id) => id !== 'office')) {
  const map = MAPS[mapId];
  for (const variant of ['classic', 'reverse']) {
    let lapped = 0, total = 0;
    const seen = new Set();
    const firsts = [];
    for (const seed of [1, 2]) {
      const sim = await createSim({ seed, mode: 'desk_dash', variant, map: mapId });
      const t0 = sim.now();
      const lapAt = new Map();
      sim.run(150, (s) => {
        for (const b of s.bots) {
          seen.add(b.nextCp % map.CHECKPOINTS.length);
          if (b.lap >= 1 && !lapAt.has(b.id)) lapAt.set(b.id, (s.now() - t0) / 1000);
        }
      });
      total += sim.bots.length; lapped += lapAt.size; firsts.push(...lapAt.values());
    }
    const mean = firsts.reduce((a, b) => a + b, 0) / Math.max(1, firsts.length);
    check(`${mapId} ${variant}: bots lap it (${lapped}/${total}, mean ${mean.toFixed(1)} s)`, lapped >= total * 0.9 && mean > 18 && mean < 70);
    check(`${mapId} ${variant}: every checkpoint is reached (${seen.size}/${map.CHECKPOINTS.length})`, seen.size === map.CHECKPOINTS.length);
  }
  for (const mode of ['coffee_run', 'battery', 'soccer', 'koth', 'tag', 'sumo', 'last_standing', 'free_roam']) {
    let err = null;
    try { (await createSim({ seed: 4, mode, map: mapId })).run(45); } catch (e) { err = e; }
    check(`${mapId} ${mode}: 45 s of bots without an error${err ? ` (${err.message})` : ''}`, !err);
  }
}

console.log(fails ? `\n${fails} bot check(s) failed` : '\nall bot checks passed');
process.exit(fails ? 1 : 0);
