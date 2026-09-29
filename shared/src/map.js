// ---------------------------------------------------------------------------
// The maps. Each one is a handcrafted floor (maps/*.js) exported as a single
// object with the same keys, so the server runs every room on its own map and
// the client draws whichever one the match is on. Nothing outside this file
// should pick a map's data by name: take the room's (server) or the active
// match's (client) map object and read from that.
// ---------------------------------------------------------------------------
import { M } from './constants.js';
import { OFFICE } from './maps/office.js';
import { CELLAR } from './maps/cellar.js';
import { TOWER } from './maps/tower.js';

// The office's named exports stay available for tests and tools that are
// about the office itself. Game code reads a map object instead.
export * from './maps/office.js';

// Decor never collides and is skipped by the server's box list: these types,
// or any furniture entry marked { decor: true }.
export const DECOR_TYPES = ['rug', 'art', 'tv'];
export const isDecor = (f) => DECOR_TYPES.includes(f.type) || !!f.decor;
export const KOTH_RADIUS = 2.0 * M;

function build(def) {
  const rooms = def.ROOMS;
  const map = {
    ...def,
    RUGS: def.FURNITURE.filter((f) => f.type === 'rug'),
    // Which room contains a world point? Rooms tile the floor plan, so this
    // is a rect lookup; doorway centerlines resolve to the first listed.
    roomAt(x, z) {
      for (const r of rooms) {
        if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return r;
      }
      return null;
    },
  };
  // Desk Dash reverse: the checkpoints backwards, the finish still on the
  // start straight (the forward lap starts at 0, the reverse lap at the last).
  map.REVERSE_CHECKPOINTS = [...def.CHECKPOINTS].reverse();
  map.REVERSE_BOT_PATH = [def.BOT_PATH[0], ...def.BOT_PATH.slice(1).reverse()];
  return Object.freeze(map);
}

export const MAPS = {
  office: build(OFFICE),
  cellar: build(CELLAR),
  tower: build(TOWER),
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'office';
export const mapById = (id) => MAPS[id] || MAPS[DEFAULT_MAP];

// Desk Dash laps on a map: a short floor runs more of them (map.RACE_LAPS)
// so every race lasts about the same.
export const raceLaps = (map, base = 2) => map?.RACE_LAPS || base;

// Room ids across every map, in a fixed order — what the snapshot sends for
// Last Car Standing's locked rooms. Room ids are unique across maps.
export const ALL_ROOM_IDS = MAP_IDS.flatMap((id) => MAPS[id].ROOMS.map((r) => r.id));
