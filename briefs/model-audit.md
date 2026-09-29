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

## 8. `client/src/game/ModeObjects.jsx`

| Object | Score | Plan |
|---|---|---|
| **CoffeeMachine** | 1 | Set y so the bottom sits on the worktop (defect #13). Build a bean-to-cup machine 0.36 × 0.58 × 0.45 m: `rbox` body in `brushedSteel` plus black, a translucent bean hopper on top, a drip tray 0.3 × 0.03 × 0.15 m with a grille, a spout head with 2 nozzles, a touchscreen canvas ("DELIVER ☕"), and a cup under the spout. |
| **Battery** | 2 | A LiPo hard case in black with a label canvas ("5000mAh 2S 50C" plus a green stripe), red and black lead `tube`s to a yellow XT60 plug, and a white balance lead. Glow from an emissive label stripe instead of the whole box; keep the point light. |
| **SoccerBall** | 3.5 | Add a printed "★★★" decal to the map. |
| **Goals** | 1.5 | 2 posts plus a crossbar (tube r 0.018 m, white), a back frame, a net (`netAlphaTex`) on 3 sides and the top, and a team-colour floor strip in place of the translucent box. |
| **PowerupPads** | 2 | One instanced mesh for the rings and one for the cubes: `rbox` r 0.1 with "?" printed on all faces via canvas. Drop the 16 TextSprites. Result 2 draws. |
| **Robot** | 1.5 | Keep the size. Add a 180° black front bumper shell, a lid with a button and a red emissive ring LED, a lidar turret (`cyl` r 0.04, h 0.03), 2 spinning three-prong side brushes and 2 visible wheels. **Face the heading** (`atan2` of motion) instead of spinning constantly. |
| **Beans** | 2 | Set `mesh.count = beans.length` (defect #16). Shape: an ellipsoid (scaled 1, 0.7, 1.4) with a crease displaced on the flat face. |
| **Rockets** | 1.5 | Body `cyl`, nose cone and 3 fins, merged and instanced. |
| **ItCrown** | 2 | A band plus 5 points plus 5 bead spheres, merged. |

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