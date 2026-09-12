import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import http from "http";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });



  server.on("upgrade", (request, socket, head) => {
    try {
      console.log("Upgrade request received:", request.url);
      const host = request.headers.host || 'localhost';
      const pathname = request.url ? new URL(request.url, `http://${host}`).pathname : '';
      if (pathname === "/signaling" || pathname === "/signaling/") {
        console.log("Accepting websocket upgrade for /signaling");
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        console.log("Ignoring upgrade for path:", pathname);
        socket.destroy();
      }
    } catch (err) {
      console.error("Error in upgrade handler:", err);
    }
  });

  interface Room {
    id: string;
    peers: Set<WebSocket>;
    lastActivity: number;
  }

  const rooms = new Map<string, Room>();

  // Chat and call signalling travel over the peer-to-peer data channel, so a
  // healthy room can sit silent on the socket for a long time. Keep the window
  // generous and refresh it on pong (see below) so live peers hold it open.
  const ROOM_TTL_MS = 30 * 60 * 1000;
  const HEARTBEAT_MS = 25000;
  const MAX_MISSED_PONGS = 2;

  // Cleanup inactive rooms every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (now - room.lastActivity > ROOM_TTL_MS) {
        // close all sockets
        for (const peer of room.peers) {
          peer.close();
        }
        rooms.delete(roomId);
        console.log(`Cleaned up inactive room: ${roomId}`);
      }
    }
  }, 60 * 1000);

  wss.on("connection", (ws) => {
    let currentRoomId: string | null = null;

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        const { type, roomId, payload, role } = data;

        if (type === "join") {
          currentRoomId = roomId;
          let room = rooms.get(roomId);
          if (!room) {
            room = { id: roomId, peers: new Set(), lastActivity: Date.now() };
            rooms.set(roomId, room);
          }

          if (room.peers.size >= 2 && !room.peers.has(ws)) {
            let kicked = false;
            for (const peer of room.peers) {
              if ((peer as any).role === role) {
                peer.terminate();
                room.peers.delete(peer);
                kicked = true;
                break;
              }
            }
            if (!kicked) {
              ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
              return;
            }
          }

          (ws as any).role = role;

          room.peers.add(ws);
          room.lastActivity = Date.now();
          console.log(`Peer joined room: ${roomId}. Total peers: ${room.peers.size}`);

          if (room.peers.size === 2) {
            // Notify both peers they are ready, assign initiator role to the first peer in the set
            const peersArray = Array.from(room.peers);
            peersArray[0].send(JSON.stringify({ type: "ready", roomId, isInitiator: true }));
            peersArray[1].send(JSON.stringify({ type: "ready", roomId, isInitiator: false }));
          }
        } else if (
          type === "offer" || 
          type === "answer" || 
          type === "ice-candidate" ||
          type === "chat" ||
          type === "typing" ||
          type === "call-signal" ||
          type === "name_exchange"
        ) {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (room) {
            room.lastActivity = Date.now();
            console.log(`Relaying ${type} from ${role} in room ${currentRoomId} to ${room.peers.size} peers`);
            // Relay to other peer
            for (const peer of room.peers) {
              if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                console.log(`Sending ${type} to peer`);
                peer.send(JSON.stringify({ type, payload, roomId }));
              } else {
                console.log(`Not sending ${type}: peer===ws? ${peer===ws}, readyState: ${peer.readyState}`);
              }
            }
          }
        } else if (type === "leave") {
          handleDisconnect();
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });

    const handleDisconnect = () => {
      if (currentRoomId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.peers.delete(ws);
          room.lastActivity = Date.now();
          console.log(`Peer left room: ${currentRoomId}. Remaining peers: ${room.peers.size}`);
          
          for (const peer of room.peers) {
            if (peer.readyState === WebSocket.OPEN) {
              peer.send(JSON.stringify({ type: "peer-disconnected", roomId: currentRoomId }));
            }
          }

          if (room.peers.size === 0) {
            rooms.delete(currentRoomId);
            console.log(`Deleted empty room: ${currentRoomId}`);
          }
        }
        currentRoomId = null;
      }
    };

    ws.on("close", handleDisconnect);
    ws.on("error", handleDisconnect);

    // Browsers answer pings automatically, but a backgrounded tab is frozen and
    // cannot. Count misses instead of dropping on the first one, and treat a
    // pong as room activity so a quiet room is not reaped while peers are live.
    (ws as any).missedPongs = 0;
    ws.on("pong", () => {
      (ws as any).missedPongs = 0;
      if (currentRoomId) {
        const room = rooms.get(currentRoomId);
        if (room) room.lastActivity = Date.now();
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if ((ws.missedPongs ?? 0) >= MAX_MISSED_PONGS) return ws.terminate();
      ws.missedPongs = (ws.missedPongs ?? 0) + 1;
      try { ws.ping(); } catch { /* socket already gone */ }
    });
  }, HEARTBEAT_MS);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
