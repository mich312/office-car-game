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

// Office Cup = a rotation of random events; the lobby votes or picks random.
export const OFFICE_EVENTS = [
  { id: 'lights_out', name: 'Lights Out', icon: '🌑', desc: 'Someone hit the master switch. Headlights on!', duration: 14 },
  { id: 'earthquake', name: 'Earthquake', icon: '🫨', desc: 'The whole building shakes. Everything wobbles.', duration: 8 },
  { id: 'paper_storm', name: 'Printer Paper Storm', icon: '📄', desc: 'The printer has opinions. Paper everywhere.', duration: 12 },
  { id: 'ac_wind', name: 'AC Hurricane', icon: '🌀', desc: 'Facilities set the AC to maximum. Hold your line.', duration: 12 },
  { id: 'server_overload', name: 'Server Overload', icon: '🔥', desc: 'The racks scream. Sparks in the server room.', duration: 10 },
  { id: 'cleaning_robot', name: 'Cleaning Crew', icon: '🤖', desc: 'The robot vacuum is on patrol. Do not get eaten.', duration: 20 },
];
