// Server-side bots so the office is never empty. They lap the racing line,
// chase beans/batteries/balls with a poor-man's navmesh (the racing line
// doubles as a corridor graph), grab powerups and generally cause trouble.
import { BOT_PATH, WALLS, CARS, CAR_IDS, COFFEE_MACHINE, SOCCER, randomStyle } from '@rc/shared';

const BOT_NAMES = [
  'Stapler', 'Karen from HR', 'The Intern', 'Deskzilla', 'Mr. Mondays',
  'Spreadsheet', 'Toner Ghost', 'Sir Meetings', 'KPI Krusher', 'Lil Lanyard',
];

const now = () => Date.now();

const wallBoxes = WALLS.filter((w) => !w.low).map((w) => ({
  minX: w.x - w.w / 2 - 0.35, maxX: w.x + w.w / 2 + 0.35,
  minZ: w.z - w.d / 2 - 0.35, maxZ: w.z + w.d / 2 + 0.35,
}));

function lineBlocked(x1, z1, x2, z2) {
  // sampled 2D segment vs wall AABBs — cheap and good enough for nav
  const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.5) + 1;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const b of wallBoxes) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
  }
  return false;
}

function nearestWp(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < BOT_PATH.length; i++) {
    const d = Math.hypot(BOT_PATH[i].x - x, BOT_PATH[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export class Bots {
  constructor(room) {
    this.room = room;
    this.n = 0;
  }

  fillTo(count) {
    const current = this.room.players.size;
    for (let i = current; i < count; i++) this.add();
  }

  add() {
    const id = `bot${++this.n}`;
    const name = BOT_NAMES[(this.n - 1) % BOT_NAMES.length];
    const car = CAR_IDS[Math.floor(Math.random() * CAR_IDS.length)];
    const p = this.room.makePlayer(id, null, { name: `🤖 ${name}`, car, style: randomStyle() });
    p.bot = true;
    p.ready = true;
    p.heading = -Math.PI / 2;
    p.speed = 0;
    p.wp = 0;
    p.skill = 0.62 + Math.random() * 0.26; // beatable by humans learning the map
    p.stuckT = 0;
    p.kick = { x: 0, z: 0 }; // knockback velocity from bumps/rockets
    this.room.players.set(id, p);
  }

  clear() {
    for (const [id, p] of this.room.players) if (p.bot) this.room.players.delete(id);
  }

  // Knockback makes bots feel physical: bumps and rockets shove them off
  // their line, wall pushout still applies, and it decays like friction.
  applyKick(p, dt) {
    const k = p.kick;
    if (!k || (Math.abs(k.x) < 0.05 && Math.abs(k.z) < 0.05)) return;
    let px = p.p[0] + k.x * dt, pz = p.p[2] + k.z * dt;
    for (const b of wallBoxes) {
      if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ) {
        const dl = px - b.minX, drr = b.maxX - px, dtp = pz - b.minZ, dbt = b.maxZ - pz;
        const m = Math.min(dl, drr, dtp, dbt);
        if (m === dl) px = b.minX; else if (m === drr) px = b.maxX;
        else if (m === dtp) pz = b.minZ; else pz = b.maxZ;
      }
    }
    p.p[0] = px; p.p[2] = pz;
    const decay = Math.max(0, 1 - dt * 2.6);
    k.x *= decay; k.z *= decay;
  }

  update(dt) {
    const t = now();
    for (const p of this.room.players.values()) {
      if (!p.bot) continue;
      this.applyKick(p, dt);
      if (p.stunUntil > t) { p.speed *= 0.9; continue; }
      const target = this.pickTarget(p);
      this.drive(p, target, dt);
      if (p.powerup && p.botUseAt && t > p.botUseAt) {
        p.botUseAt = 0;
        this.room.usePowerup(p);
      }
    }
  }

  // Where does this bot want to go, given the mode?
  pickTarget(p) {
    const mode = this.room.mode;
    const modeId = this.room.modeId;
    let goal = null;
    if (modeId === 'coffee_run' && mode) {
      if (p.beans >= 4) {
        goal = { x: COFFEE_MACHINE.deliverX, z: COFFEE_MACHINE.deliverZ };
      } else {
        let bd = Infinity;
        for (const b of mode.beans) {
          if (!b.alive) continue;
          const d = Math.hypot(b.x - p.p[0], b.z - p.p[2]);
          if (d < bd) { bd = d; goal = { x: b.x, z: b.z }; }
        }
      }
    } else if (modeId === 'battery' && mode) {
      const b = mode.battery;
      if (b.carrier === p.id) goal = null; // run the lap while holding it
      else goal = { x: b.x, z: b.z };
    } else if (modeId === 'soccer' && mode) {
      const ball = mode.ball;
      // Aim slightly behind the ball relative to the opposing goal
      const opp = SOCCER.goals[1 - p.team];
      const gx = opp.x, gz = opp.z;
      const dx = ball.p[0] - gx, dz = ball.p[2] - gz;
      const len = Math.hypot(dx, dz) || 1;
      goal = { x: ball.p[0] + (dx / len) * 1.2, z: ball.p[2] + (dz / len) * 1.2 };
    }
    if (!goal) return this.followRaceLine(p);
    // Navigate: direct if clear, else route along the path loop
    if (!lineBlocked(p.p[0], p.p[2], goal.x, goal.z)) return goal;
    const wpB = nearestWp(goal.x, goal.z);
    let wpA = nearestWp(p.p[0], p.p[2]);
    const N = BOT_PATH.length;
    const fwd = (wpB - wpA + N) % N;
    const dir = fwd <= N / 2 ? 1 : -1;
    let next = (wpA + dir + N) % N;
    // skip waypoints we can already see past
    for (let k = 0; k < 3; k++) {
      const peek = (next + dir + N) % N;
      if (peek === wpB) break;
      if (!lineBlocked(p.p[0], p.p[2], BOT_PATH[peek].x, BOT_PATH[peek].z)) next = peek;
      else break;
    }
    return BOT_PATH[next];
  }

  followRaceLine(p) {
    const wp = BOT_PATH[p.wp % BOT_PATH.length];
    if (Math.hypot(wp.x - p.p[0], wp.z - p.p[2]) < 5) p.wp = (p.wp + 1) % BOT_PATH.length;
    return BOT_PATH[p.wp % BOT_PATH.length];
  }

  drive(p, target, dt) {
    const car = CARS[p.car];
    const desired = Math.atan2(target.x - p.p[0], target.z - p.p[2]);
    let dh = desired - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const turnRate = car.handling * 1.15 * p.skill;
    p.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, dh));
    // slow down for corners, add a little human wobble
    const cornerFactor = 1 - Math.min(0.62, Math.abs(dh) * 0.85);
    const top = car.topSpeed * p.skill * (p.hasBattery ? 0.72 : 1);
    const targetSpeed = top * cornerFactor;
    p.speed += Math.max(-60 * dt, Math.min(car.accel * 0.9 * dt, targetSpeed - p.speed));
    const nx = p.p[0] + Math.sin(p.heading) * p.speed * dt;
    const nz = p.p[2] + Math.cos(p.heading) * p.speed * dt;
    // wall pushout so they never clip through
    let px = nx, pz = nz;
    for (const b of wallBoxes) {
      if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ) {
        const dl = px - b.minX, drr = b.maxX - px, dtp = pz - b.minZ, dbt = b.maxZ - pz;
        const m = Math.min(dl, drr, dtp, dbt);
        if (m === dl) px = b.minX; else if (m === drr) px = b.maxX;
        else if (m === dtp) pz = b.minZ; else pz = b.maxZ;
        p.stuckT += dt;
      }
    }
    const moved = Math.hypot(px - p.p[0], pz - p.p[2]);
    if (moved < p.speed * dt * 0.3 && p.speed > 5) p.stuckT += dt; else p.stuckT = Math.max(0, p.stuckT - dt);
    if (p.stuckT > 2.5) {
      // recover: hop to the nearest racing-line waypoint
      const wp = BOT_PATH[nearestWp(p.p[0], p.p[2])];
      px = wp.x; pz = wp.z; p.stuckT = 0; p.speed = 0;
      p.wp = nearestWp(px, pz);
    }
    p.v = [(px - p.p[0]) / dt, 0, (pz - p.p[2]) / dt];
    p.p[0] = px; p.p[2] = pz; p.p[1] = 0.24; // matches suspension sag ride height
    p.drifting = Math.abs(dh) > 0.7 && p.speed > 20;
    p.grounded = true;
    const half = p.heading / 2;
    p.q = [0, Math.sin(half), 0, Math.cos(half)];
  }
}
