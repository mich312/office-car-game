// UI-level state (React re-renders). High-frequency net data lives in net.js.
import { create } from 'zustand';
import { UNLOCKS, sanitizeStyle, sanitizeTune, STOCK_TUNE, TUNE_PRESETS } from '@rc/shared';

const saved = (() => {
  try { return JSON.parse(localStorage.getItem('rc-mayhem') || '{}'); } catch { return {}; }
})();

let focusTimer = null;

export const useStore = create((set, get) => ({
  // (exposed below as window.__rcStore for headless testing / debugging,
  // matching the existing window.__rcTelemetry affordance)
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
  itId: null, // tag mode: who is It
  sumoRound: 0,
  sumoOutLeft: null, // seconds until elimination while outside the sumo zone
  sumoDead: false, // eliminated for the current sumo round
  feed: [], // [{ key, text }]
  event: null, // { id, name, icon, desc, until }
  podium: null,
  powerup: null,
  timeOfDay: 'golden', // hour of the office day — see game/daylight.js
  night: false, // derived from timeOfDay; kept so consumers can ask the cheap question
  photoMode: false,
  muted: !!saved.muted,
  // assist: throttle defaults to full when idle — defaults ON for touch
  autoGas: saved.autoGas !== undefined
    ? !!saved.autoGas
    : (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches),
  eventWarn: null, // { id, name, icon, startsIn } — telegraphed office event
  spectating: false, // eliminated in Last Car Standing → drone cam
  spectateTarget: null, // name of the car the drone cam is following
  lcs: null, // { locked: [roomIds], warn: { room, until }, alive }
  rivalry: null, // { name, n } — your most-bumped partner last match
  nemesis: null, // { a, b, n } — the match's top feud
  mutator: null, // active mutator id for this round
  cup: null, // { round, total, standings?, final? } — Office Cup progress
  abilityReadyAt: 0, // my special-ability cooldown (server-stamped)
  printerFlashUntil: 0, // blinded by the printer until this timestamp
  // Garage preview: which part of the car the bench camera is looking at.
  // Set when you change a bolt-on, cleared a few seconds later so the
  // turntable goes back to its slow spin.
  focus: null, // 'front' | 'rear' | 'side' | 'roof' | 'wheel' | null

  // profile / progression
  name: saved.name || '',
  car: saved.car || 'balanced',
  paint: saved.paint || null,
  cos: saved.cos || {}, // equipped cosmetics: { hat, antenna, trail }
  style: sanitizeStyle(saved.style), // wheels/spoiler/vinyl/underglow build
  tune: sanitizeTune(saved.tune), // gearing/tyres/springs/wing/ballast sheet
  xp: saved.xp || 0,

  set,
  setStyle(patch) {
    set((s) => ({ style: sanitizeStyle({ ...s.style, ...patch }) }));
    get().save();
  },
  setTune(patch) {
    set((s) => ({ tune: sanitizeTune({ ...s.tune, ...patch }) }));
    get().save();
  },
  applyTunePreset(id) {
    const preset = TUNE_PRESETS[id];
    set({ tune: sanitizeTune(preset ? preset.tune : STOCK_TUNE) });
    get().save();
  },
  save() {
    const { name, car, paint, cos, style, tune, xp, muted, autoGas } = get();
    // guarded like the read at the top: where storage is blocked (quota,
    // restricted embed) a throw here would abort whatever gameplay handler
    // called us — e.g. addXp inside MATCH_END would kill the podium events
    try {
      localStorage.setItem('rc-mayhem', JSON.stringify({ name, car, paint, cos, style, tune, xp, muted, autoGas }));
    } catch { /* profile just doesn't persist */ }
  },
  setFocus(region) {
    set({ focus: region });
    clearTimeout(focusTimer);
    if (region) focusTimer = setTimeout(() => set({ focus: null }), 4200);
  },
  equip(slot, value) {
    set((s) => ({ cos: { ...s.cos, [slot]: value || undefined } }));
    get().save();
  },
  addXp(n) {
    set((s) => ({ xp: s.xp + n }));
    get().save();
  },
  unlocked() {
    const xp = get().xp;
    return UNLOCKS.filter((u) => u.xp <= xp);
  },
  setTimeOfDay(id) {
    set({ timeOfDay: id, night: id === 'night' });
  },
  pushFeed(text) {
    const key = Math.random();
    set((s) => ({ feed: [...s.feed.slice(-5), { key, text }] }));
    // remove THIS item, not feed[0]: when a burst overflows the 6-item cap,
    // the capped-out items' timers would otherwise eat newer messages early
    setTimeout(() => set((s) => ({ feed: s.feed.filter((f) => f.key !== key) })), 6000);
  },
}));

if (typeof window !== 'undefined') window.__rcStore = useStore;
