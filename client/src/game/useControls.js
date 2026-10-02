// Keyboard (+ mouse button) input, read imperatively from useFrame.
import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { DAYLIGHT, hourAfter } from './daylight.js';
import { send } from '../net.js';
import { MSG, EMOTES } from '@rc/shared';
import { audio } from '../audio.js';

// On-screen touch buttons write here (gamepad axis conventions: steer -1 =
// left). Read and merged by poll() below.
export const touchInput = { steer: 0, throttle: 0, brake: 0, drift: false, boost: false };

// Which device is driving — 'keys' | 'pad' | 'touch' — so prompts name the
// button you'd actually press. Whatever was used last wins; the store only
// hears about a change.
const setInputMode = (m) => { if (useStore.getState().inputMode !== m) useStore.setState({ inputMode: m }); };
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => setInputMode('keys'), true);
  window.addEventListener('touchstart', () => setInputMode('touch'), { capture: true, passive: true });
}

const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'drift', ShiftRight: 'drift',
  KeyB: 'boost', ControlLeft: 'boost', Space: 'boost',
};

// The Break Room (pause menu) is open: the match keeps running, but the car
// is left alone. Keys and one-shots are ignored (except M), the pad and the
// touch pad read as released, and whatever was held is let go on open.
const paused = () => useStore.getState().breakRoom;
// Gamepad Back/Select opens and closes it (Start stays respawn, and closes it too).
const toggleBreakRoom = () => useStore.setState((s) => ({ breakRoom: !s.breakRoom }));

export function useControls() {
  const keys = useRef({
    fwd: false, back: false, left: false, right: false, drift: false, boost: false,
    gpSteer: 0, gpThrottle: 0, gpBrake: 0, gpDrift: false, gpBoost: false,
  });
  useEffect(() => {
    // Gamepad: standard mapping — left stick / d-pad steer, RT gas, LT brake,
    // A/B boost, X/LB drift, Y item, RB car special, Start respawn. Polled per
    // physics step from LocalCar via keys.current.poll(). The on-screen
    // touch controls merge into the same channels.
    let prevUse = false, prevRespawn = false, prevAbility = false, prevBack = false;
    keys.current.poll = () => {
      const k = keys.current;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (const p of pads) if (p && p.connected) { gp = p; break; }
      if (gp) {
        const back = !!gp.buttons[8]?.pressed;
        if (back && !prevBack) toggleBreakRoom();
        prevBack = back;
      }
      if (paused()) {
        // Start closes it; nothing else reaches the car. A whisper of
        // throttle keeps auto-gas (which fills in a zero throttle) from
        // driving off on its own: the car coasts.
        const start = !!gp?.buttons[9]?.pressed;
        if (start && !prevRespawn) useStore.setState({ breakRoom: false });
        prevRespawn = start;
        prevUse = !!gp?.buttons[3]?.pressed;
        prevAbility = !!gp?.buttons[5]?.pressed;
        k.gpSteer = 0; k.gpThrottle = 1e-6; k.gpBrake = 0; k.gpDrift = false; k.gpBoost = false;
        return;
      }
      let steer = 0, thr = 0, brk = 0, drift = false, boost = false;
      if (gp) {
        const btn = (i) => !!gp.buttons[i]?.pressed;
        if (gp.buttons.some((b) => b.pressed) || Math.abs(gp.axes[0] || 0) > 0.3) setInputMode('pad');
        steer = (gp.axes[0] || 0) + (btn(14) ? -1 : 0) + (btn(15) ? 1 : 0);
        thr = Math.max(gp.buttons[7]?.value || 0, btn(12) ? 1 : 0);
        brk = Math.max(gp.buttons[6]?.value || 0, btn(13) ? 1 : 0);
        drift = btn(2) || btn(4);
        // RB used to be a third drift button, which left the car special
        // (Q on keyboard) with no button on a pad at all
        if (btn(5) && !prevAbility) send({ t: MSG.ABILITY });
        prevAbility = btn(5);
        boost = btn(0) || btn(1);
        if (btn(3) && !prevUse) send({ t: MSG.USE_POWERUP });
        prevUse = btn(3);
        if (btn(9) && !prevRespawn) k.respawn = true;
        prevRespawn = btn(9);
      }
      k.gpSteer = Math.max(-1, Math.min(1, steer + touchInput.steer));
      k.gpThrottle = Math.max(thr, touchInput.throttle);
      k.gpBrake = Math.max(brk, touchInput.brake);
      k.gpDrift = drift || touchInput.drift;
      k.gpBoost = boost || touchInput.boost;
    };
    const down = (e) => {
      if (e.repeat) return;
      if (paused()) {
        // only mute survives; Esc is routed by the HUD (it closes the room)
        if (e.code === 'KeyM') {
          const m = !useStore.getState().muted;
          useStore.setState({ muted: m });
          useStore.getState().save();
        }
        return;
      }
      const k = KEYMAP[e.code];
      if (k) {
        keys.current[k] = true;
        e.preventDefault();
      }
      // one-shot actions
      switch (e.code) {
        case 'KeyE': send({ t: MSG.USE_POWERUP }); break;
        case 'KeyN': {
          const st = useStore.getState();
          const next = hourAfter(st.timeOfDay);
          st.setTimeOfDay(next);
          st.pushFeed(`${DAYLIGHT[next].clock} — ${DAYLIGHT[next].label}`);
          break;
        }
        case 'KeyM': {
          const m = !useStore.getState().muted;
          useStore.setState({ muted: m });
          useStore.getState().save();
          break;
        }
        case 'KeyP': useStore.setState((s) => ({ photoMode: !s.photoMode })); break;
        case 'KeyR': keys.current.respawn = true; break;
        case 'KeyH': send({ t: MSG.EMOTE, h: 1 }); audio.horn(); break; // sound now; echo draws the bubble
        case 'KeyQ': send({ t: MSG.ABILITY }); break; // server checks cooldown, echo applies it
        default:
          // 1–8 → emote wheel (the bubble comes back via the server echo)
          if (e.code.startsWith('Digit')) {
            const i = Number(e.code.slice(5)) - 1;
            if (i >= 0 && i < EMOTES.length) send({ t: MSG.EMOTE, e: i });
          }
          break;
      }
    };
    const up = (e) => {
      const k = KEYMAP[e.code];
      if (k) keys.current[k] = false;
    };
    // Only a click on the world uses your item. Without this, clicking the
    // scoreboard, a HUD chip or any other overlay silently burns it.
    const click = (e) => {
      audio.start();
      if (e.button === 0 && e.target instanceof Element && e.target.tagName === 'CANVAS') {
        send({ t: MSG.USE_POWERUP });
      }
    };
    // Alt-tab with a key held and the browser never delivers the keyup, so the
    // car drives itself until you come back and tap the key. Drop everything
    // held whenever we lose the keyboard.
    const release = () => {
      const k = keys.current;
      k.fwd = k.back = k.left = k.right = k.drift = k.boost = false;
    };
    // opening the Break Room lets go of everything held
    const unsub = useStore.subscribe((s, prev) => { if (s.breakRoom && !prev.breakRoom) release(); });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousedown', click);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      unsub();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousedown', click);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, []);
  return keys;
}
