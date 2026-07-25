// The one office. Lobby → countdown → match → podium, on a 20 Hz tick.
// The server is authoritative for: match flow, scoring, powerups, office
// events, the soccer ball, bots, and hit validation. Clients own their own
// car physics and report transforms, which we sanity-check for teleports.
import {
  TICK_RATE, MAX_PLAYERS, COUNTDOWN_SECONDS, MATCH_SECONDS, PODIUM_SECONDS,
  OFFICE_EVENT_INTERVAL, BOTS_FILL_TO, MAX_PLAUSIBLE_SPEED, BUMP_RADIUS,
  BUMP_REL_SPEED, BUMP_RUB_COOLDOWN_MS, BUMP_HIT_COOLDOWN_MS,
  SPAWN_PROTECT_MS, RESPAWN_FREEZE_MS, NUDGE_MAX_SPEED,
  MSG, PHASE, MODE_IDS, MODES, OFFICE_EVENTS, CAR_IDS, CARS, sanitizeStyle, sanitizeTune, tunedStats,
  POWERUP_IDS, POWERUPS, POWERUP_EFFECT as FX,
  SPAWNS, POWERUP_PADS, ROBOT_PATH, MAP_BOUNDS, M, EMOTES, COSMETIC_IDS,
  PROPS, VENDING, PRINTER, ABILITIES, ABILITY_COOLDOWN_S, ABILITY_FX,
  MUTATORS, MUTATOR_CHANCE, CUP_POOL,
  encodeSnapshot,
} from '@rc/shared';
import { createMode } from './modes.js';
import { Bots } from './bots.js';

const now = () => Date.now();
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
    this.lastBump = new Map(); // "a|b" → t of last real hit
    this.lastRub = new Map(); // "a|b" → t of last cosmetic rub
    this.lastSpawnUse = {}; // spawn index → t, for the recently-used penalty
    this.bumpCounts = new Map(); // "a|b" → validated bumps this match (rivalries)
    this.cup = null; // { round, modes:[...], scores: Map } — Office Cup state
    this.mutator = null; // active MUTATORS entry for this round
    this.lastAbility = null; // most recent non-copycat ability (Company Car copies it)
    this.printerAt = 0;
    this.vendReadyAt = 0;
    this.mugAt = 0;
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
        // client asks to respawn (fell off / R key) → server picks the spot,
        // sanctions the teleport and grants freeze + spawn protection
        if (player && now() > (player.lastRespawnMsg || 0) + 1200) {
          player.lastRespawnMsg = now();
          if (player.p[1] < -6 && this.phase === PHASE.PLAYING) {
            const drama = ['took the express elevator', 'discovered gravity', 'is checking on the ground floor', 'left the building'];
            this.feed(`🕳️ ${player.name} ${drama[Math.floor(Math.random() * drama.length)]}`);
          }
          this.respawnPlayer(player, msg.safe);
        }
        break;
      case MSG.BUMP: {
        if (!player || this.phase !== PHASE.PLAYING) return;
        const target = this.players.get(msg.target);
        if (!target || target.id === player.id) return;
        if (player.eliminated || target.eliminated) return; // ghosts don't hit
        if (dist2d(player, target) > BUMP_RADIUS * 2.5) return; // validate
        // rub/hit classification and per-pair cooldowns live in onBump
        this.onBump(player, target);
        break;
      }
      case MSG.EMOTE: {
        if (!player) return;
        if (now() - (player.lastEmoteAt || 0) < 600) return; // no honk spam
        player.lastEmoteAt = now();
        if (msg.h) this.broadcast({ t: MSG.EFFECT, type: 'emote', id: player.id, horn: true });
        else {
          const i = msg.e | 0;
          if (i >= 0 && i < EMOTES.length) this.broadcast({ t: MSG.EFFECT, type: 'emote', id: player.id, e: i });
        }
        break;
      }
      case MSG.PROP: {
        // Shared physics chaos v1: relay "I whacked prop i this hard" to the
        // other clients, which apply the impulse to their local copy of the
        // prop. Rate-limited and magnitude-capped; positions self-heal
        // because props settle.
        if (!player || player.eliminated) return;
        const i = msg.i | 0;
        if (i < 0 || i >= PROPS.length) return;
        const t = now();
        if (t - (player.propWindowAt || 0) > 1000) { player.propWindowAt = t; player.propCount = 0; }
        if (++player.propCount > 10) return;
        const im = Array.isArray(msg.im) ? msg.im.slice(0, 3).map(Number) : null;
        if (!im || im.length < 3 || im.some((n) => !Number.isFinite(n))) return;
        const mag = Math.hypot(im[0], im[1], im[2]);
        if (mag < 0.5) return;
        if (mag > 60) { const s = 60 / mag; im[0] *= s; im[1] *= s; im[2] *= s; }
        this.broadcast({ t: MSG.EFFECT, type: 'prop', i, im: im.map(r2) }, player.id);
        break;
      }
      case MSG.ABILITY: {
        if (!player || this.phase !== PHASE.PLAYING || player.eliminated) return;
        const t = now();
        if (t < (player.abilityReadyAt || 0)) return;
        player.abilityReadyAt = t + ABILITY_COOLDOWN_S * 1000;
        // Company Car mirrors the last real ability used this match
        let carId = player.car;
        if (carId === 'balanced') carId = this.lastAbility || 'buggy';
        else this.lastAbility = carId;
        if (carId === 'monster') player.ramUntil = t + ABILITY_FX.RAM_S * 1000;
        this.broadcast({
          t: MSG.EFFECT, type: 'ability', id: player.id, car: carId,
          name: ABILITIES[carId]?.name, icon: ABILITIES[carId]?.icon, readyAt: player.abilityReadyAt,
        });
        break;
      }
    }
  }

  makePlayer(id, ws, msg = {}) {
    const spawn = SPAWNS[this.players.size % SPAWNS.length];
    // cosmetics: validated per slot so only known ids travel to other clients
    const cos = {};
    for (const slot of Object.keys(COSMETIC_IDS)) {
      if (COSMETIC_IDS[slot].includes(msg.cos?.[slot])) cos[slot] = msg.cos[slot];
    }
    return {
      id, ws, bot: false,
      name: String(msg.name || 'Intern').slice(0, 16) || 'Intern',
      car: CAR_IDS.includes(msg.car) ? msg.car : 'balanced',
      paint: typeof msg.paint === 'string' ? msg.paint.slice(0, 9) : null,
      cos,
      style: sanitizeStyle(msg.style),
      tune: sanitizeTune(msg.tune),
      ready: false,
      p: [spawn.x, 1, spawn.z], q: [0, 0, 0, 1], v: [0, 0, 0],
      drifting: false, grounded: true,
      lastStateAt: now(), allowTeleportUntil: 0,
      score: 0, lap: 0, nextCp: 0, beans: 0, hasBattery: false, team: 0,
      powerup: null, shieldUntil: 0, stunUntil: 0, shrinkUntil: 0,
      spawnProtectUntil: 0, sumoDead: false,
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

  startCountdown(forceMode = null) {
    this.phase = PHASE.COUNTDOWN;
    this.phaseUntil = now() + COUNTDOWN_SECONDS * 1000;
    if (forceMode) {
      this.modeId = forceMode; // next Office Cup round
    } else {
      // Pick the mode: most-voted, random tiebreak
      const tally = {};
      for (const m of this.votes.values()) tally[m] = (tally[m] || 0) + 1;
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      this.modeId = top.length ? top[0][0] : CUP_POOL[Math.floor(Math.random() * CUP_POOL.length)];
      this.cup = null;
      // Office Cup: three random distinct modes back-to-back
      if (this.modeId === 'office_cup') {
        const pool = [...CUP_POOL];
        const modes = [];
        for (let k = 0; k < MODES.office_cup.rounds; k++) {
          modes.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        this.cup = { round: 0, modes, scores: new Map() };
        this.modeId = modes[0];
      }
    }
    if (this.cup) this.feed(`🏆 Office Cup — round ${this.cup.round + 1}/${MODES.office_cup.rounds}: ${MODES[this.modeId].icon} ${MODES[this.modeId].name}!`);
    // Mutator roll: an occasional twist on the round, announced up front
    this.mutator = null;
    if (Math.random() < MUTATOR_CHANCE) {
      const pool = Object.values(MUTATORS).filter((m) => (!m.soccerOnly || this.modeId === 'soccer') && !(this.modeId === 'free_roam' && m.id === 'tiny_cars'));
      this.mutator = pool[Math.floor(Math.random() * pool.length)] || null;
      if (this.mutator) this.feed(`${this.mutator.icon} MUTATOR: ${this.mutator.name} — ${this.mutator.desc}`);
    }
    // Fill with bots
    this.bots.fillTo(BOTS_FILL_TO);
    // Reset per-match state
    let i = 0;
    for (const p of this.players.values()) {
      Object.assign(p, {
        score: 0, lap: 0, nextCp: 0, beans: 0, hasBattery: false,
        powerup: null, shieldUntil: 0, stunUntil: 0, shrinkUntil: 0,
        spawnProtectUntil: 0, sumoDead: false,
        spawnIndex: i++, finished: false, rejects: 0, eliminated: false, zapT: 0,
        abilityReadyAt: 0, ramUntil: 0,
        // everyone teleports to the spawn grid client-side — sanction it
        allowTeleportUntil: now() + (COUNTDOWN_SECONDS + 2) * 1000,
      });
    }
    this.mode = createMode(this.modeId, this);
    // per-mode length (Open Office runs long); env override wins for testing
    const len = Number(process.env.RC_MATCH_SECONDS) || MODES[this.modeId]?.seconds || MATCH_SECONDS;
    this.endsAt = now() + (COUNTDOWN_SECONDS + len) * 1000;
    if (this.mutator?.id === 'tiny_cars') {
      for (const p of this.players.values()) p.shrinkUntil = this.endsAt;
    }
    this.lastAbility = null;
    this.printerAt = now() + (COUNTDOWN_SECONDS + PRINTER.minIntervalS) * 1000;
    this.vendReadyAt = 0;
    this.mugAt = now() + (COUNTDOWN_SECONDS + 6) * 1000;
    this.puddles = [];
    this.rockets = [];
    this.bumpCounts.clear();
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
      mutator: this.mutator?.id || null,
      cup: this.cup ? { round: this.cup.round + 1, total: MODES.office_cup.rounds } : null,
    });
  }

  endMatch() {
    this.phase = PHASE.PODIUM;
    // Cup intermissions are brisk; the grand ceremony gets the full podium
    const cupFinal = this.cup ? this.cup.round >= MODES.office_cup.rounds - 1 : false;
    this.phaseUntil = now() + (this.cup && !cupFinal ? 7 : PODIUM_SECONDS) * 1000;
    if (this.cup) {
      for (const p of this.players.values()) {
        this.cup.scores.set(p.id, (this.cup.scores.get(p.id) || 0) + Math.round(p.score));
      }
    }
    const cupStandings = this.cup
      ? [...this.players.values()]
        .map((p) => ({ id: p.id, name: p.name, score: this.cup.scores.get(p.id) || 0, bot: p.bot }))
        .sort((a, b) => b.score - a.score)
      : null;
    if (cupFinal && cupStandings?.length) {
      this.feed(`🏆 ${cupStandings[0].name} wins the OFFICE CUP with ${cupStandings[0].score} points!`);
    }
    const standings = [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ id: p.id, name: p.name, car: p.car, paint: p.paint, score: Math.round(p.score), place: i + 1, bot: p.bot }));
    const xp = {};
    standings.forEach((s, i) => { xp[s.id] = Math.max(10, Math.round(s.score / 10) + (3 - Math.min(i, 3)) * 15); });
    // Rivalries: per-player most-bumped partner, plus the match's top feud.
    const rivalry = {};
    let top = null;
    for (const [key, n] of this.bumpCounts) {
      const [a, b] = key.split('|');
      if (!top || n > top.n) top = { a, b, n };
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!rivalry[x] || n > rivalry[x].n) rivalry[x] = { with: y, n };
      }
    }
    const rivalries = Object.fromEntries(Object.entries(rivalry).map(([id, r]) => (
      [id, { name: this.players.get(r.with)?.name || '???', n: r.n }]
    )));
    const nemesis = top && top.n >= 3
      ? { a: this.players.get(top.a)?.name || '???', b: this.players.get(top.b)?.name || '???', n: top.n }
      : null;
    this.broadcast({
      t: MSG.MATCH_END, podium: standings, xp, rivalries, nemesis,
      cup: cupStandings ? { round: this.cup.round + 1, total: MODES.office_cup.rounds, standings: cupStandings, final: cupFinal } : null,
    });
    this.mode = null;
  }

  resetToLobby(silent = false) {
    this.phase = PHASE.LOBBY;
    this.mode = null;
    this.modeId = null;
    this.cup = null;
    this.mutator = null;
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
    if (this.phase === PHASE.PODIUM && t >= this.phaseUntil) {
      // Office Cup rolls straight into the next round — no re-readying
      if (this.cup && this.cup.round < MODES.office_cup.rounds - 1) {
        this.cup.round++;
        this.startCountdown(this.cup.modes[this.cup.round]);
      } else {
        this.cup = null;
        this.resetToLobby();
      }
    }
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
    this.updateMachines(t);
    this.puddles = this.puddles.filter((pu) => pu.until > t);

    // Slow puddle / oil effects are client-side; falls that matter (dropped
    // battery, spilled beans, Last Car Standing eliminations) resolve here
    // without waiting for the client's respawn message:
    for (const p of this.players.values()) {
      if (p.p[1] < -10 && (p.hasBattery || p.beans > 0 || this.modeId === 'last_standing')) this.mode?.onFall?.(p);
    }

    this.broadcastSnapshot(t);
  }

  updatePads(t) {
    for (const pad of this.pads) {
      if (t < pad.readyAt) continue;
      for (const p of this.players.values()) {
        if (p.eliminated || p.powerup || p.bot && Math.random() < 0.5) continue;
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
    if (!pw || player.eliminated) return; // ghosts don't meddle (yet)
    player.powerup = null;
    const t = now();
    // attacking forfeits spawn protection
    player.spawnProtectUntil = 0;
    const others = [...this.players.values()].filter((p) => p.id !== player.id && !p.eliminated);
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
        const targets = others.filter((p) => dist2d(p, player) < FX.EMP_RADIUS && p.shieldUntil < t && p.spawnProtectUntil < t);
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
        const leader = [...this.players.values()].filter((p) => p.id !== player.id && !p.eliminated)
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
        if (target.spawnProtectUntil > t) {
          // fizzle on a freshly-spawned car: no stun, no score
          this.broadcast({ t: MSG.EFFECT, type: 'rocket_hit', target: target.id, at: target.p, blocked: true });
        } else if (target.shieldUntil > t) {
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
    // Spawn protection: a protected car can't be hit; a protected car that
    // rams someone forfeits the protection and the contact proceeds.
    if (b.spawnProtectUntil > t) return;
    if (a.spawnProtectUntil > t) a.spawnProtectUntil = 0;
    const rel = Math.hypot(a.v[0] - b.v[0], a.v[2] - b.v[2]);
    // Rub vs hit: below BUMP_REL_SPEED contact is cosmetic — cheap cooldown,
    // no knockback, no mode effects — so cornering traffic can't eat the
    // budget for real hits.
    const isHit = rel >= BUMP_REL_SPEED;
    const key = [a.id, b.id].sort().join('|');
    const cdMap = isHit ? this.lastBump : this.lastRub;
    if (t - (cdMap.get(key) || 0) < (isHit ? BUMP_HIT_COOLDOWN_MS : BUMP_RUB_COOLDOWN_MS)) return;
    cdMap.set(key, t);
    if (!isHit) {
      this.mode?.onRub?.(a, b); // tag transfers on any contact
      this.broadcast({ t: MSG.EFFECT, type: 'bump', kind: 'rub', a: a.id, b: b.id });
      return;
    }
    // Rivalry ledger: every validated hit feeds the nemesis stats.
    this.bumpCounts.set(key, (this.bumpCounts.get(key) || 0) + 1);
    if (b.shieldUntil > t || a.shieldUntil > t) {
      this.broadcast({ t: MSG.EFFECT, type: 'shield_pop', id: b.shieldUntil > t ? b.id : a.id });
      if (b.shieldUntil > t) b.shieldUntil = 0; else a.shieldUntil = 0;
      return;
    }
    this.mode?.onHit?.(a, b, rel);
    // Big shunts make the feed (sparingly), and bumped bots talk back.
    if (rel > 18 && Math.random() < 0.35) {
      const verbs = ['body-checked', 'flattened', 'T-boned', 'yeeted', 'audited'];
      this.feed(`💥 ${a.name} ${verbs[Math.floor(Math.random() * verbs.length)]} ${b.name}`);
    }
    if (b.bot && Math.random() < 0.25) {
      setTimeout(() => this.broadcast({ t: MSG.EFFECT, type: 'emote', id: b.id, e: 1 }), 400);
    }
    // Bots have no client-side physics, so the server shoves them: knockback
    // away from the bumper, scaled by relative speed and mass ratio.
    // Ram Mode: the ram is unstoppable, the victim goes flying
    const aRam = a.ramUntil > t, bRam = b.ramUntil > t;
    const shove = (victim, attacker, attackerRams, victimRams) => {
      if (!victim.bot || !victim.kick || victimRams) return;
      // ballast counts here too: a loaded setup sheet shoves harder
      const mR = tunedStats(CARS[attacker.car] || CARS.balanced, attacker.tune).mass
        / tunedStats(CARS[victim.car] || CARS.balanced, victim.tune).mass;
      const dx = victim.p[0] - attacker.p[0], dz = victim.p[2] - attacker.p[2];
      const len = Math.hypot(dx, dz) || 1;
      const mag = Math.min(20, 5 + rel * 0.6) * Math.min(1.8, Math.max(0.55, mR)) * (attackerRams ? 2.2 : 1);
      victim.kick.x += (dx / len) * mag;
      victim.kick.z += (dz / len) * mag;
    };
    shove(a, b, bRam, aRam); shove(b, a, aRam, bRam);
    // pa/pb let clients compute mass-scaled knockback direction; rel scales
    // the victim's shake/clonk feedback; ram marks the unstoppable party
    this.broadcast({
      t: MSG.EFFECT, type: 'bump', kind: 'hit', a: a.id, b: b.id, at: a.p, pa: a.p.map(r2), pb: b.p.map(r2), rel: r2(rel),
      ram: aRam ? a.id : bRam ? b.id : undefined,
    });
  }

  // ------------------------------------------------------------- respawning
  respawnPlayer(player, safe) {
    const t = now();
    // consequences of leaving the field fire first (spill beans, drop battery,
    // sumo elimination)
    this.mode?.onFall?.(player);
    let spot = null;
    // Races respawn at the client's safe-pose proposal (last pose that was
    // grounded on valid floor) so nobody walks back three rooms. Validate it.
    if (this.modeId === 'desk_dash' && Array.isArray(safe) && safe.length === 3
        && safe.every(Number.isFinite)
        && safe[0] > MAP_BOUNDS.minX && safe[0] < MAP_BOUNDS.maxX
        && safe[1] > MAP_BOUNDS.minZ && safe[1] < MAP_BOUNDS.maxZ) {
      spot = { x: safe[0], z: safe[1], rotY: safe[2] };
    }
    if (!spot) spot = this.pickSpawn(player);
    player.p = [spot.x, 1, spot.z];
    player.v = [0, 0, 0];
    const half = (spot.rotY || 0) / 2;
    player.q = [0, Math.sin(half), 0, Math.cos(half)];
    player.rejects = 0;
    player.allowTeleportUntil = t + 2000;
    player.spawnProtectUntil = t + RESPAWN_FREEZE_MS + SPAWN_PROTECT_MS;
    this.sendTo(player, {
      t: MSG.RESPAWN_AT, x: r2(spot.x), z: r2(spot.z), rotY: r2(spot.rotY || 0),
      freeze: RESPAWN_FREEZE_MS, protect: SPAWN_PROTECT_MS,
    });
  }

  // Halo-style spawn scoring: the free slot farthest from the nearest
  // opponent wins, with penalties for occupied and recently-used slots.
  pickSpawn(player) {
    const t = now();
    const others = [...this.players.values()].filter((p) => p.id !== player.id);
    let best = null, bestScore = -Infinity;
    SPAWNS.forEach((sp, i) => {
      let nearest = Infinity;
      for (const o of others) nearest = Math.min(nearest, Math.hypot(o.p[0] - sp.x, o.p[2] - sp.z));
      let score = Math.min(nearest, 25);
      if (nearest < 2.5) score -= 30; // someone is parked on it
      if (t - (this.lastSpawnUse[i] || 0) < 4000) score -= 15;
      score += Math.random(); // tiebreak
      if (score > bestScore) { bestScore = score; best = { ...sp, i }; }
    });
    this.lastSpawnUse[best.i] = t;
    return best;
  }

  // -------------------------------------------- interactive machines
  updateMachines(t) {
    // The copier periodically "prints": a paper blast that blinds whoever is
    // driving past the printer room.
    if (t >= this.printerAt) {
      this.printerAt = t + (PRINTER.minIntervalS + Math.random() * (PRINTER.maxIntervalS - PRINTER.minIntervalS)) * 1000;
      const targets = [...this.players.values()]
        .filter((p) => !p.eliminated && Math.hypot(p.p[0] - PRINTER.x, p.p[2] - PRINTER.z) < PRINTER.radius)
        .map((p) => p.id);
      this.broadcast({ t: MSG.EFFECT, type: 'printer', at: [r2(PRINTER.x), 0, r2(PRINTER.z)], targets, blindMs: PRINTER.blindS * 1000 });
      if (targets.length) this.feed('🖨️ The printer has opinions again');
    }
    // Ram the vending machine at speed → a can drops; sometimes it's golden
    // (a free powerup for the rammer).
    if (t >= this.vendReadyAt) {
      for (const p of this.players.values()) {
        if (p.eliminated) continue;
        const speed = Math.hypot(p.v[0], p.v[2]);
        if (speed < VENDING.minSpeed) continue;
        if (Math.hypot(p.p[0] - VENDING.x, p.p[2] - VENDING.z) > VENDING.radius) continue;
        this.vendReadyAt = t + VENDING.cooldownS * 1000;
        const golden = Math.random() < VENDING.goldenChance;
        if (golden && !p.powerup) {
          p.powerup = this.rollPowerup(p);
          if (!p.bot) this.sendTo(p, { t: MSG.PICKUP, powerup: p.powerup });
          else p.botUseAt = t + 1500 + Math.random() * 4000;
        }
        this.broadcast({ t: MSG.EFFECT, type: 'vending', id: p.id, golden });
        this.feed(golden ? `🥇 ${p.name} rammed the vending machine — golden can!` : `🥤 ${p.name} rammed the vending machine`);
        break;
      }
    }
    // Mug Rain mutator: the ceiling drops a mug near a random car
    if (this.mutator?.id === 'mug_rain' && t >= this.mugAt) {
      this.mugAt = t + MUTATORS.mug_rain.intervalS * 1000;
      const targets = [...this.players.values()].filter((p) => !p.eliminated);
      const p = targets[Math.floor(Math.random() * targets.length)];
      if (p) {
        this.broadcast({
          t: MSG.EFFECT, type: 'mug_drop',
          at: [r2(p.p[0] + (Math.random() - 0.5) * 6), 11, r2(p.p[2] + (Math.random() - 0.5) * 6)],
        });
      }
    }
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
      // Last Car Standing doubles the chaos cadence — the office fights back
      const interval = this.modeId === 'last_standing' ? OFFICE_EVENT_INTERVAL / 2 : OFFICE_EVENT_INTERVAL;
      this.nextEventAt = t + interval * 1000;
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
        if (p.eliminated || p.stunUntil > t || p.shieldUntil > t || p.spawnProtectUntil > t) continue;
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
    return { id: p.id, name: p.name, car: p.car, paint: p.paint, cos: p.cos, style: p.style, tune: p.tune, ready: p.ready, bot: p.bot, team: p.team };
  }
  publicPlayers() { return [...this.players.values()].map((p) => this.publicPlayer(p)); }

  sendLobby() {
    this.broadcast({
      t: MSG.LOBBY, phase: this.phase, players: this.publicPlayers(),
      votes: Object.fromEntries(this.votes), endsAt: this.endsAt,
    });
  }

  // The snapshot is the hot path: it goes out as a quantized binary frame
  // (shared/src/snapshot.js) instead of JSON — the codec does the rounding.
  broadcastSnapshot(t) {
    const players = {};
    for (const p of this.players.values()) {
      players[p.id] = {
        p: p.p, q: p.q,
        f: (p.drifting ? 1 : 0) | (p.grounded ? 2 : 0) | (p.stunUntil > t ? 4 : 0) |
           (p.shieldUntil > t ? 8 : 0) | (p.shrinkUntil > t ? 16 : 0) |
           (p.hasBattery ? 32 : 0) | (p.spawnProtectUntil > t ? 64 : 0) |
           (p.sumoDead || p.eliminated ? 128 : 0),
        c: p.beans,
      };
    }
    const snap = { time: t, players, puddles: this.puddles };
    if (this.rockets.length) snap.rockets = this.rockets;
    if (this.robot) snap.robot = this.robot;
    if (this.mode?.snapshot) Object.assign(snap, this.mode.snapshot());
    const data = encodeSnapshot(snap);
    for (const p of this.players.values()) {
      if (p.bot) continue;
      if (p.ws && p.ws.readyState === 1) p.ws.send(data);
    }
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
