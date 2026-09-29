// ---------------------------------------------------------------------------
// THE 48TH FLOOR — the management tower. Floor-to-ceiling glass on every side
// with the city two hundred metres down, a marble sky lobby, and in the
// middle of it all the war room: an eight-metre boardroom table under a wall
// of screens. Power, quiet and height — and 18 cm cars.
// Authored in real-world meters, exported in world units, like the others.
//
// Floor plan (meters, x: -21..21 west→east, z: -12..12 south→north). The
// rooms ring a solid building core, like a real skyscraper floor, so the lap
// is a ring road:
//
//   ┌──────────────┬─────────────────────┬──────────────┐
//   │ CORNER OFFICE│      WAR ROOM       ░  SKY TERRACE │ (open air,
//   │ green, slab  ║ ramp▸════ table ════ ░▸ bench, wind │  glass
//   │ desk, globe  d   (the video wall)  ░               │  balustrade)
//   ├────d─────────┼──glass────┬d┬─────┬┴──────d───────┤
//   │ EXEC LOUNGE  │ core: lifts│ante│comms│ EXEC PANTRY  │
//   │ fire, piano, ═══ service corridor ═══ coffee, fizz │
//   │ bar          │ (solid)    lifts       │             │
//   ├────d─────────┼────────────────────────┼───────d─────┤
//   │ ASSISTANTS'  │      SKY LOBBY         │  ANALYST     │
//   │ ROW  ▣exec▣  G  reception · grid ◂◂   G  BULLPEN    │
//   │ glass offices│      (RC Soccer)       │  desk slalom │
//   └──────────────┴────────────────────────┴──────────────┘
//
// Desk Dash (~100 m, two laps): west out of the lobby, north through the
// assistants' row, the lounge past the fire and the CEO's office across the
// putting green, then STRAIGHT through his private door and up a stack of
// annual reports onto the boardroom table — eight metres of lacquered walnut
// between the carafes, launching off the far end at the video wall. The low
// line (and the bots) run under the table between the pedestals. Out the
// glass slider into the wind on the terrace, through the pantry, a slalom
// round the analysts' desk rows, and back into the lobby.
// ---------------------------------------------------------------------------
import { M } from '../constants.js';

const u = (v) => v * M;
const H = 3.3; // a tower floor: tall glass, a high ceiling

const MAP_BOUNDS = { minX: u(-21), maxX: u(21), minZ: u(-12), maxZ: u(12) };
const WALL_HEIGHT = u(H);

const ROOMS = [
  { id: 'tower_assistants', name: "Assistants' Row", x: u(-14), z: u(-8), w: u(14), d: u(8), floor: 'carpet' },
  { id: 'tower_lobby', name: 'Sky Lobby', x: u(0), z: u(-8), w: u(14), d: u(8), floor: 'marble' },
  { id: 'tower_bullpen', name: 'Analyst Bullpen', x: u(14), z: u(-7), w: u(14), d: u(10), floor: 'carpet' },
  { id: 'tower_lounge', name: 'Executive Lounge', x: u(-14), z: u(-0.5), w: u(14), d: u(7), floor: 'wood' },
  { id: 'tower_core', name: 'Building Core', x: u(0), z: u(-0.5), w: u(14), d: u(7), floor: 'tile' },
  { id: 'tower_pantry', name: 'Executive Pantry', x: u(14), z: u(0.5), w: u(14), d: u(5), floor: 'tile' },
  { id: 'tower_ceo', name: 'Corner Office', x: u(-15), z: u(7.5), w: u(12), d: u(9), floor: 'wood' },
  { id: 'tower_warroom', name: 'The War Room', x: u(-1), z: u(7.5), w: u(16), d: u(9), floor: 'carpet2' },
  { id: 'tower_terrace', name: 'Sky Terrace', x: u(14), z: u(7.5), w: u(14), d: u(9), floor: 'concrete', outdoor: true },
];

const wall = (x, z, w, d, opts = {}) => ({
  x: u(x), z: u(z), w: u(w), d: u(d), h: u(opts.h ?? H), glass: !!opts.glass, low: !!opts.low,
  ...(opts.style ? { style: opts.style } : {}),
});
const hwall = (z, x1, x2, gaps = [], opts = {}) => {
  const t = opts.t ?? (opts.glass ? 0.15 : 0.2);
  const pts = [x1, ...gaps.flat(), x2];
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i + 1] - pts[i] > 0.05) out.push(wall((pts[i] + pts[i + 1]) / 2, z, pts[i + 1] - pts[i], t, opts));
  }
  return out;
};
const vwall = (x, z1, z2, gaps = [], opts = {}) => {
  const t = opts.t ?? (opts.glass ? 0.15 : 0.2);
  const pts = [z1, ...gaps.flat(), z2];
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i + 1] - pts[i] > 0.05) out.push(wall(x, (pts[i] + pts[i + 1]) / 2, t, pts[i + 1] - pts[i], opts));
  }
  return out;
};

// the facade: floor-to-ceiling glass, drawn by the theme (mullions, the city)
const CURTAIN = { glass: true, style: 'tower_curtain' };
// interior glass: executive offices, the war room, a frosted band at eye height
const GLASS = { glass: true, style: 'tower_glass' };
// book-matched marble cladding and the building core (lift doors live on it)
const STONE = { style: 'tower_stone' };
const CORE = { style: 'tower_core' };

const WALLS = [
  // ----------------------------------------------------------------- facade
  ...hwall(-12, -21.1, 21.1, [], CURTAIN),
  ...vwall(-21, -12, 12, [], CURTAIN),
  ...hwall(12, -21.1, 7.08, [], CURTAIN),
  ...vwall(21, -12.07, 3.07, [], CURTAIN),
  // the setback: the terrace is cut out of the tower's north-east corner
  ...hwall(3, 7.08, 21.1, [[17.6, 19.4]], CURTAIN), // pantry | terrace, the terrace door
  ...vwall(7, 3.07, 12.07, [[3.6, 5.8]], CURTAIN), // war room | terrace, the glass slider
  // the terrace's own edge: a glass balustrade (a taller collider than it
  // looks — nobody leaves the 48th floor that way)
  ...hwall(12, 7.08, 21.1, [], { low: true, h: 2, style: 'tower_balustrade' }),
  ...vwall(21, 3.07, 12.07, [], { low: true, h: 2, style: 'tower_balustrade' }),

  // --------------------------------------------------------------- the core
  // south block: the lift shafts, faced in marble with six brass lift doors
  wall(-0.05, -2.6, 13.9, 2.8, CORE),
  // north-west block: stairs and washrooms
  wall(-5, 1.6, 4, 2.8, CORE),
  // the comms cupboard (north-east): racks behind a door off the anteroom
  ...vwall(3, 0.2, 3, [[1.3, 2.3]]),
  ...hwall(0.3, 3.1, 6.9),
  ...hwall(3, 3, 6.9),
  // war room | core: glass with a frosted band; the war room's door
  ...hwall(3, -3, 3, [[-1, 0.8]], GLASS),
  // lounge | war room: glass
  ...hwall(3, -9.07, -7, [], GLASS),

  // ------------------------------------------------------------ lobby sides
  ...vwall(-7, -12, -4, [[-8.9, -7.1]], STONE), // West Goal
  ...vwall(7, -12, -4, [[-8.9, -7.1]], STONE), // East Goal
  // pantry | comms cupboard (south of the service corridor's east mouth,
  // the lift block's own face is the wall)
  ...vwall(7, 0.2, 3.07),

  // --------------------------------------------------------- west quarter
  ...hwall(-4, -21, -7, [[-15, -13.2]]), // assistants | lounge
  ...hwall(3, -21, -9.07, [[-17, -15.2]]), // lounge | CEO
  ...vwall(-9, 3.07, 12, [[7, 8.8]], GLASS), // CEO | war room, the private door
  // the executives' glass offices behind the assistants' desks
  ...vwall(-16.5, -12, -4, [[-10.7, -9.7], [-6.3, -5.3]], GLASS),
  ...hwall(-8, -21, -16.575, [], GLASS),

  // --------------------------------------------------------- east quarter
  ...hwall(-2, 7.1, 21, [[18.8, 20.6]]), // pantry | bullpen
];

const f = (type, x, z, w, d, h, rotY = 0, extra = {}) => ({ type, x: u(x), z: u(z), w: u(w), d: u(d), h: u(h), rotY, ...extra });
const DECOR = { decor: true };
const UNDER = { driveUnder: true };

const FURNITURE = [
  // ---- Sky Lobby: the onyx reception desk against the core, a bronze on a
  // plinth by the glass, a bench, and the black-marble compass on the grid
  f('tower_reception', 0, -5.35, 4.2, 1.3, 1.1, Math.PI),
  f('tower_plinth', 0, -11.2, 0.8, 0.8, 0.9),
  f('tower_bench', -4.6, -11.45, 1.8, 0.6, 0.42),
  f('tower_bench', 4.6, -11.45, 1.8, 0.6, 0.42),
  f('tower_star', 1.2, -8, 2.4, 2.4, 0.01, 0, DECOR),

  // ---- Assistants' Row: four assistants facing their bosses' glass boxes
  f('tower_desk', -12.4, -10.5, 1.6, 0.8, 0.74, Math.PI, UNDER), f('tower_desk', -10.2, -10.5, 1.6, 0.8, 0.74, Math.PI, UNDER),
  f('tower_desk', -10.9, -5.5, 1.6, 0.8, 0.74, 0, UNDER), f('tower_desk', -8.7, -5.5, 1.6, 0.8, 0.74, 0, UNDER),
  f('tower_credenza', -12, -11.65, 3.2, 0.45, 0.72),
  // inside the glass offices
  f('tower_desk', -19, -10.3, 1.8, 0.85, 0.74, 0, UNDER), f('tower_desk', -19, -6.1, 1.8, 0.85, 0.74, Math.PI, UNDER),
  f('tower_credenza', -18.9, -11.65, 2, 0.45, 0.72),
  f('tower_credenza', -18.9, -4.33, 2, 0.45, 0.72, Math.PI),

  // ---- Executive Lounge: the fire between two chesterfields, the bar, the piano
  f('tower_rug', -18.5, -0.5, 4.2, 3.6, 0.01, 0, DECOR),
  f('tower_fireplace', -18.5, -0.5, 0.5, 1.8, 0.9),
  f('tower_sofa', -18.5, 1.45, 2.1, 0.9, 0.8, Math.PI),
  f('tower_art', -18.5, 2.85, 1.6, 0.1, 1.2, Math.PI, DECOR),
  f('tower_art', -10.4, -4.15, 1.4, 0.1, 1.1, Math.PI, DECOR),
  f('tower_art', -12, 3.15, 1.3, 0.1, 1.0, 0, DECOR),
  f('tower_sofa', -18.5, -2.45, 2.1, 0.9, 0.8),
  f('tower_bar', -9.9, -2.4, 3, 0.65, 1.05),
  f('tower_backbar', -9.9, -3.72, 3.4, 0.36, 2.2),
  f('tower_piano', -10.9, 1.25, 1.5, 1.9, 1.0, Math.PI, UNDER),

  // ---- Corner Office: the slab desk (drive under it — or up the easel onto
  // it), the putting green, the globe bar, the telescope, the books
  f('tower_ceodesk', -14.8, 10.4, 3.2, 1.1, 0.75, Math.PI, UNDER),
  f('tower_green', -13.4, 7.3, 4, 1.4, 0.01, 0, DECOR),
  f('tower_globe', -19.8, 4.4, 0.9, 0.9, 1.0),
  f('tower_telescope', -20.1, 11.1, 0.7, 0.7, 1.4),
  f('tower_bookcase', -19.2, 3.33, 3.2, 0.45, 2.2),
  f('tower_credenza', -12, 3.33, 3, 0.45, 0.72),
  f('tower_rug', -14.8, 9.9, 4.6, 3, 0.01, 0, DECOR),
  f('tower_sofa', -20.2, 7.6, 2.1, 0.9, 0.8, Math.PI / 2),

  // ---- The War Room: THE table (drive under or along it), the room's
  // credenza under the whiteboard
  f('tower_boardtable', -1.6, 7.6, 8, 1.8, 0.76, 0, UNDER),
  // the video wall's walnut surround, standing in front of the facade glass
  f('tower_mediawall', 6.78, 8.03, 4.1, 0.24, 3.3, -Math.PI / 2),
  f('tower_credenza', -5.5, 11.6, 3.2, 0.45, 0.72, Math.PI),

  // ---- Sky Terrace: the long bench along the pantry glass, olives in big
  // planters round the edge, loungers, the aircraft-warning mast
  f('tower_terracebench', 13.6, 3.72, 5.2, 0.9, 0.45),
  f('tower_olive', 9.4, 10.9, 0.9, 0.9, 0.9),
  f('tower_olive', 12.9, 11.2, 0.9, 0.9, 0.9),
  f('tower_olive', 16.4, 11.2, 0.9, 0.9, 0.9),
  f('tower_olive', 20.2, 9.6, 0.9, 0.9, 0.9),
  f('tower_olive', 20.2, 5.9, 0.9, 0.9, 0.9),
  f('tower_lounger', 10.4, 11.0, 0.7, 1.9, 0.35),
  f('tower_lounger', 18.2, 11.0, 0.7, 1.9, 0.35),
  f('tower_mast', 20.4, 11.4, 0.5, 0.5, 3.4),

  // ---- Executive Pantry: the espresso bar on the east wall, the island
  // (a ramp onto it), the sparkling-water fridge by the bullpen door
  f('tower_espresso', 20.45, 0.5, 0.7, 2.4, 0.92),
  f('tower_fridgewall', 13.3, -1.58, 4.4, 0.6, 2.2),
  f('tower_island', 12.8, 0.6, 3.2, 1.0, 0.92),
  f('vending', 9.2, -1.48, 1, 0.8, 1.9),

  // ---- Analyst Bullpen: three rows of bench desks (triple monitors, a
  // privacy screen down the middle — solid, so the rows are a slalom),
  // glass phone booths, the multifunction printer
  f('tower_deskrow', 16.2, -5.3, 1.6, 6, 0.74),
  f('tower_deskrow', 12.6, -8.7, 1.6, 6.2, 0.74),
  f('tower_deskrow', 9.4, -4.35, 1.6, 4.1, 0.74),
  f('tower_booth', 8.2, -11.3, 1.1, 1.1, 2.2),
  f('tower_booth', 9.5, -11.3, 1.1, 1.1, 2.2),
  f('copier', 20.15, -11.4, 0.9, 0.9, 1.25), // its output tray (+x) stays clear of the glass
  f('tower_credenza', 11.4, -2.33, 2.0, 0.45, 0.72, Math.PI),

  // ---- the core: three racks in the comms cupboard
  f('rack', 4.0, 2.45, 0.6, 0.8, 2.0), f('rack', 4.8, 2.45, 0.6, 0.8, 2.0), f('rack', 5.6, 2.45, 0.6, 0.8, 2.0),
];

const ramp = (x, z, l, w, rise, rotY, skin) => ({ x: u(x), z: u(z), l: u(l), w: u(w), rise: u(rise), rotY, skin });

const RAMPS = [
  // THE ramp: a stack of annual reports up onto the boardroom table, dead in
  // line with the CEO's private door
  ramp(-6.5, 8.0, 1.8, 0.8, 0.76, Math.PI / 2, 'tower_binders'),
  // the easel that fell against the CEO's desk
  ramp(-17.3, 10.4, 1.8, 0.8, 0.75, Math.PI / 2, 'tower_easel'),
  // coffee-table books piled up to the bar
  ramp(-12.4, -2.4, 2.0, 0.7, 1.05, Math.PI / 2, 'tower_books'),
  // a teak step onto the terrace bench, straight out of the war room slider
  // (its top edge meets the bench's end at x 11.0 — no slot to drop a wheel in)
  ramp(10.35, 3.72, 1.3, 0.8, 0.45, Math.PI / 2, 'tower_deck'),
  // crates of sparkling water up onto the pantry island
  ramp(10.2, 0.6, 2.0, 0.7, 0.92, Math.PI / 2, 'tower_crates'),
];

const p = (type, x, z, y = 0, rotY = 0) => ({ type, x: u(x), z: u(z), y: u(y), rotY });
const T = 0.76; // boardroom table top

const PROPS = [
  // ---- the boardroom table: placards, laptops, carafes, a speakerphone of
  // folders — and sixteen leather chairs pulled up round it
  p('tower_placard', -4.4, 7.1, T, 0), p('tower_placard', -2.2, 8.1, T, Math.PI),
  p('tower_placard', 0.2, 7.1, T, 0), p('tower_placard', 1.6, 8.1, T, Math.PI),
  p('tower_laptop', -3.4, 7.05, T, Math.PI), p('tower_laptop', -0.8, 8.15, T, 0), p('tower_laptop', 1.0, 7.05, T, Math.PI + 0.1),
  p('tower_carafe', -3.0, 7.75, T), p('tower_carafe', 0.9, 7.5, T),
  p('glass', -2.8, 7.35, T), p('tower_cup', -2.9, 7.95, T), p('glass', 1.2, 7.4, T), p('tower_cup', 0.6, 7.8, T),
  p('tower_binder', -5.0, 7.9, T, 0.3), p('tower_binder', 2.0, 7.4, T, 1.2),
  ...[-5, -3.9, -2.8, -1.7, -0.6, 0.5, 1.6].flatMap((x) => [
    p('tower_chair', x, 6.25, 0, 0), p('tower_chair', x + 0.3, 8.95, 0, Math.PI),
  ]),
  p('tower_chair', 3.1, 7.6, 0, -Math.PI / 2), p('tower_chair', -6.9, 6.3, 0, Math.PI / 2),

  // ---- Corner Office: his chair, golf balls on the green, a cup of coffee
  p('tower_chair', -14.8, 11.35, 0, Math.PI),
  p('tower_golfball', -12.3, 7.5), p('tower_golfball', -12.9, 7.1), p('tower_golfball', -14.2, 7.6),
  p('tower_golfball', -13.6, 6.9), p('tower_golfball', -11.9, 7.0), p('tower_golfball', -15.0, 7.3),
  p('tower_putter', -15.2, 6.4, 0, 0.4),
  p('tower_laptop', -14.3, 10.55, 0.75, 0), p('tower_cup', -15.9, 10.2, 0.75), p('tower_binder', -13.6, 10.6, 0.75, 0.4),
  p('tower_orchid', -12.8, 3.35, 0.72),

  // ---- Executive Lounge: club chairs round the fire, the brass bar cart,
  // whisky on the bar
  p('tower_clubchair', -16.2, 0.4, 0, -Math.PI / 2), p('tower_clubchair', -16.2, -1.4, 0, -Math.PI / 2),
  p('tower_clubchair', -11.2, -0.6, 0, Math.PI / 2),
  p('tower_barcart', -13.2, -0.9, 0, 0.4),
  p('glass', -10.9, -2.35, 1.05), p('glass', -9.1, -2.45, 1.05), p('bottle', -9.6, -2.35, 1.05), p('glass', -8.7, -2.3, 1.05),
  p('tower_stool', -10.8, -1.75), p('tower_stool', -9.8, -1.75), p('tower_stool', -8.8, -1.75),

  // ---- Assistants' Row: orchids, monitors, the phones that never stop
  p('tower_orchid', -13.0, -10.3, 0.74), p('tower_orchid', -9.6, -10.3, 0.74),
  p('tower_orchid', -11.4, -5.7, 0.74), p('tower_orchid', -19.6, -10.1, 0.74),
  p('tower_monitor', -12.3, -10.75, 0.74), p('tower_monitor', -10.1, -10.75, 0.74),
  p('tower_monitor', -10.9, -5.25, 0.74, Math.PI), p('tower_monitor', -8.8, -5.25, 0.74, Math.PI),
  p('tower_monitor', -19.3, -10.0, 0.74, Math.PI), p('tower_laptop', -19.2, -6.3, 0.74, 0),
  p('tower_taskchair', -12.2, -9.6, 0, 0), p('tower_taskchair', -10.4, -9.7, 0, 0.3),
  p('tower_taskchair', -10.8, -6.4, 0, Math.PI), p('tower_taskchair', -8.7, -6.3, 0, Math.PI - 0.2),
  p('tower_chair', -19, -11.1, 0, 0), p('tower_chair', -19, -5.2, 0, Math.PI),
  p('stack', -11.2, -11.6, 0.72), p('tower_binder', -12.9, -11.65, 0.72), p('tower_binder', -12.6, -11.65, 0.72, 0.1),
  p('trash', -7.6, -11.4), p('tower_briefcase', -15.8, -8.6, 0, 1.2),

  // ---- Sky Lobby: a briefcase left by the lifts, a newspaper on the bench
  p('tower_briefcase', -4.4, -4.5, 0, 0.3), p('stack', 4.4, -11.45, 0.42),
  p('tower_orchid', 1.5, -5.45, 1.1), p('tower_orchid', -1.6, -5.45, 1.1),

  // ---- Analyst Bullpen: chairs along the desk rows, the pile by the printer
  ...[[16.2, -3.2], [16.2, -5.3], [16.2, -7.4], [12.6, -6.6], [12.6, -8.7], [12.6, -10.8], [9.4, -3.3], [9.4, -5.4]].flatMap(([x, z], k) => [
    p('tower_taskchair', x - 1.15, z, 0, Math.PI / 2 + (k % 3) * 0.2), p('tower_taskchair', x + 1.15, z, 0, -Math.PI / 2 - (k % 2) * 0.25),
  ]),
  p('stack', 19.8, -10.6), p('box', 20.3, -9.8), p('box', 20.3, -9.4, 0.4), p('trash', 18.3, -11.4),
  p('tower_cup', 16.0, -4.1, 0.74), p('tower_cup', 12.8, -9.5, 0.74), p('bottle', 9.6, -3.8, 0.74),

  // ---- Executive Pantry: fruit on the island, cups by the machine, stools
  p('tower_fruit', 12.4, 0.6, 0.92), p('tower_cup', 13.6, 0.5, 0.92), p('glass', 13.9, 0.8, 0.92),
  p('tower_cup', 20.45, 1.25, 0.92), p('tower_cup', 20.5, 1.55, 0.92), p('bottle', 20.5, 1.45, 0.92),
  p('tower_stool', 12.0, -0.2), p('tower_stool', 13.0, -0.2), p('tower_stool', 14.0, -0.2),

  // ---- the core: the janitor's cart, parked in the corridor as ever
  p('tower_janitor', -3.4, -0.1, 0, Math.PI / 2), p('trash', 2.4, 0.9), p('box', 2.3, -0.9),

  // ---- the terrace: cushions blown off the loungers
  p('tower_cushion', 11.3, 9.9, 0, 0.3), p('tower_cushion', 16.8, 8.9, 0, 1.1),
];

// Race grid — the lobby, four rows of three on the black-marble band, facing
// west at the West Goal door.
const SPAWNS = Array.from({ length: 12 }, (_, i) => ({
  x: u(1.4 + Math.floor(i / 3) * 1.2),
  z: u(-9.1 + (i % 3) * 1.1),
  rotY: -Math.PI / 2,
}));

const cp = (x, z) => ({ x: u(x), z: u(z) });

const CHECKPOINTS = [
  cp(0, -8), // start/finish, the lobby
  cp(-7, -8), // the West Goal door
  cp(-14, -7.2), // assistants' row
  cp(-14.1, -4), // into the lounge
  cp(-14.6, -0.5), // past the fire
  cp(-16.1, 3), // into the corner office
  cp(-13.6, 7.3), // across the putting green
  cp(-9, 7.9), // the private door — high line or low line?
  cp(4.9, 6.7), // after the table: the lines have merged
  cp(7, 4.7), // the glass slider
  cp(13, 5.2), // the terrace, in the wind
  cp(18.5, 3), // into the pantry
  cp(19.7, -2), // into the bullpen
  cp(16.2, -9.6), // round the first desk row
  cp(12.6, -4.4), // round the second
  cp(7, -8), // the East Goal door
];

// Bot driving line — the low line under the table, round the desk rows,
// clear of every ramp.
const BOT_PATH = [
  cp(0, -8), cp(-3.5, -8), cp(-7, -8), cp(-10.5, -7.8), cp(-14, -7.2), cp(-14.1, -5.3), cp(-14.1, -4),
  cp(-14.3, -2.6), cp(-14.6, -0.5), cp(-15.5, 1.5), cp(-16.1, 3), cp(-15.6, 5.0), cp(-13.6, 7.3),
  cp(-11.2, 7.6), cp(-9, 7.7), cp(-7.8, 7.05), cp(-4.0, 7.0), cp(1.0, 7.0), cp(3.2, 6.9), cp(4.9, 6.7),
  cp(6.2, 5.3), cp(7, 4.7), cp(8.6, 5.0), cp(13, 5.3), cp(16.3, 5.0), cp(18.1, 4.2), cp(18.5, 3),
  cp(19.2, 1.2), cp(19.7, -0.5), cp(19.7, -2), cp(19.3, -4), cp(19.0, -8.6), cp(17.6, -9.6),
  cp(16.2, -9.6), cp(14.6, -8.3), cp(14.3, -5.6), cp(13.2, -4.4), cp(12.6, -4.4), cp(11.6, -5.2),
  cp(11.0, -6.6), cp(9.8, -7.6), cp(7, -8), cp(3.5, -8),
];

const BEAN_SPAWNS = [
  cp(-3, -6.8), cp(3, -10.5), cp(-5.5, -9), // lobby
  cp(-15, -9.5), cp(-8.5, -8.6), cp(-19, -8.8), // assistants
  cp(-12.5, 1.5), cp(-20, -3.2), cp(-8, 0.8), // lounge
  cp(-18.5, 5.5), cp(-11, 11), cp(-17.5, 8.8), // corner office
  cp(-1, 7.0), cp(-7.5, 4), cp(4.8, 10.8), cp(-4, 10.5), // war room
  cp(-5.5, -0.5), cp(4.5, -0.5), cp(1.2, 1.8), // core
  cp(15, 1.6), cp(9.5, 2.3), // pantry
  cp(11, 8), cp(17.5, 7.5), // terrace
  cp(19.3, -6), cp(14.4, -11), cp(10.8, -3), // bullpen
];

// the espresso machine sits on the pantry's east counter, facing the terrace door
const COFFEE_MACHINE = { x: u(20.45), z: u(0.5), deliverX: u(18.9), deliverZ: u(0.7), radius: u(1.3) };

const BATTERY_SPAWN = cp(-1, 7); // under the boardroom table

// RC Soccer — the Sky Lobby. Marble makes it air hockey; the goals are the
// lobby's west and east doorways.
const SOCCER = {
  ballSpawn: { x: u(0), z: u(-8), y: u(0.5) },
  ballRadius: u(0.42),
  goals: [
    { team: 0, x: u(-7), z: u(-8), dir: 1, width: u(1.8), name: 'West Goal' },
    { team: 1, x: u(7), z: u(-8), dir: -1, width: u(1.8), name: 'East Goal' },
  ],
  arena: { minX: u(-7), maxX: u(7), minZ: u(-12), maxZ: u(-4) },
  kickoff: [
    { x: u(-4.8), z: u(-7), rotY: Math.PI / 2 }, { x: u(-4.8), z: u(-9), rotY: Math.PI / 2 },
    { x: u(-5.8), z: u(-8), rotY: Math.PI / 2 }, { x: u(-3.4), z: u(-6.4), rotY: Math.PI / 2 },
    { x: u(4.8), z: u(-7), rotY: -Math.PI / 2 }, { x: u(4.8), z: u(-9), rotY: -Math.PI / 2 },
    { x: u(5.8), z: u(-8), rotY: -Math.PI / 2 }, { x: u(3.4), z: u(-6.4), rotY: -Math.PI / 2 },
    { x: u(-3.4), z: u(-9.8), rotY: Math.PI / 2 }, { x: u(-2.2), z: u(-8), rotY: Math.PI / 2 },
    { x: u(3.4), z: u(-9.8), rotY: -Math.PI / 2 }, { x: u(2.2), z: u(-8), rotY: -Math.PI / 2 },
  ],
};

const KOTH_SPOTS = [
  cp(0, -8), // the compass in the lobby
  cp(-12.5, -7.8), // assistants' row
  cp(-14.5, 0.4), // by the fire
  cp(-12.5, 6.5), // the putting green
  cp(-1, 5.2), // war room, beside the table
  cp(0, -0.5), // the service corridor
  cp(13.5, 7.8), // the terrace
  cp(15.5, 0.5), // the pantry
  cp(14.4, -4.6), // the bullpen
  cp(4.8, 10), // under the video wall
  cp(-13.2, -6.4), // between the assistants' desks
];

// The last circle is out on the terrace, in the wind. The first reaches
// the lobby grid and most of the floor — not the far bullpen corner, which
// stays outside the ring (scripts/smoke.mjs parks a car there to check the
// out-timer on every floor).
const SUMO_ZONE = { x: u(14), z: u(7.5), r0: u(19.5), r1: u(0.6) };
// Moving Meeting slides the ring off the terrace only where the field can
// follow it on the floor: in off the terrace to the pantry, or on round to
// the bullpen — never across the lift core, into the war room through two
// doors, or out to the far corners, which the cars would have to lap half
// the floor to reach while the ring closes (bot-sim: a third of the field
// knocked out metres from the ring).
const SUMO_TARGETS = [KOTH_SPOTS[7], KOTH_SPOTS[8]];

const POWERUP_PADS = [
  cp(-3.5, -7.2), cp(4, -5.2), // lobby
  cp(-10.5, -7.6), // assistants
  cp(-15.6, -2.2), cp(-12, 0.6), // lounge
  cp(-11.8, 5.2), cp(-18.2, 9.2), // corner office
  cp(-5.4, 5.2), cp(2.4, 10.2), // war room
  cp(-1, -0.5), // service corridor
  cp(10.5, 7.5), cp(16.5, 7), // terrace
  cp(16.6, 1.2), // pantry
  cp(18.3, -6.5), cp(10.8, -9.8), // bullpen
];

const VENDING = { x: u(9.2), z: u(-1.48), radius: u(1.5), minSpeed: 12, cooldownS: 8, goldenChance: 0.3 };
const PRINTER = { x: u(20.4), z: u(-11.4), radius: u(5), minIntervalS: 22, maxIntervalS: 42, blindS: 1.4 };

// The night floor scrubber does laps of the lobby marble.
const ROBOT_PATH = [cp(-5.6, -10.2), cp(0, -10.4), cp(5.6, -10.2), cp(5.6, -6.6), cp(0, -6.6), cp(-5.6, -6.6)];

// A gust across the terrace every fifteen seconds, three seconds long,
// pushing north toward the balustrade — off the bench if you're on it. The
// olive trees bend with it (the theme reads the same cycle).
const ZONES = [
  { x: u(14), z: u(7.6), w: u(13.8), d: u(8.8), gust: [0, 34], period: 15, dur: 3, y1: u(0.9) },
  // the putting green: real turf, real grip
  { x: u(-13.4), z: u(7.3), w: u(4), d: u(1.4), grip: 1.22, top: 0.95 },
  // the lacquered table top is slick (the high line has to be earned)
  { x: u(-1.6), z: u(7.6), w: u(8), d: u(1.8), y0: u(0.6), y1: u(1.1), grip: 0.62 },
];

export const TOWER = {
  id: 'tower',
  name: 'The 48th Floor',
  blurb: 'Management. Marble, glass, a war room with a wall of screens, and the city two hundred metres down.',
  theme: 'tower',
  MAP_BOUNDS, WALL_HEIGHT, ROOMS, WALLS, FURNITURE, RAMPS, PROPS, ZONES,
  SPAWNS, REVERSE_SPAWN_ROTY: Math.PI / 2, // the reverse lap leaves east, through the bullpen
  CHECKPOINTS, BOT_PATH, BEAN_SPAWNS, COFFEE_MACHINE, BATTERY_SPAWN, SOCCER,
  KOTH_SPOTS, SUMO_ZONE, SUMO_TARGETS, POWERUP_PADS, VENDING, PRINTER, ROBOT_PATH,
  // the live standings: on the war room wall by the slider, and in the bullpen
  BOARDS: {
    boards: [{ at: [5.0, 1.55, 3.13], rotY: 0 }, { at: [11.4, 1.5, -2.13], rotY: Math.PI }],
    clock: { at: [6.5, 2.45, 3.13], rotY: 0 },
    memos: { at: [13.5, 1.45, -2.13], rotY: Math.PI },
  },
  // the floor's own names for the office events
  EVENTS: {
    server_overload: { name: 'Market Crash', icon: '📉', desc: 'Every screen goes red and the comms cupboard is on fire.' },
    earthquake: { name: 'Building Sway', icon: '🏙️', desc: 'Forty-eight floors up, the tower moves in the wind.' },
    cleaning_robot: { name: 'Night Scrubber', icon: '🧽', desc: 'The floor scrubber is polishing the lobby marble. Stay clear.' },
    ac_wind: { name: 'Window Seal Failure', icon: '🌬️', desc: 'A facade panel is open. Hold your line.' },
  },
  // warm greige plaster, walnut skirting; charcoal and navy carpet, dark
  // walnut boards, white marble
  LOOK: {
    wall: '#dcd5ca', skirt: '#3b2a1f',
    floors: { marble: '#dcd8d2', carpet: '#8d8f97', carpet2: '#6e7fb3', wood: '#9c8272', tile: '#ece8e0', concrete: '#cfc7ba' },
  },
  // point lights (meters): one per room, 3000 K downlights
  CEILING_LIGHTS: [[0, -8], [-14, -8], [14, -7], [-14, -0.5], [-1, 7.5], [-15, 7.5], [14, 0.5]],
  // The light. The tower has the most exposed sun in the game: glass on every
  // side, nothing higher around it. Morning comes in cool and hazy from the
  // east, afternoon is hard and bright off the marble, golden hour lies flat
  // across the floor from the west through half-lowered blinds, and at night
  // the light comes from BELOW — the city's warm glow as the ground colour,
  // downlights, the video wall and the onyx desk. `shaft.side` says which
  // facade the theme's sun shafts come through.
  LIGHTING: {
    morning: {
      label: 'Morning',
      clock: '07:25',
      sun: { pos: [190, 44, 40], color: '#d9e6ff', intensity: 2.3 },
      amb: { intensity: 0.34, color: '#c9d6f2' },
      hemi: { intensity: 0.56, sky: '#d6e4ff', ground: '#5a5a58' },
      ceiling: 4,
      env: {
        intensity: 0.66, bg: '#4a5c80',
        window: { color: '#cfe0ff', intensity: 4.6 },
        ceil: { color: '#fff3e0', intensity: 1.6 },
        warm: { color: '#ffe0b8', intensity: 1.0 },
        key: { color: '#eaf2ff', intensity: 2.4 },
      },
      shaft: { opacity: 0.2, color: '#dbe8ff', tilt: 0.62, side: 'east', length: 34 },
      pool: 0.04,
      panel: 0.9,
      bloom: { intensity: 0.42, threshold: 0.9 },
      shadow: { bias: -0.0003, normalBias: 0.06, opacity: 0.85 },
      practical: 0.16,
      wet: false,
    },
    afternoon: {
      label: 'Afternoon',
      clock: '14:10',
      sun: { pos: [40, 200, -70], color: '#fff6e8', intensity: 2.5 },
      amb: { intensity: 0.3, color: '#e2e8f6' },
      hemi: { intensity: 0.5, sky: '#eaf1ff', ground: '#6a6258' },
      ceiling: 2,
      env: {
        intensity: 0.72, bg: '#9ab4d8',
        window: { color: '#ffffff', intensity: 6.5 },
        ceil: { color: '#fff6e4', intensity: 2 },
        warm: { color: '#ffe6c4', intensity: 1.4 },
        key: { color: '#ffffff', intensity: 3.6 },
      },
      shaft: { opacity: 0.06, color: '#fff4dc', tilt: 1.2, side: 'west', length: 18 },
      pool: 0.02,
      panel: 0.8,
      bloom: { intensity: 0.45, threshold: 0.92 },
      shadow: { bias: -0.00015, normalBias: 0.03, opacity: 0.95 },
      practical: 0.06,
      wet: false,
    },
    golden: {
      label: 'Golden hour',
      clock: '19:10',
      sun: { pos: [-200, 26, 30], color: '#ff9a3c', intensity: 3.5 },
      amb: { intensity: 0.28, color: '#b9aec6' },
      hemi: { intensity: 0.46, sky: '#aaa6cc', ground: '#5a3a24' },
      ceiling: 4,
      env: {
        intensity: 0.85, bg: '#8a6a66',
        window: { color: '#ffb060', intensity: 6.8 },
        ceil: { color: '#d8cfe0', intensity: 1.3 },
        warm: { color: '#ff9c4a', intensity: 2.5 },
        key: { color: '#ffd0a0', intensity: 2.6 },
      },
      shaft: { opacity: 0.32, color: '#ffb266', tilt: 0.42, side: 'west', length: 44 },
      pool: 0.05,
      panel: 1.0,
      bloom: { intensity: 0.74, threshold: 0.76 },
      shadow: { bias: -0.00035, normalBias: 0.07, opacity: 0.8 },
      practical: 0.3,
      wet: false,
    },
    night: {
      label: 'Night',
      clock: '23:15',
      sun: { pos: [-96, 140, 120], color: '#8fa8ff', intensity: 0.5 },
      amb: { intensity: 0.13, color: '#b0b8d8' },
      // the city is the light source now: warm, from below
      hemi: { intensity: 0.34, sky: '#26304a', ground: '#4a3420' },
      ceiling: 20,
      env: {
        intensity: 0.4, bg: '#070b16',
        window: { color: '#6a5a8a', intensity: 1.4 },
        ceil: { color: '#ffd6a0', intensity: 2.2 },
        warm: { color: '#ffb366', intensity: 1.0 },
        key: { color: '#ffe6c4', intensity: 0.8 },
      },
      shaft: { opacity: 0, color: '#8fa8ff', tilt: 0.99, side: 'west', length: 22 },
      pool: 0.3,
      panel: 2.2,
      bloom: { intensity: 0.66, threshold: 0.78 },
      shadow: { bias: -0.0002, normalBias: 0.05, opacity: 0.45 },
      practical: 1,
      wet: true,
    },
    // 3000 K downlights; the video wall glows blue in the war room
    points: { color: '#ffd6a0', distance: 18 },
    glow: { at: [6.2, 8], color: '#5aa0ff' },
  },
  // what you hear: wind pressing on the glass, the air conditioning, rain on
  // the facade at night
  AMBIENCE: { rain: true, air: 0.6 },

  // ---- dressing (client only; themes/tower.jsx) — all in meters
  // the six lift doors on the core's lobby face: x centres
  LIFTS: [-5.75, -4.35, -2.95, 2.95, 4.35, 5.75],
  // the video wall: on the war room's east wall, 3 × 3 panels
  VIDEO_WALL: { x: 6.88, z: 8.03, w: 3.66, y0: 0.6, h: 2.07 },
  SIGNS: [
    { text: 'SYNERGON HOLDINGS', kind: 'logo', at: [0, 2.05, -3.985], rotY: Math.PI, w: 4.6 },
    { text: '48', sub: 'EXECUTIVE FLOOR', kind: 'brass', at: [-6.88, 1.5, -5.4], rotY: Math.PI / 2, w: 0.9 },
    { text: 'WAR ROOM', sub: 'IN SESSION', kind: 'session', at: [-2.35, 2.25, 2.9], rotY: Math.PI, w: 1.3 },
    { text: 'ONE TEAM. ONE DREAM.', kind: 'vinyl', at: [7.12, 2.1, -5.6], rotY: Math.PI / 2, w: 3 },
    // (on the wall east of the lounge door, not half over the opening)
    { text: 'EXECUTIVE LOUNGE', kind: 'brass', at: [-12.3, 2.4, -3.88], rotY: 0, w: 1.6 },
    { text: 'STAIRS', sub: 'WASHROOMS', kind: 'plain', at: [-5, 1.9, 0.18], rotY: Math.PI, w: 0.9 },
    // beside the cupboard door (z 1.3..2.3), on the wall — not hanging in it
    { text: 'COMMS', sub: 'AUTHORISED ONLY', kind: 'plain', at: [2.88, 1.6, 0.75], rotY: -Math.PI / 2, w: 0.7 },
    { text: 'EXIT', kind: 'exit', at: [-5, 2.7, 0.18], rotY: Math.PI, w: 0.6 },
    // hung in the corridor's open east mouth: tight under the ceiling
    { text: 'EXIT', kind: 'exit', at: [6.88, 3.15, -0.5], rotY: -Math.PI / 2, w: 0.6 },
  ],
  // the scrolling LED ticker over the bullpen door: [x, y, z], rotY, width
  TICKER: { text: 'Q4  97.3 % TO TARGET   ▲ EBITDA +4.1   ▲ NPS 71   ▼ CHURN 2.2 %   SYNERGY: ON TRACK   ', at: [13.5, 2.55, -2.12], rotY: Math.PI, w: 4.5 },
};
