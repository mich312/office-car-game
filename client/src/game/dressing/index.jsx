// Map dressing: what makes a floor look lived-in at a car's eye height —
// the layer between the architecture and the props. Every map can carry,
// client-only (the server never reads them; test-maps only checks that the
// keys it needs exist):
//
//   DECALS       [kind, x, z, w, d, rot, opacity, tint|{ tint, y }?]  decals.js
//   CLUTTER      [kind, x, z, rotY, opts]                             clutter.js
//   DECOR_PROPS  [model, x, y, z, rotY, colour?, opts?]               decorProps.jsx
//   SCATTER      [kind, x, z, w, d, n, opts]                          scatter.jsx
//
// all in metres. The kinds live in kinds/<map>.js (common.js for the shared
// kit); registry.js merges them. Mounted once per map from Office.jsx.
//
// Draw cost, whatever the map carries: clutter joins the map's static batch
// (architecture.js takes clutterOf(map).parts), so it's free in any material
// the building already uses; decals and labels are ONE mesh per layer (two
// at most); decor props ride the props' instancer; scatter is one instanced
// mesh per kind. Colliders: one kinematic body (see clutter.js for why not
// fixed).
import { useMemo, useEffect } from 'react';
import { RigidBody, CuboidCollider, ConvexHullCollider } from '@react-three/rapier';
import { clutterOf } from './clutter.js';
import { decalGeometry, decalMaterial, floorDecals } from './decals.js';
import { ownsDecals } from './registry.js';
import { bandOf } from '../architecture.js';
import DecorProps, { decorColliders } from './decorProps.jsx';
import Scatter from './scatter.jsx';

export default function MapDressing({ map }) {
  return (
    <group name="dressing">
      <Decals map={map} />
      <Colliders map={map} />
      <DecorProps map={map} />
      <Scatter map={map} />
    </group>
  );
}

// The map's decals, its stains, and every label, sticker and tape strip the
// clutter and the wall band printed on their models: one mesh a layer.
function Decals({ map }) {
  const geos = useMemo(() => {
    const floor = floorDecals(map, { ownDecals: ownsDecals(map) });
    const cards = [...clutterOf(map).decals, ...bandOf(map).decals];
    return decalGeometry(floor, cards);
  }, [map]);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  return Object.entries(geos).map(([layer, geo]) => (
    // drawn after the floors and the batch; receives the room's shadows so a
    // sheet of paper under a desk isn't lit like one in the sun
    <mesh key={layer} geometry={geo} material={decalMaterial(layer)} receiveShadow renderOrder={1} />
  ));
}

// Every client-only collider on the floor — clutter and decor that asked
// for one — on one kinematic body.
function Colliders({ map }) {
  const list = useMemo(() => [...clutterOf(map).colliders, ...decorColliders(map)], [map]);
  if (!list.length) return null;
  return (
    <RigidBody type="kinematicPosition" colliders={false} friction={0.8}>
      {list.map((c, i) => (c.hull
        ? <ConvexHullCollider key={i} args={[c.hull]} friction={1} />
        : <CuboidCollider key={i} args={c.box} position={c.at} rotation={c.rot} />))}
    </RigidBody>
  );
}

export { clutterOf } from './clutter.js';
