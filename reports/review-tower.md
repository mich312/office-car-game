# Review: the management tower (48th floor)

## What I fixed

- **Leak every time the tower is visited** (`themes/tower.jsx`, `tower/live.jsx`, `tower/view.jsx`, `tower/props.jsx`). I counted live WebGL buffers across four office↔tower switches. Before the fix each visit added **+146 buffers**; after it the count is flat (+6 a cycle, which is not the tower's, see below). Each visit also left **one more looping noise source and LFO running**, from the helicopter chopper, which only ever set its gain to 0. Now disposed on unmount: the baked floor, the city, video wall (a 1536×864 canvas texture), rain sheet, olive canopy, gondola, placard geometry and the theme's materials. The chopper's nodes are stopped and disconnected, and the phone-trill `setTimeout`s are cleared.
- **The sky's sun was stuck in the west** (`view.jsx`). It read the sun direction through `camera.parent`, which is always null, so the disc and glow stayed at the golden-hour default at every hour. It now follows the hour table that Lighting.jsx aims the light from. A morning shot facing east shows the disc on the light's side.
- **Tower LIGHTING ignored by its own theme.** Lamps, onyx, fire, light pools and rain called `lightingFor` without the map, so they used the default office values. They now pass the map.
- **The war-room high line stalled on the table** (`tower/build.js`). The folio kicker's leading edge stood 1 cm proud of the lacquer. In a driven run the car stopped at x≈1.7 m for 20 s at 0.3 speed, with a pushed placard jammed against that edge. Now the edge is flush, and the same run crosses the whole table, launches off the end and lands at x≈3.75.
- **Colliders that disagreed with the visuals** (`build.js`):
  - The lobby Barcelona benches (in the soccer pitch), the loungers and the terrace bench had solid boxes where the model shows open air under the seat.
  - The bullpen desk rows had 0.7 m walls at their open ends and no trestles in between.
  - All now collide as drawn. Proof: a driven car goes under a bench to the glass (z −11.81), under a lounger to the balustrade, and under a desk row to its privacy screen.
- **The terrace step left a 10 cm slot** before the bench (`maps/tower.js`: 10.25→10.35). It now meets the bench; a driven car goes up the step and along the bench.
- **Placard names drifted** between clients and between visits because they came from a module counter. They now come from the prop index.
- **Signs hanging in door openings.** The COMMS plaque floated in its doorway and EXECUTIVE LOUNGE hung half over the lounge door. Both are now on solid wall, and the EXIT sign in the corridor mouth now sits tight under the ceiling.

`npm run build` and `npm test` are green (970 PASS).

## Out-of-lane findings

1. **Major — the cellar leaks across map switches.** Using the same GL-buffer counter on office↔cellar gives **+46 buffers and +2 textures every cycle**, still growing after four cycles. Quick play changes map every round, so this grows for the whole session. Suggested fix: dispose the cellar's per-mount geometries, materials and textures in `useEffect` cleanups, as `cellar.jsx:62` already does for its parts.
2. **Minor — about 6 buffers a cycle leak on any switch**, even office↔tower after my fixes, so it is probably the office side or shared code. It needs the same counter run on its owner's files to find.
3. **Minor — the robot's point light forces a shader recompile.** The robot's light (`ModeObjects.jsx:968`, and the themes' `Robot` skins) only counts while the robot is visible. The first robot event therefore changes the number of point lights and recompiles every lit material, a one-off hitch per session. Suggested fix: keep the light mounted all the time with intensity 0 when there is no robot, instead of hiding it with the group's visibility.
4. **Minor — the chase camera clips into furniture.** Parked under a bench against the glass, the camera ends up inside the seat and shows only the seat's underside (LocalCar camera code). Suggested fix: a short raycast from the car to the camera that pulls the camera in front of any fixed collider.

## Checked and fine

- All eight modes on this map: bot laps both ways (12/12), every checkpoint reached, sumo knockouts, moving-meeting ring following, coffee deliveries, battery reach, soccer goals, LCS closures, and standup discs never behind glass (test-bots, test-modes).
- The balustrade holds: a driven car stops at x 20.79.
- Nothing client-side that moves (lifts, gondola, olives, screens) carries a collider, so two clients cannot disagree about one. The gust cue uses the same clock as the gust force.
- Draw calls peak at 528 (pantry) and stay ≤ 447 in the war room. No page errors in any shot.
