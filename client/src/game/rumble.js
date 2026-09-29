// Haptics: dual-rumble on gamepads that support it, the vibration motor on
// phones. Fire-and-forget, and silently nothing everywhere else (desktop
// browsers without a pad, iOS Safari which has no vibrate()).
const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
let lastAt = 0;

// strength 0…1, duration in ms
export function rumble(strength, ms = 120) {
  if (typeof navigator === 'undefined' || strength < 0.05) return;
  const now = performance.now();
  if (now - lastAt < 60) return; // don't stack buzzes from one crash
  lastAt = now;
  const s = Math.min(1, strength);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    const act = p && p.connected && p.vibrationActuator;
    if (act && act.playEffect) {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: s, weakMagnitude: Math.min(1, 0.2 + s * 0.6) })
        .catch(() => {});
    }
  }
  // a phone buzzing on every scuff is irritating: only the real hits
  if (touch && s >= 0.3 && navigator.vibrate) navigator.vibrate(Math.round(ms * s));
}
