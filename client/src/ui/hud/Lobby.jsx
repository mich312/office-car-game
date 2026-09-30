// ------------------------------------------------------------------ lobby
// The live office IS the lobby (SPEC-TOYBOX §4.15): two slim toy-box rails
// leave the world visible in the middle, and you drive around while you
// wait. Left: the room ticket, the crew and READY UP. Right: the floor and
// the next-meeting votes. 7+ drivers switch to a dense two-column crew;
// a landscape phone gets its own px layout with vote sheets and the touch
// pad. The wrapper keeps class "lobby-rail" (scripts/shoot.mjs hides it).
//
// Nothing here is invented: there is no lobby timer (the server has none),
// and the vote headers say what the server will actually pick. Its rule
// (room.js): most votes wins; on a tie, the option whose voter voted first
// (it tallies in vote order and sorts stably); no mode votes at all is a
// random mode, no floor votes keeps a private room where it is and moves
// quick play on.
import { useEffect, useRef, useState } from 'react';
import { MODES, MODE_IDS, MAPS, MAP_IDS, MSG, MAX_PLAYERS } from '@rc/shared';
import { useStore } from '../../store.js';
import { send } from '../../net.js';
import { audio } from '../../audio.js';
import { inviteLink, copyText } from '../../rooms.js';
import { ToyIcon, ToyCar, MODE_TOY, FLOOR_TOY } from '../Icon.jsx';
import { FLOOR_CODE, paintOf } from './format.js';
import { useLayout } from './useLayout.js';
import TouchControls from './TouchControls.jsx';
import './lobby.css';

const floorName = (id) => (MAPS[id]?.name || id).replace(/^The /, '');

// What the server will pick from a { playerId: option } tally, in its order.
export function tally(votes) {
  const counts = new Map();
  for (const v of Object.values(votes || {})) counts.set(v, (counts.get(v) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]); // stable, like the server
  const top = ranked[0] || null;
  return {
    counts,
    winner: top ? top[0] : null,
    tie: !!top && ranked.length > 1 && ranked[1][1] === top[1],
    total: [...counts.values()].reduce((a, b) => a + b, 0),
  };
}

const voterPaints = (votes, option, players) => Object.entries(votes || {})
  .filter(([, v]) => v === option)
  .map(([id]) => ({ id, paint: paintOf(players[id]) }));

// One ballot option: a button with its count, voter paint dots and a lime
// share bar. Your own vote is sun (yellow = you); the pick gets the crown.
function VoteRow({ label, sub, glyph, count, total, voters, mine, lead, pick, tabIndex, onPick, title }) {
  const aria = `${label}${sub ? `, ${sub}` : ''}, ${count} vote${count === 1 ? '' : 's'}${lead || pick ? ', leading' : ''}${mine ? ', your vote' : ''}`;
  return (
    <button
      type="button"
      className={`tb-vr${mine ? ' is-mine' : ''}${count ? '' : ' is-zero'}`}
      style={{ '--v': total ? (count / total).toFixed(3) : 0 }}
      aria-pressed={mine}
      aria-label={aria}
      title={title}
      tabIndex={tabIndex}
      onClick={onPick}
    >
      <span className="bar" />
      <span className="ic">{glyph}</span>
      <span className="nm">{label}{sub && <small>{sub}</small>}</span>
      {lead && <ToyIcon name="crown" className="crown" />}
      <span className="dots" aria-hidden="true">{voters.slice(0, 4).map((v) => <i key={v.id} style={{ '--paint': v.paint }} />)}</span>
      <span className="n tb-disp">{count}</span>
    </button>
  );
}

// Arrow keys rove inside a ballot group (and don't steer the car meanwhile);
// Tab moves between groups (one tab stop each: your vote, else the first).
function rove(e) {
  const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  const d = keys[e.key];
  if (!d || !(e.target instanceof HTMLElement) || !e.target.classList.contains('tb-vr')) return;
  const all = [...e.currentTarget.querySelectorAll('.tb-vr')];
  const i = all.indexOf(e.target);
  const next = all[(i + d + all.length) % all.length];
  e.preventDefault();
  e.stopPropagation();
  next?.focus();
}

function useBallots() {
  const players = useStore((s) => s.players);
  const votes = useStore((s) => s.votes);
  const mapVotes = useStore((s) => s.mapVotes);
  const mapId = useStore((s) => s.mapId);
  const myId = useStore((s) => s.myId);
  const roomPrivate = useStore((s) => s.roomPrivate);
  // what you picked shows at once; the server's tally catches up
  const [myMode, setMyMode] = useState(null);
  const [myMap, setMyMap] = useState(null);
  const modeVote = votes?.[myId] || myMode;
  const mapVote = mapVotes?.[myId] || myMap;
  const castMode = (m) => { setMyMode(m); send({ t: MSG.VOTE_MODE, mode: m }); audio.blip(660, 0.06); };
  const castMap = (m) => { setMyMap(m); send({ t: MSG.VOTE_MAP, map: m }); audio.blip(560, 0.06); };
  const modes = tally(votes);
  const floors = tally(mapVotes);

  // (the floor rows carry "you are here", so the header names the pick
  // instead of a crown on the row)
  const floorHead = floors.total === 0
    ? (roomPrivate ? 'No votes · stay here' : 'No votes · moves on')
    : floors.tie ? `Tie · ${floorName(floors.winner)} was first` : `${floorName(floors.winner)} leads`;
  const modeHead = modes.total === 0
    ? 'No votes · random pick'
    : modes.tie ? 'Tie · first vote wins' : `${MODES[modes.winner]?.name} leads`;

  const floorRows = MAP_IDS.map((m) => ({
    key: m,
    label: floorName(m),
    sub: m === mapId ? 'you are here' : '',
    glyph: <b>{FLOOR_CODE[m] || '··'}</b>,
    count: floors.counts.get(m) || 0,
    total: floors.total,
    voters: voterPaints(mapVotes, m, players),
    mine: mapVote === m,
    lead: false,
    pick: floors.winner === m,
    title: MAPS[m]?.blurb,
    onPick: () => castMap(m),
  }));
  const modeRows = MODE_IDS.map((m) => ({
    key: m,
    label: MODES[m].name,
    glyph: <ToyIcon name={MODE_TOY[m] || 'flag'} />,
    count: modes.counts.get(m) || 0,
    total: modes.total,
    voters: voterPaints(votes, m, players),
    mine: modeVote === m,
    lead: modes.winner === m,
    title: MODES[m].desc,
    onPick: () => castMode(m),
  }));
  return { floorRows, modeRows, floorHead, modeHead, modeVote, mapVote, modes, floors, mapId, votes, mapVotes };
}

function Ballot({ rows, onPicked }) {
  const stop = rows.findIndex((r) => r.mine);
  return (
    <div className="tb-votes" role="group" onKeyDown={rove}>
      {rows.map((r, i) => (
        <VoteRow key={r.key} {...r} tabIndex={i === (stop < 0 ? 0 : stop) ? 0 : -1}
          onPick={() => { r.onPick(); onPicked?.(); }} />
      ))}
    </div>
  );
}

// The room code + invite link. Any room can be joined by its code, so a
// quick-play room gets an invite link too.
function useInvite() {
  const code = useStore((s) => s.roomCode);
  const [copied, setCopied] = useState(null); // null | 'ok' | 'fail'
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyText(inviteLink(code));
    setCopied(ok ? 'ok' : 'fail');
    audio.blip(ok ? 990 : 330, 0.06);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2200);
  };
  return { code, copied, copy };
}

const spelled = (code) => `Room code ${String(code || '').split('').join(' ')}`;

export default function Lobby() {
  const players = useStore((s) => s.players);
  const myId = useStore((s) => s.myId);
  const roomPrivate = useStore((s) => s.roomPrivate);
  const testStatus = useStore((s) => s.drivingTest);
  const breakRoom = useStore((s) => s.breakRoom);
  const inputMode = useStore((s) => s.inputMode);
  const layout = useLayout();
  const ballots = useBallots();
  const invite = useInvite();
  const [sheet, setSheet] = useState(null); // compact: null | 'floor' | 'mode'

  // READY: optimistic, then whatever the server says (it resets after a match)
  const serverReady = !!players[myId]?.ready;
  const [ready, setReady] = useState(serverReady);
  useEffect(() => setReady(serverReady), [serverReady]);
  const toggleReady = () => {
    const r = !ready;
    setReady(r);
    send({ t: MSG.READY, ready: r });
    audio.blip(r ? 880 : 440, 0.08);
  };
  // Enter toggles READY (a focused button keeps Enter for itself)
  const toggleRef = useRef(toggleReady);
  toggleRef.current = toggleReady;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && t.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
      if (useStore.getState().breakRoom) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // the crew, you first; the server starts when every HUMAN is ready
  const list = Object.values(players).sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : 0));
  const humans = list.filter((p) => !p.bot);
  const isReady = (p) => (p.id === myId ? ready : !!p.ready);
  const readyN = list.filter(isReady).length;
  const waiting = humans.filter((p) => p.id !== myId && !p.ready).length;
  const voted = humans.filter((p) => ballots.votes?.[p.id] || ballots.mapVotes?.[p.id]).length;
  const dense = list.length >= 7;
  const openBreakRoom = () => useStore.setState({ breakRoom: true });

  if (layout.compact) {
    return <CompactLobby {...{ list, myId, isReady, readyN, ready, toggleReady, ballots, invite, roomPrivate, sheet, setSheet, breakRoom, testStatus, openBreakRoom }} />;
  }

  const keys = inputMode === 'pad'
    ? <><span className="tb-k is-dark">L-stick</span><span className="tb-lbl">drive</span><span className="tb-k is-dark">X</span><span className="tb-lbl">drift</span></>
    : inputMode === 'touch'
      ? <><span className="tb-k is-dark">Stick</span><span className="tb-lbl">steer</span><span className="tb-k is-dark">Drift</span><span className="tb-lbl">hold</span></>
      : <><span className="tb-k is-dark">W</span><span className="tb-k is-dark">A</span><span className="tb-k is-dark">S</span><span className="tb-k is-dark">D</span><span className="tb-lbl">drive</span><span className="tb-k is-dark">Shift</span><span className="tb-lbl">drift</span></>;

  return (
    <div className={`lobby-rail tb-lob${dense ? ' is-dense' : ''}`}>
      {/* top centre: "drive around" — the driving test (Coach.jsx) takes the slot while it runs */}
      {testStatus !== 'todo' && (
        <div className="tb-lob-top a-pop">
          <span className="tb-rib is-ink"><ToyIcon name="steer" /><span className="tb-disp">Drive around while you wait</span></span>
          <span className="tb-rib is-ink tb-keys" aria-hidden="true">{keys}</span>
        </div>
      )}

      <aside className="tb-lob-l tb-box a-slide" aria-label="Lobby">
        <div className="tb-lob-h">
          <span className="tb-disp tb-ol tb-ex">Lobby</span>
          <span className="tb-tag"><ToyIcon name="office" />{list.length} / {MAX_PLAYERS} desks</span>
          {layout.touch && (
            <button type="button" className="tb-btn tb-lob-pause" aria-label="Break Room (pause menu)" onClick={openBreakRoom}><ToyIcon name="pause" /></button>
          )}
        </div>
        <div className="tb-ticket">
          <div className="tb-ticket-top">
            <span className="tb-lbl"><ToyIcon name={roomPrivate ? 'lock' : 'globe'} />{roomPrivate ? 'Private room' : 'Quick play'} · code</span>
            <span className="tb-lbl is-live">Live</span>
          </div>
          <div className="tb-code tb-disp" role="text" aria-label={spelled(invite.code)}>{invite.code || '····'}</div>
          <InviteButton invite={invite} short={dense} />
        </div>
        <div className="tb-sect">
          <span className="tb-lbl">Drivers</span>
          <span className="tb-lbl is-count">{readyN} / {list.length} ready</span>
        </div>
        <ul className="tb-players">
          {list.map((p) => {
            const me = p.id === myId;
            const r = isReady(p);
            return (
              <li key={p.id} className={`tb-pl${me ? ' is-you' : ''}`}>
                <ToyCar paint={paintOf(p)} />
                <span className="nm">
                  <span>{p.name}</span>
                  {!dense && p.bot && <span className="tb-bot" title="Bot"><ToyIcon name="bot" /></span>}
                  {!dense && me && <span className="tb-you">YOU</span>}
                </span>
                {r
                  ? <span className="st is-ok" title="Ready"><ToyIcon name="check" /><span className="sr">ready</span></span>
                  : me
                    ? <span className="st is-nag">Not ready</span>
                    : <span className="st is-wait" title="Not ready yet"><i /><i /><i /><span className="sr">not ready</span></span>}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className={`tb-cta${ready ? ' is-done' : ''}`}
          aria-pressed={ready}
          aria-keyshortcuts="Enter"
          onClick={toggleReady}
        >
          {ready
            ? <><ToyIcon name="check" /><span className="tb-disp">READY!</span></>
            : <span className="tb-disp">READY UP</span>}
          <span className="tb-k" aria-hidden="true">Enter</span>
        </button>
        <p className="tb-hint">
          {ready
            ? waiting > 0
              ? <>Waiting for <b>{waiting} more human{waiting === 1 ? '' : 's'}</b> · bots fill empty desks</>
              : <>Everyone's in · <b>here we go</b></>
            : <>Starts when every human is ready · bots fill empty desks</>}
        </p>
        <p className="tb-hint tb-hint-links">
          {!layout.touch && <span><span className="tb-k is-dark">Esc</span> Break Room</span>}
          {testStatus !== 'todo' && (
            <button type="button" className="tb-link" onClick={() => useStore.setState({ drivingTest: 'todo' })}>Driving test</button>
          )}
        </p>
      </aside>

      <aside className="tb-lob-r tb-box a-slide-r" aria-label="Vote">
        <div className="tb-lob-h">
          <span className="tb-disp tb-ol tb-ex">Vote</span>
          <span className={`tb-tag${humans.length && voted >= humans.length ? ' is-go' : ''}`}>
            <ToyIcon name="check" />{voted} of {humans.length} voted
          </span>
        </div>
        <div className="tb-vote-h"><span className="tb-lbl">Floor</span><span className="tb-micro">{ballots.floorHead}</span></div>
        <Ballot rows={ballots.floorRows} />
        <div className="tb-vote-h"><span className="tb-lbl">Next meeting</span><span className="tb-micro">{ballots.modeHead}</span></div>
        <Ballot rows={ballots.modeRows} />
      </aside>

      {!breakRoom && <TouchControls lobby />}
    </div>
  );
}

function InviteButton({ invite, compact = false, short = false }) {
  const { copied, copy } = invite;
  const label = copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copy failed' : short ? 'Copy link' : 'Copy invite link';
  return (
    <button
      type="button"
      className={`tb-btn${compact ? ' tb-ml-inv' : ''}${copied === 'ok' ? ' is-copied' : copied === 'fail' ? ' is-failed' : ''}`}
      onClick={copy}
      aria-label={compact ? label : undefined}
      aria-live="polite"
    >
      <ToyIcon name={copied === 'ok' ? 'check' : copied === 'fail' ? 'x' : 'link'} />
      {!compact && label}
    </button>
  );
}

// ------------------------------------------------ landscape phone (844×390)
// Ticket, crew strip and two vote buttons on the left, READY UP top-right
// above the pad, a hint ribbon top-centre. A vote opens a sheet; the touch
// pad unmounts while it is open (driving input pauses).
function CompactLobby({ list, myId, isReady, readyN, ready, toggleReady, ballots, invite, roomPrivate, sheet, setSheet, breakRoom, testStatus, openBreakRoom }) {
  const floorMine = ballots.floorRows.find((r) => r.mine);
  const modeMine = ballots.modeRows.find((r) => r.mine);
  const floorShow = floorMine || ballots.floorRows.find((r) => r.pick) || ballots.floorRows.find((r) => r.key === ballots.mapId);
  const modeShow = modeMine || ballots.modeRows.find((r) => r.lead);
  const sheetRows = sheet === 'floor' ? ballots.floorRows : ballots.modeRows;
  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setSheet(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sheet, setSheet]);
  return (
    <div className={`lobby-rail tb-lob is-compact${list.length >= 7 ? ' is-dense' : ''}`}>
      <div className="tb-ml">
        <div className="tb-ml-ticket tb-box a-slide">
          <span className="tb-ml-code">
            <span className="tb-micro"><ToyIcon name={roomPrivate ? 'lock' : 'globe'} />{roomPrivate ? 'Private' : 'Quick play'} · code</span>
            <span className="tb-disp" role="text" aria-label={spelled(invite.code)}>{invite.code || '····'}</span>
          </span>
          <InviteButton invite={invite} compact />
        </div>
        <div className="tb-ml-crew tb-rib is-ink a-slide" style={{ '--i': 1 }} role="img" aria-label={`${readyN} of ${list.length} drivers ready`}>
          {list.map((p) => (
            <i key={p.id} className={`${isReady(p) ? 'is-ok' : ''}${p.id === myId ? ' is-you' : ''}`} style={{ '--paint': paintOf(p) }} />
          ))}
          <span className="tb-micro">{readyN}/{list.length} ready</span>
        </div>
        <button type="button" className="tb-ml-vote is-floor tb-box a-slide" style={{ '--i': 2 }} onClick={() => setSheet('floor')}
          aria-haspopup="dialog" aria-label={`Floor vote: ${floorShow?.label || 'none'}${floorMine ? ', your vote' : ''}. Open the floor vote`}>
          <span className="ic"><ToyIcon name={FLOOR_TOY[floorShow?.key] || 'office'} /></span>
          <span className="nm">
            <span className="tb-micro">Floor · {floorMine ? 'your vote' : 'tap to vote'}</span>
            <b>{floorShow ? `${FLOOR_CODE[floorShow.key]} · ${floorShow.label}` : 'No votes yet'}</b>
          </span>
          <span className="n tb-disp">{floorShow?.count || 0}</span>
        </button>
        <button type="button" className="tb-ml-vote is-mode tb-box a-slide" style={{ '--i': 3 }} onClick={() => setSheet('mode')}
          aria-haspopup="dialog" aria-label={`Next meeting vote: ${modeShow?.label || 'none'}${modeMine ? ', your vote' : ''}. Open the meeting vote`}>
          <span className="ic"><ToyIcon name={modeShow ? MODE_TOY[modeShow.key] : 'flag'} /></span>
          <span className="nm">
            <span className="tb-micro">Meeting · {modeMine ? 'your vote' : 'tap to vote'}</span>
            <b>{modeShow ? modeShow.label : 'No votes yet'}</b>
          </span>
          <span className="n tb-disp">{modeShow?.count || 0}</span>
        </button>
        <button type="button" className="tb-btn tb-ml-pause a-pop" aria-label="Break Room (pause menu)" onClick={openBreakRoom}><ToyIcon name="pause" /></button>
        <button type="button" className={`tb-cta tb-ml-ready a-pop${ready ? ' is-done' : ''}`} aria-pressed={ready} onClick={toggleReady}>
          {ready ? <><ToyIcon name="check" /><span className="tb-disp">READY!</span></> : <span className="tb-disp">READY UP</span>}
        </button>
        {testStatus !== 'todo' && (
          <div className="tb-ml-hint a-pop"><span className="tb-rib is-ink"><ToyIcon name="steer" /><span className="tb-micro">Drive around while you wait</span></span></div>
        )}
      </div>
      {sheet && (
        <>
          <div className="tb-sheet-scrim" onPointerDown={() => setSheet(null)} />
          <div className="tb-sheet tb-box a-slide" role="dialog" aria-modal="true" aria-label={sheet === 'floor' ? 'Vote the floor' : 'Vote the next meeting'}>
            <div className="tb-sheet-h">
              <span className="tb-disp tb-ol tb-ex">{sheet === 'floor' ? 'Floor' : 'Next meeting'}</span>
              <span className="tb-lbl">{sheet === 'floor' ? ballots.floorHead : ballots.modeHead}</span>
              <button type="button" className="tb-btn tb-sheet-x" aria-label="Close" onClick={() => setSheet(null)} autoFocus><ToyIcon name="x" /></button>
            </div>
            <Ballot rows={sheetRows} onPicked={() => setSheet(null)} />
          </div>
        </>
      )}
      {!sheet && !breakRoom && <TouchControls lobby />}
    </div>
  );
}
