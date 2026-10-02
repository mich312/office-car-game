// ------------------------------------------------------------ top cluster
// The top-centre column (SPEC-TOYBOX §4.4–4.7), centred by layout, one item
// under the other:
//   1. the clock: a paper sticker, digits in fixed slots written by the hud
//      loop (cherry under 30 s); the round's twists hang off it (variant hot
//      on the left, mutator grape on the right); on touch a pause button
//   2. the objective banner: what this mode wants from you right now. It is
//      never hidden: office events stack under it
//   3. one slot: hazard toast > closing room > office telegraph > running
//      event > coach memo (nothing while the Tab standings are up)
//   4. the spectator banner, when you're out
import { memo, useCallback, useRef } from 'react';
import { MODES, MUTATORS, LCS, PERCH_HOLD_S, variantOf } from '@rc/shared';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';
import { CoachMemo } from '../Coach.jsx';
import { ToyIcon, MUTATOR_TOY } from '../Icon.jsx';
import { useHudWriter, setSlots, setClass } from './hudLoop.js';
import { Slots, paintOf, paintVars } from './format.js';
import { Telegraph, OfficeTelegraph, RunningEvent, HazardToast } from './EventTelegraph.jsx';
import SpectatorBanner from './SpectatorBanner.jsx';
import './topcluster.css';

export default function TopCluster({ map, spectating, perchWarn, finale, hazard, standingsOpen, compact }) {
  const endsAt = useStore((s) => s.endsAt);
  const modeId = useStore((s) => s.modeId);
  const variantId = useStore((s) => s.variant);
  const mutator = useStore((s) => s.mutator);
  const eventWarn = useStore((s) => s.eventWarn);
  const event = useStore((s) => s.event);
  const lcs = useStore((s) => s.lcs);
  const variant = variantOf(modeId, variantId);

  // one thing at a time under the objective
  let slot = null;
  if (!standingsOpen) {
    const closing = modeId === 'last_standing' && lcs?.warn ? map.ROOMS.find((r) => r.id === lcs.warn.room) : null;
    if (hazard) slot = <HazardToast key={`haz-${hazard}`} outsideRing={hazard === 'ring'} />;
    else if (closing) {
      slot = (
        <Telegraph key={`lcs-${closing.id}`} icon="lock" kicker="Facilities · lockdown" title={`${closing.name} closes in`}
          until={lcs.warn.until} total={LCS.WARN_S * 1000} />
      );
    } else if (eventWarn) slot = <OfficeTelegraph key={`warn-${eventWarn.id}`} warn={eventWarn} map={map} />;
    else if (event) slot = <RunningEvent key={`evt-${event.id}`} event={event} />;
    else if (!compact) slot = <CoachMemo />;
  }

  return (
    <>
      <ClockRow endsAt={endsAt} variant={variant && variant.id !== 'classic' ? variant.name : null} mutator={mutator} />
      <ObjectiveBanner map={map} modeId={modeId} spectating={spectating} perchWarn={perchWarn} finale={finale} />
      {slot}
      {spectating && <SpectatorBanner />}
    </>
  );
}

// ----------------------------------------------------------------- clock
const ClockRow = memo(function ClockRow({ endsAt, variant, mutator }) {
  const clock = useRef();
  const digits = useRef([]);
  const write = useCallback(() => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setSlots(digits.current, `${Math.floor(left / 60)}${String(left % 60).padStart(2, '0')}`);
    setClass(clock.current, 'is-low', left > 0 && left <= 30);
  }, [endsAt]);
  useHudWriter(write);
  const left0 = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mu = mutator ? MUTATORS[mutator] : null;
  return (
    <div className="tb-clockrow a-drop">
      {variant && (
        <span className="tb-hang is-l"><span className="tb-rib is-hot"><span className="tb-lbl">{variant}</span></span></span>
      )}
      <div ref={clock} className={`tb-clock${left0 > 0 && left0 <= 30 ? ' is-low' : ''}`} role="timer" aria-label="Time left">
        <span className="tb-clock-ic"><ToyIcon name="clock" /></span>
        <span className="tb-clock-t tb-disp">
          <Slots pattern={left0 >= 600 ? '00:00' : '0:00'} slotsRef={digits}
            text={`${Math.floor(left0 / 60)}${String(left0 % 60).padStart(2, '0')}`} />
        </span>
      </div>
      {mu && (
        <span className="tb-hang is-r" title={`${mu.name} — ${mu.desc}`}>
          <span className="tb-rib is-grape"><ToyIcon name={MUTATOR_TOY[mutator] || 'sparkle'} /><span className="tb-lbl">{mu.name}</span></span>
        </span>
      )}
      <button type="button" className="tb-pause-btn" aria-label="Break Room (pause menu)"
        onClick={() => useStore.setState({ breakRoom: true })}>
        <ToyIcon name="pause" />
      </button>
    </div>
  );
});

// ------------------------------------------------------ objective banner
// → { key, cls, icon, color, text, sub } for this mode right now (null: none)
function objective({ map, modeId, spectating, perchWarn, finale, st }) {
  const me = st.myId;
  const hot = (text) => ({ cls: 'is-hazard', icon: 'warning', color: 'var(--paper)', text });
  if (perchWarn) {
    return { key: 'perch', ...hot(`Up on the furniture — ${modeId === 'tag' ? 'It passes on' : 'the battery slides off'}`) };
  }
  switch (modeId) {
    case 'coffee_run': {
      const max = MODES.coffee_run.maxCarry;
      const cm = map.COFFEE_MACHINE;
      const room = cm ? map.roomAt(cm.deliverX, cm.deliverZ)?.name : null;
      const sub = `${room ? `Deliver to the ${room}` : 'Deliver to the coffee machine'} · bumps spill beans`;
      if (!st.myBeans) return { key: 'beans0', icon: 'bean', text: 'Collect beans', sub };
      return {
        key: 'beans', icon: 'bean', sub,
        text: (
          <>
            Beans
            <span className="tb-beans" aria-hidden="true">
              {Array.from({ length: max }, (_, i) => <ToyIcon key={i} name="bean" className={i < st.myBeans ? '' : 'is-off'} />)}
            </span>
            <span className="tb-obj-n">{st.myBeans}/{max}</span>
          </>
        ),
        label: `Carrying ${st.myBeans} of ${max} beans`,
      };
    }
    case 'soccer': {
      const blue = st.players[me]?.team ? 1 : 0;
      return {
        key: 'soccer', icon: 'ball',
        text: (
          <>
            <span className="tb-sw is-orange" aria-hidden="true" />Orange {st.teamScores[0]} — {st.teamScores[1]} Blue<span className="tb-sw is-blue" aria-hidden="true" />
          </>
        ),
        label: `Orange ${st.teamScores[0]}, Blue ${st.teamScores[1]}`,
        sub: spectating || !st.players[me] ? '' : `You: ${blue ? 'blue' : 'orange'} → attack the ${blue ? 'orange' : 'blue'} goal`,
      };
    }
    case 'battery': {
      if ((net.flags.get(me) || 0) & 32) return { key: 'bat-you', cls: 'is-you', icon: 'battery', color: 'var(--paper)', text: 'You have the battery!', sub: 'Get bumped and you drop it' };
      const holder = Object.keys(st.players).find((id) => id !== me && (net.flags.get(id) || 0) & 32);
      if (holder) {
        const p = st.players[holder];
        return {
          key: 'bat-them', icon: 'battery', color: paintOf(p),
          text: <><span className="tb-name" style={paintVars(paintOf(p))}>{p.name}</span> has it — bump them!</>,
          label: `${p.name} has the battery`,
        };
      }
      return { key: 'bat', icon: 'battery', text: 'Hold the battery to score' };
    }
    case 'koth': {
      const z = net.zone;
      if (!z) return { key: 'koth', icon: 'pin', text: 'Hold the standup to score' };
      const hopIn = z.until ? Math.max(0, Math.ceil((z.until - net.clockOffset - performance.now()) / 1000)) : null;
      const inZone = !spectating && Math.hypot(telemetry.x - z.x, telemetry.z - z.z) <= z.r
        && Math.abs(telemetry.y) < 4 && !fullWallBetween(map, z.x, z.z, telemetry.x, telemetry.z);
      const n = z.n || 0;
      const rate = MODES.koth.scorePerSecond / Math.max(1, n);
      const room = map.roomAt(z.x, z.z)?.name;
      const sub = hopIn != null ? `moves in ${hopIn}s` : '';
      if (inZone && n > 1) return { key: 'koth-c', cls: 'is-hazard', icon: 'warning', color: 'var(--paper)', text: `Contested ×${n} · +${rate.toFixed(1)}/s`, sub };
      if (inZone) return { key: 'koth-in', cls: 'is-you', icon: 'pin', color: 'var(--paper)', text: `In the standup · +${rate}/s`, sub };
      return { key: 'koth', icon: 'pin', text: `Standup${room ? ` in the ${room}` : ''}`, sub };
    }
    case 'tag': {
      if (st.itId && st.itId === me) {
        return { key: 'it-you', cls: 'is-you', icon: 'crown', color: 'var(--paper)', text: "You're It — keep scoring!", sub: `Stay off the furniture — up there, It passes on in ${PERCH_HOLD_S} s` };
      }
      const it = st.itId ? st.players[st.itId] : null;
      if (!it) return { key: 'it-none', icon: 'target', text: 'Bump whoever is It' };
      return {
        key: 'it', icon: 'target', color: paintOf(it),
        text: <><span className="tb-name" style={paintVars(paintOf(it))}>{it.name}</span> is It — bump them!</>,
        label: `${it.name} is It`,
      };
    }
    case 'sumo': {
      const round = st.sumoRound || 1;
      if (st.sumoRest) return { key: 'sumo-rest', icon: 'flag', text: `Round ${st.sumoRound} over — next in ${st.sumoRest}s` };
      if (st.sumoDead) return { key: 'sumo-out', icon: 'skull', color: 'var(--paper-3)', text: 'Out — next round soon' };
      if (st.sumoOutLeft != null) return { key: 'sumo-back', ...hot(`Get back in! ${st.sumoOutLeft.toFixed(1)}s`) };
      return { key: 'sumo', icon: 'sumo', text: `Round ${round} — stay inside the ring` };
    }
    case 'last_standing':
      return {
        key: 'lcs', icon: 'crown', text: `${st.lcs?.alive ?? '…'} car${st.lcs?.alive === 1 ? '' : 's'} left`,
        sub: finale ? 'The last meeting — stay in the ring' : 'Facilities is locking the floor down room by room',
      };
    case 'free_roam':
      return { key: 'roam', icon: 'sparkle', text: `Style ${Math.round(st.scores[me] || 0).toLocaleString('en-US')} · drift, fly, smash` };
    default:
      return null; // Desk Dash: the lap ribbon carries it
  }
}

function ObjectiveBanner(props) {
  // (the store fields it reads are subscribed by the match HUD's 10 Hz render)
  const st = useStore.getState();
  const o = objective({ ...props, st });
  if (!o) return null;
  return (
    <div key={o.key} className={`tb-obj a-pop${o.cls ? ` ${o.cls}` : ''}`} style={{ '--obj-c': o.color || 'var(--lime)', '--i': 1 }}
      aria-label={o.label}>
      <span className="tb-obj-ic"><ToyIcon name={o.icon} /></span>
      <span className="tb-obj-stack">
        <span className="tb-obj-t tb-disp">{o.text}</span>
        {o.sub && <span className="tb-obj-sub">{o.sub}</span>}
      </span>
    </div>
  );
}

// The server's standup test (modes.js KothMode.inZone) counts nobody behind
// a full-height wall — the ring is a circle, the meeting is a room. Without
// it the banner said "IN THE STANDUP · +3/s" to a car scoring nothing next door.
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
