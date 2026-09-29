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
//
// Furniture and prop type names are global across themes — prefix a new one
// if it could clash.
import * as cellar from './cellar.jsx';

export const THEMES = { cellar };

export const PIECES = Object.assign({}, ...Object.values(THEMES).map((t) => t.PIECES || {}));
export const PROP_PIECES = Object.assign({}, ...Object.values(THEMES).map((t) => t.PROPS || {}));
