// A floor that has been lived on: occlusion, grime and wear baked from the
// map's own data, one small texture per floor.
//
// Every floor material is one texture tiled at one frequency, so from 20 cm
// up a room read as a flat expanse from wall to wall — nothing said where the
// furniture stands, where the walls meet the floor or where people walk. Real
// floors say all three, and it is most of what makes a room look inhabited:
//
//   R  occlusion and grime, multiplied into the floor's albedo
//      · a soft darkening under and around every piece of furniture (the
//        top blocks the sky; dust collects in the lee)
//      · a tight contact line where every wall meets the floor, and a broad
//        grime band either side (mops never reach it)
//      · large, very soft mottle, so no floor is one value across a room
//      · scuffing at doorways, where every route funnels through
//   G  wear: the racing line (BOT_PATH, the route everyone drives) and the
//      doorways — polished by traffic, so it lowers the floor's roughness and
//      a low sun picks the lane out as a sheen
//
// Everything comes from the map's data (FURNITURE, WALLS, BOT_PATH, ROOMS),
// so a moved desk moves its shadow. It is drawn in plain JS into float
// buffers and blurred with a separable box blur (three passes ≈ Gaussian):
// no canvas `filter`, which Safari ignores, and identical on every machine.
// ~8 cm per texel; the office is 525 × 300 and bakes in a few tens of ms,
// once per floor.
//
// Office.jsx applies it to every room floor (FLOOR_MATS); a theme that lays
// its own floor finishes applies withFloorAO() to those materials too (the
// cellar does). The sampling is in world XZ, so any floor mesh anywhere on
// the map lines up with it.
import * as THREE from 'three';
import { M, isDecor } from '@rc/shared';

const PX_M = 0.08; // metres per texel
const cache = new Map();

// separable box blur, radius r texels, in place; three passes ≈ Gaussian
function blur(buf, W, H, r) {
  if (r < 1) return;
  const tmp = new Float32Array(Math.max(W, H));
  const pass = (n, stride, count, step) => {
    for (let line = 0; line < count; line++) {
      const o = line * step;
      let acc = 0;
      const k = 2 * r + 1;
      for (let i = -r; i <= r; i++) acc += buf[o + Math.min(n - 1, Math.max(0, i)) * stride];
      for (let i = 0; i < n; i++) {
        tmp[i] = acc / k;
        const add = Math.min(n - 1, i + r + 1), sub = Math.max(0, i - r);
        acc += buf[o + add * stride] - buf[o + sub * stride];
      }
      for (let i = 0; i < n; i++) buf[o + i * stride] = tmp[i];
    }
  };
  for (let it = 0; it < 3; it++) {
    pass(W, 1, H, W); // rows
    pass(H, W, W, 1); // columns
  }
}

// cheap deterministic value noise for the mottle
function noise2(x, y, seed) {
  const h = (i, j) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function floorAO(map) {
  const hit = cache.get(map.id);
  if (hit) return hit;
  const B = map.MAP_BOUNDS;
  const x0 = B.minX / M, z0 = B.minZ / M; // metres
  const wM = (B.maxX - B.minX) / M, dM = (B.maxZ - B.minZ) / M;
  const W = Math.ceil(wM / PX_M), H = Math.ceil(dM / PX_M);
  const N = W * H;
  const px = (m) => m / PX_M;

  // coverage of an (optionally rotated) rectangle, metres, into buf (max)
  const rect = (buf, cx, cz, w, d, rot, v = 1) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ex = Math.abs(c) * w / 2 + Math.abs(s) * d / 2, ez = Math.abs(s) * w / 2 + Math.abs(c) * d / 2;
    const i0 = Math.max(0, Math.floor(px(cx - ex - x0))), i1 = Math.min(W - 1, Math.ceil(px(cx + ex - x0)));
    const j0 = Math.max(0, Math.floor(px(cz - ez - z0))), j1 = Math.min(H - 1, Math.ceil(px(cz + ez - z0)));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * PX_M - cz;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * PX_M - cx;
        // into the piece's own frame (three's rotY turns +x toward −z)
        const lx = x * c - z * s, lz = x * s + z * c;
        if (Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2) {
          const o = j * W + i;
          if (buf[o] < v) buf[o] = v;
        }
      }
    }
  };
  // a thick line (the racing line), metres
  const line = (buf, ax, az, bx, bz, width, v = 1) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) return;
    rect(buf, (ax + bx) / 2, (az + bz) / 2, len + width * 0.5, width, -Math.atan2(bz - az, bx - ax), v);
  };
  const disc = (buf, cx, cz, r, v = 1) => {
    const i0 = Math.max(0, Math.floor(px(cx - r - x0))), i1 = Math.min(W - 1, Math.ceil(px(cx + r - x0)));
    const j0 = Math.max(0, Math.floor(px(cz - r - z0))), j1 = Math.min(H - 1, Math.ceil(px(cz + r - z0)));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * PX_M - cx, dz = z0 + (j + 0.5) * PX_M - cz;
        const t = 1 - Math.hypot(dx, dz) / r;
        if (t > 0) { const o = j * W + i; buf[o] = Math.max(buf[o], v * t); }
      }
    }
  };

  // --- occlusion layers (R) --------------------------------------------
  const furnBroad = new Float32Array(N), furnCore = new Float32Array(N);
  for (const f of map.FURNITURE) {
    if (isDecor(f)) continue;
    // low pieces (a mat, a cable tray) barely occlude; cabinets a lot
    const k = Math.min(1, Math.max(0.3, (f.h || M) / M / 0.7));
    const w = f.w / M, d = f.d / M, x = f.x / M, z = f.z / M, r = f.rotY || 0;
    rect(furnBroad, x, z, w + 0.4, d + 0.4, r, k);
    rect(furnCore, x, z, w + 0.04, d + 0.04, r, k);
  }
  blur(furnBroad, W, H, Math.round(px(0.35)));
  blur(furnCore, W, H, Math.round(px(0.09)));

  const wallBand = new Float32Array(N), wallLine = new Float32Array(N);
  for (const wl of map.WALLS) {
    if (wl.low) continue;
    const x = wl.x / M, z = wl.z / M, w = wl.w / M, d = wl.d / M;
    const k = wl.glass ? 0.6 : 1; // a glazed partition stands on a slim sill
    rect(wallBand, x, z, w + 1.4, d + 1.4, 0, k);
    rect(wallLine, x, z, w + 0.18, d + 0.18, 0, k);
  }
  blur(wallBand, W, H, Math.round(px(0.55)));
  blur(wallLine, W, H, Math.round(px(0.07)));

  // --- traffic (G, and a little R at the doorways) -----------------------
  const lane = new Float32Array(N), doors = new Float32Array(N);
  const path = map.BOT_PATH || [];
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    line(lane, a.x / M, a.z / M, b.x / M, b.z / M, 1.1);
    // a doorway is where the route changes room: scuff it
    const ra = map.roomAt?.(a.x, a.z), rb = map.roomAt?.(b.x, b.z);
    if (ra && rb && ra !== rb) {
      // walk the segment to the boundary
      let lo = 0, hi = 1;
      for (let s = 0; s < 12; s++) {
        const m = (lo + hi) / 2;
        const r = map.roomAt(a.x + (b.x - a.x) * m, a.z + (b.z - a.z) * m);
        if (r === ra) lo = m; else hi = m;
      }
      const t = (lo + hi) / 2;
      disc(doors, (a.x + (b.x - a.x) * t) / M, (a.z + (b.z - a.z) * t) / M, 1.1);
    }
  }
  blur(lane, W, H, Math.round(px(0.45)));
  blur(doors, W, H, Math.round(px(0.2)));

  // --- combine ------------------------------------------------------------
  const data = new Uint8Array(N * 4);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const o = j * W + i;
      const xm = x0 + i * PX_M, zm = z0 + j * PX_M;
      // two octaves of very soft mottle, ±5 %
      const mottle = (noise2(xm / 3.2, zm / 3.2, 7) - 0.5) * 0.07 + (noise2(xm / 8, zm / 8, 11) - 0.5) * 0.05;
      let occ = (1 - 0.3 * furnBroad[o]) * (1 - 0.3 * furnCore[o]);
      occ *= (1 - 0.2 * wallBand[o]) * (1 - 0.4 * wallLine[o]);
      occ *= 1 - 0.14 * doors[o];
      occ *= 0.97 + mottle;
      const wear = Math.min(1, lane[o] * 0.8 + doors[o] * 0.6);
      data[o * 4] = Math.max(0, Math.min(255, Math.round(occ * 255)));
      data[o * 4 + 1] = Math.round(wear * 255);
      data[o * 4 + 2] = 0;
      data[o * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  // row 0 is minZ, column 0 minX: uv = (xz − min) / size, in world units
  const out = { tex, bounds: new THREE.Vector4(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ) };
  cache.set(map.id, out);
  return out;
}

// Hook a floor material up to its map's bake. `occlusion` scales the
// darkening (1 = as baked), `wear` how far the traffic lane lowers the
// roughness. Chains any onBeforeCompile the material already had, and is
// idempotent: a material hooked before (a theme's cached floor materials,
// remounted) just takes the new map's bake.
export function withFloorAO(material, map, { occlusion = 1, wear = 0.16 } = {}) {
  const ao = floorAO(map);
  const hooked = material.userData.floorAO;
  if (hooked) {
    hooked.uFloorAO.value = ao.tex;
    hooked.uFloorB.value = ao.bounds;
    hooked.uFloorK.value.set(occlusion, wear);
    return material;
  }
  const uniforms = {
    uFloorAO: { value: ao.tex },
    uFloorB: { value: ao.bounds },
    uFloorK: { value: new THREE.Vector2(occlusion, wear) },
  };
  material.userData.floorAO = uniforms;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    prev?.call(material, sh, renderer);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloorXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFloorXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloorXZ;\nuniform sampler2D uFloorAO;\nuniform vec4 uFloorB;\nuniform vec2 uFloorK;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec2 floorAO = texture2D( uFloorAO, ( vFloorXZ - uFloorB.xy ) / uFloorB.zw ).rg;\ndiffuseColor.rgb *= mix( 1.0, floorAO.r, uFloorK.x );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor - floorAO.g * uFloorK.y, 0.04, 1.0 );');
  };
  // three keys a patched program on this string: keep whatever told the
  // material's earlier patch apart from others (its own key, or its source)
  const own = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
  const prevKey = own ? material.customProgramCacheKey.bind(material) : null;
  const prevSrc = prev ? prev.toString() : '';
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : prevSrc}|floorAO`;
  material.needsUpdate = true;
  return material;
}
