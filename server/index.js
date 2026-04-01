import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import sirv from 'sirv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameRoom } from './GameRoom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Serve client/ and shared/ as static files
const serveClient = sirv(join(root, 'client'), { dev: true });
const serveShared = sirv(join(root, 'shared'), { dev: true });

const PORT = process.env.PORT || 8080;

const server = createServer((req, res) => {
  // Route /shared/* to the shared directory
  if (req.url.startsWith('/shared/')) {
    req.url = req.url.slice(7); // strip /shared prefix
    serveShared(req, res, () => {
      res.writeHead(404);
      res.end('Not found');
    });
    return;
  }
  // Everything else from client/
  serveClient(req, res, () => {
    res.writeHead(404);
    res.end('Not found');
  });
});

// --- WebSocket server ---
const wss = new WebSocketServer({ noServer: true });

// Room management
const rooms = new Map(); // code -> GameRoom

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

wss.on('connection', (ws) => {
  ws._room = null;
  ws._playerId = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create': {
        const code = generateRoomCode();
        const room = new GameRoom(code, () => rooms.delete(code));
        rooms.set(code, room);
        room.addPlayer(ws, msg.playerName || 'Player');
        break;
      }

      case 'join': {
        const room = rooms.get(msg.roomCode);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        room.addPlayer(ws, msg.playerName || 'Player');
        break;
      }

      case 'ready': {
        if (ws._room) ws._room.onReady(ws);
        break;
      }

      case 'add_ai': {
        if (ws._room && ws._playerId === ws._room.hostId) ws._room.addAI();
        break;
      }

      case 'remove_ai': {
        if (ws._room && ws._playerId === ws._room.hostId) ws._room.removeAI();
        break;
      }

      case 'turn': {
        if (ws._room) ws._room.onTurn(ws, msg.dir, msg.tick);
        break;
      }

      case 'speed': {
        if (ws._room) ws._room.onSpeed(ws, msg.speed, msg.tick);
        break;
      }

      case 'leave': {
        if (ws._room) ws._room.removePlayer(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws._room) ws._room.removePlayer(ws);
  });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
