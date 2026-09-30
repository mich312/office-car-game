// The Factory's dressing kinds — empty, wired: the factory's artist adds
// kinds here and places them from shared/src/maps/factory.js (CLUTTER,
// SCATTER, DECOR_PROPS, DECALS). See kinds/common.js for the contract.
export const CLUTTER_KINDS = {};
export const DECAL_KINDS = {};
export const SCATTER_KINDS = {};
export const DECOR_MODELS = {};

// Wall-base bands by wall style: the factory's plain block walls get grey
// conduit, vents and scuffs; mesh guarding and glass you see through, the
// guard rails, dock doors and columns carry nothing at their base (yet).
export const BANDS = {
  'plain:factory': { conduit: true, vents: 8, scuffs: 3 },
  factory_mesh: {},
  factory_glass: {},
  factory_guard: {},
  factory_dockdoor: {},
  factory_column: {},
};
