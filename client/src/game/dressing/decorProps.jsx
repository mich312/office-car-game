// Static decor from the props' own models: a map's DECOR_PROPS
//
//   [name, x, y, z, rotY, colour?, opts?]   metres; y is the surface it
//                                            stands on (0 = floor, 0.92 = a counter)
//
// drawn through the props' instancer (propKit.jsx <Inst static>) with no
// physics body: a mug on a shelf, a monitor on a desk nobody can drive to, a
// carton on top of a rack. A model the floor already shows costs no draw
// call; a new one costs one (plus its shadow). No body means a car drives
// straight through it — so only where cars can't reach (shelves, sills,
// bartops without a ramp, tops of racks), or with opts.collide: 'box',
// which puts a box the size of the model on the dressing's collider body.
//
// `name` is a DECOR_MODELS entry: a prop model (or several) with the lift
// that puts its origin where Props.jsx's body would hold it — so 'plant' is
// the pot and its snake plant, 'bottleLying' the bottle on its side.
import { useMemo } from 'react';
import * as THREE from 'three';
import { M } from '@rc/shared';
import { Inst } from '../propKit.jsx';
import '../propModels.js';
import { DECOR } from './decorModels.js';


const colours = new Map();
const colour = (hex) => {
  if (!hex) return null;
  let c = colours.get(hex);
  if (!c) { c = new THREE.Color(hex); colours.set(hex, c); }
  return c;
};

// colliders for the entries that ask for one, in world units
export function decorColliders(map) {
  const out = [];
  for (const [name, x, y, z, rotY = 0, , o] of map.DECOR_PROPS || []) {
    const def = DECOR[name];
    if (!def || o?.collide !== 'box') continue;
    const [w, h, d] = def.size;
    out.push({ box: [w / 2 * M, h / 2 * M, d / 2 * M], at: [x * M, (y + h / 2) * M, z * M], rot: [0, rotY, 0] });
  }
  return out;
}

export default function DecorProps({ map }) {
  const list = useMemo(() => (map.DECOR_PROPS || []).filter(([name]) => {
    if (DECOR[name]) return true;
    console.warn(`decor: no model '${name}'`);
    return false;
  }), [map]);
  return (
    <group name="decor-props">
      {list.map(([name, x, y, z, rotY = 0, hex], i) => (
        <group key={i} position={[x * M, y * M, z * M]} rotation-y={rotY}>
          {DECOR[name].parts.map(([model, dx, dy, dz, rx = 0, ry = 0, rz = 0, tinted], k) => (
            <Inst key={k} static model={model} color={tinted ? colour(hex) : null}
              position={[dx * M, dy * M, dz * M]} rotation={[rx, ry, rz]} />
          ))}
        </group>
      ))}
    </group>
  );
}
