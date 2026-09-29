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


## Your lane: Furniture, architecture and the material/geometry foundation
Outcome branch: `claude/models-furniture`.

The user's words: "I want you to improve all 3d models." The game is being turned into something that should hold up next to a polished indie release: every model the camera meets at RC-car height should look crafted — correct proportions at real scale, the parts that make an object recognisable, bevels/rounded edges (see roundedGeo.js — "nothing has a razor edge"), believable materials (procedural canvas textures in the textures.js style: albedo + normal + roughness breakup), and no bare primitive standing in for a real object.

Scope (files you own): `client/src/game/Office.jsx` (built-in furniture `Furniture`/`SimpleBox`/`BigFurniture`, walls/skirting/glass rendering, the built-in ramp skin `PlankRamp`, the office's own ceiling/windows/pools/shafts), new `client/src/game/materials.js` and `client/src/game/kit.js` (the audit's §3 foundation — 1 UV unit = 1 metre), `client/src/game/textures.js` (you may add; others won't edit it), `client/src/game/roundedGeo.js`, the furniture/decor entries and VENDING/PRINTER `rotY` in `shared/src/maps/office.js` (the rotY contract, §3.4 — do not move checkpoints/pads/beans/spawns), the soccer box rotation swap in `server/src/modes.js` (only that — another builder is fixing game-mode logic in that file), and the rotated-AABB check in `scripts/test-maps.mjs`. Also give every doorway a proper frame (architraves) derived from the wall gaps, and fix the art direction's point that the 0–1.2 m band of walls fills the screen (skirting, sockets, scuffs) — for the office's walls. You also own the look of the OFFICE level as a whole: once the furniture is good, make the office itself as nice as the other floors will be. Leave the cellar's PIECES to the cellar builder (but your built-in pieces are used on every floor: desk, table, rack, copier, vending, shelfrack, sofa, counter…).

Rules for your lane:
- Keep gameplay identical: colliders (shape, size, position), masses, prop types/names and their data in the map files, network behaviour. Upgrade what things look like, not how they collide — unless a collider is clearly wrong for the object, in which case fix it and say so.
- Performance is part of quality: the whole scene should stay under ~550 draw calls in any view (it's ~410 in the cellar now; `scripts/shoot.mjs` prints draw calls). Share geometries/materials at module level, merge static sub-meshes (BufferGeometryUtils.mergeGeometries) or instance repeats. Many copies of each model exist (e.g. 21 chairs, 16 monitors).
- Other builders are working in parallel on: new maps (shared/src/maps/*, client/src/game/themes/*), the IT Cellar polish (themes/cellar.jsx, maps/cellar.js), physics props (Props.jsx, propBody.jsx), the cars (CarModel.jsx, RemoteCars.jsx), and later game-mode fixes (server/src/modes.js mode logic, bots.js, ModeObjects.jsx, HUD). Do not edit their files. If you need a shared helper, put it in a new file you own.
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


## 3. Cross-cutting foundation (do this first; every later item assumes it)

### 3.1 Material library: new `client/src/game/materials.js`

- A lazily built, module-level `MAT` registry. No component creates a material inside JSX or `useMemo`.
- **Convention: 1 UV unit = 1 metre on every geometry.** Each material's texture `repeat` is set to 1 / (tile size in metres). One material then serves every piece at a consistent texel density. This replaces the note in `Office.jsx` that "per-object UV scaling costs a material per item".

| Material | Settings |
|---|---|
| `veneerOak` | `#b98a57`; new `veneerTex`: long grain, no plank joints, tile 1.2 × 0.3 m; normal 0.25; roughness 0.55 plus `wearRough` |
| `veneerWalnut` | `#5a3a24`, roughness 0.5 |
| `laminateWhite` | `#ecebe6`, roughness 0.6, orange peel 0.2 |
| `laminateSage` | `#9fb3a0` (kitchen doors) |
| `melamineGrey` | `#b9bfc7` |
| `powderWhite` | `#e9e9e6`, metalness 0.15, roughness 0.45, orange peel |
| `powderBlack` | `#24262b`, metalness 0.2, roughness 0.5 |
| `powderGrey` | `#8e959c` |
| `brushedSteel` | `#b8bec6`, metalness 0.9; roughness map with vertical streaks at 0.28–0.42 (new `brushedRough`) |
| `chrome` | `#dfe4ea`, metalness 1, roughness 0.12 |
| `plasticBlack` | `#1d1f24`, roughness 0.55, orange peel |
| `plasticWhite` | `#e6e4de` |
| `rubber` | `#18191c`, roughness 0.9 |
| `fabric(color)` | Cached per colour; `fabricNormal` at 8 repeats per metre (about 4 mm weave) |
| `leather` | `#5b3423`, roughness 0.45; new `leatherNormal` |
| `felt` | `#2e7d4f`, roughness 0.95 |
| `ceramic` | `#f4f5f6`, roughness 0.18 |
| `stoneTop` | New terrazzo `terrazzoTex`, roughness 0.35 |
| `butcherBlock` | Veneer strips 4 cm wide |
| `glassClear` | Shared with the walls: `MeshPhysical`, opacity 0.18, roughness 0.05, `depthWrite: false` |
| `mirror` | Metalness 1, roughness 0.04 |
| `cardboard` | New corrugated/print atlas `cardboardTex` |
| `paper`, `terracotta`, `soil`, `foliage` | `foliage` is an alpha-tested leaf atlas, `DoubleSide`, `alphaTest` 0.5 |
| `ledGreen/Amber/Blue/Red` | `MeshBasic`, `toneMapped: false` |
| `emissiveWarm` | Lamp bulbs |

- Colour variation (books, cans, binders, cushions, pens) goes through `instanceColor` or vertex colours on a shared material, never a material per colour.

### 3.2 Geometry kit: extend `roundedGeo.js`, or add `client/src/game/kit.js`

1. **`rbox(w, h, d, r, seg)`**: the existing cached `RoundedBoxGeometry`, followed by **`metreUV(geo)`**. That is a box projection by dominant normal: u runs along the face's longer in-plane axis (so wood grain follows the length), and u and v are position in units ÷ M.
   - Replace **every** drei `<RoundedBox>` in `Office.jsx` and `Cellar.jsx` with this. Today drei builds a new 1,004-triangle extrude per desk (8 identical desks = 8 geometries) and gives it the world-unit UVs from defect #1.
2. `box`, `cyl`, `lathe(pointsMetres, seg)`, `tube(pathMetres, r)` and `extrudeShape(shape, depth, bevel)` all emit metre UVs. Cylinders and lathes use u = arc length in m and v = height in m.
3. **`part(geo, matKey, matrix)`** plus **`bake(parts)`**, which groups parts by `matKey` and runs `mergeGeometries` on each group. Convert every part to non-indexed first, or make sure all are indexed with the same attribute set (position, normal, uv, optional color); otherwise `mergeGeometries` returns null.
4. Every model becomes a pure builder, `buildX(f) → { parts, dynamic, colliders }`, cached by `type` plus dimensions. It returns visuals in piece-local units, the animated sub-parts (LEDs, screens) separately, and the collider list. Themes (`themes/*.jsx` `PIECES`) use the same signature so new maps join the batching automatically.

### 3.3 Static batching: rework `BigFurniture` in `Office.jsx`

- Split it into two components:
  - `<FurnitureColliders>`: one fixed `RigidBody` per piece with colliders only, from `build(f).colliders`, so physics is unchanged.
  - `<FurnitureVisuals>`: bake each piece's parts with its world matrix, group by `(roomAt(x, z).id, matKey)`, merge, and render one mesh per group. Frustum culling then works per room.
- `castShadow` goes on a merged group only if its material is on the shadow list:
  - Shadows on: wood, laminate, powder, fabric, leather, steel.
  - Shadows off: chrome trim, LEDs, screens, glass, paper, rubber feet.
- Dynamic parts go into map-wide instancers:
  - `ServerLights`: one instanced mesh for all racks, not one per rack.
  - Vending cans, book fills and shelf contents: one instancer each.
- Merge the glass walls, smudges and headrails in `Walls` the same way: 60 draws down to 3.

### 3.4 The `rotY` contract

- **Rule:** `w` and `d` are the piece's local width and depth, `+z` is its front, and **every** `case` passes `rotY` to its body.
- Fix `rack`, `fridge`, `copier`, `bookshelf`, `vending` and `rug` (rugs need `rotation-z` on the plane).
- `server/src/modes.js` `SoccerController.boxes`: when `|sin(rotY)| > 0.5`, swap `w` and `d`.
- Map data fixes in `office.js`:
  - Reception sofa: `f('sofa', -20.3, -4.5, 2.4, 0.95, 0.75, Math.PI/2)`.
  - CEO sofa: `f('sofa', 14.6, 9.5, 2.2, 0.95, 0.75, Math.PI/2)`, so its back is to the west wall.
  - Office copiers: `rotY: Math.PI` and z → 1.28, so the back is 2 cm off the wall and the front faces into the nook.
  - Bookshelves: see §4.
- Cellar copier and vending: keep −π/2. Now that the rotation is honoured, keep w = 1, d = 0.8 or 1.2.
- `VENDING` and `PRINTER` in both maps gain `rotY`. The can spawn becomes `V + rotate([0, 0.15 m, d/2 + 0.12 m], rotY)`, at the dispensing flap (defect #18).
- Add to `scripts/test-maps.mjs`: every non-decor piece's rotated AABB must stay inside `MAP_BOUNDS` and must not overlap a wall by more than 2 cm.

### 3.5 Wall snapping

- New helper `snapToWall(f, map, gap = 0.01 m)` in shared: it moves a piece along its facing normal until its back is `gap` from the nearest wall face.
- Apply it at build time to art, tv, whiteboard (if wall-mounted), bookshelf, fridge, vending, counter, copier and shelfrack.
- Move the reception art off the glass wall, e.g. to the solid wall at x = −14, facing west.

### 3.6 Detail and seed policy

- Use a deterministic seed per piece: `hash(mapId, index)`, for book colours, LEDs, pen colours, marbles and shelf fills. Today these come from `Math.random`, so every client sees different colours.
- Bevel radius: keep the deliberately oversized chamfer (0.5–1 cm real) from the art direction, but set it per part through the kit instead of `chamfer()`'s 4.9 cm cap. Today every `SimpleBox`, including a 10 m counter, gets r = 0.049 m.

---

## 4. `client/src/game/Office.jsx`: Furniture (scores are current quality, 1–5)

Dimensions are in metres; convert with `u()`. Keep today's colliders unless a line says otherwise.

### desk (8 office + 4 cellar): 2/5, 5 draws → batched
- **Problems:** a 2.7 cm slab on four 4 cm round poles (8 segments). The underside, which is always in view, is blank. Wood is pinstriped (defect #1).
- **Top:** `rbox(1.6, 0.025, 0.8, r 0.006)` in `veneerOak`. Add a black cable grommet (`cyl` r 0.03, h 0.003) 0.1 m in from the back edge.
- **Legs:** 4 square steel tubes, `rbox(0.06, h − 0.05, 0.06, r 0.004)` in `powderWhite`. Keep the collider `legIn`. Each leg gets a black levelling foot: `cyl` r 0.025, h 0.015, `plasticBlack`.
- **Frame (seen from below):** 2 long rails `rbox(1.44, 0.05, 0.03)` at z = ±0.33, 2 short rails `rbox(0.03, 0.05, 0.66)`, all 0.025 m under the top, in `powderWhite`.
- **Modesty panel** on the back (the shared edge in a pod): `rbox(1.4, 0.32, 0.012)` in `powderWhite`, top edge 0.04 m under the desk top. There is no panel below 0.37 m, so cars can still drive under.
- **Cable tray** under the back edge: a U channel `rbox(1.2, 0.08, 0.1)` in `powderBlack`, a black cable bundle (`tube` r 0.012, 3 strands, sagging to the floor at one leg), and a power strip `rbox(0.3, 0.04, 0.05)` with an orange switch.
- **Budget:** 3 materials, ≤ 2.2k tris, one cached geometry set.

### table (8): 1.5/5, desk code reused for three different objects
Infer the variant inside `buildTable` from the dimensions; no data change needed.
- **h < 0.5 → coffee table:**
  - Top: 0.03 m `veneerWalnut`, r 0.01.
  - Lower shelf: 0.018 m at 0.1 m.
  - 4 tapered legs, `cyl` 0.025 → 0.018 m, splayed 4°, in walnut.
- **|w − d| < 0.1 → café table:**
  - Top: round `cyl` r = w/2, 0.025 m thick, 48 segments, `laminateWhite` with a black ABS edge (a second `cyl` 1 mm larger in radius, 0.02 m tall).
  - Single column: `cyl` r 0.035, `brushedSteel`.
  - Cross foot: 2 flat bars `rbox(0.6, 0.02, 0.06)`, with 4 glides.
  - Colliders change: top disc (use `CylinderCollider`), column, cross foot.
  - Update the server box too (keep the AABB of the top; soccer is not played there).
- **w > 3 → meeting table:**
  - Top: 0.035 m `veneerOak`.
  - 2 trestle panel legs `rbox(0.05, h − 0.035, 1.0)` inset 0.45 m from each end, in `powderBlack`.
  - A flush cable box on top (`rbox(0.3, 0.004, 0.12)`, brushed) with 2 cables disappearing into it.
  - Colliders: the top plus the two panels, replacing the 4 legs. The ramp still lands on the top.

### ceodesk: 1.5/5 (the desk model in dark plastic)
- Top: 0.04 m `veneerWalnut`, with a 1.6 × 0.55 m `leather` writing inlay 1 mm proud.
- Visitor-side (−z) full modesty panel `rbox(2.3, 0.6, 0.03)` in walnut. It is flush with the top's front edge, where the ramp lands, so there is no lip.
- North end: a 3-drawer pedestal `rbox(0.45, 0.7, 0.9)` with drawer seams (2 mm dark inset boxes) and brass bar pulls (`cyl` r 0.006, L 0.12, `MAT.brass` `#c9a24a`, metalness 1, roughness 0.3).
- South end: a panel leg `rbox(0.04, 0.74, 1.0)`.
- Colliders: top, panel leg and pedestal box.

### recdesk (reception, 3.2 × 1.0 × 1.05): 1/5 (a solid wood box; the first thing seen at the race start)
- **Visitor face (+z):**
  - Front panel `rbox(3.2, 0.95, 0.04)` in `laminateWhite`, with a 0.15 m horizontal `veneerOak` band at 0.6 m.
  - Recessed black kick plinth, 0.1 m tall, set back 0.05 m.
  - A logo plane 0.8 × 0.25 m (new `logoTex`, e.g. "RC MAYHEM INC.").
- **Top ledge:** at exactly h (1.05) so the ramp lands flush. `rbox(3.3, 0.03, 0.35)` in walnut, overhanging the front by 0.08 m.
- **Staff side (−z):** a worktop at 0.74 m `rbox(3.1, 0.025, 0.6)` on 2 side returns, plus a pedestal `rbox(0.45, 0.7, 0.55)`.
- The collider stays a box.

### counter (office 10 × 1.1 × 0.92; cellar 2.6 × 0.9) and island (3 × 1.1): 1/5, P1 (they line the kitchen straight)
- **Carcass:** modules 0.6 m wide.
  - Doors `rbox(0.596, 0.72, 0.018)` in `laminateSage`, with 4 mm gaps.
  - Brushed bar handles (`cyl` r 0.006, L 0.16 on 2 standoffs), 0.05 m below the worktop.
  - The office counter is 16 modules; the island has 5 per long side, handles on both.
- **Toe kick:** `powderBlack`, 0.1 m high, set back 0.06 m, along the whole run. This is the shadow line at eye level.
- **Worktop:** `rbox(L + 0.06, 0.04, D + 0.03, r 0.008)` in `stoneTop` (island: `butcherBlock`), overhanging 0.03 m at the front and ends.
- **Module variants on the office counter:**
  - Undermount sink at x ≈ −3.0 m: the worktop's cut-out as an `extrudeShape` with a hole of 0.5 × 0.4 m, a basin made from a lathe bowl 0.15 m deep, and a chrome gooseneck tap (`tube` along a quarter circle r 0.12, pipe r 0.012, 0.3 m tall).
  - Dishwasher front (`brushedSteel`) right of the sink.
  - Oven at x ≈ −5.4: a black glass door with a handle bar.
  - Keep x ∈ [−1.4, −0.6] clear for the coffee machine and x ∈ [3.2, 4.0] for the ramp landing.
- **Backsplash:** a 0.6 m tile plane on the wall behind (`tileTex` at 0.1 m tiles).
- **Island:** a breakfast overhang of 0.25 m on the north side.
- **Budget:** 5 materials, merged. Instance the door, handle and module fronts through the static batch.

### sofa (6): 2.5/5
- **Plinth:** 6 tapered feet, `cyl` 0.03 → 0.02 m, h 0.1, in walnut or black. This creates a 0.1 m shadow gap under the sofa, the most important eye-level cue.
- Base frame `rbox(W, 0.2, D, r 0.04)` from 0.1 to 0.3 m.
- 3 seat cushions `rbox(W/3 − 0.012, 0.15, D − 0.25, r 0.05)`.
- 3 back cushions `rbox(W/3 − 0.012, 0.42, 0.18, r 0.07)`, reclined 8°.
- Arms `rbox(0.18, 0.6, D, r 0.08)`.
- 2 throw pillows `rbox(0.4, 0.4, 0.12, r 0.06)`, rotated about 15°, in an accent colour.
- **Colours:** reception charcoal `#4a4e57`, lounge `fabric('#3f6fa8')` and `fabric('#3f7d7a')`, games `#c0573f`, CEO `leather`.
- Fix both rotated sofas' data (§3.4).

### rack (8 office + 10 cellar): 1.5/5
Real 42U racks are 0.6 × 1.0 × 2.0; keep the authored footprint.
- Frame: 4 corner posts `rbox(0.04, H, 0.04)`, top and bottom frames, and side panels with 2 vertical seams, all `powderBlack`.
- Plinth 0.1 m with 4 levelling feet (at eye level).
- **Front door:** a perforated panel inset in a 0.03 m border.
  - New `perfAlphaTex`: a hex perforation 5 mm pitch at metre UVs, `alphaTest` 0.5.
  - Vertical chrome handle 0.02 × 0.25 m.
- **Behind the door:** servers as a map-wide instanced `rbox(0.48, 0.044·k, 0.6)` (k = 1 or 2 U), in dark grey with a bezel atlas (new `serverBezelTex`: drive bays, vents), about 70% filled. The LEDs move onto those server faces (one instancer map-wide).
- Top: a cable exit with 2 black bundles rising to the ceiling or cable tray (cellar trays at 2.48 m).

### fridge: 1.5/5
- Rework as side-by-side doors in `brushedSteel`, not grey plastic: 2 doors with a 4 mm dark seam at x = 0.
- 2 vertical bar handles by the seam (`cyl` r 0.012, L 0.9, on 2 standoffs 0.04 m).
- A dispenser recess `rbox(0.2, 0.3, 0.02)` in dark with a paddle, at 1.2 m.
- Kick grille at the bottom `rbox(0.9, 0.08, 0.01)` with louvres from a normal map.
- A top cap, plus 3 magnets and 2 sticky notes as planes (`logoTex` atlas).
- Honour `rotY`.

### copier (2 office + 1 cellar): 1/5 (a box, a slab and a plane)
- Base cabinet from 0 to 0.55 m:
  - 2 paper drawers, fronts `rbox(0.9, 0.22, 0.02)` with a recessed hand slot (a dark `rbox` 0.18 × 0.03) and a paper-level window.
  - Plinth 0.08 m with 4 casters (`cyl` r 0.03).
- Body from 0.55 to 1.0 m, with an output bay cut into the right side: a dark inset box 0.7 × 0.12 m, a light-grey tray plate sloped 5°, and a 4-sheet paper stack. This is the origin of the `PRINTER` blast.
- Scanner and ADF from 1.0 to 1.25 m: a `plasticGrey` lid `rbox(0.9, 0.08, 0.6)` and a sloped ADF feeder tray on top.
- A 30°-tilted touch panel 0.3 × 0.18 m on an arm at front right, with emissive UI from a new `copierUiTex` canvas.
- A bypass tray folded on the left side.
- Honour `rotY`; fix the office facing (§3.4).
- **Budget:** 4 materials (`plasticWhite`, `plasticGrey`, `rubber`, screen).

### vending (office + cellar): 2/5
- Cabinet in `powderBlack`, with a header panel 1.0 × 0.2 m (new `fizzLogoTex`, emissive).
- **Glass window:** 0.7 × 1.25 m in `glassClear`, inset 0.03 m. Behind it:
  - An emissive warm back panel.
  - 6 shelves `rbox(0.68, 0.01, 0.5)`.
  - 5 spiral coils per shelf: `tube` helix r 0.03, 6 turns, in chrome, one map-wide instancer.
  - Cans standing in the coils: a lathe can r 0.033, h 0.115, 30 of them, instanced with 4 colours.
- Right-hand column 0.25 m: keypad 3 × 4 (instanced `rbox` 0.02), a chrome coin slot and a small LCD.
- Pickup flap at 0.05–0.2 m: a recessed dark box 0.6 × 0.15 m with a flap plate angled 10°. This is the can spawn point.
- Honour `rotY`.

### bookshelf (2): 1/5
- **Data:**
  - (20.55, 7): w 2.6, d 0.4, rotY −π/2, x → 20.70.
  - (13.45, 6.6): w 2.4, d 0.4, rotY +π/2, x → 13.30.
  - Shallower carcass, centred off the wall.
- **Open carcass** in walnut: sides and top 0.025 m, back 0.008 m, plinth 0.08 m recessed 0.02 m, shelves at 0.5, 0.92, 1.34 and 1.76 m.
- **Fill:** one map-wide book instancer, about 85% full.
  - Thickness 0.02–0.05 m, height 0.2–0.32 m, depth 0.15–0.24 m, seeded.
  - Every 6th book leans 12°; a horizontal stack every about 0.5 m.
  - Spine colours through `instanceColor`, with a spine-band normal.
  - About 250 books per shelf.
- Delete `ShelfBooks`.

### shelfrack (4 office + 7 cellar): 0.5/5 (placeholder), P0
- **Boltless steel shelving:**
  - Uprights: slotted angle `rbox(0.04, H, 0.04)` in `powderGrey`, with a new slot-perforation normal and alpha. Place them at every ≤ 1.2 m along the length.
  - Shelf decks `rbox(L, 0.015, D)` at 0.1, then every 0.4 m up to H − 0.1.
  - Orange beams `#d86f2a` (a new `MAT.powderOrange`) on the front and back edges, 0.04 m.
- **Contents** (seeded, 70–90% full, one map-wide instancer per kind):
  - Archive boxes `rbox(0.4, 0.26, 0.32)` in `cardboard`, with a lid seam, a handle-hole decal and a label.
  - Binders `rbox(0.08, 0.32, 0.29)` with colour spines.
  - Paper reams.
  - Storage room: bulk boxes. Archive: binders plus archive boxes. Printer nook: reams.
- **Collider:** keep the solid box, and fill the bottom shelf densely so it reads as closed. Optionally, as a gameplay call, raise the bottom deck to 0.12 m and collide only uprights plus decks so cars can drive under.

### whiteboard: 2/5
- A mobile whiteboard fits its data (25 cm off the wall).
- Board `rbox(1.8, 1.2, 0.02)` with a 0.02 m aluminium frame (`brushedSteel`), from 0.75 to 1.95 m.
- H-frame: 2 uprights `rbox(0.035, 1.9, 0.035)`, 2 feet `rbox(0.04, 0.03, 0.6)`, and 4 casters (`cyl` r 0.03).
- Marker tray `rbox(1.0, 0.03, 0.06)` with 3 markers and an eraser.
- Content from a new `scribbleTex` (diagrams, sticky notes).
- Colliders: board slab plus 2 feet. Cars can drive under the board.

### rug (7): 2/5
- A 4 mm `rbox` (the top stays at y ≤ 0.018u so wheels don't sink).
- New `rugTex(palette)`: a border band plus a field pattern, 4 seeded palettes, with `carpetNormal` at rug scale.
- Optional fringe on the short ends: instanced 0.004 × 0.001 × 0.05 m strands.
- Honour `rotY`.
- One shared material with the palette atlas, replacing 7 inline materials.

### art (5): 2/5
- Frame: 4 mitred bars (profile 0.04 × 0.03 m) in black, oak or gold, seeded.
- A 0.06 m white mat (passe-partout).
- New `artTex(seed)` with 4 generators: colour blocks, grid, circles, gradient landscape.
- Snap to the wall (§3.5).

### tv (office + cellar): 2/5
- 0.01 m bezel, a tapered back housing (0.05 m deep), a black wall bracket `rbox(0.3, 0.3, 0.04)` snapped 0.05 m off the wall, and a cable drop (`tube` to a 0.3 m floor box).
- Screen: a canvas slide or call grid ("Q3 ROADMAP") as the emissive map, not a flat colour.

### booth (4): 2.5/5
- Walls 0.05 m in felt: new `MAT.feltTeal` with fine `fabricNormal`.
- A roof panel `rbox(1.6, 0.05, 1.6)` at 1.5 m.
- Inside: a bench cushion (as now), a wall table `rbox(0.5, 0.02, 0.35)` at 0.72 m, and an emissive strip light 0.6 × 0.02 m under the roof.
- A black plinth of 0.05 m.
- Roof collider only if a ramp can reach it (none can today, so none).

### stall (2): 1.5/5
- Phenolic panel 0.025 m thick in `melamineGrey`, from 0.15 to 1.65 m.
- 2 chrome feet (`cyl` r 0.02, h 0.15).
- A chrome headrail `tube` r 0.015 at 1.7 m joining both stalls to the wall.
- A toilet-roll holder with a roll (ties in with the `roll` props).
- Gameplay decision: raise the collider to 0.15 m so cars can drive under the partitions (recommended).

### sink (vanity 2.6 × 0.85 × 0.85): 1.5/5 (1/3-scale basins, defect #14)
- Top: `extrudeShape` of the 2.6 × 0.85 rectangle with 2 elliptical holes (0.45 × 0.35 m), 0.03 m thick, in `stoneTop`.
- 2 lathe bowls in `ceramic` (r 0.2, depth 0.15) under the holes.
- Chrome gooseneck taps 0.28 m tall with a lever.
- Below: a wall-hung shelf plus visible chrome P-traps (`tube` path, r 0.02) to the wall. This is at eye level.
- A mirror plane 2.4 × 0.9 m in `mirror` on the wall above, and 2 soap dispensers.

### toilet (2): 2.5/5
- Keep the comic footprint, but fix the proportions.
- Bowl: a lathe profile (foot r 0.12 → rim r 0.19) scaled 1.3 in z (elongated).
- Seat: a torus scaled 1.3 in z, tube 0.025.
- Oval lid, open against the tank.
- Tank `rbox(0.42, 0.38, 0.18)` from 0.4 to 0.78 m; today it is 8 cm deep.
- Chrome lever, plus a chrome supply pipe with a stop valve at 0.2 m to the wall.

### bartop (2 office + 1 cellar): 2/5
- Top: 0.04 m oak `rbox`, r 0.01.
- Columns `cyl` r 0.04 on round base plates (`cyl` r 0.2, h 0.015), which sit at eye level.
- Foot rail: `brushedSteel` `tube` r 0.015 at 0.25 m along the length, on brackets from the columns. Decor only; cars pass under it.

### foosball: 1.5/5 (defect #11)
- **Cabinet:**
  - Side walls 0.04 m and end walls with goal slots (0.2 × 0.08 m).
  - A playfield cavity whose floor is 0.07 m below the rim, in `felt` with a line canvas (centre line, circle, boxes).
- 4 square legs 0.08 m with braces and levellers.
- **8 rods** at `x_i = (−0.5 + (i + 0.5)/8)·(w − 0.1)`, running the depth, 0.035 m below the rim, in chrome (r 0.008), with black grips (`cyl` r 0.018, L 0.1) on alternating sides.
- **26 men** in the 1-2-3-5-5-3-2-1 layout: one instancer with red/blue `instanceColor`, merged head, torso and foot, 0.06 m tall.
- A white ball (r 0.018).
- **Colliders:** cavity floor at h − 0.07, 4 rim walls, rods as thin `CylinderCollider`s. The ramp still lands at the rim, and cars then drop into the pitch. That is a gameplay call; the fallback is to keep the flat top collider and a flush cavity.

### hoop: 2/5 (defect #12)
- Ring: inner r 0.2 m, torus tube 0.01, orange `powderOrange`.
- Backboard 0.9 × 0.6 m: `glassClear` with a white border plus a shooter square (canvas).
- A ring bracket, and a net: an open lathe cone with a new `netAlphaTex`.
- Square pole 0.08 m with a padded base `rbox(0.4, 0.3, 0.3)`.
- Update the backboard collider to `args [0.45u·M, 0.3u·M, …]`.

### bench (2): 2.5/5
- 5 teak slats (0.09 × 0.035 m, 0.02 m gaps).
- 2 cast end frames from an `extrudeShape` flat-bar silhouette (legs plus armrest) in `powderBlack`, replacing the two full-height slabs.

### planter (3): 1.5/5
- A corten or fibreglass box with a 0.03 m rolled lip, and soil.
- Boxwood balls: jittered icosahedron, detail 1, r 0.2–0.3.
- Ornamental grass clumps: 3 crossed alpha planes 0.6 m, `foliage`.
- Both foliage kinds in one map-wide instancer.

### Ramps (`Ramps`; 9 office + 4 cellar): 1.5/5
- Every ramp is the same tan plank, even though each comment names a different object.
- Add an optional `kind` to `ramp()` in both maps: `plank | dustpan | binder | clipboard | books | ruler | steel | pallet`. Keep the collider.
- **Visual kit:**
  - `plank`: 18 mm MDF edge with shelf-pin holes (normal map).
  - `dustpan`: a flared lip at the floor end and a handle at the top.
  - `binder`: a spine and label, rings at the top.
  - `clipboard`: brown board, a chrome clip and a paper sheet.
  - `books`: a leaning hardcover plus 2 stacked.
  - `ruler`: wood or steel with a cm tick texture.
  - `steel`: chequer-plate normal (cellar dock).
  - `pallet`: the top boards only.
- Chamfer the floor end so the lower edge doesn't read as a floating slab.

---


## 9. `textures.js` additions (all procedural, metre-tiled)

`veneerTex`, `brushedRough`, `perfAlphaTex` (hex and round), `slotAngleTex`, `gridMeshAlphaTex` (0.05 m), `netAlphaTex`, `pegAlphaTex`, `terrazzoTex`, `leatherNormal`, `cardboardTex` (atlas), `paperEdgeTex`, `labelAtlas` (vending, LiPo, copier UI, fridge, logo), `rugTex(palette)`, `artTex(seed)`, `scribbleTex`, `serverBezelTex`, `chequerNormal`, `ballSeamTex`, `leafAtlas`.

Keep the existing rules: normal and roughness maps use `NoColorSpace` and wrap at the seams.

---

## 10. Order of work and how to check it

1. **Phase 0, bug fixes (small diffs):**
   - Defects #1: switch to `rbox` plus `metreUV`.
   - #3, #4, #5: the rotY contract, map data and the server box swap.
   - #8–#13, #16, #18.
   - A minimal proper `shelfrack` (#2).
   - Check: `npm test` passes; `rot.mjs`, `shelf.mjs`, `geo.mjs` and `uv.mjs` show the defects gone.
2. **Phase 1, foundation:** `materials.js`, the kit, static batching and the shadow list. Check: `furniture.mjs` shows office ≤ 70 draws and props 0 inline materials.
3. **Phase 2, hero furniture by what the camera sees:** counter and island, desks and tables, chairs, reception desk, shelfrack and bookshelf, racks, sofas, copier, vending, fridge, ramps.
4. **Phase 3, cars:** rear, shell, cabin, wheels, consolidation. Check: `car.mjs` shows ≤ 28 draws stock; `glass2.mjs` and `vinyl.mjs` show nothing buried or floating.
5. **Phase 4:** secondary furniture, cellar pieces, remaining props and mode objects.

Every new piece a new level needs should be built as a kit builder with the same signature and detail tiers, so new maps come in batched and consistent. That includes the pieces coming with the new level work: sit-stand desks, phone booths, lockers, planter walls and the new marble, epoxy and rubber floors.
