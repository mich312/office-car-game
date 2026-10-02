// Layout flags for the HUD root (SPEC-TOYBOX §4.1):
//   compact   landscape phone (max-height 500px): the dedicated px layout
//   touch     the touch pad carries speed / drift / boost / item / ability,
//             so the bottom corners hide and a pause button joins the clock
//   portrait  a phone held upright: the match shows only "turn sideways"
// <div className={`tb-hud ${layoutClass(useLayout())}`}>
import { useSyncExternalStore } from 'react';
import { useStore } from '../../store.js';

const QUERIES = {
  compact: '(max-height: 500px)',
  coarse: '(pointer: coarse)',
  portrait: '(orientation: portrait) and (max-width: 600px)',
};
const mqls = {};
const mql = (q) => {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return (mqls[q] ||= window.matchMedia(q));
};

export function useMedia(query) {
  return useSyncExternalStore(
    (cb) => {
      const m = mql(query);
      if (!m) return () => {};
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => !!mql(query)?.matches,
    () => false,
  );
}

export function useLayout() {
  const inputMode = useStore((s) => s.inputMode);
  const compact = useMedia(QUERIES.compact);
  const coarse = useMedia(QUERIES.coarse);
  const portrait = useMedia(QUERIES.portrait);
  const touch = inputMode === 'touch' || coarse;
  return { compact, touch, portrait: portrait && touch };
}

export const layoutClass = ({ compact, touch }) => [compact && 'is-compact', touch && 'is-touch'].filter(Boolean).join(' ');
