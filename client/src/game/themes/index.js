// Every map theme's own scene pieces, registered by the theme id a map names
// (map.theme, shared/src/maps/*.js). The office is built in (Office.jsx);
// every other floor is a module here that exports:
//
//   Dressing({ map })  — what makes the place: ceilings, lights, pipes, signs,
//                        windows and views, animated set pieces. Rendered
//                        instead of the office's own ceiling/windows/sky.
//   PIECES             — { furnitureType: Component({ f, mats }) } for the
//                        map's FURNITURE entries. A piece owns its colliders
//                        (a static <RigidBody>); decor ({ decor: true } or a
//                        DECOR_TYPES type) has none.
//   PROPS              — { propType: Component({ p }) } for the map's PROPS
//                        entries: physics bodies wrapped in <Body>
//                        (../propBody.jsx), so they join the shared chaos.
//   RAMP_SKINS         — { skin: Component({ r, len, angle }) } drawing a ramp
//                        whose map entry says { skin } (Office.jsx keeps the
//                        collider; the skin is drawn in the ramp's local frame:
//                        rising toward +z, foot at z = −l/2, top at +l/2).
//   WALL_STYLES        — { style: Component({ walls }) } drawing every wall
//                        entry with that { style } (colliders stay in
//                        Office.jsx) — fences, mesh guarding, curtain walls.
//   Robot              — optional: what the cleaning-robot event looks like on
//                        this floor (a floor scrubber, an AGV…); its position
//                        is driven for it.
//
// Furniture and prop type names are global across themes — prefix a new one
// if it could clash.
import * as cellar from './cellar.jsx';
import * as tower from './tower.jsx';
import * as garage from './garage.jsx';

export const THEMES = { cellar, tower, garage };

export const PIECES = Object.assign({}, ...Object.values(THEMES).map((t) => t.PIECES || {}));
export const PROP_PIECES = Object.assign({}, ...Object.values(THEMES).map((t) => t.PROPS || {}));
export const RAMP_SKINS = Object.assign({}, ...Object.values(THEMES).map((t) => t.RAMP_SKINS || {}));
export const WALL_STYLES = Object.assign({}, ...Object.values(THEMES).map((t) => t.WALL_STYLES || {}));
