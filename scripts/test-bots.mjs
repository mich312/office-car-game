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
import { CHECKPOINTS, POWERUP_EFFECT as FX, BOOST_TOP_MULT, MSG, KOTH_RADIUS, MUTATORS, M } from '../shared/src/index.js';
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
  // Aimed EMPs only: one fired by the use-it-anyway fallback has nobody to
  // aim at by definition (and finished racers are no longer fair game).
  const empSince = new Map();
  const use = sim.room.usePowerup.bind(sim.room);
  sim.room.usePowerup = (p) => {
    if (p.powerup !== 'emp' || sim.now() - (empSince.get(p.id) ?? sim.now()) > ITEM_FALLBACK_S * 1.5 * 1000 - 100) return use(p);
    const n0 = sim.events.length;
    use(p);
    const ev = sim.events.slice(n0).find((x) => x.type === 'emp');
    if (ev) { emps++; if (ev.targets.length) empsHit++; }
  };
  sim.run(200, (s) => {
    for (const b of s.bots) {
      if (b.powerup !== 'emp') empSince.delete(b.id);
      else if (!empSince.has(b.id)) empSince.set(b.id, s.now());
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
}
const meanLap = firstLaps.reduce((a, b) => a + b, 0) / Math.max(1, firstLaps.length);
check(`race: bots complete laps (${lapped}/${bots} finished lap one)`, lapped >= bots * 0.9);
// Pace band. Flat out, the balanced car laps the ~400-unit line in 23.5 s
// (1u = 28 cm of map); a human learning the map runs ~28-38 s. Bots belong
// in there — rivals, not ghosts, and not on rails either.
check(`race: bot pace is competitive but beatable (mean first lap ${meanLap.toFixed(1)} s)`, meanLap > 27 && meanLap < 40);
check(`race: bots collect items (${(pickups / SEEDS.length).toFixed(1)} per race)`, pickups / SEEDS.length >= 10);
check(`race: bots use what they collect (${items}/${pickups})`, items >= pickups * 0.8);
check(`race: aimed EMPs catch somebody (${empsHit}/${emps})`, emps === 0 || empsHit / emps >= 0.6);
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
  check(`reverse: bots race it backwards (${lapped}/${total} lapped, mean ${mean.toFixed(1)} s)`, lapped >= total * 0.9 && mean > 27 && mean < 40);
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
    {
      // Open Office's bump point goes to the rammer, not to whoever reported
      const sim = await createSim({ seed: 1, mode: 'free_roam', map, bots: 1 });
      const bot = sim.bots[0];
      const h = human(sim, 'h1');
      Object.assign(h, { p: [0, 0.24, 0], v: [0, 0, 0], score: 0 });
      Object.assign(bot, { p: [-0.9, 0.24, 0], v: [20, 0, 0], score: 0 });
      report(sim, h, bot);
      check(`${map} free roam: the bump point goes to the rammer`, bot.score > 0 && h.score === 0);
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

// ------------------------------------------------- battery, bots only
// One bot used to keep the battery 147-174 s of a 180 s match: bots never
// knocked each other's loose. Now it changes hands, but not every second.
for (const map of MAP_IDS) {
  let longest = 0, drops = 0, grabs = 0;
  for (const seed of [1, 2, 3]) {
    const sim = await createSim({ seed, mode: 'battery', map });
    let cur = null, held = 0;
    sim.run(180, (s) => {
      const c = s.room.mode?.battery.carrier || null;
      if (c !== cur) { cur = c; held = 0; } else if (c) { held += s.dt; longest = Math.max(longest, held); }
    });
    drops += sim.events.filter((e) => e.type === 'battery_drop').length;
    grabs += sim.events.filter((e) => e.type === 'battery_grab').length;
  }
  check(`${map} battery: bots take it off each other (longest hold ${longest.toFixed(0)} s, ${(drops / 3).toFixed(0)} drops a match)`, longest < 120 && drops / 3 >= 5);
  check(`${map} battery: …but it isn't a hot potato (${(540 / Math.max(1, grabs)).toFixed(1)} s a hold on average)`, 540 / Math.max(1, grabs) > 3);
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
// a full pitch still scores: with 8+ cars every spare bot used to park on
// its own goal line, and the office went 0-0 (0.3 goals a match at 8 cars)
for (const map of MAP_IDS) {
  let goals = 0;
  for (const seed of [1, 2, 3]) {
    const sim = await createSim({ seed, mode: 'soccer', map, bots: 10 });
    sim.run(240);
    goals += sim.events.filter((e) => e.type === 'goal').length;
  }
  check(`${map} soccer: ten cars on the pitch still score (${(goals / 3).toFixed(1)} goals a match)`, goals / 3 >= 2);
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

// ------------------------------------------- sumo is a shoving match
// Rounds used to time out with every car still in (0 ring-outs in 48
// rounds, every podium a six-way tie): the ring stayed big until the bell,
// one tick back inside reset the grace, and bots orbited instead of shoving.
for (const mapId of MAP_IDS) {
  let rounds = 0, outs = 0, ties = 0;
  for (const seed of [1, 2]) {
    const sim = await createSim({ seed, mode: 'sumo', map: mapId });
    sim.room.bots.items = false;
    sim.run(250);
    const feed = sim.events.filter((e) => e.t === 'feed').map((e) => e.text);
    rounds += feed.filter((t) => t.startsWith('🥋 Round')).length;
    outs += feed.filter((t) => t.includes(' is out')).length;
    const pod = sim.events.find((e) => e.t === 'end')?.podium || [];
    if (pod.length && pod[0].score === pod[pod.length - 1].score) ties++;
  }
  check(`${mapId} sumo: cars get knocked out (${(outs / rounds).toFixed(1)} per round over ${rounds} rounds)`, outs / rounds >= 1.5);
  check(`${mapId} sumo: the podium is not a tie`, ties === 0);
}

// ------------------------------------------ knocked out means out of play
{
  // a car knocked out of a sumo round used to keep collecting and firing
  // items — including a Swap that teleported a living car out of the ring
  const sim = await createSim({ seed: 2, mode: 'sumo' });
  sim.run(1);
  const [a] = sim.bots;
  a.powerup = 'rocket';
  sim.room.mode.eliminate(a, 'test');
  check('sumo: a knocked-out car drops the item it held', a.powerup === null);
  const pad = sim.room.pads[0];
  pad.readyAt = 0;
  a.p = [pad.x, 0.24, pad.z];
  const rnd = Math.random;
  Math.random = () => 0.9;
  sim.room.updatePads(sim.now());
  Math.random = rnd;
  check('sumo: a knocked-out car picks nothing up', a.powerup === null);
  a.powerup = 'swap';
  sim.room.usePowerup(a);
  check('sumo: a knocked-out car cannot fire an item', !sim.events.some((e) => e.type === 'swap'));
}

// ------------------------------------ Last Car Standing, with bots only
// Bots used to kill themselves in bulk: the stuck-recovery hop dropped them
// into locked rooms, and they cruised and fled straight at targets behind
// walls or across closed rooms. The cellar (8 rooms, last closure at 111 s)
// ended with no crown in a third of matches.
for (const mapId of MAP_IDS) {
  let crowned = 0, hops = 0, elims = 0, blunders = 0, ghostsOnFloor = 0;
  const seeds = [1, 2, 3, 4];
  for (const seed of seeds) {
    const sim = await createSim({ seed, mode: 'last_standing', map: mapId });
    const mode = sim.room.mode;
    const lockedAt = {};
    let nLocked = 0;
    const prev = new Map();
    const elim = mode.eliminate.bind(mode);
    mode.eliminate = (p, cause) => {
      const rm = sim.room.map.roomAt(p.p[0], p.p[2])?.id;
      // zapped in a room that locked long enough ago that it drove in later
      if (cause.includes('lingered') && !mode.finale && rm && sim.now() - (lockedAt[rm] || 0) > 2700) blunders++;
      return elim(p, cause);
    };
    sim.run(240, (s) => {
      if (mode.locked.length !== nLocked) { nLocked = mode.locked.length; lockedAt[mode.locked[nLocked - 1]] = s.now(); }
      for (const b of s.bots) {
        const q = prev.get(b.id);
        if (q && !b.eliminated && Math.hypot(b.p[0] - q[0], b.p[2] - q[1]) > 4) {
          const rm = s.room.map.roomAt(b.p[0], b.p[2])?.id;
          if (rm && mode.locked.includes(rm)) hops++;
        }
        if (b.eliminated && b.p[1] > -10) ghostsOnFloor++;
        prev.set(b.id, [b.p[0], b.p[2]]);
      }
    });
    const feed = sim.events.filter((e) => e.t === 'feed').map((e) => e.text);
    if (feed.some((t) => t.includes('LAST CAR STANDING'))) crowned++;
    elims += feed.filter((t) => t.startsWith('💀')).length;
  }
  check(`${mapId} lcs: a stuck bot is never put down in a locked room (${hops})`, hops === 0);
  check(`${mapId} lcs: bots don't drive into closed rooms to die (${blunders} of ${elims} eliminations)`, blunders <= elims * 0.25);
  check(`${mapId} lcs: the match ends with a crown (${crowned}/${seeds.length})`, crowned >= seeds.length - 1);
  check(`${mapId} lcs: eliminated bots leave the floor (no invisible cars where they died)`, ghostsOnFloor === 0);
}

// ------------------------------------------------------ Tiny Cars
{
  // the Shrink item used to overwrite the round-long Tiny Cars shrink with
  // its own 8 s, so the leader grew back (and ran 15% faster than everyone
  // for the rest of the round); drop-ins were never shrunk at all
  const sim = await createSim({ seed: 1, mode: 'koth' });
  sim.room.mutator = MUTATORS.tiny_cars;
  for (const p of sim.room.players.values()) p.shrinkUntil = sim.room.endsAt;
  const [a, b] = sim.bots;
  b.score = 999; a.powerup = 'shrink';
  sim.room.usePowerup(a);
  check('tiny cars: a Shrink never cuts the round-long shrink short', b.shrinkUntil >= sim.room.endsAt);
  let n = 0;
  for (let i = 0; i < 500; i++) if (sim.room.rollPowerup(a) === 'shrink') n++;
  check('tiny cars: nobody draws a Shrink when everyone is already tiny', n === 0);
  const ws = { send() {}, readyState: 1 };
  sim.room.pending++;
  sim.room.onMessage(ws, { t: 'hello', name: 'Late' });
  const late = sim.room.players.get(ws.playerId);
  check('tiny cars: a drop-in is tiny too', !!late && late.shrinkUntil >= sim.room.endsAt);
}

// Moving Meeting: a ring sliding into a room behind walls used to strand
// bots in the corridor on the wrong side, knocked out metres from it.
for (const mapId of MAP_IDS) {
  let n = 0, far = 0;
  for (const seed of [1, 2, 3]) {
    const sim = await createSim({ seed, mode: 'sumo', map: mapId, variant: 'drift' });
    sim.room.bots.items = false;
    const mode = sim.room.mode;
    const elim = mode.eliminate.bind(mode);
    mode.eliminate = (p, why) => {
      n++;
      if (Math.hypot(p.p[0] - mode.zone.x, p.p[2] - mode.zone.z) - mode.zone.r > 3 * M) far++;
      return elim(p, why);
    };
    sim.run(250);
  }
  check(`${mapId} moving meeting: bots follow the ring through doors (${far}/${n} knocked out far from it)`, n > 0 && far <= n * 0.2);
}

// ------------------------------------------ every standup is reachable
// Bots used to steer for the racing-line point nearest a goal in a straight
// line, wall or no wall: the cellar's Boiler Room zone was reached by 0% of
// them, the Archive by 17%. Park the zone elsewhere, move it, count arrivals.
for (const mapId of MAP_IDS) {
  const sim = await createSim({ seed: 3, mode: 'koth', map: mapId });
  const mode = sim.room.mode;
  sim.room.bots.items = false; // pads are detours; this is about the route
  sim.room.endsAt = Infinity;
  mode.hopAt = Infinity;
  const spots = sim.room.map.KOTH_SPOTS;
  const bad = [];
  for (let i = 0; i < spots.length; i++) {
    mode.spot = (i + 1) % spots.length;
    sim.run(15);
    mode.spot = i;
    const got = new Set();
    sim.run(15, (s) => { for (const b of s.bots) if (Math.hypot(b.p[0] - spots[i].x, b.p[2] - spots[i].z) <= KOTH_RADIUS) got.add(b.id); });
    if (got.size < sim.bots.length * 0.9) bad.push(`#${i} ${got.size}/${sim.bots.length}`);
  }
  check(`${mapId}: bots reach every standup spot within 15 s${bad.length ? ` — short: ${bad.join(', ')}` : ''}`, !bad.length);
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
