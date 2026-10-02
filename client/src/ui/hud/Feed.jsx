// ------------------------------------------------------------------ feed
// The last few server lines (6 s each), under the position block in the
// top-left corner (SPEC-TOYBOX §4.3). Each line is parsed client-side
// (parseFeed.js): its lead emoji becomes a Toy icon chip coloured by kind,
// player names become paint-backed name tags, numbers go bold. The server's
// strings are never changed (scripts/test-bots.mjs matches their emoji).
//   · ink ribbons (the secondary layer); a line about YOU is a sun ribbon
//   · newest on top, 3 rows (1 on a phone); older than 3 s → 72 %
//   · screen readers hear only your lines and Facilities' warnings
import { Fragment } from 'react';
import { useStore } from '../../store.js';
import { ToyIcon } from '../Icon.jsx';
import { paintOf, paintVars } from './format.js';
import { parseFeed } from './parseFeed.js';
import './feed.css';

const ROWS = 3;
const OLD_MS = 3000;
const born = new Map(); // feed key → when this client first showed it

// HUD.jsx mounts <Feed /> at the root; the match HUD mounts <FeedList /> in
// its top-left corner (it scales with the corner). Outside a match there is
// no feed on screen, so the root mount renders nothing.
export default function Feed() {
  return null;
}

// parsed once per line (and again only when the roster changes)
const parsedBy = new WeakMap(); // players object → Map(feed key → parsed)
function parsed(f, players, myId) {
  let m = parsedBy.get(players);
  if (!m) { m = new Map(); parsedBy.set(players, m); }
  let r = m.get(f.key);
  if (!r) { r = parseFeed(f.text, players, myId); m.set(f.key, r); }
  return r;
}

function Line({ parts, players, myId }) {
  return parts.map((p, i) => {
    if (p.who != null) {
      const pl = players[p.who];
      return p.who === myId
        ? <span key={i} className="tb-name is-you">{pl?.name}</span>
        : <span key={i} className="tb-name" style={paintVars(paintOf(pl))}>{pl?.name}</span>;
    }
    if (p.team != null) return <span key={i} className={`tb-team is-${p.team ? 'blue' : 'orange'}`} aria-hidden="true" />;
    // numbers in the text go bold
    return (
      <Fragment key={i}>
        {p.t.split(/(\d+(?:[.,]\d+)?)/).map((bit, j) => (j % 2 ? <b key={j}>{bit}</b> : bit))}
      </Fragment>
    );
  });
}

export function FeedList() {
  const feed = useStore((s) => s.feed);
  const players = useStore((s) => s.players);
  const myId = useStore((s) => s.myId);
  const now = Date.now();
  const rows = feed.slice(-ROWS).reverse();
  // forget the lines that left the store
  if (born.size > 32) {
    const live = new Set(feed.map((f) => f.key));
    const m = parsedBy.get(players);
    for (const k of born.keys()) if (!live.has(k)) { born.delete(k); m?.delete(k); }
  }
  if (!rows.length) return null;
  return (
    <ul className="tb-feed" aria-live="polite" aria-relevant="additions">
      {rows.map((f) => {
        if (!born.has(f.key)) born.set(f.key, now);
        const old = now - born.get(f.key) > OLD_MS;
        const { icon, kind, me, parts } = parsed(f, players, myId);
        const heard = me || kind === 'fac';
        return (
          <li key={f.key} className={`tb-rib tb-fi${me ? ' is-me' : ''}${old ? ' is-old' : ' a-slide'}`} aria-hidden={heard ? undefined : true}>
            <span className={`tb-chip k-${kind}`}><ToyIcon name={icon} /></span>
            <span className="tb-fi-t"><Line parts={parts} players={players} myId={myId} /></span>
          </li>
        );
      })}
    </ul>
  );
}
