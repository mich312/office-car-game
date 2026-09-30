// The office floor's own dressing kinds, and the wall-base band its plain
// walls get (architecture.js). The shared kit (kinds/common.js) covers most
// of what an office has on its floor; these are the ones only an office has.
import { rbox, box } from '../../kit.js';

export const CLUTTER_KINDS = {
  // Cartons of copier paper, five reams a box, stacked by the printers.
  copierpaper: {
    size: (o) => [0.46, 0.27 * (o.n || 2), 0.31],
    collide: 'box',
    build(p, o, r) {
      const n = o.n || 2;
      for (let i = 0; i < n; i++) {
        p.at([(r() - 0.5) * 0.02, i * 0.27, (r() - 0.5) * 0.02], [0, (r() - 0.5) * 0.08, 0], () => {
          p.add('cardboard', rbox(0.44, 0.26, 0.3, 0.004, 1), [0, 0.13, 0]);
          p.add('paper', box(0.445, 0.06, 0.305), [0, 0.2, 0], null, null, '#f4f2ea');
          p.decal('parcel', 0.1, 0.07, [0.12, 0.09, 0.1512]);
        });
      }
      if (o.open) p.add('paper', rbox(0.21, 0.05, 0.297, 0.004, 1), [0, 0.27 * n + 0.025, 0], [0, 0.3, 0]);
    },
  },
  // A shredder on its bin: the cutting head, the window, confetti inside.
  shredder: {
    size: [0.4, 0.62, 0.3],
    collide: 'box',
    build(p) {
      p.add('plasticBlack', rbox(0.38, 0.5, 0.28, 0.02, 1), [0, 0.25, 0]);
      p.add('glassBlack', box(0.2, 0.22, 0.004), [0, 0.24, 0.141]);
      p.add('plasticGrey', rbox(0.4, 0.1, 0.3, 0.02, 1), [0, 0.55, 0]);
      p.add('plasticBlack', box(0.26, 0.004, 0.012), [0, 0.6, 0.02]);
      p.add('ledGreen', box(0.012, 0.004, 0.012), [0.15, 0.6, 0.1]);
      p.add('paper', box(0.19, 0.12, 0.004), [0, 0.2, 0.139], null, null, '#e9e6dc');
    },
  },
};

// The office's plain walls: double sockets every 3.6 m at 0.3 m, a white
// dado trunking round the work rooms, vents, scuffs where trolleys and RC
// cars have hit the paint, door stops, threshold strips where floors change.
export const BANDS = {
  'plain:office': {
    sockets: 3.6,
    trunking: ['open_office', 'printer', 'meeting', 'focus'],
    conduit: ['storage', 'server'],
    vents: 7,
    scuffs: 2.5,
    clips: ['lounge', 'games', 'cafeteria'],
    stops: true,
    thresholds: true,
    guards: true,
  },
  // the north windows get a floor convector along their inside face
  'glass:office': { convector: 'exterior' },
  // the balcony railings: a drain scupper now and then, and moss
  'low:office': { scuppers: 3.5 },
};
