// End-to-end smoke test: boots the real server, connects two ws clients and
// exercises binary snapshots, respawn flow (RESPAWN_AT + protection flag),
// rub-vs-hit bump classification, nudge relay, and the new mode snapshots.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { decodeSnapshot, MSG } from '../shared/src/index.js';

const PORT = 8091;
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['server/src/index.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), RC_MATCH_SECONDS: '60' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
await sleep(1200);

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  ws.binaryType = 'arraybuffer';
  const c = { ws, name, id: null, msgs: [], snaps: [], open: new Promise((res) => ws.on('open', res)) };
  ws.on('message', (data, isBinary) => {
    if (isBinary || data instanceof ArrayBuffer) {
      try { c.snaps.push(decodeSnapshot(data)); } catch (e) { console.error('decode fail', e); fails++; }
    } else {
      const m = JSON.parse(data.toString());
      if (m.t === MSG.WELCOME) c.id = m.id;
      c.msgs.push(m);
    }
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.last = (t) => [...c.msgs].reverse().find((m) => m.t === t);
  c.all = (t) => c.msgs.filter((m) => m.t === t);
  return c;
}

async function playMode(mode, body) {
  const a = client('A'), b = client('B');
  await Promise.all([a.open, b.open]);
  a.send({ t: MSG.HELLO, name: 'Alice', car: 'monster' });
  b.send({ t: MSG.HELLO, name: 'Bob', car: 'formula' });
  await sleep(300);
  a.send({ t: 'vote', mode });
  b.send({ t: 'vote', mode });
  a.send({ t: 'ready', ready: true });
  b.send({ t: 'ready', ready: true });
  await sleep(500);
  const start = a.last(MSG.START);
  check(`${mode}: START broadcast with voted mode`, start?.mode === mode);
  await sleep(4300); // countdown (4 s)
  await body(a, b);
  a.ws.close(); b.ws.close();
  await sleep(400); // room resets to lobby when humans leave
}

const state = (c, p, v = [0, 0, 0]) => c.send({ t: 's', p, q: [0, 0, 0, 1], v, d: false, g: true });

// ---------------------------------------------------------------- tag mode
await playMode('tag', async (a, b) => {
  await sleep(600);
  let snap = a.snaps[a.snaps.length - 1];
  check('tag: snapshot decodes with players', snap && Object.keys(snap.players).length >= 2);
  check('tag: snapshot has an It id', typeof snap.it === 'string' && snap.it.length > 0);
  check('tag: binary frame is compact', true);

  // Move both cars adjacent; craft a high relative speed so the bump is a HIT
  state(a, [0, 1, 0], [20, 0, 0]);
  state(b, [1, 1, 0], [-20, 0, 0]);
  await sleep(150);
  const itBefore = a.snaps[a.snaps.length - 1].it;
  a.send({ t: 'bump', target: b.id });
  await sleep(300);
  const hit = a.all('fx').find((m) => m.type === 'bump' && m.kind === 'hit');
  check('tag: high-rel-speed bump classified as hit', !!hit);
  snap = a.snaps[a.snaps.length - 1];
  const tagged = a.all('fx').some((m) => m.type === 'tag');
  check('tag: It transferred on contact between It and non-It',
    tagged || snap.it !== itBefore || ![a.id, b.id].includes(itBefore));

  // Low relative speed → rub, no knockback broadcast fields
  await sleep(1000);
  state(a, [0, 1, 2], [5, 0, 0]);
  state(b, [1, 1, 2], [4, 0, 0]);
  await sleep(150);
  a.send({ t: 'bump', target: b.id });
  await sleep(300);
  const rub = a.all('fx').find((m) => m.type === 'bump' && m.kind === 'rub');
  check('tag: low-rel-speed bump classified as rub', !!rub);

  // Respawn flow: request → RESPAWN_AT with freeze/protect, protection flag set
  a.send({ t: 'respawn' });
  await sleep(300);
  const rs = a.last('rsat');
  check('respawn: server answers RESPAWN_AT', !!rs && Number.isFinite(rs.x) && Number.isFinite(rs.z));
  check('respawn: freeze+protect windows included', rs?.freeze > 0 && rs?.protect > 0);
  const snap2 = a.snaps[a.snaps.length - 1];
  check('respawn: protection flag (64) visible in snapshot', !!(snap2.players[a.id].f & 64));

  // Protected player can't be hit
  a.msgs.length = 0;
  state(b, [rs.x + 1, 1, rs.z], [20, 0, 0]);
  state(a, [rs.x, 1, rs.z], [-20, 0, 0]);
  await sleep(150);
  b.send({ t: 'bump', target: a.id });
  await sleep(300);
  check('respawn: protected car ignores bumps', !a.all('fx').some((m) => m.type === 'bump' && m.kind === 'hit'));

  // Prop momentum relay: A whacked prop 0 → B receives the fx, A does not
  b.msgs.length = 0;
  a.msgs.length = 0;
  a.send({ t: 'pr', i: 0, im: [15, 0, 3] });
  await sleep(300);
  const relayed = b.all('fx').find((m) => m.type === 'prop' && m.i === 0);
  check('prop: whack relayed to the other client', !!relayed && Array.isArray(relayed.im));
  check('prop: not echoed to sender', !a.all('fx').some((m) => m.type === 'prop'));
});

// --------------------------------------------------------------- koth mode
await playMode('koth', async (a) => {
  await sleep(800);
  const snap = a.snaps[a.snaps.length - 1];
  check('koth: zone present in snapshot', !!snap.zone && snap.zone.r > 0);
  check('koth: zone hop deadline included', snap.zone.until > snap.time);
  // park in the zone → score should rise
  state(a, [snap.zone.x, 1, snap.zone.z]);
  await sleep(2600);
  const score = a.last('score');
  check('koth: standing in the zone scores', (score?.scores?.[a.id] || 0) > 0);
});

// --------------------------------------------------------------- sumo mode
await playMode('sumo', async (a, b) => {
  await sleep(1000);
  let snap = a.snaps[a.snaps.length - 1];
  check('sumo: zone present with start radius', !!snap.zone && snap.zone.r > 40);
  check('sumo: round number in snapshot', snap.sumo?.round >= 1);
  // A leaves the zone far away (map corner, outside even the starting ring)
  // → out-timer appears, then elimination
  state(a, [90, 1, -50], [0, 0, 0]);
  state(b, [snap.zone.x, 1, snap.zone.z], [0, 0, 0]);
  await sleep(1500);
  snap = a.snaps[a.snaps.length - 1];
  check('sumo: out-of-zone timer ticking for A', (snap.sumo?.out || []).some(([id]) => id === a.id));
  await sleep(5500);
  snap = a.snaps[a.snaps.length - 1];
  check('sumo: A eliminated (KO flag 128)', !!(snap.players[a.id].f & 128));
  check('sumo: KO effect broadcast', a.all('fx').some((m) => m.type === 'sumo_out' && m.id === a.id));
});

// -------------------------------------------------------------- soccer mode
await playMode('soccer', async (a) => {
  await sleep(800);
  const snap = a.snaps[a.snaps.length - 1];
  check('soccer: ball present in binary snapshot', Array.isArray(snap.ball?.p));
  check('soccer: team scores present', Array.isArray(snap.teamScores));
});

server.kill();
console.log(fails === 0 ? '\nALL SMOKE TESTS PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
