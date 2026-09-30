// ------------------------------------------------------------- Break Room
// The pause menu (SPEC-TOYBOX §4.17). Esc, the pad's Back button or the
// touch pause button opens it. The match keeps running (it is online): the
// car coasts (useControls ignores input while it is open) and the scrim
// swallows clicks so no item is burned. Sound, display and driving prefs,
// the controls clipboard, back to work, or leave for the garage.
import { useCallback, useEffect, useRef, useState } from 'react';
import { PHASE } from '@rc/shared';
import { useStore } from '../../store.js';
import { disconnect } from '../../net.js';
import { audio } from '../../audio.js';
import { ToyIcon } from '../Icon.jsx';
import { ToyMixer } from '../SoundControls.jsx';
import { mmss } from './format.js';
import { useHudWriter, setText } from './hudLoop.js';
import { useLayout } from './useLayout.js';
import './breakroom.css';

// A labelled segmented toggle row: one tab stop per button, aria-pressed.
function SegRow({ id, label, sub, options, value, onPick }) {
  return (
    <div className="tb-bk-row">
      <span className="tb-lbl" id={id}>{label}{sub && <small>{sub}</small>}</span>
      <span className="tb-seg" role="group" aria-labelledby={id}>
        {options.map(([v, text]) => (
          <button type="button" className="tb-segb" key={String(v)} aria-pressed={value === v} onClick={() => { if (value !== v) { onPick(v); audio.blip(620, 0.05); } }}>
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}

const OFF_ON = [[false, 'Off'], [true, 'On']];

// What each control does, per device (useControls.js is the source).
const KEY_ROWS = [
  [['W', 'A', 'S', 'D'], 'Drive'],
  [['Shift'], 'Drift · sparks · mini-turbo'],
  [['Space'], 'Boost'],
  [['E'], 'Use item'],
  [['Q'], 'Car ability'],
  [['H', '1', '–', '8'], 'Horn · emotes'],
  [['Tab'], 'Standings'],
  [['R'], 'Back on the road'],
  [['P'], 'Photo mode'],
];
const PAD_ROWS = [
  [['L-stick'], 'Steer'],
  [['RT'], 'Gas'],
  [['LT'], 'Brake · reverse'],
  [['X', 'LB'], 'Drift · sparks · mini-turbo'],
  [['A', 'B'], 'Boost'],
  [['Y'], 'Use item'],
  [['RB'], 'Car ability'],
  [['Start'], 'Back on the road'],
  [['Back'], 'Break Room'],
];

function Clipboard() {
  const inputMode = useStore((s) => s.inputMode);
  const [tab, setTab] = useState(inputMode === 'pad' ? 'pad' : 'keys');
  const rows = tab === 'pad' ? PAD_ROWS : KEY_ROWS;
  return (
    <section className="tb-clip a-slide-r" aria-labelledby="tb-clip-t">
      <div className="tb-clip-clip" aria-hidden="true" />
      <div className="tb-clip-h">
        <span className="tb-disp" id="tb-clip-t">Controls</span>
        <span className="tb-seg" role="group" aria-label="Show controls for">
          <button type="button" className="tb-segb" aria-pressed={tab === 'keys'} onClick={() => setTab('keys')}><ToyIcon name="size" />Keys</button>
          <button type="button" className="tb-segb" aria-pressed={tab === 'pad'} onClick={() => setTab('pad')}><ToyIcon name="gamepad" />Pad</button>
        </span>
      </div>
      <ul className="tb-clip-l">
        {rows.map(([keys, what]) => (
          <li key={what}>
            <span className="keys">{keys.map((k, i) => (k === '–' ? <span key={i}>–</span> : <span key={i} className="tb-k">{k}</span>))}</span>
            <span>{what}</span>
          </li>
        ))}
      </ul>
      <p className="tb-clip-note">Ramps launch you. Land on your wheels.</p>
    </section>
  );
}

export default function BreakRoom() {
  const phase = useStore((s) => s.phase);
  const gfx = useStore((s) => s.gfx);
  const hudScale = useStore((s) => s.hudScale);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const transmitter = useStore((s) => s.transmitter);
  const autoGas = useStore((s) => s.autoGas);
  const setPref = useStore((s) => s.setPref);
  const layout = useLayout();
  const layer = useRef(null);
  const clock = useRef(null);
  const inMatch = phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN;

  const close = () => { useStore.setState({ breakRoom: false }); audio.blip(520, 0.05); };
  const leave = () => {
    useStore.setState({ breakRoom: false });
    disconnect();
    useStore.setState({ screen: 'menu' });
  };

  // the match clock in the header, from the hud loop (no React renders)
  const write = useCallback(() => {
    const { endsAt } = useStore.getState();
    setText(clock.current, endsAt ? mmss((endsAt - Date.now()) / 1000) : '');
  }, []);
  useHudWriter(inMatch ? write : null);

  // a focus trap: focus starts on "Back to work", Tab cycles inside, and
  // focus goes back where it was when the room closes
  useEffect(() => {
    const prev = document.activeElement;
    layer.current?.querySelector('.tb-bk-back')?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Tab' || !layer.current) return;
      const f = [...layer.current.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.getClientRects().length);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const inside = layer.current.contains(document.activeElement);
      if (!inside) { e.preventDefault(); first.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div ref={layer} className={`tb-pause-layer${layout.compact ? ' is-compact' : ''}`}>
      {/* the scrim swallows clicks: nothing underneath (the world, an item) is touched */}
      <div className="tb-bk-scrim" onPointerDown={(e) => e.preventDefault()} />
      <aside className="tb-bk tb-box a-slide" role="dialog" aria-modal="true" aria-labelledby="tb-bk-t">
        <div className="tb-bk-h">
          <span className="tb-micro">
            {inMatch ? <>The match keeps running · <span ref={clock} className="tb-num" /> left</>
              : phase === PHASE.PODIUM ? 'The results keep rolling' : 'The lobby keeps going'}
          </span>
          <span className="tb-disp tb-ol tb-ex" id="tb-bk-t">Break Room</span>
        </div>

        <div className="tb-bk-sect"><span className="tb-lbl"><ToyIcon name="speaker" />Sound</span></div>
        <ToyMixer />

        <div className="tb-bk-sect"><span className="tb-lbl"><ToyIcon name="sparkle" />Display</span></div>
        <SegRow id="tb-bk-gfx" label="Graphics" options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} value={gfx} onPick={(v) => setPref('gfx', v)} />
        <SegRow id="tb-bk-hud" label="HUD size" options={[[0.9, 'S'], [1, 'M'], [1.1, 'L']]} value={hudScale} onPick={(v) => setPref('hudScale', v)} />
        <SegRow id="tb-bk-rm" label="Reduce motion" options={OFF_ON} value={reduceMotion} onPick={(v) => setPref('reduceMotion', v)} />
        {!layout.touch && (
          <SegRow id="tb-bk-tx" label="Transmitter HUD" sub="the RC transmitter, lower left" options={OFF_ON} value={transmitter} onPick={(v) => setPref('transmitter', v)} />
        )}

        <div className="tb-bk-sect"><span className="tb-lbl"><ToyIcon name="steer" />Driving</span></div>
        <SegRow id="tb-bk-gas" label="Auto-gas" sub={layout.touch ? 'the car drives itself; brake to slow' : undefined} options={OFF_ON} value={autoGas} onPick={(v) => setPref('autoGas', v)} />

        <div className="tb-bk-f">
          <button type="button" className="tb-cta tb-bk-back" onClick={close} aria-keyshortcuts="Escape">
            <span className="tb-disp">Back to work</span>
            {!layout.touch && <span className="tb-k" aria-hidden="true">Esc</span>}
          </button>
          <button type="button" className="tb-btn tb-bk-leave" onClick={leave}>
            <ToyIcon name="door" />Leave for the garage<small>{inMatch ? 'forfeits this match' : 'leaves the room'}</small>
          </button>
        </div>
      </aside>
      {!layout.compact && <Clipboard />}
    </div>
  );
}
