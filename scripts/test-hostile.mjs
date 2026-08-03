// Hostile-client tests: the server's trust boundary, exercised with the
// messages a real client would never send. The smoke test only ever sends
// well-formed input, which is exactly why these bugs survived it.
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import {
  decodeSnapshot, MSG, MAP_BOUNDS, NUDGE_MAX_SPEED, MAX_PLAUSIBLE_SPEED,
} from '../shared/src/index.js';

const PORT = 8092;
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['server/src/index.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), RC_MATCH_SECONDS: '120' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
// Wait for the server to actually bind rather than hoping a fixed delay is
// enough — on a cold module cache startup can exceed it, and then every
// check below reads as a failure (the suite's one historical flake).
await new Promise((resolve, reject) => {
  const t0 = Date.now();
  const probe = () => {
    const sock = net.connect(PORT, '127.0.0.1', () => { sock.destroy(); resolve(); });
    sock.on('error', () => {
      sock.destroy();
      if (Date.now() - t0 > 15000) reject(new Error('server never bound'));
      else setTimeout(probe, 150);
    });
  };
  probe();
});

// ------------------------------------------------------------------- HTTP
// A malformed percent-escape makes decodeURIComponent throw. Unguarded that
// throw ends the process — and every match with it.
function rawRequest(line) {
  return new Promise((resolve) => {
    const sock = net.connect(PORT, '127.0.0.1', () => {
      sock.write(`GET ${line} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    sock.on('data', (d) => { data += d.toString(); });
    sock.on('close', () => resolve(data));
    sock.on('error', () => resolve(''));
  });
}

const bad = await rawRequest('/%');
check('http: malformed escape answers 400 instead of throwing', /^HTTP\/1\.1 400/.test(bad));
const badder = await rawRequest('/%zz/../%E0%A4%A');
check('http: other malformed escapes are handled too', /^HTTP\/1\.1 [24]0[0-9]/.test(badder));
const traversal = await rawRequest('/../../package.json');
check('http: path traversal does not escape the dist root', !/"name":\s*"tiny-rc-mayhem"/.test(traversal));
const ok = await rawRequest('/');
check('http: server is still alive afterwards', /^HTTP\/1\.1 200/.test(ok));

// --------------------------------------------------------------------- ws
function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  ws.binaryType = 'arraybuffer';
  const c = { ws, name, id: null, msgs: [], snaps: [], open: new Promise((res) => ws.on('open', res)) };
  ws.on('message', (data, isBinary) => {
    if (isBinary || data instanceof ArrayBuffer) {
      try { c.snaps.push(decodeSnapshot(data)); } catch { fails++; }
    } else {
      const m = JSON.parse(data.toString());
      if (m.t === MSG.WELCOME) c.id = m.id;
      c.msgs.push(m);
    }
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.last = (t) => [...c.msgs].reverse().find((m) => m.t === t);
  c.all = (t) => c.msgs.filter((m) => m.t === t);
  c.posOf = (id) => c.snaps[c.snaps.length - 1]?.players?.[id]?.p ?? null;
  return c;
}

const state = (c, p, v = [0, 0, 0]) => c.send({ t: MSG.STATE, p, q: [0, 0, 0, 1], v, d: false, g: true });
const near = (a, b, eps = 0.5) => a != null && Math.hypot(a[0] - b[0], a[2] - b[2]) < eps;

const a = client('A'), b = client('B');
await Promise.all([a.open, b.open]);
a.send({ t: MSG.HELLO, name: 'Mallory', car: 'monster' });
b.send({ t: MSG.HELLO, name: 'Bob', car: 'formula' });
await sleep(300);
a.send({ t: MSG.VOTE_MODE, mode: 'desk_dash' });
b.send({ t: MSG.VOTE_MODE, mode: 'desk_dash' });
a.send({ t: MSG.READY, ready: true });
b.send({ t: MSG.READY, ready: true });
await sleep(500);
check('setup: desk_dash started', a.last(MSG.START)?.mode === 'desk_dash');

// Park both cars somewhere known while the post-countdown teleport grant is
// still open, then hold position until it lapses.
const HOME = [0, 1, 0];
for (let i = 0; i < 40; i++) { state(a, HOME); state(b, [4, 1, 0]); await sleep(200); }
check('setup: teleport grant has lapsed and A is parked at home', near(a.posOf(a.id), HOME));

// ------------------------------------------- malformed numbers (finding 4.1)
// NaN fails every comparison, so an unvalidated NaN position slips past the
// teleport check, then makes its owner untouchable by every distance test and
// encodes as the world origin for everyone else.
state(a, ['bogus', 'bogus', 'bogus']);
await sleep(200);
check('state: non-numeric position is rejected outright', near(a.posOf(a.id), HOME));
state(a, [NaN, NaN, NaN]);
await sleep(200);
check('state: NaN position is rejected', near(a.posOf(a.id), HOME));
state(a, [Infinity, 0, 0]);
await sleep(200);
check('state: infinite position is rejected', near(a.posOf(a.id), HOME));
state(a, [1]);
await sleep(200);
check('state: short position array is rejected', near(a.posOf(a.id), HOME));
a.send({ t: MSG.STATE, p: HOME, q: ['x', 'y', 'z', 'w'], v: [null, null, null] });
await sleep(200);
check('state: a good position with junk rotation/velocity still lands', near(a.posOf(a.id), HOME));

// ------------------------------------------------ out-of-bounds (finding 4.1)
state(a, [MAP_BOUNDS.maxX + 5000, 0, 0]);
await sleep(250);
{
  const p = a.posOf(a.id);
  check('state: a position way outside the floor plan is clamped, not stored',
    p != null && p[0] < MAP_BOUNDS.maxX + 100);
}
state(a, HOME);
await sleep(300);

// ------------------------------------------------ absurd velocity (finding 4.2)
// Reported velocity drives hit-vs-rub classification and shove magnitude.
state(a, [2, 1, 0], [1e6, 0, 0]);
state(b, [2.6, 1, 0], [-1e6, 0, 0]);
await sleep(150);
a.send({ t: MSG.BUMP, target: b.id });
await sleep(300);
{
  const hit = a.all('fx').find((m) => m.type === 'bump' && m.kind === 'hit');
  check('bump: a fabricated velocity still registers as a hit', !!hit);
  check('bump: but its severity is clamped to the physics ceiling',
    !!hit && hit.rel <= NUDGE_MAX_SPEED * 2 + 1);
}
state(a, HOME);
await sleep(300);

// ----------------------------------------------------- teleporting (finding 4.3)
const FAR = [-70, 1, 30];
state(a, FAR);
await sleep(200);
check('teleport: a single map-crossing jump is rejected', near(a.posOf(a.id), HOME));

// A stream of *different* impossible jumps is a cheat, not a teleport we
// failed to sanction. It must never talk its way through.
// Every point sits ~40 units from home (far past any single-report allowance)
// and ~60 units from the one before it (far past the anchor radius), so the
// only thing that can let one through is the strike counter losing its memory.
for (let i = 0; i < 40; i++) {
  const ang = i * 1.7;
  state(a, [Math.cos(ang) * 40, 1, Math.sin(ang) * 40]);
  await sleep(60);
}
{
  const p = a.posOf(a.id);
  check('teleport: 40 inconsistent jumps never get accepted', near(p, HOME, 2));
}

// …but a client that genuinely got teleported keeps reporting the SAME place,
// and it has to be believed or it would be stuck at a stale position forever.
for (let i = 0; i < 30; i++) { state(a, FAR); await sleep(60); }
check('teleport: a consistent report is eventually believed', near(a.posOf(a.id), FAR, 2));

// re-park, plausibly this time
for (let i = 0; i < 20; i++) { state(a, HOME); await sleep(80); }
check('teleport: home again for the respawn checks', near(a.posOf(a.id), HOME, 3));

// ---------------------------------------------- respawn proposals (finding 4.4)
// Races let the client propose its own respawn pose. In-bounds is not enough
// of a check: it would let a client name any point on the floor, including one
// just short of the next checkpoint.
const CHEAT = [MAP_BOUNDS.maxX - 5, MAP_BOUNDS.maxZ - 5, 0];
a.send({ t: MSG.RESPAWN, safe: CHEAT });
await sleep(400);
{
  const r = a.last(MSG.RESPAWN_AT);
  check('respawn: server answers a proposal it never witnessed', !!r);
  check('respawn: …but does not honour it',
    !!r && Math.hypot(r.x - CHEAT[0], r.z - CHEAT[1]) > 5);
}

// A pose the server actually watched us drive is still honoured, so the
// no-walk-back-three-rooms behaviour survives.
const SEEN = [10, 1, -6];
for (let i = 0; i < 12; i++) { state(a, SEEN); await sleep(220); }
await sleep(1400); // respawn requests are rate limited
a.send({ t: MSG.RESPAWN, safe: [SEEN[0], SEEN[2], 0] });
await sleep(400);
{
  const r = a.last(MSG.RESPAWN_AT);
  check('respawn: a pose the server saw us at is honoured',
    !!r && Math.hypot(r.x - SEEN[0], r.z - SEEN[2]) < 2);
}

// ------------------------------------------------------------- spam & junk
for (let i = 0; i < 200; i++) a.send({ t: MSG.PROP, i: 0, im: [50, 50, 50] });
a.send({ t: MSG.PROP, i: 99999, im: [1, 1, 1] });
a.send({ t: MSG.PROP, i: 0, im: ['x', 'y', 'z'] });
a.send({ t: MSG.EMOTE, e: 9999 });
a.send({ t: MSG.VOTE_MODE, mode: 'not_a_mode' });
a.send({ t: 'no_such_message', lol: true });
a.ws.send('{ this is not json');
await sleep(500);
check('spam: server survives a burst of junk messages', a.ws.readyState === 1);
{
  const relayed = b.all('fx').filter((m) => m.type === 'prop').length;
  check('spam: prop relay stays rate limited under a 200-message burst', relayed <= 30);
}
const alive = await rawRequest('/');
check('spam: server is still serving afterwards', /^HTTP\/1\.1 200/.test(alive));

a.ws.close(); b.ws.close();
await sleep(400);
server.kill();
console.log(fails ? `\n${fails} hostile-client check(s) failed` : '\nALL HOSTILE-CLIENT TESTS PASS');
process.exit(fails ? 1 : 0);
