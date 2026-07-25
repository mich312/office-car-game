# Graphics update — directions, cheap first

> **Status.** Bundles 1 and 2 have shipped — §A, §B and §E are done and
> measured (see §4a). §C, §D, §F, §G and the §H identity fork are still open.

Scope: how the game *looks*. Shading, lighting, post. Written against the
renderer as it stands (`client/src/game/Lighting.jsx`, `Effects.jsx`,
`SpeedFX.jsx`, `Office.jsx`, `CarModel.jsx`, `textures.js`) and against a
measured frame, not a vibe.

Everything here keeps the two project rules: **zero asset files** and **no
regression on the `?lowfx` path**. "Cheap" in this doc means a specific thing,
defined in §3: it does not add draw calls.

---

## 1. Measured baseline

Numbers from a real match (Chromium, 1280×720, `dpr` capped at 1.5, one human
+ bots, counters read out of the existing `window.__glStats` hook in
`Game.jsx`):

| Path | Draw calls / frame | Triangles / frame |
|------|-------------------:|------------------:|
| `?lowfx` (no shadows, no post) — scene pass only | **783** | 45 066 |
| Full (shadow pass + N8AO + bloom + post) | **1 285** | 68 684 |
| Full, night | 1 309 | 71 084 |

Read that as:

- The **scene costs ~780 draw calls** to put 45 k triangles on screen. That is
  ~17 triangles per draw call. The office is 13 rooms, 61 walls, 76 furniture
  pieces and **145 physics props** (21 chairs, 14 mugs, 13 boxes, 12 pens…),
  and almost every one of them is a little `<group>` of 3–12 separate meshes.
- The **shadow pass costs ~500 more draw calls** and redraws 23 k triangles.
  It is the single most expensive thing in the frame and nobody is looking at
  it directly.
- Triangle count is a rounding error. 68 k triangles is roughly one
  mid-2000s character model. There is no vertex or geometry pressure here at
  all.

## 2. What the frames actually show

Four screenshots, day and night, in-game and `?lowfx`:

- **Day is the weak one.** The kitchen tile floor — the largest thing on
  screen — renders as near-white paper. `roughness: 0.25, envMapIntensity: 0.8`
  should be catching the room, but the `Environment` is authored at
  `resolution={64}`, so every reflection in the game is a 64 px mush. There is
  no specular event anywhere in the frame. The only shape cue in the whole day
  image is one hard diagonal sun-shadow edge.
- **Night is dramatically better** and it is doing it with the cheapest tools
  in the file: the additive floor pools from `LightPools`, the headlight cone,
  the emissive strips. This is the strongest evidence in the doc that the win
  is in light *effects*, not light *count*.
- **The car disappears at night.** A dark-blue toon shell against a dark floor,
  with taillights too dim to separate it. The one thing the player must always
  read is the least readable object in the frame.
- **`?lowfx` is flat white.** N8AO and the shadow pass are carrying essentially
  all of the depth perception. Whatever ships must survive their absence, so
  every direction below is gated on a `LOWFX` check or is post-only.
- **Only the cars have outlines.** The inverted hull in `CarModel.jsx` reads
  beautifully — and it reads *because* nothing else in the world has one. The
  cars look drawn and the office looks rendered. That mismatch is either a bug
  or a whole art direction, depending on which way you resolve it (§H).

## 3. The budget rule

> **Draw calls are the constraint. Fragments are nearly free.**

780 scene draws against 45 k triangles is a CPU-bound submit profile with a GPU
sitting idle. That inverts the usual advice and gives a clean rule for this
project:

- **Cheap**: anything that changes an existing material's shader, anything that
  happens in a post pass, anything that reuses a material already bound.
- **Expensive**: a new mesh per object, a new light, a new render target the
  scene must be re-drawn into (planar reflections, real volumetrics, a second
  shadow cascade).

Every direction below is priced against that rule, not against "how fancy does
it sound".

A second, free budget line: the post stack currently runs `N8AO` → `Bloom` →
`SpeedFX` → `Vignette` → `SMAA` → `ToneMapping`. In `postprocessing`, plain
`Effect`s get **merged into one `EffectPass`** — only convolution effects
(bloom) get their own. `SpeedFX`/`Vignette`/`SMAA`/`ToneMapping` are already
sharing a shader. **Adding another `Effect` to that group costs a few ALU ops
in a pass that is already running, not a new pass.** That is where the look
budget should be spent.

---

## A. Free wins that are already-existing numbers — **[shipped]**

Half an hour, no new code, meaningful.

| Change | Where | Why |
|--------|-------|-----|
| `Environment resolution={64}` → `256` | `Lighting.jsx:44` | Every glass wall, tile floor, chrome bar, metal-flake and pearl paint job in the game reflects a 64 px cubemap today. `frames={1}` means this is a **one-time** render at load — the per-frame cost is exactly zero. This is the highest quality-per-character edit in the codebase. |
| `<EffectComposer frameBufferType={HalfFloatType}>` | `Effects.jsx:8` | The composer runs in 8-bit LDR. Night scenes band, and bloom keys off clipped whites instead of real highlights. Costs bandwidth, not draw calls. |
| `Bloom luminanceThreshold 0.82` → ~`0.6`, `intensity` down to ~`0.4` | `Effects.jsx:10` | Emissives in this game are already `toneMapped={false}` and above 1.0 (headlights at 3.5–4, ceiling panels at 2.2). A lower threshold with less gain makes the *right* things glow instead of everything bright. |
| `N8AO aoRadius={2.2}` → ~`0.9` | `Effects.jsx:9` | `M ≈ 4.44` units/metre, so 2.2 units is a **50 cm** AO radius — half a metre of ambient darkening in a world where the cars are 22 cm long. A tighter radius gives contact darkening under wheels, mugs and chair castors, which is exactly the "small object sitting on a real surface" cue the game wants. |

Nothing here is a direction so much as a debt payment. Do it first so the
directions below are evaluated against a fair baseline.

**What shipping it taught us:** the bloom threshold could not simply stay
where it was. Under the old LDR buffer every value was clipped at 1.0, so a
threshold of 0.82 was a threshold *within the clipped range*. With an HDR
buffer, lit surfaces sit above 1.0 too, and the first attempt (`0.6`) veiled
the whole frame in milk — the white kitchen floor bloomed as hard as the
lamps. It landed at `1.05`: above what a fully lit white floor reaches, below
the emissives. The lesson generalises to §D — **switching to HDR silently
rescales every threshold in the post stack**, so re-tune them together, and
look at a bright frame, not just a dark one.

The garage (`Menu.jsx`) got the same environment bump. It is where players
inspect metal flake and pearl coat at arm's length, so it wanted it more than
the office did.

---

## B. Make the shadow box follow the car — **[shipped]**

**Cost: ~2 h. Measured at −17% draw calls and −17% triangles, 1.75× sharper.**

The sun's shadow camera is `[-105, 105, 75, -75]` — a 210 × 150 unit box, i.e.
47 × 34 metres, covering the entire office. At `2048²` that is **2.3 cm per
texel**, a tenth of a car length. Car shadows are blobs, and every static desk
in the building is re-drawn into the map every frame.

Shrink the box to ~60 units centred on the player and it becomes 0.65 cm per
texel — and the ortho frustum culls most of the office out of the shadow pass,
which is where the draw-call saving comes from.

As shipped it centres on **the floor point the camera is aimed at**, not on the
local car. That was the one design change against the original sketch, and it
matters: centring on `telemetry` breaks the moment the player is dead and
watching the spectator drone, or parked in the photo orbit. Centring on the
camera's own aim works for all three cameras without any of them knowing the
shadow rig exists.

The other thing the sketch missed: **texel snapping**. A box that slides
continuously resamples the shadow map every frame and the edges visibly crawl.
Quantising the box centre to shadow-map texels fixes it for three lines, and it
is not optional — without it this direction is a downgrade in motion even
though every still frame looks better.

The knob is `SHADOW_HALF`, shipped at 60. Smaller is sharper and cheaper, but
geometry outside the box stops casting; 60 covers ~75 units ahead of the chase
cam, past every sightline the office's walls actually leave open. This is the
inherent single-cascade trade — range for sharpness — and at 22 cm car scale
the shadows worth having are the contact ones.

Two variants worth prototyping side by side:

1. **Follow box, every frame** — as above. Simple, sharp, saves calls.
2. **Static map + blob shadows** — the office never moves. Render the static
   shadow map *once* (`sun.shadow.autoUpdate = false`, flip `needsUpdate` on
   the day/night transition and on `lights_out`), and give cars a single
   **instanced** blob-shadow quad — one draw call for the whole grid. This is
   the cheapest possible shadowing and it is period-correct for a toy look.

Variant 1 shipped. Variant 2 is still the bigger prize and is now the obvious
`?lowfx` shadow path, which currently has none at all.

---

## C. Post-process outlines instead of inverted hulls

**Cost: ~0.5–1 d. Removes a draw call per car and gives the whole world what
only the cars have today.**

`OUTLINE_MAT` (`CarModel.jsx:103`) is a backface-only hull — one extra draw per
car, and it can only ever outline cars. A depth-based edge pass in the existing
merged `EffectPass` outlines *everything*, for a Sobel's worth of ALU:

```glsl
// declare EffectAttribute.DEPTH so mainImage receives linear depth
void mainImage(const in vec4 inputColor, const in vec2 uv,
               const in float depth, out vec4 outputColor) {
  vec2 t = 1.0 / resolution;
  float d  = depth;
  float dx = abs(readDepth(uv + vec2(t.x, 0.0)) - readDepth(uv - vec2(t.x, 0.0)));
  float dy = abs(readDepth(uv + vec2(0.0, t.y)) - readDepth(uv - vec2(0.0, t.y)));
  // scale by depth so far-off props don't turn into a hairball
  float edge = smoothstep(0.002, 0.006, (dx + dy) / max(d, 0.001));
  outputColor = vec4(mix(inputColor.rgb, vec3(0.043, 0.047, 0.071), edge * uOutline), inputColor.a);
}
```

Honest caveats, because this is the direction most likely to disappoint:

- Depth-only edges miss **creases at equal depth** (a desk against a wall
  behind it at the same distance). Reconstructing a normal from depth
  derivatives (`normalize(cross(dFdx(vp), dFdy(vp)))`) fixes it for another ten
  lines and catches convex corners properly.
- 145 small props at distance will alias into noise without the depth-scaled
  falloff above. Tune with a hard distance cutoff, not with thickness alone.
- Keep the inverted hull as the `?lowfx` fallback — it is the only outline that
  survives with post disabled, and cars are the thing that must stay readable.

The payoff is that the office stops being "rendered" and starts being "drawn",
which is the single largest identity change available for under a day.

---

## D. One merged grade + height fog

**Cost: ~0.5 d. Biggest look-per-line change in the doc.**

There is no colour grading. `ACES_FILMIC` and a heavy `Vignette` at
`darkness 0.72` are doing all the mood work, and the day frame proves they are
not enough. A grade `Effect` slots into the *already-running* merged pass:

```glsl
uniform vec3 uLift, uGain;    // lerped day → night → lights_out, like Lighting.jsx does
uniform float uSat, uFogK;
uniform vec3 uFogCol;

void mainImage(const in vec4 inputColor, const in vec2 uv,
               const in float depth, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  // split-tone: cool the shadows, warm the highlights — the whole "graded" look
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c * uLift, c * uGain, smoothstep(0.15, 0.75, l));
  c = mix(vec3(l), c, uSat);
  // height/distance fog from depth — sells "this room is enormous" at 22 cm scale
  c = mix(c, uFogCol, 1.0 - exp(-depth * depth * uFogK));
  outputColor = vec4(c, inputColor.a);
}
```

Two things this unlocks that the current stack cannot express:

- **Day and night become different films**, not different light intensities.
  Warm-highlight/cool-shadow by day, teal-shadow/sodium-highlight at night,
  desaturated-and-crushed during `lights_out`. Drive the uniforms off the same
  `useStore` state and the same `lerp` that `Lighting.jsx:27` already runs.
- **Per-event grades for free.** `server_overload` goes green-tinted,
  `sprinklers` goes cold and desaturated, a boost pushes saturation up 15 %.
  Each is two uniform writes in `OfficeEvents.jsx`, not a new effect.

The depth fog also replaces the scene `<fog>` in `Game.jsx:63` for anything
that needs to *not* be fogged — `Outside`'s skyline currently opts out with
`fog={false}` on the material, which is a workaround this removes.

---

## E. Rim light on the cars — **[shipped]**

**Cost: ~2 h. Fixes the readability problem in the night frame. Zero draw calls.**

A fresnel term added to the paint material makes the car's silhouette catch a
light that does not exist:

```js
// CarModel.jsx — paintMat(), after constructing the material
mat.onBeforeCompile = (s) => {
  s.uniforms.uRim = rimUniform;                    // shared: {value: new Color()}
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
    .replace('#include <opaque_fragment>', `
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
      outgoingLight += uRim * rim;
      #include <opaque_fragment>`);
};
```

Tint `uRim` cool at night, warm by day, and flash it to the boost colour while
`telemetry.boosting` — the boost then reads on the *car* as well as on the
screen edges, which `SpeedFX.jsx` currently handles alone. Same trick applies
to the toon material; `MeshToonMaterial` compiles from the same chunk names.

Shipped on both painted materials (body and trim), so a two-tone car rims in
both colours, and on every finish — `withRim()` wraps the toon, standard and
physical branches of `paintMat()` alike. The uniform is per material, held on
`material.userData.rim`, and the car's existing frame loop lerps it. The boost
tint made it in: `boostingRef` already reaches `CarModel`, so a boost now reads
on the car as well as at the screen edges, where `SpeedFX` had it alone.

While in there: the taillights were at `emissiveIntensity 1.2` against
headlights at 3.5, so they never bloomed. Now `dark ? 3 : 1.4` — brake lights
that bloom are the cheapest "the car in front of me is right there" signal in a
party racer, and with §A's HDR buffer they finally key the threshold.

---

## F. Light effects that are quads, not lights

**Cost: 1 d for the whole menu, pick and mix. A few draws each.**

`Lighting.jsx:65` already says it: *"Light count is the #1 fragment cost, so
keep this list short."* Right call — so buy the *effects* of light without the
lights. `LightPools` and `LightShafts` in `Office.jsx` are already this pattern
and they are the best-looking thing in the night frame. Extend it:

- **Fixture cones at night.** `shaftTex()` already exists and is already used
  for window shafts. Six downward cone cards under the six ceiling fixtures,
  additive, `depthWrite: false`, opacity driven by the same `night`/`lightsOut`
  lerp. ~6 draws, shares one material.
- **Headlight cone + floor pool per car.** Two quads. Instance the pool across
  the grid so twelve cars cost one draw. At night this is what makes a pack of
  cars read as a pack.
- **Fixture flicker.** One fixture per match (seeded, so everyone sees the
  same one) buzzes and stutters. Modulate one `pointLight.intensity` and its
  pool opacity — zero new objects, enormous atmosphere per line. Pairs with the
  existing `lights_out` event.
- **Bounce tint.** Tint each floor pool toward the carpet colour of the room it
  is in (`roomAt()` is already imported in `Office.jsx`). Fakes one bounce of
  global illumination for the cost of a colour lookup at build time.
- **Emissive pulse on the racks and the vending machine.** `ServerLights`
  already blinks per-frame via `setColorAt`; give the server room a slow
  breathing glow that spikes during `server_overload`. Bloom does the rest.
- **Lightning.** A 200 ms directional spike plus a white flash uniform on the
  grade from §D, on a rare thunderstorm variant of the existing rain. Already
  on the roadmap as B3 — the grade uniform makes it a two-line addition rather
  than a feature.

---

## G. Surface language

**Cost: 1–2 d. Attacks the flat-white-floor problem directly.**

The floors and walls are single-map `MeshStandardMaterial`s with a constant
roughness. Everything below is generated from canvases that
`textures.js` is already drawing, so it stays asset-free and costs texture
fetches in a fragment shader that has capacity to spare:

- **Roughness maps for free.** The carpet canvas already draws 3 200 random
  specks; write the same noise to a second canvas and hand it to
  `roughnessMap`. Carpet gains directional sheen, tile gains smudge streaks,
  the kitchen gains a wet band near the sink. One extra texture per material,
  **no extra draw calls**.
- **Break the tiling.** The tile floor's repeating grid is visible in every
  screenshot — `tileTex` is 128 px repeated 14×. A second, very low-frequency
  multiply layer on rotated UVs (four lines in `onBeforeCompile`) hides the
  repeat without a bigger texture.
- **Ceiling panels shouldn't be identical.** `Ceiling`'s instanced panels all
  share one emissive. Per-instance colour jitter (`setColorAt`, already used by
  `ShelfBooks`) gives the ceiling the slightly-mismatched-tubes look every real
  office has. Free — same instanced mesh.
- **Wet floor / puddle sheen indoors** during the sprinkler event: reuse the
  existing balcony sheen plane (`Office.jsx:741`), which already proves the
  technique.

---

## H. The identity question — pick a lane

Two coherent looks are reachable from here. They are mutually exclusive and
they are the actual decision this exploration exists to surface.

### H1. Toy diorama (tilt-shift)
**Cost: ~1 d. One extra depth-driven blur in the existing pass.**

The game's premise is *tiny cars in a real office*. Miniature-faking is a
solved, one-pass problem: circle-of-confusion from depth, a cheap separable
blur, no bokeh needed at this scale. Combined with §D's grade and §A's tighter
AO, a tilt-shift band turns the office into a model of an office — which is
literally what it is. This is the highest identity-per-pass idea in the doc and
it costs one blur, not a render target the scene draws into twice.

Risk: tilt-shift fights gameplay readability if the band is too narrow or the
camera is low. Prototype with the band locked to the car's depth ± a generous
margin, and disable it entirely in spectator/photo cam.

### H2. Full toon world
**Cost: 2–3 d. Consistent, but it is a commitment.**

Resolve the mismatch from §2 the other way: push the *world* through the same
gradient ramp the cars use, via a shared `onBeforeCompile` patch on the
standard materials (the ramp texture is already a 4-step `DataTexture` in
`CarModel.jsx:95`). With §C's world outlines this becomes a cel-shaded office —
strong, and it makes the procedural-canvas textures look deliberate rather than
low-budget.

Risk: it throws away the metal-flake/pearl paint finishes and the glass, which
were just built and which the garage sells as a feature. Toon-shading a
`MeshPhysicalMaterial` clearcoat is a contradiction.

**Recommendation: H1.** It compounds with everything in §A–§F instead of
replacing it, it does not invalidate the paint finishes shipped last pass, and
it is a fifth of the work.

---

## 4. Suggested order

| Bundle | Contents | Effort | What the player notices |
|--------|----------|--------|------------------------|
| **1 — an afternoon** ✅ | §A (four numbers), §E (rim light + brake lights) | 0.5 d | Reflections exist; the car is readable at night |
| **2 — the budget** ✅ | §B (follow-box shadows) | 0.5 d | Sharp contact shadows, and 17% of the frame back in the bank |
| **3 — the look** | §D (grade + height fog), §F (cones, flicker, bounce tint) | 1.5 d | Day and night become different films; the office feels lit |
| **4 — the identity** | §H1 (tilt-shift), then §C (world outlines) | 2 d | It reads as a miniature |
| **5 — the surfaces** | §G | 1.5 d | The floor stops being paper |

Bundles 1 and 2 pay for 3–5: the shadow work returns more budget than the post
work spends.

## 4a. What bundles 1 and 2 actually cost

Measuring this needed a method note, because the obvious measurement lies.
Draw-call counts swing by ±20% between page loads — a different voted mode, a
different spawn, different props still alive — which is wide enough to swamp
the effect being measured. The first before/after comparison came out
*backwards* for exactly that reason.

The controlled version: one build, a temporary `?fixedsun` flag selecting the
old shadow rig, the mode pinned to Desk Dash by clicking the card, and `R`
pressed to normalise the spawn. Both legs then sample 14 frames from the same
world position and take the median. Only the shadow rig differs.

| Shadow rig (everything else identical) | Draw calls | Triangles |
|---|---:|---:|
| Fixed 210 × 150 box | 1 389 | 74 462 |
| Follows the camera, `SHADOW_HALF = 60` | **1 155** | **61 730** |
| | **−17%** | **−17%** |

The `?fixedsun` flag was scaffolding and has been removed; the procedure above
is the reproduction recipe. The `?lowfx` scene pass is unchanged at ~775 draw
calls, as it must be — none of bundle 1 or 2 touches it except the rim light,
which is a shader term rather than an object.

Two claims from §1–§3 survived contact and are worth keeping:

- **Fragment work really is free here.** The rim light, the HDR buffer and the
  tightened AO cost nothing measurable in draw calls, which was the whole
  premise of the budget rule.
- **The shadow pass really was the fat.** It is the only change that moved the
  numbers, and it moved them by more than the entire post stack costs.

## 5. Guardrails

- **Re-measure after every bundle**, and measure it the way §4a describes, not
  the way §1 does. `window.__glStats` in a live match and `window.__glInfo()`
  under `?lowfx` are the right counters, but a raw before/after across two page
  loads is noise: pin the mode, normalise the spawn, sample a dozen frames, take
  the median, and change one thing at a time. Any bundle that pushes the
  `?lowfx` scene pass above ~800 draw calls has spent budget it did not earn.
- **`?lowfx` must stay playable.** Post-only directions (§C, §D, §H1) vanish
  there by construction; §E and §G survive; §B needs its own low path (variant
  2's blob shadows are a good `?lowfx` default).
- **Everything stays procedural.** No LUT PNGs for §D — build the grade from
  uniforms. No baked normal maps for §G — derive them from the canvases that
  already exist.
- **The car is the thing you must always see.** Any grade, fog or blur is wrong
  if it costs contrast on the local car against the floor.

## 6. Explicit non-goals

- **Screen-space reflections / SSGI.** Both want a full depth-normal prepass and
  a lot of fragment work to look like anything. §A's sharper environment map
  gets 80 % of the visible benefit for zero frames.
- **Real volumetric lighting.** Ray-marched god rays are the classic answer to
  §F and the wrong one here — the additive cards already read correctly, and
  they cost six draws instead of a march.
- **More dynamic lights.** The file's own comment is right.
- **A deferred renderer.** The problem is 780 draw calls of tiny props, not
  lighting throughput.
- **Baked lightmaps.** They would look great and they are an asset pipeline,
  which is the one thing this project has never had.
