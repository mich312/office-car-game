// Game-mode controllers. Each owns its slice of authoritative state and
// contributes to the per-tick snapshot.
import {
  MSG, MODES, CHECKPOINT_RADIUS, PICKUP_RADIUS,
  KOTH_RADIUS,
  GRAVITY, M, LCS, COUNTDOWN_SECONDS, isDecor,
  raceCheckpoints, raceLaps, sumoTarget, sumoCenter, kothHopSeconds,
  groundAt, clearDropSpot, wallBetween, MUTATORS, soccerGoalHeight,
} from '@rc/shared';

const now = () => Date.now();
const r2 = (n) => Math.round(n * 100) / 100;

// What a car is standing on: its reported height less the ride height. A
// dropped battery or spill lands on that surface (the loading dock, a
// pallet stack), not inside it.
const RIDE_Y = 0.24;
const standY = (p) => Math.max(0, p.p[1] - RIDE_Y) + 0.5;

// Somewhere to drop a thing `dist` from (x, z) in direction a (radians),
// shortened until it's clear of walls and furniture and on this side of
// any wall; `min` is as close as it may come. Against a wall it swings
// round (nearest direction first) rather than land in the car's lap.
// Null if nowhere fits.
function dropSpot(map, x, z, a, dist, min, maxY) {
  for (let k = 0; k < 12; k++) {
    const ak = a + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (Math.PI / 6);
    for (let d = dist; d >= min - 1e-9; d -= 0.4) {
      const nx = x + Math.cos(ak) * d, nz = z + Math.sin(ak) * d;
      if (clearDropSpot(map, x, z, nx, nz, { maxY })) return [nx, nz];
    }
  }
  return null;
}

export function createMode(id, room) {
  switch (id) {
    case 'desk_dash': return new RaceMode(room);
    case 'coffee_run': return new CoffeeMode(room);
    case 'battery': return new BatteryMode(room);
    case 'soccer': return new SoccerMode(room);
    case 'koth': return new KothMode(room);
    case 'tag': return new TagMode(room);
    case 'sumo': return new SumoMode(room);
    case 'last_standing': return new LastStandingMode(room);
    case 'free_roam': return new FreeRoamMode(room);
    default: return new RaceMode(room);
  }
}

// ------------------------------------------------------------ Open Office
// Open-world sandbox: no objectives, no pressure — ten minutes of playground.
// Style points keep the scoreboard honest: drifting, air time and mayhem.
class FreeRoamMode {
  constructor(room) {
    this.room = room;
    this.acc = 0;
  }
  update(dt) {
    const cfg = MODES.free_roam;
    for (const p of this.room.players.values()) {
      if (p.drifting) p.score += cfg.driftPerS * dt;
      if (!p.grounded) p.score += cfg.airPerS * dt;
    }
    this.acc += dt;
    if (this.acc > 2) { this.acc = 0; this.room.scoreChanged(); }
  }
  onHit(attacker) { if (attacker) attacker.score += MODES.free_roam.bumpScore; }
  onFall() {} // falls are free — the balcony is a diving board here
  rocketTarget(player) {
    return this.room.nearest(player, [...this.room.players.values()].filter((p) => p.id !== player.id));
  }
}

// ------------------------------------------------------ Last Car Standing
// Facilities closes the office room by room (telegraphed like office
// events). Linger in a locked room and you're zapped; fall off the balcony
// and you're gone. One refuge room always survives for the final showdown.
// Eliminated players turn into spectating ghosts (flag 64 hides their car).
class LastStandingMode {
  constructor(room) {
    this.room = room;
    // Shuffled closure order — the final entry is the refuge, never locked.
    this.order = this.room.map.ROOMS.map((r) => r.id);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.locked = [];
    this.warn = null; // { room, until }
    this.nextLockAt = now() + (COUNTDOWN_SECONDS + LCS.FIRST_LOCK_S) * 1000;
    this.outCount = 0;
    this.over = false;
    for (const p of room.players.values()) { p.eliminated = false; p.zapT = 0; }
  }
  alive() { return [...this.room.players.values()].filter((p) => !p.eliminated); }
  update(dt) {
    const t = now();
    const alive = this.alive();
    for (const p of alive) p.score += LCS.SURVIVAL_SCORE_PER_S * dt;
    // telegraph the next closure…
    if (!this.warn && this.locked.length < this.room.map.ROOMS.length - 1 && t >= this.nextLockAt - LCS.WARN_S * 1000) {
      const roomId = this.order.shift();
      this.warn = { room: roomId, until: this.nextLockAt };
      const r = this.room.map.ROOMS.find((rm) => rm.id === roomId);
      this.room.feed(`🚧 Facilities is closing the ${r?.name ?? roomId} — clear out!`);
    }
    // …then lock it
    if (this.warn && t >= this.warn.until) {
      this.locked.push(this.warn.room);
      this.warn = null;
      this.nextLockAt = t + LCS.LOCK_INTERVAL_S * 1000;
    }
    // zap loiterers (short grace so a near-miss is escapable)
    for (const p of alive) {
      const rm = this.room.map.roomAt(p.p[0], p.p[2]);
      if (rm && this.locked.includes(rm.id)) {
        p.zapT = (p.zapT || 0) + dt;
        if (p.zapT > LCS.ZAP_GRACE_S) this.eliminate(p, `lingered in the ${rm.name}`);
      } else {
        p.zapT = 0;
      }
    }
  }
  eliminate(p, cause) {
    if (p.eliminated || this.over) return;
    p.eliminated = true;
    p.zapT = 0;
    p.allowTeleportUntil = now() + 2500; // ghost client parks its car off-map
    this.outCount++;
    p.score += LCS.PLACEMENT_SCORE * this.outCount; // dying later pays more
    const left = this.alive();
    this.room.broadcast({ t: MSG.EFFECT, type: 'eliminated', id: p.id, at: p.p.map(r2), left: left.length });
    this.room.feed(`💀 ${p.name} is out — ${cause}! ${left.length} car${left.length === 1 ? '' : 's'} left`);
    this.room.scoreChanged();
    if (this.room.players.size > 1) this.checkLastStanding();
  }
  // Shared by eliminate() and onLeave(): once one (or zero) cars remain,
  // crown the survivor and wind the match down.
  checkLastStanding() {
    const left = this.alive();
    if (this.over || left.length > 1) return;
    this.over = true;
    const w = left[0];
    if (w) {
      w.score += LCS.WINNER_SCORE;
      this.room.feed(`👑 ${w.name} is the LAST CAR STANDING!`);
      this.room.scoreChanged();
    }
    this.room.endsAt = Math.min(this.room.endsAt, now() + 4000);
  }
  // only a real fall eliminates — a courtesy R-key respawn shouldn't
  onFall(p) { if (p.p[1] < -6) this.eliminate(p, 'went over the edge'); }
  onJoin(p) { p.eliminated = false; p.zapT = 0; } // drop-ins join the fray
  // a disconnect can leave one car standing just like an elimination can —
  // without this the survivor idles out the whole remaining match timer
  onLeave() { this.checkLastStanding(); }
  onHit() {}
  rocketTarget(player) {
    return this.room.nearest(player, this.alive().filter((p) => p.id !== player.id));
  }
  snapshot() {
    return { lcs: { locked: this.locked, warn: this.warn, alive: this.alive().length } };
  }
}

// --------------------------------------------------------------- Desk Dash
const PLACE_SCORE = [500, 350, 250, 180, 130, 100];

class RaceMode {
  constructor(room) {
    this.room = room;
    this.cps = raceCheckpoints(room.variant, room.map); // reverse runs them backwards
    this.laps = raceLaps(room.map, MODES.desk_dash.laps);
    this.finished = [];
  }
  update() {
    for (const p of this.room.players.values()) {
      if (p.finished) continue;
      const cp = this.cps[p.nextCp % this.cps.length];
      if (Math.hypot(p.p[0] - cp.x, p.p[2] - cp.z) < CHECKPOINT_RADIUS) {
        p.nextCp++;
        if (p.nextCp % this.cps.length === 0) {
          p.lap++;
          if (p.lap >= this.laps) {
            p.finished = true;
            this.finished.push(p.id);
            const place = this.finished.length;
            p.finishBonus = PLACE_SCORE[Math.min(place - 1, PLACE_SCORE.length - 1)];
            this.room.feed(`🏁 ${p.name} finished ${['1st', '2nd', '3rd'][place - 1] || `${place}th`}!`);
            this.room.scoreChanged();
            if (place >= Math.min(3, this.room.players.size)) this.room.endsAt = Math.min(this.room.endsAt, now() + 12000);
          } else {
            this.room.feed(`🏎️ ${p.name} — lap ${p.lap + 1}/${this.laps}`);
          }
        }
        // Progress score keeps the scoreboard ordered mid-race. It is
        // recomputed from lap+checkpoint every time rather than accumulated,
        // so the finish bonus has to sit outside it — fold it back in and the
        // whole progress score gets counted a second time on the final lap.
        p.score = p.lap * 200 + (p.nextCp % this.cps.length) * 8 + (p.finishBonus || 0);
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
    for (const p of this.room.players.values()) prog[p.id] = [p.lap, p.nextCp % this.cps.length];
    return { race: prog };
  }
}

// -------------------------------------------------------------- Coffee Run
const SPILL_R0 = 2.2, SPILL_R1 = 3.2; // spill ring, beyond PICKUP_RADIUS + a tick of driving
const SPILL_NO_PICKUP_MS = 1000;

class CoffeeMode {
  constructor(room) {
    this.room = room;
    this.max = MODES.coffee_run.maxCarry;
    this.beans = this.room.map.BEAN_SPAWNS.map((b, i) => ({ id: i, x: b.x, z: b.z, y: 0, alive: true, respawnAt: 0 }));
    this.dropId = 1000;
  }
  update() {
    const t = now();
    for (const b of this.beans) {
      if (!b.alive && b.respawnAt && t > b.respawnAt) { b.alive = true; b.respawnAt = 0; }
      // spilled beans expire uncollected — the office cleans up after itself
      if (b.alive && b.expiresAt && t > b.expiresAt) { b.alive = false; b.dead = true; }
    }
    for (const p of this.room.players.values()) {
      if (p.stunUntil > t) continue;
      // pickup
      if (p.beans < this.max) {
        for (const b of this.beans) {
          if (!b.alive) continue;
          // your own spill isn't yours to scoop straight back up
          if (b.noPickup && b.noPickup.id === p.id && t < b.noPickup.until) continue;
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
      // deliver — in sight of the machine: the zone is a circle, and on the
      // cellar it reached through the boiler-room wall into the corridor
      const cm = this.room.map.COFFEE_MACHINE;
      if (p.beans > 0 && Math.hypot(p.p[0] - cm.deliverX, p.p[2] - cm.deliverZ) < cm.radius * 2
          && !wallBetween(this.room.map, cm.deliverX, cm.deliverZ, p.p[0], p.p[2])) {
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
  // The ring lands outside the victim's pickup radius (it used to catch a
  // third of every spill straight back) and the victim can't scoop its own
  // spill for a second; beans that would land in a wall, in furniture or
  // through a wall come in closer, or stay in the victim's tyre tracks.
  spill(p, cause, all = false) {
    if (p.beans <= 0) return;
    const n = all ? p.beans : Math.min(p.beans, Math.max(3, Math.ceil(p.beans / 2)));
    p.beans -= n;
    const t = now();
    const map = this.room.map;
    let cx = p.p[0], cz = p.p[2], maxY = standY(p);
    if (all && p.p[1] < -6) {
      // a fall: ring the beans round the last floor it drove on, not in
      // mid-air past the balcony railing — and with no such floor, they're gone
      const last = p.poseRing?.[p.poseRing.length - 1];
      if (!last) { this.room.feed(`💥 ${p.name} spilled ${n} bean${n > 1 ? 's' : ''} (${cause})`); return; }
      [cx, cz] = last; maxY = 0.5;
    }
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const [x, z] = dropSpot(map, cx, cz, a, SPILL_R0 + Math.random() * (SPILL_R1 - SPILL_R0), PICKUP_RADIUS + 0.2, maxY) || [cx, cz];
      this.beans.push({
        id: this.dropId++, alive: true, respawnAt: 0,
        expiresAt: t + MODES.coffee_run.spillTtlS * 1000,
        x: r2(x), z: r2(z), y: r2(groundAt(map, x, z, maxY)),
        noPickup: { id: p.id, until: t + SPILL_NO_PICKUP_MS },
      });
    }
    this.room.feed(`💥 ${p.name} spilled ${n} bean${n > 1 ? 's' : ''}${cause ? ` (${cause})` : ''}`);
  }
  onHit(attacker, victim) { this.spill(victim, attacker ? attacker.name : null); }
  // only a real fall spills — a courtesy R-key flip recovery shouldn't
  onFall(p) { if (p.p[1] < -6) this.spill(p, 'gravity', true); }
  rocketTarget(player) {
    const order = [...this.room.players.values()].filter((p) => p !== player)
      .sort((a, b) => (b.score + b.beans * 5) - (a.score + a.beans * 5));
    return order[0] || null;
  }
  snapshot() {
    return { beans: this.beans.filter((b) => b.alive).map((b) => [b.id, r2(b.x), r2(b.z), b.y]) };
  }
}

// ---------------------------------------------------- Capture the Battery
const BATTERY_KNOCK = 2.5; // how far a hit knocks the battery from its carrier
const BATTERY_NO_PICKUP_MS = 1500;
const BATTERY_GRAB_GRACE_MS = 2000; // a hit this soon after a grab doesn't knock it loose

class BatteryMode {
  constructor(room) {
    this.room = room;
    this.battery = { x: this.room.map.BATTERY_SPAWN.x, z: this.room.map.BATTERY_SPAWN.z, y: 0, carrier: null, noPickup: null };
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
      // the nearest car in reach takes it (not the first one to have joined
      // the room), and the car that just lost it has to wait a moment
      let p = null, pd = PICKUP_RADIUS;
      for (const q of this.room.players.values()) {
        if (q.stunUntil > t || q.eliminated) continue;
        if (b.noPickup && b.noPickup.id === q.id && t < b.noPickup.until) continue;
        const d = Math.hypot(q.p[0] - b.x, q.p[2] - b.z);
        if (d < pd) { pd = d; p = q; }
      }
      if (p) {
        b.carrier = p.id;
        b.noPickup = null;
        b.grabbedAt = t;
        p.hasBattery = true;
        this.room.feed(`🔋 ${p.name} grabbed the battery!`);
        this.room.broadcast({ t: MSG.EFFECT, type: 'battery_grab', id: p.id });
      }
    }
  }
  // A hit knocks the battery a couple of units along the hit, clear of any
  // wall, and the victim can't grab it back for a moment — it used to stay
  // under the victim, who picked it straight up again on the next tick.
  drop(p, from = null) {
    const b = this.battery;
    if (b.carrier !== p.id) return;
    b.carrier = null;
    p.hasBattery = false;
    const map = this.room.map;
    if (p.p[1] < -8) {
      // it fell out of the world: respawn it home
      b.x = map.BATTERY_SPAWN.x; b.z = map.BATTERY_SPAWN.z; b.y = 0; b.noPickup = null;
    } else {
      let a = from ? Math.atan2(p.p[2] - from.p[2], p.p[0] - from.p[0]) : Math.random() * Math.PI * 2;
      if (from && from.p[0] === p.p[0] && from.p[2] === p.p[2]) a = Math.random() * Math.PI * 2;
      const maxY = standY(p);
      const [x, z] = dropSpot(map, p.p[0], p.p[2], a, BATTERY_KNOCK, 0.4, maxY) || [p.p[0], p.p[2]];
      b.x = x; b.z = z; b.y = r2(groundAt(map, x, z, maxY));
      b.noPickup = { id: p.id, until: now() + BATTERY_NO_PICKUP_MS };
    }
    this.room.broadcast({ t: MSG.EFFECT, type: 'battery_drop', id: p.id });
  }
  onHit(attacker, victim) {
    // a fresh grab holds for a moment: with every car in the scrum able to
    // knock it loose, the battery otherwise changed hands every second
    if (this.battery.carrier === victim.id && now() - (this.battery.grabbedAt || 0) >= BATTERY_GRAB_GRACE_MS) {
      this.drop(victim, attacker);
      this.room.feed(`🔋 ${attacker ? attacker.name : 'The office'} made ${victim.name} drop the battery`);
    }
  }
  // only a real fall drops the battery — an R-key flip recovery shouldn't
  onFall(p) { if (p.p[1] < -6) this.drop(p); }
  onLeave(p) { this.drop(p); }
  rocketTarget(player) {
    if (this.battery.carrier && this.battery.carrier !== player.id) return this.room.players.get(this.battery.carrier);
    return null;
  }
  snapshot() {
    return { battery: { x: r2(this.battery.x), z: r2(this.battery.z), y: this.battery.carrier ? 0 : this.battery.y, carrier: this.battery.carrier } };
  }
}

// ---------------------------------------------------------------- RC Soccer
// The server integrates the ball against the map's walls + furniture so all
// clients agree. Cars hit the ball via proximity/velocity from their reports.
const OUT_OF_PLAY_S = 1.5; // a ball this long outside the pitch is dropped back in
const DROP_FREEZE_MS = 1200;

class SoccerMode {
  constructor(room) {
    this.room = room;
    // Giant Ball mutator inflates the ball server-side; clients scale to match
    this.R = this.room.map.SOCCER.ballRadius * (room.mutator?.id === 'giant_ball' ? MUTATORS.giant_ball.scale : 1);
    this.resetBall();
    this.teamScores = [0, 0];
    this.freezeUntil = 0;
    this.outT = 0;
    // Assign teams, alternating by join order
    let i = 0;
    for (const p of room.players.values()) p.team = i++ % 2;
    // decor (rugs, art, TVs) has no client collider — the ball skips it too
    this.boxes = [...room.map.WALLS, ...room.map.FURNITURE.filter((f) => !isDecor(f))].map((w) => ({
      minX: w.x - w.w / 2, maxX: w.x + w.w / 2,
      minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2, h: w.h,
    }));
  }
  resetBall() {
    const s = this.room.map.SOCCER.ballSpawn;
    this.ball = { p: [s.x, s.y + 2, s.z], v: [0, 0, 0] };
    this.outT = 0;
  }
  onJoin(p) { p.team = [...this.room.players.values()].filter((q) => q.team === 0).length <= this.room.players.size / 2 ? 0 : 1; }
  update(dt) {
    const t = now();
    if (t < this.freezeUntil) return;
    const b = this.ball;
    const R = this.R;
    const map = this.room.map;
    const prev = [...b.p];
    // Moon Gravity floats the ball too, not just the cars
    const g = GRAVITY * 0.6 * (this.room.mutator?.gravity ?? 1); // a ping pong ball floats a little
    // integrate (2 substeps for stability)
    for (let step = 0; step < 2; step++) {
      const h = dt / 2;
      b.v[1] += g * h;
      b.p[0] += b.v[0] * h; b.p[1] += b.v[1] * h; b.p[2] += b.v[2] * h;
      // floor — or whatever it's over: a desk top, a ramp deck (it used to
      // roll straight through ramps at floor height)
      const floor = groundAt(map, b.p[0], b.p[2], b.p[1] - R + 0.6);
      if (b.p[1] < floor + R) { b.p[1] = floor + R; b.v[1] = Math.abs(b.v[1]) * 0.6; b.v[0] *= 0.995; b.v[2] *= 0.995; }
      // centre inside a box (a lofted ball coming down on furniture): out
      // the nearest way that isn't into the next box — this used to be
      // skipped, leaving the ball inside a desk for good
      this.escapeBoxes(b);
      // walls & furniture (2D AABB vs circle, only below box height)
      for (const box of this.boxes) {
        if (b.p[1] - R > box.h - 0.05) continue;
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
    const sp = Math.hypot(b.v[0], b.v[2]);
    if (sp > 70) { b.v[0] *= 70 / sp; b.v[2] *= 70 / sp; }
    // goals — the ball CROSSING a doorway goal line this tick, from the
    // pitch side, inside the mouth and under the crossbar. A snapshot of
    // "is it past the line now" missed lofted shots that drifted out of the
    // band after crossing, scored balls that reached the band another way,
    // and a fixed height gate made the Giant Ball unscoreable.
    for (const gl of map.SOCCER.goals) {
      const line = gl.x - gl.dir * R; // centre this far past the goal line = fully over
      const before = (prev[0] - line) * gl.dir, after = (b.p[0] - line) * gl.dir;
      if (!(before > 0 && after <= 0)) continue;
      const k = before / (before - after);
      const zc = prev[2] + (b.p[2] - prev[2]) * k, yc = prev[1] + (b.p[1] - prev[1]) * k;
      if (Math.abs(zc - gl.z) >= gl.width / 2 || yc - R >= soccerGoalHeight(R)) continue;
      this.goal(gl, t);
      return;
    }
    // out of play: off the pitch (not in a goal mouth) for a moment, or off
    // the map outright, and it's dropped back on the spot. The old fixed
    // margins were the office's, and left the ball trapped in the office
    // bathroom for a minute or loose behind the cellar goal lines.
    const A = map.SOCCER.arena, B = map.MAP_BOUNDS;
    const inMouth = map.SOCCER.goals.some((gl) => Math.abs(b.p[2] - gl.z) < gl.width / 2 && Math.abs(b.p[0] - gl.x) < R * 2);
    const off = b.p[0] < A.minX - R || b.p[0] > A.maxX + R || b.p[2] < A.minZ - R || b.p[2] > A.maxZ + R;
    this.outT = off && !inMouth ? this.outT + dt : 0;
    const gone = b.p[0] < B.minX || b.p[0] > B.maxX || b.p[2] < B.minZ || b.p[2] > B.maxZ || b.p[1] < -5;
    if (this.outT > OUT_OF_PLAY_S || gone) {
      this.resetBall();
      this.freezeUntil = t + DROP_FREEZE_MS;
      this.room.feed('⚽ Out of play — drop ball!');
      this.room.broadcast({ t: MSG.EFFECT, type: 'ball_reset' });
    }
  }
  escapeBoxes(b) {
    const R = this.R;
    const within = (x, z) => this.boxes.find((bx) => b.p[1] - R <= bx.h - 0.05
      && x >= bx.minX && x <= bx.maxX && z >= bx.minZ && z <= bx.maxZ);
    const box = within(b.p[0], b.p[2]);
    if (!box) return;
    let best = null;
    for (const [x, z, nx, nz] of [
      [box.minX - R, b.p[2], -1, 0], [box.maxX + R, b.p[2], 1, 0],
      [b.p[0], box.minZ - R, 0, -1], [b.p[0], box.maxZ + R, 0, 1],
    ]) {
      const d = Math.hypot(x - b.p[0], z - b.p[2]);
      if (!within(x, z) && (!best || d < best.d)) best = { x, z, nx, nz, d };
    }
    if (!best) return;
    b.p[0] = best.x; b.p[2] = best.z;
    const vn = b.v[0] * best.nx + b.v[2] * best.nz;
    if (vn < 0) { b.v[0] -= 1.7 * vn * best.nx; b.v[2] -= 1.7 * vn * best.nz; }
  }
  goal(g, t) {
    const b = this.ball;
    const scoringTeam = 1 - g.team;
    this.teamScores[scoringTeam] += 1;
    const scorer = this.room.players.get(b.lastTouch);
    for (const p of this.room.players.values()) if (p.team === scoringTeam) p.score += MODES.soccer.goalScore;
    // the personal scorer bonus only pays if the last touch was actually
    // on the scoring team — an own goal must not reward the defender who
    // conceded it (in Office Cup that was a farmable point exploit)
    const ownGoal = scorer && scorer.team !== scoringTeam;
    if (scorer && !ownGoal) scorer.score += MODES.soccer.goalScore;
    const teamName = scoringTeam === 0 ? '🟠 Orange' : '🔵 Blue';
    this.room.feed(ownGoal
      ? `⚽ OWN GOAL! ${scorer.name} puts it in for ${teamName}!`
      : `⚽ GOOOAL! ${scorer ? scorer.name : 'Someone'} scores for ${teamName}!`);
    this.room.broadcast({ t: MSG.EFFECT, type: 'goal', team: scoringTeam, scorer: scorer?.id, teamScores: this.teamScores });
    this.room.scoreChanged();
    // Score cap: reaching it ends the match after a short victory lap
    if (this.teamScores[scoringTeam] >= MODES.soccer.goalCap) {
      this.room.feed(`🏁 ${scoringTeam === 0 ? '🟠 Orange' : '🔵 Blue'} takes the match!`);
      this.room.endsAt = Math.min(this.room.endsAt, t + 4000);
    }
    this.resetBall();
    this.freezeUntil = t + 2500;
  }
  onHit() {}
  rocketTarget(player) {
    const foes = [...this.room.players.values()].filter((p) => p.team !== player.team);
    return this.room.nearest(player, foes);
  }
  snapshot() {
    return {
      ball: { p: this.ball.p.map(r2), v: this.ball.v.map(r2), r: r2(this.R) },
      teamScores: this.teamScores,
    };
  }
}

// ------------------------------------------------------- Standup Standoff
// Moving-zone king of the hill: a drive-through meeting zone hops between
// rooms every hopSeconds; everyone inside scores per second. Large zone and
// frequent hops keep it a driving mode, not a parking mode.
class KothMode {
  constructor(room) {
    this.room = room;
    this.cfg = MODES.koth;
    this.spot = Math.floor(Math.random() * this.room.map.KOTH_SPOTS.length);
    this.hopAt = 0; // armed on the first playing tick, after the countdown
    this.acc = 0;
  }
  zonePos() { return this.room.map.KOTH_SPOTS[this.spot]; }
  update(dt) {
    const t = now();
    const hop = kothHopSeconds(this.cfg.hopSeconds, this.room.variant); // Rush Hour halves it
    if (!this.hopAt) this.hopAt = t + hop * 1000;
    if (t >= this.hopAt) {
      let next;
      do { next = Math.floor(Math.random() * this.room.map.KOTH_SPOTS.length); } while (next === this.spot);
      this.spot = next;
      this.hopAt = t + hop * 1000;
      this.room.broadcast({ t: MSG.EFFECT, type: 'zone_hop' });
      this.room.feed('📍 The standup moved!');
    }
    const z = this.zonePos();
    let scored = false;
    for (const p of this.room.players.values()) {
      if (p.stunUntil > t) continue;
      if (Math.hypot(p.p[0] - z.x, p.p[2] - z.z) <= KOTH_RADIUS && Math.abs(p.p[1]) < 4) {
        p.score += this.cfg.scorePerSecond * dt;
        scored = true;
      }
    }
    if (scored) {
      this.acc += dt;
      if (this.acc > 2) { this.acc = 0; this.room.scoreChanged(); }
    }
  }
  onHit() {}
  rocketTarget(player) {
    const z = this.zonePos();
    const inZone = [...this.room.players.values()]
      .filter((p) => p.id !== player.id && Math.hypot(p.p[0] - z.x, p.p[2] - z.z) <= KOTH_RADIUS)
      .sort((a, b) => b.score - a.score);
    return inZone[0] || null;
  }
  snapshot() {
    const z = this.zonePos();
    return { zone: { x: z.x, z: z.z, r: KOTH_RADIUS, until: this.hopAt || undefined } };
  }
}

// --------------------------------------------------------------- You're It
// Inverted tag (Shine Thief logic without the object): the It car scores per
// second; ANY contact — rub or hit — transfers It, so chasing at matched
// speeds still tags. Fleeing is the skill, the crown marks the target.
class TagMode {
  constructor(room) {
    this.room = room;
    this.cfg = MODES.tag;
    this.it = null;
    this.lastTagAt = 0;
    this.acc = 0;
    const all = [...room.players.values()];
    if (all.length) this.setIt(all[Math.floor(Math.random() * all.length)], true);
  }
  setIt(p, silent = false) {
    this.it = p.id;
    this.lastTagAt = now();
    if (!silent) this.room.broadcast({ t: MSG.EFFECT, type: 'tag', id: p.id });
    this.room.feed(`🎯 ${p.name} is It!`);
  }
  transfer(a, b) {
    if (now() - this.lastTagAt < this.cfg.tagCooldownMs) return;
    const it = a.id === this.it ? a : b.id === this.it ? b : null;
    if (!it) return;
    // A shield keeps the crown on and pops. Hits already stop at the shield
    // in room.onBump, but a gentle rub used to steal It straight through it.
    if (it.shieldUntil > now()) {
      it.shieldUntil = 0;
      this.room.broadcast({ t: MSG.EFFECT, type: 'shield_pop', id: it.id });
      return;
    }
    this.setIt(it === a ? b : a);
  }
  onHit(a, b) { if (a && b) this.transfer(a, b); }
  onRub(a, b) { this.transfer(a, b); }
  // Any contact tags, but an item only tags when it lands ON the It car:
  // the It car's own EMP or rocket used to hand It to its victim.
  onItemHit(owner, target) { if (target.id === this.it) this.transfer(owner, target); }
  onLeave(p) { if (p.id === this.it) this.it = null; }
  update(dt) {
    let it = this.room.players.get(this.it);
    if (!it) {
      const all = [...this.room.players.values()];
      if (!all.length) return;
      it = all[Math.floor(Math.random() * all.length)];
      this.setIt(it);
    }
    it.score += this.cfg.scorePerSecond * dt;
    this.acc += dt;
    if (this.acc > 2) { this.acc = 0; this.room.scoreChanged(); }
  }
  rocketTarget(player) {
    // everyone hunts the It car; the It car gets nobody special
    return player.id === this.it ? null : this.room.players.get(this.it) || null;
  }
  snapshot() { return this.it ? { it: this.it } : {}; }
}

// ------------------------------------------------------ Meeting Room Sumo
// Rounds: the safe zone starts covering most of the office and shrinks to a
// circle in the open office. Leave it too long (or fall) and you're out for
// the round. Score by elimination order; last car rolling banks the bonus.
// Eliminated cars keep driving as mobile chicanes until the next round.
class SumoMode {
  constructor(room) {
    this.room = room;
    this.cfg = MODES.sumo;
    this.round = 0;
    this.roundEndsAt = 0;
    this.restUntil = 0;
    this.order = [];
    this.zone = { x: this.room.map.SUMO_ZONE.x, z: this.room.map.SUMO_ZONE.z, r: this.room.map.SUMO_ZONE.r0 };
  }
  startRound() {
    const t = now();
    this.round++;
    this.roundEndsAt = t + this.cfg.roundSeconds * 1000;
    this.order = [];
    this.zone.r = this.room.map.SUMO_ZONE.r0;
    // Moving Meeting: this round's ring slides toward a room as it shrinks
    this.target = sumoTarget(this.round, this.room.variant, this.room.map);
    this.zone.x = this.room.map.SUMO_ZONE.x; this.zone.z = this.room.map.SUMO_ZONE.z;
    for (const p of this.room.players.values()) { p.sumoDead = false; p.sumoOutAt = 0; }
    this.room.broadcast({ t: MSG.EFFECT, type: 'sumo_round', round: this.round });
    this.room.feed(`🥋 Round ${this.round} — stay inside the circle!`);
  }
  alive() { return [...this.room.players.values()].filter((p) => !p.sumoDead); }
  eliminate(p, why) {
    if (p.sumoDead || this.restUntil) return;
    p.sumoDead = true;
    p.sumoOutAt = 0;
    this.order.push(p.id);
    p.score += this.cfg.placeScore * (this.order.length - 1);
    this.room.feed(`💀 ${p.name} is out${why ? ` (${why})` : ''}`);
    this.room.broadcast({ t: MSG.EFFECT, type: 'sumo_out', id: p.id });
    this.room.scoreChanged();
    const alive = this.alive();
    if (alive.length <= 1) this.endRound(alive);
  }
  endRound(survivors) {
    const nOut = this.order.length;
    for (const p of survivors) {
      p.score += this.cfg.placeScore * nOut + this.cfg.winBonus;
      this.room.feed(`🏆 ${p.name} wins round ${this.round}!`);
    }
    this.room.scoreChanged();
    this.restUntil = now() + this.cfg.restSeconds * 1000;
  }
  update() {
    const t = now();
    if (!this.round) { this.startRound(); return; }
    if (this.restUntil) {
      if (t >= this.restUntil) { this.restUntil = 0; this.startRound(); }
      return;
    }
    // round timeout: everyone still alive shares the win
    if (t >= this.roundEndsAt) { this.endRound(this.alive()); return; }
    // linear shrink over the round
    const frac = 1 - Math.max(0, (this.roundEndsAt - t) / (this.cfg.roundSeconds * 1000));
    this.zone.r = this.room.map.SUMO_ZONE.r0 + (this.room.map.SUMO_ZONE.r1 - this.room.map.SUMO_ZONE.r0) * frac;
    const c = sumoCenter(this.room.map.SUMO_ZONE, this.target, frac);
    this.zone.x = c.x; this.zone.z = c.z;
    for (const p of this.room.players.values()) {
      if (p.sumoDead) continue;
      if (Math.hypot(p.p[0] - this.zone.x, p.p[2] - this.zone.z) <= this.zone.r) {
        p.sumoOutAt = 0;
      } else if (!p.sumoOutAt) {
        p.sumoOutAt = t;
      } else if (t - p.sumoOutAt > this.cfg.outSeconds * 1000) {
        this.eliminate(p, 'left the ring');
      }
    }
  }
  onHit() {}
  // only a real fall eliminates — a flipped car pressing R (or the client's
  // auto-recovery respawn) inside the ring is not "out"
  onFall(p) { if (p.p[1] < -6) this.eliminate(p, 'gravity'); }
  onJoin(p) { p.sumoDead = true; } // drop-ins wait for the next round
  onLeave() {
    const alive = this.alive();
    if (this.round && !this.restUntil && alive.length <= 1) this.endRound(alive);
  }
  rocketTarget(player) {
    return this.room.nearest(player, this.alive().filter((p) => p.id !== player.id));
  }
  snapshot() {
    const t = now();
    const out = [];
    for (const p of this.room.players.values()) {
      if (!p.sumoDead && p.sumoOutAt) {
        out.push([p.id, Math.max(0, Math.round((this.cfg.outSeconds * 1000 - (t - p.sumoOutAt)) / 100))]);
      }
    }
    return { zone: { x: this.zone.x, z: this.zone.z, r: this.zone.r }, sumo: { round: this.round, out } };
  }
}
