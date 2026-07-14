// ---------------------------------------------------------------------------
// World scale
// The player's RC car is 1.0 world units long. M converts the map's
// real-world meters into units. Tuned for gameplay rather than strict
// realism: at 1u ≈ 22.5 cm the rooms feel tight and busy instead of empty,
// while a desk is still a 3.3-unit mountain and a mug still tops your roof.
// ---------------------------------------------------------------------------
export const M = 1 / 0.225; // ≈ 4.444 units per meter

// Physics
export const GRAVITY = -9.81 * M; // real gravity expressed in world units
export const PHYS_TIMESTEP = 1 / 60;

// Car chassis (units)
export const CAR_LENGTH = 1.0;
export const CAR_WIDTH = 0.62;
export const CAR_HEIGHT = 0.34;
export const SUSPENSION_REST = 0.26; // ray length below chassis corners
export const SUSPENSION_STIFFNESS = 160;
export const SUSPENSION_DAMPING = 16;

// Driving feel — jumps SET vertical velocity (not additive impulses), so a
// double jump cancels your fall and heights are predictable every time.
export const JUMP_VEL = 13; // single jump stays below desk height…
export const DOUBLE_JUMP_VEL = 11.5; // …double jump comfortably reaches it
export const COYOTE_TIME = 0.12; // jump still works just after leaving ground
export const BOOST_TOP_MULT = 1.3; // boosting may exceed top speed by this much
export const UPRIGHT_ASSIST = 8; // gentle air auto-level torque (0 = off)
export const AIR_PITCH_TORQUE = 1.1;
export const AIR_YAW_TORQUE = 0.9;
export const BOOST_MAX = 100;
export const BOOST_REGEN = 12; // per second while grounded
export const BOOST_DRAIN = 38; // per second while boosting
export const TRICK_BOOST_REWARD = 25; // clean flip landing
export const BATTERY_SPEED_PENALTY = 0.72; // top-speed multiplier while carrying

// Networking
export const TICK_RATE = 20; // server simulation + snapshot Hz
export const INPUT_SEND_RATE = 20; // client transform reports Hz
export const INTERP_DELAY_MS = 120; // remote entity render delay
export const DEFAULT_PORT = 8080;

// Match flow
export const MIN_PLAYERS = 2; // humans+bots needed to start
export const MAX_PLAYERS = 12;
export const COUNTDOWN_SECONDS = 4;
export const MATCH_SECONDS = 210; // 3.5 minute matches
export const PODIUM_SECONDS = 12;
export const OFFICE_EVENT_INTERVAL = 60; // an office event every minute
export const BOTS_FILL_TO = 6; // server tops the room up to this many racers

// Gameplay radii (units)
export const PICKUP_RADIUS = 1.6;
export const CHECKPOINT_RADIUS = 6.0;
export const BUMP_RADIUS = 1.35;
export const BUMP_REL_SPEED = 14; // relative speed for a "hit" bump
export const RESPAWN_Y = -12; // fell off the balcony / out of world

// Anti-teleport validation: max plausible units/second (boost + shove headroom)
export const MAX_PLAUSIBLE_SPEED = 50;
