// Binary snapshot codec. The per-tick SNAPSHOT is by far the hottest message
// (20 Hz × 12 players × every client), so it goes over the wire as a
// quantized binary frame instead of JSON: 16-bit fixed-point positions (1 cm),
// 16-bit quaternion components (0.001 — matches the old JSON rounding), and a
// section bitmask so modes only pay for the state they use. Everything else
// (lobby, effects, feed) stays JSON. decodeSnapshot returns the exact object
// shape the old JSON snapshot had, so the client's handler is unchanged.
import { MSG } from './protocol.js';
import { ROOMS } from './map.js';

// Section bits
const S_PUDDLES = 1;
const S_ROCKETS = 2;
const S_ROBOT = 4;
const S_BALL = 8;
const S_BEANS = 16;
const S_BATTERY = 32;
const S_RACE = 64;
const S_TEAMSCORES = 128;
const S_ZONE = 256;
const S_IT = 512;
const S_SUMO = 1024;
const S_LCS = 2048; // Last Car Standing: locked rooms, closure warning, alive count

const POS = 100; // 1 cm
const QUAT = 1000;
const VEL = 10;

const clampI16 = (n) => Math.max(-32768, Math.min(32767, Math.round(n)));
const clampU16 = (n) => Math.max(0, Math.min(65535, Math.round(n)));
const clampU8 = (n) => Math.max(0, Math.min(255, Math.round(n)));

class Writer {
  constructor(size = 2048) {
    this.buf = new ArrayBuffer(size);
    this.view = new DataView(this.buf);
    this.o = 0;
  }
  ensure(n) {
    if (this.o + n <= this.buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.o));
    this.buf = next;
    this.view = new DataView(next);
  }
  u8(n) { this.ensure(1); this.view.setUint8(this.o, clampU8(n)); this.o += 1; }
  u16(n) { this.ensure(2); this.view.setUint16(this.o, clampU16(n), true); this.o += 2; }
  // ids from ever-growing counters wrap instead of clamping — they only need
  // short-term uniqueness on the wire
  id16(n) { this.ensure(2); this.view.setUint16(this.o, (n >>> 0) & 0xffff, true); this.o += 2; }
  i16(n) { this.ensure(2); this.view.setInt16(this.o, clampI16(n), true); this.o += 2; }
  u32(n) { this.ensure(4); this.view.setUint32(this.o, Math.max(0, Math.min(0xffffffff, Math.round(n))), true); this.o += 4; }
  f64(n) { this.ensure(8); this.view.setFloat64(this.o, n, true); this.o += 8; }
  str(s) {
    const t = String(s ?? '').slice(0, 255);
    this.ensure(1 + t.length);
    this.view.setUint8(this.o++, t.length);
    for (let i = 0; i < t.length; i++) this.view.setUint8(this.o++, t.charCodeAt(i) & 0x7f);
  }
  bytes() { return new Uint8Array(this.buf, 0, this.o); }
}

class Reader {
  constructor(data) {
    // Accept ArrayBuffer, Node Buffer or any TypedArray view.
    if (data instanceof ArrayBuffer) this.view = new DataView(data);
    else this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.o = 0;
  }
  u8() { const n = this.view.getUint8(this.o); this.o += 1; return n; }
  u16() { const n = this.view.getUint16(this.o, true); this.o += 2; return n; }
  i16() { const n = this.view.getInt16(this.o, true); this.o += 2; return n; }
  u32() { const n = this.view.getUint32(this.o, true); this.o += 4; return n; }
  f64() { const n = this.view.getFloat64(this.o, true); this.o += 8; return n; }
  str() {
    const len = this.u8();
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.u8());
    return s;
  }
}

export function encodeSnapshot(snap) {
  const w = new Writer();
  const t = snap.time;
  let sections = 0;
  if (snap.puddles?.length) sections |= S_PUDDLES;
  if (snap.rockets?.length) sections |= S_ROCKETS;
  if (snap.robot) sections |= S_ROBOT;
  if (snap.ball) sections |= S_BALL;
  if (snap.beans) sections |= S_BEANS;
  if (snap.battery) sections |= S_BATTERY;
  if (snap.race) sections |= S_RACE;
  if (snap.teamScores) sections |= S_TEAMSCORES;
  if (snap.zone) sections |= S_ZONE;
  if (snap.it != null) sections |= S_IT;
  if (snap.sumo) sections |= S_SUMO;
  if (snap.lcs) sections |= S_LCS;

  w.f64(t);
  w.u16(sections);

  const ids = Object.keys(snap.players || {});
  w.u8(ids.length);
  for (const id of ids) {
    const p = snap.players[id];
    w.str(id);
    w.i16(p.p[0] * POS); w.i16(p.p[1] * POS); w.i16(p.p[2] * POS);
    w.i16(p.q[0] * QUAT); w.i16(p.q[1] * QUAT); w.i16(p.q[2] * QUAT); w.i16(p.q[3] * QUAT);
    w.u8(p.f || 0);
    w.u8(p.c || 0);
  }

  if (sections & S_PUDDLES) {
    w.u8(snap.puddles.length);
    for (const pu of snap.puddles) {
      w.id16(pu.id);
      w.u8(pu.kind === 'coffee' ? 1 : 0);
      w.i16(pu.x * POS); w.i16(pu.z * POS);
      w.u32(Math.max(0, pu.until - t));
    }
  }
  if (sections & S_ROCKETS) {
    w.u8(snap.rockets.length);
    for (const r of snap.rockets) {
      w.id16(r.id);
      w.i16(r.p[0] * POS); w.i16(r.p[1] * POS); w.i16(r.p[2] * POS);
    }
  }
  if (sections & S_ROBOT) { w.i16(snap.robot.x * POS); w.i16(snap.robot.z * POS); }
  if (sections & S_BALL) {
    w.i16(snap.ball.p[0] * POS); w.i16(snap.ball.p[1] * POS); w.i16(snap.ball.p[2] * POS);
    w.i16(snap.ball.v[0] * VEL); w.i16(snap.ball.v[1] * VEL); w.i16(snap.ball.v[2] * VEL);
    // radius rides along so the Giant Ball mutator actually looks giant —
    // dropping it here left clients rendering a stock ball the server was
    // scoring at 1.8× size
    w.u16((snap.ball.r || 0) * POS);
  }
  if (sections & S_BEANS) {
    // the count byte is u8: write exactly the entries the count promises, or
    // a 256+ bean pile shifts every later section into garbage on decode
    const beans = snap.beans.length > 255 ? snap.beans.slice(0, 255) : snap.beans;
    w.u8(beans.length);
    for (const [id, x, z] of beans) { w.id16(id); w.i16(x * POS); w.i16(z * POS); }
  }
  if (sections & S_BATTERY) {
    w.i16(snap.battery.x * POS); w.i16(snap.battery.z * POS);
    w.str(snap.battery.carrier || '');
  }
  if (sections & S_RACE) {
    const rids = Object.keys(snap.race);
    w.u8(rids.length);
    for (const id of rids) { w.str(id); w.u8(snap.race[id][0]); w.u8(snap.race[id][1]); }
  }
  if (sections & S_TEAMSCORES) { w.u16(snap.teamScores[0]); w.u16(snap.teamScores[1]); }
  if (sections & S_ZONE) {
    w.i16(snap.zone.x * POS); w.i16(snap.zone.z * POS);
    w.u16(snap.zone.r * POS);
    w.u32(snap.zone.until ? Math.max(0, snap.zone.until - t) : 0);
  }
  if (sections & S_IT) w.str(snap.it);
  if (sections & S_SUMO) {
    w.u8(snap.sumo.round || 0);
    const out = snap.sumo.out || [];
    w.u8(out.length);
    for (const [id, tenths] of out) { w.str(id); w.u8(tenths); }
  }
  if (sections & S_LCS) {
    const roomIdx = (id) => Math.max(0, ROOMS.findIndex((r) => r.id === id));
    w.u8(snap.lcs.locked.length);
    for (const id of snap.lcs.locked) w.u8(roomIdx(id));
    if (snap.lcs.warn) {
      w.u8(1);
      w.u8(roomIdx(snap.lcs.warn.room));
      w.u32(Math.max(0, snap.lcs.warn.until - t));
    } else {
      w.u8(0);
    }
    w.u8(snap.lcs.alive || 0);
  }
  return w.bytes();
}

export function decodeSnapshot(data) {
  const r = new Reader(data);
  const time = r.f64();
  const sections = r.u16();
  const snap = { t: MSG.SNAPSHOT, time, players: {}, puddles: [] };

  const n = r.u8();
  for (let i = 0; i < n; i++) {
    const id = r.str();
    snap.players[id] = {
      p: [r.i16() / POS, r.i16() / POS, r.i16() / POS],
      q: [r.i16() / QUAT, r.i16() / QUAT, r.i16() / QUAT, r.i16() / QUAT],
      f: r.u8(),
      c: r.u8(),
    };
  }

  if (sections & S_PUDDLES) {
    const c = r.u8();
    for (let i = 0; i < c; i++) {
      snap.puddles.push({
        id: r.u16(),
        kind: r.u8() === 1 ? 'coffee' : 'oil',
        x: r.i16() / POS, z: r.i16() / POS,
        until: time + r.u32(),
      });
    }
  }
  if (sections & S_ROCKETS) {
    const c = r.u8();
    snap.rockets = [];
    for (let i = 0; i < c; i++) {
      snap.rockets.push({ id: r.u16(), p: [r.i16() / POS, r.i16() / POS, r.i16() / POS] });
    }
  }
  if (sections & S_ROBOT) snap.robot = { x: r.i16() / POS, z: r.i16() / POS };
  if (sections & S_BALL) {
    snap.ball = {
      p: [r.i16() / POS, r.i16() / POS, r.i16() / POS],
      v: [r.i16() / VEL, r.i16() / VEL, r.i16() / VEL],
    };
    const br = r.u16();
    if (br) snap.ball.r = br / POS;
  }
  if (sections & S_BEANS) {
    const c = r.u8();
    snap.beans = [];
    for (let i = 0; i < c; i++) snap.beans.push([r.u16(), r.i16() / POS, r.i16() / POS]);
  }
  if (sections & S_BATTERY) {
    snap.battery = { x: r.i16() / POS, z: r.i16() / POS, carrier: null };
    const carrier = r.str();
    if (carrier) snap.battery.carrier = carrier;
  }
  if (sections & S_RACE) {
    const c = r.u8();
    snap.race = {};
    for (let i = 0; i < c; i++) { const id = r.str(); snap.race[id] = [r.u8(), r.u8()]; }
  }
  if (sections & S_TEAMSCORES) snap.teamScores = [r.u16(), r.u16()];
  if (sections & S_ZONE) {
    snap.zone = { x: r.i16() / POS, z: r.i16() / POS, r: r.u16() / POS };
    const d = r.u32();
    if (d) snap.zone.until = time + d;
  }
  if (sections & S_IT) snap.it = r.str();
  if (sections & S_SUMO) {
    snap.sumo = { round: r.u8(), out: [] };
    const c = r.u8();
    for (let i = 0; i < c; i++) snap.sumo.out.push([r.str(), r.u8()]);
  }
  if (sections & S_LCS) {
    const locked = [];
    const c = r.u8();
    for (let i = 0; i < c; i++) locked.push(ROOMS[r.u8()]?.id);
    let warn = null;
    if (r.u8()) warn = { room: ROOMS[r.u8()]?.id, until: time + r.u32() };
    snap.lcs = { locked, warn, alive: r.u8() };
  }
  return snap;
}
