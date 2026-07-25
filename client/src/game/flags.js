// URL-driven render flags.
//
// `?lowfx` is the shipped low-end path. The rest are measurement knobs: a
// renderer change can only be judged by A/B-ing it inside ONE build, from the
// same spawn, on the same mode — see docs/graphics-directions.md §4a for the
// run where measuring across two page loads gave a backwards answer.
//
//   ?scale=0.5   fixed device pixel ratio (fill cost scales with its square)
//   ?noao        drop the N8AO pass
//   ?nobloom     drop the bloom pass
//   ?nosmaa      drop the SMAA pass
//   ?noshadow    keep post, drop the shadow map
//   ?aniso=16    anisotropic filtering on every canvas texture (default 4)
//   ?agx         AgX tone mapping instead of ACES Filmic
//   ?lowfx       no shadows, no post, 0.75–1 dpr
//   ?forcefx     keep the full stack even on a software rasteriser
const q = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search)
  : new URLSearchParams();

const num = (k) => (q.has(k) ? Number(q.get(k)) : null);

export const FLAGS = {
  lowfx: q.has('lowfx'),
  noao: q.has('noao'),
  nobloom: q.has('nobloom'),
  nosmaa: q.has('nosmaa'),
  noshadow: q.has('noshadow'),
  agx: q.has('agx'),
  forcefx: q.has('forcefx'),
  scale: num('scale'),
  aniso: num('aniso'),
};

// Is this a CPU software rasteriser? Chrome silently falls back to SwiftShader
// when there is no GPU, the driver is blocklisted, or we're in a VM — so some
// players are already running the software path without ever asking for it,
// and at full effects that measures 0.7 fps. Probed once, lazily, because it
// costs a throwaway context.
let _soft = null;
export function isSoftwareRenderer() {
  if (_soft !== null) return _soft;
  _soft = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    _soft = /swiftshader|llvmpipe|software|basic render/i.test(name);
    if (typeof window !== 'undefined') window.__glRenderer = name;
  } catch { /* no webgl2, no opinion */ }
  return _soft;
}
