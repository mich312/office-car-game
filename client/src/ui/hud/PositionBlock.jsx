// -------------------------------------------------------- position block
// Top-left, on desktop and phone alike (SPEC-TOYBOX §4.2): the big place
// numeral with its suffix and "/6", the overtake delta, and the lap / score
// ribbon under it (+ the Office Cup round). Your place is computed on the
// client (racePosition.js) at 5 Hz and only changes after it has held for
// 300 ms, so a photo finish between two snapshots doesn't flicker.
// On touch the block is the button that opens the standings.
import { useEffect, useRef, useState } from 'react';
import { MODES, raceLaps } from '@rc/shared';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { ToyIcon } from '../Icon.jsx';
import { ordinal } from './format.js';
import { racePosition } from './racePosition.js';
import './positionblock.css';

const SAMPLE_MS = 200;
const HOLD_MS = 300;
const DELTA_MS = 2500;

// place + of, with hysteresis; delta = places just gained (for 2.5 s)
function usePlace(map) {
  const [shown, setShown] = useState(() => ({ ...racePosition(useStore.getState(), map), delta: 0, gained: false, gen: 0 }));
  const cur = useRef(shown);
  cur.current = shown;
  useEffect(() => {
    let pending = { place: cur.current.place, since: 0 };
    let deltaTimer = 0;
    const iv = setInterval(() => {
      const now = performance.now();
      const { place, of } = racePosition(useStore.getState(), map);
      const c = cur.current;
      if (place === c.place) {
        pending = { place, since: now };
        if (of !== c.of) setShown({ ...c, of });
        return;
      }
      if (pending.place !== place) { pending = { place, since: now }; return; }
      if (now - pending.since < HOLD_MS) return;
      const gained = place < c.place;
      clearTimeout(deltaTimer);
      if (gained) deltaTimer = setTimeout(() => setShown((s) => ({ ...s, delta: 0 })), DELTA_MS);
      setShown({ place, of, delta: gained ? c.place - place : 0, gained, gen: c.gen + 1 });
    }, SAMPLE_MS);
    return () => { clearInterval(iv); clearTimeout(deltaTimer); };
  }, [map]);
  return shown;
}

export default function PositionBlock({ map, spectating, countdown, touch, onOpenStandings }) {
  const modeId = useStore((s) => s.modeId);
  const myId = useStore((s) => s.myId);
  const prog = useStore((s) => s.raceProgress[s.myId]);
  const score = useStore((s) => Math.round(s.scores[s.myId] || 0));
  const itId = useStore((s) => s.itId);
  const cup = useStore((s) => s.cup);
  const pos = usePlace(map);

  if (spectating) {
    return (
      <div className="tb-pos is-out" aria-label="You are out: spectating">
        <span className="tb-pos-n tb-disp tb-ol tb-ex tb-grad" data-t="OUT">OUT</span>
      </div>
    );
  }

  const label = `Position ${pos.place} of ${pos.of}${touch ? ': show the standings' : ''}`;
  const sfx = ordinal(pos.place);
  const block = (
    <>
      <span className="tb-pos-n tb-disp tb-ol tb-ex tb-grad" data-t={pos.place} aria-hidden="true">{pos.place}</span>
      <span className="tb-pos-s" aria-hidden="true">
        <span className="tb-pos-sfx tb-disp tb-ol tb-ex tb-grad" data-t={sfx}>{sfx}</span>
        <span className="tb-pos-of tb-disp tb-ol tb-ex">/{pos.of}</span>
      </span>
      {pos.delta > 0 && (
        <span className="tb-pos-delta a-pop" aria-hidden="true">
          <span className="tb-rib is-go"><ToyIcon name="up" /><span className="tb-disp">{pos.delta}</span></span>
        </span>
      )}
    </>
  );
  // re-keyed on every change: an overtake punches once, a lost place just swaps
  const cls = `tb-pos${pos.gained ? ' a-punch' : ''}`;

  return (
    <>
      {touch ? (
        <button key={pos.gen} type="button" className={`${cls} tb-pos-btn`} aria-label={label} onClick={onOpenStandings}>{block}</button>
      ) : (
        <div key={pos.gen} className={cls} role="img" aria-label={label}>{block}</div>
      )}
      <LapStrip map={map} modeId={modeId} prog={prog} score={score} itId={itId} myId={myId} cup={cup} countdown={countdown} />
    </>
  );
}

// ------------------------------------------------ lap / score ribbon
// Desk Dash: "Lap 1/2" (hot "Final lap 2/2", then "Finished") with a pip per
// lap; every other mode: your points and what scores right now. The Office
// Cup round hangs next to it.
function scoreLine(modeId, { score, itId, myId }) {
  switch (modeId) {
    case 'coffee_run': {
      const n = Math.round(score / MODES.coffee_run.beanScore);
      return `· ${n} bean${n === 1 ? '' : 's'} in`;
    }
    case 'tag': return itId === myId ? `· you score ${MODES.tag.scorePerSecond}/s` : `· It scores ${MODES.tag.scorePerSecond}/s`;
    case 'battery': return `· the battery scores ${MODES.battery.scorePerSecond}/s`;
    case 'koth': return `· the standup scores ${MODES.koth.scorePerSecond}/s`;
    case 'free_roam': return '· style';
    default: return '';
  }
}

function LapStrip({ map, modeId, prog, score, itId, myId, cup, countdown }) {
  let strip = null;
  if (modeId === 'desk_dash') {
    const laps = raceLaps(map, MODES.desk_dash.laps);
    const done = (prog?.[0] || 0) >= laps || !!net.racePlace;
    const lap = Math.min(laps, (prog?.[0] || 0) + 1);
    const pips = (
      <span className="tb-pips" aria-hidden="true">
        {Array.from({ length: laps }, (_, i) => <i key={i} className={i < lap ? 'is-on' : ''} />)}
      </span>
    );
    if (done) {
      strip = <span className="tb-rib is-go"><ToyIcon name="flag" /><span className="tb-lap-t tb-disp">Finished</span></span>;
    } else if (lap === laps && laps > 1 && !countdown) {
      strip = <span className="tb-rib is-hot" key="final"><span className="tb-lap-t tb-disp">Final lap {lap}/{laps}</span>{pips}</span>;
    } else {
      strip = <span className="tb-rib is-ink"><span className="tb-lap-t tb-disp">Lap {lap}/{laps}</span>{pips}</span>;
    }
  } else if (modeId && !countdown) {
    const line = scoreLine(modeId, { score, itId, myId });
    strip = (
      <span className="tb-rib is-ink">
        <span className="tb-lap-t tb-disp">{score.toLocaleString('en-US')} pts</span>
        {line && <span className="tb-micro tb-lap-sub">{line}</span>}
      </span>
    );
  }
  const cupTag = cup ? (
    <span className="tb-cuptag">
      <span className="tb-rib is-ink"><ToyIcon name="trophy" /><span className="tb-micro">Office Cup · R{cup.round}/{cup.total}</span></span>
    </span>
  ) : null;
  if (!strip && !cupTag) return null;
  return <div className="tb-lapstrip a-pop" style={{ '--i': 2 }}>{strip}{cupTag}</div>;
}
