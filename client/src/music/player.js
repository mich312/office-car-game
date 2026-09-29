// Plays the score (score.js) through the music bus. A look-ahead scheduler
// on the audio clock — not the frame clock — so the groove holds steady
// whatever the renderer is doing: every 25 ms it books the notes falling in
// the next 150 ms at sample-accurate times.
//
// Cue changes land on the next bar line, so the band never stumbles; the one
// exception is countdown → race, which drops the instant GO fires.
//
// Commissioned music instead? Put audio files in client/public/music/ with a
// manifest.json mapping states to files, e.g.
//   { "garage": "garage.ogg", "lobby": "lobby.ogg", "race": "race.ogg",
//     "intense": "intense.ogg", "podium": "podium.ogg" }
// and the player loops those (crossfading between cues) instead of
// synthesizing. States missing from the manifest keep the synthesized cue.
import { audio } from '../audio.js';
import { barEvents, STEPS, stepSeconds, swingOffset } from './score.js';

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

let g = null; // { ctx, bus, noiseBuffer }
let out = null; // player gain → tone filter → music bus
let tone = null;
let timer = null;
let state = null; // what's playing
let pending = null; // what's next, from the next bar line
let dropNow = false;
let bar = 0, step = 0, nextAt = 0;
let barNotes = null; // step → [events] for the current bar
let muffled = false;
let files = null; // state → AudioBuffer, when a manifest was found
let fileVoice = null; // { state, src, gain }

// ------------------------------------------------------------ instruments
function env(gainNode, t, peak, attack, decay, sustain = 0.0001, len = 0, release = 0.05) {
  const p = gainNode.gain;
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + attack);
  if (len > 0) {
    p.setTargetAtTime(Math.max(sustain, 0.0001), t + attack, decay / 3);
    p.setValueAtTime(Math.max(sustain, 0.0001), t + len);
    p.exponentialRampToValueAtTime(0.0001, t + len + release);
  } else {
    p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
}

function noise(t, dur, type, freq, q = 0.7) {
  const { ctx, noiseBuffer } = g;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(1);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const a = ctx.createGain();
  src.connect(f); f.connect(a); a.connect(out);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  a.filter = f;
  return a;
}

function osc(t, dur, type, freq, dest) {
  const o = g.ctx.createOscillator();
  o.type = type; o.frequency.value = freq;
  o.connect(dest);
  o.start(t); o.stop(t + dur + 0.1);
  return o;
}

const INSTRUMENTS = {
  kick(t, e) {
    const a = g.ctx.createGain(); a.connect(out);
    const o = osc(t, 0.4, 'sine', 140, a);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(a, t, 0.9 * e.vel, 0.002, 0.34);
  },
  snare(t, e) {
    env(noise(t, 0.2, 'bandpass', 1900, 0.9), t, 0.42 * e.vel, 0.001, 0.17);
    const a = g.ctx.createGain(); a.connect(out);
    osc(t, 0.1, 'triangle', 190, a);
    env(a, t, 0.25 * e.vel, 0.001, 0.08);
  },
  rim(t, e) { env(noise(t, 0.05, 'highpass', 3200), t, 0.2 * e.vel, 0.001, 0.035); },
  hat(t, e) { env(noise(t, 0.05, 'highpass', 7500), t, 0.16 * e.vel, 0.001, 0.035); },
  open(t, e, len) { env(noise(t, len, 'highpass', 6500), t, 0.13 * e.vel, 0.002, Math.min(0.28, len)); },
  crash(t, e) { env(noise(t, 1.6, 'highpass', 5200), t, 0.12 * e.vel, 0.003, 1.4); },
  bass(t, e, len) {
    const f = g.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1600, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    const a = g.ctx.createGain(); f.connect(a); a.connect(out);
    osc(t, len, 'sawtooth', mtof(e.midi), f);
    osc(t, len, 'square', mtof(e.midi - 12), f);
    env(a, t, 0.32 * e.vel, 0.004, 0.2, 0.18 * e.vel, len * 0.92, 0.04);
  },
  keys(t, e, len) {
    const f = g.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const a = g.ctx.createGain(); f.connect(a); a.connect(out);
    const o1 = osc(t, len + 0.2, 'triangle', mtof(e.midi), f); o1.detune.value = -5;
    const o2 = osc(t, len + 0.2, 'triangle', mtof(e.midi), f); o2.detune.value = 5;
    osc(t, len + 0.2, 'sine', mtof(e.midi + 12), f);
    env(a, t, 0.07 * e.vel, 0.003, 0.22, 0.02, len, 0.12);
  },
  pad(t, e, len) {
    const f = g.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
    const a = g.ctx.createGain(); f.connect(a); a.connect(out);
    for (const d of [-9, 9]) { const o = osc(t, len + 0.8, 'sawtooth', mtof(e.midi), f); o.detune.value = d; }
    const p = a.gain;
    p.setValueAtTime(0.0001, t);
    const lvl = (state === 'countdown' ? 0.085 : 0.045) * e.vel; // the countdown pad carries the tension alone
    p.linearRampToValueAtTime(lvl, t + Math.min(0.6, len * 0.4));
    p.setValueAtTime(lvl, t + len);
    p.linearRampToValueAtTime(0.0001, t + len + 0.7);
  },
  arp(t, e, len) {
    const f = g.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const pan = g.ctx.createStereoPanner(); pan.pan.value = (e.step % 2 ? 0.35 : -0.35);
    const a = g.ctx.createGain(); f.connect(a); a.connect(pan); pan.connect(out);
    osc(t, len, 'square', mtof(e.midi), f);
    env(a, t, 0.045 * e.vel, 0.002, Math.min(0.1, len));
  },
  lead(t, e, len) {
    const f = g.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
    const a = g.ctx.createGain(); f.connect(a); a.connect(out);
    const o = osc(t, len + 0.15, 'sawtooth', mtof(e.midi), f);
    const lfo = g.ctx.createOscillator(); lfo.frequency.value = 5.5;
    const depth = g.ctx.createGain(); depth.gain.value = 14; // cents of vibrato
    lfo.connect(depth); depth.connect(o.detune);
    lfo.start(t + 0.12); lfo.stop(t + len + 0.2);
    env(a, t, 0.06 * e.vel, 0.01, 0.3, 0.045 * e.vel, len, 0.12);
  },
  riser(t, e, len) {
    const a = noise(t, len, 'bandpass', 400, 2);
    a.filter.frequency.setValueAtTime(400, t);
    a.filter.frequency.exponentialRampToValueAtTime(4200, t + len);
    const p = a.gain;
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(0.22 * e.vel, t + len);
    p.linearRampToValueAtTime(0.0001, t + len + 0.05);
  },
};

// --------------------------------------------------------------- engine
function setupGraph() {
  if (g) return true;
  g = audio.graph();
  if (!g) return false;
  tone = g.ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 18000;
  out = g.ctx.createGain(); out.gain.value = 1;
  out.connect(tone); tone.connect(g.bus.music);
  loadManifest();
  return true;
}

async function loadManifest() {
  try {
    const res = await fetch('music/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const map = await res.json();
    const loaded = {};
    await Promise.all(Object.entries(map).map(async ([st, url]) => {
      const buf = await (await fetch(`music/${url}`)).arrayBuffer();
      loaded[st] = await g.ctx.decodeAudioData(buf);
    }));
    files = loaded;
    if (state) playFile(state); // switch over if a file now covers the current cue
  } catch { /* no manifest: the synthesized score it is */ }
}

function playFile(st) {
  const t = g.ctx.currentTime;
  if (fileVoice) {
    fileVoice.gain.gain.setTargetAtTime(0.0001, t, 0.5);
    fileVoice.src.stop(t + 2);
    fileVoice = null;
  }
  const buf = files?.[st];
  if (!buf) return false;
  const src = g.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const gain = g.ctx.createGain(); gain.gain.value = 0.0001;
  src.connect(gain); gain.connect(out);
  src.start(t);
  gain.gain.setTargetAtTime(0.8, t, 0.5);
  fileVoice = { state: st, src, gain };
  return true;
}

function toneFor() {
  if (muffled) return 700; // through a wall
  if (state === 'garage') return 5200; // warm, late-night workshop radio
  return 18000;
}

function applyTone() {
  if (tone) tone.frequency.setTargetAtTime(toneFor(), g.ctx.currentTime, 0.25);
}

function loadBar() {
  barNotes = new Map();
  if (files?.[state]) return; // a file is covering this cue
  for (const e of barEvents(state, bar)) {
    if (!barNotes.has(e.step)) barNotes.set(e.step, []);
    barNotes.get(e.step).push(e);
  }
}

function schedule() {
  const ctx = g.ctx;
  while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
    if (step === 0) {
      if (pending && pending !== state) {
        state = pending;
        applyTone();
        if (files) playFile(state);
        bar = 0;
      }
      pending = null;
      loadBar();
    }
    const sec = stepSeconds(state);
    const t = nextAt + swingOffset(state, step);
    for (const e of barNotes.get(step) || []) INSTRUMENTS[e.inst]?.(t, e, e.len * sec);
    nextAt += sec;
    step = (step + 1) % STEPS;
    if (step === 0) bar++;
  }
}

function tick() {
  if (!g || g.ctx.state !== 'running') return;
  if (dropNow) {
    // countdown → race: cut the bar short and land the downbeat now
    dropNow = false;
    step = 0;
    nextAt = g.ctx.currentTime + 0.03;
  }
  schedule();
}

export const music = {
  // Needs a user gesture first (browsers won't start audio without one);
  // calling it early is harmless.
  start() {
    if (!setupGraph() || timer) return;
    nextAt = g.ctx.currentTime + 0.1;
    step = 0; bar = 0;
    if (!state) state = pending || 'garage';
    pending = null;
    applyTone();
    if (files) playFile(state);
    loadBar();
    timer = setInterval(tick, TICK_MS);
  },
  setState(next) {
    if (!timer) { state = next; return; }
    if (next === state) { pending = null; return; } // changed its mind before the bar line
    pending = next;
    if (state === 'countdown' && (next === 'race' || next === 'intense')) dropNow = true;
  },
  setMuffled(m) {
    if (m === muffled) return;
    muffled = m;
    applyTone();
  },
  get state() { return state; },
  // the garage SOUND tab can preview any cue; the director defers to it
  audition: null,
};

if (typeof window !== 'undefined') window.__rcMusic = music;
