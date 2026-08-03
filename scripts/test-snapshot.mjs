import { encodeSnapshot, decodeSnapshot } from '../shared/src/snapshot.js';

const approx = (a, b, eps) => Math.abs(a - b) <= eps;
let fails = 0;
const check = (name, cond) => { if (!cond) { fails++; console.error('FAIL:', name); } };

const t = Date.now();
const snap = {
  t: 'ss', time: t,
  players: {
    p1: { p: [-13.42, 0.31, -5.99], q: [0.001, 0.7071, -0.002, 0.7071], f: 1 | 2 | 64, c: 3 },
    bot2: { p: [66.6, 3.3, -40.0], q: [0, 0, 0, 1], f: 128 | 32, c: 0 },
  },
  puddles: [{ id: 7, kind: 'oil', x: 1.23, z: -4.56, until: t + 8000 }, { id: 8, kind: 'coffee', x: 0, z: 0, until: t + 100 }],
  rockets: [{ id: 3, owner: 'p1', target: 'bot2', p: [10.1, 2.2, -3.3] }],
  robot: { x: -5.5, z: 6.6 },
  ball: { p: [-13.3, 1.86, -13.3], v: [12.3, -4.5, 0.1], r: 3.36 },
  beans: [[1001, 2.5, -3.5], [4, -60.2, 39.9]],
  battery: { x: 26.7, z: -2.2, carrier: 'p1' },
  race: { p1: [2, 11], bot2: [0, 3] },
  teamScores: [3, 5],
  zone: { x: -13.3, z: -13.3, r: 44.4, until: t + 20000 },
  it: 'bot2',
  sumo: { round: 2, out: [['p1', 43]] },
  lcs: { locked: ['reception', 'storage'], warn: { room: 'games', until: t + 5000 }, alive: 4 },
};

const bytes = encodeSnapshot(snap);
console.log('encoded size:', bytes.length, 'bytes (JSON:', JSON.stringify(snap).length, ')');
const d = decodeSnapshot(bytes);

check('type', d.t === 'ss');
check('time', d.time === t);
for (const id of ['p1', 'bot2']) {
  const a = snap.players[id], b = d.players[id];
  check(`${id} exists`, !!b);
  for (let k = 0; k < 3; k++) check(`${id} p[${k}]`, approx(a.p[k], b.p[k], 0.011));
  for (let k = 0; k < 4; k++) check(`${id} q[${k}]`, approx(a.q[k], b.q[k], 0.0011));
  check(`${id} f`, a.f === b.f);
  check(`${id} c`, a.c === b.c);
}
check('puddle count', d.puddles.length === 2);
check('puddle kind', d.puddles[0].kind === 'oil' && d.puddles[1].kind === 'coffee');
check('puddle until', approx(d.puddles[0].until, t + 8000, 1));
check('puddle x', approx(d.puddles[0].x, 1.23, 0.011));
check('rocket', d.rockets.length === 1 && d.rockets[0].id === 3 && approx(d.rockets[0].p[2], -3.3, 0.011));
check('robot', approx(d.robot.x, -5.5, 0.011) && approx(d.robot.z, 6.6, 0.011));
check('ball p', approx(d.ball.p[1], 1.86, 0.011));
check('ball v', approx(d.ball.v[0], 12.3, 0.11) && approx(d.ball.v[1], -4.5, 0.11));
check('ball r (giant ball mutator)', approx(d.ball.r, 3.36, 0.011));
check('beans', d.beans.length === 2 && d.beans[0][0] === 1001 && approx(d.beans[1][1], -60.2, 0.011));
check('battery', approx(d.battery.x, 26.7, 0.011) && d.battery.carrier === 'p1');
check('race', d.race.p1[0] === 2 && d.race.p1[1] === 11 && d.race.bot2[1] === 3);
check('teamScores', d.teamScores[0] === 3 && d.teamScores[1] === 5);
check('zone', approx(d.zone.r, 44.4, 0.011) && approx(d.zone.until, t + 20000, 1));
check('it', d.it === 'bot2');
check('sumo', d.sumo.round === 2 && d.sumo.out.length === 1 && d.sumo.out[0][0] === 'p1' && d.sumo.out[0][1] === 43);
check('lcs locked', d.lcs.locked.length === 2 && d.lcs.locked[0] === 'reception' && d.lcs.locked[1] === 'storage');
check('lcs warn', d.lcs.warn.room === 'games' && approx(d.lcs.warn.until, t + 5000, 1));
check('lcs alive', d.lcs.alive === 4);
check('min no lcs', decodeSnapshot(encodeSnapshot({ t: 'ss', time: t, players: {}, puddles: [] })).lcs === undefined);

// minimal snapshot (lobby phase: players only)
const min = { t: 'ss', time: t, players: { p1: { p: [0, 1, 0], q: [0, 0, 0, 1], f: 0, c: 0 } }, puddles: [] };
const dm = decodeSnapshot(encodeSnapshot(min));
check('min players', !!dm.players.p1);
check('min no ball', dm.ball === undefined);
check('min no battery', dm.battery === undefined);
check('min no it', dm.it === undefined);

// empty players (empty room tick)
const de = decodeSnapshot(encodeSnapshot({ t: 'ss', time: t, players: {}, puddles: [] }));
check('empty ok', Object.keys(de.players).length === 0);

// Node Buffer input path (ws delivers Buffer on server-side tests)
const dbuf = decodeSnapshot(Buffer.from(bytes));
check('buffer input', dbuf.it === 'bot2');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
