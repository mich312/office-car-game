// Headless match harness: a real Room, full of bots, on a virtual clock.
// No sockets, no timers — tick() is driven by hand and Date.now() reads the
// simulated time, so a 3.5-minute match runs in well under a second and
// every run is reproducible from its seed.
//
//   const sim = await createSim({ seed: 7, mode: 'desk_dash' });
//   sim.run(60);             // 60 simulated seconds
//   sim.room, sim.events     // inspect the room and every broadcast effect
import { TICK_RATE, PHASE } from '../shared/src/index.js';

let clock = 1_700_000_000_000;
const realNow = Date.now;
Date.now = () => clock;
// the Room constructor starts its own tick interval; the sim drives ticks
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
const { Room } = await import('../server/src/room.js');
globalThis.setInterval = realSetInterval;

// mulberry32 — small, fast, good enough to make Math.random repeatable
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function createSim({ seed = 1, mode = 'desk_dash', bots = 6 } = {}) {
  Math.random = seeded(seed);
  const room = new Room();
  const events = [];
  room.broadcast = (msg) => { events.push({ ...msg, at: clock }); };
  room.sendTo = () => {};
  room.sendLobby = () => {};
  room.broadcastSnapshot = () => {};
  room.bots.fillTo(bots);
  room.startCountdown(mode);
  room.mutator = null; // mutators are their own experiment
  const dt = 1 / TICK_RATE;
  const step = () => { clock += dt * 1000; room.tick(dt); };
  while (room.phase !== PHASE.PLAYING) step();
  const sim = {
    room, events, dt,
    now: () => clock,
    get bots() { return [...room.players.values()].filter((p) => p.bot); },
    // advance `seconds` of match time, calling onTick after every tick
    run(seconds, onTick) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n && room.phase === PHASE.PLAYING; i++) {
        step();
        onTick?.(sim);
      }
      return sim;
    },
  };
  return sim;
}

export const restoreClock = () => { Date.now = realNow; };
