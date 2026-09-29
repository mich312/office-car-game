// The material library. Every model in the building draws from here: one
// material per surface kind, built lazily and shared by every piece that
// uses it — so the static batch (Office.jsx) can merge a whole room's oak
// into one draw call, and no component ever creates a material inline.
//
// The convention that makes that possible: 1 UV unit = 1 metre on every
// geometry (kit.js). Each texture's repeat is 1 / (its tile size in metres),
// so the grain on a 10 m counter and on a 4 cm drawer front has the same
// density, and one material serves both.
//
//   mat('veneerOak')         a named material
//   mat('fabric:#3f6fa8')    a parameterised one, cached per argument
//
// Colour variation (books, cans, binders, foosball men) goes through the
// batch's per-vertex colour on a material with vertexColors, never a
// material per colour.
import * as THREE from 'three';
import {
  veneerTex, veneerNormal, butcherTex, brushedRough, perfAlphaTex, slotAlphaTex, terrazzoTex, leatherNormal,
  cardboardTex, louvreNormal, chequerNormal, subwayTex, subwayNormal, rugAtlas, artAtlas, labelAtlas,
  fabricNormal, orangePeel, wearRough, carpetNormal, rulerTex, smudgeTex, scuffTex,
} from './textures.js';

const V = (s) => new THREE.Vector2(s, s);
const std = (o) => new THREE.MeshStandardMaterial(o);

// A texture shared by several materials at different tilings must be cloned
// (repeat lives on the texture). The canvas is shared; only the uv transform
// differs.
const tiled = (tex, rx, ry = rx) => {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
};

// orange peel for anything moulded or powder-coated: 20 cm cells
const peel = () => orangePeel('kit', 0.6, [5, 5]);

const MAKERS = {
  // ----------------------------------------------------------- timber
  veneerOak: () => std({ color: '#c89a66', map: veneerTex(), normalMap: veneerNormal(), normalScale: V(0.25), roughness: 0.55, roughnessMap: wearRough('veneer', 150, 26, [2, 2]), envMapIntensity: 0.6 }),
  veneerWalnut: () => std({ color: '#6a452b', map: veneerTex(), normalMap: veneerNormal(), normalScale: V(0.3), roughness: 0.5, roughnessMap: wearRough('veneer', 150, 26, [2, 2]), envMapIntensity: 0.7 }),
  butcherBlock: () => std({ color: '#d3a46e', map: butcherTex(), normalMap: veneerNormal(), normalScale: V(0.2), roughness: 0.6 }),
  // raw board: ramps, pallets, the inside of carcasses
  mdf: () => std({ color: '#dcc49a', map: veneerTex(), normalMap: veneerNormal(), normalScale: V(0.15), roughness: 0.75 }),
  ruler: () => std({ map: rulerTex(), normalMap: veneerNormal(), normalScale: V(0.2), roughness: 0.6 }),
  teak: () => std({ color: '#b07a4a', map: veneerTex(), normalMap: veneerNormal(), normalScale: V(0.45), roughness: 0.7 }),

  // ------------------------------------------------------ laminates
  laminateWhite: () => std({ color: '#ecebe6', normalMap: peel(), normalScale: V(0.2), roughness: 0.6, roughnessMap: wearRough('lam', 150, 18, [2, 2]) }),
  laminateSage: () => std({ color: '#9fb3a0', normalMap: peel(), normalScale: V(0.2), roughness: 0.55 }),
  laminateCharcoal: () => std({ color: '#3a3e45', normalMap: peel(), normalScale: V(0.2), roughness: 0.55 }),
  melamineGrey: () => std({ color: '#b9bfc7', normalMap: peel(), normalScale: V(0.2), roughness: 0.5 }),

  // ------------------------------------------------------ metals
  powderWhite: () => std({ color: '#e9e9e6', metalness: 0.15, roughness: 0.45, normalMap: peel(), normalScale: V(0.35) }),
  powderBlack: () => std({ color: '#24262b', metalness: 0.2, roughness: 0.5, normalMap: peel(), normalScale: V(0.35) }),
  powderGrey: () => std({ color: '#8e959c', metalness: 0.25, roughness: 0.5, normalMap: peel(), normalScale: V(0.35) }),
  powderOrange: () => std({ color: '#d86f2a', metalness: 0.15, roughness: 0.45, normalMap: peel(), normalScale: V(0.35) }),
  powderBlue: () => std({ color: '#2f5f9e', metalness: 0.15, roughness: 0.45, normalMap: peel(), normalScale: V(0.35) }),
  // Less metal than real steel on purpose: an office's environment is dim
  // and warm, and at 0.9 every steel front went a muddy brown.
  brushedSteel: () => std({ color: '#c3c9d0', metalness: 0.6, roughness: 1, roughnessMap: brushedRough(), envMapIntensity: 1.2 }),
  chrome: () => std({ color: '#dfe4ea', metalness: 1, roughness: 0.12, envMapIntensity: 1.3 }),
  brass: () => std({ color: '#c9a24a', metalness: 1, roughness: 0.3 }),
  // hex-perforated steel: rack doors. alphaTest cuts real holes, so the
  // servers and their LEDs show through and the shadow is speckled too.
  // Up close the holes cut clean (alphaTest); further off the mipmapped alpha
  // averages to a smoked screen you see the server LEDs through.
  perfBlack: () => std({ color: '#1a1c20', metalness: 0.4, roughness: 0.45, alphaMap: perfAlphaTex(), alphaTest: 0.25, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  // slotted angle: shelving uprights
  slotGrey: () => std({ color: '#8e959c', metalness: 0.35, roughness: 0.45, alphaMap: slotAlphaTex(), alphaTest: 0.5, side: THREE.DoubleSide }),
  chequer: () => std({ color: '#a4a9ae', metalness: 0.8, roughness: 0.4, normalMap: chequerNormal(), normalScale: V(0.8) }),

  // ------------------------------------------------------ plastics
  plasticBlack: () => std({ color: '#1d1f24', roughness: 0.55, normalMap: peel(), normalScale: V(0.3) }),
  plasticWhite: () => std({ color: '#e6e4de', roughness: 0.5, normalMap: peel(), normalScale: V(0.3) }),
  plasticGrey: () => std({ color: '#9ea4ab', roughness: 0.5, normalMap: peel(), normalScale: V(0.3) }),
  // any vertex colour: cans, binders, men, cables, switches
  tint: () => std({ color: '#ffffff', vertexColors: true, roughness: 0.5, metalness: 0.05 }),
  tintMetal: () => std({ color: '#ffffff', vertexColors: true, roughness: 0.3, metalness: 0.6 }),
  rubber: () => std({ color: '#18191c', roughness: 0.9 }),
  louvre: () => std({ color: '#2a2d32', roughness: 0.6, normalMap: louvreNormal(), normalScale: V(1) }),

  // ------------------------------------------------------ soft goods
  leather: () => std({ color: '#5b3423', roughness: 0.45, normalMap: leatherNormal(), normalScale: V(0.6) }),
  felt: () => std({ color: '#2e7d4f', roughness: 0.95, normalMap: tiled(fabricNormal([1, 1]), 12), normalScale: V(0.4) }),
  feltTeal: () => std({ color: '#3f7d7a', roughness: 0.95, normalMap: tiled(fabricNormal([1, 1]), 10), normalScale: V(0.6) }),

  // ------------------------------------------------------ stone, glass
  ceramic: () => std({ color: '#f4f5f6', roughness: 0.18, envMapIntensity: 0.8 }),
  stoneTop: () => std({ color: '#ffffff', map: terrazzoTex(), roughness: 0.35, envMapIntensity: 0.8 }),
  subway: () => std({ color: '#ffffff', map: subwayTex(), normalMap: subwayNormal(), normalScale: V(0.6), roughness: 0.25, envMapIntensity: 0.9 }),
  glassClear: () => new THREE.MeshPhysicalMaterial({ color: '#cfe8ef', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
  // the building's glass partitions and balustrades
  glassPane: () => new THREE.MeshPhysicalMaterial({ color: '#bfe3ee', transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
  frost: () => std({ color: '#f4f7f8', transparent: true, opacity: 0.5, roughness: 0.9, depthWrite: false }),
  smudge: () => new THREE.MeshBasicMaterial({ map: smudgeTex(), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  scuff: () => new THREE.MeshBasicMaterial({ map: scuffTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  aluminium: () => std({ color: '#aab1b9', metalness: 0.8, roughness: 0.35, envMapIntensity: 1.0 }),
  glassBlack: () => std({ color: '#0e0f12', roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }),
  mirror: () => std({ color: '#dfe6ea', metalness: 1, roughness: 0.04, envMapIntensity: 1.5 }),

  // ------------------------------------------------------ paper, earth
  cardboard: () => std({ color: '#ffffff', map: cardboardTex(), roughness: 0.9 }),
  paper: () => std({ color: '#f5f3ec', roughness: 0.85 }),
  terracotta: () => std({ color: '#b5623e', roughness: 0.85 }),
  corten: () => std({ color: '#7a4a2e', roughness: 0.8, metalness: 0.35, normalMap: peel(), normalScale: V(0.8) }),
  soil: () => std({ color: '#2e2218', roughness: 1, normalMap: carpetNormal([1, 1]), normalScale: V(1) }),
  foliage: () => std({ color: '#ffffff', vertexColors: true, roughness: 0.75, flatShading: true }),

  // ------------------------------------------------------ pictures
  rugs: () => std({ map: rugAtlas(), normalMap: tiled(carpetNormal([1, 1]), 1.4), normalScale: V(0.35), roughness: 1 }),
  art: () => std({ map: artAtlas(), roughness: 0.8 }),
  labels: () => std({ map: labelAtlas(), roughness: 0.55 }),
  // printed spines, tinted per book through the vertex colour
  books: () => std({ map: labelAtlas(), vertexColors: true, roughness: 0.7 }),
  // backlit panels: the vending header, screens, the copier's touch panel
  labelsGlow: () => std({ map: labelAtlas(), emissiveMap: labelAtlas(), emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.3, toneMapped: false }),
  // lit a little from inside, so a rack behind its door isn't a black box
  serverFaces: () => std({ map: labelAtlas(), emissiveMap: labelAtlas(), emissive: '#9fb3c8', emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.3 }),
  whiteboard: () => std({ map: labelAtlas(), roughness: 0.18, envMapIntensity: 0.6 }),
  backlight: () => new THREE.MeshBasicMaterial({ color: '#fff1d6', toneMapped: false }),
  lampStrip: () => new THREE.MeshBasicMaterial({ color: '#fff4e0', toneMapped: false }),
  emissiveWarm: () => std({ color: '#fff3d6', emissive: '#ffcf8a', emissiveIntensity: 2 }),
  ledGreen: () => new THREE.MeshBasicMaterial({ color: '#37ff7c', toneMapped: false }),
  ledAmber: () => new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }),
  ledBlue: () => new THREE.MeshBasicMaterial({ color: '#4fa3ff', toneMapped: false }),
  ledRed: () => new THREE.MeshBasicMaterial({ color: '#ff4040', toneMapped: false }),
};

// Fabric in any colour: woven normal at ~4 mm per thread (8 repeats a metre).
const fabric = (c) => std({ color: c, normalMap: tiled(fabricNormal([1, 1]), 8), normalScale: V(0.9), roughness: 1 });
// Paint in any colour (door frames, skirting, kick plates on a map's look)
const paint = (c) => std({ color: c, normalMap: peel(), normalScale: V(0.25), roughness: 0.7 });
// Walls: matt emulsion. The orange peel is deliberately almost invisible —
// its job is to break the perfectly flat specular that made every wall read
// as an untextured box, especially where a low sun grazes along one.
const wallPaint = () => std({ vertexColors: true, normalMap: orangePeel('paint', 0.55, [0.7, 0.7]), normalScale: V(0.35), roughnessMap: wearRough('paint', 218, 16, [0.4, 0.4]), roughness: 1 });
// Trim (skirting, architraves): satin, so it catches a rim of light.
// (the paint colour comes per vertex: every wall in every colour, one draw)
MAKERS.wall = wallPaint;
const trim = (c) => std({ color: c, normalMap: orangePeel('paint', 0.55, [0.7, 0.7]), normalScale: V(0.25), roughness: 0.55 });
const PARAM = { fabric, paint, trim };

const cache = new Map();
export function mat(key) {
  let m = cache.get(key);
  if (m) return m;
  const i = key.indexOf(':');
  if (i > 0) {
    const make = PARAM[key.slice(0, i)];
    if (!make) throw new Error(`materials: no maker for ${key}`);
    m = make(key.slice(i + 1));
  } else {
    const make = MAKERS[key];
    if (!make) throw new Error(`materials: no material ${key}`);
    m = make();
  }
  m.name = key;
  cache.set(key, m);
  return m;
}

// Which surfaces are worth a shadow. Chrome trim, LEDs, screens, glass,
// paper and little rubber feet cost a shadow draw each and read as nothing.
const NO_SHADOW = /^(chrome|brass|glass|mirror|led|labels|labelsGlow|serverFaces|backlight|lampStrip|emissiveWarm|paper|rubber|rugs|art|whiteboard|subway|frost|smudge|scuff|perfBlack)/;
export const castsShadow = (key) => !NO_SHADOW.test(key);
// transparent or alpha-tested surfaces never merge with opaque ones anyway,
// but they also must not be flagged to receive shadows (it costs a pass)
export const receivesShadow = (key) => !/^(glass|led|backlight|lampStrip|labelsGlow|frost|smudge|scuff)/.test(key);
