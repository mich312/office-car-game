// parseFeed: the server's feed strings start with an emoji (server/src/*.js;
// scripts/test-bots.mjs matches them, so they never change). The client maps
// that emoji onto a Toy Box icon + kind and turns player names into paint
// tags, so no emoji ever reaches the chrome (SPEC-TOYBOX §4.3).
//
//   parseFeed(text, players, myId) → { icon, kind, me, parts }
//   parts: [{ t: 'plain text' } | { who: playerId } | { team: 0 | 1 }]
//   kind:  'item' | 'bump' | 'score' | 'fac' | 'out' | 'twist' | 'info'
//   me:    true when YOU are the subject (the first name in the line)
//
// scripts/test-feed.mjs runs it over every feed line the server and client
// can send; a new server line with a new lead emoji needs a FEED_ICON entry
// (unknown emoji fall back to the road icon + info, never to an emoji).

const LEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic}))*)\s*/u;
const INLINE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic})*\s?/gu;

// emoji (variation selectors stripped) → [toy icon, kind]
export const FEED_ICON = {
  '⚡': ['bolt', 'item'], '🧨': ['up', 'item'], '🔬': ['shield', 'item'], '🔀': ['swirl', 'item'],
  '🥇': ['sparkle', 'item'], '🥤': ['cup', 'item'],
  '💥': ['burst', 'bump'], '🕳': ['warning', 'out'], '💀': ['skull', 'out'],
  '🏁': ['flag', 'score'], '🏎': ['flag', 'score'], '☕': ['bean', 'score'], '🔋': ['battery', 'score'], '⚽': ['ball', 'score'],
  '🎯': ['target', 'score'], '🥋': ['sumo', 'score'], '👑': ['crown', 'score'], '🏆': ['trophy', 'score'], '🤝': ['handshake', 'score'],
  '📍': ['pin', 'score'],
  // Facilities / the office acting on you (also every map's event icons)
  '🚧': ['warning', 'fac'], '🤖': ['bot', 'fac'], '🖨': ['printer', 'fac'], '📄': ['printer', 'fac'], '🌑': ['moon', 'fac'],
  '🫨': ['quake', 'fac'], '🌀': ['wind', 'fac'], '🔥': ['flame', 'fac'], '💦': ['drop', 'fac'], '🚨': ['warning', 'fac'],
  '🧺': ['flame', 'fac'], '🏙': ['quake', 'fac'], '🧽': ['bot', 'fac'], '🌬': ['wind', 'fac'], '📉': ['warning', 'fac'],
  // the round's twists (mutators, variants): only as the LEAD of a "MUTATOR:" / VARIANT line
  '🌙': ['moon', 'twist'], '🎈': ['ball', 'twist'], '🐜': ['size', 'twist'],
  // client-local lines
  '💨': ['wind', 'item'],
};

export function parseFeed(text, players = {}, myId = null) {
  let s = String(text);
  let icon = 'road', kind = 'info';
  const m = s.match(LEAD);
  if (m) {
    const key = m[1].replace(/️/g, '');
    const hit = FEED_ICON[key];
    if (hit) [icon, kind] = hit;
    s = s.slice(m[0].length);
  }
  if (/^MUTATOR\b/.test(s)) { kind = 'twist'; if (icon === 'bean') icon = 'cup'; } // Mug Rain shares ☕ with deliveries
  else if (/^[A-Z' ]{4,} — /.test(s)) kind = 'twist'; // variant announcement: "REVERSE — …"
  if (/^Incoming:/.test(s)) { kind = 'fac'; icon = 'warning'; }
  // Last Car Standing's finale shares ⚡ with the EMP: it is Facilities acting
  if (/ is the last room open/.test(s)) { kind = 'fac'; icon = 'lock'; }
  if (/ rolled in$/.test(s)) icon = 'road';

  // team swatches first (RC Soccer: "🟠 Orange takes the match!"), then strip any other inline emoji
  const segs = [];
  s.split(/(🟠|🔵)/u).forEach((chunk) => {
    if (chunk === '🟠') segs.push({ team: 0 });
    else if (chunk === '🔵') segs.push({ team: 1 });
    else if (chunk) {
      const t = chunk.replace(INLINE, '');
      if (t) segs.push({ t });
    }
  });

  // names → { who }, longest first so "Karen" never eats "Karen from HR"
  const names = Object.entries(players)
    .map(([id, p]) => ({ id: p?.id ?? id, name: p?.name }))
    .filter((p) => p.name)
    .sort((a, b) => b.name.length - a.name.length);
  let parts = segs;
  for (const p of names) {
    const next = [];
    for (const seg of parts) {
      if (seg.t == null) { next.push(seg); continue; }
      let rest = seg.t, i;
      while ((i = rest.indexOf(p.name)) !== -1) {
        if (i) next.push({ t: rest.slice(0, i) });
        next.push({ who: p.id });
        rest = rest.slice(i + p.name.length);
      }
      if (rest) next.push({ t: rest });
    }
    parts = next;
  }
  const first = parts.find((q) => q.who);
  // 💨 is only ever pushed locally (LocalCar slipstream): always yours
  const me = !!(first && myId != null && first.who === myId) || !!(m && m[1].startsWith('💨'));
  return { icon, kind, me, parts };
}
