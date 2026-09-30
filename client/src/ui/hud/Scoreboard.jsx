// -------------------------------------------------------------- standings
// Hold Tab (on touch: tap your place) — SPEC-TOYBOX §4.12. A toy-box sheet
// with everyone in match order, your row in sun, and only columns the game
// actually has: lap + checkpoint in Desk Dash, beans delivered + carried in
// Coffee Run, the team in RC Soccer, the score everywhere. Status tags from
// the snapshot flags: EMP (stunned), IT, OUT (Last Car Standing), KO (out of
// this sumo round). 9–12 drivers: tighter rows; on a phone: the top 3 and
// you ±1. The footer is your shift so far (matchStats: measured, not made up).
// While it is open the top-centre slot stays empty (useStandingsOpen).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { MODES, raceLaps, raceCheckpoints, variantOf } from '@rc/shared';
import { useMap } from '../../game/activeMap.js';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { ToyIcon, ToyCar } from '../Icon.jsx';
import { paintOf } from './format.js';
import { matchStats } from './matchStats.js';
import { standings } from './racePosition.js';
import { floorLabel } from './Minimap.jsx';
import { useLayout } from './useLayout.js';
import './scoreboard.css';

// is a standings sheet up? (the match HUD empties its event slot meanwhile)
let openCount = 0;
const subs = new Set();
const bump = (d) => { openCount += d; subs.forEach((f) => f()); };
export const useStandingsOpen = () => useSyncExternalStore(
  (f) => { subs.add(f); return () => subs.delete(f); }, () => openCount > 0, () => false,
);

const STUNNED = 4, KO = 128;
const DENSE_AT = 9;

// top 3, a gap, you ±1 (only when there is something to skip)
function collapse(rows, myId) {
  const me = rows.findIndex((r) => r.id === myId);
  if (rows.length <= 6 || me < 0) return rows;
  const keep = new Set([0, 1, 2, me - 1, me, me + 1].filter((i) => i >= 0 && i < rows.length));
  const out = [];
  let prev = -1;
  [...keep].sort((a, b) => a - b).forEach((i) => {
    if (i > prev + 1) out.push({ gap: true, id: `gap-${i}` });
    out.push(rows[i]);
    prev = i;
  });
  if (prev < rows.length - 1) out.push({ gap: true, id: 'gap-end' });
  return out;
}

export default function Scoreboard({ onClose }) {
  const [, force] = useState(0);
  useEffect(() => {
    bump(1);
    const iv = setInterval(() => force((n) => n + 1), 250);
    return () => { clearInterval(iv); bump(-1); };
  }, []);
  const map = useMap();
  const { compact } = useLayout();
  const st = useStore.getState();
  const { myId, modeId, players, scores } = st;
  const mode = MODES[modeId];
  const variant = variantOf(modeId, st.variant);
  const laps = raceLaps(map, MODES.desk_dash.laps);
  const cpN = raceCheckpoints(st.variant, map).length;

  const order = standings(st, map);
  const rows = order.map(({ id, place }) => {
    const p = players[id] || {};
    const f = net.flags.get(id) || 0;
    const tags = [];
    if (f & STUNNED) tags.push('emp');
    if (modeId === 'tag' && st.itId === id) tags.push('it');
    if (f & KO) { if (modeId === 'last_standing') tags.push('out'); else if (modeId === 'sumo') tags.push('ko'); }
    const prog = st.raceProgress[id] || [0, 0];
    const buf = net.remotes.get(id);
    const carrying = id === myId ? st.myBeans : buf?.[buf.length - 1]?.c;
    return { id, place, p, tags, score: Math.round(scores[id] || 0), prog, carrying };
  });
  const dense = rows.length >= DENSE_AT;
  const shown = compact ? collapse(rows, myId) : rows;

  // columns: only what the game has
  let cols;
  if (modeId === 'desk_dash') {
    cols = [
      { h: 'Lap', v: (r) => (r.prog[0] >= laps ? 'Done' : `${r.prog[0] + 1}/${laps}`) },
      { h: 'Checkpt', v: (r) => (r.prog[0] >= laps ? '–' : `${r.prog[1]}/${cpN}`), dim: true },
      { h: 'Score', v: (r) => r.score },
    ];
  } else if (modeId === 'coffee_run') {
    cols = [
      { h: 'Delivered', v: (r) => Math.round(r.score / MODES.coffee_run.beanScore) },
      { h: 'Carrying', v: (r) => (r.carrying == null ? '–' : r.carrying), dim: true },
      { h: 'Score', v: (r) => r.score },
    ];
  } else if (modeId === 'soccer') {
    cols = [
      { h: 'Team', v: (r) => <span className={`tb-sw ${r.p.team ? 'is-blue' : 'is-orange'}`} role="img" aria-label={r.p.team ? 'Blue' : 'Orange'} /> },
      { h: 'Score', v: (r) => r.score },
    ];
  } else {
    cols = [{ h: 'Score', v: (r) => r.score }];
  }

  const meta = [floorLabel(map)];
  if (variant && variant.id !== 'classic') meta.push(variant.name);
  if (modeId === 'desk_dash') {
    const mine = st.raceProgress[myId]?.[0] || 0;
    meta.push(mine >= laps ? 'finished' : `lap ${mine + 1} of ${laps}`);
  }
  if (st.cup) meta.push(`Office Cup R${st.cup.round}/${st.cup.total}`);

  const ms = matchStats;
  const grid = { '--sb-cols': `4rem minmax(0, 1fr) ${cols.map((c) => (c.h === 'Team' ? '4.5rem' : '6rem')).join(' ')}`, '--sb-n': cols.length };
  const close = onClose ? () => onClose() : undefined;

  return (
    <>
      <div className={`tb-dim${close ? ' is-tap' : ''}`} onClick={close} aria-hidden="true" />
      <div className={`tb-sb-wrap${dense ? ' is-dense' : ''}`} onClick={close}>
        <div className={`tb-sb tb-box a-pop${dense ? ' is-dense' : ''}`} role="dialog" aria-label="Standings" style={grid}>
          <div className="tb-sb-title">
            <span className="tb-rib"><span className="tb-disp">{mode?.name || 'Standings'}</span></span>
            <span className="tb-rib is-ink tb-sb-meta"><span className="tb-lbl">{meta.join(' · ')}</span></span>
          </div>
          <div className="tb-sb-hint">
            {close
              ? <button type="button" className="tb-rib is-ink" onClick={close}><span className="tb-lbl">Tap to close</span></button>
              : <span className="tb-rib is-ink"><span className="tb-lbl">Hold</span><span className="tb-k">Tab</span></span>}
          </div>
          <div className="tb-sb-cols tb-lbl" aria-hidden="true">
            <span>Pos</span><span>Driver</span>{cols.map((c) => <span key={c.h}>{c.h}</span>)}
          </div>
          <ol className="tb-sb-rows">
            {shown.map((r) => (r.gap ? (
              <li key={r.id} className="tb-sr is-gap" aria-hidden="true"><span>•••</span></li>
            ) : (
              <li key={r.id} className={`tb-sr${r.id === myId ? ' is-you' : ''}`}>
                <span className="pn tb-disp tb-ol tb-ex">{r.place}{r.place === 1 && <ToyIcon name="crown" />}</span>
                <span className="nm">
                  <ToyCar paint={paintOf(r.p)} />
                  <span className="nm-t">{r.p.name || '???'}</span>
                  {r.p.bot && <span className="tb-bot" title="Bot"><ToyIcon name="bot" /></span>}
                  {r.id === myId && <span className="tb-you">YOU</span>}
                  {r.tags.map((t) => <StatusTag key={t} t={t} />)}
                </span>
                {cols.map((c) => <span key={c.h} className={`v${c.dim ? ' dim' : ''}`}>{c.v(r)}</span>)}
              </li>
            )))}
          </ol>
          <div className="tb-sb-foot">
            <span>{close ? 'Tap anywhere to close' : <><span className="tb-k">Tab</span> hold to keep this up</>}</span>
            <span>
              Your shift: <b>{ms.miniTurbos}</b> mini-turbo{ms.miniTurbos === 1 ? '' : 's'} · top <b>{ms.topSpeed}</b> cm/s ·{' '}
              <b>{ms.used}</b> item{ms.used === 1 ? '' : 's'} used
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusTag({ t }) {
  switch (t) {
    case 'emp': return <span className="tb-tag is-emp"><ToyIcon name="bolt" />EMP</span>;
    case 'it': return <span className="tb-tag is-it"><ToyIcon name="target" />IT</span>;
    case 'out': return <span className="tb-tag is-out"><ToyIcon name="skull" />OUT</span>;
    case 'ko': return <span className="tb-tag is-ko">KO</span>;
    default: return null;
  }
}
