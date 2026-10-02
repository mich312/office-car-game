// ------------------------------------------------------ item + ability
// Bottom-right (SPEC-TOYBOX §4.10): the car's special (Q) as a sky cooldown
// ring, then the held item (E) as a grape toy box with its glyph as a
// sticker. The ring's sweep and seconds are written by the hud loop; React
// only re-renders on the slow changes (item picked up / fired, ready).
//   pickup: the box is re-keyed and pops · fire: a short press dip
//   ready: solid sky ring + core, "<name> · ready", one punch, no glow loop
import { memo, useCallback, useEffect, useRef } from 'react';
import { POWERUPS, ABILITIES, ABILITY_COOLDOWN_S } from '@rc/shared';
import { ActionSticker } from '../Icon.jsx';
import { useHudWriter, setSlots, setVar } from './hudLoop.js';
import { Slots } from './format.js';
import './itemslots.css';

const CAPS = { keys: { item: 'E', ability: 'Q' }, pad: { item: 'Y', ability: 'RB' } };
const COOL_MS = ABILITY_COOLDOWN_S * 1000;
const leftMs = (readyAt) => Math.max(0, readyAt - Date.now());

// (memo: the match HUD re-renders at 10 Hz; this only on a slow change)
export default memo(function ItemSlots({ carId, readyAt, abilityReady, powerup, inputMode }) {
  const caps = CAPS[inputMode] || CAPS.keys;
  return (
    <div className="tb-kit">
      <AbilitySlot carId={carId} readyAt={readyAt} ready={abilityReady} cap={caps.ability} />
      <ItemSlot powerup={powerup} cap={caps.item} />
    </div>
  );
});

function ItemSlot({ powerup, cap }) {
  const item = powerup ? POWERUPS[powerup] : null;
  // an item just went: the empty box dips once (the fire press)
  const prev = useRef(powerup);
  const fired = !powerup && !!prev.current;
  useEffect(() => { prev.current = powerup; }, [powerup]);
  return (
    <div className={`tb-slot${item ? '' : ' is-empty'}`}>
      <div key={powerup || 'empty'} className={`tb-itembox${item ? ' a-pop' : fired ? ' is-fired' : ''}`}
        role="img" aria-label={item ? `Item: ${item.name}` : 'No item'} title={item?.desc ? `${item.name} — ${item.desc}` : undefined}>
        <div className="tb-itemwell">
          {item ? <ActionSticker id={powerup} /> : <span className="tb-q tb-disp" aria-hidden="true">?</span>}
        </div>
        <span className="tb-k">{cap}</span>
      </div>
      <span className="tb-rib is-ink"><span className="tb-disp">{item ? item.name : 'No item'}</span></span>
    </div>
  );
}

// the ring's sweep (--p) and the seconds left, written by the hud loop
function AbilitySlot({ carId, readyAt, ready, cap }) {
  const ab = ABILITIES[carId] || ABILITIES.balanced;
  const ring = useRef();
  const secs = useRef([]);
  const write = useCallback(() => {
    const left = leftMs(readyAt);
    setVar(ring.current, '--p', 1 - Math.min(1, left / COOL_MS));
    setSlots(secs.current, left > 0 ? String(Math.ceil(left / 1000)) : '');
  }, [readyAt]);
  useHudWriter(ready ? null : write);
  // the first paint, before the loop's first write
  const left0 = leftMs(readyAt);
  return (
    <div className="tb-slot is-ab">
      {/* re-keyed when it becomes ready: it punches once */}
      <div key={ready ? 'ready' : 'cool'} ref={ring} className={`tb-ability${ready ? ' is-ready a-punch' : ''}`}
        style={ready ? undefined : { '--p': 1 - Math.min(1, left0 / COOL_MS) }}
        role="img" aria-label={ready ? `${ab.name} ready` : `${ab.name} cooling down`} title={`${ab.name} — ${ab.desc}`}>
        <div className="tb-ability-core">
          <ActionSticker id={ab.id} color="var(--ink)" />
          {!ready && (
            <span className="tb-ability-secs tb-disp tb-live-s" aria-hidden="true">
              <Slots pattern="00" text={String(Math.ceil(left0 / 1000))} slotsRef={secs} />
            </span>
          )}
        </div>
        <span className="tb-k">{cap}</span>
      </div>
      <span className="tb-rib is-ink"><span className="tb-lbl">{ready ? `${ab.name} · ready` : ab.name}</span></span>
    </div>
  );
}
