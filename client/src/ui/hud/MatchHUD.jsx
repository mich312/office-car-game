// -------------------------------------------------------------- match hud
// Everything on screen while a round is on (SPEC-TOYBOX §4.1–4.13), in five
// corners that scale with the Break Room's HUD size and keep the car zone
// (the centre 40 % × lower 45 %) clear:
//   top-left      your place + lap / score ribbon, the feed
//   top-centre    clock + twists, objective, one event / hazard / memo slot
//   top-right     minimap + the room you're in
//   bottom-left   speed, drift tiers, boost      (hidden on touch: the pad)
//   bottom-right  ability + item                 (hidden on touch: the pad)
// The opt-in RC transmitter (Break Room, desktop) carries speed / boost /
// Q / E itself, so while it is up the bottom corners step aside.
// This re-renders at 10 Hz for the slow state; the fast readouts (speed,
// boost, drift charge, clock, cooldowns, fuses) are written by the hud loop.
import { useEffect, useState } from 'react';
import { PHASE, perched } from '@rc/shared';
import { useMap } from '../../game/activeMap.js';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';
import { ToyIcon } from '../Icon.jsx';
import TopCluster from './TopCluster.jsx';
import PositionBlock from './PositionBlock.jsx';
import { FeedList } from './Feed.jsx';
import DriveCluster from './DriveCluster.jsx';
import ItemSlots from './ItemSlots.jsx';
import { Minimap, RoomTag } from './Minimap.jsx';
import Scoreboard, { useStandingsOpen } from './Scoreboard.jsx';
import TouchControls from './TouchControls.jsx';
import { useLayout } from './useLayout.js';
import './matchhud.css';

// only a fine pointer gets the transmitter (game/Game.jsx mounts it)
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

export default function MatchHUD() {
  const phase = useStore((s) => s.phase);
  const modeId = useStore((s) => s.modeId);
  const powerup = useStore((s) => s.powerup);
  const myId = useStore((s) => s.myId);
  const itId = useStore((s) => s.itId);
  const spectating = useStore((s) => s.spectating);
  const abilityReadyAt = useStore((s) => s.abilityReadyAt);
  const printerFlashUntil = useStore((s) => s.printerFlashUntil);
  const myCar = useStore((s) => s.car);
  const inputMode = useStore((s) => s.inputMode);
  const transmitter = (useStore((s) => s.transmitter) ?? false) && FINE_POINTER;
  const standingsOpen = useStandingsOpen();
  const { compact, touch } = useLayout();
  const [tapStandings, setTapStandings] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(iv);
  }, []);

  const map = useMap();
  const countdown = phase === PHASE.COUNTDOWN;
  const myRoom = !spectating ? map.roomAt(telemetry.x, telemetry.z) : null;
  // Last Car Standing: a locked room, or outside the finale's ring, zaps you
  const finale = modeId === 'last_standing' ? net.zone : null;
  const lcs = useStore.getState().lcs;
  const outsideRing = !!(finale && !spectating && Math.hypot(telemetry.x - finale.x, telemetry.z - finale.z) > finale.r);
  const inLockedRoom = !!(modeId === 'last_standing' && !spectating && myRoom && lcs?.locked?.includes(myRoom.id));
  const hazard = outsideRing ? 'ring' : inLockedRoom ? 'room' : null;
  // holding It or the battery up on the furniture: it won't stay there long
  const holding = (modeId === 'tag' && itId === myId) || (modeId === 'battery' && ((net.flags.get(myId) || 0) & 32));
  const perchWarn = !!holding && !spectating && perched(map, telemetry.x, telemetry.y, telemetry.z);
  const abilityReady = Date.now() >= abilityReadyAt;

  const cls = ['tb-match', transmitter && 'is-transmitter', spectating && 'is-spectating', countdown && 'is-countdown']
    .filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="tb-scrim" />
      <section className="tb-corner tb-tl" aria-label="Your place">
        <PositionBlock map={map} spectating={spectating} countdown={countdown} touch={touch}
          onOpenStandings={() => setTapStandings(true)} />
        {!countdown && <FeedList />}
      </section>
      {!countdown && (
        <section className="tb-corner tb-tc" aria-label="Clock and objective">
          <TopCluster map={map} spectating={spectating} perchWarn={perchWarn} finale={finale} hazard={hazard}
            standingsOpen={standingsOpen || tapStandings} compact={compact} />
        </section>
      )}
      <section className="tb-corner tb-tr" aria-label="Floor plan">
        <Minimap map={map} />
        <RoomTag room={myRoom} />
      </section>
      {!spectating && (
        <>
          <section className="tb-corner tb-bl" aria-label="Speed, drift and boost">
            <DriveCluster inputMode={inputMode} />
          </section>
          <section className="tb-corner tb-br" aria-label="Ability and item">
            <ItemSlots carId={myCar} readyAt={abilityReadyAt} abilityReady={abilityReady} powerup={powerup} inputMode={inputMode} />
          </section>
        </>
      )}

      {printerFlashUntil > Date.now() && (
        <div className="tb-flash" aria-hidden="true"><ToyIcon name="printer" /></div>
      )}
      <TouchControls />
      {tapStandings && <Scoreboard onClose={() => setTapStandings(false)} />}
    </div>
  );
}
