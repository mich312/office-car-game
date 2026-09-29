You are one of several parallel builders working on "Tiny RC Mayhem" (repo mich312/office-car-game), a multiplayer browser game: 18 cm RC cars racing and brawling through workplaces at toy scale. The session owner is building out several levels and upgrading every 3D model; other builders are working on other parts of the same codebase at the same time, in their own containers, so stay strictly inside your lane (below) — the owner merges all branches afterwards.

## Start
- You are on a checkout of branch `claude/maps` (latest commit "Engine for the new floors: world-space floors, zones, ramp skins, wall styles"). Work on top of it and push your work to your outcome branch (given below). Do NOT open a pull request.
- `npm ci` (or `npm install`), then `npm run build` and `npm test` to see the green baseline before you change anything.
- Stack: React Three Fiber + @react-three/rapier client (client/src), authoritative Node/ws server (server/src), shared pure modules (shared/src). CI runs `npm ci && npm run build && npm test`.
- Scale: 1 world unit = 22.5 cm; `M` = 4.444 units per metre (shared/src/constants.js). Maps are authored in metres; `u(v) = v * M`. The car is 18 cm long; the chase camera sits low behind it, so a desk is a building and a skirting board is a kerb. Heights matter: anything under ~0.12 m is a kerb the car can't climb without a ramp.

## How the game is put together (read these files first)
- `shared/src/map.js` — the MAPS registry (`office`, `cellar`), `isDecor`, `DECOR_TYPES`, `build()` which adds `roomAt`, `RUGS`, `REVERSE_CHECKPOINTS`, `REVERSE_BOT_PATH`.
- `shared/src/maps/cellar.js` — the reference for a complete non-office map: every key a map needs, plus client-only dressing data (LOOK, LIGHTING, AMBIENCE, CEILING_LIGHTS, FLICKER, PIPES, CABLE_TRAYS, MARKINGS, SIGNS, BOARDS, STAINS). `shared/src/maps/office.js` is the original floor.
- `client/src/game/themes/index.js` — the theme registry and its contract (Dressing / PIECES / PROPS). `client/src/game/themes/cellar.jsx` is the reference theme: instanced tube fixtures with deterministic flicker, pipes, floor markings, canvas-texture signs, and CellarPiece furniture (boiler, dock, pallet, cage, workbench, cabinet).
- `client/src/game/Office.jsx` — renders every map's floors (by room `floor`), walls (solid/glass/low), furniture (built-in types, then theme PIECES), ramps; the office's own ceiling/windows/skyline/light shafts when the map has no theme Dressing.
- `client/src/game/Props.jsx` + `client/src/game/propBody.jsx` — physics props; built-in prop types, then theme PROPS. Wrap a theme prop's meshes in `<Body p={p} mass={...}>` with a collider child (see Mug/CardboardBox in Props.jsx).
- `client/src/game/daylight.js` (`lightingFor(hour, lightsOut, map)`) and `client/src/game/Lighting.jsx` — a map's `LIGHTING` is either `{ fixed: {...state} }` (windowless) or a table per hour (`morning`, `afternoon`, `golden`, `night`) in the same shape as DAYLIGHT; plus `points: { color, distance }` and `glow: { at: [x, z], color } | null`. `CEILING_LIGHTS` are the point-light positions (keep it ≤ 7: point lights are the main fragment cost).
- `client/src/audio.js` — `map.AMBIENCE = { rain, hum, rumble, air }` (0…1) sets the room tone; one-shots your Dressing can fire: `audio.clank(at, strength)`, `audio.hiss(at, strength, len)`, `audio.ding(at, strength, hi)`, `audio.tubeBuzz(at, strength)` (`at` = [x, y, z] world units, positional).
- `client/src/game/OfficeBoard.jsx` (the live scoreboard; placed by map.BOARDS), `client/src/game/ModeObjects.jsx` (mode visuals, placed from map data), `server/src/modes.js` + `server/src/bots.js` (read `room.map`).
- Floors (`shared/src/surfaces.js`): carpet, carpet2, wood, tile, concrete, dark (raised floor), rug, marble (fast/slippery), epoxy (factory), rubber (matting). Floors are laid in WORLD space with real cell sizes (`SURFACES[x].cell`, metres: tile 0.6, raised floor 0.6, marble 1.2, wood 1.44 = 8 × 18 cm planks, rubber 0.5) and the seam bumps sit on the same world grid. `LOOK.floors` can tint a floor type per map.
- Engine hooks a map/theme can use (all documented in code): `map.RACE_LAPS` (laps per Desk Dash; default 2 — aim for a 90–105 m lap with 2 laps); `map.ZONES` (world-unit rects that change grip/top speed, carry the car like a conveyor `push: [vx, vz]` units/s, or push it on a shared cycle `gust`, each between heights y0..y1 — see LocalCar.jsx); `RAMPS` entries can name a `skin` drawn by a theme's `RAMP_SKINS` (ramps are now a deck on a solid wedge by default); wall entries can carry a `style` drawn by a theme's `WALL_STYLES` (fences, mesh guarding — colliders unchanged); a theme can export `Robot` to dress the cleaning-robot event; `map.EVENTS` renames an office event for the floor (`{ server_overload: { name, desc, icon } }`); furniture entries may be `{ decor: true }` (no collider, skipped by the server) or `{ driveUnder: true }` (for the geometry test). Bots are 2D and only avoid walls: any raised line (table top, conveyor) needs a ground-level twin the BOT_PATH follows; checkpoints are 1.58 m circles on the floor plan.
- The chase camera sits ~0.5 m above the car and ~1 m behind, with no collision: anything you drive UNDER needs ≥ 0.6 m clearance; the 0–1.2 m band of walls and the undersides of furniture fill most of the screen — spend detail there.
- Built-in furniture types you can reuse (Office.jsx): desk, table, ceodesk (drive-under tops on legs), sofa, rack, fridge, copier, whiteboard, bookshelf, rug, art, tv, booth, stall, sink, toilet, bartop, foosball, hoop, bench, planter, vending, and any other type string → a rounded box (recdesk, island, counter...). Built-in props: mug, glass, pen, stack, book, keyboard, monitor, chair, plant, bottle, basketball, marble, box, lamp, trash, roll.
- Headless match harness: `scripts/bot-sim.mjs` — `createSim({ seed, mode, bots, variant, map })`; `sim.run(seconds, onTick)`. Scripts must `process.exit()` at the end.
- Tests: `scripts/test-maps.mjs` checks EVERY map's geometry (rooms tile the floor, all spawns/checkpoints/pads/beans/zones in open floor, bot line and robot patrol never cut a wall or solid furniture, every checkpoint on the bot line, soccer goals are open doorways in x = const walls, grid faces checkpoint 0). `scripts/test-bots.mjs` races bots on every non-office map in both directions (≥90% must lap, mean first lap 18–70 s — aim for 25–45 s, every checkpoint reached) and runs every mode for 45 s. Both must pass.

## Screenshots — you must look at your work
- `scripts/shoot.mjs` (read its header). Setup once: `mkdir -p /tmp/pw && (cd /tmp/pw && npm i --no-save playwright@1.56)`. Chromium is at /opt/pw-browsers/chromium; do NOT run `playwright install`.
- Build the client (`npm run build`), start a server pinned to your map on a free port: `RC_MAP=<id> PORT=8123 node server/src/index.js &` (restart it after changing shared/ or server/ code; the client needs a rebuild after client changes).
- `PW_DIR=/tmp/pw PORT=8123 node scripts/shoot.mjs /tmp/shots '<json spots>' --plan` then open the PNGs with your Read tool and judge them like an art director. Iterate until each area genuinely looks good from the car's seat. It prints draw calls per shot (all render passes, shadows included): the cellar corridor is ~850 today, which is too many — aim for ≤ 700 in your busiest view; use instancedMesh / merged geometry (BufferGeometryUtils.mergeGeometries) / shared module-level materials for anything repeated, and castShadow only on things whose shadow reads.
- The renderer is SwiftShader in the container: slow but faithful. Allow ~20 s for the page to come up.

## Conventions
- Match the surrounding code: comment density and voice (short, concrete comments explaining *why*), naming, idioms. No TypeScript. No external assets — everything procedural (canvas textures in textures.js style, three.js geometry). Cache geometries/materials at module level or in useMemo; never allocate in useFrame.
- Keep draw calls sane: repeated items → instancedMesh; static decor → merged geometry (BufferGeometryUtils.mergeGeometries is available) where it helps.
- Commit messages: a short summary line, a blank line, a paragraph of why/what, and end with exactly these two lines:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Wv8a6nVQS2E4Ti4cLoM4Lx
- Do not put any model name/identifier anywhere else in the repo.
- Before you finish: `npm run build` and `npm test` green, commit, push your outcome branch (`git push -u origin <branch>`, retry on network failure).

## Your final message (the owner reads only this)
A concise report: what you built/changed (by file), the key numbers (bot lap times per direction, worst-shot draw calls), anything you had to change outside your lane and why, known gaps. Keep it under ~400 words.


## Your lane: make the IT Cellar really nice
Outcome branch: `claude/lvl-cellar`.

The user's words: "Continue with the levels, but make them really nice. Should look like these types of offices." One of the office types they named is an "IT cellar" with old fluorescent tubes ("Lichtröhren") that flicker. A first version exists (`shared/src/maps/cellar.js`, `client/src/game/themes/cellar.jsx`) and plays well: bots lap the figure-8 in ~29 s both ways, every mode runs. Your job is to turn it from a good greybox-plus-dressing into the best-looking floor in the game from an RC car's seat, without breaking its gameplay.

Take screenshots first (see "Screenshots") and write down what reads as fake or empty. Known weaknesses: walls are flat painted boxes (no block coursing, no conduit, no doors/frames at the openings, no fire doors, no noticeboards); the server hall's racks are black monoliths (they need front panels, blinking status LEDs — instanced, cheap — patch cables, a cold-aisle feel, raised-floor tiles with perforated vents, a CRAC unit); the helpdesk is sparse; the loading dock lacks a roller shutter, dock leveller, a pallet jack; the e-waste room needs piles of dead kit (CRTs, towers, keyboards, cable tangles) that look deliberately heaped; the archive wants proper shelving with boxes and lever-arch files; the corridor wants fire extinguishers, a notice board, a water cooler, door frames, a fire door on hold-open magnets, maybe a drip under a pipe; the flicker should also affect the ambient light on the walls near a dying tube; the floor could use scuffs, tyre marks, a drain grate, cable covers. Materials: painted concrete block walls (canvas texture with block coursing + normal), scuffed lino, dirty concrete.
Files you own: `shared/src/maps/cellar.js`, `client/src/game/themes/cellar.jsx` (you may add `client/src/game/themes/cellar-*.jsx` helpers). New furniture/prop types go in your theme's PIECES/PROPS (prefix new names `cellar_`). You may move props/furniture, but re-run the tests: test-maps (geometry) and test-bots (bots must still lap both ways, 25–45 s) must stay green.
Do NOT edit Office.jsx, Props.jsx, propBody.jsx, CarModel.jsx, ModeObjects.jsx, Lighting.jsx, daylight.js, audio.js, server/, other maps or themes — others are working on those in parallel (the built-in desk/rack/copier/vending models are being upgraded by another builder; if the racks need to look different in the cellar, make a `cellar_rack` piece). If you truly need an engine hook, make the smallest change and explain it.

## Art direction brief for the cellar (from the game's art director — follow it unless it conflicts with the rules above; you may improve on it)
# Four workplaces at 18 cm: art briefs

## Findings that apply to every map (measured, not guessed)

1. **Floor textures stretch with the room.** In `Office.jsx`, each floor type has one material with a fixed repeat, and that material is stretched once over each room's plane. `surfaces.js` places seam bumps the same way. Measured cell sizes:
   - Cellar Corridor B-1 tiles are **2.57 × 0.29 m (9:1)**, so they read as planks.
   - Office Lounge wood is 5.4:1 and the Cafeteria tile is 2.6:1.
   - The cellar Server Hall "dark" floor is one flat colour across 14 × 8 m.

   **Fix this before building new maps.** Use world-space UVs with a cell size per floor type in metres (tile 0.3/0.6, marble 1.2, raised floor 0.6, rubber 0.5), and have the seams in `surfaces.js` use the same metres.
2. **Bots are 2D and only know about walls.** `bots.js` (`wallBoxesOf`) uses the wall boxes only. It has no furniture and no heights. Checkpoints are 2D circles of 1.58 m (`CHECKPOINT_RADIUS` 7 u).
   - Every raised line (table top, conveyor, bridge) needs a ground-level twin, and `BOT_PATH` must follow the ground-level one.
   - Put each checkpoint after the high line and low line merge again.
3. **Camera.** The chase camera sits 2 u (about 45 cm) above the car and 4–5.6 u (0.9–1.26 m) behind it. It has no collision; `LocalCar.jsx` only keeps y ≥ 0.7 u. Two consequences:
   - Anything you drive under needs **at least 0.6 m of clearance**. Desks at 0.74 m work; a 0.42 m coffee table does not.
   - The **0–1.2 m band** of walls and the undersides of furniture fill most of the screen. Spend detail there.
4. **Lap length** (bot-sim, 6 bots, 2 seeds). With `laps: 2`, aim for **90–105 m** on new maps. For the cellar, either set laps per map or give it 3.

   | Map | Lap | Median bot lap |
   |---|---|---|
   | Office | 112 m | 40–45 s |
   | Cellar | 76 m | 31–34 s |
5. **The theme switch has only two options.** `Office.jsx` draws `CellarDressing` when the theme is `cellar`. Otherwise it draws the office's Ceiling, Outside, LightShafts and LightPools, and the shafts and skyline are fixed to north windows. Each new map needs:
   - a Dressing component
   - a Piece component (like `CellarPiece`/`CELLAR_TYPES`)
   - `LIGHTING` and `AMBIENCE`
   - its own window and shaft directions.
6. **Every ramp is the same object:** an 8 cm plank (`#c8b28a`) tilted in mid-air with nothing under it. Give `RAMPS` a `skin` and put a solid wedge under the deck. Each brief below names its skins.

---


(Owner's note on these findings: items 1 (world-space floors), 4 (RACE_LAPS per map), 5 (theme registry: Dressing/PIECES/PROPS/RAMP_SKINS/WALL_STYLES/Robot, LIGHTING, AMBIENCE) and 6 (ramps on a solid wedge + skins) are now implemented in the engine — use them. Items 2 and 3 are constraints you must design for.)

## 2. The IT Cellar: making it look better

**Keep:** the flicker model, which drives the tube, its light pool, a point light and a buzz. Also keep the figure-8 crossroads, the pipes, the centre line and the box junction. These are right.

**What holds it back (measured):**
- Corridor tiles are 2.57 × 0.29 m, and the raised floor has no grid.
- All 10 racks put their LEDs on +z only, because `rack` ignores `rotY`.
  - The north row blinks at the back wall, 1.2 m away.
  - From the corridor glass you see the unlit backs of the south row, so **the server hall reads as a black wall**.
- There are 93 identical tube fixtures: plain boxes, all one colour.
- The walls are one flat paint, the doorways are bare holes, and the ramps are the generic plank.
- The 76 m lap makes a 2-lap race about 65 s of bot time. Set `laps: 3` here.

**Feeling:** Underfunded, fluorescent, humming, slightly damp. These are the people who keep the company running and never get thanked.

**Cues:**
- Louvred fluorescent battens, with one tube dying.
- Glossy two-tone painted block walls with conduit on them.
- A glowing cold aisle behind glass.

**Plan changes.** The lap stays the same.
- **Server hall:** make the two rows face each other. Row A at z 9.3 faces south (`rotY` π), row B at z 6.7 faces north. The cold aisle between them, z 7.4..8.6, gets perforated tiles. Hang PVC strip curtains at both ends of the aisle (x −7.2 and −1.2). The rack backs face the corridor glass.
- **Corridor:** two yellow and black cable protectors across the straight at x −3 and x 10, each 0.5 m wide × 0.05 m tall. At a chassis height of 7.7 cm they are real kicks.
- **Boiler room:** a puddle at (−15, 6.5), grip ×0.7.

**Upgrades, most important first:**
1. **Floors.**
   - Corridor: 0.3 m speckled vinyl tiles in `#9aa39b`, with a 0.3 m border in `#6f7a73`.
   - Raised floor: 0.6 m tiles in `#8e949a` with `#2a2d31` trim. The cold aisle gets hex-perforated tiles with an additive `#4fa3ff` uplight under them. One tile is lifted and leaned on a rack as a ramp (0.6 × 0.6 m, 0.25 m rise).
   - Lab: anti-static vinyl `#aab6bf` with copper strips.
2. **Tubes.**
   - Make each fixture a louvre batten, 1.5 × 0.22 m, with a parabolic aluminium louvre texture underneath.
   - While the dying tube stutters, the **8 cm at each end glows `#ff8a5c` and the middle stays dark.**
   - Blacken the last 6 cm of every old tube.
   - Vary each tube's colour ±5% by hash, and give each room one warm replacement tube: 3000 K `#ffe0b0` among 6500 K `#e8fff4`.
   - Make the hum follow the nearest bad tube.
3. **Walls.** The bottom 0–1.2 m is what fills the screen.
   - Concrete-block relief, 0.4 × 0.2 m blocks.
   - Gloss oil-paint lower band from 0 to 1.4 m in `#6f8578` r0.3, with a 4 cm stripe in `#3f4f46`. Matt `#c3cabb` above.
   - Black rubber skirting, 10 cm.
   - Trolley scuffs at 0.1–0.4 m.
   - Grey conduit running down to sockets at 0.3 m.
   - Extinguishers standing on the floor.
4. **Doors.**
   - Steel frames `#8c9297`.
   - Fire doors propped open at 90° with a 12 cm wooden wedge that can be knocked away.
   - Kick plates and "B-1.07"-style room plates.
   - A badge-reader LED on the server hall door that turns from red to green when a car passes.
5. **Racks.**
   - Hex-perforated doors in `#1a1c20` and blanking panels.
   - A patch panel with blue, yellow and red cable loops.
   - Backs with cable waterfalls and blue power-strip LEDs.
   - A cooling unit (CRAC), 1.8 × 0.9 × 2.0 m in `#e6e8e6`.
   - A red fire-suppression cylinder.
   - A pushable KVM crash cart.
6. **Room heroes.**
   - **Helpdesk:** a red 7-segment "NOW SERVING 042" display that counts up on laps and goals, a take-a-number post, and a pile of returned laptops.
   - **Boiler room:** a yellow gas pipe `#e6c229`, red valve wheels, a pilot flame (`#ff9d4a`) flickering in a sight glass, and a red fault lamp blinking at 0.5 Hz.
   - **Dock:** a corrugated roll-up door with **daylight bleeding under it**, a 3 cm warm line of `#ffcf8a` across the floor with dust. It is the building's only daylight. Also yellow bollards (0.11 m across × 1.0 m), a checker-plate dock leveller, a pallet jack whose lowered forks act as kickers, and an amber beacon.
   - **E-waste:** old CRT monitors, a green mesh cage bin (1.24 × 0.84 × 0.97 m), and a cable tangle.
   - **Archive:** mobile compact shelving on floor rails. The rails, every 1 m, work as rumble strips. The shelves have hand wheels, and one bay can open and close on the match clock.
   - **Lab:** an oscilloscope showing a green trace.
7. **Ceiling:** board-marked concrete, with sprinkler heads on the red main that spray during the Sprinkler Test event.

**Lighting:** keep the fixed state, but add warm and cool accents so it is not all one green.
- Warm: the dock daylight line, the boiler pilot, the helpdesk lamps.
- Cold: the blue uplight in the cold aisle.
- Keep the green exit signs and the red fault lamp.

**Sound:** cooling-unit roar in the server hall only, low-passed at 900 Hz. Drips and a burner whoomp in the boiler room. A distant pipe flush. A helpdesk ding each time NOW SERVING goes up.

**Gameplay hooks:** the cable humps, the strip curtains (a half-second vision cut, which is good in Tag), the puddle, the leaned floor tile, the pallet-jack forks and the compact shelving. Ramp skins: steel dock plate, raised-floor tile, plank.

---



## The 3D model audit for the cellar's pieces (from the game's technical artist — implement it for the cellar's own PIECES; the built-in models (desk, rack, copier, vending, shelfrack…) are being rebuilt by the furniture builder in parallel, so don't restyle those)
# 3D model audit and improvement plan for Tiny RC Mayhem (office, cellar, props, cars, mode objects)

**Scope and method.** I read every model and then ran checks on the geometry. I bundled a snapshot of HEAD 8ec6c0b with esbuild, replacing React, R3F, Rapier and drei with stubs. The component functions were then called for real in node. That let me count draw calls (`mesh` / `instancedMesh` / `RoundedBox`), shadow casters and inline materials, and count triangles on real three.js geometries. I also used raycasts and bounding-box maths to check geometric defects. The scripts are in `/tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/models/`: `build.mjs`, `walk.mjs`, `furniture.mjs`, `props.mjs`, `car.mjs`, `carparts.mjs`, `geo.mjs`, `glass2.mjs`, `vinyl.mjs`, `shelf.mjs`, `rot.mjs`, `wallgap.mjs`, `scene.mjs`, `mode.mjs` and `uv.mjs`. Re-run them after each phase to check the targets below.

**The working tree changed while I audited.** Other agents are editing files right now:
- `Cellar.jsx` has moved to `client/src/game/themes/cellar.jsx`, which exports a `PIECES` registry.
- The prop `Body` has moved to `propBody.jsx`.
- New floor materials have been added.

The model code itself is the same as HEAD. Only its location and line numbers have changed, so this plan names functions and `case`s rather than line numbers.

**Where the camera sits.** The camera is at `pos.y + 2.0u`, about 0.52 m above the floor. It trails 0.9–1.3 m behind the car and looks about 11° down (`LocalCar.jsx`). What each height band needs:

| Height band | How it is seen | What it needs |
|---|---|---|
| 0–0.3 m | Close up, at a grazing angle, and as silhouettes against the floor | The most detail: feet, casters, plinths, kick panels, pipes, cable runs |
| 0.3–0.8 m | Straight on | Cabinet fronts, drawers, paper trays, modesty panels |
| 0.7–1.1 m | From underneath | Desk and counter undersides are always in view; they need rails, trays and overhang lips |
| Above 1.2 m | Steep angle from below, far away | Silhouette and texture only |

On the cars, the rear, the roof and the top of the rear tyres fill about a third of the frame at all times.

---

## 1. Verified defects (P0: wrong, not just plain)

| # | Defect | Evidence | Where |
|---|---|---|---|
| 1 | Wood on every `RoundedBox` piece reads as pinstripes. drei `RoundedBox` UVs are in world units, not 0..1, so `WOOD` (repeat [6,3]) tiles 42 × 10 times across a 1.6 × 0.8 m desk (planks about 5–10 mm wide). The same material on `boxGeometry` pieces (bartop, bench, foosball) gets 0..1 UVs, a 7× difference in grain density. | `uv.mjs`: desk top UV u 0→7.01, v −2.45→1; counter u 0→44 | `Office.jsx` desk/table/ceodesk, `SimpleBox` |
| 2 | `shelfrack` has no model. It falls through to `default`, which draws a solid white plastic box. That covers 4 in the office (storage, printer) and 7 in the cellar, including the whole Archive "shelf maze". | `furniture.mjs`: shelfrack = 1 RoundedBox | `Furniture` default |
| 3 | Bookshelf books are wrong. They always hang on local −x, so the CEO shelf at x = 13.45 has its books inside the wall. Each shelf has 28 books of 3.1 × 9.4 × 2.7 cm, spaced about 40 cm apart, only 0.24–0.78 m up a 2.2 m unit, and glued to the outside of a solid block. | `shelf.mjs`: "BOOKS INSIDE THE WALL" | `ShelfBooks` |
| 4 | `rotY` is ignored by `rack`, `fridge`, `copier`, `bookshelf` and `vending` (`SimpleBox` without `rotY`). The cellar copier and vending machine (authored at −π/2) face the north wall, and the vending machine clips 10 cm into the east wall. The office copiers face the wall 40 cm behind them. | `rot.mjs`, `wallgap.mjs` | `Furniture` |
| 5 | Both rotated sofas have w and d swapped. The client rotates the box, but the server (`SoccerController.boxes`, `server/src/modes.js`) ignores `rotY`. The reception sofa renders 2.4 m along x, passes through the west wall to x = −21.5 m (outside `MAP_BOUNDS`), and its back is outside the building. The CEO sofa's back faces the room. | `rot.mjs` | `shared/src/maps/office.js` data plus the server box list |
| 6 | Car glass is buried inside the paint. The rotated glass boxes cut through the curved shell. Drift rear glass: 6 of 7 samples are under the paint. Windshields (drift, balanced, monster): 4–5 of 7 are under the paint, 15–35 mm deep in real-world terms. The windows read as a thin strip, and there are no side windows. | `glass2.mjs` | `CarModel.jsx` `Body` |
| 7 | The top vinyl on the cars is a flat card floating above the curved body: up to 39 mm on the monster, 28 mm on drift, 26 mm on balanced and 24 mm on the buggy nose. | `vinyl.mjs` | `Vinyl` |
| 8 | Two hidden fill discs. The mug's coffee sits 4.5 mm below the closed cylinder's top cap, and the plant's soil sits 6.75 mm below the pot cap. Neither can ever be seen. | `geo.mjs` | `Mug`, `Plant` |
| 9 | The chair's star base has 10 spokes. Each 0.62 m arm box is centred on the axis, so 5 boxes make 10 tips. | `geo.mjs`: tips at 18, 54, … 342° | `chairBaseGeo` |
| 10 | Chairs spawn with their base collider 35 cm inside the floor slab. The origin is at the seat, with the body at `p.y + 0.4`. | `geo.mjs` | `Chair` |
| 11 | Foosball rods sit at x = ±0.84 m on a table only ±0.70 m wide, and float 3.6 cm above the playfield. There are 4 rods where a real table has 8, and the men are 1.8 × 4.5 × 1.6 cm. | `scene.mjs` | foosball |
| 12 | The hoop ring's inner diameter is 12.8 cm but the basketball prop is 24.2 cm across, so the ball can't go through. | `scene.mjs` | hoop vs `Basketball` |
| 13 | The coffee machine's box sinks 10.1 cm into the worktop. | `geo.mjs` | `CoffeeMachine` |
| 14 | The sink basins are about 1/3 scale (a flat ring with 13.5 cm outer diameter, sitting on the top, not recessed), and the taps are 7.9 cm tall. | code maths | sink |
| 15 | The whiteboard floats 25 cm off the wall and 9 cm off the floor with nothing holding it. Art hangs 4–8 cm off the walls, and one piece floats 27 cm in front of the reception glass. The TV is 8 cm off the wall with no bracket. | `wallgap.mjs` | whiteboard/art/tv |
| 16 | Beans: the `instancedMesh` always draws 255 capsules, 86.7k triangles, even when only about 26 beans exist. | `mode.mjs` | `Beans` |
| 17 | Some car parts are doubled. Drift always has a built-in wing plus the spoiler slot, a built-in side pipe plus the exhaust slot. Monster has a built-in bull bar plus the front slot, and built-in stacks plus the exhaust slot. Formula's built-in rear wing plus the spoiler slot. | code | `Body` vs slots |
| 18 | The can from the vending machine spawns inside the machine's collider (`V.z + 1.1u` = 25 cm, while the front face is 40 cm out). | code | `Can` |

---

## 2. Measured baseline and budgets

| Area | Now (measured) | Target |
|---|---|---|
| Office furniture | 76 pieces, 281 draws, 208 shadow casters, 57.5k tris, 74 inline materials | ≤ 70 draws after static batching (about 25–40 visible), ≤ 90 shadow draws, ≤ 180k tris |
| Cellar furniture | 39 pieces, 171 draws, 114 shadow casters, 24k tris | ≤ 45 draws, ≤ 120k tris |
| Office props | 145 props, 402 draws, 152 shadow casters, 282 inline materials | ≤ 220 draws, 0 inline materials |
| Cellar props | 80 props, 219 draws, 182 inline materials | ≤ 120 draws |
| Car, stock | 74–79 draws (36 of them wheels at 9 per wheel, 12 suspension); 6.9–7.3k tris, of which the coils are 4.5k and the shell only **164–284** | ≤ 28 draws, ≤ 12k tris (shell 1–1.5k) |
| Car, fully kitted | 125–130 draws | ≤ 40 draws |
| Glass walls (office) | 20 segments × 3 = 60 draws | 3 (merge pane, smudge and rail) |
| Powerup pads | 32 meshes + 16 TextSprites | 2 instanced draws |

**Detail tiers** (hard caps for every existing and future piece):
- **A, hero** (driven past at under 1 m; ≤ 12 per map: counter, reception desk, copier, vending, racks, sofas): ≤ 4k tris, ≤ 4 materials. Every feature larger than 1 cm below 0.8 m must be geometry.
- **B, repeated** (desks, tables, chairs, shelves): ≤ 2.5k tris, ≤ 3 materials, one shared cached geometry per size.
- **C, wall and high decor** (art, TV, whiteboard, signs): ≤ 300 tris, detail comes from textures.
- **Props:** ≤ 800 tris, ≤ 2 materials, geometry and materials shared per type.

---


## 5. Cellar pieces (HEAD `Cellar.jsx` `CellarPiece`, now `themes/cellar.jsx` `PIECES`)

**boiler: 2.5/5**
- A concrete plinth 0.1 m, square 2.6 m.
- A burner housing at the bottom front `rbox(0.6, 0.5, 0.3)` with a sight glass: an emissive orange disc driven by the existing flicker helper, at eye level.
- Insulation panel seams via normal bands.
- 2–3 flanged pipes (r 0.06–0.1) from the dome to the ceiling pipes, with flanges (`cyl` r + 0.03, h 0.03) and a red handwheel (torus r 0.12) at 1.2 m.
- A data plate (canvas).

**heater: 2/5**
- 3 legs 0.1 m, 2 copper pipes (`MAT.copper` `#b87333`) to the ceiling, a gas control box at 0.3 m, and a relief-valve discharge pipe to the floor.

**dock: 2/5**
- A yellow steel edge angle (0.1 × 0.1 L) on the drive face, and a chequer-plate leveller 2 × 1.8 m inset in the top.
- Bumper bolt heads.
- 2 yellow bollards (`cyl` r 0.06, h 0.9).
- A 3-step steel stair at one end.
- Use metre UVs so the hazard stripe lines up.

**pallet: 3/5, 8–24 draws each**
- A proper EUR pallet (1.2 × 0.8 × 0.144): 3 bottom boards, 9 blocks, 3 stringer boards, 5 top boards.
- One cached merged geometry per size, so 1 draw after batching.
- The stack variant gets a shrink-wrapped load (translucent white `rbox`).

**cage: 2.5/5**
- Posts `rbox(0.04)` with top, mid and bottom rails.
- Mesh as a 0.05 m square grid in metre UVs, replacing the "one X per tile, 10 repeats" texture (cells are currently 14–20 cm and change with panel size).
- A door with a hasp and padlock.
- E-waste inside: 2 CRTs (`rbox` plus a curved front), stacked PCs and a cable tangle (`tube`s), instanced from a small kit.

**workbench: 2.5/5**
- 0.05 m square steel legs.
- A lower MDF shelf at 0.2 m with boxes.
- A 1.2 m pegboard back (new `pegAlphaTex`) with tool silhouettes.
- A vise (merged boxes), a power strip, a soldering station with a coiled cable, and a grounding cord on the ESD mat.

**cabinet: 2/5**
- Drawer fronts with 3 mm seams, recessed 0.2 m pulls (not bars 0.9 m long on the 1.8 m unit), chrome label holders with cards, a 0.05 m kick and a top lock.
- The server-hall cabinet at (2.4, 10.4) is the UPS. Add a `kind: 'ups'` field: black, with a small LCD, vent grilles and a status LED bar.

---


## 9. `textures.js` additions (all procedural, metre-tiled)

`veneerTex`, `brushedRough`, `perfAlphaTex` (hex and round), `slotAngleTex`, `gridMeshAlphaTex` (0.05 m), `netAlphaTex`, `pegAlphaTex`, `terrazzoTex`, `leatherNormal`, `cardboardTex` (atlas), `paperEdgeTex`, `labelAtlas` (vending, LiPo, copier UI, fridge, logo), `rugTex(palette)`, `artTex(seed)`, `scribbleTex`, `serverBezelTex`, `chequerNormal`, `ballSeamTex`, `leafAtlas`.

Keep the existing rules: normal and roughness maps use `NoColorSpace` and wrap at the seams.

---
