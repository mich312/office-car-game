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

console.log(fails ? `\n${fails} race check(s) failed` : '\nall race checks passed');
process.exit(fails ? 1 : 0);
