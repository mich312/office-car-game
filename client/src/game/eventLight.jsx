// One point light for whatever event is on. three.js builds every lit
// material for the number of lights in the scene, so a light that mounted
// when the robot arrived (or the sparks started) recompiled the lot mid-match
// — a hitch at exactly the moment everyone is watching. This one is always
// in the scene, dark until an event borrows it; one event runs at a time.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const light = new THREE.PointLight('#ffffff', 0, 1, 2);
let owner = null;

// Mounted once, for the life of the game scene.
export function EventLightRig() {
  return <primitive object={light} />;
}

// → a ref to the light while this component holds it (null if another
// event has it). The holder places it in world space every frame and may
// animate its intensity; on unmount it goes dark and is free again.
export function useEventLight(color, intensity, distance, want = true) {
  const ref = useRef(null);
  useEffect(() => {
    if (!want || owner) return undefined;
    const me = {};
    owner = me;
    light.color.set(color);
    light.intensity = intensity;
    light.distance = distance;
    ref.current = light;
    return () => {
      ref.current = null;
      if (owner === me) { owner = null; light.intensity = 0; }
    };
  }, [color, intensity, distance, want]);
  return ref;
}
