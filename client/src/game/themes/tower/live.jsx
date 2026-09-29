// The parts of the 48th floor that move, glow on a schedule or make a
// sound: the lifts, the war room's video wall, the signs and the ticker,
// the fire, the terrace (olives in the gusts, the aircraft-warning light, the
// window-cleaning gondola on the facade) and the floor's one-shot sounds.
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { M, MODES } from '@rc/shared';
import { useStore } from '../../../store.js';
import { audio } from '../../../audio.js';
import { on } from '../../../net.js';
import { lightingFor } from '../../daylight.js';
import { mat, canvas, hash, glowTex, parts, G, bakeInto, mergeGroups, placeMatrix, CONTINENTS } from './kit.js';
import { C } from './build.js';

const _o = new THREE.Object3D();
const _c = new THREE.Color();
const u = (v) => v * M;

// ================================================================ lifts
// Six lifts on the core's lobby face. Every few seconds one arrives: a
// ding, the "48" lights, the doors part (two-speed, centre-opening: four
// leaves that stack into the piers), a pause, and they close. A car that
// respawns arrives by lift too — the nearest one opens for it.
const LEAF_W = 0.275, LEAF_H = 2.4;
const indicatorTex = () => canvas('tlift48', 128, 64, (g, w, h) => {
  g.fillStyle = '#050505'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffb14a'; g.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('48', 76, 34);
  g.beginPath(); g.moveTo(22, 44); g.lineTo(38, 44); g.lineTo(30, 22); g.closePath(); g.fill();
}, { wrap: false });

export function Lifts({ map }) {
  const xs = map.LIFTS || [];
  const leaves = useRef();
  const lamps = useRef();
  const st = useMemo(() => xs.map((_, i) => ({ open: 0, until: 0, busy: false, next: 3 + i * 2.7 + hash(i) * 6 })), [xs]);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c09045', metalness: 1, roughness: 0.28 }), []);
  const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ map: indicatorTex(), toneMapped: false }), []);
  const Z = -4.0; // the core's lobby face
  const arrive = (i, t) => {
    const s = st[i];
    if (s.busy) return;
    s.busy = true; s.t0 = t;
    audio.ding([u(xs[i]), u(2.5), u(Z - 0.2)], 0.55, i % 2 ? 1318 : 1175);
  };
  useEffect(() => on('respawn_at', (msg) => {
    let best = 0, bd = Infinity;
    xs.forEach((x, i) => { const d = Math.hypot(msg.x - u(x), msg.z - u(Z)); if (d < bd) { bd = d; best = i; } });
    if (bd < u(12)) st[best].next = 0;
  }), [xs, st]);
  useLayoutEffect(() => {
    xs.forEach((x, i) => {
      _o.position.set(u(x), u(2.62), u(Z - 0.022));
      _o.rotation.set(0, Math.PI, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      lamps.current.setMatrixAt(i, _o.matrix);
      lamps.current.setColorAt(i, _c.setScalar(0.25));
    });
    lamps.current.instanceMatrix.needsUpdate = true;
    lamps.current.instanceColor.needsUpdate = true;
  }, [xs]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const L = leaves.current;
    if (!L) return;
    xs.forEach((x, i) => {
      const s = st[i];
      if (!s.busy && t > s.next) arrive(i, t);
      let o = 0;
      if (s.busy) {
        const e = t - s.t0;
        // 0.6 s announce, 1 s open, 3.4 s hold, 1 s close
        o = e < 0.6 ? 0 : e < 1.6 ? (e - 0.6) : e < 5 ? 1 : e < 6 ? 1 - (e - 5) : 0;
        o = o * o * (3 - 2 * o);
        if (e > 6) { s.busy = false; s.next = t + 7 + hash(Math.floor(t) + i * 13) * 16; }
        lamps.current.setColorAt(i, _c.setScalar(e < 5 ? 1.4 : 0.25));
      }
      // four leaves: two a side, the inner travels twice as far
      for (let k = 0; k < 4; k++) {
        const side = k < 2 ? -1 : 1, inner = k % 2 === 0;
        const closed = side * (inner ? LEAF_W / 2 : LEAF_W * 1.5);
        const open = side * (0.55 + LEAF_W / 2);
        const px = closed + (open - closed) * o * (inner ? 1 : 1);
        _o.position.set(u(x + px), u(LEAF_H / 2), u(Z + (inner ? 0.05 : 0.08)));
        _o.rotation.set(0, 0, 0);
        _o.scale.set(1, 1, 1);
        _o.updateMatrix();
        L.setMatrixAt(i * 4 + k, _o.matrix);
      }
    });
    L.instanceMatrix.needsUpdate = true;
    lamps.current.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={leaves} args={[null, leafMat, xs.length * 4]} frustumCulled={false} castShadow>
        <boxGeometry args={[u(LEAF_W - 0.004), u(LEAF_H), u(0.025)]} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[null, lampMat, xs.length]} frustumCulled={false}>
        <planeGeometry args={[u(0.26), u(0.13)]} />
      </instancedMesh>
    </group>
  );
}

// ============================================================ video wall
// A 3 × 3 wall of 55" panels: a world map with pulsing offices, the
// quarter's revenue going up and to the right, a countdown (the match
// clock while a round is on), KPI dials and the live standings. Redrawn
// once a second; the pulsing dots are geometry so they animate for free.
const VW = 1536, VH = 864;
const CITIES = [[0.2, 0.32], [0.26, 0.36], [0.48, 0.26], [0.5, 0.3], [0.53, 0.44], [0.62, 0.34], [0.72, 0.4], [0.8, 0.36], [0.83, 0.66], [0.3, 0.62], [0.57, 0.62], [0.76, 0.52], [0.45, 0.2], [0.66, 0.26]];

function drawWall(g, st, t, crash) {
  const P = 512, Q = 288;
  const accent = crash ? '#ff4040' : '#48c7ff';
  const good = crash ? '#ff5a4a' : '#46e39a';
  g.fillStyle = crash ? '#1a0508' : '#050b16';
  g.fillRect(0, 0, VW, VH);
  // --- world map (2 × 2, top left)
  g.save();
  g.fillStyle = crash ? '#240a0c' : '#081426';
  g.fillRect(0, 0, P * 2, Q * 2);
  g.strokeStyle = 'rgba(80,140,200,0.12)'; g.lineWidth = 1;
  for (let x = 0; x < P * 2; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Q * 2); g.stroke(); }
  for (let y = 0; y < Q * 2; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(P * 2, y); g.stroke(); }
  g.fillStyle = crash ? 'rgba(255,90,80,0.55)' : 'rgba(90,170,255,0.55)';
  for (let y = 8; y < Q * 2; y += 11) {
    for (let x = 8; x < P * 2; x += 11) {
      const u0 = x / (P * 2), v0 = y / (Q * 2);
      if (CONTINENTS.some(([cx, cy, rx, ry]) => ((u0 - cx) / rx) ** 2 + ((v0 - cy) / ry) ** 2 < 1)) g.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  // flight arcs between offices
  g.strokeStyle = crash ? 'rgba(255,120,90,0.5)' : 'rgba(120,230,255,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = CITIES[i * 2 % CITIES.length], b = CITIES[(i * 5 + 3) % CITIES.length];
    const ax = a[0] * P * 2, ay = a[1] * Q * 2, bx = b[0] * P * 2, by = b[1] * Q * 2;
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 90, bx, by); g.stroke();
  }
  g.fillStyle = '#e8f4ff'; g.font = 'bold 30px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'left';
  g.fillText(crash ? 'GLOBAL OPERATIONS — ALERT' : 'GLOBAL OPERATIONS', 24, 44);
  g.font = '20px Arial, sans-serif'; g.fillStyle = accent;
  g.fillText(`${14 + (Math.floor(t / 7) % 3)} OFFICES · ${(38.2 + (t % 17) * 0.1).toFixed(1)}K HEADCOUNT`, 24, 72);
  g.restore();
  // --- revenue chart (top right)
  const panel = (x, y, title) => {
    g.fillStyle = crash ? '#1c0709' : '#07101e'; g.fillRect(x, y, P, Q);
    g.fillStyle = '#9fb4cc'; g.font = 'bold 22px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'left';
    g.fillText(title, x + 18, y + 32);
  };
  panel(P * 2, 0, 'Q4 REVENUE (USD M)');
  g.strokeStyle = 'rgba(160,190,220,0.15)';
  for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(P * 2 + 20, 70 + k * 45); g.lineTo(P * 3 - 20, 70 + k * 45); g.stroke(); }
  g.strokeStyle = good; g.lineWidth = 4; g.beginPath();
  let last = 0;
  for (let k = 0; k <= 24; k++) {
    const x = P * 2 + 24 + k * 19;
    const trend = crash && k > 16 ? (k - 16) * -22 : k * 7.5;
    const y = 250 - trend - Math.sin(k * 1.7 + Math.floor(t / 3)) * 10 - hash(k + Math.floor(t / 5) * 31) * 14;
    if (k) g.lineTo(x, y); else g.moveTo(x, y);
    last = y;
  }
  g.stroke();
  g.fillStyle = good; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'right';
  g.fillText(crash ? '▼ 38.4 %' : `▲ ${(12 + (t % 11) * 0.3).toFixed(1)} %`, P * 3 - 20, 36);
  g.beginPath(); g.arc(P * 2 + 24 + 24 * 19, last, 7, 0, Math.PI * 2); g.fill();
  // --- countdown (middle right)
  panel(P * 2, Q, st.phase === 'playing' ? 'SESSION ENDS IN' : 'Q4 CLOSE IN');
  let secs;
  if (st.phase === 'playing' && st.endsAt) secs = Math.max(0, Math.ceil((st.endsAt - Date.now()) / 1000));
  else { const d = new Date(); secs = 86400 - (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()); }
  const hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = secs % 60;
  g.fillStyle = crash ? '#ff4040' : '#ffb14a'; g.font = 'bold 112px "Courier New", monospace'; g.textAlign = 'center';
  g.fillText(`${hh ? `${hh}:` : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, P * 2.5, Q + 185);
  g.font = '20px Arial, sans-serif'; g.fillStyle = '#9fb4cc';
  g.fillText(st.phase === 'playing' ? (MODES[st.modeId]?.name || 'MEETING').toUpperCase() : 'BOARD REVIEW · 48F WAR ROOM', P * 2.5, Q + 250);
  // --- KPI dials (bottom right)
  panel(P * 2, Q * 2, 'KPIs');
  const kpis = crash ? [['SYNERGY', 0.12], ['MORALE', 0.08], ['EBITDA', 0.2]] : [['SYNERGY', 0.97], ['NPS', 0.71], ['ON TARGET', 0.93]];
  kpis.forEach(([name, v], k) => {
    const cx = P * 2 + 95 + k * 160, cy = Q * 2 + 175;
    g.lineWidth = 16; g.strokeStyle = 'rgba(160,190,220,0.15)';
    g.beginPath(); g.arc(cx, cy, 58, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    g.strokeStyle = k === 1 ? accent : good;
    g.beginPath(); g.arc(cx, cy, 58, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * v)); g.stroke();
    g.fillStyle = '#e8f4ff'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center';
    g.fillText(`${Math.round(v * 100)}`, cx, cy + 10);
    g.font = '17px Arial, sans-serif'; g.fillStyle = '#9fb4cc'; g.fillText(name, cx, cy + 82);
  });
  // --- standings (bottom left, two panels)
  panel(0, Q * 2, st.phase === 'playing' ? 'LIVE STANDINGS' : 'LAST QUARTER — TOP PERFORMERS');
  panel(P, Q * 2, '');
  const rows = Object.entries(st.players || {})
    .map(([id, pl]) => ({ name: pl.name || '—', score: st.scores?.[id] || 0, me: id === st.myId }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  const top = Math.max(1, ...rows.map((r) => r.score));
  rows.forEach((r, k) => {
    const y = Q * 2 + 70 + k * 42;
    g.fillStyle = r.me ? '#ffb14a' : '#e8f4ff'; g.font = 'bold 26px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'left';
    g.fillText(`${k + 1}. ${r.name.slice(0, 16)}`, 24, y + 8);
    g.fillStyle = r.me ? 'rgba(255,177,74,0.8)' : k === 0 ? good : accent;
    g.fillRect(360, y - 12, (620 * r.score) / top + 6, 22);
    g.fillStyle = '#e8f4ff'; g.textAlign = 'right'; g.font = '22px Arial, sans-serif';
    g.fillText(String(r.score), P * 2 - 20, y + 8);
  });
  if (crash && Math.floor(t * 2) % 2 === 0) {
    g.fillStyle = 'rgba(255,40,40,0.85)'; g.fillRect(P * 0.5, Q * 0.8, P, 110);
    g.fillStyle = '#ffffff'; g.font = 'bold 76px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center';
    g.fillText('MARKET CRASH', P, Q * 0.8 + 80);
  }
  // bezels: 3 mm, black
  g.fillStyle = '#000';
  for (let k = 1; k < 3; k++) { g.fillRect(k * P - 2, 0, 4, VH); g.fillRect(0, k * Q - 2, VW, 4); }
}

export function VideoWall({ map }) {
  const V = map.VIDEO_WALL;
  const dots = useRef();
  const { tex, cvs, material } = useMemo(() => {
    const cvs = document.createElement('canvas');
    cvs.width = VW; cvs.height = VH;
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { tex, cvs, material: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: '#d8d8d8' }) };
  }, []);
  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: glowTex(), color: '#7fe3ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), []);
  const acc = useRef(1);
  const W = V.w, Hh = V.h;
  // map u,v (0..1 over the left 2×2 panels) → wall-local metres
  const cityPos = useMemo(() => CITIES.map(([cu, cv]) => [(-W / 2 + cu * (W * 2 / 3)), (Hh / 2 - cv * (Hh * 2 / 3))]), [W, Hh]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const st = useStore.getState();
    const crash = st.event?.id === 'server_overload';
    acc.current += dt;
    if (acc.current > 1) {
      acc.current = 0;
      drawWall(cvs.getContext('2d'), st, t, crash);
      tex.needsUpdate = true;
    }
    dotMat.color.set(crash ? '#ff5a4a' : '#7fe3ff');
    const D = dots.current;
    if (!D) return;
    cityPos.forEach(([x, y], i) => {
      const k = (t * 0.7 + hash(i) * 3) % 1.6;
      const sc = k < 1 ? 0.4 + k * 2.2 : 0.001;
      _o.position.set(u(x), u(y), u(0.01));
      _o.rotation.set(0, 0, 0);
      _o.scale.set(sc, sc, 1);
      _o.updateMatrix();
      D.setMatrixAt(i, _o.matrix);
    });
    D.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[u(V.x), u(V.y0 + V.h / 2), u(V.z)]}>
      <mesh rotation-y={-Math.PI / 2} material={material}>
        <planeGeometry args={[u(W), u(Hh)]} />
      </mesh>
      <group rotation-y={-Math.PI / 2}>
        <instancedMesh ref={dots} args={[null, dotMat, CITIES.length]} frustumCulled={false}>
          <planeGeometry args={[u(0.1), u(0.1)]} />
        </instancedMesh>
      </group>
    </group>
  );
}

// ================================================================ signs
function signTex(s) {
  const aspect = s.kind === 'logo' ? 11 : s.kind === 'vinyl' ? 10 : s.kind === 'exit' ? 2.4 : 3.2;
  const w = s.kind === 'logo' || s.kind === 'vinyl' ? 2048 : 512, h = Math.round(w / aspect);
  return canvas(`tsign-${s.kind}-${s.text}-${s.sub || ''}`, w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    switch (s.kind) {
      case 'logo': {
        // brushed steel letters: a vertical gradient with a dark edge
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#f2f4f6'); grd.addColorStop(0.5, '#a4a9b0'); grd.addColorStop(1, '#dde1e5');
        g.font = `600 ${Math.round(h * 0.78)}px "Didot", "Bodoni MT", Georgia, serif`;
        if ('letterSpacing' in g) g.letterSpacing = `${Math.round(h * 0.18)}px`;
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(s.text, w / 2 + 4, h / 2 + 6);
        g.fillStyle = grd; g.fillText(s.text, w / 2, h / 2);
        break;
      }
      case 'brass': {
        const grd = g.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, '#d9b36a'); grd.addColorStop(0.5, '#b8893b'); grd.addColorStop(1, '#8e6526');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#6e4d1c'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
        g.fillStyle = '#3a2610';
        g.font = `bold ${s.sub ? Math.round(h * 0.42) : Math.round(h * 0.4)}px Georgia, serif`;
        g.fillText(s.text, w / 2, s.sub ? h * 0.4 : h / 2);
        if (s.sub) { g.font = `bold ${Math.round(h * 0.16)}px Georgia, serif`; g.fillText(s.sub, w / 2, h * 0.78); }
        break;
      }
      case 'session':
        g.fillStyle = '#111317'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#5a1010'; g.lineWidth = 4; g.beginPath(); g.arc(w * 0.2, h / 2, h * 0.2, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#e8e8e8'; g.font = `bold ${Math.round(h * 0.34)}px "Arial Narrow", Arial, sans-serif`;
        g.fillText(s.text, w * 0.56, h * 0.36);
        g.fillStyle = '#c8282a'; g.font = `bold ${Math.round(h * 0.22)}px Arial, sans-serif`;
        g.fillText(`— ${s.sub} —`, w * 0.56, h * 0.74);
        break;
      case 'vinyl':
        g.fillStyle = '#2a2d33'; g.font = `300 ${Math.round(h * 0.7)}px "Helvetica Neue", Arial, sans-serif`;
        if ('letterSpacing' in g) g.letterSpacing = `${Math.round(h * 0.12)}px`;
        g.fillText(s.text, w / 2, h / 2);
        break;
      case 'exit':
        g.fillStyle = '#12a150'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.font = `bold ${Math.round(h * 0.55)}px Arial, sans-serif`; g.fillText(`⮕ ${s.text}`, w / 2, h / 2);
        break;
      default:
        g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2a2d33'; g.font = `bold ${Math.round(h * 0.34)}px "Arial Narrow", Arial, sans-serif`;
        g.fillText(s.text, w / 2, s.sub ? h * 0.38 : h / 2);
        if (s.sub) { g.font = `${Math.round(h * 0.18)}px Arial, sans-serif`; g.fillText(s.sub, w / 2, h * 0.75); }
    }
  }, { wrap: false });
}

export function Signs({ map }) {
  const signs = map.SIGNS || [];
  const phase = useStore((s) => s.phase);
  const mats = useMemo(() => signs.map((s) => {
    const map_ = signTex(s);
    if (s.kind === 'exit') return new THREE.MeshBasicMaterial({ map: map_, toneMapped: false });
    if (s.kind === 'logo') return new THREE.MeshStandardMaterial({ map: map_, transparent: true, alphaTest: 0.2, metalness: 0.7, roughness: 0.3 });
    if (s.kind === 'vinyl') return new THREE.MeshStandardMaterial({ map: map_, transparent: true, alphaTest: 0.2, roughness: 0.8 });
    if (s.kind === 'brass') return new THREE.MeshStandardMaterial({ map: map_, metalness: 0.9, roughness: 0.35 });
    return new THREE.MeshStandardMaterial({ map: map_, roughness: 0.5 });
  }), [signs]);
  const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#330606', toneMapped: false }), []);
  const session = signs.find((s) => s.kind === 'session');
  useFrame(({ clock }) => {
    // the red lamp is lit while a meeting (a match) is on
    const live = phase === 'playing' || phase === 'countdown';
    const pulse = live ? 2.2 + Math.sin(clock.elapsedTime * 3) * 0.4 : 0.25;
    lampMat.color.setRGB(pulse, pulse * 0.08, pulse * 0.06);
  });
  return (
    <group>
      {signs.map((s, i) => {
        const aspect = s.kind === 'logo' ? 11 : s.kind === 'vinyl' ? 10 : s.kind === 'exit' ? 2.4 : 3.2;
        return (
          <mesh key={i} position={s.at.map(u)} rotation-y={s.rotY || 0} material={mats[i]}>
            <planeGeometry args={[u(s.w), u(s.w / aspect)]} />
          </mesh>
        );
      })}
      {session && (
        <mesh position={[
          u(session.at[0] - 0.3 * session.w * Math.cos(session.rotY) + 0.02 * Math.sin(session.rotY)), u(session.at[1]),
          u(session.at[2] + 0.3 * session.w * Math.sin(session.rotY) + 0.02 * Math.cos(session.rotY)),
        ]} material={lampMat}>
          <sphereGeometry args={[u(0.045), 12, 8]} />
        </mesh>
      )}
    </group>
  );
}

// ================================================================ ticker
// An amber LED ticker over the bullpen door. One texture scrolling.
export function Ticker({ map }) {
  const T = map.TICKER;
  const tex = useMemo(() => {
    const t = canvas(`tticker-${T.text}`, 2048, 64, (g, w, h) => {
      g.fillStyle = '#060504'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffae3a'; g.font = 'bold 46px "Courier New", monospace'; g.textBaseline = 'middle';
      let x = 10;
      while (x < w) { g.fillText(T.text, x, h / 2 + 2); x += g.measureText(T.text).width; }
      // dot-matrix mask
      g.fillStyle = 'rgba(6,5,4,0.55)';
      for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      for (let xx = 0; xx < w; xx += 4) g.fillRect(xx, 0, 1, h);
    }, { repeat: [0.45, 1] });
    return t;
  }, [T]);
  const m = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  useFrame((_, dt) => { tex.offset.x = (tex.offset.x + dt * 0.035) % 1; });
  return (
    <mesh position={T.at.map(u)} rotation-y={T.rotY} material={m}>
      <planeGeometry args={[u(T.w), u(T.w * 0.035)]} />
    </mesh>
  );
}

// ================================================================= fire
// The lounge's bioethanol burner: two crossed sheets of flame, a warm pool
// on the rug in front.
const flameTex = () => canvas('tflame', 256, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  let s = 11;
  for (let i = 0; i < 22; i++) {
    const x = (i + 0.5) * (w / 22) + (hash(s++) - 0.5) * 8, fh = h * (0.45 + hash(s++) * 0.5), fw = 9 + hash(s++) * 8;
    const grd = g.createLinearGradient(0, h, 0, h - fh);
    grd.addColorStop(0, 'rgba(90,150,255,0.9)');
    grd.addColorStop(0.12, 'rgba(255,200,90,0.95)');
    grd.addColorStop(0.6, 'rgba(255,120,30,0.6)');
    grd.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x - fw, h); g.quadraticCurveTo(x - fw * 0.6, h - fh * 0.5, x, h - fh); g.quadraticCurveTo(x + fw * 0.6, h - fh * 0.5, x + fw, h); g.fill();
  }
}, { repeat: [1, 1] });

export function Fire({ at, len = 1.4 }) {
  const a = useRef(), b = useRef(), pool = useRef();
  const m = useMemo(() => new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), []);
  const pm = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex(), color: '#ff8a3c', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = 0.85 + Math.sin(t * 9.1) * 0.06 + Math.sin(t * 15.7) * 0.05 + Math.sin(t * 3.3) * 0.05;
    if (a.current) { a.current.scale.y = f; a.current.position.y = u(0.47) + u(0.13) * f; }
    if (b.current) { b.current.scale.y = 1.9 - f; b.current.position.y = u(0.47) + u(0.13) * (1.9 - f); }
    m.map.offset.x = (t * 0.07) % 1;
    const level = lightingFor(useStore.getState().timeOfDay, false).practical;
    pm.opacity = (0.12 + level * 0.25) * f;
  });
  return (
    <group position={[u(at[0]), 0, u(at[1])]}>
      <mesh ref={a} rotation-y={Math.PI / 2} material={m}><planeGeometry args={[u(len), u(0.26)]} /></mesh>
      <mesh ref={b} rotation-y={Math.PI / 2 + 0.12} material={m}><planeGeometry args={[u(len * 0.9), u(0.26)]} /></mesh>
      <mesh ref={pool} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} material={pm}><planeGeometry args={[u(4.5), u(4.5)]} /></mesh>
    </group>
  );
}

// ============================================================== terrace
// Olive canopies that lean away from the gust (the same shared cycle the
// car's wind zone uses), the aircraft-warning light, the gondola.
const canopyGeo = () => {
  const p = parts();
  let s = 21;
  for (let i = 0; i < 16; i++) {
    const a = hash(s++) * Math.PI * 2, r = hash(s++) * 0.36, y = 0.35 + hash(s++) * 0.5;
    p.add(G.ico(0.16 + hash(s++) * 0.12, 1), 'matte', hash(s++) > 0.5 ? C.leaf : C.leafDark, Math.sin(a) * r, y, Math.cos(a) * r, 0, 0, 0, 1, 0.8, 1);
  }
  return mergeGroups(bakeInto({}, p.list, placeMatrix(0, 0, 0)))[0].geometry;
};

export function Terrace({ map }) {
  const olives = useMemo(() => map.FURNITURE.filter((f) => f.type === 'tower_olive'), [map]);
  const mast = useMemo(() => map.FURNITURE.find((f) => f.type === 'tower_mast'), [map]);
  const gust = (map.ZONES || []).find((z) => z.gust);
  const ref = useRef();
  const lean = useRef(0);
  const geo = useMemo(canopyGeo, []);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), []);
  const beacon = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff2010', toneMapped: false }), []);
  const halo = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex(), color: '#ff3020', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const haloRef = useRef();
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const now = Date.now() / 1000;
    const blowing = gust && now % (gust.period || 15) < (gust.dur || 3);
    const target = blowing ? 0.3 : 0.03 * Math.sin(t * 0.9);
    lean.current += (target - lean.current) * Math.min(1, dt * (blowing ? 5 : 1.5));
    const I = ref.current;
    if (I) {
      olives.forEach((f, i) => {
        const wob = blowing ? Math.sin(t * 11 + i) * 0.04 : 0;
        _o.position.set(f.x, f.h + u(1.0), f.z);
        _o.rotation.set(lean.current + wob, i * 1.3, 0, 'YXZ');
        _o.scale.setScalar(0.95 + hash(i) * 0.2);
        _o.updateMatrix();
        I.setMatrixAt(i, _o.matrix);
      });
      I.instanceMatrix.needsUpdate = true;
    }
    // the aircraft-warning light: 1 Hz
    const on = (t % 1) < 0.5;
    beacon.color.setRGB(on ? 3 : 0.2, on ? 0.2 : 0.02, on ? 0.1 : 0.01);
    halo.opacity = on ? 0.85 : 0;
  });
  return (
    <group>
      <instancedMesh ref={ref} args={[geo, leafMat, olives.length]} castShadow frustumCulled={false} />
      {mast && (
        <group position={[mast.x, mast.h, mast.z]}>
          <mesh material={beacon}><sphereGeometry args={[u(0.06), 12, 8]} /></mesh>
          <sprite ref={haloRef} material={halo} scale={[u(0.9), u(0.9), 1]} />
        </group>
      )}
      <Gondola />
    </group>
  );
}

// The building maintenance unit: a cradle hung off the roof, crawling
// along the south facade with two window cleaners in it. Outside the glass,
// so it never touches a car — it's there to be seen from the lobby.
const gondolaGeo = () => {
  const p = parts();
  p.slab('metal', '#8f959c', 3.2, 0.06, 0.8, 0, 0, 0, 0.01);
  for (const z of [-0.38, 0.38]) {
    p.box('metal', '#cfd3d8', 3.2, 0.04, 0.04, 0, 1.05, z, 0.01);
    p.box('metal', '#cfd3d8', 3.2, 0.04, 0.04, 0, 0.55, z, 0.01);
    for (let x = -1.55; x <= 1.56; x += 0.62) p.box('metal', '#cfd3d8', 0.04, 1.05, 0.04, x, 0.52, z, 0.004);
  }
  p.box('metal', '#d8a01a', 3.2, 0.25, 0.02, 0, 0.18, 0.39, 0.004);
  // two window cleaners in hi-vis, one mid-wipe
  for (const [x, lean] of [[-0.7, 0.1], [0.8, -0.15]]) {
    p.post('matte', '#2a2d33', 0.09, 0.8, x, 0.06, 0, 8);
    p.add(G.box(0.4, 0.55, 0.26, 0.08), 'matte', '#d9e83a', x, 1.1, 0, lean, 0, 0);
    p.add(G.sphere(0.12, 12, 8), 'matte', '#d9a47c', x, 1.52, 0.02);
    p.add(G.sphere(0.13, 12, 6, 0, Math.PI / 2), 'matte', '#f2f2f2', x, 1.56, 0.02);
  }
  p.box('metal', '#555a60', 0.04, 0.5, 0.04, 1.05, 1.35, 0.3, 0.004);
  p.box('matte', '#222', 0.35, 0.05, 0.03, 1.05, 1.6, 0.3, 0.004);
  // the cables up to the roof
  for (const x of [-1.5, 1.5]) p.box('metal', '#303338', 0.012, 6, 0.012, x, 4.1, 0, 0);
  return mergeGroups(bakeInto({}, p.list, placeMatrix(0, 0, 0)));
};

function Gondola() {
  const ref = useRef();
  const geos = useMemo(gondolaGeo, []);
  const st = useRef({ x: -16, dir: 1 });
  useFrame((_, dt) => {
    const s = st.current;
    s.x += s.dir * 0.28 * Math.min(dt, 0.1);
    if (s.x > 16 || s.x < -16) {
      s.dir *= -1;
      s.x = Math.max(-16, Math.min(16, s.x));
      audio.clank([u(s.x), u(1.5), u(-12.7)], 0.35);
    }
    if (ref.current) ref.current.position.set(u(s.x), u(1.05), u(-12.75));
  });
  return (
    <group ref={ref}>
      {geos.map((g) => <mesh key={g.key} geometry={g.geometry} material={mat(g.key)} castShadow />)}
    </group>
  );
}

// ======================================================= light pools
// Additive glow on the floor under each downlight: brighter at night.
export function Pools({ spots }) {
  const ref = useRef();
  const m = useMemo(() => new THREE.MeshBasicMaterial({
    map: glowTex(), color: '#ffd9a8', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }), []);
  useLayoutEffect(() => {
    spots.forEach(([x, z], i) => {
      _o.position.set(u(x), 0.03, u(z));
      _o.rotation.set(-Math.PI / 2, 0, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      ref.current.setMatrixAt(i, _o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  useFrame((_, dt) => {
    const st = useStore.getState();
    const target = lightingFor(st.timeOfDay, st.event?.id === 'lights_out').pool;
    m.opacity += (target * 0.8 - m.opacity) * Math.min(1, dt * 2);
  });
  return (
    <instancedMesh ref={ref} args={[null, m, spots.length]} frustumCulled={false}>
      <planeGeometry args={[u(2.2), u(2.2)]} />
    </instancedMesh>
  );
}

// ======================================================== the sounds
// The floor's one-shots: a phone ringing on an assistant's desk (a
// two-tone trill, twice), the espresso machine's hiss.
export function FloorSounds({ map }) {
  const next = useRef({ phone: 8, hiss: 20 });
  const desks = useMemo(() => map.FURNITURE.filter((f) => f.type === 'desk'), [map]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const n = next.current;
    if (t > n.phone && desks.length) {
      const d = desks[Math.floor(hash(Math.floor(t)) * desks.length)];
      const at = [d.x, d.h + u(0.1), d.z];
      for (let k = 0; k < 2; k++) {
        setTimeout(() => { audio.ding(at, 0.22, 1568); }, k * 900);
        setTimeout(() => { audio.ding(at, 0.2, 1318); }, k * 900 + 90);
        setTimeout(() => { audio.ding(at, 0.22, 1568); }, k * 900 + 180);
      }
      n.phone = t + 18 + hash(Math.floor(t) + 7) * 25;
    }
    if (t > n.hiss) {
      const cm = map.COFFEE_MACHINE;
      audio.hiss([cm.x, u(1.2), cm.z], 0.35, 1.6);
      n.hiss = t + 30 + hash(Math.floor(t) + 3) * 30;
    }
  });
  return null;
}
