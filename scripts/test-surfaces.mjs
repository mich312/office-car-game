// Floors (shared/src/surfaces.js) and the antenna (shared/src/feel.js): each
// surface is a trade and not an upgrade, the bumps sit on the lines you can
// see, and the antenna behaves like a whip rather than a stick.
import {
  ROOMS, FURNITURE, SURFACES, surfaceAt, floorHeight, seamCell, antennaStep, newAntenna, ANTENNA,
} from '../shared/src/index.js';

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) fails++; };
const room = (id) => ROOMS.find((r) => r.id === id);

// --------------------------------------------------------------- surfaces
check('surfaces: every room floor has a surface', ROOMS.every((r) => SURFACES[r.floor]));
check('surfaces: a room centre reads as its floor', surfaceAt(room('lounge').x, room('lounge').z + 5).id === 'wood'
  && surfaceAt(room('cafeteria').x, room('cafeteria').z).id === 'tile'
  && surfaceAt(room('open_office').x, room('open_office').z).id === 'carpet');
check('surfaces: a rug wins over the floor under it', FURNITURE.filter((f) => f.type === 'rug').every((r) => surfaceAt(r.x, r.z).id === 'rug'));
check('surfaces: outside every room is bare concrete', surfaceAt(9999, 9999).id === 'concrete');
// every surface a trade: grip bought with speed, or speed bought with grip
const S = Object.entries(SURFACES).filter(([k]) => k !== 'carpet2');
check('surfaces: more grip always costs top speed (no surface is simply better)', S.every(([, a]) => S.every(([, b]) =>
  !(a.grip > b.grip && a.top > b.top))));
check('surfaces: carpet grips more than hardwood and hardwood is quicker', SURFACES.carpet.grip > SURFACES.wood.grip && SURFACES.wood.top > SURFACES.carpet.top);
check('surfaces: carpet stops a coasting car sooner than hardwood', SURFACES.carpet.drag > SURFACES.wood.drag);
check('surfaces: effects stay modest (±15%) — a floor, not a power-up', S.every(([, s]) => Math.abs(s.top - 1) <= 0.15 && Math.abs(s.grip - 1) <= 0.15));

// --------------------------------------------------------------- bumps
{
  const r = room('cafeteria');
  const surf = surfaceAt(r.x, r.z);
  const period = r.w / SURFACES.tile.seams.grid;
  const x0 = r.x - r.w / 2;
  const onGrout = floorHeight(surf, x0 + 4 * period, r.z + period * 0.37);
  const midTile = floorHeight(surf, x0 + 4.5 * period, r.z + period * 0.5 - (r.d / SURFACES.tile.seams.grid) * 0);
  check(`bumps: tile grout is a groove on the texture's own grid (${onGrout.toFixed(4)})`, onGrout < -0.007);
  check(`bumps: the middle of a tile is flat (${midTile.toFixed(4)})`, Math.abs(midTile) < 0.002);
  check('bumps: crossing a grout line changes the seam cell', seamCell(surf, x0 + 3.9 * period, r.z) !== seamCell(surf, x0 + 4.1 * period, r.z));
}
{
  const r = room('lounge');
  const surf = { id: 'wood', room: r };
  const period = r.d / SURFACES.wood.seams.per;
  const z0 = r.z - r.d / 2;
  check('bumps: plank joints are grooves along the planks', floorHeight(surf, r.x, z0 + 10 * period) < -0.004 && Math.abs(floorHeight(surf, r.x, z0 + 10.5 * period)) < 0.002);
}
check('bumps: carpet has pile but no seams', seamCell(surfaceAt(room('open_office').x, room('open_office').z), 0, 0) === null);
check('bumps: every surface stays within a centimetre of flat at 1:20', (() => {
  for (const r of ROOMS) for (let i = 0; i < 400; i++) {
    const x = r.x + (Math.random() - 0.5) * r.w, z = r.z + (Math.random() - 0.5) * r.d;
    if (Math.abs(floorHeight(surfaceAt(x, z), x, z)) > 0.0105) return false;
  }
  return true;
})());
check('bumps: the same spot feels the same every time (deterministic)', (() => {
  const s = surfaceAt(20, 20);
  return floorHeight(s, 20.37, 19.21) === floorHeight(s, 20.37, 19.21);
})());

// --------------------------------------------------------------- antenna
const dt = 1 / 60;
const settle = (st, speed, s = 4) => { for (let t = 0; t < s; t += dt) antennaStep(st, 0, 0, 0, speed, dt); return st; };
check('antenna: at rest it stands up straight', (() => { const a = settle(newAntenna(), 0); return Math.abs(a.pitch) < 1e-3 && Math.abs(a.roll) < 1e-3; })());
check('antenna: speed sweeps it back', settle(newAntenna(), 15).pitch < -0.1);
check('antenna: braking whips it forward', (() => {
  const a = settle(newAntenna(), 12);
  let peak = a.pitch;
  for (let t = 0; t < 0.3; t += dt) { antennaStep(a, -40, 0, 0, 12, dt); peak = Math.max(peak, a.pitch); }
  return peak > 0.2;
})());
check('antenna: a right-hand turn throws it out to the left', (() => {
  const a = newAntenna();
  for (let t = 0; t < 0.5; t += dt) antennaStep(a, 0, 30, 0, 10, dt);
  return a.roll < -0.1;
})());
check('antenna: after a jolt it rings — and then settles', (() => {
  const a = newAntenna();
  for (let t = 0; t < 0.1; t += dt) antennaStep(a, -50, 0, 0, 0, dt);
  let crossings = 0, prev = Math.sign(a.pitch);
  for (let t = 0; t < 3; t += dt) { antennaStep(a, 0, 0, 0, 0, dt); const sg = Math.sign(a.pitch); if (sg && sg !== prev) { crossings++; prev = sg; } }
  return crossings >= 2 && Math.abs(a.pitch) < 0.02;
})());
check('antenna: a bump sets it moving', (() => { const a = newAntenna(); antennaStep(a, 0, 0, 40, 0, dt); antennaStep(a, 0, 0, 0, 0, dt); return Math.abs(a.vp) > 0.1; })());
check('antenna: no crash can fold it through the car', (() => {
  const a = newAntenna();
  for (let t = 0; t < 1; t += dt) antennaStep(a, (Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 2000, 500, 30, dt);
  return Math.abs(a.pitch) <= ANTENNA.max && Math.abs(a.roll) <= ANTENNA.max;
})());
check('antenna: a long frame cannot blow the spring up', (() => { const a = newAntenna(); antennaStep(a, -40, 20, 0, 10, 0.25); return Number.isFinite(a.pitch) && Math.abs(a.pitch) <= ANTENNA.max; })());

console.log(fails ? `\n${fails} surface check(s) failed` : '\nall surface checks passed');
process.exit(fails ? 1 : 0);
