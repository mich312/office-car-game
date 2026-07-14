// Self-contained billboard text (canvas → sprite). No font fetching, no CDN —
// works offline, supports emoji, always faces the camera.
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';

export default function TextSprite({ text, size = 0.5, color = 'white', outline = 'rgba(0,0,0,0.85)', y = 0 }) {
  const { texture, aspect } = useMemo(() => {
    const fs = 72;
    const pad = 24;
    const c = document.createElement('canvas');
    let g = c.getContext('2d');
    g.font = `800 ${fs}px system-ui, 'Segoe UI', sans-serif`;
    c.width = Math.max(2, Math.ceil(g.measureText(text).width) + pad * 2);
    c.height = fs + pad * 2;
    g = c.getContext('2d');
    g.font = `800 ${fs}px system-ui, 'Segoe UI', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 10;
    g.strokeStyle = outline;
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = color;
    g.fillText(text, c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    return { texture: tex, aspect: c.width / c.height };
  }, [text, color, outline]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, y, 0]} scale={[size * aspect, size, 1]}>
      <spriteMaterial map={texture} depthWrite={false} transparent />
    </sprite>
  );
}
