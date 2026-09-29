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

console.log(fails ? `\n${fails} race check(s) failed` : '\nall race checks passed');
process.exit(fails ? 1 : 0);
