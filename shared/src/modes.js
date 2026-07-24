export const MODES = {
  desk_dash: {
    id: 'desk_dash',
    name: 'Desk Dash',
    icon: '🏁',
    desc: 'Race 3 laps through every room of the office. Shortcuts everywhere.',
    laps: 3,
  },
  coffee_run: {
    id: 'coffee_run',
    name: 'Coffee Run',
    icon: '☕',
    desc: 'Collect beans, deliver to the kitchen machine. Bump rivals to make them spill.',
    maxCarry: 5,
    beanScore: 10,
  },
  battery: {
    id: 'battery',
    name: 'Capture the Battery',
    icon: '🔋',
    desc: 'Hold the battery pack to score. Carrying makes you slower. Get hit, drop it.',
    scorePerSecond: 2,
  },
  soccer: {
    id: 'soccer',
    name: 'RC Soccer',
    icon: '⚽',
    desc: 'Smash the giant ping pong ball into the other team’s goal.',
    goalScore: 50, // per team member; the scorer gets it twice
  },
  last_standing: {
    id: 'last_standing',
    name: 'Last Car Standing',
    icon: '👑',
    desc: 'Facilities locks the office down room by room. Escape closing rooms, dodge the robot, outlive everyone.',
  },
  free_roam: {
    id: 'free_roam',
    name: 'Open Office',
    icon: '🌍',
    desc: 'Open world, no rules. Ten minutes of playground — style points for drifting, air time and mayhem.',
    seconds: 600, // long sessions; the lobby votes again afterwards
    driftPerS: 2,
    airPerS: 1.5,
    bumpScore: 5,
  },
  office_cup: {
    id: 'office_cup',
    name: 'Office Cup',
    icon: '🏆',
    desc: 'Three random modes back-to-back. Cumulative score. Grand ceremony at the end.',
    rounds: 3,
  },
};

// Last Car Standing tuning. Rooms lock on an interval (warned ahead of time);
// lingering in a locked room zaps you after a short grace so near-misses are
// escapable. One refuge room always survives for the final showdown.
export const LCS = {
  FIRST_LOCK_S: 15, // breathing room after GO before the first closure
  LOCK_INTERVAL_S: 16,
  WARN_S: 5, // "closing in 5…" telegraph, mirrors office-event warnings
  ZAP_GRACE_S: 2.5, // seconds inside a locked room before elimination
  SURVIVAL_SCORE_PER_S: 1.5,
  PLACEMENT_SCORE: 40, // × elimination order (dying later pays more)
  WINNER_SCORE: 500,
};

export const MODE_IDS = Object.keys(MODES);

// The cup draws real objective modes — no meta-modes, no sandboxes.
export const CUP_POOL = MODE_IDS.filter((m) => m !== 'office_cup' && m !== 'free_roam');

// Per-car special abilities (Q / touch ⭐). Server enforces the cooldown and
// relays; the physics of each ability runs on the owning client.
export const ABILITIES = {
  buggy: { id: 'pounce', name: 'Pounce', icon: '🐸', desc: 'Dive forward, bounce off whatever you hit.' },
  drift: { id: 'overdrift', name: 'Overdrift', icon: '🌀', desc: '3 s of perfect drift — sparks charge twice as fast.' },
  monster: { id: 'ram', name: 'Ram Mode', icon: '🐏', desc: '2 s unstoppable. Everyone else is a prop.' },
  formula: { id: 'drs', name: 'DRS', icon: '🪽', desc: '3 s of open rear wing — +25% top speed.' },
  balanced: { id: 'copycat', name: 'Company Car', icon: '🪞', desc: 'Copies the last ability anyone used this match.' },
};
export const ABILITY_COOLDOWN_S = 20;
export const ABILITY_FX = { RAM_S: 2, OVERDRIFT_S: 3, DRS_S: 3, DRS_TOP_MULT: 1.25 };

// Mutators: a 30% post-lobby twist on the next round, announced at START.
export const MUTATORS = {
  moon_gravity: { id: 'moon_gravity', name: 'Moon Gravity', icon: '🌙', desc: 'Facilities broke gravity. Everything floats.', gravity: 0.45 },
  giant_ball: { id: 'giant_ball', name: 'Giant Ball', icon: '🎈', desc: 'Someone inflated the ball overnight.', scale: 1.8, soccerOnly: true },
  mug_rain: { id: 'mug_rain', name: 'Mug Rain', icon: '☕', desc: 'The ceiling is raining mugs. Naturally.', intervalS: 3.5 },
  tiny_cars: { id: 'tiny_cars', name: 'Tiny Cars', icon: '🐜', desc: 'Everyone got shrunk in the wash.' },
};
export const MUTATOR_CHANCE = 0.3;

// Office Cup = a rotation of random events; the lobby votes or picks random.
export const OFFICE_EVENTS = [
  { id: 'lights_out', name: 'Lights Out', icon: '🌑', desc: 'Someone hit the master switch. Headlights on!', duration: 14 },
  { id: 'earthquake', name: 'Earthquake', icon: '🫨', desc: 'The whole building shakes. Everything wobbles.', duration: 8 },
  { id: 'paper_storm', name: 'Printer Paper Storm', icon: '📄', desc: 'The printer has opinions. Paper everywhere.', duration: 12 },
  { id: 'ac_wind', name: 'AC Hurricane', icon: '🌀', desc: 'Facilities set the AC to maximum. Hold your line.', duration: 12 },
  { id: 'server_overload', name: 'Server Overload', icon: '🔥', desc: 'The racks scream. Sparks in the server room.', duration: 10 },
  { id: 'cleaning_robot', name: 'Cleaning Crew', icon: '🤖', desc: 'The robot vacuum is on patrol. Do not get eaten.', duration: 20 },
  { id: 'sprinklers', name: 'Sprinkler Test', icon: '💦', desc: 'Mandatory fire drill. The floors are soaked — grip is a memory.', duration: 10 },
];
