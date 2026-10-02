// Self-contained billboard text (canvas → sprite). No font fetching, no CDN —
// works offline, always faces the camera. World labels speak the HUD's
// display voice: Kanit Black Italic caps (self-hosted, bundled with the UI
// stylesheet) with a fat ink outline. Emoji in the text (emotes: content,
// not chrome) still render through the system fallback.
import { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';

const INK = '#140e2c';
const PAPER = '#fff8ea';
const FONT = (fs) => `italic 900 ${fs}px Kanit, 'Arial Black', sans-serif`;

// The canvas can't wait for a webfont by itself: ask for Kanit once, and
// have every label that drew before it arrived redraw when it lands.
let kanitReady = typeof document === 'undefined' || !document.fonts?.load;
let kanitWait = null;
const whenKanit = () => {
  if (!kanitWait) {
    kanitWait = document.fonts.load(FONT(72)).then(() => { kanitReady = true; }, () => { kanitReady = true; });
  }
  return kanitWait;
};

// overlay: drawn over whatever stands in front of it (a label that must be
// readable through the room's furniture)
export default function TextSprite({ text, size = 0.5, color = PAPER, outline = INK, y = 0, overlay = false }) {
  const [fontGen, setFontGen] = useState(kanitReady ? 1 : 0);
  useEffect(() => {
    if (fontGen) return undefined;
    let alive = true;
    whenKanit().then(() => { if (alive) setFontGen(1); });
    return () => { alive = false; };
  }, [fontGen]);

  const { texture, aspect } = useMemo(() => {
    const fs = 72;
    const pad = 24;
    const c = document.createElement('canvas');
    let g = c.getContext('2d');
    g.font = FONT(fs);
    // (italic caps lean past their advance: a little extra room on the right)
    c.width = Math.max(2, Math.ceil(g.measureText(text).width + fs * 0.18) + pad * 2);
    c.height = fs + pad * 2;
    g = c.getContext('2d');
    g.font = FONT(fs);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = outline;
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = color;
    g.fillText(text, c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    return { texture: tex, aspect: c.width / c.height };
  }, [text, color, outline, fontGen]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, y, 0]} scale={[size * aspect, size, 1]} renderOrder={overlay ? 10 : 0}>
      <spriteMaterial map={texture} depthWrite={false} depthTest={!overlay} transparent />
    </sprite>
  );
}
