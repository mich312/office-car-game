// The office whiteboard: a live in-world display that mirrors the match
// state — the mode vote during the lobby ("NEXT MEETING?", with marker tally
// strokes), live standings while playing, and the winner on the podium.
// One canvas texture drives two boards: a big one in the meeting room and a
// twin on the reception wall by the spawns. Pure diegetic flavor — the Tab
// scoreboard overlay stays for mid-race glances.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { M, MODES, MODE_IDS } from '@rc/shared';
import { useStore } from '../store.js';

const W = 1024, H = 640;
const INK = '#23272c';        // black marker
const INK_SOFT = '#7c848e';   // bots / fine print
const BLUE = '#23509e';       // header marker
const RED = '#b93a2b';        // tallies, clock
const AMBER = '#dd9420';      // circles, winner, "you"
const MEDALS = ['#d5a021', '#8f9aa8', '#b3763d'];
const MAGNETS = ['#e05a4d', '#3a7bd0', '#3fbf74', '#f0c33c'];

// hand-drawn tally strokes: |||| with the fifth slashed across
function tallies(g, x, y, n) {
  g.strokeStyle = RED;
  g.lineWidth = 6;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const group = Math.floor(i / 5);
    const inGroup = i % 5;
    const gx = x + group * 62;
    if (inGroup === 4) {
      g.beginPath();
      g.moveTo(gx - 7, y - 5);
      g.lineTo(gx + 43, y - 29);
      g.stroke();
    } else {
      const jx = gx + inGroup * 12 + (i % 2) * 2;
      g.beginPath();
      g.moveTo(jx, y - 34 + (i % 3));
      g.lineTo(jx + 3, y);
      g.stroke();
    }
  }
}

function markerEllipse(g, cx, cy, rx, ry, color, lw = 5) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, -0.04, 0.3, Math.PI * 2 + 0.55);
  g.stroke();
}

// marker text with a faint double-pass for ink weight
function marker(g, text, x, y, font, color, align = 'left') {
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  g.globalAlpha = 0.4;
  g.fillText(text, x + 1.5, y + 1);
  g.globalAlpha = 1;
  g.fillText(text, x, y);
}

function magnet(g, x, y, color, r = 15) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
  g.strokeStyle = 'rgba(20, 24, 30, 0.35)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  g.beginPath();
  g.arc(x - r * 0.32, y - r * 0.35, r * 0.28, 0, 7);
  g.fill();
}

function paper(g) {
  // warm paper white with a soft top-lit gradient — pure white blows out
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f1f2ec');
  bg.addColorStop(1, '#e2e4dc');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // inner shadow from the frame (depth cue)
  const top = g.createLinearGradient(0, 0, 0, 46);
  top.addColorStop(0, 'rgba(18, 22, 30, 0.22)');
  top.addColorStop(1, 'rgba(18, 22, 30, 0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, 46);
  for (const [x0, x1] of [[0, 26], [W, W - 26]]) {
    const side = g.createLinearGradient(x0, 0, x1, 0);
    side.addColorStop(0, 'rgba(18, 22, 30, 0.14)');
    side.addColorStop(1, 'rgba(18, 22, 30, 0)');
    g.fillStyle = side;
    g.fillRect(Math.min(x0, x1), 0, 26, H);
  }
  const bot = g.createLinearGradient(0, H, 0, H - 26);
  bot.addColorStop(0, 'rgba(18, 22, 30, 0.16)');
  bot.addColorStop(1, 'rgba(18, 22, 30, 0)');
  g.fillStyle = bot;
  g.fillRect(0, H - 26, W, 26);
  // magnets parked bottom-right, out of the content's way
  MAGNETS.forEach((c, i) => magnet(g, W - 64 - i * 44, H - 84, c));
}

function header(g, text) {
  g.save();
  g.rotate(-0.006);
  marker(g, text, 72, 116, '700 76px "Barlow Condensed", "Arial Narrow", sans-serif', BLUE);
  const w = g.measureText(text).width;
  g.strokeStyle = BLUE;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.globalAlpha = 0.7;
  g.beginPath();
  g.moveTo(70, 138);
  g.lineTo(80 + w, 132);
  g.stroke();
  g.globalAlpha = 1;
  g.restore();
}

function finePrint(g, left) {
  if (left) marker(g, left, 76, H - 30, '600 27px "Barlow Condensed", "Arial Narrow", sans-serif', INK_SOFT);
  marker(g, 'DO NOT ERASE — FACILITIES', W - 52, H - 30, '600 24px "Barlow Condensed", "Arial Narrow", sans-serif', 'rgba(124, 132, 142, 0.8)', 'right');
}

function drawBoard(g, snap) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  paper(g);

  if (snap.phase === 'lobby') {
    header(g, 'NEXT MEETING?');
    let leader = null, leaderVotes = 0;
    for (const m of MODE_IDS) if ((snap.votes[m] || 0) > leaderVotes) { leader = m; leaderVotes = snap.votes[m]; }
    const font = '600 42px "Barlow Condensed", "Arial Narrow", sans-serif';
    MODE_IDS.forEach((m, i) => {
      const y = 208 + i * 56;
      // agenda checkbox
      g.strokeStyle = 'rgba(35, 39, 44, 0.55)';
      g.lineWidth = 3.5;
      g.strokeRect(84, y - 30, 30, 30);
      if (m === leader) {
        g.strokeStyle = AMBER;
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(90, y - 14);
        g.lineTo(99, y - 6);
        g.lineTo(114, y - 28);
        g.stroke();
      }
      marker(g, MODES[m].name, 140, y, font, INK);
      tallies(g, 560, y, Math.min(snap.votes[m] || 0, 20));
      if (m === leader) {
        g.font = font;
        markerEllipse(g, 140 + g.measureText(MODES[m].name).width / 2, y - 15, g.measureText(MODES[m].name).width / 2 + 28, 33, AMBER);
      }
    });
    finePrint(g, 'ready up at your desks — bots fill the rest');
  } else if (snap.phase === 'podium') {
    header(g, 'EMPLOYEE OF THE MATCH');
    if (snap.winner) {
      // celebratory marker confetti
      const strokes = [[300, 210, 24, -18, RED], [724, 196, -20, -20, BLUE], [258, 330, -22, 14, AMBER],
        [772, 340, 22, 16, RED], [356, 176, 12, -24, AMBER], [668, 402, 18, 20, BLUE]];
      g.lineWidth = 6;
      g.lineCap = 'round';
      for (const [x, y, dx, dy, c] of strokes) {
        g.strokeStyle = c;
        g.globalAlpha = 0.8;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx, y + dy);
        g.stroke();
      }
      g.globalAlpha = 1;
      marker(g, snap.winner, W / 2, 316, '700 116px "Barlow Condensed", "Arial Narrow", sans-serif', INK, 'center');
      g.font = '700 116px "Barlow Condensed", "Arial Narrow", sans-serif';
      markerEllipse(g, W / 2, 278, Math.min(430, g.measureText(snap.winner).width / 2 + 60), 84, AMBER, 7);
      marker(g, `${snap.winnerScore} pts — see HR for your mug`, W / 2, 420, '600 50px "Barlow Condensed", "Arial Narrow", sans-serif', RED, 'center');
    }
    finePrint(g, 'back to the lobby in a moment…');
  } else {
    // countdown + playing: live standings — big title, mode in red beside it
    header(g, 'STANDINGS');
    g.font = '700 76px "Barlow Condensed", "Arial Narrow", sans-serif';
    const hw = g.measureText('STANDINGS').width;
    marker(g, (MODES[snap.modeId]?.name || '').toUpperCase(), 72 + hw + 30, 114, '600 46px "Barlow Condensed", "Arial Narrow", sans-serif', RED);
    if (snap.clock) {
      g.save();
      g.rotate(0.008);
      marker(g, snap.clock, W - 76, 106, '700 62px "Barlow Condensed", "Arial Narrow", sans-serif', RED, 'right');
      g.strokeStyle = RED;
      g.lineWidth = 4;
      g.strokeRect(W - 226, 52, 172, 70);
      g.restore();
    }
    const font = '600 44px "Barlow Condensed", "Arial Narrow", sans-serif';
    snap.rows.forEach((r, i) => {
      const y = 212 + i * 58;
      // top three get medal circles, the rest plain ranks
      if (i < 3) {
        markerEllipse(g, 96, y - 15, 24, 24, MEDALS[i], 4.5);
        marker(g, String(i + 1), 96, y - 1, '700 38px "Barlow Condensed", "Arial Narrow", sans-serif', MEDALS[i], 'center');
      } else {
        marker(g, `${i + 1}.`, 96, y, '600 38px "Barlow Condensed", "Arial Narrow", sans-serif', INK_SOFT, 'center');
      }
      magnet(g, 158, y - 15, r.paint, 14);
      marker(g, r.name, 196, y, font, r.bot ? INK_SOFT : INK);
      g.font = font;
      const nw = g.measureText(r.name).width;
      if (r.me) {
        g.strokeStyle = AMBER;
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(194, y + 12);
        g.lineTo(202 + nw, y + 9);
        g.stroke();
      }
      // dotted leader line from name to score
      g.strokeStyle = 'rgba(35, 39, 44, 0.28)';
      g.lineWidth = 3;
      g.setLineDash([2, 10]);
      g.beginPath();
      g.moveTo(216 + nw, y - 12);
      g.lineTo(W - 170, y - 12);
      g.stroke();
      g.setLineDash([]);
      marker(g, String(r.score), W - 92, y, font, r.bot ? INK_SOFT : INK, 'right');
    });
    finePrint(g, null);
  }
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
      {/* dark rounded frame, stood off the wall for real depth */}
      <RoundedBox args={[2.82 * M, 1.84 * M, 0.05 * M]} radius={0.018 * M} smoothness={3} position={[0, 0, 0.035 * M]}>
        <meshStandardMaterial color="#232837" metalness={0.15} roughness={0.55} />
      </RoundedBox>
      {/* wall standoffs */}
      {[[-1.2, 0.75], [1.2, 0.75], [-1.2, -0.75], [1.2, -0.75]].map(([x, y]) => (
        <mesh key={`${x}${y}`} position={[x * M, y * M, 0.012 * M]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.02 * M, 0.02 * M, 0.03 * M, 10]} />
          <meshStandardMaterial color="#454f68" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* the board surface */}
      <mesh material={material} position={[0, 0, 0.062 * M]}>
        <planeGeometry args={[2.6 * M, 1.62 * M]} />
      </mesh>
      {/* corner caps on the frame */}
      {[[-1.34, 0.85], [1.34, 0.85], [-1.34, -0.85], [1.34, -0.85]].map(([x, y]) => (
        <mesh key={`${x}${y}`} position={[x * M, y * M, 0.061 * M]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.014 * M, 0.014 * M, 0.006 * M, 10]} />
          <meshStandardMaterial color="#8f97a6" metalness={0.75} roughness={0.3} />
        </mesh>
      ))}
      {/* marker tray: rail, two markers, eraser */}
      <mesh position={[0, -0.99 * M, 0.085 * M]}>
        <boxGeometry args={[1.3 * M, 0.035 * M, 0.13 * M]} />
        <meshStandardMaterial color="#2e3548" metalness={0.4} roughness={0.45} />
      </mesh>
      {[[-0.34, '#b93a2b'], [0.02, '#23509e']].map(([x, c]) => (
        <mesh key={c} position={[x * M, -0.955 * M, 0.085 * M]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.018 * M, 0.018 * M, 0.15 * M, 10]} />
          <meshStandardMaterial color={c} roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0.42 * M, -0.945 * M, 0.085 * M]}>
        <boxGeometry args={[0.14 * M, 0.05 * M, 0.07 * M]} />
        <meshStandardMaterial color="#3b4256" roughness={0.7} />
      </mesh>
      {/* sticky note, slightly askew */}
      <mesh position={[1.16 * M, -0.62 * M, 0.064 * M]} rotation-z={-0.1}>
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
    texture.anisotropy = 8;
    // gentle emissive keeps the board readable during lights-out events
    // without washing out the paper in daylight
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: texture,
      emissiveIntensity: 0.12,
      roughness: 0.8,
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
