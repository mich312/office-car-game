# Investigation: PvP, collisions, car physics, respawning & game modes

An audit of how Tiny RC Mayhem currently implements its multiplayer systems,
side-by-side with how shipped games solve the same problems, and concrete
recommendations. Sources: Psyonix GDC 2018 ("It IS Rocket Science"), Ubisoft
GDC 2017 ("Replicating Chaos: Vehicle Replication in Watch Dogs 2"), Bungie
GDC 2011 ("I Shot You First: Networking Halo: Reach"), Mario Kart network
protocol reverse-engineering (tockdom wiki), RLBot community-measured Rocket
League values, and genre documentation linked inline.

---

## 1. Architecture today (baseline)

- **Authority split** (`server/src/room.js:1-4`): the Node server (20 Hz tick)
  is authoritative for match flow, scoring, powerups, office events, the
  soccer ball, bots and hit validation. **Each client owns its own car
  physics** (Rapier in the browser) and reports position/rotation/velocity at
  20 Hz (`MSG.STATE`). The server sanity-checks reports for teleports
  (`MAX_PLAUSIBLE_SPEED × 2`, 8-strike acceptance, `room.js:99-103`).
- **Remote cars** are `kinematicPosition` Rapier bodies driven by snapshot
  interpolation 120 ms in the past (`net.js sampleRemote`,
  `RemoteCars.jsx:36-37`).
- **Props** (mugs, chairs, marbles, papers) are client-side-only dynamic
  bodies with zero sync — every player sees a different office
  (`Props.jsx:1-3`).

This is a legitimate topology for a casual web game — it is essentially the
Mario Kart trust model (peer-authoritative own-kart, lenient contact) with a
central relay. The findings below take that as a given rather than proposing
a Rocket-League-style rewrite.

### Where this sits on the industry spectrum

| Approach | Game | Cost | Contact feel |
| --- | --- | --- | --- |
| No car-car collisions (ghosts) | Trackmania | ~zero | none, by design |
| Peer-trusted soft collisions | Mario Kart (P2P, ~30 Hz degrading with lobby size) | low | soft, sometimes desynced — tuned to not matter |
| Interpolated remotes + local physics blend on contact | Watch Dogs 2 | medium | instant, occasionally "hit by a car that wasn't quite there" |
| Full predictive rollback of the whole world | Rocket League (120 Hz sim, 60 Hz net, inputs-up, resim on correction) | very high | perfect-feeling, needs deterministic re-simulatable physics |

Tiny RC Mayhem is currently between rows 2 and 3: remote hulls are physical
(row 3's first half) but there is no blending or reconciliation, and bump
*gameplay* is peer-reported (row 2).

---

## 2. PvP car-vs-car collisions

### Current implementation

Two layers fire on every contact:

1. **Raw physics**: the local dynamic car collides with the remote kinematic
   hull. Kinematic bodies are infinite-mass to Rapier, so this bounce ignores
   car mass entirely, and the hull's pose is ~120 ms + transit delay stale.
2. **Gameplay bump**: `onCollisionEnter` sends `MSG.BUMP` (350 ms local rate
   limit, `LocalCar.jsx:626-635`). The server validates distance
   (≤ `BUMP_RADIUS × 2.5`), rate-limits the pair to one bump per 900 ms,
   calls `mode.onHit(a, b, relSpeed)`, shoves bots via server-side `kick`
   velocity, and broadcasts a `bump` effect. Each involved client then
   applies a mass-ratio-scaled impulse away from the other car
   (`LocalCar.jsx:206-222`).

### Issues found

- **Double response with a latency seam.** You bounce instantly off the
  infinite-mass hull, then a second, mass-scaled impulse lands a full RTT
  later. At any real ping the hit reads as "bounce… then shove". Heavy cars
  don't actually push light cars on contact — the mass fantasy only arrives
  in the delayed impulse.
- **`BUMP_REL_SPEED` (constants.js:76) is defined but never used.** A
  parking-lot nudge and a full-speed T-bone are the same event. Coffee Run
  spills the same beans either way; the 900 ms pair cooldown means gentle
  rubbing while cornering constantly consumes the "real hit" budget.
- **Both clients report the same collision.** The pair cooldown dedupes it,
  but whoever's report lands first wins, and the two clients each saw a
  different geometry (each collided with the *other's* 120 ms-old hull).
  Genuinely symmetric head-ons can resolve as one-sided.
- **Trust**: a client can send `BUMP` for any target within ~3.4 units
  without touching them. Fine for casual play; worth remembering before any
  mode makes bumps score-defining.

### What other games do

- **Rocket League** predicts *everything* (own car, remote cars, ball) to
  present time; remote cars are extrapolated with the opponent's last inputs
  decayed over 3 frames (100% → 2/3 → 1/3 → 0), so contact is resolved
  locally at full fidelity and the server corrects afterwards. Requires
  120 Hz deterministic re-simulation — not appropriate for this stack.
- **Watch Dogs 2** keeps remote vehicles on the interpolated snapshot stream
  until the moment of contact, then **blends them into local physics
  simulation** so the impact response is immediate and mass-correct, then
  blends back using *projective velocity blending* (project forward from
  both the authoritative and displayed state, lerp between the projections —
  Curtiss Murphy, *Game Engine Gems 2* ch. 18). This is the most reusable
  pattern for this codebase.
- **Mario Kart** makes contact soft and mostly cosmetic precisely because
  its netcode can't support decisive contact: bumps apply small impulses,
  hits are resolved on the victim's console, and desync is accepted. The
  design lesson: if the netcode is lenient, tune the *rules* so contact
  precision doesn't decide outcomes — which this game's modes (bean spill,
  battery drop) already broadly follow.
- **Binary events beat impulse precision under latency.** Rocket League's
  demolitions are a speed-threshold + angle check, not physics. A discrete
  server-adjudicated "hit" with a generous radius survives 20 Hz far better
  than trying to agree on impulse vectors.

### Recommendations

1. **Use the unused `BUMP_REL_SPEED`**: classify contacts server-side into
   *rub* (below threshold: no gameplay effect, no cooldown consumption,
   maybe a small sound) and *hit* (≥ threshold: onHit, knockback, feed
   message). The relative speed is already computed in `onBump`
   (`room.js:409`); it just needs a gate. This single change fixes the
   "cornering rubs eat real hits" problem and makes Coffee Run/Battery feel
   deliberate.
2. **Soften the raw kinematic bounce and make the layered impulse do the
   work**: drop the local car's collider restitution against remote hulls
   (collision groups or an `onCollisionEnter` velocity clamp), and apply the
   client's own mass-scaled impulse *immediately on contact* (it already
   knows both masses and positions) instead of waiting for the server echo —
   let the server broadcast be the authoritative confirmation for the *other*
   player and for gameplay effects only. That collapses "bounce… then shove"
   into one coherent response. This is a lightweight version of Watch Dogs
   2's simulation blending.
3. **Cap contact's effect on the victim**: never let a remote-car collision
   cut the local player's forward speed by more than ~40–50% in one event —
   the standard "forgiving online collisions" tune. Frustration at being
   ping-ganked is the top complaint pattern in peer-trusted racers.
4. Optional, cheap: scale bump impulses down slightly as measured RTT rises
   (the server already timestamps snapshots; the client can estimate its own
   delay), so high-ping players experience gentler, less contradictory hits.

---

## 3. Car physics

### Current implementation (`LocalCar.jsx`, `shared/constants.js`)

The car is a hand-rolled arcade raycast vehicle, and it matches the
known-good genre recipe almost point for point:

- Single cuboid rigid body, 4 suspension raycasts along car-down
  (stiffness 320, damping 24, force clamped, applied at wheel points;
  grounded = ≥ 2 wheels).
- Lateral friction hack: impulse `−latVel · grip · mass`, with drift
  multiplier, counter-steer detection (+25% grip catching slides), oil
  puddle grip scaling.
- Steering by angular-velocity targeting with high-speed fade, minimum
  pivot rate on throttle, 1.45× yaw while drifting.
- Mario-Kart-tiered drift mini-turbo (charge faster while steering — MK8
  does exactly this with a +5/+2 per-frame counter over a 45° stick
  threshold), boost meter, slipstream, slope assist (cancels 80% of
  along-slope gravity on throttle), airborne upright-torque assist,
  "parking brake" pinning below walking pace.
- Fixed 60 Hz timestep via `useBeforePhysicsStep`, CCD on, per-car real mass
  so heavy cars shove light ones.

This is genuinely well-built. Compared against the reference recipe
(SergeyMakeev/ArcadeCarPhysics, Bullet/Rapier `DynamicRayCastVehicleController`,
Rocket League's documented model), the deltas are small:

### Gaps vs. the genre recipe

- **No artificial downforce.** The standard glue is `F = −k · speed · up` at
  high speed. The suspension + grip currently carry all of it; a modest
  speed-proportional downforce would make ramp landings and high-speed
  keyboard-bridge runs stick better.
- **No center-of-mass offset.** Rapier supports COM below the collider;
  it's the single biggest anti-rollover lever and would reduce reliance on
  the upside-down auto-respawn.
- **Everything else is capped except bump impulses.** Rocket League
  hard-caps linear speed (1410/2300 uu/s) and angular velocity (5.5 rad/s);
  caps are what keep prediction/correction errors bounded. Top speed is
  capped here, but stacked impulses (bump + rocket + spring + wind) aren't —
  a post-step clamp on total speed and angular velocity would remove the
  rare "launched into orbit" outlier.
- **Suspension damping ratio**: 24 against stiffness 320 gives
  k ≈ 24 / (2·√320) ≈ 0.67 — on the firm side of the recommended 0.1–0.3
  arcade-bouncy range. Deliberate taste, but worth knowing which dial it is.
- **Bots don't run this physics at all** (`bots.js`: 2D point integration
  with wall push-out at fixed y). Cheap and effective; the visible seams are
  bots never being airborne and never using ramps. Acceptable trade.

### Recommendation

Keep the model — it's the right architecture. Add (in order of payoff):
post-step speed/angvel clamp, speed-proportional downforce, lowered COM.
All three are a few lines each and are pure-local changes with no netcode
impact.

---

## 4. Respawning

### Current implementation

- Triggers (`LocalCar.jsx:527-534`): `R` key, `y < −12`, or upside-down
  > 1.2 s while slow.
- The **client teleports itself** (race mode: last checkpoint, facing the
  next one; other modes: its fixed spawn-grid slot) and sends `MSG.RESPAWN`;
  the server rate-limits to one per 1.5 s, sanctions the teleport, and fires
  `mode.onFall` (spill all beans / drop battery). Boost is topped up to ≥ 40.

### Gaps vs. industry practice

- **No invulnerability window.** Genre convention is 2–3 s of spawn
  protection that breaks early if the spawner attacks. Without it, a player
  respawning at a fixed, publicly-known spawn slot can be EMP'd/rocketed on
  arrival indefinitely.
- **No spawn-point selection.** Non-race modes always use your join-index
  slot. Rocket League moved in 2026 to *forcing a different spawn point when
  yours is camped*; Halo Reach scores every candidate by teammate proximity,
  enemy proximity, enemy line-of-sight, and imminent danger, then picks the
  best with slight randomization. With 8 spawn slots and ≤ 12 players, a
  Halo-style score is ~20 lines: `score = distToNearestEnemy (capped) −
  recentlyUsedPenalty − occupiedPenalty`.
- **No respawn penalty in combat-flavored modes.** Falls already cost beans/
  battery, which is good coin-runners-style design ("being hit costs stuff,
  not time"). But `R` is also a free instant teleport-to-spawn — usable as a
  legitimate escape/rotation tool (e.g. warping home while the battery
  carrier chases you). Mario Kart charges a few seconds of Lakitu delay;
  Rocket League charges 3 s. Even a 1-second frozen "rebooting…" state would
  remove the exploit without feeling punitive.
- **Race respawn can be stale.** It uses the last *checkpoint* (radius-6
  proximity nodes), not the last valid on-track pose. The genre-standard
  upgrade is a ring buffer of the car's recent "grounded on valid surface
  for ≥ N frames" poses, respawning at the oldest safe one — that's what
  Lakitu effectively does, and it prevents both long walk-backs and
  respawning onto the desk edge you just slid off.
- Kill-plane and stuck detection are already in line with genre practice
  (Trackmania-style manual reset included). Good.

### Recommendations

1. Add spawn protection: server sets `shieldUntil`-like `spawnProtectUntil`
   (~2 s) on respawn; ignore bumps/rockets/EMP against protected players;
   cancel on their first powerup use or bump initiation. Render translucent.
2. Score spawn slots server-side (the server already knows every position):
   pick the free slot maximizing capped distance to the nearest opponent,
   with a last-used penalty. Since the *client* currently picks its spawn,
   either move the choice server-side (server replies to `MSG.RESPAWN` with
   the slot) or have the client request and the server confirm.
3. Add a short (~1 s) input-frozen respawn state to price the free-teleport
   escape out of the meta.
4. Replace checkpoint-respawn with a safe-pose ring buffer (client-side is
   fine given the trust model; ~2 s of poses at 10 Hz, take the oldest).

---

## 5. Game modes

### Current roster (`server/src/modes.js`, `shared/src/modes.js`)

| Mode | Type | Industry analogue |
| --- | --- | --- |
| Desk Dash | 3-lap checkpoint race, progress scoring, early-end 12 s after top-3 | Mario Kart GP |
| Coffee Run | collect ≤ 5 / deliver; bumps spill ~half (min 3), falls spill all | MK Coin Runners — the drop-on-hit loop is exactly the self-balancing "leader carries visible loot" design |
| Capture the Battery | hold single object to score 2/s; carrier slowed 0.72×; hit → drop | MK Shine Thief / Halo Oddball (it's hold-to-score, not CTF, despite the name) |
| RC Soccer | server-integrated ball, 2 teams, kickoffs, goal freeze | Rocket League Soccar |

Plus the meta-layer: lobby vote, rank-weighted Mario-Kart item odds
(FRONT/BACK pools, single rocket in flight), office events every 60 s with a
3 s telegraph, fixed 3.5-minute matches, podium, XP, bots filling to 6.

This is a strong foundation — all four modes are score-based rather than
elimination-based (nobody sits out), each has a visible shared focal object,
and being hit costs *stuff* rather than time. Those are precisely the three
properties Mario Kart's battle-mode evolution and Rocket League's LTM
program converged on for short rounds and mixed skill.

### Observations

- **The mode layer is already a mutator system in embryo** — modes are small
  controllers over shared hooks (`onHit`, `onFall`, `onJoin`, `rocketTarget`,
  `snapshot`). Rocket League's lesson (Boomer Ball, Heatseeker, Snow Day are
  mutator stacks over Soccar) is that once score sources, timers, zones and
  team assignment are generic, new modes cost almost nothing. The hooks
  exist; what's missing is a generic *zone* primitive and a generic
  *lives/HP* primitive.
- **Fixed 210 s timer for every mode** flattens pacing. Race already
  early-ends; Soccer could use score caps (first to N) and the others could
  take per-mode lengths (`MODES[id].seconds`).
- **Soccer ball physics diverges from the client world**: the server
  integrates a custom 2-substep AABB sim (`modes.js:219-258`) while clients
  render the interpolated ball but their Rapier world doesn't contain it as
  a collider — cars affect the ball only via server proximity checks against
  20 Hz reported positions, so touches can feel mushy/late. A client-side
  kinematic ball collider (like remote cars) would at least make the ball
  physically block/deflect the local car consistently.
- **Roster gaps** by genre coverage: nothing uses elimination-with-rescue,
  tag, zones, or the collision system as the *core* mechanic.

### Recommended additions (ranked by fit-to-existing-systems)

1. **Meeting Room Sumo / Knockout** — shrinking-bounds arena (last on the
   conference table wins the round, best-of-N ~90 s rounds; fallen players
   spectate seconds, not minutes). Rocket League's Knockout Bash and GTA
   Online's Sumo prove this needs *zero* new content — only collisions and a
   bounds check — and it would give the bump system a mode where it's the
   star. Gate it on the Section 2 collision improvements; use the Knockout
   pattern of a 10 s "get back in" timer instead of instant death for the
   office floor.
2. **Moving-zone King of the Hill** — "the standup is moving!": a large
   drive-through zone that relocates between rooms every ~20 s; score/s
   inside. Pure position checks like Battery mode. Onrush's documented
   failure applies: the zone must not reward parking — keep it large and
   relocate it often, or make it drift at cruising speed.
3. **Tag, inverted ("You're It — score while It")** — Shine-Thief logic the
   Battery mode already implements, minus the object: bump transfers "It"
   (server-adjudicated with a generous radius — the pass event is binary, so
   it survives 20 Hz fine). Classic flee-tag is degenerate with equal top
   speeds; score-while-It inverts the chase correctly.
4. **Renegade-Roundup-style cops & robbers** — asymmetric teams, captured
   robbers wait under the desk "jail" until a teammate drives through to
   free them. The rescue loop is the proven fix for elimination modes at
   party skill levels. Needs teams (exists via Soccer) + one zone primitive.
5. **Balloon Battle HP mode** — 3-hit lives using `onHit` as the damage
   source, score for hits, respawn on knockout — once spawn protection
   (Section 4) exists.

Also worth stealing: **Heatseeker's auto-escalation** as a Soccer mutator
(ball accelerates every touch, homes gently toward a goal) — it's the
best-documented "low-skill players still contribute" mode in the genre and
reuses the existing server ball sim wholesale.

---

## 6. Shared physics props (the netcode elephant)

Every mug, chair and marble is a live physics body — but client-side only,
so in multiplayer every player scatters a *different* office. The marble
"landmines" and shoved chairs the README promises are effectively
single-player set dressing.

Industry practice tiers props:

- **Gameplay props** → server-simulated, snapshot-interpolated (what the
  soccer ball already does). Halo Reach's replication (GDC 2011) fills each
  packet in priority order under a hard byte budget — priority from
  distance/velocity/importance, accumulating over time so starved objects
  bubble up. That "priority accumulator" is ~50 lines and the right shape if
  props ever become shared here.
- **Cosmetic props** → client-local, divergence accepted (universal
  practice for debris). Optionally broadcast unreliable "nudge events"
  (prop id + impulse) so peers see roughly similar scatter without ever
  reconciling.

Recommendation: don't server-simulate 100+ props at 20 Hz over JSON. Do the
cheap middle option — broadcast nudge events for the ~dozen *most
gameplay-relevant* props (marbles, the basketball, chairs blocking
doorways), and consider promoting exactly one or two props per map to fully
server-authoritative "gameplay object" status using the existing ball
pipeline. Long-term, the snapshot should move to a binary/quantized encoding
(16-bit positions, smallest-three quaternions) before any prop replication —
JSON at 20 Hz is already the bandwidth ceiling.

---

## 7. Priority-ordered action list

> **Status:** all ten items below are implemented on this branch (see
> `scripts/smoke.mjs` for the end-to-end tests covering bumps, respawns,
> nudges, binary snapshots and the three new modes). Item 6 turned out to be
> partially done already — the ball was a kinematic collider client-side —
> so it became the soccer score cap.

| # | Change | Effort | Payoff |
| --- | --- | --- | --- |
| 1 | Gate bumps on `BUMP_REL_SPEED` (rub vs hit) | XS | fixes cooldown-eating rubs; hits feel earned |
| 2 | Apply own bump impulse on contact, not on server echo; soften raw kinematic bounce | S | kills the "bounce… then shove" latency seam |
| 3 | Spawn protection (~2 s, attack-canceled) + server-scored spawn slots | S | removes spawn-killing; standard since Halo/RL |
| 4 | Post-step speed/angvel clamps, downforce, lower COM | S | bounded chaos, fewer flips, stickier landings |
| 5 | Safe-pose ring-buffer respawn for races; ~1 s respawn freeze | S | no stale checkpoints; closes teleport-escape exploit |
| 6 | Client-side kinematic ball collider in Soccer | S | ball touches feel physical instead of mushy |
| 7 | Sumo + moving-zone KOTH + inverted tag modes | M | roster covers collision-core, zone, and chase archetypes |
| 8 | Prop nudge events for the top ~12 gameplay-relevant props | M | multiplayer finally shares the office chaos |
| 9 | Per-mode match lengths / score caps | XS | pacing |
| 10 | Binary snapshot encoding | M | prerequisite for any richer replication |

### Key sources

- Jared Cone (Psyonix), *It IS Rocket Science! The Physics and Networking of
  Rocket League*, GDC 2018 — gdcvault.com/play/1024972
- Matt Delbosc (Ubisoft), *Replicating Chaos: Vehicle Replication in Watch
  Dogs 2*, GDC 2017 — gdcvault.com/play/1024597
- David Aldridge (Bungie), *I Shot You First: Networking the Gameplay of
  Halo: Reach*, GDC 2011 — gdcvault.com/play/1014346
- Curtiss Murphy, *Believable Dead Reckoning for Networked Games*, Game
  Engine Gems 2 (projective velocity blending)
- RLBot community wiki (measured Rocket League physics values) —
  wiki.rlbot.org/v4/botmaking/useful-game-values
- Mario Kart Wii network protocol — wiki.tockdom.com/wiki/Network_Protocol
- Halo spawn-scoring documentation — halo1guide.com, forginghalo.com
- SergeyMakeev/ArcadeCarPhysics (arcade raycast-car recipe);
  Rapier `DynamicRayCastVehicleController` docs
- Glenn Fiedler, networked physics series — gafferongames.com
