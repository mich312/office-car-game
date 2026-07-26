# The Living Office — art direction

**Tiny Glade's geometry and materials, lit like Firewatch, in a building that
changes because people work in it.**

This supersedes the style board in `docs/visual-style-exploration.md` as the
chosen direction. That document stays as the survey it was; this one is the
brief. The difference between them matters: everything on the board was a
*look*, and this is a **system**. The office having a time of day is a
renderer feature. The office being different on Tuesday than it was on Monday
is a game feature, and it's the one nobody else has.

**Status:** §1 (time of day, directional shadows, practical lights) is built and
in the branch. §2–§6 are specified, not built.

---

## Why this is the right direction

The board's audit found three problems. This direction answers all three
without picking any of the six treatments:

| Finding | How this answers it |
| --- | --- |
| Two art directions in one frame | Rounded, soft-edged geometry with matte materials unifies cars and office in the *same* language — neither toon nor photoreal |
| The render never says the cars are 18 cm | A low sun throwing shadows the length of the floor is a scale cue *and* a mood cue at once |
| The post chain is the three.js house style | Bloom, exposure and key colour all become properties of the hour instead of constants |

And it adds the thing none of the eleven treatments had: **a reason to come
back tomorrow.**

---

## 1. Time of day — *built*

`client/src/game/daylight.js` is a single table of four hours consumed by
everything that emits or receives light. Nothing reads a `night` boolean any
more; a phase is a whole lighting state, and the renderers cross-fade between
them over ~1.5 s so `N` reads as the light changing rather than a switch
flipping.

| | Sun | Key colour | Ceiling strips | Bloom | The read |
| --- | --- | --- | --- | --- | --- |
| **Morning** 07:40 | low, east | `#cfe0ff` cold | 6 | 0.50 @ 0.85 | long shadows west off every chair leg |
| **Afternoon** 14:20 | high, near-overhead | `#fff6e6` | 2 | 0.72 @ 0.78 | bright, near-blown, hard-edged |
| **Golden hour** 19:05 | very low, west | `#ff9a3c` | 4 | 1.05 @ 0.66 | the whole floor glowing warm |
| **Night** 23:40 | moon only | `#7f9fff` | 22 | 0.62 @ 0.80 | practicals carry everything |

What actually makes it work:

- **The sun moves.** It's a real `directionalLight` whose position lerps
  between phases, so shadow length falls out of elevation for free — that's
  the entire Firewatch cue and it costs nothing. What it *cost* was the shadow
  map, which had no resolution to spare for shadows that long — see §1b.
- **The window shafts swing with it.** `Office.jsx` already had additive slabs
  through the north glass; they now take tilt, yaw, length, colour and opacity
  from the hour. A low golden-hour sun lays them almost flat *along* the floor —
  those are the bands you drive through. This was the cheapest big win in the
  whole change: the geometry existed, it just wasn't allowed to move.
- **Every fixture agrees.** Floor pools, ceiling panel emissives and the
  balcony sheen all read the same table, so the office never contradicts itself.
- **Bloom is a property of the hour.** Golden hour wants a 0.66 threshold so
  window bands and chrome catch; midday at that setting would blow out.
- **Default is golden hour.** The fiction is after-hours, and it's the best the
  game has ever looked.

Two notes for whoever touches this next:

- The store field is **`timeOfDay`**, not `phase`. `phase` is already the match
  phase (lobby / countdown / playing / podium) and the server overwrites it —
  the first version of this collided and silently fell back to night.
- `night` is still in the store, derived from `timeOfDay`. Six files ask the
  cheap boolean question (car headlights, audio rain mix, HUD) and none of them
  needed to change.

### 1b. Directional shadows — *built*

The fixed rig covered the whole 42×24 m floor with one 2048 map. That put a
texel at **~2.7 cm** — and the cars are 18 cm long, so a car's own shadow was
six texels across and chair legs dissolved. Long shadows were the whole point
of a low sun and there was no resolution left to draw them with.

The frustum now **follows the player** instead of covering the building: a box
centred nine units ahead of the car, sized per quality tier.

| | Coverage | Texel | A car (18 cm) is |
| --- | --- | --- | --- |
| **high** — 4096 map, ±62u | 27.9 m | 6.8 mm | 26 texels across |
| **medium** — 2048, ±46u | 20.7 m | 10.1 mm | 18 |
| **low** — 1024, ±38u | 17.1 m | 16.7 mm | 11 |
| *the old fixed rig* | *56.2 m* | *27.5 mm* | *6.6* |

High is the default and is **4× finer** than the rig it replaces while still
covering half the building.

**Quality is measured, not guessed.** There is no reliable way to ask a browser
how fast its GPU is — vendor strings lie and `maxTextureSize` says nothing
about fill rate — so the renderer starts at high and steps down only if it
can't hold 40 fps. It never steps back up, because oscillating quality is worse
than being one tier low. `?shadows=high|medium|low` pins it.

The measurement window is deliberately **time-based (1.5 s) rather than
frame-based**. A 90-frame window sounds equivalent and isn't: at 1 fps it takes
90 seconds to decide, so the machine that most needs the downgrade waits
longest for it. The first version had exactly that bug and never fired.

Two details that make or break the following frustum:

- **Texel snapping.** A frustum that slides under static geometry makes every
  shadow edge crawl as texels re-quantise. The focus point is transformed into
  the light's view space, rounded to the texel grid and transformed back, every
  frame. This is the difference between "follows you" and "shimmers".
- **Bias is per-hour.** A grazing golden-hour sun needs more than double the
  `normalBias` of an overhead midday one or it acnes; the moon wants a faint,
  soft shadow (`shadow.intensity` 0.35) rather than a hard one, or it reads as
  a second sun.

Sizing is the live trade-off: shadows stop at the box edge, so each tier's
`half` is the dial between crispness and how far a long shadow can reach.

A note on the earlier version of this page, which claimed software rendering
was "a fair stand-in for a weak integrated GPU" and pinned the map at 2048 on
that basis: that was wrong. Swiftshader is a software rasteriser and measured
**1.7–2.3 seconds per frame** here — under 1 fps, one to two orders of
magnitude off any real GPU. It says nothing about an M-series Mac, which
handles a 4096 map without noticing. Hence tiers plus measurement instead of a
guess dressed up as a proxy.

### 1c. Practical lights — *built*

`client/src/game/Practicals.jsx`. Desk lamps, monitor spill, backlit keycaps
and charger LEDs, all scaled by a `practical` level per hour: 0.06 at midday,
1.0 at night.

**None of them is a real light.** There are already seven scene lights and
fragment cost scales with light count, so a dozen more would cost more than the
entire post chain. Every practical is an additive quad that bloom then blows
into something reading as a source. Nothing in this room needs a desk lamp to
cast an accurate shadow, so the cheat is invisible.

- Positions are derived from `PROPS` in the shared map, not retyped — move a
  desk and its lamp glow moves with it.
- Monitor spill sits *in front* of the screen (derived from the prop's `rotY`),
  and each screen flickers on its own offset — eight screens blinking in unison
  is the tell that gives away fake screen light.
- Keycaps drift round the hue wheel at 0.045 Hz. The first pass was far too
  saturated and read as summoning circles on the carpet; it's a tint now.
- **In a blackout the practicals stay at 0.85.** Screens and charger LEDs are
  on a UPS, so during `lights_out` they become the only way to read the room —
  which turns them from decoration into navigation.

### Still to do on lighting

- **Coffee steam** in the morning, **dust motes** in the afternoon shafts.
  `particles.jsx` already exists.
- **Per-hour tone mapping.** ACES is still on every phase and it's fighting
  golden hour specifically. AgX or Neutral would keep the orange.
- **Lamp glows don't follow knocked-over lamps.** Lamps are physics bodies; the
  glow is pinned to the map position. Rare enough to leave, cheap to fix by
  reading the body transform.

---

## 2. Materials — the Tiny Glade half

The lighting is the loud half; this is the half that makes it feel handmade
rather than merely lit. One rule does most of the work:

> **Nothing has a razor edge.**

- Rounded corners on every desk, monitor bezel, keyboard and box — a 1–2 mm
  chamfer at real scale, which at 18 cm car scale is a visible, catchable
  highlight. Right now the office is built from hard-edged primitives, so this
  is a geometry pass: `RoundedBox` from drei covers most of it, and bevelled
  extrusions cover the rest.
- **Matte over glossy.** Fabric chair texture, matte bezels, soft plastic
  keycaps. Only glass, metal rims and the car's paint should be shiny — which
  makes the cars pop as the only glossy things in a matte world.
- **Visible wood grain** on the desks (already procedurally there — it just
  needs to survive the flattening).
- Edge highlights and contact darkening do the rest; that's mostly N8AO, which
  is already in the chain.

The payoff is exactly as briefed: *toy-like without looking like toys.*

---

## 3. Prop vocabulary — recognisable beats fantastical

The current map has mugs, keyboards and boxes. The brief's list is better
because every item is a *road-surface* idea rather than an obstacle idea:

| Object | Becomes | Note |
| --- | --- | --- |
| USB cable | suspension bridge | needs a spline mesh + a bit of sag |
| Keyboard | cobblestone street | rumble, grip loss — keycaps as real bumps |
| Mouse pad | racetrack | high-grip surface, a genuinely different feel |
| Notebook | jump | already half-exists as book-ramps |
| Headphones | tunnel | the arc is the perfect car-height arch |
| Sticky notes | ramps | cheap, colourful, scatterable |
| Coffee stains | muddy puddles | `stainTex()` already exists; needs grip loss |
| Pencil sharpener | industrial building | pure silhouette comedy |

The important part isn't the list, it's the principle: **surfaces with
different grip** is a driving mechanic that costs nothing to explain, because
everyone already knows what a mouse pad feels like versus a keyboard.

---

## 4. Weather as an indoor lighting mechanic

Because you're inside, weather can only reach you as light — which makes it
cheap and makes it dramatic.

- **Sunny** — hard shadows, bright reflections (the current afternoon/golden).
- **Cloudy** — sun intensity down, ambient and hemi up, shadows soften toward
  nothing. Almost free: it's the same table with different numbers.
- **Rain** — drops and streaks on the *inside* of the glass, and thunder as a
  brief full-intensity white sun flash. The rain system already exists for the
  balcony.
- **Winter** — snow outside, blue-white key, and string lights in December.

All four are entries in the same `DAYLIGHT` table shape, which is why the table
was built as data rather than as branches. Weather multiplies the hours rather
than replacing them.

---

## 5. The signature feature: an office that has been used

This is the part worth protecting. Every in-game day, the office is subtly
different, because people were working in it while you weren't:

- a mug left somewhere new
- a notebook open on a different page
- a laptop closed that was open
- packages arrived by reception
- chairs moved
- plants slightly taller
- a new stack of paper that is now a jump
- someone built a cardboard castle over lunch

The player stops memorising a track and starts learning a *place*.

**How it has to be built.** The changes must be identical for everyone in the
lobby, so this cannot be client-side randomness:

1. The server owns an **office day number** and derives a seed from it.
2. A `shared/` module turns that seed into a **layout delta** — a list of prop
   overrides against the static map (moved, added, removed, re-posed).
3. The delta ships in the existing join payload; clients apply it before the
   first frame.
4. Anything the delta adds that is drivable (paper stacks, boxes) has to be in
   the delta *before* physics colliders are built, not after.

That last point is the real constraint: the map is currently a static import
shared by client and server, and prop *collision* comes from it. Making it
seeded is a change to how the map is loaded on both sides, not a decoration
pass. Worth it — but it's the one item on this page that is genuinely
architectural rather than cosmetic.

**Cheap version first:** cosmetic-only deltas (mug positions, laptop lid angle,
plant scale, sticky-note colours) need no collider changes at all and would
prove the whole idea in a day.

---

## 6. Order of work

1. ~~Time-of-day lighting rig~~ — **done**
2. ~~Player-following directional shadows with texel snapping~~ — **done**
3. ~~Practical lights (lamps, monitors, keycaps, charger LEDs)~~ — **done**
4. Per-hour tone mapping; kill ACES on golden hour
5. Rounded-geometry + matte-materials pass — the Tiny Glade half
6. Cosmetic seeded daily deltas — proves the signature feature cheaply
7. Weather as extra rows in the daylight table
8. Prop vocabulary: grip surfaces, then the set-piece props
9. Full layout deltas with colliders — the architectural one, last

---

## References

- [Firewatch's lighting and colour scripting — Campo Santo](https://blog.camposanto.com/post/117136505118/dev-blog-firewatch-lighting-and-colour)
- [Tiny Glade's renderer and soft geometry — Pounce Light](https://pouncelight.games/)
- [Miniature faking — why blur and low sun read as small](https://en.wikipedia.org/wiki/Miniature_faking)
- Prior survey and the eleven-treatment board: `docs/visual-style-exploration.md`,
  `docs/style-board.html`
