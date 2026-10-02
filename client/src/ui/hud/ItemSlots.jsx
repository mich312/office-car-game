// ------------------------------------------------------ item + ability
// The bottom-right action tray: the car's special (Q) and the held item (E).
import { POWERUPS, ABILITIES, ABILITY_COOLDOWN_S } from '@rc/shared';
import Icon from '../Icon.jsx';
import './itemslots.css';

export default function ItemSlots({ carId, readyAt, powerup }) {
  return (
    <div className="action-tray">
      <AbilitySlot carId={carId} readyAt={readyAt} />
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
  );
}

// ---------------------------------------------------------- ability slot
// Per-car special (Q / touch star) with a radial cooldown wipe driven by the
// server-stamped readyAt.
export function AbilitySlot({ carId, readyAt }) {
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
