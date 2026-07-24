// Fully procedural WebAudio: tiny electric motors, tire squeal, impacts,
// rain, UI blips. No asset files — everything is synthesized.
let ctx = null;
let master = null;
let engine = null;
let skid = null;
let rain = null;
let muted = false;

function ensure() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return false; }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  buildEngine();
  buildSkid();
  buildRain();
  return true;
}

function noiseBuffer(seconds = 1) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
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
  filter.connect(g); g.connect(master);
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
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start();
  skid = { g, bp };
}

function buildRain() {
  const g = ctx.createGain(); g.gain.value = 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(3); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
  src.start();
  rain = { g };
}

export const audio = {
  start() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
  setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  },
  // pick the voice for the selected car (safe to call before audio starts)
  setEngineProfile(carId) {
    engineProfile = ENGINE_PROFILES[carId] || ENGINE_PROFILES.balanced;
    applyEngineProfile();
  },
  // called every frame from the car
  update({ speed = 0, throttle = 0, slipping = false, boosting = false, topSpeed = 50 }) {
    if (!engine) return;
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
  impact(strength = 1) {
    if (!ensure()) return;
    const g = ctx.createGain();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 300 + Math.min(1, strength) * 1800;
    src.connect(lp); lp.connect(g); g.connect(master);
    const t = ctx.currentTime;
    const v = Math.min(0.5, 0.1 + strength * 0.2);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.start(t); src.stop(t + 0.3);
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
      o.connect(g); g.connect(master);
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
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // Dual-tone car horn; vol lets remote honks attenuate with distance.
  horn(vol = 1) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    for (const f of [400, 505]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07 * vol, t + 0.02);
      g.gain.setValueAtTime(0.07 * vol, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.33);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      o.connect(lp); lp.connect(g); g.connect(master);
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
    o.connect(lp); lp.connect(g); g.connect(master);
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
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  },
};
