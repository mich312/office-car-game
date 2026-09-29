// ---------------------------------------------------------------------------
// WERK 2 — printer assembly. A bright, orderly, loud hall that turns out
// 1,300 printers a shift: epoxy floors with yellow aisle lines, orange robot
// arms behind black mesh guarding, a conveyor that never stops, pallet
// racking to the roof and a sawtooth roof over all of it. Authored in real
// metres, exported in world units, same as the other floors.
//
// Floor plan (meters, x: -22..22 west→east, z: -13..13 south→north):
//
//   ┌────────────┬─────────────────────────────┬───────┬──────┐
//   │ HIGH-BAY   │ LINE 2    robots ◆   ◆      ║ SMT   │SUPER-│
//   │ STORE      ┆ ═══assembly═══════════╗     ║ CLEAN │VISOR │
//   │ ▌▌ ▌▌ ▌▌   ┆ ▸▸▸▸ transfer belt ▸▸▸ ╝curve╟───────┴──────┤
//   │ ▌▌ ▌▌ ▌▌   ┆        ◆      ◆      ║ ║   │  QA TEST BAY │
//   │            ┆                   ┊ ║ ║   │ benches, paper│
//   ├────────────┴──── MAIN AISLE ─── ╬ ═bridge═ ─── Andon ▮ grid ┤
//   │ GOODS IN   ┊ SHIPPING HALL      ┊ ║ PACKING  │  CANTEEN     │
//   │ dock doors ┊ (RC Soccer)  fan   ┊ ╚chute→seal│ coffee, vend │
//   └──▀▀──▀▀────┴────────────────────┴───────────┴──────────────┘
//
// Desk Dash (about 100 m) is the cellar's figure-8 on two levels. From the
// grid under the Andon board it runs the whole 44 m aisle west, passing
// UNDER the conveyor bridge; slaloms north through the drive-through rack
// bays; goes up the feed ramp onto the transfer belt, which carries it east
// past the robot cells (the belt adds 1 m/s); round the roller curve, up
// the incline and over the bridge — above the start straight — then down
// the gravity chute into Packing, through the carton sealer, over a canteen
// table and out to the finish. The ground-level twin of the belt (the bots'
// line, and anyone who falls off) runs under the belt and crosses the aisle
// at the yellow box junction, so cars cross the start straight at floor
// level while others fly over them — and in Packing it gets its own
// moment: a pallet kicker that jumps it across the belt coming down.
// ---------------------------------------------------------------------------
import { M } from '../constants.js';

const u = (v) => v * M;
const H = 7; // eaves height of the hall; the sawtooth roof rises above it

const MAP_BOUNDS = { minX: u(-22), maxX: u(22), minZ: u(-13), maxZ: u(13) };
const WALL_HEIGHT = u(H);

const ROOMS = [
  { id: 'factory_aisle', name: 'Main Aisle', x: u(0), z: u(0), w: u(44), d: u(4), floor: 'epoxy' },
  { id: 'factory_goodsin', name: 'Goods In', x: u(-17), z: u(-7.5), w: u(10), d: u(11), floor: 'concrete' },
  { id: 'factory_shipping', name: 'Shipping Hall', x: u(-4), z: u(-7.5), w: u(16), d: u(11), floor: 'epoxy' },
  { id: 'factory_packing', name: 'Packing', x: u(9), z: u(-7.5), w: u(10), d: u(11), floor: 'concrete' },
  { id: 'factory_canteen', name: 'Canteen', x: u(18), z: u(-7.5), w: u(8), d: u(11), floor: 'tile' },
  { id: 'factory_store', name: 'High-Bay Store', x: u(-16), z: u(7.5), w: u(12), d: u(11), floor: 'concrete' },
  { id: 'factory_line', name: 'Line 2', x: u(1), z: u(7.5), w: u(22), d: u(11), floor: 'epoxy' },
  { id: 'factory_qa', name: 'QA Test Bay', x: u(17), z: u(4.5), w: u(10), d: u(5), floor: 'rubber' },
  { id: 'factory_clean', name: 'SMT Clean Room', x: u(14.75), z: u(10), w: u(5.5), d: u(6), floor: 'dark' },
  { id: 'factory_office', name: 'Supervisor', x: u(19.75), z: u(10), w: u(4.5), d: u(6), floor: 'carpet' },
];

// Walls. Partitions inside the hall are mostly mesh guarding (style
// 'factory_mesh', drawn by the theme; the collider is the same box as any
// wall), block walls where a room needs to feel shut (the canteen, the
// goal wall), glass for the labs.
const wall = (x, z, w, d, opts = {}) => ({
  x: u(x), z: u(z), w: u(w), d: u(d), h: u(opts.h ?? H), glass: !!opts.glass, low: !!opts.low,
  ...(opts.style ? { style: opts.style } : {}),
});
const run = (horizontal) => (c, a1, a2, gaps = [], opts = {}) => {
  const t = opts.t ?? (opts.style === 'factory_mesh' ? 0.1 : opts.glass ? 0.15 : 0.2);
  const pts = [a1, ...gaps.flat(), a2];
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    const len = pts[i + 1] - pts[i], mid = (pts[i] + pts[i + 1]) / 2;
    if (len > 0.05) out.push(horizontal ? wall(mid, c, len, t, opts) : wall(c, mid, t, len, opts));
  }
  return out;
};
const hwall = run(true);
const vwall = run(false);
const MESH = { style: 'factory_mesh', h: 2.2 };
const BLOCK = { h: 3 };
const GLASS = { glass: true, h: 3, style: 'factory_glass' };
// knee-high steel guard rail where the bridge crosses a fence line: cars
// can't climb it, bots ignore it (low), the belt passes over it
const GUARD = { style: 'factory_guard', h: 0.55, low: true, t: 0.12 };

const WALLS = [
  // ------------------------------------------------------------- perimeter
  // south: two dock doors into Goods In (roll-ups half open, a safety gate
  // across each — the collider is the wall, the theme draws the door)
  ...hwall(-13, -22.2, 22.2, [[-20, -17], [-16, -13]]),
  wall(-18.5, -13, 3, 0.2, { style: 'factory_dockdoor' }),
  wall(-14.5, -13, 3, 0.2, { style: 'factory_dockdoor' }),
  ...hwall(13, -22.2, 22.2),
  ...vwall(-22, -13.2, 13.2, [[-10, -6.5]]),
  wall(-22, -8.25, 0.2, 3.5, { style: 'factory_dockdoor' }),
  ...vwall(22, -13.2, 13.2),
  // ------------------------------------------------ aisle, south side (z −2)
  ...hwall(-2, -22, -12, [[-17.5, -14.5]], MESH), // Goods In: the forklift lane
  ...hwall(-2, -12, 4, [[-9, -7.2], [0, 1.8]], MESH), // Shipping: two gates
  ...hwall(-2, 4, 14, [[5, 7], [8.6, 9.8]], MESH), // Packing: the crossing gate, the bridge
  wall(9.2, -2, 1.2, 0.12, GUARD),
  ...hwall(-2, 14, 22, [[18.3, 20.1]], BLOCK), // Canteen
  // ------------------------------------------------ aisle, north side (z 2)
  // the store is open to the aisle: its rack rows end in guarded uprights
  ...hwall(2, -10, 12, [[-8, -6], [5, 7], [8.6, 9.8]], MESH), // Line 2
  wall(9.2, 2, 1.2, 0.12, GUARD),
  ...hwall(2, 12, 22, [[13, 14.8]], GLASS), // QA lab front
  // ------------------------------------------------------------ north half
  ...vwall(-10, 2, 13, [[7.6, 9.4]], MESH), // store | Line 2: the gap lines up with the feed ramp
  ...vwall(12, 2, 7, [[3.4, 5.2]], GLASS), // Line 2 | QA (strip curtain door)
  ...vwall(12, 7, 13, [[9.2, 11]], GLASS), // Line 2 | clean room (strip curtain door)
  ...hwall(7, 12, 22, [[19.2, 20.8]], BLOCK), // QA | clean room + office
  ...vwall(17.5, 7, 13, [], GLASS), // the supervisor watches the SMT line
  // ------------------------------------------------------------ south half
  ...vwall(-12, -13, -2, [[-8.4, -6.6]], MESH), // Goods In | Shipping — a soccer goal
  ...vwall(4, -13, -2, [[-8.4, -6.6]], BLOCK), // Shipping | Packing — the other goal
  ...vwall(14, -13, -2, [[-7.9, -6.1]], BLOCK), // Packing | Canteen, in line with the sealer
  // robot cell guarding round the two big arms south of the belt
  ...hwall(6.1, -3.9, -0.5, [], { style: 'factory_mesh', h: 1.6 }),
  ...vwall(-3.9, 6.1, 7.7, [], { style: 'factory_mesh', h: 1.6 }),
  ...vwall(-0.5, 6.1, 7.7, [], { style: 'factory_mesh', h: 1.6 }),
  ...hwall(6.1, 2.5, 5.9, [], { style: 'factory_mesh', h: 1.6 }),
  ...vwall(2.5, 6.1, 7.7, [], { style: 'factory_mesh', h: 1.6 }),
  ...vwall(5.9, 6.1, 7.7, [], { style: 'factory_mesh', h: 1.6 }),
  // --------------------------------------------- steel columns at the joints
  ...[[-12, -2], [4, -2], [14, -2], [-10, 2], [12, 2], [-12, -13], [4, -13], [14, -13], [-10, 13], [12, 13]]
    .map(([x, z]) => wall(x, z, 0.4, 0.4, { style: 'factory_column' })),
  // the Andon portal's legs, either side of the aisle over the grid
  wall(13.5, 1.8, 0.25, 0.25, { style: 'factory_column', h: 2.65 }),
  wall(13.5, -1.8, 0.25, 0.25, { style: 'factory_column', h: 2.65 }),
];

const f = (type, x, z, w, d, h, rotY = 0, extra = {}) => ({ type, x: u(x), z: u(z), w: u(w), d: u(d), h: u(h), rotY, ...extra });

// ------------------------------------------------------------ the racking
// Three rows of pallet racking, north–south, four 2.4 m bays each. A full
// ground bay is solid (a pallet of cartons on the floor); an empty one you
// can drive straight through, under the 1.2 m beam. The Desk Dash slalom
// threads row 2's second bay and row 3's third. The theme draws the steel
// and the stock as one batch; each entry here is its collider.
const RACK_ROWS = [-20.4, -16.8, -13.2];
const RACK_Z0 = 3.0, BAY = 2.4;
const EMPTY_BAYS = { '-16.8': [1], '-13.2': [2] };
const RACKS = RACK_ROWS.flatMap((x) => [0, 1, 2, 3].map((b) => {
  const z = RACK_Z0 + (b + 0.5) * BAY;
  const empty = (EMPTY_BAYS[String(x)] || []).includes(b);
  return empty
    ? f('factory_rackbay', x, z, 1.1, BAY, 4.8, 0, { driveUnder: true })
    : f('factory_rack', x, z, 1.1, BAY, 4.8, 0, { bay: b });
}));

// ------------------------------------------------------------- the line
// The transfer belt (drivable, 1 m/s east) and the assembly line beside it
// (printers riding, robots working). Conveyors are drive-under: a 20 cm
// deep bed on legs, underside at 0.65 m, so the ground twin runs beneath
// them. `h` is the belt top; `h0`/`h1` the top at each end of a slope
// (along the piece's length, which runs along its w).
const BELT_TOP = 0.85, BRIDGE_TOP = 1.2, CHUTE_TOP = 0.3;
const conveyor = (x, z, len, rotY, extra = {}) => f('factory_conveyor', x, z, len, 0.8, BELT_TOP, rotY, { driveUnder: true, ...extra });
const LINE = [
  // transfer belt: east along z 8.5 from the feed ramp to the curve
  conveyor(-0.2, 8.5, 14.8, 0, { belt: 'transfer', legs: 2 }),
  // the 90° roller curve (radius 2 m about (7.2, 6.5)): its bounding box
  f('factory_curve', 8.4, 7.7, 2.4, 2.4, BELT_TOP, 0, { driveUnder: true, cx: u(7.2), cz: u(6.5), r: u(2) }),
  // south: climb to the bridge, cross the aisle, drop into Packing. The
  // piece's length runs along its local x; rotY π/2 points it south.
  conveyor(9.2, 4.75, 3.5, Math.PI / 2, { belt: 'transfer', h: BRIDGE_TOP, h0: BELT_TOP, h1: BRIDGE_TOP, legs: 2 }),
  conveyor(9.2, 0.1, 5.8, Math.PI / 2, { belt: 'transfer', h: BRIDGE_TOP, bridge: true }),
  conveyor(9.2, -4.6, 3.6, Math.PI / 2, { belt: 'transfer', h: BRIDGE_TOP, h0: BRIDGE_TOP, h1: CHUTE_TOP, legs: 1 }),
  // assembly line: printers ride it station to station, 0.5 m/s
  conveyor(-0.7, 9.6, 14.8, 0, { belt: 'assembly', legs: 2 }),
  // the hoods at either end: printers come out of one and go into the other
  f('factory_hood', -8.6, 9.6, 1.4, 1.1, 1.7, 0, { label: 'CHASSIS' }),
  f('factory_hood', 7.4, 9.6, 1.4, 1.1, 1.7, 0, { label: 'EOL TEST' }),
  // six-axis robots at the four stations (a printer reaches each one every
  // 6.4 s): two north of the assembly line, and two big ones south of the
  // transfer belt whose swings cross it — their grippers are colliders
  f('factory_robot', -5.4, 11, 0.6, 0.6, 1, 0, { side: 'N' }),
  f('factory_robot', 1.0, 11, 0.6, 0.6, 1, 0, { side: 'N' }),
  f('factory_robot', -2.2, 7.1, 0.7, 0.7, 1, 0, { side: 'S' }),
  f('factory_robot', 4.2, 7.1, 0.7, 0.7, 1, 0, { side: 'S' }),
  // parts flow racks the south arms pick from, inside their guarding
  f('factory_flowrack', -2.2, 6.45, 1.3, 0.35, 1.1, 0),
  f('factory_flowrack', 4.2, 6.45, 1.3, 0.35, 1.1, 0),
  // line-side: parts shelving along the north wall, a work bench
  f('factory_flowrack', -6.5, 12.55, 2.4, 0.7, 1.6, Math.PI),
  f('factory_flowrack', -1.2, 12.55, 2.4, 0.7, 1.6, Math.PI),
  f('factory_flowrack', 4.8, 12.55, 2.4, 0.7, 1.6, Math.PI),
  f('factory_bench', 9.8, 12.2, 2.2, 0.8, 0.9, Math.PI, { driveUnder: true }),
  f('factory_bench', -6.8, 3.2, 2.2, 0.8, 0.9, 0, { driveUnder: true }),
  f('factory_pallet', 1.5, 3.1, 1.2, 1.0, 1.1, 0, { load: 'parts' }),
  f('factory_pallet', -3.2, 3.1, 1.2, 1.0, 0.6, 0.2, { load: 'parts' }),
];

const FURNITURE = [
  ...RACKS,
  ...LINE,
  // ---- Goods In: a parked forklift with a pallet raised on its forks (a
  // kicker from the side), wrapped pallets waiting in the staging lanes
  f('factory_forklift', -14.2, -6.2, 2.3, 1.1, 2.1, 0),
  f('factory_pallet', -20.6, -10.8, 1.2, 1.0, 1.4, 0, { load: 'wrapped' }),
  f('factory_pallet', -20.6, -4.2, 1.2, 1.0, 1.2, 0, { load: 'wrapped' }),
  f('factory_pallet', -13.4, -11.9, 1.2, 1.0, 0.9, Math.PI / 2, { load: 'cartons' }),
  f('factory_pallet', -17.4, -3.0, 1.2, 1.0, 0.15, 0.3, { load: 'empty' }),
  f('factory_pallet', -20.8, -2.8, 1.2, 1.0, 0.6, 0, { load: 'empties' }),
  // ---- Shipping: the pitch in the middle, outbound pallets along the walls
  f('factory_pallet', -10.9, -12.2, 1.2, 1.0, 1.4, 0, { load: 'wrapped' }),
  f('factory_pallet', -9.5, -12.2, 1.2, 1.0, 1.4, 0, { load: 'wrapped' }),
  f('factory_pallet', 2.9, -12.2, 1.2, 1.0, 1.2, 0, { load: 'wrapped' }),
  f('factory_pallet', 1.5, -12.2, 1.2, 1.0, 1.4, 0, { load: 'wrapped' }),
  // ---- Packing: the chute lands here; the carton sealer is a tunnel; the
  // stretch-wrap turntable (a platform that turns) is a standup spot. It is
  // low enough to drive onto, so the server's box list and the ball skip it.
  f('factory_sealer', 11.7, -7, 1.4, 1.8, 1.3, 0, { driveUnder: true }),
  f('factory_turntable', 6.6, -10.6, 1.65, 1.65, 0.08, 0, { decor: true }),
  f('factory_pallet', 13.2, -12.2, 1.2, 1.0, 1.1, 0, { load: 'wrapped' }),
  f('factory_pallet', 13.2, -3.2, 1.0, 1.2, 0.9, 0, { load: 'flat' }),
  f('factory_bench', 11.6, -12.4, 2.2, 0.8, 0.9, 0, { driveUnder: true }),
  f('factory_packtable', 11.6, -5.3, 2, 0.8, 0.9, Math.PI, { driveUnder: true }),
  // ---- Canteen: long tables you drive under (one has a ramp: the lap goes
  // over it), lockers, vending and the coffee counter
  f('factory_table', 19.2, -5.6, 0.8, 2.4, 0.75, 0, { driveUnder: true }),
  f('factory_table', 16.2, -5.4, 2.4, 0.8, 0.75, 0, { driveUnder: true }),
  f('factory_table', 16.2, -10.4, 2.4, 0.8, 0.75, 0, { driveUnder: true }),
  f('factory_table', 20.6, -9.6, 0.8, 2.0, 0.75, 0, { driveUnder: true }),
  f('factory_locker', 14.35, -4.1, 3.2, 0.45, 1.9, Math.PI / 2),
  f('factory_vending', 15.4, -12.45, 0.9, 0.8, 1.9, 0, { kind: 'snacks' }),
  f('vending', 16.4, -12.45, 0.9, 0.8, 1.9),
  f('factory_vending', 17.4, -12.45, 0.9, 0.8, 1.9, 0, { kind: 'drinks' }),
  f('counter', 21.1, -2.5, 1.5, 0.7, 0.92, Math.PI), // coffee, by the door: nobody walks the length of the canteen for it
  f('fridge', 21.55, -11.3, 0.7, 0.7, 1.8),
  // ---- QA: two long benches end to end (a ramp at the west end), the
  // production printer the paper-blast event comes from, a test rack
  f('factory_bench', 16.2, 4.3, 2.4, 0.8, 0.9, 0, { driveUnder: true, qa: true }),
  f('factory_bench', 18.9, 4.3, 2.4, 0.8, 0.9, 0, { driveUnder: true, qa: true }),
  f('copier', 20.9, 3.2, 1.0, 1.1, 1.25),
  f('factory_flowrack', 21.55, 5.4, 2.2, 0.7, 1.6, -Math.PI / 2),
  // ---- SMT clean room: reflow oven along the south, two pick-and-place
  f('factory_oven', 15.2, 8.2, 4, 0.9, 1.3),
  f('factory_ppm', 13.6, 12.0, 1.6, 1.2, 1.5),
  f('factory_ppm', 15.8, 12.0, 1.6, 1.2, 1.5),
  // ---- the supervisor's office
  f('desk', 20.2, 11.8, 1.6, 0.8, 0.74),
  f('cabinet', 21.55, 8.2, 1.2, 0.6, 1.3, -Math.PI / 2), // drawers facing into the office
  f('whiteboard', 17.75, 9.8, 1.6, 0.1, 1.8, Math.PI / 2),
  // ---- yellow bollards: rack ends, the column corners, the dock doors
  ...[[-20.4, 2.6], [-16.8, 2.6], [-13.2, 2.6], [-19.9, -12.3], [-17.1, -12.3], [-15.9, -12.3], [-13.1, -12.3],
    [-21.3, -10.1], [-21.3, -6.4], [8.7, -2.45], [9.7, -2.45], [8.7, 2.45], [9.7, 2.45], [13.5, 2.6], [15.1, 2.6]]
    .map(([x, z]) => f('factory_bollard', x, z, 0.16, 0.16, 1.0)),
];

const ramp = (x, z, l, w, rise, rotY, skin) => ({ x: u(x), z: u(z), l: u(l), w: u(w), rise: u(rise), rotY, skin });

const RAMPS = [
  // the feed ramp onto the transfer belt: straight out of the rack bay
  ramp(-8.6, 8.5, 2.0, 0.8, BELT_TOP, Math.PI / 2, 'factory_feed'),
  // the gravity-roller chute off the end of the belt, down into Packing
  ramp(9.2, -7.0, 1.2, 0.8, CHUTE_TOP, 0, 'factory_rollers'),
  // checker plate up onto the pallet the forklift has raised on its forks:
  // launch north at the forklift lane
  ramp(-15.97, -7.4, 1.4, 0.9, 0.45, 0, 'factory_plate'),
  // a stack of pallets and a plank: the ground line's jump across the belt
  // where it comes down into Packing, landing at the sealer's mouth
  ramp(7.92, -5.79, 1.5, 0.9, 0.5, 2.0, 'factory_pallets'),
  // over the canteen table, off the end at the aisle door
  ramp(19.2, -7.7, 1.8, 0.7, 0.75, 0, 'factory_plate'),
  // up onto the QA benches, straight through the curtain from Line 2: a
  // 5 m run of tabletop with a gap in it and printers to knock off
  ramp(14, 4.3, 2.0, 0.7, 0.9, Math.PI / 2, 'factory_plate'),
];

const p = (type, x, z, y = 0, rotY = 0) => ({ type, x: u(x), z: u(z), y: u(y), rotY });

const PROPS = [
  // ---- aisle: cones round the crossing, a tote someone dropped
  p('factory_cone', 5.1, 1.5), p('factory_cone', 6.9, 1.5), p('factory_cone', 5.1, -1.5), p('factory_cone', 6.9, -1.5),
  p('factory_tote', -9.6, -1.3, 0, 0.3), p('factory_cone', -14.6, -1.6),
  // ---- store: cartons on the floor by the racks, a pallet jack, a reel
  p('factory_carton', -19.3, 12.4), p('factory_carton', -18.7, 12.5, 0, 0.4), p('factory_carton', -19.0, 12.45, 0.44),
  p('factory_jack', -11.4, 4.0, 0, 0.2), p('factory_reel', -14.6, 12.2), p('factory_tote', -15.3, 3.6, 0, 1.1),
  p('factory_carton', -11.0, 12.2, 0, 0.9),
  // ---- Line 2: printers waiting line-side, toner, totes, a chair at the bench
  p('factory_printer', 1.5, 3.1, 1.1), p('factory_printer', 1.6, 3.35, 1.4, 0.1),
  p('factory_toner', -3.4, 3.0, 0.6), p('factory_toner', -3.0, 3.2, 0.6, 1.2),
  p('factory_tote', -6.2, 12.0), p('factory_tote', -1.6, 12.0, 0, 0.1), p('factory_tote', 4.4, 12.0),
  p('factory_tote', -7.4, 3.2, 0.9), p('mug', -6.0, 3.3, 0.9),
  p('chair', -6.8, 4.1, 0, Math.PI), p('factory_helmet', 9.4, 12.2, 0.9), p('factory_toner', 10.4, 12.1, 0.9),
  p('factory_reel', -8.4, 5.4), p('factory_cone', 7.8, 6.2), p('trash', 11.3, 2.6),
  // ---- Goods In: cartons fallen off a pallet, cones on the dock plates
  p('factory_carton', -19.2, -9.6), p('factory_carton', -18.6, -9.9, 0, 0.5), p('factory_carton', -12.9, -10.6, 0, 1.4),
  p('factory_cone', -18.5, -11.8), p('factory_cone', -14.5, -11.8), p('factory_tote', -21.2, -7.8),
  p('factory_jack', -17.6, -4.2, 0, 1.4),
  // ---- Shipping: loose cartons around the pitch edge
  p('factory_carton', -10.6, -4.2), p('factory_carton', 2.6, -4.1, 0, 0.7), p('factory_carton', -4.1, -12.5, 0, 0.2),
  p('factory_tote', 2.9, -8.9), p('factory_cone', -11.5, -2.6),
  // ---- Packing: printers waiting to be boxed, cartons, tape, a chair
  p('factory_printer', 11.2, -12.4, 0.9), p('factory_carton', 12.1, -12.4, 0.9), p('factory_carton', 13.2, -3.2, 0.9),
  p('factory_carton', 5.0, -12.3), p('factory_carton', 5.6, -12.4, 0, 0.3),
  p('factory_printer', 4.8, -4.2, 0, 0.6), p('chair', 11.6, -11.5),
  p('factory_tote', 7.3, -3.2),
  // ---- Canteen: chairs round the tables, mugs, bottles, a plant
  p('factory_stool', 15.4, -6.1), p('factory_stool', 16.9, -6.15, 0, 0.2), p('factory_stool', 15.5, -4.7, 0, Math.PI),
  p('factory_stool', 17.0, -4.65, 0, Math.PI - 0.3), p('factory_stool', 15.5, -11.1), p('factory_stool', 17.0, -9.7, 0, Math.PI),
  p('factory_stool', 21.3, -9.0, 0, -Math.PI / 2), p('factory_stool', 21.3, -10.2, 0, -Math.PI / 2 + 0.3),
  p('mug', 16.4, -5.4, 0.75), p('bottle', 16.8, -10.3, 0.75), p('mug', 20.6, -2.4, 0.92),
  p('factory_helmet', 20.6, -9.9, 0.75), p('plant', 21.4, -12.5), p('bottle', 19.2, -5.2, 0.75),
  // ---- QA: printers under test on the benches, reams, a stack of pages
  p('factory_printer', 16.9, 4.45, 0.9), p('factory_printer', 19.4, 4.45, 0.9, 0.2),
  p('stack', 15.6, 4.4, 0.9), p('stack', 17.2, 3.0), p('stack', 20, 5.6),
  p('factory_toner', 18.3, 4.5, 0.9),
  // ---- clean room & office
  p('factory_tote', 13.0, 10.2), p('factory_tote', 17.0, 12.5),
  p('monitor', 20.2, 12.0, 0.74), p('keyboard', 20.2, 11.6, 0.74), p('mug', 20.8, 11.7, 0.74),
  p('chair', 20.2, 10.9, 0, Math.PI), p('plant', 21.5, 12.5), p('factory_helmet', 21.3, 8.2, 1.3),
];

// Race grid — the east end of the aisle under the Andon board, three abreast,
// facing west down the 44 m straight.
const SPAWNS = Array.from({ length: 12 }, (_, i) => ({
  x: u(16.6 + Math.floor(i / 3) * 1.1),
  z: u(-1.1 + (i % 3) * 1.1),
  rotY: -Math.PI / 2,
}));

const cp = (x, z) => ({ x: u(x), z: u(z) });

// Desk Dash. Checkpoint 1 is the box junction: you take it on the straight
// at the start, and cross it again later coming down from Line 2 at floor
// level — under the noses of whoever is on the straight.
const CHECKPOINTS = [
  cp(14.5, 0), // start/finish under the Andon board
  cp(6, 0), // the box junction
  cp(-6, 0), // the aisle, past the Shipping gates
  cp(-18.6, 3.2), // into rack aisle 1
  cp(-16.8, 6.6), // through row 2's empty bay
  cp(-13.2, 9.0), // through row 3's
  cp(-8.6, 8.5), // the feed ramp
  cp(0, 8.5), // the belt, between the robot cells
  cp(8.2, 7.2), // the roller curve
  cp(7.9, -6.6), // Packing: off the chute, or over the belt off the pallets
  cp(14, -7), // the canteen door, out of the carton sealer
  cp(18.5, -8), // canteen: the table ramp
  cp(19, -1.2), // back out into the aisle
];

// Bot driving line: the ground twin. Every door threaded; under the belt
// instead of on it; across the aisle at the box junction; under the chute's
// end and through the sealer.
const BOT_PATH = [
  cp(14.5, 0), cp(10, 0.1), cp(6, 0), cp(0, 0), cp(-6, 0), cp(-12, 0.2), cp(-16.3, 0.4),
  cp(-18.3, 1.8), cp(-18.6, 3.2), cp(-18.6, 5.1), cp(-17.8, 6.4), cp(-16.8, 6.6), cp(-15.6, 6.8),
  cp(-15, 7.8), cp(-14.2, 8.9), cp(-13.2, 9.0), cp(-11.6, 8.8), cp(-10, 8.5), cp(-9, 7.5),
  cp(-7.2, 7.5), cp(-5.8, 8.5), cp(0, 8.5), cp(6.2, 8.5), cp(7.4, 7.6), cp(6.6, 4.4), cp(6, 2.8),
  cp(6, 0), cp(6, -2), cp(6.6, -4), cp(6.7, -5.2), cp(6.8, -6.6), cp(7.6, -8), cp(9.2, -8.1), cp(10.3, -7.2),
  cp(11.7, -7), cp(13, -7), cp(14, -7), cp(16.2, -7.3), cp(17.9, -7.6), cp(17.9, -3.6), cp(19.2, -2.6),
  cp(19, -1.2), cp(17.2, -0.3),
];

const BEAN_SPAWNS = [
  cp(-20.5, 0.5), cp(-8, -0.8), cp(2.5, 0.9), cp(11.5, -1), cp(-15, 4.5), cp(-18.6, 10.5),
  cp(-11.3, 11.5), cp(-7, 5.2), cp(2.5, 5), cp(10.8, 10.2), cp(-3.5, 11.9),
  cp(-19, -8), cp(-15.2, -12), cp(-8, -5.5), cp(0, -10.5), cp(-4, -3.5),
  cp(6.6, -7.6), cp(10.8, -5), cp(12.8, -10.8), cp(15.2, -8.2), cp(21, -7), cp(18, -11.2),
  cp(14.4, 3.2), cp(20.8, 6.3), cp(15, 9.8), cp(19, 8.3),
];
// the bean-to-cup machine on the canteen counter
const COFFEE_MACHINE = { x: u(21.1), z: u(-2.45), deliverX: u(21.1), deliverZ: u(-3.9), radius: u(1.3) };

const BATTERY_SPAWN = cp(6, 0); // the box junction

// RC Soccer — the Shipping Hall. Goals: the fence gate to Goods In (x −12)
// and the door in the block wall to Packing (x 4).
const SOCCER = {
  ballSpawn: { x: u(-4), z: u(-7.5), y: u(0.5) },
  ballRadius: u(0.42),
  goals: [
    { team: 0, x: u(-12), z: u(-7.5), dir: 1, width: u(1.8), name: 'Goods-In Goal' },
    { team: 1, x: u(4), z: u(-7.5), dir: -1, width: u(1.8), name: 'Packing Goal' },
  ],
  arena: { minX: u(-12), maxX: u(4), minZ: u(-13), maxZ: u(-2) },
  kickoff: [
    { x: u(-7.5), z: u(-6.5), rotY: Math.PI / 2 }, { x: u(-7.5), z: u(-8.5), rotY: Math.PI / 2 },
    { x: u(-9.5), z: u(-7.5), rotY: Math.PI / 2 }, { x: u(-7.5), z: u(-4.5), rotY: Math.PI / 2 },
    { x: u(-0.5), z: u(-6.5), rotY: -Math.PI / 2 }, { x: u(-0.5), z: u(-8.5), rotY: -Math.PI / 2 },
    { x: u(1.5), z: u(-7.5), rotY: -Math.PI / 2 }, { x: u(-0.5), z: u(-4.5), rotY: -Math.PI / 2 },
    { x: u(-6.5), z: u(-10.5), rotY: Math.PI / 2 }, { x: u(-9.5), z: u(-4.5), rotY: Math.PI / 2 },
    { x: u(-1.5), z: u(-10.5), rotY: -Math.PI / 2 }, { x: u(1.5), z: u(-4.5), rotY: -Math.PI / 2 },
  ],
};

const KOTH_SPOTS = [
  // in walking order round the floor (the next spot is drawn at random; the
  // order only keeps neighbours next to each other in the list)
  cp(-17, -8.2), // Goods In
  cp(-19, 0), // the aisle's west end, under the logo
  cp(-15, 5.5), // rack aisle 2
  cp(-12.1, 6.2), // rack aisle 3
  cp(-3, 4.0), // Line 2, in front of the robot cells
  cp(6, 0), // the box junction
  cp(17, 4.2), // QA
  cp(14.8, 9.8), // the clean room
  cp(19.8, 9.6), // the supervisor's office
  cp(18, -8.2), // the canteen
  cp(6.6, -10.6), // the stretch-wrap turntable: it throws you off
  cp(-4, -7.5), // centre spot, under the fan
];

// the ring shrinks toward the middle of the Shipping Hall, under the fan
const SUMO_ZONE = { x: u(-4), z: u(-7.5), r0: u(34), r1: u(0.6) };

const POWERUP_PADS = [
  cp(-2, 0.9), cp(10.8, -0.9), cp(-17, 0.2),
  cp(-18.6, 8.8), cp(-11.3, 3.8),
  cp(3.5, 4.6), cp(10.5, 4.6),
  cp(-17.2, -10.4), cp(-7, -10.8), cp(0, -4.2),
  cp(6.2, -6.4), cp(17.4, -9.6), cp(15.4, 3.9),
];

const VENDING = { x: u(16.4), z: u(-12.55), radius: u(1.5), minSpeed: 12, cooldownS: 8, goldenChance: 0.3 };
const PRINTER = { x: u(20.9), z: u(3.2), radius: u(5), minIntervalS: 22, maxIntervalS: 42, blindS: 1.4 };

// The AGV follows the blue tape loop down the aisle: west along the south
// half, back east along the north.
const ROBOT_PATH = [cp(-20.2, -0.6), cp(11.5, -0.6), cp(11.5, 0.6), cp(-20.2, 0.6)];

// ---- dressing (client only; themes/factory.jsx) — all in meters
// Floor paint. The aisle: green walkways along both edges, yellow lines
// between them and the forklift lane, a zebra where people cross, the box
// junction where the lap does. Stencils: [text, x, z, height, rotY, colour]
// with rotY turning the text's top toward the reader's direction of travel
// (0: reads heading south, π: north, π/2: west, −π/2: east).
const MARKINGS = {
  lines: [
    [-22, 1.22, 22, 1.22], [-22, -1.22, 22, -1.22],
    // soccer: halfway line and the two goal boxes
    [-4, -12.9, -4, -2.1, 0.1], [-12, -9.6, -10.6, -9.6], [-10.6, -9.6, -10.6, -5.4], [-10.6, -5.4, -12, -5.4],
    [4, -9.6, 2.6, -9.6], [2.6, -9.6, 2.6, -5.4], [2.6, -5.4, 4, -5.4],
    // stop bars at the gates onto the aisle
    [-9, -2.35, -7.2, -2.35, 0.15, '#f4f4f0'], [0, -2.35, 1.8, -2.35, 0.15, '#f4f4f0'], [5, -2.35, 7, -2.35, 0.15, '#f4f4f0'],
    [-17.5, -2.35, -14.5, -2.35, 0.15, '#f4f4f0'], [18.3, -2.35, 20.1, -2.35, 0.15, '#f4f4f0'],
    [-8, 2.35, -6, 2.35, 0.15, '#f4f4f0'], [5, 2.35, 7, 2.35, 0.15, '#f4f4f0'],
    // shipping lanes along the south wall
    ...[-11.6, -8.8, -6, -3.2, -0.4, 2.2].map((x) => [x, -12.9, x, -10.4, 0.08, '#f4f4f0']),
    // store: bay lines at the foot of each rack face
    ...[-20.4, -16.8, -13.2].flatMap((x) => [[x - 0.62, 3, x - 0.62, 12.6], [x + 0.62, 3, x + 0.62, 12.6]]),
    // Line 2: a walkway edge along the fence, the lane to the crossing
    [-9.9, 2.9, 4.8, 2.9], [7.4, 2.9, 8.4, 2.9],
  ],
  // [x, z, w, d, colour]: green walkways along both sides of the aisle
  areas: [
    [0, 1.56, 44, 0.6, '#2f7148'], [0, -1.56, 44, 0.6, '#2f7148'],
    [-2.55, 2.45, 14.7, 0.8, '#2f7148'], [7.9, 2.45, 1, 0.8, '#2f7148'],
    // the tacky mat inside the clean room door (it grabs the tyres)
    [12.8, 10.1, 1.2, 1.8, '#c4d3e4'],
  ],
  zebras: [[-7.6, 0, 1.2, 2.3]],
  junctions: [[6, 0, 2, 2.3]],
  circles: [[-4, -7.5, 1.8, 0.1], [6.6, -10.6, 1.25, 0.08], [-12, 0.55, 0.42, 0.07, '#d8322a'], [12.2, -0.55, 0.42, 0.07, '#d8322a']],
  // [x, z, w, d, rotY]: black and yellow
  hazard: [
    // ESD tape round the SMT room's floor
    [14.75, 7.25, 5.3, 0.1], [14.75, 12.75, 5.3, 0.1], [17.2, 10, 0.1, 5.4],
    [-2.2, 5.85, 3.8, 0.3], [4.2, 5.85, 3.8, 0.3], [-4.15, 6.9, 0.3, 1.6], [-0.25, 6.9, 0.3, 1.6], [2.25, 6.9, 0.3, 1.6], [6.15, 6.9, 0.3, 1.6],
    [-18.5, -12.6, 3, 0.35], [-14.5, -12.6, 3, 0.35], [-21.6, -8.25, 0.35, 3.5],
    [9.2, -7.85, 0.9, 0.3], [9.2, 2.35, 1.3, 0.3], [9.2, -2.35, 1.3, 0.3], [-9.85, 8.5, 0.3, 1],
    [-14.2, -5.5, 2.4, 0.22], [-15.97, -8.2, 1, 0.2],
  ],
  stencils: [
    ['GOODS IN', -16, -3.5, 0.5, 0], ['SHIPPING', -4, -3.4, 0.5, 0], ['PACKING', 6, -4.2, 0.4, 0],
    ['LINE 2', -1.2, 4.2, 0.55, Math.PI], ['LINE 2', 8, 4.9, 0.3, 0, '#f2c200'],
    ['STOP', -8.1, -2.8, 0.32, Math.PI], ['STOP', 0.9, -2.8, 0.32, Math.PI], ['STOP', 6, -2.8, 0.32, Math.PI, '#f2c200'],
    ['STOP', -16, -2.8, 0.32, Math.PI], ['STOP', 19.2, -2.8, 0.32, Math.PI, '#f2c200'], ['STOP', -7, 2.8, 0.32, 0], ['STOP', 6, 2.8, 0.32, 0, '#f2c200'],
    ['5', -12, 0.55, 0.4, Math.PI / 2, '#16181a'], ['5', 12.2, -0.55, 0.4, -Math.PI / 2, '#16181a'],
    ['A-01', -19.4, 4.2, 0.2, Math.PI, '#f2c200'], ['A-02', -19.4, 6.6, 0.2, Math.PI, '#f2c200'],
    ['A-03', -19.4, 9, 0.2, Math.PI, '#f2c200'], ['A-04', -19.4, 11.4, 0.2, Math.PI, '#f2c200'],
    ['A-05', -15.8, 4.2, 0.2, Math.PI, '#f2c200'], ['A-06', -15.8, 6.6, 0.2, Math.PI, '#f2c200'],
    ['A-07', -15.8, 9, 0.2, Math.PI, '#f2c200'], ['A-08', -15.8, 11.4, 0.2, Math.PI, '#f2c200'],
    ['LANE 1', -10.2, -11.2, 0.22, Math.PI], ['LANE 2', -7.4, -11.2, 0.22, Math.PI], ['LANE 3', -4.6, -11.2, 0.22, Math.PI],
    ['LANE 4', -1.8, -11.2, 0.22, Math.PI], ['LANE 5', 0.9, -11.2, 0.22, Math.PI],
    ['AGV', -15, 0.6, 0.2, Math.PI / 2, '#1f6fd6'], ['AGV', 2, -0.6, 0.2, -Math.PI / 2, '#1f6fd6'],
    ...[-18, -10, -2, 6, 14].flatMap((x) => [['👣', x, 1.56, 0.3, 0], ['👣', x + 4, -1.56, 0.3, Math.PI]]),
  ],
};

// wall signs: at [x, y, z] meters, rotY, width in meters (wide: a logo)
const SIGNS = [
  { text: 'INKORA · WERK 2', wide: true, at: [-21.87, 4.4, 0], rotY: Math.PI / 2, w: 11, fg: '#1f6fd6', bg: 'rgba(0,0,0,0)' },
  { text: 'LINE 2 · JX-40', wide: true, at: [21.87, 4.4, 0], rotY: -Math.PI / 2, w: 8, fg: '#3a3d42', bg: 'rgba(0,0,0,0)' },
  { text: 'CANTEEN', sub: 'HELMETS OFF · FORKLIFTS OUT', at: [16.9, 2.2, -1.89], rotY: 0, w: 1.4 },
  { text: 'QA TEST BAY', sub: 'EVERY PRINTER. EVERY PAGE.', at: [17, 2.4, 1.91], rotY: Math.PI, w: 1.6, bg: '#1f6fd6', fg: '#ffffff' },
  { text: 'SMT', sub: 'ESD PROTECTED AREA', at: [11.91, 2.4, 12], rotY: -Math.PI / 2, w: 1.2, bg: '#f2c200' },
  { text: 'SUPERVISOR', sub: 'KNOCK. THEN WAIT.', at: [18.4, 2.2, 6.89], rotY: Math.PI, w: 1.2 },
  { text: 'DOCK 1', at: [-18.5, 3.6, -12.89], rotY: 0, w: 1.1, bg: '#16181a', fg: '#f2c200' },
  { text: 'DOCK 2', at: [-14.5, 3.6, -12.89], rotY: 0, w: 1.1, bg: '#16181a', fg: '#f2c200' },
  { text: 'DOCK 3', at: [-21.89, 3.6, -8.25], rotY: Math.PI / 2, w: 1.1, bg: '#16181a', fg: '#f2c200' },
  { text: 'DANGER', sub: 'ROBOT CELL · KEEP OUT', at: [-2.2, 1.3, 6.03], rotY: Math.PI, w: 0.9, bg: '#f2c200' },
  { text: 'DANGER', sub: 'ROBOT CELL · KEEP OUT', at: [4.2, 1.3, 6.03], rotY: Math.PI, w: 0.9, bg: '#f2c200' },
  { text: 'EXIT', exit: true, at: [-21.89, 3, -3.5], rotY: Math.PI / 2, w: 0.7 },
  { text: 'EXIT', exit: true, at: [21.89, 2.6, -8], rotY: -Math.PI / 2, w: 0.7 },
  { text: 'EXIT', exit: true, at: [-12, 3, 12.89], rotY: Math.PI, w: 0.7 },
];
// zone boards hanging from the trusses: yellow on black, readable both ways
const HANGING = [
  { text: 'LINE 2', sub: 'JX-40 ASSEMBLY', at: [1, 2.6], y: 4.3, w: 2.2 },
  { text: 'HIGH-BAY STORE', sub: 'AISLES A · B · C', at: [-16, 2.6], y: 5.2, w: 2.4 },
  { text: 'SHIPPING', sub: 'LANES 1–5', at: [-4, -2.6], y: 4.3, w: 2 },
  { text: 'GOODS IN', sub: 'DOCKS 1–3', at: [-17, -2.6], y: 4.3, w: 2 },
  { text: 'PACKING', at: [12, -2.6], y: 4.3, w: 1.6 },
];
// fire points on the outer walls: [x, z, rotY facing into the room]
const FIRE_POINTS = [[-21.9, 1.2, Math.PI / 2], [-7.5, 12.9, Math.PI], [7, 12.9, Math.PI], [-6, -12.9, 0], [21.9, -1.3, -Math.PI / 2], [-21.9, 10.5, Math.PI / 2]];

export const FACTORY = {
  id: 'factory',
  name: 'Werk 2',
  blurb: 'Printer assembly. Ride the conveyor, dodge the robots, and hope the Andon board stays green.',
  theme: 'factory',
  MAP_BOUNDS, WALL_HEIGHT, ROOMS, WALLS, FURNITURE, RAMPS, PROPS,
  // a 100 m lap: two of them, like upstairs
  RACE_LAPS: 2,
  SPAWNS, REVERSE_SPAWN_ROTY: Math.PI, // the reverse lap leaves south, into the canteen
  CHECKPOINTS, BOT_PATH, BEAN_SPAWNS, COFFEE_MACHINE, BATTERY_SPAWN, SOCCER,
  KOTH_SPOTS, SUMO_ZONE, POWERUP_PADS, VENDING, PRINTER, ROBOT_PATH,
  // the scoreboards: one in the canteen, one on the Shipping Hall's goal
  // wall where the soccer crowd can see it (meters, on a wall face)
  BOARDS: {
    boards: [
      { at: [21.88, 1.6, -6.2], rotY: -Math.PI / 2 },
      { at: [3.88, 1.75, -11], rotY: -Math.PI / 2 },
    ],
    clock: { at: [21.88, 2.25, -3.9], rotY: -Math.PI / 2 },
    memos: { at: [14.12, 1.5, -11.2], rotY: Math.PI / 2 },
  },
  // the events, as this floor has them
  EVENTS: {
    server_overload: { name: 'Line Stop', icon: '🚨', desc: 'Andon red on Line 2. Everyone is looking at you.' },
    cleaning_robot: { name: 'AGV Patrol', icon: '🤖', desc: 'The automated cart follows its tape. It does not brake for cars.' },
    paper_storm: { name: 'QA Test Print', icon: '📄', desc: 'Every printer in QA runs a test page. At once.' },
  },
  // Surfaces that aren't the floor's own (world units). The belts carry you
  // at 1 m/s (4.4 units/s) — only on top of them: y0..y1 is the height band
  // of a car riding the belt, so the ground twin underneath is untouched.
  ZONES: [
    { x: u(-0.2), z: u(8.5), w: u(14.8), d: u(0.8), push: [u(1), 0], y0: u(0.72), y1: u(1.2) },
    { x: u(8.4), z: u(7.7), w: u(2.4), d: u(2.4), push: [u(0.7), u(-0.7)], y0: u(0.72), y1: u(1.2) },
    { x: u(9.2), z: u(4.75), w: u(0.8), d: u(3.5), push: [0, u(-1)], y0: u(0.72), y1: u(1.55) },
    { x: u(9.2), z: u(0.1), w: u(0.8), d: u(5.8), push: [0, u(-1)], y0: u(1.08), y1: u(1.55) },
    { x: u(9.2), z: u(-4.6), w: u(0.8), d: u(3.6), push: [0, u(-1)], y0: u(0.22), y1: u(1.55) },
    { x: u(-0.7), z: u(9.6), w: u(14.8), d: u(0.8), push: [u(0.5), 0], y0: u(0.72), y1: u(1.2) },
    // paper on the QA floor: test pages everywhere, no grip
    { x: u(17.4), z: u(3.7), w: u(6), d: u(2.4), grip: 0.55 },
    // the sticky mat at the clean room door (grabs the tyres), and the oil
    // the forklift leaves wherever it parks
    { x: u(12.8), z: u(10.1), w: u(1.2), d: u(1.8), grip: 1.35, top: 0.85 },
    { x: u(-13.3), z: u(-4.9), w: u(1.4), d: u(1.1), grip: 0.45 },
  ],
  // concrete stains (oil under the forklift, tyre marks at the doors):
  // [x, z, size] in meters
  STAINS: [[-13.3, -4.9, 2.2], [-18.5, -11.5, 2.4], [-14.5, -11.2, 2], [-21, -8.2, 1.8], [10.4, -10.4, 1.6], [-16.2, 5.8, 1.6], [-11.4, 10.6, 1.5]],
  LOOK: {
    // painted block: pale above, a 2 m grey dado band below (the theme)
    wall: '#e9ebe8', skirt: '#3a3e42',
    floors: { epoxy: '#a6b0b2', concrete: '#8a8b84', tile: '#e0dcd2', carpet: '#7c8792', dark: '#b8c4cc', rubber: '#555a5e' },
  },
  // high-bay LED point lights (meters), one per zone of the hall
  CEILING_LIGHTS: [[-16, 7.5], [-16, -7.5], [-4, -7.5], [1, 7.5], [9, -7.5], [18, -7.5], [17, 7.5]],
  // The light: a sawtooth roof glazed to the north gives soft, even sky
  // light at every hour; the key stays high (it is the roof, not a sun),
  // and what changes through the day is its colour and the glazing's.
  // At night the skylights go deep blue and the 5000 K high-bays and the
  // machines' own lights do all the work.
  LIGHTING: {
    morning: {
      label: 'Early shift', clock: '06:40',
      sun: { pos: [70, 210, -60], color: '#e8f0ff', intensity: 1.25 },
      amb: { intensity: 0.26, color: '#d6e2f6' },
      hemi: { intensity: 0.42, sky: '#e4eeff', ground: '#3c3c38' },
      ceiling: 26,
      env: {
        intensity: 0.55, bg: '#1a2230',
        window: { color: '#cfe0ff', intensity: 2.2 }, ceil: { color: '#f2f6ff', intensity: 2.6 },
        warm: { color: '#ffd9a8', intensity: 0.5 }, key: { color: '#eef4ff', intensity: 1.4 },
      },
      shaft: { opacity: 0, color: '#dbe8ff', tilt: 0.99, yaw: 0, length: 22 },
      pool: 0.08, panel: 1.4,
      bloom: { intensity: 0.6, threshold: 0.8 },
      shadow: { bias: -0.0002, normalBias: 0.04, opacity: 0.62 },
      practical: 0.5, wet: false,
    },
    afternoon: {
      label: 'Day shift', clock: '13:10',
      sun: { pos: [40, 230, 30], color: '#fff9f0', intensity: 1.5 },
      amb: { intensity: 0.3, color: '#e6ecf4' },
      hemi: { intensity: 0.5, sky: '#f2f6ff', ground: '#46443e' },
      ceiling: 22,
      env: {
        intensity: 0.65, bg: '#28303a',
        window: { color: '#ffffff', intensity: 3 }, ceil: { color: '#f6f8ff', intensity: 2.8 },
        warm: { color: '#ffe6c4', intensity: 0.6 }, key: { color: '#ffffff', intensity: 1.8 },
      },
      shaft: { opacity: 0, color: '#fff4dc', tilt: 1.2, yaw: 0, length: 20 },
      pool: 0.06, panel: 1.3,
      bloom: { intensity: 0.6, threshold: 0.8 },
      shadow: { bias: -0.0002, normalBias: 0.04, opacity: 0.66 },
      practical: 0.4, wet: false,
    },
    golden: {
      label: 'Late shift', clock: '18:50',
      sun: { pos: [-60, 200, 40], color: '#ffe6c8', intensity: 1.25 },
      amb: { intensity: 0.24, color: '#d9d4d8' },
      hemi: { intensity: 0.42, sky: '#e8e2e8', ground: '#44382c' },
      ceiling: 26,
      env: {
        intensity: 0.55, bg: '#2a2020',
        window: { color: '#ffc890', intensity: 2.4 }, ceil: { color: '#f2f4ff', intensity: 2.4 },
        warm: { color: '#ffb070', intensity: 0.9 }, key: { color: '#fff0e0', intensity: 1.4 },
      },
      shaft: { opacity: 0, color: '#ffb266', tilt: 0.9, yaw: 0, length: 22 },
      pool: 0.08, panel: 1.4,
      bloom: { intensity: 0.62, threshold: 0.78 },
      shadow: { bias: -0.0002, normalBias: 0.04, opacity: 0.6 },
      practical: 0.55, wet: false,
    },
    night: {
      label: 'Night shift', clock: '02:15',
      sun: { pos: [30, 220, 20], color: '#dfe6ff', intensity: 0.8 },
      amb: { intensity: 0.14, color: '#b4c0dc' },
      hemi: { intensity: 0.26, sky: '#c4d0f0', ground: '#28262a' },
      ceiling: 34,
      env: {
        intensity: 0.4, bg: '#060a14',
        window: { color: '#1e2e5a', intensity: 1 }, ceil: { color: '#eef2ff', intensity: 2.4 },
        warm: { color: '#ffb46a', intensity: 0.5 }, key: { color: '#dfe6ff', intensity: 0.9 },
      },
      shaft: { opacity: 0, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
      pool: 0.14, panel: 1.8,
      bloom: { intensity: 0.75, threshold: 0.72 },
      shadow: { bias: -0.0002, normalBias: 0.04, opacity: 0.55 },
      practical: 1, wet: false,
    },
    // a power cut: the high-bays die, the skylights still let a little sky
    // in, the emergency lights and the machines on UPS do the rest
    lightsOut: {
      label: 'Power cut', clock: '--:--',
      sun: { pos: [30, 220, 20], color: '#9fb4e0', intensity: 0.32 },
      amb: { intensity: 0.1, color: '#8f9ec4' },
      hemi: { intensity: 0.22, sky: '#8fa4d4', ground: '#1a1814' },
      ceiling: 0,
      env: {
        intensity: 0.12, bg: '#05060a',
        window: { color: '#3a4e88', intensity: 0.8 }, ceil: { color: '#3a4e88', intensity: 0.5 },
        warm: { color: '#4a3a28', intensity: 0.2 }, key: { color: '#5a6480', intensity: 0.3 },
      },
      shaft: { opacity: 0, color: '#8fa8ff', tilt: 0.99, yaw: 0, length: 22 },
      pool: 0, panel: 0.02,
      bloom: { intensity: 0.7, threshold: 0.7 },
      shadow: { bias: -0.0002, normalBias: 0.04, opacity: 0.3 },
      practical: 0.9, wet: false,
    },
    // the ceiling point lights: 5000 K, and they reach across the hall
    points: { color: '#f2f6ff', distance: 30 },
    glow: { at: [13.5, 0], color: '#ffae3d' }, // the Andon board
  },
  // the skylight glazing, per hour (the theme lights it)
  SKY: { morning: '#cddcf4', afternoon: '#e6eef8', golden: '#f4d2ae', night: '#0e1a3a' },
  MARKINGS, SIGNS, HANGING, FIRE_POINTS,
  // the Andon portal over the grid, its legs the columns at z ±1.8
  ANDON: { x: 13.5, z: 0, span: 3.6 },
  // the safety board on the canteen wall, facing the aisle
  SAFETY: { at: [15.2, 1.55, -1.89], rotY: 0 },
  // paper on the floor: [x, z, sheets, spread (m)] — QA's printers never stop
  PAPER: [[20.2, 3.6, 14, 1.2], [17.4, 5.4, 9, 1.4], [14.8, 3, 6, 0.8], [11.2, -12.1, 4, 0.6]],
  // strip curtains in the lab doorways: [x, z, width, rotY]
  CURTAINS: [[12, 4.3, 1.8, Math.PI / 2], [12, 10.1, 1.8, Math.PI / 2]],
  // the HVLS fan over the Shipping Hall (and the sumo ring)
  FAN: [-4, -7.5],
  // machinery through the floor, a little ballast hum, no rain
  AMBIENCE: { rain: false, rumble: 0.8, hum: 0.2 },
};
