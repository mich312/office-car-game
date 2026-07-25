# 🏎️ Tiny RC Mayhem

**2–12 players. Tiny RC cars. One giant office, after everyone has gone home.**

Coffee mugs are ramps, keyboards are bridges, marbles are landmines and the
cleaning robot is a war crime. Every mug, chair, monitor, pen, plant and paper
stack in the building is a live physics object. Rocket League × Mario Kart ×
Toy Story.

![stack](https://img.shields.io/badge/react-19-blue) ![stack](https://img.shields.io/badge/three.js-R3F9-black) ![stack](https://img.shields.io/badge/physics-rapier-orange) ![stack](https://img.shields.io/badge/server-node%20%2B%20ws-green)

## Quick start

```bash
npm install

# development (server on :8080, Vite client on :5173 with ws proxy)
npm run dev
# → open http://localhost:5173

# production (server serves the built client + websockets from one port)
npm run build
npm start
# → open http://localhost:8080
```

Playing solo works out of the box — the server fills the lobby with bots
(Karen from HR sends her regards). Open a second browser tab for split-brain
multiplayer testing. Add `?lowfx` to the URL to disable shadows and
post-processing on weak GPUs.

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | drive (`S` is a real brake at speed) |
| `Shift` | drift — hold to charge blue → orange → pink sparks, release for a mini-turbo scaled to the tier |
| `Space` / `B` / `Ctrl` | boost |
| `E` / click | use powerup |
| `Q` | car special ability (20 s cooldown) |
| `H` | horn (bumped bots honk back) |
| `1`–`8` | emote wheel |
| `R` | respawn |
| `Tab` | scoreboard |
| `N` | day / night |
| `P` | photo mode |
| `M` | mute |

Gamepads work out of the box (standard mapping): left stick / d-pad steers,
triggers are gas and brake, `A`/`B` boost, `X`/bumpers drift, `Y` item.
On phones and tablets, on-screen touch controls appear automatically and
auto-gas defaults on. An **auto-gas assist** toggle in the garage keeps the car
accelerating on its own for one-handed play. Tuck in behind a rival for ~2 seconds to charge a
**slipstream** burst, and watch the banner: office events telegraph
themselves 3 seconds before they hit. There is no jump button — air time
comes from ramps, springs and furniture, and the car self-levels so you land
on your wheels. Climbing assist keeps ramps drivable at full grade.

## The garage

The main menu is a 3D workshop: your car sits on a turntable on someone's
desk, lit by the desk lamp. The **bench monitor** runs the tuning software —
car pick, stats, paint, and the full NFS-style visual catalog: six wheel
styles, three bolt-on spoilers, five vinyl wraps with eight wrap colors,
four paint finishes (toon gloss, matte wrap, metal flake, pearl coat), a trim
colour for splitter/mirrors/wing/helmet, and underglow in six colors
(brightest after dark). Every car also carries a facilities-issue licence
plate with your driver name on it. A **clipboard** propped against a coffee
mug holds the controls cheat-sheet, and the big red button on the desk starts
the game. Your build is saved locally and synced to every player in the
lobby — the bots roll their own builds too.

### The setup sheet

The **TUNE** tab is real tuning, not decoration. Five axes — gearing, tyres,
suspension, downforce, ballast — each a −2…+2 notch that gives with one hand
and takes with the other: tall gears buy top speed with acceleration, soft
tyres buy grip with slide, ballast buys shove with agility. There's no budget
to spend and nothing to unlock, because a maxed sheet is a *specialised* car,
never a stronger one. Suspension really does change the spring and damper
rates in the 4-ray suspension, and ballast really does change rigid-body mass,
so a loaded car wins the shoving matches (the server scores bumps with both
sheets in hand).

Everything previews before you commit:

- the car on the turntable changes **stance, tyre width and wing rake** live,
  read straight off the same numbers the physics uses;
- the stat bars show the car **as tuned**, with a tick where stock sits;
- and the monitor plots a **simulated 6-second slalom** — your sheet solid
  against stock dashed — by re-running a 2-D copy of the real driving model
  from shared code, with top speed (in scale km/h), 0→top, turn rate, how far
  off the line it wanders, mass and ground covered, each against stock.

Five named presets (Corridor Sprint, Cubicle Carver, Sideways Special,
Open-Plan Bruiser, plus Stock) are one click away. Design notes and the
backlog live in `docs/car-design-brainstorm.md`.

## Game modes (lobby votes)

- 🏁 **Desk Dash** — 3 laps through all eight rooms, shortcuts everywhere
- ☕ **Coffee Run** — collect beans, deliver to the kitchen machine, bump rivals to make them spill
- 🔋 **Capture the Battery** — hold it to score, carrying slows you down, get hit and you drop it
<<<<<<< HEAD
- ⚽ **RC Soccer** — a huge ping pong ball and two doorway goals, first to 5 wins
- 📍 **Standup Standoff** — the meeting zone hops between rooms every 20 s; hold it to score
- 🎯 **You're It** — the crowned car scores while It; bump them to steal the crown
- 🥋 **Meeting Room Sumo** — the ring shrinks over the round; shove rivals out, last car rolling wins

Contact is honest about physics: light rubs are cosmetic, real hits (above a
relative-speed threshold) knock cars back scaled by mass and trigger mode
effects. Respawning asks the server for a safe slot (scored by distance to
enemies), grants a ~2 s green protection bubble that pops if you attack, and
races put you back at your last safe pose instead of three rooms away.
=======
- ⚽ **RC Soccer** — a huge ping pong ball and two doorway goals
- 👑 **Last Car Standing** — Facilities locks the office down room by room
  (telegraphed, then a red zap field). Escape the closures, survive the
  double-rate office events, outlive everyone. Eliminated players get a
  drone spectator cam (click/space to switch targets).
- 🌍 **Open Office** — open-world free roam: ten minutes, no rules, style
  points for drifting, air time and mayhem. The whole map is a playground.
- 🏆 **Office Cup** — three random modes back-to-back with cumulative
  score, rolling straight from round to round, grand ceremony at the end.

Roughly one round in three gets a **mutator**, announced up front: Moon
Gravity, Giant Ball, Mug Rain or Tiny Cars. Each car also carries a
signature **ability** on `Q`: the buggy pounces, the Drift King enters a
perfect 3-second Overdrift, the Micro Monster goes 2 seconds unstoppable,
the Formula opens its DRS wing, and the Office Hatch photocopies whatever
ability was used last.
>>>>>>> origin/claude/tiny-rc-mayhem-dsi2u0

Every minute an **office event** hits: lights out, earthquake, printer paper
storm, AC hurricane, server overload, or the cleaning robot on patrol.
Powerup pads hand out EMPs, rockets, oil spills, shrink rays, bubble shields,
position swaps, spring jumps… and the occasional fake powerup. The odds are
Mario-Kart-honest: the leader draws from a weak defensive pool while the back
of the pack draws catch-up tools.

Progression pays out in gear: hats, antennas and trails unlock with XP and
are equipped in the garage — everyone in the lobby sees them (bots dress up
too). Each car has its own synthesized engine voice. Collisions feed a
rivalry tracker and the podium calls out your nemesis, and going over the
balcony railing earns you a scream and a seagull's-eye kill-cam.

The chaos is shared: when you punt a mug across the kitchen, everyone's
kitchen gets the mug punted (prop impulses relay through the server and
each client mirrors them). The office also fights back — the copier
periodically blasts blinding paper at passers-by, ramming the kitchen
vending machine drops cans (sometimes a golden one: free powerup), and the
sprinkler-test event soaks every floor.

## The office

One handcrafted 42×24 m floor, thirteen rooms, no loading screens:
reception → storage (box fort) → cafeteria (drive the kitchen countertop) →
games corner (foosball table, basketball hoop) → meeting room → CEO suite →
lounge → an S-curve through the open office's desk pods → focus booths →
bathroom (toilet-paper rolls roam free) → server-rack slalom → printer nook
→ balcony terrace (in the rain, with planters, benches and a railing low
enough to be shoved over). Walls are generated from door-gap "wall runs" so
every room connects into one flowing circuit. Cars are 18 cm long: a desk
is a mountain you climb via book-ramps, monitors sit properly on their
stands until you ram them, and you can drive *under* the furniture the big
people use.

## Architecture

```
shared/   world scale & physics constants, car/powerup/mode definitions,
          and the full map layout — single source of truth for both sides
server/   Node + ws authoritative server: lobby/flow, scoring, powerups,
          office events, soccer ball simulation, bots, hit validation
client/   React 19 + Vite + react-three-fiber + drei + Rapier + zustand
          + postprocessing (N8AO, bloom, vignette, SMAA, ACES)
```

- Clients simulate their own car (raycast suspension over a rigid body,
  forces applied per **physics step** so handling is framerate-independent)
  and stream transforms at 20 Hz. Speed and spin are hard-capped, downforce
  scales with speed, and most of the mass rides in a low ballast collider so
  cars slide before they roll.
- The server is authoritative for everything that matters: match flow, all
  scoring, powerup pads and effects, the soccer ball (integrated server-side
  against the shared map geometry), bots, rub-vs-hit bump classification,
  respawn placement + spawn protection, and anti-teleport checks on reported
  positions.
- Remote cars render through a 120 ms interpolation buffer and are kinematic
  colliders locally, so you physically bounce off your friends — and your own
  knockback applies at the moment of contact instead of a round-trip later.
- Snapshots go over the wire as quantized **binary frames** (~4× smaller than
  the old JSON): 1 cm positions, 0.001 quaternions, per-mode sections.
- Chairs, boxes, basketballs and marbles broadcast best-effort **nudge
  events** when you plow through them, so everyone sees roughly the same
  office chaos; the rest of the clutter stays local set dressing.
- Everything is procedural — materials, textures, the skyline, the audio
  (synthesized motors, skids, glass and rain via WebAudio). Zero asset files,
  zero external requests.

## Testing

`scratch` scripts used during development exercise the full ws protocol
(join → vote → ready → countdown → checkpoints, pickups, bumps, teleport
rejection, disconnects) plus headless-browser runs of the real client.
Useful envs: `PORT` (default 8080), `RC_MATCH_SECONDS` (shorten matches).
