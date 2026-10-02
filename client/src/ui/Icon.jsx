// Inline-SVG icons — the UI's only icon language (emoji survive only as
// in-game content, e.g. emotes).
//   <ToyIcon>        the Toy Box set: solid 32-grid pictograms (TOY_ICONS)
//   <ActionSticker>  an item / ability glyph as a toy sticker (ink outline +
//                    item colour), from the shared ACTION_ICON_PATHS
//   <ToyCar>         a side-view toy car in a driver's paint
//   <Icon>           the legacy 24-grid stroke set, kept for the garage and
//                    any surface not yet ported to the Toy Box look

import { ACTION_ICON_PATHS, TOY_ICONS } from './iconPaths.js';

const fill = { fill: 'currentColor', stroke: 'none' };

const GLYPHS = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h12l-2 4 2 4H6" />
      <rect x="9" y="6" width="2.4" height="2.4" rx="0.4" {...fill} />
      <rect x="12.6" y="8" width="2.4" height="2.4" rx="0.4" {...fill} />
    </>
  ),
  coffee: (
    <>
      <path d="M6 9h9v5a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V9z" />
      <path d="M15 10.5h1.5a2.5 2.5 0 0 1 0 5H15" />
      <path d="M8.5 5.5c0-1 1-1.2 1-2.2M12 5.5c0-1 1-1.2 1-2.2" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="8" width="15" height="9" rx="2" />
      <path d="M21 11v3" />
      <path d="M10.5 9.8 8 12.8h2.6l-1 2.9 3.4-3.7h-2.5l1-2.2z" {...fill} />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.6 2.6-1.4 4.3h-4.4l-1.4-4.3z" />
      <path d="M12 8.2V4.5M15.6 10.8l3.5-1.1M14.2 15.1l2.2 3M9.8 15.1l-2.2 3M8.4 10.8 4.9 9.7" />
    </>
  ),
  crown: (
    <>
      <path d="M4 18.5 3 9l4.5 3L12 5.5 16.5 12 21 9l-1 9.5z" />
      <path d="M6 21.5h12" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 3h8v6a4 4 0 0 1-8 0V3z" />
      <path d="M8 5H5a3 3 0 0 0 3.2 4M16 5h3a3 3 0 0 1-3.2 4" />
      <path d="M12 13v4M9 21h6M10 17h4l.6 4h-5.2z" />
    </>
  ),
  wrench: (
    <path d="M20.3 5.4a6 6 0 0 1-7.6 7.6l-6.8 6.8a2.1 2.1 0 0 1-3-3l6.8-6.8a6 6 0 0 1 7.6-7.6l-3.6 3.6 3 3z" />
  ),
  skull: (
    <>
      <path d="M12 3a8 8 0 0 0-8 8c0 2.4 1.1 4.3 3 5.6V20h10v-3.4c1.9-1.3 3-3.2 3-5.6a8 8 0 0 0-8-8z" />
      <circle cx="9.2" cy="11.5" r="1.4" {...fill} />
      <circle cx="14.8" cy="11.5" r="1.4" {...fill} />
      <path d="M10.5 20v-2M13.5 20v-2" />
    </>
  ),
  horn: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4.5v-13L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M14.5 9.5a4 4 0 0 1 0 5M17.5 7a8 8 0 0 1 0 10" />
    </>
  ),
  gift: (
    <>
      <path d="M4 8h16v4H4z" />
      <path d="M6 12v8h12v-8" />
      <path d="M12 8v12" />
      <path d="M12 8c-1.7-3.2-6.2-2.8-6-.5.1 1.7 3.6 1.3 6 .5zM12 8c1.7-3.2 6.2-2.8 6-.5-.1 1.7-3.6 1.3-6 .5z" />
    </>
  ),
  flame: (
    <path d="M12 3s5 4.6 5 9.2A5 5 0 0 1 7 12.2c0-1.9.8-3.4 2-4.9.3 1.2 1 2.1 2 2.6C10.6 7.2 11 5 12 3z" />
  ),
  wind: (
    <>
      <path d="M4 8h8.5A2.3 2.3 0 1 0 10.2 5" />
      <path d="M3 12h13.5a2.6 2.6 0 1 1-2.6 3" />
      <path d="M4 16h6a2 2 0 1 1-2 2.6" />
    </>
  ),
  star: (
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
  ),
  bolt: <path d="M13 2 4.5 13.5H11L9.5 22 18 10.5h-6.5z" />,
  building: <><path d="M4 21V5l8-3v19M12 8l8 3v10M2 21h20" /><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" /></>,
  tube: <><rect x="2" y="9" width="20" height="4" rx="2" /><path d="M4 17l1-2M8 18v-3M12 18v-3M16 18v-3M20 17l-1-2" /></>,
  check: <path d="M4.5 12.5l5 5L19.5 6.5" />,
  'chevron-left': <path d="M14.5 5.5 8 12l6.5 6.5" />,
  'chevron-right': <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  bot: (
    <>
      <rect x="5" y="8.5" width="14" height="11" rx="3" />
      <path d="M12 8.5V5.5" />
      <circle cx="12" cy="4" r="1.2" {...fill} />
      <circle cx="9.3" cy="13.3" r="1.3" {...fill} />
      <circle cx="14.7" cy="13.3" r="1.3" {...fill} />
      <path d="M9.5 16.8h5" />
    </>
  ),
  camera: (
    <>
      <path d="M9 7l1.3-2.2h3.4L15 7" />
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <circle cx="12" cy="13.3" r="3.6" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5 2.8 19.8h18.4z" />
      <path d="M12 9.8v4.4" />
      <circle cx="12" cy="17" r="1.1" {...fill} />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3.5h10V8" />
      <rect x="4" y="8" width="16" height="9" rx="2" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
  ballot: (
    <>
      <path d="M9 8.5V3.5h6v5" />
      <path d="M4 11h16v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
      <path d="M8.5 11h7" />
    </>
  ),
  moon: <path d="M20 13.8A8.5 8.5 0 0 1 10.2 4 7.7 7.7 0 1 0 20 13.8z" />,
  drop: <path d="M12 3s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.4 12 3 12 3z" />,
  file: (
    <>
      <path d="M7 3h7l4 4.2V21H7z" />
      <path d="M14 3v4.5h4" />
      <path d="M10 12.5h5M10 16h5" />
    </>
  ),
  quake: <path d="M2 12.5h4l3-8 4 16 3-8.5h6" />,
  gamepad: (
    <>
      <path d="M7.5 7.5h9a5 5 0 0 1 5 5.3c-.2 2-1.8 3.7-3.8 3.7-1.2 0-2.3-.6-3-1.5l-.9-1.2H10.2l-.9 1.2c-.7.9-1.8 1.5-3 1.5-2 0-3.6-1.7-3.8-3.7a5 5 0 0 1 5-5.3z" />
      <path d="M8.3 10.3v3.4M6.6 12h3.4" />
      <circle cx="15.4" cy="11" r="0.9" {...fill} />
      <circle cx="17.6" cy="13.2" r="0.9" {...fill} />
    </>
  ),
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.3" {...fill} />
    </>
  ),
};

// powerup/ability glyphs share their path data with the RC transmitter's
// canvas-drawn button faces (iconPaths.js) — namespaced as act-<id>
for (const [id, paths] of Object.entries(ACTION_ICON_PATHS)) {
  GLYPHS[`act-${id}`] = <>{paths.map((d, i) => <path key={i} d={d} />)}</>;
}

export default function Icon({ name, size = 18, className = '', ...rest }) {
  const glyph = GLYPHS[name];
  if (!glyph) return null;
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {glyph}
    </svg>
  );
}

// Domain → icon-name maps used across surfaces.
export const MODE_ICON = {
  desk_dash: 'flag',
  coffee_run: 'coffee',
  battery: 'battery',
  soccer: 'ball',
  koth: 'target',
  tag: 'crown',
  sumo: 'act-ram',
  last_standing: 'crown',
  free_roam: 'globe',
  office_cup: 'trophy',
};

export const EVENT_ICON = {
  lights_out: 'moon',
  earthquake: 'quake',
  paper_storm: 'file',
  ac_wind: 'wind',
  server_overload: 'flame',
  cleaning_robot: 'bot',
  sprinklers: 'drop',
};

// ================================================================ Toy Box
const toyCache = new Map();
function toyGlyph(name) {
  let g = toyCache.get(name);
  if (g === undefined) {
    const def = TOY_ICONS[name];
    g = def ? (
      <>
        {(def.f || []).map((d, i) => <path key={`f${i}`} d={d} fillRule="evenodd" />)}
        {(def.s || []).map(([d, w], i) => (
          <path key={`s${i}`} d={d} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </>
    ) : null;
    toyCache.set(name, g);
  }
  return g;
}

// <ToyIcon name="flame" />: 32-grid, painted with currentColor. Sized by CSS
// (.tb-i is 1.25rem; a parent's `.x svg` rule wins), or by `size` (px/rem).
export function ToyIcon({ name, size, className = '', style, ...rest }) {
  const glyph = toyGlyph(name);
  if (!glyph) return null;
  const sz = size != null ? { width: size, height: size } : null;
  return (
    <svg
      className={`tb-i${className ? ` ${className}` : ''}`}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={sz || style ? { ...sz, ...style } : undefined}
      {...rest}
    >
      {glyph}
    </svg>
  );
}

// The colour an item's sticker is painted in (the outline is always ink).
export const ITEM_COLOR = {
  turbo: 'var(--blaze)', emp: 'var(--sky)', rocket: 'var(--cherry)', oil: 'var(--ink-4)', coffee: 'var(--blaze-lo)',
  shield: 'var(--sky)', shrink: 'var(--lime-lo)', spring: 'var(--lime-lo)', swap: 'var(--grape)', fake: 'var(--bubble)',
};

// An item or ability glyph as a toy sticker: the shared 24-grid stroke glyph
// drawn twice, a fat ink outline under the coloured stroke (.tb-sticker).
// Covers every powerup and ability with no new art.
export function ActionSticker({ id, color, size, className = '', style }) {
  const paths = ACTION_ICON_PATHS[id];
  if (!paths) return null;
  const strokes = paths.map((d, i) => <path key={i} d={d} />);
  return (
    <svg
      className={`tb-sticker${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ '--sc': color || ITEM_COLOR[id] || 'var(--grape)', ...(size != null ? { width: size, height: size } : null), ...style }}
    >
      <g className="o">{strokes}</g>
      <g className="f">{strokes}</g>
    </svg>
  );
}

// A side-view toy car in a driver's paint (lobby rows, standings, podium,
// the connect loader). 124×76 artboard, sized by .tb-car (2.875rem wide).
const INK = '#140e2c';
const PAPER = '#fff8ea';
export function ToyCar({ paint = '#9aa7c0', className = 'tb-car', style }) {
  return (
    <svg className={className} viewBox="0 0 124 76" aria-hidden="true" focusable="false" style={style}>
      <path d="M86 20 L93 4" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <circle cx="93.5" cy="4.5" r="4" fill="#ff3b4a" stroke={INK} strokeWidth="2.2" />
      <path d="M7 51c0-8 5-12.5 13-13.5l17-2 12.5-14.5c3-3.5 6.5-5 11-5h22.5c6 0 9.5 3 12.5 8l5.5 10.5 10.5 2c5 1 9 5 9 10v5.5c0 3-2 5-5 5H12c-3 0-5-2-5-5z" fill={paint} stroke={INK} strokeWidth="3.6" strokeLinejoin="round" />
      <path d="M14 45.5c16-3 62-4 98-1" stroke="rgba(255,255,255,.5)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M53 22.5c2-2.5 4-3.5 7.5-3.5H70v14.5H42.5z" fill="#c8ecff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M74 19h8.5c4 0 6.5 2 8.5 5.5l4.8 9H74z" fill="#c8ecff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="31" cy="60" r="13.5" fill={INK} /><circle cx="31" cy="60" r="6" fill={PAPER} stroke={INK} strokeWidth="2" />
      <circle cx="97" cy="60" r="13.5" fill={INK} /><circle cx="97" cy="60" r="6" fill={PAPER} stroke={INK} strokeWidth="2" />
    </svg>
  );
}

// Domain → Toy icon maps.
export const MODE_TOY = {
  desk_dash: 'flag', coffee_run: 'bean', battery: 'battery', soccer: 'ball', koth: 'pin',
  tag: 'target', sumo: 'sumo', last_standing: 'crown', free_roam: 'globe', office_cup: 'trophy',
};
// floors by map id (= theme): the icon and the lift-panel code
export const FLOOR_TOY = { office: 'office', cellar: 'server', tower: 'tower', garage: 'garage', factory: 'factory' };
export { FLOOR_CODE } from './hud/format.js';
// office events by id (every floor keeps the ids; only the names differ)
export const EVENT_TOY = {
  lights_out: 'moon', earthquake: 'quake', paper_storm: 'printer', ac_wind: 'wind',
  server_overload: 'flame', cleaning_robot: 'bot', sprinklers: 'drop',
};
// the round's twist (shared/src/modes.js MUTATORS)
export const MUTATOR_TOY = { moon_gravity: 'moon', giant_ball: 'ball', mug_rain: 'cup', tiny_cars: 'size' };
