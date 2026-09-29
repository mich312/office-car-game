# Review: Werk 2 (printer assembly floor)

Lane: `shared/src/maps/factory.js`, `client/src/game/themes/factory.jsx`. Fixed in fe634a3, all in `themes/factory.jsx`. The map file needed no changes.

## Fixed

**1. Clients disagreed about where the robot arms were, and so about where the big arms' gripper colliders were (major).**
`tickLine` kept a per-client total of Line Stop time (`LINE.frozen`). So a player who joined after a stop, or whose tab slept through one, ran the station cycle out of phase with everyone else for the rest of the session.
- Evidence: replaying old and new `tickLine` at 60 fps, with client A present for a 20 s stop and client B joining 10 s after it ended.
  - Old clock: the two stay 0.80 s of cycle apart forever.
  - New clock: 0.00 s apart once the catch-up is done.
- Fix: after a stop the line runs at double speed until it is back on the server's clock. Each new mount starts on the shared clock, and a long frame gap does not count as line time.

**2. Every mount leaked GPU memory, and quick play remounts every round (major).**
Nothing in the theme was ever disposed: the merged batches (StaticStock, Building, fences, columns, dock doors, glass, curtains, chain track, ramp skins), the sign atlas, the Andon and safety-board canvases, and the per-mount materials.
- Evidence: I exposed `gl.info.memory` temporarily (not committed) and did four office↔factory round trips.
  - Before: geometries 286 → 326 → 369 → 412 → 455, textures 102 → 141.
  - After: geometries steady at 281, textures steady at 125.
- Fix: `useFree` disposes what each mount built. Cached kinds (`once`, `cached`) are left alone.

**3. The flat-pack pallet's load did not match its collider (minor).**
This is the 1.0 × 1.2 pallet in Packing at (13.2, −3.2). The pallet itself was turned to fit, but its strapped load was not: the load stuck out 9 cm on each side in x and fell 10 cm short in z. Pallet loads now turn with their pallet. A new screenshot shows the load square on the pallet.

**4. Assembly printers got a huge shove when they wrapped round (minor).**
When a printer wrapped back into the CHASSIS hood, it moved 16 m in one kinematic step. That gives it about 1,000 m/s for that step, which would throw anything sitting in the hood mouth. It now teleports when it wraps.

**5. Per-frame allocation in hot loops (minor).**
The QA pages and the cell stack lights created a `forEach` closure every frame. The Andon made new arrays every frame and parsed colour strings on every beacon child each frame. The kinematic targets were new objects every frame. All of these now reuse scratch values.

Checks: `npm run build` and `npm test` pass. A second set of screenshots (grid, belt, packing, QA, shipping, the pallet) shows no visual regressions, and draw calls are the same as before.

## Out-of-lane findings

None verified. One unverified risk for whoever owns lighting: event-only `pointLight`s mount and unmount, which changes the scene's light count. In three.js that recompiles every lit material, which could cause a hitch when an event starts or ends. They are:
- factory AGV, `themes/factory.jsx` (`Robot`)
- `ModeObjects.jsx:235, 532, 968`
- `OfficeEvents.jsx:117`
- `tower.jsx:171`

Proposed patch: keep one pooled light always mounted at intensity 0 and move or brighten it, instead of mounting new ones. I did not measure the hitch.

## Checked and fine

- **Bot-sim, 2 seeds each, 180 s, 6 bots, factory:** all 11 mode/variant combinations run (desk_dash classic and reverse, coffee_run, battery, soccer, koth classic and rush, sumo classic and drift, tag, last_standing). There were 0 stuck 5-second windows. Races finish 2 laps.
- **Conveyor zones:** they match the belts they sit on (transfer, curve bounding box, incline, bridge, decline, assembly), with height bands that leave the ground twin underneath alone.
- **Turntable and forklift beacon:** both run on the server clock.
- **Rotation contract:** lockers, flow racks, whiteboard, coffee counter, vending and fridge follow it, and none go into walls.
- **Screenshots from the car's seat:** grid, aisle, rack aisles, belt underside, curve, bridge, Packing and chute, canteen, QA ramp, clean room, office, Shipping pitch, Goods In, robot cells, plus the plan view. No holes, floating objects or z-fighting.
- **Draw calls:** the busiest view is 419 (the grid), under the 700 target.
