// A map's CLUTTER, built: [kind, x, z, rotY, opts] (metres) → kit parts in
// world metres (they join the map's static batch — architecture.js hands
// them over — so clutter in the building's materials costs no draw call),
// decal cards (the map's decal mesh), and colliders in world units.
//
// Collision (kinds/common.js has the contract): every collider goes on ONE
// body per map, and that body is kinematic, not fixed. For the car it is the
// same — a kinematic body that never moves is as immovable as a wall — but
// the chase camera's ray only tests FIXED colliders (LocalCar.jsx
// CAM_BLOCKERS: QueryFilterFlags ONLY_FIXED | EXCLUDE_SENSORS, no group
// filter), so a bin or a coat stand passing between the car and the lens
// never yanks the camera in. (Collision groups can't do that: the ray is
// cast with no groups, and rapier then tests every collider.)
import * as THREE from 'three';
import { M } from '@rc/shared';
import { Piece, placeMatrix } from '../kit.js';
import { rng } from '../textures.js';
import { pieceSeed } from '../furniture.js';
import { CLUTTER_KINDS } from './registry.js';

const _v = new THREE.Vector3();

export const sizeOf = (def, o) => (typeof def.size === 'function' ? def.size(o) : def.size) || [0.3, 0.3, 0.3];

// Footprints for tools and lints: { kind, x, z, rot, w, h, d, collide }.
export function clutterFootprints(map) {
  return (map.CLUTTER || []).map(([kind, x, z, rot = 0, o = {}]) => {
    const def = CLUTTER_KINDS[kind];
    if (!def) return null;
    const [w, h, d] = sizeOf(def, o);
    return { kind, x, z, rot, w, h, d, collide: def.collide || 'none' };
  }).filter(Boolean);
}

const cache = new WeakMap();
export function clutterOf(map) {
  let out = cache.get(map);
  if (out) return out;
  out = { parts: [], decals: [], colliders: [] };
  (map.CLUTTER || []).forEach(([kind, x, z, rot = 0, o = {}], i) => {
    const def = CLUTTER_KINDS[kind];
    if (!def) {
      if (typeof console !== 'undefined') console.warn(`clutter: no kind '${kind}' (${map.id} #${i})`);
      return;
    }
    const p = new Piece();
    const r = rng(pieceSeed(map.id, `c${i}`));
    def.build(p, o, r);
    const world = placeMatrix(x, z, rot, 1, o.y || 0); // metres; the batch scales
    for (const part of p.parts) out.parts.push({ ...part, m: world.clone().multiply(part.m) });
    for (const dc of p.decals) out.decals.push({ ...dc, m: world.clone().multiply(dc.m) });
    if (def.collide === 'none' || !def.collide) return;
    const [w, h, d] = sizeOf(def, o);
    const list = def.colliders ? def.colliders(o) : [{ box: [w, h, d], at: [0, h / 2, 0] }];
    for (const c of list) {
      if (c.hull) {
        // hull points: into the world, in units
        const pts = new Float32Array(c.hull.length * 3);
        c.hull.forEach((q, k) => {
          _v.set(q[0], q[1], q[2]).applyMatrix4(world).multiplyScalar(M);
          pts.set([_v.x, _v.y, _v.z], k * 3);
        });
        out.colliders.push({ hull: pts });
      } else {
        _v.set(c.at[0], c.at[1], c.at[2]).applyMatrix4(world).multiplyScalar(M);
        out.colliders.push({ box: [c.box[0] / 2 * M, c.box[1] / 2 * M, c.box[2] / 2 * M], at: [_v.x, _v.y, _v.z], rot: [0, rot + (c.yaw || 0), 0] });
      }
    }
  });
  cache.set(map, out);
  return out;
}

// Parts whose material the shared library has — the static batch's — and
// the rest (a kinds file's own 'dress.' materials, drawn by index.jsx).
export const isOwnMaterial = (key) => key.startsWith('dress.');
