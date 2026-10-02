// -------------------------------------------------------------- countdown
// The next meeting's invite, then 3 · 2 · 1 · GO.
import { useEffect, useState } from 'react';
import { MODES, MUTATORS, variantOf } from '@rc/shared';
import { useMap } from '../../game/activeMap.js';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import Icon, { MODE_ICON } from '../Icon.jsx';
import './countdown.css';

export default function Countdown() {
  const countdownEnd = useStore((s) => s.countdownEnd);
  const modeId = useStore((s) => s.modeId);
  const mutator = useStore((s) => s.mutator);
  const cup = useStore((s) => s.cup);
  const variant = variantOf(modeId, useStore((s) => s.variant));
  const mapName = useMap().name;
  const [n, setN] = useState(3);
  useEffect(() => {
    // beep once per second-change, not once per 120 ms poll — without the
    // guard the last 3 seconds were ~25 rapid blips and a stuttering "GO"
    let prev = null;
    const iv = setInterval(() => {
      const left = Math.ceil((countdownEnd - Date.now()) / 1000);
      setN(left);
      if (left !== prev) {
        if (left > 0 && left <= 3) audio.blip(440, 0.1);
        if (left === 0) audio.blip(880, 0.25, 0.2);
        prev = left;
      }
    }, 120);
    return () => clearInterval(iv);
  }, [countdownEnd]);
  return (
    <div className="countdown">
      {cup && (
        <div className="chip cup-chip">
          <Icon name="trophy" size={15} /> OFFICE CUP · ROUND {cup.round}/{cup.total}
        </div>
      )}
      <div className="toast toast-warn invite">
        <span className="toast-icon"><Icon name={MODE_ICON[modeId] || 'flag'} /></span>
        <div>
          <span className="label">next meeting · {mapName}</span>
          <b>
            {MODES[modeId]?.name}
            {variant && variant.id !== 'classic' && <span className="variant-tag"> · {variant.name}</span>}
          </b>
          <small>{variant && variant.id !== 'classic' ? variant.desc : MODES[modeId]?.desc}</small>
          {mutator && (
            <div className="invite-mutator">
              <Icon name="warning" size={13} /> MUTATOR · {MUTATORS[mutator]?.name} — {MUTATORS[mutator]?.desc}
            </div>
          )}
        </div>
      </div>
      <div key={n} className={`count-num ${n <= 0 ? 'go' : ''}`}>{n > 0 ? n : 'GO!'}</div>
    </div>
  );
}
