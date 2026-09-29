// Server-side bots so the office is never empty. They lap the racing line,
// chase beans/batteries/balls with a poor-man's navmesh (the racing line
// doubles as a corridor graph), grab powerups and generally cause trouble.
import {
  CARS, CAR_IDS, CHECKPOINT_RADIUS,
  COSMETIC_IDS, PAINT_COLORS, randomStyle, randomTune, tunedStats,
  POWERUP_EFFECT as FX, BATTERY_SPEED_PENALTY, BOOST_MAX, BOOST_REGEN, BOOST_DRAIN, BOOST_TOP_MULT,
  DRIFT_TIER_BOOST_S, driftStep, isDrifting, newDriftState, raceBotPath, SURFACES, surfaceAt,
} from '@rc/shared';
import { shouldUseItem, padWorthDetour } from './botbrain.js';
import { wallBoxesOf, lineBlocked, navTo } from './nav.js';

const BOT_NAMES = [
  'Stapler', 'Karen from HR', 'The Intern', 'Deskzilla', 'Mr. Mondays',
  'Spreadsheet', 'Toner Ghost', 'Sir Meetings', 'KPI Krusher', 'Lil Lanyard',
];

const now = () => Date.now();

const BOT_TURBO_S = 1.5; // how long a turbo item surges a bot
const HOP_S = 0.9, HOP_H = 2.4; // spring item: air time and apex (units)
const OIL_SLIDE_S = 0.6; // a bot keeps sliding this long after leaving oil
const BOT_DRIFT_MIN_DIST = 8; // no drifting at targets closer than this
const SUMO_HUNT_RANGE = 10; // a sumo bot goes after rivals this close (units)
const NAV_MODES = new Set(['koth', 'sumo', 'last_standing']); // goals routed over the door graph (nav.js)

function nearestWp(x, z, path) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i].x - x, path[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export class Bots {
  constructor(room) {
    this.room = room;
    this.n = 0;
    // RC_BOT_ITEMS=off keeps items out of bots' hands. For scripted tests of
    // mode plumbing: a bot's Position Swap teleports a scripted client that
    // never reports again, and the check it was running fails at random.
    this.items = process.env.RC_BOT_ITEMS !== 'off';
  }

  fillTo(count) {
    const current = this.room.players.size;
    for (let i = current; i < count; i++) this.add();
  }

  add() {
    const id = `bot${++this.n}`;
    const name = BOT_NAMES[(this.n - 1) % BOT_NAMES.length];
    const car = CAR_IDS[Math.floor(Math.random() * CAR_IDS.length)];
    // plain name — UI surfaces mark bots with their own vector icon, and the
    // in-world nameplate adds its own robot prefix (RemoteCars)
    const p = this.room.makePlayer(id, null, { name, car, style: randomStyle(), tune: randomTune() });
    p.bot = true;
    p.ready = true;
    // bots dress up too — hats and paints keep a bot lobby colorful
    if (Math.random() < 0.5) p.paint = PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)];
    if (Math.random() < 0.35) p.cos = { hat: COSMETIC_IDS.hat[Math.floor(Math.random() * COSMETIC_IDS.hat.length)] };
    p.heading = -Math.PI / 2;
    p.speed = 0;
    p.wp = 0;
    p.skill = 0.62 + Math.random() * 0.26; // beatable by humans learning the map
    p.stuckT = 0;
    p.kick = { x: 0, z: 0 }; // knockback velocity from bumps/rockets
    p.boost = BOOST_MAX;
    p.drift = newDriftState();
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
    for (const b of wallBoxesOf(this.room.map)) {
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
      if (!p.bot || p.eliminated) continue;
      this.applyKick(p, dt);
      if (p.stunUntil > t) { p.speed *= 0.9; continue; }
      const target = this.pickTarget(p);
      this.drive(p, target, dt);
      if (p.powerup) {
        if (!p.itemAt) p.itemAt = t;
        if (shouldUseItem(p.powerup, this.situation(p, t))) {
          p.itemAt = 0;
          this.room.usePowerup(p);
        }
      }
    }
    this.separate();
  }

  // Bots have no collision shapes, so without this they drive through each
  // other and stack on shared targets (zone centres, the ball). Push each bot
  // out of every other car's personal space — full strength against humans
  // (whose physics the server never moves), half against fellow bots.
  separate() {
    const all = [...this.room.players.values()];
    for (const b of all) {
      if (!b.bot) continue;
      for (const o of all) {
        if (o === b) continue;
        const dx = b.p[0] - o.p[0], dz = b.p[2] - o.p[2];
        const d = Math.hypot(dx, dz);
        const minD = 1.05;
        if (d >= minD) continue;
        if (d < 1e-4) { b.p[0] += 0.1; continue; }
        const push = (minD - d) * (o.bot ? 0.5 : 1);
        let px = b.p[0] + (dx / d) * push, pz = b.p[2] + (dz / d) * push;
        for (const w of wallBoxesOf(this.room.map)) {
          if (px > w.minX && px < w.maxX && pz > w.minZ && pz < w.maxZ) {
            const dl = px - w.minX, drr = w.maxX - px, dtp = pz - w.minZ, dbt = w.maxZ - pz;
            const m = Math.min(dl, drr, dtp, dbt);
            if (m === dl) px = w.minX; else if (m === drr) px = w.maxX;
            else if (m === dtp) pz = w.minZ; else pz = w.maxZ;
          }
        }
        b.p[0] = px; b.p[2] = pz;
      }
    }
  }

  // The room calls this after a bot fires an item: the effects that humans
  // get from their own client physics (turbo surge, spring launch) have to be
  // applied here, or a bot's turbo is a sound effect and nothing else.
  onItemUsed(p, item, t) {
    if (item === 'turbo') {
      p.boost = BOOST_MAX;
      p.boostUntil = Math.max(p.boostUntil || 0, t + BOT_TURBO_S * 1000);
      p.speed += 6;
    } else if (item === 'spring') {
      p.hopAt = t;
    }
  }

  // The racing line this round: reversed for a Reverse Desk Dash, the
  // classic loop otherwise (it doubles as the corridor graph for every mode).
  path() {
    return raceBotPath(this.room.modeId === 'desk_dash' ? this.room.variant : 'classic', this.room.map);
  }

  // Where does this bot want to go, given the mode?
  pickTarget(p) {
    const PATH = this.path();
    const mode = this.room.mode;
    const modeId = this.room.modeId;
    let goal = null;
    if (modeId === 'coffee_run' && mode) {
      if (p.beans >= 4) {
        goal = { x: this.room.map.COFFEE_MACHINE.deliverX, z: this.room.map.COFFEE_MACHINE.deliverZ };
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
    } else if (modeId === 'last_standing' && mode) {
      const bad = (id) => mode.locked.includes(id) || mode.warn?.room === id;
      const myRoom = this.room.map.roomAt(p.p[0], p.p[2]);
      if (myRoom && bad(myRoom.id)) {
        // flee to the nearest room that's still open
        let best = null, bd = Infinity;
        for (const r of this.room.map.ROOMS) {
          if (bad(r.id)) continue;
          const d = Math.hypot(r.x - p.p[0], r.z - p.p[2]);
          if (d < bd) { bd = d; best = r; }
        }
        if (best) goal = { x: best.x, z: best.z };
      } else {
        // cruise the racing line, skipping waypoints inside closed rooms
        for (let k = 0; k < PATH.length; k++) {
          const wp = PATH[p.wp % PATH.length];
          const rm = this.room.map.roomAt(wp.x, wp.z);
          if (!rm || !bad(rm.id)) break;
          p.wp = (p.wp + 1) % PATH.length;
        }
      }
    } else if (modeId === 'soccer' && mode) {
      const ball = mode.ball;
      // Aim slightly behind the ball relative to the opposing goal
      const opp = this.room.map.SOCCER.goals[1 - p.team];
      const gx = opp.x, gz = opp.z;
      const dx = ball.p[0] - gx, dz = ball.p[2] - gz;
      const len = Math.hypot(dx, dz) || 1;
      goal = { x: ball.p[0] + (dx / len) * 1.2, z: ball.p[2] + (dz / len) * 1.2 };
    } else if (modeId === 'koth' && mode) {
      // park inside the zone, spread out on a per-bot orbit angle
      const z = mode.zonePos();
      const a = this.botAngle(p);
      goal = { x: z.x + Math.cos(a) * 3, z: z.z + Math.sin(a) * 3 };
    } else if (modeId === 'tag' && mode) {
      if (mode.it === p.id) {
        goal = null; // flee along the racing line
      } else {
        const it = this.room.players.get(mode.it);
        if (it) goal = { x: it.p[0], z: it.p[2] };
      }
    } else if (modeId === 'sumo' && mode) {
      if (p.sumoDead) {
        goal = null; // cruise the racing line as a mobile chicane
      } else {
        goal = this.sumoGoal(p, mode);
      }
    } else if (modeId === 'desk_dash' && !p.finished) {
      // The race line is a driving line, not the checkpoint list: bots swap
      // to the next waypoint 5 units out, so on a tight corner they cut
      // inside a checkpoint and miss it — the balcony corner (#15) cost every
      // bot every lap, and races ended with the bots still on lap one.
      // Once the next checkpoint is close and in sight, drive through it.
      const cps = mode?.cps || this.room.map.CHECKPOINTS;
      const cp = cps[p.nextCp % cps.length];
      if (Math.hypot(cp.x - p.p[0], cp.z - p.p[2]) < CHECKPOINT_RADIUS + 6
          && !lineBlocked(wallBoxesOf(this.room.map), p.p[0], p.p[2], cp.x, cp.z)) goal = cp;
    }
    // Every item pad sits 2-29 units off the race line and the pickup radius
    // is 1.6, so a bot that only follows the line never holds an item.
    // Grab one when it's close, ahead and roughly on the way.
    const pad = this.padTarget(p, goal);
    if (pad) return pad;
    if (!goal) return this.followRaceLine(p);
    // the zone modes route through doors: a zone behind a wall is reached
    // round it, not by jamming against it at the nearest racing-line point
    if (NAV_MODES.has(modeId)) return navTo(this.room.map, { x: p.p[0], z: p.p[2] }, goal);
    // Navigate: direct if clear, else route along the path loop
    if (!lineBlocked(wallBoxesOf(this.room.map), p.p[0], p.p[2], goal.x, goal.z)) return goal;
    const wpB = nearestWp(goal.x, goal.z, PATH);
    let wpA = nearestWp(p.p[0], p.p[2], PATH);
    const N = PATH.length;
    const fwd = (wpB - wpA + N) % N;
    const dir = fwd <= N / 2 ? 1 : -1;
    let next = (wpA + dir + N) % N;
    // skip waypoints we can already see past
    for (let k = 0; k < 3; k++) {
      const peek = (next + dir + N) % N;
      if (peek === wpB) break;
      if (!lineBlocked(wallBoxesOf(this.room.map), p.p[0], p.p[2], PATH[peek].x, PATH[peek].z)) next = peek;
      else break;
    }
    return PATH[next];
  }

  // The world as the item logic needs it, in the bot's own frame.
  situation(p, t) {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const pv = p.v || [0, 0, 0];
    const rivals = [];
    for (const o of this.room.players.values()) {
      if (o === p || o.eliminated) continue;
      if (this.room.modeId === 'soccer' && o.team === p.team) continue;
      const dx = o.p[0] - p.p[0], dz = o.p[2] - p.p[2];
      const dist = Math.hypot(dx, dz) || 1e-3;
      const ov = o.v || [0, 0, 0];
      rivals.push({
        ahead: dx * fx + dz * fz,
        lateral: dx * fz - dz * fx,
        dist,
        closing: ((ov[0] - pv[0]) * -dx + (ov[2] - pv[2]) * -dz) / dist,
        exposed: !(o.shieldUntil > t) && !(o.spawnProtectUntil > t),
      });
    }
    let incomingRocketDist = Infinity;
    for (const r of this.room.rockets) {
      if (r.target !== p.id || r.dead) continue;
      incomingRocketDist = Math.min(incomingRocketDist, Math.hypot(r.p[0] - p.p[0], r.p[2] - p.p[2]));
    }
    const order = [...this.room.players.values()].filter((o) => !o.eliminated).sort((a, b) => b.score - a.score);
    const rank = order.length > 1 ? order.indexOf(p) / (order.length - 1) : 0;
    const top = p.tuned?.topSpeed || 16;
    return {
      held: (t - (p.itemAt || t)) / 1000,
      rivals,
      incomingRocketDist,
      rank,
      aligned: Math.abs(p.lastDh || 0) < 0.2,
      speedFrac: p.speed / top,
    };
  }

  // A ready pad worth the detour, if the bot's hands are empty.
  padTarget(p, goal) {
    if (!this.items || p.powerup || p.hasBattery || p.sumoDead) return null;
    const t = now();
    const me = { x: p.p[0], z: p.p[2], heading: p.heading };
    let best = null, bd = Infinity;
    for (const pad of this.room.pads) {
      if (t < pad.readyAt) continue;
      if (!padWorthDetour(me, pad, goal)) continue;
      const d = Math.hypot(pad.x - me.x, pad.z - me.z);
      if (d < bd && !lineBlocked(wallBoxesOf(this.room.map), me.x, me.z, pad.x, pad.z)) { bd = d; best = pad; }
    }
    return best;
  }

  // Sumo is a shoving match: stay well inside the ring, and when a rival is
  // close, drive through it toward the ring's edge — away from the centre —
  // so contact knocks it outward. A bot near the edge heads back in first.
  sumoGoal(p, mode) {
    const z = mode.zone;
    const a = this.botAngle(p);
    const mine = Math.hypot(p.p[0] - z.x, p.p[2] - z.z);
    if (mine > z.r * 0.75) return { x: z.x + Math.cos(a) * z.r * 0.3, z: z.z + Math.sin(a) * z.r * 0.3 };
    let prey = null, bd = Math.max(SUMO_HUNT_RANGE, z.r * 0.6);
    for (const o of this.room.players.values()) {
      if (o === p || o.sumoDead) continue;
      const d = Math.hypot(o.p[0] - p.p[0], o.p[2] - p.p[2]);
      if (d < bd) { bd = d; prey = o; }
    }
    if (prey) {
      let ox = prey.p[0] - z.x, oz = prey.p[2] - z.z;
      const ol = Math.hypot(ox, oz);
      // prey dead centre: push it along our own line of attack instead
      if (ol < 0.5) { ox = prey.p[0] - p.p[0]; oz = prey.p[2] - p.p[2]; }
      const l = Math.hypot(ox, oz) || 1;
      return { x: prey.p[0] + (ox / l) * 3, z: prey.p[2] + (oz / l) * 3 };
    }
    const r = Math.min(z.r * 0.5, 6);
    return { x: z.x + Math.cos(a) * r, z: z.z + Math.sin(a) * r };
  }

  // stable per-bot angle so zone-seeking bots spread out instead of stacking
  botAngle(p) {
    const seed = parseInt(p.id.replace(/\D/g, ''), 10) || 1;
    return seed * 2.4;
  }

  followRaceLine(p) {
    const PATH = this.path();
    // Advance past a waypoint once within 5 units of it — or once we're
    // already beyond it along the line (a detour to a checkpoint or a pad
    // can carry a bot past its waypoint without touching it, and aiming back
    // at it would turn the bot round).
    for (let k = 0; k < 3; k++) {
      const wp = PATH[p.wp % PATH.length];
      const nx = PATH[(p.wp + 1) % PATH.length];
      const tox = wp.x - p.p[0], toz = wp.z - p.p[2];
      const passed = tox * (nx.x - wp.x) + toz * (nx.z - wp.z) < 0 && Math.hypot(tox, toz) < 12;
      if (Math.hypot(tox, toz) < 5 || passed) p.wp = (p.wp + 1) % PATH.length;
      else break;
    }
    return PATH[p.wp % PATH.length];
  }

  drive(p, target, dt) {
    // bots run their own setup sheet, so a ballasted bot really is slower.
    // Resolved once per bot — car and sheet are fixed for its lifetime.
    const car = p.tuned || (p.tuned = tunedStats(CARS[p.car] || CARS.balanced, p.tune));
    const t = now();
    const desired = Math.atan2(target.x - p.p[0], target.z - p.p[2]);
    let dh = desired - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.lastDh = dh;

    // ---- what the floor and the items are doing to us: the same penalties
    // a human's client applies (LocalCar), which bots otherwise never felt —
    // an oil slick dropped on a bot did nothing at all
    let speedMul = p.hasBattery ? BATTERY_SPEED_PENALTY : 1;
    if (p.shrinkUntil > t) speedMul *= 0.85;
    // the same floors the players drive on: carpet is slower, hardwood quicker
    speedMul *= (SURFACES[surfaceAt(p.p[0], p.p[2], this.room.map).id] || SURFACES.concrete).top;
    for (const pu of this.room.puddles) {
      if (Math.hypot(p.p[0] - pu.x, p.p[2] - pu.z) >= FX.PUDDLE_RADIUS) continue;
      if (pu.kind === 'oil') p.oilUntil = t + OIL_SLIDE_S * 1000;
      else speedMul = Math.min(speedMul, 0.55);
    }
    const oiled = p.oilUntil > t;
    const airborne = p.hopAt && t - p.hopAt < HOP_S * 1000;

    // ---- drift: commit to a slide through real corners, hold it while the
    // corner lasts, cash the charge in as a mini-turbo on the way out — the
    // same state machine the player's car runs (shared/src/handling.js)
    if (!p.drift) p.drift = newDriftState();
    // Only for a corner on the way somewhere: a bot circling a nearby target
    // (the ball, a zone slot) has a big heading error too, and drifting there
    // turned sumo and soccer into doughnut contests.
    const targetDist = Math.hypot(target.x - p.p[0], target.z - p.p[2]);
    const wantDrift = !oiled && targetDist > BOT_DRIFT_MIN_DIST && Math.abs(dh) > (p.drift.active ? 0.22 : 0.5);
    const drifting = isDrifting(p.drift, wantDrift, !airborne, p.speed, p.speed);
    const dr = driftStep(p.drift, { drifting, driftHeld: wantDrift, grounded: !airborne, steering: true, overdrift: false }, dt);
    if (dr.release) p.boostUntil = Math.max(p.boostUntil || 0, t + DRIFT_TIER_BOOST_S[dr.release - 1] * 1000);

    // ---- steering: a drift turns tighter (×1.45, as for players); oil
    // takes the steering away and the car wanders
    let turnRate = car.handling * 1.15 * p.skill * (drifting ? 1.45 : 1);
    if (oiled) {
      turnRate *= 0.35;
      p.heading += (Math.random() - 0.5) * 2.4 * dt;
    }
    if (airborne) turnRate = 0;
    p.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, dh));

    // ---- boost: spend the meter on straights, never into a corner
    if (p.boost === undefined) p.boost = BOOST_MAX;
    if (!p.boosting && Math.abs(dh) < 0.12 && p.speed > car.topSpeed * p.skill * 0.8 && p.boost > 45) p.boosting = true;
    if (p.boosting && (p.boost < 5 || Math.abs(dh) > 0.35)) p.boosting = false;
    if (p.boosting) p.boost = Math.max(0, p.boost - BOOST_DRAIN * dt);
    else if (!airborne) p.boost = Math.min(BOOST_MAX, p.boost + BOOST_REGEN * dt);
    const boosting = p.boosting || p.boostUntil > t;
    p.boostingNow = boosting;

    // slow down for corners (a drift carries more speed through), add a
    // little human wobble
    const cornerFactor = 1 - Math.min(drifting ? 0.38 : 0.62, Math.abs(dh) * 0.85);
    const top = car.topSpeed * p.skill * speedMul * (boosting ? BOOST_TOP_MULT : 1);
    const targetSpeed = top * cornerFactor;
    const accel = car.accel * 0.9 + (boosting ? car.boost * 0.6 : 0);
    if (!airborne) p.speed += Math.max(-60 * dt, Math.min(accel * dt, targetSpeed - p.speed));
    const nx = p.p[0] + Math.sin(p.heading) * p.speed * dt;
    const nz = p.p[2] + Math.cos(p.heading) * p.speed * dt;
    // wall pushout so they never clip through
    let px = nx, pz = nz;
    for (const b of wallBoxesOf(this.room.map)) {
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
      const PATH = this.path();
      const wp = PATH[nearestWp(p.p[0], p.p[2], PATH)];
      px = wp.x; pz = wp.z; p.stuckT = 0; p.speed = 0;
      p.wp = nearestWp(px, pz, PATH);
    }
    p.v = [(px - p.p[0]) / dt, 0, (pz - p.p[2]) / dt];
    // ride height matches suspension sag; a spring item arcs it
    let y = 0.24;
    if (airborne) {
      const k = (t - p.hopAt) / (HOP_S * 1000);
      y += 4 * HOP_H * k * (1 - k);
    }
    p.p[0] = px; p.p[2] = pz; p.p[1] = y;
    p.drifting = drifting;
    p.grounded = !airborne;
    const half = p.heading / 2;
    p.q = [0, Math.sin(half), 0, Math.cos(half)];
  }
}
