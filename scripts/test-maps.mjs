// Every map, checked as geometry: the lap is drivable, nothing spawns inside
// a wall or a desk, the rooms tile the floor, and each map carries everything
// every mode needs. A map that fails here would fail as a bug report later.
import { MAPS, MAP_IDS, ALL_ROOM_IDS, isDecor, SURFACES, M, CHECKPOINT_RADIUS, MODE_IDS, KOTH_RADIUS } from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };

const KEYS = ['MAP_BOUNDS', 'WALL_HEIGHT', 'ROOMS', 'WALLS', 'FURNITURE', 'RAMPS', 'PROPS', 'SPAWNS', 'CHECKPOINTS',
  'BOT_PATH', 'BEAN_SPAWNS', 'COFFEE_MACHINE', 'BATTERY_SPAWN', 'SOCCER', 'KOTH_SPOTS', 'SUMO_ZONE', 'POWERUP_PADS',
  'VENDING', 'PRINTER', 'ROBOT_PATH', 'REVERSE_SPAWN_ROTY', 'BOARDS'];

check('maps: room ids are unique across every map (the snapshot sends them by index)', new Set(ALL_ROOM_IDS).size === ALL_ROOM_IDS.length);
check('maps: at most 255 rooms in all (one byte each in the snapshot)', ALL_ROOM_IDS.length < 255);
check('maps: there is more than one to choose from', MAP_IDS.length >= 2);

// point inside an axis-aligned box (furniture boxes ignore rotation, as the server does)
const inBox = (x, z, b, pad = 0) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;
const rotBox = (b) => {
  // rotated by a quarter turn → swap the footprint
  const q = Math.abs(Math.sin(b.rotY || 0)) > 0.7;
  return q ? { ...b, w: b.d, d: b.w } : b;
};

for (const id of MAP_IDS) {
  const map = MAPS[id];
  const B = map.MAP_BOUNDS;
  const solidWalls = map.WALLS.filter((w) => !w.low);
  // desks and tables are a top and four legs: cars drive under them (a map's
  // own drive-under pieces say so with { driveUnder: true })
  const UNDER = ['desk', 'table', 'ceodesk', 'workbench'];
  const solid = [...solidWalls, ...map.FURNITURE.filter((f) => !isDecor(f) && !UNDER.includes(f.type) && !f.driveUnder).map(rotBox)];
  const blocked = (x, z, pad = 0) => solid.some((b) => inBox(x, z, b, pad));
  const inside = (x, z) => x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ;
  const tag = `${id}:`;

  check(`${tag} carries every key a mode needs`, KEYS.every((k) => map[k] !== undefined));
  check(`${tag} every room floor has a surface`, map.ROOMS.every((r) => SURFACES[r.floor]));
  // the rooms tile the floor: sample a grid, every indoor point is in exactly one room
  {
    let gaps = 0, overlaps = 0;
    for (let x = B.minX + 0.5; x < B.maxX; x += 2) {
      for (let z = B.minZ + 0.5; z < B.maxZ; z += 2) {
        const n = map.ROOMS.filter((r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2).length;
        if (n === 0) gaps++;
        if (n > 1) overlaps++;
      }
    }
    check(`${tag} rooms tile the floor plan (gaps ${gaps}, overlaps ${overlaps})`, gaps === 0 && overlaps === 0);
  }
  check(`${tag} every wall and piece of furniture sits inside the bounds`,
    [...map.WALLS, ...map.FURNITURE].every((w) => w.x - w.w / 2 >= B.minX - 1.5 && w.x + w.w / 2 <= B.maxX + 1.5
      && w.z - w.d / 2 >= B.minZ - 1.5 && w.z + w.d / 2 <= B.maxZ + 1.5));

  // nothing that a car or pickup occupies may start inside a wall or a desk
  const clear = (list, name, pad = 0.3) => {
    const bad = list.filter((pt) => !inside(pt.x, pt.z) || blocked(pt.x, pt.z, pad));
    check(`${tag} ${name} are all in open floor${bad.length ? ` — bad: ${bad.map((b) => `(${(b.x / M).toFixed(1)},${(b.z / M).toFixed(1)})`).join(' ')}` : ''}`, bad.length === 0);
  };
  clear(map.SPAWNS, 'spawns');
  clear(map.CHECKPOINTS, 'checkpoints');
  clear(map.BOT_PATH, 'bot waypoints');
  clear(map.BEAN_SPAWNS, 'beans');
  clear(map.POWERUP_PADS, 'powerup pads');
  clear(map.KOTH_SPOTS, 'standup spots', 1);
  clear(map.SOCCER.kickoff, 'kickoff spots');
  clear([map.BATTERY_SPAWN, map.SOCCER.ballSpawn], 'battery and ball');
  clear(map.ROBOT_PATH, 'robot waypoints');
  clear([{ x: map.COFFEE_MACHINE.deliverX, z: map.COFFEE_MACHINE.deliverZ }], 'coffee delivery spot');
  check(`${tag} props start inside the bounds`, map.PROPS.every((p) => inside(p.x, p.z)));

  // the bots' line is a closed loop no wall cuts (sampled like bots.js does)
  const segBlocked = (a, b) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5) + 1;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.2)) return true;
    }
    return false;
  };
  const cut = [];
  for (let i = 0; i < map.BOT_PATH.length; i++) {
    const a = map.BOT_PATH[i], b = map.BOT_PATH[(i + 1) % map.BOT_PATH.length];
    if (segBlocked(a, b)) cut.push(`${i}→${(i + 1) % map.BOT_PATH.length}`);
  }
  check(`${tag} the bots' line never runs through a wall or furniture${cut.length ? ` — cut: ${cut.join(' ')}` : ''}`, cut.length === 0);
  const robotCut = [];
  for (let i = 0; i < map.ROBOT_PATH.length; i++) {
    if (segBlocked(map.ROBOT_PATH[i], map.ROBOT_PATH[(i + 1) % map.ROBOT_PATH.length])) robotCut.push(i);
  }
  check(`${tag} the cleaning robot's patrol is clear`, robotCut.length === 0);
  // every checkpoint is on the bots' line (or they could never register it)
  check(`${tag} every checkpoint lies on the bots' line`, map.CHECKPOINTS.every((c) =>
    map.BOT_PATH.some((w, i) => {
      const n = map.BOT_PATH[(i + 1) % map.BOT_PATH.length];
      // distance from c to segment w→n
      const dx = n.x - w.x, dz = n.z - w.z, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((c.x - w.x) * dx + (c.z - w.z) * dz) / L));
      return Math.hypot(c.x - (w.x + dx * t), c.z - (w.z + dz * t)) < CHECKPOINT_RADIUS;
    })));
  check(`${tag} the bots' line starts on the start line`, Math.hypot(map.BOT_PATH[0].x - map.CHECKPOINTS[0].x, map.BOT_PATH[0].z - map.CHECKPOINTS[0].z) < CHECKPOINT_RADIUS);
  // soccer goals sit in doorways: nothing solid on the goal line
  check(`${tag} both soccer goals are open doorways`, map.SOCCER.goals.every((g) =>
    [-0.4, 0, 0.4].every((k) => !blocked(g.x, g.z + k * g.width, 0))));
  // the grid faces its first checkpoint (forward) — nobody starts backwards
  const worst = Math.max(...map.SPAWNS.map((s) => {
    let d = Math.atan2(map.CHECKPOINTS[0].x - s.x, map.CHECKPOINTS[0].z - s.z) - s.rotY;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  }));
  check(`${tag} the grid faces the first checkpoint (worst slot ${(worst * 180 / Math.PI).toFixed(0)}°)`, worst < Math.PI / 2);
  check(`${tag} twelve grid slots`, map.SPAWNS.length === 12);
  // a standup disc is one room's floor: no part of it lies behind a wall
  // from its centre (the cellar's Archive and Server Hall discs used to spill
  // into the corridor, and cars there scored through the wall)
  {
    const walls = map.WALLS.filter((w) => !w.low);
    const sight = (a, x, z) => {
      const steps = Math.ceil(Math.hypot(x - a.x, z - a.z) / 0.25) + 1;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (walls.some((w) => inBox(a.x + (x - a.x) * t, a.z + (z - a.z) * t, w))) return false;
      }
      return true;
    };
    const behind = [];
    map.KOTH_SPOTS.forEach((s, i) => {
      let n = 0;
      for (let dx = -KOTH_RADIUS; dx <= KOTH_RADIUS; dx += 0.5) {
        for (let dz = -KOTH_RADIUS; dz <= KOTH_RADIUS; dz += 0.5) {
          if (Math.hypot(dx, dz) > KOTH_RADIUS || walls.some((w) => inBox(s.x + dx, s.z + dz, w))) continue;
          if (!sight(s, s.x + dx, s.z + dz)) n++;
        }
      }
      if (n) behind.push(`#${i} (${(s.x / M).toFixed(1)},${(s.z / M).toFixed(1)}) ${n} pts`);
    });
    check(`${tag} no standup disc reaches behind a wall${behind.length ? ` — ${behind.join(', ')}` : ''}`, !behind.length);
  }

}
check('modes: a mode list exists to run on these maps', MODE_IDS.length > 0);

// ------------------------------------------------ choosing the next map
{
  const { Room } = await import('../server/src/room.js');
  const mk = (isPrivate) => {
    const r = new Room(isPrivate ? 'K7QX' : null, isPrivate);
    r.sent = [];
    r.broadcast = (m) => r.sent.push(m);
    r.sendTo = () => {};
    r.sendLobby = () => {};
    r.broadcastSnapshot = () => {};
    return r;
  };
  const start = (r) => { r.startCountdown(); const s = r.sent.find((m) => m.t === 'start'); r.dispose?.(); return s; };
  {
    const r = mk(false);
    check('rooms: a new room opens on the default map', r.mapId === 'office');
    const s = start(r);
    check('quick play: with no votes the next round moves to another floor', r.mapId !== 'office');
    check('rooms: START tells everyone which map the round is on', s && s.map === r.mapId);
    check('rooms: the powerup pads are that map\'s pads', r.pads.length === MAPS[r.mapId].POWERUP_PADS.length);
  }
  {
    const r = mk(true);
    start(r);
    check('private: with no votes the crew stays on its floor', r.mapId === 'office');
  }
  {
    const r = mk(true);
    r.mapVotes.set('a', 'cellar'); r.mapVotes.set('b', 'cellar'); r.mapVotes.set('c', 'office');
    start(r);
    check('votes: the most-voted floor wins', r.mapId === 'cellar');
    check('votes: spent map votes do not carry into the next round', r.mapVotes.size === 0);
  }
}

console.log(fails ? `\n${fails} map check(s) FAILED` : '\nall map checks passed');
process.exit(fails ? 1 : 0);
