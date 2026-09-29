// Desk Dash, the Office Cup and respawning, in real rooms: the headless
// harness (bot-sim.mjs) for whole races, a bare Room on the same virtual
// clock for the cup flow and the respawn policy.
import { createSim } from './bot-sim.mjs';
import { MAPS, MODES, PHASE, raceCheckpoints } from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };

// ------------------------------------------------- finished cars and items
{
  let fired = 0, held = 0, races = 0;
  for (const map of ['office', 'cellar']) {
    for (let seed = 1; seed <= 6; seed++) {
      const sim = await createSim({ seed, mode: 'desk_dash', map });
      const use = sim.room.usePowerup.bind(sim.room);
      sim.room.usePowerup = (p) => { if (p.finished && p.powerup) fired++; use(p); };
      sim.run(200, (s) => { for (const p of s.room.players.values()) if (p.finished && p.powerup) held++; });
      if (sim.room.mode?.finished?.length || sim.room.phase !== PHASE.PLAYING) races++;
    }
  }
  check(`race: finished cars never hold an item (${held} ticks)`, held === 0);
  check(`race: finished cars never fire one (${fired})`, fired === 0);
  check(`race: the races had finishers (${races}/12)`, races >= 10);
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

console.log(fails ? `\n${fails} race check(s) failed` : '\nall race checks passed');
process.exit(fails ? 1 : 0);
