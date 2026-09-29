# Review: the office floor and built-in furniture

Branch `claude/review-office`. `npm run build` and `npm test` are green on every commit.

## What I fixed

- **Black frames** (`Office.jsx`, `Dust`). About half the frames of photo mode's aerial came out fully black (14 of 30), and one car-seat shot in the lounge did too. With `?lowfx` there were none (0 of 30). I hid the scene's layers one at a time and it came down to drei `Sparkles` (the office dust). Its shader computes `0.05 / distanceToCenter`, which is infinite when a pixel lands on a mote's centre. Bloom then spreads that over the whole frame. The dust keeps `Sparkles` but now uses its own copy of the shaders with the glow clamped: 0 of 30 black.
- **Bathroom sink** (`office.js`). The 2.6 m vanity ran 0.7 m into the bathroom→focus doorway, top and mirror included (screenshot). It now sits at x −12.3, west of the door.
- **Chairs on the desk ramps** (`office.js`). Two task chairs spawned on the top of the pod plank ramps and blocked the climb (screenshots). They are moved aside, and a car now drives up onto the desk (y 0.876 m).
- **Fridge on the steel ramp** (`office.js`). The fridge covered the bottom half of the counter ramp, and the ramp came out of its door (25 of 55 deck samples inside it). It now stands at the run's west end. A car climbs the ramp and drives the worktop.
- **Binder and foosball ramps with no run-up** (`office.js`). Both feet were 0.1–0.25 m from the x = 13 wall, so a car could only reach them side-on. The foosball ramp now climbs from the table's east end. The meeting table moved 0.9 m east. Both drive-tests end on top (y 0.885 m and 0.92 m).
- **Sofa arms had no collider** (`furniture.js`). Off the lounge ramp, the car drove through the far arm and fell off (it ended at x −6.35, y 0). With arm boxes it stops at the arm, on the seat.
- **Troffers cut by walls** (`Office.jsx`). Eight ceiling lights sat on the z −4 wall, half on each side (free-camera shot). Any light crossing a wall now moves one ceiling tile clear. My check went from 8 lights crossing a wall to 0.
- **Factory `cabinet`** (`furniture.js`). It had no builder and drew as a white box. It is now a steel filing cabinet.
- **Bench colliders** (`furniture.js`). A bench wider than it is deep put its end colliders on the wrong axis. No current map has one.
- **Static batch** (`Office.jsx`). The old floor's geometry is now freed after the new floor commits, not during render. An interrupted render could otherwise re-upload geometry that had just been freed, and nothing would free it again.

## Found outside my lane

1. **Major: `themes/cellar-live.jsx:190` and `themes/garage.jsx:495`.** Both use the same drei `<Sparkles>`, so they carry the same infinite-alpha black-frame risk. I didn't reproduce it in 30 aerial frames of the garage. Patch: pass a clamped material child, as `Office.jsx`'s `Dust` does:
   `<Sparkles …><primitive object={mat} attach="material" /></Sparkles>`
   with `clamp(0.05 / max(d, 0.04) - 0.1, 0.0, 1.0)`.
2. **Minor: `shared/src/maps/factory.js:240`.** The cabinet at rotY 0 faces north, so its blank side faces the room (screenshot). Patch:
   `f('cabinet', 21.55, 8.2, 1.2, 0.6, 1.3, -Math.PI / 2)`

## Checked and fine

- **Colliders:** every built-in piece's collider bounds match its model on all five maps.
- **Props and door spans:** no other prop starts on a ramp, and no other wall-backed piece spans a doorway.
- **Rest of the room checks:** the 0–1.2 m wall band, under desks and tables, glass, door frames, skirting, the balcony, and the ceiling slabs and bezels.
- **Per-frame work:** `Office.jsx` and `OfficeBoard.jsx` allocate nothing per frame. `OfficeBoard` mounts once per canvas. Textures are cached.
- **Draw calls:** at most 423 in the busiest views.

The light shafts poke out north of the building in the aerial view. That only shows in photo mode, so I left it.
