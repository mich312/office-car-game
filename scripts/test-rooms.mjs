// Rooms: the RoomManager's rules against stub rooms, then the real thing —
// a server with clients joining quick play, private rooms and invite codes
// over actual sockets. What matters is who can see whom.
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { MSG, MAX_PLAYERS, normalizeRoomCode } from '../shared/src/index.js';
import { RoomManager } from '../server/src/rooms.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ the rules
const stub = (code, isPrivate) => ({ code, isPrivate, players: new Map(), pending: 0, disposed: false, dispose() { this.disposed = true; } });
const addHumans = (room, n) => { for (let i = 0; i < n; i++) room.players.set(`h${room.players.size}`, { bot: false }); };
let clock = 0;
const mgr = () => new RoomManager(stub, { maxRooms: 5, emptyTtlMs: 60_000, now: () => clock });

check('codes: lowercase and padding are forgiven', normalizeRoomCode(' k7qx ') === 'K7QX');
check('codes: ambiguous letters are not codes (I, O, 0, 1)', ['IOIO', 'K0QX', 'K1QX'].every((c) => normalizeRoomCode(c) === null));
check('codes: wrong length or junk is rejected', ['K7Q', 'K7QXZ', '', 'K7-X', null, 42].every((c) => normalizeRoomCode(c) === null));

{
  const m = mgr();
  const a = m.resolve(null).room;
  addHumans(a, 1);
  const b = m.resolve(null).room;
  check('quick play: strangers land in the same public room', a === b && !a.isPrivate);
  const p = m.resolve('new').room;
  addHumans(p, 1);
  check('private: "new" opens a private room with a proper code', p.isPrivate && normalizeRoomCode(p.code) === p.code && p !== a);
  check('quick play: never drops you into somebody\'s private room', m.resolve(null).room === a);
  check('invite: a code joins that exact room', m.resolve(p.code).room === p);
  check('invite: lowercase codes work too', m.resolve(p.code.toLowerCase()).room === p);
  const r = m.resolve('ZZ9Z');
  check('invite: a code for a room that\'s gone recreates it, private', r.room && r.room.code === 'ZZ9Z' && r.room.isPrivate);
  check('invite: a malformed code is refused with a reason', !!m.resolve('nope!').error);
  addHumans(a, MAX_PLAYERS - a.players.size);
  const c = m.resolve(null).room;
  check('quick play: a full public room overflows into a new one', c !== a && !c.isPrivate);
}

{
  const m = mgr();
  for (let i = 0; i < 5; i++) m.resolve('new');
  check('capacity: past the room cap, new rooms are refused', !!m.resolve('new').error && !!m.resolve('QQQQ').error && !!m.resolve(null).error);
}

{
  clock = 0;
  const m = mgr();
  const busy = m.resolve('new').room; addHumans(busy, 1);
  const empty = m.resolve('new').room;
  const joining = m.resolve('new').room; joining.pending = 1; // socket open, HELLO not yet in
  clock = 59_000; m.sweep();
  check('sweep: an empty room is kept for its grace period', !empty.disposed && m.rooms.has(empty.code));
  clock = 61_000; m.sweep();
  check('sweep: then disposed and forgotten', empty.disposed && !m.rooms.has(empty.code));
  check('sweep: a room with people in it is never disposed', !busy.disposed && m.rooms.has(busy.code));
  check('sweep: nor one with somebody mid-join', !joining.disposed);
  busy.players.clear();
  clock = 100_000; m.sweep();
  check('sweep: the grace period starts when the last human leaves, not at creation', !busy.disposed);
  clock = 161_000; m.sweep();
  check('sweep: …and runs out 60 s after that', busy.disposed);
}

// ----------------------------------------------------- over real sockets
const PORT = 8093;
const server = spawn('node', ['server/src/index.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), RC_BOT_ITEMS: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
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

function client(name, room) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws${room ? `?room=${encodeURIComponent(room)}` : ''}`);
  const c = { ws, name, msgs: [], closed: false };
  c.welcome = new Promise((resolve) => {
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const m = JSON.parse(data.toString());
      c.msgs.push(m);
      if (m.t === MSG.WELCOME) resolve(m);
      if (m.t === MSG.ERROR) resolve(m);
    });
  });
  ws.on('open', () => ws.send(JSON.stringify({ t: MSG.HELLO, name })));
  ws.on('close', () => { c.closed = true; });
  c.sees = (other) => c.msgs.some((m) => (m.t === MSG.PLAYER_JOIN && m.player?.name === other)
    || (m.t === MSG.WELCOME && m.players?.some((p) => p.name === other)));
  return c;
}

const host = client('Host', 'new');
const hw = await host.welcome;
check('socket: "new" welcomes you into a private room with its code', hw.t === MSG.WELCOME && hw.private === true && normalizeRoomCode(hw.room) === hw.room);
const friend = client('Friend', hw.room.toLowerCase());
const fw = await friend.welcome;
check('socket: the invite code puts a friend in the same room', fw.room === hw.room && fw.private === true && friend.sees('Host'));
const stranger = client('Stranger', null);
const sw = await stranger.welcome;
check('socket: quick play is a different, public room', sw.room !== hw.room && sw.private === false);
await sleep(400);
check('socket: the host sees the friend join', host.sees('Friend'));
check('socket: nobody in the private room sees the stranger', !host.sees('Stranger') && !friend.sees('Stranger'));
check('socket: and the stranger sees neither of them', !stranger.sees('Host') && !stranger.sees('Friend'));
const stranger2 = client('Stranger2', null);
const s2 = await stranger2.welcome;
check('socket: a second quick-play player meets the first', s2.room === sw.room && stranger2.sees('Stranger'));
const bad = client('Bad', 'IO01');
const bw = await bad.welcome;
await sleep(300);
check('socket: a malformed code is turned away with a reason, and closed', bw.t === MSG.ERROR && bw.fatal === true && bad.closed);

// the server still serves everyone after all that
const late = client('Late', hw.room);
check('socket: rooms keep working after a rejected join', (await late.welcome).room === hw.room);

for (const c of [host, friend, stranger, stranger2, late]) c.ws.close();
server.kill();
console.log(fails ? `\n${fails} room check(s) failed` : '\nall room checks passed');
process.exit(fails ? 1 : 0);
