// The player's car: rigid body + 4-ray suspension, arcade forces tuned for
// drift/boost feel, chase camera, particles, sound, network reporting,
// and application of every server-side effect that touches "me".
import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CuboidCollider, useRapier, useBeforePhysicsStep } from '@react-three/rapier';
import * as THREE from 'three';
import {
  CARS, CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH, PHYS_TIMESTEP, BOOST_TOP_MULT,
  SUSPENSION_REST, SUSPENSION_STIFFNESS, SUSPENSION_DAMPING, SPAWN_Y,
  UPRIGHT_GROUND_DOT, PARK_BRAKE_MIN_UP,
  rightingTorque, airRightingK, groundRightingK, roofKickNeeded, recoveryTick, RECOVERY_AFTER_S,
  SLOPE_ASSIST, GRAVITY, BOOST_MAX, BOOST_REGEN, BOOST_DRAIN,
  BATTERY_SPEED_PENALTY, RESPAWN_Y, INPUT_SEND_RATE,
  DRIFT_TIER_BOOST_S, DRIFT_TIER_COLORS, SLIPSTREAM,
  POWERUP_EFFECT, PHASE, MSG, M, ABILITY_FX,
  BUMP_REL_SPEED, BUMP_MIN_FWD_KEEP, SPEED_HARD_CAP, ANGVEL_CAP, DOWNFORCE,
  SAFE_POSE_INTERVAL_MS, SAFE_POSE_BUFFER, SAFE_POSE_MIN_GROUNDED_S,
  tunedStats, driftTier, driftStep, newDriftState, isDrifting, brakeDecel, COAST_DRAG,
  landingStrength, impactStrength, chaseHeading, raceSpawn, soccerKickoff,
  SURFACES, surfaceAt, floorHeight, seamCell,
  CHASE, chaseFov, chaseRig, LEAN, leanTarget, newHeave, heaveStep,
} from '@rc/shared';
import { useStore } from '../store.js';
import { net, on, send, sendState, sampleRemote, remoteVelocity } from '../net.js';
import { useControls } from './useControls.js';
import CarModel, { tyreScale } from './CarModel.jsx';
import Particles, { burst, smoke } from './particles.jsx';
import SkidMarks, { skid } from './SkidMarks.jsx';
import { carView, setCamProbe, clearLens } from './carView.js';
import { audio } from '../audio.js';
import { rumble } from './rumble.js';
import { currentMap } from './activeMap.js';

const NO_ZONES = [];

const BASE_MASS = 14;
// Camera motion (shake, landing dip, hit punch, slide swing) is scaled way
// down for players who've asked their OS for less motion.
const MOTION = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;
const DUST = ['#d9cfc0', '#c4b8a6', '#efe6d8'];
const SPARKS = ['#ffe27a', '#ffb347', '#ffffff'];
// Tyre smoke takes the colour of what it came off: rubber haze on hard
// floors, warmer on wood, and carpet throws up a duller, thinner fibre dust.
const SMOKE_TINT = {
  wood: ['#e0d0b4', 0.26], carpet: ['#b3a597', 0.18], rug: ['#b3a597', 0.18], rubber: ['#9a9590', 0.2],
};
const SMOKE_DEFAULT = ['#efedea', 0.26];
const HALF = { x: CAR_WIDTH / 2, y: CAR_HEIGHT / 2, z: CAR_LENGTH / 2 };
const WHEELS = [
  [-0.28, -0.05, 0.34], [0.28, -0.05, 0.34], // front L/R
  [-0.28, -0.05, -0.34], [0.28, -0.05, -0.34], // rear L/R
];

// scratch objects
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _n = { x: 0, y: 1, z: 0 }; // righting reference normal
const _torque = { x: 0, y: 0, z: 0 }; // righting torque impulse
const _worldUp = { x: 0, y: 1, z: 0 };
const _camTarget = new THREE.Vector3();
// what the chase camera may not sit inside: fixed colliders that aren't
// sensors (QueryFilterFlags ONLY_FIXED | EXCLUDE_SENSORS)…
const CAM_BLOCKERS = 6 | 8;
// …and big loose props (ONLY_DYNAMIC | EXCLUDE_SENSORS, filtered by size): at
// a metre off the floor a sofa or a plant pot fills the lens as surely as a
// wall does. Mugs and pens don't count — pulling in for them is twitch.
const CAM_PROPS = 3 | 8;
const BIG_PROP = 0.35; // u³ — about one and a half cars
const bigProp = new Map(); // collider handle → big enough to block the lens
const isBigProp = (c) => {
  let b = bigProp.get(c.handle);
  if (b === undefined) { b = c.volume() > BIG_PROP; bigProp.set(c.handle, b); }
  return b;
};
const _camPos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _anchor = new THREE.Vector3(); // the car as drawn (interpolated)
const _aq = new THREE.Quaternion();
const _vfwd = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _rig = {};
const _lean = {};
const _chase = [0, 1];
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// One object for the life of the app. react-three-rapier re-applies a body's
// transform (from the last RENDERED pose) whenever a mutable prop changes,
// and an inline {{…}} is a new object — i.e. a change — on every render. A
// re-render landing in the same frame as a teleport (the round's mutator
// arriving with START) put the car straight back where it was in the lobby:
// every round with a mutator started from wherever you'd parked.
const ME = { playerId: 'me' };

export const telemetry = { boost: BOOST_MAX, speed: 0, x: 0, z: 0, heading: 0, grounded: false, y: 0, steer: 0, throttle: 0, roll: 0, pitch: 0, boostHeld: false, miniTurbos: 0 }; // read by HUD/minimap/controller
if (typeof window !== 'undefined') window.__rcTelemetry = telemetry;

export default function LocalCar() {
  const rb = useRef();
  const visual = useRef();
  const keys = useControls();
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const carId = useStore((s) => s.car);
  const paint = useStore((s) => s.paint);
  const myCos = useStore((s) => s.cos);
  const style = useStore((s) => s.style);
  const tune = useStore((s) => s.tune);
  const myName = useStore((s) => s.name);
  const baseCar = CARS[carId] || CARS.balanced;
  // The garage setup sheet is the car we actually drive: gearing, tyres,
  // springs, wing and ballast all resolve into these numbers (see
  // shared/src/tuning.js). Stock sheet → identical to the roster stats.
  const car = useMemo(() => tunedStats(baseCar, tune), [baseCar, tune]);
  // Per-car mass is real physics now: heavy cars shove light ones in bumps.
  // Forces scale with mass so acceleration curves stay identical per car.
  const mass = BASE_MASS * car.mass;
  // A rival's mass includes their ballast notch — that's what ballast is FOR,
  // so knockback ratios have to see it on both sides of the contact.
  const remoteMass = (id) => {
    const p = useStore.getState().players[id];
    return tunedStats(CARS[p?.car] || CARS.balanced, p?.tune).mass;
  };

  // the reused suspension ray (created on the first step, once rapier is up)
  const _ray = useRef(null);
  const _camRay = useRef(null);

  const S = useRef({
    boost: BOOST_MAX,
    boosting: false,
    grounded: false,
    groundedTime: 0,
    stunnedUntil: 0,
    shieldUntil: 0,
    shrinkUntil: 0,
    upsideDownTime: 0,
    lastSend: 0,
    lastBumpSend: 0,
    driftTime: 0,
    drift: newDriftState(), // charge + session, see shared/src/handling.js
    miniTurboUntil: 0,
    slipT: 0,
    slipBoostUntil: 0,
    slipCooldownUntil: 0,
    shake: 0,
    fov: CHASE.fov,
    // chase rig (see shared/src/feel.js CHASE): smoothed yaw and heights,
    // the launch/brake surge, how far a wall has pulled the lens in
    camYaw: 0,
    camY: 0,
    lookY: 0,
    aLongSm: 0,
    camPull: 0,
    camReset: true,
    speed: 0,
    steerVis: 0,
    slipping: false,
    windPhase: 0,
    lastCp: 0,
    frozenUntil: 0, // respawn input freeze
    protectUntil: 0, // spawn protection (can't hit or be hit)
    pendingRespawnAt: 0, // waiting for the server's RESPAWN_AT
    safePoses: [], // ring buffer of recent grounded [x, z, yaw, y]
    lastSafeAt: 0,
    lastFwdSpeed: 0, // forward speed entering this physics step
    selfBump: new Map(), // other id → t of locally-applied bump impulse
    fallCamUntil: 0,
    ramUntil: 0,
    drsUntil: 0,
    overdriftUntil: 0,
    // feel: landing & impact detection, and the camera/body responses
    postHSpeed: -1, // horizontal speed after our own impulses; -1 = skip next check
    lastImpactAt: 0,
    squash: 0, // 0…1 landing squash on the visual shell
    camDip: 0, // 0…1 landing camera dip
    fovPunch: 0, // degrees of zoom-in on a hit
    groundY: [0, 0, 0, 0], // world y under each wheel (smoke is laid on it)
  }).current;

  // the engine sound wears the selected car's voice
  useEffect(() => { audio.setEngineProfile(carId); }, [carId]);

  const speedRef = useRef(0);
  const steerRef = useRef(0);
  const boostingRef = useRef(false);
  const flagsRef = useRef(0);
  // measured weight transfer (rad): roll from lateral G, pitch from
  // accel/brake; plus the raw per-step accelerations (antenna, heave, surge),
  // the slip angle (front wheels counter-steer) and extra rear-wheel spin
  const leanRef = useRef({ roll: 0, pitch: 0, aLat: 0, aLong: 0, aUp: 0, slip: 0, spin: 0, heave: 0 });
  const heave = useRef(newHeave());
  // per-wheel visual Y (local) so the wheels follow the suspension rays
  const wheelR = (carId === 'monster' ? 0.18 : 0.13) * tyreScale(style?.tyre);
  const wheelYRef = useRef([0, 0, 0, 0].map(() => -0.05 - car.settle + wheelR));

  const teleport = (x, y, z, rotY) => {
    const body = rb.current;
    if (!body) return;
    body.setTranslation({ x, y, z }, true);
    _q.setFromAxisAngle(_up.set(0, 1, 0), rotY || 0);
    body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    S.postHSpeed = -1; // a teleport's speed change is not a crash
    S.drift = newDriftState(); // nor does a drift survive one
    S.camReset = true; // …nor should the lens sweep across the map after it
    S.pvx = undefined; // and the jump is no acceleration
  };
  // headless testing / screenshots, alongside window.__rcTelemetry: park the
  // car at (x, z) meters facing rotY — optionally dropped from y (world units)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__rcTeleport = (x, z, rotY = 0, y) => teleport(x * M, y ?? SPAWN_Y, z * M, rotY);
    return () => { delete window.__rcTeleport; };
  });

  // The lens probe every camera uses (carView.js): one ray from the origin to
  // the lens against fixed colliders, one against big loose props, never our
  // own car. → the share of the way the lens may go, stopping 0.15 short of
  // whatever is in the way but never closer than 0.45 to the origin.
  useEffect(() => {
    let ray = null;
    setCamProbe((ox, oy, oz, tx, ty, tz) => {
      const dx = tx - ox, dy = ty - oy, dz = tz - oz;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.46) return 1;
      ray ||= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      ray.origin.x = ox; ray.origin.y = oy; ray.origin.z = oz;
      ray.dir.x = dx / len; ray.dir.y = dy / len; ray.dir.z = dz / len;
      const body = rb.current || undefined;
      const wall = world.castRay(ray, len, true, CAM_BLOCKERS, undefined, undefined, body);
      const prop = world.castRay(ray, len, true, CAM_PROPS, undefined, undefined, body, isBigProp);
      const t = Math.min(wall ? wall.timeOfImpact ?? wall.toi : Infinity, prop ? prop.timeOfImpact ?? prop.toi : Infinity);
      return Number.isFinite(t) ? Math.min(1, Math.max(0.45, t - 0.15) / len) : 1;
    });
    return () => { setCamProbe(null); bigProp.clear(); };
  }, [world, rapier]);

  // Ask the server for a respawn. It scores the spawn slots (races get our
  // safe-pose proposal instead) and answers with RESPAWN_AT → we teleport,
  // frozen briefly, spawn-protected for a couple of seconds. If the socket is
  // down we fall back to the old local teleport so solo play still recovers.
  const respawn = () => {
    const nowMs = performance.now();
    if (S.pendingRespawnAt && nowMs - S.pendingRespawnAt < 1400) return;
    if (net.ws && net.ws.readyState === 1) {
      S.pendingRespawnAt = nowMs;
      send({ t: MSG.RESPAWN, safe: S.safePoses.length ? S.safePoses[0] : null });
    } else {
      const SP = currentMap().SPAWNS;
      const sp = SP[net.spawnIndex % SP.length];
      teleport(sp.x, SPAWN_Y, sp.z, sp.rotY);
      S.boost = Math.max(S.boost, 40);
    }
  };

  // spawnIndex is GLOBAL join order and teams alternate by it, so a team's
  // members hold every other index — indexing the 6 team spots by it
  // repeats once a team has 4+ members, teleporting teammates into the same
  // spot (two overlapping bodies explode at GO). Use the player's ordinal
  // within their own team: unique per team, and identical on every client
  // (and the server, which places bots the same way) since the teams arrive
  // in the same order everywhere.
  const myKickoff = () => {
    const team = net.teams[net.myId] || 0;
    const ord = Object.keys(net.teams).filter((id) => (net.teams[id] || 0) === team).indexOf(net.myId);
    return soccerKickoff(currentMap(), team, ord >= 0 ? ord : net.spawnIndex);
  };

  // ------------------------------------------------ server events → physics
  useEffect(() => {
    const offs = [
      on('match_start', () => {
        const st = useStore.getState();
        if (st.modeId === 'soccer') {
          const sp = myKickoff();
          teleport(sp.x, SPAWN_Y, sp.z, sp.rotY);
        } else {
          // the grid faces the lap's first checkpoint: north for a reverse race
          const sp = raceSpawn(net.spawnIndex, st.modeId === 'desk_dash' ? st.variant : 'classic', currentMap());
          teleport(sp.x, SPAWN_Y, sp.z, sp.rotY);
        }
        S.boost = BOOST_MAX;
        S.stunnedUntil = 0;
        S.frozenUntil = 0;
        S.protectUntil = 0;
        S.pendingRespawnAt = 0;
        S.safePoses.length = 0;
        S.selfBump.clear();
        S.fallCamUntil = 0;
        rb.current?.setGravityScale(1, true); // back from the ghost realm
      }),
      on('respawn_at', (msg) => {
        teleport(msg.x, Math.max(SPAWN_Y, msg.y ?? SPAWN_Y), msg.z, msg.rotY);
        // a car put into play is never a weightless ghost: an LCS ghost that
        // reconnected into a later match came back on a WELCOME spawn with
        // gravity still off, and only a START ever turned it on again
        if (!useStore.getState().spectating) rb.current?.setGravityScale(1, true);
        const nowMs = performance.now();
        S.pendingRespawnAt = 0;
        S.frozenUntil = nowMs + (msg.freeze || 0);
        S.protectUntil = nowMs + (msg.freeze || 0) + (msg.protect || 0);
        S.boost = Math.max(S.boost, 40);
        S.upsideDownTime = 0;
        S.safePoses.length = 0;
      }),
      on('fx', (fx) => {
        const me = net.myId;
        const body = rb.current;
        if (!body) return;
        switch (fx.type) {
          case 'turbo':
            if (fx.id === me) {
              S.boost = BOOST_MAX;
              audio.boostFire();
              const r = body.rotation();
              _q.set(r.x, r.y, r.z, r.w);
              _fwd.set(0, 0, 1).applyQuaternion(_q);
              body.applyImpulse({ x: _fwd.x * mass * 9, y: 0, z: _fwd.z * mass * 9 }, true);
              S.postHSpeed = -1; // our own impulse, not a crash
            }
            break;
          case 'spring':
            if (fx.id === me) {
              body.applyImpulse({ x: 0, y: mass * fx.impulse, z: 0 }, true);
              S.postHSpeed = -1; // our own impulse, not a crash
              audio.jump();
              S.shake = Math.max(S.shake, 0.5);
              rumble(0.4, 120);
            }
            break;
          case 'emp':
            if (fx.targets?.includes(me)) {
              S.stunnedUntil = performance.now() + fx.stunMs;
              audio.stun();
              S.shake = Math.max(S.shake, 0.7);
              rumble(0.6, 300);
            }
            break;
          case 'rocket_hit':
            if (fx.target === me && !fx.blocked) {
              S.stunnedUntil = performance.now() + fx.stunMs;
              body.applyImpulse({ x: (Math.random() - 0.5) * 90, y: mass * 9, z: (Math.random() - 0.5) * 90 }, true);
              S.postHSpeed = -1; // our own impulse, not a crash
              audio.stun();
              S.shake = 1;
              S.fovPunch = Math.max(S.fovPunch, 6);
              rumble(1, 350);
              audio.duck(0.5, 0.2, 0.9);
            }
            if (fx.at) {
              burst(fx.at, { count: fx.blocked ? 10 : 30, color: ['#ffb347', '#ff5c33', '#ffe27a'], speed: 12, size: 0.18, ttl: 0.8, kind: 'spark' });
              for (let i = 0; i < (fx.blocked ? 2 : 6); i++) {
                smoke(fx.at, [(Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3], { size: 0.25, grow: 3.5, ttl: 1.4, color: '#5a5550', alpha: 0.4, rise: 1.2 });
              }
            }
            break;
          case 'robot_hit':
            if (fx.target === me) {
              S.stunnedUntil = performance.now() + 1400;
              body.applyImpulse({ x: (Math.random() - 0.5) * 120, y: mass * 7, z: (Math.random() - 0.5) * 120 }, true);
              S.postHSpeed = -1; // our own impulse, not a crash
              audio.stun();
              S.shake = 0.8;
              S.fovPunch = Math.max(S.fovPunch, 5);
              rumble(0.9, 300);
            }
            break;
          case 'swap':
            if (fx.a === me) teleport(fx.pa[0], fx.pa[1] + 0.5, fx.pa[2], fx.ra || 0);
            if (fx.b === me) teleport(fx.pb[0], fx.pb[1] + 0.5, fx.pb[2], fx.rb || 0);
            if (fx.a === me || fx.b === me) {
              S.shake = 0.6;
              // the server dropped its record of our old ground; so do we, or
              // the next respawn proposes a spot it can't match (→ the grid)
              S.safePoses.length = 0;
              S.lastSafeAt = 0;
            }
            break;
          case 'shield':
            if (fx.id === me) S.shieldUntil = performance.now() + (fx.until - Date.now());
            break;
          case 'shield_pop':
            if (fx.id === me) S.shieldUntil = 0;
            break;
          case 'shrink':
            if (fx.target === me) S.shrinkUntil = performance.now() + (fx.until - Date.now());
            break;
          case 'goal':
            S.shake = Math.max(S.shake, 0.5);
            audio.goal();
            audio.duck(0.5, 0.5, 1.2);
            break;
          case 'bump': {
            if (fx.a !== me && fx.b !== me) {
              // spectator view of someone else's collision: sparks at impact
              if (fx.kind === 'hit' && fx.at) {
                burst([fx.at[0], (fx.at[1] || 0) + 0.3, fx.at[2]], { count: 10, color: ['#ffe27a', '#ffb347', '#ffffff'], speed: 6, size: 0.07, ttl: 0.4, up: 2, kind: 'spark' });
                audio.impact(0.45, fx.at); // placed in the world: the panner does distance and side
              }
              break;
            }
            if (fx.kind === 'rub') { S.shake = Math.max(S.shake, 0.1); break; }
            // Ram Mode: the rammer doesn't even feel it
            if (fx.ram === me) { S.shake = Math.max(S.shake, 0.15); break; }
            // shake scales with the server-computed relative speed, and a
            // really big shunt gets an extra meaty clonk on top of the
            // collision sound both clients already played
            S.shake = Math.max(S.shake, Math.min(1, 0.25 + (fx.rel || 0) * 0.02));
            if ((fx.rel || 0) > 16) audio.impact(Math.min(1, fx.rel / 30));
            const nowMs = performance.now();
            const otherId = fx.a === me ? fx.b : fx.a;
            const ramBoost = fx.ram === otherId ? 2.2 : 1;
            // If we already applied this knockback locally at contact time,
            // the server echo is confirmation only — don't double-shove.
            // Being hit by an active Ram Mode always lands in full.
            if (ramBoost === 1 && nowMs - (S.selfBump.get(otherId) || 0) < 900) break;
            if (nowMs < S.protectUntil) break;
            // (below the echo check: a hit we already felt locally doesn't
            // punch and buzz a second time one round-trip later)
            S.fovPunch = Math.max(S.fovPunch, Math.min(5, 1.5 + (fx.rel || 0) * 0.12));
            rumble(Math.min(1, 0.35 + (fx.rel || 0) * 0.025), 160);
            if ((fx.rel || 0) > 16) audio.duck(0.3, 0.1, 0.6);
            // Mass-scaled knockback: getting hit by a Micro Monster hurts,
            // getting hit by a Formula barely rocks you.
            const otherPos = fx.a === me ? fx.pb : fx.pa;
            if (otherPos) {
              const ratio = Math.min(1.8, Math.max(0.55, remoteMass(otherId) / car.mass));
              const p = body.translation();
              const dx = p.x - otherPos[0], dz = p.z - otherPos[2];
              const len = Math.hypot(dx, dz) || 1;
              body.applyImpulse({ x: (dx / len) * mass * 3.2 * ratio * ramBoost, y: mass * 1.1 * ramBoost, z: (dz / len) * mass * 3.2 * ratio * ramBoost }, true);
              S.postHSpeed = -1; // our own impulse, not a crash
            }
            break;
          }
          case 'tag':
            if (fx.id === me) {
              S.shake = Math.max(S.shake, 0.4);
              audio.blip(880, 0.25, 0.25);
            }
            break;
          case 'sumo_out':
            if (fx.id === me) {
              S.shake = Math.max(S.shake, 0.8);
              audio.stun();
              rumble(0.8, 250);
            }
            break;
          case 'sumo_round':
            audio.blip(660, 0.15, 0.2);
            break;
          case 'zone_hop':
            audio.blip(520, 0.12, 0.18);
            break;
          case 'fake':
            if (fx.id === me) audio.blip(180, 0.3, 0.2);
            break;
          case 'ability':
            // my ability fired (server already checked the cooldown)
            if (fx.id === me) {
              const nowP = performance.now();
              audio.boostFire();
              switch (fx.car) {
                case 'buggy': { // Pounce: a forward dive
                  const r = body.rotation();
                  _q.set(r.x, r.y, r.z, r.w);
                  _fwd.set(0, 0, 1).applyQuaternion(_q);
                  body.applyImpulse({ x: _fwd.x * mass * 10, y: mass * 6.5, z: _fwd.z * mass * 10 }, true);
                  S.postHSpeed = -1; // our own impulse, not a crash
                  break;
                }
                case 'drift': S.overdriftUntil = nowP + ABILITY_FX.OVERDRIFT_S * 1000; break;
                case 'monster': S.ramUntil = nowP + ABILITY_FX.RAM_S * 1000; S.shake = Math.max(S.shake, 0.4); break;
                case 'formula': S.drsUntil = nowP + ABILITY_FX.DRS_S * 1000; break;
                default: break;
              }
            }
            break;
          case 'eliminated':
            // zap sparks where they went down; if it's me, park the car in
            // the ghost realm — SpectatorCam takes the camera from here
            if (fx.at) burst(fx.at, { count: 26, color: ['#ff5f6b', '#ffe27a', '#fff'], speed: 9, size: 0.14, ttl: 0.9, kind: 'spark' });
            if (fx.id === me) {
              audio.zap();
              audio.duck(0.7, 0.8, 1.6);
              S.shake = 0;
              S.fallCamUntil = 0;
              body.setGravityScale(0, true);
              teleport(0, -40, 0, 0);
            }
            break;
          case 'bean':
            if (fx.id === me) audio.pickup();
            break;
          case 'deliver':
            if (fx.id === me) audio.deliver();
            break;
          default: break;
        }
      }),
      on('pickup', () => audio.pickup()),
      on('office_event', (ev) => {
        if (ev.id === 'earthquake') S.shake = Math.max(S.shake, 0.6);
      }),
    ];
    return () => offs.forEach((f) => f());
  }, []);

  // Forces run per PHYSICS STEP (fixed dt) so handling is framerate-independent.
  useBeforePhysicsStep(() => {
    const map = currentMap();
    const body = rb.current;
    if (!body) return;
    const dt = PHYS_TIMESTEP;
    const nowMs = performance.now();
    const st = useStore.getState();
    if (st.spectating) {
      // ghosts are parked; no forces, no inputs. A drop-in that arrives
      // already out never saw its 'eliminated' effect, so park it here.
      if (body.gravityScale() !== 0) { body.setGravityScale(0, true); teleport(0, -40, 0, 0); }
      return;
    }
    const k = keys.current;
    k.poll?.(); // refresh gamepad axes/buttons once per physics step

    const pos = body.translation();
    const rot = body.rotation();
    const vel = body.linvel();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _v.set(vel.x, vel.y, vel.z);
    const fwdSpeed = _v.dot(_fwd);
    S.speed = _v.length();
    speedRef.current = fwdSpeed;
    // Acceleration in the car's own frame, measured per physics step (fixed
    // dt): what the last step's forces and contacts actually did. The body
    // lean, the antenna, the heave and the camera surge all read it. Measured
    // per render frame it was spiky — at 144 Hz most frames hold no step
    // (reads 0) and the rest hold one (reads 2.4× too much).
    if (S.pvx !== undefined) {
      const clampA = (n) => Math.max(-60, Math.min(60, n));
      const ax = (vel.x - S.pvx) / dt, ay = (vel.y - S.pvy) / dt, az = (vel.z - S.pvz) / dt;
      const L = leanRef.current;
      L.aLat = clampA(ax * _right.x + az * _right.z);
      L.aLong = clampA(ax * _fwd.x + az * _fwd.z);
      L.aUp = clampA(ay);
    }
    S.pvx = vel.x; S.pvy = vel.y; S.pvz = vel.z;

    // ---------------- suspension: 4 rays along car-down
    // The Ray is built once and re-aimed per wheel: four allocations every
    // physics step is 240/s of pure GC pressure in the hottest loop we have.
    let groundedWheels = 0;
    // floor-ish contact normal sum: the self-righting reference. Wall hits
    // (near-horizontal normals) are excluded so leaning on a skirting board
    // doesn't read as "the ground is sideways".
    let gnX = 0, gnY = 0, gnZ = 0;
    const ray = _ray.current || (_ray.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
    ray.dir.x = -_up.x; ray.dir.y = -_up.y; ray.dir.z = -_up.z;
    for (let wi = 0; wi < WHEELS.length; wi++) {
      const [wx, wy, wz] = WHEELS[wi];
      _corner.set(wx, wy, wz).applyQuaternion(_q);
      _p.set(pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z);
      ray.origin.x = _p.x; ray.origin.y = _p.y; ray.origin.z = _p.z;
      const hit = world.castRayAndGetNormal(ray, SUSPENSION_REST + 0.15, true, undefined, undefined, undefined, body);
      // wheel visual sits where the ray hit (or droops at full travel in the air)
      wheelYRef.current[wi] = wy - (hit ? Math.min(hit.timeOfImpact ?? hit.toi, SUSPENSION_REST + 0.1) : SUSPENSION_REST * 0.8) + wheelR;
      S.groundY[wi] = hit ? _p.y + ray.dir.y * (hit.timeOfImpact ?? hit.toi) : pos.y - 0.3;
      if (hit) {
        // the floor under this wheel isn't perfectly flat: grout grooves,
        // plank seams and pile (shared/src/surfaces.js). Only on the floor
        // itself — a ramp or a desk top has no grout.
        let len = hit.timeOfImpact ?? hit.toi;
        const hitY = _p.y + ray.dir.y * len;
        if (Math.abs(hitY) < 0.08) {
          const wx = _p.x + ray.dir.x * len, wz = _p.z + ray.dir.z * len;
          const surf = surfaceAt(wx, wz, map);
          len -= floorHeight(surf, wx, wz);
          if (wi === 0) S.wheelSurf = surf; // front-left wheel: seam clicks
        } else if (wi === 0) S.wheelSurf = null;
        // the drawn wheel follows the floor it's really on — into the grout too
        wheelYRef.current[wi] = wy - Math.min(len, SUSPENSION_REST + 0.1) + wheelR;
        groundedWheels++;
        if (hit.normal && hit.normal.y > 0.3) { gnX += hit.normal.x; gnY += hit.normal.y; gnZ += hit.normal.z; }
        const compression = 1 - len / SUSPENSION_REST;
        // point velocity along suspension
        const pv = body.velocityAtPoint ? body.velocityAtPoint({ x: _p.x, y: _p.y, z: _p.z }) : vel;
        const velAlong = pv.x * _up.x + pv.y * _up.y + pv.z * _up.z;
        // spring/damper rates carry the suspension notch: stiff springs turn in
        // harder and skip over bumps, soft springs soak up desk edges
        let f = (SUSPENSION_STIFFNESS * car.springMul * compression
          - SUSPENSION_DAMPING * car.dampMul * velAlong) * (mass / 4);
        f = Math.max(0, Math.min(f, mass * 90));
        body.applyImpulseAtPoint(
          { x: _up.x * f * dt, y: _up.y * f * dt, z: _up.z * f * dt },
          { x: _p.x, y: _p.y, z: _p.z }, true,
        );
      }
    }
    const grounded = groundedWheels >= 2;
    const wasGrounded = S.grounded;
    // grout/plank crossings, counted per physics step so none are skipped at speed
    {
      const cell = S.wheelSurf ? seamCell(S.wheelSurf, pos.x, pos.z) : null;
      if (cell !== null && S.lastSeam != null && cell !== S.lastSeam) S.seamHits = (S.seamHits || 0) + 1;
      S.lastSeam = cell;
    }
    S.grounded = grounded;
    if (!grounded) { skid(0, null, 0); skid(1, null, 0); }
    // ---------------- landings & impacts: feedback only, no forces
    // Landing: first grounded step after real air time, scored on the fall
    // speed we arrived with. Impact: horizontal speed the contact solver took
    // away since the end of our last step (our own brake/grip/drag already
    // happened by then, so they can't read as a crash — see feel.js).
    const groundSpeed = Math.hypot(vel.x, vel.z);
    let landing = 0;
    if (grounded && !wasGrounded) {
      landing = landingStrength(vel.y, S.sinceGrounded || 0);
      if (landing > 0) {
        S.squash = Math.max(S.squash, landing);
        S.camDip = Math.max(S.camDip, landing);
        S.shake = Math.max(S.shake, 0.12 + landing * 0.35);
        // a ring of dust kicked out from under the car, and a few grains
        const gy = (S.groundY[0] + S.groundY[1] + S.groundY[2] + S.groundY[3]) / 4;
        const [tint] = SMOKE_TINT[S.wheelSurf?.id] || SMOKE_DEFAULT;
        const n = Math.round(5 + landing * 7);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
          const sp = 1.2 + landing * 3;
          smoke([pos.x + Math.cos(a) * 0.35, gy + 0.05, pos.z + Math.sin(a) * 0.45], [Math.cos(a) * sp, 0.2, Math.sin(a) * sp],
            { size: 0.12, grow: 3.2, ttl: 0.9, color: tint, alpha: 0.18 + landing * 0.16, floor: gy, drag: 0.04, rise: 0.25, jitter: 0.3 });
        }
        burst([pos.x, gy + 0.05, pos.z], { count: Math.round(2 + landing * 6), color: DUST, speed: 2 + landing * 4, size: 0.05, ttl: 0.55, up: 0.9, gravity: 0.4 });
        audio.thud(landing);
        if (landing > 0.7) audio.duck(0.25, 0.08, 0.5);
        rumble(0.25 + landing * 0.6, 90 + landing * 120);
      }
    }
    if (S.postHSpeed >= 0 && !landing && nowMs - S.lastImpactAt > 180 && nowMs - S.lastBumpSend > 200) {
      const hit = impactStrength(S.postHSpeed, groundSpeed);
      if (hit > 0) {
        S.lastImpactAt = nowMs;
        S.shake = Math.max(S.shake, 0.18 + hit * 0.5);
        S.fovPunch = Math.max(S.fovPunch, 1 + hit * 4);
        // sparks where we were headed, i.e. at whatever stopped us
        const pl = S.postHSpeed || 1;
        burst([pos.x + (S.postVX / pl) * 0.55, pos.y + 0.1, pos.z + (S.postVZ / pl) * 0.55],
          { count: Math.round(4 + hit * 12), color: SPARKS, speed: 3 + hit * 5, size: 0.06, ttl: 0.35, up: 2, kind: 'spark' });
        audio.impact(0.3 + hit * 0.7);
        if (hit > 0.6) audio.duck(0.3, 0.1, 0.6);
        rumble(0.3 + hit * 0.7, 80 + hit * 140);
      }
    }
    if (grounded) {
      S.groundedTime += dt;
      S.sinceGrounded = 0;
    } else {
      S.groundedTime = 0;
      S.sinceGrounded = (S.sinceGrounded || 0) + dt;
    }

    // ---------------- grounded self-righting
    // Torque = K · (car-up × surface-normal): zero when the wheels point at
    // the surface, strongest at 90° out of shape. The alignment gate means a
    // car driving normally — flat floor, ramps, mid-corner weight transfer —
    // never feels it; a car that landed wedged on two wheels or a chassis
    // corner gets pushed back onto its tyres instead of balancing there.
    // Scaled by car mass so the Micro Monster rights as briskly as the
    // Formula (torque tracks inertia).
    if (grounded) {
      const nLen = Math.hypot(gnX, gnY, gnZ);
      // wheels only touching walls → fall back to world up as the reference
      _n.x = nLen > 0.1 ? gnX / nLen : 0;
      _n.y = nLen > 0.1 ? gnY / nLen : 1;
      _n.z = nLen > 0.1 ? gnZ / nLen : 0;
      if (_up.x * _n.x + _up.y * _n.y + _up.z * _n.z < UPRIGHT_GROUND_DOT) {
        rightingTorque(_up, _n, groundRightingK(car.mass) * dt, _torque);
        body.applyTorqueImpulse(_torque, true);
      }
    }

    const stunned = nowMs < S.stunnedUntil;
    // shrunk by a Shrink Ray (fx) or for the whole match by the Tiny Cars
    // mutator, which only ever arrived as the server's flag bit 16 — without
    // this your own car stayed full size while everyone else was tiny
    const shrunk = nowMs < S.shrinkUntil || !!((net.flags.get(net.myId) || 0) & 16);
    const frozen = (st.phase === PHASE.COUNTDOWN && Date.now() < st.countdownEnd) || nowMs < S.frozenUntil;
    const carrying = (net.flags.get(net.myId) || 0) & 32;

    // Safe-pose ring buffer: remember where we recently drove on solid ground
    // so a race respawn can put us right back instead of rooms away.
    if (grounded && S.groundedTime > SAFE_POSE_MIN_GROUNDED_S && pos.y > -0.5
        && nowMs - S.lastSafeAt > SAFE_POSE_INTERVAL_MS) {
      S.lastSafeAt = nowMs;
      S.safePoses.push([
        Math.round(pos.x * 100) / 100,
        Math.round(pos.z * 100) / 100,
        Math.round(Math.atan2(_fwd.x, _fwd.z) * 100) / 100,
        // the height too: a pose on a counter top is ON the counter, and put
        // back at floor height it is inside it
        Math.round(pos.y * 100) / 100,
      ]);
      if (S.safePoses.length > SAFE_POSE_BUFFER) S.safePoses.shift();
    }

    // ---------------- the floor: carpet grips but drags, hardwood is quick
    // but slides (shared/src/surfaces.js) — only while actually on it
    const floorSurf = grounded && pos.y < 0.9 ? SURFACES[surfaceAt(pos.x, pos.z, map).id] || SURFACES.concrete : null;
    telemetry.surface = floorSurf ? floorSurf.name : null;

    // ---------------- puddles & event modifiers
    let gripMul = floorSurf ? floorSurf.grip : 1, speedMul = floorSurf ? floorSurf.top : 1;
    for (const pu of net.puddles) {
      const d = Math.hypot(pos.x - pu.x, pos.z - pu.z);
      if (d < POWERUP_EFFECT.PUDDLE_RADIUS) {
        if (pu.kind === 'oil') gripMul = Math.min(gripMul, 0.1);
        else speedMul = Math.min(speedMul, 0.55);
      }
    }
    // the map's own zones (map.ZONES, world units): a patch of oil or a
    // puddle (grip), a conveyor belt that carries you (push, units/s), a
    // terrace gust on a cycle everyone shares (gust + period/dur seconds).
    // Each only acts between its y0..y1 (default: at floor level).
    for (const zn of map.ZONES || NO_ZONES) {
      if (Math.abs(pos.x - zn.x) > zn.w / 2 || Math.abs(pos.z - zn.z) > zn.d / 2) continue;
      if (pos.y < (zn.y0 ?? -1) || pos.y > (zn.y1 ?? 0.9)) continue;
      if (zn.grip != null && grounded) gripMul *= zn.grip;
      if (zn.top != null && grounded) speedMul *= zn.top;
      if (zn.push && grounded) {
        const tr = body.translation();
        body.setTranslation({ x: tr.x + zn.push[0] * dt, y: tr.y, z: tr.z + zn.push[1] * dt }, true);
      }
      // on the server's clock, so every player feels the same gust at once
      if (zn.gust && ((performance.now() + net.clockOffset) / 1000) % (zn.period || 15) < (zn.dur || 3)) {
        body.applyImpulse({ x: zn.gust[0] * dt * mass * 0.12, y: 0, z: zn.gust[1] * dt * mass * 0.12 }, true);
      }
    }
    if (shrunk) speedMul *= 0.85;
    if (carrying) speedMul *= BATTERY_SPEED_PENALTY;
    const ev = st.event;
    if (ev?.id === 'sprinklers') gripMul = Math.min(gripMul, 0.45); // soaked floors
    if (ev?.id === 'ac_wind') {
      S.windPhase += dt;
      const wind = Math.sin(S.windPhase * 0.7) * 26 + 14;
      body.applyImpulse({ x: wind * dt * mass * 0.12, y: 0, z: Math.cos(S.windPhase * 0.5) * 18 * dt * mass * 0.12 }, true);
    }
    if (ev?.id === 'earthquake' && grounded) {
      S.shake = Math.max(S.shake, 0.25);
      if (Math.random() < 0.06) {
        body.applyImpulse({ x: (Math.random() - 0.5) * mass * 6, y: Math.random() * mass * 4, z: (Math.random() - 0.5) * mass * 6 }, true);
      }
    }

    // ---------------- driving
    // Inputs: keyboard is digital, gamepad axes (when present) are analog.
    const gpSteer = Math.abs(k.gpSteer || 0) > 0.12 ? -k.gpSteer : 0;
    let throttleIn = (k.fwd ? 1 : 0) - (k.back ? 1 : 0) + (k.gpThrottle || 0) - (k.gpBrake || 0);
    if (st.autoGas && throttleIn === 0) throttleIn = 1; // auto-gas assist
    throttleIn = Math.max(-1, Math.min(1, throttleIn));
    const throttle = frozen || stunned ? 0 : throttleIn;
    const steerIn = gpSteer !== 0 ? gpSteer : (k.left ? 1 : 0) - (k.right ? 1 : 0);
    const steer = frozen || stunned ? 0 : steerIn;
    const driftHeld = k.drift || k.gpDrift;
    const drifting = isDrifting(S.drift, driftHeld, grounded, fwdSpeed, groundSpeed);
    S.driftTime = drifting ? S.driftTime + dt : 0;
    steerRef.current += (steer - steerRef.current) * Math.min(1, dt * 10);

    if (grounded && !frozen) {
      // DRS: open rear wing, higher speed ceiling + a push while it lasts
      const drs = nowMs < S.drsUntil;
      const top = car.topSpeed * speedMul * (drs ? ABILITY_FX.DRS_TOP_MULT : 1);
      if (drs && throttle > 0 && fwdSpeed < top) {
        body.applyImpulse({ x: _fwd.x * car.boost * 0.5 * mass * dt, y: 0, z: _fwd.z * car.boost * 0.5 * mass * dt }, true);
      }
      // brakes ≫ coast: holding back against forward motion stops you hard
      const braking = throttle < 0 && fwdSpeed > 1.5;
      if (braking) {
        const decel = brakeDecel(fwdSpeed, car.accel, -throttle, dt);
        body.applyImpulse({ x: -_fwd.x * decel * mass * dt, y: 0, z: -_fwd.z * decel * mass * dt }, true);
      } else if (throttle !== 0) {
        const overspeed = throttle > 0 ? fwdSpeed > top : fwdSpeed < -top * 0.5;
        if (!overspeed) {
          const f = car.accel * mass * throttle * (drifting ? 0.85 : 1);
          // full 3D forward: on a ramp the car pushes UP the slope instead of
          // grinding horizontally into it
          body.applyImpulse({ x: _fwd.x * f * dt, y: _fwd.y * f * dt, z: _fwd.z * f * dt }, true);
        }
      }
      // slope assist: while on throttle, cancel most of the gravity component
      // that acts along the surface — ramps stay climbable at any grade
      if (throttle > 0 && _up.y < 0.985) {
        const gAlongX = -GRAVITY * _up.y * _up.x;
        const gAlongY = GRAVITY - GRAVITY * _up.y * _up.y;
        const gAlongZ = -GRAVITY * _up.y * _up.z;
        body.applyImpulse({
          x: -gAlongX * SLOPE_ASSIST * mass * dt,
          y: -gAlongY * SLOPE_ASSIST * mass * dt,
          z: -gAlongZ * SLOPE_ASSIST * mass * dt,
        }, true);
      }
      // steering: bias angular velocity toward target yaw rate.
      // throttle guarantees a minimum turn rate so you can pivot from rest.
      const effSpeed = Math.max(Math.abs(fwdSpeed), throttle !== 0 ? 7 : 0);
      const speedFactor = Math.min(1, effSpeed / 10);
      const dir = fwdSpeed < -1 ? -1 : 1;
      const latVel = _v.dot(_right);
      // counter-steer = steering into the slide; it always works at full rate
      // and gets a grip bonus so slides are catchable
      const counterSteer = steer * latVel > 1.5;
      // high-speed steering fade: full lock at top speed just scrubs — taper
      // it (except while drifting or counter-steering)
      let fade = 1;
      if (!drifting && !counterSteer) {
        const s = Math.max(0, Math.min(1, (Math.abs(fwdSpeed) / car.topSpeed - 0.55) / 0.55));
        fade = 1 - 0.35 * s * s * (3 - 2 * s);
      }
      const yawTarget = steer * car.handling * speedFactor * fade * dir * (drifting ? 1.45 : 1);
      // snappy steering response — tight corners need the yaw rate NOW.
      // Re-read angvel here: `ang` is from the top of the step, and writing it
      // back would erase the roll/pitch impulses the suspension (and the
      // self-righting torque) applied since — the original "car stays tilted"
      // glitch, where the springs pushed but the steering write undid them.
      const angNow = body.angvel();
      const newAngY = angNow.y + (yawTarget - angNow.y) * Math.min(1, dt * 14);
      body.setAngvel({ x: angNow.x, y: newAngY, z: angNow.z }, true);
      // lateral grip (Overdrift: sideways but never out of control)
      const overdrift = nowMs < S.overdriftUntil;
      const grip = car.grip * (drifting ? car.drift * (overdrift ? 1.6 : 1) : 1) * gripMul * (counterSteer && !drifting ? 1.25 : 1);
      const gripImpulse = -latVel * grip * mass * Math.min(1, dt * 12);
      body.applyImpulse({ x: _right.x * gripImpulse, y: 0, z: _right.z * gripImpulse }, true);
      S.slipping = Math.abs(latVel) > 6 || (drifting && Math.abs(fwdSpeed) > 12);
      // rolling resistance + parking brake: real deceleration off-throttle,
      // and below walking pace the car is pinned so it never creeps on its own
      if (throttle === 0) {
        const drag = COAST_DRAG * (floorSurf ? floorSurf.drag : 1); // carpet pile stops you sooner
        body.applyImpulse({ x: -_v.x * mass * drag * dt, y: 0, z: -_v.z * mass * drag * dt }, true);
        const hSpeed = Math.hypot(_v.x, _v.z);
        // the upright gate matters: zeroing horizontal velocity on a TILTED
        // car freezes the fall the self-righting torque is trying to finish —
        // the car would balance on two wheels forever
        if (hSpeed < 1.2 && !drifting && gripMul > 0.5 && _up.y > PARK_BRAKE_MIN_UP) {
          const damp = hSpeed < 0.15 ? 0 : 0.7; // full stop once it's basically stopped
          body.setLinvel({ x: _v.x * damp, y: vel.y, z: _v.z * damp }, true);
        }
      }
      // drift charge — faster while actively steering the drift. Spark color
      // on the rear wheels tells you the tier you've earned; each new tier
      // also chimes and flares so you can feel it without looking down.
      const dr = driftStep(S.drift, { drifting, driftHeld, grounded, steering: steer !== 0, overdrift }, dt);
      if (dr.tierUp) {
        audio.driftTier(dr.tierUp);
        rumble(0.12 + dr.tierUp * 0.08, 50);
        for (const rear of [WHEELS[2], WHEELS[3]]) {
          _corner.set(rear[0], rear[1] - 0.05, rear[2]).applyQuaternion(_q);
          burst([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z],
            { count: 5 + dr.tierUp * 2, color: DRIFT_TIER_COLORS[dr.tierUp - 1], speed: 3.5, size: 0.07, ttl: 0.4, up: 2.2, kind: 'spark' });
        }
      }
      if (drifting) {
        const tier = driftTier(S.drift.charge);
        if (tier > 0 && Math.random() < 0.55) {
          for (const rear of [WHEELS[2], WHEELS[3]]) {
            _corner.set(rear[0], rear[1] - 0.08, rear[2]).applyQuaternion(_q);
            burst([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z],
              { count: 1, color: DRIFT_TIER_COLORS[tier - 1], speed: 2.5, size: 0.055, ttl: 0.3, up: 1.5, kind: 'spark' });
          }
        }
      }
      // mini-turbo fires on drift release, duration scales with tier reached
      if (dr.release) {
        const tier = dr.release;
        S.miniTurboUntil = nowMs + DRIFT_TIER_BOOST_S[tier - 1] * 1000;
        body.applyImpulse({ x: _fwd.x * mass * 3, y: 0, z: _fwd.z * mass * 3 }, true);
        burst([pos.x, pos.y + 0.2, pos.z], { count: 8 + tier * 6, color: DRIFT_TIER_COLORS[tier - 1], speed: 5, size: 0.08, ttl: 0.5, up: 2, kind: 'spark' });
        audio.boostFire();
        rumble(0.3 + tier * 0.15, 150);
        telemetry.miniTurbos++;
      }
      // tire smoke + skid marks on the floor. The smoke is laid ON the floor
      // under each rear tyre; ~33 puffs a second a wheel, each growing from a
      // tyre's width to most of a car, overlapping into one soft trail.
      if (S.slipping) {
        const [tint, a0] = SMOKE_TINT[S.wheelSurf?.id] || SMOKE_DEFAULT;
        [WHEELS[2], WHEELS[3]].forEach((rear, wi) => {
          _corner.set(rear[0], rear[1] - 0.1, rear[2]).applyQuaternion(_q);
          skid(wi, pos.x + _corner.x, pos.z + _corner.z);
          if (Math.random() < 0.55) {
            const gy = S.groundY[2 + wi];
            // it leaves with some of the car's speed and drags to a stop, so
            // the cloud rolls along behind the car for a beat instead of
            // being dropped where the camera passes straight through it
            smoke([pos.x + _corner.x, gy + 0.06, pos.z + _corner.z], [_v.x * 0.45, 0.25, _v.z * 0.45],
              { size: 0.2, grow: 5.2, ttl: 1.4, color: tint, alpha: a0 * (drifting ? 1 : 0.7), floor: gy, jitter: 0.9, drag: 0.08 });
          }
        });
      } else {
        skid(0, null, 0);
        skid(1, null, 0);
      }
    } else if (!grounded && !frozen && !stunned) {
      // airborne (off a ramp or a spring pad): no player spin — just level
      // the car toward wheels-down so every launch ends in a clean landing.
      // Mass-scaled: torque tracks inertia, so heavy cars level as fast as
      // light ones instead of landing on their lids.
      const K = airRightingK(car.mass);
      rightingTorque(_up, _worldUp, K * dt, _torque);
      body.applyTorqueImpulse(_torque, true);
      // dead flat on its roof, up × world-up ≈ 0 and the leveller stalls at
      // the unstable equilibrium — kick a roll about the nose to break it
      if (roofKickNeeded(_up)) {
        body.applyTorqueImpulse({ x: _fwd.x * K * 0.6 * dt, y: _fwd.y * K * 0.6 * dt, z: _fwd.z * K * 0.6 * dt }, true);
      }
    } else if (frozen && grounded) {
      // countdown: pin the car in place so it can't creep or slide off grid
      // (fresh angvel read — keep the suspension's roll/pitch response alive)
      const angNow = body.angvel();
      body.setLinvel({ x: _v.x * 0.6, y: vel.y, z: _v.z * 0.6 }, true);
      body.setAngvel({ x: angNow.x, y: 0, z: angNow.z }, true);
    }
    S.prevDrifting = drifting;
    // what the wheels show: the slip angle (the fronts counter-steer into a
    // slide) and rear-tyre surface speed over road speed — a launch lights
    // them up, a drift keeps them turning faster than the car goes
    {
      const L = leanRef.current;
      L.slip = grounded && fwdSpeed > 2 ? Math.atan2(_v.dot(_right), fwdSpeed) : 0;
      const launchTop = car.topSpeed * 0.4;
      const launch = throttle > 0 && fwdSpeed < launchTop ? (1 - Math.max(0, fwdSpeed) / launchTop) * 9 : 0;
      L.spin = grounded ? Math.max(launch, drifting ? 3 + Math.abs(fwdSpeed) * 0.5 : 0) : throttle > 0 ? 12 : 0;
    }
    // Off the grounded branch (airborne, or frozen) the drift session still
    // needs its step: holding drift over a ramp hop keeps the charge for the
    // landing, letting go in the air forfeits it.
    if (!(grounded && !frozen)) driftStep(S.drift, { drifting: false, driftHeld, grounded, steering: false, overdrift: false }, dt);

    // ---------------- slipstream: hold a rival's wake to earn a free burst
    if (grounded && !frozen && !stunned && S.speed > car.topSpeed * SLIPSTREAM.MIN_SPEED_FRAC) {
      let inWake = false;
      for (const id of net.remotes.keys()) {
        const r = sampleRemote(id);
        if (!r) continue;
        const dx = r.p[0] - pos.x, dz = r.p[2] - pos.z;
        const ahead = dx * _fwd.x + dz * _fwd.z;
        if (ahead < 1 || ahead > SLIPSTREAM.RANGE) continue;
        if (Math.abs(dx * _right.x + dz * _right.z) > SLIPSTREAM.LATERAL) continue;
        if (Math.abs((r.p[1] || 0) - pos.y) > 2) continue;
        inWake = true;
        break;
      }
      if (inWake) {
        S.slipT += dt;
        // wind streaks telegraph the charging draft
        if (Math.random() < 0.35) {
          _corner.set((Math.random() < 0.5 ? -1 : 1) * 0.45, 0.15, 0.6).applyQuaternion(_q);
          smoke([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z], [-_fwd.x * 4, 0.3, -_fwd.z * 4],
            { size: 0.05, grow: 3, ttl: 0.35, color: '#cfe4ff', alpha: 0.3, glow: 0.5, rise: 0, drag: 0.3, jitter: 0.3 });
        }
        if (S.slipT >= SLIPSTREAM.CHARGE_S && nowMs > S.slipCooldownUntil) {
          S.slipBoostUntil = nowMs + SLIPSTREAM.BOOST_S * 1000;
          S.slipCooldownUntil = nowMs + 5000;
          S.slipT = 0;
          st.pushFeed('💨 Slipstream!');
          audio.boostFire();
        }
      } else {
        S.slipT = Math.max(0, S.slipT - dt * 2);
      }
    } else {
      S.slipT = Math.max(0, S.slipT - dt * 2);
    }

    // ---------------- boost (capped so it can't stack speed forever).
    // Mini-turbo and slipstream bursts use the same engine, free of the meter.
    const wantBoost = (k.boost || k.gpBoost) && !frozen && !stunned;
    S.boosting = wantBoost && S.boost > 1;
    const freeBoost = !frozen && !stunned && (nowMs < S.miniTurboUntil || nowMs < S.slipBoostUntil);
    if (S.boosting || freeBoost) {
      if (S.boosting) S.boost = Math.max(0, S.boost - BOOST_DRAIN * dt);
      const f = fwdSpeed < car.topSpeed * BOOST_TOP_MULT ? car.boost * mass : 0;
      body.applyImpulse({ x: _fwd.x * f * dt, y: 0, z: _fwd.z * f * dt }, true);
      // exhaust: hot self-lit puffs left hanging in the car's wake
      if (Math.random() < 0.8) {
        _corner.set(0, 0.05, -0.55).applyQuaternion(_q);
        smoke([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z], [-_fwd.x * 3, 0.3, -_fwd.z * 3],
          { size: 0.07, grow: 3, ttl: 0.32, color: freeBoost && !S.boosting ? '#ffd27a' : '#7ab8ff', alpha: 0.5, glow: 1, rise: 0.2, drag: 0.05, jitter: 0.4 });
      }
    }
    if (!S.boosting && grounded) {
      S.boost = Math.min(BOOST_MAX, S.boost + BOOST_REGEN * dt);
    }

    // ---------------- safety rails
    // Speed-proportional downforce glues the car down at speed (pressed along
    // car-down so it also works on ramps).
    if (grounded) {
      const df = DOWNFORCE * car.downforceMul * Math.abs(fwdSpeed) * mass * dt;
      body.applyImpulse({ x: -_up.x * df, y: -_up.y * df, z: -_up.z * df }, true);
    }
    // Hard caps: no impulse stack (bump + rocket + spring + wind) may launch
    // the car past these — bounded chaos keeps the anti-teleport check happy.
    {
      const lv = body.linvel();
      const sp = Math.hypot(lv.x, lv.y, lv.z);
      if (sp > SPEED_HARD_CAP) {
        const s = SPEED_HARD_CAP / sp;
        body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
      }
      const av = body.angvel();
      const am = Math.hypot(av.x, av.y, av.z);
      if (am > ANGVEL_CAP) {
        const s = ANGVEL_CAP / am;
        body.setAngvel({ x: av.x * s, y: av.y * s, z: av.z * s }, true);
      }
      // what we handed the solver: next step's impact check measures from here
      const post = body.linvel();
      S.postHSpeed = Math.hypot(post.x, post.z);
      S.postVX = post.x; S.postVZ = post.z;
    }
    S.lastFwdSpeed = fwdSpeed;
    telemetry.boosting = S.boosting || freeBoost;
    telemetry.boostHeld = S.boosting; // the meter, not a free burst (driving test)
    telemetry.boost = S.boost;
    telemetry.speed = S.speed;
    telemetry.x = pos.x;
    telemetry.z = pos.z;
    telemetry.y = pos.y;
    telemetry.grounded = grounded;
    telemetry.heading = Math.atan2(_fwd.x, _fwd.z);
    telemetry.steer = steerRef.current; // +1 = left, smoothed like the wheels
    telemetry.throttle = throttle;
    boostingRef.current = S.boosting || freeBoost;

    // ---------------- stun visuals
    if (stunned && Math.random() < 0.4) {
      burst([pos.x, pos.y + 0.6, pos.z], { count: 2, color: '#ffe27a', speed: 3, size: 0.06, ttl: 0.3, up: 2, kind: 'spark' });
    }
    // Ram Mode: angry red wake
    if (nowMs < S.ramUntil && Math.random() < 0.6) {
      smoke([pos.x, pos.y + 0.3, pos.z], [(Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2],
        { size: 0.14, grow: 3, ttl: 0.5, color: '#ff4d3d', alpha: 0.35, glow: 1 });
    }

    // ---------------- upside-down & fall recovery
    // Recovery ladder (see shared/src/righting.js). Deeply inverted counts
    // fast — including while sliding on the roof at speed, which used to
    // reset the timer and turn a flip into a luge run. A moderate wedge
    // (tilted past ~44°, basically parked) counts at half rate as the
    // backstop for poses the righting torque can't win, like being jammed
    // nose-up between a desk and a wall.
    S.upsideDownTime = recoveryTick(S.upsideDownTime, _up.y, S.speed, dt);
    if (k.respawn || S.upsideDownTime > RECOVERY_AFTER_S) {
      k.respawn = false;
      S.upsideDownTime = 0;
      S.fallCamUntil = 0;
      respawn();
    } else if (pos.y < RESPAWN_Y) {
      // going over the edge is a MOMENT: scream, hold a seagull's-eye
      // kill-cam on the plummeting car, then respawn
      if (!S.fallCamUntil) {
        S.fallCamUntil = nowMs + 1500;
        audio.scream();
      } else if (nowMs > S.fallCamUntil) {
        S.fallCamUntil = 0;
        if (!st.spectating) respawn(); // eliminated ghosts stay dead
      }
    }
  });

  // Camera, audio, telemetry & network run per RENDER frame.
  useFrame((state, rawDt) => {
    const map = currentMap();
    const body = rb.current;
    if (!body) return;
    const dt = Math.min(rawDt, 1 / 20);
    const nowMs = performance.now();
    const st = useStore.getState();
    const pos = body.translation();
    const rot = body.rotation();
    const vel = body.linvel();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    const grounded = S.grounded;
    const stunned = nowMs < S.stunnedUntil;
    // shrunk by a Shrink Ray (fx) or for the whole match by the Tiny Cars
    // mutator, which only ever arrived as the server's flag bit 16 — without
    // this your own car stayed full size while everyone else was tiny
    const shrunk = nowMs < S.shrinkUntil || !!((net.flags.get(net.myId) || 0) & 16);
    const carrying = (net.flags.get(net.myId) || 0) & 32;
    const throttle = (keys.current.fwd ? 1 : 0) - (keys.current.back ? 1 : 0);
    const drifting = S.prevDrifting;

    // ---------------- the car as drawn
    // Rapier draws the body interpolated between physics steps; everything
    // that frames the car reads that pose, not the body's newest state (see
    // carView.js). Physics steps before this frame callback, so it is current.
    const vis = visual.current;
    if (vis) {
      vis.getWorldPosition(_anchor);
      vis.getWorldQuaternion(_aq);
      _vfwd.set(0, 0, 1).applyQuaternion(_aq);
    } else {
      _anchor.set(pos.x, pos.y, pos.z);
      _vfwd.copy(_fwd);
    }
    carView.x = _anchor.x; carView.y = _anchor.y; carView.z = _anchor.z;
    carView.yaw = Math.atan2(_vfwd.x, _vfwd.z);
    carView.ready = !st.spectating;

    // ---------------- camera (SpectatorCam owns it while eliminated)
    if (st.spectating) {
      audio.update({ speed: 0, throttle: 0, slipping: false, boosting: false, topSpeed: car.topSpeed });
      S.camReset = true;
      return;
    }
    if (S.fallCamUntil > nowMs && !st.photoMode) {
      // kill-cam: hover above the drop and watch the car plummet
      _camTarget.set(pos.x + 3.5, Math.max(pos.y + 16, 7), pos.z + 3.5);
      camera.position.lerp(_camTarget, 1 - Math.pow(0.005, dt));
      camera.lookAt(pos.x, pos.y, pos.z);
      S.camReset = true;
    } else if (!st.photoMode) {
      // The chase rig (numbers in shared/src/feel.js CHASE). The lens is
      // bolted to the car as drawn: only its heading and its height are
      // smoothed. The old rig lerped the lens POSITION toward a point behind
      // the car, and a lerp chasing a moving target trails it by v·τ — the
      // camera fell 1–3 u further back the faster you went and the car
      // shrank to a speck exactly when there was most to see.
      const kOf = (tau) => 1 - Math.exp(-Math.min(rawDt, 0.5) / tau); // framerate-independent
      const reset = S.camReset;
      const sf = Math.min(1, S.speed / car.topSpeed);
      const boostingNow = S.boosting || nowMs < S.miniTurboUntil || nowMs < S.slipBoostUntil;
      S.fov = reset ? chaseFov(sf, boostingNow, MOTION) : S.fov + (chaseFov(sf, boostingNow, MOTION) - S.fov) * kOf(0.2);
      const rig = chaseRig(sf, S.fov, _rig);
      // heading: behind the car, swung part-way toward the direction of
      // travel in a slide so a drift shows where you're going (feel.js), and
      // lagging the car's yaw a beat so a turn shows the car turning
      chaseHeading(_vfwd.x, _vfwd.z, vel.x, vel.z, _chase, CHASE.swing * MOTION);
      const yawT = Math.atan2(_chase[0], _chase[1]);
      S.camYaw = reset ? yawT : S.camYaw + wrapAngle(yawT - S.camYaw) * kOf(MOTION < 1 ? 0.05 : CHASE.yawTau);
      // height: soaks up suspension chatter on the ground; in the air the
      // lens lags a climb so a jump rises in frame, but follows a fall
      // briskly (lagging a drop would sink the car out of the bottom of the
      // frame) — and never loses the car either way
      const yT = _anchor.y + (grounded ? 0 : 0.15);
      const falling = yT < S.camY;
      S.camY = reset ? yT : S.camY + (yT - S.camY) * kOf(grounded ? CHASE.yTau : falling ? CHASE.yTau : CHASE.yTauAir);
      S.camY = Math.max(_anchor.y - 1, Math.min(_anchor.y + 0.5, S.camY));
      S.lookY = reset ? _anchor.y : S.lookY + (_anchor.y - S.lookY) * kOf(grounded || falling ? 0.05 : 0.12);
      // surge: the car pulls away under power, the lens closes in under
      // braking — from acceleration, so nothing trails at a steady speed
      S.aLongSm = reset ? 0 : S.aLongSm + ((leanRef.current.aLong || 0) - S.aLongSm) * kOf(CHASE.surgeTau);
      const surge = Math.max(CHASE.surgeMin, Math.min(CHASE.surgeMax, S.aLongSm * CHASE.surgeGain)) * MOTION;
      // a hard landing dips the camera with the car, then it recovers
      const dip = S.camDip * CHASE.dip * MOTION;
      S.camDip *= Math.pow(0.004, dt);
      const bx = Math.sin(S.camYaw), bz = Math.cos(S.camYaw);
      const dist = rig.dist + surge;
      _camPos.set(_anchor.x - bx * dist, S.camY + rig.height - dip, _anchor.z - bz * dist);
      // never below the car's own roofline (on a desk top as on the floor)
      _camPos.y = Math.max(_camPos.y, _anchor.y + 0.3);
      // ...and out of walls, furniture and big props. Pivot just above the
      // car; a ray to the lens; blocked, the lens snaps in to just short of
      // the obstacle, and eases back out (τ 0.35 s) once it's clear, so a
      // grazing edge or a passing chair can't make it pump. Pulled in hard,
      // the boom rises too: the view looks down over what's behind you
      // instead of into your own bumper.
      _pivot.set(_anchor.x, _anchor.y + 0.5, _anchor.z);
      const pullT = 1 - clearLens(_pivot.x, _pivot.y, _pivot.z, _camPos.x, _camPos.y, _camPos.z);
      S.camPull = reset || pullT > S.camPull ? pullT : S.camPull + (pullT - S.camPull) * kOf(0.35);
      if (S.camPull > 0.001) {
        const raise = 0.9 * Math.max(0, (S.camPull - 0.25) / 0.75);
        _camPos.sub(_pivot).multiplyScalar(1 - S.camPull).add(_pivot);
        _camPos.y += raise;
        // the raise (or a slow release) can reach round something the first
        // ray never saw: check the final lens too
        const f = clearLens(_pivot.x, _pivot.y, _pivot.z, _camPos.x, _camPos.y, _camPos.z);
        if (f < 1) _camPos.sub(_pivot).multiplyScalar(f).add(_pivot);
      }
      S.camReset = false;
      camera.position.copy(_camPos);
      telemetry.camDist = _camPos.distanceTo(_anchor); // focus distance for the depth of field
      // aim: ahead of the car, mostly along the lens heading and partly along
      // the nose, plus a little of where it's going. A lens pulled in by a
      // wall aims in by as much, or the car drops out of the bottom of the
      // frame just when the room is tight.
      const na = CHASE.noseAim;
      let ax = bx * (1 - na) + _vfwd.x * na, az = bz * (1 - na) + _vfwd.z * na;
      const al = Math.hypot(ax, az) || 1;
      ax /= al; az /= al;
      const reach = Math.max(0.35, Math.min(1, Math.hypot(_camPos.x - _anchor.x, _camPos.z - _anchor.z) / dist));
      _look.set(
        _anchor.x + (ax * rig.lookAhead + vel.x * CHASE.lookVel) * reach,
        S.lookY + rig.lookUp - dip * 0.3,
        _anchor.z + (az * rig.lookAhead + vel.z * CHASE.lookVel) * reach,
      );
      // trauma-style shake: amplitude ∝ shake², plus a rotational component —
      // rotation is what makes a shake read as force instead of glitch. The
      // aim point is closer than it was, so the same shove moves it less.
      const trauma = S.shake * S.shake * MOTION;
      if (S.shake > 0.01) {
        _look.x += (Math.random() - 0.5) * trauma * 1.1;
        _look.y += (Math.random() - 0.5) * trauma * 0.85;
        _look.z += (Math.random() - 0.5) * trauma * 1.1;
        S.shake *= Math.pow(0.02, dt);
      }
      camera.lookAt(_look);
      if (S.shake > 0.01) camera.rotateZ((Math.random() - 0.5) * trauma * 0.09);
      // a hit punches the lens in for a beat — outside the smoothing above,
      // so it lands on the frame of the hit and snaps back
      const fov = S.fov - S.fovPunch * MOTION;
      S.fovPunch *= Math.pow(0.001, dt);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    } else {
      S.camReset = true; // back from photo mode: no sweep from the orbit
    }

    // ---------------- body lean from measured acceleration
    // Weight transfer the suspension can't produce (every force is applied at
    // the centre of mass): the per-step acceleration (measured in the physics
    // step above) tilts the visual shell — outward roll in curves, squat on
    // throttle, dive on the brakes — about a low roll centre (CarModel), and
    // a bump sets the body bobbing on its springs. Decays to neutral.
    {
      const L = leanRef.current;
      leanTarget(L.aLat || 0, L.aLong || 0, grounded, _lean);
      const k = 1 - Math.exp(-dt * LEAN.rate);
      L.roll += (_lean.roll - L.roll) * k;
      L.pitch += (_lean.pitch - L.pitch) * k;
      // (not on a landing: the squash has that, and both at once sank the
      // shell into the floor on a hard one)
      L.heave = heaveStep(heave.current, grounded && S.squash < 0.05 ? L.aUp || 0 : 0, dt).y;
      telemetry.roll = L.roll;
      telemetry.pitch = L.pitch;
    }
    leanRef.current.squash = S.squash;
    S.squash *= Math.pow(0.0008, dt);

    // ---------------- audio
    audio.update({ speed: S.speed, throttle, slipping: S.slipping && grounded, boosting: S.boosting, topSpeed: car.topSpeed, surface: grounded ? S.wheelSurf?.id : null });
    // a click per seam crossed; on hardwood at speed the seams come too fast
    // to hear one by one and the rolling rumble carries them instead
    if ((S.seamHits || 0) > (S.seamHeard || 0)) {
      const n = S.seamHits - (S.seamHeard || 0);
      S.seamHeard = S.seamHits;
      if (n <= 2 && nowMs - (S.lastSeamSound || 0) > 35) {
        S.lastSeamSound = nowMs;
        audio.seam(S.wheelSurf?.id, S.speed / car.topSpeed);
      }
    }
    // the map's room tone (map.AMBIENCE): the office has rain on the glass,
    // the cellar only its ballast hum; a blackout kills anything electric
    const amb = map.AMBIENCE || { rain: true };
    const dark = st.event?.id === 'lights_out';
    audio.setRain(st.event?.id === 'sprinklers' ? 0.85 : amb.rain === false ? 0 : map.roomAt(pos.x, pos.z)?.outdoor ? 0.9 : st.night ? 0.35 : 0.15);
    audio.setBeds({ hum: dark ? 0 : amb.hum || 0, rumble: amb.rumble || 0, air: dark ? 0 : amb.air || 0 });

    // ---------------- network send
    if (nowMs - S.lastSend > 1000 / INPUT_SEND_RATE) {
      S.lastSend = nowMs;
      sendState(
        [pos.x, pos.y, pos.z].map((n) => Math.round(n * 100) / 100),
        [rot.x, rot.y, rot.z, rot.w].map((n) => Math.round(n * 1000) / 1000),
        [vel.x, vel.y, vel.z].map((n) => Math.round(n * 10) / 10),
        drifting, grounded, boostingRef.current,
      );
    }

    // visual: scale for shrink, body roll
    if (visual.current) {
      const targetScale = shrunk ? POWERUP_EFFECT.SHRINK_SCALE : 1;
      const cur = visual.current.scale.x;
      visual.current.scale.setScalar(cur + (targetScale - cur) * Math.min(1, dt * 6));
    }
    flagsRef.current = (nowMs < S.shieldUntil ? 8 : 0) | (carrying ? 32 : 0) | (stunned ? 4 : 0)
      | (nowMs < S.protectUntil ? 64 : 0);
  });

  // a mid-match drop-in starts where the server put it (WELCOME's spawn).
  // The pose is fixed for the car's lifetime: as a render-time value it
  // changed with the map at START, and rapier re-applied it right after
  // match_start had teleported the car, so every round on a new floor
  // began on grid slot 0 (at times facing backwards). Rounds place the car
  // with teleport(), never with these props.
  const [start] = useState(() => {
    const s = net.joinSpawn || { ...currentMap().SPAWNS[0], y: SPAWN_Y };
    return { position: [s.x, Math.max(SPAWN_Y, s.y), s.z], rotation: [0, s.rotY, 0] };
  });
  return (
    <>
      <RigidBody
        ref={rb}
        position={start.position}
        rotation={start.rotation}
        colliders={false}
        canSleep={false}
        ccd
        angularDamping={1.6}
        linearDamping={0.05}
        userData={ME}
        onCollisionEnter={(e) => {
          const other = e.other.rigidBody;
          const ud = other?.userData;
          const nowMs = performance.now();
          const body = rb.current;
          if (!body || !ud) return;
          if (ud.playerId && ud.playerId !== 'me') {
            // --- car contact
            if (nowMs - S.lastBumpSend > 350) {
              S.lastBumpSend = nowMs;
              send({ t: MSG.BUMP, target: ud.playerId });
            }
            // Classify locally (own velocity vs the remote's interpolated
            // velocity) and apply our own knockback NOW instead of waiting a
            // round-trip for the server echo — that echo is skipped later.
            const rv = remoteVelocity(ud.playerId) || [0, 0, 0];
            const lv = body.linvel();
            const rel = Math.hypot(lv.x - rv[0], lv.z - rv[2]);
            const isHit = rel >= BUMP_REL_SPEED;
            if (isHit && nowMs > S.protectUntil && nowMs - (S.selfBump.get(ud.playerId) || 0) > 900) {
              S.selfBump.set(ud.playerId, nowMs);
              const otherPos = other.translation();
              const ratio = Math.min(1.8, Math.max(0.55, remoteMass(ud.playerId) / car.mass));
              const p = body.translation();
              const dx = p.x - otherPos.x, dz = p.z - otherPos.z;
              const len = Math.hypot(dx, dz) || 1;
              body.applyImpulse({ x: (dx / len) * mass * 3.2 * ratio, y: mass * 1.1, z: (dz / len) * mass * 3.2 * ratio }, true);
              S.postHSpeed = -1; // the car hit has its own feedback below
              S.shake = Math.max(S.shake, 0.35);
              S.fovPunch = Math.max(S.fovPunch, 3);
              audio.impact(0.6);
              rumble(0.6, 140);
            } else {
              S.shake = Math.max(S.shake, 0.12);
              audio.impact(0.25);
              rumble(0.15, 60);
            }
            // Forgiveness: contact with another car never costs more than
            // (1 − BUMP_MIN_FWD_KEEP) of the forward speed we carried in.
            if (S.lastFwdSpeed > 6) {
              const rot = body.rotation();
              _q.set(rot.x, rot.y, rot.z, rot.w);
              _fwd.set(0, 0, 1).applyQuaternion(_q);
              const v2 = body.linvel();
              const cur = v2.x * _fwd.x + v2.z * _fwd.z;
              const keep = S.lastFwdSpeed * BUMP_MIN_FWD_KEEP;
              if (cur < keep) {
                const add = keep - cur;
                body.setLinvel({ x: v2.x + _fwd.x * add, y: v2.y, z: v2.z + _fwd.z * add }, true);
              }
            }
          }
          // shared prop scatter goes through Props.jsx's MSG.PROP momentum
          // relay — the prop side of the contact queues itself there
        }}
      >
        {/* mass split: most of it rides in a low ballast box so the centre of
            mass sits near the floorpan — the main anti-rollover lever */}
        <CuboidCollider args={[HALF.x, HALF.y, HALF.z]} mass={mass * 0.35} friction={0.25} restitution={0.15} />
        <CuboidCollider
          args={[HALF.x * 0.6, HALF.y * 0.35, HALF.z * 0.6]}
          position={[0, -HALF.y * 0.65, 0]}
          mass={mass * 0.65}
          friction={0.25}
          restitution={0.15}
        />
        <group ref={visual}>
          <CarModel
            carId={carId}
            paint={paint}
            cosmetics={myCos}
            style={style}
            tune={tune}
            name={myName}
            isLocal
            speedRef={speedRef}
            steerRef={steerRef}
            boostingRef={boostingRef}
            flagsRef={flagsRef}
            wheelYRef={wheelYRef}
            leanRef={leanRef}
          />
        </group>
      </RigidBody>
      <Particles />
      <SkidMarks />
    </>
  );
}
