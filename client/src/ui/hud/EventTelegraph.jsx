// --------------------------------------------------------- office events
// The hazard layer of the top-centre column (SPEC-TOYBOX §4.6), under the
// objective (never instead of it). A red barricade with paper stripes:
//   Telegraph     "ALL-STAFF ALERT · PRINTER NOOK / PRINTER PAPER STORM IN 3"
//                 with a draining fuse (office event warnings, and Last Car
//                 Standing's closing room)
//   RunningEvent  the live event, compact, with its time left draining
//   HazardToast   you are in a locked room / outside the finale's ring
// The number and the fuse are written by the hud loop (they are information,
// so they keep ticking under reduced motion). TopCluster picks one of these
// for the slot: hazard toast > closing room > telegraph > running event >
// coach memo, and nothing while the Tab standings are up.
import { useCallback, useRef } from 'react';
import { EVENT_TOY, ToyIcon } from '../Icon.jsx';
import { useHudWriter, setText, setVar } from './hudLoop.js';
import { eventRoom } from './Minimap.jsx';
import './telegraph.css';

// HUD.jsx mounts <EventTelegraph /> at the root; the telegraph now lives in
// the match HUD's top-centre column (TopCluster), so the root mount is empty.
export default function EventTelegraph() {
  return null;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// When a warning goes off. The server says "starts in 3 s"; the moment it
// arrived is when this client first saw it (net.js may stamp .until itself).
const warnUntil = new WeakMap();
export function eventWarnUntil(w) {
  if (!w) return 0;
  if (w.until) return w.until;
  let u = warnUntil.get(w);
  if (!u) { u = Date.now() + (w.startsIn || 3) * 1000; warnUntil.set(w, u); }
  return u;
}

// the running event's effect in three words (the name can be the floor's
// own, "Market Crash"; this says what it does to your driving)
const EVENT_TAG = {
  lights_out: 'headlights on', earthquake: 'everything wobbles', paper_storm: 'paper everywhere',
  ac_wind: 'hold your line', server_overload: 'keep clear', cleaning_robot: "don't get eaten", sprinklers: 'floors soaked',
};

function useCountdown(until, total) {
  const num = useRef();
  const fuse = useRef();
  const write = useCallback(() => {
    const left = until - Date.now();
    setText(num.current, String(Math.max(0, Math.ceil(left / 1000))));
    setVar(fuse.current, '--fuse', clamp01(left / total));
  }, [until, total]);
  useHudWriter(write);
  const left0 = until - Date.now();
  return { num, fuse, n0: Math.max(0, Math.ceil(left0 / 1000)), f0: clamp01(left0 / total) };
}

// the full barricade with a number and a fuse
export function Telegraph({ icon, kicker, title, until, total }) {
  const { num, fuse, n0, f0 } = useCountdown(until, total);
  return (
    <div className="tb-tele a-tele" role="alert">
      <span className="tb-tele-ic"><ToyIcon name={icon} /></span>
      <span className="tb-tele-b">
        <span className="tb-tele-k">{kicker}</span>
        <span className="tb-tele-t tb-disp tb-ol">{title}</span>
      </span>
      <span className="tb-tele-n tb-disp" ref={num}>{n0}</span>
      <span className="tb-fuse" aria-hidden="true"><i ref={fuse} style={{ '--fuse': f0 }} /></span>
    </div>
  );
}

// an office event about to start
export function OfficeTelegraph({ warn, map }) {
  const room = eventRoom(map, warn.id);
  return (
    <Telegraph key={warn.id} icon={EVENT_TOY[warn.id] || 'warning'} kicker={`All-staff alert · ${room ? room.name : 'Facilities'}`}
      title={`${warn.name} in`} until={eventWarnUntil(warn)} total={(warn.startsIn || 3) * 1000} />
  );
}

// the event that's on: compact barricade, seconds left, a drain bar
export function RunningEvent({ event }) {
  const total = Math.max(1, (event.duration || 10) * 1000);
  const { num, fuse, n0, f0 } = useCountdown(event.until || Date.now(), total);
  const tag = EVENT_TAG[event.id];
  return (
    <div className="tb-tele tb-evt a-pop" role="status">
      <span className="tb-tele-ic"><ToyIcon name={EVENT_TOY[event.id] || 'warning'} /></span>
      <span className="tb-tele-b"><span className="tb-tele-t tb-disp tb-ol">{event.name}{tag ? ` · ${tag}` : ''}</span></span>
      <span className="tb-tele-n tb-disp"><span ref={num}>{n0}</span>s</span>
      <span className="tb-fuse" aria-hidden="true"><i ref={fuse} style={{ '--fuse': f0 }} /></span>
    </div>
  );
}

// persistent while true: no number, no fuse, just get out
export function HazardToast({ outsideRing }) {
  return (
    <div className="tb-tele tb-haz a-tele" role="alert">
      <span className="tb-tele-ic"><ToyIcon name={outsideRing ? 'warning' : 'lock'} /></span>
      <span className="tb-tele-b">
        <span className="tb-tele-k">Facilities · lockdown</span>
        <span className="tb-tele-t tb-disp tb-ol">{outsideRing ? 'Outside the ring — get in!' : 'Room closed — get out!'}</span>
      </span>
    </div>
  );
}
