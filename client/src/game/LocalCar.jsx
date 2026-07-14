// The player's car: rigid body + 4-ray suspension, arcade forces tuned for
// drift/boost/jump feel, chase camera, particles, sound, network reporting,
// and application of every server-side effect that touches "me".
import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CuboidCollider, useRapier, useBeforePhysicsStep } from '@react-three/rapier';
import * as THREE from 'three';
import {
  CARS, CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH, PHYS_TIMESTEP,
  SUSPENSION_REST, SUSPENSION_STIFFNESS, SUSPENSION_DAMPING,
  JUMP_IMPULSE, DOUBLE_JUMP_IMPULSE, BOOST_MAX, BOOST_REGEN, BOOST_DRAIN,
  TRICK_BOOST_REWARD, BATTERY_SPEED_PENALTY, RESPAWN_Y, INPUT_SEND_RATE,
  SPAWNS, CHECKPOINTS, SOCCER, POWERUP_EFFECT, PHASE, MSG,
} from '@rc/shared';
import { useStore } from '../store.js';
import { net, on, send, sendState } from '../net.js';
import { useControls } from './useControls.js';
import CarModel from './CarModel.jsx';
import Particles, { burst, puff } from './particles.jsx';
import { audio } from '../audio.js';

const CAR_MASS = 14;
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
  const myName = useStore((s) => s.name);
  const car = CARS[carId] || CARS.balanced;

  const S = useRef({
    boost: BOOST_MAX,
    boosting: false,
    canDouble: true,
    airSpin: 0,
    grounded: false,
    groundedTime: 0,
    stunnedUntil: 0,
    shieldUntil: 0,
    shrinkUntil: 0,
    upsideDownTime: 0,
    lastSend: 0,
    lastBumpSend: 0,
    driftTime: 0,
    shake: 0,
    fov: 60,
    speed: 0,
    steerVis: 0,
    slipping: false,
    windPhase: 0,
    lastCp: 0,
  }).current;

  const speedRef = useRef(0);
  const steerRef = useRef(0);
  const boostingRef = useRef(false);
  const flagsRef = useRef(0);

  const teleport = (x, y, z, rotY) => {
    const body = rb.current;
    if (!body) return;
    body.setTranslation({ x, y, z }, true);
    _q.setFromAxisAngle(_up.set(0, 1, 0), rotY || 0);
    body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

  const respawn = () => {
    const st = useStore.getState();
    let spot;
    if (st.modeId === 'desk_dash') {
      const prog = st.raceProgress[net.myId];
      const idx = prog ? Math.max(0, (prog[1] - 1 + CHECKPOINTS.length) % CHECKPOINTS.length) : 0;
      const cp = CHECKPOINTS[idx];
      const nxt = CHECKPOINTS[(idx + 1) % CHECKPOINTS.length];
      spot = { x: cp.x, z: cp.z, rotY: Math.atan2(nxt.x - cp.x, nxt.z - cp.z) };
    } else {
      const sp = SPAWNS[net.spawnIndex % SPAWNS.length];
      spot = { x: sp.x, z: sp.z, rotY: sp.rotY };
    }
    teleport(spot.x, 0.5, spot.z, spot.rotY);
    S.boost = Math.max(S.boost, 40);
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
          teleport(sp.x, 0.5, sp.z, sp.rotY);
        } else {
          const sp = SPAWNS[net.spawnIndex % SPAWNS.length];
          teleport(sp.x, 0.5, sp.z, sp.rotY);
        }
        S.boost = BOOST_MAX;
        S.stunnedUntil = 0;
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
              body.applyImpulse({ x: _fwd.x * CAR_MASS * 14, y: 0, z: _fwd.z * CAR_MASS * 14 }, true);
            }
            break;
          case 'spring':
            if (fx.id === me) {
              body.applyImpulse({ x: 0, y: CAR_MASS * fx.impulse, z: 0 }, true);
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
            if (fx.target === me) {
              S.stunnedUntil = performance.now() + fx.stunMs;
              body.applyImpulse({ x: (Math.random() - 0.5) * 90, y: CAR_MASS * 9, z: (Math.random() - 0.5) * 90 }, true);
              audio.stun();
              S.shake = 1;
            }
            if (fx.at) burst(fx.at, { count: 30, color: ['#ffb347', '#ff5c33', '#ffe27a'], speed: 12, size: 0.18, ttl: 0.8 });
            break;
          case 'robot_hit':
            if (fx.target === me) {
              S.stunnedUntil = performance.now() + 1400;
              body.applyImpulse({ x: (Math.random() - 0.5) * 120, y: CAR_MASS * 7, z: (Math.random() - 0.5) * 120 }, true);
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
          case 'bump':
            if (fx.at && (fx.a === me || fx.b === me)) S.shake = Math.max(S.shake, 0.35);
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
    for (const [wx, wy, wz] of WHEELS) {
      _corner.set(wx, wy, wz).applyQuaternion(_q);
      _p.set(pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z);
      const ray = new rapier.Ray({ x: _p.x, y: _p.y, z: _p.z }, rayDir);
      const hit = world.castRay(ray, SUSPENSION_REST + 0.15, true, undefined, undefined, undefined, body);
      if (hit) {
        const len = hit.timeOfImpact ?? hit.toi;
        groundedWheels++;
        const compression = 1 - len / SUSPENSION_REST;
        // point velocity along suspension
        const pv = body.velocityAtPoint ? body.velocityAtPoint({ x: _p.x, y: _p.y, z: _p.z }) : vel;
        const velAlong = pv.x * _up.x + pv.y * _up.y + pv.z * _up.z;
        let f = (SUSPENSION_STIFFNESS * compression - SUSPENSION_DAMPING * velAlong) * (CAR_MASS / 4);
        f = Math.max(0, Math.min(f, CAR_MASS * 90));
        body.applyImpulseAtPoint(
          { x: _up.x * f * dt, y: _up.y * f * dt, z: _up.z * f * dt },
          { x: _p.x, y: _p.y, z: _p.z }, true,
        );
      }
    }
    const grounded = groundedWheels >= 2;
    S.grounded = grounded;
    if (grounded) { S.groundedTime += dt; S.canDouble = true; } else S.groundedTime = 0;

    const stunned = nowMs < S.stunnedUntil;
    const shrunk = nowMs < S.shrinkUntil;
    const frozen = st.phase === PHASE.COUNTDOWN && Date.now() < st.countdownEnd;
    const carrying = (net.flags.get(net.myId) || 0) & 32;

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
      body.applyImpulse({ x: wind * dt * CAR_MASS * 0.12, y: 0, z: Math.cos(S.windPhase * 0.5) * 18 * dt * CAR_MASS * 0.12 }, true);
    }
    if (ev?.id === 'earthquake' && grounded) {
      S.shake = Math.max(S.shake, 0.25);
      if (Math.random() < 0.06) {
        body.applyImpulse({ x: (Math.random() - 0.5) * CAR_MASS * 6, y: Math.random() * CAR_MASS * 4, z: (Math.random() - 0.5) * CAR_MASS * 6 }, true);
      }
    }

    // ---------------- driving
    const throttle = frozen || stunned ? 0 : (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    const steer = frozen || stunned ? 0 : (k.left ? 1 : 0) - (k.right ? 1 : 0);
    const drifting = k.drift && grounded && Math.abs(fwdSpeed) > 8;
    S.driftTime = drifting ? S.driftTime + dt : 0;
    steerRef.current += (steer - steerRef.current) * Math.min(1, dt * 10);

    if (grounded && !frozen) {
      const top = car.topSpeed * speedMul;
      // engine
      if (throttle !== 0) {
        const overspeed = throttle > 0 ? fwdSpeed > top : fwdSpeed < -top * 0.5;
        if (!overspeed) {
          const f = car.accel * CAR_MASS * throttle * (drifting ? 0.85 : 1);
          body.applyImpulse({ x: _fwd.x * f * dt, y: 0, z: _fwd.z * f * dt }, true);
        }
      }
      // steering: bias angular velocity toward target yaw rate.
      // throttle guarantees a minimum turn rate so you can pivot from rest.
      const effSpeed = Math.max(Math.abs(fwdSpeed), throttle !== 0 ? 7 : 0);
      const speedFactor = Math.min(1, effSpeed / 10);
      const dir = fwdSpeed < -1 ? -1 : 1;
      const yawTarget = steer * car.handling * speedFactor * dir * (drifting ? 1.45 : 1);
      const newAngY = ang.y + (yawTarget - ang.y) * Math.min(1, dt * 8);
      body.setAngvel({ x: ang.x, y: newAngY, z: ang.z }, true);
      // lateral grip
      const latVel = _v.dot(_right);
      const grip = car.grip * (drifting ? car.drift : 1) * gripMul;
      const gripImpulse = -latVel * grip * CAR_MASS * Math.min(1, dt * 9);
      body.applyImpulse({ x: _right.x * gripImpulse, y: 0, z: _right.z * gripImpulse }, true);
      S.slipping = Math.abs(latVel) > 6 || (drifting && Math.abs(fwdSpeed) > 12);
      // rolling resistance
      if (throttle === 0) {
        body.applyImpulse({ x: -_v.x * CAR_MASS * 0.6 * dt, y: 0, z: -_v.z * CAR_MASS * 0.6 * dt }, true);
      }
      // mini-turbo on drift release
      if (!drifting && S.prevDrifting && S.driftReleaseBoost > 1.1) {
        body.applyImpulse({ x: _fwd.x * CAR_MASS * 8, y: 0, z: _fwd.z * CAR_MASS * 8 }, true);
        audio.boostFire();
      }
      S.driftReleaseBoost = drifting ? S.driftTime : 0;
      // tire smoke
      if (S.slipping && Math.random() < 0.7) {
        for (const rear of [WHEELS[2], WHEELS[3]]) {
          _corner.set(rear[0], rear[1] - 0.1, rear[2]).applyQuaternion(_q);
          puff([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z], [-_v.x * 0.1, 0.5, -_v.z * 0.1], 0.32, drifting ? '#e8e8e8' : '#cfcfcf');
        }
      }
    } else if (!grounded && !frozen && !stunned) {
      // air control
      const pitch = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
      const yaw = (k.left ? 1 : 0) - (k.right ? 1 : 0);
      body.applyTorqueImpulse({
        x: _right.x * pitch * 2.6 * dt * CAR_MASS * 0.35,
        y: yaw * 2.2 * dt * CAR_MASS * 0.35,
        z: _right.z * pitch * 2.6 * dt * CAR_MASS * 0.35,
      }, true);
      S.airSpin += Math.abs(ang.x * dt) + Math.abs(ang.z * dt);
    }
    S.prevDrifting = drifting;

    // trick landing reward
    if (grounded && S.airSpin > 4.5) {
      S.boost = Math.min(BOOST_MAX, S.boost + TRICK_BOOST_REWARD);
      burst([pos.x, pos.y + 0.5, pos.z], { count: 16, color: ['#ffe27a', '#7affc4', '#7ab8ff'], speed: 6, size: 0.1, ttl: 0.8 });
      useStore.getState().pushFeed('🌀 Sick flip! +boost');
      audio.deliver();
    }
    if (grounded) S.airSpin = 0;

    // ---------------- jump / double jump
    if (k.jumpPressed && !frozen && !stunned) {
      k.jumpPressed = false;
      if (grounded) {
        body.applyImpulse({ x: 0, y: CAR_MASS * JUMP_IMPULSE, z: 0 }, true);
        audio.jump();
      } else if (S.canDouble) {
        S.canDouble = false;
        body.applyImpulse({ x: 0, y: CAR_MASS * DOUBLE_JUMP_IMPULSE, z: 0 }, true);
        // small forward flip for style
        body.applyTorqueImpulse({ x: _right.x * CAR_MASS * 0.9, y: 0, z: _right.z * CAR_MASS * 0.9 }, true);
        audio.jump();
      }
    }

    // ---------------- boost
    const wantBoost = (k.boost || (k.drift && k.fwd && !grounded)) && !frozen && !stunned;
    S.boosting = wantBoost && S.boost > 1;
    if (S.boosting) {
      S.boost = Math.max(0, S.boost - BOOST_DRAIN * dt);
      const f = car.boost * CAR_MASS;
      body.applyImpulse({ x: _fwd.x * f * dt, y: 0, z: _fwd.z * f * dt }, true);
      if (Math.random() < 0.8) {
        _corner.set(0, 0.05, -0.55).applyQuaternion(_q);
        puff([pos.x + _corner.x, pos.y + _corner.y, pos.z + _corner.z], [-_fwd.x * 6, 1, -_fwd.z * 6], 0.22, '#7ab8ff', 0.35);
      }
    } else if (grounded) {
      S.boost = Math.min(BOOST_MAX, S.boost + BOOST_REGEN * dt);
    }
    telemetry.boost = S.boost;
    telemetry.speed = S.speed;
    telemetry.x = pos.x;
    telemetry.z = pos.z;
    telemetry.y = pos.y;
    telemetry.grounded = grounded;
    telemetry.heading = Math.atan2(_fwd.x, _fwd.z);
    boostingRef.current = S.boosting;

    // ---------------- stun visuals
    if (stunned && Math.random() < 0.4) {
      burst([pos.x, pos.y + 0.6, pos.z], { count: 2, color: '#ffe27a', speed: 3, size: 0.06, ttl: 0.3, up: 2 });
    }

    // ---------------- upside-down & fall recovery
    const upDot = _up.y;
    S.upsideDownTime = upDot < 0.1 && S.speed < 4 ? S.upsideDownTime + dt : 0;
    if (k.respawn || pos.y < RESPAWN_Y || S.upsideDownTime > 2) {
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
      const dist = 4.6 + Math.min(2.2, S.speed * 0.03);
      _camTarget.set(
        pos.x + back.x * dist,
        pos.y + 2.3 + (grounded ? 0 : 0.5),
        pos.z + back.z * dist,
      );
      const lerpK = 1 - Math.pow(0.0015, dt);
      camera.position.lerp(_camTarget, lerpK);
      // keep the camera above the floor
      if (camera.position.y < 0.7) camera.position.y = 0.7;
      _look.set(pos.x + _fwd.x * 2.4 + vel.x * 0.06, pos.y + 0.7, pos.z + _fwd.z * 2.4 + vel.z * 0.06);
      if (S.shake > 0.01) {
        _look.x += (Math.random() - 0.5) * S.shake * 1.6;
        _look.y += (Math.random() - 0.5) * S.shake * 1.2;
        _look.z += (Math.random() - 0.5) * S.shake * 1.6;
        S.shake *= Math.pow(0.02, dt);
      }
      camera.lookAt(_look);
      const targetFov = 60 + Math.min(1, S.speed / car.topSpeed) * 14 + (S.boosting ? 7 : 0);
      S.fov += (targetFov - S.fov) * Math.min(1, dt * 5);
      if (Math.abs(camera.fov - S.fov) > 0.05) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
    }

    // ---------------- audio
    audio.update({ speed: S.speed, throttle, slipping: S.slipping && grounded, boosting: S.boosting, topSpeed: car.topSpeed });
    audio.setRain(pos.x < -8.5 * 5.5 && pos.z > -1 ? 0.9 : st.night ? 0.35 : 0.15);

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
    flagsRef.current = (nowMs < S.shieldUntil ? 8 : 0) | (carrying ? 32 : 0) | (stunned ? 4 : 0);
  });

  const startSpawn = SPAWNS[0];
  return (
    <>
      <RigidBody
        ref={rb}
        position={[startSpawn.x, 0.5, startSpawn.z]}
        rotation={[0, startSpawn.rotY, 0]}
        colliders={false}
        canSleep={false}
        ccd
        angularDamping={1.6}
        linearDamping={0.05}
        userData={{ playerId: 'me' }}
        onCollisionEnter={(e) => {
          const otherId = e.other.rigidBody?.userData?.playerId;
          const nowMs = performance.now();
          if (otherId && otherId !== 'me' && nowMs - S.lastBumpSend > 350) {
            S.lastBumpSend = nowMs;
            send({ t: MSG.BUMP, target: otherId });
            S.shake = Math.max(S.shake, 0.3);
            audio.impact(0.6);
          }
        }}
      >
        <CuboidCollider args={[HALF.x, HALF.y, HALF.z]} mass={CAR_MASS} friction={0.25} restitution={0.15} />
        <group ref={visual}>
          <CarModel
            carId={carId}
            paint={paint}
            name={myName}
            isLocal
            speedRef={speedRef}
            steerRef={steerRef}
            boostingRef={boostingRef}
            flagsRef={flagsRef}
          />
        </group>
      </RigidBody>
      <Particles />
    </>
  );
}
