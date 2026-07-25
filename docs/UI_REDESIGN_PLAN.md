# Tiny RC Mayhem — UI Redesign Plan

The game under the UI is charming and confident. The UI on top of it is not:
it reads as "default dark gamer panel" — rainbow gradient title, purple/blue
gradient buttons, emoji as icons, Segoe UI, ad-hoc panels floating wherever
there was space. This plan is grounded in a full read of `client/src/ui/`
(`Menu.jsx`, `HUD.jsx`, `styles.css`) plus live screenshots of the running
game (menu, lobby, match HUD, scoreboard) captured via headless Chromium.

The goal is not "more decoration". It's the opposite: **one deliberate visual
system, tied to the game's own fantasy**, replacing a dozen small improvised
decisions that collectively read amateur.

---

## 1. Audit — what reads amateur today, and why

### 1.1 No visual identity — it's the generic 2020s dark-game template
- Palette is purple `#7b2ff2` + blue `#4da3ff` gradients on near-black
  (`styles.css:3-9`) — the default "gamer UI" look, unrelated to the game's
  actual world (a warm desk lamp over a toy car in a dark office).
- The title is a four-stop rainbow gradient (`styles.css:42`) — the single
  strongest "amateur" signal on the first screen a player sees.
- Font is `'Segoe UI', system-ui` (`styles.css:13`) — Windows' default UI
  font; macOS/Android users see something else entirely. There is no display
  face at all: the 120px countdown number, the 52px speedometer and the H1
  are all the same body font with `font-weight: 900` and a text-shadow.

### 1.2 Emoji are the icon system
🔧 ☕ 🔋 ⚽ 👑 🌍 🏆 💀 ⚠️ 🖨️ 📄 🗳 🥇 📣 🎁 💨 🔥 ⭐ appear as functional
icons in the tuner header, mode cards, top-bar stats, touch controls, podium
medals, spectator banner and feed. Emoji render differently on every
OS (the bot icon in the scoreboard renders as a boxy fallback glyph in our
screenshots), can't be recolored, ignore the palette, and are the #2
"hobby project" tell after the gradient title.

### 1.3 No system: every component is hand-rolled
- **Radii**: 5, 6, 7, 8, 9, 10, 12, 14, 16, 18 px — ten different corner
  radii across one stylesheet.
- **Spacing**: margins/paddings are arbitrary per-rule values; HUD corners
  use 26px, 26px, 20px, 16px insets — nothing shares an edge or a grid.
- **Z-index**: 5, 10, 20, 25, 30, 50 assigned ad hoc.
- **Buttons**: at least five unrelated button styles (`.mu-play`, `.play`,
  `.mode`, `.mu-arrow`, `.tc-btn`).
- **Dead CSS**: `.garage-view`, `.arrow`, `.cos-row`/`.cos-item`,
  `.car-ability` style the *old 2D menu* that no longer exists
  (`styles.css:144-162, 361-370, 433-434`).

### 1.4 Concrete usability defects (found while driving the real app)
1. **The garage monitor UI is physically unstable.** The parallax `Rig`
   (`Menu.jsx:94`) moves the camera every frame the pointer moves, so the
   CSS3D-projected DOM (`<Html transform>`) never stops moving — our
   Playwright run could not click any monitor button without `force: true`
   because the element never settles. Real users experience the same thing
   as cursor-chasing jitter on the exact surface holding every interactive
   control, rendered at an angle, at a fraction of native resolution.
2. **Stat bars carry no information.** `Stat v` values (`Menu.jsx:286-290`)
   normalize to ~0.8–1.0 for every car — in screenshots all five bars for
   all cars look full. The comparison UI says "everything is maxed".
3. **The lobby hides the game.** A `min(620px, 94vw)` panel sits dead
   center (`styles.css:280`) over the live office — while the hint under it
   says *"Drive around while you wait — the office is live."* The game's
   best lobby feature is invisible behind its own menu.
4. **7 mode cards in a 2-column grid** leaves a permanent orphan card
   (visible in the lobby screenshot), and vote counts are a tiny emoji
   floating top-right of the card.
5. **The minimap is noise.** Orange pickup dots visually dominate; rooms are
   near-invisible 18%-alpha fills; there are no room labels, no player-count
   at a glance, and the "me" triangle is 6px on a 200×130 canvas.
6. **The name field is an afterthought.** "DRIVER NAME" is a dim input in
   the monitor footer — first-run players won't find it before the podium
   calls them `Intern42`.
7. **Timer/top-bar are unanchored.** The 34px timer floats with only a
   text-shadow next to a chip-styled mode stat — two different visual
   languages in the same bar; nothing in the HUD shares a container style.
8. **Fixed pixel sizes everywhere** — the HUD doesn't scale between a 13"
   laptop and a 27" monitor; the 640×430 monitor DOM and 92px slots are
   hard-coded px.

### What's already good (keep it)
- The 3D garage diorama itself — turntable, lamp, clipboard, big red RACE
  button — is the most professional thing in the product. The problem is the
  *DOM projected into it*, not the concept.
- Skeuomorphic controls-on-a-clipboard is a great instinct.
- Feed/event-banner animation timing is decent; the podium rise animation
  and touch-control layout are structurally fine.
- Zero-asset, all-procedural identity.

---

## 2. Design direction — "After Hours, Inc."

Stop borrowing the generic esports look. The game already owns a stronger
theme: **an office at night, invaded by toys**. Build the entire UI language
out of office artifacts, executed crisply:

| UI element | Office artifact it becomes |
|---|---|
| Panels / lobby | Whiteboard & meeting-agenda cards, badge/lanyard chips |
| Kill feed | Workplace-chat messages ("💥" → a bump icon, chat-bubble style) |
| Event banner | Calendar-reminder toast ("Meeting in 3s: AC Hurricane") |
| Scoreboard | Spreadsheet — row striping, tabular numerals, rank column |
| Countdown | Giant print-stamp numerals, like a date stamp hitting paper |
| Podium | Employee-of-the-Month wall + confetti |
| Hints/notes | Sticky notes (already on the monitor bezel — promote it) |
| Mode vote | Ballot cards with a visible tally bar, "cast your vote" |

This is distinctive, funny, coherent with the world, and — executed with
restraint — reads far more professional than gradients ever will.

### 2.1 Color tokens
Derive the palette from the garage scene itself: cool night office + warm
desk-lamp pool. One warm accent, one cool accent, semantic roles only —
gradients disappear except as subtle 2-3% surface tints.

```css
:root {
  /* surfaces — cool night-office ink */
  --bg-0: #0b0e16;        /* page / void            */
  --bg-1: #131826;        /* panel                  */
  --bg-2: #1c2334;        /* raised card / chip     */
  --line: #2a3348;        /* borders, 1px, no alpha soup */

  /* text */
  --text-1: #eef2fa;      /* primary                */
  --text-2: #9aa7c0;      /* secondary              */
  --text-3: #5d6a85;      /* tertiary / labels      */

  /* the lamp — primary accent (buttons, selection, "you") */
  --amber: #ffb454;
  --amber-deep: #e08a1e;

  /* signals */
  --info: #5cc8ff;        /* cool counterpoint: timers, boost, links   */
  --good: #4ade80;        /* ready, ability charged                    */
  --bad:  #ff5c5c;        /* danger, zap warning, disconnect           */
  --note: #ffe27a;        /* sticky-note yellow: hints, tips           */
}
```

Rules: gradient buttons → flat `--amber` with darker border + 1px inner
highlight; the rainbow H1 → solid type-treatment logo (§3.1); selection
states → amber border + tinted fill, everywhere the same.

### 2.2 Typography
- **Display face** (numerals, titles, countdown, speed): a bold condensed
  grotesk — recommend **Barlow Condensed SemiBold/Bold** (SIL OFL). Subset
  to latin, self-hosted as a single ~20 KB woff2 in `client/src/assets/`.
  This is the one place to consciously amend "zero asset files": zero
  *external requests* is the real identity and stays true. (Fallback
  decision if the constraint is hard: a tuned system stack
  `Futura, 'Trebuchet MS', system-ui` + `font-stretch` — worse, but free.)
- **Body face**: `system-ui` stack, but *declared intentionally*:
  `font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- **Type scale** (rem-based): 11 / 13 / 15 / 18 / 24 / 34 / 56 / 96. Kill
  all other sizes. `font-variant-numeric: tabular-nums` on every number that
  updates live (timer, speed, scores) so digits don't jiggle.
- Letterspaced-uppercase becomes a *label style* (11px, `--text-3`,
  2px tracking) used only for labels — today half the UI shouts in
  letterspaced caps, which flattens hierarchy.

### 2.3 Iconography
One inline-SVG icon set (~24 glyphs, 24×24, 2px rounded stroke), shipped as
a single `Icon.jsx` component — flag, coffee cup, battery, ball, crown,
globe, trophy, wrench, gear, skull, printer, horn, gift, flame, drift,
star, controller, arrow, check, ballot. Procedural (JSX paths), zero asset
files, recolorable via `currentColor`, identical on every OS. Emoji survive
only where they're *content* (the in-world emote wheel above cars).

### 2.4 Layout, spacing, motion
- **Spacing scale**: 4/8/12/16/24/32/48. **Radii**: 8 (controls), 12
  (cards), 16 (panels) — three values, period. **Z-index scale**: named
  tokens (`--z-hud`, `--z-modal`, `--z-flash`).
- **HUD safe-area grid**: every HUD element anchors to a 24px margin frame
  (with `env(safe-area-inset-*)` on mobile). Root font-size scales via
  `clamp()` so the HUD grows on big screens instead of shrinking into the
  corners.
- **Motion system**: two durations (120ms micro / 280ms panel), two easings
  (standard `cubic-bezier(.2,.0,.2,1)`, overshoot for celebratory moments),
  honored `prefers-reduced-motion`. Panels animate in with the same
  slide+fade everywhere instead of three different keyframe styles.

---

## 3. Screen-by-screen redesign

### 3.1 Garage / main menu (`Menu.jsx`)
Keep the diorama — fix the parts that fight it.

- **Logo**: replace the rainbow gradient H1 with a designed lockup: solid
  `--text-1` "TINY RC" in the display face, "MAYHEM" on a tilted sticky-note
  or license-plate chip in `--amber`. Tagline stays. Bottom-left corner
  gets a quiet version string; the top-right shows XP/level as a badge chip
  (career info currently buried in the monitor header).
- **Focus camera instead of fighting parallax**: clicking the monitor (or
  pressing `E`) dollies the camera to face it head-on and *freezes the
  parallax rig*; `Esc`/click-away returns. Same pattern for the clipboard.
  The DOM UI becomes stable, straight, and rendered ~1:1 — this fixes the
  jitter/legibility problem at the root instead of tweaking font sizes.
  (Interim one-liner: lerp the rig only while the pointer is outside the
  monitor's screen rect.)
- **Monitor UI**: restyle as the "RC TUNER" desktop app it pretends to be —
  title bar with window dots, tab strip as app tabs (amber underline for
  active, not filled pills), body on `--bg-1`. Calibrate stat bars against
  the roster min/max so cars actually differ (show a faint tick where the
  roster average sits); 5 segmented cells read better than a continuous bar
  at this size.
- **First-run name prompt**: if `store.name` is empty, the sticky note on
  the monitor bezel becomes the name entry ("who's driving? ___") before
  RACE arms. Returning players keep the footer field.
- **RACE button**: keep the glorious red dome. Add a slow emissive pulse,
  and make the floating label a small angled sticky-note tag instead of
  glowing red text.

### 3.2 Lobby (`HUD.jsx` Lobby)
The world is the lobby — get out of its way.

- Replace the centered panel with a **left-side rail** (~360px, full-height,
  slides in): header "OFFICE LOBBY · waiting for players", player list as
  badge chips (paint-colored lanyard dot, ready = amber check), and the
  mode vote as a **ballot list** — one row per mode: icon, name, one-line
  description, and a horizontal tally bar that fills as votes land. Rows
  beat the 2-col card grid: no orphan card, tallies are legible, and 70% of
  the screen shows the live office you're free to drive around.
- **READY UP** becomes the single full-width amber button pinned to the
  rail's bottom; when ready it flips to outline style with "waiting 2/4…" —
  the current green gradient disappears.
- Mobile: the rail becomes a bottom sheet (collapsed: player count + READY).

### 3.3 Countdown
- Mode intro as a **calendar-invite toast** sliding from top: icon, mode
  name, one-liner, mutator as a red "agenda item" row beneath.
- The 3-2-1 number set in the display face at ~96–120px with a stamp-in
  animation (scale-down + tiny rotation + soft shockwave ring), amber "GO!".
  Same font as the speedo, so the HUD feels related to the intro.

### 3.4 Match HUD
One chip language: `--bg-2` fill, `--line` border, radius 12, 11px caps
labels in `--text-3`, values in display face.

- **Top center — timer cluster**: timer chip (tabular numerals, turns
  `--bad` and pulses under 30s) with the mode-objective chip attached below
  it in the same cluster, using a real icon. Cup/mutator chips align right
  of it, same height.
- **Bottom left — drive cluster**: speed number (display face, 56px) with
  boost as a **ring or arc around/under it** rather than a detached bar;
  boost turns amber when full. Slipstream charge (currently invisible!)
  gets a subtle secondary arc.
- **Bottom right — action cluster**: powerup slot and ability slot become
  siblings in one tray, same size, keycap badges (`E`, `Q`) styled as real
  keycaps bottom-right of each slot. Cooldown = radial wipe (standard,
  legible) instead of a rising dark curtain. Empty powerup slot shows a
  slow "scanning" shimmer instead of a dim `?`.
- **Minimap v2** (top right): rooms as filled shapes with 1px `--line`
  borders on `--bg-1`; walls dropped to hairlines; pickups shrink to 1.5px
  dots at 40% opacity; players are paint-colored dots with the local player
  as an amber arrow + view cone; objective (checkpoint/ball/battery) gets a
  gentle pulse. Add a north-up frame chip labeled with the current room
  name ("CAFETERIA") — free wayfinding.
- **Feed** (left, under top bar): chat-style rows, icon + text, max 4,
  auto-fading; big moments (falls, nemesis hits) get an amber accent bar.
- **Event banner**: restyled as the calendar-reminder toast (§3.3) — warn
  state uses `--note` sticky-yellow with a countdown pip, active state
  `--info`. Kills the current purple/orange gradient pair.
- **Zap warning / spectator**: same toast family, `--bad` fill for the
  room-closed alarm; spectator banner moves to bottom-center with
  prev/next player arrows.

### 3.5 Scoreboard (Tab)
Spreadsheet treatment: header row ("#", name, score-per-mode label), row
striping, your row amber-tinted with a lanyard dot, bots marked with the
bot icon at 40% opacity, tabular numerals, rank-change carets during Cup.
Slides from top-center as an overlay sheet, dims the world 20% — currently
it plops into screen center with no scrim.

### 3.6 Podium
"Employee of the Month" ceremony: winners' wall backdrop card, three framed
portraits (paint-colored car silhouette + name plaque) rising in sequence,
gold/silver/bronze plaque borders instead of emoji medals, confetti burst
(CSS particles, cheap), nemesis/rivalry lines as feed-style chat rows
beneath. Cup standings become the spreadsheet component from §3.5 reused.

### 3.7 Touch controls & connect states
- Replace emoji buttons with the SVG icon set at 28px; raise contrast on
  buttons 15%; drift/boost get charge-state rings (currently no feedback
  on the two most feel-critical buttons).
- "Connecting to the office…" becomes a branded moment: dark scene +
  animated three-dot "the office is waking up…" + logo lockup; errors get
  the toast styling with a proper retry button.

---

## 4. Implementation plan

Structure: keep plain CSS (no framework needed at this size) but split
`styles.css` (440 lines, one file) into `tokens.css`, `components.css`
(chip/panel/button/toast/keycap primitives), and per-surface files.
Add `ui/Icon.jsx`. Everything below is client-only; zero protocol changes.

### Phase 1 — Foundations — ✅ SHIPPED
| Item | Notes |
|---|---|
| Token sheet: colors, spacing, radii, z, motion | replaces `:root` block |
| Barlow Condensed woff2 + type scale | decision point: font file yes/no |
| `Icon.jsx` SVG set (~24 glyphs) | swap all functional emoji |
| Primitives: chip, panel, button (primary/ghost), toast, keycap | one button style rules them all |
| Delete dead CSS (`.garage-view`, `.arrow`, `.cos-*`, `.car-ability`) | -60 lines |
| Root `clamp()` scaling + 24px HUD safe-area frame | fixes fixed-px HUD |

### Phase 2 — Garage — ✅ SHIPPED
Logo lockup · focus-camera for monitor/clipboard + rig freeze · RC TUNER
app restyle · calibrated segmented stat bars · first-run sticky-note name
prompt · RACE button tag.

### Phase 3 — Match HUD — ✅ SHIPPED
Timer/objective cluster · speed+boost ring cluster · unified action tray
with radial cooldowns · minimap v2 + room-name chip · feed restyle ·
calendar-toast event banners · zap/spectator toasts.

### Phase 4 — Flow screens — ✅ SHIPPED
Lobby side rail + ballot rows · countdown stamp · scoreboard sheet ·
podium ceremony · connect/error states.

### Phase 5 — Mobile & a11y polish — ✅ SHIPPED
Bottom-sheet lobby · icon touch controls with charge rings · safe-area
insets · contrast pass to WCAG AA on all chip text (several current
labels are ~3:1) · `prefers-reduced-motion` · colorblind-check the
paint-dot player identification (add name initials to minimap dots).

Each phase ships independently and visibly. Phase 1+3 alone remove ~80% of
the "amateur" reading since the HUD is where players spend their time.

### Success criteria
- Zero emoji rendered as UI chrome; zero gradient fills except ≤3% tints.
- Every panel/chip/button on screen at once shares radius, border, type
  scale (screenshot diff review at 1280×720 and 375×812).
- Monitor UI clickable in Playwright *without* `force: true` (regression
  test for the rig-jitter fix — the harness for this already exists from
  this audit).
- Stat bars visibly differ across all 5 cars.
- Lobby leaves ≥60% of the viewport showing the live world.
- 60fps hold on `?lowfx` — this plan adds no textures, no external
  requests, at most one ~20 KB font file.

### Non-goals
- No UI framework/Tailwind migration — token'd vanilla CSS is enough.
- No redesign of the in-world 3D menu concept (it's the best part).
- No new HUD information systems (damage numbers, killstreaks…) — this
  plan restyles and repositions what exists; new features ride on the
  gameplay roadmap in `IMPROVEMENT_PLAN.md`.

### Implementation notes (post-ship)

- **Entrance animations are transform-only.** Verified on a software-rendered
  (SwiftShader) run that under heavy main-thread load the CSS animation
  timeline can stall at its first frame — an entrance keyframe starting at
  `opacity: 0` then leaves the element invisible. All entrances now animate
  transform only, and the Tab scoreboard appears instantly.
- **drei `<Html transform>` wrappers hit-test as solid.** The inner transform
  wrapper is `pointer-events: auto` by default, so the read-only clipboard
  sheet and RACE tag pass `pointerEvents="none"` / CSS `pointer-events: none`
  and let the 3D meshes take the click (their R3F handlers dock the camera).
- **Focus camera** uses exponential damping (frame-rate independent) and
  computes its distance from the camera's live fov/aspect, so the docked
  panel fits on portrait phones too.
- **Mobile garage** additionally shows DOM **Tune** / **Race** buttons — in
  portrait, the in-world monitor and red button sit mostly off-screen.
- Barlow Condensed ships as two latin-subset woff2 files (~22 KB each,
  OFL license alongside) — still zero external requests at runtime.

### Post-ship addition: diegetic drive cluster

`client/src/game/ControllerHUD.jsx` — on fine-pointer devices the flat
speed/boost cluster is replaced by a procedural toy RC transmitter portaled
onto the camera inside the game canvas: sticks that physically mirror
steering/throttle, a canvas-texture LCD speed readout, a boost LED ladder
(cyan → amber when full, brighter while draining), a pulsing link LED and a
speed-swaying antenna. It updates straight from `telemetry` in useFrame (no
React re-renders), draws with `depthTest: false` so world geometry never
clips it, and carries a tight-falloff private fill light (skipped on
`?lowfx`). Phones keep the DOM cluster — screen space there is scarcer than
theme points. Scoreboard/lobby/timers intentionally stay flat 2D: they are
glanced at under time pressure, where diegetic rendering costs legibility.

Second pass ("MK-II"): rounded two-tone shell (drei RoundedBox), printed
faceplate (brand line + Q/E keycap labels on a static canvas texture),
corner screws, stick gaiters, brighter self-lit knobs — and the powerup (E)
and ability (Q) moved onto the transmitter as physical lit buttons: emoji
icon faces on small canvas textures, an amber "armed" ring / green "ready"
ring on the emissive collar, a radial cooldown wipe, and a press-dip
animation when fired (detected from store transitions). Icon-only, Mario
Kart style; the DOM action tray now shows only on coarse pointers.

### Post-ship addition: zero emoji chrome, completed

`ui/iconPaths.js` defines vector glyphs for all 10 powerups and 5 abilities
as raw SVG path data, consumed by two renderers: Icon.jsx (DOM, as
`act-<id>` glyphs for the mobile action tray) and the transmitter's canvas
button faces (via Path2D). Bot names no longer bake a robot emoji into the
string server-side — DOM surfaces mark bots with the vector icon, and the
in-world nameplate re-adds its own prefix as world content. The clipboard's
gamepad emoji became an Icon; client feed templates dropped their leading
icon-duty emoji. Emoji that remain are content by design: player emotes and
the personality inside server chat-feed sentences.

### Post-ship addition: the office whiteboard

`client/src/game/OfficeBoard.jsx` — a live in-world display, drawn on one
shared canvas texture and mounted twice: above the reception desk (facing
the spawns) and beside the meeting-room TV. During the lobby it reads
"NEXT MEETING?" with red marker tally strokes per vote and the leader
circled in amber; during countdown/play it shows live standings (magnet
dots in each player's paint, your name underlined, red marker clock);
on the podium it crowns the EMPLOYEE OF THE MATCH. Redraws are hash-gated
at ≤2.5 Hz, and the material uses the canvas as its own emissive map so
the board stays readable during lights-out events. The Tab scoreboard
overlay stays — mid-race glances need flat UI; the board is the world's
own copy. Photo mode gained a free-camera hook (`window.__rcCamOverride`)
used by the screenshot tooling.
