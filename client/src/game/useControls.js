// Keyboard (+ mouse button) input, read imperatively from useFrame.
import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { send } from '../net.js';
import { MSG } from '@rc/shared';
import { audio } from '../audio.js';

// On-screen touch buttons write here (gamepad axis conventions: steer -1 =
// left). Read and merged by poll() below.
export const touchInput = { steer: 0, throttle: 0, brake: 0, drift: false, boost: false };

const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'drift', ShiftRight: 'drift',
  KeyB: 'boost', ControlLeft: 'boost', Space: 'boost',
};

export function useControls() {
  const keys = useRef({
    fwd: false, back: false, left: false, right: false, drift: false, boost: false,
    gpSteer: 0, gpThrottle: 0, gpBrake: 0, gpDrift: false, gpBoost: false,
  });
  useEffect(() => {
    // Gamepad: standard mapping — left stick / d-pad steer, RT gas, LT brake,
    // A/B boost, X/LB/RB drift, Y item, Start respawn. Polled per
    // physics step from LocalCar via keys.current.poll(). The on-screen
    // touch controls merge into the same channels.
    let prevUse = false, prevRespawn = false;
    keys.current.poll = () => {
      const k = keys.current;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (const p of pads) if (p && p.connected) { gp = p; break; }
      let steer = 0, thr = 0, brk = 0, drift = false, boost = false;
      if (gp) {
        const btn = (i) => !!gp.buttons[i]?.pressed;
        steer = (gp.axes[0] || 0) + (btn(14) ? -1 : 0) + (btn(15) ? 1 : 0);
        thr = Math.max(gp.buttons[7]?.value || 0, btn(12) ? 1 : 0);
        brk = Math.max(gp.buttons[6]?.value || 0, btn(13) ? 1 : 0);
        drift = btn(2) || btn(4) || btn(5);
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
      const k = KEYMAP[e.code];
      if (k) {
        keys.current[k] = true;
        e.preventDefault();
      }
      // one-shot actions
      switch (e.code) {
        case 'KeyE': send({ t: MSG.USE_POWERUP }); break;
        case 'KeyN': useStore.setState((s) => ({ night: !s.night })); break;
        case 'KeyM': {
          const m = !useStore.getState().muted;
          useStore.setState({ muted: m });
          useStore.getState().save();
          break;
        }
        case 'KeyP': useStore.setState((s) => ({ photoMode: !s.photoMode })); break;
        case 'KeyR': keys.current.respawn = true; break;
        default: break;
      }
    };
    const up = (e) => {
      const k = KEYMAP[e.code];
      if (k) keys.current[k] = false;
    };
    const click = (e) => { if (e.button === 0) send({ t: MSG.USE_POWERUP }); audio.start(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousedown', click);
    };
  }, []);
  return keys;
}
