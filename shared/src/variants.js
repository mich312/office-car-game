// Mode variants: the same mode on a different layout, rolled when a round
// starts and announced with it. Depth over breadth — a mode played the same
// way every time is learned in three rounds; one that sometimes runs the
// other way round keeps being worth voting for.
//
// Everything here is shared: the server scores with it, the bots drive with
// it and the client points you at the right checkpoint with it.

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
// are the standup spots, which the map keeps clear of the big furniture.
export function sumoTarget(round, variant, map, pick = Math.random) {
  if (variant !== 'drift') return null;
  const spots = map.KOTH_SPOTS;
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
