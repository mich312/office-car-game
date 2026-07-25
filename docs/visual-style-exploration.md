# Visual style exploration — what Tiny RC Mayhem could look like

Research pass, not an implementation. The goal is to name the art directions
that are actually available to a browser game with zero external assets, say
which ones real games have proven out, and cost each one against this codebase.

Companion visual board: `docs/style-board.html` (open it, or the published
artifact) renders the same office-floor scene under six of these treatments.

---

## 1. Where the look is today

An honest audit before shopping for a new one.

| Layer | What it does now | File |
| --- | --- | --- |
| Cars | `MeshToonMaterial` + 3-step ramp, inverted-hull backface outline at 1.06 scale | `client/src/game/CarModel.jsx:92`, `:103`, `:1096` |
| Paint finishes | toon gloss, but matte/flake/pearl switch to `MeshStandard`/`MeshPhysical` | `client/src/game/CarModel.jsx:124` |
| Office | ~163 material declarations across 9 files, nearly all `meshStandardMaterial` | `client/src/game/Office.jsx`, `Props.jsx`, `ModeObjects.jsx` |
| Surfaces | procedural canvas textures — carpet noise, wood grain, tile, concrete | `client/src/game/textures.js` |
| Light | procedural HDR env + sun + hemi + 6 warm point lights + day/night lerp | `client/src/game/Lighting.jsx` |
| Post | N8AO → Bloom → SpeedFX → Vignette → SMAA → **ACES Filmic** | `client/src/game/Effects.jsx` |
| Camera | perspective, `fov: 60` | `client/src/game/Game.jsx:63` |
| UI | "After Hours, Inc." — night-office ink, desk-lamp amber, Barlow Condensed | `client/src/ui/tokens.css` |

**Three findings.**

1. **There are two art directions in one frame.** Toon-shaded, ink-outlined toy
   cars drive through a physically-shaded office. Neither is wrong; together
   they read as a work in progress rather than a choice. Every direction below
   is really a proposal for which side wins.
2. **The render never says the cars are 18 cm.** Scale is asserted by geometry
   (a mug is car-height) and never by the *camera*. Real toy-scale games sell
   the illusion optically — shallow focus, low camera, macro cues. This is the
   single biggest gap, and it is orthogonal to style: every direction below
   gets better when it's fixed.
3. **The post chain is the three.js house style.** N8AO + bloom + ACES is what
   a well-built R3F scene looks like by default. It is good and it is generic —
   ACES in particular desaturates the amber/teal palette the UI is built on.

The toon cars are an asset, not a liability. Directions that throw them away
start from behind.

---

## 2. The reference survey

Nine families that indie games actually ship. For each: who proved it, what
the trick really is, and what it would cost *here*.

### A. Toy-plastic realism
> Hot Wheels Unleashed · Lego 2K Drive · Micro Machines World Series · Astro Bot

PBR, but every material is *injection-moulded plastic*: high specular, low
roughness variance, visible mould seams, sprue nubs, sticker decals with edges
that catch light. Hot Wheels Unleashed (Milestone, UE4) built its whole
identity on "doubling down on the toy aesthetic" — track pieces are orange
plastic track pieces, and the environments are rooms a kid would play in.

*Here:* the office is already PBR, so this is a materials pass, not a rewrite —
raise `metalness`/lower `roughness` on car parts, add a seam line, keep the
world matte so the toys pop against it. Cheap. Risk: the closest thing to the
current look, so it fixes finding #1 by surrendering the toon cars.

### B. Tilt-shift diorama / macro
> Cities: Skylines · The Wonderful 101 · Tinykin · Moving Out · It Takes Two

Miniature faking: shallow depth of field progressively blurred away from a
focal band makes a full-size scene read as a scale model. It is the oldest
trick in miniature photography and it works in engines for exactly the same
reason — the eye reads *blur gradient* as *proximity*, and proximity as
*small*. Tinykin adds the other half: a tiny protagonist in a human house,
where matchboxes are beds and corks are barstools — the props do the storytelling.

*Here:* this is the direct answer to finding #2, and this game already has
Tinykin's prop vocabulary (mugs as ramps, keyboards as bridges). `TiltShift` /
`DepthOfField` ship in `postprocessing` v6, already a dependency. Add a lower
`fov` (35–45) with the camera pulled back — long lenses compress and read as
macro. Cost: one post pass; the DOF is the only real GPU spend, and it can be
gated behind the existing `?lowfx` path.

### C. Minimal flat low-poly
> art of rally · Absolute Drift · Grand Mountain Adventure · (The Witness, upstream)

Funselektor's line: start from stark minimal colour (Absolute Drift's
Mirror's-Edge-like palette), then take *The Witness* as the turning point —
stylised vegetation, flatter colouring, smooth forms, and let high-quality
lighting and post do the heavy lifting over deliberately cheap geometry. The
result photographs beautifully and runs on anything.

*Here:* the office is hand-built from primitives already — it *is* low-poly.
What's missing is the palette discipline: flatten the procedural textures to
flat colour blocks, cut material count hard, let light describe form. Very
cheap, high risk of looking like every other low-poly asset pack unless the
palette is genuinely authored.

### D. Cel-shaded ink and comic
> Jet Set Radio · Borderlands · Hi-Fi Rush · Sable · Spider-Verse halftone

Flat colour ramps, hard terminator, ink lines from edge detection on the
depth+normal buffers, screen-space halftone or hatching for shadow. Halftone
is a print technique — a grid of same-colour dots of varying size — now
standard vocabulary for "stylised" and well-documented in three.js.

*Here:* the **cheapest of all directions**, and the one that unifies the frame
by promoting the cars' existing language to the whole world. `MeshToonMaterial`
is *less* expensive than `MeshStandard`; an edge-detect pass is one fullscreen
draw. The catch is authorial: thirteen rooms of office clutter drawn flat turns
to mush without ruthless value control — flat shading removes the shading cues
that currently separate a chair from the carpet behind it.

### E. Handmade / craft materials
> Tearaway · Paper Mario · Kirby's Epic Yarn · Harold Halibut · Lil Gator Game

The world is made of a real physical substance — paper, felt, clay, cardboard —
and obeys it: paper creases and tears, clay keeps thumbprints, felt has fuzz
along every silhouette. Enormously charming, and a perfect thematic fit for a
game about toys in an office (cardboard box forts already exist in Storage).

*Here:* the expensive one. Craft looks live in texture detail — fibre normals,
fuzz cards, crease maps — and this project's hard constraint is *zero external
assets*, with every texture drawn in a 128px canvas. A convincing felt or clay
pass means writing a lot of procedural texture code. Best used as a *partial*:
one craft material (cardboard) applied to one prop family.

### F. Lo-fi / PS1 retro
> Crow Country · Signalis · Alisa · DERELIKT · most of indie horror since 2023

Render to a small buffer (320×240–640×480) and upscale with nearest-neighbour;
snap vertices to a coarse grid for the wobble; affine texture mapping for the
warp; ordered dithering to fake colours the palette doesn't have. The trend is
several years old and now crowded — the counter-argument is well aired too
("a lot of the PS1-inspired indie games look quite bad") because the aesthetic
is often adopted as a filter rather than a design.

*Here:* thematically strong — an RC car in a 1997 office wants a 1997 render,
and it is by far the most distinctive Steam-page thumbnail. Technically easy
(a low-res render target + a dither shader). But it directly fights the game's
core need: **twelve tiny cars must stay readable in a chaotic frame**, and
dither noise plus 480p is the enemy of that. A mode, a photo-mode filter, or a
retro cabinet in the games corner — not the house style.

### G. Painterly / watercolour
> Sable · Eastward · Codrops' "Susurrus" three.js watercolour world · Kuwahara filters

Kuwahara post-filters flatten photographic gradients into brush-like patches;
paper-grain multiply and edge-darkening finish the illusion. Genuinely
beautiful in a slow game.

*Here:* wrong genre. A painterly filter smears exactly the high-frequency
detail — car silhouettes at speed — the game depends on, and Kuwahara is a
comparatively heavy per-pixel pass to run at 60 fps with 12 cars simulating.
Park it; consider it for **photo mode only**, where it costs nothing and the
screenshots are the marketing.

### H. After-dark neon
> Rocket League · Trackmania night tracks · Neon White

Dark ground, saturated emissive everything, heavy bloom, light trails as the
primary readability channel. The frame is mostly black so the gameplay-relevant
objects are the only lit things — which is why it is so readable in team games.

*Here:* the UI **already committed to this** — `tokens.css` is a night-office
palette with a desk-lamp amber accent, and the game has a night mode, underglow
in six colours, and trails. The 3D just hasn't followed. Making night the
default rather than a toggle would align product, UI and render in one move,
and readability comes almost free (lit car vs. dark office). Risk: an office is
supposed to be a *mundane* place; over-neon it and you lose the joke.

### I. Diegetic technical drawing
> Mini Motorways minimalism · blueprint/CAD conventions · the game's own whiteboards

The office rendered as facilities documentation: desaturated grey-blue solids,
cyan hairline edges, dimension ticks, room labels in plan-view type. The game
already has whiteboards, a clipboard, a setup sheet and marker-drawn UI, so the
vocabulary is established in-fiction.

*Here:* very cheap (edge pass + palette clamp) and unusually distinctive — but
it is a *sequence* look, not a 40-minute look. Best as the map screen, the
Last Car Standing lockdown overlay, the spectator drone cam, or the loading state.

---

## 3. The filter: what this game actually needs

Constraints that eliminate otherwise-good directions:

- **Twelve cars, physics chaos, 60 fps in a browser** on integrated GPUs, with
  `?lowfx` as the escape hatch. Style must survive being turned down.
- **Zero external assets.** Everything is procedural canvas or shader work.
  This *favours* directions that come from shading, palette and post — and
  penalises directions that live in texture craft (E, and half of A).
- **Readability is a mechanic.** Players must find their own car, read another
  car's rotation to predict a hit, and tell thirteen rooms apart at a glance.
  Any direction that lowers local contrast (F, G) is fighting the game.
- **The UI is already committed** to "After Hours, Inc.". Directions that agree
  with it (D, H, I) get a coherent product for free; directions that don't (F,
  G) leave a well-built UI stranded on top of a mismatched world.

---

## 4. Four directions worth prototyping

### 1. Tabletop After Dark — *toy diorama, macro camera* (recommended)
B + H, with A's plastic materials. Keep physically-based shading, but make the
**camera** admit these are toys: 35–45° fov pulled back, a tilt-shift focal band
locked to the car, dust motes at scale, warm practical pools from desk lamps
against a dark open-plan floor. Night becomes the default; day becomes the
variant.

- *Why:* fixes finding #2 (the missing scale cue) directly, agrees with the UI,
  and needs no material rewrite — it is camera + light + post.
- *Touches:* `Effects.jsx` (add `TiltShift`/`DepthOfField`, retune bloom),
  `Game.jsx:63` (fov), `Lighting.jsx` (night-default targets), `Effects.jsx`
  tone mapping.
- *Cost:* one post pass. **Days, not weeks.** Lowest risk of the four.

### 2. Ink & Fluoro — *unify on the cars' language*
D, taken all the way. Toon-ramp the office, add a depth/normal edge pass so
everything gets the ink line the cars already have, flatten to authored
palettes with one hue per room, drop ACES for a neutral curve that keeps the
saturation.

- *Why:* resolves finding #1 the other way — the toy cars stop being visitors.
  Cheapest per-frame of all four (`MeshToon` < `MeshStandard`).
- *Touches:* a material shim behind the ~163 inline material sites, an outline
  effect in `Effects.jsx`, a palette module, `textures.js` flattened.
- *Cost:* the material-site refactor is the real work. **Highest ceiling,
  highest authoring burden** — flat shading demands deliberate value control.

### 3. Facilities Plan — *blueprint nights*
I as a full direction. Grey-blue solids, cyan hairlines, amber cars as the only
saturated things in frame.

- *Why:* strikingly original, dirt cheap, and readability is trivially solved
  (one saturated hue against a monochrome world).
- *Cost:* one edge pass + palette clamp. **Cheapest to build, hardest to
  live in** — likely lands as a mode overlay rather than the house style.

### 4. Rec Room '97 — *lo-fi RC nostalgia*
F. 480p buffer, ordered dither, vertex jitter, chunky HUD.

- *Why:* the best thumbnail, the strongest single hook, the most on-theme joke.
- *Cost:* low-res render target + dither shader. **Fun to build, actively
  harmful to twelve-player readability.** Ship it as a toggle and a photo-mode
  filter, not as the default.

Parked with reasons: **E (craft)** — asset-hungry against the zero-asset rule;
**G (painterly)** — smears the silhouettes the game reads; **C (flat low-poly)** —
not wrong, but it is where the project already sits by accident, so choosing it
is choosing not to choose.

---

## 5. Wins that apply whichever direction wins

These are worth doing before the style question is even settled:

1. **Reconsider ACES.** `ToneMappingMode.ACES_FILMIC` (`Effects.jsx:14`) rolls
   off saturation hard — it is a film-emulation curve on a cartoon. `AGX` or
   `NEUTRAL` keeps the amber/teal the UI is built from.
2. **Depth of field, at all.** Even a static shallow band is the cheapest
   "these are 18 cm cars" signal available.
3. **Lower the fov.** 60° is a wide lens; wide lenses read as human-scale.
4. **Colour-code the thirteen rooms.** One hue per room does more for
   navigation than any amount of shading, and it survives every direction.
5. **Rim light every car** in its player colour. Twelve-car readability in one
   line of shader.
6. **Photo mode is the style lab.** `P` already exists — the expensive filters
   (Kuwahara, dither, halftone) can all live there at zero gameplay cost, which
   also makes them cheap to A/B.

---

## 6. How to prototype without committing

The material sites are inline JSX across nine files, so a full style-swap
architecture is a real refactor. Sequence it so the cheap evidence comes first:

- **Phase 0 — no refactor.** A `?style=` URL flag that only drives `Effects.jsx`
  config, `Lighting.jsx` targets, tone mapping and camera fov. That alone
  distinguishes directions 1, 3 and 4 well enough to judge them.
- **Phase 1 — palette module.** Hoist the hardcoded hexes into a per-style
  palette, since every direction wants different colours out of the same
  geometry.
- **Phase 2 — material shim.** Only if Ink & Fluoro (direction 2) wins: replace
  the ~163 `<meshStandardMaterial>` sites with a `<Surface>` component that
  resolves material type from the active style.

---

## References

- [art of rally interview — art style and development, Funselektor](https://gamingbolt.com/art-of-rally-interview-art-style-development-and-more)
- [Miniature faking / tilt-shift, Wikipedia](https://en.wikipedia.org/wiki/Miniature_faking)
- [Video games with a tilt-shift or "miniature toy" aesthetic, ResetEra](https://www.resetera.com/threads/what-are-some-video-games-with-a-tilt-shift-or-miniature-toy-aesthetic.964152/)
- [Hot Wheels Unleashed — Milestone interview on influences](https://gamerant.com/hot-wheels-unleashed-interview-milestone-influence-development-crossovers/)
- [Halftone shading in three.js — Three.js Journey](https://threejs-journey.com/lessons/halftone-shading-shaders)
- [three.js RGB halftone post-processing example](https://threejs.org/examples/webgl_postprocessing_rgb_halftone.html)
- [On crafting painterly shaders — Maxime Heckel](https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders/)
- [Susurrus: a cozy watercolour world with three.js and shaders — Codrops](https://tympanus.net/codrops/2026/04/24/susurrus-crafting-a-cozy-watercolor-world-with-three-js-and-shaders/)
- [Sketchy pencil effect with three.js post-processing — Codrops](https://tympanus.net/codrops/2022/11/29/sketchy-pencil-effect-with-three-js-post-processing/)
- [Why low-poly works so well for horror — indie devs, GamesRadar](https://www.gamesradar.com/games/survival-horror/indie-devs-discuss-why-low-poly-works-so-well-for-horror-i-actually-think-those-limitations-encourage-weird-unique-compromises/)
- [How indie horror games are bringing back retro grime — Rolling Stone](https://www.rollingstone.com/culture/rs-gaming/horror-game-renaissance-playstation-retro-1235134578/)
- [Small-scale games: 16 intimate videogame worlds — AV Club](https://www.avclub.com/small-scale-games)
