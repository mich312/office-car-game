// ---------------------------------------------------------------------------
// THE OFFICE v2 — one handcrafted floor, authored in real-world meters and
// exported in world units. Single source of truth for client rendering,
// client physics, server bots, server ball sim and every pickup location.
//
// Floor plan (meters, x: -21..21 west→east, z: -12..12 south→north):
//
//   ┌─railing──┬──────────────── windows (rain, skyline) ───────────────────┐
//   │          │              LOUNGE  (wood, sofas, bar)          ├─────────┤
//   │ BALCONY  ├─glass─┬─────┬──────────────────┬────────┬─glass─┤   CEO   │
//   │ terrace  │ FOCUS │     │                  │ SERVER │       │  SUITE  │
//   │ planters │ BOOTHS│     │   OPEN OFFICE    │  ROOM  │       ├─────────┤
//   ├──glass───┼───────┤     │  (desk pods,     ├────────┤       │ MEETING │
//   │          │ BATH- │     │   rugs, ramps)   │PRINTER │       │  ROOM   │
//   │RECEPTION │ ROOM  │     │                  │  NOOK  │       ├─────────┤
//   │ big desk ├───────┤     ├──────────────────┴────────┤       │  GAMES  │
//   │ waiting  │STORAGE│     │   CAFETERIA (tile, kitchen bar,   │  CORNER │
//   │ area     │ boxes │     │    coffee machine, vending)       │ hoop 🏀 │
//   └──────────┴───────┴─────┴───────────────────────────────────┴─────────┘
// ---------------------------------------------------------------------------
import { M } from '../constants.js';

const u = (v) => v * M; // meters → world units

export const MAP_BOUNDS = { minX: u(-21), maxX: u(21), minZ: u(-12), maxZ: u(12) };
export const WALL_HEIGHT = u(3);

// Rooms tile the floor plan: minimap regions, floor materials, name labels,
// lockdown zones (Last Car Standing) and the roomAt() lookup below.
export const ROOMS = [
  { id: 'reception', name: 'Reception', x: u(-17.5), z: u(-6.5), w: u(7), d: u(11), floor: 'tile' },
  { id: 'storage', name: 'Storage', x: u(-11), z: u(-8), w: u(6), d: u(8), floor: 'concrete' },
  { id: 'bathroom', name: 'Bathroom', x: u(-11), z: u(-1.5), w: u(6), d: u(5), floor: 'tile' },
  { id: 'focus', name: 'Focus Booths', x: u(-11), z: u(4), w: u(6), d: u(6), floor: 'carpet2' },
  { id: 'open_office', name: 'Open Office', x: u(-1), z: u(1.5), w: u(14), d: u(11), floor: 'carpet' },
  { id: 'server', name: 'Server Room', x: u(9.5), z: u(4.5), w: u(7), d: u(5), floor: 'dark' },
  { id: 'printer', name: 'Printer Nook', x: u(9.5), z: u(-1), w: u(7), d: u(6), floor: 'carpet' },
  { id: 'cafeteria', name: 'Cafeteria', x: u(2.5), z: u(-8), w: u(21), d: u(8), floor: 'tile' },
  { id: 'games', name: 'Games Corner', x: u(17), z: u(-7), w: u(8), d: u(10), floor: 'wood' },
  { id: 'meeting', name: 'Meeting Room', x: u(17), z: u(1.5), w: u(8), d: u(7), floor: 'carpet2' },
  { id: 'ceo', name: 'CEO Suite', x: u(17), z: u(8.5), w: u(8), d: u(7), floor: 'wood' },
  { id: 'lounge', name: 'Lounge', x: u(-0.5), z: u(9.5), w: u(27), d: u(5), floor: 'wood' },
  { id: 'balcony', name: 'Balcony', x: u(-17.5), z: u(5.5), w: u(7), d: u(13), floor: 'concrete', outdoor: true },
];

// Which room contains a world point? Rooms tile the floor plan, so this is a
// rect lookup; doorway centerlines resolve to whichever room lists first.
// Used by Last Car Standing (server zaps, bots flee, client tints) and HUD.
export function roomAt(x, z) {
  for (const r of ROOMS) {
    if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return r;
  }
  return null;
}

// Walls: axis-aligned boxes {x, z, w, d, h, glass?}. Centers + full sizes, units.
const wall = (x, z, w, d, opts = {}) => ({
  x: u(x), z: u(z), w: u(w), d: u(d), h: u(opts.h ?? 3), glass: !!opts.glass, low: !!opts.low,
});

// Wall runs with door gaps — far less error-prone than hand-placing two
// segments per doorway. `gaps` are sorted [from, to] pairs along the run.
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

export const WALLS = [
  // ------------------------------------------------------------- perimeter
  ...hwall(-12, -21.2, 21.2), // south
  ...vwall(21, -12.2, 12.2), // east
  ...hwall(12, -14, 21.2, [], { glass: true }), // north — floor-to-ceiling windows
  ...hwall(12, -21.2, -14, [], { h: 0.5, low: true }), // balcony north railing
  ...vwall(-21, -12.2, -1), // west (reception)
  ...vwall(-21, -1, 12.2, [], { h: 0.5, low: true }), // balcony west railing (shove-able!)
  // ------------------------------------------------------- west wing
  // reception | balcony (glass, terrace door)
  ...hwall(-1, -21, -14, [[-18.4, -16.6]], { glass: true }),
  // reception | storage + bathroom (doors to both)
  ...vwall(-14, -12, -1, [[-8.9, -7.1], [-3.3, -1.7]]),
  // balcony | bathroom (solid — privacy, please)
  ...vwall(-14, -1, 1),
  // balcony | focus (glass, terrace door)
  ...vwall(-14, 1, 7, [[3.1, 4.9]], { glass: true }),
  // balcony | lounge (glass, terrace door)
  ...vwall(-14, 7, 12, [[8.6, 10.4]], { glass: true }),
  // storage | bathroom
  ...hwall(-4, -14, -8, [[-11.9, -10.1]]),
  // bathroom | focus
  ...hwall(1, -14, -8, [[-10.4, -8.6]]),
  // focus | lounge (glass)
  ...hwall(7, -14, -8, [[-12.4, -10.6]], { glass: true }),
  // storage | cafeteria
  ...vwall(-8, -12, -4, [[-9.4, -7.6]]),
  // bathroom | open office
  ...vwall(-8, -4, 1, [[-2.4, -0.6]]),
  // focus | open office (glass)
  ...vwall(-8, 1, 7, [[3.1, 4.9]], { glass: true }),
  // ------------------------------------------------------- center
  // open office | lounge (glass, TWO doors — main racing artery)
  ...hwall(7, -8, 6, [[-4.4, -2.6], [1.6, 3.4]], { glass: true }),
  // open office | cafeteria (two doors)
  ...hwall(-4, -8, 6, [[-5.4, -3.6], [2.6, 4.4]]),
  // open office | printer nook (glass door)
  ...vwall(6, -4, 2, [[-1.4, 0.4]], { glass: true }),
  // open office | server room
  ...vwall(6, 2, 7, [[3.7, 5.3]]),
  // server | printer
  ...hwall(2, 6, 13, [[8.6, 10.4]]),
  // server | lounge
  ...hwall(7, 6, 13, [[10.6, 12.4]]),
  // printer | cafeteria
  ...hwall(-4, 6, 13, [[8.8, 10.6]]),
  // ------------------------------------------------------- east wing
  // cafeteria+printer | games (door), printer | meeting (door), server side
  ...vwall(13, -12, -2, [[-8.4, -6.6]]),
  ...vwall(13, -2, 2, [[-0.9, 0.9]]),
  ...vwall(13, 2, 7),
  // lounge | ceo (glass door)
  ...vwall(13, 7, 12, [[8.8, 10.6]], { glass: true }),
  // games | meeting
  ...hwall(-2, 13, 21, [[18.2, 20]]),
  // meeting | ceo (glass door)
  ...hwall(5, 13, 21, [[16.1, 17.9]], { glass: true }),
  // ------------------------------------------------------- pillars
  wall(-4.5, 1.5, 0.45, 0.45), wall(2.5, 1.5, 0.45, 0.45), // open office
  wall(-2, -8, 0.45, 0.45), wall(7, -8, 0.45, 0.45), // cafeteria
  wall(-7, 9.5, 0.4, 0.4), wall(6, 9.5, 0.4, 0.4), // lounge
];

// Big static furniture: type drives the client visuals; box is the collider.
// Decor types (map.js DECOR_TYPES) have no collider, and the server-side
// soccer sim skips them too.
// The rotY contract: w and d are the piece's OWN width and depth, its front
// is local +z, and rotY turns it (π/2 faces east, −π/2 west, π south). The
// renderer, the physics and the server's ball boxes all read it that way.
const f = (type, x, z, w, d, h, rotY = 0) => ({ type, x: u(x), z: u(z), w: u(w), d: u(d), h: u(h), rotY });

export const FURNITURE = [
  // Reception — big desk, waiting corner
  f('recdesk', -17.5, -10.7, 3.2, 1, 1.05),
  // the sofa backs onto the west wall, north of the grid's last row
  f('sofa', -20.3, -3.6, 2.4, 0.95, 0.75, Math.PI / 2),
  f('table', -19, -3.6, 1, 0.6, 0.4, Math.PI / 2),
  f('rug', -19, -5, 3.2, 3.6, 0.01),
  f('art', -14.12, -5.2, 1.5, 0.1, 1.2, -Math.PI / 2), // on the storage wall, not floating off the glass
  // Storage — shelf racks, a box fort grows from props
  f('shelfrack', -13.55, -6, 0.5, 1.8, 1.8),
  f('shelfrack', -13.55, -10.3, 0.5, 1.8, 1.8),
  f('shelfrack', -8.45, -10.8, 0.5, 1.8, 1.8),
  // Bathroom — the comedy suite
  f('sink', -11, 0.46, 2.6, 0.85, 0.85, Math.PI), // basins face into the room
  f('toilet', -12.9, -3.45, 0.7, 0.9, 0.8),
  f('toilet', -11.4, -3.45, 0.7, 0.9, 0.8),
  f('stall', -12.15, -3.2, 0.08, 1.4, 1.5),
  f('stall', -10.65, -3.2, 0.08, 1.4, 1.5),
  // Focus booths — four pods, drive the slalom
  f('booth', -12.8, 2.3, 1.6, 1.6, 1.5),
  f('booth', -9.2, 2.3, 1.6, 1.6, 1.5, Math.PI),
  f('booth', -12.8, 5.7, 1.6, 1.6, 1.5),
  f('booth', -9.2, 5.7, 1.6, 1.6, 1.5, Math.PI),
  // Open office — four pods of two desks facing each other, rugs underneath
  f('rug', -4.5, -1, 3.4, 3, 0.01),
  f('rug', 2.5, -1, 3.4, 3, 0.01),
  f('rug', -4.5, 4, 3.4, 3, 0.01),
  f('rug', 2.5, 4, 3.4, 3, 0.01),
  f('desk', -4.5, -1.45, 1.6, 0.8, 0.74), f('desk', -4.5, -0.55, 1.6, 0.8, 0.74),
  f('desk', 2.5, -1.45, 1.6, 0.8, 0.74), f('desk', 2.5, -0.55, 1.6, 0.8, 0.74),
  f('desk', -4.5, 3.55, 1.6, 0.8, 0.74), f('desk', -4.5, 4.45, 1.6, 0.8, 0.74),
  f('desk', 2.5, 3.55, 1.6, 0.8, 0.74), f('desk', 2.5, 4.45, 1.6, 0.8, 0.74),
  f('art', -7.85, -3.2, 1.4, 0.1, 1.2, Math.PI / 2), // beside the bathroom door, not over it
  // Server room — offset rack rows make a slalom
  f('rack', 7.5, 3.3, 0.8, 0.8, 2.2), f('rack', 8.7, 3.3, 0.8, 0.8, 2.2),
  f('rack', 9.9, 3.3, 0.8, 0.8, 2.2), f('rack', 11.1, 3.3, 0.8, 0.8, 2.2),
  f('rack', 8.1, 5.7, 0.8, 0.8, 2.2), f('rack', 9.3, 5.7, 0.8, 0.8, 2.2),
  f('rack', 10.5, 5.7, 0.8, 0.8, 2.2), f('rack', 11.7, 5.7, 0.8, 0.8, 2.2),
  // Printer nook
  // copiers back onto the server-room wall, facing into the nook
  f('copier', 7, 1.28, 1, 1.2, 1.25, Math.PI),
  f('copier', 12, 1.28, 1, 1.2, 1.25, Math.PI),
  f('shelfrack', 7, -3.45, 1.8, 0.5, 1.8), // clear of the glass at x = 6
  // Cafeteria — kitchen along the south wall, island, tables, vending
  f('counter', -1, -11.39, 10, 1, 0.92),
  f('island', -1, -9.2, 3, 1.1, 0.92),
  f('fridge', 5.3, -11.4, 1, 0.8, 1.9),
  f('vending', 12.4, -11.5, 1, 0.8, 1.9),
  f('bartop', -6.8, -5.42, 0.6, 2.6, 1.1),
  f('table', 6.5, -6.5, 1.2, 1.2, 0.74),
  f('table', 9.5, -9.2, 1.2, 1.2, 0.74),
  f('table', 5, -10, 1.2, 1.2, 0.74),
  f('art', -3.5, -11.82, 1.8, 0.1, 1.2),
  // Games corner — foosball, hoop, hangout
  f('foosball', 15.5, -4.5, 1.4, 0.8, 0.85),
  f('hoop', 20.4, -7, 0.6, 0.6, 2.6, -Math.PI / 2),
  f('sofa', 14.32, -11.35, 2.4, 0.95, 0.75), // back to the south wall
  f('table', 17.5, -10.5, 1, 0.6, 0.4),
  f('rug', 17, -9.5, 4.4, 3.6, 0.01),
  // Meeting room — the long table is a stage
  f('table', 17, 1.5, 3.6, 1.4, 0.74),
  f('whiteboard', 13.42, 3.6, 1.8, 0.6, 1.95, Math.PI / 2), // a mobile board on feet
  f('tv', 20.8, 1.5, 2, 0.15, 1.3, -Math.PI / 2),
  f('art', 15.5, -1.85, 1.5, 0.1, 1.2),
  // CEO suite
  f('ceodesk', 18.5, 10.3, 2.4, 1.1, 0.78),
  f('bookshelf', 20.7, 7, 2.6, 0.4, 2.2, -Math.PI / 2),
  f('bookshelf', 13.3, 6.6, 2.4, 0.4, 2.2, Math.PI / 2),
  f('sofa', 14.6, 9.5, 2.2, 0.95, 0.75), // faces the desk; the lap passes behind
  f('rug', 17.5, 8.8, 4, 3.2, 0.01),
  f('art', 20.88, 10.4, 1.3, 0.1, 1.2, -Math.PI / 2), // over the desk (the bookshelf has the west wall)
  // Lounge — sofas under the windows, bar table
  f('sofa', -4, 11.35, 2.4, 0.95, 0.75, Math.PI),
  f('sofa', 3, 11.35, 2.4, 0.95, 0.75, Math.PI),
  f('sofa', -12, 11.35, 2.2, 0.95, 0.75, Math.PI),
  f('table', -4, 10.1, 1, 0.6, 0.4),
  f('table', 3, 10.1, 1, 0.6, 0.4),
  f('bartop', 8.5, 11.2, 2.8, 0.6, 1.1),
  // Balcony terrace — planters, benches, weather
  f('planter', -20.5, 2.8, 0.7, 3, 0.5),
  f('planter', -20.5, 8.6, 0.7, 3, 0.5),
  f('planter', -17, 11.55, 3, 0.7, 0.5),
  f('bench', -14.6, 2.4, 0.6, 2, 0.45),
  f('bench', -14.6, 6.6, 0.6, 2, 0.45),
];

// Ramps: rotated planks that let cars climb furniture. rise over length.
// rotY: 0 rises toward +z, π toward −z, π/2 toward +x, −π/2 toward −x.
// skin: what it looks like (Office.jsx / furniture.js draw a built-in one,
// or a theme's RAMP_SKINS) — the collider is the same deck either way.
const ramp = (x, z, l, w, rise, rotY, skin) => ({ x: u(x), z: u(z), l: u(l), w: u(w), rise: u(rise), rotY, skin });

export const RAMPS = [
  ramp(-4.5, -2.85, 1.9, 0.6, 0.74, 0, 'plank'), // shelf plank onto open-office pod 1 (south)
  ramp(2.5, 5.85, 1.9, 0.6, 0.74, Math.PI, 'plank'), // pod 4 from the north
  ramp(-3.4, -9.2, 1.8, 0.6, 0.92, Math.PI / 2, 'dustpan'), // dustpan onto the kitchen island
  ramp(4.9, -11.35, 1.8, 0.6, 0.92, -Math.PI / 2, 'steel'), // counter run-up — drive the kitchen top!
  ramp(14.2, 1.5, 1.8, 0.6, 0.74, Math.PI / 2, 'binder'), // binder ramp onto the meeting table
  ramp(18.5, 8.85, 1.7, 0.55, 0.78, 0, 'books'), // book-stack ramp onto the CEO desk
  ramp(-2.1, 11.3, 1.6, 0.6, 0.75, -Math.PI / 2, 'clipboard'), // clipboard onto the lounge sofa
  ramp(14.05, -4.5, 1.7, 0.55, 0.85, Math.PI / 2, 'ruler'), // ruler ramp onto the foosball table
  ramp(-17.5, -9.3, 1.8, 0.6, 1.05, Math.PI, 'plank'), // reception desk jump (tall!)
];

// Dynamic props: everything here is a physics body the cars can smash.
const p = (type, x, z, y = 0, rotY = 0) => ({ type, x: u(x), z: u(z), y: u(y), rotY });

// A tidy workstation: monitor + keyboard on the desk surface, facing the
// sitter. dir: -1 = sitter south of the desk, +1 = north.
const deskSet = (x, z, dir, extras = []) => [
  p('monitor', x, z + dir * 0.22, 0.74, dir === -1 ? Math.PI : 0),
  p('keyboard', x, z - dir * 0.14, 0.74),
  ...extras.map((e) => p(e[0], x + e[1], z + e[2], 0.74)),
];

export const PROPS = [
  // ---- open office: four pods, eight desks, chairs on the outer sides
  ...deskSet(-4.5, -1.45, -1, [['mug', 0.55, 0.05]]),
  ...deskSet(-4.5, -0.55, 1),
  ...deskSet(2.5, -1.45, -1),
  ...deskSet(2.5, -0.55, 1, [['mug', -0.55, -0.05]]),
  ...deskSet(-4.5, 3.55, -1, [['lamp', 0.6, 0.1]]),
  ...deskSet(-4.5, 4.45, 1),
  ...deskSet(2.5, 3.55, -1),
  ...deskSet(2.5, 4.45, 1, [['lamp', -0.6, 0.1]]),
  p('chair', -4.5, -2.3), p('chair', -4.5, 0.3, 0, Math.PI), p('chair', 2.5, -2.3), p('chair', 2.5, 0.3, 0, Math.PI),
  p('chair', -4.5, 2.7), p('chair', -4.5, 5.3, 0, Math.PI), p('chair', 2.5, 2.7), p('chair', 2.5, 5.3, 0, Math.PI),
  p('plant', -7.5, 6.5), p('plant', 5.3, -3.4), p('trash', -6.8, -3.5), p('trash', 4.5, 6.3),
  p('stack', -2, 1.5), p('pen', -1, -2.5, 0, 0.7), p('pen', 0.5, 5, 0, 2.1), p('book', -6.5, 2, 0, 0.4),
  // ---- reception
  p('mug', -17.2, -10.6, 1.05), p('stack', -16.6, -10.7, 1.05), p('plant', -20.3, -11.2), p('plant', -14.8, -1.8),
  p('box', -15, -11.3), p('pen', -18, -8, 0, 1.2), p('book', -19.8, -8.7, 0, 0.8),
  // ---- storage: box fort + paper
  p('box', -12.5, -6.8), p('box', -11.8, -6.8), p('box', -12.15, -6.8, 0.4), p('box', -9.5, -5.2),
  p('box', -10.5, -10.8), p('box', -9.8, -10.8), p('box', -10.15, -10.8, 0.4), p('box', -10.15, -10.8, 0.8),
  p('stack', -12.8, -9), p('stack', -9, -7.5), p('pen', -11, -6, 0, 0.3), p('trash', -13.5, -4.6),
  // ---- bathroom: toilet rolls roam free
  p('roll', -13.5, -0.5), p('roll', -12.8, -1.4), p('roll', -9.2, -2.8), p('roll', -10, -0.2), p('roll', -9, 0.4),
  p('plant', -8.6, 0.5), p('mug', -12.3, 0.9, 0.85), // someone's coffee lives here now
  // ---- focus booths
  p('plant', -11, 1.4), p('book', -11.6, 4.2, 0, 1.1), p('book', -10.4, 3.8, 0, 2.4), p('pen', -11, 6.2, 0, 0.5),
  // ---- server room
  p('trash', 6.7, 6.4), p('box', 12.4, 2.6), p('pen', 9.5, 4.5, 0, 1.6),
  // ---- printer nook: paper country
  p('stack', 8.2, 1), p('stack', 9, -0.2), p('stack', 10.6, 0.8), p('stack', 11.2, -1.5),
  p('box', 7.5, -2.6), p('box', 8.2, -2.6), p('trash', 12.5, -3.3), p('pen', 9.8, -2, 0, 2.8),
  // ---- cafeteria: mugs, glasses, marbles by the vending machine
  p('chair', 6.5, -5.6), p('chair', 6.5, -7.4, 0, Math.PI), p('chair', 9.5, -8.3), p('chair', 10.4, -9.7, 0, Math.PI / 2),
  p('chair', 5, -9.1), p('chair', 4.1, -10.4, 0, -Math.PI / 2),
  p('mug', 6.5, -6.3, 0.74), p('mug', 9.7, -9, 0.74), p('mug', -2.2, -9.1, 0.92), p('mug', 1.5, -11.3, 0.92),
  p('glass', -0.2, -9.2, 0.92), p('glass', 0.8, -11.4, 0.92), p('glass', 2.6, -11.3, 0.92), p('glass', -4.4, -11.4, 0.92),
  p('bottle', -6.7, -4.6, 1.1), p('bottle', 3.4, -6.8), p('bottle', 11.6, -6.2, 0, 0.9),
  p('marble', 11.2, -10.6), p('marble', 11.7, -10.2), p('marble', 12.1, -10.9), p('marble', 10.8, -11.1),
  p('marble', 12.5, -10.4), p('marble', 11.4, -11.3), p('marble', 12.8, -11), p('marble', 10.5, -10.3),
  p('trash', -7.5, -11.3), p('stack', -5.9, -5), p('pen', 1, -7, 0, 0.2), p('pen', 8, -11, 0, 1.9),
  // ---- games corner
  p('basketball', 18.5, -8.2), p('basketball', 19.6, -9.4), p('basketball', 16.8, -7.6), p('basketball', 20, -3.4),
  p('mug', 17.7, -10.4, 0.4), p('book', 14.8, -9.8, 0, 0.6), p('pen', 16, -8.8, 0, 2.5),
  // ---- meeting room
  p('chair', 15.6, 0.3), p('chair', 17, 0.1), p('chair', 18.4, 0.3), p('chair', 15.6, 2.7, 0, Math.PI),
  p('chair', 17, 2.9, 0, Math.PI), p('chair', 18.4, 2.7, 0, Math.PI), p('chair', 19.6, 1.5, 0, -Math.PI / 2),
  p('mug', 16.4, 1.2, 0.74), p('mug', 17.8, 1.9, 0.74), p('stack', 17.2, 1, 0.74), p('pen', 14.5, 3.5, 0, 0.8),
  // ---- ceo suite
  p('lamp', 19.3, 10.2, 0.78), p('mug', 18, 10.4, 0.78), p('book', 15.5, 11.2, 0, 0.3), p('book', 16.1, 11.5, 0, 1.2),
  p('plant', 20.4, 11.4), p('stack', 14, 5.8),
  // ---- lounge
  p('mug', -4.2, 10.1, 0.4), p('mug', 3.2, 10.05, 0.4), p('glass', 8.9, 11.15, 1.1),
  p('basketball', -9.5, 10), p('book', -6.2, 8.4, 0, 1.7), p('book', 0.2, 8.6, 0, 0.9),
  p('plant', -13.4, 7.8), p('plant', 12.3, 7.8), p('bottle', 9.6, 11.1, 1.1), p('pen', -1.5, 9, 0, 1.4),
  // ---- balcony
  p('plant', -15, 11.2), p('plant', -20.2, -0.3), p('bottle', -14.9, 4.4), p('roll', -16, 0.6),
  p('box', -19.8, 10.8),
];

// Race spawn grid — reception, facing east toward the storage door.
export const SPAWNS = Array.from({ length: 12 }, (_, i) => ({
  x: u(-19.8 + (i % 3) * 1.2),
  z: u(-9.6 + Math.floor(i / 3) * 1.5),
  rotY: Math.PI / 2, // car forward is +z rotated by yaw → π/2 faces +x (east)
}));

// Desk Dash — ordered checkpoints; a lap touches every room and S-curves
// through the open office between the two lounge doors.
const cp = (x, z) => ({ x: u(x), z: u(z) });
export const CHECKPOINTS = [
  cp(-16.5, -8), // start/finish straight, reception
  cp(-11, -8), // storage (box fort!)
  cp(-4.5, -8.7), // cafeteria west, around the island
  cp(2.5, -9.5), // kitchen straight
  cp(9.7, -8), // cafeteria east
  cp(16, -7), // games corner
  cp(19.1, -4), // hoop corner
  cp(17, 1.5), // meeting room — over or around the table
  cp(17, 7), // through the CEO glass door
  cp(16.5, 10), // CEO suite
  cp(9.5, 9.5), // lounge east
  cp(2.5, 8), // dip toward the lounge door…
  cp(-1, 1.5), // …S-curve through the open office…
  cp(-3.5, 8), // …and back out the other door
  cp(-11, 9.5), // lounge west
  cp(-17.5, 9), // balcony terrace (in the rain)
  cp(-18, 2.5), // balcony straight
  cp(-17.5, -4), // back inside through reception glass
];

// Bot driving line — the lap with corner easing, every door threaded.
export const BOT_PATH = [
  // the kitchen straight threads the island/counter corridor — the old single
  // waypoint at (0,-9.3) sat INSIDE the solid island and bots drove through it
  cp(-16.5, -8), cp(-14, -8), cp(-11, -8), cp(-8, -8.5), cp(-4.5, -8.7), cp(-3.2, -10.3),
  cp(1.2, -10.3), cp(5, -8.6), cp(9.7, -8), cp(13, -7.5), cp(16, -7), cp(19.1, -4.5), cp(19.1, -2),
  cp(18, 0), cp(17, 1.5), cp(17, 3.4), cp(17, 5), cp(17, 7), cp(17.4, 9.3),
  cp(15.5, 10.25), cp(13, 10.25), cp(9.5, 9.5), cp(6, 9), cp(2.5, 8), cp(2.5, 7),
  cp(1.5, 4.5), cp(-1, 1.5), cp(-3, 4.5), cp(-3.5, 7), cp(-5.5, 8.5), cp(-8.5, 9.5),
  cp(-11, 9.5), cp(-14, 9.5), cp(-16.5, 8.5), cp(-18, 5), cp(-18, 2.5), cp(-17.7, -0.2),
  cp(-17.5, -2), cp(-17.5, -4), cp(-17, -6.5),
];

// Coffee Run
export const BEAN_SPAWNS = [
  // (-16.2,-9.5): just north of the reception desk — the old (-16,-10.5) was
  // INSIDE the desk's solid collider, an invisible-but-collectable bean
  cp(-19.5, -3), cp(-16.2, -9.5), cp(-11, -5.5), cp(-11.5, -10), cp(-11, -0.5),
  cp(-11, 5.5), cp(-5.5, 1.5), cp(1, -0.2), cp(-1, 5.8), cp(-6, -6),
  cp(1, -6.3), cp(8, -5.3), cp(11, -9.5), cp(9.5, 4.5), cp(9.5, -2.5),
  cp(15, -8.5), cp(19, -9.8), cp(15.2, 1.5), cp(18.5, 3.8), cp(15.5, 8),
  cp(19.5, 8.5), cp(-0.5, 9.8), cp(-8.5, 9.3), cp(6.5, 9.5), cp(-18, 6),
  cp(-18.5, 0.5),
];
export const COFFEE_MACHINE = { x: u(-1), z: u(-11.3), deliverX: u(-1), deliverZ: u(-10.2), radius: u(1.3) };

// Capture the Battery
export const BATTERY_SPAWN = cp(-1, 1.5);

// RC Soccer — arena is the (much bigger) open office; goals sit in the two
// glass doorways on the east and west walls.
export const SOCCER = {
  ballSpawn: { x: u(-1), z: u(1.5), y: u(0.5) },
  ballRadius: u(0.42), // "huge ping pong ball" — bigger than the cars
  goals: [
    { team: 0, x: u(-8), z: u(4), dir: 1, width: u(1.8), name: 'Focus Goal' }, // focus-booth doorway
    { team: 1, x: u(6), z: u(-0.5), dir: -1, width: u(1.8), name: 'Printer Goal' }, // printer doorway
  ],
  arena: { minX: u(-8), maxX: u(6), minZ: u(-4), maxZ: u(7) },
  kickoff: [
    { x: u(-5.5), z: u(0), rotY: Math.PI / 2 }, { x: u(-5.5), z: u(3), rotY: Math.PI / 2 },
    { x: u(-6.5), z: u(1.5), rotY: Math.PI / 2 }, { x: u(-5.5), z: u(-2), rotY: Math.PI / 2 },
    { x: u(3.5), z: u(0), rotY: -Math.PI / 2 }, { x: u(3.5), z: u(3), rotY: -Math.PI / 2 },
    { x: u(4.5), z: u(1.5), rotY: -Math.PI / 2 }, { x: u(3.5), z: u(-2), rotY: -Math.PI / 2 },
    { x: u(-3.5), z: u(-1), rotY: Math.PI / 2 }, { x: u(-3.5), z: u(4.5), rotY: Math.PI / 2 },
    { x: u(1.5), z: u(-1), rotY: -Math.PI / 2 }, { x: u(1.5), z: u(4.5), rotY: -Math.PI / 2 },
  ],
};

// Standup Standoff — floor spots the meeting zone hops between (one per
// room-ish, kept clear of the biggest furniture).
export const KOTH_SPOTS = [
  cp(-16.5, -3), // reception waiting area
  cp(-11, -7.5), // storage (box fort)
  cp(-11, 4), // focus booths
  cp(-1, 1.5), // open office centre
  cp(2.5, -8.5), // cafeteria straight
  cp(9.5, -1), // printer nook (paper country)
  cp(17, -6.5), // games corner
  cp(17, 1.5), // meeting room — the table IS the standup
  cp(16, 8.5), // CEO suite
  cp(-0.5, 9.5), // lounge
  cp(-17.5, 5.5), // balcony terrace (bring a towel)
];

// Meeting Room Sumo — the ring starts covering the whole office and shrinks
// toward the open-office centre over the round.
export const SUMO_ZONE = { x: u(-1), z: u(1.5), r0: u(22), r1: u(1.5) };

// Powerup pads — one per room-ish, off the racing line's door thresholds.
export const POWERUP_PADS = [
  cp(-19.5, -6.5), cp(-11, -5.8), cp(-11, -1.2), cp(-11, 3.6), cp(-1, -2),
  cp(-1, 5), cp(9.5, 4.6), cp(9.5, -1.8), cp(2.5, -6), cp(8.5, -10.5),
  cp(17, -9.2), cp(14.7, -0.3), cp(15.2, 10.6), cp(-0.5, 10.6), cp(-11.8, 8.4),
  cp(-18.2, 7),
];

// Interactive machines. The vending machine drops a can when rammed at speed
// (sometimes golden = free powerup); the copier periodically "prints" a blast
// of paper that blinds anyone driving past.
export const VENDING = { x: u(12.4), z: u(-11.5), rotY: 0, radius: u(1.5), minSpeed: 12, cooldownS: 8, goldenChance: 0.3 };
export const PRINTER = { x: u(7), z: u(1.28), rotY: Math.PI, radius: u(5), minIntervalS: 22, maxIntervalS: 42, blindS: 1.4 };

// The cleaning robot's patrol route (Last Car Standing hazard + ambient menace)
export const ROBOT_PATH = [
  // like BOT_PATH, the kitchen leg routes through the island/counter corridor
  // instead of tunnelling through the solid island at (0,-9), and every wall
  // is crossed at a door (test-maps.mjs holds it to that)
  cp(-1, 1.5), cp(2.5, -1), cp(4.5, -6), cp(1.2, -10.3), cp(-3.2, -10.3), cp(-5, -8), cp(-5, -5.5),
  cp(-4.5, -4), cp(-6.5, 0), cp(-4, 5), cp(-1, 6.3), cp(2.5, 6.3), cp(2.5, 7.8), cp(7, 8.6),
  cp(2.5, 7.8), cp(2.5, 5), cp(-2.5, 1.5), cp(-5, -1.5),
];

// Everything above, as one map (maps/index registers it).
export const OFFICE = {
  id: 'office',
  name: 'The Office',
  blurb: 'Glass, carpet and rain on the windows. Golden hour on the 12th floor.',
  theme: 'office',
  MAP_BOUNDS, WALL_HEIGHT, ROOMS, WALLS, FURNITURE, RAMPS, PROPS,
  SPAWNS, REVERSE_SPAWN_ROTY: 0, // reverse lap leaves the grid heading north
  CHECKPOINTS, BOT_PATH, BEAN_SPAWNS, COFFEE_MACHINE, BATTERY_SPAWN, SOCCER,
  KOTH_SPOTS, SUMO_ZONE, POWERUP_PADS, VENDING, PRINTER, ROBOT_PATH,
  // the live scoreboards on the walls (OfficeBoard.jsx), meters
  BOARDS: {
    boards: [
      { at: [20.86, 1.41, 3.65], rotY: -Math.PI / 2 }, // meeting room, beside the TV
      { at: [-17.5, 2.0, -11.87], rotY: 0 }, // reception, above the big desk
    ],
    clock: { at: [-19.15, 2.32, -11.87], rotY: 0 },
    memos: { at: [-16.05, 1.95, -11.88], rotY: 0 },
  },
  // Paint. Most of the floor is the house off-white; a few rooms get their
  // own colour on the walls that face into them (architecture.js), so each
  // reads as a place from car height: a greige reception, sage kitchen,
  // aqua washroom, a blue meeting room, a green CEO study, an orange games
  // corner, a dark server room.
  LOOK: {
    wall: '#e8e4da',
    skirt: '#d8d2c6',
    frame: '#f3f1ec',
    rooms: {
      reception: '#d6cbbb', cafeteria: '#c9d3bd', bathroom: '#bcd4d6', focus: '#d9cfc0',
      meeting: '#7d95ae', ceo: '#4a6656', games: '#d9a07a', server: '#555c66', storage: '#cfc9bd',
    },
  },
  // coffee stains on the floor: [x, z, size] in meters
  STAINS: [
    [-17.5, -4, 2.4], [-1, 0.5, 2], [2.5, -8.8, 3], [9.5, -1, 1.6], [0, 9.7, 2.2],
    [17, 8, 1.7], [-11, -1, 1.8], [16.5, -7, 2], [-6, -6.2, 1.5],
  ],
};
