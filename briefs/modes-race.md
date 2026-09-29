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

## Your lane: Race, Office Cup and every respawn path
Outcome branch: `claude/modes-race`.

You own: RaceMode and the Office Cup flow (server/src/modes.js RaceMode; server/src/room.js startCountdown/endMatch/cup/podium code), the respawn policy for EVERY mode (room.js respawn/pickSpawn/safe poses, client LocalCar.jsx respawn/teleport handling), the race HUD bits (HUD.jsx lap/CP chip, minimap race marker, ModeObjects RaceCheckpoints), variant texts (shared/src/variants.js), and podium/ceremony (client). Design the respawn policy once, for all modes: where a car respawns per mode (race: its last checkpoint facing the next; soccer: its team's kickoff half; LCS: a safe room that isn't locked or closing; others: the scored pickSpawn), what a respawn costs (e.g. a carrier drops the battery/beans where it was; It stays It but the respawn is rate-limited or has no protection), and an anti-spam cooldown. Other two mode builders will NOT touch respawn — findings from their areas that are respawn exploits are listed here.

## Your findings (19)

### race-cup #1 [major] (both) The grand ceremony puts the winner of round 3, not the cup winner, under the "OFFICE CUP CHAMPION" title
- Files: client/src/ui/HUD.jsx:633, client/src/ui/HUD.jsx:635, client/src/ui/HUD.jsx:665, client/src/game/OfficeBoard.jsx:169, client/src/game/OfficeBoard.jsx:190, client/src/game/OfficeBoard.jsx:254, server/src/room.js:449
- Evidence: In Podium, `top3 = podium.slice(0,3)` and `mine = podium.find(...)`. `podium` is MATCH_END.podium, which holds only the standings for the round just played. When `cup.final` is set, the title changes to 'OFFICE CUP CHAMPION' but the plaques still show that round. The in-world whiteboard (OfficeBoard) also reads `podium[0]` under 'EMPLOYEE OF THE MATCH' and shows 'back to the lobby in a moment…' even between cup rounds. I ran 10 full cups (cup.mjs). In 5 of them the round-3 winner was not the cup winner: office s3 (plaque Spreadsheet 310, cup winner Mr. Mondays 1515), office s4 (plaque Stapler with 0 pts, cup winner Spreadsheet 465), cellar s1 (Spreadsheet vs Karen from HR), cellar s3 (Karen from HR vs Stapler), cellar s4 (The Intern vs Mr. Mondays). In those 5 cups the feed line '🏆 X wins the OFFICE CUP' names someone other than the person on the gold plaque. 'You placed Nth' is also the round place, and the cup standings list is cut to 5 rows (slice(0,5)), so in a 12-car room most players never see their own cup rank.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/cup.mjs  (compare the 'END round 3/3 final=true podium' first entry with the 'wins the OFFICE CUP' feed line)
- Proposed fix: In HUD Podium: when cup?.final, build the plaques and 'You placed' from cup.standings, not podium. Add car/paint to the cupStandings entries in room.js endMatch (~line 449) so the plaques can colour them. Always show the local player's cup row even when outside the top 5. In OfficeBoard.snapshot(): when st.cup?.final, use cup.standings[0] and the header 'OFFICE CUP CHAMPION'. When st.cup && !st.cup.final, say 'next round starts automatically…'.
- Independent verification: CONFIRMED (high). Code read:
- server/src/room.js endMatch (lines 440-482) sends MATCH_END with `podium: standings`, which is built only from this round's p.score. `cup.standings` holds the cumulative totals, and each entry has only {id, name, score, bot}, with no car or paint. The feed line '🏆 X wins the OFFICE CUP' uses cupStandings[0].
- client/src/net.js:294-298 stores msg.podium and msg.cup unchanged.
- HUD.jsx Podium (lines 618-688): `top3 = podium.slice(0,3)`, `mine = podium.find(p => p.id === myId)`. The title switches to 'OFFICE CUP CHAMPION' when cup.final is set, but the plaques, their pod-score values and 'You placed Nth' (mine.place) all still come from the round podium. The cup standings list is `slice(0,5)` and does not force-add the local player's row.
- OfficeBoard.jsx snapshot() (line 254) uses `st.podium?.[0]` for the winner and ignores cup. The podium branch (lines 168-190) always draws 'EMPLOYEE OF THE MATCH' and 'back to the lobby in a moment…', even between cup rounds, when the room actually rolls straight into the next round (room.js:509-511).

My reproduction (my own driver, not the auditor's): /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/cup-verify/cup.mjs. It builds a real Room with 6 bots on a virtual clock, gives every bot a vote for office_cup and calls startCountdown() with no forced mode, so the real cup setup runs. It then ticks through all 3 rounds and podiums until the room is back in the lobby, on both maps with 6 seeds each (RC_MATCH_SECONDS=60). Result: in 4 of 12 cups the gold plaque (final podium[0]) is not the cup champion (standings[0]):
- office s1: plaque Stapler 40 (every car tied at 40 in round 3), while the cup winner and feed say Spreadsheet 246.
- office s3: plaque Stapler 90, feed says Mr. Mondays 570.
- cellar s1: plaque Deskzilla 120, feed says Mr. Mondays 260.
- cellar s6: plaque Stapler 0, feed says The Intern 220.
All 12 final MATCH_END cup.standings entries lack a paint field. The seeds differ from the auditor's, but the mechanism is the same. The claim is confirmed as described.
- Verifier's better fix: The proposed fix is right but misses a few details:
(1) In room.js endMatch, add `car: p.car, paint: p.paint` to the cupStandings entries, plus a `place: i + 1` after sorting (or compute place on the client). Without place, 'You placed' breaks, because it reads mine.place.
(2) In the HUD Podium, when cup?.final, use cup.standings in two places: `rows = cup?.final ? cup.standings.map((s, i) => ({ ...s, place: i + 1 })) : podium`, then `top3 = rows.slice(0, 3)` and `mine = rows.find(...)`. pod-score will then show the cumulative cup points. Keep the round podium for the non-final 'ROUND x/3 DONE' screens.
(3) In the cup standings list, show the top 5, then add the local player's row with its true rank when they fall outside it.
(4) In OfficeBoard.snapshot(), when st.cup?.final, set winner and winnerScore from st.cup.standings[0] and the header to 'OFFICE CUP CHAMPION'. When st.cup && !st.cup.final, use a round header and the hint 'next round starts automatically…'. Also add cup round/final to the snapshot `hash` array, because draw() only repaints when the hash changes (OfficeBoard.jsx:457).

### race-cup #2 [major] (both) Office Cup rounds 2 and 3 leave bots where the previous round ended: no grid slot, stale heading and waypoint
- Files: server/src/room.js:345, server/src/room.js:389, server/src/room.js:393, server/src/room.js:509, server/src/bots.js:87, server/src/bots.js:89
- Evidence: startCountdown only repositions humans, and only on the client (LocalCar match_start teleport). Bots are placed only once, by makePlayer when fillTo creates them. Between cup rounds the bots persist and nothing resets p.p, heading, wp or speed. cupgrid.mjs, office seed 3: in the round-2 Desk Dash countdown the bots were 20.1–37.0 m from their grid slots (3 in the CEO suite, 3 in the lounge). They took their first checkpoint 10.4–23.8 s after GO, while humans on the grid take it at about 0–2 s (fresh-race baseline 0.0–2.0 s). Cellar seed 3 (round 2 Desk Dash reverse): bots were 11.1–28.6 m off-grid and reached the first checkpoint after 6.3–19.6 s (baseline 2.7–3.7 s). Which bot wins the cup race depends on where it happened to stand when the previous round ended. The grid also shows empty bot slots during the countdown. The same applies to every cup mode (for example, bots are not put on soccer kickoff spots).
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/cupgrid.mjs
- Proposed fix: In startCountdown's per-match reset loop (room.js ~393), give every bot its slot for the new round. Use s = modeId==='desk_dash' ? raceSpawn(p.spawnIndex, this.variant, this.map) : this.map.SPAWNS[p.spawnIndex % n] (soccer: the same kickoff spot rule LocalCar uses). Then set p.p=[s.x,0.24,s.z], p.heading=s.rotY, p.q=[0,sin(rotY/2),0,cos(rotY/2)], p.wp=0, p.speed=0, p.kick={x:0,z:0}, p.stuckT=0, p.boost=BOOST_MAX, p.drift=newDriftState().
- Independent verification: CONFIRMED (high). I read the code first. `startCountdown` (server/src/room.js:345-437) resets score, lap, cp, items, `spawnIndex` and `allowTeleportUntil` for every player, but it never writes a bot's `p`, `heading`, `wp`, `speed`, `kick`, `boost` or `drift`. The only place that positions a bot is `makePlayer`: `this.map.SPAWNS[players.size % n]` at room.js:295, reached from `Bots.add` via `fillTo`, with the heading, wp and speed defaults at bots.js:87-89. Humans are moved only by the client teleport in LocalCar.jsx:196-218. Between cup rounds, `tick()` (room.js:509-511) calls `startCountdown(nextMode)` without `resetToLobby`, so the bots from the previous round are kept. A grep of server/src finds nothing else that sets `p.p`, `heading` or `wp` at round start. `RaceMode` and `SoccerMode` do not reposition players either.

Then I reproduced it with my own harness, a copy of bot-sim with the step function exposed (scratchpad/audit/cup-grid-verify/v.mjs). In each case round 1 was forced and the cup flow was left to run by itself.
- **Office seed 11, cups soccer → desk_dash(reverse) → coffee_run and desk_dash ×3:** at the round-2 and round-3 countdowns, bots were 6.9–40.3 m from their `raceSpawn` slots, in the open_office, lounge, CEO, games and cafeteria rooms. They also kept stale values: `wp` 0–39, `speed` 3.5–17, and unwrapped headings such as -92.48 rad.
- **Cellar seed 5, koth → desk_dash(reverse) → battery:** bots were 12.3–25 m off-grid.
- **Time to the first checkpoint after GO:** 6.5–27.6 s (office cup round 2), 8.4–34.2 s (cellar cup round 2), and 3.3–45.7 s (office cup rounds 2 and 3). A fresh race takes 0–1.9 s (office classic), 1.8–3.0 s (office reverse), 1.7–2.7 s (cellar classic) and 2.5–3.7 s (cellar reverse). This confirms the claim, and cup results depend on where each bot stood when the last round ended.

Next I tested the fix by monkeypatching `startCountdown` in scratch only (fix.mjs), putting each bot on `raceSpawn(spawnIndex, variant, map)` with heading `rotY`, `wp` 0 and `speed` 0. Round-2 and round-3 Desk Dash first-checkpoint times dropped to 0–3.0 s (office) and 2.5–3.5 s (cellar reverse), the same as the fresh baseline.

Where the report is off:
1. **Soccer placement location:** the fix cannot go in the reset loop at room.js:393 as proposed. Teams are assigned in the `SoccerMode` constructor (modes.js:338), which runs later, at room.js:403 (`createMode`). At :393, `p.team` is stale or 0, so a bot could be put on the other team's kickoff spot.
2. **Soccer is not cup-specific:** fresh bots are never put on soccer kickoff spots either. `makePlayer` always uses the race grid (SPAWNS), so that part is a general bot-placement gap.
3. **Fresh bots face backwards:** new bots also start with heading -π/2 (west), while the grid's `rotY` is π/2 (office/cellar classic), 0 (office reverse) or π (cellar reverse). They start pointed away from the first checkpoint, even in round 1.
4. **Stale fields the fix omits:** `v`, `boostUntil`, `itemAt`, `oilUntil` and `hopAt` also carry over.
- Verifier's restatement: Office Cup rounds 2 and 3 keep bots where the previous round ended: no grid slot, and stale heading, waypoint and speed. Fresh bots also start facing away from the first checkpoint, and bots are never put on soccer kickoff spots in any match.
- Verifier's better fix: In `startCountdown`, place bots after `this.mode = createMode(this.modeId, this)` (room.js ~403), not in the reset loop at ~393. `SoccerMode`'s constructor assigns `p.team` there, and the kickoff spot depends on it.

For each bot:
1. **Pick the slot:**
   - Soccer: `kick = this.map.SOCCER.kickoff`. Take the team's spots with the same filter as LocalCar (`i<4 ? 0 : i<8 ? 1 : i<10 ? 0 : 1`). Get `ord`, the bot's position among the players with its team, in `players` iteration order (the same order as `msg.teams`). Use `s = spots[ord % spots.length] || kick[0]`.
   - Every other mode: `s = raceSpawn(p.spawnIndex, modeId==='desk_dash' ? this.variant : 'classic', this.map)`.
2. **Reset the state:** `Object.assign(p, { p: [s.x, 0.24, s.z], heading: s.rotY, q: [0, sin(rotY/2), 0, cos(rotY/2)], v: [0,0,0], wp: 0, speed: 0, kick: {x:0, z:0}, stuckT: 0, boost: BOOST_MAX, drift: newDriftState(), boostUntil: 0, itemAt: 0, oilUntil: 0, hopAt: 0 })`.

Run this for all bots, not only on cup rounds. Round 1 gets the grid-facing heading instead of -π/2, and soccer kickoff spots, which fresh bots never get now. A scratch monkeypatch of the race-grid part brought cup Desk Dash first-checkpoint times back to the fresh-race baseline.

### race-cup #3 [major] (both) Every finisher from 6th place on gets the same +100 bonus, so the podium orders them by join order, not finishing order
- Files: server/src/modes.js:145, server/src/modes.js:166, server/src/room.js:457, server/src/room.js:461
- Evidence: PLACE_SCORE = [500,350,250,180,130,100], and place is clamped to the last entry. Every car from 6th on therefore ends on laps*200+100: 500 on the office, 700 on the 3-lap cellar. endMatch sorts by score with a stable sort, so ties fall back to Map insertion order (join order), and 'place' and XP follow that order. twelve.mjs ran 12-car races. Office s3: bot10 finished #6 but was listed #8, bot4 finished #7 listed #6. Office s4: bot1 finished #8 listed #6. Cellar s1: bot3 finished #10 listed #6, bot9 finished #6 listed #9. Cellar s3: bot1 finished #10 listed #6. Needs 7 or more cars in the race; BOTS_FILL_TO=6, so that means a room of 7–12 humans.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/twelve.mjs
- Proposed fix: Make the finish bonus strictly decreasing for every place, e.g. `PLACE_SCORE[place-1] ?? Math.max(10, 100 - 10*(place-6))`. Better still, store p.finishPlace in RaceMode and have endMatch sort race standings by finishPlace for finishers before score.
- Independent verification: CONFIRMED (high). Code check: server/src/modes.js:145 sets PLACE_SCORE = [500,350,250,180,130,100], and line 166 sets finishBonus = PLACE_SCORE[Math.min(place-1, 5)], so every finisher from 6th on gets +100. After a car finishes, update() skips it (`if (p.finished) continue`), so its score stays at laps*200 + 0*8 + 100. That is 500 on the office (2 laps) and 700 on the cellar (3 laps). endMatch (room.js:457-459) sorts players by score only. Array.prototype.sort is stable, so tied cars keep Map insertion (join) order, and `place` is assigned from that order.

Repro: I wrote my own script at scratchpad/audit/verify-race-tie/tie.mjs. It uses createSim({bots:12, mode:'desk_dash'}) on both maps with seeds 1-8, records finish order from room.mode.finished, and compares it with MATCH_END podium places. The mismatch appeared in 8 of 16 races. Examples:
- office s3: bot10 finished 6th but was placed 8th.
- office s8: bot1 finished 11th but was placed 6th.
- cellar s1: bot3 finished 10th but was placed 6th, and bot9 finished 6th but was placed 9th.
Every mismatched car had exactly 500 (office) or 700 (cellar). The earliest-joined bot always floated up. The effect is visible to players: HUD Podium shows "You placed {mine.place}th".

Reachability: MAX_PLAYERS = 12 humans, and bots only fill to 6 (fillTo counts all players). A race therefore needs at least 7 humans, or mid-match drop-ins, to hit this. The top 3 plaques are never affected, so "major" may overstate it.

Where the description is inaccurate: it says XP follows the wrong order, but XP does not. xp = score/10 + (3 - min(i,3))*15, and every tied car sits at index 3 or higher, so all of them get the same XP (50 on the office, 70 on the cellar in my runs). There is a separate consequence the description leaves out: in the Office Cup, cup.scores adds p.score, so every finisher from 6th on also earns the same cup points.

Fix check: I copied server/shared/scripts to the scratchpad and applied the proposed `PLACE_SCORE[place-1] ?? Math.max(10, 100 - 10*(place-6))`. Result: 0 of 16 races mismatched, and bonuses ran 100, 90, 80, ... Finishers still always outscore non-finishers: the best non-finisher score is (laps-1)*200 + (cps-1)*8, with 18 checkpoints on the office and 13 on the cellar, which stays below laps*200. scripts/test-modes.mjs and test-bots.mjs pass on the patched copy.
- Verifier's restatement: In Desk Dash, every finisher from 6th place on gets the same +100 bonus, so tied cars are placed by join order instead of finishing order (in the podium `place` and "You placed Nth"), and all of them earn identical Office Cup points. XP is not affected: tied cars already get identical XP.
- Verifier's better fix: Use the proposed strictly decreasing bonus in RaceMode.update (server/src/modes.js:166): `p.finishBonus = PLACE_SCORE[place - 1] ?? Math.max(10, 100 - 10 * (place - 6));`. I verified that it makes the podium order match the finish order in all 16 twelve-car runs, and existing tests still pass. Prefer this over sorting only by finishPlace, because it also separates Office Cup points, which are summed from p.score. As optional hardening, also store p.finishPlace (reset in startCountdown and makePlayer alongside finishBonus). Then, only when modeId === 'desk_dash', break score ties in endMatch by finishPlace (finishers ascending, non-finishers last) rather than making finishPlace the primary sort key.

### race-cup #4 [major] (both) Race respawn fallback sends the car back to the start grid facing the classic direction; a respawn within ~2.4 s of a Position Swap always takes this fallback
- Files: server/src/room.js:774, server/src/room.js:782, server/src/room.js:800, server/src/room.js:653, client/src/game/LocalCar.jsx:187, client/src/game/LocalCar.jsx:297
- Evidence: When the safe-pose proposal is missing or unmatched, respawnPlayer uses pickSpawn, which only picks SPAWNS grid slots with their classic rotY (π/2). respawn.mjs has a human at checkpoint 6 send RESPAWN with safe:null. The result is a grid slot every time: office classic back at (-17.4,-5.1) with the next checkpoint 35.0 m away; office reverse at rotY 90° while the reverse grid faces 0°; cellar reverse at rotY 90° while the reverse grid faces 180°, 19.2 m from the next checkpoint. A normal play path reaches this fallback. The swap branch clears the server's poseRing (room.js:653), but the client's 'swap' fx handler only teleports (with yaw 0) and never clears S.safePoses. So for about 2.4 s after a swap the client proposes a pre-swap pose that the server no longer has. swaprespawn.mjs, 1 s after a swap: office proposal (-7.1,-8.4) was answered with a START GRID slot (-19.8,-5.1); cellar proposal (6.3,1.0) was answered with grid slot (-13.7,0.0). A second respawn within ~0.7 s of a respawn (client ring still empty) also lands on the grid.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/respawn.mjs ; node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/swaprespawn.mjs
- Proposed fix: In respawnPlayer, for desk_dash, fall back to the last checkpoint passed instead of pickSpawn. With cps=this.mode.cps and n=cps.length: if nextCp%n===0 use raceSpawn(player.spawnIndex, variant, map); otherwise use a=cps[(nextCp-1)%n], b=cps[nextCp%n] and spot={x:a.x, z:a.z, rotY: atan2(b.x-a.x, b.z-a.z)}. Client LocalCar 'swap' case: clear S.safePoses and S.lastSafeAt after the teleport. The server should also send a heading in the swap effect (the partner's yaw) so the car does not always face north (teleport(...,0)).
- Independent verification: CONFIRMED (high). Code read: in respawnPlayer (server/src/room.js:774-782), desk_dash uses the client's `safe` proposal only if it is within SAFE_POSE_MATCH_DIST of a point in player.poseRing. Otherwise it falls back to pickSpawn (room.js:800), which only returns map.SPAWNS grid slots with their stored rotY of π/2. It never uses raceSpawn, so the REVERSE_SPAWN_ROTY for the reverse variant is ignored. The swap branch clears both server poseRings (room.js:653). On the client, the 'swap' fx case (LocalCar.jsx:297-301) only calls teleport(..., 0) and never clears S.safePoses. Only match_start and respawn_at clear it (lines 225, 238). respawn() sends S.safePoses[0], the oldest entry (line 187).

My own scripts are in scratchpad/audit/verify-respawn/. They build a real Room with one human over a fake ws plus 6 bots, a 60 Hz simulated client ring (200 ms sampling, 0.5 s grounded gate, 12 entries) and 20 Hz STATE reports.

v1.mjs:
- Control: normal driving to CP6, then respawn with ring[0]. The proposal is accepted on every map and variant, so the match check works in normal play.
- safe=null always lands on a grid slot with rotY 90°:
  - office classic: 38.9 m from the next checkpoint.
  - office reverse: 90° while the reverse grid faces 0°.
  - cellar reverse: 90° while the grid faces 180°.

v2.mjs forces a distant swap partner, then respawns with the uncleared client ring. At +0.3, 1.0, 2.0 and 2.6 s after the swap, all 4 map/variant combos returned a START GRID slot at rotY 90°. Examples:
- office classic: swapped to (-5.4,-8.7), respawned at (-17.4,-5.1), next checkpoint 20-27 m away instead of 8-15 m.
- cellar classic: 26-30 m away.
From about 3.0 s the ring had flushed and the proposal was accepted again. In the real client the post-teleport airborne time plus the 0.5 s grounded gate makes the window about 3 s.

The claim is overstated in two places:
1. "Always": in v1, when the partner was about 8 m behind on the same racing line, the player's oldest pre-swap pose lay on the post-swap path and was accepted.
2. "A second respawn within ~0.7 s also lands on the grid": the server drops any RESPAWN within 1200 ms of the previous one (room.js:227). The client is grounded during the 900 ms freeze, so by then its ring normally has samples. That sub-path is essentially unreachable.

The swap is reachable without the human using it: bots fire swap from the back (weight 1.4) at a random rival, which can be the human. The yaw-0 facing after a swap also makes an R-key reset right afterwards likely.

Problem with the proposed fix: joiner.mjs shows a drop-in mid-race joiner has spawnIndex === undefined, because makePlayer never sets it and RaceMode has no onJoin, and has nextCp 0. The proposed nextCp%n===0 branch would call raceSpawn(undefined, ...), which returns undefined for classic (TypeError on spot.x) and {rotY:0} for reverse (player.p = [undefined, 1, undefined]).

cpsolid.mjs: spawning at checkpoint coordinates is physically safe. The only checkpoint overlapping furniture is office cp7 under the meeting table, and cars can drive under tables (top-slab plus legs colliders).
- Verifier's restatement: Desk Dash respawn fallback (pickSpawn) sends a mid-lap car back to the start grid, and ignores the reverse grid heading. A respawn within about 3 s of a Position Swap usually hits this fallback, because the client keeps pre-swap safe poses the server has discarded. It is not "always": a partner close behind on the racing line can still match. The "second respawn within ~0.7 s" path is blocked by the server's 1.2 s RESPAWN gate.
- Verifier's better fix: Server, respawnPlayer, for desk_dash when no proposal matched:
- Let cps = this.mode.cps and n = cps.length.
- If nextCp%n !== 0 or lap > 0, set a = cps[(nextCp - 1 + n) % n] and b = cps[nextCp % n]. The spot is {x: a.x, z: a.z, rotY: atan2(b.x - a.x, b.z - a.z)}. For lap > 0 with nextCp%n === 0 this puts the car at the finish checkpoint facing cps[0].
- Only when lap === 0 and nextCp === 0, use the grid. Do not call raceSpawn(player.spawnIndex, ...) as written: drop-in joiners have spawnIndex undefined, which makes raceSpawn return undefined (classic, crash) or {rotY} (reverse, NaN position). Use pickSpawn(player) for the slot, or player.spawnIndex ?? 0, and override rotY with raceSpawn(0, this.variant, this.map).rotY.
- Optionally offset the checkpoint spot laterally, or skip spots occupied by another car, so two cars respawning together don't overlap.

Client, LocalCar 'swap' case: when fx.a === me or fx.b === me, clear S.safePoses (S.safePoses.length = 0) and reset S.lastSafeAt after the teleport. This must cover both the swapper and the partner.

Swap heading: the server should include each car's new heading in the swap effect (the partner's yaw, from other.q) and ideally swap player.q too. The client should then teleport with that yaw instead of 0.

### race-cup #5 [major] (both) Race safe-pose respawn drops the height, so pressing R on solid raised furniture (kitchen counter/island, cellar loading dock) spawns the car inside it
- Files: client/src/game/LocalCar.jsx:590, client/src/game/LocalCar.jsx:231, server/src/room.js:783, client/src/game/Office.jsx:791, client/src/game/themes/cellar.jsx:615
- Evidence: The client safe-pose ring stores [x, z, yaw] only, and records poses while grounded on any surface, furniture tops included. The server ring matches on x/z. RESPAWN_AT carries no y, and the client teleports to SPAWN_Y (0.29 u, floor height). Only desks and tables are drive-under slabs. The office island and counter (SimpleBox) and the cellar dock and pallet (CuboidCollider from y=0 to h) are solid. raised.mjs: the office kitchen island top (0.92 m) is 2.0 m from CP2/CP3, and the 10 m counter ('drive the kitchen top!') is 1.4 m from CP3. The cellar dock platform (0.9 m, 2.5×8 m) is 2.0 m from CP12. A minimal Rapier test (inside.mjs) with the real car cuboids teleported to floor height inside each of these boxes left the car inside the solid box in 120/120 frames for all three, with no push-out. Plausible, not fully confirmed: this does not run the full LocalCar force model.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/raised.mjs ; node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/inside.mjs
- Proposed fix: Carry height through the pipeline. The client records [x, z, yaw, y] (pos.y). The server poseRing stores the reported p[1] and validates the proposal's y against it. RESPAWN_AT includes y, and the client teleports to (x, y + SPAWN_Y, z). Simplest alternative: the client only records poses with pos.y < 0.5 u, so raised tops are never offered.
- Independent verification: CONFIRMED (high). Code read:
- The client ring (LocalCar.jsx:587-595) pushes [x, z, yaw] whenever `grounded` (2+ suspension rays hit anything, furniture tops included) and pos.y > -0.5. `respawn()` sends `safePoses[0]`, the oldest entry (about 2.4 s old).
- The server (room.js:214-218) keeps poseRing as [p[0], p[2]] only. respawnPlayer (room.js:775-780) matches the proposal on x/z within SAFE_POSE_MATCH_DIST. RESPAWN_AT carries only x, z and rotY.
- The client handler (LocalCar.jsx:231) calls teleport(msg.x, SPAWN_Y, msg.z), which puts the car at floor height.
- The kitchen counter and island use the default SimpleBox case (Office.jsx:787-797): a solid cuboid from y=0 to h. The same is true of recdesk, and the sofa seat is also a solid box from the floor up. In the cellar, the dock and every pallet are CuboidColliders from 0 to h (cellar.jsx:491, 508).
- Each of these tops is reached by a map ramp. The counter is even labelled "drive the kitchen top!", and it sits 1.4 m from CP3.

My own reproduction (scratch dir audit/verify-safepose-y):
1. stuck.mjs replicates LocalCar's per-step model in Rapier 0.19.2: real mass (14 x car.mass), both chassis cuboids, the four solid suspension rays excluding the body, grounded righting, the 900 ms freeze pin, throttle/steer/grip/park brake and downforce. I teleported the car to SPAWN_Y at poses on the counter, island, dock, 0.45 m e-waste pallet stack, recdesk and even the 0.15 m pallet. In every case, idle and with full throttle, reverse or throttle+steer, the car stayed inside the solid box for 360 of 360 frames (6 s). It was pushed down to y about 0.02 m and did not move at all. The suspension rays start inside the solid box and return toi=0, so the car reads as grounded (359/360 frames) and records a fresh safe pose inside the box every 200 ms.
2. As controls (control.mjs), the same model drives normally on open floor: it moves 13.8 m in 6 s at full throttle. Spawned at h + SPAWN_Y it sits on the top and drives off. So the replica is sound, and restoring the height fixes the problem.
3. server-loop.mjs runs a real Room (bot-sim, desk_dash) with a human socket. The human drives along the top for 3 s, flips and sends RESPAWN with the client's oldest pose. The server answers RESPAWN_AT at x/z inside the counter, island or dock footprint, with no y. Then the player reports being stuck in there, grounded, for 2 s and presses R again. The server re-validates the in-box pose, because its own poseRing recorded it, and sends RESPAWN_AT to the same spot inside the furniture again.
4. The upside-down auto-recovery never fires, because the trapped car is upright. There is no stuck detector.

So the bug is real and worse than described: it is a permanent soft-lock for the rest of the race, not a one-off bad spawn. It also triggers for any R press or upside-down auto-recovery within about 2.4-2.9 s after leaving a raised top, not only when pressing R while on the top, because the oldest ring entry is still the top pose.

On the proposed fix:
- Carrying y is correct in principle. However, "teleport to (x, y + SPAWN_Y, z)" with y = pos.y double-counts the ride height, because pos.y is already the chassis centre. It should teleport to the recorded chassis height plus a small margin.
- The server must read y with finiteVec(safe, 4) and fall back to 3, because finiteVec(safe, 3) silently drops a fourth element.
- The pos.y < 0.5 alternative works for every surface I checked. A car on the lowest raised top, the 0.15 m pallet (0.67 u), has pos.y of about 0.85-0.94 u, while on the floor it is about 0.18-0.29 u.
- Verifier's restatement: Race safe-pose respawn drops the height: a pose recorded on solid raised furniture (office kitchen counter/island, recdesk, sofa seat; cellar loading dock and every pallet, even the 0.15 m one) respawns the car at floor height inside the solid collider, where it is stuck and can't drive out. The trapped car still reads as grounded, so it records new in-box safe poses and every later R respawns it into the same box. This soft-locks the racer for the rest of the race. It triggers on any R press or upside-down auto-recovery within about 2.4-2.9 s after leaving such a top, not only when R is pressed while on it.
- Verifier's better fix: Carry height end to end, without double-counting the ride height.
- Client: push [x, z, yaw, y] with y = pos.y rounded. On respawn_at, call teleport(msg.x, (msg.y ?? SPAWN_Y) + 0.03, msg.z, msg.rotY). Do not use y + SPAWN_Y: pos.y is already the chassis-centre height, so that adds about 0.2-0.3 u of drop.
- Server STATE: push [p[0], p[2], p[1]] to poseRing.
- Server respawnPlayer: parse the proposal with finiteVec(safe, 4), falling back to finiteVec(safe, 3) with y = SPAWN_Y. Require both hypot(dx, dz) < SAFE_POSE_MATCH_DIST and |y - q[2]| < ~1 u against the matching ring entry. Set spot.y and player.p = [spot.x, spot.y ?? 1, spot.z]. Include y in RESPAWN_AT; pickSpawn spots send SPAWN_Y or omit it.

Simpler safe alternative: only record client safe poses when pos.y < 0.5 u, and have the server poseRing also skip reports with p[1] >= 0.5 as a guard. Raised tops are then never offered. If the ring is empty, the respawn falls back to pickSpawn. Note this also drops desk-top poses, which today respawn harmlessly under the desk.

### race-cup #6 [major] (both (cellar far worse)) Bots lose most of a lap after a Position Swap or a stuck-recovery hop, because their race-line waypoint is not re-synced to their race progress (worst on the cellar figure-8)
- Files: server/src/room.js:647, server/src/bots.js:353, server/src/bots.js:450, server/src/bots.js:455, server/src/bots.js:51, shared/src/maps/cellar.js:216, shared/src/maps/cellar.js:218
- Evidence: Swap trades lap/nextCp/score and position but not the bot's p.wp or heading. The bot then drives back to its old waypoint and runs the line from there. swap.mjs, cellar: after a swap, the next checkpoint was 2.8 m away and was reached after 29.8 s (s1 bot6); 4.1 m away, 21.7 s (s1 bot4); 3.7 m, 20.9 s (s6 bot6); 7.4 m, 23.3 s (reverse s5 bot1). Office swaps mostly recover in about 1–2 s, with one at 7.5 s. The slowlap.mjs trace for cellar classic s1 bot4 shows a JUMP of 55 u at 53.5 s, with wp=22 kept, then 21.7 s to reach CP3 about 4 m away. Stuck recovery uses nearestWp, which ignores progress and can land past the next checkpoint. stuck.mjs, cellar reverse s8: bot6 heading for CP (11.5,1) was hopped to wp28 (8.0,2.1), west of the checkpoint, and took 28 s to come back round. BOT_PATH also contains (1.5,1) twice (straight and crossroads), so nearestWp at the crossroads always returns the straight's index. Across 10 races per variant, legs slower than 15 s: cellar classic 4, cellar reverse 5, office 1.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/swap.mjs ; node .../race-cup/stuck.mjs ; node .../race-cup/slowlap.mjs cellar classic 1 bot4
- Proposed fix: Add Bots.resync(p). For desk_dash it picks the waypoint nearest the bot, restricted to the path segment between the waypoint at cps[nextCp-1] and the waypoint at cps[nextCp] (every checkpoint lies on the bot line; test-maps checks this). It also points p.heading at that waypoint. Call it for bot participants in the room.js swap branch (or swap p.wp and heading when both cars are bots), and use the same segment-restricted choice in the stuck recovery (bots.js ~450) instead of the global nearestWp.
- Independent verification: CONFIRMED (high). Code read: in server/src/room.js (the swap case, around line 640-657), the desk_dash branch swaps p, lap, nextCp and score between the two cars. It does not touch p.wp or p.heading. In server/src/bots.js, followRaceLine (line 353) only moves p.wp forward when the bot is within 5 u of the waypoint, or has passed it and is within 12 u. pickTarget only aims straight at the checkpoint when it is within CHECKPOINT_RADIUS+6 = 13 u and in sight. So a swapped bot whose checkpoint is more than 13 u (about 2.9 m) away drives back to its old waypoint and runs the line from there. Stuck recovery (lines 450-455) uses the global nearestWp, which ignores race progress. cellar BOT_PATH has (1.5,1) at index 4 and at index 19, and nearestWp returns 4 at the crossroads. I checked both with dup.mjs.

My scratch script (audit/verify-swap/swapstats.mjs) runs real bot-sim desk_dash races and times every leg that follows a swap or a stuck hop. It reproduces the auditor's numbers exactly: cellar classic s1 bot4 4.1 m -> 21.7 s, s6 bot6 3.7 m -> 20.9 s; cellar reverse s5 bot1 7.4 m -> 23.3 s; the reverse s8 hop to wp28 (8.0,2.1) -> 28.4 s.

Over 30 seeds on cellar, normal legs have a median of about 2 s and a maximum of about 10 s:
- Classic: post-swap legs have p90 11.9 s and max 27.0 s (9 over 10 s). Post-hop legs have max 29.9 s.
- Reverse: post-swap legs have p90 22.4 s and max 32.6 s (12 over 10 s). Post-hop legs have a median of 18.4 s and max 39.5 s (9 of 16 over 10 s).
- Office is mild: post-swap max 7.5 s, one slow hop at 13.2 s.

trace.mjs on cellar classic s7 bot2 shows the failure step by step. After the swap the bot is at (13.6,1.2) and its next checkpoint CP3 (15,4.6) is 3.7 m away. p.wp is still 12 (11,7), so the bot drives the whole figure-8 (wp12 -> 33 -> 0 -> 9) and reaches CP3 after 27.0 s, about a full lap.

Counterfactual: I patched only in memory (no repo files changed) a resync that sets p.wp to the nearest waypoint between the previous and the next checkpoint's path segments and points heading at it. I applied it after swaps for moved bots and after stuck hops, keeping the hop position. Every slow leg disappeared. Cellar post-swap max dropped to 5.7 s (classic) and 7.9 s (reverse), and post-hop max to 1.4 s. Bots that finished rose from 143 to 152 of 180 (classic) and from 142 to 156 of 180 (reverse). Office is unchanged or better. The defect is real as described. 'Most of a lap' is if anything an understatement: the worst cases are a full lap or more.
- Verifier's better fix: The approach is right, but 'the waypoint at cps[nextCp-1] / cps[nextCp]' cannot be implemented as written. 8 of the 13 cellar checkpoints are not waypoints at all. test-maps only checks that each checkpoint is within CHECKPOINT_RADIUS of a line segment. The crossroads checkpoint (1.5,1) matches both wp4 and wp19, and a lookup or nearestWp returns wp4, which is the wrong pass.

Instead, precompute and cache a cp -> segment-index map for each (PATH, cps) pair, e.g. in a WeakMap keyed on the path array. Walk the path forward in lap order, starting from the previous checkpoint's segment, and take the first segment that passes within about 1 u of the checkpoint, otherwise the nearest one. This handles REVERSE_BOT_PATH/REVERSE_CHECKPOINTS and the duplicated crossroads correctly.

Bots.resync(p): only when modeId === 'desk_dash' and !p.finished. Search the waypoints from segs[nextCp-1]+1 through segs[nextCp]+1, wrapping. Pick the one nearest the bot, set p.wp to it and point p.heading at it. Other modes keep the global nearestWp.

Call resync in the room.js swap branch for each participant that is a bot (a human-bot swap must still resync the bot side). Call it after the stuck hop in drive() instead of the global nearestWp for p.wp. It works either to keep the global-nearest hop position and only resync p.wp and heading (verified), or to hop to the chosen waypoint itself.

Add a regression test: a bot-sim desk_dash run on cellar in both variants that fails if any leg after a swap or hop takes longer than about 10 s.

### race-cup #7 [major] (both) Cup totals add raw mode scores whose ranges differ by about 5x, so a Desk Dash or Last Car Standing round decides the cup and Standup or Sumo rounds barely count
- Files: server/src/room.js:439, server/src/modes.js:145, shared/src/modes.js:103
- Evidence: endMatch adds Math.round(p.score) straight into cup.scores. Spread between first and last within one round, across 10 cups (cup.mjs): Desk Dash 572 (office 900→328) and 400 (cellar 1100→700); Last Car Standing 91–593; Battery 227–316; Coffee 110–300; Soccer 150–300; Standup Standoff 39–112; classic Sumo 0 (all six cars got exactly 160 in 3 of 3 runs). In cellar s3 the last-placed Desk Dash finisher (700) outscored the Last Car Standing winner (676). This is a design choice ('Cumulative score'), but with it one cup round outweighs the other two combined.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/cup.mjs
- Proposed fix: Turn each round into cup points by placement before adding it to cup.scores in endMatch, e.g. [10,8,6,5,4,3,2,1,…] from the sorted standings with ties sharing points. Alternatively normalise with round((score / max(1, topScore)) * 100). Show round points and the running total in the podium.
- Independent verification: CONFIRMED (high). Code: server/src/room.js endMatch (lines 444-447) runs `cup.scores.set(p.id, prev + Math.round(p.score))` for every player, using each mode's raw score. Each mode scores on a different scale: Desk Dash is lap*200 + cp*8 + a finish bonus from [500,350,250,180,130,100] (server/src/modes.js:145,178), LCS adds a 500 winner bonus (shared/src/modes.js:103), KOTH pays 3/s to everyone in a large zone, Sumo 15 per car outlasted plus 40, and so on. Nothing normalises the scores, so the cup total is a raw sum.

Repro 1 (scratchpad/audit/cup-verify/ranges.mjs): each CUP_POOL mode, standalone via createSim, 3 seeds on each map, classic variant. First-to-last spread per round:
- desk_dash: office 400-652, cellar 400-684
- last_standing: office 481-680, cellar 154-526
- battery and tag: winner-take-all, 190-348
- coffee: 160-450
- soccer: 50-200
- koth: 44-143
- sumo: always 0 (all six cars get 160)

Repro 2 (cups.mjs): 16 full Office Cups through a real Room (votes set to office_cup, map pinned). It reproduces the auditor's cellar seed 3 exactly. The last-placed Desk Dash car (700) outscored the Last Car Standing winner (676), and Stapler won the cup 1816 vs 1455 mostly on its LCS 676.
- In 10 of 16 cups, the round with the biggest spread had a larger spread than the other two rounds combined. Example: office s3, Desk Dash 572 vs 201.
- Recomputing the same cups with 10/8/6/5/4/3 placement points changes the champion in 5 of 16. Example: cellar s1, where Karen wins raw on the LCS round but Spreadsheet has the better placements.

Two parts of the claim are overstated:
- The classic-Sumo "0 spread" is a bots-only artifact. Bots never leave the ring, and the round timeout ("everyone still alive shares the win", modes.js ~596) gives all six cars 40 x 4 rounds = 160. With humans, Sumo can pay about 115 per round, and a non-classic Sumo round in office s2 had a spread of 155.
- Battery and Tag do not "barely count". Their winner-take-all spreads of about 150-350 are mid-range. The low-weight modes are really KOTH/Standup, Soccer (often 0-50 when no goals are scored) and bot-Sumo.

The main claim holds: raw summation lets Desk Dash or LCS rounds decide the cup. The mode description says "Cumulative score", so this is a balance and design defect, not a crash.
- Verifier's restatement: Office Cup totals are raw sums of mode scores whose per-round spreads differ by roughly 5-15x (Desk Dash / Last Car Standing about 400-680 vs Standup about 40-140), so one high-variance round usually decides the cup. The zero-spread classic-Sumo figure is a bot artifact (the timeout shares the win), not a property of the mode.
- Verifier's better fix: In endMatch, turn the round into placement points before adding them to cup.scores:
1. Sort the players by Math.round(score), descending.
2. Group equal scores and give each tied player the points of the best place the group spans (1-2-2-4 style), e.g. PTS=[10,8,6,5,4,3,2,1], with 0 past the table. This keeps totals whole numbers.
   - Do not use the podium's `place` field for this, because it numbers tied players 1..n.
   - Averaging tied points gives fractions like 20.5.
3. Also keep per-player tiebreak data in the cup: the running raw total and/or a count of round wins.
4. Sort cupStandings by (points desc, wins desc, raw desc).
   - Ties at the top happen often under placement scoring: 2- and 3-way ties for first in my 16-cup sim.
   - Without a tiebreak, the "wins the OFFICE CUP" feed line and the champion plaque go to whichever player comes first in Map insertion order.
5. Include the round's points per player (e.g. standings[i].roundPts) in the MATCH_END cup payload and show them next to the total in HUD.jsx's cup-standings.
6. Update the office_cup desc ('Cumulative score') to say placement points.
7. Players who join mid-cup simply start from 0, as they do now.

Do not use the normalise-by-top-score alternative. It keeps KOTH's compressed scale (everyone gets about 85-100) and winner-take-all Battery/Tag (100 vs 0), so it only partly fixes the imbalance.

### race-cup #8 [minor] (cellar) The Reverse variant text says "Same office, the other way round" on the IT Cellar
- Files: shared/src/variants.js:12, server/src/room.js:385, client/src/ui/HUD.jsx:256
- Evidence: The variant desc is hard-coded. race.mjs on the cellar reverse broadcasts the feed '🏁 REVERSE — Same office, the other way round. Every corner you knew is new.', and the countdown toast shows variant.desc instead of the mode desc.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/race.mjs | grep REVERSE
- Proposed fix: Make the wording map-neutral ('Same floor, the other way round…'), or let the feed and toast substitute map.name.
- Independent verification: CONFIRMED (high). I read the cited code. shared/src/variants.js:12 hard-codes the desk_dash reverse desc as 'Same office, the other way round. Every corner you knew is new.' In server/src/room.js:383-386, startCountdown sets this.variant and broadcasts the feed `${icon} ${v.name.toUpperCase()} — ${v.desc}` with no map context. In client/src/ui/HUD.jsx:224/257, the countdown toast calls variantOf(modeId, variant) and shows variant.desc in place of MODES[modeId].desc. The toast's label line does show '{mapName}', but the desc text still says 'office'. The cellar map has name 'The IT Cellar' (shared/src/maps/cellar.js:288) and 13 CHECKPOINTS, so desk_dash reverse can be played there. I wrote my own script at /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/reverse-verify/rev.mjs, which runs createSim({mode:'desk_dash', variant:'reverse', map:'cellar'}). It printed map 'The IT Cellar' and the broadcast feed {"t":"feed","text":"🏁 REVERSE — Same office, the other way round. Every corner you knew is new."}. The desc the client toast would show is the same string. So the defect is real, and it is only a copy/flavour problem, which makes 'minor' the right severity. One part of the evidence is not a bug: the toast showing variant.desc instead of the mode desc is intended behaviour. Only the office-specific wording is wrong.
- Verifier's better fix: Use the map-neutral option. Change the reverse desc in shared/src/variants.js:12 to something like 'Same track, the other way round. Every corner you knew is new.' That one change fixes both the server feed (room.js:386) and the client countdown toast (HUD.jsx:257), because both read the same string. Do not splice map.name into the sentence: the cellar's name is 'The IT Cellar', so a template like 'Same ${map.name}…' reads badly ('Same The IT Cellar'). The toast already shows the map name in its label line anyway.

### race-cup #9 [minor] (both) After finishing, the HUD still reads "LAP 2/2 · CP 0/18" and the checkpoint beacon and minimap marker keep pointing at checkpoint 0; the CP counter never reaches N/N
- Files: client/src/ui/HUD.jsx:319, client/src/ui/HUD.jsx:526, client/src/game/ModeObjects.jsx:164, server/src/modes.js:191
- Evidence: Race progress is [lap, nextCp % n]. A finished car has lap == laps and cp 0. The chip clamps the lap (Math.min(prog[0]+1, laps)), so it shows the last lap with CP 0/N. RaceCheckpoints and the minimap draw cps[0] as the next target. While racing the CP counter runs 0…N-1, then rolls over to 0 when the lap ticks. Nothing tells a player they have finished apart from the feed line.
- Repro: Code read; in any race.mjs run a finished bot has lap===laps and nextCp%n===0, which is exactly what the snapshot sends.
- Proposed fix: On the client, when prog[0] >= raceLaps(map): show 'FINISHED' (with place, if the server adds it to the snapshot or feed) and hide the RaceCheckpoints beacon and minimap ring. Optionally label the counter as 'next CP k/N'.
- Independent verification: CONFIRMED (high). Code read: server/src/modes.js RaceMode.update increments p.lap when nextCp wraps and sets p.finished at lap >= laps. After that, update() skips the car, and snapshot() (line ~191) sends [p.lap, p.nextCp % n], which is [laps, 0] for a finished car. client/src/net.js stores it unchanged in raceProgress. HUD.jsx:319 renders `LAP min(prog[0]+1, laps)/laps · CP prog[1]/N`. ModeObjects.jsx:164 (RaceCheckpoints) and HUD.jsx:526 (minimap ring) both use cps[prog[1] % n], which is cps[0]. No client code checks prog[0] >= laps. The only finish indicator is the feed line.

Scratch script audit/race-finish-hud/check.mjs ran createSim desk_dash on office and cellar, classic and reverse, seeds 3 and 11. It round-tripped mode.snapshot() through encodeSnapshot/decodeSnapshot. In every run the first finisher decoded as [laps, 0]. Office showed HUD "LAP 2/2 · CP 0/18" and cellar showed "LAP 3/3 · CP 0/13". beacon === cps[0] was true each time. While racing, the CP value peaked at N-1 (17 on office, 12 on cellar) and never reached N/N. dur.mjs measured how long the first finisher stays in PLAYING with this display: 15-48 s, because the match only shortens to +12 s once 3 cars finish.

One detail the claim leaves out: a car starting its final lap sends [laps-1, 0], which renders the exact same string ("LAP 2/2 · CP 0/18"). So after finishing, the HUD looks exactly like the final lap just started. The beacon also sends the player back to CP0, which reads as "go around again".

Minor inaccuracies in the claim: "LAP 2/2 · CP 0/18" applies to office only. Cellar has RACE_LAPS 3 and 13 CPs, so it shows "LAP 3/3 · CP 0/13". The CP counter going 0..N-1 then rolling over is a labeling quirk, not a separate bug. Severity minor is appropriate.
- Verifier's restatement: desk_dash: a finished car's progress [laps, 0] makes the HUD show the start-of-final-lap text ("LAP 2/2 · CP 0/18" on office, "LAP 3/3 · CP 0/13" on cellar). The 3D beacon and minimap ring point back at checkpoint 0 for the rest of the match, typically 15-48 s. Nothing but the feed line shows the player has finished.
- Verifier's better fix: Client only, no codec change needed. Compute `const laps = raceLaps(map, MODES.desk_dash.laps); const done = prog && prog[0] >= laps;`.

(1) HUD.jsx chip: when done, render a 'FINISHED' chip instead of LAP/CP.

(2) ModeObjects.jsx RaceCheckpoints: return null when done. Put the check after the useRef/useFrame hooks, or split it into a wrapper component, so the rules of hooks still hold. It needs useMap() for raceLaps.

(3) HUD.jsx minimap desk_dash block: skip drawing the ring when st.raceProgress[st.myId]?.[0] >= raceLaps(map, ...).

Showing the place is optional. The snapshot has no place, so either the server adds it to a feed or effect message (e.g. broadcast {type:'finish', id, place}), or the client counts finished entries in raceProgress at the moment its own entry flips. Snapshot coalescing can make that count tie. Don't widen the u8 race pair in shared/src/snapshot.js unless test-snapshot is updated too. Optionally relabel the counter as 'next CP k+1/N', or keep k/N as 'CPs cleared this lap'.

### race-cup #10 [minor] (cellar) On the cellar the lap and the race finish in the Loading Dock (CP12), not at the corridor 'start/finish' checkpoint by the grid
- Files: shared/src/maps/cellar.js:198, shared/src/variants.js:40
- Evidence: The lap closes on the last checkpoint of the list. On the office that is (-17.5,-4) in reception, next to the grid. On the cellar it is cp(-13.5,-3.4), inside the Loading Dock behind the corridor wall (grid.mjs: finish CP room=loading). CP0 is commented 'start/finish, corridor west', and variants.js says the finish stays 'on the start straight by the grid'. In practice 'lap 2/3' and '🏁 finished 1st!' fire in the loading dock.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/grid.mjs
- Proposed fix: Append a closing checkpoint in the corridor beside the grid (e.g. cp(-13.2, 0.8), after the loading-dock one) so classic finishes on the start straight. Reverse then starts there and runs into the dock as today. Otherwise, correct the comments.
- Independent verification: CONFIRMED (high). Code: server/src/modes.js:157-171 advances nextCp and adds a lap when nextCp % N === 0. That happens when the car touches the LAST checkpoint in the list, and on the final lap the same branch sets finished and posts the '🏁 finished' feed message. On the cellar in classic, cps = map.CHECKPOINTS and the last entry is cp(-13.5,-3.4) (cellar.js:211). That point is inside the Loading Dock room (x -18..-9, z -11..-1). CHECKPOINT_RADIUS is 7 units, about 1.575 m, so the trigger circle only reaches z = -1.825 m and sits entirely south of the corridor's south wall at z = -1. The nearest grid slot is 3.41 m away, on the other side of that wall. This contradicts the comment on CP0, 'start/finish, corridor west', and the comments in variants.js:40-43 and map.js:36 saying the finish stays on the start straight by the grid. Nothing on the client draws a finish line (checked ModeObjects.jsx and HUD.jsx), so where the lap is credited is the only 'finish' a player experiences.

Reproduced with my own scratch script audit/verify-cellar-finish/finish.mjs. It runs createSim on each map and variant and records roomAt() on every lap increment. Cellar classic: 18/18 lap increments, including every finish, happened in 'loading'. Cellar reverse: 18/18 in 'corridor'. The reverse lap closes on the original CP0 (-11.5,1), so it is correct. Office classic and reverse: all in 'reception', next to the grid. So only the cellar classic variant is affected, which the title does not say.

Tested the proposed fix without touching the repo (fix.mjs). It pushes cp(-13.2,0.8) onto MAPS.cellar.CHECKPOINTS and unshifts it onto REVERSE_CHECKPOINTS in memory. Classic laps then close in the corridor (48 of 48 real lap closes; a few outliers came from round resets). Reverse still closes in the corridor. Bots reach all 14/14 checkpoints both ways, 18/18 bots complete a lap, and mean first-lap times are 31.8 s (classic) and 32.5 s (reverse), up from 30.2 and 29.5, still inside test-bots' 18-70 s band. The new point is in open floor and 0.36 m from the BOT_PATH waypoint (-13,0.5), so the test-maps rule 'every checkpoint lies on the bots' line' still holds. The grid-facing test only uses the classic CP0, so it is unaffected.

Side effects of the fix: in reverse, grid slots 9-11 start inside the new CP0. That is harmless and matches the office, where slot 5 (classic) and slots 10-11 (reverse) already start inside CP0. Also, a west-grid car heading straight for the dock door passes about 1.8 m from (-13.2,0.8), just outside the radius, so it has to swerve slightly.
- Verifier's restatement: Cellar, Desk Dash classic only: laps and the race finish are credited at the last checkpoint cp(-13.5,-3.4), which is inside the Loading Dock behind the corridor wall, not by the grid. Cellar reverse and the office are correct.
- Verifier's better fix: The proposed fix works: append a corridor checkpoint after cp(-13.5,-3.4) in cellar CHECKPOINTS. REVERSE_CHECKPOINTS is derived from it, so reverse gets the new point as its CP0, and the reverse finish stays at (-11.5,1). I suggest cp(-13.5, 0.5) instead of cp(-13.2, 0.8). Its trigger circle still stays in the corridor (lowest point z = -1.075 m, at the door threshold). It also catches a reverse-start car cutting straight from the west grid slots to the dock door (about 1.32 m from that line, against 1.8 m for (-13.2,0.8)). It is still within the checkpoint radius of the BOT_PATH waypoint (-13,0.5). No other code change is needed: the HUD uses map.CHECKPOINTS.length, and the snapshot progress is mod N. Re-run npm test afterwards (test-maps and test-bots cover the cellar in both directions).

### race-cup #11 [minor] (both) Bots sit on the grid facing north during the countdown, then snap to face west at GO, whichever way the grid and variant face
- Files: server/src/bots.js:87, server/src/room.js:296
- Evidence: makePlayer gives q=[0,0,0,1] (yaw 0 = north) and Bots.add sets heading=-π/2 (west). Neither uses the slot's rotY. heading.mjs: in all four map/variant combinations every bot shows countdown yaw 0° (grid wants 90° classic, 0° office reverse, 180° cellar reverse), and heading at GO is -90°. On the office and cellar classic grids the bots turn to face backwards and U-turn at GO.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/heading.mjs
- Proposed fix: The same fix as the cup-round reset: in startCountdown, set each bot's heading and q from raceSpawn(spawnIndex, variant, map).rotY (SPAWNS rotY for other modes).
- Independent verification: CONFIRMED (high). Code read:
- makePlayer (server/src/room.js:294-315) puts every new player at SPAWNS[players.size] with q:[0,0,0,1], which is yaw 0, i.e. +z. The map files call +z "north": office REVERSE_SPAWN_ROTY 0 is commented "heading north", and SPAWNS rotY π/2 "faces +x (east)".
- Bots.add (server/src/bots.js:87) sets p.heading = -π/2. Bot forward is (sin h, cos h), so -π/2 is -x, west, in the same convention as rotY.
- startCountdown (room.js:348-437) fills bots, assigns spawnIndex and resets match state. It never touches heading or q.
- tick() returns early for any phase other than PLAYING, so bots.update/drive never runs during the countdown and q stays [0,0,0,1].
- The snapshot encodes p.q (snapshot.js:109), and RemoteCars.jsx:59 applies s.q directly. Clients therefore see the bots sideways on an east-facing grid, while humans are teleported client-side to raceSpawn(...).rotY (LocalCar.jsx:217).
- Small citation nit: the q literal is a few lines below room.js:296, inside makePlayer.

My own repro (scratchpad/audit/verify-bot-heading/h.mjs and trace.mjs) runs a real Room on a virtual clock with startCountdown('desk_dash', variant), for office/cellar × classic/reverse:
- Every countdown snapshot showed yaw 0° for all bots. The grid wants 90° on both classic grids, 0° on office reverse and 180° on cellar reverse.
- On the GO tick heading was about -90°, with first-tick yaws between -69° and -108°. That is a 70-100° snap in one tick.
- On the classic grids the bots start facing backwards and U-turn. Over 20 seeds:
  - office classic: mean 1.95u backward along the grid's forward axis (worst 9.99u; part of that worst case likely comes from other causes such as detours).
  - cellar classic: mean 0.76u backward (worst 1.32u).
  - Mean time until heading error is under 0.3 rad: 0.71 s office classic, 0.99 s cellar classic, 0.99 s cellar reverse.
- Applying the proposed fix in the harness (heading and q from raceSpawn(spawnIndex, variant, map).rotY after startCountdown):
  - cellar classic backward travel went to 0 and alignment time to 0.05 s.
  - office classic went to mean 0.08u backward and 0.12 s.
  - office reverse alignment went from 0.44 s to 0.10 s.
  - cellar reverse improved but did not reach zero (0.47 s, mean 0.58u backward). That remainder is REVERSE_BOT_PATH starting at BOT_PATH[0], east of the grid, which is a separate matter.

Severity minor is fair: the countdown pose is cosmetic, plus about 0.5-1 s lost by bots at launch.
- Verifier's restatement: Freshly added bots show yaw 0 (+z, north) through the countdown because makePlayer's q is never set from the grid, and at GO they snap to heading -π/2 (-x, west) from Bots.add, whatever the grid or variant rotY. On the east-facing classic grids (office and cellar) they launch backwards and U-turn, losing about 0.7-1 s.
- Verifier's better fix: The proposed fix works, with these details. In startCountdown, after bots.fillTo() and after the loop that assigns spawnIndex, add for each bot:

const s = raceSpawn(p.spawnIndex, this.modeId === 'desk_dash' ? this.variant : 'classic', this.map);
p.heading = s.rotY;
const h = s.rotY / 2;
p.q = [0, Math.sin(h), 0, Math.cos(h)];

The raceSpawn call matches LocalCar.jsx:217. Its rotY uses the same convention as bot heading: forward = (sin, cos).

Two gaps if it only sets heading and q:
1. Office Cup rounds 2+ call startCountdown without clearing bots, so they keep their end-of-round position, speed, wp, kick and drift state. The same block should also set p.p = [s.x, 0.24, s.z] and reset speed=0, wp=0, stuckT=0, kick={x:0,z:0}, drift=newDriftState() and boosting=false. Without that, the heading is correct but the bot is off the grid.
2. Soccer: humans spawn at SOCCER.kickoff spots and bots stay on the race grid, which is a separate issue. Using SPAWNS rotY there at least matches where the bots actually sit.

The Bots.add default of -π/2 can then stay as it is, or be set from the slot for consistency.

### race-cup #12 [minor] (both) Cars that have finished still collect and fire items, and race-targeted items (rocket, shrink) are wasted on finished cars
- Files: server/src/modes.js:182, server/src/room.js:632, server/src/room.js:543
- Evidence: RaceMode.rocketTarget sorts every player by score, so finished cars (highest scores) are 'the car directly ahead'. Shrink targets the top scorer, and updatePads does not skip finished cars. Over 48 bot races (rockets.mjs, finitems.mjs): 14/120 rockets and 33/77 shrinks hit an already-finished car, and 190/1209 items were fired by cars that had finished (EMPs and rockets into cars still racing).
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/race-cup/rockets.mjs ; node .../race-cup/finitems.mjs
- Proposed fix: In desk_dash: rocketTarget orders only !p.finished cars; shrink picks the leader among unfinished cars; updatePads and usePowerup ignore finished cars (or clear p.powerup when a car finishes).
- Independent verification: CONFIRMED (high). Code read: RaceMode.update (server/src/modes.js:154-181) sets p.finished and adds the finishBonus (500/350/...) to score. Finished cars are not removed. Bots keep driving the race line (bots.js:260 only skips the checkpoint goal) and keep collecting items through padTarget. RaceMode.rocketTarget (modes.js:182-187) sorts every player by score with no finished filter, so for the first car still racing, "directly ahead" is a finished car. The shrink case in usePowerup (room.js:632-639) picks the top scorer among non-eliminated others, and in desk_dash that is almost always a finished car. updatePads (room.js:542-557) only skips eliminated cars or cars already holding an item, and usePowerup (room.js:586) only rejects eliminated cars. The swap case (room.js:641-644) is the only place that filters p.finished, and its comment says "a car that has already finished its race is out of the running", so ignoring finished cars is the stated intent.

Repro: I wrote my own script, scratchpad/audit/verify-finitems/v.mjs. It runs 40 desk_dash bot races with 6 bots each, seeds 1-20 on both office and cellar, and wraps room.usePowerup and room.updatePads. Results: 167 of 1153 pad pickups were made by cars that had already finished, and 172 of 1071 items were fired by them (oil 28, coffee 30, shield 39, fake 21, turbo 23, emp 8, spring 12, swap 5, rocket 3, shrink 3). 8 of 102 rockets targeted a finished car, and in 5 of those the shooter was still racing. 23 of 76 shrinks hit a finished car, and in 22 of those unfinished rivals were available. In 1 case an EMP fired by a finished car stunned a car still racing. The numbers are in the same range as the auditor's (14/120 rockets, 33/77 shrinks, 190/1209 items). All 40 races had finishers.

The proposed fix is incomplete. If rocketTarget only orders unfinished cars, the race leader (index 0) gets null. usePowerup then falls back to this.nearest(player, others), and `others` still includes finished cars, so the leader's rocket can still lock onto a nearby finished car. The finished filter has to go on `others` in usePowerup for desk_dash, which covers the nearest fallback, EMP and shrink. Also, if p.powerup is cleared when a car finishes, human players need MSG.PICKUP {powerup:null} sent to them, or the HUD keeps showing a stale item.
- Verifier's restatement: In Desk Dash, finished cars keep picking up and firing items, and shrink, and some rockets, land on cars that have already finished
- Verifier's better fix: For desk_dash:
1. In usePowerup, build `others` excluding p.finished (just as swap already does). This covers the EMP, shrink and nearest-rocket fallback pools.
2. In RaceMode.rocketTarget, sort only cars with !p.finished. When the shooter leads the unfinished cars, the null result then falls back to nearest(others), which no longer contains finished cars.
3. In updatePads, skip p.finished. In usePowerup, return early when player.finished.
4. Alternatively, clear p.powerup in RaceMode.update when a car finishes. If you do, send {t: MSG.PICKUP, powerup: null} to human players so their HUD tray empties.

### race-cup #13 [minor] (both) A player who joins mid-cup gets no cup round chip until the next round (WELCOME does not carry cup state)
- Files: server/src/room.js:139, client/src/net.js:103
- Evidence: WELCOME sends phase, mode, variant, map and mutator, but not cup. net.js WELCOME never sets `cup`, so a drop-in during a cup round has no 'round x/3' chip in the match HUD. Their first cup context is the MATCH_END standings.
- Repro: Code read: room.js WELCOME payload and net.js WELCOME setState have no cup field.
- Proposed fix: Add `cup: this.cup ? { round: this.cup.round + 1, total: MODES.office_cup.rounds } : null` to WELCOME, and set `cup: msg.cup || null` in the net.js WELCOME handler.
- Independent verification: CONFIRMED (high). Code read: the WELCOME payload in server/src/room.js (lines 138-149, HELLO handler) sends id, phase, room, private, mode, endsAt, players, countdownMs, mutator, variant and map, with no cup. START (line 435) and MATCH_END (line 480) do carry cup. In client/src/net.js the WELCOME handler (lines 103-139) never touches `cup`. Only START (line 178) and MATCH_END (line 298) set it. HUD.jsx shows the cup chip in Countdown (line 244) and MatchHUD (line 361) only when store.cup is set.

End-to-end repro in scratchpad/audit/cup-welcome/repro.mjs: I ran a real server Room on a virtual clock and imported the real client net.js and store.js, connected through a fake WebSocket and with browser globals shimmed. The script voted office_cup, which rolled the modes [sumo, tag, soccer], ran 30 s into round 1 in PLAYING, then called net.connect() for a new human. On both maps (office and cellar) the WELCOME had no `cup` key while the server's room.cup was round 1, and the client store ended up with phase=playing, modeId=sumo, cup=null. So no 'round 1/3' chip appears until the next START. A mid-countdown joiner loses the chip on the Countdown overlay the same way.

Second problem, same root cause: WELCOME never resets `cup`. I seeded the store with cup {round:2,total:3} and reconnected into a room with no cup, and the stale value stayed. A reconnect into a non-cup match can therefore show a stale 'round 2/3' chip.

The proposed fix is safe. `cup: msg.cup || null` in the WELCOME setState fixes both problems. For a joiner who arrives during PODIUM, the Podium component returns null when podium is null, so the round+1 value (the round that just finished) is never shown wrongly.
- Verifier's restatement: Mid-cup joiners get no cup round chip until the next round, and reconnects can keep a stale cup chip: WELCOME neither carries nor resets cup
- Verifier's better fix: server/src/room.js, in the HELLO handler's WELCOME payload: add `cup: this.cup ? { round: this.cup.round + 1, total: MODES.office_cup.rounds } : null`. client/src/net.js, in the WELCOME setState: add `cup: msg.cup || null`. Always setting it, including to null, is needed so a reconnect also clears a stale cup left from an earlier match.

### coffee-battery #2 [major] (both) A battery carrier who presses R (respawn) every 1.4 s keeps the battery and gets spawn protection over and over, so bumps, rockets and EMP can never touch them while they keep scoring
- Files: server/src/room.js:224-233, server/src/room.js:763-791, server/src/room.js:706, server/src/room.js:608, server/src/room.js:676, server/src/modes.js:314
- Evidence: On a respawn, onFall only drops the battery below y=-6, so an R-key respawn at y≈0.24 keeps it. Each respawn sets spawnProtectUntil = t + 900 + 2000 ms. The server allows a respawn every 1.2 s and the client every 1.4 s, so protection never lapses. onBump returns early for a protected target (room.js:706), rockets fizzle, and EMP skips protected cars. exploit.mjs scenario A puts a rammer 1 u from the carrier sending a hit every 1 s for 30 s. Without R, the carrier loses the battery on the first hit: office +30.5 pts before it passed to bot4, cellar +19.1 before bot2 took it. With R every 1.4 s, the carrier still holds it after 30 s on both maps, earns +60.0 pts (the full 2/s), and is still protected at the end (protectedNow=true). Each respawn also teleports the carrier to the spawn slot farthest from rivals.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node exploit.mjs (lines starting with 'A ')
- Proposed fix: Add a mode hook in respawnPlayer before the teleport, e.g. this.mode?.onRespawn?.(player). In BatteryMode.onRespawn, drop the battery at the pre-respawn x,z. Keep drop()'s existing reset-to-home below y=-8, and keep the battery at the pre-respawn spot for a voluntary respawn. Separately, don't grant spawn protection again when the previous respawn was less than ~8 s ago (track player.lastRespawnAt), or never grant it to a car that holds an objective.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #5 [major] (cellar (office: smaller gain)) R-respawn keeps your beans and puts you on the race grid. On the cellar every grid slot is 2.8-5.6 m from the coffee delivery point, so R is a free teleport to the machine
- Files: server/src/room.js:763-815, server/src/modes.js:257, shared/src/maps/cellar.js:187-191, shared/src/maps/cellar.js:234
- Evidence: CoffeeMode.onFall spills only below y=-6, so an R respawn keeps every bean. Outside desk_dash, respawnPlayer puts you at pickSpawn() over map.SPAWNS, which on the cellar are 12 slots packed at the west end of the corridor, next to the boiler door. exploit.mjs scenario C (cellar): a runner holding 5 beans on the far archive bean (16.6,-5.2), 34.6 m from delivery, presses R and lands at (-13.7,0) with all 5 beans, 5.6 m from the delivery point. All 12 slots are 2.8-5.6 m from it (zone radius 2.6 m). Combined with the wall leak above, slots #2/#5 are 0.23-0.31 m from delivering. On the office the grid is 16.4-19.5 m away (from 27.7 m), so the shortcut is smaller there.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node exploit.mjs (lines starting with 'C ') && node wall.mjs
- Proposed fix: Use the same onRespawn hook as the battery fix: CoffeeMode.onRespawn(p) spills all carried beans at the pre-respawn position, the way a fall does. Alternatively, respawn objective modes at the player's own last validated safe pose, reusing desk_dash's poseRing check in respawnPlayer, instead of the race grid. Optionally give each map a spread-out RESPAWNS list for non-race modes.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #4 [major] (both) R-key respawn is an escape hatch for the It car: it teleports 11-20 m from the chasers with 2.9 s of untaggable time and keeps It, repeatable every ~1.2 s
- Files: server/src/room.js:219-229, server/src/room.js:765-800, server/src/room.js:704, client/src/game/LocalCar.jsx:920-924
- Evidence: tagR.mjs, It car with a chaser touching it. Office: nearest chaser 0.4 m before respawnPlayer, 20.2 m after. Cellar: 0.3 m before, 11.0 m after. Both have spawnProtectUntil = now + 2.9 s and are still It. pickSpawn picks the grid slot farthest from the nearest opponent, and onBump ignores contacts on a spawn-protected target. The client allows R at any time; the server rate limit is 1200 ms.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/tagR.mjs
- Proposed fix: In tag, handle respawn as a recovery, not a teleport. Reuse the desk_dash branch that honours the client safe pose when it matches poseRing, or use the spawn nearest the car, and give the It car no spawn protection. Alternatively, a voluntary respawn while It passes It to the nearest chaser.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #6 [major] (both) Soccer respawn (R key, auto flip-recovery, fall) sends the car to the race grid about 20 m from the pitch
- Files: server/src/room.js:765-800, server/src/room.js:782
- Evidence: respawn.mjs. Office: team-0 car at (3.8,-1.4) respawned at (-19.8,-5.1) in Reception, 19.9 m straight-line from the centre spot. Cellar: (6.9,-5.9) to (-16.1,2.0) in Corridor B-1, 22.1 m from the centre spot, which is the other side of the floor from the Hardware Lab pitch. The 'farthest from nearest opponent' scoring always prefers these far slots in soccer.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/respawn.mjs
- Proposed fix: When modeId === 'soccer', have pickSpawn score map.SOCCER.kickoff entries of the player's own team (indices 0-3 and 8-9 for team 0, 4-7 and 10-11 for team 1), keeping the occupied and recently-used penalties. Send rotY so the car faces the opponent goal.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #2 [major] (both) A respawn (R key, auto flip-recovery, or a mid-match drop-in) puts you back in the spawn room even after that room is locked, and you are zapped 2.55 s later
- Files: server/src/room.js:782, server/src/room.js:800, shared/src/maps/office.js:321, shared/src/maps/cellar.js:187, client/src/game/LocalCar.jsx:920, server/src/room.js:137
- Evidence: pickSpawn only scores map.SPAWNS and ignores LCS locks. Every SPAWNS slot is in one room: Reception on the office, Corridor B-1 on the cellar. respawn.mjs parks a human in the refuge and calls respawnPlayer once the spawn room is locked. Office seed 1: lands at (-17.4,-8.1) m in the locked Reception at t=79 s and is eliminated at 81.55 s. Cellar seed 16: lands at (-17.3,2.0) m in the locked Corridor at t=31 s and is eliminated at 33.55 s. The 0.9 s RESPAWN_FREEZE counts against the 2.5 s ZAP_GRACE, and spawn protection does not stop the zap. The client auto-respawns any car inverted for 1.2 s (LocalCar.jsx:920), so a flip from a bump or an earthquake (twice as frequent in LCS) turns into an elimination. A mid-match drop-in also starts on SPAWNS[0].
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node respawn.mjs
- Proposed fix: In pickSpawn, when modeId==='last_standing', skip spawns whose map.roomAt() is locked or warned. If none are left, spawn at a free point in an open room: the refuge centre, or a spawn-able point listed per room (e.g. KOTH_SPOTS filtered by room). Apply the same to the client's initial position for drop-ins by sending RESPAWN_AT on join.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #14 [minor] (both) An eliminated player can reload the page and rejoin the same match alive
- Files: server/src/modes.js:131
- Evidence: A reconnect gets a new id, and onJoin sets eliminated=false. rejoin.mjs: eliminated=true, alive=7; after removePlayer plus a new HELLO, the same person (p3) has eliminated=false and alive=8. They can still win the +500 crown.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node rejoin.mjs
- Proposed fix: Remember eliminated names/tokens (or client-provided rejoin ids) for the match and keep them spectating on rejoin. Alternatively, make drop-ins after the first closure join as spectators.
- Independent verification: pending (reproduce it yourself first).
