// Tiny RC Mayhem — authoritative game server.
// Serves the built client (client/dist) over HTTP and runs the ws game rooms.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, MSG } from '@rc/shared';
import { Room } from './room.js';
import { RoomManager } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../client/dist');
const PORT = Number(process.env.PORT || DEFAULT_PORT);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  // A malformed escape ("/%") makes decodeURIComponent throw. Unguarded, that
  // throw escapes the request handler and takes the process down — and with it
  // every match in progress, since there is one Room per process.
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  // Validated first, so a bad URL is a 400 whether or not the client is built.
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Tiny RC Mayhem server running. Build the client (npm run build) or use the Vite dev server.');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(DIST, path.normalize(urlPath));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA fallback
    const index = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': 'text/html' });
    fs.createReadStream(index).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new RoomManager((code, isPrivate) => new Room(code, isPrivate));
setInterval(() => rooms.sweep(), 5000);

wss.on('connection', (ws, req) => {
  let requested = null;
  try { requested = new URL(req.url, 'http://x').searchParams.get('room'); } catch { /* no room: quick play */ }
  const r = rooms.resolve(requested);
  if (r.error) {
    ws.send(JSON.stringify({ t: MSG.ERROR, reason: r.error, fatal: true }));
    ws.close();
    return;
  }
  r.room.addConnection(ws);
});

// Last resort. Every room lives in this one process, so an uncaught throw
// anywhere would end every match in every office; we'd rather log it and
// keep ticking than exit cleanly. Anything that lands here is a bug worth fixing at the source.
process.on('uncaughtException', (err) => console.error('uncaught', err));
process.on('unhandledRejection', (err) => console.error('unhandled rejection', err));

server.listen(PORT, () => {
  console.log(`🏎️  Tiny RC Mayhem server listening on http://localhost:${PORT} (ws at /ws)`);
});
