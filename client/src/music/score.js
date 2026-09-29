// The score: what plays, when. Pure — no WebAudio in here — so the whole
// arrangement is testable in Node (scripts/test-music.mjs); player.js turns
// these events into sound.
//
// Direction: late-night office electro-funk. Toy-sized and playful, lo-fi
// warm in the garage, a groove in the lobby, all hands in the race, and a
// whole-step key lift for the final lap / last 30 seconds (the oldest trick
// in the racing-game book, because it works). D dorian throughout.

export const STATES = ['garage', 'lobby', 'countdown', 'race', 'intense', 'podium'];

export const TEMPO = { garage: 86, lobby: 100, countdown: 100, race: 122, intense: 128, podium: 100 };
export const STEPS = 16; // sixteenth notes per bar
export const SWING = { garage: 0.16, lobby: 0.1, countdown: 0, race: 0.05, intense: 0.03, podium: 0.08 };

// The last 30 s of a match, or the final lap of a race, or the last two
// standing: the music lifts a whole step and adds the lead.
export const INTENSE_SECONDS = 30;
export const KEY_LIFT = 2;

// D dorian: D E F G A B C.
export const SCALE = [0, 2, 3, 5, 7, 9, 10];
export const TONIC = 50; // D3

// Four bars, one chord each. `bass` is the root the bass plays (MIDI),
// `voicing` the keys/pad notes, `seventh` the chord's own seventh above the
// root (a flat seventh everywhere except the major-seventh chord — a bass
// line that assumed ♭7 played A♭ against B♭maj7's A), and `scale` the pitch
// classes that sound right over it. Bb is borrowed from D minor (the ♭VI) and
// the A7 is the dominant, so their scales step outside plain D dorian on
// purpose. Bar 3 turns sus4 → dominant halfway, pulling the loop round.
const D_DORIAN = [2, 4, 5, 7, 9, 11, 0];
export const PROGRESSION = [
  { name: 'Dm9', bass: 38, seventh: 10, voicing: [53, 57, 60, 64], scale: D_DORIAN },
  { name: 'G13', bass: 43, seventh: 10, voicing: [53, 59, 64], scale: D_DORIAN }, // G mixolydian: same notes
  { name: 'Bbmaj7', bass: 46, seventh: 11, voicing: [53, 57, 62], scale: [10, 0, 2, 4, 5, 7, 9] }, // B♭ lydian
  {
    name: 'A7sus4', bass: 45, seventh: 10, voicing: [55, 62, 64], scale: [9, 10, 1, 2, 4, 5, 7], // A mixolydian ♭6
    turn: { at: 8, name: 'A7', voicing: [55, 61, 64] },
  },
];

// ------------------------------------------------------------- patterns
// [step, …] for drums; [step, semitones above the bass root, length] for
// bass; [step, length, velocity] for keys stabs.
const DRUMS = {
  garage: { kick: [0, 10], snare: [], rim: [8], hat: [0, 4, 8, 12], open: [] },
  lobby: { kick: [0, 6, 10], snare: [4, 12], rim: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [] },
  countdown: { kick: [0, 4, 8, 12], snare: [], rim: [], hat: [], open: [] }, // a heartbeat under the tension
  race: { kick: [0, 4, 8, 10, 12], snare: [4, 12], rim: [7, 15], hat: [...Array(16).keys()], open: [14] },
  intense: { kick: [0, 4, 8, 10, 12], snare: [4, 12], rim: [3, 7, 11, 15], hat: [...Array(16).keys()], open: [2, 6, 10, 14] },
  podium: { kick: [0, 8], snare: [4, 12], rim: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [] },
};
// bass intervals: 0 root, 7 fifth, 12 octave, 'b7' the chord's own seventh
const BASS = {
  garage: [[0, 0, 6], [8, 7, 4]],
  lobby: [[0, 0, 3], [3, 0, 1], [6, 12, 2], [10, 0, 2], [14, 'b7', 2]],
  countdown: [],
  race: [[0, 0, 2], [2, 12, 1], [3, 0, 1], [6, 0, 2], [8, 7, 1], [10, 12, 1], [11, 0, 1], [14, 'b7', 2]],
  intense: [[0, 0, 2], [2, 12, 1], [3, 0, 1], [6, 0, 2], [8, 7, 1], [10, 12, 1], [11, 0, 1], [13, 12, 1], [14, 'b7', 2]],
  podium: [[0, 0, 4], [6, 12, 2], [8, 7, 4], [14, 'b7', 2]],
};
const STABS = {
  garage: [], // the pad carries the garage
  lobby: [[2, 2, 0.7], [7, 1, 0.5], [10, 2, 0.7]],
  countdown: [],
  race: [[2, 1, 0.8], [6, 1, 0.45], [10, 1, 0.8], [14, 1, 0.5]],
  intense: [[2, 1, 0.9], [6, 1, 0.5], [10, 1, 0.9], [14, 1, 0.55]],
  podium: [[0, 3, 0.9], [3, 3, 0.9], [6, 10, 0.9]],
};
const LAYERS = {
  garage: { pad: true, arp: false, lead: false, riser: false },
  lobby: { pad: false, arp: false, lead: false, riser: false },
  countdown: { pad: true, arp: false, lead: false, riser: true },
  race: { pad: false, arp: true, lead: false, riser: false },
  intense: { pad: false, arp: true, lead: true, riser: false },
  podium: { pad: false, arp: false, lead: true, riser: false },
};

// The hook: four bars, [step, scale degree (0 = D), octave, length]. Heard
// only when it matters — the final push and the podium.
const LEAD = [
  [[0, 4, 1, 3], [4, 2, 1, 2], [6, 4, 1, 2], [10, 5, 1, 2], [12, 4, 1, 4]],
  [[0, 3, 1, 2], [2, 2, 1, 2], [4, 0, 1, 4], [10, 2, 1, 2], [12, 3, 1, 4]],
  [[0, 4, 1, 3], [4, 6, 1, 2], [6, 0, 2, 4], [12, 6, 1, 2], [14, 4, 1, 2]],
  [[0, 3, 1, 6], [8, 4, 1, 2], [10, 2, 1, 2], [12, 1, 1, 4]],
];

export function degreeToMidi(degree, octave = 0, shift = 0) {
  const o = Math.floor(degree / SCALE.length);
  const d = ((degree % SCALE.length) + SCALE.length) % SCALE.length;
  return TONIC + shift + 12 * (octave + o) + SCALE[d];
}

// Which chord (and voicing) is sounding at a given step of a given bar.
export function chordAt(bar, step = 0) {
  const c = PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
  if (c.turn && step >= c.turn.at) return { ...c, name: c.turn.name, voicing: c.turn.voicing };
  return c;
}

// Every note of one bar, as events the player schedules:
//   { inst, step, midi?, len (steps), vel }
// inst ∈ kick snare rim hat open crash bass keys pad arp lead riser
export function barEvents(state, bar) {
  const st = STATES.includes(state) ? state : 'lobby';
  const shift = st === 'intense' ? KEY_LIFT : 0;
  const ev = [];
  const d = DRUMS[st];
  for (const s of d.kick) ev.push({ inst: 'kick', step: s, len: 1, vel: s % 4 === 0 ? 1 : 0.75 });
  for (const s of d.snare) ev.push({ inst: 'snare', step: s, len: 1, vel: 0.9 });
  for (const s of d.rim) ev.push({ inst: 'rim', step: s, len: 1, vel: 0.45 });
  for (const s of d.hat) ev.push({ inst: 'hat', step: s, len: 1, vel: s % 4 === 2 ? 0.55 : s % 2 === 0 ? 0.35 : 0.2 });
  for (const s of d.open) ev.push({ inst: 'open', step: s, len: 2, vel: 0.4 });
  // a crash marks the top of each 4-bar phrase once things are moving
  if ((st === 'race' || st === 'intense' || st === 'podium') && bar % 4 === 0) ev.push({ inst: 'crash', step: 0, len: 8, vel: 0.5 });

  for (const [s, semi, len] of BASS[st]) {
    const c = chordAt(bar, s);
    ev.push({ inst: 'bass', step: s, midi: c.bass + shift + (semi === 'b7' ? c.seventh : semi), len, vel: s === 0 ? 1 : 0.8 });
  }
  for (const [s, len, vel] of STABS[st]) {
    const c = chordAt(bar, s);
    for (const m of c.voicing) ev.push({ inst: 'keys', step: s, midi: m + shift, len, vel });
  }
  const L = LAYERS[st];
  if (L.pad) {
    // held chords; the countdown sits on the dominant, the tension GO resolves
    const c = st === 'countdown' ? chordAt(3, 8) : chordAt(bar, 0);
    for (const m of c.voicing) ev.push({ inst: 'pad', step: 0, midi: m + shift, len: STEPS, vel: 0.5 });
  }
  if (L.arp) {
    // sixteenths up through the chord an octave above, the moving part of the race
    for (let s = 0; s < STEPS; s++) {
      const c = chordAt(bar, s);
      const tones = c.voicing;
      const m = tones[s % tones.length] + 12 + shift;
      ev.push({ inst: 'arp', step: s, midi: m, len: 1, vel: s % 4 === 0 ? 0.6 : 0.35 });
    }
  }
  if (L.lead) {
    for (const [s, deg, oct, len] of LEAD[((bar % 4) + 4) % 4]) {
      ev.push({ inst: 'lead', step: s, midi: degreeToMidi(deg, oct, shift), len, vel: 0.7 });
    }
  }
  if (L.riser) ev.push({ inst: 'riser', step: 0, len: STEPS, vel: 0.6 });
  return ev;
}

// ------------------------------------------------------ the game → music
// ctx: { screen, phase, modeId, timeLeft (s), lap, laps, alive, spectating,
//        event }
// → { state, muffled }. Muffled = the world just went dark or you're a
// ghost: same song, through a wall.
export function musicFor(ctx) {
  let state;
  if (ctx.screen !== 'game') state = 'garage';
  else if (ctx.phase === 'countdown') state = 'countdown';
  else if (ctx.phase === 'playing') {
    const finalLap = ctx.modeId === 'desk_dash' && ctx.laps > 0 && ctx.lap >= ctx.laps - 1;
    const lastStanding = ctx.modeId === 'last_standing' && ctx.alive > 0 && ctx.alive <= 2;
    const lateInMatch = ctx.timeLeft != null && ctx.timeLeft <= INTENSE_SECONDS;
    state = finalLap || lastStanding || lateInMatch ? 'intense' : 'race';
  } else if (ctx.phase === 'podium') state = 'podium';
  else state = 'lobby';
  const muffled = !!ctx.spectating || ctx.event === 'lights_out';
  return { state, muffled };
}

// Seconds per sixteenth at a state's tempo, and where a swung step lands
// inside its pair (odd sixteenths are pushed late by the swing amount).
export const stepSeconds = (state) => 60 / (TEMPO[state] || 100) / 4;
export const swingOffset = (state, step) => (step % 2 === 1 ? (SWING[state] || 0) * stepSeconds(state) : 0);
