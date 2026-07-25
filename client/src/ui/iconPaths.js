// Vector glyphs for powerups and car abilities, keyed by their shared ids.
// Single source for two renderers: Icon.jsx strokes them as SVG <path>
// elements, ControllerHUD strokes the same strings via canvas Path2D — so
// the transmitter buttons and the mobile action tray always match.
// 24×24 grid, 2px round stroke, same language as the rest of Icon.jsx.

export const ACTION_ICON_PATHS = {
  // ---- powerups (shared/src/powerups.js ids)
  turbo: [
    'M4 16a8 8 0 0 1 16 0',
    'M12 16l4.5-5',
    'M7 20h10',
  ],
  emp: ['M13 2 4.5 13.5H11L9.5 22 18 10.5h-6.5z'],
  rocket: [
    'M12 2.5c2.8 2.3 3.8 5.6 3.8 8.6l2.4 2.9-2.9.5c-.8 1.7-1.9 3-3.3 4-1.4-1-2.5-2.3-3.3-4l-2.9-.5 2.4-2.9c0-3 1-6.3 3.8-8.6z',
    'M13.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
    'M12 19.5v2',
  ],
  oil: [
    'M12 3s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.4 12 3 12 3z',
    'M9 14.5c2-1.5 4 1.5 6 0',
  ],
  coffee: [
    'M6 9.5h9v4.5a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V9.5z',
    'M15 10.5h1.5a2.5 2.5 0 0 1 0 5H15',
    'M8.5 6c0-1 1-1.2 1-2.2',
    'M12 6c0-1 1-1.2 1-2.2',
  ],
  shield: [
    'M12 3l7 3v5.5c0 4.6-3 7.6-7 9.5-4-1.9-7-4.9-7-9.5V6z',
    'M14.5 11a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  ],
  shrink: [
    'M10 10 4 4M10 10V5.5M10 10H5.5',
    'M14 14l6 6M14 14v4.5M14 14h4.5',
  ],
  spring: [
    'M8 20.5h8',
    'M8 17.5h8',
    'M8.5 14.5h7',
    'M12 11V3.5',
    'M8.5 7 12 3.5 15.5 7',
  ],
  swap: [
    'M4 8h13M13.5 4.5 17 8l-3.5 3.5',
    'M20 16H7M10.5 19.5 7 16l3.5-3.5',
  ],
  fake: [
    'M4 8.5h16v4H4z',
    'M6 12.5V20h12v-7.5',
    'M12 8.5V20',
    'M12 8.5C10.3 5.3 5.8 5.7 6 8c.1 1.7 3.6 1.3 6 .5z',
    'M12 8.5c1.7-3.2 6.2-2.8 6-.5-.1 1.7-3.6 1.3-6 .5z',
  ],

  // ---- car abilities (shared/src/modes.js ABILITIES ids)
  pounce: [
    'M3.5 20.5h17',
    'M4.5 18C6 11 10 7.5 16 7',
    'M12.5 4.5 16 7l-2.4 3.4',
  ],
  overdrift: [
    'M20 12a8 8 0 1 1-8-8',
    'M16.5 12a4.5 4.5 0 1 1-4.5-4.5',
    'M12.9 12a.9.9 0 1 1-.9-.9',
  ],
  ram: [
    'M5 6l6.5 6L5 18',
    'M12.5 6l6.5 6-6.5 6',
  ],
  drs: [
    'M3 17c6-.5 13-2 18-7.5-1.8 6.8-9.5 9.3-18 7.5z',
    'M12.5 14.7v-3.2',
    'M7.5 16v-2.6',
  ],
  copycat: [
    'M9.5 9.5H20V20H9.5z',
    'M14.5 9.5V4H4v10.5h5.5',
  ],
};
