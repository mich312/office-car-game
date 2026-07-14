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
  const keys = useRef({ fwd: false, back: false, left: false, right: false, jump: false, drift: false, boost: false, jumpPressed: false });
  useEffect(() => {
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
