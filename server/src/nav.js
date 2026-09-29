// A coarse walkability grid per map, for bots heading somewhere the racing
// line doesn't go. The race loop doubles as a corridor graph, but it skips
// whole rooms (the cellar's boiler room, where the coffee machine is), and a
// bot routing to a goal in one of those bounced between the two nearest
// waypoints for minutes. A breadth-first distance field from the goal, read
// downhill from the bot, finds the door instead.
const CELL = 1; // world units per cell
const PAD = 0.5; // clearance kept from walls (bots collide at 0.35)
const FIELDS = 48; // distance fields cached per map (goals repeat: beans, the machine, the ball)

const grids = new WeakMap();
export function navOf(map) {
  let g = grids.get(map);
  if (!g) { g = new NavGrid(map); grids.set(map, g); }
  return g;
}

class NavGrid {
  constructor(map) {
    const B = map.MAP_BOUNDS;
    this.x0 = B.minX; this.z0 = B.minZ;
    this.nx = Math.ceil((B.maxX - B.minX) / CELL) + 1;
    this.nz = Math.ceil((B.maxZ - B.minZ) / CELL) + 1;
    this.walls = map.WALLS.map((w) => ({
      minX: w.x - w.w / 2 - PAD, maxX: w.x + w.w / 2 + PAD,
      minZ: w.z - w.d / 2 - PAD, maxZ: w.z + w.d / 2 + PAD,
    }));
    this.open = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.pos(i, j);
        this.open[j * this.nx + i] = map.roomAt(x, z) && !this.inWall(x, z) ? 1 : 0;
      }
    }
    this.fields = new Map(); // goal cell → Int32Array of steps (-1 unreachable)
  }
  pos(i, j) { return [this.x0 + i * CELL, this.z0 + j * CELL]; }
  inWall(x, z) {
    for (const w of this.walls) if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return true;
    return false;
  }
  // nearest open cell to a point (a goal against a wall, a bot in its padding)
  cellOf(x, z) {
    const ci = Math.round((x - this.x0) / CELL), cj = Math.round((z - this.z0) / CELL);
    for (let r = 0; r < 4; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.open[j * this.nx + i]) return j * this.nx + i;
        }
      }
    }
    return -1;
  }
  field(goal) {
    let f = this.fields.get(goal);
    if (f) { this.fields.delete(goal); this.fields.set(goal, f); return f; } // LRU touch
    f = new Int32Array(this.nx * this.nz).fill(-1);
    const q = new Int32Array(this.nx * this.nz);
    let head = 0, tail = 0;
    f[goal] = 0; q[tail++] = goal;
    while (head < tail) {
      const c = q[head++];
      const i = c % this.nx, j = (c - i) / this.nx;
      const d = f[c] + 1;
      if (i > 0 && this.open[c - 1] && f[c - 1] < 0) { f[c - 1] = d; q[tail++] = c - 1; }
      if (i < this.nx - 1 && this.open[c + 1] && f[c + 1] < 0) { f[c + 1] = d; q[tail++] = c + 1; }
      if (j > 0 && this.open[c - this.nx] && f[c - this.nx] < 0) { f[c - this.nx] = d; q[tail++] = c - this.nx; }
      if (j < this.nz - 1 && this.open[c + this.nx] && f[c + this.nx] < 0) { f[c + this.nx] = d; q[tail++] = c + this.nx; }
    }
    this.fields.set(goal, f);
    if (this.fields.size > FIELDS) this.fields.delete(this.fields.keys().next().value);
    return f;
  }
  // Where to steer from (x, z) toward (gx, gz): the farthest point down the
  // distance field still in plain sight (`blocked` is the caller's own line
  // test, so the bot never aims through what it would collide with). Null
  // when the goal is unreachable from here.
  toward(x, z, gx, gz, blocked) {
    const goal = this.cellOf(gx, gz), start = this.cellOf(x, z);
    if (goal < 0 || start < 0) return null;
    const f = this.field(goal);
    if (f[start] < 0) return null;
    const path = [];
    let c = start;
    for (let k = 0; k < 60 && f[c] > 0; k++) {
      const i = c % this.nx;
      let best = c;
      for (const n of [i > 0 ? c - 1 : -1, i < this.nx - 1 ? c + 1 : -1, c - this.nx, c + this.nx]) {
        if (n >= 0 && n < f.length && f[n] >= 0 && f[n] < f[best]) best = n;
      }
      if (best === c) break;
      c = best;
      path.push(c);
    }
    if (!path.length) return { x: gx, z: gz };
    // farthest visible point, checked from the far end in strides
    for (let k = path.length - 1; k >= 0; k -= 3) {
      const [px, pz] = this.pos(path[k] % this.nx, Math.floor(path[k] / this.nx));
      if (!blocked(x, z, px, pz)) return { x: px, z: pz };
    }
    const [px, pz] = this.pos(path[0] % this.nx, Math.floor(path[0] / this.nx));
    return { x: px, z: pz };
  }
}
