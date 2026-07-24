// WebSocket message types. JSON payloads — small enough at 12 players / 20 Hz.
export const MSG = {
  // client → server
  HELLO: 'hello', // { name, car, paint }
  READY: 'ready', // { ready }
  VOTE_MODE: 'vote', // { mode }
  STATE: 's', // { p:[x,y,z], q:[x,y,z,w], v:[x,y,z], b:boost, d:drifting, g:grounded }
  USE_POWERUP: 'use', // {}
  BUMP: 'bump', // { target } — client-detected car↔car hit, server validates by distance
  EMOTE: 'em', // { e: index } or { h: 1 } for the horn — rate-limited server-side

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
  MATCH_END: 'end', // { podium:[{id,name,score}], xp, rivalries, nemesis }
  PLAYER_JOIN: 'join',
  PLAYER_LEAVE: 'leave',
  RESPAWN: 'respawn', // { p, rotY } — server tells you where to respawn
  ERROR: 'error',
};

export const PHASE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PODIUM: 'podium',
};
