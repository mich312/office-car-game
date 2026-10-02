// ------------------------------------------------------------------ lobby
// A side rail instead of a centered panel: the live office IS the lobby,
// so the menu leaves most of the screen to it.
import { useState } from 'react';
import { MODES, MODE_IDS, MAPS, MAP_IDS, MSG } from '@rc/shared';
import { useStore } from '../../store.js';
import { send } from '../../net.js';
import { audio } from '../../audio.js';
import { inviteLink, copyText } from '../../rooms.js';
import Icon, { MODE_ICON } from '../Icon.jsx';
import './lobby.css';

// The room you're in and the link that brings friends to it. Any room can be
// joined by its code, so a quick-play room gets an invite link too.
export function RoomBadge() {
  const code = useStore((s) => s.roomCode);
  const isPrivate = useStore((s) => s.roomPrivate);
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const copy = async () => {
    const ok = await copyText(inviteLink(code));
    setCopied(ok ? 'Link copied' : 'Copy failed');
    audio.blip(ok ? 990 : 330, 0.06);
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <div className={`room-badge ${isPrivate ? 'private' : ''}`}>
      <div>
        <span className="label">
          <Icon name={isPrivate ? 'lock' : 'globe'} size={11} /> {isPrivate ? 'private room' : 'quick play'}
        </span>
        <b className="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</b>
      </div>
      <button className="btn btn-ghost room-copy" onClick={copy} aria-live="polite">
        <Icon name={copied ? 'check' : 'link'} size={14} /> {copied || 'Copy invite link'}
      </button>
    </div>
  );
}

export default function Lobby() {
  const players = useStore((s) => s.players);
  const votes = useStore((s) => s.votes);
  const myId = useStore((s) => s.myId);
  const testStatus = useStore((s) => s.drivingTest);
  const [ready, setReady] = useState(false);
  const [vote, setVote] = useState(null);
  const list = Object.values(players);
  const humans = list.filter((p) => !p.bot);

  const toggleReady = () => {
    const r = !ready;
    setReady(r);
    send({ t: MSG.READY, ready: r });
    audio.blip(r ? 880 : 440, 0.08);
  };
  const castVote = (m) => {
    setVote(m);
    send({ t: MSG.VOTE_MODE, mode: m });
    audio.blip(660, 0.06);
  };

  return (
    <div className="lobby-rail panel">
      <div>
        <h2>OFFICE LOBBY</h2>
        <p className="label" style={{ marginTop: 4 }}>
          {humans.length} human{humans.length === 1 ? '' : 's'} · bots fill empty desks
        </p>
      </div>
      <RoomBadge />
      <div className="rail-players">
        {list.map((p) => (
          <span key={p.id} className={`rail-player ${p.ready ? 'ready' : ''}`}>
            <span className="dot" style={{ background: p.paint || '#888' }} />
            {p.bot && <Icon name="bot" size={12} />}
            {p.name}
            {p.id === myId && <span className="you">· you</span>}
            {p.ready && <Icon name="check" size={12} className="ok" />}
          </span>
        ))}
      </div>
      <MapBallots humans={humans.length} />
      <span className="label">vote the next meeting</span>
      <div className="ballots">
        {MODE_IDS.map((m) => {
          const count = Object.values(votes).filter((v) => v === m).length;
          const pct = Math.round((count / Math.max(1, humans.length)) * 100);
          return (
            <button key={m} className={`ballot ${vote === m ? 'sel' : ''}`} onClick={() => castVote(m)}>
              <Icon name={MODE_ICON[m] || 'flag'} size={20} />
              <div>
                <b>{MODES[m].name}</b>
                <small>{MODES[m].desc}</small>
              </div>
              <div className="ballot-tally">
                <span>{count || ''}</span>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            </button>
          );
        })}
      </div>
      <button className={`btn btn-primary ready-btn ${ready ? 'is-ready' : ''}`} onClick={toggleReady}>
        {ready ? <><Icon name="check" size={16} /> READY — waiting for others</> : 'READY UP'}
      </button>
      <p className="hint">
        drive around while you wait — the office is live
        {testStatus !== 'todo' && (
          <> · <button className="hint-link" onClick={() => useStore.setState({ drivingTest: 'todo' })}>take the driving test</button></>
        )}
      </p>
    </div>
  );
}

// Where the next round is played. The floor you're on is marked; a private
// room stays on it unless you vote to move, quick play moves on by itself.
export function MapBallots({ humans }) {
  const mapVotes = useStore((s) => s.mapVotes);
  const mapId = useStore((s) => s.mapId);
  const roomPrivate = useStore((s) => s.roomPrivate);
  const [vote, setVote] = useState(null);
  const cast = (m) => {
    setVote(m);
    send({ t: MSG.VOTE_MAP, map: m });
    audio.blip(560, 0.06);
  };
  return (
    <>
      <span className="label">choose the floor{roomPrivate ? '' : ' · or quick play moves on'}</span>
      <div className="map-ballots">
        {MAP_IDS.map((m) => {
          const count = Object.values(mapVotes || {}).filter((v) => v === m).length;
          const pct = Math.round((count / Math.max(1, humans)) * 100);
          return (
            <button key={m} className={`map-ballot map-${MAPS[m].theme} ${vote === m ? 'sel' : ''} ${m === mapId ? 'here' : ''}`}
              onClick={() => cast(m)} title={MAPS[m].blurb}>
              <Icon name={MAPS[m].theme === 'cellar' ? 'tube' : 'building'} size={16} />
              <b>{MAPS[m].name.replace(/^The /, '')}</b>
              {count > 0 && <span className="count">{count}</span>}
              <i className="bar" style={{ width: `${pct}%` }} />
            </button>
          );
        })}
      </div>
    </>
  );
}
