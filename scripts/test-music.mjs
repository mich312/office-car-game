// The score (client/src/music/score.js), checked as music: it stays in key,
// it builds, the lift lands, and the game state picks the right cue. The
// synthesis half (player.js) needs a browser; everything that decides what
// plays is here.
import {
  STATES, TEMPO, STEPS, KEY_LIFT, INTENSE_SECONDS, PROGRESSION,
  barEvents, chordAt, musicFor, degreeToMidi, stepSeconds, swingOffset,
} from '../client/src/music/score.js';
import { assignVoices, EARSHOT } from '../client/src/rivalVoices.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };

const pc = (m) => ((m % 12) + 12) % 12;
const PITCHED = new Set(['bass', 'keys', 'pad', 'arp', 'lead']);
const DRUMKIT = new Set(['kick', 'snare', 'rim', 'hat', 'open', 'crash']);
const allBars = (state) => [0, 1, 2, 3].flatMap((b) => barEvents(state, b).map((e) => ({ ...e, bar: b })));

// ------------------------------------------------------------- harmony
// Every pitched note must sit in the chord-scale of the chord sounding under
// it (lifted a whole step in the final push). This is what caught the bass
// playing A♭ against B♭maj7's A.
for (const state of STATES) {
  const shift = state === 'intense' ? KEY_LIFT : 0;
  const stray = allBars(state).filter((e) => {
    if (!PITCHED.has(e.inst)) return false;
    const c = state === 'countdown' && e.inst === 'pad' ? chordAt(3, 8) : chordAt(e.bar, e.step);
    return !c.scale.map((p) => pc(p + shift)).includes(pc(e.midi));
  });
  check(`${state}: every note fits the chord under it (${stray.length} strays)`, stray.length === 0);
}
check('harmony: chord voicings fit their own scales', PROGRESSION.every((c) => [c.voicing, c.turn?.voicing].filter(Boolean)
  .every((v) => v.every((m) => c.scale.includes(pc(m))))));
check('harmony: the bass never plays a seventh the chord does not have', allBars('race')
  .filter((e) => e.inst === 'bass' && ![0, 7, 12].includes(e.midi - chordAt(e.bar, e.step).bass))
  .every((e) => e.midi - chordAt(e.bar, e.step).bass === chordAt(e.bar, e.step).seventh));
check('harmony: the A7 turn really does resolve back to D at the top', chordAt(3, 8).name === 'A7' && chordAt(4, 0).name === PROGRESSION[0].name);
check('harmony: the loop is four bars and repeats', chordAt(0).name === chordAt(4).name && chordAt(1).name === chordAt(5).name);
check('harmony: bass plays the chord root, fifth, octave or its own seventh', allBars('race').filter((e) => e.inst === 'bass')
  .every((e) => [0, 7, 12, chordAt(e.bar, e.step).seventh].includes(e.midi - chordAt(e.bar, e.step).bass)));

// ----------------------------------------------------------- the build
const density = (s) => allBars(s).length / 4;
check(`build: the garage is sparse, the lobby grooves, the race is busy (${['garage', 'lobby', 'race', 'intense'].map((s) => density(s)).join(' < ')})`,
  density('garage') < density('lobby') && density('lobby') < density('race') && density('race') < density('intense'));
check('build: tempo rises garage → lobby → race → final push', TEMPO.garage < TEMPO.lobby && TEMPO.lobby < TEMPO.race && TEMPO.race < TEMPO.intense);
check('build: the final push lifts a whole step', (() => {
  const b = barEvents('race', 0).find((e) => e.inst === 'bass' && e.step === 0).midi;
  const i = barEvents('intense', 0).find((e) => e.inst === 'bass' && e.step === 0).midi;
  return i - b === KEY_LIFT && KEY_LIFT === 2;
})());
check('build: the hook is saved for the final push and the podium', !allBars('race').some((e) => e.inst === 'lead')
  && allBars('intense').some((e) => e.inst === 'lead') && allBars('podium').some((e) => e.inst === 'lead'));
check('countdown: no groove — a heartbeat kick, held tension and a riser', allBars('countdown').every((e) => !DRUMKIT.has(e.inst) || e.inst === 'kick')
  && allBars('countdown').filter((e) => e.inst === 'kick').length === 16 && allBars('countdown').some((e) => e.inst === 'riser'));
check('countdown: it holds the dominant, so GO resolves it', barEvents('countdown', 0).filter((e) => e.inst === 'pad')
  .map((e) => e.midi).join() === chordAt(3, 8).voicing.join());
check('garage: no crash cymbals in the workshop', !allBars('garage').some((e) => e.inst === 'crash'));
check('race: a crash marks each four-bar phrase', barEvents('race', 0).some((e) => e.inst === 'crash') && !barEvents('race', 1).some((e) => e.inst === 'crash'));

// ------------------------------------------------------- well-formed
check('events: every step is inside the bar and every length positive', STATES.every((s) => allBars(s)
  .every((e) => e.step >= 0 && e.step < STEPS && e.len > 0 && e.vel > 0 && e.vel <= 1)));
check('events: every pitched note is in a playable range', STATES.every((s) => allBars(s)
  .filter((e) => PITCHED.has(e.inst)).every((e) => e.midi >= 30 && e.midi <= 96)));
check('events: an unknown state falls back to the lobby groove', barEvents('???', 0).length === barEvents('lobby', 0).length);
check('scale: degree 7 is the octave', degreeToMidi(7) === degreeToMidi(0) + 12);
check('timing: a sixteenth at 120 bpm is 125 ms', Math.abs(stepSeconds('race') * TEMPO.race / 120 - 0.125) < 1e-9);
check('timing: swing only delays the off-sixteenths, never past the next step', STATES.every((s) =>
  swingOffset(s, 0) === 0 && swingOffset(s, 1) >= 0 && swingOffset(s, 1) < stepSeconds(s) * 0.5));

// ------------------------------------------------ game state → music
const base = { screen: 'game', phase: 'playing', modeId: 'coffee_run', timeLeft: 120, lap: 0, laps: 2, alive: 6, spectating: false, event: null };
const m = (o) => musicFor({ ...base, ...o });
check('cue: the garage plays garage music', m({ screen: 'menu' }).state === 'garage');
check('cue: lobby, countdown, race, podium follow the phase', m({ phase: 'lobby' }).state === 'lobby'
  && m({ phase: 'countdown' }).state === 'countdown' && m({}).state === 'race' && m({ phase: 'podium' }).state === 'podium');
check(`cue: the last ${INTENSE_SECONDS} s of any match lift`, m({ timeLeft: INTENSE_SECONDS }).state === 'intense' && m({ timeLeft: INTENSE_SECONDS + 1 }).state === 'race');
check('cue: the final lap lifts, lap one does not', m({ modeId: 'desk_dash', lap: 1 }).state === 'intense' && m({ modeId: 'desk_dash', lap: 0 }).state === 'race');
check('cue: the last two standing lift', m({ modeId: 'last_standing', alive: 2 }).state === 'intense' && m({ modeId: 'last_standing', alive: 3 }).state === 'race');
check('cue: lights out and ghost cam muffle the music', m({ event: 'lights_out' }).muffled && m({ spectating: true }).muffled && !m({}).muffled);
check('cue: an unknown time left never counts as the final push', m({ timeLeft: null }).state === 'race');

// ------------------------------------------------------ rival voices
const L = { x: 0, z: 0 };
const car = (id, x) => ({ id, x, z: 0 });
check('voices: exactly the four nearest', assignVoices(L, [car('a', 30), car('b', 5), car('c', 10), car('d', 20), car('e', 40)], [null, null, null, null])
  .filter(Boolean).sort().join() === 'a,b,c,d');
check('voices: nobody out of earshot', assignVoices(L, [car('far', EARSHOT + 1)], [null, null]).every((v) => v === null));
check('voices: fewer rivals than voices leaves the rest silent', assignVoices(L, [car('a', 3)], [null, null, null]).filter(Boolean).length === 1);
check('voices: a voiced car keeps its slot (its engine never jumps)', assignVoices(L, [car('a', 9), car('b', 3)], ['a', null])[0] === 'a');
check('voices: two cars at similar distances do not trade the voice back and forth', (() => {
  let slots = ['a'];
  let swaps = 0, prev = 'a';
  for (let i = 0; i < 40; i++) {
    const wobble = Math.sin(i) * 1.5; // a and b hover around 10 units, crossing over
    slots = assignVoices(L, [car('a', 10 + wobble), car('b', 10 - wobble)], slots);
    if (slots[0] !== prev) swaps++;
    prev = slots[0];
  }
  return swaps === 0;
})());
check('voices: a newcomer that is clearly closer does take it', assignVoices(L, [car('a', 20), car('b', 4)], ['a'])[0] === 'b');

console.log(fails ? `\n${fails} music check(s) failed` : '\nall music checks passed');
process.exit(fails ? 1 : 0);
