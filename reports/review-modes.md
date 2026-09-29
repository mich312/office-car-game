# Review: game modes & server

**Coverage.** Every mode × map × variant ran in bot-sim. A fake-socket harness added 1 and 12 humans, joins, leaves, R-spam and item-spam, with 0 exceptions; every match ended, and the mean tick stayed ≤ 0.35 ms with 12 bots. In the browser, two clients shared one server, one of them with its clock 90 s fast, through race, soccer, tag and sumo. They agreed on teams, team scores, It and the podium, with no page errors.

## Fixed (each has a test that fails before and passes after)

- **LCS respawn escape** (`server/src/room.js` respawnSpot). R inside a closed room teleported the car 68–128 u into a safe room; a hostile client didn't even need to flip. A car being zapped now recovers on the spot.
- **Sumo R-immunity** (`room.js` respawnPlayer). R every 8 s gave 2.9 s of shove immunity. Sumo respawns are now unprotected, like the It car's.
- **Humans judged on the last map** (`room.js` startCountdown). Until a client reported from the new floor, the server kept the human at the old map's coordinates. Office→cellar, a silent tab was out of the sumo ring before GO, and it happened live on a slow browser client. START now places humans at their start spot, as it already did for bots.
- **Soccer 0-0 with 8+ cars** (`server/src/bots.js`). Every spare bot parked on its own goal line: the office managed 0.3 goals a match at 8 cars. Now there is one keeper a side and the rest hang wide, and the office scores 3–4 a match at 8–10 cars.
- **Perch exploit** (`shared/src/modes.js` perched, `server/src/modes.js`, HUD). A human on the garage desk row kept It or the battery 100 % of the time, with a bot under the desk 90 % of it (bots are 2D). After 5 s up on furniture the battery now slides to the floor and It passes on. The HUD warns the holder.
- **Moving Meeting ended over the meeting table** (`shared/src/variants.js`), along with three factory benches and pallets, where bots can't shove anyone. Those targets are now out of the pool.
- **Clock skew** (`client/src/net.js`). The server's deadlines (endsAt, pad and ability cooldowns, closing rooms, shields) were compared against the local `Date.now()`. They are now converted to local time on arrival, and WELCOME sends the server's time. The +90 s browser client now shows the same timer as the other client.
- **Drop-ins** (`room.js` WELCOME, `net.js`). A drop-in missed any office event already running, so it drove on dry floors during sprinklers. It also saw pads other players had taken as ready.
- **Standup chip** (`HUD.jsx`). It showed "+3/s" to a car behind a wall, where the server scores nothing.
- **LCS bots** (`bots.js`). A step already routed round closed rooms was re-routed straight through them, and fleeing counted other locked rooms as open floor. The measured effect is small (tower: 7→6 room deaths over 16 seeds); see finding 1.

## Out of lane

1. **minor — tower room rects** (`shared/src/maps/tower.js`). The lift-core wall block (z −17.8..−5.4) pushes the core→bullpen passage into `tower_pantry`'s rect, so LCS bots crossing it after the pantry locks get zapped. Tower loses 6 cars in 112 this way; other maps lose 1–3. Patch: end the pantry rect at the core/bullpen wall line.
2. **minor — gust per client** (`LocalCar.jsx:641`, `themes/tower/live.jsx:465`). The terrace gust runs on each client's own `Date.now()`, so players feel it at different times. Patch: `(performance.now() + net.clockOffset) / 1000`.
3. **minor — the robot** (LCS and the event robot) drives through furniture and eats perched cars. Patch: skip `perched()` cars.
4. **minor — a client more than 5 s behind** can still overwrite the server-placed spot with old-map reports before it processes START. This only showed up under SwiftShader.
5. **minor — drop-ins never replace bots**, so a room can hold 12 humans + 5 bots. This is a design call; the server handles it fine.

## Checked, fine

Scoring and win conditions, podium and cup placement points, timers, a leaver mid-round in every mode, map rotation (bots cleared, pads reset), per-map event renames, robot paths never crossing walls, and per-tick cost. Tag's long It streaks follow car speed and are not a defect.
