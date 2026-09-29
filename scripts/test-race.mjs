// Desk Dash, the Office Cup and respawning, in real rooms: the headless
// harness (bot-sim.mjs) for whole races, a bare Room on the same virtual
// clock for the cup flow and the respawn policy.
import { createSim } from './bot-sim.mjs';
import { MAPS, MODES, PHASE, MSG, M as MU, SPAWN_Y, RESPAWN_PROTECT_COOLDOWN_MS, raceCheckpoints, raceSpawn, groundAt } from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };

// A human over a fake socket, dropped into a running sim (a mid-match
// join). Everything the room sends it lands in ws.msgs.
function human(sim, name = 'Human') {
  const room = sim.room;
  room.sendTo = (pl, obj) => pl.ws?.msgs.push(obj);
  const ws = { readyState: 1, msgs: [], send(d) { ws.msgs.push(JSON.parse(d)); }, on() {}, close() {} };
  room.onMessage(ws, { t: MSG.HELLO, name });
  const me = room.players.get(ws.playerId);
  return {
    me, ws,
    last: (t) => [...ws.msgs].reverse().find((m) => m.t === t),
    // report a grounded pose (the room records it in the car's pose ring)
    at(x, z, y = 0.25) {
      for (let i = 0; i < 3; i++) {
        me.lastPoseAt = 0; me.allowTeleportUntil = Infinity;
        room.onMessage(ws, { t: MSG.STATE, p: [x, y, z], q: [0, 0, 0, 1], v: [0, 0, 0], g: 1 });
      }
    },
    respawn(safe = null) { me.lastRespawnMsg = 0; room.onMessage(ws, { t: MSG.RESPAWN, safe }); return [...ws.msgs].reverse().find((m) => m.t === MSG.RESPAWN_AT); },
  };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ------------------------------------------------- finished cars and items
{
  let fired = 0, held = 0, races = 0, badFinish = 0;
  for (const map of ['office', 'cellar']) {
    for (let seed = 1; seed <= 6; seed++) {
      const sim = await createSim({ seed, mode: 'desk_dash', map });
      const use = sim.room.usePowerup.bind(sim.room);
      sim.room.usePowerup = (p) => { if (p.finished && p.powerup) fired++; use(p); };
      sim.run(200, (s) => { for (const p of s.room.players.values()) if (p.finished && p.powerup) held++; });
      // the HUD's FINISHED chip hears each finisher's place
      const fin = sim.events.filter((e) => e.type === 'race_finish');
      if (fin.length !== sim.bots.filter((b) => b.finished).length || fin.some((e, i) => e.place !== i + 1)) badFinish++;
      if (sim.room.mode?.finished?.length || sim.room.phase !== PHASE.PLAYING) races++;
    }
  }
  check(`race: finished cars never hold an item (${held} ticks)`, held === 0);
  check(`race: finished cars never fire one (${fired})`, fired === 0);
  check(`race: the races had finishers (${races}/12)`, races >= 10);
  check(`race: every finisher is told its place (${badFinish} races wrong)`, badFinish === 0);
}

// ------------------------------------------- bots line up for every round
{
  const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const lined = (room) => [...room.players.values()].filter((p) => p.bot).every((p) => {
    const s = room.startSpot(p);
    const yaw = 2 * Math.atan2(p.q[1], p.q[3]);
    return Math.hypot(p.p[0] - s.x, p.p[2] - s.z) < 0.01 && Math.abs(angle(p.heading - s.rotY)) < 1e-6
      && Math.abs(angle(yaw - s.rotY)) < 1e-6 && p.wp === 0 && p.speed === 0;
  });
  for (const map of ['office', 'cellar']) {
    const sim = await createSim({ seed: 3, mode: 'desk_dash', map });
    const room = sim.room;
    sim.run(30);
    room.startCountdown('soccer');
    check(`${map}: soccer bots start on their own team's kickoff spots`, lined(room)
      && [...room.players.values()].every((p) => room.map.SOCCER.kickoff.some((k) => k.x === p.p[0] && k.z === p.p[2])));
    sim.run(30);
    // an Office Cup rolls the next round straight in, bots and all
    room.startCountdown('desk_dash', 'reverse');
    check(`${map}: the next cup round puts every bot back on the (reverse) grid, facing it`, lined(room));
    const grid = MAPS[map].REVERSE_SPAWN_ROTY;
    check(`${map}: …the reverse grid's heading, not north or west`, [...room.players.values()].every((p) => p.heading === grid));
    room.startCountdown('desk_dash', 'classic');
    check(`${map}: …and the classic grid the round after`, lined(room));
  }
}

// ------------------------ a swapped or unstuck bot picks up where it is
// Legs timed from a Position Swap or a stuck hop to the bot's next
// checkpoint. A normal leg takes ~2 s and never much over 10; a bot that
// kept its old line waypoint drove back to it — a whole lap on the cellar.
for (const map of ['cellar', 'office']) {
  for (const variant of ['classic', 'reverse']) {
    const legs = [];
    for (let seed = 1; seed <= 6; seed++) {
      const sim = await createSim({ seed, mode: 'desk_dash', map, variant });
      const last = new Map(), pending = new Map();
      let seen = 0;
      sim.run(200, (s) => {
        const t = s.now();
        for (const e of s.events.slice(seen)) {
          if (e.type === 'swap') for (const id of [e.a, e.b]) pending.set(id, { t, cp: s.room.players.get(id).nextCp });
        }
        seen = s.events.length;
        for (const b of s.bots) {
          const prev = last.get(b.id);
          if (prev && Math.hypot(b.p[0] - prev[0], b.p[2] - prev[1]) > 4 && !pending.has(b.id)) pending.set(b.id, { t, cp: b.nextCp });
          last.set(b.id, [b.p[0], b.p[2]]);
          const pd = pending.get(b.id);
          if (pd && (b.nextCp !== pd.cp || b.finished)) { legs.push((t - pd.t) / 1000); pending.delete(b.id); }
        }
      });
    }
    const worst = Math.max(0, ...legs);
    check(`${map} ${variant}: after a swap or a stuck hop the next checkpoint comes quickly (${legs.length} legs, worst ${worst.toFixed(1)} s)`,
      legs.length > 0 && worst < 12);
  }
}

// ------------------------------------------------------ the respawn policy
for (const map of ['office', 'cellar']) {
  const M = MAPS[map];
  // Desk Dash: no usable pose → the last checkpoint, facing the next
  for (const variant of ['classic', 'reverse']) {
    const sim = await createSim({ seed: 2, mode: 'desk_dash', map, variant });
    const h = human(sim);
    const w = h.last(MSG.WELCOME);
    check(`${map} ${variant}: a race drop-in starts on the grid, facing the way this race leaves`,
      w.spawn && M.SPAWNS.some((sp) => Math.abs(sp.x - w.spawn.x) < 0.01 && Math.abs(sp.z - w.spawn.z) < 0.01)
      && Math.abs(w.spawn.rotY - Math.round(raceSpawn(0, variant, M).rotY * 100) / 100) < 0.01);
    const cps = raceCheckpoints(variant, M);
    h.me.nextCp = 6; h.me.lap = 0;
    h.at(cps[5].x + 3, cps[5].z);
    const r = h.respawn(null);
    const want = Math.atan2(cps[6].x - cps[5].x, cps[6].z - cps[5].z);
    check(`${map} ${variant}: a race respawn with no pose goes to the last checkpoint, facing the next`,
      dist(r, cps[5]) < 0.02 && Math.abs(r.rotY - Math.round(want * 100) / 100) < 0.02);
    // a pose the server watched on raised furniture keeps its height…
    sim.run(1);
    h.at(cps[5].x, cps[5].z, 3.1);
    const up = h.respawn([cps[5].x, cps[5].z, 0, 3.1]);
    check(`${map} ${variant}: a pose seen on a counter top respawns on it, not inside it (y ${up.y})`, dist(up, cps[5]) < 0.02 && up.y > 3);
    // …and can't be claimed at floor height
    sim.run(1);
    h.at(cps[5].x + 1, cps[5].z, 3.1);
    const low = h.respawn([cps[5].x + 1, cps[5].z, 0, 0.25]);
    check(`${map} ${variant}: …nor proposed at floor height under it`, dist(low, { x: cps[5].x + 1, z: cps[5].z }) > 0.5 || low.y > 3);
  }
  // Capture the Battery: the battery stays where the carrier pressed R, and
  // R again and again renews no protection
  {
    const sim = await createSim({ seed: 3, mode: 'battery', map });
    const h = human(sim);
    const b = sim.room.mode.battery;
    h.at(b.x, b.z); sim.run(0.1);
    check(`${map}: battery grabbed for the respawn check`, h.me.hasBattery);
    const at = { x: h.me.p[0], z: h.me.p[2] };
    h.respawn(null);
    check(`${map}: a battery carrier's respawn leaves the battery where they were`, !h.me.hasBattery && !b.carrier && dist(b, at) < 0.01);
    let protectedT = 0;
    const t0 = sim.now();
    for (let k = 0; k < 30 / 1.4; k++) {
      h.respawn(null);
      sim.run(1.4, (s) => { if (h.me.spawnProtectUntil > s.now()) protectedT += s.dt; });
    }
    const secs = (sim.now() - t0) / 1000;
    check(`${map}: R every 1.4 s is protected ${(100 * protectedT / secs).toFixed(0)}% of the time (not 100%)`,
      protectedT / secs < (2900 / RESPAWN_PROTECT_COOLDOWN_MS) + 0.05);
  }
  // Coffee Run: the beans stay where the car was
  {
    const sim = await createSim({ seed: 4, mode: 'coffee_run', map });
    const h = human(sim);
    const cm = M.COFFEE_MACHINE;
    const far = M.BEAN_SPAWNS.reduce((a, b) => (Math.hypot(b.x - cm.deliverX, b.z - cm.deliverZ) > Math.hypot(a.x - cm.deliverX, a.z - cm.deliverZ) ? b : a));
    h.at(far.x, far.z); h.me.beans = 5;
    const before = sim.room.mode.beans.length;
    h.respawn(null);
    const dropped = sim.room.mode.beans.slice(before);
    check(`${map}: a coffee runner's respawn spills the beans where they were`, h.me.beans === 0 && dropped.length === 5
      // (in the spill ring round that spot: knocked clear of the car, not carried)
      && dropped.every((d) => Math.hypot(d.x - far.x, d.z - far.z) < 3.7));
  }
  // You're It: a respawn is a recovery on the spot, unprotected
  {
    const sim = await createSim({ seed: 5, mode: 'tag', map });
    const h = human(sim);
    sim.room.mode.setIt(h.me);
    const spot = M.KOTH_SPOTS[1];
    h.at(spot.x, spot.z);
    const chaser = sim.bots[0];
    chaser.p = [spot.x + 1.5, 0.24, spot.z];
    const r = h.respawn(null);
    check(`${map}: the It car's respawn stays by the chasers (${dist(r, { x: chaser.p[0], z: chaser.p[2] }).toFixed(1)} u)`,
      dist(r, { x: chaser.p[0], z: chaser.p[2] }) < 5);
    check(`${map}: …with no spawn protection`, r.protect === 0 && !(h.me.spawnProtectUntil > sim.now()));
    sim.run(0.5);
    h.at(spot.x + 4, spot.z);
    const r2 = h.respawn([spot.x + 4, spot.z, 1, 0.25]);
    check(`${map}: …and a pose the server saw is honoured`, dist(r2, { x: spot.x + 4, z: spot.z }) < 0.02);
  }
  // Sumo: recovery on the spot, and no immunity from being shoved out
  {
    const sim = await createSim({ seed: 9, mode: 'sumo', map });
    const h = human(sim);
    sim.run(5); // into the first round
    const z = sim.room.mode.zone;
    h.at(z.x, z.z);
    h.me.sumoDead = false;
    const r = h.respawn(null);
    check(`${map}: a sumo respawn carries no spawn protection`, r.protect === 0 && !(h.me.spawnProtectUntil > sim.now()));
  }
  // Soccer: back to your own kickoff half
  {
    const sim = await createSim({ seed: 6, mode: 'soccer', map });
    const h = human(sim);
    const team = h.me.team;
    const mine = M.SOCCER.kickoff.filter((_, i) => (i < 4 ? 0 : i < 8 ? 1 : i < 10 ? 0 : 1) === team);
    const w = h.last(MSG.WELCOME);
    check(`${map}: a soccer drop-in starts on its team's kickoff spots`, mine.some((k) => dist(k, w.spawn) < 0.01));
    h.at(M.SOCCER.ballSpawn.x, M.SOCCER.ballSpawn.z);
    const r = h.respawn(null);
    check(`${map}: a soccer respawn lands on the team's kickoff spots, facing its way`,
      mine.some((k) => dist(k, r) < 0.01 && Math.abs(Math.round(k.rotY * 100) / 100 - r.rotY) < 0.01));
  }
  // Last Car Standing: never into a locked (or closing) room; late drop-ins watch
  {
    const sim = await createSim({ seed: 7, mode: 'last_standing', map });
    const room = sim.room;
    const spawnRoom = M.roomAt(M.SPAWNS[0].x, M.SPAWNS[0].z).id;
    room.mode.order = [spawnRoom, ...room.mode.order.filter((id) => id !== spawnRoom)];
    const h = human(sim);
    const refuge = M.ROOMS.find((rm) => rm.id === room.mode.order.at(-1));
    let n = 0;
    while (!room.mode.locked.includes(spawnRoom) && n++ < 4000) { h.at(refuge.x, refuge.z); sim.run(0.05); }
    const closed = (pt) => { const rm = M.roomAt(pt.x, pt.z); return !!rm && (room.mode.locked.includes(rm.id) || room.mode.warn?.room === rm.id); };
    let bad = 0;
    for (let k = 0; k < 8; k++) { h.at(refuge.x, refuge.z); if (closed(h.respawn(null))) bad++; }
    check(`${map}: an LCS respawn after the spawn room locks lands in an open room (${bad}/8 closed)`, room.mode.locked.includes(spawnRoom) && bad === 0);
    // …but a car already in the closed room is not lifted out of it: R (or
    // a client proposing no pose) was a free escape from the zap
    const inside = M.SPAWNS[0];
    h.at(inside.x, inside.z);
    h.me.lastProtectAt = -Infinity;
    const out = h.respawn(null);
    check(`${map}: an LCS respawn inside a locked room recovers on the spot (${dist(out, inside).toFixed(1)} u away)`, dist(out, inside) < 0.5 && closed(out));
    const late = human(sim, 'Late');
    const lw = late.last(MSG.WELCOME);
    check(`${map}: a drop-in after the first closure spectates`, lw.spectating === true && late.me.eliminated && !lw.spawn);
  }
  {
    const sim = await createSim({ seed: 8, mode: 'last_standing', map });
    const early = human(sim, 'Early');
    check(`${map}: an LCS drop-in before anyone is out plays`, !early.me.eliminated && early.last(MSG.WELCOME).spawn);
    const h = human(sim, 'Quitter');
    sim.room.mode.eliminate(h.me, 'test');
    sim.room.removePlayer(h.me.id);
    const again = human(sim, 'Quitter');
    check(`${map}: an eliminated player who reloads comes back as a ghost`, again.me.eliminated && sim.room.mode.alive().every((p) => p !== again.me));
  }
}

// ------------------------------------- a new floor, before the client says so
// Quick play changes the map every round; a slow client reports its new spot
// seconds after START, and the server judged it at the last map's
// coordinates meanwhile (office -> cellar: out of the sumo ring before GO)
{
  const sim = await createSim({ seed: 2, mode: 'desk_dash', map: 'office' });
  const room = sim.room;
  const h = human(sim, 'Slow');
  h.me.p = [-88, 0.24, -36]; // where it was driving on the office
  room.setMap('cellar');
  room.startCountdown('sumo', 'classic');
  const s = room.startSpot(h.me);
  check('new map: START puts a human on its start spot server-side too', Math.hypot(h.me.p[0] - s.x, h.me.p[2] - s.z) < 0.01);
  while (room.phase !== PHASE.PLAYING) sim.step();
  sim.run(6);
  check('new map: …so a slow client is not knocked out of the sumo ring before it reports', !h.me.sumoDead);
}

// ---------------------------------------- what a drop-in has to be told
{
  const sim = await createSim({ seed: 4, mode: 'koth', map: 'office' });
  const room = sim.room;
  room.nextEventAt = sim.now(); // an event right now
  sim.run(4);
  const pad = room.pads[0];
  pad.readyAt = sim.now() + 5000; // somebody just took this pad
  const h = human(sim, 'Late');
  const w = h.last(MSG.WELCOME);
  check('drop-in: WELCOME carries the server clock', Math.abs(w.now - sim.now()) < 1);
  check(`drop-in: …the office event already running (${w.event?.id}, ${w.event?.left} ms left)`,
    !!room.event && w.event?.id === room.event.id && w.event.left > 0 && w.event.left <= w.event.duration * 1000 && !!w.event.name);
  check('drop-in: …and the pads already taken', w.pads.some(([i, until]) => i === pad.i && until === pad.readyAt));
}

// ------------------------------- nobody keeps It or the battery on a desk
// Bots can't climb: a human parked on the garage desk row (0.74 m up the
// plank ramp) kept It / the battery for the whole minute, a bot under the
// desk 90 % of the time
for (const mode of ['tag', 'battery']) {
  const sim = await createSim({ seed: 3, mode, map: 'garage' });
  const room = sim.room;
  const h = human(sim, 'Percher');
  const x = -1.5 * MU, z = -3.5 * MU; // metres → units
  const y = groundAt(room.map, x, z, 10) + 0.24;
  const sit = () => { h.me.allowTeleportUntil = Infinity; room.onMessage(h.ws, { t: MSG.STATE, p: [x, y, z], q: [0, 0, 0, 1], v: [0, 0, 0], g: 1 }); };
  sit();
  if (mode === 'tag') room.mode.setIt(h.me);
  else Object.assign(room.mode.battery, { carrier: h.me.id, grabbedAt: sim.now() }), h.me.hasBattery = true;
  let kept = 0, fell = null;
  sim.run(8, (s) => {
    sit();
    if (mode === 'tag' ? s.room.mode.it === h.me.id : s.room.mode.battery.carrier === h.me.id) kept++;
    else if (!fell && mode === 'battery') fell = { ...s.room.mode.battery };
  });
  check(`garage ${mode}: held up on a desk, it doesn't stay (${(kept * sim.dt).toFixed(1)} s of 8)`, kept * sim.dt < 6);
  if (mode === 'battery') {
    check('garage battery: …it slides off onto the floor beside the desk', !!fell && !fell.carrier && fell.y === 0
      && groundAt(room.map, fell.x, fell.z, 10) === 0 && Math.hypot(fell.x - x, fell.z - z) < 12);
  }
}

// ------------------------------------------------------------ Office Cup
for (const map of ['office', 'cellar']) {
  for (const seed of [1, 3]) {
    const sim = await createSim({ seed, mode: 'desk_dash', map });
    const room = sim.room;
    const h = human(sim);
    // vote the cup in (and stay on this map), then let the room run it
    for (const id of room.players.keys()) { room.votes.set(id, 'office_cup'); room.mapVotes.set(id, map); }
    room.startCountdown();
    const ends = [];
    let welcome = null;
    for (let n = 0; n < 20 * 60 * 20 && room.phase !== PHASE.LOBBY; n++) {
      const was = room.phase;
      sim.step();
      if (was === PHASE.PLAYING && room.phase === PHASE.PODIUM) ends.push(sim.events.filter((e) => e.t === MSG.MATCH_END).at(-1));
      if (!welcome && room.cup?.round === 1 && room.phase === PHASE.PLAYING) welcome = human(sim, 'Latecomer').last(MSG.WELCOME);
    }
    const tag = `${map} cup s${seed}`;
    check(`${tag}: three rounds, the last one final`, ends.length === 3 && ends[2].cup.final && !ends[0].cup.final);
    check(`${tag}: a mid-cup drop-in hears which round it is`, welcome?.cup?.round === 2 && welcome.cup.total === MODES.office_cup.rounds);
    const fin = ends[2].cup.standings;
    // every round pays 10-8-6-5-4-3-2-1 by place, ties sharing the better place
    const roundOk = ends.every((e) => {
      const byId = new Map(e.cup.standings.map((s) => [s.id, s.roundPts]));
      return e.podium.every((p) => {
        const first = e.podium.findIndex((q) => q.score === p.score);
        return byId.get(p.id) === ([10, 8, 6, 5, 4, 3, 2, 1][first] ?? 0);
      });
    });
    check(`${tag}: each round pays placement points, not raw score`, roundOk);
    check(`${tag}: the standings are sorted and numbered`, fin.every((s, i) => s.place === i + 1 && (i === 0 || fin[i - 1].score >= s.score)));
    check(`${tag}: cup rows carry what the podium plaques draw (car, paint)`, fin.every((s) => 'car' in s && 'paint' in s));
    const feed = sim.events.filter((e) => e.t === MSG.FEED && /wins the OFFICE CUP/.test(e.text)).at(-1);
    check(`${tag}: the feed crowns the cup leader`, !!feed && feed.text.includes(fin[0].name) && feed.text.includes(`${fin[0].score} points`));
    const h3 = fin.find((s) => s.id === h.me.id);
    check(`${tag}: the human's row is in the final standings (place ${h3?.place})`, !!h3);
  }
}

console.log(fails ? `\n${fails} race check(s) failed` : '\nall race checks passed');
process.exit(fails ? 1 : 0);
