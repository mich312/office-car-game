// UI-level state (React re-renders). High-frequency net data lives in net.js.
import { create } from 'zustand';
import { UNLOCKS } from '@rc/shared';

const saved = (() => {
  try { return JSON.parse(localStorage.getItem('rc-mayhem') || '{}'); } catch { return {}; }
})();

export const useStore = create((set, get) => ({
  screen: 'menu', // 'menu' | 'game'
  connected: false,
  connectError: null,
  myId: null,
  phase: 'lobby',
  modeId: null,
  endsAt: 0,
  countdownEnd: 0,
  players: {}, // id → { name, car, paint, ready, bot, team }
  votes: {},
  scores: {},
  teamScores: [0, 0],
  raceProgress: {}, // id → [lap, cp]
  myBeans: 0,
  feed: [], // [{ key, text }]
  event: null, // { id, name, icon, desc, until }
  podium: null,
  powerup: null,
  night: false,
  photoMode: false,
  muted: !!saved.muted,
  autoGas: !!saved.autoGas, // assist: throttle defaults to full when idle
  eventWarn: null, // { id, name, icon, startsIn } — telegraphed office event

  // profile / progression
  name: saved.name || '',
  car: saved.car || 'balanced',
  paint: saved.paint || null,
  xp: saved.xp || 0,

  set,
  save() {
    const { name, car, paint, xp, muted, autoGas } = get();
    localStorage.setItem('rc-mayhem', JSON.stringify({ name, car, paint, xp, muted, autoGas }));
  },
  addXp(n) {
    set((s) => ({ xp: s.xp + n }));
    get().save();
  },
  unlocked() {
    const xp = get().xp;
    return UNLOCKS.filter((u) => u.xp <= xp);
  },
  pushFeed(text) {
    set((s) => ({ feed: [...s.feed.slice(-5), { key: Math.random(), text }] }));
    setTimeout(() => set((s) => ({ feed: s.feed.slice(1) })), 6000);
  },
}));
