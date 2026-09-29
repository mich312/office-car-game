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


## Your lane: build the map "tower" — The 48th Floor — management tower with war room
Outcome branch: `claude/lvl-tower`.

The user's words: "Continue with the levels, but make them really nice. Should look like these types of offices." The four office types they asked for are a software dev garage, an IT cellar with flickering fluorescent tubes (Lichtröhren), a management tower office with a war-room meeting room, and a printer assembly. You own **The 48th Floor — management tower with war room**. It must be the best-looking floor in the game when you're done — a place someone recognises instantly from an RC car's point of view, with a signature Desk Dash moment.

Files you own (create them):
- `shared/src/maps/tower.js` — the complete map object `export const TOWER = { id: 'tower', name: 'The 48th Floor', blurb: '…', theme: 'tower', …every key test-maps.mjs requires… }` in the style of cellar.js (authored in metres, comments that explain the design).
- `client/src/game/themes/tower.jsx` — `Dressing`, `PIECES`, `PROPS` per the contract in themes/index.js.
Registration (the only lines you may touch in shared files): in `shared/src/map.js` add the import and `tower: build(TOWER),` after cellar; in `client/src/game/themes/index.js` add the import and the `tower` entry.
Rules for your lane:
- Room ids must be globally unique: prefix every room id with `tower_` (e.g. `tower_lobby`).
- New furniture and prop type names must be prefixed `tower_` (e.g. `tower_conveyor`) — other builders are adding types in parallel. Reuse built-in types (desk, table, rack, copier, vending, sofa, …) where they fit; other builders are upgrading those built-in models right now, so don't restyle them — your theme pieces are for things the game doesn't have yet.
- Put any procedural textures your theme needs inside your theme file (don't edit textures.js — others are). You may import existing helpers from ../textures.js and ../roundedGeo.js.
- Do NOT edit Office.jsx, Props.jsx, propBody.jsx, CarModel.jsx, ModeObjects.jsx, Lighting.jsx, daylight.js, audio.js, server/, other maps or themes. If you truly need an engine hook, make the smallest possible change and explain it in your report.
- The mode objects render from your data: the coffee machine (ModeObjects CoffeeMachine) sits at 0.92 m on top of whatever is at COFFEE_MACHINE — put a counter/bench there, the machine faces +z; the vending machine event needs a `vending` furniture piece at VENDING; the printer event (paper blast) should have a copier/printer at PRINTER; the scoreboard hangs where BOARDS says (on a wall face).
- Gameplay: Desk Dash needs a real lap (12–16 checkpoints, bot line threading every door with ≥0.3 m clearance, 25–45 s bot lap), a reverse variant that works (REVERSE_SPAWN_ROTY), a signature moment (ramp/jump, crossover, a long straight, a slalom), RC Soccer in a room whose two goals are doorways in x = const walls, 10+ standup (KOTH) spots, 12–16 powerup pads, ~26 beans, a robot patrol, a sumo zone whose r0 covers the whole floor. Ramps onto furniture are what make this game fun — give the floor 4–6 good ones.
- Look: rooms feel furnished and lived-in at car height (under desks, around chair legs, along skirting), with 60–120 props. Lighting that sells the place (LIGHTING + CEILING_LIGHTS + emissive fixtures in your Dressing), room tone via AMBIENCE, signage/markings where the place would have them, something that moves (animated set pieces in the Dressing: fans, conveyors, screens, blinking LEDs, elevators…) with the occasional one-shot sound.

Owner's notes for the Management Tower (id `tower`, const `TOWER`):
- The 48th floor of a glass skyscraper. Floor-to-ceiling glass on the perimeter (glass walls) with the city far BELOW: build a view from altitude in your Dressing — other towers' tops, rooftops, a river, haze, all cheap (instanced boxes with window-grid canvas textures, billboards). The office's skyline only renders for the office.
- Rooms: a marble lift lobby with brass lift doors that open and close (animated, audio.ding), reception with a backlit logo wall, glass-walled executive offices, THE WAR ROOM — a long table under a wall of screens showing live-looking KPI charts, a world map with blinking dots, a countdown (canvas textures you redraw every few seconds, cheaply), a boardroom with a very long table (ramp onto it — racing down the boardroom table is the signature moment), an exec lounge with a bar, leather sofas and a grand piano, an assistants' pool (carpet, desks), a server/comms cupboard.
- Floors: marble (lobby, corridors — fast and slippery), carpet (offices, war room), wood (lounge, boardroom).
- Light: time of day matters here — omit LIGHTING hours so it inherits the office's daylight (the sun and sky really read through all that glass), or give your own per-hour table if you need a different feel; golden hour over the city is the money shot. Warm brass/wood accents, cool glass.
- Room tone: AMBIENCE { rain: true (rain on the glass at night reads great), air: 0.6 }.


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

## 3. The 48th Floor: management tower with war room
`tower` · 42 × 24 m (x −21..21, z −12..12) · WALL_HEIGHT 3.3 m · has time of day · glass on all four sides

**Feeling:** Power, quiet and height. Everything is polished and cold, and the city below looks like a map.

**Cues:**
- Floor-to-ceiling glass with the tops of other towers and clouds at eye level, and a street grid 200 m below.
- A marble Sky Lobby with brass lift doors and a backlit onyx reception desk.
- The War Room: an 8 m walnut table under a long pendant light, facing a 3 × 3 wall of KPI screens.

The rooms ring a solid central core, like a real skyscraper floor, so the lap is a ring road.

| Zone | x | z | Floor |
|---|---|---|---|
| Assistants' Row | −21..−7 | −12..−4 | carpet (charcoal) |
| Sky Lobby | −7..7 | −12..−4 | marble |
| Analyst Bullpen | 7..21 | −12..−2 | carpet |
| Executive Lounge | −21..−7 | −4..3 | wood |
| Building Core | −7..7 | −4..3 | concrete |
| Executive Pantry | 7..21 | −2..3 | tile |
| Corner Office (CEO) | −21..−9 | 3..12 | wood + rugs |
| War Room | −9..7 | 3..12 | carpet2 (navy) |
| Sky Terrace (outdoor) | 7..21 | 3..12 | concrete (pavers) |

**Openings:**
- **Goals:** x = ±7, z −8.9..−7.1.
- **Doors:** assistants to lounge z = −4, x −15..−13.2. Lounge to CEO z = 3, x −17..−15.2. CEO's private door x = −9, z 9.2..11. Terrace to pantry z = 3, x 12..13.8. Pantry to bullpen z = −2, x 16..17.8.
- **Glass:** War Room to terrace is a glass slider at x = 7, z 6..8.4. War Room to core is glass with a frosted band, with a door at x −1..0.8.
- **Core:** solid blocks (lift shafts to the south, stairs and restrooms to the north). A 1.4 m service corridor runs east–west at z −1.2..0.2.

**Desk Dash, about 92 m.** The route in order:
1. Grid at x 1..5.5, facing west, on a black-marble start band.
2. Through the West Goal door, Assistants' Row, and the Lounge past the fireplace.
3. Through the CEO's office and across the putting green.
4. Through the private door into the War Room.
5. **Signature, the table.** It has two lines:
   - **High line:** a ramp of stacked annual reports (1.8 m long, 0.76 m rise) onto the lacquered table, which has friction 0.5. Weave through carafes, laptops and name placards, then **launch off the far end toward the video wall.**
   - **Low line** (also the bot line): under the table, between two pedestals and 16 chairs.
6. Out onto the terrace into the wind, then through the pantry and a slalom through the bullpen.
7. Back through the East Goal door to the finish.

Checkpoints: (0,−8) (−7,−8) (−14,−8) (−14,−4) (−14,−0.5) (−16,3) (−15,7.5) (−9,10.1) (−6,7.2) (4.5,7.2) (7,7.2) (12,8) (12.9,3) (14,0.5) (16.9,−2) (14,−7) (7,−8).

**Mode spots:**
- **Soccer:** the Sky Lobby, 14 × 8 m. Marble makes it air hockey. The reception desk sits against the core wall.
- **Coffee:** an espresso bar at (20.4, 0.5).
- **Vending:** a sparkling-water fridge at (8, 2.4).
- **Printer:** a multifunction printer in the bullpen at (20.3, −10.5).
- **Battery:** under the table at (−1, 7).
- **Sumo:** on the terrace at (14, 7.5), so the last circle is out in the wind.
- **Robot:** a night floor-scrubber circles the lobby.
- `LIGHTING.glow`: blue at the video wall.

**Hero set pieces:**
- **War Room table.**
  - 8.0 × 1.6 × 0.76 m walnut on two pedestals, 0.6 × 1.2 m each.
  - A triangle speakerphone in the middle acts as a bump. Placards read "CEO / CFO / COO / HEAD OF SYNERGY".
  - **Video wall** on the wall at x = 6.9: 3 × 3 panels of 1.22 × 0.69 m, 3 mm bezels, filling 0.6–2.7 m in height. It shows a world map with pulsing dots, dials, a chart that goes up and to the right, and the live scoreboard (`BOARDS`).
  - A 7 m LED pendant at 2.5 m.
- **Sky Lobby.**
  - Book-matched white marble with a 2.4 m black-marble compass star at the start line.
  - Six brass lift doors (1.1 × 2.4 m), each with an amber "48" indicator above.
  - A curved, backlit onyx reception desk, 4 × 0.8 × 1.1 m.
  - "SYNERGON HOLDINGS" in 0.3 m steel letters on walnut.
  - A bronze sculpture on a plinth.
- **CEO corner.**
  - A 3.2 × 1.1 m walnut slab desk on blade legs; cars drive under it.
  - A 4 × 1.4 m putting-green rug with a cup, a flag and golf balls.
  - A globe bar 0.9 m across, lit inside; a telescope at the glass.
- **Terrace.** A 1.1 m glass balustrade, olive trees in 0.9 m planters, and a mast with a red aircraft-warning light blinking at 1 Hz. A window-cleaning gondola crawls along the facade.
- **The view.** It is what sells the tower.
  - Put the horizon at mid-window height for the car camera.
  - Show neighbouring tower tops with red beacons and clouds drifting at eye level.
  - Put a ground plane with a street grid 200 m down; at night it gets moving headlights.

**Props:**
- Lounge: leather club chairs, a pushable brass bar cart (0.8 × 0.45 × 0.85 m), a 1.8 m bioethanol fireplace, and a grand piano whose 0.65 m underside cars can drive under.
- Around the floor: orchids on the assistants' desks, triple-monitor desk rows in the bullpen, glass phone booths, and a janitor cart in the core corridor.

**Lighting.** Use a per-hour table. The tower has the most exposed sun in the game.
- **Morning:** cool haze (`#cfe0ff`) from the east.
- **Afternoon:** bright light and marble reflections.
- **Golden hour:** light comes in flat through the west glass. Half-lowered blinds cast striped shafts.
- **Night:** **the light comes from below.** Use a warm city tone (`#4a3420`) as the hemisphere ground colour, 3000 K downlights (`#ffd6a0`), the video wall `#5aa0ff`, the onyx desk `#ffb366`, the fireplace `#ff8a3c`, and red beacons outside.

Shafts come in from both the east and the west.

**Sound:** wind pressing on the glass, a quiet air-conditioning hiss, a helicopter, and phones ringing. When a car respawns, the lift dings and its doors open.

**Palette:**
- **Stone:** white marble `#eeeae4` r0.12 with `#9a9a9e` veins; black marble `#1b1b1d` r0.1.
- **Wood and metal:** walnut `#5a3a24` r0.45; brass `#b8893b` m1 r0.3; brushed steel `#a9adb3` m0.9 r0.35.
- **Soft goods:** oxblood leather `#5a1f1b`; charcoal carpet `#3a3d44`; navy carpet `#1f2a44`.
- **Glass:** a frosted band at 0.9–1.5 m with an etched logo.

**Signs and markings:** there is no floor paint here.
- A brass directory reading "48 · EXECUTIVE FLOOR".
- "WAR ROOM — IN SESSION", with a red lamp that is lit during a match.
- In the bullpen: "ONE TEAM. ONE DREAM." and a "Q4 97.3 % TO TARGET" ticker.

**Gameplay hooks:**
- The table's high line versus its low line.
- Drifting on the marble lobby.
- Extra grip on the putting green, and loose golf balls.
- Terrace gusts: a 3 s sideways push every 15 s or so, signalled by the olive trees bending.
- The bar cart.
- The core corridor as an escape route in Tag and King of the Hill.
- Ramp skins: stacked binders, a fallen easel.

---

