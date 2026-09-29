import { assignVoices, RIVAL_VOICES } from './rivalVoices.js';

// Fully procedural WebAudio: tiny electric motors, tire squeal, impacts,
// rain, UI blips, and the score (music/). No asset files by default —
// everything is synthesized.
//
// The mix:  music ─ duck ─┐
//           engine ─┐     ├─ master ─ limiter ─ out
//           ambience ┼ sfx ┘
//           (one-shots) ┘
// Three player-facing faders: Master, Music, Effects (engine, ambience and
// one-shots together). The limiter keeps a pile-up of crashes from clipping;
// the duck stage dips the music under the moments that should cut through.
let ctx = null;
let master = null;
let limiter = null;
const bus = { music: null, duck: null, sfx: null, engine: null, amb: null };
let engine = null;
let skid = null;
let roll = null; // tyre-on-floor noise, voiced by the surface
let rain = null;
let muted = false;
const MASTER_LEVEL = 0.5; // headroom under the limiter at full fader
let vol = { master: 1, music: 0.7, effects: 1 };
const _dir = { x: 0, y: 0, z: -1 }; // scratch for the camera direction
const _ear = { x: 0, z: 0 }; // listener ground position, for voice allocation

function ensure() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return false; }
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  master = ctx.createGain();
  master.connect(limiter);
  bus.music = ctx.createGain();
  bus.duck = ctx.createGain();
  bus.music.connect(bus.duck); bus.duck.connect(master);
  bus.sfx = ctx.createGain(); bus.sfx.connect(master);
  bus.engine = ctx.createGain(); bus.engine.connect(bus.sfx);
  bus.amb = ctx.createGain(); bus.amb.connect(bus.sfx);
  applyVolumes();
  buildEngine();
  buildSkid();
  buildRoll();
  buildRain();
  return true;
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL * vol.master, t, 0.03);
  bus.music.gain.setTargetAtTime(vol.music, t, 0.03);
  bus.sfx.gain.setTargetAtTime(vol.effects, t, 0.03);
}

// Noise is noise: build each length once instead of on every impact.
const noiseCache = new Map();
function noiseBuffer(seconds = 1) {
  const hit = noiseCache.get(seconds);
  if (hit) return hit;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(seconds, buf);
  return buf;
}

// A panner placed in the world, feeding `dest`. Distance falls off gently
// (these are tiny cars in a big room) and nothing is heard past 80 units.
function spatial(at, dest) {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = 3;
  p.rolloffFactor = 1.1;
  p.maxDistance = 80;
  p.positionX.value = at[0]; p.positionY.value = at[1] || 0; p.positionZ.value = at[2];
  p.connect(dest);
  return p;
}
// one-shots go straight to the effects bus, or into the world when `at` is given
const sfxOut = (at) => (at ? spatial(at, bus.sfx) : bus.sfx);

// ---------------------------------------------------- rival engines
// A small pool of engine voices handed to the nearest rivals (rivalVoices.js)
// through panners: you hear who's on your bumper, and from which side.
const rivals = { slots: Array(RIVAL_VOICES).fill(null), voices: [] };
function rivalVoice(i) {
  if (rivals.voices[i]) return rivals.voices[i];
  const gain = ctx.createGain(); gain.gain.value = 0;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900;
  const panner = spatial([0, 0, 0], bus.engine);
  const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator();
  o1.connect(filter); o2.connect(filter); filter.connect(gain); gain.connect(panner);
  o1.start(); o2.start();
  return (rivals.voices[i] = { gain, filter, panner, o1, o2, car: null });
}

// Per-car engine voices: the same three-oscillator motor with a different
// personality per body style. `base`/`filter` are multipliers on the shared
// rev curve; `o2` is the beat-frequency detune, `o3` the whine harmonic.
const ENGINE_PROFILES = {
  buggy: { types: ['sawtooth', 'square', 'square'], o2: 1.03, o3: 2.02, base: 0.9, filter: 0.85, g3: 0.35 }, // raspy two-stroke
  drift: { types: ['sawtooth', 'sawtooth', 'sine'], o2: 1.01, o3: 3.02, base: 1.1, filter: 1.1, g3: 0.3 }, // smooth street whine
  monster: { types: ['square', 'sawtooth', 'square'], o2: 1.015, o3: 1.5, base: 0.62, filter: 0.6, g3: 0.4 }, // subwoofer growl
  formula: { types: ['sawtooth', 'sawtooth', 'square'], o2: 1.02, o3: 4.04, base: 1.35, filter: 1.4, g3: 0.22 }, // screaming single-seater
  balanced: { types: ['sawtooth', 'sawtooth', 'square'], o2: 1.02, o3: 2.01, base: 1.0, filter: 1.0, g3: 0.25 },
};
let engineProfile = ENGINE_PROFILES.balanced;

function buildEngine() {
  // Tiny RC motor: two detuned oscillators + a whiny harmonic through a lowpass
  const g = ctx.createGain();
  g.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const o1 = ctx.createOscillator(); o1.frequency.value = 70;
  const o2 = ctx.createOscillator(); o2.frequency.value = 71.5;
  const o3 = ctx.createOscillator(); o3.frequency.value = 140;
  const g3 = ctx.createGain();
  o1.connect(filter); o2.connect(filter); o3.connect(g3); g3.connect(filter);
  filter.connect(g); g.connect(bus.engine);
  o1.start(); o2.start(); o3.start();
  engine = { g, filter, o1, o2, o3, g3 };
  applyEngineProfile();
}

function applyEngineProfile() {
  if (!engine) return;
  const p = engineProfile;
  [engine.o1, engine.o2, engine.o3].forEach((o, i) => { o.type = p.types[i]; });
  engine.g3.gain.value = p.g3;
}

function buildSkid() {
  const g = ctx.createGain(); g.gain.value = 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(2); src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1.4;
  src.connect(bp); bp.connect(g); g.connect(bus.engine);
  src.start();
  skid = { g, bp };
}

// What the floor sounds like under the tyres: a hush on carpet, a woody
// rumble on hardwood, a clean hiss on tile, grit on concrete. One noise
// source, re-voiced per surface.
const ROLL_VOICE = {
  carpet: { f: 320, q: 0.7, g: 0.05 }, carpet2: { f: 320, q: 0.7, g: 0.05 }, rug: { f: 260, q: 0.6, g: 0.045 },
  wood: { f: 620, q: 1.4, g: 0.09 }, tile: { f: 1700, q: 0.9, g: 0.06 },
  concrete: { f: 2400, q: 0.5, g: 0.11 }, dark: { f: 900, q: 1, g: 0.07 },
};
function buildRoll() {
  const g = ctx.createGain(); g.gain.value = 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(2); src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1;
  src.connect(bp); bp.connect(g); g.connect(bus.engine);
  src.start();
  roll = { g, bp };
}

function buildRain() {
  const g = ctx.createGain(); g.gain.value = 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(3); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(bus.amb);
  src.start();
  rain = { g };
}

export const audio = {
  start() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
  setMuted(m) {
    muted = m;
    applyVolumes();
  },
  // faders, each 0…1 (safe to call before audio starts)
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVolumes();
  },
  // Dip the music under a moment that has to cut through (a big crash, a
  // goal, the podium), then bring it back. Deeper calls win; the recovery
  // restarts from wherever the duck is now, so overlapping ducks never jump.
  duck(depth = 0.5, hold = 0.25, release = 0.8) {
    if (!ctx) return;
    const g = bus.duck.gain, t = ctx.currentTime;
    const target = Math.max(0.05, 1 - depth);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(g.value, 1), t);
    g.linearRampToValueAtTime(Math.min(g.value, target), t + 0.04);
    g.setValueAtTime(Math.min(g.value, target), t + 0.04 + hold);
    g.linearRampToValueAtTime(1, t + 0.04 + hold + release);
  },
  // The ears follow the camera: position plus where it's looking.
  setListener(camera) {
    if (!ctx) return;
    const L = ctx.listener, p = camera.position, t = ctx.currentTime;
    // looking down the camera's −Z axis (column 3 of its world matrix)
    const e = camera.matrixWorld.elements;
    const len = Math.hypot(e[8], e[9], e[10]) || 1;
    _dir.x = -e[8] / len; _dir.y = -e[9] / len; _dir.z = -e[10] / len;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(_dir.x, t, 0.02); L.forwardY.setTargetAtTime(_dir.y, t, 0.02); L.forwardZ.setTargetAtTime(_dir.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(_dir.x, _dir.y, _dir.z, 0, 1, 0);
    }
    _ear.x = p.x; _ear.z = p.z;
  },
  // cars: [{ id, x, y, z, speed, car, boosting }] — every remote car; the
  // nearest few get voices, the rest stay silent
  updateRivals(cars) {
    if (!ctx || ctx.state !== 'running') return;
    rivals.slots = assignVoices(_ear, cars, rivals.slots);
    const t = ctx.currentTime;
    for (let i = 0; i < rivals.slots.length; i++) {
      const id = rivals.slots[i];
      const v = rivalVoice(i);
      const c = id && cars.find((k) => k.id === id);
      if (!c) { v.gain.gain.setTargetAtTime(0, t, 0.12); continue; }
      if (v.car !== c.car) {
        const prof = ENGINE_PROFILES[c.car] || ENGINE_PROFILES.balanced;
        v.o1.type = prof.types[0]; v.o2.type = prof.types[1];
        v.car = c.car; v.prof = prof;
      }
      const r = Math.min(1, Math.abs(c.speed) / 18);
      const base = (60 + r * 340 + (c.boosting ? 130 : 0)) * v.prof.base;
      v.o1.frequency.setTargetAtTime(base, t, 0.06);
      v.o2.frequency.setTargetAtTime(base * v.prof.o2, t, 0.06);
      v.filter.frequency.setTargetAtTime((500 + r * 2200) * v.prof.filter, t, 0.08);
      v.gain.gain.setTargetAtTime(0.02 + r * 0.08 + (c.boosting ? 0.03 : 0), t, 0.08);
      v.panner.positionX.setTargetAtTime(c.x, t, 0.05);
      v.panner.positionY.setTargetAtTime(c.y, t, 0.05);
      v.panner.positionZ.setTargetAtTime(c.z, t, 0.05);
    }
  },
  // which rivals hold a voice right now (debugging / headless checks)
  get rivalSlots() { return [...rivals.slots]; },
  // everyone's gone (back to the garage): silence the pool
  silenceRivals() {
    if (!ctx) return;
    rivals.slots.fill(null);
    for (const v of rivals.voices) v?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  },
  // for the music player and the rival voices: the context and the buses
  graph() { return ensure() ? { ctx, bus, noiseBuffer } : null; },
  // pick the voice for the selected car (safe to call before audio starts)
  setEngineProfile(carId) {
    engineProfile = ENGINE_PROFILES[carId] || ENGINE_PROFILES.balanced;
    applyEngineProfile();
  },
  // called every frame from the car
  update({ speed = 0, throttle = 0, slipping = false, boosting = false, topSpeed = 50, surface = null }) {
    if (!engine) return;
    if (roll) {
      const v = ROLL_VOICE[surface];
      const r = Math.min(1, Math.abs(speed) / topSpeed);
      const tr = ctx.currentTime;
      roll.g.gain.setTargetAtTime(v ? v.g * r : 0, tr, 0.08);
      if (v) { roll.bp.frequency.setTargetAtTime(v.f * (0.8 + r * 0.5), tr, 0.1); roll.bp.Q.setTargetAtTime(v.q, tr, 0.1); }
    }
    const p = engineProfile;
    const r = Math.min(1, Math.abs(speed) / topSpeed);
    const base = (60 + r * 340 + (boosting ? 130 : 0)) * p.base;
    const t = ctx.currentTime;
    engine.o1.frequency.setTargetAtTime(base, t, 0.05);
    engine.o2.frequency.setTargetAtTime(base * p.o2, t, 0.05);
    engine.o3.frequency.setTargetAtTime(base * p.o3, t, 0.05);
    engine.filter.frequency.setTargetAtTime((500 + r * 2600 + (boosting ? 1500 : 0)) * p.filter, t, 0.08);
    const vol = 0.05 + r * 0.13 + Math.abs(throttle) * 0.05 + (boosting ? 0.08 : 0);
    engine.g.gain.setTargetAtTime(vol, t, 0.07);
    skid.g.gain.setTargetAtTime(slipping ? 0.16 : 0, t, slipping ? 0.03 : 0.12);
    skid.bp.frequency.setTargetAtTime(600 + r * 900, t, 0.05);
  },
  setRain(amount) {
    if (rain) rain.g.gain.setTargetAtTime(amount * 0.12, ctx.currentTime, 0.4);
  },
  impact(strength = 1, at = null) {
    if (!ensure()) return;
    const g = ctx.createGain();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 300 + Math.min(1, strength) * 1800;
    src.connect(lp); lp.connect(g); g.connect(sfxOut(at));
    const t = ctx.currentTime;
    const v = Math.min(0.5, 0.1 + strength * 0.2);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.start(t); src.stop(t + 0.3);
  },
  // Landing: a low body thump (a falling sine) under a short muffled crunch.
  // Distinct from impact(), which is a bright noise hit — a landing is the
  // suspension bottoming out, not the bodywork.
  thud(strength = 1) {
    if (!ensure()) return;
    const s = Math.min(1, strength);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1 + s * 0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(bus.sfx);
    o.start(t); o.stop(t + 0.25);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.15);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + s * 700;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.04 + s * 0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(lp); lp.connect(ng); ng.connect(bus.sfx);
    src.start(t); src.stop(t + 0.15);
  },
  // A wheel crossing a tile's grout line or a plank joint.
  seam(surface, strength = 0.5) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = surface === 'wood' ? 850 : 3200; bp.Q.value = surface === 'wood' ? 3 : 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 + 0.1 * Math.min(1, strength), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (surface === 'wood' ? 0.03 : 0.018));
    src.connect(bp); bp.connect(g); g.connect(bus.engine);
    src.start(t); src.stop(t + 0.05);
  },
  // Drift tier reached: a rising chime per tier, so you can hear the charge
  // without looking down at the rear wheels.
  driftTier(tier) {
    const f = [660, 880, 1175][tier - 1] || 880;
    this.blip(f, 0.12, 0.1);
    if (tier === 3) setTimeout(() => this.blip(f * 1.5, 0.16, 0.09), 70);
  },
  glass() {
    if (!ensure()) return;
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = 1800 + Math.random() * 3800;
      const g = ctx.createGain();
      const t = ctx.currentTime + Math.random() * 0.08;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + Math.random() * 0.3);
      o.connect(g); g.connect(bus.sfx);
      o.start(t); o.stop(t + 0.8);
    }
  },
  blip(freq = 880, dur = 0.09, vol = 0.12) {
    if (!ensure()) return;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // Dual-tone car horn; vol lets remote honks attenuate with distance.
  horn(vol = 1, at = null) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const dest = sfxOut(at); // one panner for both tones
    for (const f of [400, 505]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07 * vol, t + 0.02);
      g.gain.setValueAtTime(0.07 * vol, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.33);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.36);
    }
  },
  // The balcony scream: falling pitch with a panicked vibrato.
  scream(vol = 0.8) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 1.1);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9;
    const lfoG = ctx.createGain(); lfoG.gain.value = 40;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.13 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    o.connect(lp); lp.connect(g); g.connect(bus.sfx);
    o.start(t); o.stop(t + 1.2); lfo.start(t); lfo.stop(t + 1.2);
  },
  zap() { this.sweep(1400, 90, 0.5, 0.2); }, // Last Car Standing elimination
  pickup() { this.blip(660, 0.08); setTimeout(() => this.blip(990, 0.1), 70); },
  deliver() { this.blip(523, 0.08); setTimeout(() => this.blip(659, 0.08), 80); setTimeout(() => this.blip(784, 0.14), 160); },
  boostFire() { this.sweep(220, 880, 0.35, 0.14); },
  jump() { this.sweep(300, 520, 0.12, 0.08); },
  stun() { this.sweep(700, 120, 0.4, 0.16); },
  goal() { this.sweep(392, 784, 0.5, 0.2); setTimeout(() => this.sweep(523, 1046, 0.5, 0.18), 180); },
  sweep(f1, f2, dur, vol) {
    if (!ensure()) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    o.connect(lp); lp.connect(g); g.connect(bus.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  },
};

// headless testing / debugging, alongside window.__rcStore and __rcTelemetry
if (typeof window !== 'undefined') window.__rcAudio = audio;
