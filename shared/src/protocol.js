// WebSocket message types. JSON payloads — small enough at 12 players / 20 Hz.
export const MSG = {
  // client → server
  HELLO: 'hello', // { name, car, paint }
  READY: 'ready', // { ready }
  VOTE_MODE: 'vote', // { mode }
  STATE: 's', // { p:[x,y,z], q:[x,y,z,w], v:[x,y,z], b:boost, d:drifting, g:grounded }
  USE_POWERUP: 'use', // {}
  BUMP: 'bump', // { target } — client-detected car↔car hit, server validates by distance
  NUDGE: 'nudge', // { i, p, v } — I shoved prop i at p with velocity v; relayed to peers

  // server → client
  WELCOME: 'welcome', // { id, room }
  LOBBY: 'lobby', // { players, votes, phase }
  START: 'start', // { mode, endsAt, spawnIndex, seed }
  SNAPSHOT: 'ss', // { t, players:{id:[...]}, ball, mode-specific }
  PICKUP: 'pickup', // { id, powerup } — you got a powerup
  EFFECT: 'fx', // { type, ... } — powerup/effect broadcast
  OFFICE_EVENT: 'event', // { id, duration }
  FEED: 'feed', // { text, icon }
  SCORE: 'score', // { scores: {id: n}, detail }
  MATCH_END: 'end', // { podium:[{id,name,score}], xp }
  PLAYER_JOIN: 'join',
  PLAYER_LEAVE: 'leave',
  RESPAWN: 'respawn', // client → server: { safe?: [x, z, rotY] } — please respawn me
  RESPAWN_AT: 'rsat', // server → client: { x, z, rotY, freeze, protect }
  ERROR: 'error',
};

// Snapshot player flag bits (players[id].f)
export const FLAG = {
  DRIFTING: 1,
  GROUNDED: 2,
  STUNNED: 4,
  SHIELD: 8,
  SHRUNK: 16,
  BATTERY: 32,
  PROTECTED: 64, // spawn protection — can't be hit, can't hit
  KO: 128, // eliminated for the current sumo round
};

export const PHASE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PODIUM: 'podium',
};
