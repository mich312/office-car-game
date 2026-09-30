// --------------------------------------------------------- office events
// Office events arrive as calendar reminders: telegraphs on a sticky-note
// toast, the live event on a glass toast.
import { useStore } from '../../store.js';
import Icon, { EVENT_ICON } from '../Icon.jsx';
import './telegraph.css';

export default function EventTelegraph() {
  const event = useStore((s) => s.event);
  const eventWarn = useStore((s) => s.eventWarn);
  if (!event && eventWarn) {
    return (
      <div className="toast toast-warn hud-event">
        <span className="toast-icon"><Icon name={EVENT_ICON[eventWarn.id] || 'warning'} /></span>
        <div>
          <span className="label">reminder · starting soon</span>
          <b>{eventWarn.name}</b>
          <small>{eventWarn.desc}</small>
        </div>
      </div>
    );
  }
  if (!event) return null;
  return (
    <div className="toast hud-event">
      <span className="toast-icon"><Icon name={EVENT_ICON[event.id] || 'warning'} /></span>
      <div>
        <span className="label">office event</span>
        <b>{event.name}</b>
        <small>{event.desc}</small>
      </div>
    </div>
  );
}
