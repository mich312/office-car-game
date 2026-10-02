// ---------------------------------------------------------- drive cluster
// Bottom-left (SPEC-TOYBOX §4.9): speed in cm/s, the three numbered drift
// tiers (1 sky · 2 blaze · 3 bubble, the game's own spark colours) with the
// charge toward the next one, and the boost bar. Every value here changes
// every frame, so none of it goes through React: one hud-loop writer reads
// telemetry and writes the digit slots, custom properties and classes on
// refs, touching the DOM only when a value changed. It replaces the RC
// transmitter (ControllerHUD), which is now an opt-in in the Break Room.
import { memo, useCallback, useRef } from 'react';
import { BOOST_MAX, CAR_UNIT_M } from '@rc/shared';
import { telemetry } from '../../game/LocalCar.jsx';
import { useHudWriter, setSlots, setVar, setClass, setText } from './hudLoop.js';
import { Slots } from './format.js';
import './drivecluster.css';

const TIERS = [1, 2, 3];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const CHEVRON = 'M3 3H33L45 16L33 29H3L12 16Z';
// keycaps per input device (the touch pad carries its own labels)
const CAPS = { keys: { drift: 'Shift', boost: 'Space' }, pad: { drift: 'X', boost: 'A' } };

export default memo(function DriveCluster({ inputMode }) {
  const speed = useRef([]);
  const drift = useRef();
  const chevs = useRef([]);
  const segs = useRef([]);
  const boost = useRef();
  const fill = useRef();
  const label = useRef();
  const last = useRef({ tier: -1 });

  const write = useCallback(() => {
    const t = telemetry;
    const cms = Math.min(999, Math.round(Math.abs(t.speed || 0) * CAR_UNIT_M * 100));
    setSlots(speed.current, String(cms));
    const tier = Math.max(0, Math.min(3, t.driftTier ?? 0));
    const charge = clamp01(t.driftCharge ?? 0);
    chevs.current.forEach((el, i) => setClass(el, 'is-on', i < tier));
    segs.current.forEach((el, i) => setVar(el, '--f', clamp01(charge * 3 - i)));
    if (tier !== last.current.tier && drift.current) {
      last.current.tier = tier;
      drift.current.setAttribute('aria-label', tier ? `Drift tier ${tier}` : 'Drift');
    }
    const v = clamp01((t.boost ?? 0) / BOOST_MAX);
    setVar(fill.current, '--v', v);
    setClass(boost.current, 'is-boosting', !!t.boosting);
    const full = v >= 0.995;
    setText(label.current, full ? 'Boost full' : 'Boost');
  }, []);
  useHudWriter(write);

  const caps = CAPS[inputMode] || CAPS.keys;
  return (
    <div className="tb-drive a-slide">
      <div className="tb-spdrow">
        <div className="tb-spd" role="img" aria-label="Speed in centimetres per second">
          <span className="tb-spd-n tb-disp tb-live"><Slots pattern="000" text="0" slotsRef={speed} /></span>
          <span className="tb-spd-u tb-disp tb-live-s">cm/s</span>
        </div>
        <div className="tb-drift" ref={drift} role="img" aria-label="Drift">
          <div className="tb-chevs">
            {TIERS.map((k, i) => (
              <span key={k} className="tb-chev" style={{ '--c': `var(--drift-${k})` }} ref={(el) => { chevs.current[i] = el; }}>
                <svg viewBox="0 0 48 32" aria-hidden="true"><path d={CHEVRON} /></svg>
                <b>{k}</b>
              </span>
            ))}
          </div>
          <div className="tb-dcharge" aria-hidden="true">
            {TIERS.map((k, i) => <i key={k} style={{ '--c': `var(--drift-${k})` }} ref={(el) => { segs.current[i] = el; }} />)}
          </div>
          <div className="tb-drift-l"><span className="tb-lbl">Drift</span><span className="tb-k">{caps.drift}</span></div>
        </div>
      </div>
      <div className="tb-boost" ref={boost}>
        <div className="tb-boost-track" aria-hidden="true"><div className="tb-boost-fill" ref={fill} /></div>
        <div className="tb-boost-l"><span className="tb-lbl" ref={label}>Boost</span><span className="tb-k">{caps.boost}</span></div>
      </div>
    </div>
  );
});
