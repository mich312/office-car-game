// The Garage's dressing kinds — empty, wired: the garage's artist adds kinds
// here and places them from shared/src/maps/garage.js (CLUTTER, SCATTER,
// DECOR_PROPS, DECALS). See kinds/common.js for the contract. The lawns'
// grass is the shared 'tuft' scatter kind (the blades garageWorld's Tufts
// draws), so the yards can take thousands of them at one draw.
export const CLUTTER_KINDS = {};
export const DECAL_KINDS = {};
export const SCATTER_KINDS = {};
export const DECOR_MODELS = {};

// Wall-base bands by wall style: sockets on the house's inside faces (a
// face's finish is the wall entry's neg/pos: siding is the outside).
export const BANDS = {
  garage_wall: { sockets: 4, scuffs: 3, faces: (w, side) => (side < 0 ? w.neg : w.pos) !== 'siding' },
  garage_picket: {},
};
