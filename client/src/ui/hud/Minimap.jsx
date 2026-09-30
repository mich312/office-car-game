// --------------------------------------------------------------- minimap
// North-up floor plan on a canvas, redrawn every frame: rooms, walls, the
// mode's markers, every car, and you as an arrow with a view cone.
import { useEffect, useRef } from 'react';
import { MODES, raceLaps, raceCheckpoints } from '@rc/shared';
import { currentMap } from '../../game/activeMap.js';
import { useStore } from '../../store.js';
import { net } from '../../net.js';
import { telemetry } from '../../game/LocalCar.jsx';
import './minimap.css';

export default function Minimap() {
  const canvasRef = useRef();
  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv.getContext('2d');
    const W = 210, H = 140;
    let sx, sz, px, pz;
    let run = true;
    function draw() {
      if (!run) return;
      // fit the map's floor plan, centred (maps differ in shape)
      const map = currentMap();
      const B = map.MAP_BOUNDS;
      const sc = Math.min(W / (B.maxX - B.minX), H / (B.maxZ - B.minZ));
      const ox = (W - (B.maxX - B.minX) * sc) / 2, oz = (H - (B.maxZ - B.minZ) * sc) / 2;
      sx = sz = sc;
      px = (x) => ox + (x - B.minX) * sc;
      pz = (z) => H - oz - (z - B.minZ) * sc;
      const t = performance.now() / 1000;
      const pulse = 0.55 + 0.45 * Math.sin(t * 5);
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(15, 19, 31, 0.88)';
      g.fillRect(0, 0, W, H);
      // rooms (Last Car Standing tints closed red / closing amber)
      const st0 = useStore.getState();
      for (const r of map.ROOMS) {
        const locked = st0.modeId === 'last_standing' && st0.lcs?.locked?.includes(r.id);
        const closing = st0.modeId === 'last_standing' && st0.lcs?.warn?.room === r.id;
        const rx = px(r.x - r.w / 2), rz = pz(r.z + r.d / 2), rw = r.w * sx, rd = r.d * sz;
        g.fillStyle = locked ? 'rgba(255, 92, 92, 0.32)'
          : closing ? 'rgba(255, 226, 122, 0.30)'
            : r.outdoor ? 'rgba(35, 46, 66, 0.85)' : 'rgba(28, 35, 52, 0.85)';
        g.fillRect(rx, rz, rw, rd);
        g.strokeStyle = 'rgba(72, 85, 116, 0.8)';
        g.lineWidth = 1;
        g.strokeRect(rx + 0.5, rz + 0.5, rw - 1, rd - 1);
      }
      // walls as hairlines
      g.fillStyle = 'rgba(154, 167, 192, 0.4)';
      for (const w of map.WALLS) {
        if (w.low) continue;
        g.fillRect(px(w.x - w.w / 2), pz(w.z + w.d / 2), Math.max(1, w.w * sx), Math.max(1, w.d * sz));
      }
      const st = useStore.getState();
      // mode markers — objectives pulse gently, pickups stay quiet
      if (st.modeId === 'coffee_run') {
        g.fillStyle = 'rgba(201, 139, 74, 0.55)';
        for (const b of net.beans || []) { g.beginPath(); g.arc(px(b[1]), pz(b[2]), 1.6, 0, 7); g.fill(); }
        // the machine: an objective like any other (on the cellar it's out
        // of sight behind a wall); brighter while you have beans to deliver
        const cm = map.COFFEE_MACHINE;
        const loaded = st.myBeans > 0;
        g.strokeStyle = `rgba(63, 255, 170, ${loaded ? 0.55 + 0.45 * pulse : 0.35})`;
        g.lineWidth = loaded ? 2 : 1.5;
        g.beginPath(); g.arc(px(cm.deliverX), pz(cm.deliverZ), Math.max(3, cm.radius * 2 * sx), 0, 7); g.stroke();
      }
      if (st.modeId === 'battery' && net.battery) {
        g.fillStyle = `rgba(74, 222, 128, ${0.5 + 0.5 * pulse})`;
        g.fillRect(px(net.battery.x) - 3, pz(net.battery.z) - 3, 6, 6);
      }
      if (st.modeId === 'soccer') {
        // the goals, in the colour of the team defending them
        for (const gl of map.SOCCER.goals) {
          g.fillStyle = gl.team ? '#4da3ff' : '#ff8a3d';
          g.fillRect(px(gl.x) - 1.5, pz(gl.z + gl.width / 2), 3, Math.max(3, gl.width * sz));
        }
      }
      if (st.modeId === 'soccer' && net.ball) {
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(px(net.ball.p[0]), pz(net.ball.p[2]), 3, 0, 7); g.fill();
      }
      if (st.modeId === 'desk_dash' && !(st.raceProgress[st.myId]?.[0] >= raceLaps(map, MODES.desk_dash.laps))) {
        const prog = st.raceProgress[st.myId];
        const cps = raceCheckpoints(st.variant, map);
        const cp = cps[(prog?.[1] ?? 0) % cps.length];
        g.strokeStyle = `rgba(92, 200, 255, ${0.5 + 0.5 * pulse})`;
        g.lineWidth = 2;
        g.beginPath(); g.arc(px(cp.x), pz(cp.z), 4.5 + pulse * 1.5, 0, 7); g.stroke();
      }
      if (net.robot) {
        g.fillStyle = '#ff5c5c';
        g.beginPath(); g.arc(px(net.robot.x), pz(net.robot.z), 3.5, 0, 7); g.fill();
      }
      // koth/sumo zone ring
      if (net.zone) {
        g.strokeStyle = st.modeId === 'sumo' ? 'rgba(255, 92, 92, 0.9)' : `rgba(255, 180, 84, ${0.55 + 0.45 * pulse})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(px(net.zone.x), pz(net.zone.z), net.zone.r * sx, net.zone.r * sz, 0, 0, 7);
        g.stroke();
        // the standup's next spot, in its last five seconds
        const nx = net.zone.next;
        if (nx && net.zone.until && net.zone.until - net.clockOffset - performance.now() < 5000) {
          g.setLineDash([3, 3]);
          g.strokeStyle = `rgba(255, 180, 84, ${0.35 + 0.5 * pulse})`;
          g.beginPath();
          g.ellipse(px(nx.x), pz(nx.z), net.zone.r * sx, net.zone.r * sz, 0, 0, 7);
          g.stroke();
          g.setLineDash([]);
        }
      }
      // whoever is It glows amber
      if (net.it) {
        const s = net.it === st.myId
          ? { p: [telemetry.x, 0, telemetry.z] }
          : (() => { const buf = net.remotes.get(net.it); return buf?.[buf.length - 1]; })();
        if (s) {
          g.fillStyle = `rgba(255, 180, 84, ${0.6 + 0.4 * pulse})`;
          g.beginPath(); g.arc(px(s.p[0]), pz(s.p[2]), 4.5, 0, 7); g.fill();
        }
      }
      // remote players in their paint colors (bots dimmed)
      for (const [id] of net.remotes) {
        const buf = net.remotes.get(id);
        const s = buf?.[buf.length - 1];
        if (!s) continue;
        if (((s.f || 0) & 128) && st.modeId === 'last_standing') continue; // ghosts are off the map
        const p = st.players[id];
        g.globalAlpha = p?.bot ? 0.55 : 1;
        g.fillStyle = st.modeId === 'soccer' ? (p?.team ? '#4da3ff' : '#ff8a3d') : p?.paint || '#9aa7c0';
        g.beginPath(); g.arc(px(s.p[0]), pz(s.p[2]), 2.6, 0, 7); g.fill();
        g.globalAlpha = 1;
      }
      // me: amber arrow + view cone
      g.save();
      g.translate(px(telemetry.x), pz(telemetry.z));
      g.rotate(-telemetry.heading);
      g.fillStyle = 'rgba(255, 180, 84, 0.14)';
      g.beginPath();
      g.moveTo(0, 0); g.arc(0, 0, 20, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
      g.fillStyle = '#ffb454';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
      g.restore();
      requestAnimationFrame(draw);
    }
    draw();
    return () => { run = false; };
  }, []);
  return <canvas ref={canvasRef} className="minimap" width={210} height={140} />;
}
