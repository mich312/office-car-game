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
| `B` / `Ctrl` | boost |
| `Space` | jump / double jump (+air control with WASD, flips give boost) |
| `E` / click | use powerup |
| `H` | horn (bumped bots honk back) |
| `1`–`8` | emote wheel |
| `R` | respawn |
| `Tab` | scoreboard |
| `N` | day / night |
| `P` | photo mode |
| `M` | mute |

Gamepads work out of the box (standard mapping): left stick / d-pad steers,
triggers are gas and brake, `A` jump, `B` boost, `X`/bumpers drift, `Y` item.
On phones and tablets, on-screen touch controls appear automatically and
auto-gas defaults on. An **auto-gas assist** toggle in the menu keeps the car
accelerating on its own for one-handed play. Tuck in behind a rival for ~2 seconds to charge a
**slipstream** burst, and watch the banner: office events telegraph
themselves 3 seconds before they hit.

## Game modes (lobby votes)

- 🏁 **Desk Dash** — 3 laps through all eight rooms, shortcuts everywhere
- ☕ **Coffee Run** — collect beans, deliver to the kitchen machine, bump rivals to make them spill
- 🔋 **Capture the Battery** — hold it to score, carrying slows you down, get hit and you drop it
- ⚽ **RC Soccer** — a huge ping pong ball and two doorway goals
- 👑 **Last Car Standing** — Facilities locks the office down room by room
  (telegraphed, then a red zap field). Escape the closures, survive the
  double-rate office events, outlive everyone. Eliminated players get a
  drone spectator cam (click/space to switch targets).

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

## The office

One handcrafted map, no loading screens: reception → open office → meeting
room → kitchen → printer room → server room → CEO office → balcony (in the
rain, with a railing low enough to be shoved over). Cars are 18 cm long: a
desk is a mountain you climb via book-ramps, and you can drive *under* the
furniture the big people use.

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
  and stream transforms at 20 Hz.
- The server is authoritative for everything that matters: match flow, all
  scoring, powerup pads and effects, the soccer ball (integrated server-side
  against the shared map geometry), bots, bump validation and anti-teleport
  checks on reported positions.
- Remote cars render through a 120 ms interpolation buffer and are kinematic
  colliders locally, so you physically bounce off your friends.
- Everything is procedural — materials, textures, the skyline, the audio
  (synthesized motors, skids, glass and rain via WebAudio). Zero asset files,
  zero external requests.

## Testing

`scratch` scripts used during development exercise the full ws protocol
(join → vote → ready → countdown → checkpoints, pickups, bumps, teleport
rejection, disconnects) plus headless-browser runs of the real client.
Useful envs: `PORT` (default 8080), `RC_MATCH_SECONDS` (shorten matches).
