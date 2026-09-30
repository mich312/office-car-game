// -------------------------------------------------------------- match hud
// Everything on screen while a round is on: the top cluster (clock + mode
// chips), the drive cluster, item + ability, minimap, and the hazard / flash
// / spectator overlays. Re-renders at 10 Hz for the slow state.
import { useEffect, useState } from 'react';
import { CAR_UNIT_M, perched } from '@rc/shared';
import { useMap } from '../../game/activeMap.js';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';
import Icon from '../Icon.jsx';
import TopCluster from './TopCluster.jsx';
import ItemSlots from './ItemSlots.jsx';
import Minimap from './Minimap.jsx';
import TouchControls from './TouchControls.jsx';
import './matchhud.css';

export default function MatchHUD() {
  const modeId = useStore((s) => s.modeId);
  const powerup = useStore((s) => s.powerup);
  const myId = useStore((s) => s.myId);
  const itId = useStore((s) => s.itId);
  const lcs = useStore((s) => s.lcs);
  const spectating = useStore((s) => s.spectating);
  const spectateTarget = useStore((s) => s.spectateTarget);
  const abilityReadyAt = useStore((s) => s.abilityReadyAt);
  const printerFlashUntil = useStore((s) => s.printerFlashUntil);
  const myCar = useStore((s) => s.car);
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(iv);
  }, []);

  const speedCms = Math.round(telemetry.speed * CAR_UNIT_M * 100); // real-world cm/s at toy scale
  const boostFrac = Math.min(1, Math.max(0, telemetry.boost / 100));
  // Last Car Standing: closing-room countdown + get-out alarm
  const map = useMap();
  const warnRoom = lcs?.warn ? map.ROOMS.find((r) => r.id === lcs.warn.room) : null;
  const warnLeft = lcs?.warn ? Math.max(0, Math.ceil((lcs.warn.until - Date.now()) / 1000)) : 0;
  const myRoom = !spectating ? map.roomAt(telemetry.x, telemetry.z) : null;
  // the finale's ring: outside it is as deadly as a closed room
  const finale = modeId === 'last_standing' ? net.zone : null;
  const outsideRing = !!(finale && !spectating && Math.hypot(telemetry.x - finale.x, telemetry.z - finale.z) > finale.r);
  const inLockedRoom = !!(modeId === 'last_standing' && ((myRoom && lcs?.locked?.includes(myRoom.id)) || outsideRing));
  // holding It or the battery up on the furniture: it won't stay there long
  const holding = (modeId === 'tag' && itId === myId) || (modeId === 'battery' && ((net.flags.get(myId) || 0) & 32));
  const perchWarn = !!holding && !spectating && perched(map, telemetry.x, telemetry.y, telemetry.z);

  return (
    <>
      <TopCluster map={map} spectating={spectating} perchWarn={perchWarn}
        warnRoom={warnRoom} warnLeft={warnLeft} finale={finale} />

      {printerFlashUntil > Date.now() && (
        <div className="printer-flash"><Icon name="printer" size={90} /></div>
      )}
      {inLockedRoom && (
        <div className="toast toast-bad zap-toast">
          <span className="toast-icon"><Icon name="warning" /></span>
          <div><b>{outsideRing ? 'OUTSIDE THE RING — GET IN!' : 'ROOM CLOSED — GET OUT!'}</b></div>
        </div>
      )}
      {spectating && (
        <div className="spectate-chip chip">
          <Icon name="camera" size={15} /> eliminated — watching {spectateTarget || '…'}
          <small>click / space to switch</small>
        </div>
      )}

      <div className="drive-cluster">
        <div className={`boost-ring ${boostFrac >= 0.995 ? 'full' : ''}`} style={{ '--frac': boostFrac }}>
          <div className="speed">
            <b>{speedCms}</b>
            <span className="label">cm/s</span>
          </div>
        </div>
      </div>

      <ItemSlots carId={myCar} readyAt={abilityReadyAt} powerup={powerup} />

      <div className="map-cluster">
        <Minimap />
        {myRoom && <div className="map-room chip"><span className="label">{myRoom.name}</span></div>}
      </div>
      <TouchControls />
    </>
  );
}
