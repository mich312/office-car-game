// What every camera needs to know about the local car, shared outside
// <Physics>: where the car is DRAWN this frame, and a way to ask the physics
// world whether a lens position is clear.
//
// Drawn, not simulated: rapier interpolates the mesh between 60 Hz steps, so
// the rendered car trails the body's newest state by up to one step (v/60,
// a third of a unit when boosting). At a 2 u lens that gap is a visible size
// and position jitter, so the chase rig, the photo orbit, the speed-FX mask
// and the blob shadow all read this pose instead of the body's.

// Written by LocalCar every frame (it runs right after the physics step).
// Also window.__rcCarView, for tooling that frames or measures the car.
export const carView = { x: 0, y: 0, z: 0, yaw: 0, ready: false };
if (typeof window !== 'undefined') window.__rcCarView = carView;

// clearLens(ox, oy, oz, tx, ty, tz) → the share (0…1] of the segment from the
// origin to the target a lens can travel before it would be inside a wall or
// a big prop (with a margin). LocalCar installs the real probe from inside
// <Physics>; until then everything reads as clear.
let probe = null;
export const setCamProbe = (fn) => { probe = fn; };
export const clearLens = (ox, oy, oz, tx, ty, tz) => (probe ? probe(ox, oy, oz, tx, ty, tz) : 1);
