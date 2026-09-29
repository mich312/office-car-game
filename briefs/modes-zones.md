You are one of several parallel builders on Tiny RC Mayhem (repo mich312/office-car-game), a multiplayer browser game: 18 cm RC cars racing and brawling through workplaces. The user asked to "fix the game types" (the game modes). An audit of every mode on both maps (office and cellar) produced ~70 findings with evidence; independent verifiers have confirmed every one checked so far (the rest are still being verified — the owner may message you with further verdicts; if a verdict says NOT CONFIRMED, drop that item). Your lane is a third of them.

## Start
- You are on a checkout of `claude/maps`. `npm ci`, `npm run build`, `npm test` to see the green baseline. CI runs `npm ci && npm run build && npm test`.
- Stack: React Three Fiber + @react-three/rapier client (client/src), authoritative Node/ws server (server/src), shared pure modules (shared/src). Scale: 1 world unit = 22.5 cm; `M` = 4.444 units per metre. Maps (shared/src/maps/*.js) are objects; the server Room holds `this.map`, modes read `this.room.map`, the client reads `useMap()/currentMap()` (client/src/game/activeMap.js). New maps (garage, tower, factory) are being built in parallel by other builders — your fixes must be map-agnostic (read everything from the map object, never office coordinates).
- Headless harness: `scripts/bot-sim.mjs` — `createSim({ seed, mode, bots, variant, map })`, `sim.run(seconds, onTick)`, `sim.room`, `sim.events`; call `process.exit()` at the end of scripts. Tests: scripts/test-modes.mjs (scoring against a stub room), scripts/test-bots.mjs (bots in real matches, every map), scripts/test-maps.mjs (map geometry), scripts/smoke.mjs + test-hostile.mjs + test-rooms.mjs (real server over sockets), test-snapshot.mjs.

## How to work
- For each finding: reproduce it first (a scratch script or a new test), then fix the root cause, then turn the reproduction into a regression check in the appropriate scripts/test-*.mjs so it stays fixed. If it does not reproduce, skip it and say so in your report.
- Prefer one coherent design over a pile of patches where several findings share a root cause. Keep the game's feel; don't redesign modes beyond what the findings need, but where a finding is about balance (e.g. rounds that always time out), make a reasoned change and measure it with bot-sim before/after.
- Visual/HUD fixes: check them in the browser. `scripts/shoot.mjs` (read its header; `mkdir -p /tmp/pw && (cd /tmp/pw && npm i --no-save playwright@1.56)`; chromium is at /opt/pw-browsers/chromium, never run `playwright install`) takes screenshots from a running server (`npm run build && RC_MAP=cellar PORT=8123 node server/src/index.js &`). To see a mode in progress you can drive a match headlessly in the page: `window.__rcStore`, `window.__rcTeleport(x, z, yaw)`; start a match by voting and readying up in the lobby (the READY UP button) — `RC_MATCH_SECONDS=40` shortens matches.
- Other builders touch nearby code at the same time: two other mode builders (the other thirds of this list), and a furniture builder who changes ONE thing in server/src/modes.js (the soccer box list swaps w/d for rotated furniture). Keep your diffs to your lane, don't reformat or reorder code you don't need to change, so the owner can merge the three mode branches cleanly.
- Match the surrounding code: short comments that explain why, same naming and idioms, no TypeScript.
- Commit in logical steps (one root cause per commit where practical). Commit messages: a summary line, a blank line, a paragraph of why/what, and end with exactly:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Wv8a6nVQS2E4Ti4cLoM4Lx
  Do not put any model name/identifier anywhere else in the repo. Push to your outcome branch; never open a pull request.

## Your final message (the owner reads only this)
A table: finding → fixed / not reproduced / deferred (why), with the commit; the regression checks you added; anything you changed outside your lane and why. Under ~500 words.

## Your lane: Standup Standoff, Meeting Room Sumo, Last Car Standing, Open Office, events and mutators
Outcome branch: `claude/modes-zones`.

You own: KothMode, SumoMode, LastStandingMode (LCS), FreeRoam in server/src/modes.js; office events and mutators in server/src/room.js (updateEvents, mutator roll, tiny cars/shrink) — not the respawn policy (another builder owns every respawn path) and not bump attribution (another builder is adding server-side contact detection; consume it if you need contact); bot behaviour for your modes in server/src/bots.js (keep your edits to the functions/branches for your modes); ModeObjects.jsx visuals for zones, LCS locked-room overlays/labels, powerup pads, rockets and the robot, and the HUD bits for your modes. Also implement the 3D model audit's §8 plans for PowerupPads, Robot (keep the theme Robot override hook) and Rockets (see briefs/model-audit.md §8). Note a zone that "scores through walls" needs a line-of-sight / same-room test, and many cellar findings are map-data issues (spots behind walls, r0 too small): you may edit KOTH_SPOTS, SUMO_ZONE and ROBOT_PATH in shared/src/maps/office.js and cellar.js (only those keys — other builders own the rest of those files), and new maps must get the same checks via scripts/test-maps.mjs.

## Your findings (23)

### koth-sumo #1 [major] (both) The last sumo round is always cut off by the match clock, so its survivors never get paid
- Files: server/src/modes.js:554, server/src/modes.js:591-598, shared/src/modes.js:63-68, server/src/room.js:439
- Evidence: sumo-sim.mjs was run with 6 seeds on each map and variant, 24 matches in total. Every match ended with 'R5 CUT OFF by match end (1s left, N alive unpaid)'. The timing: 4 x (45 s round + 4 s rest) = 196 s, so round 5 starts at 196 s and would end at 241 s, but a sumo match lasts 240 s (MODES.sumo.seconds). Room.endMatch has no mode hook, so endRound() never runs for that round. Cars knocked out in round 5 keep their placement points (0/15/30...), while the survivors get nothing instead of placeScore*nOut + winBonus (at least 40). In the final round, getting knocked out can therefore score more than surviving.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/sumo-sim.mjs
- Proposed fix: In SumoMode.startRound, clamp the round to the match: len = Math.min(cfg.roundSeconds*1000, room.endsAt - t - 100). Store this.roundLen and use it in update() for frac, so the ring still reaches r1. Skip starting a round with less than ~15 s left. Also add SumoMode.onMatchEnd(), which calls this.endRound(this.alive()) when a round is in progress, and call this.mode?.onMatchEnd?.() in Room.endMatch before the standings are computed.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #2 [major] (both) Ring-outs almost never happen: rounds always time out and every car shares the win
- Files: shared/src/modes.js:63-64, shared/src/maps/office.js:418, shared/src/maps/cellar.js:270, server/src/modes.js:600-612, server/src/bots.js:251-258
- Evidence: Classic sumo, 48 rounds on both maps: 0 eliminations, every round ended by timeout with 6 of 6 alive, and every podium was 160/160/160/160/160/160 (sumo-final.mjs). The numbers explain why. The grace is 6 s and resets the moment a car touches the ring again (sumoOutAt = 0, modes.js:606). The last moment a car can leave and still be knocked out before the 45 s timeout is t = 39 s, when r = 4.23 m on the office and 4.1 m on the cellar (about 18 car lengths). The final ring r1 = 1.5 m is 6.7 car lengths in radius (7 m² against 0.03 m² per car). A car shoved out has 6 s x at least 3.1 m/s, about 19 m of driving, to get back in. The cellar has no drop, so ring-out is its only elimination route. Bots never shove: they orbit their own slot around the centre, and bots never bump each other (bumps come only from human clients). The mode's own promise, 'Last car rolling wins the round', never happens.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/sumo-final.mjs (podium 160x6, 24 'wins round' lines per match); sumo-sim.mjs (0 eliminations in classic)
- Proposed fix: Retune the ring: reach r1 at about 75-80% of the round and then hold it (frac = min(1, elapsed/(0.8*roundLen))). Shrink r1 to about u(0.6). Cut outSeconds to about 2.5 and stop the full reset on a one-tick re-entry: refill the grace slowly while inside instead of setting it back to 0. On timeout, give the win bonus only to the car(s) closest to the centre. Give bots a shove behaviour in sumo: target the nearest living rival and drive through it toward the ring edge. Add server-side bot-vs-bot contact by running Room.onBump for bot pairs within BUMP_RADIUS, using the bots' v.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #3 [major] (both (worst on cellar)) Bots can't reach several objectives: the cellar's Boiler Room, Archive and Server Hall zones, and Moving Meeting rings behind walls
- Files: server/src/bots.js:278-293, server/src/bots.js:239-258, shared/src/maps/cellar.js:261-267, shared/src/maps/cellar.js:BOT_PATH
- Evidence: koth-stuck2.mjs parks the zone on each spot for 25 s, then moves it and checks who arrives within 20 s. Cellar: Boiler 4%, Archive 28%, Server Hall 52%. Every other spot on both maps: 93-100%. koth-sim.mjs, cellar Rush Hour: 0% of bots ever reached the Boiler zone (3% in classic). koth-stuck.mjs with the zone pinned to the Archive: 4 of 6 bots sat for 18 s at x 12.2-13.1, z 0.6-2.8 in the corridor above the door, scoring 0. botpath-rooms.mjs: the cellar BOT_PATH never enters the Boiler Room or the Archive. Moving Meeting (sumo-drift-outs.mjs): a cellar round targeting the Boiler knocks out bots stuck in the corridor at about (-9.7,-0.7), 2.3 knockouts per round. On the office, rounds targeting cafeteria, reception or meeting stranded bots in the lounge or on the balcony up to 21 m from the ring; in one cafeteria round 5 of 6 bots were knocked out. The cause: when the goal is blocked, pickTarget heads for wpB = the racing-line waypoint nearest the goal in a straight line, even with a wall between them, and then oscillates there.
- Repro: node .../audit/koth-sumo/koth-stuck2.mjs ; node .../audit/koth-sumo/koth-stuck.mjs ; node .../audit/koth-sumo/sumo-drift-outs.mjs ; node .../audit/koth-sumo/botpath-rooms.mjs (all under /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/)
- Proposed fix: Give each map a door-node nav graph, e.g. map.NAV_NODES. On the cellar: boiler door (-13.5,2.2)/(-13.5,3.8), archive door (13.5,-0.2)/(13.5,-1.8), crossroads door into the server hall (1.5,3.6), side doors (-8,7)/(6,7). Route with BFS/A* over a visibility graph of BOT_PATH plus the door nodes (edges where lineBlocked is false). At minimum, choose wpB as the nearest node with a clear line to the goal. Add a test-bots check that every KOTH_SPOT on every map is reached by 90% of bots or more within 15 s.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #4 [major] (cellar) Standup zones on the cellar score through walls: cars in Corridor B-1 score for the Archive and Server Hall zones
- Files: server/src/modes.js:466-470, shared/src/maps/cellar.js:262, shared/src/maps/cellar.js:267
- Evidence: koth-wall.mjs: a car parked in the corridor at (12.1,-0.8) m is 1.60 m from the Archive spot, inside the 2.0 m radius, with the corridor's south wall between them. It scored 15.0 in 5 s. A car at (-3.5,2.8) behind the server-hall glass also scored 15.0 in 5 s. zone-geom.mjs: 6% of the Archive zone floor and 4% of the Server Hall zone floor lie in the corridor behind a wall. The office has 0% on all 11 spots. The ring is drawn on that corridor floor too, so players can camp there. The strip is small, about 2.5 m x 0.4 m, but the scoring is wrong.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/koth-wall.mjs ; zone-geom.mjs
- Proposed fix: In KothMode.update, add a line-of-sight check that skips a car when the segment from the zone centre to the car crosses a non-low wall. Precompute the wall AABBs per map, as SoccerMode does. Or move the two spots at least 2.1 m from the corridor walls (archive z <= -3.1, server hall z >= 5.1) and re-check the shelves and racks. Add a test-maps check that no KOTH disc has floor behind a wall.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #5 [minor] (office) Rush Hour on the office: the 10 s hop often lands where nobody can reach it in time
- Files: server/src/modes.js:456-461, shared/src/variants.js:67
- Evidence: koth-sim.mjs: on the office, bots were in the zone 26.6% of the time in Rush Hour against 54.5% in classic. Share of bots that reached the zone before it hopped: Balcony 19%, Games Corner 31%, most other spots about 60%. koth-stuck2.mjs: the mean bot arrival from another spot is about 9 s (7.5-10 s) against a 10 s hop. The next spot is uniform over every other spot on the floor, including the far side of the 42 m office.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/koth-sim.mjs
- Proposed fix: In Rush Hour, pick the next spot from the nearer half of the spots (straight-line or door-graph distance), or announce the next spot about 5 s before the hop (put a next spot in the zone snapshot and show it as a ghost ring and minimap marker).
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #6 [minor] (both) The Standup HUD never shows the hop timer or where the zone went, although the server sends it
- Files: client/src/ui/HUD.jsx:335-337, server/src/modes.js:462, server/src/modes.js:488, client/src/net.js:204
- Evidence: The snapshot carries zone.until (the smoke test checks it), but nothing in client/src reads net.zone.until: a grep for zone usage finds only ModeObjects' ring and the minimap. The chip is static text, 'hold the standup zone to score'. It has no countdown and no in-zone or +3/s feedback. The hop feed line is always '📍 The standup moved!' with no room name. The mode description says 'don't be late', but players get no warning before a hop.
- Repro: grep -rn "zone" /home/user/office-car-game/client/src (no reader of .until); read HUD.jsx:335
- Proposed fix: Chip: 'standup · moves in Ns' from (net.zone.until - net.clockOffset - performance.now()), plus 'IN ZONE +3/s' when telemetry is inside net.zone.r. Feed: `📍 The standup moved to the ${map.roomAt(z.x,z.z)?.name}!`.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #7 [minor] (both) During the break between rounds, a car that shared the win shows 'GET BACK IN! 0.0s'
- Files: server/src/modes.js:580-587, server/src/modes.js:626-633, client/src/ui/HUD.jsx:343-350
- Evidence: sumo-rest.mjs: a car still outside the ring (in its grace period) when round 1 times out gets +40, a shared win. The rest-period snapshot still lists it in sumo.out: {"round":1,"out":[["bot1",16]]} and 2 s later [["bot1",0]]. The HUD shows the warning chip counting down to 0.0 s through the 4 s rest, and the chip still says 'round 1 — stay inside the ring'. The ring stays at r1 until the next round snaps it back to r0.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/sumo-rest.mjs
- Proposed fix: In endRound, set p.sumoOutAt = 0 for all players, and have snapshot() send out: [] while restUntil is set. Send restUntil (or a resting flag) so the HUD can show 'Round N over — next round in Xs'. Optionally a survivor must be inside the ring at timeout to share the win.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #8 [minor] (both) The Moving Meeting ring sometimes doesn't move or repeats the last room, although the text says 'a different room' each round
- Files: shared/src/variants.js:16, shared/src/variants.js:59-63, shared/src/maps/office.js:406, shared/src/maps/cellar.js:259
- Evidence: sumoTarget picks uniformly from all KOTH_SPOTS, with replacement, and ignores round. Both maps have a spot equal to the SUMO_ZONE centre: office (-1,1.5), cellar crossroads (1.5,1). sumo-sim.mjs, office drift: 6 of 24 rounds targeted open_office, so the ring never moved in those rounds. Cellar drift: 1 of 24 targeted the crossroads. sumo-drift-outs.mjs, office seed 7: rounds 1 and 2 both targeted the cafeteria. Variant text: 'Each round the ring closes in on a different room.'
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/sumo-sim.mjs (per-target table)
- Proposed fix: Filter candidates to spots more than about 4 m from SUMO_ZONE and not equal to the previous round's target (pass prev into sumoTarget). Or pre-shuffle one target per round at mode start.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #9 [minor] (both) A round everyone survives posts one '🏆 X wins round N!' feed line per car (6 per round, 24 per match)
- Files: server/src/modes.js:580-587
- Evidence: sumo-final.mjs: 24 'wins round' feed lines per classic match with 6 bots. endRound loops over the survivors and feeds each one, so the kill feed turns into a wall of 'wins' messages.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/sumo-final.mjs
- Proposed fix: Post one line: a single survivor gets '🏆 X wins round N!'; several get '🤝 Round N: X, Y and Z share it' (or 'N cars survive round N').
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #10 [minor] (both) The starting ring (r0) doesn't cover the whole floor on either map, contrary to the comments
- Files: shared/src/maps/office.js:416-418, shared/src/maps/cellar.js:270, server/src/modes.js:540
- Evidence: zone-geom.mjs. Office: centre (-1,1.5), r0 22 m, corners at 24.1/22.6/25.8/24.4 m, so 3.5% of the floor starts outside the ring (Games Corner 2.0%, CEO 0.9%, Reception 0.6%). Cellar: centre (1.5,1), r0 21 m, corners at 22.9/21.9 m, so 0.7% is outside (Loading Dock, Boiler). Knocked-out cars drive the racing line and are revived where they are when the next round starts, so one sitting in those corners starts the round already outside with the out-timer running. office.js says 'the ring starts covering the whole office'.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/zone-geom.mjs
- Proposed fix: Compute r0 in map build() as the maximum corner distance from SUMO_ZONE plus about 0.5 m (office about u(26.3), cellar about u(23.4)), or set those values, and fix the comments.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #11 [minor] (both) Knocked-out sumo cars still pick up items and can use them, including Swap on living cars
- Files: server/src/room.js:547, server/src/room.js:587, server/src/room.js:661-665
- Evidence: sumo-deaditems.mjs: a knocked-out car (sumoDead) picked up 'oil' from a pad. Its Swap teleported living bot3 to (18,-10), 22.2 m from the centre of a 12.4 m ring. Bots were frozen in this test, and the victim was knocked out when the grace ran out. updatePads and usePowerup only check p.eliminated, which is Last Car Standing's flag. The mode describes knocked-out cars as 'mobile chicanes', not item users.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/sumo-deaditems.mjs
- Proposed fix: Add an isOut(p) = p.eliminated || p.sumoDead helper, use it in updatePads, usePowerup, the others/swap pools and the vending machine, and clear p.powerup when a car is knocked out.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #12 [minor] (both) No contested zone: every car inside the Standup scores the full 3/s, so nobody needs to fight for it
- Files: server/src/modes.js:466-470, client/src/ui/HUD.jsx:335-337
- Evidence: KothMode.update adds scorePerSecond to every car within KOTH_RADIUS, no matter how many rivals share the zone, and the HUD has no contested state. In sims, bots park together and classic final scores cluster (office seed 6: 351/351/350/343/311/264). This is a design gap more than a crash bug, but the mode is 'hold it' in name only.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/koth-sumo/koth-sim.mjs (final scores)
- Proposed fix: Score only when the zone is uncontested, or split scorePerSecond across the occupants (3/n per s). Send a contested flag in the zone snapshot and show 'CONTESTED' on the chip and ring.
- Independent verification: pending (reproduce it yourself first).

### koth-sumo #13 [minor] (office) On the office's meeting-table spot, the Standup ring is hidden under the table and the label is half inside the tabletop
- Files: client/src/game/ModeObjects.jsx:65, client/src/game/ModeObjects.jsx:69, shared/src/maps/office.js:208, shared/src/maps/office.js:410
- Evidence: From the numbers only; I did not check this in a browser. The ring is drawn at y = 0.05 u on the floor. The 3.6 x 1.4 m table (h 0.74 m = 3.29 u) covers about 5 of the zone's 12.6 m², and cars on it do score. The label sprite (0.9 u tall, depthTest on) bobs at y 3.0-3.4 u, so its lower half sits inside the tabletop.
- Repro: Read ModeObjects.jsx:62-70 and office.js:208/410; compare label y 3.2±0.2 u with the table top 3.29 u
- Proposed fix: Raise the label to max(3.2, spot top + 1.5 u), with an optional per-spot y in KOTH_SPOTS. Draw the zone ring at the top of any furniture it crosses, or render it as a projected decal with depthTest off.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #3 [major] (both (worst on cellar)) LCS bots kill themselves in bulk: the stuck-recovery hop teleports them into locked rooms, and the cruise and flee targets are unreachable. On the cellar, locking the corridor wipes out most bots at once
- Files: server/src/bots.js:210, server/src/bots.js:224, server/src/bots.js:450
- Evidence: The cruise logic skips BOT_PATH waypoints that lie in closed rooms and then drives straight at the next open one, which is often behind a wall. For example, a bot in the Helpdesk targets cp(1.5,-1) in the Lab. It jams in the corner at (6.2,3.2) m, and after 2.5 s the stuck-recovery hop (bots.js:450) teleports it to the nearest waypoint, cp(8,2.1), which is in the locked corridor. It is zapped 2.5 s later (trace: lcs3.mjs 5 cellar). lcs6.mjs over 30 matches per map: office has 432 stuck-hops into locked rooms, and 44 of 145 eliminations come within 3 s of one. Cellar has 148 hops, and 54 of 116 eliminations. corridor.mjs: after the cellar corridor locks, 57 of the 88 bots that could still die are zapped within 15 s, and in 10 of 19 matches 4-5 bots die inside a few seconds. With one human, the match is often decided by bot suicides (cellar seed 3 ends at 37.6 s, seed 16 at 43 s). Bots also detour to pads inside locked rooms: 19 office and 5 cellar pickups (pads.mjs).
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node lcs2.mjs cellar 1-20 && node lcs6.mjs && node corridor.mjs && node lcs3.mjs 5 cellar 60 76
- Proposed fix: Give maps a room-door graph (door midpoints per wall gap; it can be derived from WALLS gaps or authored as map.DOORS). In LCS, bots BFS from their room to the nearest open room through doors and drive door to door, with no Euclidean room-centre target. The stuck-recovery hop should choose the nearest waypoint whose room is not locked or warned. padTarget should skip pads in bad rooms during LCS. Separately, consider marking the cellar corridor as a hub (`lockable:false`, or lock it only as the second-to-last closure) so the map is not cut in half at 15 s.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #4 [major] (both (cellar much worse)) The endgame stalls: nothing can eliminate a car inside the refuge, and on the cellar the last closure comes at 111 s of 210 s, so many matches end with several survivors and no crown
- Files: shared/src/modes.js:70, shared/src/modes.js:97, server/src/modes.js:79, server/src/room.js:406
- Evidence: last_standing has no `seconds`, so it runs MATCH_SECONDS=210 with a fixed 16 s LOCK_INTERVAL. The office (13 rooms) makes its last closure at 191 s. The cellar (8 rooms) makes it at 111 s, which leaves about 99 s where only a fall can eliminate. The cellar has nothing to fall from, bumps do nothing in LCS (onHit is empty), and the robot only stuns. lcs1.mjs/lcs5.mjs over 30 seeds each: cellar ended with more than one car alive at the 210 s timer in 10/30 matches, and all 6 were still alive in seeds 17, 18, 22 and 30 (no WINNER_SCORE, all tied at 315). Office: 3/30.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node lcs1.mjs cellar 20 && node lcs5.mjs
- Proposed fix: Scale the pacing to the map: LOCK_INTERVAL = (matchSeconds - FIRST_LOCK_S - finaleS) / (rooms - 2), or set a per-map LCS_LOCK_INTERVAL. Add an elimination mechanic for the finale once only the refuge is open, for example a sumo-style shrinking zap circle inside the refuge (reuse SumoMode zone plus the zap grace), or the robot patrolling the refuge and zapping on contact. Alternatively, end the match 20-30 s after the last closure.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #5 [major] (both) When the timer runs out with several survivors, they get no placement or winner score, so cars that were eliminated can outrank the survivors
- Files: server/src/modes.js:108, server/src/modes.js:117
- Evidence: Eliminated cars earn PLACEMENT_SCORE*outCount on top of 1.5/s survival. Survivors at the timer only get 1.5*210 = 315, because checkLastStanding never runs and endMatch just sorts by score. lcs5.mjs office seed 13 podium: 1. Mr. Mondays=441 (out at 187 s), 2. Deskzilla=379 (out at 173 s), 3. Stapler=315 (alive), 4. The Intern=315 (alive). Office seed 9: a car eliminated at 156 s scores 314 against the survivors' 315.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node lcs5.mjs
- Proposed fix: Add an onTimeUp/finalize hook that endMatch calls before building standings. For LCS, give every survivor PLACEMENT_SCORE*(outCount+1) and split WINNER_SCORE among them (or pay it in full to each). Alternatively, sort LCS standings by (alive, time of elimination) rather than raw score.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #6 [major] (both) Eliminated bots leave invisible solid cars where they died and still appear as live dots on the minimap
- Files: server/src/bots.js:124, client/src/game/RemoteCars.jsx:112, client/src/game/RemoteCars.jsx:121, client/src/ui/HUD.jsx:555
- Evidence: Bots.update skips eliminated bots, so their server position stays at the death spot at y=0.24. ghosts.mjs: 2578/2578 office and 2231/2231 cellar dead-bot samples are still on the floor. RemoteCars only sets group.visible=false for flag 128 in LCS. The kinematic RigidBody and CuboidCollider keep following the snapshot, so a human hits an invisible car. Most bots die in doorways and in the cellar corridor, which is the hub humans must cross. The minimap loop (HUD.jsx:555) draws every remote car without checking flag 128. Human ghosts are parked at (0,-40,0) and appear as a dot at map (0,0).
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node ghosts.mjs ; then read RemoteCars.jsx:108-124
- Proposed fix: On the server, move eliminated players to a parked position when they are eliminated (e.g. p = [0,-40,0] for bots too, as the human client does), or leave them out of the snapshot. On the client, when (f & 128) && modeId==='last_standing', call setNextKinematicTranslation to y=-50 (or disable the collider). The minimap and bots.separate() should also skip eliminated players.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #7 [major] (both) Under Tiny Cars, the Shrink item returns the leader to full size for the rest of the round, and mid-match joiners are never shrunk
- Files: server/src/room.js:408, server/src/room.js:635, server/src/room.js:137
- Evidence: Tiny Cars is implemented as shrinkUntil=endsAt. The Shrink item overwrites it with t+8 s. tiny.mjs: after the item hits Karen from HR, shrinkUntil-endsAt = -152 s. 10 s later the leader is not tiny while every other car is (snapshot flag 16 comes from shrinkUntil). A shrunk car also takes a 0.85 speed multiplier (bots.js:385, LocalCar.jsx:629), so the leader ends up about 15% faster than everyone for the rest of the round. A drop-in from HELLO has shrinkUntil=0, so it is full size.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node tiny.mjs
- Proposed fix: Take the maximum instead of overwriting: `leader.shrinkUntil = Math.max(leader.shrinkUntil, t + FX.SHRINK_S*1000)`. Under tiny_cars, make Shrink roll weight 0 or turn it into a stun. In the HELLO drop-in path (and in onJoin generally), set p.shrinkUntil = this.endsAt when mutator is tiny_cars.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #8 [major] (both) Open Office style points come from unvalidated, stale client flags: a client whose last report was mid-air or mid-drift keeps scoring after it goes silent
- Files: server/src/modes.js:36, server/src/room.js:209
- Evidence: FreeRoamMode adds driftPerS for p.drifting and airPerS for !p.grounded on every tick. Those flags are only written by STATE messages and are never aged or checked against speed or height. afk.mjs: a human sends one STATE with d:1,g:0 and then goes silent, as a backgrounded tab would. After 60 s: AFK=210 vs the best bot at 16. Over the 600 s mode that is about 2100 points. A client could also report d:1,g:0 while parked.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node afk.mjs
- Proposed fix: Only score humans whose lastStateAt is within ~300 ms. Require horizontal speed above a threshold (e.g. >6 u/s) for drift points and y > ~0.6 or a nonzero vertical velocity for air points. Cap air scoring per airborne spell, e.g. at 3 s.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #11 [minor] (both) The cleaning robot, and active event effects, carry over frozen into the podium
- Files: server/src/room.js:439, server/src/room.js:983, client/src/net.js:291
- Evidence: endMatch clears neither this.event nor this.robot, and broadcastSnapshot still sends them in PODIUM. podium.mjs: a cleaning_robot event is forced 5 s before the end. After the match: phase=podium, room.robot={x:2.31,z:0.89}, and the podium snapshot decodes robot {x:2.31,z:0.89}. On the client, the `event` store (lights out, AC wind, sprinklers grip) is only cleared by its duration setTimeout and not by MATCH_END.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node podium.mjs
- Proposed fix: In endMatch set this.event=null, this.pendingEvent=null, this.robot=null. In the client MATCH_END handler set event:null, eventWarn:null.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #12 [minor] (both) The CLOSED and CLOSING labels over rooms are drawn above the ceiling slab, so drivers never see them
- Files: client/src/game/ModeObjects.jsx:141, client/src/game/ModeObjects.jsx:152, client/src/game/Office.jsx:366, client/src/game/themes/cellar.jsx:224
- Evidence: The TextSprite is at y=WALL_HEIGHT+0.6. Both maps render an opaque, depth-writing, downward-facing ceiling plane at exactly WALL_HEIGHT (the office covers everything except the balcony; the cellar covers the whole floor). The chase cam and the spectator cam (car y+6 < 12.4) are below it, and SpriteMaterial depth-tests, so the labels are hidden. Found by reading the code; not checked in a browser.
- Repro: Read ModeObjects.jsx:131-155 together with Office.jsx:366-374 and themes/cellar.jsx:224
- Proposed fix: Place the labels under the ceiling (e.g. y = WALL_HEIGHT*0.6), or set depthTest:false/renderOrder on those sprites.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #13 [minor] (both) Facilities keeps announcing and locking rooms after the winner has been crowned
- Files: server/src/modes.js:79
- Evidence: lcs1.mjs cellar seed 1: '👑 Stapler is the LAST CAR STANDING!' at 103.5 s, then '🚧 Facilities is closing the Helpdesk — clear out!' at 106.0 s. Survival score also keeps accruing during the 4 s wind-down.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node lcs1.mjs cellar 3
- Proposed fix: Return early from LastStandingMode.update when this.over (after the zap loop, or before the warn/lock block).
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #15 [minor] (both) The mode description promises 'dodge the robot', but LCS has no robot of its own; it only appears when the random Cleaning Crew event rolls
- Files: shared/src/modes.js:74, server/src/room.js:888
- Evidence: The robot is created only when the event pick is cleaning_robot, 1 in 6 events. In LCS it only stuns (onHit is a no-op). In the matrix.mjs LCS runs it scored 0-2 hits per match. On the cellar its ROBOT_PATH is corridor-only, so it idles in the corridor even after that room is locked.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node matrix.mjs
- Proposed fix: Either drop 'dodge the robot' from the desc, or make the robot a real LCS hazard: always deployed after the Nth closure, patrolling open rooms and zapping on contact. That would also address the finale stalemate.
- Independent verification: pending (reproduce it yourself first).
