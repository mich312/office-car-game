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


## Your lane: The RC cars
Outcome branch: `claude/models-cars`.

The user's words: "I want you to improve all 3d models." The game is being turned into something that should hold up next to a polished indie release: every model the camera meets at RC-car height should look crafted — correct proportions at real scale, the parts that make an object recognisable, bevels/rounded edges (see roundedGeo.js — "nothing has a razor edge"), believable materials (procedural canvas textures in the textures.js style: albedo + normal + roughness breakup), and no bare primitive standing in for a real object.

Scope (files you own): `client/src/game/CarModel.jsx` (all five bodies, wheels, suspension, driver, lamps, vinyl, cosmetics/kit parts, materials), `client/src/game/RemoteCars.jsx` (LOD distances only, and the far proxy), and new helper files you create (e.g. `client/src/game/carKit.js`). Keep the car's physics untouched (LocalCar.jsx colliders, masses, suspension rays) — the visual wheels already follow the suspension via wheelYRef; keep that and the visible coil-overs working (they were just added, see the SUSPENSION table). Keep every existing customisation option (paint, finish, style/vinyl ids, cosmetics slots, hats) working — the garage screen shows the car up close, so it must look great there too (screenshot the garage: load the page, don't join, the car sits on the turntable). The cars are the thing players look at most: a proper shell with taper/tumblehome/fender swell, real side windows, the rear view (bumper, diffuser, tail lamps, drivetrain on open bodies), better wheels/tyres, a proper driver, fewer draws via merged cached geometry and shared materials, and a mid LOD for remote cars.

Rules for your lane:
- Keep gameplay identical: colliders (shape, size, position), masses, prop types/names and their data in the map files, network behaviour. Upgrade what things look like, not how they collide — unless a collider is clearly wrong for the object, in which case fix it and say so.
- Performance is part of quality: the whole scene should stay under ~550 draw calls in any view (it's ~410 in the cellar now; `scripts/shoot.mjs` prints draw calls). Share geometries/materials at module level, merge static sub-meshes (BufferGeometryUtils.mergeGeometries) or instance repeats. Many copies of each model exist (e.g. 21 chairs, 16 monitors).
- Other builders are working in parallel on: new maps (shared/src/maps/*, client/src/game/themes/*), new maps, the furniture/materials foundation (Office.jsx, materials.js, kit.js, textures.js), physics props (Props.jsx), the IT Cellar polish, and later game-mode fixes (ModeObjects.jsx, server/). Do not edit their files. If you need a shared helper, put it in a new file you own.
- Check your work visually on BOTH existing maps (`RC_MAP=office` and `RC_MAP=cellar` servers) with scripts/shoot.mjs from spots where your models are close to the camera, compare before/after, iterate until they genuinely look good.

## The 3D model audit (from the game's technical artist — implement it; you may do better)
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


## 7. `client/src/game/CarModel.jsx`

Dimensions here are in units (u), where 1 u = 0.225 m.

**Scores:** buggy 3, drift 2.5, monster 2.5, formula 2.5, balanced 2.5, wheels 2, driver 2, suspension 3.5, detail kit 3.

1. **Shell shaping (`shellGeo`).** Today every body is a 2D profile extruded to one constant width, 164–284 tris, and reads as a slab from behind.
   - Raise `curveSegments` from 5 to 12 and `bevelSegments` from 2 to 4.
   - Then deform the vertices, with z_c = (nose + tail)/2 and t = |z − z_c| / halfL:
     - **Plan taper:** `x *= 1 − a·smoothstep(0.6, 1, t)`, with a = 0.12 (hatches), 0.18 (drift nose), 0.5 (formula, z > 0 only, for a needle nose).
     - **Tumblehome:** `x *= 1 − 0.2·clamp((y − belt)/(top − belt), 0, 1)`.
     - **Fender swell over each axle, below the belt:** `x *= 1 + 0.05·exp(−((z − axleZ)/0.12)²)`. This puts the arches in the rear silhouette.
   - Compute `shellBounds` after deforming. Budget ≤ 1.5k tris.
2. **Cabin and glass** (drift belt 0.095, balanced 0.13, monster 0.16):
   - Clip the Shape points at the belt line.
   - Lower body: extrude the part below the belt, painted.
   - Cabin: extrude the part above the belt at depth 0.8 × body, in `glassDark`. This gives real side windows.
   - Roof skin: extrude the top 0.012 strip, painted.
   - A/B/C pillars: thin painted boxes 0.02 wide on the cabin sides.
   - Delete the 5 glass boxes. Buggy and formula stay open.
3. **Rear (the view you see all the time).** Every body gets:
   - A rear bumper blade (mirroring `FrontEnd` stock).
   - 3 diffuser fins `box(0.015, 0.04, 0.08)`.
   - Tail-lamp housings: dark frame `box(0.1, 0.065, 0.02)` with a red lens and a white reverse-lamp inset 0.03 × 0.02.
   - A tow hook (small torus).
   - Buggy and formula also show the drivetrain: motor can (`cyl` r 0.045, L 0.12, gold, with 6 heat-sink fins), a spur gear (`cyl` r 0.06, w 0.01, 36 segments) and a carbon shock-tower plate `box(0.3, 0.08, 0.012)`.
4. **Underside** (seen on every flip or jump): a chassis plate `box(0.34, 0.02, 0.85)` in aluminium or carbon, plus a battery pack `box(0.14, 0.05, 0.4)` in blue shrink-wrap. Add RC body posts with R-clips (torus r 0.012) on the hood and deck.
5. **Duplicated parts (defect #17).** A built-in wing, pipe, bull bar or stacks renders only when its slot is at the default. Otherwise the slot part replaces it.
6. **Wheels** (9–10 draws each, 14-gon cylinder, square shoulders):
   - Tyre: a lathe, 24 segments. Profile: rim seat 0.62r → sidewall 0.9r with 3% bulge → shoulder radius 0.25w → crowned tread.
   - Tread normals: road = circumferential grooves; knobby = lug blocks (normal map plus 10 instanced lugs); slick = none.
   - Optional white sidewall lettering (canvas ring).
   - **Rim:** one merged cached geometry per `(style, r, w)` (hub, spokes, ring, lip, nuts in vertex colour).
   - **Brake:** disc plus caliper merged with vertex colours.
   - Result: **3 draws per wheel.**
7. **Suspension.** The coil tube goes from 112 × 5 to 70 × 4 segments (1,120 → 560 tris each). The arm becomes an A-arm shape (two converging rods, still scaled along x). Optional: 3 `InstancedMesh`es of 4 instances per car.
8. **Driver.** Helmet: sphere 16 × 12 with a partial-sphere visor in `glassDark`. Torso: a capsule. Arms: two capsules to a steering-wheel torus (r 0.04). Merged into 2 draws.
9. **Materials.**
   - Cache `paintMat` globally by `(color, finish)`.
   - Lamps use shared module-level `HEAD_ON`, `HEAD_OFF` and `TAIL` materials, replacing 4–6 inline materials per car.
   - The plate material is cached per label.
   - Optional (art-direction decision): "Toy Gloss" becomes `MeshPhysical` with clearcoat 1 instead of toon, so it reflects the office environment like the other finishes.
10. **Vinyl.** Project onto the shell with `DecalGeometry` (three examples), cached per `(carId, vinyl)`. This replaces the floating planes (defect #7).
11. **LOD.**
    - Near: ≤ 28 draws.
    - New mid LOD between 12 and 28 u: shell, outline, cabin, 4 lathe tyres with merged rim caps, no suspension or driver; ≤ 8 draws.
    - Far: the existing `CarProxy` (2 draws).
    - `RemoteCars` `Detailed` distances become [0, 12, 28].

---

