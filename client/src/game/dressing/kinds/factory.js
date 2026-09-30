// The Factory's dressing kinds — empty, wired: the factory's artist adds
// kinds here and places them from shared/src/maps/factory.js (CLUTTER,
// SCATTER, DECOR_PROPS, DECALS). See kinds/common.js for the contract.
export const CLUTTER_KINDS = {};
export const DECAL_KINDS = {};
export const SCATTER_KINDS = {};
export const DECOR_MODELS = {};

// Wall-base bands by wall style: mesh, glass, guards and dock doors carry
// nothing at the base; the factory's plain block walls get grey conduit.
export const BANDS = {
  'plain:factory': { conduit: true, vents: 8, scuffs: 3 },
};
