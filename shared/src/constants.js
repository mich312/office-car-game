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
export const SUSPENSION_STIFFNESS = 320; // sag ≈ 14% of travel at rest
export const SUSPENSION_DAMPING = 24;
// Where a car sits when the suspension has settled: ray length at equilibrium
// (rest · (1 − |GRAVITY|/stiffness)) plus the chassis-corner offset. Spawning
// here means no drop-bounce and no scraping before the start.
export const SUSPENSION_SETTLE = SUSPENSION_REST * (1 - (9.81 * M) / SUSPENSION_STIFFNESS);
export const SPAWN_Y = SUSPENSION_SETTLE + 0.05 + 0.02; // corner offset + a hair

// Driving feel
export const BOOST_TOP_MULT = 1.3; // boosting may exceed top speed by this much
export const UPRIGHT_ASSIST = 14; // air auto-level torque toward wheels-down
export const SLOPE_ASSIST = 0.8; // fraction of along-slope gravity cancelled on throttle
export const BOOST_MAX = 100;
export const BOOST_REGEN = 12; // per second while grounded
export const BOOST_DRAIN = 38; // per second while boosting
export const BATTERY_SPEED_PENALTY = 0.72; // top-speed multiplier while carrying

// Tiered drift mini-turbo (Mario Kart style). Charge accumulates while
// drifting — faster while actively steering — and crossing each threshold
// upgrades the spark tier. Releasing the drift fires a free boost whose
// duration scales with the tier reached.
export const DRIFT_TIER_TIMES = [1.0, 1.9, 3.2]; // charge seconds per tier
export const DRIFT_TIER_BOOST_S = [0.7, 1.5, 2.4]; // release boost seconds
export const DRIFT_TIER_COLORS = ['#59c7ff', '#ffb347', '#ff6bf0'];
export const DRIFT_CHARGE_STEER = 1.0; // charge/s while steering in the drift
export const DRIFT_CHARGE_COAST = 0.5; // charge/s while drifting straight

// Slipstream: hold position in a rival's wake to earn a free speed burst.
export const SLIPSTREAM = {
  RANGE: 7, // how far behind a car the wake reaches (units)
  LATERAL: 1.4, // half-width of the wake corridor
  MIN_SPEED_FRAC: 0.65, // of top speed — no drafting while dawdling
  CHARGE_S: 1.8, // seconds in the wake before the burst fires
  BOOST_S: 2.0, // burst duration
};

export const BRAKE_STRENGTH = 2.4; // brake decel as a multiple of engine accel

// Networking
export const TICK_RATE = 20; // server simulation + snapshot Hz
export const INPUT_SEND_RATE = 20; // client transform reports Hz
export const INTERP_DELAY_MS = 120; // remote entity render delay
export const DEFAULT_PORT = 8080;

// Match flow
export const MAX_PLAYERS = 12;
export const COUNTDOWN_SECONDS = 4;
export const MATCH_SECONDS = 210; // 3.5 minute matches
export const PODIUM_SECONDS = 12;
export const OFFICE_EVENT_INTERVAL = 60; // an office event every minute
export const BOTS_FILL_TO = 6; // server tops the room up to this many racers

// Gameplay radii (units)
export const PICKUP_RADIUS = 1.6;
export const CHECKPOINT_RADIUS = 7.0;
export const BUMP_RADIUS = 1.35;
export const BUMP_REL_SPEED = 14; // relative speed separating a rub from a hit
export const RESPAWN_Y = -12; // fell off the balcony / out of world

// Car-vs-car contact. Below BUMP_REL_SPEED a contact is a "rub" — cosmetic,
// cheap cooldown, no gameplay. At or above it's a "hit": knockback, mode
// effects (spills, tags), the works. Separate cooldowns so cornering traffic
// can't eat the budget for real hits.
export const BUMP_RUB_COOLDOWN_MS = 300;
export const BUMP_HIT_COOLDOWN_MS = 900;
// Forgiving online collisions: car contact never costs you more than this
// fraction of the forward speed you carried into it.
export const BUMP_MIN_FWD_KEEP = 0.55;

// Post-step safety rails: no impulse stack (bump + rocket + spring + wind)
// may launch a car past these. Kept under MAX_PLAUSIBLE_SPEED so a capped
// car never trips the server's anti-teleport check.
export const SPEED_HARD_CAP = 34; // units/s
export const ANGVEL_CAP = 7; // rad/s
// Speed-proportional downforce pressing the car along -up while grounded.
export const DOWNFORCE = 0.5; // accel per unit of forward speed

// Respawning. The server picks the spot (scored slots in arena modes, the
// client's safe-pose proposal in races), then grants a short input freeze
// plus a spawn-protection window that ends early if the spawner attacks.
export const SPAWN_PROTECT_MS = 2000;
export const RESPAWN_FREEZE_MS = 900;
export const SAFE_POSE_INTERVAL_MS = 200; // sampling rate of the pose ring
export const SAFE_POSE_BUFFER = 12; // ≈2.4 s of history; respawn at oldest
export const SAFE_POSE_MIN_GROUNDED_S = 0.5; // pose counts only after this

// Shared prop nudges: best-effort impulse relay for gameplay-relevant props.
// There is no position sync — props settle, so divergence heals on its own.
export const NUDGE_RATE_MS = 200; // client flush interval for queued prop hits
export const NUDGE_MAX_SPEED = 40; // server clamp on reported car velocity

// Anti-teleport validation. A reported move is allowed if it fits inside
// MAX_PLAUSIBLE_SPEED (boost + shove headroom) over the time since the last
// accepted report, plus a fixed slack that absorbs network jitter — packets
// bunch, so two reports can arrive milliseconds apart carrying 100 ms of real
// movement. The slack is what a client can jump for free, so it is small:
// ~5 car lengths, well under the gap between checkpoints.
export const MAX_PLAUSIBLE_SPEED = 35;
export const TELEPORT_SLACK = 5; // units of jitter allowance per report
export const TELEPORT_STRIKES = 8; // consistent rejects before we believe it
export const TELEPORT_ANCHOR_DIST = 4; // how close those rejects must agree
// Respawn proposals (races send their own safe pose) are checked against the
// server's own record of where that player has recently been.
export const SAFE_POSE_MATCH_DIST = 4;

// Emote wheel: keys 1–8 in-game, popped as a sprite over the car for everyone.
// Index travels over the wire; the array is the single source of truth.
export const EMOTES = ['😂', '😡', '👋', '🏆', '😱', '🫡', '❤️', '💩'];
