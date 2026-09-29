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


## Your lane: build the map "factory" — Werk 2 — printer assembly
Outcome branch: `claude/lvl-factory`.

The user's words: "Continue with the levels, but make them really nice. Should look like these types of offices." The four office types they asked for are a software dev garage, an IT cellar with flickering fluorescent tubes (Lichtröhren), a management tower office with a war-room meeting room, and a printer assembly. You own **Werk 2 — printer assembly**. It must be the best-looking floor in the game when you're done — a place someone recognises instantly from an RC car's point of view, with a signature Desk Dash moment.

Files you own (create them):
- `shared/src/maps/factory.js` — the complete map object `export const FACTORY = { id: 'factory', name: 'Werk 2', blurb: '…', theme: 'factory', …every key test-maps.mjs requires… }` in the style of cellar.js (authored in metres, comments that explain the design).
- `client/src/game/themes/factory.jsx` — `Dressing`, `PIECES`, `PROPS` per the contract in themes/index.js.
Registration (the only lines you may touch in shared files): in `shared/src/map.js` add the import and `factory: build(FACTORY),` after cellar; in `client/src/game/themes/index.js` add the import and the `factory` entry.
Rules for your lane:
- Room ids must be globally unique: prefix every room id with `factory_` (e.g. `factory_lobby`).
- New furniture and prop type names must be prefixed `factory_` (e.g. `factory_conveyor`) — other builders are adding types in parallel. Reuse built-in types (desk, table, rack, copier, vending, sofa, …) where they fit; other builders are upgrading those built-in models right now, so don't restyle them — your theme pieces are for things the game doesn't have yet.
- Put any procedural textures your theme needs inside your theme file (don't edit textures.js — others are). You may import existing helpers from ../textures.js and ../roundedGeo.js.
- Do NOT edit Office.jsx, Props.jsx, propBody.jsx, CarModel.jsx, ModeObjects.jsx, Lighting.jsx, daylight.js, audio.js, server/, other maps or themes. If you truly need an engine hook, make the smallest possible change and explain it in your report.
- The mode objects render from your data: the coffee machine (ModeObjects CoffeeMachine) sits at 0.92 m on top of whatever is at COFFEE_MACHINE — put a counter/bench there, the machine faces +z; the vending machine event needs a `vending` furniture piece at VENDING; the printer event (paper blast) should have a copier/printer at PRINTER; the scoreboard hangs where BOARDS says (on a wall face).
- Gameplay: Desk Dash needs a real lap (12–16 checkpoints, bot line threading every door with ≥0.3 m clearance, 25–45 s bot lap), a reverse variant that works (REVERSE_SPAWN_ROTY), a signature moment (ramp/jump, crossover, a long straight, a slalom), RC Soccer in a room whose two goals are doorways in x = const walls, 10+ standup (KOTH) spots, 12–16 powerup pads, ~26 beans, a robot patrol, a sumo zone whose r0 covers the whole floor. Ramps onto furniture are what make this game fun — give the floor 4–6 good ones.
- Look: rooms feel furnished and lived-in at car height (under desks, around chair legs, along skirting), with 60–120 props. Lighting that sells the place (LIGHTING + CEILING_LIGHTS + emissive fixtures in your Dressing), room tone via AMBIENCE, signage/markings where the place would have them, something that moves (animated set pieces in the Dressing: fans, conveyors, screens, blinking LEDs, elevators…) with the occasional one-shot sound.

Owner's notes for the Printer Assembly (id `factory`, const `FACTORY`):
- A printer factory hall. The hero is the assembly line: conveyors (animated belt texture + rollers) carrying printer chassis station by station — chassis, rollers going in, toner cartridges, a QA station test-printing pages, the packing station boxing them. Robot arms at stations (animated, audio.hiss/clank on each move, cheap). Pallet racking with boxed printers, shrink-wrapped pallets, a parked forklift (its forks are a ramp), a pallet jack, cable drop reels, yellow safety bollards, a shipping dock with roll-up doors, a glass QA lab, a break room with coffee and vending, a supervisor's office.
- Floor markings are the identity: epoxy floor with yellow walkway lines, black/yellow hazard stripes, forklift lanes, zone labels painted on the floor (decals). Floors: epoxy (hall), concrete (dock), tile (break room), carpet (office).
- The Desk Dash lap should use the line: a long straight along the conveyor, a jump across it (ramp off a pallet), a run through the packing station.
- Light: windowless or high clerestory — a fixed LIGHTING state, high-bay LED fixtures (emissive discs, instanced), cool-neutral 5000 K; the QA lab brighter/whiter; a rotating amber beacon on the line (animated). Room tone: AMBIENCE { rain: false, rumble: 0.8, hum: 0.2 }.
- Keep the conveyors' collision simple (static boxes the car can't mount without a ramp, or low enough rails); the moving belts are visual.


## Art direction brief (from the game's art director — follow it unless it conflicts with the rules above; you may improve on it)
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

## 4. Werk 2: printer assembly
`factory` · 44 × 26 m (x −22..22, z −13..13) · outer walls 7 m, inner partitions 2.2–3 m tall (mesh or block) · has time of day (sawtooth roof and open dock doors)

**Feeling:** A bright, orderly, loud hall that turns out 1,300 printers a shift. Everything is colour-coded and something is always moving.

**Cues:**
- A conveyor of half-built printers weaving between orange robot arms behind yellow and black guarding.
- Epoxy floors with yellow aisle lines, green walkways and hazard stripes.
- An Andon status board and green/amber/red stack lights, under a sawtooth roof with a huge, slow ceiling fan.

| Zone | x | z | Floor |
|---|---|---|---|
| Main Aisle | −22..22 | −2..2 | epoxy |
| Goods In (dock) | −22..−12 | −13..−2 | concrete |
| Shipping Hall | −12..4 | −13..−2 | epoxy |
| Packing | 4..14 | −13..−2 | concrete |
| Canteen | 14..22 | −13..−2 | tile |
| High-Bay Store | −22..−10 | 2..13 | concrete |
| Line 2 | −10..12 | 2..13 | epoxy |
| QA Test Bay | 12..22 | 2..7 | rubber |
| SMT Clean Room | 12..22 | 7..13 | dark, tinted `#b8c4cc` |

**Openings:**
- **Dock doors:** two open on the south wall (x −20..−17 and −16..−13), one on the west wall (z −10..−6.5).
- **Shipping:** a mesh fence along z = −2 with gates at x −9..−7.2 and 0..1.8.
- **Goals:** a fence gate at x = −12 and a block-wall door at x = 4, both z −8.4..−6.6.
- **Packing to aisle:** a mesh fence with a single opening at x 5..7.
- **Canteen:** door to packing at x = 14, z −7.9..−6.1; door to the aisle at z = −2, x 17..18.8.
- **Line hall to aisle:** a mesh fence with gaps at x −8..−6 and 5..7.
- **Store to Line 2:** the rack backs, with a gap at z 10..12.
- **Line 2 to the east rooms:** glass at x = 12, with strip-curtain doors into QA and the clean room.

**Hero: the Line 2 conveyor.**
- **Belt:** 0.8 m wide, top at 0.85 m, with 8 cm kick rails.
- **Path of the belt:**
  1. A feed ramp at x −9.5..−7.5.
  2. East along z 8.5.
  3. A 90° roller curve (radius 1.2 m) at x 9.2.
  4. South, climbing to 1.2 m.
  5. **A bridge over the aisle** (z 2..−2, 1.05 m clearance underneath).
  6. Down into Packing by z −6.
- **Belt movement:** the belt adds 1 m/s (4.4 u/s) to any car on it. This surface velocity is a new mechanic.
- **Printers on the belt:** half-built printers (0.45 × 0.35 × 0.25 m, kinematic) ride it every 1.5 m.
- **Robots:** four six-axis arms at x −5, −1, 3 and 6.5, alternating sides.
  - Base 0.5 m across. Upper arm 1.0 m, forearm 0.9 m.
  - A 0.25 m gripper collider sweeps 0.3–0.5 m above the belt for 1.5 s every 6 s.
  - Drive the motion from the match clock so every client sees the same arms.

**Desk Dash, about 93 m.** The route in order:
1. Grid at x 15..20, facing west, under the Andon gantry. **The stack light counts down red, amber, green.**
2. The 44 m aisle, passing **under the bridge**.
3. North through the rack slalom, then east into Line 2.
4. Up the feed ramp and along the belt past the robots.
5. Round the roller curve and **over the bridge, above the start straight**.
6. Down into Packing, through the Canteen, and back to the finish.

The ground-level twin, which is also the bot path, runs under the belt and through the gap at x 6 to cross the aisle at a yellow box junction. Cars cross the start straight at floor level while others fly over them. It is the cellar's figure-8 crossroads, but on two levels.

Checkpoints: (16,0) (9,0) (−4,0) (−16,0) (−16,7) (−13,11.5) (−8.5,8.5) (1,8.5) (9.2,6) (8,−5.5) (14,−7) (18,−7) (17.9,−2).

**Mode spots:**
- **Soccer:** the Shipping Hall, 16 × 11 m. Goals are "Goods-In" and "Packing". Paint a yellow centre circle; a factory floor already looks like a pitch.
- **Coffee:** a bean-to-cup machine at (21.3, −8).
- **Vending:** three machines at x 16..19, z −12.5.
- **Printer:** the QA bay at (17, 4.5). The printer hazard finally lives among printers.
- **Battery:** the box junction at (6, 0).
- **Sumo:** (−4, −7.5), under the big fan.
- **Robot event:** reskin it as an automated floor cart (AGV) following a floor tape line.
- `LIGHTING.glow`: amber at the Andon board.

**Set pieces and props:**
- **Pallet racking.**
  - Three north–south rows at x −20.4, −16.8 and −13.2, with 2.5 m aisles.
  - Blue uprights `#1f4fa0` and orange beams `#e2611f` at 1.2 m and 2.4 m.
  - Empty ground bays can be driven through under the 1.2 m beam.
- **Andon gantry:** a portal with a beam at 3.5 m holding a 3.2 × 1.0 m LED board. It reads "LINE 2 · TAKT 42 s · PLAN 1300 · ACT 1184", and ACT counts up with laps and goals.
- **Forklift:** 2.3 × 1.1 × 2.1 m, with its forks tilted down as twin kickers. It has a blue warning spot on the floor 3 m ahead and an amber beacon.
- **Stretch-wrap turntable:** 1.65 m across × 0.08 m tall, turning at 12 rpm, with a 2.4 m mast.
- **Ceiling fan (HVLS):** 6 m across, yellow hub, at 6.3 m, turning at 20 rpm.
- **QA benches:** 2.4 × 0.8 × 0.9 m, which cars drive under. Printers on them spit test pages.
- **Clean room:** pick-and-place machines (1.2 × 1.6 × 1.5 m) and a 4 m reflow oven with an orange-lit window.
- **Upper frame:** an overhead chain conveyor at 3.5 m carries printer housings, so the top of the screen always has motion.
- **Canteen:** lockers, and long tables that cars drive under.

**Lighting.** Use a per-hour table.
- **Daylight:** the sawtooth roof faces north and gives soft, even light from the sky. Direct sun only comes through the dock doors: from the west at golden hour and from the south in the morning.
- **Artificial light:** high-bay LED discs at 6.5 m, 5000 K (`#f2f6ff`). Allow a point-light reach of about 30 m.
- **Night shift:** the skylights go deep blue. Light comes from white LED bars on the robot cells, the stack lights, the amber Andon board and the forklift's blue spot.
- **Line Stop event** (a reskin of Server Overload): the Andon board turns red, the stack lights go red, the belt stops and a siren sounds.

**Sound:** conveyor rumble, pneumatic hiss, robot servo whine timed to the arm swings, a forklift reversing beeper, inkjet printing, PA announcements, and an Andon chime.

**Palette:**
- **Floors:** epoxy `#9aa3a6` r0.3, aisle `#6f7b77`, walkway `#3f8f5a`.
- **Safety and guarding:** safety yellow `#f2c200`; black mesh `#1c1d1f`.
- **Machines:** robots `#f07a1a` r0.35 m0.2 with joints `#26282b`; conveyor frame `#c4c8cc` m0.8; belt `#1d1e20`.
- **Product:** printers `#e8e8e4` and `#3a3d42` with brand blue `#1f6fd6`; cardboard `#b88a58`; stretch film `#dfe8ee` at 35% opacity.
- **Building:** walls `#e9ebe8` with a 2 m lower band in `#6f767b` and a hazard band at the base.

**Signs and markings:**
- "INKORA · WERK 2" in 3 m wall letters.
- Hanging zone boards, yellow on black.
- "214 DAYS WITHOUT A LOST-TIME INCIDENT", which **resets to 000 after a big crash**.
- On the floor: 10 cm yellow aisle lines, footprint stencils, 45° hazard stripes, STOP bars, bay labels A-01 to A-08, and the AGV tape line.

**Gameplay hooks:**
- The belt ride and the robot sweeps.
- The bridge versus the crossing.
- Drive-through rack bays and the forklift fork kickers.
- The turntable, which works as a King of the Hill spot that throws you off.
- Paper drifts in QA with low grip, growing during Paper Storm.
- A sticky mat at the clean room door (more grip) versus the rubber mats (slow).
- The AGV patrol.
- Ramp skins: checker-plate steel with yellow edges, the conveyor feed ramp, forklift forks.

