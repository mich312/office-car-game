# The Living Office — art direction

**Tiny Glade's geometry and materials, lit like Firewatch, in a building that
changes because people work in it.**

This supersedes the style board in `docs/visual-style-exploration.md` as the
chosen direction. That document stays as the survey it was; this one is the
brief. The difference between them matters: everything on the board was a
*look*, and this is a **system**. The office having a time of day is a
renderer feature. The office being different on Tuesday than it was on Monday
is a game feature, and it's the one nobody else has.

**Status:** §1 (time of day) is built and in the branch. §2–§6 are specified,
not built.

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
  the entire Firewatch cue and it costs nothing. The shadow camera had to grow
  (`±125 × ±95`, far 460) because a low sun throws shadows clean off the old
  bounds.
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

### Still to do on lighting

- **Desk lamps as real pools.** Night currently leans on ceiling strips. The
  brief's "safe illuminated paths and mysterious corners" needs practicals *at
  floor height*: lamp cones, RGB keyboard glow, charger LEDs, monitor flicker.
  This is the single highest-value follow-up, because it turns lighting into
  level design.
- **Monitor flicker** on a slow noise curve — nearly free, enormously alive.
- **Coffee steam** in the morning, **dust motes** in the afternoon shafts.
  `particles.jsx` already exists.
- **Per-hour tone mapping.** ACES is still on every phase and it's fighting
  golden hour specifically. AgX or Neutral would keep the orange.

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
2. Practical lights at floor height (desk lamps, keyboards, chargers, monitor
   flicker) — turns lighting into level design, biggest remaining win
3. Per-hour tone mapping; kill ACES on golden hour
4. Rounded-geometry + matte-materials pass — the Tiny Glade half
5. Cosmetic seeded daily deltas — proves the signature feature cheaply
6. Weather as extra rows in the daylight table
7. Prop vocabulary: grip surfaces, then the set-piece props
8. Full layout deltas with colliders — the architectural one, last

---

## References

- [Firewatch's lighting and colour scripting — Campo Santo](https://blog.camposanto.com/post/117136505118/dev-blog-firewatch-lighting-and-colour)
- [Tiny Glade's renderer and soft geometry — Pounce Light](https://pouncelight.games/)
- [Miniature faking — why blur and low sun read as small](https://en.wikipedia.org/wiki/Miniature_faking)
- Prior survey and the eleven-treatment board: `docs/visual-style-exploration.md`,
  `docs/style-board.html`
