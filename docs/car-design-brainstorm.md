# Car design — brainstorm, parts, and what shipped

> **Note on "tuning".** This doc originally read the brief as handling tuning
> and built a setup sheet (§3). That was the wrong axis: tuning in a garage
> means *parts*. §3b is the bolt-on system that answers the brief; the setup
> sheet stayed because it works and it is honest about trade-offs, but it is now
> the **SETUP** tab, not the headline.

Scope: the cars themselves. How they look, how they read at 1 world unit long,
and how much of their behaviour the player gets to author. Written against the
codebase as it stands (`shared/src/cars.js`, `shared/src/tuning.js`,
`client/src/game/CarModel.jsx`, `client/src/game/LocalCar.jsx`,
`client/src/ui/Menu.jsx`).

---

## 1. Where the cars stood before this pass

Phase 2 of `IMPROVEMENT_PLAN.md` already replaced box-stack bodies with
extruded side profiles, a leaning driver figurine, a toon ramp and an
inverted-hull outline. That was the big structural win. What the audit found
left over:

| # | Finding | Evidence |
|---|---------|----------|
| 1 | **Silhouettes were finished, surfaces were not.** One paint colour, one shading model, no trim. Every car in a 12-car lobby was the same plastic gloss. | `CarModel.jsx` single `MeshToonMaterial` |
| 2 | **No wheel arches.** Wheels bolted onto a slab side with nothing over them — the one detail that separates "car" from "extruded shape" at a glance. | `Wheel` / shell extrusion |
| 3 | **Lamps floated.** Head/tail lights were hardcoded at `z = ±0.5` for all five bodies, so the Micro Monster's lamps hovered ~10 cm off its nose and the Formula's hung in the air. | old `CarModel.jsx:231` |
| 4 | **No identity per car beyond colour.** No plate, no grille, no mirrors, no pipe. Nothing to read up close in the garage, which is where players spend their pre-match minute. | — |
| 5 | **Handling was read-only.** `CARS` stats were fixed per body. Players could restyle everything and change nothing about how the car drove — the garage is literally called "RC TUNER" and had no tuning in it. | `cars.js`, `Menu.jsx` |
| 6 | **The garage previewed looks, not behaviour.** Stat bars showed constants. Nothing let you see what a choice would *do* before a match. | `Menu.jsx` `Stat` |

---

## 2. Brainstorm — visual design

Ideas are tagged **[shipped]** in this pass, or left in the backlog with a
rough effort estimate. Everything stays procedural: no asset files, ever.

### Surfaces & paint
- **[shipped] Paint finishes that change the shading model** — Toy Gloss keeps
  the toon ramp the art direction is built on; Matte Wrap, Metal Flake and
  Pearl Coat switch to PBR so office strip lights actually crawl across the
  panels. Both scenes already ship an `Environment`, so metals reflect for free.
- **[shipped] Trim/accent package** — one accent colour drives splitter,
  mirror caps, wing blade and the driver's helmet. Zero-cost two-tone: with no
  accent picked, everything paints body colour exactly as before.
- Backlog: **two-tone roof** (needs the shell split into roof/lower meshes, or
  a canvas mask on the existing vinyl planes) — 1 d.
- Backlog: **weathering** — a dirt/scuff overlay that accumulates during a
  match from `SkidMarks`-style sampling, washed off in the garage. Comedy value
  is high; cost is a per-car texture — 1 d.
- Backlog: **carbon-fibre and glitter finishes** (procedural weave / sparkle
  normal map) — 0.5 d.

### Bodywork detail kit
- **[shipped] Fender flares** over each wheel, per-body radius and axle line,
  a 0.68π arc so it reads as a lip rather than a ring. Open-wheelers (Formula)
  correctly get none.
- **[shipped] Per-body lamp placement** — head/tail lights now sit on the nose
  and tail each shell actually has.
- **[shipped] Grille** (dark panel + two chrome bars), **front splitter**,
  **door mirrors on stalks**, **exhaust tip**.
- **[shipped] Asset-tag licence plate** carrying the driver's name, drawn on a
  canvas texture (euro-plate blue stripe, facilities-issue). Every car in the
  lobby wears its owner's name in chrome-ish plastic.
- **[shipped] Brake discs + calipers**, mounted outside the spin group so the
  caliper stays bolted to the hub while the wheel turns — visible through open
  spokes, painted in the accent colour.
- Backlog: **googly eyes on the windshield** as an unlockable, **roof scoop**,
  **tow hook**, **spare-tyre-on-the-tailgate** for the Monster — 0.5 d each.
- Backlog: **damage state** — bent bumper / flapping panel after big hits,
  reset on respawn. Reads instantly and rewards aggression — 2 d.

### Wheels & stance
- **[shipped] Tyre width follows the compound** you fit: soft rubber is
  visibly fatter, hard rubber skinnier.
- **[shipped] Ride height follows the spring rate** — and not by fudging an
  offset: the garage reads the equilibrium suspension length straight out of
  `settleFor(springMul)`, the same number the physics uses. Soft springs slam
  the car, stiff springs stand it up.
- Backlog: **camber** on the rear wheels for the drift build — 0.5 d.
- Backlog: **wheel-size options** (bigger rims, lower profile) that feed the
  suspension ray length — 1 d.

### Roster
- Backlog (already in the plan as D2): **Roomba Racer** and **Tape Dispenser
  Dragster**. Both are silhouette-first designs — a disc and a rectangle — so
  they'd land cheap on the current shell pipeline.

---

## 3. Brainstorm — tuning

The design question: how do you let players author handling without turning
the garage into a power-creep ladder? Three candidate shapes were considered:

1. **Upgrade tree** (buy +5% top speed with XP). Rejected: pay-to-win by
   construction, and it breaks the project's stated rule that all car
   differences are feel, not power.
2. **Budget-point build** (spend 10 points across 5 stats). Rejected on
   second thought: a budget always has a metagame optimum, and everyone
   converges on the same sheet within a week.
3. **[shipped] Pure trade-off setup sheet.** Five axes, each a −2…+2 notch
   scale where every notch gives with one hand and takes with the other. There
   is no budget because there is nothing to hoard: a maxed sheet is a
   *specialised* car, never a stronger one.

### The five axes as shipped

| Axis | −2 | +2 | Gives | Takes |
|------|-----|-----|-------|-------|
| Gearing | Short | Tall | top speed | acceleration |
| Tyres | Hard | Soft | grip (and drift bite) | slide, a little top speed |
| Suspension | Soft | Stiff | steering rate, ride height | composure over bumps/landings |
| Downforce | Low drag | High wing | downforce, high-speed stability | top speed |
| Ballast | Stripped | Loaded | mass — you shove, you don't get shoved | acceleration and agility |

Two of these are honest physics rather than stat arithmetic: the suspension
notch scales the actual spring and damper rates in the 4-ray suspension (so a
stiff car really does skip over keyboards and land harder), and ballast scales
rigid-body mass, which the bump knockback ratio already reads on both sides of
a contact — including the rival's sheet, server-side too.

Coefficients are deliberately small: ±2 notches moves a stat by roughly a
tenth, about the distance between two cars in the roster. Enough to feel,
never enough to make a build mandatory.

### Fairness & safety
- Every axis is validated server-side (`sanitizeTune`) — a hand-edited `HELLO`
  can't invent a sheet.
- `scripts/test-tuning.mjs` proves the extremes: the fastest tuned car in the
  roster plus full boost tops out at 30.9 u/s, under both `SPEED_HARD_CAP` (34)
  and the anti-teleport `MAX_PLAUSIBLE_SPEED` (35). Grip and drift stay inside
  their clamps for every sheet on every car.
- The stock sheet is a bit-exact no-op, so nothing about the existing five cars
  changed feel unless the player asks for it.
- Bots roll random sheets, so a ballasted bot really is slower and the lobby
  looks like it has opinions.

### Backlog
- **Per-mode sheets** — remember one setup per game mode, auto-swap on the
  vote (soccer wants ballast, Desk Dash wants gearing) — 0.5 d.
- **Shareable setup codes** — pack five notches into 4 characters, paste into
  the name field to import a friend's sheet — 0.5 d.
- **Telemetry-driven suggestions** — after a match, "you spent 40 % of your
  time above 80 % throttle in corners: try softer tyres" — 1 d, needs a
  session recorder.
- **Tyre wear over a match** as an optional mutator — grip decays, a pit-stop
  pad in the kitchen resets it — 1.5 d.

---

## 3b. Bolt-on parts — the tuning that actually belongs in a garage

Ten fitted slots, all cosmetic, all procedural. The leverage that made this
cheap is `shellBounds()`: because each part mounts off the *measured* nose,
tail and flank of a shell, one implementation fits all five bodies, and any
sixth body added later gets the whole catalogue for free.

| Slot | Options | Notes |
|------|---------|-------|
| Front end | stock bumper · splitter lip · bull bar · winch bumper | mounts on the measured nose |
| Hood | smooth · ram scoop · twin vents · bonnet pins | per-body bonnet anchor |
| Roof | bare · cargo rack + file box · light bar · inbox trays | light bar lamps come up at night |
| Sills | clean · side skirts · running boards | rocker line per body |
| Arches | stock lip · widebody | widebody widens the visual track to match |
| Tyres | road · knobbly · slicks | changes rubber size, tread ring and sheen |
| Exhaust | single · twin · side pipes · stacks | stacks run up the outside of the rear pillars |
| Glass | clear · smoked · limo black | swaps the glass material |
| Wheels | six rim styles | pre-existing, now cycled in the same picker |
| Spoiler | four | pre-existing, now cycled in the same picker |

Plus a **plate you can write yourself** (7 characters, canvas-drawn), a
`🎲 SURPRISE ME` full-build roll, and `STRIP TO STOCK`.

Everything travels in `style`, which already syncs through `HELLO` and gets
sanitised server-side, so rivals see your build and bots roll their own —
including parts.

### Preview: the bench camera is the feature
Each slot declares a focus region (`front`, `rear`, `side`, `roof`, `wheel`).
Fitting a part parks the turntable at that angle and dollies the camera in on
it, then releases back to the slow showroom spin after four seconds. Cycling
with ‹ › arrows rather than picking from a list is deliberate: the car changes
under you while you hold the same button, which is the whole point of previewing
parts.

### Backlog
- **Body kits** as a single pick (bumper + skirts + arches + wing in matched
  sets), the way NFS Underground did it — 0.5 d.
- **Per-part paint** (a black bonnet on a red car) — needs the shell split into
  panels, 1.5 d.
- **Part unlocks tied to XP**, so the catalogue is also progression — 0.5 d, but
  only once there are more parts than a new player would want at once.
- **Doors/bonnet that open** in the garage to show the driver — 1 d.

---

## 4. Brainstorm — preview (the part that makes tuning learnable)

A slider that changes an invisible number is a worse feature than no slider.
Four preview layers were considered; three shipped.

- **[shipped] Live 3D preview.** The turntable car reflects the sheet as you
  drag: ride height from spring rate, tyre width from compound, wing rake from
  downforce. You see the build, not just its numbers.
- **[shipped] Stat bars with a stock tick.** The CAR tab's bars now show the
  car *as tuned*, with a tick where stock sits and a signed delta beside it.
- **[shipped] Simulated slalom trace.** `simulateDrive()` in
  `shared/src/tuning.js` re-runs a 2-D copy of the grounded driving model from
  `LocalCar.jsx` — engine force to the ceiling, yaw bias with the high-speed
  fade, lateral grip bleed — driven by a pursuit controller aiming at a weaving
  course (the same "steer toward the target heading" logic the bots use). The
  bench monitor plots your trace solid against stock dashed over the dotted
  course. Trace length is ground covered in 6 s; wobble around the course is
  how tidily the car tracks it. Six headline numbers sit under it (top speed in
  scale km/h, 0→top, turn rate, mean units off the line, mass, 6-second run),
  each with a signed delta against stock.
  Design notes worth keeping: the input has to be a *pursuit controller*, not a
  fixed steering wave — a fixed wave lets a fast car wander off-axis and the
  "slalom" degenerates into a lazy arc that says nothing. And the model is
  shared code, not a UI reimplementation, so the preview cannot drift out of
  sync with the physics.
- Backlog: **in-garage test drive** — let the car actually run the mat under
  Rapier with the current sheet, camera tracking it, `T` to launch. This is the
  one preview the trace can't replace (it shows feel, not numbers) — 2 d,
  needs a physics world in the menu scene.
- Backlog: **ghost replay** — race your own best Desk Dash lap as a ghost car
  while previewing a new sheet — 3 d.

---

## 5. What shipped in this pass

| Area | Change | Files |
|------|--------|-------|
| Tuning model | 5-axis trade-off sheet, presets, validation, derived stats, deterministic drive simulation | `shared/src/tuning.js` (new) |
| Physics | tuned accel/top/handling/grip/drift/boost, spring & damper rates, downforce, mass; rival mass reads their sheet | `client/src/game/LocalCar.jsx` |
| Visuals | finishes, trim package, fender flares, per-body lamps, grille, splitter, mirrors, exhaust, name plate, brake discs; stance/tyre-width/wing from the sheet | `client/src/game/CarModel.jsx`, `client/src/game/textures.js` |
| Garage | TUNE tab (sliders, presets, live 3D preview, slalom trace, 6 metrics), stat ticks + deltas, FINISH and TRIM pickers | `client/src/ui/Menu.jsx`, `client/src/ui/styles.css` |
| Netcode | `tune` travels in `HELLO`, sanitised server-side, echoed in the lobby payload so rivals see your stance | `client/src/net.js`, `server/src/room.js`, `client/src/game/RemoteCars.jsx` |
| Bots | random setup sheets, applied to their speed and their looks | `server/src/bots.js` |
| Tests | 30 assertions on validation, trade-off direction, clamps, speed rails, preview determinism | `scripts/test-tuning.mjs` (new, wired into `npm test`) |

Perf note: the detail kit adds ~12 small meshes per car, all sharing the
existing per-car materials, and the far-LOD `CarProxy` swap at 28 units is
untouched — distant traffic still renders as two meshes.

---

## 6. Suggested next pass, in order

1. **In-garage test drive** — the missing preview layer, and the one players
   will ask for first.
2. **Damage state** — highest charm-per-triangle left on the list, and it makes
   contact legible.
3. **Per-mode sheets + shareable codes** — cheap, and turns tuning into a thing
   players talk to each other about.
4. **Roomba Racer / Tape Dragster** — new silhouettes now that the kit,
   finishes and tuning all apply to any body automatically.
