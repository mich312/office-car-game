// The IT Cellar's dressing kinds — empty, wired: the cellar's artist adds
// kinds here (CLUTTER_KINDS, DECAL_KINDS, SCATTER_KINDS, DECOR_MODELS) and
// places them from shared/src/maps/cellar.js (CLUTTER, SCATTER,
// DECOR_PROPS). See kinds/common.js for the contract.

// The cellar draws its own DECALS (themes/cellar-set.js bakes them into its
// batch with its own atlas); the shared decal mesh takes only its STAINS.
// To move the cellar onto the shared system: every cellar kind name exists
// in dressing/decals.js, so drop the loop in cellar-set.js and this flag.
export const OWN_DECALS = true;

export const CLUTTER_KINDS = {};
export const DECAL_KINDS = {};
export const SCATTER_KINDS = {};
export const DECOR_MODELS = {};

// Wall-base bands by wall style. The block walls already carry their conduit
// and sockets (cellar-set.js); the band adds vents and scuffs.
export const BANDS = {
  cellar_block: { vents: 6, scuffs: 2.5 },
  cellar_glass: {},
};
