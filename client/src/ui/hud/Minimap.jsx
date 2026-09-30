// --------------------------------------------------------------- minimap
// Top-right (SPEC-TOYBOX §4.8): a toy-box window with the floor plan drawn
// north-up on a canvas every frame, the floor's lift code hanging off its
// top edge, and the room you're in as an ink ribbon under it.
//   rooms indigo, yours outlined in sun (sun = YOU) · the race line dashed
//   paper with the flag at the start, the next checkpoint a lime ring ·
//   objectives lime · hazards cherry (sumo / last-meeting rings, locked and
//   closing rooms, the robot, the room an office event is about to hit) ·
//   remote cars as paint dots with an ink ring · you a sun arrow + view cone.
// The backing store follows the element's size × DPR (≤ 2); under lowfx it
// runs at DPR 1 and draws every other frame. Pulses rest under reduced motion.
import { memo, useEffect, useRef } from 'react';
import { MODES, raceLaps, raceCheckpoints } from '@rc/shared';
import { currentMap } from '../../game/activeMap.js';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';
import { ToyIcon, FLOOR_CODE } from '../Icon.jsx';
import './minimap.css';

const C = {
  bg: '#110b27', room: '#2d2566', roomLine: '#6a60c4', outdoor: '#231c50', here: '#40388a',
  wall: 'rgba(255, 248, 234, 0.35)', ink: '#140e2c', paper: '#fff8ea',
  sun: '#ffd23f', lime: '#7de23a', cherry: '#ff3b4a', cherryHi: '#ff7a84',
  orange: '#ff8a3d', blue: '#4da3ff', fallback: '#9aa7c0',
};
const RACKS = new Set(['rack', 'cellar_rack', 'garage_serverrack']);

const reducedMotion = () => document.documentElement.classList.contains('reduce-motion')
  || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const lowfx = () => document.documentElement.classList.contains('lowfx');

// where an office event lands (null: the whole floor)
const eventRooms = new WeakMap();
export function eventRoom(map, id) {
  let m = eventRooms.get(map);
  if (!m) { m = {}; eventRooms.set(map, m); }
  if (!(id in m)) {
    let r = null;
    if (id === 'paper_storm' && map.PRINTER) r = map.roomAt(map.PRINTER.x, map.PRINTER.z);
    if (id === 'server_overload') {
      const rack = map.FURNITURE?.find((f) => RACKS.has(f.type));
      if (rack) r = map.roomAt(rack.x, rack.z);
    }
    m[id] = r;
  }
  return m[id];
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function MinimapCanvas() {
  const canvasRef = useRef();
  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const fit = () => {
      dpr = lowfx() ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      const bw = Math.max(1, Math.round(W * dpr)), bh = Math.max(1, Math.round(H * dpr));
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(cv);
    let raf = 0, frame = 0;

    function draw() {
      raf = requestAnimationFrame(draw);
      frame++;
      if (lowfx() && frame % 2) return;
      if (!W || !H) { fit(); if (!W || !H) return; }
      const map = currentMap();
      const st = useStore.getState();
      const B = map.MAP_BOUNDS;
      const pad = 3;
      const sc = Math.min((W - pad * 2) / (B.maxX - B.minX), (H - pad * 2) / (B.maxZ - B.minZ));
      const ox = (W - (B.maxX - B.minX) * sc) / 2, oz = (H - (B.maxZ - B.minZ) * sc) / 2;
      const px = (x) => ox + (x - B.minX) * sc;
      const pz = (z) => H - oz - (z - B.minZ) * sc; // north-up: +z is up
      const still = reducedMotion();
      const t = performance.now() / 1000;
      const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 5);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = C.bg;
      g.fillRect(0, 0, W, H);
      g.lineJoin = 'round';
      g.lineCap = 'round';

      // ---- rooms (yours outlined in sun; LCS locked / closing in hazard)
      const here = st.spectating ? null : map.roomAt(telemetry.x, telemetry.z);
      const lcs = st.modeId === 'last_standing' ? st.lcs : null;
      for (const r of map.ROOMS) {
        const x = px(r.x - r.w / 2) + 1, y = pz(r.z + r.d / 2) + 1, w = r.w * sc - 2, h = r.d * sc - 2;
        const locked = lcs?.locked?.includes(r.id);
        const closing = lcs?.warn?.room === r.id;
        roundRect(g, x, y, w, h, 3);
        g.setLineDash([]);
        if (r === here) {
          g.fillStyle = C.here; g.fill();
        } else if (locked) {
          g.fillStyle = C.room; g.fill();
          g.fillStyle = 'rgba(255, 59, 74, 0.34)'; g.fill();
          g.strokeStyle = C.cherryHi; g.lineWidth = 1.5; g.stroke();
          continue;
        } else if (closing) {
          g.fillStyle = C.room; g.fill();
          g.fillStyle = 'rgba(255, 59, 74, 0.16)'; g.fill();
          g.setLineDash([3, 2]); g.strokeStyle = C.cherryHi; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
          continue;
        } else {
          g.fillStyle = r.outdoor ? C.outdoor : C.room; g.fill();
          if (r.outdoor) g.setLineDash([3, 3]);
        }
        g.strokeStyle = C.roomLine; g.lineWidth = 1.5; g.stroke();
        g.setLineDash([]);
      }
      // walls as hairlines
      g.fillStyle = C.wall;
      for (const w of map.WALLS) {
        if (w.low) continue;
        g.fillRect(px(w.x - w.w / 2), pz(w.z + w.d / 2), Math.max(1, w.w * sc), Math.max(1, w.d * sc));
      }
      // your room's sun outline goes on top of the walls
      if (here) {
        roundRect(g, px(here.x - here.w / 2) + 1, pz(here.z + here.d / 2) + 1, here.w * sc - 2, here.d * sc - 2, 3);
        g.strokeStyle = C.sun; g.lineWidth = 2.5; g.stroke();
      }

      // ---- Desk Dash: the race line, the flag, the next checkpoint
      if (st.modeId === 'desk_dash') {
        const cps = raceCheckpoints(st.variant, map);
        if (cps.length > 1) {
          g.beginPath();
          cps.forEach((c, i) => (i ? g.lineTo(px(c.x), pz(c.z)) : g.moveTo(px(c.x), pz(c.z))));
          g.closePath();
          g.setLineDash([5, 4]);
          g.strokeStyle = 'rgba(255, 248, 234, 0.6)'; g.lineWidth = 2; g.stroke();
          g.setLineDash([]);
          // chequered flag at the start of the lap (cp 0)
          const f = cps[0];
          const fx = px(f.x), fz = pz(f.z), s = 3;
          g.fillStyle = C.ink; g.fillRect(fx - s - 1, fz - 2 * s - 1, 2 * s + 2, 4 * s + 2);
          for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
            g.fillStyle = (i + j) % 2 ? C.ink : C.paper;
            g.fillRect(fx - s + i * s, fz - 2 * s + j * s, s, s);
          }
        }
        const prog = st.raceProgress[st.myId];
        if (!(prog?.[0] >= raceLaps(map, MODES.desk_dash.laps)) && cps.length) {
          const cp = cps[(prog?.[1] ?? 0) % cps.length];
          g.strokeStyle = C.lime; g.lineWidth = 2.5;
          g.beginPath(); g.arc(px(cp.x), pz(cp.z), 5 + pulse * 1.5, 0, 7); g.stroke();
        }
      }

      // ---- objectives (lime)
      if (st.modeId === 'coffee_run') {
        g.fillStyle = 'rgba(255, 248, 234, 0.55)';
        for (const b of net.beans || []) { g.beginPath(); g.arc(px(b[1]), pz(b[2]), 1.6, 0, 7); g.fill(); }
        const cm = map.COFFEE_MACHINE;
        const x = px(cm.deliverX), z = pz(cm.deliverZ);
        g.setLineDash([3, 2.5]);
        g.strokeStyle = C.lime; g.lineWidth = st.myBeans > 0 ? 2 : 1.5;
        g.beginPath(); g.arc(x, z, Math.max(9, cm.radius * sc) + (st.myBeans > 0 ? pulse * 1.5 : 0), 0, 7); g.stroke();
        g.setLineDash([]);
        roundRect(g, x - 5, z - 5, 10, 10, 2);
        g.fillStyle = C.lime; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
      }
      if (st.modeId === 'battery' && net.battery) {
        roundRect(g, px(net.battery.x) - 3.5, pz(net.battery.z) - 3.5, 7, 7, 1.5);
        g.fillStyle = C.lime; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
      }
      if (st.modeId === 'soccer') {
        for (const gl of map.SOCCER.goals) {
          g.fillStyle = gl.team ? C.blue : C.orange;
          g.fillRect(px(gl.x) - 2, pz(gl.z + gl.width / 2), 4, Math.max(4, gl.width * sc));
        }
        if (net.ball) {
          g.fillStyle = C.paper; g.strokeStyle = C.ink; g.lineWidth = 2;
          g.beginPath(); g.arc(px(net.ball.p[0]), pz(net.ball.p[2]), 3.5, 0, 7); g.fill(); g.stroke();
        }
      }
      if (net.zone) {
        const hazard = st.modeId === 'sumo' || st.modeId === 'last_standing';
        const zx = px(net.zone.x), zz = pz(net.zone.z), zr = Math.max(3, net.zone.r * sc);
        g.strokeStyle = hazard ? C.cherry : C.lime; g.lineWidth = 2;
        g.beginPath(); g.arc(zx, zz, zr, 0, 7); g.stroke();
        // the standup's next spot, in its last five seconds
        const nx = net.zone.next;
        if (nx && net.zone.until && net.zone.until - net.clockOffset - performance.now() < 5000) {
          g.setLineDash([3, 3]);
          g.strokeStyle = C.lime; g.lineWidth = 2;
          g.beginPath(); g.arc(px(nx.x), pz(nx.z), zr, 0, 7); g.stroke();
          g.setLineDash([]);
        }
      }

      // ---- hazards (cherry): the robot, the room an office event hits
      if (net.robot) {
        roundRect(g, px(net.robot.x) - 4.5, pz(net.robot.z) - 4.5, 9, 9, 2);
        g.fillStyle = C.cherry; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = C.ink; g.fillRect(px(net.robot.x) - 1.5, pz(net.robot.z) - 1.5, 3, 3);
      }
      const ev = st.eventWarn || st.event;
      const evRoom = ev ? eventRoom(map, ev.id) : null;
      if (evRoom) {
        const ex = px(evRoom.x), ez = pz(evRoom.z);
        g.beginPath(); g.moveTo(ex, ez - 7); g.lineTo(ex + 7, ez + 5.5); g.lineTo(ex - 7, ez + 5.5); g.closePath();
        g.fillStyle = C.cherry; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = C.paper; g.fillRect(ex - 0.75, ez - 3, 1.5, 4.5); g.fillRect(ex - 0.75, ez + 2.5, 1.5, 1.5);
      }

      // ---- cars: paint dots with an ink ring (soccer: team colours); It gets a paper ring
      for (const [id, buf] of net.remotes) {
        const s = buf?.[buf.length - 1];
        if (!s) continue;
        if (((s.f || 0) & 128) && st.modeId === 'last_standing') continue; // ghosts are off the map
        const p = st.players[id];
        const x = px(s.p[0]), z = pz(s.p[2]);
        if (net.it === id) { g.strokeStyle = C.paper; g.lineWidth = 2; g.beginPath(); g.arc(x, z, 7, 0, 7); g.stroke(); }
        g.fillStyle = st.modeId === 'soccer' ? (p?.team ? C.blue : C.orange) : p?.paint || C.fallback;
        g.strokeStyle = C.ink; g.lineWidth = 2.5;
        g.beginPath(); g.arc(x, z, 3.5, 0, 7); g.stroke(); g.fill();
      }

      // ---- you: sun arrow with an ink outline + a sun view cone
      const mx = px(telemetry.x), mz = pz(telemetry.z);
      if (net.it && net.it === st.myId) { g.strokeStyle = C.paper; g.lineWidth = 2; g.beginPath(); g.arc(mx, mz, 9, 0, 7); g.stroke(); }
      g.save();
      g.translate(mx, mz);
      g.rotate(-telemetry.heading);
      g.fillStyle = 'rgba(255, 210, 63, 0.16)';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 24, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath();
      g.lineWidth = 2.5; g.strokeStyle = C.ink; g.stroke();
      g.fillStyle = C.sun; g.fill();
      g.restore();
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className="tb-map-cv" aria-hidden="true" />;
}

// "01 · Office", "B1 · IT Cellar": the floor as the lift panel names it
export const floorName = (map) => String(map?.name || '').replace(/^The /, '');
export const floorLabel = (map) => `${FLOOR_CODE[map?.id] || '01'} · ${floorName(map)}`;

// the map window + its floor tag (the canvas never re-renders through React)
export const Minimap = memo(function Minimap({ map }) {
  return (
    <div className="tb-map tb-box a-pop" role="img" aria-label={`Floor plan: ${floorName(map)}`}>
      <MinimapCanvas />
      <div className="tb-map-floor">
        <span className="tb-rib is-ink"><span className="tb-lbl">{floorLabel(map)}</span></span>
      </div>
    </div>
  );
});

// the room you're in: re-keyed on change, so it pops
export function RoomTag({ room }) {
  if (!room) return null;
  return (
    <div key={room.id} className="tb-room a-pop" style={{ '--i': 2 }}>
      <span className="tb-rib is-ink"><ToyIcon name="pin" /><span className="tb-disp">{room.name}</span></span>
    </div>
  );
}

export default Minimap;
