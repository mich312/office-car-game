// ------------------------------------------------- touch controls (mobile)
// Rendered always, shown via CSS only on coarse-pointer devices. Buttons
// write into the shared touchInput channel merged by the input poll.
import { useRef } from 'react';
import { MSG } from '@rc/shared';
import { send } from '../../net.js';
import { touchInput } from '../../game/useControls.js';
import { audio } from '../../audio.js';
import Icon from '../Icon.jsx';
import './touch.css';

export default function TouchControls() {
  const held = useRef({ L: false, R: false });
  const steerUpd = () => { touchInput.steer = (held.current.R ? 1 : 0) - (held.current.L ? 1 : 0); };
  const bind = (fn) => ({
    onPointerDown: (e) => { e.preventDefault(); audio.start(); fn(true); },
    onPointerUp: () => fn(false),
    onPointerCancel: () => fn(false),
    onPointerLeave: () => fn(false),
    onContextMenu: (e) => e.preventDefault(),
  });
  return (
    <div className="touch-controls">
      <div className="tc-left">
        <button className="tc-btn tc-steer" aria-label="Steer left" {...bind((d) => { held.current.L = d; steerUpd(); })}><Icon name="chevron-left" size={30} /></button>
        <button className="tc-btn tc-steer" aria-label="Steer right" {...bind((d) => { held.current.R = d; steerUpd(); })}><Icon name="chevron-right" size={30} /></button>
      </div>
      <div className="tc-right">
        <button className="tc-btn" aria-label="Boost" {...bind((d) => { touchInput.boost = d; })}><Icon name="flame" size={26} /></button>
        <button className="tc-btn" aria-label="Drift" {...bind((d) => { touchInput.drift = d; })}><Icon name="wind" size={26} /></button>
        <button className="tc-btn" aria-label="Use powerup" {...bind((d) => { if (d) send({ t: MSG.USE_POWERUP }); })}><Icon name="gift" size={26} /></button>
        <button className="tc-btn" aria-label="Horn" {...bind((d) => { if (d) { send({ t: MSG.EMOTE, h: 1 }); audio.horn(); } })}><Icon name="horn" size={26} /></button>
        <button className="tc-btn" aria-label="Ability" {...bind((d) => { if (d) send({ t: MSG.ABILITY }); })}><Icon name="star" size={26} /></button>
        <button className="tc-btn tc-wide" {...bind((d) => { touchInput.brake = d ? 1 : 0; })}>BRAKE</button>
      </div>
    </div>
  );
}
