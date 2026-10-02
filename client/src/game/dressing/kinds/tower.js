// The Tower's dressing kinds — empty, wired: the tower's artist adds kinds
// here and places them from shared/src/maps/tower.js (CLUTTER, SCATTER,
// DECOR_PROPS, DECALS). See kinds/common.js for the contract. Mind the
// triangle budget: the tower is the heaviest floor already.
export const CLUTTER_KINDS = {};
export const DECAL_KINDS = {};
export const SCATTER_KINDS = {};
export const DECOR_MODELS = {};

// Wall-base bands by wall style: a floor convector along the inside of the
// curtain wall (not out on the terrace), sockets and vents on the core's
// plaster.
export const BANDS = {
  tower_curtain: { convector: 'indoor' },
  tower_core: { sockets: 5, vents: 8, scuffs: 4 },
  tower_stone: {},
  tower_glass: {},
  tower_balustrade: {},
};
