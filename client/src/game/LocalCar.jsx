// The player's car: rigid body + 4-ray suspension, arcade forces tuned for
// drift/boost feel, chase camera, particles, sound, network reporting,
// and application of every server-side effect that touches "me".
import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CuboidCollider, useRapier, useBeforePhysicsStep } from '@react-three/rapier';
import * as THREE from 'three';
import {
  CARS, CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH, PHYS_TIMESTEP, BOOST_TOP_MULT,
  SUSPENSION_REST, SUSPENSION_STIFFNESS, SUSPENSION_DAMPING, SUSPENSION_SETTLE, SPAWN_Y,
  UPRIGHT_ASSIST, SLOPE_ASSIST, GRAVITY, BOOST_MAX, BOOST_REGEN, BOOST_DRAIN,
  BATTERY_SPEED_PENALTY, RESPAWN_Y, INPUT_SEND_RATE,
  DRIFT_TIER_TIMES, DRIFT_TIER_BOOST_S, DRIFT_TIER_COLORS,
  DRIFT_CHARGE_STEER, DRIFT_CHARGE_COAST, SLIPSTREAM, BRAKE_STRENGTH,
  SPAWNS, SOCCER, POWERUP_EFFECT, PHASE, MSG, M,
  BUMP_REL_SPEED, BUMP_MIN_FWD_KEEP, SPEED_HARD_CAP, ANGVEL_CAP, DOWNFORCE,
  SAFE_POSE_INTERVAL_MS, SAFE_POSE_BUFFER, SAFE_POSE_MIN_GROUNDED_S,
  NUDGE_RATE_MS,
} from '@rc/shared';
import { useStore } from '../store.js';
import { net, on, send, sendState, sampleRemote, remoteVelocity } from '../net.js';
import { useControls } from './useControls.js';
import CarModel from './CarModel.jsx';
import Particles, { burst, puff } from './particles.jsx';
import SkidMarks, { skid } from './SkidMarks.jsx';
import { audio } from '../audio.js';

const BASE_MASS = 14;
const driftTier = (c) => (c >= DRIFT_TIER_TIMES[2] ? 3 : c >= DRIFT_TIER_TIMES[1] ? 2 : c >= DRIFT_TIER_TIMES[0] ? 1 : 0);
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
const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _look = new THREE.Vector3();

export const telemetry = { boost: BOOST_MAX, speed: 0, x: 0, z: 0, heading: 0, grounded: false, y: 0 }; // read by HUD/minimap
if (typeof window !== 'undefined') window.__rcTelemetry = telemetry;

export default function LocalCar() {
  const rb = useRef();
  const visual = useRef();
  const keys = useControls();
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const carId = useStore((s) => s.car);
  const paint = useStore((s) => s.paint);
  const style = useStore((s) => s.style);
  const myName = useStore((s) => s.name);
  const car = CARS[carId] || CARS.balanced;
  // Per-car mass is real physics now: heavy cars shove light ones in bumps.
  // Forces scale with mass so acceleration curves stay identical per car.
  const mass = BASE_MASS * (car.mass || 1);

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
    driftCharge: 0,
    miniTurboUntil: 0,
    slipT: 0,
    slipBoostUntil: 0,
    slipCooldownUntil: 0,
    shake: 0,
    fov: 60,
    speed: 0,
    steerVis: 0,
    slipping: false,
    windPhase: 0,
    lastCp: 0,
    frozenUntil: 0, // respawn input freeze
    protectUntil: 0, // spawn protection (can't hit or be hit)
    pendingRespawnAt: 0, // waiting for the server's RESPAWN_AT
    safePoses: [], // ring buffer of recent grounded [x, z, yaw]
    lastSafeAt: 0,
    lastFwdSpeed: 0, // forward speed entering this physics step
    selfBump: new Map(), // other id → t of locally-applied bump impulse
    nudgeAt: new Map(), // prop id → t of last nudge broadcast
  }).current;

  const speedRef = useRef(0);
  const steerRef = useRef(0);
  const boostingRef = useRef(false);
  const flagsRef = useRef(0);
  // per-wheel visual Y (local) so the wheels follow the suspension rays
  const wheelR = carId === 'monster' ? 0.18 : 0.13;
  const wheelYRef = useRef([0, 0, 0, 0].map(() => -0.05 - SUSPENSION_SETTLE + wheelR));

  const teleport = (x, y, z, rotY) => {
    const body = rb.current;
    if (!body) return;
    body.setTranslation({ x, y, z }, true);
    _q.setFromAxisAngle(_up.set(0, 1, 0), rotY || 0);
    body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

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
      const sp = SPAWNS[net.spawnIndex % SPAWNS.length];
      teleport(sp.x, SPAWN_Y, sp.z, sp.rotY);
      S.boost = Math.max(S.boost, 40);
    }
  };

  // ------------------------------------------------ server events → physics
  useEffect(() => {
    const offs = [
      on('match_start', () => {
        const st = useStore.getState();
        if (st.modeId === 'soccer') {
          const team = net.teams[net.myId] || 0;
          const spots = SOCCER.kickoff.filter((_, i) => (i < 4 ? 0 : i < 8 ? 1 : i < 10 ? 0 : 1) === team);
          const sp = spots[net.spawnIndex % spots.length] || SOCCER.kickoff[0];
          teleport(sp.x, SPAWN_Y, sp.z, sp.rotY);
        } else {
          const sp = SPAWNS[net.spawnIndex % SPAWNS.length];
          teleport(sp.x, SPAWN_Y, sp.z, sp.rotY);
        }
        S.boost = BOOST_MAX;
        S.stunnedUntil = 0;
        S.frozenUntil = 0;
        S.protectUntil = 0;
        S.pendingRespawnAt = 0;
        S.safePoses.length = 0;
        S.selfBump.clear();
      }),
      on('respawn_at', (msg) => {
        teleport(msg.x, SPAWN_Y, msg.z, msg.rotY);
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
            }
            break;
          case 'spring':
            if (fx.id === me) {
              body.applyImpulse({ x: 0, y: mass * fx.impulse, z: 0 }, true);
              audio.jump();
              S.shake = Math.max(S.shake, 0.5);
            }
            break;
          case 'emp':
            if (fx.targets?.includes(me)) {
              S.stunnedUntil = performance.now() + fx.stunMs;
              audio.stun();
              S.shake = Math.max(S.shake, 0.7);
            }
            break;
          case 'rocket_hit':
            if (fx.target === me && !fx.blocked) {
              S.stunnedUntil = performance.now() + fx.stunMs;
              body.applyImpulse({ x: (Math.random() - 0.5) * 90, y: mass * 9, z: (Math.random() - 0.5) * 90 }, true);
              audio.stun();
              S.shake = 1;
            }
            if (fx.at) burst(fx.at, { count: fx.blocked ? 10 : 30, color: ['#ffb347', '#ff5c33', '#ffe27a'], speed: 12, size: 0.18, ttl: 0.8 });
            break;
          case 'robot_hit':
            if (fx.target === me) {
              S.stunnedUntil = performance.now() + 1400;
              body.applyImpulse({ x: (Math.random() - 0.5) * 120, y: mass * 7, z: (Math.random() - 0.5) * 120 }, true);
              audio.stun();
              S.shake = 0.8;
            }
            break;
          case 'swap':
            if (fx.a === me) teleport(fx.pa[0], fx.pa[1] + 0.5, fx.pa[2], 0);
            if (fx.b === me) teleport(fx.pb[0], fx.pb[1] + 0.5, fx.pb[2], 0);
            if (fx.a === me || fx.b === me) S.shake = 0.6;
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
            break;
          case 'bump': {
            if (fx.a !== me && fx.b !== me) break;
            if (fx.kind === 'rub') { S.shake = Math.max(S.shake, 0.1); break; }
            S.shake = Math.max(S.shake, 0.35);
            const nowMs = performance.now();
            const otherId = fx.a === me ? fx.b : fx.a;
            // If we already applied this knockback locally at contact time,
            // the server echo is confirmation only — don't double-shove.
            if (nowMs - (S.selfBump.get(otherId) || 0) < 900) break;
            if (nowMs < S.protectUntil) break;
            // Mass-scaled knockback: getting hit by a Micro Monster hurts,
            // getting hit by a Formula barely rocks you.
            const otherPos = fx.a === me ? fx.pb : fx.pa;
            if (otherPos) {
              const otherCar = CARS[useStore.getState().players[otherId]?.car] || CARS.balanced;
              const ratio = Math.min(1.8, Math.max(0.55, (otherCar.mass || 1) / (car.mass || 1)));
              const p = body.translation();
              const dx = p.x - otherPos[0], dz = p.z - otherPos[2];
              const len = Math.hypot(dx, dz) || 1;
              body.applyImpulse({ x: (dx / len) * mass * 3.2 * ratio, y: mass * 1.1, z: (dz / len) * mass * 3.2 * ratio }, true);
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
    const body = rb.current;
    if (!body) return;
    const dt = PHYS_TIMESTEP;
    const nowMs = performance.now();
    const st = useStore.getState();
    const k = keys.current;
    k.poll?.(); // refresh gamepad axes/buttons once per physics step

    const pos = body.translation();
    const rot = body.rotation();
    const vel = body.linvel();
    const ang = body.angvel();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _v.set(vel.x, vel.y, vel.z);
    const fwdSpeed = _v.dot(_fwd);
    S.speed = _v.length();
    speedRef.current = fwdSpeed;

    // ---------------- suspension: 4 rays along car-down
    let groundedWheels = 0;
    const rayDir = { x: -_up.x, y: -_up.y, z: -_up.z };
    for (let wi = 0; wi < WHEELS.length; wi++) {
      const [wx, wy, wz] = WHEELS[wi];
      _corner.set(wx, wy, wz).applyQuaternion(_q);
      _p.set(pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z);
      const ray = new rapier.Ray({ x: _p.x, y: _p.y, z: _p.z }, rayDir);
      const hit = world.castRay(ray, SUSPENSION_REST + 0.15, true, undefined, undefined, undefined, body);
      // wheel visual sits where the ray hit (or droops at full travel in the air)
      wheelYRef.current[wi] = wy - (hit ? Math.min(hit.timeOfImpact ?? hit.toi, SUSPENSION_REST + 0.1) : SUSPENSION_REST * 0.8) + wheelR;
      if (hit) {
        const len = hit.timeOfImpact ?? hit.toi;
        groundedWheels++;
        const compression = 1 - len / SUSPENSION_REST;
        // point velocity along suspension
        const pv = body.velocityAtPoint ? body.velocityAtPoint({ x: _p.x, y: _p.y, z: _p.z }) : vel;
        const velAlong = pv.x * _up.x + pv.y * _up.y + pv.z * _up.z;
        let f = (SUSPENSION_STIFFNESS * compression - SUSPENSION_DAMPING * velAlong) * (mass / 4);
        f = Math.max(0, Math.min(f, mass * 90));
        body.applyImpulseAtPoint(
          { x: _up.x * f * dt, y: _up.y * f * dt, z: _up.z * f * dt },
          { x: _p.x, y: _p.y, z: _p.z }, true,
        );
      }
    }
    const grounded = groundedWheels >= 2;
    S.grounded = grounded;
    if (!grounded) { skid(0, null, 0); skid(1, null, 0); }
    if (grounded) {
      S.groundedTime += dt;
      S.sinceGrounded = 0;
    } else {
      S.groundedTime = 0;
      S.sinceGrounded = (S.sinceGrounded || 0) + dt;
    }

    const stunned = nowMs < S.stunnedUntil;
    const shrunk = nowMs < S.shrinkUntil;
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
      ]);
      if (S.safePoses.length > SAFE_POSE_BUFFER) S.safePoses.shift();
    }

    // ---------------- puddles & event modifiers
    let gripMul = 1, speedMul = 1;
    for (const pu of net.puddles) {
      const d = Math.hypot(pos.x - pu.x, pos.z - pu.z);
      if (d < POWERUP_EFFECT.PUDDLE_RADIUS) {
        if (pu.kind === 'oil') gripMul = Math.min(gripMul, 0.1);
        else speedMul = Math.min(speedMul, 0.55);
      }
    }
    if (shrunk) speedMul *= 0.85;
    if (carrying) speedMul *= BATTERY_SPEED_PENALTY;
    const ev = st.event;
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
    const drifting = driftHeld && grounded && Math.abs(fwdSpeed) > 8;
    S.driftTime = drifting ? S.driftTime + dt : 0;
    steerRef.current += (steer - steerRef.current) * Math.min(1, dt * 10);

    if (grounded && !frozen) {
      const top = car.topSpeed * speedMul;
      // brakes ≫ coast: holding back against forward motion stops you hard
      const braking = throttle < 0 && fwdSpeed > 1.5;
      if (braking) {
        const decel = Math.min(fwdSpeed / dt, car.accel * BRAKE_STRENGTH * -throttle);
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
      // snappy steering response — tight corners need the yaw rate NOW
      const newAngY = ang.y + (yawTarget - ang.y) * Math.min(1, dt * 14);
      body.setAngvel({ x: ang.x, y: newAngY, z: ang.z }, true);
      // lateral grip
      const grip = car.grip * (drifting ? car.drift : 1) * gripMul * (counterSteer && !drifting ? 1.25 : 1);
      const gripImpulse = -latVel * grip * mass * Math.min(1, dt * 12);
      body.applyImpulse({ x: _right.x * gripImpulse, y: 0, z: _right.z * gripImpulse }, true);
      S.slipping = Math.abs(latVel) > 6 || (drifting && Math.abs(fwdSpeed) > 12);
      // rolling resistance + parking brake: real deceleration off-throttle,
      // and below walking pace the car is pinned so it never creeps on its own
      if (throttle === 0) {
        body.applyImpulse({ x: -_v.x * mass * 2.2 * dt, y: 0, z: -_v.z * mass * 2.2 * dt }, true);
        const hSpeed = Math.hypot(_v.x, _v.z);
        if (hSpeed < 1.2 && !drifting && gripMul > 0.5) {
          const damp = hSpeed < 0.15 ? 0 : 0.7; // full stop once it's basically stopped
          body.setLinvel({ x: _v.x * damp, y: vel.y, z: _v.z * damp }, true);
        }
      }
      // drift charge — faster while actively steering the drift. Spark color
      // on the rear wheels tells you the tier you've earned.
      if (drifting) {
        S.driftCharge += (steer !== 0 ? DRIFT_CHARGE_STEER : DRIFT_CHARGE_COAST) * dt;
        const tier = driftTier(S.driftCharge);
        if (tier > 0 && Math.random() < 0.55) {
          for (const rear of [WHEELS[2], WHEELS[3]]) {
            _corner.set(rear[0], rear[1] - 0.08, rear[2]).applyQuaternion(_q);
            burst([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z],
              { count: 1, color: DRIFT_TIER_COLORS[tier - 1], speed: 2.5, size: 0.055, ttl: 0.3, up: 1.5 });
          }
        }
      }
      // mini-turbo fires on drift release, duration scales with tier reached
      if (!drifting && S.prevDrifting) {
        const tier = driftTier(S.driftCharge);
        if (tier > 0) {
          S.miniTurboUntil = nowMs + DRIFT_TIER_BOOST_S[tier - 1] * 1000;
          body.applyImpulse({ x: _fwd.x * mass * 3, y: 0, z: _fwd.z * mass * 3 }, true);
          burst([pos.x, pos.y + 0.2, pos.z], { count: 8 + tier * 6, color: DRIFT_TIER_COLORS[tier - 1], speed: 5, size: 0.08, ttl: 0.5, up: 2 });
          audio.boostFire();
        }
        S.driftCharge = 0;
      }
      // tire smoke + skid marks on the floor
      if (S.slipping) {
        [WHEELS[2], WHEELS[3]].forEach((rear, wi) => {
          _corner.set(rear[0], rear[1] - 0.1, rear[2]).applyQuaternion(_q);
          skid(wi, pos.x + _corner.x, pos.z + _corner.z);
          if (Math.random() < 0.7) {
            puff([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z], [-_v.x * 0.1, 0.5, -_v.z * 0.1], 0.32, drifting ? '#e8e8e8' : '#cfcfcf');
          }
        });
      } else {
        skid(0, null, 0);
        skid(1, null, 0);
      }
    } else if (!grounded && !frozen && !stunned) {
      // airborne (off a ramp or a spring pad): no player spin — just level
      // the car toward wheels-down so every launch ends in a clean landing
      body.applyTorqueImpulse({ x: -_up.z * UPRIGHT_ASSIST * dt, y: 0, z: _up.x * UPRIGHT_ASSIST * dt }, true);
    } else if (frozen && grounded) {
      // countdown: pin the car in place so it can't creep or slide off grid
      body.setLinvel({ x: _v.x * 0.6, y: vel.y, z: _v.z * 0.6 }, true);
      body.setAngvel({ x: ang.x, y: 0, z: ang.z }, true);
    }
    S.prevDrifting = drifting;
    // drift charge survives ramp hops (shift held through the air, MK style)
    // but is forfeit if you let go of drift while airborne
    if (!driftHeld && !grounded) S.driftCharge = 0;

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
          puff([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z], [-_fwd.x * 4, 0.6, -_fwd.z * 4], 0.14, '#cfe4ff', 0.35);
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
      if (Math.random() < 0.8) {
        _corner.set(0, 0.05, -0.55).applyQuaternion(_q);
        puff([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z], [-_fwd.x * 6, 1, -_fwd.z * 6], 0.22, freeBoost && !S.boosting ? '#ffd27a' : '#7ab8ff', 0.35);
      }
    }
    if (!S.boosting && grounded) {
      S.boost = Math.min(BOOST_MAX, S.boost + BOOST_REGEN * dt);
    }

    // ---------------- safety rails
    // Speed-proportional downforce glues the car down at speed (pressed along
    // car-down so it also works on ramps).
    if (grounded) {
      const df = DOWNFORCE * Math.abs(fwdSpeed) * mass * dt;
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
    }
    S.lastFwdSpeed = fwdSpeed;
    telemetry.boosting = S.boosting || freeBoost;
    telemetry.boost = S.boost;
    telemetry.speed = S.speed;
    telemetry.x = pos.x;
    telemetry.z = pos.z;
    telemetry.y = pos.y;
    telemetry.grounded = grounded;
    telemetry.heading = Math.atan2(_fwd.x, _fwd.z);
    boostingRef.current = S.boosting || freeBoost;

    // ---------------- stun visuals
    if (stunned && Math.random() < 0.4) {
      burst([pos.x, pos.y + 0.6, pos.z], { count: 2, color: '#ffe27a', speed: 3, size: 0.06, ttl: 0.3, up: 2 });
    }

    // ---------------- upside-down & fall recovery
    const upDot = _up.y;
    S.upsideDownTime = upDot < 0.35 && S.speed < 4 ? S.upsideDownTime + dt : 0;
    if (k.respawn || pos.y < RESPAWN_Y || S.upsideDownTime > 1.2) {
      k.respawn = false;
      S.upsideDownTime = 0;
      respawn();
    }
  });

  // Camera, audio, telemetry & network run per RENDER frame.
  useFrame((state, rawDt) => {
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
    const shrunk = nowMs < S.shrinkUntil;
    const carrying = (net.flags.get(net.myId) || 0) & 32;
    const throttle = (keys.current.fwd ? 1 : 0) - (keys.current.back ? 1 : 0);
    const drifting = S.prevDrifting;

    // ---------------- camera
    if (!st.photoMode) {
      const back = _camPos.set(-_fwd.x, 0, -_fwd.z).normalize();
      const dist = 4.0 + Math.min(1.6, S.speed * 0.03);
      _camTarget.set(
        pos.x + back.x * dist,
        pos.y + 2.0 + (grounded ? 0 : 0.4),
        pos.z + back.z * dist,
      );
      // framerate-independent smoothing (unclamped dt so slow frames still converge)
      const lerpK = 1 - Math.pow(0.0015, Math.min(rawDt, 0.5));
      camera.position.lerp(_camTarget, lerpK);
      // keep the camera above the floor
      if (camera.position.y < 0.7) camera.position.y = 0.7;
      // keep the car anchored in the lower third: modest look-ahead, higher aim
      _look.set(pos.x + _fwd.x * 2.0 + vel.x * 0.035, pos.y + 0.85, pos.z + _fwd.z * 2.0 + vel.z * 0.035);
      // trauma-style shake: amplitude ∝ shake², plus a rotational component —
      // rotation is what makes a shake read as force instead of glitch
      const trauma = S.shake * S.shake;
      if (S.shake > 0.01) {
        _look.x += (Math.random() - 0.5) * trauma * 2.2;
        _look.y += (Math.random() - 0.5) * trauma * 1.7;
        _look.z += (Math.random() - 0.5) * trauma * 2.2;
        S.shake *= Math.pow(0.02, dt);
      }
      camera.lookAt(_look);
      if (S.shake > 0.01) camera.rotateZ((Math.random() - 0.5) * trauma * 0.09);
      const boostingNow = S.boosting || nowMs < S.miniTurboUntil || nowMs < S.slipBoostUntil;
      const targetFov = 58 + Math.min(1, S.speed / car.topSpeed) * 11 + (boostingNow ? 8 : 0);
      S.fov += (targetFov - S.fov) * Math.min(1, dt * 5);
      if (Math.abs(camera.fov - S.fov) > 0.05) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
    }

    // ---------------- audio
    audio.update({ speed: S.speed, throttle, slipping: S.slipping && grounded, boosting: S.boosting, topSpeed: car.topSpeed });
    audio.setRain(pos.x < -8.5 * M && pos.z > -1 ? 0.9 : st.night ? 0.35 : 0.15);

    // ---------------- network send
    if (nowMs - S.lastSend > 1000 / INPUT_SEND_RATE) {
      S.lastSend = nowMs;
      sendState(
        [pos.x, pos.y, pos.z].map((n) => Math.round(n * 100) / 100),
        [rot.x, rot.y, rot.z, rot.w].map((n) => Math.round(n * 1000) / 1000),
        [vel.x, vel.y, vel.z].map((n) => Math.round(n * 10) / 10),
        drifting, grounded,
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

  const startSpawn = SPAWNS[0];
  return (
    <>
      <RigidBody
        ref={rb}
        position={[startSpawn.x, SPAWN_Y, startSpawn.z]}
        rotation={[0, startSpawn.rotY, 0]}
        colliders={false}
        canSleep={false}
        ccd
        angularDamping={1.6}
        linearDamping={0.05}
        userData={{ playerId: 'me' }}
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
              const otherCar = CARS[useStore.getState().players[ud.playerId]?.car] || CARS.balanced;
              const ratio = Math.min(1.8, Math.max(0.55, (otherCar.mass || 1) / (car.mass || 1)));
              const p = body.translation();
              const dx = p.x - otherPos.x, dz = p.z - otherPos.z;
              const len = Math.hypot(dx, dz) || 1;
              body.applyImpulse({ x: (dx / len) * mass * 3.2 * ratio, y: mass * 1.1, z: (dz / len) * mass * 3.2 * ratio }, true);
              S.shake = Math.max(S.shake, 0.35);
              audio.impact(0.6);
            } else {
              S.shake = Math.max(S.shake, 0.12);
              audio.impact(0.25);
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
          } else if (ud.propId !== undefined) {
            // --- shared prop contact: tell peers we scattered it
            const last = S.nudgeAt.get(ud.propId) || 0;
            if (nowMs - last > NUDGE_RATE_MS) {
              S.nudgeAt.set(ud.propId, nowMs);
              const pp = other.translation();
              const lv = body.linvel();
              const r1 = (n) => Math.round(n * 10) / 10;
              send({ t: MSG.NUDGE, i: ud.propId, p: [r1(pp.x), r1(pp.y), r1(pp.z)], v: [r1(lv.x), r1(lv.y), r1(lv.z)] });
            }
          }
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
            style={style}
            name={myName}
            isLocal
            speedRef={speedRef}
            steerRef={steerRef}
            boostingRef={boostingRef}
            flagsRef={flagsRef}
            wheelYRef={wheelYRef}
          />
        </group>
      </RigidBody>
      <Particles />
      <SkidMarks />
    </>
  );
}
