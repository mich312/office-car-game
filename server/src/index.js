// Tiny RC Mayhem — authoritative game server.
// Serves the built client (client/dist) over HTTP and runs the ws game room.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT } from '@rc/shared';
import { Room } from './room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../client/dist');
const PORT = Number(process.env.PORT || DEFAULT_PORT);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Tiny RC Mayhem server running. Build the client (npm run build) or use the Vite dev server.');
    return;
  }
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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
const room = new Room();

wss.on('connection', (ws) => room.addConnection(ws));

server.listen(PORT, () => {
  console.log(`🏎️  Tiny RC Mayhem server listening on http://localhost:${PORT} (ws at /ws)`);
});
