// The kill feed's parser (client/src/ui/hud/parseFeed.js): the server's feed
// lines lead with an emoji (scripts/test-bots.mjs matches them, so they never
// change); the HUD maps that emoji onto a Toy Box icon and turns player names
// into paint tags. Every line the server or the client can push must come out
// with a known icon, no emoji left in the text, and names split out longest
// first.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFeed, FEED_ICON } from '../client/src/ui/hud/parseFeed.js';
import { TOY_ICONS } from '../client/src/ui/iconPaths.js';
import { OFFICE_EVENTS, MUTATORS, MODES, MODE_VARIANTS, MAPS } from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const players = {
  a: { id: 'a', name: 'Karen' }, b: { id: 'b', name: 'Karen from HR' }, me: { id: 'me', name: 'Mika' },
  c: { id: 'c', name: 'Mr. Mondays' },
};
const flat = (r) => r.parts.map((p) => p.t ?? (p.who ? `[${players[p.who]?.name}]` : `[team${p.team}]`)).join('');

// ------------------------------------------------ every real line, by hand
const LINES = [
  "⚡ Karen from HR EMP'd 2 cars", '🧨 Mika rocketed Karen', '🔬 Karen shrunk Mr. Mondays!', '🔀 Mika swapped with Karen from HR',
  '💥 Mr. Mondays spilled 2 beans (bumped)', '💥 Karen bodychecked Mika', '🏁 Mika finished 2nd!', '🏎️ Karen — lap 2/2',
  '☕ Mika delivered 3 beans', '🔋 Karen grabbed the battery!', '🔋 The battery slid off the furniture under Mika',
  '🔋 Karen made Mika drop the battery', '⚽ Out of play — drop ball!', '⚽ GOOOAL! Mika scores for 🔵 Blue!',
  '⚽ OWN GOAL! Karen puts it in for 🟠 Orange!', '🏁 🟠 Orange takes the match!', '🎯 Mr. Mondays is It!',
  "🎯 Karen can't keep It up on the furniture", '📍 The standup moved to the Lounge!', '📍 The standup moved!',
  '🥋 Round 2 — stay inside the circle!', '💀 Mika is out — zapped! 4 cars left', '💀 Karen is out (pushed out)',
  '👑 Karen is the LAST CAR STANDING!', '👑 Time! Karen, Mika share the crown', '🏆 Karen wins round 2!',
  '🏆 Office Cup — round 2/3: 🏁 Desk Dash!', '🏆 Karen wins the OFFICE CUP with 26 points!',
  '🤝 Round 2: Karen and Mika share it', '🕳️ Mika fell off the balcony', '🚧 Facilities is closing the Games Corner — clear out!',
  '⚡ The Kitchen is the last room open — and the zap ring is closing in!', '🤖 Facilities sent in the cleaning robot. Do not get eaten.',
  '🤖 The cleaning robot got Mika', '🖨️ The printer has opinions again', '🥇 Mika rammed the vending machine — golden can!',
  '🥤 Karen rammed the vending machine', '🌙 MUTATOR: Moon Gravity — Facilities broke gravity.',
  '☕ MUTATOR: Mug Rain — The ceiling is raining mugs.', '🏁 REVERSE — Same track, the other way round.',
  '💦 Sprinkler Test — Mandatory fire drill.', 'Incoming: Printer Paper Storm', 'Mika rolled in', '💨 Slipstream!',
];
for (const l of LINES) {
  const r = parseFeed(l, players, 'me');
  const txt = flat(r);
  check(`${r.kind.padEnd(5)} ${r.icon.padEnd(9)} ${r.me ? 'ME' : '  '} ${txt}`, !EMOJI.test(txt) && !!TOY_ICONS[r.icon]);
}

// ------------------------------------------- every line the code can push
// Lead emoji of every feed() / pushFeed() string in the server and client
// sources, plus the events, mutators and variants they interpolate: each
// must have a FEED_ICON entry (unknown emoji would fall back to the road).
const root = fileURLToPath(new URL('..', import.meta.url));
const src = ['server/src/room.js', 'server/src/modes.js', 'client/src/net.js', 'client/src/game/LocalCar.jsx']
  .map((f) => fs.readFileSync(root + f, 'utf8')).join('\n');
const LEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic})*)/u;
const leads = new Set();
for (const m of src.matchAll(/(?:feed|pushFeed)\(\s*[`'"]((?:\p{Extended_Pictographic}|\p{Regional_Indicator})️?)/gu)) leads.add(m[1]);
for (const m of src.matchAll(/[?:]\s*[`'"]((?:\p{Extended_Pictographic})️?)[^`'"]*[`'"]/gu)) {
  // the other arm of `cond ? '🏆 …' : '🤝 …'` inside a feed() call
  const at = src.lastIndexOf('feed(', m.index);
  if (at !== -1 && m.index - at < 200 && !/🟠|🔵/u.test(m[1])) leads.add(m[1]); // (team swatches are inline, not leads)
}
for (const e of OFFICE_EVENTS) leads.add(e.icon);
for (const map of Object.values(MAPS)) for (const e of Object.values(map.EVENTS || {})) if (e.icon) leads.add(e.icon);
for (const mu of Object.values(MUTATORS)) leads.add(mu.icon);
for (const id of Object.keys(MODE_VARIANTS)) leads.add(MODES[id].icon);
leads.add(MODES.office_cup.icon);
check(`found the lead emoji of the feed lines (${leads.size})`, leads.size >= 30);
for (const e of leads) {
  const key = e.match(LEAD)?.[1].replace(/️/g, '');
  check(`lead ${e} has an icon (${FEED_ICON[key]?.[0] ?? 'none'})`, !!FEED_ICON[key] && !!TOY_ICONS[FEED_ICON[key][0]]);
}
// the event and variant announcements as the client shows them
for (const e of [...OFFICE_EVENTS, ...Object.values(MAPS).flatMap((m) => Object.values(m.EVENTS || {}))]) {
  const r = parseFeed(`${e.icon} ${e.name} — ${e.desc}`, players, 'me');
  check(`event "${e.name}" → fac, no emoji`, r.kind === 'fac' && !EMOJI.test(flat(r)));
}
for (const [id, list] of Object.entries(MODE_VARIANTS)) {
  for (const v of list.slice(1)) {
    const r = parseFeed(`${MODES[id].icon} ${v.name.toUpperCase()} — ${v.desc}`, players, 'me');
    check(`variant "${v.name}" → twist`, r.kind === 'twist' && !EMOJI.test(flat(r)));
  }
}
for (const mu of Object.values(MUTATORS)) {
  const r = parseFeed(`${mu.icon} MUTATOR: ${mu.name} — ${mu.desc}`, players, 'me');
  check(`mutator "${mu.name}" → twist`, r.kind === 'twist' && !EMOJI.test(flat(r)));
}

// ------------------------------------------------------------ the details
const k = parseFeed("⚡ Karen from HR EMP'd 2 cars", players, 'me');
check('names: longest first ("Karen from HR", not "Karen")', k.parts[0].who === 'b' && k.parts.length === 2);
check('me: you are the subject → a "me" row', parseFeed('🧨 Mika rocketed Karen', players, 'me').me === true);
check('me: you are the object → not a "me" row', parseFeed('🧨 Karen rocketed Mika', players, 'me').me === false);
check('me: the local slipstream is always yours', parseFeed('💨 Slipstream!', players, 'me').me === true);
const goal = parseFeed('🏁 🟠 Orange takes the match!', players, 'me');
check('teams: 🟠/🔵 become swatches', goal.parts[0].team === 0 && goal.parts[1].t.trim() === 'Orange takes the match!');
check('mug rain: the MUTATOR line gets the cup, deliveries keep the bean',
  parseFeed('☕ MUTATOR: Mug Rain — x', players).icon === 'cup' && parseFeed('☕ Mika delivered 3 beans', players).icon === 'bean');
check('unknown lead emoji → road + info, emoji dropped', (() => { const r = parseFeed('🦄 Something new', players); return r.icon === 'road' && r.kind === 'info' && flat(r) === 'Something new'; })());
check('players keyed by id without an id field still tag', parseFeed('🎯 Zed is It!', { z9: { name: 'Zed' } }, 'z9').me === true);

console.log(fails ? `\n${fails} feed check(s) failed` : '\nall feed checks passed');
process.exit(fails ? 1 : 0);
