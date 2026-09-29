// One point light for whatever event is on. three.js builds every lit
// material for the number of lights in the scene, so a light that mounted
// (or was shown) when the robot arrived or the sparks started recompiled the
// lot mid-match — a hitch at exactly the moment everyone is watching. This
// one is always in the scene, dark until an event borrows it; one event runs
// at a time.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const light = new THREE.PointLight('#ffffff', 0, 1, 2);
let owner = null;
const release = (me) => { if (owner === me) { owner = null; light.intensity = 0; } };

// Mounted once, for the life of the game scene.
export function EventLightRig() {
  return <primitive object={light} />;
}

// → take(active), called every frame by the holder: while `active` it
// returns the light (null if another event has it) for the holder to place
// in world space and animate; inactive or unmounted, it goes dark and free.
// (Holders that stay mounted with nothing to show — the robot between its
// runs — must pass their real state, or they'd keep the light lit.)
export function useEventLight(color, intensity, distance) {
  const me = useMemo(() => ({}), []);
  useEffect(() => () => release(me), [me]);
  return (active = true) => {
    if (!active) { release(me); return null; }
    if (owner && owner !== me) return null;
    if (owner !== me) {
      owner = me;
      light.color.set(color);
      light.intensity = intensity;
      light.distance = distance;
    }
    return light;
  };
}
