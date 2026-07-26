// WebSocket client: connection, snapshot interpolation buffers, event bus.
// Everything a useFrame loop reads lives on the mutable `net` object —
// zustand only gets things React actually renders.
import { MSG, INTERP_DELAY_MS, PHASE, decodeSnapshot } from '@rc/shared';
import { useStore } from './store.js';

export const net = {
  ws: null,
  myId: null,
  remotes: new Map(), // id → [{ t, p, q, f, c }] snapshot buffer
  flags: new Map(), // id → latest flags
  clockOffset: 0, // serverTime - localTime (smoothed)
  ball: null, // { t, p, v } latest two for lerp
  ballPrev: null,
  beans: [], // [[id, x, z]]
  battery: null,
  puddles: [],
  rockets: [],
  robot: null,
  zone: null, // { x, z, r, until? } — koth/sumo zone
  it: null, // player id currently It (tag mode)
  sumo: null, // { round, out: [[id, tenths]] }
  padCooldowns: new Map(),
  spawnIndex: 0,
  teams: {},
};
// debug/tooling hook (mirrors window.__rcTelemetry in LocalCar)
if (typeof window !== 'undefined') window.__rcNet = net;

// ------------------------------------------------------------ event bus
const handlers = new Map();
export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}
export function emit(type, data) {
  handlers.get(type)?.forEach((fn) => fn(data));
}

export function send(obj) {
  if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(obj));
}

export function sendState(p, q, v, drifting, grounded) {
  send({ t: MSG.STATE, p, q, v, d: drifting, g: grounded });
}

let reconnectTimer = null;
let intentionalClose = false;

export function connect() {
  const store = useStore.getState();
  intentionalClose = false;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer'; // snapshots arrive as binary frames
  net.ws = ws;

  ws.onopen = () => {
    send({ t: MSG.HELLO, name: store.name || 'Intern', car: store.car, paint: store.paint, cos: store.cos, style: store.style, tune: store.tune });
  };
  ws.onmessage = (e) => {
    let msg;
    if (e.data instanceof ArrayBuffer) {
      try { msg = decodeSnapshot(e.data); } catch { return; }
    } else {
      try { msg = JSON.parse(e.data); } catch { return; }
    }
    handleMessage(msg);
  };
  ws.onclose = () => {
    useStore.setState({ connected: false });
    if (!intentionalClose) {
      // auto-reconnect: the office never really closes
      reconnectTimer = setTimeout(() => {
        if (useStore.getState().screen === 'game') connect();
      }, 1500);
    }
  };
  ws.onerror = () => {
    useStore.setState({ connectError: 'Could not reach the office server.' });
  };
}

export function disconnect() {
  intentionalClose = true;
  clearTimeout(reconnectTimer);
  net.ws?.close();
  net.remotes.clear();
  net.flags.clear();
  useStore.setState({ connected: false, myId: null });
}

function handleMessage(msg) {
  const S = useStore;
  switch (msg.t) {
    case MSG.WELCOME: {
      net.myId = msg.id;
      const players = {};
      for (const p of msg.players) players[p.id] = p;
      S.setState({
        connected: true, connectError: null, myId: msg.id,
        phase: msg.phase, modeId: msg.mode, endsAt: msg.endsAt, players,
      });
      break;
    }
    case MSG.LOBBY: {
      const players = {};
      for (const p of msg.players) players[p.id] = p;
      S.setState({ players, votes: msg.votes || {}, phase: msg.phase, endsAt: msg.endsAt || 0 });
      break;
    }
    case MSG.PLAYER_JOIN: {
      S.setState((s) => ({ players: { ...s.players, [msg.player.id]: msg.player } }));
      S.getState().pushFeed(`${msg.player.name} rolled in`);
      break;
    }
    case MSG.PLAYER_LEAVE: {
      net.remotes.delete(msg.id);
      S.setState((s) => {
        const players = { ...s.players };
        delete players[msg.id];
        return { players };
      });
      break;
    }
    case MSG.START: {
      const players = {};
      for (const p of msg.players) players[p.id] = p;
      net.spawnIndex = msg.spawns?.[net.myId] ?? 0;
      net.teams = msg.teams || {};
      net.remotes.clear();
      net.puddles = [];
      net.rockets = [];
      net.ball = null;
      S.setState({
        phase: PHASE.COUNTDOWN, modeId: msg.mode, endsAt: msg.endsAt,
        countdownEnd: Date.now() + msg.countdown * 1000,
        players, scores: {}, teamScores: [0, 0], podium: null, powerup: null,
        raceProgress: {}, myBeans: 0, event: null,
        itId: null, sumoRound: 0, sumoOutLeft: null, sumoDead: false,
        spectating: false, spectateTarget: null, lcs: null, rivalry: null, nemesis: null,
        mutator: msg.mutator || null, cup: msg.cup || null,
        abilityReadyAt: 0, printerFlashUntil: 0,
      });
      emit('match_start', msg);
      break;
    }
    case MSG.SNAPSHOT: {
      const localT = performance.now();
      const offset = msg.time - localT;
      net.clockOffset = net.clockOffset === 0 ? offset : net.clockOffset * 0.95 + offset * 0.05;
      for (const [id, s] of Object.entries(msg.players)) {
        if (id === net.myId) {
          net.flags.set(id, s.f);
          if (useStore.getState().myBeans !== s.c) useStore.setState({ myBeans: s.c });
          continue;
        }
        if (!net.remotes.has(id)) net.remotes.set(id, []);
        const buf = net.remotes.get(id);
        buf.push({ t: msg.time, p: s.p, q: s.q, f: s.f, c: s.c });
        if (buf.length > 30) buf.shift();
        net.flags.set(id, s.f);
      }
      net.puddles = msg.puddles || [];
      net.rockets = msg.rockets || [];
      net.robot = msg.robot || null;
      net.zone = msg.zone || null;
      net.it = msg.it || null;
      net.sumo = msg.sumo || null;
      if (msg.ball) { net.ballPrev = net.ball; net.ball = { t: msg.time, ...msg.ball }; }
      if (msg.beans) net.beans = msg.beans;
      if (msg.battery) net.battery = msg.battery;
      if (msg.race) {
        // Same treatment as lcs/teamScores below: a fresh object every
        // snapshot would re-render the whole HUD at 20 Hz for a number that
        // changes a handful of times a lap.
        const cur = S.getState().raceProgress;
        const ids = Object.keys(msg.race);
        if (ids.length !== Object.keys(cur).length
          || ids.some((id) => !cur[id] || cur[id][0] !== msg.race[id][0] || cur[id][1] !== msg.race[id][1])) {
          S.setState({ raceProgress: msg.race });
        }
      }
      if (msg.lcs) {
        // re-render only when the lockdown state actually changes
        const cur = S.getState().lcs;
        if (!cur || cur.alive !== msg.lcs.alive
          || (cur.locked?.length || 0) !== (msg.lcs.locked?.length || 0)
          || cur.warn?.room !== msg.lcs.warn?.room) {
          S.setState({ lcs: msg.lcs });
        }
      }
      if (msg.teamScores) {
        const cur = S.getState().teamScores;
        if (cur[0] !== msg.teamScores[0] || cur[1] !== msg.teamScores[1]) S.setState({ teamScores: msg.teamScores });
      }
      // Coarse HUD state — written only on change so React isn't re-rendered
      // at snapshot rate.
      {
        const st = S.getState();
        const itId = msg.it || null;
        if (st.itId !== itId) S.setState({ itId });
        const myF = msg.players[net.myId]?.f || 0;
        const dead = !!(myF & 128);
        if (st.sumoDead !== dead) S.setState({ sumoDead: dead });
        const round = msg.sumo?.round || 0;
        if (st.sumoRound !== round) S.setState({ sumoRound: round });
        const mine = msg.sumo?.out?.find((o) => o[0] === net.myId);
        const outLeft = mine ? mine[1] / 10 : null;
        if (st.sumoOutLeft !== outLeft) S.setState({ sumoOutLeft: outLeft });
      }
      break;
    }
    case MSG.RESPAWN_AT:
      emit('respawn_at', msg);
      break;
    case MSG.PICKUP:
      S.setState({ powerup: msg.powerup });
      emit('pickup', msg);
      break;
    case MSG.EFFECT:
      if (msg.type === 'pad_taken') net.padCooldowns.set(msg.pad, msg.until);
      if (msg.type === 'eliminated' && msg.id === net.myId) S.setState({ spectating: true });
      if (msg.type === 'ability' && msg.id === net.myId) S.setState({ abilityReadyAt: msg.readyAt || 0 });
      if (msg.type === 'printer' && msg.targets?.includes(net.myId)) {
        S.setState({ printerFlashUntil: Date.now() + (msg.blindMs || 1400) });
      }
      emit('fx', msg);
      break;
    case MSG.OFFICE_EVENT:
      if (msg.warn) {
        // 3s heads-up before the event actually starts
        S.setState({ eventWarn: msg });
        S.getState().pushFeed(`Incoming: ${msg.name}`);
        setTimeout(() => {
          const w = S.getState().eventWarn;
          if (w && w.id === msg.id) S.setState({ eventWarn: null });
        }, (msg.startsIn || 3) * 1000 + 500);
        break;
      }
      S.setState({ event: { ...msg, until: Date.now() + msg.duration * 1000 }, eventWarn: null });
      S.getState().pushFeed(`${msg.icon} ${msg.name} — ${msg.desc}`);
      emit('office_event', msg);
      setTimeout(() => {
        const ev = S.getState().event;
        if (ev && ev.id === msg.id) S.setState({ event: null });
      }, msg.duration * 1000);
      break;
    case MSG.FEED:
      S.getState().pushFeed(msg.text);
      break;
    case MSG.SCORE:
      S.setState({ scores: msg.scores });
      break;
    case MSG.MATCH_END: {
      S.setState({
        phase: PHASE.PODIUM, podium: msg.podium,
        rivalry: msg.rivalries?.[net.myId] || null, nemesis: msg.nemesis || null,
        cup: msg.cup || null,
      });
      const gained = msg.xp?.[net.myId] || 0;
      if (gained) S.getState().addXp(gained);
      emit('match_end', msg);
      break;
    }
    case MSG.ERROR:
      S.setState({ connectError: msg.reason });
      break;
  }
}

// ---------------------------------------------------- interpolation helper
// Returns { p, q, f } for a remote id at render time, or null.
const tmp = { p: [0, 0, 0], q: [0, 0, 0, 1] };
export function sampleRemote(id) {
  const buf = net.remotes.get(id);
  if (!buf || buf.length === 0) return null;
  const renderT = performance.now() + net.clockOffset - INTERP_DELAY_MS;
  if (buf.length === 1 || renderT <= buf[0].t) {
    const s = buf[0];
    return { p: s.p, q: s.q, f: s.f, c: s.c };
  }
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i].t <= renderT) {
      const a = buf[i];
      const b = buf[i + 1];
      if (!b) return { p: a.p, q: a.q, f: a.f, c: a.c };
      const t = Math.min(1.5, (renderT - a.t) / Math.max(1, b.t - a.t));
      for (let k = 0; k < 3; k++) tmp.p[k] = a.p[k] + (b.p[k] - a.p[k]) * t;
      // nlerp is fine for small rotation deltas
      let dot = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3];
      const sgn = dot < 0 ? -1 : 1;
      let len = 0;
      for (let k = 0; k < 4; k++) { tmp.q[k] = a.q[k] + (b.q[k] * sgn - a.q[k]) * t; len += tmp.q[k] * tmp.q[k]; }
      len = Math.sqrt(len) || 1;
      for (let k = 0; k < 4; k++) tmp.q[k] /= len;
      return { p: tmp.p, q: tmp.q, f: b.f, c: b.c };
    }
  }
  const s = buf[buf.length - 1];
  return { p: s.p, q: s.q, f: s.f, c: s.c };
}

// Finite-difference velocity of a remote car from its two newest snapshots.
// Used to classify local contacts as rub vs hit without waiting for the server.
const vtmp = [0, 0, 0];
export function remoteVelocity(id) {
  const buf = net.remotes.get(id);
  if (!buf || buf.length < 2) return null;
  const a = buf[buf.length - 2], b = buf[buf.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0) return null;
  for (let k = 0; k < 3; k++) vtmp[k] = (b.p[k] - a.p[k]) / dt;
  return vtmp;
}
