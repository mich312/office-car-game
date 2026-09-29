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

## Your lane: Coffee Run, Capture the Battery, RC Soccer, You're It — and server-side contact
Outcome branch: `claude/modes-contact`.

You own: CoffeeMode, BatteryMode, SoccerMode, TagMode in server/src/modes.js; the BUMP/contact attribution in server/src/room.js (the root cause behind several findings: the server only learns about contact from human BUMP reports and treats the reporter as the attacker — design server-side contact detection that also covers bots, with correct attacker/victim by relative velocity, and use it everywhere a mode needs contact); bot behaviour for these modes in server/src/bots.js (the other mode builders also touch bots.js for their modes — keep your edits to the functions/branches for your modes); ModeObjects.jsx visuals for the coffee machine, beans, battery, soccer ball, goals, It crown, and the team/soccer HUD bits; the snapshot fields these need (shared/src/snapshot.js — keep backwards-compatible encoding within this PR and update scripts/test-snapshot.mjs). Also implement the 3D model audit's §8 plans for CoffeeMachine, Battery, SoccerBall, Goals, Beans and ItCrown (see briefs/model-audit.md §8).

## Your findings (28)

### coffee-battery #1 [major] (both) The server always treats the car that did NOT send the BUMP as the victim, and bots never send BUMP, so bots can never make a carrier drop or spill, and in human-vs-human the victim is whichever message arrives first
- Files: client/src/game/LocalCar.jsx:1106, server/src/room.js:236-244, server/src/room.js:702-729, server/src/modes.js:255, server/src/modes.js:306-311
- Evidence: On contact the client sends {BUMP, target: other} with itself as the sender. onBump(a=sender, b=target) then calls mode.onHit(a, b), and the coffee/battery handlers punish b. Bots have no client, so they never report a bump. exploit.mjs scenario D (cellar): a bot moving at 25 u/s rams a parked human (v=0) who holds 5 beans. The human's own report makes the BOT spill: bot 0/2 beans, human still 5/5. contest.mjs: a human parks with the battery while bots (items on) chase it. The human keeps it 180/180 s in 10 of 12 matches (6 per map), with a bot inside bump range for about 170 s of each match. sim1.mjs bots-only battery: one bot held it 147-174 s of 180 in 7 of 10 matches, and the only drops (0-2 per match) came from items or events. Between two humans both clients report the contact, and the 900 ms per-pair cooldown keeps whichever message lands first, so network latency decides who gets hit. The mode text says 'Get hit, drop it.', which is false against bots.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node exploit.mjs (see line D) && node contest.mjs && node sim1.mjs battery
- Proposed fix: Decide attacker and victim on the server. On a validated hit, project each car's velocity onto the a->b contact normal; the car closing faster is the attacker. Call mode.onHit(attacker, victim) with that ordering no matter who sent the message, and dedupe the two reports of one contact by pair key (already done). Also let the server raise hits between bots and any car: Bots.separate() already finds overlaps under 1.05 u. When the relative speed is at least BUMP_REL_SPEED and the pair is off cooldown, route it through room.onBump so bots can make humans drop the battery or spill beans.
- Independent verification: CONFIRMED (high). Code read:
- client/src/game/LocalCar.jsx:1106 sends {t: BUMP, target: otherId} from onCollisionEnter against any remote car. Bots show up on the client as kinematic bodies with userData.playerId (RemoteCars.jsx:121), so a human's client reports contacts with bots too.
- server/src/room.js:236-244 calls this.onBump(sender, target). Nothing else calls onBump (grep finds only room.js:243).
- onBump(a, b) at room.js:702 puts the per-pair hit cooldown key on the sorted ids (900 ms), then calls mode.onHit(a, b, rel).
- CoffeeMode.onHit(attacker, victim) spills the victim (modes.js:255). BatteryMode.onHit drops the battery only when victim.id is the carrier (modes.js:307-311).
- Bots.update/separate (bots.js:121-172) only push positions apart and never raise a hit.

Scratch scripts are in /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery-verify/. All ran on both maps with identical results.

1. order.mjs:
- Battery, bot at v=25 rams a parked human carrier. The human's report gives onBump(human, bot), and the human keeps the battery.
- Coffee, same setup. Human stays at 5 beans and the bot drops from 2 to 0.
- Human vs human battery: if the rammer's report lands first, the carrier drops. If the carrier's report lands first, the carrier keeps the battery and the rammer's report is swallowed by the 900 ms cooldown.
- Human vs human coffee: rammer first gives parked A 6 to 3 beans. Carrier first gives A still 6, and the rammer goes 4 to 1.
2. botsonly.mjs, 6 bots, 180 s, seeds 1-5 per map:
- onBump was never called in any battery or coffee match (onBump=0 in all 20 runs).
- Battery maxHold was 87-174 s, 169-174 s in 5 of 10 runs, with 0-2 drops per match. The only mode.onHit calls came from rockets and items.
- My proximity probe logged many bot-pair contacts (under 1.05 u) at rel >= 14 that never turned into hits.
3. preempt.mjs: the server accepts BUMP up to BUMP_RADIUS*2.5 = 3.375 u apart, while cars are only 1.0 u long. So a carrier's client can report while the rammer is still 3.2 u away. That burns the pair cooldown, and the rammer's real contact report about 90 ms later is ignored; the carrier keeps the battery. The race is therefore not only down to latency: a modified client can win it every time.

The mode text 'Get hit, drop it.' (shared/src/modes.js:27) is false against bots, and between humans it is decided by message order.

Fix review:
- Deciding attacker and victim on the server is correct. It is safe for the other onHit consumers: free_roam gives score to the attacker, which becomes sensible, and tag transfer() is symmetric.
- The ordering has to be settled before the spawn-protection lines at the top of onBump, which also depend on the (a, b) order. It also applies to the ram and shove logic and the feed text.
- Server-held v is the last STATE report and can already be post-impact. Closing speed along the normal is mostly robust to that, because a pushed victim moves away. Near-equal head-on closing still needs an explicit rule (both are victims, or neither) rather than an arbitrary pick.
- Server-raised hits for bot-vs-human pairs are unnecessary and risky. The human's client already reports those contacts reliably. The server's 1.05 u circle does not match the client's box colliders, so it would echo phantom knockback to humans. Server detection is only needed for bot-vs-bot pairs.
- Bot-bot hits will change battery and coffee balance, so the sims should be rerun afterwards.
- Verifier's restatement: The car that sends BUMP is always treated as the attacker and the other car as the victim, and bots never raise hits. Result: a human carrier can't be made to drop or spill by a bot's ram (the bot takes the hit instead), and bot-vs-bot contact never counts as a hit. Between humans, whichever report reaches the server first picks the victim. Because BUMP is accepted up to 3.375 u (cars are 1.0 u), a carrier's client can also report early and claim the pair cooldown on purpose.
- Verifier's better fix: 1. In onBump, first work out who is attacker and who is victim from server state. Use each car's velocity along the contact normal (a to b for a, b to a for b); the faster-closing car is the attacker. When closing speeds are nearly equal, treat both as victims, or apply the mode effect to any carrier involved.
2. Only after that, run the spawn-protection checks, shield, mode.onHit(attacker, victim), ram/shove and the feed text.
3. Keep the sorted pair key so the two reports of one contact are deduped.
4. Tighten the BUMP validation distance to about contact range, e.g. (CAR_LENGTH + slack) instead of BUMP_RADIUS*2.5. This stops early reports that claim the cooldown before contact.
5. For bots, add server-side hit detection for bot-vs-bot pairs only. Check them in Bots.update before separate() pushes them apart: distance under 1.05, relative speed at least BUMP_REL_SPEED, pair off cooldown, then route through room.onBump.
6. Do not add server-raised bot-vs-human hits. The human client already reports those contacts, and with server-side ordering the rammed human becomes the victim. A server circle test would push phantom knockback to humans whose box colliders never touched.
7. Rerun the battery and coffee bot sims afterwards to check carrier hold times and battery ping-pong.

### coffee-battery #3 [major] (both) A battery knocked loose by a bump is picked up again on the very next tick, by the first player in Map order within 1.6 u. The victim grabs it straight back whenever it joined before the rammer
- Files: server/src/modes.js:283-294, server/src/modes.js:298-306
- Evidence: drop() leaves the battery at the victim's own x,z. The pickup loop has no cooldown for the player who dropped it and takes the first player in insertion order within PICKUP_RADIUS 1.6 u, not the nearest. regrab2.mjs (two humans, bots parked): when the victim joined first, 50 ms after the hit the carrier is the VICTIM again on both maps. When the rammer joined first, the rammer gets it. regrab.mjs (30 seeds per map, bot carrier, human rammer): the battery was picked up again 50 ms after every drop. Office: the victim itself 9, another chasing bot 21, the rammer 0. Cellar: victim 5, other bot 25, rammer 0.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node regrab2.mjs && node regrab.mjs
- Proposed fix: In drop(), store this.battery.noPickup = { id: p.id, until: t + 1500 }, and have the pickup loop skip that player until then. Knock the battery 2-3 u away from the victim along the hit direction, then clamp it out of walls. Pick the nearest eligible player rather than the first in Map order.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #4 [major] (cellar) Cellar: the coffee delivery zone reaches through the boiler-room wall into Corridor B-1, so beans can be delivered from the corridor, and two spawn slots sit about one car length from the zone
- Files: shared/src/maps/cellar.js:234, server/src/modes.js:228, client/src/game/ModeObjects.jsx:226-256
- Evidence: COFFEE_MACHINE has deliverZ = 4.8 m and radius u(1.3). The server uses radius*2 = 2.6 m, so the circle reaches down to z = 2.2 m. The boiler/corridor wall runs z 2.9-3.1 m, with its door at x -14.4..-12.6. wall.mjs: a car in 'Corridor B-1' at (-16.5,2.8), (-15.5,2.7), (-17.4,2.75) or (-16.1,2.25) m delivers all 5 beans in one tick (score 50). The strip that delivers is 1.44 m² of corridor floor, x -18.0..-14.85, fully west of the door. Spawn slots #5 (-16.1,2.0) and #2 (-17.3,2.0) are 0.23 m and 0.31 m from the zone edge. The client draws the same radius*2 green disc, so a slice of it shows on the corridor floor. On the office the circle stays inside the cafeteria.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node wall.mjs
- Proposed fix: Data fix: move the cellar deliverZ to u(5.8), so the 2.6 m circle ends at z = 3.2 inside the wall, or cut the cellar radius to about u(0.85). Code fix for every map: in CoffeeMode.update, also require map.roomAt(player) to equal map.roomAt(deliverX, deliverZ), or require a clear line from the player to the delivery point with no wall crossing. Clip the client disc the same way, or keep it inside the room.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #6 [major] (cellar) Cellar: bots can't find their way into the boiler room, where the coffee machine is. Loaded bots circle at the west end of the corridor for up to minutes, and scores and deliveries drop sharply
- Files: server/src/bots.js:195-205, server/src/bots.js:270-289, shared/src/maps/cellar.js:215-221, shared/src/maps/cellar.js:234
- Evidence: BOT_PATH never enters the boiler room. Its nearest waypoints to the machine (-16.5,4.8) are wp0 (-11.5,1) and the last one (-13,0.5), and from there the straight line to the machine hits the wall (the door is x -14.4..-12.6). The route logic bounces between those two waypoints. sim2.mjs, 8 matches per map: on the cellar, bots hold at least 4 beans for 57% of player-time (office 37%) and a full 5 for 10% (office 2%). Beans delivered: 940 vs 1336. Bots finishing on 0 points: 4/48 vs 0/48. sim3.mjs: of all bot time with at least 4 beans on the cellar, 4164 s is spent in the corridor; 89 s in the boiler room. A delivery run takes p90 34 s (office 15 s), max 130 s. 33 runs were still unfinished at match end, some after 155-163 s. sim4.mjs: stuck bots loop around (-12..-11, -1..0) m on wp 0/32. grid.mjs: a loose battery in the boiler room was never reached by any bot within 40 s in 11 of 17 cells (e.g. (-13,6), (-9,8), (-11,10)). On the office, only cells right against walls were missed. sim5.mjs: archive beans are almost never collected (0, 1 and 7 pickups over 8 matches).
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node sim2.mjs && node sim3.mjs cellar && node sim3.mjs office && node sim4.mjs && node grid.mjs cellar 2
- Proposed fix: Give the map approach waypoints, e.g. COFFEE_MACHINE.approach: [cp(-13.5,1.6), cp(-13.5,4.4)], or a small door graph for rooms off the bot loop (boiler, west server hall, archive). In Bots.pickTarget, when the direct line to the goal is blocked, head for the first approach or door point with a clear line before falling back to the race-loop routing. Add a bot-sim regression check that loaded cellar bots deliver within ~20 s.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #7 [minor] (both) Spilled beans land inside the victim's own pickup radius, so a third or more of every spill goes straight back to the victim (or to the rammer) on the next tick
- Files: server/src/modes.js:240-252, server/src/modes.js:211-224, shared/src/constants.js:85
- Evidence: spill() scatters beans on a ring 1.2-2.2 u from the victim, but PICKUP_RADIUS is 1.6 u and there is no pickup cooldown. spill.mjs: 37.4% (office) and 37.5% (cellar) of spilled beans land inside the victim's pickup radius. spill2.mjs, 40 bumps per case: a hit on 5 beans spills 3. The victim collects 20-33% back within 0.1 s: office bot 39/120, office human 29/120, cellar bot 40/120, cellar human 24/120. The rammer picks up another ~35% (38-44/120).
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node spill.mjs && node spill2.mjs
- Proposed fix: Push the ring out to 2.2-3.2 u (beyond PICKUP_RADIUS plus a tick of movement), and give each spilled bean noPickup: { id: victim.id, until: t + 1000 } that the pickup loop respects.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #8 [minor] (both) hasBattery is not cleared when the match ends. The last carrier keeps the roof battery and the 0.72 speed penalty through the podium and the lobby
- Files: server/src/room.js:439, server/src/room.js:484-497, client/src/game/LocalCar.jsx:583, client/src/game/LocalCar.jsx:630, client/src/game/CarModel.jsx:409
- Evidence: after.mjs: a human carries the battery at the final whistle, and every snapshot afterwards still carries flag 32 ('podium:32/0 lobby:32/0', hasBattery=true once in the lobby). LocalCar applies BATTERY_SPEED_PENALTY from that flag regardless of phase, and the car stays drivable in the lobby. CarModel keeps drawing the roof battery. The flag is only cleared by the next startCountdown. Beans behave the same way (c=4 carried into the lobby), but nothing shows them outside coffee_run.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node after.mjs
- Proposed fix: In endMatch() (and resetToLobby), set p.hasBattery = false and p.beans = 0 for every player before the podium snapshot goes out.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #9 [minor] (both (worst on cellar)) The battery and loose beans are drawn at a fixed floor height (only x,z go over the wire), so a drop on the cellar loading dock or the e-waste pallet stack is hidden inside the solid block. Some spills also land inside walls or on the far side of a wall
- Files: client/src/game/ModeObjects.jsx:206, client/src/game/ModeObjects.jsx:265, server/src/modes.js:244-252, server/src/modes.js:302-304, shared/src/maps/cellar.js:118, client/src/game/themes/cellar.jsx:486-499
- Evidence: The battery is drawn at y = 0.6±0.15 u and beans at 0.7±0.18 u. The loading dock is a solid 2.5×8 m concrete box 0.9 m (4.0 u) tall, and the e-waste pallet stack is 0.45 m (2 u). A carrier hit on top of either leaves the battery or beans drawn inside the block. They can still be collected in 2D, and from the floor beside the block. spill.mjs: 2.2% (office) and 2.3% (cellar) of spilled beans land inside a wall box. Another 1.3% and 1.9% land on the other side of a wall from the victim, i.e. in the next room.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node spill.mjs
- Proposed fix: Keep a y for dropped items on the server (the victim's p[1], clamped to the furniture top under that x,z), send it in the snapshot (one extra i16 for the battery and per bean), and draw at y + bob. In spill(), throw away positions inside a wall box or behind a wall (lineBlocked from the victim) and retry at a smaller radius.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #10 [minor] (both) The minimap marks beans but never shows the coffee machine. On the cellar the machine is out of sight behind a solid wall in the Boiler Room
- Files: client/src/ui/HUD.jsx:512-515
- Evidence: In coffee_run the minimap draws only net.beans. Every other objective gets a marker (battery, ball, checkpoint, zone), but nothing reads COFFEE_MACHINE. On the cellar the machine sits in the boiler room behind the solid corridor wall at z=3, and its 'DELIVER' label is 3.4 u (0.77 m) up, so it can't be seen from the corridor where players spawn.
- Repro: Read client/src/ui/HUD.jsx lines 505-520 (coffee_run branch); grep -n COFFEE_MACHINE client/src/ui/HUD.jsx returns nothing
- Proposed fix: In coffee_run, draw a pulsing ring at px(map.COFFEE_MACHINE.deliverX), pz(deliverZ) with radius radius*2*sc. Make it brighter while myBeans > 0.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #11 [minor] (office) Office: falling off the balcony with beans spills them in mid-air outside the building, where they float for 25 s and can't really be reached
- Files: server/src/modes.js:257, server/src/room.js:537, server/src/modes.js:244-252
- Evidence: The tick calls onFall once y < -10, and spill(p,'gravity',true) rings the beans around the falling car's x,z. fall.mjs: 5 beans at x = -21.20, -21.55, -21.92, -21.95, -21.57 m. The west railing is at x = -21, and a car on the balcony can get its centre to about -20.83, which is 0.37 m or more from even the nearest bean (pickup 0.36 m). They are drawn floating at floor height outside the building until the 25 s TTL runs out.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node fall.mjs
- Proposed fix: On a fall spill (all=true), either drop the beans without creating any, or place them around the player's last grounded pose (poseRing tail), which is on the floor.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #12 [minor] (both) Bean bob and spin phase is keyed to the bean's index in the list, so every bean after a collected or expired one visibly jumps
- Files: client/src/game/ModeObjects.jsx:206-207
- Evidence: From reading the code (not run): position y = 0.7 + sin(3t + i)*0.18 and rotation = t*2 + i, where i is the array index in net.beans. When any bean is collected or expires, every later bean's index drops by 1. That is a 1 rad phase jump: up to about 0.17 u in height and 57° of spin in a single frame. With 27 base beans plus spills this happens several times a second in a busy match.
- Repro: Read client/src/game/ModeObjects.jsx Beans() (around lines 190-221)
- Proposed fix: Use the bean id instead of the index: const k = b[0]; sin(t*3 + k), rotation t*2 + k.
- Independent verification: pending (reproduce it yourself first).

### coffee-battery #13 [minor] (office) Office bean spawn #17 at (15.2, 1.5) m sits exactly on the edge of the meeting table (x 15.2..18.8), half inside its collider
- Files: shared/src/maps/office.js:371
- Evidence: static.mjs flags bean#17 (15.2,1.5) as inside the meeting table box (table (17,1.5), 3.6×1.4 m, min x = 15.2). It can still be picked up from beside the table. None of the 27 cellar spawns, the battery spawn or either delivery point are inside a collider.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/coffee-battery && node static.mjs
- Proposed fix: Move it clear of the table, e.g. cp(14.8, 1.5).
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #1 [critical] (both) Giant Ball mutator makes goals impossible: the goal check requires ball centre y < 3 units, but a giant ball resting on the floor sits at y = 3.36
- Files: server/src/modes.js:399, server/src/modes.js:332, server/src/room.js:376, shared/src/modes.js (MUTATORS.giant_ball scale 1.8)
- Evidence: giant.mjs rolls a ball through the middle of each goal mouth. Normal ball (R=1.87u): 4 of 4 goals register. Giant ball (R=3.36u): 0 of 4. Its lowest y was 3.36u, above the absolute gate `b.p[1] < 3`, so it rolls through and is reset as an escape with no goal. Across 10 full 240 s giant-ball matches (5 per map) there were 0 goals. The mutator rolls in 30% x 1/4 = about 7.5% of soccer rounds and is announced to players.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/giant.mjs
- Proposed fix: Replace the absolute `b.p[1] < 3` with a gate relative to the ball, e.g. `b.p[1] - R < GOAL_POST_H` (2.8u, the post height Goals renders in ModeObjects.jsx), or drop the height gate, since the doorways are full-height gaps. Also note the 1.51 m giant ball only fits the 1.8 m doorway within ±0.145 m of centre. Consider scale 1.5, or widening the goals while the mutator is active.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #2 [critical] (both) Bots never tag each other by contact: the server only processes bumps that human clients report, so bot-vs-bot contact never transfers It
- Files: server/src/room.js:236-244, server/src/room.js:702-718, server/src/bots.js:121-160, server/src/modes.js:512-518
- Evidence: tag2.mjs, 6 bot-only matches per map: room.onBump was called 0 times. Every transfer (office 27, cellar 33) came from an EMP (usePowerup) or a rocket hit. tag1.mjs: chasers spent 80-138 s per match (summed) within BUMP_RADIUS of the It car, closest approach 0.3-0.6 m, with no tag. Longest single It hold: 113 s office, 104 s cellar. tag5.mjs with bot items off: 0 transfers on both maps, and the first It bot held It all 180 s for the maximum 540 points. In the default room (1 human + 5 bots), only the human can ever take It off a bot.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/tag2.mjs ; node .../soccer-tag/tag5.mjs ; node .../soccer-tag/tag1.mjs
- Proposed fix: Add server-side contact detection for any pair that includes a bot. After bots.update()/separate() in Room.tick, for each bot-bot pair (optionally bot-human as a backup) with dist2d < BUMP_RADIUS where neither car is eliminated, call this.onBump(a, b), with `a` the car closing faster so the rub/hit classification uses both v's. onBump's per-pair rub/hit cooldowns already deduplicate. The same root cause means bot-vs-bot bumps never spill beans or drop the battery either.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #3 [major] (both) The It car's own EMP or rocket hands It to its victim (onHit(attacker=It, victim) calls setIt(victim)), and the It car's rocket falls back to the nearest car
- Files: server/src/room.js:609, server/src/room.js:618, server/src/room.js:689-690, server/src/modes.js:512-517, server/src/modes.js:532-535
- Evidence: tag3.mjs, 6 bot matches per map. Office: 16 of 27 transfers were the It car losing It through its own item (EMP 11, rocket 5); chasers stole it with items 11 times. Cellar: 24 of 33 (EMP 14, rocket 10). rocketTarget returns null for the It car, so usePowerup falls back to `this.nearest(...)`. The rocket then hits a chaser and TagMode.transfer gives that chaser It. An EMP used to shake off chasers does the same.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/tag3.mjs
- Proposed fix: Keep the symmetric 'any contact transfers' rule for bumps (onRub and bump hits), but for item hits transfer only when the victim is It. Either add onItemHit(owner, target) in TagMode that does `if (target.id === this.it) setIt(owner)`, or pass a flag from the EMP and rocket call sites. Optionally make shouldUseItem skip emp and rocket while the bot is It.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #5 [major] (both) Bots start soccer on the race grid (reception on the office, corridor west on the cellar), not at kickoff spots; only humans are teleported to kickoff
- Files: server/src/room.js:296, server/src/room.js:393-404, server/src/bots.js:73-95, client/src/game/LocalCar.jsx:199-215
- Evidence: soccer1.mjs start positions. Office: all 6 bots at x -19.8..-17.4, z -9.6..-8.1 (reception). Cellar: x -17.3..-16.1, z 0..2 (corridor B-1). First touch of the ball came 8.2-9.8 s after GO on the office and 5.8-7.9 s on the cellar, while human kickoff spots are 2.4 m (cellar) to 4.7 m (office) from the centre spot. A human gets the ball alone for 5-8 s at every kickoff. Nothing on the server ever moves a bot at match start (grep `p.p =` shows only STATE, swap and respawn), so Office Cup rounds leave bots wherever the previous round ended.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/soccer1.mjs
- Proposed fix: In startCountdown after createMode, place every bot. For soccer, use its team's kickoff spot with the same ordinal-within-team rule as LocalCar.jsx:204-213: set p.p = [x, 0.24, z], heading = rotY, speed 0, kick {0,0}, wp = nearest waypoint. For other modes use raceSpawn(spawnIndex, variant, map).
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #7 [major] (both) Ball out-of-play uses hard-coded office offsets (minX-12, maxX+12, minZ-3, maxZ+12): the ball gets trapped outside the pitch for 60-100 s on the office and plays on behind the goal lines on the cellar
- Files: server/src/modes.js:395-396
- Evidence: escape.mjs, 20 matches per map.
- Office: the ball was pinned in the bathroom's NE corner (-8.7, 0.5) for 100.4 s (seed 5) and 62.1 s (seed 19). stuck.mjs shows all 6 bots within 0.23-0.85 m of it, a scrum no one can break, and the reset only fires at x < -10.7 m.
- Office lounge-doorway excursions last up to 17.6 s, while cafeteria exits reset after only 0.675 m (minZ-3). The pitch is inconsistent side to side.
- Cellar: minZ-3 lies behind the south perimeter wall (dead). 2.7 m of e-waste and archive behind each goal line, and a 2.7 m strip of corridor, stay in play. There were 76 archive excursions; the longest was 11.3 s behind the Archive goal line (archive.mjs, seed 4, bots scrumming at x 9.5-10.2 m).
- Resets are silent teleports (no feed, no freeze).
- Office soccer averaged 1.7 goals per match against 5.9 on the cellar (soccer2.mjs).
- Repro: node .../soccer-tag/escape.mjs ; node .../soccer-tag/stuck.mjs 5 ; node .../soccer-tag/archive.mjs (all under /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/)
- Proposed fix: Use a per-map, time-based out-of-play rule. If the ball is outside SOCCER.arena by more than R and not inside a goal mouth band, start a timer. After about 1.5 s, drop the ball at ballSpawn with the goal freeze and a feed line ('Out of play — drop ball'). Remove the magic -12/-3/+12 offsets, or move them into map data (SOCCER.outMargin). Optionally block the office pitch's non-goal doors for the ball with invisible soccer-only walls.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #8 [major] (both) Lofted shots that cross the goal line inside the mouth are not counted: the check is instantaneous, needs the ball's bottom under 25 cm, and ignores balls that drift out of the band after crossing
- Files: server/src/modes.js:397-399
- Evidence: missed.mjs tracks balls crossing a goal line (centre past g.x±R, coming from the arena, z inside the mouth) over 20 matches per map. Cellar: 41 crossings, 2 not awarded. Seed 4 crossed at centre y=4.21u (bottom 2.34u) and seed 6 at 3.21u, both under the 2.8u posts. The ball then played on in the Archive behind the line, 11 s in seed 4. Office: 14 of 14 awarded. The gate `b.p[1] < 3` means the ball's underside must be within 1.13u (25 cm) of the floor, and a 34 u/s car kick lofts the ball's centre to about 5u.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/missed.mjs
- Proposed fix: Detect the crossing instead of the position. Keep prevP; award the goal when prev x is on the arena side and the new x is past g.x ± R, with z at the crossing inside g.z ± width/2 and ball bottom (y - R) under the post height. This also removes phantom goals from a ball that reaches the goal room's band another way. Apply the same height fix as the Giant Ball finding.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #9 [major] (both) Bots score many own goals: their 'behind the ball' aim point (1.2u) is inside the kick reach (R+0.75 = 2.62u), so a bot coming from the goal side kicks toward its own goal
- Files: server/src/bots.js:231-238, server/src/modes.js:380-392
- Evidence: owngoals.mjs, 20 matches per map. Office: 15 of 36 goals were own goals (42%). Cellar: 32 of 106 (30%). Only 69-70% of about 17k bot kicks had any component toward the opponent goal. Experiment owngoals_fix.mjs monkeypatches bots to line up behind the ball first (outside reach), then drive through. Own goals fell to 15% (office) and 24% (cellar), but total goals also fell, so this needs tuning.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/owngoals.mjs ; node .../soccer-tag/owngoals_fix.mjs
- Proposed fix: Use a two-phase approach. Let u = unit(ball - oppGoal) and behind = dot(unit(bot - ball), u). If behind < 0.7, target ball + u * (R + 0.75 + 1.5), offset sideways around the ball so the bot never crosses it. Otherwise target ball - u * 2 so it drives through the ball toward the goal. Optionally give one bot per team a keeper role near its own goal.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #10 [major] (both) The local player is never told which team they are on: the HUD chip shows only the score, the own car has no team colour, and the minimap shows no goals or teams
- Files: client/src/ui/HUD.jsx:325-331, client/src/ui/HUD.jsx:520-523, client/src/game/CarModel.jsx:598-599, client/src/game/RemoteCars.jsx:133
- Evidence: Searched client/src for team, teams, orange and myTeam. net.teams is read only by the LocalCar kickoff teleport. Team colour appears only on REMOTE nameplates (CarModel `!isLocal && name`). The soccer chip renders `orange-dot {teamScores[0]} — {teamScores[1]} blue-dot` with no 'you'. The minimap draws the ball but not the goals, and colours players by paint. After an R-respawn to the race grid (previous finding) a player cannot tell which goal to attack.
- Repro: grep -rn "team" /home/user/office-car-game/client/src --include=*.jsx --include=*.js
- Proposed fix: Show 'YOU: 🟠 ORANGE → attack the 🔵 goal' in the soccer chip, from store players[myId].team, which START and LOBBY already carry. Tint the local car's underglow or nameplate with the team colour. Draw both goals and team-coloured player dots on the minimap.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #11 [minor] (both) A shield blocks a hard hit but a gentle rub steals It straight through it
- Files: server/src/room.js:712-725
- Evidence: tag4.mjs: a HIT on a shielded It car leaves It in place and pops the shield, but a RUB on the shielded It car transfers It to the rubber while the shield stays up. onBump calls mode.onRub before the shield check, which runs only on the hit path.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/tag4.mjs
- Proposed fix: In TagMode.transfer, return early when the car that would lose It has shieldUntil > now, and pop the shield instead. Or run the shield check before onRub in onBump.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #12 [minor] (both) Players who join during the countdown are always put on Orange (the makePlayer default team 0), unbalancing teams, and get no kickoff spot
- Files: server/src/room.js:137, server/src/modes.js:349
- Evidence: join.mjs, 7-player room at 4/3. A human joining during COUNTDOWN gets team 0, making it 5/3. The same join while PLAYING goes through onJoin and gets team 1, making it 4/4. onJoin is gated on PHASE.PLAYING, but SoccerMode already exists from startCountdown.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/join.mjs
- Proposed fix: Call mode.onJoin for COUNTDOWN as well as PLAYING. Include the team in WELCOME so a countdown or mid-match joiner's client can teleport to a team kickoff spot.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #13 [minor] (office) The office pitch rarely produces goals: 'First to 5' is essentially never reached
- Files: shared/src/maps/office.js:SOCCER (goals, arena), server/src/modes.js:395-399
- Evidence: soccer2.mjs, 10 bot matches per map. Office: 1.7 goals per 240 s match, 0 of 10 reached the cap, one 0-0, most ended 1-0 or 0-1. Cellar: 5.9 goals per match, 4 of 10 ended by the cap at 156-227 s. Office goals are 1.8 m side doorways 14 m apart at different z, with 4 desk pods and 4 other exits (bathroom, 2 lounge doors, server, 2 cafeteria doors) leaking the ball.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/soccer2.mjs
- Proposed fix: After the out-of-play fix, re-measure. If it is still low, widen the office goal mouths or close the side doors to the ball in soccer, or lower the office goalCap (per-map SOCCER.goalCap).
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #14 [minor] (both) The server ball ignores ramps (passes through the plank) and is never pushed out of a box once its centre is inside one
- Files: server/src/modes.js:354-376
- Evidence: ramps.mjs rolls the ball up the in-arena ramps: office (-4.5,-2.85) and (2.5,5.85), cellar lab (3,-9). The ball never rises above its rest height of 0.42 m and ends inside the ramp footprint. A ball dropped onto an office desk top fell to y=0.53 m and stayed at the desk centre, inside the desk. The circle-vs-AABB push-out skips d2 == 0 (`d2 > 1e-9`), so a centre inside a box is never resolved. This did not occur in 40 normal matches (inbox.mjs), so impact is limited to lofted balls over furniture and visible clipping on ramps.
- Repro: node /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/soccer-tag/ramps.mjs
- Proposed fix: Give the ball a floor at box.h + R when it is above a box's footprint (tops of desks and benches). Push out along the shortest axis when the centre is inside a box. Add ramp wedges: floor height = rise * along/l within the ramp footprint.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #15 [minor] (both) After a goal or escape reset, the client's kinematic ball sweeps back across the pitch instead of snapping
- Files: client/src/game/ModeObjects.jsx:298-308
- Evidence: This is from code plus arithmetic, not a runtime observation. The client lerps with k = min(1, dt*10) toward the server ball and has no snap. From the office Focus goal to the centre spot is about 35u. At 60 fps the first frame moves about 5.8u (about 350 u/s) and the move takes about 0.3 s. The body is `kinematicPosition` with a BallCollider, so a local car in its path would be shoved.
- Repro: Read client/src/game/ModeObjects.jsx:298-308. Server resetBall() jumps the ball to ballSpawn with v=0 (server/src/modes.js:345-348).
- Proposed fix: If the new server position is more than about 6u from the rendered one (or on a goal/reset event), call setTranslation directly instead of lerping. Optionally disable the collider for the 2.5 s goal freeze.
- Independent verification: pending (reproduce it yourself first).

### soccer-tag #16 [minor] (both) The Moon Gravity mutator ('Everything floats') does not affect the server-simulated ball
- Files: server/src/modes.js:358, client/src/game/Game.jsx:62
- Evidence: The ball integrates `b.v[1] += GRAVITY * 0.6 * h` whatever room.mutator is. The client scales gravity by MUTATORS.moon_gravity.gravity (0.45) for cars only, so the cars float and the ball does not.
- Repro: Read server/src/modes.js:358 against client/src/game/Game.jsx:59-62.
- Proposed fix: Multiply by (room.mutator?.gravity ?? 1) in SoccerMode.update.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #1 [critical] (both) With the Giant Ball mutator a goal can never be scored: the goal check needs ball y < 3, but the giant ball rests at y = 3.36
- Files: server/src/modes.js:399, server/src/modes.js:332, shared/src/modes.js:125
- Evidence: R = u(0.42)*1.8 = 3.36 units, and the floor clamp keeps b.p[1] = R, so `b.p[1] < 3` is never true while the ball rolls. giant3.mjs fires a centred giant ball through each goal doorway: office, the ball is fully past the line at x=-8.94 m, y=3.36, goals=0. Cellar: x=-0.94 m, y=3.36, goals=0. giant2.mjs: at offsets 0 to 0.5 m the normal ball scores every time and the giant ball never scores. giant.mjs, 8 bot matches of 240 s each: office 1.5 goals/match normal vs 0.0 giant; cellar 5.6 vs 0.0.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node giant3.mjs && node giant2.mjs && node giant.mjs
- Proposed fix: Make the height gate relative to the ball size: `b.p[1] < R + 3` (or `b.p[1] - R < 3`). Also add a test-modes case that shoots a 1.8x ball through each map's goal.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #9 [minor] (both) Open Office's +5 bump point goes to whoever reported the contact, not the car that did the ramming, so a parked human scores when a bot hits it
- Files: server/src/modes.js:45, server/src/room.js:236, server/src/room.js:729, client/src/game/LocalCar.jsx:1103
- Evidence: Every client sends BUMP on any car contact, and onBump(a=sender, b=target) calls onHit(a,b). Bots never send BUMP. bumpcredit.mjs: a bot rams a stationary human at 20 u/s; parked human +5, ramming bot +0.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node bumpcredit.mjs
- Proposed fix: In onBump, pick the attacker as the car with the larger closing speed along the contact normal (the server already has both v vectors) before calling mode.onHit. The same ordering fixes spill and drop attribution in the other modes.
- Independent verification: pending (reproduce it yourself first).

### lcs-freeroam #10 [minor] (both) Moon Gravity does not reach the soccer ball: 'everything floats' except the one server-simulated object
- Files: server/src/modes.js:358, client/src/game/Game.jsx:62
- Evidence: Moon gravity only changes client physics gravity. SoccerMode always integrates the ball with GRAVITY*0.6. moon.mjs: dropped from y=10, the ball hits the floor after 0.80 s both with and without moon_gravity.
- Repro: cd /tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/lcs && node moon.mjs
- Proposed fix: In SoccerMode.update, multiply by `(this.room.mutator?.id === 'moon_gravity' ? MUTATORS.moon_gravity.gravity : 1)`. Bot spring hops (HOP_S/HOP_H) could use the same scaling.
- Independent verification: pending (reproduce it yourself first).
