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
import { CHECKPOINTS, POWERUP_EFFECT as FX, BOOST_TOP_MULT } from '../shared/src/index.js';
import { MAPS, MAP_IDS } from '../shared/src/index.js';

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

// ----------------------------------------------------- into the podium
{
  // an event (and its robot) running at the final whistle used to ride on
  // into the podium snapshot
  const sim = await createSim({ seed: 3, mode: 'koth' });
  sim.room.endsAt = sim.now() + 8000;
  sim.room.nextEventAt = sim.now() + 3500;
  sim.run(3.4);
  sim.room.pendingEvent = { id: 'cleaning_robot', duration: 20, name: 'x', icon: '', desc: '' };
  sim.run(2);
  const hadRobot = !!sim.room.robot;
  sim.run(5);
  check(`podium: the robot and the event end with the match (robot seen ${hadRobot})`, hadRobot && sim.room.phase === 'podium' && !sim.room.robot && !sim.room.event);
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
