// Keyboard (+ mouse button) input, read imperatively from useFrame.
import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { send } from '../net.js';
import { MSG } from '@rc/shared';
import { audio } from '../audio.js';

const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'drift', ShiftRight: 'drift',
  KeyB: 'boost', ControlLeft: 'boost',
};

export function useControls() {
  const keys = useRef({
    fwd: false, back: false, left: false, right: false, jump: false, drift: false, boost: false, jumpPressed: false,
    gpSteer: 0, gpThrottle: 0, gpBrake: 0, gpDrift: false, gpBoost: false,
  });
  useEffect(() => {
    // Gamepad: standard mapping — left stick / d-pad steer, RT gas, LT brake,
    // A jump, B boost, X/LB/RB drift, Y item, Start respawn. Polled per
    // physics step from LocalCar via keys.current.poll().
    let prevJump = false, prevUse = false, prevRespawn = false;
    keys.current.poll = () => {
      const k = keys.current;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (const p of pads) if (p && p.connected) { gp = p; break; }
      if (!gp) { k.gpSteer = 0; k.gpThrottle = 0; k.gpBrake = 0; k.gpDrift = false; k.gpBoost = false; return; }
      const btn = (i) => !!gp.buttons[i]?.pressed;
      k.gpSteer = (gp.axes[0] || 0) + (btn(14) ? -1 : 0) + (btn(15) ? 1 : 0);
      k.gpThrottle = Math.max(gp.buttons[7]?.value || 0, btn(12) ? 1 : 0);
      k.gpBrake = Math.max(gp.buttons[6]?.value || 0, btn(13) ? 1 : 0);
      k.gpDrift = btn(2) || btn(4) || btn(5);
      k.gpBoost = btn(1);
      if (btn(0) && !prevJump) k.jumpPressed = true;
      prevJump = btn(0);
      if (btn(3) && !prevUse) send({ t: MSG.USE_POWERUP });
      prevUse = btn(3);
      if (btn(9) && !prevRespawn) k.respawn = true;
      prevRespawn = btn(9);
    };
    const down = (e) => {
      if (e.repeat) return;
      const k = KEYMAP[e.code];
      if (k) {
        keys.current[k] = true;
        if (k === 'jump') keys.current.jumpPressed = true;
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
