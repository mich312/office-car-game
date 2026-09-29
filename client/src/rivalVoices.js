// Which rivals get an engine voice. There are only a few voices (synthesized
// engines aren't free), so they go to the nearest cars in earshot — and a car
// that already has one keeps it unless a newcomer is clearly closer, or two
// cars at similar distances would trade the voice back and forth every frame
// and the engines would stutter. Pure, so scripts/test-music.mjs checks it.

export const RIVAL_VOICES = 4;
export const EARSHOT = 45; // units; beyond this a rival engine is inaudible anyway
export const KEEP_BONUS = 0.7; // a voiced car counts as this much nearer: a newcomer must be ~30% closer

// listener: { x, z }; cars: [{ id, x, z }]; slots: current [id | null] × N.
// Returns the new slots. A car that stays voiced stays in the same slot, so
// its oscillators never jump; freed slots go to the nearest newcomers.
export function assignVoices(listener, cars, slots, { earshot = EARSHOT, keepBonus = KEEP_BONUS } = {}) {
  const n = slots.length;
  const held = new Set(slots.filter(Boolean));
  const ranked = [];
  for (const c of cars) {
    const d = Math.hypot(c.x - listener.x, c.z - listener.z);
    if (d > earshot) continue;
    ranked.push({ id: c.id, score: held.has(c.id) ? d * keepBonus : d });
  }
  ranked.sort((a, b) => a.score - b.score);
  const winners = new Set(ranked.slice(0, n).map((r) => r.id));
  const next = slots.map((id) => (id && winners.has(id) ? id : null));
  const placed = new Set(next.filter(Boolean));
  for (const r of ranked.slice(0, n)) {
    if (placed.has(r.id)) continue;
    const free = next.indexOf(null);
    if (free < 0) break;
    next[free] = r.id;
    placed.add(r.id);
  }
  return next;
}
