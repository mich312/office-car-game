# Four workplaces at 18 cm: art briefs

## Findings that apply to every map (measured, not guessed)

1. **Floor textures stretch with the room.** In `Office.jsx`, each floor type has one material with a fixed repeat, and that material is stretched once over each room's plane. `surfaces.js` places seam bumps the same way. Measured cell sizes:
   - Cellar Corridor B-1 tiles are **2.57 × 0.29 m (9:1)**, so they read as planks.
   - Office Lounge wood is 5.4:1 and the Cafeteria tile is 2.6:1.
   - The cellar Server Hall "dark" floor is one flat colour across 14 × 8 m.

   **Fix this before building new maps.** Use world-space UVs with a cell size per floor type in metres (tile 0.3/0.6, marble 1.2, raised floor 0.6, rubber 0.5), and have the seams in `surfaces.js` use the same metres.
2. **Bots are 2D and only know about walls.** `bots.js` (`wallBoxesOf`) uses the wall boxes only. It has no furniture and no heights. Checkpoints are 2D circles of 1.58 m (`CHECKPOINT_RADIUS` 7 u).
   - Every raised line (table top, conveyor, bridge) needs a ground-level twin, and `BOT_PATH` must follow the ground-level one.
   - Put each checkpoint after the high line and low line merge again.
3. **Camera.** The chase camera sits 2 u (about 45 cm) above the car and 4–5.6 u (0.9–1.26 m) behind it. It has no collision; `LocalCar.jsx` only keeps y ≥ 0.7 u. Two consequences:
   - Anything you drive under needs **at least 0.6 m of clearance**. Desks at 0.74 m work; a 0.42 m coffee table does not.
   - The **0–1.2 m band** of walls and the undersides of furniture fill most of the screen. Spend detail there.
4. **Lap length** (bot-sim, 6 bots, 2 seeds). With `laps: 2`, aim for **90–105 m** on new maps. For the cellar, either set laps per map or give it 3.

   | Map | Lap | Median bot lap |
   |---|---|---|
   | Office | 112 m | 40–45 s |
   | Cellar | 76 m | 31–34 s |
5. **The theme switch has only two options.** `Office.jsx` draws `CellarDressing` when the theme is `cellar`. Otherwise it draws the office's Ceiling, Outside, LightShafts and LightPools, and the shafts and skyline are fixed to north windows. Each new map needs:
   - a Dressing component
   - a Piece component (like `CellarPiece`/`CELLAR_TYPES`)
   - `LIGHTING` and `AMBIENCE`
   - its own window and shaft directions.
6. **Every ramp is the same object:** an 8 cm plank (`#c8b28a`) tilted in mid-air with nothing under it. Give `RAMPS` a `skin` and put a solid wedge under the deck. Each brief below names its skins.

---

## 1. Garage Zero: software dev garage
`garage` · 40 × 24 m (x −20..20, z −12..12) · WALL_HEIGHT 2.7 m · has time of day

**Feeling:** It is day 400 of a startup that still lives in the founder's double garage and has quietly taken over the house. It is warm, cluttered and hopeful. The door is open and it is sunny outside.

**Cues:**
- A roll-up door, half open onto a sunlit driveway, with a basketball hoop above it.
- Desks made from hollow-core doors on sawhorses, under Edison string lights and a pink "SHIP IT" neon.
- A car up on a two-post lift beside a pegboard of tools. The startup literally lifted the car to make room.

| Zone | x | z | Floor |
|---|---|---|---|
| Driveway (outdoor) | −20..6 | −12..−4 | concrete |
| Front Lawn (outdoor) | 6..20 | −12..−4 | carpet2, tinted turf |
| Garage Bay | −20..−8 | −4..5 | concrete |
| Dev Pit | −8..6 | −4..5 | epoxy |
| Laundry "Server Room" | 6..11 | −4..5 | rubber |
| Kitchen | 11..20 | −4..5 | tile |
| Backyard (outdoor) | −20..−6 | 5..12 | carpet2 (turf) |
| Living Room | −6..10 | 5..12 | wood + rug |
| Founder's Room | 10..20 | 5..12 | carpet |

**Openings.** Doors are 1.8 m wide unless noted.
- **South wall (z = −4):** roll-up opening x −17..−11 (6 m), side door x 2..3.8, front door x 14.6..16.4.
- **Goals:** doorways at x = −8 and x = 6, z −0.9..0.9.
- **North wall (z = 5):** kitchen to founder x 15..16.8, living to dev pit x 3..4.8, garage to backyard x −17.5..−15.7.
- **Other doors:** laundry to kitchen x = 11, z 1..2.8. Founder to living x = 10, z 9.6..11.4. Glass patio slider x = −6, z 7.5..10.
- **Outdoor edge:** a new `fence` wall style, 1.0 m white pickets (`#f1efe8`).

**Desk Dash, about 92 m, clockwise.** The route in order:
1. Chalk grid on the driveway (x −19.5..−15), facing east.
2. Past the skate funbox.
3. Across the lawn on the stepping-stone path. The turf on either side is slow.
4. In the front door and round the kitchen island.
5. Through the founder's room and west along the living room.
6. South into the Dev Pit, with a diagonal slalom through two door-desk pods.
7. West through the Garage Goal door.
8. **Signature moment:** a tight hairpin behind the lifted car, straight down its underside past the oil drip, then out under the half-open roll-up door into the sun.

Checkpoints: (−13,−8) (1,−8) (11,−8) (15.5,−4) (15.5,1) (15.9,5) (14,9) (10,10.5) (4,8.5) (3.9,5) (−2,1) (−8,0) (−13,3.8) (−14,0) (−14,−5).

**Mode spots:**
- **Soccer:** Dev Pit, 14 × 9 m. Goals are "Garage" and "Laundry"; keep the middle 14 × 5 m clear.
- **Coffee:** a chrome lever espresso machine at (18.8, 0), delivered at (17.4, 0).
- **Vending:** a glass-door drinks fridge at (−19.4, −2.5).
- **Printer:** an inkjet on the living-room sideboard at (0, 11.5).
- **Robot:** a robot vacuum loops the living room.
- **Sumo** on the driveway at (−7, −8); **battery** at the centre of the Dev Pit.
- `LIGHTING.glow`: blue at the server shelf.

**Hero set pieces:**
- **Car on a lift** at (−14, 0.15), nose facing south:
  - A boxy 90s estate car: extrude the side profile. Body 4.7 × 1.75 × 1.4 m, **underbody at 0.95 m**, wheels 0.62 m across.
  - Lift posts 0.35 × 0.35 × 2.6 m at x −15.6 and −12.4, with yellow arm pads.
  - One wheel off, leaning on a post. An oil pan 0.8 m across × 0.1 m tall under the engine.
- **Roll-up door:** 6 × 2.4 m with a rib every 0.5 m. Its bottom rail sits at 0.9 m and is the only part with a collider.
- **Door desks:** tops 2.0 × 0.8 × 0.04 m at 0.74 m, on black A-frame sawhorses, in back-to-back pods.
- **Server shelf:** chrome wire shelving 1.2 × 0.45 × 1.8 m holding six silver mini-PCs (0.2 × 0.2 × 0.04 m) and a router with LEDs. A 0.5 m box fan with spinning blades blows on them.
- **Exposed roof trusses:** 0.04 × 0.14 m timbers every 0.6 m, ridge at 3.9 m. Plywood storage deck with a canoe and "XMAS" boxes. LED battens on chains at 2.45 m. A tennis ball hangs on a string down to 1.3 m.

**Props:**
- Garage: pegboard 3.6 × 1.2 m hung at 0.9–2.1 m with tool silhouettes; red tool chest 0.7 × 0.46 × 1.0 m; butcher-block workbench 2.4 × 0.7 × 0.9 m that cars drive under.
- Living and kitchen: beanbags 0.9 m across × 0.6 m tall; kitchen island 2.4 × 1.0 × 0.92 m with bar stools; coffee table **0.5 m** tall (the camera rule).
- Founder's room: floor mattress 1.4 × 2.0 × 0.2 m with a pillow-wedge ramp.
- Backyard: ping-pong table 2.74 × 1.525 × 0.76 m that cars drive under.

**Lighting.** Use a per-hour table.
- **Daylight:** the sun comes in from the south through the roll-up door. At golden hour a 6 m-wide orange slab of light lies across the concrete up to the lift.
- **Practical lights:**
  - LED battens at 5000 K (`#eef4ff`); one is slow to come on.
  - Edison string lights at 2200 K (`#ffb46b`), a bulb every 0.3 m on a sagging line.
  - Neon `#ff3d8b`, RGB PC glow, a lava lamp, TV spill, and the fridge interior (`#dff4ff`).
- **Night:** a motion-sensor floodlight over the garage door clicks on when a car passes. A sodium streetlight (`#ffae4a`) stands at the lawn edge.

**Sound:**
- Day: birds, a distant lawnmower, a ticking sprinkler.
- Night: crickets and a dog next door.
- Always: fridge hum, mechanical keyboards, lo-fi music.

**Palette:**
- **Floors:** driveway `#bdb6a8` r0.9 with expansion joints every 3 m; garage concrete `#9c978d` r0.85; epoxy `#7f878c` r0.35 with flakes; turf `#5f8a3c`.
- **Walls:** unpainted drywall `#e7e2d6` r0.95 with joint-compound stripes (`#f3f0e8`) every 1.2 m; bare 2×4 skirting `#caa874`; house walls `#efe8dc`.
- **Garage:** pegboard `#b48a5a`; tool red `#c8261e` r0.35 m0.3; lift `#3b4048` m0.7 with safety yellow `#f2c200`.
- **Car:** paint `#6b2230` r0.45; chrome `#d9dde2` m1 r0.15.

**Signs and markings:**
- A hand-painted plywood "HQ" sign.
- A sticky-note kanban: TODO 23, DOING 7, DONE 1.
- A whiteboard: "DEMO DAY IN 3 DAYS".
- In chalk on the driveway: the start grid, a wobbly FINISH, and a hopscotch.

**Gameplay hooks:**
- The under-car tunnel, then the roll-up limbo.
- A skate funbox: 1.2 m wide, 0.35 m deck, two 0.9 m ramps.
- A garden hose across the driveway (a 3 cm tube, so a bump).
- The oil pan: grip ×0.6.
- A lawn sprinkler sweeping a wet, low-grip arc.
- Beanbags as bumpers, and the robot vacuum.
- Ramp skins: plywood on a paint can, and the skate ramp.

---

## 2. The IT Cellar: making it look better

**Keep:** the flicker model, which drives the tube, its light pool, a point light and a buzz. Also keep the figure-8 crossroads, the pipes, the centre line and the box junction. These are right.

**What holds it back (measured):**
- Corridor tiles are 2.57 × 0.29 m, and the raised floor has no grid.
- All 10 racks put their LEDs on +z only, because `rack` ignores `rotY`.
  - The north row blinks at the back wall, 1.2 m away.
  - From the corridor glass you see the unlit backs of the south row, so **the server hall reads as a black wall**.
- There are 93 identical tube fixtures: plain boxes, all one colour.
- The walls are one flat paint, the doorways are bare holes, and the ramps are the generic plank.
- The 76 m lap makes a 2-lap race about 65 s of bot time. Set `laps: 3` here.

**Feeling:** Underfunded, fluorescent, humming, slightly damp. These are the people who keep the company running and never get thanked.

**Cues:**
- Louvred fluorescent battens, with one tube dying.
- Glossy two-tone painted block walls with conduit on them.
- A glowing cold aisle behind glass.

**Plan changes.** The lap stays the same.
- **Server hall:** make the two rows face each other. Row A at z 9.3 faces south (`rotY` π), row B at z 6.7 faces north. The cold aisle between them, z 7.4..8.6, gets perforated tiles. Hang PVC strip curtains at both ends of the aisle (x −7.2 and −1.2). The rack backs face the corridor glass.
- **Corridor:** two yellow and black cable protectors across the straight at x −3 and x 10, each 0.5 m wide × 0.05 m tall. At a chassis height of 7.7 cm they are real kicks.
- **Boiler room:** a puddle at (−15, 6.5), grip ×0.7.

**Upgrades, most important first:**
1. **Floors.**
   - Corridor: 0.3 m speckled vinyl tiles in `#9aa39b`, with a 0.3 m border in `#6f7a73`.
   - Raised floor: 0.6 m tiles in `#8e949a` with `#2a2d31` trim. The cold aisle gets hex-perforated tiles with an additive `#4fa3ff` uplight under them. One tile is lifted and leaned on a rack as a ramp (0.6 × 0.6 m, 0.25 m rise).
   - Lab: anti-static vinyl `#aab6bf` with copper strips.
2. **Tubes.**
   - Make each fixture a louvre batten, 1.5 × 0.22 m, with a parabolic aluminium louvre texture underneath.
   - While the dying tube stutters, the **8 cm at each end glows `#ff8a5c` and the middle stays dark.**
   - Blacken the last 6 cm of every old tube.
   - Vary each tube's colour ±5% by hash, and give each room one warm replacement tube: 3000 K `#ffe0b0` among 6500 K `#e8fff4`.
   - Make the hum follow the nearest bad tube.
3. **Walls.** The bottom 0–1.2 m is what fills the screen.
   - Concrete-block relief, 0.4 × 0.2 m blocks.
   - Gloss oil-paint lower band from 0 to 1.4 m in `#6f8578` r0.3, with a 4 cm stripe in `#3f4f46`. Matt `#c3cabb` above.
   - Black rubber skirting, 10 cm.
   - Trolley scuffs at 0.1–0.4 m.
   - Grey conduit running down to sockets at 0.3 m.
   - Extinguishers standing on the floor.
4. **Doors.**
   - Steel frames `#8c9297`.
   - Fire doors propped open at 90° with a 12 cm wooden wedge that can be knocked away.
   - Kick plates and "B-1.07"-style room plates.
   - A badge-reader LED on the server hall door that turns from red to green when a car passes.
5. **Racks.**
   - Hex-perforated doors in `#1a1c20` and blanking panels.
   - A patch panel with blue, yellow and red cable loops.
   - Backs with cable waterfalls and blue power-strip LEDs.
   - A cooling unit (CRAC), 1.8 × 0.9 × 2.0 m in `#e6e8e6`.
   - A red fire-suppression cylinder.
   - A pushable KVM crash cart.
6. **Room heroes.**
   - **Helpdesk:** a red 7-segment "NOW SERVING 042" display that counts up on laps and goals, a take-a-number post, and a pile of returned laptops.
   - **Boiler room:** a yellow gas pipe `#e6c229`, red valve wheels, a pilot flame (`#ff9d4a`) flickering in a sight glass, and a red fault lamp blinking at 0.5 Hz.
   - **Dock:** a corrugated roll-up door with **daylight bleeding under it**, a 3 cm warm line of `#ffcf8a` across the floor with dust. It is the building's only daylight. Also yellow bollards (0.11 m across × 1.0 m), a checker-plate dock leveller, a pallet jack whose lowered forks act as kickers, and an amber beacon.
   - **E-waste:** old CRT monitors, a green mesh cage bin (1.24 × 0.84 × 0.97 m), and a cable tangle.
   - **Archive:** mobile compact shelving on floor rails. The rails, every 1 m, work as rumble strips. The shelves have hand wheels, and one bay can open and close on the match clock.
   - **Lab:** an oscilloscope showing a green trace.
7. **Ceiling:** board-marked concrete, with sprinkler heads on the red main that spray during the Sprinkler Test event.

**Lighting:** keep the fixed state, but add warm and cool accents so it is not all one green.
- Warm: the dock daylight line, the boiler pilot, the helpdesk lamps.
- Cold: the blue uplight in the cold aisle.
- Keep the green exit signs and the red fault lamp.

**Sound:** cooling-unit roar in the server hall only, low-passed at 900 Hz. Drips and a burner whoomp in the boiler room. A distant pipe flush. A helpdesk ding each time NOW SERVING goes up.

**Gameplay hooks:** the cable humps, the strip curtains (a half-second vision cut, which is good in Tag), the puddle, the leaned floor tile, the pallet-jack forks and the compact shelving. Ramp skins: steel dock plate, raised-floor tile, plank.

---

## 3. The 48th Floor: management tower with war room
`tower` · 42 × 24 m (x −21..21, z −12..12) · WALL_HEIGHT 3.3 m · has time of day · glass on all four sides

**Feeling:** Power, quiet and height. Everything is polished and cold, and the city below looks like a map.

**Cues:**
- Floor-to-ceiling glass with the tops of other towers and clouds at eye level, and a street grid 200 m below.
- A marble Sky Lobby with brass lift doors and a backlit onyx reception desk.
- The War Room: an 8 m walnut table under a long pendant light, facing a 3 × 3 wall of KPI screens.

The rooms ring a solid central core, like a real skyscraper floor, so the lap is a ring road.

| Zone | x | z | Floor |
|---|---|---|---|
| Assistants' Row | −21..−7 | −12..−4 | carpet (charcoal) |
| Sky Lobby | −7..7 | −12..−4 | marble |
| Analyst Bullpen | 7..21 | −12..−2 | carpet |
| Executive Lounge | −21..−7 | −4..3 | wood |
| Building Core | −7..7 | −4..3 | concrete |
| Executive Pantry | 7..21 | −2..3 | tile |
| Corner Office (CEO) | −21..−9 | 3..12 | wood + rugs |
| War Room | −9..7 | 3..12 | carpet2 (navy) |
| Sky Terrace (outdoor) | 7..21 | 3..12 | concrete (pavers) |

**Openings:**
- **Goals:** x = ±7, z −8.9..−7.1.
- **Doors:** assistants to lounge z = −4, x −15..−13.2. Lounge to CEO z = 3, x −17..−15.2. CEO's private door x = −9, z 9.2..11. Terrace to pantry z = 3, x 12..13.8. Pantry to bullpen z = −2, x 16..17.8.
- **Glass:** War Room to terrace is a glass slider at x = 7, z 6..8.4. War Room to core is glass with a frosted band, with a door at x −1..0.8.
- **Core:** solid blocks (lift shafts to the south, stairs and restrooms to the north). A 1.4 m service corridor runs east–west at z −1.2..0.2.

**Desk Dash, about 92 m.** The route in order:
1. Grid at x 1..5.5, facing west, on a black-marble start band.
2. Through the West Goal door, Assistants' Row, and the Lounge past the fireplace.
3. Through the CEO's office and across the putting green.
4. Through the private door into the War Room.
5. **Signature, the table.** It has two lines:
   - **High line:** a ramp of stacked annual reports (1.8 m long, 0.76 m rise) onto the lacquered table, which has friction 0.5. Weave through carafes, laptops and name placards, then **launch off the far end toward the video wall.**
   - **Low line** (also the bot line): under the table, between two pedestals and 16 chairs.
6. Out onto the terrace into the wind, then through the pantry and a slalom through the bullpen.
7. Back through the East Goal door to the finish.

Checkpoints: (0,−8) (−7,−8) (−14,−8) (−14,−4) (−14,−0.5) (−16,3) (−15,7.5) (−9,10.1) (−6,7.2) (4.5,7.2) (7,7.2) (12,8) (12.9,3) (14,0.5) (16.9,−2) (14,−7) (7,−8).

**Mode spots:**
- **Soccer:** the Sky Lobby, 14 × 8 m. Marble makes it air hockey. The reception desk sits against the core wall.
- **Coffee:** an espresso bar at (20.4, 0.5).
- **Vending:** a sparkling-water fridge at (8, 2.4).
- **Printer:** a multifunction printer in the bullpen at (20.3, −10.5).
- **Battery:** under the table at (−1, 7).
- **Sumo:** on the terrace at (14, 7.5), so the last circle is out in the wind.
- **Robot:** a night floor-scrubber circles the lobby.
- `LIGHTING.glow`: blue at the video wall.

**Hero set pieces:**
- **War Room table.**
  - 8.0 × 1.6 × 0.76 m walnut on two pedestals, 0.6 × 1.2 m each.
  - A triangle speakerphone in the middle acts as a bump. Placards read "CEO / CFO / COO / HEAD OF SYNERGY".
  - **Video wall** on the wall at x = 6.9: 3 × 3 panels of 1.22 × 0.69 m, 3 mm bezels, filling 0.6–2.7 m in height. It shows a world map with pulsing dots, dials, a chart that goes up and to the right, and the live scoreboard (`BOARDS`).
  - A 7 m LED pendant at 2.5 m.
- **Sky Lobby.**
  - Book-matched white marble with a 2.4 m black-marble compass star at the start line.
  - Six brass lift doors (1.1 × 2.4 m), each with an amber "48" indicator above.
  - A curved, backlit onyx reception desk, 4 × 0.8 × 1.1 m.
  - "SYNERGON HOLDINGS" in 0.3 m steel letters on walnut.
  - A bronze sculpture on a plinth.
- **CEO corner.**
  - A 3.2 × 1.1 m walnut slab desk on blade legs; cars drive under it.
  - A 4 × 1.4 m putting-green rug with a cup, a flag and golf balls.
  - A globe bar 0.9 m across, lit inside; a telescope at the glass.
- **Terrace.** A 1.1 m glass balustrade, olive trees in 0.9 m planters, and a mast with a red aircraft-warning light blinking at 1 Hz. A window-cleaning gondola crawls along the facade.
- **The view.** It is what sells the tower.
  - Put the horizon at mid-window height for the car camera.
  - Show neighbouring tower tops with red beacons and clouds drifting at eye level.
  - Put a ground plane with a street grid 200 m down; at night it gets moving headlights.

**Props:**
- Lounge: leather club chairs, a pushable brass bar cart (0.8 × 0.45 × 0.85 m), a 1.8 m bioethanol fireplace, and a grand piano whose 0.65 m underside cars can drive under.
- Around the floor: orchids on the assistants' desks, triple-monitor desk rows in the bullpen, glass phone booths, and a janitor cart in the core corridor.

**Lighting.** Use a per-hour table. The tower has the most exposed sun in the game.
- **Morning:** cool haze (`#cfe0ff`) from the east.
- **Afternoon:** bright light and marble reflections.
- **Golden hour:** light comes in flat through the west glass. Half-lowered blinds cast striped shafts.
- **Night:** **the light comes from below.** Use a warm city tone (`#4a3420`) as the hemisphere ground colour, 3000 K downlights (`#ffd6a0`), the video wall `#5aa0ff`, the onyx desk `#ffb366`, the fireplace `#ff8a3c`, and red beacons outside.

Shafts come in from both the east and the west.

**Sound:** wind pressing on the glass, a quiet air-conditioning hiss, a helicopter, and phones ringing. When a car respawns, the lift dings and its doors open.

**Palette:**
- **Stone:** white marble `#eeeae4` r0.12 with `#9a9a9e` veins; black marble `#1b1b1d` r0.1.
- **Wood and metal:** walnut `#5a3a24` r0.45; brass `#b8893b` m1 r0.3; brushed steel `#a9adb3` m0.9 r0.35.
- **Soft goods:** oxblood leather `#5a1f1b`; charcoal carpet `#3a3d44`; navy carpet `#1f2a44`.
- **Glass:** a frosted band at 0.9–1.5 m with an etched logo.

**Signs and markings:** there is no floor paint here.
- A brass directory reading "48 · EXECUTIVE FLOOR".
- "WAR ROOM — IN SESSION", with a red lamp that is lit during a match.
- In the bullpen: "ONE TEAM. ONE DREAM." and a "Q4 97.3 % TO TARGET" ticker.

**Gameplay hooks:**
- The table's high line versus its low line.
- Drifting on the marble lobby.
- Extra grip on the putting green, and loose golf balls.
- Terrace gusts: a 3 s sideways push every 15 s or so, signalled by the olive trees bending.
- The bar cart.
- The core corridor as an escape route in Tag and King of the Hill.
- Ramp skins: stacked binders, a fallen easel.

---

## 4. Werk 2: printer assembly
`factory` · 44 × 26 m (x −22..22, z −13..13) · outer walls 7 m, inner partitions 2.2–3 m tall (mesh or block) · has time of day (sawtooth roof and open dock doors)

**Feeling:** A bright, orderly, loud hall that turns out 1,300 printers a shift. Everything is colour-coded and something is always moving.

**Cues:**
- A conveyor of half-built printers weaving between orange robot arms behind yellow and black guarding.
- Epoxy floors with yellow aisle lines, green walkways and hazard stripes.
- An Andon status board and green/amber/red stack lights, under a sawtooth roof with a huge, slow ceiling fan.

| Zone | x | z | Floor |
|---|---|---|---|
| Main Aisle | −22..22 | −2..2 | epoxy |
| Goods In (dock) | −22..−12 | −13..−2 | concrete |
| Shipping Hall | −12..4 | −13..−2 | epoxy |
| Packing | 4..14 | −13..−2 | concrete |
| Canteen | 14..22 | −13..−2 | tile |
| High-Bay Store | −22..−10 | 2..13 | concrete |
| Line 2 | −10..12 | 2..13 | epoxy |
| QA Test Bay | 12..22 | 2..7 | rubber |
| SMT Clean Room | 12..22 | 7..13 | dark, tinted `#b8c4cc` |

**Openings:**
- **Dock doors:** two open on the south wall (x −20..−17 and −16..−13), one on the west wall (z −10..−6.5).
- **Shipping:** a mesh fence along z = −2 with gates at x −9..−7.2 and 0..1.8.
- **Goals:** a fence gate at x = −12 and a block-wall door at x = 4, both z −8.4..−6.6.
- **Packing to aisle:** a mesh fence with a single opening at x 5..7.
- **Canteen:** door to packing at x = 14, z −7.9..−6.1; door to the aisle at z = −2, x 17..18.8.
- **Line hall to aisle:** a mesh fence with gaps at x −8..−6 and 5..7.
- **Store to Line 2:** the rack backs, with a gap at z 10..12.
- **Line 2 to the east rooms:** glass at x = 12, with strip-curtain doors into QA and the clean room.

**Hero: the Line 2 conveyor.**
- **Belt:** 0.8 m wide, top at 0.85 m, with 8 cm kick rails.
- **Path of the belt:**
  1. A feed ramp at x −9.5..−7.5.
  2. East along z 8.5.
  3. A 90° roller curve (radius 1.2 m) at x 9.2.
  4. South, climbing to 1.2 m.
  5. **A bridge over the aisle** (z 2..−2, 1.05 m clearance underneath).
  6. Down into Packing by z −6.
- **Belt movement:** the belt adds 1 m/s (4.4 u/s) to any car on it. This surface velocity is a new mechanic.
- **Printers on the belt:** half-built printers (0.45 × 0.35 × 0.25 m, kinematic) ride it every 1.5 m.
- **Robots:** four six-axis arms at x −5, −1, 3 and 6.5, alternating sides.
  - Base 0.5 m across. Upper arm 1.0 m, forearm 0.9 m.
  - A 0.25 m gripper collider sweeps 0.3–0.5 m above the belt for 1.5 s every 6 s.
  - Drive the motion from the match clock so every client sees the same arms.

**Desk Dash, about 93 m.** The route in order:
1. Grid at x 15..20, facing west, under the Andon gantry. **The stack light counts down red, amber, green.**
2. The 44 m aisle, passing **under the bridge**.
3. North through the rack slalom, then east into Line 2.
4. Up the feed ramp and along the belt past the robots.
5. Round the roller curve and **over the bridge, above the start straight**.
6. Down into Packing, through the Canteen, and back to the finish.

The ground-level twin, which is also the bot path, runs under the belt and through the gap at x 6 to cross the aisle at a yellow box junction. Cars cross the start straight at floor level while others fly over them. It is the cellar's figure-8 crossroads, but on two levels.

Checkpoints: (16,0) (9,0) (−4,0) (−16,0) (−16,7) (−13,11.5) (−8.5,8.5) (1,8.5) (9.2,6) (8,−5.5) (14,−7) (18,−7) (17.9,−2).

**Mode spots:**
- **Soccer:** the Shipping Hall, 16 × 11 m. Goals are "Goods-In" and "Packing". Paint a yellow centre circle; a factory floor already looks like a pitch.
- **Coffee:** a bean-to-cup machine at (21.3, −8).
- **Vending:** three machines at x 16..19, z −12.5.
- **Printer:** the QA bay at (17, 4.5). The printer hazard finally lives among printers.
- **Battery:** the box junction at (6, 0).
- **Sumo:** (−4, −7.5), under the big fan.
- **Robot event:** reskin it as an automated floor cart (AGV) following a floor tape line.
- `LIGHTING.glow`: amber at the Andon board.

**Set pieces and props:**
- **Pallet racking.**
  - Three north–south rows at x −20.4, −16.8 and −13.2, with 2.5 m aisles.
  - Blue uprights `#1f4fa0` and orange beams `#e2611f` at 1.2 m and 2.4 m.
  - Empty ground bays can be driven through under the 1.2 m beam.
- **Andon gantry:** a portal with a beam at 3.5 m holding a 3.2 × 1.0 m LED board. It reads "LINE 2 · TAKT 42 s · PLAN 1300 · ACT 1184", and ACT counts up with laps and goals.
- **Forklift:** 2.3 × 1.1 × 2.1 m, with its forks tilted down as twin kickers. It has a blue warning spot on the floor 3 m ahead and an amber beacon.
- **Stretch-wrap turntable:** 1.65 m across × 0.08 m tall, turning at 12 rpm, with a 2.4 m mast.
- **Ceiling fan (HVLS):** 6 m across, yellow hub, at 6.3 m, turning at 20 rpm.
- **QA benches:** 2.4 × 0.8 × 0.9 m, which cars drive under. Printers on them spit test pages.
- **Clean room:** pick-and-place machines (1.2 × 1.6 × 1.5 m) and a 4 m reflow oven with an orange-lit window.
- **Upper frame:** an overhead chain conveyor at 3.5 m carries printer housings, so the top of the screen always has motion.
- **Canteen:** lockers, and long tables that cars drive under.

**Lighting.** Use a per-hour table.
- **Daylight:** the sawtooth roof faces north and gives soft, even light from the sky. Direct sun only comes through the dock doors: from the west at golden hour and from the south in the morning.
- **Artificial light:** high-bay LED discs at 6.5 m, 5000 K (`#f2f6ff`). Allow a point-light reach of about 30 m.
- **Night shift:** the skylights go deep blue. Light comes from white LED bars on the robot cells, the stack lights, the amber Andon board and the forklift's blue spot.
- **Line Stop event** (a reskin of Server Overload): the Andon board turns red, the stack lights go red, the belt stops and a siren sounds.

**Sound:** conveyor rumble, pneumatic hiss, robot servo whine timed to the arm swings, a forklift reversing beeper, inkjet printing, PA announcements, and an Andon chime.

**Palette:**
- **Floors:** epoxy `#9aa3a6` r0.3, aisle `#6f7b77`, walkway `#3f8f5a`.
- **Safety and guarding:** safety yellow `#f2c200`; black mesh `#1c1d1f`.
- **Machines:** robots `#f07a1a` r0.35 m0.2 with joints `#26282b`; conveyor frame `#c4c8cc` m0.8; belt `#1d1e20`.
- **Product:** printers `#e8e8e4` and `#3a3d42` with brand blue `#1f6fd6`; cardboard `#b88a58`; stretch film `#dfe8ee` at 35% opacity.
- **Building:** walls `#e9ebe8` with a 2 m lower band in `#6f767b` and a hazard band at the base.

**Signs and markings:**
- "INKORA · WERK 2" in 3 m wall letters.
- Hanging zone boards, yellow on black.
- "214 DAYS WITHOUT A LOST-TIME INCIDENT", which **resets to 000 after a big crash**.
- On the floor: 10 cm yellow aisle lines, footprint stencils, 45° hazard stripes, STOP bars, bay labels A-01 to A-08, and the AGV tape line.

**Gameplay hooks:**
- The belt ride and the robot sweeps.
- The bridge versus the crossing.
- Drive-through rack bays and the forklift fork kickers.
- The turntable, which works as a King of the Hill spot that throws you off.
- Paper drifts in QA with low grip, growing during Paper Storm.
- A sticky mat at the clean room door (more grip) versus the rubber mats (slow).
- The AGV patrol.
- Ramp skins: checker-plate steel with yellow edges, the conveyor feed ramp, forklift forks.

---

The scratch scripts behind the measured numbers are in `/tmp/claude-0/-home-user-office-car-game/ca4bbd9f-a675-5371-ab01-3e053db05ec8/scratchpad/audit/artdirector/`:
- `metrics.mjs`: map sizes, floor areas, lap lengths
- `laps.mjs`: bot-sim lap times
- `seams.mjs`: floor texture cell sizes per room
- `tubes.mjs`: tube count and which way each rack's LEDs face