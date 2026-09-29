// Mode variants: the same mode on a different layout, rolled when a round
// starts and announced with it. Depth over breadth — a mode played the same
// way every time is learned in three rounds; one that sometimes runs the
// other way round keeps being worth voting for.
//
// Everything here is shared: the server scores with it, the bots drive with
// it and the client points you at the right checkpoint with it.

import { M } from './constants.js';
import { isDecor } from './map.js';
import { PERCH_MIN_Y } from './modes.js';

export const MODE_VARIANTS = {
  desk_dash: [
    { id: 'classic', name: 'Desk Dash', desc: '' },
    { id: 'reverse', name: 'Reverse', desc: 'Same track, the other way round. Every corner you knew is new.' },
  ],
  sumo: [
    { id: 'classic', name: 'Meeting Room Sumo', desc: '' },
    { id: 'drift', name: 'Moving Meeting', desc: 'Each round the ring closes in on a different room. Read where it’s going.' },
  ],
  koth: [
    { id: 'classic', name: 'Standup Standoff', desc: '' },
    { id: 'rush', name: 'Rush Hour', desc: 'The meeting moves every ten seconds. Keep moving.' },
  ],
};

// How often a round gets something other than the classic layout.
export const VARIANT_CHANCE = 0.5;

export function variantOf(modeId, variantId) {
  const list = MODE_VARIANTS[modeId];
  if (!list) return null;
  return list.find((v) => v.id === variantId) || list[0];
}

// → a variant id for this mode (or 'classic' for modes without variants)
export function rollVariant(modeId, rand = Math.random) {
  const list = MODE_VARIANTS[modeId];
  if (!list || list.length < 2 || rand() >= VARIANT_CHANCE) return 'classic';
  return list[1 + Math.floor(rand() * (list.length - 1))].id;
}

// ---------------------------------------------------------- Desk Dash
// Reverse runs the checkpoints backwards but keeps the finish where it
// belongs, on the start straight by the grid: the forward lap starts at the
// first checkpoint and closes on the last; the reverse lap the other way.
// Each map carries both lists (map.js).
export const raceCheckpoints = (variant, map) => (variant === 'reverse' ? map.REVERSE_CHECKPOINTS : map.CHECKPOINTS);
export const raceBotPath = (variant, map) => (variant === 'reverse' ? map.REVERSE_BOT_PATH : map.BOT_PATH);

// The grid faces the first checkpoint of the lap: SPAWNS face the classic
// run, and each map says which way the reverse lap leaves.
export function raceSpawn(i, variant, map) {
  const s = map.SPAWNS[i % map.SPAWNS.length];
  return variant === 'reverse' ? { ...s, rotY: map.REVERSE_SPAWN_ROTY } : s;
}

// --------------------------------------------------------------- Sumo
// Moving Meeting: the ring starts where it always does and slides toward a
// room while it shrinks, landing on it as the round runs out. The targets
// are the standup spots, which the map keeps clear of the big furniture —
// or the map's own SUMO_TARGETS, where a slide across a solid core would
// leave the field driving the long way round (the tower's lift core).
// Never the ring's own centre (the ring wouldn't move) and never last
// round's room again.
// Nor a spot whose final ring holds something a car can park on (the
// office meeting table, a factory bench): bots can't climb, so a human
// sitting on the table in the last ring could never be shoved out of it.
export const SUMO_TARGET_MIN_DIST = 4 * M;
const sumoPools = new WeakMap();
function sumoPool(map) {
  let pool = sumoPools.get(map);
  if (pool) return pool;
  const Z = map.SUMO_ZONE;
  const all = map.SUMO_TARGETS || map.KOTH_SPOTS;
  pool = all.filter((s) => !map.FURNITURE.some((f) => {
    if (isDecor(f) || f.h <= PERCH_MIN_Y) return false;
    const q = Math.abs(Math.sin(f.rotY || 0)) > 0.7;
    const w = q ? f.d : f.w, d = q ? f.w : f.d;
    const cx = Math.max(f.x - w / 2, Math.min(s.x, f.x + w / 2)), cz = Math.max(f.z - d / 2, Math.min(s.z, f.z + d / 2));
    return Math.hypot(cx - s.x, cz - s.z) < Z.r1 + 0.5 * M;
  }));
  if (!pool.length) pool = all;
  sumoPools.set(map, pool);
  return pool;
}
export function sumoTarget(round, variant, map, pick = Math.random, prev = null) {
  if (variant !== 'drift') return null;
  const Z = map.SUMO_ZONE;
  const pool = sumoPool(map);
  let spots = pool.filter((s) => s !== prev && Math.hypot(s.x - Z.x, s.z - Z.z) > SUMO_TARGET_MIN_DIST);
  if (!spots.length) spots = pool;
  return spots[Math.floor(pick() * spots.length) % spots.length];
}
// frac 0 → 1 over the round; ease-in so the slide starts gently
export function sumoCenter(start, target, frac) {
  if (!target) return { x: start.x, z: start.z };
  const k = frac * frac;
  return { x: start.x + (target.x - start.x) * k, z: start.z + (target.z - start.z) * k };
}

// ---------------------------------------------------- Standup Standoff
export const kothHopSeconds = (base, variant) => (variant === 'rush' ? base / 2 : base);
