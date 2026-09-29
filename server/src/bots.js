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
import { navOf } from './nav.js';

const BOT_NAMES = [
  'Stapler', 'Karen from HR', 'The Intern', 'Deskzilla', 'Mr. Mondays',
  'Spreadsheet', 'Toner Ghost', 'Sir Meetings', 'KPI Krusher', 'Lil Lanyard',
];

const now = () => Date.now();

const BOT_TURBO_S = 1.5; // how long a turbo item surges a bot
const HOP_S = 0.9, HOP_H = 2.4; // spring item: air time and apex (units)
const OIL_SLIDE_S = 0.6; // a bot keeps sliding this long after leaving oil
const BOT_DRIFT_MIN_DIST = 8; // no drifting at targets closer than this
// modes whose goals can be anywhere on the floor route on the nav grid
const GRID_NAV_MODES = new Set(['coffee_run', 'battery', 'soccer', 'tag']);
const BOT_CONTACT = 1.05; // centre distance that counts as two bots touching (separate()'s personal space)
const SOCCER_LINED_UP = 0.7; // cos of the angle behind the ball a striker attacks from

// Wall AABBs (padded by a car's half-width) per map, built once.
const boxCache = new WeakMap();
function wallBoxesOf(map) {
  let b = boxCache.get(map);
  if (!b) {
    b = map.WALLS.filter((w) => !w.low).map((w) => ({
      minX: w.x - w.w / 2 - 0.35, maxX: w.x + w.w / 2 + 0.35,
      minZ: w.z - w.d / 2 - 0.35, maxZ: w.z + w.d / 2 + 0.35,
    }));
    boxCache.set(map, b);
  }
  return b;
}

function lineBlocked(wallBoxes, x1, z1, x2, z2) {
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

function nearestWp(x, z, path) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i].x - x, path[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Which segment of the bots' line (waypoint i → i+1) carries each
// checkpoint, walking the line in lap order: the first segment after the
// previous checkpoint's that passes within reach, else the nearest. A
// checkpoint the line crosses twice (the cellar crossroads) gets the pass
// that counts. Cached per (line, checkpoint list).
const segCache = new WeakMap();
function segDist(c, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / L));
  return Math.hypot(c.x - (a.x + dx * t), c.z - (a.z + dz * t));
}
function cpSegments(path, cps) {
  let byCps = segCache.get(path);
  if (!byCps) segCache.set(path, (byCps = new WeakMap()));
  let segs = byCps.get(cps);
  if (segs) return segs;
  segs = [];
  const N = path.length;
  let from = 0;
  for (const c of cps) {
    let pick = -1, best = -1, bd = Infinity;
    for (let k = 0; k < N; k++) {
      const i = (from + k) % N;
      const d = segDist(c, path[i], path[(i + 1) % N]);
      if (d < 1.5) { pick = i; break; }
      if (d < bd) { bd = d; best = i; }
    }
    from = pick >= 0 ? pick : best;
    segs.push(from);
  }
  byCps.set(cps, segs);
  return segs;
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
    this.contacts();
    this.separate();
  }

  // Bots have no client to report their contacts, so the server raises the
  // bot-vs-bot ones (before separate() pushes them apart). Bot-vs-human is
  // left to the human's client, whose real colliders saw the contact — this
  // circle would echo knockback for touches that never happened. onBump
  // decides who hit whom and owns the per-pair cooldowns.
  contacts() {
    const bots = [...this.room.players.values()].filter((p) => p.bot && !p.eliminated);
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) {
        const a = bots[i], b = bots[j];
        if (Math.abs(a.p[1] - b.p[1]) > 1) continue; // one is hopping over the other
        if (Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]) < BOT_CONTACT) this.room.onBump(a, b);
      }
    }
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
        const minD = BOT_CONTACT;
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
      const c = b.carrier && this.room.players.get(b.carrier);
      if (b.carrier === p.id) goal = null; // run the lap while holding it
      else goal = c ? this.intercept(p, c) : { x: b.x, z: b.z };
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
      goal = this.soccerTarget(p, mode);
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
        const z = mode.zone;
        const a = this.botAngle(p);
        const r = Math.min(z.r * 0.5, 6);
        goal = { x: z.x + Math.cos(a) * r, z: z.z + Math.sin(a) * r };
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
    // Navigate: direct if clear, else route along the path loop
    if (!lineBlocked(wallBoxesOf(this.room.map), p.p[0], p.p[2], goal.x, goal.z)) return goal;
    // Chasing a thing (beans, the machine, the battery, the ball, It): the
    // grid finds rooms the racing line never enters
    if (GRID_NAV_MODES.has(modeId)) {
      const boxes = wallBoxesOf(this.room.map);
      const wp = navOf(this.room.map).toward(p.p[0], p.p[2], goal.x, goal.z, (x1, z1, x2, z2) => lineBlocked(boxes, x1, z1, x2, z2));
      if (wp) return wp;
    }
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

  // Line up behind the ball, then drive into it at the goal. Aiming at a
  // point just behind the ball (inside kick reach) from the wrong side kicked
  // it into the bot's own goal: 30-40 % of all goals were own goals. So the
  // striker on the goal side swings round the ball's flank, clear of its
  // reach, until it is behind it — and only then attacks. The rest of the
  // team don't all pile in (six cars on the ball is a scrum nobody scores
  // from): the next one backs up the striker, the others keep goal.
  soccerTarget(p, mode) {
    const ball = mode.ball;
    const goals = this.room.map.SOCCER.goals;
    const opp = goals.find((g) => g.team !== p.team) || goals[0];
    const own = goals.find((g) => g.team === p.team) || goals[1];
    let ux = ball.p[0] - opp.x, uz = ball.p[2] - opp.z; // goal → ball: "behind" the ball
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul; uz /= ul;
    const reach = mode.R + 0.75;
    const set = reach + 1.5;
    // role by distance to the ball within the team (humans count)
    const d = (q) => Math.hypot(q.p[0] - ball.p[0], q.p[2] - ball.p[2]);
    const mine = d(p);
    let rank = 0;
    for (const q of this.room.players.values()) {
      if (q !== p && q.team === p.team && !q.eliminated && (d(q) < mine || (d(q) === mine && q.id < p.id))) rank++;
    }
    if (rank >= 2) {
      // keeper: on the line from our goal to the ball, a few metres out
      const kx = ball.p[0] - own.x, kz = ball.p[2] - own.z;
      const kl = Math.hypot(kx, kz) || 1;
      const out = Math.min(kl * 0.5, 8 + (rank - 2) * 5);
      return { x: own.x + (kx / kl) * out, z: own.z + (kz / kl) * out };
    }
    const bx = p.p[0] - ball.p[0], bz = p.p[2] - ball.p[2];
    const bl = Math.hypot(bx, bz) || 1;
    const behind = (bx * ux + bz * uz) / bl;
    // lined up: aim just behind the ball on the goal line, so the car meets
    // it square from behind and the kick goes goalward. The support car
    // hangs back behind the play instead, ready for the rebound.
    if (rank === 0 && behind > SOCCER_LINED_UP) return { x: ball.p[0] + ux * 1.2, z: ball.p[2] + uz * 1.2 };
    if (behind > 0) {
      const back = rank === 0 ? set : set + 4;
      return { x: ball.p[0] + ux * back, z: ball.p[2] + uz * back };
    }
    // goal side: round the flank this bot is already on
    const side = bx * -uz + bz * ux >= 0 ? 1 : -1;
    return { x: ball.p[0] + (-uz * side + ux * 0.5) * set, z: ball.p[2] + (ux * side + uz * 0.5) * set };
  }

  // Where to aim for a battery carrier: where it's going to be. Tailing it
  // closes only at the speed the battery costs it — a rub, never a hit — so
  // a chaser aiming at its current spot could follow it for minutes (one bot
  // kept the battery 164 s of 180). You're It keeps the plain chase: there
  // any rub tags, and fleeing is meant to be the skill.
  intercept(p, target) {
    const d = Math.hypot(target.p[0] - p.p[0], target.p[2] - p.p[2]);
    const lead = Math.min(1.2, d / Math.max(8, p.speed || 0));
    const v = target.v || [0, 0, 0];
    return { x: target.p[0] + v[0] * lead, z: target.p[2] + v[2] * lead };
  }

  // The world as the item logic needs it, in the bot's own frame.
  situation(p, t) {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const pv = p.v || [0, 0, 0];
    const rivals = [];
    for (const o of this.room.players.values()) {
      if (o === p || o.eliminated || o.finished) continue; // a finished racer is no target
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
    if (!this.items || p.powerup || p.hasBattery) return null;
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

  // Put a racing bot's line waypoint back in step with its race progress
  // after it moved without driving there (a Position Swap, a stuck hop):
  // the nearest waypoint between its last checkpoint and its next, aimed
  // at. Without this it drove back to the waypoint it had before — on the
  // cellar figure-8 that was most of a lap. False when not racing.
  resync(p, x = p.p[0], z = p.p[2]) {
    const cps = this.room.mode?.cps;
    if (this.room.modeId !== 'desk_dash' || !cps || p.finished) return false;
    const PATH = this.path(), N = PATH.length, n = cps.length;
    const segs = cpSegments(PATH, cps);
    const from = (segs[(p.nextCp - 1 + n) % n] + 1) % N;
    const to = (segs[p.nextCp % n] + 1) % N;
    let best = from, bd = Infinity;
    for (let k = 0, i = from; k <= N; k++, i = (i + 1) % N) {
      const d = Math.hypot(PATH[i].x - x, PATH[i].z - z);
      if (d < bd) { bd = d; best = i; }
      if (i === to) break;
    }
    if (bd < 5) best = (best + 1) % N; // on it already: aim down the line
    p.wp = best;
    p.heading = Math.atan2(PATH[best].x - x, PATH[best].z - z);
    return true;
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
      // recover: hop to the nearest racing-line waypoint — in a race, the
      // nearest one on the stretch to the next checkpoint, not one past it
      const PATH = this.path();
      const wp = this.resync(p) ? PATH[p.wp] : PATH[nearestWp(p.p[0], p.p[2], PATH)];
      px = wp.x; pz = wp.z; p.stuckT = 0; p.speed = 0;
      if (!this.resync(p, px, pz)) p.wp = nearestWp(px, pz, PATH);
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
