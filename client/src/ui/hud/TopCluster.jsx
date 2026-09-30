// ------------------------------------------------------------ top cluster
// The match clock and the per-mode chips under it: lap / beans / score /
// objective / standup, plus the Office Cup round and the round's mutator.
import { MODES, raceLaps, MUTATORS } from '@rc/shared';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';
import Icon from '../Icon.jsx';
import './topcluster.css';

export default function TopCluster({ map, spectating, perchWarn, warnRoom, warnLeft, finale }) {
  const modeId = useStore((s) => s.modeId);
  const variantId = useStore((s) => s.variant);
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
  const mutator = useStore((s) => s.mutator);
  const cup = useStore((s) => s.cup);
  const scores = useStore((s) => s.scores);

  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  const prog = raceProgress[myId];

  return (
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
        {perchWarn && (
          <div className="chip mutator-chip"><Icon name="warning" size={15} />
            up on the furniture — {modeId === 'tag' ? 'It passes on' : 'the battery slides off'} in a moment
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
  );
}

// The server's standup test (modes.js KothMode.inZone) counts nobody behind
// a full-height wall — the ring is a circle, the meeting is a room. Without
// it the chip said "IN THE STANDUP · +3/s" to a car scoring nothing next door.
const fullWalls = new WeakMap();
export function fullWallBetween(map, x1, z1, x2, z2) {
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
export function StandupChip({ map, spectating }) {
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
