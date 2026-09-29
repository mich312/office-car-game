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


## Your lane: Physics props
Outcome branch: `claude/models-props`.

The user's words: "I want you to improve all 3d models." The game is being turned into something that should hold up next to a polished indie release: every model the camera meets at RC-car height should look crafted — correct proportions at real scale, the parts that make an object recognisable, bevels/rounded edges (see roundedGeo.js — "nothing has a razor edge"), believable materials (procedural canvas textures in the textures.js style: albedo + normal + roughness breakup), and no bare primitive standing in for a real object.

Scope (files you own): `client/src/game/Props.jsx` (every prop: mug, glass, pen, stack, book, keyboard, monitor, chair, plant, bottle, basketball, marble, box, lamp, trash, roll, the spawned can and mug), `client/src/game/propBody.jsx`, and a new `client/src/game/propKit.js` (or similar) for shared prop geometry/materials — the furniture builder is creating `materials.js`/`kit.js` in parallel with a "1 UV unit = 1 metre" convention; you can't depend on it yet, so keep your own module-level registry in your file with the same convention so they can be unified later. Fix the prop defects in the audit (#8 hidden fills, #9 10-spoke chair base, #10 chair spawning inside the floor, #18 can spawning inside the vending machine — the furniture builder is adding `rotY` to VENDING in the map data; read `V.rotY || 0` when you place the can). Colour variation through vertex colours/instanceColor, never a material per colour. Target: 0 inline materials, the draw budget in the audit.

Rules for your lane:
- Keep gameplay identical: colliders (shape, size, position), masses, prop types/names and their data in the map files, network behaviour. Upgrade what things look like, not how they collide — unless a collider is clearly wrong for the object, in which case fix it and say so.
- Performance is part of quality: the whole scene should stay under ~550 draw calls in any view (it's ~410 in the cellar now; `scripts/shoot.mjs` prints draw calls). Share geometries/materials at module level, merge static sub-meshes (BufferGeometryUtils.mergeGeometries) or instance repeats. Many copies of each model exist (e.g. 21 chairs, 16 monitors).
- Other builders are working in parallel on: new maps (shared/src/maps/*, client/src/game/themes/*), the furniture/architecture/materials foundation (Office.jsx, materials.js, kit.js, textures.js, shared/src/maps/office.js), the IT Cellar polish (themes/cellar.jsx), the cars (CarModel.jsx), and later game-mode fixes (server/src/modes.js, ModeObjects.jsx). Do not edit their files. If you need a shared helper, put it in a new file you own.
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


## 6. `client/src/game/Props.jsx`

Module-level shared geometry and materials for all props: 282 plus 182 inline materials go to 0.

| Prop | Score | Plan |
|---|---|---|
| **mug** | 2.5 | A lathe with a 4 mm wall (outer r 0.043, inner 0.039, 6 mm base) and an **open top**, showing coffee at 0.08 m (roughness 0.1). The handle is a `tube` along a C-path (0.035 × 0.055 m loop, r 0.012), not a torus half-buried in the body. Printed text from a small atlas ("WORLD'S OKAYEST DEV", logo). Glaze colour as a vertex colour, so 1 draw. |
| **glass** | 2 | A lathe tumbler with a 2 mm wall and an 8 mm base; shared transparent `MeshPhysical`, no transmission (too expensive). |
| **pen** | 2 | A hex body (6 segments, r 0.005, scaled up ×1.2 for readability), a cap with a chrome clip `rbox(0.035, 0.003, 0.006)`, and a ferrule plus tip. Vertex colours, 1 draw. |
| **stack** | 2 | Sheets are 1.2 cm slabs, 6 bodies and 6 materials. Replace with 1 ream body `rbox(0.21, 0.04, 0.297)` using a new `paperEdgeTex` (fine lines) plus 3 loose sheets (4 mm colliders, CCD on). The top sheet gets a text/chart canvas. 2 shared materials. |
| **book** | 2 | The pages poke 1.7 mm out of the cover and there is no spine. Build: 2 boards of 6 mm, a half-cylinder spine (r = H/2), and a page block inset 4 mm on 3 sides with a page-edge texture. Colour through a vertex colour, plus a title band. |
| **keyboard** | 2 | 5 cm tall, which is too tall. Use a wedge base (0.018 m at the front, 0.03 m at the back) plus about 90 keycap `rbox` merged into one cached geometry (~1.1k tris), and a cable `tube`. This matters in the cellar, where keyboards lie on the floor at eye level. |
| **monitor** | 2.5 | A panel 0.54 × 0.32 × 0.012 m with an 8 mm bezel, a tapered back housing 0.4 × 0.25 × 0.04 m, a **rear-mounted** neck 0.04 m slanted 10° (today it is centred under the panel), a base `rbox(0.22, 0.015, 0.18, r 0.02)`, a cable from the back, and a logo decal. 2 draws (plastic, screen). |
| **chair** | 2 | Fix the 5-spoke base: arm length 0.31 m, `translate(0, 0, 0.155)` before `rotateY`. Add **5 twin-wheel casters** (2 × `cyl` r 0.025, w 0.012, plus a fork), which sit right at eye level. Add a gas lift with a black shroud (`cyl` r 0.03, 0.2 m), a mechanism box under the seat `rbox(0.2, 0.05, 0.2)`, a squarish seat `rbox(0.48, 0.08, 0.46, r 0.03)` instead of a round cylinder, a curved mesh back (bent `rbox`, black mesh texture) and T-armrests. **Move the origin to the bottom of the casters** (as was done for the monitor), so the spawn no longer sits 35 cm inside the floor. Café variant `cafechair`, picked in the renderer by `roomAt()` in cafeteria and meeting: a moulded shell on 4 legs. |
| **plant** | 2 | Soil is hidden: use an open lathe pot with a 0.01 m lip. Variants: snake plant (8–12 flattened blades from an `extrudeShape`, bent, yellow-margin texture) and pothos (alpha leaf planes). Shared leaf geometry. |
| **bottle** | 1.5 | A lathe (body r 0.033, shoulder, neck r 0.013) with a ribbed cap, and an opaque label band (new `labelAtlas`). Transparent body plus label: 2 draws. |
| **basketball** | 2 | New `ballSeamTex` (2 great circles plus 2 curves) with pebble normal (fine orange peel). |
| **marble** | 3.5 | Keep. Share 5 materials and add a swirl colour map. |
| **box** | 2.5 | `rbox(0.34, r 0.005)`, a centre flap seam, tape that wraps over both edges and 0.05 m down the sides, and a `cardboardTex` atlas (corrugated edges, "THIS SIDE UP", shipping label). 1 draw. |
| **lamp** | 2 | An architect lamp: weighted base `cyl` r 0.08 h 0.03, two arms 0.3 + 0.28 m (tube r 0.006) with an elbow joint and 2 spring helices, a lathe shade r 0.07 with an emissive inner and a bulb disc. 2 draws. |
| **trash** | 2.5 | A perforated lathe bin (r 0.14 → 0.11, `perfAlphaTex`), a rolled rim (torus tube 0.006), a black liner lip folded over, and 2–3 crumpled paper balls (jittered icosahedrons). |
| **roll** | 3 | A lathe with a real hollow (core r 0.02, 2 mm tube), an emboss texture and an optional hanging sheet tail. |
| **can** (spawned) | 2.5 | A lathe can (necked top, rim, domed base) with a label atlas; gold variant. Fix the spawn position (defect #18). |

---


## 9. `textures.js` additions (all procedural, metre-tiled)

`veneerTex`, `brushedRough`, `perfAlphaTex` (hex and round), `slotAngleTex`, `gridMeshAlphaTex` (0.05 m), `netAlphaTex`, `pegAlphaTex`, `terrazzoTex`, `leatherNormal`, `cardboardTex` (atlas), `paperEdgeTex`, `labelAtlas` (vending, LiPo, copier UI, fridge, logo), `rugTex(palette)`, `artTex(seed)`, `scribbleTex`, `serverBezelTex`, `chequerNormal`, `ballSeamTex`, `leafAtlas`.

Keep the existing rules: normal and roughness maps use `NoColorSpace` and wrap at the seams.

---

