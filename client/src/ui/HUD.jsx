// In-game overlay: lobby, countdown, speed/boost, powerup slot, timer,
// kill feed, minimap, scoreboard, event banner, podium.
import { useEffect, useRef, useState } from 'react';
import { MODES, MODE_IDS, POWERUPS, ROOMS, WALLS, MAP_BOUNDS, CHECKPOINTS, PHASE, MSG, M } from '@rc/shared';
import { useStore } from '../store.js';
import { net, send } from '../net.js';
import { telemetry } from '../game/LocalCar.jsx';
import { audio } from '../audio.js';

export default function HUD() {
  const phase = useStore((s) => s.phase);
  const connected = useStore((s) => s.connected);
  const connectError = useStore((s) => s.connectError);
  const photoMode = useStore((s) => s.photoMode);
  const [showScores, setShowScores] = useState(false);

  useEffect(() => {
    const down = (e) => { if (e.code === 'Tab') { e.preventDefault(); setShowScores(true); } };
    const up = (e) => { if (e.code === 'Tab') setShowScores(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  if (photoMode) return <div className="photo-hint">📷 photo mode — P to exit</div>;

  return (
    <div className="hud">
      {!connected && !connectError && <div className="center-msg">Connecting to the office…</div>}
      {connectError && (
        <div className="center-msg error">
          {connectError}
          <button onClick={() => useStore.setState({ screen: 'menu', connectError: null })}>Back</button>
        </div>
      )}
      {connected && phase === PHASE.LOBBY && <Lobby />}
      {connected && phase === PHASE.COUNTDOWN && <Countdown />}
      {connected && (phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN) && <MatchHUD />}
      {connected && phase === PHASE.PODIUM && <Podium />}
      {connected && (showScores || phase === PHASE.PODIUM) && phase !== PHASE.LOBBY && <Scoreboard />}
      <Feed />
      <EventBanner />
    </div>
  );
}

// ------------------------------------------------------------------ lobby
function Lobby() {
  const players = useStore((s) => s.players);
  const votes = useStore((s) => s.votes);
  const myId = useStore((s) => s.myId);
  const [ready, setReady] = useState(false);
  const [vote, setVote] = useState(null);
  const list = Object.values(players);
  const me = players[myId];

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
    <div className="lobby panel">
      <h2>OFFICE LOBBY</h2>
      <p className="lobby-sub">{list.filter((p) => !p.bot).length} human{list.filter((p) => !p.bot).length === 1 ? '' : 's'} · bots fill empty desks</p>
      <div className="lobby-players">
        {list.map((p) => (
          <div key={p.id} className={`lobby-player ${p.ready ? 'ready' : ''}`}>
            <span className="dot" style={{ background: p.paint || '#888' }} />
            {p.name} {p.id === myId && '(you)'}
            <em>{p.ready ? 'READY' : '…'}</em>
          </div>
        ))}
      </div>
      <h3>VOTE GAME MODE</h3>
      <div className="mode-vote">
        {MODE_IDS.map((m) => {
          const count = Object.values(votes).filter((v) => v === m).length;
          return (
            <button key={m} className={`mode ${vote === m ? 'sel' : ''}`} onClick={() => castVote(m)}>
              <span className="mode-icon">{MODES[m].icon}</span>
              <b>{MODES[m].name}</b>
              <small>{MODES[m].desc}</small>
              {count > 0 && <span className="votes">{count} 🗳</span>}
            </button>
          );
        })}
      </div>
      <button className={`play ready-btn ${ready ? 'is-ready' : ''}`} onClick={toggleReady}>
        {ready ? '✓ READY — waiting for others' : 'READY UP'}
      </button>
      <p className="hint">Drive around while you wait — the office is live.</p>
    </div>
  );
}

function Countdown() {
  const countdownEnd = useStore((s) => s.countdownEnd);
  const modeId = useStore((s) => s.modeId);
  const [n, setN] = useState(3);
  useEffect(() => {
    const iv = setInterval(() => {
      const left = Math.ceil((countdownEnd - Date.now()) / 1000);
      setN(left);
      if (left > 0 && left <= 3) audio.blip(440, 0.1);
      if (left === 0) audio.blip(880, 0.25, 0.2);
    }, 120);
    return () => clearInterval(iv);
  }, [countdownEnd]);
  return (
    <div className="countdown">
      <div className="mode-name">{MODES[modeId]?.icon} {MODES[modeId]?.name}</div>
      <div className="count-num">{n > 0 ? n : 'GO!'}</div>
      <div className="mode-desc">{MODES[modeId]?.desc}</div>
    </div>
  );
}

// -------------------------------------------------------------- match hud
function MatchHUD() {
  const modeId = useStore((s) => s.modeId);
  const powerup = useStore((s) => s.powerup);
  const myBeans = useStore((s) => s.myBeans);
  const teamScores = useStore((s) => s.teamScores);
  const raceProgress = useStore((s) => s.raceProgress);
  const myId = useStore((s) => s.myId);
  const endsAt = useStore((s) => s.endsAt);
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(iv);
  }, []);

  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  const prog = raceProgress[myId];
  const speedCms = Math.round(telemetry.speed * (100 / M)); // real-world cm/s at toy scale

  return (
    <>
      <div className="top-bar">
        <div className="timer">{mm}:{ss}</div>
        {modeId === 'desk_dash' && prog && <div className="mode-stat">LAP {Math.min(prog[0] + 1, MODES.desk_dash.laps)}/{MODES.desk_dash.laps} · CP {prog[1]}/{CHECKPOINTS.length}</div>}
        {modeId === 'coffee_run' && <div className="mode-stat">☕ carrying {myBeans}/{MODES.coffee_run.maxCarry}</div>}
        {modeId === 'soccer' && <div className="mode-stat soccer">🟠 {teamScores[0]} — {teamScores[1]} 🔵</div>}
        {modeId === 'battery' && <div className="mode-stat">🔋 hold the battery to score</div>}
      </div>
      <div className="bottom-left">
        <div className="speedo">
          <span className="speed-num">{speedCms}</span>
          <span className="speed-unit">cm/s</span>
        </div>
        <div className="boost-bar">
          <div className="boost-fill" style={{ width: `${telemetry.boost}%` }} />
        </div>
      </div>
      <div className="powerup-slot">
        {powerup ? (
          <>
            <span className="pw-icon">{POWERUPS[powerup]?.icon}</span>
            <span className="pw-name">{POWERUPS[powerup]?.name}</span>
            <span className="pw-key">E</span>
          </>
        ) : (
          <span className="pw-empty">?</span>
        )}
      </div>
      <Minimap />
    </>
  );
}

// --------------------------------------------------------------- minimap
function Minimap() {
  const canvasRef = useRef();
  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv.getContext('2d');
    const W = 200, H = 130;
    const sx = W / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX);
    const sz = H / (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ);
    const px = (x) => (x - MAP_BOUNDS.minX) * sx;
    const pz = (z) => H - (z - MAP_BOUNDS.minZ) * sz;
    let run = true;
    function draw() {
      if (!run) return;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(10,14,24,0.75)';
      g.fillRect(0, 0, W, H);
      // rooms
      for (const r of ROOMS) {
        g.fillStyle = r.outdoor ? 'rgba(70,90,120,0.35)' : 'rgba(120,140,170,0.18)';
        g.fillRect(px(r.x - r.w / 2), pz(r.z + r.d / 2), r.w * sx, r.d * sz);
      }
      // walls
      g.fillStyle = 'rgba(220,230,255,0.6)';
      for (const w of WALLS) {
        if (w.low) continue;
        g.fillRect(px(w.x - w.w / 2), pz(w.z + w.d / 2), Math.max(1.5, w.w * sx), Math.max(1.5, w.d * sz));
      }
      const st = useStore.getState();
      // mode markers
      if (st.modeId === 'coffee_run') {
        g.fillStyle = '#c98b4a';
        for (const b of net.beans || []) { g.beginPath(); g.arc(px(b[1]), pz(b[2]), 2, 0, 7); g.fill(); }
      }
      if (st.modeId === 'battery' && net.battery) {
        g.fillStyle = '#2ecc71';
        g.fillRect(px(net.battery.x) - 3, pz(net.battery.z) - 3, 6, 6);
      }
      if (st.modeId === 'soccer' && net.ball) {
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(px(net.ball.p[0]), pz(net.ball.p[2]), 3, 0, 7); g.fill();
      }
      if (st.modeId === 'desk_dash') {
        const prog = st.raceProgress[st.myId];
        const cp = CHECKPOINTS[(prog?.[1] ?? 0) % CHECKPOINTS.length];
        g.strokeStyle = '#4da3ff'; g.lineWidth = 2;
        g.beginPath(); g.arc(px(cp.x), pz(cp.z), 5, 0, 7); g.stroke();
      }
      if (net.robot) {
        g.fillStyle = '#ff3322';
        g.beginPath(); g.arc(px(net.robot.x), pz(net.robot.z), 4, 0, 7); g.fill();
      }
      // remote players
      for (const [id] of net.remotes) {
        const buf = net.remotes.get(id);
        const s = buf?.[buf.length - 1];
        if (!s) continue;
        g.fillStyle = st.players[id]?.bot ? '#9aa4b8' : '#ffd166';
        g.beginPath(); g.arc(px(s.p[0]), pz(s.p[2]), 2.6, 0, 7); g.fill();
      }
      // me
      g.save();
      g.translate(px(telemetry.x), pz(telemetry.z));
      g.rotate(-telemetry.heading);
      g.fillStyle = '#4dffa6';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
      g.restore();
      requestAnimationFrame(draw);
    }
    draw();
    return () => { run = false; };
  }, []);
  return <canvas ref={canvasRef} className="minimap" width={200} height={130} />;
}

// -------------------------------------------------------------- scoreboard
function Scoreboard() {
  const players = useStore((s) => s.players);
  const scores = useStore((s) => s.scores);
  const myId = useStore((s) => s.myId);
  const rows = Object.values(players)
    .map((p) => ({ ...p, score: scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  return (
    <div className="scoreboard panel">
      <h3>SCOREBOARD</h3>
      {rows.map((p, i) => (
        <div key={p.id} className={`score-row ${p.id === myId ? 'me' : ''}`}>
          <span className="place">{i + 1}</span>
          <span className="dot" style={{ background: p.paint || '#888' }} />
          <span className="pname">{p.name}</span>
          <b>{p.score}</b>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ podium
function Podium() {
  const podium = useStore((s) => s.podium);
  const myId = useStore((s) => s.myId);
  if (!podium) return null;
  const top3 = podium.slice(0, 3);
  const mine = podium.find((p) => p.id === myId);
  return (
    <div className="podium">
      <h2>🏆 MATCH OVER</h2>
      <div className="podium-steps">
        {[1, 0, 2].map((idx) => {
          const p = top3[idx];
          if (!p) return <div key={idx} className="step empty" />;
          return (
            <div key={idx} className={`step p${idx}`}>
              <div className="medal">{['🥇', '🥈', '🥉'][idx]}</div>
              <div className="pod-name">{p.name}</div>
              <div className="pod-score">{p.score}</div>
            </div>
          );
        })}
      </div>
      {mine && <p className="pod-mine">You placed {mine.place}{['st', 'nd', 'rd'][mine.place - 1] || 'th'} · +XP earned</p>}
      <p className="hint">Back to the lobby in a few seconds…</p>
    </div>
  );
}

// ---------------------------------------------------------------- feeds
function Feed() {
  const feed = useStore((s) => s.feed);
  return (
    <div className="feed">
      {feed.map((f) => <div key={f.key} className="feed-item">{f.text}</div>)}
    </div>
  );
}

function EventBanner() {
  const event = useStore((s) => s.event);
  if (!event) return null;
  return (
    <div className="event-banner">
      <span className="ev-icon">{event.icon}</span>
      <div>
        <b>{event.name}</b>
        <small>{event.desc}</small>
      </div>
    </div>
  );
}
