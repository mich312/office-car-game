// In-game overlay: lobby, countdown, drive cluster, action tray, timer,
// kill feed, minimap, scoreboard, event toasts, podium. Everything anchors
// to the HUD safe-area frame and composes the shared chip/toast primitives.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MODES, MODE_IDS, MAPS, MAP_IDS, raceLaps, POWERUPS, PHASE, MSG, M, MUTATORS, ABILITIES, ABILITY_COOLDOWN_S, raceCheckpoints, variantOf } from '@rc/shared';
import { useMap, currentMap } from '../game/activeMap.js';
import { useStore } from '../store.js';
import { net, send } from '../net.js';
import { telemetry } from '../game/LocalCar.jsx';
import { touchInput } from '../game/useControls.js';
import { audio } from '../audio.js';
import { inviteLink, copyText } from '../rooms.js';
import { DrivingTest, MatchHints } from './Coach.jsx';
import Icon, { MODE_ICON, EVENT_ICON } from './Icon.jsx';

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

  if (photoMode) {
    return (
      <div className="photo-hint chip">
        <Icon name="camera" size={15} /> photo mode — <kbd>P</kbd> to exit
      </div>
    );
  }

  return (
    <div className="hud">
      {!connected && !connectError && (
        <div className="connect-screen">
          <div className="logo small">
            <span className="logo-tiny">TINY RC</span>
            <span className="logo-mayhem">MAYHEM</span>
          </div>
          <p>the office is waking up<span className="dots" /></p>
        </div>
      )}
      {connectError && (
        <div className="connect-screen">
          <div className="toast toast-bad">
            <span className="toast-icon"><Icon name="warning" /></span>
            <div>
              <span className="label">connection failed</span>
              <b>{connectError}</b>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => useStore.setState({ screen: 'menu', connectError: null })}>
            <Icon name="chevron-left" size={15} /> Back to the garage
          </button>
        </div>
      )}
      {connected && phase === PHASE.LOBBY && <Lobby />}
      {connected && phase === PHASE.LOBBY && <DrivingTest />}
      {connected && phase === PHASE.PLAYING && <MatchHints />}
      {connected && phase === PHASE.COUNTDOWN && <Countdown />}
      {connected && (phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN) && <MatchHUD />}
      {connected && phase === PHASE.PODIUM && <Podium />}
      {connected && showScores && phase !== PHASE.LOBBY && phase !== PHASE.PODIUM && <Scoreboard />}
      <Feed />
      <EventBanner />
    </div>
  );
}

// ------------------------------------------------------------------ lobby
// A side rail instead of a centered panel: the live office IS the lobby,
// so the menu leaves most of the screen to it.
// The room you're in and the link that brings friends to it. Any room can be
// joined by its code, so a quick-play room gets an invite link too.
function RoomBadge() {
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

function Lobby() {
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
function MapBallots({ humans }) {
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

// -------------------------------------------------------------- countdown
function Countdown() {
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

// -------------------------------------------------------------- match hud
function MatchHUD() {
  const modeId = useStore((s) => s.modeId);
  const variantId = useStore((s) => s.variant);
  const powerup = useStore((s) => s.powerup);
  const myBeans = useStore((s) => s.myBeans);
  const teamScores = useStore((s) => s.teamScores);
  const myTeam = useStore((s) => s.players[s.myId]?.team) ? 1 : 0;
  const raceProgress = useStore((s) => s.raceProgress);
  const myId = useStore((s) => s.myId);
  const endsAt = useStore((s) => s.endsAt);
  const itId = useStore((s) => s.itId);
  const players = useStore((s) => s.players);
  const sumoRound = useStore((s) => s.sumoRound);
  const sumoOutLeft = useStore((s) => s.sumoOutLeft);
  const sumoDead = useStore((s) => s.sumoDead);
  const sumoRest = useStore((s) => s.sumoRest);
  const lcs = useStore((s) => s.lcs);
  const spectating = useStore((s) => s.spectating);
  const spectateTarget = useStore((s) => s.spectateTarget);
  const mutator = useStore((s) => s.mutator);
  const cup = useStore((s) => s.cup);
  const abilityReadyAt = useStore((s) => s.abilityReadyAt);
  const printerFlashUntil = useStore((s) => s.printerFlashUntil);
  const scores = useStore((s) => s.scores);
  const myCar = useStore((s) => s.car);
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(iv);
  }, []);

  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  const prog = raceProgress[myId];
  const speedCms = Math.round(telemetry.speed * (100 / M)); // real-world cm/s at toy scale
  const boostFrac = Math.min(1, Math.max(0, telemetry.boost / 100));
  // Last Car Standing: closing-room countdown + get-out alarm
  const map = useMap();
  const warnRoom = lcs?.warn ? map.ROOMS.find((r) => r.id === lcs.warn.room) : null;
  const warnLeft = lcs?.warn ? Math.max(0, Math.ceil((lcs.warn.until - Date.now()) / 1000)) : 0;
  const myRoom = !spectating ? map.roomAt(telemetry.x, telemetry.z) : null;
  // the finale's ring: outside it is as deadly as a closed room
  const finale = modeId === 'last_standing' ? net.zone : null;
  const outsideRing = !!(finale && !spectating && Math.hypot(telemetry.x - finale.x, telemetry.z - finale.z) > finale.r);
  const inLockedRoom = !!(modeId === 'last_standing' && ((myRoom && lcs?.locked?.includes(myRoom.id)) || outsideRing));

  return (
    <>
      <div className="hud-top">
        <div className={`timer-chip ${left > 0 && left <= 30 ? 'low' : ''}`}>{mm}:{ss}</div>
        <div className="hud-top-row">
          {modeId === 'desk_dash' && prog && (prog[0] >= raceLaps(map, MODES.desk_dash.laps) ? (
            <div className="chip"><Icon name="flag" size={15} />
              FINISHED{net.racePlace ? ` · ${net.racePlace}${['st', 'nd', 'rd'][net.racePlace - 1] || 'th'}` : ''}
            </div>
          ) : (
            <div className="chip"><Icon name="flag" size={15} />
              LAP {prog[0] + 1}/{raceLaps(map, MODES.desk_dash.laps)} · CP {prog[1]}/{map.CHECKPOINTS.length}{variantId === 'reverse' && <span className="variant-tag"> · REVERSE</span>}
            </div>
          ))}
          {modeId === 'coffee_run' && (
            <div className="chip"><Icon name="coffee" size={15} /> carrying {myBeans}/{MODES.coffee_run.maxCarry}</div>
          )}
          {modeId === 'soccer' && (
            <div className="chip">
              <span className="dot" style={{ background: '#ff8a3d' }} />
              <span className="team-score">{teamScores[0]} — {teamScores[1]}</span>
              <span className="dot" style={{ background: '#4da3ff' }} />
            </div>
          )}
          {modeId === 'soccer' && !spectating && players[myId] && (
            // which side you're on was never said anywhere: the chip, the
            // floor ring under your car and the minimap all say it now
            <div className="chip">
              YOU: <span className="dot" style={{ background: myTeam ? '#4da3ff' : '#ff8a3d' }} /> {myTeam ? 'BLUE' : 'ORANGE'}
              {' '}→ attack the <span className="dot" style={{ background: myTeam ? '#ff8a3d' : '#4da3ff' }} /> goal
            </div>
          )}
          {modeId === 'battery' && (
            <div className="chip"><Icon name="battery" size={15} /> hold the battery to score</div>
          )}
          {modeId === 'koth' && <StandupChip map={map} spectating={spectating} />}
          {modeId === 'tag' && (
            <div className="chip"><Icon name="crown" size={15} />
              {itId === myId ? "YOU'RE IT — keep scoring!" : itId ? `${players[itId]?.name || '???'} is It — bump them!` : '…'}
            </div>
          )}
          {modeId === 'sumo' && (
            <div className={`chip ${sumoOutLeft != null && !sumoDead && !sumoRest ? 'mutator-chip' : ''}`}>
              <Icon name={sumoRest ? 'flag' : sumoDead ? 'skull' : sumoOutLeft != null ? 'warning' : 'target'} size={15} />
              {sumoRest
                ? `round ${sumoRound} over — next round in ${sumoRest}s`
                : sumoDead
                  ? 'out — next round soon'
                  : sumoOutLeft != null
                    ? `GET BACK IN! ${sumoOutLeft.toFixed(1)}s`
                    : `round ${sumoRound || 1} — stay inside the ring`}
            </div>
          )}
          {modeId === 'last_standing' && (
            <div className="chip"><Icon name="crown" size={15} />
              {lcs?.alive ?? '…'} cars left{warnRoom ? ` · ${warnRoom.name} closes in ${warnLeft}s` : finale ? ' · the last meeting — stay in the ring' : ''}
            </div>
          )}
          {modeId === 'free_roam' && (
            <div className="chip"><Icon name="star" size={15} /> style {Math.round(scores[myId] || 0)} · drift, fly, smash</div>
          )}
          {cup && <div className="chip cup-chip"><Icon name="trophy" size={15} /> round {cup.round}/{cup.total}</div>}
          {mutator && <div className="chip mutator-chip"><Icon name="warning" size={15} /> {MUTATORS[mutator]?.name}</div>}
        </div>
      </div>

      {printerFlashUntil > Date.now() && (
        <div className="printer-flash"><Icon name="printer" size={90} /></div>
      )}
      {inLockedRoom && (
        <div className="toast toast-bad zap-toast">
          <span className="toast-icon"><Icon name="warning" /></span>
          <div><b>{outsideRing ? 'OUTSIDE THE RING — GET IN!' : 'ROOM CLOSED — GET OUT!'}</b></div>
        </div>
      )}
      {spectating && (
        <div className="spectate-chip chip">
          <Icon name="camera" size={15} /> eliminated — watching {spectateTarget || '…'}
          <small>click / space to switch</small>
        </div>
      )}

      <div className="drive-cluster">
        <div className={`boost-ring ${boostFrac >= 0.995 ? 'full' : ''}`} style={{ '--frac': boostFrac }}>
          <div className="speed">
            <b>{speedCms}</b>
            <span className="label">cm/s</span>
          </div>
        </div>
      </div>

      <div className="action-tray">
        <AbilitySlot carId={myCar} readyAt={abilityReadyAt} />
        <div className="slot">
          {powerup ? (
            <>
              <span className="slot-icon"><Icon name={`act-${powerup}`} size={30} /></span>
              <span className="slot-name">{POWERUPS[powerup]?.name}</span>
            </>
          ) : (
            <>
              <span className="slot-empty" />
              <span className="label">powerup</span>
            </>
          )}
          <span className="keycap">E</span>
        </div>
      </div>

      <div className="map-cluster">
        <Minimap />
        {myRoom && <div className="map-room chip"><span className="label">{myRoom.name}</span></div>}
      </div>
      <TouchControls />
    </>
  );
}

// The server's standup test (modes.js KothMode.inZone) counts nobody behind
// a full-height wall — the ring is a circle, the meeting is a room. Without
// it the chip said "IN THE STANDUP · +3/s" to a car scoring nothing next door.
const fullWalls = new WeakMap();
function fullWallBetween(map, x1, z1, x2, z2) {
  let walls = fullWalls.get(map);
  if (!walls) {
    walls = map.WALLS.filter((w) => !w.low).map((w) => [w.x - w.w / 2, w.x + w.w / 2, w.z - w.d / 2, w.z + w.d / 2]);
    fullWalls.set(map, walls);
  }
  const dx = x2 - x1, dz = z2 - z1;
  for (const [x0, x1b, z0, z1b] of walls) {
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[x1, dx, x0, x1b], [z1, dz, z0, z1b]]) {
      if (Math.abs(d) < 1e-9) { if (p <= lo || p >= hi) { t0 = 2; break; } continue; }
      let a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 < t1) return true;
  }
  return false;
}

// ------------------------------------------------------- standup chip
// Where the meeting is, when it moves, and whether you're scoring: the
// server stamps the hop time and how many cars share the zone.
function StandupChip({ map, spectating }) {
  const z = net.zone;
  if (!z) return <div className="chip"><Icon name="target" size={15} /> hold the standup zone to score</div>;
  const hopIn = z.until ? Math.max(0, Math.ceil((z.until - net.clockOffset - performance.now()) / 1000)) : null;
  const inZone = !spectating && Math.hypot(telemetry.x - z.x, telemetry.z - z.z) <= z.r
    && Math.abs(telemetry.y) < 4 && !fullWallBetween(map, z.x, z.z, telemetry.x, telemetry.z);
  const n = z.n || 0;
  const rate = MODES.koth.scorePerSecond / Math.max(1, n);
  const room = map.roomAt(z.x, z.z)?.name;
  const soon = hopIn != null && hopIn <= 5;
  return (
    <div className={`chip ${inZone && n > 1 ? 'mutator-chip' : ''}`}>
      <Icon name={inZone && n > 1 ? 'warning' : 'target'} size={15} />
      {inZone
        ? n > 1 ? `CONTESTED ×${n} · +${rate.toFixed(1)}/s` : `IN THE STANDUP · +${rate}/s`
        : `standup${room ? ` in the ${room}` : ''}`}
      {hopIn != null && <span className={soon ? 'variant-tag' : ''}> · moves in {hopIn}s</span>}
    </div>
  );
}

// ---------------------------------------------------------- ability slot
// Per-car special (Q / touch ⭐) with a radial cooldown wipe driven by the
// server-stamped readyAt.
function AbilitySlot({ carId, readyAt }) {
  const ab = ABILITIES[carId] || ABILITIES.balanced;
  const left = Math.max(0, readyAt - Date.now());
  const frac = Math.min(1, left / (ABILITY_COOLDOWN_S * 1000));
  return (
    <div className={`slot ability ${left > 0 ? '' : 'ready'}`} title={`${ab.name} — ${ab.desc}`}>
      <span className="slot-icon"><Icon name={`act-${ab.id}`} size={28} /></span>
      <span className="slot-name">{ab.name}</span>
      {left > 0 && <div className="slot-cd" style={{ '--frac': frac }} />}
      <span className="keycap">Q</span>
    </div>
  );
}

// ------------------------------------------------- touch controls (mobile)
// Rendered always, shown via CSS only on coarse-pointer devices. Buttons
// write into the shared touchInput channel merged by the input poll.
function TouchControls() {
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

// --------------------------------------------------------------- minimap
function Minimap() {
  const canvasRef = useRef();
  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv.getContext('2d');
    const W = 210, H = 140;
    let sx, sz, px, pz;
    let run = true;
    function draw() {
      if (!run) return;
      // fit the map's floor plan, centred (maps differ in shape)
      const map = currentMap();
      const B = map.MAP_BOUNDS;
      const sc = Math.min(W / (B.maxX - B.minX), H / (B.maxZ - B.minZ));
      const ox = (W - (B.maxX - B.minX) * sc) / 2, oz = (H - (B.maxZ - B.minZ) * sc) / 2;
      sx = sz = sc;
      px = (x) => ox + (x - B.minX) * sc;
      pz = (z) => H - oz - (z - B.minZ) * sc;
      const t = performance.now() / 1000;
      const pulse = 0.55 + 0.45 * Math.sin(t * 5);
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(15, 19, 31, 0.88)';
      g.fillRect(0, 0, W, H);
      // rooms (Last Car Standing tints closed red / closing amber)
      const st0 = useStore.getState();
      for (const r of map.ROOMS) {
        const locked = st0.modeId === 'last_standing' && st0.lcs?.locked?.includes(r.id);
        const closing = st0.modeId === 'last_standing' && st0.lcs?.warn?.room === r.id;
        const rx = px(r.x - r.w / 2), rz = pz(r.z + r.d / 2), rw = r.w * sx, rd = r.d * sz;
        g.fillStyle = locked ? 'rgba(255, 92, 92, 0.32)'
          : closing ? 'rgba(255, 226, 122, 0.30)'
            : r.outdoor ? 'rgba(35, 46, 66, 0.85)' : 'rgba(28, 35, 52, 0.85)';
        g.fillRect(rx, rz, rw, rd);
        g.strokeStyle = 'rgba(72, 85, 116, 0.8)';
        g.lineWidth = 1;
        g.strokeRect(rx + 0.5, rz + 0.5, rw - 1, rd - 1);
      }
      // walls as hairlines
      g.fillStyle = 'rgba(154, 167, 192, 0.4)';
      for (const w of map.WALLS) {
        if (w.low) continue;
        g.fillRect(px(w.x - w.w / 2), pz(w.z + w.d / 2), Math.max(1, w.w * sx), Math.max(1, w.d * sz));
      }
      const st = useStore.getState();
      // mode markers — objectives pulse gently, pickups stay quiet
      if (st.modeId === 'coffee_run') {
        g.fillStyle = 'rgba(201, 139, 74, 0.55)';
        for (const b of net.beans || []) { g.beginPath(); g.arc(px(b[1]), pz(b[2]), 1.6, 0, 7); g.fill(); }
        // the machine: an objective like any other (on the cellar it's out
        // of sight behind a wall); brighter while you have beans to deliver
        const cm = map.COFFEE_MACHINE;
        const loaded = st.myBeans > 0;
        g.strokeStyle = `rgba(63, 255, 170, ${loaded ? 0.55 + 0.45 * pulse : 0.35})`;
        g.lineWidth = loaded ? 2 : 1.5;
        g.beginPath(); g.arc(px(cm.deliverX), pz(cm.deliverZ), Math.max(3, cm.radius * 2 * sx), 0, 7); g.stroke();
      }
      if (st.modeId === 'battery' && net.battery) {
        g.fillStyle = `rgba(74, 222, 128, ${0.5 + 0.5 * pulse})`;
        g.fillRect(px(net.battery.x) - 3, pz(net.battery.z) - 3, 6, 6);
      }
      if (st.modeId === 'soccer') {
        // the goals, in the colour of the team defending them
        for (const gl of map.SOCCER.goals) {
          g.fillStyle = gl.team ? '#4da3ff' : '#ff8a3d';
          g.fillRect(px(gl.x) - 1.5, pz(gl.z + gl.width / 2), 3, Math.max(3, gl.width * sz));
        }
      }
      if (st.modeId === 'soccer' && net.ball) {
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(px(net.ball.p[0]), pz(net.ball.p[2]), 3, 0, 7); g.fill();
      }
      if (st.modeId === 'desk_dash' && !(st.raceProgress[st.myId]?.[0] >= raceLaps(map, MODES.desk_dash.laps))) {
        const prog = st.raceProgress[st.myId];
        const cps = raceCheckpoints(st.variant, map);
        const cp = cps[(prog?.[1] ?? 0) % cps.length];
        g.strokeStyle = `rgba(92, 200, 255, ${0.5 + 0.5 * pulse})`;
        g.lineWidth = 2;
        g.beginPath(); g.arc(px(cp.x), pz(cp.z), 4.5 + pulse * 1.5, 0, 7); g.stroke();
      }
      if (net.robot) {
        g.fillStyle = '#ff5c5c';
        g.beginPath(); g.arc(px(net.robot.x), pz(net.robot.z), 3.5, 0, 7); g.fill();
      }
      // koth/sumo zone ring
      if (net.zone) {
        g.strokeStyle = st.modeId === 'sumo' ? 'rgba(255, 92, 92, 0.9)' : `rgba(255, 180, 84, ${0.55 + 0.45 * pulse})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(px(net.zone.x), pz(net.zone.z), net.zone.r * sx, net.zone.r * sz, 0, 0, 7);
        g.stroke();
        // the standup's next spot, in its last five seconds
        const nx = net.zone.next;
        if (nx && net.zone.until && net.zone.until - net.clockOffset - performance.now() < 5000) {
          g.setLineDash([3, 3]);
          g.strokeStyle = `rgba(255, 180, 84, ${0.35 + 0.5 * pulse})`;
          g.beginPath();
          g.ellipse(px(nx.x), pz(nx.z), net.zone.r * sx, net.zone.r * sz, 0, 0, 7);
          g.stroke();
          g.setLineDash([]);
        }
      }
      // whoever is It glows amber
      if (net.it) {
        const s = net.it === st.myId
          ? { p: [telemetry.x, 0, telemetry.z] }
          : (() => { const buf = net.remotes.get(net.it); return buf?.[buf.length - 1]; })();
        if (s) {
          g.fillStyle = `rgba(255, 180, 84, ${0.6 + 0.4 * pulse})`;
          g.beginPath(); g.arc(px(s.p[0]), pz(s.p[2]), 4.5, 0, 7); g.fill();
        }
      }
      // remote players in their paint colors (bots dimmed)
      for (const [id] of net.remotes) {
        const buf = net.remotes.get(id);
        const s = buf?.[buf.length - 1];
        if (!s) continue;
        if (((s.f || 0) & 128) && st.modeId === 'last_standing') continue; // ghosts are off the map
        const p = st.players[id];
        g.globalAlpha = p?.bot ? 0.55 : 1;
        g.fillStyle = st.modeId === 'soccer' ? (p?.team ? '#4da3ff' : '#ff8a3d') : p?.paint || '#9aa7c0';
        g.beginPath(); g.arc(px(s.p[0]), pz(s.p[2]), 2.6, 0, 7); g.fill();
        g.globalAlpha = 1;
      }
      // me: amber arrow + view cone
      g.save();
      g.translate(px(telemetry.x), pz(telemetry.z));
      g.rotate(-telemetry.heading);
      g.fillStyle = 'rgba(255, 180, 84, 0.14)';
      g.beginPath();
      g.moveTo(0, 0); g.arc(0, 0, 20, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
      g.fillStyle = '#ffb454';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
      g.restore();
      requestAnimationFrame(draw);
    }
    draw();
    return () => { run = false; };
  }, []);
  return <canvas ref={canvasRef} className="minimap" width={210} height={140} />;
}

// -------------------------------------------------------------- scoreboard
function Scoreboard() {
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

// ------------------------------------------------------------------ podium
// "Employees of the Match" — winners' wall with plaque frames, staggered
// rise, light confetti. Cup rounds reuse the scoreboard rows for standings.
const CONFETTI_COLORS = ['#ffb454', '#5cc8ff', '#4ade80', '#ffe27a', '#ff8a3d'];
function Podium() {
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

// ---------------------------------------------------------------- feeds
function Feed() {
  const feed = useStore((s) => s.feed);
  return (
    <div className="feed">
      {feed.slice(-4).map((f) => <div key={f.key} className="feed-item">{f.text}</div>)}
    </div>
  );
}

// Office events arrive as calendar reminders: telegraphs on a sticky-note
// toast, the live event on a glass toast.
function EventBanner() {
  const event = useStore((s) => s.event);
  const eventWarn = useStore((s) => s.eventWarn);
  if (!event && eventWarn) {
    return (
      <div className="toast toast-warn hud-event">
        <span className="toast-icon"><Icon name={EVENT_ICON[eventWarn.id] || 'warning'} /></span>
        <div>
          <span className="label">reminder · starting soon</span>
          <b>{eventWarn.name}</b>
          <small>{eventWarn.desc}</small>
        </div>
      </div>
    );
  }
  if (!event) return null;
  return (
    <div className="toast hud-event">
      <span className="toast-icon"><Icon name={EVENT_ICON[event.id] || 'warning'} /></span>
      <div>
        <span className="label">office event</span>
        <b>{event.name}</b>
        <small>{event.desc}</small>
      </div>
    </div>
  );
}
