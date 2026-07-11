import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import http from "http";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Proxy endpoint for IP Geolocation using free API
  app.get('/api/location', async (req, res) => {
    try {
      // Get client's true IP in Render
      let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      if (Array.isArray(ip)) ip = ip[0];
      if (ip.includes(',')) ip = ip.split(',')[0];
      
      // If testing locally (localhost), use empty string so the API detects public IP
      if (ip === '::1' || ip === '127.0.0.1' || ip.includes('localhost')) {
        ip = ''; 
      }

      const resp = await fetch(`https://get.geojs.io/v1/ip/geo.json?ip=${ip}`);
      const data = await resp.json();
      
      return res.json({ 
        city: data.city || 'Unknown', 
        region: data.country || 'Location' 
      });
    } catch (err) {
      console.error('Error fetching location:', err);
      return res.json({ city: 'Unknown', region: 'Location' });
    }
  });

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

  // Cleanup inactive rooms every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (now - room.lastActivity > 10 * 60 * 1000) {
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
        const { type, roomId, payload } = data;

        if (type === "join") {
          currentRoomId = roomId;
          let room = rooms.get(roomId);
          if (!room) {
            room = { id: roomId, peers: new Set(), lastActivity: Date.now() };
            rooms.set(roomId, room);
          }

          if (room.peers.size >= 2 && !room.peers.has(ws)) {
            ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
            return;
          }

          room.peers.add(ws);
          room.lastActivity = Date.now();
          console.log(`Peer joined room: ${roomId}. Total peers: ${room.peers.size}`);

          if (room.peers.size === 2) {
            // Notify both peers they are ready
            for (const peer of room.peers) {
              peer.send(JSON.stringify({ type: "ready", roomId }));
            }
          }
        } else if (type === "offer" || type === "answer" || type === "ice-candidate") {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (room) {
            room.lastActivity = Date.now();
            // Relay to other peer
            for (const peer of room.peers) {
              if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                peer.send(JSON.stringify({ type, payload, roomId }));
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
