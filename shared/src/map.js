// ---------------------------------------------------------------------------
// THE OFFICE — one handcrafted map, authored in real-world meters and
// exported in world units. Single source of truth for client rendering,
// client physics, server bots, server ball sim and every pickup location.
//
// Floor plan (meters, x: -15..15 west→east, z: -9..9 south→north):
//
//   ┌─railing────────┬─────────── windows (rain) ───────────────┬─────────┐
//   │   BALCONY      │        CORRIDOR / LOUNGE                 │   CEO   │
//   │  (outdoor)     ├───┐                          ┌───────────┤ OFFICE  │
//   ├──glass─────────┤   │                          │  SERVER   ├─────────┤
//   │                │   │        ┌─────────────────┤   ROOM    │
//   │  RECEPTION     │ OPEN       │   PRINTER       ├───────────┴─────────┐
//   │                │ OFFICE     │   ROOM          │      KITCHEN        │
//   │                │            ├────glass────────┤                     │
//   │                │            │  MEETING ROOM   │                     │
//   └────────────────┴────────────┴─────────────────┴─────────────────────┘
// ---------------------------------------------------------------------------
import { M } from './constants.js';

const u = (v) => v * M; // meters → world units

export const MAP_BOUNDS = { minX: u(-15), maxX: u(15), minZ: u(-9), maxZ: u(9) };
export const WALL_HEIGHT = u(3);

// Rooms: minimap regions, floor materials, name labels.
export const ROOMS = [
  { id: 'reception', name: 'Reception', x: u(-12), z: u(-4.5), w: u(6), d: u(9), floor: 'tile' },
  { id: 'open_office', name: 'Open Office', x: u(-3), z: u(-3), w: u(12), d: u(12), floor: 'carpet' },
  { id: 'meeting', name: 'Meeting Room', x: u(6), z: u(-6), w: u(6), d: u(6), floor: 'carpet2' },
  { id: 'kitchen', name: 'Kitchen', x: u(12), z: u(-5.5), w: u(6), d: u(7), floor: 'tile' },
  { id: 'printer', name: 'Printer Room', x: u(6), z: u(-0.5), w: u(6), d: u(5), floor: 'carpet' },
  { id: 'server', name: 'Server Room', x: u(12), z: u(0.5), w: u(6), d: u(5), floor: 'dark' },
  { id: 'corridor', name: 'Lounge', x: u(0), z: u(6), w: u(18), d: u(6), floor: 'wood' },
  { id: 'ceo', name: 'CEO Office', x: u(12), z: u(6), w: u(6), d: u(6), floor: 'wood' },
  { id: 'balcony', name: 'Balcony', x: u(-12), z: u(4.5), w: u(6), d: u(9), floor: 'concrete', outdoor: true },
];

// Walls: axis-aligned boxes {x, z, w, d, h, glass?}. Centers + full sizes, units.
const wall = (x, z, w, d, opts = {}) => ({
  x: u(x), z: u(z), w: u(w), d: u(d), h: u(opts.h ?? 3), glass: !!opts.glass, low: !!opts.low,
});

export const WALLS = [
  // Perimeter
  wall(0, -9, 30.4, 0.2), // south
  wall(15, 0, 0.2, 18.4), // east
  wall(3, 9, 24.4, 0.2, { glass: true }), // north — floor-to-ceiling windows, rain outside
  wall(-15, -4.5, 0.2, 9.4), // west (reception)
  // Balcony railing (low — you CAN get shoved over the edge)
  wall(-15, 4.55, 0.2, 9.1, { h: 0.5, low: true }),
  wall(-12, 9, 6.2, 0.2, { h: 0.5, low: true }),
  // Reception ↔ balcony glass wall (door gap x −12.8..−11.2)
  wall(-13.9, 0, 2.2, 0.15, { glass: true }),
  wall(-10.1, 0, 2.2, 0.15, { glass: true }),
  // Building west wall along corridor, door to balcony (gap z 5.4..7)
  wall(-9, 2.7, 0.15, 5.4, { glass: true }),
  wall(-9, 8, 0.15, 2, { glass: true }),
  // Reception | open office (door gap z −5.3..−3.7)
  wall(-9, -7.15, 0.15, 3.7),
  wall(-9, -1.85, 0.15, 3.7),
  // Open office | meeting room glass (door gap z −6.8..−5.2)
  wall(3, -7.9, 0.15, 2.2, { glass: true }),
  wall(3, -4.1, 0.15, 2.2, { glass: true }),
  // Meeting | kitchen (door gap z −6.5..−4.9)
  wall(9, -7.75, 0.15, 2.5),
  wall(9, -3.95, 0.15, 1.9),
  // Meeting north glass (door gap x 5.2..6.8)
  wall(4.1, -3, 2.2, 0.15, { glass: true }),
  wall(7.9, -3, 2.2, 0.15, { glass: true }),
  // Printer west (door gap z −2..−0.4)
  wall(3, -2.5, 0.15, 1),
  wall(3, 0.8, 0.15, 2.4),
  // Printer | server (door gap z −0.8..0.8)
  wall(9, -1.9, 0.15, 2.2),
  wall(9, 1.4, 0.15, 1.2),
  // Printer north (door gap x 4.6..6.2)
  wall(3.8, 2, 1.6, 0.15),
  wall(7.6, 2, 2.8, 0.15),
  // Kitchen north (door gap x 10..11.6)
  wall(9.5, -2, 1, 0.15),
  wall(13.3, -2, 3.4, 0.15),
  // Server room extras
  wall(9, 2.5, 0.15, 1), // west sliver above printer door
  wall(12.9, 3, 4.2, 0.15), // north (gap x 9..10.8 into CEO/corridor corner)
  // CEO west (door gap z 5.4..7)
  wall(9, 4.2, 0.15, 2.4, { glass: true }),
  wall(9, 8, 0.15, 2, { glass: true }),
  // Open-plan pillars
  wall(-7, 3, 0.4, 0.4),
  wall(-2, 3, 0.4, 0.4),
];

// Big static furniture: type drives the client visuals; box is the collider.
const f = (type, x, z, w, d, h, rotY = 0) => ({ type, x: u(x), z: u(z), w: u(w), d: u(d), h: u(h), rotY });

export const FURNITURE = [
  // Reception
  f('recdesk', -12, -7.2, 2.6, 0.9, 1.05),
  f('sofa', -14.2, -2.8, 0.9, 2.2, 0.75, 0),
  // Open office — six desks, the heart of the map
  f('desk', -6.5, -6, 1.6, 0.8, 0.74),
  f('desk', -6.5, -2.5, 1.6, 0.8, 0.74),
  f('desk', -3, -6, 1.6, 0.8, 0.74),
  f('desk', -3, -2.5, 1.6, 0.8, 0.74),
  f('desk', 0.5, -6, 1.6, 0.8, 0.74),
  f('desk', 0.5, -2.5, 1.6, 0.8, 0.74),
  // Meeting room
  f('table', 6, -6.2, 3, 1.2, 0.74),
  f('whiteboard', 3.4, -8.3, 0.1, 1.6, 1.9),
  // Kitchen
  f('counter', 14.25, -6, 1.4, 5.4, 0.92),
  f('island', 11, -6.2, 2, 1, 0.92),
  f('fridge', 14.4, -2.8, 1, 0.8, 1.9),
  // Printer room
  f('copier', 7.9, -1.9, 1, 1.2, 1.25),
  f('shelfrack', 3.6, 1.2, 0.4, 1.4, 1.8),
  // Server room
  f('rack', 10.5, -0.6, 0.8, 0.8, 2.2),
  f('rack', 11.5, -0.6, 0.8, 0.8, 2.2),
  f('rack', 12.5, -0.6, 0.8, 0.8, 2.2),
  f('rack', 13.5, -0.6, 0.8, 0.8, 2.2),
  f('rack', 10.5, 1.6, 0.8, 0.8, 2.2),
  f('rack', 11.5, 1.6, 0.8, 0.8, 2.2),
  f('rack', 12.5, 1.6, 0.8, 0.8, 2.2),
  f('rack', 13.5, 1.6, 0.8, 0.8, 2.2),
  // CEO office
  f('ceodesk', 12.8, 7, 2.2, 1, 0.78),
  f('bookshelf', 14.55, 5, 0.7, 2.4, 2.2),
  // Lounge / corridor
  f('sofa', -3.5, 8.2, 2.4, 0.95, 0.75),
  f('sofa', 2.5, 8.2, 2.4, 0.95, 0.75),
  f('table', -0.5, 7.8, 1, 0.6, 0.4),
];

// Ramps: rotated planks that let cars climb furniture. rise over length.
const ramp = (x, z, l, w, rise, rotY) => ({ x: u(x), z: u(z), l: u(l), w: u(w), rise: u(rise), rotY });

export const RAMPS = [
  ramp(-3, -1.2, 1.9, 0.55, 0.74, Math.PI), // shelf plank up onto open-office desk (from north)
  ramp(-6.5, -7.3, 1.9, 0.55, 0.74, 0), // second desk ramp (from south)
  ramp(9.9, -6.2, 1.7, 0.6, 0.92, Math.PI / 2), // dustpan onto kitchen island (from west)
  ramp(6, -7.9, 1.8, 0.6, 0.74, 0), // binder ramp onto meeting table
  ramp(-2.2, 8.0, 1.6, 0.6, 0.75, -Math.PI / 2), // clipboard onto lounge sofa
  ramp(12.8, 8.4, 1.7, 0.55, 0.78, Math.PI), // book-stack ramp onto CEO desk
];

// Dynamic props: everything here is a physics body the cars can smash.
const p = (type, x, z, y = 0, rotY = 0) => ({ type, x: u(x), z: u(z), y: u(y), rotY });

export const PROPS = [
  // Office chairs — they spin and roll away beautifully
  p('chair', -6.5, -5.1), p('chair', -6.5, -3.4), p('chair', -3, -5.1),
  p('chair', -3, -3.4), p('chair', 0.5, -5.1), p('chair', 0.5, -3.4),
  p('chair', 5, -5.3), p('chair', 7, -5.3), p('chair', 5, -7.2), p('chair', 7, -7.2),
  p('chair', 12, 6.2), p('chair', -11, -6.2),
  // Mugs — taller than the cars
  p('mug', -4.5, -4.2), p('mug', -1, -7.5), p('mug', -3, -6, 0.74), p('mug', 0.5, -2.5, 0.74),
  p('mug', 6.5, -6.2, 0.74), p('mug', -11.5, -2), p('mug', 12.2, 7, 0.78), p('mug', 1.8, 0.5),
  // Glass cups (they shatter)
  p('glass', 11, -6.2, 0.92), p('glass', 12.5, -5), p('glass', 13, -7.8), p('glass', 10.4, -4.2),
  // Pens — rolling barriers
  p('pen', -5, -6.8, 0, 0.4), p('pen', -2, -4, 0, 1.2), p('pen', 0, -5.5, 0, 2.2),
  p('pen', -7.5, -3.9, 0, 0.8), p('pen', 5.5, -4.5, 0, 0.1), p('pen', -11, -4.5, 0, 1.9),
  p('pen', 0.2, 5, 0, 0.5), p('pen', 12.5, 5, 0, 1.1),
  // Paper stacks — explode into sheets
  p('stack', -5, -2.9), p('stack', 4.2, -0.8), p('stack', 5.2, 0.4), p('stack', 6.6, -0.4),
  p('stack', -12.5, -5.5), p('stack', 13.8, 7.5),
  // Books — little mountains
  p('book', -7.8, -5.5, 0, 0.3), p('book', -0.5, -1, 0, 1.4), p('book', 13.5, 4.2, 0, 0.2),
  p('book', 14, 4.9, 0, 0.5), p('book', 6.8, 1, 0, 2.6), p('book', -6, 5, 0, 0.9),
  p('book', -13, 6.5, 0, 1.8), p('book', 2, -8.2, 0, 0.4),
  // Keyboards — bridges & speed bumps
  p('keyboard', -6.5, -6, 0.74), p('keyboard', -3, -2.5, 0.74), p('keyboard', 0.5, -6, 0.74),
  p('keyboard', -4.8, -7.6, 0, 0.3), p('keyboard', 1.5, -3.8, 0, 1.1), p('keyboard', -10.5, -5.8, 0, 0.7),
  // Monitors — knock them off the desks
  p('monitor', -6.5, -6.25, 0.74), p('monitor', -3, -6.25, 0.74), p('monitor', 0.5, -6.25, 0.74),
  p('monitor', -6.5, -2.25, 0.74, Math.PI), p('monitor', 0.5, -2.25, 0.74, Math.PI),
  p('monitor', 12.8, 7.3, 0.78, Math.PI),
  // Plants — scatter soil everywhere
  p('plant', -14.2, -8.3), p('plant', -9.6, -0.6), p('plant', -6, 8.4), p('plant', 8.2, 8.4),
  p('plant', 14.2, 3.8), p('plant', -13.8, 8.2), p('plant', 3.6, -8.4),
  // Bottles & balls
  p('bottle', 10.2, -7.5, 0, 0.8), p('bottle', 12.8, -3.2, 0, 0.2), p('bottle', -1.5, 6.5, 0, 1.5),
  p('bottle', 6.2, -1.5, 0, 2.1),
  p('basketball', -5.5, 6.5), p('basketball', 4, 6),
  // Marbles — kitchen floor chaos
  p('marble', 11.5, -4.5), p('marble', 12, -4.2), p('marble', 12.4, -4.7), p('marble', 11.2, -5),
  p('marble', 13, -4.4), p('marble', 12.7, -5.2), p('marble', 11.8, -3.8), p('marble', 13.4, -5),
  // Cardboard boxes
  p('box', 4, 1.2), p('box', 4.7, 1.2), p('box', 4.35, 1.2, 0.4), p('box', -13.5, -1.5), p('box', 7.6, 0.9),
  // Desk lamps (wobbly) & trash cans
  p('lamp', -6.5, -5.75, 0.74), p('lamp', 12.3, 6.7, 0.78),
  p('trash', -8.2, -8.3), p('trash', 2.2, -1.5), p('trash', 8.5, -8.5),
];

// Race spawn grid — reception, facing east through the door.
export const SPAWNS = Array.from({ length: 12 }, (_, i) => ({
  x: u(-13.5 + (i % 3) * 1.1),
  z: u(-6.0 + Math.floor(i / 3) * 1.4),
  rotY: Math.PI / 2, // facing +x (east) — car forward is +Z rotated by yaw

}));

// Desk Dash — ordered checkpoints, a full lap touches every room.
const cp = (x, z) => ({ x: u(x), z: u(z) });
export const CHECKPOINTS = [
  cp(-9, -4.5), // reception → open office door
  cp(-3, -6), // open office straight
  cp(3, -6), // meeting room glass door
  cp(7, -6.8), // around the meeting table
  cp(9, -5.7), // meeting → kitchen door
  cp(12.7, -5), // kitchen marble zone
  cp(10.8, -2), // kitchen → server door
  cp(12, 0.5), // server rack slalom
  cp(9.9, 3), // server exit
  cp(12.4, 6), // CEO office
  cp(9, 6.2), // CEO glass door
  cp(0, 6.2), // lounge straight
  cp(-9, 6.2), // balcony door
  cp(-12.2, 3.4), // balcony (in the rain)
  cp(-12, 0), // balcony → reception glass door
  cp(-12, -4.5), // start/finish
];

// Bot driving line — checkpoints with corner easing.
export const BOT_PATH = [
  cp(-12, -4.5), cp(-9, -4.5), cp(-6.7, -4.7), cp(-3, -6.4), cp(0.5, -7), cp(3, -6),
  cp(4.5, -5.6), cp(7, -6.8), cp(9, -5.7), cp(11, -5), cp(12.7, -5), cp(12.4, -3.4),
  cp(10.8, -2), cp(10.7, -0.5), cp(12, 0.5), cp(11, 2), cp(9.9, 3), cp(10.4, 4.6),
  cp(12.4, 6), cp(11, 6.9), cp(9, 6.2), cp(5, 5.6), cp(0, 6.2), cp(-5, 6.6),
  cp(-9, 6.2), cp(-11, 5.4), cp(-12.2, 3.4), cp(-12.3, 1.6), cp(-12, 0), cp(-12.2, -2),
];

// Coffee Run
export const BEAN_SPAWNS = [
  cp(-12, -2.5), cp(-13.5, -6.5), cp(-6.5, -7.8), cp(-1.5, -2), cp(-4.8, -4.3),
  cp(1.8, -7.8), cp(6, -4.2), cp(7.6, -7.8), cp(5.2, -0.2), cp(6.8, 0.9),
  cp(12.4, 1.8), cp(10.4, 0.4), cp(12.4, 4.6), cp(13.4, 8), cp(-2, 5.2),
  cp(4.8, 7.6), cp(-11.5, 7), cp(-13.2, 2), cp(12.4, -7.8), cp(-8, 2),
];
export const COFFEE_MACHINE = { x: u(14.2), z: u(-4), deliverX: u(13.2), deliverZ: u(-4), radius: u(1.3) };

// Capture the Battery
export const BATTERY_SPAWN = cp(6, -0.5);

// RC Soccer — arena is the open office, goals in the doorways.
export const SOCCER = {
  ballSpawn: { x: u(-3), z: u(-3), y: u(0.5) },
  ballRadius: u(0.42), // "huge ping pong ball" — bigger than the cars
  goals: [
    { team: 0, x: u(-8.75), z: u(-4.5), dir: 1, width: u(1.9), name: 'Reception Goal' }, // in reception doorway
    { team: 1, x: u(2.75), z: u(-6), dir: -1, width: u(1.9), name: 'Meeting Goal' }, // in meeting doorway
  ],
  arena: { minX: u(-9), maxX: u(3), minZ: u(-9), maxZ: u(3) },
  kickoff: [
    { x: u(-7), z: u(-3), rotY: Math.PI / 2 }, { x: u(-7), z: u(-5), rotY: Math.PI / 2 },
    { x: u(-7), z: u(-1), rotY: Math.PI / 2 }, { x: u(-7), z: u(-7), rotY: Math.PI / 2 },
    { x: u(1), z: u(-3), rotY: -Math.PI / 2 }, { x: u(1), z: u(-5), rotY: -Math.PI / 2 },
    { x: u(1), z: u(-1), rotY: -Math.PI / 2 }, { x: u(1), z: u(-7), rotY: -Math.PI / 2 },
    { x: u(-5), z: u(-2), rotY: Math.PI / 2 }, { x: u(-5), z: u(-6), rotY: Math.PI / 2 },
    { x: u(-1), z: u(-2), rotY: -Math.PI / 2 }, { x: u(-1), z: u(-6), rotY: -Math.PI / 2 },
  ],
};

// Standup Standoff — floor spots the meeting zone hops between (one per room,
// kept clear of big furniture).
export const KOTH_SPOTS = [
  cp(-12, -4.5), // reception
  cp(-4.8, -4.3), // open office
  cp(5, -5.3), // meeting room floor
  cp(12, -5), // kitchen (marble country)
  cp(5.5, -0.5), // printer room
  cp(0, 6.2), // lounge
  cp(11.5, 6.5), // CEO office
  cp(-12, 4.5), // balcony (bring a towel)
];
export const KOTH_RADIUS = u(2.0);

// Meeting Room Sumo — the ring starts covering most of the office and
// shrinks toward the open-office centre over the round.
export const SUMO_ZONE = { x: u(-3), z: u(-3), r0: u(12), r1: u(1.5) };

// Powerup pads
export const POWERUP_PADS = [
  cp(-12, -2), cp(-6, -7.5), cp(0, -1), cp(6, -8.2), cp(12, -8), cp(6, 0.8),
  cp(12, 1.9), cp(12, 8.2), cp(0, 8.2), cp(-12, 7), cp(-4, -4.9), cp(10.8, -3.2),
];

// The cleaning robot's patrol route (Last Car Standing hazard + ambient menace)
export const ROBOT_PATH = [
  cp(-6, -4.5), cp(0, -6), cp(1, -1), cp(-4, 0), cp(-7, 2), cp(-2, 5), cp(3, 6.5),
  cp(-6, 7), cp(-8.5, 4), cp(-8, -2),
];
