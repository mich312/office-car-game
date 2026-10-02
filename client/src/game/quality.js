// The graphics setting, as every renderer piece reads it.
//
//   high    everything: AO, the far depth blur, grain, 4096 shadows
//   medium  no depth blur, no grain; AO and the grade stay
//   low     the ?lowfx path: no post chain at all (the renderer's own ACES
//           and exposure), low shadow tier, lower resolution
//
// The store holds the player's choice (`gfx`, set by the settings UI);
// ?gfx=high|medium|low overrides it (support, screenshots) and ?lowfx means
// low, as it always has. Absent both, high — shadow quality still steps down
// on its own if the machine can't hold frame rate (Lighting.jsx).
import { useStore } from '../store.js';

const Q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const URL_GFX = Q.has('lowfx') ? 'low' : Q.get('gfx');
const LEVELS = ['high', 'medium', 'low'];

export const gfxLevel = (stored) => (LEVELS.includes(URL_GFX) ? URL_GFX : LEVELS.includes(stored) ? stored : 'high');
export const useGfx = () => gfxLevel(useStore((s) => s.gfx));
