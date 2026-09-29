// Mode variants: the same mode on a different layout, rolled when a round
// starts and announced with it. Depth over breadth — a mode played the same
// way every time is learned in three rounds; one that sometimes runs the
// other way round keeps being worth voting for.
//
// Everything here is shared: the server scores with it, the bots drive with
// it and the client points you at the right checkpoint with it.
import { CHECKPOINTS, BOT_PATH, KOTH_SPOTS, SPAWNS } from './map.js';

export const MODE_VARIANTS = {
  desk_dash: [
    { id: 'classic', name: 'Desk Dash', desc: '' },
    { id: 'reverse', name: 'Reverse', desc: 'Same office, the other way round. Every corner you knew is new.' },
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
// belongs, on the start straight by the grid: the forward lap starts at
// checkpoint 0 and closes on 17; the reverse lap starts at 17 and closes on 0.
const REVERSE_CHECKPOINTS = [...CHECKPOINTS].reverse();
const REVERSE_BOT_PATH = [BOT_PATH[0], ...BOT_PATH.slice(1).reverse()];

export const raceCheckpoints = (variant) => (variant === 'reverse' ? REVERSE_CHECKPOINTS : CHECKPOINTS);
export const raceBotPath = (variant) => (variant === 'reverse' ? REVERSE_BOT_PATH : BOT_PATH);

// The grid faces the first checkpoint of the lap: east for the classic run
// (as SPAWNS already do), north for reverse.
export function raceSpawn(i, variant) {
  const s = SPAWNS[i % SPAWNS.length];
  return variant === 'reverse' ? { ...s, rotY: 0 } : s;
}

// --------------------------------------------------------------- Sumo
// Moving Meeting: the ring starts where it always does and slides toward a
// room while it shrinks, landing on it as the round runs out. The targets
// are the standup spots, which the map keeps clear of the big furniture.
export function sumoTarget(round, variant, pick = Math.random) {
  if (variant !== 'drift') return null;
  return KOTH_SPOTS[Math.floor(pick() * KOTH_SPOTS.length) % KOTH_SPOTS.length];
}
// frac 0 → 1 over the round; ease-in so the slide starts gently
export function sumoCenter(start, target, frac) {
  if (!target) return { x: start.x, z: start.z };
  const k = frac * frac;
  return { x: start.x + (target.x - start.x) * k, z: start.z + (target.z - start.z) * k };
}

// ---------------------------------------------------- Standup Standoff
export const kothHopSeconds = (base, variant) => (variant === 'rush' ? base / 2 : base);
