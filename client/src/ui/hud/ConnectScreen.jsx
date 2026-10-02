// Before the room answers: the "waking up" screen, the connection error with
// a way back to the garage, and the photo-mode hint (the only thing drawn
// while the HUD is hidden for photos).
import { useStore } from '../../store.js';
import Icon from '../Icon.jsx';
import './connect.css';

export default function ConnectScreen() {
  const connected = useStore((s) => s.connected);
  const connectError = useStore((s) => s.connectError);
  if (connectError) {
    return (
      <div className="connect-screen">
        <div className="toast toast-bad">
          <span className="toast-icon"><Icon name="warning" /></span>
          <div>
            <span className="label">connection failed</span>
            <b>{connectError}</b>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => useStore.setState({ screen: 'menu', connectError: null })}>
          <Icon name="chevron-left" size={15} /> Back to the garage
        </button>
      </div>
    );
  }
  if (connected) return null;
  return (
    <div className="connect-screen">
      <div className="logo small">
        <span className="logo-tiny">TINY RC</span>
        <span className="logo-mayhem">MAYHEM</span>
      </div>
      <p>the office is waking up<span className="dots" /></p>
    </div>
  );
}

export function PhotoHint() {
  return (
    <div className="photo-hint chip">
      <Icon name="camera" size={15} /> photo mode — <kbd>P</kbd> to exit
    </div>
  );
}
