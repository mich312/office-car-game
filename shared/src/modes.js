export const MODES = {
  desk_dash: {
    id: 'desk_dash',
    name: 'Desk Dash',
    icon: '🏁',
    desc: 'Race 3 laps through every room of the office. Shortcuts everywhere.',
    laps: 3,
    seconds: 210,
  },
  coffee_run: {
    id: 'coffee_run',
    name: 'Coffee Run',
    icon: '☕',
    desc: 'Collect beans, deliver to the kitchen machine. Bump rivals to make them spill.',
    maxCarry: 5,
    beanScore: 10,
    seconds: 180,
  },
  battery: {
    id: 'battery',
    name: 'Capture the Battery',
    icon: '🔋',
    desc: 'Hold the battery pack to score. Carrying makes you slower. Get hit, drop it.',
    scorePerSecond: 2,
    seconds: 180,
  },
  soccer: {
    id: 'soccer',
    name: 'RC Soccer',
    icon: '⚽',
    desc: 'Smash the giant ping pong ball into the other team’s goal. First to 5 wins.',
    goalScore: 50, // per team member; the scorer gets it twice
    goalCap: 5, // a team reaching this ends the match early
    seconds: 240,
  },
  koth: {
    id: 'koth',
    name: 'Standup Standoff',
    icon: '📍',
    desc: 'The meeting zone moves between rooms. Hold it to score — don’t be late.',
    scorePerSecond: 3,
    hopSeconds: 20, // zone relocates this often
    seconds: 180,
  },
  tag: {
    id: 'tag',
    name: "You're It",
    icon: '🎯',
    desc: 'The tagged car scores while It. Bump them to steal it.',
    scorePerSecond: 3,
    tagCooldownMs: 1500,
    seconds: 180,
  },
  sumo: {
    id: 'sumo',
    name: 'Meeting Room Sumo',
    icon: '🥋',
    desc: 'The safe zone shrinks. Shove rivals out of it. Last car rolling wins the round.',
    roundSeconds: 45,
    outSeconds: 6, // grace timer outside the zone before you're out
    restSeconds: 4, // breather between rounds
    placeScore: 15, // per player you outlasted
    winBonus: 40,
    seconds: 240,
  },
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
