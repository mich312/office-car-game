# Tiny RC Mayhem — Global Improvement Plan

Research-driven roadmap for the next generation of the game: better models,
better environment, more interaction, better cars, more fun. Grounded in a
full read of the current codebase (client, server, shared) and in the design
playbooks of the games this project already borrows from — Mario Kart 8
(item/catch-up design), Rocket League (feel & physicality), Micro Machines /
Re-Volt / Toy Story RC (tiny-scale comedy), and Fall Guys (session structure
and shared chaos).

---

## 1. Where the game stands today

The vertical slice is genuinely strong: authoritative server, 4 modes, bots,
powerups with MK-honest odds, office events, drift/mini-turbo/slipstream feel,
touch + gamepad support, procedural everything, zero assets. The audit
surfaced four structural gaps that the roadmap below is built around:

| # | Finding | Evidence |
|---|---------|----------|
| 1 | **The physics chaos is single-player.** Every mug, chair and monitor is a client-local Rapier body. `shared/src/protocol.js` has no prop messages — when you smash a paper stack, your friends' offices stay tidy. The game's core fantasy ("every object is live physics") is currently a private hallucination per client. | `protocol.js`, `Props.jsx` |
| 2 | **Earned cosmetics don't exist visually.** `UNLOCKS` in `shared/src/cars.js` grants hats (cone, top hat), a bobble antenna and a rainbow trail — none are rendered. `CarModel.jsx` has one hardcoded antenna; `Menu.jsx` only lets you equip paints. Progression currently pays out in nothing. | `cars.js:81`, `Menu.jsx:18` |
| 3 | **Car models are boxes.** The toon-ramp + inverted-hull outline pass (already done) is carrying visuals that are 2–4 `boxGeometry` calls per body. The shading language deserves real silhouettes. | `CarModel.jsx:211` |
| 4 | **Content plateaus after ~30 minutes.** 4 modes, 6 events, 1 map, 5 cars. The map even ships a `ROBOT_PATH` annotated "Last Car Standing hazard" for a mode that was never built. | `map.js:271`, `modes.js` |

Everything below keeps the two constraints that make this project special:
**zero asset files** (all procedural) and **the server stays authoritative
for anything that scores**.

---

## 2. Workstream A — Better models

### A1. Procedural car bodies v2 (high impact, medium effort)
Replace box-stack bodies with real silhouettes, still 100% procedural:

- **Shells from `ExtrudeGeometry`**: author each car's side profile as a 2D
  `THREE.Shape` (a dozen points), extrude across the car width with
  `bevelEnabled` — instantly reads as "die-cast toy car" instead of "crate".
  One profile per body style; wheel-arch cutouts via `holes` on the shape.
- **Rounded cabin/canopy** via `LatheGeometry` (formula) or a scaled sphere
  with `flatShading` kept off so the toon ramp bands it.
- **Detail kit per car**: exhaust pipes (`CylinderGeometry`), roof scoop,
  mirrors, front bumper bar, license-plate quad with a tiny canvas texture
  ("HR-1", "LOL-42").
- **Driver figurine**: a minifig-scale capsule head + torso in the cockpit,
  helmet color = paint accent. Leans into corners with the existing body-roll
  code in `CarModel.jsx:77` and ducks under boost. This one change adds more
  charm-per-triangle than anything else — it's what made Toy Story RC and
  MK's karts feel alive.
- Keep `CarProxy` LOD in sync (extruded hull only, no kit).

### A2. Render the cosmetics that already exist (high impact, low effort)
- Hats (`cone`, `tophat`) as meshes socketed to the roof; bobble `antenna`
  replaces the hardcoded one with a spring-physics wobble (cheap sine).
- `rainbow` trail: reuse the `SkidMarks.jsx` ribbon technique with a hue
  cycle, gated on speed.
- Extend `Menu.jsx` to equip hat/antenna/trail slots, persisted in `store.js`
  like paint. Send in `HELLO` so remote cars show them.
- Add ~8 more unlocks once slots exist (propeller beanie, tiny plant hat,
  googly eyes on the windshield, sticky-note livery, flame decal via canvas
  texture, exhaust particle styles).

### A3. Prop and furniture model polish (medium impact, low effort)
- Office chairs get castor wheels + tilt, monitors get bezel/stand two-tone,
  the copier gets a lid that flaps when hit (visual only, no new colliders).
- One merged-geometry pass: static furniture in `Office.jsx` shares materials
  where possible (it already does this in places — finish the job) so the
  added car/prop detail is GPU-free overall.

---

## 3. Workstream B — Better environment

### B1. Shared physics world — make the chaos multiplayer (the big one)
The single most valuable engineering investment in the project:

- **Deterministic-ish sync, cheap version first**: the match `seed` already
  travels in `START`. Add a `PROP` snapshot channel: server doesn't simulate
  props; instead, clients broadcast *significant* prop impulses (`propId,
  impulse, point`) through the server (rate-limited, ~5/s per client), and
  every client applies them to its local body. Divergence self-heals because
  props settle. This makes "you knocked the mug into my path" real for ~40
  lines of protocol.
- **v2 (optional)**: server owns the ~10 gameplay-relevant heavy props
  (basketballs, boxes, chairs) exactly like it owns the soccer ball today
  (`server/src/modes.js` ball integrator generalizes cleanly), leaving the
  90 light dressing props on the impulse-relay channel.

### B2. New rooms & verticality (high impact, high effort — Phase 3)
The map's charm is density, so grow carefully:

- **Bathroom** (west of reception): tile, puddle hazards, a plunger powerup
  pad, toilet-roll ramps. Comedy per square meter is unmatched.
- **Air duct network**: 2–3 duct shortcuts entered via floor vents (ramp in,
  drop out elsewhere), replacing walls' role as pure barriers. Ducts are the
  natural "secret shortcut" this scale begs for and reuse the ramp system.
- **Under-floor cable channel** in the server room: a risky fast lane between
  the racks with sparking cables during `server_overload`.
- Each addition extends `CHECKPOINTS`/`BOT_PATH` so Desk Dash and bots keep
  working; the map ASCII diagram in `map.js` stays the source of truth.

### B3. Atmosphere passes (medium impact, low–medium effort)
- **Time-of-day cycle**: replace binary `night` with a slow dusk→night→dawn
  drift over a match (sun angle + window color temperature). Keep `N` as
  override. Rain already exists on the balcony; add a rare **thunderstorm**
  variant (lightning flash = 200 ms directional-light spike + skyline flash).
- **Living background**: window-cleaning gondola sliding past the north
  windows, city lights flickering per-window in `skylineTex`, a cat that
  walks along the balcony railing and *judges you* (spline walker, no
  physics). Idle screens in the office already tick — add a screensaver.
- **Floor storytelling decals**: coffee-stain trails into the kitchen, tire
  marks baked near popular corners (sample real `SkidMarks` heatmap during
  dev, ship as canvas texture).

---

## 4. Workstream C — More interaction

### C1. Interactive machines (high impact, medium effort)
Today the office reacts (props fly); it should also *act*. Server-triggered
so everyone shares them (they piggyback on the existing `EFFECT`/event
plumbing):

- **The printer fires**: driving past the copier while it's "printing"
  (server schedules jobs) shoots a paper burst that blinds (brief screen
  overlay) — the paper-storm instanced renderer in `OfficeEvents.jsx` reused
  locally.
- **Vending machine**: bump it hard and it drops a rolling can (physics prop,
  spawned via prop channel) — occasionally a *golden can* that's a powerup.
- **Fridge door / desk drawers**: server toggles them open on a timer;
  an open drawer is a ramp, an open fridge door is a wall. Doors as
  kinematic rotating colliders — same pattern as the cleaning robot.
- **Sprinkler test** (new office event): 10 s of low-grip everywhere +
  particle rain indoors. Reuses puddle friction logic from oil/coffee.
- **Light switches**: a physical wall switch per room that a car can ram to
  toggle that room's light — griefing as a feature at night.

### C2. Player-to-player texture (high impact, low effort)
- **Horn + emote wheel**: `H` / d-pad taps play a synth horn and pop an emoji
  sprite over the car (new tiny `EMOTE` message, relayed). Chat-free
  communication is the #1 missing social feature for a party game.
- **Bump feedback**: camera-shake + synth "clonk" scaled by validated `BUMP`
  magnitude on *both* cars, tiny score feed entry for big shunts ("💥 Karen
  from HR body-checked The Intern").
- **Rivalry tracking**: server counts bumps per pair; match-end podium shows
  "Nemesis: you vs X, 12 collisions". Cheap, memorable.
- **Spectator + drone cam** after finishing/eliminated: orbit any player,
  or pilot a free camera. Required for Last Car Standing (below) to be fun
  for the eliminated.

### C3. Shove-the-world moments
- Balcony railing is already shove-able-over — add a **fall feed message**,
  a scream doppler, and a 3-second seagull's-eye kill-cam before respawn.
  Deaths should be the funniest moment in the game, not a fade.

---

## 5. Workstream D — Better cars

### D1. Per-car special ability (high impact, medium effort)
Handling stats differentiate feel; abilities differentiate *identity*
(Rocket League's rule: every car same-ish, or MK's rule: pick your fighter —
we go MK). One ability each, server-validated like powerups, long cooldown:

| Car | Ability |
|-----|---------|
| Dune Buggy | **Pounce** — double-jump becomes a forward dive that bounces off the first thing it hits |
| Drift King | **Overdrift** — 3 s of zero-grip full-control drift, sparks charge 2× |
| Micro Monster | **Ram mode** — 2 s unstoppable: props and cars scatter, no bump stun |
| Formula Fun | **DRS** — top-speed cap +25% while in another car's slipstream |
| Office Hatch | **Company Car** — copies the last ability used by anyone nearby |

### D2. Two new roster entries (medium impact, medium effort)
- **Roomba Racer**: the cleaning robot, playable. Disc body, spins while
  drifting, immune to the cleaning-robot event. Comedy pick.
- **Tape Dispenser Dragster**: absurd top speed, terrible everything else,
  leaves a tape strip (short-lived grip *boost* line others can use —
  a cooperative trail, unique in the roster).

### D3. Feel & fairness polish (ongoing, low effort each)
- Per-car synth engine voice in `audio.js` (buggy = raspy two-stroke,
  formula = whine, monster = subwoofer) — cheap oscillator param sets.
- Ghost-through-teammates during soccer kickoff to end kickoff pileups.
- Rubber-band audit: log per-place item draws + finish spreads from bot
  matches (the scratch harness already drives full matches) and tune the
  catch-up tables with data instead of vibes.

---

## 6. Workstream E — More fun

### E1. New modes (highest fun-per-effort in the codebase)
The mode framework (`server/src/modes.js` + `ModeObjects.jsx`) makes modes
cheap. Ship in this order:

1. **Last Car Standing** — the mode the map already expects (`ROBOT_PATH`).
   Shrinking safe zone (office events every 30 s instead of 60, robot count
   grows), last survivor wins. Eliminated players get drone cam + can trigger
   one office event each ("ghost meddling", Fall Guys-style retention).
2. **Tag / Hot Potato** — one car carries a ticking stapler bomb, pass it by
   bumping. Reuses battery carry/drop logic nearly verbatim.
3. **Museum Heist** — steal the CEO's golden stapler from his desk, bring it
   to reception; everyone else defends. Reuses coffee-delivery logic.
4. **Sumo** — free-for-all on the meeting-room table, fall off = out.
   Reuses balcony fall detection + spawn logic.

### E2. Session structure: the Office Cup (high impact, medium effort)
Single biggest retention lever from kart-racer research: **best-of-N
tournaments**. Lobby votes "Office Cup" → 3 random modes back-to-back,
cumulative score, podium ceremony with confetti + horn spam at the end.
The lobby/podium flow in `room.js` already has the phases; the cup is a loop
around them plus a standings screen.

### E3. Mutators & daily spice (medium impact, low effort)
- Post-match vote occasionally offers a **mutator** for the next round:
  Giant Ball soccer, Moon Gravity, Mug Rain, Everyone-is-Shrunk, No Brakes.
  Each is 1–5 lines of constant-twiddling server-side — comedy per line of
  code is off the charts.
- **Daily seed challenge**: same seed + mode + mutator for everyone that day,
  local best-score board. Needs zero backend beyond what exists.

### E4. Progression that pays out (medium impact, low effort)
- With A2 done, double the unlock track and add **match awards** feeding XP:
  Demolition Expert (most bumps), Barista (most beans), Untouchable (no
  hits taken), Interior Decorator (most props smashed — needs B1).
- Per-mode personal bests + lifetime stat page in the menu (localStorage,
  `store.js` already persists XP).

---

## 7. Phased roadmap

Ordered so every phase ships player-visible value, and quick wins fund the
big rocks. Rough effort in focused dev-days.

### Phase 1 — "Pay off what exists" (~1 week)
| Item | Ws | Effort |
|------|----|--------|
| Render hats/antenna/trail + equip UI | A2 | 1.5 d |
| Horn + emote wheel | C2 | 1 d |
| Bump feedback + rivalry/nemesis stat | C2 | 1 d |
| Last Car Standing mode + spectator cam | E1 | 2 d |
| Balcony kill-cam & fall drama | C3 | 0.5 d |
| Per-car engine voices | D3 | 0.5 d |

### Phase 2 — "Shared world & identity" (~2 weeks)
| Item | Ws | Effort |
|------|----|--------|
| Prop impulse-relay sync (v1) | B1 | 3 d |
| Procedural car bodies v2 + driver figurine | A1 | 3 d |
| Per-car special abilities | D1 | 3 d |
| Office Cup tournament flow | E2 | 2 d |
| Interactive printer + vending machine + sprinklers | C1 | 2 d |
| Mutators (first 4) | E3 | 1 d |

### Phase 3 — "The bigger office" (~2–3 weeks)
| Item | Ws | Effort |
|------|----|--------|
| Bathroom + air ducts + underfloor channel, routes updated | B2 | 5 d |
| Server-owned heavy props (sync v2) | B1 | 3 d |
| Tag, Heist, Sumo modes | E1 | 3 d |
| Roomba Racer + Tape Dragster | D2 | 2 d |
| Time-of-day + thunderstorm + living background | B3 | 3 d |
| Match awards + stats page + daily seed | E3/E4 | 2 d |

### Explicit non-goals (for now)
- External 3D assets or asset pipeline — procedural is the identity.
- Accounts/backend persistence — localStorage + shareable room seeds suffice.
- A second map before the office is fully exploited — density beats acreage.

---

## 8. Engineering guardrails

- **Perf budget**: every visual addition must hold 60 fps on the `?lowfx`
  path on a mid phone. New geometry detail lands together with the merged-
  geometry pass (A3) so net draw calls don't rise. Car v2 bodies must keep
  the `CarProxy` far-LOD swap.
- **Protocol discipline**: new messages (`PROP`, `EMOTE`, `ABILITY`) follow
  the existing pattern — server validates anything that scores or stuns;
  rate-limit anything client-initiated.
- **Bots are players too**: every new mode and ability ships with bot
  behavior (the `Bots` class corridor-graph nav generalizes), because solo
  play is the first experience everyone has.
- **Test the fun**: extend the scratch ws-harness to drive each new mode
  end-to-end headless (join → play → score → podium) before it ships.
