// ------------------------------------------------- touch controls (phones)
// A horizontal steer stick under the left thumb and a pad of toy buttons
// under the right (SPEC-TOYBOX §4.16). Shown only when the HUD root is
// .is-touch (hud/useLayout.js). The match mounts it with everything; the
// lobby mounts <TouchControls lobby /> (drive around while you wait: no
// item, no ability, no speed readout). Every target is ≥ 44 px.
//
// Buttons write into the shared touchInput channel that useControls merges
// into the car's input; fast readouts (speed, boost ring, drift tiers, the
// ability cooldown) are written by the hud loop, never through React.
import { useCallback, useEffect, useRef } from 'react';
import { MSG, POWERUPS, ABILITIES, ABILITY_COOLDOWN_S, BOOST_MAX, CAR_UNIT_M } from '@rc/shared';
import { useStore } from '../../store.js';
import { send } from '../../net.js';
import { touchInput } from '../../game/useControls.js';
import { telemetry } from '../../game/LocalCar.jsx';
import { audio } from '../../audio.js';
import { ToyIcon, ActionSticker, ITEM_COLOR } from '../Icon.jsx';
import { Slots, setSlots } from './format.js';
import { useHudWriter, setVar, setClass, setText } from './hudLoop.js';
import './touch.css';

const release = () => {
  touchInput.steer = 0;
  touchInput.throttle = 0;
  touchInput.brake = 0;
  touchInput.drift = false;
  touchInput.boost = false;
};

// Hold-to-act: the finger is captured on press, so sliding off the button
// still releases it (a lost pointer can never leave the car braking).
const hold = (fn) => ({
  onPointerDown: (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    audio.start();
    e.currentTarget.classList.add('is-pressed');
    fn(true);
  },
  onPointerUp: (e) => { e.currentTarget.classList.remove('is-pressed'); fn(false); },
  onPointerCancel: (e) => { e.currentTarget.classList.remove('is-pressed'); fn(false); },
  onLostPointerCapture: (e) => { e.currentTarget.classList.remove('is-pressed'); fn(false); },
  onContextMenu: (e) => e.preventDefault(),
});
// Tap-to-fire: acts on touch-down (a tap is a tap, even mid-slide).
const tap = (fn) => ({
  onPointerDown: (e) => {
    e.preventDefault();
    audio.start();
    const el = e.currentTarget;
    el.classList.remove('a-press');
    void el.offsetWidth; // restart the dip on a quick double tap
    el.classList.add('a-press');
    fn();
  },
  onContextMenu: (e) => e.preventDefault(),
});

// Horizontal steer only: the knob follows the finger on X (a tiny car wants
// steering, not a 2D stick). −1 = left, the pad axes' convention.
function Stick() {
  const ref = useRef(null);
  const move = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const max = r.width / 2 - 29;
    let x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / max));
    if (Math.abs(x) < 0.08) x = 0;
    touchInput.steer = x;
    el.style.setProperty('--kx', `${Math.round(x * max)}px`);
    el.setAttribute('aria-valuenow', x.toFixed(2));
  };
  const end = () => {
    touchInput.steer = 0;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-held');
    el.style.setProperty('--kx', '0px');
    el.setAttribute('aria-valuenow', '0');
  };
  return (
    <div
      ref={ref}
      className="tb-stick"
      role="slider"
      aria-label="Steer"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
      onPointerDown={(e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        audio.start();
        e.currentTarget.classList.add('is-held');
        move(e);
      }}
      onPointerMove={(e) => { if (e.currentTarget.classList.contains('is-held')) move(e); }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="tb-knob"><ToyIcon name="steer" /></span>
    </div>
  );
}

export default function TouchControls({ lobby = false }) {
  const breakRoom = useStore((s) => s.breakRoom);
  const autoGas = useStore((s) => s.autoGas);
  const powerup = useStore((s) => s.powerup);
  const carId = useStore((s) => s.players[s.myId]?.car || s.car);
  const ab = ABILITIES[carId] || ABILITIES.balanced;

  const spd = useRef(null);
  const boostEl = useRef(null);
  const tiersEl = useRef(null);
  const abEl = useRef(null);
  const secsEl = useRef(null);

  // let go of everything when the pad goes away (Break Room, phase change)
  useEffect(() => release, []);
  useEffect(() => { if (breakRoom) release(); }, [breakRoom]);

  const write = useCallback(() => {
    if (spd.current) setSlots(spd.current, String(Math.min(999, Math.round(Math.abs(telemetry.speed || 0) * CAR_UNIT_M * 100))));
    setVar(boostEl.current, '--v', Math.max(0, Math.min(1, (telemetry.boost ?? 0) / BOOST_MAX)));
    setClass(boostEl.current, 'is-boosting', !!telemetry.boosting);
    const tier = telemetry.driftTier ?? 0;
    const pips = tiersEl.current?.children;
    if (pips) for (let k = 0; k < pips.length; k++) setClass(pips[k], 'is-on', k < tier);
    if (abEl.current) {
      const left = Math.max(0, (useStore.getState().abilityReadyAt || 0) - Date.now());
      const ready = left <= 0;
      setVar(abEl.current, '--p', ready ? 1 : 1 - Math.min(1, left / (ABILITY_COOLDOWN_S * 1000)));
      setClass(abEl.current, 'is-ready', ready);
      setText(secsEl.current, ready ? '' : String(Math.ceil(left / 1000)));
    }
  }, []);
  useHudWriter(breakRoom ? null : write);

  if (breakRoom) return null;
  const item = powerup ? POWERUPS[powerup] : null;

  return (
    <div className={`tb-touch${lobby ? ' is-lobby' : ''}`}>
      {!lobby && (
        <div className="tb-tspd" aria-hidden="true">
          <span className="tb-spd-n tb-disp tb-live"><Slots pattern="000" text="0" slotsRef={spd} /></span>
          <span className="tb-spd-u tb-disp tb-live-s">cm/s</span>
        </div>
      )}
      <Stick />
      <div className="tb-pad">
        <button className="tb-tbtn t-horn" aria-label="Horn" {...tap(() => { send({ t: MSG.EMOTE, h: 1 }); audio.horn(); })}>
          <ToyIcon name="horn" />
        </button>
        {!lobby && (
          <button ref={abEl} className="tb-tbtn t-ab" style={{ '--p': 1 }} aria-label={`Ability: ${ab.name}`} title={`${ab.name} — ${ab.desc}`}
            {...tap(() => send({ t: MSG.ABILITY }))}>
            <span className="core"><ActionSticker id={ab.id} color="var(--t-ab-glyph)" /></span>
            <span ref={secsEl} className="secs tb-disp tb-live-s" aria-hidden="true" />
            <span className="tl">Ability</span>
          </button>
        )}
        {!lobby && (
          <button key={powerup || 'none'} className={`tb-tbtn t-item${item ? '' : ' is-empty'} a-pop`}
            aria-label={item ? `Use item: ${item.name}` : 'No item'} {...tap(() => send({ t: MSG.USE_POWERUP }))}>
            <span className="well">
              {item ? <ActionSticker id={powerup} color={ITEM_COLOR[powerup]} /> : <span className="tb-q tb-disp">?</span>}
            </span>
          </button>
        )}
        <button className="tb-tbtn t-drift" aria-label="Drift" {...hold((d) => { touchInput.drift = d; })}>
          <span ref={tiersEl} className="t-tiers" aria-hidden="true">
            <i style={{ '--c': 'var(--drift-1)' }}>1</i><i style={{ '--c': 'var(--drift-2)' }}>2</i><i style={{ '--c': 'var(--drift-3)' }}>3</i>
          </span>
          <ToyIcon name="drift" />
          <span className="tl">Drift</span>
        </button>
        <button ref={boostEl} className="tb-tbtn t-boost" style={{ '--v': 1 }} aria-label="Boost" {...hold((d) => { touchInput.boost = d; })}>
          <span className="core"><ToyIcon name="flame" /></span>
          <span className="tl">Boost</span>
        </button>
        <button className="tb-tbtn tb-pedal t-brake" aria-label="Brake" {...hold((d) => { touchInput.brake = d ? 1 : 0; })}>
          <ToyIcon name="brake" />Brake
        </button>
        <button className="tb-tbtn tb-pedal t-gas" aria-label={autoGas ? 'Gas (auto-gas on)' : 'Gas'} {...hold((d) => { touchInput.throttle = d ? 1 : 0; })}>
          {autoGas && <span className="t-auto" aria-hidden="true">Auto</span>}
          <ToyIcon name="up" />Gas
        </button>
      </div>
    </div>
  );
}
