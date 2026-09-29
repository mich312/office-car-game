// Many offices per process. Every connection names the room it wants in its
// URL (/ws?room=…) and the manager hands back a Room:
//   ?room=new    a fresh private room with a server-chosen code
//   ?room=K7QX   that room — recreated if it's gone, so an invite link
//                survives the room emptying out or a server restart
//   (nothing)    quick play: the busiest public room with space, or a new one
// Rooms nobody human has been in for a while are disposed; the total is
// capped so a script opening codes can't spin up unbounded tick loops.
import { MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LEN, normalizeRoomCode } from '@rc/shared';

export function humanCount(room) {
  let n = 0;
  for (const p of room.players.values()) if (!p.bot) n++;
  return n;
}

export class RoomManager {
  // makeRoom(code, isPrivate) → Room. Injected so tests can use a stub.
  constructor(makeRoom, { maxRooms = 64, emptyTtlMs = 60_000, now = () => Date.now() } = {}) {
    this.makeRoom = makeRoom;
    this.maxRooms = maxRooms;
    this.emptyTtlMs = emptyTtlMs;
    this.now = now;
    this.rooms = new Map(); // code → { room, isPrivate, emptySince }
  }

  freshCode() {
    for (let tries = 0; tries < 50; tries++) {
      let c = '';
      for (let i = 0; i < ROOM_CODE_LEN; i++) c += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    return null;
  }

  create(code, isPrivate) {
    if (this.rooms.size >= this.maxRooms) return null;
    const room = this.makeRoom(code, isPrivate);
    this.rooms.set(code, { room, isPrivate, emptySince: this.now() });
    return room;
  }

  // → { room } or { error }
  resolve(requested) {
    if (requested === 'new') {
      const code = this.freshCode();
      const room = code && this.create(code, true);
      return room ? { room } : { error: 'The office is at capacity — try again in a minute.' };
    }
    if (requested != null && requested !== '') {
      const code = normalizeRoomCode(requested);
      if (!code) return { error: 'That room code doesn\'t look right.' };
      const hit = this.rooms.get(code);
      if (hit) return { room: hit.room };
      const room = this.create(code, true);
      return room ? { room } : { error: 'The office is at capacity — try again in a minute.' };
    }
    // Quick play: strangers should meet, so fill the fullest public room
    // that still has a desk free before opening another.
    let best = null, bestN = -1;
    for (const { room, isPrivate } of this.rooms.values()) {
      if (isPrivate) continue;
      const n = humanCount(room);
      if (n < MAX_PLAYERS && n > bestN) { best = room; bestN = n; }
    }
    if (best) return { room: best };
    const code = this.freshCode();
    const room = code && this.create(code, false);
    return room ? { room } : { error: 'The office is at capacity — try again in a minute.' };
  }

  // Dispose rooms that have had no humans for emptyTtlMs. Call periodically.
  sweep() {
    const t = this.now();
    for (const [code, entry] of this.rooms) {
      if (humanCount(entry.room) > 0 || entry.room.pending > 0) { entry.emptySince = t; continue; }
      if (t - entry.emptySince >= this.emptyTtlMs) {
        entry.room.dispose?.();
        this.rooms.delete(code);
      }
    }
  }
}
