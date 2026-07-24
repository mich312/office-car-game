// Floating emote bubbles over cars — keys 1–8 (or a bumped bot talking
// back), plus 📣 for the horn. Bubbles chase their car and pop in/out.
// Remote horns are audible, attenuated by distance to the honker.
import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EMOTES } from '@rc/shared';
import { on, net, sampleRemote } from '../net.js';
import { telemetry } from './LocalCar.jsx';
import TextSprite from './TextSprite.jsx';
import { audio } from '../audio.js';

const LIFE_MS = 2000;

export default function Emotes() {
  const [list, setList] = useState([]);
  useEffect(() => on('fx', (fx) => {
    if (fx.type !== 'emote') return;
    const text = fx.horn ? '📣' : EMOTES[fx.e] ?? '❓';
    if (fx.horn && fx.id !== net.myId) {
      const r = sampleRemote(fx.id);
      const d = r ? Math.hypot(r.p[0] - telemetry.x, r.p[2] - telemetry.z) : 20;
      audio.horn(Math.max(0.15, 1 - d / 45));
    }
    const until = performance.now() + LIFE_MS;
    // one bubble per car — a new emote replaces the old one
    setList((l) => [...l.filter((e) => e.id !== fx.id), { id: fx.id, text, until, key: Math.random() }]);
  }), []);
  useEffect(() => {
    const iv = setInterval(() => {
      setList((l) => (l.some((e) => e.until < performance.now())
        ? l.filter((e) => e.until >= performance.now())
        : l));
    }, 250);
    return () => clearInterval(iv);
  }, []);
  return list.map((e) => <EmoteBubble key={e.key} id={e.id} text={e.text} until={e.until} />);
}

function EmoteBubble({ id, text, until }) {
  const ref = useRef();
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let p = null;
    if (id === net.myId) p = [telemetry.x, telemetry.y, telemetry.z];
    else { const s = sampleRemote(id); if (s) p = s.p; }
    if (!p || p[1] < -2) { g.visible = false; return; }
    g.visible = true;
    g.position.set(p[0], p[1] || 0, p[2]);
    const left = until - performance.now();
    const age = LIFE_MS - left;
    const k = Math.min(1, age / 150) * Math.min(1, Math.max(0, left) / 250);
    g.scale.setScalar(Math.max(0.001, k));
  });
  return (
    <group ref={ref} visible={false}>
      <TextSprite text={text} size={0.9} y={1.9} />
    </group>
  );
}
