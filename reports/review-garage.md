# Review: Garage Zero (dev garage floor)

## Fixed (in lane)
- **Memory leak on every garage visit** (`themes/garageKit.js` `useOwned`, used in garage.jsx, garageWorld.jsx, garagePieces.jsx). The theme built its walls, fence, dressing kits, truss, furniture batches, trees, tufts, sky, far ring, boards, neon and chalk anew on every mount and never disposed any of it. To measure it I counted live WebGL buffers and textures (`createBuffer`/`deleteBuffer` hooks) across map switches. A cellar→garage→cellar cycle added **+311 buffers / +11 textures** before the fix and **+46 / +2** after, the same as the office↔cellar baseline. Office↔garage now adds +12 / 0 per cycle. Shared things (slot materials, `cached` kits, textures.js canvases) are left alone.
- **Soundscape timers** (garage.jsx): the chirps it had queued could still play after unmount. They are now cleared.
- **Per-frame work**: the server shelf's 20 LEDs parsed a CSS colour string each, every frame (garagePieces.jsx ServerRack). The colours are now parsed once. The floor pools allocated `Object.values()` every frame; that list is now built once.
- **Paint tins poked through the plank ramps** (garage.jsx PlankRamp): the lids stood about 6 cm proud of the ply, visible as dark half-moons on the bonnet plank (shot at -14,4.6). The tins now sit where the plank's underside clears them. Re-shot: the plank is clean.
- **Fridge and bookshelf faced the wrong way** (maps/garage.js). These are office pieces, which follow the rotY contract. The kitchen fridge faced north into the wall, so from the room you saw a blank side. The founder's bookshelf stood 0.5 m wide and 1.6 m deep along the wall. Both now face west into their rooms (re-shot; the collider footprint is unchanged). I also corrected the stale "server ignores rotY" comment.

Build is green and `npm test` passes all 967 checks.

## Out of lane
1. **major — Factory leaks about 180 GPU buffers and 4 textures per visit** (`client/src/game/themes/factory*.jsx`). Evidence: office→factory→office cycles went 1858 → 2037 → 2216 live buffers. Proposed patch: dispose the theme's per-mount geometries, materials and canvases on unmount; the `useOwned` pattern in garageKit.js drops in.
2. **minor — Cellar leaks about 34–46 buffers and 2 textures per visit** (`themes/cellar*.jsx`). Evidence: office↔cellar adds +46 / +2 per cycle, while office↔garage adds only +12. Proposed patch: same as above.
3. **minor — The chase camera has no occlusion** (`client/src/game/LocalCar.jsx:992-1006`). It sits 0.9 m back and 0.45 m up, so backed against a counter or wall it renders from inside it. Evidence: a car parked at (17.8,-2.5) facing north got a frame filled entirely by the kitchen counter's colour. Proposed patch: cast a ray (`world.castRay`, excluding the car's body) from the car to `_camTarget`, and pull the camera to the hit point minus a small margin.

## Checked and fine
- **Bonnet jump**: driven in the browser from the back door. The car goes up the plank, over the roof, off the boot, out under the roller door, and lands on the drive. The plank meets the bonnet (0.78 vs 0.77 m, 8 cm overlap).
- **Rooms and yards**: every room and yard shot from the car's seat by day and at night. Sky and fog restore on unmount; outdoor/indoor transitions read well.
- **Draw calls**: at most 516 (the grid view).
- **Races over 6 seeds**: 34/36 bots finish forward and 30/36 reverse (the office manages 30 and 29), with no stalls.
- **Other modes**: coffee, battery, tag and soccer have no stuck bots; the only lingering is at the goal mouths in soccer. Every Moving Meeting target (the ring slides from the driveway to 11 spots) produces a winner, with outs per round similar to the office.
- **Koth discs**: they clear the walls.
