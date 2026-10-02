// The driving test and the one-time hints (client/src/tutorial/lessons.js):
// each lesson passes when the car actually does the thing, and not before;
// the hints fire once, at the right moment, one at a time.
import fs from 'node:fs';
import {
  LESSONS, PASS, newTest, stepTest, tokens, HINTS, HINT_FILL, nextHint, STUCK_AFTER_S, ABILITY_HINT_AFTER_S,
} from '../client/src/tutorial/lessons.js';
import { TOY_ICONS } from '../client/src/ui/iconPaths.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const dt = 1 / 60;
const idle = { speed: 0, heading: 0, throttle: 0, boostHeld: false, miniTurbos: 0, grounded: true };

// run samples until the given lesson passes (or give up)
function drive(test, sample, seconds) {
  let passed = null;
  for (let t = 0; t < seconds && !passed; t += dt) passed = stepTest(test, sample(t), dt).passed;
  return passed;
}
const at = (id) => { const t = newTest(); t.step = LESSONS.findIndex((l) => l.id === id); return t; };

check('lessons: drive, steer, brake, drift, boost — in that order', LESSONS.map((l) => l.id).join() === 'drive,steer,brake,drift,boost');
check('lessons: every lesson has a prompt for keys, pad and touch', LESSONS.every((l) => l.say.keys && l.say.pad && l.say.touch));

check('drive: sitting still passes nothing', drive(newTest(), () => idle, 5) === null);
check('drive: creeping does not count', drive(newTest(), () => ({ ...idle, speed: PASS.driveSpeed - 1 }), 5) === null);
check('drive: getting properly moving passes it', drive(newTest(), () => ({ ...idle, speed: 12 }), 1) === 'drive');

check('steer: going straight passes nothing', drive(at('steer'), () => ({ ...idle, speed: 12, heading: 0.3 }), 5) === null);
check('steer: half a turn while moving passes it', drive(at('steer'), (t) => ({ ...idle, speed: 12, heading: t * 1.5 }), 5) === 'steer');
check('steer: left and right both count', drive(at('steer'), (t) => ({ ...idle, speed: 12, heading: -t * 1.5 }), 5) === 'steer');
check('steer: spinning on the spot does not count', drive(at('steer'), (t) => ({ ...idle, speed: 1, heading: t * 3 }), 5) === null);
check('steer: a respawn snapping the heading does not count', drive(at('steer'), (t) => ({ ...idle, speed: 12, heading: t < 1 ? 0 : 3 }), 3) === null);

check('brake: pressing brake while parked passes nothing (that is reverse)', drive(at('brake'), () => ({ ...idle, throttle: -1, speed: 1 }), 3) === null);
check('brake: braking at speed passes it', drive(at('brake'), () => ({ ...idle, throttle: -1, speed: 12 }), 1) === 'brake');
check('brake: a flick of the key is not enough', drive(at('brake'), (t) => ({ ...idle, throttle: Math.floor(t * 10) % 3 === 0 ? -1 : 1, speed: 12 }), 3) === null);

check('drift: holding drift without cashing it in passes nothing', drive(at('drift'), () => ({ ...idle, speed: 12, miniTurbos: 4 }), 3) === null);
check('drift: a mini-turbo cashed in during the lesson passes it', drive(at('drift'), (t) => ({ ...idle, speed: 12, miniTurbos: t > 1 ? 5 : 4 }), 3) === 'drift');

check('boost: a mini-turbo is not the meter', drive(at('boost'), () => ({ ...idle, speed: 15, boostHeld: false }), 3) === null);
check('boost: burning the meter passes it', drive(at('boost'), () => ({ ...idle, speed: 15, boostHeld: true }), 1) === 'boost');

check('test: the whole thing, in order, ends done', (() => {
  const t = newTest();
  const seq = [];
  let turbos = 0;
  for (let i = 0; i < 60 * 40 && !t.done; i++) {
    const s = i * dt;
    const id = LESSONS[t.step].id;
    const sample = {
      drive: { ...idle, speed: 12 },
      steer: { ...idle, speed: 12, heading: s * 1.5 },
      brake: { ...idle, speed: 12, throttle: -1 },
      drift: { ...idle, speed: 12, miniTurbos: (turbos = s % 2 < dt ? turbos + 1 : turbos) },
      boost: { ...idle, speed: 15, boostHeld: true },
    }[id];
    const r = stepTest(t, sample, dt);
    if (r.passed) seq.push(r.passed);
  }
  return t.done && seq.join() === LESSONS.map((l) => l.id).join();
})());
check('test: once done, it stays done', (() => { const t = newTest(); t.step = LESSONS.length; t.done = true; return stepTest(t, { ...idle, speed: 20 }, dt).passed === null; })());

check('prompts: keycaps and icons are pulled out of the text', JSON.stringify(tokens('Hold {W} to go {flame}!')) === JSON.stringify([{ text: 'Hold ' }, { key: 'W' }, { text: ' to go ' }, { key: 'flame' }, { text: '!' }]));

// ---------------------------------------------------------------- hints
const H = (o) => nextHint({ phase: 'playing', seen: new Set(), showing: false, holdingItem: false, stuckFor: 0, matchTime: 5, usedAbility: false, ...o });
check('hints: every hint has keys, pad and touch wording', Object.values(HINTS).every((h) => h.keys && h.pad && h.touch));
check('hints: first item picked up → how to fire it', H({ holdingItem: true }) === 'item');
check('hints: …but only the first time', H({ holdingItem: true, seen: new Set(['item']) }) === null);
check(`hints: on the gas going nowhere for ${STUCK_AFTER_S} s → how to get unstuck`, H({ stuckFor: STUCK_AFTER_S }) === 'stuck' && H({ stuckFor: STUCK_AFTER_S - 0.5 }) === null);
check(`hints: ${ABILITY_HINT_AFTER_S} s in without using the special → tell them about it`, H({ matchTime: ABILITY_HINT_AFTER_S }) === 'ability' && H({ matchTime: ABILITY_HINT_AFTER_S, usedAbility: true }) === null);
check('hints: never two at once', H({ holdingItem: true, showing: true }) === null);
check('hints: never outside a match', H({ holdingItem: true, phase: 'lobby' }) === null && H({ holdingItem: true, phase: 'podium' }) === null);

// ------------------------------------------------ touch prompt glyphs
// A touch prompt names the pad button by its icon ({drift}, {flame}…): Coach
// draws each token in its ICONS set as that Toy icon, any other token as a
// keycap. So every glyph token must be in ICONS, and every ICONS entry must
// be a real Toy icon (read from the sources: Coach.jsx is JSX).
{
  const coach = fs.readFileSync(new URL('../client/src/ui/Coach.jsx', import.meta.url), 'utf8');
  const m = coach.match(/const ICONS = new Set\(\[([^\]]*)\]\)/);
  const icons = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  check('glyphs: Coach.jsx declares its ICONS set', icons.length > 0);
  const touchTokens = new Set([...LESSONS.map((l) => l.say.touch), ...Object.values(HINTS).map((h) => h.touch)]
    .flatMap((t) => tokens(t).filter((p) => p.key).map((p) => p.key))
    .filter((k) => !HINT_FILL.includes(k)));
  const missing = [...touchTokens].filter((k) => !icons.includes(k));
  check(`glyphs: every touch-prompt token is a Coach icon (${[...touchTokens].join(', ')})`, missing.length === 0);
  if (missing.length) console.log('  not in ICONS:', missing.join(', '));
  const unknown = icons.filter((k) => !TOY_ICONS[k]);
  check('glyphs: every Coach icon exists in TOY_ICONS', unknown.length === 0);
  if (unknown.length) console.log('  not a Toy icon:', unknown.join(', '));
}

console.log(fails ? `\n${fails} tutorial check(s) failed` : '\nall tutorial checks passed');
process.exit(fails ? 1 : 0);
