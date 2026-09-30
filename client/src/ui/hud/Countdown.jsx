// -------------------------------------------------------------- countdown
// The next meeting's title card, then 3 · 2 · 1 · GO (SPEC-TOYBOX §4.11):
// the mode in big sticker type (+ the variant on a hot ribbon), an ink
// ribbon with the floor, laps, rooms and the round's mutator, the one-line
// brief, a start-light strip and the numeral, which ends above the car zone.
// The rest of the match HUD is up behind it (your grid place, the minimap,
// the idle drive and kit); the clock and the feed arrive at GO.
import { useEffect, useState } from 'react';
import { MODES, MUTATORS, raceLaps, variantOf } from '@rc/shared';
import { useMap } from '../../game/activeMap.js';
import { useStore } from '../../store.js';
import { audio } from '../../audio.js';
import { ToyIcon, MUTATOR_TOY } from '../Icon.jsx';
import { floorLabel } from './Minimap.jsx';
import './countdown.css';

export default function Countdown() {
  const countdownEnd = useStore((s) => s.countdownEnd);
  const modeId = useStore((s) => s.modeId);
  const mutator = useStore((s) => s.mutator);
  const variant = variantOf(modeId, useStore((s) => s.variant));
  const map = useMap();
  const [n, setN] = useState(() => Math.ceil((countdownEnd - Date.now()) / 1000));
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

  const mode = MODES[modeId];
  const twist = variant && variant.id !== 'classic' ? variant : null;
  const mu = mutator ? MUTATORS[mutator] : null;
  const go = n <= 0;
  const lit = go ? 3 : Math.max(0, 4 - n); // 3 → one light, 2 → two, 1 → three
  const facts = [floorLabel(map)];
  if (modeId === 'desk_dash') {
    const laps = raceLaps(map, MODES.desk_dash.laps);
    facts.push(`${laps} lap${laps === 1 ? '' : 's'}`);
  }
  facts.push(`${map.ROOMS.length} rooms`);

  return (
    <div className="tb-cd" aria-live="assertive">
      <div className="tb-cd-burst" aria-hidden="true" />
      <div className="tb-cd-mode a-pop">
        <span className="tb-disp tb-ol tb-ex">{mode?.name || 'Next meeting'}</span>
        {twist && <span className="tb-cd-var"><span className="tb-rib is-hot"><span className="tb-disp">{twist.name}</span></span></span>}
      </div>
      <div className="tb-cd-sub a-pop" style={{ '--i': 1 }}>
        <span className="tb-rib is-ink">
          {facts.map((f, i) => (
            <span key={f} className="tb-cd-fact">{i > 0 && <span className="tb-lbl tb-cd-dot" aria-hidden="true">·</span>}<span className="tb-lbl">{f}</span></span>
          ))}
          {mu && (
            <span className="tb-cd-fact tb-cd-mu" title={mu.desc}>
              <span className="tb-lbl tb-cd-dot" aria-hidden="true">·</span>
              <ToyIcon name={MUTATOR_TOY[mutator] || 'sparkle'} /><span className="tb-lbl">{mu.name}</span>
            </span>
          )}
        </span>
      </div>
      <p className="tb-cd-desc a-pop" style={{ '--i': 2 }}>
        {twist?.desc || mode?.desc}
      </p>
      <div className={`tb-lights${go ? ' is-go' : ''}`} aria-hidden="true">
        {[1, 2, 3].map((k) => <i key={k} className={k <= lit ? 'is-on' : ''} />)}
        <span className="go">GO</span>
      </div>
      {n <= 3 && (
        <div key={n} className={`tb-cd-n tb-disp tb-ol tb-ex tb-grad a-punch${go ? ' is-go' : ''}`} data-t={go ? 'GO!' : n}>
          {go ? 'GO!' : n}
        </div>
      )}
    </div>
  );
}
