// Before the room answers (SPEC-TOYBOX §4.19): the "waking up" screen with a
// toy car on a dashed road, the connection error (a Facilities barricade
// with a friendly headline, the server's own reason, back to the garage and
// — when the server didn't turn us away for good — try again), and the
// photo-mode hint, the only thing drawn while the HUD hides for photos.
import { useEffect } from 'react';
import { useStore } from '../../store.js';
import { retryConnect } from '../../net.js';
import { ToyIcon, ToyCar } from '../Icon.jsx';
import './connect.css';

// The brand lockup (shared look with the garage): an ink ribbon over a
// bubble→blaze MAYHEM, the one non-semantic hue in the UI.
export function Logo({ className = '' }) {
  return (
    <div className={`tb-logo${className ? ` ${className}` : ''}`} role="img" aria-label="Tiny RC Mayhem">
      <span className="tb-rib is-ink"><span className="tb-disp">Tiny RC</span></span>
      <span className="tb-logo-m tb-disp tb-ol tb-ex tb-grad" data-t="Mayhem">Mayhem</span>
      <span className="tb-micro">After hours · 2–12 players · one giant office</span>
    </div>
  );
}

// the server's reasons (rooms.js / room.js / net.js) → a friendly headline
function headline(reason, code) {
  const r = String(reason || '');
  if (/full/i.test(r)) return code ? `Room ${code} is full` : 'This room is full';
  if (/capacity/i.test(r)) return 'Every office is booked';
  if (/code/i.test(r)) return code ? `No room called ${code}` : "That code doesn't work";
  if (/version|reload|build/i.test(r)) return 'New build, please reload';
  return "Can't reach the office";
}
function advice(reason) {
  const r = String(reason || '');
  if (/full/i.test(r)) return 'Try quick play, or ask your friend for a fresh invite link.';
  if (/capacity/i.test(r)) return 'Give it a minute and try again.';
  if (/code/i.test(r)) return 'Room codes are four letters. Check the invite link, or start a private room of your own.';
  return 'Check your connection. The office keeps trying in the background.';
}

export default function ConnectScreen() {
  const connected = useStore((s) => s.connected);
  const connectError = useStore((s) => s.connectError);
  const fatal = useStore((s) => s.connectFatal);
  const code = useStore((s) => s.roomCode || s.roomRequest);

  const toGarage = () => useStore.setState({ screen: 'menu', connectError: null, connectFatal: false, breakRoom: false });

  // Esc goes back to the garage from the error card
  useEffect(() => {
    if (!connectError) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); toGarage(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [connectError]);

  if (connectError) {
    const shownCode = code && code !== 'new' ? code : null;
    return (
      <div className="tb-conn">
        <Logo />
        <div className="tb-err tb-box a-pop" role="alert">
          <div className="tb-err-cap">
            <span className="tb-err-ic"><ToyIcon name="warning" /></span>
            <span className="tb-err-k">Connection failed · Facilities</span>
          </div>
          <div className="tb-err-b">
            <h2 className="tb-disp">{headline(connectError, shownCode)}</h2>
            <p>{connectError}{/[.!?]$/.test(connectError) ? '' : '.'} {advice(connectError)}</p>
          </div>
          <div className="tb-err-f">
            <button type="button" className="tb-cta" onClick={toGarage} autoFocus aria-keyshortcuts="Escape">
              <span className="tb-disp">Back to the garage</span><span className="tb-k" aria-hidden="true">Esc</span>
            </button>
            {!fatal && (
              <button type="button" className="tb-btn" onClick={retryConnect}><ToyIcon name="refresh" />Try again</button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (connected) return null;
  return (
    <div className="tb-conn" role="status" aria-live="polite">
      <Logo />
      <div className="tb-load">
        <div className="tb-road"><span className="tb-load-car"><ToyCar paint="#3498db" /></span></div>
        <span className="tb-lbl">The office is waking up</span>
      </div>
    </div>
  );
}

// photo mode hides every HUD surface but this: top centre, out of the shot's middle
export function PhotoHint() {
  return (
    <div className="tb-hud">
      <div className="tb-photo">
        <span className="tb-rib is-ink"><ToyIcon name="camera" /><span className="tb-lbl">Photo mode · <span className="tb-k is-dark">P</span> to exit</span></span>
      </div>
    </div>
  );
}
