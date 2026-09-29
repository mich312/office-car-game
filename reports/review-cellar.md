# Review: the IT Cellar

## Fixed (commit f214c3b)

- **The flicker wasn't the same for every player.** `cellar-tubes.jsx` said "the same tube misbehaves the same way on every client", but it ran on `clock.elapsedTime`, which starts when each page loads. The rack LEDs, the boiler burner and the tube buzz in `cellar-live.jsx` had the same problem. They now all read `cellarNow()`, which is the server clock (`performance.now() + net.clockOffset`) wrapped to the hour. An hour is a whole number of every flicker cycle, and the wrap keeps the `hash()` inputs as small integers. The strike throttle compares with `Math.abs`, so the hourly wrap can't silence it.
- **The flicker was fast enough to be a photosensitivity risk.** The dying tube over the crossroads toggled at 16 Hz, and a 9-intensity point light followed it. All hard on/off steps now happen at most 5 times a second. Measured over 10 minutes of simulated time, the worst one-second window had 7 flashes before (dying), 5 (stutter) and 3 (dead). It now has 3, 3 and 2, which is within the 3-flashes-per-second limit. The tube still stutters, catches, holds and dies.
- **GPU memory leaked on every map change.** Tubes, rack LEDs, boiler, dock beacon, NOW SERVING, scope, curtains, badge reader, sprinklers, drips, puddles and the robot built their geometry, materials and canvas textures in `useMemo`. R3F never disposes objects passed in as props, so nothing freed them. A new `useDispose()` hook in `cellar-live.jsx` frees them on unmount. The room-tone panners are now disconnected too. I counted live WebGL objects by wrapping create/delete calls in Chromium over 5 office↔cellar round trips. Before: +46 buffers and +2 textures per round trip. After: +6 buffers and +0 textures. The remaining 6 didn't come from any cellar component I could find.

Checks: `npm run build` and `npm test` pass. Screenshots of every room are after the fix.

## Out of lane

- **major — the tower and factory leak GPU memory on every map switch.** With the same measurement (office↔X, 5 round trips), the tower gains +146 buffers per round trip and the factory +179 buffers and +4 textures. Quick play changes map every round, so this keeps growing. Proposed patch: the same pattern as `useDispose()` in `cellar-live.jsx`. Dispose every `useMemo`-built geometry, material and CanvasTexture in `themes/tower*` and `themes/factory.jsx` on unmount, and dispose the merged batches the way the cellar's `Dressing` does.
- **minor — `scripts/shoot.mjs --plan` renders an empty frame on the cellar.** The camera sits at y = 130, and the plan comes out as the background colour only. It's a tooling issue, not a gameplay one. Proposed patch: lower the override height, or hide the ceiling cell while `photoMode` is on.
- **minor — the chase camera clips into furniture and walls.** At (-10.5, -4, yaw −130) the view is inside the wrapped pallet box. At (-12, -2, yaw −160) it is inside the corridor's south wall. The fix belongs to the chase camera in `LocalCar.jsx` (a ray from the car to the camera against static colliders), not to the map.

## Checked and fine

- **Every mode runs on the cellar.** Bot-sim, 8 bots, seeds 1–3: desk_dash (classic and reverse, podium at 81–104 s), coffee, battery, soccer, koth (classic and rush), sumo (classic and drift), tag and last_standing. Every match reached the podium, and no bot stood still for 8 s anywhere. Scores were spread sensibly.
- **Draw calls** are 210–435 across 19 viewpoints, with the corridor the busiest, so under the 700 budget. I saw no floating or sunken pieces, holes or z-fighting from the car's seat. Signs are readable, and the lighting is cold and green without being blown out.
- **Colliders:** rotated footprints pass in test-maps. By reading the code, the colliders match the visuals for the bench, boiler, pallet jack forks, fire-door leaves, dock and rolling shelf. The rolling bay's travel leaves a gap of at least 0.6 m to its neighbours, so it can't crush a car.
- **No per-frame allocation** in any cellar `useFrame`, apart from the sprinkler head sort, which runs twice a second and only during the sprinkler event.
