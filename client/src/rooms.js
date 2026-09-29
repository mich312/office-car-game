// Which office you're in lives in the URL (?room=K7QX), so an invite is just
// a link, and a reload or a reconnect puts you back with your friends.
import { normalizeRoomCode } from '@rc/shared';

export function roomFromUrl() {
  if (typeof location === 'undefined') return null;
  return normalizeRoomCode(new URLSearchParams(location.search).get('room'));
}

// Keep the address bar in step with the room, without touching the other
// params (?lowfx, ?shadows=…) or adding history entries.
export function setUrlRoom(code) {
  if (typeof history === 'undefined') return;
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code);
  else u.searchParams.delete('room');
  history.replaceState(history.state, '', u);
}

// The link you send: just the room — your render settings are yours.
export function inviteLink(code) {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('room', code);
  return u.toString();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // insecure origin / permissions: the old way still works in most browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
