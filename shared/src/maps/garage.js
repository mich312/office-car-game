// ---------------------------------------------------------------------------
// GARAGE ZERO — day 400 of a startup that still lives in the founder's
// double garage and has quietly taken over the house next to it. Warm,
// cluttered, hopeful. The roller door is up and it is sunny outside.
// Authored in real-world meters, exported in world units, same as the office.
//
// Floor plan (meters, x: -20..20 west→east, z: -12..12 south→north; the
// street is south, beyond the picket fence):
//
//   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┬───────────────────────┬──────────────────┐
//     BACKYARD (turf)      │ LIVING ROOM           │ FOUNDER'S ROOM   │
//   │ bbq, paddling pool   ▯ "boardroom": ping-    d mattress, desk,  │
//     ↓ lap turns south    ▯ pong table, sofa, TV  │ burndown         │
//   ├ ─ ─ ─ ─ d ─ ─ ─ ─ ─ ─┼──────d────────────────┼───────d──────────┤
//   │ GARAGE BAY    [car]  │ DEV PIT (soccer)      │LAUNDRY│ KITCHEN  │
//   │ pegboard,      ↓↓↓   goal  door desks,       goal  server d island,   │
//   │ bench, fridge  ↓↓↓   │ whiteboards, neon     │ shelf │ coffee   │
//   ├───────╢ roller door ╟┴──── windows ─────────┴───────┴───d──────┤
//     DRIVEWAY (concrete)  grid ▸ ▸  funbox          │ FRONT LAWN
//     chalk, hose, hoop                              │ stepping stones,
//   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ picket fence ─ ─ ─ ─ ─ ─ ┴ sprinkler ─ ─ ─ ┘
//
// Desk Dash runs anticlockwise: east down the driveway over the skate
// funbox, across the lawn on the stepping stones, in at the front door and
// round the kitchen island, west through the laundry "server room" and the
// Dev Pit (both soccer goals), up through the living room and out the patio
// slider, a sweeping left across the backyard — and then the signature
// moment: straight through the garage's back door, up a plank onto the
// bonnet of the founder's half-covered classic car, over its roof and off
// the boot, out under the open roller door into the sun.
// ---------------------------------------------------------------------------
import { M } from '../constants.js';

const u = (v) => v * M;
const H = 2.7; // a house ceiling; the garage opens up into its trusses

const MAP_BOUNDS = { minX: u(-20), maxX: u(20), minZ: u(-12), maxZ: u(12) };
const WALL_HEIGHT = u(H);

const ROOMS = [
  { id: 'garage_driveway', name: 'Driveway', x: u(-7), z: u(-8), w: u(26), d: u(8), floor: 'concrete', outdoor: true },
  { id: 'garage_lawn', name: 'Front Lawn', x: u(13), z: u(-8), w: u(14), d: u(8), floor: 'carpet2', outdoor: true },
  { id: 'garage_bay', name: 'Garage Bay', x: u(-14), z: u(0.5), w: u(12), d: u(9), floor: 'concrete' },
  { id: 'garage_devpit', name: 'Dev Pit', x: u(-1), z: u(0.5), w: u(14), d: u(9), floor: 'epoxy' },
  { id: 'garage_laundry', name: 'Server Room', x: u(8.5), z: u(0.5), w: u(5), d: u(9), floor: 'rubber' },
  { id: 'garage_kitchen', name: 'Kitchen', x: u(15.5), z: u(0.5), w: u(9), d: u(9), floor: 'tile' },
  { id: 'garage_backyard', name: 'Backyard', x: u(-13), z: u(8.5), w: u(14), d: u(7), floor: 'carpet2', outdoor: true },
  { id: 'garage_living', name: 'Boardroom', x: u(2), z: u(8.5), w: u(16), d: u(7), floor: 'wood' },
  { id: 'garage_founder', name: "Founder's Room", x: u(15), z: u(8.5), w: u(10), d: u(7), floor: 'carpet' },
];

// Walls. Every one is drawn by the theme (themes/garage.jsx WALL_STYLES):
// `garage_wall` is a house wall with a finish on each face — `neg` faces
// −x/−z, `pos` faces +x/+z (house paint, taped garage drywall, the dev
// pit's accent paint, lap siding outside) — and optional windows
// [from, to, sill, head] cut into it (the collider stays the whole box).
// `garage_picket` is the 1 m white picket fence round the yards; its
// collider stands a little taller than the pickets so nothing hops it.
const wall = (x, z, w, d, opts = {}) => ({
  x: u(x), z: u(z), w: u(w), d: u(d), h: u(opts.h ?? H), glass: false, low: false,
  style: opts.style || 'garage_wall', neg: opts.neg || 'house', pos: opts.pos || 'house', win: opts.win || [],
});
// windows are given along the wall in meters; a segment keeps the ones inside it
const cut = (win, a, b) => win.filter(([w0, w1]) => w0 >= a - 0.01 && w1 <= b + 0.01);
const hwall = (z, x1, x2, gaps = [], opts = {}) => {
  const t = opts.t ?? 0.2;
  const pts = [x1, ...gaps.flat(), x2];
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i + 1] - pts[i] > 0.05) {
      out.push(wall((pts[i] + pts[i + 1]) / 2, z, pts[i + 1] - pts[i], t, { ...opts, win: cut(opts.win || [], pts[i], pts[i + 1]) }));
    }
  }
  return out;
};
const vwall = (x, z1, z2, gaps = [], opts = {}) => {
  const t = opts.t ?? 0.2;
  const pts = [z1, ...gaps.flat(), z2];
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i + 1] - pts[i] > 0.05) {
      out.push(wall(x, (pts[i] + pts[i + 1]) / 2, t, pts[i + 1] - pts[i], { ...opts, win: cut(opts.win || [], pts[i], pts[i + 1]) }));
    }
  }
  return out;
};
const FENCE = { style: 'garage_picket', h: 1.3, t: 0.12 };

const WALLS = [
  // ------------------------------------------------------------ the yards
  ...hwall(-12, -20.1, 20.1, [], FENCE), // street side
  ...vwall(-20, -12, -4, [], FENCE), // driveway, west
  ...vwall(20, -12, -4, [], FENCE), // lawn, east
  ...vwall(-20, 5, 12.1, [], FENCE), // backyard, west
  ...hwall(12, -20.1, -6, [], FENCE), // backyard, north
  // ------------------------------------------------- the house, outside
  // the front: garage (roller door x -17..-11), dev pit, laundry, kitchen
  ...hwall(-4, -20.1, -8, [[-17, -11]], { neg: 'siding', pos: 'drywall' }),
  ...hwall(-4, -8, 6, [], { neg: 'siding', pos: 'house', win: [[-6.3, -4.7, 1.1, 2.2], [-3.1, -1.5, 1.1, 2.2], [0.1, 1.7, 1.1, 2.2], [3.4, 5, 1.1, 2.2]] }),
  ...hwall(-4, 6, 11, [], { neg: 'siding', pos: 'house', win: [[8.4, 9.8, 1.25, 2.1]] }),
  ...hwall(-4, 11, 20.1, [[14.6, 16.4]], { neg: 'siding', pos: 'kitchen', win: [[11.9, 13.7, 1.05, 2.1], [17.3, 19.3, 1.15, 2.1]] }),
  // west and east ends
  ...vwall(-20, -4, 5, [], { neg: 'siding', pos: 'drywall', win: [[2.4, 3.6, 1.1, 2.0]] }),
  ...vwall(20, -4, 5, [], { neg: 'kitchen', pos: 'siding', win: [[0.1, 1.9, 1.15, 2.1]] }),
  ...vwall(20, 5, 12.1, [], { neg: 'founder', pos: 'siding', win: [[7.3, 9.1, 0.95, 2.1]] }),
  // the back: garage back door to the yard, the patio slider, north windows
  ...hwall(5, -20, -8, [[-14.9, -13.1]], { neg: 'drywall', pos: 'siding', win: [[-11.6, -10.2, 1.1, 2.0]] }),
  ...hwall(5, -8, -6, [], { neg: 'accent', pos: 'siding' }),
  ...vwall(-6, 5, 12.1, [[7.6, 9.8]], { neg: 'siding', pos: 'house', win: [[9.9, 11.4, 0.05, 2.15]] }),
  ...hwall(12, -6, 10, [], { neg: 'house', pos: 'siding', win: [[-4.2, -2.6, 0.95, 2.1], [5.6, 7.4, 0.95, 2.1]] }),
  ...hwall(12, 10, 20.1, [], { neg: 'founder', pos: 'siding', win: [[16.6, 18.4, 0.95, 2.1]] }),
  // ---------------------------------------------------- inside the house
  ...vwall(-8, -4, 5, [[-0.9, 0.9]], { neg: 'drywall', pos: 'accent' }), // garage | dev pit — a soccer goal
  ...vwall(6, -4, 5, [[-0.9, 0.9]], { neg: 'house', pos: 'house' }), // dev pit | laundry — the other goal
  ...vwall(11, -4, 5, [[1, 2.8]], { neg: 'house', pos: 'kitchen' }), // laundry | kitchen
  ...hwall(5, -6, 6, [[-3.6, -1.8]], { neg: 'accent', pos: 'house' }), // dev pit | living room
  ...hwall(5, 6, 11, [], { neg: 'house', pos: 'house' }), // laundry | living, founder
  ...hwall(5, 11, 20, [[15, 16.8]], { neg: 'kitchen', pos: 'founder' }), // kitchen | founder
  ...vwall(10, 5, 12, [[9.6, 11.4]], { neg: 'house', pos: 'founder' }), // living | founder
];

// w and d are always the world x/z extents (the server's box list ignores
// rotY); a theme piece that faces east or west says so with `face`.
const f = (type, x, z, w, d, h, rotY = 0, extra = {}) => ({ type, x: u(x), z: u(z), w: u(w), d: u(d), h: u(h), rotY, ...extra });
const UNDER = { driveUnder: true };
const DECOR = { decor: true };

const FURNITURE = [
  // ---- Garage bay. The founder's car, parked nose-in the way everyone
  // parks in a garage: boot to the open door, dust cover half pulled off.
  f('garage_classic', -14, -0.3, 1.75, 4.7, 1.4),
  // butcher-block workbench under the pegboard (drive under it) with the
  // 3D printer on it; the red tool chest; the beer fridge by the door
  f('garage_workbench', -19.55, -1.4, 0.7, 2.4, 0.9, 0, { ...UNDER, face: Math.PI / 2 }),
  f('garage_toolchest', -19.62, 1.0, 0.46, 0.7, 1.0, 0, { face: Math.PI / 2 }),
  f('vending', -19.35, -3.45, 1, 0.8, 1.9),
  f('garage_shelf', -18.3, 4.62, 2.6, 0.5, 2.0, Math.PI),
  f('garage_tyres', -16.3, 4.45, 0.65, 0.65, 0.8),
  f('garage_freezer', -8.5, -2.6, 0.7, 1.2, 0.85, 0, { face: -Math.PI / 2 }),
  f('garage_mower', -9.0, 3.9, 0.55, 0.9, 0.45),
  f('garage_bins', -10.1, -4.5, 1.3, 0.7, 1.05), // wheelie bins, outside by the door
  f('garage_driptray', -12.6, 1.95, 0.6, 0.4, 0.04, 0, DECOR), // under the engine's drip
  // ---- Dev Pit: four hollow-core doors on sawhorses along the windows,
  // back to back with nothing; the pitch between them and the whiteboards
  f('garage_doordesk', -5.5, -3.45, 2.0, 0.8, 0.74, 0, UNDER),
  f('garage_doordesk', -3.5, -3.45, 2.0, 0.8, 0.74, 0, UNDER),
  f('garage_doordesk', -1.5, -3.45, 2.0, 0.8, 0.74, 0, UNDER),
  f('garage_doordesk', 0.5, -3.45, 2.0, 0.8, 0.74, 0, UNDER),
  f('garage_minifridge', -7.55, 4.55, 0.55, 0.55, 0.85, Math.PI),
  f('garage_cords', -2.5, -2.55, 8.5, 0.5, 0.03, 0, DECOR), // extension-cord spaghetti
  // ---- Laundry, now the server room: the shelf of old towers and mini-PCs
  // with a box fan blowing on it; washer and dryer by the window
  f('garage_serverrack', 8.5, 4.55, 1.2, 0.45, 1.8, Math.PI),
  f('garage_washer', 6.55, -3.55, 0.65, 0.65, 0.85),
  f('garage_washer', 7.25, -3.55, 0.65, 0.65, 0.85, 0, { dryer: true }),
  f('garage_airer', 9.7, -2.2, 1.2, 0.55, 1.05),
  f('garage_basket', 8.25, -3.55, 0.55, 0.4, 0.32),
  // ---- Kitchen: the island everyone stands at, the coffee counter under
  // the front window, the sink run along the east wall, the fridge
  f('garage_island', 15.2, 0.4, 2.4, 1.0, 0.92),
  f('garage_counter', 18.6, -3.57, 2.6, 0.65, 0.92),
  f('garage_counter', 19.57, 1.2, 0.65, 2.6, 0.92, 0, { sink: true, face: -Math.PI / 2 }),
  f('fridge', 19.5, 3.9, 0.75, 0.7, 1.8),
  f('rug', 15.5, -3.35, 1.2, 0.7, 0.01), // the doormat
  // ---- Living room, the "boardroom": the ping-pong table is the meeting
  // table (drive under it), the old sofa, a coffee table you can ramp onto,
  // the sideboard with the inkjet on it, the TV
  f('garage_pingpong', 4.8, 8.2, 2.74, 1.525, 0.76, 0, UNDER),
  f('sofa', 2.2, 11.45, 2.2, 0.9, 0.8, Math.PI),
  f('garage_coffeetable', 2.2, 10.1, 1.2, 0.6, 0.5),
  f('rug', 2.2, 10.4, 3.2, 2.2, 0.01),
  f('garage_sideboard', -0.4, 11.67, 1.6, 0.45, 0.8, Math.PI),
  f('garage_tvstand', 9.65, 7.2, 0.45, 1.4, 0.55, 0, { face: -Math.PI / 2 }),
  f('garage_lamp', -5.4, 11.45, 0.4, 0.4, 1.6),
  f('garage_guitar', -2.1, 11.55, 0.4, 0.35, 1.3),
  f('garage_dogbed', 8.8, 11.2, 0.8, 0.8, 0.22),
  // ---- Founder's room: mattress on the floor, a door desk, the whiteboard
  f('garage_mattress', 17.8, 10.4, 1.4, 2.0, 0.2),
  f('garage_doordesk', 12.6, 11.45, 2.0, 0.8, 0.74, Math.PI, UNDER),
  f('bookshelf', 19.65, 6.2, 0.5, 1.6, 1.8),
  // ---- Backyard: the barbecue, a paddling pool, the tree inside the turn,
  // a raised veg bed
  f('garage_bbq', -18.9, 11.0, 0.9, 0.6, 1.05),
  f('garage_pool', -17.4, 7.3, 1.9, 1.9, 0.25, 0, DECOR),
  f('garage_tree', -9.2, 6.6, 0.45, 0.45, 5.5),
  f('garage_vegbed', -11.5, 11.35, 3.2, 0.9, 0.35),
  f('garage_patiochair', -7.4, 11.3, 0.8, 0.85, 0.95, Math.PI),
  f('garage_patiochair', -8.6, 11.35, 0.8, 0.85, 0.95, Math.PI + 0.1),
  // ---- Driveway: the skate funbox, the hose; the lawn's tree and mailbox
  f('garage_funbox', -3.5, -8.8, 1.2, 1.2, 0.35),
  f('garage_hose', -8.2, -7.6, 0.2, 8.4, 0.03, 0.18, DECOR),
  f('garage_tree', 18.4, -10.4, 0.5, 0.5, 6.5),
  f('garage_mailbox', 7.6, -11.55, 0.3, 0.3, 1.15),
  f('garage_sprinkler', 11, -9.8, 0.3, 0.3, 0.12, 0, DECOR),
  // box hedges and flowers along the front of the house, either side of the door
  f('garage_shrubs', 10.2, -4.45, 8.4, 0.6, 0.55),
  f('garage_shrubs', 18.3, -4.45, 3.4, 0.6, 0.55),
];

const ramp = (x, z, l, w, rise, rotY, skin) => ({ x: u(x), z: u(z), l: u(l), w: u(w), rise: u(rise), rotY, skin });

const RAMPS = [
  // THE ramp: a plank on paint cans onto the classic car's bonnet, heading
  // south straight at the open roller door. Over the roof, off the boot.
  ramp(-14, 2.87, 1.8, 1.1, 0.78, Math.PI, 'garage_plank'),
  // the skate funbox on the driveway, a ramp each end
  ramp(-4.55, -8.8, 0.9, 1.2, 0.35, Math.PI / 2, 'garage_skate'),
  ramp(-2.45, -8.8, 0.9, 1.2, 0.35, -Math.PI / 2, 'garage_skate'),
  // up onto the desk row from its east end: eight metres of door desk (and
  // everyone's monitors) to run along
  ramp(2.3, -3.45, 1.6, 0.75, 0.74, -Math.PI / 2, 'garage_plank'),
  // a stack of magazines up onto the coffee table, then the sofa
  ramp(1.05, 10.1, 1.1, 0.55, 0.5, Math.PI / 2, 'garage_plank'),
  // the pillow wedge onto the founder's mattress
  ramp(16.65, 10.4, 0.9, 1.1, 0.2, Math.PI / 2, 'garage_pillow'),
];

const p = (type, x, z, y = 0, rotY = 0) => ({ type, x: u(x), z: u(z), y: u(y), rotY });

const PROPS = [
  // ---- dev pit desks: a monitor on an arm, a keyboard and a chair each,
  // and the debris of day 400
  p('garage_monitor', -5.8, -3.7, 0.74), p('garage_monitor', -5.0, -3.72, 0.74, -0.2), p('garage_keyboard', -5.5, -3.25, 0.74),
  p('garage_monitor', -3.5, -3.7, 0.74), p('garage_keyboard', -3.5, -3.25, 0.74),
  p('garage_monitor', -1.8, -3.72, 0.74, 0.15), p('garage_monitor', -1.1, -3.72, 0.74, -0.15), p('garage_keyboard', -1.45, -3.25, 0.74),
  p('garage_monitor', 0.5, -3.7, 0.74), p('garage_keyboard', 0.5, -3.25, 0.74),
  p('garage_chair', -5.5, -2.45, 0, Math.PI + 0.3), p('garage_chair', -3.4, -2.5, 0, Math.PI - 0.2), p('garage_chair', -1.4, -2.4, 0, Math.PI), p('garage_chair', 0.7, -2.5, 0, Math.PI + 0.5),
  p('garage_can', -6.3, -3.3, 0.74), p('garage_can', -4.4, -3.6, 0.74), p('garage_can', -2.3, -3.35, 0.74), p('garage_can', 1.2, -3.5, 0.74),
  p('garage_pizza', -4.5, -3.3, 0.74, 0.3), p('mug', -0.4, -3.3, 0.74), p('mug', -6.1, -3.6, 0.74), p('lamp', 1.3, -3.7, 0.74),
  p('garage_pizza', -7.3, -3.4, 0, 1.1), p('garage_pizza', -7.3, -3.4, 0.05, 0.6), // the stack by the wall
  // ---- dev pit floor: beanbags to bounce off, a bin, boxes of swag
  p('garage_beanbag', -6.4, 3.4), p('garage_beanbag', -5.2, 4.1, 0, 1), p('garage_beanbag', 4.8, 3.9, 0, 2),
  p('trash', 5.4, -3.4), p('box', 3.3, 4.4), p('box', 3.8, 4.5, 0, 0.3), p('box', 3.55, 4.45, 0.34, 0.1),
  // ---- server room: dead towers waiting to be "repurposed"
  p('garage_tower', 9.7, 4.35, 0, 0.1), p('garage_tower', 10.25, 4.2, 0, -0.3), p('garage_tower', 7.1, 4.4, 0, 0.2),
  p('box', 10.4, -3.4), p('bottle', 6.6, -3.5, 0.85), p('trash', 8.2, -3.5),
  // ---- kitchen: pizza on the island, cans everywhere, stools
  p('garage_pizza', 14.6, 0.35, 0.92, 0.2), p('garage_pizza', 15.9, 0.45, 0.92, -0.4),
  p('garage_can', 15.3, 0.2, 0.92), p('garage_can', 14.1, 0.6, 0.92), p('garage_can', 16.3, 0.1, 0.92), p('garage_can', 17.6, -3.55, 0.92),
  p('mug', 18.3, -3.5, 0.92), p('mug', 19.5, 0.5, 0.92), p('bottle', 19.55, 2.0, 0.92), p('bottle', 17.2, -3.6, 0.92),
  p('garage_stool', 14.3, 1.35), p('garage_stool', 15.2, 1.4, 0, 0.4), p('garage_stool', 16.1, 1.3, 0, -0.3),
  p('plant', 11.6, 4.4), p('trash', 12.0, -3.4),
  // ---- founder's room: three screens, a lamp, boxes never unpacked
  p('garage_monitor', 12.0, 11.7, 0.74, Math.PI + 0.25), p('garage_monitor', 12.6, 11.75, 0.74, Math.PI), p('garage_monitor', 13.2, 11.7, 0.74, Math.PI - 0.25),
  p('garage_keyboard', 12.6, 11.25, 0.74, Math.PI), p('garage_chair', 12.6, 10.6), p('lamp', 13.4, 11.4, 0.74), p('garage_can', 11.8, 11.3, 0.74),
  p('box', 19.3, 11.3), p('box', 19.3, 10.7), p('box', 19.3, 11.0, 0.34), p('book', 17.6, 9.8, 0.2, 0.4), p('book', 16.4, 8.3, 0, 1.2),
  p('garage_can', 18.1, 11.0, 0.2),
  // ---- boardroom: mismatched chairs round the ping-pong table, beanbags
  // facing the TV
  p('garage_chair', 3.6, 8.2, 0, Math.PI / 2), p('garage_chair', 6.1, 8.2, 0, -Math.PI / 2), p('garage_chair', 4.4, 7.0), p('garage_chair', 5.3, 9.4, 0, Math.PI),
  p('garage_beanbag', 7.9, 6.3), p('garage_beanbag', 8.2, 8.3, 0, 1.5),
  p('garage_can', 4.2, 8.0, 0.76), p('mug', 5.4, 8.5, 0.76), p('stack', 4.8, 8.1, 0.76), p('pen', 4.4, 8.35, 0.76, 0.7),
  p('glass', 2.0, 10.1, 0.5), p('book', 2.5, 10.0, 0.5, 0.3), p('plant', 9.5, 5.5), p('plant', -5.4, 5.5),
  // ---- garage: paint cans, cones, moving boxes, a skateboard
  p('garage_paintcan', -18.9, 3.9), p('garage_paintcan', -18.6, 4.0), p('garage_paintcan', -18.75, 3.95, 0.2),
  p('garage_cone', -10.4, 1.6), p('garage_cone', -10.6, -1.2),
  p('box', -9.1, 1.4), p('box', -9.1, 2.0), p('box', -9.1, 1.7, 0.34, 0.2), p('box', -17.2, 3.3, 0, 0.3),
  p('garage_skateboard', -11.0, 3.2, 0, 0.6), p('roll', -19.3, 2.2), p('garage_can', -19.5, -1.8, 0.9),
  // ---- driveway: a basketball, slalom cones, another skateboard
  p('basketball', -12.5, -9.8), p('garage_cone', 1.5, -10.2), p('garage_cone', 3, -10.4), p('garage_cone', 4.5, -10.2),
  p('garage_skateboard', -6.5, -10.8, 0, 2.1),
  // ---- lawn and backyard: garden gnomes and plastic flamingos
  p('garage_gnome', 8.2, -5.0), p('garage_gnome', 12.5, -5.1, 0, 0.4), p('garage_gnome', 19.2, -6.5, 0, -1.3),
  p('garage_flamingo', 16.8, -9.5), p('garage_flamingo', 17.4, -10.0, 0, 0.8),
  p('garage_gnome', -19.3, 5.8, 0, 2.4), p('basketball', -15.2, 10.6), p('garage_can', -18.2, 10.8),
];

// Race grid — chalked on the driveway west of the roller door, three
// abreast, facing east down the drive.
const SPAWNS = Array.from({ length: 12 }, (_, i) => ({
  x: u(-15.6 - Math.floor(i / 3) * 1.2),
  z: u(-7.5 - (i % 3) * 1.2),
  rotY: Math.PI / 2,
}));

const cp = (x, z) => ({ x: u(x), z: u(z) });

// Desk Dash — anticlockwise, 16 gates, ~95 m.
const CHECKPOINTS = [
  cp(-9, -8), // start/finish, the chalk line on the driveway
  cp(-1.5, -7.6), // past the funbox
  cp(7.5, -8), // onto the stepping stones
  cp(13.5, -8.2), // the path's corner, through the sprinkler
  cp(15.5, -4), // the front door
  cp(17.8, -1), // east of the island
  cp(15.2, 2.9), // round the back of it
  cp(11, 1.9), // into the server room
  cp(6, 0), // through the laundry goal
  cp(0.5, 2), // across the dev pit
  cp(-2.7, 5), // up into the boardroom
  cp(-4, 8.4), // hook left
  cp(-6, 8.7), // out through the patio slider
  cp(-11, 9), // across the lawn out back
  cp(-14, 5), // the garage back door — line up on the plank
  cp(-14, -4.2), // out under the roller door
];

// Bot driving line. Bots are 2D and know only walls, so their line takes
// the ground-level way round everything a human drives over: east of the
// funbox, east of the car.
const BOT_PATH = [
  cp(-9, -7.4), cp(-5.5, -6.9), cp(-1.5, -7.2), cp(3, -7.6), cp(7.5, -8), cp(11, -8.2), cp(13.3, -8.1),
  cp(15.1, -6.9), cp(15.5, -4), cp(16.4, -2.6), cp(17.7, -1.1), cp(18.0, 1.0), cp(17.2, 2.6), cp(15.2, 3.0),
  cp(12.8, 2.5), cp(11, 1.9), cp(8.5, 1.0), cp(6, 0), cp(3, 0.8), cp(0.5, 2), cp(-2.2, 3.8), cp(-2.7, 5),
  cp(-3.1, 6.8), cp(-4.2, 8.3), cp(-6, 8.7), cp(-8.5, 9.0), cp(-11, 8.9), cp(-13.2, 7.9), cp(-14, 6.3),
  cp(-14, 5), cp(-13.0, 4.1), cp(-12.2, 2.8), cp(-12.2, -2.4), cp(-13.2, -3.5), cp(-14, -4.4), cp(-13, -6),
  cp(-11.2, -7.2),
];

const BEAN_SPAWNS = [
  cp(-12, -6.5), cp(-6.5, -5.5), cp(0, -10.5), cp(4.5, -5.5), cp(-17.5, -5.2),
  cp(9, -6), cp(14.5, -10.8), cp(18.5, -7.5),
  cp(12.8, -1.8), cp(17.6, 3.6),
  cp(8.5, -1.5), cp(9.8, 3.2),
  cp(-6, 1.5), cp(-1, -1.5), cp(3.5, 2.8), cp(-4, 3.8),
  cp(-11, -2.8), cp(-16.8, 1.5), cp(-11.5, 3.9),
  cp(-2, 7), cp(7.5, 10.8), cp(0.5, 8.5),
  cp(12.5, 7), cp(15.5, 11.2),
  cp(-16, 9.5), cp(-8, 10.8),
];

// the coffee machine sits on the counter under the kitchen's front window
const COFFEE_MACHINE = { x: u(18.9), z: u(-3.57), deliverX: u(18.9), deliverZ: u(-2.2), radius: u(1.3) };

const BATTERY_SPAWN = cp(-1, 0.5); // centre spot of the dev pit

// RC Soccer — the Dev Pit, 14 × 9 m. The goals are its doorways: the garage
// (west) and the server room (east). The desks along the windows are the
// only thing on the pitch, and you can drive under them.
const SOCCER = {
  ballSpawn: { x: u(-1), z: u(0.5), y: u(0.5) },
  ballRadius: u(0.42),
  goals: [
    { team: 0, x: u(-8), z: u(0), dir: 1, width: u(1.8), name: 'Garage Goal' },
    { team: 1, x: u(6), z: u(0), dir: -1, width: u(1.8), name: 'Laundry Goal' },
  ],
  arena: { minX: u(-8), maxX: u(6), minZ: u(-4), maxZ: u(5) },
  kickoff: [
    { x: u(-5.5), z: u(1), rotY: Math.PI / 2 }, { x: u(-5.5), z: u(-1), rotY: Math.PI / 2 },
    { x: u(-6.6), z: u(0), rotY: Math.PI / 2 }, { x: u(-5.5), z: u(2.8), rotY: Math.PI / 2 },
    { x: u(3.5), z: u(1), rotY: -Math.PI / 2 }, { x: u(3.5), z: u(-1), rotY: -Math.PI / 2 },
    { x: u(4.6), z: u(0), rotY: -Math.PI / 2 }, { x: u(3.5), z: u(2.8), rotY: -Math.PI / 2 },
    { x: u(-3.5), z: u(2.2), rotY: Math.PI / 2 }, { x: u(-3.5), z: u(-1.4), rotY: Math.PI / 2 },
    { x: u(1.5), z: u(2.2), rotY: -Math.PI / 2 }, { x: u(1.5), z: u(-1.4), rotY: -Math.PI / 2 },
  ],
};

const KOTH_SPOTS = [
  cp(-10.5, -8), // driveway, by the grid
  cp(2, -9.6), // driveway, east
  cp(13.5, -10.2), // the lawn
  cp(13.5, 3), // kitchen, behind the island
  cp(8.5, 0.5), // server room
  cp(-1, 0.5), // dev pit centre spot
  cp(-10.8, 0.5), // garage, by the car
  cp(-2.5, 8.8), // boardroom, west
  cp(7.5, 10.6), // boardroom, by the TV
  cp(14, 7.6), // founder's room
  cp(-12, 9.2), // backyard
  cp(-17.2, 9.8), // backyard, by the barbecue
];

// the sumo ring closes on the driveway, in front of the roller door
const SUMO_ZONE = { x: u(-7), z: u(-8), r0: u(24), r1: u(1.5) };

const POWERUP_PADS = [
  cp(-5.5, -6.6), cp(4, -7.6), cp(11.8, -8.2), cp(-6, -10.6),
  cp(17.9, 0), cp(13.5, 2.9),
  cp(8.5, 1.2), cp(1.5, 1.5),
  cp(-3.6, 7.2), cp(6.8, 6.3), cp(14.5, 8.2),
  cp(-9.6, 9.3), cp(-17, 9),
  cp(-12.2, 0.2),
];

// the drinks fridge in the garage corner (a vending piece: ram it for a can)
const VENDING = { x: u(-19.35), z: u(-3.45), radius: u(1.5), minSpeed: 12, cooldownS: 8, goldenChance: 0.3 };
// the inkjet on the boardroom sideboard
const PRINTER = { x: u(-0.4), z: u(11.6), radius: u(5), minIntervalS: 22, maxIntervalS: 42, blindS: 1.4 };

// The robot vacuum loops the boardroom, round the ping-pong table.
const ROBOT_PATH = [cp(-4.5, 6.4), cp(8.8, 6.4), cp(8.8, 9.3), cp(-1.2, 9.3), cp(-4.5, 9.3)];

// ZONES (world units): the stepping stones are the quick way over the
// turf; the sprinkler keeps a patch of the path wet; an oil drip by the
// car's engine; the paddling pool.
const zone = (x, z, w, d, o) => ({ x: u(x), z: u(z), w: u(w), d: u(d), ...o });
const ZONES = [
  zone(10.6, -8.2, 9.8, 1.1, { top: 1.09 }),
  zone(15.5, -6.1, 1.2, 3.6, { top: 1.09 }),
  zone(11.2, -8.9, 3.6, 2.6, { grip: 0.62 }),
  zone(-12.5, 1.9, 1.0, 0.8, { grip: 0.55 }),
  zone(-17.4, 7.3, 1.7, 1.7, { grip: 0.55, top: 0.72 }),
];

export const GARAGE = {
  id: 'garage',
  name: 'Garage Zero',
  blurb: "Day 400 of a startup in the founder's garage. The door's up, the sun's out, and there's a plank on the car.",
  theme: 'garage',
  MAP_BOUNDS, WALL_HEIGHT, ROOMS, WALLS, FURNITURE, RAMPS, PROPS, ZONES,
  // a ~95 m lap, two laps a race, same as the office
  RACE_LAPS: 2,
  SPAWNS, REVERSE_SPAWN_ROTY: 0.6, // the reverse lap turns straight in through the roller door
  CHECKPOINTS, BOT_PATH, BEAN_SPAWNS, COFFEE_MACHINE, BATTERY_SPAWN, SOCCER,
  KOTH_SPOTS, SUMO_ZONE, POWERUP_PADS, VENDING, PRINTER, ROBOT_PATH,
  // the scoreboard hangs on the dev pit's accent wall, between the doors
  BOARDS: {
    boards: [{ at: [2.0, 1.62, 4.86], rotY: Math.PI }],
    clock: { at: [4.6, 2.1, 4.87], rotY: Math.PI },
    memos: { at: [-0.4, 1.5, 4.88], rotY: Math.PI },
  },
  EVENTS: {
    server_overload: { name: 'Laundry Overload', desc: 'The "server room" is also the laundry. Somebody started a hot wash.', icon: '🧺' },
  },
  // oil and coffee on the concrete and epoxy: [x, z, size] in meters
  STAINS: [[-14, 2.6, 2.4], [-13.2, -1.8, 1.8], [-16.8, -2, 1.6], [-11.5, -6.2, 2.4], [-3, -9.5, 1.8], [-2, 1.8, 1.3], [4.2, -2.4, 1.2]],
  LOOK: {
    // what Office.jsx paints plain walls with (every wall here is styled)
    wall: '#efe8dc', skirt: '#caa874',
    floors: { concrete: '#d2ccc2', carpet2: '#6f9a44', epoxy: '#9aa1a5', tile: '#f2ede4', wood: '#ffffff' },
  },
  // ceiling point lights (meters): LED battens in the garage, the house's
  // own fittings. Seven is the budget.
  CEILING_LIGHTS: [[-13, 0.2], [-1, 0.5], [8.5, 0.5], [15.5, 0.5], [1.5, 8.5], [15, 8.5]],
  // The light (client/src/game/daylight.js reads it). The house faces the
  // street, south, so the sun here swings round the south — through the
  // roller door — rather than through the office's north glass. The roof is
  // real and casts, so inside is lit by the room (ambient, the house's
  // fittings, the practicals) and the sun comes in only where there is a
  // hole: the roller door, the windows, the patio slider. Golden hour is the
  // money shot: a low sun from the south-west laying a slab of orange light
  // across the garage floor up to the car.
  LIGHTING: {
    morning: {
      label: 'Morning',
      clock: '07:40',
      // low and east-south-east: in through the kitchen, long shadows west
      sun: { pos: [175, 52, -70], color: '#ffe2bf', intensity: 2.6 },
      amb: { intensity: 0.42, color: '#c9d6f2' },
      hemi: { intensity: 0.62, sky: '#d6e4ff', ground: '#5a5040' },
      ceiling: 7,
      env: {
        intensity: 0.8,
        bg: '#8aa8d6',
        window: { color: '#dce9ff', intensity: 4.2 },
        ceil: { color: '#fff0d8', intensity: 1.8 },
        warm: { color: '#ffd9a8', intensity: 1.2 },
        key: { color: '#eaf2ff', intensity: 2.2 },
      },
      shaft: { opacity: 0, color: '#dbe8ff', tilt: 0.72, yaw: 0.22, length: 30 },
      pool: 0.05,
      panel: 1.1,
      bloom: { intensity: 0.5, threshold: 0.86 },
      shadow: { bias: -0.0003, normalBias: 0.06, opacity: 0.85 },
      practical: 0.3,
      wet: false,
    },
    afternoon: {
      label: 'Afternoon',
      clock: '14:20',
      // high in the south: short hard shadows, a bright drive
      sun: { pos: [36, 188, -96], color: '#fff6e6', intensity: 3.1 },
      amb: { intensity: 0.5, color: '#dfe6f6' },
      hemi: { intensity: 0.75, sky: '#eaf1ff', ground: '#6a5f48' },
      ceiling: 5,
      env: {
        intensity: 0.95,
        bg: '#8fb0dc',
        window: { color: '#ffffff', intensity: 6 },
        ceil: { color: '#fff6e4', intensity: 2 },
        warm: { color: '#ffe6c4', intensity: 1.5 },
        key: { color: '#ffffff', intensity: 3.4 },
      },
      shaft: { opacity: 0, color: '#fff4dc', tilt: 1.24, yaw: 0.05, length: 20 },
      pool: 0.03,
      panel: 0.9,
      bloom: { intensity: 0.66, threshold: 0.82 },
      shadow: { bias: -0.00015, normalBias: 0.03, opacity: 0.92 },
      practical: 0.15,
      wet: false,
    },
    golden: {
      label: 'Golden hour',
      clock: '19:05',
      // very low in the south-west: straight in under the roller door
      sun: { pos: [-78, 50, -196], color: '#ff9a3c', intensity: 3.6 },
      // warm key, cool fill (see daylight.js on why every light can't be orange)
      amb: { intensity: 0.34, color: '#b9aec0' },
      hemi: { intensity: 0.5, sky: '#aaa6c8', ground: '#5a3a24' },
      ceiling: 7,
      env: {
        intensity: 0.85,
        bg: '#8a6a66',
        window: { color: '#ffb060', intensity: 6.5 },
        ceil: { color: '#d8cfe0', intensity: 1.4 },
        warm: { color: '#ff9c4a', intensity: 2.4 },
        key: { color: '#ffd0a0', intensity: 2.6 },
      },
      shaft: { opacity: 0, color: '#ffb266', tilt: 0.5, yaw: -0.3, length: 38 },
      pool: 0.06,
      panel: 1.1,
      bloom: { intensity: 0.72, threshold: 0.76 },
      shadow: { bias: -0.00035, normalBias: 0.07, opacity: 0.85 },
      practical: 0.55,
      wet: false,
    },
    night: {
      label: 'Night',
      clock: '23:40',
      // a moon; the string lights, the monitors and the neon do the rest
      sun: { pos: [-96, 128, -152], color: '#7f9fff', intensity: 0.45 },
      amb: { intensity: 0.12, color: '#aab6d8' },
      hemi: { intensity: 0.2, sky: '#93a6d8', ground: '#2a2620' },
      ceiling: 11,
      env: {
        intensity: 0.35,
        bg: '#070b16',
        window: { color: '#4c6cb8', intensity: 1.2 },
        ceil: { color: '#ffe8c4', intensity: 2.2 },
        warm: { color: '#ffb46b', intensity: 0.8 },
        key: { color: '#ffffff', intensity: 0.8 },
      },
      shaft: { opacity: 0, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
      pool: 0.3,
      panel: 2.2,
      bloom: { intensity: 0.7, threshold: 0.74 },
      shadow: { bias: -0.0002, normalBias: 0.05, opacity: 0.45 },
      practical: 1,
      wet: false,
    },
    // warm household bulbs; the blue of the server shelf
    points: { color: '#ffe3bd', distance: 9.5 },
    glow: { at: [8.5, 3.9], color: '#3d7bff' },
  },
  // day in the suburbs: no rain on the glass, a little air, the fridge hum
  AMBIENCE: { rain: false, air: 0.25, hum: 0.25 },

  // ---- dressing (client only; themes/garage.jsx) — all in meters
  // door openings: header + casing. along: which axis the opening runs on;
  // head: the top of the opening; neg/pos: the wall's finishes either side
  DOORS: [
    { x: -14, z: -4, along: 'x', w: 6, head: 2.3, kind: 'roller', neg: 'siding', pos: 'drywall' },
    { x: 15.5, z: -4, along: 'x', w: 1.8, head: 2.15, kind: 'front', neg: 'siding', pos: 'kitchen', swing: 1 },
    { x: -8, z: 0, along: 'z', w: 1.8, head: 2.15, kind: 'open', neg: 'drywall', pos: 'accent' },
    { x: 6, z: 0, along: 'z', w: 1.8, head: 2.15, kind: 'open', neg: 'house', pos: 'house' },
    { x: 11, z: 1.9, along: 'z', w: 1.8, head: 2.15, kind: 'door', neg: 'house', pos: 'kitchen', swing: 1 },
    { x: -14, z: 5, along: 'x', w: 1.8, head: 2.15, kind: 'door', neg: 'drywall', pos: 'siding', swing: -1 },
    { x: -2.7, z: 5, along: 'x', w: 1.8, head: 2.15, kind: 'door', neg: 'accent', pos: 'house', swing: 1 },
    { x: 15.9, z: 5, along: 'x', w: 1.8, head: 2.15, kind: 'door', neg: 'kitchen', pos: 'founder', swing: 1 },
    { x: -6, z: 8.7, along: 'z', w: 2.2, head: 2.15, kind: 'slider', neg: 'siding', pos: 'house' },
    { x: 10, z: 10.5, along: 'z', w: 1.8, head: 2.15, kind: 'door', neg: 'house', pos: 'founder', swing: -1 },
  ],
  // Edison string lights: [from [x, y, z], to [x, y, z], sag] in meters
  STRINGS: [
    [[-8, 2.5, -3.2], [6, 2.5, 4.2], 0.35],
    [[-8, 2.5, 4.2], [6, 2.5, -3.2], 0.35],
    [[-6, 2.55, 5.2], [-20, 2.2, 11.8], 0.45], // over the backyard, house to the fence post
    [[-6, 2.55, 11.8], [-13, 2.4, 5.2], 0.4],
    [[-20, 2.55, -3.6], [-8, 2.55, -3.6], 0.2], // along the garage's front wall
  ],
  // wall-mounted things with a canvas face: whiteboards, the kanban, the
  // neon, the pegboard. at [x, y, z] (centre), rotY faces into the room
  BOARDS_ON_WALLS: [
    { kind: 'arch', at: [-7.88, 1.55, 2.9], rotY: Math.PI / 2, w: 2.4, h: 1.2 },
    { kind: 'demo', at: [5.88, 1.55, 3.0], rotY: -Math.PI / 2, w: 2.2, h: 1.1 },
    { kind: 'kanban', at: [-5.2, 1.55, 4.88], rotY: Math.PI, w: 1.6, h: 1.0 },
    { kind: 'burndown', at: [19.88, 1.5, 9.6], rotY: -Math.PI / 2, w: 1.8, h: 1.1 },
    { kind: 'pegboard', at: [-19.88, 1.5, -1.4], rotY: Math.PI / 2, w: 3.6, h: 1.2 },
    { kind: 'hq', at: [-14, 2.48, -4.13], rotY: Math.PI, w: 1.5, h: 0.4 },
  ],
  NEON: { text: 'SHIP IT', at: [-7.87, 2.42, 0], rotY: Math.PI / 2, color: '#ff3d8b', w: 1.4 }, // over the garage goal
  // chalk on the driveway: the grid, a wobbly FINISH, a hopscotch
  CHALK: { finish: [-9, -8, 3.4], hopscotch: [-7.5, -10.8] },
};
