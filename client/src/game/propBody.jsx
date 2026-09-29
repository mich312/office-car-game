// A physics prop's body, and the plumbing that makes prop chaos shared: when
// the LOCAL car whacks a prop, its momentum is queued here and relayed
// (throttled) through the server, and every other client applies the same
// impulse to its copy (Props.jsx). Theme props (themes/*.jsx) wrap their
// meshes in <Body> too, so every map's props join in.
import { useRef, useEffect } from 'react';
import { RigidBody } from '@react-three/rapier';
import { MSG, NUDGE_RATE_MS } from '@rc/shared';
import { audio } from '../audio.js';
import { send } from '../net.js';

export const propRefs = new Map(); // PROPS index → rigid body ref
const pendingHits = new Map(); // index → ref; latest hit wins until flushed
let lastFlush = 0;

export function flushPropHits() {
  const nowMs = performance.now();
  if (nowMs - lastFlush < NUDGE_RATE_MS || pendingHits.size === 0) return;
  lastFlush = nowMs;
  let n = 0;
  for (const [i, ref] of pendingHits) {
    pendingHits.delete(i);
    const b = ref?.current;
    if (!b) continue;
    // momentum ≈ what the hit gave the prop — enough for remotes to mirror it
    const v = b.linvel();
    const m = b.mass ? b.mass() : 1;
    const im = [v.x * m, v.y * m, v.z * m];
    if (Math.hypot(...im) < 1) continue;
    send({ t: MSG.PROP, i, im: im.map((x) => Math.round(x * 100) / 100) });
    if (++n >= 8) break;
  }
}

export const impactSound = (() => {
  let last = 0;
  return (mag) => {
    const now = performance.now();
    if (now - last < 90 || mag < 900) return;
    last = now;
    audio.impact(Math.min(1, mag / 9000));
  };
})();

export function Body({ p, mass, children, colliders = null, angularDamping = 0.15, restitution = 0.25, friction = 0.7, ccd = false, onForce }) {
  const ref = useRef();
  useEffect(() => {
    if (p.i === undefined) return undefined;
    propRefs.set(p.i, ref);
    return () => propRefs.delete(p.i);
  }, [p.i]);
  return (
    <RigidBody
      ref={ref}
      position={[p.x, p.y + 0.4, p.z]}
      rotation-y={p.rotY || 0}
      colliders={colliders}
      mass={mass}
      angularDamping={angularDamping}
      linearDamping={0.08}
      restitution={restitution}
      friction={friction}
      ccd={ccd}
      onContactForce={(e) => {
        impactSound(e.totalForceMagnitude);
        // my car whacked this prop → queue its momentum for the relay
        if (p.i !== undefined && e.other.rigidBody?.userData?.playerId === 'me') pendingHits.set(p.i, ref);
        onForce?.(e);
      }}
    >
      {children}
    </RigidBody>
  );
}
