// Powerups. The server owns pads, assignment and effect resolution;
// clients only apply the visual/physical consequences they're told about.
export const POWERUPS = {
  turbo: { id: 'turbo', name: 'Mini Turbo', icon: '🚀', desc: 'Instant boost refill + surge.' },
  emp: { id: 'emp', name: 'Remote EMP', icon: '⚡', desc: 'Stuns every car nearby.' },
  rocket: { id: 'rocket', name: 'Rocket', icon: '🧨', desc: 'Homing firework at the car ahead.' },
  oil: { id: 'oil', name: 'Oil Spill', icon: '🛢️', desc: 'Drops a slippery puddle behind you.' },
  coffee: { id: 'coffee', name: 'Coffee Spill', icon: '☕', desc: 'Hot sticky puddle. Slows everyone in it.' },
  shield: { id: 'shield', name: 'Bubble Shield', icon: '🫧', desc: 'Blocks one hit for 6 seconds.' },
  shrink: { id: 'shrink', name: 'Shrink Ray', icon: '🔬', desc: 'Shrinks the current leader.' },
  spring: { id: 'spring', name: 'Spring Jump', icon: '🪤', desc: 'Launches you sky high.' },
  swap: { id: 'swap', name: 'Position Swap', icon: '🔀', desc: 'Trade places with a random rival.' },
  fake: { id: 'fake', name: 'Fake Powerup', icon: '🎁', desc: 'It does absolutely nothing. Gottem.' },
};

export const POWERUP_IDS = Object.keys(POWERUPS);

export const POWERUP_EFFECT = {
  EMP_RADIUS: 9,
  EMP_STUN_S: 2.2,
  ROCKET_SPEED: 30,
  ROCKET_STUN_S: 1.8,
  PUDDLE_RADIUS: 2.6,
  PUDDLE_LIFETIME_S: 18,
  SHIELD_S: 6,
  SHRINK_S: 8,
  SHRINK_SCALE: 0.62,
  SPRING_IMPULSE: 20,
  PAD_COOLDOWN_S: 8,
};
