// signaling-server.js
// Deploy this to Render as a Node.js Web Service.
// Start command: node signaling-server.js
// Make sure package.json has: "dependencies": { "ws": "^8.16.0" }

import { WebSocketServer, WebSocket } from 'ws';
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// roomId -> Set<ws>
const rooms = new Map();

// Rooms auto-expire after 10 minutes of inactivity
const ROOM_TTL_MS = 10 * 60 * 1000;
const roomTimers = new Map();

function resetRoomTimer(roomId) {
  if (roomTimers.has(roomId)) clearTimeout(roomTimers.get(roomId));
  const timer = setTimeout(() => {
    const room = rooms.get(roomId);
    if (room) {
      room.forEach(client => client.close());
      rooms.delete(roomId);
    }
    roomTimers.delete(roomId);
  }, ROOM_TTL_MS);
  roomTimers.set(roomId, timer);
}

wss.on('connection', (ws) => {
  ws.roomId = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return; // ignore malformed messages
    }

    // --- JOIN A ROOM ---
    if (msg.type === 'join') {
      const { roomId } = msg;
      if (!roomId) return;

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);

      if (room.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' })); // matched to useWebRTC.ts expectation
        return;
      }

      room.add(ws);
      ws.roomId = roomId;
      resetRoomTimer(roomId);

      ws.send(JSON.stringify({ type: 'joined', roomId, peerCount: room.size }));

      // Once 2 peers are present, tell BOTH it's time to start the WebRTC handshake
      if (room.size === 2) {
        room.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'ready' }));
          }
        });
      }
      return;
    }

    // --- RELAY SIGNALING MESSAGES TO THE OTHER PEER ONLY ---
    if (['offer', 'answer', 'ice-candidate'].includes(msg.type)) {
      const room = rooms.get(ws.roomId);
      if (!room) return;
      resetRoomTimer(ws.roomId);
      room.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      });
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms.has(ws.roomId)) {
      const room = rooms.get(ws.roomId);
      room.delete(ws);
      room.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'peer-disconnected' })); // matched to useWebRTC.ts expectation
        }
      });
      if (room.size === 0) {
        rooms.delete(ws.roomId);
        if (roomTimers.has(ws.roomId)) {
          clearTimeout(roomTimers.get(ws.roomId));
          roomTimers.delete(ws.roomId);
        }
      }
    }
  });
});

// Keep connections alive through Render's proxy (prevents silent drops)
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

console.log(`Signaling server running on port ${PORT}`);
