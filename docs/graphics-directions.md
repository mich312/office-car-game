# Graphics update — directions, cheap first

> **Status.** Bundles 1 and 2 have shipped — §A, §B and §E are done and
> measured (see §4a). §C, §D, §F, §G and the §H identity fork are still open.
> §I–§M are a second, deeper pass: normal maps, faked depth, load-time
> lighting, and the draw-call problem the rest of the doc keeps working around.
> **§4b is the one to read first** — it measures frame *time* rather than
> counters, corrects two claims in §1 and §3, and ships automatic detection of
> software rasterisers (0.73 → 8.57 fps for the players on them).

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
  ⚠️ An earlier draft called this "the single most expensive thing in the
  frame". That was never measured — see §4b, where it turns out to be 2.4% of
  frame time under software rendering. These are counters, not costs.
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
>
> ⚠️ **Unverified on a GPU.** See §4b — every measurement behind this rule was
> taken on a software rasteriser, where the rule is demonstrably *inverted*.
> The counts are real; "the GPU is sitting idle" was an inference about
> hardware that was never present. Re-derive with timer queries before pricing
> more work against it.

780 scene draws against 45 k triangles looks like a submit-bound profile with a
GPU sitting idle. If that holds, it inverts the usual advice and gives a clean
rule for this project:

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

# Second pass — surfaces, fakery, and the draw-call problem

§A–§H were the cheap-first sweep. §I–§M are the deeper directions: what to do
about surfaces that have no relief at all, how to fake depth that isn't there,
how to get lighting that looks computed rather than declared, and — the one the
rest of this doc keeps stepping around — how to actually spend down the 780
draw calls.

A fact worth stating plainly, because it explains §2's flat-white floor better
than anything else in this document: **the project contains no `normalMap`, no
`roughnessMap`, no `aoMap`, no vertex colours, and no `bumpMap`.** Not one, in
any material, anywhere. Every surface in the game is albedo × lighting. That is
the whole finding.

---

## I. Normal maps — one helper, every surface

**Cost: ~0.5 d for the helper and the first four surfaces. Zero draw calls.**

The leverage is that `textures.js` funnels every texture in the game through a
single `canvasTex()`. One `normalFrom(canvas)` alongside it — a Sobel of the
drawing we already did, run once at load — and every material in the game can
opt into relief with one line.

```js
// textures.js — derive relief from the drawing we already did
function normalFrom(canvas, strength = 2) {
  const g = canvas.getContext('2d'), { width: w, height: h } = canvas;
  const src = g.getImageData(0, 0, w, h).data, out = new Uint8ClampedArray(w * h * 4);
  const lum = (x, y) => { const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
    const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out[i]     = (-dx / l * 0.5 + 0.5) * 255;
    out[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
    out[i + 2] = ( 1  / l * 0.5 + 0.5) * 255;
    out[i + 3] = 255;
  }
  // → DataTexture carrying the same wrap and repeat as its albedo
}
```

Carpet fibre, concrete aggregate, wood grain, tile grout, drywall orange-peel —
and the same pass gives §G its roughness maps, because a Sobel that knows where
the grout is also knows where the water would sit.

Three things that will bite:

- **Sobel-from-albedo confuses colour for height.** `tileTex` draws a white
  highlight rectangle that would come out as a bump. For the surfaces that
  matter, draw a second greyscale *height* canvas in the same draw function
  rather than inferring one. The drawing code is the cheapest code in the
  project; spend it.
- **The 61 walls are one instanced box, non-uniformly scaled.** Their UVs
  stretch per instance, so a normal map smears differently on every wall. Needs
  triplanar sampling or a per-instance UV-scale attribute. This is the detail
  that turns a two-hour job into a day if it arrives as a surprise.
- **Do not normal-map the toon cars.** The gradient ramp quantises `N·L`, so
  perturbing the normal yields banding noise rather than detail. The exception
  is thematically perfect: a high-frequency sparkle normal on **Metal Flake** is
  literally what flake is, and the backlogged Carbon Fibre finish is a weave
  normal map by definition.

For the large floor planes specifically, consider skipping the texture and
perturbing the normal with two octaves of value noise in `onBeforeCompile`:
costs ALU instead of bandwidth, and never tiles.

---

## J. Fake 3D

**Cost: 0.5–1 d each, independently shippable.**

### J1. Interior mapping on the skyline — the best wow-per-line in the doc
The city past the north glass is one flat `skylineTex` plane. Interior mapping
raytraces a box per window in the fragment shader, so every window in those
towers becomes a room with real parallax as you drive past. One material, one
plane, no new geometry, and the world outside stops being a poster taped over
the window. This is the single most "how did they do that" idea available here.

### J2. Parallax occlusion on the floors
A grazing-angle chase camera over a large flat surface is POM's ideal case, and
at 22 cm car scale, grout that is genuinely recessed sells "real floor, tiny
car" better than anything else on the list. See the fill-rate warning in §5 —
this is the one idea that could falsify the budget rule.

### J3. Parallax interiors for the machines
The vending machine currently models twelve individual can meshes behind its
glass. A parallax box behind one plane is 1 mesh and reads deeper. Same trick
for the fridge, the drawers, and the grilles on the server racks.

### J4. Depth-fade the light cards
`LightShafts` and `LightPools` cut hard intersection lines into the floor and
walls. A soft-particle depth fade against the depth buffer is a few lines and
is the difference between "a quad" and "volume". Do this before adding any more
cards in §F — it is what makes the whole card technique hold up.

### J5. Impostors for distant props
Fake 3D as a *perf* technique. The 145 props are the draw-call problem; distant
ones can swap to a single instanced camera-facing quad atlas, the same way cars
already swap to `CarProxy` at 28 units. Feeds directly into §L.

---

## K. Real lighting, with tricks

**Cost: 1 d for the cheap version, 2–3 d for the probe grid.**

### K1. Bake the static lighting at load
The office never moves. Compute per-vertex irradiance once at startup from the
six ceiling lights and the sun, store it in a vertex attribute, bake it twice
(day and night) and lerp with a uniform. It is computed, not shipped, so the
zero-asset rule holds. The payoff is that `Lighting.jsx`'s own comment — *"light
count is the #1 fragment cost"* — stops being a constraint on everything else.

### K2. The probe grid — the actual answer to "real lighting"
Sample irradiance on a coarse 3D grid at load, store SH-L1 in a 3D texture, and
have props and cars read it. A mug in the server room is then lit blue and a mug
in the kitchen is lit warm, without either being in range of a real light. One
texture fetch at runtime. This is what would make 145 props feel like they
belong to the rooms they are standing in.

**Start with the poor-man's version**, which is nearly free: `roomAt()` already
exists, so tint the hemisphere light by the room the camera is in and lerp on
transitions. One uniform, and the carpet colour bleeds onto the car.

### K3. Specular occlusion from the AO buffer
The underside of every desk currently reflects the sky at full strength.
Multiplying `envMapIntensity` by the AO term is one multiply and removes a
surprising amount of the flatness.

### K4. Gobo the fixture cards
The floor pools are plain radial glows. Give them the fixture's actual grille
pattern and the light acquires a source. Free — same quad, better canvas.

### K5. Remote cars have no headlights
`CarModel.jsx:426` gates the beam on `isLocal && dark`, so at night every rival
drives blacked out. Twelve real spotlights is not affordable; a cone card plus a
floor pool is ~2 draws per car and is what makes a pack of cars read as a pack.
This is a bug wearing a feature's clothes.

### K6. Fake GI from the bloom buffer
Sample a low mip of the bloom target and add it back as tinted ambient. Not GI,
but bright surfaces bleed onto their neighbours for one fetch in a pass that is
already running.

### K7. Worth one prototype: `RectAreaLight`
Two or three area lights for the window wall and the main ceiling grid may look
dramatically better than six point lights at comparable cost. Measure before
believing it — area lights are not cheap — but the shapes are right.

---

## L. The draw-call problem, attacked directly

**Cost: 2–4 d. This is the direction that pays for every other direction.**

Every section above is rationed by the same number: ~780 scene draw calls for
45 k triangles, which is 17 triangles per call. That is not a lighting problem
or a shading problem, it is a submission problem, and three things fix it:

- **Merge the static furniture.** 76 pieces × ~6 meshes each, almost all
  sharing a handful of materials. `BufferGeometryUtils.mergeGeometries()` per
  material turns that into a handful of draws. This was already written down as
  A3 in `IMPROVEMENT_PLAN.md` — *"one merged-geometry pass… so the added
  car/prop detail is GPU-free overall"* — and never finished. It is the largest
  single structural win left in the renderer.
- **Instance the repeated props.** 21 chairs, 14 mugs, 13 boxes, 12 pens, 11
  plants, 11 stacks: 80-odd objects that want to be five instanced meshes. They
  move, but that is what `InstancedRigidBodies` in `@react-three/rapier` is
  for — the transforms come back from the physics world every frame anyway.
- **A room PVS.** The map is 13 rooms with hand-authored walls, and `roomAt()`
  already exists. A hand-built room-adjacency visibility table is genuinely
  tractable at this size and would cull everything behind a wall — which, in an
  office, is most of the building most of the time. Frustum culling cannot do
  this; it has no idea the wall is opaque.

The honest framing: §I–§K make the frame prettier, §L makes them affordable.
If only one thing gets done, this is the one with compounding returns.

---

## M. Scale, motion and stylisation — the grab bag

Small ideas, each cheap, each pulling toward "tiny cars in a real office".

**Scale cues**
- **Wrapped diffuse on the paint.** Toys are translucent plastic; a remapped
  `N·L` (`(N·L + w) / (1 + w)`) reads as plastic rather than painted metal. One
  line in the toon ramp, and it is the cheapest identity change on this list.
- **Sheen on the fabric.** The office is full of it — sofas, booths, carpet,
  the foosball felt. Fresnel-based fake sheen, no new maps needed.
- **Anisotropic highlights** on the brushed-metal desk legs and the fridge.
- **Camera-locked dust layer** with parallax, in front of the existing
  `Sparkles`. Near-field particles are a macro-photography cue.

**Motion**
- **Reprojection motion blur.** Depth plus the previous view-projection matrix
  is enough for camera-motion blur in one pass. It sells speed harder than the
  radial zoom in `SpeedFX` and composes with it.
- **Wheel blur** driven by the existing spin value — a radial smear on the rim
  texture, not real motion blur.
- **Squash and stretch** on landings, in the vertex shader. Free, and it is the
  single most toy-like thing a toy car can do.
- **Afterimage on boost**: redraw the shell offset and additive at low alpha.
  One extra draw on one car.
- **FOV kick** with speed — different from the existing zoom blur, and cheaper.

**Stylisation**
- **Per-room colour grades** blended by `roomAt()`, on top of §D. The kitchen
  warm, the server room cold cyan, the balcony blue. Rooms become *places*, and
  it costs two uniforms.
- **Film grain and dithering.** Three lines, kills residual banding, and adds
  the texture that procedural-canvas worlds tend to lack.
- **Chromatic aberration at the frame edge** during boost — merges into the
  existing pass.
- **Screen-space god rays** from the sun's projected position when it is visible
  through the north glass. The 2007 trick, one radial pass, and this map has a
  literal wall of windows to justify it.

**Insurance**
- **Dynamic resolution.** Measure frame time and scale `dpr` between 0.75 and
  1.5 to hold 60. This is also the honest mitigation for the fill-rate
  uncertainty in §5 — it makes being wrong about POM survivable instead of
  fatal.

---

## 4. Suggested order

| Bundle | Contents | Effort | What the player notices |
|--------|----------|--------|------------------------|
| **1 — an afternoon** ✅ | §A (four numbers), §E (rim light + brake lights) | 0.5 d | Reflections exist; the car is readable at night |
| **2 — the budget** ✅ | §B (follow-box shadows) | 0.5 d | Sharp contact shadows, and 17% of the frame back in the bank |
| **3 — the look** | §D (grade + height fog), §F (cones, flicker, bounce tint) | 1.5 d | Day and night become different films; the office feels lit |
| **4 — the identity** | §H1 (tilt-shift), then §C (world outlines) | 2 d | It reads as a miniature |
| **5 — the surfaces** | §I (normal helper) + §G (roughness, tiling) | 2 d | The floor stops being paper |
| **6 — the budget, properly** | §L (merge, instance, room PVS) | 3 d | Nothing directly — it is what makes 7–8 affordable |
| **7 — the fakery** | §J1 (interior-mapped skyline), §J4 (depth-faded cards), §J3 | 2 d | The city outside is real; the light has volume |
| **8 — real lighting** | §K2 (probe grid), §K1 (bake), §K5 (rival headlights) | 3 d | Props belong to their rooms; rivals have lights |

Bundles 1 and 2 paid for 3–5: the shadow work returned more budget than the post
work spends. Bundle 6 is the same bet at a larger scale — it produces nothing a
player can see, and it is the reason 7 and 8 can be afforded at all. §M is a
grab bag to raid whenever a bundle finishes early; nothing in it is a
dependency for anything else.

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

## 4b. The CPU-only test — and two corrections to §1

Every measurement in this document, including §1's baseline and §4a's A/B, was
taken in headless Chromium with `--use-gl=swiftshader`: a **CPU software
rasteriser**. No GPU was involved in any of it. That was incidental to the
tooling, not a choice, and it has two consequences — one that invalidates a
claim, and one that turns out to be a shippable finding.

### The numbers

Median frame time over a settled in-match sample, 1280×720, same harness:

| Config | ms/frame | fps | Draw calls | Triangles |
|---|---:|---:|---:|---:|
| Full stack | 1383 | 0.72 | 1155 | 61 550 |
| − shadow map only | 1350 | 0.74 | 922 | 53 222 |
| − N8AO only | 1000 | 1.00 | 1030 | 52 975 |
| No post, no shadow | 633 | 1.58 | 787 | 45 045 |
| `?lowfx` + `scale=0.35` | 117 | 8.58 | 787 | 45 156 |
| `?lowfx` + `scale=0.25` | 83 | 12.0 | 788 | 45 424 |

Two points fit a clean model for the no-post path:

> **ms ≈ 48 + 567 × scale²**

A fixed ~48 ms of JavaScript, physics and draw submission, plus fill that scales
with the square of resolution. It predicts the 633 ms measurement at scale 1.0
to within 3%, which is better agreement than this harness deserves.

### Correction 1: §1 called the shadow pass "the single most expensive thing in the frame"

Removing it saves **33 ms — 2.4%** — while removing 233 draw calls and 8 000
triangles. §1's claim was a statement about *counters* phrased as a statement
about *cost*, and no timing existed to support it. The genuinely expensive item
is **N8AO at 383 ms, 28% of the frame**, and the post stack as a whole is ~717
ms, or 52%.

This does not retract §4a. The follow-box shadow rig is still sharper and still
submits 17% less, and on a GPU — where submission is a real cost and a 2048²
depth rasterise is nearly free — the balance is different. But the honest
version is: **that optimisation bought counters, and it has never been shown to
buy milliseconds anywhere.**

### Correction 2: §3's "the GPU is sitting idle"

There was no GPU. The draw-call and triangle counts in §1 are renderer-agnostic
and stand; the inference that we were *submit-bound with an idle GPU* was never
observed and could not have been, in this environment. **§3's budget rule
remains an untested hypothesis about GPU behaviour.** It should be re-derived on
real hardware with `EXT_disjoint_timer_query_webgl2` before more work is
priced against it.

### What the CPU case proves, though

The inversion is real and it is stark. `?lowfx&scale=0.35` and "no post, no
shadow" submit **the same 787 draw calls and the same 45 k triangles**. The only
difference between them is resolution, and it is worth **5.4×** (633 ms → 117
ms). On a software rasteriser, fill is everything and draw calls are nearly
free — the exact opposite of the rule the rest of this doc is built on.

Practical consequences for a CPU-only build:

- **Resolution is the entire lever.** It beats every other item combined.
- **Anisotropic filtering costs cycles per tap.** `?aniso=16` measured ~5%
  slower than 4 — suggestive rather than established, since mode variance moves
  the counters by 1–2% run to run. Software now gets `anisotropy = 1`.
- **There is a ~48 ms floor** that no resolution change touches: JS, physics and
  submission. That is a 21 fps ceiling on this machine even with zero pixels,
  which means a CPU-only build needs §L's object-count work *as well as* low
  resolution — draw calls matter here after all, just at the submission layer
  rather than the rasteriser.
- **§K1's vertex bake is the right shading model for it.** Per-vertex lighting
  across 45 k triangles is what software rasterisers are good at, and it deletes
  per-pixel light evaluation entirely.
- §J1 and §J2 (interior mapping, parallax occlusion) are **disqualified** on this
  path. Per-pixel raymarching is the worst possible software workload.

### Shipped as a result

Chrome falls back to SwiftShader silently — no GPU, blocklisted driver, VM — so
players were already running this path and being served ambient occlusion they
could not afford, with no way to know or to switch it off. `isSoftwareRenderer()`
in `flags.js` now detects it and takes the lean path automatically:

| | ms/frame | fps |
|---|---:|---:|
| Software rasteriser, before | 1367 | 0.73 |
| Software rasteriser, auto-detected | **117** | **8.57** |

12× for free, for the players least able to ask for it. `?forcefx` opts back in,
which is how the "before" row was measured.

Still not *playable* — 8.6 fps explains why every driving attempt in this
harness ended up nose-first against a wall, which was misread as an input bug at
the time. Getting from there to playable is the §L + §K1 + content-reduction
work, and the honest framing is that a CPU-only build is a different renderer,
not a settings preset.

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
  uniforms. No shipped normal maps for §G/§I — derive them at load from the
  canvases that already exist.
- **The car is the thing you must always see.** Any grade, fog or blur is wrong
  if it costs contrast on the local car against the floor.
- **"Fragments are free" is measured on draw calls, not on fill.** §3's budget
  rule came from a submit-bound profile; nothing in this doc has measured fill
  rate. §J2 (parallax occlusion on the floor — the largest screen area in every
  frame) and §J1 are where that assumption gets tested, and where it would break
  first. Before committing to either, run a render-scale sweep at fixed geometry
  to find the fill ceiling, and treat §M's dynamic resolution as the seatbelt.

## 6. Explicit non-goals

- **Screen-space reflections / SSGI.** Both want a full depth-normal prepass and
  a lot of fragment work to look like anything. §A's sharper environment map
  gets 80 % of the visible benefit for zero frames.
- **Ray-marched volumetric lighting.** The classic answer to §F and the wrong
  one here — the additive cards already read correctly, and they cost six draws
  instead of a march. (§M's screen-space god rays are a different animal: one
  radial blur from a projected sun position, no marching. That one is in.)
- **More dynamic lights.** The file's own comment is right — and §K1/§K2 are the
  way to get the *look* of more lights without any.
- **A deferred renderer.** The problem is 780 draw calls of tiny props, not
  lighting throughput. §L is the answer to that, not a rewrite.

**One non-goal that §K walks back on purpose.** An earlier draft ruled out baked
lightmaps as "an asset pipeline, which is the one thing this project has never
had". That reasoning holds for lightmaps *shipped as files* and not for §K1/§K2,
which compute irradiance at load and keep it in memory. The output is generated,
never authored and never checked in, which is the same deal `textures.js` has
always had. The rule was never "no baked lighting" — it was "no assets", and a
load-time bake does not break it.
