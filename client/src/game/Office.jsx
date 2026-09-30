// The handcrafted office: floors, walls, glass, windows, ceiling, big
// furniture, ramps, rain, skyline, dust and floating paper. Static physics.
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { Dust } from './dust.jsx';
import * as THREE from 'three';
import { M, SURFACES } from '@rc/shared';
import { useMap } from './activeMap.js';
import { THEMES, PIECES, RAMP_SKINS, WALL_STYLES } from './themes/index.js';
import { useStore } from '../store.js';
import { lightingFor } from './daylight.js';
import Practicals from './Practicals.jsx';
import { withFloorAO } from './floorAO.js';
import { mat, castsShadow, receivesShadow, foldTint } from './materials.js';
import { bake, placeMatrix } from './kit.js';
import { buildPiece, pieceContext, rampParts } from './furniture.js';
import { buildArchitecture } from './architecture.js';
import { raisedTex, raisedNormal, marbleTex, marbleNormal, epoxyTex, rubberTex, rubberNormal, carpetTex, woodTex, tileTex, concreteTex, stainTex, skylineTex, glowTex, shaftTex, ceilingTex, carpetNormal, woodNormal, tileNormal, concreteNormal, orangePeel, wearRough } from './textures.js';

// Every floor gets three maps, not one. Albedo alone reads as coloured
// plastic under a directional light; the normal gives the surface something
// for a low sun to rake across, and the roughness breakup stops the whole
// room sharing one specular response. See textures.js — all procedural.
// Carpet pile, not gravel: at 0.5 the low golden-hour sun raked every speck
// of the normal map into a pebble, and from 18 cm up the open office read as
// a dirt road.
const CARPET_BUMP = 0.22;
const FLOOR_MATS = {
  carpet: () => new THREE.MeshStandardMaterial({
    map: carpetTex('#3e4a5e'), normalMap: carpetNormal(), normalScale: new THREE.Vector2(CARPET_BUMP, CARPET_BUMP),
    roughnessMap: wearRough('carpet', 238, 10, [18, 18]), roughness: 1,
  }),
  carpet2: () => new THREE.MeshStandardMaterial({
    map: carpetTex('#4a3e5e'), normalMap: carpetNormal(), normalScale: new THREE.Vector2(CARPET_BUMP, CARPET_BUMP),
    roughnessMap: wearRough('carpet', 238, 10, [18, 18]), roughness: 1,
  }),
  tile: () => new THREE.MeshStandardMaterial({
    map: tileTex(), normalMap: tileNormal(), normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: wearRough('tile', 70, 22, [14, 14]), roughness: 1, metalness: 0.05, envMapIntensity: 0.8,
  }),
  wood: () => new THREE.MeshStandardMaterial({
    map: woodTex(), normalMap: woodNormal(), normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: wearRough('wood', 120, 22, [10, 10]), roughness: 1, envMapIntensity: 0.6,
  }),
  dark: () => new THREE.MeshStandardMaterial({
    map: raisedTex(), normalMap: raisedNormal(), normalScale: new THREE.Vector2(0.5, 0.5),
    roughnessMap: wearRough('raised', 110, 20, [8, 8]), roughness: 1, metalness: 0.15,
  }),
  concrete: () => new THREE.MeshStandardMaterial({
    map: concreteTex(), normalMap: concreteNormal(), normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: wearRough('conc', 225, 16, [8, 8]), roughness: 1,
  }),
  // polished: low roughness so the room's lights pool in it
  marble: () => new THREE.MeshStandardMaterial({
    map: marbleTex(), normalMap: marbleNormal(), normalScale: new THREE.Vector2(0.5, 0.5),
    roughnessMap: wearRough('marble', 40, 18, [8, 8]), roughness: 1, envMapIntensity: 1.1,
  }),
  epoxy: () => new THREE.MeshStandardMaterial({
    map: epoxyTex(), normalMap: orangePeel('epoxy', 0.4, [10, 10]), normalScale: new THREE.Vector2(0.25, 0.25),
    roughnessMap: wearRough('epoxy', 95, 30, [10, 10]), roughness: 1, envMapIntensity: 0.8,
  }),
  rubber: () => new THREE.MeshStandardMaterial({
    map: rubberTex(), normalMap: rubberNormal(), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.85,
  }),
};

// The floor, walls, furniture and ramps come from the map's data; the rest
// is the map's theme — the office has its windows, skyline and daylight,
// every other floor its own dressing (themes/*.jsx). Keyed on the map, so a new map
// mounts fresh colliders instead of patching the old ones.
// How many texture cells each floor material's maps tile per UV unit (the
// repeat baked into its textures above). Floors are laid in world space: a
// room's UVs come from its world position divided by the floor's real cell
// size (SURFACES[floor].cell, metres), so a tile is 60 cm in every room,
// the pattern runs on through doorways, and the seam bumps in
// shared/src/surfaces.js sit exactly on the grout you see.
const FLOOR_REPEAT = { carpet: 18, carpet2: 18, tile: 14, wood: 10, dark: 8, concrete: 8, marble: 8, epoxy: 10, rubber: 16 };

function floorGeometry(r) {
  const g = new THREE.PlaneGeometry(r.w, r.d);
  const cellU = (SURFACES[r.floor]?.cell || 1) * M * (FLOOR_REPEAT[r.floor] || 1);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    // the plane lies rotated −90° about x: local y runs to world −z
    uv.setXY(i, (r.x + pos.getX(i)) / cellU, -(r.z - pos.getY(i)) / cellU);
  }
  return g;
}

export default function Office() {
  const map = useMap();
  const Dressing = THEMES[map.theme]?.Dressing;
  return (
    <group key={map.id}>
      <Floors map={map} />
      <Walls map={map} />
      <BigFurniture map={map} />
      <Ramps map={map} />
      <Practicals map={map} />
      {Dressing ? <Dressing map={map} /> : (
        <>
          <Ceiling map={map} />
          <Outside />
          <Ambience />
          <LightPools />
          <LightShafts />
        </>
      )}
    </group>
  );
}

// -------------------------------------------- baked-look light pools & shafts
// Positions mirror the ceiling pointLights in Lighting.jsx. Additive floor
// quads sell the fixtures' cast for free; brightest at night, dead in a
// blackout (only the server-room emergency pool stays, turning red).
const POOL_SPOTS = [[-17.5, -6], [-1, 1.5], [2.5, -8], [-0.5, 9.5], [17, 1.5], [17, -7], [-11, -1]];

function LightPools() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const light = lightingFor(hour, lightsOut);
  const glow = useMemo(() => glowTex(), []);
  const warmMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: glow, color: '#ffe3b0', transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }), [glow]);
  const serverMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: glow, color: '#3d7bff', transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }), [glow]);
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 2.5);
    warmMat.opacity += (light.pool - warmMat.opacity) * k;
    serverMat.opacity += ((lightsOut ? 0.4 : Math.max(0.12, light.pool)) - serverMat.opacity) * k;
    serverMat.color.lerp(lightsOut ? SERVER_RED : SERVER_BLUE, k);
  });
  return (
    <group>
      {POOL_SPOTS.map(([x, z], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x * M, 0.03, z * M]} material={warmMat}>
          <planeGeometry args={[11, 11]} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[9.5 * M, 0.03, 4.5 * M]} material={serverMat}>
        <planeGeometry args={[9, 9]} />
      </mesh>
    </group>
  );
}

const SERVER_RED = new THREE.Color('#ff5040'), SERVER_BLUE = new THREE.Color('#3d7bff');
const _shaftColor = new THREE.Color();

// Light through the north windows, laid down as giant parallel slabs. These
// are the bands you drive through, so they take their tilt from the sun's
// elevation: a low golden-hour sun lays them almost flat along the floor and
// a high afternoon sun drops them steeply onto it.
function LightShafts() {
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const group = useRef();
  const mat = useRef();
  const tex = useMemo(() => shaftTex(), []);
  const light = lightingFor(hour, lightsOut);
  useFrame((_, dt) => {
    if (!mat.current) return;
    const k = Math.min(1, dt * 1.8);
    const s = light.shaft;
    mat.current.opacity += (s.opacity - mat.current.opacity) * k;
    mat.current.color.lerp(_shaftColor.set(s.color), k);
    if (group.current) {
      group.current.rotation.x += (s.tilt - group.current.rotation.x) * k;
      group.current.rotation.y += (s.yaw - group.current.rotation.y) * k;
      const sc = s.length / 22;
      group.current.scale.y += (sc - group.current.scale.y) * k;
    }
  });
  // shared material across all shafts (first mesh's ref drives them all)
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: tex, color: '#8fa8ff', transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }), [tex]);
  mat.current = material;
  return (
    <group ref={group} position={[0, 6.1, 50]} rotation-x={0.99}>
      {[-50, -20, 10, 40, 70].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} material={material}>
          <planeGeometry args={[7, 22]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ floors
function Floors({ map }) {
  const { ROOMS, MAP_BOUNDS } = map;
  // a map can tint a floor type (the cellar's lino and concrete are older and
  // greyer than upstairs): the tint multiplies the albedo map
  // Every floor also takes the map's baked occlusion and wear (floorAO.js):
  // dark under furniture and along the walls, polished down the racing line.
  // (Floors remounts with its map — Office keys the group on map.id.)
  const tints = map.LOOK?.floors;
  const mats = useMemo(() => Object.fromEntries(Object.entries(FLOOR_MATS).map(([k, fn]) => {
    const m = fn();
    if (tints?.[k]) m.color.set(tints[k]);
    withFloorAO(m, map);
    return [k, m];
  })), [tints]);
  const stain = useMemo(() => new THREE.MeshBasicMaterial({ map: stainTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), []);
  const stains = map.STAINS || [];
  const floorGeos = useMemo(() => ROOMS.map(floorGeometry), [ROOMS]);
  useEffect(() => () => floorGeos.forEach((g) => g.dispose()), [floorGeos]);
  return (
    <>
      {/* one big physics slab under the whole building + balcony */}
      <RigidBody type="fixed" colliders={false} friction={1.1}>
        <CuboidCollider args={[(MAP_BOUNDS.maxX - MAP_BOUNDS.minX) / 2 + 1, 2, (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ) / 2 + 1]} position={[0, -2, 0]} />
      </RigidBody>
      {ROOMS.map((r, i) => (
        <mesh key={r.id} rotation-x={-Math.PI / 2} position={[r.x, r.floor === 'concrete' ? -0.02 : 0, r.z]} receiveShadow
          material={mats[r.floor]} geometry={floorGeos[i]} />
      ))}
      {/* coffee stains */}
      {stains.map(([x, z, s], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} rotation-z={i * 1.7} position={[x * M, 0.02, z * M]} material={stain}>
          <planeGeometry args={[s * M * 0.35, s * M * 0.3]} />
        </mesh>
      ))}
    </>
  );
}

// ------------------------------------------------------------------- walls
// One static rigid body holds every wall collider. What the walls look like
// — paint, skirting, door frames, glass with mullions, balustrades, the
// office's sockets and scuffs — is architecture.js, baked into the same
// static batch as the furniture. Walls with a { style } are drawn by their
// theme (WALL_STYLES).
function Walls({ map }) {
  const { WALLS } = map;
  const styled = useMemo(() => {
    const by = {};
    for (const w of WALLS) if (w.style && WALL_STYLES[w.style]) (by[w.style] ||= []).push(w);
    return by;
  }, [WALLS]);
  return (
    <group>
      <RigidBody type="fixed" colliders={false} friction={0.2}>
        {WALLS.map((w, i) => (
          <CuboidCollider key={i} args={[w.w / 2, w.h / 2, w.d / 2]} position={[w.x, w.h / 2, w.z]} />
        ))}
      </RigidBody>
      {Object.entries(styled).map(([style, walls]) => {
        const Style = WALL_STYLES[style];
        return <Style key={style} walls={walls} />;
      })}
    </group>
  );
}

// ----------------------------------------------------------------- ceiling
// A suspended ceiling on a 60 cm grid (world-metre UVs, so the grid runs on
// unbroken over every room), recessed troffers snapped to it.
function ceilingGeometry(x, z, w, d) {
  const g = new THREE.PlaneGeometry(w * M, d * M);
  const pos = g.attributes.position, uv = g.attributes.uv;
  // (the slab is turned +90° about x, so its local +y runs along world +z)
  for (let i = 0; i < pos.count; i++) uv.setXY(i, x + pos.getX(i) / M, z + pos.getY(i) / M);
  return g;
}

// The troffer's bezel: a box with no lid, so from above (photo mode's
// aerial, through the face-down ceiling) it doesn't read as a white slab
const BEZEL_GEO = (() => {
  const g = new THREE.BoxGeometry(1.22 * M, 0.06, 0.62 * M);
  const idx = g.index.array; // faces +x, −x, +y, −y, +z, −z: six indices each
  g.setIndex([...idx.slice(0, 12), ...idx.slice(18)]);
  return g;
})();

function Ceiling({ map }) {
  const { WALL_HEIGHT } = map;
  const hour = useStore((s) => s.timeOfDay);
  const event = useStore((s) => s.event);
  const lightsOut = event?.id === 'lights_out';
  const panelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4dd', emissiveIntensity: 1.6 }), []);
  // front side only: the slabs face down, so from above (photo mode's
  // aerial) the office reads as a dollhouse, not a white lid
  const tileMat = useMemo(() => new THREE.MeshStandardMaterial({ map: ceilingTex(), roughness: 0.95 }), []);
  // ease toward the phase target like every other light in the building
  // (Lighting.jsx, LightPools, LightShafts all lerp at ~dt*1.8) — assigning
  // it synchronously made the 140 panels snap while the world cross-faded
  useFrame((_, dt) => {
    const target = lightingFor(hour, lightsOut).panel;
    panelMat.emissiveIntensity += (target - panelMat.emissiveIntensity) * Math.min(1, dt * 1.8);
  });
  // the main slab covers everything east of the balcony, plus the reception
  // strip (the balcony above stays open sky)
  // (they meet at x −14.2 rather than overlap: two coplanar slabs z-fight)
  const slabs = useMemo(() => [ceilingGeometry(3.5, 0, 35.4, 24.4), ceilingGeometry(-17.7, -6.5, 7, 11.4)], []);
  useEffect(() => () => slabs.forEach((g) => g.dispose()), [slabs]);
  const panels = useMemo(() => {
    // does a troffer centred at (x, z) metres cut through a wall's top?
    const hitsWall = (x, z) => map.WALLS.some((w) => !w.low
      && Math.abs(x * M - w.x) < w.w / 2 + 0.62 * M && Math.abs(z * M - w.z) < w.d / 2 + 0.32 * M);
    const out = [];
    for (let x = -19.4; x <= 19.4; x += 3.4) {
      for (let z = -10.4; z <= 10.4; z += 3.2) {
        if (map.roomAt(x * M, z * M)?.outdoor) continue; // balcony is open sky
        // snapped to the grid: a 1.2 × 0.6 m troffer fills two tiles exactly
        let sx = Math.round(x / 0.6) * 0.6, sz = (Math.round(z / 0.6 - 0.5) + 0.5) * 0.6;
        // the z −4 row fell on the long wall between the cafeteria and the
        // rooms north of it, half a light each side: step one tile clear
        if (hitsWall(sx, sz)) {
          const clear = [[0, 0.6], [0, -0.6], [0.6, 0], [-0.6, 0], [0, 1.2], [0, -1.2]].find(([dx, dz]) => !hitsWall(sx + dx, sz + dz));
          if (!clear) continue;
          sx += clear[0]; sz += clear[1];
        }
        out.push([sx * M, sz * M]);
      }
    }
    return out;
  }, [map]);
  const inst = useRef();
  const bezel = useRef();
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    panels.forEach(([x, z], i) => {
      // the diffuser hangs a hair below the bezel's underside: flush, the two z-fought
      dummy.position.set(x, WALL_HEIGHT - 0.07, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, WALL_HEIGHT - 0.03, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bezel.current.setMatrixAt(i, dummy.matrix);
    });
    inst.current.instanceMatrix.needsUpdate = true;
    bezel.current.instanceMatrix.needsUpdate = true;
  }, [panels]);
  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position={[3.5 * M, WALL_HEIGHT, 0]} geometry={slabs[0]} material={tileMat} />
      <mesh rotation-x={Math.PI / 2} position={[-17.7 * M, WALL_HEIGHT, -6.5 * M]} geometry={slabs[1]} material={tileMat} />
      <instancedMesh ref={inst} args={[null, null, panels.length]} material={panelMat} frustumCulled={false}>
        <planeGeometry args={[1.16 * M, 0.56 * M]} />
      </instancedMesh>
      {/* the troffer's white steel bezel round the diffuser */}
      <instancedMesh ref={bezel} args={[BEZEL_GEO, null, panels.length]} material={mat('powderWhite')} frustumCulled={false}>
      </instancedMesh>
    </group>
  );
}

// ------------------------------------------------------------ big furniture
// Every piece is a pure builder (furniture.js): visuals in metres, colliders
// in units. The colliders go on one fixed body per piece, exactly as before;
// the visuals are baked into ONE mesh per material for the whole floor —
// every desk, leg, tray and cable in the building is a handful of draw
// calls. (Splitting by room to cull didn't pay: an open-plan floor behind
// glass has most rooms in view, and each one multiplied the draws.) A
// theme's PIECES (React components) still render as components; a theme's
// BUILDERS join the batch.
const THEME_BUILDERS = Object.assign({}, ...Object.values(THEMES).map((t) => t.BUILDERS || {}));

// What a theme's component PIECES get as `mats`: the shared library under
// the names they have always used.
const LEGACY_MATS = {
  wood: 'veneerOak', metal: 'brushedSteel', fabric: 'fabric:#5b8bd6', fabric2: 'fabric:#c0573f',
  white: 'plasticWhite', dark: 'laminateCharcoal', grey: 'melamineGrey', ceramic: 'ceramic', felt: 'felt', teal: 'feltTeal',
};

function BigFurniture({ map }) {
  const { FURNITURE } = map;
  const legacy = useMemo(() => Object.fromEntries(Object.entries(LEGACY_MATS).map(([k, v]) => [k, mat(v)])), []);
  const built = useMemo(() => FURNITURE.map((f, i) => {
    if (PIECES[f.type] && !THEME_BUILDERS[f.type]) return null;
    const ctx = pieceContext(map, f, i);
    const b = (THEME_BUILDERS[f.type] || buildPiece)(f, ctx);
    return { f, ...b };
  }), [map, FURNITURE]);
  return (
    <group>
      {built.map((b, i) => (b && b.colliders.length ? (
        <RigidBody key={i} type="fixed" colliders={false} position={[b.f.x, 0, b.f.z]} rotation-y={b.f.rotY || 0} friction={b.friction}>
          {b.colliders.map((c, k) => (c.cyl
            ? <CylinderCollider key={k} args={c.cyl} position={c.at} />
            : <CuboidCollider key={k} args={c.box} position={c.at} rotation={c.rot || [0, 0, 0]} />))}
        </RigidBody>
      ) : null))}
      <StaticBatch map={map} built={built} />
      <Leds built={built} />
      {FURNITURE.map((f, i) => {
        const Piece = !built[i] && PIECES[f.type];
        return Piece ? <Piece key={i} f={f} mats={legacy} /> : null;
      })}
    </group>
  );
}

// The batch: every built piece's parts, the ramps' and the building's, moved
// into the world and merged by material.
// The last floor's bake is kept across mounts: the scene remounts for
// every match, and re-baking the office (≈0.5 M vertices) cost 100–600 ms of
// main thread each time. It is disposed when another floor replaces it.
let lastBake = null;
function StaticBatch({ map, built }) {
  const groups = useMemo(() => {
    if (lastBake?.map === map) return lastBake.groups;
    const all = [];
    const push = (parts, world) => {
      for (const part of parts) all.push({ ...foldTint(part), m: world.clone().multiply(part.m) });
    };
    for (const b of built) if (b) push(b.parts, placeMatrix(b.f.x, b.f.z, b.f.rotY, M));
    for (const r of map.RAMPS) if (!RAMP_SKINS[r.skin]) push(rampParts(r), placeMatrix(r.x, r.z, r.rotY, M));
    // the building's parts are already in world metres
    const office = !THEMES[map.theme];
    push(buildArchitecture(map, { office, styled: new Set(Object.keys(WALL_STYLES)) }), new THREE.Matrix4().makeScale(M, M, M));
    return [...bake(all)].map(([key, geo]) => ({ key, geo }));
  }, [map, built]);
  // the old floor's bake is freed once the new one is committed, not while
  // rendering it: a render can be interrupted or suspended with the old
  // meshes still drawing, which re-uploads what was just disposed (and then
  // nothing ever frees it)
  useEffect(() => {
    if (lastBake?.groups === groups) return;
    lastBake?.groups.forEach((g) => g.geo.dispose());
    lastBake = { map, groups };
  }, [map, groups]);
  return groups.map((g) => (
    <mesh key={g.key} geometry={g.geo} material={mat(g.key)} castShadow={castsShadow(g.key)} receiveShadow={receivesShadow(g.key)} />
  ));
}

// Status LEDs for every rack on the map: one instanced mesh, blinking.
const _led = new THREE.Color();
function Leds({ built }) {
  const ref = useRef();
  const leds = useMemo(() => {
    const out = [];
    const o = new THREE.Object3D();
    for (const b of built) {
      if (!b?.leds) continue;
      const world = placeMatrix(b.f.x, b.f.z, b.f.rotY, M);
      for (const l of b.leds) {
        o.position.set(...l.at);
        o.rotation.set(0, l.yaw || 0, 0);
        o.scale.setScalar(0.016);
        o.updateMatrix();
        // over-bright on purpose: they sit behind a perforated door, and the
        // bloom is what makes a rack read as alive from across the room
        out.push({ ...l, m: world.clone().multiply(o.matrix), color: new THREE.Color(l.c).multiplyScalar(2.2) });
      }
    }
    return out;
  }, [built]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    leds.forEach((l, i) => ref.current.setMatrixAt(i, l.m));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [leds]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < leds.length; i++) {
      const l = leds[i];
      _led.copy(l.color).multiplyScalar(Math.sin(t * l.speed + l.phase) > -0.3 ? 1 : 0.06);
      ref.current.setColorAt(i, _led);
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  if (!leds.length) return null;
  return (
    <instancedMesh ref={ref} args={[null, null, leds.length]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------- ramps
// A ramp's collider is its deck; what it looks like is its skin — a theme's
// (RAMP_SKINS, drawn here as a component) or a built-in one (furniture.js
// rampParts: plank, dustpan, binder, books, clipboard, ruler, steel,
// pallet), baked with the furniture.
function Ramps({ map }) {
  const { RAMPS } = map;
  const mats = useMemo(() => ({ deck: mat('mdf'), body: mat('mdf') }), []);
  return (
    <group>
      {RAMPS.map((r, i) => {
        const angle = Math.atan2(r.rise, r.l);
        const len = Math.hypot(r.l, r.rise);
        const Skin = RAMP_SKINS[r.skin];
        return (
          <RigidBody key={i} type="fixed" colliders={false} position={[r.x, 0, r.z]} rotation-y={r.rotY} friction={1.2}>
            <group rotation-x={-angle} position={[0, r.rise / 2, 0]}>
              <CuboidCollider args={[r.w / 2, 0.04, len / 2]} />
            </group>
            {Skin && <Skin r={r} len={len} angle={angle} mats={mats} />}
          </RigidBody>
        );
      })}
    </group>
  );
}

// ------------------------------------------- outside: skyline, rain, night
function Outside() {
  const hour = useStore((s) => s.timeOfDay);
  const wet = lightingFor(hour, false).wet;
  const sky = useMemo(() => skylineTex(), []);
  return (
    <group>
      {/* city backdrop past the north windows */}
      <mesh position={[0, 10 * M * 0.32, 27 * M]} rotation-y={Math.PI}>
        <planeGeometry args={[140 * M, 11 * M]} />
        <meshBasicMaterial map={sky} fog={false} />
      </mesh>
      <mesh position={[-27 * M, 10 * M * 0.32, 5 * M]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[90 * M, 11 * M]} />
        <meshBasicMaterial map={sky} fog={false} />
      </mesh>
      <Rain />
      {/* wet balcony sheen once the light has gone */}
      {wet && (
        <mesh rotation-x={-Math.PI / 2} position={[-17.5 * M, 0.01, 5.5 * M]}>
          <planeGeometry args={[7 * M, 13 * M]} />
          <meshStandardMaterial color="#20242e" roughness={0.08} metalness={0.4} transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

const RAIN_COUNT = 350;
function Rain() {
  const ref = useRef();
  const drops = useMemo(() => Array.from({ length: RAIN_COUNT }, () => ({
    // over the balcony terrace and just outside the north windows
    x: Math.random() < 0.55 ? (-21 + Math.random() * 7) * M : (-14 + Math.random() * 35) * M,
    z: 0,
    y: Math.random() * 60,
    speed: 55 + Math.random() * 25,
  })), []);
  useMemo(() => {
    drops.forEach((d) => {
      d.z = d.x < -14 * M ? (-1 + Math.random() * 13) * M : (12.5 + Math.random() * 6) * M;
    });
  }, [drops]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const d = drops[i];
      d.y -= d.speed * dt;
      if (d.y < 0) d.y = 55 + Math.random() * 10;
      dummy.position.set(d.x, d.y, d.z);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, RAIN_COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.03, 1.4, 0.03]} />
      <meshBasicMaterial color="#9fb6d8" transparent opacity={0.4} />
    </instancedMesh>
  );
}

// -------------------------------------------------- dust + floating paper
function Ambience() {
  const papers = useRef();
  const paperData = useMemo(() => Array.from({ length: 12 }, () => ({
    x: (Math.random() * 36 - 18) * M,
    z: (Math.random() * 20 - 10) * M,
    y: 3 + Math.random() * 10,
    phase: Math.random() * 10,
    spin: 0.3 + Math.random(),
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!papers.current) return;
    const t = clock.elapsedTime;
    paperData.forEach((p, i) => {
      dummy.position.set(
        p.x + Math.sin(t * 0.3 + p.phase) * 3,
        p.y + Math.sin(t * 0.5 + p.phase * 2) * 1.5,
        p.z + Math.cos(t * 0.24 + p.phase) * 3,
      );
      dummy.rotation.set(t * p.spin, p.phase + t * 0.4, Math.sin(t + p.phase));
      dummy.updateMatrix();
      papers.current.setMatrixAt(i, dummy.matrix);
    });
    papers.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <Dust count={140} scale={[140, 15, 90]} position={[0, 8, 0]} size={2.2} speed={0.25} opacity={0.35} color="#ffe9c9" />
      <instancedMesh ref={papers} args={[null, null, 12]} frustumCulled={false}>
        <planeGeometry args={[1.16, 1.65]} />
        <meshStandardMaterial color="#f4f2ec" side={THREE.DoubleSide} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
