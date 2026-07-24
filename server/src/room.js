// The one office. Lobby → countdown → match → podium, on a 20 Hz tick.
// The server is authoritative for: match flow, scoring, powerups, office
// events, the soccer ball, bots, and hit validation. Clients own their own
// car physics and report transforms, which we sanity-check for teleports.
import {
  TICK_RATE, MAX_PLAYERS, COUNTDOWN_SECONDS, MATCH_SECONDS, PODIUM_SECONDS,
  OFFICE_EVENT_INTERVAL, BOTS_FILL_TO, MAX_PLAUSIBLE_SPEED, BUMP_RADIUS,
  MSG, PHASE, MODE_IDS, MODES, OFFICE_EVENTS, CAR_IDS, CARS,
  POWERUP_IDS, POWERUPS, POWERUP_EFFECT as FX,
  SPAWNS, POWERUP_PADS, ROBOT_PATH, M,
} from '@rc/shared';
import { createMode } from './modes.js';
import { Bots } from './bots.js';

const now = () => Date.now();
const MATCH_LEN = Number(process.env.RC_MATCH_SECONDS || MATCH_SECONDS);
const dist2d = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]);
const r2 = (n) => Math.round(n * 100) / 100;

let nextId = 1;

export class Room {
  constructor() {
    this.players = new Map(); // id → player
    this.phase = PHASE.LOBBY;
    this.mode = null; // active mode controller
    this.modeId = null;
    this.votes = new Map();
    this.endsAt = 0;
    this.phaseUntil = 0;
    this.puddles = []; // { id, kind, x, z, until }
    this.rockets = []; // { id, owner, target, p:[x,y,z] }
    this.pads = POWERUP_PADS.map((pad, i) => ({ ...pad, i, readyAt: 0 }));
    this.event = null; // { id, until }
    this.nextEventAt = 0;
    this.robot = null; // { x, z, wp } cleaning robot when active
    this.bots = new Bots(this);
    this.fxId = 1;
    this.lastBump = new Map(); // "a|b" → t
    setInterval(() => this.tick(1 / TICK_RATE), 1000 / TICK_RATE);
  }

  // ------------------------------------------------------------- connections
  addConnection(ws) {
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      try { this.onMessage(ws, msg); } catch (e) { console.error('msg error', e); }
    });
    ws.on('close', () => this.removePlayer(ws.playerId));
    ws.on('error', () => this.removePlayer(ws.playerId));
  }

  onMessage(ws, msg) {
    const player = ws.playerId ? this.players.get(ws.playerId) : null;
    switch (msg.t) {
      case MSG.HELLO: {
        if (player) return;
        if ([...this.players.values()].filter((p) => !p.bot).length >= MAX_PLAYERS) {
          ws.send(JSON.stringify({ t: MSG.ERROR, reason: 'Room is full (12 players)' }));
          return;
        }
        const id = `p${nextId++}`;
        ws.playerId = id;
        const p = this.makePlayer(id, ws, msg);
        this.players.set(id, p);
        ws.send(JSON.stringify({
          t: MSG.WELCOME, id, phase: this.phase,
          mode: this.modeId, endsAt: this.endsAt,
          players: this.publicPlayers(),
        }));
        this.broadcast({ t: MSG.PLAYER_JOIN, player: this.publicPlayer(p) }, id);
        this.sendLobby();
        // Drop-in: joining mid-match spawns you straight into the game.
        if (this.phase === PHASE.PLAYING && this.mode) this.mode.onJoin?.(p);
        break;
      }
      case MSG.READY:
        if (!player) return;
        player.ready = !!msg.ready;
        this.sendLobby();
        this.maybeStart();
        break;
      case MSG.VOTE_MODE:
        if (!player || !MODE_IDS.includes(msg.mode)) return;
        this.votes.set(player.id, msg.mode);
        this.sendLobby();
        break;
      case MSG.STATE: {
        if (!player || !Array.isArray(msg.p)) return;
        // clamp dt so long silences don't legitimise huge jumps
        const dt = Math.min(0.6, Math.max(0.02, (now() - player.lastStateAt) / 1000));
        const dx = msg.p[0] - player.p[0], dz = msg.p[2] - player.p[2];
        const speed = Math.hypot(dx, dz) / dt;
        // Anti-teleport: ignore impossible jumps (unless we just swapped/respawned
        // them). A sustained stream of consistent "impossible" reports means we
        // missed a legit teleport — accept after a few strikes so nobody gets
        // permanently stuck at a stale position.
        if (speed > MAX_PLAUSIBLE_SPEED * 2 && now() > player.allowTeleportUntil) {
          player.rejects = (player.rejects || 0) + 1;
          if (player.rejects <= 8) return;
        }
        player.rejects = 0;
        player.p = msg.p.map(Number);
        if (Array.isArray(msg.q)) player.q = msg.q.map(Number);
        if (Array.isArray(msg.v)) player.v = msg.v.map(Number);
        player.drifting = !!msg.d;
        player.grounded = !!msg.g;
        player.lastStateAt = now();
        break;
      }
      case MSG.USE_POWERUP:
        if (player && this.phase === PHASE.PLAYING) this.usePowerup(player);
        break;
      case MSG.RESPAWN:
        // client announces a self-respawn (fell off / R key) → sanction the jump
        if (player && now() > (player.lastRespawnMsg || 0) + 1500) {
          player.lastRespawnMsg = now();
          player.allowTeleportUntil = now() + 1500;
          this.mode?.onFall?.(player);
        }
        break;
      case MSG.BUMP: {
        if (!player || this.phase !== PHASE.PLAYING) return;
        const target = this.players.get(msg.target);
        if (!target || target.id === player.id) return;
        if (dist2d(player, target) > BUMP_RADIUS * 2.5) return; // validate
        const key = [player.id, target.id].sort().join('|');
        if (now() - (this.lastBump.get(key) || 0) < 900) return;
        this.lastBump.set(key, now());
        this.onBump(player, target);
        break;
      }
    }
  }

  makePlayer(id, ws, msg = {}) {
    const spawn = SPAWNS[this.players.size % SPAWNS.length];
    return {
      id, ws, bot: false,
      name: String(msg.name || 'Intern').slice(0, 16) || 'Intern',
      car: CAR_IDS.includes(msg.car) ? msg.car : 'balanced',
      paint: typeof msg.paint === 'string' ? msg.paint.slice(0, 9) : null,
      ready: false,
      p: [spawn.x, 1, spawn.z], q: [0, 0, 0, 1], v: [0, 0, 0],
      drifting: false, grounded: true,
      lastStateAt: now(), allowTeleportUntil: 0,
      score: 0, lap: 0, nextCp: 0, beans: 0, hasBattery: false, team: 0,
      powerup: null, shieldUntil: 0, stunUntil: 0, shrinkUntil: 0,
    };
  }

  removePlayer(id) {
    if (!id) return;
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.votes.delete(id);
    this.mode?.onLeave?.(p);
    this.broadcast({ t: MSG.PLAYER_LEAVE, id });
    this.sendLobby();
    if (![...this.players.values()].some((pl) => !pl.bot)) this.resetToLobby(true);
  }

  // ---------------------------------------------------------------- flow
  maybeStart() {
    if (this.phase !== PHASE.LOBBY) return;
    const humans = [...this.players.values()].filter((p) => !p.bot);
    if (humans.length === 0 || !humans.every((p) => p.ready)) return;
    this.startCountdown();
  }

  startCountdown() {
    this.phase = PHASE.COUNTDOWN;
    this.phaseUntil = now() + COUNTDOWN_SECONDS * 1000;
    // Pick the mode: most-voted, random tiebreak
    const tally = {};
    for (const m of this.votes.values()) tally[m] = (tally[m] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    this.modeId = top.length ? top[0][0] : MODE_IDS[Math.floor(Math.random() * MODE_IDS.length)];
    // Fill with bots
    this.bots.fillTo(BOTS_FILL_TO);
    // Reset per-match state
    let i = 0;
    for (const p of this.players.values()) {
      Object.assign(p, {
        score: 0, lap: 0, nextCp: 0, beans: 0, hasBattery: false,
        powerup: null, shieldUntil: 0, stunUntil: 0, shrinkUntil: 0,
        spawnIndex: i++, finished: false, rejects: 0,
        // everyone teleports to the spawn grid client-side — sanction it
        allowTeleportUntil: now() + (COUNTDOWN_SECONDS + 2) * 1000,
      });
    }
    this.mode = createMode(this.modeId, this);
    this.endsAt = now() + (COUNTDOWN_SECONDS + MATCH_LEN) * 1000;
    this.puddles = [];
    this.rockets = [];
    this.event = null;
    this.pendingEvent = null;
    this.robot = null;
    this.nextEventAt = now() + (COUNTDOWN_SECONDS + OFFICE_EVENT_INTERVAL) * 1000;
    this.broadcast({
      t: MSG.START, mode: this.modeId, endsAt: this.endsAt,
      countdown: COUNTDOWN_SECONDS,
      players: this.publicPlayers(),
      spawns: Object.fromEntries([...this.players.values()].map((p) => [p.id, p.spawnIndex])),
      teams: Object.fromEntries([...this.players.values()].map((p) => [p.id, p.team])),
    });
  }

  endMatch() {
    this.phase = PHASE.PODIUM;
    this.phaseUntil = now() + PODIUM_SECONDS * 1000;
    const standings = [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ id: p.id, name: p.name, car: p.car, paint: p.paint, score: Math.round(p.score), place: i + 1, bot: p.bot }));
    const xp = {};
    standings.forEach((s, i) => { xp[s.id] = Math.max(10, Math.round(s.score / 10) + (3 - Math.min(i, 3)) * 15); });
    this.broadcast({ t: MSG.MATCH_END, podium: standings, xp });
    this.mode = null;
  }

  resetToLobby(silent = false) {
    this.phase = PHASE.LOBBY;
    this.mode = null;
    this.modeId = null;
    this.votes.clear();
    this.event = null;
    this.pendingEvent = null;
    this.robot = null;
    this.bots.clear();
    for (const p of this.players.values()) p.ready = false;
    if (!silent) this.sendLobby();
  }

  // ---------------------------------------------------------------- tick
  tick(dt) {
    const t = now();
    if (this.phase === PHASE.COUNTDOWN && t >= this.phaseUntil) {
      this.phase = PHASE.PLAYING;
      this.sendLobby();
    }
    if (this.phase === PHASE.PODIUM && t >= this.phaseUntil) this.resetToLobby();
    if (this.phase !== PHASE.PLAYING) {
      if (this.players.size) this.broadcastSnapshot(t);
      return;
    }

    // Match timer
    if (t >= this.endsAt) { this.endMatch(); return; }

    this.bots.update(dt);
    this.mode?.update(dt);
    this.updatePads(t);
    this.updateRockets(dt, t);
    this.updateEvents(t, dt);
    this.puddles = this.puddles.filter((pu) => pu.until > t);

    // Slow puddle / oil effects are client-side; battery drop on fall is here:
    for (const p of this.players.values()) {
      if (p.p[1] < -10 && (p.hasBattery || p.beans > 0)) this.mode?.onFall?.(p);
    }

    this.broadcastSnapshot(t);
  }

  updatePads(t) {
    for (const pad of this.pads) {
      if (t < pad.readyAt) continue;
      for (const p of this.players.values()) {
        if (p.powerup || p.bot && Math.random() < 0.5) continue;
        if (Math.hypot(p.p[0] - pad.x, p.p[2] - pad.z) < 1.6) {
          pad.readyAt = t + FX.PAD_COOLDOWN_S * 1000;
          p.powerup = this.rollPowerup(p);
          if (!p.bot) this.sendTo(p, { t: MSG.PICKUP, powerup: p.powerup, pad: pad.i });
          else p.botUseAt = t + 1500 + Math.random() * 4000;
          this.broadcast({ t: MSG.EFFECT, type: 'pad_taken', pad: pad.i, until: pad.readyAt });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------- powerups
  // Item odds depend on standing (Mario Kart style): the leader draws from a
  // weak-but-defensive pool, the back of the pack draws catch-up tools, and
  // everyone in between gets a linear blend. Only one rocket flies at a time.
  rollPowerup(player) {
    const order = [...this.players.values()].sort((a, b) => b.score - a.score);
    const frac = order.length > 1 ? order.indexOf(player) / (order.length - 1) : 0.5;
    const FRONT = { turbo: 0.6, emp: 0.8, rocket: 0.2, oil: 2.4, coffee: 2.0, shield: 3.0, shrink: 0.1, spring: 1.0, swap: 0.05, fake: 1.6 };
    const BACK = { turbo: 3.0, emp: 1.6, rocket: 2.6, oil: 0.4, coffee: 0.4, shield: 0.7, shrink: 1.6, spring: 1.0, swap: 1.4, fake: 0.15 };
    let total = 0;
    const weights = POWERUP_IDS.map((id) => {
      if (id === 'rocket' && this.rockets.length > 0) return 0;
      const f = FRONT[id] ?? 1, b = BACK[id] ?? 1;
      const v = f + (b - f) * frac;
      total += v;
      return v;
    });
    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0 && weights[i] > 0) return POWERUP_IDS[i];
    }
    return 'turbo';
  }

  usePowerup(player) {
    const pw = player.powerup;
    if (!pw) return;
    player.powerup = null;
    const t = now();
    const others = [...this.players.values()].filter((p) => p.id !== player.id);
    switch (pw) {
      case 'turbo':
        this.broadcast({ t: MSG.EFFECT, type: 'turbo', id: player.id });
        break;
      case 'spring':
        this.broadcast({ t: MSG.EFFECT, type: 'spring', id: player.id, impulse: FX.SPRING_IMPULSE });
        break;
      case 'shield':
        player.shieldUntil = t + FX.SHIELD_S * 1000;
        this.broadcast({ t: MSG.EFFECT, type: 'shield', id: player.id, until: player.shieldUntil });
        break;
      case 'emp': {
        const targets = others.filter((p) => dist2d(p, player) < FX.EMP_RADIUS && p.shieldUntil < t);
        for (const v of targets) { v.stunUntil = t + FX.EMP_STUN_S * 1000; this.mode?.onHit?.(player, v); }
        this.broadcast({
          t: MSG.EFFECT, type: 'emp', id: player.id, at: player.p,
          targets: targets.map((p) => p.id), stunMs: FX.EMP_STUN_S * 1000,
        });
        if (targets.length) this.feed(`⚡ ${player.name} EMP'd ${targets.length} car${targets.length > 1 ? 's' : ''}`);
        break;
      }
      case 'rocket': {
        const target = this.mode?.rocketTarget?.(player) || this.nearest(player, others);
        if (!target) break;
        this.rockets.push({ id: this.fxId++, owner: player.id, target: target.id, p: [...player.p] });
        this.broadcast({ t: MSG.EFFECT, type: 'rocket', id: player.id, target: target.id });
        break;
      }
      case 'oil':
      case 'coffee': {
        const pu = { id: this.fxId++, kind: pw, x: r2(player.p[0]), z: r2(player.p[2]), until: t + FX.PUDDLE_LIFETIME_S * 1000 };
        this.puddles.push(pu);
        this.broadcast({ t: MSG.EFFECT, type: 'puddle', puddle: pu });
        break;
      }
      case 'shrink': {
        const leader = [...this.players.values()].filter((p) => p.id !== player.id)
          .sort((a, b) => b.score - a.score)[0];
        if (!leader) break;
        leader.shrinkUntil = t + FX.SHRINK_S * 1000;
        this.broadcast({ t: MSG.EFFECT, type: 'shrink', target: leader.id, until: leader.shrinkUntil, scale: FX.SHRINK_SCALE });
        this.feed(`🔬 ${player.name} shrunk ${leader.name}!`);
        break;
      }
      case 'swap': {
        const other = others[Math.floor(Math.random() * others.length)];
        if (!other) break;
        const pa = [...player.p], pb = [...other.p];
        player.p = pb; other.p = pa;
        player.allowTeleportUntil = other.allowTeleportUntil = t + 1500;
        this.broadcast({ t: MSG.EFFECT, type: 'swap', a: player.id, b: other.id, pa: pb, pb: pa });
        this.feed(`🔀 ${player.name} swapped with ${other.name}`);
        break;
      }
      case 'fake':
        this.broadcast({ t: MSG.EFFECT, type: 'fake', id: player.id });
        break;
    }
  }

  updateRockets(dt, t) {
    for (const r of this.rockets) {
      const target = this.players.get(r.target);
      if (!target) { r.dead = true; continue; }
      const dir = [target.p[0] - r.p[0], target.p[1] + 0.4 - r.p[1], target.p[2] - r.p[2]];
      const len = Math.hypot(...dir) || 1;
      if (len < 1.0) {
        r.dead = true;
        if (target.shieldUntil > t) {
          target.shieldUntil = 0;
          this.broadcast({ t: MSG.EFFECT, type: 'shield_pop', id: target.id });
        } else {
          target.stunUntil = t + FX.ROCKET_STUN_S * 1000;
          if (target.bot && target.kick) {
            const a = Math.random() * Math.PI * 2;
            target.kick.x += Math.cos(a) * 14;
            target.kick.z += Math.sin(a) * 14;
          }
          const owner = this.players.get(r.owner);
          if (owner) this.mode?.onHit?.(owner, target);
          this.broadcast({ t: MSG.EFFECT, type: 'rocket_hit', target: target.id, at: target.p, stunMs: FX.ROCKET_STUN_S * 1000 });
          this.feed(`🧨 ${this.players.get(r.owner)?.name || '???'} rocketed ${target.name}`);
        }
        continue;
      }
      const s = (FX.ROCKET_SPEED * dt) / len;
      r.p[0] += dir[0] * s; r.p[1] += dir[1] * s; r.p[2] += dir[2] * s;
    }
    this.rockets = this.rockets.filter((r) => !r.dead);
  }

  onBump(a, b) {
    const t = now();
    const rel = Math.hypot(a.v[0] - b.v[0], a.v[2] - b.v[2]);
    if (b.shieldUntil > t || a.shieldUntil > t) {
      this.broadcast({ t: MSG.EFFECT, type: 'shield_pop', id: b.shieldUntil > t ? b.id : a.id });
      if (b.shieldUntil > t) b.shieldUntil = 0; else a.shieldUntil = 0;
      return;
    }
    this.mode?.onHit?.(a, b, rel);
    // Bots have no client-side physics, so the server shoves them: knockback
    // away from the bumper, scaled by relative speed and mass ratio.
    const shove = (victim, attacker) => {
      if (!victim.bot || !victim.kick) return;
      const mR = ((CARS[attacker.car]?.mass) || 1) / ((CARS[victim.car]?.mass) || 1);
      const dx = victim.p[0] - attacker.p[0], dz = victim.p[2] - attacker.p[2];
      const len = Math.hypot(dx, dz) || 1;
      const mag = Math.min(20, 5 + rel * 0.6) * Math.min(1.8, Math.max(0.55, mR));
      victim.kick.x += (dx / len) * mag;
      victim.kick.z += (dz / len) * mag;
    };
    shove(a, b); shove(b, a);
    // pa/pb let clients compute mass-scaled knockback direction
    this.broadcast({ t: MSG.EFFECT, type: 'bump', a: a.id, b: b.id, at: a.p, pa: a.p.map(r2), pb: b.p.map(r2) });
  }

  // ------------------------------------------------------- office events
  updateEvents(t, dt) {
    if (this.event && t > this.event.until) {
      this.event = null;
      this.robot = null;
    }
    // Events are telegraphed: a warning fires 3 s ahead so chaos is something
    // you play around, not something that just happens to you.
    if (!this.event && !this.pendingEvent && t >= this.nextEventAt - 3000) {
      const pool = OFFICE_EVENTS.filter((e) => e.id !== this.lastEventId);
      this.pendingEvent = pool[Math.floor(Math.random() * pool.length)];
      const ev = this.pendingEvent;
      this.broadcast({ t: MSG.OFFICE_EVENT, id: ev.id, duration: ev.duration, name: ev.name, icon: ev.icon, desc: ev.desc, warn: true, startsIn: 3 });
    }
    if (!this.event && this.pendingEvent && t >= this.nextEventAt) {
      const ev = this.pendingEvent;
      this.pendingEvent = null;
      this.lastEventId = ev.id;
      this.event = { id: ev.id, until: t + ev.duration * 1000 };
      this.nextEventAt = t + OFFICE_EVENT_INTERVAL * 1000;
      if (ev.id === 'cleaning_robot') this.robot = { x: ROBOT_PATH[0].x, z: ROBOT_PATH[0].z, wp: 1 };
      this.broadcast({ t: MSG.OFFICE_EVENT, id: ev.id, duration: ev.duration, name: ev.name, icon: ev.icon, desc: ev.desc });
    }
    if (this.robot) {
      const wp = ROBOT_PATH[this.robot.wp % ROBOT_PATH.length];
      const dx = wp.x - this.robot.x, dz = wp.z - this.robot.z;
      const len = Math.hypot(dx, dz);
      const speed = 3.2 * M * dt;
      if (len < 1) this.robot.wp++;
      else { this.robot.x += (dx / len) * speed; this.robot.z += (dz / len) * speed; }
      for (const p of this.players.values()) {
        if (p.stunUntil > t || p.shieldUntil > t) continue;
        if (Math.hypot(p.p[0] - this.robot.x, p.p[2] - this.robot.z) < 2.2) {
          p.stunUntil = t + 1500;
          this.mode?.onHit?.(null, p);
          this.broadcast({ t: MSG.EFFECT, type: 'robot_hit', target: p.id, at: [this.robot.x, 0, this.robot.z] });
          this.feed(`🤖 The cleaning robot got ${p.name}`);
        }
      }
    }
  }

  // ------------------------------------------------------------ helpers
  nearest(player, list) {
    let best = null, bd = Infinity;
    for (const p of list) { const d = dist2d(p, player); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  feed(text) { this.broadcast({ t: MSG.FEED, text }); }

  scoreChanged(detail) {
    this.broadcast({
      t: MSG.SCORE,
      scores: Object.fromEntries([...this.players.values()].map((p) => [p.id, Math.round(p.score)])),
      detail: detail || null,
    });
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, car: p.car, paint: p.paint, ready: p.ready, bot: p.bot, team: p.team };
  }
  publicPlayers() { return [...this.players.values()].map((p) => this.publicPlayer(p)); }

  sendLobby() {
    this.broadcast({
      t: MSG.LOBBY, phase: this.phase, players: this.publicPlayers(),
      votes: Object.fromEntries(this.votes), endsAt: this.endsAt,
    });
  }

  broadcastSnapshot(t) {
    const players = {};
    for (const p of this.players.values()) {
      players[p.id] = {
        p: p.p.map(r2), q: p.q.map((n) => Math.round(n * 1000) / 1000),
        f: (p.drifting ? 1 : 0) | (p.grounded ? 2 : 0) | (p.stunUntil > t ? 4 : 0) |
           (p.shieldUntil > t ? 8 : 0) | (p.shrinkUntil > t ? 16 : 0) |
           (p.hasBattery ? 32 : 0),
        c: p.beans,
      };
    }
    const snap = { t: MSG.SNAPSHOT, time: t, players, puddles: this.puddles };
    if (this.rockets.length) snap.rockets = this.rockets.map((r) => ({ id: r.id, p: r.p.map(r2) }));
    if (this.robot) snap.robot = { x: r2(this.robot.x), z: r2(this.robot.z) };
    if (this.mode?.snapshot) Object.assign(snap, this.mode.snapshot());
    this.broadcast(snap);
  }

  sendTo(player, obj) {
    if (player.bot || !player.ws || player.ws.readyState !== 1) return;
    player.ws.send(JSON.stringify(obj));
  }

  broadcast(obj, exceptId = null) {
    const data = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.bot || p.id === exceptId) continue;
      if (p.ws && p.ws.readyState === 1) p.ws.send(data);
    }
  }
}
