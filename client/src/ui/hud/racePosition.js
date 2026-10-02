// Your place in the match, computed on the client from what the HUD already
// has (no server field for it): SPEC-TOYBOX §4.2.
//   Desk Dash: (lap, checkpoint, −distance to the next checkpoint) from the
//     store's raceProgress + the last snapshot of each car (yours from
//     telemetry); finished cars sort first by their lap count.
//   Every other mode: by score, ties share the place.
// standings() returns the whole order (the Tab standings use it too).
import { MODES, raceCheckpoints, raceLaps } from '@rc/shared';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';

// a car's floor position: yours from telemetry, the others' last snapshot
export function carPos(st, id) {
  if (id === st.myId) return [telemetry.x, telemetry.z];
  const buf = net.remotes.get(id);
  const s = buf?.[buf.length - 1];
  return s ? [s.p[0], s.p[2]] : null;
}

// → [{ id, place }] best first (places shared on equal scores outside the race)
export function standings(st, map) {
  const ids = Object.keys(st.players);
  if (!ids.length) return [];
  if (st.modeId === 'desk_dash' && map) {
    const cps = raceCheckpoints(st.variant, map);
    const n = cps.length || 1;
    const laps = raceLaps(map, MODES.desk_dash.laps);
    const key = (id) => {
      const [lap = 0, cp = 0] = st.raceProgress[id] || [];
      // a finished car's progress reads [laps, 0]: its finish bonus orders
      // the finishers (strictly decreasing by place, server modes.js)
      if (lap >= laps) return lap * 1e6 + (st.scores[id] || 0);
      const p = carPos(st, id);
      const c = cps[cp % n];
      return lap * 1e6 + cp * 1e3 - (p && c ? Math.hypot(p[0] - c.x, p[1] - c.z) : 999);
    };
    const keyed = ids.map((id) => ({ id, k: key(id) }));
    keyed.sort((a, b) => b.k - a.k);
    // your own finish is the server's word, not a sort (net.racePlace)
    const order = keyed.map((e) => e.id);
    if (net.racePlace && order.includes(st.myId)) {
      order.splice(order.indexOf(st.myId), 1);
      order.splice(Math.min(order.length, net.racePlace - 1), 0, st.myId);
    }
    return order.map((id, i) => ({ id, place: i + 1 }));
  }
  const score = (id) => st.scores[id] || 0;
  const sorted = [...ids].sort((a, b) => score(b) - score(a));
  return sorted.map((id) => ({ id, place: 1 + sorted.filter((o) => score(o) > score(id)).length }));
}

export function racePosition(st, map) {
  const all = standings(st, map);
  const me = all.find((e) => e.id === st.myId);
  return { place: me ? me.place : all.length || 1, of: Math.max(1, all.length) };
}
