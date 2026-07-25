// The office whiteboard: a live in-world display that mirrors the match
// state — the mode vote during the lobby ("NEXT MEETING?", with marker tally
// strokes), live standings while playing, and the winner on the podium.
// One canvas texture drives two boards: a big one in the meeting room and a
// twin on the reception wall by the spawns. Pure diegetic flavor — the Tab
// scoreboard overlay stays for mid-race glances.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { M, MODES, MODE_IDS } from '@rc/shared';
import { useStore } from '../store.js';

const W = 768, H = 480;
const INK = '#2b2f33';        // black marker
const INK_SOFT = '#787f88';   // bots / fine print
const BLUE = '#2456a6';       // header marker
const RED = '#c0392b';        // tallies, clock
const AMBER = '#e08a1e';      // circles, winner

// hand-drawn tally strokes: |||| with the fifth slashed across
function tallies(g, x, y, n) {
  g.strokeStyle = RED;
  g.lineWidth = 4;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const group = Math.floor(i / 5);
    const inGroup = i % 5;
    const gx = x + group * 46;
    if (inGroup === 4) {
      g.beginPath();
      g.moveTo(gx - 5, y - 4);
      g.lineTo(gx + 32, y - 22);
      g.stroke();
    } else {
      const jx = gx + inGroup * 9 + (i % 2) * 1.5;
      g.beginPath();
      g.moveTo(jx, y - 26 + (i % 3));
      g.lineTo(jx + 2, y);
      g.stroke();
    }
  }
}

function markerEllipse(g, cx, cy, rx, ry, color) {
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, -0.04, 0.3, Math.PI * 2 + 0.55);
  g.stroke();
}

function drawBoard(g, snap) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#f7f8f5';
  g.fillRect(0, 0, W, H);
  // faint old-eraser smudges
  g.fillStyle = 'rgba(43, 47, 51, 0.025)';
  g.fillRect(60, 300, 300, 60);
  g.fillRect(420, 120, 240, 40);

  const header = (text) => {
    g.save();
    g.rotate(-0.008);
    g.fillStyle = BLUE;
    g.font = '700 52px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(text, 42, 74);
    const w = g.measureText(text).width;
    g.strokeStyle = BLUE;
    g.lineWidth = 5;
    g.globalAlpha = 0.75;
    g.beginPath();
    g.moveTo(40, 90);
    g.lineTo(46 + w, 86);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
  };

  if (snap.phase === 'lobby') {
    header('NEXT MEETING?');
    g.font = '600 34px "Barlow Condensed", "Arial Narrow", sans-serif';
    let leader = null, leaderVotes = 0;
    for (const m of MODE_IDS) if ((snap.votes[m] || 0) > leaderVotes) { leader = m; leaderVotes = snap.votes[m]; }
    MODE_IDS.forEach((m, i) => {
      const y = 146 + i * 46;
      g.fillStyle = INK;
      g.textAlign = 'left';
      g.fillText(MODES[m].name, 64, y);
      tallies(g, 330, y, Math.min(snap.votes[m] || 0, 15));
      if (m === leader) markerEllipse(g, 64 + g.measureText(MODES[m].name).width / 2, y - 12, g.measureText(MODES[m].name).width / 2 + 22, 26, AMBER);
    });
    g.fillStyle = INK_SOFT;
    g.font = '600 24px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('ready up at your desks — bots fill the rest', 64, 464);
  } else if (snap.phase === 'podium') {
    header('EMPLOYEE OF THE MATCH');
    if (snap.winner) {
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.font = '700 84px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.fillText(snap.winner, W / 2, 250);
      markerEllipse(g, W / 2, 222, Math.min(330, g.measureText(snap.winner).width / 2 + 46), 62, AMBER);
      g.fillStyle = RED;
      g.font = '600 40px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.fillText(`${snap.winnerScore} pts — see HR for your mug`, W / 2, 330);
    }
    g.fillStyle = INK_SOFT;
    g.font = '600 24px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'left';
    g.fillText('back to the lobby in a moment…', 64, 464);
  } else {
    // countdown + playing: live standings
    header(`STANDINGS — ${(MODES[snap.modeId]?.name || '').toUpperCase()}`);
    if (snap.clock) {
      g.fillStyle = RED;
      g.font = '700 52px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.textAlign = 'right';
      g.save();
      g.rotate(0.01);
      g.fillText(snap.clock, W - 44, 76);
      g.restore();
    }
    g.font = '600 36px "Barlow Condensed", "Arial Narrow", sans-serif';
    snap.rows.forEach((r, i) => {
      const y = 152 + i * 47;
      g.textAlign = 'left';
      g.fillStyle = INK_SOFT;
      g.fillText(`${i + 1}.`, 56, y);
      // magnet dot in the player's paint
      g.fillStyle = r.paint;
      g.beginPath();
      g.arc(112, y - 11, 10, 0, 7);
      g.fill();
      g.strokeStyle = 'rgba(43,47,51,0.35)';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = r.bot ? INK_SOFT : INK;
      g.fillText(r.name, 138, y);
      if (r.me) {
        const nw = g.measureText(r.name).width;
        g.strokeStyle = AMBER;
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(136, y + 10);
        g.lineTo(142 + nw, y + 8);
        g.stroke();
      }
      g.textAlign = 'right';
      g.fillStyle = r.bot ? INK_SOFT : INK;
      g.fillText(String(r.score), W - 60, y);
    });
  }
  // fine print
  g.fillStyle = 'rgba(120, 127, 136, 0.75)';
  g.font = '600 17px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'right';
  g.fillText('DO NOT ERASE — FACILITIES', W - 40, 466);
}

function snapshot() {
  const st = useStore.getState();
  const votes = {};
  for (const v of Object.values(st.votes || {})) votes[v] = (votes[v] || 0) + 1;
  const rows = Object.values(st.players || {})
    .map((p) => ({ name: p.name, bot: !!p.bot, paint: p.paint || '#9aa7c0', me: p.id === st.myId, score: Math.round(st.scores?.[p.id] || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
  const left = st.phase === 'playing' ? Math.max(0, Math.ceil((st.endsAt - Date.now()) / 1000)) : 0;
  const clock = st.phase === 'playing' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
  const winner = st.podium?.[0]?.name || null;
  return {
    phase: st.phase,
    modeId: st.modeId,
    votes,
    rows,
    clock,
    winner,
    winnerScore: st.podium?.[0]?.score ?? 0,
    hash: [
      st.phase, st.modeId, clock, winner,
      Object.entries(votes).map(([k, n]) => `${k}${n}`).join(''),
      rows.map((r) => `${r.name}${r.score}`).join(''),
    ].join('|'),
  };
}

function Board({ position, rotationY, material }) {
  return (
    <group position={position} rotation-y={rotationY}>
      {/* the board */}
      <mesh material={material}>
        <planeGeometry args={[2.6 * M, 1.62 * M]} />
      </mesh>
      {/* aluminum frame */}
      {[
        [0, 0.84, 2.72, 0.06],
        [0, -0.84, 2.72, 0.06],
        [-1.33, 0, 0.06, 1.62],
        [1.33, 0, 0.06, 1.62],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x * M, y * M, 0.01]}>
          <boxGeometry args={[w * M, h * M, 0.03 * M]} />
          <meshStandardMaterial color="#aab2c0" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {/* marker tray + markers */}
      <mesh position={[0, -0.9 * M, 0.05 * M]}>
        <boxGeometry args={[1.1 * M, 0.03 * M, 0.11 * M]} />
        <meshStandardMaterial color="#8f97a6" metalness={0.6} roughness={0.4} />
      </mesh>
      {[[-0.25, RED], [0.1, BLUE]].map(([x, c]) => (
        <mesh key={c} position={[x * M, -0.87 * M, 0.05 * M]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.017 * M, 0.017 * M, 0.14 * M, 8]} />
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}
      {/* sticky note, slightly askew */}
      <mesh position={[1.16 * M, -0.66 * M, 0.012]} rotation-z={-0.1}>
        <planeGeometry args={[0.16 * M, 0.16 * M]} />
        <meshStandardMaterial color="#ffe27a" roughness={0.9} />
      </mesh>
    </group>
  );
}

export default function OfficeBoard() {
  const lastHash = useRef('');
  const acc = useRef(1);
  const { texture, material, canvas } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    // emissiveMap keeps the board readable during lights-out events
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: texture,
      emissiveIntensity: 0.3,
      roughness: 0.85,
    });
    return { texture, material, canvas };
  }, []);

  useFrame((_, delta) => {
    acc.current += delta;
    if (acc.current < 0.4) return;
    acc.current = 0;
    const snap = snapshot();
    if (snap.hash === lastHash.current) return;
    lastHash.current = snap.hash;
    drawBoard(canvas.getContext('2d'), snap);
    texture.needsUpdate = true;
  });

  return (
    <>
      {/* meeting room, east wall beside the TV, facing into the room */}
      <Board position={[20.86 * M, 1.5 * M, 3.5 * M]} rotationY={-Math.PI / 2} material={material} />
      {/* reception, south wall above the big desk, greets the spawn area */}
      <Board position={[-17.5 * M, 1.95 * M, -11.87 * M]} rotationY={0} material={material} />
    </>
  );
}
