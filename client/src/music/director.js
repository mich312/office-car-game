// Follows the game and tells the band what to play (musicFor in score.js).
// Runs outside React: a store subscription for the moments (phase changes,
// laps) plus a slow poll for the clock (the last 30 s has no event of its
// own).
import { MODES, raceLaps, mapById } from '@rc/shared';
import { useStore } from '../store.js';
import { audio } from '../audio.js';
import { music } from './player.js';
import { musicFor } from './score.js';

function read() {
  const s = useStore.getState();
  const prog = s.raceProgress?.[s.myId];
  return musicFor({
    screen: s.screen,
    phase: s.phase,
    modeId: s.modeId,
    timeLeft: s.endsAt ? (s.endsAt - Date.now()) / 1000 : null,
    lap: prog ? prog[0] : 0,
    laps: raceLaps(mapById(s.mapId), MODES.desk_dash?.laps || 0),
    alive: s.lcs?.alive ?? 0,
    spectating: s.spectating,
    event: s.event?.id || null,
  });
}

function update() {
  const { state, muffled } = read();
  // a cue auditioned in the garage plays until you leave for the office
  if (useStore.getState().screen === 'game') music.audition = null;
  music.setState(music.audition || state);
  music.setMuffled(muffled);
}

let started = false;
export function startMusicDirector() {
  if (started || typeof window === 'undefined') return;
  started = true;
  update(); // queue the right cue before the first note
  useStore.subscribe(update);
  setInterval(update, 500);
  // Browsers only let audio start from a user gesture: the first click, tap
  // or key anywhere brings the band in.
  const kick = () => {
    audio.start();
    music.start();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}
