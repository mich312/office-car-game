// ------------------------------------------------------------------ results
// Match results and the Office Cup (SPEC-TOYBOX §4.18). A 2-1-3 podium in
// the drivers' own paint with plaque titles, your stamp when you made the
// top three, the payslip (XP line items derived from the server's own
// formula, so they always add up), the rest of the office, your shift
// report, your nemesis and a countdown back to the lobby / next round.
//
// Every number is real: the server sends places, scores, XP, rivalries and
// cup standings; the client measured your shift (matchStats) and remembers
// which mode each cup round was (cupLog). Nothing else is shown.
import { useCallback, useMemo, useRef } from 'react';
import { MODES, MAPS, UNLOCKS, PODIUM_SECONDS, variantOf } from '@rc/shared';
import { useStore } from '../../store.js';
import { disconnect } from '../../net.js';
import { ToyIcon, ToyCar } from '../Icon.jsx';
import { FLOOR_CODE, ordinal, withOrdinal, paintOf, Slots, setSlots } from './format.js';
import { matchStats } from './matchStats.js';
import { useHudWriter } from './hudLoop.js';
import { useLayout } from './useLayout.js';
import './results.css';

// an Office Cup intermission is a server literal (room.js endMatch: 7 s)
const CUP_INTERMISSION_S = 7;
const PLAQUE = ['Employee of the match', 'Most improved commute', 'Punctual-ish'];
const floorName = (id) => (MAPS[id]?.name || id || '').replace(/^The /, '');

// The server pays xp = max(10, round(score / 10) + (3 − min(place − 1, 3)) × 15)
// (room.js endMatch). Split what it paid back into those lines.
export function payLines({ gained, place, score }, bonusLabel = 'Placement bonus') {
  const bonus = (3 - Math.min(Math.max(place, 1) - 1, 3)) * 15;
  const perf = Math.round(score / 10);
  const lines = [];
  if (bonus > 0) lines.push([`${bonusLabel} · ${withOrdinal(place)}`, bonus]);
  lines.push([`Score ${score} ÷ 10`, perf]);
  const sum = bonus + perf;
  if (sum === gained) return lines;
  if (sum < 10 && gained === 10) return [...lines, ['Minimum wage top-up', 10 - sum]];
  return [['Match pay', gained]]; // (a formula we don't know: show the total only)
}

// Rows to show from a ranked list when it's long: `head` places, a gap,
// then you ±1. Short lists show whole.
function collapse(rows, myId, { head = 3, from = 0, max = 8, around = 1 } = {}) {
  const list = rows.slice(from);
  if (list.length <= max - from) return list;
  const mine = list.findIndex((r) => r.id === myId);
  const keep = new Set([...Array(head).keys()]);
  if (mine >= 0) for (let i = mine - around; i <= mine + around; i++) if (i >= 0 && i < list.length) keep.add(i);
  const out = [];
  let prev = -1;
  [...keep].sort((a, b) => a - b).forEach((i) => {
    if (i > prev + 1) out.push({ gap: true, id: `gap-${i}` });
    out.push(list[i]);
    prev = i;
  });
  return out;
}

function NameBits({ p, myId }) {
  return (
    <>
      {p.bot && <span className="tb-bot" title="Bot"><ToyIcon name="bot" /></span>}
      {p.id === myId && <span className="tb-you">YOU</span>}
    </>
  );
}

function Pod({ p, place, myId, unit, plaque, i }) {
  if (!p) return <div className={`tb-pod p${place} is-empty`} />;
  const you = p.id === myId;
  return (
    <div className={`tb-pod p${place}${you ? ' is-you' : ''} a-rise`} style={{ '--i': i }}>
      <ToyCar paint={paintOf(p)} className="tb-car tb-pod-car" />
      <div className="tb-pod-name">
        <span className={`tb-rib ${you ? 'is-you' : 'is-ink'}`}><span className="tb-ui8">{p.name}</span><NameBits p={p} myId={myId} /></span>
        <span className="tb-pod-sc tb-num">{p.score} {unit}</span>
      </div>
      <div className="tb-blk" style={{ '--paint': paintOf(p) }}>
        <span className="tb-blk-n tb-disp tb-ol tb-ex">{place}</span>
        <span className="tb-plaque">{plaque}</span>
      </div>
    </div>
  );
}

function Payslip({ lastXp, title, bonusLabel }) {
  const lines = payLines(lastXp, bonusLabel);
  const { before, after, gained } = lastXp;
  const next = UNLOCKS.find((u) => u.xp > after);
  const got = UNLOCKS.filter((u) => u.xp > before && u.xp <= after);
  const scale = next ? next.xp : Math.max(after, 1);
  const kind = (u) => ({ paint: 'paint', antenna: 'antenna', hat: 'hat', trail: 'trail' }[u.type] || '');
  return (
    <div className="tb-pay tb-box a-rise" style={{ '--i': 3 }}>
      <div className="tb-pay-h">
        <span className="tb-lbl"><ToyIcon name="paper" />Payslip · {title}</span>
        <span className="tb-lbl">Career · <b className="tb-num">{after} XP</b></span>
      </div>
      <div className="tb-pay-top">
        <span className="tb-pay-big tb-disp tb-ol tb-ex tb-grad" data-t={`+${gained} XP`}>+{gained} XP</span>
        <ul className="tb-pay-lines">
          {lines.map(([label, v]) => <li key={label}><span>{label}</span><b className="tb-num">+{v}</b></li>)}
        </ul>
      </div>
      <div className="tb-xpbar" role="img" aria-label={`Career XP ${before} to ${after}${next ? ` of ${next.xp}` : ''}`}>
        <i className="was" style={{ '--w': Math.min(1, before / scale) }} />
        <i className="gain" style={{ '--l': Math.min(1, before / scale), '--w': Math.max(0, Math.min(1, after / scale) - Math.min(1, before / scale)) }} />
      </div>
      <div className="tb-pay-f">
        <span>
          {before} → <b className="tb-num">{after}</b>
          {got.length > 0 && <> · unlocked {got.map((u, k) => <span key={u.name}>{k ? ' + ' : ''}<b>{u.name}</b> {kind(u)}</span>)}</>}
        </span>
        <span>{next ? <>Next unlock: <b>{next.name}</b> @ {next.xp} XP</> : <>Every unlock earned</>}</span>
      </div>
    </div>
  );
}

function CupTable({ cup, cupLog, myId, compact }) {
  const final = !!cup.final;
  const rows = compact ? collapse(cup.standings, myId, { head: 3, max: 4, around: 0 }) : collapse(cup.standings, myId, { head: 3, max: 8 });
  const champ = cup.standings[0];
  const rounds = Array.from({ length: cup.total }, (_, k) => k + 1);
  return (
    <div className="tb-cup tb-box a-slide-r" style={{ '--i': 2 }}>
      <div className="tb-cup-h">
        <span className="tb-trophy"><ToyIcon name="trophy" /></span>
        <div>
          <div className="tb-disp tb-ol tb-ex">{final ? 'Cup champion' : 'Office Cup'}</div>
          <div className="tb-lbl">
            {final
              ? `${champ?.name} takes it · ${champ?.wins || 0} round win${champ?.wins === 1 ? '' : 's'}`
              : `Standings after round ${cup.round} of ${cup.total}`}
          </div>
        </div>
      </div>
      {!compact && (
        <div className="tb-rounds">
          {rounds.map((r) => {
            const played = cupLog.find((c) => c.round === r);
            const done = r <= cup.round;
            return (
              <div key={r} className={`tb-rnd${done ? ' is-done' : r === cup.round + 1 ? ' is-next' : ''}`}>
                <span className="no tb-disp">{r}</span>
                {done ? (MODES[played?.modeId]?.name || `Round ${r}`) : 'Drawn at random'}
              </div>
            );
          })}
        </div>
      )}
      <div className="tb-cup-cols tb-lbl"><span>#</span><span>Driver</span><span>Round</span><span>Total</span></div>
      {rows.map((r) => (r.gap
        ? <div key={r.id} className="tb-cr is-gap" aria-hidden="true"><span>•••</span></div>
        : (
          <div key={r.id} className={`tb-cr${r.id === myId ? ' is-you' : ''}`}>
            <span className="pn tb-disp">{r.place}</span>
            <span className="nm"><ToyCar paint={paintOf(r)} /><span>{r.name}</span><NameBits p={r} myId={myId} /></span>
            <span className="plus tb-num">+{r.roundPts || 0}</span>
            <span className="tot tb-disp">{r.score}</span>
          </div>
        )))}
    </div>
  );
}

export default function Results() {
  const podium = useStore((s) => s.podium);
  const myId = useStore((s) => s.myId);
  const rivalry = useStore((s) => s.rivalry);
  const nemesis = useStore((s) => s.nemesis);
  const cup = useStore((s) => s.cup);
  const cupLog = useStore((s) => s.cupLog);
  const modeId = useStore((s) => s.modeId);
  const variant = useStore((s) => s.variant);
  const mapId = useStore((s) => s.mapId);
  const lastXp = useStore((s) => s.lastXp);
  const matchEndAt = useStore((s) => s.matchEndAt);
  const players = useStore((s) => s.players);
  const layout = useLayout();
  const timer = useRef(null);

  const final = !!cup?.final;
  const cupRound = !!cup && !final;
  const hold = (cupRound ? CUP_INTERMISSION_S : PODIUM_SECONDS) * 1000;
  const write = useCallback(() => {
    const left = Math.max(0, Math.ceil((matchEndAt + hold - Date.now()) / 1000));
    setSlots(timer.current, `${Math.floor(left / 60)}${String(left % 60).padStart(2, '0')}`);
  }, [matchEndAt, hold]);
  useHudWriter(matchEndAt ? write : null);

  // the shift report is read once, when the results arrive
  const shift = useMemo(() => matchStats.snapshot(), [podium]);
  const rows = final && cup?.standings ? cup.standings : (podium || []);
  const winner = rows[0];
  const confetti = useMemo(() => {
    const c = paintOf(winner);
    return Array.from({ length: 24 }, (_, i) => ({
      left: `${(i * 41 + 7) % 100}%`,
      '--c': i % 3 === 2 ? 'var(--paper)' : c,
      '--t': `${2.4 + ((i * 7) % 10) / 6}s`,
      '--d': `${((i * 13) % 20) / 10}s`,
      '--x': `${((i * 29) % 21) - 10}vw`,
    }));
  }, [winner?.id, final]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!podium) return null;
  const me = rows.find((p) => p.id === myId);
  const inPodium = podium.some((p) => p.id === myId);
  const top3 = [rows[0], rows[1], rows[2]];
  const unit = final ? 'cup pts' : 'pts';
  const modeName = MODES[modeId]?.name || 'Match';
  const v = variant && variant !== 'classic' ? variantOf(modeId, variant) : null;
  const floor = `${FLOOR_CODE[mapId] || ''} ${floorName(mapId)}`.trim();

  const head = final
    ? { title: 'Office Cup', meta: `Final standings · ${cup.total} rounds · ${floor}`, icon: 'trophy' }
    : cup
      ? { title: `Round ${cup.round} done`, meta: `Office Cup · round ${cup.round} of ${cup.total} · ${modeName}`, icon: 'trophy' }
      : { title: 'Match results', meta: [modeName, v?.name, floor].filter(Boolean).join(' · '), icon: null };

  const rest = !cup ? collapse(podium, myId, { head: 2, from: 3, max: 8 }) : [];
  const rival = rivalry && rivalry.n >= 2 ? rivalry : null;
  const rivalPaint = rival && paintOf(Object.values(players).find((p) => p.name === rival.name) || podium.find((p) => p.name === rival.name));
  const leave = () => { disconnect(); useStore.setState({ screen: 'menu', breakRoom: false }); };
  const compact = layout.compact;

  return (
    <div className={`tb-pd${compact ? ' is-compact' : ''}`}>
      <div className="tb-pd-grade" />
      <div className="tb-pd-burst" />
      <div className="tb-confetti" aria-hidden="true">
        {confetti.map((s, i) => <i key={i} style={s} />)}
      </div>

      <div className="tb-pd-head a-slide">
        <h2 className="tb-disp tb-ol tb-ex">{head.title}</h2>
        <span className="tb-rib is-ink">{head.icon && <ToyIcon name={head.icon} />}<span className="tb-lbl">{head.meta}</span></span>
      </div>

      {me && me.place <= 3 && (
        <div className="tb-pd-stamp a-punch" style={{ '--i': 3 }}>
          <div className="tb-stamp" role="img" aria-label={`You placed ${withOrdinal(me.place)}`}>
            <span className="tb-disp">{me.place}{ordinal(me.place)}!</span>
            <small>That's you</small>
          </div>
        </div>
      )}

      <div className="tb-podium">
        <Pod p={top3[1]} place={2} myId={myId} unit={unit} plaque={PLAQUE[1]} i={1} />
        <Pod p={top3[0]} place={1} myId={myId} unit={unit} plaque={final ? 'Employee of the month' : PLAQUE[0]} i={0} />
        <Pod p={top3[2]} place={3} myId={myId} unit={unit} plaque={PLAQUE[2]} i={2} />
      </div>

      {cup?.standings ? (
        <CupTable cup={cup} cupLog={cupLog} myId={myId} compact={compact} />
      ) : !compact && (
        <div className="tb-pd-side">
          {rest.length > 0 && (
            <div className="tb-rest tb-box a-slide-r" style={{ '--i': 2 }}>
              <div className="tb-rest-h"><span className="tb-lbl">The rest of the office</span></div>
              {rest.map((r) => (r.gap
                ? <div key={r.id} className="tb-cr is-gap" aria-hidden="true"><span>•••</span></div>
                : (
                  <div key={r.id} className={`tb-cr${r.id === myId ? ' is-you' : ''}`}>
                    <span className="pn tb-disp">{r.place}</span>
                    <span className="nm"><ToyCar paint={paintOf(r)} /><span>{r.name}</span><NameBits p={r} myId={myId} /></span>
                    <span className="tot tb-num">{r.score}</span>
                  </div>
                )))}
            </div>
          )}
          {inPodium && (
            <div className="tb-shift tb-box a-slide-r" style={{ '--i': 3 }}>
              <div className="tb-rest-h"><span className="tb-lbl">Your shift report</span></div>
              <div className="tb-shift-g">
                <div><span className="tb-micro">Top speed</span><b className="tb-disp">{shift.topSpeed}</b><span className="tb-micro">cm/s</span></div>
                <div><span className="tb-micro">Mini-turbos</span><b className="tb-disp">{shift.miniTurbos}</b><span className="tb-micro">{shift.tier3} pink</span></div>
                <div><span className="tb-micro">Items used</span><b className="tb-disp">{shift.used}</b><span className="tb-micro">of {shift.pickups} picked up</span></div>
              </div>
              {nemesis && <p className="tb-feud">Feud of the match: <b>{nemesis.a}</b> vs <b>{nemesis.b}</b> · {nemesis.n} bumps</p>}
            </div>
          )}
        </div>
      )}

      {lastXp && inPodium && (
        <Payslip
          lastXp={lastXp}
          title={final ? 'Office Cup final' : cup ? `cup round ${cup.round}` : 'this match'}
          bonusLabel={cup ? `Round ${cup.round} placement bonus` : 'Placement bonus'}
        />
      )}

      {rival && !compact && (
        <div className="tb-nem tb-rib is-hot a-slide-r" style={{ '--i': 3 }}>
          <span className="face"><ToyCar paint={rivalPaint} /></span>
          <span className="tb-nem-b">
            <span className="tb-micro">Your nemesis</span>
            <b>{rival.name}</b>
            <span className="tb-nem-c"><b className="tb-num">{rival.n}</b> bumps traded</span>
          </span>
        </div>
      )}

      <div className="tb-pd-foot a-rise" style={{ '--i': 4 }}>
        <span className="tb-rib is-ink tb-pd-timer" role="timer">
          <span className="tb-lbl">{cupRound ? 'Next round in' : 'Back to the lobby in'}</span>
          <span className="tb-disp"><Slots pattern="0:00" text="" slotsRef={timer} /></span>
        </span>
        <button type="button" className="tb-btn" onClick={leave}><ToyIcon name="door" />Leave for the garage</button>
      </div>
    </div>
  );
}
