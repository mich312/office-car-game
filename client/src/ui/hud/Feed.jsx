// ------------------------------------------------------------------ feed
// The last few server lines (6 s each), top-left.
import { useStore } from '../../store.js';
import './feed.css';

export default function Feed() {
  const feed = useStore((s) => s.feed);
  return (
    <div className="feed">
      {feed.slice(-4).map((f) => <div key={f.key} className="feed-item">{f.text}</div>)}
    </div>
  );
}
