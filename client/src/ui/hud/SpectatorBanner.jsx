// ------------------------------------------------------ spectator banner
// Knocked out of Last Car Standing, the drone cam follows a survivor: an ink
// ribbon in the top-centre column says whom, and how to switch (click, Space
// or E cycles, game/SpectatorCam.jsx). SPEC-TOYBOX §4.13. The position block
// says OUT; the drive and kit corners are hidden while you watch.
import { useStore } from '../../store.js';
import { ToyIcon } from '../Icon.jsx';
import './spectator.css';

export default function SpectatorBanner() {
  const target = useStore((s) => s.spectateTarget);
  const mode = useStore((s) => s.inputMode);
  return (
    <div className="tb-watch a-pop" role="status">
      <span className="tb-rib is-ink">
        <ToyIcon name="eye" />
        <span className="tb-disp">{target ? `Watching ${target}` : 'Finding a survivor…'}</span>
        {mode === 'touch'
          ? <span className="tb-micro tb-watch-sw">tap to switch</span>
          : <><span className="tb-k">Space</span><span className="tb-micro tb-watch-sw">switch</span></>}
      </span>
    </div>
  );
}
