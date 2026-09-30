// -------------------------------------------------------------- scoreboard
// Hold Tab: everyone's score, yours highlighted.
import { MODES } from '@rc/shared';
import { useStore } from '../../store.js';
import Icon from '../Icon.jsx';
import './scoreboard.css';

export default function Scoreboard() {
  const players = useStore((s) => s.players);
  const scores = useStore((s) => s.scores);
  const myId = useStore((s) => s.myId);
  const modeId = useStore((s) => s.modeId);
  const rows = Object.values(players)
    .map((p) => ({ ...p, score: scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  return (
    <>
      <div className="sheet-scrim" />
      <div className="scoreboard panel">
        <header>
          <span className="label">scoreboard</span>
          <span className="label">{MODES[modeId]?.name || ''}</span>
        </header>
        {rows.map((p, i) => (
          <div key={p.id} className={`score-row ${p.id === myId ? 'me' : ''}`}>
            <span className="place">{i + 1}</span>
            <span className="dot" style={{ background: p.paint || '#888' }} />
            <span className="pname">{p.bot && <Icon name="bot" size={13} />}{p.name}</span>
            <b>{p.score}</b>
          </div>
        ))}
      </div>
    </>
  );
}
