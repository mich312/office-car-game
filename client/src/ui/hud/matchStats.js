// This match's shift report, measured on the client (nothing here is sent by
// the server, so nothing here is invented either): top speed, mini-turbos
// (and how many were tier 3), items picked up and used. It resets when a
// match is announced (phase → countdown) and samples telemetry through the
// hud loop while the match runs; the values stay put through the podium.
//   read:  matchStats.topSpeed / .miniTurbos / .tier3 / .pickups / .used
//          or matchStats.snapshot() for a plain copy
import { CAR_UNIT_M, PHASE } from '@rc/shared';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';
import { addHudWriter, removeHudWriter } from './hudLoop.js';

let turboBase = 0; // telemetry.miniTurbos is a running counter across matches
let seenTurbos = 0;
let peakTier = 0; // highest drift tier since the last mini-turbo fired

export const matchStats = {
  topSpeed: 0, // cm/s at toy scale, like the speed readout
  miniTurbos: 0,
  tier3: 0, // mini-turbos fired from a tier-3 (pink) drift
  pickups: 0,
  used: 0,
  reset() {
    this.topSpeed = 0;
    this.miniTurbos = 0;
    this.tier3 = 0;
    this.pickups = 0;
    this.used = 0;
    turboBase = telemetry.miniTurbos || 0;
    seenTurbos = turboBase;
    peakTier = 0;
  },
  snapshot() {
    const { topSpeed, miniTurbos, tier3, pickups, used } = this;
    return { topSpeed, miniTurbos, tier3, pickups, used };
  },
};

function sample() {
  const cms = Math.round(Math.abs(telemetry.speed || 0) * CAR_UNIT_M * 100);
  if (cms > matchStats.topSpeed) matchStats.topSpeed = cms;
  peakTier = Math.max(peakTier, telemetry.driftTier ?? 0);
  const turbos = telemetry.miniTurbos || 0;
  if (turbos !== seenTurbos) {
    if (turbos > seenTurbos && peakTier >= 3) matchStats.tier3 += turbos - seenTurbos;
    seenTurbos = turbos;
    peakTier = telemetry.driftTier ?? 0;
  }
  matchStats.miniTurbos = Math.max(0, turbos - turboBase);
}

const live = (phase) => phase === PHASE.COUNTDOWN || phase === PHASE.PLAYING;
let sampling = false;
function setSampling(on) {
  if (on === sampling) return;
  sampling = on;
  if (on) addHudWriter(sample);
  else removeHudWriter(sample);
}

// An emptied item slot is a use only if the car is still in the running a
// moment later: the server also empties it when you finish the race or get
// knocked out (room.js dropItem / modes.js), just before saying so.
let generation = 0;
function maybeUsed() {
  const gen = generation;
  setTimeout(() => {
    const st = useStore.getState();
    if (gen !== generation || !live(st.phase) || st.spectating || st.sumoDead || net.racePlace) return;
    matchStats.used++;
  }, 400);
}

// (module scope: the HUD chunk imports this once; a player joining mid-match
// starts counting from the moment the HUD loads)
const s0 = useStore.getState();
if (live(s0.phase)) { matchStats.reset(); setSampling(s0.phase === PHASE.PLAYING); }
useStore.subscribe((s, prev) => {
  const starting = s.phase === PHASE.COUNTDOWN && prev.phase !== PHASE.COUNTDOWN;
  if (starting) { matchStats.reset(); generation++; }
  setSampling(s.phase === PHASE.PLAYING);
  // (a new match also empties the slot: that is neither a pickup nor a use)
  if (!starting && live(s.phase) && live(prev.phase) && s.powerup !== prev.powerup) {
    if (!prev.powerup && s.powerup) matchStats.pickups++;
    else if (prev.powerup && !s.powerup) maybeUsed();
  }
});
