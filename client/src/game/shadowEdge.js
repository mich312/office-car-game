// The sun's shadow stops at the edge of its box — and on a roofed floor,
// past that edge should be shade, not sun.
//
// Lighting.jsx gives the sun a tight shadow box that follows the car (a
// building-wide map had no resolution left for car-sized shadows). three.js
// treats every fragment outside a shadow map as lit. Outdoors that is right;
// under the office ceiling it is not — the ceiling casts, so the far side of
// the room should be in its shade, and instead a hard sunlit line appeared
// wherever the box ended, and beyond it the whole floor lit up as if the roof
// had gone.
//
// So the directional light's shadow lookup gets one more term: near the box
// edge it fades toward full shadow, and outside it is fully shadowed. It is a
// real uniform (`sunShadowEdge`, vec2: x = on/off 0…1, y = the fade width as
// a fraction of the box) shared by every lit material. three.js clones a
// material's uniform *values* when it builds the program — except plain
// objects, which it shares by reference — so one {x, y} object here is read
// live by every standard/physical/lambert/phong/toon program, and a floor
// change is one assignment. (No smuggling a flag through an unused shadow
// field: `shadow.radius` is unused by PCFSoft today but means something to
// PCF, and three is deprecating PCFSoft.)
//
// Patched at module scope, before any program compiles. The patch checks
// that three's chunks still say what it expects, and warns (and leaves the
// renderer untouched) if a three upgrade moved them.
import * as THREE from 'three';

export const SUN_SHADOW_EDGE = { x: 0, y: 0.06 };

const DIR_CALL = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize';
// the end of getShadow() — the first function in the chunk that returns this
// (getPointShadow is the second); whitespace differs between three's source
// and its built module, so it is matched loosely
const GET_SHADOW_END = /return mix\( 1\.0, shadow, shadowIntensity \);\s*\}/;

const SUN_SHADOW = /* glsl */`
	uniform vec2 sunShadowEdge;
	// the directional (sun) lookup: past the shadow box an indoor floor is
	// under its roof, so the box edge fades to shade instead of to sun
	float getSunShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float s = getShadow( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord );
		if ( sunShadowEdge.x > 0.0 ) {
			vec2 c = shadowCoord.xy / shadowCoord.w;
			float e = min( min( c.x, 1.0 - c.x ), min( c.y, 1.0 - c.y ) );
			float inBox = smoothstep( 0.0, sunShadowEdge.y, e );
			s = mix( s, mix( 1.0 - shadowIntensity, s, inBox ), sunShadowEdge.x );
		}
		return s;
	}`;

function patch() {
  const C = THREE.ShaderChunk;
  const pars = C.shadowmap_pars_fragment;
  const begin = C.lights_fragment_begin;
  if (pars.includes('getSunShadow')) return; // already patched (a hot reload)
  if (!GET_SHADOW_END.test(pars) || !begin.includes(DIR_CALL)) {
    console.warn('shadowEdge: three.js shadow chunks changed; indoor shadow-box fade disabled');
    return;
  }
  C.shadowmap_pars_fragment = pars.replace(GET_SHADOW_END, (end) => `${end}\n${SUN_SHADOW}\n`);
  C.lights_fragment_begin = begin.replace(DIR_CALL, DIR_CALL.replace('getShadow(', 'getSunShadow('));
  // every built-in lit material: the uniform, shared by reference (see top)
  for (const id of ['standard', 'physical', 'lambert', 'phong', 'toon']) {
    const lib = THREE.ShaderLib[id];
    if (lib) lib.uniforms.sunShadowEdge = { value: SUN_SHADOW_EDGE };
  }
}

// once per page, before the first compile (this module is imported by
// Lighting.jsx, which loads before anything lit is drawn)
patch();
