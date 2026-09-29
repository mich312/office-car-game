// ---------------------------------------------------------------------------
// THE IT CELLAR — one floor down. Fluorescent tubes (some of them dying),
// painted block walls, pipes along a low ceiling, and everything the company
// stopped looking at: the servers, the helpdesk, the e-waste, the archive.
// Authored in real-world meters, exported in world units, same as the office.
//
// Floor plan (meters, x: -18..18 west→east, z: -11..11 south→north):
//
//   ┌──────────────┬──────────────────┬──────────────┐
//   │ BOILER ROOM  │   SERVER HALL    │   HELPDESK   │
//   │ tanks, coffee│ raised floor,    │ desks, ticket│
//   │ counter      │ rack rows (glass)│ counter      │
//   ├──d───────────┴───────╪──────────┴────────d─────┤
//   │ grid ▸ ▸   CORRIDOR B-1   ╪ crossroads    vend ▐│
//   ├──d─────────┬─────d───┼──────────┬───d──────────┤
//   │ LOADING    │ E-WASTE  │ HARDWARE │   ARCHIVE    │
//   │ DOCK       │ cage,    │ LAB      │ shelf maze   │
//   │ (platform) │ pallets  │ (soccer) │              │
//   └────────────┴──────────┴──────────┴──────────────┘
//
// Desk Dash is a figure-8, the RC-track classic: east down the whole
// corridor, up through the helpdesk and the server hall, then straight back
// ACROSS the corridor at the crossroads into the lab, west through the
// e-waste and the loading dock and up to the grid again. The crossroads sits
// under the worst tube in the building.
// ---------------------------------------------------------------------------
import { M } from '../constants.js';

const u = (v) => v * M;
const H = 2.8; // a basement ceiling: lower than upstairs

const MAP_BOUNDS = { minX: u(-18), maxX: u(18), minZ: u(-11), maxZ: u(11) };
const WALL_HEIGHT = u(H);

const ROOMS = [
  { id: 'boiler', name: 'Boiler Room', x: u(-13), z: u(7), w: u(10), d: u(8), floor: 'concrete' },
  { id: 'server_hall', name: 'Server Hall', x: u(-1), z: u(7), w: u(14), d: u(8), floor: 'dark' },
  { id: 'helpdesk', name: 'Helpdesk', x: u(12), z: u(7), w: u(12), d: u(8), floor: 'carpet' },
  { id: 'loading', name: 'Loading Dock', x: u(-13.5), z: u(-6), w: u(9), d: u(10), floor: 'concrete' },
  { id: 'ewaste', name: 'E-Waste', x: u(-4.5), z: u(-6), w: u(9), d: u(10), floor: 'concrete' },
  { id: 'lab', name: 'Hardware Lab', x: u(4.5), z: u(-6), w: u(9), d: u(10), floor: 'tile' },
  { id: 'archive', name: 'Archive', x: u(13.5), z: u(-6), w: u(9), d: u(10), floor: 'carpet2' },
  { id: 'corridor', name: 'Corridor B-1', x: u(0), z: u(1), w: u(36), d: u(4), floor: 'tile' },
];

const wall = (x, z, w, d, opts = {}) => ({
  x: u(x), z: u(z), w: u(w), d: u(d), h: u(opts.h ?? H), glass: !!opts.glass, low: !!opts.low,
});
const hwall = (z, x1, x2, gaps = [], opts = {}) => {
  const t = opts.glass ? 0.15 : 0.2;
  const pts = [x1, ...gaps.flat(), x2];
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i + 1] - pts[i] > 0.05) out.push(wall((pts[i] + pts[i + 1]) / 2, z, pts[i + 1] - pts[i], t, opts));
  }
  return out;
};
const vwall = (x, z1, z2, gaps = [], opts = {}) => {
  const t = opts.glass ? 0.15 : 0.2;
  const pts = [z1, ...gaps.flat(), z2];
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i + 1] - pts[i] > 0.05) out.push(wall(x, (pts[i] + pts[i + 1]) / 2, t, pts[i + 1] - pts[i], opts));
  }
  return out;
};

const WALLS = [
  // ------------------------------------------------------------- perimeter
  ...hwall(-11, -18.2, 18.2),
  ...hwall(11, -18.2, 18.2),
  ...vwall(-18, -11.2, 11.2),
  ...vwall(18, -11.2, 11.2),
  // ------------------------------------------------ corridor, north side
  ...hwall(3, -18, -8, [[-14.4, -12.6]]), // boiler door
  ...hwall(3, -8, 6, [[0.6, 2.4]], { glass: true }), // server hall glass; the crossroads door
  ...hwall(3, 6, 18, [[14.1, 15.9]]), // helpdesk door
  // ------------------------------------------------ corridor, south side
  ...hwall(-1, -18, -9, [[-14.4, -12.6]]), // loading dock door
  ...hwall(-1, -9, 0, [[-5.4, -3.6]]), // e-waste door
  ...hwall(-1, 0, 9, [[0.6, 2.4]]), // lab door — the crossroads, south half
  ...hwall(-1, 9, 18, [[12.6, 14.4]]), // archive door
  // ------------------------------------------------------ north row
  ...vwall(-8, 3, 11, [[6.1, 7.9]]), // boiler | server hall
  ...vwall(6, 3, 11, [[6.1, 7.9]]), // server hall | helpdesk
  // ------------------------------------------------------ south row
  ...vwall(-9, -11, -1, [[-6.9, -5.1]]), // loading | e-waste
  ...vwall(0, -11, -1, [[-6.9, -5.1]]), // e-waste | lab (a soccer goal)
  ...vwall(9, -11, -1, [[-6.9, -5.1]]), // lab | archive (the other goal)
  // ------------------------------------------------ corridor columns
  wall(-6, 1, 0.45, 0.45), wall(8, 1, 0.45, 0.45),
];

const f = (type, x, z, w, d, h, rotY = 0) => ({ type, x: u(x), z: u(z), w: u(w), d: u(d), h: u(h), rotY });

const FURNITURE = [
  // Boiler room — the tanks, a water heater, the coffee counter by the door
  f('boiler', -11.5, 8, 2.4, 2.4, 2.4),
  f('heater', -16.6, 9.6, 1.3, 1.3, 2.1),
  f('counter', -16.5, 3.55, 2.6, 0.9, 0.92),
  f('shelfrack', -8.45, 9.6, 0.5, 1.8, 1.8),
  f('pallet', -14.2, 5.4, 1.2, 1.0, 0.15),
  // Server hall — two rack rows west, a chicane rack by the east door, UPS
  f('rack', -6.6, 9.3, 0.8, 0.8, 2.2), f('rack', -5.4, 9.3, 0.8, 0.8, 2.2),
  f('rack', -4.2, 9.3, 0.8, 0.8, 2.2), f('rack', -3.0, 9.3, 0.8, 0.8, 2.2),
  f('rack', -1.8, 9.3, 0.8, 0.8, 2.2),
  f('rack', -6.6, 6.7, 0.8, 0.8, 2.2), f('rack', -5.4, 6.7, 0.8, 0.8, 2.2),
  f('rack', -4.2, 6.7, 0.8, 0.8, 2.2), f('rack', -3.0, 6.7, 0.8, 0.8, 2.2),
  f('rack', 3.5, 6.0, 0.8, 0.8, 2.2),
  f('cabinet', 2.4, 10.4, 1.8, 0.8, 1.5),
  // Helpdesk — the ticket counter, two desk pods, the printer
  f('bartop', 11, 5.2, 2.4, 0.6, 1.1),
  f('desk', 9.5, 9.6, 1.6, 0.8, 0.74), f('desk', 9.5, 8.8, 1.6, 0.8, 0.74),
  f('desk', 13.5, 9.6, 1.6, 0.8, 0.74), f('desk', 13.5, 8.8, 1.6, 0.8, 0.74),
  f('copier', 17.3, 9.6, 1, 1.2, 1.25, -Math.PI / 2),
  f('tv', 12, 10.85, 1.8, 0.12, 1.1, Math.PI),
  // Loading dock — the platform along the west wall, pallets, a rack
  f('dock', -16.75, -6.5, 2.5, 8, 0.9),
  f('pallet', -11.5, -9.5, 1.2, 1.0, 0.15),
  f('pallet', -10.6, -3.4, 1.2, 1.0, 0.15),
  f('shelfrack', -12.5, -10.6, 3, 0.6, 1.8),
  // E-waste — the cage, a pallet stack with a ramp, dead kit
  f('cage', -4.5, -6.6, 2, 1.4, 2),
  f('pallet', -6.5, -9, 2.4, 1.2, 0.45),
  f('shelfrack', -8.45, -9.4, 0.5, 2.4, 1.8),
  // Hardware lab — benches along the south wall; the middle is the pitch
  f('workbench', 3, -10.4, 2.4, 0.8, 0.9),
  f('workbench', 6.5, -10.4, 2.4, 0.8, 0.9),
  // Archive — rows of shelving with gaps to thread, filing cabinets
  f('shelfrack', 11, -6.5, 0.5, 5, 2.2),
  f('shelfrack', 13.2, -4.2, 0.5, 4, 2.2),
  f('shelfrack', 13.2, -9.6, 0.5, 2.4, 2.2),
  f('shelfrack', 15.4, -6.9, 0.5, 5, 2.2),
  f('cabinet', 17.45, -3, 0.9, 2.2, 1.3),
  f('cabinet', 17.45, -9.5, 0.9, 2.2, 1.3),
  // Corridor — the vending machine at the end of the long straight
  f('vending', 17.5, 1.9, 1, 0.8, 1.9, -Math.PI / 2),
];

const ramp = (x, z, l, w, rise, rotY) => ({ x: u(x), z: u(z), l: u(l), w: u(w), rise: u(rise), rotY });

const RAMPS = [
  ramp(-14.6, -6, 1.8, 0.7, 0.9, -Math.PI / 2), // up onto the loading dock platform
  ramp(-4.5, -9, 1.6, 0.6, 0.45, -Math.PI / 2), // onto the e-waste pallet stack
  ramp(3, -9, 1.8, 0.6, 0.9, Math.PI), // onto the lab workbench
  ramp(-14.2, 4.4, 1.2, 0.6, 0.15, 0), // a pallet lip by the boiler door
];

const p = (type, x, z, y = 0, rotY = 0) => ({ type, x: u(x), z: u(z), y: u(y), rotY });

const PROPS = [
  // ---- helpdesk: the four desks, chairs, a lamp and a queue of tickets
  p('monitor', 9.5, 9.82, 0.74), p('keyboard', 9.5, 9.46, 0.74),
  p('monitor', 9.5, 8.58, 0.74, Math.PI), p('keyboard', 9.5, 8.94, 0.74),
  p('monitor', 13.5, 9.82, 0.74), p('keyboard', 13.5, 9.46, 0.74),
  p('monitor', 13.5, 8.58, 0.74, Math.PI), p('keyboard', 13.5, 8.94, 0.74),
  p('lamp', 10.1, 9.7, 0.74), p('mug', 13, 8.9, 0.74), p('mug', 11.4, 5.2, 1.1),
  p('chair', 9.5, 10.4, 0, Math.PI), p('chair', 9.5, 7.9), p('chair', 13.5, 10.4, 0, Math.PI), p('chair', 13.5, 7.9),
  p('stack', 10.4, 5.2, 1.1), p('stack', 16.6, 8.4), p('trash', 7, 10.3), p('plant', 17.3, 4),
  // ---- server hall: boxes of cables, a forgotten keyboard
  p('box', -7.3, 4), p('box', -6.6, 4), p('box', -6.95, 4, 0.4), p('keyboard', -0.5, 5), p('roll', 0.5, 9.8), p('roll', -0.3, 10.2),
  p('trash', 5.2, 3.7),
  // ---- boiler room: the coffee corner and junk
  p('mug', -17.2, 3.55, 0.92), p('mug', -16.9, 3.7, 0.92), p('bottle', -15.8, 3.5, 0.92),
  p('box', -9.2, 4.2), p('box', -9.2, 4.9), p('roll', -14.2, 5.4, 0.15), p('roll', -10, 10.3),
  p('stack', -17.2, 7.2), p('trash', -15.2, 3.7), p('pen', -13, 6.2, 0, 0.8),
  // ---- corridor: a mop bucket's worth of mess
  p('trash', -17.4, 2.5), p('plant', 16.8, -0.4), p('bottle', 4.2, 2.6), p('box', 12, -0.5), p('mug', -2.3, 2.5),
  // ---- loading dock: boxes waiting for a courier that never came
  p('box', -17.5, -9, 0.9), p('box', -16.8, -9, 0.9), p('box', -17.15, -9, 1.3), p('box', -16.2, -3.3, 0.9),
  p('box', -11.5, -9.5, 0.15), p('box', -10.9, -9.7, 0.15), p('box', -11.2, -9.6, 0.55),
  p('box', -10.4, -3.2, 0.15), p('trash', -9.6, -10.4), p('roll', -12, -6.8),
  // ---- e-waste: dead monitors and keyboards on the floor, marbles from a desk toy
  p('monitor', -2, -9.4, 0, 0.4), p('monitor', -1.2, -9.8, 0, 2.2), p('monitor', -6.9, -9.1, 0.45, 1.1),
  p('keyboard', -2.8, -8.8, 0, 0.9), p('keyboard', -7.6, -3.2, 0, 2.5), p('keyboard', -0.8, -2.2, 0, 0.3),
  p('box', -8.2, -2.2), p('box', -7.5, -2.2), p('box', -7.85, -2.2, 0.4),
  p('marble', -3.4, -4.3), p('marble', -3.1, -4.6), p('marble', -2.8, -4.2), p('marble', -3.6, -4.8), p('marble', -2.6, -4.7),
  // ---- hardware lab: bench clutter and a lamp
  p('lamp', 6, -10.4, 0.9), p('keyboard', 6.8, -10.4, 0.9), p('mug', 7.4, -10.3, 0.9),
  p('stack', 2.2, -10.4, 0.9), p('pen', 3.6, -10.3, 0.9, 1.3), p('trash', 8.4, -1.6),
  // ---- archive: paper, paper, paper
  p('stack', 12.1, -9.6), p('stack', 14.2, -2), p('stack', 16.5, -8.2), p('stack', 10, -2),
  p('book', 12, -4.6, 0, 0.6), p('book', 14.3, -6.4, 0, 1.9), p('book', 16.4, -4.5, 0, 0.2), p('box', 10, -10.2), p('box', 10.7, -10.2),
];

// Race grid — the corridor's west end, three abreast, facing east.
const SPAWNS = Array.from({ length: 12 }, (_, i) => ({
  x: u(-17.3 + Math.floor(i / 3) * 1.2),
  z: u(0 + (i % 3) * 1.0),
  rotY: Math.PI / 2,
}));

const cp = (x, z) => ({ x: u(x), z: u(z) });

// Desk Dash — the figure-8. Checkpoint 7 is the crossroads: you pass it
// once on the corridor straight (too early to count) and then take it
// properly, crossing the traffic you were part of a lap ago.
const CHECKPOINTS = [
  cp(-11.5, 1), // start/finish, corridor west
  cp(-1.5, 1), // corridor, before the crossroads
  cp(11.5, 1), // corridor east, past the second column
  cp(15, 4.6), // into the helpdesk
  cp(11, 7), // behind the ticket counter
  cp(4.5, 7), // server hall, east door
  cp(1.5, 4.8), // round the chicane rack
  cp(1.5, 1), // THE CROSSROADS
  cp(1.5, -3), // into the lab
  cp(2.2, -6), // hook west at the lab door
  cp(-4.5, -4.9), // e-waste, past the cage
  cp(-10.5, -6), // loading dock
  cp(-13.5, -3.4), // up to the corridor
];

// Bot driving line — every door threaded, round both columns.
const BOT_PATH = [
  cp(-11.5, 1), cp(-8, 0.9), cp(-6, 0.15), cp(-3, 0.8), cp(1.5, 1), cp(5, 1.3), cp(8, 2.1),
  cp(11.5, 1.8), cp(14, 2.2), cp(15, 3.6), cp(14.8, 4.8), cp(13.6, 6.4), cp(11, 7), cp(8, 7),
  cp(6, 7), cp(4.6, 7.1), cp(2.6, 6.8), cp(1.6, 5.2), cp(1.5, 3), cp(1.5, 1), cp(1.5, -1),
  cp(1.5, -3), cp(1.8, -5), cp(1, -6), cp(0, -6), cp(-2, -5.3), cp(-4.5, -5.1), cp(-6.8, -5.4),
  cp(-9, -6), cp(-10.5, -6), cp(-12.4, -4.6), cp(-13.5, -2.6), cp(-13.5, -1), cp(-13, 0.5),
];

const BEAN_SPAWNS = [
  cp(-15, 1.5), cp(-3.5, 2.2), cp(6, 0.2), cp(14, 1.8), cp(-10, 0.2),
  cp(-13, 6.2), cp(-16.5, 7.5), cp(-9.5, 9.8),
  cp(-4.8, 8), cp(-1, 4.6), cp(4.5, 9.2), cp(0.5, 7.2),
  cp(8, 5.5), cp(16.2, 6.5), cp(11.5, 7.2),
  cp(-12, -8), cp(-10.5, -2.2), cp(-15.2, -3.4),
  cp(-2, -3), cp(-6.5, -6.5), cp(-1.5, -7.8),
  cp(4.5, -4), cp(7.5, -7.5), cp(1.5, -8),
  cp(12.1, -2.5), cp(14.3, -8), cp(16.6, -5.2),
];
// the coffee maker lives on the boiler-room counter by the door
const COFFEE_MACHINE = { x: u(-16.5), z: u(3.55), deliverX: u(-16.5), deliverZ: u(4.8), radius: u(1.3) };

const BATTERY_SPAWN = cp(1.5, 1); // the crossroads

// RC Soccer — the hardware lab. The goals are its west and east doorways.
const SOCCER = {
  ballSpawn: { x: u(4.5), z: u(-6), y: u(0.5) },
  ballRadius: u(0.42),
  goals: [
    { team: 0, x: u(0), z: u(-6), dir: 1, width: u(1.8), name: 'E-Waste Goal' },
    { team: 1, x: u(9), z: u(-6), dir: -1, width: u(1.8), name: 'Archive Goal' },
  ],
  arena: { minX: u(0), maxX: u(9), minZ: u(-11), maxZ: u(-1) },
  kickoff: [
    { x: u(2.2), z: u(-5), rotY: Math.PI / 2 }, { x: u(2.2), z: u(-7), rotY: Math.PI / 2 },
    { x: u(1.4), z: u(-6), rotY: Math.PI / 2 }, { x: u(2.2), z: u(-3.4), rotY: Math.PI / 2 },
    { x: u(6.8), z: u(-5), rotY: -Math.PI / 2 }, { x: u(6.8), z: u(-7), rotY: -Math.PI / 2 },
    { x: u(7.6), z: u(-6), rotY: -Math.PI / 2 }, { x: u(6.8), z: u(-3.4), rotY: -Math.PI / 2 },
    { x: u(3.4), z: u(-4.2), rotY: Math.PI / 2 }, { x: u(3.4), z: u(-8), rotY: Math.PI / 2 },
    { x: u(5.6), z: u(-4.2), rotY: -Math.PI / 2 }, { x: u(5.6), z: u(-8), rotY: -Math.PI / 2 },
  ],
};

const KOTH_SPOTS = [
  cp(-9.5, 1), // corridor west
  cp(1.5, 1), // the crossroads
  cp(12.5, 1), // corridor east
  cp(-11.8, 5.2), // boiler room
  cp(-3.5, 4.6), // server hall, cold side
  cp(10.5, 7.1), // helpdesk
  cp(-12, -6.4), // loading dock
  cp(-4.5, -3.2), // e-waste
  cp(4.5, -5.5), // hardware lab
  cp(12.1, -2.4), // archive
];

const SUMO_ZONE = { x: u(1.5), z: u(1), r0: u(21), r1: u(1.5) };

const POWERUP_PADS = [
  cp(-9.8, 2.3), cp(4.5, 0), cp(13, 0.2),
  cp(-13, 9.2), cp(-16.2, 6),
  cp(-4.8, 8), cp(4.6, 9.6),
  cp(16.4, 6), cp(8, 4.6),
  cp(-12, -8.6), cp(-2, -9.2), cp(6.5, -4), cp(10, -8.8), cp(16.6, -1.8),
];

const VENDING = { x: u(17.5), z: u(1.9), radius: u(1.5), minSpeed: 12, cooldownS: 8, goldenChance: 0.3 };
const PRINTER = { x: u(17.3), z: u(9.6), radius: u(5), minIntervalS: 22, maxIntervalS: 42, blindS: 1.4 };

// The cleaning robot patrols Corridor B-1, round both columns.
const ROBOT_PATH = [cp(-15, 0.2), cp(0, 0.2), cp(15, 0.2), cp(15, 2.2), cp(0, 2.2), cp(-15, 2.2)];

export const CELLAR = {
  id: 'cellar',
  name: 'The IT Cellar',
  blurb: 'Basement B-1. Buzzing tubes, humming racks, and one light that never quite decides.',
  theme: 'cellar',
  MAP_BOUNDS, WALL_HEIGHT, ROOMS, WALLS, FURNITURE, RAMPS, PROPS,
  // a 76 m figure-8 against the office's 112 m: three laps make the same race
  RACE_LAPS: 3,
  SPAWNS, REVERSE_SPAWN_ROTY: Math.PI, // the reverse lap leaves south, through the loading dock
  CHECKPOINTS, BOT_PATH, BEAN_SPAWNS, COFFEE_MACHINE, BATTERY_SPAWN, SOCCER,
  KOTH_SPOTS, SUMO_ZONE, POWERUP_PADS, VENDING, PRINTER, ROBOT_PATH,
  // the scoreboard hangs in the helpdesk, where the ticket queue would be
  BOARDS: {
    boards: [{ at: [15.4, 1.6, 10.87], rotY: Math.PI }],
    clock: { at: [17.1, 2.0, 10.87], rotY: Math.PI },
    memos: { at: [7.9, 1.55, 10.88], rotY: Math.PI },
  },
  // oil and coffee on the concrete: [x, z, size] in meters
  STAINS: [[-12, -7, 2.6], [-14, 6.5, 2], [-4, -8.5, 1.8], [2, 1.2, 1.6], [12.5, 6, 1.4], [-16, -2.5, 1.7]],
  // institutional paint: pale green block walls over a dark skirting
  LOOK: {
    wall: '#b4bfb0', skirt: '#4f5953',
    floors: { tile: '#8c978f', concrete: '#77786f', carpet: '#8d97a3', carpet2: '#9a8f9f' },
  },
  // point lights (meters): the tube banks that actually light the floor
  CEILING_LIGHTS: [[-9, 1], [8, 1], [-13, 7], [12, 7], [-13.5, -6], [4.5, -6]],
  // The light (client/src/game/daylight.js reads it). No windows, so no time
  // of day: one state, lit by banks of fluorescent tubes. Cold, a little
  // green, and flat — the light that makes a basement a basement. The key
  // light stands almost straight overhead (where the tubes are) so shadows
  // pool under things instead of raking across.
  LIGHTING: {
    fixed: {
      label: 'Basement B-1',
      clock: '--:--',
      sun: { pos: [22, 210, 30], color: '#e6fff4', intensity: 1.05 },
      amb: { intensity: 0.2, color: '#b8d0c6' },
      hemi: { intensity: 0.36, sky: '#dff5ec', ground: '#2c2a24' },
      ceiling: 16,
      env: {
        intensity: 0.42,
        bg: '#0d1214',
        window: { color: '#1a2226', intensity: 0.2 },
        ceil: { color: '#e4fff3', intensity: 2.6 },
        warm: { color: '#ffb46a', intensity: 0.35 },
        key: { color: '#cfeee2', intensity: 1.1 },
      },
      shaft: { opacity: 0, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
      pool: 0.12,
      panel: 1.6,
      bloom: { intensity: 0.85, threshold: 0.72 },
      shadow: { bias: -0.0002, normalBias: 0.04, opacity: 0.7 },
      practical: 0.8,
      wet: false,
    },
    // the ceiling point lights: colour, reach (m), and the server glow
    points: { color: '#e8fff4', distance: 17 },
    glow: { at: [-4, 8], color: '#3d7bff' },
  },
  // what you hear: no rain on glass down here, only the ballast hum
  AMBIENCE: { rain: false, hum: 1 },

  // ---- dressing (client only; Cellar.jsx) — all in meters
  // the tubes that misbehave: the nearest fixture to each spot
  FLICKER: [
    { at: [1.5, 1], kind: 'dying', light: true }, // the crossroads
    { at: [-4.5, -6], kind: 'dead' },
    { at: [13.5, -8], kind: 'pulse' },
    { at: [-13.5, -3], kind: 'stutter' },
    { at: [-16, 1], kind: 'stutter' },
  ],
  // ceiling runs: from/to [x, z], radius, how far below the ceiling
  PIPES: [
    { from: [-18, 2.62], to: [18, 2.62], r: 0.06, drop: 0.2, mat: 'red' }, // sprinkler main
    { from: [-18, 2.35], to: [18, 2.35], r: 0.04, drop: 0.14, mat: 'grey' },
    { from: [-18, -0.55], to: [18, -0.55], r: 0.11, drop: 0.3, mat: 'lagged' }, // heating flow, lagged
    { from: [-17.6, 10.5], to: [-8.2, 10.5], r: 0.09, drop: 0.25, mat: 'lagged' },
    { from: [-11.5, 10.5], to: [-11.5, 3.4], r: 0.07, drop: 0.45, mat: 'grey' },
    { from: [-17.6, -10.4], to: [17.6, -10.4], r: 0.05, drop: 0.18, mat: 'grey' },
    { from: [9.2, 4.2], to: [17.6, 4.2], r: 0.05, drop: 0.16, mat: 'red' },
  ],
  CABLE_TRAYS: [
    { from: [-7.8, 8], to: [5.8, 8] },
    { from: [-7.8, 5.3], to: [5.8, 5.3] },
  ],
  MARKINGS: {
    // dashed centre line down the corridor: [x1, z, x2]
    centreLines: [[-12, 1, 17]],
    gaps: [[0.4, 2.6], [-6.6, -5.4], [7.4, 8.6]],
    // the box junction at the crossroads: [x, z, w, d]
    junctions: [[1.5, 1, 1.8, 3.8]],
    // hazard stripes: [x, y, z, w, d, rotX] — the dock edge
    hazard: [[-15.66, 0.905, -6.5, 0.28, 8, -Math.PI / 2]],
  },
  // stencils and signs: at [x, y, z] meters, rotY, width in meters
  SIGNS: [
    { text: 'B-1', sub: 'CORRIDOR', at: [-8.5, 1.6, 2.88], rotY: Math.PI, w: 1.1 },
    { text: 'SERVER HALL', sub: 'AUTHORISED STAFF ONLY', at: [-3, 2.1, 2.93], rotY: Math.PI, w: 1.6, bg: '#1d3b6b', fg: '#ffffff' },
    { text: 'HELPDESK', sub: 'TAKE A TICKET. WAIT.', at: [12, 1.9, 2.88], rotY: Math.PI, w: 1.6 },
    { text: 'LOADING DOCK', at: [-10.5, 1.9, -0.88], rotY: 0, w: 1.6, bg: '#e2b623' },
    { text: 'E-WASTE', sub: 'DO NOT STACK MONITORS', at: [-7.5, 1.9, -0.88], rotY: 0, w: 1.4 },
    { text: 'HARDWARE LAB', at: [5.5, 1.9, -0.88], rotY: 0, w: 1.6 },
    { text: 'ARCHIVE', sub: '1998 – 2011', at: [16, 1.9, -0.88], rotY: 0, w: 1.3 },
    { text: 'BOILER ROOM', at: [-16.2, 1.9, 2.88], rotY: Math.PI, w: 1.5, bg: '#7c2f28', fg: '#ffffff' },
    { text: 'EXIT', exit: true, at: [-17.88, 2.35, 1], rotY: Math.PI / 2, w: 0.7 },
    { text: 'EXIT', exit: true, at: [17.88, 2.35, 0.2], rotY: -Math.PI / 2, w: 0.7 },
  ],
};
