// Game-mode controllers. Each owns its slice of authoritative state and
// contributes to the per-tick snapshot.
import {
  MSG, MODES, CHECKPOINTS, CHECKPOINT_RADIUS, PICKUP_RADIUS,
  BEAN_SPAWNS, COFFEE_MACHINE, BATTERY_SPAWN, SOCCER, WALLS, FURNITURE,
  GRAVITY, M,
} from '@rc/shared';

const now = () => Date.now();
const r2 = (n) => Math.round(n * 100) / 100;

export function createMode(id, room) {
  switch (id) {
    case 'desk_dash': return new RaceMode(room);
    case 'coffee_run': return new CoffeeMode(room);
    case 'battery': return new BatteryMode(room);
    case 'soccer': return new SoccerMode(room);
    default: return new RaceMode(room);
  }
}

// --------------------------------------------------------------- Desk Dash
class RaceMode {
  constructor(room) {
    this.room = room;
    this.laps = MODES.desk_dash.laps;
    this.finished = [];
  }
  update() {
    for (const p of this.room.players.values()) {
      if (p.finished) continue;
      const cp = CHECKPOINTS[p.nextCp % CHECKPOINTS.length];
      if (Math.hypot(p.p[0] - cp.x, p.p[2] - cp.z) < CHECKPOINT_RADIUS) {
        p.nextCp++;
        if (p.nextCp % CHECKPOINTS.length === 0) {
          p.lap++;
          if (p.lap >= this.laps) {
            p.finished = true;
            this.finished.push(p.id);
            const place = this.finished.length;
            p.score += [500, 350, 250, 180, 130, 100][Math.min(place - 1, 5)];
            this.room.feed(`🏁 ${p.name} finished ${['1st', '2nd', '3rd'][place - 1] || `${place}th`}!`);
            this.room.scoreChanged();
            if (place >= Math.min(3, this.room.players.size)) this.room.endsAt = Math.min(this.room.endsAt, now() + 12000);
          } else {
            this.room.feed(`🏎️ ${p.name} — lap ${p.lap + 1}/${this.laps}`);
          }
        }
        // Progress score keeps the scoreboard ordered mid-race
        p.score = p.lap * 200 + (p.nextCp % CHECKPOINTS.length) * 8 + (p.finished ? p.score : 0);
        if (p.finished) p.score = Math.max(p.score, p.lap * 200 + [500, 350, 250, 180, 130, 100][Math.min(this.finished.indexOf(p.id), 5)]);
      }
    }
  }
  rocketTarget(player) {
    // The car directly ahead of you in race order
    const order = [...this.room.players.values()].sort((a, b) => b.score - a.score);
    const i = order.indexOf(player);
    return i > 0 ? order[i - 1] : null;
  }
  onHit() {}
  snapshot() {
    const prog = {};
    for (const p of this.room.players.values()) prog[p.id] = [p.lap, p.nextCp % CHECKPOINTS.length];
    return { race: prog };
  }
}

// -------------------------------------------------------------- Coffee Run
class CoffeeMode {
  constructor(room) {
    this.room = room;
    this.max = MODES.coffee_run.maxCarry;
    this.beans = BEAN_SPAWNS.map((b, i) => ({ id: i, x: b.x, z: b.z, alive: true, respawnAt: 0 }));
    this.dropId = 1000;
  }
  update() {
    const t = now();
    for (const b of this.beans) if (!b.alive && b.respawnAt && t > b.respawnAt) { b.alive = true; b.respawnAt = 0; }
    for (const p of this.room.players.values()) {
      if (p.stunUntil > t) continue;
      // pickup
      if (p.beans < this.max) {
        for (const b of this.beans) {
          if (!b.alive) continue;
          if (Math.hypot(p.p[0] - b.x, p.p[2] - b.z) < PICKUP_RADIUS) {
            b.alive = false;
            b.respawnAt = b.id < 1000 ? t + 9000 : 0; // dropped beans don't respawn
            if (b.id >= 1000) b.dead = true;
            p.beans++;
            this.room.broadcast({ t: MSG.EFFECT, type: 'bean', id: p.id, bean: b.id, carry: p.beans });
            if (p.beans >= this.max) break;
          }
        }
      }
      // deliver
      if (p.beans > 0 && Math.hypot(p.p[0] - COFFEE_MACHINE.deliverX, p.p[2] - COFFEE_MACHINE.deliverZ) < COFFEE_MACHINE.radius * 2) {
        p.score += p.beans * MODES.coffee_run.beanScore;
        this.room.feed(`☕ ${p.name} delivered ${p.beans} bean${p.beans > 1 ? 's' : ''}`);
        this.room.broadcast({ t: MSG.EFFECT, type: 'deliver', id: p.id, count: p.beans });
        p.beans = 0;
        this.room.scoreChanged();
      }
    }
    this.beans = this.beans.filter((b) => !b.dead);
  }
  // Bumps spill about half your beans (min 3) — proportional loss keeps the
  // leader a target without zeroing them out; falls still spill everything.
  spill(p, cause, all = false) {
    if (p.beans <= 0) return;
    const n = all ? p.beans : Math.min(p.beans, Math.max(3, Math.ceil(p.beans / 2)));
    p.beans -= n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.beans.push({
        id: this.dropId++, alive: true, respawnAt: 0,
        x: r2(p.p[0] + Math.cos(a) * (1.2 + Math.random())),
        z: r2(p.p[2] + Math.sin(a) * (1.2 + Math.random())),
      });
    }
    this.room.feed(`💥 ${p.name} spilled ${n} bean${n > 1 ? 's' : ''}${cause ? ` (${cause})` : ''}`);
  }
  onHit(attacker, victim) { this.spill(victim, attacker ? attacker.name : null); }
  onFall(p) { this.spill(p, 'gravity', true); }
  rocketTarget(player) {
    const order = [...this.room.players.values()].filter((p) => p !== player)
      .sort((a, b) => (b.score + b.beans * 5) - (a.score + a.beans * 5));
    return order[0] || null;
  }
  snapshot() {
    return { beans: this.beans.filter((b) => b.alive).map((b) => [b.id, r2(b.x), r2(b.z)]) };
  }
}

// ---------------------------------------------------- Capture the Battery
class BatteryMode {
  constructor(room) {
    this.room = room;
    this.battery = { x: BATTERY_SPAWN.x, z: BATTERY_SPAWN.z, carrier: null };
    this.scoreAcc = 0;
  }
  update(dt) {
    const t = now();
    const b = this.battery;
    if (b.carrier) {
      const c = this.room.players.get(b.carrier);
      if (!c) { b.carrier = null; return; }
      b.x = c.p[0]; b.z = c.p[2];
      c.score += MODES.battery.scorePerSecond * dt;
      this.scoreAcc += dt;
      if (this.scoreAcc > 2) { this.scoreAcc = 0; this.room.scoreChanged(); }
    } else {
      for (const p of this.room.players.values()) {
        if (p.stunUntil > t) continue;
        if (Math.hypot(p.p[0] - b.x, p.p[2] - b.z) < PICKUP_RADIUS) {
          b.carrier = p.id;
          p.hasBattery = true;
          this.room.feed(`🔋 ${p.name} grabbed the battery!`);
          this.room.broadcast({ t: MSG.EFFECT, type: 'battery_grab', id: p.id });
          break;
        }
      }
    }
  }
  drop(p) {
    if (this.battery.carrier !== p.id) return;
    this.battery.carrier = null;
    p.hasBattery = false;
    this.battery.x = p.p[0]; this.battery.z = p.p[2];
    // If it fell out of the world, respawn it home
    if (p.p[1] < -8) { this.battery.x = BATTERY_SPAWN.x; this.battery.z = BATTERY_SPAWN.z; }
    this.room.broadcast({ t: MSG.EFFECT, type: 'battery_drop', id: p.id });
  }
  onHit(attacker, victim) {
    if (this.battery.carrier === victim.id) {
      this.drop(victim);
      this.room.feed(`🔋 ${attacker ? attacker.name : 'The office'} made ${victim.name} drop the battery`);
    }
  }
  onFall(p) { this.drop(p); }
  onLeave(p) { this.drop(p); }
  rocketTarget(player) {
    if (this.battery.carrier && this.battery.carrier !== player.id) return this.room.players.get(this.battery.carrier);
    return null;
  }
  snapshot() {
    return { battery: { x: r2(this.battery.x), z: r2(this.battery.z), carrier: this.battery.carrier } };
  }
}

// ---------------------------------------------------------------- RC Soccer
// The server integrates the ball against the map's walls + furniture so all
// clients agree. Cars hit the ball via proximity/velocity from their reports.
class SoccerMode {
  constructor(room) {
    this.room = room;
    this.resetBall();
    this.teamScores = [0, 0];
    this.freezeUntil = 0;
    // Assign teams, alternating by join order
    let i = 0;
    for (const p of room.players.values()) p.team = i++ % 2;
    this.boxes = [...WALLS, ...FURNITURE].map((w) => ({
      minX: w.x - w.w / 2, maxX: w.x + w.w / 2,
      minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2, h: w.h,
    }));
  }
  resetBall() {
    const s = SOCCER.ballSpawn;
    this.ball = { p: [s.x, s.y + 2, s.z], v: [0, 0, 0] };
  }
  onJoin(p) { p.team = [...this.room.players.values()].filter((q) => q.team === 0).length <= this.room.players.size / 2 ? 0 : 1; }
  update(dt) {
    const t = now();
    if (t < this.freezeUntil) return;
    const b = this.ball;
    const R = SOCCER.ballRadius;
    // integrate (2 substeps for stability)
    for (let step = 0; step < 2; step++) {
      const h = dt / 2;
      b.v[1] += GRAVITY * 0.6 * h; // a ping pong ball floats a little
      b.p[0] += b.v[0] * h; b.p[1] += b.v[1] * h; b.p[2] += b.v[2] * h;
      // floor
      if (b.p[1] < R) { b.p[1] = R; b.v[1] = Math.abs(b.v[1]) * 0.6; b.v[0] *= 0.995; b.v[2] *= 0.995; }
      // walls & furniture (2D AABB vs circle, only below box height)
      for (const box of this.boxes) {
        if (b.p[1] - R > box.h) continue;
        const cx = Math.max(box.minX, Math.min(b.p[0], box.maxX));
        const cz = Math.max(box.minZ, Math.min(b.p[2], box.maxZ));
        const dx = b.p[0] - cx, dz = b.p[2] - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          b.p[0] = cx + nx * R; b.p[2] = cz + nz * R;
          const vn = b.v[0] * nx + b.v[2] * nz;
          if (vn < 0) { b.v[0] -= 1.7 * vn * nx; b.v[2] -= 1.7 * vn * nz; }
        }
      }
    }
    // car hits
    for (const p of this.room.players.values()) {
      const dx = b.p[0] - p.p[0], dy = b.p[1] - (p.p[1] + 0.2), dz = b.p[2] - p.p[2];
      const d = Math.hypot(dx, dy, dz);
      const reach = R + 0.75;
      if (d < reach && d > 1e-6) {
        const nx = dx / d, ny = Math.max(0.1, dy / d), nz = dz / d;
        const carSpeed = Math.hypot(p.v[0], p.v[2]);
        const power = Math.max(carSpeed * 1.25, 9);
        b.v[0] = nx * power; b.v[1] = Math.max(b.v[1], ny * power * 0.55); b.v[2] = nz * power;
        b.p[0] = p.p[0] + nx * reach; b.p[2] = p.p[2] + nz * reach;
        b.lastTouch = p.id;
      }
    }
    // speed cap + gentle pull back to arena if it escapes through a far door
    const sp = Math.hypot(b.v[0], b.v[2]);
    if (sp > 70) { b.v[0] *= 70 / sp; b.v[2] *= 70 / sp; }
    const A = SOCCER.arena;
    if (b.p[0] < A.minX - 12 || b.p[0] > A.maxX + 12 || b.p[2] < A.minZ - 3 || b.p[2] > A.maxZ + 12) this.resetBall();
    // goals — ball fully crossing a doorway goal line
    for (const g of SOCCER.goals) {
      if (Math.abs(b.p[2] - g.z) < g.width / 2 && (g.dir === 1 ? b.p[0] < g.x - R : b.p[0] > g.x + R) && b.p[1] < 3) {
        const scoringTeam = 1 - g.team;
        this.teamScores[scoringTeam] += 1;
        const scorer = this.room.players.get(b.lastTouch);
        for (const p of this.room.players.values()) if (p.team === scoringTeam) p.score += MODES.soccer.goalScore;
        if (scorer) scorer.score += MODES.soccer.goalScore;
        this.room.feed(`⚽ GOOOAL! ${scorer ? scorer.name : 'Someone'} scores for ${scoringTeam === 0 ? '🟠 Orange' : '🔵 Blue'}!`);
        this.room.broadcast({ t: MSG.EFFECT, type: 'goal', team: scoringTeam, scorer: scorer?.id, teamScores: this.teamScores });
        this.room.scoreChanged();
        this.resetBall();
        this.freezeUntil = t + 2500;
        break;
      }
    }
  }
  onHit() {}
  rocketTarget(player) {
    const foes = [...this.room.players.values()].filter((p) => p.team !== player.team);
    return this.room.nearest(player, foes);
  }
  snapshot() {
    return {
      ball: { p: this.ball.p.map(r2), v: this.ball.v.map(r2) },
      teamScores: this.teamScores,
    };
  }
}
