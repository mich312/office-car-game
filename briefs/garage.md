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


## Your lane: build the map "garage" — Garage Zero — the software dev garage
Outcome branch: `claude/lvl-garage`.

The user's words: "Continue with the levels, but make them really nice. Should look like these types of offices." The four office types they asked for are a software dev garage, an IT cellar with flickering fluorescent tubes (Lichtröhren), a management tower office with a war-room meeting room, and a printer assembly. You own **Garage Zero — the software dev garage**. It must be the best-looking floor in the game when you're done — a place someone recognises instantly from an RC car's point of view, with a signature Desk Dash moment.

Files you own (create them):
- `shared/src/maps/garage.js` — the complete map object `export const GARAGE = { id: 'garage', name: 'Garage Zero', blurb: '…', theme: 'garage', …every key test-maps.mjs requires… }` in the style of cellar.js (authored in metres, comments that explain the design).
- `client/src/game/themes/garage.jsx` — `Dressing`, `PIECES`, `PROPS` per the contract in themes/index.js.
Registration (the only lines you may touch in shared files): in `shared/src/map.js` add the import and `garage: build(GARAGE),` after cellar; in `client/src/game/themes/index.js` add the import and the `garage` entry.
Rules for your lane:
- Room ids must be globally unique: prefix every room id with `garage_` (e.g. `garage_lobby`).
- New furniture and prop type names must be prefixed `garage_` (e.g. `garage_conveyor`) — other builders are adding types in parallel. Reuse built-in types (desk, table, rack, copier, vending, sofa, …) where they fit; other builders are upgrading those built-in models right now, so don't restyle them — your theme pieces are for things the game doesn't have yet.
- Put any procedural textures your theme needs inside your theme file (don't edit textures.js — others are). You may import existing helpers from ../textures.js and ../roundedGeo.js.
- Do NOT edit Office.jsx, Props.jsx, propBody.jsx, CarModel.jsx, ModeObjects.jsx, Lighting.jsx, daylight.js, audio.js, server/, other maps or themes. If you truly need an engine hook, make the smallest possible change and explain it in your report.
- The mode objects render from your data: the coffee machine (ModeObjects CoffeeMachine) sits at 0.92 m on top of whatever is at COFFEE_MACHINE — put a counter/bench there, the machine faces +z; the vending machine event needs a `vending` furniture piece at VENDING; the printer event (paper blast) should have a copier/printer at PRINTER; the scoreboard hangs where BOARDS says (on a wall face).
- Gameplay: Desk Dash needs a real lap (12–16 checkpoints, bot line threading every door with ≥0.3 m clearance, 25–45 s bot lap), a reverse variant that works (REVERSE_SPAWN_ROTY), a signature moment (ramp/jump, crossover, a long straight, a slalom), RC Soccer in a room whose two goals are doorways in x = const walls, 10+ standup (KOTH) spots, 12–16 powerup pads, ~26 beans, a robot patrol, a sumo zone whose r0 covers the whole floor. Ramps onto furniture are what make this game fun — give the floor 4–6 good ones.
- Look: rooms feel furnished and lived-in at car height (under desks, around chair legs, along skirting), with 60–120 props. Lighting that sells the place (LIGHTING + CEILING_LIGHTS + emissive fixtures in your Dressing), room tone via AMBIENCE, signage/markings where the place would have them, something that moves (animated set pieces in the Dressing: fans, conveyors, screens, blinking LEDs, elevators…) with the occasional one-shot sound.

Owner's notes for the Dev Garage (id `garage`, const `GARAGE`):
- A startup born in a suburban double garage that grew into the house next door. The roller door is UP: the lap runs out onto the driveway (an `outdoor: true` room, concrete) and back in. Your Dressing must build what's outside — sky, a suburban street (houses, fences, trees, a basketball hoop over the next garage, parked car), since the office's own skyline/rain only renders for the office. Keep outside geometry cheap (billboards/low-poly, instanced trees).
- Inside: desks made of doors on sawhorses, monitor arms, a DIY server "rack" of old tower PCs on a shelf, pegboard wall of tools, whiteboards dense with architecture diagrams and a burndown chart (canvas textures), beanbags, an old sofa, a ping-pong table as the meeting table, a mini-fridge, pizza boxes and energy drink cans (your own props), string lights (emissive, instanced), an extension-cord spaghetti on the floor (decor), a workbench with a 3D printer (animated head). Hero piece: a classic car under a half-pulled dust cover in one bay, with a ramp onto its bonnet — the jump off its roof is the lap's signature moment.
- Floors: concrete (garage), rubber matting (gym/workshop corner), wood or carpet in the converted house rooms (kitchen, "boardroom" = the old living room), tile in the kitchen.
- Light: time of day matters here — omit LIGHTING hours so it inherits the office's daylight (morning/afternoon/golden/night), set points/glow for the interior, and make golden hour through the open roller door the money shot. At night the string lights and monitors carry the room.
- Room tone: AMBIENCE { rain: false or light, air: small }; a radio or the 3D printer could beep (audio.ding) now and then.


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

## 1. Garage Zero: software dev garage
`garage` · 40 × 24 m (x −20..20, z −12..12) · WALL_HEIGHT 2.7 m · has time of day

**Feeling:** It is day 400 of a startup that still lives in the founder's double garage and has quietly taken over the house. It is warm, cluttered and hopeful. The door is open and it is sunny outside.

**Cues:**
- A roll-up door, half open onto a sunlit driveway, with a basketball hoop above it.
- Desks made from hollow-core doors on sawhorses, under Edison string lights and a pink "SHIP IT" neon.
- A car up on a two-post lift beside a pegboard of tools. The startup literally lifted the car to make room.

| Zone | x | z | Floor |
|---|---|---|---|
| Driveway (outdoor) | −20..6 | −12..−4 | concrete |
| Front Lawn (outdoor) | 6..20 | −12..−4 | carpet2, tinted turf |
| Garage Bay | −20..−8 | −4..5 | concrete |
| Dev Pit | −8..6 | −4..5 | epoxy |
| Laundry "Server Room" | 6..11 | −4..5 | rubber |
| Kitchen | 11..20 | −4..5 | tile |
| Backyard (outdoor) | −20..−6 | 5..12 | carpet2 (turf) |
| Living Room | −6..10 | 5..12 | wood + rug |
| Founder's Room | 10..20 | 5..12 | carpet |

**Openings.** Doors are 1.8 m wide unless noted.
- **South wall (z = −4):** roll-up opening x −17..−11 (6 m), side door x 2..3.8, front door x 14.6..16.4.
- **Goals:** doorways at x = −8 and x = 6, z −0.9..0.9.
- **North wall (z = 5):** kitchen to founder x 15..16.8, living to dev pit x 3..4.8, garage to backyard x −17.5..−15.7.
- **Other doors:** laundry to kitchen x = 11, z 1..2.8. Founder to living x = 10, z 9.6..11.4. Glass patio slider x = −6, z 7.5..10.
- **Outdoor edge:** a new `fence` wall style, 1.0 m white pickets (`#f1efe8`).

**Desk Dash, about 92 m, clockwise.** The route in order:
1. Chalk grid on the driveway (x −19.5..−15), facing east.
2. Past the skate funbox.
3. Across the lawn on the stepping-stone path. The turf on either side is slow.
4. In the front door and round the kitchen island.
5. Through the founder's room and west along the living room.
6. South into the Dev Pit, with a diagonal slalom through two door-desk pods.
7. West through the Garage Goal door.
8. **Signature moment:** a tight hairpin behind the lifted car, straight down its underside past the oil drip, then out under the half-open roll-up door into the sun.

Checkpoints: (−13,−8) (1,−8) (11,−8) (15.5,−4) (15.5,1) (15.9,5) (14,9) (10,10.5) (4,8.5) (3.9,5) (−2,1) (−8,0) (−13,3.8) (−14,0) (−14,−5).

**Mode spots:**
- **Soccer:** Dev Pit, 14 × 9 m. Goals are "Garage" and "Laundry"; keep the middle 14 × 5 m clear.
- **Coffee:** a chrome lever espresso machine at (18.8, 0), delivered at (17.4, 0).
- **Vending:** a glass-door drinks fridge at (−19.4, −2.5).
- **Printer:** an inkjet on the living-room sideboard at (0, 11.5).
- **Robot:** a robot vacuum loops the living room.
- **Sumo** on the driveway at (−7, −8); **battery** at the centre of the Dev Pit.
- `LIGHTING.glow`: blue at the server shelf.

**Hero set pieces:**
- **Car on a lift** at (−14, 0.15), nose facing south:
  - A boxy 90s estate car: extrude the side profile. Body 4.7 × 1.75 × 1.4 m, **underbody at 0.95 m**, wheels 0.62 m across.
  - Lift posts 0.35 × 0.35 × 2.6 m at x −15.6 and −12.4, with yellow arm pads.
  - One wheel off, leaning on a post. An oil pan 0.8 m across × 0.1 m tall under the engine.
- **Roll-up door:** 6 × 2.4 m with a rib every 0.5 m. Its bottom rail sits at 0.9 m and is the only part with a collider.
- **Door desks:** tops 2.0 × 0.8 × 0.04 m at 0.74 m, on black A-frame sawhorses, in back-to-back pods.
- **Server shelf:** chrome wire shelving 1.2 × 0.45 × 1.8 m holding six silver mini-PCs (0.2 × 0.2 × 0.04 m) and a router with LEDs. A 0.5 m box fan with spinning blades blows on them.
- **Exposed roof trusses:** 0.04 × 0.14 m timbers every 0.6 m, ridge at 3.9 m. Plywood storage deck with a canoe and "XMAS" boxes. LED battens on chains at 2.45 m. A tennis ball hangs on a string down to 1.3 m.

**Props:**
- Garage: pegboard 3.6 × 1.2 m hung at 0.9–2.1 m with tool silhouettes; red tool chest 0.7 × 0.46 × 1.0 m; butcher-block workbench 2.4 × 0.7 × 0.9 m that cars drive under.
- Living and kitchen: beanbags 0.9 m across × 0.6 m tall; kitchen island 2.4 × 1.0 × 0.92 m with bar stools; coffee table **0.5 m** tall (the camera rule).
- Founder's room: floor mattress 1.4 × 2.0 × 0.2 m with a pillow-wedge ramp.
- Backyard: ping-pong table 2.74 × 1.525 × 0.76 m that cars drive under.

**Lighting.** Use a per-hour table.
- **Daylight:** the sun comes in from the south through the roll-up door. At golden hour a 6 m-wide orange slab of light lies across the concrete up to the lift.
- **Practical lights:**
  - LED battens at 5000 K (`#eef4ff`); one is slow to come on.
  - Edison string lights at 2200 K (`#ffb46b`), a bulb every 0.3 m on a sagging line.
  - Neon `#ff3d8b`, RGB PC glow, a lava lamp, TV spill, and the fridge interior (`#dff4ff`).
- **Night:** a motion-sensor floodlight over the garage door clicks on when a car passes. A sodium streetlight (`#ffae4a`) stands at the lawn edge.

**Sound:**
- Day: birds, a distant lawnmower, a ticking sprinkler.
- Night: crickets and a dog next door.
- Always: fridge hum, mechanical keyboards, lo-fi music.

**Palette:**
- **Floors:** driveway `#bdb6a8` r0.9 with expansion joints every 3 m; garage concrete `#9c978d` r0.85; epoxy `#7f878c` r0.35 with flakes; turf `#5f8a3c`.
- **Walls:** unpainted drywall `#e7e2d6` r0.95 with joint-compound stripes (`#f3f0e8`) every 1.2 m; bare 2×4 skirting `#caa874`; house walls `#efe8dc`.
- **Garage:** pegboard `#b48a5a`; tool red `#c8261e` r0.35 m0.3; lift `#3b4048` m0.7 with safety yellow `#f2c200`.
- **Car:** paint `#6b2230` r0.45; chrome `#d9dde2` m1 r0.15.

**Signs and markings:**
- A hand-painted plywood "HQ" sign.
- A sticky-note kanban: TODO 23, DOING 7, DONE 1.
- A whiteboard: "DEMO DAY IN 3 DAYS".
- In chalk on the driveway: the start grid, a wobbly FINISH, and a hopscotch.

**Gameplay hooks:**
- The under-car tunnel, then the roll-up limbo.
- A skate funbox: 1.2 m wide, 0.35 m deck, two 0.9 m ramps.
- A garden hose across the driveway (a 3 cm tube, so a bump).
- The oil pan: grip ×0.6.
- A lawn sprinkler sweeping a wet, low-grip arc.
- Beanbags as bumpers, and the robot vacuum.
- Ramp skins: plywood on a paint can, and the skate ramp.

---

