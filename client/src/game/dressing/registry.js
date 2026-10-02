// Every dressing kind on every floor, merged. Each kinds file exports any of
//
//   CLUTTER_KINDS   { kind: { size, collide, colliders?, build } }   kinds/common.js
//   DECAL_KINDS     { kind: { draw(g, S, r), span?, layer? } }       decals.js
//   SCATTER_KINDS   { kind: { geo(), atlas?, colors, lift, tilt } }  scatter.jsx
//   DECOR_MODELS    { name: { parts: [[model, dx, dy, dz, rx, ry, rz, tinted?]], size } }  decorModels.js
//   BANDS           { wallStyle | 'plain:<theme>' | …: profile }     architecture.js bandOf
//   OWN_DECALS      true when the theme draws its map's DECALS itself
//
// Names are global across maps, like furniture types: prefix a map's own
// (cellar_reel, garage_hose). A per-map artist edits only kinds/<map>.js and
// the map's data; nothing here changes.
import { BUILTIN_DECALS, setDecalKinds } from './decals.js';
import * as common from './kinds/common.js';
import * as office from './kinds/office.js';
import * as cellar from './kinds/cellar.js';
import * as tower from './kinds/tower.js';
import * as garage from './kinds/garage.js';
import * as factory from './kinds/factory.js';

// the map theme each kinds file belongs to ('office' is the built-in floor)
export const KINDS = { common, office, cellar, tower, garage, factory };
const all = Object.values(KINDS);
const merge = (key) => Object.assign({}, ...all.map((k) => k[key] || {}));

export const CLUTTER_KINDS = merge('CLUTTER_KINDS');
export const SCATTER_KINDS = merge('SCATTER_KINDS');
export const DECOR_MODELS = merge('DECOR_MODELS');
export const BANDS = merge('BANDS');
export const DECAL_KINDS = { ...BUILTIN_DECALS, ...merge('DECAL_KINDS') };
setDecalKinds(DECAL_KINDS);

// does this map's theme draw map.DECALS through its own pipeline?
export const ownsDecals = (map) => !!KINDS[map.theme]?.OWN_DECALS;
