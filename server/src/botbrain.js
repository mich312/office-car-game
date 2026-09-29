// Bot judgement, kept pure so scripts/test-bots.mjs can put a bot in a
// situation and check what it does. bots.js gathers the situation from the
// room each tick; nothing in here touches the room.
import { POWERUP_EFFECT as FX } from '@rc/shared';

// ---------------------------------------------------------------- items
// When to fire the item in hand. Every item has a situation it's FOR, and a
// bot that fires it outside that situation — an EMP with nobody in range,
// oil with nobody behind, a shield before anything is coming — is a bot that
// reads as random. A short reaction hold keeps it from firing the instant
// it drives over the pad; a long fallback means nothing is hoarded forever.
export const ITEM_REACT_S = 0.7; // minimum hold after pickup
export const ITEM_FALLBACK_S = 18; // use it anyway after this long
export const SHIELD_ROCKET_RANGE = 26; // raise the shield when a rocket aimed at us is this close
export const OIL_BEHIND_RANGE = 12;

// ctx: {
//   held: seconds since pickup,
//   rivals: [{ ahead, lateral, dist, closing, exposed }] in the bot's frame
//     (ahead > 0 = in front; closing = relative speed toward us; exposed =
//     not shielded or spawn-protected),
//   incomingRocketDist: distance of the nearest rocket targeting this bot (Infinity if none),
//   rank: 0 = leading … 1 = last,
//   aligned: |heading error| is small (on a straight),
//   speedFrac: speed / top speed,
// }
export function shouldUseItem(item, ctx) {
  // the shield is the one item that reacts rather than plans: no hold
  if (item === 'shield') {
    if (ctx.incomingRocketDist < SHIELD_ROCKET_RANGE) return true;
    if (ctx.rivals.some((r) => r.dist < 3.5 && r.closing > 8)) return true; // about to be rammed
    return ctx.held > ITEM_FALLBACK_S;
  }
  if (ctx.held < ITEM_REACT_S) return false;
  switch (item) {
    case 'emp': {
      const inRange = ctx.rivals.filter((r) => r.exposed && r.dist < FX.EMP_RADIUS * 0.85).length;
      return inRange >= 1 || ctx.held > ITEM_FALLBACK_S * 1.5;
    }
    case 'oil':
    case 'coffee':
      // someone on our tail, roughly in our tyre tracks
      return ctx.rivals.some((r) => r.ahead < -1 && r.ahead > -OIL_BEHIND_RANGE && Math.abs(r.lateral) < 4)
        || ctx.held > ITEM_FALLBACK_S;
    case 'turbo':
      // wasted in a corner (it'd just push us into the wall), best on a straight
      return (ctx.aligned && ctx.speedFrac > 0.45) || ctx.held > ITEM_FALLBACK_S;
    case 'rocket':
      return ctx.rivals.length > 0;
    case 'swap':
      // a swap is a gamble that only pays from the back
      return ctx.rank >= 0.5 || ctx.held > ITEM_FALLBACK_S * 2;
    case 'shrink':
      return ctx.rank > 0; // it hits the leader — never fire it while leading
    default: // spring, fake: showmanship, a beat after pickup
      return ctx.held > 1.6;
  }
}

// ------------------------------------------------------------ item pads
// Worth a detour for a pad? Only empty-handed, only a ready pad that's
// roughly ahead and close, and — when the bot is heading somewhere — only if
// the pad is more or less on the way. A bot that U-turns for every item
// isn't racing.
export const PAD_DETOUR_RANGE = 15;
export function padWorthDetour(bot, pad, goal) {
  const dx = pad.x - bot.x, dz = pad.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d > PAD_DETOUR_RANGE || d < 0.01) return d < 0.01;
  const ahead = (dx * Math.sin(bot.heading) + dz * Math.cos(bot.heading)) / d; // cos of bearing
  if (ahead < 0.45) return false; // more than ~63° off the nose
  if (!goal) return true;
  const direct = Math.hypot(goal.x - bot.x, goal.z - bot.z);
  const via = d + Math.hypot(goal.x - pad.x, goal.z - pad.z);
  return via - direct < 6;
}
