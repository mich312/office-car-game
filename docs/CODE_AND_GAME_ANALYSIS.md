# Tiny RC Mayhem — code & game analysis

Read of the repository at `e8121b8` (post "The Living Office" merge). ~13k lines of
hand-written JS/JSX across three workspaces, plus ~1.7k lines of design docs.

Verified during this pass:

- `npm install` clean, `npm test` **all green** (snapshot codec, tuning maths, and the
  full end-to-end ws smoke test across tag / respawn / prop relay / koth / sumo / soccer).
- `npm run build` succeeds — 3.95 MB JS, 1.39 MB gzipped, in a **single chunk**.

---

## 1. What the game actually is

A 2–12 player arcade driving game set in an after-hours office, at 1 unit ≈ 22.5 cm
so an 18 cm RC car treats a desk as a mountain. Ten modes vote from a lobby, a
3.5-minute match runs, a podium pays XP, repeat.

The design has an unusually clear spine, and it's worth naming because it explains most
of the code decisions:

**Everything in the room is either a ramp, a projectile, or a hazard.** Furniture is a
collider you climb via book-ramps; props (mugs, marbles, chairs, monitors) are live rigid
bodies; the vending machine, the copier and the cleaning robot are scripted antagonists.
There is no jump button — air time is *earned from the geometry*. That single rule is why
the map file is 437 lines of hand-placed meters rather than a procedural generator.

**Chaos is telegraphed, not sprung.** Office events warn 3 s ahead (`room.js:729`),
Last Car Standing warns 5 s before a room closes (`LCS.WARN_S`), mutators are announced at
START. The game is trying very hard to stay *readable* while being maximalist. This is the
single best design decision in the project.

**Every advantage is a trade.** The car roster is explicitly feel-only
(`cars.js:1`); the setup sheet is five −2…+2 axes where each notch gives one stat and takes
another, with a test asserting exactly that (`test-tuning.mjs`, "every axis is a trade").
Powerup odds are position-weighted Mario-Kart style (`room.js:444`). There is no
progression that makes you faster — XP buys hats.

### Where the design has soft spots

- **Ten modes, one map, one 6-bot lobby.** Coverage is broad but each mode gets one
  configuration. Sumo always shrinks to the same open-office centre (`SUMO_ZONE`); soccer
  always uses the same two doorways. Depth here would come from variants, not more modes.
- **Desk Dash is 2 laps of an 18-checkpoint circuit** with `CHECKPOINT_RADIUS = 7.0` units
  (≈1.6 m of world). That radius is generous enough that the "shortcuts everywhere" promise
  is partly free — you can miss the intended line and still trip the checkpoint.
- **Score scales are not commensurable across cup rounds.** `office_cup` sums raw
  per-mode scores (`room.js:326`). A soccer round pays 50/goal ×2 for the scorer; a koth
  round pays 3/s (≈540 max); Desk Dash pays 500 for a win *plus* an inflated progress score
  (see §4.6). Whichever modes the cup rolls decides how much the cup is worth, so round 1 can
  dominate rounds 2–3.
- **Bots are competent but legible.** They follow a 39-point racing line with a
  `skill ∈ [0.62, 0.88]` speed multiplier and no awareness of powerups aimed at them, no
  drifting, no boost. They read as traffic more than as opponents — which is arguably right
  for a party game, but it caps solo play.

---

## 2. Architecture

```
shared/  constants, car & mode definitions, the whole map, the binary snapshot codec,
         and tuning maths — imported verbatim by both sides
server/  Node + ws. 20 Hz tick. Authoritative for flow, scoring, powerups, events,
         the soccer ball, bots, bump classification, respawn placement
client/  React 19 + R3F + Rapier + zustand. Owns its own car's physics.
```

The load-bearing choice is **client-authoritative car physics with a server-authoritative
game layer**. Each client simulates its own car with a 4-ray suspension over a Rapier rigid
body and streams transforms at 20 Hz; remote cars are kinematic colliders driven by a 120 ms
interpolation buffer, so you physically bounce off other players locally.

Three details make this actually work, and they're the most sophisticated code in the repo:

1. **Forces run per physics step, not per frame.** `useBeforePhysicsStep` with a fixed
   `PHYS_TIMESTEP` (`LocalCar.jsx:363`) means handling is identical at 30 fps and 144 fps.
   Most hobby driving games get this wrong.
2. **Local-first knockback with echo suppression.** On contact the client classifies
   rub-vs-hit itself using the remote's finite-differenced velocity and applies knockback
   *immediately* (`LocalCar.jsx:858`), then ignores the server's echo for 900 ms
   (`S.selfBump`). Collisions feel instant instead of round-trip laggy — and Ram Mode
   deliberately bypasses the suppression so it always lands.
3. **Bounded chaos.** `SPEED_HARD_CAP = 34` and `ANGVEL_CAP = 7` are applied after every
   impulse stack, and `MAX_PLAUSIBLE_SPEED = 35` sits just above them so a legitimately
   capped car can never trip the server's own anti-teleport check. `test-tuning.mjs` asserts
   the fastest possible tuned car + boost (30.9) stays under both. The safety rails are
   *designed as a closed system*, not bolted on.

The binary snapshot codec (`shared/src/snapshot.js`) is a section-bitmask format: 16-bit
fixed-point positions at 1 cm, 16-bit quats, per-mode sections so a race pays nothing for
soccer state. Measured 167 bytes vs 804 for the JSON equivalent. `decodeSnapshot` returns the
exact shape the JSON did, so the client handler never changed — a genuinely clean migration.

---

## 3. What's well done

- **`shared/` as real single source of truth.** The map, the car stats, the tuning maths and
  the wire format are one copy. The server's soccer sim collides against the same `WALLS`
  and `FURNITURE` the client renders; bots navigate the same wall boxes.
- **The garage preview is honest.** `simulateDrive()` re-runs a stripped 2-D copy of the
  actual driving model — same engine force, same yaw-target controller, same high-speed
  steering fade — so the slalom trace on the bench monitor is the real car, not a marketing
  curve. The driver is a pursuit controller aiming at a weaving line, specifically so a
  faster car doesn't wander off-axis and turn the comparison into a lie. That's a careful
  piece of thinking.
- **Wall runs with door gaps** (`hwall`/`vwall`, `map.js:63`) instead of hand-placing two
  segments per doorway. This is why 13 rooms connect into a drivable circuit without seams.
- **Validation at the trust boundary is mostly present and centralised**: `sanitizeStyle`,
  `sanitizeTune`, `COSMETIC_IDS` per-slot checks, name truncation to 16 chars, plate regex.
  The pattern is right; §4 is about the places it wasn't applied.
- **The comments explain *why*.** "ballast counts here too: a loaded setup sheet shoves
  harder", "dedup vs seen, not vs confirmed" — this codebase documents decisions, not syntax.
- **Tests target the parts that are hard to eyeball**: codec round-trip, the trade-off
  invariants, the speed-cap safety proof, and a real two-client ws session.

---

## 4. Findings

Ordered by how much they'd hurt. All were verified against the code, not inferred.

### 4.1 Malformed position reports poison server state and are never rejected

`room.js:117` — `player.p = msg.p.map(Number)`. There is no finiteness check. A client
sending `p: ["a","b","c"]` yields `[NaN, NaN, NaN]`, and the anti-teleport guard above it
doesn't catch it because `Math.hypot(NaN)/dt > 70` is `false`.

Verified consequences: every server-side distance test involving that player silently
returns false (no pickups, no bumps, no zone scoring, no LCS zap), and `encodeSnapshot`
writes `clampI16(NaN)` → **0**, so every other client renders them parked at the world
origin. An accidental or malicious client becomes an untouchable ghost.

The fix is one line, and the codebase already knows the pattern — the `MSG.PROP` handler
40 lines below does exactly this check (`im.some((n) => !Number.isFinite(n))`).

### 4.2 `NUDGE_MAX_SPEED` is imported but never applied

`constants.js:109` documents it as "server clamp on reported car velocity". `room.js:9`
imports it. Nothing uses it. Reported `player.v` is therefore unclamped, and it feeds:
rub-vs-hit classification (`onBump`), bot shove magnitude, the vending-machine `minSpeed`
gate, and the `rel > 18` feed messages. A client reporting `v: [1e6, 0, 0]` registers every
contact as a maximum-severity hit. The shove magnitude is separately capped at 20, so the
blast radius is limited — but the constant exists precisely to close this and doesn't fire.

### 4.3 Anti-teleport accepts sustained teleporting

`room.js:112`:

```js
if (speed > MAX_PLAUSIBLE_SPEED * 2 && now() > player.allowTeleportUntil) {
  player.rejects = (player.rejects || 0) + 1;
  if (player.rejects <= 8) return;
}
player.rejects = 0;
```

Two gaps. First, the threshold is **70 u/s — twice the hard cap** the client enforces on
itself, so anything up to 2× legitimate max speed is always accepted. Second, the strike
counter is a deliberate escape hatch ("a sustained stream of consistent reports means we
missed a legit teleport") but it has no consistency requirement: the 9th consecutive
*inconsistent* jump is accepted too, and resets the counter. At 20 Hz that's a free
teleport-anywhere roughly twice a second.

Since checkpoints, bean pickups, koth zone scoring and LCS survival are all resolved purely
from reported positions, this is the mechanism by which every position-driven mode is
winnable without driving. That's an accepted cost of the architecture — but the escape
hatch should require that the *destination* be consistent (e.g. the same point reported
across the strike window), not merely that reports keep arriving.

### 4.4 Race respawn is an arbitrary in-bounds teleport

`room.js:636` — in `desk_dash` the server accepts the client's own safe-pose proposal,
validating only that x/z are inside `MAP_BOUNDS`. A client can press R and place itself at
any point on the floor, including just short of the next checkpoint. The safe-pose ring
buffer on the client is careful and honest (`SAFE_POSE_MIN_GROUNDED_S`, oldest-pose-wins);
the server just has no way to tell an honest proposal from a fabricated one. Cheapest
mitigation: reject proposals farther than *n* units from the last position the server
accepted for that player.

### 4.5 A malformed URL crashes the game server

`server/src/index.js:26` — `decodeURIComponent((req.url || '/').split('?')[0])` is
unguarded. `decodeURIComponent('/%')` throws `URIError` (verified). Thrown inside the
`http.createServer` handler with no `uncaughtException` handler, this takes the whole
process down — and with it every in-progress match, because there's one `Room` per process.
A single `GET /%` from anywhere on the network ends the game. Wrap in try/catch, 400 on
failure.

Path traversal itself *is* handled correctly (`file.startsWith(DIST)` after `path.normalize`).

### 4.6 Race finishing score double-counts progress

`server/src/modes.js:164`:

```js
p.score = p.lap * 200 + (p.nextCp % CHECKPOINTS.length) * 8 + (p.finished ? p.score : 0);
```

On the finishing checkpoint, `p.score` already contains the accumulated progress score
*plus* the freshly-added place bonus, and then has `lap * 200` added on top again. A
2-lap winner scores ~1236 instead of the intended 900. Ordering between finishers is
preserved, so it isn't visible in normal play — but it's exactly the kind of silent
inflation that skews Office Cup totals (§1).

### 4.7 Held keys stick when the window loses focus

`useControls.js` registers `keydown`/`keyup` on `window` with no `blur` or
`visibilitychange` handler. Alt-tab while holding W and the car drives away on its own until
you return and tap the key. One `window.addEventListener('blur', reset)` fixes it.

Related, same file: `mousedown` **anywhere** fires `USE_POWERUP` (`click` handler, line 97).
Clicking the scoreboard, the pause overlay or any HUD chrome burns your item.

### 4.8 Race progress re-renders the HUD at snapshot rate

`net.js:176` — `if (msg.race) S.setState({ raceProgress: msg.race })`, unconditionally, on
every snapshot, with a fresh object each time. The three lines immediately below it go to
real trouble to *avoid* exactly this for `lcs` and `teamScores` ("re-render only when the
lockdown state actually changes"). `MatchHUD` subscribes to `raceProgress` and already
force-renders itself at 10 Hz, so in Desk Dash the whole HUD renders ~30×/s instead of 10.
The same change-detection used for `lcs` applies verbatim.

### 4.9 Smaller things

- **`MIN_PLAYERS` is dead** — declared, never enforced. `maybeStart()` starts with one ready
  human, which is the real (and fine) behaviour; the constant is misleading.
- **`NUDGE_RATE_MS` / `NUDGE_SNAP_DIST` are also dead.** `Props.jsx` hardcodes its own 200 ms
  flush and has no snap-distance logic at all, so the documented "peers hard-snap the prop
  beyond 2.0 units" self-healing is not implemented — props just diverge until they settle.
- **Suspension raycast allocates per wheel per step.** `new rapier.Ray(...)` ×4 at 60 Hz =
  240 allocations/s of steady GC pressure in the hottest loop (`LocalCar.jsx:393`). Rapier
  rays are mutable; hoist four to module scope.
- **`Props.jsx:66` mutates the imported `PROPS` array during render**
  (`Object.assign(base, { i })`). Idempotent today, but it's a render-time side effect on
  shared module state that both workspaces import.
- **Votes aren't cleared between matches.** `this.votes` is only reset in `resetToLobby`,
  so the previous round's tally re-decides the next mode unless someone re-votes.
- **`updatePads` hardcodes `1.6`** where `PICKUP_RADIUS` (also 1.6) exists and is imported
  in the sibling module.
- **README drift.** "3 laps through all eight rooms" — the code is 2 laps
  (`MODES.desk_dash.laps`) through 13 rooms. Everything else in the README checked out,
  including the 42×24 m bounds and the room count elsewhere in the same file.

---

## 5. Performance

**The bundle is the biggest cost.** 3.95 MB / 1.39 MB gzipped in one chunk, and Vite says so
on every build. The garage (Menu) and the game share it, so a player waits for Rapier's wasm,
all of three.js and the whole postprocessing stack before they can type their name. The
natural split is `Game.jsx` and everything under `game/` behind a `React.lazy` — the menu
already renders its own 3-D scene, but not the physics engine or the effect composer.

**The runtime side is in good shape**, and visibly deliberate:

- Walls, ceiling panels, LEDs and charger lights are `instancedMesh`.
- Remote cars use `<Detailed>` LOD, dropping to a 3-box proxy past 28 units.
- Exactly one shadow-casting light; everything after dark is additive quads plus bloom
  rather than real lights (`Practicals.jsx`).
- Shadow quality is *measured* — starts at 4096 and steps down only if the machine can't
  hold 40 fps, with `?shadows=` to pin it.
- The snapshot path writes to a mutable `net` object read by `useFrame`, and only touches
  zustand when a value React actually renders has changed — with §4.8 as the one lapse.
- `?lowfx` disables shadows and post-processing wholesale.

Remaining nits are the per-step ray allocation (§4.9) and the fact that only 3 of ~71
`useMemo`-created materials/textures are ever `dispose()`d. In a single-mount SPA that's
harmless; it would matter if the game scene were ever unmounted and remounted.

---

## 6. Test coverage

The three suites are well chosen and all pass. What they don't cover:

- **No client-side tests at all** — including `LocalCar`, which is the most complex and most
  physics-sensitive file in the project. `simulateDrive` already proves a deterministic 2-D
  copy of the driving model can be unit-tested headlessly; the same harness could assert
  handling invariants (top speed reached, drift charge tiers, brake distance) directly.
- **No adversarial input tests.** Every finding in §4.1–4.5 is a malformed or dishonest
  message, and the smoke test only ever sends well-formed ones. A "hostile client" suite
  — NaN positions, absurd velocities, malformed URLs, spam rates — would have caught four of
  the five.
- **No mode-completion tests.** The smoke test verifies each mode *starts* and snapshots
  correctly; nothing drives a mode to its win condition, which is where §4.6 lives.
- **No CI.** No workflow file; `npm test` is manual.

---

## 7. If I were picking the next three things

1. **Harden the trust boundary** — §4.1, §4.2, §4.5 are each roughly one line, and §4.5
   is a remote process kill. Add the hostile-client test suite alongside them.
2. **Code-split the client.** The first thing every new player experiences is a 1.4 MB
   download for a menu.
3. **Give the modes variants rather than adding an eleventh.** Sumo with a moving ring,
   soccer in the cafeteria, a reverse Desk Dash — the map and the mode controllers already
   support it, and it addresses the one-configuration-per-mode ceiling in §1.
