// signaling-server.js
// Deploy this to Render as a Node.js Web Service.
// Start command: node signaling-server.js
// Make sure package.json has: "dependencies": { "ws": "^8.16.0" }

import { WebSocketServer, WebSocket } from 'ws';
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// roomId -> { peers: Set<ws>, lastActivity: number }
const rooms = new Map();

// Rooms auto-expire after 10 minutes of inactivity
const ROOM_TTL_MS = 10 * 60 * 1000;

// Cleanup inactive rooms every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      room.peers.forEach(client => client.close());
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  }
}, 60 * 1000);

wss.on('connection', (ws) => {
  ws.roomId = null;
  ws.role = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return; // ignore malformed messages
    }

    const { type, roomId, payload, role } = msg;

    // --- JOIN A ROOM ---
    if (type === 'join') {
      if (!roomId) return;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, { peers: new Set(), lastActivity: Date.now() });
      }
      const room = rooms.get(roomId);

      // Handle reconnection: if room is full, kick existing peer with same role
      if (room.peers.size >= 2 && !room.peers.has(ws)) {
        let kicked = false;
        for (const peer of room.peers) {
          if (peer.role === role) {
            peer.terminate();
            room.peers.delete(peer);
            kicked = true;
            console.log(`Kicked stale ${role} from room ${roomId}`);
            break;
          }
        }
        if (!kicked) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }
      }

      ws.role = role;
      ws.roomId = roomId;
      room.peers.add(ws);
      room.lastActivity = Date.now();

      console.log(`Peer (${role}) joined room: ${roomId}. Total peers: ${room.peers.size}`);

      // Once 2 peers are present, tell them to start the WebRTC handshake
      // First peer becomes the initiator (creates the offer)
      if (room.peers.size === 2) {
        const peersArray = Array.from(room.peers);
        peersArray[0].send(JSON.stringify({ type: 'ready', roomId, isInitiator: true }));
        peersArray[1].send(JSON.stringify({ type: 'ready', roomId, isInitiator: false }));
        console.log(`Room ${roomId} is ready. Sent initiator signals.`);
      }
      return;
    }

    // --- RELAY ALL SIGNALING AND APPLICATION MESSAGES ---
    if (
      type === 'offer' ||
      type === 'answer' ||
      type === 'ice-candidate' ||
      type === 'chat' ||
      type === 'typing' ||
      type === 'call-signal' ||
      type === 'name_exchange'
    ) {
      if (!ws.roomId) return;
      const room = rooms.get(ws.roomId);
      if (!room) return;
      room.lastActivity = Date.now();

      // Relay to the OTHER peer only
      for (const peer of room.peers) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type, payload, roomId: ws.roomId }));
        }
      }
      return;
    }

    // --- LEAVE ---
    if (type === 'leave') {
      handleDisconnect(ws);
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => handleDisconnect(ws));
});

function handleDisconnect(ws) {
  if (ws.roomId && rooms.has(ws.roomId)) {
    const room = rooms.get(ws.roomId);
    room.peers.delete(ws);
    room.lastActivity = Date.now();

    console.log(`Peer (${ws.role}) left room: ${ws.roomId}. Remaining peers: ${room.peers.size}`);

    // Notify remaining peer
    room.peers.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'peer-disconnected', roomId: ws.roomId }));
      }
    });

    if (room.peers.size === 0) {
      rooms.delete(ws.roomId);
      console.log(`Deleted empty room: ${ws.roomId}`);
    }
    ws.roomId = null;
  }
}

// Keep connections alive through Render's proxy (prevents silent drops)
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000); // 25s interval - well within Render's 30s timeout

wss.on('close', () => clearInterval(heartbeat));

console.log(`Signaling server running on port ${PORT}`);
