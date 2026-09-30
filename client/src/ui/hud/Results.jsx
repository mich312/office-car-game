// ------------------------------------------------------------------ results
// "Employees of the Match" — winners' wall with plaque frames, staggered
// rise, light confetti. Cup rounds reuse the scoreboard rows for standings.
import { useMemo } from 'react';
import { useStore } from '../../store.js';
import './results.css';

const CONFETTI_COLORS = ['#ffb454', '#5cc8ff', '#4ade80', '#ffe27a', '#ff8a3d'];
export default function Results() {
  const podium = useStore((s) => s.podium);
  const myId = useStore((s) => s.myId);
  const rivalry = useStore((s) => s.rivalry);
  const nemesis = useStore((s) => s.nemesis);
  const cup = useStore((s) => s.cup);
  const confetti = useMemo(
    () => Array.from({ length: 32 }, (_, i) => ({
      left: `${(i * 37 + Math.random() * 20) % 100}%`,
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      animationDuration: `${2.4 + Math.random() * 1.8}s`,
      animationDelay: `${Math.random() * 2}s`,
    })),
    [],
  );
  if (!podium) return null;
  // The grand ceremony honours the cup, not whoever won its last round
  const rows = cup?.final && cup.standings ? cup.standings : podium;
  const top3 = rows.slice(0, 3);
  const mine = rows.find((p) => p.id === myId);
  // the cup table: the top five, plus your own row wherever you stand
  const cupRows = cup?.standings ? cup.standings.filter((s, i) => i < 5 || s.id === myId) : null;
  const title = cup?.final ? 'OFFICE CUP CHAMPION'
    : cup ? `ROUND ${cup.round}/${cup.total} DONE`
      : 'EMPLOYEES OF THE MATCH';
  return (
    <div className="podium-wrap">
      <div className="confetti">
        {confetti.map((s, i) => <i key={i} style={s} />)}
      </div>
      <div className="podium panel">
        <span className="label">{cup ? 'office cup' : 'match over'}</span>
        <h2 className={`podium-title ${cup?.final ? 'champ' : ''}`}>{title}</h2>
        <div className="podium-wall">
          {[1, 0, 2].map((idx) => {
            const p = top3[idx];
            if (!p) return <div key={idx} className="plaque empty" />;
            return (
              <div key={idx} className={`plaque r${idx}`}>
                <div className="plaque-medal">{idx + 1}</div>
                <div className="pod-name">
                  <span className="dot" style={{ background: p.paint || '#888' }} />
                  {p.name}
                </div>
                <div className="pod-score">{p.score}</div>
              </div>
            );
          })}
        </div>
        {cup?.standings && (
          <div className="cup-standings">
            <span className="label">cup standings</span>
            {cupRows.map((s) => (
              <div key={s.id} className={`score-row ${s.id === myId ? 'me' : ''}`}>
                <span className="place">{s.place}</span>
                <span />
                <span className="pname">{s.name}</span>
                <b>{s.score}{s.roundPts > 0 && <span className="cup-gain">+{s.roundPts}</span>}</b>
              </div>
            ))}
          </div>
        )}
        {mine && (
          <p className="pod-mine">
            You placed <b>{mine.place}{['st', 'nd', 'rd'][mine.place - 1] || 'th'}</b>{cup?.final ? ' in the cup' : ''} · +XP earned
          </p>
        )}
        {rivalry && rivalry.n >= 2 && (
          <p className="pod-rivalry">Your nemesis: <b>{rivalry.name}</b> — {rivalry.n} collisions</p>
        )}
        {nemesis && (
          <p className="pod-rivalry">Feud of the match: {nemesis.a} vs {nemesis.b} ({nemesis.n} hits)</p>
        )}
        <p className="hint">{cup && !cup.final ? 'next round starts automatically…' : 'back to the lobby in a few seconds…'}</p>
      </div>
    </div>
  );
}
