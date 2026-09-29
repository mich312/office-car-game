// Procedural RC car visuals — five lofted body shells with real glass,
// spinning/steering wheels on working coil-overs, body roll, boost flame,
// headlights, shield bubble, battery pack, name tag, equipped cosmetics
// (hats, antenna variants, trails), the garage's bolt-on parts and the
// visible half of the setup sheet: ride height, tyre width and wing angle all
// read straight off the tuning numbers the car drives with.
//
// Draw calls are the budget that matters with twelve of these on screen: the
// whole static car (shell, lamps, kit, every bolt-on) is merged per material
// by carParts.js, the four wheels and four corners of suspension are
// instanced, and remote cars step down to a merged mid LOD and a two-draw
// proxy with distance (RemoteCars).
import { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import {
  CARS, WHEEL_STYLES, DEFAULT_STYLE, sanitizeStyle, FINISHES,
  tunedStats, sanitizeTune, STOCK_TUNE,
  antennaStep, newAntenna,
} from '@rc/shared';
import { vinylTopTex, vinylSideTex, glowTex, plateTex } from './textures.js';
import { useStore } from '../store.js';
import TextSprite from './TextSprite.jsx';
import Trail from './Trail.jsx';
import { shellGeos, shellBounds } from './carShell.js';
import { buildCar, anchorsOf } from './carParts.js';
import {
  OUTLINE_MAT, KIT_MAT, METAL_MAT, HEAD_DAY, HEAD_NIGHT, TAIL_MAT, Parts, mat4,
  paintMat, glassMat, rimMat, plateMat, tyreMat, tyreGeo, rimGeo, brakeGeo, suspGeos, driverGeos,
} from './carKit.js';

const WHEEL_POS = [
  [-0.3, 0.34], [0.3, 0.34],
  [-0.3, -0.34], [0.3, -0.34],
];

// ------------------------------------------------------------ suspension
// Exposed RC suspension: per corner an A-arm from the chassis to the hub, and
// a coil-over (spring around a damper) from the body down to the arm. Every
// frame they're stretched between where the wheel really is (the suspension
// rays) and where the body really is (its lean and landing squash), so you
// see the springs work. The hatch bodies get the same kit tucked inside the
// arches: you see the coil working in the gap above the tyre.
// top: shock-tower height; out: how far out the tower sits, as a share of
// the wheel's own x (near 1 = right beside the wheel, where RC shocks live)
const SUSPENSION = {
  buggy: { top: 0.2, out: 0.86, spring: '#e8b830' },
  monster: { top: 0.2, out: 0.82, spring: '#e0362f' },
  formula: { top: 0.1, out: 0.72, spring: '#3d8bff' },
  drift: { top: 0.06, out: 0.8, spring: '#b04dff' },
  balanced: { top: 0.06, out: 0.8, spring: '#34c46a' },
};
const SUSP_MATS = new Map();
function suspMats(color) {
  if (!SUSP_MATS.has(color)) {
    SUSP_MATS.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 }));
  }
  return SUSP_MATS.get(color);
}

// Fitted tyres: `r`/`w` scale the rubber; the tread itself is in the geometry
// (tyreGeo) and its normal map.
const TYRES = {
  road: { r: 1, w: 1 },
  knobby: { r: 1.09, w: 1.16 },
  slick: { r: 0.97, w: 1.1 },
};

// Vinyl wrap projectors per body: top [width, length, z centre] looking
// down, side [length, height, y centre, z centre] looking across.
const VINYL_FIT = {
  balanced: { top: [0.5, 0.95, 0], side: [0.9, 0.15, 0.03, 0] },
  drift: { top: [0.52, 0.98, 0], side: [0.94, 0.13, -0.01, 0] },
  monster: { top: [0.44, 0.84, 0], side: [0.8, 0.12, 0.13, 0] },
  buggy: { top: [0.34, 0.76, 0.07], side: [0.72, 0.13, 0.02, 0.07] },
  formula: { top: [0.3, 0.9, 0], side: [0.8, 0.1, 0.0, 0] },
};

// scratch (never allocate per frame)
const _unitY = new THREE.Vector3(0, 1, 0);
const _unitX = new THREE.Vector3(1, 0, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _top = new THREE.Vector3();
const _pos = new THREE.Vector3(), _scl = new THREE.Vector3(1, 1, 1), _mat = new THREE.Matrix4();
const _qs = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _flip = new THREE.Quaternion().setFromAxisAngle(_unitY, Math.PI);

export default function CarModel({ carId, paint, style, tune, name, cosmetics, isLocal = false, speedRef, steerRef, boostingRef, flagsRef, wheelYRef, leanRef, team }) {
  const car = CARS[carId] || CARS.balanced;
  const id = CARS[carId] ? carId : 'balanced';
  const color = paint || car.color;
  const st = useMemo(() => (style ? sanitizeStyle(style) : DEFAULT_STYLE), [style]);
  const tu = useMemo(() => (tune ? sanitizeTune(tune) : STOCK_TUNE), [tune]);
  // the setup sheet's visible half: stance from spring rate, tyre width from
  // compound, wing angle from downforce
  const T = useMemo(() => tunedStats(car, tu), [car, tu]);
  const night = useStore((s) => s.night);
  const event = useStore((s) => s.event);
  const dark = night || event?.id === 'lights_out';
  const bodyRef = useRef();
  const tyreRef = useRef(), rimRef = useRef(), brakeRef = useRef();
  const armRef = useRef(), damperRef = useRef(), coilRef = useRef();
  const flameRef = useRef();
  const shieldRef = useRef();
  const batteryRef = useRef();
  const stunRef = useRef();
  const antenna = useRef(newAntenna());
  const propellerRef = useRef();
  const driverRef = useRef();
  const trailAnchor = useRef();
  const spin = useRef(0);
  // spotlight targets must live in the scene graph to follow the car — a
  // loose `target-position` stays fixed in world space (the old headlight bug)
  const beamTarget = useMemo(() => new THREE.Object3D(), []);
  const wheelStyle = WHEEL_STYLES[st.wheels] || WHEEL_STYLES.stock;

  // Rubber: the fitted tyre sets the base size, then the setup sheet's compound
  // nudges the width (soft = fatter). Widebody arches come with a wider track.
  const tyre = TYRES[st.tyre] || TYRES.road;
  const wheelR = (id === 'monster' ? 0.18 : 0.13) * tyre.r;
  const wheelW = (id === 'formula' ? 0.1 : 0.14) * tyre.w * (1 + 0.075 * tu.tires);
  const wide = st.flares === 'wide';
  const trackOut = wide ? 0.03 : 0;
  // rest pose: wheels at the TUNED equilibrium sag, tires kissing the floor —
  // soft springs slam the car, stiff springs stand it up
  const restY = -0.05 - T.settle + wheelR;
  const suspPivotY = restY + 0.02; // wishbone inner pivot: chassis height at the hubs
  const wheelY = useRef([restY, restY, restY, restY]);

  const build = useMemo(() => buildCar(id, {
    wide, front: st.front, hood: st.hood, roof: st.roof, skirts: st.skirts, exhaust: st.exhaust,
    spoiler: st.spoiler, wing: tu.wing, wheelR, wheelW, trackOut, trim: !!st.accent,
  }), [id, wide, st.front, st.hood, st.roof, st.skirts, st.exhaust, st.spoiler, st.accent, tu.wing, wheelR, wheelW, trackOut]);
  const anchors = build.anchors;
  const A = anchorsOf(id);

  const mats = useMemo(() => ({
    // painted panels follow the chosen finish; metal, glass and rubber are PBR
    paint: paintMat(color, st.finish, FINISHES),
    trim: paintMat(st.accent || color, st.finish, FINISHES),
    glass: glassMat(st.tint),
    rim: rimMat(wheelStyle.rim),
    tyre: tyreMat(st.tyre in TYRES ? st.tyre : 'road'),
  }), [color, st.finish, st.accent, st.tint, st.tyre, wheelStyle.rim]);
  const plateText = st.plate || name || 'RC';
  const plate = useMemo(() => {
    const tex = plateTex(plateText);
    return { mat: plateMat(tex, plateText) };
  }, [plateText]);
  const wheelGeos = useMemo(() => ({
    tyre: tyreGeo(st.tyre in TYRES ? st.tyre : 'road', wheelR, wheelW),
    rim: rimGeo(wheelStyle, wheelR, wheelW),
    brake: brakeGeo(wheelR, wheelW, st.accent || '#c0392b'),
  }), [st.tyre, wheelR, wheelW, wheelStyle, st.accent]);
  const sp = SUSPENSION[id];
  // antenna: one bent mesh + its tip, per car
  const whip = useWhip(cosmetics?.antenna);

  useFrame((state, dt) => {
    const speed = speedRef?.current ?? 0;
    const steer = steerRef?.current ?? 0;
    const t = state.clock.elapsedTime;
    spin.current += (speed / wheelR / 1.08) * dt;
    // wheels follow the suspension rays (local car) — touch the ground,
    // compress, droop — then four instances get their transforms
    const wy = wheelY.current;
    const k = Math.min(1, dt * 22);
    _qs.setFromAxisAngle(_unitX, spin.current);
    for (let i = 0; i < 4; i++) {
      if (wheelYRef?.current) wy[i] += (wheelYRef.current[i] - wy[i]) * k;
      else wy[i] = restY;
      const [wx, wz] = WHEEL_POS[i];
      const left = wx < 0;
      _pos.set(wx + trackOut * Math.sign(wx), wy[i], wz);
      _qt.setFromAxisAngle(_unitY, i < 2 ? steer * 0.42 : 0);
      if (left) _qt.multiply(_flip);
      _qf.copy(_qt);
      if (left) _qw.setFromAxisAngle(_unitX, -spin.current); else _qw.copy(_qs);
      _qt.multiply(_qw);
      if (tyreRef.current) {
        tyreRef.current.setMatrixAt(i, _mat.compose(_pos, _qt, _scl));
        rimRef.current.setMatrixAt(i, _mat);
        brakeRef.current.setMatrixAt(i, _mat.compose(_pos, _qf, _scl));
      }
    }
    if (tyreRef.current) {
      tyreRef.current.instanceMatrix.needsUpdate = true;
      rimRef.current.instanceMatrix.needsUpdate = true;
      brakeRef.current.instanceMatrix.needsUpdate = true;
    }
    if (bodyRef.current) {
      // Weight transfer on the visual shell. With a leanRef (in-game cars,
      // local & remote) roll/pitch come from measured acceleration: outward
      // roll in curves, squat under throttle, dive under braking, easing back
      // to neutral. Without one (garage preview) fall back to steer-based roll.
      const lean = leanRef?.current;
      const tRoll = lean ? lean.roll : steer * Math.min(1, Math.abs(speed) / 25) * 0.09;
      const tPitch = lean ? lean.pitch : 0;
      bodyRef.current.rotation.z += (tRoll - bodyRef.current.rotation.z) * Math.min(1, dt * 8);
      bodyRef.current.rotation.x += (tPitch - bodyRef.current.rotation.x) * Math.min(1, dt * 8);
      // landing squash (local car): the shell sinks onto the wheels and
      // bulges a touch, then springs back — the wheels stay planted
      const sq = lean?.squash || 0;
      bodyRef.current.scale.set(1 + sq * 0.06, 1 - sq * 0.13, 1 + sq * 0.06);
      bodyRef.current.position.y = -sq * 0.045;
    }
    // coil-overs: from the (leaning, squashing) body down to the A-arm,
    // A-arms from the chassis out to wherever the wheel is right now
    if (sp && bodyRef.current && armRef.current) {
      bodyRef.current.updateMatrix();
      for (let i = 0; i < 4; i++) {
        const [wx, wz] = WHEEL_POS[i];
        const side = Math.sign(wx);
        // arm: fixed chassis pivot → hub
        _a.set(wx * 0.3, suspPivotY, wz);
        _b.set(wx + trackOut * side - side * 0.02, wy[i], wz);
        _d.subVectors(_b, _a);
        _qt.setFromUnitVectors(_unitX, _n.copy(_d).normalize());
        armRef.current.setMatrixAt(i, _mat.compose(_a, _qt, _scl.set(_d.length(), 1, 1)));
        // coil-over: body-mounted top (rides the lean and the landing squash)
        // → a point 80% of the way out along the arm
        _top.set(wx * sp.out, sp.top, wz * 0.9).applyMatrix4(bodyRef.current.matrix);
        _b.lerpVectors(_a, _b, 0.8);
        _d.subVectors(_top, _b);
        const len = _d.length();
        _qt.setFromUnitVectors(_unitY, _d.normalize());
        coilRef.current.setMatrixAt(i, _mat.compose(_b, _qt, _scl.set(1, len, 1)));
        damperRef.current.setMatrixAt(i, _mat.compose(_b, _qt, _scl.set(1, len, 1)));
      }
      _scl.set(1, 1, 1);
      armRef.current.instanceMatrix.needsUpdate = true;
      coilRef.current.instanceMatrix.needsUpdate = true;
      damperRef.current.instanceMatrix.needsUpdate = true;
    }
    if (flameRef.current) {
      const on = boostingRef?.current;
      flameRef.current.visible = !!on;
      if (on) flameRef.current.scale.setScalar(0.8 + Math.random() * 0.5);
    }
    const flags = flagsRef?.current ?? 0;
    if (shieldRef.current) {
      // bit 8 = shield item (blue), bit 64 = spawn protection (green pulse)
      const prot = !!(flags & 64) && !(flags & 8);
      shieldRef.current.visible = !!(flags & 8) || !!(flags & 64);
      if (shieldRef.current.visible) {
        shieldRef.current.rotation.y += dt * 2;
        shieldRef.current.material.color.set(prot ? '#7dffb0' : '#7ad8ff');
        shieldRef.current.material.opacity = prot ? 0.14 + Math.abs(Math.sin(performance.now() / 180)) * 0.1 : 0.22;
      }
    }
    if (batteryRef.current) batteryRef.current.visible = !!(flags & 32);
    if (stunRef.current) {
      stunRef.current.visible = !!(flags & 4);
      if (stunRef.current.visible) stunRef.current.rotation.y += dt * 8;
    }
    // The antenna is a whip on a spring (shared/src/feel.js), bent along its
    // length: in-game cars feed it their real acceleration, so braking flicks
    // it forward, corners throw it outward, bumps and landings set it ringing.
    // The garage turntable has no acceleration to give, so it idles on steer.
    const lean = leanRef?.current;
    if (lean && lean.aLong !== undefined) {
      antennaStep(antenna.current, lean.aLong, lean.aLat, lean.aUp || 0, speed, Math.min(dt, 0.05));
    } else {
      antenna.current.pitch = Math.sin(t * 1.3) * 0.05;
      antenna.current.roll = steer * 0.12;
    }
    whip.bend(antenna.current.pitch, antenna.current.roll);
    if (propellerRef.current) propellerRef.current.rotation.y += dt * (3 + Math.abs(speed) * 0.8);
    // the driver leans into corners and hunkers down with speed
    if (driverRef.current) {
      const dl = -steer * Math.min(1, Math.abs(speed) / 14) * 0.35;
      driverRef.current.rotation.z += (dl - driverRef.current.rotation.z) * Math.min(1, dt * 7);
      driverRef.current.rotation.x = Math.min(0.18, Math.abs(speed) * 0.008);
    }
  });

  const S = build.slots;
  const seat = anchors.seat;
  const roofY = anchors.roofY ?? 0.28;
  const flame = anchors.flame || [0, -0.02, -0.55];
  const antY = useMemo(() => shellTopAt(id, A.antenna[0], A.antenna[1], wide, anchors), [id, A, wide, anchors]);

  return (
    <group>
      <group ref={bodyRef}>
        {/* the static car: one draw per material */}
        {S.outline && <mesh geometry={S.outline} material={OUTLINE_MAT} />}
        <mesh castShadow receiveShadow geometry={S.paint} material={mats.paint} />
        {S.trim && <mesh castShadow geometry={S.trim} material={mats.trim} />}
        {S.kit && <mesh castShadow geometry={S.kit} material={KIT_MAT} />}
        {S.metal && <mesh geometry={S.metal} material={METAL_MAT} />}
        {S.head && <mesh geometry={S.head} material={dark ? HEAD_NIGHT : HEAD_DAY} />}
        {S.tail && <mesh geometry={S.tail} material={TAIL_MAT} />}
        {S.glass && <mesh geometry={S.glass} material={mats.glass} renderOrder={1} />}
        {build.plate && (
          <mesh geometry={plateGeo(build.plate.w, build.plate.h)} material={plate.mat} position={build.plate.pos} rotation-y={Math.PI} />
        )}
        {st.vinyl !== 'none' && <Vinyl carId={id} wide={wide} vinyl={st.vinyl} color={st.vinylColor} />}
        {seat && <Driver seat={seat} trim={mats.trim} refGroup={driverRef} />}
        {isLocal && dark && (
          <>
            {/* the target is a child of the car body, so the beam always
                shines out of the front and dips toward the road ahead */}
            <primitive object={beamTarget} position={[0, -0.6, 7]} />
            <spotLight position={[0, 0.15, 0.5]} target={beamTarget} angle={0.55} intensity={30} distance={30} penumbra={0.5} color="#fff3cf" />
          </>
        )}
        {/* antenna (equipped variant or the stock whip) */}
        <group position={[A.antenna[0], antY, A.antenna[1]]}>
          <primitive object={whip.group} />
        </group>
        {/* hat, socketed to the roof */}
        {cosmetics?.hat && (
          <group position={[0, roofY, anchors.roofZ ?? -0.05]}>
            <Hat kind={cosmetics.hat} propellerRef={propellerRef} />
          </group>
        )}
      </group>
      {/* wheels: four instances each of tyre, rim and brake */}
      <instancedMesh ref={tyreRef} args={[wheelGeos.tyre, mats.tyre, 4]} castShadow frustumCulled={false} />
      <instancedMesh ref={rimRef} args={[wheelGeos.rim, mats.rim, 4]} frustumCulled={false} />
      <instancedMesh ref={brakeRef} args={[wheelGeos.brake, METAL_MAT, 4]} frustumCulled={false} />
      {/* exposed suspension */}
      {sp && (
        <>
          <instancedMesh ref={armRef} args={[suspGeos().arm, KIT_MAT, 4]} frustumCulled={false} />
          <instancedMesh ref={damperRef} args={[suspGeos().damper, KIT_MAT, 4]} frustumCulled={false} />
          <instancedMesh ref={coilRef} args={[suspGeos().coil, suspMats(sp.spring), 4]} castShadow frustumCulled={false} />
        </>
      )}
      {/* underglow */}
      {st.glow && (
        <group>
          <mesh position={[0, restY - wheelR + 0.015, 0]} rotation-x={-Math.PI / 2} geometry={GLOW_GEO} material={glowMat(st.glow, dark)} />
          {isLocal && dark && <pointLight position={[0, -0.1, 0]} color={st.glow} intensity={5} distance={2.2} />}
        </group>
      )}
      {/* boost flame, out of the exhaust */}
      <mesh ref={flameRef} position={[flame[0], flame[1], flame[2] - 0.12]} rotation-x={-Math.PI / 2} visible={false} geometry={FLAME_GEO} material={FLAME_MAT} />
      {/* shield bubble */}
      <mesh ref={shieldRef} visible={false} geometry={SHIELD_GEO}>
        <meshPhysicalMaterial color="#7ad8ff" transparent opacity={0.22} roughness={0} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* battery pack */}
      <group ref={batteryRef} visible={false} position={[0, 0.35, 0]}>
        <mesh castShadow geometry={BATTERY.body} material={BATTERY.mat} />
        <mesh position={[0, 0, 0.28]} rotation-x={Math.PI / 2} geometry={BATTERY.cap} material={BATTERY.capMat} />
      </group>
      {/* stun stars */}
      <group ref={stunRef} visible={false} position={[0, 0.55, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.35, 0, Math.sin((i / 3) * Math.PI * 2) * 0.35]} geometry={STAR_GEO} material={STAR_MAT} />
        ))}
      </group>
      {/* trail anchor + ribbon (world-space, portaled to the scene root) */}
      <group ref={trailAnchor} position={[0, 0.06, -0.55]} />
      {cosmetics?.trail && <Trail kind={cosmetics.trail} anchorRef={trailAnchor} speedRef={speedRef} />}
      {/* name tag */}
      {!isLocal && name && (
        <TextSprite text={name} size={0.34} y={1.2} color={team === 1 ? '#7ab8ff' : team === 0 ? '#ffb37a' : 'white'} />
      )}
    </group>
  );
}

// Where the antenna foot lands on this body (deck, bed wall or tub).
function shellTopAt(carId, x, z, wide, anchors) {
  if (carId === 'monster') return (anchors.bedDeck ?? 0.2) + 0.06;
  const b = shellBounds(carId, wide);
  const geo = shellGeos(carId, wide).paint;
  // highest paint vertex near the foot: robust to the ducktail and the tub
  const p = geo.attributes.position;
  let y = b.botY;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getX(i) - x) < 0.03 && Math.abs(p.getZ(i) - z) < 0.03) y = Math.max(y, p.getY(i));
  }
  return y - 0.004;
}

// ------------------------------------------------------------- shared bits
const plateGeos = new Map();
function plateGeo(w, h) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}`;
  if (!plateGeos.has(k)) plateGeos.set(k, new THREE.PlaneGeometry(w, h));
  return plateGeos.get(k);
}
const GLOW_GEO = new THREE.PlaneGeometry(1.15, 1.55);
const glowMats = new Map();
function glowMat(color, dark) {
  const k = `${color}|${dark}`;
  if (!glowMats.has(k)) {
    glowMats.set(k, new THREE.MeshBasicMaterial({
      map: glowTex(), color, transparent: true, opacity: dark ? 0.95 : 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
  }
  return glowMats.get(k);
}
const FLAME_GEO = new THREE.ConeGeometry(0.07, 0.3, 10).translate(0, 0.0, 0);
const FLAME_MAT = new THREE.MeshBasicMaterial({ color: '#7ab8ff', toneMapped: false, transparent: true, opacity: 0.9 });
const SHIELD_GEO = new THREE.SphereGeometry(0.85, 18, 14);
const BATTERY = {
  body: new THREE.BoxGeometry(0.3, 0.18, 0.5),
  cap: new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8),
  mat: new THREE.MeshStandardMaterial({ color: '#2ecc71', emissive: '#2ecc71', emissiveIntensity: 0.6 }),
  capMat: new THREE.MeshStandardMaterial({ color: '#f1c40f' }),
};
const STAR_GEO = new THREE.SphereGeometry(0.05, 6, 6);
const STAR_MAT = new THREE.MeshBasicMaterial({ color: '#ffe27a', toneMapped: false });

// ------------------------------------------------------------- driver
// Helmet in the accent colour, a dark visor, suit and arms to the wheel.
// Leans into corners via driverRef.
function Driver({ seat, trim, refGroup }) {
  const G = driverGeos();
  const [y, z, s] = seat;
  return (
    <group ref={refGroup} position={[0, y, z]} scale={s}>
      <mesh castShadow geometry={G.suit} material={KIT_MAT} />
      <mesh castShadow geometry={G.helmet} material={trim} />
      <mesh geometry={G.visor} material={METAL_MAT} />
    </group>
  );
}

// ------------------------------------------------------------- vinyl
// The wrap is projected onto the shell (DecalGeometry), so it follows every
// curve instead of floating over them as a flat card. Top and sides share one
// atlas texture and one draw; geometry is cached per body, material per wrap.
const vinylGeoCache = new Map();
function vinylGeo(carId, wide) {
  const key = `${carId}${wide ? ':w' : ''}`;
  if (vinylGeoCache.has(key)) return vinylGeoCache.get(key);
  const fit = VINYL_FIT[carId] || VINYL_FIT.balanced;
  const mesh = new THREE.Mesh(shellGeos(carId, wide).paint);
  const [tw, tl, tz] = fit.top;
  const [sl, sh, sy, sz] = fit.side;
  // top: looking straight down, v runs nose → tail (canvas top = rear)
  const top = new DecalGeometry(mesh, new THREE.Vector3(0, 0.3, tz), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector3(tw, tl, 0.8));
  // sides: one projector straight through the car, u runs nose → tail
  const side = new DecalGeometry(mesh, new THREE.Vector3(0, sy, sz), new THREE.Euler(0, Math.PI / 2, 0), new THREE.Vector3(sl, sh, 1));
  const P = new Parts();
  const keep = (g, test, remap) => {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const pos = [], nor = [], uvs = [];
    for (let i = 0; i < p.count; i += 3) {
      let ok = true;
      for (let k = 0; k < 3; k++) if (!test(n.getX(i + k), n.getY(i + k))) ok = false;
      if (!ok) continue;
      for (let k = 0; k < 3; k++) {
        const j = i + k, d = 0.0015; // lift off the paint along the normal
        pos.push(p.getX(j) + n.getX(j) * d, p.getY(j) + n.getY(j) * d, p.getZ(j) + n.getZ(j) * d);
        nor.push(n.getX(j), n.getY(j), n.getZ(j));
        const [u, v] = remap(uv.getX(j), uv.getY(j), n.getX(j));
        uvs.push(u, v);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return out;
  };
  // atlas: top wrap in the left third (full height), side wrap in the
  // right two thirds, top quarter
  P.add('v', keep(top, (nx, ny) => ny > 0.35, (u, v) => [u / 3, v]));
  P.add('v', keep(side, (nx) => Math.abs(nx) > 0.5, (u, v, nx) => [1 / 3 + (nx > 0 ? u : 1 - u) * (2 / 3), 0.75 + v * 0.25]));
  const g = P.build().v;
  vinylGeoCache.set(key, g);
  return g;
}
const vinylMats = new Map();
function vinylMat(id, color) {
  const key = `${id}|${color}`;
  if (vinylMats.has(key)) return vinylMats.get(key);
  const topImg = vinylTopTex(id, color).image, sideImg = vinylSideTex(id, color).image;
  const c = document.createElement('canvas');
  c.width = 768; c.height = 512;
  const g = c.getContext('2d');
  g.drawImage(topImg, 0, 0, 256, 512);
  g.drawImage(sideImg, 256, 0, 512, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshPhysicalMaterial({
    map: tex, transparent: true, depthWrite: false, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  vinylMats.set(key, m);
  return m;
}
function Vinyl({ carId, wide, vinyl, color }) {
  return <mesh geometry={vinylGeo(carId, wide)} material={vinylMat(vinyl, color)} renderOrder={2} />;
}

// ------------------------------------------------------------- antenna
// The whip is one tube mesh bent on the CPU each frame (a few dozen
// vertices) instead of a chain of nested segment meshes: the same curve along
// its length, two draws instead of five.
const ANTENNA_LEN = 0.45;
const WHIP_RINGS = 9, WHIP_SIDES = 5;
const ANTENNA_MAT = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5 });
const TIP = {
  ball: { geo: new THREE.SphereGeometry(0.07, 12, 10).translate(0, 0.03, 0), mat: new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff8c00', emissiveIntensity: 0.35, roughness: 0.3 }) },
  flag: {
    geo: (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.22, 0.06); s.lineTo(0, 0.12); return new THREE.ShapeGeometry(s).rotateY(Math.PI / 2).translate(0.005, -0.11, 0); })(),
    mat: new THREE.MeshStandardMaterial({ color: '#e8332a', side: THREE.DoubleSide, roughness: 0.8 }),
  },
  stock: { geo: new THREE.SphereGeometry(0.035, 10, 8).translate(0, 0.01, 0), mat: new THREE.MeshStandardMaterial({ color: '#ff3333', roughness: 0.4 }) },
};
function useWhip(kind) {
  const w = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const n = WHIP_RINGS * WHIP_SIDES;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let i = 0; i < WHIP_RINGS - 1; i++) {
      for (let j = 0; j < WHIP_SIDES; j++) {
        const a = i * WHIP_SIDES + j, b = a + WHIP_SIDES, c = i * WHIP_SIDES + ((j + 1) % WHIP_SIDES), d = c + WHIP_SIDES;
        idx.push(a, b, c, c, b, d);
      }
    }
    geo.setIndex(idx);
    const group = new THREE.Group();
    const rod = new THREE.Mesh(geo, ANTENNA_MAT);
    rod.frustumCulled = false;
    const tip = new THREE.Mesh();
    group.add(rod, tip);
    const pts = Array.from({ length: WHIP_RINGS }, () => new THREE.Vector3());
    const dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), e = new THREE.Euler();
    let last = [NaN, NaN];
    const bend = (pitch, roll) => {
      if (Math.abs(pitch - last[0]) < 1e-4 && Math.abs(roll - last[1]) < 1e-4) return;
      last = [pitch, roll];
      const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
      const seg = ANTENNA_LEN / (WHIP_RINGS - 1);
      pts[0].set(0, 0, 0);
      for (let i = 0; i < WHIP_RINGS; i++) {
        const s = i / (WHIP_RINGS - 1);
        // the bend accumulates along the rod: the tip swings furthest
        e.set(pitch * s, 0, -roll * s);
        q.setFromEuler(e);
        dir.copy(up).applyQuaternion(q);
        if (i > 0) pts[i].copy(pts[i - 1]).addScaledVector(dir, seg);
        const r = 0.012 - 0.006 * s;
        for (let j = 0; j < WHIP_SIDES; j++) {
          const a = (j / WHIP_SIDES) * Math.PI * 2;
          const k = (i * WHIP_SIDES + j) * 3;
          const cx = Math.cos(a), cz = Math.sin(a);
          pos[k] = pts[i].x + cx * r; pos[k + 1] = pts[i].y; pos[k + 2] = pts[i].z + cz * r;
          nor[k] = cx; nor[k + 1] = 0; nor[k + 2] = cz;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      tip.position.copy(pts[WHIP_RINGS - 1]);
      tip.quaternion.copy(q);
    };
    return { group, tip, bend };
  }, []);
  useLayoutEffect(() => {
    const t = TIP[kind] || TIP.stock;
    w.tip.geometry = t.geo;
    w.tip.material = t.mat;
  }, [kind, w]);
  return w;
}

// ------------------------------------------------------------- hats
// Each hat is one merged, vertex-coloured mesh (the propeller spins on its own).
const hatCache = new Map();
function hatGeo(kind) {
  if (hatCache.has(kind)) return hatCache.get(kind);
  const P = new Parts();
  switch (kind) {
    case 'cone':
      P.box('h', [0.28, 0.022, 0.28], [0, 0.011, 0], null, '#ff6b1a', 0.008);
      P.cyl('h', 0.03, 0.1, 0.22, [0, 0.13, 0], null, '#ff6b1a', 16);
      P.cyl('h', 0.066, 0.078, 0.04, [0, 0.1, 0], null, '#f5f5f5', 16);
      P.cyl('h', 0.043, 0.052, 0.025, [0, 0.165, 0], null, '#f5f5f5', 16);
      break;
    case 'tophat':
      P.cyl('h', 0.16, 0.16, 0.016, [0, 0.008, 0], null, '#15161c', 24);
      P.cyl('h', 0.1, 0.11, 0.2, [0, 0.11, 0], null, '#15161c', 20);
      P.cyl('h', 0.113, 0.113, 0.03, [0, 0.03, 0], null, '#c0392b', 20);
      break;
    case 'propeller':
      P.add('h', new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), null, '#3498db');
      for (let i = 0; i < 4; i++) {
        P.add('h', new THREE.SphereGeometry(0.1105, 4, 8, (i / 4) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2), null, ['#e8332a', '#f1c40f', '#2ecc71', '#f5f5f5'][i]);
      }
      P.box('h', [0.1, 0.01, 0.06], [0, 0.005, 0.1], [0.2, 0, 0], '#3498db', 0.004);
      P.cyl('h', 0.01, 0.01, 0.06, [0, 0.13, 0], null, '#f1c40f', 8);
      break;
    case 'plant':
      P.cyl('h', 0.07, 0.055, 0.09, [0, 0.045, 0], null, '#b5651d', 16);
      P.cyl('h', 0.074, 0.074, 0.016, [0, 0.086, 0], null, '#9a531a', 16);
      P.cyl('h', 0.064, 0.064, 0.004, [0, 0.092, 0], null, '#3a2616', 16);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        P.add('h', new THREE.SphereGeometry(0.03, 6, 4), mat4([Math.cos(a) * 0.035, 0.13 + (i % 2) * 0.02, Math.sin(a) * 0.035], [0.5 * Math.sin(a), a, 0.5 * Math.cos(a)], [0.7, 1.9, 0.45]), i % 2 ? '#2ecc71' : '#27ae60');
      }
      break;
    default:
  }
  const g = P.slots.h ? P.build().h : null;
  hatCache.set(kind, g);
  return g;
}
const PROP_GEO = (() => {
  const P = new Parts();
  P.box('p', [0.3, 0.008, 0.045], [0, 0, 0], [0.25, 0, 0], '#e8332a', 0.003);
  P.box('p', [0.045, 0.008, 0.3], [0, 0, 0], [0, 0, 0.25], '#e8332a', 0.003);
  P.sphere('p', 0.014, [0, 0.004, 0], '#f1c40f', 8, 6);
  return P.build().p;
})();
function Hat({ kind, propellerRef }) {
  const g = hatGeo(kind);
  if (!g) return null;
  return (
    <group>
      <mesh castShadow geometry={g} material={KIT_MAT} />
      {kind === 'propeller' && <mesh ref={propellerRef} position={[0, 0.165, 0]} geometry={PROP_GEO} material={KIT_MAT} />}
    </group>
  );
}

// ------------------------------------------------------------- LODs
// Mid LOD (RemoteCars, 12–28 u): the same merged car with the wheels baked
// in and the metals folded into the kit draw — no suspension, driver or
// moving parts. Six-ish draws. The name tag stays, as it always has out to
// the far LOD.
export function CarMid({ carId, paint, style, tune, name, team }) {
  const car = CARS[carId] || CARS.balanced;
  const id = CARS[carId] ? carId : 'balanced';
  const st = useMemo(() => (style ? sanitizeStyle(style) : DEFAULT_STYLE), [style]);
  const tu = useMemo(() => (tune ? sanitizeTune(tune) : STOCK_TUNE), [tune]);
  const T = useMemo(() => tunedStats(car, tu), [car, tu]);
  const night = useStore((s) => s.night);
  const event = useStore((s) => s.event);
  const dark = night || event?.id === 'lights_out';
  const tyre = TYRES[st.tyre] || TYRES.road;
  const wheelR = (id === 'monster' ? 0.18 : 0.13) * tyre.r;
  const wheelW = (id === 'formula' ? 0.1 : 0.14) * tyre.w * (1 + 0.075 * tu.tires);
  const wide = st.flares === 'wide';
  const restY = -0.05 - T.settle + wheelR;
  const S = useMemo(() => buildCar(id, {
    wide, front: st.front, hood: st.hood, roof: st.roof, skirts: st.skirts, exhaust: st.exhaust,
    spoiler: st.spoiler, wing: tu.wing, wheelR, wheelW, trackOut: wide ? 0.03 : 0, trim: !!st.accent,
    mid: true, restY,
  }).slots, [id, wide, st, tu.wing, wheelR, wheelW, restY]);
  const color = paint || car.color;
  const paintM = paintMat(color, st.finish, FINISHES);
  const trimM = paintMat(st.accent || color, st.finish, FINISHES);
  return (
    <group>
      {S.outline && <mesh geometry={S.outline} material={OUTLINE_MAT} />}
      <mesh geometry={S.paint} material={paintM} />
      {S.trim && <mesh geometry={S.trim} material={trimM} />}
      {S.kit && <mesh geometry={S.kit} material={KIT_MAT} />}
      {S.head && <mesh geometry={S.head} material={dark ? HEAD_NIGHT : HEAD_DAY} />}
      {S.tail && <mesh geometry={S.tail} material={TAIL_MAT} />}
      {S.glass && <mesh geometry={S.glass} material={glassMat(st.tint)} />}
      {name && <TextSprite text={name} size={0.34} y={1.2} color={team === 1 ? '#7ab8ff' : team === 0 ? '#ffb37a' : 'white'} />}
    </group>
  );
}

// Far-LOD stand-in: the shell in its paint plus a dark block for wheels and
// chassis — two draws, and the silhouette matches so the switch is invisible.
const PROXY_BASE = new THREE.BoxGeometry(0.7, 0.18, 0.86);
const PROXY_DARK = new THREE.MeshBasicMaterial({ color: '#17181c' });
export function CarProxy({ carId, paint }) {
  const car = CARS[carId] || CARS.balanced;
  const id = CARS[carId] ? carId : 'balanced';
  const color = paint || car.color;
  const mat = paintMat(color, 'matte', FINISHES);
  const b = shellBounds(id);
  return (
    <group>
      <mesh geometry={shellGeos(id).paint} material={mat} />
      <mesh position={[0, b.botY - 0.07, 0]} geometry={PROXY_BASE} material={PROXY_DARK} />
    </group>
  );
}
